<!-- insrc:artifact BUILD-0f17539c98aa78ee-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T07:36:48.435Z  ·  **Updated:** 2026-10-10T07:49:03.725Z

**Commit:** 106fc6b0

## Summary

Task 3: the three adherence templates require a topic or an override and no longer declare constraintsSource (revision r2; the parameter shapes and descriptions are shared from shared-schemas.ts); plan validation fails, in the planner's words, a task with no source of constraints that is not empty and a task that still carries constraintsSource, including in a generic plan that holds the docs task; the INV-5 fix hint gains the remedy. Three tests against the real catalog in templates.test.ts; six mutations each fail the intended test. (A first mutation run left two files mutated because of mis-named backups; they were restored from the backups, verified byte-identical, and the run was repeated.)

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-0f17539c98aa78ee-S001.json` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/planner/__tests__/templates.test.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/planner/invariant-fix-hints.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/planner/templates/code/index.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/planner/templates/data/index.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/planner/templates/infra/index.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/planner/templates/shared-schemas.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/planner/validate.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/code/adherence-check.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/data/adherence-check.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/infra/adherence-check.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/shared/adherence-topic-constraints.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
- `src/shared/paths.ts` — **insrc-build** (2026-10-10T07:49:03.725Z)
