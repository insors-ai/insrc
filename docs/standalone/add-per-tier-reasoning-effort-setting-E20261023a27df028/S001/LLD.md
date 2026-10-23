<!-- insrc:artifact LLD-a27df0280289e6c6-S001 -->

# LLD: E20261023a27df028:S001

## Summary

**Epic:** `add-per-tier-reasoning-effort-setting`
**HLD base run:** `wf-1792733816083-gtu5hw`
**HLD effective hash:** `a27df0280289...`

Each global model tier (core, mid, cheap) gains an optional reasoning effort: low, medium, high, xhigh or max. When a tier runs on the claude or codex CLI, insrc passes that effort to the CLI with its own flag; when it is unset, the call is exactly as today. The effort belongs to the global tiers only: a per-repo entry cannot set it, and every function resolved to a tier runs at that tier's global effort. The effort is declared in the config catalog, so the insrc TUI tier pane, the VS Code settings and tier picker, and the JetBrains model-tiers section can all show and set it beside the tier's runner and model.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TierModel`

```typescript
interface TierModel { readonly runner: AnalyzeShaperProviderKind; readonly model: string; readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined }
```

**Parameters:**
- `effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined` _(optional)_ — New. The reasoning effort the tier's CLI runs at; absent means the CLI's own default

**Returns:** `n/a (config type)` — Carried from config through the role router to the provider

**Postconditions:**
- A tier without effort is exactly today's TierModel

### 2.2 `parseTieringOverride`

```typescript
function parseTieringOverride(src: Record<string, unknown>, where: string): TieringOverride  // unchanged signature; also reads val['effort'] on the global scope
```

**Parameters:**
- `src: Record<string, unknown>` — The global models section or one byRepo entry, as today

**Returns:** `TieringOverride` — Each valid global tier now carries effort when the config sets one of the five values

**Errors:**
- `warning (logged), not thrown` when a global tier's effort is present but not '' and not one of low|medium|high|xhigh|max: the effort alone is dropped with a warning naming the tier; the tier keeps its runner and model
- `warning (logged), not thrown` when a models.byRepo[repo].tiers.<tier> entry carries an effort: the effort is ignored with a warning saying effort is set on the global tiers only; the byRepo tier's runner and model apply as today

**Postconditions:**
- '' or absent effort leaves the tier without effort
- Only the global scope reads effort; parseTiering's byRepo entries never carry one

### 2.3 `RoleResolution`

```typescript
interface RoleResolution { readonly role: string; readonly tier: TierName; readonly runner: AnalyzeShaperProviderKind; readonly model: string; readonly effort?: TierModel['effort']; readonly clampedByFloor: boolean }
```

**Parameters:**
- `effort: TierModel['effort']` _(optional)_ — New. The effort of the GLOBAL tier the role resolves to (models.tiers.<tier>.effort, including its DEFAULT_TIERS fallback), also when a byRepo tier supplies the runner and model; the router passes it on as roleEffort to buildShaperProvider

**Returns:** `n/a` — Read by materialize (src/analyze/context/role-router.ts) and by resolveValidateProvider (src/daemon/steps/build-step/phases/validate.ts)

**Postconditions:**
- The effort always comes from the global tier of the resolved tier name; a per-repo override changes which tier a role uses or that tier's runner/model, never its effort
- materialize always forwards it to buildShaperProvider as roleEffort, as null when the tier has no effort, so the routed path never falls back to cfg.shaperEffort

### 2.4 `ShaperProviderOverrides`

```typescript
interface ShaperProviderOverrides { /* existing fields */ readonly roleEffort?: TierModel['effort'] | null }
```

**Parameters:**
- `roleEffort: TierModel['effort'] | null` _(optional)_ — New. Set by the role router's materialize on every routed call: the resolved global tier's effort, or null when that tier has none (routed, no effort flag). Absent only for the callers outside the router (code-review-rpc defaultProvider, workflow-rpc's run-wide provider, docgen's narrative-generator), which run at the global core tier's effort, cfg.shaperEffort

**Returns:** `n/a` — Read by buildShaperProvider

**Postconditions:**
- buildShaperProvider's effort: roleEffort when it is a value; none when roleEffort is null; cfg.shaperEffort only when roleEffort is absent (a non-router caller)
- A routed mid or cheap role never inherits the core tier's effort: with core at max and mid unset, a mid role sends no effort flag
- A repo override (repoOverride) changes the runner as today but not the effort
- The effort reaches CliProvider only on buildShaperProvider's CLI branch; the Ollama branch ignores it
- buildSummariserProvider passes cfg.summariserEffort to its CliProvider

### 2.5 `CliProviderOpts`

```typescript
interface CliProviderOpts { /* existing fields */ readonly effort?: TierModel['effort'] }
```

**Parameters:**
- `effort: TierModel['effort']` _(optional)_ — New. The reasoning effort for every invocation of this provider

**Returns:** `n/a` — Stored by the CliProvider constructor and read by modelArgs

### 2.6 `modelArgs`

```typescript
private modelArgs(opts?: CompletionOpts | StructuredCompletionOpts): string[]
```

**Returns:** `string[]` — Today's ['--model', model] (or []) followed by the effort flag: claude ['--effort', effort]; codex ['-c', `model_reasoning_effort=${effort}`]; nothing when effort is unset

**Postconditions:**
- Every invocation that uses modelArgs (complete, completeStructuredOnce, runEditSession, and both review sessions through claudeReviewSessionArgs and codexReviewSessionArgs) carries the effort
- Without effort the argv is byte-identical to today's

### 2.7 `resolveValidateProvider`

```typescript
unchanged; builds new CliProvider({ kind, model, effort: resolution.effort })
```

**Returns:** `LLMProvider` — The validate session's provider now runs at the build tier's effort

**Postconditions:**
- The claude fallback for a non-CLI runner keeps no effort

### 2.8 `tierFieldPath`

```typescript
function tierFieldPath(tier: TierName, field: 'runner' | 'model' | 'effort'): string
```

**Parameters:**
- `field: 'runner' | 'model' | 'effort'` — Adds 'effort' so the TUI pane can address models.tiers.<tier>.effort

**Returns:** `string` — models.tiers.<tier>.<field>

**Postconditions:**
- src/cli/panes/ModelTiersPane.tsx shows a third row per tier (effort) that cycles '' (shown as 'CLI default'), low, medium, high, xhigh, max and writes it with config.write; its fixed row count and indices move from two to three rows per tier

### 2.9 `computeEffectiveTiers`

```typescript
unchanged signature; the effective tier rows carry effort
```

**Returns:** `effective tiers` — Includes each tier's effort so the pane can display it: the tier's own effort when the global tier is kept, else tiering.efforts[tier] on the DEFAULT_TIERS fallback (the same rule as resolveTiers)

**Postconditions:**
- src/cli/panes/ModelTiersPane.tsx (which calls computeEffectiveTiers(parseTiering(models))) shows core effort high on an install whose core.model is the catalog default '' and whose core.effort is high

### 2.10 `TieringOverride`

```typescript
interface TieringOverride { /* existing fields */ readonly efforts?: Readonly<Partial<Record<TierName, NonNullable<TierModel['effort']>>>> | undefined }
```

**Parameters:**
- `efforts: Partial<Record<TierName, effort>>` _(optional)_ — New, global scope only. Each global tier entry's valid effort, recorded by parseTieringOverride even when the tier itself is dropped (an empty or invalid model), so the effort survives the DEFAULT_TIERS fallback

**Returns:** `n/a` — Read by resolveTiers (config) and computeEffectiveTiers (the TUI pane), which apply the same fallback rule

**Postconditions:**
- byRepo entries never carry efforts

### 2.11 `resolveTiers`

```typescript
function resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel>  // unchanged signature
```

**Returns:** `Record<TierName, TierModel>` — As today, a missing tier is DEFAULT_TIERS[tier]; it now carries tiering.efforts[tier] when the global config set one, so models.tiers.core.effort = high applies on an install whose core.model is the catalog default ''

**Postconditions:**
- runner and model of a fallback tier are exactly today's DEFAULT_TIERS values
- shaperProviderExplicit and shaperModelExplicit keep reading tiering.tiers, so a fallback with an effort is still not 'explicit'

### 2.12 `assembleConfig`

```typescript
function assembleConfig(tiering: AnalyzeTiering, shaper: AnalyzeShaperConfig, maxPlanDepth: MaxPlanDepthMap): AnalyzeConfig  // unchanged signature; AnalyzeConfig gains shaperEffort?: TierModel['effort'] and summariserEffort?: TierModel['effort']
```

**Returns:** `AnalyzeConfig` — shaperEffort = the resolved core tier's effort and summariserEffort = the resolved cheap tier's effort, derived like shaperModel and summariserModel

**Postconditions:**
- buildShaperProvider falls back to cfg.shaperEffort and buildSummariserProvider uses cfg.summariserEffort

### 2.13 `resolveSummariser`

```typescript
resolveSummariser(cfg: AnalyzeConfig): { provider: LLMProvider; resolution: RoleResolution }  // unchanged signature
```

**Returns:** `{ provider, resolution }` — The stamped RoleResolution carries effort: cfg.summariserEffort, matching the provider buildSummariserProvider built

## 3. Data model changes

### 3.1 `config models.tiers.<core|mid|cheap>.effort` — field-add

Three catalog rows in src/config/config-catalog.ts, group 'Models — tiers', type enum, enumValues ['', 'low', 'medium', 'high', 'xhigh', 'max'], default '' meaning the CLI's own default. '' is a declared value so reconcile's fill and the VS Code sync's enum validation accept it. The contract test's row count goes from 45 to 48. AnalyzeConfig gains shaperEffort and summariserEffort, derived in assembleConfig from the resolved global core and cheap tiers. Decision (user, 2026-10-23): the effort is set only on the global model tiers. A per-repo entry cannot set it; per-repo config only chooses which tier a function uses (and, as today, may point a tier at another runner or model).

```
+ models.tiers.core.effort: '' | low | medium | high | xhigh | max = ''
+ models.tiers.mid.effort:  (same)
+ models.tiers.cheap.effort: (same)
```

**Call sites:**
- `src/config/config-catalog.ts:113-118`
- `src/config/analyze.ts:341-375`
- `src/config/__tests__/config-catalog-contract.test.ts:88-89`
- `src/config/analyze.ts:224-256`
- `src/analyze/context/shaper-provider.ts:214-262`
- `src/analyze/context/shaper-provider.ts:280-298`
- `src/analyze/context/role-router.ts:135-153`
- `src/analyze/context/role-router.ts:199-211`
- `src/cli/panes/model-tiers.ts:58-92`

### 3.2 `VS Code manifest insrc.models.tiers.<tier>.effort` — field-add

Three contributions in vscode-plugin/package.json mirroring the catalog rows (type string, enum ['', 'low', 'medium', 'high', 'xhigh', 'max'], default '', scope machine), so the native Settings UI and settings sync show them; manifest-catalog.test.ts requires the match. The tier picker (vscode-plugin/src/models/model-tier-picker.ts) adds an effort step after the model step for CLI runners and writes ['models','tiers',tier,'effort'].

**Call sites:**
- `vscode-plugin/package.json:296-363`
- `vscode-plugin/src/models/model-tier-picker.ts:272-306`
- `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts:39-69`

### 3.3 `JetBrains TierState` — field-add

ModelTiersModel's TierState gains effort (default from the catalog row models.tiers.<tier>.effort, saved and pending); collectWrites emits ['models','tiers',tier,'effort'] when it changed; ModelTiersSection adds an effort combo per tier ('CLI default', low, medium, high, xhigh, max). The rows stay out of the generic table through the existing models.tiers.* filter in InsrcSettingsConfigurable.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:36-64`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:175-184`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt:98-146`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:210-221`

## 4. Error paths

**Error cases**

- **The config sets a tier's effort to a value that is not one of '', low, medium, high, xhigh, max (a typo such as 'hgh', a number, an object)** (recoverable)
  - Detection: parseTieringOverride checks val['effort'] against the five values and ''
  - Response: Log a warning naming the tier and the value; drop only the effort; keep the tier's runner and model
  - User impact: That tier runs at the CLI's default effort and the warning in the daemon log says why
- **A per-repo tier entry (models.byRepo[repo].tiers.<tier>) carries an effort** (recoverable)
  - Detection: parseTieringOverride, parsing a byRepo entry, finds an effort key on a tier
  - Response: Ignore the effort and log a warning saying effort is set on the global model tiers only; the byRepo tier's runner and model apply as today
  - User impact: The functions of that repo run at the global tier's effort; the warning says why the per-repo value had no effect
- **A model refuses an effort insrc passed (insrc passes only low, medium, high, xhigh or max, checked when the config is parsed)** (recoverable)
  - Detection: codex rejects an unsupported value with HTTP 400 'Invalid value ... Supported values are ...' and exits 1 (probed with codex 0.164: an unknown value exits 1); CliProvider's existing failure handling reads its stderr. claude does not fail: with an unknown --effort value it warns 'Unknown --effort value ... ignoring it and using the default effort' and exits 0 (probed)
  - Response: codex: the call fails as any CLI failure does today, with codex's message in the error (no retry without the effort, no silent downgrade). claude: the call runs at claude's default effort and its warning is in the CLI's stderr
  - User impact: A codex run or review on that tier fails with codex's message and the user lowers or clears the effort; a claude tier runs at its default effort
- **A settings surface sets an effort while the daemon is older than this change (its catalog has no effort rows)** (recoverable)
  - Detection: VS Code: nothing detects it; the native setting and the tier picker come from the plugin's own manifest and bundled catalog, and the write goes through config.write, which stores any path. JetBrains: ModelTiersModel finds no models.tiers.<tier>.effort row in the catalog the daemon serves
  - Response: VS Code shows the effort control and the write is stored; the older daemon parses only runner and model and ignores the key. JetBrains shows no effort combo for that tier and writes nothing
  - User impact: With an older daemon a VS Code effort has no effect until the daemon is updated, after which the stored value applies without being set again; JetBrains offers the control once the daemon is updated

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tier on the ollama runner with effort set | Ignored: buildShaperProvider's Ollama branch takes no effort; no error |
| effort is '' (the catalog default reconcile fills in) | Same as absent: no effort flag, today's argv |
| A byRepo tier sets runner and model for a tier whose global entry has effort high | The role uses the byRepo runner and model at the global tier's effort, high |
| A global tier whose runner or model is invalid (or whose model is '', the catalog default for core) and whose effort is valid | The tier is dropped as today and falls back to DEFAULT_TIERS; the fallback carries the tier's configured effort (resolveTiers applies the global efforts entry) |
| The user changes a tier's runner in a settings surface | The effort is kept; the user can change or clear it separately |
| effort set on the cheap tier | buildSummariserProvider passes it to the summariser's CliProvider |
| effort 'max' on a codex tier running gpt-6.1-sol | Passed as -c model_reasoning_effort=max; codex's model catalog (codex debug models) lists low, medium, high, xhigh, max and ultra for gpt-6.1-sol, and claude --effort accepts low, medium, high, xhigh and max |
| A byRepo tier with an empty or invalid model | The byRepo tier is dropped as today, so that repo uses the global tier, at the global tier's effort |
| A code review (code-review-rpc defaultProvider) for a repo whose byRepo core tier sets a runner | The provider uses the byRepo runner as today and the global core tier's effort (cfg.shaperEffort) |
| Core tier effort max, mid tier effort unset, a role routed to mid | No effort flag for that role: the router passes roleEffort null, so the mid model runs at its CLI default and never inherits core's max |

**Invariants to preserve**

- A tier is dropped whole only when its runner or model is invalid (parseTieringOverride), and whole-tier fallback to DEFAULT_TIERS is unchanged [[c1]]
- Without effort, every CLI invocation's argv is byte-identical to today's (exact-argv tests in src/agent/providers/__tests__/cli-review-session.test.ts) [[c4]]
- Tier precedence for runner and model: byRepo tier, else global tier, else DEFAULT_TIERS (src/analyze/context/role-router.ts:135-136); the effort is always the global tier's [[c3]]
- The VS Code manifest declares exactly the catalog's keys with matching type/default/enum (manifest-catalog.test.ts) [[c6]]
- Reconcile prunes only RETIRED_PATHS; models.tiers is not retired [[c2]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test) for src/** and vscode-plugin/src/** (__tests__/*.test.ts); JUnit via Gradle (./gradlew test) for jetbrains-plugin/src/test/kotlin`

