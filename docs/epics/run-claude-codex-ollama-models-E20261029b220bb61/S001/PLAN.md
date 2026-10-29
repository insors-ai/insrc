<!-- insrc:artifact PLAN-b220bb6174a2f5ed-s1 -->

# Plan: E20261029b220bb61:S001

## Summary

**Epic:** `run-claude-codex-ollama-models`
**LLD run:** `wf-1793295657354-55ltvk`
**LLD effective hash:** `ca5bac7aee60...`

Building this Story adds one family, ollama-claude, to the daemon's shipped model definitions and teaches the daemon to handle it: the catalog validator accepts a family marked as running a CLI on Ollama, the registry resolves a tier on it only to a declared model and refuses anything else with 'model-not-supported', and the definitions answer carries the new host and hosting marks. Every place that today means 'a vendor CLI family' is switched to 'has a CLI kind and no host', so the three existing families behave exactly as before. The work ends by shipping the first six cloud models.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Catalog types and validator admit the Ollama-hosted family | M | — | unit: model-catalog.test.ts: the four-family fixture with ollama-claude validates; unit: model-catalog.test.ts: a host family missing host, cliKind or a model's hosting, or carrying tierDefaults or summariserModel, fails naming the family and field; unit: model-catalog.test.ts: hosting on a vendor or plain-Ollama model fails; unit: model-catalog.test.ts: the three existing families validate as before | [[c1]] [[c2]] [[c9]] |
| 2 | **`t2`** Registry exposes host and refuses undeclared host-family models | M | `t1` | unit: model-registry.test.ts: host() is 'ollama' only for ollama-claude and cliKind() is 'claude' for it; unit: model-registry.test.ts: resolveTier on a host family resolves a declared model and alias; unit: model-registry.test.ts: an effort a host model does not list is dropped; unit: model-registry.test.ts: resolveTier on a host family with an undeclared model returns model undefined and fallback 'model-not-supported' and substitutes nothing; unit: model-registry.test.ts: resolveTier on cli-claude, cli-codex and ollama is unchanged, including the unlisted and rejected fallbacks; unit: model-registry.test.ts: familyForClient returns cli-claude and cli-codex as today; unit: model-registry.test.ts: effortLevels over four families keeps today's levels and order; unit: tier-resolution.test.ts: resolveTierWith logs and tierModelOf reports the refusal without reading a missing model | [[c3]] [[c4]] [[c6]] [[c9]] |
| 3 | **`t3`** Vendor-family gates exclude the host family | S | `t2` | unit: model-check.test.ts: the unknown-model check refuses a host family; unit: config-write-models.test.ts: the tier write's model check treats a host family as not open to unlisted ids; unit: model-registry.test.ts: an approved-model store entry naming ollama-claude is skipped; unit: attribution.test.ts: an 'ollama-claude:<model>' run label is attributed to ollama-claude, not cli-claude | [[c7]] [[c9]] |
| 4 | **`t4`** Definitions answer carries host and hosting | S | `t2` | unit: model-definitions.test.ts: projectDefinitions lists ollama-claude with host and every model's hosting; unit: model-definitions.test.ts: a host-family model with efforts lists them and one without lists []; unit: model-definitions.test.ts: the three existing families' answer entries equal today's, and the host family carries neither rejectedModels nor installed | [[c5]] [[c7]] |
| 5 | **`t5`** Ship the ollama-claude family with the first six models | S | `t1`, `t4` | integration: model-catalog-asset.test.ts: the shipped file validates, lists ollama-claude after the existing three, and every host-family model has hosting 'cloud' with its efforts; integration: models-definitions-daemon.test.ts: models.definitions returns the host family with host and hosting; unit: tier-defaults.test.ts and config-catalog-defs.test.ts: deriveModelDefaults lists four familyIds, keeps the default family's tier defaults and 'ollama' as the local family; integration: model-literal-scan.test.ts stays green | [[c8]] [[c10]] [[c11]] |

### 1.1 E20261029b220bb61:S001:T001 — Catalog types and validator admit the Ollama-hosted family

In src/daemon/model-catalog.ts: FamilyId gains 'ollama-claude' and FAMILY_IDS gains it; add HostFamilyId; FamilyDefinition gains host?: 'ollama' and ModelDefinition gains hosting?: 'cloud' | 'local'. Replace isCliFamily's 'id is not ollama' test with the family's shape: a host family must carry cliKind and host, must not carry tierDefaults or summariserModel, and every model needs hosting; a vendor CLI family keeps today's rules; hosting on any model of a family without host fails. Grow the validator's test fixture to four families (the existing three plus ollama-claude with one cloud and one local model); later tasks reuse this fixture.

