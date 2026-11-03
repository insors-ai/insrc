<!-- insrc:artifact LLD-9b04adb36cac716d-s2 -->

# LLD: STORY-9b04adb36cac716d-s2

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**HLD base run:** `wf-1793694252789-heyhey`
**HLD effective hash:** `20a9ee7f3bdf...`

S2 lets an interrupted design review continue from its accepted chunks and retries only the failed unit, with one persisted budget. It detects changes to the reviewed artifact during execution, stops that attempt, and requires user approval for a fresh full review. The existing coordinator/checkpoint remain authoritative for native and controller reviewers.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-9b04adb36cac716d** § 2. Framework summary

**Rollout phase:** B — controlled recovery
**Owns:** `sc3` (Change invalidation and bounded technical recovery)
**Consumes:** `sc1` (Design review subject, policy and semantic chunk contract), `sc2` (Durable review attempts, feedback and progress)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Deliver the first useful normal-entrypoint review: latest-subject resolution, opposite-party execution, shared artifact-specific policy, reviewer chunk planning, sequential inspection, durable completed results, visible progress and a retrievable consolidated report. Keep prompt construction, native/controller exchange and checkpoint IO private; no shared-engine migration. Produce real narrow hosted-review evidence as well as deterministic fixtures. — owns `sc1`, `sc2`
- `s3`: Own reviewer-led direct/indirect impact assessment, old/new plan mapping, conservative full-review fallback, retained coverage and finding reconciliation. Its document comparison/selection implementation stays private; expose only auditable scope reasoning and provenance, not a generic dependency engine. — owns `sc4`
- `s4`: Own lifecycle version-aware record publication/readers, normal approval integration, history-preserving cleanup, multi-session routing qualification and final compiled/live verification. Keep cleanup fence and publication retries internal. No new review dashboard, activation state or legacy compatibility execution. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DesignReviewCoordinator`

```typescript
interface DesignReviewCoordinator { recover(input: DesignRecoveryAction & { readonly phase: 'recover'; readonly repo: string; readonly actionId: string }, context?: DesignStartContext): Promise<DesignReviewAcknowledgement>; start(input: unknown, context?: DesignStartContext): Promise<DesignReviewAcknowledgement>; progress(project: string, reviewId: string, attempt: number, options?: { includeResult?: boolean | undefined; afterCompletedChunk?: number | undefined }): Promise<DesignObservation>; exchange(input: unknown, owner: DesignControllerOwner): Promise<unknown>; }
```

**Parameters:**
- `input: DesignRecoveryAction & { readonly phase: 'recover'; readonly repo: string; readonly actionId: string }` — Strict phase=recover envelope: repo/reviewId/attempt/actionId plus operation resume|restart_full|retry_publication; attempt is the source/current attempt. actionId is a literal idempotency key; optional userDecision is bounded action/reason/recordedAt. No prompt/document bodies, caller-selected party or commits. Required wire phase:'recover' is separate from operation. Extend DesignRequestSchemas, DESIGN_REVIEW_PHASES, MCP schema/guide and designReviewOperation with recover/failure; register/audit both short unary methods as main-owned. designReviewStep routes recover before the exchange-only owner guard: native resolves provider as start does; controller requires the actual live recovering connection.
- `context: DesignStartContext` _(optional)_ — Existing trusted connection identity/signal and review-role provider factory; reviewer is derived from subject, not request.

**Returns:** `Promise<DesignReviewAcknowledgement>` — Existing acknowledgement fields reviewId/attempt/artifactId/reviewer/status/checkpointPath. Durable admission precedes acknowledgement and dispatch. resume keeps attempt; restart_full acknowledges source attempt+1.

**Errors:**
- `DesignReviewInputError` when Strict schema, unsupported phase/action, malformed identifiers, invalid expected attempt or limits.
- `DesignReviewConflictError` when Conflicting actionId replay, active foreign controller/subject, skipped/stale attempt or terminal state not resumable.
- `DesignReviewError` when artifact_changed (sticky invalidation); user_decision_required; retry_budget_exhausted; wrong_owner; publication_unavailable (S4 owns publisher). Requests with unknown actions never reach provider. Also missing_checkpoint, missing_attempt, checkpoint_too_large, foreign_checkpoint and immutable_history remain concrete domain codes and never trigger model retries.
- `DesignReviewPersistenceError` when Admission/reservation/invalidation/result save cannot be made durable; retain prior snapshot and fence execution.

**Preconditions:**
- Registered canonical project and matching checkpoint subject; same-attempt resume validates stored subject fingerprints without revalidating changed external references.
- Resume only interrupted work (or paused with explicit retry_failed_unit decision). No auto startup scan/recovery. Duplicate actionId with identical action returns stored acknowledgement; changed body conflicts.
- restart_full requires invalidated source attempt plus userDecision.action=restart_full; fresh subject preparation re-derives author/reviewer/workflow references. No retained chunks, plan or retry budget.
- retry_publication is a typed sc3 seam for S4 and returns publication_unavailable in S2; never reruns model work.

**Postconditions:**
- One active job per subject, independent subjects may run concurrently; resume deduplication and admission use the same coordinator serial ownership as start.
- Persist action reservation, unit generation/counters and recoverable state before acknowledging. Controller recovery binds the actual new connection only after old execution has ended; stale owner/generation responses cannot commit.
- Native work survives requesting MCP disconnect; reviewing-controller disconnect is interrupted. Neither disconnect nor daemon restart creates an automatic retry loop.
- No lifecycle approval/history writes in S2; accepted checkpoint report retrieval is retained.

### 2.2 `loadDesignCheckpoint`

```typescript
loadDesignCheckpoint(project: string, reviewId: string): Promise<DesignReviewCheckpoint | undefined>
```

**Parameters:**
- `project: string` — Canonical registered project
- `reviewId: string` — Existing literal review identity

**Returns:** `Promise<DesignReviewCheckpoint | undefined>` — Existing bounded no-follow checkpoint with optional S2 recovery metadata. Old S1 checkpoints remain readable; interrupted old current execution conservatively counts as its already-reserved initial dispatch, never as zero work.

**Errors:**
- `DesignReviewError` when Existing foreign/corrupt/oversized checkpoint checks plus inconsistent unit counters/actions/history.

**Preconditions:**
- No automatic schema migration or startup dispatch.

**Postconditions:**
- Read does not mutate or renew activity; old failed terminal attempts remain terminal, not silently upgraded into retryable work.

### 2.3 `saveDesignCheckpoint`

```typescript
saveDesignCheckpoint(project: string, input: DesignReviewCheckpoint): Promise<void>
```

**Parameters:**
- `project: string` — Canonical project
- `input: DesignReviewCheckpoint` — Validated bounded snapshot with monotonically evolving active recovery state

**Returns:** `Promise<void>` — Existing atomic fsync/rename persistence; no second journal.

**Errors:**
- `DesignReviewPersistenceError` when Filesystem I/O failure normalized at saveDesignCheckpoint boundary; preserve prior snapshot and fence execution.
- `DesignReviewError` when Domain/schema failure including checkpoint_too_large, foreign_checkpoint, immutable_history, decreasing counters or noncontiguous attempts; preserve concrete error code.

**Preconditions:**
- Older attempts are fully immutable once a later attempt exists; current accepted baseline/plan/completed feedback stay immutable.

**Postconditions:**
- Retry/action reservations and accepted result writes are serialized, monotonic and durable; failed save preserves prior accepted snapshot.
- S2 explicitly changes coordinator commit(): preserve/rethrow existing DesignReviewError (including DesignReviewPersistenceError), wrap only untyped filesystem/unknown errors. saveDesignCheckpoint normalizes filesystem errors at its own boundary. All failed saves fence work without technical model retry.

## 3. Data model changes

### 3.1 `DesignRecoveryAction` — new

Own sc3 action type: operation resume|restart_full|retry_publication; reviewId; source attempt; optional userDecision {action,reason,recordedAt}. Strict recover request adds repo and actionId (literal <=128 chars) for durable exact replay. User-decision metadata is an audit record supplied by the controller after explicit in-chat approval, not a new trust-key service. resume after interruption needs explicit controller request but no extra human approval; restart_full and retry after exhaustion require matching userDecision. An exhausted user-directed resume authorizes ONE additional launch of that failed unit, with no renewed automatic budget. Conflicting reuse of actionId is rejected. Wire request additionally requires phase:'recover', independently strict-validated from operation. Add recover/failure dispatch and main-owned routes; recover precedes the unconditional controller-exchange guard.

```
type DesignRecoveryAction = { operation: 'resume'|'restart_full'|'retry_publication'; reviewId: string; attempt: number; userDecision?: { action: 'restart_full'|'retry_failed_unit'; reason: string; recordedAt: string } | undefined };
type DesignRecoveryRequest = DesignRecoveryAction & { readonly phase: 'recover'; readonly repo: string; readonly actionId: string };
```

**Call sites:**
- `src/daemon/design-review-rpc.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.2 `DesignRecoveryState` — new

