<!-- insrc:artifact LLD-ad0d45c9d690f8c1-s2 -->

# LLD: E20260921ad0d45c9:S002

**Epic:** `build-insrc-vs-code-extension-v1`
**HLD base run:** `wf-1790009331473-c5to0q`
**HLD effective hash:** `1e2038ef7232...`

## HLD context

**Framework:** The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package.json + build + Marketplace metadata) whose whole job is to wire insrc into stock VS Code at lifecycle moments (activate, first workspace open, uninstall). It re-expresses the shipped jetbrains-plugin/ thin-config-orchestrator in TS over VS Code primitives, reaching the daemon ONLY through a NEW in-repo src/shared/ipc-client module that generalizes the existing src/cli/client.ts `rpc` fn + its IPC request/reply types + the socket path — giving exactly one socket-client code path shared by the CLI and the extension (k5), with no daemon internals, indexer, or storage in the extension bundle, and no cloud path opened by the extension (k2). The extension is decomposed into small per-capability seams, each with an injectable boundary so its load-bearing logic is unit-testable off the VS Code API, and every invasive action (install the daemon, wire a host, register the workspace) is consent-gated and exposed as a durable first-class command.
**Rollout phase:** Phase B — Capability seams (lifecycle, host wiring, registration)
**Owns:** `sc6` (DaemonLifecycleController)
**Consumes:** `sc1` (SharedIpcClient), `sc2` (StatusSurface), `sc3` (CommandRegistry), `sc4` (ConsentGate), `sc6` (DaemonLifecycleController)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The VS Code activation entrypoint, the extension-bundle packaging (its build over src/shared/ipc-client), and the daemon-reachability probe implementation stay private to s1. How the status-bar item is created and rendered, and the concrete extraction of src/cli/client.ts into a re-export over src/shared/ipc-client (without regressing the CLI/TUI), are internal detail — only the four type-level contracts (sc1–sc4) are exposed. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s3`: The concrete per-host config locations and shapes (extension-ID hosts like Copilot/Claude Code/Continue/Cline vs editor-environment hosts like Cursor/Windsurf/VSCodium via .vscode/mcp.json or the host's own file), the marker-delimited JSON-merge and steering writers, and the detection mechanics stay private to each adapter behind sc5. Only the sc5 interface + registry is exposed; the wire command is registered into sc3 and the combined consent uses sc4. — owns `sc5`
- `s4`: The workspace-root resolution from the open VS Code workspace folders and the already-registered check semantics stay private to s4. Only the sc7 registrar contract is exposed; enrolment goes exclusively through the daemon's repo.add over sc1, the register command is registered into sc3, and the one-time prompt uses sc4. — owns `sc7`
- `s5`: The first-run flow sequencing (the order and coalescing of the install → register → wire consent prompts into one coherent flow rather than scattered pop-ups), the persisted 'already onboarded' state, and the uninstall hook that drives sc5.unwire across wired hosts are private to s5. It owns no new shared contract — it composes the branch owners' contracts and pushes resulting state through sc2.
- `s6`: The vscode-plugin/package.json manifest (contributes/engines.vscode/activationEvents), the Marketplace listing assets (icon, README, categories), the packaging into a single .vsix, and the manually-triggered (workflow_dispatch) Marketplace-only publish path stay entirely private to s6 — no runtime contract is exposed and it depends on no other story's contract, only on the s1 package existing.

## Contract details

**Surface level:** internal-shared

### `DaemonLifecycleController.isInstalled`

```typescript
isInstalled(): Promise<boolean>
```

**Returns:** `Promise<boolean>` — true iff a built daemon is present — the compiled entry exists at DaemonPaths.daemonEntry (~/.insrc/daemon/out/daemon/index.js). A pure filesystem check; never spawns a script.

**Errors:**
- `(never throws)` when a filesystem stat failure is treated as not-installed (false), not an exception.

**Preconditions:**
- Reads only local fs under DaemonPaths (injected); opens no cloud path (k2).

**Postconditions:**
- Drives the activation-time Install offer (ac2) and lets callers avoid running lifecycle actions on an absent daemon.

### `DaemonLifecycleController.install`

```typescript
install(): Promise<LifecycleResult>
```

**Returns:** `Promise<LifecycleResult>` — { ok, state, message? } — the outcome of spawning the BUNDLED installer (bash DaemonPaths.bundledInstaller -y). On exit 0, state = await client.reachability(); on non-zero, ok=false, state='errored', message = the installer's exit-code reason (1 usage/abort, 2 prerequisites missing).

**Errors:**
- `LifecycleResult{ ok:false, state:'errored', message }` when the installer exits non-zero, or the subprocess cannot be spawned (bash/asset missing) — surfaced as a message, never thrown.

**Preconditions:**
- The CALLER must have obtained sc4 consent ('accepted') before calling install() — install() itself performs the provision (k4 gating lives in the command wiring, not here).
- The installer SCRIPT is bundled in the extension (DaemonPaths.bundledInstaller), run locally with -y (lc1); its git-clone of the daemon source is the installer's own by-design behaviour, not an extension cloud path (k2).

**Postconditions:**
- On success the daemon tree exists at ~/.insrc/daemon; the resulting state reflects the real reachability.

### `DaemonLifecycleController.run`

```typescript
run(action: LifecycleAction): Promise<LifecycleResult>
```

**Parameters:**
- `action: LifecycleAction` — 'start' | 'stop' | 'restart' | 'update' — the daemon-ctl.sh subcommand to invoke.

**Returns:** `Promise<LifecycleResult>` — { ok, state, message? } — spawns bash DaemonPaths.ctlScript <action>. On exit 0, state = await client.reachability() (the TRUE resulting state — correct even for `update`, which does not start the daemon); on non-zero, ok=false, state='errored', message = the ctl exit-code reason (1 usage, 2 not-a-checkout, 3 unclean/diverged, 4 git/npm/build/start failed).

**Errors:**
- `LifecycleResult{ ok:false, state:'errored', message }` when daemon-ctl.sh exits non-zero, or the ctl script is missing / cannot spawn — surfaced as a message, never thrown.

**Preconditions:**
- The extension delegates entirely to the daemon's own daemon-ctl.sh (lc2/k5) — it reproduces none of the script's logic and reads state only over sc1.

**Postconditions:**
- The resulting LifecycleResult.state is pushed into sc2 by the command wiring; a stop⇒stopped, a start⇒running (or errored if it failed to come up), an update⇒whatever reachability then reports.

### `SubprocessRunner.run`

```typescript
run(command: readonly string[], opts?: { env?: Record<string, string>; cwd?: string }): Promise<{ code: number }>
```

**Parameters:**
- `command: readonly string[]` — argv for the spawn (e.g. ['bash', ctlScript, 'start']).
- `opts: { env?; cwd? }` _(optional)_ — optional env (to prepend a resolved node bin to PATH, mirroring the JetBrains NodeRuntimeResolver) + working dir.

**Returns:** `Promise<{ code: number }>` — The child process exit code. The default impl uses node:child_process spawn; tests inject a fake so exit-code mapping + command construction are unit-testable off a real shell.

**Errors:**
- `{ code: non-zero }` when a spawn failure resolves to a non-zero sentinel code rather than throwing, so the controller maps it to a LifecycleResult message.

**Preconditions:**
- An injectable seam (the JetBrains SubprocessRunner precedent, c3); the controller never spawns directly.

**Postconditions:**
- Keeps the controller's load-bearing logic testable without a real shell or daemon.

### `DaemonPaths`

```typescript
interface DaemonPaths { daemonRoot: string; ctlScript: string; daemonEntry: string; bundledInstaller: string }
```

**Returns:** `DaemonPaths` — The injected path bundle: daemonRoot ~/.insrc/daemon; ctlScript ~/.insrc/daemon/scripts/daemon-ctl.sh; daemonEntry ~/.insrc/daemon/out/daemon/index.js; bundledInstaller the .vsix-shipped installer (resolved from the extension install dir / context.extensionPath). Injected so tests point it at fixtures.

**Preconditions:**
- Mirrors the JetBrains DaemonScriptLocator (~/.insrc/daemon/scripts/daemon-ctl.sh) + the DAEMON_ROOT/DAEMON_ENTRY constants from daemon-ctl.sh.

**Postconditions:**
- Keeps the daemon-ctl invocation targets + the installer-asset location private to s2.

### `registerDaemonCommands`

```typescript
registerDaemonCommands(deps: { commands: CommandRegistry; consent: ConsentGate; status: StatusSurface; controller: DaemonLifecycleController }): void
```

**Parameters:**
- `deps: { commands: CommandRegistry; consent: ConsentGate; status: StatusSurface; controller: DaemonLifecycleController }` — the s1 surfaces (sc2/sc3/sc4) + the sc6 controller the wiring composes.

**Returns:** `void` — Registers the five durable commands into sc3: insrc.daemon.install (asks sc4 first, calls controller.install() only on 'accepted' — k4) and insrc.daemon.{start,stop,restart,update} (call controller.run(action)); every command pushes the resulting LifecycleResult.state into sc2.

**Errors:**
- `Error` when propagates a duplicate-InsrcCommandId programming error from CommandRegistry.register (a build-time guard, not a runtime path).

**Preconditions:**
- s2 owns the install capability + command wiring; the coalescing/sequencing of install→register→wire is s5's boundary (s2 wires only a minimal activation-time Install offer when isInstalled() is false).

**Postconditions:**
- Every dismissed prompt stays reachable as a durable command (k6); nothing invasive runs without sc4 'accepted' (k4).

## Data model changes

### `vscode-plugin/src/daemon/ (new module dir)` — new

New sc6 home: a DaemonLifecycleController factory over an injected SubprocessRunner seam + a DaemonPaths locator, plus the registerDaemonCommands wiring. Keeps the daemon-ctl.sh invocation + exit-code parsing + the installer-asset detail private to s2. Node child_process spawn is the default SubprocessRunner impl; no daemon internals/indexer/storage imported (k5).

**Call sites:**
- `scripts/daemon-ctl.sh`
- `scripts/insrc-daemon-install.sh`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleCommandRunner.kt`

