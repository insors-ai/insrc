<!-- insrc:artifact BUILD-59da3204a44afd1b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T10:25:29.172Z  ·  **Updated:** 2026-10-12T12:17:54.221Z

**Commit:** bdd0a0ef

## Summary

Pasted images and picked documents are copied to the chat's own folder under ~/.insrc/chat-attachments, shown as removable chips under the prompt, sent with the next message as paths the CLI may read, and shown as chips on the sent message that open the file. Checked with the real claude and codex CLIs and in the panel by the user. A paste fix (commit bdd0a0ef) was made after the user's first paste did nothing: the handler also reads images offered as files and says what the clipboard offered when it has no image; which of that and the second reload made paste work is not known.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-59da3204a44afd1b-S001.json` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/fake-attachment-fs.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/attachment-store.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-12T12:17:54.221Z)