**Test levels**

- **unit** — Config: the effort is parsed on the global tiers, a per-repo effort is ignored, and a bad value is dropped alone
  - Subjects: `parseTiering reads effort on the global core/mid/cheap tiers; an effort under models.byRepo[repo].tiers is ignored with a warning; '' and absent give no effort`, `an effort outside low|medium|high|xhigh|max is dropped with a warning while the tier keeps its runner and model`, `the catalog declares models.tiers.{core,mid,cheap}.effort as enum ['', 'low','medium','high','xhigh','max'] with default '' (48 rows)`, `a global tier dropped for an empty or invalid model keeps its configured effort on the DEFAULT_TIERS fallback (assembleConfig's shaperEffort / summariserEffort)`
- **unit** — Routing: the effort travels with the tier to the provider
  - Subjects: `the role router takes the effort of the global tier the role resolves to, also when a byRepo tier supplies its runner and model, and buildShaperProvider hands it to CliProvider; the Ollama branch ignores it`, `buildShaperProvider without roleEffort uses cfg.shaperEffort (code-review-rpc, workflow-rpc and docgen callers), also when a repo override sets the runner; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes the build tier's effort`, `with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort`
- **unit** — CliProvider argv
  - Subjects: `with effort, claude invocations carry --effort <e> and codex invocations carry -c model_reasoning_effort=<e>, in complete, structured, edit session and both review sessions`, `without effort every argv is byte-identical to today's`
