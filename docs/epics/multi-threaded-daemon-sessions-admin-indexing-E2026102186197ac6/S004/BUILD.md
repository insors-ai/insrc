<!-- insrc:artifact BUILD-86197ac660732ceb-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-29T08:13:45.184Z  ·  **Updated:** 2026-10-29T09:03:25.232Z

**Commit:** 1ef5e8603

## Summary

ac1 and ac3 run against the real threaded daemon over its socket (s4-acceptance.test.ts with a shared spawn/socket helper). ac2 runs with real workers but not over the socket: the socket cannot target the admin, indexing or summary worker (every test.* method is session-class), so admin, code-indexing and document-summary failures are checked in the supervisor harness (router and indexing workers now given the board) and session and shared-state failures in the session-failure harness. A mutation building the runtime at boot fails ac1.

## Tasks validated

- ✓ `t5`
- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/lazy-runtime.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/lazy-runtime.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-2.json` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/router-thread-view.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/admin-status.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/session-failure.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/session-pool.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/supervisor-track.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/indexing-workers.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/session-pool.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/session-routing.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/supervisor.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/helpers/daemon-socket.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/s4-acceptance.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
- `src/daemon/threads/__tests__/supervisor.test.ts` — **insrc-build** (2026-10-29T09:03:25.232Z)
