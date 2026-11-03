<!-- insrc:artifact LLD-ce99b72065d03b1b-s7 -->

# LLD: E20261027ce99b720:S007

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**HLD base run:** `wf-1792924917927-2y1e5h`
**HLD effective hash:** `c324f041e3e7...`

In JetBrains, the Model tiers settings section keeps editing the three global tiers, but every runner, model and effort it offers now comes from the daemon's model definitions; the plugin keeps no list of its own. A model the daemon does not list can be checked through its CLI from the section; the results are shown per effort level, and the model becomes selectable only after the user approves it and the daemon restarts. The per-repo settings keep only the role-to-tier choices and coreFloor. A save that needs a daemon restart offers one.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [UX](#10-ux)
11. [References](#11-references)
12. [Open questions](#12-open-questions)

## 1. HLD context

> See **HLD-ce99b72065d03b1b** § 2. Framework summary

**Rollout phase:** Phase D — clients render the daemon's definitions
**Consumes:** `sc3` (models.definitions IPC request), `sc4` (Unknown-model check and approval requests), `sc5` (Settings rules and models.resolveRole)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Extending the catalog file, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator in place; refreshing its contents with today's models, the aliases today's tier defaults use (opus, sonnet, haiku), the Ollama models insrc ships with and their context windows, and today's coreModel as the tool-loop default; the registry and its per-thread cache; moving the boot validation ahead of the settings reconcile and the worker threads; reading the approved-model store (a malformed store is logged and treated as empty); keeping the curated catalog's existing accessor answering providers.listModels from the new file shape until s2 replaces it. The validator refuses a missing or malformed file, an unknown, missing or repeated family, a CLI family without its CLI kind, tier defaults or summariser model, a model without an efforts list, a duplicate id or alias, a default that is not a model of its family, an Ollama model without a token input limit, and a tool-loop default that is not listed, naming the entry (ac3). Tests: one fixture per refusal reason (ac3); a model and alias added to a fixture are served after a restart with no code change (ac2); the file is validated before the settings reconcile, before any worker starts and before listen (ac1, k7); repeated requests in one thread return the same definitions even after the file changes on disk (ac1); a replacement worker started after the file, the store or config.json changed on disk uses the new values while a surviving thread keeps its own until the restart, and a thread whose first read comes after such a change likewise uses the new values; after a daemon restart every thread resolves the same definitions, approvals and tiers; providers.listModels still returns today's Claude and Codex models through the kept accessor; alias, effort and limit lookups; resolveTier distinguishes rejected-model from unlisted-model and falls back to the tier's family default, or the default family's for an Ollama tier. — owns `sc1`, `sc2`
- `s2`: The models.definitions handler and its method-class entry, the projection of the registry, each listed Ollama model's installed state from the existing bounded listing, and re-sourcing providers.listModels from the registry (for Ollama, listed models only), then removing the curated catalog accessor s1 kept. Tests: models.definitions returns every field of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); with Ollama not answering, installed is absent and the request still succeeds. — owns `sc3`
- `s3`: Moving every daemon consumer onto the registry: tier resolution, summariser selection, effort forwarding, CliProvider's input budget and CLI kind, OllamaProvider's num_ctx, the tool-loop model (an unlisted coreModel runs the tool-loop default with a warning) and the runner and model literals in routing, provider construction, attribution and workflow code; SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and ollamaNumCtx go; DEFAULT_TIERS and TIER_EFFORTS stop being written in code and remain only as temporary exports drawn from the definitions for the TUI's model-tiers pane, which s5 migrates; no daemon code uses them. The settings catalog's tier and coreModel defaults and effort values are taken from the definitions; how the settings catalog reaches the file is decided in this Story's LLD and must work in every process that loads the settings catalog today (the daemon, the TUI, the updater, and the VS Code bundle until s6 drops its use). Reconcile removes per-repo tier overrides with a warning and prunes ollamaNumCtx; readRepoOverride and its callers go. config.write refuses a tier set to a rejected model and reports restartRequired. models.resolveRole and its method-class entry. Both installer copies take tier defaults and the tool-loop default from the file. Tests: an unset tier resolves to the file's default, and with a fixture whose defaults differ from today's, reconcile fills the fixture's values (ac1); an unsupported effort is dropped with a warning naming model and effort (ac2); a source scan fails on runner or model literals outside the family implementations, on any read of ollamaNumCtx, and on any daemon use of the temporary DEFAULT_TIERS or TIER_EFFORTS exports (ac3); the TUI still builds and its model-tiers pane shows the definitions' defaults; a repo's `tasks` choice applies with the global tier's model (ac4); reconcile removes per-repo tier overrides with a warning naming repo and tier and keeps `tasks` and coreFloor (ac5); an unlisted model falls back with the warning (decision A); a fixture Ollama model's input limit sets num_ctx; config.write refuses a rejected model and reports restartRequired; models.resolveRole matches the daemon's own resolution for a CLI tier and an Ollama tier; the settings catalog loader accepts the catalog and an unset JetBrains tier still shows the default family's values. — owns `sc5`
- `s4`: The per-family check procedures (Codex: the CLI's model list plus a run; Claude: a run, the input limit from the JSON output, recognised effort names), run one call at a time; telling a reachable CLI that refuses the model apart from an unreachable CLI; refusing approval unless the model ran without error; writing the store atomically and acknowledging a decision only once it is written; the method-class entries. Tests: checks against fake CLIs record each verdict and run one at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); after approval and a restart only the approved levels are accepted (ac3); a rejected profile or unreachable CLI refuses the model with a reason, and approving a check whose model did not run is refused (ac4); after a restart an approved model appears in models.definitions as user-approved and a rejected one among the rejected ids (ac5); a failed store write returns write-failed and keeps the previous store. — owns `sc4`
- `s5`: The TUI model-tiers pane and its effort choices from models.definitions, removing the temporary DEFAULT_TIERS and TIER_EFFORTS exports s3 kept; the unknown-model check and approval screen; the repo settings view limited to `tasks` and coreFloor; showing restartRequired and offering maintenance.restart; the review command using models.resolveRole and building its provider from the answer instead of reading config.json; Setup recommending the definitions' tool-loop default instead of DEFAULT_LOCAL_MODEL, and saying it cannot recommend when the daemon is not running. Tests: the pane offers exactly the options of a fake models.definitions answer and no source file still exports or imports DEFAULT_TIERS or TIER_EFFORTS (ac1); saving an unknown model starts the check and shows its results (ac2); the repo view edits only `tasks` and coreFloor (ac3); the review command runs the model a fake models.resolveRole returns for a CLI and an Ollama tier; Setup recommends the fake answer's tool-loop default.
- `s6`: The VS Code model-tier picker driven by models.definitions instead of its runner list and the bundled settings catalog's effort rows, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel without per-tier fields; showing restartRequired and offering insrc.daemon.restart. Tests: the picker offers exactly a fake answer's options and the bundle keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3).

## 2. Contract details

**Surface level:** internal

### 2.1 `DaemonGateway.modelDefinitions`

```typescript
fun modelDefinitions(): ModelDefinitionsResult
```

**Returns:** `ModelDefinitionsResult` — Loaded(ModelDefinitionsDto) parsed from models.definitions (families with id, cliKind?, displayName, tierDefaults, toolLoopModel?, models with id, aliases, displayName?, efforts, source, installed?; defaultFamily), or Failed(DaemonFailure). A malformed family or model entry is skipped; an answer with no families is Failed(other).

**Errors:**
- `DaemonFailure.NotRunning` when DaemonUnavailableException — which UnixSocketDaemonRpc.call throws for ANY socket I/O failure, at connect or mid-call; the text therefore says 'the daemon is not running or the connection was lost'. A clean early end of the reply (empty/unparseable) is Other
- `DaemonFailure.OlderDaemon` when the reply's error starts with 'unknown method: '; the text says to update the daemon
- `DaemonFailure.Other` when any other framed error, malformed reply or transport fault, shown as it is

**Postconditions:**
- Never throws
- Read-only
- Declared on the DaemonGateway interface and implemented in DaemonGateway.kt; DaemonGatewayService (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt) forwards modelDefinitions, checkModel and decideModel to its delegate like its other methods, and the test fakes that implement DaemonGateway (lifecycle/DaemonLifecycleServiceTest.kt, onboarding/OnboardingLifecycleTest.kt, onboarding/OnboardingCleanupIntegrationTest.kt, onboarding/OnboardingWiringTest.kt) gain 'not used in this test' stubs

### 2.2 `DaemonGateway.checkModel`

```typescript
fun checkModel(family: String, modelId: String, claimedEfforts: List<String>): ModelCheckOutcome
```

**Parameters:**
- `family: String` — a CLI family id taken from the definitions
- `modelId: String` — the unlisted model the user typed
- `claimedEfforts: List<String>` — the effort levels to try (the union of the family's served efforts, as s6)

**Returns:** `ModelCheckOutcome` — Checked(checkId, runs, inputLimit?, efforts[effort, verdict, evidence], error?) — INCLUDING a check that did not run, whose result carries error alongside checkId and efforts — or Failed(DaemonFailure); an invalid-params reply ({error, recoverable:false} with no checkId) is Failed(Other) with the daemon's text

**Errors:**
- `DaemonFailure` when as modelDefinitions

**Preconditions:**
- called off the EDT (the check runs the CLI and can take minutes)
- The reply is read through DaemonRpc.call(method, params, resultErrorIsFailure = false), so a ModelCheckResult's own `error` field is not mistaken for the structured-failure convention; the gateway itself tells a check result (has checkId) from an invalid-params reply (no checkId)

**Postconditions:**
- Writes nothing

### 2.3 `DaemonGateway.decideModel`

```typescript
fun decideModel(checkId: String, approve: Boolean, efforts: List<String>): ModelDecisionResult
```

**Parameters:**
- `checkId: String` — the check being decided
- `approve: Boolean` — models.approve when true, models.reject when false
- `efforts: List<String>` — the efforts the user allows (approve only); never a rejected one

**Returns:** `ModelDecisionResult` — Recorded (restart required) | Refused(reason, detail) carrying the daemon's reason ('unknown-check' | 'model-did-not-run' | 'invalid-efforts' | 'write-failed') | Failed(DaemonFailure)

**Errors:**
- `DaemonFailure` when as modelDefinitions

**Preconditions:**
- a check returned by checkModel

**Postconditions:**
- Never throws; an 'unknown-check' tells the user to check again

### 2.4 `DaemonRpc.call (result-error flag)`

```typescript
fun call(method: String, params: Map<String, Any?>, resultErrorIsFailure: Boolean): DaemonResult = call(method, params)
```

**Parameters:**
- `resultErrorIsFailure: Boolean` — false keeps a non-empty result.error in DaemonResult.data instead of turning the reply into ok=false

**Returns:** `DaemonResult` — With true (and through the existing two-argument call) exactly today's parse; with false, a top-level error still fails, but an object result is returned whole in data even when it has an error field

**Errors:**
- `DaemonUnavailableException` when socket unreachable, as today

**Postconditions:**
- A default method on the interface, so existing DaemonRpc fakes are untouched; UnixSocketDaemonRpc overrides it with parse(reply, resultErrorIsFailure)
- Every existing caller keeps the structured-error behaviour (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt parse)

### 2.5 `SaveResult (extended)`

```typescript
sealed interface SaveResult { data class Saved(val restartRequired: Boolean = false); data class Rejected(val reason: String, val detail: String? = null); data class Unavailable(val reason: String) }
```

**Returns:** `SaveResult` — config.write's own answer carried through: restartRequired on success, reason ('invalid-path' | 'rejected-model' | 'per-repo-tier' or framed error) and detail on refusal

**Postconditions:**
- Every existing caller (ModelTiersSection, PerRoleSection, PerRepoSection, InsrcSettingsConfigurable) matches `is SaveResult.Saved` and shows detail when present

### 2.6 `ModelTiersModel (reshaped)`

```typescript
class ModelTiersModel(catalog: SettingsCatalogDto, definitions: ModelDefinitionsDto)
```

**Parameters:**
- `catalog: SettingsCatalogDto` — the configured tier leaves (currentValue / isSet of models.tiers.<tier>.runner|model|effort)
- `definitions: ModelDefinitionsDto` — the only source of runner, model and effort choices and of defaults

**Returns:** `ModelTiersModel` — runnerOptions = the definitions' families; modelOptions(tier) = the runner family's models (alias and 'not installed' shown in the label; a configured model the definitions do not list shown as current-not-listed and not selectable again); effortOptions(tier) = '' plus the selected model's efforts; current tier = what the daemon resolves (tierSetting, src/config/analyze.ts:216, with parseTiering's leaf rules, src/config/analyze.ts:395-407): a configured effort leaf ('' included) always wins; a tier with a configured runner AND a non-empty model is that runner/model with the configured effort or none ('' = CLI default) — never the default's effort; any other tier (unset, model '' or a runner or model alone, which the daemon ignores) is the DEFAULT family's tier default with the configured effort, else the default's effort — a lone runner leaf is shown as ignored, and the tier stays clean until edited; selectRunner takes the new family's default for the tier, from sc3 fields only: tierDefaults[tier] with its effort when the model accepts it (CLI families); else toolLoopModel with no effort (the local family, which has no tierDefaults); else the family's first model with no effort; a family with no models cannot be selected; selectModel keeps the effort only if the new model accepts it, else clears it; collectWrites() = one whole-tier write {runner, model, effort} at ['models','tiers',tier] per dirty tier

**Preconditions:**
- definitions Loaded; when Failed the section shows the classified message and no editable rows

**Postconditions:**
- No PROVIDERS constant and no catalog enum read
- No listModels call
- Parity cases mirror the daemon's resolution: unset tier; runner+model with no effort (no effort); runner+model+effort; effort '' explicit; effort leaf alone on an unset tier; runner alone (ignored); model '' (unset); an alias model shown as its canonical id
- Apply guard: collectWrites() refuses (Apply reports it and keeps the pending edit) any dirty tier whose model is not served by the loaded definitions — including an effort-only edit of a tier whose configured model is no longer listed; the user must pick a listed model first. So no unlisted model is ever written, approved or not
- Regression fixture: a local family with toolLoopModel and no tierDefaults; switching a tier to it takes toolLoopModel with effort ''
- Accepted-effort filtering at initialization too, as the registry does after tierSetting (src/daemon/model-registry.ts resolveTier → droppedEffort): a stored effort the resolved model does not accept is shown as '' (CLI default) with a note "stored effort '<e>' is not accepted by <model> — the daemon drops it"; the tier is NOT dirty for that, and the stored leaf is rewritten only when the user edits the tier (the whole-tier write then carries the shown effort)

### 2.7 `ModelTiersSection check flow`

```typescript
Check model… button → ModelCheckDialog(family, modelId) → Approve/Reject → restart offer
```

**Returns:** `Unit` — Asks for a CLI family (from the definitions; Ollama is not offered) and a model id, runs checkModel off the EDT under a progress indicator, shows runs / input limit / per-effort verdict and evidence; Approve (with the non-rejected efforts the user ticks) or Reject records the decision; after an approval it offers 'Restart daemon': on a restart whose status read comes back running, the definitions are re-read, the section refreshes and the model is offered in that family; the tier is saved only by the normal Apply

**Errors:**
- `check error / did not run` when shown with Approve disabled
- `Refused / Failed` when the daemon's reason and detail, or the classified failure, shown in the dialog

**Postconditions:**
- An unlisted model is never written to a tier (ac2)

### 2.8 `restartRequired offer`

```typescript
SettingsSection.takeRestartRequired(): Boolean = false; InsrcSettingsConfigurable.apply() offers one 'Restart daemon' prompt
```

**Returns:** `Unit` — Each section that writes (ModelTiersSection, PerRoleSection, PerRepoSection) sets a flag when any of its writes returns Saved(restartRequired = true); takeRestartRequired() returns and clears it. InsrcSettingsConfigurable.apply() collects the generic table's Saved(restartRequired) results and every section's flag inside its background save loop, and AFTER the loop, on the EDT, offers ONE prompt when any successful write needed a restart — also when other writes failed (the prompt comes first, then the ConfigurationException listing the failures). Yes restarts through DaemonLifecycleCommandRunner.run(RESTART) under a progress indicator and confirms with daemonStatus(); the result is reported.

**Preconditions:**
- Prompting and the restart run outside the background save loop

**Postconditions:**
- One offer per Apply, not per tier

### 2.9 `PerRepoOverridesModel / PerRepoSection (narrowed)`

```typescript
per repo: coreFloor + tasks only
```

**Returns:** `Unit` — The per-tier runner/model fields, Tier/TierField/setTierField and tiers.<tier> writes are removed; the gateway's per-repo parse ignores any tiers leaf

**Postconditions:**
- Per-repo settings show only role tiers and coreFloor (ac3)

## 3. Data model changes

### 3.1 `ModelDefinitionsDto / DefinedFamilyDto / DefinedModelDto` — new

Kotlin mirror of the sc3 answer, parsed structurally in daemon/DaemonGateway.kt; no family, model or effort literal in the plugin.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt`

### 3.2 `DaemonFailure` — new

NotRunning | OlderDaemon(text) | Other(text). The JetBrains transport (UnixSocketDaemonRpc.call) wraps every socket IOException — connect, write or read — as DaemonUnavailableException, so a broken connection is NotRunning, worded 'the daemon is not running or the connection was lost'; an empty or malformed reply is Other. The transport is reused unchanged.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### 3.3 `ModelCheckOutcome / ModelDecisionResult` — new

Kotlin mirrors of sc4's ModelCheckResult and DecisionResult.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt`

### 3.4 `SaveResult` — field-add

Saved gains restartRequired; Rejected gains detail. configWrite reads data.reason, data.detail and data.restartRequired.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:253`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1005`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt:82`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRoleSection.kt:78`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt:82`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:144`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:55`

### 3.5 `ModelTiersModel` — field-modify

Takes definitions instead of listsByProvider; PROVIDERS and leaf writes removed.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt:195`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:97`

### 3.6 `PerRepoOverridesModel` — field-remove

Per-tier runner/model state and writes removed. Existing tests that assert the removed fields change with it: InsrcSettingsConfigurableTest.kt:126-127 (asserts JTextField per-tier fields and setTierField) is replaced by checks that the repo editor keeps coreFloor and role tiers and has no tier runner/model field; PerRepoOverridesModelTest.kt and PerRepoOverridesGatewayTest.kt drop their tiers cases.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:487`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt:162`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt:126`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoOverridesModelTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/PerRepoOverridesGatewayTest.kt`

### 3.7 `SettingsSection` — field-add

takeRestartRequired(): Boolean with a false default; implemented by the three writing sections and read by InsrcSettingsConfigurable.apply().

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:55`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:121`

### 3.8 `DaemonRpc` — field-add

A default call(method, params, resultErrorIsFailure) overload; UnixSocketDaemonRpc.parse takes the flag.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:783`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`

### 3.9 `DaemonGatewayService` — field-add

Forwards modelDefinitions, checkModel and decideModel to its delegate.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt:16`

## 4. Diagrams

- [Sequence diagram](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | models.definitions is the only source of the section's choices and defaults; read when the settings page opens and on Refresh. |
| `sc4` | consumes | models.check / models.approve / models.reject drive the check dialog; the decision's restart requirement is offered as a restart. |
| `sc5` | consumes | Whole-tier config.write; per-repo tiers are no longer offered; config.write's reason, detail and restartRequired are shown. |

## 6. Error paths

**Error cases**

- **The daemon is not running when the settings page opens or Refresh is pressed** (recoverable)
  - Detection: modelDefinitions() catches DaemonUnavailableException → Failed(NotRunning)
  - Response: The Model tiers section shows 'the daemon is not running — start it to edit the model tiers' and offers no editable rows; Refresh retries
  - User impact: Tiers cannot be edited until the daemon runs; nothing is written
- **An older daemon without models.definitions / models.check** (recoverable)
  - Detection: the reply's error starts with 'unknown method: '
  - Response: Failed(OlderDaemon) whose text says to update the daemon (Settings › insrc › Daemon › Update)
  - User impact: Told exactly what to do; nothing written
- **A malformed definitions answer or another daemon error** (recoverable)
  - Detection: framed error / RuntimeException while parsing, or an answer with no families
  - Response: Failed(Other) shown as the daemon's text; only an unknown method says to update
  - User impact: Sees the real error
- **config.write refuses a tier (e.g. rejected-model) or a per-repo write** (recoverable)
  - Detection: data.ok == false; reason and detail read from the reply
  - Response: Apply throws ConfigurationException naming the tier with reason and detail; the tier keeps its pending edit
  - User impact: The edit is not lost and the reason is visible
- **The check cannot run the model (CLI missing, model refused, unreadable output)** (recoverable)
  - Detection: ModelCheckResult.runs == false or error set, read through the result-error-preserving call so checkId and efforts survive
  - Response: The dialog shows the error and per-effort evidence with Approve disabled; Reject stays available
  - User impact: Cannot approve a model that did not run
- **The check expired or the daemon restarted before the decision** (recoverable)
  - Detection: decideModel returns Refused(reason='unknown-check')
  - Response: The dialog says the check is no longer pending and offers Check again
  - User impact: Re-runs the check; no stale approval
- **The decision could not be recorded (write-failed / invalid-efforts)** (recoverable)
  - Detection: Refused(reason, detail)
  - Response: Shown in the dialog with the daemon's detail; nothing is selected
  - User impact: Knows the approval did not land
- **The restart after approval or after a restartRequired save fails, or the daemon is not running afterwards** (recoverable)
  - Detection: DaemonLifecycleCommandRunner.run(RESTART) returns Failed, or daemonStatus() is not Loaded
  - Response: Reports the failure; the definitions are not re-read as if the restart succeeded; the approved model stays unselectable until a restart
  - User impact: Can restart from the Daemon page and Refresh
- **Some writes in one Apply fail and others succeed with restartRequired** (recoverable)
  - Detection: the background loop collects both the failures and the Saved(restartRequired) results / section flags
  - Response: The single restart prompt is offered for the successful writes, then Apply throws the ConfigurationException listing the failures
  - User impact: A saved change that needs a restart is not lost behind an error
- **An effort-only edit of a tier whose configured model the definitions no longer list** (recoverable)
  - Detection: collectWrites() finds the dirty tier's model absent from the loaded definitions' family
  - Response: Apply refuses that tier with 'choose a listed model for <tier> first' and keeps the pending edit; other tiers save
  - User impact: A stale unlisted model is never re-written
- **The connection breaks mid-request** (recoverable)
  - Detection: UnixSocketDaemonRpc.call throws DaemonUnavailableException for the IOException
  - Response: NotRunning, worded 'the daemon is not running or the connection was lost'
  - User impact: Told to check the daemon and retry

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A configured tier model the definitions no longer list | Shown as the current model marked 'not listed' (the daemon falls back with a warning); not offered again once changed away; the tier cannot be saved until a listed model is chosen |
| A runner switch to another family | Model and effort take the new family's default for the tier (tierDefaults, else toolLoopModel with no effort for the local family, else the first model); one whole-tier write on Apply |
| A model change where the new model does not accept the current effort | The effort clears to the CLI default ('') rather than writing an effort the model refuses |
| A tier with nothing configured | Shows the default family's tier default and is not dirty; Apply writes nothing for it |
| An Ollama model listed but not installed | Offered with a 'not installed' label; selectable (fails at the call, as the daemon does today) |
| The user types a model id that is already a listed model or alias | The daemon's invalid-params text is shown ('already a model or alias'); no check runs |
| Choosing Ollama in the check dialog | Not offered: only CLI families can be checked (sc4) |
| Several tiers saved in one Apply, two of them restartRequired | One restart offer |
| A stored effort the configured (or default) model does not accept — e.g. after the definitions remove it | Shown as '' with the 'the daemon drops it' note, matching the daemon's resolution; the tier stays clean until edited |

**Invariants to preserve**

- Apply runs off the EDT and advances a tier's baseline only when its write Saved; a failed tier keeps its pending edit and Apply throws a ConfigurationException naming it (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt:70). [[c10]]
- Gateway calls never throw: every daemon fault becomes a result value (Unavailable / Failed), as configWrite and listModels do today (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1005). [[c10]]
- Per-role and per-repo coreFloor/tasks writes keep their literal-segment config.write paths (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRoleSection.kt:78, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt:82). [[c10]]
- The plugin reaches the model facts only over daemon IPC and keeps no runner, model or effort list (k2). [[c4]]

## 7. Test strategy

**Test framework:** `JUnit 5 (Kotlin) via Gradle: ./gradlew test in jetbrains-plugin`

**Test levels**

- **unit** — Headless model and gateway behaviour over fakes
  - Subjects: `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: choices exactly from a fake definitions answer (names matching nothing shipped); runner switch takes family default; effort cleared when not accepted; current tier overlay and default effort; one whole-tier write per dirty tier; not-listed current model`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: modelDefinitions/checkModel/decideModel parse and failure classification over a fake DaemonRpc (not running, 'unknown method: ', other, malformed)`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/SettingsWriteGatewayTest.kt: Saved(restartRequired) and Rejected(reason, detail) from config.write`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoOverridesModelTest.kt: only coreFloor and tasks state and writes; tiers leaf ignored`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: the headless check controller — approve disabled when the model did not run; approve sends only ticked non-rejected efforts; unknown-check offers check again; no tier write from the flow`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpcParseTest.kt: parse(reply, resultErrorIsFailure = false) of a models.check reply with runs=false, error, checkId and efforts keeps all of them; the default parse is unchanged`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt parity cases: the daemon's tierSetting rules (runner+model without effort shows no effort; unset tier the default's effort; effort leaf alone; runner alone ignored; model '' unset; '' explicit)`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableRestartTest.kt (headless over a fake gateway and sections): one prompt when any section or generic write returned restartRequired, also with a failure; none otherwise`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: a failed check (runs=false, error) still offers Reject with its checkId`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: switch to a local family with no tierDefaults takes toolLoopModel and ''; an effort-only edit of a not-listed model is refused by collectWrites`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: a DaemonUnavailableException maps to NotRunning with the 'connection was lost' wording; an empty reply to Other`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt parity: a stored unsupported effort on a CLI model and on a local model shows '' with the note and is not dirty (as src/config/__tests__/tier-resolution.test.ts asserts for the daemon)`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt: the per-repo editor source keeps coreFloor and role-tier controls and contains no setTierField / per-tier runner-model field (replacing the assertions at :126-127)`
  - Fixtures: `jetbrains-plugin/src/test/resources/fixtures/model-definitions.json (fake families/models/efforts)`
- **contract** — Source scans that the plugin keeps no runner/model list and no per-repo tier field
  - Subjects: `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersWiringSourceScanTest.kt: no PROVIDERS, no listModels use, no 'cli-claude'/'cli-codex'/'ollama' or model literal in settings/ main sources; PerRepoSection has no tier runner/model field`
- **smoke** — The real settings page in a sandbox IDE against a live daemon
  - Subjects: `runIde: the Model tiers section shows the daemon's families/models; Check model… on an unlisted model shows verdicts; approve + restart then the model is selectable; Apply on a restartRequired save offers one restart; per-repo shows only coreFloor and role tiers`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersWiringSourceScanTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt` |
| `ac2` | `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpcParseTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt (Apply guard: no unlisted model written)` |
| `ac3` | `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoOverridesModelTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersWiringSourceScanTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt` |

## 8. Migration

**State before:** Per the s1 bundles: ModelTiersModel (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt) offers its own PROVIDERS runner list, catalog effort enums and providers.listModels lists, and writes tier fields one leaf at a time; SaveResult drops config.write's reason detail and restartRequired (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:253); PerRepoOverridesModel and PerRepoSection still edit per-repo tier runner/model (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:487, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt:162), which the daemon now refuses; there is no unknown-model check in JetBrains.

**State after:** The section's choices and defaults come only from models.definitions; each dirty tier is written whole; an unlisted CLI model is checked, approved or rejected from the section and becomes selectable after a restart; config.write's reason, detail and restartRequired are shown, with one restart offer per Apply; per-repo settings edit only coreFloor and role tiers.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Extend SaveResult (Saved.restartRequired, Rejected.detail) and update the four callers to match and show the detail — ↩ rollbackable
2. Add the DaemonRpc result-error flag (default keeps today's parse) and UnixSocketDaemonRpc's override — ↩ rollbackable
3. Add the definitions DTOs, DaemonFailure, and the modelDefinitions / checkModel / decideModel gateway calls — ↩ rollbackable
4. Forward the new gateway calls in DaemonGatewayService and stub them in the four test fakes — ↩ rollbackable
5. Reshape ModelTiersModel onto the definitions with whole-tier writes; wire ModelTiersSection and InsrcSettingsConfigurable to read definitions instead of listModels; remove PROVIDERS — ↩ rollbackable
6. Add the Check model… dialog and the restart offers (after approval, after a restartRequired Apply) — ↩ rollbackable
7. Remove per-repo tier state, fields and writes from PerRepoOverridesModel / PerRepoSection and the gateway's per-repo parse; update InsrcSettingsConfigurableTest.kt, PerRepoOverridesModelTest.kt and PerRepoOverridesGatewayTest.kt accordingly — ↩ rollbackable
8. Add SettingsSection.takeRestartRequired and the single restart prompt in InsrcSettingsConfigurable.apply() — ↩ rollbackable

**Backward compat:** Plugin-internal API only. A daemon older than s2/s4 answers 'unknown method: ' and the section says to update the daemon instead of falling back to a built-in list. Existing per-repo tier entries were already removed by the daemon's reconcile (s3); leaf-written global tiers read the same as whole-tier ones.

## 9. Alternatives considered

### 9.1 a1: Definitions-driven ModelTiersModel, whole-tier writes, check flow in the section — **CHOSEN**

Keep ModelTiersModel/ModelTiersSection as the JetBrains tier editor; feed them models.definitions; write each changed tier whole; unknown models go through models.check → approve/reject; per-repo tiers dropped.

DaemonGateway gains modelDefinitions(), modelsCheck(family, model), modelsApprove(checkId), modelsReject(checkId) over DaemonRpc, and its config.write result carries the daemon's reason, detail and restartRequired (SaveResult.Saved(restartRequired) / Rejected(reason, detail)). ModelTiersModel is built from a ModelDefinitions DTO instead of PROVIDERS + catalog enums + listModels: runner choices = families, model choices = that family's models (aliases shown, Ollama installed state), effort choices = the chosen model's efforts; the current tier = config overlaid on the family's tier default (same precedence as the daemon); a runner switch takes the family default; collectWrites emits one whole-tier write {runner, model, effort} at ['models','tiers',tier]. ModelTiersSection adds a 'Check model…' entry: models.check, a dialog with the per-effort verdicts and evidence, Approve (then save) / Reject; restartRequired offers a restart via DaemonLifecycleCommandRunner.run(RESTART). PerRepoOverridesModel/PerRepoSection keep only coreFloor and role tiers. Failures are classified (not running / disconnected / older daemon / other).

### 9.2 a2: Leaf writes kept, definitions only for choices

Swap the option sources to models.definitions but keep field-by-field runner/model/effort writes.

Same gateway reads and check flow as a1, but collectWrites keeps writing ['models','tiers',tier,field] leaves; the daemon validates each leaf separately.

**Rejected because:** Leaf writes can pass through an invalid intermediate tier and diverge from the other clients.

### 9.3 a3: Shared definitions service with cache and a separate check dialog class

a1 plus an application-level ModelDefinitionsService caching the answer and a standalone ModelCheckDialog reused by other pages.

Introduce a project-independent service holding the last definitions answer, refreshed on demand, and a DialogWrapper subclass for check/approve; the settings section and any future surface consume both.

**Rejected because:** Meets the criteria but adds a cache and service nobody asked for, with a stale-answer risk.

## 10. UX

- [UX mock](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/ux-mock.html)

## 11. References

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate (the JetBrains model-tiers settings section)`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate (the JetBrains daemon gateway write path and results)`
- **[[c4]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "k2: The daemon owns the definitions; the CLI, MCP server and IDE plugins reach them only over daemon IPC."
- **[[c5]]** `analyze-bundle` `s1 symbol.locate (Per-repo settings)`
- **[[c6]]** `analyze-bundle` `s1 usage.example (Restart and the daemon requests the Story consumes)`
- **[[c7]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:34` — "val PROVIDERS: List<String> = listOf("ollama", "cli-claude", "cli-codex")"
- **[[c8]]** `step-output` `s3 alternatives.judge`
- **[[c9]]** `step-output` `s8 checklist.verify`
- **[[c10]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1005` — "private fun configWrite(params: Map<String, Any?>): SaveResult ="
- **[[c11]]** `code` `src/daemon/model-check.ts:53`
- **[[c12]]** `prior-artifact` `LLD-ce99b72065d03b1b-s6`

## 12. Open questions

- Checklist dm1 (partial): most call sites come from s1 bundles; settings/PerRoleSection.kt:78 and settings/InsrcSettingsConfigurable.kt:144 (other SaveResult matchers) were found by a direct grep, not a bundle

## Resolved questions

- `qa68b3c28` — Checklist dm1 (partial): most call sites come from s1 bundles; settings/PerRoleSection.kt:78 and settings/InsrcSettingsConfigurable.kt:144 (other SaveResult matchers) were found by a direct grep, not a bundle
  - **resolved**: Accept mixed evidence — The two SaveResult matchers are text occurrences (where does `SaveResult.Saved ->` appear), which grep answers exactly per the repo's search-vs-analysis rule; both exist (settings/PerRoleSection.kt:78, settings/InsrcSettingsConfigurable.kt:144) and the build's compile catches any missed matcher. _(2026-10-27T05:27:24.062Z)_

## Citations

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate (the JetBrains model-tiers settings section)`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate (the JetBrains daemon gateway write path and results)`
- **[[c4]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "k2: The daemon owns the definitions; the CLI, MCP server and IDE plugins reach them only over daemon IPC."
- **[[c5]]** `analyze-bundle` `s1 symbol.locate (Per-repo settings)`
- **[[c6]]** `analyze-bundle` `s1 usage.example (Restart and the daemon requests the Story consumes)`
- **[[c7]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:34` — "val PROVIDERS: List<String> = listOf("ollama", "cli-claude", "cli-codex")"
- **[[c8]]** `step-output` `s3 alternatives.judge`
- **[[c9]]** `step-output` `s8 checklist.verify`
- **[[c10]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1005` — "private fun configWrite(params: Map<String, Any?>): SaveResult ="
- **[[c11]]** `code` `src/daemon/model-check.ts:53`
- **[[c12]]** `prior-artifact` `LLD-ce99b72065d03b1b-s6`
