<!-- insrc:artifact LLD-61045de91faef1a0-s1 -->

# LLD: STORY-61045de91faef1a0-s1

## Summary

**Epic:** `graph-store-has-no-index-entities`
**HLD base run:** `wf-1792849676188-clfw2b`
**HLD effective hash:** `bbd8079bf4b9...`

File and repository entity reads will use transactional secondary indexes instead of scanning every stored entity. A one-time atomic migration derives both indexes from the existing rows, with no reindex required. Existing read results and entity identities stay unchanged, while repository-readiness checks request only a first match.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `findEntitiesByFile`

```typescript
findEntitiesByFile(_db: DbClient, file: string): Promise<Entity[]>
```

**Parameters:**
- `_db: DbClient` — Existing compatibility argument.
- `file: string` — Existing absolute path, compared exactly as before.

**Returns:** `Promise<Entity[]>` — Preserve existing behavior and ordering unless the explicitly documented first-match mode is requested.

**Errors:**
- `Error` when Unreadable authoritative row/index or migration failure is surfaced; never silently claim an incomplete scoped result is complete.

**Preconditions:**
- Daemon owns the store; schema-v6 index backfill has committed.
- Unknown repository paths return the existing empty result and never allocate registry rows.

**Postconditions:**
- Read only the file-key candidate IDs, resolve authoritative rows, and verify the same absolute-path equality used today.
- Return matching entities in ascending u64 order; digest collisions never admit another file.

### 2.2 `listEntitiesForRepo`

```typescript
listEntitiesForRepo(_db: DbClient, repo: string, opts?: { limit: 1 }): Promise<Entity[]>
```

**Parameters:**
- `_db: DbClient` — Existing compatibility argument.
- `repo: string` — Registered repository path.
- `opts: { limit: 1 }` _(optional)_ — Only the repository-nonempty checks use this additive first-match mode; all existing two-argument calls return every matching entity unchanged.

**Returns:** `Promise<Entity[]>` — Preserve existing behavior and ordering unless the explicitly documented first-match mode is requested.

**Errors:**
- `Error` when Unreadable authoritative row/index or migration failure is surfaced; never silently claim an incomplete scoped result is complete.

**Preconditions:**
- Daemon owns the store; schema-v6 index backfill has committed.
- Unknown repository paths return the existing empty result and never allocate registry rows.

**Postconditions:**
- Use the exact repoId dupsort set; never traverse unrelated entity rows.
- With limit 1, stop at the first valid indexed entity rather than materializing the repository; update scope.ts/invariants.ts dependency seams to request it.

### 2.3 `listEntityFilesForRepo`

```typescript
listEntityFilesForRepo(_db: DbClient, repo: string): Promise<Map<string, string[]>>
```

**Parameters:**
- `_db: DbClient` — Existing compatibility argument.
- `repo: string` — Registered repository path.

**Returns:** `Promise<Map<string, string[]>>` — Preserve existing behavior and ordering unless the explicitly documented first-match mode is requested.

**Errors:**
- `Error` when Unreadable authoritative row/index or migration failure is surfaced; never silently claim an incomplete scoped result is complete.

**Preconditions:**
- Daemon owns the store; schema-v6 index backfill has committed.
- Unknown repository paths return the existing empty result and never allocate registry rows.

**Postconditions:**
- Enumerate only the repository index while preserving file keys, ID grouping and order.

### 2.4 `upsertEntities`

```typescript
upsertEntities(_db: DbClient, entities: Entity[]): Promise<void>
```

**Parameters:**
- `_db: DbClient` — Existing compatibility argument.
- `entities: Entity[]` — Authoritative rows to upsert.

**Returns:** `Promise<void>` — Preserve existing behavior and ordering unless the explicitly documented first-match mode is requested.

**Errors:**
- `Error` when Unreadable authoritative row/index or migration failure is surfaced; never silently claim an incomplete scoped result is complete.

**Preconditions:**
- Daemon owns the store; schema-v6 index backfill has committed.
- Unknown repository paths return the existing empty result and never allocate registry rows.

**Postconditions:**
- Within the existing write transaction, remove old file/repo memberships when their keys change and insert the new memberships with the same entity u64.
- Existing entity IDs, name indexes, vectors and registry refusal behavior remain unchanged.

### 2.5 `reindexFile`

```typescript
reindexFile(_db: DbClient, repoPath: string, filePath: string, parsed: Entity[]): Promise<void>
```

**Parameters:**
- `_db: DbClient` — Existing compatibility argument.
- `repoPath: string` — Registered repository identity.
- `filePath: string` — File being replaced.
- `parsed: Entity[]` — Replacement parsed rows.

