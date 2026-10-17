<!-- insrc:artifact LLD-0f0e4f45f698aeb6-S001 -->

# LLD: E202610170f0e4f45:S001

## Summary

**Epic:** `summary-lane-yields-code-work`
**HLD base run:** `wf-1792257944235-ukxphq`
**HLD effective hash:** `2da4d7bb1c55...`

The summary lane stops competing with code indexing for the local model. Before it starts a summary, it waits until the index lane has nothing running and nothing queued, and a running sweep does the same before each document and each edited document. Code therefore waits at most for the one summary already in progress; summaries pick up again when the code work is done, and shutdown still ends both lanes.

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

### 2.1 `IndexQueue.waitForIndexIdle`

```typescript
waitForIndexIdle(): Promise<void>
```

**Returns:** `Promise<void>` — Resolves once the index lane has no job running and none queued, or once stop() has been called.

**Postconditions:**
- Resolves at once when the index lane is already idle or the queue is stopping.
- Every waiter is released when the index lane next becomes idle (its in-flight job finished and its queue empty) and when stop() is called.

### 2.2 `IndexQueue summary-lane drain`

```typescript
private drain(lane, processor): Promise<void>  // the summary lane awaits waitForIndexIdle() before taking each job
```

**Returns:** `Promise<void>` — Unchanged.

**Postconditions:**
- The summary lane takes its next job only when the index lane is idle; a job already running is not interrupted.
- After the wait the loop re-checks stopped and ends if the queue is stopping.
- The index lane never waits for the summary lane.

### 2.3 `runDocSummarySweep`

```typescript
runDocSummarySweep(entityIds, deps: DocSummarySweepDeps & { waitForCodeIdle(): Promise<void> }): Promise<DocSummarySweepCounts>
```

