<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T09:42:12.664Z

**Commit:** eb3dd989

## Summary

Replaced the six remaining copies of the model-failure text list (planner, aggregator, classifier, scope picker, summariser, tool loop) with the shared check, each keeping its own error classes and codes, and added a source-search test that fails if the list is copied again.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`

## Changes

- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T09:42:12.664Z)
