<!-- insrc:artifact BUILD-613abdb351c2c738-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-14T11:13:11.458Z  ·  **Updated:** 2026-10-14T11:15:59.550Z

**Commit:** b2e1abe7

## Summary

New vscode-plugin/src/chat/chat-queue-worker.ts implementing HLD sc4 as the s1 LLD specifies: QueuedTurnRunner, ChatQueueWorker (submit, onChange, liveSessionIds, running, dispose) and createChatQueueWorker(deps: store, claim, runner, isAlive, now, timers, log, newTurnId). It refreshes presence every LEASE_HEARTBEAT_MS, polls every 500 ms while the queue has rows or a message runs and every 5 s otherwise, emits onChange when data_version or the store's own-write counter changes (so its own writes count too), acknowledges the head only when it is this window's and due, runs it with onSpawn calling attachCli, heartbeats the lease every 5 s while it runs, treats a rejecting runner as failed with acted=true, and finishes and releases; a failed finish is kept pending and retried on each poll before any new message is taken. dispose stops the timers, leaves presence, and finishes and releases a held lease whose CLI is gone (isAlive), leaving one whose CLI still runs. Test: the named test over a real queue file with two windows' stores and fake timers. Mutations: 7 of 8 failed the test; the eighth (dropping the pending-finish guard before acknowledging) is equivalent, because the pending finish leaves the lease held and acknowledge refuses. Plugin typecheck clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T11:15:59.550Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T11:15:59.550Z)
- `vscode-plugin/src/chat/__tests__/fixtures/queue-ack-child.mts` — **insrc-build** (2026-10-14T11:15:59.550Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T11:15:59.550Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T11:15:59.550Z)
