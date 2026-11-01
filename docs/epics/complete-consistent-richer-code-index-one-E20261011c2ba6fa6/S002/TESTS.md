<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s2 -->

# Tests: c2ba6fa62a148ed1 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t4

Run at 2026-11-01T13:32:16.352Z on commit `c7a2d5762`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4: a refresh replaces the file's outgoing relationships and pending rows in the same commit as its entities, and a relationship to an entity not stored becomes a pending row awaiting it | `src/db/__tests__/file-commit.test.ts` |
| pass | t4: relationships other files hold into surviving entities are left in place by a refresh | `src/db/__tests__/file-commit.test.ts` |
| pass | t4 (ac4): contentHash null removes the file's entities, relationships and pending rows together, and returns relationships other files hold into it to pending | `src/db/__tests__/file-commit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/file-commit.test.ts` | 0 | 7 | 1.7 s |  |

## t5

Run at 2026-11-01T14:50:54.848Z on commit `931502767`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t5: a successful vector write sets each changed entity's marker to the active embedding model; nothing is outstanding | `src/db/__tests__/file-commit-vectors.test.ts` |
| pass | t5: a failed vector write leaves the changed entities' markers empty and reports them as outstanding, and the graph rows are still committed | `src/db/__tests__/file-commit-vectors.test.ts` |
| pass | t5: a first-allocated entity is added and a changed one upserted: one vector row per id after both | `src/db/__tests__/file-commit-vectors.test.ts` |

**integration: updateEmbedding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t5: updateEmbedding writes the vector before the marker: a refused vector leaves the marker empty, a stored one sets it | `src/db/__tests__/file-commit-vectors.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/file-commit-vectors.test.ts` | 0 | 4 | 1.3 s |  |
