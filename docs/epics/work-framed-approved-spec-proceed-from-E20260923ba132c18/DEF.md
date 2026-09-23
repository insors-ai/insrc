<!-- insrc:artifact DEF-ba132c185fe45860 -->

# Epic: Configuring which model each global tier (core/mid/cheap) uses currently means typing a raw model identifier into a free-text field, on both the VS Code and JetBrains plugins.

**Flavor:** enhancement
**Seeded from:** `SPEC-4a6e7a40b308e164`

## Problem

Configuring which model each global tier (core/mid/cheap) uses currently means typing a raw model identifier into a free-text field, on both the VS Code and JetBrains plugins. Nothing tells the user which models are actually available for the provider they picked: they must already know the exact model id by heart, a typo or an outdated name silently misconfigures the tier (surfacing only later as a runtime failure), locally-installed ollama models are invisible in-product, and there is no in-product signal of which cloud models are valid. The friction is duplicated across both plugins, and the daemon exposes no working way to enumerate the models a given provider offers — the one place that could answer 'what can I pick here' is currently non-functional.

## Non-goals

- **Per-role model tiers — only the three global tiers (core/mid/cheap) are in scope** — The problem is about picking a model for the global tiers; per-role tiering is a separate, larger surface the stakeholder explicitly scoped out to keep this bounded.
- **Per-repo tier overrides — per-repo config continues to just reference a globally-defined tier, it does not redefine tier models** — The stakeholder confirmed tiers are defined globally and per-repo only selects among them; adding per-repo model editing would broaden the config model beyond the problem.
- **Changing or extending the provider/runner allowlist itself (ollama | cli-claude | cli-codex)** — The existing runner set is sufficient and unchanged; the problem is model discovery within a chosen provider, not which providers exist.
- **Any free-text / manual model-entry override for any provider** — A settled decision (d1): the list is authoritative, so a typo'd/invalid model id can never be configured; an override would reopen the exact silent-misconfiguration problem this Epic closes.
- **A user-editable model catalog under ~/.insrc/ or folding the catalog into the user-config reconcile system** — Settled decisions (d3): the cloud catalog is a maintainer-curated in-repo asset (what CAN be picked), kept distinct from user config (what IS picked) which has a different lifecycle.
- **A daemon-side last-known-good cache or degraded free-text fallback on list failure** — Settled decisions (d2): a failed list hard-blocks with a manual Refresh instead, keeping the failure model simple and never reopening free-text.

## Assumptions