- **unit** — Settings surfaces
  - Subjects: `TUI ModelTiersPane shows an effort row per tier, cycles CLI default/low/medium/high/xhigh/max and writes models.tiers.<tier>.effort`, `VS Code manifest declares insrc.models.tiers.<tier>.effort matching the catalog, and the tier picker offers an effort step for CLI runners and writes ['models','tiers',tier,'effort'] (from the plugin's bundled catalog, whatever the daemon's)`, `JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write; ModelTiersSection shows an effort combo per tier; with no effort row in the daemon's catalog it shows no effort combo and emits no effort write`, `computeEffectiveTiers shows a tier's effort, including tiering.efforts on a DEFAULT_TIERS fallback: core.model '' with core.effort 'high' shows effort high`
- **live** — The real CLI honours the flag
  - Subjects: `a codex CliProvider with model gpt-6.1-sol and effort high runs and codex reports reasoning effort high`, `a claude CliProvider with effort low runs, and claude given an unknown --effort value warns and runs at its default`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `parseTiering reads effort on the global core/mid/cheap tiers; an effort under models.byRepo[repo].tiers is ignored with a warning; '' and absent give no effort`, `an effort outside low|medium|high|xhigh|max is dropped with a warning while the tier keeps its runner and model`, `a global tier dropped for an empty or invalid model keeps its configured effort on the DEFAULT_TIERS fallback (assembleConfig's shaperEffort / summariserEffort)` |
