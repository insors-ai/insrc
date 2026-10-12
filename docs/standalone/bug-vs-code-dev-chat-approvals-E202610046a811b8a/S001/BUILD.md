<!-- insrc:artifact BUILD-6a811b8acca60ac5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T05:58:45.405Z  ·  **Updated:** 2026-10-12T06:20:06.387Z

**Commit:** f45c06ca

## Summary

The approval card shows '1 of N' beside its title when more requests wait behind it, and is unchanged otherwise. The registry keeps the shown cards by requestId so the webview's approval-position handler updates the label in place (an unknown id is ignored). The card's meta carries position/total. postInitialState re-posts the queue head once, after session-restored, so a reloaded webview can still answer the queue. The protocol message itself landed in t3.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-6a811b8acca60ac5-S001.json` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/approval-queue.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-12T06:20:06.387Z)
