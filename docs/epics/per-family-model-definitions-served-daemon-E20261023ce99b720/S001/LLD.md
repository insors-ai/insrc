<!-- insrc:artifact LLD-ce99b72065d03b1b-s1 -->

# LLD: E20261025ce99b720:S001

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**HLD base run:** `wf-1792924917927-2y1e5h`
**HLD effective hash:** `c324f041e3e7...`

This Story turns the shipped curated catalog into the model definitions file for all three families and gives the daemon one way to read it. Each thread loads and checks the file once, together with the per-user approved-model store, and answers model questions from that cached view; the main thread checks the file before it reconciles settings or starts any worker, and each worker checks it again when it starts, so a broken file stops the daemon or fails that worker's start. The existing catalog accessor keeps serving providers.listModels from the new file until s2 replaces it.

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

> See **HLD-ce99b72065d03b1b** § 2. Framework summary

**Rollout phase:** Phase A — definitions file and registry
**Owns:** `sc1` (ModelDefinitionsFile (the curated catalog file, extended)), `sc2` (ModelRegistry and the approved-model store)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The models.definitions handler and its method-class entry, the projection of the registry, each listed Ollama model's installed state from the existing bounded listing, and re-sourcing providers.listModels from the registry (for Ollama, listed models only), then removing the curated catalog accessor s1 kept. Tests: models.definitions returns every field of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); with Ollama not answering, installed is absent and the request still succeeds. — owns `sc3`
- `s3`: Moving every daemon consumer onto the registry: tier resolution, summariser selection, effort forwarding, CliProvider's input budget and CLI kind, OllamaProvider's num_ctx, the tool-loop model (an unlisted coreModel runs the tool-loop default with a warning) and the runner and model literals in routing, provider construction, attribution and workflow code; SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and ollamaNumCtx go; DEFAULT_TIERS and TIER_EFFORTS stop being written in code and remain only as temporary exports drawn from the definitions for the TUI's model-tiers pane, which s5 migrates; no daemon code uses them. The settings catalog's tier and coreModel defaults and effort values are taken from the definitions; how the settings catalog reaches the file is decided in this Story's LLD and must work in every process that loads the settings catalog today (the daemon, the TUI, the updater, and the VS Code bundle until s6 drops its use). Reconcile removes per-repo tier overrides with a warning and prunes ollamaNumCtx; readRepoOverride and its callers go. config.write refuses a tier set to a rejected model and reports restartRequired. models.resolveRole and its method-class entry. Both installer copies take tier defaults and the tool-loop default from the file. Tests: an unset tier resolves to the file's default, and with a fixture whose defaults differ from today's, reconcile fills the fixture's values (ac1); an unsupported effort is dropped with a warning naming model and effort (ac2); a source scan fails on runner or model literals outside the family implementations, on any read of ollamaNumCtx, and on any daemon use of the temporary DEFAULT_TIERS or TIER_EFFORTS exports (ac3); the TUI still builds and its model-tiers pane shows the definitions' defaults; a repo's `tasks` choice applies with the global tier's model (ac4); reconcile removes per-repo tier overrides with a warning naming repo and tier and keeps `tasks` and coreFloor (ac5); an unlisted model falls back with the warning (decision A); a fixture Ollama model's input limit sets num_ctx; config.write refuses a rejected model and reports restartRequired; models.resolveRole matches the daemon's own resolution for a CLI tier and an Ollama tier; the settings catalog loader accepts the catalog and an unset JetBrains tier still shows the default family's values. — owns `sc5`
- `s4`: The per-family check procedures (Codex: the CLI's model list plus a run; Claude: a run, the input limit from the JSON output, recognised effort names), run one call at a time; telling a reachable CLI that refuses the model apart from an unreachable CLI; refusing approval unless the model ran without error; writing the store atomically and acknowledging a decision only once it is written; the method-class entries. Tests: checks against fake CLIs record each verdict and run one at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); after approval and a restart only the approved levels are accepted (ac3); a rejected profile or unreachable CLI refuses the model with a reason, and approving a check whose model did not run is refused (ac4); after a restart an approved model appears in models.definitions as user-approved and a rejected one among the rejected ids (ac5); a failed store write returns write-failed and keeps the previous store. — owns `sc4`
- `s5`: The TUI model-tiers pane and its effort choices from models.definitions, removing the temporary DEFAULT_TIERS and TIER_EFFORTS exports s3 kept; the unknown-model check and approval screen; the repo settings view limited to `tasks` and coreFloor; showing restartRequired and offering maintenance.restart; the review command using models.resolveRole and building its provider from the answer instead of reading config.json; Setup recommending the definitions' tool-loop default instead of DEFAULT_LOCAL_MODEL, and saying it cannot recommend when the daemon is not running. Tests: the pane offers exactly the options of a fake models.definitions answer and no source file still exports or imports DEFAULT_TIERS or TIER_EFFORTS (ac1); saving an unknown model starts the check and shows its results (ac2); the repo view edits only `tasks` and coreFloor (ac3); the review command runs the model a fake models.resolveRole returns for a CLI and an Ollama tier; Setup recommends the fake answer's tool-loop default.
- `s6`: The VS Code model-tier picker driven by models.definitions instead of its runner list and the bundled settings catalog's effort rows, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel without per-tier fields; showing restartRequired and offering insrc.daemon.restart. Tests: the picker offers exactly a fake answer's options and the bundle keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3).
- `s7`: The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing restartRequired. Tests: the section offers exactly a fake answer's options and the plugin keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3).

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `validateModelCatalog`