**Acceptance checks:**
- A four-family fixture with ollama-claude (one cloud and one local model) validates.
- A host family missing host, cliKind or a model's hosting, or carrying tierDefaults or summariserModel, fails with ModelCatalogValidationError naming the family and field.
- hosting on a vendor or plain-Ollama model fails validation.
- The three existing families validate exactly as before.

### 1.2 E20261029b220bb61:S001:T002 — Registry exposes host and refuses undeclared host-family models

In src/daemon/model-registry.ts: add host(family); FallbackReason gains 'model-not-supported' and TierResolution.model becomes optional. resolveTier on a host family resolves a declared model (id or alias, effort kept only if listed, otherwise reported as droppedEffort) and returns model undefined with fallback { reason: 'model-not-supported', requested } for an undeclared one, substituting nothing; the three existing families keep today's path, with the unlisted/rejected fallback keyed on vendor families. familyForClient returns vendor families only. effortLevels over the four-family catalog keeps today's levels in today's order. Update the readers of resolution.model: resolveTierWith logs the refusal and tierModelOf reports the requested id (src/config/analyze.ts:232-247); the build-step validate fallback (src/daemon/steps/build-step/phases/validate.ts:195) keeps resolving the default vendor family.

**Acceptance checks:**
- host() is 'ollama' only for ollama-claude; cliKind() is 'claude' for it.
- resolveTier on ollama-claude with a declared alias resolves to the canonical model id.
- resolveTier on ollama-claude with an effort the model does not list resolves the model and reports the effort as droppedEffort.
- resolveTier on ollama-claude with an undeclared model returns model undefined and fallback 'model-not-supported' and substitutes nothing.
- resolveTier on cli-claude, cli-codex and ollama is unchanged, including the unlisted and rejected fallbacks.
- familyForClient returns cli-claude and cli-codex for the two clients.
- effortLevels over the four-family fixture keeps today's levels in today's order.
- resolveTierWith logs and tierModelOf reports a 'model-not-supported' resolution without reading a missing model; tsc is clean.

### 1.3 E20261029b220bb61:S001:T003 — Vendor-family gates exclude the host family

Switch the remaining 'a vendor CLI family' sites to 'has a CLI kind and no host': the unknown-model check gate (src/daemon/model-check.ts:319-320) and the tier write's rejected-model check (src/daemon/config-write.ts:68-77). Confirm the approved-model store still refuses a host family (src/daemon/model-registry.ts:142) and that run attribution attributes an 'ollama-claude:<model>' label to the host family (src/workflow/attribution.ts:40-52), changing attribution only if a test shows otherwise.

**Acceptance checks:**
- The unknown-model check answers invalid for ollama-claude.
- The tier write's rejected-model check does not treat ollama-claude as a vendor family.
- A store entry naming ollama-claude is skipped.
- An 'ollama-claude:<model>' run label is attributed to ollama-claude.

### 1.4 E20261029b220bb61:S001:T004 — Definitions answer carries host and hosting

In src/daemon/model-definitions.ts projectDefinitions: add host on a host family and hosting on each of its models; decide rejectedModels by 'vendor CLI family' (has a CLI kind and no host) instead of 'has a CLI kind' (:104, :117-119), keeping installed on the family without a CLI kind. The answer's types gain the two optional fields. Its test reuses t1's four-family fixture.

**Acceptance checks:**
- projectDefinitions lists ollama-claude with host 'ollama' and hosting on every model, with each model's efforts (a model without efforts lists []).
- The host family carries neither rejectedModels nor installed.
- The entries for the three existing families equal today's.

### 1.5 E20261029b220bb61:S001:T005 — Ship the ollama-claude family with the first six models

Append ollama-claude to src/assets/models/cloud-model-catalog.json after the existing three: cliKind 'claude', host 'ollama', and the six cloud models deepseek-v4-pro:cloud, deepseek-v4.1-flash:cloud, glm-5.3:cloud, glm-5.3-flash:cloud, mistral-large-4:cloud and kimi-k3:cloud, each with hosting 'cloud'; glm-5.3, glm-5.3-flash, deepseek-v4.1-flash and kimi-k3 list efforts low, high and max, the other two none. Keep the shipped-asset, daemon-answer, derived-defaults and literal-scan tests green and extend them for the new family.

