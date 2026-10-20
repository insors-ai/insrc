<!-- insrc:artifact BUILD-8315a11f29fd2812-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-20T16:44:27.482Z  ·  **Updated:** 2026-10-20T17:15:21.014Z

**Commit:** 27e08db1

## Summary

Adherence, functional coverage and conventions make a notes-only chunk call in a divided review (adapters/code-review-chunk.ts, kind 'notes'): obligations and their context, the chunk's rows and neighbour lines; schema { notes: [{ key, atomIds, note }] } with no findings field. validate rejects unknown keys and atoms outside the call with at most one reason per kind, each distinct value named once, so the correction stays small beside the call (fix 364c8298 after the first gate). The re-issue keeps the chunk call with the reasons appended; the single call keeps today's correction. gather.notesFrom is now wired: each dimension's gather plan (t4, adapters/code-review-gather.ts) uses chunkNotesFrom, and the t4 tests drive chunk notes into obligation calls. The shared validation test now also holds its coverage-finding case (t3).

## Tasks validated

- ✓ `t1`
- ✗ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/review-pipeline/adapters/code-review-gather.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T17:15:21.014Z)
