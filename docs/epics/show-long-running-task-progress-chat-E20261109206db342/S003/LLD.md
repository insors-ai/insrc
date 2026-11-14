<!-- insrc:artifact LLD-206db3426ffd4428-s3 -->

# LLD: STORY-206db3426ffd4428-s3 — Report design and code review milestones

## Summary

**Epic:** `show-long-running-task-progress-chat`
**HLD base run:** `wf-1794211533808-ghbhlu`
**HLD effective hash:** `48a6a5468b45...`
**Tracker:** [insors-ai/insrc#177](https://github.com/insors-ai/insrc/issues/177)

Adds two read-only delegates that turn the progress design reviews and committed task code reviews already publish into the shared task-progress contract. A participant sees the active phase and unit, how many chunks or tasks are done, retained design coverage kept apart from fresh chunks, and whether code-review publication is pending or complete. Retries and follow-up work are reported only when an engine reports them; today they are unknown. Review execution, results, retries and publication are not changed.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-206db3426ffd4428** § 2. Framework summary

**Rollout phase:** Phase B — executor measurement adapters
**Owns:** `sc5` (Review measurements)
**Consumes:** `sc1` (Task identity and delegate observation), `sc2` (Scoped snapshots, subscriptions and observation control), `sc3` (Execution-owned activity and chat retention)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own daemon coordination, verified registration, cursors, normalization, scoped read/subscribe/control, durable state, owner fencing and fallback schedule arbitration. Keep storage, fencing and expiry implementation private. — owns `sc1`, `sc2`, `sc3`
- `s2`: Own adapters for existing workflow and analyze producer signals and terminal/owner evidence. Existing stream shape and command semantics remain compatible. — owns `sc4`
- `s4`: Own TestDelegate and managed reporter interpretation, including suite/case identity, provisional counts and abnormal exit. Keep test orchestration and exit semantics unchanged. — owns `sc6`
- `s5`: Own typed VS Code reader and transcript row, current status projection and bindings to the session owner. Render durable snapshots by origin across turns and multiple windows without executing or polling models.
- `s6`: Own MCP adapter, capability qualification, explicit opt-in disclosure and connection to the coordinator's fallback lease. No vendor-specific process changes or assumptions about session identity.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DesignReviewDelegate`

```typescript
class DesignReviewDelegate implements TaskProgressDelegate<DesignReviewDetails>
```

**Returns:** `TaskProgressDelegate<DesignReviewDetails>` — A delegate for one design-review attempt that answers progress() from the latest validated ReviewProgressPublication of family 'design' held by ReviewWorkers (src/daemon/threads/review-workers.ts), read through ReviewWorkers.progressOf for the attempt's review identity.

**Errors:**
- `none thrown` when A missing, foreign-attempt or invalid publication makes progress() return null, which the coordinator reports as unavailable.

**Preconditions:**
- The task's invocation is bound to one design review identity (project, reviewId, attempt) by the verified owner at registration.
- The delegate was registered through ProducerPort.register with a daemon-minted ProducerAuthorization.

**Postconditions:**
- progress() never returns a count the publication did not carry; retries is null.
- A publication whose attempt or incarnation is older than the one already observed is ignored.
- Reading progress does not renew owner activity or change meaningfulRevision unless a meaningful field changed.

### 2.2 `DesignReviewDelegate.progress`

```typescript
progress(task: TaskRef, signal?: AbortSignal): Promise<DelegateMeasurement<DesignReviewDetails> | null>
```

**Parameters:**
- `task: TaskRef` — The attempt to measure.
- `signal: AbortSignal` _(optional)_ — Stops the read when the coordinator abandons it.

**Returns:** `DelegateMeasurement<DesignReviewDetails> | null` — Phase from planning | impact | chunk_review | complete; activeUnit from the active chunk id; counts for chunks; details per DesignReviewDetails.

**Errors:**
- `null result` when No verified publication exists for the task's review identity.

**Preconditions:**
- task is the delegate's registered attempt.

**Postconditions:**
- counts hold reviewed chunks against selected chunks as unit 'chunks'; retained coverage is carried only in details.retainedChunks.
- Terminal review statuses are not reported as running.

### 2.3 `DesignReviewDelegate.ownerActivity`

```typescript
ownerActivity(task: TaskRef, signal: AbortSignal): Promise<number | null>
```

**Parameters:**
- `task: TaskRef` — The attempt whose owner is probed.
- `signal: AbortSignal` — Aborts the probe.

**Returns:** `number | null` — The next owner sequence when the publishing review incarnation is verified current by comparing the ReviewWorkers entry incarnation (ReviewWorkers.identity) with the incarnation of the last accepted publication, else null.

**Errors:**
- `null result` when The incarnation changed, the worker is gone, or no publication has been observed.

**Preconditions:**
- A publication has been observed for this attempt.

**Postconditions:**
- A heartbeat or session-start only renews liveness and never increments counts.

### 2.4 `CodeReviewDelegate`

```typescript
class CodeReviewDelegate implements TaskProgressDelegate<CodeReviewDetails>
```

**Returns:** `TaskProgressDelegate<CodeReviewDetails>` — A delegate for one committed task code-review attempt that answers progress() from the latest validated ReviewProgressPublication of family 'code' held by ReviewWorkers (src/daemon/threads/review-workers.ts), read through ReviewWorkers.progressOf.

**Errors:**
- `none thrown` when A missing, foreign-attempt or invalid publication makes progress() return null.

**Preconditions:**
- The task's invocation is bound to one code review identity (project, reviewId, attempt) at registration.
- Registered through ProducerPort.register with a daemon-minted ProducerAuthorization.

**Postconditions:**
- initial counts tasks completed against total; followUp and retries are null.
- publication maps crPublication pending | complete and failed review status to 'failed'; otherwise 'unknown'.

### 2.5 `CodeReviewDelegate.progress`

```typescript
progress(task: TaskRef, signal?: AbortSignal): Promise<DelegateMeasurement<CodeReviewDetails> | null>
```

**Parameters:**
- `task: TaskRef` — The attempt to measure.
- `signal: AbortSignal` _(optional)_ — Stops the read.

**Returns:** `DelegateMeasurement<CodeReviewDetails> | null` — Phase from the ReviewProgress phase set; activeUnit from the current task name; counts for tasks; details per CodeReviewDetails.

**Errors:**
- `null result` when No verified publication for the review identity.

**Preconditions:**
- task is the delegate's registered attempt.

**Postconditions:**
- lastMeaningfulAt follows lastMeaningfulActivityAt, so a quiet but alive worker reports health without a revision change.

### 2.6 `CodeReviewDelegate.ownerActivity`

```typescript
ownerActivity(task: TaskRef, signal: AbortSignal): Promise<number | null>
```

**Parameters:**
- `task: TaskRef` — The attempt whose owner is probed.
- `signal: AbortSignal` — Aborts the probe.

**Returns:** `number | null` — The next owner sequence when the executing review is verified alive (observation processState alive and the ReviewWorkers entry incarnation unchanged), else null.

**Errors:**
- `null result` when processState is exited or unknown, or the executionId changed.

**Preconditions:**
- A publication has been observed for this attempt.

**Postconditions:**
- Does not renew activity from observer reads alone.

### 2.7 `ReviewWorkers.progressOf`

```typescript
progressOf(key: ReviewKey): ReviewWorkerProgress | undefined
```

**Parameters:**
- `key: ReviewKey` — The review identity (project, family, reviewId) bound to the task at registration.

**Returns:** `ReviewWorkerProgress | undefined` — A frozen structured clone of the entry's last accepted progress: incarnation, attempt, sequence, phase, completed, total, observation (the full ReviewObservation) and display. Undefined when no entry exists or the entry is closing.

**Errors:**
- `undefined result` when No entry for the key, the entry is closing, or nothing has been accepted yet.

**Preconditions:**
- Called on the main thread that owns the review workers; delegates never reach a worker thread.

**Postconditions:**
- Read-only: it neither advances sequence, renews any activity grace, nor posts to a worker.
- It returns only what acceptPublication and acceptProgress already validated; it adds no new write path.

## 3. Data model changes

### 3.1 `DesignReviewDetails` — new

sc5 details for kind 'design-review': target (artifact id), checks (MeasuredCount|null), freshChunks (reviewed against selected chunks, unit 'chunks'), retainedChunks (coverageProgress.retainedChunks, number|null), retries (null: the design engine publishes no retry count). Cardinality: one DesignReviewDetails per design-review task attempt; a task attempt maps to exactly one design review attempt and is read-only over it.

```
interface DesignReviewDetails { readonly kind: 'design-review'; readonly target: string; readonly checks: MeasuredCount | null; readonly freshChunks: MeasuredCount | null; readonly retainedChunks: number | null; readonly retries: number | null }
```

**Call sites:**
- `src/workflow/review/design-review/progress.ts`
- `src/daemon/threads/review-progress.ts`
- `src/shared/task-progress.ts`

### 3.2 `CodeReviewDetails` — new

sc5 details for kind 'code-review': target (BUILD or CR artifact id), initial (tasks completed against total, unit 'tasks'), followUp (null: ReviewProgress has no follow-up count), retries (null), publication (pending | complete from crPublication, failed when review status is failed, else unknown). Cardinality: one CodeReviewDetails per code-review task attempt, mapped to one review execution.

```
interface CodeReviewDetails { readonly kind: 'code-review'; readonly target: string; readonly initial: MeasuredCount | null; readonly followUp: MeasuredCount | null; readonly retries: number | null; readonly publication: 'pending' | 'complete' | 'failed' | 'unknown' }
```

**Call sites:**
- `src/workflow/code-review/task-review/progress.ts`
- `src/workflow/code-review/task-review/progress-view.ts`
- `src/daemon/threads/review-progress.ts`
- `src/shared/task-progress.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/show-long-running-task-progress-chat-E20261109206db342/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | Defines DesignReviewDetails and CodeReviewDetails exactly as sketched, with validators, and the two delegates that produce them. Fields the engines do not report are null, never inferred. |
| `sc1` | consumes | Implements TaskProgressDelegate parameterized by its own details type and registers each delegate through the coordinator's registerProducer/ProducerPort.register with a daemon-minted authorization. |
| `sc2` | consumes | Snapshots, cursors, freshness and the cancel-vs-stop controls come from the coordinator; delegates expose no cancel, so controls stay empty for reviews. |
| `sc3` | consumes | ownerActivity feeds the coordinator's lease renewal. Retention association and expiry stay with s1. |

## 6. Error paths

**Error cases**

- **No publication exists for the task's review identity (worker not started, no ReviewWorkers entry for the key, or review already cleaned up).** (recoverable)
  - Detection: ReviewWorkers.progressOf(key) returns undefined, or the entry has no observation yet, or the result fails isReviewWorkerStatus / the family decoder.
  - Response: progress() returns null; the coordinator reports freshness 'unavailable'. No count is invented and no state is changed.
  - User impact: The observer sees the review as unavailable rather than a wrong number.
- **A publication for a different review identity or attempt is returned for the task (foreign identity).** (recoverable)
  - Detection: The publication's key.project, key.family, key.reviewId or attempt differs from the identity bound at registration; reviewProgressPublication already throws 'Foreign ... progress identity' for the same mismatch.
  - Response: The delegate discards it and returns null; it never maps the foreign values.
  - User impact: No cross-review leakage; the observer sees unavailable until the right publication arrives.
- **A delayed publication from an earlier review incarnation or execution arrives after a newer one (interrupt then resume).** (recoverable)
  - Detection: Comparing publication.incarnation and publication.sequence (and executionId for code review) with the last accepted pair held by the delegate.
  - Response: The older publication is ignored; the last accepted values stay authoritative and ownerActivity returns null for a changed incarnation until it is reverified.
  - User impact: Progress never moves backwards after a resume; the task shows interrupted or unknown until the new owner is verified.
- **A publication claims reviewed work while admission is unverified.** (recoverable)
  - Detection: reviewProgressPublication already throws for an admission with reviewed counts; the delegate also checks admission.validation === 'unverified' with completed > 0.
  - Response: The delegate returns null for that sample and keeps the previous accepted measurement.
  - User impact: A review that failed admission is not shown as partly done.
- **Counts are inconsistent (completed greater than total, or retained plus selected chunks not equal to planned).** (recoverable)
  - Detection: isReviewWorkerStatus requires completed <= total; designCoverageProgress requires planned = selected + retained and reviewed <= selected and throws otherwise.
  - Response: The sample is dropped (null) and the inconsistency is counted in observability under 'invalid source', not shown as a count.
  - User impact: No impossible progress such as 5/3 is displayed.
- **The progress source cannot be read (the ReviewWorkers entry is closing or removed while the delegate reads).** (recoverable)
  - Detection: ReviewWorkers.progressOf returns undefined for a previously observed key, or the abort signal fires.
  - Response: progress() returns null and never throws into the coordinator; ownerActivity returns null so the coordinator marks the owner stale after its grace.
  - User impact: The task shows stale or unknown, never completed or cancelled because of a read failure.
- **A review ends terminally (passed, changes_requested, incomplete, failed, interrupted, invalidated) between two samples.** (terminal)
  - Detection: The publication status is a terminal value or phase 'complete' / 'interrupted' / 'error'.
  - Response: The delegate reports the terminal phase from the engine unchanged and leaves lifecycle recording to the owner evidence path; it never maps a review verdict onto a task success or failure.
  - User impact: Findings and verdicts stay in the review report; progress shows only that the work is no longer running.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Design review with retained coverage from an earlier attempt (retainedChunks > 0) and zero fresh chunks selected. | checks and freshChunks report 0 of 0 chunks; retainedChunks carries the retained count separately; the review is not shown as having reviewed fresh work. |
| Code review before the first task starts (total tasks 0, phase scope_preparation). | initial is null or 0 of 0 with unit 'tasks', activeUnit is null, phase is scope_preparation. |
| Quiet code-review worker: heartbeat events only for several minutes. | processState stays alive and ownerActivity renews, but counts, meaningfulRevision and lastMeaningfulAt do not change. |
| Code review with all tasks complete and crPublication still pending. | initial shows total of total tasks, publication is 'pending', and the phase is cr_publication; completion is not implied. |
| Task name longer than 256 characters or containing control characters. | The name is already cleaned and truncated by ReviewProgressTracker; the delegate also bounds activeUnit to the progress label limit and drops control characters. |
| Several reviews run at once for the same project. | Each task attempt binds one review identity, so measurements never mix; ReviewWorkers.progressOf is read per key. |
| A design review advances to a new attempt (acceptPublication resets the entry progress when raw.attempt is the pending attempt). | The delegate sees a new attempt in the publication; the earlier attempt stays authoritative for its own task attempt and the new attempt reports as a new task attempt rather than overwriting it. |

**Invariants to preserve**

- Heartbeat and session-start events are liveness only and never increment progress counts or lastMeaningfulActivityAt. [[c2]]
- Observing or polling progress never renews the owner's grace period; only the native or controller activity monitor does. [[c2]]
- Review progress publication is a bounded display projection and carries no findings, commands or authority; review results, admission, retries and publication stay under the review engines. [[c2]]
- Unverified admission cannot claim reviewed work or a passing result. [[c2]]
- Delegates implement TaskProgressDelegate and the coordinator, not the delegate, decides snapshots, cursors, freshness and lifecycle; unknown measurements stay null. [[c1]]
- The coordinator registers one producer per kind, so a second registration of the same kind is refused. [[c1]]

## 7. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), test files in __tests__ directories next to the code, named *.test.ts`

**Test levels**

- **unit** — Prove the pure mapping from a review publication to sc5 details, including every null and unknown field, without a coordinator.
  - Subjects: `DesignReviewDelegate.progress maps phase, active chunk, reviewed against selected chunks and retained coverage`, `CodeReviewDelegate.progress maps phase, active task, completed against total tasks and publication state`, `retries and followUp are null for both kinds`, `foreign identity, invalid counts and unverified admission yield null`, `stale incarnation or sequence is ignored`, `heartbeat-only samples leave counts and meaningfulRevision unchanged`
  - Fixtures: `a ReviewProgressPublication builder for family design and family code`, `a fixed clock`
- **integration** — Prove registration with a real ProgressCoordinator and store, owner activity renewal, interruption and resume, and that review results are untouched.
  - Subjects: `register both delegates through registerProducer and ProducerPort.register with a minted authorization`, `snapshot after interruption shows interrupted/stale, then a newer incarnation is verified`, `a delayed publication from the earlier incarnation does not overwrite the newer snapshot`, `reading progress does not renew owner activity`, `second registration of the same kind is refused`, `ReviewWorkers.progressOf returns a clone of the last accepted progress and undefined for a closing or unknown key`
  - Fixtures: `temporary progress store directory`, `a ReviewWorkers test double exposing progressOf and identity with controllable incarnation and sequence`
- **contract** — Keep the review details compatible with the s1 delegate contract and the producers the review engines already feed.
  - Subjects: `DesignReviewDetails and CodeReviewDetails pass the bounded measurement schema and stay under 8 KiB`, `mapped publications round-trip through reviewProgressPublication without changing it`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/task-progress/__tests__/review-measurements.test.ts: design review reports active chunk, reviewed against selected chunks and retained coverage separately`, `src/daemon/task-progress/__tests__/review-measurements.test.ts: code review reports active task, completed against total tasks and publication state`, `src/daemon/task-progress/__tests__/review-measurements.test.ts: retries and follow-up stay null when the engine reports none`, `src/daemon/task-progress/__tests__/review-measurements.test.ts: heartbeat-only samples keep counts and meaningful revision unchanged` |
| `ac2` | `src/daemon/task-progress/__tests__/review-measurements.test.ts: a delayed publication from an earlier incarnation does not replace the newer measurement`, `src/daemon/task-progress/__tests__/review-measurements.test.ts: an interrupted review reads as interrupted until the new incarnation is verified`, `src/daemon/task-progress/__tests__/review-measurements.test.ts: observing progress leaves review results, publication and approval unchanged`, `src/daemon/threads/__tests__/review-workers-progress-of.test.ts: progressOf is read-only and never advances sequence or renews grace` |

## 8. Migration

**State before:** Design and code reviews already compute bounded progress (DesignProgressTracker, ReviewProgressTracker) and publish it from review worker threads; the main-thread ReviewWorkers class validates each publication (acceptPublication, acceptProgress) and keeps the latest per review key, including incarnation, sequence and the full observation. The status board receives only the display projection (ReviewWorkerStatus), which lacks incarnation, sequence, retained chunks, the active chunk, publication state and process liveness. The shared task-progress coordinator registers only the workflow and analysis producers (registerExecutorProducers); validateExecutorDetails rejects the design-review and code-review kinds, although ProgressKind already names them. No review attempt is a coordinator task today.

**State after:** A review attempt is also a coordinator task with kind design-review or code-review. DesignReviewDelegate and CodeReviewDelegate read the existing publication and report sc5 details through the shared snapshot, cursor and freshness model. Review engines, checkpoints, results, publication and approval gates are unchanged. Retries and follow-up are reported as unknown until an engine publishes them.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the review details types, their bounded validators and the two delegates in a new module beside the task-progress code, and add the read-only ReviewWorkers.progressOf accessor in src/daemon/threads/review-workers.ts; nothing registers them yet. — ↩ rollbackable
2. Register one design-review and one code-review producer with the coordinator that hosts the review kinds, using the daemon-minted authorization, but start no task until a review attempt is bound; the choice between a second typed coordinator and a widened details union is settled in the plan as an open question. — ↩ rollbackable
3. At review start, bind the review identity (project, family, reviewId, attempt) to a task attempt and register its delegate; at review end, record the owner's terminal evidence without deriving it from the review verdict. — ↩ rollbackable
4. Add tests, run the review and task-progress suites, and verify that review results, checkpoints and publications are byte-for-byte unchanged for an unobserved review. — ↩ rollbackable

**Backward compat:** ReviewWorkers gains one read-only method and no existing method changes. No public API, IPC frame, checkpoint schema or review result changes. Reviews that nobody observes behave exactly as today, because registration only reads the existing publication. ProgressKind already contains the two kinds, so stored progress records stay readable; the only new stored values are review details under those kinds.

## 9. Alternatives considered

### 9.1 a1: Pull delegates over the existing review publication, own coordinator typing — **CHOSEN**

Two thin delegates project the already-published review observations into sc5 details and register through their own typed producer, leaving s2's executor union untouched.

Add a review-measurements module under src/daemon/task-progress that defines DesignReviewDetails and CodeReviewDetails (sc5) with typebox validators, plus DesignReviewDelegate and CodeReviewDelegate implementing TaskProgressDelegate. Each delegate's progress(task) reads the latest ReviewProgressPublication for the review identity (project, family, reviewId, attempt) from the main-thread ReviewWorkers class through a new read-only accessor (ReviewWorkers.progressOf in src/daemon/threads/review-workers.ts), which holds the latest validated ReviewProgressPublication per review key; the status board is not used because it carries only the display projection and maps it: code review phase/task/completedTasks/totalTasks/crPublication to initial count, activeUnit and publication; design review phase/completedChunks/totalChunks/activeChunkId/coverageProgress to checks, freshChunks and retainedChunks. Fields the engines do not report (retries, followUp) are null, never inferred. ownerActivity maps the publication's incarnation/sequence and process liveness to the owner fence; heartbeat-only liveness never changes meaningfulRevision. A second ProgressCoordinator typed on the review details union registers both producers, so ExecutorDetails and validateExecutorDetails in s2's file stay unchanged. No change to review engines.

### 9.2 a2: Widen the s2 executor union

Extend ExecutorDetails and validateExecutorDetails with the two review kinds and register review producers in registerExecutorProducers on the single shared coordinator.

Edit src/daemon/task-progress/executor-measurements.ts so ExecutorDetails becomes WorkflowDetails | AnalysisDetails | DesignReviewDetails | CodeReviewDetails, extend validateExecutorDetails to accept the two review kinds, and add design-review and code-review entries to registerExecutorProducers. Delegates and the mapping from review publications are as in a1.

**Rejected because:** Equivalent behavior to a1 but crosses the s2 boundary the HLD forbids silently crossing (partial on sc1 and k2); kept as the fallback if consumers cannot take two details unions.

### 9.3 a3: Push relay from review workers

Review worker threads push each accepted progress change to the coordinator through a fenced port, like the executor relay.

Add a ReviewProgressRelay that the review worker publication path calls on every accepted ReviewProgressPublication, forwarding a fenced event (incarnation, sequence) to the coordinator over a dedicated channel. Delegates answer progress() from the latest pushed value and supply owner evidence from the push stream, so every meaningful change is observed immediately and delayed events from a prior incarnation are rejected at the relay.

**Rejected because:** L-sized, adds a new thread-to-main channel and touches review execution, which the epic excludes; only justified if a1's pull cadence proves too coarse.

### 9.4 a4: Extend engine progress schemas for retries and follow-up

Add retry and follow-up counters to ReviewProgress and DesignReviewProgress so sc5 can report every field.

Add retries and followUp counters to ReviewProgress (task-review/progress.ts) and DesignReviewProgress, populated by the existing engines when they retry a chunk or discover follow-up work, then project them through the delegates of a1.

**Rejected because:** Violates the DEF's non-goal on changing review execution (k2) and needs checkpoint schema versioning; the missing counters are better tracked as a separate follow-up Story.

## 10. References

- **[[c1]]** `analyze-bundle` `src/daemon/task-progress/coordinator.ts` — "ProgressCoordinator is generic over a details union D and registers a producer per kind with registerProducer(kind, projectDetails)"
- **[[c2]]** `analyze-bundle` `src/daemon/threads/review-progress.ts` — "reviewProgressPublication(input, sequence, observation) validates family identity, rejects unverified admission claiming reviewed work"
- **[[c3]]** `analyze-bundle` `src/daemon/task-progress/__tests__/executor-relay.test.ts` — "Tests use node:test run through tsx."
- **[[c4]]** `step-output` `s3 alternatives.judge winner a1`
- **[[c5]]** `doc` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/DEF.md` — "Changes to review execution, workflow stages, approval gates or model providers"
- **[[c6]]** `code` `src/daemon/threads/review-workers.ts:337` — "private acceptPublication(source:Worker,raw:ReviewProgressPublication):boolean{"

## 11. Open questions

- Retries and follow-up work are not published by either review engine today, so ac1's 'retries and discovered follow-up work' is only partly met: both are reported as null. Accept null now, or add a separate Story that makes the engines publish those counters (a4 was rejected because it changes review execution, which the DEF's first non-goal excludes)?
- Coordinator typing versus the HLD: the HLD says 'a shared daemon coordinator', but a1 as designed uses a second typed coordinator so s2's ExecutorDetails stays untouched. Should the plan widen the one coordinator's details union (a2, edits s2's executor-measurements.ts) or keep two coordinators and have s5/s6 read both?
- Who binds a review identity (project, family, reviewId, attempt) to a TaskRef and mints the ProducerAuthorization at review start? sc1 and the HLD put owner binding and registration in s1; s3 should only supply the review identity and delegates. Confirm this stays consume-only, or raise an HLD back-flow, before the plan.
- Verify that the invariant citations c1 and c2 map to the task-progress contract bundle and the review progress bundle respectively (s8 ep3 ambiguous).
- Error 'type' values for the delegates are 'none thrown' and 'null result' (behaviours, not error classes); decide whether a named outcome type is wanted (s8 cd3 partial).
- Source of review progress: the status board carries only the display projection, so the delegates read ReviewWorkers.progressOf, a new read-only accessor in src/daemon/threads/review-workers.ts. That is the daemon's review-worker hosting class, not a review engine; confirm it is acceptable under the DEF non-goal on changes to review execution.

## Resolved questions

- `q52d7a4a9` — Retries and follow-up work are not published by either review engine today, so ac1's 'retries and discovered follow-up work' is only partly met: both are reported as null. Accept null now, or add a separate Story that makes the engines publish those counters (a4 was rejected because it changes review execution, which the DEF's first non-goal excludes)?
  - **resolved**: Accept null for this Story — User approved planning with null retries/follow-up; whether to track a separate engine-counter Story is left to the user. _(2026-11-14T18:02:58.080Z)_
