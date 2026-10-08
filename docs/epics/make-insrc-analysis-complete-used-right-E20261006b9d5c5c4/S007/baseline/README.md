# Story s7: test baseline

Taken on 2026-10-08 at commit `f56c9802` (the approval of the Story's build plan), on an unchanged tree, before the first change of the Story. Node 22, `npx tsx --test --test-force-exit --test-reporter=tap 'src/<suite>/**/*.test.ts'`.

| Suite | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| analyze | 1045 | 950 | 0 | 92 |
| mcp | 390 | 390 | 0 | 0 |
| daemon | 772 | 755 | 1 | 16 |
| workflow | 1579 | 1577 | 0 | 2 |

The one failure is `SqliteDriver (via pool)` in the daemon suite. It fails before this Story and is not part of it.

The four `.txt` files hold the result line of every top-level test of each suite (`ok` or `not ok`, with its name). The Story's last Task compares the suites against them: no test that is `ok` here may fail afterwards, other than the tests of the three removed scope functions.
