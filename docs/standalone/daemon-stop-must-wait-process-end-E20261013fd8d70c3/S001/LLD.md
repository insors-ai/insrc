<!-- insrc:artifact LLD-fd8d70c3e8c397ea-s1 -->

# LLD: STORY-fd8d70c3e8c397ea-s1

## Summary

**Epic:** `daemon-stop-must-wait-process-end`
**HLD base run:** `wf-1792849046705-rsj1ro`
**HLD effective hash:** `303726ece569...`

A restart will keep watching the daemon process it originally asked to stop, even after that process removes its PID file and socket. A small independent watchdog will preserve normal graceful exits while bounding a native shutdown hang; it opens no database. The original October 13 native failure remains an explicitly unproven diagnosis. Stakeholder decision on 2026-10-24: implement reliable termination now; defer the original 2026-10-13 native-hang diagnosis. Controlled reproduction and diagnostic documentation are required for this work, but do not establish the original historical cause. Historical diagnosis remains deferred follow-up, not a completed acceptance claim. Build validation exposed check-then-act races in the Node-only process signal and generic inode-check/unlink implementation. Proposed refinement: use stable OS process capabilities and explicitly scope filesystem exclusion to cooperating managed publishers. Approval of this design revision is required before resuming implementation.

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

### 2.1 `waitForStop`

```typescript
waitForStop(timeoutMs?: number, target?: StopTarget): Promise<boolean>
```

**Parameters:**
- `timeoutMs: number` _(optional)_ — Bound the wait; existing default remains 30 seconds.
- `target: StopTarget` _(optional)_ — Retained broker-backed kernel process capability plus identity captured before RPC; optional only for backward-compatible non-destructive callers.

**Returns:** `Promise<boolean>` — True only after the captured process has exited (or its PID belongs to a different process) and managed run-file state is safe; PID/socket removal alone is insufficient.

**Errors:**
- `Error` when An identity cannot be verified safely or another process has replaced the managed run files; do not claim successful stop.

**Preconditions:**
- Capture PID, process start marker and daemon command before requesting shutdown.
- Do not repeatedly replace the target from the PID file while waiting.

**Postconditions:**
- A true result cannot leave the captured daemon process running.
- A replacement process is never signalled or its run files deleted.

### 2.2 `stopDaemonWith`

```typescript
stopDaemonWith(deps: StopDeps): Promise<StopOutcome>
```

**Parameters:**
- `deps: StopDeps` — Inject capture and comparison of process identity in addition to the existing request/wait/signal seams.

**Returns:** `Promise<StopOutcome>` — Existing result shape; stopped is true only after the original daemon exits, naturally or through verified forced termination.

**Errors:**
- `Error` when Shutdown or SIGKILL cannot end the original target, identity becomes unverifiable, or a replacement owns current run files.

**Preconditions:**
- Capture target identity before requestShutdown, including when the RPC times out or closes early.
- Require the expected daemon command suffix and original start marker before forced termination.
- The retained stop target owns a stable OS process capability captured before RPC; identity comparison alone does not authorize numeric-PID signalling.

**Postconditions:**
- Restart callers do not start another daemon while the captured process is alive.
- On timeout, use the retained target even if its PID file vanished.

### 2.3 `createShutdown`

```typescript
createShutdown(parts: ShutdownParts): (signal: string) => void
```

**Parameters:**
- `parts: ShutdownParts` — Existing queue/store cleanup plus an injected watchdog arm/ready seam and synchronous final diagnostics.

**Returns:** `(signal: string) => void` — Idempotent shutdown handler; arm independent termination protection before any native cleanup, then retain existing orderly cleanup and healthy exit.

**Errors:**
- `Error` when Watchdog spawn, early exit or ready timeout: write a synchronous diagnostic and invoke the existing self-kill path BEFORE native cleanup; do not await closeStores without independent protection.

**Preconditions:**
- The watchdog imports only Node built-ins and never graph/vector modules.
- The child acknowledges readiness before the daemon enters native cleanup or exit.
- Watchdog readiness includes successful acquisition and validation of a stable OS capability for the original daemon; failure self-kills before native cleanup.

