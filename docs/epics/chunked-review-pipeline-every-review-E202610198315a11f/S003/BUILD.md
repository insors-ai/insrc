<!-- insrc:artifact BUILD-8315a11f29fd2812-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-20T16:44:27.482Z  ·  **Updated:** 2026-10-20T16:45:32.296Z

**Commit:** aecee5ff

## Summary

Each model code-review dimension's material() now carries its obligations and context atoms, built from the saved subject and the snapshot only. The builders live in the new src/workflow/review-pipeline/adapters/code-review-obligations.ts; code-review.ts gains an optional ModelDimensionSpec.obligations hook that material() applies. Each dimension attaches its builder with one line in its own spec (adherenceSpec, conventionsSpec, coverageSpec, functionalCoverageSpec): those specs ARE each dimension's adapter definition, which is where the s3 LLD contract 2.1 puts the obligations ('added to s2's codeReviewMaterial output by each dimension's adapter'), and the task's own wording is 'each model dimension's material() adds obligations'. Choosing the builder by dimension inside code-review.ts instead would make it import the judges' helpers (functionalRequirementsOf, promisedTestsOf, testRecordView), while every judge imports code-review.ts: an import cycle. No prompt, schema, filter or judge behaviour changed in those files.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T16:45:32.296Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T16:45:32.296Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T16:45:32.296Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T16:45:32.296Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-20T16:45:32.296Z)
- `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — **insrc-build** (2026-10-20T16:45:32.296Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T16:45:32.296Z)
