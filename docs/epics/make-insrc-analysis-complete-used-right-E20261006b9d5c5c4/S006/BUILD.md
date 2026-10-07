<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T11:57:46.742Z

**Commit:** 8a7d7025

## Summary

Added four live checks, gated by INSRC_LIVE_TESTS, that run the context build in process with the real models and this repository's index; all four passed on 2026-10-07 (134 seconds). Documented the analyze error codes in the daemon guide, including the three new ones a mirroring client needs.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`
- ✗ `t8`
- ✗ `t9`
- ✗ `t10`
- ✗ `t11`
- ✗ `t12`

## Changes

- `.insrc/artifacts/CR-b9d5c5c40df5a574-s6.json` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `docs/daemon.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S006/CR.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/classifier/__tests__/validate.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/classifier/validate.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/decompose-scope.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/freeform-fallback.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/no-focus-prompts.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/resolve-repo-indexed.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/scope.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/__tests__/unfocused.live.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/explore/__tests__/freeform-probe-scope.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/orchestrator/__tests__/orchestrator.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/mcp/__tests__/analyze-step-scope.test.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/mcp/analyze-step/phases/plan.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/mcp/analyze-step/phases/start.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/classify.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/decompose.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/synthesize.adherence.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/synthesize.capability.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/synthesize.code.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/synthesize.data.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/synthesize.docs.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
- `src/prompts/analyze/synthesize.infra.system.md` — **insrc-build** (2026-10-07T11:57:46.742Z)
