<!-- insrc:artifact LLD-aef82b034d7209fa-S001 -->

# LLD: E20261018aef82b03:S001

## Summary

**Epic:** `review-every-changed-symbol-story-too`
**HLD base run:** `wf-1792343404222-54bw8h`
**HLD effective hash:** `951d004796fc...`

A code review completes for a Story of any size. When a dimension's material does not fit the reviewing model's input, the review runs as a bounded job: the changed symbols (and, if needed, the approved design and plan) are split into parts that each fit; each part's call reports its local findings plus small keyed notes; the notes are then combined by key (a requirement, a promised test, a module) in calls that each fit, merging further when one key's notes are too many; quality compares symbol descriptions batch against batch to find duplicates across parts. Every original symbol and clause is read whole by some call, every call fits, and the job keeps which symbols each derived note stands for; only one original item larger than the model's whole input stops the review, with that item named. A size refusal is split, never resent. The daemon runs the job itself; the controller's review walks the same job one frame at a time.

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

**Surface level:** internal

### 2.1 `packIntoBatches`

```typescript
packIntoBatches<I>(items: readonly I[], sizeOf: (batch: readonly I[]) => number, budget: number): I[][]
```

**Parameters:**
- `items: readonly I[]` — Indivisible items in order: symbols, clauses, notes or descriptions.
- `sizeOf: (batch: readonly I[]) => number` — The size in characters of the whole prompt built for a batch (fixed text included).
- `budget: number` — The largest prompt the call may carry.

**Returns:** `I[][]` — Greedy batches in item order; every item is in exactly one batch and every batch's prompt fits the budget.

