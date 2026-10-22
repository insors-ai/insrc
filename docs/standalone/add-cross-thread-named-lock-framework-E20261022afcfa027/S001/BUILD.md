<!-- insrc:artifact BUILD-afcfa02717f5bf7d-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-22T06:26:37.927Z  ·  **Updated:** 2026-10-22T06:46:38.033Z

**Commit:** 50770364

## Summary

Added the waiting path to LockManager.request. A request that cannot be granted first waits behind this thread's earlier requests for the name. It then registers a pending record, inside the name's mutex in the same critical section as the failed grant check: the slot is claimed by CAS to -(threadId + 1) and published last, and an exclusive request increments the pending-exclusive count. It then waits with Atomics.waitAsync on the version word, which it re-arms at least every 60 s, with a keep-alive timer for the length of each wait. On a timeout or abort it withdraws the record and the count and rejects with LockTimeoutError (naming the holders) or signal.reason. An already-aborted signal is refused before the name is even resolved, and a full pending table gives LockCapacityError('pending'). A helper worker proves the keep-alive.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/locks/__tests__/lock-manager.test.ts` — **insrc-build** (2026-10-22T06:46:38.033Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T06:46:38.033Z)
- `src/shared/locks/__tests__/helpers/lock-wait-worker.ts` — **insrc-build** (2026-10-22T06:46:38.033Z)