**Returns:** `Promise<void>` — Preserve existing behavior and ordering unless the explicitly documented first-match mode is requested.

**Errors:**
- `Error` when Unreadable authoritative row/index or migration failure is surfaced; never silently claim an incomplete scoped result is complete.

**Preconditions:**
- Daemon owns the store; schema-v6 index backfill has committed.
- Unknown repository paths return the existing empty result and never allocate registry rows.

**Postconditions:**
- Resolve old file rows through the file index, then reconcile inserts/updates/tombstones and both memberships atomically.

### 2.6 `runMigrations`

```typescript
runMigrations(store: GraphStore, stored: number, target: number, registry?: readonly Migration[]): Promise<number>
```

**Parameters:**
- `store: GraphStore` — Existing daemon-owned LMDB store.
- `stored: number` — Stored schema version.
- `target: number` — Requested schema version, 6 after this change.
- `registry: readonly Migration[]` _(optional)_ — Existing migration registry/test seam.

**Returns:** `Promise<number>` — Preserve existing behavior and ordering unless the explicitly documented first-match mode is requested.

**Errors:**
- `Error` when Unreadable authoritative row/index or migration failure is surfaced; never silently claim an incomplete scoped result is complete.

**Preconditions:**
- Daemon owns the store; schema-v6 index backfill has committed.
- Unknown repository paths return the existing empty result and never allocate registry rows.

**Postconditions:**
- The v5-to-v6 migration clears/rebuilds both derived indexes from authoritative entity rows in one child transaction and stamps version 6 only after success.
- No reindex, vectors rewrite, new registry allocation or live-schema downgrade.

## 3. Data model changes

### 3.1 `GraphStore` — field-add

Add entityByFile and entityByRepo dupsort handles in src/db/graph/store.ts. entity_by_file key is SHA256 over the exact UTF-8 absolute path produced by the existing toAbsolutePath representation; entity_by_repo key is repoId u32 BE; both values are entity u64 BE. Verify candidate file/repo equality against authoritative rows, so a digest collision cannot change query correctness. Ensure maxDbs includes the new handles. Registered root paths are identity; a future root relocation must rebuild derived file keys.

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/graph/keys.ts`
- `src/db/entities.ts`
- `src/db/repos.ts`

### 3.2 `EntityRow secondary memberships` — invariant-change

Each authoritative entity row has exactly its file-key/u64 and repoId/u64 memberships. Reconcile memberships in every upsert, identity/path move, reindex, embedding rewrite and delete transaction; remove them on file/repo cascade deletes. Inventory all production entity.put/remove sites, including historical migrations. Prior migrations run before v6 backfill; v6 is rebuilt from their final authoritative rows. Preserve strict registration and existing names/edges/vector behavior.

**Call sites:**
- `src/db/entities.ts`
- `src/db/graph/migrations.ts`

### 3.3 `Scoped readiness and freshness reads` — field-modify

Preserve the two-argument listEntitiesForRepo result; add only the literal first-match option limit:1 for nonempty checks in scope.ts and invariants.ts. Their injectable seams gain an optional argument, so existing injected one-argument functions remain compatible. The code-review per-file watermark uses indexed file entities instead of scanning store.entity directly.

**Call sites:**
- `src/analyze/context/scope.ts`
- `src/analyze/context/invariants.ts`
- `src/workflow/code-review/freshness.ts`

### 3.4 `schema_version` — field-modify

Bump schema 5 to 6 and register an atomic backfill. Fresh stores open empty indexes at v6. A migration error leaves v5 authoritative data and version unchanged, refuses service startup, and can be retried; no silent scan fallback or destructive auto-rebuild. Update current-version assertions in the three cited tests to schema 6; retain explicitly historical v4/v5 migration fixtures and assertions at their named historical versions. Inventory all SCHEMA_VERSION and readSchemaVersion assertions before build.

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/graph/migrations.ts`
- `src/db/__tests__/doc-summary-carry.test.ts`
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts`
- `src/db/graph/__tests__/operational.test.ts`

## 4. Diagrams

- [ER model](docs/standalone/graph-store-has-no-index-entities-E2026101061045de9/S001/er-model.html)

## 5. Error paths

**Error cases**

- **Entity row or index membership cannot be written.** (recoverable)
  - Detection: LMDB child transaction throws during row/index reconciliation.
  - Response: Abort the entire transaction; expose the existing write error. Do not leave a committed row without its new memberships.
  - User impact: A write fails visibly rather than creating silently incomplete search results.
- **Backfill fails or the process exits during migration.** (recoverable)
  - Detection: Migration transaction throws or never commits schema version 6.
  - Response: Leave authoritative v5 data/version intact and refuse serving; retry migration on next open. Do not delete/reindex the store automatically.
  - User impact: Startup fails with actionable migration diagnostics; user data is preserved.
- **An index entry refers to a missing authoritative row.** (recoverable)
  - Detection: Exact-key candidate lookup cannot load its u64 row or mapping.
  - Response: Report index/store inconsistency instead of returning a seemingly complete empty result or falling back to a whole-table scan.
  - User impact: Corruption is visible and cannot masquerade as absence.
- **Newer schema is opened by an older binary.** (terminal)
  - Detection: Existing schema-version preflight sees stored version greater than supported.
  - Response: Preserve the existing mismatch refusal. Rollback requires a backup or a binary supporting v6, not a silent schema downgrade.
  - User impact: Older code cannot mutate incompatible indexes.
- **An entity references an unregistered repository.** (recoverable)
  - Detection: Existing registry lookup cannot resolve repo membership during write or backfill.
  - Response: Preserve UnregisteredRepoError/write refusal; during migration report and fail rather than allocating a registry row.
  - User impact: The strict repo.add contract remains intact.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Empty registered repo or absent file. | Return existing empty results using exact-key reads; first-match mode returns an empty array without enumerating the table. |
| Unicode or long paths, nested repositories, and equivalent digest keys. | Use the exact prior absolute-path representation for the hash, verify authoritative path equality, preserve every matching row and u64 order, and never use containment as a substitute for equality. |
| Entity moves file or repository but keeps its u64 in a write. | Remove the old memberships and insert the new ones atomically; no duplicates or stale results. |
| Repeated identical upsert or embedding-only rewrite. | Membership updates are idempotent and cannot duplicate an entity or lose an existing membership. |
| A read overlaps committed writes. | Index enumeration and row resolution use a consistent LMDB read snapshot; results describe one state, never partially updated membership. |

**Invariants to preserve**

- Two-argument scoped reads preserve current returned entities and u64 iteration order; s1 symbol and read-fallback bundles. [[c1]]
- Entity membership changes share the authoritative write transaction; use the existing name-index reconciliation pattern identified in s1. [[c2]]
- Daemon owns DB access, unknown repos are never auto-registered, and migration failure never silently rebuilds user data; s1 store/registry read-fallback. [[c3]]

## 6. Test strategy

**Test framework:** `node:test via tsx, matching the repository's documented backend/db test command; all storage tests use temporary registered repositories and isolated LMDB paths.`

