<!-- insrc:artifact LLD-8315a11f29fd2812-s1 -->

# LLD: E202610198315a11f:S001

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**HLD base run:** `wf-1792389266411-gvxl8y`
**HLD effective hash:** `044189484c77...`

This Story builds the review pipeline every review runs through: a new module holding the delivered review job grown into a generic prepare, review and gather engine, one job per review unit (each code-review dimension, or one design review). It routes the code review and both kinds of design review through it with single-chunk adapters that send exactly today's prompts, now wrapped so each answer echoes its call's identifier, and makes the pipeline the only place a review call is retried. It adds the 128K-token chunk setting, recognises size refusals in reviewer sessions, and gives Ollama a read-only reviewer session so a high-end local model can run every review kind.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. HLD context

> See **HLD-8315a11f29fd2812** § 2. Framework summary

**Rollout phase:** Phase A — the pipeline, single chunk everywhere
**Owns:** `sc1` (ReviewMaterial), `sc2` (ReviewAdapter), `sc3` (ReviewChunk and ChunkPlan), `sc4` (CallEnvelope), `sc5` (ReviewPipelineJob), `sc6` (Chunk limit setting)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The code-review adapter's material: changed-symbol atoms, call relations from the grounding's callers and callees among changed symbols, file and module relations, and how neighbour summaries are written for a changed symbol held in another chunk. Tests: S002/ac1 related changed symbols land in the same chunk before file and module grouping; ac2 a call relation cut between chunks yields a neighbour summary on both sides; ac3 every changed symbol appears whole in some chunk and one over the limit is named, never cut.
- `s3`: The code-review adapter's gather: per-dimension chunk prompts, obligation keys and their adjudication over all chunks' evidence, the cross-chunk relationship check, the cross-chunk duplicate comparison for quality, and the fold into today's DimensionResult and verdict. It also owns the acceptance smoke: Epic c2ba6fa6 Story s1's code review runs on the installed daemon, completes and records a verdict, with the chunk plan and calls per stage written to the smoke record. Tests: S003/ac1 a divided review and the same material reviewed in one call under a raised limit give the same obligation verdicts on fixtures that fit both ways; ac2 a mismatch between related functions in different chunks is reported; ac3 a cross-chunk duplicate is reported; ac4 the installed-daemon smoke above.
- `s4`: The design-review adapter: document sections as atoms, cross-reference relations, section summaries for neighbours, chunk prompts for the template checklist and the premise pipeline, and the gather of checklist answers or premise verdicts into today's ReviewReport and verdict rules. Tests: S004/ac1 every section appears whole in some chunk with the sections it references; ac2 a cross-chunk reference yields a section summary; ac3 a divided HLD/LLD review and a divided DEF/plan review each give one ReviewReport under today's verdict rules, and a premise whose call fails twice is still recorded as not judged. Its controller stage plan keeps today's single batched verify prompt under the limit; over the limit it batches premises per chunk.
- `s5`: The two controller steps' use of the job, and the MCP boundary that admits it: the new answers phase in the insrc_review_step and insrc_code_review_step input schemas in src/mcp/server.ts, their registered schema contracts and tool descriptions, with schema and surface tests (src/mcp/__tests__/schema-registry.test.ts); keeping it in step state, frame sizing, answer validation by call identifier, and offering a review under the limit today's prompts as identified calls in the same frame shape. Compatibility: the controller step states gain an optional pipeline field; a state without it (saved before the change) is resumed on today's path; both stores are memory-only, so, as today, a state does not survive a daemon restart. Tests: S005/ac1 a controller review over the limit is handed the daemon's chunks one frame at a time and records the same kind of result; ac2 a missing or wrong identifier in an answer is rejected and the call offered again under a new UUID; ac3 a new controller review under the limit is offered today's prompts, each as an identified call, and gives today's result; a pre-change state resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames, each path tested. The answers phase also accepts a failure outcome per call (size refusal with the reported limit, stall, transient error), mapped to the driver's failure handling and admitted by both MCP input schemas; tested: a controller-reported size refusal re-divides the call, a reported stall or transient error re-issues it once under a new identifier. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `createReviewJob`

```typescript
createReviewJob(adapter: ReviewAdapter<unknown>, path: 'daemon' | 'controller', snapshot: ReviewMaterialSnapshot, limitChars: number): ReviewPipelineJob
```

**Parameters:**
- `adapter: ReviewAdapter<unknown>` — The review unit's adapter (sc2): its material, per-path stages and gather rules.
- `path: 'daemon' | 'controller'` — Selects the adapter's stage plan for this path.
- `snapshot: ReviewMaterialSnapshot` — The immutable material taken at prepare; never re-queried afterwards.
- `limitChars: number` — review.chunkTokens x REVIEW_CHARS_PER_TOKEN.

**Returns:** `ReviewPipelineJob` — Prepare's result: the chunk plan (single when the material fits the limit) and the first stage's pending calls, each enveloped with a fresh callId.

**Errors:**
- `AtomTooLargeError` when One atom alone exceeds the limit; names it. Never cut.

**Preconditions:**
- The snapshot was taken by the adapter's own prepare step from the review's subject.

