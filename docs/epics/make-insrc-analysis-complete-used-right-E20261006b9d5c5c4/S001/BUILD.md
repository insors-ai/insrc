<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T07:56:52.524Z

**Commit:** f7c83808

## Summary

Task t7. Catch clauses of the lookup files, classified (25 at design time). REMOVED so the error reaches the executor (14, class rethrow): search-text.ts 1 (search failed); config-trace.ts 1 (search failed); db-connections-list.ts 1 (registry unreadable); db-tables-list.ts 4 (registry, connection, listTables, listNamespaces); db-table-describe.ts 5 (registry, connection, rdbms describe, describeNamespace, file describe); module-profile.ts 2 (directory cannot be listed; file size). REMAINING (11 of the 25, plus 1 new): capability-reuse-check.ts — the judging model call: rethrow as LookupFailedError with the candidates; a candidate's profile cannot be read: expected, named under skipped. concept-resolve.ts — a directory cannot be read: expected below the root (skipped), rethrow at the root; an entry cannot be stat-ed: expected (skipped). doc-constraint-enumerate.ts and doc-decision-trace.ts — the model call that reads the sections: rethrow with the retrieved sections. freeform-probe.ts — the loop's error: rethrow, the turn limit with the tool results gathered. manifests-locate.ts — stored content not valid YAML: expected (skipped), in resourceKindFromBody and in the new manifestBodyUnparsable. module-profile.ts — the path cannot be stat-ed: rethrow; a child cannot be stat-ed: expected (skipped); an indexed file no longer on disk: expected (skipped). Added LookupFailedError, the failed output's partial, one conversion (failedOutput) used at both executor sites, the tool loop's error carrying its tool results, and both mapping functions passing them in data. Also, beyond the 25: the document retrieval's silently skipped vector pass is now named under skipped by the three document lookups. Seven tests pass, one of which counts the clauses in the source against the table; thirteen mutations each make a test fail; analyze, mcp and daemon suites pass (1,672 of 1,776, the rest skipped).

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/context/__tests__/freeform-fallback.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/docs-retrieval.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/__tests__/failed-lookups.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/__tests__/partly-read.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/__tests__/removed-flags.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/completeness-facts.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/config-trace.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/convention-detect.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/data-model-trace.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/item-measure.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/lookup-failed.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/manifests-locate.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/search-text.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/symbol-locate.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/test-locate.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/db/exploration-cache.ts` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/prompts/analyze/synthesize.adherence.system.md` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/prompts/analyze/synthesize.capability.system.md` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/prompts/analyze/synthesize.code.system.md` — **insrc-build** (2026-10-08T07:56:52.524Z)
- `src/prompts/analyze/synthesize.data.system.md` — **insrc-build** (2026-10-08T07:56:52.524Z)
