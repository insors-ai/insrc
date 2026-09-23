<!-- insrc:artifact HLD-b6c90b3e0240d36c -->

# HLD: Both plugins keep the locally-installed insrc daemon current over ONE net-new daemon-owned update+restart IPC

## Framework summary

Both plugins keep the locally-installed insrc daemon current over ONE net-new daemon-owned update+restart IPC. The daemon exposes a single request that pulls, rebuilds and self-restarts by spawning a DETACHED helper (the proven daemon-ctl.sh update+restart sequence) — the only safe way a process respawns itself, since the request's own socket dies mid-restart. Freshness is judged purely by git-commit comparison: the daemon reports its installed source commit additively on the existing daemon.status; each plugin runs a remote git ls-remote (no pull) against the daemon repo's default branch and compares. On drift the startup path shows a native in-IDE notification (Update/Dismiss) and updates only on approval; a plugin self-update triggers the daemon update automatically (notify-after, fire-and-forget). Failure surfaces once with the raw error; no retry/rollback — the daemon owns its state. The plugin confirms success by reconnecting and re-reading the installed commit.

## Architecture shape

Four layers, each owned by one Story. (1) The daemon update+restart capability [s1]: a new IPC method that, rather than replying synchronously through a restart that would sever its own socket, spawns a detached helper running the existing daemon-ctl.sh update+restart (pull → merge --ff-only → rebuild → stop → start), and returns an acknowledgement that the update was launched; the failed/succeeded outcome is written to an outcome file under the daemon home that the reconnected daemon surfaces. The current daemon exits; a fresh one comes up on the socket. (2) The installed-commit report [s2]: an additive field on the existing daemon.status object carrying `git rev-parse HEAD` of the daemon root — the freshness anchor, over the existing status channel, no new method. (3)+(4) The two plugin flows [s3 VS Code, s4 JetBrains]: on activation, if the daemon is reachable, read the installed commit (s2), ls-remote the default branch, and on drift notify natively; on approval (startup path) or automatically (self-update path) invoke the s1 IPC, then reconnect and re-read the installed commit to confirm; on failure show one notification. s3 and s4 are IDE-native siblings of the same flow and share nothing with each other — parity is by contract (they consume the same s1 + s2 contracts), not by shared code.

## Shared contracts

### sc1: DaemonUpdateRestart IPC

**Owner Story:** `s1`
**Consumed by:** `s3`, `s4`

**Purpose:** The single daemon-owned request that updates AND restarts the daemon so a caller can reconnect to the fresh build — the net-new capability both plugin flows invoke (k2/k3). Launches the detached helper and returns that it started; the terminal outcome is read back after reconnect via sc2's installed commit + an outcome the daemon surfaces.

**Interface sketch (type-level):**

```
// IPC method name: "daemon.update"
interface DaemonUpdateParams {
  // reserved for future options; no fields required today
}
interface DaemonUpdateResult {
  launched: boolean;        // the detached update+restart helper was spawned
  message?: string;         // human-readable status (e.g. which branch)
}
// Terminal outcome is NOT returned synchronously (the socket drops on restart):
// the caller reconnects and reads sc2.installedCommit, plus an outcome record:
interface DaemonUpdateOutcome {
  state: "succeeded" | "failed";
  error?: string;           // raw error summary on failure (k5) — no retry/rollback
  finishedAt: string;       // ISO-8601
}
```

**Assumptions cited:** [[c2]]

### sc2: DaemonStatus.installedCommit

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** The additive freshness anchor on the existing daemon.status object: the daemon's currently-installed source commit, compared by each plugin against the upstream default-branch commit (k1) with no version scheme introduced.

**Interface sketch (type-level):**

```
// Additive field on the existing DaemonStatus returned by "daemon.status":
interface DaemonStatus {
  // ...existing fields (uptime, repos, queueDepth, ...) unchanged...
  installedCommit: string;  // full git rev-parse HEAD of the daemon root; "" if undeterminable
}
```

**Assumptions cited:** [[c6]]

## Story boundaries

### Story E20260923b6c90b3e:S001

**Owns:** `sc1`

The detached-helper mechanism itself is private to s1: how the daemon spawns daemon-ctl.sh update+restart fully detached (its own session/process group so it survives the daemon exit), where and how the DaemonUpdateOutcome record is persisted under the daemon home, and how the restarted daemon reads that record on boot to surface it. Callers see only the sc1 method shape — launch acknowledgement plus the reconnect-and-read-outcome protocol — never the helper wiring or the daemon-ctl.sh invocation details.

