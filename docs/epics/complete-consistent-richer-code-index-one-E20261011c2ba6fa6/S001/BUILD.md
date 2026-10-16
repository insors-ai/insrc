<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-16T13:00:16.421Z  ·  **Updated:** 2026-10-16T16:27:42.080Z

**Commit:** 73c86f8b

## Summary

IndexState (sc1 with reasonCounts): src/db/graph/index-state-rows.ts holds the helpers that run inside an open write transaction (movePendingInTxn by class and reason, countUnwritableInTxn per repository or daemon-wide in meta 'unattributed_unwritable', advanceGenerationInTxn) and reconcileIndexStateInTxn, run at store open in a child transaction (corrects a differing row with a warn log, deletes the row of an unregistered repoId); src/db/index-state.ts holds readIndexState, deriveIndexState (the sc1 formula), readUnattributedUnwritable and completenessOf (one reason line per cause, awaiting split by reason). Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t2-suites.md (db, indexer, daemon: 1063 tests, 1051 pass, 0 fail, 12 live-gated skips; two falsifying mutations).

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `.insrc/artifacts/CR-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `.insrc/artifacts/ISSUE-5437d6e54c9e7d48.json` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `.insrc/artifacts/LLD-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `.insrc/artifacts/PLAN-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `.insrc/artifacts/TESTS-5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `.insrc/build-start/5437d6e54c9e7d48-S001.json` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t1-suites.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t2-suites.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/ISSUE.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/BUILD.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/CR.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/LLD.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/PLAN.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/TESTS.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/cr-fixes-suites.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t1-suites.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t2-suites.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t3-suites.md` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/__tests__/index-state.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/__tests__/lmdb-txn-semantics.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/__tests__/migrations.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/__tests__/write-txn-atomic.test.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/index-state-rows.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/pending-class.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/index-state.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/db/repos.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-10-16T16:27:42.080Z)
