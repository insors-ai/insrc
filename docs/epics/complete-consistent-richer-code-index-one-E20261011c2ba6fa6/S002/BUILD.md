<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-01T13:16:17.185Z  ·  **Updated:** 2026-11-01T14:50:54.848Z

**Commit:** 931502767

## Summary

Rows are committed with an empty embedding marker when a vector write follows; writeVectorsThenMarkers writes the vectors (add only for an entity first allocated in that commit, upsert otherwise) and sets the markers to the active (configured) embedding model in a second transaction; failures leave markers empty and are reported as vectorsOutstanding; updateEmbedding writes vector (upsert) then marker; embedEntities no longer sets entity.embeddingModel (931502767). db, indexer and related daemon suites pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/db/__tests__/relations-in-txn.test.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/db/__tests__/file-commit-types.test.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/db/__tests__/file-commit.test.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/db/__tests__/file-commit-vectors.test.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-11-01T14:50:54.848Z)
