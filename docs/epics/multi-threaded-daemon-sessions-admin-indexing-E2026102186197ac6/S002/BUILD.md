<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T13:50:51.563Z

**Commit:** 7aacd619

## Summary

Ran the cross-cutting proof and turned daemon threads on by default. Flipping the default exposed three defects, all fixed. (1) @lancedb/lancedb 0.27.2 crashed the process when one thread searched while another wrote; it is upgraded to 0.40.0, with a cross-thread regression test that fails on 0.27.2, and compactEntityVecTable now prunes twice for 0.40's behaviour. (2) Index-run figures and registry status never left the code-indexing worker; they now go through the status board, with the store slot published before the runs. (3) The repo-completeness test raced on that publish order. Added the admin p99 latency and session-request isolation tests and a daemon-ctl smoke test. The full sweep shows 678 of 681 files passing; two of the failures predate this work (sqlite-driver temporalTrend integer overflow, review-decision /var vs /private/var), and the third (repo-completeness) has been fixed and passed 5 of 5 runs.

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
- ✓ `t16`
- ✗ `t17`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/config/__tests__/settings-catalog.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/helpers/request-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/main-services.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/worker-requests.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/admin-worker.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/admin-status.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/admin-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/workers.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/repo-stats.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/indexing-port.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/threads-boot.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/summary-worker.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/summary-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/helpers/exit-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/helpers/hold-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/summary-link.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/supervisor.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/indexing-workers.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/supervisor.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/shared/locks/lock-manager.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/prune-timer.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/maintenance-lock.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/maintenance-entry.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/todos-rpc.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/understanding-rpc.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/shared/locks/maintenance-lock.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/db/graph/__tests__/compact-crash-recovery.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/maintenance.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/helpers/deaf-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/helpers/store-worker.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/maintenance.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/shared/locks/__tests__/lock-manager.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/latency-isolation.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/indexer/run-record.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/mcp/__tests__/helpers/mcp-e2e.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `package-lock.json` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `package.json` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/db/lance/__tests__/helpers/cross-thread-writer.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/db/lance/__tests__/lance-cross-thread.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/db/lance/entity-vec.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
- `src/daemon/threads/__tests__/daemon-ctl-smoke.test.ts` — **insrc-build** (2026-10-22T13:50:51.563Z)
