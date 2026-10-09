<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T16:31:36.297Z

**Commit:** c5b16af1

## Summary

The Story's test baseline was taken at cc7df0d9, before any source change (five suites; it records one sqlite driver test and a group of VS Code extension tests that fail before the Story). A new module, src/analyze/measure.ts, holds the RequestMeasure type as the design gives it, the one table SIZE_THRESHOLDS, sizeOfCounts, measureNamedArea, measureLookupResults, renderMeasureLine and the type UnsizedIntent. filesNamedBy, added beside the lookup output types, is the one place that says which field of which output is a file path, with a case per member of the output union and no default. Nothing calls them yet. One helper beyond the design's list is exported, notDetermined, which builds the measure of a count that could not be taken; the next Task's measuring pass uses it. Eleven mutations were run and each fails a test.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T16:31:36.297Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T16:31:36.297Z)
