<!-- insrc:artifact LLD-b94cf2c9058fd82a-S001 -->

# LLD: E20261017b94cf2c9:S001

## Summary

**Epic:** `run-document-summarisation-its-own-queue`
**HLD base run:** `wf-1792243185733-6y6pq6`
**HLD effective hash:** `a9af1d021485...`

The daemon's index queue gets two lanes that run at the same time: an index lane for code and file work, and a summary lane for document summaries. Code indexing no longer waits behind a summary sweep that can take hours. In the summary lane, a document that was just edited is summarised before the rest of a sweep, and a running sweep stops between documents to do it. A summary is stored only if its document still exists with the text that was summarised. Status shows each lane's depth and whether it is running.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `IndexQueue.enqueue`

```typescript
enqueue(job: IndexJob): void
```

**Parameters:**
- `job: IndexJob` — Any job kind.

**Returns:** `void` — Unchanged.

**Postconditions:**
- doc-summarise-repo and doc-summarise-entity jobs go to the summary lane; every other kind goes to the index lane.
- Each kind keeps today's dedup, applied within its lane.
- A doc-summarise-entity job is placed ahead of the first doc-summarise-repo job queued in the summary lane, after any other queued doc-summarise-entity jobs.
- The enqueue wakes only the lane it went to.

### 2.2 `IndexQueue.start`

```typescript
start(processor: (job: IndexJob) => Promise<void>): Promise<void>
```

**Parameters:**
- `processor: (job: IndexJob) => Promise<void>` — Runs one job (indexer.processJob).

**Returns:** `Promise<void>` — Resolves when both lanes have stopped.

**Postconditions:**
- Each lane runs its own drain loop, and the two run at the same time; within a lane jobs run one at a time, in order.
- A job that throws is logged as today (including the store-lock case) and its lane continues.

### 2.3 `IndexQueue.takeDocSummaryEdit`

```typescript
takeDocSummaryEdit(): { kind: "doc-summarise-entity"; entityId: string } | undefined
```

**Returns:** `{ kind: "doc-summarise-entity"; entityId: string } | undefined` — The first queued doc-summarise-entity job, removed from the summary lane, or undefined.

**Postconditions:**
- A job it returns is no longer queued and is not counted by depth.

### 2.4 `IndexQueue.laneStatus`

```typescript
laneStatus(): { index: { depth: number; running: boolean }; summary: { depth: number; running: boolean } }
```

**Returns:** `object` — Each lane's queued count and whether its worker is running a job.

### 2.5 `IndexQueue state readers`

```typescript
depth: number; isProcessing: boolean; isStopping: boolean; depthForRepo(repoPath: string): number; codeIndexWorkFor(repoPath: string): { inFlight: boolean; pending: number }; stop(): void
```

**Returns:** `unchanged` — depth and depthForRepo count both lanes; isProcessing is true while either lane runs a job; codeIndexWorkFor reads the index lane only (its in-flight job and queue); stop ends both lanes after their current jobs. isStopping is true once stop() has been called; the sweep reads it as shouldStop.

**Postconditions:**
- daemon.compact, repo.stats, codeReview.freshness and shutdown keep their current calls and meaning.
- depthForRepo counts a doc-summarise-repo job queued in the summary lane, and never a doc-summarise-entity job, as today.

### 2.6 `runDocSummarySweep`

```typescript
runDocSummarySweep(entityIds: readonly string[], deps: { getEntity(id: string): Promise<Entity | null>; summarise(entity: Entity): Promise<SummariseDocResult>; takeEdit(): { entityId: string } | undefined; runEdit(entityId: string): Promise<void>; shouldStop(): boolean; onProgress(done: number, total: number): void }): Promise<{ summarised: number; skipped: number; failed: number; gone: number; stopped: boolean }>
```

**Parameters:**
- `entityIds: readonly string[]` — The repo's document and section entity ids, listed at the start of the sweep.

**Returns:** `Promise<counts>` — What the sweep did.

**Postconditions:**
- Before each entity it checks shouldStop(); when true it returns at once with stopped: true, so stop() ends a sweep after the summary in progress.
- Before each entity, every queued single-document job is taken and run first (each also after a shouldStop() check).
- Each entity is re-read just before it is summarised; one that no longer exists is counted as gone and skipped.
- A throw for one entity is counted as failed and the sweep continues, as today.
- onProgress is called after each entity with the number done and the total.
- Results are classified as: ok:true and skipped 'unchanged' -> skipped; ok:true otherwise -> summarised; skipped 'entity-gone' or 'body-changed' (or the entity missing on re-read) -> gone; ok:false with another skipped reason ('not-a-doc', 'body-empty') -> skipped; ok:false with an error -> failed; a throw -> failed.

