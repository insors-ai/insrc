<!-- insrc:artifact LLD-b5f333f8d7ba421b-s1 -->

# LLD: E20260919b5f333f8:S001

**Epic:** `expose-all-daemon-config-settings-via`
**HLD base run:** `wf-1789841045868-kib3gd`
**HLD effective hash:** `ee39a9f5fd11...`

## HLD context

**Framework:** A daemon-owned, self-describing settings contract feeds a native JetBrains Settings page that renders whatever the daemon reports. The daemon's single-definition catalog is enriched with two structured fields (allowed fixed values and a group label) and, together with the recognized role taxonomy and tier names, is exposed over ONE new read-only IPC. The plugin adds config gateway methods behind the established sealed three-state result pattern and a native applicationConfigurable that builds a grouped, collapsible Swing form purely from the daemon's description — hardcoding no setting, group, role, or tier. Reads use the new catalog IPC plus the existing value read; writes reuse the existing segment-aware write. The plugin owns no settings semantics; the daemon stays the single source of truth.
**Rollout phase:** Phase A — Daemon settings contract (schema + catalog IPC)
**Owns:** `sc1` (Self-describing settings catalog (enriched ConfigOption + role taxonomy) over config.catalog, and its plugin read surface)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Private to s2: read-only rendering, collapsible groups, daemon-unavailable state. — owns `sc3`
- `s3`: Private to s3: per-type edit controls, validation, dirty/apply/reset, write-rejected surfacing. — owns `sc2`
- `s4`: Private to s4: per-role overrides sub-section (models.tasks.<roleId>).
- `s5`: Private to s5: per-repo overrides sub-section (models.byRepo.<repoPath>.*).

## Contract details

**Surface level:** internal-shared

### `ConfigOption`

```typescript
interface ConfigOption { readonly path: string; readonly type: 'string'|'number'|'boolean'|'enum'; readonly default: unknown; readonly desc: string; readonly enumValues?: readonly string[]; readonly group: string }
```

**Returns:** `interface` — The enriched single-definition-site catalog row: existing path/type/default/desc plus a required group label and, for enum settings, the fixed allowed-values list. Non-enum rows omit enumValues.

**Preconditions:**
- Defined only in src/config/config-catalog.ts (single definition site); src/cli/config-catalog.ts continues to only re-export it.

**Postconditions:**
- Every one of the 31 CONFIG_CATALOG rows carries a non-empty group; every row with type:'enum' carries a non-empty enumValues; row count stays 31; RETIRED_PATHS unchanged (6, disjoint).

### `buildSettingsCatalog`

```typescript
function buildSettingsCatalog(rawConfig: Record<string, unknown>): SettingsCatalogPayload
```

**Parameters:**
- `rawConfig: Record<string, unknown>` — The parsed config.json object (or {} when absent/unreadable) from which each catalog path's current value is resolved.

**Returns:** `SettingsCatalogPayload` — options = CONFIG_CATALOG verbatim; groups = distinct group labels in catalog order; roles/tierNames from reasoningRoleTaxonomy(); values = per-catalog-path current value resolved from rawConfig (absent path omitted ⇒ unset/using-default).

**Errors:**
- `(none — total function)` when Never throws; an empty rawConfig yields a complete schema with an empty values map.

**Preconditions:**
- Pure: reads only its argument + the static CONFIG_CATALOG and reasoningRoleTaxonomy(); performs no IO and no write.

**Postconditions:**
- options.length === 31; groups first-seen order; tierNames === rankOf keys; values has an entry only for paths present in rawConfig.

### `config.catalog`

```typescript
'config.catalog': async () => SettingsCatalogPayload
```

**Returns:** `SettingsCatalogPayload` — New read-only IPC handler beside config.show: reads PATHS.config (parse-or-{}), calls buildSettingsCatalog, returns the payload. Read-only — never writes config.json, never reloads.

**Errors:**
- `framed-empty-values result` when config.json missing/unparseable ⇒ returns the full schema with values={} (mirrors config.show returning {}).

**Preconditions:**
- Registered in the same dispatch object as config.show/config.write; over the existing Unix-socket transport (k3).

**Postconditions:**
- Returns the SettingsCatalogPayload; config.json unmodified; no reload.

## Data model changes

### `ConfigOption` — field-add

