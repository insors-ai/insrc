<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-11-01T19:07:14.344Z  ·  **Updated:** 2026-11-01T19:52:06.282Z

**Commit:** 14cf172cc

## Summary

usage.example hits carry evidence and the result states the origin counts in a quotable sentence (unknown never presented as read from the source); class.hierarchy and import.graph carry evidence per item / per file.

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

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/graph/__tests__/evidence-codec.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/__tests__/relations-evidence.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/__tests__/evidence-extracted.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/__tests__/evidence-inferred.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/__tests__/reexport-callers.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/external-endpoints.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/indexer/messaging-endpoints.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/graph/edges.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/db/search.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/daemon/__tests__/search-evidence-rpc.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/daemon/tools/builtins/graph/index.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/analyze/explore/__tests__/evidence-lookups.test.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-11-01T19:52:06.282Z)
