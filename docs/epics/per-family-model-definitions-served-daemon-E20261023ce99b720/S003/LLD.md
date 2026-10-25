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

**Returns:** `ConfigWriteResult` — ok:true, with restartRequired:true when the path is under models.tiers, models.tasks, models.coreFloor, models.byRepo or is models.local.coreModel; ok:false with reason 'invalid-path' (as today) or 'rejected-model' with a detail naming the model and family.

**Errors:**
- `ConfigWriteResult { ok: false, reason: 'rejected-model' }` when The path is models.tiers.<tier>.model and the value is an effective rejected id of the family that tier's runner names (the runner after the write; for an ollama runner nothing is rejected). config.json is not written.
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
resolveTier(tiering: TieringOverride, tier: TierName): TierModel  // src/config/analyze.ts; TierModel.effort is EffortLevel
```

**Parameters:**
- `tiering: TieringOverride` — The parsed GLOBAL tiering (tiers, efforts).
- `tier: TierName` — The tier to resolve.

**Returns:** `TierModel` — getModelRegistry().resolveTier(tier, configured-or-default setting) mapped to { runner: family, model: canonical id, effort? }; an unset tier (or '' model) uses the default family's tierDefault including its effort (ac1). An empty effort ('') is an explicit request for the CLI's own default. The full TierResolution (including fallback and droppedEffort) is kept per tier on AnalyzeConfig.tierResolutions so the router and models.resolveRole can report it.

**Preconditions:**
- Runs in a daemon thread (the registry is available).

**Postconditions:**
- A droppedEffort logs a warning naming tier, model and effort and is never forwarded (ac2).
- A fallback logs tier, requested model, reason and the default used (decision A).

### 2.4 `resolveRole`

```typescript
resolveRole(role: RoleId, cfg: AnalyzeConfig, repoPath: string | undefined, deps?: RoleRouterDeps): RoleResolution  // src/analyze/context/role-router.ts
```

**Parameters:**
- `repoPath: string | undefined` _(optional)_ — Selects the repo's `tasks` and coreFloor only.

**Returns:** `RoleResolution` — Tier from byRepo tasks → global tasks → taxonomy default, clamped by the core floor (byRepo ?? global); runner, model and effort only from the resolved global tier (ac4); no byRepo.tiers layer and no DEFAULT_TIERS fallback. It also carries the tier's fallback (reason, requested) from AnalyzeConfig.tierResolutions.

**Preconditions:**
- cfg comes from loadAnalyzeConfig (tiers already resolved through the registry).

**Postconditions:**
- The legacy per-repo shaper override (deps.repoOverride from resolveRepoShaperProvider) no longer exists; clientDefault and the explicit global runner keep their existing roles.

### 2.5 `buildShaperProvider`

```typescript
buildShaperProvider(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): LLMProvider  // and buildSummariserProvider(cfg): LLMProvider
```

**Parameters:**
- `cfg: AnalyzeConfig` — Resolved config.

**Returns:** `LLMProvider` — For a CLI family: CliProvider with kind = registry.cliKind(family), the canonical model, the effort only when the resolved model accepts it, and inputBudgetChars = the model's inputLimit.max when its unit is 'chars'. For ollama: OllamaProvider with num_ctx = the model's token inputLimit. The summariser uses registry.summariserModel(family) when the cheap tier's model is not a model of its family (replacing SUMMARISER_CLI_FALLBACK).

**Preconditions:**
- Daemon thread.

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
- SHIPPED_DEFINITIONS is the shipped file imported as a JSON module (resolveJsonModule + `with { type: 'json' }`); tsc rejects a syntactically broken file at build.

**Postconditions:**
- The daemon reconciles with buildConfigCatalog(validateModelCatalog()) (validated, test-seamed); the TUI, the updater's loadBuiltCatalog and the VS Code bundle use CONFIG_CATALOG from the shipped JSON.

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
- src/config/local.ts no longer holds any value taken from the definitions (its coreModel default is removed; an unset coreModel means the definitions' tool-loop default, resolved at use through the registry), so the module-load local-settings reads that remain (the Lance tables' embeddingDim in src/db/lance/*-vec.ts and working-memory-bullets.ts, reached through src/daemon/handler-runtime.ts) read no definition-derived value before main() validates the file.
- The getter callers migrate: src/daemon/lifecycle.ts (the ONNX dimension check and its diagnostics) calls embeddingDim(), and IndexerService.reembed in src/indexer/index.ts calls embeddingModel(); embeddingKeepAlive is also read on first use.

## 3. Data model changes

### 3.1 `Settings catalog model rows (src/config/config-catalog.ts)` — field-modify

Tier runner/model defaults, effort enumValues and the local coreModel default come from the definitions; models.shaper.ollamaNumCtx leaves the catalog and joins RETIRED_PATHS. A new src/config/model-defaults.ts imports the shipped JSON and derives these values, used by the settings catalog and the temporary DEFAULT_TIERS/TIER_EFFORTS exports in src/config/analyze.ts, which only src/cli may import (s5 removes them). tsconfig gains resolveJsonModule. src/config/local.ts drops its coreModel default (unset = the definitions' tool-loop default, resolved at use).

```
- models.tiers.core.model default ''  + default = defaultFamily tierDefaults.core.model ('opus' today)
- effort enumValues ['', low..max]  + ['', ...shipped efforts] (adds 'ultra')
- models.shaper.ollamaNumCtx row  + RETIRED_PATHS { path: 'models.shaper.ollamaNumCtx' }
- effort default ''  + default = tierDefaults[tier].effort ?? ''
- local.ts DEFAULTS.coreModel
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

