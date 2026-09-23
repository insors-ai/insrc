<!-- insrc:artifact PLAN-ba132c185fe45860-s2 -->

# Plan: E20260923ba132c18:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790170484323-dcz1a6`
**LLD effective hash:** `3fb0b2204d88...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add bounded OllamaProvider.listLocalModels() | S | — | unit: listLocalModels() with a fake client.list() returning {models:[{name:'llama3'},{name:'qwen'}]} -> [{id:'llama3'},{id:'qwen'}]; unit: listLocalModels() maps only .name -> id, omits displayName (no fabricated label); unit: listLocalModels({timeoutMs}) rejects/settles as failure when the fake list() exceeds the bound (does NOT hang; does NOT use the 300s header-timeout); unit: listLocalModels() surfaces a client.list() rejection (unreachable) as a rejection the caller maps to available:false | [[c4]] |
| 2 | **`t2`** Add the src/daemon/list-models.ts dispatch module (sc2 types + listModels) | M | `t1` | unit: listModels({provider:'cli-claude'}) with a stub catalog -> {provider:'cli-claude', available:true, models} mapped from CatalogModel; unit: listModels({provider:'cli-codex'}) -> the cli-codex curated list, available:true; unit: listModels({provider:'ollama'}) with a fake lister returning models -> {provider:'ollama', available:true, models} mapped from names; unit: listModels({provider:'ollama'}) with a fake lister that REJECTS (unreachable) -> {provider:'ollama', available:false, models:[]}; unit: listModels({provider:'ollama'}) with a fake lister that never resolves within the bound (timeout) -> available:false + []; unit: listModels({provider:'ollama'}) with a fake lister returning a malformed shape (no models array / entry without name) -> available:false + []; unit: listModels with an unknown/missing provider (e.g. {provider:'gpt'} / {} / null) -> the invalid-params error result, no throw, no mutation; unit: cloud branch: the injected catalog stub's modelsFor is called and NO ollama lister / HTTP client is invoked (ac4 — assert the fake ollama lister is never called for a cloud provider); unit: read-only: listModels invokes no mutation on the injected deps (the stub catalog + fake lister expose only read methods; assert no config write path is reachable); unit: the list-models module's imports contain no direct cloud-REST/provider-SDK reference (only the ollama provider + getCuratedCatalog + node built-ins) — a source-scan assertion mirroring the k1 discipline; unit: the cli-claude/cli-codex branch reaches getCuratedCatalog only (no network call constructed) | [[c1]] [[c2]] [[c6]] |
| 3 | **`t3`** Flip the providers.listModels map entry to the real handler | S | `t2` | integration: the daemon handler map entry for 'providers.listModels' is not offlineRpc (invoking it does NOT return the backend-offline error); integration: the handler is registered once (no dead duplicate model-listing entry) — lc1 | [[c1]] |
| 4 | **`t4`** Add colocated node:test tests for the dispatch + listLocalModels + handler wiring | M | `t1`, `t2`, `t3` | integration: invoking the registered handler with {provider:'cli-claude'} returns a ModelListResult sourced from the real getCuratedCatalog() (post-boot) | [[c1]] [[c4]] |

### E20260923ba132c18:S002:T001 — Add bounded OllamaProvider.listLocalModels()

Add a public listLocalModels(opts?: {timeoutMs?}) method to OllamaProvider (src/agent/providers/ollama.ts) that wraps its private this.client.list() (/api/tags) in a short Promise.race timeout, maps ModelResponse.name -> ModelInfo.id (displayName omitted), and rejects on failure/timeout. It must NOT use the 300s completion header-timeout. Provide the lightest testability seam consistent with strict TS + the OllamaProvider surface (an optional injected list-fn param or a small protected hook, matching the S001 inject-the-dependency style) so client.list() can be faked without a live ollama. Additive to the existing class; nothing calls it yet.

**Acceptance checks:**
- listLocalModels() maps a successful client.list() ({models:[{name}...]}) to readonly ModelInfo[] with id = name and no displayName
- listLocalModels({timeoutMs}) settles as a failure (rejects/throws) when the underlying list() exceeds the bound — it does NOT hang and does NOT use the 300s header-timeout
- a client.list() rejection (ollama unreachable) surfaces as a rejection the caller can map to available:false
- the ollama client.list() is fakeable via the chosen seam without a live ollama (drives the t4 unit test)
- the method is read-only against ollama (only /api/tags list; no pull/mutation) and constructs no cloud/Anthropic client

### E20260923ba132c18:S002:T002 — Add the src/daemon/list-models.ts dispatch module (sc2 types + listModels)

Create src/daemon/list-models.ts exporting the sc2 types (ModelProvider/ModelInfo/ModelListResult/ListModelsParams) + listModels(params: unknown, deps?: ListModelsDeps): Promise<ModelListResult>. Validate params.provider against the three ModelProvider literals; cloud (cli-claude/cli-codex) -> getCuratedCatalog().modelsFor mapped to {available:true, models}; ollama -> the bounded lister wrapped in try/catch -> {available:true, models} on success or {available:false, models:[]} on any failure/timeout/malformed; unknown/missing provider -> the invalid-params error result. Injected deps default to the real bounded OllamaProvider lister (t1) + getCuratedCatalog (sc1, consumed). Strictly read-only, no cloud REST.

**Acceptance checks:**
- listModels({provider:'cli-claude'|'cli-codex'}) returns {provider, available:true, models} mapped from getCuratedCatalog().modelsFor (empty array stays available:true)
- listModels({provider:'ollama'}) returns available:true + mapped models on success; available:false + [] on lister rejection/timeout/malformed; available:true + [] when reachable-but-zero
- listModels with an unknown/missing provider returns the invalid-params error result, throwing nothing and mutating nothing
- the module imports only the ollama provider + getCuratedCatalog + node built-ins — no Anthropic/OpenAI/cloud-REST client is constructed or imported (k1/ac4)
- types match the sc2 interfaceSketch exactly; ModelProvider is the three runner values

### E20260923ba132c18:S002:T003 — Flip the providers.listModels map entry to the real handler

Change the daemon IPC handler-map entry (src/daemon/index.ts, ~:1519) for 'providers.listModels' from offlineRpc('providers.listModels') to a real RpcHandler that delegates to listModels(params) from src/daemon/list-models.ts. One-line map-entry change + one import; no other entry changes; revive-in-place (lc1) so there is exactly one working model-listing entry.

**Acceptance checks:**
- the 'providers.listModels' map entry is a real handler delegating to listModels(params), no longer offlineRpc — invoking it does NOT return the backend-offline error
- invoking the registered handler with {provider:'cli-claude'} returns a ModelListResult sourced from the real getCuratedCatalog() (post-boot)
- no dead duplicate model-listing entry exists (lc1); no other handler-map entry or transport changes

### E20260923ba132c18:S002:T004 — Add colocated node:test tests for the dispatch + listLocalModels + handler wiring

Add colocated tests: (a) src/daemon/__tests__ for the list-models dispatch (cloud / ollama success/unreachable/timeout/malformed / reachable-zero / invalid provider / read-only / no-cloud-REST source-scan) via injected fake lister + stub catalog, mirroring model-catalog.test.ts; (b) a listLocalModels test beside src/agent/providers/ via a fake ollama client (success/reject/slow/malformed); (c) a handler-map integration check that 'providers.listModels' is no longer offlineRpc. node:test (tsx --test).

**Acceptance checks:**
- dispatch tests cover cloud, ollama success/unreachable/timeout/malformed, reachable-zero (available:true+[]), invalid provider, and read-only — all via injected fakes, no live daemon/ollama
- a listLocalModels unit test drives the mapping + timeout + rejection via the t1 seam (fake ollama client), no live ollama
- a source-scan test asserts the list-models module + listLocalModels construct no cloud-REST/provider-SDK client (ac4)
- a handler-map integration test asserts 'providers.listModels' is a real handler (not offlineRpc) returning a ModelListResult
- the full local test sweep passes (npx tsx --test) with no network access

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| listModels({provider:'cli-claude'}) with a stub catalog -> {provider:'cli-claude', available:true, models} mapped from CatalogModel | `t2`, `t4` |
| listModels({provider:'cli-codex'}) -> the cli-codex curated list, available:true | `t2`, `t4` |
| listModels({provider:'ollama'}) with a fake lister returning models -> {provider:'ollama', available:true, models} mapped from names | `t2`, `t4` |
| listModels({provider:'ollama'}) with a fake lister that REJECTS (unreachable) -> {provider:'ollama', available:false, models:[]} | `t2`, `t4` |
| listModels({provider:'ollama'}) with a fake lister that never resolves within the bound (timeout) -> available:false + [] | `t2`, `t4` |
| listModels({provider:'ollama'}) with a fake lister returning a malformed shape (no models array / entry without name) -> available:false + [] | `t2`, `t4` |
| listModels with an unknown/missing provider (e.g. {provider:'gpt'} / {} / null) -> the invalid-params error result, no throw, no mutation | `t2`, `t4` |
| cloud branch: the injected catalog stub's modelsFor is called and NO ollama lister / HTTP client is invoked (ac4 — assert the fake ollama lister is never called for a cloud provider) | `t2`, `t4` |
| read-only: listModels invokes no mutation on the injected deps (the stub catalog + fake lister expose only read methods; assert no config write path is reachable) | `t2`, `t4` |
| listLocalModels() with a fake client.list() returning {models:[{name:'llama3'},{name:'qwen'}]} -> [{id:'llama3'},{id:'qwen'}] | `t1`, `t4` |
| listLocalModels() maps only .name -> id, omits displayName (no fabricated label) | `t1`, `t4` |
| listLocalModels({timeoutMs}) rejects/settles as failure when the fake list() exceeds the bound (does NOT hang; does NOT use the 300s header-timeout) | `t1`, `t4` |
| listLocalModels() surfaces a client.list() rejection (unreachable) as a rejection the caller maps to available:false | `t1`, `t4` |
| the daemon handler map entry for 'providers.listModels' is not offlineRpc (invoking it does NOT return the backend-offline error) | `t3`, `t4` |
| invoking the registered handler with {provider:'cli-claude'} returns a ModelListResult sourced from the real getCuratedCatalog() (post-boot) | `t3`, `t4` |
| the handler is registered once (no dead duplicate model-listing entry) — lc1 | `t3`, `t4` |
| the list-models module's imports contain no direct cloud-REST/provider-SDK reference (only the ollama provider + getCuratedCatalog + node built-ins) — a source-scan assertion mirroring the k1 discipline | `t2`, `t4` |
| the cli-claude/cli-codex branch reaches getCuratedCatalog only (no network call constructed) | `t2`, `t4` |

## Citations

- **[[c1]]** `analyze-bundle` `LLD s2 contractDetails/migration: the offline-stubbed 'providers.listModels' at src/daemon/index.ts:1519 (offlineRpc factory :94), RpcHandler=(params:unknown)=>Promise<unknown> (server.ts:38), and the forbidden Anthropic-SDK claude.models path (:1290) NOT reused.` — "'providers.listModels': offlineRpc('providers.listModels') (index.ts:1519); flip to a real handler delegating to listModels; RpcHandler = (params: unknown) => Promise<unknown> (server.ts:38)."
- **[[c2]]** `prior-artifact` `LLD s2 interactionWithShared (consumes sc1): S001's getCuratedCatalog().modelsFor('cli-claude'|'cli-codex') in src/daemon/model-catalog.ts — the shipped accessor the cloud branch reads.` — "The cloud branch consumes getCuratedCatalog().modelsFor mapped CatalogModel -> ModelInfo into a {available:true, models} result."
- **[[c4]]** `analyze-bundle` `LLD s2 contractDetails (listLocalModels): OllamaProvider (src/agent/providers/ollama.ts:136) wraps the ollama package Ollama client (host ollama.host, config-catalog.ts:80); client.list() (/api/tags) returns ListResponse.models[].name; the ollama list needs its OWN bounded timeout, NOT the 300s completion header-timeout.` — "listLocalModels(opts?) wraps this.client.list() (/api/tags) in a timeout race, maps ModelResponse.name -> ModelInfo.id; failure/timeout -> available:false + []."
- **[[c6]]** `analyze-bundle` `LLD s2 dataModelChanges: ModelProvider = 'ollama'|'cli-claude'|'cli-codex' — the reused runner enum AnalyzeShaperProviderKind (src/config/analyze.ts:88), unchanged (k3).` — "type ModelProvider = 'ollama' | 'cli-claude' | 'cli-codex'; the sc2 provider discriminant, exactly the reused runner enum values (k3)."