### Story E20260923b6c90b3e:S002

**Owns:** `sc2`

How the daemon computes its installed commit (running git rev-parse HEAD against the daemon root under the ~/.insrc home, caching vs re-reading, and the best-effort fallback to "" when the working copy is unavailable) stays private to s2. Consumers see only the installedCommit string on daemon.status; the never-throw best-effort guarantee of daemon.status is preserved.

### Story E20260923b6c90b3e:S003

**Depends on:** `sc1`, `sc2`

Everything VS-Code-specific stays private to s3: the activation hook that runs the check opportunistically only when the daemon is already reachable (k6), the remote git ls-remote invocation and commit comparison, the showInformationMessage notification with inline Update/Dismiss (k7), the first-activation detection that distinguishes a plugin self-update from an ordinary startup (to pick the approval-prompt path vs the auto notify-after path, k4), the fire-and-forget scheduling so the daemon update never blocks the plugin's own startup, and the reconnect-and-confirm loop plus the single failure notification (k5). None of this is consumed by any other Story.

### Story E20260923b6c90b3e:S004

**Depends on:** `sc1`, `sc2`

Everything JetBrains-specific stays private to s4: the postStartupActivity hook running the opportunistic-when-reachable check (k6), the ls-remote comparison, the insrc Notifications BALLOON with inline Update/Dismiss (k7), the plugin-version-change detection that selects the approval path vs the auto notify-after self-update path (k4), the fire-and-forget scheduling off the UI thread so it never blocks activation, and the reconnect-and-confirm plus single failure balloon (k5). It mirrors s3's behaviour by consuming the same sc1 + sc2 contracts; it shares no code with s3.

## Non-functional targets

- **Performance:** The startup check must add negligible latency to activation: the daemon.status read reuses the existing connection and the ls-remote is a single lightweight network round-trip run off the activation-blocking path (fire-and-forget), so a slow or unreachable network never stalls plugin startup. daemon.status remains best-effort and must not become slower — installedCommit is a cheap local git read.
- **Security:** No new network surface beyond the plugin's ls-remote against the already-trusted daemon repo remote; the update executes only local, already-installed code (daemon-ctl.sh) under the user's account. No cloud REST is introduced. The update runs only on explicit approval (startup path) or as a consequence of the user having installed a new plugin version (self-update path).
- **Observability:** The update outcome (succeeded/failed + raw error) is persisted by the daemon and surfaced to the plugin after reconnect, and the plugin renders exactly one notification per outcome (k5). The installed commit is always readable via daemon.status for after-the-fact freshness inspection.
- **Durability:** The daemon owns its own post-update state: a failed update leaves the daemon in whatever state the failure produced with no rollback (k5). The DaemonUpdateOutcome record persists across the restart so the reconnecting plugin can read a terminal result even though the triggering socket was severed.

## Rollout

### Phase A — daemon foundations (update+restart IPC and installed-commit report)

**Stories:** `s1`, `s2`

s1 (the net-new daemon.update+restart IPC / sc1) and s2 (the additive daemon.status.installedCommit / sc2) have no dependsOn edges and own the two shared contracts both plugin flows consume. They must land first so s3 and s4 have a real IPC to invoke and a real freshness field to read. They are independent of each other and can be built in either order (or in parallel) within this phase.

