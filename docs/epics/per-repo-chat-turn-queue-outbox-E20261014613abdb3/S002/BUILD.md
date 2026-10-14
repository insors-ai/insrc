<!-- insrc:artifact BUILD-613abdb351c2c738-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-14T12:57:26.478Z  ·  **Updated:** 2026-10-14T12:59:57.549Z

**Commit:** 4a614086

## Summary

vscode-plugin/src/chat/chat-queue-worker.ts: ChatQueueWorker.act(seq, 'cancel' | 'dismiss' | 'resend') -> { ok: true } | { ok: false; note } (AMD-3): cancel -> store.cancel, refused with ACTION_NOTES.started when the row is processing, else ACTION_NOTES.gone; dismiss -> store.dismiss; resend -> store.resendFrom(seq, newTurnId(), claim.windowKey) with the store's note on refusal; StoreBusy and other throws become a note (BUSY_NOTE or 'could not change'), never thrown; on success it schedules an immediate tick so onChange fires at once. QueuedTurnRunner.run gains optional onWaiting(on) (AMD-8); runMessage passes a handler that, for the running message only, calls store.markWaiting(seq, on) and keeps a failed write as pendingWaiting, written on the next tick while that message still runs and dropped when it ends. chat-queue-store.ts finish now also clears waiting_on, so the card ends with the run (found by the onWaiting test: a stopped message kept the flag). Tests: two named tests in chat-queue-worker.test.ts over a real file and fake timers; the busy write uses a store whose markWaiting throws StoreBusy once. Mutations: removing the immediate tick, resending with the old key, and dropping the retry each fail a test; removing the running-message guard in the onWaiting handler does not, because markWaiting itself refuses rows that are not processing, so the guard only skips a write the store would refuse. Plugin suite: 1292 tests, 1282 pass, 8 skipped, 2 fail (the pre-existing manifest-catalog failures). Typecheck clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-613abdb351c2c738-s2.json` — **insrc-build** (2026-10-14T12:59:57.549Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T12:59:57.549Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T12:59:57.549Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T12:59:57.549Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T12:59:57.549Z)
