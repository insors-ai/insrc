<!-- insrc:artifact LLD-008e146ad1475ef9-S001 -->

# LLD: E20261010008e146a:S001

## Summary

**Epic:** `defect-analyzer-s-request-measure-src`
**HLD base run:** `wf-1791635926457-vqbvjg`
**HLD effective hash:** `49f2c71d1b86...`

Measuring a request no longer waits without limit on a live data source: each source is given 120 seconds by default (a setting) to be reached and listed, and one that does not answer is reported as a size that could not be determined, with the reason; a cancelled request stops measuring. For a request scoped to one symbol the measure reads that one entity; for a request scoped to one file it no longer builds every stored entity of the repository, though the store's entity table is still scanned for a file, because the store has no index by file (ISSUE-61045de91faef1a0 is filed for that index). A run measures the area it names once: it hands that measure to the context builder, which uses it and takes none of its own, while a caller that hands none is measured by the builder as before.

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

### 2.1 `measureRequestScope`

```typescript
measureRequestScope(scopeRef: AnalyzeScopeRef, target: AnalyzeTarget, sizeHint?: AnalyzeScope, options?: MeasureOptions): Promise<RequestMeasure>
```

**Parameters:**
- `scopeRef: AnalyzeScopeRef` — Unchanged: the scope the request names.
- `target: AnalyzeTarget` — Unchanged.
- `sizeHint: AnalyzeScope` _(optional)_ — Unchanged: a stated size, kept as the hint.
- `options: MeasureOptions` _(optional)_ — New. `signal`: the request's cancellation signal. `sourceTimeoutMs`: the time one live data source is given, in place of the configured value. Passed on to measureResolvedScope.

**Returns:** `RequestMeasure` — Unchanged in shape. Two new reasons for a measure that is not determined: a live source that did not answer within the limit, and a request that was cancelled.

**Postconditions:**
- Never throws, as today.
- With no options the result is today's for every scope that answers within the configured limit.

### 2.2 `measureResolvedScope`

```typescript
measureResolvedScope(scope: ResolvedScope, target: AnalyzeTarget, sizeHint?: AnalyzeScope, options?: MeasureOptions): Promise<RequestMeasure>
```

**Parameters:**
- `scope: ResolvedScope` — Unchanged.
- `target: AnalyzeTarget` — Unchanged.
- `sizeHint: AnalyzeScope` _(optional)_ — Unchanged.
- `options: MeasureOptions` _(optional)_ — New, as for measureRequestScope.

**Returns:** `RequestMeasure` — As today, with these changes. (1) When the signal is already aborted on entry, nothing is read and the measure is not determined with the note `the request was cancelled before it was measured`. (2) A data request on a repo, workspace or manifest directory measures its connections one after another as today; before each one the signal is checked, and once it has fired the remaining connections are not asked and the measure is not determined with the note `the request was cancelled while its data sources were being measured`. (3) A stored area is read as narrowly as its scope allows: for a symbol scope the one entity is read by its id; for a file scope the entities of that file are read; in both cases only entities of the scope's repository are counted, and when the narrow read finds none the area is read as today (every entity of the repository), so the result, including `the repository holds no stored entity`, is today's. Any other scope is read as today. What this saves for a file scope is limited, and is stated here as it is: the store has no index by file, so the read of one file's entities (findEntitiesByFile in src/db/entities.ts) still passes over every row of the entity table, of all repositories, and works out each row's path; it saves only the building of the entities of the repository's other files. Reading a file's rows without that scan needs an index by repository and file, which is ISSUE-61045de91faef1a0 and is not part of this design. The symbol read is a point read and scans nothing.

**Postconditions:**
- Never throws, as today.
- For a symbol or file scope the counts (`items`, `files`) and the size equal those the whole-repository read gives.
- A symbol scope whose entity is found in its repository causes no read of the repository's entities.

### 2.3 `measureDataSource`

```typescript
measureDataSource(scope: DataScope, sizeHint?: AnalyzeScope, options?: MeasureOptions): Promise<RequestMeasure>
```

**Parameters:**
- `scope: DataScope` — Unchanged: the pool path and the connection id.
- `sizeHint: AnalyzeScope` _(optional)_ — Unchanged.
- `options: MeasureOptions` _(optional)_ — New, as above.

