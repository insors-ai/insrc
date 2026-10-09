<!-- insrc:artifact BUILD-6a1315585c38c41c-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T06:48:18.298Z  ·  **Updated:** 2026-10-09T08:43:25.184Z

**Commit:** 662ffc2b

## Summary

s2 replaces the board's interim item list with six stage columns in workflow order. A pure board model (board-model.ts) filters the snapshot by scope, search and Needs attention, places each story and issue in the column of its daemon-assigned stage in snapshot order, counts before paging (show-more adds 50 per column) and builds text-labelled badges for approval, review, validation (including a failed story-level result), conflict, attention and notices. The host sends the 'board' message, keeps paging (reset by a filter change), logs unknown stages once per refresh and keeps the previous board when a render throws; the webview draws columns, cards and controls as plain text. Verification: npx tsc -p vscode-plugin exits 0; the plugin suite gives 865 pass and 2 fail, both pre-existing and failing without s2 (docs-review-panel t1 and manifest-catalog).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

## Changes

- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/__tests__/board-model.test.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/__tests__/board-state.test.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
- `vscode-plugin/src/delivery/delivery-contract.ts` — **insrc-build** (2026-10-09T08:43:25.184Z)
