<!-- insrc:artifact BUILD-86197ac660732ceb-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-28T06:11:04.160Z  ·  **Updated:** 2026-10-28T11:32:55.336Z

**Commit:** d3224a1c4

## Summary

Acceptance tests ac1-ac6 over the spawned threaded daemon (socket, test hooks, 2 s idle timeout); they found and drove a fix to the router's started/ended reporting (faec08d3d).

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

- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/registry.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/__tests__/workflow-run-registry.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/helpers/run-board-worker.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/workflow-run-registry.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/helpers/shared-fake-worker.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/indexing-port.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/maintenance-lock.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/purge-shared.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `.insrc/artifacts/PLAN-86197ac660732ceb-s3.json` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/session-worker.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/session-worker.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/shared-state-worker.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/session-pool.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/session-pool.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/router-session.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/session-failure.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/session-routing.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/threads-boot.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
- `src/daemon/threads/__tests__/s3-acceptance.test.ts` — **insrc-build** (2026-10-28T11:32:55.336Z)
