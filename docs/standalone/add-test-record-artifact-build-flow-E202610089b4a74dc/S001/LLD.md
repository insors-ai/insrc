<!-- insrc:artifact LLD-9b4a74dcdf47852a-S001 -->

# LLD: E202610089b4a74dc:S001

## Summary

**Epic:** `add-test-record-artifact-build-flow`
**HLD base run:** `wf-1791470870888-9gi5o2`
**HLD effective hash:** `9b4a74dcdf47...`

The build validation gate gets a test record for each Story. When a Task is submitted, the builder says which test cases (a test file and a test title) carry each test the plan names. The gate runs those files itself, one at a time, reads a result for every test title, and writes the cases and their results into the record, which is rendered as TESTS.md beside the Story's PLAN and BUILD documents. A Task fails the gate's test step when a named test has no case, when a case did not run, or when a case failed. Plans do not change, and a test name that begins with a file name still works as it does today.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `handleValidate`

```typescript
function handleValidate(input: BuildStepInputValidate): Promise<BuildStepDone | BuildStepError>
```

**Parameters:**
- `input: BuildStepInputValidate` — The validate turn. It gains the optional `tests` field: the mapping from the Task's test names to test cases.

**Returns:** `BuildStepDone | BuildStepError` — The verdict as today. Its evidence for the tests check also carries, per named test, the cases and their results, the path of the test record, and for each file run the path of a file holding that run's whole output.

**Errors:**
- `BuildStepError 'invalid-test-mapping'` when The `tests` input names a test the Task does not have, names the same test twice, gives a case whose file is not a tracked '.test.ts' file inside the repository, gives a case with an empty title, or gives a builder-reported result for a test whose level is not 'live' or 'smoke' (a test with no level included). Nothing is run and nothing is written; the message lists every fault found.

**Preconditions:**
- Unchanged: the repo resolves, no merge is in progress, the target resolves to a Task or a standalone context is given

**Postconditions:**
- When the checks ran, the Story's test record holds this Task's tests, cases and results from this run, replacing what it held for this Task and leaving other Tasks' entries as they were. This holds also when the judge session then fails and the turn ends in an error with no verdict: the record is written before the judge
- A mapping supplied on this turn is stored in the record; a later validate turn of the same Task that supplies none uses the stored one
- The verdict's testsPassed is the gate's result from this run and never the builder's statement

### 2.2 `planTaskCheckPlan`

```typescript
function planTaskCheckPlan(repoPath: string, task: { readonly tests: readonly { readonly level?: string; readonly name: string }[] }, mapping?: readonly TestMappingEntry[]): ValidationCheckPlan
```

**Parameters:**
- `repoPath: string` — The repository, as today.
- `task: { tests: { level?, name }[] }` — The plan Task's named tests.
- `mapping: readonly TestMappingEntry[]` _(optional)_ — The cases for the Task's test names: this turn's input, or else the one stored in the test record.

