# s1/t10 evidence — export_names upkeep on deletes; returning incoming edges to pending

## What changed

- `detachDeleteEntitiesInTxn` (src/db/entities.ts) removes every export_names entry keyed by each deleted u64, in the same transaction and before the u64 mapping goes. Every entity delete passes through it.
- `deleteEntitiesForRepo(db, repo, { returnIncomingToPending })` now returns `{ returnedToPending }`. With the option, before the delete and in the SAME write transaction (an in-transaction hook added to `detachDeleteEntities`), every edge whose holder belongs to another repository is written back as a pending row of the holder, awaiting the entity's id. It goes through the new `returnEdgeToPendingInTxn` (src/db/relations.ts), which reuses the keep-awaiting row builder, so the row is counted in the holder's index state. Without the option, the delete is unchanged.

## Mutations

| Mutation | delete-entities-by-id | entities-return-to-pending |
| --- | --- | --- |
| export_names cleanup removed (the plan's named mutation) | 3 | — |
| option ignored | — | 1, 2 |
| a failure in the return step swallowed (no rollback) | — | 2 |
| the repository's own edges returned too (holder-repository check removed) | — | 1 |

**Test note:** the forced failure is an unreadable holder row in a third repository, read after A's pending row was already written in the same transaction. The test shows that row and its count rolled back, and B left as it was. I tried a failure inside the delete phase itself, but it can't be produced without a seam: a B row that cannot be decoded is skipped when the repository's entities are collected, before the transaction starts.

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'`: # tests 5885 # pass 5753 # fail 2 # cancelled 2 # skipped 125 

These are the pre-existing failures: sqlite-driver and review-decision. search-filter and search-guard were cancelled under sweep load; search-guard passes alone (3/3).
