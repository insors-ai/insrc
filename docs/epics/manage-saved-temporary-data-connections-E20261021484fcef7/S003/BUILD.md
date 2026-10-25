<!-- insrc:artifact BUILD-484fcef7efaf229e-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T13:49:15.323Z  ·  **Updated:** 2026-10-25T16:07:36.903Z

**Commit:** 449b3b87c

## Summary

Task1 explicit saved/missing-policy production guards are accepted. Corrected the remaining inventory gap: signature-declaration provenance now covers injected typeof embedQuery ports, renamed members and destructured aliases, alongside ONNX callable tensor ports and SDK backends.405 source files/4184 candidate sites remain classified with readable site entries; temporary release disabled. All remaining implementation tasks and external evidence pending.

## Tasks validated

- ✗ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-484fcef7efaf229e-s3.json` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/daemon/db/__tests__/connection-source-inventory.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/daemon/db/__tests__/session-source-inventory.test.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/daemon/request-context.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/daemon/tools/types.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/shared/__tests__/connection-execution.test.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/connection-access.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/runtimes/data/discovery-connections.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
- `src/analyze/runtimes/data/schema-table.ts` — **insrc-build** (2026-10-25T16:07:36.903Z)
