<!-- insrc:artifact PLAN-57298940cdc341bc-s2 -->

# Plan: E2026092157298940:S002

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**LLD run:** `wf-1789979714328-nwulc7`
**LLD effective hash:** `7b17d6a14b2a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add DaemonActionResult + LifecycleCommand types | S | — | unit: DaemonActionResult two-state shape: a when() over Ok/Failed is exhaustive (compile-checked sealed interface); LifecycleCommand has exactly START/RESTART/UPDATE | [[c1]] [[c2]] |
| 2 | **`t2`** Add backup/compact/shutdown to the DaemonGateway interface + DaemonGatewayImpl | S | `t1` | unit: backup(targetDir) sends METHOD_BACKUP with {path:targetDir} and maps ok->Ok; a framed error (incl. 'target path required') -> Failed; unit: compact() sends METHOD_COMPACT and maps ok->Ok; the busy-refusal framed error -> Failed forwarding the busy message verbatim; unit: shutdown() sends METHOD_SHUTDOWN; ok->Ok; DaemonUnavailableException -> a clear terminal result; a malformed reply -> Failed, never a throw | [[c3]] [[c1]] |
| 3 | **`t3`** Fan out the 3 new overrides to the other 5 DaemonGateway impls | S | `t2` | smoke: gradlew test compiles the full suite after the backup/compact/shutdown fanout (no missing-override / NoSuchMethodError across the 6 impls) | [[c3]] |
| 4 | **`t4`** Add the DaemonLifecycleCommandRunner (daemon-ctl.sh start/restart/update) | S | `t1` | unit: run(START/RESTART/UPDATE) invokes `bash <daemon-ctl.sh> <subcommand>` (recorded Subprocess.command) with the resolved Node on PATH; unit: exit 0->Ok; 2/3/4->Failed(reason) with daemon-ctl.sh's mapped semantics; a null script path -> Failed('tooling unavailable'); an IOException -> Failed; never throws | [[c4]] [[c1]] |
| 5 | **`t5`** Fill DaemonConfigurable.buildBody() with the health readout + six actions | M | `t2`, `t4` | unit: Daemon page source-scan: buildBody() renders daemonStatus() Loaded/Stopped/Unavailable (a distinct Stopped card) — no longer the placeholder JLabel; unit: Daemon page source-scan: all six actions wired (Start/Restart/Update via the runner; Stop/Backup/Compact via the gateway) under ProgressManager off the EDT, Backup opens a directory chooser first, and InsrcSettingsConfigurable + the plugin.xml parent element are unchanged | [[c5]] [[c6]] [[c7]] |
| 6 | **`t6`** Tests + version bump | S | `t3`, `t5` | smoke: gradlew test buildPlugin runs the full suite + assembles the plugin green locally (JDK21, cache off) with the version bumped | [[c3]] [[c4]] [[c5]] |

### E2026092157298940:S002:T001 — Add DaemonActionResult + LifecycleCommand types

Add the sealed interface DaemonActionResult { data class Ok(message: String? = null) | data class Failed(reason: String) } and the enum class LifecycleCommand { START, RESTART, UPDATE } (S002-internal, in the daemon/ package next to the other sealed *Result types). Additive new types only; distinct from the sc2 DaemonStatusResult and the S003 ProvisionKind.

**Acceptance checks:**
- DaemonActionResult is a sealed interface with exactly Ok(message: String?) and Failed(reason: String)
- LifecycleCommand is an enum with exactly START, RESTART, UPDATE
- no existing type is modified; ProvisionKind is untouched

### E2026092157298940:S002:T002 — Add backup/compact/shutdown to the DaemonGateway interface + DaemonGatewayImpl

Add fun backup(targetDir: String): DaemonActionResult, fun compact(): DaemonActionResult, fun shutdown(): DaemonActionResult to the DaemonGateway interface and implement them in DaemonGatewayImpl: new companion constants METHOD_BACKUP='daemon.backup'/METHOD_COMPACT='daemon.compact'/METHOD_SHUTDOWN='daemon.shutdown' (reuse PARAM_PATH='path' for backup); each rpc.call classifies ok->Ok, !r.ok||error->Failed(reason) (compact busy-refusal forwarded verbatim), DaemonUnavailableException->a clear terminal result, RuntimeException->Failed; never throws — cloning the repoStats()/daemonStatus() template. Leave probe()/daemonStatus() unchanged.

**Acceptance checks:**
- the interface declares backup(targetDir)/compact()/shutdown(): DaemonActionResult
- DaemonGatewayImpl.backup sends METHOD_BACKUP with {path:targetDir}; compact sends METHOD_COMPACT; shutdown sends METHOD_SHUTDOWN (empty params)
- each classifies ok->Ok, framed-error/unreachable/RuntimeException->Failed and never throws; the compact busy message is forwarded verbatim
- the existing probe()/daemonStatus()/repoStats() reads are unchanged

### E2026092157298940:S002:T003 — Fan out the 3 new overrides to the other 5 DaemonGateway impls

Add backup/compact/shutdown overrides to DaemonGatewayService (delegating to the impl) and trivial Failed('not used') stubs to the 4 test fakes (DaemonLifecycleServiceTest, OnboardingLifecycleTest, OnboardingWiringTest, OnboardingCleanupIntegrationTest), each with the DaemonActionResult import — the exact 6-impl fanout the daemonStatus() addition took.

**Acceptance checks:**
- DaemonGatewayService delegates the three methods to its impl
- all 4 onboarding/lifecycle test fakes declare the three overrides as trivial stubs (no real socket use)
- the full suite compiles (no missing-override / NoSuchMethodError)

### E2026092157298940:S002:T004 — Add the DaemonLifecycleCommandRunner (daemon-ctl.sh start/restart/update)

Add class DaemonLifecycleCommandRunner(runner: SubprocessRunner, scriptLocator: DaemonScriptLocator, nodeResolver: ()->NodeRuntime?, baseEnv) that resolves daemon-ctl.sh via the existing locator and runs `bash <script> <subcommand>` through the reused SubprocessRunner with node on PATH; maps exit 0->Ok, 2/3/4->Failed(reason) (daemon-ctl.sh semantics), null/absent script->Failed('tooling unavailable'), IOException->Failed; never throws. Reuses ProcessBuilderRunner()+DefaultDaemonScriptLocator()+DefaultNodeRuntimeResolver in production; never extends ProvisionKind.

**Acceptance checks:**
- run(START/RESTART/UPDATE) invokes `bash <daemon-ctl.sh path> <subcommand>` via the injected SubprocessRunner with the resolved Node prepended to PATH
- exit 0->Ok; 2/3/4->Failed with mapped reasons; null script path->Failed; IOException->Failed; never throws
- the class reuses the existing SubprocessRunner/DaemonScriptLocator/NodeRuntimeResolver seams and does NOT reference or extend ProvisionKind

### E2026092157298940:S002:T005 — Fill DaemonConfigurable.buildBody() with the health readout + six actions

Replace DaemonConfigurable's placeholder buildBody() with the real body: read daemonStatus() off the EDT and render the Loaded/Stopped/Unavailable health card (distinct Stopped foregrounds Start) via ui/InsrcCollapsible.collapsiblePanel; wire six action buttons — Start/Restart/Update -> DaemonLifecycleCommandRunner, Stop/Backup/Compact -> the gateway — each run under ProgressManager.runProcessWithProgressSynchronously off the EDT with the DaemonActionResult outcome shown and the card re-read; Backup opens a single-folder directory chooser BEFORE calling backup(). InsrcOpsConfigurable base + parent settings page untouched.

**Acceptance checks:**
- buildBody() renders daemonStatus() Loaded (the fields) / a distinct Stopped card (foregrounds Start) / Unavailable (reason) — not the placeholder
- all six actions are wired: Start/Restart/Update via the runner, Stop/Backup/Compact via the gateway, each under ProgressManager off the EDT with the outcome shown
- Backup opens a directory chooser before calling backup(); a cancel makes no call
- InsrcOpsConfigurable + InsrcSettingsConfigurable + the plugin.xml parent element are unchanged (k4)

### E2026092157298940:S002:T006 — Tests + version bump

Add the gateway unit tests (backup/compact/shutdown classification + wire shape via a fake DaemonRpc), the runner unit tests (subcommand + exit-code mapping via a fake SubprocessRunner/locator), and the Daemon page source-scan test (six-action wiring, off-EDT, backup chooser, parent-untouched); bump the plugin version; verify locally with gradlew test buildPlugin (cache off) under JDK21.

**Acceptance checks:**
- a DaemonActionGatewayTest drives backup/compact/shutdown Ok/Failed classification against fake DaemonRpc replies (incl. the compact busy message + backup path param)
- a DaemonLifecycleCommandRunnerTest drives run() exit-code mapping via a fake SubprocessRunner + fake locator with no real process
- a Daemon page source-scan test asserts the six-action wiring + ProgressManager + backup chooser + parent-untouched
- gradlew test buildPlugin green locally (JDK21); the plugin version is bumped

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| backup(targetDir) sends METHOD_BACKUP with {path: targetDir}; ok -> Ok; framed error (incl. 'target path required') -> Failed | `t2` |
| compact() sends METHOD_COMPACT (empty params); ok -> Ok; the busy-refusal framed error -> Failed forwarding the busy message verbatim | `t2` |
| shutdown() sends METHOD_SHUTDOWN; ok -> Ok; DaemonUnavailableException -> a clear terminal result, never a throw | `t2` |
| all three never throw on malformed/errored replies (RuntimeException -> Failed) | `t2` |
| run(START/RESTART/UPDATE) invokes `bash <daemon-ctl.sh> <subcommand>` with the resolved Node on PATH | `t4` |
| exit 0 -> Ok; 2/3/4 -> Failed(reason) with daemon-ctl.sh's semantics | `t4` |
| null/absent script path -> Failed('tooling unavailable'); IOException -> Failed | `t4` |
| LifecycleCommand is its own enum; the runner never touches the S003 ProvisionKind | `t4`, `t1` |
| DaemonConfigurable extends InsrcOpsConfigurable and buildBody() renders daemonStatus() Loaded/Stopped/Unavailable — no longer the placeholder | `t5` |
| the page wires all six actions (Start/Restart/Update via the runner; Stop/Backup/Compact via the gateway) under ProgressManager off the EDT | `t5` |
| the backup action opens a directory chooser before backup() | `t5` |
| all 6 DaemonGateway impls declare the 3 new overrides; the parent InsrcSettingsConfigurable + its plugin.xml element are unchanged | `t3`, `t5` |

## Citations

- **[[c1]]** `analyze-bundle` `s1 reuse.map — ScriptDaemonProvisioner.kt (SubprocessRunner/Subprocess/ProcessBuilderRunner/DaemonScriptLocator) + DaemonLifecycleModel.kt closed ProvisionKind (not extended) + DefaultNodeRuntimeResolver`
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges — the new DaemonActionResult (sealed Ok/Failed) + LifecycleCommand{START,RESTART,UPDATE} S002-internal types`
- **[[c3]]** `analyze-bundle` `s1 external-contract — src/daemon/index.ts daemon.backup{path}/compact(busy-refusal)/shutdown IPC handlers + DaemonGateway.kt repoStats()/daemonStatus() sealed-*Result classification idiom + the 6-impl fanout (grep override fun daemonStatus = 6)`
- **[[c4]]** `analyze-bundle` `s1 reuse.map — scripts/daemon-ctl.sh (start/restart/update, exit 0/2/3/4) + DaemonLifecycleService.production() wiring (ProcessBuilderRunner + DefaultDaemonScriptLocator + DefaultNodeRuntimeResolver) the DaemonLifecycleCommandRunner reuses`
- **[[c5]]** `prior-artifact` `LLD s2 contractDetails — DaemonConfigurable.buildBody() renders the sc2 health readout + wires the six actions`
- **[[c6]]** `analyze-bundle` `s1 convention.detect — ops/InsrcOpsConfigurable.kt + ops/DaemonConfigurable.kt (the S001 base + placeholder S002 fills) + ui/InsrcCollapsible.kt`
- **[[c7]]** `analyze-bundle` `s1 convention.detect — settings/InsrcSettingsConfigurable.kt ProgressManager.runProcessWithProgressSynchronously off-EDT long-action idiom the actions reuse`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-09-21T09:01:22.953Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t3 | inventory | LOW | manual | There are exactly 6 DaemonGateway implementations (DaemonGatewayImpl + DaemonGatewayService + the 4 test fakes DaemonLifecycleServiceTest/OnboardingLifecycleTest/OnboardingWiringTest/OnboardingCleanupIntegrationTest) that must each gain the 3 new backup/compact/shutdown overrides — t2 covers DaemonGatewayImpl, t3 the other 5. | grep 'override fun daemonStatus(): DaemonStatusResult' returns 7 matches: 6 are the real gateway impls (DaemonGateway.kt:925 DaemonGatewayImpl + DaemonGatewayService + the 4 test fakes) and 1 is a doc-table reference; so the source fanout is exactly the 6 impls the 3 new backup/compact/shutdown overrides must reach (t2=DaemonGatewayImpl, t3=the other 5). Count is correct. |  |
| t4 | citation | LOW | manual | DaemonLifecycleService.production() already wires ProcessBuilderRunner() + DefaultDaemonScriptLocator() + DefaultNodeRuntimeResolver — the exact trio the DaemonLifecycleCommandRunner reuses. | read DaemonLifecycleService.kt:134 found:true; grep confirms ProcessBuilderRunner() (:136), DefaultDaemonScriptLocator() (:137), DefaultNodeRuntimeResolver( (:134) all wired in production() — the exact trio the DaemonLifecycleCommandRunner reuses in production. |  |
| t4 | citation | LOW | manual | scripts/daemon-ctl.sh accepts start/restart/update (+stop/status) with exit codes 2/3/4, so the runner maps those exits. | read scripts/daemon-ctl.sh:274 found:true = 'start\|stop\|restart\|update\|status) CMD="$1"' — the subcommands + (documented 2/3/4) exit codes the runner targets are real. |  |
| t2 | external-contract | LOW | manual | The daemon exposes daemon.backup (requires path), daemon.compact (busy-refusal), daemon.shutdown IPC handlers that the three new gateway methods call. | grep confirms 'daemon.backup'/'daemon.compact'/'daemon.shutdown' each appear once as handlers in src/daemon/index.ts (read :1465 found:true = daemon.compact) — the three IPCs the new gateway methods call exist. |  |
| t2 | citation | LOW | manual | The DaemonGatewayImpl repoStats()/daemonStatus() sealed-*Result classification template (rpc.call + !ok/error->Unavailable/Failed, catch DaemonUnavailableException, never throw) exists for the three new methods to clone; PARAM_PATH='path' already exists. | grep confirms override fun repoStats( (the classification template, DaemonGateway.kt:659), const val PARAM_PATH = "path" (:961), const val METHOD_STATUS = "daemon.status" (:947) — the template + reused path constant the three new methods clone are real. |  |
| t5 | citation | LOW | manual | DaemonConfigurable (the S001 placeholder that t5 fills) extends the InsrcOpsConfigurable base, and the ProgressManager.runProcessWithProgressSynchronously off-EDT idiom exists in InsrcSettingsConfigurable. | read DaemonConfigurable.kt:12 found:true = 'class DaemonConfigurable : InsrcOpsConfigurable()'; grep confirms runProcessWithProgressSynchronously in InsrcSettingsConfigurable.kt:131 — the placeholder page t5 fills + the off-EDT long-action idiom it reuses both exist. |  |
