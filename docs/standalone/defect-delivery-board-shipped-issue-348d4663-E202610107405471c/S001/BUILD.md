<!-- insrc:artifact BUILD-7405471c72bd3e88-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-10T07:45:01.489Z  ·  **Updated:** 2026-10-10T10:24:15.169Z

**Commit:** 6375903b

## Summary

The perf test now times the switch to the Issues screen on the 500-item board (3.6 ms against 150 ms with the exact targets); the full plugin suite passes apart from the known manifest-catalog baseline, the typecheck is clean, and the board-beside-mock screenshots for six screens at 1200, 600 and 360 px are in evidence/t7.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/defect-delivery-board-shipped-issue-348d4663-E202610107405471c/S001/evidence/t7/README.md` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `docs/standalone/defect-delivery-board-shipped-issue-348d4663-E202610107405471c/S001/evidence/t7/full-plugin-suite.txt` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `docs/standalone/defect-delivery-board-shipped-issue-348d4663-E202610107405471c/S001/evidence/t7/pairs-1200.jpg` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `docs/standalone/defect-delivery-board-shipped-issue-348d4663-E202610107405471c/S001/evidence/t7/pairs-360.jpg` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `docs/standalone/defect-delivery-board-shipped-issue-348d4663-E202610107405471c/S001/evidence/t7/pairs-600.jpg` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `docs/standalone/defect-delivery-board-shipped-issue-348d4663-E202610107405471c/S001/evidence/t7/perf-exact-targets.txt` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/__tests__/board-model.test.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/__tests__/board-views.test.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
- `vscode-plugin/src/delivery/board-views.ts` — **insrc-build** (2026-10-10T10:24:15.169Z)
