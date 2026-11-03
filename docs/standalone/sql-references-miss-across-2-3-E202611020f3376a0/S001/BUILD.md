<!-- insrc:artifact BUILD-0f3376a086e3601c-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T10:37:50.308Z  ·  **Updated:** 2026-11-03T11:57:25.736Z

**Commit:** b31641ec1

## Summary

@b31641ec1: recheckSqlReferences runs at the start of Pass 2 in settle mode (before the selection, so the rows it writes are marked and selected): for each table/view defined in a committed .sql file it takes the folded last segment (sqlFoldedLastSegment: unquoted text, lower-cased), targets every stored table/view in index groups whose key folds to it (committed definitions included), and calls the new store op returnInferredSqlReferencesToPending(targets, holders-in-committed-files): per inbound REFERENCES edge with evidence 'inferred' and a holder not excluded, it writes sqlByNameRows' rows (holder names meeting by key or folded text, never a locally answered name, marked) and removes the edge; when no name fits the edge is left as it is; extracted edges are never touched; the repo generation is advanced. Mutation check: 7 mutants, 6 caught. The survivor drops the resolver's holder exclusion set; it is not observable through a settle because a committed file's own outgoing edges are swept by its commit, so a committed holder never holds an inferred edge at settle time -- the exclusion is kept as the LLD requires and is pinned at the store level (excluded holder keeps its edge).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/parser/__tests__/sql-names.test.ts` — **insrc-build** (2026-11-03T11:57:25.736Z)
- `src/indexer/parser/__tests__/sql.test.ts` — **insrc-build** (2026-11-03T11:57:25.736Z)
- `src/indexer/parser/sql-names.ts` — **insrc-build** (2026-11-03T11:57:25.736Z)
- `src/indexer/parser/sql.ts` — **insrc-build** (2026-11-03T11:57:25.736Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-03T11:57:25.736Z)
- `src/indexer/__tests__/sql-name-resolution.test.ts` — **insrc-build** (2026-11-03T11:57:25.736Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-03T11:57:25.736Z)
