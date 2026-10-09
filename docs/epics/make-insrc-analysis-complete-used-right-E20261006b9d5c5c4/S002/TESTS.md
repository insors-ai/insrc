<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s2 -->

# Tests: b9d5c5c40df5a574 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 33 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-09T16:31:36.297Z on commit `c5b16af1`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes) | `src/analyze/__tests__/measure.test.ts` |

**unit: measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given) | `src/analyze/__tests__/measure.test.ts` |

**unit: measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file' | `src/analyze/__tests__/measure.test.ts` |

**unit: measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings) | `src/analyze/__tests__/measure.test.ts` |

**unit: measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record | `src/analyze/__tests__/measure.test.ts` |

**unit: every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger) | `src/analyze/__tests__/measure.test.ts` |

**unit: renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given | `src/analyze/__tests__/measure.test.ts` |

**unit: filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union | `src/analyze/__tests__/measure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/measure.test.ts` | 0 | 8 | 0.6 s |  |

## t2

Run at 2026-10-09T16:41:15.265Z on commit `ed05329b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the table listing of sqlite, pg and mysql applies no clamp in the complete mode, that of oracle and mssql builds its query without the row-limit clause, and the four namespace drivers' listing applies no limit; each behaves exactly as before without the mode; the file listing walks to the end when no limit is given; a ClickHouse source, whose listing throws, is not determined**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the table listing of sqlite, pg and mysql applies no clamp in the complete mode, that of oracle and mssql builds its query without the row-limit clause, and the four namespace drivers' listing applies no limit; each behaves exactly as before without the mode; the file listing walks to the end when no limit is given; a ClickHouse source, whose listing throws, is not determined | `src/daemon/db/__tests__/list-complete.test.ts` |
| pass | the file walk goes to the end with a null cap and stops at its cap, as before, with a number or with none given | `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/db/__tests__/list-complete.test.ts` | 0 | 1 | 1.5 s |  |

## t3

Run at 2026-10-09T16:51:48.292Z on commit `326409ee`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope) | `src/analyze/__tests__/measure-pass.test.ts` |

**integration: measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold) | `src/analyze/__tests__/measure-pass.test.ts` |

**integration: a workspace that a registered repo contains is counted through the area predicate (the whole repo at the repo's path, only what lies under a directory inside it); a workspace that no repo contains is summed over the registered repos under it, each read once, for a generic request and for a direct call of measureResolvedScope, is not determined when none lies under it, and is not determined for a code or docs request, which the index check refuses (mutation: treat every workspace as a sum over the repos under it)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a workspace that a registered repo contains is counted through the area predicate (the whole repo at the repo's path, only what lies under a directory inside it); a workspace that no repo contains is summed over the registered repos under it, each read once, for a generic request and for a direct call of measureResolvedScope, is not determined when none lies under it, and is not determined for a code or docs request, which the index check refuses (mutation: treat every workspace as a sum over the repos under it) | `src/analyze/__tests__/measure-pass.test.ts` |

**integration: measureDataSource counts a relational source through the complete mode of its table listing beyond the limited mode's cap, a namespace source through its namespace listing, and a file source through the file listing with no limit (mutation: call the listing in its limited mode)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureDataSource counts a relational source through the complete mode of its table listing beyond the limited mode's cap, a namespace source through its namespace listing, and a file source through the file listing with no limit (mutation: call the listing in its limited mode) | `src/analyze/__tests__/measure-pass.test.ts` |

**integration: measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not | `src/analyze/__tests__/measure-pass.test.ts` |

**integration: an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities) | `src/analyze/__tests__/measure-pass.test.ts` |

**integration: a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution | `src/analyze/__tests__/measure-pass.test.ts` |

**integration: dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id | `src/analyze/__tests__/measure-pass.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/measure-pass.test.ts` | 0 | 8 | 1.5 s |  |

## t4

Run at 2026-10-09T17:04:30.339Z on commit `6ced233b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is | `src/analyze/__tests__/report-head.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/report-head.test.ts` | 0 | 1 | 1 s |  |

