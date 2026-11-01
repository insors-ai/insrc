<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s3 -->

# LLD: E20261101c2ba6fa6:S003

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `85da4a2df479...`

This Story gives the graph store a real by-file and by-repository index of entity rows, so reading one file's or one repository's entities costs in proportion to what is returned instead of scanning every entity in the store. It absorbs ISSUE-61045de91faef1a0 in full. One new LMDB table, keyed by repository and file path, is kept exactly in step with every entity write through a single new put/remove wrapper that every one of the 7 existing raw write sites is routed through; a migration step builds the index for stores written before this change.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase B — nothing lost, nothing wrongly left out, fast reads

## 2. Contract details

**Surface level:** internal

### 2.1 `listEntitiesForRepo`

```typescript
listEntitiesForRepo(_db: DbClient, repo: string): Promise<Entity[]>
```

**Parameters:**
- `_db: DbClient` — Unused client handle, kept for call-site compatibility (existing signature).
- `repo: string` — Repo root path to resolve to a repoId.

**Returns:** `Promise<Entity[]>` — Every entity of the given repository, same set as today, now read via a repoId-prefix range over the new by-file index instead of a full store.entity.getRange() scan.

**Preconditions:**
- repo must resolve to a registered repoId via lookupRepoIdInTxn, unchanged from today; an unregistered repo returns [].

**Postconditions:**
- Returns the identical entity set as the current full-scan implementation for every existing caller, with no caller-visible change.

### 2.2 `findEntitiesByFile`

```typescript
findEntitiesByFile(_db: DbClient, file: string): Promise<Entity[]>
```

**Parameters:**
- `_db: DbClient` — Unused client handle, kept for call-site compatibility (existing signature).
- `file: string` — Absolute file path.

**Returns:** `Promise<Entity[]>` — Every entity of the given file, same set as today, now read via a direct (repoId, relativeFilePath) key lookup on the new by-file index instead of a full store.entity.getRange() scan with per-row path recomputation.

**Preconditions:**
- file is resolved to its owning registered repoId by scanning the (small) repo table for a root that is a path-prefix of file -- unchanged behavior for an unregistered or unmatched file: returns [].

**Postconditions:**
- Returns the identical entity set as the current full-scan implementation for every existing caller, with no caller-visible change.

### 2.3 `repoHasAnyEntity` (new)

```typescript
repoHasAnyEntity(_db: DbClient, repo: string): Promise<boolean>
```

**Parameters:**
- `_db: DbClient` — Unused client handle, kept for call-site compatibility with listEntitiesForRepo/findEntitiesByFile.
- `repo: string` — Repo root path to resolve to a repoId.

**Returns:** `Promise<boolean>` — Whether the repository holds any stored entity, answered via a limit-1 range on entityByFile prefixed by repoId; never builds the repository's entity list.

**Preconditions:**
- repo must resolve to a registered repoId via lookupRepoIdInTxn; an unregistered repo answers false.

**Postconditions:**
- Answers the same yes/no `listEntitiesForRepo(...).length > 0` would answer today, without constructing any Entity.

