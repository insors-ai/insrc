<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s1 -->

# Tests: c2ba6fa62a148ed1 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 73 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t8

Run at 2026-10-18T04:22:33.616Z on commit `9eca857a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/__tests__/first-index-order.test.ts: ac1 fixture (mutation: keep-awaiting branch removed fails it)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac1: a file sorting earlier imports and calls into a later one; after a first full index the IMPORTS and the CALLS are stored and findCallers returns the call site | `src/indexer/__tests__/first-index-order.test.ts` |

**integration: src/indexer/__tests__/cross-file-modes.test.ts: settle promotes awaited targets (mutation: committedFiles not passed), settle classes JSON.parse and logo.png rows, reconcile leaves fullIndexFinished, file-target classes fixture (mutation: selection rule not applied)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a settle that commits an awaited target promotes the rows awaiting it | `src/indexer/__tests__/cross-file-modes.test.ts` |
| pass | a settle classes the rows of an edit that adds a call to JSON.parse, a call to a library function and an import of ./logo.png, and a complete repository stays complete | `src/indexer/__tests__/cross-file-modes.test.ts` |
| pass | the pass after an index clean-up changes neither fullIndexFinished nor the classes only a full index sets | `src/indexer/__tests__/cross-file-modes.test.ts` |
| pass | after a full index, rows awaiting a file are classed by the selection rule: not code is no-candidate, an ignored source file and a source file not stored stay awaiting with their reason | `src/indexer/__tests__/cross-file-modes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/cross-file-modes.test.ts` | 0 | 4 | 1.5 s |  |
| `src/indexer/__tests__/first-index-order.test.ts` | 0 | 1 | 0.8 s |  |

## t9

Run at 2026-10-18T04:33:11.743Z on commit `f60569df`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/__tests__/reexport-callers.test.ts: ac3 fixture with alias, nested, star and cyclic re-exports; empty EXPORTS edge value; stale target ignored (mutation: export_names lookup removed fails the alias case)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac3: calls through `export { f } from`, an aliased re-export (g() is a call of f), a barrel of a barrel and `export *` resolve to f; a re-export cycle (named or `export *`) ends with the name no-candidate | `src/indexer/__tests__/reexport-callers.test.ts` |
| pass | the stored EXPORTS edge value is empty and export_names holds (barrel, g) -> f and the star entries | `src/indexer/__tests__/reexport-callers.test.ts` |
| pass | an export_names entry pointing at a target that is not stored is ignored by the call matcher | `src/indexer/__tests__/reexport-callers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/reexport-callers.test.ts` | 0 | 3 | 1.9 s |  |

## t10

Run at 2026-10-18T04:44:37.079Z on commit `47285fc2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/db/__tests__/delete-entities-by-id.test.ts: barrel re-index and delete leave no export_names entry under the old u64 (mutation: cleanup removed)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s1/t10: re-indexing a barrel and then deleting it leave no export_names entry under its old u64 | `src/db/__tests__/delete-entities-by-id.test.ts` |

**integration: src/db/__tests__/entities-return-to-pending.test.ts: hand-written cross-repository edge returned to pending; forced failure leaves both sides**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with returnIncomingToPending, a hand-written edge from repository A into B is a pending row of A awaiting the entity after B is deleted, counted in A's state; B's own edge is not returned | `src/db/__tests__/entities-return-to-pending.test.ts` |
| pass | a failure inside the delete transaction leaves both B's rows and A's edge untouched | `src/db/__tests__/entities-return-to-pending.test.ts` |
| pass | without the option the delete is as before: the edge is removed and nothing is returned to pending | `src/db/__tests__/entities-return-to-pending.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/delete-entities-by-id.test.ts` | 0 | 3 | 1.2 s |  |
| `src/db/__tests__/entities-return-to-pending.test.ts` | 0 | 3 | 0.9 s |  |

## t11

Run at 2026-10-18T05:19:48.564Z on commit `2b1c6d7b`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/__tests__/full-index-rebuild.test.ts: hand-deleted edge restored by repo.reindex (mutation: unchanged-hash skip kept), unreadable file in uncommittedFiles, repository entity and DEPENDS_ON stored, interruption leaves fullIndexFinished false and start-up queues it, cross-repository restore without reindexing A, no export_names under old u64s after reindex**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac2: a cross-file edge deleted by hand from a store whose file hashes are unchanged is restored by repo.reindex | `src/indexer/__tests__/full-index-rebuild.test.ts` |
| pass | a file whose read fails during a full index is an uncommitted file and the repository reads not complete | `src/indexer/__tests__/full-index-rebuild.test.ts` |
| pass | the repository entity is stored before the manifest step, so the manifest's DEPENDS_ON edges are stored | `src/indexer/__tests__/full-index-rebuild.test.ts` |
| pass | a full index made to throw part-way leaves fullIndexFinished false, and start-up queues that repository for a full index | `src/indexer/__tests__/full-index-rebuild.test.ts` |
| pass | repository B's reindex restores repository A's hand-written edge into B through Pass 0, without reindexing A | `src/indexer/__tests__/full-index-rebuild.test.ts` |
| pass | after a reindex of the ac3 fixture no export_names entry remains under an old u64 and calls through the barrel still resolve | `src/indexer/__tests__/full-index-rebuild.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/full-index-rebuild.test.ts` | 0 | 6 | 2 s |  |

