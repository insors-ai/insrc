<!-- insrc:artifact LLD-b220bb6174a2f5ed-s1 -->

# LLD: E20261029b220bb61:S001

## Summary

**Epic:** `run-claude-codex-ollama-models`
**HLD base run:** `wf-1793292978249-2ujf5k`
**HLD effective hash:** `ca5bac7aee60...`

This Story adds a model family to insrc's shipped model definitions: the Claude tool on Ollama. It declares that its tool runs on Ollama, and every model it lists is marked cloud or local. The daemon validates it, serves it in the definitions answer every client reads, and resolves a tier on it only to a declared model; an undeclared model is refused with the reason 'model-not-supported' instead of being replaced. Today's three families, and every place that today means 'a vendor CLI family', keep their behaviour.

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
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-b220bb6174a2f5ed** § 2. Framework summary

**Rollout phase:** Phase A — definitions contract
**Owns:** `sc1` (Ollama-hosted CLI families in the definitions answer), `sc2` (Tier resolution on an Ollama-hosted family)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: How the CLI provider points a run at Ollama (the claude environment, applied only to that subprocess), the pre-run checks that Ollama answers and the model is available or signed in for a cloud model, the failure messages that name the cause, and the time limit that keeps a run from waiting forever stay inside s2.
- `s3`: The terminal UI's runner list, model list with cloud/local labels, effort step and the withheld 'enter another id' path for host families, and its display of the resolved tier, stay inside s3.
- `s4`: The VS Code tier picker's family and model steps, the settings write validation that refuses an undeclared model for a host family, the cloud/local labels and the withheld 'enter another id' item stay inside s4.
- `s5`: The JetBrains Settings page's family and model selectors, the cloud/local labels, the filter that keeps host families out of the model-check flow, and its display of the resolved tier stay inside s5.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `validateModelCatalog`

```typescript
function validateModelCatalog(): ModelDefinitionsFile
```

**Returns:** `ModelDefinitionsFile` — The frozen, validated definitions with four families: cli-claude, cli-codex, ollama, ollama-claude.

**Errors:**
- `ModelCatalogValidationError` when A family id is missing or repeated; a host family lacks cliKind or host, carries tierDefaults or summariserModel, or has a model without hosting; a vendor CLI family lacks cliKind, tierDefaults or summariserModel; hosting appears on a model of a family without host.

**Preconditions:**
- The shipped file lists the host family after the three existing families.

**Postconditions:**
- Vendor-CLI checks key on 'has cliKind and no host', not on 'id is not ollama'.
- The three existing family entries validate exactly as before.

### 2.2 `ModelRegistry.resolveTier`

```typescript
resolveTier(tier: TierName, setting: TierSetting): TierResolution
```

**Parameters:**
- `tier: TierName` — The tier being resolved (core, mid, cheap).
- `setting: TierSetting` — The configured runner (family), model and effort.

**Returns:** `TierResolution` — For a host family with a declared model: that model, with the effort kept only if the model lists it. For a host family with an undeclared model: model undefined and fallback { reason: 'model-not-supported', requested }. For the three existing families: exactly today's result.

**Preconditions:**
- setting.runner is a family id the registry knows.

**Postconditions:**
- A host-family resolution never substitutes another model or family.
- model is undefined only when family is a host family and the fallback reason is 'model-not-supported'.

### 2.3 `ModelRegistry.cliKind`

```typescript
cliKind(family: FamilyId): 'claude' | 'codex' | undefined
```

**Parameters:**
- `family: FamilyId` — The family to describe.

**Returns:** `'claude' | 'codex' | undefined` — The CLI the family runs; 'claude' for the host family too, so 'runs a CLI' callers include it.

**Postconditions:**
- Unchanged for the three existing families.

### 2.4 `ModelRegistry.host`

```typescript
host(family: FamilyId): 'ollama' | undefined
```

**Parameters:**
- `family: FamilyId` — The family to describe.

**Returns:** `'ollama' | undefined` — 'ollama' for the host family (sc1 host field), undefined for the three existing families.

**Postconditions:**
- Callers that mean 'a vendor CLI family' test cliKind(f) !== undefined && host(f) === undefined.

### 2.5 `familyForClient`

```typescript
function familyForClient(client: StepClient | undefined, registry?: ModelRegistry): FamilyId | undefined
```

