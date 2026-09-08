/**
 * unwired — finds code that is written, tested, and never actually reached.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 27 August 2026 I found seven defects in a single day in a 200k-line codebase
 * built almost entirely by AI agents. Six of them shared one shape: a mechanism that
 * was CORRECT, unit-tested, green in CI, and that never ran on a real user.
 *
 *   an EMA smoothing cap      always received `null` at its only production call site
 *   a user's rank             all five call sites passed `true` (male) as a literal
 *   an injury-aggravation rule  read a pain history that nothing ever populated
 *
 * No test suite catches this class of bug, because a unit test calls the function
 * directly. A green suite proves the code is RIGHT. It says nothing about whether the
 * code is REACHED. When agents write the implementation and the test, that distinction
 * stops being academic: both sides of the pair can be internally consistent and
 * collectively disconnected from the product.
 *
 * TWO FAMILIES
 * ------------
 * A. A parameter that receives the SAME literal at EVERY production call site.
 *    The nastiest shape: the function is called, it returns, its test is green, and
 *    the useful branch is dead. This family is where the real defects live.
 *
 * B. An export referenced NOWHERE in production, only by tests. Much noisier: most
 *    cases are unfinished features rather than defects. Wiring one of them up means
 *    shipping a path that has never run, which is often worse than leaving it dead.
 *
 * HOW TO READ THE OUTPUT
 * ----------------------
 * It reports, it does not judge. On my first pass: 49 family-A cases, 3 serious
 * candidates, 2 real defects, 1 non-defect (a "quiet hours" helper used its defaults
 * because no UI ever set them — the default WAS the correct behaviour). Judge every
 * case by hand before touching anything.
 *
 * KNOWN FALSE POSITIVES, and why the text cross-check exists
 * ----------------------------------------------------------
 * Destructured dynamic imports (`import('x').then(({ f }) => f())`) escape symbol
 * resolution, a common lazy-loading pattern. A candidate whose NAME appears in any
 * other production file is therefore dropped. Better to miss a dead one than to send
 * people chasing ghosts: a list that contains false positives stops being read at all.
 */
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

export interface Options {
  /** Path to the tsconfig.json describing the project. */
  tsconfig: string;
  /** Only files whose path contains one of these segments are analysed. */
  scope?: string[];
  /** Files matching this are treated as tests, not production. */
  testPattern?: RegExp;
}

export interface FrozenParam {
  key: string;
  file: string;
  fn: string;
  param: string;
  value: string;
  callSites: number;
  line: number;
}

export interface UnusedExport {
  name: string;
  file: string;
  line: number;
  kind: string;
  testRefs: number;
}

export interface Report {
  frozenParams: FrozenParam[];
  testOnlyExports: UnusedExport[];
  neverReferenced: UnusedExport[];
  filesAnalysed: number;
}

const DEFAULT_SCOPE = ['/src/', '/app/', '/lib/'];
const DEFAULT_TEST = /__tests__|\.test\.|\.spec\.|\/tests\/|\/dev\//;

