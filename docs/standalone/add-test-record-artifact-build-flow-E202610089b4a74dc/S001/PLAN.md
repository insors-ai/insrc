<!-- insrc:artifact PLAN-9b4a74dcdf47852a-S001 -->

# Plan: E202610089b4a74dc:S001

## Summary

**Epic:** `add-test-record-artifact-build-flow`
**LLD run:** `wf-1791470870888-9gi5o2`
**LLD effective hash:** `9b4a74dcdf47...`

The build starts with two small pieces that nothing calls yet: a reader of the test runner's output and the checks on the mapping a builder supplies. It then adds the test record and makes every existing reader of the artifacts leave it alone, before the gate's check plans and runner are changed to work test by test. Only then is the validate turn changed to take the mapping and write the record. The last Task runs the real gate on a real Task of another Story, after the installed daemon has been updated, which needs the stakeholder's push.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** A reader of the test runner's TAP output | S | — | unit: tap-results.test.ts: the captured run in the Story's tap-sample folder gives the result of each of its titles: pass, fail, skipped for ' # SKIP' with and without a reason, and skipped for ' # TODO'; unit: tap-results.test.ts: a title nested in a suite or a subtest is found at its depth by its own title; unit: tap-results.test.ts: TAP's escaping of '#' and backslash in a title is reversed, so the title as declared matches (mutation: compare the raw line); unit: tap-results.test.ts: a title that occurs twice fails if either occurrence failed, passes if one passed and none failed, and is skipped if both were skipped; unit: tap-results.test.ts: output with no TAP version line and no result line is reported as not understood, with no titles | [[c2]] [[c3]] |
| 2 | **`t2`** The checks on the builder's mapping | S | — | unit: test-mapping.test.ts: a mapping is refused, with every fault listed, for an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result, and a reported result on a unit, an integration and a contract test and on a test with no level; unit: test-mapping.test.ts: a correct mapping with cases, with a reported result on a live test, and with both, is accepted | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** The test record: its kind, merge, paths and document | M | — | integration: test-record.test.ts: the first write creates the record with one Task; a second Task is added; writing the first Task again replaces its entry only and keeps createdAt; integration: test-record.test.ts: the json is TESTS-<epicHash>-<storyId>.json and the document is TESTS.md in the same folder as the Story's BUILD.md, for an Epic's Story and for a standalone one (mutation: derive the folder from the record's own time); integration: test-record.test.ts: the document shows totals, then per Task and per named test a table of result, title and file, the tests reported by the builder with their evidence, and the failures outside the named cases; integration: test-record.test.ts: the stored mapping of a Task is read back as the mapping that was supplied, and an unreadable or misshapen record reads as no stored mapping | [[c2]] [[c3]] |
| 4 | **`t4`** Every reader of the artifacts directory leaves the record alone, and it cannot be approved | M | `t3` | integration: artifact-kinds.test.ts: with a TESTS record in the artifacts directory, each reader of that directory (the delivery view, for which both its records and its load failures are compared, the pending list, the ownership scan, the question scan, the Epic catalogue, the tracker's resolver, the CLI's workflow service, the amendment staleness scan, both scans of the amendment store, the path walk, the id parser) returns what it returned without it, and none throws; integration: artifact-kinds.test.ts: approval of a TESTS record by its md path and by its json path through the approval tool's route comes back in skipped[] with a reason that begins 'not-approvable:' and with no code-review outcome, also for a Story whose code review blocks with enforcement on; the TUI service's approve and reject throw NotApprovableError; the batch for its Epic does not stamp it; and the record is unchanged (mutations: put the kind check in the approval tool's route only; make it after the code-review gate); integration: migrate-docs-tree.test.ts: converging a forked Story folder that holds BUILD.md and TESTS.md moves both to the same folder and leaves the old folder empty (mutation: leave TESTS out of the migration's kind pattern); integration: daemon-gateway.test.ts: the VS Code plugin's workflow chain lists no row for a TESTS record and the same rows as without it (mutation: list every json) | [[c2]] [[c3]] |
| 5 | **`t5`** The build record links to the test record and is filed with it | M | `t3` | integration: build-record.test.ts: a build record with testRecord renders a line that links to TESTS.md, carries it forward when a later write omits it, and without it renders byte for byte as before; integration: completion-record.test.ts: completion of a Story whose only dirty files are its BUILD and TESTS records keeps the change log derived from the committed range, and the validate turn and the completion record leave out the same files (mutation: leave the test record's files out of the completion record's list) | [[c1]] [[c2]] [[c3]] |
| 6 | **`t6`** The check plans take a mapping and say where each named test's files come from | M | `t2` | integration: validation-checks.test.ts: with no mapping, planTaskCheckPlan and smallStandaloneCheckPlan return the same testFiles, unresolvedTests and noTests as before, and namedTests marks each name 'prefix' or 'none'; integration: validation-checks.test.ts: with a mapping, a name with no prefix is no longer unresolved, its files are in testFiles once, and a name with both a mapping and a prefix uses the mapping (mutation: keep the prefix's files as well); integration: validation-checks.test.ts: smallStandaloneCheckPlan with a mapping and no prefixed subject runs the mapped files and is not 'the LLD names no test file'; an unmapped prose subject is listed as not mapped and does not fail; integration: validation-checks.test.ts: trivialCheckPlan marks each touched file 'touched' and the result lists every title of each file | [[c1]] [[c2]] |
| 7 | **`t7`** The runner runs each file on its own and returns a result per case | M | `t1`, `t6` | integration: validation-checks.test.ts: runValidationChecks runs each file in its own process, in order, with the TAP reporter, and returns per file its exit code and titles (mutation: run all files in one command); integration: validation-checks.test.ts: a mapped case that passes, one that fails, one that is skipped and one whose title is not in the file get those four results, and the check is not ok when any is fail, skipped or not found (mutations: count not found as pass; count skipped as pass); integration: validation-checks.test.ts: a file that exits non-zero while its mapped cases pass fails the check and lists the other failing titles; integration: validation-checks.test.ts: a file that times out, and a file not started because the time limit was used up, are recorded with that note, their cases are not found, and the check is not ok; integration: validation-checks.test.ts: a run's whole output is written to a file and its path returned, with nothing cut; when that file cannot be written the results stand and the entry carries a note; integration: validation-checks.test.ts: a reported pass on a live test runs nothing and leaves the check's result to the other tests; a reported fail makes the check not ok; a Task whose tests are all reported as pass runs no file and passes with the note, while a Task with no file and an unreported name still fails (mutation: fail every run that has no file); integration: render.test.ts: the implement prompt tells the builder to pass the cases for each listed test at the validate turn, and the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before | [[c1]] [[c2]] [[c3]] |
| 8 | **`t8`** The validate turn takes and checks the mapping | M | `t3`, `t7` | integration: build-step.test.ts: a validate turn with a wrong mapping returns 'invalid-test-mapping', runs no check, calls no judge and writes neither record; integration: build-step.test.ts: a second validate turn of the same Task with no mapping uses the stored one (mutation: fall back to the prefix rule when a stored mapping exists); integration: build-step.test.ts: a stored mapping whose file is gone gives that case not found and a failed check, and the turn is not refused; integration: build-step.test.ts: the builder's reported results never set testsPassed: a mapping of reported passes with a failing mapped case still fails; integration: build-step.test.ts: the build tool's registered input shape accepts `tests` on the validate phase, refuses an entry or a case with a key the shape does not have, and the schema lookup returns the field | [[c1]] [[c2]] [[c3]] [[c5]] |
| 9 | **`t9`** The validate turn writes the test record and links it | M | `t5`, `t8` | integration: build-step.test.ts: a validate turn with a mapping writes the test record, the build record links to it, the change log leaves out both records' files, and the verdict's evidence carries the cases with their results and the record's path; integration: build-step.test.ts: when the test record cannot be written the verdict is returned unchanged with a note; on a first turn the build record carries no testRecord, and on a second turn the record on disk still shows the first run with its commit and time (mutation: let the write's error escape); integration: build-step.test.ts: when the judge session throws after the checks ran, the turn returns the same error as before, the test record holds this run's results with testsPassed from the tests check and the supplied mapping, and the build record is not written (mutation: write the test record in the build record's write, after the judge); integration: completion-record.test.ts: completion of a Story whose only dirty files are its BUILD and TESTS records keeps the change log derived from the committed range, and the validate turn and the completion record leave out the same files (mutation: leave the test record's files out of the completion record's list) | [[c1]] [[c2]] [[c3]] [[c5]] |
| 10 | **`t10`** The two records are filed together on every route | S | `t9` | integration: build-step.test.ts: a trivial standalone build validated with no implement turn before it, whose judge fails on the first turn and passes on a turn dated a day later, has its BUILD.md and TESTS.md in one folder; with an implement turn first, the BUILD record it wrote is the anchor and the test record follows it; and a small standalone build's test record carries the declared standalone flag before any BUILD record exists and the same when the first BUILD record is written by the completion path (mutation: anchor the BUILD record on its own time when a test record exists); integration: build-step.test.ts: a standalone validate call on a Story whose definition head is silent about standalone files TESTS.md beside BUILD.md under docs/epics, and the test record carries no standalone flag (mutation: hand the test record the raw declaration) | [[c2]] [[c3]] |
| 11 | **`t11`** The prompts and the guide tell the builder and the judge about the mapping | S | `t8` | integration: render.test.ts: the implement prompt tells the builder to pass the cases for each listed test at the validate turn, and the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before | [[c2]] [[c5]] |
| 12 | **`t12`** The live check on the real gate | S | `t4`, `t10`, `t11` | live: Task t1 of Story s7 of the analyzer epic, whose plan names its tests in prose, is submitted with a mapping converted from docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/tests.map.json: the gate runs the three test files, every case is pass, the tests check passes, and TESTS.md is written by the gate in that Story's folder in place of the hand-made one | [[c4]] [[c5]] |

