<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s1 -->

# Tests: c2ba6fa62a148ed1 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-16T13:00:16.421Z on commit `fcc6d7ab`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/graph/__tests__/migration-v4-to-v5.test.ts: V4 store migrates to 5 with three sub-DBs and one IndexStateRow per repository; a throwing step leaves version 4**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a v4 store opened by this code is at version 5 with one IndexStateRow per workspace repository, not complete, its pending counts recounted from the stored rows | `src/db/graph/__tests__/migration-v4-to-v5.test.ts` |
| pass | a v4 -> v5 step that throws leaves the stored version at 4 and writes no IndexStateRow | `src/db/graph/__tests__/migration-v4-to-v5.test.ts` |
| pass | the registry keeps V1->V2, V2->V3 and V3->V4 in order and appends V4->V5 | `src/db/graph/__tests__/migration-v4-to-v5.test.ts` |

**integration: src/db/__tests__/repos-lmdb.test.ts: repo.remove deletes the index_state row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | removeRepo deletes the repository's index_state row with its registry row (Epic c2ba6fa6 s1/t1) | `src/db/__tests__/repos-lmdb.test.ts` |
| pass | removing a repository after the migration leaves no index_state row for it | `src/db/graph/__tests__/migration-v4-to-v5.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/repos-lmdb.test.ts` | 0 | 27 | 2.9 s |  |
| `src/db/graph/__tests__/migration-v4-to-v5.test.ts` | 0 | 4 | 1.6 s |  |

## t2

Run at 2026-10-16T16:27:42.080Z on commit `73c86f8b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/__tests__/index-state.test.ts: completenessOf table test, undefined state, reason lines, recount on open corrects a hand-edited count, unregistered repoId row deleted, aborted transaction leaves counts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | completenessOf table test: graphComplete and complete follow the sc1 formula for every combination of the inputs, and reasons are empty exactly when complete | `src/db/__tests__/index-state.test.ts` |
| pass | completenessOf(undefined) reads not complete with "a reindex is needed" | `src/db/__tests__/index-state.test.ts` |
| pass | completeness reason lines: one per non-zero cause with its count, awaiting rows split by reason, no-candidate and ambiguous rows not a cause | `src/db/__tests__/index-state.test.ts` |
| pass | an aborted transaction leaves the counts unchanged: a callback that writes a pending row and its count, then throws, leaves neither | `src/db/__tests__/index-state.test.ts` |
| pass | recount on open corrects a hand-edited count with a warn log, and deletes the row of an unregistered repoId | `src/db/__tests__/index-state.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/index-state.test.ts` | 0 | 5 | 0.8 s |  |
