<!-- insrc:artifact DEF-206db3426ffd4428 -->

# Epic: show-long-running-task-progress-chat

## Summary

**Flavor:** enhancement

Follow long-running reviews, test sweeps, workflow operations and analysis from the conversation that launched them. See measured progress and the final result while work continues across turns, chat switches and supported reconnects. Native delivery needs no extra model calls, with optional one-minute polling where direct delivery is unavailable.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Users following long-running daemon workflows, analysis, reviews and test sweeps receive uneven progress feedback across clients and often have to ask whether work is still running. Output silence makes it hard to distinguish measured work, a healthy wait and a lost observer. A chat can appear finished or age out while its background task is still running, and switching conversations or reconnecting can hide the task's latest state.

## 2. Functional requirements

- **E20261109206db342:FR001** — Users see the latest verified stage, measurable work and terminal outcome for supported long-running operations.
- **E20261109206db342:FR002** — Users can follow several tasks in their own chats across turns, switches and reconnects, with observations scoped to the right attempt.
- **E20261109206db342:FR003** — Supported clients show native updates without extra model calls, and users can explicitly enable one-minute fallback observation where supported.

## 3. Non-goals

- **Changes to review execution, workflow stages, approval gates or model providers** — Observation follows existing execution ownership and results.
- **insrc TUI changes, deprecated insrc-ide work, or third-party CLI patches** — Initial delivery targets VS Code chat and verified native CLI surfaces.
- **General job scheduling, arbitrary process attachment or automatic task restart** — Initial delegates observe instrumented, authorized executions.
- **Fabricated ETA or progress, raw model output as progress, and universal MCP Tasks support** — Progress is measured, bounded and capability-specific.

## 4. Assumptions

