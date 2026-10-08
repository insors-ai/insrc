<!-- insrc:artifact PLAN-b9d5c5c40df5a574-s7 -->

# Plan: E20261008b9d5c5c4:S007

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**LLD run:** `wf-1791461017429-ybj6zf`
**LLD effective hash:** `7d17654ecfd1...`

Building this Story is mostly moving existing code onto fewer, shared pieces and then changing three rules. First every plan task's handling of its scope is moved onto one function, family by family, starting with the two families that already complete so that their live runs show nothing moved. Then the plan walk's rule for the aggregate task changes so that a run with a failed task still returns a report, and the run driver and the daemon learn to record a run that dies and to recognise one that was left behind. It ends with live runs through the daemon for each family, including a search at larger sizes for a nested plan, and a comparison of four test suites with a baseline taken before the first change.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** One function for the pairing check and resolution; the indexed check takes readers | S | — | unit: prepareScope and stepScope accept, refuse and return what they did, and prepareScope makes no pairing check in classification or task mode (mutation: make the check in every mode); unit: the indexed check reads the registry and entities through the readers it is given, and the real store when given none | [[c1]] [[c9]] |
| 2 | **`t2`** The one scope function for plan tasks | M | `t1` | unit: a table test over four families and seven kinds of scope: pairings in the table resolve, the rest throw the mismatch error naming the kinds allowed (mutation: give a family a kind outside its row); unit: a kind added to a row of a stand-in table is accepted; unit: a module, a file, a symbol and a connection scope resolve to the registered repo and the area; unit: a scope in no registered repo is not indexed for code and docs and resolves for infra and data; unit: an unreadable or empty registry does not refuse a path scope; a symbol scope fails as resolveScope decides (mutation: treat a null repo as not indexed) | [[c1]] [[c7]] |
| 3 | **`t3`** A refused scope is a coded failure on the task record | M | — | unit: one function maps the three scope error classes to their codes and data, and both mapping functions return through it what they returned before (mutation: return the code alone); integration: a runtime that throws each typed scope error is a failed task with that code and no 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check); integration: the plan's and the run's tasksFailed and the daemon's response carry the code | [[c1]] [[c6]] [[c7]] |
| 4 | **`t4`** The infra and data tasks take their scope from the scope function | M | `t2`, `t3` | integration: a data task with a connection scope works on that connection only; integration: a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo); integration: an infra task accepts its three kinds and refuses a file scope with the mismatch code; the connection-listing task gives the same result for a repo scope as before; unit: the infra and data scope functions are gone and no infra or data runtime uses the scope's value as a repo path | [[c1]] [[c9]] |
| 5 | **`t5`** The code tasks take their scope from the scope function and keep to its area | M | `t2`, `t3` | integration: a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity; integration: the adherence check gives the same result for a repo scope as before, as a code, a data and an infra template, and as a data template on an unregistered directory is not refused; unit: the code family's scope function and its test hook are gone and no code runtime uses the scope's value as a repo path | [[c1]] [[c9]] |
| 6 | **`t6`** The docs tasks take their scope from the scope function | M | `t2`, `t3` | integration: the docs tasks give the same result for a repo scope as before the change, and refuse a symbol scope with the mismatch code; integration: the family-summary task with a module scope keeps only the summaries of documents under that directory, and with a file scope only that file's; unit: no docs runtime uses the scope's value as a repo path | [[c1]] [[c9]] |
| 7 | **`t7`** The docs constraint and decision tasks keep to their area at retrieval | M | `t6` | integration: a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory and count within it; without an area the runners and the lookup pipeline's calls return what they did (mutation: drop the area at the hand-over from runner to prepare) | [[c1]] [[c6]] [[c9]] |
| 8 | **`t8`** The vector pass of document retrieval keeps to the area | M | `t7` | integration: a docs task with a module scope whose sections are not among the repository's nearest matches still gets them from the vector pass (mutation: search the whole repository and drop what lies outside); integration: the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before | [[c1]] [[c6]] |
| 9 | **`t9`** The aggregator is told which inputs are absent | M | — | integration: the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent; integration: each of the five aggregate-report runtimes hands absentInputs to the aggregator | [[c2]] [[c6]] |
| 10 | **`t10`** The aggregate task runs on the inputs that exist | M | `t9` | integration: a plan in which one of three producers failed has a final report written from the two that exist, with the third named as absent (mutation: skip the aggregate task as before); integration: a plan in which every producer failed has no final report; a task other than the aggregate task with a missing input is still skipped; an aggregate task that throws still fails the run; integration: a plan whose aggregate task consumes nothing runs with and without a failed task before it (mutation: skip an aggregate task that consumes nothing); integration: a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path | [[c2]] [[c7]] |
| 11 | **`t11`** A failure outside a task's runtime fails that task, not the walk | S | — | integration: a writing failure while the walk handles one task fails that task and the walk goes on; an error not tied to a task propagates | [[c3]] [[c7]] |
| 12 | **`t12`** A run that dies says so: live runs are counted and an uncaught error is recorded | M | — | integration: an uncaught error gives a failed record at the stage reached and a returned failure, 'done' fires once and the run is no longer live (mutation: remove the handler); integration: a run is live from its first read of a record until it returns, and with two runs under one id until the second returns (mutation: hold a set of ids instead of a count); integration: with a run record that cannot be written the handler still returns 'internal-error' and fires 'done' once (mutation: let the write's error escape); integration: a completed run asked for again returns its stored result and report; a record left in progress is replaced by the new run's first record, with no abandoned rewrite | [[c3]] [[c7]] |
| 13 | **`t13`** The run checks its scope once before it plans | S | `t2`, `t12` | integration: a docs run on a scope in no registered repo ends at stage 'plan' with 'scope-not-indexed' before the planner is called; a refused pairing still ends at 'classify'; a generic run is not checked (mutation: remove the check before planning) | [[c3]] [[c7]] |
| 14 | **`t14`** A record with no live run is abandoned when it is read | M | `t12` | integration: a record in progress with no live run is rewritten as 'run-abandoned' by the status request, on disk too (mutation: return the record as read); integration: the daemon's purge request purges such a record without force; purgeRun with no liveness refuses it; a live run's record is returned unchanged and refused; integration: the daemon's handler writes the record and sends its stage, not 'classify', for a runAnalyze that throws, and sends both frames when the record cannot be written; integration: with a record that cannot be written the status request still says 'run-abandoned' and the purge still removes the directory (mutation: let the rewrite's error escape); integration: no reader changes a record that is 'ok' or 'failed' | [[c4]] [[c5]] [[c6]] [[c7]] |
| 15 | **`t15`** A run request with no prompt and a stated source is accepted | S | — | unit: an empty prompt with a stated kind of source is accepted and gives an unfocused intent; with none it is refused with the new message; unit: a prompt of only white space is accepted with and without a stated kind of source (mutation: treat white space as empty at the parser) | [[c4]] [[c7]] |
| 16 | **`t16`** The HLD's wording on run records is brought in line | S | — | smoke: the rendered HLD equals what its renderer gives for the stored data, and the Epic's designs pass the approved-and-fresh gate once the HLD is approved | [[c3]] [[c9]] |
| 17 | **`t17`** The daemon guide, the live checks and the baseline comparison | M | `t4`, `t5`, `t6`, `t7`, `t8`, `t10`, `t11`, `t13`, `t14`, `t15`, `t16` | live: an infra request and a data request each complete with a final report; live: a code request returns a final report whose first line names the failed functional-surface tasks; live: a request with an empty prompt and a stated kind of source completes; live: infra or data requests at sizes above S: a plan with a planner-kind task runs its child plan, or the sizes tried are recorded and the nested integration test stands; live: a docs request, recorded as the accepted exception; smoke: no test of the four suites that passed in the baseline fails after the last Task, other than the tests of the three removed scope functions | [[c8]] [[c9]] |

