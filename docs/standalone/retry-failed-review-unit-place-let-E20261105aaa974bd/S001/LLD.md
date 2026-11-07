<!-- insrc:artifact LLD-aaa974bdcf49af18-s1 -->

# LLD: STORY-aaa974bdcf49af18-s1

## Summary

**Epic:** `retry-failed-review-unit-place-let`
**HLD base run:** `wf-1793866009479-wbb3w4`
**HLD effective hash:** `c77860b1d43a...`

A code-review unit that fails for a technical reason is run again in the same run, up to MAX_UNIT_RETRIES = 2 extra tries in the daemon party only, with the count stored in an optional attempt-header field; only when the tries are used up is the unit committed as 'failed'. The CR record also stops letting an all-failed review hold the Story's status down once a later review has an assessment. This Story amends two shared contracts of the approved HLD docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/HLD.md: sc2 (checkpoint and attempt header, HLD.md:99) gains an optional header field, and sc3 (permanent CR projection and status rule, HLD.md:117) gains a supersede clause. Both amendments are additive and backward compatible, the owner story s1 and the consumers s2 and s3 of that epic are built, and the amendment is recorded in this LLD rather than as an Epic extension because it is a bounded defect fix with no new story boundary.

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

### 2.1 `MAX_UNIT_RETRIES`

```typescript
export const MAX_UNIT_RETRIES: 2
```

**Returns:** `2` — Extra tries of one unit's assessment after the first try, following the retry-count pattern of the design review (reserveDesignUnit, retriesUsed).

**Postconditions:**
- Exhausting the tries commits the unit as 'failed' through taskFailure; the design review instead pauses with technical_retry_exhausted because a code review attempt must end with a verdict.

### 2.2 `TaskReviewCoordinator.run`

```typescript
run(...): Promise<void>  // existing method, behaviour extended
```

**Returns:** `Promise<void>` — Unchanged: every unit ends with a stored result.

**Errors:**
- `persistence error` when Saving the extra-try count fails; the run stops and a later resume may start one more uncounted try per persistent save failure, which is accepted.

**Preconditions:**
- A unit with a stored result is skipped (coordinator.ts:168).

**Postconditions:**
- Timeouts (stored 'incomplete'), persistence failures and shared attribution failures (budget MAX_ATTRIBUTION_SUBMISSIONS = 3, unchanged) are not retried.
- A retry is not a new attempt or round; only the latest try's diagnostic is kept because persistFailureDiagnostic replaces by phase, task and provider.
- ControllerTaskReview failures (controller.ts:72, :190) are not retried.

### 2.3 `supersedeAwareStatus`

```typescript
function supersedeAwareStatus(reviews: TaskReviewSummary[]): TaskStatus
```

**Parameters:**
- `reviews: TaskReviewSummary[]` — Summaries of the record body.

**Returns:** `TaskStatus` — Status under the supersede rule: an all-'failed' review is dropped when another kept review with a later completedAt has a non-failed task; a review with any assessment always counts; a lone or later all-failed review still reports 'failed'. Precedence comes from aggregateTaskStatus.

**Postconditions:**
- Applies to both parties' records.

### 2.4 `latestReviewStatus`

```typescript
function latestReviewStatus(reviews: TaskReviewSummary[]): TaskStatus  // existing
```

**Parameters:**
- `reviews: TaskReviewSummary[]` — Summaries of the record body.

**Returns:** `TaskStatus` — Migration step 1: unchanged (previous rule). Step 2: computes the supersede rule so publishing writes it.

**Postconditions:**
- validateTaskBody accepts the status of either rule in step 1 and step 2 so old and new records both validate.

## 3. Data model changes

### 3.1 `ReviewAttempt.header (sc2, HLD.md:99)` — field-add

