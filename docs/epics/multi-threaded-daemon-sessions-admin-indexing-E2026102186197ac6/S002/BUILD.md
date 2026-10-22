<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:37:57.250Z

**Commit:** 6c0bef54

## Summary

Added ThreadServices (src/daemon/threads/main-services.ts). It creates the guard, lock and indexing blocks and installs the guard and lock blocks on the main thread, together with the shared step-state store. It serves one hub per worker channel with the board, step state, store health and a daemon.info op; connectWorker() returns the worker's workerData, transfer list and the main thread's port. setEmbedderBackend pushes the decided backend to live workers and to every later one when it connects, and startDaemonWorker applies it with setActiveEmbedderBackend. Added serveRequests (src/daemon/threads/worker-requests.ts), the worker request entry. It serves request envelopes with a forward (directDispatch), relays frames, and aborts on a cancel envelope. A reply or frame that cannot be cloned is answered with 'the result of <method> could not be returned: …'. With INSRC_TEST_HOOKS=1 it also answers test.servingThread with the thread id. daemon.threads.enabled is a new catalog row (boolean, default false, group General) with a fail-safe reader. main() creates ThreadServices only when the flag is on, and pushes the backend once bootstrapEmbeddingModel settles; with the flag off nothing changes. The catalog row-count contract test moved from 38 to 39. Four more source-scan tests were pointed at handler-runtime.ts, where t1 moved the handler tables: settings-catalog, artifact-feedback-handler-contract, artifact-content and review-decision. The one remaining review-decision failure is the pre-existing macOS /private/var path mismatch, unrelated to this work.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/config/__tests__/settings-catalog.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/__tests__/helpers/request-worker.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/__tests__/main-services.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T08:37:57.250Z)
