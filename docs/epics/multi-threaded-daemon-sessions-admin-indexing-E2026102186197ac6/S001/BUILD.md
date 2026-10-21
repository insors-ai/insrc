<!-- insrc:artifact BUILD-86197ac660732ceb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-21T15:03:00.014Z  ·  **Updated:** 2026-10-21T15:16:42.801Z

**Commit:** e61cc5a3

## Summary

Added src/db/store-guard.ts: a process-wide SharedArrayBuffer block (permit counter and health word per store, per-acquisition holder records with thread id and time), and StoreGuard with withStore (asynchronous Atomics.waitAsync wait with time limit and abort signal, release in finally, a per-thread arrival-order queue, nesting refused per async call chain via AsyncLocalStorage), policy (graph and lance direct, duckdb guarded with one permit), holders, reclaim (waits for a per-store quiescence probe, marks the store unhealthy past limitMs) and quiescence, plus installStoreGuard/getStoreGuard. Nothing calls withStore yet (t5/t6 wire the stores). Tests in src/db/__tests__/store-guard.test.ts with a real worker in helpers/store-guard-worker.ts; four falsifying mutations (no release in finally, no nesting check, timeout naming no holder, reclaim ignoring quiescence) each fail a test. Left out: cross-thread fairness beyond arrival order on each thread.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/graph/__tests__/helpers/lmdb-open-close.mjs` — **insrc-build** (2026-10-21T15:16:42.801Z)
- `src/db/graph/__tests__/helpers/lmdb-worker.mjs` — **insrc-build** (2026-10-21T15:16:42.801Z)
- `src/db/graph/__tests__/worker-thread-lock.test.ts` — **insrc-build** (2026-10-21T15:16:42.801Z)
- `src/db/__tests__/helpers/store-guard-worker.ts` — **insrc-build** (2026-10-21T15:16:42.801Z)
- `src/db/__tests__/store-guard.test.ts` — **insrc-build** (2026-10-21T15:16:42.801Z)
- `src/db/store-guard.ts` — **insrc-build** (2026-10-21T15:16:42.801Z)
