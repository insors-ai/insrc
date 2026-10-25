<!-- insrc:artifact PLAN-ce99b72065d03b1b-s3 -->

# Plan: E20261025ce99b720:S003

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**LLD run:** `wf-1792950349251-9n39sv`
**LLD effective hash:** `c324f041e3e7...`

Building s3 moves every model decision in the daemon onto the definitions in ten steps: first the settings catalog and defaults derived from the shipped file plus a build-time check, then the boot reconcile, tier resolution, the role router and provider construction through the registry, then the remaining runner literals, config.write and models.resolveRole, the TUI stopgap, and the installers and IDE settings that read the catalog. A source scan and real-daemon tests close it out.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Definition defaults, catalog rows and the build gate | M | — | unit: config-catalog-defs.test.ts: buildConfigCatalog(fixture) takes runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog; unit: config-catalog-defs.test.ts: model-defaults and config-catalog import no logger, registry or file-I/O module and derive without throwing from a fixture missing fields; unit: check-model-definitions.test.ts: the build gate exits non-zero naming the entry for a structurally invalid copy and zero for the shipped file; unit: model-catalog-asset.test.ts: Codex models carry the 1048576-char inputLimit; unit: session-source-inventory suite passes after t1 | [[c7]] [[c11]] [[c13]] [[c18]] |
| 2 | **`t2`** Boot reconcile, per-repo tier removal, cache resets and the lazy embedder | M | `t1` | unit: reconcile-defs.test.ts: a fresh config is filled with a fixture's differing defaults including non-empty default efforts; byRepo tiers removed and reported per repo and tier, tasks and coreFloor kept; ollamaNumCtx pruned; unit: settings-cache-reset.test.ts: a local and an analyze config cached before reconcile return the reconciled values after the production resets; unit: embedder-lazy.test.ts: importing embedder.ts calls no settings loader; the first getter does; lifecycle.ts and reembed use the getters; integration: boot-cold-import.test.ts: both catalog chains import with a valid, missing, malformed and structurally invalid INSRC_MODEL_CATALOG_DIR; registry first read in main(); invalid files refused with the named error before reconcile; unit: session-source-inventory suite passes after t2 | [[c8]] [[c10]] [[c12]] [[c19]] |
| 3 | **`t3`** Tier resolution through the registry | M | `t1` | unit: tier-resolution.test.ts: unset and '' tiers resolve to the fixture default with its effort; '' effort is the CLI default; aliases resolve to canonical ids; unit: tier-resolution.test.ts: an unaccepted effort is dropped with a warning naming tier, model and effort; unit: tier-resolution.test.ts: unlisted and rejected models fall back with a warning naming tier, requested model, reason and default, kept in tierResolutions; unit: session-source-inventory suite passes after t3 | [[c3]] [[c12]] [[c19]] |
| 4 | **`t4`** Role router on global tiers; per-repo shaper overrides removed | M | `t3` | unit: role-router-global-tiers.test.ts: a repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps; unit: role-router-global-tiers.test.ts: the RoleResolution keeps role, tier, runner, model, effort, clampedByFloor and adds fallback; workflow-rpc and workflow-review-rpc labels unchanged for a CLI and an Ollama tier; unit: role-router-global-tiers.test.ts: no source references readRepoOverride or resolveRepoShaper*; unit: session-source-inventory suite passes after t4 | [[c4]] [[c12]] |
| 5 | **`t5`** Provider construction from the registry | M | `t4` | unit: provider-from-registry.test.ts: CLI kind, effort acceptance (CliProvider gets no unaccepted effort), Codex chars budget, no haiku budget and Ollama num_ctx come from the registry; summariser uses the family's summariserModel; unit: provider-from-registry.test.ts: tool loop follows ollama cheap tier, then listed coreModel, then toolLoopModel with a warning; num_ctx is the chosen model's limit; unit: provider-from-registry.test.ts: resolveValidateProvider reuses the router's CLI provider and builds the default family's tier default for an ollama resolution; unit: input-budget.test.ts: a CliProvider reports the budget it is given and a registry-built Codex provider reports the file's chars limit; unit: session-source-inventory suite passes after t5 | [[c5]] [[c6]] [[c9]] [[c13]] |
| 6 | **`t6`** Remaining runner literals: client identity, attribution, listing, claude.models | M | `t5` | unit: client-family.test.ts: step host and one-shot analyze map client 'claude'/'codex' to the family with that cliKind; an injected clientDefault wins; MCP client detection imports no registry or model-defaults; unit: attribution.test.ts: claude, client, codex, codex:<m>, ollama, ollama:<listed>, ollama:<unlisted> map to their historical families; unit: list-models.test.ts: providers.listModels admits exactly the registry's family ids with the unchanged invalid-params error; unit: claude-models.test.ts: claude.models lists the Claude-kind family in its shape with no network call even with ANTHROPIC_API_KEY set; no @anthropic-ai/sdk import in handler-runtime.ts; unit: client-family.test.ts: src/mcp/** and src/cli/** do not import getModelRegistry; unit: session-source-inventory suite passes after t6 | [[c14]] [[c19]] |
| 7 | **`t7`** config.write refusal and restartRequired; models.resolveRole | M | `t4`, `t5` | unit: config-write-models.test.ts: refusal via model leaf, runner switch, whole-tier and parent-object writes with config.json unchanged; formerly rejected shipped model accepted by id and alias; unit: config-write-models.test.ts: restartRequired for tier, tasks, coreFloor and coreModel changes including 'models' and 'models.local' writes; none for unrelated writes; unit: models-resolve-role.test.ts: CLI and Ollama tiers match the router and provider settings; fallback reported for unlisted and rejected models; bad params refused; family, cli/ollama and inputLimit projected; unit: method-class and handler-runtime suites pass with models.resolveRole registered; unit: session-source-inventory suite passes after t7 | [[c1]] [[c2]] [[c16]] |
| 8 | **`t8`** TUI resolution stopgap | S | `t4`, `t5` | unit: tui-shipped-registry.test.ts: computeEffectiveTiers and reviewArtifact succeed with getModelRegistry stubbed to throw and the store unreadable; the pane shows the definitions' defaults; src/cli/** does not import getModelRegistry; integration: the TUI build (tsc) passes | [[c3]] [[c4]] [[c11]] |
| 9 | **`t9`** Installers, VS Code manifest and JetBrains fixture | M | `t1` | unit: installer-defs.test.ts: both installer copies are identical with no tier-model or tool-loop literal; a step-4b dry run writes the file's defaults; unit: model-catalog-asset.test.ts: structural validation kept; installer reads defaults from the file; summariser comes from summariserModel; unit: vscode manifest-catalog.test.ts and tier-effort.test.ts pass; sync-manifest-catalog.mjs is idempotent; unit: vscode-bundle-catalog.test.ts: the extension type-checks and bundles; loaded without backend node_modules its catalog defaults equal buildConfigCatalog(shipped); unit: ModelTiersModelTest: an unset tier shows the fixture default family's values; jetbrains-catalog-fixture.test.ts asserts the fixture equals buildConfigCatalog | [[c15]] [[c17]] [[c11]] |
| 10 | **`t10`** Source-literal scan and real-daemon integration | M | `t2`, `t6`, `t7`, `t8`, `t9` | unit: model-literal-scan.test.ts: the scan passes on the tree and fails on an injected literal; exclusions name their owning Story; integration: models-daemon-s3.test.ts: a real daemon removes byRepo tiers at boot with warnings and models.resolveRole returns the global tier's model for a repo-chosen tier; integration: models-daemon-s3.test.ts: a cold start with an alternate catalog changing toolLoopModel uses the reconciled coreModel | [[c20]] [[c21]] |

