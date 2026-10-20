<!-- insrc:artifact BUILD-8315a11f29fd2812-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-20T13:26:20.493Z  ·  **Updated:** 2026-10-20T13:44:16.305Z

**Commit:** 9c6bd70f

## Summary

s2/t3: each model dimension's adapter (src/workflow/review-pipeline/code-review.ts) returns codeReviewMaterial of its prepared grounding from the snapshot (coverage via the new optional ModelDimensionSpec.materialGrounding = prepareCoverageGrounding; the others the grounding itself) and uses neighbourSummary. ux and diagram stay deterministic with no chunk calls, so they keep no material. Under the limit nothing changes (single chunk, today's prompt). The chunking tests drive s1's prepare with the real adapter and a chunk-call fixture rendering rows as a JSON array plus context and neighbour lines (s3 owns the real chunk prompts): precedence (calls > same-file > same-module), neighbour lines on both sides of a cut call, whole atoms once, every call within the limit, too-large atoms named neighbour-free, a hub packed despite many neighbour lines; plus the coverage material unit test. Until s3, a real over-limit review still refuses (no chunk calls exist yet). 6 mutations each fail a test. Commit 9c6bd70f.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T13:44:16.305Z)
- `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` — **insrc-build** (2026-10-20T13:44:16.305Z)
- `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` — **insrc-build** (2026-10-20T13:44:16.305Z)
- `src/workflow/review-pipeline/adapters/code-review-material.ts` — **insrc-build** (2026-10-20T13:44:16.305Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T13:44:16.305Z)
