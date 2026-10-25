<!-- insrc:artifact PLAN-fd8d70c3e8c397ea-s1 -->

# Plan: STORY-fd8d70c3e8c397ea-s1

## Summary

**Epic:** `daemon-stop-must-wait-process-end`
**LLD run:** `wf-1792849046705-rsj1ro`
**LLD effective hash:** `303726ece569...`

Nine tasks replace the failed check-then-act signalling foundation with retained native process capabilities before wiring shutdown and restart. Existing task IDs are preserved; new broker/client tasks precede their consumers. The work protects cooperating managed run-file publishers, propagates CLI/shell failures, bounds native hangs and records controlled evidence. Linux runtime proof, unverified Darwin support, deferred historical diagnosis and separately authorized installed smoke remain distinct.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Revise guard foundations and remove numeric-PID signalling authority | M | approved r1 | — | integration: Managed run-file guard exclusion, observed replacement preservation and explicit orphan conflict; integration: Observation-only process identities cannot authorize numeric-PID target signalling; integration: Revised guard foundation regressions pass without claiming atomic conditional unlink | [[c1]] [[c2]] [[c3]] |
| 2 | **`t8`** Build and package the OS-native stable process-capability broker | M | — | `t1` | integration: Native Linux retained-capability capture termination and post-exit non-retargeting; integration: Darwin denied or unsupported capabilities fail closed and runtime evidence remains explicit; integration: Normal build compiles and ships the local broker without a runtime compiler or PID-kill fallback | [[c1]] [[c2]] [[c9]] [[c11]] [[c12]] |
| 3 | **`t9`** Expose retained StopTarget capabilities through the Node client | M | — | `t8` | integration: Node StopTarget retains one broker capability across identity and PID-file changes; integration: Broker spawn readiness protocol permission and timeout failures are bounded; integration: Closing or cancelling a broker client releases helpers without unintended target signalling | [[c1]] [[c2]] [[c3]] [[c9]] |
| 4 | **`t2`** Protect daemon publication and asynchronous socket cleanup | M | approved r1 | `t1` | integration: Replacement run files survive original daemon cleanup and implicit socket unlink; integration: Startup publication and awaited close are serialized under the same guard; integration: Startup-error, fatal and stale-file cleanup honor ownership | [[c1]] [[c2]] [[c4]] [[c10]] |
| 5 | **`t3`** Retain the original target throughout CLI stop and restart | M | approved r1 | `t2`, `t9` | integration: Retained stop target survives run-file removal and RPC failure; integration: Verified forced termination preserves StopOutcome and never targets reused PIDs; integration: Ownership or orphan-guard conflicts prevent maintenance restart | [[c1]] [[c2]] [[c5]] |
| 6 | **`t4`** Implement the independent shutdown watchdog and ready handshake | M | approved r1 | `t9` | integration: Independent watchdog bounds a disposable blocked parent and disarms after healthy exit; integration: Ready handshake reports spawn failure, early exit and timeout; integration: Watchdog never signals after reparenting and imports only Node built-ins | [[c1]] [[c2]] [[c6]] |
| 7 | **`t5`** Integrate bounded shutdown while preserving store-health behavior | M | approved r1 | `t2`, `t4` | integration: Watchdog arm failure self-kills before blocked native cleanup; integration: Bounded shutdown preserves lock-loss, fatal and normal cleanup behavior; integration: Repeated signals and guarded async close preserve ownership; integration: Store-child fixture exercises owned publication watchdog readiness and guarded close | [[c1]] [[c2]] [[c4]] [[c6]] [[c10]] |
| 8 | **`t6`** Apply retained-target and guard rules to the control script | M | approved r1 | `t3`, `t5` | integration: Control script retains the original target across run-file removal; integration: Control script refuses reused identity, replacement files and orphan guards; integration: Disposable clean and forced script restart paths preserve commands; integration: Shell start and restart refuse spawn after lifecycle failures even in conditional contexts | [[c1]] [[c2]] [[c7]] |
| 9 | **`t7`** Record controlled shutdown evidence and verify the complete lifecycle | S | approved r1 | `t6` | smoke: Controlled shutdown investigation evidence document satisfies ac4 with historical-cause caveat; integration: Guard-owner death prevents restart while the healthy control restarts normally; integration: Compiled helper packaging and affected lifecycle regression suites; smoke: Platform evidence matrix distinguishes Linux runtime proof from unverified Darwin support and unperformed installed smoke | [[c1]] [[c2]] [[c8]] |