**Parameters:**
- `deps.waitForCodeIdle: () => Promise<void>` — Waits until code work is done (the queue's waitForIndexIdle).

**Returns:** `Promise<DocSummarySweepCounts>` — Unchanged.

**Postconditions:**
- Before each document the sweep repeats, until no single-document job is queued: await waitForCodeIdle, check shouldStop (return stopped if true), take the next queued single-document job and run it. Only then does it read and summarise the document; so an edit queued while the sweep is paused runs before the next sweep document.
- Everything else as today: re-read, classification, progress, stopped.

### 2.4 `docSummariseRepo wiring`

```typescript
waitForCodeIdle: () => this.queue.waitForIndexIdle()
```

**Returns:** `void` — Wiring only.

**Postconditions:**
- The sweep the indexer runs yields to the index lane.

## 3. Data model changes

### 3.1 `IndexQueue state` — invariant-change

The two lanes no longer start model work at the same time: the summary lane starts a summary only while the index lane is idle. Only the one summary in progress can overlap code work.

**Call sites:**
- `src/daemon/queue.ts`
- `src/indexer/doc-summary-sweep.ts`
- `src/indexer/index.ts`

## 4. Error paths

**Error cases**

- **Shutdown while the summary lane or a sweep is waiting for code work.** (recoverable)
  - Detection: stop() releases every waiter of waitForIndexIdle.
  - Response: The summary lane loop and the sweep re-check stopped / shouldStop after the wait and end.
  - User impact: Shutdown is not delayed by the wait.
- **Code work never ends (a steady stream of file events).** (recoverable)
  - Detection: The wait does not resolve.
  - Response: Summaries stay postponed until the index lane is idle; this is the intended priority.
  - User impact: Summaries lag behind code work; code indexing runs at full speed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An index job is enqueued while a summary is running. | The index job starts at once; the running summary finishes; the next summary waits until the index lane is idle. |
| A summary-lane job is enqueued while the index lane is idle. | It starts at once. |
| A sweep of many documents while file jobs keep arriving. | The sweep pauses before each document until the index lane is idle, then continues. |
| An edited document is queued during a paused sweep. | It runs first once code work is done, as before. |
| An edit is queued while a sweep is paused waiting for code work. | When code work ends, the edit runs before the next sweep document. |

**Invariants to preserve**

- The index lane never waits for the summary lane. [[c1]]
- stop() ends both lanes after their current jobs. [[c1]]
- Single-document jobs go ahead of sweeps. [[c1]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (assert/strict), run under Node 22`

**Test levels**

- **unit** — The summary lane and a running sweep yield to code work and still end on shutdown.
  - Subjects: `src/daemon/__tests__/queue-lanes.test.ts: a summary-lane job queued while an index job runs does not start until the index lane is idle; a summary already running is not interrupted and an index job enqueued during it starts at once (the overlap case, replacing the pre-queued overlap assertion); the readers test is revised to the code-first order (a queued summary waits behind index work, laneStatus shows it queued); waitForIndexIdle resolves at once when the index lane is idle and on stop(), and a summary lane waiting for code work ends on stop()`, `src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep awaits waitForCodeIdle before each single-document job and each document, an edit queued while it is paused runs before the next document, and it ends with stopped when shouldStop is true after the wait`, `src/indexer/__tests__/summary-sweep-progress.test.ts: the indexer's sweep pauses while the queue's index lane has work and continues when it is idle`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/__tests__/queue-lanes.test.ts: a summary-lane job queued while an index job runs does not start until the index lane is idle; a summary already running is not interrupted and an index job enqueued during it starts at once (the overlap case, replacing the pre-queued overlap assertion); the readers test is revised to the code-first order (a queued summary waits behind index work, laneStatus shows it queued); waitForIndexIdle resolves at once when the index lane is idle and on stop(), and a summary lane waiting for code work ends on stop()`, `src/indexer/__tests__/summary-sweep-progress.test.ts: the indexer's sweep pauses while the queue's index lane has work and continues when it is idle` |
| `ac2` | `src/daemon/__tests__/queue-lanes.test.ts: a summary-lane job queued while an index job runs does not start until the index lane is idle; a summary already running is not interrupted and an index job enqueued during it starts at once (the overlap case, replacing the pre-queued overlap assertion); the readers test is revised to the code-first order (a queued summary waits behind index work, laneStatus shows it queued); waitForIndexIdle resolves at once when the index lane is idle and on stop(), and a summary lane waiting for code work ends on stop()`, `src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep awaits waitForCodeIdle before each single-document job and each document, an edit queued while it is paused runs before the next document, and it ends with stopped when shouldStop is true after the wait` |
| `ac3` | `src/daemon/__tests__/queue-lanes.test.ts: a summary-lane job queued while an index job runs does not start until the index lane is idle; a summary already running is not interrupted and an index job enqueued during it starts at once (the overlap case, replacing the pre-queued overlap assertion); the readers test is revised to the code-first order (a queued summary waits behind index work, laneStatus shows it queued); waitForIndexIdle resolves at once when the index lane is idle and on stop(), and a summary lane waiting for code work ends on stop()`, `src/indexer/__tests__/doc-summary-sweep.test.ts: runDocSummarySweep awaits waitForCodeIdle before each single-document job and each document, an edit queued while it is paused runs before the next document, and it ends with stopped when shouldStop is true after the wait` |

## 6. Migration

**State before:** Per s1: the index and summary lanes run at the same time (src/daemon/queue.ts); a summary and code embeddings reach Ollama together.

**State after:** The summary lane starts a summary only while the index lane is idle; a running sweep pauses before each document while code work runs.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add waitForIndexIdle, make the summary lane await it before each job, and revise the two queue-lane tests that assumed pre-queued overlap. — ↩ rollbackable
2. Add waitForCodeIdle to the sweep runner and wire it in docSummariseRepo. — ↩ rollbackable
3. Update the exception in CLAUDE.md and AGENTS.md. — ↩ rollbackable
4. Update and restart the installed daemon. — ↩ rollbackable

**Backward compat:** No stored data or status field changes; laneStatus and the queue readers keep their meaning.

## 7. Alternatives considered

### 7.1 a1: Wait for an idle index lane before each summary — **CHOSEN**

The queue exposes waitForIndexIdle(); the summary lane awaits it before each job, and a running sweep awaits it before each document and each single-document job.

IndexQueue.waitForIndexIdle() resolves when the index lane has no job running and none queued, or once stop() has been called. The summary lane's drain loop awaits it before shifting its next job. runDocSummarySweep gains a deps.waitForCodeIdle() it awaits before each single-document job and each document, re-checking shouldStop after it; docSummariseRepo wires it to the queue.

### 7.2 a2: Back to one worker with the index lane first

Replace the two loops with one that serves the index lane first.

One drain loop takes from the index lane while it has jobs, else from the summary lane; the sweep checks the index lane between documents.

**Rejected because:** Undoes the shipped lanes and their tests for the same behaviour as a1.

### 7.3 a3: Poll a pause flag

The summary lane polls laneStatus every second and sleeps while the index lane is busy.

A timer-based check before each summary.

**Rejected because:** Partial on the request: polling adds up to a poll interval of waiting and timers in tests.

## 8. References

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: the lanes and the sweep (src/daemon/queue.ts, src/indexer/doc-summary-sweep.ts, src/indexer/index.ts)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: measured contention (CLAUDE.md, AGENTS.md)`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: tests (src/daemon/__tests__/queue-lanes.test.ts, src/indexer/__tests__/doc-summary-sweep.test.ts, src/indexer/__tests__/summary-sweep-progress.test.ts)`
- **[[c4]]** `stakeholder` `Stakeholder decision 2026-10-17 (decision 2, option A): the summary lane yields while the index lane has work`

## 9. Open questions

- ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps three derived from the request (ac1 code work waits at most for the summary in progress, ac2 summaries resume afterwards with edits first, ac3 shutdown still ends both lanes) [c4].

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 8 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-17T17:25:53.096Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | The three derived acceptance criteria exhaust the original stakeholder decision and its non-goals. | Searched repository docs and .insrc artifacts for the epic hash, slug, and workflow run. Found the LLD and its triage metadata, but no independent record of stakeholder decision 2, option A or an upstream acceptance-criteria list. The analyzer also failed with shaper-llm-unavailable caused by an invalid response schema. [files: .insrc/artifacts/LLD-0f0e4f45f698aeb6-S001.json, docs/standalone/summary-lane-yields-code-work-E202610170f0e4f45/S001/LLD.md] | Attach the original decision or explicitly confirm the three derived criteria as the authoritative scope. |
