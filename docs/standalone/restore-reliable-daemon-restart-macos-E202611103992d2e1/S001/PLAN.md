<!-- insrc:artifact PLAN-3992d2e1e26124dc-s1 -->

# Plan: STORY-3992d2e1e26124dc-s1

## Summary

**Epic:** `restore-reliable-daemon-restart-macos`
**LLD run:** `wf-1794309468868-i54ru4`
**LLD effective hash:** `623425ce0d85...`

Build the installed macOS supervisor and route existing shell, TUI, and daemon lifecycle paths through it. Add rollback-compatible update validation, durable recovery, and correlated completion in VS Code and JetBrains. Run targeted tests per task, then qualify the installed route and run the full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define the managed lifecycle wire contract | S | — | — | unit: Wrong peer, root and generation; unit: Protocol version, frame bounds, channel role and request correlation; unit: Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors; unit: Lease token, channel and generation mismatch; unit: Update lock, version refusal and terminal outcome; unit: Missing, misplaced, reused and stale lease tokens; unit: Hello negotiates the highest common version and rejects peer identity mismatch, malformed hello and empty overlap | [[c1]] |
| 2 | **`t2`** Add Darwin job and peer identity primitives | M | — | — | unit: Wrong peer, root and generation; unit: Idle stop, launch-domain refusal, missing runtime, reserved watchdog capacity and confirmed failed-exit classification; unit: Hello negotiates the highest common version and rejects peer identity mismatch, malformed hello and empty overlap; unit: Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication; integration: Recovery job and legacy migration; integration: Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog; integration: Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker; integration: Distinct test roots reject cross-root control and label collisions; integration: Legacy socket peer UID or PID differs from the registered process incarnation | [[c2]] [[c6]] |
| 3 | **`t3`** Implement the installation mutation gate and journal | M | — | `t1`, `t2` | unit: Update lock, version refusal and terminal outcome; unit: Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication; unit: Crash recovery classifies the durable outcome before deciding rollback or activation; integration: Supervisor loss, concurrent restart and stale files; integration: Race competing start, stop, raw shutdown and update against both supervisor versions; integration: Kill the controller at reservation, job registration, probation, and after outcome publication; integration: Public RPC arm gets busy during update while an admitted drain and local signal preserve their watchdog path | [[c1]] [[c4]] [[c6]] |
| 4 | **`t4`** Implement the supervisor child lifecycle | M | — | `t1`, `t2`, `t3` | unit: Wrong peer, root and generation; unit: Monotonic deadline, repeated requests and grace versus forced outcome; unit: Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors; unit: Idle stop, launch-domain refusal, missing runtime, reserved watchdog capacity and confirmed failed-exit classification; unit: Startup readiness race and unconfirmed forced reap; integration: Hung before shutdown reply and hung native close after watchdog readiness; integration: Supervisor loss, concurrent restart and stale files; integration: Delayed controller cannot stop the replacement generation; integration: Kill startup child before PID, after PID, and after socket publication before ready; integration: Fresh supervisor first start requires durable predecessor evidence and an admitted owner | [[c1]] [[c2]] |
| 5 | **`t5`** Delegate the run-file guard for managed children | M | — | `t4` | unit: Guarded stale run files and replacement ownership; unit: Lease token, channel and generation mismatch; unit: Startup readiness race and unconfirmed forced reap; unit: Missing, misplaced, reused and stale lease tokens; unit: Queued release before and after escalation preserves shutdown guard; integration: Hung before shutdown reply and hung native close after watchdog readiness; integration: Supervisor loss, concurrent restart and stale files; integration: Hold a client connection open during managed server.close and confirm forced reap releases the supervisor guard and permits exactly one restart; integration: Kill startup child before PID, after PID, and after socket publication before ready; integration: Kill the supervisor while it owns the guard and verify fail-closed operator recovery | [[c3]] |
| 6 | **`t6`** Wire managed daemon readiness, shutdown and watchdog | M | — | `t3`, `t4`, `t5` | unit: Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors; unit: Idle stop, launch-domain refusal, missing runtime, reserved watchdog capacity and confirmed failed-exit classification; integration: IPC and signal shutdown with no controller; integration: Hung before shutdown reply and hung native close after watchdog readiness; integration: Linux existing pidfd and watchdog suites; integration: Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog; integration: Hold a client connection open during managed server.close and confirm forced reap releases the supervisor guard and permits exactly one restart; integration: Race competing start, stop, raw shutdown and update against both supervisor versions; integration: Public RPC arm gets busy during update while an admitted drain and local signal preserve their watchdog path | [[c1]] [[c3]] [[c4]] |
| 7 | **`t7`** Route installed shell and TUI lifecycle through the supervisor | M | — | `t2`, `t3`, `t4`, `t6` | integration: Normal CLI and shell restart; integration: Recovery job and legacy migration; integration: Delayed controller cannot stop the replacement generation; integration: Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog; integration: Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker; integration: Distinct test roots reject cross-root control and label collisions; integration: Kill the supervisor while it owns the guard and verify fail-closed operator recovery; integration: Legacy socket peer UID or PID differs from the registered process incarnation; integration: Installed shell restart sends one stop and one start bound to the same predecessor | [[c1]] [[c2]] [[c4]] [[c6]] |
| 8 | **`t8`** Enforce rollback-compatible startup and probation | M | — | `t3`, `t5`, `t6` | unit: Compatibility declaration and read-only quiesced check refuse unknown or migration-bearing pairs; integration: Hold application RPCs and indexing until matching durable success across threaded and non-threaded status paths; integration: Inject upgrade with a newer graph schema and verify the old daemon can still open the unchanged store | [[c4]] [[c5]] [[c6]] |
| 9 | **`t9`** Stage releases and hand off the launch job | M | — | `t3`, `t7`, `t8` | integration: Rollback after legacy stop but before managed readiness restores the saved service; integration: Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change; integration: Fail hello after candidate job registration before child start, remove the candidate job and restore the prior release; integration: Race competing start, stop, raw shutdown and update against both supervisor versions; integration: Kill the controller at reservation, job registration, probation, and after outcome publication; integration: Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success; integration: Fresh supervisor first start requires durable predecessor evidence and an admitted owner; integration: Lost update acknowledgement neither permits an unacknowledged helper to mutate before response write nor triggers duplicate admission | [[c4]] [[c5]] [[c6]] |
| 10 | **`t10`** Commit or recover the managed update transaction | M | — | `t9` | unit: Update lock, version refusal and terminal outcome; unit: Terminal outcome and marker ordering, including persistence failure; unit: Crash recovery classifies the durable outcome before deciding rollback or activation; integration: Rollback after legacy stop but before managed readiness restores the saved service; integration: Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change; integration: Observe in-flight status throughout injected rollback, then exactly one terminal outcome after restored readiness or a durable operator-recovery decision; integration: Fail hello after candidate job registration before child start, remove the candidate job and restore the prior release; integration: Inject upgrade with a newer graph schema and verify the old daemon can still open the unchanged store; integration: Kill the controller at reservation, job registration, probation, and after outcome publication; integration: Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success | [[c4]] [[c5]] [[c6]] |
| 11 | **`t11`** Project managed update state through daemon IPC | M | — | `t8`, `t10` | unit: Terminal outcome and marker ordering, including persistence failure; integration: Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change; integration: Observe in-flight status throughout injected rollback, then exactly one terminal outcome after restored readiness or a durable operator-recovery decision; integration: Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows; integration: Hold application RPCs and indexing until matching durable success across threaded and non-threaded status paths; integration: Lost update acknowledgement neither permits an unacknowledged helper to mutate before response write nor triggers duplicate admission | [[c4]] [[c7]] |
| 12 | **`t12`** Correlate update confirmation in VS Code and JetBrains | M | — | `t11` | unit: Correlated update outcomes ignore unrelated terminal records and changed installedCommit; integration: Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows; integration: Lost update acknowledgement neither permits an unacknowledged helper to mutate before response write nor triggers duplicate admission | [[c7]] |
| 13 | **`t13`** Qualify installed rollout and run the final sweep | M | — | `t7`, `t10`, `t11`, `t12` | integration: Linux existing pidfd and watchdog suites; smoke: Install or upgrade into supported launchd domain; smoke: Normal and blocked shutdown complete with verified generation change; smoke: Restart leaves one daemon and serves status and indexing; smoke: Stopped daemon remains stopped and rollback preserves state; smoke: On the installed Apple Silicon build recover stale owned PID and socket files and refuse files belonging to a replacement; smoke: Real macOS migration exit observation and restoration after injected pre-readiness failure; smoke: Apple Silicon real blocked-close guard recovery and boot timeout after partial publication; smoke: Apple Silicon installed update across a supervisor version change with injected rollback | [[c2]] [[c3]] [[c6]] [[c8]] |

