<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-10-09T13:06:19.852Z  ·  **Updated:** 2026-10-09T13:31:43.007Z

**Commit:** ba4b5014

## Summary

The functional-surface task reads its module value in two steps. A stored entity's id is looked up first and read exactly as before, with no scope resolved (the wrong-kind message is unchanged). Any other value is a directory path: the run's scope is resolved through the one scope function, the directory is tested against the scope's area, and the surface is every function, method and class of the stored source files under it, sub-directories included. A value under which no stored source file lies fails the task; a directory outside the area, and any directory under a file or symbol scope, is refused. Notes: (1) the plan's mutation 'test a directory against the area with the entity predicate' is equivalent once the file/symbol refusal comes first, so it cannot be killed; the falsifiable form, removing that refusal, is killed. (2) Resolving a repo scope tolerates a registry that cannot be read, so with throwing readers a directory path fails under a symbol scope, and under a repo scope the test asserts the readers were called. (3) The gated test of the unknown value cannot run in the gate; an ungated test of the same case carries that name.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/README.md` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/analyze.txt` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/deterministic-runtimes.gated.txt` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/planner/templates/code/index.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/code/__tests__/module-directories.test.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/code/discovery-modules.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/code/structure-module-tree.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/code/surface-functional.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
- `src/analyze/runtimes/shared/source-modules.ts` — **insrc-build** (2026-10-09T13:31:43.007Z)