Optional map from task id to the number of extra tries started. The header schema is closed (additionalProperties false), so the field is added to the type and the schema; absent means zero. Additive and backward compatible; stored attempts without it load unchanged.

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts:90`
- `src/workflow/code-review/task-review/contracts.ts:107`
- `src/workflow/code-review/task-review/checkpoint.ts:17`
- `src/workflow/code-review/task-review/checkpoint.ts:43`
- `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/HLD.md:99`

### 3.2 `CR record status rule (sc3, HLD.md:117)` — invariant-change

latestReviewSummaries keeps the highest attempt per reviewId and a review with any assessment always counts (record.ts:21-25); status precedence stays aggregateTaskStatus (results.ts:44-48). New clause: an all-'failed' review is superseded by a later kept review with a non-failed task. Migration: step 1 adds supersedeAwareStatus used only by validateTaskBody (accepting either status) plus the header field, rollbackable; step 2 switches latestReviewStatus and latestReviewSummaries to the supersede rule, not rollbackable once such a record is published; step 3 adds the coordinator retry, rollbackable; step 4 runs the full task-review tests and a live review. A published summary is never changed (record.ts:57-58).

**Call sites:**
- `src/workflow/code-review/task-review/record.ts:21-25`
- `src/workflow/code-review/task-review/record.ts:26-28`
- `src/workflow/code-review/task-review/record.ts:30-46`
- `src/workflow/code-review/task-review/record.ts:47-61`
- `src/workflow/code-review/task-review/results.ts:44-48`
- `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/HLD.md:117`

### 3.3 `Unit failure path` — invariant-change

Retry wraps only the assessment phase (coordinator.ts:251) inside run (coordinator.ts:159-281); taskFailure (assessment.ts:42-44) is still the exhaustion result and commitResult's guard (coordinator.ts:183-184) is unchanged. Tests: retry.test.ts, record-supersede.test.ts, publication.test.ts, controller.test.ts.

**Call sites:**
- `src/workflow/code-review/task-review/coordinator.ts:159-281`
- `src/workflow/code-review/task-review/coordinator.ts:183-184`
- `src/workflow/code-review/task-review/assessment.ts:42-44`
- `src/workflow/code-review/task-review/diagnostics.ts:29-56`
- `src/workflow/code-review/task-review/attribution-repair.ts:6`
- `src/workflow/code-review/task-review/controller.ts:72`
- `src/workflow/code-review/task-review/controller.ts:190`

## 4. Error paths

**Error cases**

- **A unit's assessment fails technically on every try** (recoverable)
  - Detection: The flow throws in the assessment phase (coordinator.ts:251) and the stored extra-try count has reached MAX_UNIT_RETRIES.
  - Response: Commit taskFailure(task.id, message, false) as 'failed' through commitResult; the latest try's diagnostic is kept.
  - User impact: The review reports 'failed' for that unit; a later pass can supersede it in the CR record.
- **Saving the extra-try count fails** (recoverable)
  - Detection: saveCheckpoint rejects with the persistence error before the retry starts.
  - Response: The error propagates and stops that run; the try is not started. A later resume may start one more uncounted try per persistent save failure, which is accepted.
  - User impact: The run stops with the persistence error; resume continues.
- **A unit times out** (recoverable)
  - Detection: The flow throws a timeout (inactivity or session) and taskFailure marks timedOut.
  - Response: Not retried; committed as 'incomplete'.
  - User impact: Unchanged from today.
- **The shared task attribution fails** (recoverable)
  - Detection: A cached attributionFailure makes each task flow rethrow before the assessment phase.
  - Response: Not retried by the unit retry; the attribution budget MAX_ATTRIBUTION_SUBMISSIONS = 3 is unchanged.
  - User impact: Unchanged from today.
- **A stored record has a status from the previous rule** (recoverable)
  - Detection: validateTaskBody compares body.status with both the previous and the supersede-aware status.
  - Response: Accept either; refuse anything else with the existing error.
  - User impact: Old records stay valid.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A retry succeeds on the second try | The unit stores the successful assessment; no failure is committed and the count stays recorded in the header. |
| Resume after a run that used one extra try | The stored count is read, so only the remaining tries are available; units with a stored result are skipped. |
| A stored attempt header without the new field | Loads unchanged and counts as zero extra tries. |
| One all-failed review and no other review | The record status is 'failed'. |
| An all-failed review that is later than a passing review | It is not superseded; the record status is 'failed'. |
| An earlier all-failed review and a later review with a non-failed task | The earlier review is dropped; the status comes from the remaining reviews by aggregateTaskStatus precedence. |
| A review with one failed and one passed task | It has an assessment and always counts. |

**Invariants to preserve**

- Every unit still ends with exactly one stored result, and commitResult refuses a different second result for the same task. [[c1]]
- The attempt header schema stays closed; the new field is added to the schema and type explicitly, never admitted by loosening additionalProperties. [[c9]]
- Controller-party failures (rejected attribution, failed reuse) are recorded as before and never retried; the record rule still covers them. [[c10]]
- A controller reuse failure is likewise not retried. [[c11]]
- The attribution repair budget MAX_ATTRIBUTION_SUBMISSIONS = 3 is unchanged and separate from the unit retry budget. [[c12]]
- A review with any assessment always counts in the record (latestReviewSummaries); a published summary is never changed (record.ts:57-58). [[c4]]
- Status precedence stays failed, incomplete, changes_requested, passed (aggregateTaskStatus). [[c5]]
- A stored result is skipped on resume and replay is refused by the in-run guard. [[c3]]
- taskFailure still stores 'incomplete' for timeouts and 'failed' otherwise. [[c2]]
- The commitResult replay guard is unchanged. [[c6]]
- A published attempt summary for a reviewId and attempt is not rewritten. [[c7]]
- Failure diagnostics keep one entry per phase, task and provider, replaced in place. [[c8]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test`

