<!-- insrc:artifact PLAN-b6c90b3e0240d36c-s3 -->

# Plan: E20260924b6c90b3e:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790227132994-ofuvfu`
**LLD effective hash:** `0a15cb12814d...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Build the VS-Code-free daemon-freshness flow module + its seam types | M | — | unit: daemon-freshness: reachable + drift + current===lastSeen -> notify('Update','Dismiss') shown; client.update() ONLY on 'Update', NOT on 'Dismiss'/undefined; unit: daemon-freshness skip paths: unreachable -> no notify/no update; installedCommit==='' -> skip; installedCommit===upstream -> skip; gitLsRemote ''/throws -> skip; unit: daemon-freshness self-update: current!==lastSeen + drift -> client.update() with NO prompt (notify-after), setLastSeen(current) recorded; unit: daemon-freshness reconnect-confirm success: after update() polled status().installedCommit advances / updateOutcome().state==='succeeded' -> success notify; unit: daemon-freshness failure: update() rejects OR updateOutcome().state==='failed' OR no commit advance in budget -> exactly ONE failure notify with the raw error, no retry, no second update(); unit: daemon-freshness never-throws: a throwing seam is swallowed by the outer backstop; runDaemonFreshnessCheck resolves; setLastSeen(current) called on every terminal path | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Wire the real vscode seams in extension.ts + fire the check fire-and-forget | S | `t1` | unit: extension.ts source-scan: constructs DaemonFreshnessDeps real seams (showInformationMessage(message,{},...actions), context.globalState + packageJSON.version, a child_process git ls-remote) and invokes runDaemonFreshnessCheck WITHOUT await; unit: extension.ts source-scan: the new globalState key constant is referenced for lastSeen persistence | [[c1]] [[c4]] |

### E20260924b6c90b3e:S003:T001 — Build the VS-Code-free daemon-freshness flow module + its seam types

New module vscode-plugin/src/freshness/daemon-freshness.ts exporting runDaemonFreshnessCheck(deps: DaemonFreshnessDeps): Promise<void> + the seam types DaemonFreshnessDeps / FreshnessNotify / PluginVersionState. The flow (all over injected seams, NO vscode import): opportunistic reachability gate (skip unless client.reachability()==='running'); read client.status().installedCommit (sc2, skip if ''); compute upstream via deps.gitLsRemote(daemonRoot, branch) (skip if ''/throws/equal — up to date); branch on versionState.current!==getLastSeen() → self-update (auto client.update(), notify-after, no prompt) vs startup-check (notify('Update','Dismiss'), client.update() only on 'Update'); after update() a bounded reconnect-and-confirm polling client.updateOutcome()/status().installedCommit under reconnectBudgetMs → success notify or a SINGLE failure notify with the raw error (no retry/rollback); ALWAYS setLastSeen(current). Wrapped in an outer try/catch so it NEVER rejects. Consumes sc1 client.update()/updateOutcome() — NOT controller.run('update') (k2).

**Acceptance checks:**
- runDaemonFreshnessCheck + DaemonFreshnessDeps/FreshnessNotify/PluginVersionState exported from vscode-plugin/src/freshness/daemon-freshness.ts with NO vscode import
- reachable + drift + current===lastSeen → notify('Update','Dismiss'); client.update() called ONLY on 'Update'; unreachable/''-commit/equal-commit/ls-remote-fail → skip (no notify, no update)
- current!==lastSeen + drift → client.update() with NO prompt (notify-after)
- after update(): bounded reconnect-confirm via updateOutcome()/status(); success → success notify; update() reject OR updateOutcome().state==='failed' OR no commit advance in budget → exactly one failure notify with the raw error, no retry
- setLastSeen(current) on every terminal path; the function never rejects (outer try/catch); calls client.update() (sc1), never controller.run('update') / daemon-ctl.sh (k2)
- tsc clean

### E20260924b6c90b3e:S003:T002 — Wire the real vscode seams in extension.ts + fire the check fire-and-forget

In vscode-plugin/src/extension.ts (the sole vscode importer) construct the real DaemonFreshnessDeps and invoke runDaemonFreshnessCheck WITHOUT await from activation (the runReachabilityProbe fire-and-forget precedent): notify = (message,...actions)=>vscode.window.showInformationMessage(message,{},...actions); versionState = { current: context.extension.packageJSON.version, getLastSeen/setLastSeen over context.globalState under a new key constant (e.g. 'insrc.daemonSelfUpdate.lastSeenPluginVersion') }; gitLsRemote = a child_process git runner (`git -C <daemonRoot> ls-remote origin <branch>` — or resolve the branch first); client = the shared ipc client; daemonRoot = the daemon checkout root. Additive to activation (still returns void); introduces the first globalState usage. Does not touch sc1/sc2 internals or S004.

**Acceptance checks:**
- extension.ts builds the DaemonFreshnessDeps real seams (showInformationMessage(message,{},...actions), context.globalState + context.extension.packageJSON.version, a child_process git ls-remote, the ipc client) and invokes runDaemonFreshnessCheck WITHOUT await
- a new globalState key constant is defined + referenced for lastSeen persistence
- activation still returns void and is not blocked (fire-and-forget); no controller.run('update') added
- tsc clean across vscode-plugin

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| startup-check drift: reachable + installedCommit !== upstream + current===lastSeen → notify('Update','Dismiss') shown; on 'Update' client.update() is called; on 'Dismiss'/undefined it is NOT (ac1) | `t1` |
| skip paths: unreachable → no notify/no update; installedCommit==='' → skip; installedCommit===upstream → skip; ls-remote ''/throws → skip (ac2) | `t1` |
| self-update: current!==lastSeen + drift → client.update() called with NO prompt (notify-after), and setLastSeen(current) recorded (ac3) | `t1` |
| reconnect-and-confirm success: after update() the polled status().installedCommit advances / updateOutcome().state==='succeeded' → a success notify | `t1` |
| failure: update() rejects OR updateOutcome().state==='failed' OR commit never advances within budget → exactly ONE failure notify carrying the raw error; no retry, no second update() (ac4) | `t1` |
| never-throws: any seam throwing is swallowed by the outer backstop — runDaemonFreshnessCheck resolves, never rejects | `t1` |
| setLastSeen(current) is called on every terminal path (skip, updated, failed) so the self-update fires once | `t1` |
| extension.ts constructs the DaemonFreshnessDeps real seams (showInformationMessage(message,{},...actions), context.globalState + packageJSON.version, a child_process git ls-remote) and invokes runDaemonFreshnessCheck WITHOUT await (fire-and-forget) | `t2` |
| the new globalState key constant is referenced for lastSeen persistence | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails: runDaemonFreshnessCheck(deps) + activateExtension wiring; the VS-Code-free flow module + fire-and-forget activation hook`
- **[[c2]]** `prior-artifact` `LLD s3 dataModel + interactionWithShared: DaemonFreshnessDeps/FreshnessNotify/PluginVersionState seams; consumes sc1 (client.update/updateOutcome) + sc2 (status().installedCommit)`
- **[[c3]]** `prior-artifact` `LLD s3 errorPaths: skip paths, reconnect-and-confirm, single-failure-notify (k5), never-throws backstop`
- **[[c4]]** `analyze-bundle` `s1 structural-map: extension.ts sole vscode importer (showInformationMessage(message,{},...items) seam :76) + activation.ts runReachabilityProbe fire-and-forget (:66); no globalState usage today (net-new)`
