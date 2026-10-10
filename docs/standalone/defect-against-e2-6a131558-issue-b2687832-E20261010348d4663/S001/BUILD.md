<!-- insrc:artifact BUILD-348d4663a4bc17af-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-10T05:47:27.819Z  ·  **Updated:** 2026-10-10T06:56:51.784Z

**Commit:** af68be3e

## Summary

The perf test now times the first screen, filter changes and drill-downs (epic board, story screen) on 500 items / 1,000 records and meets the exact targets; full plugin suite at baseline (941 tests, 1 known failure, 4 skips) and typecheck clean. Evidence: S001/evidence/t8.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/code-review/README.md` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/code-review/coverage.txt` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/code-review/full-plugin-suite.txt` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t6/README.md` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t6/full-plugin-suite.txt` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t6/screens-1200.jpg` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t6/screens-360.jpg` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t6/screens-600.jpg` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t8/README.md` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t8/full-plugin-suite.txt` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t8/perf-exact-targets.tap` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/evidence/t8/typecheck.txt` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-details.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-model.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-state.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-views.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-webview-harness.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/details-memory.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/__tests__/labels.test.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/board-details.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/board-views.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
- `vscode-plugin/src/delivery/labels.ts` — **insrc-build** (2026-10-10T06:56:51.784Z)
