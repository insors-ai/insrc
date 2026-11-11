<!-- insrc:artifact TESTS-3992d2e1e26124dc-s1 -->

# Tests: 3992d2e1e26124dc s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 73 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-10T14:02:42.226Z on commit `c97073de2`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Wrong peer, root and generation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Wrong peer, root and generation | `src/shared/__tests__/daemon-supervisor-protocol.test.ts` |

**unit: Protocol version, frame bounds, channel role and request correlation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Protocol version, frame bounds, channel role and request correlation | `src/shared/__tests__/daemon-supervisor-protocol.test.ts` |

**unit: Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors | `src/shared/__tests__/daemon-supervisor-protocol.test.ts` |

**unit: Lease token, channel and generation mismatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Lease token, channel and generation mismatch | `src/shared/__tests__/daemon-supervisor-protocol.test.ts` |

**unit: Update lock, version refusal and terminal outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Update lock, version refusal and terminal outcome | `src/shared/__tests__/daemon-supervisor-protocol.test.ts` |

**unit: Missing, misplaced, reused and stale lease tokens**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Missing, misplaced, reused and stale lease tokens | `src/shared/__tests__/daemon-supervisor-protocol.test.ts` |

**unit: Hello negotiates the highest common version and rejects peer identity mismatch, malformed hello and empty overlap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Hello negotiates the highest common version and rejects peer identity mismatch, malformed hello and empty overlap | `src/shared/__tests__/daemon-supervisor-protocol.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/daemon-supervisor-protocol.test.ts` | 0 | 7 | 0.4 s |  |

## t2

Run at 2026-11-10T14:08:25.983Z on commit `b08167fdb`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Compares peer identity and scopes job labels by installation root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Compares peer identity and scopes job labels by installation root | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**unit: Validates idle job evidence and refuses the wrong domain or relative program**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Validates idle job evidence and refuses the wrong domain or relative program | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**unit: Rejects a reused PID with a different start incarnation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Rejects a reused PID with a different start incarnation | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**integration: Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**integration: Uses separate labels for test roots and rejects a foreign registered root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Uses separate labels for test roots and rejects a foreign registered root | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**integration: Legacy socket peer UID or PID differs from the registered process incarnation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Reads credentials from the connected socket and rejects mismatched PID or UID | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**unit: Rejects a foreign peer PID or executable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Rejects a foreign peer PID or executable | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**integration: Verifies recovery job registration against the pinned descriptor and argv**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Verifies recovery job registration against the pinned descriptor and argv | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**integration: Observes exact exit of a disposable child with the read-only Darwin helper**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Observes exact exit of a disposable child with the read-only Darwin helper | `src/shared/__tests__/darwin-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/darwin-lifecycle.test.ts` | 0 | 9 | 1.2 s |  |

## t3

Run at 2026-11-10T14:14:04.649Z on commit `2e4d4e224`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Durable update reservation blocks competing mutations and binds the owner**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Durable update reservation blocks competing mutations and binds the owner | `src/shared/__tests__/installation-mutation-gate.test.ts` |

**unit: Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication | `src/shared/__tests__/installation-mutation-gate.test.ts` |

**unit: Recovery classification distinguishes uncommitted, committed, rolled-back and fenced transactions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Recovery classification distinguishes uncommitted, committed, rolled-back and fenced transactions | `src/shared/__tests__/installation-mutation-gate.test.ts` |

**integration: Two independent processes cannot reserve the same installation or clear an unverified orphan reservation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Two independent processes cannot reserve the same installation or clear an unverified orphan reservation | `src/shared/__tests__/installation-mutation-gate.test.ts` |

**integration: Controller death releases short arbitration but preserves the durable reservation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Controller death releases short arbitration but preserves the durable reservation | `src/shared/__tests__/installation-mutation-gate.test.ts` |

**integration: Public lifecycle admission remains busy while an update owns the installation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Public lifecycle admission remains busy while an update owns the installation | `src/shared/__tests__/installation-mutation-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/installation-mutation-gate.test.ts` | 0 | 6 | 1.4 s |  |

## t4

Run at 2026-11-10T14:21:53.106Z on commit `59cdc2718`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Monotonic deadline, repeated requests and grace versus forced outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Monotonic deadline, repeated requests and grace versus forced outcome | `src/daemon/__tests__/daemon-supervisor.test.ts` |

**unit: Supervisor classifies idle stop, unavailable runtime, and confirmed failed exit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Supervisor classifies idle stop, unavailable runtime, and confirmed failed exit | `src/daemon/__tests__/daemon-supervisor.test.ts` |

**unit: Late ready cannot beat startup timeout or allow replacement before confirmed reap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Late ready cannot beat startup timeout or allow replacement before confirmed reap | `src/daemon/__tests__/daemon-supervisor.test.ts` |

