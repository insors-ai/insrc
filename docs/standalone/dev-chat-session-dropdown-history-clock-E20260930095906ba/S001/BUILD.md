# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-09-30T14:11:54.979Z  ·  **Updated:** 2026-09-30T15:10:03.944Z

## Scope

Fix ISSUE-095906bac5bbacaf: the dev-chat webview's CSP (chat-panel.ts renderShell) declares no img-src, so it inherits default-src 'none' and blocks the .chrome #insrc-history data:image/svg+xml background layer — the session dropdown shows only the gradient down-arrow plus an empty 20px gutter. Permit inline data: images in that CSP, keeping default-src 'none', nonce-only script-src, style-src unchanged, and no remote origin loadable. Add regression coverage that ties the glyph's declared image source to the CSP's image policy as ONE invariant (so a blocked-but-declared icon fails the suite), and keep the existing single-nonced-script and no-remote-http(s)-resource assertions green.

## Triage rationale

bugfix / small magnitude. One production file (the single CSP literal in renderShell) plus its test. No new asset, symbol, or style rule — the glyph markup and CSS already ship at HEAD. Sized above trivial because the edit relaxes a security header, so it must stay narrowly scoped (data: only, no remote) and be gated by a test rather than applied mechanically.

## Tasks validated

- ✗ `S001`

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-09-30T14:15:55.524Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-09-30T14:15:55.524Z)