### `vscode-plugin/assets/insrc-daemon-install.sh (bundled asset)` — new

The installer script copied from scripts/insrc-daemon-install.sh into the extension package by a build step, so it ships inside the .vsix and runs locally on consent (lc1). Resolved at runtime via DaemonPaths.bundledInstaller (extension install dir). The final .vsix packaging that includes assets/ is s6's boundary; s2 establishes the asset + its copy step.

**Call sites:**
- `scripts/insrc-daemon-install.sh`

### `vscode-plugin/src/extension.ts (activation wiring)` — invariant-change

extension.ts (the sole 'vscode' importer) constructs the DaemonLifecycleController (real SubprocessRunner + DaemonPaths from context.extensionPath) and calls registerDaemonCommands with the s1 surfaces; it also fires the minimal activation-time Install offer when isInstalled() is false. The s1 activation contract (never-throws, off-UI) is preserved.

**Call sites:**
- `vscode-plugin/src/extension.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | s2 owns sc6: DaemonLifecycleController with isInstalled()/install()/run(action)→LifecycleResult, delegating to daemon-ctl.sh + the bundled installer via an injectable SubprocessRunner + DaemonPaths, and deriving resulting state from sc1. |
| `sc1` | consumes | install()/run() call client.reachability() after a successful script exit to derive the TRUE LifecycleResult.state — the only channel to daemon state (k5). |
| `sc2` | consumes | registerDaemonCommands pushes each command's resulting LifecycleResult.state into StatusSurface.set (ac1). |
| `sc3` | consumes | registerDaemonCommands calls CommandRegistry.register for the five insrc.daemon.* commands (k6). |
| `sc4` | consumes | The insrc.daemon.install command gates on ConsentGate.ask 'accepted' before install() (k4); the four lifecycle actions are not gated. |

## Error paths

### Error cases

- **A lifecycle action is run but the daemon-ctl.sh script is missing (no daemon installed, or a partial install).** (recoverable)
  - Detection: The DaemonPaths.ctlScript path does not exist (fs check before spawn) OR the SubprocessRunner resolves a non-zero sentinel code because bash cannot find the script.
  - Response: run(action) returns { ok:false, state:'errored', message:'insrc daemon is not installed — run Install first' } without attempting the action; the command wiring pushes 'errored' to sc2.
  - User impact: The developer sees an errored status + a message pointing at Install; nothing is spawned blindly.
- **daemon-ctl.sh exits non-zero (usage 1 / not-a-checkout 2 / unclean or diverged 3 / git|npm|build|start failed 4).** (recoverable)
  - Detection: SubprocessRunner.run resolves { code } ≠ 0; the controller maps the code to the documented reason.
  - Response: run(action) returns { ok:false, state:'errored', message:<mapped reason> } (e.g. code 3 → 'the daemon checkout has uncommitted or diverged changes'); state is pushed to sc2.
  - User impact: The developer sees a specific, actionable reason rather than a silent failure; the daemon is left as the script left it.
- **The bundled installer exits non-zero (usage/abort 1 / prerequisites missing 2 — e.g. Node<20 or git absent).** (recoverable)
  - Detection: SubprocessRunner.run for the installer resolves { code } ≠ 0; the controller maps the installer's code table.
  - Response: install() returns { ok:false, state:'errored', message:<installer reason> } (code 2 → 'prerequisites missing: Node >= 20 and git are required'); state pushed to sc2.
  - User impact: The developer learns the prerequisite gap; no partially-provisioned daemon is presented as running.
- **A lifecycle/install script exits 0 but the daemon is not actually reachable (e.g. start succeeded but the daemon crashed on boot; or update built without starting).** (recoverable)
  - Detection: After exit 0, the controller calls client.reachability() and gets 'stopped'/'errored' rather than 'running'.
  - Response: The LifecycleResult carries ok:true but state = the REAL reachability (stopped/errored), not an assumed 'running'; sc2 reflects the true state.
  - User impact: The status indicator never lies — a crashed start shows errored/stopped, an update shows whatever the daemon truly is.
- **The reachability re-probe itself hangs or errors (daemon socket wedged after the action).** (recoverable)
  - Detection: client.reachability() is bounded by its own classification (S001: ENOENT/ECONNREFUSED→stopped, else→errored, never throws); the command wiring runs it off the UI path.
  - Response: The controller uses reachability()'s returned state directly; no unhandled rejection, no activation/UI block.
  - User impact: Worst case the status shows 'errored' rather than hanging; the developer can retry.
- **The developer declines or dismisses the Install consent prompt.** (recoverable)
  - Detection: ConsentGate.ask returns 'declined' or 'dismissed' (not 'accepted').
  - Response: The install command performs NOTHING — install() is never called (k4); the durable insrc.daemon.install command remains available for later.
  - User impact: No provisioning happens behind their back; they can Install later from the command palette.

### Edge cases

| Input | Expected |
| :--- | :--- |
| `update` succeeds (exit 0) — but daemon-ctl.sh update deliberately does NOT start the daemon. | run('update') returns ok:true with state = client.reachability() — which is 'stopped' if the daemon was not running, or 'running' if it already was. The state is never assumed 'running' from the exit code alone. |
| `stop` is invoked when the daemon is already stopped. | daemon-ctl.sh treats an already-stopped daemon as success (exit 0); run('stop') returns ok:true, state:'stopped'. No spurious error. |
| Two lifecycle commands are triggered in quick succession (e.g. restart then status refresh). | Each spawns its own subprocess + its own reachability probe; the last resulting state pushed to sc2 wins. No shared mutable state in the controller. |
| isInstalled() is called on a machine with the daemon dir present but not yet built (clone but no out/daemon/index.js). | isInstalled() returns false (it checks DaemonPaths.daemonEntry, the compiled entry, not just the dir), so the Install/Update path is offered rather than a broken start. |
| The activation-time Install offer fires but the daemon IS installed. | isInstalled() returns true, so no Install offer is shown; only the explicit lifecycle commands are available. (The offer only appears when isInstalled() is false.) |

### Invariants to preserve

- The extension delegates entirely to the daemon's own scripts/daemon-ctl.sh + scripts/insrc-daemon-install.sh and reproduces NONE of their logic (lc2/k5) — the documented exit-code contract (ctl 0/1/2/3/4; installer 0/1/2) is the interface, mapped to messages, not re-implemented. [[c3]]
- The S001 activation contract is preserved: the sc6 wiring added to extension.ts must not make activate() throw or block the editor — the Install offer + command handlers run off the activation critical path, mirroring the S001 never-throws/off-UI probe. [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test) — the same runner S001 used for vscode-plugin/ (over injected fakes, no VS Code host); the sc6 unit tests inject a fake SubprocessRunner/IpcClient/DaemonPaths so they need no real shell or daemon, plus source-scan tests for the k5 boundary and bundle-fidelity (mirroring the JetBrains off-platform unit + source-scan split).`

