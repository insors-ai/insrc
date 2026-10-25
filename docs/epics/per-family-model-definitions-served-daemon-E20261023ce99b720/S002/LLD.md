<!-- insrc:artifact LLD-ce99b72065d03b1b-s2 -->

# LLD: E20261025ce99b720:S002

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**HLD base run:** `wf-1792924917927-2y1e5h`
**HLD effective hash:** `c324f041e3e7...`

This Story adds the read-only models.definitions request: it projects the daemon's model registry into one answer listing every family with its models, aliases, efforts, limits, tier defaults, summariser, tool-loop default, rejected ids and, for Ollama models, whether they are installed. providers.listModels keeps its request and result shape but is computed from that same projection, so the two always agree; for Ollama it lists only listed models that are installed. The temporary getCuratedCatalog accessor s1 kept is removed.

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

**Rollout phase:** Phase B — daemon serves and runs by the definitions
**Owns:** `sc3` (models.definitions IPC request)
**Consumes:** `sc1` (ModelDefinitionsFile (the curated catalog file, extended)), `sc2` (ModelRegistry and the approved-model store)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Extending the catalog file, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator in place; refreshing its contents with today's models, the aliases today's tier defaults use (opus, sonnet, haiku), the Ollama models insrc ships with and their context windows, and today's coreModel as the tool-loop default; the registry and its per-thread cache; moving the boot validation ahead of the settings reconcile and the worker threads; reading the approved-model store (a malformed store is logged and treated as empty); keeping the curated catalog's existing accessor answering providers.listModels from the new file shape until s2 replaces it. The validator refuses a missing or malformed file, an unknown, missing or repeated family, a CLI family without its CLI kind, tier defaults or summariser model, a model without an efforts list, a duplicate id or alias, a default that is not a model of its family, an Ollama model without a token input limit, and a tool-loop default that is not listed, naming the entry (ac3). Tests: one fixture per refusal reason (ac3); a model and alias added to a fixture are served after a restart with no code change (ac2); the file is validated before the settings reconcile, before any worker starts and before listen (ac1, k7); repeated requests in one thread return the same definitions even after the file changes on disk (ac1); a replacement worker started after the file, the store or config.json changed on disk uses the new values while a surviving thread keeps its own until the restart, and a thread whose first read comes after such a change likewise uses the new values; after a daemon restart every thread resolves the same definitions, approvals and tiers; providers.listModels still returns today's Claude and Codex models through the kept accessor; alias, effort and limit lookups; resolveTier distinguishes rejected-model from unlisted-model and falls back to the tier's family default, or the default family's for an Ollama tier. — owns `sc1`, `sc2`
- `s3`: Moving every daemon consumer onto the registry: tier resolution, summariser selection, effort forwarding, CliProvider's input budget and CLI kind, OllamaProvider's num_ctx, the tool-loop model (an unlisted coreModel runs the tool-loop default with a warning) and the runner and model literals in routing, provider construction, attribution and workflow code; SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and ollamaNumCtx go; DEFAULT_TIERS and TIER_EFFORTS stop being written in code and remain only as temporary exports drawn from the definitions for the TUI's model-tiers pane, which s5 migrates; no daemon code uses them. The settings catalog's tier and coreModel defaults and effort values are taken from the definitions; how the settings catalog reaches the file is decided in this Story's LLD and must work in every process that loads the settings catalog today (the daemon, the TUI, the updater, and the VS Code bundle until s6 drops its use). Reconcile removes per-repo tier overrides with a warning and prunes ollamaNumCtx; readRepoOverride and its callers go. config.write refuses a tier set to a rejected model and reports restartRequired. models.resolveRole and its method-class entry. Both installer copies take tier defaults and the tool-loop default from the file. Tests: an unset tier resolves to the file's default, and with a fixture whose defaults differ from today's, reconcile fills the fixture's values (ac1); an unsupported effort is dropped with a warning naming model and effort (ac2); a source scan fails on runner or model literals outside the family implementations, on any read of ollamaNumCtx, and on any daemon use of the temporary DEFAULT_TIERS or TIER_EFFORTS exports (ac3); the TUI still builds and its model-tiers pane shows the definitions' defaults; a repo's `tasks` choice applies with the global tier's model (ac4); reconcile removes per-repo tier overrides with a warning naming repo and tier and keeps `tasks` and coreFloor (ac5); an unlisted model falls back with the warning (decision A); a fixture Ollama model's input limit sets num_ctx; config.write refuses a rejected model and reports restartRequired; models.resolveRole matches the daemon's own resolution for a CLI tier and an Ollama tier; the settings catalog loader accepts the catalog and an unset JetBrains tier still shows the default family's values. — owns `sc5`
- `s4`: The per-family check procedures (Codex: the CLI's model list plus a run; Claude: a run, the input limit from the JSON output, recognised effort names), run one call at a time; telling a reachable CLI that refuses the model apart from an unreachable CLI; refusing approval unless the model ran without error; writing the store atomically and acknowledging a decision only once it is written; the method-class entries. Tests: checks against fake CLIs record each verdict and run one at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); after approval and a restart only the approved levels are accepted (ac3); a rejected profile or unreachable CLI refuses the model with a reason, and approving a check whose model did not run is refused (ac4); after a restart an approved model appears in models.definitions as user-approved and a rejected one among the rejected ids (ac5); a failed store write returns write-failed and keeps the previous store. — owns `sc4`
- `s5`: The TUI model-tiers pane and its effort choices from models.definitions, removing the temporary DEFAULT_TIERS and TIER_EFFORTS exports s3 kept; the unknown-model check and approval screen; the repo settings view limited to `tasks` and coreFloor; showing restartRequired and offering maintenance.restart; the review command using models.resolveRole and building its provider from the answer instead of reading config.json; Setup recommending the definitions' tool-loop default instead of DEFAULT_LOCAL_MODEL, and saying it cannot recommend when the daemon is not running. Tests: the pane offers exactly the options of a fake models.definitions answer and no source file still exports or imports DEFAULT_TIERS or TIER_EFFORTS (ac1); saving an unknown model starts the check and shows its results (ac2); the repo view edits only `tasks` and coreFloor (ac3); the review command runs the model a fake models.resolveRole returns for a CLI and an Ollama tier; Setup recommends the fake answer's tool-loop default.
- `s6`: The VS Code model-tier picker driven by models.definitions instead of its runner list and the bundled settings catalog's effort rows, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel without per-tier fields; showing restartRequired and offering insrc.daemon.restart. Tests: the picker offers exactly a fake answer's options and the bundle keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3).
- `s7`: The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing restartRequired. Tests: the section offers exactly a fake answer's options and the plugin keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3).

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `models.definitions`

