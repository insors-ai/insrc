<!-- insrc:artifact BUILD-8315a11f29fd2812-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-20T16:44:27.482Z  ·  **Updated:** 2026-10-20T17:12:07.050Z

**Commit:** dc591479

## Summary

Each model dimension with a chunk call gets a gather plan (src/workflow/review-pipeline/adapters/code-review-gather.ts): obligationCall judges each key once with today's findings schema and the dimension's rules (spec chunk.judge), on all chunks' notes and its own context; a key with no notes is judged on the no-evidence statement; with zero atoms each key is judged on its context alone. reduceCall condenses a batch into one note within noteCapChars (a quarter of the limit); notesFrom reads chunk notes; partOf maps an answer to a DimensionResult part. Locations stay governed by today's per-dimension filters (t7), not by a gather validate.

## Tasks validated

- ✓ `t1`
- ✗ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/review-pipeline/adapters/code-review-gather.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T17:12:07.050Z)
