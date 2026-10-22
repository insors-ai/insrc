<!-- insrc:artifact BUILD-afcfa02717f5bf7d-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-22T06:26:37.927Z  ·  **Updated:** 2026-10-22T06:51:17.426Z

**Commit:** ab7c89f5

## Summary

Added LockManager.query() (synchronous, lock-free; a slot is returned only when published, and its state and acquisition/request id are re-read after its fields so a slot released or reused mid-read is left out, never torn; pending slots gained a request-id word for this), LockManager.reclaim(threadId) and watchWorker(worker). reclaim resets name claims left by the dead thread, takes over any name mutex holding its threadId + 1, removes its published holder and pending records, recomputes the lock word and pending-exclusive count from the remaining records, bumps the version (waking waiters), frees its half-written holder/pending slots, and logs each reclaimed entry as a warning. Deviation from the LLD signature: reclaim returns Promise<readonly LockInfo[]> rather than the array, because a name's mutex may be held by another worker that has also died, whose own exit event can only run if the main thread yields; a synchronous spin would hang the main thread. watchWorker captures worker.threadId at registration and reclaims through the installed manager on 'exit'.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/locks/__tests__/lock-manager.test.ts` — **insrc-build** (2026-10-22T06:51:17.426Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T06:51:17.426Z)
- `src/shared/locks/__tests__/helpers/lock-wait-worker.ts` — **insrc-build** (2026-10-22T06:51:17.426Z)