### 1.1 E202610089b4a74dc:S001:T001 — A reader of the test runner's TAP output

Record the baseline first: the results of the mcp and workflow suites and of the VS Code plugin's tests at the commit before this Story's first change. Then add a module in the build step that turns the output of one test file's run into a result per test title: pass, fail or skipped, at any depth, with the runner's two escapes reversed, and a combined result for a title that occurs more than once. Its fixtures are the capture stored beside the design. Nothing calls it yet.

**Acceptance checks:**
- The baseline of the mcp and workflow suites and of the VS Code plugin's tests is recorded in the Story's folder with the commit it was taken on, before any change of this Story
- The captured run in the Story's tap-sample folder gives the result of each of its titles, with ' # SKIP' (with and without a reason) and ' # TODO' read as skipped
- A title nested in a suite or a subtest is found by its own title, and a suite's own line is a title like any other
- A title declared with '#' and a backslash matches what the runner printed; quotes are left as they are
- A title that occurs twice fails if either occurrence failed, passes if one passed and none failed, and is skipped if both were skipped
- Output with no TAP version line and no result line is reported as not understood, with no titles

### 1.2 E202610089b4a74dc:S001:T002 — The checks on the builder's mapping

Add the types of a mapping entry and a function that checks a mapping against the named tests of a Task or the subjects of a design, their levels, and the repository's tracked files, and returns every fault it finds. Nothing calls it yet.

