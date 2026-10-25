<!-- insrc:artifact LLD-ce99b72065d03b1b-s3 -->

# LLD: E20261025ce99b720:S003

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**HLD base run:** `wf-1792924917927-2y1e5h`
**HLD effective hash:** `c324f041e3e7...`

This Story makes everything the daemon runs follow the definitions: tier defaults, the summariser, the tool-loop model, the effort passed to a CLI, the CLI kind, Codex's input budget and Ollama's context window all come from the model registry, and an effort a model does not accept is dropped with a warning. A repo keeps only its choice of tier per role and its core floor; reconcile removes per-repo tier overrides with a warning, and models.shaper.ollamaNumCtx goes. The settings catalog builds its model defaults and effort values from the shipped definitions (imported as JSON, so the TUI, updater and VS Code bundle keep working); config.write refuses a rejected model and says when a restart is needed; models.resolveRole tells a client what the daemon would run; installers read their defaults from the file; and the embedder reads local settings only on first use.

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
**Owns:** `sc5` (Settings rules and models.resolveRole)
**Consumes:** `sc1` (ModelDefinitionsFile (the curated catalog file, extended)), `sc2` (ModelRegistry and the approved-model store)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Extending the catalog file, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator in place; refreshing its contents with today's models, the aliases today's tier defaults use (opus, sonnet, haiku), the Ollama models insrc ships with and their context windows, and today's coreModel as the tool-loop default; the registry and its per-thread cache; moving the boot validation ahead of the settings reconcile and the worker threads; reading the approved-model store (a malformed store is logged and treated as empty); keeping the curated catalog's existing accessor answering providers.listModels from the new file shape until s2 replaces it. The validator refuses a missing or malformed file, an unknown, missing or repeated family, a CLI family without its CLI kind, tier defaults or summariser model, a model without an efforts list, a duplicate id or alias, a default that is not a model of its family, an Ollama model without a token input limit, and a tool-loop default that is not listed, naming the entry (ac3). Tests: one fixture per refusal reason (ac3); a model and alias added to a fixture are served after a restart with no code change (ac2); the file is validated before the settings reconcile, before any worker starts and before listen (ac1, k7); repeated requests in one thread return the same definitions even after the file changes on disk (ac1); a replacement worker started after the file, the store or config.json changed on disk uses the new values while a surviving thread keeps its own until the restart, and a thread whose first read comes after such a change likewise uses the new values; after a daemon restart every thread resolves the same definitions, approvals and tiers; providers.listModels still returns today's Claude and Codex models through the kept accessor; alias, effort and limit lookups; resolveTier distinguishes rejected-model from unlisted-model and falls back to the tier's family default, or the default family's for an Ollama tier. — owns `sc1`, `sc2`
- `s2`: The models.definitions handler and its method-class entry, the projection of the registry, each listed Ollama model's installed state from the existing bounded listing, and re-sourcing providers.listModels from the registry (for Ollama, listed models only), then removing the curated catalog accessor s1 kept. Tests: models.definitions returns every field of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); with Ollama not answering, installed is absent and the request still succeeds. — owns `sc3`
- `s4`: The per-family check procedures (Codex: the CLI's model list plus a run; Claude: a run, the input limit from the JSON output, recognised effort names), run one call at a time; telling a reachable CLI that refuses the model apart from an unreachable CLI; refusing approval unless the model ran without error; writing the store atomically and acknowledging a decision only once it is written; the method-class entries. Tests: checks against fake CLIs record each verdict and run one at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); after approval and a restart only the approved levels are accepted (ac3); a rejected profile or unreachable CLI refuses the model with a reason, and approving a check whose model did not run is refused (ac4); after a restart an approved model appears in models.definitions as user-approved and a rejected one among the rejected ids (ac5); a failed store write returns write-failed and keeps the previous store. — owns `sc4`
- `s5`: The TUI model-tiers pane and its effort choices from models.definitions, removing the temporary DEFAULT_TIERS and TIER_EFFORTS exports s3 kept; the unknown-model check and approval screen; the repo settings view limited to `tasks` and coreFloor; showing restartRequired and offering maintenance.restart; the review command using models.resolveRole and building its provider from the answer instead of reading config.json; Setup recommending the definitions' tool-loop default instead of DEFAULT_LOCAL_MODEL, and saying it cannot recommend when the daemon is not running. Tests: the pane offers exactly the options of a fake models.definitions answer and no source file still exports or imports DEFAULT_TIERS or TIER_EFFORTS (ac1); saving an unknown model starts the check and shows its results (ac2); the repo view edits only `tasks` and coreFloor (ac3); the review command runs the model a fake models.resolveRole returns for a CLI and an Ollama tier; Setup recommends the fake answer's tool-loop default.
- `s6`: The VS Code model-tier picker driven by models.definitions instead of its runner list and the bundled settings catalog's effort rows, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel without per-tier fields; showing restartRequired and offering insrc.daemon.restart. Tests: the picker offers exactly a fake answer's options and the bundle keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3).
- `s7`: The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing restartRequired. Tests: the section offers exactly a fake answer's options and the plugin keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3).

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `config.write`

```typescript
'config.write': (params: { path: string | string[]; value: unknown }) => Promise<ConfigWriteResult>  // ConfigWriteResult = { ok: true; restartRequired?: boolean } | { ok: false; reason?: 'invalid-path' | 'rejected-model'; detail?: string }
```

**Parameters:**
- `params: { path: string | string[]; value: unknown }` — Unchanged request.

**Returns:** `ConfigWriteResult` — ok:true, with restartRequired:true when any restart-sensitive setting (models.tiers, models.tasks, models.coreFloor, models.byRepo, models.local.coreModel) differs between the config before and the candidate after the write — so parent-object writes such as path 'models' or 'models.local' are covered; ok:false with reason 'invalid-path' (as today) or 'rejected-model' with a detail naming the model and family.

**Errors:**
- `ConfigWriteResult { ok: false, reason: 'rejected-model' }` when After applying the write to a candidate copy (before persisting), some tier whose runner or model the write changed — whether by a model leaf, a runner leaf, a whole-tier object or a parent object — names a model that is effectively rejected in that tier's family: in registry.rejected(family) and not resolved by registry.find(family, model) (a model the user rejected that a later shipped file lists is accepted, as resolution and models.definitions treat it). config.json is not written.
- `ConfigWriteResult { ok: false, reason: 'invalid-path' }` when Empty path or empty segment, as today.

**Preconditions:**
- The daemon has validated the definitions at boot.

**Postconditions:**
- A refused write leaves config.json unchanged.
- Other paths behave as today (settings-write safety is ISSUE-8dc75bc5, out of scope).

