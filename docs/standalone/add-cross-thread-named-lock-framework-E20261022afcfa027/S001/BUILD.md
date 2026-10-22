<!-- insrc:artifact BUILD-afcfa02717f5bf7d-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-22T06:26:37.927Z  ·  **Updated:** 2026-10-22T06:31:18.142Z

**Commit:** 045e7371

## Summary

Added LockManager.request for grants that need no wait: inside the name's mutex, exclusive is granted only when the lock word is 0 and shared only when it is >= 0 with no exclusive waiting; the holder slot is claimed by CAS (0 -> -(threadId + 1), so the main thread's claim is -1 as the plan states and a worker's claim names it for reclaim), filled and published last; a full holder table gives the lock word back. Release runs in finally. ifAvailable returns callback(null, blockedBy) with holders and pending exclusives. An AsyncLocalStorage set of held names refuses same-name and unbounded nested requests. setLockGrantHookForTests runs at three grant points. A waiting request (not ifAvailable, lock unavailable) throws until t3 adds the waiting path.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/locks/__tests__/lock-manager.test.ts` — **insrc-build** (2026-10-22T06:31:18.142Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T06:31:18.142Z)
