<!-- insrc:artifact BUILD-86197ac660732ceb-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-29T08:13:45.184Z  ·  **Updated:** 2026-10-29T09:08:08.853Z

**Commit:** 450e019d0

## Summary

ac4-ac6 over the real threaded daemon in s4-acceptance.test.ts. ac5 uses 100 status calls (with short pauses so elapsedMs visibly grows) rather than s3's 200, and checks liveness through createIpcClient with the test daemon's socket. ac6 boots a second daemon with daemon.threads.enabled false and compares field names and value types of daemon.status and daemon.debug-status and the client entry's keys. Mutations (router not publishing busy, an extra status field) fail ac5 and ac6.

## Tasks validated

- ✓ `t5`
- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/lazy-runtime.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/lazy-runtime.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-2.json` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/router-thread-view.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/admin-status.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/session-failure.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/session-pool.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/supervisor-track.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/indexing-workers.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/session-pool.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/session-routing.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/supervisor.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/helpers/daemon-socket.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/s4-acceptance.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
- `src/daemon/threads/__tests__/supervisor.test.ts` — **insrc-build** (2026-10-29T09:08:08.853Z)
