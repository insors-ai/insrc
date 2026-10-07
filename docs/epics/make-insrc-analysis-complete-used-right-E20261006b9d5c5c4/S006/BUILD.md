<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T09:52:49.521Z

**Commit:** 110f872b

## Summary

The lookup pipeline now returns an outcome (a bundle, not-applicable, or one named cause) where it returned nothing, and one exhaustive table converts each cause to a typed error, replacing the single 'model unavailable' throw. The two gates remain, each with an interim cause removed with its gate in later tasks.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`

## Changes

- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/classifier/__tests__/validate.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/classifier/validate.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/__tests__/scope.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T09:52:49.521Z)
- `src/prompts/analyze/classify.system.md` — **insrc-build** (2026-10-07T09:52:49.521Z)