**Postconditions:**
- A healthy shutdown exits normally and the watchdog exits without signalling anyone.
- A still-parent daemon that exceeds the deadline is diagnosed and terminated by the watchdog; reparented/replaced PIDs are not targeted.

## 3. Data model changes

### 3.1 `StopDeps` — field-add

Add injectable capture/compare process identity seams. Target is ephemeral: PID, OS process-start marker and full command line, captured once before RPC. Apply the same capture-before-signal rule in scripts/daemon-ctl.sh using its existing stop/force-stop functions. Failed identity reads must withhold destructive signalling rather than guess.

**Call sites:**
- `src/cli/services/daemon.ts`
- `src/cli/services/lifecycle.ts`
- `scripts/daemon-ctl.sh`

### 3.2 `ShutdownParts` — field-add

Inject an independent watchdog arm/ready seam for deterministic tests. A new internal Node-only helper process is launched at shutdown with parent PID, fixed deadline and diagnostic-log path; it checks that the daemon is still its parent before any signal. Record stage and store-health information synchronously. It exits silently after normal parent termination and must not keep the CLI waiting.

**Call sites:**
- `src/daemon/shutdown.ts`

### 3.3 `Managed run-file ownership` — invariant-change

Capture PID-file and socket identity (device/inode plus PID/start marker ownership) at publication. All cooperating daemon startup publication and shutdown cleanup serialize through one cross-process run-file guard, acquired atomically by mkdir with an owner nonce and verified process identity; fail closed on unreadable or orphaned ownership rather than reclaiming a live or unverified lock. Hold the guard across asynchronous server.close completion, PID/socket verification and removal. Startup must acquire this same guard before isAlreadyRunning, stale cleanup, PID write and socket bind; release only after the publication phase completes. Shutdown acquires it before request-server close, verifies captured file identities and current PID ownership, and never unlinks a mismatched file. If replacement files already exist, skip server.close (including its implicit Unix-socket unlink) and clearPid; synchronously diagnose ownership loss and use the no-exit-hook self-kill path. The guard prevents a cooperating replacement from publishing between verification and unlink. clearPid accepts ownership evidence and never unconditionally removes current paths; server.listen/close and all startup-error/fatal cleanup use the same ownership contract. Preserve any foreign run files and report conflict. Do not use a check-then-unlink without serialization as a claimed race guarantee. Recovery policy: this change deliberately does not auto-reclaim an orphaned guard. After the original process exits or is killed, stopDaemonWith and the shell stop path inspect the run-file guard. If a guard remains and ownership cannot be safely released, return an explicit ownership-conflict error, not StopOutcome.stopped=true; maintenance.restart must not call startDaemon. Include guard owner PID/start marker/nonce and path in the diagnostic so an operator can verify the owner is dead and quarantine that guard before retrying. Never silently delete a guard based on numeric PID absence alone. Graceful shutdown disconnects request clients before awaiting server.close under the guard, preventing a close dependency introduced by the new awaited/serialized shutdown sequence; current stopBackgroundWork calls void server.close and does not block closeStores. If the watchdog terminates a guard owner, the CLI surfaces the unrecovered conflict and withholds restart. This preserves the stop failure contract while preventing a competing daemon or unsafe automatic recovery. Guarantee boundary: the guard serializes ALL cooperating insrc run-file publishers and removers, including startup, CLI, shell, fatal cleanup and asynchronous socket close. Capture owner nonce and file fingerprints under that same guard. A matching inode check followed by unlink is NOT an atomic conditional-unlink primitive and must never be described as protection against arbitrary same-user filesystem mutation outside this protocol. Observed foreign file identity or guard replacement fails closed. Tests simulate managed replacement attempts through the guard while close is pending; they must also inject replacement before cleanup and prove no deletion. No malicious same-user filesystem isolation is claimed. Existing-foundation audit: reuse src/shared/daemon-run-files.ts atomic mkdir acquisition, owner nonce, captured file fingerprints and explicit orphan diagnostics. Revise its API/documentation and tests so removeOwnedRunFile requires the shared guard to cover all cooperating managed publication/removal and does not advertise an atomic inode-conditional unlink. Reconcile every caller as the lifecycle cleanup contract changes. The generic check-then-act signalVerifiedProcess in src/shared/daemon-process.ts is NOT a signalling authority and must be replaced by the broker-backed capability before production wiring. Existing eight foundation tests are useful regression checks only, not proof of the new capability guarantees.

