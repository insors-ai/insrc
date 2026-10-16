<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s1 -->

# Tests: c2ba6fa62a148ed1 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
