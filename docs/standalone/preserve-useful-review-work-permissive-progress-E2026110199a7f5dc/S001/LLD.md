<!-- insrc:artifact LLD-99a7f5dc933a8456-s1 -->

# LLD: STORY-99a7f5dc933a8456-s1

## Summary

**Epic:** `preserve-useful-review-work-permissive-progress`
**HLD base run:** `wf-1793509312835-bp3buc`
**HLD effective hash:** `99a7f5dc933a...`

Replace size-based task termination with 30-minute inactivity supervision. Task size remains an expected-duration hint. Native provider activity and explicit controller activity renew the grace; process heartbeats and repeated polls do not. Track running tools independently and preserve valid completed feedback before cancelling a silent wrapper. STORY-e6ddcdcb3d9cf330-s4 [[c6]] owns presentation.

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

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ReviewActivityMonitor`

```typescript
observe(event: ReviewActivityEvent): void; snapshot(): ReviewActivitySnapshot; stop(): void
```

**Parameters:**
- `event: ReviewActivityEvent` — Host-observed event bound to review/attempt/task/session; no arbitrary reason text or claimed timestamp

**Returns:** `ReviewActivitySnapshot` — Current phase, meaningful activity age and active tool identities/start times; supports STORY-e6ddcdcb3d9cf330-s4 [[c6]] without UI

**Errors:**
- `ReviewInactivityError` when 1800000ms without meaningful activity; snapshot diagnostics and cancel owned session unless valid feedback can first be committed

**Preconditions:**
- Use monotonic host time; each task execution owns one monitor; serial attribution/task calls share the current task monitor

**Postconditions:**
- No fixed task wall-clock cutoff
- Tool start/completion are activity; tool age and CLI-owned command termination, when available (not a host guarantee) are independent
- A running process, polls and heartbeat never refresh meaningful activity
- No automatic model retry

### 2.2 `runReviewSession`

```typescript
runReviewSession<T>(prompt, schema, opts: ReviewSessionOpts): Promise<T>
```

**Parameters:**
- `opts: ReviewSessionOpts` — Opt-in activity-supervised task mode, cancellation, event callback and optional validated candidate callback; existing bounded non-task callers retain behavior

**Returns:** `Promise<T>` — One validated final assessment; accepted candidate may survive wrapper-exit timeout only after full schema/scope validation

**Errors:**
- `ReviewInactivityError` when No activity for the configured 30-minute grace and no recoverable valid assessment
- `AbortError` when Explicit cancellation; do not treat as timeout or retry
- `ReviewActivityUnsupportedError` when Activity-supervised task mode is requested from Ollama or another provider without explicit review-activity capability; refuse before execution, do not reroute

**Preconditions:**
- Claude and Codex native event adapters normalize only observable metadata
- Do not treat partial JSON, tool acknowledgement or transcript snippets as completed assessment
- NEW REQUIRED PROVIDER WORK [[c5]]: for activity-supervised task calls only, invoke Claude with --print --output-format stream-json --verbose --include-partial-messages plus the existing schema/read-only grants. Parse incremental JSONL assistant/content/tool/result events and the terminal result envelope; retain schema validation and structured_output semantics. Other Claude call modes keep their current json flags. Codex already uses exec --json; parse its item/turn lifecycle records incrementally instead of waiting for runSubprocess to return. Add an opt-in stdout-chunk observer through runSubprocess/spawnOnce/runInProcessGroup. Decode UTF-8 incrementally, bound frame buffers and map only documented/fixture-verified native events; malformed/unknown frames never renew activity. Verify installed CLI flags and event fixtures before wiring; capability failure is explicit, never fake progress.
- [[c7]] Opt-in activity-supervised task mode initially requires a provider explicitly advertising native review-activity capability (CliProvider Claude/Codex). OllamaProvider implements the same runReviewSession interface in src/agent/providers/ollama.ts but currently uses a bounded local read-only tool loop. Add an explicit capability check at task admission before checkpoint mutation or provider execution; when review resolves to Ollama, refuse unsupported activity-supervised mode with ReviewActivityUnsupportedError. No silent fallback to an old deadline, no provider/model substitution and no automatic retry. Normal bounded Ollama design-review and non-task calls remain supported and unchanged. Ollama runReviewSession also rejects an explicitly supplied activity-supervised task option defensively, before starting its loop; omitted option retains existing deadline/signal semantics. Adding native Ollama activity support is separate future work, not implied by this story.
- EXECUTION UNION [[c8]]: retain existing bounded shape {mode?: "bounded", deadlineMs: positive finite number, ...existingOptions}; add disjoint activity shape {mode: "activity", inactivityMs: 1800000, signal: AbortSignal, onActivity: (event) => void, onCandidate: async (candidate) => CandidateReceipt, internalRetry: false}; deadlineMs, stallMs and reviewBudget are forbidden in activity mode. Runtime validation rejects mixed modes. Task callers use activity mode only. Provider ExecOverride and ProcessGroupOpts distinguish bounded {timeoutMs: positive finite number} from activity {mode:"activity", signal, onStdoutChunk}; activity branch arms NO wall-clock timeout or old first-output/raw-stdout silence watchdog. Never implement no-timeout with Infinity, zero, giant timer, or fallback provider timeout. Task monitor is sole inactivity timer, explicit cancellation remains active. Non-task bounded callers retain current behavior. Coordinator attribution and task calls share a task monitor but get distinct native session IDs. Provider resolution/capability check happens before admission writes; late adapter errors become explicit incomplete results.

**Postconditions:**
- No hidden provider timeout/first-output watchdog undercuts task policy
- Process group cleanup retained
- Unrelated design/LLM calls keep existing timeout behavior
- Partial model-output arrival may renew activity without retaining or exposing its text; tool identities/start/end are metadata only. Complete feedback candidates use the existing full schema and host assessment validation before durable acceptance. A tool-use acknowledgement or incomplete tool input never counts as a finished assessment.

## 3. Data model changes

### 3.1 `ReviewActivityEvent` — new

Ephemeral typed events: session_started, model_output, tool_started, tool_completed, feedback_submitted. Host binds IDs and timestamps; no reasoning, raw prompts, command output or untrusted arbitrary status. Bounded incremental JSONL parsers handle partial frames. Unknown/keepalive events do not renew grace. [[c5]] Native stream adapters and chunk-observer plumbing are NEW work, not existing capabilities. Coordinator constructs the task-owned monitor, passes observation callbacks into each serial provider call and handles expiry. Controller constructs the same monitor and routes owner-bound activity into it. No host per-tool kill facility is claimed: records identify running tools and their age, while 30-minute no-activity expiry cancels the owned review group; do not invent an additional tool duration threshold. A running tool with observed progress may continue; an unobservable silent tool is unknown until grace expires.

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/cli-provider.ts`
- `src/shared/process-group.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`
- `src/daemon/task-review-rpc.ts`

