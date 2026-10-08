<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T08:20:42.479Z

**Commit:** 11f8cb66

## Summary

Tasks t1 to t11 of 17 built. RUNTIME CATCH CLAUSES (task t11): the count is settled at 15 in 11 files. Expected, named under skipped (12): code/structure-module-tree.ts 1 (a file's imports cannot be read from the graph); data/schema-table.ts 1 (a table's indexes cannot be listed); infra/_shared.ts 1 (a directory below the walk root cannot be read; the root itself rethrows); infra/discovery-families.ts 1 (a YAML file cannot be read to classify it); infra/inventory-ci.ts 1; infra/inventory-docker.ts 2 (Dockerfile, compose); infra/inventory-helm.ts 2 (Chart.yaml, values); infra/inventory-kubernetes.ts 1; infra/inventory-terraform.ts 2 (read, parse). Rethrow (3): shared/adherence.ts 1 (the judging model call; it used to return every constraint as a missing implementation); shared/aggregator.ts 2 (the model call, the prompt file). LOOKUP CATCH CLAUSES (task t7, 25 at design time). Removed, class rethrow (14): search-text.ts 1; config-trace.ts 1; db-connections-list.ts 1; db-tables-list.ts 4; db-table-describe.ts 5; module-profile.ts 2. Remaining (11 plus 1 new): capability-reuse-check.ts — judging model call: rethrow with the candidates; a candidate's profile cannot be read: expected, skipped. concept-resolve.ts — directory unreadable: expected below the root (skipped), rethrow at the root; entry cannot be stat-ed: expected (skipped). doc-constraint-enumerate.ts, doc-decision-trace.ts — model call: rethrow with the retrieved sections. freeform-probe.ts — loop error: rethrow, the turn limit with the tool results. manifests-locate.ts — content not valid YAML: expected (skipped), two clauses. module-profile.ts — path cannot be stat-ed: rethrow; child cannot be stat-ed: expected (skipped); indexed file gone: expected (skipped). Tests for t11: three, one of which counts the clauses in the source against the table; nine mutations each make a test fail; analyze and mcp suites pass (1,293 of 1,385, the rest skipped).

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`
- ✗ `t8`
- ✗ `t9`
- ✗ `t10`
- ✗ `t11`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/context/__tests__/freeform-fallback.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/context/live-project-context.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/docs-retrieval.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/__tests__/failed-lookups.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/__tests__/partly-read.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/__tests__/removed-flags.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/completeness-facts.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/config-trace.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/convention-detect.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/data-model-trace.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/index.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/item-measure.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/lookup-failed.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/manifests-locate.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/search-text.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/symbol-locate.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/test-locate.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/code/adherence-check.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/code/aggregate-report.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/code/discovery-entrypoints.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/code/discovery-modules.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/code/structure-module-tree.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/code/surface-functional.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/data/adherence-check.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/data/aggregate-report.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/data/discovery-connections.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/data/schema-table.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/docs/aggregate-report.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/docs/constraint-enumerate.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/docs/decision-trace.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/docs/discovery-inventory.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/docs/family-summarise.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/generic/aggregate-report.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/adherence-check.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/aggregate-report.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/discovery-families.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/inventory-ci.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/inventory-docker.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/inventory-helm.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/inventory-kubernetes.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/infra/inventory-terraform.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/db/exploration-cache.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/mcp/__tests__/analyze-step-failed-lookup.test.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/prompts/analyze/synthesize.adherence.system.md` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/prompts/analyze/synthesize.capability.system.md` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/prompts/analyze/synthesize.code.system.md` — **insrc-build** (2026-10-08T08:20:42.479Z)
- `src/prompts/analyze/synthesize.data.system.md` — **insrc-build** (2026-10-08T08:20:42.479Z)
