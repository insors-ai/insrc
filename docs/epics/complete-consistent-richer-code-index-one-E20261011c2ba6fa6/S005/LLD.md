<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s5 -->

# LLD: E20261013c2ba6fa6:S005

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `8ec1c5d92f54...`

A request about code the index does not hold is refused before the run announces any size, with the same code and message as today. A request about a repository that is being indexed, or whose last index ended in an error before it completed, is refused with a new named error, repo-indexing, that says how far the run got, at the analyzer's scope check and at the daemon's graph-reading search requests; requests about other repositories are answered as usual. The four context-builder defects of ISSUE-e2bcadd9 are closed: the tool loop names the call that failed, a failed read of the last-indexed time or a failed lookup is a named cause with its own code, a cached bundle is returned before the scope is resolved, and a failed model call is recognised from what the provider itself raised, not from text echoed in an answer.

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

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase A — a daemon that stays up and reads that tell the truth

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes. — owns `sc1`
- `s2`: The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism. — owns `sc2`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s4`: The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `runAnalyze`

```typescript
runAnalyze(args: RunAnalyzeArgs, opts: RunAnalyzeOpts): Promise<RunAnalyzeResult>   // src/analyze/orchestrator/driver.ts; signature unchanged
```

**Parameters:**
- `args: RunAnalyzeArgs` — As today: the prompt, the scope reference, optional target and size hints.
- `opts: RunAnalyzeOpts` — As today: run id, event sink, abort signal.

**Returns:** `Promise<RunAnalyzeResult>` — As today.

**Errors:**
- `failure ScopeNotIndexedError (code as today)` when The scope names code the index does not hold: the run ends at the classify stage with today's code and message, and no 'classified' event is emitted.
- `failure RepoIndexingError (code 'repo-indexing')` when The scope's repository is being indexed, or its last index ended in an error before it completed (see ensureNonEmptyClosure).

**Preconditions:**
- As today.

**Postconditions:**
- After classification (both branches: the classifier and the hinted target) and BEFORE measureRequestScope and the 'classified' event, the run resolves the intent's scope and runs ensureNonEmptyClosure on it for a run whose source is code (the case in which runShaper runs it today). A refusal ends the run with the same failure record and code as runShaper's refusal produces today; no size is measured or announced for it (stakeholder decision D1, 2026-10-13).
- runShaper keeps its own check for every other entry point (analyze.context.buildRun, the step tools); a run that already passed the check in runAnalyze is not checked again (runShaper is told so through its args).

### 2.2 `ensureNonEmptyClosure`

```typescript
ensureNonEmptyClosure(scope: ResolvedScope, deps?: Pick<ScopeDeps, 'listRepos' | 'listEntitiesForRepo'> & { indexRun?: (repoPath: string) => IndexRunView | undefined }): Promise<string | undefined>
```

**Parameters:**
- `scope: ResolvedScope` — As today.
- `deps: readers` _(optional)_ — As today, plus the reader of the running index's progress (defaults to the daemon's in-process record).

**Returns:** `Promise<string | undefined>` — As today: the matching repository's path, or undefined for a connection scope.

**Errors:**
- `RepoIndexingError (new, code 'repo-indexing')` when The matching repository's status is 'indexing' (whatever its entity count), or 'error' with a last run whose outcome is 'failed'. The message and data state the repository, its status, and the run's figures: when it began, files done of files selected, and for a failed run when it ended and its error. A repository left 'indexing' after a daemon restart with no running record is refused as being indexed, with the figures unknown.
- `ScopeNotIndexedError (unchanged)` when As today for every other case: no registered repository contains the path, a 'pending' repository with no entities, or a 'ready' repository with no entities.

**Preconditions:**
- Runs in the daemon, where the running index's record lives.

**Postconditions:**
- The 'indexing' and failed-'error' states are refused with RepoIndexingError before the entity count is read, so a half-built index is never answered from and never reported as 'not indexed'.
- The registry-read-failed and pristine-registry skips are unchanged.

### 2.3 `runShaper`

```typescript
runShaper(args: RunShaperArgs): Promise<AnalyzeContextBundle>   // src/analyze/context/driver.ts; signature unchanged
```

**Parameters:**
- `args: RunShaperArgs` — As today, plus an optional flag that the scope was already checked by runAnalyze.

**Returns:** `Promise<AnalyzeContextBundle>` — As today.

**Errors:**
- `ShaperIndexStateReadError (new, code 'index-state-read-failed')` when The read of the scope repository's last-indexed time throws (in the freshness step, or inside the lookup pipeline).
- `ShaperLookupFailedError (new, code 'lookup-failed')` when The lookup executor (steps.executePlan) throws.
- `as today` when Every existing typed error, with its code and message.

**Preconditions:**
- As today.

**Postconditions:**
- The cache lookup comes first: the cache key does not depend on the resolved scope, so a cached bundle is looked up before the scope is resolved. On a hit, the freshness watermark is read for the repository the cached bundle records (its meta's repository) and nothing else is resolved; a failure to resolve something the cache does not depend on (another repository's connections file) cannot make the hit unreachable. On a miss the scope is resolved once, and the pairing check, ensureNonEmptyClosure and the pipeline run as today.
- A throw from the last-indexed read or from executePlan becomes a pipeline cause ('index-state-read-failed', 'lookup-failed') and so a typed error, never a raw rejection reported as 'internal-error'.

### 2.4 `classifyOllamaError`

```typescript
classifyOllamaError(err: unknown, call: ShaperModelCall): Error
```

**Parameters:**
- `err: unknown` — The tool loop's failure.
- `call: ShaperModelCall` — The call that failed; the tool loop passes 'tool loop' (a new member of ShaperModelCall).

**Returns:** `Error` — A ShaperLlmUnavailableError worded by the call ('The model call for the tool loop failed: <detail>') when the error is a failed model call, else the error unchanged. The provider is named only through the failure's own detail, so Ollama appears only when the failure came from Ollama.

**Postconditions:**
- No message built by the analyzer names a provider the failure did not come from.

### 2.5 `isModelCallFailure`

```typescript
isModelCallFailure(err: unknown): boolean   // src/analyze/context/model-failure.ts; signature unchanged
```

**Parameters:**
- `err: unknown` — As today.

**Returns:** `boolean` — True when the call to the model failed: a ModelCallFailedError, or a message that BEGINS (after the retry helper's prefix) with a provider's own failure wording, CLI or local.

**Postconditions:**
- The local provider's connection and stream failures are raised as ModelCallFailedError (src/agent/providers/ollama.ts wrapOllamaError and its call sites), so a real connection failure, wrapped by the retry helper or not, is recognised as typed.
- The Ollama and socket texts are no longer matched anywhere inside a message: a validation message that quotes a value containing 'ECONNREFUSED', 'Model not found', 'EPIPE' or 'fetch failed' is a failure of shape.

### 2.6 `fullIndex`

```typescript
private fullIndex(repoPath: string): Promise<void>   // src/indexer/index.ts, Indexer; signature unchanged
```

**Parameters:**
- `repoPath: string` — As today.

**Returns:** `Promise<void>` — As today.

**Postconditions:**
- When it sets status 'indexing' it opens the repository's running record (began at; files selected once the walk has counted them; files done as each file finishes) in the daemon's in-process index-run record.
- When it ends it writes the run's final figures once onto the registry row's lastRun (began, ended, files selected, files done, outcome 'completed' or 'failed', and the error for a failed run) in the same update that sets the status, and closes the running record (stakeholder decision D2, option B). No write happens per file.

### 2.7 `search.callers / search.callees / search.callers_nhop / search.by_file / search.closure / entity.summary / entity.closure / entity.unreachable / repo.depends_on / repo.search_cross_repo / locate.inferParents`

```typescript
daemon unary requests in src/daemon/index.ts; parameters and results unchanged
```

**Parameters:**
- `params: as today` — Each names one repository: by path (repoPath, repoId), by file (filePath), or by entity (entityId, whose stored root path gives the repository).

**Returns:** `as today` — As today for a repository that is not being indexed.

**Errors:**
- `RepoIndexingError (code 'repo-indexing')` when The named repository is being indexed or its last index failed, by the same rule and wording as ensureNonEmptyClosure. Over the request socket the error is a string, so it starts with its code: 'repo-indexing: ...'.

**Postconditions:**
- No partial result is returned for a repository under index.
- search.query, which searches every registered repository and names none, leaves repositories under index out of the set it searches and answers from the others; it does not refuse.

### 2.8 `classifyShaperError`

```typescript
classifyShaperError(err: unknown): { code: string; message: string; data?: unknown }   // src/daemon/analyze-rpc.ts
```

**Parameters:**
- `err: unknown` — As today.

**Returns:** `{ code, message, data? }` — As today, plus 'repo-indexing' (data: repository, status, run figures), 'index-state-read-failed' and 'lookup-failed', each with the error's own message.

**Postconditions:**
- None of the three new errors falls into 'internal-error'.
- The step tools (the analyze step, the one-shot analyze) map RepoIndexingError to an error reply with code 'repo-indexing'; the workflow steps, triage and code review pass that reply on as it is.

## 3. Data model changes

### 3.1 `RepoRow / RegisteredRepo (the registry row)` — field-add

An optional lastRun: { startedAt: number; endedAt: number; filesSelected: number; filesDone: number; outcome: 'completed' | 'failed'; error?: string } written once at the end of a full index. The row is msgpack decoded with defaults (decodeRepoRow), so an older row reads with lastRun undefined; no key, kind byte or existing field changes, and no migration step rewrites rows.

```
+ lastRun?: { startedAt: number; endedAt: number; filesSelected: number; filesDone: number; outcome: 'completed' | 'failed'; error?: string | undefined } | undefined
```

**Call sites:**
- `src/db/graph/codec.ts`
- `src/shared/types.ts`
- `src/db/repos.ts`
- `src/indexer/index.ts`

### 3.2 `IndexRunView (the in-process running-index record)` — new

Held in the daemon process, one per repository with a full index in progress: { repoPath, startedAt, filesSelected?, filesDone }. Written by fullIndex, read by ensureNonEmptyClosure and the search requests' guard; never stored.

**Call sites:**
- `src/indexer/index.ts`
- `src/analyze/context/invariants.ts`
- `src/daemon/index.ts`

### 3.3 `PIPELINE_CAUSES` — invariant-change

Gains 'index-state-read-failed' and 'lookup-failed'; errorForPipelineCause gains one case for each (ShaperIndexStateReadError, ShaperLookupFailedError).

**Call sites:**
- `src/analyze/context/driver.ts`
- `src/daemon/analyze-rpc.ts`

### 3.4 `ShaperModelCall` — field-modify

'planning' | 'answer writing' gains 'tool loop'; ShaperLlmUnavailableError is always built with a call, so its Ollama-specific wording is retired.

**Call sites:**
- `src/analyze/context/driver.ts`

## 4. Error paths

**Error cases**

- **A run's scope names a path no registered repository contains (or a 'pending'/'ready' repository with no entities).** (recoverable)
  - Detection: ensureNonEmptyClosure, now called by runAnalyze right after classification and before measureRequestScope, throws ScopeNotIndexedError.
  - Response: The run is recorded as failed at the classify stage with the same code and message as runShaper's refusal produces today; the run's 'done' carries the failure; no 'classified' event and no measure are emitted.
  - User impact: The caller is told the scope is not indexed and never sees the request announced as the largest size.
- **A request names a repository whose full index is in progress.** (recoverable)
  - Detection: ensureNonEmptyClosure (analyzer) and the search requests' guard read the registry status 'indexing' and the daemon's in-process index-run record for that path.
  - Response: RepoIndexingError, code 'repo-indexing', stating the repository, that it is being indexed, when the run began and files done of files selected (or 'not yet counted' before the walk has counted them). The analyzer maps it to code 'repo-indexing' with the figures as data; the search requests answer with an error string that starts 'repo-indexing:'.
  - User impact: No answer from a half-built index; the user sees how far the index has got and can retry later.
- **A request names a repository whose last full index failed before it completed.** (recoverable)
  - Detection: The registry row's status is 'error' and its lastRun.outcome is 'failed'.
  - Response: RepoIndexingError, code 'repo-indexing', stating that the last index ended in an error, with lastRun's began, ended, files done of selected and error text.
  - User impact: The user learns the index is incomplete and why, instead of an answer from partial data or 'not indexed'.
- **The daemon restarted during a full index: the row still says 'indexing' and there is no in-process record (until the start-up re-queue begins a new run).** (recoverable)
  - Detection: Status 'indexing' with no IndexRunView for the path.
  - Response: RepoIndexingError stating that the repository is being indexed and that the run's figures are not known yet.
  - User impact: Refused, honestly, without invented figures; once the new run starts the figures appear.
- **The read of a repository's last-indexed time throws (store error) in runShaper's freshness step or inside the pipeline.** (recoverable)
  - Detection: The awaited read rejects; it is caught where it is awaited.
  - Response: The pipeline cause 'index-state-read-failed' and ShaperIndexStateReadError with the read's own message; classifyShaperError maps it to code 'index-state-read-failed'.
  - User impact: A named cause instead of 'internal-error'.
- **The lookup executor (executePlan) throws (a lookup that crashes, a store error).** (recoverable)
  - Detection: The awaited executePlan rejects; it is caught where it is awaited.
  - Response: The pipeline cause 'lookup-failed' and ShaperLookupFailedError with the executor's message; mapped to code 'lookup-failed'.
  - User impact: A named cause instead of 'internal-error'.
- **A model call in the tool loop fails, served by a CLI provider.** (recoverable)
  - Detection: classifyOllamaError(err, 'tool loop') finds a failed model call (isModelCallFailure).
  - Response: ShaperLlmUnavailableError 'The model call for the tool loop failed: <the failure's own detail>'.
  - User impact: The message names the call and only the provider the failure came from.
- **The local provider cannot reach Ollama (connection refused, socket hang up, stream ended early).** (recoverable)
  - Detection: wrapOllamaError and the provider's call sites raise ModelCallFailedError for a failed call; isModelCallFailure recognises the type, and the retry helper's prefix does not hide it.
  - Response: A failed model call, as today.
  - User impact: Unchanged: a real outage is still reported as the model being unavailable.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A model answer that fails schema validation with a message quoting a value containing 'ECONNREFUSED' (no ' text=' marker). | A failure of shape (answer-invalid / schema), not a failed model call. |
| A cached bundle for a request whose scope is a connection, while another registered repository's connections file does not parse. | The cached bundle is returned; scope resolution, which would throw on the broken file, is not run on a hit. |
| A cached bundle for a repository that has since been reindexed (newer last-indexed time). | Freshness is checked against the repository the bundle records, as today; a stale bundle is a miss and the request is built normally. |
| search.query while one registered repository is being indexed. | Results from the other repositories only; no refusal, no rows from the repository under index. |
| A request with a hinted target (slash command) on an unindexed scope. | Refused before measuring, like the classifier branch, after hintedIntentBase's own checks. |
| A run for a non-code source (docs, data, infra, generic) whose scope is a repository being indexed. | Refused with RepoIndexingError like code: the indexing refusal applies to every source that reads the index, while the empty-closure refusal stays code-only as today. |
| A full index that completes: the row's lastRun gets outcome 'completed'. | Status 'ready'; requests answered; lastRun visible on the row for later reads. |
| A reindex (repo.reindex) of a 'ready' repository. | Status goes to 'indexing' and requests are refused with the new run's figures until it completes. |

**Invariants to preserve**

- A refused request keeps the code and message it has today (ScopeNotIndexedError's text, the run's failure record and its code), only earlier in the run. [[c1]]
- runShaper resolves the scope once for a request that is actually built, and checks the pairing of the scope's kind with the kind of source before building. [[c2]]
- Every way the pipeline declines to proceed is one member of PIPELINE_CAUSES with one case in errorForPipelineCause; no cause falls into a default error. [[c2]]
- A CLI provider's failure wording is recognised only at the start of the message, after the retry helper's prefix. [[c3]]
- The four repository status values keep their meaning; the start-up re-queue of a repository left 'indexing' without lastIndexed is unchanged. [[c4]]
- The search requests keep their parameters and results for a repository that is not being indexed. [[c5]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), under Node 22; stores on temporary paths (setGraphStorePath / useTemporaryLance), no model`

