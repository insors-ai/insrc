<!-- insrc:artifact LLD-386a3d4a69d333df-S001 -->

# LLD: S001

**Epic:** `pin-ollama-embedding-model-so-stops`
**HLD base run:** `wf-1786097688094-vyx5y1`
**HLD effective hash:** `386a3d4a69d3...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `embed`

```typescript
OllamaProvider.embed(text: string): Promise<number[]>
```

**Parameters:**
- `text: string` — The input text to embed (unchanged).

**Returns:** `Promise<number[]>` — The embedding vector (unchanged). INTERNAL CHANGE ONLY: the underlying `this.client.embed({ model, input })` call (ollama.ts:425) now also passes `keep_alive: this.embeddingKeepAlive`, so Ollama keeps the embed model resident instead of applying its ~5-min default. No signature/return change; delegators (cli-provider, mcp-sampling-provider) are unaffected.

**Preconditions:**
- this.embeddingKeepAlive is set from config in the constructor (default '24h').

**Postconditions:**
- The Ollama embeddings request carries a keep_alive; a '0' value opts back into eager unload; the returned vector is identical to before for the same input+model.

### `loadLocalProviderConfig`

```typescript
loadLocalProviderConfig(): { host: string; coreModel: string; embeddingModel: string; embeddingDim: number; charsPerToken: number; embeddingKeepAlive: string }
```

**Returns:** `LocalProviderConfig` — The live models.local.* surface (src/config/local.ts) read by OllamaProvider. EXTENDED: gains `embeddingKeepAlive: string` read from `models.local.embeddingKeepAlive` (default '24h'), mirroring how `embeddingModel` is surfaced. Memoized via localDefaults().

**Preconditions:**
- config.json loaded / reconciled (the catalog default backfills a missing key).

**Postconditions:**
- embeddingKeepAlive is a non-empty string usable directly as Ollama's keep_alive param.

## Data model changes

### `models.local.embeddingKeepAlive (config-catalog field)` — field-add

New additive config field registered in the models.local.* block of the config catalog: `{ path:'models.local.embeddingKeepAlive', type:'string', default:'24h', desc:'Ollama keep_alive for the embedder model (e.g. 24h / -1 forever / 0 eager-unload) — keeps the hot-path embed model resident during index bursts' }`. Carried forward by the schema-driven reconcile (fill on boot/update); no migration step, no RETIRED_PATHS/alias impact. Read by loadLocalProviderConfig, consumed by OllamaProvider.embed().

```
config-catalog.ts models.local.*: + { path:'models.local.embeddingKeepAlive', type:'string', default:'24h', desc:... }
```

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/local.ts`
- `src/agent/providers/ollama.ts`

### `OllamaProvider (embed keep_alive wiring)` — invariant-change

The invariant 'embed() issues an Ollama embeddings request WITHOUT keep_alive (5-min default leash)' becomes 'embed() passes keep_alive from config, keeping the embedder resident'. The constructor reads `d.embeddingKeepAlive` into a private readonly field (same pattern as `this.embeddingModel = d.embeddingModel`). Additive: complete()/chat() keep_alive is untouched.

```
ollama.ts: constructor `this.embeddingKeepAlive = d.embeddingKeepAlive`; embed() `this.client.embed({ model, input, keep_alive: this.embeddingKeepAlive })`
```

**Call sites:**
- `src/agent/providers/ollama.ts`

## Error paths

### Error cases

- **config.json has an empty/blank models.local.embeddingKeepAlive (e.g. a hand-edit set it to "").** (recoverable)
  - Detection: The OllamaProvider constructor reads d.embeddingKeepAlive and finds an empty string (loadLocalProviderConfig returned '' rather than the catalog default).
  - Response: Guard in the constructor: coalesce an empty/whitespace value to the '24h' default before storing, so embed() never passes keep_alive:'' (which Ollama would treat as an unspecified/odd value).
  - User impact: None — the embedder still gets a sane keep_alive; the operator's blank is treated as 'use default'.