**Returns:** `ValidationCheckPlan` — The plan as today plus `namedTests`: one entry per test name of the Task, saying where its files come from (the mapping, the name's own file-name prefix, or nothing) and which cases it expects. `testFiles` is the union of the mapped files and the files resolved from prefixes; `unresolvedTests` lists only names that have neither a mapping entry nor a prefix that resolves.

**Preconditions:**
- The mapping, when given, has already passed the validate turn's checks

**Postconditions:**
- With no mapping the returned testFiles and unresolvedTests are exactly today's

### 2.3 `smallStandaloneCheckPlan`

```typescript
function smallStandaloneCheckPlan(repoPath: string, testStrategy: { readonly testLevels: readonly { readonly level?: string; readonly subjects: readonly string[] }[] } | undefined, mapping?: readonly TestMappingEntry[]): ValidationCheckPlan
```

**Parameters:**
- `repoPath: string` — The repository, as today.
- `testStrategy: the LLD's test strategy | undefined` — The subjects of the standalone design's test levels, which are this route's test names.
- `mapping: readonly TestMappingEntry[]` _(optional)_ — Cases for subjects, by the subject's exact text.

**Returns:** `ValidationCheckPlan` — As today plus `namedTests`. A subject that is mapped is run through its cases. A subject with a file-name prefix and no mapping is run as today. A subject with neither is left out, as today, and is listed in the record as not mapped; it does not fail the check.

**Postconditions:**
- With no mapping the returned plan is exactly today's, including 'the LLD names no test file' when no subject has a prefix
- With a mapping and no prefixed subject the plan is not 'no tests': the mapped files are run

### 2.4 `runValidationChecks`

```typescript
function runValidationChecks(repoPath: string, plan: ValidationCheckPlan, deps?: CheckRunnerDeps): Promise<ValidationCheckResults>
```

**Parameters:**
- `repoPath: string` — The repository.
- `plan: ValidationCheckPlan` — The check plan, with its named tests.
- `deps: CheckRunnerDeps` _(optional)_ — The process runner, and the writer of a run's output file; tests supply stand-ins.

**Returns:** `ValidationCheckResults` — `typecheck` as today. `tests` as today plus `files` (one entry per test file run: its exit code, whether it timed out, its duration, the result of every test title it reported, and the path of the file holding its whole output) and `namedTests` (per named test, its cases with a result each of pass, fail, skipped or not found).

**Postconditions:**
- Each test file is run on its own, one after another, with the TAP reporter added to today's command; the time limit of the plan covers all of them together, and a file not started when it runs out is recorded as timed out
- tests.ok is true only when every file run exited with 0, no file timed out, no name is unresolved, every case of every named test has the result pass, and no reported result is 'fail'. A case whose result is skipped does not satisfy its test: it fails the check like a case that failed, and the record shows it as skipped. (A test that can only run with a model or a running daemon is a live or smoke test, whose result the builder reports.) When no file is run at all: a Task whose named tests are all reported by the builder, each as 'pass', passes the check with the note that the gate ran no test and every result was reported by the builder; in every other case with no file the rule is today's (it fails unless the route gave an acceptable reason)
- Never throws, as today

### 2.5 `persistBuildRecord`

```typescript
function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — The repository.
- `rec: BuildRecord` — The build record; its body may now carry `testRecord`: the repo-relative path of the Story's TESTS.md, and nothing else.

**Returns:** `{ md: string; json: string }` — As today.

**Postconditions:**
- A record with `testRecord` renders one line under its tasks that links to TESTS.md; a record without it renders byte for byte as today. The build record holds no results of its own, so it cannot disagree with the test record about a run
- `testRecord` is carried forward by the merge with the prior record when a write does not supply it

### 2.6 `renderCheckEvidence`

```typescript
function renderCheckEvidence(results: ValidationCheckResults): string
```

**Parameters:**
- `results: ValidationCheckResults` — The results of the gate's checks.

**Returns:** `string` — The evidence section of the judge's prompt. For the tests check it now also lists each named test with its cases and results, and each file's own failures outside the named cases.

**Postconditions:**
- With no named tests the section reads as today

## 3. Data model changes

### 3.1 `BuildStepInputValidate` — field-add

Gains `tests?: readonly TestMappingEntry[]`. TestMappingEntry is { name: string; cases?: readonly { file: string; title: string }[]; reported?: { result: 'pass' | 'fail'; evidence: string } }. `name` is the exact text of one of the Task's test names (plan route) or of a subject of the design's test strategy (small standalone route). `file` is repo-relative. `title` is the test's title exactly as the test file declares it; a case matches a test of that title at any depth of nesting in that file. `reported` is for a test the gate cannot run (a live run that needs a model or a human check): the builder states the result and where the evidence is; it is accepted only for a test whose level is exactly 'live' or 'smoke'. Any other level ('unit', 'integration', and 'contract', which a standalone design's test strategy may use) and a test with no level refuse it. It is recorded as reported by the builder and not run by the gate, and is shown to the judge. An entry has cases, or reported, or both. The field is declared in the build tool's registered input shape in src/mcp/server.ts (the shape the tool enforces and the schema lookup tool slices), and the tool's description of the validate phase there says what it is for; src/mcp/build-step/handler.ts only dispatches on the phase and declares no shape. An entry and a case are declared strict: a key the shape does not have is refused by the tool before the turn starts. The trivial standalone route ignores the field, since that route names no tests.

**Call sites:**
- `src/mcp/build-step/types.ts`
- `src/mcp/build-step/phases/validate.ts`
- `src/mcp/server.ts`

### 3.2 `ValidationCheckPlan` — field-add

Gains `namedTests: readonly NamedTestPlan[]`, each { name; level?; source: 'mapping' | 'prefix' | 'touched' | 'none'; cases: { file; title }[]; files: string[]; reported? }. 'mapping' carries its cases. 'prefix' carries the files the name's leading file name resolves to and no cases. 'touched' is the trivial route: one entry per test file the commit touched. 'none' is a name with nothing to run.

**Call sites:**
- `src/mcp/build-step/validation-checks.ts`
- `src/mcp/build-step/phases/validate.ts`

### 3.3 `CheckResult (tests)` — field-add

The tests result gains `files: readonly TestFileRun[]` and `namedTests: readonly NamedTestResult[]`. TestFileRun is { file; command; exitCode; timedOut; durationMs; titles: { title; depth; result: 'pass' | 'fail' | 'skipped' }[]; outputPath }. NamedTestResult is the NamedTestPlan with a `result` on each case ('pass', 'fail', 'skipped', 'not found') and, for a 'prefix' or 'touched' entry, the result of its files. A title that occurs more than once in a file has the result fail if any occurrence failed, else pass if any passed, else skipped. `outputPath` is a file under the system's temporary directory that holds the run's whole standard output and standard error; nothing is cut. The existing `outputTail` stays as the last part of the last file's output, for the judge's prompt. What the runner prints was captured on 2026-10-08 under Node 22.23.2 with `npx tsx --test --test-force-exit --test-reporter=tap` over one file with nested suites, subtests, skipped and todo tests, a duplicated title and a title with '#', a backslash and both kinds of quote; the source and the output are in docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/tap-sample and the parser's test fixtures are pinned to that capture. It shows: one 'ok N - <title>' or 'not ok N - <title>' line per test and per suite; four spaces of indent per depth; ' # SKIP' with an optional reason and ' # TODO' after the title; '#' printed as '\#' and a backslash as '\\', quotes unchanged; a suite or a parent test printed after its children, as 'not ok' when a child failed. A line with a TODO directive counts as skipped. A suite's or parent's own line is a title like any other.

**Call sites:**
- `src/mcp/build-step/validation-checks.ts`
- `src/mcp/build-step/phases/validate.ts`

### 3.4 `TestRecord` — new

A new record per Story, in a new module beside the build record's (src/workflow/runners/build). Its json is `TESTS-<epicHash>-<storyId>.json` in the artifacts directory and its document is `TESTS.md` in the Story's folder, resolved by the same folder derivation the BUILD record uses (storyRecordFolderArgs in src/workflow/storage.ts). That derivation anchors on the persisted BUILD record's createdAt and standalone flag, and the test record is written before the judge, when on a Story's first turn no BUILD record exists yet. So the rule for that case is stated: the validate turn takes one time at its start and resolves the standalone flag once, exactly as its BUILD write resolves it today (the Story's inherited flag, with the caller's declaration counted only when the work item has no definition head at all, since a head that exists and does not say standalone is an answer and a declaration must not relabel it), and gives that time and that resolved flag to both writers, never the raw declaration; the test record persists them as its own createdAt and standalone flag on its first write and keeps them afterwards; and the derivation, when there is no BUILD record, takes a persisted test record's createdAt and flag as the record anchor before it falls back to the caller's own clock; that serves the test record's own path and the code-review writer, which is the derivation's one caller today. The BUILD record's writer does not go through that derivation: its paths come from pathsForMerged in src/workflow/runners/build/standalone-record.ts, on the merged record's own createdAt, and each of its three writers stamps the current time on a first write: the validate turn, ensureBuildRecordOnCompletion, and the implement turn of the trivial standalone route (src/mcp/build-step/phases/implement.ts), which writes the BUILD record before any validate turn. All three go through persistBuildRecord and its merge. On the trivial route the BUILD record therefore normally exists before the first test record and is the anchor; the case with no BUILD record arises there only when validate is called with no implement turn before it, and on the other routes on every first validate turn. So the seeding is put where both writers and buildRecordPathsFor already meet, the merge with the prior record (mergeWithPrior): when there is no prior BUILD record and a test record exists for the Story, the new BUILD record takes its createdAt from the test record, and its standalone flag too when the test record's is true and the write does not state one. A BUILD record first written on a later day after a judge failure, or first written by the completion path, therefore lands in the folder the test record is in. When a BUILD record already exists (every Story built before this change), it stays the anchor and the test record follows it. Shape: meta { workflow: 'tests'; epicHash; storyId; createdAt; updatedAt; standalone? } and body { tasks: { taskId; commit; ranAt; testsPassed; tests: NamedTestResult[]; files: { file; exitCode; timedOut; durationMs; otherFailures: string[] }[] }[] }. `commit` is HEAD when the gate ran and `ranAt` the time. `testsPassed` is the result of the gate's tests check for that run; it is not the verdict, which also needs the judge and the typecheck and is recorded on the build record. The record is written straight after the checks and before the judge session, because the results are facts of the run whatever the judge then says. A Task's entry is replaced when that Task is validated again; other entries are kept. The mapping of a Task is read back from its entry when a later turn supplies none. The document lists, per Task and per named test, a table of result, test title and file, then the tests reported by the builder with their evidence, then any failures in the files outside the named cases, with totals at the top. The record is not an approvable artifact: it has no approval stamps, the approval batch does not list it, and approval or rejection of its path is refused on every route: in skipped[] with a reason that begins 'not-approvable:' from the approval tool, and as a NotApprovableError from the two stamping functions. It carries the `insrc:artifact` id marker like other rendered documents.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/runners/build/completion-record.ts`
- `src/workflow/code-review/subject-paths.ts`
- `src/workflow/storage.ts`
- `src/workflow/path-scheme.ts`
- `src/mcp/build-step/phases/implement.ts`

### 3.5 `ArtifactKind` — field-modify

Gains the member 'TESTS', story-scoped like 'BUILD' and 'CR', so that resolveArtifactMdPath places TESTS.md in the Story's folder. Every reader of the artifacts directory, and every place that lists the kinds, either handles the new kind or leaves it out on purpose, with a test for each. Found by a search of src, vscode-plugin and jetbrains-plugin for files that name the artifacts directory and read a directory. Outside src there are two. The VS Code plugin's workflow chain (workflowChain in vscode-plugin/src/panels/daemon-gateway.ts) lists a row for every json in the directory, with a stage taken from the file name and the status 'pending' unless the json has an approval stamp; a test record would show there for ever as a pending row named by its file name, so workflowChain skips a name with the TESTS prefix, with a test. The JetBrains plugin's reader (WorkflowChainReader.kt) keeps only names that begin with DEF, HLD, LLD or AMD and was checked: it needs no change. The two plugins' review panels take their lists from the daemon's pending list, which leaves the record out. Within src, the indexer and the daemon's entry point match the search but read other directories; the readers of the artifacts directory are: the delivery view (src/workflow/delivery: types, load, graph, stage), which keeps its kinds as they are; its loader today reports a json whose prefix is not one of its kinds as an 'unknown-kind' load failure, so the loader skips a name with the TESTS prefix before that branch, and a test record adds neither a record nor a failure; the pending list (src/workflow/pending.ts), which filters by its own kinds and leaves it out; the ownership scan (src/workflow/locate/ownership.ts), which reads meta and citations of every json and must not fail on a record with no citations; the question scan (src/workflow/questions.ts); the Epic catalogue and the approval batch (src/workflow/gates.ts); the tracker's resolver (src/workflow/tracker/resolve.ts); the CLI's workflow service (src/cli/services/workflow.ts); the amendment staleness scan (src/workflow/amendments/staleness.ts) and the amendment store (src/workflow/amendments/store.ts, which reads the directory twice, for the next amendment id and for an Epic's amendments, each time keeping only names with the AMD prefix); the path walk in src/workflow/path-scheme.ts; and the id parser (src/workflow/resolve-comment.ts), which returns no identity for a TESTS id. The docs-tree migration (src/workflow/migrate-docs-tree.ts) holds its own kind pattern and its own story-scoped list, apart from the path scheme's. It does more than move documents out of the old flat layout: it also converges documents that are already nested, moving a Story's BUILD.md, LLD.md and the rest out of a forked folder. A TESTS.md it does not know would be left behind there, apart from its BUILD.md, and would keep the old folder alive. So TESTS joins the migration's kind pattern and its story-scoped list, and a nested TESTS.md converges with its Story. Approval and rejection are refused for the record by kind, in the two functions every route goes through: approveArtifactByJsonPath and rejectArtifactByJsonPath in src/workflow/gates.ts, which today stamp any json that has a meta. Both throw a new error class, NotApprovableError, declared beside them, whose message begins 'not-approvable:'. The approval tool's single-path route (approveOne inside approveWorkflowTarget) runs the code-review gate before it reaches approveArtifactByJsonPath for any json whose meta has an Epic and a Story, which the test record's has; so approveOne makes the same kind check first, before it reads the meta or runs that gate, and puts the path in skipped[] with the reason 'not-approvable: a test record is not approved or rejected'. No code-review outcome is produced for it. The TUI's service (approve and reject in src/cli/services/workflow.ts) calls the two functions directly and lets NotApprovableError reach its caller, which shows its message as it shows any other failure of those calls. The batch already matches only DEF, HLD, LLD, PLAN and BUILD.

**Call sites:**
- `src/workflow/path-scheme.ts`
- `src/workflow/storage.ts`
- `src/workflow/delivery/types.ts`
- `src/workflow/delivery/load.ts`
- `src/workflow/pending.ts`
- `src/workflow/locate/ownership.ts`
- `src/workflow/questions.ts`
- `src/workflow/gates.ts`
- `src/workflow/tracker/resolve.ts`
- `src/cli/services/workflow.ts`
- `src/workflow/amendments/staleness.ts`
- `src/workflow/amendments/store.ts`
- `src/workflow/resolve-comment.ts`
- `src/workflow/migrate-docs-tree.ts`
- `vscode-plugin/src/panels/daemon-gateway.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReader.kt`

### 3.6 `BuildRecord` — field-add

body gains `testRecord?: { md: string }`, the link to the Story's TESTS.md. It is written by the validate turn's existing write of the build record, after the verdict, whenever a test record exists on disk for the Story. It holds no totals and no results: those are in the test record only, each Task's entry with the commit and time of its own run, so the link stays true when a later run's results could not be written or no verdict was reached. The build record's change log has two writers: the validate turn (src/mcp/build-step/phases/validate.ts) and the completion record (ensureBuildRecordOnCompletion in src/workflow/runners/build/completion-record.ts, run before every BUILD approval), and each lists the workflow's own files to leave out by hand: the build record's json and md and the Story's build-start file. The change-set derivation returns the working tree's files as soon as any is dirty, so a test record left out of either list would become the Story's whole change log at completion. Both writers therefore take the list from one new function beside the build record's paths, which returns the build record's json and md, the test record's json and md, and the build-start file for a Story.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts`
- `src/mcp/build-step/phases/validate.ts`
- `src/workflow/runners/build/completion-record.ts`
- `src/workflow/runners/build/changed-files.ts`

### 3.7 `The implement and validate prompts` — field-modify

The implement prompt (src/mcp/build-step/render.ts) tells the builder that when it submits the Task it must pass `tests`: for each test listed, the file and title of every test case that carries it, and for a live or smoke test it cannot hand to the gate, the result and where the evidence is. The validate prompt's instruction on tests tells the judge to check that the cases listed for each named test do exercise what the name says, and that a reported result is backed by the evidence it points to. The build guide text returned by the guide tool is updated the same way. It is the build section of the steering source, src/prompts/steering-block.md, between the `insrc:guide:build` markers (src/daemon/guide-sections.ts only cuts the sections out and holds no text); the installed daemon stamps the steering block into marked repositories again at boot.

**Call sites:**
- `src/mcp/build-step/render.ts`
- `src/prompts/steering-block.md`

## 4. Error paths

**Error cases**

- **The `tests` input is wrong: a name the Task does not have, a name given twice, a case whose file is not a tracked '.test.ts' file in the repository, an empty title, an entry with neither cases nor a reported result, or a reported result for a test whose level is not 'live' or 'smoke'.** (recoverable)
  - Detection: The validate turn checks the input against the Task's test names (or the design's subjects), against the list of tracked files that the gate already reads from git, and against the level of each named test, before any check is run.
  - Response: The turn returns the error 'invalid-test-mapping' with every fault listed. No check is run, no verdict is made and neither record is written.
  - User impact: The builder sees exactly which entries to correct and submits again.
- **A named test has no mapping entry and its name has no file-name prefix that resolves.** (recoverable)
  - Detection: planTaskCheckPlan finds no entry for the name in the mapping and resolveTaskTestFiles returns it as unresolved.
  - Response: As today the tests check fails. The files that could be resolved are still run. The record lists the test with the source 'none', and the check's note says to pass a `tests` mapping at the validate turn.
  - User impact: The Task fails the gate with a note that names the tests that have no cases.
- **A case's title did not run in its file: the title is misspelt, the test was removed, or the file's run ended before reaching it.** (recoverable)
  - Detection: After the file's run, no result line with that title is found in its TAP output at any depth.
  - Response: The case's result is 'not found' and the tests check fails. The record shows the case as not found, and the file's entry shows its exit code and whether it timed out.
  - User impact: The Task fails with the missing case named. A run cut short shows as not found and is never read as a pass.
- **A case failed.** (recoverable)
  - Detection: The file's TAP output has a 'not ok' line with that title.
  - Response: The case's result is 'fail' and the tests check fails.
  - User impact: The Task fails with the failing case named in the verdict and in the record.
- **A test file exits with a non-zero code although every mapped case in it passed: another test in the file failed, or the file crashed after its tests.** (recoverable)
  - Detection: The exit code of that file's run is not 0.
  - Response: The tests check fails, as it does today for a failing file. The record lists the titles that failed outside the named cases under that file.
  - User impact: The Task fails; the record shows that the failure is in the file but outside the cases named.
- **A test file cannot be started or runs past the time limit, or the limit is used up before a file is started.** (recoverable)
  - Detection: The process runner reports a spawn error or a timeout, as today; a file not yet started when the remaining time is zero is not started.
  - Response: The file is recorded with a note (could not start, timed out, or not run: the time limit was used up), its cases are 'not found', and the tests check fails. The files after it are handled the same way.
  - User impact: The Task fails with the reason on the file.
- **The output of a file's run cannot be read as TAP.** (recoverable)
  - Detection: The parser finds no TAP version line and no result line in the output.
  - Response: The file is recorded with no titles and a note that its output was not understood; its cases are 'not found' and the tests check fails. The whole output is still in the file named by `outputPath`.
  - User impact: The Task fails and the builder can read the raw output.
- **The file holding a run's whole output cannot be written.** (recoverable)
  - Detection: The write to the temporary directory throws.
  - Response: The run's results stand. The file's entry carries no `outputPath` and a note with the reason. Nothing else changes.
  - User impact: The verdict is unaffected; the raw output of that file is not available afterwards.
- **The test record cannot be written, or the stored record cannot be read when a turn supplies no mapping.** (recoverable)
  - Detection: The write or the read throws, or the stored json does not have the record's shape.
  - Response: A write failure is logged and the verdict is returned unchanged, with a note in its evidence that the test record was not written and that the record on disk, if there is one, still shows this Task's earlier run with that run's commit and time. The build record links to the test record only when one exists on disk. An unreadable stored record is treated as no stored mapping, with the same kind of note, and the turn goes on with the prefix rule.
  - User impact: The verdict is never lost or turned into an error by the record; the note says the record is missing or stale.
- **A stored mapping names a file that no longer exists or is no longer tracked.** (recoverable)
  - Detection: The stored mapping is checked against the tracked files like a supplied one.
  - Response: That case is kept and gets the result 'not found'; the tests check fails. The turn is not refused, since the builder supplied nothing wrong on this turn.
  - User impact: The Task fails with the stale case named; the builder submits a corrected mapping.
- **The judge session fails after the checks ran: it passes its deadline, returns nothing usable, or fails outright, and the turn ends in an error with no verdict.** (recoverable)
  - Detection: The validate turn's existing handling of the judge session: the session throws or its answer does not have the verdict's shape, and the turn returns 'verdict-session-timeout', 'unparseable-verdict' or 'verdict-session-failed' before the build record's write.
  - Response: The test record was already written, before the judge: it holds this run's results for the Task, with `testsPassed` from the tests check, and a mapping supplied on this turn is stored. The build record is not written, as today, so it keeps what it had; its link to the test record, if it has one, is still true, since the link carries no results. The error returned is unchanged.
  - User impact: The builder sees the same error as today. The test record shows what the run did, and a second validate turn needs no mapping.
- **A mapped case was skipped by the test runner, for example a test that runs only when an environment variable is set.** (recoverable)
  - Detection: The file's TAP output has that title with a SKIP or TODO directive.
  - Response: The case's result is 'skipped' and the tests check fails: a skipped test proves nothing about what the plan named.
  - User impact: The Task fails with the skipped case named. The builder maps a case that runs, or, for a live or smoke test, reports the result with its evidence.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A validate turn with no `tests` for a Task whose test names all carry a file-name prefix | The same files are run and the same verdict is reached as today. The record is written with one entry per name, source 'prefix', listing the files and every title each reported. |
| A mapping that covers some of the Task's names, while the others carry a prefix | Mapped names are checked case by case; the others are checked by their files' exit codes. A file needed by both is run once. |
| A name that has both a mapping entry and a prefix | The mapping wins; the prefix is not used for that name. |
| Two cases, or two named tests, that point at the same title in the same file | The file is run once and both cases take that title's result. |
| A title that occurs twice in one file | The case fails if any occurrence failed, passes if none failed and at least one passed, and is skipped if all were skipped. |
| A title nested inside a describe block or a subtest | It is matched at any depth by its own title, without the titles of the blocks around it. |
| A title that contains a '#' or a backslash, which the runner escapes as '\\#' and '\\\\', or a quote, which it prints as it is | The parser reverses the two escapes before comparing and leaves quotes alone, so the title as the test file declares it matches. |
| A live or smoke test given with a reported result and no cases | The gate runs nothing for it. The record shows it as reported by the builder with the result and the evidence. A reported 'fail' fails the tests check; a reported 'pass' does not count as a pass run by the gate and is shown apart in the totals. When every named test of the Task is reported as 'pass' and none has cases, no file is run and the check passes with a note saying so; the judge is shown the note and the evidence each result points to. |
| A Task validated a second time with a different mapping | The Task's entry in the record is replaced by the new mapping and results; other Tasks' entries are untouched. |
| A trivial standalone build | `tests` is ignored. The files the commit touched are run one by one and the record lists each file with every title it reported; with no touched test file the check is acceptable as today and the record says no tests were named. |
| A small standalone build whose design has subjects in prose and a mapping for some of them | Mapped subjects are run and recorded. Unmapped prose subjects are listed as not mapped and do not fail the check, as today. |
| The validate turn of the first Task of a Story, when no record exists | The record is created with that Task's entry; the build record written on the same turn links to it. |
| A trivial standalone build (no definition and no design to anchor its folder) validated with no implement turn before it, whose judge session fails on the first validate turn, validated again on a later day | The first turn writes the test record with the turn's time as its createdAt. The second turn's BUILD record is seeded with that time as its createdAt by the merge, so BUILD.md is written in the folder TESTS.md is already in, and the test record's createdAt does not change. The same holds when the first BUILD record is written by the completion path. |
| A validate turn that passes a standalone context for a Story whose definition head exists and does not say standalone | The resolved flag is not standalone, as for the BUILD record today. TESTS.md is filed beside BUILD.md under docs/epics, the test record persists no standalone flag, and nothing is relabelled when a BUILD record is later seeded from it. |

**Invariants to preserve**

- A validate turn that supplies no `tests`, for names that carry a file-name prefix, runs the same files and reaches the same testsPassed as today. [[c1]]
- A named test that resolves to nothing fails the tests check; no test files and no acceptable reason also fails it. [[c1]]
- The verdict is passed only when the judge passed and the gate's own tests check and typecheck passed; the builder's statements never set testsPassed. [[c2]]
- Writing a record is a side effect that never turns a verdict into an error. [[c2]]
- The checks never throw: a spawn failure or a timeout is a failed result with a note. [[c1]]
- A build record with no new field renders byte for byte as it does today, and the change log leaves out the workflow's own files at both of its writers, the validate turn and the completion record. [[c3]]
- Every test process runs in its own process group under a time limit and is forced to exit when its tests finish. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by `npx tsx --test --test-force-exit`; test files in `__tests__` folders beside the source. Every unit and integration subject below begins with the name of the test file it lives in, which is the rule the gate applies today, so the Tasks that carry them can be validated before this Story's change is live. (`render.test.ts` is the name of two tracked files, in the build step and in the artifact companions; today's gate runs both, which is harmless.) The one live subject has no file name and cannot pass today's gate: it belongs to the Story's last Task, which is submitted only after the installed daemon has been updated to this Story's code, so that the new gate validates it, with the live result reported by the builder.`

