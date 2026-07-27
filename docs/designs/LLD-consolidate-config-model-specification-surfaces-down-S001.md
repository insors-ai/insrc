<!-- insrc:artifact LLD-f5a6e60ccefd9be4-S001 -->

# LLD: S001

**Epic:** `consolidate-config-model-specification-surfaces-down`
**HLD base run:** `wf-1785134702818-ww9xc4`
**HLD effective hash:** `f5a6e60ccefd...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `reconcileConfig`

```typescript
reconcileConfig(existing: unknown, catalog?: readonly ConfigOption[], retired?: readonly RetiredPath[]): ConfigReconcileResult
```

**Parameters:**
- `existing: unknown` — the on-disk config document (or non-object → treated as {})
- `catalog: readonly ConfigOption[]` _(optional)_ — recognized keys to fill/repair; defaults to the trimmed 30-row CONFIG_CATALOG
- `retired: readonly RetiredPath[]` _(optional)_ — declared-dead paths to STRIP from the merged config; defaults to RETIRED_PATHS. Exact-path for scalar leaves; prefix:true deletes a whole dynamic subtree (e.g. models.agents)

**Returns:** `ConfigReconcileResult` — reconciled config plus carried/filled/repaired/pruned channels and a `changed` flag (filled+repaired+pruned>0)

**Errors:**
- `ConfigCatalogError` when a catalog row has an out-of-domain type or a default failing its own predicate, OR a retired path collides with a live catalog row (retired ∩ catalog ≠ ∅) — a self-inconsistent shipped catalog [[c1]]

**Preconditions:**
- retired paths must be disjoint from live catalog paths

**Postconditions:**
- every retired exact-path/prefix-subtree present in `existing` is absent from result.config and listed in result.pruned
- un-catalogued keys NOT on the retired list are preserved byte-for-byte (blind-preservation, refined) [[c3]]
- reconcileConfig(reconcileConfig(x).config).changed === false (idempotent, pruning included) [[c1]]

### `RetiredPath`

```typescript
interface RetiredPath { readonly path: string; readonly prefix?: boolean }
```

**Returns:** `type` — one declared-retired config path; prefix:true strips path AND its whole subtree (for dynamic namespaces like models.agents)

### `RETIRED_PATHS`

```typescript
export const RETIRED_PATHS: readonly RetiredPath[]
```

**Returns:** `readonly RetiredPath[]` — the declared-dead model paths: models.local, models.embedding, models.embeddingDim, models.tiers (prefix), models.context (prefix), models.agents (prefix)

**Postconditions:**
- disjoint from every CONFIG_CATALOG path [[c1]]

### `reconcileConfigFile`

```typescript
reconcileConfigFile(opts?: ReconcileFileOpts): ConfigIoOutcome
```

**Parameters:**
- `opts: ReconcileFileOpts` _(optional)_ — configPath/catalog/fs seams; unchanged public shape — pruning flows via the ConfigReconcileResult it already carries

**Returns:** `ConfigIoOutcome` — written/unchanged/first-boot/… outcome; a 'written' now also fires when only pruning changed the doc (result.pruned non-empty) [[c1]]

**Errors:**
- `n/a` when unchanged — same structured non-fatal outcome kinds

**Postconditions:**
- writes at most once, only when result.changed (now including pruned) [[c1]]

### `toConfig`

```typescript
toConfig(rec: ModelRecommendation): RecommendedConfig
```

**Parameters:**
- `rec: ModelRecommendation` — recommender output; the emitted RecommendedConfig drops the legacy models.{local,embedding,embeddingDim,tiers,context} block, keeping only models.providers.local.* (+ ollama.host)

**Returns:** `RecommendedConfig` — the trimmed config skeleton written at setup — only the canonical local surface [[c2]]

**Postconditions:**
- never emits a retired path

## Data model changes

### `CONFIG_CATALOG` — field-remove

Remove the 11 dead rows: models.local, models.embedding, models.embeddingDim, models.tiers.{fast,standard,powerful}, models.context.{local,localMaxOutput,claude,claudeMaxOutput,charsPerToken}. 41 → 30 rows. The header comment's 'sync with' note updates to point at the two canonical surfaces. [[c1]] [[c2]]

```
- 11 rows (models.local, models.embedding, models.embeddingDim, models.tiers.*, models.context.*)
```

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/__tests__/config-catalog-contract.test.ts`

