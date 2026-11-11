<!-- insrc:artifact LLD-3992d2e1e26124dc-s1 -->

# LLD: STORY-3992d2e1e26124dc-s1 — Restore reliable daemon restart on macOS

## Summary

**Epic:** `restore-reliable-daemon-restart-macos`
**Design provenance:** Standalone issue design.

Run the installed macOS daemon as the child of a dedicated per-user LaunchAgent supervisor [[c12]]. The supervisor handles shell and CLI/TUI start and stop, and independently bounds the daemon’s own graceful shutdown. Linux keeps its existing pidfd lifecycle. This standalone design has no parent HLD.

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

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `stopDaemon`

```typescript
stopDaemon(over?: Partial<StopDeps>): Promise<StopOutcome>
```

**Parameters:**
- `over: Partial<StopDeps>` _(optional)_ — Existing lifecycle test seam.

**Returns:** `Promise<StopOutcome>` — Confirmed graceful or forced exit of the original generation. Failed exit is surfaced as daemon-exit-failed, with the exit receipt attached.

**Errors:**
- `LifecycleError<'ownership-conflict'>` when The supervisor peer, installation, expected generation or guarded run files do not match.
- `LifecycleError<'exit-unconfirmed'>` when The original generation has no confirmed reap within the forced-stop bound.
- `LifecycleError<'supervisor-unavailable'>` when No authenticated managed supervisor is reachable.
- `LifecycleError<'not-running'>` when The authenticated supervisor has no active generation. The TUI stop action reports that the daemon is already stopped. The shell stop bridge translates this condition into idempotent success before restart, matching its existing behavior [[c13]].
- `LifecycleError<'daemon-exit-failed'>` when The supervisor proved exact reap and cleanup, but the child exited with a crash or error instead of a clean drain or supervisor escalation. Surface the error and require a separate explicit start after verified cleanup.
- `LifecycleError<'busy'>` when The controller request was refused before admission due to bounded capacity. No stop deadline was armed by this request.

**Preconditions:**
- Resolve the installed daemon and bind the authenticated supervisor to the original generation [[c3]] [[c4]]. Managed Darwin obtains exit evidence from the supervisor’s direct child relationship using waitpid and never calls captureStopTarget or the native process broker [[c9]] [[c10]].

**Postconditions:**
- A stop receipt alone never authorizes cleanup or restart. Use confirmed child reap and guarded file reconciliation for the exact original generation [[c7]].

### 2.2 `armShutdownWatchdog`

```typescript
armShutdownWatchdog(options: WatchdogOptions): Promise<ShutdownWatchdog>
```

**Parameters:**
- `options: WatchdogOptions` — Existing deadline, diagnostics and readiness settings.

**Returns:** `Promise<ShutdownWatchdog>` — Acknowledged independent watchdog bound to the actual daemon instance.

**Errors:**
- `LifecycleError<'watchdog-timeout'>` when No valid arm acknowledgement arrives within the readiness bound.
- `LifecycleError<'watchdog-channel'>` when The inherited supervisor channel is missing or closes before acknowledgement.
- `LifecycleError<'watchdog-protocol'>` when The reply version, request correlation or child generation is invalid.
- `LifecycleError<'busy'>` when A managed public shutdown RPC was refused admission because an installation lifecycle reservation is active. No drain starts.

**Preconditions:**
- Managed Darwin arms the deadline through the authenticated inherited parent channel without launching the native process broker or the independent Linux watchdog helper. brokerPath is only for the existing broker-backed watchdog branch [[c6]] [[c8]] [[c10]].

**Postconditions:**
- The daemon enters its existing drain only after receiving an acknowledgement for its own generation. The deadline remains armed through native exit hooks [[c5]].

### 2.3 `startDaemon`

```typescript
startDaemon(): Promise<StartResult>
```

**Returns:** `Promise<StartResult>` — Existing readiness result for an already-ready or newly verified generation. started false means the attempted child is confirmed absent or reaped and its guarded files are reconciled. An unconfirmed exit or conflicting cleanup rejects explicitly and blocks replacement.

**Errors:**
- `LifecycleError<'launch-domain-unavailable'>` when No supported per-user GUI launch domain, or loading the verified job is denied.
- `LifecycleError<'runtime-unavailable'>` when The configured absolute Node executable or compiled entry fails validation before launch.
- `LifecycleError<'ownership-conflict'>` when The installed root, service label, expected predecessor generation or run files belong to a different instance.
- `LifecycleError<'busy'>` when Admission capacity was exceeded before any replacement was started.
- `LifecycleError<'exit-unconfirmed'>` when The supervisor cannot prove the startup child has exited by the forced-stop bound. Keep the generation fenced and refuse subsequent start or rollback launch.

**Preconditions:**
- Validate the per-user launch domain, installed runtime and state root before any disruptive migration [[c4]] [[c11]] [[c12]] [[c13]].

**Postconditions:**
- Start publishes readiness only after the new child and its guarded run files are bound. The start caller never forks a second installed daemon.
- The supervisor starts a monotonic 60-second readiness deadline at spawn, independent of the child. On expiry, terminate only that unreaped child, allow up to five seconds for reap and reconcile its owned publication before returning a clean startup failure [[c17]] [[c19]].

## 3. Data model changes

