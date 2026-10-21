<!-- insrc:artifact BUILD-86197ac660732ceb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-21T15:03:00.014Z  ·  **Updated:** 2026-10-21T15:38:09.812Z

**Commit:** e3731fb0

## Summary

Store health is process-wide (shared health word with compare-and-swap; every reader in src/db/graph/store.ts goes through currentHealth()) and the full locks-lost record travels through the hub (src/daemon/threads/store-health-hub.ts: wireWorkerStoreHealth sends a worker's record to the main thread and takes pushes; wireMainStoreHealth keeps it and pushes it to every worker). Fixing the previous gate's finding, the hub test now buffers every worker message from the start, so a message sent before the test waits for it is never lost; it passed five runs in a row, and the worker-never-sends and main-never-fans-out mutations each fail it within 3 s.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/graph/__tests__/helpers/lmdb-open-close.mjs` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/graph/__tests__/helpers/lmdb-worker.mjs` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/graph/__tests__/worker-thread-lock.test.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/__tests__/helpers/store-guard-worker.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/__tests__/store-guard.test.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/store-guard.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/__tests__/channel.test.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/__tests__/helpers/hub-worker.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/__tests__/helpers/board-worker.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/registry.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/graph/__tests__/helpers/health-worker.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/graph/__tests__/store-health-threads.test.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/daemon/threads/store-health-hub.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
- `src/db/graph/__tests__/helpers/health-hub-worker.ts` — **insrc-build** (2026-10-21T15:38:09.812Z)