### 3.2 `Task execution timing` — invariant-change

Remove size-dependent 5/10/15-minute cancellation and controller remainingMs semantics for task reviews. Expected duration remains advisory. A task owns one inactivity clock and zero-to-many active tool records keyed by native call ID. Duplicate/replayed events do not extend leases. Tool records contain start time and terminal state; elapsed tool time is distinct from model silence. No host per-tool deadline is assumed; CLI-internal limits are not relied upon; merely being active never renews review inactivity. End-to-end cancellation reason remains explicit. STORY-e6ddcdcb3d9cf330-s4 [[c6]] adds durable presentation snapshot; no immutable packet mutation here.

**Call sites:**
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`
- `src/daemon/task-review-rpc.ts`

### 3.3 `Controller activity ownership` — field-add

Add owner-bound activity submission to explicit controller protocol with a monotonic sequence, task/attempt IDs and allowlisted event kinds. Polling and client timestamps cannot extend grace. Controller must forward its actual review execution events; unsupported telemetry reports unknown and still receives 30-minute grace. Disconnect continues existing explicit-retrigger behavior. Daemon adapter obtains events directly from subprocess. Document additive wire capability and reject stale/wrong-owner activity without changing checkpoints.

**Call sites:**
- `src/workflow/code-review/task-review/controller.ts`
- `src/daemon/task-review-rpc.ts`

### 3.4 `Review inactivity diagnostic snapshot` — new

[[c5]] Record observation facts, not inferred root causes: phase (awaiting_model/tool_running/feedback_pending), activityAgeMs, active tool IDs/ages, event-loop delay sampled through node:perf_hooks monitorEventLoopDelay, normalized OS load (node:os loadavg and availableParallelism), and telemetry availability. Snapshot is bounded and emits only at inactivity or explicit diagnostics, not a monitoring subsystem. local_contention_observed means sampled event-loop delay >=1000ms or normalized one-minute load >=1; include measured values and report correlation only, never proof that load caused model silence. With no active tool and no local contention evidence use remote_or_model_wait_unconfirmed; if metrics unavailable use inactivity_cause_unknown. With active tool use tool_running_no_observed_progress, include any local contention flag independently; do not diagnose a proven hang merely from silence. CLI-reported tool failure/timeout is separately tool_failed/tool_timeout. On delayed timer wake evaluate fresh monotonic age and latest parsed events before intervening. All cases retain the same 30-minute inactivity policy, no heartbeat extension.

**Call sites:**
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`
- `src/agent/providers/cli-provider.ts`

