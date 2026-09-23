<!-- insrc:artifact HLD-ba132c185fe45860 -->

# HLD: The Epic adds a single read-only daemon capability that answers 'which models can I pick for provider X', plus the two thin plugin surfaces that render it as an authoritative dropdown for the global model tiers

## Framework summary

The Epic adds a single read-only daemon capability that answers 'which models can I pick for provider X', plus the two thin plugin surfaces that render it as an authoritative dropdown for the global model tiers. The daemon is the sole proxy: it revives the offline-stubbed model-listing entry as ONE new read-only IPC handler that dispatches per provider — for ollama a live local query through the existing ollama provider, for cli-claude/cli-codex a curated JSON catalog shipped as a daemon asset (copied by copy-assets.mjs, loaded + validated at boot the way the docgen asset validator does) — and returns the provider's model list plus an explicit availability signal, without ever making a direct cloud REST call. Both plugins are provider-agnostic consumers of that one contract over the already-shipped shared ipc-client: VS Code adds an 'insrc: Set model tier' QuickPick command, JetBrains turns its Settings-page model field into an inline combo + Refresh. Every empty/error/'(current, not in catalog)'/clear-on-provider-switch behaviour is expressed once over the daemon's returned list, so neither plugin carries per-provider logic. The tier runner enum is reused unchanged and the catalog stays out of the user-config reconcile system.

## Architecture shape

Layered, single-contract-per-boundary over existing seams. S001 owns the curated cloud catalog: a JSON asset in the daemon repo + its boot loader/validator (the sc1 CuratedCatalog contract). S002 owns the read-only list-models IPC (the sc2 ModelList contract): it consumes sc1 for cloud providers and the existing ollama provider for the live ollama query, exposing one handler in the daemon's IPC map. S003 (VS Code) and S004 (JetBrains) are leaf consumers of sc2 over the shared ipc-client — no shared contract of their own, only their private UI. Dependency chain S001 → S002 → {S003, S004}: the daemon capability lands + is tested before either plugin, and the two plugins proceed in parallel. No new transport, no new daemon dependency, no change to the runner enum.

## Shared contracts

### sc1: CuratedCatalog

**Owner Story:** `s1`
**Consumed by:** `s2`

**Purpose:** The maintainer-curated cloud (cli-claude/cli-codex) model catalog shipped as a JSON asset inside the daemon, loaded + validated at boot; the source S002 reads for cloud providers' selectable models. Not user-editable, not in the config-reconcile system (k1/k5).

**Interface sketch (type-level):**

```
// The on-disk JSON asset shape (shipped in the daemon repo, copied by copy-assets.mjs).
interface CloudModelCatalogFile {
  readonly version: number;
  readonly providers: {
    readonly 'cli-claude': readonly CatalogModel[];
    readonly 'cli-codex': readonly CatalogModel[];
  };
}
interface CatalogModel { readonly id: string; readonly displayName?: string }

// The daemon-side accessor S002 consumes (populated by S001's boot loader/validator).
type CloudProvider = 'cli-claude' | 'cli-codex';
interface CuratedCatalog {
  // The curated models for a cloud provider (empty array only if the catalog omits it).
  modelsFor(provider: CloudProvider): readonly CatalogModel[];
}
```

**Assumptions cited:** [[c6]]

### sc2: ModelList

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** The one net-new read-only daemon IPC: given a provider, return its available models plus an explicit availability signal (ollama live-queried, cloud from the curated catalog). Consumed by both plugins to populate the tier model dropdown (k2/k4/k6/k7).

**Interface sketch (type-level):**

```
// A read-only daemon IPC method (revives the offline-stubbed model-listing entry).
type ModelProvider = 'ollama' | 'cli-claude' | 'cli-codex';

interface ListModelsParams { readonly provider: ModelProvider }

interface ModelInfo { readonly id: string; readonly displayName?: string }

interface ModelListResult {
  readonly provider: ModelProvider;
  // false => the source could not be listed right now (e.g. ollama unreachable);
  // the picker hard-blocks + Refresh. Never a fabricated/cached-as-fresh list.
  readonly available: boolean;
  // The provider's available models; empty when !available.
  readonly models: readonly ModelInfo[];
}

// Signature (type-level only): listModels(params: ListModelsParams): Promise<ModelListResult>
```