Every mapping and literal default outside the family implementations is replaced by a registry lookup: the family whose cliKind equals the MCP client name (src/shared/step-context.ts, src/mcp/server.ts, src/daemon/code-review-rpc.ts, src/daemon/workflow-rpc.ts), registry.cliKind(family) for provider construction (src/analyze/context/shaper-provider.ts, src/daemon/steps/build-step/phases/validate.ts, whose fallback becomes the default family's CLI), a model label resolved to its family by registry.find with the default family otherwise (src/workflow/attribution.ts), and the claude.models static fallback list replaced by the Claude family's models (src/daemon/handler-runtime.ts:1244). Type unions take FamilyId from src/daemon/model-catalog.ts.

```
~ runner/kind literals → registry lookups; unions → FamilyId
```

**Call sites:**
- `src/shared/step-context.ts:154`
- `src/mcp/server.ts:1367`
- `src/daemon/code-review-rpc.ts:193`
- `src/daemon/workflow-rpc.ts:419`
- `src/daemon/steps/build-step/phases/validate.ts:193`
- `src/workflow/attribution.ts:40`
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
  - Subjects: `tier resolution (src/config/analyze.ts): an unset tier resolves to the fixture definitions' default with its effort; a fixture with non-empty default efforts keeps them through reconcile → parse → resolution; '' effort means the CLI default; a tier set by alias resolves to the canonical model; '' model is unset`, `effort: a tier whose model does not accept its effort resolves without it and logs a warning naming tier, model and effort; the built CliProvider gets no effort`, `decision A: an unlisted and a rejected model fall back to the tier default with a warning naming tier, requested model, reason and default`, `role router (src/analyze/context/role-router.ts): a repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps`, `provider construction: CLI kind from registry.cliKind; Codex inputBudgetChars from the model's chars limit; haiku gets none; an Ollama tier's num_ctx is the fixture model's token limit; the summariser uses the family's summariserModel when the cheap model is not of its family`, `tool loop: an ollama cheap tier's model wins (today's precedence); else a listed coreModel; else registry.toolLoopModel() with a warning naming the requested coreModel; num_ctx is the chosen model's token limit`, `settings catalog: buildConfigCatalog(fixture) gives tier runner/model defaults, effort enum values and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog`, `reconcile: with a fixture whose defaults differ from today's, a fresh config is filled with the fixture's values; byRepo tiers are removed and reported per repo and tier, tasks and coreFloor kept; models.shaper.ollamaNumCtx pruned`, `config.write: a rejected tier model is refused with reason 'rejected-model' and config.json unchanged; a tier, tasks, coreFloor or coreModel write returns restartRequired:true; an unrelated write does not`, `models.resolveRole: for a CLI tier and an Ollama tier the answer equals the router's resolution and the provider settings the daemon builds; for an unlisted and a rejected tier model it reports fallback with reason and requested model; bad params give the invalid-params error`, `embedder: importing src/indexer/embedder.ts does not call loadLocalProviderConfig; the first getter call does; src/daemon/lifecycle.ts and IndexerService.reembed use the getters`
  - Fixtures: `Fixture definitions with defaults differing from today's (via INSRC_MODEL_CATALOG_DIR / _setModelCatalogDirForTests), a model without some effort, a Codex chars limit and two Ollama models with different token limits`, `An approved-model store with one rejected model (_setApprovedModelsPathForTests)`, `A temp HOME/config.json with byRepo tiers, tasks and coreFloor, and models.shaper.ollamaNumCtx`
- **contract** — No literals or retired settings remain where the Story removes them; the RPC tables stay in step.
  - Subjects: `source scan over daemon code (src/** non-test, excluding src/cli/** which s5 migrates, src/shared/model-recommender.ts DEFAULT_LOCAL_MODEL which s5 replaces, and embedding-model literals per override item 3): fails on a model-name literal outside the definitions file, on 'cli-claude'/'cli-codex' literals outside src/daemon/model-catalog.ts, src/daemon/model-registry.ts and the family implementations, on runner 'ollama' literals outside an allow-list of non-runner uses, on any read of ollamaNumCtx, and on any import of DEFAULT_TIERS or TIER_EFFORTS outside src/cli; each exclusion names its owning Story`, `method-class and handler-runtime pins include models.resolveRole`, `installers: both copies are identical and contain no tier-model or tool-loop model literal (embedding-model choices are excluded, override item 3); step 4b reads tier defaults and the tool-loop model from the definitions file (dry run against a temp checkout)`
- **integration** — A real daemon resolves from the file and the cold-import order holds.
  - Subjects: `cold daemon import with valid and with invalid definitions, instrumented: no definition-derived value (registry, model-defaults resolution or validated file) is read before main() validates, the remaining module-load local-settings reads return no definition-derived field, and an invalid file stops the daemon with ModelCatalogValidationError naming the entry`, `a daemon in a temp home with byRepo tiers in config.json removes them at boot with the warnings, and models.resolveRole over the socket returns the global tier's model for a repo whose tasks pick that tier`, `the TUI build (tsc) passes and its model-tiers pane shows the definitions' defaults`
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
5. Replace the remaining runner/CLI-kind literals and mappings in step-context, MCP server, code-review and workflow RPCs, build-step validation, attribution and the claude.models fallback with registry lookups; unions take FamilyId. — ↩ rollbackable
6. config.write refusal and restartRequired; models.resolveRole handler, method-class entry and RECORDED_RPC. — ↩ rollbackable
7. Embedder settings (model, dim, keepAlive) read on first use, with src/daemon/lifecycle.ts and IndexerService.reembed migrated to the getters; local.ts drops its coreModel default; both installers read tier defaults and the tool-loop model from the cloned definitions file. — ↩ rollbackable
8. Tests: resolution, routing, providers, catalog, reconcile, config.write, resolveRole, cold import, and the source-literal scan. — ↩ rollbackable

**Backward compat:** Existing tier settings keep working: aliases and listed ids resolve as before, and an unlisted model now falls back to the tier default with a warning instead of being passed to the CLI (decision A). Per-repo tier overrides stop applying and are removed from config.json at the next boot (not restorable by rollback; a warning names each repo and tier); per-repo tasks and coreFloor are kept. models.shaper.ollamaNumCtx is removed; Ollama now runs at each model's own context window (qwen3.6:27b: 32768, the same value). An empty core model ('' today) now resolves to the definitions' core default (opus), the model the claude CLI chose by default. config.write's result gains optional fields (restartRequired, reason, detail), so existing clients that read only ok keep working; models.resolveRole is new. The settings catalog keeps every row except ollamaNumCtx; its effort enum gains 'ultra'. resolveRepoShaperProvider/resolveRepoShaperModel were internal to the daemon. A tier default effort set in the definitions is written into config.json by reconcile like the other defaults. local.ts no longer defaults coreModel; reconcile still writes the catalog's coreModel default (the tool-loop model), so behaviour is unchanged.

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

**6 do not hold · 1 could not be verified · 6 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-25T17:55:24.709Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | HIGH | Definition-supplied default efforts remain effective after a fresh configuration is reconciled. | Section 2.7 changes effort enumValues but leaves their defaults unchanged: config-catalog.ts specifies "default: ''". Reconcile writes those defaults alongside the definition-derived model. parseTiering then treats '' as no effort. For a listed model, registry.resolveTier explicitly returns "if (effort === undefined) return { family: setting.runner, model: found }"; it does not restore tierDefault.effort. Thus a valid definition with a default effort loses it after fresh reconcile, contrary to the default-effort behavior promised in §5. [files: src/config/config-catalog.ts, src/config/reconcile.ts, src/config/analyze.ts, src/daemon/model-registry.ts, src/daemon/model-catalog.ts] | Specify how catalog reconciliation preserves definition-supplied default efforts while distinguishing an explicit request for CLI-default effort. Test reconcile → parse → resolution using a fixture with nonempty default efforts. |
| change-sites | HIGH | Making the embedder lazy is sufficient to prevent local settings reads before main() validates definitions. | index.ts statically imports buildHandlerRuntime; handler-runtime.ts statically imports artifact-vec.ts. That module executes "const EMBEDDING_DIM = loadLocalProviderConfig().embeddingDim;" at module evaluation. The same eager pattern exists in entity-vec, turn-vec, session-vec, config-vec, response-segment-vec and working-memory-bullets. local.ts caches the entire configuration, including coreModel. These reads precede main() independently of embedder.ts. [files: src/daemon/index.ts, src/daemon/handler-runtime.ts, src/config/local.ts, src/indexer/embedder.ts, src/db/lance/artifact-vec.ts, src/db/lance/entity-vec.ts, src/db/lance/turn-vec.ts, src/db/lance/session-vec.ts, src/db/lance/config-vec.ts, src/db/lance/response-segment-vec.ts, src/db/lance/working-memory-bullets.ts] | Inventory and defer every eager local-config reader reachable from the daemon entry. Include the embedder's embeddingKeepAlive initialization, and instrument the real cold import to assert validation precedes the first settings read. |
| change-sites | HIGH | The change-site inventory covers consumers of the embedding constants replaced by getters. | lifecycle.ts imports EMBEDDING_DIM and uses it in the ONNX compatibility check and diagnostics. IndexerService.reembed dynamically imports EMBEDDING_MODEL and passes it to updateEmbedding. Neither caller is included in the getter migration. Removing the exports as specified without migrating these consumers breaks compilation and reembedding/bootstrap behavior. [files: src/indexer/embedder.ts, src/indexer/index.ts, src/daemon/lifecycle.ts] | Add lifecycle.ts and IndexerService.reembed to the migration, replace constant accesses with getter calls, and preserve their existing dimension-check and embedding-model attribution behavior. |
| change-sites | HIGH | The specified resolved-config data flow can supply models.resolveRole's required fallback information. | Section 2.3 maps registry results to only "{ runner: family, model: canonical id, effort? }". TierModel has only those fields, and assembleConfig replaces tiering.tiers with the resolved tiers. The registry's "fallback: { reason, requested: setting.model }" is therefore discarded. The proposed pure role resolver receives that resolved config, so wrapping it cannot distinguish a configured default from an unlisted/rejected request that fell back to the same default. [files: src/config/analyze.ts, src/daemon/model-registry.ts, src/analyze/context/role-router.ts, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/HLD.md] | Preserve per-tier fallback provenance in resolved config or an associated resolution record, and carry it through role resolution into the RPC result. Test both fallback reasons over IPC. |
| current-behaviour | MED | The tool loop currently selects models.local.coreModel without another model-selection precedence layer. | The complete localToolLoopModel body first checks the cheap tier: "if (cheap?.runner === 'ollama' && cheap.model.length > 0) return cheap.model;". Only otherwise does it return loadLocalProviderConfig().coreModel. Both tool-loop construction sites call this helper. The migration description omits that existing precedence, while §2.6 replaces it with coreModel-first selection. [files: src/analyze/context/driver.ts] | Describe the existing cheap-Ollama precedence and explicitly decide whether to preserve or remove it. Document and test the behavior when cheap.model differs from local.coreModel. |
| tests | MED | The proposed source-literal scans can pass while preserving the explicitly deferred client and embedding scope. | The scan rejects cli-claude/cli-codex literals throughout non-test src except registry/catalog/family implementations. ModelTiersPane.tsx still validates those literal runners and is deferred to s5. model-recommender.ts retains "DEFAULT_LOCAL_MODEL = 'qwen3.6:27b'", also deferred to s5. Both installers retain embedding model literals, yet the installer test requires no model-name literal without an embedding exclusion. These gates contradict the staged scope. [files: src/cli/panes/ModelTiersPane.tsx, src/shared/model-recommender.ts, scripts/insrc-daemon-install.sh, vscode-plugin/assets/insrc-daemon-install.sh, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/HLD.md] | Give the scans explicit, narrowly named temporary exclusions for s5-owned stopgaps and installer embedding choices, with removal assigned to their owning Story. Keep daemon model-selection checks strict. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| data-compatibility | The referenced HLD ER companion renders correctly and its rendered content matches its source. | Inspected the generated HTML, embedded Mermaid entity/relationship source and descriptive tables. Browser inventory contained no controllable browser. Attempting to access native Google Chrome returned "Computer Use was not approved to use Google Chrome". Mermaid execution, clipping and rendered readability could not be verified. [files: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html] | Render and visually inspect the existing companion; correct or regenerate it if necessary. |
