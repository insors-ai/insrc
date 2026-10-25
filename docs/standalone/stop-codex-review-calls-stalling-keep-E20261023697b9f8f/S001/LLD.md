<!-- insrc:artifact LLD-697b9f8ff46b9deb-S001 -->

# LLD: E20261023697b9f8f:S001

## Summary

**Epic:** `stop-codex-review-calls-stalling-keep`
**HLD base run:** `wf-1792763798946-g7op3j`
**HLD effective hash:** `697b9f8ff46b...`

This fix makes daemon reviews and build validation stop losing minutes to silent codex runs. Each review call type gets its own silence limit, taken from one table and set from the measured silence of healthy calls of that type: a DEF verify call is killed after 90 s with nothing new on stdout, a code-review call or an HLD/LLD reviewer session after 300 s, a build-validation session after 90 s, while an extract call (healthy silence up to about 5 minutes) gets none. A stalled call is re-issued up to three times. The daemon sends a heartbeat during a review and insrc_review_step passes every progress frame on, so a long review is no longer aborted at 30 minutes. The review answer gains length bounds, the verify prompt asks for exactly the fields codex's strict grammar requires, and a reply that fails the caller's schema is retried with its reasons. The codex-wide change to how optional fields reach codex is left to a separate follow-up.

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

### 2.1 `CliProvider.completeStructured`

```typescript
completeStructured<T>(messages: readonly LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T>  // StructuredCompletionOpts (src/shared/types.ts:287) gains: readonly stallMs?: number | undefined
```

**Parameters:**
- `opts.stallMs: number | undefined` _(optional)_ — New field of StructuredCompletionOpts, beside its existing timeoutMs, cwd and internalRetry. SILENCE limit for a codex run: when set and below the call's timeoutMs, the codex branch arms a silence watchdog that kills the process group when no new stdout output has arrived for stallMs, measured from the spawn and reset on every new stdout chunk, and then throws CliStallError. This is a new mode of the existing ProcessGroupOpts.stall option (src/shared/process-group.ts:51), selected by the opted-in structured call; the reviewer-session first-output watchdog (cli-provider.ts:432) keeps its current behaviour. Absent: no watchdog, exactly as today. Ignored by the claude branch. The review pipeline driver's send() forwards ExecutionMode.stallMs into it alongside internalRetry:false.
- `opts.timeoutMs: number | undefined` _(optional)_ — Existing StructuredCompletionOpts field, unchanged: total wall-clock cap of the call.

**Returns:** `Promise<T>` — The codex (or claude) reply, parsed and held to the caller's schema.

**Errors:**
- `CliStallError` when no new codex stdout output for stallMs (at the start, or after an earlier item event); the run was killed (src/agent/providers/cli-provider.ts:169)
- `Error (timeout, exit -9)` when the run exceeded timeoutMs while producing output

**Preconditions:**
- stallMs, when set, is a positive number below timeoutMs

**Postconditions:**
- With stallMs absent every existing caller behaves exactly as before
- A stalled run is killed within stallMs plus the process-group kill time
- A run that prints an early item event and then goes silent is killed stallMs after its last output, not at timeoutMs
- Reviewer sessions keep the first-output watchdog unless they are given their own stallMs (see CliProvider.runReviewSession)

### 2.2 `REVIEW_CALL_LIMITS`

```typescript
type ReviewCallKind = 'design-verify' | 'design-extract' | 'design-session' | 'code-review' | 'build-validate';
export const REVIEW_CALL_LIMITS: Readonly<Record<ReviewCallKind, { readonly silenceMs?: number | undefined; readonly timeoutMs?: number | undefined }>>  // src/workflow/review/call-limits.ts (new)
```

**Returns:** `Readonly<Record<ReviewCallKind, { silenceMs?, timeoutMs? }>>` — The one place the silence limit and total cap of every daemon review and build-validation call type are set. Values: design-verify { silenceMs 90_000, timeoutMs 600_000 }; design-extract { timeoutMs 600_000 } with no silence limit; design-session (HLD/LLD reviewer session) { silenceMs 300_000 } beside its existing deadline; code-review (every code-review chunk, gather, judge and controller call) { silenceMs 300_000, timeoutMs 600_000 }; build-validate (validation verdict session) { silenceMs 90_000 } inside its existing 300 s JUDGE_DEADLINE_MS, so a stall is caught with time left for runReviewSession's one retry. Each silence limit sits above the longest stdout silence of a healthy call of its type in the 2026-10-16..24 survey, measured on the events codex prints on stdout (tool calls, tool outputs, messages; codex prints no reasoning items): verify 62 s -> 90 s, HLD/LLD session 172 s -> 300 s, code review 185 s (gather) and 66 s (judges) -> 300 s, build validation 29 s -> 90 s; extract (up to 343 s of silence, median call 130 s) gets none, because a limit above its silence would sit near its useful run time.

**Postconditions:**
- Every review and build-validation call site reads its limits from REVIEW_CALL_LIMITS; no call site writes its own number
- VERIFY_CALL_TIMEOUT_MS (600_000) and VERIFY_CALL_STALL_MS (90_000) remain exported, defined from the design-verify row, so existing imports keep working
- Changing a limit is a one-line edit with its evidence in the table's comment
- Every silence limit is below the total limit of the call it applies to (process-group.ts arms the watchdog only when stall.ms < timeoutMs): verify 90 s < 600 s, code review 300 s < 600 s, HLD/LLD session 300 s < its 12-30 min deadline, build validation 90 s < 300 s
- verifyClaim, and so the calibration harness that calls it (src/workflow/review/calibration.ts), uses the design-verify row too: its total cap goes from 180 s to 600 s and it gains the 90 s silence limit