### 3.5 `Review activity capability and Ollama boundary` — field-add

[[c7]] Add optional review-activity capability to the shared provider contract; absent means unsupported. CliProvider advertises support only for implemented native event adapters. OllamaProvider keeps bounded non-task review sessions and explicitly rejects opt-in activity-supervised task execution. Coordinator admission checks capability before writing or running; controller route uses its explicit owned event protocol rather than guessing provider support. Constructor/type fixtures cover every implementor. No standalone sibling S4 exists: the presentation consumer is STORY-e6ddcdcb3d9cf330-s4 [[c6]]. The diagnostic snapshot remains internal here and presentation may be implemented later without blocking timeout correctness.

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/ollama.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/daemon/task-review-rpc.ts`

### 3.6 `Controller activity exchange wire contract` — field-add

[[c8]] Add codeReview.task.activity RPC beside existing codeReview.task.assignment/scope/result exchanges; all use trusted persistent connection owner checks and serialized controller queue. Request is {repo, reviewId, attempt, taskId, executionId, sequence, event:{kind:"model_output"|"tool_started"|"tool_completed", toolId?:string}}. executionId is host-generated opaque token per current task execution; sequence is safe positive integer strictly increasing across scope/activity/result exchanges for that execution. Only tool events require bounded toolId; no text, caller timestamp, heartbeat or arbitrary phase. Scope/result submissions also carry taskId/executionId/sequence so stale output cannot complete another execution. Exact accepted replays return the saved receipt without renewing the lease; differing replay conflicts. Stale/out-of-order or wrong-owner events reject with no clock/result mutation. An event ack is {reviewId,attempt,taskId,executionId,acceptedSequence,inactivityRemainingMs}. Scope/task frames add timing:{mode:"activity",inactivityMs:1800000,inactivityRemainingMs,expectedDurationMs}, executionId and nextSequence; omit legacy remainingMs entirely. expectedDurationMs is advisory only. Assignment polling never renews inactivity. Explicit resume retains immutable packet/history and creates a new executionId and sequence origin for unfinished task; old-generation events/results reject. Older controllers may omit activity submissions and receive unknown telemetry plus full grace, but must understand activity timing and execution envelope; unsupported timing protocol refuses explicitly, never interprets it as bounded remainingMs. Disconnect/retrigger behavior remains unchanged. Expose capability in start acknowledgement; do not migrate normal entrypoints owned by epic S3.

**Call sites:**
- `src/workflow/code-review/task-review/controller.ts`
- `src/daemon/task-review-rpc.ts`
- `src/workflow/code-review/task-review/coordinator.ts`

### 3.7 `Validated feedback commit protocol` — new

[[c8]] Provider adapters emit candidate kind and parsed object through awaited onCandidate, never edit checkpoints. Claude early recovery accepts only a complete StructuredOutput tool_use input matching the exact requested task schema; partial input_json_delta, tool_result acknowledgement and generic assistant JSON are excluded. Host runs the same assignment schema, normalizeTaskResult, evidence-reference and assessTaskResult checks as ordinary final results. Complete host-validated ordinary task assessment is authoritative after its atomic checkpoint write, irrespective of later CLI envelope/nonzero exit: subsequent wrapper failure is diagnostic, cannot revoke or replace an already accepted assessment. This intentional precedence is tested. Attribution is not a task result: accepted scope candidates only populate assignment state; do not persist or treat as passed task. Codex accepts a completed final assistant item only when its full object passes host validation; no other assistant snippets are accepted. If native metadata cannot identify a final item unambiguously, wait for successful turn.completed plus schema-valid final object and disclose early recovery unavailable; never guess. Same host validation/commit rule for both providers. Serialize feedback validation, atomic result write and expiry via one task-owned queue; candidate received before expiry is enqueued before expiry, which rechecks activity and durable result. Invalid candidate is rejected, no result/lease promotion, and no auto retry. Host can count its complete native event as activity only if recognized as genuine new model output. Once the write succeeds return accepted receipt and cancel/clean up the owned subprocess group without waiting for another model turn. Later duplicate identical candidate/final envelope returns saved result; conflicting duplicate is rejected and logged. Checkpoint write failure stops execution and preserves last durable checkpoint; a valid but unsaved candidate is NOT reported completed, no in-memory result may leak into next task. Expiry with no durable result cancels group and writes incomplete through normal checkpoint path. Tests cover candidate then crash, acknowledgement only, invalid candidate, conflicting duplicates, write failure, candidate/expiry ordering and cancellation after commit. No new candidate persistence format is required: the completed-task checkpoint is the durable record.

**Call sites:**
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`
- `src/agent/providers/cli-provider.ts`