### 2.7 `buildDaemonStatus / DaemonStatus`

```typescript
DaemonStatusSources.queueLanes?: () => QueueLanes; DaemonStatus.queueLanes?: QueueLanes, where QueueLanes = { index: { depth: number; running: boolean }; summary: { depth: number; running: boolean; sweep?: { repoPath: string; done: number; total: number } } }
```

**Returns:** `DaemonStatus` — queueDepth stays the total of both lanes; queueLanes is added.

**Postconditions:**
- A consumer that does not know queueLanes sees no change.
- The daemon builds queueLanes from queue.laneStatus() and IndexerService.summarySweepProgress().
- buildDaemonStatus copies it; when the source is absent the field is absent.

### 2.8 `writeDocSummaryIfCurrent`

```typescript
writeDocSummaryIfCurrent(db: DbClient, entityId: string, repo: string, summary: DocSummary): Promise<"written" | "entity-gone" | "body-changed">
```

**Parameters:**
- `summary: DocSummary` — Carries contentHash, the sha256 of the body that was summarised.

**Returns:** `Promise<"written" | "entity-gone" | "body-changed">` — Whether the row was written, and why not.

**Errors:**
- `undefined` when undefined
- `undefined` when undefined

**Postconditions:**
- Inside one write transaction: when the entity row is absent, or its u64 is unknown, nothing is written and 'entity-gone' is returned; when sha256 of the stored row's body differs from summary.contentHash nothing is written and 'body-changed' is returned; otherwise the row is written exactly as writeDocSummary writes it and 'written' is returned.
- writeDocSummary itself and its callers are unchanged.

### 2.9 `summariseDoc`

```typescript
summariseDoc(args: SummariseDocArgs): Promise<SummariseDocResult>
```

**Parameters:**
- `args: SummariseDocArgs` — Unchanged.

**Returns:** `Promise<SummariseDocResult>` — SummariseDocResult.skipped gains 'entity-gone' and 'body-changed'; a summary the conditional write did not store is { ok: false, skipped: 'entity-gone' | 'body-changed' }.

**Postconditions:**
- Both writes (the summary and the error placeholder) go through writeDocSummaryIfCurrent.
- Summary write: a throw is reported as persistence-failed, as today; 'entity-gone' or 'body-changed' is reported as { ok: false, skipped: <reason> }.
- Placeholder write: a throw keeps today's behaviour (logged; the result carries the original model error); 'entity-gone' or 'body-changed' takes precedence over the model error and is reported as { ok: false, skipped: <reason> }, since the failed document is no longer current.

### 2.10 `IndexerService.summarySweepProgress`

```typescript
summarySweepProgress(): { repoPath: string; done: number; total: number } | undefined
```

**Returns:** `{ repoPath: string; done: number; total: number } | undefined` — The running sweep's progress, or undefined when no sweep runs.

**Postconditions:**
- IndexerService owns the progress: docSummariseRepo sets it before runDocSummarySweep, updates it from onProgress, and clears it in a finally block, so it is cleared when the sweep completes, stops or throws.

## 3. Data model changes

### 3.1 `IndexQueue state` — invariant-change

The queue holds two lanes, each with its own in-flight job. No stored data changes; the in-memory queue is still lost on restart, as today.

**Call sites:**
- `src/daemon/queue.ts:85`
- `src/daemon/queue.ts:193`
- `src/daemon/index.ts:289`

### 3.2 `DaemonStatus` — field-added

