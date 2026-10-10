<!-- insrc:artifact BUILD-0f17539c98aa78ee-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T07:36:48.435Z  ·  **Updated:** 2026-10-10T10:20:30.601Z

**Commit:** 8687e16d

## Summary

Task 4: a test that runs the real infra adherence check through the plan walk, a source scan for the removed parameter, docs/plans/docs-module.md and a new section of docs/daemon.md. Four mutations each fail the intended test. The whole analyze suite was run at the commit before the Story (7f274d55) and at task t4 (cf0bdc19) and compared by test name: no test changed its result; the same two files fail in both runs (freeform-probe-scope.test.ts and phase5-explorations-params.test.ts, a SIGABRT in the LMDB library's close, not this Story's); 3 test names are gone by design and 19 are new. The comparison and both raw outputs are in docs/standalone/bug-analyze-planner-plans-adherence-check-E202610090f17539c/S001/measurements/ (analyze-suite-comparison-t4.md, analyze-suite-before-7f274d55.tap, analyze-suite-after-cf0bdc19.tap).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-0f17539c98aa78ee-S001.json` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `.insrc/artifacts/PLAN-0f17539c98aa78ee-S001.json` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `docs/daemon.md` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `docs/plans/docs-module.md` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `docs/standalone/bug-analyze-planner-plans-adherence-check-E202610090f17539c/S001/CR.md` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `docs/standalone/bug-analyze-planner-plans-adherence-check-E202610090f17539c/S001/measurements/analyze-suite-after-cf0bdc19.tap` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `docs/standalone/bug-analyze-planner-plans-adherence-check-E202610090f17539c/S001/measurements/analyze-suite-before-7f274d55.tap` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `docs/standalone/bug-analyze-planner-plans-adherence-check-E202610090f17539c/S001/measurements/analyze-suite-comparison-t4.md` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/planner/__tests__/templates.test.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/planner/invariant-fix-hints.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/planner/templates/code/index.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/planner/templates/data/index.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/planner/templates/infra/index.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/planner/templates/shared-schemas.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/planner/validate.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/code/adherence-check.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/data/adherence-check.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/infra/adherence-check.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/shared/adherence-topic-constraints.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
- `src/shared/paths.ts` — **insrc-build** (2026-10-10T10:20:30.601Z)