**Call sites:**
- `src/daemon/lifecycle.ts`
- `src/daemon/server.ts`
- `src/daemon/index.ts`
- `src/daemon/shutdown.ts`
- `src/cli/services/lifecycle.ts`
- `scripts/daemon-ctl.sh`
- `src/cli/services/daemon.ts`
- `src/cli/services/maintenance.ts`
- `src/shared/daemon-run-files.ts`
- `src/shared/__tests__/daemon-run-files.test.ts`
- `src/shared/__tests__/daemon-process.test.ts`
- `src/db/graph/__tests__/helpers/store-child.ts`

### 3.4 `Stable process-handle broker` — field-add

Replace identity-check followed by process.kill with a small packaged OS-native broker behind the Node shared interface. On Linux, open a pidfd FIRST, then verify the retained OS start marker and command while that handle is held; signal and observe exit only through pidfd_send_signal/poll on that retained handle. Never fall back to numeric-PID kill. On Darwin, acquire and validate a stable Mach task right before readiness; use that retained task capability for termination. Permission denial, unsupported APIs or unavailable broker are explicit failures: CLI stop fails and withholds restart; watchdog arming fails and selects the already-specified synchronous diagnostic/self-kill-before-cleanup path. No privilege escalation, task-port entitlement changes or unsafe compatibility fallback. Darwin runtime support remains conditional on obtaining the task capability and requires platform-specific validation. The broker is an internal compiled executable, opens no database, performs no network calls, and accepts only a verified target/termination operation. The Node watchdog still imports only Node built-ins and launches this broker via child_process. Package the executable with the daemon; compile through the normal build with the local C toolchain, never download or compile code at shutdown. Runtime requires no compiler. Native launch/ready failure is tested explicitly. Actual build wiring: package.json build becomes tsc, then node build-process-broker.mjs, then node copy-assets.mjs. The new internal build-process-broker.mjs compiles the local broker source into the shipped out/bin executable for the host platform. The existing root copy-assets.mjs remains the assets copier; there is no scripts/copy-assets.mjs. On Darwin use a unique process-incarnation identifier from the OS broker, not second-resolution ps lstart as a signalling authority. A StopTarget retains the broker-owned kernel capability from before shutdown RPC through exit observation/forced termination; no Node identity-check/kill fallback. New broker/watchdog/platform tests and investigation evidence are mandatory future acceptance work, and are not established by the existing eight foundation tests. Store-child compatibility audit: src/db/graph/__tests__/helpers/store-child.ts currently calls writePid(), constructs createShutdown(), and starts void server.close() in stopBackgroundWork. Update this disposable fixture to use the same publication ownership, watchdog readiness and guarded disconnect-before-awaited-close contract as the real daemon, with its own temporary paths. Preserve its real lock-loss/no-close and fatal-exit reproduction behavior; do not bypass the new contract or touch the installed store to keep tests green. Update the corresponding shutdown-store-failure and lock-loss suites when these fixture seams change.

**Call sites:**
- `src/shared/daemon-process.ts`
- `src/daemon/shutdown.ts`
- `copy-assets.mjs`
- `package.json`
- `build-process-broker.mjs`
- `src/shared/daemon-run-files.ts`
- `src/shared/__tests__/daemon-run-files.test.ts`
- `src/shared/__tests__/daemon-process.test.ts`
- `src/db/graph/__tests__/helpers/store-child.ts`

### 3.5 `StopTarget` — field-add

Ephemeral internal target containing pid, OS start/incarnation marker, daemon command and a StableProcessHandle owned by the broker. Capture the kernel capability before RPC. The handle exposes hasExited(), terminate() and close(); terminate targets only that retained capability. Numeric PID is diagnostic metadata, never the forced-signal target. Preserve the external StopOutcome and existing IPC payloads.

