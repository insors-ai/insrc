<!-- insrc:artifact PLAN-8315a11f29fd2812-s1 -->

# Plan: E202610208315a11f:S001

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**LLD run:** `wf-1792392444613-ac24bx`
**LLD effective hash:** `044189484c77...`

Building s1 means first making the providers safe for a pipeline that owns retries: one attempt on request, cancellation that reaches the call in flight, size refusals recognised in reviewer sessions, and an Ollama reviewer session that can only read. Then the review-pipeline module is built from the delivered review job, in two parts (job and driver steps, then the bounded gather) with its serial daemon driver. Finally every review kind is moved onto it through single-chunk adapters that keep today's prompts and results, ending with live probes and a daemon update.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Provider retry switch: internalRetry | S | — | integration: src/agent/providers/__tests__/internal-retry.test.ts: 'internalRetry false makes exactly one attempt on CliProvider completeStructured, runReviewSession and OllamaProvider completeStructured; absent keeps today's counts' | [[c1]] [[c2]] |
| 2 | **`t2`** Claude reviewer-session size refusal | S | — | integration: src/agent/providers/__tests__/cli-review-session.test.ts: 'a size refusal in a claude session envelope is now an InputTooLargeError, and a codex session refusal still is' | [[c1]] [[c3]] |
| 3 | **`t3`** review.chunkTokens setting | S | — | unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens' | [[c2]] [[c5]] |
| 4 | **`t4`** Cancellation reaches the call in flight | M | `t1` | integration: src/agent/providers/__tests__/abort-in-flight.test.ts: 'aborting a CLI completeStructured or reviewer session in flight kills the process group and throws AbortError at once; an aborted Ollama request throws AbortError; neither is retried' | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Generic read-only tool loop with an execution-time allowlist | L | `t4` | integration: src/analyze/context/__tests__/driver-unit.test.ts (existing, still passes); integration: src/analyze/context/__tests__/run-shaper-wiring.test.ts (existing, still passes); integration: src/analyze/context/__tests__/shaper-errors.test.ts (existing, still passes); integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn'; integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed' | [[c1]] [[c3]] [[c5]] |
| 6 | **`t6`** Ollama reviewer session | M | `t5` | integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'an Ollama reviewer session reads the repo with read-only tools and returns a schema-checked answer within its deadline'; integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn'; integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed' | [[c1]] [[c2]] |
| 7 | **`t7`** Pipeline core: job, prepare, envelope and driver steps | L | `t1`, `t3` | unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review under the limit is one chunk whose calls carry today's messages and schema inside the envelope'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a missing or wrong callId is rejected and the call re-issued once under a new callId; no prompt hash repeats'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a transient error, a stall or an invalid answer is re-issued once under a new callId, then the stage failure policy applies'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a size refusal re-divides exactly the atoms and notes the call carried and never resends the prompt'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'refusal re-planning reads only the job snapshot, so a changed source between turns cannot change the material'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'runStage commits a deterministic stage's output; extract claims and probe evidence enter the snapshot once and re-planning reads only them'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message'; unit: src/workflow/review-pipeline/__tests__/pack-into-batches.test.ts and src/workflow/review-pipeline/__tests__/review-job-core.test.ts: the delivered ISSUE-aef82b03 tests, moved and rewritten to the new API | [[c1]] [[c2]] [[c3]] |
| 8 | **`t8`** Pipeline core: bounded gather | M | `t7` | unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits and provenance is kept'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a relation judged by two calls is complete only when both are answered' | [[c1]] [[c3]] |
| 9 | **`t9`** Serial daemon driver runReviewJob | M | `t8`, `t4` | unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review cancelled while a call is in flight ends at once with AbortError, no re-issue, nothing recorded'; unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message' | [[c1]] [[c3]] |
| 10 | **`t10`** Code-review single-chunk adapters and runCodeReview | L | `t9` | integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included'; integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'adherence makes no call without an approved LLD or plan'; integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'a mock added or removed after prepare does not change the ux result' | [[c1]] [[c3]] [[c4]] |
| 11 | **`t11`** Design-review single-chunk adapters and runReview / runTemplateReview | L | `t9`, `t6` | integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review, a verify call failing twice records the premise as not judged'; integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit HLD review makes one reviewer-session call and gives today's report'; integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema'; integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks' | [[c1]] [[c3]] [[c4]] |
| 12 | **`t12`** Live envelope and Ollama probes | S | `t10`, `t11` | live: src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'claude and codex accept the envelope around every review answer schema and echo the callId'; live: src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline' | [[c4]] |
| 13 | **`t13`** Rebuild and update the installed daemon | S | `t12` | smoke: Installed daemon: a real under-limit code review and a real design review complete with today's result shape (manual smoke recorded in the BUILD record) | [[c5]] |

