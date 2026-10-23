<!-- insrc:artifact PLAN-1973e125995f971e-s1 -->

# Plan: E202610221973e125:S001

## Summary

**Epic:** `large-story-s-code-review-cancelled`
**LLD run:** `wf-1792686549988-vytnla`
**LLD effective hash:** `07e2885ac3a2...`

Building this Story replaces the fixed 30-minute wait on a daemon code review with an idle limit that every progress frame restarts, inside a configurable overall ceiling. The code-review runner reports each review call as progress; the step.call host gains a way to forward a step tool's progress, and the code-review step relays the daemon's frames through it, so the MCP client sees a live tool instead of a silent one. The work ends by shipping to the installed daemon and rerunning the blocked code review of Epic 86197ac6 Story s2.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Idle limit in the shared review stream wait | M | — | unit: runReviewStream with idleMs: frames more often than idleMs keep the request alive past idleMs; it resolves on its final frame; unit: runReviewStream with idleMs: no frame for idleMs fails 'timeout' naming the idle limit and cancels the transport; unit: runReviewStream: frames do not extend timeoutMs; past it the request fails 'timeout' naming the ceiling; unit: runReviewStream without idleMs (or with an out-of-range idleMs): today's single wait | [[c1]] [[c7]] |
| 2 | **`t2`** Per-call progress from the code-review runner | M | — | unit: runCodeReview emits a 'call' progress per pipeline call of a dimension, with stage, role and count in detail, between its dimension-start and dimension-done; unit: runDimensionJob forwards JudgeContext.onCall to runReviewJob's onCall; without it the job runs as today | [[c2]] |
| 3 | **`t3`** Progress frames from step tools on step.call | M | — | integration: step.call: a step tool's progress calls arrive as 'progress' frames before 'done'; a failing send does not fail the step; progress after 'done' is ignored; integration: MCP forwarder: a forwarded insrc_code_review_step with a progressToken emits notifications/progress for each progress frame | [[c3]] [[c7]] |
| 4 | **`t4`** Configurable code-review wait limits and progress relay in the step | M | `t1`, `t3` | unit: codeReviewWaitLimits reads both keys, falls back to the defaults on a bad value and clamps idle to the ceiling; unit: reviewByDaemon passes the limits as timeoutMs and idleMs to codeReviewStream and relays every progress frame to deps.progress; unit: a ceiling or idle timeout answers next:'error' naming the config key to raise; unit: the config catalog declares codeReview.daemonReviewCeilingMs and codeReview.daemonReviewIdleMs with their defaults | [[c4]] [[c5]] [[c7]] |
| 5 | **`t5`** End-to-end proof: a review longer than 30 minutes completes | M | `t1`, `t2`, `t4` | integration: a daemon code review reporting a call every minute runs past 30 minutes and writes its record; one quiet past the idle limit fails with the idle cause and writes none | [[c1]] [[c2]] [[c4]] [[c8]] |
| 6 | **`t6`** Ship to the installed daemon and rerun the s2 code review | S | `t5` | live: The code review of Epic 86197ac660732ceb Story s2 completes and writes CR-86197ac660732ceb-s2 | [[c6]] |

### 1.1 E202610221973e125:S001:T001 — Idle limit in the shared review stream wait

Add optional idleMs to ReviewStreamOpts (src/shared/review-stream.ts). runReviewStream arms an idle timer alongside the overall timeoutMs timer; every progress/delta frame restarts the idle timer only. On expiry fail with ReviewStreamError('timeout') whose message names which limit ran out, and cancel the transport as today. Without idleMs (or with an idleMs not > 0 or not below timeoutMs), behaviour is unchanged.

**Acceptance checks:**
- Frames arriving more often than idleMs keep a request alive past idleMs; it resolves on its final frame
- No frame for idleMs fails 'timeout' with a message naming the idle limit and cancels the transport
- Frames never extend timeoutMs; past it the request fails 'timeout' naming the ceiling
- A caller passing no idleMs gets today's single wait (existing review-stream tests pass unchanged)
- An idleMs that is not > 0 or not below timeoutMs arms no idle timer: the single wait applies

### 1.2 E202610221973e125:S001:T002 — Per-call progress from the code-review runner

Add optional onCall to JudgeContext (src/workflow/code-review/types.ts); runDimensionJob (src/workflow/review-pipeline/code-review.ts) forwards ctx.onCall as runReviewJob's existing onCall. Add phase 'call' to CodeReviewProgress (src/workflow/code-review/runner.ts); runCodeReview builds a per-dimension onCall that emits { phase: 'call', dimension, detail: '<stage> <role> #n' }.

**Acceptance checks:**
- runCodeReview emits one 'call' progress per pipeline call of a dimension, between that dimension's dimension-start and dimension-done, with stage, role and a running count in detail
- Judges that ignore onCall and callers that pass no ctx.onCall behave as today

### 1.3 E202610221973e125:S001:T003 — Progress frames from step tools on step.call

Extend StepToolRunner (src/daemon/steps/host.ts) with an optional third progress argument. createStepCallHandler passes a progress callback that sends each call as a 'progress' frame on the step.call stream before 'done'; a send that throws or hits a closed stream is swallowed and logged at debug; progress after the final frame is ignored. Other step tools are untouched. The MCP forwarder (src/mcp/server.ts) is consumed unchanged; a regression test proves it relays these frames.