Add `readonly group: string` (required) and `readonly enumValues?: readonly string[]` (optional; present iff type==='enum'). Backfill all 31 rows with a group label and enum rows with their allowed-values (lifted from desc). Additive — no existing field changes, no row added/removed.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/reconcile.ts`
- `src/config/__tests__/config-catalog-contract.test.ts`

### `SettingsCatalogPayload` — new

New exported payload type in src/config/settings-catalog.ts: { options: readonly ConfigOption[]; groups: readonly string[]; roles: readonly {id:string; defaultTier:string}[]; tierNames: readonly string[]; values: Readonly<Record<string,unknown>> } — the sc1 wire shape config.catalog returns.

**Call sites:**
- `src/config/settings-catalog.ts`
- `src/daemon/index.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 implements sc1's daemon side: enriched ConfigOption, SettingsCatalogPayload, the pure buildSettingsCatalog assembler, and the read-only config.catalog IPC. The plugin-side DTO/gateway mirror is the consumers' surface (first built by S002). All derived from the single catalog + reasoningRoleTaxonomy(), never duplicated (lc1/k1). |

## Error paths

### Error cases

- **config.json is missing or contains invalid JSON when config.catalog reads it.** (recoverable)
  - Detection: readFileSync/JSON.parse wrapped in try/catch (mirroring config.show); throw caught, rawConfig defaults to {}.
  - Response: buildSettingsCatalog({}) returns the complete schema with values={}; no top-level RPC error.
  - User impact: IDE still gets the full description; everything shows unset/using-default. No failure surfaced.
- **A catalog row backfilled with a missing/empty group (authoring error).** (recoverable)
  - Detection: The extended contract test asserts every row has a non-empty group; a miss fails at test time.
  - Response: Test fails before ship; the row must be given a group.
  - User impact: Caught pre-release; otherwise the setting lands in an empty-named group.
- **An enum row backfilled without enumValues, or enumValues on a non-enum row.** (recoverable)
  - Detection: The extended contract test asserts every type:'enum' row has a non-empty enumValues (and non-enum rows omit it).
  - Response: Test fails before ship; the enum row must carry its allowed-values.
  - User impact: Caught pre-release; otherwise a fixed-choice setting has no choices for S003's chooser.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A catalog path unset in config.json (or an absent intermediate like models.tiers). | Omitted from values (unset/using-default); no crash on the absent intermediate. |