### 1.1 TASK-fd8d70c3e8c397ea-s1-t1 — Revise guard foundations and remove numeric-PID signalling authority

Reuse the existing atomic mkdir/nonce guard, file fingerprints and orphan diagnostics under the cooperating-managed-writer contract. Revise source/docs/tests that imply atomic conditional unlink. Keep OS identity observation diagnostic; remove or explicitly refuse the failed check-then-act signalling helper so no production target can be signalled through it. Reconcile the failed t1 work rather than claiming it completed. Revalidation is mandatory; previous t1 test results do not constitute a completed task.

**Acceptance checks:**
- Existing guard tests prove exclusive managed-writer acquisition and preservation of observed foreign files.
- Orphan/unverifiable guards remain explicit conflicts without automatic reclamation.
- No identity-check-then-numeric-kill API remains usable as production daemon signalling authority.

### 1.2 TASK-fd8d70c3e8c397ea-s1-t8 — Build and package the OS-native stable process-capability broker

Implement the internal local-source broker: Linux opens a pidfd before identity validation and observes/signals only that handle; Darwin acquires a stable Mach task right and validates unique process incarnation before readiness. Denied/unavailable APIs fail closed without privilege changes or PID-kill fallback. Add root build-process-broker.mjs to package.json between tsc and actual root copy-assets.mjs; ship the host executable in out/bin. Runtime requires no compiler or downloaded code. Keep a platform-evidence matrix: Linux runtime results, Darwin denial/unsupported seam results, and Darwin actual runtime status separately. Never describe the feasibility probe or mocks as Darwin validation.

**Acceptance checks:**
- Real Linux disposable-process tests prove handle capture, termination, exit observation and no retargeting after the original exits.
- Darwin denied/unsupported capability paths fail closed; Darwin runtime evidence is required before claiming that backend works.
- Normal build compiles and packages the local broker; missing toolchain/API produces actionable diagnostics.
- No native target-termination path falls back to numeric-PID kill or opens databases/network connections.

### 1.3 TASK-fd8d70c3e8c397ea-s1-t9 — Expose retained StopTarget capabilities through the Node client

Wrap the packaged broker with a bounded ready/request/exit protocol and explicit hasExited/terminate/close operations. Bind each client to one validated target incarnation, retain it across caller RPC failures, and release handles/helpers on success, cancellation or failure. Reuse UTF-8-safe stream handling. Missing broker, malformed replies, denied capabilities and deadlines refuse safely; no Node process.kill fallback for daemon targets.

**Acceptance checks:**
- Node integration retains the same kernel target across process/PID-file changes and never substitutes another PID.
- Spawn, ready, protocol, permission and timeout failures are bounded and actionable.
- Client close/cancellation releases the broker without signalling an unrequested target or leaking a helper.
- All forced target signalling uses the broker capability; observation-only identity probes cannot authorize it.

### 1.4 TASK-fd8d70c3e8c397ea-s1-t2 — Protect daemon publication and asynchronous socket cleanup

Apply shared ownership guard to daemon startup isAlreadyRunning/stale cleanup/writePid/socket listen and every lifecycle cleanup path. Hold guard across awaited server close and owned unlink. On foreign files, skip clearPid and server.close (including implicit socket unlink), diagnose and choose no-exit-hook termination. Coordinate lifecycle.ts, server.ts and index.ts without changing IPC payloads. Audit and revise src/shared/daemon-run-files.ts callers and the real store-child fixture; preserve its temporary-store semantics.

