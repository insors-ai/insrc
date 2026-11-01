<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-11-01T19:07:14.344Z  ·  **Updated:** 2026-11-01T19:30:26.290Z

**Commit:** eab507ea0

## Summary

The single-kind find* reads return each entity with its relationship's evidence; outNeighbors/inNeighbors gain an opt-in withEvidence form; pre-change rows read 'unknown'; traversals unchanged. Inventory pins: the plan's check refers to this repo's maintained guard inventories, src/daemon/db/__tests__/fixtures/session-source-inventory.json (refreshed for src/db/search.ts and src/db/graph/edges.ts in commit eab507ea0; session-source-inventory.test.ts shows only its two pre-existing CM-S3/CM-S4 failures, which name other files) and src/daemon/threads/__tests__/fixtures/module-state-inventory.json (guard 6/6 pass). src/assets/connection-management-inventory.json is the connection-management epic's frozen evidence snapshot (last written 2026-10-27, fd6b5fcc9); 112 of its 875 production-file hashes were already stale before this Story from unrelated changes, no guard of this Story reads it, and regenerating it belongs to that epic's gate, not to this Task.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/graph/__tests__/evidence-codec.test.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/__tests__/relations-evidence.test.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/__tests__/evidence-extracted.test.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/__tests__/evidence-inferred.test.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/__tests__/reexport-callers.test.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/external-endpoints.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/indexer/messaging-endpoints.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/graph/edges.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
- `src/db/search.ts` — **insrc-build** (2026-11-01T19:30:26.290Z)