### Test levels

- **unit** — Prove the DaemonLifecycleController's command construction, exit-code→message mapping, and reachability-derived state over an injected fake SubprocessRunner + fake IpcClient + fixture DaemonPaths — no real shell or daemon.
  - Subjects: `run(action) spawns ['bash', DaemonPaths.ctlScript, <action>] for each of start/stop/restart/update (argv assertion via the fake runner)`, `run(action) on exit 0 sets state = fake client.reachability() (running/stopped/errored) — including update⇒'stopped' when reachability says stopped (never assumes 'running' from exit 0)`, `run(action) maps ctl exit codes 1/2/3/4 to { ok:false, state:'errored', message:<documented reason> } and never throws`, `run(action) when DaemonPaths.ctlScript is missing returns { ok:false, state:'errored', message:~/not installed/ } without spawning`, `install() spawns ['bash', DaemonPaths.bundledInstaller, '-y']; on exit 0 state = reachability(); on non-zero maps installer codes 1/2 to an errored message`, `isInstalled() returns true iff DaemonPaths.daemonEntry exists (fixture fs), false for a clone-without-build, and never throws on a stat failure`
  - Fixtures: `a fake SubprocessRunner recording argv + returning a scripted { code }`, `a fake IpcClient whose reachability() is scripted per case`, `a DaemonPaths pointing at a tmp fixture dir (present vs absent daemonEntry / ctlScript / installer)`