## t5

Run at 2026-10-09T17:24:58.342Z on commit `64f0a0ff`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: runAnalyze sets the intent's size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runAnalyze sets the intent's size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size) | `src/analyze/orchestrator/__tests__/run-measure.test.ts` |

**integration: a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size) | `src/analyze/planner/__tests__/recursive.test.ts` |

**integration: the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth) | `src/daemon/__tests__/analyze-rpc-measure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/orchestrator/__tests__/run-measure.test.ts` | 0 | 1 | 1 s |  |
| `src/analyze/planner/__tests__/recursive.test.ts` | 0 | 12 | 0.7 s |  |
| `src/daemon/__tests__/analyze-rpc-measure.test.ts` | 0 | 1 | 0.8 s |  |

## t6

Run at 2026-10-09T17:54:15.733Z on commit `a2343fb2`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path | `src/analyze/context/__tests__/lookup-measure.test.ts` |
| pass | the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path; it never takes a default | `src/analyze/context/__tests__/lookup-measure.test.ts` |
| pass | the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes | `src/mcp/__tests__/analyze-step-measure.test.ts` |
| pass | the one-shot tool and the workflow runner state no size of their own and their answers carry the measure line; a run-level request needs no size on its intent, and a run and a plan request for the same scope share one cached run bundle | `src/daemon/__tests__/analyze-rpc-measure.test.ts` |

**integration: the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle | `src/analyze/context/__tests__/lookup-measure.test.ts` |
| pass | the one-shot tool and the workflow runner state no size of their own and their answers carry the measure line; a run-level request needs no size on its intent, and a run and a plan request for the same scope share one cached run bundle | `src/daemon/__tests__/analyze-rpc-measure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/lookup-measure.test.ts` | 0 | 3 | 1 s |  |
| `src/daemon/__tests__/analyze-rpc-measure.test.ts` | 0 | 2 | 1.2 s |  |
| `src/mcp/__tests__/analyze-step-measure.test.ts` | 0 | 1 | 0.7 s |  |

## t7

Run at 2026-10-09T17:55:35.726Z on commit `555b9166`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes | `src/mcp/__tests__/analyze-step-measure.test.ts` |
| pass | the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path; it never takes a default | `src/analyze/context/__tests__/lookup-measure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/lookup-measure.test.ts` | 0 | 3 | 1 s |  |
| `src/mcp/__tests__/analyze-step-measure.test.ts` | 0 | 1 | 0.7 s |  |

## t8

Run at 2026-10-09T18:12:25.659Z on commit `990a5fce`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field | `src/analyze/classifier/__tests__/no-size.test.ts` |

**unit: a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default) | `src/analyze/classifier/__tests__/no-size.test.ts` |

**integration: the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path) | `src/config/__tests__/retired-roles.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/classifier/__tests__/no-size.test.ts` | 0 | 2 | 0.9 s |  |
| `src/config/__tests__/retired-roles.test.ts` | 0 | 1 | 0.4 s |  |

## t9

Run at 2026-10-09T20:24:33.449Z on commit `cbbe5e3e`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: no test of the analyze, planner, classifier, data-driver and daemon suites that passed before the Story's first change fails after its last, compared by test name against a baseline taken at the plan's approval; the tests of the scope picker and of the classifier's size are named as removed or changed**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/baseline-comparison-t9.md, with the result line of every top-level test in measurements/after/<suite>.txt and the baseline in baseline/<suite>.txt

**live: through the installed daemon, a code request scoped to one directory of this repository and the same request scoped to the whole repository return different measured sizes, each with its counts in the report, and no model call picks a size**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live-run-t9.md, with every frame, the result, the run record and the plan of both runs in measurements/live/ (run ids s2-live-directory-mv1ebo2b and s2-live-repo-mv1edxtn, 2026-10-09 20:06 to 20:16 UTC)
