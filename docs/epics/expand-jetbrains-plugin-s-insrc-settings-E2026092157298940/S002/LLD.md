<!-- insrc:artifact LLD-57298940cdc341bc-s2 -->

# LLD: E2026092157298940:S002

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**HLD base run:** `wf-1789970136758-lvyg6v`
**HLD effective hash:** `7b17d6a14b2a...`

## HLD context

**Framework:** S002 fills the Daemon child page (Phase B): a health readout consuming sc2's daemonStatus() + six lifecycle action controls. Start/Restart/Update run daemon-ctl.sh via a new S002-internal lifecycle-command runner (reusing the existing SubprocessRunner + DefaultDaemonScriptLocator); Stop/Backup/Compact are three new DaemonGateway sealed-result IPC methods (daemon.shutdown/backup/compact). Off-EDT throughout; no daemon or parent-settings-page change.
**Rollout phase:** Phase B — Operational pages (Daemon, Workflows, Debug status+orphans)
**Consumes:** `sc1` (NestedSettingsNavScaffold + SharedPageShell), `sc2` (DaemonStatusRead)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Owns the nav scaffold + page-shell base + daemonStatus read S002 consumes. — owns `sc1`, `sc2`
- `s3`: Workflows read-only chain page (S003-internal).
- `s4`: Debug status card + orphan seam; owns DebugPageHost (sc3). — owns `sc3`
- `s5`: MCP/sessions Debug section.
- `s6`: Log-editor Debug section.

## Contract details

**Surface level:** internal

### `DaemonConfigurable.buildBody`

```typescript
override fun buildBody(): javax.swing.JComponent
```

**Returns:** `javax.swing.JComponent` — The Daemon page body, built OFF the EDT by the sc1 base. Reads daemonStatus() and renders a health card (Loaded -> running + uptime/queueDepth/embeddingsPending/modelPullStatus/lmdbFileSizeMb/repoCount; Stopped -> a distinct 'stopped' card foregrounding Start; Unavailable -> the reason, never blank/fabricated — ac1) plus six action controls (Start/Stop/Restart/Update/Backup/Compact) grouped via ui/InsrcCollapsible.collapsiblePanel.

**Errors:**
- `none (never throws to the EDT)` when runs on the pooled thread; daemonStatus() never throws and each action reports its outcome; the base renders an error label if buildBody() itself throws.

**Preconditions:**
- DaemonConfigurable already registered under parentId=ai.insors.insrc.settings (S001).

**Postconditions:**
- Only DaemonConfigurable is changed; the base + parent settings page are untouched (sc1, k4).

### `DaemonGateway.shutdown`

```typescript
fun shutdown(): DaemonActionResult
```

**Returns:** `DaemonActionResult` — Graceful stop over the daemon.shutdown IPC. Ok on success; a DaemonUnavailableException (already down) -> a clear terminal result; framed error -> Failed. Never throws.

**Errors:**
- `DaemonActionResult.Failed` when !r.ok || r.error != null, or a RuntimeException — caught and mapped.

**Preconditions:**
- New companion constant METHOD_SHUTDOWN='daemon.shutdown', empty params.

**Postconditions:**
- The page re-reads daemonStatus() after the call (expected Stopped).

### `DaemonGateway.backup`

```typescript
fun backup(targetDir: String): DaemonActionResult
```

**Parameters:**
- `targetDir: String` — The directory to write the backup into — forwarded as the daemon.backup `path` param (required non-empty).

**Returns:** `DaemonActionResult` — Runs daemon.backup {path: targetDir}; Ok(message) on success, Failed(reason) on framed error / unreachable. Never throws.

**Errors:**
- `DaemonActionResult.Failed` when !r.ok || r.error != null (incl. 'target path required'), or a RuntimeException — caught and mapped.

**Preconditions:**
- The page prompts for targetDir via the platform directory chooser BEFORE calling (ac2); reuses PARAM_PATH='path'.

**Postconditions:**
- The daemon writes the backup to targetDir; no plugin state persists.

### `DaemonGateway.compact`

```typescript
fun compact(): DaemonActionResult
```

**Returns:** `DaemonActionResult` — Runs daemon.compact; Ok on success. The handler refuses (throws) when the indexer is busy — that framed error surfaces as Failed(reason) forwarding the 'indexer busy, wait to compact' message (a distinct outcome, ac2). Never throws.

**Errors:**
- `DaemonActionResult.Failed` when !r.ok || r.error != null (incl. the busy-refusal), or a RuntimeException — caught and mapped; busy message forwarded verbatim.