**Test levels**

- **unit** — Prove key encoding, exact matching and compatibility.
  - Subjects: `File-key hashing is deterministic for the existing absolute-path representation and supports long Unicode paths.`, `Repository keys and entity-u64 dupsort values preserve isolation and result order.`, `A forced file-key digest collision still returns only rows with the exact requested absolute path.`
  - Fixtures: `Two repos with same relative filenames, long/Unicode paths, deterministic u64 IDs`, `Internal digest seam for an artificial collision`
- **integration** — Prove every entity mutation maintains both indices transactionally.
  - Subjects: `Insert, same-ID update, file/repo move, reindex replacement, embedding-only update, delete by ID/file/repo all match an authoritative fixture oracle.`, `An injected transaction failure rolls back both row and index membership changes.`, `Compare file/repo reads and grouped file lists to pre-change content/order.`, `Repository existence requests limit:1 and reads at most the first matching authoritative entity.`, `Code-review per-file watermark uses indexed file entities.`
  - Fixtures: `Isolated LMDB environment registered exclusively through existing repo-add test helpers`, `Mixed target/unrelated rows with stable expected result arrays`
- **contract** — Prove the scoped operations cannot silently regress to whole-table scans.
  - Subjects: `After setup/backfill, replace entity.getRange with a throwing spy; file/repo lookups, deletion collectors, file reindex snapshots and readiness checks still work.`, `Count entity.get calls to show unrelated rows are not read.`, `Unregistered repo writes remain refused and never create registry rows.`
  - Fixtures: `Read-operation spies installed only after fixture creation/migration`
