<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T09:01:42.169Z

**Commit:** 3602a797

## Summary

The handler runtime now takes RuntimeQueue/RuntimeIndexer interfaces instead of the concrete classes. codeIndexWorkFor may answer asynchronously, so codeReview.freshness awaits it, and collectRepoStats takes Pick<IndexQueue,'depthForRepo'>. Added IndexingPortClient (src/daemon/threads/indexing-port.ts). It reads depth, lanes and the sweep from the board, and turns enqueue, codeIndexWorkFor, addRepo and removeRepo into requests to the code-indexing worker through the new Router.request(cls, method, params, {underHold}). depthForRepo is answered only on the worker: its one caller, repo.stats, runs there. createInDaemonClient takes a route; a nested call to a method of a routed class goes to that class's worker, and a new request() method allows any unary nested call. With daemon.threads.enabled, main() now builds no IndexQueue, Watcher or IndexerService; it starts the code-indexing worker, routes indexing, and on shutdown pushes indexing.stop and waits for the drain. Single-thread behaviour is unchanged when the flag is off. A new boot test starts the real daemon entry with the flag on: it answers admin, indexing and session methods and shuts down on daemon.shutdown. Finding: the existing in-daemon client calls only session methods (workflow.review, codeReview.run/grounding/freshness, repo.resolveForCwd), so the routed path is reached through the new request().

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

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/config/__tests__/settings-catalog.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/helpers/request-worker.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/main-services.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/admin-worker.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/workers.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/repo-stats.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/indexing-port.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/daemon/threads/__tests__/threads-boot.test.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-22T09:01:42.169Z)
