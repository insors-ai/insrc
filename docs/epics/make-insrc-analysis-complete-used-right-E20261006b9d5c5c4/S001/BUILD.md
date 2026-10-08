<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T08:01:24.074Z

**Commit:** 99e45b89

## Summary

Tasks t1 to t8 of 17 built. t8: stepPlan converts a prepare that throws to the failed output and goes on; the narrow phase validates the agent's answer against the schema on the runner's entry before finalize (retryable on mismatch), records a finalize throw as the failed output, and never caches a failure; a state minted before the change resumes. Seven tests drive the narrow phase through its own handler on a temporary graph; seven mutations each make a test fail; analyze and mcp suites pass (1,279 of 1,371, the rest skipped). A defect was found and fixed: a null answer to capability.reuse-check made its finalize throw. CATCH-CLAUSE CLASSIFICATION (task t7, 25 at design time). Removed, class rethrow (14): search-text.ts 1; config-trace.ts 1; db-connections-list.ts 1; db-tables-list.ts 4; db-table-describe.ts 5; module-profile.ts 2. Remaining (11 plus 1 new): capability-reuse-check.ts — judging model call: rethrow with the candidates; a candidate's profile cannot be read: expected, skipped. concept-resolve.ts — directory unreadable: expected below the root (skipped), rethrow at the root; entry cannot be stat-ed: expected (skipped). doc-constraint-enumerate.ts, doc-decision-trace.ts — model call: rethrow with the retrieved sections. freeform-probe.ts — loop error: rethrow, the turn limit with the tool results. manifests-locate.ts — content not valid YAML: expected (skipped), two clauses. module-profile.ts — path cannot be stat-ed: rethrow; child cannot be stat-ed: expected (skipped); indexed file gone: expected (skipped).

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`
- ✗ `t8`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/context/__tests__/freeform-fallback.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/docs-retrieval.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/__tests__/failed-lookups.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/__tests__/partly-read.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/__tests__/removed-flags.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/completeness-facts.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/config-trace.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/convention-detect.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/data-model-trace.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/index.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/item-measure.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/lookup-failed.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/manifests-locate.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/search-text.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/symbol-locate.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/test-locate.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/db/exploration-cache.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/mcp/__tests__/analyze-step-failed-lookup.test.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/prompts/analyze/synthesize.adherence.system.md` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/prompts/analyze/synthesize.capability.system.md` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/prompts/analyze/synthesize.code.system.md` — **insrc-build** (2026-10-08T08:01:24.074Z)
- `src/prompts/analyze/synthesize.data.system.md` — **insrc-build** (2026-10-08T08:01:24.074Z)
