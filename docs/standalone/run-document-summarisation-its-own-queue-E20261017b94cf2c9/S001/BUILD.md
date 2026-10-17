<!-- insrc:artifact BUILD-b94cf2c9058fd82a-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T13:31:05.601Z  ·  **Updated:** 2026-10-17T16:39:01.622Z

**Commit:** 20d952bb

## Summary

DaemonStatus gains optional queueLanes (QueueLanes in src/shared/types.ts); DaemonStatusSources gains an optional queueLanes source that buildDaemonStatus copies, absent when no source is given. The daemon builds it with composeQueueLanes(queue.laneStatus(), indexer.summarySweepProgress()); queueDepth stays the total. CLAUDE.md and AGENTS.md record the concurrent-lane exception to serial model calls with its revisit condition. Five mutations each fail the new test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-c2ba6fa62a148ed1-10.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/AMD-c2ba6fa62a148ed1-8.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/AMD-c2ba6fa62a148ed1-9.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/BUILD-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/BUILD-bd1c6c9005ff6390-S001.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/CR-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/CR-bd1c6c9005ff6390-S001.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/DEF-c2ba6fa62a148ed1.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/EXT-c2ba6fa62a148ed1-s12.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/EXT-c2ba6fa62a148ed1-s13.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/ISSUE-6dbf14435972af7a.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/PLAN-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `.insrc/artifacts/TESTS-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `AGENTS.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `CLAUDE.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S013/EXT.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/BUILD.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/T008-build-evidence.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/TESTS.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/consumer-contract.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/consumer-fixtures-v1.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/standalone/present-every-artifact-awaiting-decision-buttons-E202610176dbf1443/ISSUE.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/standalone/record-calls-made-module-level-statements-E20261017bd1c6c90/S001/BUILD.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/standalone/record-calls-made-module-level-statements-E20261017bd1c6c90/S001/CR.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `docs/standalone/run-document-summarisation-its-own-queue-E20261017b94cf2c9/S001/CR.md` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/__tests__/daemon-status-lanes.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/daemon/understanding-rpc.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/indexer/__tests__/summary-sweep-progress.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/shared/understanding.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/__tests__/acceptance.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/__tests__/contracts.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/__tests__/fixtures/crash-writer.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/__tests__/service.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/privacy.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/roles.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/service.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `src/understanding/storage.ts` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-17T16:39:01.622Z)
