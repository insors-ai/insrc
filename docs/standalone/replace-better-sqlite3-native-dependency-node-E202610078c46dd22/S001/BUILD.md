<!-- insrc:artifact BUILD-8c46dd22df74e445-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-07T10:38:10.314Z

**Commit:** 88910a74

## Scope

Fix ISSUE-8c46dd22df74e445: replace better-sqlite3 with Node's built-in node:sqlite (DatabaseSync) in src/daemon/db/drivers/sqlite.ts (keep read-only, query_only, fileMustExist semantics and the driver contract), in the tests that import better-sqlite3 (src/daemon/db/__tests__/sqlite-driver.test.ts, src/analyze/runtimes/data/__tests__/data-runtimes.test.ts, src/analyze/context/__tests__/data-shaper.live.test.ts) and in the analyze fixtures that shell out to the sqlite3 CLI (src/analyze/context/__tests__/fixtures/setup.ts, src/analyze/context/__tests__/fixtures.test.ts); drop better-sqlite3 and @types/better-sqlite3 from package.json; raise engines.node to >=22.13.0.

## Triage rationale

bugfix (small): one production driver class plus test fixtures; one obvious approach.
