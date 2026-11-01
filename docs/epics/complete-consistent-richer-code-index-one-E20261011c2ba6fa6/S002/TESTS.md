<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s2 -->

# Tests: c2ba6fa62a148ed1 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 36 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t6

Run at 2026-11-01T14:59:32.825Z on commit `9ee41aac7`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t6: after a commit whose vector write failed, unembedded counts the entities without a vector and the repository is not complete; the backfill-style write brings it back to zero | `src/db/__tests__/file-commit-vectors.test.ts` |
| pass | t6: entities the embed step never selects (an empty body: endpoints, module stubs) are never counted | `src/db/__tests__/file-commit-vectors.test.ts` |
| pass | t6: the recount when the store opens corrects a wrong stored count | `src/db/__tests__/file-commit-vectors.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/file-commit-vectors.test.ts` | 0 | 7 | 2 s |  |

## t7

Run at 2026-11-01T15:04:42.397Z on commit `7c3e1dd09`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: listUnembeddedEntities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t7: an entity whose marker says embedded but whose vector is missing has its marker cleared and is counted unembedded | `src/db/__tests__/file-commit-vectors.test.ts` |

**integration: IndexerService.reembed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t7: a vector whose entity is not stored is deleted, so a later first commit of that id leaves exactly one vector row | `src/db/__tests__/file-commit-vectors.test.ts` |
| pass | t7: the indexer reconciles the graph and the vector table when it starts, before any job | `src/db/__tests__/file-commit-vectors.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/file-commit-vectors.test.ts` | 0 | 10 | 2.3 s |  |

## t8

Run at 2026-11-01T15:13:36.050Z on commit `d9fe9ff86`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: IndexerService.indexFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t8 (ac1): a refresh whose embed step fails after the parse leaves the file's previous entities and pending rows as they were, and records the file as uncommitted | `src/indexer/__tests__/file-refresh.test.ts` |
| pass | t8 (ac2): a read while a refresh is held in its embed step sees the complete old set, and after the commit the complete new set | `src/indexer/__tests__/file-refresh.test.ts` |
| pass | t8 (ac4): a delete event removes the file's entities and pending rows together | `src/indexer/__tests__/file-refresh.test.ts` |
| pass | a kept file's link into a removed entity is removed with it and returns to pending awaiting it, and the kept file's other links and entities stay | `src/indexer/__tests__/reconcile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-refresh.test.ts` | 0 | 3 | 1.1 s |  |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 20 | 4.1 s |  |

## t9

Run at 2026-11-01T15:20:26.985Z on commit `4741a5bb6`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: IndexerService.reembed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Epic c2ba6fa6 s2: a reembed (the vector backfill) runs in its own lane and never delays a file job queued after it; its lane is published | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | each lane runs its jobs one at a time in order, every kind goes to its lane, and summaries queued with code work start only after it | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor | `src/daemon/__tests__/queue-code-index-work.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-code-index-work.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/__tests__/queue-lanes.test.ts` | 0 | 8 | 0.5 s |  |

## t10

Run at 2026-11-01T15:27:13.358Z on commit `6c2a9620d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: IndexerService.reembed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t10 (ac3): after a commit whose vector write failed, the backfill queued at start writes the vectors, sets the markers and the repository reads complete | `src/indexer/__tests__/backfill.test.ts` |
| pass | t10: a backend that returns no vectors records embeddingAvailable false and the job does not fail | `src/indexer/__tests__/backfill.test.ts` |
| pass | t10: the backfill is queued after a full index and after a clean-up | `src/indexer/__tests__/backfill.test.ts` |

**integration: listUnembeddedEntities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t10: listUnembeddedEntities selects the repository's entities with a body and no marker -- never an empty body, an embedded entity or another repository's | `src/indexer/__tests__/backfill.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/backfill.test.ts` | 0 | 4 | 1.3 s |  |
