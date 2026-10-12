<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T12:38:44.194Z

**Commit:** 10dd8589

## Summary

New src/mcp/forward-step.ts: forwardStep(tool, rawArgs, { client?, onProgress? }) opens a step.call stream to the daemon socket with params { tool, args: rawArgs, context: { cwd: process.cwd(), envRepo: INSRC_REPO when set, client } } and resolves with the 'done' frame's data unchanged. ENOENT/ECONNREFUSED (and any other socket error) -> DaemonUnreachableError (code daemon-unreachable, retryable); a plain 'unknown method: step.call' line or an error frame with code step-unknown-tool -> DaemonTooOldError (code daemon-too-old); both returned as isError envelopes in the handlers' { next:'error', error:{ code, name, message, retryable } } shape; the MCP process never runs a handler. src/mcp/server.ts: the seven step tools' registrations call forward(tool, rawArgs, extra), which converts the client name to 'claude'|'codex' and relays progress frames through the existing mcpProgressSink only when extra._meta.progressToken is set. Removed from server.ts: the imports of the step handlers, analyze-oneshot, shaper-provider and the sampling bridge, the in-process handleAnalyze body, the interim socket-client install, and from runInsrcMcpStdio the declareLiveStoreReaderUntilS11 call and the builtin tool / data driver / workflow runner registration. STEP_TOOL_NAMES moved to src/shared/step-context.ts (host.ts re-exports it). The MCP server's value-import graph now reaches 18 modules (from 523), none under src/db, src/analyze or src/daemon/steps. Tool surface: a golden file of listTools (name, title, description, inputSchema for all twelve tools) was captured through a real MCP client from the unchanged server at e30638e5, before any t9 edit, and the test compares against it. Two source scans made stale by the task were updated (permitted-reader name now only at its definition; no src/mcp file, server.ts included, imports src/daemon/steps). Falsifying mutations (a steps import in server.ts, a db import below the forwarder, refused/unknown-method/unknown-tool mappings removed, progress relayed without a token, one description edited) each fail a test. Full sweep in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md.

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

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/graph/__tests__/live-store-owner.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/mcp/__tests__/fixtures/imports-store.fixture.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/mcp/forward-step.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T12:38:44.194Z)