- **An operator sets models.local.embeddingKeepAlive to a string Ollama does not recognize (e.g. 'foo').** (recoverable)
  - Detection: Ollama's embeddings endpoint receives the unrecognized keep_alive; it either errors on the request or ignores it — surfaced by the existing embed() error handling / the returned embeddings.
  - Response: Do not add bespoke validation: keep_alive only governs model residency, not embedding correctness. An unrecognized value at worst reverts to Ollama's default eviction behaviour (the pre-fix status quo); the value is documented in the field desc (24h / -1 / 0). Existing embed() error handling is unchanged.
  - User impact: At worst the embedder reverts to being evicted early (the old slow behaviour) — never wrong embeddings, never a crash.

### Edge cases

| Input | Expected |
| :--- | :--- |
| models.local.embeddingKeepAlive = '-1' | Ollama keeps the embed model resident indefinitely (forever) — best for big-memory hosts. |
| models.local.embeddingKeepAlive = '0' | Eager unload after each request (explicit opt-out) — restores the pre-fix behaviour for a memory-tight host that prefers it; embeddings still correct, just cold. |
| An existing config.json written before this field existed (key absent). | The schema-driven reconcile backfills models.local.embeddingKeepAlive='24h' on daemon boot/update; embed() gets the default with no operator action. |
| The embedder runs through cli-provider / mcp-sampling-provider (delegated embed). | keep_alive is applied inside OllamaProvider.embed() regardless of the caller; the delegators pass through unchanged and are unaffected. |

### Invariants to preserve

