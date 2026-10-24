<!-- insrc:artifact LLD-fd8d70c3e8c397ea-s1 -->

# LLD: STORY-fd8d70c3e8c397ea-s1

## Summary

**Epic:** `daemon-stop-must-wait-process-end`
**HLD base run:** `wf-1792849046705-rsj1ro`
**HLD effective hash:** `303726ece569...`

A restart will keep watching the daemon process it originally asked to stop, even after that process removes its PID file and socket. A small independent watchdog will preserve normal graceful exits while bounding a native shutdown hang; it opens no database. The original October 13 native failure remains an explicitly unproven diagnosis.

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
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `waitForStop`

```typescript
waitForStop(timeoutMs?: number, target?: { pid: number; startedAt: string; commandLine: string }): Promise<boolean>
```

**Parameters:**
- `timeoutMs: number` _(optional)_ — Bound the wait; existing default remains 30 seconds.
- `target: { pid: number; startedAt: string; commandLine: string }` _(optional)_ — The process identity captured before requesting shutdown; optional only for backward compatibility.

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

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Daemon exits normally before the watchdog deadline. | Watchdog observes reparenting and exits without signalling the original numeric PID, even if reused. |
| A second SIGTERM arrives during shutdown. | Keep shutdown idempotent; no second watchdog or duplicate cleanup. |
| LMDB lock-loss path is selected. | Preserve the existing no-close/self-kill behavior; watchdog is a fallback, not a replacement store policy. |
| No PID file exists before stop but the socket responds. | Resolve the daemon identity before requesting shutdown or fail clearly if it cannot be verified; never assume absent files prove exit. |

**Invariants to preserve**

- Stop still has bounded RPC, orderly wait and verified forced-stop phases; StopOutcome shape remains compatible. Grounded by s1 read-fallback. [[c2]]
- Existing store-health-aware termination and reentrancy protection remain. Grounded by s1 shutdown bundle and read-fallback. [[c3]]
- The control script and CLI both enforce process termination before restart. Grounded by s1 read-fallback. [[c4]]

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

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Retained target remains live after PID/socket deletion; both CLI and script wait and force-stop that identity before reporting stopped.` |
| `ac2` | `A blocked post-bye exit hook is terminated by the independent helper; a healthy parent exit leaves no surviving helper.` |
| `ac3` | `PID reuse/replacement and identity failures never kill another process or launch a replacement after failed stop.` |
| `ac4` | `Record reproducible blocked-exit evidence and state explicitly that the historical 2026-10-13 native cause is not established.` |

## 7. Migration

**State before:** The s1 symbol/caller bundle locates waitForStop, stopDaemonWith and createShutdown. The read-fallback after failed text probes establishes file-disappearance-based stop success and loss of the original PID after shutdown clears it. Healthy exit currently uses process.exit, which cannot be rescued by an in-process timer if a native exit hook blocks.

**State after:** CLI and shell retain a verified target identity before signal/RPC and report stopped only after it exits. Shutdown arms a built-in-only independent watchdog before native cleanup; normal exits remain graceful and abnormal hangs are diagnosed and bounded. No DB schema, registry contract or IPC method changes.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

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

## 10. Open questions

- The exact cause of the 2026-10-13 native hang is not recoverable from available evidence. Is a controlled blocked-exit reproduction plus explicit diagnostic caveat acceptable, or must implementation wait for a reproduction of that original native failure?
- The standalone Story has no structured acceptance criteria. ac1-ac4 in this design are derived from the approved ISSUE fix intent; confirm that mapping before plan.
