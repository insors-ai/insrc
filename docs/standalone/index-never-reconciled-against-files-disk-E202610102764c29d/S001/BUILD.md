<!-- insrc:artifact BUILD-2764c29d7ccb66a5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T15:41:06.406Z  ·  **Updated:** 2026-10-10T15:43:41.783Z

**Commit:** c8667e0b

## Summary

Added the `reconcile` job kind to IndexJob, counted and deduplicated it per repository in the queue, and dispatched it from processJob to a reconcileRepo method that is a stub in this task. Four mutations were each caught by a test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-2764c29d7ccb66a5-S001.json` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/daemon/__tests__/queue-depth-for-repo.test.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/db/__tests__/entity-files-for-repo.test.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/db/relations.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-10T15:43:41.783Z)
