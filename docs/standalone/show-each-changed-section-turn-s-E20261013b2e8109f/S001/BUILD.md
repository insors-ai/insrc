<!-- insrc:artifact BUILD-b2e8109f42afc0dd-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T08:48:39.843Z  ·  **Updated:** 2026-10-13T08:54:46.910Z

**Commit:** 929eb1e1

## Summary

A claude Edit or Write result now carries editPath and isError; a codex file_change item gives one applied file-edit event per file it changed (a real recorded item is the unit fixture). Both live tests ran against the installed CLIs and passed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/codex-file-change-item.json` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/live-cli.test.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/__tests__/real-git.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/diff-sections.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/edit-governor.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/git-baseline.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T08:54:46.910Z)
