<!-- insrc:artifact TESTS-9b4a74dcdf47852a-S001 -->

# Tests: 9b4a74dcdf47852a S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## S001

Run at 2026-10-08T18:45:46.904Z on commit `f1972e70`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: tap-results.test.ts: the captured run in the Story's tap-sample folder gives the result of each of its titles: pass, fail, skipped for ' # SKIP' with and without a reason, and skipped for ' # TODO'**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/tap-results.test.ts` | 5 |

**unit: tap-results.test.ts: a title nested in a suite or a subtest is found at its depth by its own title**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/tap-results.test.ts` | 5 |

**unit: tap-results.test.ts: TAP's escaping of '#' and backslash in a title is reversed, so the title as declared matches (mutation: compare the raw line)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/tap-results.test.ts` | 5 |

**unit: tap-results.test.ts: a title that occurs twice fails if either occurrence failed, passes if one passed and none failed, and is skipped if both were skipped**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/tap-results.test.ts` | 5 |

**unit: tap-results.test.ts: output with no TAP version line and no result line is reported as not understood, with no titles**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/tap-results.test.ts` | 5 |

**unit: test-mapping.test.ts: a mapping is refused, with every fault listed, for an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result, and a reported result on a unit, an integration and a contract test and on a test with no level**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/test-mapping.test.ts` | 2 |

**unit: test-mapping.test.ts: a correct mapping with cases, with a reported result on a live test, and with both, is accepted**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/test-mapping.test.ts` | 2 |