### 1.1 E20261025ce99b720:S003:T001 — Definition defaults, catalog rows and the build gate

Enable resolveJsonModule in tsconfig.json and vscode-plugin/tsconfig.json; add src/config/model-defaults.ts (JSON import + type-only imports, a never-throwing derivation of tier defaults, efforts, default family and tool-loop model); build CONFIG_CATALOG via buildConfigCatalog(defs) with runner/model/effort defaults and enums from the definitions and coreModel default from the tool-loop model; retire models.shaper.ollamaNumCtx (row out, RETIRED_PATHS in); local.ts takes its coreModel default from the shipped defaults; DEFAULT_TIERS/TIER_EFFORTS become JSON-derived exports; add the Codex chars inputLimit to the definitions file; add scripts/check-model-definitions.mjs and the package.json build gate.

**Acceptance checks:**
- buildConfigCatalog(fixture) gives runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row
- model-defaults.ts and config-catalog.ts import no logger, registry or file-I/O module and never throw on a missing field
- The build gate exits non-zero naming the entry for a structurally invalid copy and zero for the shipped file
- The shipped file's Codex models carry inputLimit { unit: 'chars', max: 1048576 }
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.2 E20261025ce99b720:S003:T002 — Boot reconcile, per-repo tier removal, cache resets and the lazy embedder

