<!-- insrc:artifact BUILD-b94cf2c9058fd82a-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T13:31:05.601Z  ·  **Updated:** 2026-10-17T13:53:06.888Z

**Commit:** fb2c43f6

## Summary

runDocSummarySweep checks shouldStop before each document, after each single-document job and at the end (so a stop during the last document is reported as stopped, fixed after the gate's first verdict), runs queued single-document jobs first, re-reads each document, classifies results and reports progress. docSummariseRepo owns summarySweepProgress (cleared in finally); the sweep and single-document summaries go through the protected summariseEntity step. Fourteen mutations each fail the tests.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `.insrc/artifacts/PLAN-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `.insrc/artifacts/TESTS-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/BUILD.md` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/T008-build-evidence.md` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/TESTS.md` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/consumer-contract.md` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/consumer-fixtures-v1.json` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/daemon/understanding-rpc.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/indexer/__tests__/summary-sweep-progress.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/shared/understanding.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/__tests__/acceptance.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/__tests__/contracts.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/__tests__/fixtures/crash-writer.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/__tests__/service.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/privacy.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/roles.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/service.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `src/understanding/storage.ts` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-17T13:53:06.888Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-17T13:53:06.888Z)
