<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-10-09T13:06:19.852Z  ·  **Updated:** 2026-10-09T13:13:50.489Z

**Commit:** 5fdce3d2

## Summary

code.discovery.modules takes its modules from the one definition: on a graph with no module entity for the repository's directories it returns every directory that directly holds a stored source file, sorted by directory, where it returned nothing. A stored module entity keeps its fields and gains `directory` and `fileCount`; a directory has no `entityId`. The completeness record states what a module is. The runtime reads the repo's entities once and keeps the result whole; the source scan now holds a form per code runtime. The template's description says what is returned. Eight mutations were each caught, the three the plan names among them. The analyze suite compared by name with the Story's baseline loses no test, and the two gated files pass with INSRC_LIVE_TESTS=1.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/README.md` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/analyze.txt` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/deterministic-runtimes.gated.txt` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `src/analyze/planner/templates/code/index.ts` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `src/analyze/runtimes/code/__tests__/module-directories.test.ts` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `src/analyze/runtimes/code/discovery-modules.ts` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` — **insrc-build** (2026-10-09T13:13:50.489Z)
- `src/analyze/runtimes/shared/source-modules.ts` — **insrc-build** (2026-10-09T13:13:50.489Z)
