<!-- insrc:artifact PLAN-ce99b72065d03b1b-s2 -->

# Plan: E20261025ce99b720:S002

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**LLD run:** `wf-1792943748771-a1ifrf`
**LLD effective hash:** `c324f041e3e7...`

Building s2 adds one module that turns the daemon's model registry into the models.definitions answer, registers that request, and rebuilds providers.listModels on top of the same answer so the two cannot disagree. The s1 stopgap accessor goes away, and a real-daemon test checks both requests over the socket.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the models.definitions projection and register the request | M | — | unit: model-definitions.test.ts: every sc3 field of a fixture file, aliases always a list, optional fields omitted; unit: model-definitions.test.ts: user-approved after shipped; unlisted rejected id only in rejectedModels; a rejected id the file lists is served as shipped and left out of rejectedModels; unit: model-definitions.test.ts: installed exact-match true/false, absent when the lister rejects, unlisted installed models absent; unit: handler-runtime, method-class and session-source-inventory suites pass with models.definitions registered | [[c1]] [[c3]] [[c6]] [[c7]] |
| 2 | **`t2`** Derive providers.listModels from the projection and remove the curated accessor | M | `t1` | unit: list-models.test.ts: CLI families from the projection without calling the lister; ollama installed-and-listed only; available:false + [] on a rejecting lister; invalid params unchanged; unit: list-models.test.ts: for every family listModels agrees with models.definitions, and an installed unlisted Ollama model appears in neither; unit: list-models.test.ts: no file under src imports getCuratedCatalog, CuratedCatalog or CatalogModel; unit: model-catalog, model-registry and session-source-inventory suites pass without the curated accessor | [[c2]] [[c4]] [[c5]] [[c7]] [[c9]] |
| 3 | **`t3`** Prove both requests over a real daemon socket | S | `t2` | integration: models-definitions-daemon.test.ts: a real daemon answers models.definitions with the three shipped families and providers.listModels('cli-claude') agrees with it | [[c8]] |

### 1.1 E20261025ce99b720:S002:T001 — Add the models.definitions projection and register the request

Add src/daemon/model-definitions.ts with the ModelDefinitionsResult type and modelDefinitions(deps): it projects getModelRegistry() and the validated file's version into the sc3 answer (registry order, aliases always a list, optional fields omitted, rejectedModels on CLI families limited to ids the family does not serve) and marks each listed Ollama model installed from one bounded listing call, omitting installed when the listing rejects. Register 'models.definitions' in buildHandlerRuntime, the method-class table (session) and handler-runtime.test.ts's RECORDED_RPC; refresh the source-inventory digests the edits trip and classify model-definitions.ts if it has boundary sites.

**Acceptance checks:**
- models.definitions returns every sc3 field of a fixture file, with aliases always a list and optional fields omitted
- A user-approved model follows the shipped ones with source 'user-approved'; an unlisted rejected id appears only in rejectedModels; a rejected id the file lists is served as shipped and left out of rejectedModels
- installed is exact-match true/false, absent on every Ollama model when the lister rejects, and an installed unlisted model does not appear
- method-class.test.ts and handler-runtime.test.ts pass with the new method
- session-source-inventory.test.ts passes, with model-definitions.ts classified if it has boundary sites

### 1.2 E20261025ce99b720:S002:T002 — Derive providers.listModels from the projection and remove the curated accessor

Change ListModelsDeps from catalog() to registry() and catalogVersion(); listModels keeps its request/result shape and takes its models from the projection: CLI families without calling the Ollama lister, Ollama as the listed-and-installed models, available:false + [] when the lister rejects. Remove getCuratedCatalog, CuratedCatalog, CatalogModel and CloudProvider from model-catalog.ts, update list-models, model-catalog and model-registry tests, and refresh the source-inventory digests of list-models.ts and model-catalog.ts.

**Acceptance checks:**
- For every family listModels(family).models equals the definitions answer's models for that family (ollama: installed === true) mapped to { id, displayName? }
- A CLI-family request never calls the Ollama lister; ollama returns available:false + [] when the lister rejects; invalid params return the unchanged error
- No file under src imports getCuratedCatalog, CuratedCatalog or CatalogModel
- session-source-inventory.test.ts passes

### 1.3 E20261025ce99b720:S002:T003 — Prove both requests over a real daemon socket

Add an integration test that starts the daemon in a temp home (startDaemon) and checks models.definitions returns the three shipped families and providers.listModels('cli-claude') agrees with it.

**Acceptance checks:**
- A real daemon answers models.definitions with cli-claude, cli-codex and ollama from the shipped asset
- providers.listModels('cli-claude') over the socket equals the cli-claude models of models.definitions

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| models.definitions projection in src/daemon/model-definitions.ts (new src/daemon/__tests__/model-definitions.test.ts): every sc3 field of a fixture file, aliases always a list, optional fields omitted, rejectedModels on CLI families only, user-approved models after shipped ones; a rejected id the file also lists is served as shipped and left out of rejectedModels | `t1` |
| installed state: exact-match true/false, absent on every Ollama model when the lister rejects, unlisted installed models absent | `t1` |
| listModels in src/daemon/list-models.ts (src/daemon/__tests__/list-models.test.ts, rewritten deps): CLI families from the projection without calling the lister; ollama installed-and-listed only; available:false + [] on a rejecting lister; invalid params unchanged | `t2` |
| agreement: for every family, listModels(family).models equals the definitions answer's models for that family (ollama: installed === true) mapped to { id, displayName? } | `t2` |
| handler map: 'models.definitions' is a real read-only handler in buildHandlerRuntime, 'providers.listModels' still delegates to listModels, and src/daemon/__tests__/handler-runtime.test.ts's RECORDED_RPC includes 'models.definitions' | `t1` |
| method-class: src/daemon/threads/__tests__/method-class.test.ts passes with ['models.definitions', 'session', false] (coverage equals handler keys; admin/indexing counts unchanged) | `t1` |
| source scan: no file under src imports getCuratedCatalog, CuratedCatalog or CatalogModel | `t2` |
| a daemon started in a temp home answers models.definitions with the three shipped families and providers.listModels('cli-claude') agreeing with it | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api models.definitions` — "'models.definitions': (params: unknown) => Promise<ModelDefinitionsResult>"
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails.api listModels` — "Builds its answer from the same projection models.definitions uses"
- **[[c3]]** `prior-artifact` `LLD s2 dataModelChanges ModelDefinitionsResult` — "The IPC answer type exactly as the HLD sc3 sketch"
- **[[c4]]** `prior-artifact` `LLD s2 dataModelChanges ListModelsDeps` — "The catalog() dependency is replaced by registry() and catalogVersion(); ollamaList() stays."
- **[[c5]]** `prior-artifact` `LLD s2 dataModelChanges curated catalog accessor` — "getCuratedCatalog, CuratedCatalog and CatalogModel are removed"
- **[[c6]]** `prior-artifact` `LLD s2 dataModelChanges method-class table` — "Adds ['models.definitions', 'session', false]"
- **[[c7]]** `prior-artifact` `LLD s2 errorPaths` — "Builds the answer without installed on any Ollama model and returns it as a success"
- **[[c8]]** `prior-artifact` `LLD s2 testStrategy` — "The real daemon answers models.definitions over its socket from the shipped asset."
- **[[c9]]** `prior-artifact` `LLD s2 migration` — "Switch listModels' deps from catalog() to registry() and catalogVersion()"
