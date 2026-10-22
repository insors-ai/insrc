<!-- insrc:artifact ISSUE-cf81a4e98ccf7881 -->

# temporalTrend fails with 'integer overflow' on SQLite, MySQL and MSSQL for epoch-second timestamps

## Reproduction

Seed a SQLite table with 10 rows: ts as ISO datetimes one second apart starting 2025-01-01T00:00:00Z, and val = 2 + 3*i. Register it as a sqlite connection and call the driver's temporalTrend(table, { timestampColumn: 'ts', valueColumn: 'val' }). Observed: the query fails with the SQLite error 'integer overflow'. Expected: slope 3 per second, R² 1, and n 10. The existing test 'temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)' in src/daemon/db/__tests__/sqlite-driver.test.ts does exactly this and fails.

## Root cause

Engines without native REGR_* (SQLite, MySQL, MSSQL) compute the regression from moments, which buildExpressionRegrSql in src/daemon/db/drivers/rdbms-common.ts builds as SUM(x*x), SUM(x*y), SUM(y*y), SUM(x) and SUM(y). Here x is the dialect's epoch expression, an INTEGER of about 1.7e9 for present-day timestamps. x*x is therefore about 3e18, and summing it over just a few rows exceeds the signed 64-bit range. SQLite raises 'integer overflow' on an integer SUM that overflows; MySQL and MSSQL fail the same way on BIGINT. The engine-native path (REGR_SLOPE and the rest) is not affected.

## Fix intent

Compute the regression moments so they can neither overflow nor lose the slope to rounding: take them on the timestamps centred on their earliest value (within the same filtered rows) and sum them as non-integers, then move the intercept back by that earliest value when the result is read. Promoting to non-integers alone is not enough: the moments of raw epoch seconds are about 3e19 and differ only in their last digits, so a floating-point sum returns a wrong slope (0.06 instead of 3 on the test data). The query therefore gains a derived table with a window function (MIN ... OVER ()), which needs SQLite 3.25+, MySQL 8.0+ or any MSSQL, and the reader shifts the intercept. The result fields and the native REGR path stay as they are. The existing sqlite-driver temporalTrend test passes and also checks the intercept.

## Citations

- **[[c1]]** `code` `src/daemon/db/drivers/rdbms-common.ts:1815-1835` — "SUM(CASE WHEN ${pair} THEN ${xExpr} * ${xExpr}       END) AS sxx,"
- **[[c2]]** `code` `src/daemon/db/drivers/rdbms-common.ts:1771-1793` — "const xExpr = dialect.epochExpr(tsCol);"
- **[[c3]]** `code` `src/daemon/db/drivers/sqlite.ts:303-313`
- **[[c4]]** `code` `src/daemon/db/__tests__/sqlite-driver.test.ts:267-307` — "temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)"
