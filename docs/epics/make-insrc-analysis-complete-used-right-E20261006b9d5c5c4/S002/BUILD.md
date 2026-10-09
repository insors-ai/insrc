<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T16:41:15.265Z

**Commit:** ed05329b

## Summary

listTables and listNamespaces take an optional `complete`. In that mode sqlite, pg and mysql apply no clamp and send no LIMIT; oracle and mssql build their query without FETCH FIRST and TOP; the MongoDB, Cassandra and DynamoDB drivers apply no limit; NATS lists its one bucket as before. Redis and etcd ignore the mode and ClickHouse's listing still throws. The file listing's limit is optional and walkFiles takes null for no cap. Without the new option every listing behaves as before. Two things beyond the plan's text: the twelve driver classes are now exported, so that each driver's own listing method can be run in a test against a stand-in client (the networked drivers had no listing test before); and the file walk has its own test file. Whether a ClickHouse source is 'not determined' is decided by the measuring pass of the next Task; this Task's test shows that its listing throws in either mode. Twelve mutations were run, one per driver and listing, and each fails a test. The daemon and analyze suites have no test that passed in the baseline and fails now.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/cassandra.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/clickhouse.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/dynamodb.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/mongodb.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/mssql.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/mysql.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/nats.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/oracle.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/pg.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/drivers/sqlite.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/daemon/db/list-files.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-10-09T16:41:15.265Z)
