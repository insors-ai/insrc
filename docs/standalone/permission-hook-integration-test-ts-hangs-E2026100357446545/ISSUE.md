<!-- insrc:artifact ISSUE-57446545909fe95c -->

# Stop the permission-hook test hanging the run, and with it the flag that cancels live tests

## Reproduction

OBSERVED, and isolated by bisection rather than inferred.

1. Enable the live-test gate and run the eight environment-gated test files WITHOUT `--test-force-exit`.
2. OBSERVED: the run never exits. Split in half, the four analyze/data files finish in 4 seconds and the other four hang. Split again, three of those finish in 2 seconds each and only the permission-hook integration file hangs — killed at 90 seconds in isolation.
3. Separately, every one of that file's nine tests fails before touching the product, each reporting `spawn <repo>/src/node_modules/.bin/tsx ENOENT`.
   EXPECTED: the suite exercises the hook and the run exits on its own.

Why this matters far more than one broken file: the hang is the reason the sweep is run with `--test-force-exit`, and that flag exits as soon as synchronous tests settle. With the live gate open it therefore cancels work still in flight — measured at 332 cancelled tests and 36 failures that were pure artefacts, in 19.6 seconds. So one unexported handle in one test file has been suppressing the entire live suite, and every "green" sweep reported with that flag has been quietly incomplete.

## Root cause

ONE wrong path, and a missing guard that converts it from a visible failure into a hang.

The suite computes the tsx binary two directory levels above its own location. From `src/bin/__tests__` that is `src/`, so it looks for `src/node_modules/.bin/tsx`. That file does not exist; three levels up is the repository root, where it does. Both candidates were computed and checked: two levels up is absent, three levels up is present.

The spawn helper then registers handlers for the child's stdout, stderr and `close` — and none for `error`. When a binary cannot be spawned, Node emits `error`, so the helper's Promise is never settled. The awaiting test never resumes, which means its `finally` block never runs, which means the fake daemon's listening socket is never closed. An open listening handle keeps the event loop alive, so the process cannot exit.

That ordering matters for the fix. The leaked socket is a CONSEQUENCE, not an independent defect: closing it more aggressively would mask the hang while leaving a spawn helper that still waits forever on any unspawnable binary. Equally, correcting the path alone would make today's symptom disappear while leaving the same trap for the next environment where the binary is missing.

## Fix intent

The suite should locate the binary it actually needs, and a spawn that cannot start should fail fast and loudly instead of waiting forever.

Two consequences worth stating rather than designing around. First, the nine tests have apparently never executed, so this is the first time they will run against the real hook — some may fail for reasons that have nothing to do with the spawn, and those should be triaged on their own merits rather than folded into this correction. Second, and the actual prize: once the run exits on its own, `--test-force-exit` is no longer needed for the live sweep, which is what currently cancels in-flight live tests.

The verification obligation is explicit, because this defect's whole character is that it hid behind a flag: it is not enough that the diff looks right. The suite must be DEMONSTRATED to exit on its own without `--test-force-exit`, and the broader live batch must be shown to complete rather than hang. A claim of "no longer hangs" that rests on the diff rather than on a run would reproduce exactly the mistake that let this sit undetected.

## Citations

- **[[c1]]** `code` `src/bin/__tests__/permission-hook-integration.test.ts:31` — "const TSX_BIN   = resolve(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');"
- **[[c2]]** `code` `src/bin/__tests__/permission-hook-integration.test.ts:29` — "const __dirname = dirname(fileURLToPath(import.meta.url));"
- **[[c3]]** `code` `src/bin/__tests__/permission-hook-integration.test.ts:110` — "const child = spawn(TSX_BIN, [HOOK_TS], {"
- **[[c4]]** `code` `src/bin/__tests__/permission-hook-integration.test.ts:88` — "server.listen(opts.socketPath, () => {"
- **[[c5]]** `code` `src/bin/__tests__/permission-hook-integration.test.ts:174` — "} finally {"
- **[[c6]]** `code` `src/bin/__tests__/permission-hook-integration.test.ts:36` — "const GATE = process.env['INSRC_LIVE_TESTS'] === '1';"
- **[[c7]]** `convention` `CLAUDE.md — the documented fast-subset and full-sweep commands, which is where --test-force-exit is applied`
