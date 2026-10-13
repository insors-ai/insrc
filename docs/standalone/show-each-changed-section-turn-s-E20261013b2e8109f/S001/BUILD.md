<!-- insrc:artifact BUILD-b2e8109f42afc0dd-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T08:48:39.843Z  ·  **Updated:** 2026-10-13T08:51:32.861Z

**Commit:** 78676aa7

## Summary

The turn snapshot is now a git tree written through a private copy of the index; the baseline gained changes (the patch between the snapshot and the working tree) and release. Checked against real git in a plain repository, one with a split index, a linked worktree and one with no commit.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/chat/diff-sections.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/chat/edit-governor.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/chat/git-baseline.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T08:51:32.861Z)
