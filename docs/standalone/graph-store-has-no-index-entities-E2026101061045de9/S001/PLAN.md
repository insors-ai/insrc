<!-- insrc:artifact PLAN-61045de91faef1a0-s1 -->

# Plan: STORY-61045de91faef1a0-s1

## Summary

**Epic:** `graph-store-has-no-index-entities`
**LLD run:** `wf-1792849676188-clfw2b`
**LLD effective hash:** `bbd8079bf4b9...`

Four dependent tasks add transactional entity file/repository indexes and safe schema6 backfill, maintain every entity mutation, replace scoped scans and update readiness/freshness consumers. Existing identities, registry contracts, exact results and ordering remain intact.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add membership indexes and atomic schema6 backfill | M | — | — | integration: File/repository index key encoding and long Unicode path support; integration: Schema-v5 backfill, rollback after partial writes, retry and reopen idempotence; integration: Current-version compatibility and historical migrations | [[c1]] [[c3]] [[c4]] [[c5]] |
| 2 | **`t2`** Maintain membership on every entity mutation | M | — | `t1` | integration: Transactional entity membership mutation matrix; integration: Row and membership rollback on injected write failure; integration: Strict repository registration remains enforced | [[c1]] [[c2]] [[c4]] [[c6]] |
| 3 | **`t3`** Replace scoped scans with indexed reads | M | — | `t2` | integration: Scoped queries, collectors and reindex snapshots avoid full scans and unrelated row reads; integration: Exact contents/u64 order, snapshot consistency and forced digest collision filtering; integration: Dangling membership references report corruption | [[c1]] [[c2]] [[c4]] [[c6]] |
| 4 | **`t4`** Use first-match readiness and indexed review watermarks | S | — | `t3` | integration: First-match readiness reads at most one authoritative entity; integration: Indexed per-file code-review watermark compatibility; integration: Affected analyze/review/storage regression suites | [[c1]] [[c4]] [[c7]] |

### 1.1 TASK-61045de91faef1a0-s1-t1 — Add membership indexes and atomic schema6 backfill

Add file/repo dupsort handles and binary/digest keys; verify named DB capacity. Backfill authoritative v5 rows atomically with registry validation, rollback/retry and version stamping only on success. Update current-version assertions; retain historical fixtures. Use genuine raw v5 fixtures and fail after partial membership insertion.

**Acceptance checks:**
- Fresh/populated v5 migration yields exact memberships without reindex.
- Partial migration failure rolls back data/version and retries on reopen.
- Reopen is idempotent and unsupported-version refusal remains.

### 1.2 TASK-61045de91faef1a0-s1-t2 — Maintain membership on every entity mutation

Inventory puts/removes and reconcile old/new memberships in authoritative transactions for upsert, file/repo moves, reindex, embedding rewrite and deletion. Preserve registry/name/edge/vector invariants.

**Acceptance checks:**
- Mutation oracle covers insert/update/move/reindex/embedding and ID/file/repo deletion.
- Injected transaction failure rolls back row and memberships.
- Unregistered writes refuse without registry allocation.

### 1.3 TASK-61045de91faef1a0-s1-t3 — Replace scoped scans with indexed reads

Use exact-key candidates for file/repo reads, grouped files, deletion collectors and reindex snapshots. Resolve authoritative rows in consistent snapshots; preserve exact path equality and u64 ordering and report dangling-index corruption. Explicitly verify snapshot consistency, forced digest collisions and row-access bounds.

**Acceptance checks:**
- Scoped operations work when entity.getRange throws and do not read unrelated rows.
- Outputs/order match authoritative oracle.
- Unicode/long paths and forced digest collision preserve exact matching; dangling references error.

### 1.4 TASK-61045de91faef1a0-s1-t4 — Use first-match readiness and indexed review watermarks

Add limit:1 repository existence mode and compatible scope/invariants seams; use indexed file entities for review freshness. Run affected storage, migration, analyze and review compatibility suites.

**Acceptance checks:**
- Readiness requests and reads at most the first valid indexed row.
- Per-file freshness watermark preserves meaning without full scans.
- Affected suites and strict typecheck pass.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| File-key hashing is deterministic for the existing absolute-path representation and supports long Unicode paths. | `t1`, `t3` |
| Repository keys and entity-u64 dupsort values preserve isolation and result order. | `t1`, `t3` |
| A forced file-key digest collision still returns only rows with the exact requested absolute path. | `t1`, `t3` |
| Insert, same-ID update, file/repo move, reindex replacement, embedding-only update, delete by ID/file/repo all match an authoritative fixture oracle. | `t2`, `t3`, `t4` |
| An injected transaction failure rolls back both row and index membership changes. | `t2`, `t3`, `t4` |
| Compare file/repo reads and grouped file lists to pre-change content/order. | `t2`, `t3`, `t4` |
| Repository existence requests limit:1 and reads at most the first matching authoritative entity. | `t2`, `t3`, `t4` |
| Code-review per-file watermark uses indexed file entities. | `t2`, `t3`, `t4` |
| After setup/backfill, replace entity.getRange with a throwing spy; file/repo lookups, deletion collectors, file reindex snapshots and readiness checks still work. | `t2`, `t3`, `t4` |
| Count entity.get calls to show unrelated rows are not read. | `t2`, `t3`, `t4` |
| Unregistered repo writes remain refused and never create registry rows. | `t2`, `t3`, `t4` |
| Open a populated v5 fixture, backfill on startup and verify exact file/repo results without invoking the indexer. | `t1` |
| Inject failure after partial backfill; reopen at version 5 with no partial committed index and retry successfully. | `t1` |
| Fresh v6 store starts with empty usable indices; a second reopen does not rebuild them. | `t1` |
| Existing unsupported-version refusal remains in force. | `t1` |
| Run doc-summary-carry, migration-v4-to-v5 and operational suites: latest-version expectations follow v6, while explicit historical migration fixtures still prove their original transitions. | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/graph-store-has-no-index-entities-E2026101061045de9/S001/LLD.md#3-data-model-changes`
- **[[c2]]** `prior-artifact` `docs/standalone/graph-store-has-no-index-entities-E2026101061045de9/S001/LLD.md#2-contract-details`
- **[[c3]]** `prior-artifact` `docs/standalone/graph-store-has-no-index-entities-E2026101061045de9/S001/LLD.md#7-migration`
- **[[c4]]** `prior-artifact` `docs/standalone/graph-store-has-no-index-entities-E2026101061045de9/S001/LLD.md#6-test-strategy`
- **[[c5]]** `code` `src/db/graph/store.ts:138`
- **[[c6]]** `code` `src/db/entities.ts`
- **[[c7]]** `code` `src/workflow/code-review/freshness.ts`
