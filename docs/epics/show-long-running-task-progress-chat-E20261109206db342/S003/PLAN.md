<!-- insrc:artifact PLAN-206db3426ffd4428-s3 -->

# Plan: STORY-206db3426ffd4428-s3

## Summary

**Epic:** `show-long-running-task-progress-chat`
**LLD run:** `wf-1794677964987-aaux10`
**LLD effective hash:** `48a6a5468b45...`

Story s3 wires review executions into the daemon's task-progress surface: read-only progress accessors (t1), sc5 review detail types and pure mappings (t2), the two progress delegates (t3), one composed runtime (t4), admission-time task binding via the launchReview seam (t5, amended rev 2), measurement signalling and terminal evidence (t6), and non-interference verification (t7). Revision 2 amends ONLY t5: the plan-mandated pre-check proved no review admission carries a bound chat origin, so t5 uses the daemon-internal ProgressAccess.launchReview seam (user-approved option b) and its acceptance checks name session/aborted/session-memory/refused-launch/refused-registration as the unobserved set.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the read-only ReviewWorkers.progressOf accessor | S | approved r1 | — | integration: src/daemon/threads/__tests__/review-workers-progress-of.test.ts: progressOf returns a clone of the last accepted progress and undefined for a closing or unknown key; integration: src/daemon/threads/__tests__/review-workers-progress-of.test.ts: progressOf is read-only and never advances sequence or renews grace | [[c1]] [[c7]] |
| 2 | **`t2`** Define the sc5 review details, validators and pure mappings | M | approved r1 | — | unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: validators accept the sc5 shapes and reject unknown kinds, extra fields and over-long labels; unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: design review reports active chunk, reviewed against selected chunks and retained coverage separately; unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: code review reports active task, completed against total tasks and publication state; unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: retries and follow-up stay null when the engine reports none; unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: foreign identity, inconsistent counts and unverified admission map to null; unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: a mapped measurement fits the 8 KiB snapshot bound | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Implement DesignReviewDelegate and CodeReviewDelegate | M | approved r1 | `t1`, `t2` | unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: a delayed publication from an earlier incarnation does not replace the newer measurement; unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: heartbeat-only samples keep counts and meaningful revision unchanged; integration: src/daemon/task-progress/__tests__/review-measurements.test.ts: an interrupted review reads as interrupted until the new incarnation is verified; integration: src/daemon/task-progress/__tests__/review-measurements.test.ts: a missing or closing entry returns null without throwing; integration: src/daemon/task-progress/__tests__/review-measurements.test.ts: observing progress leaves review results, publication and approval unchanged | [[c1]] [[c4]] |
| 4 | **`t4`** Compose one progress runtime that accepts the review kinds | M | approved r1 | `t2` | integration: src/daemon/task-progress/__tests__/review-producers.test.ts: register both delegates through registerProducer and ProducerPort.register with a minted authorization; integration: src/daemon/task-progress/__tests__/review-producers.test.ts: a review measurement is committed and read back through the one store and an unknown kind is rejected; integration: src/daemon/task-progress/__tests__/review-producers.test.ts: second registration of the same kind is refused; unit: src/daemon/task-progress/__tests__/review-producers.test.ts: committed workflow and analysis record fixtures decode with the composed validator; unit: src/daemon/task-progress/__tests__/review-producers.test.ts: DesignReviewDetails and CodeReviewDetails pass the bounded measurement schema and stay under 8 KiB | [[c1]] [[c5]] |
| 5 | **`t5`** Bind a review attempt to a task at admission | M | approved r1 | `t3`, `t4` | integration: src/daemon/threads/__tests__/review-task-binding.test.ts: an observed review is registered as a task of kind design-review or code-review; integration: src/daemon/threads/__tests__/review-task-binding.test.ts: a review without an origin, session or capacity is admitted exactly as before; integration: src/daemon/threads/__tests__/review-task-binding.test.ts: a failure to launch or register never fails or slows the review | [[c1]] [[c5]] [[c6]] [[c7]] [[c8]] [[c9]] [[c10]] |
| 6 | **`t6`** Signal measurements and record terminal evidence | M | approved r1 | `t5` | integration: src/daemon/threads/__tests__/review-task-signal.test.ts: an observed review's task progress changes as publications are accepted; integration: src/daemon/threads/__tests__/review-task-signal.test.ts: terminal evidence follows the owner's terminal phase and never the review verdict; integration: src/daemon/threads/__tests__/review-task-signal.test.ts: a coordinator error is swallowed without altering acceptProgress, the board publication or reclaim; integration: src/daemon/threads/__tests__/review-task-signal.test.ts: snapshot after interruption shows interrupted or stale, then a newer incarnation is verified; integration: src/daemon/threads/__tests__/review-task-signal.test.ts: a delayed publication from the earlier incarnation does not overwrite the newer snapshot | [[c1]] [[c6]] |
| 7 | **`t7`** Verify non-interference and update the design notes | S | approved r1 | `t6` | integration: src/daemon/threads/__tests__/review-task-signal.test.ts: the normalized projection of an unobserved review is unchanged | [[c1]] [[c5]] |