**Real integration point (ac4/FR002's actual consumer):** `ensureNonEmptyClosure` (src/analyze/context/invariants.ts:235-301) is the analyzer's scope check this Story's boundary text names. Today its `deps` parameter is typed `Pick<ScopeDeps, 'listRepos' | 'listEntitiesForRepo'> & { readonly indexRun?: ... }` (invariants.ts:237), and it calls `deps.listEntitiesForRepo(best.path)`, throwing `ScopeNotIndexedError` when `entities.length === 0` (invariants.ts:289-298).

`repoHasAnyEntity` is added to `ScopeDeps` (scope.ts:77-87) and `REAL_DEPS` (scope.ts:84-89) as an **OPTIONAL** field: `repoHasAnyEntity?: (repoPath: string) => Promise<boolean>`. `ensureNonEmptyClosure`'s `deps` parameter type is widened to `Pick<ScopeDeps, 'listRepos' | 'listEntitiesForRepo' | 'repoHasAnyEntity'> & {...}` (adding the optional field to the Pick). At the ac4 call site, `ensureNonEmptyClosure` prefers the fast path when the caller's `deps` supplies it: `const empty = deps?.repoHasAnyEntity !== undefined ? !(await deps.repoHasAnyEntity(best.path)) : (await (deps !== undefined ? deps.listEntitiesForRepo(best.path) : listEntitiesForRepo(null, best.path))).length === 0;` — throwing `ScopeNotIndexedError` on `empty`, identical to today's observable behaviour either way.

Making the field optional, with this fallback, is deliberate: a repo-wide scan (`grep -rln "listEntitiesForRepo:"`) found **30 files**, not 6, that construct `ScopeDeps`-shaped object literals across src/daemon/steps/__tests__, src/analyze/context/__tests__, src/analyze/runtimes/*/__tests__, src/analyze/executor/__tests__, src/analyze/orchestrator/__tests__, src/analyze/planner/__tests__ and src/analyze/__tests__ -- several explicitly typed `: ScopeDeps` (e.g. data-runtimes.test.ts:114, root-bound-scope.ts:34). A REQUIRED new field would force every one of those 30 files to add a `repoHasAnyEntity` fake just to keep compiling, none of which this Story's own test strategy otherwise touches. An OPTIONAL field with a fallback needs updating in exactly ONE place for correctness (`REAL_DEPS`, which is what production actually uses) and in the test fixtures this Story's own test strategy adds for the ac4 wiring proof itself; every other existing fixture compiles and behaves unchanged, since omitting an optional field was always valid TypeScript.

## 3. Data model changes

### 3.1 `entityByFile (new LMDB table)` — new

A new dupSort table, structurally identical to the existing unresolvedByFile table (src/db/graph/store.ts:645), keyed encodeEntityByFileKey(repoId, filePath) = repo u32 BE + utf8 filePath (mirroring encodeUnresolvedByFileKey, src/db/graph/keys.ts:262-264), dupSort value = the entity's u64 id. A getRange keyed to (repoId, filePath) answers findEntitiesByFile directly; a getRange prefixed by repoId alone (the same prefix-scan idiom nameIndex's encodeNameIndexPrefix already uses, keys.ts:255-259) answers listEntitiesForRepo and, with an iteration limit of 1, the ac4 existence check.

**Call sites:**
- `src/db/graph/store.ts:641`
- `src/db/graph/store.ts:645`
- `src/db/graph/keys.ts:248-253`
- `src/db/graph/keys.ts:255-259`
- `src/db/graph/keys.ts:262-264`

### 3.2 `entity row write/remove sites (src/db/entities.ts, src/db/graph/migrations.ts)` — invariant-change

The invariant changes from 'any code may call store.entity.put/remove directly, and only nameIndex upkeep is a known side effect' to 'every entity row write or removal goes through one put/remove wrapper, which keeps the entity row, the name index, and the new entityByFile index in the same transaction.' All 7 existing raw sites (entities.ts:272, entities.ts:289, entities.ts:466, entities.ts:974, entities.ts:1180, migrations.ts:267, migrations.ts:346) are rewritten to call the wrapper instead of writing store.entity and the side tables directly.

**Call sites:**
- `src/db/entities.ts:272`
- `src/db/entities.ts:289`
- `src/db/entities.ts:466`
- `src/db/entities.ts:974`
- `src/db/entities.ts:1180`
- `src/db/graph/migrations.ts:267`
- `src/db/graph/migrations.ts:346`

### 3.3 `ScopeDeps` (src/analyze/context/scope.ts:77-89) — field-add

Adds `repoHasAnyEntity?: (repoPath: string) => Promise<boolean>` (OPTIONAL) to the `ScopeDeps` interface, and a real implementation to `REAL_DEPS`, alongside the existing `listEntitiesForRepo` field. `ensureNonEmptyClosure`'s `deps` parameter type (src/analyze/context/invariants.ts:237, currently `Pick<ScopeDeps, 'listRepos' | 'listEntitiesForRepo'> & {...}`) widens to also pick `'repoHasAnyEntity'`; the function prefers `deps.repoHasAnyEntity(best.path)` when the caller's `deps` supplies it, falling back to today's `deps.listEntitiesForRepo(best.path).length === 0` check otherwise -- this is the real wiring the Story's boundary text means by "the analyzer's scope check uses it." Optional + fallback (not required) because 30 files across the repo construct `ScopeDeps`-shaped object literals and none but this Story's own new tests need to change.

**Call sites:**
- `src/analyze/context/scope.ts:77-87`
- `src/analyze/context/scope.ts:84-89`
- `src/analyze/context/invariants.ts:237`
- `src/analyze/context/invariants.ts:289-298`

## 4. Error paths

**Error cases**

- **findEntitiesByFile is called with an absolute path that matches no registered repository's root as a prefix.** (recoverable)
  - Detection: The small store.repo.getRange() scan that resolves the owning repoId finds no repo root that is a path-prefix of the given file.
  - Response: Returns [] immediately, matching today's full-scan implementation's behavior for the same input (lc1: the two reads return what they return today).
  - User impact: No behavior change from today -- an unmatched file already yields an empty result.
- **A code path bypasses the new put/remove wrapper and calls store.entity.put or store.entity.remove directly, as all 7 sites did before this Story.** (recoverable)
  - Detection: A new guard test (per the Story's own boundary text) scans the source for entity.put/entity.remove occurrences outside the wrapper's own implementation file and fails the build if any is found.
  - Response: The test fails at build/CI time, before the code ships, not at runtime -- this is a dev-time detection, not a production error path.
  - User impact: None in production; a developer adding a new raw write site is caught before merge.
- **The daemon crashes or is killed mid-migration, after entityByFile has been partially populated for some entity rows but not all.** (recoverable)
  - Detection: On the next open, the migration step's own idempotent marker check (consistent with the existing migration chain's convention) finds the migration not yet marked complete and re-runs it.
  - Response: The migration re-walks the entity table and re-populates entityByFile; a dupSort put of an already-present (key, value) pair is a no-op in LMDB, so re-running is safe and does not create duplicate entries.
  - User impact: A second daemon start after a crash mid-migration briefly redoes migration work; reads are correct once it completes, and no entity or index data is lost.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An entity with an empty filePath (an external endpoint, which listEntityFilesForRepo's own comment notes 'belongs to no file'). | findEntitiesByFile never matches it (no absolute file resolves to an empty filePath), exactly as today's full scan already excludes it from a file-scoped read; listEntitiesForRepo still returns it, since the entityByFile key's repoId-prefix scan includes the (repoId, '') key range as part of that repository's rows, matching today's repo-scoped full scan which has no file-path filter at all. |
| Two different registered repositories each have an entity at the same relative file path (e.g. both have 'src/index.ts'). | The repoId portion of the key (encoded first, as a fixed-width u32 BE) disambiguates them completely; a file-scoped read for one repo's absolute path never returns the other repo's entities at the same relative path. |
| An absolute file path lies under one registered repo root that is itself nested inside another registered repo root. | The repo-resolution helper must pick the longest (most specific) matching root, not an arbitrary one among the store.repo.getRange() results, so the file resolves to the repo that actually indexed it. The helper MUST use a path-segment-boundary comparison (`path === r.path \|\| path.startsWith(r.path + '/')`), not a plain string-prefix test (which would wrongly match `/x/repo2/a.ts` against root `/x/repo`) -- this is the exact comparison `longestPrefixRepo` (src/analyze/context/scope.ts:168-179) already uses for the identical problem one layer up; src/db cannot import src/analyze/context/scope.ts (layering), so this helper is a small, independent re-implementation of the same boundary-safe logic, not a shared import. |
| listEntitiesForRepo is called for a repository that has zero stored entities. | The repoId-prefix range over entityByFile yields no rows; the function returns [], identical to today's full-scan behavior for an entity-free repository. |

**Invariants to preserve**

- Every one of the 7 existing raw entity.put/entity.remove call sites (migrations.ts:267,346; entities.ts:272,289,466,974,1180) must be routed through the new wrapper, with none left writing the entity table or its side-tables directly -- the exact gap the nameIndex precedent shows is otherwise easy to leave open (its own create and delete sites write nameIndex inline rather than through rewireNameIndexInTxn). [[c1]]
- listEntitiesForRepo and findEntitiesByFile return the identical entity set as their current full-scan implementations for every existing caller; this Story changes only how the read reaches that result, never what it returns. [[c4]]

## 5. Test strategy

**Test framework:** `node:test (tsx --test), extending src/db/__tests__/entities-lmdb.test.ts's existing LMDB-backed entity-persistence test pattern`

**Test levels**

- **unit** — Prove the new entityByFile table and the put/remove wrapper keep it in exact step with the entity table across create, replace and delete, and that the two existing reads return the identical set as a full scan.
  - Subjects: `the new entityByFile LMDB table and its encode/decode key functions`, `the new put/remove wrapper for entity rows`, `listEntitiesForRepo (src/db/entities.ts:819)`, `findEntitiesByFile (src/db/entities.ts:864)`, `the new repo-for-absolute-file resolution helper`
  - Fixtures: `a temp LMDB graph store with two registered repos, one with many more entities than the other, to prove ac1's 'examines only that file's rows' claim is at least behaviorally correct`, `entities written, then replaced, then deleted for the same file, re-reading findEntitiesByFile after each step for ac3`, `an entity with an empty filePath (external endpoint) to prove the edge case: excluded from findEntitiesByFile, included in listEntitiesForRepo`, `two repos sharing the same relative file path, to prove repoId disambiguation`, `nested repo roots, to prove longest-prefix-match resolution`
- **unit** — Prove a raw entity.put/entity.remove call outside the new wrapper is caught before it ships.
  - Subjects: `a source-scanning guard test over src/db/entities.ts and src/db/graph/migrations.ts`
- **integration** — Prove an existing on-disk store (written before this Story, with no entityByFile table) is brought to the new form exactly once when the daemon opens it, and that a second open does no further migration work.
  - Subjects: `the migration step that populates entityByFile for a pre-existing store`
  - Fixtures: `a store fixture built via the pre-this-Story write path (raw entity.put, no entityByFile) then opened twice in sequence, asserting the migration ran on the first open and not the second`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `entities-lmdb.test.ts: findEntitiesByFile on one file of the smaller of two indexed repos returns the same entities as a full-scan baseline, without touching the larger repo's rows` |
| `ac2` | `entities-lmdb.test.ts (or a new migration-focused test file): a store built via the pre-Story raw-write path, opened twice, migrates entityByFile on the first open only; reads work correctly after migration without a re-index` |
| `ac3` | `entities-lmdb.test.ts: write, replace, then delete a file's entities in sequence, asserting findEntitiesByFile after each step matches a full-scan-equivalent baseline every time` |
| `ac4` | `entities-lmdb.test.ts: repoHasAnyEntity answers yes for a repo with stored entities and no for one with none, without calling listEntitiesForRepo or any function that builds the full entity list; invariants.test.ts: a deps fixture supplying BOTH a repoHasAnyEntity fake and a listEntitiesForRepo fake proves ensureNonEmptyClosure calls repoHasAnyEntity and never calls listEntitiesForRepo when the former is present, with the ScopeNotIndexedError / pass-through outcome driven entirely by repoHasAnyEntity's answer` |

## 6. Migration

**State before:** listEntitiesForRepo (entities.ts:819-833) and findEntitiesByFile (entities.ts:864-880) both scan store.entity.getRange() over every entity row in the whole store, filtering in JS. There are 7 raw entity.put/entity.remove call sites (entities.ts:272,289,466,974,1180; migrations.ts:267,346) with no single put/remove function; the entity table's only side-table today is nameIndex, kept in step by rewireNameIndexInTxn for some sites and written inline by others. No by-file or by-repo index of entity rows exists. ISSUE-61045de91faef1a0 records this as unfixed.

**State after:** A new entityByFile dupSort table (keyed repoId + filePath, dupSort value = entity u64 id, structurally identical to the existing unresolvedByFile table) exists and is kept in exact step with the entity table by a new put/remove wrapper that all 7 raw sites call instead of writing store.entity (and nameIndex) directly. listEntitiesForRepo and findEntitiesByFile are rewritten to read entityByFile (by repoId-prefix and by exact key respectively) instead of scanning store.entity.getRange(), returning the identical result sets as before. A new existence-check function answers whether a repository holds any entity via a limit-1 range on entityByFile. A migration step walks the existing entity table once per store and populates entityByFile for every row, idempotently (a completion marker following the existing migration chain's convention prevents re-running on a later open).

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the entityByFile LMDB table (dupSort) and its key-encode/decode functions, mirroring unresolvedByFile's shape. — ↩ rollbackable
2. Add the put/remove wrapper for entity rows that writes/removes the entity row, the nameIndex entry, and the entityByFile entry together in one transaction. — ↩ rollbackable
3. Route all 7 existing raw entity.put/entity.remove sites (entities.ts:272,289,466,974,1180; migrations.ts:267,346) through the new wrapper. — ↩ rollbackable
4. Add a guard test that scans the source for an entity.put/entity.remove call outside the wrapper's own file and fails if one is found. — ↩ rollbackable
5. Add the small repo-for-absolute-file resolution helper (scans the registered-repo table, picks the longest matching root). — ↩ rollbackable
6. Rewrite findEntitiesByFile to resolve the owning repoId via the new helper, then read entityByFile by exact (repoId, relativeFilePath) key instead of scanning store.entity.getRange(). — ↩ rollbackable
7. Rewrite listEntitiesForRepo to read entityByFile by repoId-prefix range instead of scanning store.entity.getRange(). — ↩ rollbackable
8. Add repoHasAnyEntity (limit-1 range over entityByFile by repoId-prefix); add it as an OPTIONAL field to the ScopeDeps interface and implement it on REAL_DEPS (src/analyze/context/scope.ts:77-89); widen ensureNonEmptyClosure's deps parameter type (invariants.ts:237) to also Pick 'repoHasAnyEntity'; change its body to prefer deps.repoHasAnyEntity(best.path) when supplied, falling back to today's deps.listEntitiesForRepo(best.path).length === 0 check otherwise -- no existing ScopeDeps test fixture needs to change, since the field is optional; this Story's own new tests (for the ac4 wiring itself) supply a repoHasAnyEntity fake to prove the fast path is taken when available. — ↩ rollbackable
9. Add the migration step that walks the existing entity table once and populates entityByFile for every row, applied on the existing migration chain, marker-guarded against re-running. — ↩ rollbackable

**Backward compat:** listEntitiesForRepo and findEntitiesByFile keep their existing signatures and return the identical entity sets as today for every existing caller (lc1); no caller changes. The new existence-check function and the entityByFile table are purely additive. The migration step adds data without touching or renumbering any existing key, kind byte, or stored value, per the HLD's migration-chain discipline (k5, k6); an older store is brought forward automatically on open with no user re-index.

## 7. Alternatives considered

### 7.1 a1: One new by-file dupSort table, mirroring unresolvedByFile — **CHOSEN**

A single entityByFile table keyed (repoId, filePath) -> dupSort entity u64 id, read with a file-level key for ac1/ac3, a repo-only key prefix for listEntitiesForRepo, and a limit-1 range for the ac4 existence check; one put/remove wrapper routes all 7 raw sites through it alongside the existing nameIndex upkeep.



### 7.2 a2: Two separate tables: by-file and by-repo-membership

A by-file table for ac1/ac3 plus a SEPARATE by-repo-only table (repoId -> dupSort entity id) for listEntitiesForRepo and the ac4 existence check, kept in step together.



**Rejected because:** Redundant with a1: the by-file table's key already starts with repoId, so a prefix-range over it already answers the repo-level and existence-check needs without a second table -- this duplicates storage and write cost for no behavior a1 doesn't already provide; also widens the wrapper's blast radius and the migration's work for no benefit.

### 7.3 a3: By-file index with kind prepended to the key (repoId, kind, filePath)

Mirror nameIndex's three-part key shape (repo, kind, name) onto the new index as (repo, kind, filePath), enabling a future repo+kind+file lookup alongside the plain by-file one.



**Rejected because:** None of the Story's 4 ACs ask for a kind-scoped read; a kind byte in the key forces both reads (which return mixed-kind results per file/repo) to iterate once per kind byte or fall back to a kind-less scan, actively complicating the exact two reads this Story must serve -- unused flexibility nobody asked for.

### 7.4 a4: Reorder the entity table's own primary key to (repoId, filePath, id) instead of a bare u64 id

Change the entity table's primary key encoding itself to start with repoId+filePath, so a file-scoped or repo-scoped range query on the PRIMARY table answers ac1/ac3/ac4 directly, with no secondary index at all.



**Rejected because:** Breaks the HLD's explicit framework constraint that no existing edge key or kind byte changes -- the entity's u64 id is the primary key every edge table (outEdge, inEdge, unresolved, nameIndex, and every relationship row) references directly; re-keying entities would cascade into every one of those tables, far outside this Story's declared M-sized, s2-independent boundary.

## 8. References

- **[[c1]]** `code` `src/db/graph/migrations.ts:267`
- **[[c2]]** `code` `src/db/entities.ts:1025-1044`
- **[[c3]]** `code` `src/db/graph/store.ts:645`
- **[[c4]]** `code` `src/db/entities.ts:819-833`
- **[[c5]]** `code` `src/db/repos.ts:313`
- **[[c6]]** `code` `src/analyze/context/invariants.ts:235-301`
- **[[c7]]** `code` `src/analyze/context/scope.ts:168-179`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-01T05:28:02.765Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