**Acceptance checks:**
- Each of these is a fault and all faults are returned together: an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result
- A reported result is a fault for a test whose level is not exactly 'live' or 'smoke': unit, integration, contract, and a test with no level
- A correct mapping with cases, with a reported result on a live test, and with both, has no fault

### 1.3 E202610089b4a74dc:S001:T003 — The test record: its kind, merge, paths and document

Add 'TESTS' to the kinds of artifact as a story-scoped kind, and a test record module beside the build record's: the record's shape, a write that replaces one Task's entry and keeps the others and the first createdAt, a read of a Task's stored mapping, the json and md paths, and the document. The folder derivation for a Story's records takes a persisted test record's createdAt and standalone flag when there is no build record. No caller writes a record yet.

**Acceptance checks:**
- The first write creates the record with one Task; a second Task is added; writing the first Task again replaces its entry only and keeps createdAt
- The json is TESTS-<epicHash>-<storyId>.json and the document is TESTS.md in the same folder as the Story's BUILD.md, for an Epic's Story and for a standalone one, and with no build record the folder comes from the test record's own persisted createdAt and flag
- The document carries the artifact id marker and shows totals, then per Task and per named test a table of result, title and file, the tests reported by the builder with their evidence, and the failures outside the named cases
- A Task's stored mapping reads back as the mapping that was supplied; an unreadable or misshapen record reads as no stored mapping
- Each Task's entry carries the commit and time of its run and testsPassed

