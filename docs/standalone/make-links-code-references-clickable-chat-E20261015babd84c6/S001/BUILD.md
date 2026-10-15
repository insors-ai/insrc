<!-- insrc:artifact BUILD-babd84c6e2fb480a-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-15T05:44:51.534Z  ·  **Updated:** 2026-10-15T08:17:53.430Z

**Commit:** 32d6f3b9

## Summary

Links and code references are clickable in the chat and the review pane. A shared link step (vscode-plugin/src/chat/link-markup.ts) wraps code references and moves http(s) addresses to data-url with no href; one delegated click posts open-link or open-code-ref; and a host opener (vscode-plugin/src/chat/link-opener.ts) validates the target and opens it, in the review pane's editor group, else Beside. The path check is shared with the companion reader through resolveWithin (vscode-plugin/src/chat/companion-reader.ts). The browser open is vscode.env.openExternal, documented at https://code.visualstudio.com/api/references/vscode-api#env (click this link in the review pane to check it opens once).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/__tests__/link-markup.test.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/__tests__/link-opener.test.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/__tests__/resolve-within.test.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/companion-reader.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/link-markup.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/link-opener.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-15T08:17:53.430Z)
