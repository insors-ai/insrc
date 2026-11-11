<!-- insrc:artifact LLD-206db3426ffd4428-s2 -->

# LLD: STORY-206db3426ffd4428-s2 — Preserve live progress for workflows and analysis

## Summary

**Epic:** `show-long-running-task-progress-chat`
**HLD base run:** `wf-1794211533808-ghbhlu`
**HLD effective hash:** `48a6a5468b45...`
**Tracker:** [insors-ai/insrc#154](https://github.com/insors-ai/insrc/issues/154)

Workflow and analysis executors feed structured measurements to the daemon coordinator through run-owned delegates. Existing streams, detached workflow polls, and analysis results keep their current contracts. Progress reports a stage even when the producer cannot measure output.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. HLD context

> See **HLD-206db3426ffd4428** § 2. Framework summary

**Rollout phase:** Phase B — executor measurement adapters
**Owns:** `sc4` (Workflow and analysis measurements)
**Consumes:** `sc1` (Task identity and delegate observation), `sc2` (Scoped snapshots, subscriptions and observation control), `sc3` (Execution-owned activity and chat retention)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own daemon coordination, verified registration, cursors, normalization, scoped read/subscribe/control, durable state, owner fencing and fallback schedule arbitration. Keep storage, fencing and expiry implementation private. — owns `sc1`, `sc2`, `sc3`
- `s3`: Own DesignReviewDelegate and CodeReviewDelegate and mappings from checkpoint progress and execution ownership. Review results, admission, retries and publication remain under the existing engines. — owns `sc5`
- `s4`: Own TestDelegate and managed reporter interpretation, including suite/case identity, provisional counts and abnormal exit. Keep test orchestration and exit semantics unchanged. — owns `sc6`
- `s5`: Own typed VS Code reader and transcript row, current status projection and bindings to the session owner. Render durable snapshots by origin across turns and multiple windows without executing or polling models.
- `s6`: Own MCP adapter, capability qualification, explicit opt-in disclosure and connection to the coordinator's fallback lease. No vendor-specific process changes or assumptions about session identity.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TaskProgressDelegate`

```typescript
interface TaskProgressDelegate<D> { progress(task: TaskRef, signal?: AbortSignal): Promise<DelegateMeasurement<D> | null> }
```

**Parameters:**
- `task: TaskRef` — Fence lookup to the admitted attempt.
- `signal: AbortSignal` _(optional)_ — Stop the observation read.

**Returns:** `Promise<DelegateMeasurement<D> | null>` — Latest sanitized snapshot or null when no observation exists.

**Preconditions:**
- Task was admitted through the trusted S1 producer port.

**Postconditions:**
- The read is bounded and does not perform producer work.

## 3. Data model changes

### 3.1 `WorkflowDetails` — new

One optional current snapshot per owned workflow attempt, pointing from the S1 task to an executor-local measurement. stageId comes from the internal phase allowlist, with a validated step or runner identifier as activeUnit. stagePosition is null because the legacy index counts events, including retries, and is not completion. production is a run-cumulative count of actual provider deltas with unit output-chunks and null total. Existing tokensTotal counts callbacks, so label tokens only when a provider explicitly supplies a verified token count. Track detached deltas without adding frames to the legacy poll.

**Call sites:**
- `src/daemon/workflow-rpc.ts`
- `src/daemon/workflow-run-registry.ts`

### 3.2 `AnalysisDetails` — new

One optional current snapshot per owned analyze attempt. Use allowlisted typed stage and task transition data, and report unknown stagePosition unless a same-plan completed count is available. Production is null on the current analysis preview route. No preview text, labels, prompts, tool messages or arbitrary payload fields cross into progress.

**Call sites:**
- `src/daemon/analyze-rpc.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/show-long-running-task-progress-chat-E20261109206db342/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Once per actual run use the trusted producer port and launch authorization, a daemon-created execution key and the admitted fence. Use main daemon as sole owner of the S1 runtime. Session workers send bounded typed measurements and lifecycle through a private hub relay keyed to the actual worker channel and run. The coordinator-side delegate reads an in-memory mirror. Never accept an origin, owner epoch or opaque handle from public params. In-process route uses the same port without a hub hop. |
| `sc2` | consumes | Register workflow and analysis projectors and matching closed validators in the runtime. Keep public stream, poll and status payloads unchanged. Start observation independently of legacy delivery. Observation admission, writer failures and slow consumers never block the legacy terminal path. Owner-side result settlement is the terminal evidence. Supply a safe result handle only where an existing authorized result lookup exists. |
| `sc3` | consumes | Check live execution via the real run owner and its worker channel even when the producer is quiet. Use server-verified origin bindings only. Loss of observer does not renew or end ownership. End the observed attempt exactly once at owner settlement or classify verified owner loss as interrupted, preserving the S1 lease policy. |
| `sc4` | implements | Separate workflow/analysis detail discriminants use the same stage, optional measured position and optional declared-unit production fields. The daemon observes workflow.run and detached workflow.run.start, and analyze.run.start. Controller step calls and nested grounding are not independently registered as complete daemon-owned runs. |

## 6. Error paths

**Error cases**

- **Progress admission or persistence fails.** (recoverable)
  - Detection: Producer port rejects or throws, relay closes, or reservation is refused.
  - Response: Disable or degrade that run's progress observation; isolate the rejection from execution and preserve the existing result path. Retry only an exact terminal write under the same fence as S1 permits.
  - User impact: Legacy operation continues. No fabricated successful progress is published.
- **Worker owner exits or a stale worker sends an update.** (recoverable)
  - Detection: Worker channel closure or mismatch with the bound worker, run, attempt or strictly ordered sequence.
  - Response: Reject stale frames. Use verified worker loss for interruption when no prior terminal evidence exists; keep a previously persisted terminal state.
  - User impact: An interrupted owner is distinguishable from a quiet stage.
- **Untrusted or missing origin.** (terminal)
  - Detection: Trusted project resolution or S1 origin binding validation fails.
  - Response: Do not mint a conversation grant. Never infer a chat from a client-supplied ID, run ID, socket or session label. Continue legacy execution.
  - User impact: Run remains usable via its existing path.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Quiet stage or provider without count evidence. | Keep stage stable; production is null until evidence exists. Verified owner liveness is separate from meaningful progress. |
| Cancellation request races with successful settlement. | Pending cancellation is not terminal. Workflow detached uses its existing final status; analysis uses the typed aborted result; a verified successful completion remains successful. |
| Legacy streaming client disconnects or detached poll stops. | Preserve existing stream-abort semantics and detached-run lifetime. Only owner evidence determines progress terminal state. |
| An analysis preview token or a workflow retry carries arbitrary text. | Legacy handling stays byte-compatible. No text is copied into the new measurement. |
| Legacy execution settles before asynchronous progress admission completes. | Hold one terminal slot per local owner; if admission completes, submit terminal evidence without replaying late active updates; release state after bounded settlement. |

**Invariants to preserve**

- Preserve workflow driver, streaming and detached workflow results, progress frames and abort authority. [[c1]]
- Preserve analysis stage filtering and the separate analyze.result/done terminal pair. [[c1]]

## 7. Test strategy

**Test framework:** `Node.js node:test through tsx`

**Test levels**

- **unit** — Verify typed mapping, privacy and monotonic event behavior.
  - Subjects: `Workflow phases, retries and known versus absent production units`, `Analysis stages, tasks and ignored previews`, `Owner settlement and quiet liveness`
  - Fixtures: `Chunk-only streaming provider and non-streaming provider fixtures`, `Analysis events carrying sentinel secrets`
- **integration** — Exercise routed and in-process execution with real S1 coordinator and a verified test origin.
  - Subjects: `workflow.run`, `workflow.run.start/poll/abort`, `analyze.run.start/status`, `Worker exit, rebinding and terminal write failure`
  - Fixtures: `Fake provider with controlled stage transitions`, `Real worker channel and temporary progress store`
- **contract** — Confirm legacy compatibility independent of observation state.
  - Subjects: `Exact frame sequences and payloads`, `Cancellation and detached lifetime`, `Denial for wrong project or origin and stale worker`, `No extra provider invocations, bounded relay and final cleanup`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Both real daemon entry paths expose normalized stage updates via S1, even during quiet stages and concurrent runs.`, `Workflow chunks keep their actual unit and analysis previews leave production unknown.`, `Worker relay rejects wrong owner and old sequence.` |
| `ac2` | `Legacy clients receive identical workflow stream, detached poll and analysis terminal frames with progress disabled, active, refused and failing.`, `Existing abort and socket disconnect paths keep their outcomes, detached workflow survives observer loss, and settled runs stop owner updates.`, `Terminal snapshot persists exactly once before S1 observer delivery without delaying legacy result.` |

## 8. Migration

**State before:** The S2 context bundle locates separate legacy workflow stage/delta, detached poll, and analysis stage/result routes. S1 has a daemon-owned progress runtime but has no workflow or analysis projector.

**State after:** New verified workflow and analysis executions can produce typed progress through the existing coordinator without altering any legacy operation contract.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the two closed detail validators and initialize the two producer ports on the existing runtime. — ↩ rollbackable
2. Attach owner delegates at the existing workflow and analysis launch sites, with the private main-thread relay for routed execution. — ↩ rollbackable
3. Qualify real routing and compatibility with registered test origins before delivery stories consume the contract. — ↩ rollbackable

**Backward compat:** Existing RPC request and result fields, stream order, detached poll cursor, abort and restart behavior remain compatible. Existing progress records require no rewrite.

## 9. Alternatives considered

### 9.1 a1: Executor-owned delegates over existing callbacks — **CHOSEN**

Map producer events at each supported run owner.

Use one workflow and one analysis delegate with run-local state fed by typed producer callbacks and settled by the executor that owns the result. The S1 coordinator remains the only progress authority.

### 9.2 a2: Shared internal producer event envelope

Normalize run events into a single internal envelope before delegation.

Introduce a typed daemon-private event envelope for workflow and analysis producers, preserving the existing adapters for legacy output and using the same coordinator producer port.

**Rejected because:** Can meet the same contracts but requires a parallel internal envelope.

## 10. References

- **[[c1]]** `analyze-bundle` `s1` — "Workflow has streaming and detached owners. Analysis maps stage transitions independently of its terminal result."
- **[[c2]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/HLD.md`
- **[[c3]]** `code` `src/daemon/workflow-rpc.ts`
- **[[c4]]** `code` `src/daemon/workflow-run-registry.ts`
- **[[c5]]** `code` `src/daemon/analyze-rpc.ts`
- **[[c6]]** `code` `src/daemon/task-progress/coordinator.ts`
- **[[c7]]** `code` `src/daemon/task-progress/access.ts`
- **[[c8]]** `code` `src/daemon/index.ts`
- **[[c9]]** `code` `src/shared/task-progress.ts`
- **[[c10]]** `code` `src/daemon/threads/method-class.ts`
- **[[c11]]** `code` `src/daemon/__tests__/workflow-progress-map.test.ts`
- **[[c12]]** `code` `src/daemon/__tests__/analyze-progress.test.ts`

## Citations

- **[[c1]]** `analyze-bundle` `s1` — "Workflow has streaming and detached owners. Analysis maps stage transitions independently of its terminal result."
- **[[c2]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/HLD.md`
- **[[c3]]** `code` `src/daemon/workflow-rpc.ts`
- **[[c4]]** `code` `src/daemon/workflow-run-registry.ts`
- **[[c5]]** `code` `src/daemon/analyze-rpc.ts`
- **[[c6]]** `code` `src/daemon/task-progress/coordinator.ts`
- **[[c7]]** `code` `src/daemon/task-progress/access.ts`
- **[[c8]]** `code` `src/daemon/index.ts`
- **[[c9]]** `code` `src/shared/task-progress.ts`
- **[[c10]]** `code` `src/daemon/threads/method-class.ts`
- **[[c11]]** `code` `src/daemon/__tests__/workflow-progress-map.test.ts`
- **[[c12]]** `code` `src/daemon/__tests__/analyze-progress.test.ts`