Own sc3 projection: attempt/status interrupted|paused|invalidated, reason connection_lost|daemon_restarted|technical_retry_exhausted|artifact_changed, optional failedUnit, completedChunkIds, requiresUserInput. Existing progress adds optional recovery field, active generation, retriesUsed and failed-unit diagnostic; default page remains metadata-only. Stored pending/running without live job projects interrupted(daemon_restarted); progress never persists a synthetic retry or starts work.

```
interface DesignFailure { unitId: string; phase: 'planning'|'impact'|'chunk_review'|'publication'; code: string; summary: string; retriesUsed: number; }
interface DesignRecoveryState { attempt: number; status: 'interrupted'|'paused'|'invalidated'; reason: 'connection_lost'|'daemon_restarted'|'technical_retry_exhausted'|'artifact_changed'; failedUnit?: DesignFailure | undefined; completedChunkIds: readonly string[]; requiresUserInput: boolean; }
```

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/progress.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.3 `DesignAttempt` — field-add

Consume sc2, add optional recovery metadata in schemaVersion1: one unit {unitId,phase,executionId,dispatches,retriesUsed,diagnostics}, recovery state, and actions [{actionId,signature,operation,sourceAttempt,resultAttempt,userDecision?,acceptedAt}]. One checkpoint owns 1..128 attempts; one attempt owns 0..1 active unit, 0..128 completed chunks, 0..128 action records. Counters are safe integers; automatic dispatches for a unit <=4, retriesUsed<=3. Up to four bounded diagnostic summaries (<=8192 chars each) for that unit, not raw output/transcripts. Explicit extra dispatches are covered by distinct durable one-launch action records, not resets. Keep overall64MiB checkpoint and1MiB result caps; reject rather than truncate review scope/history. Prior attempts freeze entirely on append. Initial submitted identity remains unchanged; actions link later attempts. Retain one sealed unitSummary per completed planning/chunk unit (at most129), with unitId/phase, automaticDispatches, retriesUsed, userDirectedDispatches, up to four automatic diagnostic summaries and recovery actionId links. Current unit.dispatches means automaticDispatches only. Extra one-launch actions each retain one bounded outcome code/summary, filled once; their input identity remains immutable. Seal summary before replacing current unit. This preserves earlier units' retry/failure summaries for S4 without a per-invocation/event ledger. Counters are monotonic per unitId, not across distinct units; sealed summaries and filled outcomes cannot change.

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/checkpoint.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.4 `DesignUnitAssignment` — field-add

