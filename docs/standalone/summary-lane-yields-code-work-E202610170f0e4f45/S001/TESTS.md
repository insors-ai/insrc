<!-- insrc:artifact TESTS-0f0e4f45f698aeb6-s1 -->

# Tests: 0f0e4f45f698aeb6 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-17T18:05:21.785Z on commit `0cf92d04`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/queue-lanes.test.ts: a summary-lane job queued while an index job runs does not start until the index lane is idle; a summary already running is not interrupted and an index job enqueued during it starts at once (the overlap case, replacing the pre-queued overlap assertion); the readers test is revised to the code-first order (a queued summary waits behind index work, laneStatus shows it queued); waitForIndexIdle resolves at once when the index lane is idle and on stop(), and a summary lane waiting for code work ends on stop()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an index job enqueued while a summary job is running completes before that summary job finishes | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | each lane runs its jobs one at a time in order, every kind goes to its lane, and summaries queued with code work start only after it | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | depth, isProcessing and depthForRepo span both lanes, codeIndexWorkFor reads the index lane only, and laneStatus reports each lane | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | waitForIndexIdle resolves at once when the index lane is idle, after its code work otherwise, and on stop(); a summary lane waiting for code work ends on stop() | `src/daemon/__tests__/queue-lanes.test.ts` |
| pass | a summary never starts after a code job was queued: with the index lane idle at start it starts at once, and a code job queued just after runs beside that one summary only | `src/daemon/__tests__/queue-lanes.test.ts` |

**unit: src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep awaits waitForCodeIdle before each single-document job and each document, an edit queued while it is paused runs before the next document, and it ends with stopped when shouldStop is true after the wait**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the sweep waits for code work before each single-document job and each document, runs an edit queued during the wait before the next document, and ends with stopped when shutdown comes during the wait | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | code work arriving while a document is read pauses the sweep again: an edit queued in that pause runs first, and shutdown in it ends the sweep without summarising | `src/indexer/__tests__/doc-summary-sweep.test.ts` |
| pass | shutdown that comes while a document is read ends the sweep without summarising it | `src/indexer/__tests__/doc-summary-sweep.test.ts` |

**unit: src/indexer/__tests__/summary-sweep-progress.test.ts: the indexer's sweep pauses while the queue's index lane has work and continues when it is idle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the indexer's sweep pauses while the queue's index lane has work and continues when it is idle | `src/indexer/__tests__/summary-sweep-progress.test.ts` |
| pass | a summary never starts while code work is queued, even when the sweep wakes from its wait just before a code job arrives | `src/indexer/__tests__/summary-sweep-progress.test.ts` |
| pass | an edited document queued while the indexer's sweep is paused for code work runs before the sweep's next document | `src/indexer/__tests__/summary-sweep-progress.test.ts` |
| pass | a single-document summary waits while code work runs, runs once it is done, and is not started on shutdown | `src/indexer/__tests__/summary-sweep-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-lanes.test.ts` | 0 | 7 | 0.6 s |  |
| `src/indexer/__tests__/doc-summary-sweep.test.ts` | 0 | 8 | 0.6 s |  |
| `src/indexer/__tests__/summary-sweep-progress.test.ts` | 0 | 8 | 1.6 s |  |