### 1.4 E202610089b4a74dc:S001:T004 — Every reader of the artifacts directory leaves the record alone, and it cannot be approved

Go through each reader of the artifacts directory named in the design and make it handle or skip a TESTS record: the delivery loader skips the prefix before its unknown-kind branch, the VS Code plugin's workflow chain skips it, the docs-tree migration takes TESTS into its own kind pattern and story-scoped list, and the rest are shown by test to be unaffected. Add NotApprovableError; approveArtifactByJsonPath and rejectArtifactByJsonPath throw it for a TESTS record, and the approval tool's single-path route checks the kind before it reads the meta or runs the code-review gate.

**Acceptance checks:**
- With a TESTS record in the artifacts directory, each reader (the delivery view, by its records and its load failures; the pending list; the ownership scan; the question scan; the Epic catalogue; the tracker's resolver; the CLI's workflow service; the amendment staleness scan; both scans of the amendment store; the path walk; the id parser) returns what it returned without it, and none throws
- Approval of a TESTS record by its md path and by its json path through the approval tool's route comes back in skipped[] with a reason that begins 'not-approvable:' and no code-review outcome, also for a Story whose code review blocks with enforcement on
- The TUI service's approve and reject throw NotApprovableError, the batch does not stamp the record, and the record is unchanged
- Converging a forked Story folder that holds BUILD.md and TESTS.md moves both to the same folder and leaves the old folder empty
- The VS Code plugin's workflow chain lists no row for a TESTS record and the same rows as without it. Its test is run by the root command the gate uses and by the plugin's own test script and passes in both; if the root command cannot run it, the build record says so and names the plugin's command as the proof
- The JetBrains reader is recorded as checked and unchanged

### 1.5 E202610089b4a74dc:S001:T005 — The build record links to the test record and is filed with it