**Test levels**

- **unit** — Pin the unit retry rule and the supersede status rule.
  - Subjects: `src/workflow/code-review/task-review/__tests__/retry.test.ts: retry succeeds on a later try, exhaustion commits 'failed', timeouts and attribution failures are not retried, count survives resume, a failed count save stops the run`, `src/workflow/code-review/task-review/__tests__/record-supersede.test.ts: supersedeAwareStatus cases (lone all-failed, later all-failed, earlier all-failed superseded, mixed review always counts) and validateTaskBody accepting either status`
  - Fixtures: `fake provider of the coordinator tests`, `publication-fixture.ts`
- **integration** — Show publishing writes the new status and old records still validate; the controller party is covered by the record rule and not retried.
  - Subjects: `src/workflow/code-review/task-review/__tests__/publication.test.ts`, `src/workflow/code-review/task-review/__tests__/controller.test.ts`, `src/workflow/code-review/task-review/__tests__/recovery.test.ts`
- **live** — Run a real task-based review after the build (gated by INSRC_LIVE_TESTS=1).
  - Subjects: `one live code review of the Story's own change`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `retry.test.ts: a unit that fails then succeeds stores the assessment`, `retry.test.ts: a unit that fails on every try is committed 'failed' after MAX_UNIT_RETRIES extra tries` |
| `ac2` | `retry.test.ts: timeouts, persistence failures and attribution failures are not retried`, `controller.test.ts: controller failures are recorded and not retried` |
| `ac3` | `record-supersede.test.ts: an earlier all-failed review is superseded by a later review with a non-failed task`, `record-supersede.test.ts: a lone or later all-failed review still reports 'failed'`, `publication.test.ts: publishing writes the supersede status` |
| `ac4` | `record-supersede.test.ts: validateTaskBody accepts a record with the previous status`, `publication.test.ts: stored attempts without the header field load unchanged` |

## 6. Migration

**State before:** A failed reviewer unit is committed at once as 'failed' (or 'incomplete' on timeout) by taskFailure (coordinator.ts:159-281, assessment.ts:42-44). The attempt header is closed (contracts.ts:107). The CR record status is latestReviewStatus over the highest attempt per reviewId (record.ts:21-28), validated by validateTaskBody (record.ts:30-46) and written by mergeTaskSummary (record.ts:47-61), so one all-failed review holds the Story status at 'failed' even after a later pass.

**State after:** A technically failed unit is retried up to MAX_UNIT_RETRIES = 2 extra tries in the daemon party, counted in an optional header field, and committed 'failed' only after the tries are used up. The CR record status follows the supersede rule, and validation accepts the status of either the previous or the supersede rule. This amends sc2 (HLD.md:99) and sc3 (HLD.md:117) of the approved HLD additively.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional header field (type and schema) and add a separate supersede-aware status function used only by validateTaskBody, which accepts the status of either the previous or the supersede-aware rule, while latestReviewStatus still computes the previous rule. — ↩ rollbackable
2. Switch latestReviewStatus and latestReviewSummaries to the supersede rule so mergeTaskSummary writes it. Once a record with the new status is published, reverting would leave records the previous code rejects. — ✕ non-rollbackable
3. Add the in-run retry of the assessment phase to the coordinator run loop, saving the extra-try count in the header before each extra try. — ↩ rollbackable
4. Run the full task-review tests and one live review of the Story's change. — ↩ rollbackable

**Backward compat:** Additive. Attempts stored without the header field load as zero extra tries. Records written under the previous status rule still validate because validation accepts either rule. The checkpoint schema stays closed; the field is added explicitly.

## 7. Alternatives considered

### 7.1 a1: Bounded in-run retry of a failed unit's assessment following the design review's retry-count pattern, and a record rule that an all-failed review never outranks a later review — **CHOSEN**

Run a unit's assessment again, up to MAX_UNIT_RETRIES = 2 extra tries counted in the attempt header, when its reviewer fails with a process or output failure; commit 'failed' when the budget is spent; and exclude an all-failed review from the CR status once a later review with an assessment exists.

