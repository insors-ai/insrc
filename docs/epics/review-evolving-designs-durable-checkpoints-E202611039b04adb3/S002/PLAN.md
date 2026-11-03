<!-- insrc:artifact PLAN-9b04adb36cac716d-s2 -->

# Plan: STORY-9b04adb36cac716d-s2

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**LLD run:** `wf-1793713762387-46cdvu`
**LLD effective hash:** `20a9ee7f3bdf...`

Build S2 in eight dependency-ordered tasks over the existing design-review coordinator and checkpoint. Persist recovery/retry state first, then add explicit resume/restart, unit-scoped retries, subject invalidation and active-tool-aware inactivity before exposing normal MCP/IPC recovery. Verify with isolated deterministic fixtures, virtual clocks and a compiled synthetic smoke; leave selective impact and permanent lifecycle publication to later stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define strict recovery and technical-failure contracts | M | — | — | unit: Strict recover/failure schemas discriminate phase and operation and reject invalid identities, attempts, decisions, unknown fields and size limits.; unit: Additive S1 checkpoints and bounded sc3 counters/actions/unit summaries/progress metadata round-trip without copied content or raw transcripts. | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Persist monotonic recovery state and preserve checkpoint errors | M | — | `t1` | unit: Atomic checkpoint failures preserve accepted snapshots and fence execution; direct save and commit preserve domain versus normalized I/O errors.; unit: Per-unit counters, action replay identity, one-fill outcomes, sealed summaries and prior attempts enforce monotonic immutable history. | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Recover interrupted work and admit approved full restarts | M | — | `t1`, `t2` | unit: Explicit unchanged-subject recovery skips accepted plan/chunks and completes report-only work without model calls.; unit: Recovery action replay/conflicts, missing checkpoints, controller rebind and fresh approved restart preserve authority, history and workflow context. | [[c1]] [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Retry only failed units and pause on exhausted budget | M | — | `t2`, `t3` | unit: Native and controller technical failures share initial-plus-three retry budget, pointed feedback and fresh generation while semantic findings/incomplete results never retry.; unit: Crash reservations survive recovery; exhausted reviews pause until one-launch user direction without resetting automatic budget or losing unit summaries. | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Monitor the reviewed subject and latch invalidation | M | — | `t3`, `t4` | unit: Subject-only monitoring detects edits/deletion/rename during blocked execution and persists sticky invalidation despite restoration and late output.; unit: Final-report/activity-save races fail closed; external changes are ignored and watcher resources clean up and re-arm. | [[c1]] [[c3]] [[c4]] |
| 6 | **`t6`** Separate active tools from model-wait inactivity | M | — | `t4` | unit: Virtual-clock native/controller activity permits long active tools and meaningful progress without fixed deadlines, while true idle waits expire at thirty minutes.; unit: Polling, heartbeat and process liveness do not renew activity; tool completion/failure and late output obey unit cancellation and timer cleanup. | [[c1]] [[c3]] |
| 7 | **`t7`** Expose recovery and failure through normal MCP and IPC | M | — | `t3`, `t4`, `t5`, `t6` | integration: Normal MCP and short main-owned IPC recover/failure routes enforce strict schema/repo gates, native provider routing and actual controller ownership.; integration: Independent subjects and multi-session recovery preserve accepted results and reject duplicate dispatch, stale generations and observer takeover.; unit: Schema/guide and bounded progress expose retry/pause/restart rules while retired review calls remain unavailable. | [[c1]] [[c3]] [[c4]] |
| 8 | **`t8`** Qualify compiled recovery flows and document evidence | M | — | `t7` | smoke: Compiled isolated fake-CLI normal-entrypoint recovery demonstrates retry pause/user action, subject invalidation and zero repeated accepted-chunk calls.; integration: Focused regressions qualify native/controller parity and Epic/Standalone/Issue contexts with disposable fixtures, preserving unrelated review engines. | [[c1]] [[c3]] [[c4]] |

### 1.1 TASK-9b04adb36cac716d-s2-t1 — Define strict recovery and technical-failure contracts

Extend design-review contracts and validators with recover/failure phases, phase versus operation discrimination, actionId/user decisions, sc3 recovery/failure state, per-unit automatic counters, bounded diagnostics, sealed unit summaries and one-fill action outcomes. Retain readable S1 checkpoints and existing size limits; declare later impact/publication seams without implementing them.

**Acceptance checks:**
- Strict recover and failure schemas reject unknown fields, invalid discriminator/operation/identity/attempt/decision combinations and exceeded bounds before dispatch.
- Typed checkpoint/progress/assignment metadata carries retry state, pointed technical feedback and completed-unit summaries without artifact-body copies or raw native transcripts.
- Existing S1 checkpoint shapes remain readable; automatic initial-plus-three limits and action/attempt/unit bounds are explicit.

### 1.2 TASK-9b04adb36cac716d-s2-t2 — Persist monotonic recovery state and preserve checkpoint errors

Extend existing atomic checkpoint save/load validation for per-unit counters, action replay identity, sealed completed-unit summaries, one-fill user-directed outcomes and fully frozen prior attempts. Normalize I/O failures at save boundary; preserve concrete domain error codes through coordinator commit and fence every failed save.

**Acceptance checks:**
- Atomic failed writes preserve the previous accepted snapshot and block subsequent launch/advance.
- Accepted baseline/plan/chunks and older attempts are immutable; per-unit counters/actions never decrease or disappear, completed summaries seal and action outcomes fill once.
- Direct save and coordinator commit preserve domain codes such as checkpoint_too_large/foreign_checkpoint/immutable_history and normalize I/O failures to DesignReviewPersistenceError.

### 1.3 TASK-9b04adb36cac716d-s2-t3 — Recover interrupted work and admit approved full restarts

Add coordinator recover admission using existing main-owner job/subject serialization. Persist exact actionId replay and dispatch reservations before short acknowledgement; reconstruct accepted plan/chunks and execute only unfinished work. Bind trusted recovering controller after old execution ends; append fresh user-approved invalidated-attempt restart with no reuse and current workflow-aware subject preparation.

**Acceptance checks:**
- Explicit unchanged-subject resume retains accepted chunks byte-for-byte, skips accepted planning/units and re-consolidates all-complete report-only work with zero provider calls.
- Exact action replay never duplicates work; conflicting actions, missing checkpoints/attempts, foreign active owners and stale generations are refused. Startup/progress/duplicate start never implicitly recover.
- Approved restart_full appends the next fresh attempt and freezes previous history; admitted same-attempt references ignore external changes, while fresh restart derives proper Epic/Standalone/Issue prerequisites and reviewer party.

### 1.4 TASK-9b04adb36cac716d-s2-t4 — Retry only failed units and pause on exhausted budget

Refactor coordinator unit execution with separate per-unit versus whole-job cancellation. Persist reservations and pointed diagnostics before serial technical retries; initial execution plus at most three automatic retries. Handle native errors and controller generation-bound failure/invalid-output exchange under one classifier; preserve budget across interruption and require recorded one-launch user action after exhaustion.

**Acceptance checks:**
- Only the failed planning/chunk unit retries; completed units remain unchanged, native internalRetry stays false, and HIGH/MED/incomplete semantic results are accepted without retry.
- Crash after reservation conservatively consumes that dispatch; resume preserves remaining budget. Exhaustion durably pauses all remaining work until matching user direction; each unique approved action grants one extra dispatch without automatic reset.
- Trusted controller failure and native failures share diagnostics/counters/generation fencing; malformed request/foreign owner/storage/context/unsupported-provider/mutation errors do not spend automatic model retries.
- Completed unit summaries and user-action outcomes remain available after later successful units and full restart; no earlier technical history is silently overwritten.

### 1.5 TASK-9b04adb36cac716d-s2-t5 — Monitor the reviewed subject and latch invalidation

Add a design-local subject monitor using filtered parent-directory watch hints and a nonoverlapping one-second fallback check; reuse existing subject fingerprint validation. Guard admission/recovery/unit/result/final-report boundaries, latch changes before abort, persist invalidation independently of a slow provider, retire late generations and dispose monitor resources.

**Acceptance checks:**
- Observed subject edits, deletion, noncanonical replacement and rename during a long-running unit immediately stop advancement and expose durable invalidated/user-input state; restoring bytes cannot revive the attempt.
- Late provider/controller output, queued activity saves and final checkpoint-report races cannot overwrite latched invalidation; persistence failure stays fail-closed.
- Reference/source edits outside canonical JSON/document do not invalidate; monitor cleanup/re-arm works without unrelated directory-event restarts. Full restart remains explicit/user-approved.

### 1.6 TASK-9b04adb36cac716d-s2-t6 — Separate active tools from model-wait inactivity

Implement design-local timer/activity policy around the existing ReviewActivityMonitor. Preserve 30-minute true-inactivity grace and no task deadline, while separately tracking active tool identities/elapsed state and deferring inactivity expiry during verified in-flight tools. Keep shared code-review/provider behavior unchanged and report tool-wait diagnostic honestly.

**Acceptance checks:**
- Native and controller execution survive beyond old fixed allowances while meaningful activity continues or a verified tool remains active; no deadlineMs/stallMs/task budget is introduced.
- After tool completion normal model-wait inactivity applies; actual idle expiry becomes the coordinator-owned technical failure path and late output cannot commit.
- Polling, heartbeats and process presence do not renew grace; tool failures/process exit remain actionable; all clocks/timers/resources stop with the unit/job.

### 1.7 TASK-9b04adb36cac716d-s2-t7 — Expose recovery and failure through normal MCP and IPC

Wire strict recover/failure phases into current MCP schema/handler, step/RPC dispatch, main-owned unary method registration/router classifications, repo audit coverage and canonical steering. Route recover before unconditional exchange owner gating, resolving native provider as start does and requiring trusted connection for controller recovery. Expose bounded paused/interrupted/invalidation progress and preserve controller connection semantics.

**Acceptance checks:**
- Normal insrc_review_step and designReview.recover/failure reach the same main-owner coordinator with strict repo/schema/phase enforcement.
- Native recovery does not require an exchange owner; controller recovery/failure requires actual trusted owner and never allows observers to steal work. Independent subjects can progress without duplicate same-review execution.
- Guides/schema discovery explain action replay, explicit retrigger, three retries then pause, user-approved restart and no intermediate corrections; retired APIs still raise PENDING REVIEW RE-IMPLEMENTATION.
- Progress is bounded metadata by default, reports active unit/retries/reason/input requirement and preserves one-result paging without baseline/history leakage.

### 1.8 TASK-9b04adb36cac716d-s2-t8 — Qualify compiled recovery flows and document evidence

Extend the isolated compiled smoke harness and normal stdio MCP/Unix IPC tests for interruption/recovery, retries/exhaustion/user direction, subject invalidation and active tools. Record production build, focused regressions and synthetic evidence; update design-review execution documentation and maintain the approved sequence definition if implementation changes its flow. Do not restart the installed daemon or require repeated hosted calls for deterministic tests.

**Acceptance checks:**
- Compiled fake-CLI normal MCP/IPC scenarios demonstrate no duplicate accepted-chunk model calls, correct retry counts/pause, exact recovery replay and sticky invalidation with retrievable feedback.
- Epic/Standalone/Issue contexts, native/controller parity and session/main-owner routes are exercised with disposable project/home/socket fixtures.
- Production build and scoped contract/coordinator/controller/checkpoint/MCP/route regressions pass, with recorded commands and case-level evidence; synthetic versus hosted execution is explicit.
- S3 selective impact and S4 lifecycle/history publication/cleanup remain deferred; no code-review engine or shared provider changes are included.
- All test daemon lifecycle operations target only disposable fixtures; no installed-daemon shutdown/restart/update or broad hosted test sweep is permitted as qualification.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Resume unchanged interrupted native/controller reviews without repeating accepted chunks or planning; report-only recovery makes zero model calls. | `t3` |
| Automatic technical retry budget is initial plus three, scoped to one failed planning/chunk unit; diagnostics propagate and semantic findings/incomplete results never retry. | `t4` |
| Crash-safe reservation and exact recovery replay preserve counters; exhausted recovery needs one-launch user direction and cannot reset automatic budget. | `t2`, `t3`, `t4` |
| Subject monitor invalidates during a stalled model/tool and after rename; restored bytes cannot revive a latched attempt; late output and final-report races are fenced. | `t5` |
| External-reference/source edits are ignored; Epic/Standalone/Issue recovery preserves admitted context and full restart resolves current proper prerequisites. | `t3`, `t5`, `t8` |
| Activity policy has no fixed deadline, ignores polling/heartbeats/liveness, tolerates separately tracked long-running tools and expires true idle waits at30minutes. | `t6` |
| Bounded checkpoint schema and immutability reject foreign/corrupt/oversized state, decreasing counters, missing action decisions and changed prior attempts. | `t1`, `t2` |
| Completed-unit retry summaries survive later successful units/full restart; one-launch action outcomes fill once and remain immutable. | `t2`, `t4` |
| recover/failure phase shapes, valid actionId replay and invalid enum/decision/identity/attempt/size inputs | `t1`, `t3`, `t4` |
| S1 checkpoint compatibility; new optional sc3 state and bounded metadata-only progress | `t1`, `t2`, `t7` |
| Identical accepted outputs and retry/pause transitions across both reviewer parties | `t4`, `t6`, `t8` |
| recover wire discriminator and operation are independent; native recover routes before exchange owner guard, controller recovery requires trusted identity; direct save/commit preserve domain-vs-I/O errors and missing_checkpoint. | `t2`, `t3`, `t7` |
| Normal stdio MCP/Unix IPC recover/failure routes remain main-owned; native request disconnect survives, controller disconnect requires explicit trusted rebind. | `t7`, `t8` |
| Interrupted job reconstruction with preserved completed chunks and final report retrieval | `t3`, `t8` |
| Two-session recovery conflicts, request-independent native execution and stale owner refusal | `t3`, `t7`, `t8` |
| Compiled fake-CLI interrupted review recovery, technical retries/exhaustion/user action, subject invalidation and zero duplicate accepted-chunk calls | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S002/LLD.md`
- **[[c2]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S002/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S002/LLD.md#6-error-paths`
- **[[c4]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S002/LLD.md#7-test-strategy`