Consume sc1, add optional pointed previousTechnicalFeedback, retriesUsed and operation state; use fresh executionId and reset response sequence for each unit dispatch, never repeat accepted generation. Add strict controller failure exchange with existing review/attempt/executionId/sequence and bounded code/summary; host classifies allowed technical failures. Semantic HIGH/MED/incomplete accepted feedback is not retryable. Structurally valid but semantically rejected plan/result uses the same coordinator technical-output failure path as native; identity/sequence/schema-invalid requests remain request errors and do not spend retry budget or close a healthy owner.

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/coordinator.ts`
- `src/mcp/design-review/handler.ts`

### 3.5 `DesignReviewCoordinator` — invariant-change

Execution algorithm: recover accepted plan or plan only if absent; traverse persisted plan in dependency order, skip completed prefix and retain accepted feedback byte-for-byte; final consistency reruns only if unfinished. Reserve initial dispatch or next technical retry before launching. Completed unit save precedes next unit. A crash after reservation counts that dispatch conservatively; explicit resume relaunches unfinished unit with next generation/remaining budget, never assumes a reserved execution did not happen. Initial+3 retries maximum absent explicit one-launch user action. Retry technical transport/process/inactivity/invalid output failures only; unsupported provider, storage errors, malformed requests/context and artifact change fail/stop without automatic retry. No retry on coverage incomplete or substantive findings. Abort per-unit session for retry, separate from whole-job stop. Native/controller share classification, state and policy; native internalRetry:false. Planning follows same bounded policy; impact/publication phase types are seams for S3/S4, not implemented engines. Explicitly normalize I/O errors as DesignReviewPersistenceError at save boundary; keep domain/schema/size/history DesignReviewError codes through coordinator commit(), rather than its existing unconditional persistence_failed wrapping. Both categories stop execution; missing checkpoint returns missing_checkpoint before admission.

**Call sites:**
- `src/workflow/review/design-review/coordinator.ts`
- `src/shared/review-activity.ts`
- `src/shared/review-diagnostics.ts`

### 3.6 `DesignReviewSubject` — invariant-change

Consume sc1 unchanged. During active work use parent-directory fs.watch hints filtered to canonical JSON/document filenames, plus non-overlapping1-second fallback checks. Recheck at admission/recovery, before/after each unit and just before checkpoint report commit. Re-arm watches after rename; monitor only these two subject paths, not upstream docs/code. On observed changed/unreadable/noncanonical subject latch artifact_changed, abort unit and whole-job, immediately queue durable invalidation, reject late generations and never clear on byte restoration. Same-attempt recovery uses admitted workflow context (external reference changes ignored); restart_full runs fresh workflow-aware subject preparation for Epic/Standalone/Issue. Polling/progress never renews activity. Monitoring is observation-based; direct writes bypassing the artifact store cannot provide atomic filesystem compare-and-publish; S4 owns normal store serialization and approval identity checks.

**Call sites:**
- `src/workflow/review/design-review/subject.ts`
- `src/workflow/review/design-review/coordinator.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Keep S1 subject/workflow matrix, policy, chunk schemas and reviewer derivation. Only extend trusted assignment metadata/recovery phases; do not redesign review semantics. |
| `sc2` | consumes | Use current bounded atomic checkpoint/progress and accepted reports; add optional recovery records and enforce monotonic immutability. No new storage format/file. |
| `sc3` | implements | Own explicit recovery actions/state, sticky subject invalidation, per-unit technical retry budget, durable pause and user-decision resumes. S3 impact and S4 artifact publication implement their own phase work later. |

