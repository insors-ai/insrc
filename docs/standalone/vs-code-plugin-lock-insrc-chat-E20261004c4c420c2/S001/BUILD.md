# Build (standalone small) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-04T08:50:42.280Z  ·  **Updated:** 2026-10-04T08:50:42.280Z

**Commit:** e0d0adf

## Summary

Added a vscode-free chat/group-lock.ts that locks the chat's editor group the first time the chat tab is the active tab (fresh open and after reload), retrying on both panel view-state and tab-model changes and issuing the command at most once per panel. Wired from the single webviewPanelChannel adapter in extension.ts behind the new insrc.chat.lockGroup setting (default on); chat-panel.ts now exports CHAT_VIEW_TYPE. 13 unit tests plus 3 wiring tests added; 12 mutations of the module all turn the suite red. The manual smoke check in a real VS Code window has not been run.

## Tasks validated

- ✗ `S001`

## Changes

- `.insrc/artifacts/LLD-c4c420c22b71651e-S001.json` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `docs/standalone/vs-code-plugin-lock-insrc-chat-E20261004c4c420c2/S001/LLD.md` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `vscode-plugin/src/chat/__tests__/group-lock.test.ts` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `vscode-plugin/src/chat/group-lock.ts` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-04T08:50:42.280Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-04T08:50:42.280Z)
