<!-- insrc:artifact LLD-ba132c185fe45860-s2 -->

# LLD: E20260923ba132c18:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790165706650-c3lbx6`
**HLD effective hash:** `3fb0b2204d88...`

## HLD context

**Framework:** The Epic adds a single read-only daemon capability that answers 'which models can I pick for provider X', plus the two thin plugin surfaces that render it as an authoritative dropdown for the global model tiers. The daemon is the sole proxy: it revives the offline-stubbed model-listing entry as ONE new read-only IPC handler that dispatches per provider — for ollama a live local query through the existing ollama provider, for cli-claude/cli-codex a curated JSON catalog shipped as a daemon asset (copied by copy-assets.mjs, loaded + validated at boot the way the docgen asset validator does) — and returns the provider's model list plus an explicit availability signal, without ever making a direct cloud REST call. Both plugins are provider-agnostic consumers of that one contract over the already-shipped shared ipc-client: VS Code adds an 'insrc: Set model tier' QuickPick command, JetBrains turns its Settings-page model field into an inline combo + Refresh. Every empty/error/'(current, not in catalog)'/clear-on-provider-switch behaviour is expressed once over the daemon's returned list, so neither plugin carries per-provider logic. The tier runner enum is reused unchanged and the catalog stays out of the user-config reconcile system.
**Rollout phase:** Phase A — daemon capability (catalog + list-models IPC)
**Owns:** `sc2` (ModelList)
**Consumes:** `sc1` (CuratedCatalog)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: S001's catalog file, copy-assets registration, boot-time load/validation, and curated entries are private; only the CuratedCatalog accessor + file shape are exposed. — owns `sc1`
- `s3`: The VS Code QuickPick command flow + empty/Refresh/'(current, not in catalog)'/clear-on-switch presentation are private to S003; it consumes only sc2.
- `s4`: The JetBrains inline combo + Refresh + the same UX are private to S004; it consumes only sc2 over the DaemonGateway.

## Contract details

**Surface level:** internal-shared

### `listModels`

```typescript
function listModels(params: unknown, deps?: ListModelsDeps): Promise<ModelListResult>
```

**Parameters:**
- `params: unknown (validated to ListModelsParams { provider: ModelProvider })` — The raw JSON-RPC params; the dispatch validates that params.provider is one of the three ModelProvider values before dispatching.
- `deps: ListModelsDeps { ollamaList(): Promise<readonly ModelInfo[]>; catalog(): CuratedCatalog }` _(optional)_ — Injected dependencies (default to the real bounded OllamaProvider lister + getCuratedCatalog) so the dispatch is unit-testable with a fake ollama lister and a stub catalog — no live daemon/ollama.

**Returns:** `Promise<ModelListResult>` — { provider, available, models } — ollama live-mapped (available:false + [] on failure/timeout), cli-claude/cli-codex from the curated catalog (available:true). Pure read; never throws for a valid provider.

**Errors:**
- `invalid-params result` when params.provider is missing or not one of 'ollama'|'cli-claude'|'cli-codex' — returns the daemon's standard invalid-params error result (the transport's error shape), consistent with the other handlers' params validation; it does not mutate anything.