**Returns:** `RequestMeasure` — As today, except that reaching the source (the pool's acquire) and listing it (listTables, listNamespaces or the file listing, in complete mode) together are given one bounded wait of `sourceTimeoutMs`, or the configured limit when none is passed. When the wait ends first the measure is not determined with the note `the listing of '<id>' timed out: the source did not answer within <n> seconds`. When the signal fires first it is not determined with the note `the request was cancelled while the source '<id>' was being measured`. The limit is per source: a data request on a repository with several connections gives each its own. The wait is abandoned, not the driver's call: the drivers have no cancellation, so the call may go on in the background; its later result is dropped and its later rejection is caught and logged at debug level. Where the wait lives: in measureConnection, the private function of src/analyze/measure.ts that reaches one connection (`pool.acquire(id)`) and lists it, and that both measureDataSource and measureDataPool call. measureDataPool, which measures the connections registered at a repo, workspace or manifest directory one after another and calls measureConnection directly (it does not go through measureDataSource), is changed with it: it takes the options, checks the signal before each connection and passes the options to each call of measureConnection. Loading the pool (`acquireDataPool` and `pool.reload()`, in measureDataSource and in measureDataPool) is not inside the wait: it reads the connections file and closes the drivers of connections that were removed from it, and is not bounded by this design.

**Postconditions:**
- Never throws, as today.
- A source that timed out or was cancelled is never returned as a count: `determined` is false, `items` and `files` are 0 and the size is XL.
- The checks made before the source is reached (no connection named, a kind whose listing is a sample of keys) are unchanged and are not subject to the wait.

## 3. Data model changes

### 3.1 `MeasureOptions (new type in src/analyze/measure.ts)` — new

export interface MeasureOptions { readonly signal?: AbortSignal | undefined; readonly sourceTimeoutMs?: number | undefined }. `sourceTimeoutMs` is the time one live data source is given to be reached and listed; left out, the configured value is used. A value that is not a finite number greater than 0 is treated as left out.

```
+ export interface MeasureOptions { readonly signal?: AbortSignal | undefined; readonly sourceTimeoutMs?: number | undefined }
```

**Call sites:**
- `src/analyze/measure.ts`
- `src/analyze/orchestrator/driver.ts`
- `src/analyze/planner/recursive.ts`

### 3.2 `The setting `analyzer.dataSourceListingTimeoutMs`` — new

A new entry of the configuration catalog (src/config/config-catalog.ts), in the group 'Analysis & memory': type number, default 120000, described as the time in milliseconds one live data source is given to answer when a request is measured. It is read from ~/.insrc/config.json each time a live source is measured (not cached), by a reader that never throws and returns 120000 when the file is absent or unparseable or the value is missing or is not a finite number greater than 0, in the manner of the reader of `codeReview.freshnessTimeoutMs`. Being in the catalog, the setting is kept by the daemon's configuration reconcile and shown by the settings screens that list the catalog.

```
+ { path: 'analyzer.dataSourceListingTimeoutMs', type: 'number', default: 120000, group: 'Analysis & memory' }
```

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/analyze.ts`
- `src/analyze/measure.ts`

### 3.3 `RunShapeInput.measure` — field-add

RunShapeInput (src/analyze/context/types.ts) gains `readonly measure?: RequestMeasure | undefined`: the measure the caller has already taken of the area this intent's scope names. When it is given and its source is 'named-area' or 'data-source', the exploration pipeline (src/analyze/context/driver.ts) uses it for its planning call and does not measure; when it is absent, or its source is 'lookup-results' (which is not a measure of a named area), the pipeline measures as today. The field is left out of the bundle cache key (keyedInputs), as the intent's size and the stated size already are, so a run's bundle is cached under the same key whether or not a measure was handed in. The caller is trusted to hand a measure of the same scope reference and target as the intent; the run driver takes both from the same intent.

```
~ RunShapeInput { intent; sizeHint?; + measure?: RequestMeasure | undefined }
```

**Call sites:**
- `src/analyze/context/types.ts`
- `src/analyze/context/driver.ts`
- `src/analyze/orchestrator/driver.ts`
- `src/daemon/analyze-rpc.ts`

### 3.4 `PlanBuilderOpts.signal` — field-add

PlanBuilderOpts (src/analyze/planner/types.ts) gains `readonly signal?: AbortSignal | undefined`. The recursive planner passes it to the measure of each child plan and uses it for nothing else. The run driver sets it from its own signal.

```
~ PlanBuilderOpts { ...; + signal?: AbortSignal | undefined }
```

**Call sites:**
- `src/analyze/planner/types.ts`
- `src/analyze/planner/recursive.ts`
- `src/analyze/orchestrator/driver.ts`

### 3.5 `MeasureDeps (the measuring pass's test readers)` — field-add

MeasureDeps gains two optional readers beside `listEntities`: `getEntity?: (id: string) => Promise<Entity | null>` and `listEntitiesOfFile?: (file: string) => Promise<readonly Entity[]>`. In production they are getEntity and findEntitiesByFile of src/db/entities.ts. A test stands in counting readers to show which read a scope causes.

**Call sites:**
- `src/analyze/measure.ts`
- `src/analyze/__tests__/measure-pass.test.ts`

### 3.6 `The run driver's and the plan RPC's use of the measure` — invariant-change

runAnalyze (src/analyze/orchestrator/driver.ts) passes `{ signal }` to its one call of measureRequestScope and hands the measure it took to the context builder: buildRunBundle({ intent, measure }, ...). Today the builder measures the same resolved scope a second time; after the change one run takes one measure of the area it names, and the size on the run's intent and the size of the builder's planning call are the same value by construction. The plan RPC (the handler in src/daemon/analyze-rpc.ts that measures the request's intent and then calls buildRunBundle({ intent }, ...) before it runs the planner) has the same double measure and is changed the same way: it hands the measure it took to the builder. It has no cancellation signal and passes none. The callers that are unchanged: the classify RPC and the freeform probe take one measure and build no run context; the bundle RPC (which passes its caller's input to buildRunBundle as it is) and the analyze-step tool hand no measure, and the builder measures for them as today.

**Call sites:**
- `src/analyze/orchestrator/driver.ts`
- `src/analyze/context/driver.ts`
- `src/daemon/analyze-rpc.ts`

## 4. Error paths

**Error cases**

- **A live data source does not answer: reaching it or listing it never finishes.** (recoverable)
  - Detection: The bounded wait around the pool's acquire and the driver's listing ends before they do: a timer started when the source is first asked fires after the limit.
  - Response: The source's measure is not determined, with the note `the listing of '<id>' timed out: the source did not answer within <n> seconds`. The driver's call is left to finish or fail in the background; its result is dropped and its rejection is caught and logged at debug level. The request goes on.
  - User impact: The request is sized as the largest, the report's measure line says the size could not be determined and why, and the scope checks and the plan run as they do for any size that is not determined. Today the request waits in its classify stage for as long as the source takes.
- **The request is cancelled while a live source is being measured.** (recoverable)
  - Detection: The cancellation signal passed in the options fires: the bounded wait listens for its abort event, and the signal's state is checked before each source of a pool and on entry to the pass.
  - Response: The wait ends at once, no further source is asked, and the measure is not determined with a note that says the request was cancelled. The run driver's own check for cancellation, made right after the measure, then ends the run as cancelled, as it does today between stages.
  - User impact: A cancelled request stops within the measure and does not wait for the source.
- **A data request on a repository names several connections and one of them does not answer.** (recoverable)
  - Detection: As the first case, for that connection; each connection has its own wait.
  - Response: The other connections are measured as today. The sum is not a count: the measure is not determined and its note lists the connection that timed out with its reason and the number of objects counted in the others, in today's form for a connection that could not be counted.
  - User impact: The wait is at most the limit for each connection that does not answer, one after another: with the default, two stalled connections cost four minutes.
- **The abandoned call of a driver that timed out later fails, or later succeeds.** (recoverable)
  - Detection: The call's promise settles after the wait has ended.
  - Response: A rejection is caught where the wait was set up, so it is never an unhandled rejection of the daemon, and is logged at debug level with the connection id. A late result is dropped. The measure already returned is not changed.
  - User impact: None. The connection the pool holds for that source may stay busy until the driver's own call ends; a later task that uses the same connection may wait on it, as it would today.
- **The setting holds a value that cannot be a time limit (not a number, not finite, zero or negative), or the configuration file cannot be read.** (recoverable)
  - Detection: The setting's reader checks the type and the range of the value and catches a failed read or parse.
  - Response: The default of 120000 ms is used. Nothing is thrown.
  - User impact: A mistyped setting does not stop requests from being measured.
- **The narrow read of a symbol or a file scope fails (the store cannot be read).** (recoverable)
  - Detection: The read rejects inside measureResolvedScope's existing try block.
  - Response: As today for a failed read: the measure is not determined with the note `the count could not be taken (<reason>)`.
  - User impact: As today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A live source that answers within the limit. | Today's measure, unchanged: the count of its tables, namespaces or files, or today's reason when the listing was cut, is not supported or failed. |
| A source whose kind lists a sample of keys (redis, valkey, keydb, etcd), or a scope that names no connection. | Today's reason, returned before the source is reached; no wait is started. |
| A symbol scope whose entity is stored in the scope's repository. | One point read; items 1, files 1 (0 when the entity has no file path), the size the whole-repository read gives; no read of the repository's entities. |
| A symbol scope whose entity is not found by its id, or is found in another repository. | The area is read as today (every entity of the repository) and today's result is returned. |
| A file scope whose file has stored entities. | The entities of that file are read, those of the scope's repository are counted, files is 1; the counts equal those of the whole-repository read. The read still passes over the rows of the entity table (ISSUE-61045de91faef1a0). |
| A file scope whose file has no stored entity (an indexed repository, a file with nothing in it), or a scope with no file path. | The area is read as today: a count of 0 when the repository holds entities, not determined when it holds none. |
| A repo, workspace, module or directory scope. | Read as today; nothing changes. |
| The run driver hands the context builder a measure that is not determined (for example a source that timed out). | The builder uses it as it is: the planning call is given the largest size, the same size the run's intent has. It does not measure again, so the source is not waited on a second time. |
| A caller hands the context builder a measure whose source is 'lookup-results'. | It is not a measure of a named area: the builder ignores it and measures as today. |
| A caller of the context builder that hands no measure (the analyze-step tool, a workflow's context pass). | The builder measures the resolved scope as today. |
| A child plan of a plan tree names a live source the root also named. | The source is listed again for the child, within its own limit and under the run's signal. Listing a source once per run is not part of this design. |
| A signal that is already aborted when the pass is entered. | Nothing is read; the measure is not determined with the note `the request was cancelled before it was measured`. |
| `sourceTimeoutMs` passed in the options. | It is used in place of the configured value for that call; a value that is not a finite number greater than 0 is treated as not passed. |

**Invariants to preserve**

- The measuring pass never throws: a count it cannot take is a measure that is not determined, with the largest size and the reason in its note. [[c1]]
- A measure that is not determined has items 0 and files 0; a count taken of part of the area goes in the note, never in the counts. [[c1]]
- The counts and the size of a named area are those of the entities the scope's area rule keeps (inAreaOf); the narrower reads return the same counts. [[c2]]
- A count of zero is a count only when a registered repository contains the scope and holds stored entities; a repository with no stored entity is not determined. [[c1]]
- The run's intent has its size before the context is built and before the scope checks: the `classified` event and the stored run record carry it. [[c4]]
- The context builder is the writer of the size its planning call is given; a size on the intent it is handed is not read. A measure handed in beside the intent is the one exception this design adds. [[c5]]
- The bundle cache key does not depend on the size or on a stated size; it does not depend on a handed measure either. [[c5]]
- The store and the live sources are read one after another, never in parallel. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by `npx tsx --test` under Node 22; test files are `__tests__/*.test.ts` beside the code (as src/analyze/__tests__/measure-pass.test.ts and src/analyze/context/__tests__/pipeline-outcome.test.ts)`

**Test levels**

- **unit** — A live data source is measured within a bounded time, and a cancelled request stops measuring.
  - Subjects: `a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count`, `a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing`, `one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count`, `the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection`, `the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds`, `the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000`
  - Fixtures: `the stand-in pools and drivers of measure-pass.test.ts, with a driver whose listTables returns a promise that does not settle, one whose acquire does not settle, and one whose listing rejects after the limit`, `a time limit of a few milliseconds passed in the options, so that no test waits on a real clock for long`, `an AbortController`, `a temporary configuration file for the setting's reader`
- **unit** — A symbol scope is measured without reading the repository's entities and a file scope without building every entity of the repository, with the same counts.
  - Subjects: `a symbol scope is measured with one read by id and a file scope with the read of that file's entities; neither asks the store for every entity of the repository, and the counts and the size equal those of the whole-repository read`, `a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before`
  - Fixtures: `_setMeasureDepsForTest with readers that count their calls (listEntities, getEntity, listEntitiesOfFile)`, `a set of stored entities over two repositories and several files`
- **integration** — One run takes one measure of the area it names.
  - Subjects: `a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way`, `a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before`, `the bundle cache key is the same with and without a handed measure`, `the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan`
  - Fixtures: `the pipeline's stand-in steps of pipeline-outcome.test.ts, with a `measureArea` step that counts its calls and a `decompose` step that keeps the intent it is given`, `the measure's test seam with a reader that counts its calls, under a run driven with stand-in stages`, `the plan-tree fixtures of recursive.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count`, `one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count`, `the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection` |
| `ac2` | `a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing`, `the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan` |
| `ac3` | `the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds`, `the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000` |
| `ac4` | `a symbol scope is measured with one read by id and a file scope with the read of that file's entities; neither asks the store for every entity of the repository, and the counts and the size equal those of the whole-repository read`, `a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before` |
| `ac5` | `a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way`, `a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before`, `the bundle cache key is the same with and without a handed measure` |

## 6. Migration

**State before:** The measuring pass takes no options: its waits on a live data source (the pool's acquire and the driver's complete listing) have no bound and no cancellation signal reaches it, although the run it is called from has one (s1: the reading of measure.ts and of the run driver). A stored area is measured by reading every entity of the repository and narrowing the list, for every kind of scope (s1: the reading of measure.ts and of the store's reads). The run driver measures the request and the context builder then measures the same resolved scope again for its planning call; the builder's input has no field for a measure already taken (s1: the reading of the callers). There is no setting for a time limit on a data source (s1: the search of the configuration catalog).

**State after:** The three exported measuring functions take an optional options argument with a cancellation signal and a time limit, and pass it to the two private functions that do the work on a live source: measureConnection, which holds the bounded wait, and measureDataPool, which checks the signal before each connection. Each live source is given one bounded wait, 120 seconds by default from the new setting `analyzer.dataSourceListingTimeoutMs`; a source that does not answer, and a request that is cancelled, give a measure that is not determined with its reason. A symbol scope is measured with a read by id and a file scope with the read of that file's entities (which still scans the entity table until ISSUE-61045de91faef1a0), with the whole-repository read as the fallback when the narrow read finds nothing. The run driver passes its signal to the measure and to the recursive planner, and hands its measure to the context builder, which uses it and does not measure; a caller that hands none is measured by the builder as before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the setting to the configuration catalog with its default and its reader; add the options argument to the three exported measuring functions and to the private measureConnection and measureDataPool; bound the wait on each live source in measureConnection and stop on the signal, checking it before each connection in measureDataPool. No caller passes options yet, so every caller gets the configured limit and no cancellation. — ↩ rollbackable
2. Read a symbol scope by id and a file scope by its file's entities, with the whole-repository read as the fallback; add the two readers to the pass's test seam. — ↩ rollbackable
3. Add the optional measure to the context builder's run input and leave it out of the bundle cache key; have the pipeline use a handed measure of a named area and measure otherwise. Add the optional signal to the planner's options. Have the run driver pass its signal to the measure and to the planner, and hand its measure to the context builder. — ↩ rollbackable
4. Update the guide (docs/daemon.md, where it describes how a request is measured and the settings) to state the time limit, its setting, the two new reasons, and that a run measures once. — ↩ rollbackable

**Backward compat:** No public API changes: the functions and types are internal to the analyze framework, and every addition is an optional argument or an optional field, so existing callers compile and behave as before. Behaviour that changes for a user: a data request on a source that takes longer than 120 seconds to be reached and listed used to wait and then be counted; it is now sized as the largest with the reason that the listing timed out, unless the setting is raised. No stored data is rewritten and no stored record changes shape: a measure that is not determined already exists and only gains two new reasons in its note. A configuration file written before the change has no value for the new setting and gets the default.

## 7. Alternatives considered

### 7.1 a1: Options on the measuring pass, and the run's measure handed to the context builder — **CHOSEN**

The measuring functions take an options argument (signal, time limit); the run passes its measure to the context builder in the builder's input.

measureRequestScope, measureResolvedScope and measureDataSource gain a last optional argument, MeasureOptions { signal?, sourceTimeoutMs? }. Each live source is given one bounded wait that covers reaching it and listing it; when the wait ends first the source is not determined with a reason that says the listing timed out, and when the signal fires the pass stops and returns not determined with a reason that says the request was cancelled. The default limit comes from a new setting in the configuration catalog (120 seconds). The stored-area read is chosen by the scope's kind: a point read for a symbol, the read of one file's entities for a file, today's read otherwise, with today's read as the fallback when the narrow read finds nothing. RunShapeInput gains an optional `measure`: the pipeline uses it for its planning call when given and measures as today when not. The run driver passes its measure and its signal; the recursive planner's options gain a signal for the child measures.

### 7.2 a2: A measure cache keyed by run and scope

The measuring pass remembers its result per run id, scope and target, so a second request for the same measure returns the first.

The pass keeps a map from (runId, scopeRef, target) to the measure taken. measureRequestScope and measureResolvedScope gain a runId argument and consult the map first. The context builder, which has the run id, gets the run driver's measure from the map without any change to its input; child plans that name the same source get the same listing. The time limit and the signal are added as in a1.

**Rejected because:** Fixes the double measure through shared state whose lifetime and keys must be got right; a stale or mismatched entry fails silently.

### 7.3 a3: The context builder is the only one that measures

The run driver stops measuring; the context builder measures and returns the measure with its bundle, and the driver reads the size from there.

The run driver no longer calls measureRequestScope. buildRunBundle returns the measure it took (it already puts a measure on the bundle's report) and the driver sets the intent's size from it afterwards. The time limit and the signal are passed through the builder's options.

**Rejected because:** Reorders the run's stages to remove one call; the cost and the risk are out of proportion to the defect.

## 8. References

- **[[c1]]** `code` `src/analyze/measure.ts` — "const listing = await r.listTables({ complete: true });"
- **[[c2]]** `code` `src/analyze/runtimes/shared/task-scope.ts` — "if (scope.kind === 'symbol') return e => e.id === scope.entityId;"
- **[[c3]]** `code` `src/db/entities.ts` — "export async function findEntitiesByFile(_db: DbClient, file: string): Promise<Entity[]> {"
- **[[c4]]** `code` `src/analyze/orchestrator/driver.ts` — "const measure = await measureRequestScope(unsized.scopeRef, unsized.target, args.scopeHint);"
- **[[c5]]** `code` `src/analyze/context/driver.ts` — "const area = await (steps.measureArea ?? measureResolvedScope)(args.scope, unsized.target, sizeHint);"
- **[[c6]]** `code` `src/analyze/planner/recursive.ts` — "const childMeasure = await measureRequestScope(childIntent.scopeRef, childIntent.target, childIntent.scope);"
- **[[c7]]** `code` `src/config/config-catalog.ts` — "{ path: 'codeReview.freshnessTimeoutMs', type: 'number', default: 120000,"
- **[[c8]]** `code` `src/analyze/planner/types.ts` — "export interface PlanBuilderOpts {"
- **[[c9]]** `code` `src/analyze/context/types.ts` — "export interface RunShapeInput {"
- **[[c10]]** `prior-artifact` `docs/standalone/defect-analyzer-s-request-measure-src-E20261010008e146a/ISSUE.md` — "A live data source is measured within a bounded time."
- **[[c11]]** `stakeholder` `The stakeholder's decision of 2026-10-10 on the default time limit` — "approve with 120 seconds per source"
- **[[c12]]** `stakeholder` `The acceptance criteria this design states, from the three points of the issue's fix intent` — "ac1: a live source is measured within a bounded time, and one that does not answer is not determined with a reason that says the listing timed out, never a count. ac2: a cancelled request stops measur"
- **[[c13]]** `code` `src/daemon/analyze-rpc.ts` — "const measure = await measureRequestScope(parsed.intent.scopeRef, parsed.intent.target, parsed.intent.scope);"
- **[[c14]]** `prior-artifact` `docs/standalone/graph-store-has-no-index-entities-E2026101061045de9/ISSUE.md` — "The graph store keeps entity rows keyed by a numeric id and has no index by repository or by file."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T12:45:11.920Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| fix-targets-defect | MED | Reading a file scope through findEntitiesByFile (src/db/entities.ts) makes the stored-area read no wider than the scope needs, so a file scope no longer causes every entity of its repository to be read. | findEntitiesByFile (src/db/entities.ts:795-811) has no file index. It walks the whole entity table of every registered repository: `for (const { key, value } of store.entity.getRange()) { const row = decodeEntityRow(value as Buffer); const repoPath = lookupRepoPath(...); if (toAbsolutePath(row.filePath, repoPath) !== file) continue;`. Today's listEntitiesForRepo (779-793) walks the same range and skips on `row.repoId !== repoId`. So the file read still decodes every stored row, of all repositories, and adds a path computation per row; it only avoids building the Entity objects of the other files. The only by-file index in src/db is `unresolvedByFile`, which is for relations. The symbol read is narrow: getEntity (585-593) is a point read through `store.entityIdByString.get(id)`. [files: src/db/entities.ts, src/analyze/measure.ts] | Either add a store read that is narrow for a file (an index by repository and file, or a range read limited to the repository) and name it as a change site in src/db, or state in the design that the file scope only avoids building entities and still scans the table, and reduce ac4 to match. |
| fix-targets-defect | MED | Leaving the analyze RPCs unchanged leaves out nothing of the fix intent 'one run takes one measure of the area it names'; only runAnalyze measures and then builds the context. | The plan RPC has the same double measure as runAnalyze. src/daemon/analyze-rpc.ts:460 `const measure = await measureRequestScope(parsed.intent.scopeRef, parsed.intent.target, parsed.intent.scope);` is followed at 475-478 by `const contextBundle = await shaper.buildRunBundle({ intent }, { runId: parsed.runId });`, and the builder measures again at src/analyze/context/driver.ts:1378. Section 3.6 says the analyze RPCs 'hand no measure and are measured as today', so this path still measures twice, and waits on a stalled live source twice (up to 240 seconds for one source at the default). [files: src/daemon/analyze-rpc.ts, src/analyze/context/driver.ts] | Hand the measure to buildRunBundle at src/daemon/analyze-rpc.ts:475 as well, and add the file to the call sites of 3.3 and 3.6; or state in the design why the plan RPC is out of scope. |
| change-sites | MED | Adding the options argument to the three exported functions (measureRequestScope, measureResolvedScope, measureDataSource) covers every place a live source is reached and listed, including a data request on a repository with several connections. | The waits the design bounds are not in measureDataSource. They are in the private measureConnection (measure.ts:444-494): `driver = await pool.acquire(id);` at 456 and the three listings at 466, 476 and 484. The several-connections path does not go through measureDataSource at all: measureDataPool (502-523) calls `const one = await measureConnection(pool, id, undefined);` at 512, although its own comment says 'one call of `measureDataSource` per connection id'. measureDataSource (428-439) only awaits `acquireDataPool(scope.poolPath)` and `pool.reload()` before handing over to measureConnection. The design's section 2 and its 'State after' name only 'the three measuring functions'; measureConnection and measureDataPool are named nowhere. Built as listed, the pool path keeps an unbounded wait and no signal check between connections. [files: src/analyze/measure.ts] | Name measureConnection (the bounded wait around acquire and the listing) and measureDataPool (the signal check before each connection, and passing the options on) as change sites. Say whether measureDataSource's own `acquireDataPool` and `pool.reload()` are inside the bounded wait. |

#### Could not verify (does not block)

_None._