```typescript
'models.definitions': (params: unknown) => Promise<ModelDefinitionsResult>  // implemented by modelDefinitions(deps?: ListModelsDeps) in src/daemon/model-definitions.ts
```

**Parameters:**
- `params: unknown` _(optional)_ — Ignored; the request takes no parameters (sc3 params: {}).

**Returns:** `ModelDefinitionsResult` — The sc3 answer: version and defaultFamily from the validated file; one entry per family in file order with id, cliKind (CLI families), displayName, tierDefaults and summariserModel (CLI families), toolLoopModel (ollama), rejectedModels (CLI families, possibly empty) and models in registry order, each with id, aliases (always a list, [] when none), displayName when set, efforts, inputLimit when set, source, and installed (ollama models only, and only when the Ollama listing answered).

**Preconditions:**
- validateModelCatalog has succeeded in this thread (boot validates before listen), so getModelRegistry() returns without throwing.

**Postconditions:**
- Reads only getModelRegistry() and the validated file's version, and calls the bounded Ollama listing (OllamaProvider.listLocalModels, 4 s) exactly once.
- installed is true for an Ollama model whose id equals an installed name exactly and false otherwise; when the listing rejects (unreachable, timeout, malformed) installed is absent on every Ollama model and the request still succeeds.
- An installed Ollama model that is not listed does not appear.
- Mutates nothing; registered in buildHandlerRuntime's RPC map and as a session method in src/daemon/threads/method-class.ts.

### 2.2 `listModels`

```typescript
listModels(params: unknown, deps?: ListModelsDeps): Promise<ModelListResult | ListModelsError>
```

