<!-- insrc:artifact BUILD-dced43851723554f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T11:35:11.055Z  ·  **Updated:** 2026-10-18T12:11:49.431Z

**Commit:** 75e62369

## Summary

restoreDocSummariesFromBackup validates the path, opens the backup read-only as a single-file store (noSubdir explicit, fixed in 75e62369 after the gate found lmdb-js guesses it from the extension), checks its databases, writes each row through writeDocSummaryIfCurrentInTxn with onlyIfAbsent in batches of 500 and closes the backup in a finally; the daemon IPC docSummary.restoreFromBackup calls it. Commits ea822927 and 75e62369; eight falsifying mutations each fail a test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-dced43851723554f-S001.json` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/PLAN.md` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/er-model.html` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/daemon/__tests__/doc-summary-restore-ipc.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/db/__tests__/doc-summary-restore.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/db/__tests__/entities-return-to-pending.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/db/index-state.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/indexer/__tests__/full-index-rebuild.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-18T12:11:49.431Z)