```typescript
validateModelCatalog(): ModelDefinitionsFile
```

**Returns:** `ModelDefinitionsFile` — The frozen, validated definitions file, cached for this thread; later calls in the same thread return the same cached object without reading the file again.

**Errors:**
- `ModelCatalogValidationError` when Thrown synchronously when the file is missing or unreadable, is not JSON, or breaks a validation rule; path and reason name the faulty entry (for example `families[1] (cli-codex): tierDefaults.mid.model 'gpt-9' is not a model or alias of cli-codex`).

**Preconditions:**
- modelCatalogDir() points at the asset directory (out/assets/models when built, src/assets/models under tsx, the in-process test override, or the test-only INSRC_MODEL_CATALOG_DIR environment value).

**Postconditions:**
- Replaces today's async Promise<void> export: it is the one synchronous loader, used by the boot hook (which keeps its `await`, harmless on a synchronous call), by getModelRegistry and so by worker start; there is no second loader function.
- On success the parse is cached per thread and logged with version and per-family model counts; on failure nothing is cached and the error propagates synchronously.

### 2.2 `getCuratedCatalog`

```typescript
getCuratedCatalog(): CuratedCatalog  // CuratedCatalog { modelsFor(provider: CloudProvider): readonly CatalogModel[] }
```

**Returns:** `CuratedCatalog` — Stopgap until s2: modelsFor('cli-claude' | 'cli-codex') projects that family's listed models to { id, displayName? }, in file order, so providers.listModels keeps its answer.

**Errors:**
- `Error` when Called before validateModelCatalog succeeded in this thread (boot-ordering bug), as today.

**Preconditions:**
- validateModelCatalog has succeeded in this thread.

**Postconditions:**
- No file I/O; removed by s2.

### 2.3 `ModelRegistry`

```typescript
getModelRegistry(): ModelRegistry  // ModelRegistry as in HLD sc2: families(), defaultFamily(), models(family), rejected(family), find(family, idOrAlias), tierDefault(family, tier), summariserModel(family), toolLoopModel(), cliKind(family), effortLevels(), resolveTier(tier, setting)
```

**Returns:** `ModelRegistry` — The per-thread registry built from validateModelCatalog() plus the approved-model store, built on the first call and cached for the thread's life.

**Errors:**
- `ModelCatalogValidationError` when Propagated from validateModelCatalog when the file is bad.

