<!-- insrc:artifact BUILD-8315a11f29fd2812-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-20T16:44:27.482Z  ·  **Updated:** 2026-10-20T16:54:56.125Z

**Commit:** 7de06bfd

## Summary

Adherence, functional coverage and conventions get a notes-only chunk call in a divided review (src/workflow/review-pipeline/adapters/code-review-chunk.ts, wired in code-review.ts; each dimension's spec supplies its framing in one entry, conventions also its documented rules): obligations and context, the chunk's rows and neighbour lines; schema { notes: [{ key, atomIds, note }] } with no findings field. validate rejects unknown keys and atoms outside the call; the re-issue keeps the chunk call with the reasons appended (s1's withCorrectionNote, now exported, instead of duplicating it), while the single call keeps today's correction. chunkNotesFrom reads the keyed notes and is tested here; it is attached to the adapter's gather plan in t4, because GatherPlan's required members (obligationCall, reduceCall, partOf, merge) are t4's.

## Tasks validated

- ✓ `t1`
- ✗ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T16:54:56.125Z)
