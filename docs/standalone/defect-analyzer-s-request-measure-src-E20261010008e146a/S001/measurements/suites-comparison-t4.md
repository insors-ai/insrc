# The analyze and config suites before and after the Story (task t4)

The whole analyze suite and the config suite
(`npx tsx --test --test-reporter=tap 'src/analyze/**/*.test.ts' 'src/config/**/*.test.ts'`,
Node 22) were run on 2026-10-10 at two commits, one run after the other, and
compared by test name. The run before was made in a separate checkout of that
commit. The raw output of both runs is kept whole beside this file.

| Run | Commit | Top-level tests | Pass | Fail | Skipped | Todo | Raw output |
|---|---|---|---|---|---|---|---|
| Before | `0dadf958` (the last commit before task t1) | 1295 | 1200 | 0 | 92 | 3 | `suites-before-0dadf958.tap` |
| After | `d7380e11` (task t4) | 1310 | 1215 | 0 | 92 | 3 | `suites-after-d7380e11.tap` |

## Result

- **No test that passed before fails after.** Neither run has a failed test.
- **No test changed its result.** Every test name present in both runs has the
  same result in both.
- **1 test name is gone, renamed by design:** the configuration catalog gained
  one row, so `the real CONFIG_CATALOG has 36 rows (...)` is now
  `the real CONFIG_CATALOG has 37 rows (... + analyzer.dataSourceListingTimeoutMs)`.
- **13 test names are new, carrying 16 tests** (three of the names are each
  used by two test files), all passing. The other new name is the renamed
  catalog test above, so 15 more tests run than before:
  - `a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before`
  - `a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count`
  - `a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing`
  - `a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way` (two files)
  - `a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before`
  - `a symbol scope is measured with one read by id and a file scope with the read of that file's entities; the measure of a resolved scope (measureResolvedScope) asks the store for every entity of the repository in neither case, and the counts and the size equal those of the whole-repository read; driven through measureRequestScope for a code request, the index check of the scope resolution is the only whole-repository read`
  - `one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count`
  - `the bundle cache key is the same with and without a handed measure`
  - `the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection`
  - `the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan` (two files)
  - `the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000`
  - `the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds` (two files)

## One existing test was changed, and kept its name

`an uncaught error gives a failed record at the stage reached and a returned
failure, 'done' fires once and the run is no longer live`
(`src/analyze/orchestrator/__tests__/live-runs.test.ts`) raised its error with
a signal that could not be read at its second reading, which was the plan
stage's. The measure now reads the run's signal too, before that, and takes a
signal it cannot read as one that has not fired. The test now raises its error
at the first reading after the request is classified, which is the plan
stage's own. What it asserts about the run is unchanged. The same change was
made to one line of `a run is live from its first read of a record until it
returns ...` in the same file.

## What this does not show

- The 92 skipped tests are the live suites (they need `INSRC_LIVE_TESTS`).
  They were not run: no part of this Story was run against a live data source
  or a model.
- The plan request's own new test is in `src/daemon/__tests__/analyze-rpc-measure.test.ts`,
  which these two suites do not include. It was run on its own and by the
  build gate of task t3, and passes.
- The project typecheck leaves test files out. The test files this Story
  touched were typechecked separately with the project's settings; the errors
  that remain in them are in lines the Story did not touch and are the same
  before and after.

## How the comparison was made

Each line of the form `ok <n> - <name>` or `not ok <n> - <name>` at the top
level of a run's output is one test; a trailing `# SKIP` or `# TODO` marks it
skipped or todo. The two runs were compared as lists of results per name, so a
name used by more than one test is compared in full.