### 3.1 `Managed macOS daemon instance` — new

One per-user job per installed state root hosts one supervisor that owns at most one unreaped daemon child. The supervisor spawns the exact absolute built entry and approved Node runtime with explicit working directory and installation environment. The child authenticates over an inherited private channel. The supervisor binds the daemon identity, a fresh generation identifier and the owned PID/socket publication before advertising ready. A single parent event loop serializes signal and reap. Only the unreaped child may be signalled by the supervisor. Controller callers cannot select a PID or move a stop to a replacement generation. An exited child has no termination authority. The TUI startDaemon and restart orchestration use the same installed controller as the shell start and stop bridge [[c4]] [[c11]] [[c13]] [[c14]]. Controller commands resolve the configured installation before connecting. Development mode retains its separately identified route. The supported rollout manages one production state root per user. Multiple concurrent production roots are out of scope. Qualification fixtures use explicit temporary roots with distinct job labels, private sockets and guards. Never use a label alone as identity. Reject a label or endpoint already bound to a different canonical root. Startup is ready only after the shutdown handlers and inherited control channel can accept commands, the status socket answers for the child, and its PID/socket pair is verified. The supervisor captures partial publication under its startup lease so readiness is never a prerequisite for cleanup. A stop during startup joins the existing generation fence and may cancel that startup. An absent readiness acknowledgement does not permit a second child.

**Call sites:**
- `src/cli/services/daemon.ts:65`
- `src/cli/services/maintenance.ts`
- `src/bin/insrc-daemon-control.ts`
- `scripts/daemon-ctl.sh`
- `src/daemon/run-file-ownership.ts`

### 3.2 `Supervisor lifecycle and stop receipt` — new

The private control socket is owner-only. Verify peer UID and the endpoint’s owned installation identity. Use an inherited per-child channel for daemon messages. The supervisor accepts child messages only on the channel it created for that child. For an admitted controller stop, arm the generation deadline before enqueueing drain on the inherited channel. Channel I/O and guard acquisition never block the supervisor event loop or the deadline. A full or broken child channel does not cancel an armed stop. The daemon routes the command into the same shutdown handler as the public RPC and signals [[c4]] [[c5]] [[c13]]. This prevents a delayed controller from sending shutdown to a replacement over the public socket. Public shutdown RPC requests admission through the inherited channel before starting drain. An ordinary signal keeps its emergency shutdown behavior for the owned generation. Signal-driven or unexpected child exit during probation aborts validation and fences replacement until reconciliation. Duplicate stop or arm requests join the first deadline. Deadline and waitpid handling are serialized by the parent. Escalation targets only the currently owned unreaped child. Reap records actual status and forced termination is reported only if escalation was sent and the observed exit matches it. Retain one last confirmed exit until the next generation is bound. Supervisor loss is an error and does not authorize cleanup or replacement without other trusted proof of the original exit. The installed shell and TUI restart capture one predecessor generation and keep that receipt through start. Split shell preparation from launch so restart never calls an internal second stop. A duplicate restart can join the successor for the same predecessor, but a stale request cannot stop or replace that successor. The daemon.update handler keeps its IPC shape and writes the existing terminal outcome through an independently launched per-user update controller. This controller survives both daemon exit and supervisor replacement, owns the update transaction, and uses the same generation-bound restart path. The managed daemon does not also schedule an independent self-shutdown for this update [[c14]] [[c21]] [[c22]].

