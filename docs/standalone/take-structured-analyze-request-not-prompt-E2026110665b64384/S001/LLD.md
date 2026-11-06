<!-- insrc:artifact LLD-65b643840a294422-s1 -->

# LLD: STORY-65b643840a294422-s1

## Summary

**Epic:** `take-structured-analyze-request-not-prompt`
**HLD base run:** `wf-1793992092485-royzfd`
**HLD effective hash:** `1fbc0044dfcb...`

The analyze tools take a structured request that the calling agent builds after reading the user's prompt: the question, the scope it points at, the kind of source (code unless stated), a size hint and optional background context. A synchronous shared builder turns that request into the analyzer's intent for both insrc_analyze_step and insrc_analyze. One asynchronous validation hook checks the scope (kind and target, path existence and type, the call's repository, indexed) and runs on the step path (start, plan, narrow) and on the one-shot path. At every place a plan context is built, graph reads are keyed on the containing repository and the named area travels as ctx.scope, so a module, file or symbol scope is searched inside its own area; the persistent exploration cache is keyed on that area, concept.resolve returns an anchor the recipes follow, and the document explorations forward the area. The answer report says what scope the analysis ran on and whether the caller named it. A call that carries only a prompt still runs on the workspace scope and is reported as unscoped. The daemon is upgraded before the MCP process exposes the new schemas.

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

**Surface level:** public

### 2.1 `AnalyzeRequest`

```typescript
interface AnalyzeRequest { readonly question: string; readonly scopeRef: AnalyzeScopeRef; readonly target?: AnalyzeTarget | undefined; readonly sizeHint?: AnalyzeScope | undefined; readonly context?: string | undefined }  // new, in src/shared/analyze-types.ts
```

**Returns:** `AnalyzeRequest` — The structured request the calling agent builds from the user's prompt. target defaults to code when omitted; sizeHint is a hint, never the measured size; context is background and never decides scope.

**Preconditions:**
- question is a non-empty string
- scopeRef.kind goes with the target (TARGET_TO_KINDS)
- context, when given, is at most 4000 characters

### 2.2 `buildIntentFromRequest`

```typescript
function buildIntentFromRequest(input: { request?: AnalyzeRequest | undefined; focus?: string | undefined; target?: AnalyzeTarget | undefined; scope?: AnalyzeScope | undefined }, repoPath: string): { intent: UnsizedIntent; sizeHint?: AnalyzeScope | undefined }  // new, synchronous, in src/analyze/context/request.ts
```

**Parameters:**
- `input: { request?, focus?, target?, scope? }` — A structured request or the old flat prompt fields; when a request is present the flat target and scope are ignored.
- `repoPath: string` — The resolved repository path, used as the workspace scope for a prompt-only call.

**Returns:** `{ intent: UnsizedIntent; sizeHint?: AnalyzeScope | undefined }` — The unsized intent both tools hand on, with context and scopeSource set ('request', or 'prompt' with the workspace scope). It builds and checks fields only; it reads no file system or index.

**Errors:**
- `Error` when Neither a request nor a non-empty focus was given, the question is empty, the context is over the limit, or both a request and a differing focus were given.

**Preconditions:**
- repoPath was resolved by resolveRepoPath

**Postconditions:**
- The same request yields the same intent through either tool
- The returned intent has scopeSource set

### 2.3 `UnsizedIntent / ClassifiedIntent`

```typescript
interface ClassifiedIntent { ...existing fields; readonly context?: string | undefined; readonly scopeSource?: 'request' | 'prompt' | undefined }  // two optional fields added
```

**Returns:** `ClassifiedIntent` — context is background shown to planning and synthesis and included in the one-shot cache key; scopeSource says whether the caller named the scope or it defaulted to the workspace from a prompt. Absent on an intent decoded from an older payload.

**Postconditions:**
- Neither field changes the scope: the scope is only ever scopeRef

### 2.4 `validateRequestScope`

```typescript
function validateRequestScope(scope: ResolvedScope, expectedRepo: string | undefined, deps?: ScopeCheckDeps): Promise<void>  // new, asynchronous, in src/analyze/context/scope.ts
```

**Parameters:**
- `scope: ResolvedScope` — The resolved scope.
- `expectedRepo: string | undefined` — The repository the call resolved; undefined skips the repository comparison.
- `deps: ScopeCheckDeps` _(optional)_ — Test seam for the file-system stat.

**Returns:** `Promise<void>` — Resolves when the scope is valid. A scope that exists and holds no stored entities is a valid empty area.

**Errors:**
- `ScopeNotFoundError` when A file scope names a path that is missing or not a regular file, or a module or manifest-dir scope names a path that is missing or not a directory.
- `ScopeRepoMismatchError` when The scope resolves into a registered repository other than expectedRepo.

**Preconditions:**
- The scope was resolved by resolveScopeForTarget

**Postconditions:**
- A workspace, repo or connection scope is never refused here beyond the existing checks

### 2.5 `stepScope / prepareScope (validation hook sites)`

```typescript
stepScope(intent: Pick<ClassifiedIntent, 'target' | 'scopeRef'>, deps?: ScopeDeps, execution?: ConnectionExecutionContext, expectedRepo?: string | undefined): Promise<ResolvedScope>;  prepareScope(invocationMode, inputs, deps?, execution?, expectedRepo?: string | undefined): Promise<ResolvedScope>  // existing, each gains the expectedRepo argument and calls validateRequestScope
```

**Parameters:**
- `expectedRepo: string | undefined` _(optional)_ — The repository the call resolved: the step phases pass the state's repoPath (start passes the resolved repo), the one-shot path receives it from oneShotRunParams through buildRun.

**Returns:** `Promise<ResolvedScope>` — Unchanged. The hook runs on every phase that resolves the scope, so a continuation repeats the check.

**Errors:**
- `ScopeNotFoundError` when As in validateRequestScope.
- `ScopeRepoMismatchError` when As in validateRequestScope.

**Postconditions:**
- Step start, plan, narrow and the one-shot run all refuse an invalid scope before any read

### 2.6 `graphRepoOf / inAreaOf / docsAreaOf / scopeArea`

```typescript
function graphRepoOf(scope: ResolvedScope): string;  function inAreaOf(scope: ResolvedScope): (entity: { readonly id: string; readonly file: string }) => boolean;  function docsAreaOf(scope: ResolvedScope): DocsArea | undefined;  function scopeArea(scope: ResolvedScope): ScopeArea | null  // the first three exist in src/analyze/runtimes/shared/task-scope.ts and move to src/analyze/context/scope.ts (re-exported from the old path); scopeArea is new and built on them
```

**Returns:** `ScopeArea | null` — ScopeArea is { kind: 'dir', path } | { kind: 'file', path } | { kind: 'symbol', entityId, filePath }; null for a workspace, repo or connection scope, which keeps today's whole-repository behaviour.

**Postconditions:**
- A symbol scope's area is the one entity, the same entity the request sizing reads

### 2.7 `Plan context repository key (four sites)`

```typescript
repoPath: graphRepoOf(scope), closureRepos: [graphRepoOf(scope)], scope  // at step plan (phases/plan.ts:124-127), step narrow resume (phases/narrow.ts:215-216), one-shot shaper session (context/driver.ts:1223) and one-shot executePlan (context/driver.ts:1607); existing calls, the key changes
```

**Returns:** `ExplorationContext` — Unchanged shape. Graph reads use the containing registered repository for every scope; the named area travels as ctx.scope. The tool session directory of the one-shot shaper is unchanged.

**Postconditions:**
- For a repo or workspace scope the values equal today's
- A resumed step plan uses the same key as the plan phase that paused

### 2.8 `Exploration cache key (area-aware explorations)`

```typescript
paramHash input for concept.resolve and the doc.* explorations gains scopeAreaKey(scope) (the ScopeArea serialised, or 'repo' when null); EXPLORATION_CACHE_VERSION raised from 2 to 3  // existing, in db/exploration-cache.ts and the get/put sites in analyze/explore/executor.ts and daemon/steps/analyze-step/phases/narrow.ts
```

**Returns:** `CacheRow` — Two requests that differ only in the named area get different entries; a row written before the version bump (including one without an anchor) is never read; the narrow phase writes under the same key as the executor.

**Postconditions:**
- Other explorations keep their keys apart from the version

### 2.9 `ConceptResolveOutput.anchor`

```typescript
interface ConceptResolveOutput { ...existing; readonly anchor?: ConceptAnchor | undefined }  and  interface ConceptAnchor { readonly path: string; readonly kind: 'dir' | 'file' | 'symbol' | 'repo'; readonly source: 'named-scope' | 'ranked'; readonly entityId?: string | undefined; readonly filePath?: string | undefined }
```

**Returns:** `ConceptResolveOutput` — With a named area, the anchor is the area (source 'named-scope') even with no hit; for a symbol scope kind is 'symbol', entityId is the entity and path and filePath are its file. With a workspace or repo scope the anchor is hits[0] converted (a file or directory hit keeps its path and kind; a hit of kind entity becomes kind 'symbol' with its entity id and file) with source 'ranked', or absent when there is no hit.

**Preconditions:**
- ctx.scope is the resolved scope of the request

**Postconditions:**
- No hit outside the named area is returned
- File-level dependent explorations on a symbol anchor are skipped or marked contextual file expansion; symbol-aware explorations take the entity id

### 2.10 `Document callers (area forwarding)`

```typescript
doc.mention (doc-mention.ts:108) gains an optional area argument forwarded to retrieveDocSections; doc.decision-trace (doc-decision-trace.ts:230) and doc.constraint-enumerate (doc-constraint-enumerate.ts:216) keep theirs; the explore executor's adapters for the three set area: docsAreaOf(ctx.scope)  // existing runners, adapters change
```

**Parameters:**
- `area: DocsArea | undefined` _(optional)_ — The file or directory the retrieval is kept to, taken from the named scope.

**Returns:** `DocSectionResult[]` — retrieveDocSections itself is unchanged: it narrows candidates to the area before ranking and runs no embedding when none remain.

**Postconditions:**
- A file or module docs plan returns no section outside the area on both execution modes
- With a repo or workspace scope the callers pass no area, as today

### 2.11 `reportFromLookups`

```typescript
function reportFromLookups(results: readonly ExecutedExploration[], measure?: RequestMeasure, scope?: ReportScope): AnswerReport  // existing, third optional parameter; ReportScope = { ref: AnalyzeScopeRef; source: 'request' | 'prompt' | undefined }
```

**Parameters:**
- `scope: ReportScope` _(optional)_ — The scope the analysis ran on and who named it, from the intent.

**Returns:** `AnswerReport` — The report gains scope { kind, value, named: 'request' | 'prompt' | 'not-recorded' } and one rendered line: for 'prompt' that the caller did not name a scope and the workspace default was used; for 'not-recorded' that the origin is unknown. How the anchor was chosen is stated only when an executed concept.resolve result establishes it (source 'ranked': text matching over the repository).

**Postconditions:**
- Both tools' answers, including a narrow-turn continuation, render the same scope line for the same intent
- A prompt-only docs analysis is not described as text-matched

### 2.12 `parseIntent`

```typescript
function parseIntent(value: unknown, size: 'size-required' | 'size-optional'): UnsizedIntent & { scope?: AnalyzeScope }  // existing, accepts the two new optional fields
```

**Returns:** `UnsizedIntent` — Keeps context (a string within the limit) and scopeSource ('request' or 'prompt') and refuses any other value.

**Errors:**
- `TypeError` when context is not a string or is over the limit, or scopeSource is not request or prompt.

**Postconditions:**
- An intent without the fields parses as before

### 2.13 `handleStart / oneShotRunParams / checkOneShotArgs`

```typescript
handleStart(input: StepInputStart, execution?): Promise<StepOutputEmitPlan | StepOutputDone>; oneShotRunParams(args: { request?: AnalyzeRequest | undefined; focus?: string | undefined; target?: OneShotTarget | undefined; scope?: OneShotSize | undefined }, repoPath: string, runId: string): { runId: string; intent: UnsizedIntent; sizeHint?: AnalyzeScope; expectedRepo: string }; checkOneShotArgs(raw: unknown): AnalyzeOneShotArgs | string  // existing, use the builder; oneShotRunParams also returns the repository for buildRun
```

**Parameters:**
- `input: StepInputStart` — Gains an optional request; focus becomes optional when a request is given.

**Returns:** `Promise<StepOutputEmitPlan | StepOutputDone>` — Unchanged. checkOneShotArgs accepts a request in place of a focus, returns its message for a malformed request and still requires one of the two.

**Errors:**
- `ScopeKindTargetMismatchError` when The request's scope kind does not go with its target.
- `ScopeNotIndexedError` when The scope names code or documents that are in no registered repository or that have no stored entities.
- `RepoIndexingError` when The scope's repository is being indexed.
- `ScopeNotFoundError` when A file or directory scope does not exist or is the wrong kind of path.
- `ScopeRepoMismatchError` when The scope lies in a different registered repository than the call's.

**Preconditions:**
- A repository could be resolved

**Postconditions:**
- The state token carries the intent with the request's scope, context and scopeSource
- The one-shot bundle cache key includes the scope, question, context and scopeSource

### 2.14 `runConceptResolve`

```typescript
runConceptResolve(...)  // existing exploration runner, restricted to scopeArea(ctx.scope) when it is not null
```

**Returns:** `ExplorationOutput` — Unchanged shape plus the anchor. Candidates are ranked inside the area.

**Postconditions:**
- With a workspace or repo scope it behaves exactly as before and the anchor is hits[0]

### 2.15 `Daemon capability and forwarder refusal`

```typescript
daemon.status reply gains features: readonly string[] containing 'analyze-request'; the MCP forwarder (mcp/forward-step.ts) reads it once per connection before forwarding a call that carries a request object to insrc_analyze_step or insrc_analyze and throws DaemonTooOldError when the feature is absent  // existing request and error type, field and check are new
```

**Returns:** `readonly string[]` — The request-aware daemon advertises 'analyze-request'; an older daemon lacks the field.

**Errors:**
- `DaemonTooOldError` when A request-carrying call meets a daemon that does not advertise analyze-request; the message tells the user to update and restart the daemon.

**Postconditions:**
- A prompt-only call is forwarded to any daemon, as today

## 3. Data model changes

### 3.1 `StepInputStart and the one-shot arguments (insrc_analyze_step start input, insrc_analyze input)` — field-add

Both gain an optional request (AnalyzeRequest); focus becomes optional but one of request or focus is required. The flat target and scope (size hint) stay for prompt-only calls and are ignored when a request is present. The MCP zod schemas of both tools gain the same request object and the tool-surface golden file changes with them.

**Call sites:**
- `src/daemon/steps/analyze-step/types.ts:24-30`
- `src/daemon/steps/analyze-oneshot.ts:41-53`
- `src/daemon/steps/analyze-oneshot.ts:77-85`
- `src/mcp/server.ts:229-262`
- `src/mcp/server.ts:266-397`
- `src/mcp/__tests__/forward-step.test.ts:201-213`

### 3.2 `ClassifiedIntent and UnsizedIntent` — field-add

Two optional fields, context and scopeSource. They travel inside the intent, so the step state (StepStatePayload carries the whole intent) and the run RPC (parseIntent) carry them without a new state field; an older payload decodes them as absent. The intent owns the scopeRef; scopeSource and context describe it and never change it.

**Call sites:**
- `src/shared/analyze-types.ts:33-60`
- `src/daemon/steps/analyze-step/state.ts:60-110`
- `src/daemon/analyze-rpc.ts:1162-1178`
- `src/daemon/analyze-rpc.ts:1313-1330`

### 3.3 `Scope validation and the call's repository` — invariant-change

Before: nothing checks that a path exists or has the right type, and nothing compares the scope's repository with the call's; the step path resolves through stepScope and the one-shot path through prepareScope. After: both resolvers call validateRequestScope, given the repository the call resolved (start passes it; later phases pass the state's repoPath; the one-shot path receives it from oneShotRunParams through buildRun), so start, plan, narrow and the one-shot run refuse an invalid scope before any read.

**Call sites:**
- `src/daemon/steps/analyze-step/scope.ts:33`
- `src/daemon/steps/analyze-step/phases/start.ts:72`
- `src/daemon/steps/analyze-step/phases/plan.ts:122`
- `src/daemon/steps/analyze-step/phases/narrow.ts:211`
- `src/analyze/context/driver.ts:1262-1275`
- `src/daemon/steps/analyze-oneshot.ts:41-53`
- `src/analyze/context/scope.ts:149-164`

### 3.4 `Plan context repository key and named area` — invariant-change

Before: four sites use scope.lookupPath, a directory for a module scope, as the graph key. After: they use graphRepoOf(scope), the containing registered repository (falling back to lookupPath for a scope no repository contains), and the named area travels as ctx.scope for the code-family and docs explorations through inAreaOf and docsAreaOf. Filesystem work and retrieval filters use the area; graph reads use the repository.

**Call sites:**
- `src/daemon/steps/analyze-step/phases/plan.ts:124-127`
- `src/daemon/steps/analyze-step/phases/narrow.ts:215-216`
- `src/analyze/context/driver.ts:1223`
- `src/analyze/context/driver.ts:1607`
- `src/analyze/runtimes/shared/task-scope.ts:105-150`
- `src/analyze/explore/types.ts:926-945`

### 3.5 `Persistent exploration cache` — invariant-change

Before: the key is repo, index time and a hash of the exploration type and params, with no scope, so two areas of the same repository share an entry. After: the area-aware explorations (concept.resolve and the doc.* explorations) hash the area into their params, and EXPLORATION_CACHE_VERSION is 3 so older rows, which lack the anchor, are not read. The executor and the narrow phase write under the same key.

**Call sites:**
- `src/db/exploration-cache.ts:44-110`
- `src/analyze/explore/executor.ts:36`
- `src/daemon/steps/analyze-step/phases/narrow.ts:36`

### 3.6 `ConceptResolveOutput and the planning recipes` — field-add

ConceptResolveOutput gains an optional anchor with an entity identity for a symbol scope. The recipes in the decomposer prompt that chain on $e1.hits[0].path chain on $e1.anchor.path; for a symbol anchor the symbol-aware explorations take the entity id and the file-level ones (module.profile, convention.detect) are skipped or labelled contextual file expansion. The code synthesizer prompt centres on the anchor. For a workspace or repo scope the anchor is hits[0] or absent.

**Call sites:**
- `src/analyze/explore/types.ts:150-157`
- `src/analyze/explore/concept-resolve.ts:554-571`
- `src/prompts/analyze/decompose.system.md:162`
- `src/prompts/analyze/synthesize.code.system.md:132`

### 3.7 `Document explorations` — invariant-change

retrieveDocSections already narrows to a DocsArea before ranking; the change is at its callers: doc.mention gains an area argument, and the explore executor's adapters for doc.mention, doc.decision-trace and doc.constraint-enumerate forward docsAreaOf(ctx.scope) on both execution modes.

**Call sites:**
- `src/analyze/docs-retrieval.ts:99-121`
- `src/analyze/docs-retrieval.ts:169-250`
- `src/analyze/explore/doc-mention.ts:108`
- `src/analyze/explore/doc-decision-trace.ts:230`
- `src/analyze/explore/doc-constraint-enumerate.ts:216`
- `src/analyze/explore/executor.ts`

### 3.8 `Answer report` — field-add

AnswerReport gains scope { kind, value, named }, built by reportFromLookups from the intent at both call sites (the one-shot driver and the step bundle path), and rendered as one line; the anchor-selection sentence is derived from executed results only.

**Call sites:**
- `src/analyze/explore/answer-report.ts:37`
- `src/analyze/context/driver.ts:1646`
- `src/analyze/explore/completeness-facts.ts`

### 3.9 `Daemon status features and the forwarder` — field-add

daemon.status gains a features list; the MCP forwarder reads it before forwarding a request-carrying analyze call and refuses an older daemon with DaemonTooOldError, because an older daemon would ignore the request (step tool) or reject a missing focus (one-shot).

**Call sites:**
- `src/mcp/forward-step.ts:17`
- `src/mcp/forward-step.ts:47-51`
- `src/mcp/forward-step.ts:151-153`
- `src/daemon/index.ts:303`

### 3.10 `Planning, synthesis prompts, one-shot cache key and steering text` — invariant-change

The planning prompt shows the scope, the question and the background context on separate lines; the synthesis prompt shows the context as background; computeCacheKey keys on the scope, question, context and scopeSource. The tool descriptions, src/mcp/steering-template.md and the injected src/prompts/steering-block.md tell agents to read the user's prompt, decide the scope it points at and send the request object, keeping the search-versus-analysis decision rule.

**Call sites:**
- `src/analyze/context/decomposer.ts:363-370`
- `src/analyze/context/driver.ts:706-740`
- `src/mcp/server.ts:266-397`
- `src/mcp/steering-template.md`
- `src/prompts/steering-block.md:55-60`
- `src/prompts/steering-block.md:93-94`
- `src/daemon/steering-inject.ts:59-81`

## 4. Error paths

**Error cases**

- **The request's scope kind does not go with its target (for example a symbol scope with target infra)** (recoverable)
  - Detection: resolveScopeForTarget checks the kind against TARGET_TO_KINDS before anything is resolved or read and throws ScopeKindTargetMismatchError.
  - Response: The call is refused with the error naming the kind, the target and the kinds the target accepts; no state token is minted.
  - User impact: The calling agent sees which kinds are allowed and resends a corrected request.
- **A file scope names a path that does not exist or is not a regular file, or a module or manifest-dir scope names a path that does not exist or is not a directory, inside an otherwise indexed repository, on either tool** (recoverable)
  - Detection: validateRequestScope stats the resolved path after resolveScope has found the containing repository; it is called by stepScope (step start, plan, narrow) and by prepareScope (the one-shot run), because insrc_analyze never passes through stepScope.
  - Response: The call is refused with ScopeNotFoundError naming the path, the kind and what was found; nothing is measured or looked up and no state token is minted.
  - User impact: The agent is told the path is missing or the wrong kind and can correct it or use a wider scope.
- **The scope resolves into a registered repository other than the one the call resolved, at step start, at a plan or narrow continuation, or on the one-shot run** (recoverable)
  - Detection: validateRequestScope compares the scope's repoPath with expectedRepo: the step phases pass the state's repoPath, the one-shot path receives the repository from oneShotRunParams through buildRun to prepareScope.
  - Response: The call is refused with ScopeRepoMismatchError naming both repositories, at the phase where it is found.
  - User impact: The agent corrects repo or scope.
- **The scope names a path or symbol that is in no registered repository or that the index does not hold** (recoverable)
  - Detection: resolveScope finds no containing registered repository for the path, and ensureScopeQueryable finds a code or docs scope with no stored entities in the repository.
  - Response: The call is refused with ScopeNotIndexedError and its reason.
  - User impact: The agent can name a different scope or use the repository.
- **The scope's repository is being indexed or its last index failed** (recoverable)
  - Detection: ensureScopeQueryable raises RepoIndexingError for a repository under index; every phase and the one-shot run repeat the check.
  - Response: The call is refused with the existing indexing reason.
  - User impact: Wait for the index, then retry.
- **A request is sent together with a prompt-only focus that says something else** (recoverable)
  - Detection: buildIntentFromRequest compares the trimmed focus with the request's question when both are present.
  - Response: The builder throws; the call is refused with a message that names both texts and says to send only the request.
  - User impact: The agent sends one form.
- **A symbol scope value is not of the form file#name, or names a symbol the index does not hold** (recoverable)
  - Detection: resolveScope's symbol resolution splits the value at the last separator and looks the entity up.
  - Response: The call is refused with the existing symbol-resolution error.
  - User impact: The agent resends the symbol in the documented form.
- **A malformed structured request reaches the one-shot tool through step.call without passing the MCP schema (no question, an unknown scopeRef kind, a non-string value or context, context over the limit)** (recoverable)
  - Detection: checkOneShotArgs validates the request fields and returns its message string; parseIntent throws a TypeError for a bad context or scopeSource on the run RPC.
  - Response: The tool returns an error result naming the first bad field; nothing is run.
  - User impact: The agent fixes the field and resends.
- **A persistent exploration cache row written before this change (version 2, no anchor, no area in its key) is present for the same repository and index time** (recoverable)
  - Detection: EXPLORATION_CACHE_VERSION is part of every cache key, so a version-3 lookup computes a different key and never finds the old row.
  - Response: The exploration runs again and its output is stored under the version-3 key; the old row is left unread.
  - User impact: One slower first run per exploration after the upgrade; no stale or anchorless output is served.
- **An MCP process that exposes the request schema is connected to a daemon that does not advertise analyze-request support** (recoverable)
  - Detection: The forwarder reads the features list of daemon.status before forwarding a call that carries a request object and finds no 'analyze-request'.
  - Response: The call is refused with DaemonTooOldError telling the user to update and restart the daemon; a prompt-only call is still forwarded.
  - User impact: The user upgrades the daemon first; no request is silently ignored or turned into a workspace analysis.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A request whose scope is the workspace or the repository | Behaves as today: the whole repository is the area, scopeArea returns null, concept.resolve ranks it and the anchor is hits[0]; the report says the caller named the scope. |
| A prompt-only call (focus, no request) | Runs as today on the workspace scope with scopeSource 'prompt'; the report says the caller did not name a scope and the workspace default was used. It says the anchor came from text matching only when an executed concept.resolve result with source ranked establishes it, so a prompt-only docs analysis is not described that way. |
| A request that omits target | The target is code, as an omitted flat target is today. |
| A request together with a flat target or scope (size) field | The flat target and scope are ignored; the request's target and sizeHint decide, and a test pins that precedence. |
| A module or directory scope that exists and holds no stored entity, or in which no candidate shares a word with the question | A valid empty area: concept.resolve returns the scope itself as the anchor (source named-scope) with an empty hit list marked complete, so module.profile and the other dependent explorations still run on the named directory. |
| A child of the named module outranks the module by token match | The anchor stays the named module; the child appears among the hits. |
| A module or manifest-dir scope whose entities are stored under the containing repository, on the step tool and on the one-shot tool, including after a narrow resume | All four plan-context sites use graphRepoOf(scope), so graph reads see the module's entities rather than an empty list; the resumed plan uses the same key as the plan phase that paused. |
| Two consecutive requests with the same question against different modules of the same repository, on either tool | concept.resolve and the doc explorations are cached under different keys, so the second request is not served the first module's anchor or hits. |
| A file scope on a docs target, run through doc.mention, doc.decision-trace or doc.constraint-enumerate on the step or the one-shot mode | The adapter forwards docsAreaOf(ctx.scope); sections outside the file are not considered, even those with a stronger match, and with no candidate inside it no embedding is performed. |
| A symbol scope (small symbol in a large file) | The anchor has kind symbol, entityId and the file as path and filePath; the area measured and searched is the one entity. Symbol-aware explorations take the entity id; the file-level explorations (module.profile, convention.detect) are skipped or labelled contextual file expansion, so they do not describe the whole file as the subject. |
| A ranked concept.resolve hit of kind entity under a workspace or repo scope | It is converted to an anchor of kind symbol with its entity id and file, source ranked. |
| A data target with a connection scope | Resolved and checked as today; validateRequestScope does not stat a connection. |
| A state token or intent from before this change | Still drives the later phases: the new intent fields decode as absent and the report says the origin of the scope was not recorded. Tokens are held only by a running daemon, so this concerns an older payload shape in a surviving state store, not a restart. |
| Two requests with the same question and scope but different context or different scopeSource | They produce different one-shot cache keys; a cached final report renders the scope line of its own intent. |

**Invariants to preserve**

- A scope kind that does not go with the target is refused before anything is resolved or read. [[c9]]
- The pairing table of kinds per target stays the classifier's single table; no second list is introduced. [[c10]]
- Every phase re-resolves the scope and repeats the indexed and not-being-indexed checks; the state token carries the intent, not a resolved scope. [[c11]]
- The request's size is measured from the area the scope names (a symbol by its one entity, a file by its entities); a size the caller states is only a hint and no default size is taken. [[c19]]
- The step tool has no bundle cache today (readBundleForStep returns null); the one-shot cache key must still differ for a different scope, question, context or scopeSource. [[c29]]
- With a workspace or repo scope, the plan's repoPath and closureRepos, concept.resolve and docs retrieval behave exactly as before. [[c15]]
- The sizing, completeness and handling paths of the existing analysis epic are consumed unchanged. [[c23]]
- The tool-surface golden file is regenerated together with the two input schemas, so the pinned surface test stays the contract check. [[c22]]
- The one-shot and step tools produce the same intent for the same request. [[c4]]
- The run RPC's intent parser keeps accepting an intent without the new fields and drops nothing it keeps today. [[c30]]
- The shipped steering keeps its search-versus-analysis decision rule; only the analyze request guidance is added. [[c20]]
- The task runtimes keep using graphRepoOf, inAreaOf and docsAreaOf with unchanged behaviour after the helpers move to the shared scope module. [[c31]]
- An exploration cache row is only read under the key of its own version, repository, index time and (for area-aware explorations) area. [[c32]]
- A daemon that is older than the MCP server is reported through DaemonTooOldError and never silently serves a different analysis. [[c33]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test`

**Test levels**

- **unit** — Pin the request builder, the scope validation, the area helpers and the scope-limited explorations. The verification objectives ac1-ac5 used below are derived locally from the ISSUE's fix intent (the ISSUE has no numbered acceptance criteria): ac1 a structured request yields the same intent through both tools and carries question, scope, target, size hint, context and provenance; ac2 an invalid scope is refused before anything is read, on both tools and on every continuation; ac3 a named scope is the anchor and the area searched, graph reads use the containing repository on every execution site, the exploration cache is keyed on the area, document explorations stay inside the area and a symbol anchor keeps its one-entity identity; ac4 a prompt-only call, an old payload and a request carrying a legacy target or size still behave and are reported honestly; ac5 the tool surface, the shipped steering and the forwarder tell agents to send the request object and refuse an older daemon.
  - Subjects: `src/analyze/context/__tests__/request.test.ts: buildIntentFromRequest makes the same intent for a request through the step tool's and the one-shot tool's inputs; a request without target gets code; a request ignores a flat target and size; a prompt-only call gets the workspace scope and scopeSource prompt; a request and a different focus are refused; an empty question and an over-long context are refused; context is carried on the intent and never changes scopeRef`, `src/analyze/context/__tests__/scope-validate.test.ts: validateRequestScope refuses a nonexistent file or directory inside an indexed repository, a directory given as a file scope, a file given as a module scope, and a scope in another registered repository; accepts an existing directory that holds no stored entity as a valid empty area; leaves workspace, repo and connection scopes to the existing checks`, `src/analyze/context/__tests__/scope-area.test.ts: graphRepoOf, inAreaOf, docsAreaOf and scopeArea behave as the task runtimes' tests already pin after the move, and scopeArea returns null for workspace, repo and connection scopes and the one entity for a symbol`, `src/daemon/steps/__tests__/analyze-oneshot-request.test.ts: checkOneShotArgs accepts a request with no focus, returns a message for a missing question, an unknown scopeRef kind, a non-string value or context and for a request plus a differing focus, and still requires one of the two; oneShotRunParams builds the intent from the builder and returns the expected repository`, `src/daemon/__tests__/analyze-rpc-intent.test.ts: parseIntent keeps context and scopeSource, refuses a bad value of either, and parses an intent without them as before`, `src/analyze/explore/__tests__/concept-resolve-scope.test.ts: with a module, manifest-dir, file or symbol scope no candidate outside the area is returned, the anchor is the area with source named-scope even with an empty hit list, and a child that outranks the named module does not displace the anchor; a symbol scope gives kind symbol with entityId and the file; a ranked hit of kind entity becomes a symbol anchor; with a workspace or repo scope the result equals today's and the anchor is hits[0]`, `src/analyze/__tests__/docs-retrieval.test.ts: with a stubbed vector search, an area passed to retrieveDocSections passes only candidate ids inside the area, a stronger-matching section outside the area never competes, and no candidates inside the area performs no embedding`, `src/analyze/explore/__tests__/doc-area-forwarding.test.ts: the adapters for doc.mention, doc.decision-trace and doc.constraint-enumerate forward docsAreaOf(ctx.scope) for a file and a module scope and forward no area for a repo or workspace scope`, `src/db/__tests__/exploration-cache-scope.test.ts: the cache key differs for the same exploration and params under different areas and under version 2 and 3, a version-2 row is not read, and the narrow-phase write uses the executor's key`, `src/analyze/explore/__tests__/answer-report-scope.test.ts: reportFromLookups renders the scope line for request, prompt and not-recorded sources; two intents with the same scopeRef but different scopeSource render differently; a prompt-only docs analysis is not described as text-matched while a ranked concept.resolve result is`
  - Fixtures: `a small registered repository fixture with two modules that share words in their names and entities stored under the repository root, one small symbol in a large file, and a docs tree`, `the existing fake embedder and vector-search seam of docs-retrieval.test.ts`, `a temporary directory tree for the file-system stat of validateRequestScope`
- **integration** — Show both tools, every execution site and the caches carry the named scope end to end, and that old payloads and prompt-only calls still work.
  - Subjects: `src/daemon/steps/analyze-step/__tests__/start-request.test.ts: through the real handleStart, plan and narrow handlers, a request with a nonexistent path, a wrong path kind or a scope in another repository is refused at start, and refused at a plan or narrow continuation when the state's repository no longer matches; a valid request mints a state whose intent has the named scope, context and scopeSource request and measures the area that scope names`, `src/daemon/steps/__tests__/analyze-oneshot-handler.test.ts: through the real one-shot handler and buildRun, the same invalid scopes are refused through prepareScope with the repository from oneShotRunParams`, `src/daemon/steps/analyze-step/__tests__/plan-module-scope.test.ts: for a module and a manifest-dir scope with entities stored under the registered repository root, the plan and the narrow resume both pass the containing repository as repoPath and closureRepos and the named area as ctx.scope, the resumed plan uses the same key as the paused one, and module.profile and symbol.locate return the module's entities instead of an empty list`, `src/analyze/context/__tests__/oneshot-module-scope.test.ts: the one-shot shaper session and executePlan use graphRepoOf(scope) for a module and a manifest-dir scope with entities stored under the containing repository`, `src/analyze/explore/__tests__/cache-area-isolation.test.ts: two consecutive requests with the same question against two different modules, on the step tool and on the one-shot tool, run concept.resolve twice with different areas and the second does not receive the first module's anchor or hits; a row written under version 2 is not read`, `src/analyze/context/__tests__/cache-key-scope.test.ts: the one-shot computeCacheKey differs for a different scope, question, context or scopeSource and is equal for the same request; a cached final report renders the scope line of its own intent for a structured workspace request and a prompt-only call; the step tool has no bundle cache (readBundleForStep returns null), so isolation is asserted on the one-shot key and on the exploration cache, not on handleStart`, `src/analyze/explore/__tests__/docs-plan-area.test.ts: a complete file-scope and module-scope docs plan returns no section outside the area through the step executor and the one-shot executor`, `src/analyze/explore/__tests__/request-end-to-end.test.ts: a module-scope request runs planning and execution and the recipes chained on the anchor profile the named module even when the question shares no word with it; a symbol-scope request on a small symbol in a large file runs the real symbol-aware dependent runners on the entity, skips or labels contextual the file-level runners, and the synthesis prompt centres on the symbol`, `src/analyze/explore/__tests__/context-prompts.test.ts: context reaches the planning prompt and the synthesis prompt through both handlers and through a narrow continuation, without changing the named scope`, `src/daemon/steps/analyze-step/__tests__/start-request.test.ts: a state token whose intent lacks context and scopeSource still drives the plan and bundle phases and the final report says the origin was not recorded`
- **contract** — The pinned tool surface, the shipped steering and the forwarder change together with the schemas, and the request is accepted and forwarded through both registrations.
  - Subjects: `src/mcp/__tests__/forward-step.test.ts: the thirteen tools keep their names, descriptions and input schemas against the regenerated golden file with the request object on both analyze tools`, `src/mcp/__tests__/analyze-request-forward.test.ts: both registrations accept a request-only call, a prompt-only call and a mixed call, forward the request object to the daemon handlers unchanged, and reject a malformed request with the schema message`, `src/mcp/__tests__/forward-step-features.test.ts: mixed versions: the forwarder refuses a request-carrying call to a daemon whose daemon.status lacks analyze-request with DaemonTooOldError, forwards the same call to a daemon that advertises it, and forwards a prompt-only call to either`, `src/daemon/__tests__/steering-analyze-request.test.ts: the skeleton returned by the injected-block path from src/prompts/steering-block.md tells agents to read the user's prompt, decide the scope and send the request object, and still contains the search-versus-analysis decision rule; src/mcp/steering-template.md and both tool descriptions say the same`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `request.test.ts: buildIntentFromRequest makes the same intent for a request through the step tool's and the one-shot tool's inputs`, `request.test.ts: context is carried on the intent and never changes scopeRef`, `start-request.test.ts: a valid request mints a state whose intent has the named scope, context and scopeSource request`, `context-prompts.test.ts: context reaches the planning and synthesis prompts through both handlers and a narrow continuation` |
| `ac2` | `scope-validate.test.ts: validateRequestScope refuses a nonexistent path, a wrong path kind and a scope in another registered repository, and accepts an existing empty directory`, `start-request.test.ts: the real start, plan and narrow handlers refuse an invalid scope or a repository mismatch`, `analyze-oneshot-handler.test.ts: the real one-shot handler refuses the same invalid scopes through prepareScope`, `analyze-oneshot-request.test.ts: checkOneShotArgs returns a message for a malformed request` |
| `ac3` | `concept-resolve-scope.test.ts: with a module, manifest-dir, file or symbol scope no candidate outside the area is returned and the anchor is the area; an entity hit becomes a symbol anchor`, `plan-module-scope.test.ts: the plan and the narrow resume pass the containing repository and the named area`, `oneshot-module-scope.test.ts: the one-shot session and executePlan use the containing repository`, `cache-area-isolation.test.ts: consecutive same-question requests on different modules do not share an exploration cache entry on both tools, and a version-2 row is not read`, `docs-plan-area.test.ts: file and module docs plans stay inside the area in both modes`, `request-end-to-end.test.ts: a module-scope request profiles the named module even when the question shares no word with it, and a small symbol in a large file is searched and synthesised as the one entity` |
| `ac4` | `request.test.ts: a prompt-only call gets the workspace scope and scopeSource prompt; a request ignores a flat target and size`, `answer-report-scope.test.ts: the report distinguishes request, prompt and not-recorded, and a prompt-only docs analysis is not called text-matched`, `cache-key-scope.test.ts: the one-shot cache key differs for a different scopeSource and a cached report renders its own scope line`, `start-request.test.ts: a state token whose intent lacks the new fields still drives the plan and bundle phases and the report says the origin was not recorded` |
| `ac5` | `forward-step.test.ts: the thirteen tools keep their names, descriptions and input schemas against the regenerated golden file`, `analyze-request-forward.test.ts: both registrations accept and forward a request-only call`, `forward-step-features.test.ts: the forwarder refuses a request call to an older daemon and forwards a prompt-only call`, `steering-analyze-request.test.ts: the injected skeleton, the template and both tool descriptions tell agents to send the request object and keep the decision rule` |

## 6. Migration

**State before:** Both MCP analyze tools take only { focus, repo?, target?, scope? } and hand-build an intent whose scope reference is always the workspace at the repository path (analyze-step/phases/start.ts:72, analyze-oneshot.ts:41-53); the intent has no field for background context or for who named the scope; the raw prompt ranks the anchor by token match in concept.resolve (concept-resolve.ts:554-571) and by vector similarity in docs retrieval (docs-retrieval.ts:169-250). Four sites (plan.ts:124-127, narrow.ts:215-216, driver.ts:1223, driver.ts:1607) use the scope's lookupPath, a directory for a module scope, as the graph key; the step path validates through stepScope and the one-shot path through prepareScope, and nothing checks that a path exists; the persistent exploration cache key has no scope (db/exploration-cache.ts); the doc.mention runner passes no area. The MCP forwarder detects an older daemon only by a missing step.call or tool (mcp/forward-step.ts).

**State after:** Both tools accept a structured request { question, scopeRef, target, sizeHint, context } next to the old flat fields; one synchronous builder makes the intent, and one validation hook runs in stepScope and prepareScope with the call's repository. All four plan sites use graphRepoOf(scope) and pass the named area as ctx.scope; the exploration cache is keyed on the area at version 3; concept.resolve returns an anchor (with entity identity for a symbol) that the recipes follow; the doc explorations forward the area at every caller; the answer report states the scope and who named it. A prompt-only call still runs on the workspace scope with scopeSource prompt. The planning prompt, tool descriptions, template and injected steering block tell agents to send the request object, and the forwarder refuses a request call to a daemon that does not advertise analyze-request.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the AnalyzeRequest type, the two optional intent fields (context, scopeSource) and the synchronous shared builder, and accept the two fields in the run RPC's intent parser; the old flat fields map to a workspace-scoped intent with scopeSource prompt. No tool uses the builder yet. — ↩ rollbackable
2. Move graphRepoOf, inAreaOf and docsAreaOf to the shared scope module (re-exported from the old path), add scopeArea and validateRequestScope, add the expectedRepo argument to stepScope and prepareScope, and add the answer report's scope field with the not-recorded fallback; nothing changes for a workspace or repo scope. — ↩ rollbackable
3. Make the step tool's start phase and the one-shot parameter builder use the builder, accept the optional request on StepInputStart and the one-shot arguments (checkOneShotArgs accepts a request in place of a focus), pass the call's repository as expectedRepo through start, plan, narrow and the one-shot buildRun, and pass the intent's scope and provenance to both report call sites. — ↩ rollbackable
4. Change the four plan-context sites to key graph reads on graphRepoOf(scope) with the named area as ctx.scope; add the anchor to the concept.resolve output and restrict it to the area; key the area-aware explorations of the persistent exploration cache on the area and raise EXPLORATION_CACHE_VERSION to 3; forward docsAreaOf(ctx.scope) from the doc exploration adapters and give doc.mention an area argument; change the recipes in the decomposer prompt and the synthesizer prompt to use the anchor; include scope, question, context and scopeSource in the one-shot cache key. — ↩ rollbackable
5. Add the request object to the MCP input schemas of both tools, regenerate the tool-surface golden file with them, show scope, question and context on separate lines in the planning prompt, and update the tool descriptions, src/mcp/steering-template.md and the injected src/prompts/steering-block.md. — ↩ rollbackable
6. Add the features list with analyze-request to the daemon status reply, and then, last, the forwarder check that refuses a request-carrying call to a daemon without that feature. Ship and restart the daemon before the MCP process exposes steps 5 and 6. — ↩ rollbackable
7. Verify: npm run build (typecheck), the analyze, daemon-step, daemon and MCP suites, and live analyses against the restarted daemon with a named module scope, a named symbol scope, a docs file scope and a prompt-only call, on both tools. — ↩ rollbackable

**Backward compat:** Deploy order: the daemon is upgraded and restarted first, and the MCP process is updated after it, because only then do the new schemas and steering reach agents; rollback is the reverse (the MCP process first, then the daemon). A new MCP process with an older daemon is refused for request-carrying calls with DaemonTooOldError, so a request is never ignored (step tool) or rejected for a missing focus (one-shot); a prompt-only call is forwarded to any daemon. The flat focus, target and scope (size) stay accepted for a prompt-only call and behave as they do now, with the answer stating that the scope was not named; when a request is sent the flat target and scope are ignored. The tool-surface golden file changes, so a client that pins the schema sees the new optional field. The plan's repository key changes only for a module, manifest-dir, file or symbol scope, which no caller could name before. The intent and run RPC gain optional fields, so an older payload still parses and decodes them as absent, and the report says the origin was not recorded. The exploration cache version bump leaves older rows unread, costing one slower first run per exploration. State tokens are held in memory by the daemon, so in-flight tokens end at the daemon restart as they do for any restart today: the code path has no downtime, but an analysis in progress during the restart must be started again.

## 7. Alternatives considered

### 7.1 a1: Add an optional scope reference beside the existing flat prompt fields

Keep { focus, repo, target, scope } and add an optional scopeRef (and context) that both tools honour.

Add an optional scopeRef (the existing AnalyzeScopeRef) and an optional free-text context to the inputs of insrc_analyze_step start and insrc_analyze. When scopeRef is present, the start phase and the one-shot builder use it instead of the hard-coded workspace reference and validate it through the existing checks; absent, behaviour is today's. concept.resolve and the docs retrieval then restrict to the resolved scope's area. The flat fields stay, so 'scope' remains the size hint and the new field has to be named differently from it.

**Rejected because:** Smaller but leaves the request a prompt with an optional extra, keeps two hand-built intents and lets a prompt-only call stay silently unscoped.

### 7.2 a2: One structured request object, built once for both tools, validated on both paths, with the prompt-only form kept but marked — **CHOSEN**

Both tools accept a request object { question, scopeRef, target, sizeHint, context }; one builder makes the intent, one validation hook runs on the step path and the one-shot path, the named area is carried consistently through every execution site and cache, and a prompt-only call still runs but is reported as unscoped.

Define one structured AnalyzeRequest and accept it on insrc_analyze_step start and insrc_analyze. A synchronous shared builder turns the request (or the old flat fields) into the intent for both tools and sets two optional intent fields, context and scopeSource. The asynchronous scope validation (kind and target, path existence and type, the repository the call resolved, indexed) is one hook, run by stepScope on the step path (start, plan, narrow) and by prepareScope on the one-shot path, with the call's resolved repository passed as an expected-repository argument through both. Everywhere a plan context is built (step plan, step narrow resume, one-shot shaper session, one-shot executePlan) the graph key is graphRepoOf(scope), the containing registered repository, and the named area travels as ctx.scope, read through the existing inAreaOf and docsAreaOf helpers, moved to the shared scope module. The persistent exploration cache key gains the area for the area-aware explorations and its version is raised. concept.resolve ranks inside the area and returns an anchor whose identity includes the entity for a symbol scope; recipes chain on the anchor; the doc explorations forward docsAreaOf(ctx.scope) at every caller boundary. The answer report states the scope and who named it. The steering block, template, tool descriptions and planning prompt tell agents to send the request. The daemon is upgraded before the MCP process exposes the new schemas, and the forwarder refuses a request-only call to a daemon that does not advertise request support.

### 7.3 a3: Require the structured request and refuse a prompt-only call

Same as a2, but a call without a scope reference is rejected with a message that says how to build one.

Use the same AnalyzeRequest, builder, validation hook, repository and area handling, cache key and anchor as a2, but make scopeRef required: a call that carries only a focus is refused with an error that names the missing scope and shows the request shape. The prompt-only mapping and scopeSource 'prompt' are removed.

**Rejected because:** Closes the silent case outright but breaks every present caller and steering text at once; better taken as a later step once agents send the object.

### 7.4 a4: Parse the prompt on the daemon with the existing classifier

Keep the prompt-only inputs and have the daemon run the LLM classifier to build the scope reference.

Call the classifier that the daemon's own run pipeline uses (analyze/classifier/driver.ts) from both tools' start phases to turn the prompt into a ClassifiedIntent, with the scope it returns.

**Rejected because:** Adds a model call to guess from the same prompt that caused the problem, and moves parsing away from the agent that has the context.

## 8. References

- **[[c1]]** `analyze-bundle` `src/daemon/steps/analyze-step/types.ts:24-30`
- **[[c2]]** `analyze-bundle` `src/daemon/steps/analyze-step/phases/start.ts:44`
- **[[c3]]** `analyze-bundle` `src/daemon/steps/analyze-step/phases/start.ts:72`
- **[[c4]]** `analyze-bundle` `src/daemon/steps/analyze-oneshot.ts:41-53`
- **[[c5]]** `analyze-bundle` `src/mcp/server.ts:229-262`
- **[[c6]]** `analyze-bundle` `src/mcp/server.ts:266-397`
- **[[c7]]** `analyze-bundle` `src/shared/analyze-types.ts:33-60`
- **[[c8]]** `analyze-bundle` `src/analyze/context/scope.ts:101-139`
- **[[c9]]** `analyze-bundle` `src/analyze/context/scope.ts:149-164`
- **[[c10]]** `analyze-bundle` `src/analyze/classifier/validate.ts:58-64`
- **[[c11]]** `analyze-bundle` `src/daemon/steps/analyze-step/scope.ts:33`
- **[[c12]]** `analyze-bundle` `src/analyze/context/driver.ts:1262-1275`
- **[[c13]]** `analyze-bundle` `src/daemon/steps/analyze-step/phases/plan.ts:122-127`
- **[[c14]]** `analyze-bundle` `src/analyze/explore/types.ts:926-945`
- **[[c15]]** `analyze-bundle` `src/analyze/explore/concept-resolve.ts:554-571`
- **[[c16]]** `analyze-bundle` `src/prompts/analyze/synthesize.code.system.md:132`
- **[[c17]]** `analyze-bundle` `src/analyze/docs-retrieval.ts:99-121`
- **[[c18]]** `analyze-bundle` `src/analyze/docs-retrieval.ts:169-250`
- **[[c19]]** `analyze-bundle` `src/analyze/measure.ts:416-449`
- **[[c20]]** `analyze-bundle` `src/prompts/steering-block.md:55-60`
- **[[c21]]** `analyze-bundle` `src/analyze/context/decomposer.ts:363-370`
- **[[c22]]** `analyze-bundle` `src/mcp/__tests__/forward-step.test.ts:201-213`
- **[[c23]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md`
- **[[c24]]** `analyze-bundle` `src/analyze/__tests__/docs-retrieval.test.ts`
- **[[c25]]** `analyze-bundle` `src/analyze/explore/__tests__`
- **[[c26]]** `code` `src/analyze/explore/answer-report.ts:37`
- **[[c27]]** `code` `src/analyze/explore/completeness-facts.ts`
- **[[c28]]** `analyze-bundle` `src/prompts/analyze/decompose.system.md:162`
- **[[c29]]** `analyze-bundle` `src/daemon/steps/analyze-step/cache-lookup.ts`
- **[[c30]]** `analyze-bundle` `src/daemon/analyze-rpc.ts:1162-1178`
- **[[c31]]** `analyze-bundle` `src/analyze/runtimes/shared/task-scope.ts:105-150`
- **[[c32]]** `analyze-bundle` `src/db/exploration-cache.ts:44-110`
- **[[c33]]** `analyze-bundle` `src/mcp/forward-step.ts:47-51`

## 9. Open questions

- Should a prompt-only call be refused later (alternative a3) once agents send the request object, and what evidence (share of prompt-only calls) should trigger that?
- Which explorations beyond concept.resolve and the doc explorations should honour the resolved scope's area in a follow-up Story? Other code-family runners still ignore ctx.scope for their area filter, although they now read the right repository.
- Checklist cd2 and alt2 were marked partial: some existing runners are shown with elided parameter lists because only the values they pass change, and the alternatives carry no constraint scores because the Story has no acceptance criteria, epic constraints or HLD contracts to score.

## Resolved questions

- `q68525952` — Should a prompt-only call be refused later (alternative a3) once agents send the request object, and what evidence (share of prompt-only calls) should trigger that?
  - **resolved**: Enforce by declared contract — User accepted the recommendation (2026-11-06). _(2026-11-06T19:33:20.976Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/daemon/steps/analyze-step/types.ts:24-30`
- **[[c2]]** `analyze-bundle` `src/daemon/steps/analyze-step/phases/start.ts:44`
- **[[c3]]** `analyze-bundle` `src/daemon/steps/analyze-step/phases/start.ts:72`
- **[[c4]]** `analyze-bundle` `src/daemon/steps/analyze-oneshot.ts:41-53`
- **[[c5]]** `analyze-bundle` `src/mcp/server.ts:229-262`
- **[[c6]]** `analyze-bundle` `src/mcp/server.ts:266-397`
- **[[c7]]** `analyze-bundle` `src/shared/analyze-types.ts:33-60`
- **[[c8]]** `analyze-bundle` `src/analyze/context/scope.ts:101-139`
- **[[c9]]** `analyze-bundle` `src/analyze/context/scope.ts:149-164`
- **[[c10]]** `analyze-bundle` `src/analyze/classifier/validate.ts:58-64`
- **[[c11]]** `analyze-bundle` `src/daemon/steps/analyze-step/scope.ts:33`
- **[[c12]]** `analyze-bundle` `src/analyze/context/driver.ts:1262-1275`
- **[[c13]]** `analyze-bundle` `src/daemon/steps/analyze-step/phases/plan.ts:122-127`
- **[[c14]]** `analyze-bundle` `src/analyze/explore/types.ts:926-945`
- **[[c15]]** `analyze-bundle` `src/analyze/explore/concept-resolve.ts:554-571`
- **[[c16]]** `analyze-bundle` `src/prompts/analyze/synthesize.code.system.md:132`
- **[[c17]]** `analyze-bundle` `src/analyze/docs-retrieval.ts:99-121`
- **[[c18]]** `analyze-bundle` `src/analyze/docs-retrieval.ts:169-250`
- **[[c19]]** `analyze-bundle` `src/analyze/measure.ts:416-449`
- **[[c20]]** `analyze-bundle` `src/prompts/steering-block.md:55-60`
- **[[c21]]** `analyze-bundle` `src/analyze/context/decomposer.ts:363-370`
- **[[c22]]** `analyze-bundle` `src/mcp/__tests__/forward-step.test.ts:201-213`
- **[[c23]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md`
- **[[c24]]** `analyze-bundle` `src/analyze/__tests__/docs-retrieval.test.ts`
- **[[c25]]** `analyze-bundle` `src/analyze/explore/__tests__`
- **[[c26]]** `code` `src/analyze/explore/answer-report.ts:37`
- **[[c27]]** `code` `src/analyze/explore/completeness-facts.ts`
- **[[c28]]** `analyze-bundle` `src/prompts/analyze/decompose.system.md:162`
- **[[c29]]** `analyze-bundle` `src/daemon/steps/analyze-step/cache-lookup.ts`
- **[[c30]]** `analyze-bundle` `src/daemon/analyze-rpc.ts:1162-1178`
- **[[c31]]** `analyze-bundle` `src/analyze/runtimes/shared/task-scope.ts:105-150`
- **[[c32]]** `analyze-bundle` `src/db/exploration-cache.ts:44-110`
- **[[c33]]** `analyze-bundle` `src/mcp/forward-step.ts:47-51`