**Postconditions:**
- The store is read once per thread from PATHS.approvedModels; a missing store is empty; an unreadable or malformed store, or an entry that is not a valid ApprovedProfile, is logged with its path and reason and ignored (the whole store when it is not parseable).
- Effective profiles: for each (family, modelId) only the profile with the latest decidedAt counts; an approved profile for a model the file already lists is shadowed (ignored with a log; the shipped definition wins).
- models(family) = listed models (source 'shipped', file order) followed by effective approved profiles (source 'user-approved', efforts = the approved efforts, in decidedAt order); rejected(family) = ids of effective rejected profiles; find() matches an id or alias case-sensitively within the family, over listed models and effective approved profiles.
- tierDefault(family, tier) returns that CLI family's entry; summariserModel(family) resolves its summariser id or alias; toolLoopModel() resolves the ollama family's toolLoopModel; cliKind returns the family's cliKind (undefined for ollama).
- effortLevels() = the de-duplicated union of the efforts of every model models() returns across all families (shipped and effective approved, never rejected or shadowed profiles), ordered by first appearance: families in file order, within a family listed models in file order then approved profiles in decidedAt order.
- resolveTier(tier, setting): finds setting.model in setting.runner's family (listed or effective approved); if found, keeps setting.effort when that model accepts it, otherwise drops it into droppedEffort; if not found, returns the fallback model with fallback.reason 'rejected-model' when an effective rejected profile has that id, else 'unlisted-model', and fallback.requested = setting.model. The fallback is the tier's default of setting.runner's family, or of defaultFamily() when setting.runner is 'ollama'; its effort is the default's effort. resolveTier logs nothing; s3 logs.

### 2.4 `startDaemonWorker`

```typescript
startDaemonWorker(init: DaemonWorkerInit): HubClient
```

**Parameters:**
- `init: DaemonWorkerInit` — Unchanged worker start data.

**Returns:** `HubClient` — Unchanged.

**Errors:**
- `ModelCatalogValidationError` when The definitions file is bad when the worker starts; the throw fails the worker's start, which the supervisor treats like any other failed start (override item 4).

**Preconditions:**
- Runs in a daemon worker thread, as today.

**Postconditions:**
- Calls getModelRegistry() before returning, so every worker (at boot or as a supervisor replacement) holds a validated registry before it serves work.

## 3. Data model changes

### 3.1 `ModelDefinitionsFile (src/assets/models/cloud-model-catalog.json)` — field-modify

`providers` is replaced by `families` and `defaultFamily` (sc1), version stays 1 as the file has a single reader set, all migrated in this Story. Shipped contents keep everything that runs today: defaultFamily 'cli-claude'. cli-claude (cliKind claude): claude-opus-5-5 (alias opus), claude-sonnet-5 (alias sonnet), claude-fable-5-1, claude-haiku-5-5 (alias haiku, replacing the stale claude-haiku-4-5-20251001; inputLimit 1,000,000 tokens per probe 11); efforts low, medium, high, xhigh, max on every Claude model; tierDefaults core opus, mid sonnet, cheap haiku; summariserModel haiku. cli-codex (cliKind codex): gpt-6.1-sol, gpt-6-astra, gpt-6-sol, gpt-5.6-sol, gpt-5.6-terra with efforts low..max plus ultra; gpt-6-luna and gpt-5.6-luna with low..max; tierDefaults core gpt-6-astra, mid gpt-6.1-sol, cheap gpt-6-luna; summariserModel gpt-6-luna. ollama: qwen3.6:27b with efforts [] and inputLimit 32768 tokens; toolLoopModel qwen3.6:27b. CLI model input limits other than haiku's are left absent (the CLI's own refusal decides, as today) until measured.

```
- providers: { 'cli-claude': CatalogModel[]; 'cli-codex': CatalogModel[] }
+ defaultFamily: 'cli-claude' | 'cli-codex'
+ families: FamilyDefinition[]  // exactly one per FamilyId (sc1)
```

**Call sites:**
- `src/daemon/model-catalog.ts:48`
- `src/daemon/model-catalog.ts:107`
- `src/daemon/model-catalog.ts:209`
- `src/daemon/list-models.ts:127`

### 3.2 `Approved-model store (PATHS.approvedModels, ~/.insrc/approved-models.json)` — new

A per-user JSON file { version: 1, profiles: ApprovedProfile[] } (sc2 shape) under the insrc home, read by this Story and written only by s4. Absent until the first decision.

