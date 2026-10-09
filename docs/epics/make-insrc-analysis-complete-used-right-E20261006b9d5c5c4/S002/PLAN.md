<!-- insrc:artifact PLAN-b9d5c5c40df5a574-s2 -->

# Plan: E20261009b9d5c5c4:S002

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**LLD run:** `wf-1791558704242-650nog`
**LLD effective hash:** `faa0f59939ce...`

The work starts with a measuring module that nothing calls, and with a complete mode for the data listings and the file walk that no existing caller uses, so the first four Tasks change no behaviour. The next three switch the plan tree, the lookup pipeline and the step tool over to the measured size, each with its own tests. Only then is the classifier's size removed and the scope picker deleted with its role, and the last Task documents the rule, compares the suites with the baseline and runs the live check.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** The measuring module: the measure, the table and the pure functions | M | — | unit: sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes); unit: measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given); unit: measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file'; unit: measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings); unit: measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record; unit: every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger); unit: renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given; unit: filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union | [[c1]] [[c2]] |
| 2 | **`t2`** The complete mode of the data listings and the uncapped file walk | M | — | integration: the table listing of sqlite, pg and mysql applies no clamp in the complete mode, that of oracle and mssql builds its query without the row-limit clause, and the four namespace drivers' listing applies no limit; each behaves exactly as before without the mode; the file listing walks to the end when no limit is given; a ClickHouse source, whose listing throws, is not determined | [[c3]] |
| 3 | **`t3`** The measuring pass over a scope, a data source and an infra directory | L | `t1`, `t2` | integration: measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope); integration: measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold); integration: a workspace that a registered repo contains is counted through the area predicate (the whole repo at the repo's path, only what lies under a directory inside it); a workspace that no repo contains is summed over the registered repos under it, each read once, for a generic request and for a direct call of measureResolvedScope, is not determined when none lies under it, and is not determined for a code or docs request, which the index check refuses (mutation: treat every workspace as a sum over the repos under it); integration: measureDataSource counts a relational source through the complete mode of its table listing beyond the limited mode's cap, a namespace source through its namespace listing, and a file source through the file listing with no limit (mutation: call the listing in its limited mode); integration: measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not; integration: an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities); integration: a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution; integration: dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id | [[c2]] [[c4]] |
| 4 | **`t4`** The measure in the answer report and under the completeness line | M | `t1` | integration: every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is | [[c5]] |
| 5 | **`t5`** The plan tree and the daemon's requests take the measured size | L | `t3`, `t4` | integration: runAnalyze sets the intent's size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size); integration: a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size); integration: the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth) | [[c6]] |
| 6 | **`t6`** The lookup pipeline takes the measured size | L | `t3`, `t4` | integration: the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path; integration: the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle | [[c7]] |
| 7 | **`t7`** The step tool and the free-form lookup take the measured size | M | `t6` | integration: the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes | [[c7]] |
| 8 | **`t8`** The classifier returns no size, and the scope picker is removed with its role | L | `t5`, `t6`, `t7` | unit: the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field; unit: a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default); integration: the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path) | [[c8]] |
| 9 | **`t9`** The guide, the suite comparison and the live check | S | `t8` | smoke: no test of the analyze, planner, classifier, data-driver and daemon suites that passed before the Story's first change fails after its last, compared by test name against a baseline taken at the plan's approval; the tests of the scope picker and of the classifier's size are named as removed or changed; live: through the installed daemon, a code request scoped to one directory of this repository and the same request scoped to the whole repository return different measured sizes, each with its counts in the report, and no model call picks a size | [[c9]] |

### 1.1 E20261009b9d5c5c4:S002:T001 — The measuring module: the measure, the table and the pure functions

Before any change, record the baseline: the result line of every top-level test of the analyze, planner, classifier, data-driver and daemon suites, run without the force-exit flag under Node 22, kept in the Story's folder. Then add src/analyze/measure.ts with the RequestMeasure type as the HLD gives it, the one table SIZE_THRESHOLDS, sizeOfCounts, measureNamedArea, measureLookupResults, renderMeasureLine and the type UnsizedIntent, and add filesNamedBy beside the lookup output types. Nothing calls them yet.

