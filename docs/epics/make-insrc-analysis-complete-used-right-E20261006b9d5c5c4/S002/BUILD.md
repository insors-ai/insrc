<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T17:54:15.733Z

**Commit:** a2343fb2

## Summary

Task t6 makes the context builder the one writer of the size in the lookup pipeline. Its run input takes an intent whose size is not read and an optional sizeHint; it measures the named area (measureResolvedScope) for the planning call and for the executor's new optional requestSize, measures the lookup results for the answer step, and passes that measure to reportFromLookups. The cache key leaves out the intent's size and the hint, and a cached bundle's measure is given the current call's hint. The one-shot tool sends an intent with no size and a stated size only as sizeHint; the workflow runner sends none; the daemon's buildRun request accepts an intent with no size and an optional sizeHint. Built in one commit with t7 (a2343fb2), because this Task's first named test also covers the step tool and the free-form lookup. One addition the design did not name: measureLookupResults no longer throws on an output that is not shaped as its type says (it names the lookup in the measure's note), since the measure is now taken in the pipeline between the lookups and the answer. Two small functions were extracted or exposed so the callers can be tested: oneShotRunParams in the MCP server and _groundingIntentForTest in the workflow runner. Existing tests whose expected values changed by design were updated (reports now carry a measure; the steps are handed the measured size; the cache key formula). 38 mutations were run across the Tasks' test files; five survived the first run, each was closed with a new assertion, and all are killed. The analyze, daemon and mcp suites match the Story baseline by test name.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/explore/answer-report.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/orchestrator/__tests__/live-runs.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/planner/__tests__/recursive.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/planner/recursive.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/__tests__/analyze-run-empty-prompt.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/cassandra.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/clickhouse.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/dynamodb.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/mongodb.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/mssql.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/mysql.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/nats.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/oracle.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/pg.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/drivers/sqlite.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/db/list-files.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/__tests__/analyze-step-answer-prompt-missing.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/__tests__/analyze-step-bundle-report.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/__tests__/analyze-step-measure.test.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/analyze-step/answer-turn.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/analyze-step/phases/bundle.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/analyze-step/phases/plan.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/analyze-step/phases/start.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/analyze-step/state.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/bundle-md.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-10-09T17:54:15.733Z)
