<!-- insrc:artifact BUILD-771867fad5f73762-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-01T16:52:20.097Z  ·  **Updated:** 2026-11-01T17:02:49.913Z

**Commit:** 986fce0f5

## Scope

Align attribution with the selected review task scope

Review review-e6ddcdcb-s4-t4-live-20261101 attempt2 targeted only task t4 from a five-task Plan, but failed before assessment with 'attribution: Every applicable task needs exactly one derived scope'. A model-free reproduction confirms the generic reassessment schema accepts rows for all five Plan tasks while host selection accepts only t4. The exact native returned task IDs were not retained, so those IDs are not asserted. [[c1]] [[c2]] [[c3]]

attributionPrompt requests every Plan task even for a task-scoped packet. attributionSchema selects only initial versus reassessment format and does not bind task IDs or row count to the selected scope. deriveTaskAssignments correctly filters by packet.taskId and rejects mismatching scope sets. Daemon and controller consume the same inconsistent prompt/schema contract. [[c1]] [[c2]]

Make attribution instructions and native output constraints agree with the exact applicable task selection on initial and subsequent attempts: only the selected task for task reviews, all applicable tasks for story reviews. Retain strict host rejection of missing, extra, foreign or duplicate scopes and omitted change/test attribution. Preserve historical attempts, reassess/reuse policy and reviewer independence. Add focused deterministic single-task re-review, whole-story and route-parity regressions; do not start another live review or change stored result shapes. [[c1]] [[c2]]

## Summary

Attribution prompt and cloned native schemas now use the selected task IDs/count for initial reviews and re-reviews on both routes. Strict host uniqueness/coverage validation and immutable prior attempts are preserved. Build/typecheck and76 focused regressions pass; no live retry started.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/task-review-execution.md` — **insrc-build** (2026-11-01T17:39:52.418Z)
- `src/workflow/code-review/task-review/__tests__/attribution-scope.test.ts` — **insrc-build** (2026-11-01T17:39:52.418Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-01T17:39:52.418Z)
