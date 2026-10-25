<!-- insrc:artifact BUILD-484fcef7efaf229e-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T13:49:15.323Z  ·  **Updated:** 2026-10-25T16:16:44.451Z

**Commit:** 209339de4

## Summary

Task1 adds explicit frozen, nonserializable execution contracts and production staged fail-closed entry guards, including ShapeOpts and RunAnalyzeOpts paths before state/cache access. Typed inventory now records5077 sites across460 files, covering typed/aliased/inherited/call-bound providers, ONNX and injected embedding ports, JSON/MessagePack/binary codecs, transport serialization and unresolved dynamic calls with explicit file classifications. Focused tests and typecheck pass; actual session ownership and all later tasks remain pending and release disabled.

## Tasks validated

- ✗ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-484fcef7efaf229e-s3.json` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/daemon/db/__tests__/connection-source-inventory.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/daemon/db/__tests__/session-source-inventory.test.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/daemon/request-context.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/daemon/tools/types.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/shared/__tests__/connection-execution.test.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/connection-access.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/explore/db-connections-list.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/explore/db-table-describe.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/explore/db-tables-list.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/runtimes/data/discovery-connections.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
- `src/analyze/runtimes/data/schema-table.ts` — **insrc-build** (2026-10-25T16:16:44.451Z)