**Acceptance checks:**
- Replacement PID/socket files appearing during drain survive original cleanup.
- Managed startup cannot publish between ownership verification and asynchronous close/unlink.
- Startup errors, fatal cleanup, stale-file removal and normal cleanup use the same ownership rules.

### 1.5 TASK-fd8d70c3e8c397ea-s1-t3 — Retain the original target throughout CLI stop and restart

Capture a broker-backed StopTarget before shutdown RPC, retain the kernel capability through run-file removal, and observe/terminate only via that handle. Preserve StopOutcome and bounded phases. Refuse success on capability, ownership or orphan-guard conflict so maintenance.restart cannot launch a replacement.

**Acceptance checks:**
- PID/socket disappearance alone never reports success while the captured process lives.
- RPC failure/timeouts still wait and terminate only through the retained OS capability, never by rereading a numeric PID.
- PID reuse, identity read failure, foreign files or orphaned guard withhold restart; clean stop preserves existing outcome shape.

### 1.6 TASK-fd8d70c3e8c397ea-s1-t4 — Implement the independent shutdown watchdog and ready handshake

Add packaged Node-built-in-only watchdog child and parent arm/ready helper with test seams. Observe parenthood rather than numeric PID alone, retain synchronous deadline/stage diagnostics and exit after healthy parent termination. Expose explicit spawn/early-exit/ready-timeout failure to the caller; import no graph/vector code. Readiness must include the native broker's validated stable handle. The Node wrapper imports built-ins only and launches the packaged broker; parenthood checks supplement rather than replace kernel-capability safety.

**Acceptance checks:**
- Disposable blocked parent ends at the configured deadline; normally exiting parent leaves no watchdog.
- Reparented/reused PID is never signalled and helper imports only Node built-ins.
- Ready is acknowledged before arming succeeds; spawn, early exit and timeout failures are observable.
- Compiled distribution includes both parent helper and child entrypoint.

### 1.7 TASK-fd8d70c3e8c397ea-s1-t5 — Integrate bounded shutdown while preserving store-health behavior

Wire watchdog arm/ready before native cleanup into createShutdown and daemon entrypoint. Preserve reentrancy, normal exit and lock-loss no-close/self-kill policy. Log stages and health synchronously. On watchdog launch/ready failure diagnose and self-kill before potentially blocked cleanup. Disconnect clients before awaiting ownership-guarded server close in the new serialized sequence. Reconcile src/db/graph/__tests__/helpers/store-child.ts writePid/createShutdown/server-close wiring so lock-loss and fatal tests exercise the new contract rather than bypass it.

**Acceptance checks:**
- Blocked cleanup and post-bye exit are bounded independently of the event loop.
- Watchdog failure self-kills before a blocked closeStores fake is invoked, without a CLI client.
- Normal cleanup order and existing lock-loss/fatal termination tests pass.
- Repeated signals arm one watchdog; orphaned/foreign run-file ownership remains a visible restart failure.

### 1.8 TASK-fd8d70c3e8c397ea-s1-t6 — Apply retained-target and guard rules to the control script

Update existing shell stop/wait/force-stop/restart functions to use the same identity/ownership contract, reusing shared Node helpers through a minimal internal executable if needed rather than duplicating weaker PID logic. Retain original target, verify before kill, preserve replacement files and surface unrecovered guard errors. Keep existing script user-facing commands. Remove cmd_restart's cmd_stop || true suppression. Explicitly return nonzero from cmd_start and cmd_restart on stop, capability or ownership failure before spawn_daemon, including shell conditional contexts.