**Test levels**

- **unit** — Each decision point on its own, with the existing seams (RunShaperArgs.pipelineSteps / scopeDeps, ensureNonEmptyClosure deps, stand-in providers).
  - Subjects: `run order: a code request on a path no registered repository contains emits no 'classified' event and no measure substep, and ends failed at classify with the same code and message as runShaper's refusal (recorded from today's code before the change)`, `run order: the same on the hinted-target branch`, `run order: a request that passes the check still emits 'classified' with its measure, as before`, `ensureNonEmptyClosure: status 'indexing' (with and without entities) throws RepoIndexingError with the running record's figures; 'indexing' with no record says the figures are not known; 'error' with lastRun.outcome 'failed' throws with lastRun's figures and error; 'pending' and 'ready' with no entities keep ScopeNotIndexedError and its message`, `runShaper cache order: a cache hit does not call scope resolution (a scopeDeps that throws is never reached) and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle`, `runShaper: a lastIndexedAt that throws ends as ShaperIndexStateReadError (code 'index-state-read-failed'), in the freshness step and in the pipeline`, `pipeline: an executePlan that throws ends as ShaperLookupFailedError (code 'lookup-failed'); PIPELINE_CAUSES and errorForPipelineCause have one case per member`, `classifyOllamaError: a CLI provider's failure in the tool loop reads 'The model call for the tool loop failed: ...' and does not mention Ollama; an Ollama failure's own detail is kept`, `isModelCallFailure: a validation message quoting 'ECONNREFUSED' / 'Model not found' / 'EPIPE' / 'fetch failed' without ' text=' is not a failed call; a ModelCallFailedError from the local provider, bare and behind the retry helper's prefix, is`, `OllamaProvider: a connection refused / socket hang up / stream ended early is raised as ModelCallFailedError`, `classifyShaperError: the three new errors map to 'repo-indexing' (with data), 'index-state-read-failed' and 'lookup-failed'`, `registry codec: a row with lastRun round-trips; an older row without it decodes with lastRun undefined`
  - Fixtures: `a temporary graph store with registered repositories in each status`, `stand-in pipeline steps and scope readers`, `an in-process index-run record set by the test`, `a stand-in Ollama client that fails with a socket error`
