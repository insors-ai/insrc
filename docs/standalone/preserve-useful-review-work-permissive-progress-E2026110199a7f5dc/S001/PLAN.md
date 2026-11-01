<!-- insrc:artifact PLAN-99a7f5dc933a8456-s1 -->

# Plan: STORY-99a7f5dc933a8456-s1

## Summary

**Epic:** `preserve-useful-review-work-permissive-progress`
**LLD run:** `wf-1793509312835-bp3buc`
**LLD effective hash:** `99a7f5dc933a...`

Implement the approved 30-minute inactivity policy in five ordered tasks, preserving useful feedback and the removed-engine boundary. Native activity and controller protocol support the separate S4 progress story; no presentation or design-review redesign is included.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define activity execution contracts and inactivity monitor | M | — | — | unit: Fake-clock monitor: progress beyond expected duration, 1800000ms expiry, no heartbeat/replay renewal and separate tool ages; unit: Execution union rejects mixed timers; capability/Ollama refusal before execution; factual diagnostic classification | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Add bounded native CLI activity streams and candidate parsing | L | — | `t1` | integration: Claude/Codex fixture streams: incremental UTF-8, partial frames, tool IDs, candidate recognition and conservative final-output fallback; integration: Activity process has no fixed timer/watchdog, explicit cancellation kills group, buffers/queues remain bounded and non-task mode unchanged | [[c1]] [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Integrate daemon review supervision and durable feedback commits | L | — | `t1`, `t2` | integration: Daemon task activity survives old limits; attribution/task session identity; expiry persists incomplete without automatic retry; integration: Durable candidate vs crash/expiry/write failure/conflicting duplicate; validate before commit, receipt after checkpoint and cleanup | [[c1]] [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Add controller activity exchanges with generation fencing | M | — | `t1`, `t3` | integration: Real IPC controller activity envelope: owner/generation/sequence fencing, exact replay receipts, poll non-renewal and resume; integration: Controller/daemon expiry and persistence parity; capability/timing refusal and removed endpoints remain unavailable | [[c2]] [[c3]] [[c4]] [[c5]] |
| 5 | **`t5`** Verify recovery, compatibility and deployable timeout behavior | M | — | `t2`, `t3`, `t4` | integration: End-to-end deterministic recovery: two CLI adapters/routes, silent tools/local-pressure/unknown telemetry, no repeated completed task; smoke: Production build plus focused task-review, provider, IPC and retired-boundary regression suites; no paid/live or full repository sweep | [[c4]] [[c5]] [[c3]] |

### 1.1 TASK-99a7f5dc933a8456-s1-t1 — Define activity execution contracts and inactivity monitor

Introduce bounded/activity execution union, provider capability, host-owned 30-minute monotonic monitor, separately tracked tools and bounded factual diagnostic snapshots. Preserve non-task bounded calls; explicitly refuse unsupported Ollama task mode before execution.

**Acceptance checks:**
- Activity mode forbids fixed deadlines/stall watchdogs and automatic retries; malformed mixed options reject
- Meaningful activity extends 30-minute grace; heartbeat, poll and duplicate events do not; tool IDs/ages remain separate
- Monotonic fake-clock expiry and injected local-pressure/unknown diagnostics are deterministic
- Ollama opt-in task activity refuses before model calls; existing bounded behavior unchanged

### 1.2 TASK-99a7f5dc933a8456-s1-t2 — Add bounded native CLI activity streams and candidate parsing

Add opt-in no-wall-clock process mode, incremental UTF-8 stdout observation/backpressure and bounded diagnostics. Claude task sessions use stream-json flags; Codex parses JSONL as received. Normalize allowlisted native metadata and emit complete candidate events without treating draft or acknowledgements as results.

**Acceptance checks:**
- Neither process timeout nor old first-output/raw-stdout watchdog is armed in activity mode; explicit group cancellation remains
- Both adapters recognize fixture-verified model/tool events with serial callbacks and per-session identity
- 8 MiB frame/4 MiB candidate/64 KiB diagnostic bounds and queue backpressure hold; overflow stops explicitly without truncation
- Candidate recognition is conservative: Claude complete StructuredOutput input, Codex unambiguous final item or successful-turn fallback; acknowledgements and partial JSON excluded
- Existing non-task CLI envelope/schema behavior and timeout handling remain unchanged
- Native fixtures identify their actual source/dialect; locally available CLI metadata may be inspected without model calls; no fabricated live-proof claim

### 1.3 TASK-99a7f5dc933a8456-s1-t3 — Integrate daemon review supervision and durable feedback commits

Replace size deadlines in TaskReviewCoordinator with shared task monitor and activity provider mode, including serial attribution. Serialize validation, atomic completed-task persistence and expiry; accept durable results before wrapper cleanup, retain incomplete work honestly, and check provider capability before admission writes.

**Acceptance checks:**
- Progressing tasks survive former S/M/L limits; one current-task monitor spans serial attribution/task sessions
- Actual inactivity cancels owned subprocess and records incomplete without repeating completed tasks
- Complete candidates pass existing schema/scope/evidence assessment before checkpoint write; receipt/cleanup only after durability
- Candidate-then-crash retains committed assessment; invalid/conflicting/unsaved candidate never passes; write failure preserves prior durable history
- Attribution candidates cannot become task results; no automatic review retry or old engine fallback

### 1.4 TASK-99a7f5dc933a8456-s1-t4 — Add controller activity exchanges with generation fencing

Use the same inactivity policy for ControllerTaskReview. Add codeReview.task.activity and timing capability to explicit task protocol, sequence/host execution identity on activity/scope/result, exact replay receipts and new generation on resume. Preserve trusted ownership and existing disconnect/retrigger rules.

**Acceptance checks:**
- Actual IPC exercises task/attempt/execution identity, strictly ordered events and wrong-owner rejection
- Frames expose activity timing and advisory expectation, omit legacy remainingMs; unsupported timing clients refuse explicitly
- Polling/replayed accepted events do not renew; stale generation output cannot finish resumed work
- Controller and daemon terminal-result/expiry/write-failure behavior agree; disconnect does not silently continue controller work
- Normal MCP migration/S4 user-visible presentation remain outside this task
- Removed insrc_review_step, insrc_code_review_step and old review RPCs continue throwing PENDING REVIEW RE-IMPLEMENTATION

### 1.5 TASK-99a7f5dc933a8456-s1-t5 — Verify recovery, compatibility and deployable timeout behavior

Add end-to-end deterministic regressions for both adapters and routes, preserved bounded provider calls, result durability, cancellation/resource cleanup and removed review boundary invariants. Document new activity contract and internal diagnostic limits; build and retain test evidence without paid model/full repository sweeps.

**Acceptance checks:**
- Fake-time tests cover long progress, exactly 30-minute inactivity, long silent tools, local-pressure/unknown diagnostics and delayed event-loop wake
- Both native CLI fixture streams cover valid feedback then crash, candidate-expiry race, write failure, malformed frames, bounded output and group cleanup
- Current checkpoint/CR history and explicit resume remain valid; unrelated bounded Ollama/CLI tests and retired exception tests pass
- Production build and focused relevant suites pass; test evidence distinguishes deterministic fixtures from live model proof
- Handoff exposes normalized activity for separate STORY-e6ddcdcb3d9cf330-s4 without implementing its presentation or the future design-review epic

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| activity monitor | `t1` |
| task timeout policy | `t1`, `t3` |
| TaskReviewCoordinator | `t3`, `t5` |
| controller review protocol | `t4`, `t5` |
| CliProvider Claude/Codex adapters | `t2`, `t5` |
| process-group cancellation | `t2`, `t3`, `t5` |
| ReviewSessionOpts | `t1`, `t2` |
| controller frames | `t4` |
| existing checkpoint/CR readers | `t3`, `t5` |
| OllamaProvider.runReviewSession in src/agent/providers/ollama.ts | `t1`, `t5` |
| src/agent/providers/__tests__/ollama-review-session.test.ts | `t1`, `t5` |
| TypeScript build | `t5` |
| task-review tests | `t5` |
| provider review-session tests | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-99a7f5dc933a8456-s1 contractDetails`
- **[[c2]]** `prior-artifact` `LLD-99a7f5dc933a8456-s1 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD-99a7f5dc933a8456-s1 errorPaths`
- **[[c4]]** `prior-artifact` `LLD-99a7f5dc933a8456-s1 testStrategy`
- **[[c5]]** `prior-artifact` `LLD-99a7f5dc933a8456-s1 migration`
