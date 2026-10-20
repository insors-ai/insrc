<!-- insrc:artifact BUILD-8315a11f29fd2812-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-20T13:26:20.493Z  ·  **Updated:** 2026-10-20T15:50:57.309Z

**Commit:** 9c6bd70f

## Summary

The code-review adapter reads its material from codeReviewMaterial (coverage via spec.materialGrounding) and its neighbour lines from neighbourSummary; chunking is tested through s1's amended prepare, where call/reference lines are required and directory/file lines are context added while they fit.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-8315a11f29fd2812-s1.json` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/LLD.md` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/envelope-cli-both-20261020T205634.txt` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/ollama-grounded-20261020T203331.txt` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/__tests__/envelope.live.test.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/__tests__/toy-adapter.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/adapters/code-review-material.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/design-review.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/driver.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/prepare.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review-pipeline/types.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review/review.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
- `src/workflow/review/template-review.ts` — **insrc-build** (2026-10-20T15:50:57.309Z)