**Call sites:**
- `src/shared/daemon-process.ts`
- `src/cli/services/lifecycle.ts`
- `src/cli/services/daemon.ts`
- `src/daemon/shutdown.ts`

### 3.6 `Control script stop/start/restart outcome propagation` — invariant-change

NEW behavior established by this issue, not a current invariant: actual original-process termination and safe run-file/guard state are required before either CLI or shell restart can launch a daemon. scripts/daemon-ctl.sh currently has cmd_restart calling cmd_stop || true and then cmd_start; remove that suppression and explicitly propagate failure. cmd_start must also propagate signal_stop, retained-target wait, force-stop, capability acquisition and ownership/guard failure instead of reaching spawn_daemon. Do not rely on shell errexit inside conditionals or OR lists; return explicit nonzero failure before spawn_daemon at each relevant boundary. The CLI already propagates a rejected stop but currently accepts a false-success stop based on absent files; correct that success predicate while preserving rejection propagation. The managed ownership guard is likewise a new guarantee, not existing behavior.

**Call sites:**
- `scripts/daemon-ctl.sh`
- `src/cli/services/daemon.ts`
- `src/cli/services/lifecycle.ts`
- `src/cli/services/maintenance.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Original daemon removes its PID/socket before exiting.** (recoverable)
  - Detection: Retained identity still matches a live process even though run files are absent.
  - Response: Continue waiting for that captured process; at the stop deadline verify identity again and use the existing forced-kill path.
  - User impact: Restart waits or reports an error instead of starting beside the old daemon.
- **PID is reused or a replacement daemon owns the run files.** (recoverable)
  - Detection: OS start marker or command differs from the captured identity, or the PID file now names a different target.
  - Response: Never signal the replacement or remove its run files; report replacement/identity conflict explicitly.
  - User impact: No unrelated process is killed and a competing restart is visible.
- **RPC hangs, closes early, or fails after the target was captured.** (recoverable)
  - Detection: Existing bounded RPC settles with timeout/transport failure while captured process identity is still live.
  - Response: Proceed to retained-target wait and verified forced termination; do not treat transport failure as proof of stop.
  - User impact: A broken socket cannot bypass the stop deadline.
- **Native cleanup or an exit hook blocks the main thread after shutdown starts.** (recoverable)
  - Detection: The independent helper reaches its deadline and the daemon is still its parent.
  - Response: Write stage/health diagnostics synchronously and terminate that parent; no DB open or close in the helper.
  - User impact: The daemon cannot remain alive indefinitely after bye.
- **Watchdog fails to spawn or acknowledge readiness.** (recoverable)
  - Detection: Spawn error, child exit before ready, or ready handshake timeout.
  - Response: Record a synchronous diagnostic and self-terminate BEFORE entering queue/store native cleanup. Do not wait for closeStores and do not rely on an in-process timer or an external CLI caller. This exceptional path sacrifices graceful cleanup to uphold bounded termination and must be tested with blocked-cleanup fakes.
  - User impact: Failure is visible; the daemon does not silently claim independent exit protection exists.
- **Force kill fails or identity cannot be revalidated.** (recoverable)
  - Detection: Signal throws, process remains after kill-wait, or OS identity probe is unreadable.
  - Response: Return a stop failure and prevent restart; preserve ownership evidence for diagnosis.
  - User impact: No false stopped result.
- **Watchdog or forced stop kills the run-file guard owner during asynchronous close.** (recoverable)
  - Detection: Original captured process has ended but the run-file guard remains and cannot be released under verified ownership.
  - Response: Return an explicit ownership-conflict stop/restart failure; do not return stopped=true and do not launch startDaemon. Include guard evidence and manual verified-dead quarantine instructions; no automatic orphan reclamation.
  - User impact: Restart fails clearly instead of launching beside an unsafe or unverified run-file state. An operator resolves the orphan before retrying.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Daemon exits normally before the watchdog deadline. | Watchdog observes reparenting and exits without signalling the original numeric PID, even if reused. |
| A second SIGTERM arrives during shutdown. | Keep shutdown idempotent; no second watchdog or duplicate cleanup. |
| LMDB lock-loss path is selected. | Preserve the existing no-close/self-kill behavior; watchdog is a fallback, not a replacement store policy. |
| No PID file exists before stop but the socket responds. | Resolve the daemon identity before requesting shutdown or fail clearly if it cannot be verified; never assume absent files prove exit. |

**Invariants to preserve**

- Preserve the existing bounded-RPC, wait and forced-stop phase structure and external StopOutcome shape; this change strengthens target identity and the successful-stop condition. [[c2]]
- Existing store-health-aware termination and reentrancy protection remain. Grounded by s1 shutdown bundle and read-fallback. [[c3]]

## 6. Test strategy

**Test framework:** `node:test via tsx for backend and shell integration; confirmed by direct reads of the existing backend tests after graph test retrieval returned unrelated JetBrains cases.`

**Test levels**

- **unit** — Extend stop dependency-seam tests for retained identity and truthful outcomes.
  - Subjects: `src/cli/services/__tests__/daemon-stop.test.ts: original PID remains alive after run files disappear, so natural stop is refused and forced stop targets the retained identity`, `src/cli/services/__tests__/daemon-stop.test.ts: RPC failure or timeout still waits for the captured target`, `src/cli/services/__tests__/daemon-stop.test.ts: PID reuse, replaced run files and unreadable identity never signal or delete another process`, `src/cli/services/__tests__/daemon-stop.test.ts: restart does not call start until stop verifies target exit`
  - Fixtures: `Fake process table with distinct PID/start marker/command identities and a controllable clock`
- **integration** — Prove termination protection outside the daemon event loop without touching a live store.
  - Subjects: `A disposable child enters a deliberately blocked exit hook after logging bye; the independent watchdog terminates it within the test bound`, `A normally exiting parent leaves no live watchdog and no signal targets a replacement process`, `Watchdog spawn/ready failure is diagnosed and selects final self-kill fallback`, `Control script waits on its captured daemon after PID/socket deletion and refuses an unrelated reused PID`, `Watchdog launch/ready failure with a closeStores fake that would block: the fallback kills before calling closeStores, without a CLI client present.`
  - Fixtures: `Temporary run files and logs`, `Disposable child processes with shortened deadlines`, `Fake process identity/signal commands for shell tests`
- **contract** — Preserve existing shutdown and store-failure behavior.
  - Subjects: `src/daemon/__tests__/shutdown-store-failure.test.ts: lock-loss ending remains bounded and skips unsafe store close`, `Repeated shutdown signals arm only one watchdog and cleanup sequence`, `CLI StopOutcome and error handling remain compatible`
  - Fixtures: `Existing EndDeps fakes and shutdown store-failure fixture`
- **smoke** — Check the installed shutdown lifecycle only when explicitly authorized, after unit/integration checks.
  - Subjects: `Record original PID and start marker, restart once, confirm original identity is gone before replacement becomes ready; inspect synchronous diagnostics`
  - Fixtures: `Stakeholder-authorized installed-daemon restart; never run during another workflow automatically`
- **smoke** — Required manual documentation acceptance for ac4; this is not an automated or already-passed test.
  - Subjects: `docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/shutdown-investigation.md: record the controlled blocked-exit reproduction command, timestamp, disposable process identity, configured deadlines, observed exit, healthy control and source log references. Explicitly state that reproducing a blocked exit does not establish the original 2026-10-13 native cause. The reviewer must verify all of these fields before accepting ac4; unresolved historical diagnosis remains visible unless the stakeholder defers it.`
  - Fixtures: `Controlled disposable-process run evidence; original historical smoke/log references where available`
- **integration** — Prove daemon-side replacement run-file safety and serialized publication/cleanup, including implicit server-close unlink.
  - Subjects: `Publish replacement PID/socket while original daemon drains: original cleanup detects foreign inode/owner, skips server.close and clearPid and selects diagnosed self-kill, preserving replacement files.`, `Race managed startup against original async server.close: guard excludes publication until close and owned cleanup finish.`, `Startup stale cleanup, fatal cleanup and clearPid never unlink foreign ownership; guard acquisition or unreadable owner fails closed.`, `Guard owner process exits unexpectedly: subsequent startup reports recoverable ownership conflict rather than deleting unknown run files or guessing ownership.`
  - Fixtures: `Temporary PID/socket paths with distinct file identities`, `Disposable original/replacement processes and controllable server-close promise`
- **integration** — Prove the orphan-guard stop/restart contract and avoid async close ordering deadlock.
  - Subjects: `Kill a disposable guard owner while server.close is pending: stop reports ownership conflict and maintenance.restart never calls startDaemon.`, `Normal shutdown disconnects clients before awaiting server.close and releases the guard; a subsequent startup succeeds.`, `Shell stop/force-stop encountering an orphaned guard fails visibly and does not start a replacement.`
  - Fixtures: `Disposable child guard owner`, `Temporary guard PID/start/nonce record`, `Controlled connected clients and deferred close callback`
- **integration** — Validate the stable-handle refinement and precise managed-writer exclusion guarantee.
  - Subjects: `Open a Linux pidfd before identity validation, end the original disposable target, and prove a later signal through the retained handle cannot target another process; no numeric-PID kill fallback is reachable.`, `Inject replacement between process identity observation and signal request: only the already-bound OS capability is used or the operation refuses.`, `Broker unavailable, unsupported kernel/API and Darwin task-right permission failures withhold CLI restart and fail watchdog readiness before native cleanup.`, `Managed replacement publishers cannot acquire the run-file guard during close/cleanup; replacements injected before acquisition survive. Do not claim arbitrary filesystem mutation is atomically excluded.`
  - Fixtures: `Disposable process capability broker`, `Injected unavailable/permission-denied platform seams`, `Actual Linux pidfd integration; Darwin runtime validation on Darwin before claiming that platform works`
- **integration** — Audit compatibility of the already-implemented guard foundations and real store-child fixture under the refined shutdown contracts.
  - Subjects: `Existing daemon-run-files ownership, replacement-file and orphan tests pass with the managed-writer guarantee stated precisely.`, `The store-child fixture publishes owned run files and uses watchdog-ready, guarded asynchronous close; real shutdown-store-failure, fatal-exit and lock-loss tests preserve their original outcomes in temporary stores.`, `No production call can use the old Node check-then-act signal helper instead of a retained broker capability.`
  - Fixtures: `src/shared/daemon-run-files.ts`, `src/shared/__tests__/daemon-run-files.test.ts`, `src/shared/__tests__/daemon-process.test.ts`, `src/db/graph/__tests__/helpers/store-child.ts`
- **integration** — Prove newly established shell stop-failure propagation and truthful restart admission.
  - Subjects: `cmd_restart with failed stop/capability/ownership returns nonzero and neither cmd_start nor spawn_daemon is reached.`, `cmd_start stale-daemon cleanup with failed signal/wait/force-stop/capability/ownership returns nonzero before spawn_daemon, including invocation in shell conditional contexts.`, `CLI maintenance.restart preserves stop rejection propagation and no longer receives a false success while the retained process remains alive.`
  - Fixtures: `Disposable shell command harness with spawn_daemon spy`, `Injected stop/capability/ownership failures and controlled process table`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Retained target remains live after PID/socket deletion; both CLI and script wait and force-stop that identity before reporting stopped.` |