### 1.1 TASK-3992d2e1e26124dc-s1-t1 — Define the managed lifecycle wire contract

Implement bounded frame parsing, stable hello negotiation, typed requests and receipts, operation-specific field validation, and the controller and inherited channel roles.

**Acceptance checks:**
- A mismatched release or version cannot issue a lifecycle command
- Lease, update and drain fields are accepted only for the documented operations

### 1.2 TASK-3992d2e1e26124dc-s1-t2 — Add Darwin job and peer identity primitives

Implement the narrow Darwin support for Unix peer PID and UID, process incarnation, read-only exit observation and verified per-user launch-job ownership. Package the platform-specific entry points and keep the Linux process broker unchanged.

**Acceptance checks:**
- Peer mismatch, reused PID, wrong launch domain and unverified job removal fail closed
- Darwin observations work without a Mach task right and Linux packaging remains intact

### 1.3 TASK-3992d2e1e26124dc-s1-t3 — Implement the installation mutation gate and journal

Add installation-local arbitration, durable controller identity and reservations, transaction stages and recovery decisions. Serialize ordinary restart as a single reservation. Bind each mutation to the current owner and update ID where applicable.

**Acceptance checks:**
- Stale sockets, reused owner PID, unrelated controllers and orphan reservations cannot mutate
- Recovery branches on the matching durable outcome before any destructive action

