# Story s2: test baseline

Taken on 2026-10-09 at commit `cc7df0d9` (the approval of the Story's build plan), on a clean tree, before the first source change of the Story. Node 22.23.2. No run uses the force-exit flag.

| Suite | Command | Result |
|---|---|---|
| analyze (with the planner and the classifier) | `npx tsx --test 'src/analyze/**/*.test.ts'` | 1099 tests: 1004 pass, 0 fail, 92 skipped, 3 todo |
| daemon (with the data drivers) | `npx tsx --test 'src/daemon/**/*.test.ts'` | 781 tests: 764 pass, 1 fail, 16 skipped |
| mcp (the agent tools and the step tool) | `npx tsx --test 'src/mcp/**/*.test.ts'` | 428 tests: 428 pass |
| config (the catalog and the reconcile) | `npx tsx --test 'src/config/**/*.test.ts'` | 137 tests: 137 pass |
| the VS Code extension | `cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'` | 902 tests: 892 pass, 1 fail, 4 skipped |

Each `.txt` file here holds the result line of every top-level test of its suite (`ok` or `not ok`, with its name). The Story's last Task compares the same runs against them by test name.

## Failing before the Story

These fail at the baseline commit and are not this Story's to fix. The comparison at the end treats them as failing before.

- **daemon:** `SqliteDriver (via pool)`, through its subtest `temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)`: `integer overflow` (`ERR_SQLITE_ERROR`).
- **VS Code extension:** six top-level lines read `not ok`. One is an assertion failure: `each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'`. The other five are in one file and are reported as cancelled by their parent (`Promise resolution is still pending but the event loop has already resolved`): the two `runReachabilityProbe` tests, `activateExtension returns synchronously ...`, `the extension package is scaffolded ...` and `only extension.ts imports vscode ...`. The summary line counts them as one failure.