**Acceptance checks:**
- The shipped file validates and lists ollama-claude after the existing three.
- Every ollama-claude model has hosting 'cloud' and the efforts above.
- models.definitions over the real daemon returns ollama-claude with host and hosting.
- deriveModelDefaults lists four familyIds, keeps the default family's tier defaults and keeps 'ollama' as the local family.
- model-literal-scan.test.ts stays green.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/__tests__/model-catalog.test.ts: the fixture grows to four families; a host family missing host, cliKind or a model's hosting, or carrying tierDefaults or summariserModel, fails with a named reason; hosting on a vendor or plain-Ollama model fails; the three existing families validate as before. | `t1` |
| src/daemon/__tests__/model-registry.test.ts: resolveTier on a host family resolves a declared model and alias, drops an effort the model does not list, and returns model undefined with 'model-not-supported' for an undeclared model without substituting; resolveTier on the three existing families is unchanged, including the unlisted and rejected fallbacks; host() is 'ollama' only for the host family; cliKind() is 'claude' for it; familyForClient returns the vendor family for both clients. | `t2` |
| src/daemon/__tests__/model-check.test.ts: the unknown-model check refuses a host family. | `t3` |
| src/daemon/__tests__/config-write-models.test.ts: the tier write's model check treats a host family as not open to unlisted ids. | `t3` |
| the attribution test for src/workflow/attribution.ts: a run label of a host family is attributed to that family, not the vendor family with the same CLI kind. | `t3` |
| src/daemon/__tests__/model-definitions.test.ts: projectDefinitions carries host on the host family and hosting on each of its models, with each model's efforts; the entries for the three existing families equal today's; the host family carries neither rejectedModels nor installed. | `t4` |
| src/config/__tests__/tier-defaults.test.ts and src/config/__tests__/config-catalog-defs.test.ts: deriveModelDefaults over the four-family file lists four familyIds, keeps the default family's tier defaults, and keeps 'ollama' as the local family. src/config/__tests__/tier-resolution.test.ts: resolveTierWith logs and tierModelOf reports a 'model-not-supported' resolution without reading a missing model. | `t2`, `t5` |
| src/daemon/__tests__/model-catalog-asset.test.ts: the shipped file validates, lists the host family after the existing three, and every host-family model has hosting. | `t5` |
| src/daemon/__tests__/models-definitions-daemon.test.ts: models.definitions over the real daemon returns the host family with host and hosting. | `t5` |
| src/daemon/__tests__/model-literal-scan.test.ts stays green: new family ids appear only where the scan allows. | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges FamilyId, FamilyDefinition and ModelDefinition` — "The closed family-id union and FAMILY_IDS grow from three to four members: 'ollama-claude' joins 'cli-claude', 'cli-codex' and 'ollama'."
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails validateModelCatalog and errorPaths host-family validation` — "Vendor-CLI checks key on 'has cliKind and no host', not on 'id is not ollama'."
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails ModelRegistry.resolveTier` — "A host-family resolution never substitutes another model or family."
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails ModelRegistry.cliKind, ModelRegistry.host and familyForClient` — "Callers that mean 'a vendor CLI family' test cliKind(f) !== undefined && host(f) === undefined."
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails projectDefinitions` — "host on each host family, hosting on each of its models; rejectedModels only on vendor CLI families; installed only on the plain Ollama family."
- **[[c6]]** `prior-artifact` `LLD s1 dataModelChanges TierResolution and contractDetails resolveTierWith` — "Never reads resolution.model.id when resolution.model is undefined."
- **[[c7]]** `prior-artifact` `LLD s1 interactionWithShared sc1 vendor-family site classification` — "Sites that mean 'a vendor CLI family' switch from 'id is not ollama' or 'has a CLI kind' to 'has a CLI kind and no host'."
- **[[c8]]** `prior-artifact` `LLD s1 dataModelChanges shipped definitions file` — "Appends one family after the existing three: ollama-claude (cliKind 'claude', host 'ollama')."
- **[[c9]]** `prior-artifact` `LLD s1 errorPaths errorCases and edgeCases` — "Returns model undefined and fallback { reason: 'model-not-supported', requested }; resolveTierWith logs a warning naming the tier, family and requested model."
- **[[c10]]** `prior-artifact` `LLD s1 errorPaths invariantsToPreserve on readers that pick a family by CLI kind` — "Readers that take the first family with a given CLI kind and that take the family without a CLI kind as the local family keep picking the same families."
- **[[c11]]** `prior-artifact` `LLD s1 migration steps 4 and 5` — "Append the host family with its declared models to the shipped definitions file, after the existing three."
