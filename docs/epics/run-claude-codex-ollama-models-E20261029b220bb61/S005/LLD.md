<!-- insrc:artifact LLD-b220bb6174a2f5ed-s5 -->

# LLD: E20261030b220bb61:S005

## Summary

**Epic:** `run-claude-codex-ollama-models`
**HLD base run:** `wf-1793292978249-2ujf5k`
**HLD effective hash:** `ca5bac7aee60...`

This Story lets a JetBrains user set a tier to the Claude tool on an Ollama model from insrc's Settings. The runner already appears in the Model Tiers runner list because it lists every family the daemon declares; this Story marks each of its models cloud or local in the model list, keeps it out of the Check model dialog, and shows a configured model it does not declare as 'not supported, the tier will not run' instead of saying the daemon runs a default. The family is recognised by the definitions' host mark, never by name.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-b220bb6174a2f5ed** § 2. Framework summary

**Rollout phase:** Phase B — run on Ollama and expose in settings
**Consumes:** `sc1` (Ollama-hosted CLI families in the definitions answer), `sc2` (Tier resolution on an Ollama-hosted family)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The shipped definitions entry for the new family and its models (which cloud and local models are supported), the catalog validator's four-member check and the 'hosting required on host families' rule, the registry's mapping from a CLI client to its direct family only, and the refusal of the unknown-model check and the approved-model store for host families stay inside s1. — owns `sc1`, `sc2`
- `s2`: How the CLI provider points a run at Ollama (the claude environment, applied only to that subprocess), the pre-run checks that Ollama answers and the model is available or signed in for a cloud model, the failure messages that name the cause, and the time limit that keeps a run from waiting forever stay inside s2.
- `s3`: The terminal UI's runner list, model list with cloud/local labels, effort step and the withheld 'enter another id' path for host families, and its display of the resolved tier, stay inside s3.
- `s4`: The VS Code tier picker's family and model steps, the settings write validation that refuses an undeclared model for a host family, the cloud/local labels and the withheld 'enter another id' item stay inside s4.

## 2. Contract details

**Surface level:** internal

### 2.1 `DefinedFamilyDto`

```typescript
data class DefinedFamilyDto(val id: String, val cliKind: String?, val displayName: String, val tierDefaults: Map<String, TierDefaultDto>, val toolLoopModel: String?, val models: List<DefinedModelDto>, /** 'ollama' when the family runs its CLI on a host; null otherwise. */ val host: String? = null)
```

**Returns:** `type` — The plugin's view of one family, now carrying sc1's host mark.

**Postconditions:**
- An older daemon's answer without host parses with host = null.

### 2.2 `DefinedModelDto`

```typescript
data class DefinedModelDto(val id: String, val aliases: List<String>, val displayName: String?, val efforts: List<String>, val source: String, val installed: Boolean?, /** 'cloud' or 'local' on a host family's model; null otherwise. */ val hosting: String? = null)
```

**Returns:** `type` — The plugin's view of one model, now carrying sc1's hosting mark.

**Postconditions:**
- Null for vendor and plain Ollama models.

### 2.3 `parseModelDefinitions`

```typescript
internal fun parseModelDefinitions(data: Map<String, Any?>): ModelDefinitionsDto?
```

**Parameters:**
- `data: Map<String, Any?>` — The models.definitions answer.

**Returns:** `ModelDefinitionsDto?` — As today, and each family's host and each model's hosting read when present (non-blank strings), else null.

**Postconditions:**
- A malformed family or model is still skipped as today.

### 2.4 `resolve`

```typescript
private fun resolve(tier: String): Resolved
```

**Parameters:**
- `tier: String` — core / mid / cheap.

**Returns:** `Resolved` — As today; for a configured model a family with a host does not declare, the note reads '<model> is not supported by <displayName> — the tier will not run' instead of '… the daemon runs its default for the tier instead'.

**Postconditions:**
- Vendor and plain Ollama tiers resolve and note exactly as before.

### 2.5 `label`

```typescript
private fun label(m: DefinedModelDto): String
```

**Parameters:**
- `m: DefinedModelDto` — The model being listed in the combo.

**Returns:** `String` — As today, followed by ' — cloud' or ' — local' when the model has a hosting mark.

**Postconditions:**
- Vendor and plain Ollama labels are unchanged.

### 2.6 `modelOptions`

```typescript
fun modelOptions(tier: String): List<ModelChoice>
```

**Parameters:**
- `tier: String` — core / mid / cheap.

**Returns:** `List<ModelChoice>` — As today; the non-selectable current marker for a host family reads '(current, not supported): <id>' (ModelChoice.CurrentNotInCatalog carries whether its family has a host).

**Postconditions:**
- Only declared models are selectable; unsavable still keeps an undeclared model from being written.

### 2.7 `families`

```typescript
fun families(): List<DefinedFamilyDto>
```

**Returns:** `List<DefinedFamilyDto>` — The families the Check model… dialog offers: those with a cliKind and no host.

**Postconditions:**
- The Ollama-hosted family is never offered for a check (the daemon refuses it, s1).

## 3. Data model changes

### 3.1 `DefinedFamilyDto` — field-add

