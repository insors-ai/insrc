# Story s11: full test sweeps

Each sweep is the full suite under Node 22:

    npx tsx --test --test-force-exit --test-timeout=180000 \
      'src/**/__tests__/*.test.ts' 'src/**/__tests__/*.test.tsx' \
      'vscode-plugin/src/**/__tests__/*.test.ts'

Known failures on `main` before this Story (see Story s4's `t10-sweep.md`, each
reproduced at the commit before Story s4 Task t10): the SQLite driver test,
and the VS Code plugin defects ISSUE-c03a454b (activation, 5 cancelled),
ISSUE-96f66552 (cli-adapter /proc) and ISSUE-37ca9cf4 (manifest-catalog, 2).
They are 9 tests in 4 files; a sweep below is "clean" when nothing else fails.

| Task | Date | tests | pass | fail | cancelled | skipped | Newly failing |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| t3 | 2026-10-12 | 6666 | 6525 | 4 | 5 | 129 | none |
| t4 | 2026-10-12 | 6667 | 6526 | 4 | 5 | 129 | none (one source-scan test that read src/mcp/workflow-step/handler.ts by path was repointed and passes; first run 6525/5) |
| t5 | 2026-10-12 | 6661 | 6519 | 5 | 5 | 129 | none from this task: the fifth failure, src/cli/panes/__tests__/MCPSection.test.ts 'the poll interval fires while open and is cleared on unmount (ac2)', is a known timing flake untouched by the task and passed 5 of 5 reruns alone |
| t6 | 2026-10-12 | 6675 | 6533 | 5 | 5 | 129 | none from this task: the fifth failure, vscode-plugin/src/delivery/__tests__/delivery-client.test.ts 'opening and refreshing against a temporary git repository leaves the store, docs and git untouched', saw a transient .git/objects/maintenance.lock written by git's background maintenance in its temporary repository; the task touches nothing under vscode-plugin, and the file passed 3 of 3 reruns alone |
| t7 | 2026-10-12 | 6681 | 6540 | 4 | 5 | 129 | none (no test output mentions the new 'no daemon client is installed' error) |
| t8 | 2026-10-12 | 6685 | 6542 | 6 | 5 | 129 | none from this task: the two extra failures, src/workflow/delivery/__tests__/handlers.test.ts 'workflow.delivery returns one timestamped snapshot and leaves the store, docs and git untouched' and the delivery-client test seen at t6, both saw a transient .git/objects/maintenance.lock written by git's background maintenance in their temporary repositories; neither file is touched by the task, and both passed 3 of 3 reruns alone |
| t9 | 2026-10-12 | 6689 | 6545 | 7 | 5 | 129 | none left from this task. Two source scans the task made stale failed and were updated in the task (both files then 9/9): the permitted-reader name now appears only at its definition (src/db/graph/__tests__/live-store-owner.test.ts), and no file under src/mcp, server.ts included, imports src/daemon/steps (src/daemon/steps/__tests__/workflow-rpc-imports.test.ts). The third extra failure is the delivery handlers test's git maintenance.lock flake seen at t8 |
| t10 | 2026-10-12 | 6647 | 6505 | 5 | 5 | 129 | none from this task: the fifth failure is the MCPSection poll-interval timing flake (src/cli/panes/__tests__/MCPSection.test.ts), untouched by the task, 3 of 3 alone. 42 fewer tests than at t9: the deleted sampling-bridge, mcp-sampling-provider, sampler-context and sampler cases of shaper-provider |
| t11 | 2026-10-12 | 6649 | 6508 | 4 | 5 | 129 | none: exactly the known failures and cancellations (Node v22.23.2, after the reader allowance was deleted) |
| t12 | 2026-10-13 | 6655 | 6514 | 4 | 5 | 129 | none: exactly the known failures and cancellations. The 11 'cli-provider claude completed' log lines are the CliProvider tests' stand-in binaries (model null, under a second each); no test calls a real model |
| merge 089993b7 (run 1) | 2026-10-13 | 6647 | 6502 | 6 | 5 | 131 | none from s11. Extra failures: vscode-plugin session-lock.test.ts 'the cross-window wait starts after the in-window grant...' ('Unexpected end of JSON input', code that arrived with the merge) and the delivery-client git maintenance.lock flake; both pass 3 of 3 alone. This run also reported only 33 of render-registry.test.ts's 67 tests with no failure for the file (a reporting glitch: alone it runs 71/71, and run 2 reports it whole) |
| merge 089993b7 (run 2) | 2026-10-13 | 6683 | 6539 | 5 | 5 | 131 | none reproducible: the one extra failure is no-live-store-in-tests.test.ts, whose child run of src/workflow/review/__tests__/template-review.test.ts failed 1 of 18 under the full sweep's load (the captured log does not name the test); template-review passes 18/18 alone three times and the audit file 5/5 alone three times |
| merge eb4314b5 | 2026-10-13 | 6685 | 6539 | 7 | 5 | 131 | none from s11. Extra failures: the two git maintenance.lock delivery flakes, and src/workflow/review/__tests__/template-review.test.ts 'a design under an Epic gets the SPEC template and the Epic limit; a standalone feature design the feature limit' (expected 1440000, got 1439999: a time limit computed from two clock readings, off by a millisecond under load; this is also what failed inside the no-live-store audit in run 2 above). 18/18 alone three times |
| code-review fixes | 2026-10-13 | 6688 | 6544 | 5 | 5 | 131 | none: the known failures plus the delivery-client git maintenance.lock flake. (A first run failed analyze-step-handler.test.ts as a file: I had removed a test seam it uses; restored before this run.) |
| shared review request | 2026-10-13 | 6692 | 6547 | 6 | 5 | 131 | none from the change: the known failures plus two flakes seen before (vscode-plugin session-lock.test.ts 'the cross-window wait...', and the delivery-client git maintenance.lock flake), both outside the change |

## t9: provenance of the tool-surface golden file

`src/mcp/__tests__/fixtures/tool-surface.golden.json` was regenerated from commit
`e30638e5` (the last commit before t9) in a separate git worktree, through a real
MCP client's `listTools` over an in-memory transport. It is byte-identical to the
committed file: SHA-1 `bba2b5e79921ac1ae54305ad54e692f474058145` for both.
