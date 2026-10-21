<!-- insrc:artifact BUILD-86197ac660732ceb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-21T15:03:00.014Z  ·  **Updated:** 2026-10-21T15:20:58.413Z

**Commit:** b2c89fda

## Summary

Added src/daemon/threads/registry.ts (TargetRegistry: one live admin, indexing and unattributed target and one per session; unregister removes all of a thread's targets, unknown threads a no-op; targetFor resolves an identity-less session request to the unattributed target) and src/daemon/threads/status-board.ts (StatusBoard with publish, publishIndexing, publishClients, publishRun refusing shrinking frames, publishStore, snapshot and forget, using today's AttachedClient, RegisteredRepo, RepoCompleteness and UnattributedUnwritableCount shapes; statusBoardHubHandlers for the main thread and StatusBoardClient for workers). Tests in src/daemon/threads/__tests__/registry-board.test.ts, including a real worker publishing through the hub; four falsifying mutations each fail their target test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/graph/__tests__/helpers/lmdb-open-close.mjs` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/db/graph/__tests__/helpers/lmdb-worker.mjs` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/db/graph/__tests__/worker-thread-lock.test.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/db/__tests__/helpers/store-guard-worker.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/db/__tests__/store-guard.test.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/db/store-guard.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/daemon/threads/__tests__/channel.test.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/daemon/threads/__tests__/helpers/hub-worker.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/daemon/threads/__tests__/helpers/board-worker.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/daemon/threads/registry.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-21T15:20:58.413Z)
