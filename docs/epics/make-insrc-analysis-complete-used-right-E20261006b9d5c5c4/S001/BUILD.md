<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T07:46:50.436Z

**Commit:** f046ff18

## Summary

Task t6: the two document lookups, module.profile, doc.mention and manifests.locate report partly read items with the kept length and the item's real length from its file; facts gathered in prepare are carried to finalize, and a prepared value without them gives a record that is not established. Six tests pass on documents indexed through the real artifact parser (a section of over 100,000 characters); eight mutations each make a test fail; analyze and mcp suites pass (1,265 of 1,357, the rest skipped). Found: every parser stores an empty body for a source file's own entity, so module.profile's entry-point markers never match a source file; the record states this as its rule.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/context/__tests__/freeform-fallback.test.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/__tests__/partly-read.test.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/__tests__/removed-flags.test.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/class-hierarchy.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/completeness-facts.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/config-trace.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/convention-detect.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/data-model-trace.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/import-graph.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/item-measure.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/manifests-locate.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/search-text.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/symbol-locate.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/test-locate.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/explore/usage-example.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/db/exploration-cache.ts` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/prompts/analyze/synthesize.adherence.system.md` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/prompts/analyze/synthesize.capability.system.md` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/prompts/analyze/synthesize.code.system.md` — **insrc-build** (2026-10-08T07:46:50.436Z)
- `src/prompts/analyze/synthesize.data.system.md` — **insrc-build** (2026-10-08T07:46:50.436Z)