## 6. Error paths

**Error cases**

- **Reviewed canonical JSON or document changes, disappears or becomes noncanonical** (recoverable)
  - Detection: Subject-only watch hints plus one-second nonoverlapping checks and admission/unit/final-commit fingerprint checks detect mismatch or read failure.
  - Response: Latch artifact_changed before cancelling execution; queue durable invalidated state, reject late output even if bytes restored, require user-approved restart_full with fresh baseline/plan and no reused chunks.
  - User impact: Controller notifies user and waits; completed feedback remains visible as historical invalidated evidence.
- **Native technical process/transport/inactivity/output failure or explicit controller technical failure** (recoverable)
  - Detection: Typed provider error/ReviewOutputFailureError, unit monitor, semantic plan/result validator or trusted generation-bound failure exchange; host classification excludes findings and incomplete coverage.
  - Response: Persist bounded pointed diagnostic and next dispatch reservation, retire failed unit generation, then retry only that unit up to three times after initial dispatch. On exhausted budget persist paused and stop all subsequent units.
  - User impact: Visible retry count and failed-unit reason; completed chunks are preserved.
- **Reviewing controller disconnect or daemon restart** (recoverable)
  - Detection: Trusted connection abort; alternatively stored pending/running checkpoint has no corresponding live job.
  - Response: Persist/project interrupted, preserve accepted chunks and reserved dispatch counters. No startup or observation dispatch. Explicit resume validates unchanged subject and binds new actual owner only after old execution ended.
  - User impact: Controller can retrigger unfinished work without repeating completed chunks.