### 2.3 `CliProvider.runReviewSession`

```typescript
runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T>  // ReviewSessionOpts gains: readonly stallMs?: number | undefined
```

**Parameters:**
- `opts.stallMs: number | undefined` _(optional)_ — When set, the codex session is watched by the silence watchdog with this limit (no new stdout for stallMs -> killed -> CliStallError) instead of the first-output watchdog at codexFirstOutputMs. A reviewer session prints an event for each tool call and item, so a silence limit catches a session that hangs after it has started. Absent: today's first-output watchdog, unchanged.

**Returns:** `Promise<T>` — Unchanged: the checked answer.

**Errors:**
- `CliStallError` when no new stdout for stallMs (silence mode) or no model output within codexFirstOutputMs (default mode)

**Postconditions:**
- Without stallMs the session's stall behaviour is exactly today's
- The session's existing deadline, internal retry and size-refusal handling are unchanged

### 2.4 `ExecutionMode`

```typescript
type ExecutionMode = { readonly mode: 'structured'; readonly cwd?: string | undefined; readonly timeoutMs?: number | undefined; readonly stallMs?: number | undefined } | { readonly mode: 'reviewer-session'; readonly cwd: string; readonly deadlineMs: number; readonly tools: 'read-only'; readonly stallMs?: number | undefined }
```

**Returns:** `ExecutionMode` — Both modes carry an optional stallMs (the silence limit) that the driver's send() forwards: to completeStructured for a structured call, to runReviewSession for a reviewer session.

**Postconditions:**
- Adapters that set no stallMs are unchanged

### 2.5 `MAX_CALL_ATTEMPTS`

```typescript
export const MAX_CALL_ATTEMPTS = 2; export const MAX_STALL_ATTEMPTS = 3
```

**Returns:** `number` — A pipeline call whose failure cause is 'stall' may be issued up to MAX_STALL_ATTEMPTS times (two re-issues); every other cause keeps MAX_CALL_ATTEMPTS (one re-issue). Applied where job.ts decides a re-issue (src/workflow/review-pipeline/job.ts:290).

**Postconditions:**
- Invalid answers and size refusals are not retried more than today
- Every message that reports an exhausted call states its real attempt count, carried as NotJudged.attempts into notJudgedFinding (src/workflow/review-pipeline/design-review.ts:41) and into ReviewCallFailedError (src/workflow/review-pipeline/job.ts:51), and in the applyFailure log (job.ts:306); runTemplateReview's own wrapper message for an exhausted invalid answer ('failed checklist … twice', src/workflow/review/template-review.ts) also states err.attempts and says how many attempts were invalid answers

### 2.6 `handleReviewStep`

```typescript
handleReviewStep(input: unknown, deps?: ReviewStepDeps): Promise<ReviewStepMcpEnvelope>  // ReviewStepDeps gains: readonly progress?: ((data: unknown) => void) | undefined
```

**Parameters:**
- `deps.progress: ((data: unknown) => void) | undefined` _(optional)_ — The step tool's progress callback. reviewByDaemon passes onFrame to the daemon stream and relays every 'progress' frame to it, as the code-review step does.

**Returns:** `Promise<ReviewStepMcpEnvelope>` — Unchanged envelope.

**Errors:**
- `ReviewStepError daemon-review-timeout` when no frame for the idle limit, or the total ceiling passed; the message names which limit

**Postconditions:**
- The step host wires insrc_review_step with its progress callback (src/daemon/steps/host.ts:71), so every daemon progress frame reaches the MCP client before 'done'
- reviewByDaemon waits with its existing ceiling (DESIGN_REVIEW_WAIT_MS / PIPELINE_REVIEW_WAIT_MS) plus an idle limit (DESIGN_REVIEW_IDLE_MS = 5 min). The daemon heartbeat (every 60 s) keeps a healthy review, including a 30-minute reviewer session, inside the idle limit; only a daemon that stops sending frames is cut.

### 2.7 `ModelResponseShapeError`

```typescript
class ModelResponseShapeError extends Error { constructor(message: string, reasons?: readonly string[]); readonly reasons: readonly string[] }
```

**Parameters:**
- `reasons: readonly string[] | undefined` _(optional)_ — The validation problems, as the formatted messages validateCodexReply already returns (ValidationResult.errors); empty when not given, so existing throw sites are unchanged.

**Returns:** `ModelResponseShapeError` — The typed shape failure carrying reasons. codexReply (src/agent/providers/cli-provider.ts) throws it, instead of a plain Error, when a codex answer does not satisfy the caller's schema; its validation itself is unchanged.

**Postconditions:**
- The review pipeline driver's classify() returns the error's reasons with cause 'invalid-answer', and the failure path passes them to applyFailure as more.reasons (src/workflow/review-pipeline/job.ts:291-296)
- Under the existing omission policy, the re-issue carries the correction note when the corrected prompt fits job.plan.limitChars; when it does not fit, the call is re-issued without it and the omission is logged with the reasons (unchanged behaviour)

