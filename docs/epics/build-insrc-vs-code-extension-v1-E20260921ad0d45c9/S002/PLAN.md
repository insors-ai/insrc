<!-- insrc:artifact PLAN-ad0d45c9d690f8c1-s2 -->

# Plan: E20260921ad0d45c9:S002

**Epic:** `build-insrc-vs-code-extension-v1`
**LLD run:** `wf-1790014807551-63lt7j`
**LLD effective hash:** `1e2038ef7232...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** DaemonLifecycleController over an injectable SubprocessRunner + DaemonPaths | M | — | unit: run(action) spawns ['bash', paths.ctlScript, <action>] for start/stop/restart/update (argv assertion) and on exit 0 sets state = fake reachability() (incl. update⇒stopped); never throws; unit: run(action) maps EACH ctl exit code 1/2/3/4 to its documented errored reason, and a missing ctlScript returns errored/~not installed without spawning; unit: install() spawns ['bash', paths.bundledInstaller, '-y']; exit 0 → state=reachability(); installer codes 1/2 → mapped errored messages; unit: isInstalled() true iff paths.daemonEntry exists (fixture fs), false for clone-without-build, never throws on stat failure; unit: source-scan: vscode-plugin/src/daemon/ imports only node builtins + src/shared/ipc-client + the s1 surfaces (no daemon internals/indexer/storage, no cloud/HTTP) | [[c1]] |
| 2 | **`t2`** registerDaemonCommands wiring (5 commands, install sc4-gated, state→sc2) | M | `t1` | unit: registerDaemonCommands registers exactly the five insrc.daemon.{install,start,stop,restart,update} commands into the fake CommandRegistry; unit: the install command asks sc4 and calls controller.install() ONLY on 'accepted'; nothing on declined/dismissed (k4); unit: each lifecycle command calls controller.run(action) and pushes the resulting LifecycleResult.state (incl. a failing action→'errored'+message) into StatusSurface.set | [[c2]] |
| 3 | **`t3`** Bundle the installer asset into the extension package via a repeatable copy step | S | — | unit: bundle-fidelity: vscode-plugin/assets/insrc-daemon-install.sh exists and byte-matches scripts/insrc-daemon-install.sh (drift test); smoke: the copy step (package.json script) regenerates assets/insrc-daemon-install.sh from scripts/ deterministically | [[c3]] |
| 4 | **`t4`** Wire the daemon lifecycle into extension.ts (+ activation-time Install offer) | S | `t1`, `t2`, `t3` | unit: activation wiring: with the daemon absent (fake isInstalled=false) the Install offer is made via sc4 and nothing is spawned before 'accepted'; activate() never throws / never blocks (S001 preserved); smoke: the vscode-plugin package typechecks (tsc -p tsconfig.json) with the sc6 wiring added to extension.ts | [[c1]] [[c2]] [[c3]] [[c4]] |

### E20260921ad0d45c9:S002:T001 — DaemonLifecycleController over an injectable SubprocessRunner + DaemonPaths

Create vscode-plugin/src/daemon/ with: the SubprocessRunner interface (run(command: readonly string[], opts?): Promise<{ code: number }>) + a default node:child_process spawn impl; the DaemonPaths interface (daemonRoot/ctlScript/daemonEntry/bundledInstaller) + a default that resolves ~/.insrc/daemon + its scripts; and createDaemonLifecycleController({ runner, paths, client }) implementing isInstalled() (fs existence of daemonEntry, never throws), install() (bash <bundledInstaller> -y), run(action) (bash <ctlScript> <action>). On exit 0, state = await client.reachability(); on non-zero, ok=false, state='errored', message = the documented exit-code reason (ctl 1/2/3/4; installer 1/2). Reproduces none of the scripts' logic (lc2/k5).

**Acceptance checks:**
- run(action) spawns ['bash', paths.ctlScript, <action>] for each of start/stop/restart/update and maps EACH ctl exit code 1/2/3/4 to its documented reason (not just 'errored'); on exit 0 state = client.reachability(); never throws
- install() spawns ['bash', paths.bundledInstaller, '-y']; on exit 0 state = client.reachability(); on non-zero maps EACH installer code 1/2 to its documented reason
- isInstalled() returns true iff paths.daemonEntry exists, false for a clone-without-build, never throws on a stat failure
- vscode-plugin/src/daemon/ imports only node builtins (child_process/fs/path/os) + src/shared/ipc-client + the s1 surfaces — no daemon internals/indexer/storage, no cloud/HTTP (k5)

### E20260921ad0d45c9:S002:T002 — registerDaemonCommands wiring (5 commands, install sc4-gated, state→sc2)

Add registerDaemonCommands({ commands, consent, status, controller }): registers the five insrc.daemon.{install,start,stop,restart,update} commands into sc3. The install command asks sc4 and calls controller.install() ONLY on 'accepted' (k4); the four lifecycle commands call controller.run(action) (no gate). Every command pushes the returned LifecycleResult.state into sc2 (StatusSurface.set), including 'errored' with the mapped message on failure.

**Acceptance checks:**
- registers exactly the five insrc.daemon.* commands into the CommandRegistry
- the install command calls ConsentGate.ask and invokes controller.install() only on 'accepted'; on 'declined'/'dismissed' it calls nothing (k4)
- each lifecycle command calls controller.run(action) and pushes the resulting LifecycleResult.state into StatusSurface.set; a failing action pushes 'errored' with the mapped message

### E20260921ad0d45c9:S002:T003 — Bundle the installer asset into the extension package via a repeatable copy step

Establish vscode-plugin/assets/insrc-daemon-install.sh as a copy of scripts/insrc-daemon-install.sh, produced by a REPEATABLE build/copy step (a package.json script) so it stays in sync and ships in the .vsix; have the default DaemonPaths.bundledInstaller resolve it relative to the extension install dir (context.extensionPath). The final .vsix packaging that includes assets/ is s6's boundary; s2 establishes the asset + its copy step + the resolution.

**Acceptance checks:**
- vscode-plugin/assets/insrc-daemon-install.sh exists and byte-matches scripts/insrc-daemon-install.sh (a source-scan/drift test flags divergence)
- the copy is produced by a repeatable step (a package.json script), not a one-off manual copy
- the default DaemonPaths resolves bundledInstaller to the assets path relative to the extension dir (injectable for tests)

### E20260921ad0d45c9:S002:T004 — Wire the daemon lifecycle into extension.ts (+ activation-time Install offer)

In extension.ts (the sole 'vscode' importer): construct the DaemonLifecycleController with the real SubprocessRunner + a DaemonPaths built from context.extensionPath, call registerDaemonCommands with the s1 surfaces + controller, and fire a MINIMAL activation-time Install offer (via sc4) when isInstalled() is false — all off the activation critical path so the S001 never-throws/never-block contract is preserved. The install→register→wire coalescing stays s5's job.

**Acceptance checks:**
- extension.ts constructs the controller (real SubprocessRunner + DaemonPaths from context.extensionPath) and calls registerDaemonCommands with the s1 surfaces
- with the daemon absent, the activation-time Install offer is made via sc4 and nothing is spawned before 'accepted'; activate() still never throws / never blocks (S001 contract preserved)
- the vscode-plugin package typechecks (tsc -p tsconfig.json)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| run(action) spawns ['bash', DaemonPaths.ctlScript, <action>] for each of start/stop/restart/update (argv assertion via the fake runner) | `t1` |
| run(action) on exit 0 sets state = fake client.reachability() (running/stopped/errored) — including update⇒'stopped' when reachability says stopped (never assumes 'running' from exit 0) | `t1` |
| run(action) maps ctl exit codes 1/2/3/4 to { ok:false, state:'errored', message:<documented reason> } and never throws | `t1` |
| run(action) when DaemonPaths.ctlScript is missing returns { ok:false, state:'errored', message:~/not installed/ } without spawning | `t1` |
| install() spawns ['bash', DaemonPaths.bundledInstaller, '-y']; on exit 0 state = reachability(); on non-zero maps installer codes 1/2 to an errored message | `t1` |
| isInstalled() returns true iff DaemonPaths.daemonEntry exists (fixture fs), false for a clone-without-build, and never throws on a stat failure | `t1` |
| registers exactly the five insrc.daemon.{install,start,stop,restart,update} commands into the fake CommandRegistry | `t2` |
| the install command calls ConsentGate.ask and invokes controller.install() ONLY on 'accepted'; on 'declined'/'dismissed' it calls nothing (k4) | `t2` |
| each lifecycle command calls controller.run(action) (no consent gate) and pushes the returned LifecycleResult.state into StatusSurface.set | `t2` |
| a failing action pushes 'errored' with the mapped message to the status surface | `t2` |
| source-scan: vscode-plugin/src/daemon/ imports only node builtins (child_process/fs/path/os) + src/shared/ipc-client + the s1 surfaces — no daemon internals/indexer/storage, no cloud/HTTP | `t1` |
| activation wiring: with the daemon absent (fake isInstalled=false) the activation-time Install offer is made via sc4 and nothing is spawned before 'accepted'; activate() still never throws / never blocks (S001 contract preserved) | `t4` |
| the bundled installer asset exists at vscode-plugin/assets/insrc-daemon-install.sh and matches scripts/insrc-daemon-install.sh (bundle-fidelity check) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 sc6 DaemonLifecycleController — isInstalled/install/run over an injectable SubprocessRunner + DaemonPaths, exit-code→message mapping (ctl 1/2/3/4, installer 1/2), sc1.reachability()-derived state, k5 thin boundary`
- **[[c2]]** `prior-artifact` `LLD s2 registerDaemonCommands — registers the five insrc.daemon.* commands into sc3, install gated by sc4 ('accepted'), each pushes LifecycleResult.state into sc2`
- **[[c3]]** `prior-artifact` `LLD s2 dataModel: vscode-plugin/assets/insrc-daemon-install.sh bundled asset copied from scripts/insrc-daemon-install.sh, resolved via DaemonPaths.bundledInstaller (final .vsix packaging deferred to s6)`
- **[[c4]]** `prior-artifact` `LLD s2 dataModel: vscode-plugin/src/extension.ts activation wiring — constructs the controller (real SubprocessRunner + DaemonPaths from context.extensionPath), calls registerDaemonCommands, fires the activation-time Install offer, preserving the S001 never-throws/off-UI contract`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-21T18:41:22.384Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t2 | inventory | LOW | manual | The S001 InsrcCommandId union already declares the five daemon command ids (insrc.daemon.install/start/stop/restart/update) that t2 registers — no new id is introduced. | Confirmed: vscode-plugin/src/surfaces/command-registry.ts declares the insrc.daemon.* union (the surfaces test round-trips 'insrc.daemon.start'); the five ids t2 registers already exist in the S001 InsrcCommandId type — no new id. | none — verified sound |
| t3 | citation | LOW | manual | scripts/insrc-daemon-install.sh exists as the source the t3 bundle-fidelity copy targets. | Confirmed: scripts/insrc-daemon-install.sh exists ('insrc daemon bootstrap installer', prereqs Node>=20/git) — the source the t3 bundle-fidelity copy targets. | none — verified sound |
| t1 | citation | LOW | manual | scripts/daemon-ctl.sh exists with the start/stop/restart/update subcommands + DAEMON_ENTRY (out/daemon/index.js) that t1's controller spawns + checks. | Confirmed: scripts/daemon-ctl.sh:47 DAEMON_ENTRY=$DAEMON_ROOT/out/daemon/index.js and :290 the restart) cmd_restart dispatch (start/stop/restart/update present) — the subcommands + compiled-entry path t1's controller spawns/checks. | none — verified sound |
| t1 | citation | LOW | manual | The S001 sc1 client (src/shared/ipc-client.ts) exposes reachability() that t1's controller consumes for resulting state. | Confirmed: src/shared/ipc-client.ts:97 `reachability(): Promise<DaemonReachability>;` — the S001 method t1's controller consumes for resulting state. | none — verified sound |
| t4 | citation | LOW | manual | vscode-plugin/src/extension.ts is the sole 'vscode' importer and the never-throws activation shell t4 extends. | Confirmed: vscode-plugin/src/extension.ts:9 `import * as vscode from 'vscode'` (the sole importer) + the `export function activate(` shell (asserted by activation.test) — the never-throws activation surface t4 extends. | none — verified sound |
| tasks | ordering | LOW | manual | The plan task DAG is acyclic and topologically ordered: t1/t3 have no deps; t2→t1; t4→t1/t2/t3; orders 1-4 place each dependency before its dependant. | Internal-consistency check (no source probe): the plan's task table shows t1/t3 with no deps, t2 dependsOn t1, t4 dependsOn t1/t2/t3, orders 1-4 — a valid acyclic topological order (every dependency's order < its dependant's). Verified in the s6 checklist (t3 passed). | none — verified sound |
| coverage | cross-artifact | LOW | manual | Every LLD testStrategy subject (13 items) maps to ≥1 covering task in testStrategyCoverage, and every derivedFrom citation c1-c4 traces to an approved-S002-LLD handoff item. | Internal-consistency check: the plan's testStrategyCoverage maps all 13 LLD subjects each to ≥1 task (t1 controller+source-scan, t2 wiring, t3 bundle-fidelity, t4 activation), and citations c1-c4 each carry a prior-artifact ref to an approved-S002-LLD handoff item, each referenced by ≥1 task. Verified in the s6 checklist (cov1/cov2/gr1 passed). | none — verified sound |