Adds host: String? (sc1), defaulting to null.

```
+ val host: String? = null
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitions.kt:12-35`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitions.kt:111-141`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:83-117`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt:63`

### 3.2 `DefinedModelDto` — field-add

Adds hosting: String? (sc1), defaulting to null.

```
+ val hosting: String? = null
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitions.kt:12-35`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:141-163`

### 3.3 `ModelChoice.CurrentNotInCatalog` — field-add

Adds hosted: Boolean = false so its label reads '(current, not supported): <id>' for a host family and '(current, not listed): <id>' otherwise.

```
- data class CurrentNotInCatalog(val id: String)
+ data class CurrentNotInCatalog(val id: String, val hosted: Boolean = false)
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:172-190`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:297`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Parses host on a family and hosting on a model from models.definitions; recognises the host family by host, never by id. |
| `sc2` | consumes | Mirrors the daemon's resolution for a host family on the Settings page: a declared model runs as configured (an effort it does not take is shown dropped); an undeclared one is noted as not supported, the tier will not run. |

## 5. Error paths

**Error cases**

- **The tier is configured (hand-edited config, or a model removed later) on the Claude-on-Ollama runner with a model it does not declare, and the Settings page opens.** (recoverable)
  - Detection: resolve() finds the configured family has a host and served(family, model) returns null.
  - Response: The tier row's note reads '<model> is not supported by <displayName> — the tier will not run'; the model combo shows the non-selectable '(current, not supported): <id>' marker above the declared models; unsavable() refuses to save an edit still on that model ('choose a listed model for the <tier> tier first').
  - User impact: The user sees the tier does not run (the daemon's model-not-supported refusal) and picks a listed model; nothing undeclared is written.
- **The user opens Check model… to try an unlisted id for the Claude-on-Ollama runner.** (recoverable)
  - Detection: ModelCheckFlow.families() filters out families whose host is set.
  - Response: The dialog's family list offers only vendor CLI families; the host family is not there.
  - User impact: No check the daemon would refuse is offered; the runner accepts only its listed models.
- **The daemon is down or an older daemon answers the definitions without host or hosting.** (recoverable)
  - Detection: gateway.modelDefinitions() fails (existing ModelDefinitionsResult.Failed path), or parseModelDefinitions finds no host / hosting keys.
  - Response: Daemon down: the existing failure message and hidden rows until Refresh. No host field: host and hosting are null, so the family behaves as today's CLI families (no marks, offered in Check model, the 'runs its default' note).
  - User impact: No new failure mode; labels and the not-supported note appear once the daemon is s1 or later.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Selecting the Claude-on-Ollama runner in a tier's runner combo. | selectRunner takes the family's first declared model (no tierDefaults, no toolLoopModel) with effort '', and the model combo lists only its declared models, each labelled '— cloud' or '— local'. |
| A declared host model with no efforts (e.g. deepseek-v4-pro:cloud). | effortOptions offers only '' (the CLI default). |
| A host model configured by alias. | Served (served() matches aliases); the tier shows the canonical id and its label with the hosting mark. |
| A configured effort the declared host model does not take. | The existing note 'stored effort ... is not accepted by <model> — the daemon drops it' and the effort shown as ''. |
| A tier saved on the Claude-on-Ollama runner, Settings reopened. | resolve() returns the saved runner, canonical model and effort, the model listed and labelled with its hosting, no note. |

**Invariants to preserve**

- Every runner, model and effort the Settings page offers comes from the daemon's models.definitions answer; the plugin keeps no family or model list and names no family id. [[c2]]
- Writes are one whole tier {runner, model, effort} per dirty, savable tier; an unlisted model is never written (unsavable). [[c2]]
- Vendor CLI families stay in Check model… and keep the 'not listed — the daemon runs its default' note; plain Ollama is unchanged. [[c3]]
- The DTOs stay structural mirrors of the daemon's answer: a malformed family or model is skipped, and an answer without the new keys parses unchanged. [[c1]]

## 6. Test strategy

**Test framework:** `JUnit 5 (org.junit.jupiter) under Gradle in jetbrains-plugin/ (jetbrains-plugin/build.gradle.kts), run per test class; Kotlin tests reach the insrc build gate through the node bridge jetbrains-plugin/__tests__/s7-gradle.test.ts`

**Test levels**

- **unit** — Parsing the definitions answer with the new marks.
  - Subjects: `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: an answer with a family host 'ollama' and models hosting 'cloud'/'local' parses them onto DefinedFamilyDto.host and DefinedModelDto.hosting; an answer without them parses with null.`
- **unit** — The headless Model Tiers model and the Check model flow over a fake definitions answer with a host family.
  - Subjects: `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: runnerOptions offers the host family next to today's; selectRunner to it takes its first declared model with effort ''; modelOptions lists only its declared models, labelled '— cloud' / '— local'; effortOptions offers '' plus the model's efforts (only '' for a model with none); collectWrites writes the whole tier.`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: a configured undeclared model on the host family is noted 'not supported by <family> — the tier will not run', shown as '(current, not supported)' and refused by unsavable; a vendor family keeps 'the daemon runs its default' and '(current, not listed)'; a host-less answer behaves as a vendor family.`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: a catalog snapshot holding a tier saved on the host family resolves to that runner, canonical model and effort with no note (reopen); an effort the model does not take is shown dropped.`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: families() excludes the host family and keeps the vendor CLI families; with host absent the family is offered.`
  - Fixtures: `A fake ModelDefinitionsDto adding a family with cliKind 'claude', host 'ollama', no tierDefaults, and models with hosting 'cloud' (with efforts and an alias) and 'local' (no efforts).`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `ModelTiersModelTest.kt: runnerOptions offers the host family next to today's; selectRunner to it takes its first declared model` |
