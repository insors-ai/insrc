<!-- insrc:artifact LLD-b9d5c5c40df5a574-s7 -->

# LLD: E20261008b9d5c5c4:S007

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `7d17654ecfd1...`

A broad analysis of infrastructure or data already runs to a final report; a broad analysis of code or documents does not, and a run that dies leaves a record that reads as still in progress. This Story makes every plan task take its scope from one function, so that each family accepts exactly the kinds of scope its row of the table allows and refuses any other with a code. It lets the aggregate task write its report from the inputs that exist when a task before it failed, so the run returns a report that names what is missing instead of nothing. And it makes a run that dies, or was left behind by a daemon that stopped, say so in its record. Two stops found by the first runs are left to other Stories and named here: what the code tasks treat as a module (Story s8), and an aggregate input too large for one model call (Story s3).

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-b9d5c5c40df5a574** § 2. Framework summary

**Rollout phase:** Phase C — a broad analysis completes
**Consumes:** `sc6` (Causes of not proceeding)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Classifying every catch clause in the lookups and the plan-task runtimes: a clause that handles a named, expected condition stays and names what it skipped in the record; a clause that swallows an error is removed or rethrows, so that the lookup becomes the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, added as one more case to the raise site and the mapping that Story s6 owns, and passed through everything that reaches the context builder (six callers, the one-shot agent tool and the daemon's workflow runner, with the error's data carried through the daemon's error mapping). Keeping the report out of the schema given to a model at both places the schema reaches one (the answer-writing call and the tool loop's final answer), and rejecting a report an agent supplies. What the step tool attaches to a bundle the agent wrote. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs. The free-form fallback: an optional field for partial findings on the failed output, the loop's exit at the limit attaching what it gathered, reaching its turn limit becoming a failed output, and its answer gets a report that says it rests on a search directed by a model. Reading the data drivers' cut flag into the completeness record of the table-listing lookup and the object-listing plan task. — owns `sc1`, `sc2`
- `s2`: The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, what the decomposer and planner receive as size at each moment, the size's effect on plan depth as well as task count, and measuring a child plan from the area it names when it is spawned, with the planner model's figure and a size on the daemon request kept as hints. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer. The source of the measure for each of the seven kinds of scope, including counting a data connection's tables or objects from the live source through the data driver, and the fallback to XL, recorded as not determined, when a count cannot be taken. Adding a complete mode to the data drivers' listings for the count (the five relational drivers, four of the six namespace drivers, the file listing; Redis and etcd are recorded as not determined, since their listing is a sample of keys), with the limited mode kept for other callers; a listing that reports it was cut is never a determined count. — owns `sc3`
- `s3`: The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold. This Story closes the exception accepted on Story s7: a broad docs analysis whose aggregate input is larger than one model call accepts must complete once that input is handled in parts. — owns `sc4`
- `s4`: Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content at nine sites: the eight found when the Epic was defined, including the three adherence checks, and the indexer's own cut of a stored body to 8,192 characters (src/indexer/parser/artifact.ts), which Story s1 reports with the item's real length. The index is a pointer: at each of the nine sites, where an item's content matters to the answer, the analyzer reads the item from its file at the place the index points to and does not rely on the body the index stores. What the index stores and how it is built are not changed. The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method. Raising the lookup cache's version again, and dropping limit parameters before a lookup's cache key is taken. Building cancellation (a signal from each caller through the context builder to a check between turns; the run's signal into the plan walk and the classifier; the optional signal on the daemon's standard handlers; the signal parameter on the daemon's context-building functions; a signal on the step tool's plan and narrow phases, through stepPlan and the runner context; the new cancel request for the five requests received over the socket that reach a tool loop (the three context requests, the plan request and the classify request), with the daemon's table of run id to canceller; the cancelled case in the classify stage's mapping; 'aborted' in the daemon's error codes; what a cancelled loop returns), moving the table-listing lookup and the object-listing plan task to the complete mode of the data drivers' listings, and only then removing the turn limit and retiring its configuration setting (catalog row, retired list, the analyzer's configuration, the planning prompt, the VS Code extension's declaration with a release, the pages that document it, the reconcile fixture) for all three users of the loop (the free-form lookup and the classification and task modes) and giving the loop the complete mode of its search tools. Removing the error and the code for reaching the turn limit from both lists and both mappings, with the tests that import the error and the test configuration that sets the limit.
- `s5`: Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses. — owns `sc5`
- `s6`: Giving a request that asks no specific question a run context: what the lookup pipeline plans for it (a broad survey of the area it names, from the lookups that exist) where today it returns at once; the same for a request started with a stated kind of source, which is always marked unfocused; serving, in the lookup pipeline, the four kinds of scope it returns for today (a file, a symbol, a manifest directory, a data connection), and how each resolves to what the lookups need. Replacing the single 'model unavailable' error with the cause of each way of not proceeding, as new codes in the existing list and new typed errors, and with the existing codes where one fits: every place the pipeline returns nothing, and the fall-through for a bundle that fails validation, is listed and given its cause. It owns the place the error is raised, the pipeline's rule for returning nothing, and the functions that map these errors to codes (the plan tree's and the daemon's, and the classify stage's mapping, through which an error from the classifier's context build is routed). The form of a symbol scope's value, its resolution to one stored entity, and the validator and classifier prompt brought in line. The one function that resolves a scope's value to a repo, a path or an entity, and moving the lookup pipeline's direct readers of the value to it (the planning prompt, the context builder's path resolution, the indexed check). Correcting the table of which kind of scope goes with which kind of source, with the classifier prompt's copy of it, the table's comment and the matrix test, and applying it on both classification branches: the plan tree's classify mapping surfaces the validator's inner code, and the branch with no classifier calls the validator's checks directly. Supplying the connection check from both callers of the classifier, and mapping a connection id to its repo. It declares all three new codes in both lists; Stories s1 and s7 raise one each. — owns `sc6`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `resolveRepoPath`

```typescript
// replaces the three copies of resolveRepoPath (code, infra) and resolveRepoPathFromIntent (data)
function resolveTaskScope(scopeRef: AnalyzeScopeRef, family: 'code' | 'docs' | 'infra' | 'data', templateLabel: string, deps?: ScopeDeps): Promise<ResolvedScope>

// the pairing check and the resolution it is built on: one function beside resolveScope in src/analyze/context/scope.ts,
// taking over the two lines that stepScope (mcp/analyze-step/scope.ts) holds and that prepareScope (context/driver.ts) holds inside its run-mode branch
function resolveScopeForTarget(ref: AnalyzeScopeRef, target: AnalyzeTarget, deps?: ScopeDeps): Promise<ResolvedScope>

// the existing indexed check gains optional readers, so that it reads the same registry and entities as the resolution beside it
function ensureNonEmptyClosure(scope: ResolvedScope, deps?: Pick<ScopeDeps, 'listRepos' | 'listEntitiesForRepo'>): Promise<string | undefined>
```

**Parameters:**
- `scopeRef: AnalyzeScopeRef` — The scope a task works on: the one in its own parameters where the template has one (the code and infra tasks), otherwise the intent's.
- `family: 'code' | 'docs' | 'infra' | 'data'` — The family whose row of TARGET_TO_KINDS says which kinds of scope the task accepts. A shared task (the adherence check) passes the family of the template it runs as.
- `templateLabel: string` — The template's id, for the message of a refusal.
- `deps: ScopeDeps` _(optional)_ — The readers resolveScope needs; a test supplies stand-ins.

**Returns:** `Promise<ResolvedScope>` — Story s6's resolved scope, unchanged in shape: the registered repo that contains the scope (or a connection's repo), the directory lookups run in, and for a file or a symbol the file path and entity id, for a connection its id. A code or docs task reads the stored graph for `repoPath`; where that is null because the registry could not be read or holds no repo, it uses the scope's own path, as today. It keeps to the area named by `lookupPath`, `filePath` or `entityId`. An infra task walks `lookupPath`. A data task opens its connection pool at the scope's own path for a repo, a manifest directory and a workspace scope, exactly as today, and at the connection's repo for a connection scope.

