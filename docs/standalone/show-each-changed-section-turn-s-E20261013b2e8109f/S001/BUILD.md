<!-- insrc:artifact BUILD-b2e8109f42afc0dd-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T08:48:39.843Z  ·  **Updated:** 2026-10-13T10:00:49.273Z

**Commit:** 7dd39fd7

## Summary

Whole plugin suite run (1206 tests, 1196 pass, 8 skipped, 2 fail: the two manifest-catalog tests that failed before), plugin 0.5.14 built, packaged and installed. The user confirmed the widgets in VS Code for a claude turn. A codex chat in the panel and a reload after the widgets were drawn were not checked by hand; a real codex turn through the host and a headless-Chrome render of the real shell stand in for them.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✗ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-b2e8109f42afc0dd-S001.json` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `docs/standalone/show-each-changed-section-turn-s-E20261013b2e8109f/S001/CR.md` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/codex-file-change-item.json` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/fixtures.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/live-cli.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/real-git.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/diff-sections.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/edit-governor.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/git-baseline.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T10:00:49.273Z)
