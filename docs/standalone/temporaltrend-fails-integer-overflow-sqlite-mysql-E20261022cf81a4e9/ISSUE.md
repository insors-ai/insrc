<!-- insrc:artifact ISSUE-cf81a4e98ccf7881 -->

# temporalTrend fails with 'integer overflow' on SQLite, MySQL and MSSQL for epoch-second timestamps

## Reproduction

Seed a SQLite table with 10 rows: ts as ISO datetimes one second apart starting 2025-01-01T00:00:00Z, and val = 2 + 3*i. Register it as a sqlite connection and call the driver's temporalTrend(table, { timestampColumn: 'ts', valueColumn: 'val' }). Observed: the query fails with the SQLite error 'integer overflow'. Expected: slope 3 per second, R² 1, and n 10. The existing test 'temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)' in src/daemon/db/__tests__/sqlite-driver.test.ts does exactly this and fails.

## Root cause

Engines without native REGR_* (SQLite, MySQL, MSSQL) compute the regression from moments, which buildExpressionRegrSql in src/daemon/db/drivers/rdbms-common.ts builds as SUM(x*x), SUM(x*y), SUM(y*y), SUM(x) and SUM(y). Here x is the dialect's epoch expression, an INTEGER of about 1.7e9 for present-day timestamps. x*x is therefore about 3e18, and summing it over just a few rows exceeds the signed 64-bit range. SQLite raises 'integer overflow' on an integer SUM that overflows; MySQL and MSSQL fail the same way on BIGINT. The engine-native path (REGR_SLOPE and the rest) is not affected.

## Fix intent

Compute the moments in a numeric type that cannot overflow at these magnitudes: promote x and y to a non-integer numeric before they are multiplied and summed (REAL on SQLite, exact DECIMAL on MySQL and MSSQL). The query shape, the result fields and the native REGR path stay as they are. The existing test passes and recovers slope 3, R² 1 and n 10.

## Citations

- **[[c1]]** `code` `src/daemon/db/drivers/rdbms-common.ts:1815-1835` — "SUM(CASE WHEN ${pair} THEN ${xExpr} * ${xExpr}       END) AS sxx,"
- **[[c2]]** `code` `src/daemon/db/drivers/rdbms-common.ts:1771-1793` — "const xExpr = dialect.epochExpr(tsCol);"
- **[[c3]]** `code` `src/daemon/db/drivers/sqlite.ts:303-313`
- **[[c4]]** `code` `src/daemon/db/__tests__/sqlite-driver.test.ts:267-307` — "temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)"