**Acceptance checks:**
- The baseline files exist in the Story's folder with a note of the commit and the commands
- sizeOfCounts maps the two counts through the one table, takes the larger size, and throws RangeError for a negative or fractional count
- measureNamedArea counts the entities of the scope's area and their distinct file paths, and gives XS, determined, for an empty area
- measureLookupResults sums the returned counts, counts each file once through filesNamedBy, records the characters, and is not determined (XL) when no output carries a completeness record
- filesNamedBy has one case per member of the output union with no default, and returns no file for the three data outputs and for a failed or unsupported output
- Every measure records a hint without letting it change the size; renderMeasureLine states size, source, counts, note and hint
- No existing file other than src/analyze/explore/types.ts is changed, and no existing behaviour changes

### 1.2 E20261009b9d5c5c4:S002:T002 — The complete mode of the data listings and the uncapped file walk

Add the optional `complete` to listTables and listNamespaces in the driver interface. In sqlite, pg and mysql the clamp is not applied in that mode; in oracle and mssql the query is built without its row-limit clause; the MongoDB, Cassandra, DynamoDB and NATS drivers apply no limit; Redis, etcd and ClickHouse are unchanged. Make the file listing's limit optional, walking to the end when absent. Let walkFiles take null for no cap. Every existing caller is untouched.

**Acceptance checks:**
- Each of the five relational drivers returns every table in the complete mode, with no clamp and no row-limit clause in the query
- The four namespace drivers return every namespace in the complete mode; Redis and etcd ignore the mode
- listFilesForConnection with no limit walks to the end with `truncated` false
- walkFiles with a null cap walks to the end with `truncated` false
- Without the new option every driver, the file listing and walkFiles behave exactly as before, shown by their existing tests passing unchanged

### 1.3 E20261009b9d5c5c4:S002:T003 — The measuring pass over a scope, a data source and an infra directory

Add measureResolvedScope, measureRequestScope and measureDataSource to the measuring module, and split the pure rule dataScopeOf out of resolveDataScope, which then calls it. The pass counts by kind of source and scope as the design's section on measureResolvedScope states, including the generic source, a workspace inside and above repos, infra by its own file walk and data by the listings' complete mode, and returns a measure that is not determined, size XL, for everything that cannot be counted. It never throws.

**Acceptance checks:**
- A small directory and the whole repo get different sizes, and no model call is made
- A scope that cannot be resolved, a scope no registered repo contains, a repo with no stored entity, a failed read of the store, and a registry read that rejects during resolution each give a measure that is not determined, size XL, with its reason; nothing is thrown
- An empty directory inside an indexed repo is XS and determined; a path the index does not hold is never a count of zero
- A workspace a repo contains is counted through the area predicate; one above the repos is summed for a generic request and a direct call, and is not determined for a code or docs request
- An infra request is counted from the files walkFiles visits with no cap, without the stored graph, and is not determined when the root or a directory below it cannot be read
- A data source is counted through the complete mode, its objects compared with the files column; each case that cannot be counted (no listing, not supported, cut, Redis, etcd, ClickHouse, unreachable) is not determined with its own reason
- A data request on a repo is measured by one call per registered connection, each with its connection id, and is not determined when any one is not
- dataScopeOf gives what resolveDataScope gave before for each kind of scope, and the data tasks' existing tests pass unchanged

### 1.4 E20261009b9d5c5c4:S002:T004 — The measure in the answer report and under the completeness line

Type the report's `measure` field, let reportFromLookups take a measure, and add renderReportHead: the completeness line and, when the report has a measure, the measure line under it. completenessHeadLine returns it for a report, and the direct writers of an answer's head call it. On the plan tree the driver's merged report is given a measure after the merge. No caller supplies a measure yet, so no answer changes until the later Tasks.

**Acceptance checks:**
- AnswerReport.measure is typed RequestMeasure and isAnswerReport accepts a report with or without one
- reportFromLookups puts a given measure in the report, and a report built without one is exactly today's
- renderReportHead is the completeness line alone for a report with no measure, and both lines for one with a measure
- Every writer of an answer's head goes through renderReportHead: assembleMarkdown, both writers in bundle-md.ts, the step tool's answer turn, both writers in workflow-rpc.ts and the plan tree's final report
- A report or a run record stored before the change is read as it is

### 1.5 E20261009b9d5c5c4:S002:T005 — The plan tree and the daemon's requests take the measured size

