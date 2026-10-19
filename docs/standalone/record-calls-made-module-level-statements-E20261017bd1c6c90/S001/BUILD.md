<!-- insrc:artifact BUILD-bd1c6c9005ff6390-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T09:39:24.421Z  ·  **Updated:** 2026-10-17T16:09:26.777Z

**Commit:** b9147a20

## Summary

An integration test indexes a two-file TypeScript fixture through the indexer's own per-file steps (real parser, resolveRelations, store writes; no embedding) and the real cross-file resolver over a temporary graph store, then runs assembleCodeReviewGrounding with realGroundingDeps: the test file's entity is the imported function's only caller and its testsReaching entry. Undoing the t1 program-statement scan, making isTestFile return false, or skipping the cross-file resolver each fails it.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-c2ba6fa62a148ed1-8.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/BUILD-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/BUILD-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/CR-bd1c6c9005ff6390-S001.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/DEF-670419c4ad8bea8e.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/DEF-c2ba6fa62a148ed1.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/EXT-c2ba6fa62a148ed1-s13.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/HLD-670419c4ad8bea8e.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/ISSUE-487ad7a67474d321.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/LLD-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/LLD-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/PLAN-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/PLAN-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/PLAN-bd1c6c9005ff6390-S001.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/TESTS-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/artifacts/TESTS-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `.insrc/build-start/b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `AGENTS.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `CLAUDE.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S013/EXT.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/DEF.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/HLD.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/BUILD.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/LLD.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/PLAN.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/T001-build-evidence.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/T008-build-evidence.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/TESTS.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/consumer-contract.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/consumer-fixtures-v1.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/identity-sources.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/review-round-1.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/review-round-2.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/sequence-diagram.html` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/standalone/record-calls-made-module-level-statements-E20261017bd1c6c90/S001/CR.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/standalone/run-document-summarisation-its-own-queue-E20261017b94cf2c9/S001/BUILD.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/standalone/run-document-summarisation-its-own-queue-E20261017b94cf2c9/S001/LLD.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/standalone/run-document-summarisation-its-own-queue-E20261017b94cf2c9/S001/PLAN.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/standalone/run-document-summarisation-its-own-queue-E20261017b94cf2c9/S001/TESTS.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `docs/standalone/send-codex-only-schema-keywords-strict-E20261017487ad7a6/ISSUE.md` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/__tests__/daemon-status-lanes.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/daemon/understanding-rpc.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/indexer/__tests__/summary-sweep-progress.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/indexer/__tests__/test-callers-reach-grounding.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/indexer/parser/typescript.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/shared/understanding.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/__tests__/acceptance.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/__tests__/contracts.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/__tests__/fixtures/crash-writer.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/__tests__/identity.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/__tests__/service.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/identity.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/privacy.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/roles.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/service.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/understanding/storage.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/workflow/code-review/__tests__/grounding.test.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-17T16:09:26.777Z)
