<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:24:16.622Z

**Commit:** 021748c3

## Summary

Added StatusBoard.publishLane(lane, status, sweep?) with its 'board.publishLane' hub op and a StatusBoardClient.publishLane method. The board keeps both lanes; the summary lane's publisher sets or clears the sweep; idle means both lanes are at depth 0 and not processing. Added queueStatusFromBoard (status.ts), which maps the board's lanes to daemon.status's queueDepth and queueLanes through composeQueueLanes, as today. RepoStatusSnapshot.completeness is now optional; RequestEnvelope has an optional underHold; DaemonStatus has an optional maintenance {state:'compacting', since (ISO), activity, reason}. Nothing sets these new fields yet. The existing board and status suites pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:24:16.622Z)
