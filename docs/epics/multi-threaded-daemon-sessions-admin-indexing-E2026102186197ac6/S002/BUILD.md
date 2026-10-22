<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:48:38.137Z

**Commit:** 791ba857

## Summary

Added the admin worker. src/daemon/admin-handlers.ts holds config.show, config.catalog, guide.get, guide.list, daemon.shutdown, daemon.update and daemon.updateOutcome. The main thread's handler runtime and the admin worker share these handlers, so they come from one source. The admin worker's table adds daemon.status, daemon.debug-status and repo.list. src/daemon/threads/admin-status.ts answers status and the repo list from the board's store slot and lanes plus daemon.info. It waits once, at most 5 s, for the first store publish, then reads the registry from the store as today; store health comes from the shared health word, so locks-lost gives storeFailure. src/daemon/threads/admin-worker.ts loads only the admin handlers. daemon.shutdown and daemon.update reach the main thread's shutdown through a new SHUTDOWN_OP hub op. src/daemon/threads/workers.ts starts a class worker: it picks the .js or .ts script, then registers and attaches the worker once it is ready. When threads are on, main() routes admin and starts the admin worker. If the worker fails to start, admin goes back to the main thread, and requests already held are served there (a router change, with a test). The settings-catalog source scan now reads admin-handlers.ts. The maintenance-field mutation (always setting the field, undefined when idle) is invisible on the wire, because JSON drops undefined.

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

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/config/__tests__/settings-catalog.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/__tests__/helpers/request-worker.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/__tests__/main-services.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/__tests__/admin-worker.test.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
- `src/daemon/threads/workers.ts` — **insrc-build** (2026-10-22T08:48:38.137Z)