| `ac2` | `the role router takes the effort of the global tier the role resolves to, also when a byRepo tier supplies its runner and model, and buildShaperProvider hands it to CliProvider; the Ollama branch ignores it`, `buildShaperProvider without roleEffort uses cfg.shaperEffort (code-review-rpc, workflow-rpc and docgen callers), also when a repo override sets the runner; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes the build tier's effort`, `with effort, claude invocations carry --effort <e> and codex invocations carry -c model_reasoning_effort=<e>, in complete, structured, edit session and both review sessions`, `a codex CliProvider with model gpt-6.1-sol and effort high runs and codex reports reasoning effort high`, `a claude CliProvider with effort low runs, and claude given an unknown --effort value warns and runs at its default`, `with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort` |
| `ac3` | `without effort every argv is byte-identical to today's`, `with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort` |
| `ac4` | `the catalog declares models.tiers.{core,mid,cheap}.effort as enum ['', 'low','medium','high','xhigh','max'] with default '' (48 rows)`, `TUI ModelTiersPane shows an effort row per tier, cycles CLI default/low/medium/high/xhigh/max and writes models.tiers.<tier>.effort`, `VS Code manifest declares insrc.models.tiers.<tier>.effort matching the catalog, and the tier picker offers an effort step for CLI runners and writes ['models','tiers',tier,'effort'] (from the plugin's bundled catalog, whatever the daemon's)`, `JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write; ModelTiersSection shows an effort combo per tier; with no effort row in the daemon's catalog it shows no effort combo and emits no effort write`, `computeEffectiveTiers shows a tier's effort, including tiering.efforts on a DEFAULT_TIERS fallback: core.model '' with core.effort 'high' shows effort high` |

