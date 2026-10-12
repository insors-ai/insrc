<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T12:48:06.963Z

**Commit:** d821cbc5

## Summary

Deleted the graph store's temporary reader declaration function and its _mayReadLiveStore flag from src/db/graph/store.ts (the MCP server's call was removed in t9); assertMayOpen now admits only a process that declared itself the owner, and resetLiveStoreDeclarationsForTests forgets only that. The store-child helper loses its 'declare-reader' command and gains a default case that answers an unknown command with an error. Reader cases turned into refusal cases: live-store-owner.test.ts (only the owner declaration opens the live path; the store module exports no declaration but declareLiveStoreOwner), live-store-refusal.test.ts (a new third-process test: beside the owner, a process with no declaration is refused LmdbStoreNotOwnerError and holds no descriptor before or after; the old reader command is refused), live-vector-store-owner.test.ts (no declaration but the owner's exists; the live vector store is refused). The 'exactly two places' scan is replaced by one that fails on any occurrence under src/ (all file types it may appear in, tests included) and builds the name from pieces. New ac6 integration test src/mcp/__tests__/mcp-process-refused.test.ts: a child process with HOME in a temporary directory starts the real MCP server via runInsrcMcpStdio (as src/bin/insrc-mcp.ts does), then tries getGraphStore() and getLanceConn() on its live paths: both refused (LmdbStoreNotOwnerError, LanceStoreNotOwnerError / lance-not-owner) and nothing created. Mutations: making the MCP startup declare the owner fails the ac6 test; re-adding the name in a comment fails the scan. Full sweep under Node v22.23.2 recorded in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md (row t11): 6649 tests, only the 9 known failures/cancellations, nothing newly failing.

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
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/__tests__/sampler-context.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/graph/__tests__/live-store-owner.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/graph/__tests__/live-store-refusal.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/fixtures/imports-store.fixture.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/fixtures/mcp-process-open.fixture.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/mcp-process-refused.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/sampling-bridge.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/__tests__/sampling-retired.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/forward-step.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T12:48:06.963Z)
