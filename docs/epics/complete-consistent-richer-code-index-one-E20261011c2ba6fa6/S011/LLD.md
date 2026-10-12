<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s11 -->

# LLD: E20261012c2ba6fa6:S011

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `8ec1c5d92f54...`

The seven tools that do their work in the MCP server's process today (one-shot analyze, the analyze, workflow, build, review and code-review steps, and triage) move into the daemon behind one streamed daemon request, step.call, and each MCP tool becomes a forwarder that sends its arguments and returns the daemon's reply unchanged. Their multi-turn state stores move with them, so a state token outlives the MCP process. The MCP server then loads no store code at all: the temporary reader allowance of Story s4 is deleted, and the vector store gains the same owner rule as the graph store.

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
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `step.call (new daemon stream request)`

```typescript
step.call: (params: { tool: StepToolName; args: unknown; context: StepCallContext }, send: (msg: IpcStreamMessage) => void, signal: AbortSignal) => Promise<void>   // ends with one 'done' frame whose data is the tool's reply envelope, or one 'error' frame
```

**Parameters:**
- `tool: 'insrc_analyze' | 'insrc_analyze_step' | 'insrc_workflow_step' | 'insrc_build_step' | 'insrc_review_step' | 'insrc_code_review_step' | 'insrc_triage'` — Which moved handler to run; looked up in one table in the daemon.
- `args: unknown` — The tool's raw arguments exactly as the MCP client sent them; each handler validates its own input as it does today.
- `context: StepCallContext` — What the handler used to read from the MCP process: its working directory, its INSRC_REPO, and the calling client.

**Returns:** `Promise<void>; the 'done' frame's data is the handler's reply envelope ({ content: [{ type: 'text', text }], isError? })` — The same envelope the handler returned in the MCP process before this change, byte for byte. Prompts, schemas and state tokens are fields of the text inside it and are not touched by the host or the forwarder.

**Errors:**
- `'error' frame { code: 'step-unknown-tool' }` when tool is not in the daemon's table (a forwarder newer than the daemon).
- `'error' frame { code: 'step-failed', error }` when the handler threw instead of returning an envelope; the message is the thrown error's.

**Preconditions:**
- The daemon has declared itself the store's owner (Story s4), so the handlers' store reads succeed in this process.

**Postconditions:**
- The handler ran inside the daemon under an AsyncLocalStorage scope holding the context, so the code that read process.cwd(), process.env.INSRC_REPO or the MCP client's identity now reads the context.
- A state token minted in an earlier step.call, from any MCP process, is accepted by a later one until it expires (1 h) or is evicted (100 entries), as today.
- When the requesting socket closes the stream's AbortSignal fires. This is NEW work, not an existing seam: handleReviewStep and handleCodeReviewStep gain an optional signal (in their deps), and pass it to the daemon review wait (review-step/phases/start.ts:151) and the daemon code-review wait (code-review-step/handler.ts:689), which today take only { timeoutMs }. Handlers without a signal run to completion and their reply is discarded.
- Inside the daemon the moved handlers do not connect back to the daemon's own socket. Their calls over src/mcp/daemon-stream.ts today (workflow.review via reviewArtifactStream from review-step/phases/start.ts:27; codeReview.run, codeReview.grounding and codeReview.freshness from code-review-step/handler.ts:33-34) go through an in-daemon client with the same function shapes that calls the registry's handler functions in-process; a stream handler is called as (params, send, signal) with a send that collects its frames. The wiring: src/daemon/index.ts builds the request handler maps it passes to the IpcServer (the unary map and the stream map, held privately by the server today); it now builds the in-daemon client from those same two maps and hands it to the step host when the host is created, so the client calls exactly the functions the socket would reach. No handler is duplicated or exported one by one.
- The in-daemon client keeps the failure behaviour of reviewStreamRequest (daemon-stream.ts:452-528) exactly: it enforces opts.timeoutMs itself and fails with ReviewStreamError('timeout'); an aborted signal fails with ReviewStreamError('aborted'), as daemon-stream.ts:455 does today, so it keeps its error code 'daemon-review-aborted' and stays non-retryable (start.ts:142, handler.ts:669); an 'error' frame becomes ReviewStreamError('daemon-error', error, reason), so reason 'diff-unavailable' still drives the code-review diff fallback; 'unreachable' cannot occur in-process. ReviewStreamError and the types ReviewStreamOpts, ReviewArtifactStreamParams, CodeReviewStreamParams and CodeReviewStreamResult move from daemon-stream.ts to a module both sides import (src/shared/review-stream.ts); daemon-stream.ts re-exports them, so its existing importers are unchanged.

### 2.2 `runInsrcMcpStdio`

```typescript
runInsrcMcpStdio(): Promise<void>
```

**Returns:** `Promise<void>` — Serves the same 12 tools with the same names, descriptions and input schemas.