**integration: Delayed controller cannot stop the replacement generation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Delayed controller cannot stop the replacement generation | `src/daemon/__tests__/daemon-supervisor.test.ts` |

**integration: Fresh supervisor first start requires durable predecessor evidence and an admitted owner**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Fresh supervisor first start requires durable predecessor evidence and an admitted owner | `src/daemon/__tests__/daemon-supervisor.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/daemon-supervisor.test.ts` | 0 | 5 | 1.3 s |  |

## t5

Run at 2026-11-10T14:29:05.467Z on commit `4d227509f`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Guarded stale run files and replacement ownership**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Guarded stale run files and replacement ownership | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**unit: Run-file mutation rejects a mismatched grant, channel or generation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Run-file mutation rejects a mismatched grant, channel or generation | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**unit: Partially published run files stay fenced while startup reap is unconfirmed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Partially published run files stay fenced while startup reap is unconfirmed | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**unit: Repeated or stale lease release cannot change the physical run-file guard**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Repeated or stale lease release cannot change the physical run-file guard | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**unit: Queued release before and after escalation preserves shutdown guard**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Queued release before and after escalation preserves shutdown guard | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**integration: Kill startup child before PID, after PID, and after socket publication before ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Kill startup child before PID, after PID, and after socket publication before ready | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/supervisor-run-files.test.ts` | 0 | 6 | 0.6 s |  |

## t6

Run at 2026-11-10T15:36:35.635Z on commit `c348f0652`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: Managed watchdog arm has reserved capacity during a controller request burst**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Managed watchdog arm has reserved capacity during a controller request burst | `src/daemon/__tests__/managed-daemon-lifecycle.test.ts` |

**integration: IPC and signal shutdown with no controller**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | IPC and signal shutdown with no controller | `src/daemon/__tests__/managed-daemon-lifecycle.test.ts` |

**integration: Hung before shutdown reply and hung native close after watchdog readiness**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Hung before shutdown reply and hung native close after watchdog readiness | `src/daemon/__tests__/managed-daemon-lifecycle.test.ts` |

**smoke: Linux existing pidfd and watchdog suites**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1/S001/test-evidence/t6-orbstack-linux.tap (SHA-256 ec49c70963bda99532b5b7da2f820e51135831bc56b578d2511cdbc01e8ca3d4). OrbStack Linux aarch64, Node v22.22.1, commit cff400b05. Native process client, process-broker and shutdown-watchdog suites: 21 passed, 0 failed, 0 skipped.

**integration: Hold a client connection open during managed server.close and confirm forced reap releases the supervisor guard and permits exactly one restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Hold a client connection open during managed server.close and confirm forced reap releases the supervisor guard and permits exactly one restart | `src/daemon/__tests__/managed-daemon-lifecycle.test.ts` |

**integration: Public RPC arm gets busy during update while an admitted drain and local signal preserve their watchdog path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Public RPC arm gets busy during update while an admitted drain and local signal preserve their watchdog path | `src/daemon/__tests__/managed-daemon-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/managed-daemon-lifecycle.test.ts` | 0 | 5 | 8.3 s |  |

## t7

Run at 2026-11-10T15:52:06.153Z on commit `17605863f`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Normal CLI and shell restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Normal CLI and shell restart | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**integration: Supervisor loss, concurrent restart and stale files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Supervisor loss, concurrent restart and stale files | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**integration: Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**integration: Installed controller refuses a verified job belonging to another test root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Installed controller refuses a verified job belonging to another test root | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**integration: Kill the supervisor while it owns the guard and verify fail-closed operator recovery**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Kill the supervisor while it owns the guard and verify fail-closed operator recovery | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**integration: Installed shell restart sends one stop and one start bound to the same predecessor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Installed shell restart sends one stop and one start bound to the same predecessor | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**integration: Race competing start, stop, raw shutdown and update against both supervisor versions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Race competing start, stop, raw shutdown and update against both supervisor versions | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/managed-daemon-control.test.ts` | 0 | 7 | 5.1 s |  |

## t8

Run at 2026-11-10T16:02:02.357Z on commit `ffd700b07`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Compatibility declaration and read-only quiesced check refuse unknown or migration-bearing pairs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Compatibility declaration and read-only quiesced check refuse unknown or migration-bearing pairs | `src/daemon/__tests__/release-compatibility.test.ts` |

**integration: Inject upgrade with a newer graph schema and verify the old daemon can still open the unchanged store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Inject upgrade with a newer graph schema and verify the old daemon can still open the unchanged store | `src/daemon/__tests__/release-compatibility.test.ts` |
| pass | Candidate stays read-only and serves the prior commit until matching durable success | `src/daemon/__tests__/release-compatibility.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/release-compatibility.test.ts` | 0 | 3 | 1.8 s |  |

