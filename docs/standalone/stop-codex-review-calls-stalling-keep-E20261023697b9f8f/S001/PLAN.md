<!-- insrc:artifact PLAN-697b9f8ff46b9deb-S001 -->

# Plan: E20261024697b9f8f:S001

## Summary

**Epic:** `stop-codex-review-calls-stalling-keep`
**LLD run:** `wf-1792763798946-g7op3j`
**LLD effective hash:** `697b9f8ff46b...`

Building this fix touches three layers. The CLI provider gets an opt-in silence watchdog for codex structured calls and reviewer sessions plus a typed schema rejection; the review pipeline takes every call type's silence limit and cap from one table (verify 90 s / 600 s, extract none / 600 s, HLD/LLD sessions and code review 300 s, build validation 90 s), retries a stall up to three times and reports real attempt counts, with a bounded verify answer and a prompt that matches codex's grammar; and the daemon and step tool keep long reviews alive with a heartbeat and progress relay. Tasks t1-t4 are already built; it ends with a live codex check, one full test sweep and a daemon rollout confirmed on a real review.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Silence watchdog for opted-in structured codex calls | M | — | unit: a structured codex call with stallMs kills a run that prints no output and throws CliStallError; unit: a structured codex call with stallMs kills a run that prints an item event and then goes silent, stallMs after its last output; unit: a structured codex call that keeps printing within stallMs completes, and without stallMs no watchdog is armed; unit: claude ignores stallMs and reviewer sessions keep the first-output watchdog | [[c1]] [[c2]] |
| 2 | **`t2`** Typed schema rejection with reasons | S | — | unit: a codex reply that breaks the caller's schema throws ModelResponseShapeError carrying the validation reasons; unit: a review call rejected by the reply check is classified invalid-answer and re-issued with a correction note carrying the reasons | [[c7]] |
| 3 | **`t3`** Bound the verify answer and align the verify prompt | S | — | unit: VERIFY_SCHEMA and VERDICTS_SCHEMA bound evidence, action, rationale, edits and options, and an answer over a bound fails validation; unit: the verify SYSTEM rules ask for an always-present proposedFix with empty fields when there is no fix and no longer tell the model to omit fields, in both the single and batched prompts; unit: a no-fix answer with an empty rationale normalises to a finding without proposedFix, and one with a rationale keeps a rationale-only proposedFix | [[c9]] [[c11]] |
| 4 | **`t4`** Stall retry budget and attempt counts in the review pipeline | M | `t1`, `t2` | unit: a review pipeline call that stalls is re-issued up to three times, while an invalid answer is re-issued only once; unit: a claim whose three attempts stall, or two stalls then a transient failure, is recorded as not judged with a message naming three attempts; unit: ReviewCallFailedError names the real attempt count and an older NotJudged without attempts still renders; unit: the pipeline driver forwards a structured call's stallMs to completeStructured | [[c4]] [[c5]] [[c10]] |
| 5 | **`t5`** Silence limit for reviewer sessions | M | `t1`, `t4` | unit: a codex reviewer session given stallMs is killed after that much stdout silence, also after an early item event, and throws CliStallError; unit: a codex reviewer session without stallMs keeps the first-output watchdog: model output printed early then a long silence is not a stall; unit: the pipeline driver forwards a reviewer-session call's stallMs to runReviewSession | [[c14]] [[c4]] |
| 6 | **`t6`** REVIEW_CALL_LIMITS table and its call sites | M | `t5` | unit: REVIEW_CALL_LIMITS holds the five call-type rows, every silence limit is below its call's total limit, and VERIFY_CALL_TIMEOUT_MS and VERIFY_CALL_STALL_MS come from the design-verify row; unit: the design-review extract, verify and template-session executions send their REVIEW_CALL_LIMITS row's silence limit and cap; unit: every code-review execution, the controller's included, sends the code-review row's 300 s silence limit and 600 s cap; unit: verifyClaim sends stallMs 90 s and timeoutMs 600 s; unit: the build-validation session is run with stallMs 90 s and deadlineMs JUDGE_DEADLINE_MS | [[c3]] [[c15]] |
| 7 | **`t7`** Real attempt count in the template-review failure message | S | `t4` | unit: a template review that stalls twice and then gets an invalid answer fails with a message naming three attempts, and two invalid answers report two attempts | [[c5]] |
| 8 | **`t8`** Heartbeat frames from workflow.review | S | — | integration: workflow.review sends a heartbeat frame every 60 s while a review runs and none after the terminal frame, and its stage frames are unchanged | [[c8]] |
| 9 | **`t9`** insrc_review_step relays progress and waits with an idle limit | M | `t8` | integration: insrc_review_step through step.call relays every daemon progress frame, heartbeats included, as a 'progress' frame before 'done'; integration: a healthy design review longer than 15 minutes completes while heartbeats flow, and a daemon that sends no frame for 5 minutes fails with an idle timeout naming the idle limit | [[c6]] |
| 10 | **`t10`** Live check, full sweep and daemon rollout | M | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9` | live: codex accepts the strict copy of the bounded VERIFY_SCHEMA and a real verify call returns a finding that passes the reply check; smoke: a real DEF review on the rebuilt daemon completes without a stall and relays progress to the controller | [[c12]] [[c13]] |

### 1.1 E20261024697b9f8f:S001:T001 — Silence watchdog for opted-in structured codex calls

Add stallMs to StructuredCompletionOpts; give ProcessGroupOpts.stall a silence mode that kills the group when no new stdout chunk arrives for stall.ms (reset on each chunk); the codex branch of completeStructured arms it when stallMs is set and below timeoutMs. Reviewer sessions keep the first-output mode; claude ignores stallMs.

**Acceptance checks:**
- A structured codex call with stallMs kills a silent run and throws CliStallError
- A run that prints an item event early then goes silent is killed stallMs after its last output
- A run that keeps printing within stallMs completes
- Without stallMs no watchdog is armed; reviewer sessions keep first-output behaviour

### 1.2 E20261024697b9f8f:S001:T002 — Typed schema rejection with reasons

ModelResponseShapeError gains an optional reasons list; codexReply throws it with ValidationResult.errors when a codex answer fails the caller's schema; the review pipeline driver's classify returns those reasons with cause 'invalid-answer' and passes them to applyFailure.

**Acceptance checks:**
- A codex reply that breaks the caller's schema throws ModelResponseShapeError with reasons
- The pipeline classifies it as invalid-answer and the re-issued prompt carries the correction note when it fits
- Existing ModelResponseShapeError throw sites are unchanged

### 1.3 E20261024697b9f8f:S001:T003 — Bound the verify answer and align the verify prompt

Add the maxLength/maxItems bounds to VERIFY_SCHEMA (they reach VERDICTS_SCHEMA) and rewrite the SYSTEM fixability rules to ask for an always-present proposedFix with empty fields when there is no fix. Run the review and review-pipeline suites that import VERIFY_SCHEMA or VERDICTS_SCHEMA and update any schema snapshot they hold.

**Acceptance checks:**
- VERIFY_SCHEMA and VERDICTS_SCHEMA carry the bounds and an over-long answer fails validation
- SYSTEM no longer tells the model to omit fields and asks for empty fields when there is no fix
- A no-fix answer normalises as before (no proposedFix with an empty rationale; rationale-only otherwise)
- Suites that import VERIFY_SCHEMA or VERDICTS_SCHEMA pass

### 1.4 E20261024697b9f8f:S001:T004 — Stall retry budget and attempt counts in the review pipeline

ExecutionMode's structured mode carries stallMs and the driver forwards it (building on t2's classify change in driver.ts); applyFailure re-issues a 'stall' failure while attempt < MAX_STALL_ATTEMPTS (3), other causes keep MAX_CALL_ATTEMPTS; NotJudged gains attempts and notJudgedFinding, ReviewCallFailedError and the applyFailure log report the real count.

**Acceptance checks:**
- A stalling call is re-issued up to three times; an invalid answer only once
- A claim exhausted after three attempts is reported as three attempts
- An older NotJudged without attempts still renders
- The driver forwards stallMs to completeStructured

### 1.5 E20261024697b9f8f:S001:T005 — Silence limit for reviewer sessions

ReviewSessionOpts (src/shared/types.ts) gains stallMs; CliProvider.runReviewSession's codex run uses the silence watchdog with that limit instead of the first-output watchdog at codexFirstOutputMs when it is set (its deadline, single internal retry and size-refusal handling unchanged); the reviewer-session ExecutionMode gains stallMs and the pipeline driver's send() forwards it to runReviewSession. Ollama's runReviewSession ignores it.

**Acceptance checks:**
- A codex reviewer session given stallMs is killed after that much stdout silence, also after an early item event, and throws CliStallError
- A reviewer session without stallMs keeps the first-output watchdog exactly as today
- The pipeline driver forwards a reviewer-session call's stallMs to runReviewSession

### 1.6 E20261024697b9f8f:S001:T006 — REVIEW_CALL_LIMITS table and its call sites

Add src/workflow/review/call-limits.ts with REVIEW_CALL_LIMITS (design-verify 90 s / 600 s; design-extract no silence / 600 s; design-session 300 s silence beside its deadline; code-review 300 s / 600 s; build-validate 90 s silence inside JUDGE_DEADLINE_MS), with the survey evidence in its comment. Define VERIFY_CALL_TIMEOUT_MS and VERIFY_CALL_STALL_MS from the design-verify row; verifyClaim (and so calibration) passes both; the design-review extract, verify and template-session executions, every code-review execution (the shared one and the controller's) and the build-validation runReviewSession read their row. Update the tests that pin the old 180 s value.

**Acceptance checks:**
- REVIEW_CALL_LIMITS holds the five rows and every silence limit is below its call's total limit
- Every review and build-validation call site sends its row's silence limit and cap; no call site writes its own number
- verifyClaim sends stallMs 90 s and timeoutMs 600 s
- The validate phase's injected provider receives stallMs 90 s with deadlineMs JUDGE_DEADLINE_MS
- The pinned-limit tests assert the new values

### 1.7 E20261024697b9f8f:S001:T007 — Real attempt count in the template-review failure message

runTemplateReview's message and log for an exhausted invalid answer ('failed checklist … twice') state err.attempts and how many of those attempts were invalid answers, instead of a fixed 'twice'.

**Acceptance checks:**
- Two stalls then an invalid answer fail the template review with a message naming three attempts, not 'twice'
- Two invalid answers still report two attempts

### 1.8 E20261024697b9f8f:S001:T008 — Heartbeat frames from workflow.review

workflowReviewStart sends a {kind:'heartbeat', operation:'workflow.review', elapsedMs} progress frame every WORKFLOW_REVIEW_HEARTBEAT_MS (60 s) while a review runs and stops before the terminal frame.

**Acceptance checks:**
- Heartbeats arrive every 60 s during a review
- No heartbeat after 'done' or 'error'
- Stage frames are unchanged

### 1.9 E20261024697b9f8f:S001:T009 — insrc_review_step relays progress and waits with an idle limit

ReviewStepDeps gains progress; the step host wires insrc_review_step with its progress callback; reviewByDaemon passes onFrame (relaying every frame) and idleMs = DESIGN_REVIEW_IDLE_MS (5 min) beside the existing ceilings; an idle timeout names the idle limit.

**Acceptance checks:**
- Through step.call every daemon progress frame, heartbeats included, arrives as a 'progress' frame before 'done'
- A healthy review longer than 15 minutes completes while heartbeats flow
- No frame for 5 minutes fails with a daemon-review-timeout naming the idle limit

### 1.10 E20261024697b9f8f:S001:T010 — Live check, full sweep and daemon rollout

Run the live codex check of the bounded VERIFY_SCHEMA, run the full test sweep once, rebuild and restart the installed daemon, and confirm on a real DEF review that it completes without a stall and progress reaches the controller; the retry of a stall within its call type's silence limit (about 90 s for a verify call) is covered by the t5/t6 unit tests, since a real stall cannot be forced against live codex (user decision A, 2026-10-24).

**Acceptance checks:**
- Live: codex accepts the bounded VERIFY_SCHEMA strict copy and a verified finding passes the reply check
- Full sweep passes (pre-existing failures named)
- A real DEF review completes without a stall and relays progress to the controller; the retry within each call type's silence limit is covered by unit tests

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CliProvider.completeStructured | `t1` |
| runCodex | `t1` |
| job.ts re-issue decision | `t4` |
| design-review verify stage execution | `t4`, `t6` |
| verifyClaim | `t6` |
| VERIFY_SCHEMA | `t3` |
| VERDICTS_SCHEMA | `t3` |
| buildVerifyPrompt | `t3` |
| buildBatchedVerifyPrompt | `t3` |
| normalizeFix | `t3` |
| src/daemon/steps/host.ts insrc_review_step wiring | `t9` |
| reviewByDaemon | `t9` |
| handleReviewStep | `t9` |
| workflowReviewStart heartbeat | `t8` |
| CliProvider.completeStructured with VERIFY_SCHEMA on codex | `t10` |
| codexReply | `t2` |
| driver classify | `t2` |
| applyFailure | `t2`, `t4` |
| REVIEW_CALL_LIMITS | `t6` |
| CliProvider.runReviewSession | `t5` |
| design-review executions | `t6` |
| code-review execution | `t6` |
| build-validation session | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api CliProvider.completeStructured`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges StructuredCompletionOpts`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api REVIEW_CALL_LIMITS`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails.api ExecutionMode`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails.api MAX_CALL_ATTEMPTS`
- **[[c6]]** `prior-artifact` `LLD S001 contractDetails.api handleReviewStep and dataModelChanges ReviewStepDeps`
- **[[c7]]** `prior-artifact` `LLD S001 contractDetails.api ModelResponseShapeError`
- **[[c8]]** `prior-artifact` `LLD S001 contractDetails.api workflowReviewStart and dataModelChanges workflow.review progress frame`
- **[[c9]]** `prior-artifact` `LLD S001 contractDetails.api buildVerifyPrompt`
- **[[c10]]** `prior-artifact` `LLD S001 contractDetails.api NotJudged and dataModelChanges NotJudged`
- **[[c11]]** `prior-artifact` `LLD S001 dataModelChanges VERIFY_SCHEMA`
- **[[c12]]** `prior-artifact` `LLD S001 migration (rebuild and restart the installed daemon; confirm on a DEF review)`
- **[[c13]]** `prior-artifact` `LLD S001 testStrategy live level (CliProvider.completeStructured with VERIFY_SCHEMA on codex)`
- **[[c14]]** `prior-artifact` `LLD S001 contractDetails.api CliProvider.runReviewSession and dataModelChanges ReviewSessionOpts`
- **[[c15]]** `prior-artifact` `LLD S001 dataModelChanges Review call executions`
