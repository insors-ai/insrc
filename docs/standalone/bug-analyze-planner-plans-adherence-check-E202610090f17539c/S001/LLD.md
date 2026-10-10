<!-- insrc:artifact LLD-0f17539c98aa78ee-S001 -->

# LLD: E202610100f17539c:S001

## Summary

**Epic:** `bug-analyze-planner-plans-adherence-check`
**HLD base run:** `wf-1791614468378-usou2x`
**HLD effective hash:** `608412609e92...`

An adherence check (code, data or infra) that is given no constraints now finds them itself: it looks up, in the repository's documents, the constraints on a topic the planner names, and judges against those. The lookup is done once per topic in a run and kept as a file in the run's directory, so several checks on one topic judge against the same list and a reader can open it. A plan whose adherence task names neither a topic nor a list of constraints is refused at validation, and the route through an upstream task is removed: it could not work in a code, data or infra plan, and where it did work (a generic plan that holds the docs task, or beside an override) the stakeholder chose on 2026-10-10 to remove it all the same, so that there is one way to look constraints up.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `runAdherenceCheck`

```typescript
runAdherenceCheck(args: AdherenceRunArgs): Promise<AdherenceResult>
```

**Parameters:**
- `args: AdherenceRunArgs` — Unchanged: the task's execute arguments, the subject key and label, the template id, the prompt path and the excerpt reader. The task's params may now carry constraintTopic and maxConstraintSources, and no longer carry constraintsSource.

