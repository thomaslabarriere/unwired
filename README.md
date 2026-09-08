# unwired

**Finds code that is written, tested, and never actually reached.**

A green test suite proves your code is *right*. It says nothing about whether your code is
*reached*. `unwired` is a TypeScript static analyser that looks for the gap between the two.

```bash
npx unwired --check
```

---

## Why this exists

On 27 August 2026 I found seven defects in a single day, in a 200,000-line TypeScript
codebase written almost entirely by AI agents. Six of them shared one shape: a mechanism
that was **correct, unit-tested, green in CI, and that never ran on a real user**.

| what was written | what actually happened |
| --- | --- |
| an EMA smoothing cap | received `null` at its only production call site |
| a user's rank | all five call sites passed `true` (male) as a literal |
| an injury-aggravation rule | read a pain history that nothing ever populated |

None of these are caught by tests, because a unit test calls the function *directly*. The
test and the implementation can both be internally consistent and collectively
disconnected from the product.

This matters more every month. When an agent writes the implementation **and** its test,
the green tick stops being evidence. You need a check that looks at the wiring instead of
the logic.

## What it detects

**Family A — a parameter frozen at every production call site.**
The dangerous one. The function is called, it returns, its test is green, and the useful
branch is dead. Both real defects I fixed that day came from here.

```
src/engine/advisor/engineAdvisor.ts analyzeWeek(...) parameter "previousWeeks"
  is ALWAYS ABSENT across 2 production call site(s)
```

That one is real, from my own codebase. `analyzeWeek` was designed to compare a training
week against previous ones. No caller ever passed them. The comparison had been dead for
months, under 10,858 green tests.

**Family B — an export referenced nowhere in production, only by tests.**
Much noisier, and hidden by default. Most cases are unfinished features rather than
defects, and wiring one up means shipping a path that has never run — often worse than
leaving it dead.

## Usage

```bash
npx unwired                     # report family A
npx unwired --full              # also list family B
npx unwired --check             # exit 1 on any case absent from the baseline
npx unwired --accept            # rewrite the baseline after judging cases by hand

  --project <tsconfig.json>     default ./tsconfig.json
  --baseline <file>             default ./unwired.baseline.txt
  --scope <a,b,c>               path segments to analyse, default /src/,/app/,/lib/
```

Programmatic use:

```ts
import { analyse } from 'unwired';
const report = analyse({ tsconfig: './tsconfig.json', scope: ['/src/'] });
```

## The baseline is the whole point

`unwired` does **not** ask you to fix the cases it finds. On my first pass it reported 49
family-A cases: 3 serious candidates, 2 real defects, and 1 non-defect (a *quiet hours*
helper that used its defaults because no UI ever set them — the default **was** the
correct behaviour).

So it works as a ratchet. You judge the existing cases once, accept them into a versioned
baseline, and CI fails only on the **fiftieth** — the one someone writes next week.

```yaml
# .github/workflows/ci.yml
- run: npx unwired --check
```

Two design decisions come from this being a gate people have to live with:

- **Baseline keys carry no line number.** The first version included one, and the gate
  failed on the very next commit because comments added higher in the file had shifted a
  function by nineteen lines. Same case, new key. A gate that cries wolf on unrelated
  edits gets disabled within a week.
- **A candidate whose name appears in any other production file is dropped.** Destructured
  dynamic imports (`import('x').then(({ f }) => f())`) escape symbol resolution. Better to
  miss a dead one than to send people chasing ghosts: a list that contains false positives
  stops being read at all.

## Known limits

- TypeScript only, and only what `tsconfig.json` includes.
- Family A covers **function declarations with two or more parameters**. Arrow functions
  assigned to consts are not yet analysed.
- Only literal arguments count as frozen (`null`, `undefined`, `[]`, numbers, strings,
  booleans, and absent arguments). Anything computed is treated as varying.
- Scope is limited to the path segments you pass. A caller living outside them makes a
  reached function look dead.
- **It reports, it does not judge.** Every case needs a human.

## Install

```bash
npm i -D unwired
```

Requires Node 18+ and TypeScript 5+ as a peer dependency.

## Licence

MIT — Thomas Labarriere