- **unit** — Prove the registerDaemonCommands wiring: gate, command set, and status push — with fake sc2/sc3/sc4 + a fake controller.
  - Subjects: `registers exactly the five insrc.daemon.{install,start,stop,restart,update} commands into the fake CommandRegistry`, `the install command calls ConsentGate.ask and invokes controller.install() ONLY on 'accepted'; on 'declined'/'dismissed' it calls nothing (k4)`, `each lifecycle command calls controller.run(action) (no consent gate) and pushes the returned LifecycleResult.state into StatusSurface.set`, `a failing action pushes 'errored' with the mapped message to the status surface`
  - Fixtures: `fake CommandRegistry (records descriptors + run fns), fake ConsentGate (scripted outcome), fake StatusSurface (records snapshots), fake DaemonLifecycleController (scripted results)`
- **unit** — Prove the k5 thin-boundary + never-throws activation invariants by source-scan + a fake-VS-Code activation test (mirroring the S001 split).
  - Subjects: `source-scan: vscode-plugin/src/daemon/ imports only node builtins (child_process/fs/path/os) + src/shared/ipc-client + the s1 surfaces — no daemon internals/indexer/storage, no cloud/HTTP`, `activation wiring: with the daemon absent (fake isInstalled=false) the activation-time Install offer is made via sc4 and nothing is spawned before 'accepted'; activate() still never throws / never blocks (S001 contract preserved)`, `the bundled installer asset exists at vscode-plugin/assets/insrc-daemon-install.sh and matches scripts/insrc-daemon-install.sh (bundle-fidelity check)`
  - Fixtures: `a fake ExtensionContext + fake VS Code surfaces`, `the built module import list of vscode-plugin/src/daemon/`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `run(action) spawns bash daemon-ctl.sh <action> for each lifecycle action (argv unit test) — proves 'carries it out through the daemon's own supported lifecycle mechanism'`, `run(action) on exit 0 sets state = client.reachability(), including update⇒stopped (reachability unit test) — proves 'reflects the resulting state'`, `each lifecycle command pushes the resulting LifecycleResult.state into StatusSurface.set (wiring unit test) — proves the status reflects the action` |
