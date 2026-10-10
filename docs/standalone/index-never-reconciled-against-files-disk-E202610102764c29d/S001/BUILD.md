<!-- insrc:artifact BUILD-2764c29d7ccb66a5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T15:41:06.406Z  ·  **Updated:** 2026-10-10T15:50:33.460Z

**Commit:** 4268017d

## Summary

start() enqueues a `reconcile` job for each ready repository (whether or not the delta found changes) and for one stored as indexing with a last-indexed time, and none beside a full job. fullIndex() runs reconcileRepo after the files are indexed and before the cross-file resolver. Seven mutations of the wiring were each caught by a test. Note: the state `indexing` with a last-indexed time cannot be produced by fullIndex today, because updateRepoStatus clears the time; the rule is built as the design states it and its test hands the state to start() directly.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-2764c29d7ccb66a5-S001.json` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/daemon/__tests__/queue-depth-for-repo.test.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/db/__tests__/entity-files-for-repo.test.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/db/relations.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-10T15:50:33.460Z)