```
+ PATHS.approvedModels: join(INSRC_DIR, 'approved-models.json')
```

**Call sites:**
- `src/shared/paths.ts:7`

### 3.3 `Boot order (src/daemon/index.ts)` — invariant-change

The validateModelCatalog call moves from after worker start (:381-382) to just before the settings reconcile (:154); a ModelCatalogValidationError there is fatal, as today, so the daemon never reconciles, starts a worker or listens with a bad file.

**Call sites:**
- `src/daemon/index.ts:154`
- `src/daemon/index.ts:283`
- `src/daemon/index.ts:381`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Owns the file format, its contents and validateModelCatalog's rules; extends CloudModelCatalogFile and validateShape in src/daemon/model-catalog.ts in place. |
| `sc2` | implements | Owns ModelRegistry (new src/daemon/model-registry.ts), the ApprovedProfile shape and the store reader; s2, s3 and s4 consume getModelRegistry(). effortLevels() follows sc2's 'union over all models' over listed and effective approved models. |

## 5. Error paths

**Error cases**

- **The definitions file is missing or unreadable at daemon start.** (terminal)
  - Detection: The synchronous read in validateModelCatalog throws; ENOENT maps to 'file not found', any other error to 'unreadable: <message>'.
  - Response: Throws ModelCatalogValidationError from the boot hook, now placed before the settings reconcile; it re-raises to the top-level fatal handler as today, so the daemon exits before reconciling, starting workers or listening.
  - User impact: The daemon does not start; the log names the file and gives the copy-assets Fix line.
- **The file is not valid JSON.** (terminal)
  - Detection: JSON.parse throws inside validateModelCatalog.
  - Response: ModelCatalogValidationError with reason 'malformed JSON: <parser message>'; fatal at boot.
  - User impact: The daemon does not start; the log names the file and the parse error.
- **The file breaks a structural rule: an unknown family id, a missing or repeated family, a CLI family without cliKind, tierDefaults or summariserModel, a model without an efforts list, a duplicate id or alias in a family, a tier default, summariser or tool-loop model that is not a model of its family, an Ollama model without a token inputLimit, a defaultFamily that is not a CLI family, or a non-numeric version.** (terminal)
  - Detection: validateShape checks each rule in file order and stops at the first failure.
  - Response: ModelCatalogValidationError whose reason names the entry path and the rule, for example `families[2] (ollama): model 'x' has no token inputLimit`; fatal at boot.
  - User impact: The daemon does not start; the maintainer sees exactly which entry to fix (ac3).
- **The file becomes invalid on disk after boot and a worker then starts (a supervisor replacement).** (terminal)
  - Detection: startDaemonWorker calls getModelRegistry(), which calls validateModelCatalog in that worker thread and throws.
  - Response: The worker's start fails with the validation error; the supervisor handles it like any other failed start (retries, then its existing restart limit shuts the daemon down).
  - User impact: A broken file never runs in a worker; the log names the entry.
- **The approved-model store is unreadable, not JSON, or not { version, profiles[] }.** (recoverable)
  - Detection: The store reader in the registry catches the read or parse failure, or the shape check fails.
  - Response: Logs a warning with the store path and reason and treats the store as empty; the registry still builds.
  - User impact: User-approved models are unavailable (their tiers fall back under decision A) until the store is fixed; nothing else is affected.
- **One store entry is not a valid ApprovedProfile (unknown family, missing modelId, status not approved/rejected, efforts not a string list).** (recoverable)
  - Detection: Per-entry shape check in the store reader.
  - Response: Logs a warning naming the entry index and reason and skips only that entry.
  - User impact: That one decision is ignored until fixed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A family lists `models: []`. | Valid only for a family with no tier defaults to resolve (none of the shipped families); for a CLI family it fails because its tier defaults and summariser cannot name a model of the family. |
