<!-- insrc:artifact BUILD-86197ac660732ceb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-21T15:03:00.014Z  ·  **Updated:** 2026-10-21T15:03:00.014Z

**Commit:** b038c9e4

## Summary

Added the gating test src/db/graph/__tests__/worker-thread-lock.test.ts (with helpers lmdb-worker.mjs and lmdb-open-close.mjs): on a temporary store with the daemon's open options, a real worker thread opens, reads, writes, closes and exits, another process opens and closes, and a separate-process lock check finds the daemon's lock held at every step while the daemon keeps writing. A control test shows the check reports a dropped lock after a stray descriptor on the lock file is closed. Both tests fail under their falsifying mutations (lock dropped mid-sequence; check that always says held). The gate passes, so the Story continues with graph direct.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/graph/__tests__/helpers/lmdb-open-close.mjs` — **insrc-build** (2026-10-21T15:03:00.014Z)
- `src/db/graph/__tests__/helpers/lmdb-worker.mjs` — **insrc-build** (2026-10-21T15:03:00.014Z)
- `src/db/graph/__tests__/worker-thread-lock.test.ts` — **insrc-build** (2026-10-21T15:03:00.014Z)
