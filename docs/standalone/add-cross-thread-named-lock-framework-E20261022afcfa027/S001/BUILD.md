<!-- insrc:artifact BUILD-afcfa02717f5bf7d-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-22T06:26:37.927Z  ·  **Updated:** 2026-10-22T06:56:52.979Z

**Commit:** 0d068449

## Summary

Added src/shared/locks/__tests__/lock-manager-threads.test.ts and helper worker helpers/lock-ops-worker.ts (scripted hold/release/probe/query/nested ops, and a pause-at op that blocks the worker at a chosen grant point via the t2 hook so the test can terminate it there). Nine tests over real worker_threads sharing one block prove every integration subject of the LLD's test strategy, including the measured wake gap (< 50 ms between one worker's release and another's grant) and termination at each of the three grant points with watchWorker reclaim. Ran stable 4 times; mutants (late threadId in watchWorker, no mutex takeover, no recount) each fail tests here.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/locks/__tests__/lock-manager.test.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
- `src/shared/locks/__tests__/helpers/lock-wait-worker.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
- `src/daemon/threads/__tests__/helpers/store-worker.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
- `src/daemon/threads/__tests__/worker-stores.test.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
- `src/shared/locks/__tests__/helpers/lock-ops-worker.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
- `src/shared/locks/__tests__/lock-manager-threads.test.ts` — **insrc-build** (2026-10-22T06:56:52.979Z)
