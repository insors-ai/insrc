<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-01T13:16:17.185Z  ·  **Updated:** 2026-11-01T15:04:42.397Z

**Commit:** 7c3e1dd09

## Summary

reconcileEntityVectors deletes vectors whose entity is not stored and clears the marker (counting it unembedded) of entities marked embedded without a vector; IndexerService.start runs it before any job. db+indexer suites 954/954.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/__tests__/relations-in-txn.test.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/__tests__/file-commit-types.test.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/__tests__/file-commit.test.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/__tests__/file-commit-vectors.test.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/graph/index-state-rows.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/indexer/__tests__/full-index-rebuild.test.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/db/lance/entity-vec.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T15:04:42.397Z)
