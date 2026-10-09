<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T17:24:58.342Z

**Commit:** 64f0a0ff

## Summary

Task t5 makes the plan tree and the daemon's requests use the measured size. runAnalyze calls measureRequestScope after either classification branch and before the run context is built, sets the intent's size from it and passes a stated size as the hint; pickScope is no longer called and the classify stage's step is 'measure'. The measure is on the classified event, in the run record and on the merged report. The recursive planner measures a child plan when it is spawned (the model's figure is the hint, never the fallback) and keeps the child's measure on its tree node. The daemon's plan and classify requests measure the intent's scope and return the measure; planDepthScope gives the size the depth cap is read for (measured at depth 0, the caller's root size at a greater depth). One addition the design did not name: runPlanner now stamps the plan's size from the intent, because the task band was read for the size the model wrote in its own plan. Two test seams were added (_setClassifyForTest, _setClassifierForTest) because the classifier's own context build is a tool loop on a local model. Existing tests changed: live-runs.test.ts holds its runs in the measuring pass (they were held in the size-picking call), recursive.test.ts gets a stand-in store, and two assertions that expected the stated size as the size now expect the measured one. Limit: at depth 0 no request can exceed a depth cap, so the depth-0 rule is asserted on planDepthScope and not through a refused request. 20 mutations were run and all are killed; the analyze, daemon and mcp suites match the Story baseline by test name.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/explore/answer-report.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/orchestrator/__tests__/live-runs.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/planner/__tests__/recursive.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/planner/recursive.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/__tests__/analyze-run-empty-prompt.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/cassandra.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/clickhouse.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/dynamodb.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/mongodb.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/mssql.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/mysql.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/nats.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/oracle.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/pg.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/drivers/sqlite.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/db/list-files.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/mcp/analyze-step/answer-turn.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/mcp/bundle-md.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-10-09T17:24:58.342Z)