### 1.1 E20261008b9d5c5c4:S007:T001 — One function for the pairing check and resolution; the indexed check takes readers

Take and record the baseline of the analyze, mcp, daemon and workflow suites before anything changes. Add resolveScopeForTarget beside resolveScope: check a kind of scope against a row of TARGET_TO_KINDS, then resolve. stepScope calls it in place of its two lines; prepareScope calls it in its run-mode branch only and keeps its mode condition. Give ensureNonEmptyClosure an optional second parameter holding the two readers it uses; its caller in the context builder passes nothing.

**Acceptance checks:**
- The baseline result of the four suites is recorded with the commit it was taken on, before any change of this Story
- stepScope, and prepareScope in run mode with an intent, accept, refuse and return exactly what they did, through the new function
- prepareScope in classification mode (no intent) and in task mode with a pairing the table does not allow still resolves without refusing
- ensureNonEmptyClosure given readers reads the registry and a repo's entities through them; given none it reads the real store as today, and its existing tests pass unchanged

### 1.2 E20261008b9d5c5c4:S007:T002 — The one scope function for plan tasks

Add resolveTaskScope in a new file under the shared runtimes: resolve through resolveScopeForTarget with the task's family, then run the indexed check for the code and docs families with the same readers. No task calls it yet.

**Acceptance checks:**
- For each of the four families and seven kinds of scope, a pairing in TARGET_TO_KINDS resolves and a pairing outside it throws ScopeKindTargetMismatchError naming the kinds allowed
- The function holds no list of its own: a kind added to a row of a stand-in table is accepted
- A scope in no registered repo, with a readable registry that holds repos, throws ScopeNotIndexedError for code and docs and resolves for infra and data
- With a registry that cannot be read, or that holds no repo, a code or docs scope of a path kind is not refused and resolves with a null repo; a symbol scope fails in both states as resolveScope decides
- A module, a file, a symbol and a connection scope resolve to the registered repo and the area (directory, file, entity id, connection id)