### 2.2 `models.resolveRole`

```typescript
'models.resolveRole': (params: { role: string; repoPath: string }) => Promise<RoleResolution | { error: string; recoverable: false }>  // RoleResolution as HLD sc5
```

**Parameters:**
- `params: { role: string; repoPath: string }` — The reasoning role and the repo whose `tasks`/coreFloor apply.

**Returns:** `RoleResolution` — The tier (after the repo's/global tasks and the core floor), family, canonical model id, the effort that will be passed, the model's inputLimit, the decision-A fallback (reason and requested model, taken from the per-tier resolution kept on the config) when one happened, cli.kind for a CLI family, and for ollama the host, numCtx (the model's token limit) and the global numPredict — exactly what the daemon's own router uses.

**Errors:**
- `{ error: 'invalid-params: ...', recoverable: false }` when role or repoPath missing or not a string.

**Preconditions:**
- Registered in buildHandlerRuntime and the method-class table as a session method.

**Postconditions:**
- Read-only; builds no provider and runs no model.

### 2.3 `resolveTier`

```typescript
resolveTier(tiering: TieringOverride, tier: TierName, registry?: ModelRegistry): TierModel  // src/config/analyze.ts; loadAnalyzeConfig(registry?: ModelRegistry) likewise; TierModel.effort is EffortLevel
```

**Parameters:**
- `tiering: TieringOverride` — The parsed GLOBAL tiering (tiers, efforts).
- `tier: TierName` — The tier to resolve.
- `registry: ModelRegistry` _(optional)_ — Defaults to getModelRegistry() (daemon threads). The two TUI callers that resolve tiers in the client process until s5 (src/cli/panes/model-tiers.ts computeEffectiveTiers and src/cli/services/workflow.ts reviewArtifact) pass shippedModelRegistry(), a registry built from the shipped JSON with an empty store, so a client never reads the user's store (k2).

**Returns:** `TierModel` — getModelRegistry().resolveTier(tier, configured-or-default setting) mapped to { runner: family, model: canonical id, effort? }; an unset tier (or '' model) uses the default family's tierDefault including its effort (ac1). An empty effort ('') is an explicit request for the CLI's own default. The full TierResolution (including fallback and droppedEffort) is kept per tier on AnalyzeConfig.tierResolutions so the router and models.resolveRole can report it.

**Preconditions:**
- In a daemon thread the default registry applies; in the TUI process the caller passes shippedModelRegistry() (temporary, removed by s5 when those callers move to models.definitions / models.resolveRole).

**Postconditions:**
- A droppedEffort logs a warning naming tier, model and effort and is never forwarded (ac2).
- A fallback logs tier, requested model, reason and the default used (decision A).

### 2.4 `resolveRole`

```typescript
resolveRole(role: RoleId, cfg: AnalyzeConfig, repoPath: string | undefined, deps?: RoleRouterDeps): RoleResolution  // src/analyze/context/role-router.ts; RoleRouterDeps gains registry?: ModelRegistry, passed by createRoleRouter(deps) into buildShaperProvider/buildSummariserProvider (ShaperProviderOverrides.registry)
```

**Parameters:**
- `repoPath: string | undefined` _(optional)_ — Selects the repo's `tasks` and coreFloor only.

**Returns:** `RoleResolution` — Tier from byRepo tasks → global tasks → taxonomy default, clamped by the core floor (byRepo ?? global); runner, model and effort only from the resolved global tier (ac4); no byRepo.tiers layer and no DEFAULT_TIERS fallback. It also carries the tier's fallback (reason, requested) from AnalyzeConfig.tierResolutions.

**Preconditions:**
- cfg comes from loadAnalyzeConfig (tiers already resolved through the registry).

**Postconditions:**
- The legacy per-repo shaper override (deps.repoOverride from resolveRepoShaperProvider) no longer exists; clientDefault and the explicit global runner keep their existing roles.
- The registry used for resolution and for provider construction is the one in deps (default getModelRegistry()); the TUI review command (src/cli/services/workflow.ts reviewArtifact) passes shippedModelRegistry() to both loadAnalyzeConfig and createRoleRouter, so nothing on its path reads the approved-model store.

### 2.5 `buildShaperProvider`

```typescript
buildShaperProvider(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): LLMProvider  // and buildSummariserProvider(cfg, registry?): LLMProvider; ShaperProviderOverrides gains registry?: ModelRegistry (default getModelRegistry())
```

**Parameters:**
- `cfg: AnalyzeConfig` — Resolved config.

**Returns:** `LLMProvider` — For a CLI family: CliProvider with kind = registry.cliKind(family), the canonical model, the effort only when the resolved model accepts it, and inputBudgetChars = the model's inputLimit.max when its unit is 'chars'. For ollama: OllamaProvider with num_ctx = the model's token inputLimit. The summariser uses registry.summariserModel(family) when the cheap tier's model is not a model of its family (replacing SUMMARISER_CLI_FALLBACK).

**Preconditions:**
- The registry comes from overrides.registry, else getModelRegistry() (daemon threads); the TUI review stopgap supplies shippedModelRegistry().

**Postconditions:**
- SUMMARISER_CLI_FALLBACK and the cli-claude/cli-codex → claude/codex literal mapping are gone; resolveShaperKind's final floor is the default family's tier runner rather than a literal.

### 2.6 `localToolLoopModel`

```typescript
localToolLoopModel(cfg: AnalyzeConfig): { model: string; numCtx: number }  // src/analyze/context/driver.ts
```

**Parameters:**
- `cfg: AnalyzeConfig` — Resolved config.

**Returns:** `{ model: string; numCtx: number }` — Keeps today's precedence: the cheap tier's resolved model when the cheap tier resolves to the ollama family; otherwise models.local.coreModel when the ollama family lists it; otherwise registry.toolLoopModel() (logged with the requested coreModel when one was set but is unlisted). numCtx is the chosen model's token inputLimit (replacing cfg.shaper.ollamaNumCtx).

**Preconditions:**
- Daemon thread.

**Postconditions:**
- No read of models.shaper.ollamaNumCtx anywhere.

### 2.7 `CONFIG_CATALOG`

```typescript
export const CONFIG_CATALOG: readonly ConfigOption[]  // = buildConfigCatalog(SHIPPED_DEFINITIONS); export function buildConfigCatalog(defs: ModelDefinitionsFile): readonly ConfigOption[]
```

**Returns:** `readonly ConfigOption[]` — Rows unchanged except: models.tiers.<tier>.runner default = defs.defaultFamily and enumValues = the family ids; models.tiers.<tier>.model default = that family's tierDefaults[tier].model; models.tiers.<tier>.effort enumValues = '' plus the de-duplicated efforts of the shipped models and default = the default family's tierDefaults[tier].effort ('' when the file sets none), so a definition-supplied default effort survives reconcile; models.local.coreModel default = the ollama toolLoopModel; models.shaper.ollamaNumCtx removed (and added to RETIRED_PATHS).

**Preconditions:**
- SHIPPED_DEFINITIONS is the shipped file imported as a JSON module (resolveJsonModule + `with { type: 'json' }`): tsc rejects a syntactically broken file at build and src/daemon/__tests__/model-catalog-asset.test.ts validates its structure, so a broken shipped file never builds or ships.

**Postconditions:**
- Two sources with separate roles: the imported shipped copy supplies display and fill-in defaults only, through a derivation that never throws (a missing field yields '' or no default), so evaluating CONFIG_CATALOG at module load — on the daemon's import chains index.ts → reconcile-io.ts → reconcile.ts and handler-runtime.ts → admin-handlers.ts → settings-catalog.ts — cannot fail before main(); every run-time decision in the daemon uses the validated registry.
- The daemon reconciles with buildConfigCatalog(validateModelCatalog()) (validated, test-seamed), after main() has validated; the TUI, the updater's loadBuiltCatalog and the VS Code bundle use CONFIG_CATALOG from the shipped JSON.

### 2.8 `reconcileConfig`

```typescript
reconcileConfig(config: unknown, catalog?: readonly ConfigOption[], retired?: readonly RetiredPath[]): ConfigReconcileResult
```

**Parameters:**
- `config: unknown` — Parsed config.json.

**Returns:** `ConfigReconcileResult` — As today, plus: every models.byRepo[repo].tiers subtree is removed and reported in `pruned` as models.byRepo["<repo>"].tiers.<tier> for each tier it held; tasks and coreFloor are kept; models.shaper.ollamaNumCtx is pruned as a retired path.

**Postconditions:**
- The boot reconcile logs one warning per removed per-repo tier naming repo and tier (ac5).

### 2.9 `CliProvider`

```typescript
new CliProvider(opts: { kind: 'claude' | 'codex'; model?: string; effort?: EffortLevel; inputBudgetChars?: number; timeoutMs?: number })
```

**Parameters:**
- `opts: CliProviderOptions` — kind and model from the registry; effort only when accepted; inputBudgetChars from the model's chars limit.

**Returns:** `CliProvider` — inputBudgetChars comes from opts instead of CODEX_INPUT_BUDGET_CHARS (removed); effort typed EffortLevel.

**Postconditions:**
- The family implementation keeps its own 'claude' | 'codex' flag mapping (it is the family implementation).

### 2.10 `EMBEDDING_MODEL`

```typescript
embeddingModel(): string; embeddingDim(): number  // src/indexer/embedder.ts: the module-load EMBEDDING_MODEL / EMBEDDING_DIM constants become first-use getters
```

**Returns:** `string | number` — loadLocalProviderConfig() is called on first use, not at module load (HLD override item 1); embedding values themselves are unchanged and out of scope (override item 3).

**Postconditions:**
- src/config/local.ts keeps its coreModel default, now taken from the shipped defaults (the same never-throwing derivation as the catalog), so OllamaProvider's parameterless construction (src/agent/providers/ollama.ts:205, used by src/daemon/model-definitions.ts defaultOllamaList for listing) is unchanged; the run-time tool-loop choice still checks coreModel against the validated registry (localToolLoopModel).
- Module-load local-settings reads that remain (the Lance tables' embeddingDim in src/db/lance/*-vec.ts and working-memory-bullets.ts) read only config.json and shipped defaults, never the registry or the validated file.
- The getter callers migrate: src/daemon/lifecycle.ts (the ONNX dimension check and its diagnostics) calls embeddingDim(), and IndexerService.reembed in src/indexer/index.ts calls embeddingModel(); embeddingKeepAlive is also read on first use.

## 3. Data model changes

### 3.1 `Settings catalog model rows (src/config/config-catalog.ts)` — field-modify

Tier runner/model defaults, effort enumValues and the local coreModel default come from the definitions; models.shaper.ollamaNumCtx leaves the catalog and joins RETIRED_PATHS. A new src/config/model-defaults.ts imports the shipped JSON and derives these values, used by the settings catalog, src/config/local.ts (coreModel default, kept) and the temporary DEFAULT_TIERS/TIER_EFFORTS exports in src/config/analyze.ts, which only src/cli may import (s5 removes them). tsconfig gains resolveJsonModule. The derivation never throws: a missing field yields '' or no default. model-defaults.ts also exports shippedModelRegistry() = buildModelRegistry(SHIPPED_DEFINITIONS, []) for the two TUI resolution callers until s5; src/daemon/model-registry.ts gains an exported pure buildModelRegistry(file, profiles) (the existing internal builder; the ModelRegistry interface is unchanged).

```
- models.tiers.core.model default ''  + default = defaultFamily tierDefaults.core.model ('opus' today)
- effort enumValues ['', low..max]  + ['', ...shipped efforts] (adds 'ultra')
- models.shaper.ollamaNumCtx row  + RETIRED_PATHS { path: 'models.shaper.ollamaNumCtx' }
- effort default ''  + default = tierDefaults[tier].effort ?? ''
~ local.ts DEFAULTS.coreModel from shipped defaults
+ shippedModelRegistry() (TUI stopgap until s5)
```

**Call sites:**
- `src/config/config-catalog.ts:113`
- `src/config/config-catalog.ts:120`
- `src/config/config-catalog.ts:130`
- `src/config/config-catalog.ts:142`
- `src/config/config-catalog.ts:158`
- `src/config/local.ts:53`
- `src/cli/panes/model-tiers.ts:19`
- `vscode-plugin/src/config/key-map.ts:12`
- `src/cli/services/maintenance.ts:189`
- `src/daemon/lifecycle.ts:152`
- `src/indexer/index.ts:1021`
- `src/cli/panes/model-tiers.ts:63`
- `src/cli/services/workflow.ts:253`
- `src/agent/providers/ollama.ts:205`

### 3.2 `Tiering config (src/config/analyze.ts)` — field-modify

TierEffort becomes EffortLevel (any non-empty string; acceptance is decided per model by the registry); TieringOverride under byRepo carries only roleTiers and coreFloor; AnalyzeShaperProviderKind becomes FamilyId; readRepoOverride, resolveRepoShaperProvider, resolveRepoShaperModel and RepoShaperOverride are removed with their callers in src/daemon/code-review-rpc.ts and src/daemon/workflow-rpc.ts; DEFAULT_SHAPER.ollamaNumCtx goes. AnalyzeConfig gains tierResolutions: Record<TierName, TierResolution> (the registry's per-tier result, with fallback and droppedEffort).

```
- AnalyzeTiering.byRepo[repo].tiers
- AnalyzeShaperConfig.ollamaNumCtx
- resolveRepoShaperProvider / resolveRepoShaperModel
~ TierEffort = EffortLevel
+ AnalyzeConfig.tierResolutions
```

**Call sites:**
- `src/config/analyze.ts:115`
- `src/config/analyze.ts:222`
- `src/config/analyze.ts:416`
- `src/config/analyze.ts:445`
- `src/daemon/code-review-rpc.ts:194`
- `src/daemon/workflow-rpc.ts:422`
- `src/analyze/context/role-router.ts:138`

### 3.3 `Shipped definitions data (src/assets/models/cloud-model-catalog.json)` — field-add

Each Codex model gains inputLimit { unit: 'chars', max: 1048576 }, keeping today's Codex budget now that CODEX_INPUT_BUDGET_CHARS is removed. Data only; the sc1 format is unchanged.

```
+ families[cli-codex].models[*].inputLimit = { unit: 'chars', max: 1048576 }
```

**Call sites:**
- `src/agent/providers/cli-provider.ts:181`
- `src/agent/providers/cli-provider.ts:204`

### 3.4 `Runner → CLI-kind and client → runner mappings` — invariant-change

Runner/CLI-kind mappings and literal defaults outside the family implementations are replaced, with client processes kept off the registry (k2): (a) the MCP server (src/mcp/server.ts, a standalone process) and src/shared/step-context.ts keep detecting the client's identity ('claude' | 'codex', the client's name, not a model definition) and forward only that over step.call, as today; the daemon maps a client identity to the family whose cliKind equals it via the registry (src/daemon/steps/host.ts, src/daemon/code-review-rpc.ts, src/daemon/workflow-rpc.ts); (b) provider construction takes registry.cliKind(family) (src/analyze/context/shaper-provider.ts, src/daemon/steps/build-step/phases/validate.ts, whose fallback becomes the default family's CLI); (c) attribution (src/workflow/attribution.ts) decodes a run label by family metadata from the shipped definitions before any model lookup: a label equal to a CLI family's cliKind or starting with it (claude, codex, codex:<model>) maps to that family, a label equal to a family id or prefixed '<familyId>:' (ollama, ollama:<model>) maps to that family even when the model is no longer listed, else a model id/alias lookup across families, else the default family ('client' included) — historical labels keep their family; (d) the claude.models static fallback list becomes the Claude-kind family's models (src/daemon/handler-runtime.ts:1244). Type unions take FamilyId from src/daemon/model-catalog.ts.

```
~ runner/kind literals → registry lookups; unions → FamilyId
```

**Call sites:**
- `src/mcp/server.ts:1367`
- `src/shared/step-context.ts:154`
- `src/daemon/steps/host.ts:86`
- `src/daemon/code-review-rpc.ts:193`
- `src/daemon/workflow-rpc.ts:419`
- `src/daemon/steps/build-step/phases/validate.ts:193`
- `src/workflow/attribution.ts:35`
- `src/daemon/handler-runtime.ts:1244`
- `src/workflow/types.ts:285`

### 3.5 `Installer tier and coreModel block (scripts/insrc-daemon-install.sh and vscode-plugin/assets/insrc-daemon-install.sh)` — field-modify

Step 4b reads the chosen family's tierDefaults and the ollama toolLoopModel from "$INSTALL_ROOT"/src/assets/models/cloud-model-catalog.json with node (cloned and built in steps 2-3) instead of literals; both copies stay identical.

```
- literal opus/sonnet/haiku, gpt-6-*, qwen3.6:27b
+ node -e reading the definitions file
```

**Call sites:**
- `scripts/insrc-daemon-install.sh:275`
- `scripts/insrc-daemon-install.sh:324`
- `vscode-plugin/assets/insrc-daemon-install.sh`

### 3.6 `Method-class table (src/daemon/threads/method-class.ts)` — field-add

Adds ['models.resolveRole', 'session', false]; handler-runtime.test.ts RECORDED_RPC gains it.

```
+ ['models.resolveRole', 'session', false]
```

**Call sites:**
- `src/daemon/threads/__tests__/method-class.test.ts`
- `src/daemon/__tests__/handler-runtime.test.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | Owns the settings rules (catalog defaults and efforts from the definitions, per-repo tier removal, ollamaNumCtx pruning, config.write refusal and restartRequired) and models.resolveRole. |
| `sc2` | consumes | resolveTier, find, cliKind, summariserModel, toolLoopModel, rejected, defaultFamily, models; no registry change. |
| `sc1` | consumes | The shipped file is imported as JSON for catalog/installer defaults and validated by the daemon at boot; s3 adds Codex chars limits as data. |

## 5. Error paths

**Error cases**

- **A tier is set to an effort its model does not accept (for example 'ultra' on gpt-6-luna, or any effort on an Ollama model).** (recoverable)
  - Detection: getModelRegistry().resolveTier returns droppedEffort when loadAnalyzeConfig resolves the tier.
  - Response: Logs a warning naming tier, model and effort once per thread (when the config is assembled) and builds the provider without an effort.
  - User impact: The CLI runs at its own default effort; the log says why (ac2).
- **A tier is set to a model its family neither lists nor has approved, or one the user rejected.** (recoverable)
  - Detection: resolveTier returns fallback { reason: 'unlisted-model' | 'rejected-model', requested }.
  - Response: Logs a warning naming tier, requested model, reason and the default used, and runs the tier default (decision A).
  - User impact: Work continues on the default model; the setting is left as written for the user to fix.
- **models.local.coreModel names an Ollama model the definitions do not list.** (recoverable)
  - Detection: In localToolLoopModel, when the cheap tier does not resolve to ollama, registry.find('ollama', coreModel) returns undefined.
  - Response: Uses registry.toolLoopModel() and logs a warning naming both models.
  - User impact: The tool loop runs on the listed default.
- **config.write sets models.tiers.<tier>.model to a model the user rejected.** (recoverable)
  - Detection: The handler resolves the tier's runner after the write and checks registry.rejected(family).includes(value).
  - Response: Returns { ok:false, reason:'rejected-model', detail } and leaves config.json untouched.
  - User impact: The client shows the refusal (s5-s7 render it).
- **models.resolveRole is called without a string role or repoPath.** (terminal)
  - Detection: Parameter check at the top of the handler.
  - Response: Returns { error: 'invalid-params: ...', recoverable: false }.
  - User impact: The caller gets the standard error envelope.
- **The installer cannot read the definitions file (missing or not JSON) in step 4b.** (terminal)
  - Detection: The node -e reader exits non-zero.
  - Response: The installer stops with an error naming the file (the build in step 3 would already have failed for a broken file).
  - User impact: Installation does not write a config with guessed models.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tier with no model set in config.json. | Resolves to the default family's tierDefault for that tier, with that default's effort (ac1). |
| A tier set by alias (opus). | Resolves to the canonical model (claude-opus-5-5); provider gets the canonical id. |
| A repo with tasks { 'design.lld': 'cheap' } and an old byRepo tiers.cheap { cli-codex, gpt-6-luna }. | Reconcile removes byRepo tiers with a warning naming repo and tier; the role runs on the GLOBAL cheap tier's runner and model (ac4, ac5). |
| config.json still has models.shaper.ollamaNumCtx. | Pruned by reconcile as a retired path; no code reads it. |
| A config whose tiers.core.model is '' (today's default). | Treated as unset: resolves to the definitions' core default. |
| An effort the user's approved model accepts but no shipped model lists. | Accepted at resolution (the registry includes approved efforts); the catalog's effort enum (shipped efforts only) does not limit config.write, which does not enum-check. |
| The cheap tier runs on ollama. | The summariser builds an OllamaProvider with num_ctx from the model's token inputLimit. |
| A haiku tier (token inputLimit). | CliProvider gets no inputBudgetChars (only a 'chars' limit sets it), as today. |
| A definitions file whose tier default carries an effort, and a fresh config.json. | Reconcile writes that effort as the tier's effort default; resolution passes it to the CLI. An explicit '' still means the CLI's own default. |
| The cheap tier set to an Ollama model different from models.local.coreModel. | The tool loop runs the cheap tier's model (today's precedence), with that model's token limit as num_ctx. |
| A tier set to an unlisted model that falls back to a default the tier would also get when unset. | models.resolveRole still reports fallback { reason, requested }, kept from the per-tier resolution. |
| config.write sets a whole tier object { runner, model } to a rejected model, or switches a tier's runner to a family that rejected its model. | Refused with reason 'rejected-model'; config.json unchanged. |
| config.write sets a tier to a model the user rejected that a later shipped file lists (by id or alias). | Accepted, as resolution serves it as shipped. |
| The daemon starts with INSRC_MODEL_CATALOG_DIR pointing at a missing, malformed or structurally invalid file. | All modules import (the shipped JSON is what the import reads); main() refuses with ModelCatalogValidationError naming the entry before reconcile. |
| An artifact attributed with a historical label 'codex', 'codex:gpt-6-astra' or 'ollama:qwen3.6:35b-a3b' (no longer listed). | Attributed to cli-codex, cli-codex and ollama respectively; the raw label stays as the model. |
| config.write with path 'models' or 'models.local' replacing the whole object. | restartRequired:true when any restart-sensitive setting changed; the rejected-model check runs over the candidate's tiers. |
| The standalone MCP server forwards a step from a Codex client. | It sends client 'codex' without reading definitions; the daemon maps it to the family whose cliKind is codex. |

**Invariants to preserve**

- loadAnalyzeConfig stays per-thread cached and fail-soft: a malformed config.json still yields defaults with a warning, now the definitions' defaults. [[c3]]
- The role router keeps its precedence for the tier (byRepo tasks → global tasks → taxonomy) and the core-floor clamp (byRepo coreFloor ?? global), and keeps the global tier's effort for every routed role. [[c4]]
- CliProvider forwards an effort exactly as today: claude --effort <e>, codex -c model_reasoning_effort=<e>; no effort when none is set. [[c5]]
- Every process that loads the settings catalog (daemon reconcile, TUI, updater via loadBuiltCatalog, VS Code bundle) keeps loading it. [[c6]]
- Reconcile keeps models.tasks, models.coreFloor and each byRepo entry's tasks and coreFloor, and still reports changes in carried/filled/repaired/pruned. [[c7]]

## 6. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), as src/config/__tests__/tier-defaults.test.ts, src/daemon/__tests__/config-boot-reconcile.test.ts and src/agent/providers/__tests__/cli-subprocess.test.ts`

**Test levels**

- **unit** — Tier resolution, routing, provider construction, settings catalog and reconcile against fixture definitions.
  - Subjects: `tier resolution (src/config/analyze.ts): an unset tier resolves to the fixture definitions' default with its effort; a fixture with non-empty default efforts keeps them through reconcile → parse → resolution; '' effort means the CLI default; a tier set by alias resolves to the canonical model; '' model is unset`, `effort: a tier whose model does not accept its effort resolves without it and logs a warning naming tier, model and effort; the built CliProvider gets no effort`, `decision A: an unlisted and a rejected model fall back to the tier default with a warning naming tier, requested model, reason and default`, `role router (src/analyze/context/role-router.ts): a repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps`, `provider construction: CLI kind from registry.cliKind; Codex inputBudgetChars from the model's chars limit; haiku gets none; an Ollama tier's num_ctx is the fixture model's token limit; the summariser uses the family's summariserModel when the cheap model is not of its family`, `tool loop: an ollama cheap tier's model wins (today's precedence); else a listed coreModel; else registry.toolLoopModel() with a warning naming the requested coreModel; num_ctx is the chosen model's token limit`, `settings catalog: buildConfigCatalog(fixture) gives tier runner/model defaults, effort enum values and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog`, `reconcile: with a fixture whose defaults differ from today's, a fresh config is filled with the fixture's values; byRepo tiers are removed and reported per repo and tier, tasks and coreFloor kept; models.shaper.ollamaNumCtx pruned`, `config.write: refusal for a rejected model via a model leaf, a runner switch, a whole-tier object and a parent object ('models'), with config.json unchanged; acceptance of a formerly rejected model the file now lists (by id and alias); restartRequired:true when a restart-sensitive setting changes, including parent-object writes to 'models' and 'models.local'; none for an unrelated write`, `models.resolveRole: for a CLI tier and an Ollama tier the answer equals the router's resolution and the provider settings the daemon builds; for an unlisted and a rejected tier model it reports fallback with reason and requested model; bad params give the invalid-params error`, `embedder: importing src/indexer/embedder.ts does not call loadLocalProviderConfig; the first getter call does; src/daemon/lifecycle.ts and IndexerService.reembed use the getters`, `TUI stopgap: computeEffectiveTiers and reviewArtifact end-to-end (loadAnalyzeConfig, createRoleRouter and provider construction) with getModelRegistry stubbed to throw and the store path pointing at a file that fails if read: both succeed through shippedModelRegistry() and the pane shows the definitions' defaults`, `attribution: 'claude', 'client', 'codex', 'codex:<model>', 'ollama', 'ollama:<listed>' and 'ollama:<unlisted>' labels map to their historical families (src/workflow/__tests__/attribution.test.ts extended)`, `client identity: the daemon maps step.call client 'claude' / 'codex' to the family with that cliKind; the MCP server's client detection does not import the registry or model-defaults`
  - Fixtures: `Fixture definitions with defaults differing from today's (via INSRC_MODEL_CATALOG_DIR / _setModelCatalogDirForTests), a model without some effort, a Codex chars limit and two Ollama models with different token limits`, `An approved-model store with one rejected model (_setApprovedModelsPathForTests)`, `A temp HOME/config.json with byRepo tiers, tasks and coreFloor, and models.shaper.ollamaNumCtx`
- **contract** — No literals or retired settings remain where the Story removes them; the RPC tables stay in step.
  - Subjects: `source scan over daemon code (src/** non-test, excluding src/cli/** which s5 migrates, src/shared/model-recommender.ts DEFAULT_LOCAL_MODEL which s5 replaces, and embedding-model literals per override item 3): fails on a model-name literal outside the definitions file, on 'cli-claude'/'cli-codex' literals outside src/daemon/model-catalog.ts, src/daemon/model-registry.ts and the family implementations, on runner 'ollama' literals outside an allow-list of non-runner uses, on any read of ollamaNumCtx, and on any import of DEFAULT_TIERS or TIER_EFFORTS outside src/cli; each exclusion names its owning Story`, `method-class and handler-runtime pins include models.resolveRole`, `installers: both copies are identical and contain no tier-model or tool-loop model literal (embedding-model choices are excluded, override item 3); step 4b reads tier defaults and the tool-loop model from the definitions file (dry run against a temp checkout)`, `src/cli/** does not import getModelRegistry`, `JetBrains: ModelTiersModelTest shows an unset tier with the default family's values from a catalog fixture produced by buildConfigCatalog over definitions whose default family and tier defaults differ from today's; a TS test asserts the checked-in Kotlin fixture equals buildConfigCatalog(that fixture) so they cannot drift`, `VS Code: the extension bundle (vscode-plugin/esbuild.mjs, CJS node20) builds with the JSON-backed catalog and, loaded in node, key-map's catalog defaults equal buildConfigCatalog(shipped)`, `src/mcp/** and src/cli/** do not import getModelRegistry (clients stay off the store, k2)`
- **integration** — A real daemon resolves from the file and the cold-import order holds.
  - Subjects: `cold daemon import through both catalog chains (index.ts → reconcile-io.ts → reconcile.ts, handler-runtime.ts → admin-handlers.ts → settings-catalog.ts), instrumented, with INSRC_MODEL_CATALOG_DIR pointing at a valid, a missing, a malformed and a structurally invalid file: every module imports, the registry and validated file are first read in main(), and an invalid file stops the daemon with ModelCatalogValidationError naming the entry before reconcile`, `a daemon in a temp home with byRepo tiers in config.json removes them at boot with the warnings, and models.resolveRole over the socket returns the global tier's model for a repo whose tasks pick that tier`, `the TUI build (tsc) passes and its model-tiers pane shows the definitions' defaults`
  - Fixtures: `The startDaemon helper (src/mcp/__tests__/helpers/mcp-e2e.ts) with INSRC_MODE=mcp for stderr`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: an unset tier resolves to the fixture definitions' default`, `unit: reconcile fills a fresh config with a fixture's differing defaults`, `unit: buildConfigCatalog(fixture) defaults come from the fixture`, `unit: a fixture's non-empty default efforts survive reconcile → parse → resolution` |
| `ac2` | `unit: an unaccepted effort is dropped with a warning naming tier, model and effort and the CliProvider gets no effort` |
| `ac3` | `contract: the source scan finds no runner or model literal outside the allowed files, no ollamaNumCtx read and no daemon import of DEFAULT_TIERS/TIER_EFFORTS`, `unit: provider construction takes the CLI kind, budget and num_ctx from the registry` |
| `ac4` | `unit: a repo's tasks choice picks the tier while runner, model and effort come from the global tier`, `integration: models.resolveRole over the socket returns the global tier's model for a repo-chosen tier` |
| `ac5` | `unit: reconcile removes byRepo tiers, reports each repo and tier, keeps tasks and coreFloor`, `integration: a daemon boot with byRepo tiers logs the warnings and rewrites config.json without them` |

## 7. Migration

**State before:** Tier defaults are literals (DEFAULT_TIERS cli-claude opus/sonnet/haiku, src/config/analyze.ts:134) and resolution never consults the definitions (src/config/analyze.ts:252); efforts are limited to TIER_EFFORTS and forwarded unchecked (src/agent/providers/cli-provider.ts:530); per-repo tiers override global tiers in the router (src/analyze/context/role-router.ts:138) and as a fresh per-repo shaper override (src/daemon/code-review-rpc.ts:194, src/daemon/workflow-rpc.ts:422); the summariser falls back to literal CLI models (src/analyze/context/shaper-provider.ts:271); Codex's budget is CODEX_INPUT_BUDGET_CHARS (src/agent/providers/cli-provider.ts:181); Ollama runs at models.shaper.ollamaNumCtx (src/config/analyze.ts:222) and the tool loop at local.coreModel unchecked (src/analyze/context/driver.ts:1106); the settings catalog and both installers hold model literals (src/config/config-catalog.ts:113-142, scripts/insrc-daemon-install.sh:275-324); the embedder reads local settings at module load (src/indexer/embedder.ts:16).

**State after:** Every daemon model choice resolves through the registry: tier defaults, efforts (unaccepted ones dropped with a warning), decision-A fallbacks, CLI kind, Codex budget (from the file's chars limit), Ollama num_ctx (from the model's token limit), the summariser and the tool-loop model. A repo chooses only its tier per role and core floor. The settings catalog builds its model defaults and effort values from the shipped JSON; reconcile removes per-repo tiers and ollamaNumCtx with warnings; config.write refuses rejected models and reports restartRequired; models.resolveRole answers what the daemon would run; installers read defaults from the file; the embedder reads settings on first use. DEFAULT_TIERS/TIER_EFFORTS remain only as JSON-derived exports for the TUI pane until s5.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Enable resolveJsonModule; add src/config/model-defaults.ts deriving tier defaults, efforts and the tool-loop model from the shipped JSON; add the Codex chars inputLimit to the definitions file. — ↩ rollbackable
2. Build the settings catalog's model rows from the definitions (buildConfigCatalog), retire models.shaper.ollamaNumCtx, make reconcile prune byRepo tiers with per-repo/tier warnings and reconcile from the validated file in the daemon. — ✕ non-rollbackable
3. Resolve tiers through the registry in loadAnalyzeConfig (dropped-effort and fallback warnings); effort type becomes EffortLevel; byRepo parsing keeps tasks and coreFloor; remove readRepoOverride and resolveRepoShaperProvider/Model and their callers; derive DEFAULT_TIERS/TIER_EFFORTS from the JSON for the TUI. AnalyzeConfig keeps each tier's TierResolution (fallback, droppedEffort) for the router and models.resolveRole. — ↩ rollbackable
4. Route provider construction through the registry: CLI kind, effort acceptance, inputBudgetChars from the model's chars limit (remove CODEX_INPUT_BUDGET_CHARS), Ollama num_ctx from the model's token limit, the summariser from registry.summariserModel (remove SUMMARISER_CLI_FALLBACK), the tool loop keeping today's precedence (an ollama cheap tier's model, else a listed coreModel, else registry.toolLoopModel()). — ↩ rollbackable
5. Replace the remaining runner/CLI-kind literals and mappings: the daemon maps forwarded client identities to families via the registry (step host, code-review and workflow RPCs) while the MCP server keeps sending only the client identity; provider construction and build-step validation use registry.cliKind; attribution decodes labels by shipped family metadata before model lookup; the claude.models fallback uses the Claude-kind family's models; unions take FamilyId. — ↩ rollbackable
6. config.write: rejection check and restartRequired computed on the candidate config against the current one; models.resolveRole handler, method-class entry and RECORDED_RPC; the role router and provider factories take an injectable registry. — ↩ rollbackable
7. Embedder settings (model, dim, keepAlive) read on first use, with src/daemon/lifecycle.ts and IndexerService.reembed migrated to the getters; local.ts takes its coreModel default from the shipped defaults; the two TUI resolution callers pass shippedModelRegistry(); both installers read tier defaults and the tool-loop model from the cloned definitions file. — ↩ rollbackable
8. Tests: resolution, routing, providers, catalog, reconcile, config.write, resolveRole, cold import, and the source-literal scan. — ↩ rollbackable

**Backward compat:** Existing tier settings keep working: aliases and listed ids resolve as before, and an unlisted model now falls back to the tier default with a warning instead of being passed to the CLI (decision A). Per-repo tier overrides stop applying and are removed from config.json at the next boot (not restorable by rollback; a warning names each repo and tier); per-repo tasks and coreFloor are kept. models.shaper.ollamaNumCtx is removed; Ollama now runs at each model's own context window (qwen3.6:27b: 32768, the same value). An empty core model ('' today) now resolves to the definitions' core default (opus), the model the claude CLI chose by default. config.write's result gains optional fields (restartRequired, reason, detail), so existing clients that read only ok keep working; models.resolveRole is new. The settings catalog keeps every row except ollamaNumCtx; its effort enum gains 'ultra'. resolveRepoShaperProvider/resolveRepoShaperModel were internal to the daemon. A tier default effort set in the definitions is written into config.json by reconcile like the other defaults. Until s5 the TUI's model-tiers pane and review command resolve tiers from the shipped definitions (not the user's approved models); s5 moves them to the daemon's answers. Historical attribution labels keep their families. The MCP server's forwarded request is unchanged.

## 8. Alternatives considered

### 8.1 a1: Catalog built from the definitions by a JSON import; daemon resolution through the registry — **CHOSEN**

config-catalog.ts builds its model rows from the shipped definitions imported as JSON (works in daemon, TUI, updater and the VS Code bundle); every daemon consumer resolves through getModelRegistry().

Settings catalog: src/config/config-catalog.ts imports the shipped definitions file as a JSON module (import attributes, resolveJsonModule) and exports buildConfigCatalog(defs) plus CONFIG_CATALOG = buildConfigCatalog(shipped). The tier runner default is defaultFamily, each tier model default is that family's tierDefaults[tier].model, the effort enum is '' plus the efforts of the shipped models, and models.local.coreModel defaults to the Ollama toolLoopModel; models.shaper.ollamaNumCtx leaves the catalog and joins RETIRED_PATHS. tsc emits and copy-assets ships the JSON beside out/config, so the updater's import of out/config/config-catalog.js and the esbuild VS Code bundle both resolve it; the daemon's reconcile uses buildConfigCatalog(validateModelCatalog()) so the validated (and test-seamed) file is the one reconciled. Resolution: loadAnalyzeConfig resolves each global tier with getModelRegistry().resolveTier and logs droppedEffort and fallback (decision A); TierModel.effort becomes EffortLevel; byRepo parsing keeps only tasks and coreFloor; the role router takes the tier from byRepo/global tasks and the model only from the global tiers; buildShaperProvider/buildSummariserProvider take the CLI kind from registry.cliKind, CliProvider takes its input budget and accepted effort from the resolved model, OllamaProvider its num_ctx from the model's inputLimit, the tool-loop model from the configured coreModel when listed or registry.toolLoopModel() with a warning; readRepoOverride and resolveRepoShaperProvider/Model go. Reconcile removes models.byRepo[repo].tiers with a warning naming repo and tier. config.write refuses a tier model in registry.rejected and returns restartRequired for models.tiers/models.local paths. models.resolveRole wraps the router's pure resolution. DEFAULT_TIERS/TIER_EFFORTS are derived from the shipped JSON for the TUI only. The embedder reads local settings on first use. Installers read tier and tool-loop defaults from the cloned file with node.

### 8.2 a2: Catalog reads the file from a path beside the module

config-catalog.ts reads the definitions with readFileSync from a path relative to import.meta.url at module load; resolution as in a1.

Same resolution and settings changes as a1, but CONFIG_CATALOG's model rows come from reading out/assets/models (or src/assets/models under tsx) relative to the module file at load time.

**Rejected because:** Same resolution as a1 but violates sc5 by breaking the VS Code bundle's catalog.

### 8.3 a3: Code defaults patched at daemon boot

The catalog keeps literal defaults and the daemon overwrites them from the registry at boot.

CONFIG_CATALOG keeps its current rows; after validateModelCatalog the daemon mutates the model rows' defaults from the registry before reconcile. Resolution as in a1.

**Rejected because:** Violates ac3, sc5 and k4.

## 9. References

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "Approved HLD (revision 14, approved with override 2026-10-25); s3 boundary and sc5."
- **[[c2]]** `step-output` `s1` — "LldContext analyze bundles: tier resolution, routing, providers, settings catalog and loaders, literal inventory, embedder and installers, tests."
- **[[c3]]** `code` `src/config/analyze.ts:288` — "if (cached !== undefined) {"
- **[[c4]]** `code` `src/analyze/context/role-router.ts:138` — "const configuredTier: TierModel | undefined = byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier];"
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts:530` — "return [...modelArgs, ...(this.kind === 'claude' ? ['--effort', this.effort] : ['-c', `model_reasoning_effort=${this.effort}`])];"
- **[[c6]]** `code` `src/cli/services/maintenance.ts:189` — "const builtCatalogPath = join(root, 'out', 'config', 'config-catalog.js');"
- **[[c7]]** `code` `src/config/reconcile.ts:328` — "export function reconcileConfig("
- **[[c8]]** `code` `src/indexer/embedder.ts:16` — "const _localDefaults = loadLocalProviderConfig();"
- **[[c9]]** `stakeholder` `HLD-ce99b72065d03b1b approval override 2026-10-25` — "(1) s3: the embedder's module-load read of local settings (src/indexer/embedder.ts:16) becomes a first-use read so definition-derived defaults are validated first; test a cold daemon import with valid"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 1 could not be verified · 6 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-25T18:08:40.392Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | Passing shippedModelRegistry only to loadAnalyzeConfig/resolveTier is sufficient to keep the temporary TUI review path from reading the user's approved-model store. | reviewArtifact constructs createRoleRouter({}) and calls router.resolveProviderForRole. role-router.ts then materializes through buildShaperProvider. The proposed factory independently needs registry.cliKind and model limits, but its specified signature and ShaperProviderOverrides provide no registry dependency. The LLD marks that factory 'Daemon thread' despite this live client caller. Consequently the config-only injection does not cover provider construction; using getModelRegistry there reaches "buildRegistry(validateModelCatalog(), readStore(storePath()))" in the TUI process. [files: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S003/LLD.md, src/cli/services/workflow.ts, src/analyze/context/role-router.ts, src/analyze/context/shaper-provider.ts, src/daemon/model-registry.ts] | Specify registry injection through the complete router/materialization path, or move this caller to daemon resolution earlier. Test reviewArtifact end-to-end with getModelRegistry/store access forbidden, rather than checking only direct CLI imports. |
| data-compatibility | HIGH | Replacing attribution's label mappings with registry.find and a default-family fallback preserves historical model attribution. | attribution.ts deliberately accepts transport-qualified and transport-only historical labels: "label === 'codex' \|\| label.startsWith('codex')" selects cli-codex, and "label.startsWith('ollama:')" preserves Ollama attribution. workflow-rpc.ts emits labels such as 'codex' and 'codex:<model>'. Registry.find performs only exact id/alias matching; these labels are not model ids. The proposed default-family fallback would therefore reclassify known historical labels, including 'codex' under today's cli-claude default. Existing attribution tests also require an unlisted historical 'ollama:qwen3.6:35b-a3b' label to remain Ollama. [files: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S003/LLD.md, src/workflow/attribution.ts, src/workflow/__tests__/attribution.test.ts, src/daemon/workflow-rpc.ts, src/daemon/model-registry.ts] | Define backward-compatible decoding of transport-only and qualified labels using family/cliKind metadata before model lookup. Preserve explicitly identified historical families even when their models are no longer listed, and add regression tests for these forms. |
| boundaries | MED | The proposed registry-based mappings in the MCP server respect the daemon-owned definitions boundary. | DEF k2 explicitly says 'the CLI, MCP server and IDE plugins reach them only over daemon IPC'. src/bin/insrc-mcp.ts starts server.ts as a standalone process. Its forward function currently computes stepClientOf(detectClientProvider(...)) and sends only the client identity over step.call. LLD §3.4 replaces both client/runner mappings with registry lookups inside these client-side modules, without an IPC-sourced definitions dependency. getModelRegistry reads the definitions and approval store locally, violating this shared contract. [files: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S003/LLD.md, src/bin/insrc-mcp.ts, src/mcp/server.ts, src/shared/step-context.ts, src/daemon/model-registry.ts] | Keep client identity detection independent of model definitions and resolve its family inside the daemon, or explicitly source the needed metadata over IPC. Cover standalone MCP forwarding with local registry/store reads forbidden. |
| error-paths | MED | The specified path-based restartRequired rule covers every supported write that changes model resolution. | setConfigAtPath permits replacing parent objects, including path='models' and path='models.local'. LLD §2.1 acknowledges parent-object writes for rejection checking, but reports restartRequired only for paths under models.tiers/tasks/coreFloor/byRepo or exactly models.local.coreModel. Writing models can change every cached tier, and writing models.local can change coreModel, while neither parent matches that rule. loadAnalyzeConfig and loadLocalProviderConfig both retain process-local caches. [files: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S003/LLD.md, src/config/write-path.ts, src/daemon/handler-runtime.ts, src/config/analyze.ts, src/config/local.ts] | Base restartRequired on affected settings before/after the candidate write, or include ancestors of restart-sensitive paths. Add parent-object tests for models and models.local. |
| tests | MED | The test strategy covers the upstream requirement to preserve settings-catalog consumption across existing clients. | HLD §6.3 explicitly requires that 'an unset JetBrains tier still shows the default family's values'; its risk table also requires the catalog mechanism to work in the VS Code bundle. The LLD tests the updater loader and TUI tsc, but specifies neither the JetBrains regression nor a VS Code bundle check. ModelTiersModel reads runner/model defaults from ConfigOptionDto, while its existing tests construct those rows manually. vscode-plugin/esbuild.mjs produces CommonJS with target node20, a distinct consumer of the new JSON import. [files: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/HLD.md, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S003/LLD.md, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt, jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt, vscode-plugin/src/config/key-map.ts, vscode-plugin/esbuild.mjs] | Add a JetBrains unset-tier test using a catalog fixture derived from changed default-family definitions, and bundle/load the VS Code extension with the proposed JSON-backed catalog. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| data-compatibility | The upstream ER companion renders correctly and is visually consistent with the design. | Inspected er-model.html's embedded Mermaid, relationship descriptions and mermaid.run initialization. Source documents family ownership of models/tier defaults and many-to-one model references. The LLD's prose adequately describes its repo-to-global-tier relationship change, so an additional ERD is not mandatory. Browser inventory was empty, and native Chrome access returned 'Computer Use was not approved to use Google Chrome'; Mermaid execution, clipping and rendered layout could not be inspected. [files: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/HLD.md, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S003/LLD.md] | Visually inspect the existing companion when rendering access is available; correct or regenerate it if necessary. |
