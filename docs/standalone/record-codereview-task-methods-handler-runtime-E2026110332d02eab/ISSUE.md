<!-- insrc:artifact ISSUE-32d02eabd856ca2c -->

# Record the codeReview.task.* methods in the handler-runtime key-set test

## Reproduction

Run `npx tsx --test --test-force-exit src/daemon/__tests__/handler-runtime.test.ts`. Expected: 4 pass. Observed: the test "the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since" fails with a deep-equal diff whose only extra keys are codeReview.task.activity, assignment, cleanup, progress, publish, result, scope and start.

## Root cause

The daemon handler table now registers eight codeReview.task.* methods (src/daemon/handler-runtime.ts:620 is the start entry; src/daemon/threads/method-class.ts:91 classes them and its own coverage test passes). The handler-runtime test records the methods the tables gained after the single-thread move in ADDED_RPC (src/daemon/__tests__/handler-runtime.test.ts:73-79), and that list was never extended for them. A second test in the same file (lines 100-104) also asserts that no codeReview.* method is among the added ones, which was true when it was written (only codeReview.freshness existed) and is no longer true. The runtime and the method-class table agree; only the test's records are stale.

## Fix intent

Add the eight codeReview.task.* methods to the test's ADDED_RPC list and change the second test so it still checks that nothing is duplicated or renamed but no longer claims no codeReview.* method was added (codeReview.freshness stays in the recorded set). No runtime change.

## Citations

- **[[c1]]** `code` `src/daemon/__tests__/handler-runtime.test.ts:73-79` — "const ADDED_RPC = ["
- **[[c2]]** `code` `src/daemon/__tests__/handler-runtime.test.ts:100-104` — "assert.ok(!ADDED_RPC.some(m => m.startsWith('codeReview.'))"
- **[[c3]]** `code` `src/daemon/handler-runtime.ts:620` — "'codeReview.task.start': async (params, context) ="
- **[[c4]]** `code` `src/daemon/threads/method-class.ts:91` — "['codeReview.task.start', 'session', false],"
