<!-- insrc:artifact PLAN-a27df0280289e6c6-S001 -->

# Plan: E20261023a27df028:S001

## Summary

**Epic:** `add-per-tier-reasoning-effort-setting`
**LLD run:** `wf-1792733816083-gtu5hw`
**LLD effective hash:** `a27df0280289...`

Building this Story threads an optional reasoning effort from the global model tiers in config, through the role router and provider builders, to the claude and codex command lines, without changing any call when no effort is set. The config catalog declares the three effort keys, and each settings surface gets a control for them: a row in the TUI tier pane, manifest entries and a picker step in VS Code, and a combo in the JetBrains model-tiers section. It ends with live CLI checks, the full sweep, and one daemon update that also ships the code-review fix and the threading story, with core set to high and mid to medium.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Effort in the tier config: parse, fallback and derived fields | M | — | unit: parseTiering reads effort on the global core/mid/cheap tiers; an effort under models.byRepo[repo].tiers is ignored with a warning; '' and absent give no effort; unit: an effort outside low\\|medium\\|high\\|xhigh\\|max is dropped with a warning while the tier keeps its runner and model; unit: a global tier dropped for an empty or invalid model keeps its configured effort on the DEFAULT_TIERS fallback (assembleConfig's shaperEffort / summariserEffort) | [[c1]] [[c8]] |
| 2 | **`t2`** Declare the three effort rows in the config catalog | S | — | unit: the catalog declares models.tiers.{core,mid,cheap}.effort as enum ['', 'low','medium','high','xhigh','max'] with default '' (48 rows) | [[c2]] |
| 3 | **`t3`** CliProvider passes the effort to the CLI | S | — | unit: with effort, claude invocations carry --effort <e> and codex invocations carry -c model_reasoning_effort=<e>, in complete, structured, edit session and both review sessions; unit: without effort every argv is byte-identical to today's | [[c4]] |
| 4 | **`t4`** Route the global tier's effort to every provider | M | `t1`, `t3` | unit: the role router takes the effort of the global tier the role resolves to, also when a byRepo tier supplies its runner and model, and buildShaperProvider hands it to CliProvider; the Ollama branch ignores it; unit: buildShaperProvider without roleEffort uses cfg.shaperEffort (code-review-rpc, workflow-rpc and docgen callers), also when a repo override sets the runner; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes the build tier's effort; unit: with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort | [[c3]] [[c8]] |
| 5 | **`t5`** TUI: effort row per tier | M | `t1`, `t2` | unit: TUI ModelTiersPane shows an effort row per tier, cycles CLI default/low/medium/high/xhigh/max and writes models.tiers.<tier>.effort; unit: computeEffectiveTiers shows a tier's effort, including tiering.efforts on a DEFAULT_TIERS fallback: core.model '' with core.effort 'high' shows effort high | [[c5]] |
| 6 | **`t6`** VS Code: manifest entries and tier-picker effort step | M | `t2` | unit: VS Code manifest declares insrc.models.tiers.<tier>.effort matching the catalog, and the tier picker offers an effort step for CLI runners and writes ['models','tiers',tier,'effort'] (from the plugin's bundled catalog, whatever the daemon's) | [[c6]] |
| 7 | **`t7`** JetBrains: effort combo in the model-tiers section | M | `t2` | unit: JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write; ModelTiersSection shows an effort combo per tier; with no effort row in the daemon's catalog it shows no effort combo and emits no effort write | [[c7]] [[c8]] |
| 8 | **`t8`** Live checks, full sweep, one daemon update and the motivating config | S | `t4`, `t5`, `t6`, `t7` | live: a codex CliProvider with model gpt-6.1-sol and effort high runs and codex reports reasoning effort high; live: a claude CliProvider with effort low runs, and claude given an unknown --effort value warns and runs at its default | [[c9]] [[c10]] |

### 1.1 E20261023a27df028:S001:T001 — Effort in the tier config: parse, fallback and derived fields

TierModel gains optional effort; parseTieringOverride reads it on the global tiers (invalid value dropped alone with a warning), records it in TieringOverride.efforts even when the tier is dropped, and ignores an effort under a byRepo tier with a warning. resolveTiers carries efforts[tier] onto a DEFAULT_TIERS fallback; assembleConfig derives AnalyzeConfig.shaperEffort (core) and summariserEffort (cheap). Existing tests that deepEqual {runner, model} still pass.

**Acceptance checks:**
- A global tier with effort low|medium|high|xhigh|max parses with that effort; '' or absent gives none
- An invalid global effort is dropped with a warning and the tier keeps its runner and model
- An effort under models.byRepo[repo].tiers.<tier> is ignored with a warning; the byRepo tier's runner/model are unchanged
- core.model '' with core.effort high: resolveTiers gives DEFAULT_TIERS.core runner/model with effort high and shaperEffort is high; shaperProviderExplicit/shaperModelExplicit unchanged
- summariserEffort is the resolved cheap tier's effort

### 1.2 E20261023a27df028:S001:T002 — Declare the three effort rows in the config catalog

Add models.tiers.{core,mid,cheap}.effort to src/config/config-catalog.ts: enum ['', 'low','medium','high','xhigh','max'], default '', group 'Models — tiers'; raise the contract test's row count to 48.

**Acceptance checks:**
- The catalog has the three rows with the enum values and '' default, and 48 rows in total
- The catalog contract tests pass (enum default in enumValues, reconcile idempotent)

### 1.3 E20261023a27df028:S001:T003 — CliProvider passes the effort to the CLI

CliProviderOpts gains effort; modelArgs appends claude ['--effort', e] or codex ['-c', `model_reasoning_effort=${e}`] after the model args, so complete, structured, edit session and both review sessions carry it. Without effort the argv is unchanged.

**Acceptance checks:**
- With effort, every claude invocation carries --effort <e> and every codex invocation carries -c model_reasoning_effort=<e>
- Without effort every argv is byte-identical to today's (existing exact-argv tests pass)

### 1.4 E20261023a27df028:S001:T004 — Route the global tier's effort to every provider

RoleResolution gains effort (the global tier of the resolved tier name, also when a byRepo tier supplies runner/model); materialize always passes roleEffort (null when unset); ShaperProviderOverrides.roleEffort; buildShaperProvider uses roleEffort when a value, none when null, cfg.shaperEffort when absent, CLI branch only; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes resolution.effort.

**Acceptance checks:**
- A routed role gets the global tier's effort, including when a byRepo tier sets its runner/model
- Core effort set, mid unset: a routed mid role's provider has no effort; a non-router caller (code-review-rpc, workflow-rpc, docgen path) gets the core effort
- The Ollama branch ignores effort
- The summariser provider and its stamped resolution carry the cheap tier's effort; the validate provider carries the build tier's effort

### 1.5 E20261023a27df028:S001:T005 — TUI: effort row per tier

tierFieldPath accepts 'effort'; computeEffectiveTiers carries each tier's effort including tiering.efforts on a fallback; ModelTiersPane shows a third row per tier that cycles CLI default/low/medium/high/xhigh/max and writes models.tiers.<tier>.effort; row count and indices move to three rows per tier.

**Acceptance checks:**
- The pane shows an effort row per tier and writing it sets models.tiers.<tier>.effort ('' for CLI default)
- core.model '' with core.effort high shows effort high
- Runner, model and coreFloor rows still edit their keys

### 1.6 E20261023a27df028:S001:T006 — VS Code: manifest entries and tier-picker effort step

Add insrc.models.tiers.{core,mid,cheap}.effort to vscode-plugin/package.json matching the catalog rows; the tier picker adds an effort step (CLI default + five values) after the model step for CLI runners and writes ['models','tiers',tier,'effort']. The seven keys the manifest already lacked (outside this Story) stay out of scope.

**Acceptance checks:**
- The manifest declares the three effort keys with the catalog's type/default/enum: the manifest-catalog test no longer lists them as missing or mismatched (its seven pre-existing missing keys are out of scope)
- The picker offers the effort step for CLI runners and writes the chosen value; an Ollama runner gets no effort step

### 1.7 E20261023a27df028:S001:T007 — JetBrains: effort combo in the model-tiers section

ModelTiersModel's TierState gains effort seeded from the catalog row (saved and pending), collectWrites emits ['models','tiers',tier,'effort'] when changed; ModelTiersSection adds an effort combo per tier; with no effort row in the daemon's catalog the combo is hidden and nothing is written.

**Acceptance checks:**
- The model seeds effort from the catalog, tracks a pending change and emits the effort write
- With no effort row in the catalog no combo is shown and no write is emitted
- The JetBrains test suite passes under Gradle

### 1.8 E20261023a27df028:S001:T008 — Live checks, full sweep, one daemon update and the motivating config

Run the live CLI checks (codex gpt-6.1-sol at high reports reasoning effort high; claude at low runs and warns on an unknown value) and the full test sweep. Set models.tiers.core.effort = high and models.tiers.mid.effort = medium, then update and restart the installed daemon once: that single update also ships ISSUE-1973e125's fix and Epic 86197ac6 s2, so it serves both stories.

**Acceptance checks:**
- codex reports reasoning effort high for a CliProvider at high; claude runs at low and warns on an unknown value
- Full test sweep passes
- ~/.insrc/config.json has core effort high and mid effort medium before the restart, and the one updated daemon runs with them

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| parseTiering reads effort on the global core/mid/cheap tiers; an effort under models.byRepo[repo].tiers is ignored with a warning; '' and absent give no effort | `t1` |
| an effort outside low\|medium\|high\|xhigh\|max is dropped with a warning while the tier keeps its runner and model | `t1` |
| the catalog declares models.tiers.{core,mid,cheap}.effort as enum ['', 'low','medium','high','xhigh','max'] with default '' (48 rows) | `t2` |
| a global tier dropped for an empty or invalid model keeps its configured effort on the DEFAULT_TIERS fallback (assembleConfig's shaperEffort / summariserEffort) | `t1` |
| the role router takes the effort of the global tier the role resolves to, also when a byRepo tier supplies its runner and model, and buildShaperProvider hands it to CliProvider; the Ollama branch ignores it | `t4` |
| buildShaperProvider without roleEffort uses cfg.shaperEffort (code-review-rpc, workflow-rpc and docgen callers), also when a repo override sets the runner; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes the build tier's effort | `t4` |
| with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort | `t4` |
| with effort, claude invocations carry --effort <e> and codex invocations carry -c model_reasoning_effort=<e>, in complete, structured, edit session and both review sessions | `t3` |
| without effort every argv is byte-identical to today's | `t3` |
| TUI ModelTiersPane shows an effort row per tier, cycles CLI default/low/medium/high/xhigh/max and writes models.tiers.<tier>.effort | `t5` |
| VS Code manifest declares insrc.models.tiers.<tier>.effort matching the catalog, and the tier picker offers an effort step for CLI runners and writes ['models','tiers',tier,'effort'] (from the plugin's bundled catalog, whatever the daemon's) | `t6` |
| JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write; ModelTiersSection shows an effort combo per tier; with no effort row in the daemon's catalog it shows no effort combo and emits no effort write | `t7` |
| computeEffectiveTiers shows a tier's effort, including tiering.efforts on a DEFAULT_TIERS fallback: core.model '' with core.effort 'high' shows effort high | `t5` |
| a codex CliProvider with model gpt-6.1-sol and effort high runs and codex reports reasoning effort high | `t8` |
| a claude CliProvider with effort low runs, and claude given an unknown --effort value warns and runs at its default | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails: TierModel, parseTieringOverride, TieringOverride, resolveTiers, assembleConfig`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges: config models.tiers.<core|mid|cheap>.effort catalog rows`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails: RoleResolution, ShaperProviderOverrides, resolveSummariser, resolveValidateProvider`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails: CliProviderOpts, modelArgs`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails: tierFieldPath, computeEffectiveTiers (TUI ModelTiersPane)`
- **[[c6]]** `prior-artifact` `LLD S001 dataModelChanges: VS Code manifest insrc.models.tiers.<tier>.effort and tier picker`
- **[[c7]]** `prior-artifact` `LLD S001 dataModelChanges: JetBrains TierState`
- **[[c8]]** `prior-artifact` `LLD S001 errorPaths (invalid effort, per-repo effort ignored, CLI refusal, older daemon, edge cases)`
- **[[c9]]** `prior-artifact` `LLD S001 migration.migrationSteps order 7 (update the installed daemon, set core high and mid medium)`
- **[[c10]]** `prior-artifact` `LLD S001 testStrategy live level (codex and claude effort checks)`