**Assumptions cited:** [[c1]] [[c4]]

## Story boundaries

### Story E20260923ba132c18:S001

**Owns:** `sc1`

The exact on-disk location + filename of the catalog JSON asset, its copy-assets.mjs registration, the boot-time load + validation mechanism (how a missing/malformed catalog is detected and reported), and the actual curated model entries per cloud provider are all private to S001. Only the CuratedCatalog accessor + the catalog file shape (sc1) are exposed.

### Story E20260923ba132c18:S002

**Owns:** `sc2`
**Depends on:** `sc1`

How the handler dispatches per provider, the concrete live ollama model query (how it reaches ollama and maps its response), how it determines the availability signal, and how it reads the curated catalog via sc1 are private. Only the read-only listModels IPC method + its ModelListResult shape (sc2) are exposed; the handler mutates nothing.

### Story E20260923ba132c18:S003

**Depends on:** `sc2`

The 'insrc: Set model tier' QuickPick command flow (tier → provider → model), the empty-state/Refresh/'(current, not in catalog)'/clear-on-provider-switch presentation, and writing the chosen model to the native tier setting are private to S003. It consumes only sc2 over the shared client; it adds no shared contract.

### Story E20260923ba132c18:S004

**Depends on:** `sc2`

The JetBrains Settings-page inline model combo + Refresh button, the same empty-state/'(current, not in catalog)'/clear-on-provider-switch behaviour, and writing the tier's model field on apply are private to S004. It consumes only sc2 over the DaemonGateway; it adds no shared contract.

## Non-functional targets

- **Performance:** The list-models call runs off the UI path over the local Unix socket; the ollama live query has a bounded timeout, and the cloud catalog is read from an in-memory boot-loaded asset (no per-call disk/API cost). The pickers fetch on open + on manual Refresh only — no background polling.
- **Security:** No cloud REST from our process (k1): cloud model lists come only from the curated in-repo catalog; ollama is a local query. The capability is strictly read-only — listing models mutates no config or provider state. All access is over the existing local socket via the shared client; no secrets, no new transport.
- **Observability:** A missing or malformed catalog is reported at boot (not silently ignored, S001 ac1); a provider whose models cannot be listed surfaces as available:false rather than a fabricated list, which the pickers render as an explicit 'no models available' + Refresh.
- **Durability:** The curated catalog is a maintainer-curated in-repo asset shipped with the daemon (updated via daemon-ctl update), kept out of the user-config reconcile system; the daemon's config.json remains the single source of truth for what IS selected. The pickers hold no shadow state — they re-read from the daemon on open/refresh.

## Rollout

### Phase A — daemon capability (catalog + list-models IPC)

**Stories:** `s1`, `s2`
**Flag:** ``

The whole feature rests on one read-only daemon capability, so it lands and is verified before any UI consumes it. S001 ships + boot-validates the curated cloud catalog asset (owner of sc1); S002 then exposes the read-only list-models IPC (owner of sc2) that reads sc1 for cloud providers and live-queries ollama. S002 dependsOn S001 (and sc2 consumes sc1), so they are sequenced within the phase: catalog first, IPC second. At phase end the daemon can authoritatively answer 'what models can I pick for provider X' with an explicit availability signal, testable over the socket with no plugin present.

**Backward compat:** Reviving the offline-stubbed model-listing entry as a working read-only handler is purely additive — no existing IPC method, config key, or runner enum changes; a client that never calls it is unaffected. The catalog is a new in-repo asset outside the user-config reconcile system, so existing ~/.insrc/config.json files are untouched.

### Phase B — plugin pickers (VS Code + JetBrains)

**Stories:** `s3`, `s4`
**Flag:** ``

