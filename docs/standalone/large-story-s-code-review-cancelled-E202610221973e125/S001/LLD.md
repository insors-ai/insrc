<!-- insrc:artifact LLD-1973e125995f971e-s1 -->

# LLD: E202610221973e125:S001

## Summary

**Epic:** `large-story-s-code-review-cancelled`
**HLD base run:** `wf-1792686549988-vytnla`
**HLD effective hash:** `07e2885ac3a2...`

A daemon code review is no longer cut off at a fixed 30 minutes. While it keeps finishing review calls, it keeps running, up to a ceiling that is a setting. It stops early only if it goes quiet for longer than an idle limit, which is also a setting. Each finished call is reported as progress all the way to the MCP client, so the client no longer abandons a long review as silent. Design reviews keep their limits.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `ReviewStreamOpts`

```typescript
interface ReviewStreamOpts { readonly timeoutMs: number; readonly idleMs?: number | undefined; readonly onFrame?: ((stream: 'progress' | 'delta', data: unknown) => void) | undefined; readonly signal?: AbortSignal | undefined }
```

**Parameters:**
- `timeoutMs: number` — The overall ceiling: the longest the request may run, frames or not
- `idleMs: number | undefined` _(optional)_ — New. The longest the request may go without any frame; every frame (progress, delta) restarts it. Absent: no idle limit (today's behaviour)
- `onFrame: (stream, data) => void` _(optional)_ — Unchanged: receives progress and delta frames
- `signal: AbortSignal | undefined` _(optional)_ — Unchanged

**Returns:** `n/a (options)` — Read by runReviewStream (src/shared/review-stream.ts), the wait both transports share: the MCP-side reviewStreamRequest and the in-daemon client's streamRequest (src/daemon/steps/daemon-client.ts), which the code-review step's wait uses. Its frame sink restarts the idle timer

**Errors:**
- `ReviewStreamError('timeout')` when No final frame within timeoutMs, or no frame at all for idleMs; the message says which limit ran out

**Preconditions:**
- idleMs, when given, is > 0 and <= timeoutMs

**Postconditions:**
- A request that keeps sending frames is ended only by timeoutMs, its final frame, an error frame or the signal
- Callers that pass no idleMs behave exactly as today

### 2.2 `StepToolRunner`

```typescript
type StepToolRunner = (args: unknown, signal: AbortSignal, progress?: (data: unknown) => void) => Promise<StepEnvelope>
```

**Parameters:**
- `progress: (data: unknown) => void` _(optional)_ — New, optional. A step tool reports progress; createStepCallHandler sends each call as a 'progress' frame on the step.call stream, which the MCP forwarder already relays as notifications/progress

**Returns:** `Promise<StepEnvelope>` — Unchanged

**Postconditions:**
- Tools that never call progress behave as today
- A progress call after the final frame is ignored

### 2.3 `CodeReviewProgress`

```typescript
interface CodeReviewProgress { readonly phase: 'grounding' | 'dimension-start' | 'call' | 'dimension-done' | 'finalize' | 'done' | 'error'; readonly dimension?: ReviewDimension | undefined; readonly detail?: string | undefined }
```

**Parameters:**
- `phase: union` — Adds 'call': emitted as each review pipeline call of a dimension starts, with detail naming the stage and role and counting the dimension's calls so far (e.g. 'judge reviewer #3'). The runner passes a JudgeContext.onCall; the code-review pipeline entry (src/workflow/review-pipeline/code-review.ts, runReviewJob call) forwards it as runReviewJob's existing onCall hook (src/workflow/review-pipeline/driver.ts)

**Returns:** `n/a` — Streamed by codeReview.run as today's 'progress' frames (kind 'stage')

**Postconditions:**
- While a dimension runs, a frame precedes each model call (about one a minute on 86197ac6 s2)

### 2.4 `DAEMON_CODE_REVIEW_WAIT_MS`

```typescript
replaced by codeReviewWaitLimits(): { readonly ceilingMs: number; readonly idleMs: number } read from config codeReview.daemonReviewCeilingMs (default 4 h) and codeReview.daemonReviewIdleMs (default 20 min)
```

**Returns:** `{ ceilingMs: number; idleMs: number }` — The limits reviewByDaemon passes to codeReviewStream as timeoutMs and idleMs

**Preconditions:**
- Read as freshnessTimeoutMs is: from ~/.insrc/config.json, a missing, non-positive or non-numeric value falls back to its default; idleMs is clamped to at most ceilingMs

**Postconditions:**
- reviewByDaemon relays every frame it receives to the step's progress callback

### 2.5 `JudgeContext`

```typescript
interface JudgeContext { readonly groundingMode: 'full' | 'degraded'; readonly snapshot?: ReviewMaterialSnapshot | undefined; readonly signal?: AbortSignal | undefined; readonly onCall?: ((call: { readonly stage: string; readonly role: string }) => void) | undefined }
```

**Parameters:**
- `onCall: (call: { stage: string; role: string }) => void` _(optional)_ — New, optional. Told as each review pipeline call of the judge starts; the code-review pipeline entry forwards it as runReviewJob's onCall

**Returns:** `n/a (context)` — Passed by runCodeReview to every judge

**Postconditions:**
- Judges that ignore onCall behave as today
- A judge's own pipeline calls each produce one onCall

### 2.6 `CodeReviewStepDeps`

```typescript
interface CodeReviewStepDeps { /* existing fields unchanged */ readonly progress?: ((data: unknown) => void) | undefined }
```

**Parameters:**
- `progress: (data: unknown) => void` _(optional)_ — New, optional. The step tool's progress callback; the stepToolTable entry for insrc_code_review_step (src/daemon/steps/host.ts:69) threads the runner's third argument into it, and reviewByDaemon relays each daemon frame to it

**Returns:** `n/a (deps)` — Read by handleCodeReviewStep and reviewByDaemon

**Postconditions:**
- Without progress the step behaves as today
- DAEMON_CODE_REVIEW_WAIT_MS is removed; src/daemon/steps/code-review-step/__tests__/routing.test.ts, which imports it and asserts 30 minutes, asserts codeReviewWaitLimits' defaults instead

## 3. Data model changes

### 3.1 `config codeReview.daemonReviewCeilingMs` — new

number, default 14_400_000 (4 hours): the longest a daemon code review is waited for in total

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/steps/code-review-step/handler.ts`

### 3.2 `config codeReview.daemonReviewIdleMs` — new

number, default 1_200_000 (20 minutes): the longest a daemon code review may go without reporting progress; it must exceed the longest single review call

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/steps/code-review-step/handler.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/large-story-s-code-review-cancelled-E202610221973e125/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The daemon review stops making progress (a model call hangs, the daemon is wedged) while the step waits** (recoverable)
  - Detection: runReviewStream's idle timer: no frame of any kind for idleMs (default 20 min); each frame restarts it
  - Response: Fail with ReviewStreamError('timeout') naming the idle limit, then cancel the transport, which cancels the daemon's run as today. No record is written.
  - User impact: The tool answers next:'error' with the cause 'no progress from the daemon for 20 minutes' instead of hanging for hours
- **A review keeps progressing but runs past the overall ceiling** (recoverable)
  - Detection: runReviewStream's overall timer at timeoutMs (codeReview.daemonReviewCeilingMs, default 4 h), not reset by frames
  - Response: Fail with 'timeout' naming the ceiling and the setting to raise; cancel the daemon's run
  - User impact: A review larger than the ceiling fails with a message saying which setting to raise
- **The MCP client sent no progressToken** (recoverable)
  - Detection: mcpProgressSink is undefined in the MCP forwarder (server.ts), so no notifications are sent
  - Response: Unchanged: the step still runs and answers. A client that also has a silence limit may still give up; one that has none waits for the answer
  - User impact: Only clients without progress tokens keep today's behaviour
- **The step's progress callback throws, or the step.call stream is already closed (the client went away)** (recoverable)
  - Detection: createStepCallHandler wraps each progress send
  - Response: The error is swallowed and logged at debug; the step and the review carry on to their result as for any closed stream today
  - User impact: None: a failed progress send never fails the review

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A small review that finishes in under a minute | Same answer as today; a few progress frames may reach the client before the final one |
| Config sets daemonReviewIdleMs above daemonReviewCeilingMs, or either to 0, a negative or a non-number | A bad value falls back to its default, and idle is clamped to at most the ceiling |
| A single review call takes longer than idleMs (e.g. one judge call over 20 min) | The idle limit stops the review; the default (20 min) is above the longest observed call (about 1-2 min), and the setting can be raised |
| A design review (insrc_review_step, workflow.review) | Unchanged: it passes no idleMs, and its limits (HARD_REVIEW_DEADLINE_MS, designReview.timeLimitMs) stay as they are |
| Other step tools (analyze, workflow, build, triage) | Unchanged: they ignore the new optional progress argument |

**Invariants to preserve**

- A review pipeline job's own deadline, sessionLimitMs = min(first.deadlineMs, HARD_REVIEW_DEADLINE_MS) times the sessions planned, is unchanged; so are design reviews' limits [[c1]]
- A daemon review that does not complete is an error and never falls back to a controller review [[c2]]
- runReviewStream without idleMs keeps today's semantics: one overall wait, with progress and delta frames passed to onFrame [[c3]]
- The MCP forwarder relays progress only when the client sent a progressToken [[c6]]

## 6. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), as the existing src/**/__tests__/*.test.ts files`

**Test levels**

- **unit** — The review stream wait: the idle limit, the ceiling, and unchanged behaviour without idleMs
  - Subjects: `runReviewStream with idleMs: frames arriving more often than idleMs keep the request alive past idleMs, and it resolves on its final frame`, `runReviewStream with idleMs: no frame for idleMs fails 'timeout' naming the idle limit and cancels the transport`, `runReviewStream: frames do not extend timeoutMs; past it the request fails 'timeout' naming the ceiling`, `runReviewStream without idleMs: today's single wait`
  - Fixtures: `a fake transport that emits frames on a fake clock`
- **unit** — The code-review step's limits and relay
  - Subjects: `codeReviewWaitLimits reads codeReview.daemonReviewCeilingMs and daemonReviewIdleMs, falls back to the defaults on a bad value and clamps idle to the ceiling`, `reviewByDaemon passes the limits as timeoutMs and idleMs through the in-daemon client (codeReviewStream) and relays every progress frame to the step's progress callback`
- **unit** — Per-call progress from the runner
  - Subjects: `runCodeReview emits a 'call' progress as each pipeline call of a dimension starts (JudgeContext.onCall forwarded to runReviewJob's onCall), with the stage and role in detail, between that dimension's start and done`
- **integration** — Progress from a step tool reaches the MCP client
  - Subjects: `step.call: a step tool's progress calls arrive as 'progress' frames before the 'done' frame, and a failing progress send does not fail the step`, `MCP forwarder: a forwarded insrc_code_review_step with a progressToken emits notifications/progress for each progress frame`
- **integration** — A review longer than 30 minutes completes
  - Subjects: `A daemon code review (stubbed model, a fake clock) that runs past 30 minutes while reporting a call every minute completes and writes its record; one that goes quiet past the idle limit fails with the idle cause and writes none`
- **live** — The real case
  - Subjects: `The code review of Epic 86197ac660732ceb Story s2 completes and writes CR-86197ac660732ceb-s2`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `runReviewStream with idleMs: frames arriving more often than idleMs keep the request alive past idleMs, and it resolves on its final frame`, `A daemon code review (stubbed model, a fake clock) that runs past 30 minutes while reporting a call every minute completes and writes its record; one that goes quiet past the idle limit fails with the idle cause and writes none` |
| `ac2` | `codeReviewWaitLimits reads codeReview.daemonReviewCeilingMs and daemonReviewIdleMs, falls back to the defaults on a bad value and clamps idle to the ceiling`, `runReviewStream: frames do not extend timeoutMs; past it the request fails 'timeout' naming the ceiling` |
| `ac3` | `runCodeReview emits a 'call' progress as each pipeline call of a dimension starts (JudgeContext.onCall forwarded to runReviewJob's onCall), with the stage and role in detail, between that dimension's start and done`, `reviewByDaemon passes the limits as timeoutMs and idleMs through the in-daemon client (codeReviewStream) and relays every progress frame to the step's progress callback`, `step.call: a step tool's progress calls arrive as 'progress' frames before the 'done' frame, and a failing progress send does not fail the step`, `MCP forwarder: a forwarded insrc_code_review_step with a progressToken emits notifications/progress for each progress frame` |
| `ac4` | `runReviewStream without idleMs: today's single wait`, `The code review of Epic 86197ac660732ceb Story s2 completes and writes CR-86197ac660732ceb-s2` |

## 7. Migration

**State before:** A daemon code review is waited for at most a fixed 30 minutes in total (DAEMON_CODE_REVIEW_WAIT_MS in src/daemon/steps/code-review-step/handler.ts, passed as timeoutMs to codeReviewStream), and the review is cancelled when that runs out. The code-review runner reports progress only per dimension. The step drops the progress frames it does receive, and step.call has no way to send progress, so the MCP client sees a silent tool and aborts it after 1800 s (s1: the code-review step wait, review stream, step.call host and MCP relay bundles).

**State after:** The step waits with an idle limit (codeReview.daemonReviewIdleMs, default 20 min), restarted by every frame, inside an overall ceiling (codeReview.daemonReviewCeilingMs, default 4 h). The runner reports progress after each finished review call. The step relays every frame through step.call's new progress frames to the MCP client as notifications/progress. Design reviews and the pipeline's own deadline are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional idleMs to the review stream wait; callers without it keep today's single wait — ↩ rollbackable
2. Add an optional onCall to JudgeContext, forward it to runReviewJob's onCall in the code-review pipeline entry, and add the 'call' progress phase the runner emits for each call — ↩ rollbackable
3. Give step tools an optional progress callback, sent as 'progress' frames on the step.call stream; a failing send is logged and ignored — ↩ rollbackable
4. Add the two config keys with their defaults; replace DAEMON_CODE_REVIEW_WAIT_MS with the limits read from config, and relay the daemon's frames from the code-review step to its progress callback; the stepToolTable entry (src/daemon/steps/host.ts:69) passes the step's progress into CodeReviewStepDeps.progress, and routing.test.ts's assertion on the removed constant becomes one on codeReviewWaitLimits' defaults — ↩ rollbackable
5. Update the installed daemon (and restart the MCP server so it loads the same build), then rerun Epic 86197ac6 s2's code review — ↩ rollbackable

**Backward compat:** Additive. ReviewStreamOpts gains an optional field. StepToolRunner gains an optional third parameter. CodeReviewProgress gains a phase value; consumers that switch on phase see an unknown phase and must ignore it, as the progress frames' stageLabel already carries it as text. step.call gains 'progress' frames before 'done'; the MCP forwarder already relays them, and a client that does not read them ignores them. An MCP server older than the daemon still works: it receives and relays progress frames it already understands. Two new config keys with defaults; config reconcile fills them.

## 8. Alternatives considered

### 8.1 a1: Raise the fixed wait

Set DAEMON_CODE_REVIEW_WAIT_MS to a larger constant (e.g. 3 hours); change nothing else.



**Rejected because:** Violates fi1, fi2 and fi4: the tool stays silent, so the MCP client's 1800 s idle abort still cancels the review.

### 8.2 a2: Progress-kept-alive wait with a configurable ceiling — **CHOSEN**

The wait ends only if the review stops making progress (an idle limit) or reaches a configurable ceiling; progress flows from each finished review call through the step host to the MCP client.



### 8.3 a3: Asynchronous review: start, then poll

The step starts the daemon review and returns at once; a new phase polls for the record.



**Rejected because:** Only partial on fi1 and fi4; it changes the tool's contract for every caller and relies on a start/poll pattern that has been unreliable here.

## 9. References

- **[[c1]]** `code` `src/workflow/review-pipeline/job.ts:187-212`
- **[[c2]]** `code` `src/daemon/steps/code-review-step/handler.ts:713-741`
- **[[c3]]** `code` `src/shared/review-stream.ts:174-230`
- **[[c4]]** `code` `src/daemon/code-review-rpc.ts:120-136`
- **[[c5]]** `code` `src/daemon/steps/host.ts:89-117`
- **[[c6]]** `code` `src/mcp/server.ts:207-224`
- **[[c7]]** `code` `src/workflow/code-review/runner.ts:119-124`
- **[[c8]]** `code` `src/workflow/review/template.ts:61-62`
- **[[c9]]** `code` `src/daemon/steps/daemon-client.ts:123-147`
- **[[c10]]** `code` `src/shared/review-stream.ts:182-245`
- **[[c11]]** `code` `src/workflow/review-pipeline/driver.ts:27-75`
- **[[c12]]** `code` `src/workflow/review-pipeline/code-review.ts:262`
- **[[c13]]** `code` `src/workflow/code-review/types.ts:130-138`
- **[[c14]]** `code` `src/daemon/steps/host.ts:69`
- **[[c15]]** `code` `src/daemon/steps/code-review-step/__tests__/routing.test.ts:25`
- **[[c16]]** `code` `src/daemon/steps/code-review-step/__tests__/routing.test.ts:289`

## 10. Open questions

- cd1 (partial): codeReviewWaitLimits is a new function replacing DAEMON_CODE_REVIEW_WAIT_MS, not an existing symbol.
- dm1 (partial): src/config/config-catalog.ts, where the two keys are declared, is not cited in s1, though the file exists.

## Resolved questions

- `qe720ca27` — cd1 (partial): codeReviewWaitLimits is a new function replacing DAEMON_CODE_REVIEW_WAIT_MS, not an existing symbol.
  - **resolved**: Accept as new symbol — User 2026-10-23: codeReviewWaitLimits is new; the plan removes DAEMON_CODE_REVIEW_WAIT_MS and moves its callers (incl. routing.test.ts) onto it. _(2026-10-22T20:23:21.199Z)_

## Citations

- **[[c1]]** `code` `src/workflow/review-pipeline/job.ts:187-212`
- **[[c2]]** `code` `src/daemon/steps/code-review-step/handler.ts:713-741`
- **[[c3]]** `code` `src/shared/review-stream.ts:174-230`
- **[[c4]]** `code` `src/daemon/code-review-rpc.ts:120-136`
- **[[c5]]** `code` `src/daemon/steps/host.ts:89-117`
- **[[c6]]** `code` `src/mcp/server.ts:207-224`
- **[[c7]]** `code` `src/workflow/code-review/runner.ts:119-124`
- **[[c8]]** `code` `src/workflow/review/template.ts:61-62`
- **[[c9]]** `code` `src/daemon/steps/daemon-client.ts:123-147`
- **[[c10]]** `code` `src/shared/review-stream.ts:182-245`
- **[[c11]]** `code` `src/workflow/review-pipeline/driver.ts:27-75`
- **[[c12]]** `code` `src/workflow/review-pipeline/code-review.ts:262`
- **[[c13]]** `code` `src/workflow/code-review/types.ts:130-138`
- **[[c14]]** `code` `src/daemon/steps/host.ts:69`
- **[[c15]]** `code` `src/daemon/steps/code-review-step/__tests__/routing.test.ts:25`
- **[[c16]]** `code` `src/daemon/steps/code-review-step/__tests__/routing.test.ts:289`