**Test levels**

- **unit** — The TAP reader and the mapping checks, with no process started.
  - Subjects: `tap-results.test.ts: the captured run in the Story's tap-sample folder gives the result of each of its titles: pass, fail, skipped for ' # SKIP' with and without a reason, and skipped for ' # TODO'`, `tap-results.test.ts: a title nested in a suite or a subtest is found at its depth by its own title`, `tap-results.test.ts: TAP's escaping of '#' and backslash in a title is reversed, so the title as declared matches (mutation: compare the raw line)`, `tap-results.test.ts: a title that occurs twice fails if either occurrence failed, passes if one passed and none failed, and is skipped if both were skipped`, `tap-results.test.ts: output with no TAP version line and no result line is reported as not understood, with no titles`, `test-mapping.test.ts: a mapping is refused, with every fault listed, for an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result, and a reported result on a unit, an integration and a contract test and on a test with no level`, `test-mapping.test.ts: a correct mapping with cases, with a reported result on a live test, and with both, is accepted`
- **integration** — The check plans and the runner over a temporary git repository with small test files, as the gate's existing tests do.
  - Subjects: `validation-checks.test.ts: with no mapping, planTaskCheckPlan and smallStandaloneCheckPlan return the same testFiles, unresolvedTests and noTests as before, and namedTests marks each name 'prefix' or 'none'`, `validation-checks.test.ts: with a mapping, a name with no prefix is no longer unresolved, its files are in testFiles once, and a name with both a mapping and a prefix uses the mapping (mutation: keep the prefix's files as well)`, `validation-checks.test.ts: smallStandaloneCheckPlan with a mapping and no prefixed subject runs the mapped files and is not 'the LLD names no test file'; an unmapped prose subject is listed as not mapped and does not fail`, `validation-checks.test.ts: runValidationChecks runs each file in its own process, in order, with the TAP reporter, and returns per file its exit code and titles (mutation: run all files in one command)`, `validation-checks.test.ts: a mapped case that passes, one that fails, one that is skipped and one whose title is not in the file get those four results, and the check is not ok when any is fail, skipped or not found (mutations: count not found as pass; count skipped as pass)`, `validation-checks.test.ts: a file that exits non-zero while its mapped cases pass fails the check and lists the other failing titles`, `validation-checks.test.ts: a file that times out, and a file not started because the time limit was used up, are recorded with that note, their cases are not found, and the check is not ok`, `validation-checks.test.ts: a run's whole output is written to a file and its path returned, with nothing cut; when that file cannot be written the results stand and the entry carries a note`, `validation-checks.test.ts: a reported pass on a live test runs nothing and leaves the check's result to the other tests; a reported fail makes the check not ok; a Task whose tests are all reported as pass runs no file and passes with the note, while a Task with no file and an unreported name still fails (mutation: fail every run that has no file)`, `validation-checks.test.ts: trivialCheckPlan marks each touched file 'touched' and the result lists every title of each file`
