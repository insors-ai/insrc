<!-- insrc:artifact ISSUE-cffd1c931403f0c9 -->

# node:test runs hang indefinitely after all sub-tests finish because no exit-forcing flag is set

## Reproduction

1. Run `npx tsx --test src/chat/__tests__/docs-review-panel.test.ts` from vscode-plugin/ (invoked the same way as the 'test' script at vscode-plugin/package.json:911). Observed: all 237 sub-tests pass and the final tally is printed (`ℹ tests 237`, `ℹ pass 237`), but the node process does not exit afterward — it sits idle (confirmed via epoll_wait) for roughly 34 minutes until killed externally. 2. Re-run the IDENTICAL file as `npx tsx --test --test-force-exit src/chat/__tests__/docs-review-panel.test.ts`. Observed: same 237/237 pass, but the process exits on its own in 27.7 seconds. Expected: a completed test run should exit promptly regardless of which flag is used.

## Root cause

The repo's three node-test-runner invocations — package.json:19 (`"test": "tsx --test src/**/__tests__/*.test.ts"`), packages/project-memory/package.json:27 (`"test": "node --import tsx --test src/__tests__/*.test.ts"`), and vscode-plugin/package.json:911 (`"test": "tsx --test 'src/**/__tests__/*.test.ts'"`) — all invoke node's built-in test runner with no exit-forcing flag. Some shared test fixture used across many tests in at least one file (vscode-plugin's docs-review-panel.test.ts) leaves a timer, socket, or watcher open after its tests finish, so node's event loop never naturally drains and the process never exits on its own. Without `--test-force-exit`, nothing in the invocation causes the runner to exit once all known tests have genuinely completed, so a run can hang indefinitely even though every test already passed and was already reported.

## Fix intent

Add the `--test-force-exit` flag to the node test-runner invocation in all three 'test' scripts (package.json, packages/project-memory/package.json, vscode-plugin/package.json), so a run exits promptly once all tests have genuinely finished, regardless of which fixture leaves a dangling handle open. This does not change any test's logic, does not locate or fix the specific leaking fixture, and does not alter what counts as a pass or fail — it only ensures a completed run's process actually exits.

## Citations

- **[[c1]]** `code` `package.json:19` — ""test": "tsx --test src/**/__tests__/*.test.ts","
- **[[c2]]** `code` `packages/project-memory/package.json:27` — ""test": "node --import tsx --test src/__tests__/*.test.ts","
- **[[c3]]** `code` `vscode-plugin/package.json:911` — ""test": "tsx --test 'src/**/__tests__/*.test.ts'","
- **[[c4]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
