<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T08:07:28.254Z

**Commit:** 67e6d06e

## Summary

The chat shell embeds the pager: it is created before the registry and handed it; line(), renderDiff and the approval card append through pager.append, so nothing else writes the transcript's scroll position; session-restored resets the pager and replays rows keyed and stamped by absolute index; transcript-page goes to prepend; live rows and the user row are tracked with their row index; the 'load earlier' bar sits above the transcript; the provider lock settles from total. The three shell-text pins are updated in this task. Beyond the plan's text pins, a new chat-shell.test.ts runs the real inline script against the shared fake DOM and drives it with host messages (windowed restore, page request, a live row while scrolled up, trimming a long active session). The host still sends the whole transcript.

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

- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/PLAN.md` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/transcript-pager.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-12T08:07:28.254Z)
