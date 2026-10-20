<!-- insrc:artifact BUILD-8315a11f29fd2812-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-20T16:44:27.482Z  ·  **Updated:** 2026-10-20T17:14:24.444Z

**Commit:** 3f3345c3

## Summary

Each model dimension with a chunk call gets a gather plan (adapters/code-review-gather.ts): obligationCall judges each key once with today's findings schema and rules, on all chunks' notes and its own context; a key with no notes is judged on the no-evidence statement; reduceCall condenses notes within noteCapChars; notesFrom reads chunk notes; partOf maps an answer to a part. After the first gate: a promised test is judged under its own framing (no symbol grading) and the gather's validate rejects any non-promised-test finding, so with zero atoms nothing is reported as symbol coverage (tested on a diff review divided with zero atoms); conventions findings name the breached documented-rule id, not the module text.

## Tasks validated

- ✓ `t1`
- ✗ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/review-pipeline/adapters/code-review-gather.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T17:14:24.444Z)
