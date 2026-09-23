<!-- insrc:artifact LLD-b6c90b3e0240d36c-s1 -->

# LLD: E20260923b6c90b3e:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790185288043-yyq6gx`
**HLD effective hash:** `0a15cb12814d...`

## HLD context

**Framework:** Both plugins keep the locally-installed insrc daemon current over ONE net-new daemon-owned update+restart IPC. The daemon exposes a single request that pulls, rebuilds and self-restarts by spawning a DETACHED helper (the proven daemon-ctl.sh update+restart sequence) — the only safe way a process respawns itself, since the request's own socket dies mid-restart. Freshness is judged purely by git-commit comparison: the daemon reports its installed source commit additively on the existing daemon.status; each plugin runs a remote git ls-remote (no pull) against the daemon repo's default branch and compares. On drift the startup path shows a native in-IDE notification (Update/Dismiss) and updates only on approval; a plugin self-update triggers the daemon update automatically (notify-after, fire-and-forget). Failure surfaces once with the raw error; no retry/rollback — the daemon owns its state. The plugin confirms success by reconnecting and re-reading the installed commit.
**Rollout phase:** Phase A — daemon foundations (update+restart IPC and installed-commit report)
**Owns:** `sc1` (DaemonUpdateRestart IPC)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: How the daemon computes its installed commit (running git rev-parse HEAD against the daemon root under the ~/.insrc home, caching vs re-reading, and the best-effort fallback to "" when the working copy is unavailable) stays private to s2. Consumers see only the installedCommit string on daemon.status; the never-throw best-effort guarantee of daemon.status is preserved. — owns `sc2`
- `s3`: Everything VS-Code-specific stays private to s3: the activation hook that runs the check opportunistically only when the daemon is already reachable (k6), the remote git ls-remote invocation and commit comparison, the showInformationMessage notification with inline Update/Dismiss (k7), the first-activation detection that distinguishes a plugin self-update from an ordinary startup (to pick the approval-prompt path vs the auto notify-after path, k4), the fire-and-forget scheduling so the daemon update never blocks the plugin's own startup, and the reconnect-and-confirm loop plus the single failure notification (k5). None of this is consumed by any other Story.
- `s4`: Everything JetBrains-specific stays private to s4: the postStartupActivity hook running the opportunistic-when-reachable check (k6), the ls-remote comparison, the insrc Notifications BALLOON with inline Update/Dismiss (k7), the plugin-version-change detection that selects the approval path vs the auto notify-after self-update path (k4), the fire-and-forget scheduling off the UI thread so it never blocks activation, and the reconnect-and-confirm plus single failure balloon (k5). It mirrors s3's behaviour by consuming the same sc1 + sc2 contracts; it shares no code with s3.

## Contract details

**Surface level:** internal-shared

### `daemon.update`

```typescript
'daemon.update': (params?: DaemonUpdateParams) => Promise<DaemonUpdateResult>
```

**Parameters:**
- `params: DaemonUpdateParams` _(optional)_ — Reserved for future options (e.g. a target branch); no fields required today. The handler ignores an absent/empty object.

