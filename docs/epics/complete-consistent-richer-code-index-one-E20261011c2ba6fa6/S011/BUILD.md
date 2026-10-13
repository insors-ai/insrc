<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-13T06:32:04.533Z

**Commit:** 284ce2c4

## Summary

Shipped and smoke-checked; everything recorded in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/smoke.md (commit 284ce2c4). Pushed main @99c6a8df (after two --no-ff merges of other sessions' work, each swept, see S011/sweeps.md). Installed daemon updated to 99c6a8df via the update() service function and restarted; the old daemon (pid 57247) hung after logging 'bye' (pid file and socket removed, process alive, ignored SIGTERM, MDB_LOCK_FAILURE in its log), was SIGKILLed, and startDaemon() brought up pid 81990 on 99c6a8df. The user restarted every client session; afterwards the only MCP server is pid 87098 started 11:59:44 (after the update). Smoke 1: insrc_analyze one-shot through the restarted session returned a full grounded bundle (M, 34 files, model=opus). Smoke 2: an issue workflow run started through pid 87098 (emit_plan), continued through a NEW installed MCP process pid 88099 (plan -> emit_step s1, new token), and continued again through pid 87098 (s1 -> emit_step s2); abandoned, nothing written. Smoke 3: lsof shows only the daemon (81990) on ~/.insrc/graph.lmdb and graph.lmdb-lock; no process held anything under ~/.insrc/lance at that moment; no other node process (MCP server included) has a store path open. These are smoke checks that need the running installed daemon and a person restarting sessions, so they are reported, not run by the gate.

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
- ✓ `t13`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-fcfdd50de84fb31a.json` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/smoke.md` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `docs/standalone/decode-socket-child-process-output-utf-E20261013fcfdd50d/ISSUE.md` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/agent/providers/__tests__/mcp-sampling-provider.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/agent/providers/mcp-sampling-provider.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/__tests__/sampler-context.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/graph/__tests__/live-store-owner.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/graph/__tests__/live-store-refusal.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/fixtures/imports-store.fixture.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/fixtures/mcp-process-open.fixture.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/helpers/mcp-e2e.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/mcp-process-refused.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/sampling-bridge.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/__tests__/sampling-retired.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/forward-step.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/sampling-bridge.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-13T06:32:04.533Z)
