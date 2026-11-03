<!-- insrc:artifact BUILD-8c7d75b08e02a7a8-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-01T17:38:12.992Z  ·  **Updated:** 2026-11-01T18:37:30.933Z

**Commit:** a881ec755

## Scope

Implement ISSUE-8c7d75b08e02a7a8 (keep one vector row per entity id): (a) before the plain add of first-allocated entities' vectors in writeVectorsThenMarkers, delete any rows stored for those ids (a failure leaves markers empty for the backfill); (b) reconcileEntityVectors also finds ids with more than one vector row, deletes all their rows and clears the marker so the backfill writes one, reporting duplicateIdsRepaired; (c) writeBackfillVectors deletes a vector it wrote for an entity no longer stored; (d) commitFile logs, not throws, a failed removal-vector delete after the graph commit.

## Triage rationale

bugfix (small): one module (src/db/entities.ts, src/db/lance/entity-vec.ts), clear approach, no new contract.

## Summary

The entity vector table keeps one row per id: the plain add deletes any existing rows for first-allocated ids first, the start-time reconciliation repairs ids stored twice (reported as duplicateIdsRepaired), vectors written for entities removed meanwhile are deleted, and a failed removal-vector delete no longer fails a committed change. Four tests in src/db/__tests__/vector-one-row-per-id.test.ts reproduce each path; each fix part was mutation-checked.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/db/__tests__/vector-one-row-per-id.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/__tests__/daemon-status-lanes.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/status.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/threads/__tests__/indexing-port-lanes.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/threads/__tests__/indexing-port.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/db/__tests__/file-commit.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/indexer/__tests__/backfill.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/indexer/__tests__/file-refresh.test.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
- `src/db/lance/entity-vec.ts` — **insrc-build** (2026-11-01T18:37:30.933Z)
