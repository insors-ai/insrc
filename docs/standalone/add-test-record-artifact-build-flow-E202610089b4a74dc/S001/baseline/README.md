# Test record feature: test baseline

Taken on 2026-10-08 at commit `67c6ca1d` (the approval of the build plan), on an unchanged tree, before the first change of this Story. Node 22.

| Suite | Command | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|---|
| mcp | `npx tsx --test --test-force-exit 'src/mcp/**/*.test.ts'` | 390 | 390 | 0 | 0 |
| workflow | `npx tsx --test --test-force-exit 'src/workflow/**/*.test.ts'` | 1623 | 1620 | 1 | 2 |
| VS Code plugin | in `vscode-plugin`: `npx tsx --test 'src/**/__tests__/*.test.ts'` | 841 | 830 | 2 | 4 |

Failures that exist before this Story and are not part of it:

- workflow: `workflow.delivery returns one timestamped snapshot and leaves the store, docs and git untouched` (`src/workflow/delivery/__tests__/handlers.test.ts`) failed in the sweep on a git `maintenance.lock` file that vanished under it; the file passes when run alone (7 of 7). It is a timing failure of the sweep.
- VS Code plugin: `src/__tests__/activation.test.ts` fails (7 top-level result lines are `not ok`), with "Promise resolution is still pending but the event loop has already resolved". It fails the same way with and without `--test-force-exit`.

The three `.txt` files hold the result line of every top-level test of each suite. The Story's last Task compares the suites against them: no test that is `ok` here may fail afterwards.
