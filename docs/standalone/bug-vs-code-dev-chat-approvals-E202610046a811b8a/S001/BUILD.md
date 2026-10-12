<!-- insrc:artifact BUILD-6a811b8acca60ac5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T05:58:45.405Z  ·  **Updated:** 2026-10-12T06:15:46.832Z

**Commit:** 283285a0

## Summary

Approval requests from a run or a followed turn go through the queue and only the head card is posted ('1 of N' via approval-position). Stop rejects the waiting requests; a chat switch or dispose drops them. The decision handler rewrite and the approval-position message landed in t3 because the '1 of N' check needed them. The followed turn's end now ends its batch (fixed in t4), and the strengthened test asserts exactly one follow-up after that turn ends.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-6a811b8acca60ac5-S001.json` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/approval-queue.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-12T06:15:46.832Z)