**Preconditions:**
- New companion constant METHOD_COMPACT='daemon.compact', empty params.

**Postconditions:**
- On Ok the LMDB env is compacted; the page may re-read daemonStatus() to refresh lmdbFileSizeMb.

### `DaemonLifecycleCommandRunner.run`

```typescript
class DaemonLifecycleCommandRunner(runner: SubprocessRunner, scriptLocator: DaemonScriptLocator, nodeResolver: () -> NodeRuntime?, baseEnv: Map<String,String>) { fun run(command: LifecycleCommand): DaemonActionResult }
```

**Parameters:**
- `command: LifecycleCommand` — Which daemon-ctl.sh subcommand to run: START / RESTART / UPDATE.

**Returns:** `DaemonActionResult` — Resolves ~/.insrc/daemon/scripts/daemon-ctl.sh via the EXISTING DaemonScriptLocator and runs `bash <script> <subcommand>` through the EXISTING SubprocessRunner with the resolved Node on PATH. exit 0 -> Ok; 2/3/4 -> Failed(reason) with daemon-ctl.sh's documented semantics; missing script / IOException -> Failed. Never throws.

**Errors:**
- `DaemonActionResult.Failed` when non-zero exit, null/absent script path, or an IOException — all mapped to Failed(reason), never rethrown.

**Preconditions:**
- daemon-ctl.sh resolved via the existing DefaultDaemonScriptLocator; does NOT extend the S003-owned ProvisionKind.

**Postconditions:**
- Reuses SubprocessRunner/Subprocess/ProcessBuilderRunner + node-on-PATH exactly as ScriptDaemonProvisioner; daemon-ctl.sh logic is never reproduced.

## Data model changes

### `DaemonActionResult` — new

The uniform outcome of a lifecycle action (all six), so the page treats every action identically (ac2). Sealed two-state Ok(message?) | Failed(reason); compact-busy + every non-zero daemon-ctl.sh exit map to Failed(reason). Distinct from the sc2 DaemonStatusResult (a data read). S002-internal. schemaDiff: + sealed interface DaemonActionResult { data class Ok(val message: String? = null); data class Failed(val reason: String) }.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt (backup/compact/shutdown)`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt (renders the outcome)`

### `LifecycleCommand` — new

S002-internal closed enum of the daemon-ctl.sh subcommands the runner drives: START, RESTART, UPDATE. Distinct from the S003-owned ProvisionKind (INSTALL|UPDATE), which is NOT touched. schemaDiff: + enum class LifecycleCommand { START, RESTART, UPDATE }.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ (DaemonLifecycleCommandRunner)`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt`

### `DaemonLifecycleCommandRunner` — new

The NEW S002-internal lifecycle-command seam: runs daemon-ctl.sh {start,restart,update} via the EXISTING SubprocessRunner/Subprocess/ProcessBuilderRunner + the EXISTING DaemonScriptLocator + the resolved Node on PATH, mapping exit codes to DaemonActionResult. Never reproduces daemon-ctl.sh's logic; never extends ProvisionKind. schemaDiff: + class DaemonLifecycleCommandRunner(runner, scriptLocator, nodeResolver, baseEnv).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt (Start/Restart/Update)`
- `reuses ScriptDaemonProvisioner.SubprocessRunner/Subprocess/ProcessBuilderRunner + DefaultDaemonScriptLocator`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | DaemonConfigurable subclasses InsrcOpsConfigurable and fills only buildBody() off the EDT; base + parent page unchanged (k4). |
| `sc2` | consumes | Renders daemonStatus() verbatim; adds no sc2 field. The new action methods are a separate gateway surface; the page re-reads daemonStatus() after an action. |

## Error paths

### Error cases

- **Compact is invoked while the indexer is busy (queue.depth>0 || isProcessing).** (recoverable)
  - Detection: daemon.compact's handler throws, framed as !r.ok / r.error != null; compact() classifies it as Failed.
  - Response: Return DaemonActionResult.Failed(reason) forwarding the daemon's 'indexer busy, wait to compact' message verbatim; the daemon is left untouched.
  - User impact: A clear 'busy — wait to compact' message, not a crash or silent no-op; retry when the queue drains.
