<!-- insrc:artifact BUILD-8315a11f29fd2812-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-20T16:44:27.482Z  ·  **Updated:** 2026-10-20T17:04:04.005Z

**Commit:** eae69f84

## Summary

Coverage and quality get chunk calls in a divided review (src/workflow/review-pipeline/adapters/code-review-chunk.ts, a chunk builder with kinds notes / coverage / quality; each dimension's spec gives its kind and framing). Coverage: today's finding item with symbolId required plus notes per promised test; validate rejects non-symbol-coverage findings and symbols the chunk does not hold, so promised-test findings come only from gather. Quality: today's findings plus exactly one description per carried symbol; validate names missing, repeated and foreign ids. Re-issues keep the chunk call with the reasons appended; under the limit today's prompts and schemas are unchanged.

## Tasks validated

- ✓ `t1`
- ✗ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T17:04:04.005Z)