## 6. Migration

**State before:** A tier is { runner, model } (src/config/analyze.ts:106-109); parseTieringOverride ignores any other key (:341-375), so an effort in config has no effect. CliProvider's modelArgs adds only --model (src/agent/providers/cli-provider.ts:505-515), and the CLIs run at their own default effort (codex: ~/.codex/config.toml, global). The catalog has two rows per tier (src/config/config-catalog.ts:113-118); the TUI pane, the VS Code manifest and tier picker and the JetBrains ModelTiersSection edit runner and model only (s1: TUI, VS Code and JetBrains bundles).

**State after:** Each global tier may carry effort (low|medium|high|xhigh|max); the router and buildShaperProvider/buildSummariserProvider/resolveValidateProvider hand the global tier's effort to CliProvider, which passes --effort (claude) or -c model_reasoning_effort (codex); a per-repo entry cannot set it. Three catalog rows declare it with default '' (CLI default); the TUI, VS Code (native settings and tier picker) and JetBrains model-tiers section show and set it.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional effort to TierModel and parse it on the global tiers (also recording it for a tier that falls back to DEFAULT_TIERS); invalid values are dropped alone with a warning, and an effort under a byRepo tier is ignored with a warning — ↩ rollbackable
2. Carry the global tier's effort through RoleResolution, ShaperProviderOverrides.roleEffort, AnalyzeConfig (shaperEffort, summariserEffort, derived in assembleConfig; resolveTiers carries a global tier's effort onto its DEFAULT_TIERS fallback), buildSummariserProvider, resolveSummariser and resolveValidateProvider into CliProviderOpts; CliProvider's modelArgs appends the CLI's effort flag when set — ↩ rollbackable
3. Declare the three catalog rows (enum with '' default) and raise the contract test's row count to 48; reconcile fills effort: '' into existing configs on the next daemon boot — ↩ rollbackable
4. TUI: add an effort row per tier to ModelTiersPane (tierFieldPath gains 'effort'; row count and indices move to three per tier) — ↩ rollbackable
5. VS Code: add the three manifest entries mirroring the catalog and an effort step to the tier picker — ↩ rollbackable
6. JetBrains: add effort to ModelTiersModel's TierState and writes, and an effort combo to ModelTiersSection — ↩ rollbackable
7. Update the installed daemon and set models.tiers.core.effort = high and models.tiers.mid.effort = medium in ~/.insrc/config.json (the motivating configuration) — ↩ rollbackable

