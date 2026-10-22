<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:41:28.673Z

**Commit:** 68147045

## Summary

Added Router (src/daemon/threads/router.ts), the IpcServer's forward on the main thread. It classifies each request with classOf. A routed class goes as a RequestEnvelope to the worker registered for it, and that worker's replies and frames come back over the channel attached for it (attach/detach). Other requests run through the local directDispatch, as before. A request whose class has no registered worker is held until one registers and is attached (targetsChanged), for at most holdMs (30 s by default); after that it is answered "the daemon's <class> thread is not available". On socket close, a stream gets a CancelEnvelope on its worker; a unary request is left to finish and its late reply is dropped. detach() returns a dead worker's in-flight requests, for the supervisor (t14) to fail. With daemon.threads.enabled, main() now uses the router as the server's forward with no class routed yet: each class is routed once its worker exists (admin in t10, indexing in t11). The server's registry hook publishes clients to the board before each request is forwarded.

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

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/config/__tests__/settings-catalog.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/__tests__/helpers/request-worker.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/__tests__/main-services.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-22T08:41:28.673Z)
