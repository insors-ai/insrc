<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-11-14T13:08:41.465Z  ·  **Updated:** 2026-11-14T16:33:15.215Z

**Commit:** dc36dd201

## Summary

Live checks run with INSRC_LIVE_TESTS=1: the Redis listing test passed against a real Redis 8.0.5 on port 6344 and the live search test passed; both outputs are in docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S004/SWEEP.md. The full-sweep result is recorded in the same file and is PARTIAL: src/analyze 1404 tests with 2 failures and the db/indexer/mcp/agent/config group 1900 tests with 45 failures, all failures in another session's uncommitted review/daemon work; src/workflow, the rest of src/daemon, shared/cli/steps did not finish inside the tool time limit.

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
- ✗ `t12`
- ✓ `t13`
- ✗ `t14`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/partly-read.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/item-measure.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/failed-lookups.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/completeness-facts.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/config-trace.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/search-text.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/module-profile-entrypoint.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/__tests__/adherence-check-body.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/code/adherence-check.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/data/adherence-check.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/docs/discovery-inventory.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/docs/family-summarise.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/adherence-check.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/summariser/__tests__/summariser-body.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/convention-detect.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/data-model-trace.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/manifests-locate.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/symbol-locate.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/test-locate.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/docs-retrieval.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/docs/__tests__/docs-area-retrieval.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/docs/__tests__/docs-area-vector.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/docs/constraint-enumerate.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/docs/decision-trace.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/shared/adherence-topic-constraints.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/daemon/db/__tests__/kv-common.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/discovery-families.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/inventory-ci.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/inventory-docker.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/inventory-helm.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/inventory-kubernetes.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/infra/inventory-terraform.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/context/__tests__/decompose-params.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/context/__tests__/decompose-prompt-limits.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/context/__tests__/round1-handling.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/cache-area-isolation.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/exploration-cache-scope.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/params-schema.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/removed-flags.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/exploration-cache-key.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/params-schema.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/planner/__tests__/templates.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/planner/templates/docs/index.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/planner/templates/shared-schemas.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/db/exploration-cache.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/prompts/analyze/decompose.system.md` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/context/__tests__/partition-combine.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/orchestrator/__tests__/run-report.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `docs/daemon.md` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/__tests__/analyzer-docs-limits.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/analyze/explore/__tests__/search-text-live.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `src/daemon/db/__tests__/redis-etcd-live.test.ts` — **insrc-build** (2026-11-14T16:33:15.215Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S004/SWEEP.md` — **insrc-build** (2026-11-14T16:33:15.215Z)
