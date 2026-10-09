<!-- insrc:artifact BUILD-b2687832a8c75877-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-09T16:54:22.468Z  ·  **Updated:** 2026-10-09T17:38:28.840Z

**Commit:** 19d9449e

## Summary

The perf fixture's stories now carry planned tasks and recorded results; the perf test passes at the exact targets. The full plugin suite was run at HEAD 87eee377 (`npx tsx --test --test-reporter=tap 'src/**/__tests__/*.test.ts'` in vscode-plugin), output in /tmp/insrc-validate-output/vscode-plugin-full-suite-t9.tap: 935 tests, 930 pass, 4 skipped, 1 fail — the known manifest-catalog test (not ok 609 'each declared key's type/enum/default matches its ConfigOption, and scope is machine'). npm run package produced insrc-vscode-0.5.12.vsix.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/delivery/__tests__/board-details.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/board-model.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/board-state.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/board-views.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/__tests__/labels.test.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/board-details.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/board-views.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
- `vscode-plugin/src/delivery/labels.ts` — **insrc-build** (2026-10-09T17:38:28.840Z)