**Errors:**
- `ScopeKindTargetMismatchError` when the scope's kind is not in the family's row of TARGET_TO_KINDS; its message names the kinds allowed, and it maps to the existing code 'scope-ref-kind-target-mismatch'
- `ScopeRefUnresolvedError` when resolveScope cannot resolve the value (a symbol that matches no stored entity, a connection registered in no repo); maps to the existing code 'scope-ref-unresolved'
- `ScopeNotIndexedError` when a code or docs task whose scope fails the existing indexed check, ensureNonEmptyClosure in src/analyze/context/invariants.ts: the registry was read, it holds repos, and none contains the scope, or the one that does has no stored entities. Maps to the existing code 'scope-not-indexed'. The check keeps its leniency: when the registry cannot be read, or holds no repo at all, it does not throw and the task goes on with the scope's own path. Infra tasks read the file system and data tasks open a connection pool at a path; neither reads the graph and neither raises this error

**Preconditions:**
- TARGET_TO_KINDS is the one table of kinds per family (src/analyze/classifier/validate.ts); this function reads it and holds no list of its own
- The check of a kind against a row of the table, followed by resolveScope, is written twice today: stepScope (src/mcp/analyze-step/scope.ts) always makes the check against the intent's kind of source; prepareScope (src/analyze/context/driver.ts) makes it only in run mode with an intent, and in classification mode (no intent, so no kind of source) and task mode calls resolveScope with no check. A third copy is not written

**Postconditions:**
- The pairing check and the resolution become one function, resolveScopeForTarget, beside resolveScope. stepScope calls it in place of its two lines. prepareScope keeps its mode condition: it calls resolveScopeForTarget only in run mode with an intent, and calls resolveScope directly in classification and task mode, exactly as today. Neither changes what it accepts, refuses or returns. resolveTaskScope calls resolveScopeForTarget with the task's family and adds only the indexed check for the code and docs families
- Lives in one new file under src/analyze/runtimes/shared/ and is the only place a plan task turns a scope into a repo, a path, an entity or a connection
- The three per-family functions are removed: resolveRepoPath in runtimes/code/_shared.ts (also imported by the docs inventory task), its copy in runtimes/infra/_shared.ts, and resolveRepoPathFromIntent in runtimes/data/_shared.ts. readScopeRef, which only reads the task's parameter, stays
- The five direct readers of the scope's value call it: docs/family-summarise.ts, docs/constraint-enumerate.ts, docs/decision-trace.ts, shared/adherence.ts (two places) and data/discovery-connections.ts, whose optional scopeRefValue parameter still takes precedence as a repo path
- A code or docs task keeps to the area the scope names: for a module scope only the entities or documents whose file lies under the scope's directory; for a file scope, only that file's; for a symbol scope, the one entity. For a repo, a manifest directory and a workspace the area is the directory, as today
- A data task passes the connection pool the same path as today for a repo, a manifest directory and a workspace scope: the scope's value, whether or not that directory is a registered repo, and not the repo that contains it (a manifest directory inside a registered repo keeps its own connections file). Only a connection scope, which is new for the data tasks, uses the resolved connection's repo, and the task then works on that connection alone
- The mapping from the three scope error classes to their codes becomes one exported function beside the classes in src/analyze/context/invariants.ts. The plan walk and both existing mapping functions (the plan tree's in orchestrator/driver.ts and the daemon's in daemon/analyze-rpc.ts) call it, so the walk imports nothing from the run driver, which itself imports the walk. The shared function returns the code and, for ScopeNotIndexedError, the data { scopePath, registeredAs } that both mappings attach today, so neither loses it; the plan walk uses the code
- Kinds accepted per family after the change are exactly the table's rows: code: repo, module, file, symbol, manifest-dir, workspace; docs: repo, module, file, workspace; infra: repo, manifest-dir, workspace; data: connection, repo, manifest-dir, workspace. Today code and docs accept repo and manifest-dir only, and data accepts no connection
- What the two module tasks and the functional-surface task of the code family treat as a module is not changed here; that is the subject of Story s8, added to the Define on 2026-10-08
- A docs task keeps to a module or file scope at the point its documents are selected, not after. The constraint and decision tasks call the shared runners runSharedDocConstraintEnumerate (src/analyze/explore/doc-constraint-enumerate.ts) and runSharedDocDecisionTrace (src/analyze/explore/doc-decision-trace.ts). Each runner hands prepareDocConstraintEnumerate or prepareDocDecisionTrace a new object built field by field, and it is the prepare function that calls retrieveDocSections (src/analyze/docs-retrieval.ts). The runner and its prepare function share one argument type (RunDocConstraintEnumerateArgs, RunDocDecisionTraceArgs), so the optional area (a directory or a file) is added to those two types and to retrieval's, and is forwarded explicitly at both hand-overs: in the object the runner builds for prepare, and in the call prepare makes to retrieval. Ranking and limits then apply within the area and the completeness record counts within it. The lookup pipeline calls the two prepare functions directly (src/analyze/explore/executor.ts) and passes no area; it is unaffected. The family-summary task keeps only the document summaries whose file lies in the area. Retrieval has two passes, and both keep to the area. The keyword pass already works on the candidate set, which the area narrows. The vector pass asks searchEntityVecs (src/db/lance/entity-vec.ts) for the nearest sections of the whole repository and then drops those outside the candidates, so for a small area most of what it returns would be dropped and the area's sections would be ranked by keywords alone. The vector search's filter therefore gains an optional list of entity ids; for an area, retrieval passes the ids of the area's candidates, and the nearest hits are the nearest within the area. The vector table holds no file path and is not changed; only the query's condition is. An empty list of ids returns no hits without a query, as an empty list of kinds does today (the query engine rejects an empty IN list). An area can hold thousands of sections; nothing in the repository passes a list of ids to the vector search today, so the build measures a query with as many ids as the largest directory of this repository holds, and if one condition of that size is refused or slow the ids are sent in consecutive batches, each its own search, and the hits merged by distance. No id is left out in either case
- The leniency of the indexed check holds for the kinds that are paths (repo, module, file, manifest directory, workspace). A symbol scope is resolved by Story s6's resolveScope, which reads the registry itself: with a registry that holds no repo it throws ScopeNotIndexedError, and with one that cannot be read the reader's own error passes through and the task fails with no code. That behaviour is Story s6's and is not changed here
- Existing tests of the removed functions are replaced, not kept: the test hook `_resolveRepoPathForTest` exported from runtimes/code/discovery-modules.ts and its assertions on the 'not supported yet' wording (runtimes/code/__tests__/discovery-modules.test.ts), the tests of resolveRepoPathFromIntent (runtimes/data/__tests__/data-runtimes.test.ts) and the infra copy's (runtimes/infra/__tests__/infra-runtimes.test.ts). The table test over families and kinds covers what they covered
- ensureNonEmptyClosure (src/analyze/context/invariants.ts) reads the registry and a repo's entities from the real store today and takes no readers. It gains an optional second parameter holding the two readers it uses; resolveTaskScope passes the ones from its own `deps`, so one call resolves and checks against the same registry, and a test's stand-ins reach both. The check's existing caller in the context builder (src/analyze/context/driver.ts) passes nothing and behaves as today