**Returns:** `DaemonUpdateResult` — { launched: true, message? } — acknowledges the detached update+restart helper was spawned. NOT the terminal outcome: the socket drops when the daemon restarts, so success/failure is read after reconnect via daemon.updateOutcome (+ sc2's installedCommit).

**Errors:**
- `Error('daemon.update: update already in progress')` when A running marker file exists under the daemon home (a prior daemon.update has spawned a helper that has not yet completed) — thrown so the server frames result.error and no second helper is spawned. Concurrent-launch guard, not a retry.
- `Error('daemon.update: cannot locate daemon root / helper')` when The daemon root (DAEMON_ROOT / ~/.insrc/daemon) or the daemon-ctl.sh helper cannot be resolved, so no detached helper can be spawned. Reported as a launch failure (nothing was started).

**Preconditions:**
- The daemon is running and reachable over the socket (the caller invokes it over the existing IPC connection).
- No update is already in progress (no running marker present).

**Postconditions:**
- A DETACHED, unref'd child process (its own session/process group, stdio to a log) has been spawned running the daemon-ctl.sh restart (update+build+respawn) sequence — it survives the daemon's own exit.
- A running marker has been written under the daemon home so a concurrent daemon.update is rejected until the helper completes.
- The current daemon has begun its own shutdown()/exit so the helper's stop+start step is clean; the caller's socket will drop and it must reconnect.

### `daemon.updateOutcome`

```typescript
'daemon.updateOutcome': () => Promise<DaemonUpdateOutcome | null>
```

**Returns:** `DaemonUpdateOutcome | null` — The last persisted update outcome ({ state:'succeeded'|'failed', error?, finishedAt }) written by the detached helper, or null when no update has completed (or the record is absent). The reconnecting caller reads this once to learn the terminal result.

**Postconditions:**
- No side effects — a pure read of the persisted outcome record (mirrors the read-only daemon.debug-status idiom). Best-effort: a missing or unparseable record returns null rather than throwing, so a fresh daemon that has never updated answers cleanly.

## Data model changes

### `DaemonUpdateResult` — new

New IPC result type for daemon.update: { launched: boolean; message?: string }. Defined alongside the existing daemon IPC types (near DaemonStatus in src/shared/types.ts). Serializes over the JSON-RPC result envelope like every other handler return.

```
interface DaemonUpdateResult { launched: boolean; message?: string }
```

**Call sites:**
- `src/daemon/index.ts (the new 'daemon.update' handler return)`
- `src/shared/ipc-client.ts (typed client call, as with status())`

### `DaemonUpdateOutcome` — new

New record type for the terminal update result: { state: 'succeeded' | 'failed'; error?: string; finishedAt: string }. Written by the detached helper to a fixed file under the daemon home and returned verbatim by daemon.updateOutcome. error carries the raw underlying error on failure (k5); no retry/rollback fields.

```
interface DaemonUpdateOutcome { state: 'succeeded' | 'failed'; error?: string; finishedAt: string /* ISO-8601 */ }
```

**Call sites:**
- `the detached update helper (writer)`
- `src/daemon/index.ts (the new 'daemon.updateOutcome' handler reader)`
- `src/shared/ipc-client.ts (typed client call)`

### `PATHS` — field-add

Two new daemon-home path entries in the ~/.insrc layout: the update-outcome record file (read by daemon.updateOutcome, written by the helper) and the update-running marker file (the concurrent-launch guard for daemon.update). Both live under the existing daemon home next to pidFile/sockFile; S001-internal, distinct from any sc2 surface.

```
PATHS.updateOutcome: join(INSRC_DIR, 'daemon.update-outcome.json'); PATHS.updateLock: join(INSRC_DIR, 'daemon.update.lock')
```

**Call sites:**
- `src/shared/paths.ts (definition)`
- `src/daemon/index.ts (handlers read the marker + outcome)`
- `the detached update helper (writes the marker + outcome)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 owns and realizes sc1 (DaemonUpdateRestart IPC). The daemon.update handler is the launch method from the HLD sketch (returns DaemonUpdateResult { launched, message? }); the daemon.updateOutcome handler (proposed sc1 methodAdd) is the read side that returns the DaemonUpdateOutcome the sketch already defines. The DaemonUpdateResult and DaemonUpdateOutcome types are the sc1 payload types. The detached-helper wiring, the outcome-file location, and the running marker are all sc1-internal (private to the s1 boundary) — consumers see only the two method shapes. daemon.status (sc2) is NOT touched: the installedCommit freshness field stays entirely s2's. |

## Error paths

### Error cases

- **A daemon.update arrives while a prior update+restart helper is still running** (recoverable)
  - Detection: The handler stats the update-running marker file (PATHS.updateLock) under the daemon home before spawning; a present, live marker means an update is in flight.
  - Response: Throw Error('daemon.update: update already in progress') so the server frames result.error; no second detached helper is spawned and the current daemon does NOT begin shutdown.
  - User impact: The caller sees a single clear error instead of two racing update helpers fighting over the pidfile/socket; it can retry after the in-flight update settles.
- **The daemon root or the daemon-ctl.sh helper cannot be resolved when daemon.update is called** (recoverable)
  - Detection: The launch module resolves DAEMON_ROOT ($INSRC_DAEMON_ROOT ?? ~/.insrc/daemon) and the daemon-ctl.sh path and stats them before spawning; a missing directory/script fails the resolve.
  - Response: Throw Error('daemon.update: cannot locate daemon root / helper') BEFORE any spawn or shutdown; nothing is started and no marker is written, so the daemon keeps running unchanged.
  - User impact: The caller gets a single failure naming the missing root/helper; the running daemon is untouched (no half-started restart).
- **The detached helper's update+restart fails (pull conflict, rebuild error, or the fresh daemon never becomes ready)** (recoverable)
  - Detection: The detached helper captures the daemon-ctl.sh restart exit code (non-zero) or a build/ready-timeout, exactly as the JetBrains DaemonProvisioner captures exit codes rather than throwing.
  - Response: The helper writes DaemonUpdateOutcome{ state:'failed', error:<raw stderr/exit summary>, finishedAt } to PATHS.updateOutcome and clears the running marker; it does NOT retry and does NOT roll back (k5). Whatever daemon (old surviving, or a partially-built one) is left as-is.
  - User impact: After reconnect (or against the still-running old daemon), the caller reads daemon.updateOutcome once and surfaces the raw error; state is whatever the failed update produced.
- **The old daemon exits but the fresh daemon never comes back (the caller's reconnect never succeeds)** (recoverable)
  - Detection: This is detected by the CONSUMER (s3/s4) via a bounded reconnect timeout — out of S001's scope. S001's contribution: the detached helper still writes the failed outcome to PATHS.updateOutcome so that IF a daemon is reachable the outcome is readable.
  - Response: S001 guarantees the outcome file is written on failure and the running marker is cleared so a later daemon.update is not permanently blocked; the reconnect/timeout policy itself belongs to the plugin flows (adjacent boundary).
  - User impact: The plugin's reconnect loop times out and surfaces a failure (k5); a subsequent manual daemon start finds a clean (unlocked) state.
- **daemon.updateOutcome is called but the outcome record is absent or unparseable** (recoverable)
  - Detection: The read handler attempts to read+JSON.parse PATHS.updateOutcome and catches ENOENT / parse errors.
  - Response: Return null (never throw) — the best-effort read idiom mirroring daemon.status's never-throw guarantee and daemon.debug-status's pure read.
  - User impact: A fresh daemon that has never updated (or one whose record was cleared) answers null cleanly; the caller treats null as 'no terminal outcome to show'.

### Edge cases

| Input | Expected |
| :--- | :--- |
| daemon.update called with no params (params undefined) or an empty object | Accepted — DaemonUpdateParams has no required fields today; the handler ignores params and proceeds to the concurrent-launch guard + spawn. |
| A stale update-running marker left by a helper that died without clearing it (e.g. host killed mid-update) | The marker carries the helper's timestamp/pid; the guard treats a marker whose process is no longer alive (or older than a sane bound) as stale and allows a fresh daemon.update rather than blocking forever — the PID_FILE-guarded staleness idiom daemon-ctl.sh already uses for a stale daemon. |
| The repo is already at the upstream head (no newer commits) when daemon.update runs | The helper still runs daemon-ctl.sh restart (ff-merge is a no-op, rebuild + respawn proceed); the outcome is state:'succeeded'. A no-op update is a successful update — the daemon simply restarts at the same commit. |
| daemon.updateOutcome called on a daemon that is mid-update (marker present, no outcome yet) | Returns null (or the PRIOR completed outcome if one exists) — it never blocks waiting for the in-flight update; the caller distinguishes in-flight from done via its reconnect loop, not this read. |

## Test strategy

**Test framework:** `node:test (tsx --test), per src/daemon/__tests__/*.test.ts (server-registry.test.ts, analyze-rpc.test.ts)`

### Test levels

- **unit** — Assert the S001-internal launch module (detached-spawn + marker + outcome-file logic) via injected seams, WITHOUT actually restarting a daemon — mirroring how DaemonProvisionerTest injects a RecordingRunner to capture the spawned command and treat failures as captured (not thrown).
  - Subjects: `the launch module: spawns the detached child with the right argv (daemon-ctl.sh restart) + detached:true/unref/stdio-to-log flags (inject a fake spawn fn and assert the call shape)`, `the concurrent-launch guard: with a live marker present it throws 'update already in progress' and does NOT spawn; with a stale marker (dead pid / aged) it proceeds`, `the outcome writer: on a captured non-zero exit it writes DaemonUpdateOutcome{state:'failed',error,finishedAt} and clears the marker; on zero exit writes state:'succeeded'`, `the outcome reader: parses a present record; returns null on ENOENT and on unparseable JSON (never throws)`
  - Fixtures: `an injected fake spawn fn recording argv + options (no real process)`, `a temp daemon-home dir for PATHS.updateLock + PATHS.updateOutcome`, `sample outcome JSON fixtures (succeeded, failed, malformed, absent)`
- **integration** — Assert the two new handlers are registered on the daemon IPC map and return/frame correctly, driven the way server-registry.test.ts drives daemon.status via internals(server).handleMessage(reqLine(...), sock) — with the spawn + shutdown seams stubbed so no real restart happens.
  - Subjects: `daemon.update returns { launched:true } and (via the stub) began the detached spawn + wrote the marker, without the real handler calling process shutdown in-test`, `daemon.update with a live marker present yields a result.error envelope ('update already in progress') — the analyze-rpc.test.ts error-framing pattern`, `daemon.updateOutcome returns the last DaemonUpdateOutcome, and returns null when no record exists`
  - Fixtures: `the daemon server test harness (internals(server).handleMessage) as in server-registry.test.ts`, `stubbed launch/shutdown seams so the handler does not exit the test process`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: the launch module spawns the detached daemon-ctl.sh restart child (update+build+respawn) with detached:true/unref — the mechanism that brings the daemon current and restarts it`, `unit: on a zero exit the outcome writer records state:'succeeded' (the caller reconnects and reads success)`, `integration: daemon.update returns { launched:true } confirming the update+restart was launched over the single IPC` |
| `ac2` | `unit: on a captured non-zero exit / build failure / ready-timeout the outcome writer records state:'failed' with the raw error and clears the marker — no retry, no rollback`, `unit: daemon.updateOutcome returns that failed record exactly once (raw error surfaced)`, `integration: a second daemon.update while the marker is live yields a single 'update already in progress' error (no racing helper, no retry)` |
| `ac3` | `unit: the injected spawn is invoked with the daemon-ctl.sh restart argv — proving the daemon itself runs the one proven update+restart sequence and does not reimplement pull/rebuild/restart`, `integration: daemon.update is a registered daemon IPC handler (the caller invokes the daemon, which owns execution; it does not shell out from the plugin)` |

## Alternatives considered

### a1: Launch method + dedicated read-outcome method (both sc1) — **CHOSEN**

daemon.update returns { launched } and fires the detached helper; a second sc1-owned read-only method daemon.updateOutcome returns the last persisted DaemonUpdateOutcome, which the reconnecting caller polls after the daemon comes back.

daemon.update is a fire-and-launch handler: it validates it is not already mid-update, spawns the DETACHED unref'd helper (daemon-ctl.sh restart, which syncs+builds+respawns; the daemon.ts:58 detached:true idiom), writes a 'running' marker so a concurrent call is rejected, returns { launched: true, message } immediately, and begins its own shutdown() so the helper's stop step is clean. The helper writes a DaemonUpdateOutcome to a fixed file under the daemon home on completion/failure. The reconnecting caller reads the terminal outcome via a NEW read-only sc1 method daemon.updateOutcome. Keeps launch and read as two single-purpose methods, both within sc1, never touching daemon.status (sc2).

### a2: Single overloaded daemon.update (launch vs. read-last-outcome)

One daemon.update method: when no update is in flight it launches the detached helper and returns { launched:true }; when called after a completed update it returns { launched:false, outcome } read from the persisted file.

Collapse launch and read into ONE sc1 method. daemon.update inspects the running-marker + outcome file: if not in progress it spawns the detached helper and returns { launched:true, message }; if a prior update just completed it returns { launched:false, outcome }. The reconnecting caller calls daemon.update again to read the outcome. One method added.

**Rejected because:** Ties a1 on the execution criteria (ac1/ac3/k2/k3) and adds the smallest surface, but the mutate+read overload weakens ac2/k5 (a poll could re-launch) and is a looser fit to sc1 — the extra method a1 adds is cheap insurance against exactly that hazard.

### a3: Fold the outcome onto daemon.status alongside sc2

daemon.update launches the helper and returns { launched }; the terminal outcome is surfaced as an S001-owned lastUpdate field ON the daemon.status object, so the reconnecting caller's single status read returns both the fresh commit (s2) and the update outcome.

daemon.update launches the detached helper and returns { launched } as in a1. The fresh daemon reads the persisted outcome file on boot and exposes it as a lastUpdate: DaemonUpdateOutcome field ON the existing DaemonStatus object returned by daemon.status. The reconnecting caller then needs ONLY ONE read after reconnect to get both installedCommit (sc2) and the outcome.

**Rejected because:** Meets the acceptance criteria and minimizes round-trips, but has two Phase-A stories editing one DaemonStatus struct (S001 lastUpdate + S002 installedCommit) — a boundary contention the HLD explicitly avoids — and loads an outcome-file read into the never-throw status hot path. The round-trip it saves is one the plugin already sequences, so the boundary cost is not worth it (sc1/k5 partial).

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: src/daemon/index.ts handler map (daemon.status:922, shutdown:1459, backup:1465, compact:1474)` — "The daemon exposes its IPC surface as ONE object literal of '<method>': async (params?) => {...} entries; a handler returns a value on success and THROWS to signal failure, framed by the server into r"
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work: the self-respawn crux (index.ts:1846 shutdown, maintenance.ts:275 restart, daemon.ts:58 detached spawn)` — "maintenance.restart() does an in-process stopDaemon()+startDaemon(), NOT self-restart-safe when the caller IS the daemon; the safe pattern is daemon.ts:58 startDaemon spawning with { detached: true } "
- **[[c3]]** `convention` `s1 convention: scripts/daemon-ctl.sh (cmd_update/cmd_restart/cmd_start) + DaemonProvisionerTest spawn precedent` — "daemon-ctl.sh is the single owned update+restart sequence; cmd_start already syncs+builds+spawns (PID_FILE-guarded), so a detached daemon-ctl.sh restart run after the daemon exits performs pull+rebuil"
- **[[c4]]** `analyze-bundle` `s1 data-model: src/shared/types.ts:882 DaemonStatus + src/shared/paths.ts layout` — "DaemonStatus is owned by s2 for the installedCommit field (sc2); S001 does not touch it. sc1's DaemonUpdateOutcome record is persisted to a file under the daemon home (paths.ts) and is S001-internal."
- **[[c5]]** `prior-artifact` `HLD-b6c90b3e0240d36c sc1 + Epic constraints k2/k3/k5` — "sc1 = the single daemon-owned update+restart IPC (k2/k3); failure surfaces once with the raw error, no retry/rollback (k5)."
- **[[c6]]** `convention` `s1 test-strategy: src/daemon/__tests__/server-registry.test.ts + analyze-rpc.test.ts + DaemonProvisionerTest` — "server-registry.test.ts drives a handler via internals(server).handleMessage(reqLine(...), sock); the detached-spawn + outcome-file logic factors into an injectable-seam module asserted with a fake sp"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-23T18:13:27.018Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/daemon.update | citation | LOW | manual | The daemon IPC handler map in src/daemon/index.ts is an object literal of '<method>': async (params?) => {...} entries where a new 'daemon.update' handler can be added (daemon.status at :922 is such an entry). | read src/daemon/index.ts:922 = `'daemon.status': async () => {` — confirms the handler map is an object literal of '<method>': async entries where a new 'daemon.update' entry slots in. | No change. Citation resolves; the new handler placement is grounded. |
| hldContext/self-respawn | citation | LOW | manual | src/cli/services/maintenance.ts defines restart() which does an in-process stopDaemon()+startDaemon() (not self-restart-safe when the caller is the daemon). | read src/cli/services/maintenance.ts:276 = `export async function restart(onLog: LogFn): Promise<MaintenanceResult> {` — confirms restart() exists; its body (verified earlier) does an in-process stopDaemon()+startDaemon(), so it is not self-restart-safe when the caller is the daemon, exactly as the LLD's self-respawn rationale states. | No change. The crux — don't call maintenance.restart() in-process — is correctly grounded. |
| alternatives/a1 | citation | LOW | manual | src/cli/services/daemon.ts spawns the daemon detached with { detached: true, stdio: ['ignore', logFd, logFd] } — the detached-spawn idiom the sc1 helper follows. | read src/cli/services/daemon.ts:66 = `{ detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env } },` and startDaemon at :58 — confirms the detached-spawn idiom the sc1 helper follows. | No change. Citation resolves verbatim. |
| hldContext/daemon-ctl | citation | LOW | manual | scripts/daemon-ctl.sh defines cmd_start / cmd_stop / cmd_restart (restart = stop + start) and cmd_update, the single proven update+restart sequence the detached helper wraps. | grep resolves scripts/daemon-ctl.sh:207 cmd_start(), :238 cmd_restart(), :243 cmd_update() — the proven update+restart sequence the detached helper wraps exists as cited. | No change. The reused daemon-ctl.sh subcommands exist. |
| dataModel/DaemonUpdateResult | semantic | LOW | manual | DaemonUpdateResult and DaemonUpdateOutcome are NEW types (they do not exist in the codebase yet) to be defined near DaemonStatus in src/shared/types.ts. | grep for `interface DaemonUpdateResult` / `interface DaemonUpdateOutcome` returns hits ONLY in the HLD/LLD docs — no src/ definition exists yet, confirming they are genuinely NEW types to be added. read src/shared/types.ts:882 = `export interface DaemonStatus {` confirms the sibling type they will be defined near. | No change. The types are correctly stated as new; the definition anchor (types.ts:882) resolves. |
| dataModel/PATHS | citation | LOW | manual | src/shared/paths.ts defines the ~/.insrc PATHS layout (pidFile via INSRC_DIR) where the two new S001-internal path entries (updateOutcome, updateLock) are added. | read src/shared/paths.ts:18 = `pidFile: join(INSRC_DIR, 'daemon.pid'),` — confirms the PATHS/INSRC_DIR layout where the two new S001-internal entries (updateOutcome, updateLock) are added. | No change. The PATHS field-add lands on a real, cited layout. |
| interactionWithShared/sc1 | cross-artifact | LOW | manual | The HLD (b6c90b3e0240d36c) assigns sc1 (DaemonUpdateRestart IPC) ownership to Story s1/S001, which this LLD implements; daemon.status/installedCommit (sc2) is owned by s2 and not touched here. | read docs/epics/work-framed-approved-spec-proceed-from-E20260923b6c90b3e/HLD.md:1 resolves the approved HLD that assigns sc1 to s1 and sc2 to s2. The LLD implements sc1 only and explicitly does not touch daemon.status (sc2), consistent with the HLD boundary. | No change. The cross-artifact ownership trace holds. |
| testStrategy | citation | LOW | manual | src/daemon/__tests__/server-registry.test.ts drives a handler end-to-end via internals(server).handleMessage(reqLine('daemon.status'), sock) — the pattern the new handlers' integration tests extend; node:test (tsx --test) is the framework. | read src/daemon/__tests__/server-registry.test.ts:65 = `await internals(server).handleMessage(reqLine('daemon.status'), sock);` — confirms the integration-test driving pattern the new handlers' tests extend; node:test is the framework. | No change. The test pattern the strategy leans on exists verbatim. |
| errorPaths/helper-fail | citation | LOW | manual | The JetBrains DaemonProvisioner spawns daemon-ctl.sh update and captures the exit code (failures captured, not thrown) — the precedent the detached helper's exit-code handling mirrors. | grep for the DaemonProvisioner spawn precedent is noisy (doc-heavy), but the s1 test.locate bundle already located the real Kotlin test methods DaemonProvisionerTest.INSTALL_spawnsInstallScript_UPDATE_spawnsDaemonCtlUpdate_withNodeOnPath and exitCodeMapping_andFailuresCapturedNotThrown — confirming the 'spawns daemon-ctl.sh, captures exit code, failures not thrown' precedent the LLD mirrors. Caveat: this is a Kotlin test used as a design precedent, not a src/ TS anchor. | No change. The precedent is real; it informs the helper's exit-code handling, it is not a load-bearing TS citation. |
