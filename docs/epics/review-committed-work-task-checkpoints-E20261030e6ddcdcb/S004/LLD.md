<!-- insrc:artifact LLD-e6ddcdcb3d9cf330-s4 -->

# LLD: STORY-e6ddcdcb3d9cf330-s4

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**HLD base run:** `wf-1793386460254-8th2oq`
**HLD effective hash:** `9644e9acbe91...`

Expose truthful progress throughout long background code reviews: current task, phase, elapsed time and last meaningful activity. Reuse native activity observations, persist only bounded sanitized metadata, and format updates without additional model calls.

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

> See **HLD-e6ddcdcb3d9cf330** § 2. Framework summary

**Rollout phase:** <not in any phase>

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Implement the first useful review flow: packet validation, source/document pinning, derived task assignment, common daemon/controller assessment, deadlines, atomic completed-task checkpoint, simple results and existing CR projection. Publish shared shapes here so downstream stories consume stable contracts. Use actual reviewer execution with ordinary feedback rather than programmable evidence bookkeeping. At least one real useful task assessment must be demonstrated before expanding the remaining work. Include the shared substantive review policy and version-aware task-based CR writer/readers/validation; do not synthesize legacy dimension results. Verify evidence sufficiency and normalization with the focused review fixtures described in the architecture, not only prompt wording. — owns `sc1`, `sc2`, `sc3`
- `s2`: Own interrupted-attempt continuation and history-aware re-review policy. Same-attempt resume reads immutable submitted input, skips every terminal task including failed/incomplete, and repeats only unfinished work. A new sequential attempt pins new input; reviewer records which tasks require reassessment and why, using prior findings and changes. Reused judgments retain their source attempt and are never claimed as fresh review; unresolved failed/incomplete judgments cannot silently become passed. A changed packet on resume is an explicit conflict. Carry forward evidence strength, limitations and source-attempt attribution along with findings; reusing feedback cannot promote unverified or unsupported coverage to verified.
- `s3`: Own normal entrypoint/session integration and concurrency/approval cleanup verification. Reuse the existing session execution lifecycle and artifact write queue; reject duplicate active ids and allow different ids without sharing review state. Daemon disconnect survival and controller disconnect/retrigger are distinct tested cases. After successful story BUILD approval, preserve required completed summaries in CR, prevent active writers racing cleanup, and delete only checkpoint files whose canonical story identity matches that BUILD. Task-level validation or failed approval must not delete files. Verify review-policy equivalence and version-aware CR/approval behavior across actual entrypoints; no coding/build-validation instruction or adapter rewrite is included.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TaskReviewCoordinator`

```typescript
progress(project: string, reviewId: string, attempt: number): Promise<ReviewProgressView>
```

**Parameters:**
- `project: string` — Canonical registered project
- `reviewId: string` — Validated existing review identity
- `attempt: number` — Existing positive attempt identity

**Returns:** `ReviewProgressView` — Read-only sanitized snapshot, authoritative status/publication and live/stale/unknown freshness; polling never starts or resumes execution.

**Errors:**
- `TaskReviewInputError` when Invalid identity, missing attempt or project mismatch

**Preconditions:**
- Use existing checkpointPath identity validation and project boundary checks; no arbitrary client paths.

**Postconditions:**
- No provider invocation, timeout renewal or mutation on polling.
- Proposed additive codeReview.task.progress RPC delegates to this method; existing retired endpoints remain unavailable.

## 3. Data model changes

### 3.1 `ReviewAttempt.progress` — field-add

Optional mutable snapshot owned by containing attempt, cardinality 0..1. schemaVersion=1; executionId (host generated); sequence monotonic within execution; phase enum scope_preparation|task_review|tool_running|test_execution|feedback_persistence|cr_publication|complete|interrupted|error. task nullable with id/name/one-based position/total, completedTasks; elapsed observed review/task milliseconds; observedAt ISO host time; lastMeaningfulActivityAt nullable; processState alive|exited|unknown; lastProcessObservedAt nullable; activeToolCount bounded. Task names max256, enums only, no model text, commands, file content or tool IDs. Native tool events are generic tool_running unless existing trusted metadata identifies tests; never infer test execution from tool ID. Last activity excludes heartbeat/session creation/polls. No per-event history, new recovery file, result or submitted-packet mutation. Missing legacy field means unknown. Persisted elapsed freezes while stale; fresh live reads may derive elapsed from monotonic execution clock.

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`

