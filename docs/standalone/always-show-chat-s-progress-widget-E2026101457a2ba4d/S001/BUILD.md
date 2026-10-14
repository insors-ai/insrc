<!-- insrc:artifact BUILD-57a2ba4d5f18c356-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-14T19:45:09.978Z  ·  **Updated:** 2026-10-14T19:46:10.493Z

**Commit:** 0ad6fec4

## Triage rationale

Small: one module plus three test files.

## Summary

The chat's progress widget (#insrc-progress) is never hidden. It is rendered without the hidden attribute in an idle state (class 'progress idle', label 'idle'); the [hidden] CSS rule is removed; an .idle variant breathes the same three dots slowly (3.6 s, no vertical movement) and reduced motion stops it. In the webview script hideProgress is replaced by setIdle (className 'progress idle', label 'idle', timer stopped, elapsed text empty) at the same call sites (done or error, session-restored, Stop), and setProgress sets className 'progress'. Tests: chat-shell.test.ts drives the page through its states (the harness gained a stable .plabel stub for the widget) and checks it is never hidden; chat-theme.test.ts checks colours, the idle animation and reduced motion and the selector baseline (chat-theme-before.json and the added-selector list updated); chat-panel.test.ts checks one widget, not hidden, starting idle, and setIdle on done, error and Stop. A mutation check (removing setIdle from the done handler) makes the shell test fail. Full suite: 1343 pass, 2 fail (the two manifest-catalog tests that were already failing). KNOWN LIMIT, not fixed here: the page treats any done event as the end of the running turn, so an informational line's done (a retry or sign-in note) shows the idle look while a turn runs. NOT SEEN IN A REAL WEBVIEW: the idle animation's look has only been checked as CSS text and by the page-state test.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-57a2ba4d5f18c356-S001.json` — **insrc-build** (2026-10-14T19:46:10.493Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-14T19:46:10.493Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-14T19:46:10.493Z)
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-10-14T19:46:10.493Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-10-14T19:46:10.493Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-14T19:46:10.493Z)
