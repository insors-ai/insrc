<!-- insrc:artifact LLD-b9d5c5c40df5a574-s8 -->

# LLD: E20261009b9d5c5c4:S008

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

The code tasks of a broad analysis look for stored entities of kind 'module', and no parser stores one for a repository's own directories, so the module list and the module tree come back empty and every functional-surface task fails. This Story gives the three tasks one definition of a module: a directory that holds source files the index stores. The module list and the tree are built from those directories, and the functional-surface task accepts the directory path the planner writes. A graph that does hold module entities inside the repository loses nothing, and a module value that names nothing fails with a reason.

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

> See **HLD-b9d5c5c40df5a574** § 2. Framework summary

**Rollout phase:** <not in any phase>

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Classifying every catch clause in the lookups and the plan-task runtimes: a clause that handles a named, expected condition stays and names what it skipped in the record; a clause that swallows an error is removed or rethrows, so that the lookup becomes the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, added as one more case to the raise site and the mapping that Story s6 owns, and passed through everything that reaches the context builder (six callers, the one-shot agent tool and the daemon's workflow runner, with the error's data carried through the daemon's error mapping). Keeping the report out of the schema given to a model at both places the schema reaches one (the answer-writing call and the tool loop's final answer), and rejecting a report an agent supplies. What the step tool attaches to a bundle the agent wrote. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs. The free-form fallback: an optional field for partial findings on the failed output, the loop's exit at the limit attaching what it gathered, reaching its turn limit becoming a failed output, and its answer gets a report that says it rests on a search directed by a model. Reading the data drivers' cut flag into the completeness record of the table-listing lookup and the object-listing plan task. — owns `sc1`, `sc2`
- `s2`: The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, what the decomposer and planner receive as size at each moment, the size's effect on plan depth as well as task count, and measuring a child plan from the area it names when it is spawned, with the planner model's figure and a size on the daemon request kept as hints. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer. The source of the measure for each of the seven kinds of scope, including counting a data connection's tables or objects from the live source through the data driver, and the fallback to XL, recorded as not determined, when a count cannot be taken. Adding a complete mode to the data drivers' listings for the count (the five relational drivers, four of the six namespace drivers, the file listing; Redis and etcd are recorded as not determined, since their listing is a sample of keys), with the limited mode kept for other callers; a listing that reports it was cut is never a determined count. — owns `sc3`
- `s3`: The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold. This Story closes the exception accepted on Story s7: a broad docs analysis whose aggregate input is larger than one model call accepts must complete once that input is handled in parts. — owns `sc4`
- `s4`: Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content at nine sites: the eight found when the Epic was defined, including the three adherence checks, and the indexer's own cut of a stored body to 8,192 characters (src/indexer/parser/artifact.ts), which Story s1 reports with the item's real length. The index is a pointer: at each of the nine sites, where an item's content matters to the answer, the analyzer reads the item from its file at the place the index points to and does not rely on the body the index stores. What the index stores and how it is built are not changed. The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method. Raising the lookup cache's version again, and dropping limit parameters before a lookup's cache key is taken. Building cancellation (a signal from each caller through the context builder to a check between turns; the run's signal into the plan walk and the classifier; the optional signal on the daemon's standard handlers; the signal parameter on the daemon's context-building functions; a signal on the step tool's plan and narrow phases, through stepPlan and the runner context; the new cancel request for the five requests received over the socket that reach a tool loop (the three context requests, the plan request and the classify request), with the daemon's table of run id to canceller; the cancelled case in the classify stage's mapping; 'aborted' in the daemon's error codes; what a cancelled loop returns), moving the table-listing lookup and the object-listing plan task to the complete mode of the data drivers' listings, and only then removing the turn limit and retiring its configuration setting (catalog row, retired list, the analyzer's configuration, the planning prompt, the VS Code extension's declaration with a release, the pages that document it, the reconcile fixture) for all three users of the loop (the free-form lookup and the classification and task modes) and giving the loop the complete mode of its search tools. Removing the error and the code for reaching the turn limit from both lists and both mappings, with the tests that import the error and the test configuration that sets the limit.
- `s5`: Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses. — owns `sc5`
- `s6`: Giving a request that asks no specific question a run context: what the lookup pipeline plans for it (a broad survey of the area it names, from the lookups that exist) where today it returns at once; the same for a request started with a stated kind of source, which is always marked unfocused; serving, in the lookup pipeline, the four kinds of scope it returns for today (a file, a symbol, a manifest directory, a data connection), and how each resolves to what the lookups need. Replacing the single 'model unavailable' error with the cause of each way of not proceeding, as new codes in the existing list and new typed errors, and with the existing codes where one fits: every place the pipeline returns nothing, and the fall-through for a bundle that fails validation, is listed and given its cause. It owns the place the error is raised, the pipeline's rule for returning nothing, and the functions that map these errors to codes (the plan tree's and the daemon's, and the classify stage's mapping, through which an error from the classifier's context build is routed). The form of a symbol scope's value, its resolution to one stored entity, and the validator and classifier prompt brought in line. The one function that resolves a scope's value to a repo, a path or an entity, and moving the lookup pipeline's direct readers of the value to it (the planning prompt, the context builder's path resolution, the indexed check). Correcting the table of which kind of scope goes with which kind of source, with the classifier prompt's copy of it, the table's comment and the matrix test, and applying it on both classification branches: the plan tree's classify mapping surfaces the validator's inner code, and the branch with no classifier calls the validator's checks directly. Supplying the connection check from both callers of the classifier, and mapping a connection id to its repo. It declares all three new codes in both lists; Stories s1 and s7 raise one each. — owns `sc6`
- `s7`: Widening the plan tasks of each family (code, docs, infra, data) to exactly the kinds of scope the corrected table gives it, with the scope check the docs tasks share with the code tasks taking the family's row as an argument, and every task that reads the scope's value directly (three docs tasks, the shared adherence task, the task that lists data connections) moved to the resolution function Story s6 defines, including a data connection for the data tasks, and refusing any other pairing with the existing code for it. Running a broad analysis through classification, the run context, planning, the plan walk with its nested plans, and the aggregator, to a final report; finding and correcting what stops it at each stage. A stop the run catches is already recorded; what is added is a handler for an error nothing catches, in the plan walk and in the daemon's request, that writes the run record, and the rule that a record still in progress with no live run behind it is abandoned: the process's in-memory count of the runs it is executing per id, and the two readers that apply it, the status request and the purge, each rewriting the record as failed with the code 'run-abandoned', which Story s6 declares and this Story raises; a new run replaces a record left in progress with its own first record. Making a task's refusal of a scope a typed error the plan walk recognises, with an optional code on the failed-task record. Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split. Two stops the first runs of 2026-10-08 found are corrected here as well: the aggregate-report task runs on the inputs that exist when a task before it failed and is told which are absent, so that a run with a failed task returns a report that names what is missing; and the daemon's run request accepts an empty prompt when the caller states the kind of source. Two further stops are not this Story's: what the code tasks treat as a module is Story s8's, and an aggregate input larger than one model call accepts is Story s3's. For the second, a broad docs analysis not completing on a repository of that size is an exception the stakeholder accepted on 2026-10-08, to be closed by Story s3.

## 2. Contract details

**Surface level:** internal

### 2.1 `code.discovery.modules`

```typescript
// runtime of the template, unchanged in shape: execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult>
// output: { modules: ModuleRecord[] }
interface ModuleRecord { readonly name: string; readonly path: string; readonly repo: string; readonly directory: string; readonly fileCount: number; readonly entityId?: string | undefined }

// new, in src/analyze/runtimes/shared/, beside the scope function: the one definition of a module
interface SourceModule { readonly directory: string; readonly name: string; readonly fileCount: number; readonly language: string; readonly entity?: Entity | undefined }
function sourceModulesOf(scope: ResolvedScope, entities: readonly Entity[], storedModulesOfRepo: readonly Entity[]): SourceModule[]
```

**Parameters:**
- `args: TemplateExecuteArgs` — The task; its `scopeRef` parameter names the area whose modules are listed, as today.

**Returns:** `Promise<TemplateExecuteResult>` — The modules of the scope's area, sorted by directory. One record per stored entity of kind 'module' that the area contains, under every kind of scope, as today. And, under a scope whose area is a directory (module, repo, manifest directory, workspace), one record per directory that directly holds at least one stored source file and does not lie in or under a stored module entity's directory.

**Errors:**
- `the three typed scope errors of resolveTaskScope` when As today: a kind of scope the code family does not accept, a scope that does not resolve, a scope that is not indexed. Unchanged by this Story.

**Preconditions:**
- The scope is resolved by resolveTaskScope for the code family, and the repo read is graphRepoOf(scope), as Story s7 left it
- `entities` are the repo's entities already narrowed to the scope's area with inAreaOf: the modules LISTED come from them. `storedModulesOfRepo` are ALL the repo's stored entities of kind 'module', not narrowed: rule (b) is tested against them, because a stored module entity whose file lies above the area still owns the files under its directory. In the two module tasks both come from ONE call of listEntitiesForRepo(db, repoPath): its result is kept whole, the area's entities are taken from it with inAreaOf, and the stored module entities are taken from it by kind. The whole result is used for nothing else

**Postconditions:**
- A SOURCE FILE is a stored entity of kind 'file' that is not an artifact (its `artifact` field is not true). A MODULE is one of two things. (a) A stored entity of kind 'module' whose file lies in the area: it owns every source file under the directory of its file, at any depth, as today. (b) A directory that directly holds at least one source file and is neither the directory of a stored module entity nor under one. A directory that holds source only in its sub-directories is not a module of its own in this list; its sub-directories are
- sourceModulesOf is the only place the three tasks decide what a module is. It lives in a new file under src/analyze/runtimes/shared/, takes the resolved scope and the area's entities, reads no store itself and calls no model
- For a directory module: `directory` is its absolute path with no trailing slash; `name` is its path relative to the repo that was read, or '.' for the repo's own directory; `path` equals `directory`; `repo` is the repo that was read; `fileCount` is the number of source files directly in it; there is no `entityId`
- For a stored entity of kind 'module' whose file lies in the area, the record keeps what is returned today: `name` is the entity's name, `path` is the entity's file, `repo` the entity's repo, `entityId` its id. It gains `directory` (the directory of its file) and `fileCount` (the source files directly in that directory, which may be none)
- A stored module entity takes the whole of its directory, whether or not the run's area contains the entity itself: no directory in or under it is listed as a module of its own. So which module a file belongs to does not depend on the scope. Under a repo scope a stored module at '<repo>/package.json' is the one module and owns every file; under a module scope on '<repo>/pay' that entity lies above the area and is not listed, as today, and 'pay' and its sub-directories are not listed either, since they are that module's. Where two stored module entities nest, each that the area contains is listed, as today
- The rule for a file scope and a symbol scope, stated once: no DIRECTORY module is listed, because the area is one file or one entity and a directory is larger than it; a stored module entity that the area still contains is kept, exactly as today. Today inAreaOf keeps, under a file scope, the entities of that file and, under a symbol scope, the one entity: a file scope that names a stored module entity's own file returns that module, and a symbol scope that names a stored module entity returns it. Both still do. A file scope on a source file returns an empty list, as today
- `language` of a SourceModule is the language most of its source files have, the alphabetically first on a tie, and the entity's own language for a stored module entity; it is used by the module tree, and is not part of this task's output
- The completeness record keeps the basis 'graph' and `returned` is the number of records. Its rule states what the list rests on: a module is a stored module entity in the area, or a directory that directly holds at least one source file the index stores and lies under no stored module entity's directory; a directory whose files the index does not hold is not listed; under a scope of one file or one symbol no directory is listed
- The imported modules the parsers store (entities of kind 'module' with an empty repo and file, in a shared namespace) are not read: listEntitiesForRepo does not return them for a repository, today or after the change
- The template's description in the planner's catalog (src/analyze/planner/templates/code/index.ts) is corrected to say what is returned: the directories of the scope that hold source files. Its output schema already requires `name` and `path` only and allows further fields

### 2.2 `code.structure.module-tree`

```typescript
// runtime of the template, unchanged in shape: execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult>
// output: { 'module-tree': { repo: string; modules: ModuleNode[]; edges: ModuleEdge[] } }
interface ModuleNode { readonly id: string; readonly name: string; readonly path: string; readonly language: string }   // as today
interface ModuleEdge { readonly from: string; readonly to: string; readonly viaImports: number }                       // as today
```

**Parameters:**
- `args: TemplateExecuteArgs` — The task; its `scopeRef` parameter names the area, as today.

**Returns:** `Promise<TemplateExecuteResult>` — One node per module of the area, from sourceModulesOf, and one edge per ordered pair of different modules between which at least one stored import runs, with the count of those imports.

**Errors:**
- `the three typed scope errors of resolveTaskScope` when As today.

**Preconditions:**
- The scope is resolved and the area's entities are read as today

**Postconditions:**
- The nodes are the modules sourceModulesOf returns for the area, in its order. A node's `id` is the stored entity's id when the module is a stored entity and the module's `directory` otherwise; `name` and `path` are the module record's; `language` is the SourceModule's
- Every source file of the area belongs to exactly one module: the module with the longest directory that contains it. A file under a stored module entity's directory belongs to that entity (to the innermost one where they nest), at any depth, exactly as today; any other file belongs to the module of its own directory. This is today's longest-prefix rule over the modules of sourceModulesOf
- For a graph that holds stored module entities, the nodes AND the edges between those entities are therefore the ones returned today: a file in a sub-directory of a stored module's directory is counted under that module, not under a directory module of its own, because no directory module exists in or under a stored module's directory. Edges to and from directories outside every stored module are added, since those directories were not modules before
- The tree is built from the modules LISTED for the area. A file of the area whose owning stored module lies above the area has no node to be counted under and is left out, as today; the record's rule says that a file whose module is not in the area is not part of the tree
- Under a file scope or a symbol scope the tree's nodes are the stored module entities the area contains, as today, and no directory; its record's rule says so. A file scope on a source file gives no node and no edge, as today
- Edges are computed as today: for each source file, its stored imports are read with findImports; an import whose target file belongs to another module of the area adds one to the edge from the importing file's module to that module; an import inside one module, and one whose target lies outside the area, adds nothing
- A file whose imports cannot be read is named under `skipped` in the completeness record, as today
- The completeness record's rule is restated for the new definition: a module is a directory that directly holds source files the index stores; an import whose target lies outside the scope's area is not an edge. Today's sentence about a file that lies under no module is removed, since every source file now has a module
- The `maxDepth` parameter stays in the template and stays unread, as today; this Story does not give it a meaning

### 2.3 `code.surface.functional`

```typescript
// runtime of the template, unchanged in shape: execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult>
// params: { module: string; depth?: 'shallow' | 'deep' }
// output: { 'functional-surface': { module: { name: string; path: string; directory: string; entityId?: string | undefined }; exports: SurfaceSymbol[]; internalHelpers: SurfaceSymbol[] } }

// new, beside sourceModulesOf: what a task's module value names
interface NamedModule { readonly directory: string; readonly name: string; readonly path: string; readonly entity?: Entity | undefined }
// step 1 needs neither a scope nor a repo's entities: is the value the id of a stored entity?
// `lookup` is the store's own reader: the runtime passes `id => getEntity(db, id)` (getEntity in src/db/entities.ts, as it calls today)
function moduleOfEntityId(value: string, lookup: (id: string) => Promise<Entity | null>): Promise<NamedModule | null>
// step 2, only when step 1 returned null: the value is a directory path under the run's resolved scope
function moduleOfDirectory(value: string, scope: ResolvedScope, entities: readonly Entity[]): NamedModule
```

**Parameters:**
- `params.module: string` — The module to describe. One of three forms: the id of a stored entity of kind 'module', read exactly as today; the absolute path of a directory of the repository; or a directory path relative to the repository. The planner writes a directory path.
- `params.depth: 'shallow' | 'deep'` _(optional)_ — As today: with 'deep' each symbol carries its body.

**Returns:** `Promise<TemplateExecuteResult>` — The function, method and class entities whose file lies under the module's directory, at any depth, split into exports and internal helpers, sorted as today.

**Errors:**
- `Error` when `module` is missing or not a string: as today, with today's message
- `Error` when The value names nothing: it is not the id of a stored module entity, and no stored source file lies under the directory it names. The message gives the value, says that no stored source file lies under it, and names the repo that was read
- `Error` when The value names a directory outside the repo that was read, or outside the area of the run's scope. The message gives the value and the area
- `Error` when The value is a directory path and the run's scope is a file scope or a symbol scope: its area holds no directory. The message names the scope's kind. (The id of a stored module entity is accepted under these scopes, as today.)
- `Error` when The value is the id of a stored entity that is not of kind 'module': as today, with today's message
- `the three typed scope errors of resolveTaskScope` when The value is a directory path and the run's scope is refused, does not resolve or is not indexed. New for this task, and only on this path: for an entity id no scope is resolved, as today

**Preconditions:**
- For the id of a stored module entity nothing changes: the repo read is the entity's own repo, whole, and no scope is resolved, as today. For a directory path the repo read is graphRepoOf of the run's scope, resolved from `args.intent.scopeRef` by resolveTaskScope for the code family, narrowed to the scope's area, since a directory has no entity to take a repo from

**Postconditions:**
- The value is read in two steps, in two functions, so that the first needs nothing the second needs. STEP 1, moduleOfEntityId: a value that is not a path (it does not start with '/' and holds no path separator) is looked up as an entity id with the store's getEntity(db, id), which the runtime passes in as the `lookup` callback. With no such entity it returns null. With one, the entity must be of kind 'module' (today's error otherwise) and the module is the directory of the entity's file. The runtime then reads listEntitiesForRepo(entity.repo), unnarrowed, and returns every function, method and class under that directory: exactly today's code path. No scope is resolved and no area is tested, so every id accepted today is accepted with the result it gives today, also under a scope that is refused, does not resolve or is not indexed. STEP 2, moduleOfDirectory, only when step 1 returned null or the value is a path: the runtime resolves the run's scope with resolveTaskScope, reads listEntitiesForRepo(graphRepoOf(scope)) narrowed with inAreaOf, and passes both. Under a file scope or a symbol scope a directory path is refused: the area is one file or one entity and holds no directory. Otherwise the path is taken absolute as given, or joined to graphRepoOf(scope) when relative; a trailing slash is dropped; '.' and the empty relative path name that directory itself
- Which entities each path filters: for an entity id, the entity's own repo, whole, as today; for a directory path, the repo of the run's scope, narrowed to the scope's area. The two functions are in the same new file as sourceModulesOf and are the only place a module value is read; the runtime only orders them and reads the store
- The area test is made on DIRECTORIES, for a directory path only, and only for the kinds of scope whose area is a directory (module, repo, manifest directory, workspace): the directory must equal the scope's directory or lie under it. inAreaOf's own test is on an entity's file; this is the same comparison (equal, or prefixed by the directory and a slash) applied to a directory
- graphRepoOf(scope) is the registered repo that contains the scope or, when the registry cannot be read or holds no repo, the scope's own directory (Story s7's leniency). A relative value is joined to whichever of the two it is: under a module scope with no known repo, 'sub' names '<the module's directory>/sub'. The message of a refused value gives the absolute directory the value was read as, so the reader sees which base was used
- A directory path is valid when at least one stored source file lies under it at any depth. It need not hold a file directly: the planner may name 'src', whose source is all in sub-directories
- moduleOfDirectory tests a directory path in this order, so that each refusal has one cause and one message: first the kind of the run's scope (file or symbol: refused); then whether the directory lies in the repo that was read and in the scope's area; then whether a stored source file lies under it
- The surface of a directory is everything under it, at any depth, as today's prefix rule gives for a module entity. The completeness record's rule says so: the surface lists the functions, methods and classes of every stored source file under the directory, including its sub-directories
- A value that names a directory under which no stored source file lies is a failure with its reason, never an empty surface (ac4). A directory that does hold source files in which no function, method or class is stored returns an empty surface and a complete record: that is a true result, not a missing module
- The output's `module` gains `directory`; `name` and `path` are the stored entity's name and file when the module is a stored entity, and the relative path and the directory otherwise; `entityId` is present only for a stored entity
- No new error code is introduced: the two new failures are plain errors, which the plan walk records as 'runtime-threw: <message>' with no code. The codes are Story s6's shared contract (sc6), which this Story neither owns nor consumes
- The template's `module` parameter gains a description in the planner's catalog that states the three forms and says a directory path is what a plan should write. The header comment of the runtime, which says the parameter is an entity id, is corrected
- The planning prompt (src/prompts/analyze/planner.system.md) is not changed: it already tells the planner to emit one task per unit the run context shows, and the run context shows directories