**Parameters:**
- `client: StepClient | undefined` — The calling client's CLI identity.
- `registry: ModelRegistry` _(optional)_ — The registry to read; the thread's registry by default.

**Returns:** `FamilyId | undefined` — The vendor CLI family for that client; never a host family.

**Postconditions:**
- Returns the same family as today for every client.

### 2.6 `projectDefinitions`

```typescript
function projectDefinitions(registry: ModelRegistry, version: number, installed: readonly string[] | undefined): ModelDefinitionsResult
```

**Parameters:**
- `registry: ModelRegistry` — The families and models to project.
- `version: number` — The definitions file version.
- `installed: readonly string[] | undefined` — Installed Ollama model ids, for the plain Ollama family only.

**Returns:** `ModelDefinitionsResult` — The definitions answer: host on each host family, hosting on each of its models; rejectedModels only on vendor CLI families; installed only on the plain Ollama family.

**Postconditions:**
- The entries for the three existing families are unchanged.

### 2.7 `resolveTierWith`

```typescript
function resolveTierWith(tiering: TieringOverride, tier: TierName, registry: ModelRegistry): TierResolution
```

**Parameters:**
- `tiering: TieringOverride` — The configured tiers and efforts.
- `tier: TierName` — The tier to resolve.
- `registry: ModelRegistry` — The registry to resolve against.

**Returns:** `TierResolution` — The registry's resolution; a 'model-not-supported' refusal is logged as a warning naming the tier, runner and requested model.

**Postconditions:**
- Never reads resolution.model.id when resolution.model is undefined.

## 3. Data model changes

### 3.1 `FamilyId` — field-modify

The closed family-id union and FAMILY_IDS grow from three to four members: 'ollama-claude' joins 'cli-claude', 'cli-codex' and 'ollama'. CliFamilyId keeps meaning the two vendor CLI families; a new HostFamilyId names the host family.

```
- type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama';
+ type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama' | 'ollama-claude';
+ type HostFamilyId = 'ollama-claude';
```

**Call sites:**
- `src/daemon/model-catalog.ts:37`
- `src/daemon/model-catalog.ts:127`

### 3.2 `FamilyDefinition` — field-add

Adds host?: 'ollama'. Present only on the host family, which also carries cliKind and carries neither tierDefaults nor summariserModel.

```
+ readonly host?: 'ollama' | undefined;
```

**Call sites:**
- `src/daemon/model-catalog.ts:67`

### 3.3 `ModelDefinition` — field-add

Adds hosting?: 'cloud' | 'local'. Required on every model of a host family, absent on every other model.

```
+ readonly hosting?: 'cloud' | 'local' | undefined;
```

**Call sites:**
- `src/daemon/model-catalog.ts:48`

### 3.4 `TierResolution` — field-modify

