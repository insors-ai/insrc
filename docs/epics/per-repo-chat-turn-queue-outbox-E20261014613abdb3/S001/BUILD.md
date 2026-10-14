<!-- insrc:artifact BUILD-613abdb351c2c738-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-14T11:13:11.458Z  ·  **Updated:** 2026-10-14T11:13:11.458Z

**Commit:** f6de7994

## Summary

New vscode-plugin/src/chat/chat-queue-store.ts implementing HLD sc1/sc2 as the s1 LLD specifies: node:sqlite through an injected openDatabase (a SqliteDatabase subset), the directory created, PRAGMA busy_timeout 5000, journal_mode WAL, synchronous NORMAL; schema v1 (meta with schema_version and created_by, messages, lease single-row, presence) created in one transaction, and a newer schema rejected as StoreUnavailable. Every write is BEGIN IMMEDIATE ... COMMIT with rollback; a busy wait past the timeout surfaces as StoreBusy and enqueue/resend return { ok:false, reason:'busy', note }. enqueue refuses at QUEUE_RECORD_BOUND (500) with FULL_NOTE; head() is the first queued or retrying row (a retrying head not yet due still holds the queue); acknowledge takes the free lease and marks the head processing in one transaction; finish maps done/detached-ended to delete, stopped to failed 'stopped by the user', failed to failed with its error, not-delivered to not-delivered, and clears the lease naming that message; cancel, dismiss, resend (to the back under a new turn id), attachCli, heartbeat, release, presence, leave, windowAlive; takeOver and reclaim return false until S003; dataVersion plus an own-write counter. Tests: the two named tests in chat-queue-store.test.ts, the second forking two child processes (fixtures/queue-ack-child.mts) that acknowledge the same head at once, five rounds, exactly one succeeding each time. Eight mutations of the store each failed the tests. Plugin typecheck clean.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T11:13:11.458Z)
- `vscode-plugin/src/chat/__tests__/fixtures/queue-ack-child.mts` — **insrc-build** (2026-10-14T11:13:11.458Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T11:13:11.458Z)