- **Invalid recovery action or stale/foreign response** (recoverable)
  - Detection: Strict schema, canonical checkpoint identity, source attempt/status, trusted owner, action signature, execution generation and sequence checks.
  - Response: Reject without provider invocation, budget consumption or healthy-owner closure; exact action/response replay returns prior durable acknowledgement.
  - User impact: Action must match current recovery state; foreign sessions cannot replace review work.
- **Checkpoint save/reservation failure or corrupt/oversized checkpoint** (recoverable)
  - Detection: Existing bounded no-follow schema/identity validation and atomic write errors; monotonically checked counters/history.
  - Response: Fail closed, abort live work and refuse any advance/retry; retain last accepted snapshot and expose persistence_failed/uncertain state. Do not spend model calls trying to repair storage. Normalize filesystem errors at save boundary; preserve domain codes through coordinator commit().
  - User impact: Evidence stays recoverable; operator must resolve storage failure before explicit recovery.
- **Resume after budget exhaustion lacks explicit user decision** (recoverable)
  - Detection: Persisted paused reason and no matching retry_failed_unit decision on recovery action.
  - Response: Return user_decision_required, keep paused. An approved unique action grants one additional dispatch only; preserve exhausted automatic budget and all prior decisions.
  - User impact: No repeated cost or remaining-chunk work without user direction.
- **Subject changes while final checkpoint report is being prepared** (recoverable)
  - Detection: Sticky monitor signal and final freshness comparison inside the serialized checkpoint commit boundary.
  - Response: Suppress a valid report and persist invalidated instead. S2 does not perform artifact lifecycle publication; S4 owns store-write serialization and approval-time revision comparison.
  - User impact: No S2 checkpoint report can be represented as lifecycle-approved review coverage.
- **Named review checkpoint does not exist** (recoverable)
  - Detection: loadDesignCheckpoint returns undefined for canonical reviewId.
  - Response: Return DesignReviewError code missing_checkpoint before action reservation/provider invocation.
  - User impact: Correct identity or start a new review; no invented recovery state.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Completed HIGH/MED findings or honest incomplete coverage | Accept completed chunk and continue remaining plan; do not call these technical failures or retry semantic judgment. |
| Crash after dispatch reservation but before observable model start/result | Keep reservation consumed conservatively; explicit resume uses new generation and remaining budget. After exhaustion require a recorded one-launch decision. |
| All chunks already accepted but process died before checkpoint report save | Explicit resume only re-consolidates and saves the report; zero provider calls. |
| Referenced HLD/DEF/ISSUE/source changes, subject itself unchanged | Ignore for invalidation and same-attempt recovery; retain admitted workflow references. Fresh restart re-prepares context under Epic/Standalone/Issue rules. |
| Long-running active tool outlasts 30 minutes | No fixed task deadline. Coordinator keeps active tool identity/elapsed state separately and defers inactivity expiry while a verified tool remains in flight; after completion the ordinary 30-minute model-wait grace applies. Implement a design-local timer policy around the existing activity monitor rather than changing code-review behavior. Polls/heartbeats/process presence never renew grace; process exit/tool failure remains actionable. |
| Duplicate resume/restart request after lost acknowledgement | Same actionId/body returns recorded resulting attempt/status and never dispatches again; changed body conflicts. |
| S1 checkpoint has no S2 fields | Load additively. An interrupted saved current execution counts as one already-reserved dispatch; do not automatically recover old failed or completed terminal attempts. |
| Controller submits a semantically invalid but structurally valid review result | Treat as technical invalid-output unit failure under the same budget as native. Rotate executionId; old correction responses become stale. Schema-invalid/foreign/sequence-invalid envelopes are request errors. |
| Two sessions recover same review; independent subjects recover concurrently | Single active subject/action admission yields one execution; trusted owner cannot be stolen. Different subject jobs retain independent sequential loops. |
| 128 attempts/actions or64MiB checkpoint reached | Explicit limit error with intact history, no silent pruning or partial approval; no provider dispatch. |

