<!-- insrc:artifact PLAN-ce99b72065d03b1b-s1 -->

# Plan: E20261025ce99b720:S001

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**LLD run:** `wf-1792936966614-ornskc`
**LLD effective hash:** `c324f041e3e7...`

Building s1 reshapes the shipped model catalog into the three-family definitions file and makes its loader synchronous and strict, adds a per-thread registry that also reads the user's approved models, has every worker load that registry when it starts, and moves the daemon's file check ahead of the settings reconcile. Nothing that resolves models changes yet; providers.listModels keeps answering through the old accessor until s2.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Reshape the definitions file and make validateModelCatalog the synchronous, fully-checked loader | M | — | unit: model-catalog.test.ts: one synchronous refusal per fixture reason, each naming the entry and rule (incl. the three tier-default effort fixtures); unit: model-catalog.test.ts: validateModelCatalog returns and caches the frozen file; a second call does not re-read; unit: model-catalog.test.ts: getCuratedCatalog().modelsFor projects each CLI family's listed models in file order; unit: model-catalog-asset.test.ts: shipped asset validates, ships via copy-assets, lists today's models and aliases, and its tier defaults and summariser models equal DEFAULT_TIERS, the installer Codex block and SUMMARISER_CLI_FALLBACK; unit: list-models.test.ts: existing suite passes unchanged | [[c1]] [[c2]] [[c5]] [[c8]] [[c10]] |
| 2 | **`t2`** Add the approved-model store path and the per-thread ModelRegistry | M | `t1` | unit: model-registry.test.ts: families/defaultFamily/models/find/tierDefault/summariserModel/toolLoopModel/cliKind against the minimal fixture; unit: model-registry.test.ts: store fixtures (absent, malformed, wrong shape, one bad entry, shadowed approval, approved-vs-rejected by decidedAt) yield the stated models() and rejected(); unit: model-registry.test.ts: effortLevels includes an approved-only effort after its family's shipped efforts and excludes rejected or shadowed efforts; unit: model-registry.test.ts: resolveTier keeps an accepted effort, drops an unaccepted one, falls back with rejected-model vs unlisted-model, uses the default family for an Ollama tier, and an alias-named default's effort is returned and accepted; unit: model-registry.test.ts: ac2 fixture after reset serves the new model, alias and 'turbo' through models(), find(), effortLevels(), resolveTier() and getCuratedCatalog(); unit: model-registry.test.ts: getModelRegistry() returns the same cached registry after the file changes on disk | [[c3]] [[c6]] [[c8]] [[c9]] |
| 3 | **`t3`** Load and validate the registry when every worker starts | S | `t2` | integration: worker-model-registry.test.ts: a worker started with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy fails its start with ModelCatalogValidationError; integration: worker-model-registry.test.ts: a worker started after the asset copy and store changed reports the new models while the main thread's registry keeps the old ones; integration: worker-stores, supervisor and threads-boot suites pass unchanged with the shipped asset | [[c4]] [[c8]] [[c9]] |
| 4 | **`t4`** Move the boot validation ahead of the settings reconcile | S | `t1` | integration: boot-model-catalog.test.ts: daemon entry in a temp home with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy exits non-zero with the error naming the entry, writes no config.json and never creates the socket; integration: boot-model-catalog.test.ts: with the shipped asset the daemon boots and listens | [[c7]] [[c8]] [[c9]] |

### 1.1 E20261025ce99b720:S001:T001 — Reshape the definitions file and make validateModelCatalog the synchronous, fully-checked loader

Rewrite src/assets/models/cloud-model-catalog.json to the families shape with today's models, aliases, efforts, limits and defaults; extend the types and validateShape in src/daemon/model-catalog.ts with every LLD rule (including the tier-default effort rule); turn validateModelCatalog into the synchronous, per-thread cached loader that returns the file; keep the error type, asset location and test seams and add the INSRC_MODEL_CATALOG_DIR test seam; re-implement getCuratedCatalog().modelsFor as a projection of the CLI families so providers.listModels keeps its answer. Rewrite the catalog and asset tests for the new shape.

**Acceptance checks:**
- validateModelCatalog throws ModelCatalogValidationError synchronously, naming entry and rule, for each refusal fixture
- The shipped asset validates and carries today's models, aliases (opus, sonnet, haiku) and qwen3.6:27b with 32768 tokens
- The shipped asset's cli-claude tier defaults equal DEFAULT_TIERS (opus/sonnet/haiku), its cli-codex defaults equal the installer's block (gpt-6-astra/gpt-6.1-sol/gpt-6-luna), and its summariser models equal SUMMARISER_CLI_FALLBACK (haiku/gpt-6-luna)
- providers.listModels returns the Claude and Codex model lists through getCuratedCatalog
- The existing list-models suite passes unchanged

### 1.2 E20261025ce99b720:S001:T002 — Add the approved-model store path and the per-thread ModelRegistry

