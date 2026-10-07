<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T09:45:28.981Z

**Commit:** 23a8d2bf

## Summary

Added the scope module: one function resolves a scope's kind and value to its registered repo, the directory lookups run in, and for a symbol or a connection the stored entity or the declaring repo, with typed failures for a value that does not resolve or a symbol whose repo is not indexed. Nothing calls it yet.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`

## Changes

- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/__tests__/scope.test.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T09:45:28.981Z)
