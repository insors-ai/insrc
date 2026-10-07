<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T09:59:15.508Z

**Commit:** 17859ca4

## Summary

runShaper now checks the scope/source pairing for run mode and resolves the scope once for every mode; the freshness read, the tool loop's path, the pipeline's lookup path and the indexed check take the resolved scope. The three old path functions are deleted and the pipeline's gate on the kind of scope is removed, so a file, a symbol, a manifest directory and a connection are served.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`

## Changes

- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/classifier/__tests__/validate.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/classifier/validate.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/resolve-repo-indexed.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/scope.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T09:59:15.508Z)
- `src/prompts/analyze/classify.system.md` — **insrc-build** (2026-10-07T09:59:15.508Z)