- **A lifecycle action (start/restart/update) runs but daemon-ctl.sh is missing (daemon not installed) or exits non-zero (2 not-a-checkout / 3 unclean / 4 build-failed).** (recoverable)
  - Detection: The DaemonScriptLocator returns null, or the SubprocessRunner returns a non-zero exit code, inside DaemonLifecycleCommandRunner.run().
  - Response: Map to DaemonActionResult.Failed(reason) using daemon-ctl.sh's exit-code semantics (or 'insrc daemon tooling is unavailable' when absent); never throw.
  - User impact: A specific failure reason instead of a hang/throw — uninstalled vs dirty vs build-failed.
- **Backup/compact/shutdown is invoked but the daemon socket is unreachable.** (recoverable)
  - Detection: rpc.call throws DaemonUnavailableException, caught in the gateway method.
  - Response: backup/compact -> Failed('daemon is not running'); shutdown -> already-stopped/clear result, never rethrown.
  - User impact: A clear 'daemon not running' outcome; the developer can Start it first.
- **A long-running action (update/backup) throws or hangs while the developer waits.** (recoverable)
  - Detection: The action runs under ProgressManager.runProcessWithProgressSynchronously OFF the EDT; a thrown RuntimeException is caught in the action wrapper.
  - Response: Marshal a Failed(reason) back to the EDT via the guarded invokeLater; the EDT is never blocked.
  - User impact: The IDE never freezes (k2); always a terminal outcome.
- **The Daemon page is disposed while an action / status read is still running off the EDT.** (recoverable)
  - Detection: The sc1 base's @Volatile disposed flag + root===scroll liveness check in the guarded invokeLater.
  - Response: The late render is dropped by the base; the action's daemon side-effect still completes but touches no disposed UI.
  - User impact: No exception or stale mutation after the page closes mid-action.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The developer cancels the backup directory chooser. | No daemon.backup call is made; the page stays as-is with no outcome — a cancel, not a Failed. |
| daemonStatus() returns Stopped when the page loads. | A distinct 'daemon stopped' card foregrounding Start (not blank/fabricated); Backup/Compact shown as unavailable-until-running (ac1). |
| Start succeeds but the daemon takes a moment; the page re-reads daemonStatus() immediately. | The refresh may briefly show Stopped; the outcome is Ok('started'); a later re-read shows Loaded — outcome and status read are independent. |
| backupAll returns a large/summary result object over the socket. | backup() maps it to Ok(message) with a concise summary; Gson shape variance is tolerated (never throws), consistent with the daemonStatus parse. |

### Invariants to preserve

- The new lifecycle-command runner reuses the EXISTING SubprocessRunner/Subprocess/ProcessBuilderRunner + DaemonScriptLocator and NEVER extends the S003-owned ProvisionKind enum — consumed, not re-shaped. [[c1]]
- Every daemon read + every lifecycle action runs OFF the EDT (executeOnPooledThread for the status read, ProgressManager for the actions) with the render marshalled back via the sc1 base's disposed-guarded invokeLater — the IDE is never blocked (k2). [[c8]]
- The new backup/compact/shutdown gateway methods + the runner NEVER throw: a framed error / non-zero exit / unreachable daemon maps to DaemonActionResult.Failed(reason), mirroring the probe()/repoStats()/daemonStatus() sealed-result contract; the daemon + parent settings page are unchanged (k1/k4). [[c7]]

## Test strategy

**Test framework:** `JUnit 5 (org.junit.jupiter) — fake-DaemonRpc gateway unit tests + fake-SubprocessRunner runner unit tests + source-scan page tests, run locally via ./gradlew test buildPlugin under JDK21 (no GitHub-CI).`

### Test levels

- **unit** — Drive DaemonGatewayImpl.backup/compact/shutdown against a fake DaemonRpc to prove DaemonActionResult classification + the wire shape.
  - Subjects: `backup(targetDir) sends METHOD_BACKUP with {path: targetDir}; ok -> Ok; framed error (incl. 'target path required') -> Failed`, `compact() sends METHOD_COMPACT (empty params); ok -> Ok; the busy-refusal framed error -> Failed forwarding the busy message verbatim`, `shutdown() sends METHOD_SHUTDOWN; ok -> Ok; DaemonUnavailableException -> a clear terminal result, never a throw`, `all three never throw on malformed/errored replies (RuntimeException -> Failed)`
  - Fixtures: `A RecordingRpc(handler) fake (DaemonStatusGatewayTest idiom) recording method+params`, `DaemonResult fixtures: ok, framed-error (compact busy, backup 'target path required'), thrown DaemonUnavailableException`