- **integration** — The record: its merge, its paths and its document.
  - Subjects: `test-record.test.ts: the first write creates the record with one Task; a second Task is added; writing the first Task again replaces its entry only and keeps createdAt`, `test-record.test.ts: the json is TESTS-<epicHash>-<storyId>.json and the document is TESTS.md in the same folder as the Story's BUILD.md, for an Epic's Story and for a standalone one (mutation: derive the folder from the record's own time)`, `test-record.test.ts: the document shows totals, then per Task and per named test a table of result, title and file, the tests reported by the builder with their evidence, and the failures outside the named cases`, `test-record.test.ts: the stored mapping of a Task is read back as the mapping that was supplied, and an unreadable or misshapen record reads as no stored mapping`, `build-record.test.ts: a build record with testRecord renders a line that links to TESTS.md, carries it forward when a later write omits it, and without it renders byte for byte as before`, `artifact-kinds.test.ts: with a TESTS record in the artifacts directory, each reader of that directory (the delivery view, for which both its records and its load failures are compared, the pending list, the ownership scan, the question scan, the Epic catalogue, the tracker's resolver, the CLI's workflow service, the amendment staleness scan, both scans of the amendment store, the path walk, the id parser) returns what it returned without it, and none throws`, `artifact-kinds.test.ts: approval of a TESTS record by its md path and by its json path through the approval tool's route comes back in skipped[] with a reason that begins 'not-approvable:' and with no code-review outcome, also for a Story whose code review blocks with enforcement on; the TUI service's approve and reject throw NotApprovableError; the batch for its Epic does not stamp it; and the record is unchanged (mutations: put the kind check in the approval tool's route only; make it after the code-review gate)`, `migrate-docs-tree.test.ts: converging a forked Story folder that holds BUILD.md and TESTS.md moves both to the same folder and leaves the old folder empty (mutation: leave TESTS out of the migration's kind pattern)`, `daemon-gateway.test.ts: the VS Code plugin's workflow chain lists no row for a TESTS record and the same rows as without it (mutation: list every json)`