With sc2 live, the two leaf consumers proceed in parallel: S003 adds the VS Code 'Set model tier' QuickPick and S004 turns the JetBrains Settings model field into an inline combo + Refresh. Both dependOn S002 and neither depends on the other (no shared contract between them), so they can be built and shipped independently once the daemon capability is in place. Each renders the daemon's list authoritatively (dropdown-only) and handles empty/unavailable/'(current, not in catalog)'/provider-switch-clears identically over the one contract.

**Backward compat:** Each plugin replaces its free-text tier-model field with a dropdown over the daemon list; a tier whose currently-saved model is not in the freshly listed set is preserved and shown as a disabled '(current, not in catalog)' entry, so no existing configured value is silently dropped. The saved config shape (models.tiers.<tier>.model) is unchanged — only the input control changes.

**Ordering rationale:** The single hard edge is that both plugins (S003, S004) require the daemon list-models capability (S002), which in turn requires the curated catalog (S001) for its cloud branch — the exact chain S001 → S002 → {S003, S004} from the Epic dependsOn edges and the sc1→sc2 shared-contract ownership. Phase A delivers and verifies that capability end-to-end at the socket boundary before any UI is written, so the plugins in Phase B build against a contract that is already proven rather than co-evolving with it. Within Phase A, S001 precedes S002 because sc2 consumes sc1. Phase B's two stories carry no edge between them, so they are grouped as a parallelizable pair.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| ollama live-query resilience (S002) | The ollama branch reaches a local service that may be down, slow, or returning an unexpected shape; a naive implementation could hang the IPC call or fabricate/stale-cache a list, violating k7's 'report empty/unavailable rather than a fabricated list'. | Bound the ollama query with a timeout and map any failure/timeout/malformed response to available:false + empty models (never a cached-as-fresh list); cover the unreachable path with a test so the pickers' hard-block + Refresh path is exercised end-to-end. |
| curated catalog drift / boot validation (S001) | A hand-curated JSON asset can go missing, be malformed, or fall behind real provider model names; a silently-ignored bad catalog would leave cloud tiers with an empty or wrong dropdown and no signal. | Load + schema-validate the catalog at boot (mirroring the docgen boot-time asset validator) and report a missing/malformed catalog loudly rather than silently; keep the asset small, reviewed, and shipped through ordinary daemon updates so refreshing the list is a normal update, not a code change. |
| authoritative dropdown vs already-saved model (S003/S004) | k4 makes the picker dropdown-only (no free-text), but users may already have a saved model that is not in the returned list (a valid-but-uncatalogued or newly-removed model); dropping it or making it unselectable would silently mutate their configured tier. | Both plugins render a saved-but-unlisted model as a disabled '(current, not in catalog)' entry (k7) so the configured value is visible and preserved until the user explicitly picks another, and clear the field only on an explicit provider switch — behaviour expressed once over the daemon's list and unit-tested on both surfaces. |

## Alternatives considered

### a1: One read-only daemon list-models IPC + curated JSON catalog asset; dumb-dropdown plugins over the shared client — **CHOSEN**

A single new read-only daemon handler dispatches per provider (ollama live query + a boot-loaded curated JSON catalog for cloud) and returns a per-provider model list; both plugins call it over the existing shared client and render a plain dropdown with no provider logic.

The daemon gains ONE new read-only IPC handler (replacing the offline-stubbed providers.listModels) in its existing handler map. Given a provider it returns that provider's available models plus an availability signal: for ollama it runs a live local query through the existing ollama provider; for cli-claude/cli-codex it serves a curated JSON catalog shipped as a daemon asset (copied by copy-assets.mjs, loaded + validated at boot the way the docgen asset validator does), never a cloud API call. The handler is pure read — asking for models changes no config or provider state. This is the one net-new shared contract of the Epic (the IPC method + its result shape), owned by S002 and fed by S001's catalog asset. Both plugins are thin, provider-agnostic consumers of that single contract over the existing shared ipc-client: VS Code adds an 'insrc: Set model tier' QuickPick command that lists a tier's provider's models and writes the chosen model to the native setting; JetBrains turns the Settings-page model field into an inline combo + Refresh populated from the same call over its DaemonGateway. All freshness/resilience/empty-state/'(current, not in catalog)'/clear-on-switch logic is expressed once over the daemon's returned list — no per-provider branching lives in either plugin. This maps 1:1 onto the Epic's four Stories (catalog asset → IPC → VS Code → JetBrains).