Optional queueLanes (per-lane depth, running, and the running sweep's progress). Additive; queueDepth unchanged.

**Call sites:**
- `src/shared/types.ts:915-918`
- `src/daemon/status.ts:66`
- `src/daemon/index.ts:1060`
- `src/daemon/status.ts:29-40`

### 3.3 `DocSummary row write` — invariant-change

A summary row written by the summariser is written only for an entity that exists with the summarised body, checked in the write transaction by the new writeDocSummaryIfCurrent; writeDocSummary is unchanged for its other callers.

**Call sites:**
- `src/db/doc-summaries.ts:139`
- `src/analyze/summariser/driver.ts:238`
- `src/analyze/summariser/driver.ts:274`

## 4. Error paths

**Error cases**

- **A code job deletes or rewrites a document while the summary lane is summarising it.** (recoverable)
  - Detection: writeDocSummaryIfCurrent reads the entity row inside its write transaction and compares the body hash.
  - Response: Nothing is written ('entity-gone' or 'body-changed'). Re-summarising a rewritten document is best-effort: the file event queues its single-document jobs, but an enqueue failure is only logged (src/indexer/index.ts:812-825); otherwise the next full index's sweep picks it up. A rewrite made by a full index is picked up by that index's own sweep.
  - User impact: No summary is written for a deleted document or from text that has since changed. A summary already stored still lags its document until that document is summarised again, as today (docs/plans/docs-module.md).
- **A job throws in either lane.** (recoverable)
  - Detection: The lane loop catches it, as today.
  - Response: Logged (store-lock case named as today); that lane continues; the other lane is unaffected.
  - User impact: One job lost, as today.
- **Shutdown while a summary is running.** (recoverable)
  - Detection: stop() sets both lanes to end and isStopping; the sweep checks shouldStop() before each entity.
  - Response: Each lane finishes its current job; a running sweep returns after the summary in progress. start resolves when both lanes have ended. Shutdown still has its hard-exit backstop at 20 s (src/daemon/shutdown.ts:117), which exits even if a summary is still running, and does not wait for the queue at all when the store has lost its locks (src/daemon/shutdown.ts:136-137); both are unchanged.
  - User impact: Shutdown waits at most for one summary, bounded by the 20 s backstop, as before.
- **Memory or GPU pressure from a summary and code embeddings running together.** (recoverable)
  - Detection: Not detected by the daemon.
  - Response: Accepted by the stakeholder; revisit (for example a serial mode) if it is seen.
  - User impact: Possible slower model calls.
- **The repo is unregistered or the write transaction fails while storing a summary.** (recoverable)
  - Detection: writeDocSummaryIfCurrent throws, as writeDocSummary does.
  - Response: summariseDoc reports persistence-failed, as today; the sweep counts it as failed and continues.
  - User impact: That summary is missing until the next sweep.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A sweep is running and 1,600 file jobs are enqueued. | The index lane runs them now; the sweep continues in parallel. |
| A .md file is edited while a sweep of 14,974 entities is running. | Its single-document jobs are taken by the sweep before its next entity. |
| A doc-summarise-entity job enqueued while a doc-summarise-repo job is queued but not started. | It runs before the sweep job. |
| A second doc-summarise-repo for the same repo while one is queued. | Deduplicated, as today. |
| daemon.compact while only the summary lane is running. | Refused, as today (isProcessing is true). |
| codeReview.freshness while only the summary lane has work. | Not processing: codeIndexWorkFor reads the index lane only. |
| An entity listed at the sweep start was deleted before its turn. | Counted as gone; no model call. |
| stop() during a sweep of 14,974 entities. | The sweep returns after the summary in progress with stopped: true; the progress is cleared. |
| A test fixture calls writeDocSummary with a synthetic hash. | Unchanged: writeDocSummary writes it. |
| A summary write returns 'body-changed' during a sweep. | Counted as gone, not failed. |
| The model call fails and the placeholder write returns 'entity-gone'. | { ok: false, skipped: 'entity-gone' }, not the model error. |

**Invariants to preserve**

- Within a lane, jobs run one at a time in queue order (except single-document jobs ahead of sweeps). [[c1]]
- An entity's summary is deleted with the entity, and never written for an entity that no longer exists. [[c2]]
- queueDepth, isProcessing, depthForRepo and codeIndexWorkFor keep their meaning for their readers. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (assert/strict), run under Node 22`

**Test levels**

- **unit** — The lanes, the sweep and the conditional write behave as specified.
  - Subjects: `src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves`, `src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep runs every queued single-document job before each entity, skips and counts an entity deleted after the sweep began, counts a throwing entity as failed and continues, classifies every result kind as summarised, skipped, gone or failed, reports progress after each entity, and returns stopped after the summary in progress once shouldStop is true`, `src/db/__tests__/doc-summaries-lmdb.test.ts: writeDocSummaryIfCurrent writes when the entity exists with the summarised body, writes nothing and returns entity-gone or body-changed otherwise, and throws for an unregistered repo; writeDocSummary is unchanged`, `src/daemon/__tests__/daemon-status-lanes.test.ts: buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress`, `src/analyze/summariser/__tests__/summarise-doc-current.test.ts: summariseDoc reports a summary the conditional write did not store as skipped entity-gone or body-changed, a thrown summary write as persistence-failed, a thrown placeholder write with the original model error, and a placeholder write that finds the entity gone or changed as skipped with that reason`, `src/indexer/__tests__/summary-sweep-progress.test.ts: IndexerService.summarySweepProgress is set while docSummariseRepo runs and cleared when the sweep completes, stops or throws`, `src/daemon/__tests__/queue-code-index-work.test.ts: the existing test asserts the order of the index lane's in-flight jobs only, independently of summary-lane interleaving, and stops once both lanes are empty`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves` |
| `ac2` | `src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves`, `src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep runs every queued single-document job before each entity, skips and counts an entity deleted after the sweep began, counts a throwing entity as failed and continues, classifies every result kind as summarised, skipped, gone or failed, reports progress after each entity, and returns stopped after the summary in progress once shouldStop is true`, `src/db/__tests__/doc-summaries-lmdb.test.ts: writeDocSummaryIfCurrent writes when the entity exists with the summarised body, writes nothing and returns entity-gone or body-changed otherwise, and throws for an unregistered repo; writeDocSummary is unchanged`, `src/analyze/summariser/__tests__/summarise-doc-current.test.ts: summariseDoc reports a summary the conditional write did not store as skipped entity-gone or body-changed, a thrown summary write as persistence-failed, a thrown placeholder write with the original model error, and a placeholder write that finds the entity gone or changed as skipped with that reason` |
| `ac3` | `src/daemon/__tests__/queue-lanes.test.ts: while a summary job is running and has not finished, an index job enqueued after it runs to completion; the two lanes run at the same time and each runs its jobs one at a time in order; summary kinds go to the summary lane and every other kind to the index lane; a single-document job is placed ahead of a queued sweep and takeDocSummaryEdit removes and returns it; depth, isProcessing and depthForRepo span both lanes (depthForRepo counts a queued sweep but not a single-document job), codeIndexWorkFor reads the index lane only, laneStatus reports each lane; stop ends both lanes and start resolves`, `src/daemon/__tests__/daemon-status-lanes.test.ts: buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress`, `src/indexer/__tests__/summary-sweep-progress.test.ts: IndexerService.summarySweepProgress is set while docSummariseRepo runs and cleared when the sweep completes, stops or throws`, `src/daemon/__tests__/queue-code-index-work.test.ts: the existing test asserts the order of the index lane's in-flight jobs only, independently of summary-lane interleaving, and stops once both lanes are empty` |

## 6. Migration

**State before:** Per s1: one FIFO with one worker runs every job kind (src/daemon/queue.ts:193, src/daemon/index.ts:289); a whole-repo summary sweep is one job (src/indexer/index.ts:918) and every code job queued after it waits for it.

**State after:** Two lanes run at the same time; summaries no longer delay code indexing; single-document summaries go ahead of sweeps; summaries are written only for current documents; status shows both lanes.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Split IndexQueue into an index lane and a summary lane with concurrent drain loops, edit priority, takeDocSummaryEdit and laneStatus. — ↩ rollbackable
2. Move the sweep loop into runDocSummarySweep (stop check, take queued edits first, re-read each entity) and call it from docSummariseRepo, which owns the sweep progress. — ↩ rollbackable
3. Add writeDocSummaryIfCurrent and route summariseDoc's two writes through it; writeDocSummary is unchanged. — ↩ rollbackable
4. Report queueLanes in daemon.status; record the serial-LLM exception in CLAUDE.md. — ↩ rollbackable
5. Update and restart the installed daemon. — ↩ rollbackable

**Backward compat:** No stored data changes. writeDocSummary and its callers are unchanged. DaemonStatus gains one optional field; queueDepth keeps its meaning. The in-memory queue is lost on restart, as today.

## 7. Alternatives considered

### 7.1 a1: Two lanes inside IndexQueue, one concurrent worker each — **CHOSEN**

IndexQueue keeps its API and routes each job to an index lane or a summary lane; start runs one drain loop per lane concurrently; the summary lane puts single-document jobs before sweeps and lets a running sweep take them between entities.

IndexQueue holds two FIFOs. enqueue routes doc-summarise-repo and doc-summarise-entity to the summary lane and every other kind to the index lane, with today's dedup per kind. start(processor) runs two drain loops at once and resolves when both have stopped; each loop is serial. In the summary lane a doc-summarise-entity job is inserted ahead of the first queued doc-summarise-repo job, and takeDocSummaryEdit() removes and returns the first queued doc-summarise-entity job so a running sweep can run it between entities. depth, isProcessing, depthForRepo span both lanes as today; codeIndexWorkFor reads the index lane only; laneStatus() reports each lane's depth and whether it is running. The sweep re-reads each entity before summarising it, and the summary write happens only if the entity still exists with the body that was summarised, checked inside the write transaction.

### 7.2 a2: Two separate queue instances

A second IndexQueue for summaries, created and started by the daemon, with the indexer holding both.

The daemon creates an index queue and a summary queue and passes both to IndexerService; every reader that needs totals (status, compaction, repo.stats) combines the two.

**Rejected because:** Partial on keeping the queue readers correct: every reader of queue state (status, compaction, repo.stats, freshness) would have to combine two queues, and a missed one misreports.

### 7.3 a3: One worker, index lane first, sweep yields

Two FIFOs, one worker that always serves the index lane first; a sweep yields to index work between entities.

As a1 but serial: the worker takes from the index lane while it has jobs; a sweep checks the index lane between entities.

**Rejected because:** Rejected by the stakeholder on 2026-10-17: code work would still wait for the summary in progress, and the stakeholder chose lanes that run at the same time.

## 8. References

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: the index queue and its worker (src/daemon/queue.ts:85, src/daemon/queue.ts:193, src/daemon/queue.ts:229)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: document summary jobs and what they write (src/indexer/index.ts:759, src/indexer/index.ts:812-819, src/indexer/index.ts:918)`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: the readers of queue state (src/daemon/index.ts:1060, src/daemon/status.ts:66, src/shared/types.ts:915-918)`
- **[[c4]]** `step-output` `s1 context.assemble bundle 4: queue and summary tests (src/daemon/__tests__/queue-depth-for-repo.test.ts, src/daemon/__tests__/queue-code-index-work.test.ts, src/db/__tests__/doc-summaries-lmdb.test.ts)`
- **[[c5]]** `stakeholder` `Stakeholder decisions in chat, 2026-10-17: two lanes running at the same time as an accepted exception to serial LLM calls, revisited if memory or GPU becomes a problem; single-document summaries ahead of sweeps, with a running sweep yielding to them` — "let's go with the reco, if memory/GPU become an issue we will revisit again"

## 9. Open questions

- ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps three derived from the request (ac1 code indexing never waits on summaries, ac2 summaries still run with edits first and only for current documents, ac3 status and the queue readers stay correct) [c5].

## Resolved questions

- `q6401ddcc` — ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps three derived from the request (ac1 code indexing never waits on summaries, ac2 summaries still run with edits first and only for current documents, ac3 status and the queue readers stay correct) [c5].
  - **resolved**: Adopt all three criteria — Same decision as the user's for ISSUE-5437d6e5, ISSUE-1102dc71 and ISSUE-bd1c6c90 (2026-10-16/17): keep the criteria derived from the approved request, recorded with that provenance. _(2026-10-17T13:20:21.772Z)_

## Citations

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: the index queue and its worker (src/daemon/queue.ts:85, src/daemon/queue.ts:193, src/daemon/queue.ts:229)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: document summary jobs and what they write (src/indexer/index.ts:759, src/indexer/index.ts:812-819, src/indexer/index.ts:918)`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: the readers of queue state (src/daemon/index.ts:1060, src/daemon/status.ts:66, src/shared/types.ts:915-918)`
- **[[c4]]** `step-output` `s1 context.assemble bundle 4: queue and summary tests (src/daemon/__tests__/queue-depth-for-repo.test.ts, src/daemon/__tests__/queue-code-index-work.test.ts, src/db/__tests__/doc-summaries-lmdb.test.ts)`
- **[[c5]]** `stakeholder` `Stakeholder decisions in chat, 2026-10-17: two lanes running at the same time as an accepted exception to serial LLM calls, revisited if memory or GPU becomes a problem; single-document summaries ahead of sweeps, with a running sweep yielding to them` — "let's go with the reco, if memory/GPU become an issue we will revisit again"