| config.json contains non-catalog keys (models.tasks.<roleId>, models.byRepo.<repoPath>.*, stale keys). | values is keyed only by catalog paths; non-catalog keys are not included (dynamic overrides are S004/S005's concern). |
| A catalog path whose current value equals its default. | Still reported in values with its actual value; equals-default is not elided — the consumer decides how to show it. |
| A non-enum row (string/number/boolean). | enumValues omitted (optional); only group present. |

### Invariants to preserve

- config-catalog.ts remains the SINGLE definition site of CONFIG_CATALOG and ConfigOption; the CLI re-export stays reference-identical (FROM_CLI===FROM_CONFIG). Adding fields introduces no second definition. [[c1]]
- CONFIG_CATALOG stays exactly 31 rows (contract test assert.equal(length,31)); the enrichment adds fields, never rows. [[c6]]
- RETIRED_PATHS stays the 6 declared entries, disjoint from every live path; no path changes. [[c6]]
- The boot reconcile still fills every default and prunes retired paths unchanged; the additive fields do not participate in fill/prune. [[c7]]
- config.catalog is READ-ONLY: reads PATHS.config, never writes config.json or reloads. [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test` (the src/config/__tests__ convention)`

### Test levels

- **contract** — Preserve every existing catalog invariant and add the enrichment-completeness guards.
  - Subjects: `CONFIG_CATALOG.length===31 still holds`, `single definition site + FROM_CLI===FROM_CONFIG + no src/cli import`, `RETIRED_PATHS = 6 declared entries, disjoint`, `NEW: every row has a non-empty group`, `NEW: every enum row has a non-empty enumValues; non-enum rows omit it`
  - Fixtures: `The real CONFIG_CATALOG + RETIRED_PATHS (imported)`
- **unit** — Prove the pure buildSettingsCatalog off a fixed fixture without a daemon.
  - Subjects: `buildSettingsCatalog({}) returns 31 options + groups + roles + tierNames with values={}`, `current values resolved from a fixture; unset path / absent intermediate omitted`, `tierNames === rankOf keys; roles map each reasoningRoleTaxonomy() role to {id,defaultTier}`, `non-catalog keys never appear in values`, `groups = distinct option.group derived from the catalog (not hardcoded)`
  - Fixtures: `An in-memory rawConfig with set paths, an unset path, an absent intermediate, and a non-catalog key`
- **integration** — Prove config.catalog returns the payload over the real dispatch and is read-only.
  - Subjects: `handler returns a SettingsCatalogPayload (options 31, groups/roles/tierNames present)`, `missing/invalid config.json ⇒ full schema with values={}, no top-level error`, `call does not modify config.json and does not trigger reloadChatConfig`
  - Fixtures: `A temp PATHS.config: (a) valid config.json, (b) missing/blank`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: buildSettingsCatalog({}) returns all 31 options with path/type/default/desc/group + enum enumValues, plus groups/roles/tierNames`, `contract: every row has a group; every enum row has enumValues`, `integration: config.catalog returns the full options payload` |
| `ac2` | `unit: values resolved from a fixture; set paths present, unset/absent omitted`, `integration: config.catalog over a real config returns those values; over a missing config returns values={}` |
| `ac3` | `contract: length===31, RETIRED_PATHS 6 disjoint, single-site + FROM_CLI===FROM_CONFIG hold`, `existing config-reconcile tests still pass (defaults fill, retired pruned)` |

## Migration

**State before:** ConfigOption has four fields (path/type/default/desc); 31-row CONFIG_CATALOG; enum allowed-values only in prose desc; no group. Daemon has config.show + config.write but NO config.catalog. Contract test asserts length===31, single-site, FROM_CLI===FROM_CONFIG, RETIRED_PATHS 6 disjoint.

**State after:** ConfigOption has group (required) + enumValues (optional, enum rows), all 31 rows backfilled, row count + invariants unchanged. New pure buildSettingsCatalog + read-only config.catalog IPC. config.show/config.write/reconcile unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the two additive fields to ConfigOption: required group:string and optional enumValues?:readonly string[]. — ↩ rollbackable
2. Backfill all 31 rows with a group label and enum rows with allowed-values from desc. No rows added/removed; paths unchanged. — ↩ rollbackable
3. Extend the contract test with the group + enumValues completeness assertions alongside the untouched existing invariants. — ↩ rollbackable
4. Add src/config/settings-catalog.ts exporting SettingsCatalogPayload + buildSettingsCatalog(rawConfig). — ↩ rollbackable
5. Register the read-only config.catalog handler in src/daemon/index.ts beside config.show (read parse-or-{}, assemble, return; no write, no reload). — ↩ rollbackable

**Backward compat:** The four existing ConfigOption fields are unchanged; the two new fields are additive (group populated everywhere, enumValues optional). All existing consumers (reconcile, CLI re-export, contract test) keep working; config.show/config.write untouched; config.json neither read-migrated nor rewritten. Only config.catalog is added — no method removed or renamed.

## Alternatives considered

### a1: Inline enumValues+group on ConfigOption + a pure catalog assembler — **CHOSEN**

Add readonly enumValues?/group directly to ConfigOption, backfill the 31 rows inline, and add one pure buildSettingsCatalog() that config.catalog wraps.

ConfigOption gains enumValues?/group; all 31 rows backfilled in place so the single catalog literal stays the one definition site. A pure buildSettingsCatalog(rawConfig) assembles options/groups/roles/tierNames/values; the config.catalog handler is a thin reader beside config.show that never throws. The contract test gains group + enumValues completeness assertions.

### a2: Sidecar metadata table keyed by path

Leave ConfigOption as-is and add a second const mapping each path to its {group, enumValues}, merged in when config.catalog assembles the payload.

A new SETTINGS_METADATA: Record<string,{group,enumValues?}> is joined with CONFIG_CATALOG by path in buildSettingsCatalog; ConfigOption is unchanged.

**Rejected because:** Functionally equivalent payload but forks the schema into a path-keyed sidecar (violates k1/lc1), trading the whole point of the enrichment for leaving the type shape untouched.

### a3: Derive enumValues + group at read time from the desc/path

Add no stored fields; parse allowed values from each enum's desc and infer group from the path prefix in buildSettingsCatalog.

buildSettingsCatalog regex-extracts quoted tokens from an enum's desc for enumValues and infers group from the path's leading segment(s). No change to ConfigOption or the rows.

**Rejected because:** Cheapest but re-creates the derive-from-prose brittleness the Epic exists to remove; fails ac1's structured-allowed-values requirement and cannot express intended grouping.

## Citations

- **[[c1]]** `code` `src/config/config-catalog.ts` — "interface ConfigOption { path/type/default/desc } + const CONFIG_CATALOG (31 rows), single definition site; enum allowed-values only in desc; no group/enumValues; RETIRED_PATHS = 6."
- **[[c2]]** `code` `src/daemon/index.ts` — "config.show reads PATHS.config parse-or-{}; config.write segment-aware + reloadChatConfig; no config.catalog handler."
- **[[c3]]** `code` `src/config/role-taxonomy.ts` — "reasoningRoleTaxonomy(): RoleTaxonomy { roles: RoleDescriptor{id,criticality,defaultTier}[]; rankOf }; tier names = rankOf keys cheap|mid|core."
- **[[c6]]** `code` `src/config/__tests__/config-catalog-contract.test.ts` — "asserts CONFIG_CATALOG.length===31, single definition site, FROM_CLI===FROM_CONFIG, RETIRED_PATHS 6 disjoint entries."
- **[[c7]]** `code` `src/config/reconcile.ts` — "boot reconcile reads the catalog to fill defaults + prune retired paths."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T18:47:32.827Z

_No load-bearing premises were extracted._