| A model with `efforts: []`. | Valid; resolveTier drops any effort the setting asks for into droppedEffort. |
| An approved profile for a model the file already lists. | Shadowed: ignored with a log; the shipped definition is used and its efforts alone feed effortLevels() (HLD durability). |
| A rejected profile and an approved profile for the same model id. | The later decidedAt is the effective profile; the other is ignored with a log. If the effective one is rejected, its efforts never reach models() or effortLevels(). |
| An effective approved profile with an effort no shipped model lists. | The effort appears in effortLevels() after the shipped efforts of its family, and resolveTier keeps it for that model. |
| A tier setting whose model is an alias (`haiku`). | find() resolves it to the canonical model (claude-haiku-5-5); resolveTier returns that model with no fallback. |
| A tier setting with runner 'ollama' and an unlisted model. | Fallback to defaultFamily()'s default for that tier, reason 'unlisted-model'. |
| The same id used in two different families. | Valid; ids and aliases are unique only within a family. |
| getModelRegistry() called twice in one thread after the file changed on disk in between. | Both calls return the same cached registry; the change is seen only by a thread that loads later or after a restart. |

**Invariants to preserve**

- A missing or malformed catalog is a fail-fast startup refusal raised as ModelCatalogValidationError to the top-level fatal handler, and no request is served before it is validated (src/daemon/index.ts:376-382; s1 bundle 'usage.example'). [[c5]]
- providers.listModels keeps returning the curated Claude and Codex models with available:true through getCuratedCatalog().modelsFor(provider) (src/daemon/list-models.ts:127) until s2 replaces it. [[c10]]
- The catalog asset keeps its location (src/assets/models/cloud-model-catalog.json, shipped to out/assets/models by copy-assets) and the test seams _setModelCatalogDirForTests / _resetModelCatalogForTests keep working (src/daemon/model-catalog.ts:89-99). [[c5]]

## 6. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), as the existing src/daemon/__tests__/model-catalog.test.ts and list-models.test.ts`

**Test levels**

- **unit** — Validator rules, registry lookups and resolution, store reading, and the kept accessor.
  - Subjects: `validateModelCatalog / validateShape in src/daemon/model-catalog.ts (src/daemon/__tests__/model-catalog.test.ts, rewritten for the families shape; refusals asserted with assert.throws on the synchronous call instead of assert.rejects)`, `getModelRegistry and every ModelRegistry method in src/daemon/model-registry.ts (new src/daemon/__tests__/model-registry.test.ts)`, `effortLevels() over shipped and effective approved models: an approved effort absent from every shipped model is included after its family's shipped efforts; a rejected or shadowed profile's efforts are not`, `getCuratedCatalog().modelsFor over the new shape`, `providers.listModels through the kept accessor (src/daemon/__tests__/list-models.test.ts)`
  - Fixtures: `A valid minimal fixture with all three families`, `One fixture per refusal reason: missing file, malformed JSON, unknown family, missing family (no ollama; no non-default CLI family), repeated family, CLI family without cliKind / tierDefaults / summariserModel, model without efforts, duplicate id, duplicate alias, tier default not in family, summariser not in family, toolLoopModel not listed, Ollama model without token inputLimit, defaultFamily 'ollama', non-numeric version`, `Approved-model store fixtures: absent, malformed JSON, wrong shape, one bad entry among good ones, an approved profile shadowing a listed model, approved and rejected for the same id, an approved profile with an effort no shipped model lists`, `An ac2 fixture: the baseline fixture plus one added model with an alias and an effort level ('turbo') that no baseline model lists`
- **integration** — Boot order and worker-start validation with real threads and a temp insrc home.
  - Subjects: `Daemon boot (src/daemon/index.ts) with a corrupted definitions file: exits with ModelCatalogValidationError naming the entry, creates no config.json in a fresh temp home and never opens the socket`, `A worker started through startDaemonWorker (src/daemon/threads/worker-entry.ts) after the asset was corrupted fails its start with the validation error`, `A worker started after the asset or the store changed on disk builds its registry from the new contents while the main thread's cached registry keeps the old ones`
  - Fixtures: `A temp copy of the asset directory pointed to by a test-only INSRC_MODEL_CATALOG_DIR environment seam that modelCatalogDir() honours (workers do not see the in-process override)`, `A temp INSRC home for PATHS`
