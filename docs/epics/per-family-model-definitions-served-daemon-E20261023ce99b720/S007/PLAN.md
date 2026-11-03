<!-- insrc:artifact PLAN-ce99b72065d03b1b-s7 -->

# Plan: E20261027ce99b720:S007

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**LLD run:** `wf-1793076391056-43ghuj`
**LLD effective hash:** `c324f041e3e7...`

The work is in the JetBrains plugin only. First the daemon gateway learns to carry config.write's full answer and to call models.definitions, models.check and models.approve/reject. Then the Model tiers model and section are rebuilt on those definitions with daemon-identical tier resolution and whole-tier saves, a Check model… dialog and a single restart offer are added, and the per-repo settings lose their tier fields. A sandbox-IDE walk against the live daemon closes it.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Carry config.write's restartRequired, reason and detail through SaveResult | S | — | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/SettingsWriteGatewayTest.kt: Saved(restartRequired) and Rejected(reason, detail) from config.write | [[c1]] [[c2]] |
| 2 | **`t2`** Let a caller keep result.error in the reply | S | — | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpcParseTest.kt: parse with resultErrorIsFailure=false keeps a not-run check's error, checkId and efforts; default parse unchanged | [[c1]] [[c2]] |
| 3 | **`t3`** Gateway calls for the model definitions, check and decision | M | `t2` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: modelDefinitions/checkModel/decideModel parsing and failure classification over a fake DaemonRpc | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** ModelTiersModel choices and current tier from the definitions | M | `t3` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: choices exactly from a fake definitions answer; current-tier parity with the daemon's resolution; unaccepted stored effort shown as '' and not dirty | [[c1]] [[c2]] |
| 5 | **`t5`** ModelTiersModel edits and whole-tier writes | M | `t4` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: runner switch defaults incl. a local family without tierDefaults; effort cleared on model change; whole-tier writes; not-listed model refused | [[c1]] [[c3]] |
| 6 | **`t6`** Wire the Model tiers section and settings page to the definitions | M | `t1`, `t5` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersWiringSourceScanTest.kt: no PROVIDERS, no listModels use, no family or model literal in settings sources; definitions read on open and Refresh | [[c1]] [[c3]] [[c6]] |
| 7 | **`t7`** Check model dialog with approve, reject and restart | M | `t3`, `t6` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: approve disabled when not run; reject with the check's id; only ticked non-rejected efforts sent; unknown-check offers check again; no tier write; restart confirmed then definitions re-read | [[c1]] [[c3]] [[c6]] |
| 8 | **`t8`** One restart offer after an Apply that needs it | M | `t1`, `t7` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableRestartTest.kt: one prompt when any write needed a restart, also with a failure; none otherwise | [[c1]] [[c3]] |
| 9 | **`t9`** Per-repo settings without tier fields | M | `t1` | unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoOverridesModelTest.kt: only coreFloor and tasks state and writes; unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt: per-repo editor has no tier runner/model field; unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/PerRepoOverridesGatewayTest.kt: a tiers leaf is ignored | [[c1]] [[c2]] [[c5]] |
| 10 | **`t10`** Live check in a sandbox IDE | S | `t6`, `t7`, `t8`, `t9` | smoke: runIde against the live daemon: walk the LLD UX states and record screenshots | [[c4]] [[c6]] |

### 1.1 E20261027ce99b720:S007:T001 — Carry config.write's restartRequired, reason and detail through SaveResult

SaveResult.Saved gains restartRequired, Rejected gains detail; configWrite reads data.reason/detail/restartRequired; the four matchers use `is SaveResult.Saved` and show the detail.

**Acceptance checks:**
- config.write {ok:true, restartRequired:true} gives Saved(restartRequired=true); {ok:false, reason:'rejected-model', detail} gives Rejected with both
- ModelTiersSection, PerRoleSection, PerRepoSection and InsrcSettingsConfigurable compile and show the detail in their failure lines

### 1.2 E20261027ce99b720:S007:T002 — Let a caller keep result.error in the reply

A default DaemonRpc.call(method, params, resultErrorIsFailure) overload; UnixSocketDaemonRpc overrides it and parse takes the flag.

