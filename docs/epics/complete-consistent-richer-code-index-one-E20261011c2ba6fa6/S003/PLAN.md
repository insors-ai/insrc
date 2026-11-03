<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s3 -->

# Plan: E20261101c2ba6fa6:S003

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1793509679068-pst4li`
**LLD effective hash:** `85da4a2df479...`

Building this Story means adding one new LMDB table and one new write-path function, then routing today's scattered writers and readers through them. The write side comes first: a new entityByFile table, then a put/remove wrapper that keeps it (and the existing nameIndex) consistent, then all 7 existing raw write sites are rerouted through it, with a guard test locking that in place. The read side follows: a small repo-resolution helper, then both existing reads rewritten onto the new table, then the cheap existence check wired into the analyzer's scope check as an optional fast path that changes no other caller. A migration step closes the loop for stores that already exist on disk.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the entityByFile LMDB table and its key encode/decode functions | S | — | unit: encodeEntityByFileKey/decodeEntityByFileKey round-trip a (repoId, filePath) pair, including an empty filePath, byte-identical to the input | [[c1]] |
| 2 | **`t2`** Add the put/remove wrapper for entity rows | M | `t1` | unit: the wrapper's put path writes the entity row, nameIndex entry, and entityByFile entry atomically in one transaction; create/replace/delete through the wrapper keeps all three tables consistent at every step | [[c2]] [[c3]] |
| 3 | **`t3`** Route all 7 existing raw entity.put/entity.remove sites through the new wrapper | M | `t2` | unit: every one of the 7 pre-existing call-site behaviors (create, replace, delete, migration rewrite, migration delete) is unchanged after routing through the wrapper -- existing entities.ts/migrations.ts test suites pass unmodified | [[c2]] [[c3]] |
| 4 | **`t4`** Add the guard test for a raw entity.put/entity.remove or nameIndex.put/nameIndex.remove call outside the wrapper | S | `t3` | unit: a source-scanning guard test over entities.ts and migrations.ts passes against the real post-t3 source and fails when a raw entity.put/entity.remove/nameIndex.put/nameIndex.remove is introduced outside the wrapper's own file | [[c4]] [[c3]] [[c5]] |
| 5 | **`t5`** Add the repo-for-absolute-file resolution helper | S | `t1` | unit: the repo-for-absolute-file resolution helper picks the longest matching root for nested repo roots, and resolves to no repo for an unmatched path, using a path-segment-boundary comparison | [[c6]] |
| 6 | **`t6`** Rewrite findEntitiesByFile and listEntitiesForRepo to read entityByFile instead of scanning store.entity | M | `t1`, `t3`, `t5` | unit: findEntitiesByFile on one file of the smaller of two indexed repos returns the same entities as a full-scan baseline, touching only that file's rows (ac1); unit: write, replace, then delete a file's entities in sequence; findEntitiesByFile after each step matches a full-scan-equivalent baseline every time (ac3); unit: an entity with an empty filePath is excluded from findEntitiesByFile but included in listEntitiesForRepo; unit: two repos sharing the same relative file path never cross-contaminate a file-scoped read; unit: listEntitiesForRepo returns [] for a repo with zero stored entities, identical to today's full-scan behavior | [[c7]] [[c8]] |
| 7 | **`t7`** Add repoHasAnyEntity and wire it into ScopeDeps / ensureNonEmptyClosure as an optional fast path | M | `t1`, `t3` | unit: repoHasAnyEntity answers yes for a repo with stored entities and no for one with none, without calling listEntitiesForRepo or building the full entity list (ac4); unit: a deps fixture supplying both repoHasAnyEntity and listEntitiesForRepo fakes proves ensureNonEmptyClosure prefers repoHasAnyEntity and never calls listEntitiesForRepo when it is present, with ScopeNotIndexedError driven by repoHasAnyEntity's answer; unit: ensureNonEmptyClosure falls back to the existing listEntitiesForRepo-based check unchanged when deps.repoHasAnyEntity is absent, proving the ~30 existing ScopeDeps fixtures keep compiling and behaving unchanged | [[c9]] [[c10]] |
| 8 | **`t8`** Add the migration step that backfills entityByFile for an existing on-disk store | M | `t1`, `t2` | integration: a store built via the pre-Story raw-write path (entity rows with no entityByFile), opened twice, migrates entityByFile on the first open only; reads work correctly after migration without a re-index (ac2); integration: a store with entityByFile only partially populated (simulating a crash mid-migration), reopened, safely re-runs the migration to completion with no duplicate entries | [[c11]] [[c12]] |

### 1.1 E20261101c2ba6fa6:S003:T001 — Add the entityByFile LMDB table and its key encode/decode functions

Declare a new dupSort table entityByFile in the graph store (store.ts), opened the same way unresolvedByFile is (store.ts:645), and add encodeEntityByFileKey(repoId, filePath) / its decode counterpart in keys.ts, mirroring encodeUnresolvedByFileKey's shape (repoId u32 BE + utf8 filePath). No reads or writes wired yet -- this task only adds the table and key functions.

**Acceptance checks:**
- entityByFile is declared as a dupSort table alongside unresolvedByFile in store.ts
- encodeEntityByFileKey/decodeEntityByFileKey round-trip (repoId, filePath) correctly, including an empty filePath

### 1.2 E20261101c2ba6fa6:S003:T002 — Add the put/remove wrapper for entity rows

Add one new function that writes/removes the entity row, keeps nameIndex upkeep (reusing/calling the existing rewireNameIndexInTxn pattern), and now also writes/removes the matching entityByFile entry -- all inside the same LMDB transaction. This is the single new entry point every entity-row mutation will go through, and the ONLY place nameIndex upkeep happens from this point on.

**Acceptance checks:**
- the wrapper's put path writes the entity row, the nameIndex entry, and the entityByFile entry atomically in one transaction
- the wrapper's remove path removes all three atomically
- a unit test writes then replaces then deletes an entity through the wrapper and confirms all three tables stay consistent at each step
- the wrapper is the only place nameIndex.put/nameIndex.remove is called for an entity-row change -- no remaining call site writes nameIndex inline outside the wrapper, closing the gap the LLD's invariantsToPreserve[0] names (today's create/delete sites write nameIndex inline rather than through rewireNameIndexInTxn)

### 1.3 E20261101c2ba6fa6:S003:T003 — Route all 7 existing raw entity.put/entity.remove sites through the new wrapper

Rewrite entities.ts:272,289,466,974,1180 and migrations.ts:267,346 to call the new put/remove wrapper from t2 instead of writing store.entity and nameIndex directly (including the sites that today write nameIndex inline rather than through rewireNameIndexInTxn). No other behavior at these sites changes.

**Acceptance checks:**
- none of the 7 original raw entity.put/entity.remove call sites remain
- no entity-row change anywhere in entities.ts or migrations.ts writes nameIndex inline outside the wrapper
- every existing test touching these 7 call sites still passes unmodified

### 1.4 E20261101c2ba6fa6:S003:T004 — Add the guard test for a raw entity.put/entity.remove or nameIndex.put/nameIndex.remove call outside the wrapper

Add a source-scanning test over src/db/entities.ts and src/db/graph/migrations.ts that fails the build if an entity.put, entity.remove, nameIndex.put, or nameIndex.remove call tied to an entity-row change appears anywhere outside the new wrapper's own implementation -- mechanically closing the historical inline-nameIndex-write gap the LLD names, not only the entity.put/remove gap.

**Acceptance checks:**
- the guard test passes against the post-t3 source (all 7 sites now route through the wrapper, including their nameIndex upkeep)
- introducing a raw entity.put call outside the wrapper (in a throwaway local check) makes the guard test fail
- introducing a raw nameIndex.put call outside the wrapper (in a throwaway local check) also makes the guard test fail, confirming it catches the historical inline-nameIndex gap too

### 1.5 E20261101c2ba6fa6:S003:T005 — Add the repo-for-absolute-file resolution helper

Add a small helper in src/db that scans the registered-repo table and picks the longest (most specific) matching root for a given absolute file path, using a path-segment-boundary comparison (not a plain string prefix), independently re-implementing the same boundary-safe logic longestPrefixRepo (scope.ts:168-179) uses one layer up -- src/db cannot import src/analyze/context/scope.ts.

**Acceptance checks:**
- a file under one repo root nested inside another repo root resolves to the more specific (nested) root, not the outer one
- an absolute path matching no registered repo root resolves to no repo (undefined/null), not a false match

### 1.6 E20261101c2ba6fa6:S003:T006 — Rewrite findEntitiesByFile and listEntitiesForRepo to read entityByFile instead of scanning store.entity

findEntitiesByFile (entities.ts:864) resolves its owning repoId via the t5 helper, then reads entityByFile by exact (repoId, relativeFilePath) key instead of scanning store.entity.getRange(). listEntitiesForRepo (entities.ts:819) reads entityByFile by a repoId-prefix range instead of the same full scan. Both keep their existing signatures and return the identical entity sets as today for every caller.

**Acceptance checks:**
- ac1: findEntitiesByFile on one file of the smaller of two indexed repos returns the same entities as a full-scan baseline, touching only that file's rows
- ac3: write, replace, then delete a file's entities in sequence; findEntitiesByFile after each step matches the full-scan-equivalent baseline every time
- an entity with an empty filePath (external endpoint) is excluded from findEntitiesByFile but still included in listEntitiesForRepo
- two repos sharing the same relative file path never cross-contaminate a file-scoped read
- every existing caller of either function is unaffected

### 1.7 E20261101c2ba6fa6:S003:T007 — Add repoHasAnyEntity and wire it into ScopeDeps / ensureNonEmptyClosure as an optional fast path

Add repoHasAnyEntity(_db, repo): Promise<boolean> as a limit-1 range over entityByFile by repoId-prefix (never builds the entity list). Add it as an OPTIONAL field on the ScopeDeps interface (scope.ts:77-89) and implement it on REAL_DEPS. Widen ensureNonEmptyClosure's deps parameter type (invariants.ts:237) to also Pick 'repoHasAnyEntity', and change its body to prefer deps.repoHasAnyEntity(best.path) when supplied, falling back to today's deps.listEntitiesForRepo(best.path).length === 0 check otherwise. No existing ScopeDeps fixture needs to change, since the field is optional.

**Acceptance checks:**
- ac4: repoHasAnyEntity answers yes for a repo with stored entities and no for one with none, without calling listEntitiesForRepo or any function that builds the full entity list
- a deps fixture supplying both repoHasAnyEntity and listEntitiesForRepo fakes proves ensureNonEmptyClosure calls repoHasAnyEntity and never calls listEntitiesForRepo when the former is present
- ScopeNotIndexedError / pass-through outcome is driven entirely by repoHasAnyEntity's answer when it is supplied
- every one of the ~30 existing files constructing ScopeDeps-shaped object literals compiles and behaves unchanged without adding the new field

### 1.8 E20261101c2ba6fa6:S003:T008 — Add the migration step that backfills entityByFile for an existing on-disk store

Add a step on the existing migration chain that walks the entity table once per store and populates entityByFile for every row, guarded by a completion marker (following the existing migration chain's convention) so it does not re-run on a later open. Safe to re-run if interrupted, since a dupSort put of an already-present (key, value) pair is a no-op in LMDB.

**Acceptance checks:**
- ac2: a store built via the pre-Story raw-write path, opened twice, migrates entityByFile on the first open only; reads work correctly after migration without a re-index
- a daemon crash simulated mid-migration, followed by a fresh open, safely re-runs the migration without duplicate entries

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the new entityByFile LMDB table and its encode/decode key functions | `t1` |
| the new put/remove wrapper for entity rows | `t2` |
| listEntitiesForRepo (src/db/entities.ts:819) | `t6` |
| findEntitiesByFile (src/db/entities.ts:864) | `t6` |
| the new repo-for-absolute-file resolution helper | `t5` |
| a source-scanning guard test over src/db/entities.ts and src/db/graph/migrations.ts | `t4` |
| the migration step that populates entityByFile for a pre-existing store | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 dataModelChanges: entityByFile (new LMDB table)`
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges: entity row write/remove sites (invariant-change)`
- **[[c3]]** `prior-artifact` `LLD s3 errorPaths.invariantsToPreserve[0]`
- **[[c4]]** `prior-artifact` `LLD s3 errorPaths.errorCases[1]`
- **[[c5]]** `prior-artifact` `LLD s3 testStrategy level 2 (guard test)`
- **[[c6]]** `prior-artifact` `LLD s3 errorPaths.edgeCases[2] (nested repo roots)`
- **[[c7]]** `prior-artifact` `LLD s3 contractDetails.api[0] listEntitiesForRepo`
- **[[c8]]** `prior-artifact` `LLD s3 contractDetails.api[1] findEntitiesByFile`
- **[[c9]]** `prior-artifact` `LLD s3 contractDetails.api[2] repoHasAnyEntity`
- **[[c10]]** `prior-artifact` `LLD s3 dataModelChanges: ScopeDeps (field-add)`
- **[[c11]]** `prior-artifact` `LLD s3 migration.migrationSteps[8] (order 9)`
- **[[c12]]** `prior-artifact` `LLD s3 errorPaths.errorCases[2] (crash mid-migration)`
