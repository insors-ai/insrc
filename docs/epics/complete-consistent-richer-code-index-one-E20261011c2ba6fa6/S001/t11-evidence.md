# s1/t11 evidence — the full index rebuilds a repository from scratch and records its state

## What changed

**`fullIndex` (src/indexer/index.ts):**
- Before the walk it calls `deleteEntitiesForRepo(..., { returnIncomingToPending: true })` and `deleteUnresolvedForRepo`. Document summaries and cached explorations go with the repository's rows; the doc-summarise-repo job queued at the end regenerates the summaries. Then `beginFullIndexState` advances the generation, zeroes the counts and sets fullIndexFinished false.
- Every selected file is indexed with `indexFile(..., { fresh: true })`: no unchanged-hash skip and no per-file delete. That is cleanFirst's effect after a repository-wide delete, without cleanFirst's per-file `deleteEntitiesForFile`, which scans the whole entity table on every call and would make a full index quadratic (about 3,500 files against about 84k entities here).
- A thrown error or a false return records the file in uncommittedFiles (`setUncommittedFiles`).
- The repository entity (kind 'repo') is stored before `indexManifest`.
- The cross-file pass runs in mode 'full'. endpointPassFailed and fullIndexFinished are written after the endpoint passes (`finishFullIndexState`).

**Start-up** queues a full index for every repository whose fullIndexFinished is not true, beside today's status rule.

**New state writes** in src/db/index-state.ts: `beginFullIndexState`, `setUncommittedFiles`, `finishFullIndexState`.

**Stakeholder decision 2026-10-18** (LLD feedback 4b37ae56): while a full index runs, a deleted entity cannot be traced to its repository. So the search guard (src/daemon/search-guard.ts) now refuses a request naming an entity that is not stored, for every repository being indexed. Repositories whose last index failed are not included. Without this, two s5 search-guard tests got empty answers instead of the refusal.

**Tests updated for the new start-up rule:**
- index-run-record (the status rule, with every full index finished);
- reconcile (start-up and a clean-up failure, now injected through reconcileRepo, because a rebuild leaves no stale file to fail on);
- the seeded daemon helper (its repositories' full indexes finished).

**Test seam:** `_settlePassesDoneForTest`. A settle pass from one cross-file-modes test could run on into the next test's store (UnregisteredRepoError seen in a sweep). The test now waits for it.

## Mutations (src/indexer/__tests__/full-index-rebuild.test.ts unless named)

| Mutation | Failing tests |
| --- | --- |
| unchanged-hash skip kept: no repository delete, plain indexFile (the plan's named mutation) | 1, 6 |
| uncommittedFiles not recorded | 2 |
| no repository entity | 3 |
| fullIndexFinished never set | 1, 4 |
| start-up rule unchanged | 4 |
| incoming edges not returned to pending | 5 |
| cross-file pass not in 'full' mode | 5 |
| export_names cleanup removed (t10) | 6 |
| guard: an unstored entity names nothing | search-guard-rule 3, search-guard 1 |
| guard: repositories whose index failed also named | search-guard-rule 3 |

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'`: # tests 5886 # pass 5758 # fail 2 # cancelled 1 # skipped 122 

Only the pre-existing failures remain: sqlite-driver, review-decision, and search-filter (cancelled under load; passes alone).

**Shipping note for t17:** every repository on the live store has fullIndexFinished false, so the first daemon start after this ships queues a full index of every registered repository.
