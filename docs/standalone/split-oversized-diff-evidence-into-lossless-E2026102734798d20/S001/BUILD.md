<!-- insrc:artifact BUILD-34798d209cf97413-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-27T07:28:19.979Z  ·  **Updated:** 2026-10-27T07:31:29.606Z

**Commit:** 55e892c23

## Summary

Task1 now refuses oversized fixed framing even with no atoms/obligations, counts actual schema at all planning/dispatch boundaries, and preserves explicit correction/history or fails. Both previous daemon findings corrected. Relevant pipeline suite88passed/3live skips; no full sweep yet.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-34798d209cf97413-S001.json` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task01-checks.json` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task01-pipeline-tests.txt` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/__tests__/complete-input.test.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/adapters/code-review-duplicates.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/adapters/code-review-gather.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/driver.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/envelope.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-27T07:31:29.606Z)
