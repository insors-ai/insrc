<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T12:43:21.695Z

**Commit:** 92dd0e52

## Summary

Deleted src/mcp/sampling-bridge.ts, src/agent/providers/mcp-sampling-provider.ts, runWithSamplerContext and currentSamplerContext (with the sampler AsyncLocalStorage), and both sampler branches of buildShaperProvider (explicit overrides.sampler and the ambient context; ShaperProviderOverrides loses sampler and modelHints, which nothing else used), with their tests: sampling-bridge.test.ts, mcp-sampling-provider.test.ts, sampler-context.test.ts and the five sampler cases of shaper-provider.test.ts. The remaining shaper-provider cases are unchanged and pass. Stale comments describing the in-process MCP/sampling design were updated (server.ts header, analyze-oneshot.ts, role-router.ts); tool descriptions are untouched (the t9 surface test pins them). New src/mcp/__tests__/sampling-retired.test.ts scans every non-test .ts under src for the bridge, the provider and the sampler-context names and checks both files are gone; a re-added mention fails it. DEVIATION from the task text, stated openly: progress-forward.ts and its test are KEPT. The plan called it unused, but since t9 the forwarders relay step.call progress through its mcpProgressSink (src/mcp/server.ts), so deleting it would remove code in use; neither acceptance check concerns it. model-failure.test.ts keeps two example error strings with the old provider's name as classifier input data. Full sweep in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md: nothing newly failing (MCPSection timing flake, 3 of 3 alone).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/__tests__/sampler-context.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/graph/__tests__/live-store-owner.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/__tests__/fixtures/imports-store.fixture.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/__tests__/sampling-bridge.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/__tests__/sampling-retired.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/forward-step.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T12:43:21.695Z)
