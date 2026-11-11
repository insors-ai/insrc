<!-- insrc:artifact PLAN-206db3426ffd4428-s2 -->

# Plan: STORY-206db3426ffd4428-s2

## Summary

**Epic:** `show-long-running-task-progress-chat`
**LLD run:** `wf-1794254425999-ht2ypo`
**LLD effective hash:** `48a6a5468b45...`

Build typed progress delegates for workflow and analysis, then connect their execution owners to the existing daemon coordinator. Verify routed and in-process execution against the legacy contracts, including cancellation, authorization and terminal delivery.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define and validate workflow and analysis measurements | M | — | — | unit: S2 workflow measurements count provider output chunks and preserve legacy token batches; unit: S2 analysis measurements ignore previews and isolate nested task identities | [[c1]] [[c2]] |
| 2 | **`t2`** Bridge verified run ownership to the daemon coordinator | M | — | `t1` | integration: S2 producer relay admits only a verified project origin and worker attempt; integration: S2 producer relay preserves early terminal evidence and releases unresolved admissions; integration: S2 quiet owner renews activity and worker loss fences stale evidence | [[c1]] [[c3]] |
| 3 | **`t3`** Wire workflow execution owners | M | — | `t2` | integration: S2 workflow progress preserves streaming frames and terminal result; integration: S2 detached workflow preserves poll cursor and abort behavior across observer loss | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Wire analysis execution owner | M | — | `t2` | integration: S2 analysis progress preserves stage frames and the analyze.result then done sequence; integration: S2 analysis preserves cached completion cancellation and persisted status | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Qualify combined progress and legacy compatibility | M | — | `t3`, `t4` | integration: S2 real daemon routes concurrent workflow and analysis progress to isolated observers; integration: S2 legacy workflow and analysis outcomes survive absent refused and failing observation; integration: S2 production runtime preserves S1 records and adds no provider calls | [[c1]] [[c3]] [[c4]] |

### 1.1 TASK-206db3426ffd4428-s2-t1 — Define and validate workflow and analysis measurements

Add closed sc4 detail schemas and run-local mapping for the existing workflow callbacks and typed analysis events. Feed the production runtime validators and register both producer ports.

**Acceptance checks:**
- Both detail types pass S1 runtime validation and use closed, bounded identifiers. Unsupported or malformed measurements remain unknown.
- Workflow callback counts use output-chunks with unknown total. The legacy token batching and tail remain unchanged. Analysis preview text never becomes progress or a count.
- Workflow stage position does not use legacy event indexes. Analysis positions, if available, count completed work within the same plan. Duplicate or nested task IDs must not corrupt the count.

### 1.2 TASK-206db3426ffd4428-s2-t2 — Bridge verified run ownership to the daemon coordinator

Connect routed workflow and analysis runs to the main daemon through a private worker relay. Use the same producer lifecycle in-process. Keep the existing coordinator and access rules as the authority.

**Acceptance checks:**
- A server-verified launch binds the registered project, invocation, actual worker channel and execution key to one S1 attempt. No client-supplied identity or ambiguous binding can mint a grant.
- Bound the relay to a latest active sample and a reserved terminal update per admitted execution. Reject stale, malformed, foreign and late events. Keep a terminal outcome that arrives before admission within the bounded reservation; expire unresolved admissions.
- Probe the actual execution owner during quiet work. Terminal evidence bypasses active coalescing, persists before S1 delivery and is replayable under the same fence. Verified owner loss without accepted terminal evidence is interrupted.
- Failure or refusal cannot delay or reject legacy execution, and no worker opens a second progress store.
- Verify the origin and registered project at the main daemon before admitting a routed owner. An admitted detached run outlives the initiating socket under the existing registry. Worker exit cleans up the relay.

### 1.3 TASK-206db3426ffd4428-s2-t3 — Wire workflow execution owners

Connect both workflow.run streaming and workflow.run.start detached execution to the shared workflow delegate. Use the existing driver callbacks and real stream or registry outcome.

**Acceptance checks:**
- Stream stage and delta frames, token batching, tail and terminal payloads are byte-compatible. Detached poll frames, cursor and abort behavior are preserved.
- Both entry paths report stage transitions and measured cumulative output with the declared unit when present. Nested grounding and controller steps do not create separate observations.
- Observer loss leaves detached work active. Accepted completion, rejection and actual cancellation publish exactly one settled status. Cancel requests alone do not certify termination.

### 1.4 TASK-206db3426ffd4428-s2-t4 — Wire analysis execution owner

Connect analyze.run.start to the analysis delegate at the existing typed event and result seams. Preserve analysis persistence and status retrieval.

**Acceptance checks:**
- Legacy stage mapping and analyze.result/done ordering remain compatible. analyze.run.status returns the existing persisted result.
- Typed stage and task events feed the delegate. Preview and tool text, nested analysis and controller steps do not add progress observations. Cached completion and typed cancellation use the actual result.
- Invalid launches, an unexpected throw, disconnect and a race with completion preserve legacy semantics and do not fabricate successful progress.

### 1.5 TASK-206db3426ffd4428-s2-t5 — Qualify combined progress and legacy compatibility

Exercise both producers through real daemon routing and the in-process path with controlled providers and verified test origins. Run the integrated verification sweep after focused task checks.

**Acceptance checks:**
- Concurrent workflow and analysis preserve attempt and project isolation and retain authoritative terminal outcomes. Check a quiet owner, worker exit, observer loss, authorization denial, pending admission and persistence failure.
- Legacy compatibility holds with observation active, absent, refused and failing. Provider invocation counts stay unchanged.
- Run the backend build and full backend test sweep once the tasks are complete. Record the exact tested revision, outcomes and evidence.
- Check that pre-existing S1 records require no rewrite and a daemon without active S2 producers still serves the legacy contract.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Workflow phases, retries and known versus absent production units | `t1`, `t3` |
| Analysis stages, tasks and ignored previews | `t1`, `t4` |
| Owner settlement and quiet liveness | `t2`, `t5` |
| workflow.run | `t3`, `t5` |
| workflow.run.start/poll/abort | `t3`, `t5` |
| analyze.run.start/status | `t4`, `t5` |
| Worker exit, rebinding and terminal write failure | `t2`, `t5` |
| Exact frame sequences and payloads | `t3`, `t4`, `t5` |
| Cancellation and detached lifetime | `t2`, `t3`, `t4`, `t5` |
| Denial for wrong project or origin and stale worker | `t2`, `t5` |
| No extra provider invocations, bounded relay and final cleanup | `t2`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S002/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S002/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S002/LLD.md#5-interaction-with-shared-contracts`
- **[[c4]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S002/LLD.md#7-test-strategy`
