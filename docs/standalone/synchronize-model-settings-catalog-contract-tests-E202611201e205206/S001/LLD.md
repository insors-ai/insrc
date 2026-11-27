<!-- insrc:artifact LLD-1e2052060dec3efb-s1 -->

# LLD: STORY-1e2052060dec3efb-s1 — manifest sections + idempotency contract

## Summary

**Epic:** `synchronize-model-settings-catalog-contract-tests`
**HLD base run:** `wf-1795802769090-lp8fm2`
**HLD effective hash:** `d2a37ec9a3c0...`

Revision 3 per re-review feedback r2. Standalone small bugfix for ISSUE-1e2052060dec3efb: syncManifest v3 in vscode-plugin/scripts/sync-manifest-catalog.mjs owns the whole backend-derived manifest surface — (a) ONE shared row map (catalog rows whose insrc.<path> key is not plugin-local: excludes insrc.chat.* and the insrc.models.tasks.* prefix) drives BOTH update and insertion of catalog-backed keys; (b) a separate taxonomy pass owns the ENTIRE per-role prefix: every insrc.models.tasks.* key in every section is deleted, then the canonical "Models — per-role tiers" section is regenerated from buildPerRoleKeyMap() (created if missing; existing key order kept, new roles appended in taxonomy order); (c) DUPLICATE-TITLED sections get a lossless conflict policy: the FIRST section keeps its title and ALL section-level metadata; properties merge first-wins in section order, so distinct local properties from later duplicates survive; a key present in multiple duplicate-titled sections with CONFLICTING schemas is refused with a sync-duplicate-conflict diagnostic naming the key and both sections (ambiguous — cannot be repaired safely); (d) missing catalog-group sections are created, not thrown; (e) unrelated plugin-local keys are preserved everywhere, including inside the canonical per-role section. Stored setting VALUES are never rewritten — schemas/defaults only. Then package.json is regenerated once (gains "Models — security" with insrc.models.security.* and insrc.models.tasks.security.review). The repair fixture removes the FINAL taxonomy role so the append rule restores its committed position, and asserts the explicit key order of surviving and appended keys; the byte-identical rerun remains the idempotency check. Idempotent; --check exits 1 on drift. Manifest + script only — no product logic; core-floor and local-only embeddings untouched.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Epic impact analysis

**Does not apply**: Standalone small bugfix (ISSUE-1e2052060dec3efb).

## 2. HLD context

**Framework:** Standalone small bugfix (ISSUE-1e2052060dec3efb); manifest + sync script only.
**Rollout phase:** single-step bugfix

## 3. Contract details

**Surface level:** internal

### 3.1 `syncManifest`

```typescript
syncManifest(pkg, catalog): typeof pkg
```

**Parameters:**
- `pkg: object` — Parsed package.json
- `catalog: readonly ConfigOption[]` — Backend CONFIG_CATALOG rows

**Returns:** `typeof pkg` — Manifest with the whole backend-derived surface regenerated per the v3 contract

**Errors:**
- `Error` when Only malformed pkg.contributes.configuration, or a sync-duplicate-conflict (same key, conflicting schemas in duplicate-titled sections), throws; missing group/canonical sections are created, never thrown

**Preconditions:**
- pkg.contributes.configuration is an array of {title, properties} sections

**Postconditions:**
- SHARED ROW MAP: catalog rows whose insrc.<path> key is not isPluginLocalKey (insrc.chat.* or insrc.models.tasks.* prefix) drive BOTH update and insertion — the same filter cannot differ between the two
- ROLE PREFIX OWNERSHIP: every insrc.models.tasks.* property in ALL sections is deleted; the canonical "Models — per-role tiers" section (first with that title; created if missing) is regenerated from buildPerRoleKeyMap(): key = nativeRoleKey, schema {type string, enum TIER_VALUES, default role.defaultTier, markdownDescription desc, scope machine}; existing key order preserved, new roles appended in taxonomy order
- DUPLICATE-SECTION CONFLICT POLICY: duplicate-titled sections — the FIRST keeps title + all section-level metadata; properties merge first-wins in section order (distinct local keys from later duplicates survive losslessly); the SAME key with conflicting schemas in duplicate-titled sections throws sync-duplicate-conflict naming the key and the sections
- LOCAL KEY PRESERVATION: insrc.chat.* and any other non-role property survive everywhere, including inside the canonical per-role section
- MISSING GROUP SECTIONS: a catalog row whose group has no section gets one appended — no throw
- IDEMPOTENT: syncManifest(syncManifest(pkg)) deep-equals syncManifest(pkg); stored setting VALUES never rewritten (schemas/defaults only)

