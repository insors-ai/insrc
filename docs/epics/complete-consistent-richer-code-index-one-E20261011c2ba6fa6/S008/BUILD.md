<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T09:33:49.424Z

**Commit:** 98f28962f

## Summary

Added groupSubsystems (src/indexer/subsystems.ts), a pure, deterministic Louvain-style modularity grouping of a file graph. Local moves visit nodes in path order, and a tie within 1e-12 goes to the smaller group. Aggregation numbers groups by their first member and repeats until nothing moves. There is no randomness. Ids are the sha256 of the sorted members (hex-32); names are the longest common directory, or the file's own path for a single file. Connections sum relationship edges and their kind counts, following edge direction, and leave out the kind-less same-directory edges. directoryEdges builds those 0.1 same-directory edges for the pass to use.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/indexer/__tests__/subsystem-grouping.test.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
- `src/indexer/subsystems.ts` — **insrc-build** (2026-11-02T09:33:49.424Z)