- `q70227ac1` — Coordinator typing versus the HLD: the HLD says 'a shared daemon coordinator', but a1 as designed uses a second typed coordinator so s2's ExecutorDetails stays untouched. Should the plan widen the one coordinator's details union (a2, edits s2's executor-measurements.ts) or keep two coordinators and have s5/s6 read both?
  - **resolved**: a1: Two typed coordinators — User approved planning with a second typed coordinator; widening s2's union (a2) is the recorded fallback. _(2026-11-14T18:04:05.007Z)_
- `q9cc2552d` — Who binds a review identity (project, family, reviewId, attempt) to a TaskRef and mints the ProducerAuthorization at review start? sc1 and the HLD put owner binding and registration in s1; s3 should only supply the review identity and delegates. Confirm this stays consume-only, or raise an HLD back-flow, before the plan.
  - **resolved**: Keep s3 consume-only — User approved: s1 owns binding and authorization; plan checks early whether s1 exposes a hook. _(2026-11-14T18:05:03.405Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/daemon/task-progress/coordinator.ts` — "ProgressCoordinator is generic over a details union D and registers a producer per kind with registerProducer(kind, projectDetails)"
- **[[c2]]** `analyze-bundle` `src/daemon/threads/review-progress.ts` — "reviewProgressPublication(input, sequence, observation) validates family identity, rejects unverified admission claiming reviewed work"
- **[[c3]]** `analyze-bundle` `src/daemon/task-progress/__tests__/executor-relay.test.ts` — "Tests use node:test run through tsx."
- **[[c4]]** `step-output` `s3 alternatives.judge winner a1`
- **[[c5]]** `doc` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/DEF.md` — "Changes to review execution, workflow stages, approval gates or model providers"
- **[[c6]]** `code` `src/daemon/threads/review-workers.ts:337` — "private acceptPublication(source:Worker,raw:ReviewProgressPublication):boolean{"
