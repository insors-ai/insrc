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
