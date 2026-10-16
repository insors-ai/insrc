<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-16T13:00:16.421Z  ·  **Updated:** 2026-10-16T13:00:16.421Z

**Commit:** fcc6d7ab

## Summary

Three new sub-DBs (unresolved_by_target, export_names, index_state), SCHEMA_VERSION 5 and MIGRATION_V4_TO_V5 writing an IndexStateRow per workspace repository (fullIndexFinished false; pending counts recounted from the stored rows by their stored class, unattempted rows under 'awaiting-target'/reason 'unattempted'); removeRepo deletes the row in the same transaction as the registry row. The class rules and BOUNDARY_RELATION_KINDS live in src/db/graph/pending-class.ts (re-exported by the cross-file pass). A throwing step leaves nothing, now that the runner uses a child transaction (ISSUE-5437d6e5). Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t1-suites.md (src/db + src/indexer: 766 tests, 766 pass; two falsifying mutations).

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `.insrc/artifacts/CR-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `.insrc/artifacts/ISSUE-5437d6e54c9e7d48.json` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `.insrc/artifacts/LLD-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `.insrc/artifacts/PLAN-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `.insrc/artifacts/TESTS-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `.insrc/build-start/5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t1-suites.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/ISSUE.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/BUILD.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/CR.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/LLD.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/PLAN.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/TESTS.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/cr-fixes-suites.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t1-suites.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t2-suites.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t3-suites.md` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/__tests__/lmdb-txn-semantics.test.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/__tests__/migrations.test.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/__tests__/write-txn-atomic.test.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/pending-class.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/db/repos.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-10-16T13:00:16.421Z)
