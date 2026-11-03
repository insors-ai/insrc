<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s3 -->

# Tests: c2ba6fa62a148ed1 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 20 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T06:05:36.818Z on commit `f054482bb`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: encodeEntityByFileKey/decodeEntityByFileKey round-trip a (repoId, filePath) pair, including an empty filePath, byte-identical to the input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t1: encodeEntityByFileKey/decodeEntityByFileKey round-trip (repoId, filePath), including an empty filePath | `src/db/__tests__/entities-lmdb.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entities-lmdb.test.ts` | 0 | 41 | 12.7 s |  |

## t2

Run at 2026-11-01T06:08:08.442Z on commit `f054482bb`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the wrapper's put path writes the entity row, nameIndex entry, and entityByFile entry atomically in one transaction; create/replace/delete through the wrapper keeps all three tables consistent at every step**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2: the put/remove wrapper keeps entity, nameIndex and entityByFile consistent across create, replace and delete | `src/db/__tests__/entities-lmdb.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entities-lmdb.test.ts` | 0 | 41 | 36.9 s |  |

## t3

Run at 2026-11-01T06:14:44.106Z on commit `711a7988b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: every one of the 7 pre-existing call-site behaviors (create, replace, delete, migration rewrite, migration delete) is unchanged after routing through the wrapper -- existing entities.ts/migrations.ts test suites pass unmodified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | upsertEntities + getEntity round-trip | `src/db/__tests__/entities-lmdb.test.ts` |
| pass | upsert overwrites a non-module entity | `src/db/__tests__/entities-lmdb.test.ts` |
| pass | deleteEntitiesForFile removes only that file's entities | `src/db/__tests__/entities-lmdb.test.ts` |
| pass | v2->v3: rewires Java module entity to jvm namespace + recomputes string ID | `src/db/graph/__tests__/migration-v2-to-v3.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entities-lmdb.test.ts` | 0 | 41 | 11 s |  |
| `src/db/graph/__tests__/migration-v2-to-v3.test.ts` | 0 | 6 | 2.6 s |  |

## t4

Run at 2026-11-01T06:20:59.231Z on commit `711a7988b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a source-scanning guard test over entities.ts and migrations.ts passes against the real post-t3 source and fails when a raw entity.put/entity.remove/nameIndex.put/nameIndex.remove is introduced outside the wrapper's own file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 guard: every entity.put/entity.remove/nameIndex.put/nameIndex.remove/entityByFile.put/entityByFile.remove call in entities.ts and migrations.ts is inside the wrapper (or the one documented, entity-row-free exemption) | `src/db/__tests__/entities-lmdb.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entities-lmdb.test.ts` | 0 | 41 | 7.1 s |  |

## t5

Run at 2026-11-01T06:21:55.696Z on commit `711a7988b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the repo-for-absolute-file resolution helper picks the longest matching root for nested repo roots, and resolves to no repo for an unmatched path, using a path-segment-boundary comparison**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t5: an absolute file path under a repo root nested inside another repo root resolves to the more specific (nested) root | `src/db/__tests__/entities-lmdb.test.ts` |
| pass | t5: an absolute path matching no registered repo root resolves to no repo, not a false match | `src/db/__tests__/entities-lmdb.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entities-lmdb.test.ts` | 0 | 41 | 7.6 s |  |

## t6

Run at 2026-11-01T06:24:03.314Z on commit `711a7988b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: findEntitiesByFile on one file of the smaller of two indexed repos returns the same entities as a full-scan baseline, touching only that file's rows (ac1)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac1: findEntitiesByFile on one file of the smaller of two indexed repos returns the same entities as a full-scan baseline, touching only that file's rows | `src/db/__tests__/entities-lmdb.test.ts` |

**unit: write, replace, then delete a file's entities in sequence; findEntitiesByFile after each step matches a full-scan-equivalent baseline every time (ac3)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac3: write, replace, then delete a file's entities in sequence; findEntitiesByFile after each step matches a full-scan-equivalent baseline every time | `src/db/__tests__/entities-lmdb.test.ts` |

**unit: an entity with an empty filePath is excluded from findEntitiesByFile but included in listEntitiesForRepo**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an entity with an empty filePath (external endpoint) is excluded from findEntitiesByFile but included in listEntitiesForRepo | `src/db/__tests__/entities-lmdb.test.ts` |

**unit: two repos sharing the same relative file path never cross-contaminate a file-scoped read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two repos sharing the same relative file path never cross-contaminate a file-scoped read | `src/db/__tests__/entities-lmdb.test.ts` |

**unit: listEntitiesForRepo returns [] for a repo with zero stored entities, identical to today's full-scan behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | listEntitiesForRepo returns [] for a repository with zero stored entities, identical to today's full-scan behavior | `src/db/__tests__/entities-lmdb.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entities-lmdb.test.ts` | 0 | 41 | 9.8 s |  |

## t7

Run at 2026-11-01T06:25:34.012Z on commit `b0411102b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repoHasAnyEntity answers yes for a repo with stored entities and no for one with none, without calling listEntitiesForRepo or building the full entity list (ac4)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t7/ac4: repoHasAnyEntity answers yes for a repo with stored entities and no for one with none, without building the entity list | `src/db/__tests__/entities-lmdb.test.ts` |

**unit: a deps fixture supplying both repoHasAnyEntity and listEntitiesForRepo fakes proves ensureNonEmptyClosure prefers repoHasAnyEntity and never calls listEntitiesForRepo when it is present, with ScopeNotIndexedError driven by repoHasAnyEntity's answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureNonEmptyClosure: with both repoHasAnyEntity and listEntitiesForRepo supplied, it calls repoHasAnyEntity and never listEntitiesForRepo | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: repoHasAnyEntity answering false throws ScopeNotIndexedError, driven entirely by its own answer | `src/analyze/context/__tests__/invariants.test.ts` |

**unit: ensureNonEmptyClosure falls back to the existing listEntitiesForRepo-based check unchanged when deps.repoHasAnyEntity is absent, proving the ~30 existing ScopeDeps fixtures keep compiling and behaving unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureNonEmptyClosure: without repoHasAnyEntity supplied, the ~30 existing ScopeDeps-shaped fixtures keep behaving via the listEntitiesForRepo fallback, unchanged | `src/analyze/context/__tests__/invariants.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/invariants.test.ts` | 0 | 21 | 2.4 s |  |
| `src/db/__tests__/entities-lmdb.test.ts` | 0 | 41 | 6.9 s |  |

## t8

Run at 2026-11-01T06:28:01.177Z on commit `b0411102b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a store built via the pre-Story raw-write path (entity rows with no entityByFile), opened twice, migrates entityByFile on the first open only; reads work correctly after migration without a re-index (ac2)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac2: a store built via the pre-Story raw-write path (no entity_by_file), opened twice, migrates on the first open only; reads work without a re-index | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |

**integration: a store with entityByFile only partially populated (simulating a crash mid-migration), reopened, safely re-runs the migration to completion with no duplicate entries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a daemon crash simulated mid-migration (entity_by_file partially populated), followed by a fresh open, safely re-runs the migration without duplicate entries | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/migration-v5-to-v6.test.ts` | 0 | 2 | 1.1 s |  |
