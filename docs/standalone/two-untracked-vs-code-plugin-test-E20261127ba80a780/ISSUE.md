<!-- insrc:artifact ISSUE-ba80a780f4408613 -->

# Two untracked VS Code plugin test failures: docs-review-panel t3 compile probe not isolated from dependency types; daemon commands test expects pre---target install argv

## Reproduction

npm test -- --suite=vscode src/chat/__tests__/docs-review-panel.test.ts src/daemon/__tests__/commands.test.ts (repo root, Node 22.22.1). Observed: docs-review-panel.test.ts fails its two t3 compile-probe tests with node_modules .d.ts errors (@huggingface/transformers, lmdb) instead of a clean fixture compile; commands.test.ts:129 fails because the actual install argv includes --target <root> while the test expects [bash, installer.sh, -y]. Expected: both files pass under the harness.

## Root cause

(1) docs-review-panel.test.ts typecheckAgainstPanel compiles a fixture via the harness compile probe (scripts/test-harness/probe.mjs); the probe's tsc run is not isolated from dependency library errors, so the accept-valid-code assertion fails on unrelated node_modules .d.ts errors. (2) commands.test.ts:129 expects the pre-owned-runtime install argv; createDaemonLifecycleController (vscode-plugin/src/daemon/controller.ts) now appends --target <root> (commit 77c317a88) and the expectation was never updated.

## Fix intent

(1) Isolate the compile probe from dependency .d.ts noise (tsc scoping/skipLibCheck) so the t3 assertions test what they name; (2) update the commands.test.ts install-argv expectation to the current --target contract (or fix the controller only if the product contract is wrong). Test-side only; no product behavior change intended.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- **[[c2]]** `code` `vscode-plugin/src/daemon/__tests__/commands.test.ts`
- **[[c3]]** `code` `vscode-plugin/src/daemon/controller.ts`
- **[[c4]]** `code` `scripts/test-harness/probe.mjs`
