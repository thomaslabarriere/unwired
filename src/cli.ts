#!/usr/bin/env node
/**
 * unwired CLI.
 *
 *   unwired                    human-readable report (family A; add --full for family B)
 *   unwired --check            compare family A to the baseline, exit 1 on any NEW case
 *   unwired --accept           rewrite the baseline after judging the cases by hand
 *
 *   --project <tsconfig.json>  default: ./tsconfig.json
 *   --baseline <file>          default: ./unwired.baseline.txt
 *   --scope <a,b,c>            path segments to analyse, default: /src/,/app/,/lib/
 */
import * as path from 'path';
import { analyse, readBaseline, writeBaseline } from './detect';

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string, d: string) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

if (has('--help') || has('-h')) {
  console.log(`
unwired — finds code that is written, tested, and never actually reached.

  unwired                     report family A (frozen parameters)
  unwired --full              also list family B (exports referenced only by tests)
  unwired --check             fail (exit 1) on any case absent from the baseline
  unwired --accept            rewrite the baseline with the current cases

  --project <tsconfig.json>   default ./tsconfig.json
  --baseline <file>           default ./unwired.baseline.txt
  --scope <a,b,c>             path segments to analyse, default /src/,/app/,/lib/
`);
  process.exit(0);
}

const project = path.resolve(val('--project', 'tsconfig.json'));
const baseline = path.resolve(val('--baseline', 'unwired.baseline.txt'));
const scope = val('--scope', '/src/,/app/,/lib/').split(',').filter(Boolean);

const report = analyse({ tsconfig: project, scope });
const keys = report.frozenParams.map((f) => f.key);

if (has('--accept')) {
  writeBaseline(baseline, keys);
  console.log(`Baseline rewritten: ${keys.length} accepted case(s) in ${path.relative(process.cwd(), baseline)}`);
  process.exit(0);
}

if (has('--check')) {
  const known = readBaseline(baseline);
  const added = keys.filter((k) => !known.has(k));
  const gone = [...known].filter((k) => !keys.includes(k));

  if (gone.length > 0) {
    console.log(`\n${gone.length} baseline case(s) disappeared (wired up or deleted). Not blocking.`);
    gone.forEach((c) => console.log('  - ' + c));
    console.log('  Run  unwired --accept  to clean the baseline.\n');
  }

  if (added.length === 0) {
    console.log(`OK. ${keys.length} known case(s), no new frozen parameter.`);
    process.exit(0);
  }

  console.error(`\nFAIL: ${added.length} parameter(s) frozen at EVERY production call site, absent from the baseline.\n`);
  for (const k of added) {
    const f = report.frozenParams.find((x) => x.key === k)!;
    console.error(`  ${k}  [line ${f.line}]`);
  }
  console.error(
    '\nA parameter that always holds the same value is either the correct behaviour,'
    + '\nor a dead branch the green suite will never see, because its test calls the'
    + '\nfunction directly. Judge the case, THEN choose:'
    + '\n  - defect  : wire the real value at the call site;'
    + '\n  - correct : run  unwired --accept  and say why in the commit message.\n',
  );
  process.exit(1);
}

console.log(`\n=== FAMILY A: a parameter frozen at every production call site ===`);
console.log(`${report.frozenParams.length} case(s) across ${report.filesAnalysed} production files. Read this one first.\n`);
report.frozenParams.forEach((f) => console.log(`  ${f.key}  [line ${f.line}]`));

if (!has('--full')) {
  console.log(
    `\n(Family B hidden: ${report.testOnlyExports.length} export(s) referenced only by tests,`
    + `\n ${report.neverReferenced.length} referenced nowhere at all. No live defect has ever come`
    + `\n out of it for me: it is an inventory of unfinished features. Use --full to see it.)\n`,
  );
} else {
  console.log(`\n=== FAMILY B: exported, referenced NOWHERE in production ===`);
  console.log(`${report.testOnlyExports.length} referenced ONLY by tests\n`);
  report.testOnlyExports.slice(0, 30).forEach((e) =>
    console.log(`  ${e.file}:${e.line} ${e.kind} ${e.name} (${e.testRefs} test refs, 0 in production)`));
  console.log(`\n${report.neverReferenced.length} referenced nowhere at all (plain dead code, less serious)\n`);
}
