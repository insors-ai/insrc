<!-- insrc:artifact BUILD-546198e11c24c1e3-s1 -->

# Build (standalone small) — Story s1

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-11-07T14:48:24.346Z  ·  **Updated:** 2026-11-07T15:29:02.808Z

**Commit:** 7ff090a46

## Triage rationale

Contained webview-chrome change: two dropdowns + a placeholder relabel, no data-model or IPC change; triaged as a standalone small feature.

## Summary

Renders the real provider icon (Claude/Codex/Vibe) in the history and active-chat chrome dropdowns and relabels the empty active-chat placeholder to "no active work". Validation-driven fixes: (1) the history menu was left-anchored like the active menu and overflowed the right viewport edge — now right-anchored via #insrc-histmenu{left:auto;right:0}, with the new selector listed in chat-theme's exact-selector assertion; (2) the history-activation subject had no persisted-history-row coverage — added N9 (persisted history row posts open-chat even when absent from the active list). Smoke is a real headless-Chrome run including a viewport-boundary check for the history menu (22 assertions pass, /tmp/insrc-smoke-546198e11c24c1e3-s1.json + .png).

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-07T15:29:02.808Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-07T15:29:02.808Z)
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-11-07T15:29:02.808Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-11-07T15:29:02.808Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-07T15:29:02.808Z)