**Acceptance checks:**
- parse(reply, resultErrorIsFailure=false) of a reply whose result has error, checkId, runs=false and efforts returns ok=true with all of them in data
- The two-argument call and default parse behave exactly as before (existing UnixSocketDaemonRpcParseTest cases pass)

### 1.3 E20261027ce99b720:S007:T003 — Gateway calls for the model definitions, check and decision

Kotlin DTOs for models.definitions, ModelCheckOutcome, ModelDecisionResult and DaemonFailure; DaemonGateway.modelDefinitions/checkModel/decideModel with failure classification; DaemonGatewayService forwarding; stubs in the four test fakes.

**Acceptance checks:**
- A fake answer parses into families/models/efforts/aliases/installed/tierDefaults/toolLoopModel/defaultFamily; malformed entries are skipped; no families is Failed(Other)
- DaemonUnavailableException is NotRunning ('not running or the connection was lost'); 'unknown method: ' is OlderDaemon saying to update; other errors are Other with the text
- checkModel reads through the result-error-preserving call: a not-run check keeps checkId, efforts and error; an invalid-params reply (no checkId) is Failed(Other)
- decideModel maps ok / reason+detail / failure; DaemonGatewayService forwards all three

### 1.4 E20261027ce99b720:S007:T004 — ModelTiersModel choices and current tier from the definitions

ModelTiersModel takes the definitions instead of per-provider lists: runner, model (alias / not installed labels) and effort choices come only from them; the current tier is resolved as the daemon does (tierSetting + parseTiering + dropped effort); PROVIDERS removed.

**Acceptance checks:**
- Offers exactly a fake answer's families, models (alias / not installed labels) and efforts; no PROVIDERS constant and no runner/model literal
- Parity: runner+model without effort shows none; unset tier shows the default family's default and its effort; effort leaf alone applies to the default; runner alone is ignored; model '' is unset; an unaccepted stored effort shows '' with the note and is not dirty

### 1.5 E20261027ce99b720:S007:T005 — ModelTiersModel edits and whole-tier writes

Runner switch takes the family default (tierDefaults, else toolLoopModel, else first model); a model change clears an effort the new model does not take; collectWrites emits one whole-tier write per dirty tier and refuses a dirty tier whose model is not listed.

**Acceptance checks:**
- Switching to a local family without tierDefaults takes toolLoopModel and ''
- A model change to one that does not accept the current effort clears it to ''
- One {runner, model, effort} write at ['models','tiers',tier] per dirty tier; an effort-only edit of a not-listed model is refused

### 1.6 E20261027ce99b720:S007:T006 — Wire the Model tiers section and settings page to the definitions

InsrcSettingsConfigurable and ModelTiersSection read modelDefinitions() instead of listModels per provider; a failure shows the classified message with no editable rows; Refresh re-reads; apply() sends the whole-tier writes; the source scan is updated.

**Acceptance checks:**
- No settings source calls listModels or names a provider list
- A Failed definitions answer shows its message and Refresh retries
- Apply writes whole tiers and keeps a failed tier's pending edit with the reason and detail

### 1.7 E20261027ce99b720:S007:T007 — Check model dialog with approve, reject and restart

A Check model… action opens a DialogWrapper over a headless check controller: CLI family and model id, the check off the EDT with progress, runs / input limit / per-effort verdict and evidence, Approve with ticked non-rejected efforts or Reject, then a Restart daemon offer (DaemonLifecycleCommandRunner.run(RESTART) confirmed by daemonStatus) that re-reads the definitions.

**Acceptance checks:**
- Approve is disabled when the model did not run; Reject still works with that check's id
- Approve sends only ticked, non-rejected efforts; unknown-check offers Check again; Refused/Failed show the daemon's reason and detail
- After a confirmed restart the definitions are re-read and the model is offered; the flow never writes a tier

### 1.8 E20261027ce99b720:S007:T008 — One restart offer after an Apply that needs it