### 1.1 TASK-206db3426ffd4428-s3-t1 — Add the read-only ReviewWorkers.progressOf accessor

In src/daemon/threads/review-workers.ts add progressOf(key) returning a frozen structured clone of the entry's last accepted progress (incarnation, attempt, sequence, phase, completed, total, observation, display), or undefined when there is no entry, the entry is closing, or nothing has been accepted. It writes nothing, does not advance sequence, does not renew any grace and does not post to a worker.

**Acceptance checks:**
- progressOf returns the last accepted progress after acceptPublication and undefined for an unknown or closing key
- the returned value is a clone: mutating it does not change the entry
- calling progressOf any number of times leaves e.progress.sequence, the board and worker messages unchanged
- no existing ReviewWorkers method changes behavior

### 1.2 TASK-206db3426ffd4428-s3-t2 — Define the sc5 review details, validators and pure mappings

In a new module src/daemon/task-progress/review-measurements.ts define DesignReviewDetails and CodeReviewDetails exactly as sc5, in this order: bounded typebox validators and a combined validateReviewDetails(kind, value); then the design mapping from a ReviewWorkerProgress to a DelegateMeasurement (phase, active chunk, reviewed against selected chunks as unit 'chunks', retained chunks, retries null); then the code mapping (phase, active task name, completed against total tasks as unit 'tasks', followUp and retries null, publication pending | complete | failed | unknown). Mappings return null for foreign identity, completed above total, a retained plus selected total that is not the planned total, or unverified admission claiming reviewed work. Each part has its own tests.

**Acceptance checks:**
- validators accept the sc5 shapes and reject unknown kinds, extra fields, negative or non-integer counts and over-long labels
- design mapping keeps retained coverage out of the fresh counts and reports retries null
- code mapping reports initial tasks, publication state and followUp and retries null
- inconsistent counts, foreign identity and unverified admission with reviewed work map to null
- a mapped measurement fits the 8 KiB snapshot bound

### 1.3 TASK-206db3426ffd4428-s3-t3 — Implement DesignReviewDelegate and CodeReviewDelegate

In src/daemon/task-progress/review-measurements.ts (or a sibling file) add the two delegates implementing TaskProgressDelegate. progress(task) reads ReviewWorkers.progressOf for the identity bound at registration, maps it with the t2 functions, ignores a publication older than the last accepted incarnation and sequence, keeps the last accepted measurement when a sample is rejected, and never throws. ownerActivity compares ReviewWorkers.identity(key) with the incarnation of the last accepted publication (and processState alive for code review) and returns the next owner sequence or null. Neither delegate exposes cancel, so controls stay empty.

**Acceptance checks:**
- each delegate's progress never throws and keeps the last accepted measurement on a rejected sample
- ownerActivity returns a fresh sequence only for the live incarnation (and alive process for code review), else null
- neither delegate exposes cancel so controls stay empty

### 1.4 TASK-206db3426ffd4428-s3-t4 — Compose one progress runtime that accepts the review kinds

Compose the one progress runtime so the review producers register next to the existing ones on the same coordinator and store; the composed validator (validateAllDetails) accepts every kind.

**Acceptance checks:**
- one runtime accepts both review kinds plus the existing executor/workflow/analysis kinds through the composed validator
- the review producers register on the same coordinator and store without disturbing existing kinds

### 1.5 TASK-206db3426ffd4428-s3-t5 — Bind a review attempt to a task at admission

AMENDED (rev 2, user-approved option b): at review admission in ReviewWorkers (admit/admitOwned, which already receive the TrustedRpcContext), call the daemon-internal s1 seam ProgressAccess.launchReview for the review — the pre-check proved no review admission carries a chat origin bound to its connection, so launchReview mints authorization with origin { turnId: reviewId } without requiring one; no IPC method exposes it — and register the matching delegate through the review producer, fire-and-forget guarded. A session connection, an aborted connection, a session-memory execution, a refused launch or a refused registration has no task and behaves exactly as today. s3 supplies only the review identity and delegates; minting and fencing stay in s1.