```
The controller socket uses bounded UTF-8 JSON lines, one frame per message, 8 KiB maximum. Its first exchange uses a stable hello envelope independent of the lifecycle version. The inherited child channel uses the pinned lifecycle version of its matched release and never accepts hello.

Hello { hello: 1, id: string, supportedVersions: number[] }
HelloReply { hello: 1, id: string, installationRoot: string, releaseId: string, supportedVersions: number[], selectedVersion: number | null }

Each side sends a nonempty bounded list of distinct positive integer versions. The supervisor selects the highest common version or null and closes after a null response. The controller validates the correlation and selection, canonical root and pinned release, and independently verifies the kernel peer UID and process incarnation against the exact registered job and executable. Self-reported root and release alone convey no authority. On malformed hello, version disagreement, incompatible peer, or handshake timeout, close without lifecycle operations. Bind the negotiated version to that authenticated connection. Mutating commands travel only over the same connection, and reconnects always negotiate and revalidate. Each shipped update controller supports the hello envelope and lifecycle versions of both releases in its supported upgrade and rollback pair.

Lifecycle v1:
Request { v: 1, id: string, op: Op, generation: string | null, deadlineMs?: number, leaseToken?: string, updateId?: string, armSource?: ArmSource, drainId?: string }
Reply { v: 1, id: string, generation: string | null, ok: true, state: State, exit?: Exit, leaseToken?: string }
    or { v: 1, id: string, generation: string | null, ok: false, error: LifecycleErrorCode }
Op = status | start | stop | ready | arm | drain | guard-acquire | guard-release
ArmSource = public-rpc | signal | supervisor-drain
State = idle | starting | running | draining | exited
Exit { kind: graceful | forced | failed, code: number | null, signal: number | null }
LifecycleErrorCode = ownership-conflict | exit-unconfirmed | supervisor-unavailable |
                     watchdog-timeout | watchdog-channel | watchdog-protocol | busy |
                     not-running | daemon-exit-failed | launch-domain-unavailable | runtime-unavailable
LifecycleError { code: LifecycleErrorCode, message: string, generation: string | null, exit?: Exit }
For daemon-exit-failed the error includes the confirmed exit receipt. Errors never carry credentials.

Controller channel allows status, start and stop. Only update-owner start and stop carry updateId. It is a correlation value and grants no authority by itself. The supervisor checks the installation admission record and kernel client incarnation on every mutation, including on connections opened before the update. status with null discovers the active or last generation. stop requires the exact active generation. start requires the current exited generation, or null only when the supervisor has an empty generation slot and proved installation authority. On replacement, null additionally requires the active update owner and the verified predecessor-exit or no-child evidence in the journal. A bootstrapped supervisor starts idle, never starts a daemon on its own, and validates that evidence before accepting the first launch. With a stopped installation and completed update, ordinary explicit start may use null after verifying the committed idle installation. Serialize start and reject stale preconditions. Only one child can be starting or running. Return starting until child readiness and owned run-file publication are verified. Repeated start for the same predecessor returns the already-started generation.
Inherited channel allows child ready and arm, and supervisor drain. Arm requires armSource on the authenticated inherited child channel. supervisor-drain also requires drainId matching the request ID of the already admitted drain for that generation, and joins that deadline. public-rpc must pass the installation gate before the daemon proceeds. signal is reserved for the local OS signal handler, stays scoped to the current child and aborts uncommitted validation. Other messages forbid armSource and drainId. All carry the bound generation. ready supplies no caller-selected PID or paths. arm and stop accept an optional bounded relative deadline and latch the first admitted deadline for the generation. Arm acknowledgement reports draining and never means exited. Use the existing shutdown default when no override is supplied. No request can disarm or extend an admitted deadline.
Requests on the wrong channel, invalid fields, missing correlation or mismatched versions are protocol errors. Controller operations before hello completes are invalid. Stale generations are ownership conflicts. Bound pending requests and reject excess as busy. Drop incomplete frames on close. Status reports exited only after waitpid and guarded reconciliation.
Controller status, start and stop may return busy for capacity before admission. Inherited ready and arm traffic use reserved bounded capacity. An arm for public-rpc may return busy solely for an existing lifecycle reservation. Admitted supervisor-drain and local signal arms are never rejected for capacity or reservation. With no active generation stop returns not-running unless it is replaying the exact confirmed stop receipt. The confirmed failed-exit receipt remains readable but the restart operation stops and reports daemon-exit-failed. A later explicit start can use that exited generation as predecessor.
On the inherited channel, guard-acquire requires the bound generation and no leaseToken. Its success reply requires a fresh opaque leaseToken, or returns the active token for reentrant use. guard-release requires that same generation and leaseToken. All other requests and replies forbid leaseToken. Missing or unexpected fields are watchdog-protocol. A token that does not match the active grant is ownership-conflict. Guard operations use reserved capacity. guard-release relinquishes child access only. The supervisor owns the physical guard until the applicable readiness or exit condition in section 3.3.
```

**Call sites:**
- `src/cli/services/daemon.ts`
- `src/bin/insrc-daemon-control.ts`
- `src/daemon/shutdown.ts`
- `src/daemon/shutdown-watchdog.ts`
- `src/daemon/admin-handlers.ts`
- `src/daemon/update-runner.ts`
- `src/cli/services/maintenance.ts`

### 3.3 `PID and socket run files` — invariant-change

Keep the existing PID and socket paths, identity checks, and cross-process guard path. On managed Darwin the supervisor owns the guard and lends a generation-bound lease to the child for startup publication and listener close. The child verifies the guard identity and lease before mutating either path and reuses the lease for nested operations. The supervisor serializes grant, release, terminal transitions and reap on one event loop. Each child has at most one active grant on its own channel. A normal release revokes the child grant after its run-file work is complete and never removes the physical guard. For startup, the supervisor may release the physical guard only after verifying readiness and publication with the child grant relinquished. For shutdown it holds any acquired guard until exact reap and reconciliation. At startup timeout or shutdown escalation, the supervisor fences the generation and invalidates its grant before signalling. Reject later acquire, release and ready frames for that generation with ownership-conflict, including frames already queued at the deadline. A release processed before the terminal transition still cannot drop the shutdown guard. Do not clean while the child might still be mutating the files. It records the absent or prior identity of each path before spawn and acquires the child's publication identities under the same guard as each becomes visible. Only the trusted generation can publish while its startup lease is active. A socket created before a ready message can be reconciled under the still-held startup lease using the absence snapshot and exclusive publication evidence. Changed or unprovable files are preserved. On forced exit, the supervisor retains its own guard through exact reap and identity-checked cleanup, then releases it. Child death therefore leaves no child-owned orphan guard. If the supervisor itself dies while holding the guard, or an old build leaves an orphan, retain the existing fail-closed rule and require verified-dead operator quarantine of the exact guard. Never reclaim a foreign or unverifiable guard [[c7]] [[c17]] [[c18]] [[c19]] [[c23]]. Linux and unmanaged development keep their existing guard ownership and broker routing [[c6]] [[c8]] [[c9]] [[c10]] [[c15]].

