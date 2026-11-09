<!-- insrc:artifact HLD-206db3426ffd4428 -->

# HLD: show-long-running-task-progress-chat

## Summary

**Tracker:** [insors-ai/insrc#146](https://github.com/insors-ai/insrc/issues/146)

Executor delegates measure progress and the daemon coordinates how it is stored and delivered. VS Code keeps the progress message in its originating chat, and supported native clients receive the same verified state through MCP. Execution owners remain responsible for results, cancellation and activity.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [UX](#10-ux)
11. [References](#11-references)

## 1. Problem context

> See **DEF-206db3426ffd4428** § 1. Problem

## 2. Framework summary

Use executor delegates with a shared daemon coordinator. Preserve legacy workflow and analyze IPC frames and existing execution authority. The coordinator feeds a typed VS Code adapter, request-scoped MCP notifications and one optional fallback observation schedule.

## 3. Architecture shape

The execution owner registers a trusted project, invocation, optional chat binding, task and attempt before detach. Delegates expose progress() without side effects and signal refresh when measurements change. The daemon verifies owner epoch and monotonic source sequence, separates meaningful revision from heartbeat/freshness, persists bounded state, then publishes sanitized snapshots. Project-scoped history supports read or subscribe from an opaque cursor. A lagging observer receives the latest snapshot and explicit resync instead of replaying ticks. A failed delegate refresh preserves last verified details with their original age. Stop-observation never cancels execution. Explicit cancellation is idempotent and pending until the executor confirms termination.

The Unix socket carries authorized typed observations additively beside existing progress/delta traffic. VS Code updates one row per task in its originating chat and shows attempt changes without stale finalization. A read-only details action resolves bounded result/log references in the owning project. The current session owner projects waiting-input before working before done across all live turns, unresolved decisions and owned tasks. Runtime lease renewal is independent of observers, meaningful measurement and repository locks. Closing a view detaches. Removing a conversation releases its retention and leaves authorized project results recoverable.

Native MCP binds notifications to the valid caller token for that request. Use a monotonic delivery count without a total unless the total uses the same unit, and put trustworthy measurements in the sanitized label. Disconnect drops the observer, not the execution. For authorized opt-in fallback, a single fenced observer lease issues an initial snapshot then cadence slots anchored every 60 seconds. Host timers wait when available. Additional observers attach to the same schedule. Overlapping calls are suppressed, missed slots never burst, transport loss or rate limiting is visible, and healthy recovery restores the fixed interval. Unchanged responses still include bounded details and never generate duplicate narration. Third-party background lifetime and user-visible rendering are live-qualified separately.

Producer-specific detail validation is registered by each adapter through the generic foundation contract. Bind fallback to a single renewable, fenced scheduler lease for each task across attempts. On observer transfer retain the cadence anchor and cursor, expire the old lease, and reject old in-flight replies. A runtime status tool reports one concise line or bounded structured delta per scheduled poll. It performs no model invocation and exposes no detailed logs in the polling payload.

Browser captures of the generated ER, sequence, component and VS Code companions are available for review. [[c23]]

## 4. Diagrams

- [ER model](docs/epics/show-long-running-task-progress-chat-E20261109206db342/er-model.html)
- [Sequence diagram](docs/epics/show-long-running-task-progress-chat-E20261109206db342/sequence-diagram.html)
- [Component dependencies](docs/epics/show-long-running-task-progress-chat-E20261109206db342/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Task identity and delegate observation

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** One verified owner binds each task attempt to one project and originating invocation. An insrc chat may own many invocations, and an invocation may launch many tasks. Each task has one current attempt, with at most one active owner epoch. External host, daemon session and extension chat identities are optional distinct bindings, never inferred from one another. Both delivery paths use this delegate snapshot. The foundation is parameterized by producer-owned detail types, so it has no type dependency on later stories.

**Interface sketch (type-level):**

```
interface TaskRef {
  readonly projectId: string;
  readonly invocationId: string;
  readonly taskId: string;
  readonly attempt: number;
}
interface TaskOwnerFence {
  readonly ownerId: string;
  readonly ownerEpoch: string;
  readonly ownerSequence: number;
}
interface TaskOrigin {
  readonly extensionChatId?: string;
  readonly daemonSessionId?: string;
  readonly nativeSessionId?: string;
  readonly turnId?: string;
}
type ProgressKind = 'workflow' | 'analysis' | 'design-review' | 'code-review' | 'test';
interface MeasuredCount {
  readonly unit: string;
  readonly completed: number;
  readonly total: number | null;
}
interface DelegateMeasurement<Details extends { readonly kind: ProgressKind }> {
  readonly task: TaskRef;
  readonly owner: TaskOwnerFence;
  readonly kind: ProgressKind;
  readonly measuredAt: string;
  readonly meaningfulRevision: number;
  readonly lastMeaningfulAt: string | null;
  readonly phase: string;
  readonly activeUnit: string | null;
  readonly counts: readonly MeasuredCount[];
  readonly milestones: readonly string[];
  readonly controls: readonly ('cancel')[];
  readonly details: Details;
}
interface TaskProgressDelegate<Details extends { readonly kind: ProgressKind }> {
  progress(task: TaskRef): Promise<DelegateMeasurement<Details> | null>;
}
```

**Assumptions cited:** [[c3]] [[c4]] [[c5]] [[c7]]

### 5.2 sc2: Scoped snapshots, subscriptions and observation control

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** The daemon authorizes every operation against server-verified caller/project/origin bindings, including logs and controls. A read yields a compact snapshot, meaningful-change indicator and revision cursor. Observer loss, executor state and session retention are independent. The shared coordinator arbitrates one optional fallback schedule per task, independent of all native subscriptions. Owner credentials, internal session identifiers and fencing fields remain server-side. A structured fallback lease governs the scheduler, without granting execution authority.

**Interface sketch (type-level):**

```
type TaskState = 'queued' | 'running' | 'waiting' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'unknown';
type ProgressFreshness = 'live' | 'stale' | 'unavailable';
type DeliveredMeasurement<Details extends { readonly kind: ProgressKind }> = Omit<DelegateMeasurement<Details>, 'owner'>;
interface ProgressSnapshot<Details extends { readonly kind: ProgressKind }> {
  readonly task: TaskRef;
  readonly cursor: string;
  readonly state: TaskState;
  readonly freshness: ProgressFreshness;
  readonly measurement: DeliveredMeasurement<Details> | null;
  readonly lastOwnerActivityAt: string | null;
  readonly workerHealth: 'alive' | 'lost' | 'unknown';
  readonly cancellation: 'none' | 'pending';
  readonly resultRef?: string;
}
interface ObservationReply<Details extends { readonly kind: ProgressKind }> {
  readonly snapshot: ProgressSnapshot<Details>;
  readonly disposition: 'changed' | 'unchanged' | 'resync';
  readonly schedule: 'native' | 'scheduled' | 'suspended' | 'stopped';
  readonly nextPollNotBefore?: string;
}
interface ObservationControl {
  readonly task: TaskRef;
  readonly action: 'stop-observation' | 'cancel-execution';
  readonly requestId: string;
}
```

**Assumptions cited:** [[c3]] [[c6]] [[c7]]

### 5.3 sc3: Execution-owned activity and chat retention

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** One current owned attempt may hold at most one active association for its originating insrc conversation. Each chat may have many associations. The coordinator renews through verified executor activity, and the actual session owner consumes the lease or a runtime renewal. View closure does not release a retained conversation. Removing a conversation releases only its association and retains project-scoped authorized task results.

**Interface sketch (type-level):**

```
interface TaskActivityLease {
  readonly task: TaskRef;
  readonly origin: TaskOrigin;
  readonly fence: TaskOwnerFence;
  readonly renewedAt: string;
  readonly expiresAt: string;
}
interface ChatTaskRetention {
  readonly originatingChatId: string;
  readonly retainedTasks: readonly { task: TaskRef; expiresAt: string }[];
}
```

**Assumptions cited:** [[c3]]

### 5.4 sc4: Workflow and analysis measurements

**Owner Story:** `s2`
**Consumed by:** `s5`, `s6`

**Purpose:** Maps supported existing stage/delta data into task details while preserving the old frame and result channel. Use measured output production only when a producer supports it, retaining its declared unit. No text enters progress. The two delivery stories consume the mapped details.

**Interface sketch (type-level):**

```
interface WorkflowDetails {
  readonly kind: 'workflow';
  readonly stageId: string;
  readonly stagePosition: MeasuredCount | null;
  readonly production: MeasuredCount | null;
}
interface AnalysisDetails {
  readonly kind: 'analysis';
  readonly stageId: string;
  readonly stagePosition: MeasuredCount | null;
  readonly production: MeasuredCount | null;
}
```

**Assumptions cited:** [[c4]] [[c5]]

### 5.5 sc5: Review measurements

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`

**Purpose:** Observe canonical design and task-review progress rather than infer from output. Separate retained review coverage from fresh chunks, initial units from follow-up work, and publication from review assessment. A code-review implementation exposes task counts or other verified units that its executor can actually report.

**Interface sketch (type-level):**

```
interface DesignReviewDetails {
  readonly kind: 'design-review';
  readonly target: string;
  readonly checks: MeasuredCount | null;
  readonly freshChunks: MeasuredCount | null;
  readonly retainedChunks: number | null;
  readonly retries: number | null;
}
interface CodeReviewDetails {
  readonly kind: 'code-review';
  readonly target: string;
  readonly initial: MeasuredCount | null;
  readonly followUp: MeasuredCount | null;
  readonly retries: number | null;
  readonly publication: 'pending' | 'complete' | 'failed' | 'unknown';
}
```

**Assumptions cited:** [[c3]] [[c7]]

### 5.6 sc6: Managed test measurements

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`

**Purpose:** Reports disjoint latest leaf-case outcomes by stable suite/case identity, with retries and discovery counted separately. Suite count and active suite are separate measurements. Process exit, reporter completeness and executor result establish terminal truth. The report reference stays separate from the progress payload.

**Interface sketch (type-level):**

```
interface ManagedTestDetails {
  readonly kind: 'test';
  readonly stage: 'discovery' | 'execution' | 'finalization';
  readonly suites: MeasuredCount | null;
  readonly cases: MeasuredCount | null;
  readonly passed: number | null;
  readonly failed: number | null;
  readonly skipped: number | null;
  readonly cancelled: number | null;
  readonly retries: number | null;
  readonly elapsedMs: number;
  readonly logRef?: string;
}
```

**Assumptions cited:** [[c3]]

## 6. Story boundaries

### 6.1 Story STORY-206db3426ffd4428-s1

**Owns:** `sc1`, `sc2`, `sc3`

Own daemon coordination, verified registration, cursors, normalization, scoped read/subscribe/control, durable state, owner fencing and fallback schedule arbitration. Keep storage, fencing and expiry implementation private.

### 6.2 Story STORY-206db3426ffd4428-s2

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

Own adapters for existing workflow and analyze producer signals and terminal/owner evidence. Existing stream shape and command semantics remain compatible.

### 6.3 Story STORY-206db3426ffd4428-s3

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`

Own DesignReviewDelegate and CodeReviewDelegate and mappings from checkpoint progress and execution ownership. Review results, admission, retries and publication remain under the existing engines.

### 6.4 Story STORY-206db3426ffd4428-s4

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`

Own TestDelegate and managed reporter interpretation, including suite/case identity, provisional counts and abnormal exit. Keep test orchestration and exit semantics unchanged.

### 6.5 Story STORY-206db3426ffd4428-s5

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

Own typed VS Code reader and transcript row, current status projection and bindings to the session owner. Render durable snapshots by origin across turns and multiple windows without executing or polling models.

### 6.6 Story STORY-206db3426ffd4428-s6

**Depends on:** `sc1`, `sc2`, `sc4`, `sc5`, `sc6`

Own MCP adapter, capability qualification, explicit opt-in disclosure and connection to the coordinator's fallback lease. No vendor-specific process changes or assumptions about session identity.

## 7. Non-functional targets

- **Performance:** Proposed caps for qualification are one coalesced active snapshot per second per task, 8 KiB per snapshot, 32 retained meaningful milestones, 16 queued observer updates and a reserved terminal state. Enforce per-project limits of 128 tracked active observations and 1,024 retained terminal observations, plus a global disk budget of 128 MiB. Exceeding observation capacity must report degradation without refusing, cancelling or slowing work. Terminal updates bypass normal coalescing. Reserve the observation terminal slot and bounded storage on admission. Evict only older terminal entries by policy, and refuse new observation with a capacity state when no reservation is possible. Do not evict active owners to admit new observations.
- **Security:** Authenticate observations via existing daemon caller identity and verify project, conversation/invocation and task attempt before returning any snapshot, detail or control. Opaque cursors and task IDs do not grant authorization. Persist and expose sanitized structured measurements only. Detailed logs remain authorized, bounded references. No direct database access in MCP or VS Code.
- **Observability:** Measure emitted and coalesced progress, cursor gaps, scheduler degradation, stale source age, rejected owner fences and retention transitions separately. Qualify each producer end to end, verify zero extra model invocations for native paths, and live-qualify CLI token, rendering, background lifetime and scheduling per version/session. Never log raw prompts, output or credentials as progress.
- **Durability:** Use daemon-owned atomic per-task snapshots on local storage, with bounded milestone records and terminal result pointers. Persist terminal state before delivery. Refresh verified owner activity every 30 seconds with a 120-second lease, qualifying the margin against the actual session owner's idle threshold. After daemon restart recover persisted observations before accepting new owner events. Hold stale owner retention at most through its bounded grace and show interrupted or unknown until authority is reverified. Terminal retention is seven days subject to bounded capacity, after which separately available executor results remain authoritative. For executors without durable result history, expiry is explicit and is never rendered as a success, cancellation or new execution.

## 8. Rollout

**Phase A — daemon observation foundation**

**Stories:** `s1`

Land shared identity, owner fences, storage, authorized subscriptions, activity leases and fallback arbitration first.

**Backward compat:** Keep all existing executor paths and progress streams intact when observation is unavailable or unused.

**Phase B — executor measurement adapters**

**Stories:** `s2`, `s3`, `s4`

Connect workflow/analyze, review and managed test measurements independently against the common contracts.

**Backward compat:** Retain current progress/delta frames, review checkpoints and gate behavior, test exit codes and process ownership. A missing measurement degrades observation only.

**Phase C — client delivery and qualification**

**Stories:** `s5`, `s6`

Connect VS Code lifecycle and native MCP adapters after the measurement shapes stabilize. Each delivery adapter qualifies independently.

**Backward compat:** VS Code keeps existing chat rendering and active-list rules. A missing or expired MCP token stays silent, and fallback is opt-in with capability evidence.

**Ordering rationale:** s1 owns shared contracts needed by all producers and consumers. s2–s4 own their measurement contracts and each depends only on s1. s5 and s6 consume all producer details and share no client dependency. Link the approved successor to the July scope separately from rollout.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Owner or attempt loss | Delayed callbacks or stale associations could make an ended chat appear live or overwrite newer task state. | Persist verified snapshots, fence writes by owner epoch and attempt, bound retention leases, and test daemon restart and multiple-window races. |
| Native client delivery and fallback drift | MCP acceptance, visible progress and scheduling are independent capabilities. | Qualify each client/version/session separately. Use one coordinator schedule with a fake-clock cadence test, and report unsupported or suspended observation visibly. |
| Counter and result truth | Tool frames and test reporters can omit totals, duplicate events or end before a verified result. | Keep producer units explicit, count only verified supported measurements, preserve raw outcomes, and cover unknown totals, nested suites, retries, reporter failure and nonzero exit. |

## 9. Alternatives considered

### 9.1 a1: Executor delegates with a shared daemon coordinator — **CHOSEN**

Normalize authorized executor measurements once and deliver typed snapshots through existing transports.

Each executor remains authoritative for lifecycle and exposes a bounded, read-only delegate snapshot. A daemon coordinator orders and retains task observations, deduplicates delivery, and bridges execution-owner activity to scoped session retention.

VS Code subscribes over the existing Unix IPC seam and projects snapshots into the originating chat. MCP maps those snapshots to request-scoped progress or a separate opted-in observation response. Existing workflow/analyze frames remain compatible.

**Pros:**
- One observation model keeps replay, loss and attempt handling consistent across VS Code and MCP.
- Native observation requires zero model calls and separates retention renewal from delivery.

**Cons:**
- A daemon-owned snapshot store and owner epoch checks need restart and expiry qualification.
- Each executor needs a narrowly scoped observation bridge.

**Cost estimate:** L

### 9.2 a2: Client-local adapters over executor-specific streams

Let each client track and interpret progress directly from the source stream.

Each executor exposes its own progress messages and the client adapts them to transcript or CLI updates. Existing streams remain the primary source.

Each client maintains its own reconnect state and derives activity from the channels it can observe. Coordination across windows and tool lifetimes requires agreement between clients.

**Pros:**
- One active client can render existing stream events with few daemon changes.

**Cons:**
- Disconnected observers cannot establish execution ownership or keep the correct chat active independently.
- Multiple clients can duplicate observation schedules and disagree on terminal state.

**Cost estimate:** M

**Rejected because:** Reuses transport but loses consistent shared ownership, replay and fallback scheduling.

### 9.3 a3: Central job scheduler and progress event log

Move execution and replay into a central job platform.

A common scheduler would dispatch workflow, review, analysis and test jobs and record each execution event. The scheduler would own retries, task state and replay.

Clients would receive progress from job subscriptions. Migration would move authority away from existing workflow and review executors.

**Pros:**
- A single scheduler could provide a uniform execution identity and lifecycle for migrated jobs.

**Cons:**
- Changes current executor ownership and introduces retry and scheduling behavior outside this epic.
- An event per output fragment would expand storage unless separately bounded.

**Cost estimate:** L

**Rejected because:** Centralizes execution and therefore conflicts with the approved ownership boundary.

## 10. UX

- [UX mock](docs/epics/show-long-running-task-progress-chat-E20261109206db342/ux-mock.html)

## 11. References

- **[[c1]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/DEF.md`
- **[[c2]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/HLD.md`
- **[[c3]]** `prior-artifact` `docs/standalone/show-background-task-progress-chat-E2026110407024f1d/SPEC.md`
- **[[c4]]** `code` `src/daemon/__tests__/workflow-progress-map.test.ts`
- **[[c5]]** `code` `src/daemon/__tests__/analyze-progress.test.ts`
- **[[c6]]** `code` `src/mcp/__tests__/progress-forward.test.ts`
- **[[c7]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c8]]** `convention` `AGENTS.md`
- **[[c9]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/DEF.md`
- **[[c10]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/DEF.md`
- **[[c11]]** `code` `src/daemon/workflow-rpc.ts`
- **[[c12]]** `code` `src/daemon/analyze-rpc.ts`
- **[[c13]]** `code` `src/shared/types.ts`
- **[[c14]]** `code` `src/mcp/progress-forward.ts`
- **[[c15]]** `code` `src/mcp/server.ts`
- **[[c16]]** `code` `src/workflow/review/design-review/progress.ts`
- **[[c17]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c18]]** `code` `src/daemon/steps/build-step/validation-checks.ts`
- **[[c19]]** `code` `src/daemon/chat-sessions.ts`
- **[[c20]]** `code` `vscode-plugin/src/chat/protocol.ts`
- **[[c21]]** `code` `vscode-plugin/src/chat/session-file-store.ts`
- **[[c22]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c23]]** `doc` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/review-evidence/visual-verification.md`

## Citations

- **[[c1]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/DEF.md`
- **[[c2]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/HLD.md`
- **[[c3]]** `prior-artifact` `docs/standalone/show-background-task-progress-chat-E2026110407024f1d/SPEC.md`
- **[[c4]]** `code` `src/daemon/__tests__/workflow-progress-map.test.ts`
- **[[c5]]** `code` `src/daemon/__tests__/analyze-progress.test.ts`
- **[[c6]]** `code` `src/mcp/__tests__/progress-forward.test.ts`
- **[[c7]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c8]]** `convention` `AGENTS.md`
- **[[c9]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/DEF.md`
- **[[c10]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/DEF.md`
- **[[c11]]** `code` `src/daemon/workflow-rpc.ts`
- **[[c12]]** `code` `src/daemon/analyze-rpc.ts`
- **[[c13]]** `code` `src/shared/types.ts`
- **[[c14]]** `code` `src/mcp/progress-forward.ts`
- **[[c15]]** `code` `src/mcp/server.ts`
- **[[c16]]** `code` `src/workflow/review/design-review/progress.ts`
- **[[c17]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c18]]** `code` `src/daemon/steps/build-step/validation-checks.ts`
- **[[c19]]** `code` `src/daemon/chat-sessions.ts`
- **[[c20]]** `code` `vscode-plugin/src/chat/protocol.ts`
- **[[c21]]** `code` `vscode-plugin/src/chat/session-file-store.ts`
- **[[c22]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c23]]** `doc` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/review-evidence/visual-verification.md`
