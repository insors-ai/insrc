<!-- insrc:artifact ISSUE-45c7e29c8294ce1b -->

# SQLite temporalTrend fails with 'integer overflow' on real timestamps

## Reproduction

Run `npx tsx --test src/daemon/db/__tests__/sqlite-driver.test.ts`. The case 'temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)' seeds ten rows with ISO timestamps one second apart from 2025-01-01 and calls temporalTrend on them. Observed: the query fails with `Error: integer overflow` (ERR_SQLITE_ERROR, 'SQL logic error'). The same query `SELECT SUM(unixepoch(ts) * unixepoch(ts)) FROM e` over four such rows overflows identically on node:sqlite (SQLite 3.53.4 and 3.51.2) and on better-sqlite3 12.11.1 (SQLite 3.53.2). Expected: temporalTrend returns n = 10, slope ≈ 3 per second and R² ≈ 1.

## Root cause

compileTemporalTrend in src/daemon/db/drivers/rdbms-common.ts uses the dialect's epochExpr as the regression's x value and, for dialects without native REGR_* support, builds the query with buildExpressionRegrSql, which sums x, x·x, y·y and x·y. The SQLite dialect sets `epochExpr: (col) => unixepoch(col)` and `supportsNativeRegr: false`, and unixepoch returns an INTEGER number of seconds. Present-day epoch seconds are about 1.7e9, so each x·x is about 3e18, and SQLite's SUM over all-integer inputs raises 'integer overflow' once the total passes the 64-bit limit of about 9.2e18 — after three or four rows. Three other dialects also take the expression-based path with an integer epoch expression (UNIX_TIMESTAMP, DATEDIFF_BIG(SECOND, ...), toUnixTimestamp); only SQLite has been reproduced.

## Fix intent

Make the expression-based temporal regression compute its moments without integer overflow for real-world timestamps, so SQLite's temporalTrend returns the correct slope, intercept, R² and timestamp range, and confirm the other expression-based dialects are not exposed to the same overflow. The native-REGR dialects' behaviour and the temporalTrend result contract stay unchanged.

## Citations

- **[[c1]]** `code` `src/daemon/db/drivers/rdbms-common.ts` — "epochExpr: (col) => `unixepoch(${col})`,"
- **[[c2]]** `code` `src/daemon/db/drivers/rdbms-common.ts` — "`  SUM(CASE WHEN ${pair} THEN ${xExpr} * ${xExpr}       END) AS sxx,`,"
- **[[c3]]** `analyze-bundle` `insrc_analyze_step: dialect epochExpr / supportsNativeRegr table in rdbms-common.ts (lines 101-176), compileTemporalTrend 48611f510da3e5ee9b3a1ff234e26247, buildExpressionRegrSql afb913ee1d2ebe6f13c0eb47a1a11acd, executeTemporalTrend 596c11bafe55db7483cb7a1d8385098f, caller SqliteDriver.temporalTrend 278550581864461856b3a7078a7ac994`
- **[[c4]]** `code` `src/daemon/db/__tests__/sqlite-driver.test.ts` — "temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)"
- **[[c5]]** `step-output` `Reproduction: SUM(unixepoch(ts)*unixepoch(ts)) over four 2025 timestamps raises 'integer overflow' on node:sqlite (Node 24 / SQLite 3.53.4, Node 22 / SQLite 3.51.2) and better-sqlite3 12.11.1 (SQLite 3.53.2).`
