<!-- insrc:artifact PLAN-206db3426ffd4428-s1 -->

# Plan: STORY-206db3426ffd4428-s1

## Summary

**Epic:** `show-long-running-task-progress-chat`
**LLD run:** `wf-1794217074628-a5xufy`
**LLD effective hash:** `48a6a5468b45...`

Build the daemon foundation for observing long-running tasks without taking ownership of their execution. Add bounded durable observations, trusted origin admission, fenced updates, and a shared 60-second fallback schedule. Verify the foundation through targeted tests, then run one full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define shared progress contracts and bounded task storage | M | — | — | integration: Recover bounded snapshots across storage failure, restart and owner revalidation | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Implement producer admission, ownership and measurement normalization | M | — | `t1` | unit: Fence async refresh, duplicate registration and old attempt callbacks; unit: Meaningful measurement normalization across two tasks with phase and count changes, declared units, unknown totals, duplicate samples, reads and heartbeats | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Bootstrap trusted IPC origins and enforce scoped observer access | M | — | `t2` | integration: Reject cross-project and cross-conversation reads, controls and raw details; integration: Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal; integration: First observer grant requires daemon-owned origin bootstrap or an existing origin capability | [[c1]] [[c4]] |
| 4 | **`t4`** Implement activity leases, restart recovery and fallback scheduling | M | — | `t2`, `t3` | unit: Verify monotonic 60-second fallback, transfer, suspension and unchanged suppression; unit: Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks; unit: Fence scheduler claim, renew, release, duplicate slots and late replies across transfer with deterministic 60-second cadence and 120-second expiry; integration: Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination | [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Wire scoped observation controls and qualify end-to-end behavior | M | — | `t3`, `t4` | unit: Check stop, cancel replay and verified completion races; integration: Saturate per-project active/inactive and global reservations, coalesce full observer queues, and preserve terminal delivery and running execution; integration: Verify S001/#42 to s1–s2, S002/#43 to s6 and S003/#44 to s5 from local predecessor records and successor scope | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 6 | **`t6`** Run the final build and full sweep | S | — | `t5` | smoke: Verify merged-baseline root build and single full repository sweep with recorded results and disposition of any failures | [[c3]] [[c6]] |

### 1.1 TASK-206db3426ffd4428-s1-t1 — Define shared progress contracts and bounded task storage

Add the daemon-private versioned per-task record, codecs, reservation accounting and durable publication seam.

**Acceptance checks:**
- Persist one validated envelope per task using private paths, exclusive temporary files, flush–rename–directory flush, and restart-safe reads. Do not expose raw credentials, prompts or logs.
- Reserve encoded snapshot and terminal capacity before admitting observation. Enforce per-project and global limits, recover or quarantine corrupt records within budget, and fail observation visibly without stopping the executor.
- Preserve existing IPC, workflow and executor state. Retain deterministic file-fault tests for failures before and after rename.

### 1.2 TASK-206db3426ffd4428-s1-t2 — Implement producer admission, ownership and measurement normalization

Connect trusted internal producer registration, attempt rollover and owner fencing to scoped snapshots and a shared progress revision.

**Acceptance checks:**
- Admit a producer only through an in-process trusted launch, retry or survival decision. Commit identity before issuing an owner handle. Fence asynchronous refresh, duplicates, obsolete owner epochs and terminal transitions.
- With two independent tasks, prove phase or count changes advance only the affected task's meaningful revision and retain declared units, unknown totals and milestones. A duplicate sample with a newer query timestamp, a heartbeat or a read keeps the prior revision and original measurement age.
- Persist authoritative lifecycle and terminal results before publication. Keep delegate reads side-effect free and keep concrete adapters with their sibling stories.

### 1.3 TASK-206db3426ffd4428-s1-t3 — Bootstrap trusted IPC origins and enforce scoped observer access

Define and implement the first-grant authorization boundary and the read, subscribe and reattach surface.

**Acceptance checks:**
- Use daemon-generated socket identity and the canonical registered project. Permit a live local connection to create a fresh origin under its admitted project. The daemon mints the origin identity and returns a scoped capability on that connection. Existing origins can be bound only through a server-held ownership binding or a validated capability issued at creation. A repo path, label, PID, chat ID or task ID alone never authorizes an existing origin.
- Mint first task grants only after trusted launch binds the originating connection to the daemon-owned invocation. Deny forged and cross-conversation claims, and cover ordinary unauthorized IPC and valid bootstrap with integration tests.
- Recheck scope and permission on every read, subscription, detail or control. Persist only bounded grant digests, bind each reattachment to its current connection, and revoke conversation access durably while preserving an independently scoped read-only project-history grant.

### 1.4 TASK-206db3426ffd4428-s1-t4 — Implement activity leases, restart recovery and fallback scheduling

Keep executor-owned activity distinct from the fixed 60-second fallback scheduler and reclaim stale observation capacity.

**Acceptance checks:**
- Verify 30-second owner renewal and 120-second expiry without observers, including multiple tasks in one conversation, selective release, and stale callbacks. Readers cannot renew owner activity.
- Recover the last verified committed snapshot, preserve the first bounded owner-loss deadline across restarts and fence old epochs. After expiry release active capacity and retain an explicit bounded unknown observation when capacity allows. Never infer a terminal execution result or relaunch work.
- Keep one opted-in scheduler per stable task. Verify anchored 60-second slots, 120-second scheduler lease expiry, disconnect and handoff, in-flight fencing, no catch-up burst, and separate terminal shutdown.

### 1.5 TASK-206db3426ffd4428-s1-t5 — Wire scoped observation controls and qualify end-to-end behavior

Finish the daemon foundation over normal entry points and verify cross-task recovery and predecessor traceability.

**Acceptance checks:**
- Expose authorized stop-observation and explicit cancellation through normal daemon entry points. Stop detaches only its observer. Persist cancel-pending, suppress duplicate requests, and keep verified terminal outcomes immutable.
- With a full subscriber queue, coalesce progress, give explicit resync and preserve terminal delivery. Exercise fail-open execution at observation admission limits and file failure.
- Verify July S001/#42 maps to s1–s2, S002/#43 to s6, and S003/#44 to s5 using the predecessor story records and current scope. Leave tracker disposition separate.

### 1.6 TASK-206db3426ffd4428-s1-t6 — Run the final build and full sweep

After targeted validation is complete, run the root build and the combined backend and project-memory test sweep once.

**Acceptance checks:**
- Record build and full-sweep commands, revision, results, failures, skips and cancellations. Investigate any in-scope regression before code review and retain the original sweep outcome.
- Keep unrelated baseline failure evidence separate and require explicit disposition for any gate exception. Document any skipped live environments and the remaining sibling scope.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Fence async refresh, duplicate registration and old attempt callbacks | `t2` |
| Verify monotonic 60-second fallback, transfer, suspension and unchanged suppression | `t4` |
| Check stop, cancel replay and verified completion races | `t5` |
| Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks | `t4` |
| Fence scheduler claim, renew, release, duplicate slots and late replies across transfer with deterministic 60-second cadence and 120-second expiry | `t4` |
| Recover bounded snapshots across storage failure, restart and owner revalidation | `t1` |
| Reject cross-project and cross-conversation reads, controls and raw details | `t3` |
| Saturate per-project active/inactive and global reservations, coalesce full observer queues, and preserve terminal delivery and running execution | `t5` |
| Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination | `t4` |
| Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal | `t3` |
| Verify S001/#42 to s1–s2, S002/#43 to s6 and S003/#44 to s5 from local predecessor records and successor scope | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/LLD.md#6-error-paths`
- **[[c4]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/LLD.md#7-test-strategy`
- **[[c5]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/LLD.md#5-interaction-with-shared-contracts`
- **[[c6]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/LLD.md#8-migration`
