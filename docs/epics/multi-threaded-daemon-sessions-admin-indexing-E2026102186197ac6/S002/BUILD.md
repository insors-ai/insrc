<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:55:51.332Z

**Commit:** b4c98ee7

## Summary

Added the code-indexing worker (src/daemon/threads/indexing-worker.ts). It hosts IndexQueue (both lanes, writing the indexing shared block and publishing lanes with the sweep), the Watcher and the IndexerService, as main() does. It serves every indexing-class method through buildHandlerRuntime over its own queue and indexer, plus the indexing port's internal methods (src/daemon/threads/indexing-port.ts: enqueue, codeIndexWorkFor, depthForRepo, addRepo, removeRepo, takeDocSummaryEdit). The store slot (repos with completeness, and the unattributed count) is published before the queue starts and after every method and job; publishes are serialized. Shutdown: an 'indexing.stop' push stops the queue, awaits watcher.close() and the drain, then reports 'indexing-drained'. Awaiting the close matters because an in-flight @parcel/watcher call at worker teardown aborts the whole process (napi fatal), which surfaced while building this. Two deliberate limits: (1) main() does not start this worker yet, because main still builds its own indexer; t12 moves the indexing objects off the main thread and switches the worker on. (2) daemon.compact on the worker keeps today's busy refusal, but when idle it errors instead of compacting. With threads, every thread holds the graph environment open, so a compaction here could rename the file under live handles; the main thread's maintenance (t16) does it safely and gives today's CompactResult. The repo.stats responses equal the single-thread daemon's, and so does the busy refusal's text shape.

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

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/config/__tests__/settings-catalog.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/helpers/request-worker.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/main-services.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/admin-worker.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/workers.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-10-22T08:55:51.332Z)
