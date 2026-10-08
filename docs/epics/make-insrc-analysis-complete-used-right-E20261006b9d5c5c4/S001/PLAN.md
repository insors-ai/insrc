<!-- insrc:artifact PLAN-b9d5c5c40df5a574-s1 -->

# Plan: E20261008b9d5c5c4:S001

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**LLD run:** `wf-1791374475642-f4cbhs`
**LLD effective hash:** `7d17654ecfd1...`

Building this Story means giving every lookup result and every plan-task result one record of its own completeness, and deriving from those records a report that heads every answer. The work runs in four strands: the record, the report and a way to measure an item from its file; the lookups and the text search, which gain the record and stop returning an empty result when they could not run; the plan-task runtimes, which do the same; and the answer itself, whose bundle, text forms and failure path carry the report. About seventy source files change and no limit is raised. One thing is left for another repository: the IDE's mirrored bundle type needs the optional report.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** The completeness record, the answer report and the completeness line | S | — | unit: buildCompleteness computes complete and rejects contradictory facts with RangeError; unit: buildCompleteness accepts several reached limits and a per-group limit below the returned count; unit: deriveAnswerReport: all complete, one incomplete, one failed, and a source with neither is rejected; unit: renderCompletenessLine names every incomplete and failed source and repeats a shared basis note once | [[c1]] |
| 2 | **`t2`** Measure an item's full length from its file | M | — | unit: measureItem returns the file's length for a document and the length of its lines for a section, and says when the indexer cut the stored body; unit: measureItem does not establish a length for a changed or a missing file (mutation: skip the hash comparison); unit: the summariser reads its cut from the exported constant and no file under src/indexer or src/db changes | [[c2]] |
| 3 | **`t3`** The text search reports what it left out and fails when it cannot read its root | M | — | unit: the Node backend reports a file skipped for its size, an unreadable file and a shortened line with its full length; unit: the ripgrep backend reports shortened lines, the per-file limit, discarded output and its exclusion rule; unit: on the real primitive an unreadable root throws and an unreadable directory below it is skipped (mutation: restore the catch that returns); unit: a ripgrep run that exits with another code or times out is recorded as backendFallback, and output past the cap sets outputDiscarded; unit: the search tool on an unreadable root fails with 'search-failed' and still says 'bad regex' for an invalid regex; unit: the Node backend's rule text names dot-named entries and non-regular files, against a fixture holding both; unit: the search's hits and limits are unchanged for its other callers | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Every lookup output carries a completeness record | L | `t1`, `t3` | unit: a table test over all twenty lookup types finds a completeness record with its stated basis; unit: each lookup that stops at a count reports the limit with its scope; unit: data-model.trace reports its overall limit and both per-target limits; unit: search.text and config.trace turn the search's omissions into skipped, partlyRead and limited; unit: the table-listing lookup reads the data driver's cut flag into a limit | [[c1]] [[c2]] |
| 5 | **`t5`** Remove the flags the record replaces, with every reader | M | `t4` | unit: the table test over all twenty lookup types finds no `truncated`, `totalCallers` or `exhaustedNote` field; unit: no prompt under src/prompts/analyze names a removed field, and each names `completeness`; unit: a lookup output cached before the change is not returned: the cache key includes its version | [[c2]] [[c5]] |
| 6 | **`t6`** A partly read item is named with how much of it was read | M | `t2`, `t5` | unit: a document lookup that cuts a 100,000-character section to 2,000 reports it against the section's real length (mutation: measure the stored body); unit: module.profile reports each file it cut with the kept and full lengths; unit: a lookup that passes on a stored body uncut reports the item as partly read when the indexer cut it; unit: each of the three lookups that pause for a model call builds its record in finalize from the facts prepare carried, and a prepared value without them is not established | [[c2]] [[c3]] |
| 7 | **`t7`** A lookup that cannot run is reported as failed, with what it had found | L | `t5` | unit: a text search that throws becomes the failed output (mutation: restore the catch that returns an empty result); unit: each class of lookup catch clause has a test: an expected condition says so in the record, anything else is a failed output; unit: the count of catch clauses in the lookup files equals the number of classified entries; unit: the free-form lookup at its turn limit is a failed output whose partial holds the tool results gathered; unit: a free-form answer's record has basis 'model-directed' and is not complete; unit: both mapping functions put the gathered tool results in the data of 'shaper-tool-loop-exhausted' | [[c1]] [[c2]] [[c3]] |
| 8 | **`t8`** The step tool's path reports a failed lookup the same way | M | `t7` | unit: stepPlan with a lookup whose prepare throws records the failed output and goes on to the next lookup (mutation: remove the conversion); unit: an agent's answer that fails the lookup's schema is rejected as retryable before finalize is called; unit: a finalize that throws records the failed output and the run goes on; unit: no answer at all to capability.reuse-check is accepted and gives a record that is not established; unit: a finalize that throws, and a prepare that throws, leave no row in the lookup cache (mutation: store before the check); unit: a step state minted before the change still resumes | [[c1]] [[c2]] [[c3]] |
| 9 | **`t9`** Every plan-task result carries a completeness record | L | `t1` | unit: a table test over every registered plan-task runtime finds a completeness record on each result; unit: the plan walk copies the record to the task record, and a runtime that returns none is recorded as failed; unit: no output of the five infra inventories has a `truncated` field; a walk that stops at its cap is a limit in the record; unit: discovery-families reports its per-family sample as a per-group limit and is not rejected by the builder; unit: the object-listing plan task reads the data driver's cut flag into a limit | [[c1]] [[c2]] |
| 10 | **`t10`** Plan tasks report cut documents and the project context's limits | M | `t2`, `t9` | unit: each adherence check reports a body it cut with the kept and full lengths; unit: the project-context assembler reports a limit it reached and the documents behind its decisions and constraints, and the adherence check puts them in the record; unit: the docs plan tasks report a document longer than the summariser's cut under partlyRead, and a missing summary and a failure placeholder under skipped (mutation: drop the partlyRead entry); unit: the docs tool exposed to agents returns what it returned before | [[c2]] |
| 11 | **`t11`** A plan task that dropped something says so, or fails | M | `t9` | unit: the count of catch clauses in the runtime files equals the number of classified entries; unit: an inventory over a tree with an unreadable directory and a file that does not parse lists both under skipped and is not complete (mutation: restore the silent skip); unit: an adherence check whose model call fails is recorded by the walk as a failed task | [[c2]] [[c3]] |
| 12 | **`t12`** Every bundle carries a report derived by code | M | `t5`, `t7` | unit: the stored bundle schema accepts a report and the schema version is 2; unit: the model-facing schema has neither meta nor report at both sites, on the first call and on a later one, and rejects an answer that carries a report; unit: runShaper's run-mode bundle carries the report derived from the executed lookups; unit: a request answered by the free-form lookup alone returns a bundle with a one-source 'model-directed' report; unit: the step tool's bundle phase attaches the report it derives from its state and rejects an agent-supplied one as 'bundle-schema'; unit: a bundle cached before the change is not returned; unit: no source file under src/mcp/analyze-step writes a literal schema version | [[c1]] [[c2]] [[c3]] [[c5]] |
| 13 | **`t13`** The completeness line heads every text form of an answer | S | `t12` | unit: renderBundleAsMarkdown, assembleMarkdown and flattenBundle write the completeness line first for a bundle with a report; unit: for a bundle with no report the first writes the not-recorded line and the other two write nothing; unit: the step tool's returned markdown for a state with one failed and one limited lookup names both in its first line | [[c1]] [[c2]] [[c3]] |
| 14 | **`t14`** A failed answer step ends the request with what the lookups found | L | `t12`, `t13` | unit: the pipeline's three causes after the lookups ran carry the results and the report, and the cause table gives ShaperAnswerStepFailedError with its reason; unit: both mapping functions return 'answer-step-failed' with the reason, the results and the report, and a failed planning call is still 'shaper-llm-unavailable'; unit: a missing answer prompt found after the lookups ran carries the results and the report under its own code; a missing planning prompt carries none; unit: the daemon's error payload, the one-shot tool's message and the workflow runner's step failure carry the report and the reason | [[c1]] [[c2]] [[c3]] |
| 15 | **`t15`** The step tool reports a missing answer prompt with what its lookups found | S | `t14` | unit: a missing answer prompt after the lookups ran returns a non-retryable error with the results and the report, from the plan phase and from the narrow phase; unit: the step tool's JSON output carries error.data, its message starts with the completeness line, and any other error has no data member | [[c1]] [[c2]] [[c3]] |
| 16 | **`t16`** The plan tree's result carries the report | M | `t9`, `t12`, `t13` | integration: a run with one failed task and one limited task returns a report naming both, and its final report's text starts with the completeness line; integration: a run with a nested plan names an incomplete child task by its path; the planner-kind task and the aggregate-report task are not sources; integration: a run record written after the change resumes with its report (mutation: leave `report` out of the resume literal); integration: a run record written without a report resumes with none and its text form carries the not-recorded line | [[c1]] [[c2]] [[c3]] |
| 17 | **`t17`** The daemon guide, the live checks and the baseline comparison | S | `t6`, `t8`, `t10`, `t11`, `t15`, `t16` | live: a focused request whose text search reaches its limit returns a bundle whose first line says it is incomplete and names that lookup; live: a request with a lookup made to fail returns a bundle that lists it as failed, not as empty; smoke: no test of the analyze, mcp and daemon suites that passed in the baseline fails after the last task | [[c4]] [[c5]] |

