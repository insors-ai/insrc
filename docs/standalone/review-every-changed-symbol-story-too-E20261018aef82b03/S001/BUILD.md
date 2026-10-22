<!-- insrc:artifact BUILD-aef82b034d7209fa-s1 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T20:09:36.932Z  ·  **Updated:** 2026-10-18T20:28:25.244Z

**Commit:** f398d2cd

## Summary

ReviewJob core: one whole call when it fits the provider (or the budget is unknown), else MAP over context x symbol batches within the reserved budget; an unsplittable unit may use the hard budget (provider's whole input, or the size reported in a refusal). A size refusal re-plans symbols and context together and is never resent; a validation failure is retried as today (LLD: 'retried as today'), with the correction note only when the noted prompt still fits the hard budget. No atom is dropped; one over the hard budget raises AtomTooLargeError. packIntoBatches (t3) is unchanged.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/input-budget.test.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/agent/providers/__tests__/input-too-large-cli.test.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/agent/providers/__tests__/input-too-large.test.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/workflow/code-review/__tests__/pack-into-batches.test.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/workflow/code-review/__tests__/review-job.test.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/workflow/code-review/pack-into-batches.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/workflow/code-review/review-job.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-18T20:28:25.244Z)
