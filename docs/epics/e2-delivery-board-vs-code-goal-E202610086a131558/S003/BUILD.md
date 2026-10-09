<!-- insrc:artifact BUILD-6a1315585c38c41c-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-09T09:13:28.104Z  ·  **Updated:** 2026-10-09T09:36:56.501Z

**Commit:** 095629c5

## Summary

s3 adds the epic rollup and the issue view beside the board. The board's matching is exported as selectMatches, and board-views.ts builds both views from it. The rollup shows each epic with a completion count that names its denominator, and its cards grouped by stage. Standalone work goes in 'Not in an epic'. The issue view shows each issue's parent link or unresolved-parent notice, and its fix stories with their stages. The host posts only the chosen view, keeping the same selection, and checks follow links against the board. The webview adds Board, Epics and Issues tabs and draws everything as text. Verification: npx tsc -p vscode-plugin exits 0. The plugin suite gives 875 pass and 2 fail; both failures are pre-existing and also fail without s3 (docs-review-panel t1 and manifest-catalog).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

## Changes

- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
- `vscode-plugin/src/delivery/__tests__/board-model.test.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
- `vscode-plugin/src/delivery/__tests__/board-views.test.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
- `vscode-plugin/src/delivery/board-views.ts` — **insrc-build** (2026-10-09T09:36:56.501Z)
