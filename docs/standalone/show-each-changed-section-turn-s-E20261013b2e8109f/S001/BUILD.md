<!-- insrc:artifact BUILD-b2e8109f42afc0dd-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T08:48:39.843Z  ·  **Updated:** 2026-10-13T09:17:32.367Z

**Commit:** 2cc4b881

## Summary

While a turn's diff state is open the host holds back the file-edit path line and a successful edit's result row, shows the path then the error for a failed edit, and writes a held path's line after the check that follows its edit when no section is in that file. The diff state is ended (held paths settled, session saved, governor's turn abandoned) before every detach and stop, on a sink error, when a newer message arrives and at the next turn's start; a followed turn is untouched.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/codex-file-change-item.json` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/live-cli.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/real-git.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/diff-sections.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/edit-governor.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/git-baseline.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T09:17:32.367Z)
