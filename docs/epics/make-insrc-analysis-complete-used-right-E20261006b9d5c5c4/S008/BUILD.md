<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-10-09T13:06:19.852Z  ·  **Updated:** 2026-10-09T13:22:16.899Z

**Commit:** 5ece4484

## Summary

code.structure.module-tree takes its nodes from the one definition and gives every file of the area to the module with the longest directory that contains it. On a graph with no module entity for the repository's directories it has a node per source directory and a counted edge per pair of directories an import runs between, where it had no node. A node's id is the entity's id for a stored module entity and the directory otherwise. For stored module entities the nodes and the edges between them are the ones returned before this Story: that test was also run against the runtime as it stood at the baseline, where its assertions on the two stored modules held and the first difference was the directory outside them. The gated test of a repository with no module entity is rewritten and retitled; because the gate runs without INSRC_LIVE_TESTS, the same case also runs ungated in module-directories.test.ts, and that is the case mapped here. The gated file passes whole with INSRC_LIVE_TESTS=1 (11 of 11). One mutation survived the first version of the tests (the directory prefix without its slash) and is now caught by an added case; ten mutations are caught. Not covered by a new test: a file whose imports cannot be read is named under `skipped`; that code is unchanged and nothing lets a test make the import reader fail for one file.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/README.md` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/analyze.txt` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/deterministic-runtimes.gated.txt` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/planner/templates/code/index.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/runtimes/code/__tests__/module-directories.test.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/runtimes/code/discovery-modules.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/runtimes/code/structure-module-tree.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
- `src/analyze/runtimes/shared/source-modules.ts` — **insrc-build** (2026-10-09T13:22:16.899Z)
