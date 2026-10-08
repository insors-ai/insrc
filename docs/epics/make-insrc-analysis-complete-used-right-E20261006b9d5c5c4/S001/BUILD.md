<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T07:34:48.408Z

**Commit:** 847ce5b4

## Summary

Task t4: all twenty lookup outputs carry a completeness record built in the lookup, with every count limit and its scope, the text search's omissions, the data driver's cut flag and the basis. A table test runs the real runners for all twenty types against a seeded temporary graph and repository; seven tests pass and nine mutations each make one fail; analyze, mcp and daemon tools suites pass (1,415 of 1,507, the rest skipped). Beyond the design: a third limit scope 'source' for a limit on what a result was built from; manifests.locate and test.locate count past their limit; the data lookups take the pool as a parameter for tests. Found and not yet handled: the document retrieval silently skips its vector pass when the embedding call fails (src/analyze/docs-retrieval.ts), outside the catch clauses the design counted.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/completeness-facts.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/config-trace.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/convention-detect.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/data-model-trace.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/manifests-locate.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/search-text.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/symbol-locate.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/test-locate.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-08T07:34:48.408Z)
