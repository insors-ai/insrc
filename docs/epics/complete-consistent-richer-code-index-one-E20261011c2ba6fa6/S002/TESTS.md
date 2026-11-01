<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s2 -->

# Tests: c2ba6fa62a148ed1 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T13:16:17.185Z on commit `b264851a5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both in-transaction bodies write inside the caller's transaction and report what they did, by the same rule as the async writers | `src/db/__tests__/relations-in-txn.test.ts` |
| pass | a caller's transaction that throws after both bodies ran keeps none of their writes (read after a reopen) | `src/db/__tests__/relations-in-txn.test.ts` |
| pass | each input of a resolved write ends as an edge, one pending row awaiting the target, or a counted unwritable | `src/db/__tests__/relations-awaiting-target.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/relations-awaiting-target.test.ts` | 0 | 4 | 1.4 s |  |
| `src/db/__tests__/relations-in-txn.test.ts` | 0 | 2 | 0.8 s |  |

## t2

Run at 2026-11-01T13:19:10.308Z on commit `2d50d4479`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a RelationWrite with a stored target maps to a resolved Relation, and one with a pending target to an unresolved Relation with the same meta | `src/db/__tests__/file-commit-types.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/file-commit-types.test.ts` | 0 | 1 | 0.6 s |  |

## t3

Run at 2026-11-01T13:27:03.535Z on commit `5135e9d55`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t3: a refresh replaces the file's entities in one commit, found through entity_by_file and not a scan of the entity table, and leaves other files alone | `src/db/__tests__/file-commit.test.ts` |
| pass | t3: a commit that throws part-way leaves every row of the file as before (read after a reopen) | `src/db/__tests__/file-commit.test.ts` |
| pass | t3: contentHash null removes every entity of the file in one commit; the generation advances and the file leaves uncommittedFiles | `src/db/__tests__/file-commit.test.ts` |
| pass | t3: an unregistered repository is refused and nothing is written | `src/db/__tests__/file-commit.test.ts` |

**unit: reindexFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reindexFile: removing an entity tombstones it + keeps the rest | `src/db/__tests__/reindex-file-lmdb.test.ts` |
| pass | reindexFile preserves module stubs that already exist | `src/db/__tests__/reindex-file-lmdb.test.ts` |
| pass | reindexFile: contentHash unchanged + body unchanged -> no row mutation | `src/db/__tests__/reindex-file-lmdb.test.ts` |
| pass | reindexFile only touches entities of the specified file | `src/db/__tests__/reindex-file-lmdb.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/file-commit.test.ts` | 0 | 4 | 1.5 s |  |
| `src/db/__tests__/reindex-file-lmdb.test.ts` | 0 | 14 | 2.6 s |  |
