<!-- insrc:artifact BUILD-008e146ad1475ef9-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T14:08:41.695Z  ·  **Updated:** 2026-10-10T14:34:18.162Z

**Commit:** 1daf3d8b

## Summary

docs/daemon.md has three new parts under 'How a request's size is measured': the time limit on a live data source (its setting analyzer.dataSourceListingTimeoutMs, the default of 120 seconds, that it is per source, the two new reasons, and that an abandoned listing goes on in the background), that a run measures the area it names once, and what is read for a symbol or a file (with what is not saved yet, filed as ISSUE-61045de91faef1a0). The analyze and config suites were run at 0dadf958 (before the Story) and at d7380e11 (this task) and compared by test name: 1295 and 1310 tests, no failure in either, no result changed, one name gone by a rename, thirteen names new. The comparison and both raw outputs are in the Story's measurements folder.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-008e146ad1475ef9-S001.json` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `.insrc/artifacts/PLAN-008e146ad1475ef9-S001.json` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `docs/daemon.md` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `docs/standalone/defect-analyzer-s-request-measure-src-E20261010008e146a/S001/CR.md` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `docs/standalone/defect-analyzer-s-request-measure-src-E20261010008e146a/S001/measurements/suites-after-d7380e11.tap` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `docs/standalone/defect-analyzer-s-request-measure-src-E20261010008e146a/S001/measurements/suites-before-0dadf958.tap` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `docs/standalone/defect-analyzer-s-request-measure-src-E20261010008e146a/S001/measurements/suites-comparison-t4.md` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/orchestrator/__tests__/live-runs.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/planner/__tests__/recursive.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/planner/recursive.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/analyze/planner/types.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/config/__tests__/data-source-listing-timeout.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-10T14:34:18.162Z)