- **integration** — The validate turn end to end, with the check runner and the judge overridden as the existing tests do.
  - Subjects: `build-step.test.ts: a validate turn with a wrong mapping returns 'invalid-test-mapping', runs no check, calls no judge and writes neither record`, `build-step.test.ts: a validate turn with a mapping writes the test record, the build record links to it, the change log leaves out both records' files, and the verdict's evidence carries the cases with their results and the record's path`, `build-step.test.ts: a second validate turn of the same Task with no mapping uses the stored one (mutation: fall back to the prefix rule when a stored mapping exists)`, `build-step.test.ts: a stored mapping whose file is gone gives that case not found and a failed check, and the turn is not refused`, `build-step.test.ts: when the test record cannot be written the verdict is returned unchanged with a note; on a first turn the build record carries no testRecord, and on a second turn the record on disk still shows the first run with its commit and time (mutation: let the write's error escape)`, `build-step.test.ts: the builder's reported results never set testsPassed: a mapping of reported passes with a failing mapped case still fails`, `render.test.ts: the implement prompt tells the builder to pass the cases for each listed test at the validate turn, and the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before`, `build-step.test.ts: the build tool's registered input shape accepts `tests` on the validate phase, refuses an entry or a case with a key the shape does not have, and the schema lookup returns the field`, `completion-record.test.ts: completion of a Story whose only dirty files are its BUILD and TESTS records keeps the change log derived from the committed range, and the validate turn and the completion record leave out the same files (mutation: leave the test record's files out of the completion record's list)`, `build-step.test.ts: when the judge session throws after the checks ran, the turn returns the same error as before, the test record holds this run's results with testsPassed from the tests check and the supplied mapping, and the build record is not written (mutation: write the test record in the build record's write, after the judge)`, `build-step.test.ts: a trivial standalone build validated with no implement turn before it, whose judge fails on the first turn and passes on a turn dated a day later, has its BUILD.md and TESTS.md in one folder; with an implement turn first, the BUILD record it wrote is the anchor and the test record follows it; and a small standalone build's test record carries the declared standalone flag before any BUILD record exists and the same when the first BUILD record is written by the completion path (mutation: anchor the BUILD record on its own time when a test record exists)`, `build-step.test.ts: a standalone validate call on a Story whose definition head is silent about standalone files TESTS.md beside BUILD.md under docs/epics, and the test record carries no standalone flag (mutation: hand the test record the raw declaration)`