**Postconditions:**
- Under the limit, the first stage's calls carry exactly today's messages and schema inside the envelope.
- Every pending call has a callId no call of this job carried before.
- Grouping order over the limit: prepare first unites atoms joined by 'calls' relations, then 'same-file', then 'same-module', then 'references'. It packs whole groups into chunks that fit, and a group too large for one chunk is split along the next-weaker relation kind before single atoms are placed. Relation direction does not matter for grouping. Atoms keep the material's order within a chunk.
- Divided with no atoms: when the single call (the adapter's singleCalls rendered with all its context) is over the limit, the job is divided even if the material has zero atoms, for example a diff review whose coverage has no symbols but a large test record. Prepare plans no chunk calls. Every obligation goes straight to gather and is judged by obligationCall on its own context atoms, packed by the s1 packer so that every call fits. An obligation context atom that alone does not fit raises AtomTooLargeError naming it.
- single: true is set only when the rendered single call fits the limit; an empty material does not by itself mean single.

### 2.2 `runReviewJob`

```typescript
runReviewJob(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, provider: LLMProvider, opts: { readonly signal?: AbortSignal | undefined }): Promise<unknown>
```

**Parameters:**
- `job: ReviewPipelineJob` — The prepared job.
- `adapter: ReviewAdapter<unknown>` — Rebuilt from the subject plus the job's snapshot.
- `provider: LLMProvider` — Called with internalRetry: false for every call.
- `opts.signal: AbortSignal` _(optional)_ — Cancels the review at once.

**Returns:** `unknown (the adapter's result R: DimensionResult or ReviewReport)` — The serial daemon driver: issues pending calls one at a time, runs deterministic stages, validates each enveloped answer, re-issues a failed call once under a new callId, applies each stage's failure policy, gathers, and returns the adapter's finished result.

**Errors:**
- `AbortError` when The signal fired. It is checked before every call and after every answer, and it is passed into the call in flight, so the provider ends that call at once (the CLI's process group is killed; the Ollama request is aborted). Nothing is retried or recorded.
- `Error` when A call in a 'fail-review' stage failed both attempts; the review fails and records nothing, as today.
- `AtomTooLargeError` when Re-division after a size refusal reached one atom that does not fit.

**Preconditions:**
- Calls are made serially (k6).

**Postconditions:**
- No prompt hash is issued twice.
- A 'record-not-judged' stage keeps every other judgement and records the failed one as not judged (MED); a 'record-observation' stage records a LOW observation.
- Cancellation ends the review at once, including a call in flight: the provider throws AbortError within moments of the signal, never after the call's own time limit.

### 2.3 `ReviewPipelineDriver.nextCalls / applyAnswer / applyFailure / result`

```typescript
nextCalls(job, adapter): readonly ReviewCall[]; applyAnswer(job, adapter, answer: EnvelopedAnswer): ReviewPipelineJob; applyFailure(job, adapter, callId, cause, maxChars?): ReviewPipelineJob; result<R>(job): R
```

**Parameters:**
- `answer: EnvelopedAnswer` — { callId, answer }; rejected when callId is not a pending call's.
- `cause: 'size-refusal' | 'transient' | 'stall' | 'identifier-mismatch' | 'invalid-answer'` — Why the call did not complete.
- `maxChars: number` _(optional)_ — The size a refusal reported, when it did.

**Returns:** `ReviewPipelineJob / readonly ReviewCall[] / R` — The pure step functions both runReviewJob and the controller step (s5) drive.

**Errors:**
- `Error` when applyAnswer for an unknown callId, or applyAnswer/applyFailure on a finished job.

**Preconditions:**
- The adapter is the one the job was prepared with, rebuilt from the same subject and snapshot.

**Postconditions:**
- A size refusal re-plans the call's carried atoms and notes within the reported (else halved) budget; transient, stall, identifier-mismatch and invalid-answer re-issue once under a new callId.

### 2.4 `runCodeReview`

```typescript
runCodeReview(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts, deps: CodeReviewRunnerDeps = DEFAULT_DEPS): Promise<CodeReviewOutcome>
```

**Parameters:**
- `subject: CodeReviewSubject` — Unchanged.
- `provider: LLMProvider` — Unchanged.
- `opts: RunCodeReviewOpts` — Unchanged.
- `deps: CodeReviewRunnerDeps` _(optional)_ — Unchanged.

**Returns:** `Promise<CodeReviewOutcome>` — Unchanged shape; each expected dimension is now one pipeline job (single-chunk adapter wrapping that dimension's existing prompt builder), run in today's order; ux and deterministic diagram handlers are deterministic stages; adherence makes no call without an approved LLD or plan.

**Errors:**
- `CodeReviewOutcome { ok: false, error }` when A model-judged dimension's call fails both pipeline attempts. As today, runCodeReview returns { ok: false, error } and records nothing. Only the number of attempts changes, and it implements the HLD's retry policy (one re-issue under a new UUID, two attempts in all per call). That replaces today's nested retries, where the dimension's withStructuredRetry (3 attempts) wraps CliProvider.withTransientRetry (3 attempts).

**Preconditions:**
- Signature unchanged.

**Postconditions:**
- Under the limit the findings and verdict equal today's for the same answers.

### 2.5 `runReview`

```typescript
runReview(artifactMarkdown: string, opts: RunReviewOpts): Promise<ReviewReport>
```

**Parameters:**
- `artifactMarkdown: string` — Unchanged.
- `opts: RunReviewOpts` — Unchanged.

**Returns:** `Promise<ReviewReport>` — Unchanged shape; DEF/plan run as one premise job (extract model stage, probe deterministic stage, verify model stage with record-not-judged), HLD/LLD as one template job (one reviewer-session stage).

**Errors:**
- `as today` when Extraction failing, or the reviewer session failing both attempts, fails the review.

**Preconditions:**
- Signature unchanged.

**Postconditions:**
- Under the limit the calls and their order equal today's.

### 2.6 `runTemplateReview`

```typescript
runTemplateReview(artifactMarkdown: string, opts: RunReviewOpts): Promise<ReviewReport>
```

**Parameters:**
- `artifactMarkdown: string` — Unchanged.
- `opts: RunReviewOpts` — Unchanged; deadlineMs flows into the reviewer-session execution mode.

**Returns:** `Promise<ReviewReport>` — Becomes the template adapter's single-chunk path. The checklist check (validateTemplateAnswer) is the stage's answer validator: an answer that breaks the checklist is an invalid answer, and the pipeline re-issues it once under a new callId with today's correction text as the correction note. That is two attempts in all, and there is no retry inside the stage.

**Errors:**
- `as today` when Time limit passed or the answer fails the checklist twice.

**Preconditions:**
- The provider has runReviewSession (claude, codex, or Ollama).

**Postconditions:**
- The session's answer is enveloped with a callId.
- A cancelled review ends the reviewer session at once; the note that a session cannot be interrupted mid-run no longer applies.
- Exactly one retry owner: the pipeline. The stage itself never re-asks.

### 2.7 `verifyClaim`

```typescript
verifyClaim(claim: Claim, evidence: Evidence, provider: LLMProvider, signal?: AbortSignal): Promise<Finding>
```

**Parameters:**
- `claim: Claim` — Unchanged.

**Returns:** `Promise<Finding>` — Its prompt builder (buildVerifyPrompt) becomes the verify stage's per-premise call, with today's prompt, order and VERIFY_CALL_TIMEOUT_MS (180,000 ms) as the call's execution timeoutMs. Running the call with the repository as its cwd is a deliberate ADDITION: today verifyClaim passes no cwd (src/workflow/review/verify.ts:229). The HLD records it as an additive change, so that structured review calls all run in the repository.

**Postconditions:**
- The 3-minute per-call limit is kept.

### 2.8 `extractClaims`

```typescript
extractClaims(artifactMarkdown: string, stage: string, provider: LLMProvider, signal?: AbortSignal): Promise<Claim[]>
```

**Parameters:**
- `artifactMarkdown: string` — Unchanged.

**Returns:** `Promise<Claim[]>` — Its prompt becomes the extract stage's single call; the extracted claims and probe evidence are stored in the snapshot once gathered.

### 2.9 `CliProvider.completeStructured`

```typescript
completeStructured<T>(messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T>
```

**Parameters:**
- `opts.internalRetry: boolean` _(optional)_ — false: withTransientRetry makes exactly one attempt.
- `opts.signal: AbortSignal` _(optional)_ — Existing optional field, now honoured: aborting kills the CLI's process group and throws AbortError.

**Returns:** `Promise<T>` — Unchanged when internalRetry is absent.

**Errors:**
- `InputTooLargeError` when As today.
- `AbortError` when opts.signal fired while the CLI ran; the process group is killed first. Never retried.

**Postconditions:**
- internalRetry: false makes exactly one CLI run.
- An abort kills the running CLI's process group and throws AbortError at once.

### 2.10 `CliProvider.runReviewSession`

```typescript
runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T>
```

**Parameters:**
- `opts.internalRetry: boolean` _(optional)_ — false: no transient or stall retry inside the call.
- `opts.signal: AbortSignal` _(optional)_ — Cancels the session: aborting kills the CLI's process group and throws AbortError at once.

**Returns:** `Promise<T>` — Unchanged.

**Errors:**
- `InputTooLargeError` when NEW for claude only: a size refusal in the claude session's is_error envelope (src/agent/providers/cli-provider.ts:448), classified with sizeRefusalOr as completeStructured does. The codex session is already classified by runCodex (src/agent/providers/cli-provider.ts:566); that behaviour is kept and regression-tested.
- `AbortError` when opts.signal fired while the session ran; the process group is killed first. Never retried.

### 2.11 `CliProvider.withTransientRetry`

```typescript
withTransientRetry<T>(label: string, op: () => Promise<T>, attempts?: number): Promise<T>
```

**Parameters:**
- `attempts: number` _(optional)_ — 1 when the caller set internalRetry: false; default 3.

**Returns:** `Promise<T>` — Unchanged by default.

### 2.12 `OllamaProvider.completeStructured`

```typescript
completeStructured<T>(messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T>
```

**Parameters:**
- `opts.internalRetry: boolean` _(optional)_ — false: withStructuredRetry with maxAttempts 1.
- `opts.signal: AbortSignal` _(optional)_ — Existing optional field, now honoured: the HTTP request is aborted through a per-call fetch that carries the signal over the shared undici agent.

**Returns:** `Promise<T>` — Unchanged by default.

**Errors:**
- `AbortError` when opts.signal fired; the request is aborted. Never retried.

### 2.13 `LLMProvider.runReviewSession`

```typescript
runReviewSession?<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T>
```

**Parameters:**
- `opts: ReviewSessionOpts` — cwd, deadlineMs, internalRetry, signal.

**Returns:** `Promise<T>` — Optional on the interface; CliProvider has it today and OllamaProvider gains it over a generic read-only tool loop extracted from runShaperToolLoop.

**Errors:**
- `ReviewSessionTimeoutError` when Deadline passed.
- `AbortError` when opts.signal fired; the CLI process group is killed, or the Ollama tool loop's in-flight complete or completeStructured request is aborted and no further turn starts.

**Postconditions:**
- The Ollama session reads the repository with read-only tools only and ends with a structured answer checked against the schema.
- The Ollama session never executes a tool outside its read-only allowlist; an unadvertised call is refused at dispatch.

### 2.14 `runShaperToolLoop`

```typescript
runShaperToolLoop(args: RunShaperToolLoopArgs): Promise<ShaperToolLoopResult>
```

**Parameters:**
- `args: RunShaperToolLoopArgs` — Unchanged.

**Returns:** `Promise<ShaperToolLoopResult>` — Unchanged behaviour; its tool loop (runToolLoop) and final structured emit are moved behind a generic read-only loop taking caller-supplied messages, answer schema, deadline, signal and retry policy, which both runShaperToolLoop and the Ollama reviewer session call. The generic loop passes the caller's signal to every tool-selection turn (provider.complete) and to the final structured emit, and checks it before each turn and each tool run, so a cancelled Ollama reviewer session stops within the turn in flight. The analyzer's wrapper passes no signal, so its behaviour is unchanged. The extracted loop and final emit have TWO production callers in src/analyze/context/driver.ts, and both keep their prompts, tracing, retries and errors: runShaperToolLoop, and runShaper's legacy tail, which calls runToolLoop and runFinalStructuredEmit directly (src/analyze/context/driver.ts:539, src/analyze/context/driver.ts:547). Read-only is enforced at EXECUTION, not only by what is advertised. Today runToolLoop dispatches any returned tool name through executeTool, which resolves the global registry, including file_write. The generic loop therefore checks every returned call's name (after alias resolution) against the caller's allowlist before dispatch. A call outside it is never executed: the loop answers the model with a tool error saying the tool is not available, and logs it. For the reviewer session the allowlist is the read-only tool set.

**Postconditions:**
- Analyzer tests for runShaperToolLoop pass unchanged.
- runShaper's legacy tail behaves unchanged, and its existing tests pass unchanged.
- A model-returned call to a tool outside the allowlist (for example file_write or Write) never reaches executeTool, on both callers.

### 2.15 `packIntoBatches`

```typescript
packIntoBatches<I>(items: readonly I[], sizeOf: (batch: readonly I[]) => number, budget: number, describe?: (item: I) => string): I[][]
```

**Parameters:**
- `items: readonly I[]` — Unchanged.

**Returns:** `I[][]` — Unchanged; moves under the pipeline module.

**Errors:**
- `AtomTooLargeError` when As delivered.

### 2.16 `runInProcessGroup`

```typescript
runInProcessGroup(command: string, args: readonly string[], opts: ProcessGroupOpts): Promise<ProcessGroupResult>
```

**Parameters:**
- `opts.signal: AbortSignal` _(optional)_ — NEW optional field: when it fires, the group is killed as on timeout and the result says aborted.

**Returns:** `Promise<ProcessGroupResult>` — Unchanged, plus an aborted flag. runSubprocess forwards the signal and throws AbortError when aborted is set.

**Postconditions:**
- Absent signal: unchanged behaviour.
- An already-aborted signal spawns nothing.

### 2.17 `ReviewPipelineDriver.runStage`

```typescript
runStage(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, opts: { readonly signal?: AbortSignal | undefined }): Promise<ReviewPipelineJob>
```

**Parameters:**
- `job: ReviewPipelineJob` — A job whose current stage is deterministic (nextCalls returns no calls for it).
- `adapter: ReviewAdapter<unknown>` — The adapter rebuilt from the subject and the job's snapshot.
- `opts.signal: AbortSignal` _(optional)_ — Cancels the stage.

**Returns:** `Promise<ReviewPipelineJob>` — The job with the stage's output committed to outputs and the job advanced to the next stage. It is the only async step function. runReviewJob calls it on the daemon path; the controller step (s5) calls it on the daemon side between frames, so the controller never runs a deterministic stage.

**Errors:**
- `Error` when The current stage is a model stage, or the job is finished.
- `AbortError` when The signal fired.

**Preconditions:**
- Every earlier stage's output is committed.

**Postconditions:**
- Snapshot completion: the material snapshot is written in two kinds of step and never changes after. At prepare it takes the grounding, ux fileFacts and document text. For the premise review, the moment the extract stage's answer is applied its claims are written to snapshot.claims, and the moment the probe stage commits its evidence is written to snapshot.evidence. Each is written once, and later stages, re-planning and resumed turns read only those fields.
- A deterministic stage that throws applies its onCallFailure policy (record-observation for a diagram handler; fail-review otherwise).

### 2.18 `OllamaProvider.complete`

```typescript
complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse>
```

**Parameters:**
- `opts.signal: AbortSignal` _(optional)_ — NEW optional field on CompletionOpts: the chat request (and its stream) is aborted through the same per-call fetch completeStructured uses.

**Returns:** `Promise<LLMResponse>` — Unchanged.

**Errors:**
- `AbortError` when opts.signal fired during the request or its stream. Never retried.

**Postconditions:**
- Absent signal: unchanged behaviour.

### 2.19 `AdapterStage.validate`

```typescript
validate?(answer: unknown, call: ReviewCall): readonly string[]
```

**Parameters:**
- `answer: unknown` — The envelope's inner answer, already checked against the stage schema.
- `call: ReviewCall` — The call the answer came back for: its stage, role and carries (chunkId, atomIds, noteIds, key), so a validator can check the answer against exactly the material that call carried. Passed from the job on every turn, so it survives the adapter being rebuilt.

**Returns:** `readonly string[]` — Semantic problems (empty: valid). A non-empty result is the 'invalid-answer' cause, and the reasons become the re-issued call's correction note.

**Preconditions:**
- Optional member of sc2's AdapterStage, owned by s1; absent means schema validation only.

**Postconditions:**
- The template stage supplies validateTemplateAnswer here.

### 2.20 `ExecutionMode reviewer-session deadline`

```typescript
{ mode: 'reviewer-session'; cwd: string; deadlineMs: number; tools: 'read-only' } with ReviewPipelineJob.deadlineAt: number
```

**Parameters:**
- `deadlineAt: number` — Absolute expiry (epoch ms), set once at prepare as the start time plus today's limit (opts.deadlineMs, else reviewDeadlineMs, capped at HARD_REVIEW_DEADLINE_MS).

**Returns:** `number` — Each session call, the re-issue included, is sent with deadlineMs = deadlineAt - now. A re-issue never restarts the clock.

**Errors:**
- `ReviewSessionTimeoutError` when deadlineAt has passed: no further call is issued, and the review fails with today's time-limit message, never retried.

**Postconditions:**
- The whole template review, retries included, keeps today's single limit.

### 2.21 `ReviewAdapter.neighbourSummary`

```typescript
neighbourSummary?(atom: ReviewAtom, material: ReviewMaterial): string
```

**Parameters:**
- `atom: ReviewAtom` — An atom related to an atom in the chunk being planned, held in another chunk.
- `material: ReviewMaterial` — The adapter's material, so the writer can name the atom's related atoms.

**Returns:** `string` — The text prepare puts in NeighbourSummary.summary (sc3). Prepare sets atomId, label and heldInChunk itself. Optional member of sc2's ReviewAdapter, owned by s1. When it is absent, prepare uses the atom's label as the summary. s2 supplies it for code review and s4 for design review.

**Preconditions:**
- Must be deterministic and make no model call: prepare and every re-plan call it, and the same atom must give the same text.

**Postconditions:**
- For every relation cut by the chunk plan, each side's chunk carries one NeighbourSummary of the other side's atom. One per related atom per chunk, never duplicated.

### 2.22 `GatherPlan.relationCall`

```typescript
relationCall?: ((pair: readonly [ReviewAtom, ReviewAtom]) => readonly ChunkPrompt[]) | undefined
```

**Parameters:**
- `pair: readonly [ReviewAtom, ReviewAtom]` — The two ends of one relation in ChunkPlan.crossRelations.

**Returns:** `readonly ChunkPrompt[]` — One or more calls that together judge the relation, for example both full atoms in one call, or one call in each direction when they do not fit together. A refinement of sc2's sketch, which returned a single ChunkPrompt; this Story owns sc2. The driver issues them serially, counts each under pipelineCalls.relation, and treats the relation as judged when all of them are answered.

**Preconditions:**
- Every returned call must fit limitChars; prepare measures each one like any other call.

**Postconditions:**
- Each relation in crossRelations is offered to relationCall exactly once per job.

## 3. Data model changes

### 3.1 `config review.chunkTokens` — new

Catalog entry { path: 'review.chunkTokens', type: 'number', default: 128000 }; limitChars = value x REVIEW_CHARS_PER_TOKEN (3) = 384,000 by default, the same for every provider.

**Call sites:**
- `src/config/config-catalog.ts:130`

### 3.2 `StructuredCompletionOpts / ReviewSessionOpts` — field-add

Optional internalRetry?: boolean; ReviewSessionOpts also gains optional signal. Absent means today's behaviour. The existing optional StructuredCompletionOpts.signal, previously not consumed by CliProvider or OllamaProvider, is now honoured by both. CompletionOpts (used by the tool loop's turns) gains an optional signal?: AbortSignal, honoured by OllamaProvider.complete.

**Call sites:**
- `src/agent/providers/cli-provider.ts:277`
- `src/agent/providers/cli-provider.ts:420`
- `src/agent/providers/ollama.ts:537`

### 3.3 `LLMProvider` — field-add

Optional runReviewSession method (CliProvider already implements it; OllamaProvider gains it).

**Call sites:**
- `src/workflow/review/template-review.ts:50`

### 3.4 `ReviewPipelineJob (from ReviewJob)` — new

The delivered ReviewJob generalised to sc5: path, snapshot, plan, stage, outputs, pending calls with carries and attempt, answered, notes and provenance, notJudged, issuedHashes. Serialisable.

**Call sites:**
- `src/workflow/code-review/review-job.ts:210`
- `src/workflow/code-review/review-job.ts:321`

### 3.5 `DimensionResult / ReviewReport` — field-add

Optional pipelineCalls { chunk, obligation, relation, merge }, absent on single-chunk reviews; DimensionResult.parts keeps its shape and is no longer written.

**Call sites:**
- `src/workflow/code-review/runner.ts:171`
- `src/workflow/review/review.ts:108`

### 3.6 `ProcessGroupOpts / ProcessGroupResult` — field-add

Optional signal?: AbortSignal on ProcessGroupOpts; aborted?: boolean on ProcessGroupResult. Absent means today's behaviour.

**Call sites:**
- `src/agent/providers/cli-provider.ts:277`
- `src/agent/providers/cli-provider.ts:420`

## 4. Diagrams

- [Sequence diagram](docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Defines ReviewAtom, ReviewRelation, ReviewObligation, ReviewMaterial; the single-chunk adapters supply material with no relations (s2/s4 add them). |
| `sc2` | implements | Defines ReviewAdapter, AdapterStage, ExecutionMode, GatherPlan, EvidenceNote; ships the single-chunk adapters for every code-review dimension, the premise review and the template review, each with daemon and controller stage plans. |
| `sc3` | implements | Prepare emits ChunkPlan with single: true under the limit; the generic grouping and neighbour-summary slots exist for s2/s4 to fill. |
| `sc4` | implements | Envelope wrapping and checking, fresh callId per attempt, internalRetry: false on every provider call, runReviewSession optional on LLMProvider. |
| `sc5` | implements | ReviewPipelineJob and the pure driver step functions; runReviewJob is the serial daemon driver. |
| `sc6` | implements | review.chunkTokens catalog entry and REVIEW_CHARS_PER_TOKEN = 3. |

## 6. Error paths

**Error cases**

- **A model answer whose callId is missing or differs from the call's.** (recoverable)
  - Detection: applyAnswer compares the enveloped answer's callId with the pending call's before schema validation.
  - Response: The answer is discarded and the call re-issued once under a new callId; a second mismatch applies the stage's failure policy.
  - User impact: None when the re-issue succeeds; otherwise the stage's policy (fail, not judged, or observation).
- **An answer whose inner answer fails the adapter schema.** (recoverable)
  - Detection: validateAgainstSchema on the envelope's answer field after the callId check, then the stage's optional validate (for the template review, validateTemplateAnswer).
  - Response: Re-issued once under a new callId with the validation errors as the correction note; then the stage's failure policy.
  - User impact: As for a mismatch.
- **The provider refuses the prompt for its size (completeStructured, claude session envelope, codex session).** (recoverable)
  - Detection: InputTooLargeError: from completeStructured as today, from the codex session as today (runCodex's sizeRefusalOr), and newly from the claude session's is_error envelope.
  - Response: applyFailure re-plans the call's carried atoms within the reported maxChars less the retry reserve (else half the refused prompt); never resent. Under the limit with a single unsplittable atom: AtomTooLargeError naming it.
  - User impact: More calls; a review that fits nothing names the item.
- **A transient CLI error or a stalled codex session (CliStallError).** (recoverable)
  - Detection: The provider, called with internalRetry: false, throws on its first attempt.
  - Response: Re-issued once under a new callId; then the stage's failure policy.
  - User impact: None when the re-issue succeeds.
- **A verify call fails both attempts in a DEF/plan review.** (recoverable)
  - Detection: The verify stage's onCallFailure is 'record-not-judged'.
  - Response: That premise is recorded as a MED 'not judged' finding with its cause; every other premise is kept and the review is stamped (ISSUE-d4b2cd1c).
  - User impact: The review blocks under the default policy but is recorded.
- **A diagram handler throws.** (recoverable)
  - Detection: The diagram stage's onCallFailure is 'record-observation'.
  - Response: A LOW observation is recorded, as judgeDiagram does today.
  - User impact: As today.
- **Premise extraction, a code-review model dimension or the template session fails both attempts.** (terminal)
  - Detection: onCallFailure 'fail-review'.
  - Response: The review fails and records nothing; runCodeReview returns { ok: false, error } as today. Only the attempt count changes: two attempts in all (pipeline policy) instead of today's nested retries.
  - User impact: As today.
- **The review is cancelled.** (terminal)
  - Detection: The AbortSignal fires. It is checked before every call and after every answer, and it is passed into the call in flight: runInProcessGroup kills the CLI's process group, and the Ollama request's fetch is aborted.
  - Response: AbortError at once, even mid-call. The call is not retried, and nothing is recorded (no not-judged recording).
  - User impact: Better than today: a cancel no longer waits for the in-flight call's time limit.
- **The template review is configured on a provider with no runReviewSession.** (terminal)
  - Detection: The reviewer-session execution mode finds no runReviewSession on the provider.
  - Response: The review fails with today's message naming the provider requirement; with Ollama it now has one.
  - User impact: Only providers that are neither CLI nor Ollama.
- **The template review's time limit passes, possibly during a re-issue.** (terminal)
  - Detection: Before issuing, the driver compares now with job.deadlineAt; a session call already running is bounded by deadlineMs = deadlineAt - now.
  - Response: ReviewSessionTimeoutError; no further call; the review fails with today's message and records nothing.
  - User impact: As today: one limit for the whole review.
- **An Ollama reviewer session is cancelled mid tool loop.** (terminal)
  - Detection: The signal reaches the in-flight complete or completeStructured request and is checked before each turn and tool run.
  - Response: AbortError at once; no further turn; nothing recorded.
  - User impact: The cancel takes effect within the turn in flight.
- **An Ollama reviewer session's model returns a call to a tool it was not offered (for example file_write).** (recoverable)
  - Detection: The generic tool loop checks the call's name, after alias resolution, against the allowlist before dispatch.
  - Response: The call is not executed. The model gets a tool error ('not available in this session'), the refusal is logged, and the loop continues within its turn budget.
  - User impact: A review can never write to the repository.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A code review whose expected dimensions include ux and a component diagram, under the limit. | ux and the component handler run as deterministic stages reading the snapshot's fileFacts; no model call for them; findings equal today's. |
| A code review with neither an approved LLD nor an approved plan. | The adherence stage makes no call, as today. |
| A DEF review under the limit on the daemon. | One extract call, a deterministic probe, then one verify call per premise in claim order: today's prompts, order and 3-minute limit. The one difference from today is that each verify call now runs with the repository as cwd, which the HLD sets as an additive change. |
| A mock companion added or removed after prepare. | The ux stage's result is unchanged: it reads fileFacts from the snapshot. |
| review.chunkTokens set to a non-default value. | limitChars = value x 3 for every provider. |
| A provider called by code outside the pipeline (analyzer, workflows) with no internalRetry option. | Today's retries unchanged. |

**Invariants to preserve**

- runCodeReview, runReview and runTemplateReview keep their signatures and, under the limit, today's calls, order, findings and verdicts. [[c1]]
- The analyzer's runShaperToolLoop keeps its behaviour and tests after its tool loop is moved behind the generic loop. [[c1]]
- Provider calls made without internalRetry keep today's retry counts (withTransientRetry 3, withStructuredRetry callers' own counts). [[c1]]
- The controller frames and their prompts (emitJudgementsResult, the template and batched verify prompts) are not changed by this Story; s5 owns the controller path. [[c2]]
- models.local.charsPerToken and the other config keys are untouched; review.chunkTokens is additive. [[c3]]
- Provider calls made without a signal keep today's behaviour; the codex session's existing size-refusal classification is kept. [[c1]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test); providers faked as in src/workflow/code-review/__tests__/review-job.test.ts and src/agent/providers/__tests__/cli-review-session.test.ts (fake CLI binaries)`

**Test levels**

- **unit** — The pipeline core: prepare, envelope, identifiers, pipeline-owned retries, failure policies, refusal re-division, snapshot discipline, bounded gather.
  - Subjects: `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review under the limit is one chunk whose calls carry today's messages and schema inside the envelope'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a missing or wrong callId is rejected and the call re-issued once under a new callId; no prompt hash repeats'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a transient error, a stall or an invalid answer is re-issued once under a new callId, then the stage failure policy applies'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a size refusal re-divides exactly the atoms and notes the call carried and never resends the prompt'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'refusal re-planning reads only the job snapshot, so a changed source between turns cannot change the material'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits and provenance is kept'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review cancelled while a call is in flight ends at once with AbortError, no re-issue, nothing recorded'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'runStage commits a deterministic stage's output; extract claims and probe evidence enter the snapshot once and re-planning reads only them'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message'`, `src/workflow/review-pipeline/__tests__/pack-into-batches.test.ts and src/workflow/review-pipeline/__tests__/review-job-core.test.ts: the delivered ISSUE-aef82b03 tests, moved and rewritten to the new API`
  - Fixtures: `toy adapter with model and deterministic stages`, `scripted fake LLMProvider recording every prompt as sent`
- **integration** — Today's reviews through the pipeline give today's calls and results; providers honour internalRetry and recognise session size refusals; Ollama runs a reviewer session.
  - Subjects: `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'adherence makes no call without an approved LLD or plan'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review, a verify call failing twice records the premise as not judged'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit HLD review makes one reviewer-session call and gives today's report'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'a mock added or removed after prepare does not change the ux result'`, `src/agent/providers/__tests__/internal-retry.test.ts: 'internalRetry false makes exactly one attempt on CliProvider completeStructured, runReviewSession and OllamaProvider completeStructured; absent keeps today's counts'`, `src/agent/providers/__tests__/cli-review-session.test.ts: 'a size refusal in a claude session envelope is now an InputTooLargeError, and a codex session refusal still is'`, `src/agent/providers/__tests__/ollama-review-session.test.ts: 'an Ollama reviewer session reads the repo with read-only tools and returns a schema-checked answer within its deadline'`, `src/analyze/context/__tests__/driver-unit.test.ts (existing, still passes)`, `src/analyze/context/__tests__/run-shaper-wiring.test.ts (existing, still passes)`, `src/analyze/context/__tests__/shaper-errors.test.ts (existing, still passes)`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema'`, `src/agent/providers/__tests__/abort-in-flight.test.ts: 'aborting a CLI completeStructured or reviewer session in flight kills the process group and throws AbortError at once; an aborted Ollama request throws AbortError; neither is retried'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks'`, `src/agent/providers/__tests__/ollama-review-session.test.ts: 'cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn'`, `src/agent/providers/__tests__/ollama-review-session.test.ts: 'a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed'`
  - Fixtures: `recorded answers for one code review, one DEF review and one HLD review`, `fake claude and codex binaries`, `fake Ollama chat endpoint with a tool-call turn`
- **live** — The identifier envelope is accepted by both CLIs on the real review schemas, and a high-end Ollama model completes a review.
  - Subjects: `src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'claude and codex accept the envelope around every review answer schema and echo the callId'`, `src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline'`
  - Fixtures: `INSRC_LIVE_TESTS=1`, `a configured Ollama review model`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review, a verify call failing twice records the premise as not judged'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit HLD review makes one reviewer-session call and gives today's report'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review under the limit is one chunk whose calls carry today's messages and schema inside the envelope'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema'` |
| `ac2` | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a missing or wrong callId is rejected and the call re-issued once under a new callId; no prompt hash repeats'`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a transient error, a stall or an invalid answer is re-issued once under a new callId, then the stage failure policy applies'`, `src/agent/providers/__tests__/internal-retry.test.ts: 'internalRetry false makes exactly one attempt on CliProvider completeStructured, runReviewSession and OllamaProvider completeStructured; absent keeps today's counts'`, `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks'` |
| `ac3` | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens'` |
| `ac4` | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a size refusal re-divides exactly the atoms and notes the call carried and never resends the prompt'`, `src/agent/providers/__tests__/cli-review-session.test.ts: 'a size refusal in a claude session envelope is now an InputTooLargeError, and a codex session refusal still is'` |
| `ac5` | `src/agent/providers/__tests__/ollama-review-session.test.ts: 'an Ollama reviewer session reads the repo with read-only tools and returns a schema-checked answer within its deadline'`, `src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline'`, `src/agent/providers/__tests__/ollama-review-session.test.ts: 'a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed'` |

## 8. Migration

**State before:** Each review path builds and sends its own calls (s1 analyze bundles). runCodeReview (src/workflow/code-review/runner.ts:171) runs each dimension through its own withStructuredRetry wrapper (3 attempts, e.g. src/workflow/code-review/dimensions/adherence.ts:155). runReview (src/workflow/review/review.ts:108) runs extractClaims (src/workflow/review/extract.ts:166), then a probe, then verifyClaim (src/workflow/review/verify.ts:214) for each premise; it routes HLD/LLD to runTemplateReview (src/workflow/review/template-review.ts:50), which calls CliProvider.runReviewSession (src/agent/providers/cli-provider.ts:420). Providers retry inside the call: CliProvider.withTransientRetry (src/agent/providers/cli-provider.ts:251) makes 3 attempts and OllamaProvider.completeStructured (src/agent/providers/ollama.ts:537) uses withStructuredRetry (src/agent/providers/structured-output.ts:186). No call carries an identifier. The ISSUE-aef82b03 ReviewJob and packIntoBatches live under src/workflow/code-review (review-job.ts:210, :321; pack-into-batches.ts:34). There is no review.* config key. In reviewer sessions, a codex size refusal is already classified as InputTooLargeError (runCodex, src/agent/providers/cli-provider.ts:566), but a claude is_error envelope throws a plain Error (src/agent/providers/cli-provider.ts:448). OllamaProvider has no runReviewSession, and the analyzer's tool loop is private to src/analyze/context/driver.ts:863.

**State after:** One module, src/workflow/review-pipeline, holds ReviewPipelineJob, the pure driver step functions, the serial runReviewJob driver, packIntoBatches and the single-chunk adapters for every code-review dimension, the premise review and the template review. runCodeReview, runReview and runTemplateReview keep their signatures and result shapes, and route every model call through the pipeline. Each call is wrapped in the identifier envelope, sent with internalRetry: false, and re-issued at most once under a new callId by the pipeline. review.chunkTokens (default 128000; x3 = 384,000 chars) sets the limit. Size refusals from reviewer sessions surface as InputTooLargeError. OllamaProvider implements runReviewSession over a generic read-only tool loop that runShaperToolLoop also uses. Under the limit, every review makes today's calls in today's order and gives today's results.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional internalRetry field to StructuredCompletionOpts and ReviewSessionOpts, and signal to ReviewSessionOpts. Add an optional attempts parameter to CliProvider.withTransientRetry, set to 1 when internalRetry is false. Map internalRetry false to maxAttempts 1 in OllamaProvider.completeStructured. When the field is absent, behaviour is unchanged. — ↩ rollbackable
2. Classify size refusals in the claude session's is_error envelope as InputTooLargeError in CliProvider.runReviewSession, using the classifier completeStructured already uses. The codex session is already classified through runCodex; keep it and add a regression test. — ↩ rollbackable
3. Add an optional signal to ProcessGroupOpts (kill the group on abort, report aborted). Forward StructuredCompletionOpts.signal and ReviewSessionOpts.signal through runSubprocess in CliProvider, and through a per-call fetch in OllamaProvider, so that an abort ends the call in flight with AbortError, never retried. Absent signal: unchanged. — ↩ rollbackable
4. Extract the generic read-only tool loop and final structured emit from runShaperToolLoop behind caller-supplied messages, schema, deadline, signal and retry policy. Repoint both production callers at it unchanged: runShaperToolLoop and runShaper's legacy tail (src/analyze/context/driver.ts:539) (existing analyzer tests are the guard). Add the optional runReviewSession to the LLMProvider interface and implement it on OllamaProvider over that loop. — ↩ rollbackable
5. Add the review.chunkTokens catalog entry (number, default 128000) and REVIEW_CHARS_PER_TOKEN = 3. Old config files without the key get the default through the existing config reconcile fill step. — ↩ rollbackable
6. Create src/workflow/review-pipeline. Move packIntoBatches and grow the delivered ReviewJob into ReviewPipelineJob, with the envelope, the driver step functions, the failure policies, refusal re-division, the bounded gather, and the deadline. The only consumers of the old review-job.ts API (createReviewJob(strategy, budget), runReviewJob(strategy, provider), DimensionStrategy, Atom, jobResult) are its own tests, src/workflow/code-review/__tests__/review-job.test.ts and src/workflow/code-review/__tests__/pack-into-batches.test.ts. They move with the module and are rewritten to the new API. review-job.ts is deleted, with no compatibility wrappers. pack-into-batches.ts keeps a re-export at its old path, because packIntoBatches is unchanged. — ↩ rollbackable
7. Add the single-chunk adapters, each wrapping its existing prompt builder unchanged: the code-review dimensions, the premise review (extract, probe, verify with record-not-judged and the 3-minute limit) and the template review (one reviewer-session stage). Each adapter has daemon and controller stage plans. — ↩ rollbackable
8. Switch runCodeReview, runReview and runTemplateReview to build a pipeline job per review unit and drive it with runReviewJob. The per-dimension withStructuredRetry wrappers and verifyOrRecord's own retry go off the review path. Add the optional pipelineCalls field to DimensionResult and ReviewReport, absent on single-chunk reviews. Parity tests on recorded answers are the guard. — ↩ rollbackable
9. Rebuild and update the installed daemon (maintenance.update) so that the MCP and the IDE plugins use the pipeline. No stored review record is rewritten. — ↩ rollbackable

**Backward compat:** The public entry points runCodeReview, runReview, runTemplateReview, verifyClaim, extractClaims and runShaperToolLoop keep their signatures and result shapes. Every new field (internalRetry, signal, attempts, pipelineCalls, LLMProvider.runReviewSession) is optional, and when absent behaviour is unchanged for callers outside the review path, including the companion assess call and the analyzer. Stored code-review and design-review records keep their shape: pipelineCalls is absent on single-chunk reviews, and DimensionResult.parts stays readable but is no longer written. The old ReviewJob API (createReviewJob(strategy, budget), runReviewJob(strategy, provider)) is not preserved: its only consumers are its own tests, which move and are rewritten. packIntoBatches keeps a re-export at its old path. The IPC and MCP payloads do not change, so the VS Code and JetBrains plugins need no change. The controller frames are unchanged until s5. ProcessGroupOpts.signal and ProcessGroupResult.aborted are optional; callers that pass no signal see no change.

## 9. Alternatives considered

### 9.1 a1: One pipeline job per review unit, grown from the delivered ReviewJob — **CHOSEN**

A new src/workflow/review-pipeline module whose job (sc5) is the delivered ReviewJob generalised: one job per review unit (a code-review dimension, or a whole design review), driven by runReviewJob for the daemon and by nextCalls/applyAnswer/applyFailure for the controller.

The delivered review-job.ts, pack-into-batches.ts and their tests move under src/workflow/review-pipeline and are generalised in place: DimensionStrategy becomes the ReviewAdapter (sc2) with per-path stage plans; ReviewJob becomes ReviewPipelineJob (sc5) with the material snapshot, the per-call carries record and the issued-prompt hashes it already keeps; the existing whole/MAP planning becomes prepare's single-chunk and chunked planning (s1 ships the single-chunk path and the generic grouping; the code and document relations are s2's and s4's). The envelope (sc4) wraps every call's schema as { callId, answer } and the driver re-issues once under a new UUID. One job runs per review unit: each code-review dimension is its own job, as each dimension is its own call today; a design review is one job with its stages.

The entry points keep their signatures and call runReviewJob: runCodeReview drives one job per expected dimension in today's order; runReview drives the premise or template job. Providers gain internalRetry and runReviewSession becomes optional on LLMProvider; OllamaProvider implements it over a generic read-only tool loop extracted from runShaperToolLoop. review.chunkTokens joins the config catalog.

### 9.2 a2: One pipeline job per whole review

A single job holds every dimension (or every design-review stage) of one review, so prepare plans chunks once and every dimension reads the same chunks.

ReviewPipelineJob covers the whole review: prepare measures all of the review's material once and plans one chunk set; every dimension's stage then issues its calls against those chunks. The driver walks dimensions in today's order inside the one job. The rest (envelope, retries, providers, config, Ollama session) is as a1.

This needs one material and one chunk plan per review, so the code-review adapter's material must be the union of every dimension's material, with per-dimension views on it.

**Rejected because:** One shared chunk plan does not fit dimensions that read different material; sc5's per-dimension job shape is strained.

### 9.3 a3: Pipeline wrapper beside the delivered job

Leave review-job.ts where it is and add a thin pipeline layer that wraps it for code review and adds a separate small engine for design review.

The pipeline module adds the envelope, retries, snapshot and config, and calls the delivered ReviewJob for code-review dimensions while a second, simpler engine handles the template and premise reviews.

Nothing delivered moves.

**Rejected because:** Two engines repeat the shape the HLD rejected.

## 10. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: Current signatures and callers of the functions Story s1 reshapes.` — "runCodeReview at src/workflow/code-review/runner.ts:171; runReview at src/workflow/review/review.ts:108"
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: Where the review prompts are built and sent on each path (from the HLD context).` — "The controller code-review frame is emitJudgementsResult at src/daemon/steps/code-review-step/handler.ts:439"
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: Config sites for the chunk limit.` — "models.local.charsPerToken = 3 is declared in src/config/config-catalog.ts:130"
- **[[c4]]** `prior-artifact` `HLD-8315a11f29fd2812` — "A new shared module, the review pipeline (proposed at src/workflow/review-pipeline), owns the three stages for every review."
- **[[c5]]** `prior-artifact` `DEF-8315a11f29fd2812`
- **[[c6]]** `step-output` `s2 alternatives`
- **[[c7]]** `step-output` `s3 judge`
- **[[c8]]** `step-output` `s4 contract`
- **[[c9]]** `step-output` `s5 error paths`
- **[[c10]]** `step-output` `s6 test strategy`
- **[[c11]]** `step-output` `s7 migration`
- **[[c12]]** `step-output` `s8 checklist`
- **[[c13]]** `code` `src/analyze/context/__tests__/run-shaper-wiring.test.ts`
- **[[c14]]** `code` `src/workflow/code-review/review-job.ts:321`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-19T10:36:50.532Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
