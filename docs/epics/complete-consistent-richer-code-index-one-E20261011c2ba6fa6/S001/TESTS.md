<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s1 -->

# Tests: c2ba6fa62a148ed1 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 36 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-10-16T16:40:24.707Z on commit `36a18e3a`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/__tests__/relations-awaiting-target.test.ts: edge / keep-awaiting / unwritable per input, one row per relationship, boundary kind kept as external-endpoint, promotions re-key and return counts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each input of a resolved write ends as an edge, one pending row awaiting the target, or a counted unwritable | `src/db/__tests__/relations-awaiting-target.test.ts` |
| pass | writing the same relationship twice while its target is absent leaves one row and an awaiting count of 1 | `src/db/__tests__/relations-awaiting-target.test.ts` |
| pass | a boundary relation with an absent target is kept as external-endpoint and does not count against graphComplete | `src/db/__tests__/relations-awaiting-target.test.ts` |
| pass | promotions: an edge removes the row and advances the generation; an absent target re-keys the row to await it; a missing source removes and counts it; the batch reports each | `src/db/__tests__/relations-awaiting-target.test.ts` |
| pass | promoteResolvedBatch writes all edges + removes all unresolved rows | `src/db/__tests__/relations-lmdb.test.ts` |

**integration: src/indexer/__tests__/external-endpoints.test.ts and messaging-endpoints.test.ts pass with the new promoteResolvedBatch return**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t1 ac1: one externalEndpoint node per distinct resolved target, with a CALLS_HTTP edge from each caller | `src/indexer/__tests__/external-endpoints.test.ts` |
| pass | t1 unresolved (k5): an un-pinnable URL mints an unresolved node carrying rawExpression + a CALLS_HTTP edge, never dropped | `src/indexer/__tests__/external-endpoints.test.ts` |
| pass | t1 dangling `from`: a CALLS_HTTP whose caller no longer exists is skipped (no node, no edge) | `src/indexer/__tests__/external-endpoints.test.ts` |
| pass | t2 idempotency: re-running on identical rows deletes nothing and yields the same node set | `src/indexer/__tests__/external-endpoints.test.ts` |
| pass | ac1: publish + subscribe to the SAME topic => ONE node, TWO edges (direction on the edge) | `src/indexer/__tests__/messaging-endpoints.test.ts` |
| pass | idempotency: re-running over identical rows yields the identical node set and GC deletes nothing | `src/indexer/__tests__/messaging-endpoints.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/relations-awaiting-target.test.ts` | 0 | 4 | 1.1 s |  |
| `src/db/__tests__/relations-lmdb.test.ts` | 0 | 24 | 3 s |  |
| `src/indexer/__tests__/external-endpoints.test.ts` | 0 | 13 | 2 s |  |
| `src/indexer/__tests__/messaging-endpoints.test.ts` | 0 | 7 | 1.3 s |  |

## t4

Run at 2026-10-16T16:46:20.693Z on commit `7225408a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/__tests__/relations-pending-upkeep.test.ts: the three delete functions decrement counts and remove by-target entries; meta merge keeps awaitsId and clears stale candidates; listUnresolvedRelations opts.awaiting across repositories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each of the three delete functions removes its rows, their by-target entries and their counts | `src/db/__tests__/relations-pending-upkeep.test.ts` |
| pass | a reclass merges meta: awaitsId and specifier survive, a stale candidates list is cleared, and the counts move | `src/db/__tests__/relations-pending-upkeep.test.ts` |
| pass | listUnresolvedRelations with opts.awaiting returns the rows awaiting an id from every repository, without scanning the pending table | `src/db/__tests__/relations-pending-upkeep.test.ts` |
| pass | promotions count each removal once: an edge lowers the class count by exactly one; a re-key leaves the awaiting count unchanged | `src/db/__tests__/relations-pending-upkeep.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/relations-pending-upkeep.test.ts` | 0 | 4 | 1.1 s |  |

## t5

Run at 2026-10-17T06:07:23.576Z on commit `56c0d3fd`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/indexer/__tests__/resolver-file-target.test.ts: missing relative import is no-candidate/target-file-missing; resolved relations carry meta.repo; DEPENDS_ON and Pass 1 rewire carry meta.repo and absolute meta.file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a relative import of a missing file is no-candidate with reason target-file-missing; one of an existing file resolves to its file id with meta.repo | `src/indexer/__tests__/resolver-file-target.test.ts` |
| pass | a refused DEPENDS_ON from the manifest step is counted against the repository, not the unattributed counter | `src/indexer/__tests__/resolver-file-target.test.ts` |
| pass | a DEPENDS_ON kept awaiting (manifest meta: repo and file are the repository path) is removed only by deleteUnresolvedForRepo | `src/indexer/__tests__/resolver-file-target.test.ts` |
| pass | a Pass 1 rewire carries the repository and the importing file's absolute path | `src/indexer/__tests__/resolver-file-target.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/resolver-file-target.test.ts` | 0 | 4 | 1.1 s |  |

## t6

Run at 2026-10-17T20:23:16.651Z on commit `fb413322`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/indexer/parser/__tests__/typescript-reexports.test.ts: the three re-export forms produce pending EXPORTS rows; other files unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the three re-export forms produce pending EXPORTS rows from the file entity | `src/indexer/parser/__tests__/typescript-reexports.test.ts` |
| pass | a namespace re-export and a local export list emit no EXPORTS row | `src/indexer/parser/__tests__/typescript-reexports.test.ts` |
| pass | a file without re-exports has no EXPORTS row, and adding re-export lines leaves its other entities and relations unchanged | `src/indexer/parser/__tests__/typescript-reexports.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/typescript-reexports.test.ts` | 0 | 8 | 0.4 s |  |

## t7

Run at 2026-10-17T20:31:08.513Z on commit `6e9df751`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/indexer/__tests__/file-selection.test.ts: predicate classes .png, .min.js, lock file, >256 KB JSON as not-code, ignored .ts as excluded-by-ignore, .css/.json as selected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the predicate classes a .png, a .min.js, a lock file and a JSON over 256 KB as not-code, a .ts under an ignored directory as excluded-by-ignore, and a .css and a .json under the limit as selected | `src/indexer/__tests__/file-selection.test.ts` |

**integration: existing indexer full-index fixtures select the same files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the full index selects the same files as before on the full-index fixture of index-run-record (five .ts files) | `src/indexer/__tests__/file-selection.test.ts` |
| pass | on a mixed fixture the full index selects the files it selected before, less only the lock file and the oversized JSON the artifact parser skipped | `src/indexer/__tests__/file-selection.test.ts` |
| pass | full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted) | `src/indexer/__tests__/index-run-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-selection.test.ts` | 0 | 3 | 0.9 s |  |
| `src/indexer/__tests__/index-run-record.test.ts` | 0 | 3 | 1 s |  |
