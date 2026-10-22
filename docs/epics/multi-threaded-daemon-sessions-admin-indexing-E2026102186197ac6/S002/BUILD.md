<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:32:18.528Z

**Commit:** 71c15a71

## Summary

Added src/daemon/threads/indexing-block.ts. createIndexingBlock() creates the shared block. IndexingBlock has two shared flags, codeBusy (the index lane has a job running or queued) and stopping, plus waitForCodeIdle, which waits without blocking on a version word with a keep-alive timer. IndexQueue takes optional { indexingBlock, publishLane, sweepProgress }. At every lane change it writes codeBusy and publishes that lane's depth and processing state; the summary lane also carries the sweep from sweepProgress, and lanesChanged() republishes it. stop() sets stopping. New pause()/resume() stop both lanes from taking new jobs; pause() resolves once nothing is in flight, and stop() also releases paused loops. Lane order, the summary yield and stop/drain are unchanged, and summary-lane jobs can go to another thread through the existing processor argument without any change. Design note: the queue is the single publisher of both lanes, so a separate sweep publisher can never clear the summary lane's state; the summary worker's sweep progress reaches the board through sweepProgress. Existing queue suites pass.

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

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/__tests__/queue-threads.test.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
- `src/daemon/threads/indexing-block.ts` — **insrc-build** (2026-10-22T08:32:18.528Z)
