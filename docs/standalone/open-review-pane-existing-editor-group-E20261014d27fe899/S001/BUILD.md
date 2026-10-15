<!-- insrc:artifact BUILD-d27fe8996fc3a2db-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-15T04:54:23.764Z  ·  **Updated:** 2026-10-15T04:54:23.764Z

**Commit:** 999d729a

## Triage rationale

Small: one module plus a new vscode-free placement function.

## Summary

A new review pane opens in an editor group that is already open and holds no chat tab; with none it opens where it did (beside the chat without focus when quiet, the active group otherwise). New vscode-free chat/review-column.ts: chooseReviewColumn(groups, chatViewType) leaves out every group with a tab satisfying group-lock.ts's isChatTabInput, then returns the active group's column, else the lowest, else undefined. extension.ts's review host createPanel reads vscode.window.tabGroups.all in a try (a throw is logged and gives today's placement) and passes the column, or today's placement. The compile-only vscode.d.ts shim gained TabGroups.all and TabGroup.viewColumn, isActive and tabs. Tests: review-column.test.ts (fake groups), and the two existing source scans in review-wiring.test.ts rewritten for the new wiring (the iconPath test and the presenter-wiring test, whose title now states the new placement). Tests run file by file: 1357 tests, 2 failures (the manifest-catalog tests that were already failing). NOT SEEN IN A REAL VS CODE: whether VS Code puts the pane into the chosen group, and what the 'active group' is when the chat group is locked, are untested; extension.ts cannot run outside VS Code.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-160fa1bb7a8604ad-S001.json` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `.insrc/artifacts/BUILD-57a2ba4d5f18c356-S001.json` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `docs/standalone/always-show-chat-s-progress-widget-E2026101457a2ba4d/S001/BUILD.md` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `docs/standalone/end-running-state-only-running-turn-E20261014160fa1bb/S001/BUILD.md` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `vscode-plugin/src/chat/__tests__/review-column.test.ts` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `vscode-plugin/src/chat/review-column.ts` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-15T04:54:23.764Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-15T04:54:23.764Z)