### 1.1 E202610208315a11f:S001:T001 — Provider retry switch: internalRetry

Add the optional internalRetry to StructuredCompletionOpts and ReviewSessionOpts and signal to ReviewSessionOpts, add the optional attempts parameter to CliProvider.withTransientRetry, and map internalRetry false to exactly one attempt in CliProvider.completeStructured, CliProvider.runReviewSession (no transient or stall retry) and OllamaProvider.completeStructured. When absent, behaviour is unchanged.

**Acceptance checks:**
- internalRetry false makes exactly one CLI run or Ollama request on each of the three paths.
- Without the field, today's retry counts are unchanged.

### 1.2 E202610208315a11f:S001:T002 — Claude reviewer-session size refusal

Classify a size refusal in the claude reviewer session's is_error envelope as InputTooLargeError with the classifier completeStructured uses; keep the codex session's existing classification and cover it with a regression test.

**Acceptance checks:**
- A claude session is_error size refusal throws InputTooLargeError.
- A codex session size refusal still throws InputTooLargeError.

### 1.3 E202610208315a11f:S001:T003 — review.chunkTokens setting

Add the review.chunkTokens catalog entry (number, default 128000) and REVIEW_CHARS_PER_TOKEN = 3, so limitChars defaults to 384,000 for every provider; config reconcile fills old files.

**Acceptance checks:**
- Default limitChars is 384,000 for every provider.
- A configured value v gives v x 3.

### 1.4 E202610208315a11f:S001:T004 — Cancellation reaches the call in flight

Add the optional signal to ProcessGroupOpts and aborted to ProcessGroupResult (kill the group on abort; an already-aborted signal spawns nothing). Forward StructuredCompletionOpts.signal and ReviewSessionOpts.signal through runSubprocess in CliProvider, throwing AbortError, never retried. Add the optional signal to CompletionOpts, and abort OllamaProvider.complete and completeStructured through a per-call fetch over the shared undici agent.

**Acceptance checks:**
- Aborting a CLI call or reviewer session kills its process group and throws AbortError at once.
- An aborted Ollama complete or completeStructured throws AbortError.
- Without a signal, behaviour is unchanged.

### 1.5 E202610208315a11f:S001:T005 — Generic read-only tool loop with an execution-time allowlist

Extract the tool loop and final structured emit from src/analyze/context/driver.ts behind a generic loop taking caller-supplied messages, answer schema, deadline, signal, retry policy and tool allowlist. Check every returned tool call's name (after alias resolution) against the allowlist before executeTool; a call outside it is refused with a tool error and logged. Pass the signal to every turn. Repoint runShaperToolLoop and runShaper's legacy tail at it with unchanged behaviour.

**Acceptance checks:**
- The analyzer's existing tests for runShaperToolLoop and runShaper pass unchanged.
- A returned call to a tool outside the allowlist, file_write included, never reaches executeTool.
- Cancellation stops the loop within the turn in flight.

### 1.6 E202610208315a11f:S001:T006 — Ollama reviewer session

Make runReviewSession an optional member of LLMProvider and implement it on OllamaProvider over the generic loop: repository cwd, read-only allowlist, deadline, signal, and a schema-checked structured answer.

