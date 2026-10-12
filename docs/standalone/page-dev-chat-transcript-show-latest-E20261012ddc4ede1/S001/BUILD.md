<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T07:57:44.563Z

**Commit:** 2884a6f5

## Summary

The shared fake DOM gains scrollTop, scrollHeight and clientHeight (plain numbers). The render registry gains three paging companions: forgetKeysBefore(index), withIsolatedPending(fn) (restores the live pending list also on a throw) and forgetPendingIn(nodes). Nothing uses them yet.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/PLAN.md` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-12T07:57:44.563Z)
