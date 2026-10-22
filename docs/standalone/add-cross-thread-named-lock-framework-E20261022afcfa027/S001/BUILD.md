<!-- insrc:artifact BUILD-afcfa02717f5bf7d-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-22T06:26:37.927Z  ·  **Updated:** 2026-10-22T06:28:21.549Z

**Commit:** 3d2d982b

## Summary

Added src/shared/locks/lock-manager.ts: the lock block layout (header capacities, name table, per-name lock/pending-exclusive/version/mutex words, holder and pending tables), createLockBlock, LockManager.resolveName, the four error classes, argument validation and installLockManager/getLockManager. Name slots are claimed by CAS from free to -(claimer threadId + 1), filled and published READY last; a resolver never passes a slot another thread is still claiming, so one name maps to one slot, and reclaim can reset a claim left by a dead thread.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/locks/__tests__/lock-manager.test.ts` — **insrc-build** (2026-10-22T06:28:21.549Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T06:28:21.549Z)