- **contract** — The shipped asset is valid and keeps what runs today.
  - Subjects: `The shipped src/assets/models/cloud-model-catalog.json validates, ships via copy-assets (src/daemon/__tests__/model-catalog-asset.test.ts), lists every model and alias today's defaults use (opus, sonnet, haiku, gpt-6-astra, gpt-6.1-sol, gpt-6-luna, qwen3.6:27b) and has tier defaults equal to today's DEFAULT_TIERS and installer Codex block`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: boot validates the definitions before reconcile, before any worker starts and before listen (corrupted file -> no config.json, no socket)`, `unit: getModelRegistry() called repeatedly in one thread returns the same registry even after the file changes on disk`, `integration: a worker started after an on-disk change uses the new contents while the main thread keeps its own until restart`, `contract: the shipped file describes all three families with models, tier defaults, summariser, efforts and limits` |
| `ac2` | `unit: with the ac2 fixture loaded after the test-reset seam (standing in for a restart), the added model and alias are returned by models() and find() with its efforts exactly as written, including 'turbo'; effortLevels() includes 'turbo'; resolveTier for a tier set to the new model's alias with effort 'turbo' returns that model with the effort kept and no fallback or droppedEffort; and getCuratedCatalog().modelsFor() lists the new model; no code changes between the baseline and ac2 runs` |
| `ac3` | `unit: one fixture per refusal reason makes validateModelCatalog throw ModelCatalogValidationError synchronously, its reason naming the entry and rule`, `integration: daemon boot with a corrupted file exits with the error before reconcile, workers and listen`, `integration: a worker start fails with the error when the file is bad` |

## 7. Migration

**State before:** The curated catalog lists only Claude and Codex model ids and display names under `providers` (src/assets/models/cloud-model-catalog.json; CloudModelCatalogFile, src/daemon/model-catalog.ts:48). It is validated by an async validateModelCatalog once on the main thread after the settings reconcile and worker start (src/daemon/index.ts:154, :283, :381), cached in a module variable, and read only by providers.listModels through getCuratedCatalog (src/daemon/list-models.ts:127). Workers load no model data (src/daemon/threads/worker-entry.ts:53). There is no approved-model store.

**State after:** The same file holds `defaultFamily` and `families` for cli-claude, cli-codex and ollama with models, aliases, efforts, limits, tier defaults, summariser and tool-loop model. validateModelCatalog is the one synchronous loader: it reads, applies the full rules, caches per thread and returns the file; the boot hook runs it before the settings reconcile; every worker loads and validates it at start through getModelRegistry(); the registry also reads ~/.insrc/approved-models.json when present. getCuratedCatalog keeps answering providers.listModels with the same Claude and Codex lists (the stale Haiku id refreshed) until s2. No consumer of tiers, efforts or limits changes yet; s3 moves them.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Rewrite the shipped asset to the families shape, carrying today's models, the aliases opus, sonnet and haiku, today's tier defaults, the Codex installer defaults, the summariser fallbacks, the Claude and Codex effort lists from the probes, qwen3.6:27b with today's 32768-token context window as the Ollama model and tool-loop default, and the refreshed Haiku id. — ↩ rollbackable
2. Extend the catalog types and validator in place and turn validateModelCatalog into the synchronous, per-thread cached loader that returns the file; keep the error type, asset location and test seams; add the test-only asset-directory environment seam. — ↩ rollbackable
3. Re-implement getCuratedCatalog().modelsFor as a projection of the CLI families' listed models, keeping its signature for providers.listModels. — ↩ rollbackable
4. Add PATHS.approvedModels and the registry module with the store reader and effective-profile rules; add getModelRegistry() to worker start. — ↩ rollbackable
5. Move the boot validation call ahead of the settings reconcile. — ↩ rollbackable
6. Rewrite the catalog, asset and list-models tests for the new shape (refusals asserted with assert.throws) and add the registry, ac2 and boot/worker integration tests. — ↩ rollbackable

**Backward compat:** providers.listModels keeps its request and result shape and returns the same Claude and Codex model lists, with claude-haiku-4-5-20251001 replaced by claude-haiku-5-5 (the model the haiku alias runs today) and the newer Codex models from the CLI's own list added. validateModelCatalog changes from a rejecting promise to a synchronous throw; its only production caller, the boot hook, keeps working because awaiting a synchronous call that throws still propagates the error to the fatal handler. Nothing that resolves tiers, efforts or limits reads the new fields yet, so what runs is unchanged. A daemon built before this Story cannot read the new asset, but the asset ships with the code, so the two never meet. The approved-model store is new and absent until s4 writes it.