**Acceptance checks:**
- the admission call path is documented in the build record: which requests carry a bound origin (finding: none — review-service.ts:128/192 -> context(trusted) -> ReviewWorkers.admit/admitOwned carry only connectionIdentity/daemonEpoch/connectionSignal; the only origin-bound launch is executor-relay.ts:245 on executor connections)
- an observed review (any non-session, non-aborted admission) is registered as a task of kind design-review or code-review via the daemon-internal launchReview seam (access.ts) minting origin { turnId: reviewId }
- an unobserved review (session connection, aborted connection, session-memory execution, refused launch or refused registration) is admitted exactly as before with no task
- a failure or stall of launch or register never fails or slows the review admission
- no minting or fencing logic is added outside s1's access and coordinator

### 1.6 TASK-206db3426ffd4428-s3-t6 — Signal measurements and record terminal evidence

In ReviewWorkers.acceptProgress, after a publication is accepted, signal the coordinator through the review producer's signalMeasurement for the registered owner, and when the review reaches a terminal phase record the owner's terminal evidence through recordLifecycle from that phase, never from the review verdict. Calls are fire-and-forget guarded so a coordinator failure cannot affect progress acceptance, the board update or reclaim.

**Acceptance checks:**
- an observed review's task progress changes as publications are accepted
- terminal evidence follows the owner's terminal phase (complete, failed, interrupted) and never the review verdict
- coordinator failures are fire-and-forget guarded and never affect progress acceptance, the board update or reclaim

### 1.7 TASK-206db3426ffd4428-s3-t7 — Verify non-interference and update the design notes

Verify non-interference (existing progress suites unchanged and passing, review binding never disturbs other tasks) and update the design notes (LLD open questions) with the t5 pre-check outcome and the option-(b) seam.

**Acceptance checks:**
- existing executor-relay, coordinator and store tests pass unchanged
- review admission binding does not disturb non-review tasks or observers

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DesignReviewDelegate.progress maps phase, active chunk, reviewed against selected chunks and retained coverage | `t2`, `t3` |
| CodeReviewDelegate.progress maps phase, active task, completed against total tasks and publication state | `t2`, `t3` |
| retries and followUp are null for both kinds | `t2`, `t3` |
| foreign identity, invalid counts and unverified admission yield null | `t2`, `t3` |
| stale incarnation or sequence is ignored | `t3` |
| heartbeat-only samples leave counts and meaningfulRevision unchanged | `t3` |
| register both delegates through registerProducer and ProducerPort.register with a minted authorization | `t4`, `t5` |
| snapshot after interruption shows interrupted/stale, then a newer incarnation is verified | `t5`, `t6` |
| a delayed publication from the earlier incarnation does not overwrite the newer snapshot | `t5`, `t6` |
| reading progress does not renew owner activity | `t3` |
| second registration of the same kind is refused | `t4` |
| ReviewWorkers.progressOf returns a clone of the last accepted progress and undefined for a closing or unknown key | `t1` |
| DesignReviewDetails and CodeReviewDetails pass the bounded measurement schema and stay under 8 KiB | `t2`, `t4` |
| mapped publications round-trip through reviewProgressPublication without changing it | `t3`, `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contract details (DesignReviewDelegate, CodeReviewDelegate, ReviewWorkers.progressOf)`
- **[[c2]]** `prior-artifact` `LLD s3 data model changes (DesignReviewDetails, CodeReviewDetails)`
- **[[c3]]** `prior-artifact` `LLD s3 error paths`
- **[[c4]]** `prior-artifact` `LLD s3 test strategy and open questions`
- **[[c5]]** `prior-artifact` `LLD s3 migration`
- **[[c6]]** `analyze-bundle` `src/daemon/index.ts:500-506`
- **[[c7]]** `analyze-bundle` `src/daemon/threads/review-workers.ts:337-356`
- **[[c8]]** `code` `src/daemon/review-service.ts:95` — "Review admission passes the socket TrustedRpcContext through context(trusted) into ReviewWorkers.admit/admitOwned; no bound progress origin reaches the admission path."
- **[[c9]]** `code` `src/daemon/task-progress/executor-relay.ts:245` — "The only product caller of an origin-bound launch (launchBound) is the executor relay on executor connections."
- **[[c10]]** `doc` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S003/BUILD.md` — "t5 admission-path analysis: Finding: none do. User chose option (b): daemon-internal launchReview seam."
