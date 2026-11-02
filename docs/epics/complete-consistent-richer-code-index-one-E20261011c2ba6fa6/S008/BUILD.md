<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T09:39:41.527Z

**Commit:** 90a7d68c2

## Summary

Added runSubsystemPass (src/indexer/subsystem-pass.ts), without summaries; t4 adds those. It runs only when readIndexState(repo).graphComplete holds, and does nothing when the stored computedAtGeneration equals the generation. It builds the file graph from the stored IMPORTS/CALLS/INHERITS/IMPLEMENTS/REFERENCES out of each code file's entities and file entity, keeping only targets among the repository's own code files. Weights are by kind (inheritance 2, the rest 1) times evidence (extracted 1, inferred/chosen 0.8, unknown 0.6, model 0.5), plus 0.1 same-directory edges. It groups with groupSubsystems and writes the set stamped with the generation, with entity counts per subsystem. Found while testing: the TypeScript reader records no call named `parse` (outside s8; noted for follow-up).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/indexer/__tests__/subsystem-grouping.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/indexer/subsystems.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/indexer/__tests__/subsystem-pass.test.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-02T09:39:41.527Z)