### 3.2 `ReviewProgressView` — new

Projection from selected checkpoint attempt plus active coordinator identity. status and crPublication are authoritative result metadata; freshness live only when current process owns matching execution generation, otherwise stale or unknown. Contains bounded progress, observedAt and optional sanitized persistence warning. A stale checkpoint never proves a live native process. Reconnect to daemon review reads same attempt without resume; controller loss remains interruption requiring explicit retrigger. Formatter tracks last emitted generation/sequence/phase and monotonic emission time; phase/task/terminal changes immediate, otherwise every45 seconds while polling at5-second cadence. Terminal result/error supersedes provisional progress; never percentage estimates. Example: Reviewing task 2/4 — tools running; 1 completed; task elapsed 8m; last activity 12s ago. Unknown: last activity unavailable. Stale: last observation 3m ago, current process activity unknown.

**Call sites:**
- `src/daemon/task-review-rpc.ts`
- `src/workflow/code-review/task-review/controller.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S004/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Progress persistence fails** (recoverable)
  - Detection: Existing atomic writer rejects
  - Response: Retain last durable snapshot, mark in-memory warning, coalesce next observation; no tight retry loop. Never overwrite newer task results with a captured stale checkpoint. Provisional progress is best effort; feedback/task-result persistence keeps existing fail-stop semantics.
  - User impact: Last saved progress explicitly stale; review outcome durability unchanged.
- **Old execution emits late events** (recoverable)
  - Detection: Review/attempt/task/execution generation or event sequence mismatches active owner
  - Response: Ignore stale event and queued progress flush; new execution takes over only through existing explicit resume.
  - User impact: No cross-task/session progress leakage.
- **Malformed progress read** (recoverable)
  - Detection: Bounded schema and canonical path/project checks reject malformed identities/metadata
  - Response: Explicit invalid-request or progress-unavailable response; never trigger review or bypass checkpoint validation.
  - User impact: Actionable read error; results retained.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Existing checkpoint without progress | Optional field absent accepted; infer only authoritative task count/status, timestamps unknown. |
| High-rate model stream | Latest-only in-memory projection, no raw event buffer. Coalesce routine writes at most once5sec; phase changes and task/result/publication boundaries flush immediately through same serial writer. Timer unref and stopped on retire; queued writes validate generation and use current checkpoint, never stale clone. |
| Long-running native tool without output | Show tool_running plus elapsed and last meaningful activity separately. No synthetic heartbeat renewal or inferred test phase. |
| Daemon restart or controller disconnect | Persisted snapshot stale, no elapsed accumulation claimed as active. Existing daemon survival/controller explicit-retrigger policy unchanged. |
| Task result accepted while routine progress flush pending | Same serial queue; terminal result writes current latest metadata, supersedes routine flush and cancels timers before cleanup/publication. Progress never changes completed task values. |
| User update throttling | Phase/task/terminal changes immediate; 45sec concise updates on5sec polls. No progress percentages; count means durable completed task results only. |

**Invariants to preserve**

- One task at a time; immutable attempt input and complete task feedback remain authoritative. Progress is optional metadata, not partial feedback or recovery instructions. [[c1]]
- No fixed deadline or heartbeat-based lease renewal; approved30min inactivity and native tool tracking remain unchanged. [[c1]]
- Retired review entrypoints still throw PENDING REVIEW RE-IMPLEMENTATION; new progress read never invokes providers. [[c1]]

## 6. Test strategy

**Test framework:** `Existing task-review TypeScript tests use node:test and node:assert/strict with tsx and fake clocks; graph test lookup was off-topic, current source fixtures verified directly. No full suite or hosted-model call required for deterministic contract proof.`

**Test levels**

- **unit** — Prove event sanitization, deterministic phase/freshness projection and bounded formatter/write cadence
  - Subjects: `Progress reducer`, `Progress formatter`, `Optional checkpoint schema`
  - Fixtures: `Fake monotonic/wall clocks`, `Synthetic Claude/Codex normalized events including heartbeat/unknown events`, `Legacy checkpoint without progress`
- **integration** — Prove actual serial atomic writes and production IPC reads cannot corrupt outcomes or cross review identities
  - Subjects: `TaskReviewCoordinator`, `ControllerTaskReview`, `Read-only progress RPC`
  - Fixtures: `Existing task-review realGit/fakeprovider fixtures`, `Injected atomic write failure`, `Old execution callbacks and concurrent independent review IDs`
- **smoke** — Verify production native event adapter to progress read to deterministic user update without hosted model calls
  - Subjects: `Both native adapter fixtures through task-review IPC`, `Reconnect and terminal publication`
  - Fixtures: `Existing fake CLI subprocess protocol fixtures`, `Counter asserts zero extra provider calls for polling`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Shows phase/task/count/elapsed and last activity across scope,task,tools,persist,publish transitions; only explicit trusted test observations label test execution` |