### 2.8 `workflowReviewStart`

```typescript
workflowReviewStart(...): Promise<void>  // unchanged signature; adds export const WORKFLOW_REVIEW_HEARTBEAT_MS = 60_000
```

**Returns:** `Promise<void>` — While the review runs, the handler sends a progress frame {kind:'heartbeat', operation:'workflow.review', elapsedMs} every WORKFLOW_REVIEW_HEARTBEAT_MS, in addition to its stage frames, and stops it before the terminal frame.

**Postconditions:**
- A design review in a single reviewer session (runTemplateReview, up to HARD_REVIEW_DEADLINE_MS = 30 min, src/workflow/review/template.ts:62) still produces a frame at least every 60 s
- No heartbeat is sent after 'done' or 'error'
- Checked consumers of workflow.review progress: the step host relay (src/daemon/steps/host.ts) and the MCP progress forwarder (src/mcp/progress-forward.ts), which renders a non-stage frame generically. The VS Code plugin uses workflow.reviewDecision, not workflow.review progress, and the JetBrains plugin does not consume it.

### 2.9 `buildVerifyPrompt`

```typescript
buildVerifyPrompt(claim: Claim, evidence: Evidence): { system: string; user: string }  // signature unchanged; the shared SYSTEM rules (src/workflow/review/verify.ts:100) change
```

**Returns:** `{ system: string; user: string }` — The fixability rules in SYSTEM, shared with buildBatchedVerifyPrompt, no longer say 'do NOT emit artifactEdits' or 'no edits and no options'. They say: always emit proposedFix; when a finding has no fix (a LOW verified finding, or no safe edit), give rationale as an empty string or a one-line reason and artifactEdits and options as empty arrays; manual fixes give options and an empty artifactEdits. This matches what codex's strict grammar forces, and claude's reply validates the same way.

**Postconditions:**
- normalizeFix (src/workflow/review/verify.ts:257) is unchanged: a no-fix answer with an empty rationale and empty arrays becomes a finding without proposedFix; one with a one-line rationale and empty arrays keeps a rationale-only proposedFix, exactly as today
- VERIFY_SCHEMA keeps proposedFix, artifactEdits and options optional for every provider

### 2.10 `NotJudged`

```typescript
interface NotJudged { readonly stage: string; readonly key: string; readonly cause: string; readonly detail?: string | undefined; readonly policy: 'record-not-judged' | 'record-observation'; readonly attempts?: number | undefined }
```

**Parameters:**
- `attempts: number | undefined` _(optional)_ — How many times the call was issued before it was recorded. Optional so a job serialised before this change still reads.

**Returns:** `NotJudged` — applyFailure records call.attempt; notJudgedFinding(claim, cause, attempts?) and ReviewCallFailedError take the count and report it ('failed 3 times'), falling back to wording without a count when it is absent.

**Postconditions:**
- Two stalls followed by a transient failure are reported as three attempts

## 3. Data model changes

### 3.1 `VERIFY_SCHEMA` — field-modify

Upper bounds on the verify answer: evidence maxLength 4000, action maxLength 2000, proposedFix.rationale maxLength 2000, artifactEdits maxItems 10 with find and replace maxLength 4000, options maxItems 4 with each option maxLength 500. Optional fields stay optional. The bounds also reach the batched VERDICTS_SCHEMA, which is built from VERIFY_SCHEMA's items.

```
evidence: {type:string,minLength:1} -> {type:string,minLength:1,maxLength:4000}; action: +maxLength 2000; proposedFix.rationale: +maxLength 2000; artifactEdits: +maxItems 10, items.find/replace: +maxLength 4000; options: +maxItems 4, items: +maxLength 500
```

**Call sites:**
- `src/workflow/review/verify.ts:52`
- `src/workflow/review/verify.ts:229`
- `src/workflow/review-pipeline/design-review.ts:106`

### 3.2 `StructuredCompletionOpts` — field-add

Optional stallMs beside the existing timeoutMs, cwd and internalRetry (src/shared/types.ts:287): first-output limit honoured by the codex branch of CliProvider.completeStructured; ignored by other providers.

**Call sites:**
- `src/agent/providers/cli-provider.ts:338`
- `src/workflow/review-pipeline/driver.ts:77`

### 3.3 `ReviewStepDeps` — field-add

Optional progress callback relayed from the daemon review stream.

**Call sites:**
- `src/daemon/steps/review-step/phases/start.ts:147`
- `src/daemon/steps/host.ts:71`

### 3.4 `workflow.review progress frame` — field-add

A new frame kind 'heartbeat' {kind:'heartbeat', operation:'workflow.review', elapsedMs} sent every 60 s while a review runs; consumers that only read stage frames ignore it.

**Call sites:**
- `src/daemon/workflow-review-rpc.ts:94`
- `src/daemon/steps/review-step/phases/start.ts:147`

### 3.5 `NotJudged` — field-add

Optional attempts: the number of times the call was issued.

**Call sites:**
- `src/workflow/review-pipeline/job.ts:290`
- `src/workflow/review-pipeline/design-review.ts:138`

### 3.6 `ReviewSessionOpts` — field-add

Optional stallMs: the session's silence limit; absent keeps the first-output watchdog.

**Call sites:**
- `src/agent/providers/cli-provider.ts:432`
- `src/daemon/steps/build-step/phases/validate.ts:452`
- `src/workflow/review-pipeline/driver.ts:77`