## 8. Alternatives considered

### 8.1 a1: Extend model-catalog.ts in place with a synchronous per-thread loader and a registry module — **CHOSEN**

Keep src/daemon/model-catalog.ts as the file's loader and validator, make validateModelCatalog the one synchronous, per-thread cached loader, add a small registry module over it, and load it at boot and at worker start.

model-catalog.ts keeps its asset location, error type and test seams; its types become the sc1 shape and validateShape becomes the full validator. validateModelCatalog becomes synchronous: it reads, parses, validates and caches the frozen file once per thread and returns it; it is the one entry point the boot hook (which keeps its await), getModelRegistry and worker start use. getCuratedCatalog() stays as the stopgap accessor, projecting each CLI family's models to {id, displayName}. A new src/daemon/model-registry.ts builds the sc2 ModelRegistry from the loaded file plus the approved-model store (read synchronously from a new PATHS entry; malformed or missing is logged and treated as empty) and caches it per thread. startDaemonWorker loads the registry when a worker starts, so a bad file fails that worker's start.

The asset is rewritten to the families shape with today's models, aliases, efforts, limits and defaults.

### 8.2 a2: New definitions module, old catalog module kept as a thin adapter

Write a new src/daemon/model-definitions.ts with the loader, validator and registry, and reduce model-catalog.ts to a wrapper that serves the old accessor.

All new code lives in a fresh module; model-catalog.ts delegates validateModelCatalog and getCuratedCatalog to it until s2 removes the accessor.

The asset file and boot hook are reused.

**Rejected because:** Works but replaces what the DEF said to extend and adds an adapter to maintain.

### 8.3 a3: Main-thread load only, workers ask the main thread over the hub

Only the main thread loads the file; workers fetch registry answers through hub requests.

The main thread validates and holds the registry; worker code asks it through the existing hub client for each model question.

No worker reads the file.

**Rejected because:** Violates sc2 and the approved HLD.

## 9. References

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "Approved HLD (revision 14, approved with override 2026-10-25)."
- **[[c2]]** `step-output` `s1` — "LldContext analyze bundles: catalog module, its callers and threads, today's model facts, insrc home paths, existing tests."
- **[[c3]]** `code` `src/daemon/model-catalog.ts:162` — "export async function validateModelCatalog(): Promise<void> {"
- **[[c4]]** `code` `src/daemon/model-catalog.ts:209` — "return catalog.providers[provider];"
- **[[c5]]** `code` `src/daemon/index.ts:378` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `code` `src/daemon/index.ts:154` — "const outcome = reconcileConfigFile();"
- **[[c7]]** `code` `src/daemon/index.ts:283` — "const indexingWorkers = startIndexingWorkers(workers, threadServices.indexingBlock);"
- **[[c8]]** `code` `src/daemon/threads/worker-entry.ts:53` — "export function startDaemonWorker(init: DaemonWorkerInit): HubClient {"
- **[[c9]]** `code` `src/daemon/threads/supervisor.ts:136` — "private async replace(spec: WorkerSpec): Promise<void> {"
- **[[c10]]** `code` `src/daemon/list-models.ts:127` — "const models = deps.catalog().modelsFor(provider).map(toModelInfo);"
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md` — "gpt-6.1-sol, gpt-6-astra, gpt-6-sol, gpt-5.6-sol and gpt-5.6-terra list low/medium/high/xhigh/max/ultra. gpt-6-luna and gpt-5.6-luna list low/medium/high/xhigh/max (no `ultra`)."
- **[[c12]]** `stakeholder` `user 2026-10-25` — "approve with override and continue"
- **[[c13]]** `prior-artifact` `LLD-ce99b72065d03b1b-s1` — "Review round 1 (2026-10-25): effortLevels() must cover effective approved models; one synchronous validateModelCatalog contract; ac2 test must prove a novel effort survives."