### 2.2 `unmetDependencies`

```typescript
function unmetDependencies(task: PlannedTask, outputs: ReadonlyMap<string, unknown>, failed: ReadonlySet<string>): string | null   // unchanged

// the plan walk's new rule for the aggregate-report task (the last task of a plan), applied in executePlan:
interface AbsentInput { readonly name: string; readonly producedBy: string | null; readonly reason: string }   // one per name a failed or skipped task would have produced
interface TemplateExecuteArgs { /* as today */ readonly absentInputs?: readonly AbsentInput[] | undefined }
interface RunAggregatorArgs { /* as today */ readonly absentInputs?: readonly AbsentInput[] | undefined }
```

**Parameters:**
- `absentInputs: readonly AbsentInput[]` _(optional)_ — For the aggregate-report task only: what the plan did not produce. One entry per name that a failed or skipped task of the plan would have produced, with that task's id and its recorded reason; and one entry, with no producing task, for a name the aggregate task consumes that no task of the plan produces. The list is built from the plan's tasks, not only from the aggregate task's own `consumes` list, because that list is written by the planner and may be empty.

**Returns:** `string | null` — Unchanged: the first consumed name that is not among the outputs, or null. For every task but the aggregate-report task a missing name still means the task is skipped as 'skipped-dependency-unavailable'.

**Errors:**
- `skipped-dependency-unavailable (task status, as today)` when the aggregate-report task has none of its inputs: no report can be written from nothing, and the run fails with 'executor-aggregator-failed' as today

**Preconditions:**
- The aggregate-report task is the last task of a plan and the only aggregator in it (plan validation's INV-12), so the walk identifies it by position, as it does today to take the plan's final report
- A task's `consumes` list is written by the planner; no aggregate template fixes one, and plan validation accepts an empty list. An aggregate task with an empty or absent `consumes` always runs today and is handed no upstream output

**Postconditions:**
- The aggregate-report task is skipped in one case only: it consumes at least one name and none of the names it consumes was produced. In every other case it runs: with all its inputs (as today), with some of them, or with an empty `consumes` list (as today). Whenever any task of the plan before it failed or was skipped, it is given `absentInputs`
- runAggregator writes the absent inputs into the prompt as their own section, after the outputs that exist: each name, the task that should have produced it and why it did not, with the instruction that the summary and the findings must not state anything about an absent input except that it is absent. The five aggregate-report runtimes pass `absentInputs` through unchanged
- The run then completes: runAnalyze returns its result with the final report, with `tasksFailed` listing the failed and skipped tasks as today, and with the answer report (Story s1), which already lists each of them as a failed source. The final report's first line therefore says the answer is incomplete and names them, written by code
- The same rule holds in a child plan: its aggregate-report task runs on what exists, the planner-kind task above it receives the child's report and is 'ok', and the child's failed tasks are in the run's answer report by their paths
- A failed aggregate-report task (the model call fails, or its prompt is too long for the model, as the docs run of 2026-10-08 showed) still ends the run with 'executor-aggregator-failed'. Dividing an aggregate's input is Story s3's subject
- An aggregate task whose `consumes` is empty is handed no upstream output today and writes its report from the run context alone. That is unchanged; what is new is that it is told which tasks of the plan failed, so its summary cannot read as if the plan had nothing more to offer

### 2.3 `runAnalyze`

```typescript
function runAnalyze(args: RunAnalyzeArgs, opts?: RunAnalyzeOpts): Promise<RunAnalyzeResult>   // signature unchanged

// new, in src/analyze/orchestrator/: which runs are live in this process
function isRunLive(runId: string): boolean
```

**Parameters:**
- `args: RunAnalyzeArgs` — Unchanged.

**Returns:** `Promise<RunAnalyzeResult>` — Unchanged in shape. An error that nothing inside the run catches no longer leaves the function as a rejection: the run record is written as failed at the stage the run had reached, with the code 'internal-error' and the error's message, and that failure is returned.

**Errors:**
- `RunAnalyzeFail with code 'internal-error'` when an error raised anywhere in the run that no stage's own handler catches; the result's `stage` is the stage that was running
- `RunAnalyzeFail with code 'scope-not-indexed'` when a docs run whose scope lies in no registered repo, or in one with no stored entities, while the registry is readable and holds repos; the result's stage is 'plan'

**Preconditions:**
- The run's id is recorded as live before the first record is written and removed when the function returns or throws

**Postconditions:**
- A run record is 'in-progress' only while its run is live in the process that started it, or when that process stopped without returning
- The plan walk turns an error raised while it handles one task outside the task's runtime (writing the task's record, reporting its progress) into that task's failure and goes on; an error it cannot attribute to a task reaches this function's handler
- A completed run resumes from its stored record exactly as today
- The handler's own write of the run record is guarded. If it fails (the disk is full, which may be the very cause of the first error), the failure is logged and the function still returns the 'internal-error' result and fires 'done'. The record is then left as it was; the run is no longer live, so the abandoned rule corrects it when it is next read
- The handler guards the whole of the function from its first read of an existing record onward, so the resume check and its abandoned rewrite are inside it, not before it. The stage it reports is held in a variable that starts as 'classify', the first stage and the one the initial record carries, so an error raised before any stage has started is reported at 'classify'
- Before it plans, the run checks its intent's scope once with resolveTaskScope for the intent's kind of source (code, docs, infra or data; a generic intent has no family row and is not checked here). In practice this check can raise one thing: 'scope-not-indexed' for a docs run, which ends at stage 'plan' before any plan is made. The other two scope errors are already raised earlier and are unchanged: a pairing the table refuses ends the run at stage 'classify' (the validator runs on both classification branches), and a scope that does not resolve is thrown by the run context's build and reported at stage 'plan'. For the code source the context builder already makes the indexed check (src/analyze/context/driver.ts); it makes it for no other source, so for a docs run this is the first place the index is checked, and without it a docs run on a scope in no registered repo would be planned and then fail in every task

### 2.4 `runStart`

```typescript
function runStart(params: unknown, send: (msg: IpcStreamMessage) => void, signal: AbortSignal): Promise<void>   // signature unchanged
```

**Parameters:**
- `params: unknown` — The request's parameters. `userPrompt` may be the empty string when `targetHint` is given: the run is then unfocused, which the plan tree and the lookup pipeline already serve. With no `targetHint` the empty string is still refused, because the classifier has nothing to classify; the message says that a kind of source must be stated for a request with no prompt. A prompt of only white space is not the empty string and is accepted in both cases, as today: with a stated source it is trimmed further in and gives an unfocused run, and with none it goes to the classifier.

**Returns:** `Promise<void>` — Unchanged.

**Errors:**
- `invalid-params` when an empty `userPrompt` with no `targetHint`
- `internal-error` when an error that escapes runAnalyze: the handler writes the run record as failed if it is still 'in-progress', and reports the stage from the record where today it always reports 'classify'

**Postconditions:**
- The daemon's request for a run's status and its request to purge a run both treat a record that is 'in-progress' with no live run as abandoned (see RunRecord)
- The daemon handler's write of the run record for an escaped error is guarded in the same way: whether or not it succeeds, the result frame and the 'done' frame are sent, so the client never waits on a handler that failed while reporting a failure

### 2.5 `purgeRun`

