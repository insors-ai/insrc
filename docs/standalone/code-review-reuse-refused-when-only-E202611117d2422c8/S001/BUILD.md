<!-- insrc:artifact BUILD-7d2422c8f57fa483-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-11T17:34:49.769Z  ·  **Updated:** 2026-11-11T18:08:08.542Z

**Commit:** 9acbf7d3d

## Summary

t3 makes binding format-aware (recorded format, else v1 for accepted, v2 for pending), records taskIdentityFormat on new acceptances, refuses cross-format reuse, and raises every format/identity refusal of a submission as one rejection. Deviation from the LLD: reviewAssignments in assessment.ts (the pending scope-submission path) also collects refusals and the reuse check defaults to the attempt's bind format. Fixtures that demote accepted attempts drop the new field; the publication fixture now resolves its temp repo path (macOS /var symlink). Commits c34ae2cd9 and 9acbf7d3d.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/attribution-binding.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/attribution-scope.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/capacity.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/publication-fixture.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/__tests__/transition.test.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-11T18:08:08.542Z)
