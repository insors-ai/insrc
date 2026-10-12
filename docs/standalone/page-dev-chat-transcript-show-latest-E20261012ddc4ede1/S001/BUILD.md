<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T08:00:24.231Z

**Commit:** 31ac8a7f

## Summary

Adds transcript-pager.ts, the webview pager as an embeddable source: append(node) follows to the bottom only when the view was already there; stamp/track mark each node with its row index; trimIfNeeded removes the oldest nodes above 300 held rows when at the bottom, back to a user row leaving about 200, with a plain cut when there is no turn start to cut at, and forgets the removed rows' keys and pending tool entries; reset sets the window for a restore. Sizes are fixed constants. Tests drive the real registry on the shared fake DOM. The shell does not embed it yet. reset takes the session id as well as the index and total, since the next task needs it to match pages.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/PLAN.md` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/transcript-pager.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-12T08:00:24.231Z)