**Errors:**
- `AtomTooLargeError` when One atom's prompt alone, with the call's instructions, exceeds the budget (a single symbol summary, approved clause, FR or test-record title larger than the model's whole input); names the atom and both sizes. This is the only size condition under which a review stops, and it is inherent: the atom cannot be read whole by any call.

**Preconditions:**
- Pure: no model call, no I/O.

**Postconditions:**
- Used by every stage below, so no stage builds an unbounded prompt.

### 2.2 `ReviewJob (createReviewJob / nextCalls / applyAnswer)`

```typescript
createReviewJob(dimension: ReviewDimension, subject: CodeReviewSubject, grounding: CodeReviewGrounding, strategy: DimensionStrategy, budget: number | undefined): ReviewJob; nextCalls(job: ReviewJob): readonly JobCall[]; applyAnswer(job: ReviewJob, callId: string, output: unknown): ReviewJob
```

**Parameters:**
- `strategy: DimensionStrategy` — The dimension's prompts and schemas for each stage (see DimensionStrategy).
- `budget: number | undefined` _(optional)_ — The provider's input budget; undefined (unknown) starts with one whole call, as today.
- `callId / output: string / unknown` — The answer to one call the job issued; validated against that call's schema.

**Returns:** `ReviewJob (serialisable) / JobCall[] / ReviewJob` — A serialisable state machine. When the whole prompt fits (or the budget is unknown) the job has exactly one call, today's prompt and schema, and its answer is the dimension's result. Otherwise it runs MAP (symbol parts x context parts, each a call that reports local findings and keyed notes, never absence findings), REDUCE (notes grouped by key, each group adjudicated in calls packed with packIntoBatches; a key whose notes alone do not fit is first merged in batches: each merge call reads a batch of notes and returns ONE note of at most MERGE_NOTE_CHARS (a quarter of the budget) under a new short note id; the job, not the prompt, records which symbolIds and earlier notes each note id stands for, so no id list ever has to fit in a prompt; levels repeat until the key's notes fit one adjudication call), and for quality COMPARE (descriptions packed into batches of at most half the budget, every pair of batches compared in one call, each candidate pair judged by the first of these whose complete serialised prompt fits: (1) both full summaries; (2) in each direction, one full summary against a behaviour digest of the other; (3) the two digests. A digest is at most DIGEST_CHARS (an eighth of the budget) and is written by a call that read its symbol in full; step (3) always fits (two digests plus instructions), so a pair never stalls). nextCalls returns the calls whose inputs are ready; when none remain the job holds the dimension's one DimensionResult.

**Errors:**
- `AtomTooLargeError` when One original item (a symbol summary, an approved clause, a description) whose prompt alone exceeds the budget. Derived items cannot cause it: notes and digests are capped below the budget.
- `InputTooLargeError` when Never escapes: applyRefusal re-plans the refused call (split by the reported maxChars, else in halves) and the job continues.
- `the structured-retry error, as today` when A call's answer fails validation after its retries.

**Preconditions:**
- Every call's prompt is built and measured before it is issued.

**Postconditions:**
- Every input source of every call is packed: a call carries one batch of each source it needs, sized so the whole serialised prompt fits; when the needed sources cannot fit together the job iterates the cross product of their batches. When even one atom of each needed source cannot fit together (for example a symbol and a clause that each fit alone), the joint-fit chain applies to every combining call, not only quality pairs: the first of (1) all atoms full, (2) one atom full with the others as digests, (3) every atom as its digest, whose serialised prompt fits. A digest is at most DIGEST_CHARS (an eighth of the budget), written by a call that read its atom whole, so step (3) always fits and every combining call terminates. This covers the approved LLD/PLAN, the FRs, the promised tests and the test record exactly as it covers the symbols.
- REDUCE keys are initialised from every obligation before MAP runs: every approved clause and PLAN task (adherence), every FR (functional-coverage), every promised test (coverage), every touched module (conventions). A key that receives no note is still adjudicated (packed with other keys) on its context atoms and the statement that no part showed evidence for it, so a missing obligation is reported as one call would report it. With no symbols (an empty or degraded grounding) MAP is skipped and the job issues context-only REDUCE calls over the same keys, packed from the context atoms (for coverage: the promised tests with their test-record atoms), so a diff review still judges every promised test.
- Every original input (each changed symbol's summary, each approved clause) is read whole by at least one call; later stages work on what those calls derived (notes, descriptions, digests), and the job keeps the provenance from every derived item back to its symbolIds outside the prompts, so findings name real symbols.
- Every call fits the budget: MAP batches are packed; a merge call's input is a packed batch of notes and its output is capped at MERGE_NOTE_CHARS; an adjudication's input is a packed batch of a key's notes; a COMPARE call holds two packed description batches of at most half the budget each; a PAIR call is the first of full+full, full+digest (each direction) or digest+digest whose complete serialised prompt fits, and digest+digest always does.
- The job terminates: each merge level replaces a batch of at least two notes by one capped note, so a key's total note size falls at every level until it fits one call.
- Findings are merged as today's single call would give them: location findings from MAP, requirement/idiom/duplication findings from REDUCE and COMPARE/PAIR (a REDUCE finding naming a note id is expanded to that note's symbols by the job); identical findings (every field equal) once; coverage normalised once over the merged result against the whole prepared grounding.

### 2.3 `DimensionStrategy`

```typescript
interface DimensionStrategy { wholePrompt; mapPrompt; mapSchema; noteKey?; reducePrompt?; reduceSchema?; mergeNotesPrompt?; comparePrompt?; pairPrompt?; contextItems? }
```

**Parameters:**
- `inputs (every dimension): readonly InputSource[]` — Every input the dimension's prompts carry, each as a list of indivisible atoms packed with packIntoBatches; nothing is embedded whole unless it fits. adherence: approved LLD clauses (by section), PLAN tasks with their acceptance checks, symbols. conventions: symbols, DOCUMENTED_RULES (a fixed constant). coverage: symbols, promised tests, test-record atoms: one file-status atom per test file, always emitted whatever its titles (file, state, reason, exitCode, timedOut, decidedBy; so a malformed, timed-out or non-zero-exit file with no titles keeps its state), plus one per title of a file's latest run and one per title listed as not in the latest run, each carrying its file's shared metadata (file, state, reason, exitCode, timedOut, decidedBy); one per builder-reported test, one per BUILD task result, one per record note. testRecordView computes the latest-run, missing-title and builder-reported semantics before atomising, unchanged, so splitting a file across calls changes no state. functional-coverage: FRs, symbols. quality: symbols.
- `adherence: DimensionStrategy` — Notes: per approved clause / plan task, the contributing symbols (requirement evidence). Reduce adjudicates each clause: departures and unimplemented clauses.
- `functional-coverage: DimensionStrategy` — Notes: per FR, contributing symbols and how (full/partial). Reduce adjudicates unrealized/partial FRs.
- `coverage: DimensionStrategy` — MAP: a batch of symbols with the test-record atoms of the files those symbols' testsReaching name (each such file's status atom always, and its title atoms) (packed with them; if they do not fit together the job iterates the symbol batch with each batch of those atoms), reporting symbol-coverage findings and notes per promised test (the testsReaching entries showing it). REDUCE: per promised test, its notes with only the record atoms naming it (its builder-reported result, its files' status atoms and latest-run titles), packed; adjudicates missing promised tests. normalizeCoverageFindings runs once after the merge. No call embeds the whole record.
- `conventions: DimensionStrategy` — Notes: per touched module, the idiom examples seen (symbolId, the idiom). Reduce adjudicates each module's idiom on all its examples, with today's too-few-examples rule, and confirms or drops MAP's candidate deviations for that module.
- `quality: DimensionStrategy` — MAP judges within-part quality and returns one-line descriptions; COMPARE finds cross-part duplication.

**Returns:** `—` — Each dimension supplies its prompts; wholePrompt is today's builder, unchanged.

**Postconditions:**
- Diagram and ux are not jobs: they stay deterministic. Adherence's no-contract short circuit stays.

### 2.4 `withStructuredRetry`

```typescript
withStructuredRetry<T>(call: StructuredCall, validate: StructuredValidator<T>, maxAttempts: number): Promise<T>  // unchanged
```

**Parameters:**
- `call: StructuredCall` — As today.

**Returns:** `Promise<T>` — As today.

**Errors:**
- `InputTooLargeError` when The call threw one: it is rethrown at once, not retried as a validation failure, so the same oversized prompt is never sent again. CliProvider.withTransientRetry (src/agent/providers/cli-provider.ts:216-235), which wraps completeStructured inside the provider, also rethrows an InputTooLargeError at once, before it classifies the message as transient, so a refusal whose text matches the transient classifier is not resent there either.

**Postconditions:**
- Every other error is handled as today.

### 2.5 `classifyInputTooLarge (used by runCodex, cliExitError and the claude envelope check)`

```typescript
classifyInputTooLarge(said: string): { readonly maxChars?: number | undefined; readonly actualChars?: number | undefined } | undefined
```

**Parameters:**
- `said: string` — What the CLI reported: a codex error or turn.failed event (JSON), the stderr of a non-zero exit, or the result of a claude envelope with is_error.

**Returns:** `{ maxChars?, actualChars? } | undefined` — Defined when the text is an input-size refusal: codex's input_error_code input_too_large (maxChars and actualChars read from its data) or claude's 'Prompt is too long' result; undefined otherwise.

**Postconditions:**
- Applied at all three places a CLI failure is raised: runCodex's error/turn.failed event check (src/agent/providers/cli-provider.ts:506-509, today a plain Error), cliExitError for a non-zero exit (:600-660), and the claude is_error envelope check in completeStructured (:287-288, today a plain Error). Each throws an InputTooLargeError carrying the same message it throws today when the text is a size refusal, so no size refusal reaches withStructuredRetry as an ordinary error.
- InputTooLargeError extends CliExitError, so callers matching the message or the class are unaffected.

### 2.6 `CliProvider.inputBudgetChars`

```typescript
readonly inputBudgetChars: number | undefined  // on LLMProvider, optional
```

**Returns:** `number | undefined` — The largest prompt, in characters, the provider accepts: 1,048,576 for codex (its own stated limit); undefined for claude and Ollama, where the refusal path decides.

**Postconditions:**
- A provider without the field behaves as unknown budget.

### 2.7 `judgeAdherence / judgeConventions / judgeCoverage / judgeFunctionalCoverage / judgeQuality`

```typescript
unchanged: (subject, grounding, provider, context?) => Promise<DimensionResult>
```

**Parameters:**
- `grounding: CodeReviewGrounding` — As today.

**Returns:** `Promise<DimensionResult>` — As today, by running the dimension's ReviewJob to completion against the provider (the daemon driver): calls serially, never Promise.all.

**Postconditions:**
- Today's prompt builders are the one-call path (DimensionStrategy.wholePrompt), byte-identical to today's; the job stages use the strategy's own stage prompts.

### 2.8 `emitJudgementsResult`

```typescript
emitJudgementsResult(subject, grounding, token, groundingMode): CodeReviewStepOutput  // or, for a review run as jobs, a new emit_calls frame
```

**Parameters:**
- `grounding: CodeReviewGrounding` — The review's grounding; one ReviewJob per dimension is created with the controller frame budget (codeReview.controllerFrameChars) and stored in the state.

**Returns:** `CodeReviewStepOutput` — When every dimension's job is one call and today's frame fits codeReview.controllerFrameChars: exactly today's emit_judgements frame (prompts, schema, grounding), answered with `judgements` as today. Otherwise a separate frame shape, next: 'emit_calls' { calls: [{ callId, dimension, stage, prompt, schema }], progress, guidance, state } with no whole grounding and no legacy prompts. Its size is the fully serialised JSON of the frame: the controller jobs are planned with a per-call budget equal to controllerFrameChars minus the frame's measured envelope (the guidance, state token, ids, the call's schema and JSON escaping of its prompt), and ready calls are packed into a frame only while the serialised frame fits; a call that alone would not fit is re-planned smaller by its job before it is emitted. The phase 'judgements' input answers an emit_calls frame with `answers: [{ callId, output }]`; applyAnswer advances each job; the next emit_calls frame follows until every job is complete, then the runner is driven with each dimension's result. A fresh state token per frame (the previous released).

**Errors:**
- `bad-judgements` when An answer is malformed, or names a callId not in the frame its token was issued for.
- `state-not-found` when An answer is sent with a released frame token.

**Postconditions:**
- The controller path runs the same jobs as the daemon path, so both judge a Story identically.
- A review that fits one frame is exactly as today.

### 2.9 `insrc_code_review_step (MCP tool registration in src/mcp/server.ts)`

```typescript
inputSchema gains answers?: { callId: string; output: object }[] (the judgements of a multi-call frame)
```

**Parameters:**
- `answers: { callId: string; output: object }[] | undefined` _(optional)_ — The answers to the calls of a multi-call frame; a frame without calls is answered with `judgements` as today. The tool description says so.

**Returns:** `CodeReviewStepMcpEnvelope` — As today; the registered callback forwards its arguments unchanged (forward('insrc_code_review_step', rawArgs, extra)), so `answers` reaches handleCodeReviewStep as given. The tool description explains emit_calls frames and answering them by callId.

**Postconditions:**
- A multi-call review can be completed through the public MCP tool, not only by calling the handler directly.

## 3. Data model changes

### 3.1 `DimensionResult` — field-add

+ parts?: { map: number; reduce: number; compare: number } — how many calls of each stage the dimension took, set only when it took more than one; recorded on the code-review body so a reader knows it was judged as a job.

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/workflow/code-review/runner.ts`

### 3.2 `config codeReview.controllerFrameChars` — new

Catalog type `number` (the catalog's domain is string | number | boolean | enum; reconcile.ts rejects any other), default 400,000; the controller driver reads it and requires a positive integer, falling back to the default with a warning otherwise.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/reconcile.ts`
- `src/daemon/steps/code-review-step/handler.ts`

### 3.3 `InputTooLargeError / AtomTooLargeError` — new

InputTooLargeError extends CliExitError { maxChars?: number; actualChars?: number } — the model refused the input for its size (re-planned by the job, never escapes it). AtomTooLargeError — one indivisible item cannot fit any call; names it and the sizes.

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/structured-output.ts`
- `src/workflow/code-review/review-job.ts`

### 3.4 `ReviewJob` — new

Serialisable: dimension, budget, stage, the planned calls with their state (pending/answered), the collected local findings and notes per key, the merge level per key, COMPARE batch pairs and candidates, and the final DimensionResult. The daemon holds it in memory; the controller path keeps one per dimension in the step state. Provenance: every derived note, description and digest has a short id, and the job maps it to the symbolIds (and earlier note ids) it stands for; prompts carry note ids, never the expanded id lists.

**Call sites:**
- `src/workflow/code-review/review-job.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/code-review-step/state-store.ts`

### 3.5 `Map / reduce / compare outputs per dimension` — new

MAP output = today's findings shape plus notes: [{ key, symbolIds, note }] (and, for quality, descriptions: [{ symbolId, description }]); MAP never emits absence findings (unimplemented clause, unrealized FR, missing promised test) or module-idiom verdicts. REDUCE output = today's findings shape for the adjudicated keys; MERGE output = one note of at most MERGE_NOTE_CHARS, referring to the merged note ids (the job keeps their symbols); COMPARE output = candidate pairs; PAIR output = today's quality findings shape. One-call reviews use today's schemas. DIGEST output = a behaviour digest of one symbol, at most DIGEST_CHARS (an eighth of the budget).

**Call sites:**
- `src/workflow/code-review/dimensions/adherence.ts`
- `src/workflow/code-review/dimensions/functional-coverage.ts`
- `src/workflow/code-review/dimensions/coverage.ts`
- `src/workflow/code-review/dimensions/conventions.ts`
- `src/workflow/code-review/dimensions/quality.ts`

### 3.6 `code-review step state and I/O (controller path)` — field-add

+ jobs?: ReviewJob per dimension, and the callIds of the current frame. New output frame next: 'emit_calls' { calls: [{ callId, dimension, stage, prompt, schema }], progress, guidance, state } (no grounding, no legacy prompts); the judgements input gains answers?: [{ callId, output }]. Absent when the review fits one frame, so a state from before is read as today and today's emit_judgements frame is unchanged.

**Call sites:**
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/code-review-step/types.ts`
- `src/daemon/steps/code-review-step/state-store.ts`
- `src/mcp/server.ts`

### 3.7 `config catalog contract test` — invariant-change

Adding codeReview.controllerFrameChars raises the catalog's FROM_CONFIG count from 37 to 38; the contract test asserts the new count and the new setting's type (number) and default (400000).

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/__tests__/config-catalog-contract.test.ts`

## 4. Error paths

**Error cases**

- **One original item (a symbol summary, an approved clause) whose prompt alone exceeds the budget.** (terminal)
  - Detection: packIntoBatches measures each batch's built prompt before any call; a one-item batch over the budget is the condition.
  - Response: AtomTooLargeError naming the item and both sizes; the runner returns {ok:false} with that message and writes no record.
  - User impact: The only size failure left, and it names exactly what is too large.
- **The model refuses a call for its size although it was measured to fit (claude's unknown budget, or a limit counted differently).** (recoverable)
  - Detection: classifyInputTooLarge on every CLI failure path (codex error/turn.failed event, non-zero exit, claude is_error envelope) gives an InputTooLargeError; CliProvider.withTransientRetry and withStructuredRetry both rethrow it at once.
  - Response: The job re-plans that call: its items are re-packed with the reported maxChars as the budget (else halved) and the job continues.
  - User impact: The review completes with more calls; no prompt is sent twice.
- **A call's answer fails schema validation.** (terminal)
  - Detection: withStructuredRetry's validator (daemon) or applyAnswer's validation (controller).
  - Response: Daemon: retried as today, then the dimension fails and no record is written. Controller: bad-judgements for that call, retryable with the same token.
  - User impact: As today, per call.
- **A merge or digest answer exceeds its cap, or refers to note ids it was not given.** (recoverable)
  - Detection: applyAnswer measures the answer against MERGE_NOTE_CHARS (or the digest cap) and checks its note ids against the call's inputs.
  - Response: Treated as a validation failure of that call (retried as above); provenance comes from the job, not the answer, so no symbol can be lost by a merge.
  - User impact: None when the retry succeeds; otherwise a named failure.
- **The controller answers a callId not in its frame, or replays an earlier frame.** (recoverable)
  - Detection: The frame's callIds kept with its token; a released token is not found.
  - Response: bad-judgements, or state-not-found for a replay.
  - User impact: The controller resends the right answers.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Story whose whole prompt fits the budget, or a provider with no known budget (claude, Ollama). | Each dimension is one call with today's prompt (today's structured retries; adherence's short circuit; diagram and ux deterministic); the record has no `parts`. |
| A requirement (clause, FR, promised test) whose evidence comes from symbols in different parts, with or without a test record. | Adjudicated once in REDUCE on all its notes: not reported missing when any part shows it. |
| A module whose idiom examples are spread across parts. | REDUCE judges the module's idiom on all its examples, with today's too-few-examples rule; MAP's candidate deviations for it are confirmed or dropped there. |
| Duplicated logic in two symbols with unrelated names in different parts. | COMPARE names the pair and the pair judgement reports it with counterpartRef. |
| One requirement with so many notes that they do not fit one REDUCE call. | They are merged in batches (every symbolId kept, at most half as many notes per level) until they fit, then adjudicated. |
| Approved design and plan larger than the budget. | Split by clause into context parts; MAP runs symbol parts x context parts; each clause is adjudicated in REDUCE. |
| Identical findings from several calls. | Kept once; findings differing in any field all kept. |
| One requirement supported by so many symbols that their ids alone exceed the budget. | Merge levels replace notes by capped notes under short note ids; the job keeps every symbol under its note ids; the adjudication fits and its findings are expanded to the real symbols. |
| Two candidate duplicates whose summaries each fit alone but not together, including two summaries that each nearly fill the budget. | Judged by the first of full+digest (each direction) or digest+digest whose serialised prompt fits; digest+digest always fits, so the pair is judged. |
| A controller call whose prompt nearly fills controllerFrameChars. | It is planned against the frame budget minus the measured envelope, so the serialised emit_calls frame holding it fits; otherwise its job re-plans it smaller before emitting it. |
| A test record whose entries together exceed the budget (many test files and reported tests). | MAP calls carry only the record atoms of the files their symbols reach, REDUCE calls only those naming their promised test, each packed; every call fits and every promised test is adjudicated on all its evidence. |
| A symbol and an approved clause that each fit alone but not together. | The joint-fit chain judges them full+digest (either way) or digest+digest; the call fits and the clause is still adjudicated. |
| One test file whose titles together exceed the budget. | Its titles are separate atoms carrying the file's metadata and are packed across calls; the file's state (passing/failing/unverified) and its not-in-latest-run titles mean the same in every call. |
| A test file whose latest run timed out, exited non-zero or is malformed, with no current or older titles. | Its file-status atom carries its state and reason into every call that names the file, so it is still failing or unverified, never missing. |
| An obligation (clause, FR, promised test) for which no part reports any evidence. | Its key exists from the start, so it is adjudicated and reported unrealized or missing, as one call would. |
| A diff (degraded) review: no symbols, with a test record larger than the budget. | No MAP calls; context-only REDUCE calls, each packed, judge every promised test against its record atoms; a missing one is reported and a passing one is not. |

**Invariants to preserve**

- Each dimension yields exactly one DimensionResult, and the runner folds one verdict from them and writes one record (runCodeReview). [[c7]]
- Model calls are serial, never Promise.all (CLAUDE.md), including the calls of the parts. [[c4]]
- A failed structured answer is never turned into a pass: the retry helper throws after its attempts and the runner writes nothing. [[c2]]
- The CLI error message keeps its `<cli> exited with <code>.` head and the output is never cut (cliExitError). [[c3]]
- Out-of-scope findings are handled per path as today: the daemon judges drop them; the controller path keeps them on the dimension's outOfScope and discloses them (scopeDropped), never counted. [[c5]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test); judges driven by scripted fake LLMProviders, as in src/workflow/code-review/dimensions/__tests__/coverage.test.ts`

**Test levels**

- **unit** — Packing and the job state machine, without a model.
  - Subjects: `src/workflow/code-review/__tests__/pack-into-batches.test.ts: 'every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a fitting dimension, or an unknown budget, is one call with today's prompt and schema'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'every call the job issues fits the budget at every stage, for a Story many times the budget'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a key whose notes do not fit is merged level by level under capped notes and the job terminates'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a merge or digest answer over its cap or naming unknown note ids is rejected'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a refused call is re-planned and the job completes, sending no prompt twice'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'identical findings merge once; findings differing in any field are all kept'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a requirement whose symbolIds alone exceed the budget is merged under note ids, adjudicated in one call and its findings expanded to the real symbols'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'every original symbol summary and clause is read whole by some call'`
- **unit** — The size refusal is recognised and not retried.
  - Subjects: `src/agent/providers/__tests__/input-too-large.test.ts: 'codex input_too_large becomes an InputTooLargeError with maxChars and actualChars; the message is unchanged'`, `src/agent/providers/__tests__/input-too-large.test.ts: 'withStructuredRetry rethrows an InputTooLargeError after one call'`
- **integration** — Size refusals through the real provider paths.
  - Subjects: `src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a fake codex emitting an input_too_large error event, or exiting non-zero with it on stderr, and a fake claude returning an is_error Prompt is too long envelope each surface an InputTooLargeError from completeStructured after one run'`, `src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a size refusal whose text also matches the transient classifier (API Error: Prompt is too long) runs the CLI once'`
  - Fixtures: `fake codex and claude executables as in src/agent/providers/__tests__/cli-failure-message.test.ts`
- **integration** — Every dimension judged as a job through a prompt-sensitive fake provider (its answers depend on what each prompt contains), and the runner.
  - Subjects: `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'adherence, functional-coverage and coverage adjudicate each requirement on evidence from every part, with or without a test record'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'conventions judges a module idiom on examples from every part'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'quality reports duplication between symbols in different parts with counterpartRef'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'an approved design larger than the budget is split by clause and every clause adjudicated'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'the runner folds one verdict and writes one record with parts per dimension; coverage is normalised once'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries fit only one at a time are judged in two directions against digests'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries each nearly fill the budget are judged digest against digest, and every pair prompt fits when serialised'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with a test record larger than the budget, every coverage call fits when serialised and every promised test is adjudicated on all its record evidence and notes'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a symbol and a clause that each fit alone but not together are judged through the joint-fit chain and every call fits'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a single test file whose titles exceed the budget is split into title atoms with its file metadata and every promised test is adjudicated on all of them'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'timed-out, non-zero-exit and malformed test files with no titles keep their state through the file-status atom in every call that names them'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'every clause, FR and promised test reaches adjudication, and one no part shows evidence for is reported missing'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with no symbols and a test record over the budget, context-only calls judge every promised test, reporting the missing one and not the passing one'`
- **integration** — The controller path runs the same jobs.
  - Subjects: `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'an over-budget review is answered frame by frame by callId through the registered MCP tool and writes the same record as the daemon path'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a wrong callId is bad-judgements and a replayed frame token is state-not-found'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a review that fits one frame is exactly as today, out-of-scope findings disclosed as today'`, `src/daemon/steps/code-review-step/__tests__/handler.test.ts (existing, still passes)`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'every serialised emit_calls frame fits controllerFrameChars, with no grounding or legacy prompts, including a call near the frame budget'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'with a test record larger than the frame budget, every emit_calls frame fits and the record written matches the daemon path'`, `src/config/__tests__/config-catalog-contract.test.ts (existing, updated: 38 settings, codeReview.controllerFrameChars a number with default 400000)`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a symbol and clause too large together, and a test file too large alone, complete frame by frame with every serialised frame within the budget'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a degraded review with no symbols and an oversized record completes frame by frame and reports the missing promised test'`
- **smoke** — The Story that could not be reviewed is reviewed on the installed daemon.
  - Subjects: `docs/standalone/review-every-changed-symbol-story-too-E20261018aef82b03/S001/smoke.md: the code review of Epic c2ba6fa6 s1 completes (it failed with a 1,247,701-character prompt), recording the calls per stage per dimension and the largest prompt sent`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/code-review/__tests__/pack-into-batches.test.ts: 'every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'every call the job issues fits the budget at every stage, for a Story many times the budget'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a key whose notes do not fit is merged level by level under capped notes and the job terminates'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a merge or digest answer over its cap or naming unknown note ids is rejected'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'an approved design larger than the budget is split by clause and every clause adjudicated'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a requirement whose symbolIds alone exceed the budget is merged under note ids, adjudicated in one call and its findings expanded to the real symbols'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'every original symbol summary and clause is read whole by some call'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries fit only one at a time are judged in two directions against digests'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries each nearly fill the budget are judged digest against digest, and every pair prompt fits when serialised'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with a test record larger than the budget, every coverage call fits when serialised and every promised test is adjudicated on all its record evidence and notes'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a symbol and a clause that each fit alone but not together are judged through the joint-fit chain and every call fits'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a single test file whose titles exceed the budget is split into title atoms with its file metadata and every promised test is adjudicated on all of them'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a symbol and clause too large together, and a test file too large alone, complete frame by frame with every serialised frame within the budget'` |
| `ac2` | `src/workflow/code-review/__tests__/review-job.test.ts: 'identical findings merge once; findings differing in any field are all kept'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'adherence, functional-coverage and coverage adjudicate each requirement on evidence from every part, with or without a test record'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'conventions judges a module idiom on examples from every part'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'quality reports duplication between symbols in different parts with counterpartRef'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'the runner folds one verdict and writes one record with parts per dimension; coverage is normalised once'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'timed-out, non-zero-exit and malformed test files with no titles keep their state through the file-status atom in every call that names them'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'every clause, FR and promised test reaches adjudication, and one no part shows evidence for is reported missing'`, `src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with no symbols and a test record over the budget, context-only calls judge every promised test, reporting the missing one and not the passing one'` |
| `ac3` | `src/agent/providers/__tests__/input-too-large.test.ts: 'codex input_too_large becomes an InputTooLargeError with maxChars and actualChars; the message is unchanged'`, `src/agent/providers/__tests__/input-too-large.test.ts: 'withStructuredRetry rethrows an InputTooLargeError after one call'`, `src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a fake codex emitting an input_too_large error event, or exiting non-zero with it on stderr, and a fake claude returning an is_error Prompt is too long envelope each surface an InputTooLargeError from completeStructured after one run'`, `src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a size refusal whose text also matches the transient classifier (API Error: Prompt is too long) runs the CLI once'`, `src/workflow/code-review/__tests__/review-job.test.ts: 'a refused call is re-planned and the job completes, sending no prompt twice'` |
| `ac4` | `src/workflow/code-review/__tests__/review-job.test.ts: 'a fitting dimension, or an unknown budget, is one call with today's prompt and schema'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a review that fits one frame is exactly as today, out-of-scope findings disclosed as today'`, `src/daemon/steps/code-review-step/__tests__/handler.test.ts (existing, still passes)`, `src/config/__tests__/config-catalog-contract.test.ts (existing, updated: 38 settings, codeReview.controllerFrameChars a number with default 400000)` |
| `ac5` | `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'an over-budget review is answered frame by frame by callId through the registered MCP tool and writes the same record as the daemon path'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a wrong callId is bad-judgements and a replayed frame token is state-not-found'`, `docs/standalone/review-every-changed-symbol-story-too-E20261018aef82b03/S001/smoke.md`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'every serialised emit_calls frame fits controllerFrameChars, with no grounding or legacy prompts, including a call near the frame budget'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'with a test record larger than the frame budget, every emit_calls frame fits and the record written matches the daemon path'`, `src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a degraded review with no symbols and an oversized record completes frame by frame and reports the missing promised test'` |

## 6. Migration

**State before:** Each symbol-reading judge sends the whole changed-symbol set in one call (s1 c1); an oversized prompt is refused by codex with input_too_large, retried twice unchanged, and the review fails with no record (s1 c2). The controller path sends every prompt and the whole grounding in one emit_judgements frame (s1 c4).

**State after:** A dimension that fits is judged exactly as today. One that does not runs as a bounded ReviewJob (MAP over symbol and context parts, REDUCE by key with merge levels, COMPARE for quality), every call fitting the budget; the only size failure is one indivisible item larger than the whole budget (AtomTooLargeError). A size refusal re-plans the call, never resends it. The controller path runs the same jobs frame by frame.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add classifyInputTooLarge and InputTooLargeError at the three CLI failure paths; withStructuredRetry and CliProvider.withTransientRetry rethrow it at once. — ↩ rollbackable
2. Add the optional inputBudgetChars to LLMProvider; set it for codex. — ↩ rollbackable
3. Add packIntoBatches, AtomTooLargeError and the ReviewJob state machine with its daemon driver. — ↩ rollbackable
4. Add each dimension's DimensionStrategy (map/notes/reduce/merge prompts and schemas; compare and pair for quality) and route the five judges through their job; today's whole prompt stays the one-call path. — ↩ rollbackable
5. Add the optional DimensionResult.parts counts. — ↩ rollbackable
6. Add codeReview.controllerFrameChars, the controller driver (jobs in the step state, emit_calls frames planned against the measured frame envelope, answers by callId) and `answers` in the insrc_code_review_step MCP input schema (forwarded unchanged); a review that fits one frame unchanged. — ↩ rollbackable

**Backward compat:** Records written before keep validating: `parts` is optional and absent on one-call dimensions. A controller state saved before the change has no `jobs` and is resumed as today. A review that fits one frame produces today's emit_judgements frame and is answered with `judgements` as today; only a review run as jobs produces the new emit_calls frame, answered with `answers` by callId. CliExitError callers are unaffected: InputTooLargeError is a CliExitError with the same message.

## 7. Alternatives considered

### 7.1 a1: Bounded review job per dimension (map, keyed reduce with merge levels, batch-pair compare), shared by both paths — **CHOSEN**

Every stage of a dimension that does not fit is planned as calls that each fit; one serialisable job runs on the daemon and, frame by frame, on the controller.

A code review completes for a Story of any size. When a dimension's material does not fit the reviewing model's input, the review runs as a bounded job: the changed symbols (and, if needed, the approved design and plan) are split into parts that each fit; each part's call reports its local findings plus small keyed notes; the notes are then combined by key (a requirement, a promised test, a module) in calls that each fit, merging further when one key's notes are too many; quality compares symbol descriptions batch against batch to find duplicates across parts. Every call fits; only one indivisible item larger than the model's whole input stops the review, with that item named. A size refusal is split, never resent. The daemon runs the job itself; the controller's review walks the same job one frame at a time. Stakeholder decision 2026-10-19: every stage is bounded (option A), not a stated limit on the combining stages.

### 7.2 a2: Partition by file instead of by symbol

Same helper, but parts are whole changed files (all of a file's symbols together).

As a1, but the unit of partition is a changed file: each part holds every symbol of one or more whole files. A file whose symbols alone do not fit falls back to a symbol split for that file.

**Rejected because:** Meets the constraints but is a1 plus a second partition rule (it still needs the symbol split for oversized files), for a benefit no issue constraint asks for.

### 7.3 a3: Summarise first, then judge on summaries

Shrink the material with a first pass that summarises the symbols, then judge every dimension on the summaries in one call.

A first model pass condenses the changed symbols into shorter summaries until the whole set fits, then each dimension judges the condensed set in one call as today.

**Rejected because:** Violates fi1, the issue's central constraint.

### 7.4 a4: Daemon-only split; controller path unchanged

Split only on the daemon path and keep the controller's single emit_judgements frame.

The helper of a1 is used inside the daemon judges only; the controller path keeps emitting every prompt and the whole grounding in one frame.

**Rejected because:** Violates fi5.

## 8. References

- **[[c1]]** `prior-artifact` `ISSUE-aef82b034d7209fa` — "The code review of a Story of any size completes and judges every changed symbol"
- **[[c2]]** `code` `src/agent/providers/structured-output.ts:180-243`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:600-660`
- **[[c4]]** `code` `src/workflow/code-review/dimensions/adherence.ts:74-155`
- **[[c5]]** `code` `src/daemon/steps/code-review-step/handler.ts`
- **[[c6]]** `doc` `/tmp/.insrc/agent.27.log` — "Input exceeds the maximum length of 1048576 characters. (code -32602), data: {"input_error_code":"input_too_large","max_chars":1048576,"actual_chars":1247701}"
- **[[c7]]** `code` `src/workflow/code-review/runner.ts`
- **[[c8]]** `code` `src/daemon/steps/code-review-step/types.ts:54-58`
- **[[c9]]** `code` `src/agent/providers/cli-provider.ts:497-516`
- **[[c10]]** `code` `src/mcp/server.ts:697-760`
- **[[c11]]** `code` `src/workflow/code-review/dimensions/functional-coverage.ts:97-117`
- **[[c12]]** `code` `src/workflow/code-review/dimensions/quality.ts:82-140`
- **[[c13]]** `code` `src/workflow/code-review/dimensions/conventions.ts:105-164`
- **[[c14]]** `stakeholder` `Subho Ghosh, 2026-10-19` — "A: Bounded at every stage"
- **[[c15]]** `code` `src/workflow/code-review/dimensions/coverage.ts:212-271`
- **[[c16]]** `code` `src/config/__tests__/config-catalog-contract.test.ts:89`
- **[[c17]]** `code` `src/config/reconcile.ts`
- **[[c18]]** `code` `src/workflow/code-review/dimensions/test-record-view.ts:96-120`

## 9. Open questions

- cd1: packIntoBatches, ReviewJob, DimensionStrategy, JobCall, InputTooLargeError, AtomTooLargeError and LLMProvider.inputBudgetChars are new names with no HLD to own them (standalone fix); this LLD's contract section is proposed as their authority.
- Acceptance criteria (the Story carries none; derived from the ISSUE's fix intent, c1): ac1 every changed symbol of a dimension is judged, in parts when the whole does not fit, and nothing is truncated (a symbol or fixed context that alone cannot fit fails with a named PromptTooLargeError); ac2 the parts' findings make up each dimension's one result and the Story's one verdict; ac3 an input-size refusal is recognised and split, never retried as a malformed answer; ac4 a Story that fits is reviewed exactly as today (one call per dimension, one controller frame); ac5 the controller review walks the same parts turn by turn, and Epic c2ba6fa6 s1's code review completes on the installed daemon.
- Default of codeReview.controllerFrameChars (the largest emit_judgements frame, and so the controller budget of every call in it): proposed 400,000 characters, about 100k tokens, so an ordinary review still fits one frame and an s1-sized one is run as jobs; a large frame today is already saved to a file by the client rather than lost.
- The claude CLI's refusal for an oversized prompt has not been observed; the design recognises its 'prompt is too long' result as an input-size refusal and, failing that, the error is handled as today. The smoke records what the claude path actually reports.

## Resolved questions

- `q7150e00a` — cd1: packIntoBatches, ReviewJob, DimensionStrategy, JobCall, InputTooLargeError, AtomTooLargeError and LLMProvider.inputBudgetChars are new names with no HLD to own them (standalone fix); this LLD's contract section is proposed as their authority.
  - **resolved**: LLD as contract authority — Stakeholder decision 2026-10-19: the standalone S001 LLD's contract section is the authority for packIntoBatches, ReviewJob, DimensionStrategy, JobCall, InputTooLargeError, AtomTooLargeError and LLMProvider.inputBudgetChars; this fix has no owning HLD. _(2026-10-18T19:29:35.231Z)_
- `q67d97a8d` — Acceptance criteria (the Story carries none; derived from the ISSUE's fix intent, c1): ac1 every changed symbol of a dimension is judged, in parts when the whole does not fit, and nothing is truncated (a symbol or fixed context that alone cannot fit fails with a named PromptTooLargeError); ac2 the parts' findings make up each dimension's one result and the Story's one verdict; ac3 an input-size refusal is recognised and split, never retried as a malformed answer; ac4 a Story that fits is reviewed exactly as today (one call per dimension, one controller frame); ac5 the controller review walks the same parts turn by turn, and Epic c2ba6fa6 s1's code review completes on the installed daemon.
  - **resolved**: Adopt all five criteria — Stakeholder decision 2026-10-19: ac1-ac5 are binding for S001, read with the approved LLD's names: 'in parts' means the bounded ReviewJob (map, keyed reduce, compare), and the named error is AtomTooLargeError (one original atom larger than the whole budget). The installed-daemon completion of Epic c2ba6fa6 s1's code review is part of acceptance. _(2026-10-18T19:31:56.099Z)_
- `q56047d0c` — Default of codeReview.controllerFrameChars (the largest emit_judgements frame, and so the controller budget of every call in it): proposed 400,000 characters, about 100k tokens, so an ordinary review still fits one frame and an s1-sized one is run as jobs; a large frame today is already saved to a file by the client rather than lost.
  - **resolved**: 400k default with job splitting — Stakeholder decision 2026-10-19: codeReview.controllerFrameChars defaults to 400,000 characters (catalog type number, validated as a positive integer where it is used). _(2026-10-18T19:32:59.069Z)_

## Citations

- **[[c1]]** `prior-artifact` `ISSUE-aef82b034d7209fa` — "The code review of a Story of any size completes and judges every changed symbol"
- **[[c2]]** `code` `src/agent/providers/structured-output.ts:180-243`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:600-660`
- **[[c4]]** `code` `src/workflow/code-review/dimensions/adherence.ts:74-155`
- **[[c5]]** `code` `src/daemon/steps/code-review-step/handler.ts`
- **[[c6]]** `doc` `/tmp/.insrc/agent.27.log` — "Input exceeds the maximum length of 1048576 characters. (code -32602), data: {"input_error_code":"input_too_large","max_chars":1048576,"actual_chars":1247701}"
- **[[c7]]** `code` `src/workflow/code-review/runner.ts`
- **[[c8]]** `code` `src/daemon/steps/code-review-step/types.ts:54-58`
- **[[c9]]** `code` `src/agent/providers/cli-provider.ts:497-516`
- **[[c10]]** `code` `src/mcp/server.ts:697-760`
- **[[c11]]** `code` `src/workflow/code-review/dimensions/functional-coverage.ts:97-117`
- **[[c12]]** `code` `src/workflow/code-review/dimensions/quality.ts:82-140`
- **[[c13]]** `code` `src/workflow/code-review/dimensions/conventions.ts:105-164`
- **[[c14]]** `stakeholder` `Subho Ghosh, 2026-10-19` — "A: Bounded at every stage"
- **[[c15]]** `code` `src/workflow/code-review/dimensions/coverage.ts:212-271`
- **[[c16]]** `code` `src/config/__tests__/config-catalog-contract.test.ts:89`
- **[[c17]]** `code` `src/config/reconcile.ts`
- **[[c18]]** `code` `src/workflow/code-review/dimensions/test-record-view.ts:96-120`