**Invariants to preserve**

- Consume S1 contracts and preserve accepted baseline/inventory/plan/chunk feedback; prior attempts freeze fully when a new attempt is appended. [[c1]]
- Normal native/controller policy and workflow-aware subject derivation remain identical; retired review APIs stay unavailable, no code-review engine migration. [[c1]]
- All cloud calls remain CliProvider-based and serial within each review; no fixed deadline, native internalRetry:false, coordinator is the sole retry owner. [[c2]]

## 7. Test strategy

**Test framework:** `Node node:test + node:assert/strict in tracked *.test.ts files run with Node22 and tsx; direct source inspection supplements broad/incomplete analyzer test lookup. No hosted calls or real 30-minute sleeps in deterministic tests.`

**Test levels**

- **unit** — Prove sc3 state/retry/action rules and S1 preservation using existing fixtures and injected clock/save/provider dependencies.
  - Subjects: `Resume unchanged interrupted native/controller reviews without repeating accepted chunks or planning; report-only recovery makes zero model calls.`, `Automatic technical retry budget is initial plus three, scoped to one failed planning/chunk unit; diagnostics propagate and semantic findings/incomplete results never retry.`, `Crash-safe reservation and exact recovery replay preserve counters; exhausted recovery needs one-launch user direction and cannot reset automatic budget.`, `Subject monitor invalidates during a stalled model/tool and after rename; restored bytes cannot revive a latched attempt; late output and final-report races are fenced.`, `External-reference/source edits are ignored; Epic/Standalone/Issue recovery preserves admitted context and full restart resolves current proper prerequisites.`, `Activity policy has no fixed deadline, ignores polling/heartbeats/liveness, tolerates separately tracked long-running tools and expires true idle waits at30minutes.`, `Bounded checkpoint schema and immutability reject foreign/corrupt/oversized state, decreasing counters, missing action decisions and changed prior attempts.`, `Completed-unit retry summaries survive later successful units/full restart; one-launch action outcomes fill once and remain immutable.`
  - Fixtures: `Existing design-review fixtureRepo and fake sequential providers`, `Fault injection at reserve/dispatch/result/report saves`, `Virtual monotonic clock and activity/tool events`, `Subject file mutations/renames and independent external files`
- **contract** — Validate strict additive request/checkpoint/progress schemas and native/controller technical-failure parity.
  - Subjects: `recover/failure phase shapes, valid actionId replay and invalid enum/decision/identity/attempt/size inputs`, `S1 checkpoint compatibility; new optional sc3 state and bounded metadata-only progress`, `Identical accepted outputs and retry/pause transitions across both reviewer parties`, `recover wire discriminator and operation are independent; native recover routes before exchange owner guard, controller recovery requires trusted identity; direct save/commit preserve domain-vs-I/O errors and missing_checkpoint.`
  - Fixtures: `Saved S1-style checkpoint and new multi-attempt snapshots`, `Equivalent native/controller execution scripts`
- **integration** — Exercise the actual MCP/IPC main-owner routes and restart recovery without real models.
  - Subjects: `Normal stdio MCP/Unix IPC recover/failure routes remain main-owned; native request disconnect survives, controller disconnect requires explicit trusted rebind.`, `Interrupted job reconstruction with preserved completed chunks and final report retrieval`, `Two-session recovery conflicts, request-independent native execution and stale owner refusal`
  - Fixtures: `Existing real stdio MCP and Unix IPC harness`, `Fake CLI subprocess, disposable project/home/socket and fresh coordinator after simulated daemon loss`