### 1.4 TASK-3992d2e1e26124dc-s1-t4 — Implement the supervisor child lifecycle

Build the per-user parent state machine, pinned child spawn, inherited channel, start/stop deadlines, exact escalation and reap, confirmed receipts and predecessor-bound replay. Start the supervisor idle and require journaled predecessor evidence during replacement.

**Acceptance checks:**
- A hung or partially initialized child cannot be replaced before exact reap
- An old stop or readiness frame cannot act on a newer generation

### 1.5 TASK-3992d2e1e26124dc-s1-t5 — Delegate the run-file guard for managed children

Have the supervisor own the existing guard and issue generation-scoped grants for child startup and listener close. Capture partial publication and reconcile only identity-proven files before releasing the guard.

**Acceptance checks:**
- Forced close and partial startup release the supervisor-owned guard only after verified reap and reconciliation
- Foreign or orphan guard and legacy Linux behavior remain fail-closed

### 1.6 TASK-3992d2e1e26124dc-s1-t6 — Wire managed daemon readiness, shutdown and watchdog

Integrate inherited ready/drain/arm and public shutdown admission in the daemon and both dispatch modes. Preserve local-signal emergency behavior and legacy/Linux broker routes. Avoid enabling installed rollout until the controller and updater are wired.

**Acceptance checks:**
- Public shutdown cannot bypass an update reservation
- Admitted drains and local signals keep independent generation-bound deadlines, with no managed Mach broker call

### 1.7 TASK-3992d2e1e26124dc-s1-t7 — Route installed shell and TUI lifecycle through the supervisor

Use one predecessor-bound restart in both entry points, stage the per-user launch job and require verified quiescence for legacy cutover. Add status and operator recovery access independent of a live daemon. Keep installed activation gated on end-to-end rollout readiness.

**Acceptance checks:**
- Start, stop and restart share the installation gate and do not issue a second stop
- CLI status shows recovery state when the daemon socket is unavailable

### 1.8 TASK-3992d2e1e26124dc-s1-t8 — Enforce rollback-compatible startup and probation