### 1.3 E20261008b9d5c5c4:S007:T003 — A refused scope is a coded failure on the task record

Add one exported function beside the three scope error classes that maps each to its code, with the data { scopePath, registeredAs } for ScopeNotIndexedError. The plan tree's and the daemon's mapping functions call it. Add the optional code to TaskExecutionRecord and to the entries of tasksFailed, and have the plan walk set it, with the message and no 'runtime-threw:' prefix, when a runtime throws one of the three classes.

**Acceptance checks:**
- Both mapping functions return, through the shared function, exactly what they returned before for the three classes, the 'scope-not-indexed' data included
- A runtime that throws each of the three classes is recorded as failed with that class's code and a message without the 'runtime-threw:' prefix; any other error has no code and keeps the prefix
- The plan's and the run's tasksFailed entries, and the daemon's response, carry the code, and the daemon's response type for a run declares the optional code on those entries
- The plan walk imports nothing from the run driver

### 1.4 E20261008b9d5c5c4:S007:T004 — The infra and data tasks take their scope from the scope function

Move the six infra runtimes and the three data runtimes that resolve a repo path, and the connection-listing task, to resolveTaskScope. A data task opens its pool at the scope's own path for a repo, a manifest directory and a workspace, as today, and at the connection's repo for a connection scope, working on that connection only. Remove the infra copy of resolveRepoPath and resolveRepoPathFromIntent, and replace their existing tests.

**Acceptance checks:**
- An infra task accepts repo, manifest-dir and workspace and refuses any other kind with 'scope-ref-kind-target-mismatch'
- A data task accepts connection, repo, manifest-dir and workspace; with a connection scope it works on that connection only
- A data task with a repo scope on a directory that is not a registered repo, and one with a manifest-directory scope inside a registered repo, open the pool at that directory, as before the change
- The optional scopeRefValue parameter of the connection-listing task still takes precedence
- The two removed functions have no caller and no test left; the tests that replaced theirs pass
- The unrelated resolveRepoPath under src/mcp is untouched

