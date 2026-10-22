<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:29:13.498Z

**Commit:** 8679c338

## Summary

DocSummarySweepDeps.takeEdit now returns a Promise and runDocSummarySweep awaits it. That await comes before the document read, and the final shouldStop/isCodeIdle checks still run after the last await, immediately before summarise. IndexerService wraps the queue's synchronous takeDocSummaryEdit in an async function. The sweep test's stub is now async. summary-sweep-progress.test.ts overrides the queue's own synchronous method, which did not change, so it needed no edit. A new test uses a takeEdit that answers a macrotask later, with code work arriving during the lookup just before a document read. It checks that no summary starts while code is queued and that an edit queued mid-sweep runs before the next document. Removing the final isCodeIdle check makes it fail.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T08:29:13.498Z)