- `high` Current workflow and analyze producers already expose some shared progress. Workflow token batches and analyze stage frames have distinct evidence and availability. [[c4]]
- `high` Analyze producer tests cover stage frames and explicitly show cases where no token delta is emitted. [[c5]]
- `high` MCP forwarding code and tests exist. Native rendering and autonomous scheduling require separate live qualification. [[c6]]
- `high` Committed code-review checkpoints expose phase, active task and completed tasks as measured inputs. [[c7]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | Cover workflow and analyze operations through their supported IPC entry points, design reviews, code reviews and managed test sweeps with a shared authorized task/attempt progress contract. | [[c1]] |
| `k2` | invariant | Reuse the existing Unix IPC and typed progress/delta seams compatibly. Preserve existing frame semantics, cancellation, final results and behavior for clients without progress observers. Client database access remains IPC-only. | [[c2]] |
| `k3` | contract | Each initial task delegate supplies bounded structured progress() for an authorized attempt, shared by direct delivery and optional polling. Measured phase, counts, active unit, milestones and freshness stay distinct from lifecycle, connectivity, liveness and retention. Unknown measurements stay unknown. | [[c3]] |
| `k4` | contract | Publish native progress with zero extra model invocations. MCP forwards monotonic progress with an optional caller token only during its valid request lifetime. No token means normal completion without notifications. Live-qualify visible rendering independently of protocol support. Qualify delivery beyond the launching turn and across native session exit separately from in-request rendering and scheduling. Retain results for authorized reattachment where native session activity cannot be maintained. | [[c3]] |
| `k5` | stakeholder | Optional token-consuming agent fallback uses one shared fixed 60-second healthy schedule per task. Suppress duplicate narration without slowing cadence. Report degraded or unavailable scheduling and stop observation at terminal state. Before opt-in, disclose that fallback can consume agent tokens even on unchanged polls and can produce ordinary chat messages. | [[c3]] |
| `k6` | contract | Route one typed inline message to the owning VS Code chat and update it across turns and chat switching. Runtime task ownership renews bounded activity independently of observers and respects waiting-input, multiple attempts and unrelated chat concurrency. Explicit conversation closure detaches presentation. Removing the conversation releases its retention association and preserves authorized access to surviving task state and results through the owning project. Running execution continues unless the user explicitly cancels it. | [[c3]] |
| `k7` | invariant | Restore bounded authorized snapshots and milestones with cursor or explicit resync on reconnect. Preserve verified terminal outcomes, prevent stale attempts from overwriting newer state, and reconcile lost owners honestly. Stopping observation and cancelling execution are separate actions. Persist bounded snapshots, milestones and verified terminal outcomes across daemon restarts. Mark nonterminal execution interrupted or unknown until its owner verifies survival or genuine resumption. Discard delayed events from prior execution epochs. | [[c3]] |
| `k8` | convention | Use current VS Code and daemon entry points and qualify native Claude Code, Codex and Vibe per client. No deprecated client gates, TUI changes or direct provider API access. | [[c8]] |
| `k9` | convention | Preserve traceability to July epic #41 and its three stories #42–#44. Treat them as source requirements for this successor. Tracker retirement is a separate decision after successor approval and linkage. | [[c9]] |

## 6. Stories

### 6.1 STORY-206db3426ffd4428-s1 — Track long-running work consistently across executors

**User value:** `size: L`

Users receive trustworthy, current progress for an authorized execution attempt even when the operation is quiet.

**Extends:** [[c2]] [[c4]] [[c5]] [[c7]]

**Acceptance criteria:**

- **ac1:** Given Two authorized attempts are running, when their measurements advance, arrive out of order or repeat, then each exposes its own meaningful revision, measured phase and counts with declared units, source freshness and milestones. Duplicates, sample times and heartbeats do not fabricate progress.. _(operationalizes `k1`, `k3`, `k7`)_
- **ac2:** Given An observer reconnects or falls behind, when it requests the latest authorized state, then it receives the latest bounded snapshot and relevant milestones, then resumes or explicitly resyncs. Terminal results remain stable and stale attempts cannot overwrite new ones.. _(operationalizes `k3`, `k7`)_
- **ac3:** Given An owner becomes unavailable or a user stops observation, when the observation is reconciled, then missing progress is stale or unknown, and no execution is restarted or marked complete from loss of observation. Explicit cancellation stays pending until termination is verified.. _(operationalizes `k7`)_
- **ac4:** Given An unrelated user or chat requests task details or logs, when access is evaluated, then unauthorized access is rejected and approved observations stay bounded and redacted without exposing raw model text, credentials or unbounded logs.. _(operationalizes `k2`, `k3`, `k7`)_
- **ac5:** Given A reader compares the successor with July epic #41 and stories #42–#44, when they trace the predecessor scope, then the successor links the source epic and identifies all three story records, preserving the original requirements and their history.. _(operationalizes `k9`)_
- **ac6:** Given Running and terminal attempts have persisted snapshots and the daemon restarts, when an authorized observer reattaches and delayed events from the previous execution epoch arrive, then the last verified milestones and terminal results remain available. A nonterminal attempt is interrupted or unknown until its owner verifies survival or genuine resumption. Delayed events cannot replace newer state, and reattachment starts no execution.. _(operationalizes `k3`, `k7`)_

### 6.2 STORY-206db3426ffd4428-s2 — Preserve live progress for workflows and analysis

**User value:** `size: M`

Users can distinguish a quiet workflow or analysis from active stage advancement without losing current client compatibility.

**Depends on:** `s1`

**Extends:** [[c1]] [[c2]] [[c4]] [[c5]]

**Acceptance criteria:**

- **ac1:** Given A supported daemon workflow and analysis run end to end, when each enters a new stage and reports supported measurements, then both expose the same progress contract with the current stage and measured ongoing production, including batched token counts only where actually available. Missing counts remain unknown.. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given A legacy client or a caller without a progress observer starts either operation, when it runs to a terminal outcome, then existing stream semantics, operation results and cancellation behavior are preserved. Progress ends once the terminal outcome is delivered.. _(operationalizes `k1`, `k2`, `k7`)_

### 6.3 STORY-206db3426ffd4428-s3 — Report design and code review milestones

**User value:** `size: M`

Review participants see which stage or task is active and which measured work has finished.

**Depends on:** `s1`

**Extends:** [[c3]] [[c7]]

**Acceptance criteria:**

- **ac1:** Given A design review and a committed task code review are running, when phases, tasks, checks or supported chunks advance, then the review-specific measurements show active and completed units, retries and discovered follow-up work separately. A quiet worker can report health without incrementing counts.. _(operationalizes `k1`, `k3`)_
- **ac2:** Given A review is interrupted or resumed, when an observer returns or a delayed event arrives, then the latest verified attempt remains authoritative and findings, publication and approval gates retain their existing behavior.. _(operationalizes `k3`, `k7`)_

### 6.4 STORY-206db3426ffd4428-s4 — Report managed test-sweep counts and final outcome

**User value:** `size: M`

Users see test activity, reliable pass/fail/skip counts and the verified result before reading the full log.

**Depends on:** `s1`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given A managed test command discovers and runs suites, when its reporter emits nested results, retries or partial failures, then the active suite and measured discovery/execution/completion counts are exposed with declared units and no double counting. Detailed output stays separately accessible.. _(operationalizes `k1`, `k3`)_
- **ac2:** Given The command is aborted, exits nonzero or its reporter fails, when a terminal update is rendered, then incomplete or unsuccessful work is represented truthfully and the original command and exit semantics are preserved.. _(operationalizes `k2`, `k3`, `k7`)_

### 6.5 STORY-206db3426ffd4428-s5 — Keep inline progress with its originating VS Code chat

**User value:** `size: L`

Users can switch chats and continue working while background tasks stay visible and retain their own session.

**Depends on:** `s1`, `s2`, `s3`, `s4`

**Extends:** [[c2]] [[c3]]

**Acceptance criteria:**

- **ac1:** Given A review, test sweep, workflow or analysis is launched in chat A, when the user starts another turn, switches chats or reconnects, then a typed client surface updates one existing message in A without extra model calls and retains one compact terminal result. No event crosses into chat B.. _(operationalizes `k2`, `k4`, `k6`, `k7`)_
- **ac2:** Given Chat A has verified live work and no attached observers, when its idle window elapses or session capacity is reached, then the execution owner keeps A retained without agent polling or visible ticks. B can run independently and observation never owns an execution lock.. _(operationalizes `k6`, `k7`)_
- **ac3:** Given Chat A has two tasks, a newer turn and an unresolved decision, when an old attempt ends or a heartbeat arrives, then waiting-input takes precedence and done is projected only after all obligations end. Lost ownership expires within a bound and late events cannot resurrect work.. _(operationalizes `k6`, `k7`)_
- **ac4:** Given An owning conversation has a running task, when the user explicitly closes or removes the conversation, then presentation detaches and execution continues. Removing the conversation releases its retention association and preserves authorized access to surviving task state and results from the project. If the user explicitly cancels, cancellation remains pending until the executor verifies termination.. _(operationalizes `k6`, `k7`)_

### 6.6 STORY-206db3426ffd4428-s6 — Deliver progress in supported native CLI chats

**User value:** `size: L`

Claude Code, Codex and Vibe users get progress through capabilities verified for their own client.

**Depends on:** `s1`, `s2`, `s3`, `s4`

**Extends:** [[c3]] [[c6]]

**Acceptance criteria:**

- **ac1:** Given A long-running MCP request includes a valid caller progress token, when the operation reports progress and then finishes, then notifications use that token only during its valid lifetime, expose monotonic measured progress, and finish with the original result. A no-token request completes normally without notifications.. _(operationalizes `k2`, `k4`, `k8`)_
- **ac2:** Given A client claims native progress or background scheduling support, when it is qualified end to end, then tool connectivity, token forwarding, visible rendering, scheduled observation, background lifetime after the launching turn and behavior on native session exit are verified separately for that client/version/session. Verified native delivery consumes no extra model calls.. _(operationalizes `k4`, `k8`)_
- **ac3:** Given A user explicitly opts into fallback on a healthy host after being told that even unchanged polls can consume agent tokens and updates can produce ordinary chat messages, when several observers attach and the task alternates changes with unchanged snapshots, then one schedule returns current details every 60 seconds, suppressing duplicate narration without delaying the next poll. Terminal and action-required changes appear by the next healthy poll.. _(operationalizes `k3`, `k5`)_
- **ac4:** Given A fallback host loses scheduling or connectivity, when observation cannot continue on schedule, then the client reports a degraded or suspended observer, resumes the fixed healthy cadence after recovery where supported, and never implies execution cancellation.. _(operationalizes `k5`, `k7`, `k8`)_
- **ac5:** Given A native client can render progress during a request but cannot maintain native observation after the launching turn or session exit, when the request or session ends while execution remains owned, then the client surfaces the capability limit. Expired progress tokens are never reused, execution is not cancelled, and authorized reattachment can recover the saved task state and result.. _(operationalizes `k4`, `k7`, `k8`)_

### 6.7 STORY-206db3426ffd4428-s7 — Launch a long-running command as a daemon-owned task that outlives the chat turn

**User value:**

A user or agent in a chat can start a long-running command or test run as a daemon-owned task, end the turn, and still see its progress and final result in the originating chat, without the chat's session lock being held by a pending background process.

**Acceptance criteria:**

- **ac1:** Given A chat launches an authorized long-running command (for example a 40-minute live test run or a test sweep) through the daemon, when The launching turn ends and the chat process exits, then The command keeps running under the daemon, the chat's session lock is released at the turn end, and the next message in the chat is not delayed by the running command..
- **ac2:** Given A daemon-owned command task was launched from chat A, when The user starts another turn, switches chats or reconnects, then One existing message in chat A shows the task's latest measured state and its terminal result (exit status, a bounded output tail and the log location) without extra model calls, and no event reaches chat B..
- **ac3:** Given A command is launched as a daemon task, when It is registered, then It runs only inside the registered repository with the caller's authorization, is limited to commands the daemon accepts under its approval policy, and is not an attachment to an arbitrary pre-existing process..
- **ac4:** Given A daemon-owned command task is running, when The user cancels it or the daemon restarts, then Cancellation stays pending until the daemon verifies the process ended, and after a restart the task is reported as lost or finished rather than shown as still running..
- **ac5:** Given The epic's non-goals exclude general job scheduling and arbitrary process attachment, when This story is added, then The non-goal is narrowed in the Define to state exactly what stays excluded (scheduling, recurring jobs, attaching to existing processes, automatic restart) while launching an authorized one-shot command as a task is in scope..

## 7. References

- **[[c1]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/DEF.md`
- **[[c2]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/HLD.md`
- **[[c3]]** `prior-artifact` `docs/standalone/show-background-task-progress-chat-E2026110407024f1d/SPEC.md`
- **[[c4]]** `code` `src/daemon/__tests__/workflow-progress-map.test.ts`
- **[[c5]]** `code` `src/daemon/__tests__/analyze-progress.test.ts`
- **[[c6]]** `code` `src/mcp/__tests__/progress-forward.test.ts`
- **[[c7]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c8]]** `convention` `AGENTS.md`
- **[[c9]]** `prior-artifact` `https://github.com/insors-ai/insrc/issues/41`
