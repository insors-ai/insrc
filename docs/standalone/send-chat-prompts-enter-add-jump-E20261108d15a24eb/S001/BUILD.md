<!-- insrc:artifact BUILD-d15a24eb41e0771c-s1 -->

# Build (standalone small) — Story s1

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-11-08T20:25:09.500Z  ·  **Updated:** 2026-11-08T20:26:33.389Z

**Commit:** 5ae36ee34

## Triage rationale

One module, two source files and their tests, with no storage, IPC or contract change.

## Summary

In the VS Code dev chat, Enter sends and Ctrl/Cmd+Enter inserts a line; a floating button returns to the latest output while the reader has scrolled up, driven by the transcript pager's following state.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `vscode-plugin/src/chat/transcript-pager.ts` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `docs/standalone/send-chat-prompts-enter-add-jump-E20261108d15a24eb/S001/evidence/chrome-probe-after-click.json` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `docs/standalone/send-chat-prompts-enter-add-jump-E20261108d15a24eb/S001/evidence/chrome-probe.json` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `docs/standalone/send-chat-prompts-enter-add-jump-E20261108d15a24eb/S001/evidence/jump-button-dark.png` — **insrc-build** (2026-11-08T20:26:33.389Z)
- `docs/standalone/send-chat-prompts-enter-add-jump-E20261108d15a24eb/S001/evidence/jump-button-light.png` — **insrc-build** (2026-11-08T20:26:33.389Z)