**Postconditions:**
- It no longer registers the daemon's builtin tools, data drivers or workflow runners in-process, and no longer calls declareLiveStoreReaderUntilS11, which is deleted.
- The seven moved tools are registered as forwarders over step.call; insrc_workflow_run, insrc_workflow_approve, insrc_docgen and insrc_guide keep their existing daemon requests; insrc_schema stays in the MCP process (it reads the registration only).
- No module in the MCP server's import graph, apart from the request clients (src/shared/ipc-client.ts, src/mcp/daemon-stream.ts), imports src/db, src/analyze or the moved handlers.

### 2.3 `forwardStep (MCP-side forwarder, replaces the in-process calls of handleAnalyzeStep, handleWorkflowStep, handleBuildStep, handleReviewStep, handleCodeReviewStep, handleTriageStep and the one-shot analyze body)`

```typescript
forwardStep(tool: StepToolName, rawArgs: unknown, extra: { clientName?: string; progressToken?: string | number }): Promise<StepMcpEnvelope>
```

**Parameters:**
- `tool: StepToolName` — The tool being forwarded.
- `rawArgs: unknown` — The client's arguments, unparsed.
- `extra: { clientName?: string; progressToken?: string | number }` — The MCP client's name (for the caller identity) and its progress token when it asked for progress.

**Returns:** `Promise<StepMcpEnvelope>` — The 'done' frame's envelope, unchanged; or an error envelope (isError true) naming DaemonUnreachableError or DaemonTooOldError.

**Errors:**
- `DaemonUnreachableError (code 'daemon-unreachable', returned as an isError envelope)` when The daemon socket refuses the connection or does not exist (ENOENT/ECONNREFUSED).
- `DaemonTooOldError (code 'daemon-too-old', returned as an isError envelope)` when The daemon answers 'unknown method: step.call', or an error frame with code 'step-unknown-tool'.

**Preconditions:**
- None on the MCP process: it never touches a store or runs the handler itself, also not as a fallback.

**Postconditions:**
- context.cwd is the MCP process's process.cwd(), context.envRepo its INSRC_REPO when set, and context.client 'claude' | 'codex': detectClientProvider (server.ts:1399-1405) returns 'cli-claude' | 'cli-codex', and the forwarder converts it as the code-review registration does today (server.ts:786).
- Progress frames are relayed as MCP progress notifications only when the client sent a progressToken; otherwise they are dropped.

### 2.4 `resolveRepoPath`

```typescript
resolveRepoPath(explicit: string | undefined, deps?: ResolveRepoDeps): Promise<string | undefined>
```

**Parameters:**
- `explicit: string` _(optional)_ — The repo argument of the tool call.
- `deps: { cwd?: string; resolveForCwd? }` _(optional)_ — Test seams, as today.

**Returns:** `Promise<string | undefined>` — The repository path by the same three-step order as today, or undefined when none resolves; every caller checks for undefined, as today.