## t12

Run at 2026-10-18T05:32:58.124Z on commit `249df2d8`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/repo-completeness.test.ts: repo.list, repo.stats and daemon.status carry completeness beside the unchanged status; unattributedUnwritable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo.list, repo.stats and daemon.status carry completeness beside the unchanged status: a complete repository reads complete, one whose full index is running reads not complete while its status is indexing; daemon.status carries unattributedUnwritable | `src/daemon/__tests__/repo-completeness.test.ts` |
| pass | buildRepoStats: fileCount is distinct files; filesByLanguage counts a mixed-language file in each bucket | `src/daemon/__tests__/repo-stats.test.ts` |
| pass | buildRepoStats: entityCount total + entityCountByKind grouped by EntityKind | `src/daemon/__tests__/repo-stats.test.ts` |
| pass | buildRepoStats: relationCount is per-repo; a source-repo not registered and a repo with 0 source are ignored | `src/daemon/__tests__/repo-stats.test.ts` |
| pass | buildRepoStats: registry fields verbatim; a never-indexed registered repo yields a zero-count RepoStats (present) | `src/daemon/__tests__/repo-stats.test.ts` |
| pass | buildRepoStats: sizeBytes = injected sizeOf; pendingJobs = injected pendingFor | `src/daemon/__tests__/repo-stats.test.ts` |
| pass | buildRepoStats: an unregistered-repo entity row is ignored; empty inputs give all-zero RepoStats per repo | `src/daemon/__tests__/repo-stats.test.ts` |
| pass | collectRepoStats: per-repo counts + cross-repo edge attributed to its source repo + best-effort size | `src/daemon/__tests__/repo-stats.test.ts` |
| pass | buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress | `src/daemon/__tests__/daemon-status-lanes.test.ts` |
| pass | with no sweep running the summary lane carries no sweep, and without a lane source the status carries no queueLanes | `src/daemon/__tests__/daemon-status-lanes.test.ts` |
| pass | daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost | `src/daemon/__tests__/status-store-failure.test.ts` |
| pass | status handler with the store failed returns an empty repository list and storeFailure and does not throw | `src/daemon/__tests__/status-store-failure.test.ts` |
| pass | index.ts registers a 'repo.stats' handler that delegates to collectRepoStats | `src/daemon/__tests__/repo-stats-handler-contract.test.ts` |
| pass | the handler returns { error } (not throw) for an unregistered repoPath and returns the array when omitted | `src/daemon/__tests__/repo-stats-handler-contract.test.ts` |
| pass | the repo.stats handler is READ-ONLY (no mutation of store/registry/queue/config) | `src/daemon/__tests__/repo-stats-handler-contract.test.ts` |
| pass | collectRepoStats delegates to the pure buildRepoStats and RepoStats is declared | `src/daemon/__tests__/repo-stats-handler-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/daemon-status-lanes.test.ts` | 0 | 2 | 1.5 s |  |
| `src/daemon/__tests__/repo-completeness.test.ts` | 0 | 1 | 24.7 s |  |
| `src/daemon/__tests__/repo-stats-handler-contract.test.ts` | 0 | 4 | 0.6 s |  |
| `src/daemon/__tests__/repo-stats.test.ts` | 0 | 7 | 0.6 s |  |
| `src/daemon/__tests__/status-store-failure.test.ts` | 0 | 2 | 0.6 s |  |

## t13

Run at 2026-10-18T05:45:00.291Z on commit `52fb8228`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/cli/panes/__tests__/ReposPane-completeness.test.ts: ink render of complete, incomplete and field-less rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an incomplete repository shows incomplete beside its unchanged status, with the number of causes and the first cause on the line below | `src/cli/panes/__tests__/ReposPane-completeness.test.ts` |
| pass | a complete repository shows its status and nothing extra | `src/cli/panes/__tests__/ReposPane-completeness.test.ts` |
| pass | a repository with no completeness field (unknown) shows the status alone | `src/cli/panes/__tests__/ReposPane-completeness.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/panes/__tests__/ReposPane-completeness.test.ts` | 0 | 3 | 0.7 s |  |
