<!-- insrc:artifact PLAN-b6c90b3e0240d36c-s1 -->

# Plan: E20260923b6c90b3e:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790186611682-mjsvhz`
**LLD effective hash:** `0a15cb12814d...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add sc1 payload types + two PATHS entries | S | — | unit: types + PATHS compile-time check: DaemonUpdateResult/DaemonUpdateOutcome shapes and PATHS.updateOutcome/updateLock resolve under the daemon home (tsc + a paths presence assertion) | [[c2]] [[c3]] |
| 2 | **`t2`** Build the update-runner module (launch guard + detached spawn + outcome writer/reader) with an injected spawn seam | L | `t1` | unit: launchUpdate: injected fake spawn records argv resolving to daemon-ctl.sh restart with { detached:true, unref, stdio-to-log }; unit: launchUpdate guard: a live updateLock marker throws 'update already in progress' and does NOT spawn; a stale/dead-pid marker is ignored and the launch proceeds; unit: launchUpdate resolve failure: an unresolvable DAEMON_ROOT/daemon-ctl.sh throws 'cannot locate daemon root / helper' before any spawn or marker write; unit: outcome writer: zero exit -> state:'succeeded'; non-zero exit/timeout -> state:'failed'+raw error; marker cleared in both cases; unit: readUpdateOutcome: parses a present record; returns null on ENOENT and on unparseable JSON (never throws) | [[c1]] [[c3]] [[c4]] [[c5]] |
| 3 | **`t3`** Register daemon.update + daemon.updateOutcome handlers + ipc-client typing | M | `t2` | integration: daemon.update handler: via internals(server).handleMessage returns { launched:true } through the injected launch seam without exiting the test process; integration: daemon.update handler: a live-marker guard failure surfaces as a result.error envelope ('update already in progress') per the analyze-rpc.test.ts framing; integration: daemon.updateOutcome handler: returns the last DaemonUpdateOutcome, and null when no record exists | [[c1]] [[c2]] [[c6]] |

### E20260923b6c90b3e:S001:T001 — Add sc1 payload types + two PATHS entries

Define the DaemonUpdateParams / DaemonUpdateResult / DaemonUpdateOutcome types near DaemonStatus in src/shared/types.ts, and add the two additive daemon-home path entries (updateOutcome record file + updateLock marker) to PATHS in src/shared/paths.ts next to pidFile. Pure additive declarations; no logic, no touch to daemon.status/sc2.

**Acceptance checks:**
- src/shared/types.ts exports DaemonUpdateResult { launched:boolean; message?:string } and DaemonUpdateOutcome { state:'succeeded'|'failed'; error?:string; finishedAt:string } (+ DaemonUpdateParams)
- src/shared/paths.ts adds PATHS.updateOutcome and PATHS.updateLock under INSRC_DIR, alongside pidFile
- tsc clean; no change to DaemonStatus or any daemon.status field

### E20260923b6c90b3e:S001:T002 — Build the update-runner module (launch guard + detached spawn + outcome writer/reader) with an injected spawn seam

New module src/daemon/update-runner.ts realizing the sc1-internal mechanism, exporting launchUpdate and readUpdateOutcome as INDEPENDENT, independently-testable functions (per the s3 critique): resolve DAEMON_ROOT ($INSRC_DAEMON_ROOT ?? ~/.insrc/daemon) + the daemon-ctl.sh path (throw 'cannot locate daemon root / helper' if missing); a concurrent-launch guard over PATHS.updateLock with stale-marker (dead-pid/aged) detection (throw 'update already in progress' when live); spawn a DETACHED, unref'd child running daemon-ctl.sh restart with stdio-to-log (the daemon.ts:66 detached:true idiom) via an INJECTED spawn fn; an outcome writer (state:'succeeded'|'failed' + raw error + finishedAt to PATHS.updateOutcome, clears the marker); and the best-effort readUpdateOutcome (parse PATHS.updateOutcome; return null on ENOENT/parse error, never throw). No real restart in the module; the shutdown trigger is an injected seam too.

**Acceptance checks:**
- launchUpdate and readUpdateOutcome are separately exported and can be unit-tested in isolation (per the s3 critique)
- launchUpdate() spawns the detached child with argv resolving to daemon-ctl.sh restart and { detached:true, unref, stdio-to-log } via the injected spawn seam
- A live updateLock marker makes launchUpdate throw 'daemon.update: update already in progress' and NOT spawn; a stale/dead-pid marker is ignored and the launch proceeds
- An unresolvable DAEMON_ROOT/daemon-ctl.sh makes launchUpdate throw 'daemon.update: cannot locate daemon root / helper' before any spawn/marker write
- readUpdateOutcome() returns the parsed DaemonUpdateOutcome for a present record and null for absent/unparseable (never throws)
- the outcome writer records state:'succeeded' on zero exit and state:'failed'+raw error on non-zero/timeout, clearing the marker in both cases

### E20260923b6c90b3e:S001:T003 — Register daemon.update + daemon.updateOutcome handlers + ipc-client typing

Wire the two thin handlers into the object-literal handler map in src/daemon/index.ts: daemon.update calls update-runner.launchUpdate() (via injected seams), returns { launched:true, message? }, then triggers the daemon's own shutdown() AFTER returning (injected so tests aren't killed); daemon.updateOutcome calls update-runner.readUpdateOutcome() and returns DaemonUpdateOutcome | null. Add the two typed client wrappers to src/shared/ipc-client.ts (as with status()). Handlers throw on the guard/resolve failures so the server frames result.error.

**Acceptance checks:**
- 'daemon.update' and 'daemon.updateOutcome' are entries in the src/daemon/index.ts handler map
- daemon.update returns { launched:true } via the injected launch seam and does not exit the process in-test; a live-marker guard failure surfaces as a result.error envelope
- daemon.updateOutcome returns the last DaemonUpdateOutcome or null
- src/shared/ipc-client.ts exposes typed update() and updateOutcome() wrappers; daemon.status/sc2 is untouched
- tsc clean across daemon + shared

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the launch module: spawns the detached child with the right argv (daemon-ctl.sh restart) + detached:true/unref/stdio-to-log flags (inject a fake spawn fn and assert the call shape) | `t2` |
| the concurrent-launch guard: with a live marker present it throws 'update already in progress' and does NOT spawn; with a stale marker (dead pid / aged) it proceeds | `t2` |
| the outcome writer: on a captured non-zero exit it writes DaemonUpdateOutcome{state:'failed',error,finishedAt} and clears the marker; on zero exit writes state:'succeeded' | `t2` |
| the outcome reader: parses a present record; returns null on ENOENT and on unparseable JSON (never throws) | `t2` |
| daemon.update returns { launched:true } and (via the stub) began the detached spawn + wrote the marker, without the real handler calling process shutdown in-test | `t3` |
| daemon.update with a live marker present yields a result.error envelope ('update already in progress') — the analyze-rpc.test.ts error-framing pattern | `t3` |
| daemon.updateOutcome returns the last DaemonUpdateOutcome, and returns null when no record exists | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 sc1 interaction: daemon.update + daemon.updateOutcome handlers realize the sc1 DaemonUpdateRestart IPC (launch method + read-outcome method)`
- **[[c2]]** `prior-artifact` `LLD s1 dataModel: DaemonUpdateResult + DaemonUpdateOutcome new types near DaemonStatus (src/shared/types.ts); ipc-client typed wrappers (src/shared/ipc-client.ts)`
- **[[c3]]** `prior-artifact` `LLD s1 dataModel PATHS field-add: PATHS.updateOutcome + PATHS.updateLock under the daemon home (src/shared/paths.ts)`
- **[[c4]]** `analyze-bundle` `s1 how-does-it-work: the detached-spawn self-respawn (src/cli/services/daemon.ts:66 detached:true idiom; don't call maintenance.restart() in-process)`
- **[[c5]]** `convention` `s1 convention: scripts/daemon-ctl.sh restart (the one proven update+build+respawn sequence) + DaemonProvisionerTest exit-code-capture precedent`
- **[[c6]]** `convention` `s1 test-strategy: src/daemon/__tests__/server-registry.test.ts internals(server).handleMessage handler-driving pattern + analyze-rpc.test.ts result.error framing (node:test)`
