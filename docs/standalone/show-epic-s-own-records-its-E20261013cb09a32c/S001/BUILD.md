<!-- insrc:artifact BUILD-cb09a32ccdc4ed2b-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T18:12:18.675Z  ·  **Updated:** 2026-10-13T18:12:18.675Z

**Commit:** 5ab1fd97

## Summary

An Epic's board screen now carries the Epic's own records: StagesBody gains epicRecords (EpicRecordsView: the Epic's id, its evidence rows, the opened read-only record), null on list screens; board-state fills it in the 'epic' case from the details callback, so the filter does not change it. recordOwnerId (new, beside currentItemId) gives the item whose records are on show, the Epic on its own board included, and the host passes it to memory.kept, so the details memory's existing openEvidence opens an Epic's record in the review pane or reads it. The webview draws the existing recordsTable in an 'epic-records' box before the totals line and the no-matches early return, and shares the opened-record drawing with a Story's tab (openedRecordBox). Tests: six in the new epic-records.test.ts, one per subject of the design; the board's 125 existing tests pass unchanged. Seven mutations of the new code each failed the tests. Plugin suite 1266 pass, 2 fail (existing manifest-catalog failures); plugin typecheck clean. The user checked it by hand in VS Code.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` — **insrc-build** (2026-10-13T18:12:18.675Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-13T18:12:18.675Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-13T18:12:18.675Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-13T18:12:18.675Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-13T18:12:18.675Z)