**Parameters:**
- `params: unknown` — { provider: 'ollama' | 'cli-claude' | 'cli-codex' }, unchanged.
- `deps: ListModelsDeps` _(optional)_ — Injected seams: ollamaList() (the bounded listing) and registry() (getModelRegistry) plus catalogVersion() (the validated file's version); default to the real ones.

**Returns:** `ModelListResult | ListModelsError` — Unchanged shape. For a CLI family: available:true and every model the definitions answer lists for that family (shipped then user-approved) as { id, displayName? }. For ollama: when the listing answers, available:true and the listed models whose installed is true; when it does not, available:false and [].

**Errors:**
- `ListModelsError` when provider missing or not one of the three families: { error: 'invalid-params: ...', recoverable: false }, as today.

**Preconditions:**
- validateModelCatalog has succeeded in this thread.

**Postconditions:**
- Builds its answer from the same projection models.definitions uses, so for every family its models equal the definitions answer's models for that family (ollama: those with installed === true) mapped to { id, displayName? }.
- A CLI-family request does not call the Ollama listing.
- No longer reads getCuratedCatalog, which is removed.

## 3. Data model changes

### 3.1 `ModelDefinitionsResult (sc3, new src/daemon/model-definitions.ts)` — new

The IPC answer type exactly as the HLD sc3 sketch, exported for the handler and tests. Projection rules: families and models keep registry order; aliases is always a list; optional fields are omitted rather than set to undefined (exactOptionalPropertyTypes); rejectedModels = registry.rejected(family) on CLI families only.

```
+ interface ModelDefinitionsResult { version; defaultFamily; families: { id; cliKind?; displayName; tierDefaults?; summariserModel?; toolLoopModel?; rejectedModels?; models: { id; aliases; displayName?; efforts; inputLimit?; source; installed? }[] }[] }
```

**Call sites:**
- `src/daemon/handler-runtime.ts:1430`
- `src/daemon/threads/method-class.ts:150`

### 3.2 `ListModelsDeps (src/daemon/list-models.ts)` — field-modify

The catalog() dependency is replaced by registry() and catalogVersion(); ollamaList() stays.

```
- catalog(): CuratedCatalog
+ registry(): ModelRegistry
+ catalogVersion(): number
```

**Call sites:**
- `src/daemon/list-models.ts:83-86`
- `src/daemon/__tests__/list-models.test.ts`

### 3.3 `Curated catalog accessor (src/daemon/model-catalog.ts)` — field-remove

getCuratedCatalog, CuratedCatalog and CatalogModel are removed (the s1 stopgap); CloudProvider stays only if still used, otherwise it is removed too. The model-catalog and model-registry tests that called getCuratedCatalog are updated.

```
- export function getCuratedCatalog(): CuratedCatalog
- export interface CuratedCatalog
- export interface CatalogModel
```

**Call sites:**
- `src/daemon/list-models.ts:83-86`
- `src/daemon/__tests__/model-catalog.test.ts`
- `src/daemon/__tests__/model-registry.test.ts`

### 3.4 `Method-class table (src/daemon/threads/method-class.ts)` — field-add

Adds ['models.definitions', 'session', false]; the admin and indexing counts the coverage test pins are unchanged.

```
+ ['models.definitions', 'session', false]
```

**Call sites:**
- `src/daemon/threads/method-class.ts:150`
- `src/daemon/threads/__tests__/method-class.test.ts:53`
- `src/daemon/threads/__tests__/method-class.test.ts:66`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | Owns the models.definitions request and its ModelDefinitionsResult, and derives providers.listModels from the same projection (s2/ac2). |
| `sc2` | consumes | Reads families(), defaultFamily(), models(), rejected() from getModelRegistry(); no registry change. |
| `sc1` | consumes | Reads only the version from validateModelCatalog()'s cached file (the registry has no version accessor). |

## 5. Error paths

**Error cases**

- **Ollama does not answer the listing during models.definitions (unreachable, the 4 s timeout, or a malformed reply).** (recoverable)
  - Detection: The injected ollamaList() promise rejects; the projection catches the rejection.
  - Response: Builds the answer without installed on any Ollama model and returns it as a success; nothing is logged at warn level beyond what the listing already logs.
  - User impact: Clients still see every family and model; they cannot tell which Ollama models are installed until Ollama answers.
- **Ollama does not answer during providers.listModels for 'ollama'.** (recoverable)
  - Detection: Same rejected ollamaList() promise.
  - Response: Returns { provider: 'ollama', available: false, models: [] }, exactly as today.
  - User impact: Pickers show Ollama as unavailable, as they do today.
- **providers.listModels is called with a missing or unknown provider.** (terminal)
  - Detection: extractProvider finds no valid provider in params.
  - Response: Returns the existing invalid-params ListModelsError without touching the registry or Ollama.
  - User impact: The client gets the same error it gets today.
- **The registry cannot be built in the serving thread (definitions file bad).** (terminal)
  - Detection: getModelRegistry() throws ModelCatalogValidationError.
  - Response: Not reachable in a running daemon: boot validates the file before listen (s1). If it ever happened, the error propagates to the RPC dispatcher's existing error reply; neither handler catches it.
  - User impact: None in practice; the daemon would not have started with a bad file.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An installed Ollama model that is not listed in the definitions (for example llama3:8b). | Appears in neither models.definitions nor providers.listModels('ollama'). |
| A listed Ollama model installed under a different tag (listed qwen3.6:27b, installed qwen3.6:latest). | installed is false for qwen3.6:27b; matching is exact string equality, no tag normalisation. |
| Ollama answers with zero installed models. | models.definitions marks every Ollama model installed: false; providers.listModels('ollama') returns available: true and []. |
| A model with no aliases in the file. | aliases is [] in the answer, never absent. |
| A user-approved Codex model in the store (after s4). | Listed after the shipped Codex models with source 'user-approved' in models.definitions, and included in providers.listModels('cli-codex'). |
| A rejected Codex model in the store. | Appears only in the cli-codex family's rejectedModels; absent from models and from providers.listModels. |
| models.definitions called with params null, {} or extra keys. | Params are ignored; the same answer is returned. |
| providers.listModels for a CLI family while Ollama is down. | Unaffected: available: true with the family's models; the Ollama listing is not called. |

**Invariants to preserve**

- providers.listModels keeps its request ({ provider }) and result ({ provider, available, models: [{ id, displayName? }] }) shapes, with available:false + [] for an unreachable Ollama, because the VS Code picker and the JetBrains gateway parse it until s6/s7 move them to models.definitions. [[c6]]
- providers.listModels is a read-only session method dispatched through buildHandlerRuntime; it makes no cloud REST call and mutates nothing. [[c4]]
- The method-class table lists exactly the methods buildHandlerRuntime serves; a new handler gets its entry in the same change, and the admin/indexing counts stay as pinned. [[c5]]

## 6. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), as the existing src/daemon/__tests__/list-models.test.ts and src/daemon/threads/__tests__/method-class.test.ts`

**Test levels**

- **unit** — The projection, the installed state, and providers.listModels derived from it, over injected deps (fake registry via a temp definitions dir and store, fake Ollama lister).
  - Subjects: `models.definitions projection in src/daemon/model-definitions.ts (new src/daemon/__tests__/model-definitions.test.ts): every sc3 field of a fixture file, aliases always a list, optional fields omitted, rejectedModels on CLI families only, user-approved models after shipped ones`, `installed state: exact-match true/false, absent on every Ollama model when the lister rejects, unlisted installed models absent`, `listModels in src/daemon/list-models.ts (src/daemon/__tests__/list-models.test.ts, rewritten deps): CLI families from the projection without calling the lister; ollama installed-and-listed only; available:false + [] on a rejecting lister; invalid params unchanged`, `agreement: for every family, listModels(family).models equals the definitions answer's models for that family (ollama: installed === true) mapped to { id, displayName? }`
  - Fixtures: `A temp definitions dir (INSRC_MODEL_CATALOG_DIR / _setModelCatalogDirForTests) with aliases, a model with no aliases, efforts, input limits, tier defaults with an effort, two Ollama models`, `An approved-model store with one approved and one rejected Codex model`, `Fake Ollama listers: answering with one listed model, one unlisted model and one listed model under another tag; answering with []; rejecting`
- **contract** — The handler map and the method-class table stay in step and the curated accessor is gone.
  - Subjects: `handler map: 'models.definitions' is a real read-only handler in buildHandlerRuntime and 'providers.listModels' still delegates to listModels`, `method-class: src/daemon/threads/__tests__/method-class.test.ts passes with ['models.definitions', 'session', false] (coverage equals handler keys; admin/indexing counts unchanged)`, `source scan: no file under src imports getCuratedCatalog, CuratedCatalog or CatalogModel`
- **integration** — The real daemon answers models.definitions over its socket from the shipped asset.
  - Subjects: `a daemon started in a temp home answers models.definitions with the three shipped families and providers.listModels('cli-claude') agreeing with it`
  - Fixtures: `A temp INSRC home (the startDaemon helper in src/mcp/__tests__/helpers/mcp-e2e.ts)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: models.definitions returns every sc3 field of a fixture file, including aliases, efforts, input limits, tier defaults with effort, summariser, tool-loop model, default family and version`, `unit: a user-approved model appears with source 'user-approved' and a rejected one only in rejectedModels`, `integration: a real daemon answers models.definitions with the shipped families` |
| `ac2` | `unit: for every family providers.listModels agrees with the definitions answer, and an installed but unlisted Ollama model appears in neither`, `unit: with the Ollama lister rejecting, installed is absent and models.definitions still succeeds while providers.listModels('ollama') returns available:false + []`, `integration: providers.listModels('cli-claude') over the socket agrees with models.definitions` |

## 7. Migration

**State before:** providers.listModels (src/daemon/handler-runtime.ts:1430 -> listModels, src/daemon/list-models.ts:100) answers CLI families from the s1 stopgap getCuratedCatalog().modelsFor (src/daemon/list-models.ts:83-86), which lists only shipped models, and answers Ollama with every installed model from the bounded listing (src/daemon/list-models.ts:74-78, src/agent/providers/ollama.ts:265), listed or not. There is no models.definitions request; the method-class table has no entry for it (src/daemon/threads/method-class.ts:150 holds providers.listModels as session).

**State after:** models.definitions returns the sc3 projection of getModelRegistry() with each listed Ollama model's installed state, registered as a session method. providers.listModels keeps its request and result shape and is computed from the same projection: CLI families list shipped then user-approved models; Ollama lists only listed models that are installed, and available:false + [] when Ollama does not answer. getCuratedCatalog, CuratedCatalog and CatalogModel no longer exist.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add src/daemon/model-definitions.ts with the ModelDefinitionsResult type and the projection over the registry, the file version and an optional installed list. — ↩ rollbackable
2. Register 'models.definitions' in buildHandlerRuntime's RPC map and add ['models.definitions', 'session', false] to the method-class table in the same change. — ↩ rollbackable
3. Switch listModels' deps from catalog() to registry() and catalogVersion() and compute its answer from the projection (CLI families without calling the Ollama listing). — ↩ rollbackable
4. Remove getCuratedCatalog, CuratedCatalog and CatalogModel (and CloudProvider if unused) from src/daemon/model-catalog.ts, and update the model-catalog and model-registry tests that used them. — ↩ rollbackable
5. Rewrite list-models.test.ts for the new deps and add model-definitions tests, the agreement test and the real-daemon integration test. — ↩ rollbackable

**Backward compat:** providers.listModels keeps its request and result shape, so the VS Code picker and the JetBrains gateway keep working unchanged. Two answers change by design (HLD s2 boundary): providers.listModels('ollama') no longer returns installed models the definitions do not list (an unlisted installed model was never usable as a tier after s3, decision A), and CLI families may include user-approved models once s4 can write approvals (none exist before s4). models.definitions is additive. getCuratedCatalog was internal to the daemon; its only production caller is list-models.ts, changed in the same step.

## 8. Alternatives considered

### 8.1 a1: One projection, list derived from it — **CHOSEN**

A new model-definitions module projects the registry into the sc3 answer; providers.listModels is computed from that same answer.

Add src/daemon/model-definitions.ts with modelDefinitions(deps): it reads getModelRegistry() and the validated file's version, calls the existing bounded Ollama listing once, and projects every family into the sc3 ModelDefinitionsResult (Ollama models carry installed only when the listing answered). listModels(params, deps) in src/daemon/list-models.ts keeps its request and result shape but takes its models from modelDefinitions' answer for the requested family: CLI families map every served model (shipped and user-approved) to {id, displayName?} with available:true; Ollama maps the listed models whose installed is true, and returns available:false with [] when the listing did not answer, as today. Register 'models.definitions' in buildHandlerRuntime and the method-class table as a session method. Remove getCuratedCatalog, CuratedCatalog and CatalogModel from model-catalog.ts and the catalog dependency from list-models.ts.

### 8.2 a2: Two projections over the registry

models.definitions and providers.listModels each read the registry directly with their own mapping.

Add a models.definitions handler that projects the registry into the sc3 answer. Change listModels to read getModelRegistry().models(family) for CLI families and to filter the Ollama listing by registry.find('ollama', id) for Ollama, without going through the definitions answer. Remove getCuratedCatalog. Register the new method in the handler map and the method-class table.

**Rejected because:** Equal on ac1 and sc3 but only partial on ac2: the installed-state and model mapping are written twice and can drift.

## 9. References

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "Approved HLD (revision 14, approved with override 2026-10-25); s2 boundary and sc3 models.definitions."
- **[[c2]]** `step-output` `s1` — "LldContext analyze bundles: listModels/getCuratedCatalog callers, the registry, the method-class table, the bounded Ollama listing, the providers.listModels clients, existing tests."
- **[[c3]]** `code` `src/daemon/list-models.ts:83` — "  ollamaList: defaultOllamaList,"
- **[[c4]]** `code` `src/daemon/handler-runtime.ts:1430` — "'providers.listModels': (params) => listModels(params),"
- **[[c5]]** `code` `src/daemon/threads/method-class.ts:150` — "['providers.listModels', 'session', false],"
- **[[c6]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1130` — "// providers.listModels returns an OBJECT {provider,available,models} in the"
- **[[c7]]** `code` `src/agent/providers/ollama.ts:39` — "const OLLAMA_LIST_TIMEOUT_MS = 4_000;"
