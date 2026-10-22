<!-- insrc:artifact BUILD-00d80121c593053c-s1 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-15T09:07:53.194Z  ·  **Updated:** 2026-10-15T09:37:05.780Z

**Commit:** 9e31763f

## Summary

Diffs in the chat's diff widget are coloured by syntax and open the file at the clicked line. highlight.js core plus a fixed language subset is bundled as its own generated module (webview-hljs.ts, 69 KB of a 250 KB budget) and loaded in the chat shell only; each side of a diff section is tokenised separately and the lines are built from text nodes and class-named spans, never assigned markup, with a plain-text fallback. Token colours reuse the chat's existing theme variables. A diff line or the header path posts open-code-ref through the links story's sink and host opener. One departure from the LLD wording, approved in the plan: the shared fake DOM gained a textOf helper instead of a children-joining textContent getter, because the getter change broke 11 unrelated UX-card tests. Live checks were run by the user in VS Code; scope in the evidence.

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

- `.insrc/artifacts/CR-00d80121c593053c-s1.json` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `.insrc/artifacts/PLAN-00d80121c593053c-s1.json` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `docs/standalone/add-syntax-highlighting-chat-diff-widget-E2026101500d80121/S001/CR.md` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `docs/standalone/add-syntax-highlighting-chat-diff-widget-E2026101500d80121/S001/PLAN.md` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/gen-webview-libs.mjs` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/diff-click.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/link-markup.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/__tests__/webview-hljs.test.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/diff-highlight.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
- `vscode-plugin/src/chat/webview-hljs.ts` — **insrc-build** (2026-10-15T09:37:05.780Z)