**Acceptance checks:**
- An Ollama reviewer session reads the repository with read-only tools and returns a schema-checked answer within its deadline.
- ReviewSessionTimeoutError when the deadline passes.

### 1.7 E202610208315a11f:S001:T007 — Pipeline core: job, prepare, envelope and driver steps

Create src/workflow/review-pipeline. Move packIntoBatches (re-exported at its old path) and grow the delivered ReviewJob into ReviewPipelineJob, deleting review-job.ts and moving and rewriting its tests. Add the contracts sc1-sc4 and sc6 and the immutable snapshot (claims and evidence written once). Prepare: measure rendered calls, the single path, grouping by relation kind precedence (calls, same-file, same-module, references), the neighbourSummary slot, division with zero atoms, and AtomTooLargeError on a neighbour-free lower bound. Also: the envelope and fresh callIds; nextCalls; applyAnswer (schema, then validate(answer, call)); applyFailure (refusal re-division within maxChars, else half; one re-issue for transient, stall, mismatch and invalid answer); runStage; the per-stage failure policies; the deadlineAt rule (per-session limit times planned sessions, 30-minute cap per session); and the optional pipelineCalls on DimensionResult and ReviewReport.

**Acceptance checks:**
- Under the limit, the plan is single and the calls carry today's messages and schema inside the envelope.
- A missing or wrong callId, a transient error, a stall or an invalid answer is re-issued once under a new callId, and no prompt hash repeats.
- A size refusal re-divides exactly the carried atoms and notes; the refused prompt is never resent.
- Re-planning reads only the snapshot.

### 1.8 E202610208315a11f:S001:T008 — Pipeline core: bounded gather

Add the gather to the pipeline core: obligation calls; level-by-level reduction under the quarter-limit note cap, with the job keeping which atoms and earlier notes each note stands for; relationCall returning one or more calls, counted under pipelineCalls.relation; merge; and result.

**Acceptance checks:**
- An obligation whose evidence exceeds the limit is reduced level by level, every gather call fits, and provenance is kept.
- A relation judged by two calls is complete only when both are answered.

### 1.9 E202610208315a11f:S001:T009 — Serial daemon driver runReviewJob

runReviewJob drives a job to the end serially: issue pending calls one at a time with internalRetry false and each call's execution mode (cwd, timeoutMs, or reviewer session with deadlineMs = min(deadlineAt - now, per-session limit)), run deterministic stages with runStage, apply answers and failures, pass the signal into every call, and return the adapter's result. A cancelled review ends at once with AbortError and records nothing.

**Acceptance checks:**
- Calls are serial and each runs with its execution mode.
- A cancel during a call in flight ends the review at once with AbortError, no re-issue, nothing recorded.
- A re-issued session never restarts the deadline.

### 1.10 E202610208315a11f:S001:T010 — Code-review single-chunk adapters and runCodeReview

One adapter per code-review dimension, each wrapping today's prompt builder unchanged, with daemon and controller stage plans. ux is a deterministic stage reading the snapshot's companion-mock fileFacts. Diagram keeps its handlers (deterministic ones as deterministic stages, a failing handler a LOW observation). Adherence makes no call without an approved LLD or plan. runCodeReview builds one job per expected dimension in today's order and drives it with runReviewJob, so the withStructuredRetry wrappers leave the review path. A dimension failing both attempts returns { ok: false, error } as today.

**Acceptance checks:**
- An under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included.
- Coverage is still normalised once over the dimension's result.
- A mock added or removed after prepare does not change the ux result.

### 1.11 E202610208315a11f:S001:T011 — Design-review single-chunk adapters and runReview / runTemplateReview

Premise adapter: extract (fail-review), probe (deterministic, runStage), and verify per premise (record-not-judged, the 3-minute timeoutMs, repo cwd as an addition). The controller plan uses today's single batched verify. Template adapter: one reviewer-session stage whose validate is today's checklist check, re-issued once by the pipeline with today's correction text, under job.deadlineAt. runReview and runTemplateReview switch to the pipeline; verifyOrRecord's own retry and the template re-ask leave the path.

