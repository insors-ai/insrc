<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T09:23:41.499Z

**Commit:** 35496edb

## Summary

All 17 tasks of Story s1 built. Every lookup result and every plan-task result carries a completeness record; a lookup that cannot run is reported as failed; every bundle and every plan-tree run carries an answer report derived by code, and the text form of an answer starts with its completeness line; a failed answer step ends the request with 'answer-step-failed' and what the lookups found. t17: docs/daemon.md describes the record, the report on the bundle, the completeness line, 'answer-step-failed' and its data, and carries the note for the IDE repository. LIVE RUN, 2026-10-08 (08:54 UTC), INSRC_LIVE_TESTS=1, answer-writing model via the configured cli-claude tier: 2 of 2 pass. (1) A focused request over this repository whose text search for 'import' stops at its limit of 5 returned a bundle whose first line is 'Incomplete: 1 incomplete: search.text [e1] — limit of 5 …'. (2) A request with one text search made to fail (an unterminated group) listed it under failed, not as an empty result. The plan is fixed in both; the lookups, the report, the answer-writing call, validation and rendering are the production path. The first live attempt failed on a wrong assumption in the test, not in the code: searched from the repository root, a text search on this repository honestly reports itself incomplete because 31 generated HTML files exceed its 2 MB limit; the test now searches src/analyze for its complete lookup. The existing live end-to-end plan-tree test was also run once (08:56 to 09:19 UTC): the run stopped at classification with 'classifier-llm-unavailable' from the local model, which that test tolerates, so it did NOT exercise the run's report; the done path was instead moved into completeRun and is covered without a model (executed plan, real record store, resume). BASELINE (commit def740a9, before the first task): analyze 943 tests / 851 pass / 0 fail; mcp 359 pass; daemon 758 tests / 741 pass / 1 fail (SqliteDriver temporalTrend). AFTER the last task: analyze 1,039 / 944 pass / 0 fail; mcp 370 pass; daemon 770 / 753 pass / 1 fail (the same test). No test that passed in the baseline fails; three baseline test names are gone because t14 renamed those tests with the error class they assert. Full sweep of src: 4,866 tests, 4,739 pass, 123 skipped, 1 fail (the same test). DEVIATIONS FROM THE DESIGN: ReachedLimit.scope gained 'source'; the report gained basisNotes; narrow runner entries gained acceptsNoAnswer; data lookups and runtimes gained pool seams; manifests.locate and test.locate count past their limit; project-context facts are returned through a report out-parameter; the tool loop's final schema keeps 'meta'; 'the final report's text' is taken to be the aggregate report's summary field; the run context's report is merged into the run's report with its sources prefixed 'run context / '. NOT COVERED by a behavioural test: two one-line call sites (the one-shot tool calling renderAnalyzeFailure, the workflow runner calling groundingFor) and the one line in runAnalyze that passes the run context's report to completeRun. RUNTIME CATCH CLAUSES (t11): 15 in 11 files. Expected, named under skipped (12): code/structure-module-tree.ts 1; data/schema-table.ts 1; infra/_shared.ts 1 (the walk root rethrows); infra/discovery-families.ts 1; infra/inventory-ci.ts 1; infra/inventory-docker.ts 2; infra/inventory-helm.ts 2; infra/inventory-kubernetes.ts 1; infra/inventory-terraform.ts 2. Rethrow (3): shared/adherence.ts 1; shared/aggregator.ts 2. LOOKUP CATCH CLAUSES (t7, 25 at design time). Removed, class rethrow (14): search-text.ts 1; config-trace.ts 1; db-connections-list.ts 1; db-tables-list.ts 4; db-table-describe.ts 5; module-profile.ts 2. Remaining (11 plus 1 new): capability-reuse-check.ts — model call: rethrow with the candidates; candidate profile unreadable: expected, skipped. concept-resolve.ts — directory unreadable: expected below the root, rethrow at the root; entry cannot be stat-ed: expected. doc-constraint-enumerate.ts, doc-decision-trace.ts — model call: rethrow with the retrieved sections. freeform-probe.ts — loop error: rethrow, the turn limit with the tool results. manifests-locate.ts — content not valid YAML: expected, two clauses. module-profile.ts — path cannot be stat-ed: rethrow; child cannot be stat-ed: expected; indexed file gone: expected.

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
- ✗ `t12`
- ✗ `t13`
- ✗ `t14`
- ✗ `t15`
- ✗ `t16`
- ✗ `t17`

## Changes

- `docs/daemon.md` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/bundle.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/driver.live.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/freeform-fallback.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/bundle.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/live-project-context.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/schema.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/docs-retrieval.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/executor/index.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/executor/plan-sources.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/__tests__/failed-lookups.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/__tests__/partly-read.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/__tests__/removed-flags.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/answer-report.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/completeness-facts.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/config-trace.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/convention-detect.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/data-model-trace.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/index.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/item-measure.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/lookup-failed.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/manifests-locate.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/search-text.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/symbol-locate.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/test-locate.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/orchestrator/__tests__/orchestrator-e2e.live.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/orchestrator/__tests__/orchestrator.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/orchestrator/__tests__/run-report.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/code/adherence-check.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/code/aggregate-report.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/code/discovery-entrypoints.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/code/discovery-modules.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/code/structure-module-tree.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/code/surface-functional.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/data/adherence-check.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/data/aggregate-report.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/data/discovery-connections.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/data/schema-table.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/docs/aggregate-report.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/docs/constraint-enumerate.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/docs/decision-trace.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/docs/discovery-inventory.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/docs/family-summarise.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/generic/aggregate-report.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/adherence-check.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/aggregate-report.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/discovery-families.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/inventory-ci.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/inventory-docker.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/inventory-helm.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/inventory-kubernetes.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/infra/inventory-terraform.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/daemon/__tests__/workflow-rpc-flatten.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/db/exploration-cache.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/__tests__/analyze-step-answer-prompt-missing.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/__tests__/analyze-step-bundle-report.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/__tests__/analyze-step-failed-lookup.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/__tests__/bundle-md.test.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/analyze-step/answer-turn.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/analyze-step/phases/bundle.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/analyze-step/phases/plan.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/analyze-step/phases/start.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/analyze-step/types.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/bundle-md.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/prompts/analyze/synthesize.adherence.system.md` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/prompts/analyze/synthesize.capability.system.md` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/prompts/analyze/synthesize.code.system.md` — **insrc-build** (2026-10-08T09:23:41.499Z)
- `src/prompts/analyze/synthesize.data.system.md` — **insrc-build** (2026-10-08T09:23:41.499Z)
