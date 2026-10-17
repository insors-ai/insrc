<!-- insrc:artifact PLAN-b94cf2c9058fd82a-S001 -->

# Plan: E20261017b94cf2c9:S001

## Summary

**Epic:** `run-document-summarisation-its-own-queue`
**LLD run:** `wf-1792243185733-6y6pq6`
**LLD effective hash:** `a9af1d021485...`

Building this is four changes: give the index queue two lanes that run at the same time, store a summary only for a document that is still current, make the summary sweep yield to edits, stop on shutdown and report progress, and show both lanes in daemon.status.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** IndexQueue runs an index lane and a summary lane at the same time | M | — | unit: src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves; unit: src/daemon/__tests__/queue-code-index-work.test.ts: the existing test asserts the order of the index lane's in-flight jobs only, independently of summary-lane interleaving, and stops once both lanes are empty | [[c1]] |
| 2 | **`t2`** Summaries are stored only for current documents | S | — | unit: src/db/__tests__/doc-summaries-lmdb.test.ts: writeDocSummaryIfCurrent writes when the entity exists with the summarised body, writes nothing and returns entity-gone or body-changed otherwise, and throws for an unregistered repo; writeDocSummary is unchanged; unit: src/analyze/summariser/__tests__/summarise-doc-current.test.ts: summariseDoc reports a summary the conditional write did not store as skipped entity-gone or body-changed, a thrown summary write as persistence-failed, a thrown placeholder write with the original model error, and a placeholder write that finds the entity gone or changed as skipped with that reason | [[c2]] |
| 3 | **`t3`** The summary sweep yields to edits, stops on shutdown and reports progress | M | `t1`, `t2` | unit: src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep runs every queued single-document job before each entity, skips and counts an entity deleted after the sweep began, counts a throwing entity as failed and continues, classifies every result kind as summarised, skipped, gone or failed, reports progress after each entity, and returns stopped after the summary in progress once shouldStop is true; unit: src/indexer/__tests__/summary-sweep-progress.test.ts: IndexerService.summarySweepProgress is set while docSummariseRepo runs and cleared when the sweep completes, stops or throws | [[c3]] |
| 4 | **`t4`** daemon.status reports both lanes | S | `t1`, `t3` | unit: src/daemon/__tests__/daemon-status-lanes.test.ts: buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress | [[c4]] |

### 1.1 E20261017b94cf2c9:S001:T001 — IndexQueue runs an index lane and a summary lane at the same time

IndexQueue routes doc-summarise-repo and doc-summarise-entity to a summary lane and every other kind to an index lane, with today's dedup per lane; start runs one drain loop per lane concurrently and resolves when both stop; a doc-summarise-entity job goes ahead of the first queued sweep; adds takeDocSummaryEdit, laneStatus and isStopping; depth, isProcessing and depthForRepo span both lanes and codeIndexWorkFor reads the index lane only. The existing code-index-work test asserts the index lane's order only.

**Acceptance checks:**
- An index job enqueued while a summary job runs completes before that summary job finishes.
- Each lane runs its jobs one at a time in order; kinds route to the right lane.
- A single-document job goes ahead of a queued sweep and takeDocSummaryEdit removes and returns it.
- depth, isProcessing, depthForRepo, codeIndexWorkFor and laneStatus report as the LLD specifies; stop ends both lanes and start resolves.
- The existing queue tests pass, with queue-code-index-work asserting index-lane order only.

### 1.2 E20261017b94cf2c9:S001:T002 — Summaries are stored only for current documents

Adds writeDocSummaryIfCurrent (checks inside the write transaction that the entity exists with the summarised body; returns written, entity-gone or body-changed; throws as writeDocSummary does) and routes summariseDoc's two writes through it, with SummariseDocResult.skipped gaining entity-gone and body-changed and the placeholder precedence the LLD states; writeDocSummary is unchanged.

**Acceptance checks:**
- writeDocSummaryIfCurrent writes for a current entity, returns entity-gone or body-changed otherwise and throws for an unregistered repo.
- summariseDoc reports the skip reasons, a thrown summary write as persistence-failed and a thrown placeholder write with the model error.
- writeDocSummary and its callers are unchanged.

### 1.3 E20261017b94cf2c9:S001:T003 — The summary sweep yields to edits, stops on shutdown and reports progress

Adds runDocSummarySweep (shouldStop check, queued single-document jobs first, re-read each entity, result classification, onProgress) and makes docSummariseRepo call it with the queue's takeDocSummaryEdit and isStopping, owning summarySweepProgress (set, updated, cleared in finally).

**Acceptance checks:**
- Queued single-document jobs run before each entity.
- A deleted entity is counted as gone; results are classified as the LLD states; a throw is failed and the sweep continues.
- The sweep returns stopped after the summary in progress once shouldStop is true.
- summarySweepProgress is set during a sweep and cleared when it completes, stops or throws.

### 1.4 E20261017b94cf2c9:S001:T004 — daemon.status reports both lanes

DaemonStatus and DaemonStatusSources gain optional queueLanes built from queue.laneStatus() and the indexer's summarySweepProgress(); queueDepth stays the total. CLAUDE.md records the concurrent-lane exception to serial LLM calls.

**Acceptance checks:**
- buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane and the sweep progress; absent source, absent field.
- CLAUDE.md states the exception and its condition for revisiting.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves | `t1` |
| src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep runs every queued single-document job before each entity, skips and counts an entity deleted after the sweep began, counts a throwing entity as failed and continues, classifies every result kind as summarised, skipped, gone or failed, reports progress after each entity, and returns stopped after the summary in progress once shouldStop is true | `t3` |
| src/db/__tests__/doc-summaries-lmdb.test.ts: writeDocSummaryIfCurrent writes when the entity exists with the summarised body, writes nothing and returns entity-gone or body-changed otherwise, and throws for an unregistered repo; writeDocSummary is unchanged | `t2` |
| src/daemon/__tests__/daemon-status-lanes.test.ts: buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress | `t4` |
| src/analyze/summariser/__tests__/summarise-doc-current.test.ts: summariseDoc reports a summary the conditional write did not store as skipped entity-gone or body-changed, a thrown summary write as persistence-failed, a thrown placeholder write with the original model error, and a placeholder write that finds the entity gone or changed as skipped with that reason | `t2` |
| src/indexer/__tests__/summary-sweep-progress.test.ts: IndexerService.summarySweepProgress is set while docSummariseRepo runs and cleared when the sweep completes, stops or throws | `t3` |
| src/daemon/__tests__/queue-code-index-work.test.ts: the existing test asserts the order of the index lane's in-flight jobs only, independently of summary-lane interleaving, and stops once both lanes are empty | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD b94cf2c9 S001 contractDetails.api IndexQueue (enqueue, start, takeDocSummaryEdit, laneStatus, state readers)`
- **[[c2]]** `prior-artifact` `LLD b94cf2c9 S001 contractDetails.api writeDocSummaryIfCurrent and summariseDoc`
- **[[c3]]** `prior-artifact` `LLD b94cf2c9 S001 contractDetails.api runDocSummarySweep and IndexerService.summarySweepProgress`
- **[[c4]]** `prior-artifact` `LLD b94cf2c9 S001 contractDetails.api buildDaemonStatus / DaemonStatus and the stakeholder exception (c5)`