### 3.7 `Review call executions` — field-modify

The design-review extract, verify and reviewer-session executions, the code-review execution and the build-validation session take their silence limit and cap from REVIEW_CALL_LIMITS.

**Call sites:**
- `src/workflow/review-pipeline/design-review.ts:82`
- `src/workflow/review-pipeline/design-review.ts:108`
- `src/workflow/review-pipeline/design-review.ts:168`
- `src/workflow/review-pipeline/code-review.ts:155`
- `src/workflow/review-pipeline/code-review.ts:234`
- `src/daemon/steps/build-step/phases/validate.ts:452`

## 4. Error paths

**Error cases**

- **A codex verify run stays silent after turn.started (the observed stall)** (recoverable)
  - Detection: The silence watchdog armed by stallMs sees no new codex stdout output for VERIFY_CALL_STALL_MS (from the spawn or from the last output) and kills the process group; runCodex throws CliStallError; the pipeline driver classifies it as cause 'stall'.
  - Response: job.ts re-issues the call under a new callId while its attempt count is below MAX_STALL_ATTEMPTS (3); after the third stall the verify stage's record-not-judged policy records the claim as not judged.
  - User impact: A verify stall costs about 90 s instead of 180 s; a claim is left unjudged only after three consecutive stalls.
- **A codex verify run is producing output but exceeds the overall cap** (recoverable)
  - Detection: runSubprocess's total timer (VERIFY_CALL_TIMEOUT_MS, 600 s) fires; the run exits -9 with no stalled flag; the driver classifies it as 'transient'.
  - Response: Re-issued once (MAX_CALL_ATTEMPTS), as today; then recorded as not judged.
  - User impact: Only a pathological answer is cut; healthy calls (p95 39 s) are far below the cap.
- **The extract call (which fails the whole review on failure) stalls** (recoverable)
  - Detection: Extract has no silence limit (healthy extract calls are silent for up to about 5 minutes); a stalled extract is ended by its 600 s cap, which the driver classifies as 'transient'.
  - Response: Re-issued once, as today, before the extract stage's fail-review policy fails the review.
  - User impact: Unchanged from today for a stalled extract; none of the 19 surveyed extract calls stalled.
- **A verify answer exceeds a new length bound (e.g. evidence over 4000 characters)** (recoverable)
  - Detection: For codex the strict copy carries maxLength/maxItems, so the grammar bounds it; if a reply still exceeds a bound, codexReply's existing check fails and it now throws ModelResponseShapeError with the formatted reasons; for claude the existing structured-output validation fails.
  - Response: Classified 'invalid-answer' with reasons and re-issued once with the correction note.
  - User impact: Very long evidence is rejected; the bounds are set well above observed answers (~200 output tokens).
- **The daemon review sends no frame for longer than the step's idle limit** (recoverable)
  - Detection: runReviewStream's idle timer (idleMs = DESIGN_REVIEW_IDLE_MS, 5 min) fires because no frame, not even the 60 s heartbeat, arrived; it fails with IDLE_TIMEOUT.
  - Response: reviewByDaemon returns next:'error' code daemon-review-timeout naming the idle limit; nothing is stamped; retryable.
  - User impact: A genuinely hung daemon review is reported instead of waiting for the full ceiling.
- **Sending a progress frame to the MCP client fails (client gone)** (recoverable)
  - Detection: The step host's progress send throws (src/daemon/steps/host.ts:112-117 catches it).
  - Response: The failure is logged at debug and the step continues to its reply, as for the code-review step.
  - User impact: None beyond the missing frame.
- **A design review runs one long reviewer session (an HLD or LLD review of up to 30 minutes) with no stage frame in between** (recoverable)
  - Detection: The daemon's heartbeat timer sends a progress frame every 60 s while the review runs.
  - Response: Each heartbeat resets the step's idle timer and is relayed to the MCP client, so neither the 5-minute idle limit nor the client's 30-minute no-progress limit cuts the healthy session.
  - User impact: A long but healthy design review completes and stamps its verdict.
- **A codex run prints an item event early and then goes silent** (recoverable)
  - Detection: The silence watchdog resets on that output and fires stallMs after it, since no further output arrives.
  - Response: CliStallError -> 'stall' -> re-issued up to MAX_STALL_ATTEMPTS.
  - User impact: A late hang costs its silence limit (90 s for a verify call) after the last output instead of the 600 s cap.
- **A codex reply does not satisfy the caller's schema** (recoverable)
  - Detection: codexReply's existing validateCodexReply check fails; it throws ModelResponseShapeError carrying ValidationResult.errors as reasons.
  - Response: The driver classifies it as 'invalid-answer' and passes the reasons to applyFailure; the re-issue carries the correction note when it fits the call limit, otherwise it is re-issued without it and the omission is logged (existing policy).
  - User impact: The retry is told what was wrong instead of repeating the same mistake.
- **A reviewer session (HLD/LLD review, code-review gather or build validation) hangs after it has started** (recoverable)
  - Detection: With its stallMs from REVIEW_CALL_LIMITS, the session's silence watchdog sees no new stdout for its limit (300 s for HLD/LLD sessions and code-review calls, 90 s for build validation) and kills it; CliStallError.
  - Response: Inside the review pipeline the call is re-issued up to MAX_STALL_ATTEMPTS; the build-validation session uses runReviewSession's own single retry inside its deadline.
  - User impact: A hung session costs its silence limit instead of running to its deadline.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A completeStructured call with stallMs set but routed to the claude branch | stallMs is ignored; behaviour unchanged. |