- **integration** — The indexing refusal end to end in the daemon's code, and the indexer's record.
  - Subjects: `full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted)`, `search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before`, `search.query while one repository is being indexed returns rows from the other repositories only`, `analyze through the daemon (analyze.context.buildRun and the step tools via step.call) on a repository being indexed returns code 'repo-indexing' with the figures; the workflow step that reaches it passes the reply on unchanged`
  - Fixtures: `a temporary graph store and vector store`, `a small temporary repository indexed by the real indexer, with a hook that holds the walk mid-run`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `run order: a code request on a path no registered repository contains emits no 'classified' event and no measure substep, and ends failed at classify with the same code and message as runShaper's refusal`, `run order: the same on the hinted-target branch`, `run order: a request that passes the check still emits 'classified' with its measure, as before` |
| `ac2` | `runShaper: a lastIndexedAt that throws ends as ShaperIndexStateReadError (code 'index-state-read-failed'), in the freshness step and in the pipeline`, `classifyShaperError: the three new errors map to 'repo-indexing' (with data), 'index-state-read-failed' and 'lookup-failed'` |
| `ac3` | `classifyOllamaError: a CLI provider's failure in the tool loop reads 'The model call for the tool loop failed: ...' and does not mention Ollama`, `pipeline: an executePlan that throws ends as ShaperLookupFailedError (code 'lookup-failed')`, `runShaper cache order: a cache hit does not call scope resolution and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle`, `isModelCallFailure: a validation message quoting 'ECONNREFUSED' / 'Model not found' / 'EPIPE' / 'fetch failed' without ' text=' is not a failed call; a ModelCallFailedError from the local provider, bare and behind the retry helper's prefix, is`, `OllamaProvider: a connection refused / socket hang up / stream ended early is raised as ModelCallFailedError` |
| `ac4` | `ensureNonEmptyClosure: status 'indexing' (with and without entities) throws RepoIndexingError with the running record's figures; 'error' with a failed lastRun throws with its figures`, `full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once`, `search requests about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before`, `search.query while one repository is being indexed returns rows from the other repositories only`, `analyze through the daemon on a repository being indexed returns code 'repo-indexing' with the figures` |

