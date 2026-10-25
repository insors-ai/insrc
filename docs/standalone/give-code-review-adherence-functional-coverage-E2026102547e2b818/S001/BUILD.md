<!-- insrc:artifact BUILD-47e2b81827433589-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-25T10:44:06.181Z  ·  **Updated:** 2026-10-25T10:51:47.757Z

**Commit:** d3e2891aa

## Summary

Both judges use source-inspecting sessions and conservative evidence outcomes. Extended the daemon-mapped regression file to inject out-of-scope and unknown-FR findings through both single and divided paths.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-47e2b81827433589-s1.json` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `.insrc/artifacts/LLD-47e2b81827433589-s1.log.jsonl` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `.insrc/artifacts/PLAN-47e2b81827433589-s1.json` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `docs/standalone/give-code-review-adherence-functional-coverage-E2026102547e2b818/S001/LLD.md` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `docs/standalone/give-code-review-adherence-functional-coverage-E2026102547e2b818/S001/PLAN.md` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/code-review/source-inspection.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/adapters/code-review-gather.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/code-review/__tests__/call-progress.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/code-review/dimensions/__tests__/adherence.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/code-review/dimensions/__tests__/code-review-cwd.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/code-review/dimensions/__tests__/functional-coverage.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/__tests__/enveloped.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
- `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` — **insrc-build** (2026-10-25T10:51:47.757Z)
