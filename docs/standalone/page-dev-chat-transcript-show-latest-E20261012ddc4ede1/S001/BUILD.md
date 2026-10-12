<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T08:19:18.794Z

**Commit:** 5ffdeb6a

## Summary

postRestored, the one helper every session-restored goes through (open, adopt, ready, new-chat, open-chat), now sends only the latest window cut by latestWindow, as a copy, with its firstIndex and the transcript's total. No existing test asserted a whole long transcript, so none needed changing; four new tests cover the window, the three restore sites, a reload after older pages were loaded, and the stored session staying byte-for-byte unchanged.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/CR.md` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/PLAN.md` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/transcript-pager.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-12T08:19:18.794Z)