| stallMs greater than or equal to timeoutMs | No watchdog is armed (process-group.ts arms it only when stall.ms < timeoutMs); the call is bounded by timeoutMs alone. |
| A codex run that prints an item event after 50 s (slow first output, under the stall limit) | Not killed; completes normally. |
| A healthy reviewer session lasting 17 minutes | About 17 heartbeat frames arrive; the review completes within DESIGN_REVIEW_WAIT_MS. |
| A claim whose three attempts all stall | Recorded as not judged with a message naming three attempts, not two. |
| A LOW verified finding answered with proposedFix {rationale:'', artifactEdits:[], options:[]} | Valid for codex and claude; normalizeFix turns it into a finding with no proposedFix (with a non-empty rationale it keeps a rationale-only proposedFix, as today). |
| A healthy code-review gather call that is silent for 159 s between tool calls (the longest observed) | Below the 300 s code-review silence limit; not killed. |
| A healthy extract call that takes 403 s | No silence limit applies; it completes under its 600 s cap. |
| Two stalls and then an invalid answer in an HLD/LLD template review | The review fails with a message naming three attempts, not 'twice'. |

**Invariants to preserve**

- codexStrictSchema remains the single strict-copy path for every codex structured call and reviewer session and is NOT changed by this Story; every reply stays held to the caller's full original schema by validateCodexReply. [[c5]]
- Calls that do not set stallMs (every completeStructured caller other than the review pipeline) are unaffected: no watchdog, same total timeout. [[c2]]
- The pipeline sends each call with internalRetry:false and owns every retry; non-stall failure causes keep exactly one re-issue (MAX_CALL_ATTEMPTS = 2) and the stage failure policies (record-not-judged for verify, fail-review for extract) are unchanged. [[c3]]
- A review that cannot complete stamps nothing and never falls back to a controller review; reviewByDaemon still returns next:'error' with a retryable flag. [[c4]]
- The daemon already emits a progress frame per pipeline call (runReview's onCall emits 'extract' or 'verify:<claim>', src/workflow/review/review.ts:104) and per phase; this Story relays them and does not change their shape. [[c8]]
- Workflow calls outside reviews and build validation (open design question, brainstorm drafter, analyzer) are not given silence limits by this Story; the survey found no stalls in them. [[c18]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), assert/strict; fake CLI subprocesses as in src/agent/providers/__tests__/cli-codex-strict-schema.test.ts and src/agent/providers/__tests__/cli-review-session.test.ts`

**Test levels**

- **unit** — Silence watchdog for structured codex calls: armed only when stallMs is set and below timeoutMs; a fake codex that prints nothing is killed; a fake codex that prints an item event early and then goes silent is killed stallMs after that output; a fake codex that keeps printing within stallMs completes; reviewer sessions keep the first-output behaviour (existing cli-review-session case 'Model output printed early, then a long silence: not a stall'); claude ignores stallMs.
  - Subjects: `CliProvider.completeStructured`, `runCodex`
  - Fixtures: `fake codex binary that prints thread.started/turn.started then sleeps`, `fake codex binary that answers after a delay below stallMs`, `fake codex binary that prints item.started then sleeps`
- **unit** — Pipeline retries: a 'stall' failure is re-issued up to MAX_STALL_ATTEMPTS, other causes keep one re-issue; the verify stage passes VERIFY_CALL_STALL_MS and VERIFY_CALL_TIMEOUT_MS. Exhausted calls are reported with their real attempt count (three for stalls, two otherwise) in ReviewCallFailedError, the not-judged finding and the log. NotJudged carries attempts; the not-judged finding and ReviewCallFailedError name the real count, and an older NotJudged without attempts still renders.
  - Subjects: `job.ts re-issue decision`, `design-review verify stage execution`, `verifyClaim`
  - Fixtures: `fake provider throwing CliStallError N times then answering`, `fake provider throwing an invalid answer`
- **unit** — Verify answer bounds and prompt alignment: VERIFY_SCHEMA carries the maxLength/maxItems bounds and an over-long answer fails validation; the bounds reach VERDICTS_SCHEMA; the SYSTEM rules ask for an always-present proposedFix with empty fields when there is no fix and no longer say 'do NOT emit'; a no-fix answer with an empty rationale normalises to a finding without proposedFix, and one with a rationale keeps a rationale-only proposedFix.
  - Subjects: `VERIFY_SCHEMA`, `VERDICTS_SCHEMA`, `buildVerifyPrompt`, `buildBatchedVerifyPrompt`, `normalizeFix`
- **integration** — Progress relay and heartbeat: workflow.review sends a heartbeat frame every WORKFLOW_REVIEW_HEARTBEAT_MS while the review runs and none after the terminal frame; through step.call, insrc_review_step relays every frame before 'done'; reviewByDaemon passes onFrame and a 5-minute idle limit; a healthy session longer than 15 minutes completes; an idle timeout names the idle limit.
  - Subjects: `src/daemon/steps/host.ts insrc_review_step wiring`, `reviewByDaemon`, `handleReviewStep`, `workflowReviewStart heartbeat`
  - Fixtures: `fake reviewByDaemon that emits progress frames then resolves`, `fake that stays silent past idleMs`, `fake review that takes longer than the idle limit while the heartbeat runs (fake timers)`
- **live** — Against the installed codex CLI: the strict copy of the bounded VERIFY_SCHEMA is accepted and a real verify call returns a finding that passes the reply check.
  - Subjects: `CliProvider.completeStructured with VERIFY_SCHEMA on codex`
  - Fixtures: `INSRC_LIVE_TESTS=1`, `the saved stalled-c12 prompt from the issue evidence`
- **unit** — Typed validation failure: a codex reply that fails the caller's schema throws ModelResponseShapeError with the formatted reasons; the pipeline classifies it as invalid-answer and the re-issued prompt carries the correction note when it fits.
  - Subjects: `codexReply`, `driver classify`, `applyFailure`
  - Fixtures: `fake codex returning an answer that breaks the caller's schema (e.g. an over-long evidence string)`
- **unit** — Call limits: REVIEW_CALL_LIMITS holds the values above; the design-review extract, verify and session executions, the code-review execution and the build-validation session pass their row's silence limit and cap; a reviewer session given stallMs is killed after that silence (also after an early item event) while one without stallMs keeps the first-output watchdog.
  - Subjects: `REVIEW_CALL_LIMITS`, `CliProvider.runReviewSession`, `design-review executions`, `code-review execution`, `build-validation session`
  - Fixtures: `fake codex printing an item event then going silent, run as a reviewer session`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a structured codex call with stallMs kills a run that prints no output, and a run that prints an early item event then goes silent, stallMs after its last output, and throws CliStallError; without stallMs no watchdog is armed; reviewer sessions keep the first-output watchdog`, `a review pipeline call that stalls is re-issued up to three times, while an invalid answer is re-issued only once`, `a claim whose three attempts stall (or two stalls then a transient failure) is recorded as not judged with a message naming three attempts`, `every review and build-validation call site passes the silence limit and cap of its REVIEW_CALL_LIMITS row (verify 90 s / 600 s, extract none / 600 s, HLD/LLD sessions and code review 300 s, build validation 90 s)`, `a reviewer session given stallMs is killed after that silence, also after an early item event, and one without stallMs keeps the first-output watchdog` |
| `ac2` | `workflow.review sends a heartbeat frame every 60 s while a review runs and none after the terminal frame`, `insrc_review_step through step.call relays every daemon progress frame, heartbeats included, as a 'progress' frame before 'done'`, `a healthy design review whose reviewer session runs longer than 15 minutes completes with heartbeats, while a daemon that sends no frame for 5 minutes fails with an idle timeout naming the idle limit` |
| `ac3` | `the verify SYSTEM rules ask for an always-present proposedFix with an empty rationale and empty arrays when there is no fix, and no longer tell the model to omit fields`, `a no-fix answer with empty proposedFix fields validates for codex and claude and normalises to a finding without proposedFix; with a one-line rationale it keeps a rationale-only proposedFix`, `a codex reply that breaks the caller's schema throws ModelResponseShapeError with reasons, and the review re-issue carries them as a correction note when it fits` |
| `ac4` | `VERIFY_SCHEMA bounds evidence, action, rationale, edits and options, and an answer over a bound fails the reply check`, `live: codex accepts the strict copy of the bounded VERIFY_SCHEMA and a verified finding passes the reply check` |
| `ac5` | `a completeStructured call without stallMs on codex or claude arms no watchdog and keeps its total timeout`, `the cli-codex-strict-schema and cli-review-session suites pass unchanged (the strict copy is not changed)` |

## 6. Migration

**State before:** Built so far on main (Tasks t1-t4, commits 31fc8410, c46a4e8b, a3cb5640, dcd6b674): the structured codex silence watchdog (stallMs, process-group silence mode), ModelResponseShapeError with reasons through the pipeline, the bounded VERIFY_SCHEMA with the aligned prompt, and MAX_STALL_ATTEMPTS with attempt counts in NotJudged, notJudgedFinding and ReviewCallFailedError. Not yet built: the REVIEW_CALL_LIMITS table and its use at every review and build-validation call site, stallMs on reviewer sessions, the runTemplateReview message, the heartbeat and the insrc_review_step relay. Before this Story, verify calls had only a 180 s cap (src/workflow/review/verify.ts:212), sessions only a first-output watchdog (src/agent/providers/cli-provider.ts:432), and insrc_review_step relayed no progress (src/daemon/steps/host.ts:71).

**State after:** Every review and build-validation call takes its silence limit and cap from one table (verify 90 s / 600 s; extract no silence limit / 600 s; HLD/LLD sessions and code-review calls 300 s silence, build validation 90 s silence inside its 300 s deadline); a stalled call is re-issued up to twice and exhausted calls report their real attempt count. The verify prompt asks for the fields codex's grammar forces; the verify answer has length bounds; a reply that fails the caller's schema is rejected with reasons that reach the re-issue. workflow.review sends a heartbeat every 60 s, and insrc_review_step relays every frame and waits with a ceiling plus a 5-minute idle limit. The codex strict copy is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Already built (t1-t4): structured stallMs and the silence mode, typed rejection with reasons, the bounded verify answer and aligned prompt, the stall retry budget and attempt counts. — ↩ rollbackable
2. Add REVIEW_CALL_LIMITS (src/workflow/review/call-limits.ts) and read every review and build-validation call's silence limit and cap from it: design-review extract, verify and reviewer session, code-review calls, build validation. Define VERIFY_CALL_TIMEOUT_MS and VERIFY_CALL_STALL_MS from its design-verify row; give ReviewSessionOpts and the reviewer-session ExecutionMode a stallMs; update the tests that pin the old 180 s value. — ↩ rollbackable
3. Make runTemplateReview's exhausted-invalid-answer message state the real attempt count. — ↩ rollbackable
4. Add the workflow.review heartbeat frame (every 60 s while a review runs). — ↩ rollbackable
5. Wire insrc_review_step with the step host's progress callback; reviewByDaemon passes onFrame and an idle limit and relays frames. — ↩ rollbackable
6. Rebuild and restart the installed daemon so the new review behaviour is live; confirm with a DEF review that progress frames reach the controller and a stall is retried within its call type's silence limit (about 90 s for a verify call). — ↩ rollbackable

**Backward compat:** No public API or IPC payload changes: stallMs, deps.progress and NotJudged.attempts are optional additions; workflow.review stage frames keep their shape, and the new heartbeat frame is accepted by the checked consumers (the step host relay and src/mcp/progress-forward.ts); no IDE plugin in this repo reads workflow.review progress. Existing completeStructured callers that do not set stallMs are unaffected. The codex strict copy is unchanged, so other codex callers see no difference. ModelResponseShapeError gains an optional reasons argument, so existing throw sites are unchanged. The longer per-call cap (600 s) applies only to calls that are producing output. Reviewer sessions change only when given a stallMs: the HLD/LLD review session and code-review calls move from today's first-output watchdog (or none) to a 300 s silence limit, and build validation to a 90 s silence limit inside its 300 s deadline, each set above the longest healthy stdout silence observed for its type.

## 7. Alternatives considered

### 7.1 a1: Arm the existing codex stall watchdog for review calls, relay the progress that already exists — **CHOSEN**

Reuse the existing codex stall watchdog (as a silence limit) for structured review calls via an optional per-call stall limit, give stalls their own retry budget, add a daemon heartbeat and relay progress through insrc_review_step, bound the verify answer and align the verify prompt with the fields codex's grammar forces. Scope narrowed on 2026-10-24 (user decision): the codex strict copy is left unchanged; its optional-field handling is a follow-up. Extended on 2026-10-24 (user decision, option A of the timeout review): limits are set per call type from one table covering every review and build-validation call, from a survey of all daemon codex calls.



### 7.2 a2: Provider-agnostic idle watchdog in the subprocess runner

Add a general idle limit (no stdout for N s) to every CLI subprocess, claude and codex alike, and drive the review's retries from it.



**Rejected because:** Meets every intent but duplicates the existing watchdog and widens the change to every CLI call for no practical gain, since both CLIs print nothing until done.

### 7.3 a3: Shorter total timeout and more retries only

Lower VERIFY_CALL_TIMEOUT_MS to ~60 s and raise the pipeline's attempts, plus the progress relay; leave the schema alone.



**Rejected because:** Cheapest, but violates fix intent (c) and only partly meets (a), with a risk to accuracy.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work (insrc_analyze_step): Callers of codexStrictSchema / processSchemaForOpenAIStrict, uses of VERIFY_CALL_TIMEOUT_MS, progress relay in review-step vs code-review-step`
- **[[c2]]** `analyze-bundle` `s1 code-read: existing codex stall watchdog: How the CLI provider detects a silent codex run`
- **[[c3]]** `analyze-bundle` `s1 code-read: review pipeline retry and failure classes: How a failed review call is re-issued and recorded`
- **[[c4]]** `analyze-bundle` `s1 code-read: design-review progress path: Where design-review progress is produced and where it is lost`
- **[[c5]]** `analyze-bundle` `s1 code-read: verify schema, strict copy and reply check: What the review expects, what codex receives, and how the reply is checked`
- **[[c6]]** `prior-artifact` `ISSUE-562b1bb52f476d81`
- **[[c7]]** `doc` `docs/standalone/stop-codex-review-calls-stalling-keep-E20261023562b1bb5/evidence/stall-replays.md`
- **[[c8]]** `code` `src/workflow/review/review.ts:104` — "onCall: c => emit(c.stage === 'extract' ? 'extract' : `verify:${c.carries.key ?? ''}`),"
- **[[c9]]** `code` `src/shared/types.ts:287` — "export interface StructuredCompletionOpts {"
- **[[c10]]** `code` `src/workflow/review/template.ts:62` — "export const HARD_REVIEW_DEADLINE_MS = 30 * 60_000;"
- **[[c11]]** `code` `src/agent/providers/model-call-error.ts:30` — "export class ModelResponseShapeError extends Error {"
- **[[c12]]** `code` `src/workflow/review-pipeline/job.ts:291` — "if (cause === 'invalid-answer' && more.reasons !== undefined && more.reasons.length > 0) {"
- **[[c13]]** `code` `src/shared/process-group.ts:108` — "? setTimeout(() => { if (!stall.started(stdout)) { stalled = true; kill(); } }, stall.ms)"
- **[[c14]]** `code` `src/mcp/progress-forward.ts:51` — "const message = ev.kind === 'stage'"
- **[[c15]]** `code` `src/workflow/review-pipeline/job.ts:51` — "super(`review stage ${stage}: the call failed twice (${cause})"
- **[[c16]]** `code` `src/workflow/review/verify.ts:100` — "const SYSTEM = ["
- **[[c17]]** `stakeholder` `user 2026-10-24` — "go with option A"
- **[[c18]]** `doc` `docs/standalone/stop-codex-review-calls-stalling-keep-E20261023697b9f8f/S001/evidence/call-type-survey.md` — "Stalls (no-finish) concentrate in DEF verify calls: 38 of 792 (4.8%). Code-review gather 2 of 701, build validation 1 of 176, and none in 129 HLD/LLD sessions, 101 code-review judges, 19 extract calls"
- **[[c19]]** `stakeholder` `user 2026-10-24` — "we need to take a more holistic view on the review timeouts, just because we noticed it in the DEF review doesn't mean the same pattern doesn't exist elsewhere"

## 9. Open questions

- Follow-up (out of scope by decision, 2026-10-24): codexStrictSchema forces every optional property of every codex schema to be present and non-null. Making that null-tolerant needs a correct reply-normalisation design across unions, $ref and patternProperties; to be filed as its own issue.
- Separate defect found by the survey: the analyzer's exploration decomposer fails on every codex run because its params object schema has no properties (codex strict mode refuses it); to be filed as its own bugfix.

## Resolved questions

- `qfbddcfb9` — Follow-up (out of scope by decision, 2026-10-24): codexStrictSchema forces every optional property of every codex schema to be present and non-null. Making that null-tolerant needs a correct reply-normalisation design across unions, $ref and patternProperties; to be filed as its own issue.
  - **resolved**: Retain the strict contract — User decision 2026-10-24 (option A): S001 leaves codexStrictSchema unchanged; the normalisation design is filed as ISSUE-7d346e0dcbafc70e. _(2026-10-24T07:15:20.200Z)_
- `q1be9eefa` — Separate defect found by the survey: the analyzer's exploration decomposer fails on every codex run because its params object schema has no properties (codex strict mode refuses it); to be filed as its own bugfix.
  - **deferred**: deferred for review — Out of this Story's scope; to be filed as its own bugfix through triage, where its fix shape is decided. _(2026-10-24T11:42:15.391Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work (insrc_analyze_step): Callers of codexStrictSchema / processSchemaForOpenAIStrict, uses of VERIFY_CALL_TIMEOUT_MS, progress relay in review-step vs code-review-step`
- **[[c2]]** `analyze-bundle` `s1 code-read: existing codex stall watchdog: How the CLI provider detects a silent codex run`
- **[[c3]]** `analyze-bundle` `s1 code-read: review pipeline retry and failure classes: How a failed review call is re-issued and recorded`
- **[[c4]]** `analyze-bundle` `s1 code-read: design-review progress path: Where design-review progress is produced and where it is lost`
- **[[c5]]** `analyze-bundle` `s1 code-read: verify schema, strict copy and reply check: What the review expects, what codex receives, and how the reply is checked`
- **[[c6]]** `prior-artifact` `ISSUE-562b1bb52f476d81`
- **[[c7]]** `doc` `docs/standalone/stop-codex-review-calls-stalling-keep-E20261023562b1bb5/evidence/stall-replays.md`
- **[[c8]]** `code` `src/workflow/review/review.ts:104` — "onCall: c => emit(c.stage === 'extract' ? 'extract' : `verify:${c.carries.key ?? ''}`),"
- **[[c9]]** `code` `src/shared/types.ts:287` — "export interface StructuredCompletionOpts {"
- **[[c10]]** `code` `src/workflow/review/template.ts:62` — "export const HARD_REVIEW_DEADLINE_MS = 30 * 60_000;"
- **[[c11]]** `code` `src/agent/providers/model-call-error.ts:30` — "export class ModelResponseShapeError extends Error {"
- **[[c12]]** `code` `src/workflow/review-pipeline/job.ts:291` — "if (cause === 'invalid-answer' && more.reasons !== undefined && more.reasons.length > 0) {"
- **[[c13]]** `code` `src/shared/process-group.ts:108` — "? setTimeout(() => { if (!stall.started(stdout)) { stalled = true; kill(); } }, stall.ms)"
- **[[c14]]** `code` `src/mcp/progress-forward.ts:51` — "const message = ev.kind === 'stage'"
- **[[c15]]** `code` `src/workflow/review-pipeline/job.ts:51` — "super(`review stage ${stage}: the call failed twice (${cause})"
- **[[c16]]** `code` `src/workflow/review/verify.ts:100` — "const SYSTEM = ["
- **[[c17]]** `stakeholder` `user 2026-10-24` — "go with option A"
- **[[c18]]** `doc` `docs/standalone/stop-codex-review-calls-stalling-keep-E20261023697b9f8f/S001/evidence/call-type-survey.md` — "Stalls (no-finish) concentrate in DEF verify calls: 38 of 792 (4.8%). Code-review gather 2 of 701, build validation 1 of 176, and none in 129 HLD/LLD sessions, 101 code-review judges, 19 extract calls"
- **[[c19]]** `stakeholder` `user 2026-10-24` — "we need to take a more holistic view on the review timeouts, just because we noticed it in the DEF review doesn't mean the same pattern doesn't exist elsewhere"