```typescript
function purgeRun(runId: string, opts?: { readonly force?: boolean; readonly isLive?: ((runId: string) => boolean) | undefined }): PurgeRunResult | PurgeRunRefused
```

**Parameters:**
- `opts.isLive: (runId: string) => boolean` _(optional)_ — Says whether a run is live. The daemon's handler passes isRunLive. A caller that cannot know (another process, a test) passes nothing, and an 'in-progress' record is refused as today.

**Returns:** `PurgeRunResult | PurgeRunRefused` — Unchanged in shape. With `isLive` given, a record that is 'in-progress' whose run is not live is rewritten as abandoned and then purged without `force`.

**Errors:**
- `run-in-progress` when the record is 'in-progress' and the run is live, or liveness is not known; as today

**Postconditions:**
- No process abandons a run it cannot know about: liveness is a parameter, and only the daemon, in which the runs it serves are started, supplies it

## 3. Data model changes

### 3.1 `TaskExecutionRecord` — field-add

Gains an optional `code`: the error code of a failure the walk can name. The walk sets it when a runtime throws one of the three typed scope errors (ScopeKindTargetMismatchError, ScopeRefUnresolvedError, ScopeNotIndexedError), from the one function in src/analyze/context/invariants.ts that maps those classes to their codes, which the run's two mapping functions also call; `error` keeps the message, without the 'runtime-threw:' prefix for these. The entries of the plan's and the run's `tasksFailed` gain the same optional `code`. A record written before the change has none, and nothing requires one.

```
interface TaskExecutionRecord { /* as today */ readonly code?: string | undefined }
// tasksFailed: ReadonlyArray<{ taskId: string; reason: string; code?: string | undefined }>
```

**Call sites:**
- `src/analyze/executor/types.ts`
- `src/analyze/executor/walker.ts`
- `src/analyze/orchestrator/types.ts`
- `src/analyze/orchestrator/driver.ts`
- `src/daemon/analyze-rpc.ts`
- `src/analyze/context/invariants.ts`

### 3.2 `TemplateExecuteArgs` — field-add

Gains the optional `absentInputs` described under unmetDependencies. Set only for the aggregate-report task, and only when some of its inputs are missing.

**Call sites:**
- `src/analyze/executor/types.ts`
- `src/analyze/executor/walker.ts`
- `src/analyze/runtimes/shared/aggregator.ts`

### 3.3 `RunRecord` — invariant-change

A record with status 'in-progress' means a run is live. Three readers apply the rule that a record 'in-progress' with no live run is abandoned, and each rewrites it as status 'failed' at the stage it had reached, with error code 'run-abandoned' (declared by Story s6) and a message that says no live run stands behind it. (1) The resume check at the start of runAnalyze: a record 'in-progress' for an id that is not live is rewritten as abandoned, and the new run then starts as it does today. (2) The daemon's status request returns the rewritten record. (3) purgeRun, given `isLive`, purges it without `force`. The first two run in the process that holds the set of live runs; the third takes liveness as a parameter. No field is added to the record. Each reader's rewrite is best effort, because the state in which a record cannot be written (a full disk) is a likely cause of the run having died. The status request returns the record as abandoned whether or not the rewrite reached the disk, and logs a failed write. The resume check in runAnalyze lies inside the region the uncaught-error handler guards, and a failed rewrite there is logged and the new run goes on, since it writes its own first record next. purgeRun, given liveness and finding the run not live, removes the directory whether or not the rewrite succeeded: the purge needs no rewrite to be correct.

**Call sites:**
- `src/analyze/orchestrator/types.ts`
- `src/analyze/orchestrator/driver.ts`
- `src/analyze/orchestrator/persistence.ts`
- `src/daemon/analyze-rpc.ts`

### 3.4 `RunDocConstraintEnumerateArgs, RunDocDecisionTraceArgs, DocsRetrievalArgs, EntityVecFilter` — field-add

Each gains an optional area: a directory, or one file, that the documents considered must lie in. Absent, the whole repository is considered, as today. The first two types are shared by each runner and its prepare function. The runner builds the object it hands to prepare field by field, so the area is forwarded there explicitly, and again in prepare's call to retrieval; without both, an area set by a task would be dropped before retrieval. Set only by the docs plan tasks for a module or file scope; src/analyze/explore/executor.ts, which calls the prepare functions for the lookup pipeline, sets none. The vector search's filter gains an optional list of entity ids, set by retrieval when an area is given, so that the nearest hits are taken within the area and not from the whole repository.

