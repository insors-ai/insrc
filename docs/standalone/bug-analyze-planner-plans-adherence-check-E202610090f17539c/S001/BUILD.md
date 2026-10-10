<!-- insrc:artifact BUILD-0f17539c98aa78ee-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T07:36:48.435Z  ·  **Updated:** 2026-10-10T07:45:20.509Z

**Commit:** af4c2bbc

## Summary

Task 2: the shared adherence check takes its constraints from a non-empty inline list, else non-empty stored-document ids, else a topic it enumerates from the documents of the repository it reads (once per run and topic, through the record of task 1). It no longer reads constraintsSource or the upstream outputs; an empty inline list counts as not given; each way of having nothing to judge against has its own reason; the enumeration's limits, partly read and skipped items are in the check's completeness record; the adherence-report of all three families carries the constraints judged against and their source. Eight new integration tests (adherence-topic-route.test.ts), the existing constraint tests rewritten for the new result shape, and the two source-scan tests updated. Nine mutations each fail a test. The catch-clause count test also needed rows for the module added in task 1. The first validate turn failed on a test title the builder mapped from memory that does not exist; the mapping was corrected and no code changed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-0f17539c98aa78ee-S001.json` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/code/adherence-check.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/data/adherence-check.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/infra/adherence-check.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/shared/adherence-topic-constraints.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
- `src/shared/paths.ts` — **insrc-build** (2026-10-10T07:45:20.509Z)
