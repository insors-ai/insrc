<!-- insrc:artifact ISSUE-8c46dd22df74e445 -->

# SQLite driver and SQLite test fixtures fail outside the pinned Node ABI

## Reproduction

On a host whose `node` is 24.x (the daemon on this machine runs as `~/.nvm/versions/node/v24.21.0/bin/node`): run `npx tsx --test 'src/**/__tests__/*.test.ts'`. Observed: `import('better-sqlite3')` and `new Database(...)` throw ERR_DLOPEN_FAILED ('was compiled against a different Node.js version using NODE_MODULE_VERSION 127'), so the 'SqliteDriver (via pool)' suite fails; on a host without the `sqlite3` CLI, the analyze fixtures fail with 'fixture setup: failed to invoke sqlite3 CLI ... spawnSync sqlite3 ENOENT', taking down every seeded.sqlite / tiny-multi-lang-repo fixture test (about 40 failures). The same happens under Node 22 when the sqlite3 CLI is absent. Expected: the SQLite driver opens a database file and the SQLite fixture tests pass on any supported Node version without a system sqlite3 binary.

## Root cause

src/daemon/db/drivers/sqlite.ts imports `better-sqlite3`, a native addon whose prebuilt binary is ABI-pinned by .npmrc to Node 22.22.1 headers (modules=127); any other Node major (here 24) cannot dlopen it, so SqliteDriver cannot open a connection. The analyze test fixtures (fixtures/setup.ts buildSeededSqlite, fixtures.test.ts sqliteQuery) sidestepped that pin by shelling out to the system `sqlite3` CLI, which is an undeclared host dependency and is not installed here. Three tests (sqlite-driver.test.ts, data-runtimes.test.ts buildSqliteFixture, data-shaper.live.test.ts) also import better-sqlite3 directly to build fixture databases, inheriting the same ABI pin.

## Fix intent

Make SQLite access independent of the native-addon ABI and of any host binary by using Node's built-in `node:sqlite` module for the SqliteDriver and for every SQLite test fixture, keeping SqliteDriver's read-only, query-only behaviour and its driver contract unchanged. Remove better-sqlite3 and @types/better-sqlite3 from the dependencies and raise the declared Node engine floor to a version where `node:sqlite` is available without a flag.

## Citations

- **[[c1]]** `code` `src/daemon/db/drivers/sqlite.ts` — "import Database from 'better-sqlite3';"
- **[[c2]]** `code` `src/analyze/context/__tests__/fixtures/setup.ts` — "better-sqlite3's prebuilt binary is pinned (via .npmrc) to the daemon's deployment Node version (currently 22). Local test runs on a different Node version hit NODE_MODULE_VERSION mismatch (ERR_DLOPEN"
- **[[c3]]** `code` `src/analyze/context/__tests__/fixtures.test.ts` — "const out = execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });"
- **[[c4]]** `code` `src/daemon/db/__tests__/sqlite-driver.test.ts` — "import BetterSqlite3 from 'better-sqlite3';"
- **[[c5]]** `code` `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` — "const BetterSqlite3Mod = await import('better-sqlite3');"
- **[[c6]]** `code` `src/analyze/context/__tests__/data-shaper.live.test.ts` — "import Database from 'better-sqlite3';"
- **[[c7]]** `code` `src/daemon/db/drivers/index.ts` — "import './sqlite.js';"
- **[[c8]]** `analyze-bundle` `insrc_analyze_step: SqliteDriver usage + better-sqlite3 touchpoints (SqliteDriver entity 48630242ee83c8b1b6a2e1b987478b76; totalCallers 0, side-effect registration)`
