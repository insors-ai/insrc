<!-- insrc:artifact BUILD-6a811b8acca60ac5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T05:58:45.405Z  ·  **Updated:** 2026-10-12T06:17:50.408Z

**Commit:** ecac0875

## Summary

A non-empty typed submit first supersedes the queue: each waiting in-turn request is answered 'deny' to the live provider, every waiting request is recorded as rejected, and the queue is cleared (which resets the grant chain). Then the message runs as a normal turn.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-6a811b8acca60ac5-S001.json` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/approval-queue.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-12T06:17:50.408Z)