**Acceptance checks:**
- A step tool's progress calls arrive as 'progress' frames before the 'done' frame
- A failing progress send does not fail the step; it still answers with its envelope
- A progress call after the final frame is ignored
- Regression test, no change to src/mcp/server.ts: the existing forwarder relays step.call progress frames as notifications/progress when the client sent a progressToken

### 1.4 E202610221973e125:S001:T004 — Configurable code-review wait limits and progress relay in the step

Declare codeReview.daemonReviewCeilingMs (14_400_000) and codeReview.daemonReviewIdleMs (1_200_000) in src/config/config-catalog.ts and bump the catalog-contract row count (43 -> 45). Replace DAEMON_CODE_REVIEW_WAIT_MS in src/daemon/steps/code-review-step/handler.ts with codeReviewWaitLimits(), read fail-safe like readFreshnessTimeoutMs with idle clamped to the ceiling. reviewByDaemon passes timeoutMs/idleMs and an onFrame that relays every frame to the new CodeReviewStepDeps.progress; a timeout answers with the cause and names the config key to raise. host.ts:69 threads the runner's progress into the deps. routing.test.ts asserts codeReviewWaitLimits' defaults instead of the removed constant.

**Acceptance checks:**
- codeReviewWaitLimits returns the defaults when the keys are absent, falls back per key on 0/negative/non-number, and clamps idle to the ceiling
- reviewByDaemon passes the limits as timeoutMs and idleMs to codeReviewStream and relays every progress frame to deps.progress
- insrc_code_review_step's host entry threads progress into CodeReviewStepDeps.progress
- A ceiling timeout's error names codeReview.daemonReviewCeilingMs; an idle timeout's names codeReview.daemonReviewIdleMs
- DAEMON_CODE_REVIEW_WAIT_MS no longer exists; routing.test.ts and config-catalog-contract.test.ts pass with the new assertions
- Design reviews (insrc_review_step) pass no idleMs and keep their limits

### 1.5 E202610221973e125:S001:T005 — End-to-end proof: a review longer than 30 minutes completes

Integration test with a stubbed model and fake clock driving the code-review step through the in-daemon client: a review reporting a call every minute runs past 30 minutes and completes, writing its record; one that goes quiet past the idle limit fails with the idle cause and writes no record (never falling back to a controller review).

**Acceptance checks:**
- A daemon code review that keeps reporting calls runs past 30 minutes and writes its record
- A daemon code review that goes silent past idleMs fails next:'error' with the idle cause and writes no record

### 1.6 E202610221973e125:S001:T006 — Ship to the installed daemon and rerun the s2 code review

Run the full sweep, build, update the installed daemon, restart the MCP server so it loads the same build, then rerun insrc_code_review_step for Epic 86197ac660732ceb Story s2 and confirm it completes and writes CR-86197ac660732ceb-s2.

**Acceptance checks:**
- Full test sweep passes
- The installed daemon runs this build
- The code review of Epic 86197ac660732ceb Story s2 completes and writes CR-86197ac660732ceb-s2

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| runReviewStream with idleMs: frames arriving more often than idleMs keep the request alive past idleMs, and it resolves on its final frame | `t1` |
| runReviewStream with idleMs: no frame for idleMs fails 'timeout' naming the idle limit and cancels the transport | `t1` |
| runReviewStream: frames do not extend timeoutMs; past it the request fails 'timeout' naming the ceiling | `t1` |
| runReviewStream without idleMs: today's single wait | `t1` |
| codeReviewWaitLimits reads codeReview.daemonReviewCeilingMs and daemonReviewIdleMs, falls back to the defaults on a bad value and clamps idle to the ceiling | `t4` |
| reviewByDaemon passes the limits as timeoutMs and idleMs through the in-daemon client (codeReviewStream) and relays every progress frame to the step's progress callback | `t4` |
| runCodeReview emits a 'call' progress as each pipeline call of a dimension starts (JudgeContext.onCall forwarded to runReviewJob's onCall), with the stage and role in detail, between that dimension's start and done | `t2` |
| step.call: a step tool's progress calls arrive as 'progress' frames before the 'done' frame, and a failing progress send does not fail the step | `t3` |
| MCP forwarder: a forwarded insrc_code_review_step with a progressToken emits notifications/progress for each progress frame | `t3` |
| A daemon code review (stubbed model, a fake clock) that runs past 30 minutes while reporting a call every minute completes and writes its record; one that goes quiet past the idle limit fails with the idle cause and writes none | `t5` |
| The code review of Epic 86197ac660732ceb Story s2 completes and writes CR-86197ac660732ceb-s2 | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api ReviewStreamOpts (idleMs in runReviewStream, src/shared/review-stream.ts)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.api JudgeContext + CodeReviewProgress (onCall forwarded to runReviewJob, phase 'call')`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails.api StepToolRunner (progress frames on step.call)`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges codeReview.daemonReviewCeilingMs + codeReview.daemonReviewIdleMs and contractDetails.api DAEMON_CODE_REVIEW_WAIT_MS -> codeReviewWaitLimits`
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails.api CodeReviewStepDeps (progress threaded at src/daemon/steps/host.ts:69; routing.test.ts update)`
- **[[c6]]** `prior-artifact` `LLD s1 migration.migrationSteps order 5 (update the installed daemon, rerun Epic 86197ac6 s2 code review)`
- **[[c7]]** `prior-artifact` `LLD s1 errorPaths (idle timeout, ceiling timeout, failing progress send, edge cases)`
- **[[c8]]** `prior-artifact` `LLD s1 testStrategy integration level (a review longer than 30 minutes completes)`