## 3. Data model changes

### 3.1 `ModuleRecord (the entries of the `modules` output of code.discovery.modules)` — field-add

Gains `directory` (the module's directory, absolute, no trailing slash) and `fileCount` (source files directly in it) on every record. `entityId` becomes optional: present for a stored module entity, absent for a directory. `name`, `path` and `repo` keep their meaning for a stored module entity; for a directory, `name` is the path relative to the repo and `path` is the directory.

```
interface ModuleRecord { name: string; path: string; repo: string; directory: string; fileCount: number; entityId?: string | undefined }   // was: { name; path; repo; entityId }
```

**Call sites:**
- `src/analyze/runtimes/code/discovery-modules.ts`
- `src/analyze/planner/templates/code/index.ts`
- `src/analyze/runtimes/code/__tests__/discovery-modules.test.ts`
- `src/analyze/runtimes/code/__tests__/scope-area.test.ts`

### 3.2 `the `module` of the `functional-surface` output of code.surface.functional` — field-add

Gains `directory`. `entityId` becomes optional, present only when the module is a stored entity.

```
module: { name: string; path: string; directory: string; entityId?: string | undefined }   // was: { name; path; entityId }
```

**Call sites:**
- `src/analyze/runtimes/code/surface-functional.ts`
- `src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts`
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts`

### 3.3 `the `module` parameter of code.surface.functional` — invariant-change

Was the id of a stored module entity, and nothing else. Is now such an id, read exactly as before, or a directory path, absolute or relative to the repo. The catalog's schema for it stays a non-empty string and gains a description.

**Call sites:**
- `src/analyze/runtimes/code/surface-functional.ts`
- `src/analyze/planner/templates/code/index.ts`

### 3.4 `ModuleNode.id (the nodes of the `module-tree` output of code.structure.module-tree)` — invariant-change

Was always a stored entity's id. Is the entity's id for a stored module entity and the module's directory otherwise. `from` and `to` of an edge hold the same values.

**Call sites:**
- `src/analyze/runtimes/code/structure-module-tree.ts`
- `src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts`
- `src/analyze/runtimes/code/__tests__/scope-area.test.ts`
- `src/analyze/runtimes/__tests__/scope-sources.test.ts`

## 4. Error paths

**Error cases**

- **A functional-surface task is given a directory under which no stored source file lies (a directory that does not exist, a misspelt path, a directory of documents only, or a directory the index does not hold).** (recoverable)
  - Detection: moduleOfDirectory filters the area's entities for source files whose path equals the directory or starts with the directory and a slash, and finds none.
  - Response: It throws an error whose message gives the value as written, says that no stored source file lies under it, and names the repo that was read. The plan walk records the task as failed with 'runtime-threw: <message>'; the aggregate task runs on the other inputs and is told this one is absent (Story s7).
  - User impact: The report's first line names the task and the reason. The module is not reported as empty.
- **A functional-surface task is given a directory outside the repo that was read, or outside the area of the run's scope (the run is scoped to one module and the planner names another).** (recoverable)
  - Detection: For a scope whose area is a directory (module, repo, manifest directory, workspace), the module's directory, made absolute, is compared with the scope's directory: it must equal it or start with it and a slash. This is the comparison inAreaOf makes on an entity's file, applied to a directory.
  - Response: It throws an error whose message gives the value and the area it must lie in. The task is recorded as failed.
  - User impact: The report names the task and why; a run scoped to one area does not read another.
- **A functional-surface task is given a directory path while the run's scope is a file scope or a symbol scope.** (recoverable)
  - Detection: The value is not the id of a stored entity, so the scope is resolved; its kind is 'file' or 'symbol'.
  - Response: It throws an error whose message names the scope's kind and says a scope of one file or one symbol holds no directory to describe. The task is recorded as failed. The id of a stored module entity is not affected: it is read as today.
  - User impact: The report names the task and why. The planner's module list for such a scope is empty, so a plan has no module to name.
- **A functional-surface task is given the id of a stored entity that is not of kind 'module'.** (recoverable)
  - Detection: The value is not a path, the lookup (getEntity) returns an entity, and its kind is not 'module'.
  - Response: Today's error, with today's message naming the entity's kind.
  - User impact: As today.
- **A functional-surface task is given a value that is neither a path nor the id of any stored entity (for example a bare name such as 'analyze').** (recoverable)
  - Detection: The value does not start with '/' and the lookup (getEntity) returns null; it is then tried as a directory relative to the repo, and no stored source file lies under it.
  - Response: The error of the first case: no stored source file lies under the directory the value names, with the directory it was read as, so the reader sees how the value was understood.
  - User impact: The report names the task and the directory that was looked for.
- **A functional-surface task is given a directory path and the run's scope is refused, does not resolve or is not indexed.** (recoverable)
  - Detection: resolveTaskScope throws one of the three typed scope errors.
  - Response: The error passes through unchanged; the plan walk records the task as failed with the error's code, as for every other code task since Story s7.
  - User impact: The task's failure carries a code.
- **The stored imports of a source file cannot be read while the module tree is built.** (recoverable)
  - Detection: findImports throws for that file.
  - Response: As today: the file is named under `skipped` in the task's completeness record, and the tree is built from the other files.
  - User impact: The tree's record says which file's imports are missing.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository whose graph holds no entity of kind 'module' for its directories and many directories of source (this repository has 209). | Every directory that directly holds a stored source file is returned, with no limit; the tree has one node for each. |
| A directory that holds source only in its sub-directories, such as 'src'. | It is not a record of the module list, and it is a valid `module` value for the functional-surface task, whose surface is everything under it. |
| The repo's own directory holds source files directly. | It is a module named '.', with the repo's path as its directory. |
| A `module` value with a trailing slash, or a relative path, or '.'. | The trailing slash is dropped; a relative path is joined to the repo that was read; '.' names the repo's own directory. |
| Two directories of which one's name is a prefix of the other's ('pay' and 'payments'). | They are two modules; a file under 'payments' is never counted under 'pay', because the test is the directory followed by a slash. |
| A graph that holds a stored module entity whose file lies in the area, as the existing tests seed. | It is returned with the fields it has today plus `directory` and `fileCount`, and its id is accepted as a `module` value under every scope, with the surface it gives today. No directory in or under its directory is a module of its own, so the files under it, at any depth, are its files in the tree and its edges are the ones returned today. |
| A directory that holds only files the index stores as artifacts (documents, configuration). | It is not a module, and as a `module` value it fails: no stored source file lies under it. |
| A module scope, a file scope or a symbol scope on the three tasks. | Under a module scope the modules, the tree and an accepted directory path are those of the directories under it. Under a file scope and under a symbol scope no directory is a module and a directory path is refused; a stored module entity the area contains is still listed and is still a node, as today. |
| A source directory in which no function, method or class is stored. | The functional-surface task returns an empty surface with a complete record: the module exists and offers nothing the index stores. |
| A directory whose files are in more than one language. | The tree's node carries the language most of its source files have, the alphabetically first on a tie. |
| A stored module entity whose directory has source files in a sub-directory, and an import from one of those files to a file of another stored module. | The edge runs from the stored module to the other stored module, with the same count as today; the sub-directory is not a node. |
| A file scope that names a stored module entity's own file (the existing fixtures use 'pay/package.json'). | The module list returns that one module and the tree has that one node, as today. |
| A relative module value when the registry holds no repo, so that the repo read is the scope's own directory. | The value is joined to that directory; a refusal's message gives the absolute directory it was read as. |
| A repository with one source file directly in its own directory and no module entity (the gated test 'structure.module-tree: repo with zero modules'). | The tree has one node, named '.', and no edge. Before, it had no node. |
| A stored module entity at the repository's root ('<repo>/package.json') and a run scoped to a directory under it ('<repo>/pay'), whose files that module owns. | The module list and the tree are empty, as today: the entity lies above the area and is not listed, and 'pay' is not a directory module because it lies under a stored module. The same graph under a repo scope gives the one stored module. A functional-surface task that names 'pay' as a directory path still returns its surface. |

**Invariants to preserve**

- A task under a scope returns only what lies in that scope's area (Story s7): the modules listed, the tree's files and a directory path's symbols all come from entities narrowed with inAreaOf. One read reaches outside the area and returns nothing from it: the repo's stored module entities are read whole, only to decide whether a directory of the area lies under a stored module. [[c2]]
- The three tasks rest on the stored graph and read nothing from the file system; their completeness record's basis stays 'graph'. [[c2]]
- The index is not changed: no entity is written, and what the parsers store as a module (an imported module in a shared namespace) keeps its meaning. [[c3]]
- A graph that holds stored module entities inside the repository returns, for those entities, every record, every node, every edge between them and every surface that it returns today, under every kind of scope; and the id of a stored module entity is read by the functional-surface task exactly as today, with no scope resolved. [[c6]]
- No result is reduced without saying so: no limit is put on the number of modules, nodes, edges or symbols returned. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by `npx tsx --test` under Node 22; tests co-located in `__tests__`. Graph tests use a temporary LMDB store (setGraphStorePath) and are not gated, as scope-area.test.ts of Story s7.`

**Test levels**

- **unit** — The one definition of a module and the reading of a module value, with entities given as plain arrays: no store, no model.
  - Subjects: `sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source)`, `sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only)`, `sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash)`, `moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before)`, `moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory`, `the source scan over the code runtimes (src/analyze/runtimes/__tests__/scope-sources.test.ts) still holds for the two module tasks, and names the functional-surface task as resolving the run's scope through the one scope function for a directory path`
  - Fixtures: `hand-built Entity arrays: source file entities in nested directories, artifact file entities, one stored module entity inside the repo`
- **integration** — The three runtimes over a temporary graph store that holds what a parser stores: file, function, method and class entities, and no module entity for the repository's directories.
  - Subjects: `on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before)`, `on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one`, `the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before)`, `the functional-surface task given a directory that holds source only in its sub-directories returns their surface`, `the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module`, `on a graph that holds stored module entities inside the repository, with source in a sub-directory of a stored module's directory, the three tasks return every record, node, edge and surface they return today; the entity's id is read as today under every kind of scope, also one that is refused or not indexed; a file scope that names a module entity's own file still returns that module; and a run scoped under a stored module's directory lists no directory module (mutation: make a directory module of the sub-directory)`, `under a module scope the module list and the tree keep to the area and a functional-surface task that names a directory outside the area is refused; under a file scope and a symbol scope no directory is listed and a directory path is refused (mutation: test a directory against the area with the entity predicate)`, `a table test over every registered plan-task runtime still finds a completeness record on each result, with the functional-surface task given a directory path`
  - Fixtures: `a temporary LMDB graph store with a registered repo`, `source file entities with IMPORTS relations between files of different directories`, `a variant of the fixture that also holds module entities whose file lies in the repo`
- **live** — A code request through the installed daemon running this Story's code, on this repository. Spends the stakeholder's model quota: one run.
  - Subjects: `a code request at size S on this repository returns a final report in which every functional-surface task succeeded and the module list is not empty`
- **smoke** — Nothing that passed before the Story fails after it.
  - Subjects: `no test of the analyze suite that passed before the Story's first change fails after its last, the gated file src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts included, which is run whole with INSRC_LIVE_TESTS=1. Two of its tests change and are named: 'surface.functional: unknown module entity id -> throws' (the message for a value that names nothing) and 'structure.module-tree: repo with zero modules -> empty tree, not error' (one source file in the repo's own directory now gives one node '.' and no edge)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before)`, `on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one`, `sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source)` |
| `ac2` | `the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before)`, `the functional-surface task given a directory that holds source only in its sub-directories returns their surface`, `moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before)` |
| `ac3` | `on a graph that holds stored module entities inside the repository, with source in a sub-directory of a stored module's directory, the three tasks return every record, node, edge and surface they return today; the entity's id is read as today under every kind of scope, also one that is refused or not indexed; a file scope that names a module entity's own file still returns that module; and a run scoped under a stored module's directory lists no directory module (mutation: make a directory module of the sub-directory)`, `sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only)` |
| `ac4` | `the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module`, `moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory` |
| `ac5` | `a code request at size S on this repository returns a final report in which every functional-surface task succeeded and the module list is not empty` |

## 6. Migration

**State before:** The three code tasks read stored entities of kind 'module' (bundle 'What the three code tasks do with a module today'). No parser stores one for a repository's own directories (bundle 'What an entity of kind module is in the stored graph, per parser'), so on every indexed repository the module list and the module tree are empty, and a functional-surface task fails when the planner gives it a directory path, which is what it always gives (bundles 'What the planner is told a module is' and the live run of 2026-10-09).

**State after:** One function decides what a module is: a directory that directly holds source files the index stores, or a stored module entity inside the area. The module list and the tree are built from it. The functional-surface task accepts a directory path, absolute or relative to the repo, or a stored module entity's id, and fails with a reason for a value that names nothing. Nothing in the stored graph, the index or the planning prompt has changed.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the one definition of a module and the reading of a module value in a new file under src/analyze/runtimes/shared/, with their unit tests. Nothing calls them yet. — ↩ rollbackable
2. Move code.discovery.modules to the definition: its records gain `directory` and `fileCount`, `entityId` becomes optional, and its completeness record states what a module is. Correct the template's description in the planner's catalog. — ↩ rollbackable
3. Move code.structure.module-tree to the definition: nodes from the modules, each source file under the module of its own directory, edges as today; restate the record's rule. — ↩ rollbackable
4. Move code.surface.functional to the reading of a module value: resolve the run's scope, accept a directory path or a stored module entity's id, fail with a reason for a value that names nothing or lies outside the area; add `directory` to the output's module; describe the parameter in the planner's catalog and correct the runtime's header comment. — ↩ rollbackable
5. Bring the existing tests in line. The tests that seed a stored module entity inside the repository keep passing unchanged and are the proof that such a graph loses nothing; the file-scope assertions of src/analyze/runtimes/code/__tests__/scope-area.test.ts hold as they are. Two gated tests of src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts change and are rewritten: 'surface.functional: unknown module entity id -> throws' (new message) and 'structure.module-tree: repo with zero modules -> empty tree, not error' (one node '.', no edge). The whole gated file is run with INSRC_LIVE_TESTS=1. The source scan src/analyze/runtimes/__tests__/scope-sources.test.ts is rewritten for the code family, not only extended. Today it requires, in each code runtime that calls readScopeRef, the literal read `listEntitiesForRepo(db, repoPath)).filter(inAreaOf(scope))` and exactly one call of listEntitiesForRepo, under the comment that the only read of the repo's entities is the one kept to the area. For the two module tasks the scan will require instead: exactly one call of listEntitiesForRepo(db, repoPath), whose whole result is kept; the area's entities taken from that result with inAreaOf(scope); and the whole result passed on only as the stored module entities of sourceModulesOf. The entry-points task keeps today's assertion. A separate assertion is added for surface-functional.ts, which does not call readScopeRef and so is not found by the scan's list: it resolves `args.intent.scopeRef` through resolveTaskScope for the code family on the directory path, and reads no scope on the entity-id path. — ↩ rollbackable
6. docs/daemon.md has no section on the code tasks. Add a new subsection on what a module is for the code tasks, after 'The kinds of scope each family of tasks accepts' (the table Story s7 added): the definition, the three forms of the `module` value, and what a file or symbol scope gives. Update the installed daemon and run one code request on this repository through it; record the result. — ↩ rollbackable

**Backward compat:** No stored data changes and nothing needs to be reindexed. The three outputs only gain fields (`directory`, `fileCount`) and one field becomes optional (`entityId`), absent only for a module that had no record at all before. For a graph that holds stored module entities, the records, the nodes, the edges between those entities and the surfaces are the ones returned today under every kind of scope, and a plan that carries a stored module entity's id as its `module` value is read exactly as today. What changes for an existing caller: a directory that holds source and lies under no stored module is now a module (a repository with one source file and no module entity has one node '.' where it had none); a tree node's `id` may be a directory path where it was always an entity id; and a directory path as a `module` value no longer fails. Nothing but the aggregate task reads these outputs, and no plugin or other client does. No stored plan or stored output needs migrating. A plan is written per run (src/analyze/planner/cache.ts keeps a run's plan and its attempts under that run's directory) and is never reused by another run, so no plan written before the change is executed after it. A run that completed before the change and is asked for again is replayed from its run record: its stored final report is returned as it was written, and its tasks are not run again. The templates' `revision` stays 'r1' for all three: nothing in the analyzer reads a template's revision, so raising it would change no behaviour.

## 7. Alternatives considered

### 7.1 a1: A module is a directory that holds source, read from the stored file entities — **CHOSEN**

One shared function derives a repository's modules from the directories of its stored source files; the three tasks use it, and the functional-surface task takes a directory path or a stored module entity's id.

Add one function beside the scope function that, for a resolved code scope, returns the modules of its area: every directory that directly holds at least one stored entity of kind 'file' that is source (not an artifact), named by its path relative to the repo, together with any stored entity of kind 'module' whose file lies in the area (the shape the existing tests seed), which keeps its entity id. code.discovery.modules returns that list; code.structure.module-tree uses it for its nodes and assigns each file to the module of its own directory; code.surface.functional resolves its `module` parameter to one of those modules, accepting an absolute directory path, a path relative to the repo, or the id of a stored module entity, and fails with a reason when the value names none. Nothing is written to the graph and the index is not changed.

### 7.2 a2: The indexer stores a module entity for each source directory

At index time the indexer writes an entity of kind 'module' per directory that holds source, and the tasks keep reading stored module entities.

Extend the indexer so that, after a repository's files are parsed, it upserts one entity of kind 'module' per directory that holds source, with the repository's path and the directory as its file, and relations from the module to its files. The two module tasks then find entities as they expect. The functional-surface task still needs a way to accept a directory path, because the planner cannot know an entity id before any task has run, so its parameter handling changes as in the first alternative.

**Rejected because:** Changes what the index stores, which the Epic's HLD says is not changed, and still needs the parameter change of the first alternative.

### 7.3 a3: The tasks list directories from the file system, as the module.profile lookup does

The module tasks walk the repository's directories on disk and call the existing module.profile lookup for each module's surface.

Have code.discovery.modules walk the scope's directory on disk with the same ignore rules as the module.profile lookup, and return each directory with an index file or source files as a module. Have code.surface.functional call the module.profile runner for the directory it is given and reshape its output into exports and internal helpers. The module tree's nodes come from the same walk.

**Rejected because:** Mixes two sources in one task and drops stored module entities.

## 8. References

- **[[c1]]** `prior-artifact` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/live-runs-t17.md` — "code, S ... completed, report with 11 findings ... t04 to t11, each code.surface.functional: module entity '<dir>' not found in the graph"
- **[[c2]]** `code` `src/analyze/runtimes/code/surface-functional.ts` — "module entity '${moduleId}' not found in the graph"
- **[[c3]]** `code` `src/indexer/parser/python.ts` — "const moduleId = makeEntityId(MODULE_NAMESPACE, '', 'module', modName);"
- **[[c4]]** `code` `src/analyze/planner/templates/code/index.ts` — "module: { type: 'string', minLength: 1 },"
- **[[c5]]** `code` `src/analyze/runtimes/shared/task-scope.ts` — "export function inAreaOf(scope: ResolvedScope)"
- **[[c6]]** `code` `src/analyze/runtimes/code/__tests__/scope-area.test.ts` — "ent('module', 'pay', 'pay/package.json'),"
- **[[c7]]** `prior-artifact` `DEF-b9d5c5c40df5a574` — "Given a repository whose graph does hold entities of kind 'module' for its own directories (no parser stores them today: each stores a module only for an imported module; a graph written by other mean"
- **[[c8]]** `stakeholder` `chat 2026-10-08` — "Story 7 split in three: what the code tasks treat as a module is a Story of its own"

## 9. Open questions

- The module list returns every directory that directly holds a stored source file, with no grouping: this repository has 209. A directory that holds source only in its sub-directories (such as 'src') is not in the list, though it is accepted as a module value. Is a flat list of source directories what a broad analysis should be given as its modules, or should the list also carry the parent directories?

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-09T12:24:21.388Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| data-compatibility | A run that completed before the change and is asked for again is replayed from its run record, with its stored final report returned as written and its tasks not run again. | I confirmed that plans and task outputs are stored per run id (planner/cache.ts, executor/cache.ts:84-94) and that no production code re-reads a stored plan, but I did not read the status / replay path in src/analyze/orchestrator or the daemon's run handlers to confirm that a completed run's tasks are never executed again. [files: src/analyze/planner/cache.ts, src/analyze/executor/cache.ts] | Cite the function that returns a completed run from its record, or drop the sentence; nothing else in the design depends on it. |
