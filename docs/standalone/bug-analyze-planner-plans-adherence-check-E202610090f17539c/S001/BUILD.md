<!-- insrc:artifact BUILD-0f17539c98aa78ee-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T07:36:48.435Z  ·  **Updated:** 2026-10-10T07:52:01.773Z

**Commit:** cf0bdc19

## Summary

Task 4: a test that runs the real infra adherence check through the plan walk (no constraint in the documents: the reason is in the task's record and tasksFailed, and the report is still written from the other task, which is told what is absent and why); a source scan that no template, runtime or prompt of the analyze framework names constraintsSource and that the check does not read upstreamOutputs; docs/plans/docs-module.md and a new section of docs/daemon.md. Four mutations each fail the intended test. The whole analyze suite: 1,034 pass, 92 skipped, and two whole-file failures (freeform-probe-scope.test.ts, phase5-explorations-params.test.ts) that abort in the LMDB library's close at process exit; both abort the same way with this Story's changes stashed, so they are not from this Story.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-0f17539c98aa78ee-S001.json` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `docs/daemon.md` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `docs/plans/docs-module.md` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/planner/__tests__/templates.test.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/planner/invariant-fix-hints.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/planner/templates/code/index.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/planner/templates/data/index.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/planner/templates/infra/index.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/planner/templates/shared-schemas.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/planner/validate.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/code/adherence-check.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/data/adherence-check.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/infra/adherence-check.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/shared/adherence-topic-constraints.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
- `src/shared/paths.ts` — **insrc-build** (2026-10-10T07:52:01.773Z)