**Call sites:**
- `src/analyze/explore/doc-constraint-enumerate.ts`
- `src/analyze/explore/doc-decision-trace.ts`
- `src/analyze/docs-retrieval.ts`
- `src/analyze/runtimes/docs/constraint-enumerate.ts`
- `src/analyze/runtimes/docs/decision-trace.ts`
- `src/analyze/runtimes/docs/family-summarise.ts`
- `src/analyze/explore/executor.ts`
- `src/db/lance/entity-vec.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | consumes | Raises 'run-abandoned', which Story s6 declared in both code lists and nothing raised. Uses the existing codes for a scope a task refuses or cannot resolve ('scope-ref-kind-target-mismatch', 'scope-ref-unresolved', 'scope-not-indexed') by throwing the existing typed errors, so both mapping functions map them with no new case. Adds no code to either list, no stage, and no field to the failure type. The Story also edits four functions the HLD gives to Story s6, as extractions that keep their behaviour: the two mapping functions (the plan tree's in orchestrator/driver.ts and the daemon's in daemon/analyze-rpc.ts) call one shared function for the three scope error classes, and prepareScope and stepScope call one shared function for the pairing check and resolution. Neither mapping changes what it returns: in particular both keep attaching the data { scopePath, registeredAs } to 'scope-not-indexed', which the shared function returns with the code. Story s6 is built; its tests of these four functions are the proof and are not changed. |

## 5. Error paths

**Error cases**

- **A plan task is given a kind of scope its family's row does not allow (a docs task with a symbol scope, an infra task with a file scope).** (recoverable)
  - Detection: resolveTaskScope looks the kind up in the family's row of TARGET_TO_KINDS before it resolves anything and throws ScopeKindTargetMismatchError. The plan walk's catch around the runtime checks the error's class.
  - Response: The task is recorded as failed with code 'scope-ref-kind-target-mismatch' and the error's message, which lists the kinds allowed. The walk goes on to the next task; tasks that consume this one's output are skipped as today, and the aggregate task runs on what exists.
  - User impact: The final report's first line names the task as failed with that reason; a caller reading task records can tell a refused scope from a defect by the code.
- **A scope's value does not resolve: a symbol that matches no stored entity or several, a connection registered in no repo.** (recoverable)
  - Detection: resolveScope (Story s6) throws ScopeRefUnresolvedError; resolveTaskScope lets it pass; the walk checks the class.
  - Response: The task fails with code 'scope-ref-unresolved'. Normally the run does not get this far: classification's validator and the run context's build apply the same resolution before planning and stop the run there. It can still happen for a task whose own parameters carry a scope the planner wrote.
  - User impact: The task is named as failed with the reason in the report.
- **A code or docs task is given a scope that lies in no registered repo, or in one with no stored entities, while the registry is readable and holds repos.** (recoverable)
  - Detection: resolveTaskScope runs the existing indexed check (ensureNonEmptyClosure) on the resolved scope for the code and docs families; the check throws ScopeNotIndexedError.
  - Response: The task fails with code 'scope-not-indexed'. Today such a task uses the scope's value as if it were a repo path, finds no entities and returns an empty result that reads as complete. For the intent's own scope the run makes the same check once before it plans, so the run ends there and no task is reached; a task reaches this only when its own parameters carry a different scope. That early check is new for the docs family: the context builder checks the index for the code source only.
  - User impact: An empty result that was silently wrong becomes a failed task with a reason.
- **A task before the aggregate-report task failed or was skipped, so one of the names the aggregate task consumes was never produced.** (recoverable)
  - Detection: The walk compares the aggregate task's `consumes` list with the outputs produced; for each missing name it finds the task whose `produces` holds it and reads that task's recorded status and reason.
  - Response: If at least one consumed name exists, the aggregate task runs with the outputs that exist and with `absentInputs`; the prompt states each absent input, the task that should have produced it and why, and forbids any statement about it beyond its absence. If none exists, the aggregate task is skipped and the run fails with 'executor-aggregator-failed', as today.
  - User impact: The run returns a final report where today it returns none. Its first line, written by code from the task records, says the answer is incomplete and names every failed and skipped task.
- **The aggregate-report task itself fails: its model call fails, or its prompt is larger than the model accepts.** (terminal)
  - Detection: The runtime throws; the walk records the task as failed, and runAnalyze finds no final report on the executed plan.
  - Response: Unchanged: the run fails at stage 'execute' with 'executor-aggregator-failed', and the record carries the tasks that completed and failed. This Story does not divide an aggregate's input; Story s3 does. Accepted exception (stakeholder, 2026-10-08): acceptance criterion ac1 is not met for the docs family by this Story. On a repository of this size the aggregate-report task's input is larger than one model call accepts, and dividing it is Story s3's subject. ac1 stays as the Define words it. Story s3 must make a broad docs analysis complete, and its design must name this exception and close it. [[c10]]
  - User impact: No final report. The failure message now gives the model provider's own words (ISSUE-7a3ab8dc), for example 'Prompt is too long'.
- **An error is raised inside a run that no stage's handler catches (a defect, a full disk while a record is written, the graph store closing).** (terminal)
  - Detection: A try around the whole of runAnalyze from its first read of an existing record onward, which includes the resume check; the stage in progress is held in a variable that starts as 'classify' and that each stage sets when it starts.
  - Response: The run record is written as failed at that stage with code 'internal-error' and the error's message; the function returns that failure and the 'done' event fires once. The run's id is removed from the set of live runs in a finally.
  - User impact: The caller gets a failure that names the stage; the record no longer reads as in progress.
- **An error escapes runAnalyze all the same, or is raised in the daemon's handler around it.** (terminal)
  - Detection: The existing catch in the daemon's run handler.
  - Response: The handler reads the run record; if it is still 'in-progress' it writes it as failed with 'internal-error' at the record's stage. The result it sends carries that stage, where today it always says 'classify'.
  - User impact: As above.
- **The daemon is killed or crashes while a run is in progress.** (recoverable)
  - Detection: Nothing runs at that moment. Later, a reader in the new daemon process meets a record that is 'in-progress' and asks isRunLive, which is false: the set of live runs is in memory and started empty.
  - Response: The reader rewrites the record as failed at the stage it had reached, with code 'run-abandoned'. The status request returns that record; a purge with liveness supplied proceeds without `force`; a new run with the same id starts afresh.
  - User impact: The record stops reading as in progress the first time anyone asks about it. Until then the file on disk still says 'in-progress'.
- **Writing a task's record or reporting its progress fails while the walk handles that task.** (recoverable)
  - Detection: A try around the walk's handling of one task, outside the runtime call.
  - Response: That task is recorded in memory as failed with the error's message and the walk goes on; if the record cannot be written the failure is still in the plan's result. An error the walk cannot tie to a task propagates to runAnalyze's handler.
  - User impact: One task is reported as failed instead of the whole run ending with an unhandled error.
- **A request to start a run has an empty prompt and states no kind of source.** (recoverable)
  - Detection: The daemon's parser for the run request checks `targetHint` when `userPrompt` is empty.
  - Response: Refused with 'invalid-params' and a message that a request with no prompt must state a kind of source.
  - User impact: The caller is told what to add, where today the message only says the prompt must not be empty.
- **The run record cannot be written while a handler is recording an uncaught error (a full disk, a directory removed).** (recoverable)
  - Detection: A try around the record write inside runAnalyze's handler and inside the daemon's handler.
  - Response: The write's failure is logged. runAnalyze still returns the 'internal-error' result and fires 'done'; the daemon's handler still sends the result frame and the 'done' frame. The record on disk keeps its last state; since the run is no longer live, the first reader rewrites it as 'run-abandoned'.
  - User impact: The caller gets the failure and is not left waiting; the record is corrected the first time it is read.
- **A reader finds a record 'in-progress' with no live run and cannot write the rewritten record.** (recoverable)
  - Detection: A try around the rewrite in each of the three readers: the status request, the resume check and purgeRun.
  - Response: The failed write is logged. The status request still returns the record as failed with 'run-abandoned'; the resume check goes on to start the new run; purgeRun still removes the directory. None of the three fails because the rewrite did.
  - User impact: The caller is told the run is abandoned even when the disk cannot take the corrected record; the record on disk is corrected by a later reader.
- **A docs request whose scope lies in no registered repo, or in one with no stored entities, while the registry is readable and holds repos.** (recoverable)
  - Detection: runAnalyze calls resolveTaskScope with the intent's scope and kind of source after the run context is built and before planning.
  - Response: The run ends at stage 'plan' with 'scope-not-indexed'; the record says the same. No plan is made and no model call for planning is spent. A pairing the table refuses and a scope that does not resolve never reach this check: the first ends the run at stage 'classify' and the second in the run context's build, both as today.
  - User impact: A docs analysis of an unindexed directory is refused with 'scope-not-indexed' and the instruction to index it, where today it is planned and returns empty results that read as complete.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A run request with an empty prompt and a stated kind of source | Accepted. The run is unfocused: hintedIntentBase already builds an unfocused intent for an empty prompt, and the run context is built for it. |
| A code or docs task with a module scope | It resolves to the registered repo that contains the directory and uses only the entities or documents whose file lies under that directory. |
| A code task with a symbol scope | It resolves to the one stored entity; a task that lists or profiles reports on that entity alone. |
| A data task with a connection scope | It resolves to the connection's repo and id, and the task works on that connection only. |
| A workspace scope whose directory is itself a registered repo | As a repo scope: the area is the directory. |
| The aggregate task has all its inputs | `absentInputs` is not set and the prompt is the same as today's. |
| A child plan in which one task failed | The child's aggregate task runs on what exists; the planner-kind task above it is 'ok' with the child's report; the run's answer report names the child's failed task by its path. |
| A plan whose only task besides the aggregate task failed | The aggregate task has no input and is skipped; the run fails with 'executor-aggregator-failed', as today. |
| A name the aggregate task consumes that no task of the plan produces | It is listed as absent with no producing task; plan validation (the consumes rule) should have rejected such a plan, so this is stated, not silently dropped. |
| A status request for a run that is live | The record is returned as 'in-progress', unchanged. |
| purgeRun called with no `isLive` on an 'in-progress' record | Refused with 'run-in-progress', exactly as today. |
| A run record with status 'ok' or 'failed' | No reader changes it; a completed run resumes from it as today, with its report. |
| A task record written before the change | It has no `code`; nothing reads one as required. |
| A code or docs task with a path scope (repo, module, file, manifest directory, workspace) when the registry cannot be read, or holds no repo at all | Not refused: the indexed check does not evaluate in that state, as it does not for the run context today. The task uses the scope's own path as the repo path and reports what the graph holds for it. |
| A data task with a repo or workspace scope whose directory is not a registered repo | Works as today: the connection pool is opened at that directory. No indexed check applies to a data task. |
| A data task with a manifest-directory scope inside a registered repo | The pool is opened at the manifest directory, as today, not at the repo that contains it. |
| A code task with a symbol scope when the registry holds no repo, or cannot be read | Fails: Story s6's resolveScope reads the registry to resolve a symbol. With no repo it throws ScopeNotIndexedError and the task has the code 'scope-not-indexed'; with an unreadable registry the reader's error passes through and the task fails with no code. Unchanged by this Story. |
| A docs constraint or decision task with a module scope | Only sections of documents under that directory are retrieved and ranked; the record's counts are within the area. The same lookup run by the lookup pipeline, which passes no area, is unchanged. |
| A run request whose prompt is only white space | Accepted, as today. With a stated kind of source the prompt is trimmed further in and the run is unfocused; with none it goes to the classifier. Only the empty string with no stated source is refused. |
| A docs task with a module scope whose sections are not among the repository's nearest matches for the query | The vector pass searches within the area's candidates, so those sections are still ranked by meaning as well as by keywords. |
| A plan whose aggregate task has an empty or absent `consumes` list, with one task before it failed | The aggregate task runs, as today, with no upstream output, and is given the failed task as absent, with the names it would have produced and its reason. It is not skipped: it consumes nothing, so nothing it consumes is missing. |
| The same plan with no failed task | Exactly as today: the aggregate task runs with no upstream output and no absent inputs. |

**Invariants to preserve**

- A stop the run itself catches is recorded with its stage and code, and the record matches the result returned; the four live runs of 2026-10-08 each showed this. [[c1]]
- A task other than the aggregate-report task whose consumed name is missing is skipped as 'skipped-dependency-unavailable'; the aggregate-report task is the last task of a plan and the only one whose report becomes the plan's. [[c2]]
- The table of kinds of scope per kind of source is TARGET_TO_KINDS and is the only such table; a refused pairing has the code 'scope-ref-kind-target-mismatch'. [[c3]]
- purgeRun refuses a record that is 'in-progress' unless forced, for any caller that does not know which runs are live. [[c4]]
- A completed run asked for again under the same id returns its stored result, with its answer report. [[c4]]
- A request with a stated kind of source and an empty prompt gives an unfocused intent; a request with no stated source is classified from its wording. [[c5]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx under Node 22 (npx tsx --test); live tests gated by INSRC_LIVE_TESTS=1`