Define the release compatibility declarations and read-only quiesced checks. Validate before live boot effects. Gate graph migrations, cleanup, indexing and normal IPC until the candidate observes matching durable success.

**Acceptance checks:**
- A newer graph schema or an unqualified release is refused before candidate writes
- Candidate readiness verifies store opens and paused indexer initialization with no production indexing

### 1.9 TASK-3992d2e1e26124dc-s1-t9 — Stage releases and hand off the launch job

Pin releases, stage the detached helper behind the acknowledgement handoff and journal job admission separately from child launch. Verify old job exit and new handshake, then start and validate the candidate in probation. Return exact stage receipts for commit and rollback.

**Acceptance checks:**
- The helper cannot mutate before acknowledgement handoff
- An ambiguous launch registration or failed hello produces a bounded, identity-scoped handoff receipt
- Candidate admission records exact predecessor evidence and keeps the release selector provisional

### 1.10 TASK-3992d2e1e26124dc-s1-t10 — Commit or recover the managed update transaction

Use the journal to commit, roll back or retain a recovery fence. Verify candidate job removal and predecessor restoration, atomically write one outcome, and allow post-commit recovery to finish activation without rollback.

**Acceptance checks:**
- Failed hello after registration removes only the verified candidate job before restoring the prior release
- Controller loss before commit rolls back only with verified ownership; loss after commit preserves the selected release
- Unresolved ownership remains fenced and a terminal outcome appears only after the verified decision

### 1.11 TASK-3992d2e1e26124dc-s1-t11 — Project managed update state through daemon IPC

Publish optional update IDs in managed acknowledgements and outcomes. Use a shared request-time installed-commit projection for threaded and non-threaded status. Preserve the existing fields and unmanaged behavior.

**Acceptance checks:**
- The candidate commit remains hidden from old clients until durable success
- A matching terminal outcome and status report the committed or restored release consistently

### 1.12 TASK-3992d2e1e26124dc-s1-t12 — Correlate update confirmation in VS Code and JetBrains

Both IDEs confirm managed transactions only on their acknowledged update ID and show pending confirmation when the outcome cannot be retrieved. Keep the existing fallback for legacy responses.

**Acceptance checks:**
- Changed installedCommit and unrelated terminal results do not confirm a managed update
- Both IDEs handle rollback, lost acknowledgement and a legacy daemon

### 1.13 TASK-3992d2e1e26124dc-s1-t13 — Qualify installed rollout and run the final sweep

Exercise the installed macOS LaunchAgent on disposable roots and regular Apple Silicon, including hung close, partial boot, legacy cutover, version-changing rollback and recovery. Verify Linux regressions, then run the complete sweep after all implementation tasks.

