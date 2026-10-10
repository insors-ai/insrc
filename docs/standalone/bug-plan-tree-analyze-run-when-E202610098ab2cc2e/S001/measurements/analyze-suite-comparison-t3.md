# The analyze suite before and after the Story (task t3)

The whole analyze suite (`npx tsx --test --test-reporter=tap 'src/analyze/**/*.test.ts'`,
Node 22) was run on 2026-10-10 at two commits, one run after the other, and
compared by test name. The run before was made in a separate checkout of that
commit. The raw output of both runs is kept whole beside this file.

| Run | Commit | Top-level tests | Pass | Fail | Skipped | Todo | Raw output |
|---|---|---|---|---|---|---|---|
| Before | `bc072f79` (the last commit before task t1) | 1148 | 1053 | 0 | 92 | 3 | `analyze-suite-before-bc072f79.tap` |
| After | `f50af845` (task t3) | 1157 | 1062 | 0 | 92 | 3 | `analyze-suite-after-f50af845.tap` |

## Result

- **No test that passed before fails after.** Neither run has a failed test.
- **No test changed its result.** Every test name present in both runs has the
  same result in both.
- **No test name is gone.** The tests that assert what a consumer was handed
  were rewritten to the list form under their old names.
- **9 test names are new**, all passing:
  - `a map in which every name has one output renders a user message byte-identical to the one rendered before the change`
  - `a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section`
  - `a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task`
  - `a task that is not the report task receives every output of a name it consumes`
  - `an absent output of one of several producers is worded by its task and the others are said to be available; a name with no output keeps the old wording`
  - `each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id`
  - `each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs`
  - `through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params`
  - `when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged`

## What this does not show

- The 92 skipped tests are the live suites (they need `INSRC_LIVE_TESTS`). They
  were not run. The four live aggregate-report suites were brought to the new
  shape of the map and typechecked, not run against a model.
- The project typecheck leaves test files out. The test files of the executor,
  the runtimes and `src/analyze/__tests__` were typechecked separately with the
  project's settings: the two errors the change introduced (two adherence tests
  that hand the check a map) were fixed, and the 14 errors that remain are in
  lines this Story did not touch and are the same before and after.

## How the comparison was made

Each line of the form `ok <n> - <name>` or `not ok <n> - <name>` at the top
level of a run's output is one test; a trailing `# SKIP` or `# TODO` marks it
skipped or todo. The two runs were compared as lists of results per name, so a
name used by more than one test is compared in full.