**integration: validation-checks.test.ts: with no mapping, planTaskCheckPlan and smallStandaloneCheckPlan return the same testFiles, unresolvedTests and noTests as before, and namedTests marks each name 'prefix' or 'none'**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: with a mapping, a name with no prefix is no longer unresolved, its files are in testFiles once, and a name with both a mapping and a prefix uses the mapping (mutation: keep the prefix's files as well)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: smallStandaloneCheckPlan with a mapping and no prefixed subject runs the mapped files and is not 'the LLD names no test file'; an unmapped prose subject is listed as not mapped and does not fail**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: runValidationChecks runs each file in its own process, in order, with the TAP reporter, and returns per file its exit code and titles (mutation: run all files in one command)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: a mapped case that passes, one that fails, one that is skipped and one whose title is not in the file get those four results, and the check is not ok when any is fail, skipped or not found (mutations: count not found as pass; count skipped as pass)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: a file that exits non-zero while its mapped cases pass fails the check and lists the other failing titles**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: a file that times out, and a file not started because the time limit was used up, are recorded with that note, their cases are not found, and the check is not ok**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: a run's whole output is written to a file and its path returned, with nothing cut; when that file cannot be written the results stand and the entry carries a note**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: a reported pass on a live test runs nothing and leaves the check's result to the other tests; a reported fail makes the check not ok; a Task whose tests are all reported as pass runs no file and passes with the note, while a Task with no file and an unreported name still fails (mutation: fail every run that has no file)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: validation-checks.test.ts: trivialCheckPlan marks each touched file 'touched' and the result lists every title of each file**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/validation-checks.test.ts` | 19 |

**integration: test-record.test.ts: the first write creates the record with one Task; a second Task is added; writing the first Task again replaces its entry only and keeps createdAt**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/runners/build/__tests__/test-record.test.ts` | 4 |

**integration: test-record.test.ts: the json is TESTS-<epicHash>-<storyId>.json and the document is TESTS.md in the same folder as the Story's BUILD.md, for an Epic's Story and for a standalone one (mutation: derive the folder from the record's own time)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/runners/build/__tests__/test-record.test.ts` | 4 |

**integration: test-record.test.ts: the document shows totals, then per Task and per named test a table of result, title and file, the tests reported by the builder with their evidence, and the failures outside the named cases**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/runners/build/__tests__/test-record.test.ts` | 4 |

**integration: test-record.test.ts: the stored mapping of a Task is read back as the mapping that was supplied, and an unreadable or misshapen record reads as no stored mapping**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/runners/build/__tests__/test-record.test.ts` | 4 |

**integration: build-record.test.ts: a build record with testRecord renders a line that links to TESTS.md, carries it forward when a later write omits it, and without it renders byte for byte as before**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/runners/build/__tests__/build-record.test.ts` | 42 |

**integration: artifact-kinds.test.ts: with a TESTS record in the artifacts directory, each reader of that directory (the delivery view, for which both its records and its load failures are compared, the pending list, the ownership scan, the question scan, the Epic catalogue, the tracker's resolver, the CLI's workflow service, the amendment staleness scan, both scans of the amendment store, the path walk, the id parser) returns what it returned without it, and none throws**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/__tests__/artifact-kinds.test.ts` | 2 |

**integration: artifact-kinds.test.ts: approval of a TESTS record by its md path and by its json path through the approval tool's route comes back in skipped[] with a reason that begins 'not-approvable:' and with no code-review outcome, also for a Story whose code review blocks with enforcement on; the TUI service's approve and reject throw NotApprovableError; the batch for its Epic does not stamp it; and the record is unchanged (mutations: put the kind check in the approval tool's route only; make it after the code-review gate)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/__tests__/artifact-kinds.test.ts` | 2 |

**integration: migrate-docs-tree.test.ts: converging a forked Story folder that holds BUILD.md and TESTS.md moves both to the same folder and leaves the old folder empty (mutation: leave TESTS out of the migration's kind pattern)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/__tests__/migrate-docs-tree.test.ts` | 27 |

**integration: daemon-gateway.test.ts: the VS Code plugin's workflow chain lists no row for a TESTS record and the same rows as without it (mutation: list every json)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` | 9 |

**integration: build-step.test.ts: a validate turn with a wrong mapping returns 'invalid-test-mapping', runs no check, calls no judge and writes neither record**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: build-step.test.ts: a validate turn with a mapping writes the test record, the build record links to it, the change log leaves out both records' files, and the verdict's evidence carries the cases with their results and the record's path**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: build-step.test.ts: a second validate turn of the same Task with no mapping uses the stored one (mutation: fall back to the prefix rule when a stored mapping exists)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: build-step.test.ts: a stored mapping whose file is gone gives that case not found and a failed check, and the turn is not refused**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: build-step.test.ts: when the test record cannot be written the verdict is returned unchanged with a note; on a first turn the build record carries no testRecord, and on a second turn the record on disk still shows the first run with its commit and time (mutation: let the write's error escape)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: build-step.test.ts: the builder's reported results never set testsPassed: a mapping of reported passes with a failing mapped case still fails**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: render.test.ts: the implement prompt tells the builder to pass the cases for each listed test at the validate turn, and the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/render.test.ts` | 5 |
| pass | `src/workflow/artifacts/companion/__tests__/render.test.ts` | 3 |

**integration: build-step.test.ts: the build tool's registered input shape accepts `tests` on the validate phase, refuses an entry or a case with a key the shape does not have, and the schema lookup returns the field**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: completion-record.test.ts: completion of a Story whose only dirty files are its BUILD and TESTS records keeps the change log derived from the committed range, and the validate turn and the completion record leave out the same files (mutation: leave the test record's files out of the completion record's list)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/workflow/runners/build/__tests__/completion-record.test.ts` | 11 |

**integration: build-step.test.ts: when the judge session throws after the checks ran, the turn returns the same error as before, the test record holds this run's results with testsPassed from the tests check and the supplied mapping, and the build record is not written (mutation: write the test record in the build record's write, after the judge)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: build-step.test.ts: a trivial standalone build validated with no implement turn before it, whose judge fails on the first turn and passes on a turn dated a day later, has its BUILD.md and TESTS.md in one folder; with an implement turn first, the BUILD record it wrote is the anchor and the test record follows it; and a small standalone build's test record carries the declared standalone flag before any BUILD record exists and the same when the first BUILD record is written by the completion path (mutation: anchor the BUILD record on its own time when a test record exists)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**integration: build-step.test.ts: a standalone validate call on a Story whose definition head is silent about standalone files TESTS.md beside BUILD.md under docs/epics, and the test record carries no standalone flag (mutation: hand the test record the raw declaration)**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/mcp/build-step/__tests__/build-step.test.ts` | 57 |

**live: Task t1 of Story s7 of the analyzer epic, whose plan names its tests in prose, is submitted with a mapping converted from docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/tests.map.json: the gate runs the three test files, every case is pass, the tests check passes, and TESTS.md is written by the gate in that Story's folder in place of the hand-made one**

Reported by the builder, not run by the gate: **pass**. Evidence: Run of 2026-10-08T18:44:10Z through the installed daemon at be6abc9c. The gate's own record is .insrc/artifacts/TESTS-b9d5c5c40df5a574-s7.json and docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/TESTS.md: Task t1, three files run on their own, 12 cases pass, tests check passed; BUILD-b9d5c5c40df5a574-s7.json records t1 passed true and links to TESTS.md. Committed in f1972e70, which also removes tests.map.json.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/build-step/__tests__/build-step.test.ts` | 0 | 57 | 7.6 s |  |
| `src/mcp/build-step/__tests__/render.test.ts` | 0 | 5 | 0.7 s |  |
| `src/mcp/build-step/__tests__/tap-results.test.ts` | 0 | 5 | 0.4 s |  |
| `src/mcp/build-step/__tests__/test-mapping.test.ts` | 0 | 2 | 0.4 s |  |
| `src/mcp/build-step/__tests__/validation-checks.test.ts` | 0 | 19 | 6.5 s |  |
| `src/workflow/__tests__/artifact-kinds.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/__tests__/migrate-docs-tree.test.ts` | 0 | 27 | 3.6 s |  |
| `src/workflow/artifacts/companion/__tests__/render.test.ts` | 0 | 3 | 0.6 s |  |
| `src/workflow/runners/build/__tests__/build-record.test.ts` | 0 | 42 | 1 s |  |
| `src/workflow/runners/build/__tests__/completion-record.test.ts` | 0 | 11 | 0.7 s |  |
| `src/workflow/runners/build/__tests__/test-record.test.ts` | 0 | 4 | 0.6 s |  |
| `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` | 0 | 9 | 0.4 s |  |