## t9

Run at 2026-11-10T16:15:05.049Z on commit `875d2b7d8`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Candidate job handoff records registration before child admission and keeps release selection provisional**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Candidate job handoff records registration before child admission and keeps release selection provisional | `src/daemon/__tests__/managed-update-handoff.test.ts` |

**integration: A failed candidate hello yields an exact job receipt without admitting a daemon child**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | A failed candidate hello yields an exact job receipt without admitting a daemon child | `src/daemon/__tests__/managed-update-handoff.test.ts` |

**integration: A lost or unwritten update acknowledgement keeps the detached helper behind its launch gate**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | A lost or unwritten update acknowledgement keeps the detached helper behind its launch gate | `src/daemon/__tests__/managed-update-handoff.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/managed-update-handoff.test.ts` | 0 | 3 | 1.6 s |  |

## t10

Run at 2026-11-10T17:16:49.776Z on commit `c547b8a54`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Incompatible supervisor version produces one terminal failure after reconciliation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Incompatible supervisor version produces one terminal failure after reconciliation | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**unit: Terminal outcome and marker ordering, including persistence failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Terminal outcome and marker ordering, including persistence failure | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**unit: Recovery applies only the operations permitted by the matching outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Recovery applies only the operations permitted by the matching outcome | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**integration: Recovery job and legacy migration**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Recovery job and legacy migration | `src/daemon/__tests__/managed-update-transaction.test.ts` |
| pass | Legacy cutover observes the exact authenticated process exit before cleaning its publication | `src/daemon/__tests__/legacy-daemon-cutover.test.ts` |
| pass | Legacy LaunchAgent pinning rejects automatic restart before migration | `src/daemon/__tests__/legacy-daemon-cutover.test.ts` |

**integration: Rollback after legacy stop but before managed readiness restores the saved service**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Rollback after legacy stop but before managed readiness restores the saved service | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**integration: Fail hello after candidate job registration before child start, remove the candidate job and restore the prior release**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Fail hello after candidate job registration before child start, remove the candidate job and restore the prior release | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**integration: Kill the controller at reservation, job registration, probation, and after outcome publication**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Kill the controller at reservation, job registration, probation, and after outcome publication | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**integration: Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/legacy-daemon-cutover.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/__tests__/managed-update-transaction.test.ts` | 0 | 8 | 4.1 s |  |

## t11

Run at 2026-11-10T17:25:11.011Z on commit `7cb0424ed`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change | `src/daemon/__tests__/managed-update-ipc.test.ts` |

**integration: Observe in-flight status throughout injected rollback, then exactly one terminal outcome after restored readiness or a durable operator-recovery decision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Observe in-flight status throughout injected rollback, then exactly one terminal outcome after restored readiness or a durable operator-recovery decision | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**integration: Hold application RPCs and indexing until matching durable success across threaded and non-threaded status paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Hold application RPCs and indexing until matching durable success across threaded and non-threaded status paths | `src/daemon/__tests__/managed-update-ipc.test.ts` |

**integration: Managed update helper waits for acknowledgement write before destructive work**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Managed update helper waits for acknowledgement write before destructive work | `src/daemon/__tests__/managed-update-handoff.test.ts` |

**integration: Threaded and non-threaded status publish the same committed release for the matching outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Threaded and non-threaded status publish the same committed release for the matching outcome | `src/daemon/__tests__/managed-update-ipc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/managed-update-handoff.test.ts` | 0 | 4 | 1.6 s |  |
| `src/daemon/__tests__/managed-update-ipc.test.ts` | 0 | 8 | 10.5 s |  |
| `src/daemon/__tests__/managed-update-transaction.test.ts` | 0 | 9 | 3.8 s |  |

## t12

Run at 2026-11-10T17:38:41.765Z on commit `660ea82e3`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Correlated update outcomes ignore unrelated terminal records and changed installedCommit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Correlated update outcomes ignore unrelated terminal records and changed installedCommit | `vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts` |
| pass | Correlated update outcomes ignore unrelated terminal records and changed installedCommit | `jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts` |

**integration: Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows | `vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts` |
| pass | Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows | `jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts` |

**integration: Lost update acknowledgement does not trigger an automatic duplicate request**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Lost update acknowledgement does not trigger an automatic duplicate request | `vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts` |
| pass | Lost update acknowledgement does not trigger an automatic duplicate request | `jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts` |
| pass | A missing update acknowledgement is classified as uncertain after the request write | `src/shared/__tests__/ipc-client.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/managed-update-confirmation-gradle.test.ts` | 0 | 3 | 13.1 s |  |
| `src/shared/__tests__/ipc-client.test.ts` | 0 | 12 | 0.6 s |  |
| `vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts` | 0 | 26 | 0.5 s |  |
