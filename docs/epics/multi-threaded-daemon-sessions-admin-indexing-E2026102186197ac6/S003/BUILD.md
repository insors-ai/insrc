<!-- insrc:artifact BUILD-86197ac660732ceb-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-28T06:11:04.160Z  ·  **Updated:** 2026-10-28T11:10:37.130Z

**Commit:** 364788cb5

## Summary

The router routes session-class requests through the session pool: shared-state methods to the shared-state worker, others to the session's worker or the unattributed worker; a per-session FIFO sends each request only after the previous one ended (FIFO-exempt methods and unattributed requests are not queued); connection-scoped requests stay on the main thread.

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

- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/registry.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/__tests__/workflow-run-registry.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/helpers/run-board-worker.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/workflow-run-registry.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/helpers/shared-fake-worker.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/indexing-port.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/maintenance-lock.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/purge-shared.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `.insrc/artifacts/PLAN-86197ac660732ceb-s3.json` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/session-worker.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/indexing-port.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/session-worker.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/shared-state-worker.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/session-pool.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/session-pool.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
- `src/daemon/threads/__tests__/router-session.test.ts` — **insrc-build** (2026-10-28T11:10:37.130Z)
