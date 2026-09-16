<!-- insrc:artifact PLAN-f5a6e60ccefd9be4-S001 -->

# Plan: S001

**Epic:** `consolidate-config-model-specification-surfaces-down`
**LLD run:** `wf-1785134702818-ww9xc4`
**LLD effective hash:** `f5a6e60ccefd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Trim CONFIG_CATALOG to 30 rows + add RetiredPath/RETIRED_PATHS | S | — | unit: contract: CONFIG_CATALOG has 30 rows (was 41); none of the 11 removed paths remain | [[c1]] [[c2]] |
| 2 | **`t2`** Add the prune phase + pruned channel to reconcileConfig | M | `t1` | unit: unit: retired exact-path present → deleted from config.config, recorded in pruned[], changed true; unit: unit: retired prefix root with populated subtree → whole subtree deleted, recorded ONCE as the prefix root (not per sub-key) | [[c1]] [[c3]] |
| 3 | **`t3`** Trim the write-side: recommender + setup + Config type | M | `t1` | smoke: smoke: setup write-side — model-recommender.toConfig()/setup output contains none of the retired paths | [[c2]] [[c5]] |
| 4 | **`t4`** Surface pruned in both reconcile call sites + MaintenanceResult | M | `t2` | unit: contract: MaintenanceResult.configReconcile compile-time fixture pins the new readonly pruned:number field (optional, exactOptionalPropertyTypes); integration: integration: maintenance.update runUpdateReconcile reports configReconcile.pruned + one onLog detail line per pruned path (naming the dot-path); no-change emits an explicit no-change line | [[c1]] [[c5]] |
| 5 | **`t5`** Unit + contract tests for the prune | M | `t1`, `t2` | unit: unit: retired exact-path absent → no-op, not in pruned, does not set changed; unit: unit: retired prefix root present as a SCALAR → slot removed, recorded (type-agnostic delete); unit: unit: retired exact-path with falsy-but-present value (0/""/false) → pruned via hasOwnProperty, not truthiness; unit: unit: retired path with a MISSING ancestor → no-op, nothing recorded; unit: unit: un-catalogued key NOT on the retired list → preserved (blind-preservation refined); models.analyze.roleTiers/byRepo + models.providers.local.* survive deep-equal; unit: unit: changed === (filled+repaired+pruned > 0); unit: unit: idempotence — reconcileConfig(reconcileConfig(x).config).pruned === [] and changed === false; unit: unit: a retired path overlapping a live catalog row throws ConfigCatalogError naming the path; unit: unit: reconcileConfig existing never mutated (deep-freeze) even when pruning; unit: contract: RETIRED_PATHS is disjoint from every CONFIG_CATALOG path (retired ∩ live = ∅) — reconcileConfig({}, CONFIG_CATALOG, RETIRED_PATHS) does not throw ConfigCatalogError; unit: contract: RETIRED_PATHS covers exactly models.local, models.embedding, models.embeddingDim, models.tiers(prefix), models.context(prefix), models.agents(prefix) | [[c6]] |
| 6 | **`t6`** Integration + boot + maintenance + smoke tests for prune reporting/convergence | M | `t4`, `t5` | integration: integration: legacy fixture on disk → exactly 1 writeFile + 1 rename; retired keys gone, dynamic namespaces byte-identical to baseline; integration: integration: a config with ONLY retired keys to remove (nothing to fill/repair) → still 1 write (prune-only trips changed); integration: integration: already-pruned config → 0 writeFile, 0 rename, mtime unchanged (convergence); integration: integration: daemon boot reconcile strips retired keys and logs a pruned count; a retired∩live catalog bug logs the distinguishable shipped-catalog warn and leaves the file untouched; smoke: smoke: boot against a temp home holding the legacy fixture → models.{local,embedding,embeddingDim,tiers,context,agents} absent afterwards, models.providers.local.* + models.analyze.* intact; second boot writes nothing | [[c6]] |
| 7 | **`t7`** Full build + test sweep verification | S | `t3`, `t4`, `t5`, `t6` | smoke: smoke: full npx tsx --test 'src/**/__tests__/*.test.ts' sweep green + npm run build clean (verification, no new failures beyond pre-existing stale tests) | [[c6]] |

### `t1` — Trim CONFIG_CATALOG to 30 rows + add RetiredPath/RETIRED_PATHS

In src/config/config-catalog.ts remove the 11 dead rows (models.local, models.embedding, models.embeddingDim, models.tiers.{fast,standard,powerful}, models.context.{local,localMaxOutput,claude,claudeMaxOutput,charsPerToken}); add RetiredPath interface + RETIRED_PATHS const (exact: models.local/embedding/embeddingDim; prefix: models.tiers/models.context/models.agents); update the header 'sync with' comment. Re-export from the src/cli shim only if a CLI consumer needs them.

**Acceptance checks:**
- CONFIG_CATALOG has exactly 30 rows and none of the 11 removed dot-paths remain
- RETIRED_PATHS exports 6 entries (3 exact + 3 prefix) and is disjoint from every CONFIG_CATALOG path
- npm run build stays green (config-catalog.ts + shim compile)

### `t2` — Add the prune phase + pruned channel to reconcileConfig

In src/config/reconcile.ts extend reconcileConfig to accept `retired = RETIRED_PATHS` and, after the merge, delete each retired path (exact-path for leaves; whole-subtree for prefix rows), recording removed roots in a new readonly pruned field of ConfigReconcileResult. Fold pruned.length into changed. Assert retired ∩ live-catalog = ∅ (throw ConfigCatalogError). Preserve blind-preservation for un-catalogued keys not on the list; keep COW non-mutation + idempotence. Covers prefix-scalar, falsy-but-present, absent, missing-ancestor edges.

**Acceptance checks:**
- reconcileConfig strips retired exact-paths + prefix-subtrees, recording each removed root once in result.pruned
- changed === (filled+repaired+pruned > 0); a prune-only change sets changed true
- reconcileConfig(reconcileConfig(x).config).pruned === [] and changed === false (idempotent)
- a retired path overlapping a live catalog row throws ConfigCatalogError naming the path
- dynamic namespaces not on the retired list (models.analyze.roleTiers/byRepo, models.providers.local.*) survive deep-equal; existing never mutated

### `t3` — Trim the write-side: recommender + setup + Config type

model-recommender.toConfig() drops the models.{local,embedding,embeddingDim,tiers,context} literal (keep providers.local + ollama.host); RecommendedConfig trims accordingly; setup.ts drops the local/embedding/embeddingDim/context/tiers spreads; shared/types.ts trims the legacy top-level model keys. Coupled type edits land together so tsc stays green.

**Acceptance checks:**
- model-recommender.toConfig() output contains none of the retired paths (only providers.local + ollama.host + analyze if any)
- setup.ts no longer writes models.local/embedding/embeddingDim/context/tiers
- Config/RecommendedConfig types no longer declare the legacy keys and npm run build is clean

### `t4` — Surface pruned in both reconcile call sites + MaintenanceResult

Add readonly pruned:number to MaintenanceResult.configReconcile (maintenance.ts) + pin it in the compile-time contract fixture; extend summarizeReconcile to emit the pruned count + one onLog detail line per pruned path; extend the daemon-boot 'written' arm to log the pruned count. reconcile-io needs no logic change (write-once keys off result.changed).

**Acceptance checks:**
- MaintenanceResult.configReconcile has readonly pruned:number (optional field intact under exactOptionalPropertyTypes) and the contract fixture pins it
- maintenance.update reports configReconcile.pruned + one onLog detail line per pruned path naming the dot-path
- daemon boot logs the pruned count in the 'written' arm; reconcile-io still writes at most once

### `t5` — Unit + contract tests for the prune

Extend config-reconcile.test.ts with the full prune contract via the injectable retired param + legacy-config.json fixture; update config-catalog-contract.test.ts (41→30, RETIRED_PATHS disjointness + covers-exactly).

**Acceptance checks:**
- all prune-contract subjects assert and pass under npx tsx --test
- config-catalog-contract.test.ts asserts 30 rows and RETIRED_PATHS ∩ CONFIG_CATALOG = ∅
- no new package dependency added

### `t6` — Integration + boot + maintenance + smoke tests for prune reporting/convergence

Extend config-reconcile-io.test.ts, config-boot-reconcile.test.ts, maintenance-reconcile.test.ts, config-reconcile-smoke.test.ts for prune-only write-once, convergence, boot/update pruned reporting, and the retired∩live distinguishable warn.

**Acceptance checks:**
- integration write-counting seam proves prune-only = 1 write and already-pruned = 0 writes
- boot + maintenance tests assert the pruned count is surfaced and the retired∩live bug is distinguishable
- smoke asserts convergence (retired keys gone, live surfaces intact, second pass no-op)

### `t7` — Full build + test sweep verification

npm run build (tsc clean incl. trimmed Config type + pinned MaintenanceResult contract) + full npx tsx --test sweep; confirm only pre-existing stale-test failures remain. (Daemon FF/rebuild/restart rollout is a post-merge operational step, not a build task.)

**Acceptance checks:**
- npm run build is clean
- all config/daemon/cli reconcile+prune suites pass; no new failures beyond the known pre-existing stale tests
- the whole feature is self-consistent (30-row catalog, prune wired end-to-end, write-side trimmed)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| unit: retired exact-path present → deleted from config.config, recorded in pruned[], changed true | `t2`, `t5` |
| unit: retired exact-path absent → no-op, not in pruned, does not set changed | `t5` |
| unit: retired prefix root with populated subtree → whole subtree deleted, recorded ONCE as the prefix root (not per sub-key) | `t2`, `t5` |
| unit: retired prefix root present as a SCALAR → slot removed, recorded (type-agnostic delete) | `t5` |
| unit: retired exact-path with falsy-but-present value (0/""/false) → pruned via hasOwnProperty, not truthiness | `t5` |
| unit: retired path with a MISSING ancestor → no-op, nothing recorded | `t5` |
| unit: un-catalogued key NOT on the retired list → preserved (blind-preservation refined); models.analyze.roleTiers/byRepo + models.providers.local.* survive deep-equal | `t5` |
| unit: changed === (filled+repaired+pruned > 0) | `t5` |
| unit: idempotence — reconcileConfig(reconcileConfig(x).config).pruned === [] and changed === false | `t5` |
| unit: a retired path overlapping a live catalog row throws ConfigCatalogError naming the path | `t5` |
| unit: reconcileConfig existing never mutated (deep-freeze) even when pruning | `t5` |
| contract: CONFIG_CATALOG has 30 rows (was 41); none of the 11 removed paths remain | `t1`, `t5` |
| contract: RETIRED_PATHS is disjoint from every CONFIG_CATALOG path (retired ∩ live = ∅) — reconcileConfig({}, CONFIG_CATALOG, RETIRED_PATHS) does not throw ConfigCatalogError | `t5` |
| contract: RETIRED_PATHS covers exactly models.local, models.embedding, models.embeddingDim, models.tiers(prefix), models.context(prefix), models.agents(prefix) | `t5` |
| contract: MaintenanceResult.configReconcile compile-time fixture pins the new readonly pruned:number field (optional, exactOptionalPropertyTypes) | `t4` |
| integration: legacy fixture on disk → exactly 1 writeFile + 1 rename; retired keys gone, dynamic namespaces byte-identical to baseline | `t6` |
| integration: a config with ONLY retired keys to remove (nothing to fill/repair) → still 1 write (prune-only trips changed) | `t6` |
| integration: already-pruned config → 0 writeFile, 0 rename, mtime unchanged (convergence) | `t6` |
| integration: daemon boot reconcile strips retired keys and logs a pruned count; a retired∩live catalog bug logs the distinguishable shipped-catalog warn and leaves the file untouched | `t6` |
| integration: maintenance.update runUpdateReconcile reports configReconcile.pruned + one onLog detail line per pruned path (naming the dot-path); no-change emits an explicit no-change line | `t4`, `t6` |
| smoke: boot against a temp home holding the legacy fixture → models.{local,embedding,embeddingDim,tiers,context,agents} absent afterwards, models.providers.local.* + models.analyze.* intact; second boot writes nothing | `t6` |
| smoke: setup write-side — model-recommender.toConfig()/setup output contains none of the retired paths | `t3`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 — reconcileConfig gains retired param + pruned channel; CONFIG_CATALOG 41→30; ConfigCatalogError on retired∩live overlap` — "reconcileConfig(existing, catalog?, retired?): ConfigReconcileResult — merge then strip declared-retired paths, recording result.pruned; changed = filled+repaired+pruned>0."
- **[[c2]]** `prior-artifact` `LLD S001 — RETIRED_PATHS export beside CONFIG_CATALOG; write-side (toConfig/setup) stops emitting the legacy block` — "RETIRED_PATHS: readonly RetiredPath[] declares models.local/embedding/embeddingDim (exact) + models.tiers/models.context/models.agents (prefix); toConfig/setup keep only the canonical local surface."
- **[[c3]]** `prior-artifact` `LLD S001 error paths — prune edge behaviours + blind-preservation refinement` — "prefix-subtree delete recorded once; falsy-but-present pruned via hasOwnProperty; missing-ancestor no-op; un-catalogued keys not on the retired list preserved byte-for-byte; existing never mutated (CO"
- **[[c5]]** `prior-artifact` `LLD S001 data-model — ConfigReconcileResult.pruned + MaintenanceResult.configReconcile.pruned + Config type trim` — "ConfigReconcileResult gains readonly pruned; MaintenanceResult.configReconcile gains readonly pruned:number (pinned by the compile-time contract fixture); the legacy top-level model keys are trimmed f"
- **[[c6]]** `prior-artifact` `LLD S001 test strategy — unit/contract/integration/smoke subjects across the existing reconcile suites + legacy-config.json fixture` — "config-reconcile.test.ts (prune contract) / config-catalog-contract.test.ts (41→30 + disjointness) / config-reconcile-io.test.ts (write-once) / config-boot-reconcile.test.ts + maintenance-reconcile.te"
