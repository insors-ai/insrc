<!-- insrc:artifact PLAN-ba132c185fe45860-s4 -->

# Plan: E20260923ba132c18:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790176921142-iazckt`
**LLD effective hash:** `3fb0b2204d88...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add DaemonGateway.listModels + the sealed ModelListResult | M | — | unit: gateway: {available:true,models:[{id,displayName?}]} → Loaded(true, models) mapped id+displayName; unit: gateway: {available:false,models:[]} (ok=true) → Loaded(false, []) — NOT Unavailable; unit: gateway: {available:true,models:[]} → Loaded(true, []); unit: gateway: ok=false/structured-error → Unavailable; DaemonUnavailableException → Unavailable (never throws); unit: gateway: a malformed models entry (missing/blank id, or models not a list) is skipped defensively; unit: gateway: the call passes method 'providers.listModels' + params {provider: <value>} | [[c2]] [[c3]] |
| 2 | **`t2`** Add the pure headless ModelTiersModel (k7 state machine) | M | `t1` | unit: a Loaded list → modelOptions(tier) is exactly the daemon's ids (dropdown-only), pre-selects the saved model (marked current); unit: Unavailable → a single disabled 'no models available' sentinel; collectWrites emits nothing (saved untouched); unit: Loaded(false,[]) AND Loaded(true,[]) → same 'no models available' presentation, no write; unit: a saved OVERRIDE absent from a Loaded list → disabled '(current, not in catalog)' entry; selectModel(otherId) emits PendingWrite(['models','tiers',tier,'model'], otherId); unit: a saved built-in DEFAULT (not an override) absent from the list → NO '(current, not in catalog)' entry; unit: selectRunner(tier, newProvider) clears the pending model + re-derives from listsByProvider[newProvider]; collectWrites emits runner then (on re-pick) model; unit: selecting the already-saved model is an idempotent no-op (collectWrites emits nothing); unit: a defaulted tier runner resolves the CONFIG_CATALOG default; isModified false with no edits, true after a select, false again after reset | [[c1]] [[c4]] |
| 3 | **`t3`** Add the ModelTiersSection (Swing) over the pure model | M | `t2` | unit: source-scan: the model combo is constructed NON-editable (no setEditable(true)) — dropdown-only (k4); unit: source-scan: the Refresh action runs off the EDT (ProgressManager/executeOnPooledThread); ModelTiersSection imports no cloud/HTTP client | [[c4]] [[c5]] |
| 4 | **`t4`** Wire ModelTiersSection into InsrcSettingsConfigurable + exclude models.tiers.* from the generic table | S | `t3` | unit: source-scan: InsrcSettingsConfigurable registers ModelTiersSection in renderBody AND excludes models.tiers.* from the generic category table (no duplication); unit: source-scan: the model-list pre-fetch runs on the createComponent off-EDT pooled thread | [[c4]] [[c5]] |
| 5 | **`t5`** Add JUnit5 tests: pure model + gateway + source-scan | M | `t1`, `t2`, `t3`, `t4` | smoke: the full jetbrains-plugin suite passes locally via ./gradlew test (JDK21) | [[c6]] [[c7]] |

### E20260923ba132c18:S004:T001 — Add DaemonGateway.listModels + the sealed ModelListResult

Add the sealed ModelListResult { Loaded(available: Boolean, models: List<ModelOption>) | Unavailable } + ModelOption(id: String, displayName: String?), and DaemonGateway.listModels(provider: String): ModelListResult — the interface signature (DaemonGateway.kt:470), the DaemonGatewayImpl implementation (mirror settingsCatalog() at :881: rpc.call(METHOD_LIST_MODELS, mapOf(PARAM_PROVIDER to provider)) parsing DaemonResult.data; available:false/empty→Loaded(false,[]); DaemonUnavailableException/ok=false→Unavailable; malformed models entries filtered), the DaemonGatewayService one-line delegate (:50), and the METHOD_LIST_MODELS='providers.listModels'/PARAM_PROVIDER='provider' consts (companion :1103). Never-throws idiom. Purely additive; nothing renders it yet.

**Acceptance checks:**
- DaemonGateway interface, DaemonGatewayImpl, and DaemonGatewayService all declare listModels(provider): ModelListResult (the 3-place addition compiles)
- A {provider,available:true,models:[{id,displayName?}]} data reply → Loaded(true, models) with ids+displayNames mapped
- A {available:false,models:[]} data reply (ok=true) → Loaded(false, []) — NOT Unavailable
- A DaemonUnavailableException or ok=false/structured-error reply → Unavailable (never throws)
- A malformed models entry (missing/blank id, or models not a list) is skipped defensively, never fabricated
- The call passes method 'providers.listModels' + params {provider: <value>}

### E20260923ba132c18:S004:T002 — Add the pure headless ModelTiersModel (k7 state machine)

Add ModelTiersModel(catalog: SettingsCatalogDto, listsByProvider: Map<String, ModelListResult>) — a PURE, headless model mirroring PerRepoOverridesModel. Reads each tier's effective runner+model from the catalog snapshot, falling back to the per-tier CONFIG_CATALOG default (core/mid runner cli-claude, cheap ollama; model core '' / mid 'sonnet' / cheap 'qwen3.6:27b'). Exposes currentRunner/currentModel, modelOptions(tier) (the provider's models + a disabled '(current, not in catalog)' entry for a saved OVERRIDE absent from a Loaded list; a 'no models available' sentinel when Unavailable/empty), selectModel, selectRunner (clears that tier's pending model), isModified, collectWrites(): List<PendingWrite> (['models','tiers',tier,'model'] + runner only on a switch). No Swing, no fetch logic. Additive; nothing wires it yet.

**Acceptance checks:**
- A Loaded list → modelOptions(tier) is exactly the daemon's model ids (dropdown-only), pre-selecting the saved model when present (marked current)
- Unavailable AND Loaded(false,[]) AND Loaded(true,[]) → a single disabled 'no models available' sentinel; collectWrites emits nothing (saved untouched)
- A saved OVERRIDE absent from a Loaded list → a disabled '(current, not in catalog)' entry showing the saved id; selectModel(otherId) emits PendingWrite(['models','tiers',tier,'model'], otherId)
- A saved built-in DEFAULT (not an override) absent from the list → NO '(current, not in catalog)' entry
- selectRunner(tier, newProvider) clears the pending model + re-derives modelOptions from listsByProvider[newProvider]; collectWrites emits runner (and model only once re-picked)
- A defaulted tier runner resolves the CONFIG_CATALOG default so the provider is always known; re-selecting the saved model is an idempotent no-op

### E20260923ba132c18:S004:T003 — Add the ModelTiersSection (Swing) over the pure model

Add ModelTiersSection(model: ModelTiersModel, gateway: DaemonGateway) : SettingsSection rendering the pure model over the PerRoleSection combo idiom: per tier a runner JComboBox (enum, reused) + a NON-editable model JComboBox (dropdown-only, k4) + a shared Refresh button. suppressEdits guard + rowRefreshers; addActionListener routes to model.selectRunner/selectModel; Refresh re-invokes gateway.listModels off the EDT (ProgressManager) and re-seeds the combos; apply() fans model.collectWrites() → gateway.writeSetting/clearSetting, throwing ConfigurationException naming failures. Additive; not registered yet.

**Acceptance checks:**
- ModelTiersSection implements SettingsSection (title/component/isModified/apply/reset)
- The model JComboBox is constructed NON-editable (no setEditable(true))
- Refresh re-invokes gateway.listModels off the EDT (ProgressManager/executeOnPooledThread), not inline on the EDT, and re-seeds the combos under the suppressEdits guard
- apply() fans collectWrites → writeSetting/clearSetting and throws ConfigurationException naming the failed tier(s); ModelTiersSection imports no cloud/HTTP client (reaches the daemon only via the injected DaemonGateway)

### E20260923ba132c18:S004:T004 — Wire ModelTiersSection into InsrcSettingsConfigurable + exclude models.tiers.* from the generic table

In InsrcSettingsConfigurable.createComponent, pre-fetch each in-use provider's model list on the existing off-EDT pooled thread (alongside settingsCatalog/perRole/perRepo reads), build ModelTiersModel + ModelTiersSection, register the section in renderBody, AND exclude the models.tiers.* rows from the generic category table so runner+model aren't duplicated. This is the only change to existing behaviour — the two tier rows move from the table into the dedicated section.

**Acceptance checks:**
- InsrcSettingsConfigurable registers ModelTiersSection in renderBody and it participates in the isModified/apply/reset fan-out
- models.tiers.* rows are EXCLUDED from the generic category table (no duplication)
- The model-list pre-fetch runs on the createComponent off-EDT pooled thread (no socket call on the EDT)
- The build compiles (./gradlew build) with the new wiring

### E20260923ba132c18:S004:T005 — Add JUnit5 tests: pure model + gateway + source-scan

Add ModelTiersModelTest (pure, all k7 branches over a SettingsCatalogDto builder + a Map<String,ModelListResult> of Loaded/Loaded-empty/Unavailable), Sc2ListModelsGatewayTest (a handler-lambda FakeDaemonRpc driving the real DaemonGatewayImpl — Loaded/available:false/Unavailable/malformed + method+params), and a source-scan extension to InsrcSettingsConfigurableTest (section registered, models.tiers.* excluded from the table, model combo non-editable, off-EDT Refresh). All green under ./gradlew test on JDK21 (verified locally).

**Acceptance checks:**
- ModelTiersModelTest covers all k7 branches (dropdown, empty/unavailable, '(current, not in catalog)' override-only, clear-on-provider-switch, idempotent no-op, defaulted-runner fallback) over injected fakes — no Swing/live daemon
- Sc2ListModelsGatewayTest proves available:false→Loaded(false,[]) (not Unavailable), Unavailable on socket/ok=false, malformed skipped, and the method+params wiring
- A source-scan asserts ModelTiersSection registered + models.tiers.* excluded + non-editable combo + off-EDT Refresh
- The full plugin suite passes locally via ./gradlew test (JDK21), not on GitHub CI

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a Loaded list with the tier's provider → modelOptions(tier) is exactly the daemon's model ids (dropdown-only, no free-text) and pre-selects the saved model when present (marked current) | `t2`, `t5` |
| Unavailable → modelOptions(tier) is a single disabled 'no models available' sentinel; collectWrites emits nothing (saved untouched) | `t2`, `t5` |
| Loaded(available=false, []) AND Loaded(available=true, []) both → the same 'no models available' presentation, no write | `t2`, `t5` |
| a saved OVERRIDE absent from a Loaded list → a disabled '(current, not in catalog)' entry showing the saved id; selectModel(otherId) then emits PendingWrite(['models','tiers',tier,'model'], otherId) | `t2`, `t5` |
| a saved model that is a built-in DEFAULT (not an override) absent from the list → NO '(current, not in catalog)' entry | `t2`, `t5` |
| selectRunner(tier, newProvider) clears that tier's pending model (ac4) and modelOptions(tier) re-derives from listsByProvider[newProvider]; on confirm collectWrites emits BOTH ['...','runner'] and (once a model is picked) ['...','model'] | `t2`, `t5` |
| selecting the already-saved model is an idempotent no-op (collectWrites emits nothing for that tier) | `t2`, `t5` |
| a tier whose runner is the built-in default (absent from the snapshot values) resolves the CONFIG_CATALOG default runner (core/mid cli-claude, cheap ollama) so its provider list is keyed correctly | `t2`, `t5` |
| isModified() is false with no edits and true after selectModel/selectRunner; reset semantics (re-seed) leave isModified false | `t2`, `t5` |
| a {provider,available:true,models:[{id,displayName?}]} data reply → Loaded(true, models) with ids+displayNames mapped | `t1`, `t5` |
| a {available:false,models:[]} data reply (ok=true) → Loaded(false, []) — NOT Unavailable (the load-bearing distinction) | `t1`, `t5` |
| a {available:true,models:[]} reply → Loaded(true, []) | `t1`, `t5` |
| an ok=false / structured-error reply (invalid-params) → Unavailable | `t1`, `t5` |
| a DaemonUnavailableException from rpc.call → Unavailable (never throws) | `t1`, `t5` |
| a malformed models entry (missing/blank id, or models not a list) → skipped defensively, never fabricated | `t1`, `t5` |
| the call passes method 'providers.listModels' + params {provider: <value>} (constants wired) | `t1`, `t5` |
| DaemonGateway interface + DaemonGatewayImpl + DaemonGatewayService all declare listModels (the 3-place addition) | `t1`, `t5` |
| InsrcSettingsConfigurable registers ModelTiersSection in renderBody AND excludes models.tiers.* from the generic category table (no duplication) | `t4`, `t5` |
| the model combo is constructed NON-editable (isEditable=false / no setEditable(true)) — dropdown-only (k4) | `t3`, `t5` |
| the Refresh action and the pre-fetch run off the EDT (executeOnPooledThread / ProgressManager), not inline on the EDT | `t3`, `t4`, `t5` |
| ModelTiersModel/ModelTiersSection import no cloud/HTTP client and reach the daemon only via the injected DaemonGateway (k1/k3) | `t3`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 — interactionWithShared sc2 (ModelList): consumed read-only via gateway.listModels; the dumb-dropdown k7 state machine expressed once in the pure ModelTiersModel.` — "S004 consumes sc2 (ModelList) read-only via a NEW DaemonGateway.listModels(provider)… the section renders the Loaded models authoritatively (dropdown-only, k4) with the '(current, not in catalog)' + c"
- **[[c2]]** `prior-artifact` `LLD s4 — contractDetails.DaemonGateway.listModels(provider): ModelListResult (sealed Loaded/Unavailable) + dataModelChanges (the sealed type + the companion consts).` — "fun listModels(provider: String): ModelListResult… Loaded(available, models) when the daemon replied with the sc2 object; Unavailable ONLY when the socket is down or the daemon returned ok=false. Neve"
- **[[c3]]** `analyze-bundle` `s1 wire-parse/consumed-contract — the sc2 handler (src/daemon/index.ts:1520), ModelListResult shape (list-models.ts:46), and the UnixSocketDaemonRpc.parse framing (kt:105/123) where an object lands in DaemonResult.data (ok=true) even when available:false.` — "providers.listModels returns {provider,available,models} → DaemonResult.data (ok=true) even when available:false; an invalid-params {error,recoverable} → ok=false. So gateway.listModels MUST map avail"
- **[[c4]]** `prior-artifact` `LLD s4 — contractDetails.ModelTiersModel + dataModelChanges (models.tiers.*.{runner,model} invariant-change; catalog-default fallback core/mid cli-claude, cheap ollama; write path ['models','tiers',tier,'model']).` — "The PURE, headless k7 state machine… modelOptions(tier) (the provider's models + a disabled '(current, not in catalog)' entry for a saved OVERRIDE…), selectRunner(tier, provider) [clears that tier's p"
- **[[c5]]** `analyze-bundle` `s1 section-seam — SettingsSection (SettingsView.kt:55), PerRoleSection combo idiom (:29), PerRepoSection (:38), and InsrcSettingsConfigurable off-EDT createComponent read (:88)/apply (:131); the ModelTiersSection mirrors these and excludes models.tiers.* from the generic table.` — "SettingsSection (title/component/isModified/apply/reset); PerRoleSection JComboBox + suppressEdits + rowRefreshers + collectWrites→writeSetting/clearSetting; the createComponent off-EDT pooled read + "
- **[[c6]]** `analyze-bundle` `s1 test-prior-art — the pure-model JUnit5 idiom (PerRepoOverridesModelTest/PerRoleOverridesModelTest) the ModelTiersModelTest mirrors; the Swing shell is source-scan-only (InsrcSettingsConfigurableTest).` — "Settings-model tests are pure/headless… InsrcSettingsConfigurableTest is a SOURCE-SCAN test (the Swing shell isn't headlessly bootable) — so the k7 logic MUST live in the pure ModelTiersModel."
- **[[c7]]** `analyze-bundle` `s1 test-prior-art + gateway-surface — the handler-lambda FakeDaemonRpc driving the real DaemonGatewayImpl (Sc2DaemonGatewayTest/SettingsCatalogGatewayTest idiom); JUnit 5, ./gradlew test on JDK21.` — "Gateway tests use a handler-lambda FakeDaemonRpc : DaemonRpc driving the REAL DaemonGatewayImpl… a new gateway.listModels test = a FakeDaemonRpc returning {available,models} / {available:false} / {err"