### 1.5 E20261008b9d5c5c4:S007:T005 — The code tasks take their scope from the scope function and keep to its area

Move discovery-modules, discovery-entrypoints and structure-module-tree to resolveTaskScope, and the shared adherence check's two readers of the scope's value. For a module scope a task uses only the entities whose file lies under the directory, for a file scope only that file's, for a symbol scope the one entity. Remove resolveRepoPath from the code family's shared file and its test hook, and replace the tests of its old wording. What these tasks treat as a module is not changed (Story s8).

**Acceptance checks:**
- A code task accepts repo, module, file, symbol, manifest-dir and workspace
- With a module scope it uses only entities under that directory; with a file scope only that file's; with a symbol scope the one entity
- With a repo scope each task returns what it returned before the change
- The adherence check resolves its repo through the scope function for the family of the template it runs as; run as a data template and as an infra template with a repo scope it resolves its repo as before, and as a data template on an unregistered directory it is not refused
- The code family's resolveRepoPath and its test hook are gone and no runtime file under the code family uses the scope's value as a repo path

### 1.6 E20261008b9d5c5c4:S007:T006 — The docs tasks take their scope from the scope function

Move the docs inventory, family-summary, constraint and decision tasks to resolveTaskScope. The family-summary task keeps only the document summaries whose file lies in the area of a module or file scope. The constraint and decision tasks do not yet narrow what they retrieve; that is the next Task.

**Acceptance checks:**
- A docs task accepts repo, module, file and workspace and refuses a symbol scope with 'scope-ref-kind-target-mismatch'
- With a repo scope each of the four docs tasks returns what it returned before the change
- The family-summary task with a module scope keeps only summaries of documents under that directory
- No docs runtime uses the scope's value as a repo path

### 1.7 E20261008b9d5c5c4:S007:T007 — The docs constraint and decision tasks keep to their area at retrieval

Add the optional area to RunDocConstraintEnumerateArgs, RunDocDecisionTraceArgs and DocsRetrievalArgs, forwarded where each shared runner builds its prepare function's arguments and where prepare calls retrieval, so that the keyword pass ranks and limits within the area and the completeness record counts within it. The docs constraint and decision tasks set it for a module or file scope. The lookup pipeline's direct calls of the prepare functions pass no area.

**Acceptance checks:**
- A constraint task and a decision task with a module scope retrieve only sections under that directory, and their completeness records count within it, through the runner, its prepare function and retrieval
- The same two runners called without an area, and the lookup pipeline's direct calls of the prepare functions, return what they did before
- Dropping the area at the hand-over from runner to prepare makes a test fail

### 1.8 E20261008b9d5c5c4:S007:T008 — The vector pass of document retrieval keeps to the area

Give the vector search's filter an optional list of entity ids and have retrieval pass the ids of the area's candidates, so the nearest hits are the nearest within the area. An empty list returns no hits and makes no query. Measure, against this repository's stored vectors and without opening a store the daemon holds from a second process, a query with as many ids as the largest directory of this repository holds; if one condition of that size is refused or slow, send the ids in consecutive batches and merge the hits by distance.

**Acceptance checks:**
- A docs task with a module scope whose sections are not among the repository's nearest matches still gets those sections from the vector pass
- The vector search given an empty list of ids returns no hits and makes no query
- A retrieval with no area makes the same vector query as before
- The measurement is in the build record before the Task is submitted: the number of ids, where it was run, whether one query took them, and the batch size if batches were needed; no id is left out in either case

### 1.9 E20261008b9d5c5c4:S007:T009 — The aggregator is told which inputs are absent

Add the optional absentInputs to TemplateExecuteArgs and RunAggregatorArgs. runAggregator writes them into the prompt as their own section after the outputs that exist: each name, the task that should have produced it and why it did not, with the instruction that nothing may be stated about an absent input except that it is absent. The five aggregate-report runtimes pass the argument through.