**Backward compat:** sc2 is a purely ADDITIVE field on the existing daemon.status object — existing daemon.status consumers (both plugins' current status parsing, the settings/status panels) must keep working unchanged when the field is present. sc1 is a brand-new IPC method (daemon.update); it must not alter or shadow the existing daemon.{status,shutdown,backup,compact,debug-status} handlers, and the detached-helper restart must not disturb an in-flight indexing queue beyond the ordinary daemon stop it already performs via daemon-ctl.sh.

### Phase B — plugin freshness flows (VS Code + JetBrains parity)

**Stories:** `s3`, `s4`

s3 and s4 both dependsOn s1+s2 and consume sc1+sc2, so they can only be built once Phase A lands. They share no code with each other (parity is by contract), so they can be built in parallel. Each wires its IDE-native activation check, notification, approval/self-update paths, and reconnect-confirm loop onto the Phase-A contracts.

**Backward compat:** Each plugin's existing activation/connect flow and current notifications must keep working; the new startup check is opportunistic-only-when-reachable and must never block or regress activation when the daemon is stale, unreachable, or on an older build that lacks sc2 (a missing/empty installedCommit must degrade to 'skip the check', not error).

**Ordering rationale:** The Epic graph is a strict two-level DAG: s1 and s2 have empty dependsOn and own sc1/sc2; s3 and s4 each dependsOn [s1,s2] and consume both contracts. So every contract owner precedes its consumers: Phase A ships s1+s2 (the daemon-side contracts), Phase B ships s3+s4 (the plugin consumers). Within Phase A, s1 and s2 are mutually independent; within Phase B, s3 and s4 are mutually independent — so each phase parallelizes internally while the phase boundary enforces owner-before-consumer.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Daemon self-respawn over IPC (s1 / sc1 / k3) | A daemon cannot rebuild+restart itself synchronously on the request that triggered it — the restart severs the request's own socket, so a naive await hangs or reports a false failure, and a botched detachment could leave the old daemon and a new one racing for the pidfile/socket, or leave no daemon at all. | Realize update+restart as a DETACHED helper (daemon-ctl.sh update+restart) in its own session/process group that survives the daemon exit; the IPC returns only a launch acknowledgement, and success is confirmed by the CALLER reconnecting and re-reading sc2.installedCommit plus a persisted DaemonUpdateOutcome record — never by awaiting a synchronous reply through the restart. Reuse daemon-ctl.sh's existing pidfile-guarded stop+start so only one daemon owns the socket. |
| Startup check blocking or spamming activation (s3/s4 / k6) | Running an unthrottled remote git ls-remote on every activation risks stalling plugin startup on a slow network, and a check that fires while the daemon is unreachable or on an old build (no installedCommit) could error or nag the user. | Run the check fire-and-forget off the activation-blocking path (async in VS Code, off-EDT in JetBrains); gate it on the daemon already being reachable via the existing connect flow; treat a missing/empty installedCommit or ls-remote failure as 'skip silently, no notification' so a network or old-daemon condition never blocks or spams. |
| Self-update auto-trigger correctness (s3/s4 / k4) | The self-update path must fire exactly once on a genuine plugin-version change (not on every activation, and not prompt a second time), or the user gets repeated unwanted daemon updates or duplicate prompts. | Detect a true first-activation-after-plugin-update via each IDE's persisted last-seen plugin version (workspace/plugin state), trigger the daemon update automatically notify-after (no approval prompt) only on a real version delta, and keep it fire-and-forget so it never blocks the plugin's own startup; the startup-check approval path and the self-update auto path are mutually exclusive for a given activation. |

## Alternatives considered

### a1: Detached-helper self-respawn IPC + additive daemon.status commit; plugins do the remote ls-remote — **CHOSEN**

A new daemon-owned update IPC that spawns a DETACHED helper (daemon-ctl.sh update+restart) so the daemon rebuilds+respawns; daemon.status gains an installed-commit (+ the repo's remote/branch) field; each plugin reads status, runs its own git ls-remote against the daemon repo's default branch, notifies/approves, invokes the IPC, and confirms success by reconnecting and re-reading the installed commit.

The daemon exposes ONE new IPC (the maintenance/update method) that does not try to rebuild-and-respawn itself in-process (impossible — it would kill its own running code). Instead the handler spawns a DETACHED child running the existing scripts/daemon-ctl.sh update+restart sequence (fetch + ff-merge + build, then stop+start over the pidfile), returns a lightweight 'update started' ack, and lets the current process exit as the child restarts it. Because the restart severs the request channel, success is NOT awaited through the IPC reply: the plugin confirms by watching its socket drop and RECONNECTING, then re-reading daemon.status's installed commit (now advanced). Failure is the daemon not coming back within a bound, or coming back at the same commit; the detached helper also writes its outcome (exit code + tail of the build log) to a small daemon-home file the reconnected daemon surfaces, so the plugin can show the raw error (k5). daemon.status (index.ts:922) gains an additive installedCommit field (git rev-parse HEAD of the daemon home) plus the remote+branch it tracks, so a plugin knows exactly what to ls-remote. Each plugin (S003 VS Code, S004 JetBrains) reuses its existing daemon-connect flow: on activation, if the daemon is already reachable, it reads daemon.status for the installed commit + remote/branch, runs a local git ls-remote (no pull) against that remote/branch, and if the commits differ shows its native in-IDE notification (showInformationMessage / balloon) with Update/Dismiss. On Update (or on the self-update trigger, automatically + fire-and-forget) it invokes the daemon update IPC and then reconnects to confirm. The whole update+restart sequence lives ONCE in the daemon (wrapping daemon-ctl.sh); the plugins never shell out or reimplement it (k2).

**Pros:**
- Satisfies k2/k3 exactly: the update+restart is daemon-owned (the daemon spawns the helper) and reuses the proven daemon-ctl.sh sequence once — no plugin shell-out, no per-plugin reimplementation of build/asset/node-version handling
- The detached helper is the only way a process can rebuild-then-respawn itself safely (the running daemon cannot recompile + re-exec its own code mid-request); it sidesteps the impossible 'synchronous self-restart over the request socket'
- S002 is a purely additive field on the existing daemon.status object (index.ts:922) — zero new IPC, and plugins already parse status, so the freshness signal flows over the existing socket
- Honours the settled detection decision (k1): the plugin runs git ls-remote against the daemon repo's default branch, mirroring daemon-ctl.sh's HEAD-vs-origin comparison, with no daemon version scheme
- Reuses each plugin's existing connect flow + native notification idiom (k6/k7) — the check is opportunistic (only when already connected) and adds no autostart

**Cons:**
- The success/failure signal is indirect: the plugin infers the outcome by reconnecting + comparing the installed commit (and reading the helper's outcome file), rather than a single synchronous IPC reply — more moving parts than a simple request/response
- Requires a bounded reconnect-and-confirm loop in each plugin (a small amount of duplicated client logic across the two toolchains, though the daemon-side sequence is shared)
- A detached helper + a written outcome file is more machinery than an in-process update would be (if that were possible)

**Cost estimate:** M

### a2: Daemon-does-everything: the daemon runs the remote check AND the update; plugins are pure UI

The daemon itself runs git ls-remote on a status read and reports an 'updateAvailable' boolean (+ commits), and the same update IPC does pull+rebuild+respawn; the plugins only render the notification, collect approval, and invoke the IPC — no plugin-side git at all.

Centralize BOTH the detection and the execution in the daemon. daemon.status (or a sibling read IPC) performs the remote git ls-remote itself against its own configured remote/branch and returns { installedCommit, upstreamCommit, updateAvailable }, so a plugin never runs git. The update IPC is the same detached-helper self-respawn as a1. The plugins become thin: read the freshness flag, show the notification, and invoke the update IPC on approval / self-update. This makes the plugins maximally dumb (no git dependency, no remote-check logic on either side) and puts the single source of truth entirely in the daemon, extending the 'daemon is the sole proxy' spirit to detection as well as execution.

**Pros:**
- The plugins carry NO git logic at all — no ls-remote, no remote/branch handling — so the two toolchains share even less code and cannot drift on detection
- A single daemon source of truth for both 'is an update available' and 'apply it', maximally centralized

**Cons:**
- DEVIATES from the settled brainstorm decision (k1's chosen option explicitly put the remote git ls-remote on the PLUGIN, not the daemon) — re-litigating an approved decision, which the HLD must not do
- Puts a NETWORK round-trip (git ls-remote) inside the daemon's status read path, which is otherwise a fast local read documented to never throw — a status call could now hang on a slow/absent network
- Makes the daemon reach out to its git remote on a normal status read, a surprising side effect for an operation plugins call frequently for unrelated reasons

**Cost estimate:** M

**Rejected because:** Ties a1 on execution (k2/k3/k5) but VIOLATES k1 by relocating the settled plugin-side remote check to the daemon — a re-litigation of an approved brainstorm decision the HLD must not make — and only partially meets k6 by loading a network round-trip into the daemon's frequently-called status read path. Disqualified by the k1 violation.

### a3: In-process rebuild + re-exec (no detached helper)

The daemon's update IPC pulls + rebuilds and then re-execs its own process image (execv) in place, without a separate helper process, and the plugin reconnects to the re-exec'd daemon.

Avoid the detached helper: on the update IPC the daemon does the git pull + build itself and then replaces its own process image (a re-exec of the daemon entry), so 'the same daemon comes back' without a script. daemon.status still gains the installed-commit field for detection, and the plugins still reconnect to confirm. This keeps everything inside the daemon process with no child script, appealing to the 'daemon owns it' rule in the most literal way.

**Pros:**
- No separate helper process or outcome file — the update lives entirely in the daemon process
- Literally 'the daemon updates itself' with the fewest processes involved

**Cons:**
- A running Node process rebuilding its OWN source (the code it is currently executing, including native modules built against a specific Node ABI) and then re-execing is fragile: a mid-build crash or an ABI mismatch can leave a wedged process with no clean supervisor to recover it
- Re-implements the build/asset/node-version sequence that scripts/daemon-ctl.sh already encapsulates (violating the 'reuse the one update sequence' intent of k2) OR shells out to daemon-ctl.sh from inside the daemon anyway
- The request channel still dies at re-exec, so it gains none of a1's simplicity while adding real self-modification risk; recovering a failed re-exec has no external driver (the pidfile/supervisor model that daemon-ctl.sh provides)

**Cost estimate:** M

**Rejected because:** Only partial on k2/k3/k5: self-modifying re-exec is fragile (a running Node process rebuilding the code it is executing, native-ABI risk, no supervisor to recover a wedged process) and either duplicates the daemon-ctl.sh build sequence or still shells out to it — the worst of both. Adds real risk for no benefit over a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery: src/daemon/index.ts, scripts/daemon-ctl.sh` — "No daemon update/restart IPC exists — the handler map registers only daemon.{status,shutdown,backup,compact,debug-status}. The daemon PROCESS is managed by scripts/daemon-ctl.sh (start/stop/restart/up"
- **[[c2]]** `analyze-bundle` `s1 structural-map: src/daemon/index.ts:922 (daemon.status / DaemonStatus)` — "The 'daemon.status' handler at src/daemon/index.ts:922 returns a DaemonStatus object and is documented to never throw (best-effort). Adding an installed-commit field is a purely additive change — the "
- **[[c3]]** `analyze-bundle` `s1 convention: scripts/daemon-ctl.sh, src/shared/paths.ts:18` — "daemon-ctl.sh update does git fetch origin <branch> + merge --ff-only and compares current=rev-parse HEAD vs incoming=rev-parse origin/branch — the exact installed-vs-upstream commit comparison. The p"
- **[[c4]]** `analyze-bundle` `s1 structural-map: vscode-plugin/src/daemon/controller.ts:16, jetbrains-plugin/.../lifecycle/DaemonLifecycleContracts.kt:45` — "VS Code exposes LifecycleAction 'start'|'stop'|'restart'|'update' + the shared connect flow + showInformationMessage consent gate; JetBrains maps UPDATE→daemon-ctl.sh update + an insrc Notifications B"
- **[[c5]]** `step-output` `s1 backFlowNotes (self-respawn crux)` — "A daemon cannot synchronously rebuild+respawn itself over the same IPC request (the socket dies mid-restart), so the update capability is realized as a DETACHED helper and the plugin confirms via reco"
- **[[c6]]** `prior-artifact` `Epic b6c90b3e0240d36c constraint k1` — "Freshness is judged purely by git-commit comparison against the daemon repo's default branch — no daemon version number / versioned release / self-reported semver is introduced."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-23T17:52:48.300Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | closed-union | LOW | manual | The daemon IPC handler map registers only daemon.{status,shutdown,backup,compact,debug-status} — there is no existing daemon update/restart/respawn IPC method (the update+restart capability is genuinely net-new). | read src/daemon/index.ts:922 resolves to `'daemon.status': async () => {`, confirming daemon.status is a registered handler in the map. The grep for daemon.{status,shutdown,backup,compact,debug-status,update,restart,respawn} returns hits only in docs/design HTML for status/shutdown — no source hit registers a daemon.update/restart/respawn handler, consistent with the premise that the update+restart IPC is net-new. Exhaustiveness of the 5-method set was verified against the handler map during DEF and is not contradicted here. | No change. The premise holds: daemon.status is registered (index.ts:922) and no update/restart/respawn IPC exists, so sc1 is genuinely net-new. |
| c2 | citation | LOW | manual | The daemon.status handler at src/daemon/index.ts:922 returns a DaemonStatus object; adding an installedCommit field is a purely additive change to that existing object. | read src/daemon/index.ts:922 = `'daemon.status': async () => {` — the daemon.status handler exists at exactly the cited line, so adding an installedCommit field to its returned DaemonStatus object is an additive change to a real, located surface. | No change. Citation resolves verbatim. |
| c1 | citation | LOW | manual | The daemon process is managed by scripts/daemon-ctl.sh, which provides start/stop/restart/update subcommands. | grep cmd_(start\|stop\|restart\|update) hits scripts/daemon-ctl.sh:207 cmd_start, :232 cmd_stop, :238 cmd_restart (which calls cmd_stop then cmd_start), plus a cmd_update — the four subcommands the premise names are all present in daemon-ctl.sh. | No change. daemon-ctl.sh provides start/stop/restart/update as cited. |
| c3 | citation | LOW | manual | scripts/daemon-ctl.sh update fetches origin, merges --ff-only, and compares current rev-parse HEAD vs the incoming origin/branch commit — the installed-vs-upstream commit comparison the plugin mirrors. | scripts/daemon-ctl.sh:81 `git -C "$DAEMON_ROOT" fetch --quiet origin "$branch"`, :93 `current=$(git -C "$DAEMON_ROOT" rev-parse HEAD)`, :104 `git -C "$DAEMON_ROOT" merge --ff-only "$incoming"` — the fetch + ff-merge + HEAD-vs-incoming comparison the premise describes is present verbatim in daemon-ctl.sh's update path. | No change. The reusable commit-comparison sequence exists as cited. |
| c3 | citation | LOW | manual | src/shared/paths.ts defines the ~/.insrc layout (pidFile, sockFile, daemon home) used to locate the daemon root and pidfile. | read src/shared/paths.ts:18 = `pidFile: join(INSRC_DIR, 'daemon.pid'),` — confirms paths.ts defines the ~/.insrc layout including the daemon pidfile. | No change. Citation resolves. |
| c4 | citation | LOW | manual | The VS Code plugin's daemon controller exposes a LifecycleAction union including 'start'\|'stop'\|'restart'\|'update'. | read vscode-plugin/src/daemon/controller.ts:16 = `export type LifecycleAction = 'start' \| 'stop' \| 'restart' \| 'update';` — the union with the four members is present at exactly the cited line. | No change. Citation resolves verbatim. |
| c4 | citation | LOW | manual | The JetBrains plugin maps a daemon UPDATE lifecycle action to daemon-ctl.sh update in DaemonLifecycleContracts.kt. | read jetbrains-plugin/.../lifecycle/DaemonLifecycleContracts.kt:45 = `* INSTALL -> insrc-daemon-install.sh, UPDATE -> daemon-ctl.sh update, run under ...` — confirms the JetBrains UPDATE lifecycle action maps to daemon-ctl.sh update. | No change. Citation resolves. |
| c4 | semantic | LOW | manual | The VS Code plugin surfaces a native consent notification via vscode.window.showInformationMessage (the k7 notification idiom s3 reuses). | grep showInformationMessage hits vscode-plugin/src/extension.ts:76 `vscode.window.showInformationMessage(message, options, ...items)` and :362 — the VS Code native notification idiom s3 reuses exists in source. | No change. The k7 VS Code notification surface is real. |
| c4 | semantic | LOW | manual | The JetBrains plugin ships an insrc Notifications group used for balloon notifications (the k7 idiom s4 reuses) plus a postStartupActivity hook. | grep resolves an InsrcProjectOpenActivity (a StartupActivity/ProjectActivity) and Notification* classes in the JetBrains plugin (source-derived compiled classes under build/, sourced from ai.insors.insrc.jetbrains.platform / onboarding). The premise's postStartupActivity hook + insrc Notifications idiom are present in the plugin. Note: matches surfaced as compiled .class files, but they derive from real source types (InsrcProjectOpenActivity, NotificationOnboardingOffer). | No change. The JetBrains startup-activity + notification idiom s4 reuses exists. |
| s1 | ordering | LOW | manual | Stories s3 and s4 each depend on s1 and s2 (owner-before-consumer): s1 owns sc1 and s2 owns sc2, both consumed by s3 and s4, so the two daemon-side Stories precede the two plugin Stories. | read docs/epics/work-framed-approved-spec-proceed-from-E20260923b6c90b3e/DEF.md:1 resolves the approved Epic DEF that defines the s1/s2 (empty dependsOn) and s3/s4 (dependsOn [s1,s2]) graph the ordering leans on. The owner-before-consumer ordering is consistent with that graph. | No change. The dependency ordering matches the approved DEF. |
