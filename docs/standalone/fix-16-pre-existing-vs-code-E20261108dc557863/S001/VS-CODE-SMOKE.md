# VS Code verification for issue #103

The automated sweep ran on Node 26.5.1 at source revision `f698182f9f0ddff861874ac99cbccf251d86fa0e`.

```sh
node --import tsx --test --test-concurrency=1 --test-force-exit --test-reporter=tap 'vscode-plugin/src/**/__tests__/*.test.ts'
node_modules/.bin/tsc -p vscode-plugin/tsconfig.json --pretty false
```

The final sweep ran 1,704 cases. 1,695 passed, nine gated live cases skipped, and zero failed. TypeScript passed. See [the build test record](TESTS.md) for exact focused case names and results.

| Baseline failure group | Cases | Final result |
| --- | ---: | --- |
| Tracker settings rendering, writes, and activation | 6 | Pass |
| Daemon approval subscriber and IPC fixtures | 4 | Pass |
| UX fixture rendering and truncation | 2 | Pass |
| Model role groups and global defaults | 2 | Pass |
| Settings pull and migration ordering | 1 | Pass |
| CLI provider registry | 1 | Pass |

The first sweep found a packaging regression when the shared Tracker validator imported the daemon tracker module. The fix isolates the reused GitHub identifier patterns, and the standalone extension bundle test passed on the final sweep. The first sweep also found a collision between a temporary negative TypeScript probe and the extension-wide typecheck. Serial execution avoids the collision. The three prior intermittent failures outside issue #103 did not recur in the final sweep.

## Manual VS Code check

Pending. A temporary development profile activated the test extension and subscribed to an isolated daemon fixture. The session lost access to the test window before the Tracker write and approval notification could be exercised in the UI.

1. Open **insrc: Open Repo Configuration** and select a disposable registered repo. Verify the Tracker section shows the GitHub host and the read-only sign-in and policy rows. Edit the GitHub host, accept the consent prompt, and reopen the panel to verify the saved value. Clear it afterward and verify the default is shown.
2. Trigger a daemon approval for a harmless test operation. Open **Show details** and verify it displays the redacted JSON. Choose **Decline** from the re-opened warning and verify the operation is denied.
