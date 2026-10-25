<!-- insrc:artifact BUILD-cf81a4e98ccf7881-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-22T14:07:50.682Z  ·  **Updated:** 2026-10-22T15:06:07.961Z

**Commit:** 07e6699a

## Scope

ISSUE-cf81a4e98ccf7881: temporalTrend fails with 'integer overflow' on SQLite, MySQL and MSSQL for epoch-second timestamps. Compute the expression-path regression moments (buildExpressionRegrSql in src/daemon/db/drivers/rdbms-common.ts) in a numeric type that cannot overflow: promote x and y to a non-integer numeric before multiplying and summing. Query shape, result fields and the native REGR path are unchanged. The existing src/daemon/db/__tests__/sqlite-driver.test.ts temporalTrend test passes.

## Triage rationale

Small bugfix routed issue -> build (no LLD), per approved ISSUE-cf81a4e98ccf7881 (fix intent revised and re-approved 2026-10-22).

## Summary

Fixed ISSUE-cf81a4e9 to the revised and re-approved fix intent. The expression-path moments are taken on x centred on its minimum (a window over the filtered rows) and summed as non-integers, so epoch seconds neither overflow nor lose the slope to cancellation. readTemporalTrendRow shifts the intercept back by x0. The sqlite temporalTrend test passes and checks the intercept, and the MySQL SQL-shape test asserts the centred form.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/rdbms-common.test.ts` — **insrc-build** (2026-10-22T15:06:07.961Z)
- `src/daemon/db/__tests__/sqlite-driver.test.ts` — **insrc-build** (2026-10-22T15:06:07.961Z)
- `src/daemon/db/drivers/rdbms-common.ts` — **insrc-build** (2026-10-22T15:06:07.961Z)