model becomes optional and FallbackReason gains 'model-not-supported'. model is undefined only for a host family whose configured model is not declared; the existing fallback field name 'requested' is kept (the sc2 sketch's 'configured' names the same value).

```
- export type FallbackReason = 'unlisted-model' | 'rejected-model';
+ export type FallbackReason = 'unlisted-model' | 'rejected-model' | 'model-not-supported';
- readonly model: ResolvedModel;
+ readonly model: ResolvedModel | undefined;
```

**Call sites:**
- `src/daemon/model-registry.ts:65-73`
- `src/config/analyze.ts:232`
- `src/config/analyze.ts:245`
- `src/daemon/steps/build-step/phases/validate.ts:195`

### 3.5 `FamilyDefinitionEntry and ModelDefinitionEntry (definitions answer)` — field-add

The answer carries host on a host family and hosting on each of its models, exactly as sc1 sketches.

**Call sites:**
- `src/daemon/model-definitions.ts:98`

### 3.6 `Shipped definitions file` — field-add

Appends one family after the existing three: ollama-claude (cliKind 'claude', host 'ollama'). It lists only models that returned a schema-checked answer through the Claude tool on Ollama in a probe, each with hosting and its efforts. The first batch (user decision 2026-10-29), all probed on 2026-10-29 and all hosting 'cloud': deepseek-v4-pro:cloud, deepseek-v4.1-flash:cloud, glm-5.3:cloud, glm-5.3-flash:cloud, mistral-large-4:cloud and kimi-k3:cloud. Each model's efforts follow the thinking levels Ollama reports for it: glm-5.3, glm-5.3-flash, deepseek-v4.1-flash and kimi-k3 list low, high and max; deepseek-v4-pro and mistral-large-4 only switch thinking on or off, so they list none.

**Call sites:**
- `src/assets/models/cloud-model-catalog.json`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | The catalog types, validator, registry and projectDefinitions add host and hosting exactly as sketched; the five-member FamilyId is the sketch's union. Sites that mean 'a vendor CLI family' switch from 'id is not ollama' or 'has a CLI kind' to 'has a CLI kind and no host', per the HLD's classification rule: isCliFamily (src/daemon/model-catalog.ts:140), the unknown-model check gate (src/daemon/model-check.ts:319), the unlisted/rejected fallback (src/daemon/model-registry.ts:277-278), the tier write's model check (src/daemon/config-write.ts:74), familyForClient (src/daemon/model-registry.ts:105), attribution by label prefix (src/workflow/attribution.ts:49) and the projection's rejectedModels decision (src/daemon/model-definitions.ts:104, used at :117-119), so rejectedModels appears only on vendor CLI families while installed stays on the family without a CLI kind. The approved-model store already refuses other families (src/daemon/model-registry.ts:142). Sites that mean 'runs a CLI' (the provider-factory and listing sites) stay on cliKind. |
| `sc2` | implements | resolveTier returns model undefined with fallback reason 'model-not-supported' for a host family's undeclared model and never substitutes. resolveTierWith logs it; tierModelOf reports the requested id with the fallback so clients show what was set and why it is not used; the build-step validate fallback, which only resolves the default vendor family, keeps a required model. The fallback keeps today's field name 'requested'. |

## 5. Error paths

**Error cases**

- **A host family entry in the definitions file lacks host or cliKind, carries tierDefaults or summariserModel, or has a model without hosting.** (terminal)
  - Detection: validateFamily checks a host family's shape when the file is loaded (the replacement of isCliFamily at src/daemon/model-catalog.ts:140-142 and the checks at :186-191).
  - Response: Throws ModelCatalogValidationError naming the family and the faulty field, as for today's families.
  - User impact: The daemon refuses to start with a message naming the bad entry; this only happens with a broken shipped file, which the asset test catches before release.
- **hosting appears on a model of a family that has no host.** (terminal)
  - Detection: validateFamily rejects hosting on any model of a family without host.
  - Response: Throws ModelCatalogValidationError naming the model.
  - User impact: Same as above: caught by the asset test before release.
- **A tier names a host family with a model the definitions do not declare for it (for example a hand-edited config, or a model removed in a later release).** (recoverable)
  - Detection: resolveTier finds no model of that id or alias in the host family (registry find at src/daemon/model-registry.ts:269).
  - Response: Returns model undefined and fallback { reason: 'model-not-supported', requested }; resolveTierWith logs a warning naming the tier, family and requested model. No other model or family is substituted.
  - User impact: The tier is shown as not supported in the settings surfaces and the run layer (s2) refuses to run it with that reason, rather than running a model the user did not choose.
- **A caller asks for the unknown-model check or an approved-model profile on a host family.** (recoverable)
  - Detection: The check gate (src/daemon/model-check.ts:319) and the store reader (src/daemon/model-registry.ts:142) accept vendor CLI families only.
  - Response: The check answers invalid ('family must be a vendor CLI family of the model definitions'); a store entry naming a host family is logged and skipped, as an unknown family is today.
  - User impact: Host families stay limited to their declared models (k1).

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tier on a host family whose declared model lists no efforts, with an effort configured. | The model resolves and the effort is reported as dropped (droppedEffort), exactly as for a vendor model that does not accept the effort. |
| A tier on a host family naming a declared model by alias. | Resolves to the canonical model id, as aliases do today. |
| A client identity 'claude' or 'codex' when a host family with the same CLI kind is listed before or after the vendor family. | familyForClient returns the vendor family (cli-claude or cli-codex), never the host family. |
| The union of effort levels (effortLevels) with host-family models present. | Host models' efforts join the union only if they add a level not already present; levels already offered stay in today's order. |
| deriveModelDefaults over the four-family file. | familyIds lists four ids; the tier defaults still come from the default vendor family; the local family is still 'ollama' (the only family without a cliKind). |

**Invariants to preserve**

- The three existing families keep their entries, CLI kinds, tier defaults, summariser, tool-loop model and resolution; a tier on them resolves exactly as before, including the unlisted/rejected fallback to the family's tier default. [[c3]]
- familyForClient maps a CLI client to the same vendor family as today. [[c3]]
- The definitions answer's entries for the three existing families are unchanged; installed appears only on the plain Ollama family and rejectedModels only on vendor CLI families. [[c4]]
- Readers that take the first family with a given CLI kind (the installer, scripts/insrc-daemon-install.sh:290-293) and that take the family without a CLI kind as the local family (src/config/model-defaults.ts:57-83) keep picking the same families, because the host families are appended after the existing three and carry a CLI kind. [[c5]]
- Validation of the shipped file stays all-or-nothing at load: a bad entry fails the load with a named reason. [[c2]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (files under src/daemon/__tests__/*.test.ts and src/config/__tests__/*.test.ts)`

**Test levels**

- **unit** — Validator rules for host and vendor families on in-memory fixtures.
  - Subjects: `src/daemon/__tests__/model-catalog.test.ts: the fixture grows to four families; a host family missing host, cliKind or a model's hosting, or carrying tierDefaults or summariserModel, fails with a named reason; hosting on a vendor or plain-Ollama model fails; the three existing families validate as before.`
  - Fixtures: `A valid four-family fixture (the existing three plus ollama-claude with one cloud and one local model).`
- **unit** — Registry resolution, host, client mapping and gates.
  - Subjects: `src/daemon/__tests__/model-registry.test.ts: resolveTier on a host family resolves a declared model and alias, drops an effort the model does not list, and returns model undefined with 'model-not-supported' for an undeclared model without substituting; resolveTier on the three existing families is unchanged, including the unlisted and rejected fallbacks; host() is 'ollama' only for the host family; cliKind() is 'claude' for it; familyForClient returns the vendor family for both clients.`, `src/daemon/__tests__/model-check.test.ts: the unknown-model check refuses a host family.`, `src/daemon/__tests__/config-write-models.test.ts: the tier write's model check treats a host family as not open to unlisted ids.`, `the attribution test for src/workflow/attribution.ts: a run label of a host family is attributed to that family, not the vendor family with the same CLI kind.`
- **unit** — The definitions answer and the derived defaults.
  - Subjects: `src/daemon/__tests__/model-definitions.test.ts: projectDefinitions carries host on the host family and hosting on each of its models, with each model's efforts; the entries for the three existing families equal today's; the host family carries neither rejectedModels nor installed.`, `src/config/__tests__/tier-defaults.test.ts and src/config/__tests__/config-catalog-defs.test.ts: deriveModelDefaults over the four-family file lists four familyIds, keeps the default family's tier defaults, and keeps 'ollama' as the local family. src/config/__tests__/tier-resolution.test.ts: resolveTierWith logs and tierModelOf reports a 'model-not-supported' resolution without reading a missing model.`
- **contract** — The shipped asset and the daemon answer as clients see them.
  - Subjects: `src/daemon/__tests__/model-catalog-asset.test.ts: the shipped file validates, lists the host family after the existing three, and every host-family model has hosting.`, `src/daemon/__tests__/models-definitions-daemon.test.ts: models.definitions over the real daemon returns the host family with host and hosting.`, `src/daemon/__tests__/model-literal-scan.test.ts stays green: new family ids appear only where the scan allows.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `model-definitions.test.ts: projectDefinitions lists ollama-claude with host and every model's hosting`, `models-definitions-daemon.test.ts: models.definitions returns the host family with host and hosting`, `model-catalog-asset.test.ts: every shipped host-family model has hosting` |
| `ac2` | `model-definitions.test.ts: a host-family model with efforts lists them and one without lists []`, `model-registry.test.ts: an effort a host model does not list is dropped` |
| `ac3` | `model-registry.test.ts: resolveTier on a host family with an undeclared model returns model undefined and fallback 'model-not-supported' and substitutes nothing`, `tier-resolution.test.ts: resolveTierWith logs and tierModelOf reports the refusal without reading a missing model` |
| `ac4` | `model-registry.test.ts: resolveTier on cli-claude, cli-codex and ollama is unchanged, including the unlisted and rejected fallbacks`, `model-registry.test.ts: familyForClient returns cli-claude and cli-codex as today`, `model-definitions.test.ts: the three existing families' answer entries equal today's, and the host family carries neither rejectedModels nor installed`, `model-catalog.test.ts: the three existing families validate as before` |

## 7. Migration

**State before:** Three families (cli-claude, cli-codex, ollama) in the shipped definitions file, validated as exactly one entry per family with 'id is not ollama' deciding the CLI-family rules (src/daemon/model-catalog.ts:127, :140-142); TierResolution.model is always present and an unlisted model falls back to the family's tier default (src/daemon/model-registry.ts:65-73, :269-284); the definitions answer has no host or hosting field (src/daemon/model-definitions.ts:98-131).

**State after:** Four families: the existing three unchanged plus ollama-claude appended, with cliKind 'claude', host 'ollama' and every model marked cloud or local. Vendor-CLI decisions key on 'cliKind and no host'. A host family's undeclared model resolves to no model with 'model-not-supported'. The definitions answer adds host and hosting.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional host field to family definitions and hosting to model definitions, the new id to the family-id set, and the 'model-not-supported' reason; make TierResolution.model optional and make its three readers handle absence. — ↩ rollbackable
2. Replace the 'id is not ollama' and 'has a CLI kind' tests at the vendor-family sites with 'has a CLI kind and no host'; keep the 'runs a CLI' sites on the CLI kind. — ↩ rollbackable
3. Add the host-family validation rules and grow the validator test fixture to four families. — ↩ rollbackable
4. Append the host family with its declared models to the shipped definitions file, after the existing three. — ↩ rollbackable
5. Project host and hosting in the definitions answer. — ↩ rollbackable

**Backward compat:** Additive for clients: the answer gains optional host and hosting fields and one family; existing entries are byte-identical. Stored tier settings keep their shape and existing tiers resolve as before. Clients that do not yet read host would list the new family and could offer 'Enter another model id' for them, but the daemon refuses an unlisted model for a host family (model-not-supported) and the unknown-model check refuses host families, so no undeclared model runs; s3-s5 remove that offer.

## 8. Alternatives considered

### 8.1 a1: Optional model only on a host-family refusal (sc2 as sketched) — **CHOSEN**

One host family in the closed family set; TierResolution.model becomes optional and is absent only when the host family names an undeclared model, with fallback reason 'model-not-supported'.

The catalog's family-id set grows by 'ollama-claude'. CliFamilyId keeps meaning the two vendor CLI families; a new HostFamilyId names the host family. FamilyDefinition gains host?: 'ollama' and ModelDefinition gains hosting?: 'cloud' | 'local'. Validation replaces the 'id !== ollama' test with the family's shape: a host family needs cliKind, host and hosting on every model, and must not carry tierDefaults or summariserModel; a vendor CLI family keeps today's rules. The shipped file appends the host family after the existing three, so readers that take the first family with a CLI kind keep picking the vendor family.

The registry exposes host(family) and returns hosting on resolved models. resolveTier keeps today's path for the three existing families; for a host family, a declared model resolves as usual and an undeclared one returns { family, model: undefined, fallback: { reason: 'model-not-supported', requested } } with no substitute. familyForClient, the approved-model store and the unknown-model check consider vendor families only. projectDefinitions adds host on the family and hosting on each model of a host family. resolveTierWith logs the refusal, and tierModelOf reports the configured id so clients show what was set and why it is not used.

### 8.2 a2: Required model with an in-family substitute

Keep TierResolution.model required: an undeclared model on a host family falls back to that family's first declared model, flagged 'model-not-supported'.

Same family set, marks and validator rule as a1. resolveTier, on an undeclared host-family model, substitutes the first model the family declares and reports fallback 'model-not-supported'. No consumer changes type.

The definitions answer and the client-to-family mapping are as in a1.

**Rejected because:** Scores 'partial' on ac3 (it silently runs an unchosen model from file order) and 'violates' sc2 (model stays required with a substitute).

### 8.3 a3: Separate unsupported-resolution type

resolveTier returns either today's TierResolution or a distinct UnsupportedTierResolution for a host family's undeclared model.

Same family set, marks and validator rule as a1. resolveTier's return type becomes a union of TierResolution (model required) and UnsupportedTierResolution { family, requested, reason: 'model-not-supported' } discriminated by a kind field.

Every caller narrows the union; the definitions answer is as in a1.

**Rejected because:** Scores 'partial' on sc2: a union return shape instead of the single TierResolution, with more caller churn for the same behaviour as a1.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 bundle: runner families in the registry and definitions` — "Families live in the model registry; each carries a CLI kind ('claude' | 'codex' | undefined)"
- **[[c2]]** `code` `src/daemon/model-catalog.ts:140` — "function isCliFamily(id: FamilyId): id is CliFamilyId {"
- **[[c3]]** `code` `src/daemon/model-registry.ts:269` — "const found = find(setting.runner, setting.model);"
- **[[c4]]** `code` `src/daemon/model-definitions.ts:98` — "export function projectDefinitions("
- **[[c5]]** `code` `src/config/model-defaults.ts:57` — "export function deriveModelDefaults(defs: ModelDefinitionsFile): DerivedModelDefaults {"
- **[[c6]]** `code` `src/daemon/__tests__/model-catalog.test.ts:35` — "/** A valid minimal fixture with all three families. */"
- **[[c7]]** `prior-artifact` `HLD-b220bb6174a2f5ed` — "sc1 Ollama-hosted CLI families in the definitions answer; sc2 Tier resolution on an Ollama-hosted family"

## 10. Open questions

- Item ts2: the test framework (node:test with node:assert/strict via tsx) is stated from the existing test files; the s1 bundles listed those files but did not report the framework explicitly (partial).
- Item alt2: alternatives were scored against ac1-ac4, sc1 and sc2; Epic constraints k1-k6 appear in the notes but not as separate score entries (partial).
- Resolved 2026-10-29 (user decision): the first batch for ollama-claude is deepseek-v4-pro:cloud, deepseek-v4.1-flash:cloud, glm-5.3:cloud, glm-5.3-flash:cloud, mistral-large-4:cloud and kimi-k3:cloud; Codex on Ollama is out of scope.

## Resolved questions

- `qc3aa8b10` — Item ts2: the test framework (node:test with node:assert/strict via tsx) is stated from the existing test files; the s1 bundles listed those files but did not report the framework explicitly (partial).
  - **resolved**: Verify directly against package.json/tsconfig — Verified 2026-10-30: package.json's test script is `tsx --test src/**/__tests__/*.test.ts` (tsx ^4.21.0) and the tests import `node:test` and `node:assert/strict` (src/daemon/__tests__/model-registry.test.ts). The framework is node:test with node:assert/strict run through tsx. _(2026-10-29T18:45:33.649Z)_
- `qf8c575ab` — Item alt2: alternatives were scored against ac1-ac4, sc1 and sc2; Epic constraints k1-k6 appear in the notes but not as separate score entries (partial).
  - **resolved**: Treat k1-k6 as a pre-filter gate, not a score axis — The Epic constraints are must-meet; the chosen a1 meets k1-k6 (no undeclared model runs, CLI-only access, existing settings reused, one definitions answer, serial calls, existing runners unchanged), and the scored axes stay ac1-ac4 and sc1-sc2. _(2026-10-29T18:46:17.913Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle: runner families in the registry and definitions` — "Families live in the model registry; each carries a CLI kind ('claude' | 'codex' | undefined)"
- **[[c2]]** `code` `src/daemon/model-catalog.ts:140` — "function isCliFamily(id: FamilyId): id is CliFamilyId {"
- **[[c3]]** `code` `src/daemon/model-registry.ts:269` — "const found = find(setting.runner, setting.model);"
- **[[c4]]** `code` `src/daemon/model-definitions.ts:98` — "export function projectDefinitions("
- **[[c5]]** `code` `src/config/model-defaults.ts:57` — "export function deriveModelDefaults(defs: ModelDefinitionsFile): DerivedModelDefaults {"
- **[[c6]]** `code` `src/daemon/__tests__/model-catalog.test.ts:35` — "/** A valid minimal fixture with all three families. */"
- **[[c7]]** `prior-artifact` `HLD-b220bb6174a2f5ed` — "sc1 Ollama-hosted CLI families in the definitions answer; sc2 Tier resolution on an Ollama-hosted family"