**Acceptance checks:**
- The prompt lists each absent input with its producer and reason after the outputs that exist, and the reference material stays at the end of the prompt
- With nothing absent the prompt is the same as today's
- Each of the five aggregate-report runtimes passes absentInputs to runAggregator unchanged

### 1.10 E20261008b9d5c5c4:S007:T010 — The aggregate task runs on the inputs that exist

Change the plan walk's rule for the last task of a plan: it is skipped only when it consumes at least one name and none of the names it consumes was produced. Otherwise it runs, and whenever a task before it failed or was skipped it is given absentInputs: one entry per name a failed or skipped task would have produced, and one with no producer for a consumed name no task produces. Every other task with a missing input is still skipped.

**Acceptance checks:**
- A plan in which one of three producers failed: the aggregate task runs with the two outputs that exist and absentInputs naming the third with its producer and reason, and the plan has a final report
- A plan in which every producer the aggregate task consumes failed: it is skipped and the plan has no final report
- A plan whose aggregate task consumes nothing: it runs with and without a failed task before it, and with one it is given that task as absent
- A task other than the aggregate task with a missing input is still skipped
- A nested plan in which one child task failed: the child's aggregate task runs, the planner-kind task is 'ok', the root has a final report, and the run's answer report names the child's failed task by its path
- A plan whose aggregate task runs and throws has no final report, and the run fails with 'executor-aggregator-failed' as today

### 1.11 E20261008b9d5c5c4:S007:T011 — A failure outside a task's runtime fails that task, not the walk

The plan walk turns an error raised while it handles one task outside the task's runtime (writing the task's record, reporting its progress) into that task's failure and goes on. An error it cannot tie to a task still propagates.

**Acceptance checks:**
- A failure to write one task's record fails that task with the error's message, the plan's result holds the failure, and the tasks after it run
- An error that is not tied to a task propagates out of the walk

### 1.12 E20261008b9d5c5c4:S007:T012 — A run that dies says so: live runs are counted and an uncaught error is recorded

Add the count of live runs per id and isRunLive; runAnalyze raises the count before its first read of a record and lowers it when it returns or throws. Guard the whole of runAnalyze from that first read: an uncaught error writes the run record as failed at the stage reached, with 'internal-error', and is returned; the stage variable starts as 'classify'. The handler's own record write is guarded.

**Acceptance checks:**
- An error thrown from inside a stage with no handler: runAnalyze returns 'internal-error' at that stage, the record on disk says the same, 'done' fires once, and the run is no longer live
- An error before any stage has started is reported at 'classify'
- A run is live from before its first read of a record until it returns, and not after it throws; with two runs under one id the id is live until the second returns
- With a run record that cannot be written, the handler still returns 'internal-error' and fires 'done' once
- A completed run asked for again returns its stored result and report, and a record left 'in-progress' is replaced by the new run's first record

### 1.13 E20261008b9d5c5c4:S007:T013 — The run checks its scope once before it plans

After the run context is built and before planning, runAnalyze calls resolveTaskScope with the intent's scope and kind of source (a generic intent is not checked). A docs run on a scope in no registered repo ends at stage 'plan' with 'scope-not-indexed' before any plan is made.

**Acceptance checks:**
- A docs run whose scope lies in no registered repo, with a readable registry that holds repos, ends at stage 'plan' with 'scope-not-indexed' and the planner is not called
- A pairing the family's row refuses still ends at stage 'classify' with 'scope-ref-kind-target-mismatch', as today
- A generic run is not checked, and a code, infra or data run on an indexed repo plans as before

### 1.14 E20261008b9d5c5c4:S007:T014 — A record with no live run is abandoned when it is read

The daemon's status request rewrites a record that is 'in-progress' with no live run as failed with 'run-abandoned' at its stage and returns it. purgeRun takes an optional isLive; given it and finding the run not live it rewrites and purges without force, and without it refuses as today; the daemon's purge request passes isRunLive. Both rewrites are guarded and best effort. The daemon's run handler, for an error that escapes runAnalyze, writes the record as failed if it is still 'in-progress' and sends the record's stage; it sends the result frame and the 'done' frame whether or not that write succeeds.

