<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-01T13:16:17.185Z  ·  **Updated:** 2026-11-01T15:20:26.985Z

**Commit:** 4741a5bb6

## Summary

reembed jobs run in a third IndexQueue lane ('backfill') beside the index lane (user decision); the lane is published on the status board as an optional backfill slot and counted in daemon.status queue depth / idle and the indexing port. Queue, thread and status suites pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/__tests__/relations-in-txn.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/__tests__/file-commit-types.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/__tests__/file-commit.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/__tests__/file-commit-vectors.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/graph/index-state-rows.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/indexer/__tests__/full-index-rebuild.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/lance/entity-vec.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/db/index-state.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/indexer/__tests__/file-refresh.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/daemon/status.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-11-01T15:20:26.985Z)
