<!-- insrc:artifact BUILD-7fefc3fc5c51793e-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T06:59:58.048Z  ·  **Updated:** 2026-10-13T06:59:58.048Z

**Commit:** f2289cf0

## Triage rationale

One story in one module with one clear approach: the approved spec fixes which theme variable each component uses.

## Summary

The dev chat's named colours now hold VS Code theme variables, and every fixed colour, tint and decorative gradient in the shell style, the row renderer style and the chat's markdown tokens is replaced by a name; the colour scheme follows the theme kind; the history chip is a wrapper whose glyph is a mask in the text colour; the whole chat uses the editor's monospace font. Both review findings were built in (inline code has its own ground; both history-chip tests were rewritten). Differences from the approved design, all on the user's instructions or noted to them: one derived colour (the assistant message's ground is the editor background mixed with 10% black, decided by the user on 2026-10-13 after their theme showed borders with no contrast); both message bubbles use the chat request border; a diff line takes the theme's diff outline, transparent outside high contrast (two theme variables beyond the mapping); the unused name --bg-alt was removed. The docs-review 'rendered document' subject is proven by fingerprints of the shared sheet and the docs-review markdown rules plus the panel's imports, not by rendering the panel.

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-5ff61e5fdca3875d-S001.json` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `.insrc/artifacts/TESTS-5ff61e5fdca3875d-S001.json` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `.insrc/build-start/5ff61e5fdca3875d-S001.json` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `docs/standalone/5ff61e5fdca3875d-E202610135ff61e5f/S001/BUILD.md` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `docs/standalone/5ff61e5fdca3875d-E202610135ff61e5f/S001/TESTS.md` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `vscode-plugin/src/chat/markdown-style.ts` — **insrc-build** (2026-10-13T06:59:58.048Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-13T06:59:58.048Z)
