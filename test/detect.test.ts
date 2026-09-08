/** Minimal assertion runner: no framework, so the tool has no test-runner opinion. */
import * as path from 'path';
import { analyse } from '../src/detect';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ok   ${label}`); }
  else { failures++; console.error(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`); }
}

const report = analyse({ tsconfig: path.join(__dirname, 'fixtures', 'tsconfig.json'), scope: ['/src/'] });

console.log('\nunwired — detector tests\n');

const frozen = report.frozenParams.map((f) => `${f.fn}.${f.param}=${f.value}`);

check('finds the parameter frozen to `true` at every call site',
  frozen.includes('score.isMale=true'), `got: ${JSON.stringify(frozen)}`);

check('counts both production call sites',
  report.frozenParams.some((f) => f.fn === 'score' && f.callSites === 2),
  `got: ${JSON.stringify(report.frozenParams.map((f) => [f.fn, f.callSites]))}`);

check('does NOT flag a parameter that production varies',
  !frozen.some((k) => k.startsWith('clamp.max')), `got: ${JSON.stringify(frozen)}`);

check('ignores the value passed by the test file',
  !frozen.includes('score.isMale=false'), 'a test passing `false` must not count as production');

check('reports an export referenced only by tests',
  report.testOnlyExports.some((e) => e.name === 'unusedHelper'),
  `got: ${JSON.stringify(report.testOnlyExports.map((e) => e.name))}`);

check('baseline keys carry no line number',
  report.frozenParams.every((f) => !/\bline\b|:\d+/.test(f.key)),
  'a key containing a line number breaks the CI gate on unrelated edits');

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
