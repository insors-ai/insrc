<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T16:51:48.292Z

**Commit:** 326409ee

## Summary

Task t3 adds the measuring pass to src/analyze/measure.ts: measureRequestScope resolves a request's scope and counts it without throwing, measureResolvedScope counts the stored area (code, docs, generic), the files of the infra tasks' own walk with no cap (infra) or the live source (a connection or a data request), and measureDataSource counts tables, namespaces or files through the complete mode of the driver's listing. A scope that cannot be counted is not determined, with size XL and its reason. dataScopeOf in the data runtimes' shared module is now the one rule from a resolved scope to a pool path, used by resolveDataScope and by the measure. Eight tests in measure-pass.test.ts; 30 mutations were run and all are killed; the analyze and daemon suites match the Story baseline by test name.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/cassandra.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/clickhouse.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/dynamodb.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/mongodb.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/mssql.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/mysql.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/nats.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/oracle.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/pg.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/drivers/sqlite.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/daemon/db/list-files.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-10-09T16:51:48.292Z)