**Backward compat:** Additive. TierModel, TieringOverride, RoleResolution, ShaperProviderOverrides, AnalyzeConfig and CliProviderOpts gain optional fields; callers that set none get today's argv byte for byte. Existing configs gain effort: '' (unset) through reconcile's fill. An older daemon ignores an effort key a newer surface wrote (it parsed only runner/model). An effort under a byRepo tier is ignored with a warning.

## 7. Alternatives considered

### 7.1 a1: Optional effort on TierModel, declared as catalog enum rows — **CHOSEN**

TierModel gains an optional effort; three catalog enum rows models.tiers.<tier>.effort (values '', low, medium, high, xhigh, max; default '' = the CLI's own default) drive every settings surface; the effort travels with the runner/model to CliProvider, which adds the CLI's own flag.



### 7.2 a2: Undeclared optional key, read only by the daemon

Parse models.tiers.<tier>.effort in the daemon and pass it to the CLI, without catalog rows; each settings surface special-cases the key.



**Rejected because:** Meets the CLI side but only partly the every-surface constraint.

### 7.3 a3: Effort encoded in the model id

Write the effort into the model string (e.g. 'gpt-6.1-sol@high'); the CLI provider splits it.



**Rejected because:** Cheapest, but overloads the model id and still needs picker work while losing validation.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 data-model.trace: TierModel and tier parsing (src/config/analyze.ts:106-109, src/config/analyze.ts:341-375)`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate: config catalog tier rows and reconcile (src/config/config-catalog.ts:113-118, src/config/reconcile.ts:370-400)`
- **[[c3]]** `analyze-bundle` `s1 usage.example: tier to CliProvider path (src/analyze/context/role-router.ts:135-136, src/analyze/context/shaper-provider.ts:247-251)`
- **[[c4]]** `analyze-bundle` `s1 symbol.locate: CliProvider argument building (src/agent/providers/cli-provider.ts:505-515) and exact-argv tests (src/agent/providers/__tests__/cli-review-session.test.ts)`
- **[[c5]]** `analyze-bundle` `s1 usage.example: TUI model-tiers pane (src/cli/panes/ModelTiersPane.tsx:89-127, src/cli/panes/model-tiers.ts:95-97)`
- **[[c6]]** `analyze-bundle` `s1 usage.example: VS Code tier picker and settings sync (vscode-plugin/src/models/model-tier-picker.ts:272-306, vscode-plugin/src/config/__tests__/manifest-catalog.test.ts:39-69)`
- **[[c7]]** `analyze-bundle` `s1 usage.example: JetBrains tier settings (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:36-64)`
- **[[c8]]** `analyze-bundle` `s1 test.locate: tests pinning tier shapes and CLI args`

## 9. Open questions

- ts1 (partial): the Story declares no acceptanceCriteria; the test strategy maps four criteria (ac1-ac4) derived from the story text: per-tier parsing on the global tiers, passing the effort to the CLI, unchanged behaviour when unset, and every settings surface.
- Resolved (user, 2026-10-23): no per-repo effort. The effort is set only on the global model tiers; per-repo config only chooses which tier a function uses.

## Resolved questions

- `q8faa690b` — Resolved (user, 2026-10-23): no per-repo effort. The effort is set only on the global model tiers; per-repo config only chooses which tier a function uses.
  - **resolved**: Effort on global tiers only (as resolved) — User 2026-10-23: no per-repo override; per-repo config only chooses which tier a function uses. _(2026-10-23T06:14:55.148Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 data-model.trace: TierModel and tier parsing (src/config/analyze.ts:106-109, src/config/analyze.ts:341-375)`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate: config catalog tier rows and reconcile (src/config/config-catalog.ts:113-118, src/config/reconcile.ts:370-400)`
- **[[c3]]** `analyze-bundle` `s1 usage.example: tier to CliProvider path (src/analyze/context/role-router.ts:135-136, src/analyze/context/shaper-provider.ts:247-251)`
- **[[c4]]** `analyze-bundle` `s1 symbol.locate: CliProvider argument building (src/agent/providers/cli-provider.ts:505-515) and exact-argv tests (src/agent/providers/__tests__/cli-review-session.test.ts)`
- **[[c5]]** `analyze-bundle` `s1 usage.example: TUI model-tiers pane (src/cli/panes/ModelTiersPane.tsx:89-127, src/cli/panes/model-tiers.ts:95-97)`
- **[[c6]]** `analyze-bundle` `s1 usage.example: VS Code tier picker and settings sync (vscode-plugin/src/models/model-tier-picker.ts:272-306, vscode-plugin/src/config/__tests__/manifest-catalog.test.ts:39-69)`
- **[[c7]]** `analyze-bundle` `s1 usage.example: JetBrains tier settings (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:36-64)`
- **[[c8]]** `analyze-bundle` `s1 test.locate: tests pinning tier shapes and CLI args`
