<!-- insrc:artifact PLAN-008e146ad1475ef9-S001 -->

# Plan: E20261010008e146a:S001

## Summary

**Epic:** `defect-analyzer-s-request-measure-src`
**LLD run:** `wf-1791635926457-vqbvjg`
**LLD effective hash:** `49f2c71d1b86...`

The build is four tasks. The first bounds the wait on a live data source and lets a cancelled request stop measuring, with the time limit as a new setting (120 seconds by default). The second reads a symbol or file scope without building every entity of the repository. The third makes a run measure once, by having the run driver and the plan RPC hand their measure to the context builder. The last updates the guide and compares the test suites before and after.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** A live data source is measured within a time limit, and a cancelled request stops measuring | M | — | unit: a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count; unit: a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing; unit: one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count; unit: the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection; unit: the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds; unit: the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000 | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 2 | **`t2`** A symbol or file scope is measured without building every entity of the repository | S | `t1` | unit: a symbol scope is measured with one read by id and a file scope with the read of that file's entities; the measure of a resolved scope (measureResolvedScope) asks the store for every entity of the repository in neither case, and the counts and the size equal those of the whole-repository read; driven through measureRequestScope for a code request, the index check of the scope resolution is the only whole-repository read; unit: a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 3 | **`t3`** One run takes one measure: the run driver and the plan RPC hand theirs to the context builder | M | `t1` | integration: a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way; integration: a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before; integration: the bundle cache key is the same with and without a handed measure; integration: the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan | [[c2]] [[c3]] [[c4]] [[c5]] |
| 4 | **`t4`** The guide, and the suite before and after | S | `t1`, `t2`, `t3` | smoke: the whole analyze suite and the config suite at the commit before the Story and at this task's commit, compared by test name: no test that passed before fails after | [[c4]] [[c5]] |

### 1.1 E20261010008e146a:S001:T001 — A live data source is measured within a time limit, and a cancelled request stops measuring

Add the setting analyzer.dataSourceListingTimeoutMs (number, default 120000) to the configuration catalog and a reader for it in src/config/analyze.ts that never throws and falls back to the default. Add the MeasureOptions type and the optional options argument to measureRequestScope, measureResolvedScope and measureDataSource, and pass it to the private measureConnection and measureDataPool. In measureConnection give reaching and listing one connection one bounded wait; on a time-out or a cancellation return a measure that is not determined with its reason, and catch the abandoned call's later rejection. In measureDataPool check the signal before each connection. On entry to measureResolvedScope return not determined when the signal is already aborted. No caller passes options yet.

**Acceptance checks:**
- A source whose listing never returns, and one whose acquire never returns, gives a measure that is not determined after the limit, with the note `the listing of '<id>' timed out: the source did not answer within <n> seconds`; items and files are 0 and the size is XL.
- A signal that fires while a source is being measured ends the wait at once with the note that the request was cancelled; the remaining connections of a pool are not asked; a signal already aborted on entry reads nothing.
- With several connections, one that stalls does not stop the others from being measured, each has its own limit, and the result is not determined with today's form of note naming the one that timed out.
- A listing that rejects after its wait was abandoned causes no unhandled rejection.
- The limit is the setting's value; `sourceTimeoutMs` in the options replaces it; a value that is not a finite number greater than 0, or an unreadable configuration file, gives 120000.
- The setting is in the configuration catalog as a number with default 120000 in the group 'Analysis & memory'.
- A source that answers within the limit, a source whose kind lists a sample of keys and a scope that names no connection give today's measure; the existing tests of the measuring pass pass unchanged.
- `npx tsc --noEmit` is clean.

### 1.2 E20261010008e146a:S001:T002 — A symbol or file scope is measured without building every entity of the repository

In the measure of a stored area, read a symbol scope by its entity's id and a file scope by the entities of its file, count only entities of the scope's repository, and fall back to today's whole-repository read when the narrow read finds none. Add the two readers (getEntity, listEntitiesOfFile) to the measuring pass's test seam. The index check made while a code or docs scope is resolved is not changed.