| `ac2` | `the install command asks sc4 and calls controller.install() only on 'accepted', nothing on declined/dismissed (wiring unit test) — proves 'provisions nothing until the developer accepts'`, `install() spawns the BUNDLED installer asset (bash <bundledInstaller> -y) (controller unit test) + the asset exists in vscode-plugin/assets/ (bundle-fidelity test) — proves 'installs from an installer bundled in the extension itself'`, `with the daemon absent, the activation-time Install offer is made and nothing is spawned before consent (activation unit test) — proves the explicit offer on workspace open` |

## Alternatives considered

### a1: Script-delegating controller over an injectable ProcessRunner, resulting state re-probed via sc1 (JetBrains mirror) — **CHOSEN**

sc6 DaemonLifecycleController spawns the daemon's own scripts (install → bundled insrc-daemon-install.sh -y; start/stop/restart/update → ~/.insrc/daemon/scripts/daemon-ctl.sh <action>) through an injectable ProcessRunner seam + a DaemonPaths locator, maps the documented exit codes to a message, and DERIVES LifecycleResult.state by re-probing sc1.reachability() after the script exits.

A new vscode-plugin/src/daemon/ seam: a ProcessRunner interface with a default node:child_process spawn impl + a DaemonPaths value (daemonRoot, ctlScript, daemonEntry, bundledInstaller), both injected so the controller is unit-testable off a real shell. isInstalled() = fs existence of daemonEntry. run(action) spawns bash <ctlScript> <action>; install() spawns bash <bundledInstaller> -y. Exit code → message uses the scripts' documented codes. On exit 0, state = await client.reachability(); on non-zero, ok=false, state='errored', message=<mapped reason>. Never reproduces the scripts' logic (lc2). s2 registers the five durable commands into sc3 (Install gated by sc4) and offers Install once at activation when isInstalled() is false; each command pushes resulting state into sc2.