SettingsSection.takeRestartRequired() (default false); the writing sections set it from Saved(restartRequired); InsrcSettingsConfigurable.apply() collects it with the generic writes' results and, after the background loop, offers one Restart daemon prompt (also when other writes failed), reusing t6's restart helper.

**Acceptance checks:**
- Exactly one prompt when any section or generic write returned restartRequired, none otherwise
- With a failure and a restartRequired success, the prompt comes first, then the ConfigurationException listing the failure
- Prompt and restart run outside the background save loop

### 1.9 E20261027ce99b720:S007:T009 — Per-repo settings without tier fields

Remove per-tier state, fields and writes from PerRepoOverridesModel and PerRepoSection, and the tiers parse from the gateway's per-repo read; update InsrcSettingsConfigurableTest, PerRepoOverridesModelTest and PerRepoOverridesGatewayTest.

**Acceptance checks:**
- Per-repo settings show and write only coreFloor and role tiers
- No setTierField, TierField or per-tier runner/model field remains in the per-repo code
- A tiers leaf in models.byRepo is ignored

### 1.10 E20261027ce99b720:S007:T010 — Live check in a sandbox IDE

Run the plugin (runIde) against the live daemon and walk the LLD's UX: definitions-driven section, Check model… on an unlisted model, approve + restart, Apply with restartRequired, per-repo section; record screenshots as evidence.

**Acceptance checks:**
- Each walked state matches the LLD UX mock; screenshots recorded under the Story's evidence folder

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: choices exactly from a fake definitions answer (names matching nothing shipped); runner switch takes family default; effort cleared when not accepted; current tier overlay and default effort; one whole-tier write per dirty tier; not-listed current model | `t4`, `t5` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: modelDefinitions/checkModel/decideModel parse and failure classification over a fake DaemonRpc (not running, 'unknown method: ', other, malformed) | `t3` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/SettingsWriteGatewayTest.kt: Saved(restartRequired) and Rejected(reason, detail) from config.write | `t1` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoOverridesModelTest.kt: only coreFloor and tasks state and writes; tiers leaf ignored | `t9` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: the headless check controller — approve disabled when the model did not run; approve sends only ticked non-rejected efforts; unknown-check offers check again; no tier write from the flow | `t7` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpcParseTest.kt: parse(reply, resultErrorIsFailure = false) of a models.check reply with runs=false, error, checkId and efforts keeps all of them; the default parse is unchanged | `t2` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt parity cases: the daemon's tierSetting rules (runner+model without effort shows no effort; unset tier the default's effort; effort leaf alone; runner alone ignored; model '' unset; '' explicit) | `t4` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableRestartTest.kt (headless over a fake gateway and sections): one prompt when any section or generic write returned restartRequired, also with a failure; none otherwise | `t8` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: a failed check (runs=false, error) still offers Reject with its checkId | `t7` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: switch to a local family with no tierDefaults takes toolLoopModel and ''; an effort-only edit of a not-listed model is refused by collectWrites | `t5` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: a DaemonUnavailableException maps to NotRunning with the 'connection was lost' wording; an empty reply to Other | `t3` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt parity: a stored unsupported effort on a CLI model and on a local model shows '' with the note and is not dirty (as src/config/__tests__/tier-resolution.test.ts asserts for the daemon) | `t4` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt: the per-repo editor source keeps coreFloor and role-tier controls and contains no setTierField / per-tier runner-model field (replacing the assertions at :126-127) | `t9` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersWiringSourceScanTest.kt: no PROVIDERS, no listModels use, no 'cli-claude'/'cli-codex'/'ollama' or model literal in settings/ main sources; PerRepoSection has no tier runner/model field | `t6` |
| runIde: the Model tiers section shows the daemon's families/models; Check model… on an unlisted model shows verdicts; approve + restart then the model is selectable; Apply on a restartRequired save offers one restart; per-repo shows only coreFloor and role tiers | `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s7 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s7 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD s7 errorPaths`
- **[[c4]]** `prior-artifact` `LLD s7 testStrategy`
- **[[c5]]** `prior-artifact` `LLD s7 migration`
- **[[c6]]** `prior-artifact` `LLD s7 uxDefinition and sequenceDefinition`