### `RETIRED_PATHS` — new

New export in src/config/config-catalog.ts listing the retired model paths as RetiredPath[]: exact-path {path:'models.local'}, {path:'models.embedding'}, {path:'models.embeddingDim'}; prefix {path:'models.tiers',prefix:true}, {path:'models.context',prefix:true}, {path:'models.agents',prefix:true}. [[c2]]

```
+ export const RETIRED_PATHS: readonly RetiredPath[]
```

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/reconcile.ts`

### `ConfigReconcileResult` — field-add

Add readonly pruned: string[] — the dot-paths (and expanded subtree roots) actually removed. changed = filled.length+repaired.length+pruned.length > 0. [[c5]]

```
+ readonly pruned: readonly string[]
```

**Call sites:**
- `src/config/reconcile.ts`
- `src/config/reconcile-io.ts`
- `src/config/__tests__/config-reconcile.test.ts`

### `MaintenanceResult.configReconcile` — field-add

Add readonly pruned: number to the configReconcile summary so maintenance.update surfaces prune counts; the compile-time contract fixture pins it. [[c5]]

```
configReconcile?: { changed; filled; repaired; pruned: number; error? }
```

**Call sites:**
- `src/cli/services/maintenance.ts`
- `src/cli/services/type-contracts/maintenance-result.ts`

### `Config.models (shared/types.ts)` — field-remove

Trim whatever declares the legacy top-level model keys (models.local/embedding/embeddingDim/tiers/context) from the Config/AgentConfig type surface + RecommendedConfig in model-recommender.ts, keeping models.providers.local.* and models.analyze.*. [[c5]] [[c2]]

```
- models.{local,embedding,embeddingDim,tiers,context} from the type
```

**Call sites:**
- `src/shared/types.ts`
- `src/shared/model-recommender.ts`
- `src/cli/services/setup.ts`

## Error paths

### Error cases

- **A retired path collides with a live CONFIG_CATALOG row (retired ∩ catalog ≠ ∅) — a self-inconsistent shipped catalog that would both fill and strip the same key.** (terminal)
  - Detection: reconcileConfig computes the set of live catalog paths and, before pruning, checks each RetiredPath.path (exact or prefix) against it; overlap throws.
  - Response: Throw ConfigCatalogError naming the offending path (same class already used for out-of-domain catalog rows), surfaced by reconcile-io as the catalog-error outcome kind — distinct from user-config/I-O failures.
  - User impact: A programmer error in our shipped catalog is logged distinguishably at boot / reported by update; the user config is left untouched.
- **A corrupt / unparseable config.json reaches the reconcile at boot or update.** (recoverable)
  - Detection: reconcile-io JSON.parse throws BEFORE reconcileConfig runs, so pruning never executes.
  - Response: Abort with the existing parse-error outcome; write nothing (no default-fill and no prune over a corrupt doc).
  - User impact: The corrupt file is left byte-identical; retire keys are not stripped this pass but will be on the next successful boot after the user fixes the file.
- **The config document is modified concurrently between the read-stat and the pre-rename re-stat while a prune-only change is pending.** (recoverable)
  - Detection: The existing concurrent-modification guard in reconcile-io re-stats before rename; a mismatch abandons the write.
  - Response: Abandon the write (concurrent-modification outcome); the newer document is intact and pruning retries next pass.
  - User impact: None beyond a one-boot delay in stripping the dead keys.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A retired exact-path (e.g. models.local) is absent from the existing config. | No-op: the path is not added to result.pruned and does not set changed. |
| A retired prefix root (models.agents) is present as a populated object with sub-keys. | The whole subtree is deleted and recorded ONCE as the prefix root ('models.agents') in result.pruned, not one entry per sub-key. |
| A retired exact-path holds a falsy-but-present value (0, "", false). | Still pruned — existence is tested via hasOwnProperty, not truthiness (mirrors the fill-side rule). |
| A retired path's ANCESTOR is missing (e.g. no `models` object at all). | No-op; nothing to delete, nothing recorded. |
| A retired prefix root is present as a SCALAR rather than an object (e.g. models.context: "oops"). | Still deleted (the whole slot is removed) and recorded as pruned — prefix delete is type-agnostic. |
| After a prune-only pass, reconcile runs again on the written config. | changed === false and result.pruned === [] — the keys are already gone (idempotent). |

### Invariants to preserve

- Un-catalogued keys that are NOT on the retired list are preserved byte-for-byte. Pruning is the ONLY exception to blind preservation; the live dynamic namespaces models.analyze.roleTiers / models.analyze.byRepo / models.providers.local.* must survive every reconcile unchanged. [[c3]]
- The live cloud/tiering surface models.analyze.* (shaperProvider/shaperModel/tiers/roleTiers/coreFloor/byRepo) is never on the retired list and is never pruned — it is the canonical replacement for the removed legacy models.tiers.*. [[c4]]
- reconcile-io writes AT MOST ONCE and only when result.changed; a prune-only change must trip changed so the strip is persisted in exactly one write. [[c1]]
- reconcileConfig remains idempotent: a second pass over its own output reports changed === false, pruning included. [[c1]]
- config list (CONFIG_CATALOG consumer) and its self-consistency still hold with the trimmed 30-row catalog; no live reader of models.providers.local.* / models.analyze.* is affected by the removal of the legacy top-level keys. [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict (npx tsx --test 'src/**/__tests__/*.test.ts')`