### 1.1 E20261008b9d5c5c4:S001:T001 — The completeness record, the answer report and the completeness line

Add src/analyze/completeness.ts: the Completeness type (with `limited` as a list of reached limits, each with a scope, and partlyRead's totalChars nullable with a note), buildCompleteness, the AnswerReport type, deriveAnswerReport and renderCompletenessLine. Nothing uses them yet.

**Acceptance checks:**
- buildCompleteness computes `complete` (false for any reached limit, skipped item, partly read item or notEstablished) and never takes it as input
- buildCompleteness throws RangeError for a negative count, a total below the returned count, and an overall limit below the returned count, and accepts a per-group limit below it
- deriveAnswerReport names every incomplete and every failed source and throws RangeError for a source with neither a record nor a failure
- renderCompletenessLine returns 'Complete.' or a line naming every incomplete and failed source
- The tests are run under Node 22 and pass

### 1.2 E20261008b9d5c5c4:S001:T002 — Measure an item's full length from its file

Add src/analyze/item-length.ts with measureItem: for a document or file entity the file's length, for a section the length of its lines from start line to end line; whether the indexer cut the stored body (longer than the stored body, or the body ends with the marker); and 'not established' with a reason when the file's hash differs from the one recorded at indexing or the file is gone. Export the summariser's 8,192-character cut as a named constant. Nothing in the index changes.

**Acceptance checks:**
- measureItem returns the real length of a 100,000-character section indexed through the real parser, and says the indexer cut it
- A file changed after indexing, and a removed file, give a length that is not established, with the reason; removing the hash comparison makes that test fail
- The summariser reads its cut from the exported constant and its behaviour is unchanged
- No file under src/indexer or src/db is changed by this task

### 1.3 E20261008b9d5c5c4:S001:T003 — The text search reports what it left out and fails when it cannot read its root

In the search primitive: add `omitted` to the result (skipped files with a reason, shortened lines with their full length, the per-file limit being reached, discarded output, a ripgrep run that started and failed, and each backend's exclusion rule in full); make an unreadable root throw and an unreadable directory below it a skipped entry; add `stdoutTruncated` to the shell helper's result and read it; make the search tool report a failure that is not a bad regex as 'search-failed' with the real message.

**Acceptance checks:**
- The Node backend reports a file skipped for its size, an unreadable file, an unreadable directory and a shortened line, on a real temporary directory
- A search whose root cannot be read throws on the real primitive; restoring the catch that returns makes the test fail
- A ripgrep stand-in that exits with code 2, and one that writes past the cap, give backendFallback and outputDiscarded
- The Node backend's rule text names dot-named entries and non-regular files, checked against a fixture holding both
- The search tool on an unreadable root fails with 'search-failed' and still says 'bad regex' for an invalid regex
- The hits and limits of the search are unchanged for its existing callers, and the existing search tests pass

### 1.4 E20261008b9d5c5c4:S001:T004 — Every lookup output carries a completeness record

Add `completeness` to each of the twenty lookup output types and fill it in each lookup with its basis and every count limit it reaches (several for data-model.trace); read the search's omissions into the record in search.text and config.trace, and the data driver's cut flag in the table listing. The fields it replaces stay in place in this task, so the type checker stays green.

**Acceptance checks:**
- A table test over all twenty lookup types finds a completeness record with the stated basis on each output
- Each lookup that stops at a count reports the limit with its scope; data-model.trace reports its overall limit and both per-target limits
- search.text and config.trace turn skipped files, shortened lines and a reached limit into the record
- The table listing reads the data driver's cut flag into a limit
- Every graph-based result carries the note that the stored graph's own coverage is not established
- tsc is clean and the analyze suites pass under Node 22

### 1.5 E20261008b9d5c5c4:S001:T005 — Remove the flags the record replaces, with every reader

Remove `truncated` (three outputs), `totalCallers` and `exhaustedNote` from the lookup outputs and update every reader in the same task, including the field lists and the instructions in the four answer-writing prompts that name them. A not-found note stays where it explains an empty result that is complete and moves into the record where it reports something missing. Add a version to the lookup cache's key, so an output stored without a record is not returned; the step tool's narrow phase writes under the same key.

**Acceptance checks:**
- No lookup output has a `truncated`, `totalCallers` or `exhaustedNote` field, asserted by the table test over all twenty types
- No prompt under src/prompts/analyze names a removed field, and each names `completeness` where it listed one; only field lists and the instructions about a cut result changed, not a layout
- A lookup output cached before the change is not returned: the cache key includes its version
- tsc is clean, which shows every reader was updated, and the analyze and mcp suites pass under Node 22

### 1.6 E20261008b9d5c5c4:S001:T006 — A partly read item is named with how much of it was read

Wherever a lookup cuts an item's content, report it in partlyRead with the item, the characters kept and the full length from measureItem: the two document lookups (2,000), module.profile (4,096), and any lookup that passes on a stored body the indexer cut. The two document lookups and capability.reuse-check gather their facts in prepare and carry them to finalize in a new `completenessFacts` field of the prepared value; a prepared value without it gives a record that is not established.

**Acceptance checks:**
- A document lookup that cuts a 100,000-character section to 2,000 reports 2,000 of the section's real length; measuring the stored body instead makes the test fail
- module.profile reports each file it cut with both lengths
- A lookup that passes on a stored body the indexer cut reports the item as partly read
- Each of the three lookups that pause for a model call builds its record in finalize from the facts prepare carried
- A prepared value minted without the facts gives a record that is not established, with the reason
- The limits and cuts keep their values

### 1.7 E20261008b9d5c5c4:S001:T007 — A lookup that cannot run is reported as failed, with what it had found

List the lookups' catch clauses (twenty-five in twelve files at design time) and classify each: a clause that handles one named, expected condition keeps returning a result and says so in the record; every other clause rethrows. Add LookupFailedError and the failed output's `partial`; the executor's conversion copies the findings. The free-form lookup's turn limit becomes a failed output with the tool results gathered, carried on the loop's own error; a free-form answer's record has basis 'model-directed' and is not complete.

**Acceptance checks:**
- The build record lists every catch clause with its class: 'expected: <condition>' or 'rethrow'
- A test counts the catch clauses in the lookup files and fails when the count differs from the number of classified entries, so a clause added later cannot go unclassified
- A text search that throws becomes the failed output; restoring the catch that returns an empty result makes the test fail
- Each class of clause has a test: an expected condition returns a result whose record says so; anything else reaches the executor as a failed output
- The free-form lookup at its turn limit is a failed output whose partial holds the tool results gathered
- A free-form answer's record has basis 'model-directed' and is not complete
- When the tool loop is the whole answer, both mapping functions still map the turn-limit error to 'shaper-tool-loop-exhausted' and put the gathered tool results in its data

### 1.8 E20261008b9d5c5c4:S001:T008 — The step tool's path reports a failed lookup the same way

In stepPlan, wrap the unguarded prepare of a lookup that pauses for a model call in the same conversion as the other branch. Add a `schema` member to the runner's entry; the narrow phase validates the agent's answer against it before finalize and returns the retryable error on failure, with no answer at all to capability.reuse-check exempt; a throw from finalize becomes the failed output. A failed output is never written to the lookup cache at any of the four conversion sites.

**Acceptance checks:**
- stepPlan with a lookup whose prepare throws records the failed output for it and goes on to the next lookup; removing the conversion makes the test fail
- An agent's answer that fails the lookup's schema is rejected as retryable before finalize is called
- A finalize that throws records the failed output and the run goes on
- No answer at all to capability.reuse-check is accepted and gives a record that is not established
- A prepare that throws, and a finalize that throws, leave no row in the lookup cache; storing before the check makes the test fail
- A step state minted before the change still resumes

### 1.9 E20261008b9d5c5c4:S001:T009 — Every plan-task result carries a completeness record

Make the record a required part of a runtime's result and fill it in all twenty-six runtime files with the count limits each reaches; the walk copies it to the task record and records a template-kind task whose runtime returned none as failed. Remove the five infra inventories' own `truncated` field in favour of a limit in the record, and report the per-family sample as a per-group limit. The object-listing plan task reads the data driver's cut flag into a limit. An aggregate-report runtime returns a record that says its completeness is that of the tasks it summarises.

**Acceptance checks:**
- A table test over every registered runtime finds a completeness record on each result
- The walk copies the record to the task record, and a stand-in runtime that returns none is recorded as failed
- No output of the five infra inventories has a `truncated` field; a walk that stops at its cap is a limit in the record, and the existing infra tests are updated to assert it
- discovery-families reports its per-family sample as a per-group limit and is not rejected by the builder
- The object-listing plan task reports the data driver's cut as a limit
- tsc is clean and the analyze suites pass under Node 22

### 1.10 E20261008b9d5c5c4:S001:T010 — Plan tasks report cut documents and the project context's limits

The three adherence checks report their 1,200-character cut in partlyRead through measureItem. The project-context assembler's result gains which of its limits were reached and the documents behind its decisions and constraints, and the adherence check reads them into the record. The two docs plan tasks report a document longer than the summariser's cut as partly read, with its file, the cut and the full length, and a missing summary or a failure placeholder as skipped.

**Acceptance checks:**
- Each adherence check reports a body it cut with both lengths
- The project-context assembler reports a limit it reached and the documents behind its decisions and constraints, and the adherence check puts them in limited and partlyRead
- The docs plan tasks report a document longer than 8,192 characters under partlyRead with its file and both lengths; dropping the entry makes the test fail
- A missing summary and a failure placeholder are listed under skipped
- The docs tool exposed to agents returns what it returned before

### 1.11 E20261008b9d5c5c4:S001:T011 — A plan task that dropped something says so, or fails

List the runtimes' catch clauses and settle their count (fifteen in eleven files by one count, eighteen by the review's). Classify each as for the lookups: a file or directory an inventory could not read or parse is recorded under skipped and the task's record is not complete; a clause that hides the failure of the task's whole work rethrows, so the walk records the task as failed.

**Acceptance checks:**
- The count of catch clauses in the runtime files is settled first and written in the build record with each clause's class
- A test counts the catch clauses in the runtime files and fails when the count differs from the number of classified entries
- An inventory over a tree with an unreadable directory and a file that does not parse lists both under skipped and is not complete; restoring the silent skip makes the test fail
- An adherence check whose model call fails is recorded by the walk as a failed task

### 1.12 E20261008b9d5c5c4:S001:T012 — Every bundle carries a report derived by code

Add the optional `report` to the bundle type and the stored schema and raise the schema version to 2. Remove `report` from the schema given to a model at both sites (inside the kept stripped copy, and for the tool loop's final answer), so a model's answer carrying one fails validation and is retried. Derive the report from the executed lookups in run mode, and a one-source 'model-directed' report for a free-form answer. The step tool's bundle phase derives and attaches the report from its state and rejects an agent-supplied one; its start phase's fallback meta uses the version constant.

**Acceptance checks:**
- The stored schema accepts a report and the version is 2; the model-facing schema has neither meta nor report, on the first call and on a later one, at both sites
- runShaper's run-mode bundle carries the report derived from the executed lookups, through the pipeline's stand-in steps
- A request answered by the free-form lookup alone returns a bundle whose report has one source, 'model-directed' and not complete
- The step tool's bundle phase, given a state with one failed and one limited lookup, attaches the derived report, and rejects a bundle in which the agent supplied one as 'bundle-schema'
- A bundle cached before the change is not returned
- No source file under src/mcp/analyze-step writes a literal schema version

### 1.13 E20261008b9d5c5c4:S001:T013 — The completeness line heads every text form of an answer

The three functions that turn a bundle into text write the completeness line first when the bundle has a report. For a bundle with none, the one an agent or a person reads writes the not-recorded line; the two whose text goes into a model's prompt write nothing.

**Acceptance checks:**
- renderBundleAsMarkdown, assembleMarkdown and flattenBundle each start with the completeness line for a bundle with a report
- For a bundle with no report, renderBundleAsMarkdown writes the not-recorded line and the other two write nothing, so the classifier's and planner's prompts are unchanged
- The step tool's returned markdown for a state with one failed and one limited lookup names both in its first line

### 1.14 E20261008b9d5c5c4:S001:T014 — A failed answer step ends the request with what the lookups found

The pipeline's 'bundle' and 'did-not-proceed' outcomes carry the executed results and the report; errorForPipelineCause takes an object as its third parameter and gives ShaperAnswerStepFailedError, with a reason, for the three causes Story s6 left interim; the prompt-missing error carries the findings when the answer prompt is missing after the lookups ran. Both mapping functions map the new error to 'answer-step-failed' with its data. The daemon's run handler, the plan-tree entry and the plan tree's run-context step pass the data on; the one-shot tool prints the completeness line and the failed step's reason; the workflow runner fails its step with the cause and the report.

**Acceptance checks:**
- Each of the three causes carries the executed results and the report, and the cause table turns each into ShaperAnswerStepFailedError with its reason
- Both mapping functions return 'answer-step-failed' with { reason, results, report }, and a failed planning call is still 'shaper-llm-unavailable'
- A missing answer prompt found after the lookups ran carries the results and the report under its own code; a missing planning prompt carries none
- The daemon's error payload, the one-shot tool's message and the workflow runner's step failure each carry the report and the reason
- The existing tests of the cause table are updated for the new parameter and pass

### 1.15 E20261008b9d5c5c4:S001:T015 — The step tool reports a missing answer prompt with what its lookups found

The step tool's error output gains an optional data member and the error helpers of its plan and narrow phases take it. The two calls that prepare the answer-writing turn catch a missing prompt and return a non-retryable error whose data holds the executed results and the report derived from them, and whose message starts with the completeness line.

**Acceptance checks:**
- A missing answer prompt after the lookups ran returns a non-retryable error whose data holds the results and the report, from the plan phase and from the narrow phase
- The error's message starts with the completeness line
- An error of any other kind has no data member
- The step tool's JSON output carries error.data as returned

### 1.16 E20261008b9d5c5c4:S001:T016 — The plan tree's result carries the report

Add collectPlanSources, which gathers the report's sources from an executed plan: a failed or dependency-skipped task is a failed source, a planner-kind task is replaced by its child plan's tasks named by path, and an aggregate-report task is left out. The run's result and the run record carry the report as an optional field; the resume literal copies it; the final report's text starts with the completeness line, and a run record stored before the change gives the not-recorded line with no report invented.

**Acceptance checks:**
- A run with one failed task and one limited task returns a report that names both, and its final report's text starts with the completeness line
- A run with a nested plan names an incomplete task of the child plan by its path; the planner-kind task and the aggregate-report task are not sources
- A run record written after the change resumes with its report; leaving `report` out of the resume literal makes the test fail
- A run record written without a report resumes with none, and its text form carries the not-recorded line

### 1.17 E20261008b9d5c5c4:S001:T017 — The daemon guide, the live checks and the baseline comparison

Update docs/daemon.md: the error-code table for 'answer-step-failed' and the data it carries, the description of the bundle for the report and the completeness line, and a note for the IDE repository that its mirrored bundle type needs the optional `report` (not built here). Add the live suite, gated by INSRC_LIVE_TESTS, and run it once. Compare the analyze, mcp and daemon suites against a baseline taken on the commit before this Story's first task.

**Acceptance checks:**
- docs/daemon.md describes 'answer-step-failed', its data, the report on the bundle and the completeness line, and carries the note for the IDE repository
- Live, on this repository: a focused request whose text search reaches its limit returns a bundle whose first line says it is incomplete and names that lookup
- Live: a request with a lookup made to fail lists it as failed, not as empty
- The live run's date and result are written in the build record
- The baseline result of the three suites, taken before the Story's first task, is recorded, and no test that passed in the baseline fails after the last task

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildCompleteness computes complete: false for limited, skipped, partlyRead or notEstablished, true otherwise, and rejects contradictory facts with RangeError | `t1` |
| deriveAnswerReport: all complete; one incomplete (reason composed from limited, skipped and partlyRead); one failed; a source with neither a record nor a failure is rejected | `t1` |
| renderCompletenessLine names every incomplete and every failed source, and repeats a shared basisNote once | `t1` |
| buildCompleteness accepts several reached limits, compares only an overall limit with the returned count, and accepts a per-group limit smaller than the returned count | `t1` |
| the Node search backend reports a file skipped for its size, a file it cannot read, and a shortened line with its full length, where each is dropped silently today | `t3` |
| the ripgrep backend reports shortened lines, the per-file limit being reached and discarded output, and states what it excludes by rule | `t3` |
| search.text and config.trace turn the search's omissions into skipped, partlyRead and limited, and a search that throws becomes the failed output (mutation: restore the catch that returns an empty result) | `t4`, `t7` |
| the search tool's hits and limits are unchanged for its other callers | `t3` |
| on the real primitive, not a stand-in: a search whose root cannot be read throws, and an unreadable directory below the root is listed as skipped (mutation: restore the catch that returns) | `t3` |
| a ripgrep run that exits with another code or is killed at its timeout is recorded as backendFallback, and output past the cap sets outputDiscarded through the shell helper's flag | `t3` |
| the search tool on an unreadable root fails with 'search-failed' and the real message, and still says 'bad regex' for an invalid regex | `t3` |
| the Node backend's rule text names dot-named entries and non-regular files, checked against a fixture holding a dot-named file and a symbolic link that match the pattern | `t3` |
| a table test over all twenty lookup types: each runner's output has a completeness record with its stated basis, and no output has a `truncated`, `totalCallers` or `exhaustedNote` field | `t4`, `t5` |
| each lookup that stops at a count reports limited with the limit, and each that cuts content reports partlyRead with the kept and full lengths (document lookups, module.profile, the adherence checks) | `t4`, `t6`, `t10` |
| each of the catch clauses is covered by a test of its class: an expected condition returns a result whose record says so; anything else reaches the executor as a failed output | `t7` |
| the free-form lookup at its turn limit is a failed output whose partial holds the tool results gathered, and a free-form answer's record has basis 'model-directed' and is not complete | `t7` |
| the table-listing lookup and the object-listing plan task read the data driver's cut flag into limited | `t4`, `t9` |
| a table test over every registered plan-task runtime: each returns a completeness record; the plan walk copies it to the task record, and a runtime that returns none is recorded as failed | `t9` |
| stepPlan with a lookup whose prepare throws records the failed output for it and goes on to the next lookup (mutation: remove the conversion); an agent's answer that fails the lookup's schema is rejected as retryable before finalize is called, and a finalize that throws records the failed output | `t8` |
| each of the three lookups that pause for a model call builds its record in finalize from the facts prepare carried, and a prepared value without them gives a record that is not established | `t6` |
| data-model.trace with more targets than its limit and a target with more fields than its limit reports both limits, each with its scope; discovery-families reports its per-family sample as a per-group limit and is not rejected by the builder | `t4`, `t9` |
| a finalize that throws, and a prepare that throws, leave no row in the lookup cache (mutation: store before the check) | `t8` |
| no plan-task output of the five infra inventories has a `truncated` field; a walk that stops at its cap is in the record as a limit | `t9` |
| each class of runtime catch clause has a test: an inventory over a tree with an unreadable directory and a file that does not parse lists both under skipped and is not complete (mutation: restore the silent skip); an adherence check whose model call fails is recorded by the walk as a failed task | `t11` |
| the narrow phase validates an agent's answer against the schema on the runner's entry; no answer at all to capability.reuse-check is accepted and gives a record that is not established | `t8` |
| the stored bundle schema accepts a report and the schema version is 2; the schema given to the answer-writing call and to the tool loop's final answer has no report property | `t12` |
| the model-facing schema rejects an answer that carries a report, at both sites, and the bundle a valid answer becomes carries the derived one; a bundle an agent writes with a report is rejected by the step tool as 'bundle-schema' | `t12` |
| runShaper's run-mode bundle carries the report derived from the executed lookups, through the pipeline's stand-in steps | `t12` |
| renderBundleAsMarkdown, assembleMarkdown and flattenBundle write the completeness line first; for a bundle with no report the first writes the not-recorded line and the other two write nothing | `t13` |
| a lookup output and a bundle cached before the change are not returned: the lookup cache's key includes its version and the bundle cache's key the schema version | `t5`, `t12` |
| the step tool's bundle phase, given a state holding one failed and one limited lookup, attaches the report it derives from that state and returns markdown whose first line names both | `t12`, `t13` |
| a request answered by the free-form lookup alone returns a bundle whose report has one source, with basis 'model-directed' and not complete | `t12` |
| no source file under src/mcp/analyze-step writes a literal schema version: the start phase's fallback meta refers to SCHEMA_VERSION | `t12` |
| the kept model-facing schema has neither meta nor report, on the first call and on a later one | `t12` |
| the pipeline's three causes after the lookups ran carry the executed results and the report, and the cause table turns each into ShaperAnswerStepFailedError with its reason | `t14` |
| both classifyShaperError functions map it to 'answer-step-failed' with the reason, the results and the report in data, and a failed planning call is still 'shaper-llm-unavailable' | `t14` |
| the daemon's error payload, the one-shot agent tool's message and the daemon's workflow runner's step failure each carry the report and the reason | `t14` |
| a missing answer prompt, found after the lookups ran, gives the prompt-missing error with the results and the report, and both mapping functions keep its code and put them in its data; a missing planning prompt carries none | `t14` |
| on the step tool's path, a missing answer prompt after the lookups ran returns a non-retryable error whose data holds the executed results and the derived report, from the plan phase and from the narrow phase | `t15` |
| the step tool's JSON output for that error carries error.data with the results and the report, its message starts with the completeness line, and an error of any other kind has no data member | `t15` |
| a run with one failed task and one limited task returns a report that names both, and its final report's text starts with the completeness line | `t16` |
| the run record stores the report, and a run record written without one is returned with no report, none is invented for it, and its text form carries the not-recorded line | `t16` |
| a run with a nested plan: the report names an incomplete task of the child plan by its path, the planner-kind task itself is not a source, and the aggregate-report task is not a source | `t16` |
| a run record written after the change resumes with its report (mutation: leave `report` out of the resume literal) | `t16` |
| a focused request whose text search reaches its limit returns a bundle whose first line says it is incomplete and names that lookup | `t17` |
| a request with a lookup made to fail returns a bundle that lists it as failed, not as empty | `t17` |
| measureItem returns the file's length for a document, the length of its lines for a section, and says the indexer cut the stored body when the item is longer than 8,192 characters or the body ends with the marker | `t2` |
| measureItem returns the full length as not established, with the reason, when the file's hash differs from the one recorded at indexing and when the file is gone (mutation: skip the hash comparison) | `t2` |
| a document lookup that cuts a 100,000-character section to 2,000 reports 2,000 of the section's real length, not of the stored body's (mutation: measure the stored body) | `t6` |
| a lookup that passes on a stored body uncut reports the item as partly read when the indexer cut it | `t6` |
| docs family-summarise and docs discovery-inventory report a document longer than the summariser's cut under partlyRead with its file, the cut and the full length, and a missing summary and a failure placeholder under skipped (mutation: drop the partlyRead entry) | `t10` |
| the project-context assembler reports a limit it reached and the documents behind its decisions and constraints, and the adherence check puts them in limited and partlyRead | `t10` |
| nothing is written to the index: no source file under src/indexer or src/db changes for this entry, and the summariser's cut is one exported constant read by the docs plan tasks | `t2`, `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contract details: the completeness record and its builder, the search primitive's result, the lookup executor, the answer report, the cause table and the answer-step failure, the bundle's report, and the plan tree's result (LLD-b9d5c5c40df5a574-s1, section 2)`
- **[[c2]]** `prior-artifact` `LLD s1 data model changes: the lookup outputs, the failed output, the catch clauses of the lookups and of the runtimes, content cuts and listings, the step tool's bundle and its path, the prompts, the plan-task runtimes, the text search and the shell helper, the three text forms, an item's full length from its file, and the callers that pass the failure on (LLD-b9d5c5c40df5a574-s1, section 3)`
- **[[c3]]** `prior-artifact` `LLD s1 error paths: the error cases, the edge cases and the invariants to preserve (LLD-b9d5c5c40df5a574-s1, section 5)`
- **[[c4]]** `prior-artifact` `LLD s1 test strategy: the framework, the levels with their subjects and the acceptance mapping (LLD-b9d5c5c40df5a574-s1, section 6)`
- **[[c5]]** `prior-artifact` `LLD s1 migration: the ordered steps and the backward-compatibility notes (LLD-b9d5c5c40df5a574-s1, section 7)`