Retry, daemon party only. This follows the pattern the design review coordinator already uses (a per-unit retry count stored in the attempt, bounded by a budget, surviving resume; reserveDesignUnit and retriesUsed in src/workflow/review/design-review/coordinator.ts:147), and differs on exhaustion: the design review pauses for a user decision (technical_retry_exhausted), but a code review attempt must end with a verdict for the CR record, so an exhausted unit is committed as 'failed' and the caller supersedes it with a later review. In TaskReviewCoordinator.run, when the assessment phase of a unit throws before a durable result with a failure that taskFailure would store as 'failed', and the unit's count of extra tries in the attempt header (keyed by task id) is below an exported constant MAX_UNIT_RETRIES = 2, the count is incremented and saved and the unit's assessment is run again; otherwise the failure is committed as today. A failed save of the count raises the persistence error and stops that run; each resume is a caller action, so one uncounted try per persistent save failure is accepted. A failure of the shared task attribution, a timeout or inactivity failure ('incomplete') and a persistence failure are never retried. The diagnostic of a unit is stored once per phase, task and provider and the next try overwrites it. A try is not an attempt. ControllerTaskReview is unchanged. Contract amendments, recorded here: the header field amends sc2 and the supersede clause amends sc3 of the approved HLD of the review-committed-work-task-checkpoints epic (HLD.md:99, HLD.md:117), both additively; the header schema and type (contracts.ts:90, :107) gain the optional field, and the record rule is: latestReviewSummaries drops a kept review whose every task is 'failed' when another kept review with a later completedAt has a task that is not 'failed', with validation accepting the status of either the previous or the supersede-aware rule so stored records stay readable.

### 7.2 a2: Resume re-runs failed units and republishes the same attempt

Let operation resume discard the stored failed results of an attempt and re-run those units, then publish again.

Change admission so resume treats a stored 'failed' result as not done, removes it, re-runs the unit and publishes the attempt again. The published summary for that reviewId and attempt is replaced instead of conflicting.

**Rejected because:** Replaces a published, immutable attempt summary, which the record deliberately refuses.

### 7.3 a3: Retry as an automatic next attempt of the same review

On resume of a review with failed units, open attempt N+1 of the same reviewId that reassesses the failed units and reuses the rest.

Reuse the existing attempt mechanism: resume of a failed attempt creates the next attempt of the same reviewId with reassess for the failed units and reuse for the others, so the per-reviewId latest-attempt rule already supersedes the failed attempt. The start and resume responses name the reviewId and next attempt to use after a failure.

**Rejected because:** Reuses attempts but multiplies them for glitches, changes what resume means and still leaves a failed review standing when a pass runs under another reviewId.

### 7.4 a4: Record rule and advice only

Add the supersede rule and tell the caller which reviewId and attempt to use, without any retry.

Apply the record rule of a1 and have the start and progress responses say that a failed unit is retried by running the next attempt of the same reviewId.

**Rejected because:** Cheap and safe but retries nothing, so the observed failures still cost a manual round.

## 8. References

- **[[c1]]** `code` `src/workflow/code-review/task-review/coordinator.ts:159-281`
- **[[c2]]** `code` `src/workflow/code-review/task-review/assessment.ts:42-44`
- **[[c3]]** `code` `src/workflow/code-review/task-review/coordinator.ts:168`
- **[[c4]]** `code` `src/workflow/code-review/task-review/record.ts:21-61`
- **[[c5]]** `code` `src/workflow/code-review/task-review/results.ts:44-48`
- **[[c6]]** `code` `src/workflow/code-review/task-review/coordinator.ts:183-184`
- **[[c7]]** `code` `src/workflow/code-review/task-review/record.ts:57-58`
- **[[c8]]** `code` `src/workflow/code-review/task-review/diagnostics.ts:29-56`
- **[[c9]]** `code` `src/workflow/code-review/task-review/contracts.ts:107`
- **[[c10]]** `code` `src/workflow/code-review/task-review/controller.ts:72`
- **[[c11]]** `code` `src/workflow/code-review/task-review/controller.ts:190`
- **[[c12]]** `code` `src/workflow/code-review/task-review/attribution-repair.ts:6`
- **[[c13]]** `doc` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/HLD.md:99`
- **[[c14]]** `doc` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/HLD.md:117`
- **[[c15]]** `code` `src/workflow/review/design-review/coordinator.ts:147`

## 9. Open questions

- alt2: constraintScore is empty because the standalone Story has no Story, Epic or HLD constraints to score against.