| `ac2` | `A blocked post-bye exit hook is terminated by the independent helper; a healthy parent exit leaves no surviving helper.` |
| `ac3` | `PID reuse/replacement and identity failures never kill another process or launch a replacement after failed stop.` |
| `ac4` | `Inspect docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/shutdown-investigation.md for controlled reproduction command/time/identity/deadline/outcome, healthy control, source references and the explicit historical-cause caveat. Stakeholder decision on 2026-10-24: implement reliable termination now; defer the original 2026-10-13 native-hang diagnosis. Controlled reproduction and diagnostic documentation are required for this work, but do not establish the original historical cause. Historical diagnosis remains deferred follow-up, not a completed acceptance claim.` |

## 7. Migration

**State before:** The s1 symbol/caller bundle locates waitForStop, stopDaemonWith and createShutdown. The read-fallback after failed text probes establishes file-disappearance-based stop success and loss of the original PID after shutdown clears it. Healthy exit currently uses process.exit, which cannot be rescued by an in-process timer if a native exit hook blocks.

**State after:** CLI and shell retain a verified target identity before signal/RPC and report stopped only after it exits. Shutdown arms a built-in-only independent watchdog before native cleanup; normal exits remain graceful and abnormal hangs are diagnosed and bounded. No DB schema, registry contract or IPC method changes.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