**Acceptance checks:**
- Script waits or forces the captured process after PID/socket deletion.
- Reused PID, replacement files, missing helper/identity and orphan guard never trigger unsafe kill or successful restart.
- Disposable shell integration proves clean and forced-stop outcomes without touching the installed daemon.
- Both cmd_start and cmd_restart propagate every relevant failure before spawn_daemon; no reliance on errexit inside conditional/OR contexts.

### 1.9 TASK-fd8d70c3e8c397ea-s1-t7 — Record controlled shutdown evidence and verify the complete lifecycle

Run disposable blocked-exit, healthy-control, guard-owner-killed-during-close and restart-order scenarios. Write shutdown-investigation.md with exact commands/timestamps/PID-start markers/deadlines/results/source logs, and explicitly preserve the deferred historical-cause caveat. Verify packaging, targeted lifecycle suites and typecheck; report full-suite failures accurately. Installed-daemon restart smoke is excluded until separately authorized. The installed-daemon smoke remains a separately permission-gated deployment follow-up; this build documents that it was not run rather than substituting a fabricated result. Record Linux capability integration separately from the earlier feasibility probe; do not claim Darwin support without Darwin runtime evidence.

**Acceptance checks:**
- Required ac4 evidence document contains reproducible commands, timing, original process identity, configured bound, observed termination and healthy control with source logs.
- Killing a guard owner during async close returns ownership conflict and never starts a replacement.
- Documentation does not claim to establish the original October13 native cause or claim an unperformed installed-daemon smoke.
- Built helper is included in compiled output and backend validation results are recorded honestly.
- Acceptance reporting separates tested Linux behavior, unverified Darwin operational support, and separately authorized installed-daemon smoke.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/cli/services/__tests__/daemon-stop.test.ts: original PID remains alive after run files disappear, so natural stop is refused and forced stop targets the retained identity | `t1`, `t2`, `t3`, `t7` |
| src/cli/services/__tests__/daemon-stop.test.ts: RPC failure or timeout still waits for the captured target | `t3`, `t4`, `t5`, `t7` |
| src/cli/services/__tests__/daemon-stop.test.ts: PID reuse, replaced run files and unreadable identity never signal or delete another process | `t1`, `t2`, `t3`, `t7` |
| src/cli/services/__tests__/daemon-stop.test.ts: restart does not call start until stop verifies target exit | `t3`, `t4`, `t5`, `t7` |
| A disposable child enters a deliberately blocked exit hook after logging bye; the independent watchdog terminates it within the test bound | `t3`, `t4`, `t5`, `t7` |
| A normally exiting parent leaves no live watchdog and no signal targets a replacement process | `t1`, `t2`, `t3`, `t7` |
| Watchdog spawn/ready failure is diagnosed and selects final self-kill fallback | `t3`, `t4`, `t5`, `t7` |
| Control script waits on its captured daemon after PID/socket deletion and refuses an unrelated reused PID | `t6` |
| Watchdog launch/ready failure with a closeStores fake that would block: the fallback kills before calling closeStores, without a CLI client present. | `t3`, `t4`, `t5`, `t7` |
| src/daemon/__tests__/shutdown-store-failure.test.ts: lock-loss ending remains bounded and skips unsafe store close | `t5`, `t7` |
| Repeated shutdown signals arm only one watchdog and cleanup sequence | `t3`, `t4`, `t5`, `t7` |
| CLI StopOutcome and error handling remain compatible | `t3`, `t4`, `t5`, `t7` |
| Record original PID and start marker, restart once, confirm original identity is gone before replacement becomes ready; inspect synchronous diagnostics | `t7` |
| docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/shutdown-investigation.md: record the controlled blocked-exit reproduction command, timestamp, disposable process identity, configured deadlines, observed exit, healthy control and source log references. Explicitly state that reproducing a blocked exit does not establish the original 2026-10-13 native cause. The reviewer must verify all of these fields before accepting ac4; unresolved historical diagnosis remains visible unless the stakeholder defers it. | `t7` |
| Publish replacement PID/socket while original daemon drains: original cleanup detects foreign inode/owner, skips server.close and clearPid and selects diagnosed self-kill, preserving replacement files. | `t1`, `t2`, `t3`, `t7` |
| Race managed startup against original async server.close: guard excludes publication until close and owned cleanup finish. | `t1`, `t2`, `t3`, `t7` |
| Startup stale cleanup, fatal cleanup and clearPid never unlink foreign ownership; guard acquisition or unreadable owner fails closed. | `t1`, `t2`, `t3`, `t7` |
| Guard owner process exits unexpectedly: subsequent startup reports recoverable ownership conflict rather than deleting unknown run files or guessing ownership. | `t1`, `t2`, `t3`, `t7` |
| Kill a disposable guard owner while server.close is pending: stop reports ownership conflict and maintenance.restart never calls startDaemon. | `t1`, `t2`, `t3`, `t7` |
| Normal shutdown disconnects clients before awaiting server.close and releases the guard; a subsequent startup succeeds. | `t1`, `t2`, `t3`, `t7` |
| Shell stop/force-stop encountering an orphaned guard fails visibly and does not start a replacement. | `t6` |
| Open a Linux pidfd before identity validation, end the original disposable target, and prove a later signal through the retained handle cannot target another process; no numeric-PID kill fallback is reachable. | `t8`, `t9`, `t3`, `t4`, `t7` |
| Inject replacement between process identity observation and signal request: only the already-bound OS capability is used or the operation refuses. | `t8`, `t9`, `t3`, `t4`, `t7` |
| Broker unavailable, unsupported kernel/API and Darwin task-right permission failures withhold CLI restart and fail watchdog readiness before native cleanup. | `t8`, `t9`, `t3`, `t4`, `t7` |
| Managed replacement publishers cannot acquire the run-file guard during close/cleanup; replacements injected before acquisition survive. Do not claim arbitrary filesystem mutation is atomically excluded. | `t1`, `t2`, `t3`, `t7` |
| Existing daemon-run-files ownership, replacement-file and orphan tests pass with the managed-writer guarantee stated precisely. | `t1`, `t2`, `t3`, `t7` |
| The store-child fixture publishes owned run files and uses watchdog-ready, guarded asynchronous close; real shutdown-store-failure, fatal-exit and lock-loss tests preserve their original outcomes in temporary stores. | `t5`, `t7` |
| No production call can use the old Node check-then-act signal helper instead of a retained broker capability. | `t8`, `t9`, `t3`, `t4`, `t7` |
| cmd_restart with failed stop/capability/ownership returns nonzero and neither cmd_start nor spawn_daemon is reached. | `t8`, `t9`, `t3`, `t4`, `t7` |
| cmd_start stale-daemon cleanup with failed signal/wait/force-stop/capability/ownership returns nonzero before spawn_daemon, including invocation in shell conditional contexts. | `t8`, `t9`, `t3`, `t4`, `t7` |
| CLI maintenance.restart preserves stop rejection propagation and no longer receives a false success while the retained process remains alive. | `t3`, `t4`, `t5`, `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/LLD.md`
- **[[c2]]** `prior-artifact` `docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/LLD.md#6-test-strategy`
- **[[c3]]** `code` `src/shared/daemon-process.ts`
- **[[c4]]** `code` `src/daemon/server.ts`
- **[[c5]]** `code` `src/cli/services/daemon.ts`
- **[[c6]]** `code` `src/daemon/shutdown.ts`
- **[[c7]]** `code` `scripts/daemon-ctl.sh`
- **[[c8]]** `prior-artifact` `docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/LLD.md#7-migration`
- **[[c9]]** `doc` `https://man7.org/linux/man-pages/man2/pidfd_send_signal.2.html`
- **[[c10]]** `code` `src/db/graph/__tests__/helpers/store-child.ts`
- **[[c11]]** `code` `package.json`
- **[[c12]]** `code` `copy-assets.mjs`