In runAnalyze, call the measuring pass after both classification branches and before the run context is built, set the intent's size from it, pass a stated size as the hint, replace the scope-picker substep event with a measure substep, and put the measure on the classified event, in the run record and on the merged report. Stop calling pickScope (its removal is the eighth Task). In the recursive planner, measure a child plan when it is spawned and keep the model's figure as the hint. In the daemon, treat the sizes on the run, plan and classify requests as hints, with the plan request's depth rule for depth 0 and for a nested request.

**Acceptance checks:**
- On both classification branches the intent's size is the measure's, a stated size is the measure's hint, and no model call picks a size
- The classified event, the run record and the final report's answer report carry the measure, and the final report's head carries the measure line
- A plan's task band and depth cap follow the measured size
- A child plan is measured from the area it names when it is spawned; the planner model's figure is the hint and is never the fallback
- The daemon's run, plan and classify requests return the measured size; a plan request at depth 0 uses it for the band and the depth, one at a greater depth uses it for the band and the caller's root size for the depth
- A request that is refused today for its scope is still refused at the same place with the same code

### 1.6 E20261009b9d5c5c4:S002:T006 — The lookup pipeline takes the measured size

Make the context builder the one writer of the size in the lookup pipeline: its inputs take an unsized intent and an optional hint; after it resolves the scope it measures the named area and gives the planning call that size; after the plan has been executed it measures the lookup results, gives the answer step that size and puts the measure in the report. Leave the intent's size and the hint out of the cache key, and set the hint on a cached bundle's measure from the current call. Give the executor's entry points an optional request size, which the builder fills. Remove the default size from the one-shot tool, which passes the caller's size as the hint, and from the daemon's workflow runner, which passes none.

**Acceptance checks:**
- The planning call receives the named-area size and the answer step the size from the lookup results, whose measure is in the report
- The one-shot tool passes a caller's size as the hint and the workflow runner passes none; neither sets a size
- The cache key leaves out the intent's size and the hint: a run and a plan request for the same scope share one cached run bundle, and a cached bundle's measure carries the current call's hint
- The builder passes the request's named-area size to the executor through the new optional argument
- The answers of the one-shot tool and of the workflow runner carry the measure line

### 1.7 E20261009b9d5c5c4:S002:T007 — The step tool and the free-form lookup take the measured size

In the step tool, take the named-area measure at the start phase for the planning prompt, carry the caller's stated size in the state token as an optional hint, pass the request size to the plan and narrow phases' execution through stepPlan, and take the measure from lookup results at the bundle phase and the answer turn, each with the hint. Add the optional request size to the runner context, set at the three places the executor builds one. Let the free-form lookup use it and, when it has none, measure its resolved scope or a repo scope at its repo path. Remove the default size from the step tool's start phase and from the free-form lookup's inner intent.

**Acceptance checks:**
- The step tool's start phase gives the planning prompt the named-area size and sets no default
- The state token carries the hint from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes and the state's version is not raised
- The runner context carries the request size at the executor's three construction sites and through stepPlan
- The free-form lookup uses the request size in its runner context and, with none, measures its resolved scope or a repo scope at its repo path; it never takes a default
- The step tool's answers carry the measure line

### 1.8 E20261009b9d5c5c4:S002:T008 — The classifier returns no size, and the scope picker is removed with its role

Remove the size from the classifier's schema, prompt and driver (the required-fields sentence of the user message, the type of the structured call, the log line, the return type), make the validator take an unsized intent and drop the placeholder size given to it. Remove the scope picker with everything that names it: its module, prompt, error classes, export, role row, boot-validator entry, the tests that import its classes, and the VS Code extension's declared setting with a release. Add the list of retired role ids to the catalog and prune them in the reconcile, globally and per repo.

**Acceptance checks:**
- The classifier's schema has no size property and rejects an answer that carries one; its user message names no size; classify returns an unsized intent; ClassifiedIntent keeps its field
- No placeholder size is given to the validator
- No file under src names pickScope, the picker's module, its prompt or its error classes, and the prompt file is gone
- The role `analyze.scope.pick` is gone from the role taxonomy and from the extension's declared settings, the two agree in both directions, and the extension's version is raised
- The reconcile drops a value stored for a retired role id under `models.tasks` and under each `models.byRepo.<repo>.tasks`, and no retired role id is in the taxonomy
- A source scan finds no call that picks a size with a model and no literal default size at the four places that set M before