**Acceptance checks:**
- A record left 'in-progress' with no live run: the status request returns it as failed with 'run-abandoned' at its stage, and the file on disk is rewritten
- The daemon's purge request, driven through its handler, purges such a record without force; purgeRun called with no liveness refuses it with 'run-in-progress'
- A record 'in-progress' for a run that is live is returned unchanged by the status request and refused by the purge request
- With a record that cannot be written, the status request still returns the record as abandoned and the purge still removes the directory
- The daemon's handler, given a runAnalyze that throws, writes the record as failed and sends the record's stage, not 'classify'; with a record that cannot be written it still sends both frames
- No reader changes a record that is 'ok' or 'failed'

### 1.15 E20261008b9d5c5c4:S007:T015 — A run request with no prompt and a stated source is accepted

The daemon's parser for the run request accepts the empty string as prompt when a kind of source is stated, and refuses it with a message that says a kind of source must be stated when none is. A prompt of only white space is accepted with and without a stated source, as today.

**Acceptance checks:**
- An empty prompt with a stated kind of source is accepted and gives an unfocused intent
- An empty prompt with no stated source is refused with 'invalid-params' and the new message
- A prompt of only white space is accepted with and without a stated source

### 1.16 E20261008b9d5c5c4:S007:T016 — The HLD's wording on run records is brought in line

Edit the HLD's text on run records to say what this Story builds: the process keeps a count of the runs it is executing per id, and two readers apply the abandoned rule (the status request and the purge), while a new run replaces a record left in progress. The typed amendment kinds do not cover a wording change, so this is an edit in place that clears the HLD's approval; the amended HLD is put to the stakeholder for approval, and the Epic's existing designs are acknowledged against it once it is approved.

**Acceptance checks:**
- The HLD's text on run records says a count of runs per id and two rewriting readers, in the framework text and in this Story's boundary, and no longer says a set of ids or three readers
- The rendered HLD matches its stored data
- The amended HLD is approved by the stakeholder before this Story's last Task is submitted, and the designs of the Epic's Stories pass the approved-and-fresh gate afterwards

### 1.17 E20261008b9d5c5c4:S007:T017 — The daemon guide, the live checks and the baseline comparison

Update docs/daemon.md: the kinds of scope each family's tasks accept, the code on a failed task, the aggregate task's rule and what a report with absent inputs says, 'run-abandoned', the check before planning, and the prompt rule, with a note for the IDE repository on the optional code. Through the installed daemon running this Story's code, one at a time because each run spends the stakeholder's model quota: an infra and a data request; a code request; a request with an empty prompt and a stated source; infra or data requests at sizes above S to look for a nested plan; and a docs request, recorded and not a proof. Compare the four suites with the baseline taken in the first Task.

