# demo

A minimal project that contains one real frozen parameter (a green dead branch) and
one healthy, varied parameter, so you can see `unwired` in action in a few seconds.

- `src/notify.ts`: `send(message, channel)` supports an "email" and an "sms" branch.
- `src/app.ts`: every production call site passes `channel = "email"`, so the "sms"
  branch never runs. `enqueue(message, priority)` is called with varied priorities and
  is correctly left alone.

Run it from the repo root:

    npx tsx src/cli.ts --project demo/tsconfig.json

The committed [`expected-output.txt`](expected-output.txt) is the reference output for
that command.
