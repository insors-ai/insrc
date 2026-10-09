<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s2 -->

# Tests: b9d5c5c40df5a574 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
