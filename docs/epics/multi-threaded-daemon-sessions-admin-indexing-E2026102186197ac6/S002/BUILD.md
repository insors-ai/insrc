<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:26:15.345Z

**Commit:** 7fb004d7

## Summary

compactGraphStore takes optional opts.beforeRename, run after the close and before the rename. If it resolves false, the compacted copy is removed and the original store is reopened, and the call rejects with LmdbStoreError('compact: the environment was still open; nothing renamed'); graph.lmdb and its lock file are not touched. Without the hook, or with a hook that resolves true, behaviour is unchanged. Two tests were added to compact.test.ts, and the six existing compaction tests pass. A mutation that drops the explicit reopen survives, because getGraphStore reopens the store lazily on its next use, so behaviour is the same either way. The explicit reopen is kept to match the success path.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/db/graph/__tests__/compact.test.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-22T08:26:15.345Z)
