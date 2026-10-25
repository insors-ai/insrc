<!-- insrc:artifact BUILD-484fcef7efaf229e-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T13:49:15.323Z  ·  **Updated:** 2026-10-25T17:14:45.564Z

**Commit:** 19f388876

## Summary

S003 task3 adds32 root/audience/control-generation-bound data delegations with independent digest domains and multiple data sockets per token. Data transports cannot bootstrap/resume/heartbeat/end/delegate; control transports cannot attach as data. Resume/end invalidate all bindings before synchronous abort observers, cancel signals, preserve sticky socket roles and prevent late attach publication.11 owner regressions plus inventory pass; production RPC registration remains t4 and release disabled. Concurrent model-definition Story changes remain separate.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-484fcef7efaf229e-s3.json` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/db/__tests__/connection-source-inventory.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/db/__tests__/session-source-inventory.test.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/request-context.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/tools/types.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/shared/__tests__/connection-execution.test.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/connection-access.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/runtimes/data/discovery-connections.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/runtimes/data/schema-table.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/connection-management-rpc.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/db/__tests__/session-owner.test.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/db/management-root.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/daemon/db/session-owner.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
- `src/shared/connection-management.ts` — **insrc-build** (2026-10-25T17:14:45.564Z)