**Acceptance checks:**
- docs/daemon.md describes each of the listed changes and carries the note for the IDE repository
- Live: an infra and a data request each complete with a final report
- Live: a code request returns a final report whose first line names the failed functional-surface tasks
- Live: a request with an empty prompt and a stated kind of source completes
- Live: the sizes tried for a nested plan are recorded; if one run plans a planner-kind task, its child tasks appear by path in the run's answer report, and if none does the nested integration test is named as the proof of ac2
- Live: the docs request is recorded with its outcome and marked as the accepted exception, to be closed by Story s3
- Each live run's date and result are in the build record
- No test of the four suites that passed in the baseline fails after the last Task, other than the tests of the three removed scope functions

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a table test over the four families and the seven kinds of scope: each pairing in TARGET_TO_KINDS resolves, each pairing outside it throws ScopeKindTargetMismatchError naming the kinds allowed (mutation: give a family a kind outside its row) | `t2` |
| the function reads TARGET_TO_KINDS and holds no list of its own: a kind added to a row in a stand-in table is accepted | `t2` |
| a module, a file, a symbol and a connection scope resolve to the registered repo and the area (directory, file, entity id, connection id) | `t2` |
| a scope in no registered repo throws ScopeNotIndexedError for code and docs when the registry is readable and holds repos, and resolves for infra and data | `t2` |
| the three per-family functions are gone and no runtime file reads `scopeRef.value` to use as a repo path (a check over the runtime sources) | `t4`, `t5`, `t6` |
| with a registry that cannot be read, and with one that holds no repo, a code and a docs scope of a path kind are not refused and the task's repo path is the scope's own path; a symbol scope fails in both states, as resolveScope decides (mutation: treat a null repo as not indexed) | `t2` |
| one function maps the three scope error classes to their codes, with the data { scopePath, registeredAs } for 'scope-not-indexed', and the plan tree's and the daemon's mapping functions return through it exactly what they returned before, data included (mutation: return the code alone) | `t3` |
| prepareScope and stepScope accept, refuse and return exactly what they did: stepScope and prepareScope in run mode through resolveScopeForTarget, and prepareScope in classification mode (no intent) and in task mode with a pairing the table does not allow, which is still not refused (mutation: make the check in every mode) | `t1` |
| the indexed check, given readers, reads the registry and entities through them, and given none reads the real store as today (its existing tests, unchanged) | `t1` |
| a code task and a docs task with a module scope use only the entities and documents under that directory, and with a file scope only that file's | `t5`, `t6` |
| a data task with a connection scope works on that connection only | `t4` |
| the three docs tasks, the adherence check and the connection-listing task give the same result for a repo scope as before the change | `t4`, `t5`, `t6` |
| a data task with a repo scope on a directory that is not a registered repo, and one with a manifest-directory scope inside a registered repo, open the pool at that directory, as before the change (mutation: open it at the containing repo) | `t4` |
| a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory, and their records count within it, through the runner, its prepare function and retrieval; the lookup pipeline's direct call of the prepare functions, with no area, returns what it did before (mutation: drop the area at the hand-over from runner to prepare) | `t7` |
| a docs task with a module scope whose sections are not among the repository's nearest matches still gets those sections from the vector pass, because the search is made within the area's candidates (mutation: search the whole repository and drop what lies outside) | `t8` |
| the vector search given an empty list of ids returns no hits and makes no query; given as many ids as the largest directory of this repository holds it returns the nearest of them, in one query or in batches merged by distance (measured at build and recorded) | `t8` |
| a runtime that throws each of the three typed scope errors is recorded as failed with that error's code and a message without the 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check) | `t3` |
| the plan's and the run's tasksFailed carry the code | `t3` |
| a plan in which one of three producers failed: the aggregate task runs, receives the two outputs that exist and `absentInputs` naming the third with its producer and reason, and the plan has a final report (mutation: skip the aggregate task as before) | `t10` |
| a plan in which every producer failed: the aggregate task is skipped and the plan has no final report | `t10` |
| a task other than the aggregate task with a missing input is still skipped | `t10` |
| a nested plan in which one child task failed: the child's aggregate task runs, the planner-kind task is 'ok', the root has a final report, and the run's answer report names the child's failed task by its path | `t10` |
| the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent | `t9` |
| a plan whose aggregate task consumes nothing: it runs with and without a failed task before it, and with one it is given that task as absent with the names it would have produced (mutation: skip an aggregate task that consumes nothing) | `t10` |
| an error thrown from inside a stage that has no handler: runAnalyze returns a failure with code 'internal-error' at that stage, the record on disk says the same, the 'done' event fires once, and the run is no longer live (mutation: remove the handler) | `t12` |
| a run is live from before its first read of a record until it returns, and not after it throws; with two runs under one id the id is live until the second returns, and in between the status request returns 'in-progress' and purgeRun with liveness supplied refuses (mutation: hold a set of ids instead of a count) | `t12`, `t14` |
| the daemon's handler, given a runAnalyze that throws, writes the record as failed and sends the record's stage, not 'classify' | `t14` |
| a record left 'in-progress' with no live run: the status request returns it rewritten as failed with 'run-abandoned' at its stage, and the file on disk is rewritten (mutation: return the record as read) | `t14` |
| the same record: purgeRun with liveness supplied purges it without force; purgeRun with no liveness refuses it as today | `t14` |
| a record 'in-progress' for a run that is live is returned unchanged by the status request and refused by purgeRun | `t14` |
| starting a run under the id of a record left 'in-progress' by a run that died replaces that record with the new run's first record and runs, as today; the resume check makes no abandoned rewrite | `t12` |
| a completed run asked for again returns its stored result and its report, and no reader changes a record that is 'ok' or 'failed' | `t12`, `t14` |
| a writing failure while the walk handles one task fails that task and the walk goes on | `t11` |
| with a run record that cannot be written, runAnalyze's handler still returns 'internal-error' and fires 'done' once, and the daemon's handler still sends the result frame and the 'done' frame (mutation: let the write's error escape) | `t12`, `t14` |
| with a record that cannot be written, the status request still returns the record as 'run-abandoned', and purgeRun with liveness supplied still removes the directory (mutation: let the rewrite's error escape) | `t14` |
| a docs run whose scope lies in no registered repo, with a readable registry that holds repos, ends at stage 'plan' with 'scope-not-indexed' before the planner is called (mutation: remove the check before planning); a pairing the family's row refuses still ends at stage 'classify' with 'scope-ref-kind-target-mismatch', as today; a generic run is not checked | `t13` |
| an empty prompt with a stated kind of source is accepted and gives an unfocused intent | `t15` |
| an empty prompt with no stated source is refused with 'invalid-params' and a message that a kind of source must be stated | `t15` |
| a prompt of only white space is accepted with and without a stated kind of source, as today (mutation: treat white space as empty at the parser) | `t15` |
| an infra request and a data request each complete with a final report, as on 2026-10-08 | `t17` |
| a code request returns a final report whose first line names the failed functional-surface tasks, where on 2026-10-08 it returned none | `t17` |
| a request with an empty prompt and a stated kind of source completes | `t17` |
| a request sized so that its plan holds a planner-kind task: the child plan runs and its tasks appear by path in the run's answer report; if no size makes the planner emit one on this repository, that is recorded and the nested integration test stands as the proof | `t17` |
| a docs request, run and recorded but not a proof of ac1: it is expected to stop at the aggregate task with 'Prompt is too long'. This is the accepted exception of 2026-10-08, to be closed by Story s3 | `t17` |
| the analyze, mcp, daemon and workflow suites have no test that passed before the Story's first task and fails after its last, other than the tests of the three removed scope functions, which are listed in the contract and replaced by the table test | `t17` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s7 the scope contract: resolveScopeForTarget, resolveTaskScope, the indexed check's readers, and the area each family's tasks keep to`
- **[[c2]]** `prior-artifact` `LLD s7 the aggregate task's rule in the plan walk and the absent inputs handed to the aggregator`
- **[[c3]]** `prior-artifact` `LLD s7 runAnalyze and run records: the count of live runs per id, the uncaught-error handler, the scope check before planning`
- **[[c4]]** `prior-artifact` `LLD s7 the daemon's run and status requests: the abandoned rule, the handler for an escaped error, the empty prompt with a stated source`
- **[[c5]]** `prior-artifact` `LLD s7 purgeRun with optional liveness`
- **[[c6]]** `prior-artifact` `LLD s7 data model: the code on a task record and on tasksFailed, the docs area arguments, the ids filter of the vector search, AbsentInput`
- **[[c7]]** `prior-artifact` `LLD s7 error paths: the scope codes, 'internal-error', 'run-abandoned', 'executor-aggregator-failed', 'invalid-params'`
- **[[c8]]** `prior-artifact` `LLD s7 test strategy: the unit, integration, live and smoke subjects`
- **[[c9]]** `prior-artifact` `LLD s7 migration: the order of the moves, the removed scope functions and their tests, the baseline, the HLD wording`