### 3.8 `Bounded task CLI stream retention` — invariant-change

[[c8]] Task activity subprocess mode uses incremental StringDecoder UTF-8 parsing and does not accumulate full stdout/stderr as the existing bounded subprocess runner does. Maximum incomplete/native JSON frame is 8 MiB; maximum complete candidate is existing 4 MiB review JSON ceiling; bounded stderr/diagnostic ring is 64 KiB; retain at most one parsed candidate/final envelope, discard raw processed frames immediately. Overflow explicitly stops as incomplete with safe diagnostic and no model retry, never truncates a candidate or silently drops required evidence. Parse/callback exceptions cancel the owned group and release timers/decoder resources. Observer queues are serialized with backpressure so chunk/event accumulation cannot grow without bound; listener consumes chunks without unawaited per-event promises. Existing non-task buffering is unchanged. Lifecycle cancellation must remain responsive while validation is pending; no event callback may await process exit or another provider call.

**Call sites:**
- `src/shared/process-group.ts`
- `src/agent/providers/cli-provider.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/preserve-useful-review-work-permissive-progress-E2026110199a7f5dc/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **No observed activity while awaiting model with no local pressure evidence** (recoverable)
  - Detection: No active tool, activityAgeMs >=1800000; sampled event-loop delay/load below thresholds or unavailable
  - Response: Record remote_or_model_wait_unconfirmed (or inactivity_cause_unknown if unavailable), metric availability and values. Validate/persist any complete feedback candidate first; otherwise cancel owned session and checkpoint incomplete. Never claim a verified network outage.
  - User impact: Silent hosted-model wait is distinguishable from observed local pressure without inventing causation
- **Tool hangs or CLI never exits after valid feedback** (recoverable)
  - Detection: Tool record exists with start time/age and no newer meaningful event for 30 minutes, or CLI explicitly reports tool failure/timeout; no pre-existing host tool deadline is assumed
  - Response: Record tool_running_no_observed_progress plus tool ID/age; an explicit CLI timeout is tool_timeout. Apply review inactivity cancellation to the owned process group, not a guessed per-tool kill. Persist complete valid assessment first where available; retain incomplete if required verification is unknown.
  - User impact: Useful assessment is not discarded merely waiting for wrapper exit
- **Malformed/stale activity or output parser failure** (recoverable)
  - Detection: Bounded parser/schema check; owner/task/attempt/sequence validation
  - Response: Ignore unsupported activity without renewing grace; reject stale ownership; surface telemetry unknown. Invalid assessment never becomes pass.
  - User impact: Honest incomplete status when evidence unavailable
- **Checkpoint write fails or cancellation races feedback** (recoverable)
  - Detection: Serialized durable result commit fails or cancellation signal arrives
  - Response: Preserve last durable checkpoint, release ownership safely; one terminal winner, no automatic re-execution
  - User impact: Resume only unfinished work using existing recovery rules
- **Local machine contention observed during review inactivity** (recoverable)
  - Detection: At expiry sample event-loop delay >=1000ms or normalized one-minute OS load >=1; retain both raw measured values and telemetry availability
  - Response: Record local_contention_observed independently of phase/tool records, not as proof of cause. Reconcile pending activity/valid feedback before the same inactivity intervention.
  - User impact: Diagnostics expose actual local pressure separately from unexplained remote/model silence
- **Review role resolves to Ollama for activity-supervised task execution** (recoverable)
  - Detection: Provider capability absent/unsupported at admission, or direct Ollama call contains opt-in task activity mode
  - Response: Return ReviewActivityUnsupportedError before model/tool execution or checkpoint writes. Keep configured provider unchanged and require an explicit user/configuration decision; no fallback or retry.
  - User impact: Unsupported local task mode is explicit; existing bounded Ollama non-task reviews continue unchanged

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Continuous meaningful activity beyond former task deadline | Continue without fixed task cutoff; size hint remains advisory |
| Repeated heartbeat/poll/duplicated event | Inactivity clock unchanged |
| Tool start, no more progress for 30 minutes | Tool remains separately identified; the new review inactivity monitor intervenes, no unbounded lease |
| Complete validated feedback just before inactivity alarm | Serialize feedback persistence before cancellation; do not reinterpret raw transcript as assessment |
| Unrelated design review or ordinary provider call | Existing bounded execution behavior unchanged |

**Invariants to preserve**

- Only submitted change set defines scope; immutable per-attempt inputs and per-task durable checkpoint remain. [[c1]]
- Explicit controller retrigger; failed/incomplete tasks handled in subsequent attempts; no automatic model retry. [[c1]]
- Daemon/controller and Claude/Codex follow identical inactivity semantics; no direct cloud REST. [[c1]]

## 6. Test strategy

**Test framework:** `Existing node:test via tsx, fake clocks and fake CLI processes; production npm run build. Any live smoke separately authorized and labelled; do not rerun 123-test/full review rounds as design validation.`

**Test levels**

- **unit** — Use fake monotonic time to verify exactly 30-minute inactivity, activity beyond former size deadlines, heartbeat/replay rejection and isolated tool timing without waiting real minutes.
  - Subjects: `activity monitor`, `task timeout policy`
  - Fixtures: `fake clock/timer`
- **integration** — Exercise daemon/controller parity and real subprocess streaming adapters with deterministic fake CLI binaries; no live-model retries.
  - Subjects: `TaskReviewCoordinator`, `controller review protocol`, `CliProvider Claude/Codex adapters`, `process-group cancellation`
  - Fixtures: `fragmented native event streams`, `silent process`, `long tool`, `near-expiry structured feedback`, `wrong owner/stale event`, `Claude stream-json partial/content/tool/result event fixtures`, `Codex JSONL item/turn events delivered in fragmented UTF-8 chunks`, `Injected local load/event-loop-delay metrics and unavailable diagnostics`, `Activity execution union rejects deadlineMs/stallMs mixtures; no legacy timer armed; bounded caller unchanged`, `Actual IPC activity/scope/result generation envelopes, stale resume and owner checks; poll and accepted replay do not renew`, `Valid Claude StructuredOutput then process crash retains committed result; acknowledgement/partial JSON never passes`, `Codex unambiguous final-item acceptance and successful-turn fallback; conflict/write-failure/expiry race parity`, `Fragmented UTF-8/frame overflow, bounded stderr/event queues and cancellation during callback; no output truncation or whole-stream accumulation`
- **contract** — Validate old checkpoint/result compatibility, additive controller capabilities and unchanged non-task bounded provider calls.
  - Subjects: `ReviewSessionOpts`, `controller frames`, `existing checkpoint/CR readers`, `OllamaProvider.runReviewSession in src/agent/providers/ollama.ts`, `src/agent/providers/__tests__/ollama-review-session.test.ts`
  - Fixtures: `Existing bounded Ollama deadline/AbortSignal tests with activity option omitted`, `Opt-in unsupported task mode rejected before any Ollama complete/tool call`, `Configured Ollama review role rejected before checkpoint mutation; zero fallback calls`
- **smoke** — Production build and focused existing reviewer/provider regressions; no whole-repository or paid live sweep.
  - Subjects: `TypeScript build`, `task-review tests`, `provider review-session tests`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Progressing task survives old S/M/L cutoffs; no fixed task termination` |