**Returns:** `AdherenceResult` — As today, plus `constraints` (the list the model judged against, each with its citation fields) and `constraintSource` (where the list came from: the documents on a topic, with the number of sections retrieved and the path of the enumeration's record; the inline list; or stored-document ids). `completeness` now also carries everything the enumeration left out: its reached limits, its partly read items and its skipped items (a search by meaning that did not run, a section no longer in the index).

**Errors:**
- `Error ('<template>: the constraints on "<topic>" could not be enumerated from the documents of <repo>: <cause>')` when The topic route was taken and runSharedDocConstraintEnumerate threw (the model that reads the retrieved sections could not be called, or the store could not be read). Nothing is judged.
- `Error ('<template>: the documents of <repo> state no constraint on "<topic>" (<n> sections were retrieved and read)')` when The topic route was taken and the enumeration finished with no constraint. When no section matched the topic the bracket says so instead.
- `Error ('<template>: params.constraints holds no usable constraint' / '<template>: none of the <n> ids in params.constraintIds names a summarised document with a constraint')` when An override was given and yields no constraint. The topic is not tried in its place: an override that is given is used alone.
- `Error ('<template>: the model call that judges adherence failed: ...')` when Unchanged: the judging call failed after the constraints and excerpts were gathered.

**Preconditions:**
- The task's params passed plan validation, so one of constraintTopic, constraints or constraintIds is present; the function checks again and throws naming the three when called with none (a task built outside the planner).

**Postconditions:**
- A result is returned only when at least one constraint was judged against.
- result.constraints is exactly the list rendered into the judging prompt.
- result.diagnostics.constraintCount equals result.constraints.length.

### 2.2 `resolveConstraints`

```typescript
resolveConstraints(args: TemplateExecuteArgs, params: Record<string, unknown>, facts: ConstraintSourceFacts, repoPath: string): Promise<ResolvedConstraints>
```

**Parameters:**
- `args: TemplateExecuteArgs` — The task being run; gives the run id, the task id, the intent's scope and the template.
- `params: Record<string, unknown>` — The task's params. Read in this order: constraints (inline), constraintIds, constraintTopic. constraintsSource is no longer read.
- `facts: ConstraintSourceFacts` — Where the function records what its source left out. Today it holds reached limits and partly read items; it gains skipped items, and the check's completeness record is built with all three. On the topic route the enumeration's own completeness (limited, partly read and skipped) is added to it.
- `repoPath: string` — The repository the check reads, resolved once by runAdherenceCheck through adherenceRepoPath before the constraints are resolved. The ids route and the topic route both use it; neither resolves the scope again.

**Returns:** `ResolvedConstraints` — { constraints: ConstraintInput[]; source: ConstraintSource }. It used to return the bare list. args.upstreamOutputs is not read any more. The test seam _resolveConstraintsForTest returns the same new shape, and the tests that read its result as a bare list are updated to read `.constraints`.

**Errors:**
- `Error` when As listed for runAdherenceCheck: a failed enumeration, an enumeration with no constraint, an override that yields nothing, or none of the three parameters.

**Postconditions:**
- On the topic route, the enumeration used is the one stored for the run, the repository and the topic if there is one; otherwise one enumeration is made and stored before the function returns.

### 2.3 `runSharedDocConstraintEnumerate`

```typescript
runSharedDocConstraintEnumerate(args: RunDocConstraintEnumerateArgs): Promise<DocConstraintEnumerateOutput>
```

**Parameters:**
- `args: RunDocConstraintEnumerateArgs` — Consumed as it is, not changed. The check passes subject = the topic, repoPath = the repository the check reads, db, maxSources when the task gives maxConstraintSources, runId, and no area.

**Returns:** `DocConstraintEnumerateOutput` — Unchanged: the constraints with their citations, the number of sections retrieved, a note when nothing was found, and the lookup's completeness.

**Errors:**
- `LookupFailedError` when Unchanged: the model call that reads the retrieved sections failed. The check turns it into its 'could not be enumerated' failure and keeps it as the cause.

### 2.4 `validatePlan`

```typescript
validatePlan(plan: PlanTask, catalog: readonly AnalyzeTaskTemplate[], opts?: ValidateOpts): PlanValidationFailure | null
```

**Parameters:**
- `plan: PlanTask` — Unchanged.
- `catalog: readonly AnalyzeTaskTemplate[]` — Unchanged.
- `opts: ValidateOpts` _(optional)_ — Unchanged.

**Returns:** `PlanValidationFailure | null` — Unchanged in shape. Under rule INV-5 a task of a template that declares a constraintTopic parameter, with no non-empty constraintTopic, no non-empty constraints list and no non-empty constraintIds list, now fails with a message that names the task and the template, says that an adherence check needs constraints to check against, names the three ways to give them, and says the task may be left out. The check runs before the schema's own error, beside the scope-kind check. The planner's corrective retry is also sent a fix hint per invariant (src/analyze/planner/invariant-fix-hints.ts, appended by the planner's driver after the message); the INV-5 hint today says to fix only the offending property and not to touch other tasks, which contradicts leaving a task out. The INV-5 hint gains a remedy for an adherence task with no source of constraints: give constraintTopic, an inline list or stored-document ids; or remove the task and renumber the task ids that follow, so that they stay in order.

**Postconditions:**
- A plan that passes holds no adherence task without a source of constraints.
- A task that still carries constraintsSource fails INV-5 with the validator's own message, which says to give constraintTopic instead; this includes a generic plan that holds the docs task.

## 3. Data model changes

### 3.1 `The adherence templates' inputSchema (code.adherence.check, data.adherence.check, infra.adherence.check)` — field-modify

Add `constraintTopic` (string, at least one character): the subject to look up in the repository's documents for the rules this check judges against, in words a reader of the documents would use (for example 'build and test rules for CI workflows'), not a file path. Add `maxConstraintSources` (integer, 1 to 30, optional): how many document sections the lookup reads, passed to the enumeration as maxSources. Remove `constraintsSource`. `constraints` and `constraintIds` keep their types, with no minimum length, so an empty list still passes the schema. Their own descriptions are rewritten too: in the code template they name the removed route today ('used when the plan does not have an upstream docs.constraint.enumerate task', 'used when constraintsSource + constraints are both absent'), and the catalog prints every description to the planner; the new ones state the order inline list, stored-document ids, topic. One deliberate change at run time: an empty inline list now counts as not given. Today resolveConstraints takes any array as the inline route, so an empty inline list beside usable ids yields nothing and the check fails; after the change the inline route is taken only for a list with at least one item, and the ids or the topic are used. Add to the schema `anyOf: [{ required: ['constraintTopic'] }, { required: ['constraints'] }, { required: ['constraintIds'] }]` so the catalog the planner reads states the rule. The schema alone would accept an empty list as a source; the validator's own check is what requires one source that is not empty. Each template's description is rewritten to name only the ways that work: give a topic and the check finds the constraints in the documents; or give the constraints inline; or give ids of summarised documents. The revision of the three templates goes from 'r1' to 'r2'.

```
+ constraintTopic: { type: 'string', minLength: 1, description }
+ maxConstraintSources: { type: 'integer', minimum: 1, maximum: 30 }
- constraintsSource: { type: 'string' }
+ anyOf: [ { required: ['constraintTopic'] }, { required: ['constraints'] }, { required: ['constraintIds'] } ]
~ revision: 'r1' -> 'r2'
```

**Call sites:**
- `src/analyze/planner/templates/code/index.ts`
- `src/analyze/planner/templates/data/index.ts`
- `src/analyze/planner/templates/infra/index.ts`
- `src/analyze/planner/validate.ts`
- `src/analyze/planner/render-catalog.ts`

### 3.2 `AdherenceResult and the 'adherence-report' output` — field-add

AdherenceResult gains `constraints: readonly ConstraintInput[]` and `constraintSource: ConstraintSource`, where ConstraintSource is { kind: 'documents'; topic: string; repoPath: string; retrievedSectionCount: number; record?: string } | { kind: 'inline' } | { kind: 'stored-documents'; ids: readonly string[] }. `record` is the path of the enumeration's record file, absent when it could not be written. The three family runtimes copy both fields into the adherence-report beside matches, drifts, missingImpl, contradictions and diagnostics. The templates' outputSchema lists them as optional properties; nothing that reads the report today requires their absence.

```
AdherenceResult
+ constraints: readonly ConstraintInput[]
+ constraintSource: ConstraintSource
adherence-report
+ constraints
+ constraintSource
```

**Call sites:**
- `src/analyze/runtimes/shared/adherence.ts`
- `src/analyze/runtimes/code/adherence-check.ts`
- `src/analyze/runtimes/data/adherence-check.ts`
- `src/analyze/runtimes/infra/adherence-check.ts`

### 3.3 `The enumeration record (new file in a run's directory)` — new

One file per run, repository and topic: ~/.insrc/analyze/<runId>/constraints/<key>.json, where key is the first 16 hex characters of the SHA-256 of the repository path, the normalised topic (trimmed, inner whitespace collapsed to one space, lower-cased) and maxSources (empty when not given), joined by a NUL character. Content: { schemaVersion: 1, repoPath, topic (as the first task wrote it), maxSources (or null), enumeratedAt (ISO time), enumeratedByTask (the task id that made it), output: DocConstraintEnumerateOutput }. It is written atomically (a temporary file, then a rename), only after the enumeration finished, with or without constraints; a failed enumeration writes nothing. It is read by a new function in a new module beside the check, src/analyze/runtimes/shared/adherence-topic-constraints.ts (its tests in a new file, __tests__/adherence-topic-constraints.test.ts; the existing __tests__/adherence-constraints.test.ts keeps testing resolveConstraints of adherence.ts): constraintsForTopic({ runId, taskId, repoPath, topic, maxSources, db }) returns { output, record } from the file when it is present and parses to schemaVersion 1 with the same repository and normalised topic, and otherwise calls runSharedDocConstraintEnumerate, writes the file and returns. A file that cannot be read or parsed is treated as absent and is overwritten. A file that cannot be written does not fail the check: the enumeration in hand is used and `record` is left out. The path comes from a new entry of PATHS in src/shared/paths.ts (analyzeConstraintRecord(runId, key)). A child plan runs under its parent's run id, so the record is shared by the whole plan tree. The records live under the run's directory and go when the directory is removed; a helper purgeConstraintRecords(runId) removes them for tests.

**Call sites:**
- `src/shared/paths.ts`
- `src/analyze/runtimes/shared/adherence.ts`

### 3.4 `Which documents the topic route reads` — invariant-change

The documents read are those of the repository the check already reads: adherenceRepoPath, which is graphRepoOf of the check's own resolved scope. For a manifest-dir scope that is the registered repository that contains the directory; for a connection scope it is the one repository that declares the connection; for the other kinds it is the repository that contains the scope. The enumeration is given no area: a code check scoped to one file or one module directory still reads the whole repository's documents, because the rules for a piece of code are written in the repository's documents and not beside the code. This is why the record is keyed by repository and topic, and not by the check's area. The scope is resolved for the check's own family, as today, so no kind of scope is refused that was accepted before, and the docs family's narrower list of kinds does not apply.

**Call sites:**
- `src/analyze/runtimes/shared/adherence.ts`
- `src/analyze/runtimes/shared/task-scope.ts`
- `src/analyze/context/scope.ts`

## 4. Error paths

**Error cases**

- **A plan holds an adherence task with no topic, no inline constraints and no stored-document ids (the live defect).** (recoverable)
  - Detection: validatePlan, in the INV-5 loop, finds that the task's template declares a constraintTopic parameter and that params has no non-empty string constraintTopic, no constraints array with an item and no constraintIds array with an item.
  - Response: Returns an INV-5 failure whose message names the task and template, says an adherence check needs constraints to check against, names the three ways to give them and says the task may be left out. The planner's corrective retry receives it.
  - User impact: The plan is corrected before it runs; no task fails for lack of constraints.
- **A plan gives an adherence task the removed parameter constraintsSource.** (recoverable)
  - Detection: The validator's own check, in the INV-5 loop before the schema's error: the task's template declares constraintTopic and the task's params carry constraintsSource. (Without that check ajv would refuse it too, as an unknown parameter, in words less useful to the planner.)
  - Response: INV-5 failure whose message names the task and template, says constraintsSource is no longer accepted, and says to give constraintTopic (the check then finds the constraints in the documents itself) or an inline list or stored-document ids. The planner's retry receives it. This holds for every plan, a generic plan that holds the docs task included.
  - User impact: The planner drops the parameter; the catalog no longer shows it.
- **The enumeration cannot be made: the model that reads the retrieved sections cannot be called, or the store read throws.** (recoverable)
  - Detection: runSharedDocConstraintEnumerate throws (LookupFailedError for the model call; any other error for the store). constraintsForTopic lets it through and writes no record.
  - Response: resolveConstraints throws '<template>: the constraints on "<topic>" could not be enumerated from the documents of <repo>: <cause>', with the original error as its cause. The plan walk records the task as failed with that reason. The next check on the same topic tries the enumeration again.
  - User impact: The answer names the check as failed and says the constraints could not be looked up, distinct from a failed judging.
- **The documents state no constraint on the topic.** (terminal)
  - Detection: The enumeration returns with an empty constraints list (either no section matched, retrievedSectionCount 0, or sections were read and none stated a constraint).
  - Response: The record is written (the enumeration finished). resolveConstraints throws '<template>: the documents of <repo> state no constraint on "<topic>"', followed by '(no section of the documents matches the topic)' or '(<n> sections were retrieved and read)'. The task is recorded as failed.
  - User impact: The answer says the check did not run because the documents hold no rule on that topic; it is not shown as a passed check.
- **An override is given and yields no constraint: an inline list whose items have no constraint text, or ids none of which names a summarised document with a constraint.** (terminal)
  - Detection: normaliseConstraints or hydrateFromConstraintIds returns an empty list for a parameter that was present with at least one item.
  - Response: resolveConstraints throws naming the override ('params.constraints holds no usable constraint' or 'none of the <n> ids in params.constraintIds names a summarised document with a constraint'). The topic is not tried even when it is also given.
  - User impact: The failed task's reason says which override was empty.
- **The judging model call fails after the constraints were found.** (recoverable)
  - Detection: provider.completeStructured throws inside runAdherenceCheck, as today.
  - Response: Unchanged: throws '<template>: the model call that judges adherence failed: ...' with the counts of constraints and excerpts gathered. The enumeration's record stays, so a retry does not enumerate again.
  - User impact: The reason says the judging failed, not the lookup.
- **The enumeration's record cannot be written (disk full, permissions).** (recoverable)
  - Detection: The write or the rename in constraintsForTopic throws.
  - Response: Logged as a warning; the enumeration in hand is returned with no record path, and the check goes on. A later check on the same topic finds no record and enumerates again.
  - User impact: The check still runs. constraintSource has no record path, and sibling checks may judge against a separately enumerated list; the log says why.
- **A record file exists and cannot be read or is not a record (cut short, another schema version, another repository or topic under the same key).** (recoverable)
  - Detection: JSON.parse throws, or the parsed value's schemaVersion, repoPath or normalised topic does not match what was asked for.
  - Response: Treated as absent: logged at warn, the enumeration is made and the file is overwritten.
  - User impact: None beyond one more lookup.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Four infra checks in one plan, each on one workflow file, all with the same constraintTopic. | One enumeration: the first check makes and stores it, the other three read the record. All four outputs carry the same constraints and the same record path. |
| Two checks whose topics differ only in case or spacing ('Build and  test rules' and 'build and test rules'). | One record: the key is made from the normalised topic. The record keeps the topic as the first task wrote it. |
| Two checks on the same topic with different maxConstraintSources. | Two records: the number of sections read is part of the key, because it changes what the enumeration can find. |
| A task gives both constraintTopic and an inline constraints list. | The inline list is used; no enumeration is made; constraintSource.kind is 'inline'. An empty inline list or an empty list of ids counts as not given, so the next source in order is used. For the ids this is today's behaviour; for the inline list it is new. |
| A data check under a connection scope. | The documents read are those of the repository that declares the connection (the check's own resolved scope); no kind of scope is refused that was accepted before. |
| An infra or data check whose scope is a directory in no registered repository. | The repository asked for is that directory, as for the check's excerpts today; the store holds no documents for it, so the enumeration finds no section and the check fails with 'state no constraint on ... (no section of the documents matches the topic)'. |
| A code check scoped to one file, with a topic. | The whole repository's documents are searched for the topic, not only documents under the file's directory. |
| A child plan's adherence check on a topic its parent plan's check already enumerated. | It reads the parent's record: the plans of a tree share the run id. |
| The enumeration reached its limit of sections, read only the first part of a long section, or skipped something (the search by meaning did not run, so retrieval was by keywords only; or a retrieved section is no longer in the index). | The enumeration's completeness (its reached limits, its partly read items and its skipped items) appears in the check's completeness record, on the first check and on every check that reads the record. |
| A plan with an adherence task that gives only constraintIds, or only an inline list (how such tasks are written today). | It validates and runs as today, apart from the two new output fields. |

**Invariants to preserve**

- A non-empty inline list and non-empty stored-document ids keep their meaning and their order of precedence (inline before ids); the one change is that an empty inline list is passed over where today it is taken and fails the check; constraints hydrated from ids keep their citation fields and still record the project-context limit and the partly read summaries. [[c1]]
- runSharedDocConstraintEnumerate and the docs task that calls it are not changed; the check consumes the function as it is. [[c2]]
- The check resolves its scope for its own family through resolveTaskScope and reads the repository graphRepoOf gives; no kind of scope accepted today is refused. The repository still has one source in the check, adherenceRepoPath: runAdherenceCheck resolves it once, before the constraints, and hands it to resolveConstraints, which hands it to the ids route and the topic route. The source scan in src/analyze/runtimes/__tests__/scope-sources.test.ts, which today expects two calls of adherenceRepoPath in adherence.ts and no other source of a repo path, is updated to expect one. [[c5]]
- A failed judging call still throws and is still recorded as a failed task; it is never returned as a finding. [[c1]]
- The adherence-report keeps every field it has today (the subject, matches, drifts, missingImpl, contradictions, diagnostics); the two new fields are additions. [[c7]]
- Every model call is made one after another; the enumeration and the judging are sequential awaits, never run together. [[c1]]
- Plan validation still returns the first failure with its invariant id. A task valid today whose constraint parameters are a non-empty inline list, non-empty stored-document ids, or both (an empty list beside them included) stays valid. A task that carries constraintsSource does not: that is the one deliberate removal. [[c4]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by `npx tsx --test` under Node 22; test files are `__tests__/*.test.ts` beside the code (the convention of src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts and src/analyze/planner/__tests__/templates.test.ts)`

**Test levels**

- **unit** — Plan validation refuses an adherence task with no source of constraints, in words the planner can act on, and accepts each way that works; the catalog shows only those ways.
  - Subjects: `a plan whose adherence task has no topic, no inline constraints and no stored-document ids fails validation with the task, the three ways to give constraints and the option to leave the task out (code, data and infra), and the INV-5 fix hint sent with the message gives the same remedies, including removing the task and renumbering the ids that follow`, `an adherence task with a topic, with an inline list, or with stored-document ids validates; one whose only source is an empty topic or an empty list does not, a non-empty override with an empty list beside it still validates, one with the removed constraintsSource does not, and for constraintsSource the message says to give constraintTopic instead, also in a generic plan that holds the docs task and also beside a usable override`, `the catalog shown to the planner for each adherence template names constraintTopic and does not name constraintsSource or docs.constraint.enumerate`
  - Fixtures: `the real template catalog (registerBuiltinTemplates), as in templates.test.ts`
- **integration** — The check finds its constraints on a topic from the documents of a real store, reuses one enumeration per run, repository and topic, and reports what it judged against.
  - Subjects: `a check with a topic judges against the constraints enumerated from the repository's documents, and its output carries those constraints, their citations and the record's path`, `four checks with one topic in one run make one enumeration; a topic that differs only in case or spacing reuses it; a different maxConstraintSources, a different topic or a different run does not`, `the enumeration's reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record`, `an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic`, `a data check under a connection scope and an infra check under a manifest directory read the documents of the declaring or containing repository, and a code check scoped to one file reads the whole repository's documents`
  - Fixtures: `a temporary store with document entities and summaries (makeDoc in adherence-constraints.test.ts)`, `a stand-in model for the enumeration and for the judging that counts its calls (the enumeration's `provider` argument, reached through a test seam of the new module; the judging through the role provider seam the existing adherence tests use)`, `the task-scope test seam (_setTaskScopeDepsForTest) for the connection and manifest-directory scopes`, `a temporary run id whose constraint records are purged after each test`
- **integration** — Each way the check can fail has its own reason, and the reason reaches the task's record through the plan walk.
  - Subjects: `when the documents state no constraint on the topic the check fails with that reason, with the number of sections read or the note that none matched, the record is written, and a sibling check fails the same way without a second enumeration`, `when the enumeration's model call fails the check fails with 'could not be enumerated', writes no record, and the next check enumerates again; when the judging call fails the reason is the judging's and the record stays`, `an override that yields no constraint fails naming the override and does not fall back to the topic`, `a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check`, `run through the plan walk, a failed check's reason is in the task's record and in tasksFailed, and the plan's report is still written from the other tasks`
  - Fixtures: `the same store and stand-in models; the existing source scan src/analyze/runtimes/__tests__/scope-sources.test.ts, updated to expect one call of adherenceRepoPath in the check`, `runExecutor with the real adherence runtime registered and a stand-in aggregate runtime`
- **unit** — The upstream-task route is gone everywhere, and the existing behaviour of the overrides is unchanged.
  - Subjects: `no template, runtime or prompt of the analyze framework names constraintsSource, and the check does not read upstreamOutputs`, `the existing tests of constraintIds and inline constraints keep their assertions, read through the new result shape of the seam; the two tests of constraintsSource are replaced, and the test that no source returns an empty list is replaced by one that asserts the throw naming constraintTopic, constraints and constraintIds`
  - Fixtures: `a source scan of src/analyze and src/prompts/analyze that reads code and prompt text, not comments about history`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a plan whose adherence task has no topic, no inline constraints and no stored-document ids fails validation with the task, the three ways to give constraints and the option to leave the task out (code, data and infra), and the INV-5 fix hint sent with the message gives the same remedies, including removing the task and renumbering the ids that follow`, `an adherence task with a topic, with an inline list, or with stored-document ids validates; one whose only source is an empty topic or an empty list does not, a non-empty override with an empty list beside it still validates, one with the removed constraintsSource does not, and for constraintsSource the message says to give constraintTopic instead, also in a generic plan that holds the docs task and also beside a usable override` |
| `ac2` | `a check with a topic judges against the constraints enumerated from the repository's documents, and its output carries those constraints, their citations and the record's path`, `the catalog shown to the planner for each adherence template names constraintTopic and does not name constraintsSource or docs.constraint.enumerate`, `a data check under a connection scope and an infra check under a manifest directory read the documents of the declaring or containing repository, and a code check scoped to one file reads the whole repository's documents` |
| `ac3` | `four checks with one topic in one run make one enumeration; a topic that differs only in case or spacing reuses it; a different maxConstraintSources, a different topic or a different run does not`, `the enumeration's reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record` |
| `ac4` | `when the documents state no constraint on the topic the check fails with that reason, with the number of sections read or the note that none matched, the record is written, and a sibling check fails the same way without a second enumeration`, `when the enumeration's model call fails the check fails with 'could not be enumerated', writes no record, and the next check enumerates again; when the judging call fails the reason is the judging's and the record stays`, `run through the plan walk, a failed check's reason is in the task's record and in tasksFailed, and the plan's report is still written from the other tasks` |
| `ac5` | `an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic`, `an override that yields no constraint fails naming the override and does not fall back to the topic`, `no template, runtime or prompt of the analyze framework names constraintsSource, and the check does not read upstreamOutputs`, `the existing tests of constraintIds and inline constraints keep their assertions, read through the new result shape of the seam; the two tests of constraintsSource are replaced, and the test that no source returns an empty list is replaced by one that asserts the throw naming constraintTopic, constraints and constraintIds` |

## 6. Migration

**State before:** The adherence templates of the code, data and infra families require only their subject; constraintsSource, constraints and constraintIds are optional (s1: the search of the three template files). resolveConstraints reads constraintsSource from the task's upstream outputs by output name, then the inline list, then the stored-document ids, and with none returns an empty list, on which runAdherenceCheck throws 'no constraints available' (s1: the search of adherence.ts). A plan of a code, data or infra target cannot hold the docs task the templates point to, so constraintsSource can never be satisfied in such a plan. It does work today in two cases: in a generic plan, which may hold docs.constraint.enumerate, when the adherence task consumes its output and gives the output's name ('constraints') as constraintsSource; and beside a usable override, where an upstream that is absent is passed over and the inline list or the ids are used. No adherence code calls the shared constraint enumeration (s1: the callers found by text search). The adherence-report does not carry the constraints judged against (s1: the data-model reading).

**State after:** The three templates declare constraintTopic and maxConstraintSources, no longer declare constraintsSource, and require one of constraintTopic, constraints or constraintIds. Plan validation names a missing source in the planner's words. The check uses the inline list, else the stored-document ids, else enumerates the topic from the documents of the repository it reads, once per run, repository and topic, through a record file in the run's directory. The adherence-report carries the constraints judged against and where they came from. The docs task and the shared enumeration are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the enumeration record: the path entry, the module that reads or makes and writes a record, and its tests. Nothing calls it yet. — ↩ rollbackable
2. Change the shared check: the order of sources (inline, ids, topic), the distinct failure reasons, the two new result fields and the folding of the enumeration's completeness; stop reading constraintsSource and the upstream outputs. Copy the two new fields into the adherence-report in the three family runtimes. Replace the two tests of the upstream route. — ↩ rollbackable
3. Change the three templates: add the two parameters, remove constraintsSource, require one source, rewrite the descriptions, raise the revision to r2. Add the validator's check with its message, and its tests against the real catalog. — ↩ rollbackable
4. Update docs/plans/docs-module.md where it describes how an adherence check gets its constraints (sections 3.5 and 8.5, and the lines on constraintIds). Add to the guide (docs/daemon.md), which says nothing on the subject today, a short section: the three ways a check gets its constraints and their order, the record file of an enumeration, and the reasons a check can fail with. — ↩ rollbackable

**Backward compat:** No public API changes: the templates, the check and the validator are internal to the analyze framework, and plans are built fresh by the planner on every run. Two things that work today stop working, on purpose (the stakeholder's decision of 2026-10-10, taken again after the review showed these cases): a generic plan whose adherence task reads the output of a docs.constraint.enumerate task through constraintsSource, and a task that carries constraintsSource beside a usable override. Both now fail validation with a message that says constraintsSource is no longer accepted and to give constraintTopic instead; a generic plan loses nothing it could check, because the topic route uses the same enumeration. In a code, data or infra plan a task with constraintsSource and no override failed when it ran, and now fails at validation. A task that carries only constraintIds or only an inline list validates and runs as before. Readers of the adherence-report see two added fields and no removed one. No stored data is rewritten; the record files are new and belong to the run that wrote them.

## 7. Alternatives considered

### 7.1 a1: Enumerate in the check; reuse through a record file in the run's directory — **CHOSEN**

The shared check enumerates constraints on params.constraintTopic and stores each enumeration as a file under the run, which sibling checks read back.

The three adherence templates gain a string parameter `constraintTopic` and an optional `maxConstraintSources`, lose `constraintsSource`, and state in their schema that one of `constraintTopic`, `constraints` or `constraintIds` is required (the validator's own check requires that one of them is not empty). resolveConstraints becomes: inline list if given; else stored-document ids if given; else the topic. For the topic it asks a new function, constraintsForTopic(runId, repoPath, topic, maxSources), which looks for the enumeration's record at <run>/constraints/<key>.json (key = hash of repo path, normalised topic and maxSources); when present it returns it, else it calls runSharedDocConstraintEnumerate for the whole repository (no area) and writes the record before returning. Only a finished enumeration is written; a failed one is not, so the next check tries again. AdherenceResult gains `constraints` (what was judged against, with citations) and `constraintSource` ({ kind: 'documents', topic, retrievedSectionCount, record } | { kind: 'inline' } | { kind: 'stored-documents', ids }); the three family runtimes copy both into the adherence-report. The enumeration's completeness (its limits, partly read items and skipped items) is folded into the check's. The plan validator gains a check beside refusedScopeKind that fails an adherence task with none of the three with a message in the planner's words.

### 7.2 a2: Enumerate in the check; reuse through a map held in the process

As a1, but the enumeration per run, repository and topic is kept in a module-level map.

The same parameters, validation, output and failure reasons as a1. constraintsForTopic keeps a Map keyed by run id, then by repository, normalised topic and maxSources, holding the finished DocConstraintEnumerateOutput. A check that finds its key uses it; one that does not enumerates and stores it. The map must be emptied for a run when the run ends, which means the run driver (or the plan walk) calls a release function, or the map keeps a bounded number of runs.

**Rejected because:** Meets the decisions within one process, but the reuse does not survive a resumed run and leaves no trace of its own; it also needs a release call from outside the check.

### 7.3 a3: Enumerate in the check with no reuse

Each check enumerates its own topic every time; nothing is shared between checks.

The same parameters, validation, output and failure reasons as a1, with resolveConstraints calling runSharedDocConstraintEnumerate directly for every check that gives a topic. Four checks on one topic make four retrievals and four model calls.

**Rejected because:** Goes against the decision that one enumeration per topic is reused: sibling checks can judge against different lists.

## 8. References

- **[[c1]]** `code` `src/analyze/runtimes/shared/adherence.ts` — "const upstream = args.upstreamOutputs.get(source);"
- **[[c2]]** `code` `src/analyze/explore/doc-constraint-enumerate.ts` — "export async function runSharedDocConstraintEnumerate("
- **[[c3]]** `code` `src/analyze/planner/templates/code/index.ts` — "description: 'taskId of the upstream docs.constraint.enumerate task whose output feeds constraints.',"
- **[[c4]]** `code` `src/analyze/planner/validate.ts` — "// INV-5: params validate against template inputSchema"
- **[[c5]]** `code` `src/analyze/runtimes/shared/task-scope.ts` — "return scope.repoPath ?? scope.lookupPath;"
- **[[c6]]** `code` `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — "test('constraintIds hydrate keyConstraints from summarised docs', async () => {"
- **[[c7]]** `code` `src/analyze/runtimes/infra/adherence-check.ts` — "const result = await runAdherenceCheck({"
- **[[c8]]** `stakeholder` `Decisions of the stakeholder in the session of 2026-10-10` — "i prefer the 3rd option ... yes to all three ... Remove it anyway (my recommendation)."
- **[[c9]]** `prior-artifact` `docs/standalone/bug-analyze-planner-plans-adherence-check-E202610090f17539c/ISSUE.md` — "A plan does not contain an adherence-check task that has no constraints to check"
- **[[c10]]** `stakeholder` `The acceptance criteria this design states, from the issue's fix intent and the decisions of 2026-10-10` — "ac1: a plan with an adherence task that has no source of constraints fails validation with a message the planner can act on. ac2: a code, data or infra check given a topic finds its constraints in the"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T07:08:09.918Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
