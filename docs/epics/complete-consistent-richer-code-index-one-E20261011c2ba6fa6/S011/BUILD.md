<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T12:13:21.637Z

**Commit:** 482c94d7

## Summary

New src/daemon/steps/daemon-client.ts: StepDaemonClient (reviewArtifactStream, codeReviewStream, fetchCodeReviewGrounding, fetchCodeReviewFreshness, resolveRepoForCwd, in the socket client's shapes), installStepDaemonClient/stepDaemonClient, and createInDaemonClient(unary, stream) built from request handler maps. src/daemon/index.ts now builds its two maps as consts (rpcHandlers, streamHandlers), installs createInDaemonClient(rpcHandlers, streamHandlers), then passes the same maps to new IpcServer, so the handlers are not duplicated and no loopback socket is opened. The client keeps reviewStreamRequest's failures: the wait limit gives 'timeout', an aborted signal 'aborted' (so review-step and code-review keep the code daemon-review-aborted, not retryable), an 'error' frame or a throwing handler 'daemon-error' with the frame's reason (diff-unavailable is carried through, and the code-review step reports a failed daemon review naming the cause, as T17 has it over the socket). A timeout or abort also aborts the stream handler's own signal, so the inner review run ends. resolve-repo.ts, review-step/phases/start.ts, review-step/types.ts and code-review-step/handler.ts no longer import src/mcp/daemon-stream.ts; the review types come from src/shared/review-stream.ts, which now also holds the grounding/freshness reply shaping used by both clients. ReviewStepDeps and CodeReviewStepDeps gain an optional signal passed to the two daemon waits. Interim until t9: the MCP server, which still runs these handlers in-process, installs the socket client (daemon-stream functions) when it is built. Falsifying mutations (abort mapped to closed, inner run not aborted, reason dropped, either signal not passed, a loopback through daemon-stream, a daemon-stream import put back) each fail a test. Full sweep in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md: nothing newly failing.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T12:13:21.637Z)
