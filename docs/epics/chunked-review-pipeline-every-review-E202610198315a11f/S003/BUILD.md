<!-- insrc:artifact BUILD-8315a11f29fd2812-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-20T16:44:27.482Z  ·  **Updated:** 2026-10-20T17:17:25.803Z

**Commit:** 581e1d76

## Summary

Adherence, functional coverage and conventions make a notes-only chunk call in a divided review (adapters/code-review-chunk.ts, kind 'notes'): schema { notes: [{ key, atomIds, note }] }, no findings field. validate rejects unknown keys and atoms outside the call with one fixed-size reason per kind: a model-made value is located by count and position, never quoted back (fix 581e1d76), so the correction always fits beside the call and is always sent; tested with keys and ids twice the limit long (the re-issue carries the correction and fits). gather.notesFrom is wired through each dimension's gather plan (t4).

## Tasks validated

- ✓ `t1`
- ✗ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/review-pipeline/adapters/code-review-gather.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T17:17:25.803Z)
