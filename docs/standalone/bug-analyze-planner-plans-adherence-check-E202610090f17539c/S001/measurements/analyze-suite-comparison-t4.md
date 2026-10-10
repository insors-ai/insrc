# The analyze suite before and after the Story (task t4)

The whole analyze suite (`npx tsx --test --test-reporter=tap 'src/analyze/**/*.test.ts'`,
Node 22) was run on 2026-10-10 at two commits, one run at a time, and compared by
test name. The raw output of both runs is kept whole beside this file.

| Run | Commit | Top-level tests | Pass | Fail | Skipped | Todo | Raw output |
|---|---|---|---|---|---|---|---|
| Before | `7f274d55` (the last commit before task t1) | 1115 | 1018 | 2 | 92 | 3 | `analyze-suite-before-7f274d55.tap` |
| After | `cf0bdc19` (task t4) | 1131 | 1034 | 2 | 92 | 3 | `analyze-suite-after-cf0bdc19.tap` |

## Result

- **No test changed its result.** Every test name present in both runs has the
  same result in both.
- **The same two files fail in both runs**, and no other:
  `src/analyze/explore/__tests__/freeform-probe-scope.test.ts` and
  `src/analyze/explore/__tests__/phase5-explorations-params.test.ts`. Each is
  reported as one failed file, with signal `SIGABRT`. They are not this
  Story's: they fail the same way at the commit before it. The crash report of
  one such process (`~/Library/Logs/DiagnosticReports/node-2026-10-10-131307.ips`)
  shows the abort in the LMDB library's native code, in `ExtendedEnv::~ExtendedEnv`
  called from `EnvWrap::closeEnv`, on a pointer freed that was not allocated.
  Earlier the same day both files passed in three runs of this suite (1,130 to
  1,132 tests, 0 failures); what changed in between was not looked into.
- **3 test names are gone**, each replaced by design (the upstream-task
  route is removed, and no source of constraints is now an error):
  - `constraintIds fall through when the priority-1 upstream is missing`
  - `priority-1 upstream overrides both inline and constraintIds`
  - `returns empty when no constraints source is provided`
- **19 test names are new**:
  - `a check with a topic judges against the constraints enumerated from the repository's documents, and its output carries those constraints, their citations and the record's path`
  - `a constraintsSource in the params is not read: beside usable ids the ids are used, and the upstream outputs are never looked at`
  - `a data check under a connection scope and an infra check under a manifest directory read the documents of the declaring or containing repository, and a code check scoped to one file reads the whole repository's documents`
  - `a plan whose adherence task has no topic, no inline constraints and no stored-document ids fails validation with the task, the three ways to give constraints and the option to leave the task out (code, data and infra), and the INV-5 fix hint sent with the message gives the same remedies, including removing the task and renumbering the ids that follow`
  - `a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check`
  - `an adherence task with a topic, with an inline list, or with stored-document ids validates; one whose only source is an empty topic or an empty list does not, a non-empty override with an empty list beside it still validates, one with the removed constraintsSource does not, and for constraintsSource the message says to give constraintTopic instead, also in a generic plan that holds the docs task and also beside a usable override`
  - `an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic`
  - `an inline list wins over ids; an empty inline list counts as not given and the ids are used`
  - `an override that yields no constraint fails naming the override and does not fall back to the topic`
  - `four checks with one topic in one run make one enumeration; a topic that differs only in case or spacing reuses it; a different maxConstraintSources, a different topic or a different run does not`
  - `no template, runtime or prompt of the analyze framework names constraintsSource, and the check does not read upstreamOutputs`
  - `one enumeration per run, repository and topic is made, recorded under the run's directory with its whole output, and read back; a topic that differs only in case or spacing reuses it; a different maxSources, topic or run does not; a failed enumeration is not recorded and one with no constraint is`
  - `run through the plan walk, a failed check's reason is in the task's record and in tasksFailed, and the plan's report is still written from the other tasks`
  - `the catalog shown to the planner for each adherence template names constraintTopic and does not name constraintsSource or docs.constraint.enumerate`
  - `the enumeration's reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record`
  - `the seam replaces the enumeration, and is handed the topic, the repository, the limit and no area`
  - `when the documents state no constraint on the topic the check fails with that reason, with the number of sections read or the note that none matched, the record is written, and a sibling check fails the same way without a second enumeration`
  - `when the enumeration's model call fails the check fails with 'could not be enumerated', writes no record, and the next check enumerates again; when the judging call fails the reason is the judging's and the record stays`
  - `with no source of constraints the check throws, naming constraintTopic, constraints and constraintIds`

The count goes from 1115 to 1131: 19 new, 3 gone.

## How the comparison was made

The before run was made in a temporary git worktree of `7f274d55` that shared
this checkout's `node_modules`; the worktree was removed afterwards. Top-level
TAP lines (`ok N - name` / `not ok N - name`) were read from each file and
compared by name; a file that aborts appears as one line named by its path.
`npx tsc --noEmit` is clean at `cf0bdc19`.