- embed() returns the identical embedding vector for the same (input, embeddingModel) as before — keep_alive governs only Ollama model residency, never the embedding output or the method signature/return type. [[c1]]
- The shaper's complete()/chat() keep_alive:'24h' behaviour is untouched — this Story adds a keep_alive to the embed path only, and does not alter the reasoning-model residency policy. [[c1]]
- Adding models.local.embeddingKeepAlive is additive and carried forward by the existing schema-driven reconcile (fill on boot/update) — an old config.json without the key keeps working; no migration step, no RETIRED_PATHS/alias change. [[c2]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (matching src/agent/providers/__tests__ + src/config/__tests__); no live Ollama — the embed call is exercised against a fake client, gated live suites stay behind INSRC_LIVE_TESTS`

### Test levels

- **unit** — Prove OllamaProvider.embed() passes keep_alive (from config) to the Ollama client, and that an empty/blank config value coalesces to the default.
  - Subjects: `embed() calls this.client.embed with a keep_alive property equal to the configured value (default '24h') — captured via a fake/stub `client.embed` that records its args`, `constructor guard: an empty/whitespace models.local.embeddingKeepAlive coalesces to '24h' (embed still passes a non-empty keep_alive)`, `a custom value ('-1' / '0' / '30m') is passed through verbatim to client.embed`, `embed()'s return value (embeddings[0]) is unchanged — keep_alive does not affect the returned vector`
  - Fixtures: `A fake Ollama client whose embed() records the args object + returns a canned { embeddings: [[...]] }`, `An injectable/overridable localDefaults / config value so the test sets embeddingKeepAlive without a real config.json`
- **unit** — Prove the new config field is registered and carried forward by the schema-driven reconcile with its default.
  - Subjects: `config-catalog contains models.local.embeddingKeepAlive with type 'string' and default '24h'`, `reconcile fills models.local.embeddingKeepAlive='24h' into a config.json that lacks the key (carry-forward on boot/update), and preserves an operator-set value`, `loadLocalProviderConfig surfaces embeddingKeepAlive on its returned object`
  - Fixtures: `A config object without the key (to assert fill) and one with a custom value (to assert preserve) — reuse the existing config-reconcile test harness`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: embed() passes keep_alive (configured value, default '24h') to client.embed — captured via the fake client`, `unit: empty/blank config value coalesces to '24h'; custom values pass through verbatim`, `unit: embed() return value unchanged (keep_alive affects only residency)` |
| `ac2` | `unit: config-catalog registers models.local.embeddingKeepAlive (type string, default '24h')`, `unit: reconcile backfills the default into a key-less config.json and preserves an operator override; loadLocalProviderConfig surfaces it` |

## Migration

**State before:** OllamaProvider.embed() (ollama.ts:423-425) issues `this.client.embed({ model, input })` with NO keep_alive, so Ollama applies its ~5-min default and evicts the embed model under memory pressure (cold ~2s reload vs ~0.1s warm). There is no models.local.embeddingKeepAlive config field; config.json files in the wild have no such key.

**State after:** config-catalog registers models.local.embeddingKeepAlive (string, default '24h'); loadLocalProviderConfig surfaces it; OllamaProvider.embed() passes `keep_alive` from it, keeping the embed model resident. Existing config.json files without the key are backfilled to '24h' by the schema-driven reconcile on the next daemon boot/update. Operators can override ('-1' forever, '0' eager-unload).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the additive config-catalog entry { path:'models.local.embeddingKeepAlive', type:'string', default:'24h', desc:... } (a nullable/defaulted field — no value required from operators). — ↩ rollbackable
2. Surface embeddingKeepAlive on loadLocalProviderConfig's returned object (read models.local.embeddingKeepAlive, fall back to the catalog default). — ↩ rollbackable
3. In OllamaProvider: read d.embeddingKeepAlive in the constructor (coalescing empty/blank to '24h') and pass it as keep_alive in embed()'s client.embed call. — ↩ rollbackable
4. On the next daemon boot/update, the existing reconcile fill-step backfills models.local.embeddingKeepAlive='24h' into any config.json lacking it (no separate data rewrite; reuses the standard carry-forward). — ↩ rollbackable

**Backward compat:** No public API changes: embed()/loadLocalProviderConfig signatures and return types are unchanged (loadLocalProviderConfig gains a field, an additive superset). embed() delegators (cli-provider, mcp-sampling-provider) pass through untouched. An old config.json without the key works (reconcile backfills the default); setting the field to '0' exactly restores the pre-fix eviction behaviour. Rolling back the code leaves an orphan config key that is simply ignored.

## Alternatives considered

### a1: models.local.embeddingKeepAlive config knob — **CHOSEN**

Add a `models.local.embeddingKeepAlive` string field to the config catalog (default '24h'), expose it on the local-provider defaults, and pass it as keep_alive in embed().



### a2: Hardcoded keep_alive constant in embed()

Pass a hardcoded `keep_alive: '24h'` (a named module constant) in embed(), no config surface.



**Rejected because:** Smallest change and fixes the default case, but bakes a policy that this session proved can be wrong on small-memory machines. Loses to a1 on host-tunable (violates vs satisfies).

### a3: Shared keep_alive constant for shaper + embedder

Extract ONE shared keep_alive constant/config used by BOTH complete()/chat() and embed(), unifying the policy.



**Rejected because:** Conceptually DRY but conflates two very different residency footprints and disturbs the working shaper path. Loses to a1 on minimal-blast-radius (violates vs partial) and host-tunable (partial vs satisfies).

## Citations

- **[[c1]]** `analyze-bundle` `s1 usage.example — OllamaProvider.embed() at ollama.ts:423-425 issues client.embed({model,input}) with NO keep_alive; complete()/chat() pin keep_alive:'24h' at ollama.ts:342/501` — "src/agent/providers/ollama.ts:423-425: `async embed(text): Promise<number[]> { const result = await this.client.embed({ model: this.embeddingModel, input: text }); return result.embeddings[0] ?? []; }"
- **[[c2]]** `analyze-bundle` `s1 data-model.ground — config-catalog.ts models.local.* block (ln 111-116); a new models.local.embeddingKeepAlive field is carried forward by the schema-driven reconcile` — "A new field `models.local.embeddingKeepAlive` (type 'string', default '24h') registered here is carried forward automatically by the schema-driven reconcile (CONFIG_CATALOG + reconcile fill/repair on "

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-07T10:21:02.282Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | OllamaProvider.embed() calls this.client.embed({ model, input }) WITHOUT a keep_alive argument (the bug this Story fixes). | CONFIRMED verbatim: src/agent/providers/ollama.ts:425 reads `const result = await this.client.embed({ model: this.embeddingModel, input: text });` — no keep_alive argument, exactly the bug the Story fixes. | None — fix site verified. |
| cl2 | citation | LOW | auto | The shaper path complete()/chat() pins keep_alive:'24h' (the pattern embed() will mirror). | Supported: the shaper path complete()/chat() pins keep_alive:'24h' (ollama.ts:342 conditional keepAlive + ln 501 literal '24h'), verified by direct inspection this session — the pattern embed() mirrors. | None. |
| cl3 | citation | LOW | auto | The config catalog registers a models.local.* block (host/embeddingModel/embeddingDim/coreModel/charsPerToken) where an additive models.local.embeddingKeepAlive field is registered. | Supported: config-catalog.ts registers the models.local.* block (models.local.host/embeddingModel/embeddingDim/coreModel/charsPerToken at ln 111-116), the additive registration site for models.local.embeddingKeepAlive. | None. |
| cl4 | citation | LOW | auto | loadLocalProviderConfig (src/config/local.ts) is the local-provider config surface OllamaProvider reads via localDefaults(); it is where embeddingKeepAlive is surfaced. | Supported: OllamaProvider memoizes localDefaults()=loadLocalProviderConfig() (ollama.ts:54-58); loadLocalProviderConfig lives in src/config/local.ts and is the models.local.* surface where embeddingKeepAlive is added. | None. |
| cl5 | citation | LOW | auto | The OllamaProvider constructor reads local defaults into private fields (e.g. this.embeddingModel = d.embeddingModel), the same pattern embeddingKeepAlive will follow. | Supported: the constructor reads local defaults into private fields — `this.embeddingModel = d.embeddingModel` (ollama.ts:179) — the exact pattern embeddingKeepAlive follows. | None. |
| cl6 | semantic | LOW | auto | The embed() delegators cli-provider and mcp-sampling-provider implement embed by delegating to embedDelegate.embed(text), so a keep_alive change inside OllamaProvider.embed() flows through them unchanged. | Supported: cli-provider.ts:285-289 and mcp-sampling-provider.ts:258-266 implement embed() by delegating to embedDelegate.embed(text) (the LLMProvider.embed contract at shared/types.ts:181); the keep_alive change inside OllamaProvider.embed() flows through them unchanged. | None — delegators unaffected. |
| cl7 | external-contract | LOW | auto | Ollama's embeddings API accepts a keep_alive parameter governing model residency (string like '24h'/'-1'/'0'), so passing it in embed() keeps the embed model loaded without affecting the returned vector. | External contract (Ollama): the embeddings API accepts keep_alive governing model residency (the shaper already uses '24h' successfully). keep_alive affects only residency, not the returned vector — an unrecognized value at worst reverts to default eviction (handled as a recoverable error case). Reasonable and low-risk. | None — documented + guarded in error paths. |
| cl8 | semantic | LOW | auto | Adding a config-catalog field is carried forward by the schema-driven reconcile (fill/repair on boot/update) with no separate migration — an old config.json without the key keeps working. | Supported: the config catalog + reconcile (config-catalog.ts CONFIG_CATALOG + reconcile.ts fill/repair) carry an additive field forward on boot/update — the established config-reconcile pattern; an old config.json without the key backfills to the catalog default. | None. |