| `ac2` | `10k events coalesce bounded sanitized writes; no prompts/tool output/commands persist; submitted packet and completed results deep-equal before/after` |
| `ac3` | `Heartbeats/liveness and elapsed do not advance meaningful activity or renew grace; unknown metadata stays unknown` |
| `ac4` | `Both CLI fixtures normalize same snapshot; late generation and wrong attempt cannot update; daemon reconnect reads without resume; restart snapshot stale; controller disconnect remains interrupted` |
| `ac5` | `5sec polling produces immediate changed phase/task/error/terminal and45sec ongoing updates, dedupes identical events, zero extra LLM calls` |

## 7. Migration

**State before:** c1 discovery: task-boundary checkpoint and active monitor exist, but no persisted incremental sanitized progress. Legacy review engines are removed.

**State after:** Optional per-attempt progress metadata and read-only progress projection support deterministic controller updates while completed feedback remains authoritative.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add bounded optional progress schema and reducer with legacy-absent unknown behavior; do not rewrite existing checkpoints. — ↩ rollbackable
2. Connect daemon/controller native activity projections to existing serialized atomic checkpoint writer; coalesce routine updates and flush boundaries; preserve explicit recovery/disconnect policy. — ↩ rollbackable
3. Add read-only progress RPC and deterministic formatter/guidance for5sec polling and45sec user updates; leave normal MCP routing migration toS3. — ↩ rollbackable
4. Verify both native fixtures, reconnect/failure/generation races and no extra model calls. Deploy through normal daemon update after code approval; no automatic resume of pre-update active reviews. — ↩ rollbackable

**Backward compat:** Optional metadata addition only for current task-review checkpoints; absence means unknown and no bulk backfill. Retired engines/flags/fallbacks remain deleted and unavailable. This is not legacy engine compatibility. Do not promise old binaries can read newly extended strict checkpoints after downgrade; preserve files and require matching version for recovery.

## 8. Alternatives considered

### 8.1 a1: Optional bounded progress section — **CHOSEN**

One mutable progress snapshot per attempt within existing checkpoint.

Consume normalized activity events into a bounded in-memory projection; coalesce atomic writes through existing per-review serial writer, preserving submitted input/results. Expose sanitized read-only snapshot and deterministic update formatter.

### 8.2 a2: Live-only progress response

Keep progress solely in coordinator memory and return it through IPC.

Project normalized events into active registry memory and attach to read-only progress response without persisting per-event metadata.

**Rejected because:** Fails ac4 durable last snapshot after process loss; live progress otherwise sufficient.

## 9. References

- **[[c1]]** `analyze-bundle` `src/workflow/code-review/task-review/coordinator.ts`
- **[[c2]]** `code` `src/shared/review-activity.ts`
- **[[c3]]** `prior-artifact` `docs/standalone/preserve-useful-review-work-permissive-progress-E2026110199a7f5dc/S001/LLD.md`
- **[[c4]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/DEF.md`
