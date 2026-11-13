<!-- insrc:artifact BUILD-4642d49ab0593787-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-13T08:59:23.823Z  ·  **Updated:** 2026-11-13T11:13:20.622Z

**Commit:** 4a303f175

## Summary

t7 verdict fixes landed @dc29b3f2d: new vscode-free chat/scratch-host.ts owns the six scratch intents over injected boundaries (executable in tests); extension.ts builds the scratch store directly after createAttachmentStore at ~/.insrc/scratches, uses the showInputBox boundary via promptTitle, routes the six intents through SCRATCH_INTENT_TYPES in the wrapped chat channel, and send-to-chat opens the chat before the disposed check then awaits ready and pushes the capped insert-into-input. Non-string ids/texts are runtime-rejected with a warn. The four PLAN-named tests now execute the real createScratchHost over fakes (cancel/blank/answer flows, error+recovery, reveal/ready/cap/disposed ordering, 65,536-byte cap, malformed fields) — 39/39 wiring+scratch-panel pass, 6/6 t4 chat tests, tsc clean.

## Tasks validated

- ✗ `t1`
- ✓ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/scratch-store.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/panels/shell.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/panels/webview-host.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/panels/scratch-panels.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
- `vscode-plugin/src/chat/scratch-host.ts` — **insrc-build** (2026-11-13T11:13:20.622Z)