### 1.9 E20261009b9d5c5c4:S002:T009 — The guide, the suite comparison and the live check

Describe in docs/daemon.md how a request's size is measured: the table, what is counted for each kind of source and scope, the hint, the not-determined case and the measure line, and correct the pages that say a size is picked or defaulted. Compare the suites by test name with the baseline of the first Task and name the tests removed or changed. Then the live check: the push, the daemon's update and the two requests are each done only on the stakeholder's word; the runs spend the stakeholder's model quota, are started detached, one at a time, after checking that no other session is running one.

**Acceptance checks:**
- docs/daemon.md states the table, what is counted for each kind of source and scope, the hint, the not-determined case and the measure line, and no page says a size is picked by a model or defaulted to M
- No test that passed in the baseline fails after the last Task; the tests removed or changed with the picker and the classifier's size are named
- Live: a code request scoped to one directory and the same request scoped to the whole repository return different measured sizes with their counts in the report, and no model call picks a size; the date and results are in the Story's records

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes) | `t1` |
| measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given) | `t1` |
| measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file' | `t1` |
| measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings) | `t1` |
| measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record | `t1` |
| every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger) | `t1` |
| renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given | `t1` |
| the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field | `t8` |
| a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default) | `t6`, `t7`, `t8` |
| filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union | `t1` |
| measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope) | `t3` |
| measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold) | `t3` |
| a workspace that a registered repo contains is counted through the area predicate (the whole repo at the repo's path, only what lies under a directory inside it); a workspace that no repo contains is summed over the registered repos under it, each read once, for a generic request and for a direct call of measureResolvedScope, is not determined when none lies under it, and is not determined for a code or docs request, which the index check refuses (mutation: treat every workspace as a sum over the repos under it) | `t3` |
| measureDataSource counts a relational source through the complete mode of its table listing beyond the limited mode's cap, a namespace source through its namespace listing, and a file source through the file listing with no limit (mutation: call the listing in its limited mode) | `t3` |
| measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not | `t3` |
| the table listing of sqlite, pg and mysql applies no clamp in the complete mode, that of oracle and mssql builds its query without the row-limit clause, and the four namespace drivers' listing applies no limit; each behaves exactly as before without the mode; the file listing walks to the end when no limit is given; a ClickHouse source, whose listing throws, is not determined | `t2`, `t3` |
| runAnalyze sets the intent's size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size) | `t5` |
| a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size) | `t5` |
| the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path | `t6`, `t7` |
| the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth) | `t5` |
| every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is | `t4` |
| an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities) | `t3` |
| a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution | `t3` |
| the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path) | `t8` |
| the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle | `t6` |
| the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes | `t7` |
| dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id | `t3` |
| no test of the analyze, planner, classifier, data-driver and daemon suites that passed before the Story's first change fails after its last, compared by test name against a baseline taken at the plan's approval; the tests of the scope picker and of the classifier's size are named as removed or changed | `t9` |
| through the installed daemon, a code request scoped to one directory of this repository and the same request scoped to the whole repository return different measured sizes, each with its counts in the report, and no model call picks a size | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 section 2.1 RequestMeasure and section 2.2 sizeOfCounts`
- **[[c2]]** `prior-artifact` `LLD s2 sections 2.3 to 2.6 and 2.10: the functions that build a measure, and filesNamedBy`
- **[[c3]]** `prior-artifact` `LLD s2 sections 2.7 to 2.9 and 2.17: the listings' complete mode and walkFiles`
- **[[c4]]** `prior-artifact` `LLD s2 section 5 error paths: the cases that are not determined`
- **[[c5]]** `prior-artifact` `LLD s2 sections 2.15 and 2.16 and data model 3.4: the report's measure and the head line`
- **[[c6]]** `prior-artifact` `LLD s2 sections 2.11 and 2.14 and data model 3.5 and 3.6: the plan tree, the child plan and the daemon's requests`
- **[[c7]]** `prior-artifact` `LLD s2 data model 3.3: the context builder's inputs, the step tool and the free-form lookup`
- **[[c8]]** `prior-artifact` `LLD s2 sections 2.12 and 2.13 and data model 3.8: the scope picker's removal, the classifier's size and the retired role id`
- **[[c9]]** `prior-artifact` `LLD s2 section 7 migration, step 8, and section 6 test strategy: the guide, the baseline comparison and the live check`
