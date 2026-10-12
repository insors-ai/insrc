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