**Acceptance checks:**
- An under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review; a verify call failing twice records the premise as not judged.
- An under-limit HLD review makes one reviewer-session call and gives today's report; a checklist break is re-issued once by the pipeline.
- The controller premise plan under the limit offers one batched verify call.

### 1.12 E202610208315a11f:S001:T012 — Live envelope and Ollama probes

Add the INSRC_LIVE_TESTS-gated tests: claude and codex accept the envelope around every review answer schema and echo the callId, and a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline.

**Acceptance checks:**
- The live envelope test passes on claude and codex.
- The live Ollama review completes.

### 1.13 E202610208315a11f:S001:T013 — Rebuild and update the installed daemon

Rebuild and update the installed daemon (maintenance.update). Then run one real code review and one real design review under the limit on it, and confirm each completes with today's result shape.

**Acceptance checks:**
- The installed daemon runs the new build.
- A real under-limit code review and design review complete on it.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review under the limit is one chunk whose calls carry today's messages and schema inside the envelope' | `t7` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a missing or wrong callId is rejected and the call re-issued once under a new callId; no prompt hash repeats' | `t7` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a transient error, a stall or an invalid answer is re-issued once under a new callId, then the stage failure policy applies' | `t7` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a size refusal re-divides exactly the atoms and notes the call carried and never resends the prompt' | `t7` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'refusal re-planning reads only the job snapshot, so a changed source between turns cannot change the material' | `t7` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits and provenance is kept' | `t8` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens' | `t3` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review cancelled while a call is in flight ends at once with AbortError, no re-issue, nothing recorded' | `t9` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'runStage commits a deterministic stage's output; extract claims and probe evidence enter the snapshot once and re-planning reads only them' | `t7` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message' | `t7`, `t9` |
| src/workflow/review-pipeline/__tests__/pack-into-batches.test.ts and src/workflow/review-pipeline/__tests__/review-job-core.test.ts: the delivered ISSUE-aef82b03 tests, moved and rewritten to the new API | `t7` |
| src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included' | `t10` |
| src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'adherence makes no call without an approved LLD or plan' | `t10` |
| src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review, a verify call failing twice records the premise as not judged' | `t11` |
| src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit HLD review makes one reviewer-session call and gives today's report' | `t11` |
| src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'a mock added or removed after prepare does not change the ux result' | `t10` |
| src/agent/providers/__tests__/internal-retry.test.ts: 'internalRetry false makes exactly one attempt on CliProvider completeStructured, runReviewSession and OllamaProvider completeStructured; absent keeps today's counts' | `t1` |
| src/agent/providers/__tests__/cli-review-session.test.ts: 'a size refusal in a claude session envelope is now an InputTooLargeError, and a codex session refusal still is' | `t2` |
| src/agent/providers/__tests__/ollama-review-session.test.ts: 'an Ollama reviewer session reads the repo with read-only tools and returns a schema-checked answer within its deadline' | `t6` |
| src/analyze/context/__tests__/driver-unit.test.ts (existing, still passes) | `t5` |
| src/analyze/context/__tests__/run-shaper-wiring.test.ts (existing, still passes) | `t5` |
| src/analyze/context/__tests__/shaper-errors.test.ts (existing, still passes) | `t5` |
| src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema' | `t11` |
| src/agent/providers/__tests__/abort-in-flight.test.ts: 'aborting a CLI completeStructured or reviewer session in flight kills the process group and throws AbortError at once; an aborted Ollama request throws AbortError; neither is retried' | `t4` |
| src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks' | `t11` |
| src/agent/providers/__tests__/ollama-review-session.test.ts: 'cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn' | `t5`, `t6` |
| src/agent/providers/__tests__/ollama-review-session.test.ts: 'a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed' | `t5`, `t6` |
| src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'claude and codex accept the envelope around every review answer schema and echo the callId' | `t12` |
| src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline' | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD s1 errorPaths`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy`
- **[[c5]]** `prior-artifact` `LLD s1 migration`
