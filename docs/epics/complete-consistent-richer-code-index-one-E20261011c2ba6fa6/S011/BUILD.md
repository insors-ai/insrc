<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-13T06:00:42.483Z

**Commit:** f1b81679

## Summary

New src/mcp/__tests__/mcp-process-e2e.test.ts with helpers in src/mcp/__tests__/helpers/mcp-e2e.ts: the REAL daemon (node --import tsx/esm src/daemon/index.ts) and the REAL MCP server (src/bin/insrc-mcp.ts via the SDK's StdioClientTransport), each with HOME in a temporary directory, so the daemon's socket, stores and logs are inside it and the live daemon is never touched (tests leave no processes or temp dirs). (1) After one call of each of the seven moved tools, lsof -p of the MCP process lists no graph.lmdb, graph.lmdb-lock or .insrc/lance path; as a control lsof does list the daemon's graph.lmdb. (2) ac2: analyze_step and workflow_step started through MCP process A (state tokens kept), A exits (pid gone), then a new process B continues both with the same tokens (analyze plan -> emit_bundle/emit_narrow, workflow plan -> emit_step); a never-minted token is the daemon-restart miss. (3) ac5: the MCP server talks to the daemon through a recording proxy socket; the text of every 'done' frame equals byte for byte what the MCP client received (prompt, schema and state), and every field of emit_plan (analyze, workflow) and emit_step (workflow) equals the in-process handler reply on an empty temporary store, the fresh state token apart (same form/length). (4) ac3 through a real MCP process: no daemon -> DaemonUnreachableError for all seven tools, no store path in lsof, nothing created; a daemon without step.call (the real IpcServer request handling with only an older request) -> DaemonTooOldError, nothing else ran. No input calls a model: workflow runs use 'issue' (brainstorm's elicit runner drafts each turn with a model); the 11 'cli-provider claude' log lines in the sweep are the CliProvider tests' stand-in binaries (model null, sub-second). Two defects these tests found, fixed in this task: the daemon never registered the workflow runners for step.call (src/daemon/steps/host.ts now calls registerWorkflowRunners(), unit test 'the step host registers the workflow runners...' fails without it), and the forwarder decoded socket chunks one by one, corrupting multi-byte characters split across chunks (src/mcp/forward-step.ts now uses setEncoding('utf8'); unit test splits an em dash across two writes and fails without it). Full sweep in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md (row t12): only the known failures.

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
- ✓ `t12`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/__tests__/sampler-context.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/graph/__tests__/live-store-owner.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/graph/__tests__/live-store-refusal.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/fixtures/imports-store.fixture.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/fixtures/mcp-process-open.fixture.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/helpers/mcp-e2e.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/mcp-process-refused.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/sampling-bridge.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/__tests__/sampling-retired.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/forward-step.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-13T06:00:42.483Z)
