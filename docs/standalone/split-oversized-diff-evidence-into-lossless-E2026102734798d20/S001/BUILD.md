<!-- insrc:artifact BUILD-34798d209cf97413-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-27T07:28:19.979Z  ·  **Updated:** 2026-10-27T09:26:58.551Z

**Commit:** 6f8ca43e4

## Summary

Canonical identity implementation and required tests remain unchanged. Reverted the sibling grounding-eligibility fixture repair so its net diff from pre-t12 is zero; recorded that repair for the already-planned t21 compatibility task. Task12 now changes only input-fingerprint code/types, its own tests and Story bookkeeping.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-34798d209cf97413-S001.json` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task01-checks.json` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task01-pipeline-tests.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/complete-input.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/adapters/code-review-duplicates.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/adapters/code-review-gather.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/driver.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/envelope.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task02-bounded-tests.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task02-checks.json` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task02-provider-pipeline-tests.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/agent/providers/__tests__/bounded-input.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/agent/providers/bounded-input.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/shared/structured-input.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/types.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task03-checks.json` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task03-reader-tests.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/__tests__/diff-grounding.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task04-checks.json` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task04-span-tests.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/__tests__/diff-spans.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/diff-spans.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task05-checks.json` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task05-fit-tests.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/adapters/code-review-material.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/adapters/diff-fragments.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task06-checks.json` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task06-parent-tests.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/adapters/diff-parent-evidence.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task07-validation.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/diff-duplication.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task08-validation.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/diagram/index.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/dimensions/ux/index.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/prepared-dimensions.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task09-validation.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/diff-timing.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/timing.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task10-validation.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/diff-refusal.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task11-validation.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/task12-validation.txt` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/__tests__/input-fingerprint.test.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
- `src/workflow/code-review/input-fingerprint.ts` — **insrc-build** (2026-10-27T09:26:58.551Z)