- **unit** — Drive DaemonLifecycleCommandRunner.run against a fake SubprocessRunner + fake DaemonScriptLocator to prove the subcommand + exit-code mapping with no real process.
  - Subjects: `run(START/RESTART/UPDATE) invokes `bash <daemon-ctl.sh> <subcommand>` with the resolved Node on PATH`, `exit 0 -> Ok; 2/3/4 -> Failed(reason) with daemon-ctl.sh's semantics`, `null/absent script path -> Failed('tooling unavailable'); IOException -> Failed`, `LifecycleCommand is its own enum; the runner never touches the S003 ProvisionKind`
  - Fixtures: `A fake SubprocessRunner recording the Subprocess + returning a scripted exit code`, `A fake DaemonScriptLocator returning a temp daemon-ctl.sh path (and one returning null)`
- **unit** — Source-scan the Daemon page body + fanout to prove sc1/sc2 consumption, six-action wiring, off-EDT actions, and parent-untouched.
  - Subjects: `DaemonConfigurable extends InsrcOpsConfigurable and buildBody() renders daemonStatus() Loaded/Stopped/Unavailable — no longer the placeholder`, `the page wires all six actions (Start/Restart/Update via the runner; Stop/Backup/Compact via the gateway) under ProgressManager off the EDT`, `the backup action opens a directory chooser before backup()`, `all 6 DaemonGateway impls declare the 3 new overrides; the parent InsrcSettingsConfigurable + its plugin.xml element are unchanged`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Source-scan: DaemonConfigurable.buildBody() renders daemonStatus() Loaded / a distinct Stopped card / Unavailable, not the placeholder`, `gateway/status unit: daemonStatus() Loaded/Stopped/Unavailable (S001's DaemonStatusGatewayTest, consumed here)` |
| `ac2` | `Gateway unit: backup/compact/shutdown map ok/framed-error/unreachable to Ok/Failed; backup sends the {path} param (asks-where-to-write precedes)`, `Runner unit: run(START/RESTART/UPDATE) -> Ok on exit 0, Failed(reason) on exit 2/3/4 / missing script`, `Source-scan: every action runs under ProgressManager off the EDT and the backup action prompts for a directory first` |

## Migration

**State before:** DaemonConfigurable.buildBody() is the S001 placeholder JLabel. DaemonGateway has daemonStatus()/probe()/repoStats() but NO backup/compact/shutdown. The daemon already exposes daemon.backup{path}/compact/shutdown IPCs (src/daemon/index.ts:1450-1481) and daemon-ctl.sh already exposes start/stop/restart/update (scripts/daemon-ctl.sh); the reusable SubprocessRunner/ProcessBuilderRunner + DefaultDaemonScriptLocator exist — no daemon/script change needed. No DaemonActionResult/LifecycleCommand/runner yet.

**State after:** The Daemon page renders the sc2 readout + six action controls. DaemonGateway gains backup/compact/shutdown returning DaemonActionResult; a new DaemonLifecycleCommandRunner + LifecycleCommand{START,RESTART,UPDATE} runs daemon-ctl.sh subcommands via the reused seams. Every action off the EDT under ProgressManager with a clear outcome; backup prompts for a dir. The parent settings page + S003 ProvisionKind + the daemon are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sealed DaemonActionResult { Ok(message?) | Failed(reason) } + the enum LifecycleCommand { START, RESTART, UPDATE }. Additive new types. — ↩ rollbackable
2. Add backup(targetDir)/compact()/shutdown(): DaemonActionResult to the DaemonGateway interface + DaemonGatewayImpl (new METHOD_* constants, reuse PARAM_PATH; classify ok->Ok, framed-error/unreachable/RuntimeException->Failed; never throw). Leave daemonStatus()/probe() unchanged. — ↩ rollbackable
3. Add the 3 new overrides to the other DaemonGateway impls (DaemonGatewayService delegates; 4 test fakes trivial Failed stubs) — the same fanout the daemonStatus() addition took. — ↩ rollbackable
4. Add the DaemonLifecycleCommandRunner: resolve daemon-ctl.sh via the existing DefaultDaemonScriptLocator and run `bash <script> <subcommand>` through the reused SubprocessRunner with node on PATH, mapping exits to DaemonActionResult. Touches no S003 policy type. — ↩ rollbackable
5. Replace DaemonConfigurable's placeholder buildBody() with the real body: read daemonStatus() off the EDT, render the health card (distinct Stopped) + six action buttons under ProgressManager off the EDT, with a directory chooser before backup and the outcome shown after each action. Base + parent page untouched. — ↩ rollbackable
6. Add the gateway unit tests + runner unit tests + the Daemon page source-scan test; bump the plugin version. — ↩ rollbackable

**Backward compat:** Additive only. The DaemonGateway interface gains three methods (backup/compact/shutdown); every existing signature is unchanged, so callers are unaffected — the only compile impact is each concrete impl/test-fake adding the three overrides (mirroring the S001 daemonStatus() + earlier repoStats()/registerProject() fanout). DaemonConfigurable's inert placeholder body is replaced. The InsrcOpsConfigurable base, the parent InsrcSettingsConfigurable + its plugin.xml element, the S003 ProvisionKind/ScriptDaemonProvisioner/DefaultDaemonScriptLocator (consumed, not changed), the daemon, and daemon-ctl.sh are all unchanged.

## Alternatives considered

### a1: 3+3 split: new lifecycle-command runner (start/restart/update) + 3 new gateway IPCs (shutdown/backup/compact) — **CHOSEN**

A new S002-internal DaemonLifecycleCommandRunner runs daemon-ctl.sh {start,restart,update} via the reused SubprocessRunner + existing locator; Stop/Backup/Compact are three new DaemonGateway sealed-result IPC methods; the health readout renders sc2's daemonStatus().

The Daemon page renders sc2's DaemonStatusResult as a health card + six action buttons. START/RESTART/UPDATE go through a new DaemonLifecycleCommandRunner (LifecycleCommand enum + a runner that resolves daemon-ctl.sh via the existing DaemonScriptLocator and runs it via the existing SubprocessRunner, mapping exit codes). STOP/BACKUP/COMPACT go through three new sealed-result methods on DaemonGateway (daemon.shutdown; daemon.backup{path}, prompted; daemon.compact, whose busy-refusal becomes a distinct outcome). Every action runs off the EDT under ProgressManager. No ProvisionKind or parent-page change.

### a2: All-script lifecycle: run start/stop/restart/update ALL via daemon-ctl.sh; only backup/compact as IPC

The runner covers all four daemon-ctl.sh subcommands (incl. stop), so the gateway gains only backup + compact (no shutdown).

Same page + readout as a1, but Stop is routed through `daemon-ctl.sh stop` instead of the daemon.shutdown IPC; the runner drives all four start/stop/restart/update, and DaemonGateway gains only backup + compact.

### a3: Extend the existing ScriptDaemonProvisioner / ProvisionKind with START/STOP/RESTART

Add START/STOP/RESTART cases to the existing ProvisionKind enum + ScriptDaemonProvisioner so one provisioner drives every daemon-ctl.sh subcommand.

Reuse ScriptDaemonProvisioner by widening its ProvisionKind enum (today INSTALL|UPDATE) + scriptFor()/command-builder/mapReason(); the page calls the one provisioner for every lifecycle action; backup/compact/shutdown still become gateway IPCs.

## Citations

- **[[c1]]** `analyze-bundle` `s1 reuse.map — ScriptDaemonProvisioner.kt (SubprocessRunner/Subprocess/ProcessBuilderRunner) + DaemonLifecycleService.kt DefaultDaemonScriptLocator + DaemonLifecycleModel.kt ProvisionKind + scripts/daemon-ctl.sh (start/stop/restart/update, exit 2/3/4)` — "The EXISTING process seam is reusable verbatim; the runner runs daemon-ctl.sh with a DIFFERENT subcommand without touching the S003-owned ProvisionKind (a CLOSED INSTALL|UPDATE enum)."
- **[[c7]]** `analyze-bundle` `s1 external-contract — src/daemon/index.ts daemon.shutdown(:1450)/backup(:1456,{path})/compact(:1465, busy-refusal) IPC handlers + the DaemonGateway sealed-*Result/DaemonResult idiom` — "daemon.backup requires a path; daemon.compact refuses when the indexer is busy (framed error -> a distinct outcome); a thrown handler error frames as !ok/error; the gateway methods classify to Failed "
- **[[c8]]** `convention` `s1 convention.detect — ops/InsrcOpsConfigurable.kt (off-EDT buildBody + guarded invokeLater) + settings/InsrcSettingsConfigurable.kt (ProgressManager.runProcessWithProgressSynchronously) + ui/InsrcCollapsible.kt` — "buildBody() runs OFF the EDT; long-running actions run under ProgressManager off the EDT so the IDE never freezes; the base handles the JBScrollPane/ScrollableColumn + disposed-guarded invokeLater."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-21T08:46:17.697Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| backup/compact/shutdown | external-contract | LOW | manual | The daemon exposes daemon.shutdown, daemon.backup (requires a `path` param), and daemon.compact (refuses when the indexer is busy) as socket IPC handlers in src/daemon/index.ts. | grep confirms 'daemon.shutdown'/'daemon.backup'/'daemon.compact' handlers each exist once in src/daemon/index.ts (read :1456 found:true = daemon.backup handler); 'target path required' and 'indexer is busy' strings present — the three IPCs + their required-path / busy-refusal semantics are real. |  |
| runner | citation | LOW | manual | scripts/daemon-ctl.sh accepts the subcommands start\|stop\|restart\|update (with status) and documents exit codes 2/3/4, so the lifecycle-command runner can run start/restart/update against it. | read scripts/daemon-ctl.sh:274 found:true = 'start\|stop\|restart\|update\|status) CMD="$1"'; grep confirms `start) cmd_start` dispatch and the 'daemon dir missing / not a git checkout' exit-code doc — the subcommands + exit codes the runner targets are real. |  |
| runner | citation | LOW | manual | The reusable process seam exists in ScriptDaemonProvisioner.kt: fun interface SubprocessRunner, data class Subprocess, class ProcessBuilderRunner, and fun interface DaemonScriptLocator — the runner reuses these verbatim. | grep confirms all four seams (fun interface SubprocessRunner, data class Subprocess, class ProcessBuilderRunner, fun interface DaemonScriptLocator) exist once each in ScriptDaemonProvisioner.kt — the runner reuses real, existing types. |  |
| runner | citation | LOW | manual | DefaultDaemonScriptLocator resolves ~/.insrc/daemon/scripts/daemon-ctl.sh (via scriptFor for the UPDATE case), so the runner locates daemon-ctl.sh through the existing locator. | read DaemonLifecycleService.kt:198 found:true = 'class DefaultDaemonScriptLocator'; grep confirms daemonHomeScript("daemon-ctl.sh") — the existing locator resolves daemon-ctl.sh, exactly what the runner reuses. |  |
| sbdry5 | closed-union | LOW | manual | ProvisionKind is a closed INSTALL\|UPDATE enum owned by the S003 lifecycle model, which the runner does NOT extend (LifecycleCommand is a separate enum). | grep confirms `enum class ProvisionKind {` exists once in DaemonLifecycleModel.kt (the INSTALL,/UPDATE, extra hits are an unrelated PluginLifecycle enum); the LLD's LifecycleCommand is a distinct S002 enum, so the S003 ProvisionKind is consumed, not extended (sbdry5 upheld). |  |
| sc1 | citation | LOW | manual | The S001 InsrcOpsConfigurable base + the placeholder DaemonConfigurable exist; S002 fills DaemonConfigurable.buildBody() by subclassing the base (which runs buildBody off the EDT). | read DaemonConfigurable.kt:12 found:true = 'class DaemonConfigurable : InsrcOpsConfigurable()'; grep confirms the abstract base + protected abstract buildBody — S002 fills buildBody() by subclassing the real S001 base. |  |
| k2 | citation | LOW | manual | The established off-EDT long-action idiom ProgressManager.runProcessWithProgressSynchronously is used by InsrcSettingsConfigurable.apply(), which S002's action wiring reuses. | grep confirms runProcessWithProgressSynchronously is used in InsrcSettingsConfigurable.kt (:131) — the established off-EDT long-action idiom S002 reuses for the actions is real. |  |
| fanout | inventory | LOW | manual | There are exactly 6 DaemonGateway implementations (DaemonGatewayImpl + DaemonGatewayService + 4 test fakes) that must each gain the backup/compact/shutdown overrides — the same fanout the daemonStatus() addition took. | grep 'override fun daemonStatus(): DaemonStatusResult' returns EXACTLY 6 matches (starting DaemonGateway.kt:925) — confirming the 6-impl fanout the three new backup/compact/shutdown overrides must mirror; no impl is missed. |  |
| sc2 | citation | LOW | manual | DaemonGateway.daemonStatus(): DaemonStatusResult (Loaded/Stopped/Unavailable) already exists (S001) and is consumed unchanged by the health readout; S002 adds no field to it. | grep confirms fun daemonStatus(): DaemonStatusResult (DaemonGateway.kt:570, interface decl) + sealed interface DaemonStatusResult (:383) exist; the sc2 read S002 consumes is real and unchanged (the bare-path read anchor found:false is a probe-format artifact, not a missing symbol). |  |