- **integration** — Prove v5-to-v6 migration, crash safety and version compatibility.
  - Subjects: `Open a populated v5 fixture, backfill on startup and verify exact file/repo results without invoking the indexer.`, `Inject failure after partial backfill; reopen at version 5 with no partial committed index and retry successfully.`, `Fresh v6 store starts with empty usable indices; a second reopen does not rebuild them.`, `Existing unsupported-version refusal remains in force.`, `Run doc-summary-carry, migration-v4-to-v5 and operational suites: latest-version expectations follow v6, while explicit historical migration fixtures still prove their original transitions.`
  - Fixtures: `Populated v5 file containing every row class used by entity queries`, `Migration failure hook and reopen fixture`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `File lookup and file collectors use exact-key candidates; whole-table read spy throws without affecting the operations.` |
| `ac2` | `Repository lookup/file grouping uses only its u64 set and keeps existing content/order.` |
| `ac3` | `Mutation matrix and rollback tests prove exact membership after every supported write/delete.` |
| `ac4` | `Populated v5 startup migrates once without reindex; failure rolls back and retry succeeds.` |
| `ac5` | `Readiness requests only one indexed match; no full repository materialization and no unrelated entity reads.` |

## 7. Migration

**State before:** The s1 analyzer locates SCHEMA_VERSION=5 and whole-table entity.getRange loops in scoped reads and deletion collectors. The existing graph store already uses dupsort secondary indices and runMigrations; file/repo membership indexes are absent.

**State after:** Schema v6 has exact file/repo dupsort memberships derived from authoritative rows. Scoped reads and collectors use them, and readiness requests a first match. Existing rows, IDs, vectors and registry membership are unchanged.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Add the two named DB handles and binary/digest key definitions; verify named-DB capacity before environment open. — ↩ rollbackable
2. Register v5-to-v6 backfill that clears/rebuilds derived memberships from authoritative rows and validates registry roots inside one child transaction, stamping v6 only on success. — ✕ non-rollbackable
3. Wire every entity write/delete and scoped read to the membership contract, then update the two readiness seams and per-file review watermark. — ↩ rollbackable
4. Validate fresh/populated migration, rollback-on-failure, reopen idempotence, exact result compatibility and no-full-scan spies on temporary environments before any installed-store deployment. — ↩ rollbackable

**Backward compat:** All existing two-argument scoped-read callers keep the same content and ordering. Only readiness callers opt into the additive limit:1 mode. Persisted v6 is forward-only: an older binary must retain its existing newer-schema refusal. Before deployment preserve a normal store backup; binary rollback after migration requires that backup or a v6-capable binary, not a silent downgrade. No repo re-registration or reindex.

## 8. Alternatives considered

### 8.1 a1: Two transactional dupsort secondary indexes — **CHOSEN**

Add exact file and repository entity-ID indexes beside authoritative rows.

Reuse existing LMDB dupsort patterns: file key is a fixed-size digest of the existing absolute-path representation and repository key is repoId; values are big-endian entity u64 IDs. Resolve candidates through authoritative rows and verify exact path/repo equality. Maintain entries atomically with every row write/delete; migrate existing rows once on open. Existing scoped-read APIs retain their results and ordering.

### 8.2 a2: Repository-only secondary index with file filtering

Index repository entity IDs and filter those rows for file queries.

Add only repoId-to-entity-ID dupsort. Repository reads enumerate that set; file reads select containing registered repositories and filter their indexed entity rows, preserving final path comparison.

**Rejected because:** Cheaper but still reads other files in the target repository; that fails the core file-scope requirement.

## 9. References

- **[[c1]]** `code` `src/db/entities.ts:813` — "Existing scoped reads iterate store.entity.getRange and preserve entity-u64 ordering."
- **[[c2]]** `code` `src/db/entities.ts:1016` — "Name-index reconciliation already removes prior membership and writes the new membership with entity writes."
- **[[c3]]** `code` `src/db/graph/store.ts:138` — "SCHEMA_VERSION is currently 5; named dupsort DBs and version preflight already exist."
- **[[c4]]** `code` `src/db/graph/migrations.ts:452`
- **[[c5]]** `prior-artifact` `ISSUE-61045de91faef1a0`
- **[[c6]]** `code` `src/analyze/context/scope.ts:210`
- **[[c7]]** `code` `src/analyze/context/invariants.ts:295`
- **[[c8]]** `code` `src/workflow/code-review/freshness.ts:109`
- **[[c9]]** `code` `src/db/repos.ts:153`
- **[[c10]]** `convention` `AGENTS.md#build-and-run`
- **[[c11]]** `code` `src/db/__tests__/doc-summary-carry.test.ts`
- **[[c12]]** `code` `src/db/graph/__tests__/migration-v4-to-v5.test.ts`
- **[[c13]]** `code` `src/db/graph/__tests__/operational.test.ts`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 6 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-24T13:58:07.236Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
