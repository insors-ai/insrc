<!-- insrc:artifact LLD-b9d5c5c40df5a574-s2 -->

# LLD: E20261009b9d5c5c4:S002

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

A request's size is no longer picked by a model or defaulted to M. One new module counts what the request touches and maps the counts to the five sizes with one fixed table. On a broad analysis the count is taken from the area the request names, before planning, and it sets how many tasks the plan may have and how deep it may nest. In the lookup pipeline and the agent tools the same count sizes the planning call, and after the lookups have run the request is measured again from what they returned. Every answer states the size and the counts it came from; a request that cannot be counted is treated as the largest size and says so, and a size a caller states is kept as a hint.

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

**Rollout phase:** Phase D — measured sizing
**Owns:** `sc3` (Request measure)
**Consumes:** `sc1` (Completeness record), `sc2` (Answer report), `sc6` (Causes of not proceeding)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Classifying every catch clause in the lookups and the plan-task runtimes: a clause that handles a named, expected condition stays and names what it skipped in the record; a clause that swallows an error is removed or rethrows, so that the lookup becomes the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, added as one more case to the raise site and the mapping that Story s6 owns, and passed through everything that reaches the context builder (six callers, the one-shot agent tool and the daemon's workflow runner, with the error's data carried through the daemon's error mapping). Keeping the report out of the schema given to a model at both places the schema reaches one (the answer-writing call and the tool loop's final answer), and rejecting a report an agent supplies. What the step tool attaches to a bundle the agent wrote. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs. The free-form fallback: an optional field for partial findings on the failed output, the loop's exit at the limit attaching what it gathered, reaching its turn limit becoming a failed output, and its answer gets a report that says it rests on a search directed by a model. Reading the data drivers' cut flag into the completeness record of the table-listing lookup and the object-listing plan task. — owns `sc1`, `sc2`
- `s3`: The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold. This Story closes the exception accepted on Story s7: a broad docs analysis whose aggregate input is larger than one model call accepts must complete once that input is handled in parts. — owns `sc4`
- `s4`: Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content at nine sites: the eight found when the Epic was defined, including the three adherence checks, and the indexer's own cut of a stored body to 8,192 characters (src/indexer/parser/artifact.ts), which Story s1 reports with the item's real length. The index is a pointer: at each of the nine sites, where an item's content matters to the answer, the analyzer reads the item from its file at the place the index points to and does not rely on the body the index stores. What the index stores and how it is built are not changed. The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method. Raising the lookup cache's version again, and dropping limit parameters before a lookup's cache key is taken. Building cancellation (a signal from each caller through the context builder to a check between turns; the run's signal into the plan walk and the classifier; the optional signal on the daemon's standard handlers; the signal parameter on the daemon's context-building functions; a signal on the step tool's plan and narrow phases, through stepPlan and the runner context; the new cancel request for the five requests received over the socket that reach a tool loop (the three context requests, the plan request and the classify request), with the daemon's table of run id to canceller; the cancelled case in the classify stage's mapping; 'aborted' in the daemon's error codes; what a cancelled loop returns), moving the table-listing lookup and the object-listing plan task to the complete mode of the data drivers' listings, and only then removing the turn limit and retiring its configuration setting (catalog row, retired list, the analyzer's configuration, the planning prompt, the VS Code extension's declaration with a release, the pages that document it, the reconcile fixture) for all three users of the loop (the free-form lookup and the classification and task modes) and giving the loop the complete mode of its search tools. Removing the error and the code for reaching the turn limit from both lists and both mappings, with the tests that import the error and the test configuration that sets the limit.
- `s5`: Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses. — owns `sc5`
- `s6`: Giving a request that asks no specific question a run context: what the lookup pipeline plans for it (a broad survey of the area it names, from the lookups that exist) where today it returns at once; the same for a request started with a stated kind of source, which is always marked unfocused; serving, in the lookup pipeline, the four kinds of scope it returns for today (a file, a symbol, a manifest directory, a data connection), and how each resolves to what the lookups need. Replacing the single 'model unavailable' error with the cause of each way of not proceeding, as new codes in the existing list and new typed errors, and with the existing codes where one fits: every place the pipeline returns nothing, and the fall-through for a bundle that fails validation, is listed and given its cause. It owns the place the error is raised, the pipeline's rule for returning nothing, and the functions that map these errors to codes (the plan tree's and the daemon's, and the classify stage's mapping, through which an error from the classifier's context build is routed). The form of a symbol scope's value, its resolution to one stored entity, and the validator and classifier prompt brought in line. The one function that resolves a scope's value to a repo, a path or an entity, and moving the lookup pipeline's direct readers of the value to it (the planning prompt, the context builder's path resolution, the indexed check). Correcting the table of which kind of scope goes with which kind of source, with the classifier prompt's copy of it, the table's comment and the matrix test, and applying it on both classification branches: the plan tree's classify mapping surfaces the validator's inner code, and the branch with no classifier calls the validator's checks directly. Supplying the connection check from both callers of the classifier, and mapping a connection id to its repo. It declares all three new codes in both lists; Stories s1 and s7 raise one each. — owns `sc6`
- `s7`: Widening the plan tasks of each family (code, docs, infra, data) to exactly the kinds of scope the corrected table gives it, with the scope check the docs tasks share with the code tasks taking the family's row as an argument, and every task that reads the scope's value directly (three docs tasks, the shared adherence task, the task that lists data connections) moved to the resolution function Story s6 defines, including a data connection for the data tasks, and refusing any other pairing with the existing code for it. Running a broad analysis through classification, the run context, planning, the plan walk with its nested plans, and the aggregator, to a final report; finding and correcting what stops it at each stage. A stop the run catches is already recorded; what is added is a handler for an error nothing catches, in the plan walk and in the daemon's request, that writes the run record, and the rule that a record still in progress with no live run behind it is abandoned: the process's in-memory count of the runs it is executing per id, and the two readers that apply it, the status request and the purge, each rewriting the record as failed with the code 'run-abandoned', which Story s6 declares and this Story raises; a new run replaces a record left in progress with its own first record. Making a task's refusal of a scope a typed error the plan walk recognises, with an optional code on the failed-task record. Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split. Two stops the first runs of 2026-10-08 found are corrected here as well: the aggregate-report task runs on the inputs that exist when a task before it failed and is told which are absent, so that a run with a failed task returns a report that names what is missing; and the daemon's run request accepts an empty prompt when the caller states the kind of source. Two further stops are not this Story's: what the code tasks treat as a module is Story s8's, and an aggregate input larger than one model call accepts is Story s3's. For the second, a broad docs analysis not completing on a repository of that size is an exception the stakeholder accepted on 2026-10-08, to be closed by Story s3.
- `s8`: Private implementation of s8: The code tasks of a broad analysis work on a repository whose graph has no modules for its directories

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `RequestMeasure`

```typescript
interface RequestMeasure { readonly source: 'lookup-results' | 'named-area' | 'data-source'; readonly items: number; readonly files: number; readonly characters: number | null; readonly size: AnalyzeScope; readonly determined: boolean; readonly sizeHint?: AnalyzeScope | undefined; readonly note?: string | undefined }
```

**Returns:** `RequestMeasure` — The HLD's contract sc3, unchanged, declared in a new module src/analyze/measure.ts and exported from there for Stories s3 and s4. `items` is the entities of a named area, the objects of a data source, or the items the lookups returned. `files` is the distinct files those items lie in (0 for a relational or key-value source). `characters` is the length of the lookup results as they are given to the answer step, and null for the other two sources. `determined` false means no count could be taken: `size` is then 'XL', `items` and `files` are 0, and `note` says why.

**Postconditions:**
- A measure is built only by the functions of src/analyze/measure.ts; `size` is always the result of sizeOfCounts, or 'XL' when `determined` is false.
- `sizeHint` holds what a caller, a slash command or the planner model stated, and never affects `size`.

### 2.2 `RequestMeasure: sizeOfCounts`

```typescript
function sizeOfCounts(counts: { readonly files: number; readonly items: number }): AnalyzeScope
```

**Parameters:**
- `counts: { files: number; items: number }` — The two counts of a measure.

**Returns:** `AnalyzeScope` — The larger of the two sizes the one table gives. Files: 1 or fewer is XS, up to 20 S, up to 200 M, up to 1,500 L, above that XL. Items: up to 50 is XS, up to 500 S, up to 5,000 M, up to 20,000 L, above that XL. The table is one exported constant, SIZE_THRESHOLDS, and nothing else in the analyzer maps a count to a size.

**Errors:**
- `RangeError` when a count is negative or not a whole number

**Postconditions:**
- Pure: the same counts give the same size.
- Raising either count never gives a smaller size.

### 2.3 `RequestMeasure: measureNamedArea`

```typescript
function measureNamedArea(scope: ResolvedScope, entities: readonly Entity[], sizeHint?: AnalyzeScope): RequestMeasure
```

**Parameters:**
- `scope: ResolvedScope` — The request's scope, resolved by the one scope function.
- `entities: readonly Entity[]` — All stored entities of the repo that was read; the function narrows them with the scope's area predicate (inAreaOf), so a module, file or symbol scope counts its own area and not the whole repo.
- `sizeHint: AnalyzeScope` _(optional)_ — A size a caller stated, recorded on the measure.

**Returns:** `RequestMeasure` — source 'named-area'; items = the entities in the area; files = the distinct file paths among them; characters null; determined true.

**Preconditions:**
- The entities are those of graphRepoOf(scope).

**Postconditions:**
- A symbol scope gives items 1 and files 1; a file scope gives files 1.
- Works on what it is given: it reads no store and calls no model.

### 2.4 `RequestMeasure: measureRequestScope`

```typescript
function measureRequestScope(scopeRef: AnalyzeScopeRef, target: AnalyzeTarget, sizeHint?: AnalyzeScope): Promise<RequestMeasure>
```

**Parameters:**
- `scopeRef: AnalyzeScopeRef` — The scope a request names.
- `target: AnalyzeTarget` — The kind of source, which decides how the scope is resolved and what is counted.
- `sizeHint: AnalyzeScope` _(optional)_ — A stated size, recorded as a hint.

**Returns:** `Promise<RequestMeasure>` — The one measuring pass for a request that has run no lookup. It resolves the scope and calls measureResolvedScope. The scope is resolved with resolveTaskScope for a code, docs, infra or data request, and with resolveScopeForTarget(scopeRef, 'generic') for a generic request, which resolveTaskScope does not accept. resolveTaskScope checks the index for a code or docs request and refuses a scope that no registered repo contains, so for those two a workspace that lies above the registered repos is not determined here; the sum over the repos under a workspace is reached by a generic request and by a direct call of measureResolvedScope. Never throws. It catches every rejection of the resolution, not only the scope errors: a scope that cannot be resolved, is of a kind its source refuses, or is not indexed gives determined false, size 'XL' and the scope error's message in `note`; any other rejection (the registry or the store could not be read while a symbol or a connection was being resolved, or while the index was being checked) gives determined false, size 'XL' and a note that names the read that failed.

**Postconditions:**
- Makes no model call.
- A scope the existing checks refuse is still refused where it is refused today; this function only records that it could not be measured.

### 2.5 `RequestMeasure: measureResolvedScope`

```typescript
function measureResolvedScope(scope: ResolvedScope, target: AnalyzeTarget, sizeHint?: AnalyzeScope): Promise<RequestMeasure>
```

**Parameters:**
- `scope: ResolvedScope` — A scope already resolved; the context builder and the free-form lookup hold one and call this directly.
- `target: AnalyzeTarget` — The kind of source, which decides what is counted.
- `sizeHint: AnalyzeScope` _(optional)_ — A stated size, recorded as a hint.

**Returns:** `Promise<RequestMeasure>` — What is counted, by kind of source and kind of scope. CODE and DOCS, and a GENERIC request on a path or an entity (repo, module, manifest directory, file, symbol): the stored entities of the scope's area, by listEntitiesForRepo of the repo that was read and measureNamedArea. This is a count only when a registered repo contains the scope and holds stored entities: when the resolved scope has no repo (`repoPath` is null: no registered repo contains it, or the registry holds none) or the read of that repo returns no entity at all, the measure is determined false, size 'XL', with that reason. An area that holds nothing inside a repo that does hold entities is a count: items 0, files 0, XS. A WORKSPACE is read from its resolved scope, in two cases. When a registered repo contains the workspace path (the resolved scope has a repo), it is counted exactly as a repo, module or manifest directory is: that repo's entities through the area predicate, which keeps the whole repo when the path is the repo and only what lies under the path when it is a directory inside it. This is the scope the agent tools send, a workspace at the path they were given. Only when no registered repo contains the path is it the sum over the registered repos that lie under it (a case a generic request and a direct caller of this function reach; a code or docs request is refused by the index check before it gets here); then it is not determined when none lies under it, or when any one of them is not determined. INFRA (repo, manifest directory, workspace): the files on disk that the infra tasks' own file walk would visit under the scope's directory (walkFiles in src/analyze/runtimes/infra/_shared.ts, with its directory exclusions), walked to the end with no cap: items and files are both that number, source 'named-area'. The stored graph is not used, because the infra tasks do not read it. Not determined when the walk throws because the root cannot be read, and when the walk lists a directory below the root as unreadable, since the count is then of part of the area; the note names what could not be read. This is the stakeholder's decision of 2026-10-09. DATA with a connection scope, and a GENERIC request with a connection scope: measureDataSource. DATA with a repo, workspace or manifest directory: the sum of measureDataSource over the connections registered there; not determined when any one of them is not; items 0 and XS when none is registered. Never throws: a failed read of the store, of the disk or of a source gives determined false, size 'XL' and the reason.

**Preconditions:**
- The scope was resolved for this target.

**Postconditions:**
- Makes no model call.
- Reads a repo's entities once per repo, one repo after another.
- No request is given a size below XL on a count of zero taken from a path the index does not hold.

### 2.6 `RequestMeasure: measureDataSource`

```typescript
function measureDataSource(scope: DataScope, sizeHint?: AnalyzeScope): Promise<RequestMeasure>
```

**Parameters:**
- `scope: DataScope` — A pool path and ONE connection id. resolveDataScope cannot supply it here: it takes a plan task's arguments and resolves the scope itself. So the rule it applies is split out of it into a pure function, dataScopeOf(scope: ResolvedScope): DataScope, in src/analyze/runtimes/data/_shared.ts, which resolveDataScope then calls and the measuring pass calls with the resolved scope it holds. The rule is unchanged: for a connection scope the pool path is the scope's lookup path (the repo that declares the connection) and the connection id is the scope's; for a repo, workspace or manifest directory the pool path is the scope's OWN path, not the containing repo's, and there is no connection id.
- `sizeHint: AnalyzeScope` _(optional)_ — A stated size, recorded as a hint.

**Returns:** `Promise<RequestMeasure>` — source 'data-source'. A relational source: items = the tables listTables returns in its complete mode. A MongoDB, Cassandra, DynamoDB or NATS source: items = the namespaces listNamespaces returns in its complete mode. A file source: items and files = the files listFilesForConnection returns with no limit. The size is sizeOfCounts with the object count compared against the FILES column of the table (a table or a collection is the unit a data analysis reads, as a file is for code), and items 0 for the other column. determined false, size 'XL', with the reason in `note`, when: the driver has no listing; the listing says it is not supported; the listing reports `truncated`; the source is Redis or etcd, whose listing is a sample of keys; the source cannot be reached; the listing throws, as ClickHouse's does.

**Postconditions:**
- Never starts a scan of a live store's keys.
- A listing that reports it was cut is never a determined count.
- For a data request on a repo, workspace or manifest directory, measureResolvedScope lists the connections of the pool at that path and calls measureDataSource once per connection id, one after another, each with `connectionId` set; it never passes a scope with no connection id.

### 2.7 `listTables`

```typescript
listTables?(opts?: { readonly schema?: string; readonly limit?: number; readonly complete?: boolean }): Promise<TableListing>
```

**Parameters:**
- `opts.complete: boolean` _(optional)_ — New. When true the driver returns every table and `limit` is ignored. Absent or false: exactly today's behaviour.

**Returns:** `Promise<TableListing>` — As today. In the complete mode `truncated` is false unless the driver itself could not read to the end.

**Postconditions:**
- What the complete mode changes, per driver. sqlite, pg and mysql: the limit comes from clampListLimit and is passed to the query; in the complete mode the clamp is not applied and the query carries no limit. oracle and mssql: the limit is part of the query text (oracle's `FETCH FIRST ... ROWS ONLY` after clampOracleListLimit, mssql's `SELECT TOP ...` after clampMssqlListLimit); in the complete mode the query is built without that clause. ClickHouse declares a table listing that always throws ('not yet implemented'); it gets no complete mode, and a ClickHouse source is not determined, through the failed-listing case, on purpose.
- Every existing caller, which passes no `complete`, gets what it gets today.

### 2.8 `listNamespaces`

```typescript
listNamespaces?(opts?: { readonly limit?: number; readonly complete?: boolean }): Promise<KvNamespaceList>
```

**Parameters:**
- `opts.complete: boolean` _(optional)_ — New. When true the MongoDB, Cassandra, DynamoDB and NATS drivers apply no limit. The Redis and etcd drivers ignore it: their listing stays a sample and says so.

**Returns:** `Promise<KvNamespaceList>` — As today.

**Postconditions:**
- Every existing caller gets what it gets today.

### 2.9 `listFilesForConnection`

```typescript
function listFilesForConnection(connectionPath: string, opts: { readonly recursive?: boolean; readonly pattern?: string; readonly limit?: number }): Promise<ListFilesResult>
```

**Parameters:**
- `opts.limit: number` _(optional)_ — Becomes optional. Absent: the walk goes to the end and `truncated` is false. Present: exactly today's behaviour.

**Returns:** `Promise<ListFilesResult>` — As today.

**Postconditions:**
- Every existing caller passes a limit and is unchanged.

### 2.10 `RequestMeasure: measureLookupResults`

```typescript
function measureLookupResults(results: readonly ExecutedExploration[], sizeHint?: AnalyzeScope): RequestMeasure
```

**Parameters:**
- `results: readonly ExecutedExploration[]` — The lookups of an executed plan, with their outputs.
- `sizeHint: AnalyzeScope` _(optional)_ — A stated size, recorded as a hint.

**Returns:** `RequestMeasure` — source 'lookup-results'. items = the sum of `completeness.returned` over the outputs that carry a completeness record. files = the number of distinct file paths the outputs name, taken through one new function, filesNamedBy(output: ExplorationOutput): readonly string[], declared beside the output types in src/analyze/explore/types.ts. It has one case per member of the ExplorationOutput union, selected by the output's `type`, written as a switch with no default so that the compiler refuses a new output type that does not say which files it names. Each case returns the values of that type's own path fields (the union's types carry them under `file`, `files` and `path`, at the top level or on each item of a list); an output type with no such field (the connection list, the table list and the table description, which name data objects and not files) returns none, and so do the failed and unsupported outputs. A path is counted once however many outputs name it. characters = the length of the outputs as they are serialised for the answer step. size = sizeOfCounts(files, items). When no output carries a completeness record (every lookup failed or is unsupported) the measure is determined false, size 'XL', with that reason.

**Postconditions:**
- Pure. A failed or unsupported lookup adds nothing to the counts.
- `characters` is recorded for Story s3 and does not take part in the size in this Story.
- filesNamedBy is the only place that knows which field of which output is a file path; the measure reads no output field itself.

### 2.11 `runAnalyze`

```typescript
unchanged: function runAnalyze(args: RunAnalyzeArgs): Promise<RunResult>
```

**Parameters:**
- `args.scopeHint: AnalyzeScope` _(optional)_ — Kept. It is no longer taken as the size: it is passed to the measuring pass as the hint.

**Returns:** `Promise<RunResult>` — As today, with the measure on the classified event, in the run record and in the final report's answer report.

**Postconditions:**
- After either classification branch, and before the run context is built, the driver calls measureRequestScope(intent.scopeRef, intent.target, args.scopeHint) and sets the intent's `scope` to the measure's size. The 'scope-picker' substep event becomes a 'measure' substep.
- No model call picks a size: the call to pickScope and its fallback to M are removed.
- The `classified` event and the run record gain an optional `measure` field.

### 2.12 `pickScope`

```typescript
removed
```

**Returns:** `none` — Removed with everything that names it: src/analyze/classifier/scope-picker.ts with its three error classes and its test hook; its prompt src/prompts/analyze/scope-picker.system.md; its export from src/analyze/classifier/index.ts; its role row `analyze.scope.pick` in src/config/role-taxonomy.ts; its entry in the boot validator's prompt list (src/analyze/context/boot-validator.ts); the comment that names it in src/analyze/context/driver.ts; the two tests that import its classes, src/analyze/__tests__/model-schemas-draft-2020.test.ts and src/analyze/context/__tests__/model-failure-callers.test.ts, which lose those cases; and the other tests that list prompts or roles. The role is also a setting a user can have stored and that the VS Code extension declares: `insrc.models.tasks.analyze.scope.pick` in vscode-plugin/package.json. That declaration is removed in the same change, with the extension's per-role tests under vscode-plugin/src/config/__tests__ and a release of the extension; and a value a user has stored for the role is dropped by the reconcile. The list of retired settings (RETIRED_PATHS in src/config/config-catalog.ts) cannot name it: the reconcile splits a retired path on every dot, and a per-role value is stored under a key that itself contains dots, `models.tasks["analyze.scope.pick"]`, and again per repo under `models.byRepo.<repo>.tasks`. So the catalog gains a second list, RETIRED_ROLE_IDS, holding `analyze.scope.pick`, and the reconcile's prune removes each listed role id from `models.tasks` and from the `tasks` of every entry of `models.byRepo`, and reports it as pruned like a retired path. The check that a retired setting is not also a live one (assertRetiredDisjoint) is extended to assert that no retired role id is in the role taxonomy.

**Postconditions:**
- Nothing in the analyzer calls a model to choose a size.

### 2.13 `classify`

```typescript
function classify(args: ClassifyDriverArgs): Promise<UnsizedIntent>   // type UnsizedIntent = Omit<ClassifiedIntent, 'scope'>
```

**Returns:** `Promise<UnsizedIntent>` — The classifier's output loses `scope`, at every place that names it: the schema's properties and required list (src/analyze/classifier/schema.ts); the classifier prompt (src/prompts/analyze/classify.system.md); and the classifier's driver (src/analyze/classifier/driver.ts), where the user message of every call is built in code and ends with a sentence that lists the required fields, `scope` among them, where the structured call is typed with the full intent, where a log line reads the size, and where the result is returned: the sentence drops the field, the call and the return are typed UnsizedIntent, and the log line drops it. The validator has no check of the size (every `scope` it reads is the scope reference); its parameter type becomes UnsizedIntent, and the placeholder size 'M' that the plan tree's driver gives it for a request with a stated kind of source (hintedIntentBase in src/analyze/orchestrator/driver.ts) is removed. ClassifiedIntent itself is unchanged and keeps `scope`.

**Postconditions:**
- A classifier answer that still carries a `scope` is rejected by the schema, as any unknown field is.
- The daemon's classify request returns the classifier's result with a measured size added, so its response keeps the field.
- No message sent to the classifier model asks for a size.

### 2.14 `extractChildIntent`

```typescript
unchanged: function extractChildIntent(task: PlannedTask): ClassifiedIntent | null
```

**Returns:** `ClassifiedIntent | null` — As today. Its caller in src/analyze/planner/recursive.ts changes: when a child plan is spawned the child's intent is measured with measureRequestScope(childIntent.scopeRef, childIntent.target, childIntent.scope), its `scope` is set to the measure's size, and the planner model's figure is the measure's hint.

**Postconditions:**
- A child plan's task band is that of its measured size.
- The depth cap is still taken from the root's size, as today (`rootScope`), which is a measured size: the recursive planner passes the root's measured size down unchanged.

### 2.15 `reportFromLookups`

```typescript
function reportFromLookups(results: readonly ExecutedExploration[], measure?: RequestMeasure): AnswerReport
```

**Parameters:**
- `measure: RequestMeasure` _(optional)_ — New, optional. When given it becomes the report's `measure`.

**Returns:** `AnswerReport` — As today, with `measure` filled. The report's `measure` field is typed RequestMeasure in src/analyze/completeness.ts, where it is `unknown` today; isAnswerReport accepts a report with or without it.

**Postconditions:**
- A report built without a measure is exactly today's.
- All three callers pass the measure from lookup results: the context builder (src/analyze/context/driver.ts), the step tool's bundle phase (src/mcp/analyze-step/phases/bundle.ts) and the step tool's answer turn (src/mcp/analyze-step/answer-turn.ts), each with measureLookupResults over the executed results it already holds.

### 2.16 `renderCompletenessLine`

```typescript
unchanged: function renderCompletenessLine(report: AnswerReport): string
```

**Returns:** `string` — Unchanged. A new function beside it, renderMeasureLine(measure: RequestMeasure): string, gives one line. The head of an answer is written through two functions today, renderCompletenessLine and completenessHeadLine (which returns the completeness line when there is a report); both get the measure through one new function, renderReportHead(report: AnswerReport): string, which is the completeness line and, when the report has a measure, the measure line under it. completenessHeadLine returns renderReportHead for a report, and the direct callers of renderCompletenessLine that write the head of an answer call renderReportHead in its place. The writers, all of which then carry the measure line: assembleMarkdown in src/analyze/context/bundle.ts (through completenessHeadLine; its text goes into the classifier's and planner's prompts, and the measure line goes with it, since it is one line of fact about the run context); the two writers in src/mcp/bundle-md.ts (one through completenessHeadLine, one direct); src/mcp/analyze-step/answer-turn.ts; the two writers in src/daemon/workflow-rpc.ts; and the plan tree's final report in src/analyze/orchestrator/driver.ts (headFinalReport).

**Postconditions:**
- The line states the size, the source of the measure and the counts: for example 'Size: L, measured from the area the request names: 1,204 files, 18,330 entities.'; for lookup results it also gives the characters; when not determined: 'Size: XL, not determined: <note>.'; a hint is added as 'The caller asked for S.'
- On the plan tree the report is built by mergeAnswerReports, which returns the completeness part and the answer failure only and so carries no measure. The driver adds the run's named-area measure to the merged report after the merge and before the final report's head is written and the run is completed, so the stored report and the head line both carry it. A resumed run returns the stored text and report as they were written.

### 2.17 `walkFiles`

```typescript
function walkFiles(root: string, cap?: number | null): Promise<{ files: readonly WalkedFile[]; truncated: boolean; unreadable: readonly SkippedItem[] }>   // today: cap: number = DEFAULT_FILE_CAP
```

**Parameters:**
- `cap: number | null` _(optional)_ — Unchanged default. New: null means no cap, the walk goes to the end and `truncated` is false. Only the measure passes null.

**Returns:** `Promise<{ files: readonly WalkedFile[]; truncated: boolean; unreadable: readonly SkippedItem[] }>` — As today: the result's shape is unchanged, a directory below the root that cannot be read is listed in `unreadable`, and a root that cannot be read throws. The one change is that the cap can be switched off.

**Postconditions:**
- Every existing caller, which passes a number or nothing, gets what it gets today, including the cap that Story s4 removes for them.

## 3. Data model changes

### 3.1 `RequestMeasure (new module src/analyze/measure.ts)` — new

The HLD's sc3 type, the SIZE_THRESHOLDS table, sizeOfCounts, measureNamedArea, measureRequestScope, measureDataSource, measureLookupResults and the type UnsizedIntent. The module imports the scope function (src/analyze/runtimes/shared/task-scope.ts), the entity reader (src/db/entities.ts) and the data scope and pool the data tasks use (src/analyze/runtimes/data/_shared.ts); it is imported by the plan tree's driver, the recursive planner, the context builder, the step tool, the answer report and the daemon's handlers. One function lives outside the module, beside the lookup output types: filesNamedBy, which returns the file paths an output names, one case per output type. A second function is split out for it in the data tasks' shared module: dataScopeOf, the pure rule from a resolved scope to a pool path and a connection id, which resolveDataScope also calls.

```
export const SIZE_THRESHOLDS = { files: [1, 20, 200, 1500], items: [50, 500, 5000, 20000] } as const; // upper bounds of XS, S, M, L
```

**Call sites:**
- `src/analyze/orchestrator/driver.ts`
- `src/analyze/planner/recursive.ts`
- `src/analyze/context/driver.ts`
- `src/mcp/analyze-step/phases/start.ts`
- `src/analyze/explore/answer-report.ts`
- `src/analyze/explore/types.ts`
- `src/analyze/runtimes/data/_shared.ts`

### 3.2 `ClassifiedIntent.scope` — invariant-change

The field stays on the type and on stored intents. Its meaning changes: it is always a measured size, written by the measuring pass (plan tree, child plans, daemon requests) or by the context builder (lookup pipeline), and never by a model or a default. The classifier's own output type is UnsizedIntent.

**Call sites:**
- `src/analyze/classifier/schema.ts`
- `src/analyze/orchestrator/driver.ts`
- `src/analyze/planner/recursive.ts`
- `src/analyze/planner/driver.ts`
- `src/analyze/planner/validate.ts`
- `src/analyze/context/decomposer.ts`
- `src/analyze/classifier/driver.ts`
- `src/analyze/classifier/validate.ts`
- `src/prompts/analyze/classify.system.md`

### 3.3 `The context builder's inputs (the lookup pipeline)` — field-add

The builder becomes the one writer of the size in the lookup pipeline. Its inputs take the intent as UnsizedIntent (an incoming `scope` is not read) and gain an optional `sizeHint`. After it resolves the scope, which it already does once for every mode, it takes the named-area measure with measureResolvedScope and gives the planning call an intent with that size. After the plan has been executed it takes measureLookupResults, gives the answer step an intent with that size, and passes the measure to reportFromLookups. The four places that set M today pass no size: the one-shot tool and the step tool pass the caller's optional `scope` input as `sizeHint`; the daemon's workflow runner passes none. The step tool does not go through the builder's driver: its start phase takes the named-area measure for the planning prompt, and its bundle phase and its answer turn take measureLookupResults for the report. Each of its phases is a separate call that carries only its state token, and the caller's stated size is given at the start phase alone, so the token's payload (StepStatePayload in src/mcp/analyze-step/state.ts) gains an optional `sizeHint`, set at the start phase and passed to measureLookupResults at the bundle phase and the answer turn. The field is optional, so a token minted before the change still decodes, and the state's version is not raised. The free-form lookup receives no intent: runFreeformProbe is given the lookup and an ExplorationRunnerContext, which holds the run id, the repo path, an optional resolved scope and the readers, and no size. So the runner context gains one optional field, `requestSize?: AnalyzeScope` (src/analyze/explore/types.ts), set at the three places the executor builds a context (src/analyze/explore/executor.ts) from a new optional argument of the executor's entry points, which the context builder and the step tool's plan and narrow phases (through stepPlan) fill with the request's named-area size. When a caller supplies none, the free-form lookup measures for itself, so its inner intent never takes a default: with a resolved scope in its context, by measureResolvedScope; with none (a caller that executes a plan on a bare repo path, for which the lookup today builds a scope with no repo), by measureRequestScope on a repo scope at the context's repo path, so that the scope function finds the registered repo and the count is real. It does not measure the scope it builds without a repo, which would always read as not indexed. The builder's cache key is taken, as today, over its inputs before the scope is resolved; after the change the intent's `scope` and the `sizeHint` are left out of what is hashed. The size is a function of the scope, which is in the key, and of the index, whose state already invalidates the cache, so two callers that state different sizes, or none, share one cached bundle, as the plan tree's run and the daemon's plan request do today. A cached bundle's report keeps its measure; the hint on it is set from the current call.

**Call sites:**
- `src/analyze/context/driver.ts`
- `src/mcp/analyze-step/phases/start.ts`
- `src/mcp/server.ts`
- `src/daemon/workflow-rpc.ts`
- `src/analyze/explore/freeform-probe.ts`
- `src/analyze/context/decomposer.ts`
- `src/analyze/explore/types.ts`
- `src/analyze/explore/executor.ts`
- `src/mcp/analyze-step/phases/plan.ts`
- `src/mcp/analyze-step/phases/narrow.ts`
- `src/mcp/analyze-step/phases/bundle.ts`
- `src/mcp/analyze-step/answer-turn.ts`
- `src/mcp/analyze-step/state.ts`

### 3.4 `AnswerReport.measure` — field-modify

Typed RequestMeasure (it is `unknown` today). Filled on both paths: in the lookup pipeline with the measure from lookup results, passed to reportFromLookups; on the plan tree with the named-area measure of the run, set by the driver on the merged report after mergeAnswerReports, which does not carry a measure. A report stored before the change has no measure and is read as it is.

```
readonly measure?: RequestMeasure | undefined;
```

**Call sites:**
- `src/analyze/completeness.ts`
- `src/analyze/explore/answer-report.ts`
- `src/analyze/context/driver.ts`
- `src/analyze/orchestrator/driver.ts`
- `src/analyze/orchestrator/types.ts`
- `src/analyze/context/bundle.ts`
- `src/mcp/bundle-md.ts`
- `src/mcp/analyze-step/answer-turn.ts`
- `src/daemon/workflow-rpc.ts`
- `src/mcp/analyze-step/phases/bundle.ts`

### 3.5 `The plan tree's classified event and run record` — field-add

Both gain an optional `measure: RequestMeasure`. A record written before the change has none.

**Call sites:**
- `src/analyze/orchestrator/types.ts`
- `src/analyze/orchestrator/driver.ts`

### 3.6 `The daemon's requests that carry a size` — invariant-change

The run request's `scopeHint` and the size on the plan request's intent are kept in the request shapes and become hints: the handler measures the intent's scope and uses the measured size for the task band. The depth cap keeps its rule, the root's size. On the plan request, at `currentDepth` 0 (or absent) the intent IS the root: the measured size is used for the depth cap as well and a `rootScope` in the request is a hint. At a greater depth the intent is a child's: the caller's `rootScope` is kept for the depth cap, as today, because it is the root's size handed down by whoever planned the root, like `parentTaskPath` and `currentDepth` beside it; when it is absent the child's measured size is used. No request shape changes.

**Call sites:**
- `src/daemon/analyze-rpc.ts`

### 3.7 `Data listings (TableListing, KvNamespaceList, ListFilesOpts)` — field-add

An optional `complete` on the options of listTables and listNamespaces, and `limit` made optional on the file listing. The result types are unchanged; `truncated` keeps its meaning.

**Call sites:**
- `src/shared/db-driver.ts`
- `src/daemon/db/drivers/sqlite.ts`
- `src/daemon/db/list-files.ts`

### 3.8 `The configuration catalog's retired settings` — field-add

A new exported list, RETIRED_ROLE_IDS, beside RETIRED_PATHS, for a role that no longer exists: the reconcile prunes each id from `models.tasks` and from `models.byRepo.<repo>.tasks`, where a per-role value is stored under the role id as one key. RETIRED_PATHS and its dot-split matching are unchanged.

```
export const RETIRED_ROLE_IDS: readonly string[] = ['analyze.scope.pick'];
```

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/reconcile.ts`
- `src/config/role-taxonomy.ts`
- `vscode-plugin/package.json`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | The type is declared as the HLD sketches it, with no field added or removed. This Story adds the one table from counts to sizes and the functions that build a measure; Stories s3 and s4 import the type and read `size`, the counts and `characters`. |
| `sc1` | consumes | measureLookupResults reads `completeness.returned` of each lookup output for the item count and counts only outputs that carry a record. measureDataSource reads the listings' existing `truncated` flag: a cut listing is never a determined count. Nothing in the record is changed. |
| `sc2` | consumes | Fills the report's `measure` field, which Story s1 declared for this Story, and types it. The measure line is written under the completeness line at the places that write that line today; the layout of the report inside each answer form stays Story s5's. |
| `sc6` | consumes | No code is added or raised. A request that cannot be measured proceeds as XL; a scope the existing checks refuse keeps its existing code at the place it is refused today. |

## 5. Error paths

**Error cases**

- **The scope a request names cannot be resolved, is of a kind its source refuses, or lies in a repo that is not indexed.** (recoverable)
  - Detection: measureRequestScope catches the three scope error classes thrown by resolveTaskScope (it recognises them with the one mapping, scopeErrorMapping).
  - Response: It returns a measure with determined false, size 'XL' and the error's message as the note; it does not fail the request. The existing check after the run context is built still refuses the run with the scope error's own code, as today; in the lookup pipeline the builder's existing scope checks still refuse it.
  - User impact: Unchanged where a request is refused today. Where it is not refused, the answer says the size could not be determined and why.
- **The registry or the store cannot be read while a scope is being resolved: a symbol or a connection scope reads the registry and the file's entities with no guard of their own, and the index check reads the repo's entities.** (recoverable)
  - Detection: The resolution rejects with an error that is none of the three scope error classes; measureRequestScope wraps the whole resolution, and the one mapping returns nothing for it.
  - Response: determined false, size 'XL', with a note that names the read that failed. The error does not leave the measuring pass; whatever resolves the scope next, outside it, fails or succeeds on its own terms.
  - User impact: The measuring pass never stops a request; the answer, if one is produced, says why the size was not determined.
- **The scope resolves, but no registered repo contains it, or the repo that was read holds no stored entity (a path the index does not hold). The scope checks do not refuse this for an infra or data request, nor for a code or docs request when the registry holds no repo.** (recoverable)
  - Detection: measureResolvedScope tests the resolved scope's `repoPath` for null, and tests whether the read of the repo returned any entity at all, before it counts the area.
  - Response: For a code, docs or generic request: determined false, size 'XL', note that the index holds nothing for the path. It does not return a count of zero.
  - User impact: A request on a path that is not indexed is never sized XS; the answer says its size was not determined and why.
- **An infra request's directory, or a directory below it, cannot be read while its files are counted (it does not exist, or permission is denied).** (recoverable)
  - Detection: walkFiles throws for a root it cannot read, and returns the directories below the root it could not read in `unreadable`; measureResolvedScope catches the first and tests the second.
  - Response: determined false, size 'XL', note with the path and the reason. A count that leaves out an unreadable directory is put in the note, never in `items`.
  - User impact: The answer says the infra request could not be sized.
- **Reading a repo's stored entities fails while the area is being counted (the graph store is closed or unreadable).** (recoverable)
  - Detection: listEntitiesForRepo rejects; measureRequestScope catches the rejection around that one read.
  - Response: A measure with determined false, size 'XL' and a note naming the failed read. The request proceeds; whatever reads the store next fails or succeeds on its own terms.
  - User impact: The answer, if one is produced, says the size was not determined because the stored graph could not be read.
- **A data connection cannot be reached, or acquiring it from the pool fails, when its objects are counted.** (recoverable)
  - Detection: The pool's acquire or the driver's listing call rejects inside measureDataSource.
  - Response: determined false, size 'XL', note with the driver's message. The connection is released if it was acquired.
  - User impact: The request runs as the largest size and the answer says the source could not be reached for counting.
- **A data driver has no listing (the method is absent, or it answers that listing is not supported), or the source is Redis or etcd.** (recoverable)
  - Detection: measureDataSource tests for the optional method, reads `supported` on a namespace listing, and tests the connection's driver kind against the two kinds whose listing is a sample.
  - Response: determined false, size 'XL', note saying which: no listing, listing not supported, or 'the source has no namespaces to count; its listing is a sample of keys'.
  - User impact: The answer states that the source cannot be counted, not that it is small.
- **A listing called in its complete mode still reports that it was cut.** (recoverable)
  - Detection: The `truncated` flag on the listing's result is true.
  - Response: determined false, size 'XL', note that the listing was cut at the number of objects returned. The partial count is put in the note, never in `items`.
  - User impact: A cut count is never presented as the size of the source.
- **Every lookup of an executed plan failed or is unsupported.** (recoverable)
  - Detection: measureLookupResults finds no output that carries a completeness record.
  - Response: determined false, size 'XL', note that no lookup returned a result to count. The answer report's completeness already names the failed lookups.
  - User impact: The answer says both that the lookups failed and that the size could not be determined.
- **sizeOfCounts is given a negative count or one that is not a whole number.** (terminal)
  - Detection: It tests both counts before reading the table.
  - Response: It throws RangeError naming the count. This is a programming error in a caller of the module, not a condition of a request.
  - User impact: None in a correct build; a test fails.
- **A classifier answer still carries a `scope` field (a model that follows the old prompt).** (recoverable)
  - Detection: The classifier's output schema no longer has the property and rejects unknown fields, so the structured call's validation fails.
  - Response: The existing corrective retry of the structured call applies; if it does not recover, the classifier's existing schema error and its existing code are raised.
  - User impact: As for any malformed classifier answer today.
- **The measuring pass of a child plan cannot count the area the planner model named.** (recoverable)
  - Detection: measureRequestScope returns determined false for the child's scope.
  - Response: The child plan is planned as XL, with the measure recorded for it; the planner model's figure is kept as the hint and is not used as a fallback.
  - User impact: A child plan is never sized from the model's figure.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo scope on a repository with no stored entity of kind 'file' but with other entities. | files is the number of distinct file paths among the area's entities, so the count does not depend on a parser emitting file entities. |
| A module scope on a directory that holds one file with 6,000 stored entities. | files 1 gives XS and items 6,000 gives L; the larger wins: L. |
| A file scope on a file of documents with 3 stored sections. | files 1, items 3: XS. |
| A symbol scope. | items 1, files 1: XS, determined true. |
| A scope whose area holds nothing (an empty directory inside an indexed repo). | items 0, files 0: XS, determined true, because the repo that contains it does hold stored entities. An empty area inside an indexed repo is a count; a path the index does not hold is not (see the error case). |
| A generic request with a workspace scope that no registered repo contains and that holds three registered repos; and the same scope on a code request. | Generic: the counts are the sums over the three, each repo read once, one after another. Code: the index check refuses a scope no registered repo contains, so the measure is not determined, size 'XL', with that reason. |
| A workspace scope under which no registered repo lies. | determined false, size 'XL', note that no registered repository lies under the workspace. |
| A caller states size S for a request whose area measures L. | size 'L', sizeHint 'S'; the plan's bands and depth are L's and the answer says the caller asked for S. |
| A caller states size XL for a request whose area measures XS. | size 'XS', sizeHint 'XL': the hint does not raise the size either. |
| Two requests with the same prompt, one scoped to a small directory and one to the whole repo. | Two different sizes, each from its own counts. |
| A focused request on the plan tree. | Measured twice: from its named area for the plan's bands and depth, and inside its run context from its lookup results for that step's answer. The run's final report carries the named-area measure. |
| A data request that names a repo with two registered connections, one relational with 40 tables and one Redis. | determined false, size 'XL': a sum that includes a source that cannot be counted is not a determined count. The note names the Redis connection and gives the 40 counted for the other. |
| A data request that names a repo with no registered connection. | items 0, files 0: XS, determined true. |
| A relational source with 12,000 tables, listed in the complete mode. | All 12,000 are counted; against the files column that is XL, determined true. |
| The lookups of a plan return 0 items and none failed. | items 0, files 0, characters as serialised: XS, determined true. |
| A lookup output whose completeness record says it was limited. | Its `returned` count is used as it is; the measure counts what was returned, and the report's completeness already says the result was limited. |
| A run record or an answer report stored before this change. | It has no measure and is read as it is; nothing requires one. |
| The daemon's plan request at depth 0 with an intent whose size is M and a rootScope of L, for an area that measures S; and the same request at depth 2 for a child area that measures XS. | At depth 0 the plan is built with size S for both the band and the depth, and M and L are hints. At depth 2 the band is XS's and the depth cap is L's, the root's size the caller handed down. |
| An infra request on a manifest directory in no registered repo, holding 340 files the walk visits. | items 340, files 340, source 'named-area': L, determined true. The graph is not consulted. |
| An infra request on a repository with 12,000 files the walk visits, more than the cap the infra tasks apply today. | All 12,000 are counted, with no cap: XL, determined true. |
| A generic request with a repo scope, and one with a connection scope. | The first is counted from the stored graph like a code request; the second from the live source like a data request. |
| A free-form lookup run by a caller that supplies no request size, once with a resolved scope in its context and once on a bare repo path of an indexed repo. | It measures for itself and uses that size, never a default: from its resolved scope in the first case, and from a repo scope at the repo path in the second, where the measure is determined and is not XL for want of a repo. |
| The plan tree's run and the daemon's plan request build the run context for the same request, one passing a measured size and the other a caller's size and a hint. | Both read the same cached bundle: the size and the hint are not part of the cache key. |
| The agent tools' scope: a workspace at a directory inside a registered, indexed repo, and one at the repo's own path. | Both are counted from that repo's stored entities through the area predicate: the first only what lies under the directory, the second the whole repo. Neither is 'no registered repo lies under it'. |
| A direct call of measureResolvedScope with a workspace at a directory that no registered repo contains and that holds two registered repos. | The sum over the two, each read once. |
| A caller of the step tool states size S at the start phase; the request's lookups measure M. | The report written at the bundle phase and at the answer turn has size 'M' and sizeHint 'S', carried in the state token; the measure line says the caller asked for S. |
| A step-tool state token minted before the change, with no size hint. | It decodes; the measure carries no hint. |
| Lookup results that name the same file from three lookups, and a table listing beside them. | The file is counted once; the table listing adds its returned count to the items and no file. |

**Invariants to preserve**

- The five size names and what each governs are unchanged: the task bands of SCOPE_BAND and the depth caps of models.maxPlanDepth are read exactly as today, from the intent's size and the root's size. (s1 bundle 'What the size governs on the plan tree' (src/analyze/planner/validate.ts, src/analyze/planner/driver.ts, src/analyze/planner/recursive.ts)) [[c1]]
- A scope is resolved through the one scope function and counted through its area predicate; no reader of the scope's value is added. (s1 bundle 'What can be counted for each kind of scope' (src/analyze/runtimes/shared/task-scope.ts)) [[c2]]
- A request that is refused today for its scope is still refused, at the same place and with the same code. (s1 bundle 'Where the plan tree fixes a request's size today' (src/analyze/orchestrator/driver.ts)) [[c3]]
- Every existing caller of the data listings gets what it gets today: the limited mode is the default and its limits are unchanged. (s1 bundle 'What can be counted for each kind of scope' (src/daemon/db/drivers/sqlite.ts, src/daemon/db/list-files.ts, src/shared/db-driver.ts)) [[c4]]
- The answer report's completeness part and the completeness line are unchanged; a report with no measure is exactly today's. (s1 bundle 'Where the measure goes in the answer report' (src/analyze/completeness.ts, src/analyze/explore/answer-report.ts)) [[c5]]
- Calls that reach a model are made one after another; the measuring pass makes none, and reads repos one after another. (s1 bundle 'Where the plan tree fixes a request's size today' (src/analyze/classifier/scope-picker.ts reads per repo sequentially)) [[c6]]
- The intent keeps its fields, so every stored intent and every reader of `intent.scope` stays valid. (s1 bundle 'Where the lookup pipeline and the agent tools assume a size' (src/analyze/context/decomposer.ts, src/prompts/analyze/code.system.md)) [[c7]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run with `npx tsx --test` under Node 22; tests live beside the code in `__tests__` directories`

**Test levels**

- **unit** — The table and the pure measuring functions, on entities and outputs given to them.
  - Subjects: `sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes)`, `measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given)`, `measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file'`, `measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings)`, `measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record`, `every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger)`, `renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given`, `the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field`, `a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default)`, `filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union`
  - Fixtures: `hand-built entities with repo, file, kind and id`, `hand-built lookup outputs with and without a completeness record`
- **integration** — The measuring pass against a temporary graph store and stand-in data drivers, and its effect on the plan tree, the lookup pipeline and the report.
  - Subjects: `measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope)`, `measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold)`, `a workspace that a registered repo contains is counted through the area predicate (the whole repo at the repo's path, only what lies under a directory inside it); a workspace that no repo contains is summed over the registered repos under it, each read once, for a generic request and for a direct call of measureResolvedScope, is not determined when none lies under it, and is not determined for a code or docs request, which the index check refuses (mutation: treat every workspace as a sum over the repos under it)`, `measureDataSource counts a relational source through the complete mode of its table listing beyond the limited mode's cap, a namespace source through its namespace listing, and a file source through the file listing with no limit (mutation: call the listing in its limited mode)`, `measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not`, `the table listing of sqlite, pg and mysql applies no clamp in the complete mode, that of oracle and mssql builds its query without the row-limit clause, and the four namespace drivers' listing applies no limit; each behaves exactly as before without the mode; the file listing walks to the end when no limit is given; a ClickHouse source, whose listing throws, is not determined`, `runAnalyze sets the intent's size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size)`, `a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size)`, `the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path`, `the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth)`, `every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is`, `an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities)`, `a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution`, `the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path)`, `the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle`, `the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes`, `dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id`
  - Fixtures: `a temporary LMDB graph store with two registered repos of different sizes`, `stand-in data drivers with a settable number of objects, a cut flag and a failing listing`, `a stand-in model provider that records every call`
- **smoke** — Nothing that passed before the Story fails after it.
  - Subjects: `no test of the analyze, planner, classifier, data-driver and daemon suites that passed before the Story's first change fails after its last, compared by test name against a baseline taken at the plan's approval; the tests of the scope picker and of the classifier's size are named as removed or changed`
- **live** — The installed daemon measures real requests.
  - Subjects: `through the installed daemon, a code request scoped to one directory of this repository and the same request scoped to the whole repository return different measured sizes, each with its counts in the report, and no model call picks a size`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `runAnalyze sets the intent's size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size)`, `the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path`, `a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default)`, `the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field`, `a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution`, `the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path)`, `dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id` |
| `ac2` | `measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope)`, `measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given)`, `through the installed daemon, a code request scoped to one directory of this repository and the same request scoped to the whole repository return different measured sizes, each with its counts in the report, and no model call picks a size`, `an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities)` |
| `ac3` | `renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given`, `every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is`, `filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union` |
| `ac4` | `measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold)`, `measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not`, `measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record`, `an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities)` |
| `ac5` | `every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger)`, `the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth)`, `a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size)`, `the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle`, `the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes` |

## 7. Migration

**State before:** A request's size is chosen without counting what it touches. On the plan tree a stated size is taken as it is, or a model call (the scope picker) picks one from the wording and the whole repo's entity count, or the classifier returns one as a required field (s1 bundle 'Where the plan tree fixes a request's size today'). The size sets the plan's task band and depth cap, and the planner model writes the size of each child plan (s1 bundle 'What the size governs on the plan tree'). In the lookup pipeline and the agent tools four places set M unless a caller stated a size (s1 bundle 'Where the lookup pipeline and the agent tools assume a size'). The answer report has a `measure` field that nothing fills (s1 bundle 'Where the measure goes in the answer report'). The data listings have a limited mode only (s1 bundle 'What can be counted for each kind of scope').

**State after:** One module measures a request and maps its counts to a size with one fixed table. The plan tree measures the named area after classification and before the run context, and measures each child plan when it is spawned; the lookup pipeline measures the named area for its planning call and the lookup results for its answer. No model call and no default sets a size; a stated size is a hint. The classifier returns no size. The measure is on the classified event, in the run record and in the answer report, and is shown under the completeness line. The data listings have a complete mode that the measure uses; their limited mode is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the measuring module with the type, the table and the pure functions (sizeOfCounts, measureNamedArea, measureLookupResults), used by nothing yet. — ↩ rollbackable
2. Add the optional complete mode to the table and namespace listings of the drivers that get one, and make the file listing's limit optional; every existing caller is untouched. — ↩ rollbackable
3. Add the measuring pass for a request's scope and for a data source (measureRequestScope, measureDataSource) on top of steps 1 and 2. — ↩ rollbackable
4. Type the answer report's `measure` field, accept a measure when a report is built, add the measure line and write it under the completeness line at the places that write that line. — ↩ rollbackable
5. On the plan tree, call the measuring pass after both classification branches, set the intent's size from it, pass a stated size as the hint, and add the measure to the classified event and the run record. Measure each child plan when it is spawned. Treat the sizes on the daemon's requests as hints. — ↩ rollbackable
6. In the lookup pipeline, make the context builder the one writer of the size: the named-area measure for the planning call and the measure from lookup results for the answer step and the report; remove the four defaults, pass a caller's size as the hint, and do the same in the step tool's start and bundle phases. — ↩ rollbackable
7. Remove the size from the classifier's output schema, prompt and validator, and remove the scope picker with everything that names it: its module, prompt, error classes and export; its role row and its boot-validator entry; the two tests that import its classes; the VS Code extension's declared setting for the role, with a release; and retire the role id, through the new list of retired role ids, so the reconcile drops a value stored for it globally or per repo. Done last, when nothing reads a size from either. — ↩ rollbackable
8. Update the daemon guide and the design pages that describe how a size is chosen, compare the suites by test name with the baseline, and run the live check. — ↩ rollbackable

**Backward compat:** No request shape changes: the run request's `scopeHint`, the size on the plan request's intent, its `rootScope`, and the optional `scope` input of the two agent tools are all still accepted, and are now hints. The daemon's classify response keeps its size field, now a measured one. The intent type and every stored intent keep their fields. What changes for a caller is behaviour: a stated size no longer decides how many tasks are planned or how deep the plan nests, and a request can get a different size from the one the picker, the classifier, the planner model or the default M gave. The classifier's own output loses its size; a model answer that still carries one is rejected by the schema and retried. Run records and answer reports written before the change have no measure and are read as they are. The data listings' existing callers get exactly what they get today. One model role (the scope picker, `analyze.scope.pick`) and its prompt file are removed. The role is named outside the analyzer by the role taxonomy, the boot validator's prompt list and the VS Code extension's declared setting `insrc.models.tasks.analyze.scope.pick`; all three are updated in the same step, the extension is released, and a value a user has stored for the role is dropped by the reconcile, globally and per repo, through a new list of retired role ids.

## 8. Alternatives considered

### 8.1 a1: One measuring module; the intent keeps its size field, filled from the measure — **CHOSEN**

A new module owns the measure and the count-to-size table; the intent keeps `scope`, now set from the measure and never by a model or a default.

A new module under src/analyze holds the RequestMeasure type (the HLD's sketch), the one table from counts to the five sizes (files and entities, the larger size wins, fixed thresholds, the stakeholder's decision of 2026-10-09), and three ways to produce a measure: from a named area (a resolved scope and the repo's entities, through the one scope function's area predicate), from a data source (the drivers' listings in a complete mode) and from lookup results (the outputs of an executed plan). The classifier's output type and schema lose `scope`; the intent a run carries keeps `scope`, which the measuring pass sets after both classification branches and before the run context is built. The measure travels beside the intent: on the plan tree's classified event and run record, and into the answer report's `measure` field, which becomes typed. A caller's size is recorded as `sizeHint`. A child plan's intent is re-measured when the plan is spawned and the planner model's figure becomes that measure's hint. In the lookup pipeline the size given to the planning call is the named-area measure of the request's scope; after the plan is executed the measure from lookup results replaces it for the answer step and the report.

### 8.2 a2: The measure rides on the intent

The intent gains a required `measure` field and `scope` becomes a copy of its size.

ClassifiedIntent gains `measure: RequestMeasure` and `scope` is kept as a copy of `measure.size`. The classifier returns a type without either, and a function turns a classifier result plus a measure into an intent. Child intents written by the planner model carry no measure and are completed when the child plan is spawned. Every place that constructs an intent (the four default sites, the daemon's intent validator, the tests' fixtures) supplies a measure. The answer report reads the measure off the intent.

**Rejected because:** Meets the criteria, but at the cost of every constructor of an intent, and it puts a measure on intents that callers write, which then must be distrusted (ac1 partial). The lookup pipeline's second measure still lives outside the intent.

### 8.3 a3: Remove the size from the intent; pass the measure to each consumer

`scope` is deleted from the intent and every consumer of a size takes a RequestMeasure argument.

ClassifiedIntent loses `scope`. The planner driver, the recursive planner, the plan validator's band check, the decomposer, the context builder's inputs and the answer prompts each take the measure as an explicit argument or input field. The daemon's requests that take an intent drop its size and accept an optional hint. The prompts that mention `intent.scope` are rewritten to name the measured size.

**Rejected because:** The cleanest types but the widest change, and it reshapes inputs of the planner and the context builder that Stories s3 and s5 also work on, and the daemon's request shapes. The criteria are met no better than by a1.

## 9. References

- **[[c1]]** `code` `src/analyze/planner/validate.ts` — "export const SCOPE_BAND"
- **[[c2]]** `code` `src/analyze/runtimes/shared/task-scope.ts` — "export function inAreaOf"
- **[[c3]]** `code` `src/analyze/orchestrator/driver.ts` — "await resolveTaskScope(intent.scopeRef, intent.target, 'the run');"
- **[[c4]]** `code` `src/daemon/db/drivers/sqlite.ts` — "function clampListLimit(n: number | undefined): number {"
- **[[c5]]** `code` `src/analyze/completeness.ts` — "readonly measure?:  unknown;"
- **[[c6]]** `code` `src/analyze/classifier/scope-picker.ts` — "const ents = await listEntitiesForRepo({} as never, r.path);"
- **[[c7]]** `code` `src/shared/analyze-types.ts` — "readonly scope:     AnalyzeScope;"
- **[[c8]]** `code` `src/analyze/classifier/schema.ts` — "required:   ['target', 'scope', 'focused', 'scopeRef', 'reasoning'],"
- **[[c9]]** `code` `src/mcp/analyze-step/phases/start.ts` — "const scope  = input.scope  ?? 'M';"
- **[[c10]]** `code` `src/prompts/analyze/scope-picker.system.md` — "Very small workspace (< 500 indexed entities)"
- **[[c11]]** `code` `src/analyze/planner/recursive.ts` — "const childIntent = extractChildIntent(task);"
- **[[c12]]** `code` `src/daemon/db/list-files.ts` — "if (out.length >= opts.limit) { truncated = true; return; }"
- **[[c13]]** `code` `src/analyze/explore/answer-report.ts` — "export function reportFromLookups(results: readonly ExecutedExploration[]): AnswerReport {"
- **[[c14]]** `stakeholder` `decision of 2026-10-09 in the design session` — "A. Both counts, the larger size wins, fixed thresholds (recommended)."
- **[[c15]]** `code` `src/analyze/runtimes/shared/task-scope.ts` — "const GRAPH_FAMILIES: ReadonlySet<TaskFamily> = new Set(['code', 'docs']);"
- **[[c16]]** `code` `src/analyze/runtimes/infra/_shared.ts` — "export async function walkFiles("
- **[[c17]]** `code` `src/analyze/completeness.ts` — "if (report !== undefined) return renderCompletenessLine(report);"
- **[[c18]]** `code` `src/config/role-taxonomy.ts` — "{ id: 'analyze.scope.pick',"
- **[[c19]]** `code` `vscode-plugin/package.json` — ""insrc.models.tasks.analyze.scope.pick": {"
- **[[c20]]** `code` `src/daemon/analyze-rpc.ts` — "const rootScope = parsed.rootScope ?? parsed.intent.scope;"
- **[[c21]]** `code` `src/analyze/context/bundle.ts` — "const head = completenessHeadLine(bundle.report, 'nothing');"
- **[[c22]]** `stakeholder` `decision of 2026-10-09 in the design session` — "A. Count the files on disk that the infra tasks' own file walk would visit (recommended)."
- **[[c23]]** `code` `src/config/reconcile.ts` — "const keys = r.path.split('.');"
- **[[c24]]** `code` `src/daemon/db/drivers/oracle.ts` — "clampOracleListLimit"
- **[[c25]]** `code` `src/daemon/db/drivers/mssql.ts` — "clampMssqlListLimit"
- **[[c26]]** `code` `src/mcp/analyze-step/answer-turn.ts` — "report: reportFromLookups(args.executed.results)"
- **[[c27]]** `code` `src/analyze/context/driver.ts` — "h.update(stableStringify(inputs))"
- **[[c28]]** `code` `src/mcp/analyze-step/phases/start.ts` — "kind: 'workspace'"
- **[[c29]]** `code` `src/mcp/analyze-step/state.ts` — "export interface StepStatePayload"
- **[[c30]]** `code` `src/analyze/explore/types.ts` — "export type ExplorationOutput ="
- **[[c31]]** `code` `src/analyze/context/scope.ts` — "const repos = await deps.listRepos();"
- **[[c32]]** `code` `src/analyze/classifier/driver.ts` — "Required fields: target, scope, "
- **[[c33]]** `code` `src/analyze/runtimes/data/_shared.ts` — "export async function resolveDataScope("
- **[[c34]]** `code` `src/analyze/orchestrator/driver.ts` — "// The size is not part of either check; 'M' is a placeholder here."

## 10. Open questions

- A request is measured from its lookup results by the same table as a named area: the files the results name and the items returned. The length of the results in characters is recorded for Story s3 and does not take part in the size. Should the size of lookup results also depend on their length in characters?
- A data source's objects (tables, collections, files) are compared with the FILES column of the table, so a source with 21 to 200 tables is M and one with more than 1,500 is XL. Should a data source's objects be compared with the files column, or with the entities column (where up to 500 tables would be S)?