0. Refine the shared process capability boundary and package the OS-native broker with the Node wrappers; validate capability acquisition on each supported platform before enabling forced signalling. Revise the approved PLAN before implementation resumes. — ↩ rollbackable
1. Add identity capture/comparison and extend stop/wait test seams without changing StopOutcome; keep old call signatures compatible. — ↩ rollbackable
2. Introduce and package the internal watchdog helper; require ready handshake before native cleanup and record launch failure/fallback. — ↩ rollbackable
3. Wire retained-target waiting and verified force-stop into both the CLI service and control script; add restart-order tests. — ↩ rollbackable
4. Run disposable-process blocked-exit and healthy-exit tests, then request explicit permission before an installed-daemon restart smoke. — ↩ rollbackable

**Backward compat:** No public IPC changes or persisted migration. waitForStop gains an optional retained-target argument; existing callers remain supported but the stop service supplies it. StopOutcome remains unchanged. Deploy the daemon and helper together so a missing helper cannot be mistaken for protected shutdown.

## 8. Alternatives considered

### 8.1 a1: Retained process identity and final self-termination

Track the original daemon PID through stop and use the existing synchronous final-log/self-kill path for every shutdown.

Capture the daemon PID before requesting shutdown and retain it for waiting and forced termination in the CLI and shell script. After explicit queue/store cleanup, write the final diagnostic synchronously and call the existing killSelf primitive rather than entering native process.exit hooks. No persisted schema changes.

