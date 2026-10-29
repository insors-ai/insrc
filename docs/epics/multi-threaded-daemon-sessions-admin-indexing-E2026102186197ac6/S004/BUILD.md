<!-- insrc:artifact BUILD-86197ac660732ceb-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-29T08:13:45.184Z  ·  **Updated:** 2026-10-29T08:57:00.353Z

**Commit:** 0dc785949

## Summary

Supervisor.track and allowRestart (replace() now uses allowRestart); SessionPool hands each created worker to onCreated (via the start dep's onCreated) and asks restarted before the shared-state worker's restart after an exit; startSessionRouting wires both to the supervisor; the document-summary worker is published (role document-summary) on start and forgotten on exit. Also fixes an s3 gap the tracking exposed: maintenance now asks the session pool's workers to close their graph handles before compacting (they were never asked; the threads-boot maintenance test failed once they were counted and passes with the fix).

## Tasks validated

- ✓ `t5`
- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/__tests__/lazy-runtime.test.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/lazy-runtime.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-2.json` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/__tests__/router-thread-view.test.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/__tests__/admin-status.test.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/__tests__/session-failure.test.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/__tests__/session-pool.test.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/__tests__/supervisor-track.test.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/indexing-workers.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/session-pool.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/session-routing.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
- `src/daemon/threads/supervisor.ts` — **insrc-build** (2026-10-29T08:57:00.353Z)
