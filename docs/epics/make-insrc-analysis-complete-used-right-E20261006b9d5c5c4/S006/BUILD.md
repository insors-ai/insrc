<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T09:48:07.548Z

**Commit:** 195121ea

## Summary

Corrected the table of which kind of scope goes with which kind of source so it matches what the plan tasks accept, exported it as the one statement of the pairings with a test that holds the classifier prompt equal to it, and gave a symbol scope's value a defined form that the validator checks.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`

## Changes

- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/classifier/__tests__/validate.test.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/classifier/validate.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/__tests__/scope.test.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T09:48:07.548Z)
- `src/prompts/analyze/classify.system.md` — **insrc-build** (2026-10-07T09:48:07.548Z)
