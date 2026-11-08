# VS Code verification for issue #103

The automated sweep ran on Node 26.5.1 at revision `f3d6caeb0fe9ac7ca4308c0c001c079d1a32ca7f`. It started at 12:55:21 UTC and finished at 12:56:58 UTC on 2026-11-08, after the daemon recorded passing verdicts for tasks t1 through t3.

```sh
node --import tsx --test --test-concurrency=1 --test-force-exit --test-reporter=tap 'vscode-plugin/src/**/__tests__/*.test.ts'
node_modules/.bin/tsc -p vscode-plugin/tsconfig.json --pretty false
```

The final sweep ran 1,707 cases. 1,698 passed, nine gated live cases skipped, and zero failed. The extension TypeScript check passed within the sweep. See [the build test record](TESTS.md) for exact focused case names and results.

| Baseline failure group | Cases | Final result |
| --- | ---: | --- |
| Tracker settings rendering, writes, and activation | 6 | Pass |
| Daemon approval subscriber and IPC fixtures | 4 | Pass |
| UX fixture rendering and truncation | 2 | Pass |
| Model role groups and global defaults | 2 | Pass |
| Settings pull and migration ordering | 1 | Pass |
| CLI provider registry | 1 | Pass |

An earlier sweep found a packaging regression when the shared Tracker validator imported the daemon tracker module. The fix isolates the reused GitHub identifier patterns, and the standalone extension bundle test passed on the final sweep. Serial execution avoids a collision between a temporary negative TypeScript probe and the extension-wide typecheck. A later sweep found one stale provider-status wiring assertion after adding the read timeout. The assertion now checks both the repo path and the timeout. The final timeout wiring stays in the extension and uses the existing shared RPC timeout. The three prior intermittent failures outside issue #103 did not recur in the final sweep.

## Manual VS Code check

The user confirmed that Tracker loads in VS Code and tested the updated layout. The selected repo had no team policy configured, so the live check exercised the empty Policies state. The populated read-only table passed the catalog fixture test and was inspected in a browser preview at revision `17222a3dc`.

The user confirmed both remaining manual checks passed in VS Code.

| Check | Result |
| --- | --- |
| Tracker write persistence and clearing the GitHub host override | Pass |
| Native approval notification, redacted JSON in **Show details**, and **Decline** after the prompt returns | Pass |
