<!-- insrc:artifact TESTS-61045de91faef1a0-s1 -->

# Tests: 61045de91faef1a0 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 30 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T15:42:53.248Z on commit `85887da0b`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: File/repository index key encoding and long Unicode path support**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | file membership keys preserve exact path representation and support long Unicode paths | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |
| pass | populated v5 startup backfills exact file/repo memberships in u64 order without rewriting entities | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |

**integration: Schema-v5 backfill, rollback after partial writes, retry and reopen idempotence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | populated v5 startup backfills exact file/repo memberships in u64 order without rewriting entities | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |
| pass | partial membership backfill failure rolls back both indexes and version then retries on reopen | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |
| pass | unregistered migration rows fail without allocating registry membership or changing schema | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |

**integration: Current-version compatibility and historical migrations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fresh schema6 has empty usable memberships and sufficient named database capacity | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |
| pass | re-open with stored > expected hard-fails with LmdbStoreSchemaVersionMismatch | `src/db/graph/__tests__/operational.test.ts` |
| pass | a v4 store opened by this code is at the current version with one IndexStateRow per workspace repository, not complete, its pending counts recounted from the stored rows | `src/db/graph/__tests__/migration-v4-to-v5.test.ts` |
| pass | a v5 store opened with this build has an empty doc_summary_carry and current schema version | `src/db/__tests__/doc-summary-carry.test.ts` |
| pass | Complete namespace inventory opens fresh and existing stores without data loss | `src/understanding/__tests__/storage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/doc-summary-carry.test.ts` | 0 | 10 | 0.6 s |  |
| `src/db/graph/__tests__/migration-v4-to-v5.test.ts` | 0 | 4 | 0.5 s |  |
| `src/db/graph/__tests__/migration-v5-to-v6.test.ts` | 0 | 5 | 0.5 s |  |
| `src/db/graph/__tests__/operational.test.ts` | 0 | 11 | 0.5 s |  |
| `src/understanding/__tests__/storage.test.ts` | 0 | 2 | 0.6 s |  |

## t2

Run at 2026-10-24T15:46:09.977Z on commit `2cce1be89`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Transactional entity membership mutation matrix**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | all entity mutations preserve exact file and repo membership without duplicates | `src/db/__tests__/entity-memberships.test.ts` |
| pass | shared module ensure-exists writes retain their reserved-repository memberships | `src/db/__tests__/entity-memberships.test.ts` |

**integration: Row and membership rollback on injected write failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failed membership write rolls back authoritative rows and both indexes | `src/db/__tests__/entity-memberships.test.ts` |

**integration: Strict repository registration remains enforced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unregistered writes leave registry rows and memberships unchanged | `src/db/__tests__/entity-memberships.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entity-memberships.test.ts` | 0 | 4 | 0.6 s |  |

## t3

Run at 2026-10-24T15:51:47.463Z on commit `7103a92b9`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Scoped queries, collectors and reindex snapshots avoid full scans and unrelated row reads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scoped reads, deletion collectors and reindex snapshots never scan the entity table | `src/db/__tests__/entity-scope-indexes.test.ts` |

**integration: Exact contents/u64 order, snapshot consistency and forced digest collision filtering**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | indexed entity contents and ordering match an authoritative row-scan oracle | `src/db/__tests__/entity-scope-indexes.test.ts` |
| pass | exact file checks filter forced digest collisions and support long Unicode paths | `src/db/__tests__/entity-scope-indexes.test.ts` |
| pass | index iteration and authoritative rows share a pinned snapshot across a committed write | `src/db/__tests__/entity-scope-indexes.test.ts` |

**integration: Dangling membership references report corruption**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dangling membership rows, missing string IDs and missing registry roots fail visibly | `src/db/__tests__/entity-scope-indexes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entity-scope-indexes.test.ts` | 0 | 5 | 0.5 s |  |

## t4

Run at 2026-10-24T15:56:12.555Z on commit `50563f003`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: First-match readiness reads at most one authoritative entity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | first-match repository readiness reads only one authoritative entity and preserves default results | `src/db/__tests__/entity-scope-indexes.test.ts` |
| pass | symbol readiness fallback requests only the first repository entity | `src/analyze/context/__tests__/scope.test.ts` |
| pass | ensureNonEmptyClosure: given readers it reads the registry and the entities through them, not the real store | `src/analyze/context/__tests__/invariants.test.ts` |

**integration: Indexed per-file code-review watermark compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real review watermarks use indexed file entities and isolate repository timestamps | `src/db/__tests__/entity-scope-indexes.test.ts` |

**integration: Affected analyze/review/storage regression suites**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | indexed entity contents and ordering match an authoritative row-scan oracle | `src/db/__tests__/entity-scope-indexes.test.ts` |
| pass | freshness: a changed file whose per-file indexedAt predates its mtime is stale | `src/workflow/code-review/__tests__/freshness.test.ts` |
| pass | populated v5 startup backfills exact file/repo memberships in u64 order without rewriting entities | `src/db/graph/__tests__/migration-v5-to-v6.test.ts` |
| pass | a v4 store opened by this code is at the current version with one IndexStateRow per workspace repository, not complete, its pending counts recounted from the stored rows | `src/db/graph/__tests__/migration-v4-to-v5.test.ts` |
| pass | re-open with stored > expected hard-fails with LmdbStoreSchemaVersionMismatch | `src/db/graph/__tests__/operational.test.ts` |
| pass | a v5 store opened with this build has an empty doc_summary_carry and current schema version | `src/db/__tests__/doc-summary-carry.test.ts` |
| pass | all entity mutations preserve exact file and repo membership without duplicates | `src/db/__tests__/entity-memberships.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/invariants.test.ts` | 0 | 18 | 0.5 s |  |
| `src/analyze/context/__tests__/scope.test.ts` | 0 | 9 | 0.5 s |  |
| `src/db/__tests__/doc-summary-carry.test.ts` | 0 | 10 | 0.7 s |  |
| `src/db/__tests__/entity-memberships.test.ts` | 0 | 4 | 0.5 s |  |
| `src/db/__tests__/entity-scope-indexes.test.ts` | 0 | 7 | 0.5 s |  |
| `src/db/graph/__tests__/migration-v4-to-v5.test.ts` | 0 | 4 | 0.4 s |  |
| `src/db/graph/__tests__/migration-v5-to-v6.test.ts` | 0 | 5 | 0.5 s |  |
| `src/db/graph/__tests__/operational.test.ts` | 0 | 11 | 0.5 s |  |
| `src/workflow/code-review/__tests__/freshness.test.ts` | 0 | 9 | 0.3 s |  |
