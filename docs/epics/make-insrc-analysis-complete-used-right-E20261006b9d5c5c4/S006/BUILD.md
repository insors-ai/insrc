<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T10:02:51.575Z

**Commit:** a157a7ac

## Summary

The planning call's user turn is built from the resolved scope: the directory the lookups run in, plus one line naming the file, entity or connection for a narrower scope. The step tool's start phase makes the pairing test and resolves the scope before minting state, and its plan and narrow phases resolve it again from the intent in the token, whose shape is unchanged.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`
- ✗ `t8`

## Changes

- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/classifier/__tests__/validate.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/classifier/validate.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/decompose-scope.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/resolve-repo-indexed.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/scope.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/mcp/__tests__/analyze-step-scope.test.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/mcp/analyze-step/phases/plan.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/mcp/analyze-step/phases/start.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T10:02:51.575Z)
- `src/prompts/analyze/classify.system.md` — **insrc-build** (2026-10-07T10:02:51.575Z)
