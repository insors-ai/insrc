<!-- insrc:artifact BUILD-86197ac660732ceb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-21T15:03:00.014Z  ·  **Updated:** 2026-10-21T15:41:11.904Z

**Commit:** a43e7eeb

## Summary

src/db/lance/conn.ts now connects with readConsistencyInterval 0, so a connection sees writes committed through another thread's connection. src/daemon/db/duckdb-pool.ts withConnection runs inside getStoreGuard().withStore('duckdb', ...) with a 10-minute permit wait, so each thread's in-memory instance is used one query at a time across the process (no withConnection call nests inside another). Found and fixed in src/db/store-guard.ts while testing: a pending Atomics.waitAsync does not keep a thread's event loop alive, so a thread whose only work was waiting for a permit exited silently; a timer now holds it for the length of the wait. Tests in src/db/__tests__/cross-thread-stores.test.ts use real workers; the existing duckdb-pool, duckdb-file-driver, duckdb-converted-driver, conn, artifact-vec, entity-vec and cleanup suites pass. Mutations (interval unset, guard bypassed, no keep-alive) each fail their target test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/graph/__tests__/helpers/lmdb-open-close.mjs` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/graph/__tests__/helpers/lmdb-worker.mjs` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/graph/__tests__/worker-thread-lock.test.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/__tests__/helpers/store-guard-worker.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/__tests__/store-guard.test.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/store-guard.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/__tests__/channel.test.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/__tests__/helpers/hub-worker.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/__tests__/helpers/board-worker.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/registry.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/graph/__tests__/helpers/health-worker.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/graph/__tests__/store-health-threads.test.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/threads/store-health-hub.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/graph/__tests__/helpers/health-hub-worker.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/daemon/db/duckdb-pool.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/__tests__/cross-thread-stores.test.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/__tests__/helpers/duckdb-query-worker.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/__tests__/helpers/lance-reader-worker.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-21T15:41:11.904Z)
