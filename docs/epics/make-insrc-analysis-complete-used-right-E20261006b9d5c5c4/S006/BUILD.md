<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T09:30:39.688Z

**Commit:** 5a3f5f5d

## Summary

Added one shared check for a failed model call covering Ollama, the claude and codex CLI, and a sampling client (through a typed error), and switched the planning and answer-writing classifiers to it. Their model-unavailable messages are now provider-neutral and carry the underlying message in a field.

## Tasks validated

- ✗ `t1`
- ✗ `t2`

## Changes

- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/agent/providers/model-call-error.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-07T09:30:39.688Z)
