<!-- insrc:artifact TESTS-b94cf2c9058fd82a-S001 -->

# Tests: b94cf2c9058fd82a S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T13:31:05.601Z on commit `36a2bcaf`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an index job enqueued while a summary job is running completes before that summary job finishes | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | each lane runs its jobs one at a time in order, at the same time as the other lane, and every kind goes to its lane | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | a single-document job goes ahead of a queued sweep, after earlier single-document jobs, and takeDocSummaryEdit removes and returns it | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | depth, isProcessing and depthForRepo span both lanes, codeIndexWorkFor reads the index lane only, and laneStatus reports each lane | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | stop ends both lanes after their current jobs, and start resolves only then | `src/daemon/__tests__/queue-lanes.test.ts` |

**unit: src/daemon/__tests__/queue-code-index-work.test.ts: the existing test asserts the order of the index lane's in-flight jobs only, independently of summary-lane interleaving, and stops once both lanes are empty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor | `src/daemon/__tests__/queue-code-index-work.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-code-index-work.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/__tests__/queue-lanes.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-10-17T13:43:11.087Z on commit `b9d84623`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/__tests__/doc-summaries-lmdb.test.ts: writeDocSummaryIfCurrent writes when the entity exists with the summarised body, writes nothing and returns entity-gone or body-changed otherwise, and throws for an unregistered repo; writeDocSummary is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | writeDocSummary + getDocSummary round-trip | `src/db/__tests__/doc-summaries-lmdb.test.ts` |
| pass | writeDocSummary overwrites an existing summary | `src/db/__tests__/doc-summaries-lmdb.test.ts` |
| pass | writeDocSummary rejects an unknown entity | `src/db/__tests__/doc-summaries-lmdb.test.ts` |
| pass | writeDocSummary rejects an unregistered repo | `src/db/__tests__/doc-summaries-lmdb.test.ts` |
| pass | writeDocSummaryIfCurrent writes when the entity exists with the summarised body, writes nothing and returns entity-gone or body-changed otherwise, and throws for an unregistered repo | `src/db/__tests__/doc-summaries-lmdb.test.ts` |

**unit: src/analyze/summariser/__tests__/summarise-doc-current.test.ts: summariseDoc reports a summary the conditional write did not store as skipped entity-gone or body-changed, a thrown summary write as persistence-failed, a thrown placeholder write with the original model error, and a placeholder write that finds the entity gone or changed as skipped with that reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a summary of a document rewritten or deleted while it was summarised is not stored, and is reported as skipped body-changed or entity-gone | `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` |
| pass | a summary write that throws is reported as persistence-failed | `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` |
| pass | when the model fails, a placeholder write that throws keeps the model error, and one that finds the document gone or rewritten reports that instead | `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` | 0 | 3 | 1.4 s |  |
| `src/db/__tests__/doc-summaries-lmdb.test.ts` | 0 | 15 | 3.4 s |  |

## t3

Run at 2026-10-17T13:53:06.888Z on commit `fb2c43f6`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep runs every queued single-document job before each entity, skips and counts an entity deleted after the sweep began, counts a throwing entity as failed and continues, classifies every result kind as summarised, skipped, gone or failed, reports progress after each entity, and returns stopped after the summary in progress once shouldStop is true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every queued single-document job runs before each document, including jobs queued while the sweep runs | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | a document deleted after the sweep began is counted as gone and not summarised, and a throwing document is counted as failed while the sweep continues | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | every result kind is classified as summarised, skipped, gone or failed | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | progress is reported after each document, with the total | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | once shouldStop is true the sweep returns stopped after the summary in progress, also between single-document jobs | `src/indexer/__tests__/doc-summary-sweep.test.ts` |

**unit: src/indexer/__tests__/summary-sweep-progress.test.ts: IndexerService.summarySweepProgress is set while docSummariseRepo runs and cleared when the sweep completes, stops or throws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | summarySweepProgress is set while docSummariseRepo runs and cleared when the sweep completes | `src/indexer/__tests__/summary-sweep-progress.test.ts` |
| pass | summarySweepProgress is cleared when the sweep stops on shutdown | `src/indexer/__tests__/summary-sweep-progress.test.ts` |
| pass | summarySweepProgress is cleared when the sweep throws | `src/indexer/__tests__/summary-sweep-progress.test.ts` |
| pass | a single-document job queued for the summary lane is taken by the running sweep and summarised before the next document | `src/indexer/__tests__/summary-sweep-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/doc-summary-sweep.test.ts` | 0 | 5 | 0.7 s |  |
| `src/indexer/__tests__/summary-sweep-progress.test.ts` | 0 | 4 | 1.1 s |  |

## t4

Run at 2026-10-17T13:59:25.416Z on commit `3cf219dd`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/daemon-status-lanes.test.ts: buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress | `src/daemon/__tests__/daemon-status-lanes.test.ts` |
| pass | with no sweep running the summary lane carries no sweep, and without a lane source the status carries no queueLanes | `src/daemon/__tests__/daemon-status-lanes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/daemon-status-lanes.test.ts` | 0 | 2 | 0.5 s |  |
