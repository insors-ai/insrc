<!-- insrc:artifact BUILD-b2e8109f42afc0dd-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T08:48:39.843Z  ·  **Updated:** 2026-10-13T09:03:32.805Z

**Commit:** 48de54bd

## Summary

The webview draws a diff row as the mock's widget (built through line(), remembered by sid, redrawn in place by redrawDiff), handles the new 'transcript-row' message, folds a tool result only when its output is long, and no transcript row shrinks. The old renderDiff, its 'edit-prompt' handler and the seven .insrc-diff-* rules are gone from the shell.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/codex-file-change-item.json` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/live-cli.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/real-git.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/diff-sections.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/edit-governor.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/git-baseline.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T09:03:32.805Z)