- **live** — The real gate on a real Task, once the daemon runs this Story's code.
  - Subjects: `Task t1 of Story s7 of the analyzer epic, whose plan names its tests in prose, is submitted with a mapping converted from docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/tests.map.json: the gate runs the three test files, every case is pass, the tests check passes, and TESTS.md is written by the gate in that Story's folder in place of the hand-made one`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `build-step.test.ts: a validate turn with a mapping writes the test record, the build record links to it, the change log leaves out both records' files, and the verdict's evidence carries the cases with their results and the record's path`, `validation-checks.test.ts: a mapped case that passes, one that fails, one that is skipped and one whose title is not in the file get those four results, and the check is not ok when any is fail, skipped or not found (mutations: count not found as pass; count skipped as pass)`, `Task t1 of Story s7 of the analyzer epic, whose plan names its tests in prose, is submitted with a mapping converted from docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/tests.map.json: the gate runs the three test files, every case is pass, the tests check passes, and TESTS.md is written by the gate in that Story's folder in place of the hand-made one` |

## 6. Migration

**State before:** The gate finds a Task's tests only through a leading '<file>.test.ts:' in each test name, runs all the files in one command and reads only the exit code (src/mcp/build-step/validation-checks.ts). A name without the prefix fails the tests check. The validate turn takes no statement about tests (src/mcp/build-step/types.ts) and the build record says only whether each Task passed (src/workflow/runners/build/standalone-record.ts). There is no record of which tests ran. Plans written before 7 October 2026, and the plan of Story s7 of the analyzer epic, carry no prefix.