**Pros:**
- Honors k2 (daemon is the single proxy; plugins are dumb dropdowns) and k1 (cloud list is a curated in-repo asset, zero cloud REST) by construction
- Exactly one net-new shared contract (the list-models IPC + result shape) consumed by both plugins over the ALREADY-shipped ipc-client — no new transport, no per-language duplication of provider logic
- Reuses proven seams: the daemon handler map, the copy-assets + boot-validation asset pipeline (docgen prior art), and the existing ollama provider for the live query
- The clean S001→S002→{S003,S004} dependency chain lets the daemon capability land + be tested before either plugin, and the two plugins proceed in parallel

**Cons:**
- Requires a new curated JSON catalog asset that maintainers must keep current (the accepted d3/k5 lifecycle: git-reviewed, shipped via daemon-ctl update)
- The two plugin surfaces are asymmetric (VS Code QuickPick command vs JetBrains inline combo) because native VS Code Settings cannot host a live dropdown inline — two UI implementations of the same behaviour

**Cost estimate:** M

### a2: Client-side provider dispatch (each plugin discovers models itself)

Each plugin queries ollama and reads a bundled cloud catalog on its own, with no daemon list-models capability.

Rather than a daemon capability, each plugin implements model discovery directly: it runs/queries ollama for local models and ships its own copy of the cloud catalog, then renders the dropdown. The daemon is untouched; the plugins own the per-provider logic and freshness handling. This pushes all provider knowledge into the two client codebases (TypeScript + Kotlin) and duplicates the catalog data across both plugins and the daemon repo.

**Pros:**
- No daemon change — the plugins ship independently of a daemon update
- Each plugin can tune its own dropdown behaviour without a shared contract

**Cons:**
- VIOLATES k2 head-on: the daemon is meant to be the single proxy and the plugins dumb dropdowns — this makes the plugins the source of truth with per-provider logic
- Duplicates the ollama-query + catalog logic across two languages, doubling maintenance and drift risk, and risks a plugin taking a direct cloud path (k1 hazard)
- The curated catalog would live in (and be shipped by) both plugins independently, breaking the single-source-of-truth curation the Epic wants

**Cost estimate:** L

**Rejected because:** Violates k2 and k5 outright and only partially meets k1/k4/k6/k7 by pushing provider logic + catalog into two client codebases. The most expensive (L) and least aligned with the Epic's daemon-as-proxy intent.

### a3: Fold model options into the CONFIG_CATALOG/config-reconcile system

Express each provider's selectable models as schema-driven config-catalog enums reconciled on boot, instead of a separate list capability.

Extend the existing CONFIG_CATALOG so the tier model field becomes a schema-driven enum per provider, carried through the config reconcile pipeline the native settings already use. The dropdown would then be populated from the config schema rather than a dedicated capability. This reuses the config machinery (migrations, reconcile-on-boot) but binds 'what CAN be picked' to the same pipeline as 'what IS picked'.

**Pros:**
- Reuses the existing config-catalog + reconcile machinery instead of a new capability
- A static per-provider enum could render as a native VS Code Settings dropdown without a command

**Cons:**
- VIOLATES k5: the Epic explicitly keeps the model catalog OUT of the user-config reconcile system (capability-listing vs user-config are different lifecycles)
- Cannot represent ollama's LIVE, per-machine model list — a static config schema is fixed at build/reconcile time, so it goes stale exactly where k7's freshness matters
- Conflates the authoritative available-models list with user configuration, entangling two concerns the Epic deliberately separates

**Cost estimate:** M

**Rejected because:** Violates k5 (catalog in the reconcile system) and k7 (a static schema can't carry ollama's live list) and only partially satisfies k2. Disqualified by two hard constraint breaches.

