<!-- insrc:artifact BUILD-86197ac660732ceb-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-29T08:13:45.184Z  ·  **Updated:** 2026-10-29T08:46:15.357Z

**Commit:** 35b52305d

## Summary

The router keeps a per-thread in-flight map and publishes ThreadStatus (role, cls, session, busy, oldest method/since, FIFO queued) on attach, send, end (reply, terminal frame, lifetime completion, cancel of a stream without a lifetime) and FIFO changes; detach forgets the thread and publishes nothing for an unattached thread. Deviation from the LLD's roleOf option: role, class and session are read from the target registry the router already holds (registry.targets()), so no roleOf option is needed. Wired in index.ts with threadServices.board.

## Tasks validated

- ✓ `t5`
- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/daemon/threads/__tests__/lazy-runtime.test.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/daemon/threads/lazy-runtime.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-2.json` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/daemon/threads/__tests__/router-thread-view.test.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-29T08:46:15.357Z)
