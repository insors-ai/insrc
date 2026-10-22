<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T11:17:33.745Z

**Commit:** aef1dc6d

## Summary

Added the daemon maintenance lock at every entry point. The router (main-thread requests) and the worker request entry take 'daemon.maintenance' shared with no wait, and a refused request gets a "daemon busy" answer built from the holder's metadata. daemon.status and daemon.compact are exempt, and so are the two subscription streams, which hold the lock per refresh instead. Nested calls are marked underHold. The prune timer, todo retention and indexing jobs wait for the lock with a bounded wait. getGraphStore rejects with MaintenanceInProgressError on any thread other than the one compacting.

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
- ✓ `t14`
- ✓ `t15`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/config/__tests__/settings-catalog.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/helpers/request-worker.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/main-services.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/admin-worker.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/workers.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/repo-stats.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/indexing-port.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/threads-boot.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/summary-worker.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/summary-worker.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/helpers/exit-worker.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/helpers/hold-worker.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/summary-link.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/supervisor.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/indexing-workers.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/supervisor.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/prune-timer.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/__tests__/maintenance-lock.test.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/threads/maintenance-entry.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/todos-rpc.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/daemon/understanding-rpc.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
- `src/shared/locks/maintenance-lock.ts` — **insrc-build** (2026-10-22T11:17:33.745Z)