**State after:** The validate turn takes an optional mapping from test names to test cases. The gate takes files from the mapping or, for a name without an entry, from the prefix as before; runs each file on its own; reads a result per test title; and writes a test record per Story (TESTS-<epicHash>-<storyId>.json and TESTS.md beside BUILD.md) that the build record links to. A turn that supplies no mapping for prefixed names behaves as before, with the record written as well.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the TAP reader and the mapping checks as new modules with their unit tests. Nothing calls them yet. — ↩ rollbackable
2. Add 'TESTS' to the kinds of artifact for path resolution, add the test record module (merge, paths, document), and go through every reader that enumerates artifacts so that each handles the new kind or leaves it out, with a test for each. No record is written yet. — ↩ rollbackable
3. Extend the check plans with the optional mapping and with namedTests, keeping the returned files and unresolved names identical when no mapping is given. — ↩ rollbackable
4. Change the runner to run each file on its own with the TAP reporter, write each run's whole output to a file, and return results per file and per named test. From this step the gate's command line for tests differs from before; the exit-code rule is unchanged. — ↩ rollbackable
5. Add `tests` to the validate turn's input and to the build tool's registered input shape and description in src/mcp/server.ts; check it before any check runs; read the stored mapping when none is supplied; write the test record after the checks and before the judge session; add testRecord, a link only, to the build record's existing write; and have the validate turn and the completion record take the workflow's own files to leave out of the change log from one function that includes the test record's. — ↩ rollbackable
6. Update the implement prompt, the judge's evidence and instruction, and the build guide text. — ↩ rollbackable
7. Update the installed daemon and reload the MCP server of the working session, then submit Task t1 of Story s7 of the analyzer epic as the live check. Its mapping is converted by hand from that Story's tests.map.json, whose shape is not the input's: take the array under `t1`, rename each entry's `planTest` to `name`, and drop `mutations`, which the entry shape does not have and the tool would refuse. The hand-made TESTS.md and tests.map.json in that Story's folder are replaced by the gate's record; tests.map.json is removed once the record holds the mapping. This Story's own last Task is submitted after the same update, so that it is validated by the new gate. — ↩ rollbackable

**Backward compat:** The validate turn's new field is optional and the tool's other fields are unchanged, so every existing call is valid. A turn without `tests` for a plan whose names carry the prefix reaches the same testsPassed as before. The build record gains an optional field and renders unchanged without it. The verdict's evidence gains fields and loses none; `outputTail` stays. Build records and plans on disk are not rewritten. A Story built before this change has no test record, and nothing requires one. The VS Code and JetBrains plugins are in this repository and were read: the one reader that a test record would disturb, the VS Code plugin's workflow chain, is changed by this Story. The fork of the IDE (insors-ai/insrc-ide) is a separate repository and was not read, so what it parses of a build record and whether its artifact listing has a fixed list of kinds is not known here. On this side the build record only gains one optional field and the verdict's evidence only gains fields. A note for the IDE repository is added to the daemon guide, and its reader of BUILD records and its artifact listing are checked in that repository before the validate turn's change ships.

## 7. Alternatives considered

### 7.1 a1: A separate test record per Story, written by the gate — **CHOSEN**

A new record (TESTS) beside PLAN and BUILD holds, per Task, each named test, the test cases that carry it and their results; the builder states the mapping at the validate turn and the gate runs the files and writes the results.

The validate turn takes an optional `tests` input: for each test name of the Task, the cases that carry it, each a test file and a test title. The gate takes its test files from that mapping, and from the leading file-name prefix for a name that has one and is not mapped. It runs each file on its own with the TAP reporter, reads a result per test title, and writes a record of its own kind for the Story: a json beside the other artifacts and a TESTS.md in the Story's folder. The record keeps one section per Task, replaced when that Task is validated again, with the commit and time of the run. The tests check fails when a named test has no case, when a case's title did not run in its file, or when a case failed. The BUILD record's document links to the test record.

### 7.2 a2: The test results as a section of the BUILD record