### Test levels

- **unit** — Pure reconcileConfig prune contract, driven through the injectable retired param with in-memory fixtures.
  - Subjects: `unit: retired exact-path present → deleted from config.config, recorded in pruned[], changed true`, `unit: retired exact-path absent → no-op, not in pruned, does not set changed`, `unit: retired prefix root with populated subtree → whole subtree deleted, recorded ONCE as the prefix root (not per sub-key)`, `unit: retired prefix root present as a SCALAR → slot removed, recorded (type-agnostic delete)`, `unit: retired exact-path with falsy-but-present value (0/""/false) → pruned via hasOwnProperty, not truthiness`, `unit: retired path with a MISSING ancestor → no-op, nothing recorded`, `unit: un-catalogued key NOT on the retired list → preserved (blind-preservation refined); models.analyze.roleTiers/byRepo + models.providers.local.* survive deep-equal`, `unit: changed === (filled+repaired+pruned > 0)`, `unit: idempotence — reconcileConfig(reconcileConfig(x).config).pruned === [] and changed === false`, `unit: a retired path overlapping a live catalog row throws ConfigCatalogError naming the path`, `unit: reconcileConfig existing never mutated (deep-freeze) even when pruning`
  - Fixtures: `src/config/__tests__/fixtures/legacy-config.json (carries all retired keys + live dynamic namespaces)`
- **contract** — Catalog + retired-list integrity and the trimmed row count, no runtime data.
  - Subjects: `contract: CONFIG_CATALOG has 30 rows (was 41); none of the 11 removed paths remain`, `contract: RETIRED_PATHS is disjoint from every CONFIG_CATALOG path (retired ∩ live = ∅) — reconcileConfig({}, CONFIG_CATALOG, RETIRED_PATHS) does not throw ConfigCatalogError`, `contract: RETIRED_PATHS covers exactly models.local, models.embedding, models.embeddingDim, models.tiers(prefix), models.context(prefix), models.agents(prefix)`, `contract: MaintenanceResult.configReconcile compile-time fixture pins the new readonly pruned:number field (optional, exactOptionalPropertyTypes)`