**Test levels**

- **unit** — The one scope function: each family accepts exactly its row and refuses the rest with the typed error.
  - Subjects: `a table test over the four families and the seven kinds of scope: each pairing in TARGET_TO_KINDS resolves, each pairing outside it throws ScopeKindTargetMismatchError naming the kinds allowed (mutation: give a family a kind outside its row)`, `the function reads TARGET_TO_KINDS and holds no list of its own: a kind added to a row in a stand-in table is accepted`, `a module, a file, a symbol and a connection scope resolve to the registered repo and the area (directory, file, entity id, connection id)`, `a scope in no registered repo throws ScopeNotIndexedError for code and docs when the registry is readable and holds repos, and resolves for infra and data`, `the three per-family functions are gone and no runtime file reads `scopeRef.value` to use as a repo path (a check over the runtime sources)`, `with a registry that cannot be read, and with one that holds no repo, a code and a docs scope of a path kind are not refused and the task's repo path is the scope's own path; a symbol scope fails in both states, as resolveScope decides (mutation: treat a null repo as not indexed)`, `one function maps the three scope error classes to their codes, with the data { scopePath, registeredAs } for 'scope-not-indexed', and the plan tree's and the daemon's mapping functions return through it exactly what they returned before, data included (mutation: return the code alone)`, `prepareScope and stepScope accept, refuse and return exactly what they did: stepScope and prepareScope in run mode through resolveScopeForTarget, and prepareScope in classification mode (no intent) and in task mode with a pairing the table does not allow, which is still not refused (mutation: make the check in every mode)`, `the indexed check, given readers, reads the registry and entities through them, and given none reads the real store as today (its existing tests, unchanged)`
  - Fixtures: `stand-ins for resolveScope's readers (ScopeDeps), which resolveTaskScope also hands to the indexed check`
- **integration** — Plan tasks keep to the area their scope names, through their real runtimes against a temporary graph.
  - Subjects: `a code task and a docs task with a module scope use only the entities and documents under that directory, and with a file scope only that file's`, `a data task with a connection scope works on that connection only`, `the three docs tasks, the adherence check and the connection-listing task give the same result for a repo scope as before the change`, `a data task with a repo scope on a directory that is not a registered repo, and one with a manifest-directory scope inside a registered repo, open the pool at that directory, as before the change (mutation: open it at the containing repo)`, `a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory, and their records count within it, through the runner, its prepare function and retrieval; the lookup pipeline's direct call of the prepare functions, with no area, returns what it did before (mutation: drop the area at the hand-over from runner to prepare)`, `a docs task with a module scope whose sections are not among the repository's nearest matches still gets those sections from the vector pass, because the search is made within the area's candidates (mutation: search the whole repository and drop what lies outside)`, `the vector search given an empty list of ids returns no hits and makes no query; given as many ids as the largest directory of this repository holds it returns the nearest of them, in one query or in batches merged by distance (measured at build and recorded)`
  - Fixtures: `a temporary graph store with a registered repo holding two directories of entities and documents`, `a stand-in data pool with two connections`, `a stand-in for the vector search that records the filter it is given`
- **integration** — The plan walk: a refused scope is a coded failure, and the aggregate task runs on what exists.
  - Subjects: `a runtime that throws each of the three typed scope errors is recorded as failed with that error's code and a message without the 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check)`, `the plan's and the run's tasksFailed carry the code`, `a plan in which one of three producers failed: the aggregate task runs, receives the two outputs that exist and `absentInputs` naming the third with its producer and reason, and the plan has a final report (mutation: skip the aggregate task as before)`, `a plan in which every producer failed: the aggregate task is skipped and the plan has no final report`, `a task other than the aggregate task with a missing input is still skipped`, `a nested plan in which one child task failed: the child's aggregate task runs, the planner-kind task is 'ok', the root has a final report, and the run's answer report names the child's failed task by its path`, `the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent`, `a plan whose aggregate task consumes nothing: it runs with and without a failed task before it, and with one it is given that task as absent with the names it would have produced (mutation: skip an aggregate task that consumes nothing)`
  - Fixtures: `stand-in runtimes registered in the runtime registry, as the walk's existing tests use`, `a stand-in model provider for the aggregator`