The same mapping input and per-title results, stored in the BUILD record's body and rendered as a Tests section of BUILD.md.

The validate turn takes the same optional `tests` mapping and the gate runs and parses the same way, but the results go into the BUILD record: each entry of body.tasks gains the named tests, their cases and results, and BUILD.md renders them under a Tests heading. No new kind of record and no new path.

**Rejected because:** a2 gives the gate the same ability and the same results but puts them inside the document that is approved at the end of the Story, which grows by a table per Task, and it is not the separate artifact that was asked for.

### 7.3 a3: Keep the prefix rule and make the plan state it

No record: the plan's prompts and schema require every test name to begin with '<file>.test.ts:', and the gate stays as it is.

The plan workflow's test-strategy step asks for the file-name prefix on every test name and its schema or checklist refuses a name without one, so that every new plan meets the gate's rule. The gate, the validate input and the build record do not change. Plans already approved without the prefix are edited by hand and approved again.

**Rejected because:** a3 removes the surprise for new plans but records nothing about which tests ran, still cannot tell whether a named file holds the planned tests, and makes the plan's author name files before the tests exist.

## 8. References

- **[[c1]]** `step-output` `s1.analyzeBundles[0]: How the validation gate finds and runs a Task's tests` — "src/mcp/build-step/validation-checks.ts"
- **[[c2]]** `step-output` `s1.analyzeBundles[1]: The one production caller of the check plans and what it does with the results` — "src/mcp/build-step/phases/validate.ts"
- **[[c3]]** `step-output` `s1.analyzeBundles[2]: The validate turn's input, the build record, and the plan's test names` — "src/workflow/runners/build/standalone-record.ts"
- **[[c4]]** `step-output` `s1.analyzeBundles[3]: Where the file-name prefix is asked for, and what the test runner prints` — "src/mcp/build-step/render.ts"
- **[[c5]]** `step-output` `s1.analyzeBundles[4]: Existing tests of the gate and of the build record` — "src/mcp/build-step/__tests__/validation-checks.test.ts"
- **[[c6]]** `stakeholder` `Stakeholder request of 2026-10-08: a new artifact that lists the tests with their execution status, integrated with the flow so that the gate can use it`

## 9. Open questions

- A mapped test case that the test runner reports as skipped (for example a test that runs only when an environment variable is set): does it satisfy the named test? The design as written lets it pass the check. The alternative is that a skipped case fails the check unless the named test's level is live, where the builder reports the result instead. Recommended: a skipped case does not satisfy a unit or integration test.
- A live or smoke test that the gate cannot run (it needs a model, a running daemon or a person): the design accepts a result reported by the builder, with where the evidence is, records it as reported and not run by the gate, and shows it to the judge. The alternative is that such a test always fails the gate's test step. Recommended: accept the reported result, shown apart from the results the gate produced.
- The Story came from triage with no acceptance criteria, so the alternatives could not be scored against any and the acceptance mapping has one entry (ac1) that stands for the request itself. Is the request as stated in the Story the acceptance criterion?
- The fork of the IDE (insors-ai/insrc-ide, a separate repository) was not read for this design; the two plugins in this repository were. Before the validate turn's change ships, the fork's reader of BUILD records and its artifact listing should be checked for a strict shape or a fixed list of kinds. Who makes that check, and does it hold the Story's last Task?

## Resolved questions

- `qbb3f9575` — A mapped test case that the test runner reports as skipped (for example a test that runs only when an environment variable is set): does it satisfy the named test? The design as written lets it pass the check. The alternative is that a skipped case fails the check unless the named test's level is live, where the builder reports the result instead. Recommended: a skipped case does not satisfy a unit or integration test.
  - **resolved**: A skipped case fails a unit or integration test — Stakeholder took the recommendation on 2026-10-08: a skipped test proves nothing, and a pass that is green because it was skipped is the hollow pass this record exists to expose. The design's rule for the tests check and its tests were changed to match. _(2026-10-08T17:03:46.877Z)_
- `qdf77614f` — A live or smoke test that the gate cannot run (it needs a model, a running daemon or a person): the design accepts a result reported by the builder, with where the evidence is, records it as reported and not run by the gate, and shows it to the judge. The alternative is that such a test always fails the gate's test step. Recommended: accept the reported result, shown apart from the results the gate produced.
  - **resolved**: Accept the builder's reported result — Stakeholder took the recommendation on 2026-10-08: for a live or smoke test the gate cannot run, the builder reports the result and where the evidence is; it is recorded as reported by the builder and not run by the gate, shown apart from the results the gate produced, and shown to the judge. The design already says this; nothing in it changes. _(2026-10-08T17:05:43.787Z)_
- `q2791d48e` — The Story came from triage with no acceptance criteria, so the alternatives could not be scored against any and the acceptance mapping has one entry (ac1) that stands for the request itself. Is the request as stated in the Story the acceptance criterion?
  - **resolved**: Yes, the request as stated is the criterion — Stakeholder confirmed on 2026-10-08: the request as stated in the Story (a test record that lists each test with its execution status, integrated with the flow so that the gate uses it) is the acceptance criterion that ac1 stands for. _(2026-10-08T17:08:00.865Z)_

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[0]: How the validation gate finds and runs a Task's tests` — "src/mcp/build-step/validation-checks.ts"
- **[[c2]]** `step-output` `s1.analyzeBundles[1]: The one production caller of the check plans and what it does with the results` — "src/mcp/build-step/phases/validate.ts"
- **[[c3]]** `step-output` `s1.analyzeBundles[2]: The validate turn's input, the build record, and the plan's test names` — "src/workflow/runners/build/standalone-record.ts"
- **[[c4]]** `step-output` `s1.analyzeBundles[3]: Where the file-name prefix is asked for, and what the test runner prints` — "src/mcp/build-step/render.ts"
- **[[c5]]** `step-output` `s1.analyzeBundles[4]: Existing tests of the gate and of the build record` — "src/mcp/build-step/__tests__/validation-checks.test.ts"
- **[[c6]]** `stakeholder` `Stakeholder request of 2026-10-08: a new artifact that lists the tests with their execution status, integrated with the flow so that the gate can use it`
