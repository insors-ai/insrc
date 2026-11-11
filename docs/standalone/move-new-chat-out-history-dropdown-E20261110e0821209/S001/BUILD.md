<!-- insrc:artifact BUILD-e0821209d94791d0-s1 -->

# Build (standalone small) — Story s1

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-11-11T04:34:47.332Z  ·  **Updated:** 2026-11-11T04:34:47.332Z

**Commit:** d7affcde9

## Summary

Implemented LLD-e0821209d94791d0-s1 in vscode-plugin/src/chat/chat-panel.ts: added the #insrc-newchat icon button (bubble-plus inline SVG in the .pico slot) left of .histchip in .chrome .right with .newchatbtn chip-matching CSS, wired its click to stopPropagation + newChatPick(nc), and removed the trailing new… row from renderHistoryMenu. The new-chat message payload is byte-identical, so host/store/protocol are untouched. Updated the two pinning tests in chat-panel.test.ts and the three chat-shell.test.ts cases that exercised the removed row. Gates: chat-panel+chat-shell 275/275, cli-adapter 106/106, extension-chat-wiring 26/26, tsc --noEmit clean. Code committed as f636a30c0 with the Insrc-Story trailer.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-11T04:34:47.332Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-11T04:34:47.332Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-11T04:34:47.332Z)
- `.insrc/artifacts/EPIC-e0821209d94791d0.json` — **insrc-build** (2026-11-11T04:34:47.332Z)
- `.insrc/artifacts/EPIC-e0821209d94791d0.log.jsonl` — **insrc-build** (2026-11-11T04:34:47.332Z)