**Rejected because:** Meets the termination contract but replaces every healthy process exit with a signal and requires proving all exit-hook cleanup redundant.

### 8.2 a2: Retained identity with independent shutdown watchdog — **CHOSEN**

Keep graceful exit behavior, but arm a separate process to enforce the shutdown deadline.

Capture stop-target identity before RPC and retain it across PID-file deletion. Arm a minimal child watchdog before shutdown; it imports no database code, remains independent of the daemon event loop and native exit hooks, and ends the original parent at the bounded deadline only while it is still that watchdog's parent. Normal parent exit disarms it. The CLI and control script also retain their original target while waiting.

## 9. References

- **[[c1]]** `code` `src/cli/services/lifecycle.ts:44` — "waitForStop returns success when PID and socket files are absent."
- **[[c2]]** `code` `src/cli/services/daemon.ts:172` — "stopDaemonWith composes bounded RPC, wait and verified forced stop."
- **[[c3]]** `code` `src/daemon/shutdown.ts:115` — "Shutdown clears the PID file and logs bye before exitRespectingStoreHealth."
- **[[c4]]** `code` `scripts/daemon-ctl.sh:199` — "wait_for_daemon_stop is the control-script stop wait."
- **[[c5]]** `prior-artifact` `ISSUE-fd8d70c3e8c397ea`
- **[[c6]]** `analyze-bundle` `insrc_analyze_step daemon stop and shutdown process-identity lookup; two text probes failed with ENOTDIR and were followed by direct reads.`
- **[[c7]]** `code` `src/daemon/lifecycle.ts:28`
- **[[c8]]** `doc` `https://man7.org/linux/man-pages/man2/pidfd_send_signal.2.html` — "The pidfd_send_signal() system call allows the avoidance of race conditions that occur when using traditional interfaces"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 6 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-24T17:35:44.367Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