- **smoke** — Qualify compiled normal entrypoint without repeatedly spending hosted tokens.
  - Subjects: `Compiled fake-CLI interrupted review recovery, technical retries/exhaustion/user action, subject invalidation and zero duplicate accepted-chunk calls`
  - Fixtures: `Extend scripts/smoke-design-review.mjs isolated compiled harness; record fake versus hosted explicitly`, `Production build and captured JSON/TAP evidence under /tmp`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Resume unchanged interrupted native/controller reviews without repeating accepted chunks or planning; report-only recovery makes zero model calls.`, `Crash-safe reservation and exact recovery replay preserve counters; exhausted recovery needs one-launch user direction and cannot reset automatic budget.`, `Normal stdio MCP/Unix IPC recover/failure routes remain main-owned; native request disconnect survives, controller disconnect requires explicit trusted rebind.`, `Integration reconstruction and result/report-save crash matrix` |
| `ac2` | `Automatic technical retry budget is initial plus three, scoped to one failed planning/chunk unit; diagnostics propagate and semantic findings/incomplete results never retry.`, `Crash-safe reservation and exact recovery replay preserve counters; exhausted recovery needs one-launch user direction and cannot reset automatic budget.`, `Controller failure exchange follows same four-dispatch cap and pointed native schema-failure diagnostics` |
| `ac3` | `Subject monitor invalidates during a stalled model/tool and after rename; restored bytes cannot revive a latched attempt; late output and final-report races are fenced.`, `Explicit restart_full requires decision, appends fresh attempt, and retains old attempt byte-for-byte` |
| `ac4` | `External-reference/source edits are ignored; Epic/Standalone/Issue recovery preserves admitted context and full restart resolves current proper prerequisites.` |
| `ac5` | `Activity policy has no fixed deadline, ignores polling/heartbeats/liveness, tolerates separately tracked long-running tools and expires true idle waits at30minutes.`, `Virtual active tool lasts beyond30minutes without model-wait grace renewal; on completion ordinary grace applies; native and controller match` |
| `ac6` | `Crash-safe reservation and exact recovery replay preserve counters; exhausted recovery needs one-launch user direction and cannot reset automatic budget.`, `Repeated observation/start/resume without approved exhaustion decision starts no provider/chunk; one approved action authorizes one dispatch only` |

## 8. Alternatives considered

### 8.1 a1: Extend the existing attempt with a bounded recovery record — **CHOSEN**

One coordinator and checkpoint; explicit recovery actions, durable unit counters and a subject-only monitor.

Consume S1 subject/plan/result/checkpoint APIs. Add sc3 recovery state/actions plus one current-unit execution record, bounded technical diagnostics and append-only user decisions within each attempt. Keep one active owner per subject; resume skips accepted chunks, restart appends a fresh attempt, coordinator owns all retries. Reuse ReviewActivityMonitor and existing native/controller execution paths; monitor only canonical subject JSON and document.

### 8.2 a2: Nested durable execution ledger per unit

Store a complete execution row for each planning/chunk invocation inside the same checkpoint.

Keep sc1/sc2 and coordinator ownership, but make each unit own an append-only array of invocation records, outcomes and decisions. Derive retry and recovery state by folding those records; retain S1 completed chunk results as authority. No new store or shared-engine migration.

**Rejected because:** Capable but additional records/folding duplicate state and increase validation surface with no required capability gain.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/HLD.md`
- **[[c2]]** `code` `src/shared/review-activity.ts`
- **[[c3]]** `code` `src/workflow/review/design-review/coordinator.ts`
- **[[c4]]** `code` `src/workflow/review/design-review/checkpoint.ts`
- **[[c5]]** `step-output` `s4`
- **[[c6]]** `step-output` `s5`
- **[[c7]]** `step-output` `s6`
- **[[c8]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/DEF.md`
- **[[c9]]** `code` `src/workflow/review/design-review/subject.ts`