- **integration** — A run that stops says where and why, and a record with no live run is abandoned.
  - Subjects: `an error thrown from inside a stage that has no handler: runAnalyze returns a failure with code 'internal-error' at that stage, the record on disk says the same, the 'done' event fires once, and the run is no longer live (mutation: remove the handler)`, `a run is live from before its first record until it returns, and not after it throws`, `the daemon's handler, given a runAnalyze that throws, writes the record as failed and sends the record's stage, not 'classify'`, `a record left 'in-progress' with no live run: the status request returns it rewritten as failed with 'run-abandoned' at its stage, and the file on disk is rewritten (mutation: return the record as read)`, `the same record: purgeRun with liveness supplied purges it without force; purgeRun with no liveness refuses it as today`, `a record 'in-progress' for a run that is live is returned unchanged by the status request and refused by purgeRun`, `starting a run under the id of an abandoned record rewrites the record and runs`, `a completed run asked for again returns its stored result and its report, and no reader changes a record that is 'ok' or 'failed'`, `a writing failure while the walk handles one task fails that task and the walk goes on`, `with a run record that cannot be written, runAnalyze's handler still returns 'internal-error' and fires 'done' once, and the daemon's handler still sends the result frame and the 'done' frame (mutation: let the write's error escape)`, `with a record that cannot be written, the status request still returns the record as 'run-abandoned', and purgeRun with liveness supplied still removes the directory (mutation: let the rewrite's error escape)`, `a docs run whose scope lies in no registered repo, with a readable registry that holds repos, ends at stage 'plan' with 'scope-not-indexed' before the planner is called (mutation: remove the check before planning); a pairing the family's row refuses still ends at stage 'classify' with 'scope-ref-kind-target-mismatch', as today; a generic run is not checked`
  - Fixtures: `run records written through the real store under a temporary run id`, `a seam to make one stage throw`
- **unit** — The run request's prompt rule.
  - Subjects: `an empty prompt with a stated kind of source is accepted and gives an unfocused intent`, `an empty prompt with no stated source is refused with 'invalid-params' and a message that a kind of source must be stated`, `a prompt of only white space is accepted with and without a stated kind of source, as today (mutation: treat white space as empty at the parser)`
- **live** — Runs through the daemon on this repository, recorded with their date in the build record.
  - Subjects: `an infra request and a data request each complete with a final report, as on 2026-10-08`, `a code request returns a final report whose first line names the failed functional-surface tasks, where on 2026-10-08 it returned none`, `a request with an empty prompt and a stated kind of source completes`, `a request sized so that its plan holds a planner-kind task: the child plan runs and its tasks appear by path in the run's answer report; if no size makes the planner emit one on this repository, that is recorded and the nested integration test stands as the proof`, `a docs request, run and recorded but not a proof of ac1: it is expected to stop at the aggregate task with 'Prompt is too long'. This is the accepted exception of 2026-10-08, to be closed by Story s3`
  - Fixtures: `the installed daemon running this Story's code`, `INSRC_LIVE_TESTS=1 and a model provider with quota`
- **smoke** — Nothing that worked stops working.
  - Subjects: `the analyze, mcp, daemon and workflow suites have no test that passed before the Story's first task and fails after its last, other than the tests of the three removed scope functions, which are listed in the contract and replaced by the table test`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a plan in which one of three producers failed has a final report written from the two that exist`, `live: an infra and a data request complete; a code request returns a final report that names its failed tasks; a request with an empty prompt and a stated source completes`, `unit: the table test over families and kinds of scope` |
| `ac2` | `integration: a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path`, `live: a request whose plan holds a planner-kind task` |
| `ac3` | `integration: an uncaught error gives a failed record at the stage reached and a returned failure`, `integration: a record in progress with no live run is rewritten as 'run-abandoned' by the status request and purged without force`, `integration: the daemon's handler writes the record and sends its stage` |
| `ac4` | `integration: a completed run asked for again returns its stored result and report, and no reader changes a record that is 'ok' or 'failed'` |

## 7. Migration

**State before:** From the live runs and direct reads of 2026-10-08 recorded in step s1. A broad infra or data analysis runs to a final report; a broad code analysis returns none, because one failed task makes the aggregate task skip (unmetDependencies in src/analyze/executor/walker.ts) and the run fail with 'executor-aggregator-failed'; a broad docs analysis fails in the aggregate task with 'Prompt is too long'. The plan tasks accept fewer kinds of scope than TARGET_TO_KINDS allows: code and docs accept repo and manifest-dir, infra adds workspace, data accepts no connection, through three copies of one function; five tasks use the scope's value as a repo path without resolving it; a refused scope is a plain Error recorded as 'runtime-threw' with no code. An error nothing catches leaves the run record 'in-progress', and the daemon's handler reports stage 'classify' whatever stage was running. Nothing knows which runs are live; 'run-abandoned' is declared and never raised. The daemon refuses an empty prompt even when the caller states the kind of source.

