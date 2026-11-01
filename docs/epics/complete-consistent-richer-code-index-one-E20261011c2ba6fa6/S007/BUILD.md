<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-11-01T19:07:14.344Z  ·  **Updated:** 2026-11-01T19:45:32.101Z

**Commit:** 383398e2b

## Summary

The daemon's caller/callee requests (including every hop of callers_nhop) and the graph tools return each entity with its relationship evidence; existing fields unchanged; proved in process. Inventory pins: session-source fixture refreshed for graph/index.ts; module-state guard 6/6; the two CM-S3/CM-S4 failures are pre-existing and name other files.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/graph/__tests__/evidence-codec.test.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/__tests__/relations-evidence.test.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/__tests__/evidence-extracted.test.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/__tests__/evidence-inferred.test.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/__tests__/reexport-callers.test.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/external-endpoints.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/indexer/messaging-endpoints.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/graph/edges.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/db/search.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/daemon/__tests__/search-evidence-rpc.test.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
- `src/daemon/tools/builtins/graph/index.ts` — **insrc-build** (2026-11-01T19:45:32.101Z)
