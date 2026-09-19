<!-- insrc:artifact PLAN-b5f333f8d7ba421b-s1 -->

# Plan: E20260919b5f333f8:S001

**Epic:** `expose-all-daemon-config-settings-via`
**LLD run:** `wf-1789842962496-uyzreb`
**LLD effective hash:** `ee39a9f5fd11...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Enrich ConfigOption + backfill all 31 catalog rows | M | — | unit: config-catalog-contract: every one of the 31 rows carries a non-empty group and every enum row a non-empty enumValues (the backfilled data) | [[c1]] |
| 2 | **`t2`** Extend the catalog contract test with the enrichment-completeness guards | S | `t1` | unit: config-catalog-contract: the new group + enumValues completeness assertions; unit: config-catalog-contract: pre-existing invariants (length 31, single site, FROM_CLI===FROM_CONFIG, RETIRED_PATHS 6 disjoint) still pass | [[c1]] [[c6]] |
| 3 | **`t3`** Add src/config/settings-catalog.ts: SettingsCatalogPayload + pure buildSettingsCatalog | M | `t1` | unit: settings-catalog: buildSettingsCatalog({}) returns 31 options + distinct first-seen groups + roles + tierNames(cheap/mid/core) with values={}; unit: settings-catalog: values resolution from a fixture — set paths present; unset path + absent intermediate omitted; non-catalog keys excluded; no throw; unit: settings-catalog: roles + tierNames are derived from reasoningRoleTaxonomy(), and groups from the catalog (not hardcoded) | [[c1]] [[c3]] |
| 4 | **`t4`** Register the read-only config.catalog IPC handler | S | `t3` | integration: config.catalog: returns a SettingsCatalogPayload (options 31, groups/roles/tierNames present) over the dispatch; integration: config.catalog: missing/invalid config.json → full schema with values={}, no top-level error; integration: config.catalog: config.json byte-unchanged and no reload after the call (read-only) | [[c2]] |

### E20260919b5f333f8:S001:T001 — Enrich ConfigOption + backfill all 31 catalog rows

In src/config/config-catalog.ts add `readonly enumValues?: readonly string[]` and `readonly group: string` to the ConfigOption interface, then backfill every one of the 31 CONFIG_CATALOG rows: assign each a human group label and give each type:'enum' row its allowed-values array (lifted from the values already documented in that row's desc). Additive only — no field renamed/removed, no row added/removed, no path changed; RETIRED_PATHS/CONFIG_MIGRATIONS untouched.

**Acceptance checks:**
- ConfigOption declares group:string (required) and enumValues?:readonly string[] (optional); the four original fields are unchanged.
- All 31 rows carry a non-empty group; every type:'enum' row carries a non-empty enumValues; non-enum rows omit enumValues.
- CONFIG_CATALOG.length is still 31 and no path string changed; tsc --noEmit passes.

### E20260919b5f333f8:S001:T002 — Extend the catalog contract test with the enrichment-completeness guards

In src/config/__tests__/config-catalog-contract.test.ts add assertions that every CONFIG_CATALOG row has a non-empty string group and every type:'enum' row has a non-empty enumValues (and non-enum rows omit it), leaving the existing length===31, single-definition-site, FROM_CLI===FROM_CONFIG, and RETIRED_PATHS-disjointness assertions intact.

**Acceptance checks:**
- The contract suite passes and now fails if any row lacks a group or any enum row lacks enumValues.
- The pre-existing assertions (length 31, single site, re-export identity, RETIRED_PATHS 6 disjoint) remain and still pass.

### E20260919b5f333f8:S001:T003 — Add src/config/settings-catalog.ts: SettingsCatalogPayload + pure buildSettingsCatalog

Create the new module exporting the SettingsCatalogPayload type and the pure buildSettingsCatalog(rawConfig): map CONFIG_CATALOG to options, derive groups as the distinct group labels in first-seen order, derive roles + tierNames from reasoningRoleTaxonomy() (roles as {id,defaultTier}; tierNames as the rankOf keys), and build values by resolving each catalog path from rawConfig (reusing an existing dotted-path getter if one exists near write-path.ts, else a small local walk), omitting paths that are absent. Pure and total — no IO, never throws; only catalog paths appear in values.

**Acceptance checks:**
- buildSettingsCatalog({}) returns options (31), groups (distinct, first-seen), roles, tierNames (cheap/mid/core) and values === {}.
- Given a rawConfig with set catalog paths, an unset path, an absent intermediate, and a non-catalog key: values contains only the set catalog paths (absent/intermediate omitted; non-catalog keys excluded); no throw.
- roles/tierNames are taken from reasoningRoleTaxonomy(), not hardcoded.

### E20260919b5f333f8:S001:T004 — Register the read-only config.catalog IPC handler

In src/daemon/index.ts add a 'config.catalog' entry to the string-keyed dispatch object beside config.show: read PATHS.config (readFileSync + JSON.parse in try/catch, default to {} on failure), call buildSettingsCatalog, and return the payload. Read-only — it must not write config.json and must not call reloadChatConfig.

**Acceptance checks:**
- A config.catalog call returns a SettingsCatalogPayload (options 31, groups/roles/tierNames present) over the dispatch.
- With config.json missing/unparseable the handler returns the full schema with values={} and raises no top-level error.
- Calling config.catalog leaves config.json byte-unchanged and does not trigger a session reload.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CONFIG_CATALOG.length===31 still holds | `t2` |
| single definition site + FROM_CLI===FROM_CONFIG + no src/cli import | `t2` |
| RETIRED_PATHS = 6 declared entries, disjoint | `t2` |
| NEW: every row has a non-empty group | `t1`, `t2` |
| NEW: every enum row has a non-empty enumValues; non-enum rows omit it | `t1`, `t2` |
| buildSettingsCatalog({}) returns 31 options + groups + roles + tierNames with values={} | `t3` |
| current values resolved from a fixture; unset path / absent intermediate omitted | `t3` |
| tierNames === rankOf keys; roles map each reasoningRoleTaxonomy() role to {id,defaultTier} | `t3` |
| non-catalog keys never appear in values | `t3` |
| groups = distinct option.group derived from the catalog (not hardcoded) | `t3` |
| handler returns a SettingsCatalogPayload (options 31, groups/roles/tierNames present) | `t4` |
| missing/invalid config.json ⇒ full schema with values={}, no top-level error | `t4` |
| call does not modify config.json and does not trigger reloadChatConfig | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges.ConfigOption (field-add enumValues+group; src/config/config-catalog.ts)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.api config.catalog (read-only IPC handler; src/daemon/index.ts)`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails.api buildSettingsCatalog + role taxonomy (src/config/settings-catalog.ts, reasoningRoleTaxonomy)`
- **[[c6]]** `prior-artifact` `LLD s1 testStrategy contract level + invariantsToPreserve (src/config/__tests__/config-catalog-contract.test.ts)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T19:13:13.519Z

_No load-bearing premises were extracted._
