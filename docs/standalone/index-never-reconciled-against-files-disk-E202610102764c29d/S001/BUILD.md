<!-- insrc:artifact BUILD-2764c29d7ccb66a5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T15:41:06.406Z  ·  **Updated:** 2026-10-10T15:48:18.037Z

**Commit:** f9041216

## Summary

Implemented reconcileRepo and the `reconcile` job in src/indexer/index.ts: stale files (absent by ENOENT or ENOTDIR, or excluded by the repository's ignore list) lose this repository's entities and unresolved relations; the job then runs the resolver once and removes the repository's cached exploration results. A create or update file job now skips an ignored file. The presence check is an optional last constructor argument. Sixteen mutations of the pass were each caught by a test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-2764c29d7ccb66a5-S001.json` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/daemon/__tests__/queue-depth-for-repo.test.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/db/__tests__/entity-files-for-repo.test.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/db/relations.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-10T15:48:18.037Z)