**Call sites:**
- `src/daemon/run-file-ownership.ts`
- `src/cli/services/lifecycle.ts`
- `src/shared/daemon-process-client.ts`
- `src/shared/daemon-run-files.ts`
- `src/daemon/server.ts`
- `src/daemon/index.ts`

### 3.4 `Managed update confirmation` — invariant-change

Managed admission reserves the transaction before returning an acknowledgement. Its durable record includes the opaque update ID, the pre-update publicly reported installedCommit and the pinned releases. The acknowledged helper may start destructive work only after the daemon's response writer confirms the acknowledgement was handed to the existing socket and releases the helper over its private launch channel. If the acknowledgement cannot be sent, cancel the unstarted transaction and reconcile its record. If the transport subsequently loses the acknowledgement, report launch as unconfirmed and look up the existing transaction instead of automatically retrying. A managed daemon.update acknowledgement returns that updateId as an optional additive field and only after the record exists. An unmanaged or older updater keeps its existing acknowledgement. The update controller remains the sole terminal writer. A terminal daemon.updateOutcome record adds the matching updateId, retaining the existing success/failure shape. Updated VS Code and JetBrains clients that receive an updateId confirm only the matching terminal outcome. A reconnect deadline without that result means confirmation is pending or unavailable, and never implies success or failure. Clients use the existing timestamp and commit fallback only when no updateId was acknowledged [[c26]] [[c27]].

While a managed transaction is in flight, every candidate that can answer public daemon.status projects the recorded pre-update installedCommit. Internal candidate validation reads the actual release identity from the supervisor and verifies readiness and paused indexer initialization independently. A fresh candidate commit becomes public only after atomic publication of the matching success record. Threaded and non-threaded status use the same projection at request time. A candidate can serve status and update-outcome reads during probation. Other public data, chat and workflow IPC and automatic indexing stay gated until that candidate observes its own matching durable success record. A missing or unreadable commit record cannot open the gate. On failure, continue to report the old commit through verified rollback. While an unresolved recovery fence exists, never expose an unverified candidate commit as installed. If the marker exists but cannot be read or validated, suppress the commit rather than report the candidate's actual release. This status projection also protects already-installed IDE clients that still infer success from a commit change [[c26]] [[c27]].