## Citations

- **[[c1]]** `analyze-bundle` `src/daemon/index.ts:1511 — providers.listModels is REGISTERED but stubbed to offlineRpc (returns an offline error); the adjacent live ollama tags query + claude Anthropic-SDK static fallback (index.ts:1281) is the forbidden no-cloud-REST path, NOT reusable.` — "providers.listModels is REGISTERED but stubbed to offlineRpc — no working per-provider model list today. Build a read-only list-models capability — ollama via a local query, cloud via a curated JSON a"
- **[[c2]]** `analyze-bundle` `src/config/config-catalog.ts:96-100 + src/config/analyze.ts:88 — global tiers at models.tiers.<core|mid|cheap>.{runner,model}; runner an enum over ['ollama','cli-claude','cli-codex'] (AnalyzeShaperProviderKind), model a free-text string reused unchanged (k3).` — "The tier's runner is the provider that keys the list; the model field becomes a provider-filtered dropdown. The enum/allowlist is reused unchanged (k3)."
- **[[c3]]** `analyze-bundle` `src/daemon/index.ts (handler map) + src/shared/ipc-client.ts — the daemon registers named JSON-RPC handlers in one map over the Unix socket; both plugins reach it ONLY through the shared ipc-client. The new list-models handler is one more read-only entry consumed by both plugins over the existing client (k2/k6).` — "The new list-models capability is one more read-only handler in that map, consumed by both plugins over the existing client — no new transport, no new daemon dependency."
- **[[c4]]** `analyze-bundle` `copy-assets.mjs + src/assets + src/daemon/index.ts — the daemon ships non-TS resources via copy-assets.mjs into out/; the docgen epic established a boot-time asset validator that loads + validates shipped assets and reports a missing/malformed one. The curated cloud catalog is a new JSON asset copied + boot-validated the same way (k5, S001 ac1).` — "The curated cloud model catalog is a new JSON asset under the daemon's asset dir, copied by copy-assets.mjs, loaded + validated at boot the same way — maintainer-curated in git, shipped via daemon-ctl"
- **[[c5]]** `analyze-bundle` `vscode-plugin/src/extension.ts + jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings — VS Code models.tiers.* live in native contributes.configuration (no inline live dropdown) → a new 'insrc: Set model tier' QuickPick command (S003); JetBrains Settings is custom Swing → the model control becomes an inline combo + Refresh over the DaemonGateway (S004). Both are dumb dropdowns over the S002 capability (k2).` — "Both are dumb dropdowns over the S002 capability; no per-provider logic in either plugin (k2)."
- **[[c6]]** `analyze-bundle` `src/agent/providers/ollama.ts — the existing ollama provider that S002's ollama branch live-queries for the machine's locally-installed models (the live half of the list-models capability, vs the curated JSON asset for cloud).` — "for ollama it runs a live local query through the existing ollama provider."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-23T12:26:26.987Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | auto | The daemon registers a providers.listModels IPC handler that is currently stubbed to an offline error (offlineRpc), i.e. there is no working per-provider model list today — the entry S002 revives. | src/daemon/index.ts:1511 read ok; grep confirms the exact line `'providers.listModels': offlineRpc('providers.listModels'),` — the offline-stubbed entry S002 revives is real and verbatim. | None — citation confirmed against real source. |
| c1 | citation | LOW | auto | An adjacent daemon block does a live ollama tags query plus a claude static-fallback catalog via the Anthropic SDK — the forbidden direct-cloud-REST path that is NOT reusable for cloud model listing. | src/daemon/index.ts:1282 `'claude.models': async () => {` and :1289 `const models = await client.models.list();` confirm the adjacent Anthropic-SDK cloud path exists and is the forbidden direct-REST route (correctly marked NOT reusable). | None — the forbidden-path premise is confirmed; the HLD correctly excludes it. |
| c2 | citation | LOW | auto | The global model tiers live at models.tiers.<core\|mid\|cheap>.{runner,model} in the config catalog, with runner an enum over ['ollama','cli-claude','cli-codex']; the picker fills the model field and reuses this runner enum unchanged (k3). | src/config/config-catalog.ts:96 and src/config/analyze.ts:88 both read ok; grep confirms AnalyzeShaperProviderKind and the runner union 'ollama'\|'cli-claude'\|'cli-codex' exist. The tier surface + reused runner enum (k3) are grounded. | None — config surface + runner enum confirmed. |
| c3 | citation | LOW | auto | The daemon registers named JSON-RPC handlers in a map in src/daemon/index.ts served over a Unix socket, and both plugins reach the daemon only through the shared ipc-client at src/shared/ipc-client.ts — so the new list-models handler is one more read-only entry over the existing transport (no new transport/dependency). | src/shared/ipc-client.ts:1 read ok; grep confirms createIpcClient and the config.catalog/config.show handler names — the shared client transport both plugins use is real, so the new list-models handler adds no new transport. | None — shared client + handler map confirmed. |
| c4 | citation | LOW | auto | The daemon ships non-TS runtime resources into out/ via copy-assets.mjs, and a boot-time asset validator (docgen prior art) loads + validates shipped assets and reports a missing/malformed one — the pattern S001's curated catalog asset reuses. | copy-assets.mjs:1 read ok and src/assets is referenced across the repo; the boot-time asset validator is docgen prior art (a real shipped epic). The asset pipeline S001 reuses exists; the specific validator wiring is S001's private internal, out of HLD scope. | None — asset pipeline confirmed; validator specifics deferred to S001 LLD. |
| c6 | citation | LOW | assisted | An existing ollama provider (src/agent/providers/ollama.ts) exposes a way to list the machine's locally-installed models, which S002's ollama branch live-queries for the local half of the list-models capability. | src/agent/providers/ollama.ts:136 `export class OllamaProvider implements LLMProvider` confirms the existing provider; the live /api/tags query surfaces only in install scripts, so the concrete model-list method is not yet in ollama.ts. The HLD only asserts the ollama branch queries 'through the existing ollama provider' and leaves the concrete query to S002's private internal, so this is not an over-claim of an existing method. | S002 LLD should specify whether it adds a tags/list method on OllamaProvider or queries the endpoint directly; no HLD change needed. |
| c5 | citation | LOW | auto | VS Code model-tier config lives in native contributes.configuration (no inline live dropdown), and the JetBrains Settings page is custom Swing — so S003 uses a QuickPick command and S004 an inline combo, both dumb consumers of the S002 capability. | vscode-plugin/package.json:1 read ok; grep confirms contributes + models.tiers in the VS Code manifest and createIpcClient shared usage. The VS Code native-config vs JetBrains-Swing asymmetry driving the QuickPick/inline-combo split is grounded. | None — plugin surfaces confirmed. |
| cl8 | ordering | LOW | auto | The Story dependency chain is S001 → S002 → {S003, S004}: S002 depends on S001 (sc2 consumes sc1), and S003 and S004 each depend on S002 (sc2) with no edge between them, matching the approved Epic dependsOn edges. | .insrc/artifacts/DEF-ba132c185fe45860.json:1 read ok; the dependency chain S001→S002→{S003,S004} matches the approved Epic dependsOn edges (s2 dependsOn s1; s3,s4 dependsOn s2; no s3↔s4 edge), consistent with the sc1→sc2 ownership. | None — ordering matches the approved DEF. |
| cl9 | closed-union | LOW | auto | Each shared contract has exactly one owner Story (sc1 owned by s1, sc2 owned by s2) and every Story appears in exactly one rollout phase (Phase A={s1,s2}, Phase B={s3,s4}). | .insrc/artifacts/DEF-ba132c185fe45860.json:1 read ok; each shared contract has exactly one owner (sc1→s1, sc2→s2) and every Story sits in exactly one rollout phase (A={s1,s2}, B={s3,s4}) — internally consistent, no orphan. | None — contract ownership + phase coverage consistent. |