| `ac2` | `ModelTiersModelTest.kt: modelOptions lists only the host family's declared models labelled cloud/local; effortOptions only where the model has efforts`, `ModelCheckFlowTest.kt: families() excludes the host family`, `ModelDefinitionsGatewayTest.kt: host and hosting are parsed` |
| `ac3` | `ModelTiersModelTest.kt: a catalog snapshot holding a tier saved on the host family resolves to that runner, model and effort with no note`, `ModelTiersModelTest.kt: an undeclared host-family model is noted not supported, the tier will not run` |

## 7. Migration

**State before:** The JetBrains Model Tiers settings (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt over daemon/ModelDefinitions.kt) already list every family the definitions declare, including the Claude-on-Ollama one, but the DTOs drop host and hosting, so models carry no cloud/local mark, an undeclared host-family model is noted as 'the daemon runs its default for the tier instead' (wrong: nothing runs), and settings/ModelCheckFlow.kt offers the host family in Check model…, whose check the daemon refuses.

**State after:** The plugin parses host and hosting: the model combo labels a host family's models cloud or local, an undeclared host-family model is noted 'not supported — the tier will not run' with a '(current, not supported)' marker, and Check model… offers only vendor CLI families. Vendor and plain Ollama behaviour is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add nullable host to the family DTO and nullable hosting to the model DTO, and read them in the definitions parser. — ↩ rollbackable
2. Show the hosting in the model combo label and the not-supported note and marker for a host family in the tier model. — ↩ rollbackable
3. Exclude families with a host from the Check model flow's family list. — ↩ rollbackable

**Backward compat:** Plugin-internal change: the new DTO fields default to null, nothing persisted changes, tier writes keep their whole-tier shape, and an older daemon's answer (no host/hosting) renders as today.

## 8. Alternatives considered

### 8.1 a1: Host-aware DTOs, tier model and check-flow filter over the definitions answer — **CHOSEN**

Parse host/hosting into the plugin's DTOs; ModelTiersModel labels a host family's models cloud/local and reports an undeclared host-family model as not supported (the tier will not run); ModelCheckFlow keeps host families out of Check model.

daemon/ModelDefinitions.kt: DefinedFamilyDto gains `host: String?` and DefinedModelDto gains `hosting: String?`, read by parseModelDefinitions (absent on an older daemon, so null). settings/ModelTiersModel.kt: label() appends ' — cloud' / ' — local' from hosting; resolve() notes, for a configured model a host family does not declare, '<model> is not supported by <family> — the tier will not run' instead of 'the daemon runs its default for the tier instead'; the non-selectable current marker reads '(current, not supported): <id>' for a host family (ModelChoice.CurrentNotInCatalog gains the label choice). runnerOptions already lists every family with models (ac1); effortOptions already offers only '' plus the model's own efforts (ac2); unsavable/collectWrites already refuse to write an unlisted model and write whole tiers; resolve/onSaved already report the saved tier on reopen (ac3). settings/ModelCheckFlow.kt: families() returns families with a cliKind and no host, so the Check model… dialog never offers the host family. The family is recognised by host, never by id.

### 8.2 a2: Ask the daemon for each tier's resolution

Add a per-tier resolution request to the daemon and render the Settings page's current tier and notes from it, plus a1's labels and check-flow filter.

A new daemon IPC returning resolveTierWith's TierResolution for core/mid/cheap (including fallback 'model-not-supported'); DaemonGateway gains a call for it; ModelTiersModel takes the resolution instead of computing resolve() itself. The cloud/local labels and the Check model filter still need a1's DTO fields.

**Rejected because:** Same on ac1-ac3 but partial on sc2 and k4 (new IPC outside s5's boundary) and strictly more work, since it still needs a1's changes.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 bundle: The JetBrains plugin's view of the definitions answer — jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitions.kt:111-141` — "parsed structurally by parseModelDefinitions"
- **[[c2]]** `analyze-bundle` `s1 bundle: The Model Tiers state machine and its Swing shell — jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:83-117` — "unsavable/collectWrites never write an unlisted model and write whole tiers"
- **[[c3]]** `analyze-bundle` `s1 bundle: The Check model flow — jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt:63` — "families() (:63) returns every family with a cliKind"
- **[[c4]]** `analyze-bundle` `s1 bundle: Tests to extend — jetbrains-plugin/__tests__/s7-gradle.test.ts` — "Kotlin tests reach the insrc build gate through the node bridge"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T08:50:24.376Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
