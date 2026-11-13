<!-- insrc:artifact BUILD-4642d49ab0593787-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-13T08:59:23.823Z  ·  **Updated:** 2026-11-13T11:20:11.865Z

**Commit:** ba92fed38

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

- `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/scratch-store.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/panels/shell.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/panels/webview-host.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/panels/scratch-panels.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `vscode-plugin/src/chat/scratch-host.ts` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/EPIC-4642d49ab0593787.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/EPIC-4642d49ab0593787.log.jsonl` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t1.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t2.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t3.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t4.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t5.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t6.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t7.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASKS-4642d49ab0593787-s1.json` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `.insrc/artifacts/TASKS-4642d49ab0593787-s1.log.jsonl` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/component-dependency.html` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/sequence-diagram.html` — **insrc-build** (2026-11-13T11:20:11.865Z)
- `docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/ux-mock.html` — **insrc-build** (2026-11-13T11:20:11.865Z)