- **integration** — reconcile-io write-once with pruning + both call-site reporting, on a temp INSRC home with a write-counting fs seam.
  - Subjects: `integration: legacy fixture on disk → exactly 1 writeFile + 1 rename; retired keys gone, dynamic namespaces byte-identical to baseline`, `integration: a config with ONLY retired keys to remove (nothing to fill/repair) → still 1 write (prune-only trips changed)`, `integration: already-pruned config → 0 writeFile, 0 rename, mtime unchanged (convergence)`, `integration: daemon boot reconcile strips retired keys and logs a pruned count; a retired∩live catalog bug logs the distinguishable shipped-catalog warn and leaves the file untouched`, `integration: maintenance.update runUpdateReconcile reports configReconcile.pruned + one onLog detail line per pruned path (naming the dot-path); no-change emits an explicit no-change line`
- **smoke** — End-to-end convergence on the captured fixture using the real boot + update functions.
  - Subjects: `smoke: boot against a temp home holding the legacy fixture → models.{local,embedding,embeddingDim,tiers,context,agents} absent afterwards, models.providers.local.* + models.analyze.* intact; second boot writes nothing`, `smoke: setup write-side — model-recommender.toConfig()/setup output contains none of the retired paths`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: CONFIG_CATALOG has 30 rows (was 41); none of the 11 removed paths remain`, `unit: un-catalogued key NOT on the retired list → preserved (blind-preservation refined); models.analyze.roleTiers/byRepo + models.providers.local.* survive deep-equal` |
| `ac2` | `unit: retired exact-path present → deleted, recorded in pruned[], changed true`, `unit: retired prefix root with populated subtree → whole subtree deleted, recorded once as the prefix root`, `unit: retired exact-path with falsy-but-present value (0/""/false) → pruned via hasOwnProperty` |
| `ac3` | `unit: idempotence — reconcileConfig(reconcileConfig(x).config).pruned === [] and changed === false`, `unit: changed === (filled+repaired+pruned > 0)`, `integration: a config with ONLY retired keys → still exactly 1 write (prune-only trips changed)`, `integration: already-pruned config → 0 writeFile, 0 rename, mtime unchanged` |
| `ac4` | `unit: a retired path overlapping a live catalog row throws ConfigCatalogError naming the path`, `contract: RETIRED_PATHS disjoint from every CONFIG_CATALOG path — reconcileConfig({}, CONFIG_CATALOG, RETIRED_PATHS) does not throw` |
| `ac5` | `integration: daemon boot reconcile strips retired keys and logs a pruned count; retired∩live bug logs the distinguishable warn and leaves the file untouched`, `integration: maintenance.update reports configReconcile.pruned + one onLog detail line per pruned path`, `smoke: boot against the legacy fixture → retired keys absent, live surfaces intact; second boot writes nothing` |
| `ac6` | `smoke: model-recommender.toConfig()/setup output contains none of the retired paths`, `contract: MaintenanceResult.configReconcile compile-time fixture pins pruned:number; the whole build (tsc) is clean after trimming the Config type` |
| `ac7` | `unit: models.analyze.roleTiers/byRepo + models.providers.local.* survive deep-equal across a prune`, `unit: retired prefix root models.agents with populated subtree → whole subtree deleted, recorded once` |

## Migration

**State before:** Three overlapping model-config surfaces exist. The legacy top-level block models.{local, embedding, embeddingDim, tiers.{fast,standard,powerful}, context.*} plus the dynamic models.agents subtree are WRITTEN (model-recommender.toConfig + setup.ts) and shown in `config list`, but NO runtime code reads them to select a model (confirmed against s1 bundles: local model = models.providers.local.coreModel via local.ts/ollama.ts; embeddings = models.providers.local.embeddingModel/embeddingDim; cloud/tiering = models.analyze.*; config.agents is an offlineRpc stub). CONFIG_CATALOG carries all 41 rows including the 11 dead ones. reconcileConfig preserves every un-catalogued key blindly, so once these keys are on disk they linger forever — including in the freshly-shipped ~/.insrc/config.json the boot reconcile just filled. [[c2]] [[c6]]

**State after:** Two canonical surfaces only: models.providers.local.* (local) and models.analyze.* (cloud/tiering). CONFIG_CATALOG is 30 rows. RETIRED_PATHS declares the removed paths; reconcileConfig strips them (exact-path + prefix-subtree) on every boot/update, recording them in a pruned[] channel surfaced by the daemon-boot log and MaintenanceResult.configReconcile. model-recommender.toConfig + setup.ts no longer emit the legacy block. Existing installed configs converge (dead keys removed in one write) and stay converged (idempotent).

**Zero downtime:** yes — **Data rewrite:** yes

### Steps

1. Add RetiredPath type + RETIRED_PATHS export and remove the 11 dead rows from CONFIG_CATALOG (src/config/config-catalog.ts). Purely a source/contract change; no on-disk effect yet. — ↩ rollbackable
2. Teach reconcileConfig to accept the retired list and run a prune phase after the merge, adding the pruned[] result channel and the retired∩live catalog-integrity assertion. Thread the pruned count through reconcile-io's write-once decision (prune-only change => changed => one write). — ↩ rollbackable
3. Stop the write-side from emitting the legacy block: trim model-recommender.toConfig() and cli/services/setup.ts to the canonical surfaces, and trim the Config/RecommendedConfig type in shared/types.ts. New installs no longer gain the dead keys. — ↩ rollbackable
4. Surface pruned keys in both reconcile call sites: add the pruned count + per-path detail to the daemon-boot log switch and to MaintenanceResult.configReconcile (+ its compile-time contract fixture). — ↩ rollbackable
5. Roll out: FF + rebuild + restart the installed daemon. On boot the authoritative reconcile strips the retired keys from the live ~/.insrc/config.json in one write; `maintenance.update` does the same for anyone updating. No manual data edit — the reconcile performs the one-time rewrite. — ✕ non-rollbackable

**Backward compat:** reconcileConfig gains an OPTIONAL third param (retired, defaulting to RETIRED_PATHS) and an ADDITIVE pruned[] result field — existing 2-arg callers and result readers keep compiling. reconcileConfigFile's public shape is unchanged. The observable behavior change is that the retired model keys are REMOVED from existing configs on next boot/update; this is safe because no runtime code reads them (verified in s1). A user who had hand-set e.g. models.tiers.powerful loses only a key nothing consumed — the canonical equivalent is models.analyze.tiers.core. Rollback: reverting the source restores the 41-row catalog; already-pruned configs simply lack the dead keys, and the old (reverted) code would re-fill only the ones still in the catalog — no crash, since all readers use the canonical surfaces.

## Alternatives considered

### a1: Retired-list parameter + `pruned` channel inside reconcileConfig — **CHOSEN**

reconcileConfig gains a second (retired) input and a `pruned[]` result channel; it merges catalog defaults then strips declared-retired paths, in one pure pass.

Add a `RETIRED_PATHS: readonly RetiredPath[]` export to src/config/config-catalog.ts, where RetiredPath is { path: string; prefix?: boolean } (prefix:true strips a whole dynamic subtree, e.g. models.agents). reconcileConfig(existing, catalog = CONFIG_CATALOG, retired = RETIRED_PATHS) keeps its copy-on-write merge, then runs a prune phase that deletes each retired path (exact for scalar leaves, subtree-delete for prefix rows) from the merged config, recording every path actually removed in a new readonly `pruned: string[]` field of ConfigReconcileResult. `changed` becomes filled+repaired+pruned > 0. The blind-preservation invariant is refined to 'preserve every un-catalogued key EXCEPT those explicitly on the retired list'. reconcile-io/daemon-boot/maintenance.update just read the extra `pruned` count; ConfigCatalogError is extended to reject a retired path that overlaps a live catalog row (a self-inconsistent catalog).

### a2: Separate pure pruneRetired() composed after reconcileConfig

Leave reconcileConfig purely additive; add a distinct pure pruneRetired(config, retired) → {config, pruned} and compose the two in reconcile-io.

reconcileConfig stays exactly as-is (merge + blind preservation). A new pure function pruneRetired(config, retired: readonly RetiredPath[]): { config, pruned: string[] } in src/config/reconcile.ts deletes declared-retired paths from a copy. reconcile-io.reconcileConfigFile composes them: reconcile → prune → write-once if either changed. The two reconcile call sites aggregate reconcile.changed || prune.pruned.length. Reporting carries both a reconcile summary and a prune summary.

**Rejected because:** Keeps reconcileConfig's contract pristine, but pushes composition + dual-changed aggregation to every call site, weakening the reporting and write-once guarantees (two partials on surface-pruned-in-reporting + idempotent-writeonce) that a1 keeps single-sourced.

### a3: Tombstone rows in CONFIG_CATALOG (retired:true flag)

Keep one catalog array; mark removed rows { retired: true } and have reconcileConfig strip those paths instead of filling them.

Extend ConfigOption with an optional `retired?: true`. The 11 dead rows stay in CONFIG_CATALOG but flagged retired (documenting default/desc for history). reconcileConfig skips retired rows for fill/repair and instead deletes their path from the merged config, recording them in `pruned[]`. models.agents (dynamic subtree) needs a prefix-retired variant.

**Rejected because:** Overloading ConfigOption with a retired flag forces every catalog consumer to branch on two opposite semantics and violates the trim-catalog-contract constraint (muddied row-count/self-consistency, retired rows leak into `config list`); still needs a special shape for the models.agents subtree — more conceptual cost than a1's clean separate list, for no gain.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — reconcileConfig/CONFIG_CATALOG/reconcileConfigFile signatures` — "reconcileConfig … a copy-on-write MERGE that fills absent catalog keys, repairs type-invalid ones, and preserves every un-catalogued key BLINDLY; reconcileConfigFile is the read/reconcile/write-once w"
- **[[c2]]** `analyze-bundle` `s1 search.text — who WRITES the 5 dead groups` — "models.tiers.*/local/embedding(Dim)/context.* written ONLY by model-recommender.toConfig() + setup.ts; no runtime reader; config.agents is an offlineRpc stub (src/shared/model-recommender.ts, src/cli/"
- **[[c3]]** `analyze-bundle` `s1 usage.example — live local surface models.providers.local.*` — "loadLocalProviderConfig() reads models.providers.local.{coreModel,embeddingModel,embeddingDim,charsPerToken,host}; ollama.ts/embedder.ts/lifecycle.ts consume it (src/config/local.ts, src/agent/provide"
- **[[c4]]** `analyze-bundle` `s1 usage.example — live cloud/tiering surface models.analyze.*` — "loadAnalyzeConfig()/parseTiering() read models.analyze.{shaperProvider,shaperModel,tiers,roleTiers,coreFloor,byRepo}; RoleRouter + workflow-rpc consume the tiering (src/config/analyze.ts, src/analyze/"
- **[[c5]]** `analyze-bundle` `s1 data-model.trace — Config type + reconcile result/outcome types` — "ConfigReconcileResult {config,changed,carried,filled,repaired} must gain a pruned channel; MaintenanceResult.configReconcile + the daemon-boot switch must surface pruned counts (src/shared/types.ts, s"
- **[[c6]]** `analyze-bundle` `s1 test.locate — existing reconcile suites` — "config-reconcile.test.ts / config-catalog-contract.test.ts (41-row self-consistency → 30) / config-reconcile-io.test.ts / maintenance-reconcile.test.ts / config-boot-reconcile.test.ts; fixtures/legacy"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-07-27T07:01:17.546Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | inventory | LOW | manual | CONFIG_CATALOG in src/config/config-catalog.ts currently has 41 rows, and the 11 to remove (models.local, models.embedding, models.embeddingDim, models.tiers.fast/standard/powerful, models.context.local/localMaxOutput/claude/claudeMaxOutput/charsPerToken) are all present. | config-catalog.ts:40 models.local, :41 models.embedding, :46-47 models.context.* present; direct count confirms CONFIG_CATALOG has exactly 41 rows and all 11 dead paths are present. | none — verified sound (41 rows, 11 removable present). |
| cl2 | semantic | LOW | manual | No runtime code READS the legacy keys models.tiers.{fast,standard,powerful} / models.local / models.embedding(Dim) / models.context.* to select a model — the only non-test references are the writers (model-recommender.toConfig, setup.ts), the catalog, and display code. | grep for models.tiers.{fast,standard,powerful} + models.context.* over src returns ONLY the writer (model-recommender.ts:430), tests, LLD docs, and the catalog — no runtime reader selecting a model. Dead-key claim holds. | none — verified sound. |
| cl3 | citation | LOW | manual | model-recommender.toConfig() emits a hardcoded models.tiers {fast,standard,powerful} + models.context block plus models.local/embedding/embeddingDim. | src/shared/model-recommender.ts:430 `fast: 'claude-haiku-4-5'` inside toConfig() confirms the hardcoded legacy tiers/context block. | none — verified sound. |
| cl4 | citation | LOW | manual | cli/services/setup.ts spreads recommended.models.{local,embedding,context,tiers} into the written config. | src/cli/services/setup.ts:49-54 spreads recommended.models.local/embedding/embeddingDim/context/tiers into the written config. | none — verified sound. |
| cl5 | citation | LOW | manual | models.providers.local.* is the live local surface, read by loadLocalProviderConfig() in src/config/local.ts (coreModel/embeddingModel/embeddingDim/charsPerToken/host) and consumed by ollama.ts. | models.providers.local.* is documented + read as the live local surface (docs/daemon.md:332-335, local.ts / ollama.ts / embedder.ts consumers). Canonical local surface confirmed. | none — verified sound. |
| cl6 | citation | LOW | manual | models.analyze.* is the live cloud/tiering surface read by parseTiering()/loadAnalyzeConfig() in src/config/analyze.ts (shaperProvider/shaperModel/tiers/roleTiers/coreFloor/byRepo). | models.analyze.{roleTiers,coreFloor,byRepo,shaperProvider} is the live tiering surface (docs/daemon.md:376-384, analyze.ts / role-router consumers). Canonical cloud surface confirmed. | none — verified sound. |
| cl7 | semantic | LOW | manual | ConfigReconcileResult in src/config/reconcile.ts currently exposes carried/filled/repaired channels (no `pruned` yet) and reconcileConfig is a copy-on-write merge preserving un-catalogued keys blindly — the surfaces this LLD extends. | src/config/reconcile.ts:52 interface ConfigReconcileResult with :58 carried, :60 filled, :62 repaired (no pruned yet); :212 reconcileConfig. Current shape confirmed — the LLD's additive pruned channel is a genuine extension. | none — verified sound. |
| cl8 | citation | LOW | manual | MaintenanceResult.configReconcile { changed, filled, repaired, error? } exists in src/cli/services/maintenance.ts (the summary this LLD adds a pruned count to), pinned by a compile-time contract fixture. | src/cli/services/maintenance.ts:52 configReconcile? with :55 readonly repaired; the summary the LLD adds pruned:number to exists. | none — verified sound. |
| cl9 | citation | LOW | manual | config.agents is an offlineRpc stub in src/daemon/index.ts (the agent framework was removed), so models.agents is a dynamic namespace with no live handler. | src/daemon/index.ts:1141 `'config.agents': offlineRpc('config.agents')` confirms the agent framework is stubbed offline; models.agents has no live handler. | none — verified sound. |
| cl10 | inventory | LOW | manual | The reconcile test suites this LLD extends exist: config-reconcile.test.ts, config-catalog-contract.test.ts, config-reconcile-io.test.ts under src/config/__tests__, maintenance-reconcile.test.ts under src/cli/services/__tests__, config-boot-reconcile.test.ts under src/daemon/__tests__, and fixtures/legacy-config.json. | config-catalog-contract.test.ts + the other reconcile suites + fixtures/legacy-config.json exist (grep hits on CONFIG_CATALOG across the suites). | none — verified sound. |
| cl11 | citation | LOW | manual | config-catalog-contract.test.ts currently asserts the catalog has 41 rows — this assertion must drop to 30 after the 11-row removal. | src/config/__tests__/config-catalog-contract.test.ts:88-89 asserts `FROM_CONFIG.length, 41` — the assertion that must drop to 30 post-prune. Correctly identified. | Build task must update this assertion 41→30 (already captured in the LLD's dataModelChanges call sites + test strategy). |
