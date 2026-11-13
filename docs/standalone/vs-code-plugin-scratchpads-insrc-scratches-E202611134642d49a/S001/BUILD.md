<!-- insrc:artifact BUILD-4642d49ab0593787-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-13T08:59:23.823Z  ·  **Updated:** 2026-11-13T11:32:44.123Z

**Commit:** e5f820bc6

## Summary

s1/t5 re-validate @e5f820bc6: scratch-panels controller + browse table. All three named scratch-panel.test.ts cases pass (10/10 in that file); the earlier t5 failure was the missing scratch-panel side of the shared ac5 case, now present, plus the two pre-existing chat-panel.test.ts expectation repairs. Scope complaint was other sessions' .insrc ledger files only.

## Tasks validated

- ✗ `t1`
- ✓ `t2`
- ✗ `t3`
- ✓ `t4`
- ✗ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/scratch-store.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/panels/shell.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/panels/webview-host.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/panels/scratch-panels.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `vscode-plugin/src/chat/scratch-host.ts` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/EPIC-4642d49ab0593787.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/EPIC-4642d49ab0593787.log.jsonl` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t1.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t2.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t3.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t4.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t5.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t6.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASK-4642d49ab0593787-s1-t7.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASKS-4642d49ab0593787-s1.json` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `.insrc/artifacts/TASKS-4642d49ab0593787-s1.log.jsonl` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/component-dependency.html` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/sequence-diagram.html` — **insrc-build** (2026-11-13T11:32:44.123Z)
- `docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/ux-mock.html` — **insrc-build** (2026-11-13T11:32:44.123Z)
