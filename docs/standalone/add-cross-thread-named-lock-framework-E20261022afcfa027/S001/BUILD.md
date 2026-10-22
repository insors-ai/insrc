<!-- insrc:artifact BUILD-afcfa02717f5bf7d-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-22T06:26:37.927Z  ·  **Updated:** 2026-10-22T06:53:26.729Z

**Commit:** 3e28b52e

## Summary

DaemonWorkerInit gained a required lockBlock beside guardBlock, and startDaemonWorker installs it with installLockManager, so every daemon worker shares the main thread's named locks. The worker-stores test and its helper worker pass a lock block; the helper gained a lock-probe op, and a new test shows a daemon worker refused (with the main thread named as holder) while the main thread holds the lock shared, then granted after release. Checked by hand: tsc --noEmit rejects a startDaemonWorker call without lockBlock (TS2345 'Property lockBlock is missing'), using a temporary probe file under src/daemon/threads that was then removed (tsc excludes __tests__, so the test callers themselves are not typechecked); removing the install line makes the contention test fail.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/locks/__tests__/lock-manager.test.ts` — **insrc-build** (2026-10-22T06:53:26.729Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T06:53:26.729Z)
- `src/shared/locks/__tests__/helpers/lock-wait-worker.ts` — **insrc-build** (2026-10-22T06:53:26.729Z)
- `src/daemon/threads/__tests__/helpers/store-worker.ts` — **insrc-build** (2026-10-22T06:53:26.729Z)
- `src/daemon/threads/__tests__/worker-stores.test.ts` — **insrc-build** (2026-10-22T06:53:26.729Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T06:53:26.729Z)
