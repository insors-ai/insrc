<!-- insrc:artifact PLAN-e6ddcdcb3d9cf330-s4 -->

# Plan: STORY-e6ddcdcb3d9cf330-s4

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**LLD run:** `wf-1793534540519-zyz14s`
**LLD effective hash:** `9644e9acbe91...`

Build incremental review visibility on the existing activity and checkpoint infrastructure. Keep progress bounded, truthful and separate from review judgments, then expose a read-only polling helper with concise user updates.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define bounded progress contracts and truthful projection | S | — | — | unit: Projects sanitized bounded phases and meaningful activity with unknown-safe elapsed; unit: Reads checkpoints with optional progress and rejects malformed metadata | [[c1]] |
| 2 | **`t2`** Serialize coalesced progress persistence with task results | M | — | `t1` | integration: Coalesces progress writes and fences stale generations without corrupting results; integration: Retains durable feedback when progress persistence fails | [[c2]] |
| 3 | **`t3`** Connect daemon and controller execution observations | M | — | `t2` | integration: Daemon and controller produce equivalent progress without renewing inactivity on heartbeat; integration: Terminal task result supersedes pending progress and stops timers | [[c3]] |
| 4 | **`t4`** Expose read-only progress and deterministic user updates | M | — | `t3` | unit: Read-only progress IPC validates scope and never invokes providers; unit: Polling helper emits immediate transitions and45sec updates and cancels cleanly | [[c4]] |
| 5 | **`t5`** Verify progress across native adapters, reconnect and failure | M | — | `t4` | smoke: Both native CLI fixtures expose isolated reconnectable progress through production IPC; smoke: Progress write failure restart and terminal races preserve authoritative task outcomes | [[c5]] |

### 1.1 TASK-e6ddcdcb3d9cf330-s4-t1 — Define bounded progress contracts and truthful projection

Add optional attempt progress schema and bounded sanitized reducer; normalize phase/task/count, monotonic elapsed, meaningful activity and explicit freshness. Existing checkpoint without metadata remains unknown.

**Acceptance checks:**
- Optional bounded metadata accepts old checkpoints without fabricating activity
- No raw model output,commands,tool IDs or reasoning persisted; phase remains unknown/generic without evidence

### 1.2 TASK-e6ddcdcb3d9cf330-s4-t2 — Serialize coalesced progress persistence with task results

Reuse per-review serial writer; latest-only coalescing,5sec routine writes, immediate boundary flush, generation fencing and timer disposal. Never overwrite newer results or input; progress write failure is best effort while task-result failure remains fail-stop. At most one pending progress flush, including rapid phase changes; serial task/result boundaries remain authoritative.

**Acceptance checks:**
- High-rate events retain one pending snapshot; routine writes bounded to5sec
- Late queued writes cannot overwrite task results; timer stopped on retirement; failures retain last durable observation
- Rapid phase alternation cannot create an unbounded write queue

### 1.3 TASK-e6ddcdcb3d9cf330-s4-t3 — Connect daemon and controller execution observations

Feed accepted activity-v1 observations and lifecycle transitions from both reviewer routes. Distinguish generic tools, trustworthy test observations and process liveness; preserve30min inactivity and explicit controller retrigger.

**Acceptance checks:**
- Both routes expose task/phase/count and real activity with generation isolation
- Heartbeat/polls do not renew activity; long tools tracked honestly; completed feedback authoritative

### 1.4 TASK-e6ddcdcb3d9cf330-s4-t4 — Expose read-only progress and deterministic user updates

Add validated codeReview.task.progress delegation and deterministic formatter/poll guidance:5sec reads, immediate changes/terminal errors and45sec ongoing updates. No execution restart, provider calls or normal MCP migration. Include a cancellable explicit task-review polling helper using existing IPC client, injectable clock and update callback; controller can use this without retired endpoints.

**Acceptance checks:**
- Read validates project/review/attempt and does not invoke provider/resume
- User sees immediate changes and45sec updates; stale/unknown explicit; no percentage estimates
- Concrete helper emits updates via callback, cancels cleanly and never retriggers review

### 1.5 TASK-e6ddcdcb3d9cf330-s4-t5 — Verify progress across native adapters, reconnect and failure

Use existing fake CLI/production IPC fixtures for both providers; prove isolated reviews, stale restart/reconnect, no extra calls, bounded writes and races. Document use and limits; no full expensive review loop.

**Acceptance checks:**
- Both native fixtures and real IPC prove end-to-end behavior with zero hosted-model calls
- Reconnect,write-failure,terminal race and concurrent review isolation covered; document matching-version recovery limits

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Progress reducer | `t1` |
| Progress formatter | `t4` |
| Optional checkpoint schema | `t1` |
| TaskReviewCoordinator | `t2`, `t3`, `t5` |
| ControllerTaskReview | `t3`, `t5` |
| Read-only progress RPC | `t4`, `t5` |
| Both native adapter fixtures through task-review IPC | `t5` |
| Reconnect and terminal publication | `t2`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contract/dataModelChanges`
- **[[c2]]** `prior-artifact` `LLD s4 errorPaths/persistence`
- **[[c3]]** `prior-artifact` `LLD s4 execution interactions`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails/progress read and presentation`
- **[[c5]]** `prior-artifact` `LLD s4 testStrategy/migration`