**Postconditions:**
- It is NOT moved wholesale. Two users stay in the MCP process: src/mcp/docgen/handler.ts:21/73 and the insrc_workflow_approve path at src/mcp/server.ts:1121. They keep the MCP-side resolveRepoPath, unchanged, over daemon-stream's resolveRepoForCwd with the MCP process's own cwd.
- The moved handlers use a daemon-side copy in src/daemon/steps that reads cwd and INSRC_REPO from the StepCallContext and resolves the cwd through the in-daemon client (the registry's repo.resolveForCwd function called in-process). Outside a step.call (daemon-internal callers) it keeps process-based defaults.

### 2.5 `handleCodeReviewStep`

```typescript
handleCodeReviewStep(input: unknown, deps: CodeReviewStepDeps & { signal?: AbortSignal }): Promise<CodeReviewStepMcpEnvelope>
```

**Parameters:**
- `input: unknown` — As today.
- `deps: CodeReviewStepDeps & { signal?: AbortSignal }` — As today; the client comes from the StepCallContext (converted, see the data model), plus the step.call signal (new).

**Returns:** `Promise<CodeReviewStepMcpEnvelope>` — As today.

**Postconditions:**
- Its fallback to process.env.INSRC_REPO (handler.ts:256) reads context.envRepo instead.
- The signal, when given, is passed to the daemon code-review wait at code-review-step/handler.ts:689, which today passes only { timeoutMs: DAEMON_CODE_REVIEW_WAIT_MS }.

### 2.6 `handleReviewStep`

```typescript
handleReviewStep(input: unknown, deps?: ReviewStepDeps & { signal?: AbortSignal }): Promise<ReviewStepMcpEnvelope>
```

**Parameters:**
- `input: unknown` — As today.
- `deps: ReviewStepDeps & { signal?: AbortSignal }` _(optional)_ — As today, plus the step.call signal (new).

**Returns:** `Promise<ReviewStepMcpEnvelope>` — As today.

**Postconditions:**
- The signal, when given, is passed to the daemon review wait at review-step/phases/start.ts:151 (ReviewStreamOpts.signal today exists but is never filled); an aborted wait ends the inner review run.

### 2.7 `declareLiveStoreReaderUntilS11`

```typescript
declareLiveStoreReaderUntilS11(): void   // DELETED
```

**Returns:** `void` — Removed from src/db/graph/store.ts together with _mayReadLiveStore and its one call in src/mcp/server.ts.

**Postconditions:**
- The MCP server's process is refused the live graph store like any other process that is not the daemon.
- Also deleted with it: the 'declare-reader' command of the test helper src/db/graph/__tests__/helpers/store-child.ts (:259-260); the reader cases of src/db/graph/__tests__/live-store-owner.test.ts (:32, :138), whose 'exactly two places' scan (:147-163) is replaced; and the reader case of src/db/graph/__tests__/live-store-refusal.test.ts (:61-66), which becomes a refusal case: a third process with no declaration, beside the owner, is refused and holds no descriptor.
- The replacement scan fails on any occurrence of the name under src/. It builds the name from two pieces at run time ('declareLiveStoreReader' + 'UntilS11'), so its own source does not contain the literal and it does not match itself.

### 2.8 `getLanceConn`

```typescript
getLanceConn(): Promise<lancedb.Connection>
```

**Returns:** `Promise<lancedb.Connection>` — The one connection of this process, as today.

**Errors:**
- `LanceStoreNotOwnerError (new, a subclass of Error with code 'lance-not-owner')` when The directory to open, resolved through symbolic links on both sides, is the live vector store (PATHS.lance) and this process has not declared itself the store's owner. Thrown before the directory is created or connected.

**Preconditions:**
- For the live path only: declareLiveStoreOwner() was called (the daemon's entry point already does). A test sets a temporary path with setLanceConnPath.

**Postconditions:**
- The owner rule of the graph store now covers the vector store too (stakeholder decision D4); there is no reader allowance for it.

## 3. Data model changes

### 3.1 `StepCallContext (new, in the daemon's step host)` — new

The per-call context that replaces what the handlers read from the MCP process: { cwd: string; envRepo?: string; client?: 'claude' | 'codex' }. Carried in an AsyncLocalStorage around each handler run; read by resolveRepoPath, by the code-review handler's repo fallback, and by the one-shot analyze, which wraps buildRun in runWithClientProviderContext(client) and no longer in a sampler context (decision D3: MCP sampling is dropped). The one form of the client is 'claude' | 'codex'. The one consumer that needs the other form, the one-shot analyze's runWithClientProviderContext (server.ts:1375 today, which receives 'cli-claude' | 'cli-codex'), converts it back at that one call; CodeReviewStepDeps.client takes it as it is. One reader outside src/mcp also uses the process's cwd on the moved analyze path: directoryOf in src/analyze/context/scope.ts:180, which resolves a bare file name against process.cwd(). It reads StepCallContext.cwd when inside a step.call and process.cwd() otherwise, so a bare relative file scope keeps resolving against the caller's directory.

```
+ interface StepCallContext { cwd: string; envRepo?: string | undefined; client?: 'claude' | 'codex' | undefined }
+ type StepToolName = 'insrc_analyze' | 'insrc_analyze_step' | 'insrc_workflow_step' | 'insrc_build_step' | 'insrc_review_step' | 'insrc_code_review_step' | 'insrc_triage'
```

**Call sites:**
- `src/analyze/context/scope.ts`
- `src/daemon/analyze-rpc.ts`
- `src/mcp/code-review-step/handler.ts`
- `src/mcp/resolve-repo.ts`
- `src/mcp/server.ts`

### 3.2 `multi-turn state stores (analyze, workflow, review, code-review)` — invariant-change

The four in-memory stores move, unchanged (Map, 100 entries LRU, 1 h by last touch, released at the final phase), from the MCP process into the daemon process with their handlers (decision D2). New invariant: a token is valid for any MCP process of any session while the daemon runs; it is lost on a daemon restart, which is reported by the existing 'server restarted' miss message, reworded to name the daemon. Triage's self-contained token is unchanged.

**Call sites:**
- `src/mcp/analyze-step/state-store.ts`
- `src/mcp/workflow-step/state-store.ts`
- `src/mcp/review-step/state-store.ts`
- `src/mcp/code-review-step/state-store.ts`

### 3.3 `location of the step handlers` — invariant-change

The handler directories analyze-step, workflow-step, build-step, review-step, code-review-step and triage-step, the one-shot analyze body (with oneShotRunParams, exported from src/mcp/server.ts today) and bundle-md.ts move from src/mcp to src/daemon/steps (decision D1), with their tests. resolve-repo.ts does NOT move: it stays for docgen and approve, and the moved handlers use a daemon-side copy (see resolveRepoPath). src/mcp keeps server.ts (registration and forwarders), daemon-stream.ts (the request client of the MCP server and the CLI), resolve-repo.ts, schema/, guide/ and docgen/. The moved handlers' daemon calls are not left as loopback requests to the daemon's own socket: review-step/phases/start.ts (reviewArtifactStream) and code-review-step/handler.ts (codeReviewStream, fetchCodeReviewGrounding, fetchCodeReviewFreshness) get an in-daemon client of the same shapes that calls the registry's handler functions in-process, so no moved module imports daemon-stream.ts. Importers outside src/mcp that are repointed to the new location: src/bin/insrc-mcp.ts (unchanged: it imports server.js, which stays); src/daemon/workflow-rpc.ts (workflow-step/phases/start); src/analyze/__tests__/report-head.test.ts (analyze-step/answer-turn, bundle-md); src/analyze/explore/__tests__/executor-lmdb.test.ts (analyze-step/handler); src/workflow/code-review/__tests__/diagram-conditional, functional-coverage-conditional and ux-conditional tests (code-review-step/handler); src/daemon/__tests__/answer-step-failed-callers.test.ts and analyze-rpc-measure.test.ts (bundle-md and oneShotRunParams); src/analyze/context/__tests__/completeness.live.test.ts and lookup-measure.test.ts (bundle-md); src/db/graph/__tests__/no-live-store-in-tests.test.ts (paths of moved test files). Two source-scan tests read moved files by path and are repointed: src/analyze/classifier/__tests__/no-size.test.ts (mcp/server.ts, mcp/analyze-step/phases/start.ts) and src/analyze/context/__tests__/bundle-report-schema.test.ts (src/mcp/analyze-step). References in comments (src/workflow/bugfix/types.ts, draft-deps.ts, questions.ts, runners/build/completion-record.ts, workflow/__tests__/scope-extend.test.ts) are updated; the paths inside the recorded golden fixture src/workflow/runners/build/__tests__/fixtures/build-record-goldens.ts are data of past records and stay. src/cli/services/workflow.ts imports daemon-stream.ts, which stays, and is not changed.

**Call sites:**
- `src/analyze/__tests__/report-head.test.ts`
- `src/analyze/classifier/__tests__/no-size.test.ts`
- `src/analyze/context/__tests__/bundle-report-schema.test.ts`
- `src/analyze/explore/__tests__/executor-lmdb.test.ts`
- `src/bin/insrc-mcp.ts`
- `src/daemon/__tests__/analyze-rpc-measure.test.ts`
- `src/daemon/__tests__/answer-step-failed-callers.test.ts`
- `src/daemon/index.ts`
- `src/daemon/server.ts`
- `src/daemon/workflow-rpc.ts`
- `src/db/graph/__tests__/live-store-refusal.test.ts`
- `src/mcp/daemon-stream.ts`
- `src/mcp/docgen/handler.ts`
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/sampling-bridge.ts`
- `src/mcp/server.ts`
- `src/shared/review-stream.ts`
- `src/workflow/code-review/__tests__/ux-conditional.test.ts`

### 3.4 `live-store owner rule (Story s4)` — invariant-change

The reader allowance (_mayReadLiveStore and declareLiveStoreReaderUntilS11) is deleted: only a process that called declareLiveStoreOwner opens the live graph store. The same declaration now also governs the live vector store in getLanceConn (decision D4).

```
- let _mayReadLiveStore = false;
- export function declareLiveStoreReaderUntilS11(): void;
+ export function isLiveStoreOwnerDeclared(): boolean;   // read by getLanceConn
+ export class LanceStoreNotOwnerError extends Error {}
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/lance/conn.ts`
- `src/mcp/server.ts`

### 3.5 `MCP sampling path (retired with decision D3)` — field-remove

With the one-shot analyzer in the daemon nothing calls MCP sampling. Retired together: src/mcp/sampling-bridge.ts and src/mcp/__tests__/sampling-bridge.test.ts; src/agent/providers/mcp-sampling-provider.ts and src/agent/providers/__tests__/mcp-sampling-provider.test.ts (which imports fromSdkResult from the bridge); the sampler context in src/analyze/context/shaper-provider.ts (runWithSamplerContext and the ambient-sampler branch of buildShaperProvider), with src/analyze/context/__tests__/sampler-context.test.ts and the sampler cases of shaper-provider.test.ts. Also deleted: src/mcp/progress-forward.ts and src/mcp/__tests__/progress-forward.test.ts, which have no non-test user. The shaper's other providers are unchanged.

**Call sites:**
- `src/mcp/sampling-bridge.ts`
- `src/agent/providers/mcp-sampling-provider.ts`
- `src/analyze/context/shaper-provider.ts`
- `src/mcp/server.ts`

## 4. Error paths

**Error cases**

- **No daemon is running when a step tool is called (socket file absent, or present with nothing listening).** (recoverable)
  - Detection: The forwarder's connection to the daemon socket fails with ENOENT or ECONNREFUSED before any frame arrives.
  - Response: The forwarder returns an isError envelope naming DaemonUnreachableError (code 'daemon-unreachable') with the socket path and how to start the daemon. It does not run the handler in the MCP process and opens no store (ac3).
  - User impact: The session sees a clear 'the insrc daemon is not reachable' error instead of an answer, and can start the daemon and retry.
- **The daemon is older than this MCP server and does not know step.call, or does not know the tool asked for.** (recoverable)
  - Detection: The daemon answers 'unknown method: step.call' on the stream, or sends an error frame with code 'step-unknown-tool'.
  - Response: The forwarder returns an isError envelope naming DaemonTooOldError (code 'daemon-too-old') that says to update the daemon. Nothing else is tried (ac3).
  - User impact: The session is told to update the daemon; a mixed install (new MCP, old daemon) cannot fall back to opening the store.
- **A handler throws inside the daemon instead of returning an envelope.** (recoverable)
  - Detection: The step host catches the throw around the handler call.
  - Response: An error frame with code 'step-failed' and the thrown message; the forwarder returns it as an isError envelope with that message, as the MCP server's own catch did when the handler ran in-process. A store failure keeps its named error (LmdbStoreLocksLostError, Story s4) in the message.
  - User impact: The same error text as before the move.
- **The daemon is restarted (an update, a crash) between two turns of a multi-turn run.** (recoverable)
  - Detection: The moved state store does not find the token: the existing miss path.
  - Response: The existing 'state not found' reply, reworded to say the daemon was restarted and the run must be started again (decision D2 accepts this loss).
  - User impact: A run in progress over a daemon restart is lost, as an MCP restart loses it today; an MCP restart no longer does.
- **The client gives up on a long step (a code review that waits up to 30 minutes, a design review up to 90) and its MCP request is cancelled or the MCP process exits.** (recoverable)
  - Detection: The forwarder's stream socket closes; the daemon's request server fires the stream's AbortSignal.
  - Response: The step.call signal is passed to handleReviewStep and handleCodeReviewStep (new parameter) and from them to the inner review and code-review runs, which the in-daemon client calls in-process with that signal, so the inner run is aborted, not left to its own 30- or 90-minute limit. Handlers without a signal run to completion and their reply is discarded.
  - User impact: Abandoned long steps stop consuming the daemon where they can; nothing the client sees changes.
- **A test, script or tool opens the live vector store from a process that has not declared itself the owner.** (recoverable)
  - Detection: getLanceConn compares the resolved directory with the resolved PATHS.lance before creating or connecting it.
  - Response: Throws LanceStoreNotOwnerError naming the path and the remedy (setLanceConnPath for a test).
  - User impact: The offending test or tool fails at once; the daemon's vector store is never opened by a second process.
- **The MCP server's process reaches for the live graph store after the reader allowance is deleted (a regression that imports store code into it).** (recoverable)
  - Detection: getGraphStore's owner check (Story s4) finds neither declaration; and statically, the import-graph test of ac4 fails at build time.
  - Response: LmdbStoreNotOwnerError at run time; a failing test at build time.
  - User impact: Caught before release by the test; at run time a named error instead of a silent second opener.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A state token minted by MCP process A is used by MCP process B of the same session after A exited (ac2). | Accepted: the token's data lives in the daemon; the run continues. |
| A state token from one session is presented by another session's MCP process. | Accepted, as today a token is not bound to its caller; tokens are 22 random characters and are not guessable. |
| Two sessions call step tools at the same time. | Each step.call is its own stream with its own AsyncLocalStorage context, so one session's cwd and client never reach the other's handler; the state stores are shared and keyed by token, as today. |
| The MCP client did not send a progress token. | Progress frames from the daemon are dropped by the forwarder; the final envelope is unchanged. |
| The MCP client is neither claude nor codex (detectClientProvider returns nothing). | context.client is absent; the one-shot analyze and the code review use the configured providers, as they do today for an unrecognised client. |
| A tool call whose arguments fail the handler's own validation. | The handler's own error envelope, unchanged, delivered as the 'done' frame (validation is the handler's, not the host's). |
| The INSRC_REPO of the MCP process differs from the daemon's own INSRC_REPO. | The handler sees the MCP process's value through the context; the daemon's own environment is not read inside a step.call. |

**Invariants to preserve**

- Each moved tool returns the same envelope as before the move: the same text for the same input and store state (ac1); prompts, schemas and state tokens are passed through untouched (ac5). [[c1]]
- The multi-turn state stores keep their limits and release points (100 entries LRU, 1 h by last touch, released at the final phase); triage's self-contained token is unchanged. [[c2]]
- Repository resolution keeps its order: the explicit argument, then the registered repository containing the caller's working directory, then INSRC_REPO; only the source of the working directory and INSRC_REPO changes (the caller's, carried in the context). [[c3]]
- The daemon is the only process that opens the live graph store (Story s4), and after this Story the only one that opens the live vector store. [[c4]]
- Calls that reach a model provider stay serial; the moved handlers keep their own calls and no new model call path is added. [[c1]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), Node 22; multi-process cases use the store-child helper of Story s4 (src/db/graph/__tests__/helpers)`

**Test levels**

- **unit** — The step host, the forwarder and the owner rules in one process, with injected sockets and handlers.
  - Subjects: `step host: a known tool runs its handler under the context and the 'done' frame carries the handler's envelope unchanged (deep-equal); an unknown tool gives an error frame 'step-unknown-tool'; a throwing handler gives 'step-failed' with its message`, `step host context: two concurrent calls with different cwd and client each see their own context inside the handler`, `forwarder: ENOENT and ECONNREFUSED give an isError envelope naming DaemonUnreachableError; 'unknown method: step.call' and 'step-unknown-tool' give DaemonTooOldError; neither runs a handler`, `forwarder: progress frames are relayed only with a progress token; the done envelope is returned unchanged`, `resolveRepoPath inside a step.call uses the context's cwd and envRepo, not the process's; outside one it keeps process defaults`, `vector store owner rule: getLanceConn on the live path with no declaration throws LanceStoreNotOwnerError and creates nothing; after declareLiveStoreOwner it opens; a temporary path set with setLanceConnPath opens without a declaration; the live path through a relative path and a symbolic link is refused`, `source scan: the name declareLiveStoreReaderUntilS11 appears nowhere under src/`, `client identity: 'cli-claude' / 'cli-codex' from detectClientProvider reach the context as 'claude' / 'codex', the code-review deps receive 'claude' / 'codex' and the one-shot analyze's runWithClientProviderContext receives 'cli-claude' / 'cli-codex'`, `scope directoryOf: a bare file name inside a step.call resolves against the context's cwd, and outside one against process.cwd()`
  - Fixtures: `a temporary home per test so the live paths are temporary`, `a fake daemon socket that answers unknown method / closes / refuses`
- **integration** — The moved tools behave as before, through the real request server, and the MCP process holds no store.
  - Subjects: `equivalence: each of the seven tools, called through the forwarder and step.call against a daemon in a temporary home, returns the same envelope as the handler called directly in-process for the same input (golden comparison per tool, including the first reply of every multi-turn tool)`, `ac2 restart: a multi-turn analyze step and a workflow step started through forwarder A continue through forwarder B in a new process after A has exited, with the same state token`, `ac5 pass-through: the prompt, schema and state fields of an emit_plan / emit_step reply are byte-identical to the in-process reply`, `no store in the MCP process: after one call of each tool through a real MCP server process (stdio) against a daemon in a temporary home, lsof of the MCP process shows no descriptor on graph.lmdb, graph.lmdb-lock or the lance directory`, `ac3: with no daemon, every step tool returns DaemonUnreachableError and the MCP process opens no store; against a stand-in daemon that does not know step.call, DaemonTooOldError`, `ac6: the MCP server's process (no declaration) is refused the live graph store and the live vector store`, `import graph (ac4): every module reachable by value imports from src/mcp/**, src/bin/insrc-mcp.ts, apart from src/shared/ipc-client.ts and src/mcp/daemon-stream.ts, imports nothing under src/db, src/analyze or src/daemon/steps; a fixture that adds such an import makes the test fail`, `cancellation: closing the forwarder's socket during a design-review wait and during a code-review wait aborts the inner run in the daemon (its own abort observed), not only the outer wait`, `no loopback: during each moved tool's call, the daemon's request server sees no second connection from the daemon's own process (the moved handlers use the in-daemon client)`, `in-daemon review client equivalence: a design-review wait that passes timeoutMs fails with ReviewStreamError('timeout') and the same retryable reply as before; a code-review run whose daemon run fails with reason 'diff-unavailable' takes the same diff fallback as before; an 'error' frame becomes ReviewStreamError('daemon-error', error, reason); an aborted wait fails with ReviewStreamError('aborted') and code 'daemon-review-aborted', not retryable`, `refusal of a third process: beside the owner, a process with no declaration is refused the live graph store and holds no descriptor (replaces the reader case of live-store-refusal.test.ts)`
  - Fixtures: `a daemon-like child (store-child 'daemon-like' extended to serve step.call) or the real daemon entry in a temporary home`, `golden replies captured from the in-process handlers before the move`
- **smoke** — The installed daemon and a real client session after the change.
  - Subjects: `installed daemon: an analysis through a restarted client session works, and lsof shows only the daemon holding the store files and the lance directory`, `installed daemon: a multi-turn workflow step continues after the client session's MCP server is restarted between turns`, `installed daemon after every client session has restarted: lsof shows no process but the daemon holding ~/.insrc/graph.lmdb, graph.lmdb-lock or ~/.insrc/lance`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: equivalence of each of the seven tools through step.call`, `integration: no store in the MCP process (lsof after each tool)`, `unit: step host returns the handler's envelope unchanged`, `integration: no loopback connection during a moved tool's call` |
| `ac2` | `integration: ac2 restart (state token continues in a new forwarder process)`, `smoke: multi-turn workflow step continues after the client's MCP server restarts` |
| `ac3` | `unit: forwarder named errors for unreachable and too-old daemons`, `integration: ac3 with no daemon and with a daemon that does not know step.call` |
| `ac4` | `integration: import graph of the MCP server reaches no store, analyzer or step-host module`, `unit: vector store owner rule` |
| `ac5` | `integration: ac5 pass-through of prompt, schema and state` |
| `ac6` | `unit: source scan finds declareLiveStoreReaderUntilS11 nowhere under src/`, `integration: ac6 the MCP server's process is refused the live graph and vector stores` |

## 6. Migration

**State before:** Seven MCP tools do their work in the MCP server's process (c1): one-shot analyze, the analyze, workflow, build and triage steps entirely, and the review and code-review steps partly. Three of them reach the stores from there: one-shot analyze, the analyze step (including a write to the exploration cache and a vector search), and the review step's claims phase. The MCP server registers every daemon builtin, data driver and workflow runner in-process and makes the temporary reader declaration of Story s4, which lets it open the live graph store. Four multi-turn state stores live in the MCP process's memory and die with it (c2). The vector store opens for any process (c4).

**State after:** The seven tools run in the daemon behind the stream request step.call, under a per-call context (the caller's cwd, INSRC_REPO and client); the MCP tools forward to it and return its replies unchanged. The four state stores live in the daemon's memory with today's limits. The MCP server registers no builtin, driver or runner, imports no store, analyzer or step-host code, and makes no declaration: it is refused the live graph store and the live vector store, both of which only the daemon opens. MCP sampling is gone with the one-shot analyzer's move.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Move the handler directories, the one-shot analyze body (with oneShotRunParams) and bundle-md from src/mcp to src/daemon/steps with their tests, unchanged in behaviour. Leave src/mcp/resolve-repo.ts in place for docgen and approve, and add a daemon-side copy of resolveRepoPath in src/daemon/steps that reads the StepCallContext. Move ReviewStreamError and the review stream types to src/shared/review-stream.ts (re-exported by daemon-stream.ts). Repoint src/daemon/workflow-rpc.ts and the importers listed in the data model. The MCP server still calls the moved handlers in-process from their new location in this step, so behaviour is unchanged. — ↩ rollbackable
2. Add the step host: the step.call stream request, its tool table and its error frames, in the daemon. Capture golden replies of each tool called in-process for the equivalence tests. — ↩ rollbackable
3. Add the owner rule to the vector store's open (getLanceConn), reusing the owner declaration; audit every test file in a temporary home for opens of the live vector store and give each a temporary path, as Story s4 did for the graph store. — ↩ rollbackable
4. Turn the seven MCP tools into forwarders over step.call with the named errors for an unreachable or too-old daemon; stop registering the builtins, drivers and runners in the MCP process; delete the sampling bridge and the unused progress forwarder; add the import-graph test of the MCP server. — ↩ rollbackable
5. Delete declareLiveStoreReaderUntilS11, _mayReadLiveStore and the call in the MCP server; replace Story s4's 'exactly two places' scan with a scan that fails on any occurrence; run the full sweep under Node 22. — ↩ rollbackable
6. Ship: push main, update and restart the installed daemon, then restart EVERY client session (Claude Code, Codex, IDE plugins) so their MCP servers load the forwarders. Until a session restarts, its MCP server runs the old code with the reader allowance set in its own memory and keeps opening the live graph store (and, having no rule there, the live vector store): the second-opener hazard of Story s4, not a refusal. The Story is not done until lsof shows no process but the daemon holding ~/.insrc/graph.lmdb, its lock file or ~/.insrc/lance; the smoke check records that. — ↩ rollbackable _(needs: `daemon updated before the client sessions restart`, `every client session restarted`)_

**Backward compat:** The 12 MCP tools keep their names, descriptions, input schemas and replies. Mixed versions: a new MCP server against an old daemon returns DaemonTooOldError for the seven moved tools until the daemon is updated; it never falls back to in-process work. An old MCP server (a session not yet restarted) against the new daemon is NOT refused: the reader allowance is a variable in that process's own loaded code, so it keeps opening the live graph store and the live vector store until its session restarts, which is the hazard this Epic removes. Deleting the allowance from the source does not reach a running process; the hazard ends only when every session has restarted, which is why step 6 requires it and checks it with lsof. The one-shot analyzer no longer uses MCP sampling: a client that relied on sampling and has no claude or codex CLI gets the configured shaper instead. Multi-turn state survives an MCP restart and is lost on a daemon restart. No stored data changes.

## 7. Alternatives considered

### 7.1 a1: Step host behind one unary request

The step handlers and their state stores move into the daemon behind one plain request, step.call, that runs a handler and answers with its reply as it is.

Move the handler directories (analyze-step, workflow-step, build-step, review-step, code-review-step, triage-step) and the one-shot analyze handler out of src/mcp into src/daemon/steps, with their state stores, unchanged in behaviour. Register one daemon request, step.call { tool, args, cwd, envRepo, client }, whose handler looks the tool up in a table and returns the handler's reply object verbatim. Each MCP tool becomes a forwarder that sends its raw arguments with the MCP process's cwd, INSRC_REPO and the detected caller, and returns the reply. Uses the existing unary rpc client.

**Rejected because:** Meets the criteria, but a client that gives up a 30- or 90-minute wait leaves the daemon running the step to the end, holding resources for nobody; no progress.

### 7.2 a2: Step host behind one streamed request — **CHOSEN**

As a1, but step.call is a stream request: the daemon can send progress, and a client that disconnects aborts the step through the stream's abort signal.

Same move of handlers and state stores into src/daemon/steps and the same table and forwarders as a1. step.call is registered as a stream handler on the daemon's request server, which already gives each stream an AbortSignal that fires when the client's socket closes and frames progress, done and error messages. The forwarder opens the stream, passes progress frames to the MCP progress notification when the client asked for it, returns the 'done' frame's data verbatim, and turns an 'error' frame or an unknown-method answer into the named errors of ac3. Handlers receive the signal and pass it where they already take one (the review and code-review waits).

### 7.3 a3: A request family per tool

Each step tool gets its own daemon requests shaped for its phases (analyze.step.start/plan/narrow/bundle, workflow.step.*, ...).

Design each tool's phases as separate typed daemon requests and rewrite each MCP tool to call them. Recorded for completeness: the stakeholder rejected this shape on 2026-10-12 (D1).

**Rejected because:** Partial on ac1 and ac5, and rejected by the stakeholder (D1).

## 8. References

- **[[c1]]** `step-output` `s1 bundle: where each MCP tool runs and which reach the stores (source survey 2026-10-12)`
- **[[c2]]** `step-output` `s1 bundle: multi-turn state stores of the step tools`
- **[[c3]]** `step-output` `s1 bundle: the daemon request client, repo resolution and caller identity`
- **[[c4]]** `step-output` `s1 bundle: the owner rule of Story s4 and the vector store open`
- **[[c5]]** `stakeholder` `Stakeholder decisions D1-D4 for Story s11, 2026-10-12`

## 9. Open questions

- Decision D4 (the vector store's owner rule) goes beyond the six criteria of s11 as defined; the definition may need an amendment adding it as a criterion (s1 back-flow note).

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-12T11:14:25.200Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | MED | The in-daemon review client keeps reviewStreamRequest's failure behaviour 'exactly', with an aborted signal failing as ReviewStreamError('closed'). | daemon-stream.ts:455: `function onAbort(): void { failWith('aborted', `${method}: aborted by client`); }`. Today an abort gives failure 'aborted', not 'closed'; 'closed' is the socket-close case (:528). The callers key retryability and the error code off this value: start.ts:142 `RETRYABLE = new Set(['unreachable','closed','timeout'])` and start.ts:172 `code: `daemon-review-${failure}``, with the same pattern at handler.ts:669/723. Mapping an abort to 'closed' changes the code and makes it retryable. [files: src/mcp/daemon-stream.ts, src/mcp/review-step/phases/start.ts, src/mcp/code-review-step/handler.ts] | Map an aborted signal to ReviewStreamError('aborted') in the in-daemon client, as today, or state the change on purpose and update the equivalence test. |
| change-sites | MED | The handlers' reads of the MCP process's cwd and INSRC_REPO are confined to resolveRepoPath, the code-review fallback at handler.ts:256 and the one-shot analyze, so the StepCallContext covers them. | In src/mcp, all handler reads go through resolveRepoPath (workflow-step start/resolve-question/review-deferred, triage start, build implement/validate, review start, analyze start) or through handler.ts:256. But code the moved analyze path reaches also reads the process's cwd: src/analyze/context/scope.ts:180 `return dir === '' \|\| dir === '.' ? process.cwd() : dir;` (directoryOf, for a bare file name). Inside the daemon this resolves against the daemon's cwd, not the caller's. [files: src/analyze/context/scope.ts] | Add scope.ts directoryOf to the context's readers (read StepCallContext.cwd when inside a step.call), or state that a bare relative file scope is resolved against the daemon's cwd. |
| change-sites | MED | The in-daemon client 'calls the registry's handler functions in-process' (workflow.review, codeReview.run/grounding/freshness, repo.resolveForCwd). | No accessible registry exists to call. The handler maps are object literals built inline in src/daemon/index.ts ('repo.resolveForCwd' :615, 'codeReview.grounding' :752, 'codeReview.freshness' :772, 'codeReview.run' :1877, 'workflow.review' :1884) and held privately by the server (server.ts:81 `private readonly streamHandlers`). Nothing exports them. The LLD names no change site for how the step host gets them (for example, passing the maps into the step host at construction in index.ts). [files: src/daemon/index.ts, src/daemon/server.ts] | Name the wiring: build the in-daemon client in daemon/index.ts from the same handler maps passed to the server (or extract those handlers into importable modules), and list index.ts as a call site. |

#### Could not verify (does not block)

_None._