Give the build record's body the optional testRecord link, rendered as one line, carried forward by the merge. At the merge, when there is no prior build record and a test record exists for the Story, seed the new record's createdAt, and its standalone flag when the test record's is true and the write states none. Add one function that returns the workflow's own files for a Story (both records' json and md, and the build-start file) and have the completion record use it for what its change log leaves out.

**Acceptance checks:**
- A build record with testRecord renders a line that links to TESTS.md, carries it forward when a later write omits it, and without it renders byte for byte as before
- With a test record on disk and no build record, a first build record written by each of its three writers (the validate turn's write, the completion path, and the implement turn of the trivial route) takes the test record's createdAt and lands in the test record's folder
- Completion of a Story whose only dirty files are its BUILD and TESTS records keeps the change log derived from the committed range
- The completion record's list of files to leave out comes from the one function

### 1.6 E202610089b4a74dc:S001:T006 — The check plans take a mapping and say where each named test's files come from

Extend planTaskCheckPlan and smallStandaloneCheckPlan with the optional mapping and all three plans with namedTests: per name, whether its files come from the mapping, from its file-name prefix, from the commit's touched files, or from nothing. Without a mapping the files and the unresolved names are exactly as before.

**Acceptance checks:**
- With no mapping, planTaskCheckPlan and smallStandaloneCheckPlan return the same testFiles, unresolvedTests and noTests as before, and namedTests marks each name 'prefix' or 'none'
- With a mapping, a name with no prefix is no longer unresolved, its files are in testFiles once, and a name with both a mapping and a prefix uses the mapping only
- smallStandaloneCheckPlan with a mapping and no prefixed subject runs the mapped files and is not 'the LLD names no test file'; an unmapped prose subject is listed as not mapped and does not fail
- trivialCheckPlan marks each touched file 'touched'

### 1.7 E202610089b4a74dc:S001:T007 — The runner runs each file on its own and returns a result per case

Change runValidationChecks to run each test file in its own process, in order, with the TAP reporter, under one time limit for all of them; to write each run's whole output to a file and return its path; and to return per file its exit code and titles, and per named test its cases with their results. Change the rule for the check's result accordingly, and extend the judge's evidence to list the named tests with their cases and each file's other failures. The existing tests of the runner are kept: only their assertions on the single command line for all files change, to one command per file, and the changed assertions are listed in the build record.

**Acceptance checks:**
- Each file is run in its own process, in order, with the TAP reporter, and per file the exit code and titles are returned
- A mapped case that passes, one that fails, one that is skipped and one whose title is not in the file get those four results, and the check is not ok when any is fail, skipped or not found
- A file that exits non-zero while its mapped cases pass fails the check and lists the other failing titles
- A file that times out, and a file not started because the time limit was used up, are recorded with that note, their cases are not found, and the check is not ok
- A run's whole output is written to a file and its path returned, with nothing cut; when that file cannot be written the results stand and the entry carries a note
- A reported pass on a live test runs nothing and leaves the result to the other tests; a reported fail makes the check not ok; a Task whose tests are all reported as pass runs no file and passes with a note, while a Task with no file and an unreported name still fails
- For a touched file the result lists every title of the file
- The judge's evidence lists each named test with its cases and results, and reads as before when there are no named tests; the tail of the output is still returned
- No existing test of the runner is removed, and the build record lists the assertions that changed
- The checks still never throw

### 1.8 E202610089b4a74dc:S001:T008 — The validate turn takes and checks the mapping

Declare `tests` on the validate phase in the build tool's registered input shape and description, strict for an entry and a case. In the validate turn, check a supplied mapping before any check runs and refuse with 'invalid-test-mapping'; with none supplied use the one stored for the Task; and hand the mapping to the check plans. The records are not written yet.

**Acceptance checks:**
- A validate turn with a wrong mapping returns 'invalid-test-mapping' with every fault listed, runs no check, calls no judge and writes neither record
- The registered input shape accepts `tests` on the validate phase, refuses an entry or a case with a key the shape does not have, and the schema lookup returns the field
- A validate turn with a mapping for names that carry no prefix runs the mapped files, and its verdict's evidence carries the cases with their results
- A validate turn with no `tests` and a stored mapping for the Task uses the stored one; a stored mapping whose file is gone gives that case not found and a failed check, and the turn is not refused
- The builder's reported results never set testsPassed: a mapping of reported passes with a failing mapped case still fails
- A validate turn with no `tests` and no stored mapping, for names that carry a prefix, reaches the same testsPassed as before; the trivial route ignores `tests`

### 1.9 E202610089b4a74dc:S001:T009 — The validate turn writes the test record and links it

In the validate turn, resolve the time and the standalone flag once for both records, write the test record straight after the checks and before the judge, put the link on the build record's existing write, take the files the change log leaves out from the one function, and carry the record's path in the verdict's evidence.

**Acceptance checks:**
- A validate turn with a mapping writes the test record, the build record links to it, the change log leaves out both records' files, and the verdict's evidence carries the record's path
- A second validate turn of the same Task replaces that Task's entry and leaves other Tasks' entries as they were
- When the test record cannot be written the verdict is returned unchanged with a note; on a first turn the build record carries no testRecord, and on a second turn the record on disk still shows the first run with its commit and time
- When the judge session throws after the checks ran, the turn returns the same error as before, the test record holds this run's results with testsPassed from the tests check and the supplied mapping, and the build record is not written
- The validate turn and the completion record leave out the same files

### 1.10 E202610089b4a74dc:S001:T010 — The two records are filed together on every route

Prove, and where needed complete, the folder rule across the routes: a trivial standalone build validated with no implement turn before it whose judge fails and which is validated again a day later; the same with an implement turn first; the first build record written by the completion path; and a standalone validate call on a Story whose definition head is silent about standalone.

**Acceptance checks:**
- A trivial standalone build validated with no implement turn before it, whose judge fails on the first turn and passes on a turn dated a day later, has its BUILD.md and TESTS.md in one folder, and the test record's createdAt does not change
- With an implement turn first, the build record it wrote is the anchor and the test record follows it
- The same holds when the first build record is written by the completion path
- A small standalone build's test record carries the resolved standalone flag before any build record exists
- A standalone validate call on a Story whose definition head is silent about standalone files TESTS.md beside BUILD.md under docs/epics, and the test record carries no standalone flag

### 1.11 E202610089b4a74dc:S001:T011 — The prompts and the guide tell the builder and the judge about the mapping

The implement prompt tells the builder to pass, at the validate turn, the file and title of every case that carries each listed test, and for a live or smoke test it cannot hand to the gate, the result and where the evidence is. The validate prompt tells the judge to check that the cases do exercise what each name says and that a reported result is backed by its evidence. Update the build section of the steering source and docs/daemon.md. The copy of the steering block stamped into this repository's CLAUDE.md is not edited by hand: the updated daemon refreshes it at boot, in the last Task.

**Acceptance checks:**
- The implement prompt tells the builder to pass the cases for each listed test at the validate turn
- The validate prompt's instruction on tests names the cases and the reported results
- The build section of src/prompts/steering-block.md, between its markers, describes the mapping and the test record, and the guide tool's reader returns it
- docs/daemon.md describes the test record, the mapping and 'invalid-test-mapping'
- The stamped copy in CLAUDE.md is not changed by this Task

### 1.12 E202610089b4a74dc:S001:T012 — The live check on the real gate

This Task starts only after the stakeholder has asked for the Story's commits to be pushed; no other Task needs the push. Update the installed daemon to this Story's code and reload the working session's MCP server. Submit Task t1 of Story s7 of the analyzer epic with a mapping converted by hand from that Story's tests.map.json (the array under `t1`, `planTest` renamed to `name`, `mutations` dropped). Replace the hand-made TESTS.md with the gate's and remove tests.map.json once the record holds the mapping. Compare the suites with the baseline. This Task is itself submitted after the update, so the new gate validates it with the live result reported.

**Acceptance checks:**
- The installed daemon runs this Story's code, shown by the build tool's schema returning `tests`, and the stamped steering block in CLAUDE.md carries the new build section
- Task t1 of Story s7 of the analyzer epic, submitted with the converted mapping: the gate runs the three test files, every case is pass, and the tests check passes
- TESTS.md in that Story's folder is the one the gate wrote, the build record there links to it, and tests.map.json is removed
- No test of the mcp and workflow suites or of the VS Code plugin that passed in the baseline fails
- The date and result of the live run are in this Story's build record

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| tap-results.test.ts: the captured run in the Story's tap-sample folder gives the result of each of its titles: pass, fail, skipped for ' # SKIP' with and without a reason, and skipped for ' # TODO' | `t1` |
| tap-results.test.ts: a title nested in a suite or a subtest is found at its depth by its own title | `t1` |
| tap-results.test.ts: TAP's escaping of '#' and backslash in a title is reversed, so the title as declared matches (mutation: compare the raw line) | `t1` |
| tap-results.test.ts: a title that occurs twice fails if either occurrence failed, passes if one passed and none failed, and is skipped if both were skipped | `t1` |
| tap-results.test.ts: output with no TAP version line and no result line is reported as not understood, with no titles | `t1` |
| test-mapping.test.ts: a mapping is refused, with every fault listed, for an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result, and a reported result on a unit, an integration and a contract test and on a test with no level | `t2` |
| test-mapping.test.ts: a correct mapping with cases, with a reported result on a live test, and with both, is accepted | `t2` |
| validation-checks.test.ts: with no mapping, planTaskCheckPlan and smallStandaloneCheckPlan return the same testFiles, unresolvedTests and noTests as before, and namedTests marks each name 'prefix' or 'none' | `t6` |
| validation-checks.test.ts: with a mapping, a name with no prefix is no longer unresolved, its files are in testFiles once, and a name with both a mapping and a prefix uses the mapping (mutation: keep the prefix's files as well) | `t6` |
| validation-checks.test.ts: smallStandaloneCheckPlan with a mapping and no prefixed subject runs the mapped files and is not 'the LLD names no test file'; an unmapped prose subject is listed as not mapped and does not fail | `t6` |
| validation-checks.test.ts: runValidationChecks runs each file in its own process, in order, with the TAP reporter, and returns per file its exit code and titles (mutation: run all files in one command) | `t7` |
| validation-checks.test.ts: a mapped case that passes, one that fails, one that is skipped and one whose title is not in the file get those four results, and the check is not ok when any is fail, skipped or not found (mutations: count not found as pass; count skipped as pass) | `t7` |
| validation-checks.test.ts: a file that exits non-zero while its mapped cases pass fails the check and lists the other failing titles | `t7` |
| validation-checks.test.ts: a file that times out, and a file not started because the time limit was used up, are recorded with that note, their cases are not found, and the check is not ok | `t7` |
| validation-checks.test.ts: a run's whole output is written to a file and its path returned, with nothing cut; when that file cannot be written the results stand and the entry carries a note | `t7` |
| validation-checks.test.ts: a reported pass on a live test runs nothing and leaves the check's result to the other tests; a reported fail makes the check not ok; a Task whose tests are all reported as pass runs no file and passes with the note, while a Task with no file and an unreported name still fails (mutation: fail every run that has no file) | `t7` |
| validation-checks.test.ts: trivialCheckPlan marks each touched file 'touched' and the result lists every title of each file | `t6`, `t7` |
| test-record.test.ts: the first write creates the record with one Task; a second Task is added; writing the first Task again replaces its entry only and keeps createdAt | `t3` |
| test-record.test.ts: the json is TESTS-<epicHash>-<storyId>.json and the document is TESTS.md in the same folder as the Story's BUILD.md, for an Epic's Story and for a standalone one (mutation: derive the folder from the record's own time) | `t3` |
| test-record.test.ts: the document shows totals, then per Task and per named test a table of result, title and file, the tests reported by the builder with their evidence, and the failures outside the named cases | `t3` |
| test-record.test.ts: the stored mapping of a Task is read back as the mapping that was supplied, and an unreadable or misshapen record reads as no stored mapping | `t3` |
| build-record.test.ts: a build record with testRecord renders a line that links to TESTS.md, carries it forward when a later write omits it, and without it renders byte for byte as before | `t5` |
| artifact-kinds.test.ts: with a TESTS record in the artifacts directory, each reader of that directory (the delivery view, for which both its records and its load failures are compared, the pending list, the ownership scan, the question scan, the Epic catalogue, the tracker's resolver, the CLI's workflow service, the amendment staleness scan, both scans of the amendment store, the path walk, the id parser) returns what it returned without it, and none throws | `t4` |
| artifact-kinds.test.ts: approval of a TESTS record by its md path and by its json path through the approval tool's route comes back in skipped[] with a reason that begins 'not-approvable:' and with no code-review outcome, also for a Story whose code review blocks with enforcement on; the TUI service's approve and reject throw NotApprovableError; the batch for its Epic does not stamp it; and the record is unchanged (mutations: put the kind check in the approval tool's route only; make it after the code-review gate) | `t4` |
| migrate-docs-tree.test.ts: converging a forked Story folder that holds BUILD.md and TESTS.md moves both to the same folder and leaves the old folder empty (mutation: leave TESTS out of the migration's kind pattern) | `t4` |
| daemon-gateway.test.ts: the VS Code plugin's workflow chain lists no row for a TESTS record and the same rows as without it (mutation: list every json) | `t4` |
| build-step.test.ts: a validate turn with a wrong mapping returns 'invalid-test-mapping', runs no check, calls no judge and writes neither record | `t8` |
| build-step.test.ts: a validate turn with a mapping writes the test record, the build record links to it, the change log leaves out both records' files, and the verdict's evidence carries the cases with their results and the record's path | `t9` |
| build-step.test.ts: a second validate turn of the same Task with no mapping uses the stored one (mutation: fall back to the prefix rule when a stored mapping exists) | `t8` |
| build-step.test.ts: a stored mapping whose file is gone gives that case not found and a failed check, and the turn is not refused | `t8` |
| build-step.test.ts: when the test record cannot be written the verdict is returned unchanged with a note; on a first turn the build record carries no testRecord, and on a second turn the record on disk still shows the first run with its commit and time (mutation: let the write's error escape) | `t9` |
| build-step.test.ts: the builder's reported results never set testsPassed: a mapping of reported passes with a failing mapped case still fails | `t8` |
| render.test.ts: the implement prompt tells the builder to pass the cases for each listed test at the validate turn, and the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before | `t7`, `t11` |
| build-step.test.ts: the build tool's registered input shape accepts `tests` on the validate phase, refuses an entry or a case with a key the shape does not have, and the schema lookup returns the field | `t8` |
| completion-record.test.ts: completion of a Story whose only dirty files are its BUILD and TESTS records keeps the change log derived from the committed range, and the validate turn and the completion record leave out the same files (mutation: leave the test record's files out of the completion record's list) | `t5`, `t9` |
| build-step.test.ts: when the judge session throws after the checks ran, the turn returns the same error as before, the test record holds this run's results with testsPassed from the tests check and the supplied mapping, and the build record is not written (mutation: write the test record in the build record's write, after the judge) | `t9` |
| build-step.test.ts: a trivial standalone build validated with no implement turn before it, whose judge fails on the first turn and passes on a turn dated a day later, has its BUILD.md and TESTS.md in one folder; with an implement turn first, the BUILD record it wrote is the anchor and the test record follows it; and a small standalone build's test record carries the declared standalone flag before any BUILD record exists and the same when the first BUILD record is written by the completion path (mutation: anchor the BUILD record on its own time when a test record exists) | `t10` |
| build-step.test.ts: a standalone validate call on a Story whose definition head is silent about standalone files TESTS.md beside BUILD.md under docs/epics, and the test record carries no standalone flag (mutation: hand the test record the raw declaration) | `t10` |
| Task t1 of Story s7 of the analyzer epic, whose plan names its tests in prose, is submitted with a mapping converted from docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/tests.map.json: the gate runs the three test files, every case is pass, the tests check passes, and TESTS.md is written by the gate in that Story's folder in place of the hand-made one | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contract details: the validate turn, the check plans, the runner, the build record's write and the judge's evidence`
- **[[c2]]** `prior-artifact` `LLD S001 data model changes: the mapping input, the named tests of a check plan, the results per file and per case, the test record, the kind TESTS and its readers, the build record's link, the prompts`
- **[[c3]]** `prior-artifact` `LLD S001 error paths: error cases, edge cases and the invariants to preserve`
- **[[c4]]** `prior-artifact` `LLD S001 test strategy: the unit, integration and live subjects`
- **[[c5]]** `prior-artifact` `LLD S001 migration: the seven steps from the prefix rule to the test record`
