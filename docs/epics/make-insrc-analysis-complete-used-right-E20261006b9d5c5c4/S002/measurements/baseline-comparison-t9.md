# Story s2: the suites after the last Task, compared with the baseline

Taken on 2026-10-10 on the working tree of task t9, whose source is that of commit `ea2d8f0b` plus the guide and the two tool descriptions of t9. Node 22.23.2. No run uses the force-exit flag. The baseline is in `../baseline/`, taken at commit `cc7df0d9` before the Story's first source change. The comparison is by test name: the result line of every top-level test (`ok` or `not ok`, with its name) is in `after/<suite>.txt`.

| Suite | Lines before | Lines after | Result after | Passed before, fails after | Names gone | Names new |
|---|---|---|---|---|---|---|
| analyze (with the planner and the classifier) | 1099 | 1123 | 1123 tests: 1028 pass, 0 fail, 92 skipped, 3 todo | 0 | 4 | 28 |
| daemon (with the data drivers) | 465 | 468 | 784 tests: 767 pass, 1 fail, 16 skipped, 0 todo | 0 | 0 | 3 |
| mcp (the agent tools and the step tool) | 428 | 429 | 429 tests: 429 pass, 0 fail, 0 skipped, 0 todo | 0 | 0 | 1 |
| config (the catalog and the reconcile) | 137 | 138 | 138 tests: 138 pass, 0 fail, 0 skipped, 0 todo | 0 | 0 | 1 |
| the VS Code extension | 902 | 902 | 902 tests: 892 pass, 1 fail, 4 skipped, 0 todo | 0 | 0 | 0 |

Commands: `npx tsx --test 'src/analyze/**/*.test.ts'`; `npx tsx --test 'src/daemon/**/*.test.ts'`; `npx tsx --test 'src/mcp/**/*.test.ts'`; `npx tsx --test 'src/config/**/*.test.ts'`; `cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'`.

**No test that passed in the baseline fails after the last Task.**

## Failing before and after

These failed at the baseline commit and fail the same way now. They are not this Story's.

- **daemon:** `SqliteDriver (via pool)`, through its subtest on the temporal trend (`integer overflow`).
- **VS Code extension:** the same six top-level lines as in the baseline: `runReachabilityProbe degrades a hung probe to errored within the bounded deadline`; `runReachabilityProbe never throws even if reachability() rejects`; `activateExtension returns synchronously without throwing and leaves status at unknown until the probe resolves`; `the extension package is scaffolded (package.json + tsconfig + activate/deactivate entry)`; `only extension.ts imports vscode, and it reaches the daemon only via the shared ipc-client (k2/k5)`; `each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'`.

## Test names that are gone, and why

All four are in the analyze suite and all four were changed in task t8, with the removal of the scope picker and of the classifier's size.

| Name in the baseline | What became of it |
|---|---|
| `a failed model call for planning, classification or picking the size names the call and no provider` | Renamed `a failed model call for planning or classification names the call and no provider`. Its case for the scope picker's error class is removed with the class. (`src/analyze/__tests__/model-schemas-draft-2020.test.ts`) |
| `each of the six callers classifies a CLI call failure as its model-unavailable error and a shape failure as its schema error` | Renamed `each of the five callers classifies …`. The scope picker was the sixth caller. (`src/analyze/context/__tests__/model-failure-callers.test.ts`) |
| `validateIntentShape rejects an intent missing 'scope'` | Removed. The classifier's schema has no size, so an answer without one is the valid answer. (`src/analyze/classifier/__tests__/schema.test.ts`) |
| `validateIntentShape rejects scope outside the enum` | Replaced by `validateIntentShape rejects an answer that carries a size, valid or not`. (same file) |

## Tests that kept their name and changed what they expect

The Story changes what several existing tests observe. Each was changed in the Task named, and each change is one the design calls for.

| File | Task | What changed |
|---|---|---|
| `src/analyze/orchestrator/__tests__/live-runs.test.ts` | t5 | Its runs were held inside the size-picking model call. That call is no longer made, so they are held in the measuring pass. |
| `src/analyze/planner/__tests__/recursive.test.ts` | t5 | A child plan is now measured, so the fixtures name a stand-in repo of the size each one states. |
| `src/analyze/orchestrator/__tests__/hinted-branch.test.ts`, `src/daemon/__tests__/analyze-run-empty-prompt.test.ts` | t5 | One assertion each expected the stated size as the intent's size. The scope there is in no registered repo, so the measured size is XL. |
| `src/analyze/context/__tests__/pipeline-outcome.test.ts`, `src/analyze/context/__tests__/run-shaper-wiring.test.ts` | t6 | Reports now carry a measure; the planning call and the lookups are handed the measured size; the cache key leaves out the size. The pipeline stand-ins have a measuring stand-in so they read no store. |
| `src/mcp/__tests__/analyze-step-answer-prompt-missing.test.ts`, `src/mcp/__tests__/analyze-step-bundle-report.test.ts` | t7 | The step tool's reports now carry a measure. |
| `src/analyze/classifier/__tests__/schema.test.ts`, `src/config/__tests__/role-taxonomy.test.ts` | t8 | Fixtures and lists lose the classifier's size and the scope picker's role. |

## Test files the Story added

`src/analyze/__tests__/measure.test.ts`, `measure-pass.test.ts`, `report-head.test.ts`; `src/analyze/runtimes/infra/__tests__/walk-files.test.ts`; `src/daemon/db/__tests__/list-complete.test.ts`; `src/analyze/orchestrator/__tests__/run-measure.test.ts`; `src/analyze/context/__tests__/lookup-measure.test.ts`; `src/analyze/classifier/__tests__/no-size.test.ts`; `src/mcp/__tests__/analyze-step-measure.test.ts`; `src/daemon/__tests__/analyze-rpc-measure.test.ts`; `src/config/__tests__/retired-roles.test.ts`; and one test added to `src/analyze/planner/__tests__/recursive.test.ts`.

## One run that did not finish, and its rerun

The first run of the daemon suite for this comparison hung in `src/daemon/__tests__/model-catalog.test.ts` while the VS Code extension's suite was running beside it. Run alone the file passes in seconds, and the daemon suite rerun on its own finished with the result in the table. The file is not touched by the Story. The figures above are from the rerun.