| `ac2` | `Fake-clock 30-minute inactivity grace; process heartbeat, repeated polls and replayed events do not renew`, `No active tool + normal local samples => remote_or_model_wait_unconfirmed, not proven network failure`, `Injected loop-delay/high-load metrics => local_contention_observed with measured facts; unavailable metrics => inactivity_cause_unknown`, `Active silent tool => tool_running_no_observed_progress with age; explicit native timeout => tool_timeout; activity on a long tool extends grace`, `Delayed event-loop timer reconciles recent queued activity and candidate feedback before expiry` |
| `ac3` | `Near-expiry validated candidate persisted exactly once; malformed output stays incomplete`, `Valid Claude StructuredOutput then process crash retains committed result; acknowledgement/partial JSON never passes`, `Codex unambiguous final-item acceptance and successful-turn fallback; conflict/write-failure/expiry race parity`, `Fragmented UTF-8/frame overflow, bounded stderr/event queues and cancellation during callback; no output truncation or whole-stream accumulation` |
| `ac4` | `Daemon/controller and Claude/Codex parity; no retry; stale ownership rejected`, `Ollama bounded non-task review-session regressions unchanged; unsupported activity mode refuses early without model calls, checkpoint mutation or provider substitution` |

## 7. Migration

**State before:** Task review applies size-based 5/10/15-minute host cancellation; provider may have independent deadlines/watchdogs. No incremental review-session activity contract.