## 6. Migration

**State before:** Per the s1 bundles: runAnalyze measures the request and emits 'classified' (driver.ts:325) before runShaper's ensureNonEmptyClosure refuses an unindexed scope; runShaper resolves the scope before the cache lookup and awaits the last-indexed read and the lookup executor bare; the tool loop builds ShaperLlmUnavailableError without a call (Ollama wording); isModelCallFailure matches Ollama/socket texts anywhere outside ' text='. A repository being indexed is reported only by its registry status; its progress is only logged, and a request about it is answered from the half-built index (or, with no entities yet, refused as not indexed). The registry row has no record of the last run.

**State after:** A refused scope is refused before any size is measured or announced, with today's code and message. Requests about a repository under index (or whose last index failed) are refused with RepoIndexingError, code 'repo-indexing', carrying the run's figures from the daemon's in-process record or the row's lastRun; search.query skips such repositories. The last-indexed read and the lookup executor are named pipeline causes with their own codes; a cached bundle is returned without resolving the scope; the tool loop names the call; a failed model call is recognised from the provider's typed failure or the start of its own message.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Close ISSUE-e2bcadd9's four defects in the analyzer (tool-loop call name, the two named causes and their codes, cache before scope, the provider's typed failure and start-of-message matching), each with its test. — ↩ rollbackable
2. Move the scope refusal ahead of the measure and the 'classified' event in runAnalyze, keeping runShaper's own check for its other entry points and skipping it when the run already checked. — ↩ rollbackable
3. Add the optional lastRun field to the registry row's type and codec (decoded as absent for older rows) and have the full index write it once at its end, beside the status update; add the in-process index-run record that the full index opens and closes. — ↩ rollbackable
4. Add RepoIndexingError and its code; make ensureNonEmptyClosure refuse an 'indexing' or failed-'error' repository with it; add the same guard to the graph-reading search requests, and have search.query skip repositories under index; map the code in classifyShaperError and the step tools. — ↩ rollbackable
5. Ship with the daemon update; no store migration and no re-index are needed. — ↩ rollbackable

**Backward compat:** No request parameter or result shape changes. A refused unindexed scope keeps its code and message (only earlier in the run, without the 'classified' event before it). New error codes ('repo-indexing', 'index-state-read-failed', 'lookup-failed') replace answers from a half-built index and 'internal-error' respectively; a client that matches error codes sees new values for those cases. The registry row's new optional field is ignored by older readers; an older daemon reading a row written by the new one decodes it without the field (msgpack with unknown keys kept as extra properties). The tool-loop failure message changes wording ('The model call for the tool loop failed: ...').

## 7. Alternatives considered

### 7.1 a1: Refuse before announcing; progress held by the daemon in memory — **CHOSEN**

The run checks the scope before it measures or emits 'classified'; the indexer records its running job's progress in an in-memory record in the daemon that one guard reads for the analyzer and the search requests.

ISSUE-a6940f8a: the run driver (src/analyze/orchestrator/driver.ts) calls the existing scope refusal (ensureNonEmptyClosure, extended by the indexing check below) right after classification and before measureRequestScope, so a refused request ends with today's code and message and no 'classified' event is emitted for it; runShaper keeps its own call for the other entry points. ac4: the full index (src/indexer/index.ts) writes, for the repository it is indexing, a progress record in the daemon process (started at, files selected, files done, and on failure the error and how far it got), cleared when the run completes; a single guard function, given a repository path, refuses with a new named error RepoIndexingError (its own code) when the repository's status is 'indexing', or 'error' with no completed index since, stating the status and the progress; the analyzer's scope check and the graph-reading search requests of src/daemon/index.ts call it. ISSUE-e2bcadd9: the tool loop's error names the call that failed; the last-indexed read and the lookup executor become named causes of the pipeline (and the last-indexed read in runShaper's own step is caught the same way); the cache lookup moves before scope resolution, with the freshness watermark read after a hit only for the hit's own repository; the Ollama and socket failure texts are matched only where the local provider writes them, not in validation text.

### 7.2 a2: Announce as uncounted; progress on the registry row

The 'classified' event keeps its place but carries an explicit uncounted size when the measure was not determined; the indexer writes its progress onto the repository's registry row, which the guard reads.

ISSUE-a6940f8a: the order of the run is unchanged; when the measure is not determined the intent and the event carry the size as a distinct 'uncounted' value (or the event drops the size), so a consumer cannot mistake it for XL; the refusal still happens in runShaper. ac4: the registry row (RegisteredRepo) gains progress fields (started at, files selected, files done, last error) that the full index updates every N files and on completion or failure; the guard reads them from the store. ISSUE-e2bcadd9 as in a1.

**Rejected because:** Meets the criteria but announces requests that will be refused and adds per-N-files writes during the busiest time; both points were decided against by the stakeholder.

### 7.3 a3: Gate at the daemon's request entry, status only

A wrapper around the daemon's search and analyze handlers refuses any request about a repository whose status is 'indexing' or 'error', from the registry status alone; the run's order changes as in a1.

ISSUE-a6940f8a as in a1. ac4: the handler map in src/daemon/index.ts wraps the graph-reading search requests and the analyze entry points (analyze.* and step.call's analyze tools) in a gate that resolves the request's repository and refuses with RepoIndexingError from the registry status; the message gives the status and lastIndexed, without a count of files. ISSUE-e2bcadd9 as in a1.

**Rejected because:** Cheapest, but violates ac4 and duplicates each handler's repository resolution at the entry.

## 8. References

- **[[c1]]** `step-output` `s1 context.assemble`
- **[[c2]]** `step-output` `s2-s3 alternatives and judgment`
- **[[c3]]** `step-output` `s4 contract.detail`
- **[[c4]]** `step-output` `s5-s7 error paths, tests, migration`
- **[[c5]]** `stakeholder` `Decisions D1 (refuse before announcing) and D2 (option B: progress in memory, final figures written once to the registry row), 2026-10-13`
- **[[c6]]** `step-output` `s8 checklist.verify`

## 9. Open questions

- cd2 (partial): The search requests' params are given as 'as today' (each handler's existing typed params) rather than restated.
- dm1 (partial): src/db/repos.ts (updateRepoStatus, which writes the row) was read directly, not cited in an s1 bundle.
- alt2 (partial): The other Epic constraints (k1, k3, k4, k6-k11) are not scored one by one; none distinguishes the alternatives (no model calls, no kind bytes, no ignore rules are involved).