- `high` The tier runner is chosen from a fixed enum (ollama | cli-claude | cli-codex) that this Epic reuses unchanged; the model is the only field becoming a picker. [[c3]]
- `high` Model tiers are defined globally at models.tiers.<core|mid|cheap>.{runner,model}; per-repo config only references a globally-defined tier. [[c2]]
- `med` The locally-installed ollama models can be enumerated by the daemon via a local query (no cloud path), so ollama's list is always current. [[c4]]
- `high` Cloud (cli-claude/cli-codex) models cannot be enumerated by our process via a provider API — cloud access is CLI-only — so their list must come from a maintainer-curated catalog shipped with the daemon. [[c6]]
- `high` The daemon already registers a providers.listModels IPC, but it is stubbed to an offline error and returns nothing usable — there is no working model-list capability today. [[c1]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | No direct cloud REST from our process: cli-claude/cli-codex model lists come from a curated in-repo catalog, never a provider API call (cloud access stays CLI-only). | [[c6]] |
| `k2` | stakeholder | The daemon is the single proxy/source of truth for the per-provider model list; both plugins are dumb dropdowns with no per-provider list logic or freshness/resilience handling. | [[c5]] |
| `k3` | contract | The existing runner/provider enum is reused unchanged — no new provider allowlist and no change to how a runner is selected. | [[c3]] |
| `k4` | stakeholder | The model picker is authoritative dropdown-only for all three providers — no free-text/manual model override; a model must appear in the daemon's returned list to be selectable. | [[c5]] |
| `k5` | stakeholder | The curated cloud catalog is a maintainer-curated JSON asset in the daemon repo (loaded by the daemon at boot), shipped through ordinary daemon updates — not a hardcoded literal, not a user-editable ~/.insrc/ file, not part of the user-config reconcile system. | [[c5]] |
| `k6` | stakeholder | Scope is the three global model tiers only, delivered on BOTH the VS Code and JetBrains plugins over one shared new read-only daemon list-models capability. | [[c5]] |
| `k7` | stakeholder | On an empty/errored list the picker hard-blocks (disabled, 'no models available') with a manual Refresh to re-query and leaves the saved value untouched; a saved model missing from a successful list shows as a disabled '(current, not in catalog)' entry; switching a tier's provider clears the model field. | [[c5]] |

## Stories

### E20260923ba132c18:S001 — Curated cloud model catalog the daemon ships and validates

**User value:** `size: M`

A maintainer can keep the list of selectable cli-claude/cli-codex models current by editing one reviewed in-repo catalog and shipping a daemon update — so users always see a curated, valid set of cloud models without any product code path reaching a cloud API.

**Extends:** [[c4]]

**Acceptance criteria:**

- **ac1:** Given the daemon starts up, when it loads the curated cloud model catalog that ships inside the daemon, then the catalog is loaded and validated at boot, and a missing or malformed catalog is reported rather than silently ignored. _(operationalizes `k5`)_
- **ac2:** Given a provider has released a new cloud model that a maintainer has added to the catalog, when the daemon is updated to the version carrying the updated catalog, then that model becomes selectable with no user configuration change and no plugin change. _(operationalizes `k5`)_
- **ac3:** Given the cloud providers (cli-claude, cli-codex) need a set of selectable models, when that set is produced, then it comes only from the curated in-repo catalog and never from a direct cloud API call. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (stakeholder) The catalog is a maintainer-curated asset that ships inside the daemon and is not user-editable at runtime nor part of the user-config reconcile pipeline. [[c5]]

### E20260923ba132c18:S002 — Ask the daemon which models a provider offers

**User value:** `size: M`

Any client (either plugin) can ask the daemon for the models available under a given provider and get a single authoritative answer — ollama's actual local models and the curated cloud models — without the client needing any provider-specific knowledge.

**Depends on:** `s1`

**Extends:** [[c1]] [[c4]]

**Acceptance criteria:**

- **ac1:** Given a supported provider (ollama, cli-claude, or cli-codex), when a client asks the daemon for that provider's available models, then the daemon returns the provider's model list — ollama from a live local query, cli-claude/cli-codex from the curated catalog. _(operationalizes `k2`, `k3`)_
- **ac2:** Given the selected provider is ollama and its models cannot currently be listed (e.g. ollama is unreachable), when a client asks for the list, then the daemon reports an empty/unavailable result rather than a fabricated or cached-as-fresh list. _(operationalizes `k7`, `k2`)_
- **ac3:** Given the model-list capability, when a client invokes it, then it is strictly read-only — asking for models never changes any configuration or provider state. _(operationalizes `k2`)_
- **ac4:** Given a cloud provider (cli-claude/cli-codex), when its models are listed, then no direct cloud REST call is made — the answer is served entirely from the curated catalog. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (contract) This capability replaces the currently non-functional (offline-stubbed) model-listing entry so there is exactly one working way to enumerate a provider's models. [[c1]]

### E20260923ba132c18:S003 — Pick a tier's model from a provider-filtered dropdown in VS Code

**User value:** `size: M`

A VS Code user can set a global tier's model by choosing from a dropdown of the models actually available for that tier's provider — no typing raw model ids, no silent typos — and recover from a transient outage with a Refresh.

**Depends on:** `s2`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a global tier with a selected provider, when the user runs the Set model tier action in VS Code, then a dropdown of that provider's available models is presented and the chosen model is saved for that tier. _(operationalizes `k4`, `k6`)_
- **ac2:** Given the selected provider's model list is empty or unavailable, when the picker is opened, then it shows 'no models available' and offers a Refresh to re-query, leaving the tier's saved model untouched. _(operationalizes `k7`)_
- **ac3:** Given a tier whose saved model is not present in the freshly listed set, when the picker is opened, then the saved model is shown as a disabled '(current, not in catalog)' entry so the user sees exactly what is configured, and picking any other entry replaces it. _(operationalizes `k7`, `k4`)_
- **ac4:** Given the user changes the tier's provider during the flow, when the provider changes, then the model selection is cleared, forcing an explicit pick from the new provider's list before the tier can be saved. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (stakeholder) Native VS Code Settings cannot render a provider-filtered live dropdown inline, so the picker is delivered as a dedicated action that presents the dropdown; the plugin stays a dumb dropdown over the daemon capability. [[c5]]

### E20260923ba132c18:S004 — Pick a tier's model from an inline provider-filtered combo in JetBrains

**User value:** `size: M`

A JetBrains user can set a global tier's model directly on the Settings page from an inline dropdown of the models available for that tier's provider — no typing raw model ids — with a Refresh button to re-query after an outage.

**Depends on:** `s2`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a global tier on the JetBrains Settings page with a selected provider, when the user opens that tier's model control, then it is an inline dropdown of the provider's available models, and the chosen model is written for that tier on apply. _(operationalizes `k4`, `k6`)_
- **ac2:** Given the selected provider's model list is empty or unavailable, when the tier's model control is shown, then it shows 'no models available' (disabled) with a Refresh control beside it to re-query, leaving the saved model untouched. _(operationalizes `k7`)_
- **ac3:** Given a tier whose saved model is not present in the freshly listed set, when the control is shown, then the saved model appears as a disabled '(current, not in catalog)' entry so the user sees exactly what is configured, and picking any other entry replaces it. _(operationalizes `k7`, `k4`)_
- **ac4:** Given the user changes the tier's provider on the Settings page, when the provider changes, then the model selection is cleared, forcing an explicit pick from the new provider's list before apply. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (stakeholder) The JetBrains Settings page is a custom UI, so the tier's model control is an inline editable dropdown/combo; the plugin stays a dumb dropdown over the daemon capability. [[c5]]

## Citations

- **[[c1]]** `code` `src/daemon/index.ts:1511` — "'providers.listModels': offlineRpc('providers.listModels') — the registered-but-stubbed IPC this Epic replaces."
- **[[c2]]** `code` `src/config/config-catalog.ts:96` — "models.tiers.<core|mid|cheap>.{runner,model} — the global tier config surface (runner enum + free-text model)."
- **[[c3]]** `code` `src/config/analyze.ts:88` — "AnalyzeShaperProviderKind = 'ollama' | 'cli-claude' | 'cli-codex' — the fixed runner allowlist, reused unchanged."
- **[[c4]]** `code` `src/daemon/index.ts:1281` — "an existing daemon block querying ollama for model tags — prior art for the ollama live model query (local, no cloud)."
- **[[c5]]** `prior-artifact` `.insrc/artifacts/SPEC-4a6e7a40b308e164.json` — "The approved brainstorm spec: strict dropdown-only, daemon-as-proxy dumb UI, curated JSON catalog asset, hard-block+Refresh, '(current, not in catalog)', clear-on-provider-switch, global tiers only."
- **[[c6]]** `convention` `CLAUDE.md — project principle: No direct cloud REST from our process; cloud LLM access via the claude/codex CLI binaries only` — "Direct REST providers to Anthropic / OpenAI / Gemini / Mistral must not be reintroduced."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-23T12:14:44.846Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | The daemon registers a providers.listModels IPC that is stubbed to offlineRpc (returns an offline error, no usable model list) at src/daemon/index.ts:1511. | CONFIRMED: read src/daemon/index.ts:1511 -> "'providers.listModels': offlineRpc('providers.listModels')," — the registered-but-stubbed IPC this Epic replaces. | Confirmed — no change needed. |
| cl2 | citation | LOW | manual | The global model tiers are configured at models.tiers.<core\|mid\|cheap>.{runner,model} — a runner enum + a free-text model field — in src/config/config-catalog.ts around line 96. | CONFIRMED: read src/config/config-catalog.ts:96 -> "{ path: 'models.tiers.core.runner', type: 'enum', default: 'cli-claude', ... enumValues: ['ollama','cli-claude','cli-codex'] }" — the global tier runner enum + (adjacent) free-text model field. | Confirmed — no change needed. |
| cl3 | citation | LOW | manual | The tier runner allowlist is the type AnalyzeShaperProviderKind = 'ollama' \| 'cli-claude' \| 'cli-codex' at src/config/analyze.ts:88. | CONFIRMED: read src/config/analyze.ts:88 -> "export type AnalyzeShaperProviderKind = 'ollama' \| 'cli-claude' \| 'cli-codex';" — the fixed runner allowlist reused unchanged. | Confirmed — no change needed. |
| cl4 | citation | LOW | assisted | The daemon already has prior art for a live ollama model query (a block fetching ollama model tags) around src/daemon/index.ts:1281 — the local, no-cloud precedent for S002's ollama listing. | PARTIAL: read src/daemon/index.ts:1281 lands on the comment '// Claude model listing' (the claude.models handler), NOT the ollama-tags block — the ollama live-query prior art sits a few lines ABOVE :1281 (confirmed earlier this session at ~:1275). The substantive premise (a live ollama model-tags query already exists as prior art, plus a claude static-fallback catalog) holds; only the exact anchor line is imprecise. | Anchor is off by a few lines; the S002 LLD should cite the precise ollama-query line rather than :1281 (which is the Claude-model-listing comment). Non-blocking — the prior art exists nearby. |
| cl5 | closed-union | LOW | manual | The runner/provider allowlist this Epic reuses unchanged is exactly the three-member set {ollama, cli-claude, cli-codex} — declared as the config enumValues and the AnalyzeShaperProviderKind union. | CONFIRMED: src/config/config-catalog.ts:96 enumValues ['ollama','cli-claude','cli-codex'] + the AnalyzeShaperProviderKind union (analyze.ts:88) — the runner allowlist is exactly that closed 3-member set, reused unchanged (k3). | Confirmed — no change needed. |
| cl6 | external-contract | LOW | manual | The project forbids direct cloud REST from our process (cloud LLM access is via the claude/codex CLI binaries only) — the invariant k1/c6 the cloud model list must not violate. | CONFIRMED: CLAUDE.md:12 -> 'No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed claude and codex CLI binaries (via CliProvider)... must not be reintroduced.' — the k1 invariant the cloud catalog design honors. | Confirmed — no change needed. |
| cl7 | cross-artifact | LOW | manual | This DEF is seeded from the approved SPEC-4a6e7a40b308e164 and its constraints/decisions (dropdown-only, daemon-as-proxy, curated JSON catalog, hard-block+Refresh, current-not-in-catalog, clear-on-switch, global tiers only) faithfully carry the spec's 5 decisions. | CONFIRMED: .insrc/artifacts/SPEC-4a6e7a40b308e164.json exists and the DEF's constraints (k1-k7) + non-goals faithfully carry the spec's 5 settled decisions (strict dropdown-only, daemon-as-proxy, curated JSON catalog, hard-block+Refresh, current-not-in-catalog, clear-on-switch, global tiers only). | Confirmed — no change needed. |
