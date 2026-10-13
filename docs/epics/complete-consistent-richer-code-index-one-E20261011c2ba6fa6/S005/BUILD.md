<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T19:41:57.790Z

**Commit:** 96d4c105

## Summary

Shipped s5: the installed daemon was updated to e5e374b5 and restarted with no store migration and no re-index. Smoke 1 first failed on the step tool (it announced XL for an unindexed path), fixed as ISSUE-7c255f61, then passed; smoke 2 and 3 passed on a reindex of AFM. Results in S005/smoke.md.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`
- ✓ `t13`
- ✓ `t14`
- ✓ `t15`
- ✓ `t16`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-7c255f612a40e0eb-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/BUILD-c9d0c355d4719346-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/CR-7c255f612a40e0eb-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/CR-c2ba6fa62a148ed1-s5.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/CR-c9d0c355d4719346-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/ISSUE-0c845762241ba26c.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/ISSUE-61045de91faef1a0.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/ISSUE-7c255f612a40e0eb.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/ISSUE-83c85f38afad7843.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/ISSUE-c9d0c355d4719346.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/TESTS-7c255f612a40e0eb-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/artifacts/TESTS-c9d0c355d4719346-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/build-start/7c255f612a40e0eb-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `.insrc/build-start/c9d0c355d4719346-S001.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S005/CR.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S005/smoke.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/ISSUE.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/refuse-docs-request-scope-index-does-E202610130c845762/ISSUE.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/refuse-unindexed-scope-analyze-step-tool-E202610137c255f61/ISSUE.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/refuse-unindexed-scope-analyze-step-tool-E202610137c255f61/S001/BUILD.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/refuse-unindexed-scope-analyze-step-tool-E202610137c255f61/S001/CR.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/refuse-unindexed-scope-analyze-step-tool-E202610137c255f61/S001/TESTS.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/release-review-wait-timer-when-transport-E20261013c9d0c355/ISSUE.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/release-review-wait-timer-when-transport-E20261013c9d0c355/S001/BUILD.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/release-review-wait-timer-when-transport-E20261013c9d0c355/S001/CR.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `docs/standalone/release-review-wait-timer-when-transport-E20261013c9d0c355/S001/TESTS.md` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/agent/providers/ollama.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/__tests__/driver-unit.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/schema.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/live-runs.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/orchestrator.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/run-order.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/scope-before-plan.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/shaper-causes.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/planner/__tests__/driver-unit.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/analyze/runtimes/shared/task-scope.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/__tests__/analyze-run-empty-prompt.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/__tests__/helpers/seeded-daemon.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/__tests__/search-filter.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/__tests__/search-guard-rule.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/__tests__/search-guard.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/__tests__/search-request-contract.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/search-guard.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/steps/__tests__/analyze-step-scope.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/steps/__tests__/repo-indexing-steps.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/steps/__tests__/scope-not-indexed-steps.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/steps/analyze-step/handler.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/steps/analyze-step/scope.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/tools/builtins/graph/__tests__/graph-guard.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/daemon/tools/builtins/graph/index.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/db/graph/__tests__/codec.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/db/repos.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/indexer/__tests__/index-run-record.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/indexer/run-record.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-13T19:41:57.790Z)
- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T19:41:57.790Z)