**Acceptance checks:**
- For a symbol scope whose entity is in its repository, measureResolvedScope makes one read by id and no read of the repository's entities; items is 1 and files is 1 (0 when the entity has no file path).
- For a file scope whose file has entities, measureResolvedScope reads that file's entities and does not ask for every entity of the repository; files is 1.
- For both, the counts and the size equal those the whole-repository read gives for the same stored entities.
- A narrow read that finds nothing, or only entities of another repository, falls back to the whole-repository read and gives today's result, including not determined for a repository with no stored entity.
- Driven through measureRequestScope for a code request, a file or symbol scope causes exactly one whole-repository read, the one made by the index check of the scope resolution.
- A repo, workspace, module or directory scope is read as before.
- `npx tsc --noEmit` is clean.

### 1.3 E20261010008e146a:S001:T003 — One run takes one measure: the run driver and the plan RPC hand theirs to the context builder

Add the optional `measure` to RunShapeInput and leave it out of the bundle cache key. In the exploration pipeline use a handed measure whose source is 'named-area' or 'data-source' for the planning call and measure as today otherwise. Add the optional `signal` to PlanBuilderOpts and pass it to the measure of each child plan. In the run driver pass the run's signal to the measure and to the planner and hand the measure to buildRunBundle; in the plan RPC hand the measure to buildRunBundle.

**Acceptance checks:**
- With a handed measure of a named area or a data source, the pipeline does not call its measuring step, and the intent given to the planning call has the handed measure's size.
- With no handed measure, or one whose source is 'lookup-results', the pipeline measures as today.
- A handed measure that is not determined is used as it is: the planning call is given XL and nothing is measured again.
- The bundle cache key is the same with and without a handed measure.
- The run driver calls the measure once per run, with its signal, and passes the measure to buildRunBundle, so the builder does not measure again.
- The plan RPC measures its intent once and passes the measure to buildRunBundle, so the builder does not measure again.
- The recursive planner passes the signal of its options to the measure of each child plan.
- The bundle RPC, the classify RPC, the freeform probe and the analyze-step tool are unchanged.
- `npx tsc --noEmit` is clean and the context, planner and orchestrator suites pass.

### 1.4 E20261010008e146a:S001:T004 — The guide, and the suite before and after

Update docs/daemon.md where it describes how a request is measured and the settings: the time limit and its setting, the two new reasons for a size that is not determined, that an abandoned listing goes on in the background, what a symbol and a file scope save (and that the rest is ISSUE-61045de91faef1a0), and that a run measures once. Run the whole analyze suite and the config suite at the commit before the Story and at this task's commit, compare by test name, and keep the comparison and the raw outputs in the Story's measurements folder.

**Acceptance checks:**
- docs/daemon.md states the time limit, the setting's name and default, the two new reasons, that the limit is per source, and that one run takes one measure.
- docs/daemon.md states what the narrower reads save and names ISSUE-61045de91faef1a0 for the rest.
- The comparison of the suites before and after, by test name, is in the Story's measurements folder with the raw outputs; no test that passed before fails after, and every test that is gone or new is accounted for.
- `npx tsc --noEmit` is clean.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count | `t1` |
| a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing | `t1` |
| one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count | `t1` |
| the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection | `t1` |
| the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds | `t1` |
| the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000 | `t1` |
| a symbol scope is measured with one read by id and a file scope with the read of that file's entities; the measure of a resolved scope (measureResolvedScope) asks the store for every entity of the repository in neither case, and the counts and the size equal those of the whole-repository read; driven through measureRequestScope for a code request, the index check of the scope resolution is the only whole-repository read | `t2` |
| a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before | `t2` |
| a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way | `t3` |
| a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before | `t3` |
| the bundle cache key is the same with and without a handed measure | `t3` |
| the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c5]]** `prior-artifact` `LLD S001 migration`