## 4. Data model changes

### 4.1 `package.json contributes.configuration` — field-modify

Regenerated per the v3 contract: catalog-backed keys from the shared non-local row map; the per-role prefix owned wholly by the taxonomy pass; duplicate-titled sections consolidated losslessly (first keeps title + section metadata, properties first-wins, conflicting duplicate schemas refused); missing group sections created; non-role local properties preserved. package.json gains the "Models — security" section and insrc.models.tasks.security.review.

```
sections[]: {title, properties} regenerated per syncManifest v3
```

**Call sites:**
- `vscode-plugin/scripts/sync-manifest-catalog.mjs`
- `vscode-plugin/package.json`
- `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts`

## 5. Error paths

**Error cases**

- **Manifest drift vs catalog/taxonomy (models.security.* rows, security.review role)** (recoverable)
  - Detection: manifest-catalog.test.ts:39/:62, per-role.test.ts:77/:86 fail; --check exits 1
  - Response: v3 sync owns both surfaces; one run regenerates package.json
  - User impact: 6 config tests green; future drift caught by --check in build/prepublish
- **Role key misplaced in another section or duplicated across sections** (recoverable)
  - Detection: exactness test fails on the extra
  - Response: Prefix-wide deletion removes every insrc.models.tasks.* key everywhere before canonical regeneration — the misplaced copy cannot survive
  - User impact: No stale/duplicate role keys anywhere
- **Canonical per-role section missing or duplicate-titled** (recoverable)
  - Detection: regeneration target absent/ambiguous
  - Response: Missing: created. Duplicated: lossless consolidation — first section keeps title + section-level metadata, properties merge first-wins in section order
  - User impact: Deterministic canonical section; no metadata or distinct local key lost
- **Same key with conflicting schemas in duplicate-titled per-role sections** (recoverable)
  - Detection: schema inequality during first-wins merge
  - Response: Refuse: sync-duplicate-conflict diagnostic names the key and both sections; nothing is written — an ambiguous manifest is never silently repaired
  - User impact: Developer resolves the conflict by hand, then sync succeeds
- **Catalog group has no section (Models — security)** (recoverable)
  - Detection: previously threw
  - Response: Section appended with the row schema
  - User impact: New groups sync cleanly
- **Retired role removed from taxonomy** (recoverable)
  - Detection: manifest still declares it
  - Response: Prefix-wide deletion drops it
  - User impact: No stale role keys

**Edge cases**

| Input | Expected |
| :--- | :--- |
| second sync on a synced manifest | byte-identical; --check exits 0 |
| extended stale fixture: security section removed, the FINAL taxonomy role removed (append restores its committed position), retired role added, role schema corrupted, plus tier/shaper/core-model mutations | --check reports drift WITHOUT writing; one sync repairs to the committed manifest; EXPLICIT surviving + appended key order asserted; next sync byte-identical; unrelated local settings survive |
| role key correct in the canonical section | order preserved, schema re-derived identically |
| plugin-local key sharing the per-role section | preserved |
| duplicate-titled per-role sections carrying distinct local properties | first section keeps title + metadata; distinct local properties merged first-wins; lossless |
| same local key with conflicting schemas in duplicate-titled sections | sync-duplicate-conflict refusal naming key + sections; no write |

**Invariants to preserve**

- Tier rows (models.tiers.*) carry no enum and default '' — values from the daemon model definitions [[c1]]
- Stored setting VALUES never rewritten; effective defaults change only for unset settings if the taxonomy changes; core-floor and local-only embeddings untouched — no product logic [[c2]]
- Bundled key map maps every settings-catalog row without bundling the catalog or definitions file [[c4]]
- Idempotency: sync(sync(pkg)) === sync(pkg); --check exits 0 on the committed manifest [[c3]]
- Duplicate-titled sections never lose section metadata or distinct local keys; conflicting duplicate schemas are refused, not guessed [[c3]]

## 6. Test strategy

**Test framework:** `node:test via the repo harness (Node 22.22.1): npm test -- --suite=vscode src/config/__tests__/manifest-catalog.test.ts src/config/__tests__/per-role.test.ts src/config/__tests__/sync-manifest-catalog.test.ts src/config/__tests__/vscode-bundle-catalog.test.ts (guards: legacy-keys, doc-relations-status, repo-fields-contract). All subjects plain-assertion gate-runnable; the bundle test spawns tsc+esbuild itself. Pre-fix harness run 351dab36 showed the first 6 failing.`