/** Literal values we consider "frozen". Anything else is a real expression. */
function literal(node: ts.Node): string | null {
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (ts.isIdentifier(node) && node.text === 'undefined') return 'undefined';
  if (ts.isArrayLiteralExpression(node) && node.elements.length === 0) return '[]';
  if (ts.isNumericLiteral(node)) return node.text;
  if (ts.isStringLiteral(node)) return JSON.stringify(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  return null;
}

export function analyse(options: Options): Report {
  const tsconfigPath = path.resolve(options.tsconfig);
  const root = path.dirname(tsconfigPath);
  const scope = options.scope ?? DEFAULT_SCOPE;
  const isTest = (f: string) => (options.testPattern ?? DEFAULT_TEST).test(f);
  const inScope = (f: string) => scope.some((s) => f.includes(s));
  const rel = (f: string) => f.replace(root + path.sep, '');

  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (cfg.error) throw new Error(ts.flattenDiagnosticMessageText(cfg.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();

  const production = program.getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && inScope(sf.fileName) && !isTest(sf.fileName));

  // ---- exports and their reference counts ---------------------------------
  interface Exp { name: string; file: string; line: number; kind: string; refs: number; testRefs: number }
  const exports_ = new Map<ts.Symbol, Exp>();

  for (const sf of production) {
    ts.forEachChild(sf, (node) => {
      const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
      const decls: { name: ts.Node; kind: string }[] = [];
      if (ts.isFunctionDeclaration(node) && node.name) decls.push({ name: node.name, kind: 'function' });
      if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) decls.push({ name: d.name, kind: 'const' });
        }
      }
      for (const d of decls) {
        const sym = checker.getSymbolAtLocation(d.name);
        if (!sym) continue;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        exports_.set(sym, { name: d.name.getText(), file: rel(sf.fileName), line: line + 1, kind: d.kind, refs: 0, testRefs: 0 });
      }
    });
  }

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !inScope(sf.fileName)) continue;
    const test = isTest(sf.fileName);
    ts.forEachChild(sf, function visit(node) {
      if (ts.isIdentifier(node)) {
        let sym = checker.getSymbolAtLocation(node);
        if (sym && (sym.flags & ts.SymbolFlags.Alias)) sym = checker.getAliasedSymbol(sym);
        const e = sym && exports_.get(sym);
        // In-file uses count too: a helper exported for its test but used by its own
        // module is not dead. Without this the detector over-reported massively.
        if (e && sym) {
          const decl = sym.declarations?.[0];
          const isTheDeclaration = !!decl && decl.getSourceFile() === sf
            && node.getStart() >= decl.getStart() && node.getEnd() <= decl.getEnd()
            && node.getStart() === (decl as unknown as { name?: ts.Node }).name?.getStart?.();
          if (!isTheDeclaration) { if (test) e.testRefs++; else e.refs++; }
        }
      }
      ts.forEachChild(node, visit);
    });
  }

  // Text cross-check: catches destructured dynamic imports that symbol resolution misses.
  const prodText = production.map((sf) => ({ file: rel(sf.fileName), text: fs.readFileSync(sf.fileName, 'utf8') }));
  const citedElsewhere = (name: string, own: string) =>
    prodText.some((s) => s.file !== own && new RegExp(`\\b${name}\\b`).test(s.text));

  const dead = [...exports_.values()].filter((e) => e.refs === 0).filter((e) => !citedElsewhere(e.name, e.file));

  // ---- family A: a parameter frozen at every production call site ----------
  interface Fn { name: string; file: string; line: number; params: string[]; args: (string | null)[][] }
  const fns = new Map<ts.Symbol, Fn>();

  for (const sf of production) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name && node.parameters.length >= 2) {
        const sym = checker.getSymbolAtLocation(node.name);
        if (sym) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          fns.set(sym, {
            name: node.name.text, file: rel(sf.fileName), line: line + 1,
            params: node.parameters.map((p) => p.name.getText()), args: [],
          });
        }
      }
      ts.forEachChild(node, visit);
    });
  }

  for (const sf of production) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isCallExpression(node)) {
        const target = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
        let sym = checker.getSymbolAtLocation(target);
        if (sym && (sym.flags & ts.SymbolFlags.Alias)) sym = checker.getAliasedSymbol(sym);
        const info = sym && fns.get(sym);
        if (info) info.args.push(node.arguments.map(literal));
      }
      ts.forEachChild(node, visit);
    });
  }

  const frozenParams: FrozenParam[] = [];
  for (const info of fns.values()) {
    if (info.args.length === 0) continue;          // never called: that is family B
    for (let i = 0; i < info.params.length; i++) {
      const seen = info.args.map((a) => (i < a.length ? a[i] : 'ABSENT'));
      if (seen.every((v) => v !== null && v === seen[0])) {
        // The KEY carries no line number. First version did, and the CI gate failed on
        // the very next commit because comments added higher in the file had shifted the
        // function by nineteen lines. Same case, new key. A gate that cries wolf on every
        // unrelated edit gets disabled within a week.
        frozenParams.push({
          key: `${info.file} ${info.name}(...) parameter "${info.params[i]}" is ALWAYS ${seen[0]} across ${info.args.length} production call site(s)`,
          file: info.file, fn: info.name, param: info.params[i], value: String(seen[0]),
          callSites: info.args.length, line: info.line,
        });
      }
    }
  }
  frozenParams.sort((a, b) => a.key.localeCompare(b.key));

  return {
    frozenParams,
    testOnlyExports: dead.filter((e) => e.testRefs > 0).sort((a, b) => b.testRefs - a.testRefs),
    neverReferenced: dead.filter((e) => e.testRefs === 0),
    filesAnalysed: production.length,
  };
}

// ---- baseline -------------------------------------------------------------

export function readBaseline(file: string): Set<string> {
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')),
  );
}

export function writeBaseline(file: string, keys: string[]): void {
  const header = [
    '# unwired baseline (family A).',
    '#',
    '# Every line here is a case that was JUDGED and ACCEPTED by a human.',
    '# The CI check does not re-judge them: it fails on any line that is NOT here.',
    '#',
    '# Before adding a line, answer the question: is this frozen parameter the correct',
    '# behaviour, or a dead branch that the green suite will never see?',
    '#',
    '# Regenerate:  unwired --accept',
    '',
  ].join('\n');
  fs.writeFileSync(file, header + keys.join('\n') + '\n');
}
