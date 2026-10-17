<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-16T13:00:16.421Z  ·  **Updated:** 2026-10-16T16:46:20.693Z

**Commit:** 7225408a

## Summary

deleteUnresolvedRowInTxn delegates to the counted removePendingRowInTxn (row, by-file and by-target entries, class and reason counts in one transaction), so deleteUnresolvedForFile / ForRepoFile / ForRepo decrement what they remove; the two promotions already use the counted helper directly, so no removal is counted twice. updateUnresolvedMeta / updateUnresolvedMetaBatch merge meta, clear a stale candidates list on a class other than 'ambiguous', and move the count on a class or reason change. listUnresolvedRelations gains opts.awaiting, read through unresolved_by_target across repositories. Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t4-suites.md (db, indexer, daemon, analyze: 2261 tests, 2154 pass, 0 fail, 104 skipped; three falsifying mutations).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `.insrc/artifacts/CR-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `.insrc/artifacts/ISSUE-5437d6e54c9e7d48.json` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `.insrc/artifacts/LLD-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `.insrc/artifacts/PLAN-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `.insrc/artifacts/TESTS-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `.insrc/build-start/5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t1-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t2-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t3-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t4-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/ISSUE.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/BUILD.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/CR.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/LLD.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/PLAN.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/TESTS.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/cr-fixes-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t1-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t2-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t3-suites.md` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/__tests__/index-state.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/__tests__/relations-awaiting-target.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/__tests__/relations-lmdb.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/__tests__/relations-pending-upkeep.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/__tests__/lmdb-txn-semantics.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/__tests__/migrations.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/__tests__/write-txn-atomic.test.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/index-state-rows.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/pending-class.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/index-state.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/relations.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/db/repos.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-10-16T16:46:20.693Z)