**State after:** Every plan task takes its scope from one function built on Story s6's resolveScope and accepts exactly its family's row; a refused, unresolved or unindexed scope is a failed task with the existing code for it. The aggregate task runs on the inputs that exist and is told which are absent, so a run with a failed task returns a final report whose first line names what is missing. An uncaught error writes the run record as failed at the stage reached; a record 'in-progress' with no live run is rewritten as 'run-abandoned' by the reader that meets it. A request with no prompt and a stated kind of source runs as an unfocused request. The code tasks' notion of a module and an aggregate input too large for one call are unchanged and belong to other Stories; for the second, a broad docs analysis not completing is an accepted exception until Story s3.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Move the pairing check and resolution into one function beside resolveScope; stepScope calls it, and prepareScope calls it in its run-mode branch only, keeping its mode condition. Their existing tests, with added cases for classification and task mode, are the check. Add the one scope function for plan tasks on top of it in a new file under the shared runtimes, with its table test over the four families and seven kinds. No task calls it yet. Give the indexed check its optional readers. — ↩ rollbackable
2. Add the optional code to the failed-task record and to the entries of tasksFailed, and make the plan walk set it for the three typed scope errors. — ↩ rollbackable
3. Move the infra and data tasks to the scope function and remove their two per-family functions; add the connection case for the data tasks. These two families complete today, so their live runs are the check that nothing moved. Replace the existing tests of the two removed functions. — ↩ rollbackable _(needs: `step 1`, `step 2`)_
4. Move the code and docs tasks to the scope function, remove the code family's function, move the five direct readers of the scope's value, and make each task keep to the area a module, file or symbol scope names. Add the optional area to the argument type each shared document runner shares with its prepare function and to document retrieval's, forwarded where the runner builds prepare's arguments and where prepare calls retrieval, and set by the docs tasks only. Remove the code function's test hook and replace its tests. Give the vector search's filter its optional list of entity ids and have retrieval pass the area's candidates. — ↩ rollbackable _(needs: `step 1`, `step 2`)_
5. Add the absent-inputs argument to the task arguments and the aggregator's arguments, write the absent inputs into the aggregator's prompt after the outputs that exist, and pass the argument through the five aggregate-report runtimes. — ↩ rollbackable
6. Change the plan walk's rule for the aggregate-report task: run it when at least one of its inputs exists, with the absent ones named. From this step a run with a failed task returns a report. — ↩ rollbackable _(needs: `step 5`)_
7. Add the set of live runs and mark a run live for the length of runAnalyze; add the handler for an uncaught error in runAnalyze and the walk's handling of a failure outside a task's runtime. Add the run's one check of its intent's scope before planning. — ↩ rollbackable
8. Apply the abandoned rule in the three readers of a run record (the resume check, the daemon's status request, purgeRun with liveness supplied) and correct the daemon handler's record and stage for an escaped error. Each reader's rewrite is guarded and best effort. — ↩ rollbackable _(needs: `step 7`)_
9. Let the daemon's run request accept an empty prompt when a kind of source is stated, with the new message for the case where none is. — ↩ rollbackable
10. Update the daemon guide: the kinds of scope each family's tasks accept, the code on a failed task, the aggregate task's rule, 'run-abandoned', and the prompt rule. Run the live checks through the installed daemon and record them with their date. — ↩ rollbackable _(needs: `steps 3, 4, 6, 8, 9`)_

**Backward compat:** The daemon's run request accepts a request it used to refuse (the empty string as prompt with a stated source) and refuses none it used to accept: a prompt of only white space is accepted as before, with or without a stated source. A run that used to fail with 'executor-aggregator-failed' because one task failed now succeeds with a final report and a non-empty tasksFailed; a client that treated any failed task as a failed run must read tasksFailed and the answer report, whose first line says the answer is incomplete. The failed-task record and tasksFailed entries gain an optional code; a reader that ignores unknown fields is unaffected, and the IDE's mirrored types need the optional field added. A status request can now return a record rewritten as failed with 'run-abandoned' where it used to return 'in-progress' for a run that no longer exists; the code is already in both lists. purgeRun's behaviour for a caller that passes no liveness is unchanged. Tasks that used to treat an unregistered scope as an empty repository now fail with 'scope-not-indexed'. The message of a refused scope changes from '... not supported yet' to the validator's wording, and its task error loses the 'runtime-threw:' prefix. No stored data changes shape in a way that needs rewriting: run and task records written before the change are read as they are. A docs run on a scope in no registered repo now ends before planning with 'scope-not-indexed'; it used to be planned and to return empty results.

## 8. Alternatives considered

### 8.1 a1: One scope function for plan tasks; the aggregate task runs on what exists; liveness checked when a record is read — **CHOSEN**

Every plan task gets its scope from one function built on Story s6's resolveScope, the aggregate task writes its report from the inputs that exist, and a record in progress with no live run is rewritten as abandoned by whichever reader meets it.

Scope: one function for plan tasks takes the task's or the intent's scope reference and the family's row of allowed kinds, calls Story s6's resolveScope, and returns the resolved scope (registered repo, lookup directory, file, entity, or the connection and its repo). The three per-family copies and the five direct readers of the scope's value call it. A kind outside the family's row raises a typed refusal that carries the existing code 'scope-ref-kind-target-mismatch'; the plan walk recognises it and writes that code on the failed-task record, which gains an optional code field. Aggregate task: the plan walk no longer skips the aggregate-report task when some of its inputs are missing. It runs when at least one of the inputs it consumes exists, is told which inputs are absent and why, and writes the report from the rest; with no input at all it is skipped as today. The run then completes, and the answer report (Story s1) already lists every failed and skipped task as a failed source, so the final report's first line says what it is missing. Run records: runAnalyze and the plan walk catch an error nothing else catches and write the record as failed at the stage reached; the daemon's handler does the same for an error that still escapes and reports the true stage. The daemon keeps an in-memory set of running ids. Each of the three readers of a run record (the resume check, the status request, purgeRun) treats a record that is 'in-progress' whose id is not in the set as abandoned: it rewrites the record as failed with 'run-abandoned' and proceeds on that. Empty prompt: the daemon's run request accepts an empty prompt when the caller states the kind of source, which gives an unfocused run; with no stated source it is refused with a message that says so.

### 8.2 a2: The plan walk resolves the scope once; the run fails with what it found; liveness by a sweep at start-up

The scope is resolved and checked once before any task runs and handed to every task, a run whose aggregate task cannot run still fails but carries the completed tasks and the report, and the daemon marks every in-progress record abandoned when it starts.

Scope: the plan walk resolves the intent's scope once with resolveScope, checks it against the family's row, and passes the resolved scope to every runtime in its arguments; runtimes stop reading the scope themselves. A refused pairing fails the whole plan before any task runs, with 'scope-ref-kind-target-mismatch'. A task whose own parameters name a narrower scope resolves that one through the same function. Aggregate task: the dependency rule is unchanged, so one missing input still skips the aggregate task and the run still fails with 'executor-aggregator-failed'; the failure's data gains the task records that completed and the answer report derived from them, so a caller can read what was found. Run records: the same handlers for an uncaught error as in a1. Liveness: when the daemon starts it reads every run record and rewrites each one that is 'in-progress' as failed with 'run-abandoned', since no run can have survived the restart; the in-memory set covers runs started since. Readers do not check. Empty prompt: as a1.

**Rejected because:** Checks the scope early and keeps runtimes simple, but it keeps the rule that makes a broad code analysis return nothing, which is what the first runs showed to be the stop.

### 8.3 a3: Per-family scope functions with a shared table; aggregate inputs declared optional by the template; liveness by a heartbeat

Each family keeps its own scope function but reads its allowed kinds from the shared table, each aggregate template declares which of its inputs it can do without, and a run record is abandoned when its heartbeat is older than a limit.

Scope: the three per-family functions stay, each rewritten to call resolveScope and to take its allowed kinds from TARGET_TO_KINDS; the five direct readers move to their family's function. A refusal is the typed error with the existing code, as in a1. Aggregate task: each aggregate-report template declares, per input, whether it is required or optional; the plan walk skips the aggregate task only when a required input is missing and otherwise runs it with the absent optional inputs named. Run records: the same handlers for an uncaught error. Liveness: runAnalyze writes a heartbeat time into the run record at every stage and between tasks; a reader treats an 'in-progress' record whose heartbeat is older than a configured limit as abandoned and rewrites it with 'run-abandoned'. Empty prompt: as a1.

**Rejected because:** Workable, but it keeps three scope functions in step by convention, adds a property to every plan template and a timing setting, and its abandonment rule can be wrong in both directions.

## 9. References

- **[[c1]]** `step-output` `s1.analyzeBundles[0]: How far a broad analysis of this repository gets, for each of the four families` — "live runs through the daemon (analyze.run.start), 2026-10-08, after the fix of ISSUE-7a3ab8dc"
- **[[c2]]** `step-output` `s1.analyzeBundles[1]: Why one missing input makes the aggregate task skip and the run fail` — "direct read (not an analyze run)"
- **[[c3]]** `step-output` `s1.analyzeBundles[2]: Which kinds of scope each family's plan tasks accept, and which tasks read the scope's value directly` — "direct read (not an analyze run)"
- **[[c4]]** `step-output` `s1.analyzeBundles[3]: What happens to a run record when a run dies, and who reads run records` — "direct read (not an analyze run)"
- **[[c5]]** `step-output` `s1.analyzeBundles[4]: Where an empty prompt is refused, and what a request without a prompt means further in` — "direct read (not an analyze run)"
- **[[c6]]** `step-output` `s1.analyzeBundles[5]: Existing tests the test strategy extends` — "direct read (not an analyze run)"
- **[[c7]]** `stakeholder` `2026-10-08: split the first broad run's findings in three (option A)` — "go with A"
- **[[c8]]** `prior-artifact` `ISSUE-7a3ab8dc4b9d39ea` — "The plan tree cannot plan through the claude CLI, and a failed model call does not say why"
- **[[c9]]** `prior-artifact` `HLD-b9d5c5c40df5a574` — "Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split."
- **[[c10]]** `stakeholder` `2026-10-08: ac1 for the docs family is an accepted exception on Story s7; it must be addressed later, by Story s3` — "go with B, but this needs to be addressed later"
- **[[c11]]** `prior-artifact` `EXT-b9d5c5c40df5a574-s8` — "The code tasks of a broad analysis work on a repository whose graph has no modules for its directories"

## 10. Open questions

- A nested plan (ac2) was not planned by any live run at size S. If no size makes the planner emit a planner-kind task on this repository, is the integration test over a nested plan, with the real walk and stand-in runtimes, accepted as the proof?
- Starting a run under an id whose run is live in the same process is not designed here: today the second start overwrites the first's record. Should it be refused, and with which code ('run-in-progress' exists only in the daemon's list)?