**State after:** New task executions use a shared 30-minute inactivity policy with no fixed task wall clock; tools tracked separately. STORY-e6ddcdcb3d9cf330-s4 [[c6]] consumes normalized activity for presentation later.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add/test opt-in shared monitor and provider event adapters; preserve non-task callers and existing persisted formats. Explicitly introduce Claude stream-json task-mode flags, incremental Codex parsing and opt-in process stdout observation; no assumed existing activity stream. — ↩ rollbackable
2. Wire daemon and controller task execution to policy; remove old size deadlines and undercutting provider timeouts only for task mode. Expose additive controller activity capability. — ↩ rollbackable
3. Build and focused regressions, commit/push when requested, user updates daemon; existing active process finishes under its admitted old policy. New runs use new policy; no running-review hot patch. — ↩ rollbackable
4. Implement STORY-e6ddcdcb3d9cf330-s4 [[c6]] presentation using shared events, then resume overall review work with preserved history and explicit subsequent attempts. — ↩ rollbackable

**Backward compat:** No rewrite of submitted packets, checkpoint history or CR schema. Legacy/non-task provider contracts remain bounded. Controller clients without activity telemetry get explicit unknown plus full inactivity grace; never silently infer progress from polls. Rollback changes future executions only.

## 8. Alternatives considered

### 8.1 a1: Raise fixed task deadlines

Keep wall-clock cancellation but increase allowances.

Replace current size-based limits with larger fixed limits; otherwise retain provider and controller timing contracts.

**Rejected because:** Larger fixed deadlines still discard useful progressing work.

### 8.2 a2: Shared inactivity supervision — **CHOSEN**

Remove task wall-clock cutoff; supervise observable activity consistently.

Use one execution policy for daemon and controller: task size provides expected duration only, meaningful observed events renew an inactivity grace, process heartbeats do not. Track tool executions separately, preserve validated feedback and keep explicit caller cancellation. User confirmed 30-minute grace.

### 8.3 a3: Unlimited unsupervised review

Remove every deadline without detecting inactivity.

Allow sessions to run until completion or manual cancellation with no progress or tool-hang supervision.

**Rejected because:** Unsupervised unlimited sessions cannot detect stuck work.

## 9. References

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `stakeholder` `User confirmation 2026-11-01: no fixed task deadline; 30-minute inactivity grace; tools tracked separately`
- **[[c3]]** `code` `src/workflow/code-review/task-review/coordinator.ts`
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts`
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts` — "Current Claude json envelope and Codex post-exit parsing require new task-mode stream adapters; independent review correction 2026-11-01."
- **[[c6]]** `prior-artifact` `.insrc/artifacts/DEF-e6ddcdcb3d9cf330.json` — "body.stories contains s4: Show incremental progress during background code reviews; presentation belongs to this separate epic."
- **[[c7]]** `code` `src/agent/providers/ollama.ts:712` — "OllamaProvider implements runReviewSession using a bounded local tool loop; new activity mode needs explicit capability handling."
- **[[c8]]** `code` `src/workflow/code-review/task-review/controller.ts` — "Current controller has required timing checks/remainingMs and owner-serialized exchange; author self-review correction makes replacement execution protocol explicit."