The daemon reconciles with buildConfigCatalog(validateModelCatalog()); reconcileConfig removes models.byRepo[repo].tiers and reports each repo and tier in pruned with a boot warning, keeping tasks and coreFloor; main() drops the local and analyze settings caches right after the boot reconcile (production resets resetLocalProviderConfigCache / resetAnalyzeConfigCache); the embedder's model, dim and keepAlive become first-use getters, migrating src/daemon/lifecycle.ts and IndexerService.reembed.

**Acceptance checks:**
- Reconcile with a fixture whose defaults differ fills the fixture's values, including non-empty default efforts
- byRepo tiers are removed and reported per repo and tier; tasks and coreFloor kept; models.shaper.ollamaNumCtx pruned
- A local config cached before the boot reconcile is re-read after it
- Importing src/indexer/embedder.ts calls no settings loader; lifecycle.ts and reembed use the getters
- A cold daemon import with a valid, missing, malformed or structurally invalid INSRC_MODEL_CATALOG_DIR imports every module and refuses invalid files in main() with the named error
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.3 E20261025ce99b720:S003:T003 — Tier resolution through the registry

loadAnalyzeConfig/resolveTier in src/config/analyze.ts take an injectable registry (default getModelRegistry()) and resolve each global tier through registry.resolveTier, logging dropped efforts and fallbacks and keeping AnalyzeConfig.tierResolutions; TierEffort becomes EffortLevel and runner types FamilyId; byRepo parsing keeps only tasks and coreFloor.

**Acceptance checks:**
- An unset or '' tier resolves to the fixture's default with its effort; an alias resolves to the canonical id
- An unaccepted effort is dropped with a warning naming tier, model and effort
- Unlisted and rejected models fall back with a warning naming tier, requested model, reason and default, and the resolution is kept in tierResolutions
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.4 E20261025ce99b720:S003:T004 — Role router on global tiers; per-repo shaper overrides removed

The role router takes the tier from byRepo/global tasks with the core-floor clamp and the model only from the global tiers (no byRepo.tiers layer, no DEFAULT_TIERS fallback), carries fallback in its internal RoleResolution (role, tier, runner, model, effort, clampedByFloor kept) and passes an injectable registry to provider construction; readRepoOverride and resolveRepoShaperProvider/Model are removed with their callers in src/daemon/code-review-rpc.ts and src/daemon/workflow-rpc.ts.

**Acceptance checks:**
- A repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps
- The internal RoleResolution keeps its fields and adds fallback; workflow-rpc attribution and workflow-review-rpc labels are unchanged
- No source references readRepoOverride, resolveRepoShaperProvider or resolveRepoShaperModel
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.5 E20261025ce99b720:S003:T005 — Provider construction from the registry

buildShaperProvider/buildSummariserProvider take the CLI kind from registry.cliKind, forward only accepted efforts, set inputBudgetChars from a model's chars limit and Ollama num_ctx from its token limit, and use registry.summariserModel instead of SUMMARISER_CLI_FALLBACK; resolveShaperKind's floor comes from the default family; CliProvider takes inputBudgetChars from options (CODEX_INPUT_BUDGET_CHARS removed); localToolLoopModel keeps today's precedence (ollama cheap tier, listed coreModel, registry.toolLoopModel()); resolveValidateProvider reuses the router's CLI provider or builds the default family's tier default through the same factory; input-budget.test.ts migrated.