Add PATHS.approvedModels and src/daemon/model-registry.ts: getModelRegistry() builds and caches per thread from validateModelCatalog() plus the store (missing = empty; malformed store or entry logged and ignored; effective profile = latest decidedAt; shadowed approvals ignored), and implements every sc2 method including effortLevels over shipped and effective approved models and resolveTier with decision-A fallback and dropped efforts.

**Acceptance checks:**
- Every ModelRegistry method returns what the LLD postconditions state for the fixtures
- effortLevels includes an approved-only effort and excludes rejected or shadowed ones
- resolveTier distinguishes rejected-model from unlisted-model, falls back per family (default family for Ollama) and never returns an effort its model does not accept
- The ac2 fixture's added model, alias and 'turbo' effort are served after a reset with no code change
- A malformed store or bad entry is logged and ignored without throwing

### 1.3 E20261025ce99b720:S001:T003 — Load and validate the registry when every worker starts

Call getModelRegistry() in startDaemonWorker (src/daemon/threads/worker-entry.ts) before it returns, so a bad file fails the worker's start; prove it with real worker threads using the INSRC_MODEL_CATALOG_DIR seam.

**Acceptance checks:**
- A worker started against a corrupted asset fails its start with ModelCatalogValidationError
- A worker started after the asset or store changed on disk builds its registry from the new contents while the main thread keeps its own
- The thread suites (worker-stores, supervisor, threads-boot) pass with the real shipped asset loaded at worker start, and no test helper needs an asset override

### 1.4 E20261025ce99b720:S001:T004 — Move the boot validation ahead of the settings reconcile

Move the validateModelCatalog call in src/daemon/index.ts from step 6d'' to just before the reconcile (step 2b), keeping it fatal; prove with a daemon boot in a temp home against a corrupted asset.

**Acceptance checks:**
- Booting with a corrupted asset exits with ModelCatalogValidationError naming the entry
- No config.json is created in a fresh temp home and the socket never opens
- A valid asset boots as before

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| validateModelCatalog / validateShape in src/daemon/model-catalog.ts (src/daemon/__tests__/model-catalog.test.ts, rewritten for the families shape; refusals asserted with assert.throws on the synchronous call instead of assert.rejects) | `t1` |
| getModelRegistry and every ModelRegistry method in src/daemon/model-registry.ts (new src/daemon/__tests__/model-registry.test.ts) | `t2` |
| effortLevels() over shipped and effective approved models: an approved effort absent from every shipped model is included after its family's shipped efforts; a rejected or shadowed profile's efforts are not | `t2` |
| resolveTier fallback: with a fixture whose tier default names a model by alias and carries an effort that model accepts, a tier set to an unlisted model falls back to that default with that effort, and the returned effort is in the returned model's efforts | `t2` |
| getCuratedCatalog().modelsFor over the new shape | `t1` |
| providers.listModels through the kept accessor (src/daemon/__tests__/list-models.test.ts) | `t1` |
| Daemon boot (src/daemon/index.ts) with a corrupted definitions file: exits with ModelCatalogValidationError naming the entry, creates no config.json in a fresh temp home and never opens the socket | `t4` |
| A worker started through startDaemonWorker (src/daemon/threads/worker-entry.ts) after the asset was corrupted fails its start with the validation error | `t3` |
| A worker started after the asset or the store changed on disk builds its registry from the new contents while the main thread's cached registry keeps the old ones | `t3` |
| The shipped src/assets/models/cloud-model-catalog.json validates, ships via copy-assets (src/daemon/__tests__/model-catalog-asset.test.ts), lists every model and alias today's defaults use (opus, sonnet, haiku, gpt-6-astra, gpt-6.1-sol, gpt-6-luna, qwen3.6:27b) and has tier defaults equal to today's DEFAULT_TIERS and installer Codex block | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api validateModelCatalog` — "validateModelCatalog(): ModelDefinitionsFile"
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.api getCuratedCatalog` — "Stopgap until s2: modelsFor('cli-claude' | 'cli-codex') projects that family's listed models"
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails.api ModelRegistry` — "getModelRegistry(): ModelRegistry"
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails.api startDaemonWorker` — "Calls getModelRegistry() before returning"
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges ModelDefinitionsFile` — "`providers` is replaced by `families` and `defaultFamily` (sc1)"
- **[[c6]]** `prior-artifact` `LLD s1 dataModelChanges approved-model store` — "+ PATHS.approvedModels: join(INSRC_DIR, 'approved-models.json')"
- **[[c7]]** `prior-artifact` `LLD s1 dataModelChanges boot order` — "The validateModelCatalog call moves from after worker start (:381-382) to just before the settings reconcile (:154)"
- **[[c8]]** `prior-artifact` `LLD s1 errorPaths` — "validateShape checks each rule in file order and stops at the first failure"
- **[[c9]]** `prior-artifact` `LLD s1 testStrategy` — "node:test via tsx (npx tsx --test)"
- **[[c10]]** `prior-artifact` `LLD s1 migration` — "Rewrite the shipped asset to the families shape, carrying today's models"
