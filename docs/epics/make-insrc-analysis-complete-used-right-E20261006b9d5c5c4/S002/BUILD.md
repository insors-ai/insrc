<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T17:04:30.339Z

**Commit:** 6ced233b

## Summary

Task t4 types AnswerReport.measure as RequestMeasure, lets reportFromLookups take a measure, and adds renderReportHead (the completeness line and, when the report has a measure, the measure line under it). completenessHeadLine returns it for a report, and the four direct writers of an answer's head (the bundle's failure text, the step tool's answer turn, the workflow runner's grounding failure, the plan tree's final report) call it. concludeRun and completeRun take an optional measure, added to the merged report after the merge. No caller supplies a measure yet, so no answer changes. One departure from the design's wording of where code lives: renderMeasureLine moved from measure.ts into completeness.ts (measure.ts re-exports it), because measure.ts loads the graph store's native module since task t3 and the head is written in the agent tools' process, which loads none; completeness.ts takes only the measure's type. prepareAnswerTurn gained an optional measure argument so its head can carry one. 13 mutations were run against the test and all are killed; the analyze, daemon and mcp suites match the Story baseline by test name.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/explore/answer-report.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/cassandra.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/clickhouse.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/dynamodb.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/mongodb.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/mssql.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/mysql.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/nats.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/oracle.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/pg.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/drivers/sqlite.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/db/list-files.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/mcp/analyze-step/answer-turn.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/mcp/bundle-md.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-10-09T17:04:30.339Z)