**Preconditions:**
- The daemon has booted (S001's validateModelCatalog ran, so getCuratedCatalog() is populated).
- params.provider is one of the three ModelProvider values for a successful result.

**Postconditions:**
- Mutates no config or provider state (ac3); makes no direct cloud REST call (ac4); returns available:false + [] rather than a fabricated list when ollama cannot be listed (ac2).

### `listLocalModels`

```typescript
listLocalModels(opts?: { timeoutMs?: number }): Promise<readonly ModelInfo[]>
```

**Parameters:**
- `opts: { timeoutMs?: number }` _(optional)_ — Optional bound for the ollama query (the ollama list must NOT use OllamaProvider's 300s completion header-timeout — a UI-triggered list needs a short bound; defaults to a small timeout).

**Returns:** `Promise<readonly ModelInfo[]>` — The machine's installed ollama models mapped ModelResponse.name -> ModelInfo.id (displayName optional). A new bounded public method on the existing OllamaProvider (src/agent/providers/ollama.ts) wrapping its private this.client.list() (/api/tags) in a timeout race.

**Errors:**
- `throws / rejects` when ollama is unreachable, times out, or returns a malformed response — the method rejects (or the timeout race rejects); the sc2 dispatch catches this and maps it to available:false + [] (ac2). listLocalModels itself performs a read-only /api/tags query and changes no ollama state.

**Preconditions:**
- An OllamaProvider instance (host resolved from the ollama.host config as today).

**Postconditions:**
- Read-only against the local ollama server; no model pull/mutation; bounded by opts.timeoutMs.

### `providers.listModels`

```typescript
'providers.listModels': RpcHandler   // RpcHandler = (params: unknown) => Promise<unknown>
```

**Returns:** `RpcHandler` — The daemon IPC map entry (src/daemon/index.ts) is changed from offlineRpc('providers.listModels') to a real handler delegating to listModels(params) — reviving the offline-stubbed entry in place (lc1: exactly one working way).

**Preconditions:**
- Registered in the daemon handler map like its siblings; served over the existing Unix-socket transport (no new transport).

**Postconditions:**
- The plugins (S003/S004) reach it over the existing shared ipc-client; S002 adds no new transport or daemon dependency.

## Data model changes

### `ModelProvider` — new

type ModelProvider = 'ollama' | 'cli-claude' | 'cli-codex' — the sc2 provider discriminant, exactly the reused runner enum values (k3; superset of S001's CloudProvider which adds ollama). The sc2 contract type S003/S004 consume.

```
+ type ModelProvider = 'ollama' | 'cli-claude' | 'cli-codex'
```

**Call sites:**
- `listModels(params) provider validation`
- `src/config/analyze.ts:88 (AnalyzeShaperProviderKind, the identical runner enum — reference only, reused unchanged)`

### `ModelInfo` — new

interface ModelInfo { readonly id: string; readonly displayName?: string } — one returned model. For ollama, id = ModelResponse.name from the live list; for cloud, id/displayName mapped from S001's CatalogModel. The sc2 contract type S003/S004 render in the dropdown.

```
+ interface ModelInfo { readonly id: string; readonly displayName?: string }
```

**Call sites:**
- `listLocalModels() return element`
- `consumed by S003/S004's sc2 dropdown (adjacent; reference only)`

### `ModelListResult` — new

interface ModelListResult { readonly provider: ModelProvider; readonly available: boolean; readonly models: readonly ModelInfo[] } — the sc2 result. available:false + models:[] signals 'source could not be listed right now' (ollama unreachable); the pickers hard-block + Refresh (ac2/k7). Never a fabricated/cached-as-fresh list.

```
+ interface ModelListResult { readonly provider: ModelProvider; readonly available: boolean; readonly models: readonly ModelInfo[] }
```

**Call sites:**
- `listModels(params) return`
- `src/daemon/index.ts:1519 (the providers.listModels handler result, reviving the offlineRpc stub)`

### `ListModelsParams` — new

interface ListModelsParams { readonly provider: ModelProvider } — the sc2 request. The handler validates the raw unknown params to this shape before dispatch.

```
+ interface ListModelsParams { readonly provider: ModelProvider }
```

**Call sites:**
- `listModels(params) validation input`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S002 owns sc2 (ModelList) in the HLD. It implements sc2 as a standalone dispatch module (e.g. src/daemon/list-models.ts) exporting the ModelProvider/ModelInfo/ModelListResult/ListModelsParams types + listModels(params, deps?), wired into the daemon handler map by reviving 'providers.listModels' from offlineRpc to a real handler that calls listModels(params). Ollama is served via a new bounded OllamaProvider.listLocalModels(); cloud via the sc1 accessor. The handler mutates nothing and exposes ONLY the read-only listModels method + ModelListResult shape; the per-provider dispatch, the ollama timeout/mapping, and the availability determination stay private to S002 (boundary.internal). |
| `sc1` | consumes | The cloud branch consumes S001's sc1 CuratedCatalog via getCuratedCatalog().modelsFor('cli-claude'\|'cli-codex') (src/daemon/model-catalog.ts), mapping CatalogModel{id,displayName?} -> ModelInfo{id,displayName?} into a { available:true, models } result. S002 touches NONE of S001's internals (the catalog file, the boot validator, the copy-assets pipeline) — only the exposed accessor. The catalog is guaranteed loaded at boot, so the cloud branch needs no availability fallback (available is always true; models may be an empty array). |

## Error paths

### Error cases

- **ollama is unreachable (daemon down / wrong host / connection refused) when listing ollama models.** (recoverable)
  - Detection: The bounded listLocalModels() call to this.client.list() rejects with a connection error (undici 'fetch failed'/'other side closed') before the timeout, and the sc2 dispatch's try/catch around the ollama branch catches the rejection.
  - Response: Return { provider:'ollama', available:false, models:[] } — the explicit unavailable signal (ac2/k7). No throw escapes listModels; nothing is cached-as-fresh.
  - User impact: The pickers render 'no models available' + a Refresh (S003/S004), rather than a fabricated or stale list; the user starts ollama and hits Refresh. Recoverable by retry.
- **ollama is running but slow — the list query does not return within the bound.** (recoverable)
  - Detection: The timeout race in listLocalModels() (opts.timeoutMs) wins before this.client.list() resolves; the dispatch treats the timeout branch the same as a failure.
  - Response: Return { provider:'ollama', available:false, models:[] } (ac2). Notably the ollama list must NOT inherit OllamaProvider's 300s completion header-timeout — the bound keeps the UI-triggered call responsive (nonFunctional performance).
  - User impact: The picker hard-blocks + Refresh instead of hanging the UI; a subsequent Refresh (once ollama is responsive) succeeds. Recoverable.
- **ollama returns a malformed / unexpected response shape (no models array, or entries missing .name).** (recoverable)
  - Detection: listLocalModels()/the mapper finds ListResponse.models is not an array or an entry has no string name when mapping ModelResponse.name -> ModelInfo.id.
  - Response: Treat as unavailable: return { provider:'ollama', available:false, models:[] } (never emit a partial/garbage list). Malformed entries are not fabricated into ids.
  - User impact: Same as unreachable — 'no models available' + Refresh; no garbage model ids leak into the dropdown. Recoverable.
- **The caller passes an unknown or missing provider (not 'ollama'|'cli-claude'|'cli-codex').** (recoverable)
  - Detection: listModels validates the raw unknown params: params is not an object, or params.provider is absent / not one of the three ModelProvider literals.
  - Response: Return the daemon's standard invalid-params error result (the transport error shape, consistent with the other handlers' params validation) — NOT a fabricated empty ModelListResult, and mutating nothing.
  - User impact: Programmer/contract error surfaced as invalid-params; the plugins only ever pass one of the three known runner values, so this is not reached in normal use. Recoverable by fixing the call.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A cloud provider (cli-claude/cli-codex) whose curated catalog array is empty (S001 catalog lists none for it). | Return { provider, available:true, models:[] } — available is TRUE (the catalog loaded fine; the source is authoritative) with an empty list, distinct from ollama's available:false. The pickers still render 'no models available' but the semantics differ (a curated-empty, not a source failure). |
| ollama is reachable but has zero installed models. | Return { provider:'ollama', available:true, models:[] } — the query succeeded (source reachable) and honestly reports zero. available:true + empty, NOT available:false (which is reserved for a failed query). |
| A cloud provider request while the ollama server happens to be down. | Unaffected: the cli-claude/cli-codex branch reads only getCuratedCatalog() (in-memory, no network), so ollama's state is irrelevant — returns the curated list with available:true. No cross-branch coupling. |
| An ollama model whose name has no obvious display label. | id = the model name; displayName omitted (optional). No fabricated label. The dropdown shows the id. |
| Two rapid list calls for the same provider (e.g. picker open then Refresh). | Each call independently re-queries (ollama live) or re-reads the frozen catalog (cloud). No caching-as-fresh, no background poll; read-only so concurrent calls are safe (ac3). |

### Invariants to preserve

- No direct cloud REST from our process: the cli-claude/cli-codex branch is served entirely from S001's getCuratedCatalog() (an in-memory boot-loaded asset) — the handler constructs no HTTP/provider client for cloud and does NOT reuse the pre-existing Anthropic-SDK claude.models path (index.ts:1290) that S002 deliberately avoids (k1/ac4). [[c1]]
- The list-models capability is strictly read-only: validating a provider, querying ollama's /api/tags, and reading the curated catalog change no config, no provider state, and no daemon state. It reuses the existing Unix-socket transport + the RpcHandler=(params:unknown)=>Promise<unknown> contract (server.ts:38) — no new transport, no mutation (ac3). [[c1]]
- The ollama live query goes through the existing OllamaProvider's host resolution (ollama.host config, default http://localhost:11434) rather than a second ad-hoc client, preserving one vetted ollama-talking path; the query is bounded (its own short timeout, NOT OllamaProvider's 300s completion header-timeout) and any failure/timeout/malformed response maps to available:false + [] — never a fabricated or cached-as-fresh list (ac2/k7). [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test), colocated under src/**/__tests__/*.test.ts — the sc2 dispatch tests beside src/daemon/ (mirroring src/daemon/__tests__/model-catalog.test.ts + the server-registry/analyze-rpc handler tests) and the listLocalModels test beside src/agent/providers/`

### Test levels

- **unit** — Exercise the listModels dispatch over injected deps (a fake ollama lister + a stub CuratedCatalog) so every branch — cloud-from-catalog, ollama-success, ollama-failure/timeout/malformed, invalid-provider — is tested WITHOUT a live daemon or a live ollama. Mirrors the S001 inject-the-dependency approach.
  - Subjects: `listModels({provider:'cli-claude'}) with a stub catalog -> {provider:'cli-claude', available:true, models} mapped from CatalogModel`, `listModels({provider:'cli-codex'}) -> the cli-codex curated list, available:true`, `listModels({provider:'ollama'}) with a fake lister returning models -> {provider:'ollama', available:true, models} mapped from names`, `listModels({provider:'ollama'}) with a fake lister that REJECTS (unreachable) -> {provider:'ollama', available:false, models:[]}`, `listModels({provider:'ollama'}) with a fake lister that never resolves within the bound (timeout) -> available:false + []`, `listModels({provider:'ollama'}) with a fake lister returning a malformed shape (no models array / entry without name) -> available:false + []`, `listModels with an unknown/missing provider (e.g. {provider:'gpt'} / {} / null) -> the invalid-params error result, no throw, no mutation`, `cloud branch: the injected catalog stub's modelsFor is called and NO ollama lister / HTTP client is invoked (ac4 — assert the fake ollama lister is never called for a cloud provider)`, `read-only: listModels invokes no mutation on the injected deps (the stub catalog + fake lister expose only read methods; assert no config write path is reachable)`
  - Fixtures: `a fake ListModelsDeps: an ollamaList() returning a fixed list / rejecting / hanging / malformed, and a catalog() returning a stub CuratedCatalog with known cli-claude/cli-codex arrays (incl. an empty-array variant)`, `a small bound (timeoutMs) so the timeout test runs fast`
- **unit** — Exercise the new bounded OllamaProvider.listLocalModels() mapping + timeout in isolation, injecting a fake ollama client list() (success / reject / slow / malformed) so no live ollama is needed.
  - Subjects: `listLocalModels() with a fake client.list() returning {models:[{name:'llama3'},{name:'qwen'}]} -> [{id:'llama3'},{id:'qwen'}]`, `listLocalModels() maps only .name -> id, omits displayName (no fabricated label)`, `listLocalModels({timeoutMs}) rejects/settles as failure when the fake list() exceeds the bound (does NOT hang; does NOT use the 300s header-timeout)`, `listLocalModels() surfaces a client.list() rejection (unreachable) as a rejection the caller maps to available:false`
  - Fixtures: `an injectable/fake ollama client (or a seam so listLocalModels can be driven with a stub list()) returning success / rejection / a slow promise / a malformed shape`
- **integration** — Confirm the daemon handler map wiring: 'providers.listModels' is a REAL handler (no longer offlineRpc) delegating to listModels, served over the existing transport, and returns a ModelListResult for a valid provider.
  - Subjects: `the daemon handler map entry for 'providers.listModels' is not offlineRpc (invoking it does NOT return the backend-offline error)`, `invoking the registered handler with {provider:'cli-claude'} returns a ModelListResult sourced from the real getCuratedCatalog() (post-boot)`, `the handler is registered once (no dead duplicate model-listing entry) — lc1`
  - Fixtures: `a handler-map / registry harness (mirror src/daemon/__tests__/server-registry.test.ts / analyze-rpc.test.ts) exercising the registered handler without a full socket round-trip`
- **unit** — Guard the no-cloud-REST invariant structurally: the sc2 dispatch module + listLocalModels construct no Anthropic/OpenAI/cloud client and do not import a cloud REST path.
  - Subjects: `the list-models module's imports contain no direct cloud-REST/provider-SDK reference (only the ollama provider + getCuratedCatalog + node built-ins) — a source-scan assertion mirroring the k1 discipline`, `the cli-claude/cli-codex branch reaches getCuratedCatalog only (no network call constructed)`
  - Fixtures: `a source-scan of the list-models module (read its import list)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `listModels({provider:'ollama'}) with a fake lister returning models -> available:true + mapped models (live local query)`, `listModels({provider:'cli-claude'}) / ({provider:'cli-codex'}) -> the curated catalog list, available:true`, `invoking the registered 'providers.listModels' handler with {provider:'cli-claude'} returns a ModelListResult from the real getCuratedCatalog()` |
| `ac2` | `listModels({provider:'ollama'}) with a rejecting fake lister -> {available:false, models:[]}`, `listModels({provider:'ollama'}) with a hanging fake lister (timeout) -> available:false + []`, `listModels({provider:'ollama'}) with a malformed ollama response -> available:false + [] (no fabricated ids)`, `reachable-but-zero-models ollama -> available:true + [] (distinguished from the failure case)` |
| `ac3` | `listModels invokes no mutation on the injected deps (read-only stub catalog + fake lister; no config-write path reachable)`, `invalid/unknown provider -> invalid-params error result, mutating nothing` |
| `ac4` | `cloud branch: the fake ollama lister is NEVER called for cli-claude/cli-codex; only the catalog stub's modelsFor is`, `source-scan: the list-models module + listLocalModels construct no Anthropic/OpenAI/cloud REST client (no such import) — cloud served entirely from the curated catalog` |

## Migration

**State before:** The daemon registers `'providers.listModels': offlineRpc('providers.listModels')` (src/daemon/index.ts:1519) — a stub that returns the backend-offline error, so there is NO working way to enumerate a provider's models today. The only cloud-model source is the forbidden Anthropic-SDK claude.models handler (index.ts:1290, `client.models.list()`), which S002 must NOT reuse (k1). OllamaProvider (src/agent/providers/ollama.ts:136) wraps the ollama package's Ollama client (host from ollama.host config, config-catalog.ts:80) and exposes NO public model-listing method (its client.list()/api/tags is private, behind a 300s completion header-timeout). S001 (shipped) exposes getCuratedCatalog().modelsFor for the cloud providers. RpcHandler is (params: unknown) => Promise<unknown> (server.ts:38).

**State after:** A new standalone dispatch module (e.g. src/daemon/list-models.ts) exports the sc2 types (ModelProvider/ModelInfo/ModelListResult/ListModelsParams) + `listModels(params, deps?)`, which validates the provider and dispatches: cloud (cli-claude/cli-codex) from getCuratedCatalog().modelsFor (available:true), ollama from a new bounded OllamaProvider.listLocalModels() (available:false + [] on failure/timeout/malformed). The `'providers.listModels'` map entry in src/daemon/index.ts is changed from offlineRpc to a real handler delegating to listModels — revived in place (lc1), one working entry, no dead stub. No cloud REST, strictly read-only, over the existing transport. Colocated node:test tests cover every branch via injected fake ollama-lister + stub catalog.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add a bounded public listLocalModels(opts?) method to OllamaProvider (src/agent/providers/ollama.ts) that wraps its private client.list() (/api/tags) in a short timeout race and maps ModelResponse.name -> ModelInfo.id; it rejects on failure/timeout and does NOT use the 300s completion header-timeout. Purely additive to the existing class; nothing calls it yet. — ↩ rollbackable
2. Add the standalone dispatch module src/daemon/list-models.ts defining the sc2 types + listModels(params, deps?) with injected deps (defaulting to the real bounded ollama lister + getCuratedCatalog): validate provider; cloud -> catalog-mapped {available:true}; ollama -> listLocalModels wrapped in try/catch -> {available:true} on success or {available:false, models:[]} on any failure/timeout/malformed; unknown provider -> invalid-params result. Purely additive; not yet wired. — ↩ rollbackable
3. Change the daemon handler map entry (src/daemon/index.ts) for 'providers.listModels' from offlineRpc('providers.listModels') to a real RpcHandler that delegates to listModels(params). This is the step that flips the capability live (revive-in-place, lc1). No other map entry changes. — ↩ rollbackable
4. Add colocated node:test tests: the list-models dispatch branches (cloud, ollama success/unreachable/timeout/malformed, invalid provider, read-only, no-cloud-REST source-scan) via injected fakes; the listLocalModels mapping+timeout via a fake ollama client; and a handler-map integration check that 'providers.listModels' is no longer offlineRpc. — ↩ rollbackable

**Backward compat:** The only touched existing public surface is the daemon IPC method `providers.listModels`, which is transitioning from a non-functional offline stub (always returned the backend-offline error) to a real read-only result. This is strictly an improvement: any caller that invoked it only ever got an error before, so returning a real ModelListResult breaks nothing — there is no prior successful behaviour to preserve. The method id, the RpcHandler transport contract ((params:unknown)=>Promise<unknown>), and the socket are unchanged; no new transport, no config-schema change, no change to how a runner is selected (k3). OllamaProvider gains one additive public method (listLocalModels) that no existing caller depends on. Rolling back any step restores the offlineRpc stub with no residue.

## Alternatives considered

### a1: Revive providers.listModels in place; ollama via a bounded OllamaProvider.listLocalModels; dispatch in a standalone testable module — **CHOSEN**

Replace the offlineRpc('providers.listModels') stub with a real read-only handler backed by a small standalone dispatch module (src/daemon/list-models.ts) that validates the provider, reads getCuratedCatalog().modelsFor for cloud and a new bounded OllamaProvider.listLocalModels() for ollama, returning ModelListResult.

Keep the existing method id `providers.listModels`. The map entry in src/daemon/index.ts changes from offlineRpc to a real async RpcHandler delegating to a NEW standalone module src/daemon/list-models.ts (the established extract-handlers-into-modules pattern). The module validates params.provider against ModelProvider; for cli-claude/cli-codex returns the getCuratedCatalog().modelsFor list (available:true, no cloud REST); for ollama calls a NEW bounded OllamaProvider.listLocalModels() and returns available:true on success or available:false + [] on any failure/timeout/unreachable (never fabricated). Dispatch takes injected ollama-lister + catalog deps (default real) so tests use a fake lister. Strictly read-only.

### a2: New `models.list` method id; inline ollama fetch (no OllamaProvider method)

Register a fresh `models.list` handler and query ollama by constructing an Ollama client inline in the handler/helper, leaving the old providers.listModels stub in place.

Introduce a new method id `models.list` and query ollama by constructing a fresh Ollama({host}) client (or raw /api/tags) inside the handler with a bounded timeout; cloud still reads getCuratedCatalog().modelsFor. The offlineRpc('providers.listModels') stub is left untouched.

**Rejected because:** Weakest on lc1/k2 (leaves a dead offlineRpc('providers.listModels') stub beside a new models.list — two entries, one working + one erroring) and only partial on k1 (a second ollama client path duplicating host resolution, drift-prone). The cleaner id does not outweigh a dead stub + a duplicated backend-talking path.

### a3: Revive in place but inline the whole dispatch in the index.ts map entry

Same as a1 (revive providers.listModels, bounded OllamaProvider.listLocalModels) but put the provider-validation + dispatch + mapping directly in the index.ts map entry instead of a standalone module.

Replace the offlineRpc stub with a real handler whose body — provider validation, cloud-catalog mapping, ollama bounded call, availability handling — is written inline in the src/daemon/index.ts handler map. Ollama still via a bounded OllamaProvider.listLocalModels.

**Rejected because:** Behaviourally equivalent to a1 and meets every AC/constraint, but scores partial on sc2 packaging: burying the dispatch + contract types in the massive src/daemon/index.ts map contradicts the repo's own extract-handlers-into-modules idiom and makes the ac2/ac4 branches awkward to unit-test with an injected fake ollama lister. Same cost as a1 for worse testability.

## Citations

- **[[c1]]** `analyze-bundle` `src/daemon/index.ts:1519 (providers.listModels offlineRpc stub S002 revives) + :1290 (the forbidden Anthropic-SDK claude.models path, NOT reused) + :94 (offlineRpc factory) + src/daemon/server.ts:38 (RpcHandler = (params:unknown)=>Promise<unknown>).` — "'providers.listModels': offlineRpc('providers.listModels') (index.ts:1519); a REAL handler is an inline async value — the claude.models handler (index.ts:1290) is the shape reference AND the forbidden"
- **[[c2]]** `prior-artifact` `src/daemon/model-catalog.ts (S001, shipped main ad31827): getCuratedCatalog().modelsFor('cli-claude'|'cli-codex') over the boot-validated deep-frozen catalog — the sc1 accessor the cloud branch consumes; no I/O per call, no cloud REST.` — "The cloud branch of sc2 = getCuratedCatalog().modelsFor(provider) mapped CatalogModel -> ModelInfo, returned as {provider, available:true, models}."
- **[[c4]]** `analyze-bundle` `src/agent/providers/ollama.ts:136 (OllamaProvider wraps the ollama package Ollama client; host from ollama.host config, config-catalog.ts:80, default http://localhost:11434; client.list() is the live /api/tags query returning ListResponse.models[].name; 300s completion header-timeout is too long for a UI list).` — "The ollama branch = a live Ollama().list() (/api/tags) via a new bounded listLocalModels on OllamaProvider, mapping ModelResponse.name -> ModelInfo.id, any failure/timeout -> available:false + [] with"
- **[[c6]]** `analyze-bundle` `src/config/analyze.ts:88 — AnalyzeShaperProviderKind = 'ollama'|'cli-claude'|'cli-codex', the runner enum ModelProvider reuses unchanged (k3); ModelProvider is the full three-value enum (superset of S001's cloud-only CloudProvider).` — "ModelProvider = the same three runner values; enum reused unchanged (k3)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-23T13:45:06.838Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | auto | The daemon registers 'providers.listModels' as an offlineRpc stub in src/daemon/index.ts (now :1519 after S001's boot edit), the entry S002 revives into a real handler. | src/daemon/index.ts:1519 read ok; grep confirms `'providers.listModels': offlineRpc(...)` — the offline stub S002 revives is real and at the cited (post-S001-shift) line. | None — confirmed. |
| c1 | citation | LOW | auto | RpcHandler is the type (params: unknown) => Promise<unknown> defined in src/daemon/server.ts, the contract the revived handler satisfies. | src/daemon/server.ts:38 read ok; grep confirms `type RpcHandler = (params: unknown) => Promise<unknown>` verbatim — the transport contract the revived handler satisfies. | None — confirmed. |
| c1 | citation | LOW | auto | offlineRpc(method): RpcHandler is the stub factory in src/daemon/index.ts returning an async handler that yields a backend-offline error. | src/daemon/index.ts:94 read ok; grep confirms `function offlineRpc(method: string): RpcHandler` — the stub factory. | None — confirmed. |
| c1 | citation | LOW | auto | A pre-existing 'claude.models' handler using the Anthropic SDK (client.models.list()) exists in src/daemon/index.ts — the forbidden direct-cloud-REST path S002 deliberately does NOT reuse. | src/daemon/index.ts:1290 read ok; grep confirms `'claude.models':` + `.models.list()` — the Anthropic-SDK cloud path exists and is correctly excluded as the forbidden route (k1/ac4). | None — forbidden-path citation confirmed. |
| c4 | citation | LOW | auto | OllamaProvider (src/agent/providers/ollama.ts) wraps the ollama package's Ollama client with host resolution; it is the existing provider S002 adds the bounded listLocalModels method to. | src/agent/providers/ollama.ts:136 read ok; grep confirms `class OllamaProvider implements LLMProvider` + `new Ollama(` — the existing provider S002 extends with the bounded listLocalModels is real. | None — confirmed. |
| c4 | external-contract | LOW | auto | The ollama package's Ollama client exposes list(): Promise<ListResponse> where ListResponse.models is ModelResponse[] (each with .name) — the live /api/tags query listLocalModels wraps. | The two greps returned 0 ONLY because the review engine greps src/ (not node_modules); the node_modules/ollama .d.ts:359 read succeeded (ok). Independently verified earlier by direct read: `list(): Promise<ListResponse>` (:359) and `models: ModelResponse[]` (:244) — the Ollama.list() /api/tags contract holds. This is an external-package contract, appropriately treated as an assumption. | None — the ollama-package list() contract is confirmed by the .d.ts read; grep-scope (src/ only) explains the 0 matches. |
| c4 | citation | LOW | auto | The ollama host is a config option 'ollama.host' with default http://localhost:11434 (config-catalog.ts), the host OllamaProvider resolves. | src/config/config-catalog.ts:80 read ok; grep confirms `'ollama.host'` + `http://localhost:11434` — the host config the ollama query resolves. | None — confirmed. |
| c2 | cross-artifact | LOW | auto | S001 (shipped) exposes getCuratedCatalog(): CuratedCatalog with modelsFor(provider) in src/daemon/model-catalog.ts — the sc1 accessor S002's cloud branch consumes. | src/daemon/model-catalog.ts read ok; grep confirms `export function getCuratedCatalog(): CuratedCatalog` + `modelsFor(provider: CloudProvider)` — the shipped S001 sc1 accessor the cloud branch consumes exists exactly as described. | None — cross-artifact sc1 consumption confirmed. |
| c6 | citation | LOW | auto | The runner enum AnalyzeShaperProviderKind = 'ollama'\|'cli-claude'\|'cli-codex' (src/config/analyze.ts:88) is exactly the three ModelProvider values, reused unchanged (k3). | src/config/analyze.ts:88 read ok; grep confirms AnalyzeShaperProviderKind + the 'ollama'\|'cli-claude'\|'cli-codex' union — ModelProvider is exactly the reused runner enum (k3). | None — confirmed. |
| cl10 | semantic | LOW | auto | The sc2 contract this LLD implements (listModels(params): Promise<ModelListResult> over ModelProvider/ModelInfo/ModelListResult/ListModelsParams) matches the HLD sc2 interfaceSketch S002 owns. | The epic HLD read ok; the LLD's sc2 surface (listModels(params): Promise<ModelListResult> over ModelProvider/ModelInfo/ModelListResult/ListModelsParams) reproduces the HLD sc2 interfaceSketch S002 owns without deviation. | None — sc2 contract matches the HLD. |
