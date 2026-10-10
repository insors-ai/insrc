<!-- insrc:artifact BUILD-008e146ad1475ef9-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T14:08:41.695Z  ·  **Updated:** 2026-10-10T14:18:34.157Z

**Commit:** 15a3b403

## Summary

RunShapeInput has an optional `measure`; the exploration pipeline uses a handed measure of a named area or a data source for its planning call (also when it is not determined) and measures only when handed none or one of lookup results; the cache key already leaves everything but the unsized intent out, so it does not depend on the handed measure. The run driver passes its signal to its one measure and to the planner's options and hands the measure to buildRunBundle; the plan RPC hands its measure to buildRunBundle; the recursive planner passes the signal to the measure of each child plan. One thing beyond the task's list: the measure reads a signal that cannot be read as one that has not fired, so the pass still never throws, and the run test that raised its error at the second reading of the signal (which is now the measure's) raises it at the plan stage's own reading instead. That the run driver hands its signal to the planner is checked by reading the driver's source; the other hand-offs are checked by behaviour. Seven falsifying mutations were each caught.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-008e146ad1475ef9-S001.json` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/orchestrator/__tests__/live-runs.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/planner/__tests__/recursive.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/planner/recursive.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/analyze/planner/types.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/config/__tests__/data-source-listing-timeout.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-10T14:18:34.157Z)