**Acceptance checks:**
- CLI kind, effort acceptance, Codex chars budget (haiku none) and Ollama num_ctx come from the registry
- The summariser uses the family's summariserModel when the cheap model is not of its family
- The tool loop follows ollama cheap tier → listed coreModel → toolLoopModel with a warning
- resolveValidateProvider: CLI resolution reuses the router's provider; ollama resolution builds the default family's tier default with canonical model, accepted effort and budget
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.6 E20261025ce99b720:S003:T006 — Remaining runner literals: client identity, attribution, listing, claude.models

Add the daemon-owned familyForClient(client, registry) and use it in src/daemon/steps/host.ts, src/daemon/steps/analyze-oneshot.ts, src/daemon/code-review-rpc.ts and src/daemon/workflow-rpc.ts; src/shared/step-context.ts keeps stepClient()/StepClient and drops the runner mappings; the MCP server detects and forwards only the client identity; attribution decodes labels by shipped family metadata before model lookup; list-models admits FamilyId from the registry; claude.models answers from the Claude-kind family (no SDK REST call); unions take FamilyId.

**Acceptance checks:**
- Forwarded client 'claude'/'codex' maps to the family with that cliKind in the step host and one-shot analyze; an injected clientDefault still wins
- Historical labels claude, client, codex, codex:<m>, ollama, ollama:<listed>, ollama:<unlisted> keep their families
- providers.listModels admits exactly the registry's family ids with the unchanged error text
- claude.models returns the Claude-kind family's models in its shape with no network call; handler-runtime.ts no longer imports @anthropic-ai/sdk
- src/mcp/** and src/cli/** do not import getModelRegistry
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.7 E20261025ce99b720:S003:T007 — config.write refusal and restartRequired; models.resolveRole

config.write applies the write to a candidate, refuses when any changed tier names an effectively rejected model (rejected and not served), and returns restartRequired when a restart-sensitive setting differs before/after; add models.resolveRole projecting the router's resolution to the sc5 shape, with its method-class entry and RECORDED_RPC.

**Acceptance checks:**
- Refusal via model leaf, runner switch, whole-tier and parent-object writes with config.json unchanged; acceptance of a formerly rejected model the file now lists (id and alias)
- restartRequired for tier/tasks/coreFloor/coreModel changes including 'models' and 'models.local' parent writes; none for unrelated writes
- models.resolveRole equals the router and provider settings for a CLI and an Ollama tier, reports fallback for unlisted and rejected models, and refuses bad params
- method-class and handler-runtime pins include models.resolveRole
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.8 E20261025ce99b720:S003:T008 — TUI resolution stopgap

Add src/cli/shipped-model-registry.ts (shippedModelRegistry() = buildModelRegistry(shipped JSON, []), with model-registry.ts exporting its pure builder); src/cli/panes/model-tiers.ts computeEffectiveTiers and src/cli/services/workflow.ts reviewArtifact pass it to loadAnalyzeConfig and createRoleRouter.

**Acceptance checks:**
- computeEffectiveTiers and reviewArtifact succeed end-to-end with getModelRegistry stubbed to throw and the store unreadable
- The model-tiers pane shows the definitions' defaults

### 1.9 E20261025ce99b720:S003:T009 — Installers, VS Code manifest and JetBrains fixture

Both installer copies read tier defaults and the tool-loop model from the cloned definitions file with node in step 4b (identical copies); add vscode-plugin/scripts/sync-manifest-catalog.mjs and regenerate the manifest's catalog-backed settings (ollamaNumCtx removed); add a JetBrains unset-tier test fed by a checked-in catalog fixture with a TS drift test; migrate model-catalog-asset.test.ts's installer and summariser assertions.

**Acceptance checks:**
- Installers contain no tier-model or tool-loop literal and a dry run writes the file's defaults
- The manifest equals the catalog (manifest-catalog.test.ts, tier-effort.test.ts pass); the sync script is idempotent
- The VS Code extension type-checks and bundles, and loads the catalog without backend node_modules
- JetBrains shows an unset tier with the fixture default family's values; the fixture matches buildConfigCatalog

### 1.10 E20261025ce99b720:S003:T010 — Source-literal scan and real-daemon integration

Add the daemon-code source scan (model-name, cli-claude/cli-codex, runner 'ollama', ollamaNumCtx reads, DEFAULT_TIERS/TIER_EFFORTS imports outside src/cli, with named exclusions and owners) and the real-daemon tests: byRepo tiers removed at boot with warnings, models.resolveRole over the socket for a repo-chosen tier, and a cold start with an alternate catalog that changes toolLoopModel.

**Acceptance checks:**
- The scan passes on the migrated tree and fails on an injected literal
- A real daemon removes byRepo tiers at boot with the warnings and models.resolveRole returns the global tier's model
- A cold start with the alternate catalog uses the reconciled coreModel

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| tier resolution (src/config/analyze.ts): an unset tier resolves to the fixture definitions' default with its effort; a fixture with non-empty default efforts keeps them through reconcile → parse → resolution; '' effort means the CLI default; a tier set by alias resolves to the canonical model; '' model is unset | `t2`, `t3` |
| effort: a tier whose model does not accept its effort resolves without it and logs a warning naming tier, model and effort; the built CliProvider gets no effort | `t3`, `t5` |
| decision A: an unlisted and a rejected model fall back to the tier default with a warning naming tier, requested model, reason and default | `t3` |
| role router (src/analyze/context/role-router.ts): a repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps | `t4` |
| provider construction: CLI kind from registry.cliKind; Codex inputBudgetChars from the model's chars limit; haiku gets none; an Ollama tier's num_ctx is the fixture model's token limit; the summariser uses the family's summariserModel when the cheap model is not of its family | `t5` |
| tool loop: an ollama cheap tier's model wins (today's precedence); else a listed coreModel; else registry.toolLoopModel() with a warning naming the requested coreModel; num_ctx is the chosen model's token limit | `t5` |
| settings catalog: buildConfigCatalog(fixture) gives tier runner/model defaults, effort enum values and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog | `t1` |
| reconcile: with a fixture whose defaults differ from today's, a fresh config is filled with the fixture's values; byRepo tiers are removed and reported per repo and tier, tasks and coreFloor kept; models.shaper.ollamaNumCtx pruned | `t2` |
| config.write: refusal for a rejected model via a model leaf, a runner switch, a whole-tier object and a parent object ('models'), with config.json unchanged; acceptance of a formerly rejected model the file now lists (by id and alias); restartRequired:true when a restart-sensitive setting changes, including parent-object writes to 'models' and 'models.local'; none for an unrelated write | `t7` |
| models.resolveRole: for a CLI tier and an Ollama tier the answer equals the router's resolution and the provider settings the daemon builds; for an unlisted and a rejected tier model it reports fallback with reason and requested model; bad params give the invalid-params error | `t7` |
| embedder: importing src/indexer/embedder.ts does not call loadLocalProviderConfig; the first getter call does; src/daemon/lifecycle.ts and IndexerService.reembed use the getters | `t2` |
| TUI stopgap: computeEffectiveTiers and reviewArtifact end-to-end (loadAnalyzeConfig, createRoleRouter and provider construction) with getModelRegistry stubbed to throw and the store path pointing at a file that fails if read: both succeed through shippedModelRegistry() and the pane shows the definitions' defaults | `t8` |
| attribution: 'claude', 'client', 'codex', 'codex:<model>', 'ollama', 'ollama:<listed>' and 'ollama:<unlisted>' labels map to their historical families (src/workflow/__tests__/attribution.test.ts extended) | `t6` |
| client identity: the daemon maps step.call client 'claude' / 'codex' to the family with that cliKind; the MCP server's client detection does not import the registry or model-defaults | `t6` |
| existing pins migrated: src/daemon/__tests__/model-catalog-asset.test.ts keeps its structural validation of the shipped file but replaces the installer-literal and SUMMARISER_CLI_FALLBACK assertions with: the installer reads tier defaults and the tool-loop model from the file, and the summariser comes from the file's summariserModel; src/agent/providers/__tests__/input-budget.test.ts asserts a CliProvider reports the inputBudgetChars it is given (absent when not given) and that a provider built for a Codex model through the registry reports the file's chars limit | `t5`, `t9` |
| one-shot analyze (src/daemon/steps/analyze-oneshot.ts): a forwarded client 'codex' or 'claude' resolves through familyForClient to the family with that cliKind; an injected clientDefault still wins | `t6` |
| providers.listModels admits exactly the registry's family ids; an unknown provider still returns the unchanged invalid-params error | `t6` |
| router record: resolveRole keeps role, tier, runner, model, effort and clampedByFloor (plus fallback); workflow-rpc attribution and workflow-review-rpc labels built from it are unchanged for a CLI and an Ollama tier; models.resolveRole projects family, cli/ollama and inputLimit | `t4`, `t7` |
| resolveValidateProvider: a CLI 'build' resolution returns the router's provider (model, effort, inputBudgetChars from the factory); an ollama 'build' resolution returns a CliProvider for the default family's tier default with its canonical model, accepted effort and chars budget, and logs the substitution | `t5` |
| cache reset: a local config cached before reconcile returns the reconciled coreModel after resetLocalProviderConfigCache(); the analyze config likewise after resetAnalyzeConfigCache() | `t2` |
| claude.models: returns the Claude-kind family's served models in the existing shape, makes no network call even with ANTHROPIC_API_KEY set, and handler-runtime.ts no longer imports @anthropic-ai/sdk | `t6` |
| source scan over daemon code (src/** non-test, excluding src/cli/** which s5 migrates, src/shared/model-recommender.ts DEFAULT_LOCAL_MODEL which s5 replaces, and embedding-model literals per override item 3): fails on a model-name literal outside the definitions file, on 'cli-claude'/'cli-codex' literals outside src/daemon/model-catalog.ts, src/daemon/model-registry.ts and the family implementations, on runner 'ollama' literals outside an allow-list of non-runner uses, on any read of ollamaNumCtx, and on any import of DEFAULT_TIERS or TIER_EFFORTS outside src/cli; each exclusion names its owning Story | `t10` |
| method-class and handler-runtime pins include models.resolveRole | `t7` |
| installers: both copies are identical and contain no tier-model or tool-loop model literal (embedding-model choices are excluded, override item 3); step 4b reads tier defaults and the tool-loop model from the definitions file (dry run against a temp checkout) | `t9` |
| src/cli/** does not import getModelRegistry | `t8` |
| JetBrains: ModelTiersModelTest shows an unset tier with the default family's values from a catalog fixture produced by buildConfigCatalog over definitions whose default family and tier defaults differ from today's; a TS test asserts the checked-in Kotlin fixture equals buildConfigCatalog(that fixture) so they cannot drift | `t9` |
| VS Code: the extension bundle (vscode-plugin/esbuild.mjs, CJS node20) builds with the JSON-backed catalog and, loaded in node with the backend's node_modules unavailable, key-map's catalog defaults equal buildConfigCatalog(shipped); the import closure of src/config/config-catalog.ts contains no logger, registry or file-I/O module; the extension's `tsc -p tsconfig.json` type-check passes with the JSON-backed catalog | `t1`, `t9` |
| src/mcp/** and src/cli/** do not import getModelRegistry (clients stay off the store, k2) | `t6` |
| build gate: scripts/check-model-definitions.mjs exits non-zero, naming the entry, for a syntactically valid but structurally invalid definitions file (run against a temp copy), and zero for the shipped file; `npm run build` with the invalid copy exits non-zero before copy-assets | `t1` |
| VS Code manifest: sync-manifest-catalog.mjs is idempotent on the committed package.json; manifest-catalog.test.ts and tier-effort.test.ts pass with the definition-derived catalog (no ollamaNumCtx key, effort enums include 'ultra') | `t9` |
| cold daemon import through both catalog chains (index.ts → reconcile-io.ts → reconcile.ts, handler-runtime.ts → admin-handlers.ts → settings-catalog.ts), instrumented, with INSRC_MODEL_CATALOG_DIR pointing at a valid, a missing, a malformed and a structurally invalid file: every module imports, the registry and validated file are first read in main(), and an invalid file stops the daemon with ModelCatalogValidationError naming the entry before reconcile | `t2` |
| a daemon in a temp home with byRepo tiers in config.json removes them at boot with the warnings, and models.resolveRole over the socket returns the global tier's model for a repo whose tasks pick that tier | `t10` |
| the TUI build (tsc) passes and its model-tiers pane shows the definitions' defaults | `t8` |
| cold start with a fresh home and an alternate catalog (INSRC_MODEL_CATALOG_DIR) that keeps the shipped local model but changes toolLoopModel: after boot, models.resolveRole / the tool-loop choice uses the reconciled coreModel, not the module-load cached one | `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails.api config.write` — "ConfigWriteResult = { ok: true; restartRequired?: boolean } | { ok: false; reason?: 'invalid-path' | 'rejected-model'; detail?: string }"
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails.api models.resolveRole` — "The sc5 wire shape, projected from the internal RoleResolution"
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails.api resolveTier` — "resolveTier(tiering: TieringOverride, tier: TierName, registry?: ModelRegistry): TierModel"
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails.api resolveRole` — "The internal record keeps its existing fields"
- **[[c5]]** `prior-artifact` `LLD s3 contractDetails.api buildShaperProvider` — "For a CLI family: CliProvider with kind = registry.cliKind(family)"
- **[[c6]]** `prior-artifact` `LLD s3 contractDetails.api localToolLoopModel` — "Keeps today's precedence"
- **[[c7]]** `prior-artifact` `LLD s3 contractDetails.api CONFIG_CATALOG` — "export const CONFIG_CATALOG: readonly ConfigOption[]  // = buildConfigCatalog(SHIPPED_DEFINITIONS)"
- **[[c8]]** `prior-artifact` `LLD s3 contractDetails.api reconcileConfig` — "every models.byRepo[repo].tiers subtree is removed and reported in `pruned`"
- **[[c9]]** `prior-artifact` `LLD s3 contractDetails.api CliProvider` — "inputBudgetChars comes from opts instead of CODEX_INPUT_BUDGET_CHARS (removed)"
- **[[c10]]** `prior-artifact` `LLD s3 contractDetails.api EMBEDDING_MODEL` — "the module-load EMBEDDING_MODEL / EMBEDDING_DIM constants become first-use getters"
- **[[c11]]** `prior-artifact` `LLD s3 dataModelChanges settings catalog model rows` — "Tier runner/model defaults, effort enumValues and the local coreModel default come from the definitions"
- **[[c12]]** `prior-artifact` `LLD s3 dataModelChanges tiering config` — "TierEffort becomes EffortLevel"
- **[[c13]]** `prior-artifact` `LLD s3 dataModelChanges shipped definitions data` — "Each Codex model gains inputLimit { unit: 'chars', max: 1048576 }"
- **[[c14]]** `prior-artifact` `LLD s3 dataModelChanges runner and client mappings` — "Runner/CLI-kind mappings and literal defaults outside the family implementations are replaced, with client processes kept off the registry (k2)"
- **[[c15]]** `prior-artifact` `LLD s3 dataModelChanges installer tier and coreModel block` — "Step 4b reads the chosen family's tierDefaults and the ollama toolLoopModel"
- **[[c16]]** `prior-artifact` `LLD s3 dataModelChanges method-class table` — "Adds ['models.resolveRole', 'session', false]"
- **[[c17]]** `prior-artifact` `LLD s3 dataModelChanges VS Code settings manifest` — "regenerated from CONFIG_CATALOG by a new vscode-plugin/scripts/sync-manifest-catalog.mjs"
- **[[c18]]** `prior-artifact` `LLD s3 dataModelChanges build pipeline` — "The build validates the shipped definitions structurally with the daemon's own validator"
- **[[c19]]** `prior-artifact` `LLD s3 errorPaths` — "Logs a warning naming tier, requested model, reason and the default used, and runs the tier default (decision A)."
- **[[c20]]** `prior-artifact` `LLD s3 testStrategy` — "A real daemon resolves from the file and the cold-import order holds."
- **[[c21]]** `prior-artifact` `LLD s3 migration` — "Tests: resolution, routing, providers, catalog, reconcile, config.write, resolveRole, cold import, and the source-literal scan."