**Test levels**

- **unit** — The 6 originally failing tests pass. The repair fixture is order-independent: the stale copy removes the security section and the FINAL taxonomy role, carries a retired role and a corrupted role schema; --check reports drift without writing; one sync repairs; the EXPLICIT surviving + appended key order is asserted; the next sync is byte-identical (idempotency). A misplaced/duplicated role-key test. A duplicate-section test with distinct local properties (lossless first-wins consolidation, first section metadata kept) and a collision case (conflicting schema for the same key refused with a diagnostic). Guards stay green.
  - Subjects: `declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra)`, `each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'`, `declared insrc.models.tasks.* keys EXACTLY cover the role taxonomy (no missing, no extra)`, `each per-role key is a machine-scoped enum with default = the role's defaultTier`, `sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy`, `sync-manifest-catalog.test.ts: a stale copy missing the security section and the final role, carrying a retired role and a corrupted role schema, is reported by --check without writing, repaired by one sync, and byte-identical on the next, with explicit surviving and appended key order`, `sync-manifest-catalog.test.ts: a misplaced or duplicated per-role key is removed from its wrong section and regenerated in the canonical section, while unrelated local keys survive`, `sync-manifest-catalog.test.ts: duplicate per-role sections consolidate losslessly (first section metadata kept, distinct local properties merged first-wins) and a colliding local key is refused with a diagnostic`, `vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file`
  - Fixtures: `committed package.json; backend CONFIG_CATALOG + taxonomy; temp stale/duplicate copies; esbuild bundle`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra)`, `each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'` |
| `ac2` | `declared insrc.models.tasks.* keys EXACTLY cover the role taxonomy (no missing, no extra)`, `each per-role key is a machine-scoped enum with default = the role's defaultTier` |
| `ac3` | `sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy`, `sync-manifest-catalog.test.ts: a stale copy missing the security section and the final role, carrying a retired role and a corrupted role schema, is reported by --check without writing, repaired by one sync, and byte-identical on the next, with explicit surviving and appended key order`, `sync-manifest-catalog.test.ts: a misplaced or duplicated per-role key is removed from its wrong section and regenerated in the canonical section, while unrelated local keys survive`, `sync-manifest-catalog.test.ts: duplicate per-role sections consolidate losslessly (first section metadata kept, distinct local properties merged first-wins) and a colliding local key is refused with a diagnostic` |
| `ac4` | `vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file` |

## 7. Migration

**State before:** package.json stale vs catalog + taxonomy; sync script lacks prefix-wide role ownership, lossless duplicate-section conflict policy, missing-section creation, order-independent repair fixtures

**State after:** syncManifest v3 owns the whole backend-derived manifest surface with a lossless duplicate-section conflict policy; package.json regenerated; --check passes; idempotent; fixtures in place

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. One-time package.json regeneration via the extended sync script; stored values never rewritten (schemas/defaults only); ambiguous duplicates refused with a diagnostic; rollbackable by revert — ↩ rollbackable

**Backward compat:** Manifest schemas/defaults only; stored user values preserved; effective defaults may change only for unset settings if the taxonomy changes. No runtime surface change.

## 8. Alternatives considered

### 8.1 a1: syncManifest v3: shared row map + prefix-wide role ownership + lossless duplicate-section policy (merge first-wins, refuse conflicting duplicates), then regenerate — **CHOSEN**

Own the whole backend-derived manifest surface with a safe, diagnosable duplicate-section policy; one sync run fixes package.json.

Shared non-local row map for update+insertion; taxonomy pass deletes the whole per-role prefix everywhere and regenerates the canonical section; duplicate-titled sections: first keeps title/metadata, properties merge first-wins, conflicting non-role property schemas REFUSE with a diagnostic; missing group sections created; local keys preserved. Idempotent.

### 8.2 a2: v2 shape (drop later duplicate sections after preserving non-role properties)

First section canonical, later duplicates dropped.

As rev 2.

## 9. References

- **[[c1]]** `code` `vscode-plugin/scripts/sync-manifest-catalog.mjs:28-92`
- **[[c2]]** `code` `src/config/config-catalog.ts:142-144`
- **[[c3]]** `code` `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts:19-40`
- **[[c4]]** `code` `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts:15-45`
- **[[c5]]** `code` `vscode-plugin/src/config/key-map.ts:120-155`
- **[[c6]]** `code` `src/config/role-taxonomy.ts:107-108`
- **[[c7]]** `code` `vscode-plugin/src/config/__tests__/per-role.test.ts:77-97`
