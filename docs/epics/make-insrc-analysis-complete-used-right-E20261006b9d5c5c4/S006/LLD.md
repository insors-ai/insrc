<!-- insrc:artifact LLD-b9d5c5c40df5a574-s6 -->

# LLD: E20261007b9d5c5c4:S006

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `7d17654ecfd1...`

A broad request to the analyzer fails today the moment its context is built, and the failure says the model is unavailable although no model was called. This Story makes such a request run: the lookup pipeline stops refusing a request with no specific question, and serves a request that names a single file, a symbol, a manifest directory or a data connection. Every way the pipeline can decline to proceed gets its own stated cause, converted to an error in one place, so 'model unavailable' is reported only when a model call failed. A scope is resolved once, by one function, and the table of which kind of scope goes with which kind of source is corrected and applied to every request.

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

**Rollout phase:** Phase A — an unfocused request runs, and a request that cannot proceed says why
**Owns:** `sc6` (Causes of not proceeding)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Turning every swallowed error into the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, added as one more case to the raise site and the mapping that Story s6 owns, and passed through everything that reaches the context builder (six callers, the one-shot agent tool and the daemon's workflow runner, with the error's data carried through the daemon's error mapping). Keeping the report out of the schema given to a model at both places the schema reaches one (the answer-writing call and the tool loop's final answer), and rejecting a report an agent supplies. What the step tool attaches to a bundle the agent wrote. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs. The free-form fallback: an optional field for partial findings on the failed output, the loop's exit at the limit attaching what it gathered, reaching its turn limit becoming a failed output, and its answer gets a report that says it rests on a search directed by a model. Reading the data drivers' cut flag into the completeness record of the table-listing lookup and the object-listing plan task. — owns `sc1`, `sc2`
- `s2`: The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, what the decomposer and planner receive as size at each moment, the size's effect on plan depth as well as task count, and measuring a child plan from the area it names when it is spawned, with the planner model's figure and a size on the daemon request kept as hints. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer. The source of the measure for each of the seven kinds of scope, including counting a data connection's tables or objects from the live source through the data driver, and the fallback to XL, recorded as not determined, when a count cannot be taken. Adding a complete mode to the data drivers' listings for the count (the five relational drivers, four of the six namespace drivers, the file listing; Redis and etcd are recorded as not determined, since their listing is a sample of keys), with the limited mode kept for other callers; a listing that reports it was cut is never a determined count. — owns `sc3`
- `s3`: The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold. — owns `sc4`
- `s4`: Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content (the eight sites the Define lists, including the three adherence checks). The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method. Raising the lookup cache's version again, and dropping limit parameters before a lookup's cache key is taken. Building cancellation (a signal from each caller through the context builder to a check between turns; the run's signal into the plan walk and the classifier; the optional signal on the daemon's standard handlers; the signal parameter on the daemon's context-building functions; a signal on the step tool's plan and narrow phases, through stepPlan and the runner context; the new cancel request for the five requests received over the socket that reach a tool loop (the three context requests, the plan request and the classify request), with the daemon's table of run id to canceller; the cancelled case in the classify stage's mapping; 'aborted' in the daemon's error codes; what a cancelled loop returns), moving the table-listing lookup and the object-listing plan task to the complete mode of the data drivers' listings, and only then removing the turn limit and retiring its configuration setting (catalog row, retired list, the analyzer's configuration, the planning prompt, the VS Code extension's declaration with a release, the pages that document it, the reconcile fixture) for all three users of the loop (the free-form lookup and the classification and task modes) and giving the loop the complete mode of its search tools. Removing the error and the code for reaching the turn limit from both lists and both mappings, with the tests that import the error and the test configuration that sets the limit.
- `s5`: Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses. — owns `sc5`
- `s7`: Widening the plan tasks of each family (code, docs, infra, data) to exactly the kinds of scope the corrected table gives it, with the scope check the docs tasks share with the code tasks taking the family's row as an argument, and every task that reads the scope's value directly (three docs tasks, the shared adherence task, the task that lists data connections) moved to the resolution function Story s6 defines, including a data connection for the data tasks, and refusing any other pairing with the existing code for it. Running a broad analysis through classification, the run context, planning, the plan walk with its nested plans, and the aggregator, to a final report; finding and correcting what stops it at each stage. A stop the run catches is already recorded; what is added is a handler for an error nothing catches, in the plan walk and in the daemon's request, that writes the run record, and the rule that a record still in progress with no live run behind it is abandoned: the daemon's in-memory set of running ids, the three readers that apply it, and the rewrite of the record as failed with the code 'run-abandoned', which Story s6 declares and this Story raises. Making a task's refusal of a scope a typed error the plan walk recognises, with an optional code on the failed-task record. Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `tryExplorationPipeline`

```typescript
function tryExplorationPipeline(args: { invocationMode: ShaperMode; shaperId: ShaperId; inputs: RunShaperArgs['inputs']; runId: string; scope: ResolvedScope }): Promise<PipelineOutcome>

type PipelineOutcome =
  | { readonly kind: 'bundle'; readonly raw: Omit<AnalyzeContextBundle, 'meta'>; readonly explorationCount: number }
  | { readonly kind: 'not-applicable' }                       // not run mode: the caller continues to its tool loop, as today
  | { readonly kind: 'did-not-proceed'; readonly cause: PipelineCause; readonly message: string; readonly promptPath?: string };   // promptPath for the two prompt-missing causes

type PipelineCause =
  | 'invalid-input'          // unknown kind of source, or inputs with no intent
  | 'planner-prompt-missing' | 'planner-model-failed'
  | 'answer-prompt-missing'  | 'answer-model-failed'
  | 'answer-invalid'         // the answer-writing step failed for any other reason (its output did not have the required shape)
  | 'empty-plan'             // the plan that would be executed has no lookups
  | 'bundle-invalid';        // the pipeline produced a bundle that fails validation (set by runShaper)
```

**Parameters:**
- `args.scope: ResolvedScope` — The scope already resolved by resolveScope; the pipeline no longer reads intent.scopeRef.value itself.
- `args.invocationMode, shaperId, inputs, runId: as today` — Unchanged.

**Returns:** `Promise<PipelineOutcome>` — A bundle; 'not-applicable' for a mode the pipeline does not serve; or 'did-not-proceed' with one cause. It never returns null. The gate on intent.focused and the gate on the kind of scope are removed: an unfocused intent goes to the planning call, whose prompt gains a stated recipe for it per kind of source (today it has one line in the user turn and nothing in the system prompt), and all seven kinds of scope arrive resolved.

**Errors:**
- `(none thrown for a cause)` when The pipeline has eight places that return null today (src/analyze/context/driver.ts:1089, :1099, :1100, :1102, :1110, :1130, :1252, :1258). Two are gates that are removed (:1102, :1110). The other six each return a cause: :1089 'not-applicable'; :1099 and :1100 'invalid-input'; :1130 'planner-model-failed' or 'planner-prompt-missing' by the error's class; :1252 'answer-model-failed' or 'answer-prompt-missing' by the error's class; :1258, which today catches every other error from the answer-writing step (for example SynthesizerSchemaUnrecoverable) and returns null, returns 'answer-invalid' with the error's message. Any other failure of the planning call is replaced by the free-form lookup, as today. An error thrown from elsewhere (the lookup executor, the stores) is not caught by the pipeline today and still is not; it reaches the mapping functions as 'internal-error' with its message.

**Preconditions:**
- args.scope came from resolveScope for this intent

**Postconditions:**
- Every return statement returns one of the three cases
- A plan that is empty, uncovered or unparseable is replaced by the free-form lookup as today; the 'empty-plan' cause is returned only if the plan about to be executed still has no lookups

### 2.2 `runShaper`

```typescript
function runShaper(args: RunShaperArgs): Promise<AnalyzeContextBundle>   // signature unchanged in this Story
```

**Parameters:**
- `args: RunShaperArgs` — Unchanged.

**Returns:** `Promise<AnalyzeContextBundle>` — Unchanged for a request that proceeds. It resolves the scope first, for every mode, since the cache freshness check and the tool loop's path are read for every mode; for run mode it then converts a 'did-not-proceed' outcome to a typed error through one table (cause to error class); the single throw of ShaperLlmUnavailableError('Run-mode exploration pipeline returned no bundle') is deleted.

**Errors:**
- `ScopeKindTargetMismatchError (new) -> the existing code 'scope-ref-kind-target-mismatch'` when run mode, and the intent's kind of scope does not go with its kind of source by the corrected table (isKindCompatibleWithTarget, src/analyze/classifier/validate.ts). Checked at the head of runShaper before the scope is resolved, because the validator is called from one place only (src/analyze/classifier/driver.ts:160) and requests that arrive with a ready-made intent are never checked: the daemon's run-context and plan requests (src/daemon/analyze-rpc.ts:419-423), and the one-shot agent tool (src/mcp/server.ts:1295). The step tool does not call runShaper (its start phase calls prepareDecompose and its plan and narrow phases call stepPlan), so this check does not cover it: its start phase makes the same test itself with isKindCompatibleWithTarget on the intent it builds (src/mcp/analyze-step/phases/start.ts:51-58) and returns an error result naming the pairing. Today that intent is always a workspace scope, which every row of the table allows, so the test passes; it is there so a later widening of the step tool's scope cannot go round the table.
- `ShaperInvalidInputError (new) -> 'invalid-input'` when cause 'invalid-input'
- `ShaperPromptMissingError (existing) -> 'shaper-prompt-missing'` when cause 'planner-prompt-missing' or 'answer-prompt-missing'. ShaperPromptMissingError takes a path (:157-160), so the cause carries promptPath; the planning call's and the answer-writing call's prompt-missing errors, which hold the path only inside their message today (decomposer.ts, synthesizer.ts:72-76), gain a readonly path field that the pipeline reads
- `ShaperLlmUnavailableError (existing) -> 'shaper-llm-unavailable'` when cause 'planner-model-failed' or 'answer-model-failed': a model call failed. Story s1 later replaces the 'answer-model-failed' row with its own error carrying the lookup results.
- `ShaperNoPlanError (new) -> 'no-plan-for-request'` when cause 'empty-plan'
- `ShaperAnswerInvalidError (new) -> the existing code 'shaper-schema-unrecoverable'` when cause 'bundle-invalid': constructed with the stage 'bundle validation' and the validation errors, so the message reads that the bundle failed validation. The existing ShaperSchemaUnrecoverable is not used, because its constructor writes 'Shaper completeStructured exhausted N retries' (src/analyze/context/driver.ts:147-152), which is not what happened. Story s1 later replaces this row.
- `ShaperAnswerInvalidError (new) -> the existing code 'shaper-schema-unrecoverable'` when cause 'answer-invalid': constructed with the stage 'answer writing' and the answer-writing step's error message. Story s1 later replaces this row with its own error carrying the lookup results.
- `ScopeRefUnresolvedError (new) -> 'scope-ref-unresolved'` when thrown by resolveScope
- `ScopeNotIndexedError (existing) -> 'scope-not-indexed'` when as today, from ensureNonEmptyClosure, now given the resolved scope

**Postconditions:**
- No run-mode path that the pipeline itself declines ends in an error outside the rows above; an unexpected error thrown by the lookup executor or a store propagates unchanged and is mapped to 'internal-error' with its message
- The table from cause to error is exhaustive over PipelineCause; the compiler enforces it (a switch with a never check, no bare default)
- Every route into the pipeline is checked against the pairing table: the two classification branches by the validator, every run-mode context build by this check, and the step tool by the same test in its start phase

### 2.3 `resolveRepoPath`

```typescript
// replaced, together with inferScopePath and inferRepoPath, by one exported function in a new module src/analyze/context/scope.ts. All three are deleted; their callers are listed in the postconditions.
function resolveScope(ref: AnalyzeScopeRef, deps?: ScopeDeps): Promise<ResolvedScope>

interface ResolvedScope {
  readonly kind: AnalyzeScopeRef['kind'];
  readonly value: string;                 // as given
  readonly repoPath: string | null;       // the registered repo that contains the scope (longest prefix), or the connection's repo; null when none is registered
  readonly lookupPath: string;            // the directory lookups run in. repo, module, manifest-dir, workspace: the scope's own directory, as today. file, symbol: repoPath, or the file's directory when no repo is registered. connection: its repo
  readonly filePath?: string;             // file and symbol
  readonly entityId?: string;             // symbol
  readonly entityName?: string;           // symbol
  readonly connectionId?: string;         // connection
}
interface ScopeDeps { listRepos(): Promise<readonly RegisteredRepo[]>; findEntitiesByFile(file: string): Promise<readonly Entity[]>; listEntitiesForRepo(repoPath: string): Promise<readonly Entity[]>; loadConnections(repoPath: string): Promise<LoadedConnections>; }
```

**Parameters:**
- `ref: AnalyzeScopeRef` — The scope as the request gave it.
- `deps: ScopeDeps` _(optional)_ — The registry, entity and connection readers; defaulted to the real ones, supplied by tests.

**Returns:** `Promise<ResolvedScope>` — repo, module, manifest-dir, workspace: the value is the directory. file: filePath is the value. symbol: the value has the form '<absolute file path>#<entity name>'; it is split at the last '#', and the name must match exactly one stored entity of that file. connection: the value is a connection id; the connections files of the registered repos are searched and the id must be found in exactly one.

**Errors:**
- `ScopeRefUnresolvedError` when a symbol value with no '#'; a symbol whose file holds no entity of that name, or more than one (the message lists them with kind and line); a connection id registered in no repo, or in more than one (the message names the repos)
- `ScopeNotIndexedError (existing)` when a symbol whose containing registered repo has no stored entities; a symbol whose file lies inside no registered repo (registeredAs undefined, the message 'no registered repo contains the scope path', as src/analyze/context/invariants.ts:142-148 reports it today); a symbol when no repo is registered at all

**Postconditions:**
- Nothing else in the context builder reads scopeRef.value. The readers today, all moved to the ResolvedScope: the cache freshness read for every mode (src/analyze/context/driver.ts:190, through inferScopePath, including classification inputs that carry a scopeRef and no intent); the tool loop's path for the classification and task modes (:291) and for the free-form lookup (:564, reached from src/analyze/explore/freeform-probe.ts:116 with an intent that lookup builds itself), both through inferRepoPath (:945-948); the pipeline's lookup path and its freshness read (:1175-1177); the planning prompt (decomposer.ts:308); and the indexed check (invariants.ts)
- For a repo, a module, a manifest directory and a workspace, lookupPath is the scope's own directory whether or not a registered repo contains it, which is today's behaviour: the lookups, the lookup cache's key and the planning prompt's 'Repo path' line all get the same value they get today (src/analyze/context/driver.ts:978-979, :1176-1183; decomposer.ts:308). Only a file, a symbol and a connection get a different path from today, and those are not served today
- For a connection, lookupPath is the connection's repo, where today the tool loop is given the daemon's working directory
- The scope is resolved for classification mode too, so a symbol or connection that does not resolve fails there with 'scope-ref-unresolved', where today it runs on with a wrong path
- For a symbol, the containing repo is checked for being indexed before the entity is looked for: a registered repo with no stored entities fails as ScopeNotIndexedError (the test ensureNonEmptyClosure makes, src/analyze/context/invariants.ts:152-158), for every kind of source, so a symbol in a repo that is not yet indexed is not reported as 'no entity of that name'
- The skip that the indexed check makes for a registry with no repos at all (src/analyze/context/invariants.ts:125-131) is kept for every other kind of scope and is not applied to a symbol: a symbol cannot be served from the file system alone, since it resolves to a stored entity

### 2.4 `validateIntentSemantics`

```typescript
function validateIntentSemantics(intent: ClassifiedIntent, connectionExists?: (id: string) => Promise<boolean>): Promise<ValidationFailure | null>   // signature unchanged
```

**Parameters:**
- `connectionExists: (id: string) => Promise<boolean>` _(optional)_ — Now supplied by both callers of the classifier and by the branch with a target hint, from resolveScope's connection search.

**Returns:** `Promise<ValidationFailure | null>` — Unchanged in shape. TARGET_TO_KINDS becomes: code: repo, module, file, symbol, manifest-dir, workspace; data: connection, repo, manifest-dir, workspace; infra: repo, manifest-dir, workspace; docs: repo, module, file, workspace; generic: all seven. checkScopeRefResolves splits a symbol's value at the last '#' before any test against the file system and tests the file part.

**Errors:**
- `'scope-ref-kind-target-mismatch'` when a pairing not in the corrected table
- `'scope-ref-unresolved'` when as today, plus a symbol value with no '#' or whose file part is not a file

**Postconditions:**
- The classifier prompt's pairing list (classify.system.md:30-38), its rule for a symbol's value (:44), the comment on the table and the matrix test state the same rows

### 2.5 `runAnalyze`

```typescript
function runAnalyze(args: RunAnalyzeArgs, opts?: RunAnalyzeOpts): Promise<RunAnalyzeResult>   // signature unchanged
```

**Parameters:**
- `args.targetHint: AnalyzeTarget` _(optional)_ — On this branch the intent is now built with focus = the trimmed user prompt and focused = true when the prompt is not empty, and focused = false otherwise; then validateIntentSemantics is called on it directly.

**Returns:** `Promise<RunAnalyzeResult>` — Unchanged in shape. A validation failure on the target-hint branch fails the run at stage 'classify' with the code the check returned.

**Errors:**
- `'scope-ref-kind-target-mismatch' / 'scope-ref-unresolved'` when the hinted kind of source does not go with the scope, or the scope does not resolve

**Postconditions:**
- Both branches pass a connection check to the validator
- A hinted request with a prompt is planned with the focused bounds of the plan size bands (src/analyze/planner/validate.ts:305), like a classified request with a focus

### 2.6 `classifyClassifierError`

```typescript
function classifyClassifierError(err: unknown): RunFailure   // plan tree, src/analyze/orchestrator/driver.ts:414
```

**Parameters:**
- `err: unknown` — An error from the classify stage.

**Returns:** `RunFailure` — For ClassifierValidationExhausted, the inner failure's code and message, as the daemon's mapping already returns; for an error that is not one of the classifier's own, the result of classifyShaperError, where today it is 'internal-error'.

**Postconditions:**
- The two message-pattern tests are removed; the inner code is read from the error. The existing test of those patterns (src/analyze/orchestrator/__tests__/orchestrator.test.ts:83-88) is replaced by one that passes a ClassifierValidationExhausted with each inner code, and the row of the table test above it that expects 'classifier-validation-exhausted' from an error built with an empty failure (:68-80, row at :72) is rewritten with a real ValidationFailure and its inner code; the test that an unrecognised error gives 'internal-error' (:90) still holds, through the context mapping

### 2.7 `classifyShaperError`

```typescript
function classifyShaperError(err: unknown): RunFailure            // plan tree, src/analyze/orchestrator/driver.ts:428
function classifyShaperError(err: unknown): AnalyzeRpcErrorPayload // daemon, src/daemon/analyze-rpc.ts:882
```

**Parameters:**
- `err: unknown` — An error from the context builder.

**Returns:** `RunFailure | AnalyzeRpcErrorPayload` — Both gain the same five cases: ScopeKindTargetMismatchError -> the existing code 'scope-ref-kind-target-mismatch', ShaperInvalidInputError -> 'invalid-input', ShaperNoPlanError -> 'no-plan-for-request', ScopeRefUnresolvedError -> 'scope-ref-unresolved', ShaperAnswerInvalidError -> the existing code 'shaper-schema-unrecoverable'.

**Postconditions:**
- The two functions map the same set of error classes; a test compares them

## 3. Data model changes

### 3.1 `RunErrorCode / AnalyzeRpcErrorCode` — field-add

Three members are added to both unions: 'no-plan-for-request' (raised here), 'answer-step-failed' (declared here, raised by Story s1) and 'run-abandoned' (declared here, raised by Story s7). 'invalid-input', 'scope-ref-unresolved', 'scope-ref-kind-target-mismatch' and 'shaper-prompt-missing' already exist in both and are reused. RunFailure and RunStage are unchanged, so stored run records read as before. The codes are part of the contract mirrored in the IDE repository.

```
+ | 'no-plan-for-request'
+ | 'answer-step-failed'
+ | 'run-abandoned'
```

**Call sites:**
- `src/analyze/orchestrator/types.ts`
- `src/daemon/analyze-rpc.ts`

### 3.2 `PipelineOutcome / PipelineCause` — new

The pipeline's return type, replacing 'result or null'. Eight causes; module-private to the context builder.

**Call sites:**
- `src/analyze/context/driver.ts`

### 3.3 `ResolvedScope` — new

The result of resolving a scope once. Exported from a new module, src/analyze/context/scope.ts, for the pipeline here and for the plan tasks Story s7 moves to it.

**Call sites:**
- `src/analyze/context/driver.ts`
- `src/analyze/context/decomposer.ts`
- `src/analyze/context/invariants.ts`

### 3.4 `Typed errors of the context builder` — new

ShaperInvalidInputError, ShaperNoPlanError, ScopeRefUnresolvedError, ScopeKindTargetMismatchError and ShaperAnswerInvalidError (a stage, 'bundle validation' or 'answer writing', and the detail; its message states which), declared beside the existing ShaperLlmUnavailableError and ShaperPromptMissingError. DecomposerPromptMissingError and SynthesizerPromptMissingError gain a readonly path field.

**Call sites:**
- `src/analyze/context/driver.ts`
- `src/analyze/orchestrator/driver.ts`
- `src/daemon/analyze-rpc.ts`
- `src/analyze/context/decomposer.ts`
- `src/analyze/context/synthesizer.ts`

### 3.5 `AnalyzeScopeRef (symbol value)` — invariant-change

A symbol scope's value has a defined form, '<absolute file path>#<entity name>'. The type is unchanged (kind and a text value). A value in another form no longer resolves.

**Call sites:**
- `src/shared/analyze-types.ts`
- `src/analyze/classifier/validate.ts`
- `src/prompts/analyze/classify.system.md`

### 3.6 `ClassifiedIntent (target-hint branch)` — invariant-change

An intent built for a request with a stated kind of source carries the user's prompt as its focus and focused = true when the prompt is not empty. The type is unchanged.

**Call sites:**
- `src/analyze/orchestrator/driver.ts`

### 3.7 `The planning prompt's user turn` — field-modify

buildMessages has two callers, decompose and the exported prepareDecompose, which the step tool's start phase calls (src/mcp/analyze-step/phases/start.ts:91) with a workspace scope it builds itself (:51-58). Both gain the resolved scope: DecomposeArgs gets a scope field, and prepareDecompose takes it as a second argument and stays synchronous; the step tool's start phase, which is already asynchronous, calls resolveScope first. buildMessages takes the ResolvedScope: it prints lookupPath as the 'Repo path' line, which for a repo, a module, a manifest directory and a workspace is the same value as today, and for a file, a symbol or a connection one further line naming that file, entity or connection, so the planning call plans lookups on it.

**Call sites:**
- `src/analyze/context/decomposer.ts`
- `src/mcp/analyze-step/phases/start.ts`

### 3.8 `The lookup executor's runner context and the free-form lookup` — field-add

The free-form lookup never sees the request's scope today: runShaperToolLoop takes only inputs (src/analyze/context/driver.ts:557-570), its one caller builds its own intent with a workspace scope on the runner context's repo path (src/analyze/explore/freeform-probe.ts:93-110, :116), and the runner context carries only repoPath (src/analyze/explore/types.ts:761). So a file, symbol or connection request that falls to the free-form lookup loses the thing it named. The runner context gains the ResolvedScope; executePlan's arguments carry it, and so do stepPlan's, for the step tool. The step tool's plan and narrow phases take their paths from the state token (src/mcp/analyze-step/phases/plan.ts:108-114, narrow.ts:171), which holds the intent and no resolved scope (start.ts:93-101); each phase calls resolveScope again on the intent's scope from the token, so the token's shape and its version do not change and a token minted before the change still works. The free-form lookup builds its intent with the request's own scope (kind and value) and passes the ResolvedScope to runShaperToolLoop, whose arguments gain it and which takes the loop's path from lookupPath. The size 'M' written there is left for Story s2.

**Call sites:**
- `src/analyze/explore/freeform-probe.ts`
- `src/analyze/explore/types.ts`
- `src/analyze/explore/executor.ts`
- `src/analyze/context/driver.ts`
- `src/mcp/analyze-step/phases/plan.ts`
- `src/mcp/analyze-step/phases/narrow.ts`

### 3.9 `The planning prompt (src/prompts/analyze/decompose.system.md)` — field-add

The planning call's only handling of an unfocused intent is one line of the user turn (src/analyze/context/decomposer.ts:298-300). Its system prompt says nothing about it, and every recipe there substitutes the focus into a lookup's parameter (for example concept.resolve(query="<intent.focus>") at :171, doc.decision.trace(topic="<intent.focus>") at :181, capability.reuse-check at :219), so with no focus the model has nothing to substitute. A section is added for an intent with no focus, giving one recipe per kind of source that starts from the scope the request names and not from a focus: code on a directory scope, the structural-map answer type with module.profile, import.graph and convention.detect on the named path; code on a file, module.profile on the file; code on a symbol, symbol.locate on the named entity with usage.example and class.hierarchy; data, the data-inventory answer type with db.connections.list then db.tables.list, or db.tables.list alone on a named connection; infra, the infra-inventory answer type with manifests.locate; docs and generic, which have no lookup that works without a subject, a single freeform.probe whose purpose is a broad survey of the named scope. The section goes with the other recipes, after them and before the output format, and the lookup catalog it refers to stays where it is; no limit parameter is written into it. The user turn's unfocused line names the section.

**Call sites:**
- `src/prompts/analyze/decompose.system.md`
- `src/analyze/context/decomposer.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | Declares the three new codes in RunErrorCode and AnalyzeRpcErrorCode, raises 'no-plan-for-request', and reuses four existing codes for the other causes. Owns the one table from cause to error in runShaper and the mapping functions on both sides, so Story s1 adds 'answer-step-failed' as one cause, one row and one mapping case, and Story s7 raises 'run-abandoned' without touching the context builder. |

## 5. Error paths

**Error cases**

- **A request that arrives with a ready-made intent pairs a kind of scope with a kind of source the table does not allow, for example a code request on a data connection sent to the daemon's run-context request** (recoverable)
  - Detection: runShaper, in run mode, tests the pairing with isKindCompatibleWithTarget before it resolves the scope. Without this, removing the pipeline's gate on the kind of scope would let such a request run unchecked.
  - Response: ScopeKindTargetMismatchError naming the pairing and the kinds allowed; mapped to the existing 'scope-ref-kind-target-mismatch'.
  - User impact: The request is refused with the reason, on every route into the pipeline.
- **The planning call's model cannot be reached** (recoverable)
  - Detection: The pipeline catches DecomposerLlmUnavailableError, as it does today, and returns the cause 'planner-model-failed' where today it returns null.
  - Response: runShaper throws ShaperLlmUnavailableError with a message that says the planning call failed and carries the underlying message; mapped to 'shaper-llm-unavailable'.
  - User impact: The request fails and says the model was unavailable, which is true here.
- **The planning prompt file or the answer-writing prompt file is missing** (terminal)
  - Detection: The pipeline catches DecomposerPromptMissingError or SynthesizerPromptMissingError and returns 'planner-prompt-missing' or 'answer-prompt-missing'.
  - Response: runShaper throws ShaperPromptMissingError with the path the cause carries; mapped to the existing 'shaper-prompt-missing'.
  - User impact: The request fails and names a broken installation, where today it says the model is unavailable.
- **The answer-writing call's model cannot be reached** (recoverable)
  - Detection: The pipeline catches SynthesizerLlmUnavailableError and returns 'answer-model-failed'.
  - Response: runShaper throws ShaperLlmUnavailableError saying the answer-writing call failed. The lookup results are still discarded in this Story; Story s1 replaces this row with an error that carries them.
  - User impact: The request fails with a true cause. What the lookups found is not returned until Story s1.
- **The pipeline produced a bundle that fails validation** (recoverable)
  - Detection: validateBundleWithErrors returns not ok in runShaper, where today the result is logged and falls through to the 'model unavailable' throw.
  - Response: runShaper throws ShaperAnswerInvalidError with the stage 'bundle validation' and the validation errors; mapped to the existing code 'shaper-schema-unrecoverable'. Story s1 replaces this row.
  - User impact: The request fails and says the answer did not have the required shape.
- **The answer-writing step fails for a reason other than its model or its prompt file, for example its output does not have the required shape after its retries** (recoverable)
  - Detection: The catch-all after the answer-writing call (src/analyze/context/driver.ts:1254-1258), which today logs and returns null for any other error, returns the cause 'answer-invalid' with the error's message.
  - Response: runShaper throws ShaperAnswerInvalidError with the stage 'answer writing' and that message; mapped to the existing code 'shaper-schema-unrecoverable'. Story s1 replaces this row with an error that carries the lookup results.
  - User impact: The request fails and says the answer could not be produced in the required shape, where today it says the model is unavailable.
- **The plan about to be executed has no lookups** (terminal)
  - Detection: A check on plan.explorations.length immediately before executePlan, after the free-form replacement has been applied.
  - Response: The pipeline returns 'empty-plan'; runShaper throws ShaperNoPlanError; mapped to 'no-plan-for-request'.
  - User impact: The request fails and says no plan could be made for it. With the free-form replacement in place this cannot occur today; the check stands so that a later change to the replacement cannot turn an empty plan into a silent nothing.
- **Run-mode inputs name an unknown kind of source or carry no intent** (terminal)
  - Detection: The two tests at the head of the pipeline that return null today return 'invalid-input'.
  - Response: runShaper throws ShaperInvalidInputError; mapped to the existing 'invalid-input'.
  - User impact: A caller that built the request wrongly is told so. No user request reaches this through the daemon, which validates the intent first.
- **A symbol scope's value has no '#', or its name matches no stored entity in the file, or more than one** (recoverable)
  - Detection: resolveScope splits at the last '#'; it reads the file's stored entities and counts those whose name equals the given name.
  - Response: ScopeRefUnresolvedError; the message gives the form expected, or lists the entities of that name with kind and line; mapped to 'scope-ref-unresolved'.
  - User impact: The request fails and says what would resolve.
- **A symbol scope in a registered repo that has not been indexed** (recoverable)
  - Detection: resolveScope, before it looks for the entity, counts the stored entities of the containing repo and finds none.
  - Response: ScopeNotIndexedError with the scope path and how the repo is registered; mapped to the existing 'scope-not-indexed'.
  - User impact: The request fails and says the repo is not indexed, not that the symbol does not exist.
- **A symbol scope whose file lies inside no registered repo, or when no repo is registered at all** (recoverable)
  - Detection: resolveScope's longest-prefix match over the registered repos finds none for the file's path, before it looks for the entity.
  - Response: ScopeNotIndexedError with the scope path and registeredAs undefined; mapped to the existing 'scope-not-indexed'. Without this the file's stored entities would be read, none found, and the request reported as 'no entity of that name'.
  - User impact: The request fails and says no registered repo contains the path.
- **A connection scope's id is registered in no repo, or in more than one** (recoverable)
  - Detection: resolveScope reads the connections file of each registered repo and counts the repos that declare the id.
  - Response: ScopeRefUnresolvedError naming the id and, when there are several, the repos; mapped to 'scope-ref-unresolved'.
  - User impact: The request fails with the reason; with several repos the user names the repo instead.
- **A repo's connections file cannot be parsed while a connection id is being looked for** (recoverable)
  - Detection: loadConnections throws for that repo.
  - Response: The error is not swallowed: resolveScope throws ScopeRefUnresolvedError that names the repo and the parse error, because skipping the repo could hide the one that declares the id or hide a duplicate.
  - User impact: The request fails and points at the broken file.
- **A request started with a stated kind of source names a scope that does not go with it, or that does not resolve** (recoverable)
  - Detection: The target-hint branch calls validateIntentSemantics on the intent it built; today that branch calls no validator.
  - Response: The run fails at stage 'classify' with the code the check returned ('scope-ref-kind-target-mismatch' or 'scope-ref-unresolved'), and the run record is written as failed.
  - User impact: A request that today runs on into a later, less clear failure is refused at once with the reason.
- **The classifier's own validation fails after its retries, on the plan tree** (recoverable)
  - Detection: classifyClassifierError tests for ClassifierValidationExhausted and reads its inner failure.
  - Response: The run record carries the inner code, where today it carries 'classifier-validation-exhausted'.
  - User impact: The cause is the same on the plan tree as on the daemon's classify request.
- **The classifier's context build fails on the plan tree** (recoverable)
  - Detection: classifyClassifierError receives an error that is none of the classifier's own.
  - Response: It returns classifyShaperError's result, where today it returns 'internal-error'.
  - User impact: A scope that is not indexed, or a model that is unavailable, is reported as that.
- **The graph store or the repo registry cannot be read while a scope is resolved** (recoverable)
  - Detection: The reader passed to resolveScope throws.
  - Response: For a symbol or a connection, which cannot be resolved without it, the error propagates and is mapped to 'internal-error' with its message. For the other kinds resolveScope returns repoPath null and the scope's own directory, which is today's behaviour, and the code source's indexed check decides.
  - User impact: A symbol or connection request fails with the store's error; other requests behave as today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A request with no specific question on a repo, a module or a workspace | The planning call is made with the unfocused line it already writes, its plan is executed, and a bundle is returned. |
| A request started with a stated kind of source and an empty prompt | The intent is unfocused; it proceeds like the case above. |
| A request started with a stated kind of source and a prompt | The prompt is the intent's focus and the request is planned as a focused one. |
| A file scope inside a registered repo | repoPath is the repo, lookupPath is the repo, filePath is the file; the planning prompt names the file. Today lookups would run in the file's directory, which is no registered repo. |
| A file whose path contains '#', given as a file scope | Unaffected: only a symbol's value is split. |
| A symbol scope whose file path contains '#' | The value is split at the last '#', so the path keeps its own. |
| A manifest directory scope with the code kind of source | Accepted by the corrected table and served; today the validator refuses it though the code plan tasks accept it. |
| A data request on a repo with no connections file | Accepted by the corrected table; the pipeline runs and its data lookups return what they find, which may be nothing. It is not a failure to proceed. |
| A connection scope with the code kind of source | Refused with 'scope-ref-kind-target-mismatch'. |
| A scope path inside no registered repo, with a kind of source other than code | Proceeds with the scope's own directory, as today. |
| A mode other than run (classification, task) | The pipeline returns 'not-applicable' and the caller continues to its tool loop, exactly as today. |
| A plan the planning call returned empty or with an answer type no lookup covers | Replaced by the free-form lookup, as today. |
| An unfocused intent whose plan is replaced by the free-form lookup | The free-form lookup's purpose is a stated broad survey of the named scope. Today it is the classifier's reasoning text (intent.focus ?? intent.reasoning, src/analyze/context/driver.ts:1289-1291), which for a request started with a stated kind of source reads 'target hinted via slash command (classifier skipped)...' and is not a question. |
| An unfocused docs or generic request | The recipe is a single free-form lookup with a broad-survey purpose, because no docs lookup works without a subject. The request proceeds and returns a bundle; it is not a failure. |

**Invariants to preserve**

- A request with a focus on a repo, a module or a workspace builds its context as it does today: the same planning call with the same 'Repo path' line, the same lookups in the same directory, the same lookup cache key, the same answer-writing call. [[c1]]
- A plan that is empty, uncovered or unparseable is replaced by the free-form lookup, not failed. [[c1]]
- Modes other than run are not served by the pipeline and continue to the tool loop. [[c1]]
- The indexed check (ensureNonEmptyClosure) runs only for the code kind of source in run mode, and a scope that is not indexed fails as 'scope-not-indexed' with the scope path and how it is registered. One exception is new: a symbol scope needs the index in every mode and for every kind of source, because it resolves to a stored entity, so a symbol in a repo with no stored entities fails as 'scope-not-indexed' from resolveScope, including for a generic request and in classification mode. No other kind of scope gains this. [[c1]]
- RunFailure is a code, a message and optional data, and RunStage is classify, plan, execute, done; stored run records read as before. [[c3]]
- The validator returns the first failure, the pairing before the resolution, so the classifier's corrective retry has one reason to address. [[c4]]
- The daemon's classify mapping already returns the validator's inner code and already passes other errors to the context mapping; it gains cases and loses none. [[c5]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test), as in src/analyze/context/__tests__/freeform-fallback.test.ts; live suites are gated by INSRC_LIVE_TESTS=1. tsc does not compile test files, so every test named here is proven by running it.`

**Test levels**

- **unit** — Every cause the pipeline can return, and the conversion of each to its error. The pipeline has no seam today for a test to stand in for the planning call, the lookups or the answer-writing call (existing unit tests reach only its pure helpers), so the pipeline function is exported for tests with four steps passed in, defaulted to the real ones: those three and the free-form replacement (fallbackFreeformPlan, called directly today at src/analyze/context/driver.ts:1136 and :1171).
  - Subjects: `pipeline returns 'bundle' for an unfocused intent on a repo, a module and a workspace, and the planning stand-in received the unfocused intent (mutation: restore the focused gate, the test fails)`, `pipeline returns 'bundle' for a file, a symbol, a manifest directory and a connection scope, and the lookup stand-in received the resolved repo as its path (mutation: restore the scope-kind gate)`, `pipeline returns each of 'planner-model-failed', 'planner-prompt-missing', 'answer-model-failed', 'answer-prompt-missing', 'answer-invalid', 'invalid-input' for the stand-in error or input that causes it`, `pipeline returns 'empty-plan' when the free-form replacement, passed in as a fourth stand-in, returns a plan with no lookups (with the real replacement the cause cannot be reached, since it always returns one lookup)`, `pipeline returns 'not-applicable' for classification and task modes`, `an unfocused intent that falls to the free-form lookup gets the stated broad-survey purpose and not the classifier's reasoning text (the existing case in freeform-fallback.test.ts:66, which asserts the reasoning text, is changed with it)`, `the table from cause to error: one case per member of PipelineCause, each asserting the error class and that only the two model-failed causes give ShaperLlmUnavailableError`, `runShaper throws ShaperAnswerInvalidError with stage 'bundle validation', not ShaperLlmUnavailableError and not ShaperSchemaUnrecoverable, when the pipeline's bundle fails validation`, `the message of each error states its cause: 'bundle failed validation' for 'bundle-invalid', 'answer-writing output invalid' for 'answer-invalid', and the prompt file's path for the two prompt-missing causes; none contains 'exhausted' or 'retries'`, `a file-scope request whose plan is replaced by the free-form lookup: the intent the free-form lookup builds has kind 'file' and the file's path, and the loop's path is the resolved repo (today the intent is a workspace scope on the repo)`, `runShaper in run mode refuses a code request on a connection scope with ScopeKindTargetMismatchError before resolving the scope, and accepts every pairing in the corrected table`, `the planning prompt has the section for an intent with no focus, with a recipe for each of the five kinds of source, each naming only lookups that exist in the catalog and no limit parameter (the test reads the prompt file and the lookup registry)`, `the planning call's user turn for an unfocused intent names that section`
  - Fixtures: `stand-ins for the planning call, the lookup executor, the answer-writing call and the free-form replacement`, `a minimal valid bundle and one that fails validation`
- **unit** — Scope resolution, with the registry, entity and connection readers passed in.
  - Subjects: `resolveScope for each of the seven kinds inside a registered repo, including longest-prefix choice between nested repos`, `symbol: split at the last '#'; no '#'; no entity of that name; two entities of that name (the message lists both); a file path that itself contains '#'`, `connection: found in one repo; in none; in two (the message names both); a connections file that fails to parse is reported, not skipped`, `a path inside no registered repo gives repoPath null and the scope's own directory`, `the planning prompt's user turn names the file, entity or connection from the ResolvedScope and prints the repo path, not the raw value`, `the existing test of inferScopePath (src/analyze/context/__tests__/resolve-repo-indexed.test.ts:79-93) rewritten against resolveScope, keeping its cases`, `prepareDecompose given a resolved scope returns the same user turn as decompose builds for it, and the step tool's start phase passes a resolved workspace scope`, `the tool loop's path for classification, task and free-form use is the resolved lookupPath, and for a connection it is the connection's repo, not the working directory`, `a module scope and a manifest directory scope inside a registered repo: lookupPath is the scope's own directory, and the planning prompt's 'Repo path' line and the lookup executor's path are that directory, as today (mutation: make lookupPath the repo root, the test fails)`, `a symbol scope in a registered repo with no stored entities fails with ScopeNotIndexedError, not ScopeRefUnresolvedError`, `the step tool's plan and narrow phases resolve the scope from the intent in the state token, and a token without any scope field still works`, `a generic request and a classification-mode request on a symbol in a registered repo with no stored entities both fail with ScopeNotIndexedError; the same two on a module in that repo proceed as today`, `the step tool's start phase tests the pairing of the intent it builds: its workspace scope passes for every kind of source, and a stand-in scope the table refuses returns an error result and mints no state`, `a symbol whose file is inside no registered repo, and a symbol with an empty registry, both fail with ScopeNotIndexedError with registeredAs undefined; a module with an empty registry proceeds as today`
  - Fixtures: `an in-memory list of registered repos, entities by file, entities by repo, and connections by repo`
- **unit** — The validator and the pairing table.
  - Subjects: `the matrix test rewritten to the corrected rows: every pairing of five kinds of source and seven kinds of scope asserted as accepted or refused (the existing 'infra+repo -> mismatch' case flips)`, `a symbol value in the new form passes when the file exists and fails with 'scope-ref-unresolved' when it has no '#' or the file part is not a file`, `a connection is checked when the function is supplied, and both callers of the classifier now supply it (asserted on the argument the classifier receives)`, `the classifier prompt's pairing list states the same rows as the table: the test reads the prompt file and compares it with the exported table, so the two cannot drift`
  - Fixtures: `temporary directory with a file`
- **unit** — The mappings from errors to codes on both sides.
  - Subjects: `the plan tree's and the daemon's classifyShaperError each map ShaperInvalidInputError, ShaperNoPlanError, ScopeRefUnresolvedError, ScopeKindTargetMismatchError and ShaperAnswerInvalidError to their codes`, `one test iterates a single list of error classes (the five mapped today and the five new ones) through both functions and asserts the same code from each`, `the plan tree's classifyClassifierError returns the inner code of ClassifierValidationExhausted for both inner codes, and passes ScopeNotIndexedError and ShaperLlmUnavailableError to the context mapping (today: 'classifier-validation-exhausted' and 'internal-error')`, `the three new codes are members of both RunErrorCode and AnalyzeRpcErrorCode (a compile-time assignment in a source file, since tsc skips tests)`, `the existing table test's ClassifierValidationExhausted row (orchestrator.test.ts:72) rewritten with a real ValidationFailure, expecting its inner code`
- **integration** — The plan tree's branch for a request with a stated kind of source, with the classifier, context builder and planner stood in as orchestrator.test.ts already does.
  - Subjects: `with a prompt, the intent passed to the context builder has focused true and the prompt as focus; with an empty prompt it has focused false`, `a hinted kind of source that does not go with the scope fails the run at stage 'classify' with 'scope-ref-kind-target-mismatch' and writes a failed run record`, `a hinted request with a scope that does not resolve fails with 'scope-ref-unresolved'`, `a hinted request with a valid pairing reaches the context builder and the planner`
- **live** — The behaviour that was observed broken, against the real daemon and model, gated by INSRC_LIVE_TESTS.
  - Subjects: `the daemon's run-context request for an unfocused code request on this repository returns a bundle (the check of 2026-10-07 that failed at once)`, `the same for a file scope and for a symbol scope in the new form`, `an unfocused request with the model stopped fails with 'shaper-llm-unavailable', and a request whose scope does not resolve fails with 'scope-ref-unresolved' while the model is running`, `the real planning call for an unfocused code request on a module returns the recipe's lookups on that module's path, and for an unfocused docs request returns a single free-form lookup`
  - Fixtures: `a running daemon with this repository indexed`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: pipeline returns 'bundle' for an unfocused intent on a repo, a module and a workspace`, `unit: an unfocused intent that falls to the free-form lookup gets the stated broad-survey purpose`, `live: the run-context request for an unfocused code request returns a bundle`, `unit: the planning prompt has a recipe for an intent with no focus for each kind of source`, `live: the real planning call, given an unfocused code request on a module of this repository, returns a plan whose lookups are those of the recipe and name the module's path; this is the only test of what the real planner emits, and it is gated by INSRC_LIVE_TESTS` |
| `ac2` | `integration: with a prompt the hinted intent is focused with the prompt as focus; with an empty prompt it is unfocused`, `integration: a hinted request with a valid pairing reaches the context builder and the planner` |
| `ac3` | `unit: the table from cause to error, one case per member of PipelineCause, with ShaperLlmUnavailableError only for the two model-failed causes`, `unit: runShaper throws ShaperAnswerInvalidError with stage 'bundle validation' when the bundle fails validation`, `unit: both classifyShaperError functions agree over one list of error classes`, `unit: the plan tree's classifyClassifierError returns the inner code and passes context errors on`, `live: 'scope-ref-unresolved' with the model running, 'shaper-llm-unavailable' with it stopped`, `unit: the message of each error states its cause and none says retries were exhausted`, `unit: runShaper refuses a pairing the table does not allow with ScopeKindTargetMismatchError on a request that arrives with a ready-made intent` |
| `ac4` | `unit: pipeline returns 'bundle' for a file and a symbol scope with the resolved repo as lookup path`, `unit: resolveScope for a symbol (no '#', no entity, two entities) fails with ScopeRefUnresolvedError, never ShaperLlmUnavailableError`, `live: a file scope and a symbol scope return a bundle`, `unit: a file-scope request replaced by the free-form lookup still names the file` |

## 7. Migration

**State before:** The lookup pipeline returns nothing for an unfocused request and for four of the seven kinds of scope, and every way it returns nothing ends in one error that says the model is unavailable (src/analyze/context/driver.ts:1101, :1107-1110, :276-281). A scope's value is read directly in three places in the pipeline. The pairing table refuses pairings the plan tasks accept, is repeated in the classifier's prompt, and is not applied to a request started with a stated kind of source; the connection check is never supplied (src/analyze/classifier/validate.ts:47-53, :120-131). On the plan tree the validator's failure is recorded as 'classifier-validation-exhausted' and a failure of the classifier's context build as 'internal-error' (src/analyze/orchestrator/driver.ts:414-426).

**State after:** The pipeline returns a bundle, 'not-applicable', or a named cause; one table converts each cause to a typed error. An unfocused request and all seven kinds of scope are served. A scope is resolved once by resolveScope. The pairing table is corrected, stated once in code and mirrored in the prompt under a test, and applied on both classification branches with the connection check supplied. Three codes are added to both code lists; four existing codes are reused.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the three new codes to RunErrorCode and AnalyzeRpcErrorCode and the five new error classes beside the existing ones, with their cases in both classifyShaperError functions, and the path field on the planning call's and the answer-writing call's prompt-missing errors. Nothing raises them yet. — ↩ rollbackable
2. Add the scope module with resolveScope and ResolvedScope, with its unit tests. Nothing calls it yet. — ↩ rollbackable
3. Correct the pairing table, its comment and the matrix test; change the symbol case and the general existence check of the validator to the new symbol form; rewrite the classifier prompt's pairing list and symbol rule and add the test that compares the prompt with the table. — ↩ rollbackable
4. Change the pipeline's return type to the three-case outcome, give each existing null return its cause, add the table from cause to error in runShaper and delete the single 'model unavailable' throw. The gates stay in this step, each now returning its own cause, so behaviour changes only in the error reported. — ↩ rollbackable
5. Resolve the scope once at the head of runShaper for every mode and move every reader of the scope's value in the context builder to it: the cache freshness read, the tool loop's path at both of its call sites, the pipeline's lookup path and freshness read, the planning prompt's user turn (decompose and prepareDecompose, with the step tool's start phase resolving the scope it builds), the indexed check, and the free-form lookup, which gets the resolved scope through the lookup executor's runner context. Delete resolveRepoPath, inferRepoPath and inferScopePath with the test export, and rewrite the existing test of inferScopePath against resolveScope. Remove the gate on the kind of scope. — ↩ rollbackable
6. Add the section for an intent with no focus to the planning prompt, with the test that reads the prompt for it; then remove the gate on an unfocused intent, and change the free-form replacement's purpose for an intent with no focus from the classifier's reasoning text to a stated broad-survey purpose. — ↩ rollbackable
7. On the plan tree: carry the prompt as the focus on the branch with a stated kind of source, call the validator there, supply the connection check from both callers of the classifier and from the daemon's classify request, and change the classify stage's mapping to return the inner code and to pass other errors to the context mapping. — ↩ rollbackable
8. Run the unit and integration tests, then the live checks against the daemon; tell the IDE repository of the three new codes. — ↩ rollbackable

**Backward compat:** No request that works today stops working, with two exceptions that are corrections: a symbol scope given in a form other than '<absolute file path>#<name>' no longer resolves (no caller in this repository builds one), and a request started with a stated kind of source is now checked against the pairing table and can be refused where it used to run on. Callers that match on error codes see new ones: 'no-plan-for-request' is new; 'shaper-prompt-missing', 'shaper-schema-unrecoverable', 'invalid-input' and 'scope-ref-unresolved' appear where 'shaper-llm-unavailable' used to; and on the plan tree the validator's inner code appears where 'classifier-validation-exhausted' used to, and a context error where 'internal-error' used to. A caller that treated 'shaper-llm-unavailable' as 'retry later' will no longer retry these. A request started with a stated kind of source and a prompt is now planned as a focused request, which changes the lower bound on the number of plan tasks. No stored data changes shape; stored run records read as before.

## 8. Alternatives considered

### 8.1 a1: The pipeline returns a result that names why it did not proceed; the planning call plans for an unfocused request — **CHOSEN**

tryExplorationPipeline returns either a bundle or a typed 'did not proceed' value with a cause, runShaper turns that into one typed error per cause, and an unfocused request goes to the existing planning call, which already has a branch for it.

The pipeline's return type changes from 'result or null' to a two-case result: a bundle, or a value that carries a cause and the data for it. Every place that returns null today returns the second case with its own cause, and the bundle-validation fall-through does the same. runShaper has one place that converts a cause into a typed error, so the single 'model unavailable' throw is replaced by a table from cause to error class. The plan tree's and the daemon's mapping functions each gain one case per new error class.

The unfocused gate is removed: an unfocused intent is passed to the planning call, which already writes an 'unfocused, broad understanding' line for it. The branch with a target hint keeps the user's prompt on the intent as its focus when the prompt is not empty, so it is no longer always unfocused. A scope is resolved once, by one function, into a resolved scope (kind, repo path, path for lookups, entity for a symbol, connection for a connection); the pipeline's three direct readers of the value take that. The pairing table is corrected in place and both classification branches apply it.

### 8.2 a2: Typed errors thrown where each case arises

The pipeline keeps returning a bundle and throws a specific typed error at each place it returns null today; the planning call plans for an unfocused request.

tryExplorationPipeline no longer returns null for a run-mode request: each early return becomes a throw of an error class for that cause, and the errors already thrown inside it (a missing prompt, a failed model call) are let through with their own class where today they are caught and turned into null. The single throw in runShaper is deleted. The mapping functions gain a case per class.

Unfocused requests, the target-hint branch, scope resolution and the pairing table are handled as in a1.

**Rejected because:** Meets the criteria at lower cost, but leaves the list of causes implicit in the throw sites, which is the condition that produced the single wrong error in the first place.

### 8.3 a3: A fixed survey plan for an unfocused request, with the result type of a1

As a1 for causes and scope resolution, but an unfocused request does not go to the planning call: the pipeline builds a fixed survey plan for the kind of source from the lookups that exist.

The pipeline's result and the cause table are as in a1. For an unfocused intent the pipeline does not call the planning model. It builds a plan from a fixed list per kind of source: for code, the module profile of the named area with its conventions and import graph; for documents, the document inventory; for data, the connections and their tables; for infrastructure, the manifests. If the list for a kind of source is empty the pipeline reports 'no-plan-for-request'.

The target-hint branch, scope resolution and the pairing table are handled as in a1.

**Rejected because:** Gives a repeatable plan for a broad request, but adds a second way of planning that must be kept in step with the lookups and overlaps what Story s5 owns, and the generic kind of source still needs the free-form lookup.

## 9. References

- **[[c1]]** `step-output` `s1 context, bundle 1 (a direct read of source on 2026-10-07, not an analyzer run): The lookup pipeline's entry and every place it returns nothing. Files: src/analyze/context/driver.ts, src/analyze/context/invariants.ts`
- **[[c2]]** `step-output` `s1 context, bundle 2 (a direct read of source on 2026-10-07, not an analyzer run): What the planning call does with an unfocused intent. Files: src/analyze/context/decomposer.ts, src/shared/analyze-types.ts`
- **[[c3]]** `step-output` `s1 context, bundle 3 (a direct read of source on 2026-10-07, not an analyzer run): The two classification branches of the plan tree and how their failures are mapped. Files: src/analyze/orchestrator/driver.ts, src/analyze/orchestrator/types.ts`
- **[[c4]]** `step-output` `s1 context, bundle 4 (a direct read of source on 2026-10-07, not an analyzer run): The scope validator: the pairing table, the resolution check and the connection check. Files: src/analyze/classifier/validate.ts, src/prompts/analyze/classify.system.md, src/analyze/classifier/__tests__/validate.test.ts, src/daemon/db/config.ts`
- **[[c5]]** `step-output` `s1 context, bundle 5 (a direct read of source on 2026-10-07, not an analyzer run): The daemon's error codes and mappings for context and classify requests. Files: src/daemon/analyze-rpc.ts`
- **[[c6]]** `step-output` `s1 context, bundle 6 (a direct read of source on 2026-10-07, not an analyzer run): Existing tests the Story's tests extend. Files: src/analyze/context/__tests__/driver-unit.test.ts, src/analyze/context/__tests__/freeform-fallback.test.ts, src/analyze/classifier/__tests__/validate.test.ts, src/analyze/orchestrator/__tests__/orchestrator.test.ts`
- **[[c7]]** `prior-artifact` `HLD-b9d5c5c40df5a574, approved 2026-10-07 with a recorded override: Story s6 boundary, contract sc6, Phase A`
- **[[c8]]** `prior-artifact` `DEF-b9d5c5c40df5a574 Story s6: acceptance criteria ac1 to ac4`
- **[[c9]]** `stakeholder` `user, 2026-10-07: Story s6 serves all seven kinds of scope, including a data connection` — "B"
- **[[c10]]** `step-output` `s8 checklist: no item missed; cd1, dm1, ep3, alt2, sbdry3 and sbdry4 partial. Three points differ in detail from the HLD's wording: an unfocused request goes to the existing planning call, not a separate survey plan; a bundle that fails validation is reported as the existing 'shaper-schema-unrecoverable' until Story s1 raises 'answer-step-failed'; 'no-plan-for-request' is raised only by a check behind the free-form replacement.`
- **[[c11]]** `prior-artifact` `First daemon review of this LLD, 2026-10-07: block, 4 MED did not hold. All four are applied in this revision: the free-form purpose is the classifier's reasoning text today, not undefined; prepareDecompose and the step tool's start phase are change sites; resolveRepoPath, inferRepoPath and inferScopePath have callers in every mode; the answer-writing step's catch-all needed its own cause.`
- **[[c12]]** `prior-artifact` `Second daemon review of this LLD, 2026-10-07: block, 3 MED did not hold. All three are applied in this revision: a new error class for an invalid answer or bundle, because the existing class's message says retries were exhausted; the free-form lookup given the request's scope through the runner context; the existing table-test row for ClassifierValidationExhausted.`
- **[[c13]]** `prior-artifact` `Third daemon review of this LLD, 2026-10-07: block, 1 HIGH and 4 MED did not hold. All five are applied in this revision: lookupPath stays the scope's own directory for a repo, a module, a manifest directory and a workspace; the step tool's phases resolve the scope again from the token's intent; section 5 and the tests name ShaperAnswerInvalidError; a symbol in a repo that is not indexed fails as not indexed.`
- **[[c14]]** `prior-artifact` `Fourth daemon review of this LLD, 2026-10-07: block, 4 MED did not hold. All four are applied in this revision: the pairing check at the head of runShaper so every route is covered; a reader for a repo's entities in ScopeDeps; the stated exception for a symbol scope in the indexed-check invariant; the free-form replacement as a fourth stand-in for the 'empty-plan' test.`
- **[[c15]]** `prior-artifact` `Fifth daemon review of this LLD, 2026-10-07: block, 3 MED did not hold. All three are applied in this revision: the planning prompt gains a stated recipe for an intent with no focus; the step tool makes the pairing test in its own start phase, since it never calls runShaper; a symbol outside any registered repo fails as not indexed.`
- **[[c16]]** `code` `src/prompts/analyze/decompose.system.md` — "1. `concept.resolve(query="<intent.focus>")` — get the ranked module candidates. Purpose: "Resolve the user's target to a concrete module path.""

## 10. Open questions

- The HLD's code 'no-plan-for-request' has no case that occurs today: an empty plan, an uncovered answer type and an unparseable plan are all replaced by the free-form lookup (src/analyze/context/driver.ts:1136, :1171). This design raises it from a check that stands behind that replacement. Keep the code with that check, or drop it from the contract?