### a2: Controller that INFERS resulting state from action + exit code (no sc1 re-probe)

Same script-delegating shape, but LifecycleResult.state is inferred purely from the action and the exit code (start/restart/update → 'running' on 0; stop → 'stopped' on 0; non-zero → 'errored') without querying sc1.

Identical ProcessRunner + DaemonPaths + exit-code mapping as a1, but run(action) computes state from a static (action, exit0) table rather than re-probing reachability, so sc6 need not consume sc1 for the state read.

**Rejected because:** No hard violation but PARTIAL on ac1/sc1/sc2: inferring state from action+exit-code reports a false 'running' after update (which never starts the daemon) or a crash-on-boot start — exactly the resulting-state fidelity ac1 demands and sc2 depends on.

### a3: Single generic runScript(kind) collapsing install + lifecycle

Replace the sc6 isInstalled/install/run trio with one runScript(kind: 'install'|'start'|'stop'|'restart'|'update') that dispatches on the kind.

A single method keyed by an enum spanning install + the four lifecycle actions, resolving the script (installer vs ctl) internally, with isInstalled folded into a private helper.

**Rejected because:** VIOLATES sc6: collapsing isInstalled/install/run into one runScript(kind) contradicts the HLD-fixed contract and the way s5 consumes install()/run() separately, and folding the pure-fs isInstalled into a script-runner is a category error. Ranks last.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate + convention.detect: the S001 contracts sc6 consumes (createIpcClient.reachability()/status() in src/shared/ipc-client.ts; StatusSurface.set; CommandRegistry.register with the five insrc.daemon.* InsrcCommandIds; ConsentGate.ask) + the S001 never-throws/off-UI activation contract in vscode-plugin/src/extension.ts` — "createIpcClient(connect?) => IpcClient { rpc, status(), reachability() } — sc6 uses reachability() to derive the resulting LifecycleResult.state after an action."
- **[[c2]]** `code` `scripts/daemon-ctl.sh (start/stop/restart/update/status; DAEMON_ROOT ~/.insrc/daemon; DAEMON_ENTRY ~/.insrc/daemon/out/daemon/index.js; ctl exit codes 0/1/2/3/4) + scripts/insrc-daemon-install.sh (bundled installer, -y non-interactive, exit codes 0/1/2)` — "Documented exit codes: 0 success, 1 usage error, 2 not a git checkout, 3 uncommitted or diverged checkout, 4 git/npm/build/start step failed."
- **[[c3]]** `code` `jetbrains-plugin/.../lifecycle/DaemonLifecycleCommandRunner.kt + ScriptDaemonProvisioner.kt — the SubprocessRunner seam + DaemonScriptLocator (~/.insrc/daemon/scripts/daemon-ctl.sh) + exit-code→reason mapping + INSTALL→install script / UPDATE→daemon-ctl.sh update precedent sc6 mirrors 1:1` — "resolves ~/.insrc/daemon/scripts/daemon-ctl.sh via a DaemonScriptLocator, spawns it through an injectable SubprocessRunner seam, maps the documented exit codes to a user-facing reason, and NEVER repro"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-21T18:32:15.986Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c2 | citation | LOW | manual | scripts/daemon-ctl.sh accepts subcommands start/stop/restart/update (the actions sc6.run spawns) and defines DAEMON_ROOT=~/.insrc/daemon + DAEMON_ENTRY=$DAEMON_ROOT/out/daemon/index.js. | Confirmed: scripts/daemon-ctl.sh defines DAEMON_ROOT=~/.insrc/daemon and DAEMON_ENTRY=$DAEMON_ROOT/out/daemon/index.js (also mirrored in the JetBrains bundled installer that invokes `INSRC_DAEMON_ROOT=... "$CTL" start`). The sc6 DaemonPaths targets (daemonRoot/ctlScript/daemonEntry) match the real constants. | none — verified sound |
| c2 | external-contract | LOW | manual | scripts/daemon-ctl.sh's documented exit codes are 0 success / 1 usage / 2 not-a-checkout / 3 uncommitted-or-diverged / 4 git\|npm\|build\|start-failed — the codes sc6 maps to messages. | Confirmed: daemon-ctl.sh uses the documented exit codes (the JetBrains DaemonProvisionerTest asserts 'exit 2 for...' and the script's die/usage codes 0/1/2/3/4). sc6's exit-code→message mapping keys off the real contract. | none — verified sound |
| c2 | citation | LOW | manual | scripts/insrc-daemon-install.sh is the bundled installer, accepts a -y non-interactive flag, and is documented to exit 0 success / 1 usage-or-abort / 2 prerequisites-missing. | Confirmed: insrc-daemon-install.sh documents prerequisites (Node>=20, git), a -y non-interactive flag, and exit code '2 prerequisites missing (node / git / node...)'. install() spawning `bash <installer> -y` + mapping codes 1/2 is grounded. | none — verified sound |
| c3 | citation | LOW | manual | The JetBrains lifecycle precedent (DaemonLifecycleCommandRunner + ScriptDaemonProvisioner) resolves ~/.insrc/daemon/scripts/daemon-ctl.sh via a SubprocessRunner seam and routes INSTALL→install script / UPDATE→daemon-ctl.sh update — the shape sc6 mirrors in TS. | Confirmed: jetbrains-plugin/.../lifecycle/DaemonLifecycleCommandRunner + ScriptDaemonProvisioner exist (source + compiled classes) with the SubprocessRunner seam + daemon-ctl.sh resolution + INSTALL/UPDATE routing. sc6 mirrors a real, shipped precedent. | none — verified sound |
| c1 | citation | LOW | manual | The S001 sc1 client (src/shared/ipc-client.ts) exposes reachability(): Promise<DaemonReachability> that sc6 calls to derive resulting state, and it never throws. | Confirmed verbatim: src/shared/ipc-client.ts:97 `reachability(): Promise<DaemonReachability>;` and :112 its never-throws impl — the exact S001 method sc6 calls to derive resulting state. | none — verified sound |
| c1 | inventory | LOW | manual | The S001 CommandRegistry InsrcCommandId union already declares the five daemon command ids (insrc.daemon.install/start/stop/restart/update) that s2 registers. | Confirmed: vscode-plugin/src/surfaces/command-registry.ts:15 declares 'insrc.daemon.install' (and the union continues with start/stop/restart/update) — the five ids s2 registers already exist in the S001 InsrcCommandId union; no new id needed. | none — verified sound |
| c1 | citation | LOW | manual | The S001 sc4 ConsentGate.ask returns 'accepted'\|'declined'\|'dismissed' — the outcome the install command gates on ('accepted'). | Confirmed: vscode-plugin/src/surfaces/consent-gate.ts:20 `ConsentOutcome = 'accepted' \| 'declined' \| 'dismissed'` and :23 `ask(request): Promise<ConsentOutcome>` — the install gate on 'accepted' is grounded in the shipped sc4 surface. | none — verified sound |
| interactionWithShared | cross-artifact | LOW | manual | s2 implements only its owned sc6 (ownedByStory=s2 in the HLD) and consumes s1's sc1/sc2/sc3/sc4; it designs none of the adjacent-owned sc5 (s3) or sc7 (s4). | Internal-consistency check (no source probe): the LLD's interactionWithShared shows sc6 as role=implements (ownedByStory=s2 in the HLD) and sc1/sc2/sc3/sc4 as role=consumes; sc5 (s3) and sc7 (s4) appear only as adjacent-owned boundaries, never designed/implemented — sbdry5 holds, and the install→register→wire coalescing is explicitly deferred to s5. | none — verified sound |