**Call sites:**
- `src/daemon/update-runner.ts`
- `src/daemon/admin-handlers.ts`
- `vscode-plugin/src/freshness/daemon-freshness.ts:241`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlow.kt:156`

### 3.5 `Installation update admission and recovery` — new

Use one installation-scoped gate at the mutation boundary. A short process-owned arbitration lock serializes publication of durable reservations with admission of start, stop, restart, update, and launch-job mutations. Release that short lock before waiting for I/O or child exit. An admitted ordinary lifecycle operation keeps its own reservation until completion, so an update cannot slip between its stop and start. An update may reserve the installation only when no lifecycle mutation is in flight. Publish the active update ID and its controller's kernel-verifiable UID, PID and process-start incarnation under the lock before acknowledging or permitting mutation. The independent controller stays alive across both releases. The owner record and mutation gate live outside either release directory. Under the same arbitration, both supervisors admit an update-owner start or stop only when the request updateId matches the active record and the kernel client identity matches the recorded owner. Other mutations, including a second daemon.update, TUI or shell action, or direct shutdown RPC, return busy. Status reads remain available. Reject a public shutdown request when admission cannot be verified. Only the daemon's local signal handler may use the emergency path. A supervisor-admitted drain is correlated by the inherited request ID and never admits a second stop. Inherited drains and lifecycle emergency shutdown affect only their bound generation. Verify the same owner again immediately before job bootstrap or removal. Unsupported or legacy tool versions cannot be used as concurrent lifecycle writers during migration. Unmanaged development and Linux keep their own behavior [[c28]] [[c29]].

Journal intent before each externally visible transition and retain the exact job/child evidence or reconciliation result after it. The durable reservation survives owner death. The same evidence-based recovery applies if an ordinary lifecycle controller dies mid-restart. A missing owner, invalid record, or failed publication keeps mutation fenced. Managed admission never reclaims an update on the old PID-or-age heuristic. An operator recovery invocation takes ownership under the same gate only after verifying the old controller is gone and reconciling the journal, job registration, and process/run-file evidence. Unknown ownership leaves the fence intact. Recovery checks the matching outcome before doing anything disruptive: a recorded success is committed and may only finish activation and bookkeeping, a recorded rollback is terminal and may only finish bookkeeping, and no outcome permits verified rollback of uncommitted changes. A terminal operator-recovery outcome keeps its separate fence until the same ownership checks succeed. CLI status exposes the durable transaction outcome or recovery reason even with no live daemon.

**Call sites:**
- `src/daemon/update-runner.ts:117`
- `src/daemon/admin-handlers.ts:95`
- `scripts/daemon-ctl.sh`
- `src/cli/services/daemon.ts`

### 3.6 `Managed update storage preflight` — new

Limit transactional updates to pinned release pairs explicitly verified to preserve rollback-compatible live state. Each release supplies a verified compatibility declaration covering the writable formats and boot effects of the graph, Lance tables, repository/index queues, configuration, workflow/session state, and any startup migration or destructive cleanup. For a legacy release without a declaration, use only an explicitly qualified release pairing that establishes the same facts. Unknown, migration-bearing or incompatible pairs are refused with the predecessor still intact. Schema equality alone cannot establish compatibility. Recheck the live persisted format and outstanding recovery/compaction state after verified quiescence, before launching the candidate, using read-only inspection. Do not bootstrap an incompatible candidate, run a production migration, take an implicit snapshot, or promise binary rollback after a data migration. Schema-changing upgrades are outside this transaction and require a separately tracked migration plan [[c30]] [[c31]].

An admitted candidate starts in probation. Before the first startup write, the daemon verifies its expected update and compatible profile via its supervisor. Suppress pending migrations, destructive startup cleanup, compaction, background queues and application mutations until committed. Any mandatory open or recovery write must be proved compatible for both releases or probation fails. Validate the authenticated candidate, version, PID/socket pair, store opens, and the paused indexer's initialization. Do not validate by writing an index to production during probation. Unexpected candidate exit before validation completes is a failed update. After the controller records success, the candidate may admit normal RPCs and start indexing. Post-commit health is observed as normal runtime health. It cannot silently trigger pre-commit rollback.

**Call sites:**
- `src/daemon/index.ts:148`
- `src/daemon/index.ts:275`
- `src/daemon/index.ts:386`
- `src/db/graph/store.ts:734`

## 4. Diagrams

- [Sequence diagram](docs/standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The controller sees a foreign or changed generation.** (recoverable)
  - Detection: Peer credentials, installation identity, child generation or guarded file identities do not match.
  - Response: Refuse control, cleanup and replacement. Preserve the foreign owner’s files. Return ownership-conflict.
  - User impact: Report which ownership check failed.
- **The daemon is hung before it can accept shutdown or after watchdog readiness.** (recoverable)
  - Detection: The supervisor reaches the original monotonic deadline without observing exit.
  - Response: Signal only the still-owned unreaped child. Reap and record actual exit before cleanup or replacement. If exit cannot be verified within the forced-stop bound, withhold restart. Return exit-unconfirmed if the bound expires without a confirmed reap.
  - User impact: Report a forced stop only after confirmed exit.
- **The supervisor channel or service disappears.** (recoverable)
  - Detection: Channel closes or the expected owner no longer answers its authenticated status request.
  - Response: Treat the outcome as unknown unless positive exit of the original is available. Do not grant a new job authority over an orphan. The daemon retains its emergency path for local signals. A public RPC whose admission cannot be verified fails without starting a drain. Classify a missing supervisor as supervisor-unavailable. Classify an arm failure as watchdog-channel, watchdog-timeout or watchdog-protocol according to the observed failure.
  - User impact: Report degraded lifecycle and give precise migration or recovery instructions.
- **There is no usable launchd GUI domain or daemon runtime.** (recoverable)
  - Detection: The supported user-domain query, absolute runtime validation or registration fails.
  - Response: Report an actionable error before replacing a live install. Leave direct development mode available with existing explicit limitations. Use launch-domain-unavailable for launchd admission or runtime-unavailable for a missing or invalid executable.
  - User impact: Installed restart is withheld without losing the running daemon.
- **The original child crashes during a managed stop.** (recoverable)
  - Detection: The supervisor reaps the bound child and records neither a clean shutdown nor an exit caused by its own escalation.
  - Response: Reconcile the owned run files, then return daemon-exit-failed with the confirmed exit receipt. Restart stops at that error. A separate explicit start is safe after cleanup is confirmed.
  - User impact: The user sees a confirmed crash and may choose to start again.
- **A legacy instance does not exit or cannot be identified during migration.** (recoverable)
  - Detection: Process identity cannot be matched before and after binding the read-only exit observer, the observation times out, or ownership changes under the guard.
  - Response: Withhold migration. Keep the old job and files, report the observed identity and stop reason, and let the operator stop the verified original through its owning job or session. Recheck exit and ownership before retry. If the owner is unverified, leave it alone and report the conflict.
  - User impact: The operator gets a recovery path without risking termination of a replacement.
- **A managed startup child never becomes ready.** (recoverable)
  - Detection: The supervisor's monotonic startup deadline expires before the channel, readiness handlers and guarded publications are verified.
  - Response: Keep the generation fenced, terminate only the owned startup child, and wait for exact reap. Clean only owned partial publications and release the supervisor lease. Return started false only after verified cleanup. Return exit-unconfirmed or ownership-conflict and block replacement and rollback launch when evidence is missing.
  - User impact: A failed start cannot leave an apparently free slot with a live daemon.
- **The daemon dies while using a run-file lease.** (recoverable)
  - Detection: The supervisor receives exact reap while its guard and the dead generation's lease are still active.
  - Response: Revoke that lease, reconcile owned files under the same guard, and release the guard only after cleanup. For supervisor death or an unverified legacy orphan, preserve the guard and require verified-dead quarantine.
  - User impact: A blocked managed close can restart automatically after safe cleanup. An uncertain owner blocks restart with an actionable reason.
- **An installed update cannot replace or validate the supervisor.** (recoverable)
  - Detection: The external update controller cannot verify job removal, supervisor exit, replacement startup, or protocol handshake.
  - Response: Keep the installation lease and in-flight marker through rollback. Restore the pinned prior release only after verifying that no conflicting supervisor or child is live. Write one terminal outcome after verified restoration or a recorded operator-recovery decision. If outcome persistence fails, retain the in-flight marker and keep recovery fenced. An unresolved ownership decision keeps a durable recovery fence even after terminal reporting.
  - User impact: Status continues to report the update as in flight during rollback. The final result distinguishes a failed update with verified restoration from a failure requiring operator recovery.
- **The candidate cannot prove compatibility with the live state.** (recoverable)
  - Detection: A release declaration is missing or incompatible, a read-only check disagrees with the profile, or a required probation write is not rollback-compatible.
  - Response: Refuse the release before stop when detectable at preflight. After verified stop, restore the pinned predecessor without admitting the candidate to production state.
  - User impact: The updater reports the incompatible store or startup effect. No live migration is attempted.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Concurrent stop and restart, or repeat shutdown while drain is in flight. | Serialize replacement and join the original deadline. Duplicate requests cannot extend the deadline or act on a new generation. |
| Graceful exit races the timeout. | The supervisor processes signal and reap in one order. Report forced only if escalation actually caused the recorded exit. A later process cannot receive the signal. |
| A legacy or temporary recovery instance is live. | Migrate with cooperative shutdown and verified exit. If a legacy watchdog ends the process before drain, report that outcome accurately. Require explicit operator recovery if a legacy instance is stuck. Do not treat a job label or missing socket as proof of process exit. |
| A controller stalls after binding the old generation and a different controller replaces it. | The original stop remains scoped to its inherited child channel. The delayed caller receives ownership-conflict for stale generation control and cannot drain or force-stop the replacement. |
| Stop is requested with no active generation. | Return not-running, or replay the matching already-confirmed exit receipt. Shell stop treats not-running as successful no-op. A mismatched live generation remains an ownership conflict. |
| A fixture or another state root presents the same launch label or socket identity. | Reject the foreign root. Isolated fixtures have distinct roots, labels, sockets and run-file guards. |
| A stop or another start races the startup readiness deadline. | Only the supervisor's existing startup generation can be stopped. A terminal timeout wins over a late readiness acknowledgement. A duplicate start joins the same pending generation. |
| A direct start or second restart races a supervisor upgrade. | The installation-level update lease covers both supervisor versions. Other controller actions report busy until the update records its outcome and releases the lease. Recovery of an orphaned update lease fails closed. |
| A queued guard-release is processed on either side of forced escalation. | Before escalation it relinquishes child access only. After escalation it is refused. In both orders the shutdown guard remains held through exact reap and reconciliation. |
| A status request or second update arrives during rollback. | The update stays in flight and the installation lease refuses lifecycle mutations. Publish the outcome once rollback verifies restoration or records an operator-recovery decision. |
| The candidate job loads, but hello fails before any child launch. | Verify the candidate job using the pinned descriptor, unload it and prove registration removal and exact supervisor exit before restoring the prior release. Keep a recovery fence if identity is uncertain. |
| A candidate answers status before validation commits, or an IDE receives an unrelated outcome. | Old clients still see the prior public commit. Updated clients await only a terminal outcome for the acknowledged update ID. |
| A controller connection opened before update admission sends a start or stop during the update. | Recheck current admission and kernel caller identity. Only the recorded update controller with the matching update ID can mutate. Ordinary shutdown RPC is refused while an update owns the gate. |
| The candidate declares a new format or cannot prove its writes are safe for rollback. | Refuse the pairing before stop, or restore the verified predecessor after the quiescent recheck, without launching the candidate. |
| The update controller dies before or after durable success. | Keep the reservation fenced. Verified recovery without a success record can roll back. With a success record recovery only completes activation and bookkeeping. |

**Invariants to preserve**

- Startup and cleanup preserve guarded ownership of the published PID and socket pair. [[c7]]
- The independent shutdown deadline remains in force through blocked native close or exit hooks. [[c5]]
- The shell and CLI confirm the old daemon exited before starting its replacement. [[c3]]

## 6. Test strategy

**Test framework:** `Node.js node:test via tsx with isolated macOS launchd fixtures`

**Test levels**

- **unit** — Verify lifecycle authorization and exact state transitions.
  - Subjects: `Wrong peer, root and generation`, `Monotonic deadline, repeated requests and grace versus forced outcome`, `Guarded stale run files and replacement ownership`, `Protocol version, frame bounds, channel role and request correlation`, `Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors`, `Idle stop, launch-domain refusal, missing runtime, reserved watchdog capacity and confirmed failed-exit classification`, `Lease token, channel and generation mismatch`, `Startup readiness race and unconfirmed forced reap`, `Update lock, version refusal and terminal outcome`, `Missing, misplaced, reused and stale lease tokens`, `Queued release before and after escalation preserves shutdown guard`, `Terminal outcome and marker ordering, including persistence failure`, `Hello negotiates the highest common version and rejects peer identity mismatch, malformed hello and empty overlap`, `Correlated update outcomes ignore unrelated terminal records and changed installedCommit`, `Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication`, `Compatibility declaration and read-only quiesced check refuse unknown or migration-bearing pairs`, `Crash recovery classifies the durable outcome before deciding rollback or activation`
- **integration** — Exercise both entry paths against disposable real supervisor and daemon processes.
  - Subjects: `Normal CLI and shell restart`, `IPC and signal shutdown with no controller`, `Hung before shutdown reply and hung native close after watchdog readiness`, `Supervisor loss, concurrent restart and stale files`, `Recovery job and legacy migration`, `Linux existing pidfd and watchdog suites`, `Delayed controller cannot stop the replacement generation`, `Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog`, `Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker`, `Rollback after legacy stop but before managed readiness restores the saved service`, `Distinct test roots reject cross-root control and label collisions`, `Hold a client connection open during managed server.close and confirm forced reap releases the supervisor guard and permits exactly one restart`, `Kill startup child before PID, after PID, and after socket publication before ready`, `Kill the supervisor while it owns the guard and verify fail-closed operator recovery`, `Legacy socket peer UID or PID differs from the registered process incarnation`, `Installed shell restart sends one stop and one start bound to the same predecessor`, `Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change`, `Observe in-flight status throughout injected rollback, then exactly one terminal outcome after restored readiness or a durable operator-recovery decision`, `Fail hello after candidate job registration before child start, remove the candidate job and restore the prior release`, `Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows`, `Hold application RPCs and indexing until matching durable success across threaded and non-threaded status paths`, `Inject upgrade with a newer graph schema and verify the old daemon can still open the unchanged store`, `Race competing start, stop, raw shutdown and update against both supervisor versions`, `Kill the controller at reservation, job registration, probation, and after outcome publication`, `Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success`, `Fresh supervisor first start requires durable predecessor evidence and an admitted owner`, `Public RPC arm gets busy during update while an admitted drain and local signal preserve their watchdog path`, `Lost update acknowledgement neither permits an unacknowledged helper to mutate before response write nor triggers duplicate admission`
  - Fixtures: `Unique label and temporary state root`, `Disposable daemon with delayed drain and independently blocked shutdown fixture`
- **smoke** — Qualify an installed build on Apple Silicon as a regular user.
  - Subjects: `Install or upgrade into supported launchd domain`, `Normal and blocked shutdown complete with verified generation change`, `Restart leaves one daemon and serves status and indexing`, `Stopped daemon remains stopped and rollback preserves state`, `On the installed Apple Silicon build recover stale owned PID and socket files and refuse files belonging to a replacement`, `Real macOS migration exit observation and restoration after injected pre-readiness failure`, `Apple Silicon real blocked-close guard recovery and boot timeout after partial publication`, `Apple Silicon installed update across a supervisor version change with injected rollback`

## 7. Migration

**State before:** The current controller and watchdog share the broker path [[c2]] [[c3]] [[c8]] [[c9]]. The approved issue records the observed denial and the temporary recovery LaunchAgent [[c1]].

**State after:** The standard installed macOS daemon is the supervised child of one per-user launch job. The Linux stop and watchdog use their existing retained-target path.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Preflight the launch domain and runtime, pin previous and candidate releases, and verify the rollback-compatible storage pairing before requesting disruptive admission. Reserve the installation under the admission gate and journal the prior release, job, expected running/stopped state and public commit. Verify the controller owner before each mutation. For legacy tooling that cannot honor the gate, require a quiescent cutover with the legacy updater, launcher and automatic starts disabled before migration begins. A supported cooperative predecessor may drain under the gate. Use the original installation and config, without copying credentials. — ↩ rollbackable
2. If the operator already stopped the legacy or temporary instance, verify the prior job and daemon are inactive, reconcile only proven run-file identities, and skip the live shutdown sequence below. Otherwise, for a supported cooperative live predecessor, capture its PID and socket identities under the run-file guard. Read the original UID and process start seconds and microseconds through proc_pidinfo PROC_PIDTBSDINFO and verify the installed command [[c20]] [[c24]]. Register a read-only kqueue EVFILT_PROC NOTE_EXIT observer, connect to the original socket, and verify its kernel peer UID and LOCAL_PEERPID match that process. Reread its incarnation and the socket identity after registration and connection before sending anything [[c16]] [[c25]]. Hold the connection and observer, release the guard before the request so the daemon can drain, and send shutdown only on that connection. Require the retained observer's exit event. Reacquire the guard and reconcile only the captured paths. Refuse any unavailable proof, peer mismatch, changed incarnation or timeout. No reconnect to a pathname, Mach broker or raw PID signal. For the temporary recovery job, unload only the verified exact job after its daemon exits. — ↩ rollbackable
3. For an already-managed update, authenticate and negotiate with the old supervisor before stopping it. Stop and reap its exact child if running. If the supervisor changes, retain an exact exit observer before unloading the verified old job, then require both its exit and registration removal before loading the candidate. For first migration, require verified legacy exit before loading the candidate. Journal intent before candidate job registration and record job admission separately from child launch. If registration returns an ambiguous result, resolve job identity against the saved descriptor before proceeding. Verify the candidate handshake on the authenticated socket before allowing child launch. A new supervisor starts idle and accepts its first launch only after validating the journaled predecessor-exit or no-child evidence and the update owner. Journal intent before selecting the candidate as the installed release. Any selection change before terminal success remains provisional and fenced, even across a supervisor relaunch. Verify the durable selector and job descriptor point to the validated candidate before publishing success. Recheck the quiesced live state with read-only inspection before launch. If the previous daemon was running, verify candidate readiness in probation, including store opens and paused indexer initialization. Keep automatic indexing and normal IPC mutations gated. For a previously stopped installation, verify the expected idle job and no daemon child. Keep the candidate commit private until final success. A candidate already observed to exit cannot be committed. — ↩ rollbackable
4. On failure, keep the in-flight marker and installation lease while deciding and executing rollback. Resolve any attempted candidate registration even if child start was never requested. If its child may have started, obtain exact child exit and guarded file reconciliation before unloading its verified job. If no child launch was admitted, unload the verified candidate job directly, even when its handshake failed. Bind the supervisor exit observer before unload and verify both removal and exact exit. Restore the pinned previous release only after resolving all possibly admitted candidate ownership. If an earlier supervisor was retained across a daemon-only update, keep that verified job and reconcile only the failed candidate generation before restoring the previous daemon release. If the previous release was never displaced, verify it still owns the installation. Restore and verify the previous durable release selector, job descriptor and expected running or stopped state. If job or child ownership or restoration cannot be proved, record an operator-recovery fence and withhold launch. Atomically publish one final outcome with the update ID, after verified candidate probation, verified rollback or the durable operator-recovery decision. The matching success record is the commit point and authorizes normal IPC and indexing. Retain the record until the admitted candidate consumes it and the committed release identity is durable for future starts. The absence of the in-flight marker alone cannot authorize a probationary process. Clear the in-flight marker and release the installation lease only after the durable outcome exists. Recovery after the commit point completes activation or reports ordinary runtime failure. It never rolls a committed update back implicitly. If outcome persistence fails, preserve the marker and lease or recovery fence. — ↩ rollbackable

**Backward compat:** Daemon status, shutdown and update RPC names and existing fields stay compatible. Optional updateId fields correlate managed acknowledgements and terminal outcomes. A candidate status projects the prior public commit until successful completion so legacy IDE clients remain safe. Current CLI and script commands are retained. Existing state directories and data schemas require no rewrite.

## 8. Alternatives considered

### 8.1 a1: LaunchAgent with a parent supervisor — **CHOSEN**

Run the installed daemon as the direct child of a per-user supervisor.

Use launchd to host one installed supervisor and preserve graceful IPC shutdown. The supervisor owns exact child exit and an independent deadline, with control correlated to a specific supervised instance.

### 8.2 a2: LaunchAgent with direct daemon ownership

Let launchd directly own the daemon and use launch service operations.

Model each installed daemon as the direct launchd service process and use service identity for recovery alongside existing graceful IPC.

**Rejected because:** Direct service ownership leaves independent watchdog termination dependent on the Mach broker unless another generation-safe authority is added.

### 8.3 a3: Cooperative drain with exit observation

Use the existing socket and observe Darwin process exit.

Use authenticated daemon shutdown IPC and a verified process exit observation, withholding restart if the process never confirms exit.

**Rejected because:** Read-only exit observation is sufficient for guarded migration and cannot recover a blocked daemon.

## 9. References

- **[[c1]]** `prior-artifact` `docs/standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1/ISSUE.md`
- **[[c2]]** `code` `src/cli/services/lifecycle.ts:57`
- **[[c3]]** `code` `src/cli/services/lifecycle.ts`
- **[[c4]]** `code` `src/cli/services/daemon.ts`
- **[[c5]]** `code` `src/daemon/shutdown.ts`
- **[[c6]]** `code` `src/daemon/shutdown-watchdog.ts`
- **[[c7]]** `code` `src/daemon/run-file-ownership.ts`
- **[[c8]]** `code` `src/bin/insrc-shutdown-watchdog.ts`
- **[[c9]]** `code` `src/shared/daemon-process-client.ts`
- **[[c10]]** `code` `src/native/process-broker/darwin.c`
- **[[c11]]** `code` `scripts/daemon-ctl.sh`
- **[[c12]]** `doc` `https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html`
- **[[c13]]** `code` `src/bin/insrc-daemon-control.ts`
- **[[c14]]** `code` `src/cli/services/maintenance.ts`
- **[[c15]]** `code` `src/native/process-broker/linux.c`
- **[[c16]]** `doc` `https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/kqueue.2.html`
- **[[c17]]** `code` `src/shared/daemon-run-files.ts:51`
- **[[c18]]** `code` `src/daemon/server.ts:300`
- **[[c19]]** `code` `src/daemon/index.ts:110`
- **[[c20]]** `code` `src/shared/daemon-process.ts:29`
- **[[c21]]** `code` `src/daemon/admin-handlers.ts:101`
- **[[c22]]** `code` `src/daemon/update-runner.ts:140`
- **[[c23]]** `code` `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts:68`
- **[[c24]]** `doc` `https://github.com/apple/darwin-xnu/blob/main/bsd/sys/proc_info.h`
- **[[c25]]** `doc` `https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/un.h`
- **[[c26]]** `code` `vscode-plugin/src/freshness/daemon-freshness.ts:255`
- **[[c27]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/freshness/DaemonFreshnessFlow.kt:161`
- **[[c28]]** `code` `src/daemon/update-runner.ts:117`
- **[[c29]]** `code` `src/daemon/admin-handlers.ts:95`
- **[[c30]]** `code` `src/db/graph/store.ts:734`
- **[[c31]]** `code` `src/daemon/index.ts:148`