**Acceptance checks:**
- Installed smoke proves verified generation change and safe rollback
- All implementation tasks have relevant targeted test evidence before the final sweep
- Managed installed activation is release-qualified only after the installed smoke and regression checks pass

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Wrong peer, root and generation | `t1`, `t2`, `t4` |
| Monotonic deadline, repeated requests and grace versus forced outcome | `t4` |
| Guarded stale run files and replacement ownership | `t5` |
| Protocol version, frame bounds, channel role and request correlation | `t1` |
| Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors | `t1`, `t4`, `t6` |
| Idle stop, launch-domain refusal, missing runtime, reserved watchdog capacity and confirmed failed-exit classification | `t2`, `t4`, `t6` |
| Lease token, channel and generation mismatch | `t1`, `t5` |
| Startup readiness race and unconfirmed forced reap | `t4`, `t5` |
| Update lock, version refusal and terminal outcome | `t1`, `t3`, `t10` |
| Missing, misplaced, reused and stale lease tokens | `t1`, `t5` |
| Queued release before and after escalation preserves shutdown guard | `t5` |
| Terminal outcome and marker ordering, including persistence failure | `t10`, `t11` |
| Hello negotiates the highest common version and rejects peer identity mismatch, malformed hello and empty overlap | `t1`, `t2` |
| Correlated update outcomes ignore unrelated terminal records and changed installedCommit | `t12` |
| Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication | `t2`, `t3` |
| Compatibility declaration and read-only quiesced check refuse unknown or migration-bearing pairs | `t8` |
| Crash recovery classifies the durable outcome before deciding rollback or activation | `t3`, `t10` |
| Normal CLI and shell restart | `t7` |
| IPC and signal shutdown with no controller | `t6` |
| Hung before shutdown reply and hung native close after watchdog readiness | `t4`, `t5`, `t6` |
| Supervisor loss, concurrent restart and stale files | `t3`, `t4`, `t5` |
| Recovery job and legacy migration | `t2`, `t7` |
| Linux existing pidfd and watchdog suites | `t6`, `t13` |
| Delayed controller cannot stop the replacement generation | `t4`, `t7` |
| Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog | `t2`, `t6`, `t7` |
| Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker | `t2`, `t7` |
| Rollback after legacy stop but before managed readiness restores the saved service | `t9`, `t10` |
| Distinct test roots reject cross-root control and label collisions | `t2`, `t7` |
| Hold a client connection open during managed server.close and confirm forced reap releases the supervisor guard and permits exactly one restart | `t5`, `t6` |
| Kill startup child before PID, after PID, and after socket publication before ready | `t4`, `t5` |
| Kill the supervisor while it owns the guard and verify fail-closed operator recovery | `t5`, `t7` |
| Legacy socket peer UID or PID differs from the registered process incarnation | `t2`, `t7` |
| Installed shell restart sends one stop and one start bound to the same predecessor | `t7` |
| Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change | `t9`, `t10`, `t11` |
| Observe in-flight status throughout injected rollback, then exactly one terminal outcome after restored readiness or a durable operator-recovery decision | `t10`, `t11` |
| Fail hello after candidate job registration before child start, remove the candidate job and restore the prior release | `t9`, `t10` |
| Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows | `t11`, `t12` |
| Hold application RPCs and indexing until matching durable success across threaded and non-threaded status paths | `t8`, `t11` |
| Inject upgrade with a newer graph schema and verify the old daemon can still open the unchanged store | `t8`, `t10` |
| Race competing start, stop, raw shutdown and update against both supervisor versions | `t3`, `t6`, `t9` |
| Kill the controller at reservation, job registration, probation, and after outcome publication | `t3`, `t9`, `t10` |
| Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success | `t9`, `t10` |
| Fresh supervisor first start requires durable predecessor evidence and an admitted owner | `t4`, `t9` |
| Public RPC arm gets busy during update while an admitted drain and local signal preserve their watchdog path | `t3`, `t6` |
| Lost update acknowledgement neither permits an unacknowledged helper to mutate before response write nor triggers duplicate admission | `t9`, `t11`, `t12` |
| Install or upgrade into supported launchd domain | `t13` |
| Normal and blocked shutdown complete with verified generation change | `t13` |
| Restart leaves one daemon and serves status and indexing | `t13` |
| Stopped daemon remains stopped and rollback preserves state | `t13` |
| On the installed Apple Silicon build recover stale owned PID and socket files and refuse files belonging to a replacement | `t13` |
| Real macOS migration exit observation and restoration after injected pre-readiness failure | `t13` |
| Apple Silicon real blocked-close guard recovery and boot timeout after partial publication | `t13` |
| Apple Silicon installed update across a supervisor version change with injected rollback | `t13` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 §3.2 Supervisor lifecycle and stop receipt and §2 lifecycle contracts`
- **[[c2]]** `prior-artifact` `LLD s1 §3.1 Managed macOS daemon instance and §7 launch domain and legacy identity`
- **[[c3]]** `prior-artifact` `LLD s1 §3.3 PID and socket run files`
- **[[c4]]** `prior-artifact` `LLD s1 §3.5 Installation update admission and recovery and §5 error paths`
- **[[c5]]** `prior-artifact` `LLD s1 §3.6 Managed update storage preflight`
- **[[c6]]** `prior-artifact` `LLD s1 §7 Migration and rollback`
- **[[c7]]** `prior-artifact` `LLD s1 §3.4 Managed update confirmation`
- **[[c8]]** `prior-artifact` `LLD s1 §6 Test strategy`
