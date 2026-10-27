<!-- insrc:artifact LLD-34798d209cf97413-S001 -->

# LLD: E2026102734798d20:S001

## Summary

**Epic:** `split-oversized-diff-evidence-into-lossless`
**HLD base run:** `wf-1793076977701-80y26b`
**HLD effective hash:** `34798d209cf9...`

Large diff files become ordered, attributable review spans that feed the existing serial chunk and gather pipeline. Every diff-review call stays within128000 estimated input tokens, including its envelopes, schema, context, carried notes/history and repair instructions. The daemon still reviews controller-authored code, and diff-only results retain their degraded coverage limit. The code-review time budget is 10 minutes per initially planned primary model-review chunk, aggregated across serial dimensions. Retries, repairs, redivision and gather consume that fixed allowance; bounded status waits resume the same daemon-owned operation.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `buildDiffSymbols`

```typescript
buildDiffSymbols(diff: DiffResult): ChangedSymbolSummary[]
```

**Parameters:**
- `diff: DiffResult` — Frozen per-file diff evidence and truncation/binary metadata.

**Returns:** `ChangedSymbolSummary[]` — Small files retain one legacy row. Larger textual diffs produce ordered file-fragment rows with unique IDs and lossless source spans; binary markers remain unchanged.

**Errors:**
- `Error` when Fragment metadata cannot represent original evidence consistently; no partial review material is returned.

**Preconditions:**
- Diff evidence is captured once by the existing changed-set reader.

**Postconditions:**
- Parent file -> ordered fragments is one-to-many; each fragment belongs to exactly one parent. Text ranges partition the captured diff with no gaps/overlap, and concatenation reproduces it exactly.
- Use a conservative16Ki-character maximum raw span, preferring complete diff lines; a longer line uses Unicode-safe continuation spans with exact offsets. Repeated bounded header/context metadata is separate from the original evidence ranges.
- Deduplicate changedFiles in first-seen order; findings retain the original file path and old/new line/column or explicit diff-offset coordinates.
- Existing truncation/missing-hunk markers remain honest; fragmenting never changes incomplete input into complete evidence.
- The 16Ki raw spans are staging maxima, not guaranteed final atoms. Before job preparation a dimension-specific fitDiffMaterial seam partitions these spans further using its authoritative effective cap and actual enveloped chunk schema/context; see budget-aware material contract. Original captured parent text/digests remain immutable.

### 2.2 `codeReviewMaterial`

```typescript
codeReviewMaterial(grounding: CodeReviewGrounding): ReviewMaterial
```

**Parameters:**
- `grounding: CodeReviewGrounding` — Existing symbol rows or attributed diff-fragment rows.

**Returns:** `ReviewMaterial` — Unique review atoms and relations that preserve parent provenance and feed the existing chunk/gather contract.

**Errors:**
- `Error` when Duplicate IDs, invalid fragment order, missing/overlapping ranges or mismatched parent provenance.

**Preconditions:**
- Graph symbol rows remain compatible and keep their existing identity.

**Postconditions:**
- Fragment siblings retain parent identity and ordered adjacency; avoid a quadratic all-pairs relation expansion between fragments of one file.
- For quality reviews containing diff fragments, append one check-item obligation per parent file, keyed diff-file-quality:<parentId>, covering exactly that parent's fragment IDs. Existing graph-only quality reviews retain no such obligations. Parent adjudication is explicit, not inferred from same-file relations.
- No source fragment is shortened or replaced by a summary before at least one chunk reviews its complete captured text.

### 2.3 `promptChars`

```typescript
promptChars(messages: readonly LLMMessage[], schema?: StructuredSchema): number
```

**Parameters:**
- `messages: readonly LLMMessage[]` — Complete supplied message sequence, including system/user/assistant history and explicit context/notes.
- `schema: StructuredSchema | undefined` _(optional)_ — Actual enveloped output schema supplied to the provider, counted in addition to any schema text already present in messages.

**Returns:** `number` — Conservative serialized complete-call input size under the existing3characters/token contract.

**Errors:**
- `Error` when Input/schema cannot be serialized or bounded accurately.

**Preconditions:**
- All framework-added context is explicit; no resumed conversation is used.

**Postconditions:**
- Planning, retries, gather, relation/duplicate calls and final issue/send checks use the same complete-input measurement.
- Role separators, call identifier envelopes, actual schema serialization, examples, context and carried history all consume the same limit; provider-specific schema expansion is checked before spawning.

### 2.4 `modelDimensionAdapter`

```typescript
modelDimensionAdapter<O>(spec: ModelDimensionSpec<O>, subject: CodeReviewSubject, snapshot: ReviewMaterialSnapshot, limitChars?: number, path?: ReviewPath): ReviewAdapter<DimensionResult>
```

**Parameters:**
- `spec: ModelDimensionSpec<O>` — Existing dimension prompts, schema and gather obligations.
- `subject: CodeReviewSubject` — Story and original changed-file set.
- `snapshot: ReviewMaterialSnapshot` — Immutable evidence snapshot and full/degraded grounding mode.
- `limitChars: number` _(optional)_ — Existing configured limit, capped at384000 characters for this diff-review path.
- `path: ReviewPath` _(optional)_ — Existing daemon/controller execution path; no reviewer-role change.

**Returns:** `ReviewAdapter<DimensionResult>` — Existing adapter over bounded diff atoms and complete-call input measurement.

**Errors:**
- `AtomTooLargeError` when Required fixed context/schema or an indivisible non-diff item cannot fit even without optional summaries.

**Preconditions:**
- Use the existing serial prepare -> review -> gather flow; no alternate review bypass.

**Postconditions:**
- Diff-review limit is min(configured limit,384000); budget is never raised automatically.
- Every fragment is reviewed; gather retains provenance and existing degraded result cap, scope filtering and independent reviewer stamp.
- Quality fragment calls return evidence notes for their parent-file obligations as well as existing findings/descriptions. A parent-file gather call judges all completed fragment notes and can emit a correctness finding that no individual chunk could establish. Local findings and parent findings are merged and filtered once.
- For quality material with any diff-fragment parent obligations, set ReviewAdapter.requiresChunking:true. This explicitly forces the measured chunk/gather path even when the complete file would fit a single call. Every fragment then receives note validation and parent-file adjudication; no single-call exemption is claimed.

### 2.5 `runReviewJob`

```typescript
runReviewJob(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, provider: LLMProvider, opts?: RunReviewJobOpts): Promise<unknown>
```

**Parameters:**
- `job: ReviewPipelineJob` — Existing serial job with measured complete-call hard limit.
- `adapter: ReviewAdapter<unknown>` — Existing chunk and gather producer.
- `provider: LLMProvider` — Existing configured provider through CLI OAuth abstraction.
- `opts: RunReviewJobOpts` _(optional)_ — Cancellation, timing and progress.

**Returns:** `Promise<unknown>` — Existing review result after all required chunks and gather stages finish.

**Errors:**
- `InputTooLargeError` when The final serialized call, including any newly added schema/context/repair content, exceeds the job limit; subdivide/reduce using existing pipeline semantics, never send it unchanged.
- `Error` when Required isolated structured-call semantics cannot be enforced by the selected provider.

**Preconditions:**
- Each code-review model call is a fresh structured request with explicit supplied context; no CLI resume, ambient conversation history, tool-driven context growth or unmeasured project-instruction injection is allowed in the bounded diff path.
- Before dispatch of a bounded structured call, require provider.capabilities.boundedStructuredInput === true; absence/false is unsupported. The provider advertises enforcement support, not merely acceptance of an unknown options field.

**Postconditions:**
- Recheck complete size immediately before every provider submission; no LLM calls run in parallel.
- A retry includes only explicitly rendered bounded repair/history content; if it cannot fit, redivide/reduce or fail without stamping a completed review.
- Provider/system protocol overhead is conservatively accounted at the existing application input-estimation boundary; do not claim exact native-token counting. Any extra application-controlled CLI instructions/schema are included or disabled.
- The driver receives the same effective job.plan.limitChars chosen at job creation and sends boundedInput:{maxInputChars:job.plan.limitChars,contextMode:isolated-structured} for every bounded chunk/gather/reduction/repair call. Unsupported-bounded-input is terminal, not a transient retry.
- Timed code-review calls use the immutable primary-chunk deadline for structured and reviewer-session execution. Retries/gather/redivision do not extend time; reject late results and cancel outstanding work.

### 2.6 `runDimensionJob`

```typescript
runDimensionJob(build: (snapshot: ReviewMaterialSnapshot, effectiveLimitChars: number) => ReviewAdapter<DimensionResult>, subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider, ctx: JudgeContext | undefined): Promise<DimensionResult>
```

**Parameters:**
- `build: (snapshot: ReviewMaterialSnapshot, effectiveLimitChars: number) => ReviewAdapter<DimensionResult>` — Existing adapter factory extended with the authoritative effective input limit. All five model-dimension factories consume it explicitly.
- `subject: CodeReviewSubject` — Story scope.
- `grounding: CodeReviewGrounding` — Graph or attributed diff evidence.
- `provider: LLMProvider` — Configured independent-review provider.
- `ctx: JudgeContext | undefined` — Existing mode/snapshot context.

**Returns:** `Promise<DimensionResult>` — A dimension result after all required bounded calls and parent adjudications complete.

**Errors:**
- `Error` when Missing, foreign or incomplete parent evidence, or unsupported bounded execution, prevents a completed review.

**Preconditions:**
- Use the immutable snapshot and existing provenance/budget contracts.

**Postconditions:**
- For degraded diff mode compute effectiveLimitChars=min(reviewLimitChars(),384000,provider.inputBudgetChars when defined). Pass this identical value into adapter creation and createJob, so job.plan.limitChars is the authoritative cap.
- All model/gather calls in a degraded diff job use structured execution with optional inputContext:isolated. The driver maps that execution marker and job.plan.limitChars to the shared boundedInput option. Other execution modes preserve defaults.
- Invoke build(snapshot,effectiveLimitChars). Update adherence, conventions, coverage, quality and functional-coverage factories to pass that exact second argument as modelDimensionAdapter's limitChars, instead of taking its independent default. Its duplicate planning, gather note caps and createJob all receive this identical value. The UX/diagram deterministic factories may ignore the additional callback argument because they capture no separate adapter budget; their job still uses the effective cap.
- When called by the prepared runner, consume the identical prepared job/adapter and activated timing context instead of constructing a second job. The compatibility wrapper prepares and executes once for direct callers; it also derives the same per-job budget.
- Before initial prepare, use fitDiffMaterial to make each final diff atom fit the actual complete call; freeze timing counts only after that measured partition. Provider refusal may create a controlled descendant material revision under the unchanged initial timing plan.

### 2.7 `chunkSchema`

```typescript
chunkSchema(spec: ChunkSpec): StructuredSchema
```

**Parameters:**
- `spec: ChunkSpec` — Dimension kind and optional parent-file obligations.

**Returns:** `StructuredSchema` — The existing shape, with required evidence notes for quality chunks that carry fragment-parent obligations.

**Errors:**
- `Error` when Missing, foreign or incomplete parent evidence, or unsupported bounded execution, prevents a completed review.

**Preconditions:**
- Use the immutable snapshot and existing provenance/budget contracts.

**Postconditions:**
- Add an optional diff-parent descriptor list to ChunkSpec. With no fragment parents, existing quality schema and behavior remain unchanged.
- For quality with diff parents, notes name a real parent obligation key and carried fragment atomIds, and state local facts/assumptions that parent adjudication needs; an empty findings array does not excuse missing parent notes.

### 2.8 `validateChunk`

```typescript
validateChunk(spec: ChunkSpec, answer: unknown, call: ReviewCall, material: ReviewMaterial): string[]
```

**Parameters:**
- `spec: ChunkSpec` — Existing dimension and parent-note requirements.
- `answer: unknown` — Untrusted schema-checked model answer; runtime validation is required.
- `call: ReviewCall` — Actual carried fragment IDs.
- `material: ReviewMaterial` — Parent obligations and ownership.

**Returns:** `string[]` — Concrete semantic validation reasons; only valid evidence enters gather.

**Errors:**
- `Error` when Missing, foreign or incomplete parent evidence, or unsupported bounded execution, prevents a completed review.

**Preconditions:**
- Use the immutable snapshot and existing provenance/budget contracts.

**Postconditions:**
- Preserve existing findings/description validation. Require exactly one parent evidence note per carried fragment, with a matching parent key; reject foreign, duplicate, missing or mismatched fragments.
- A chunk may mention contextual neighbours but may not claim to have reviewed fragments it did not carry.

### 2.9 `chunkNotesFrom`

```typescript
chunkNotesFrom(answer: StageAnswer): readonly { key: string; text: string; atomIds: readonly string[] }[]
```

**Parameters:**
- `answer: StageAnswer` — Validated chunk result and carried IDs.

**Returns:** `readonly { key: string; text: string; atomIds: readonly string[] }[]` — Validated keyed parent evidence notes for the existing gather/reduction pipeline.

**Errors:**
- `Error` when Missing, foreign or incomplete parent evidence, or unsupported bounded execution, prevents a completed review.

**Preconditions:**
- Use the immutable snapshot and existing provenance/budget contracts.

**Postconditions:**
- Quality fragment notes use the existing notes extraction path after semantic validation; no note is fabricated for missing output.

### 2.10 `codeReviewGather`

```typescript
codeReviewGather(args: CodeReviewGatherArgs): GatherPlan<DimensionResult>
```

**Parameters:**
- `args: CodeReviewGatherArgs` — Dimension, material, scope, schema, execution and effective limit.

**Returns:** `GatherPlan<DimensionResult>` — Existing bounded gather plan extended with explicit parent-file quality adjudication.

**Errors:**
- `Error` when Missing, foreign or incomplete parent evidence, or unsupported bounded execution, prevents a completed review.

**Preconditions:**
- Use the immutable snapshot and existing provenance/budget contracts.

**Postconditions:**
- For each quality parent check-item, collect every expected fragment note. Validate completed evidence coverage before judging; missing provenance is a failure, never the ordinary NO_EVIDENCE empty-finding success path.
- The parent context contains bounded file/change/coordinate metadata and the parent obligation; it does not reinsert the full file. Judge the file's correctness across notes, including contradictions and dependencies between fragments.
- If notes/context exceed the same cap, use existing reduction stages retaining all departure facts and deterministic source provenance, then judge the parent once. Oversized irreducible required context fails explicitly.
- This path does not depend on calls edges or on non-calls relationCall, which currently returns no checks for diff sibling relations. Sparse sibling links are grouping/context only.

## 3. Data model changes

### 3.1 `ChangedSymbolSummary diff-fragment metadata` — field-add

Add optional fragment provenance for file rows: parentId, part index/count, half-open UTF16 source offsets, original file identity, source/diff line-column coordinates and parent/content digests. Metadata describes original evidence, not a new source entity. One file owns1..N ordered fragments; each fragment belongs to one file. Graph symbol rows and small file rows remain unchanged; coverageEligible remains false for diff evidence. No IPC method or persisted user database schema changes.

**Call sites:**
- `src/workflow/code-review/types.ts:105`
- `src/workflow/code-review/grounding.ts:318`
- `src/workflow/review-pipeline/adapters/code-review-material.ts:30`

### 3.2 `Review-call complete-input accounting` — invariant-change

The same128000-token default estimate covers all supplied messages plus actual schema/envelopes, context, prior notes/history and retry content. Diff jobs cap larger configured budgets at128000; lower budgets remain honored. Job, gather and duplicate planners share the measurement and a final provider dispatch guard. Existing opt-out measurement signatures remain source-compatible only where no schema is supplied; actual review send paths always supply it.

**Call sites:**
- `src/workflow/review-pipeline/envelope.ts:46`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/driver.ts:42`
- `src/workflow/review-pipeline/adapters/code-review-gather.ts`
- `src/workflow/review-pipeline/adapters/code-review-duplicates.ts`

### 3.3 `Bounded structured review transport` — field-add

In src/shared/types.ts add StructuredCompletionOpts.boundedInput?: { readonly maxInputChars:number; readonly contextMode:isolated-structured } | undefined and ProviderCapabilities.boundedStructuredInput?: boolean | undefined. Omitted capability means false; omitted option preserves existing behavior. The code-review driver requires advertised support before dispatch. CliProvider may advertise true only for its enforcing implementation, then verifies installed-CLI isolation support before any model call; unknown/unsupported versions refuse with Error.code=unsupported-bounded-input. ExecutionMode structured calls gain optional inputContext:isolated for persisted intent. Normalize/measure the actual supplied schema/instructions before spawn and reject over-budget input with InputTooLargeError. No resumes, unmeasured project/hooks/tools/history or implicit context growth are admitted. OAuth remains owned by the CLI; no REST provider or global config mutation. Unsupported admission is terminal, not silently ignored or transiently retried.

```
StructuredCompletionOpts + boundedInput?: { maxInputChars:number; contextMode:"isolated-structured" } | undefined; ProviderCapabilities + boundedStructuredInput?:boolean | undefined; ExecutionMode.structured + inputContext?:"isolated" | undefined.
```

**Call sites:**
- `src/shared/types.ts:266`
- `src/shared/types.ts:293`
- `src/workflow/review-pipeline/types.ts`
- `src/workflow/review-pipeline/code-review.ts:251`
- `src/workflow/review-pipeline/driver.ts:42`
- `src/agent/providers/cli-provider.ts:187`

### 3.4 `Quality fragment evidence and parent-file check-item obligations` — invariant-change

Current quality review has no obligations and returns findings/descriptions only. For fragmented diff parents only, add one check-item obligation owning all its fragment IDs and require one keyed evidence note per carried fragment. Parent-to-fragments and parent-to-obligation are1:N and1:1; every fragment note belongs to exactly one parent. Complete validated notes flow through bounded reduction and one parent adjudication; local and parent findings retain original file/line scope. Graph-only quality behavior remains compatible. Same-file adjacency is not correctness adjudication. [c8] [c9]

**Call sites:**
- `src/workflow/review-pipeline/code-review.ts:154`
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts:76`
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts:183`
- `src/workflow/review-pipeline/adapters/code-review-gather.ts:155`

### 3.5 `Authoritative adapter-factory budget propagation` — field-modify

runDimensionJob's build callback becomes (snapshot,effectiveLimitChars)=>ReviewAdapter. Compute the limit once and pass it to both adapter construction and createJob. Five model-dimension call sites forward the second argument to modelDimensionAdapter, so gather/reduction/duplicate budgets do not independently re-read configuration. Existing UX and diagram deterministic factories may ignore the additional argument; they capture no separate budget. Direct rg confirms seven production call sites; the usage graph returned zero callers and is explicitly incomplete. [c14]

```
build: (snapshot:ReviewMaterialSnapshot,effectiveLimitChars:number)=>ReviewAdapter<DimensionResult>
```

**Call sites:**
- `src/workflow/review-pipeline/code-review.ts:251`
- `src/workflow/code-review/dimensions/adherence.ts`
- `src/workflow/code-review/dimensions/conventions.ts`
- `src/workflow/code-review/dimensions/coverage.ts`
- `src/workflow/code-review/dimensions/quality.ts`
- `src/workflow/code-review/dimensions/functional-coverage.ts`

### 3.6 `Explicit fragment-parent chunk/gather selection` — field-add

ReviewAdapter gains optional requiresChunking?:boolean|undefined, default false. The quality adapter sets it only for fragmented diff-parent material. At the first model stage, enterStage tests this flag before accepting the single-call fast path: forced jobs use the normal measured planWithin -> issueChunkCalls route and persist plan.single:false, even when planning produces only one chunk. The existing commit path then performs required parent gather. Do not merely initialize plan.single:false with no planned chunks. Ordinary graph/small-file reviews retain the single-call fast path. [c15]

```
ReviewAdapter + readonly requiresChunking?:boolean|undefined
```

**Call sites:**
- `src/workflow/review-pipeline/types.ts:163`
- `src/workflow/review-pipeline/code-review.ts:154`
- `src/workflow/review-pipeline/job.ts`

### 3.7 `Prepared serial code-review timing plan` — field-add

Add PreparedDimensionReview containing the exact immutable snapshot, adapter and prepared ReviewPipelineJob, plus dimension and primaryChunkCount. JudgeSlot gains prepare(subject,grounding,provider,ctx):PreparedDimensionReview and execute(prepared,provider,ctx):Promise<DimensionResult>; production model slots use this seam. Refactor runDimensionJob into reusable prepareDimensionJob/executeDimensionJob, retaining its wrapper for direct callers. All five model factories share their existing spec and effective-limit callback; never prepare by executing a judge or returning fake empty findings. Prepare every effective dimension serially before the first LLM call, then execute the exact prepared jobs serially. Deterministic UX/diagram slots declare zero model chunks. For each model dimension N=max(1, initial planned primary chunks); a fitting single-call plan counts one. Freeze counts and initial primary IDs before execution. Whole-review chunkCount=sum(N) across effective model dimensions; the all-deterministic case uses an operational minimum of one. budgetMs=600000*chunkCount, with per-dimension breakdown. IDs are dimension-qualified; no double-count of the same job. Validate finite safe positive integer arithmetic. Preparation after admission counts in the root elapsed budget; index freshness admission precedes this clock. Root startedAt is captured before grounding/preparation and root deadline is startedAt+budgetMs after planning. During preparation retain the idle/stall watchdog, then reject if elapsed already exhausts the derived deadline. Planning makes no LLM calls. The immutable source snapshot and initial timing count cannot change at dispatch. Controlled provenance-preserving descendant repartition after refusal is allowed as specified below; it does not change the frozen timing count. [c18] [c19]

**Call sites:**
- `src/workflow/code-review/runner.ts`
- `src/workflow/code-review/types.ts`
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/code-review/dimensions/adherence.ts`
- `src/workflow/code-review/dimensions/conventions.ts`
- `src/workflow/code-review/dimensions/coverage.ts`
- `src/workflow/code-review/dimensions/quality.ts`
- `src/workflow/code-review/dimensions/functional-coverage.ts`
- `src/workflow/code-review/dimensions/ux/index.ts`
- `src/workflow/code-review/dimensions/diagram/index.ts`

### 3.8 `Immutable review deadlines` — field-add

Add ReviewTimingPlan {startedAt,budgetMs,deadlineAt,chunkCount,dimensions:[{dimension,primaryChunkCount,budgetMs}]} to the code-review runtime context/progress; ReviewPipelineJob carries optional timing {primaryChunkCount,budgetMs,startedAt,deadlineAt,rootDeadlineAt}. Activate each serial child when execution starts: childDeadline=min(rootDeadline,childStartedAt+600000*N). Do not start all child clocks at root admission. Freeze root and child deadlines; retries, correction, replacement subchunks, reductions, parent gather and duplicate comparisons never increase N or reset clocks. Extend current withDeadline/nextCalls enforcement to structured as well as reviewer-session calls for these timed code-review jobs, while retaining unrelated design-review semantics. At dispatch use min(existing per-call timeout, child remaining, root remaining); check signals/deadlines before and after calls/stages and immediately before final artifact publication. Late valid output is rejected, never stamped. Abort outstanding CLI/provider work on deadline/cancel using the existing signal path; await owned shutdown before terminal cleanup. Keep idle/stall watchdog separate, reset only on real progress, never on status polls. Remove fixed overall wait ceilings for this timed route: existing 4h total, 20/30min outer caps and CLI constructor limits must not truncate a healthy derived budget. Retain existing shorter per-call and idle limits as explicitly different failure causes; root budget is an upper bound, not a promise to tolerate a hung call. Absolute timestamps and bounded timer slices avoid Node timer overflow; no arbitrary chunk-count ceiling or budget clamp. [c20] [c21]

**Call sites:**
- `src/workflow/review-pipeline/types.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/driver.ts`
- `src/workflow/code-review/runner.ts`
- `src/daemon/code-review-rpc.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/mcp/daemon-stream.ts`

### 3.9 `Resumable code-review wait ownership` — field-add

Extend existing codeReview.run IPC request additively with operation?:start|status|cancel and reviewHandle?:string. Omission preserves legacy streaming behavior; the new step path uses operation:start. Admission resolves scope, source fingerprint and independent reviewer before creating an in-memory daemon-owned operation with opaque unguessable handle, daemon epoch, AbortController, prepared timing plan, progress and eventual outcome. One target/source fingerprint owns at most one active review: repeated start joins it; different source fingerprint for the same active target returns review-conflict instead of competing artifact writers. Operation owns model execution, not a socket/request AbortSignal. Socket/host timeout detaches only the waiter. Explicit cancel aborts the operation and prevents final publication. status/cancel require handle plus matching repo/target; handles carry no source text or credentials. Status is read-only and never reexecutes models or replans. Every control request returns a terminal stream frame within 200 seconds: {status:pending,reviewHandle,progress,timing?} or cached existing final outcome/error. Timing is absent while preparation is incomplete and shown once frozen. insrc_code_review_step keeps phase:start and adds a discriminated pending-review state variant containing the handle/target/epoch; returns next:review_pending,state and guidance to call start with that state. In pending-review state proceed:false means explicit cancellation; in existing freshness state proceed:false retains degraded diff fallback. Update schema/help/guide with this distinction; no session-bound review gate bypass. Poll once per bounded tool turn; no duplicate start on host timeout. Active operation handles are held in the runtime registry independent of the shared one-hour step token TTL/LRU. Pending continuation tokens are pinned/refreshed until operation deadline plus a 10-minute terminal grace; during preparation idle watchdog bounds lifetime. Terminal outcomes are retained for that grace then evicted, active operations are never LRU-evicted. Daemon restart reports lost operation, never completion; new review requires fresh explicit start. Only the existing validated final run writes CR, once, under ownership and signal/deadline checks. No persistent DB or new general workflow runner. [c21] [c22] In src/shared/review-stream.ts retain CodeReviewStreamResult {runId,artifact} for legacy streams, add CodeReviewControlParams as a discriminated union: start carries operation:start plus normal target/grounding fields; status/cancel carry operation and reviewHandle plus matching repo/epicHash/storyId. Extend codeReviewRequestParams to preserve validated operation/reviewHandle rather than reconstructing and dropping them. Add CodeReviewControlResult = {status:pending,reviewHandle,progress,timing?} | {status:done,reviewHandle,result:CodeReviewStreamResult} | {status:failed,reviewHandle,error,reason} | {status:cancelled,reviewHandle}. Add codeReviewControl(params,opts):Promise<CodeReviewControlResult> alongside codeReviewStream in both StepDaemonClient and socket exports; both use the same serializer and discriminate/validate terminal frame data at runtime. The existing legacy codeReviewStream remains final-only. The step switches on status: only done.result enters existing artifact/independent-review validation; pending returns continuation, failed/cancelled report no CR. runReviewStream transport cancel still closes/aborts the request waiter, but the operation-mode handler deliberately detaches this signal from operation execution; legacy stream cancellation stays unchanged. Both transports test the same request/reply fixtures, pending requires no artifact, and malformed done cannot be accepted.

**Call sites:**
- `src/daemon/code-review-rpc.ts`
- `src/daemon/code-review-operations.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/code-review-step/types.ts`
- `src/daemon/steps/code-review-step/state-store.ts`
- `src/daemon/threads/step-state.ts`
- `src/daemon/steps/daemon-client.ts`
- `src/mcp/daemon-stream.ts`
- `src/mcp/server.ts`
- `src/shared/review-stream.ts`
- `src/prompts/steering-block.md`

### 3.10 `Budget-aware diff partition and refusal recovery` — invariant-change

Add fitDiffMaterial(sourceSnapshot,dimensionSpec,effectiveLimitChars,revision):ReviewMaterial in a diff-fragment material helper reused by prepareDimensionJob. The immutable snapshot retains complete parent evidence; each dimension owns a derived material view, never mutates the shared snapshot. Render the real candidate singleton chunk including complete context, parent descriptors, envelope and schema. Starting with <=16Ki staging spans, recursively halve an oversized text range at Unicode-safe boundaries, regenerate full index/count/coordinates/digests and all affected obligations/adjacency, then remeasure. Pack only after every required singleton fits. Measure fixed framing with a minimal nonempty Unicode span: if even that cannot fit, explicitly refuse irreducible context; no recursion without size progress. Initial primary count is frozen only after this fit+packing. On a provider size refusal, the existing atom-only redivide path must intercept a singleton diff fragment: derive a smaller descendant material revision from the SAME original evidence using the refused cap and the same fitting function. Restart only that dimension as a new revision/job with new call IDs, discarding its old model outputs/notes/findings (never combine old and new ownership); abort/await any owned call first. Retain frozen root/child deadlines, original primary count/budget and a replacement-lineage record. All other dimensions retain their prepared source view; execute revisions serially. Descendant IDs include original parent, absolute range and revision digest; every revision still partitions the original text without gaps/overlap. Rebuild stage closures, chunk material, obligations and parent notes consistently; adapters cannot retain stale cached material. The original primary IDs remain audit/timing provenance and map to descendant ranges, not new budget credits. Repeated refusals must strictly reduce offending text range/cap or terminate. No whole-file reread, byte loss, uncontrolled snapshot change, reused invalid notes or deadline extension. Non-diff indivisible atoms retain named AtomTooLargeError. If time expires during replacement, no completed CR. [c23]

**Call sites:**
- `src/workflow/review-pipeline/adapters/diff-fragments.ts`
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/prepare.ts`
- `src/workflow/code-review/grounding.ts`

### 3.11 `Parent-aware diff duplication coverage` — invariant-change

Quality fragment rows represent ranges, not independent symbols. In code-review-duplicates.ts exclude all rows carrying diff-fragment metadata from descriptionsOf/compareStage/pairStage symbol candidates; validate/reject fragment IDs injected into those pair answers. Ordinary graph/small unfragmented symbol comparisons retain existing semantics. Do not create every sibling pair or every fragment-to-foreign-symbol pair. Parent quality adjudication explicitly checks duplication among that parent fragments using all required notes. Add one diff-duplication check-item obligation for the whole fragmented diff scope, owning every diff-fragment ID (and bounded descriptions of nonfragment changed evidence), separate from per-parent obligations. Require keyed duplication facts in each fragment note, preserving source ranges, logical behavior and potential counterpart identifiers even when there is no local finding. The existing obligation gather/reduction mechanism receives all these validated facts and adjudicates cross-parent duplication once with original-file/line provenance; do not simply skip duplication coverage. Bounded reductions retain the complete note-ID/range coverage ledger and both facts needed for a candidate; no raw parent reinsertion. The pipeline may use staged bounded reduction but does not enumerate a Cartesian product of fragment pairs. Missing/foreign notes fail, not NO_EVIDENCE success. Validate counterpart references against the original changed scope. This preserves a diff-only duplication judgment rather than claiming graph symbol coverage. Every replacement revision regenerates both parent and global duplication obligations. DIFF-SCALE covers actual compare and pair execution, not just material adjacency. [c24]

**Call sites:**
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/adapters/code-review-material.ts`
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts`
- `src/workflow/review-pipeline/adapters/code-review-duplicates.ts`
- `src/workflow/review-pipeline/adapters/code-review-gather.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Captured diff is incomplete or truncated before span creation.** (recoverable)
  - Detection: Existing reader truncation/missing-hunk markers or captured byte totals show unavailable evidence.
  - Response: Recover complete per-file evidence through the existing reader where possible; otherwise stop before a completed review and name the affected file/read limit. Never present omitted entries as reviewed.
  - User impact: Review remains pending until evidence can be read completely; no inventory or release-gate changes.
- **Fragment ranges are missing, duplicated, reordered or inconsistent with the captured parent.** (recoverable)
  - Detection: Validate parent digest, part count/order and contiguous half-open offsets; reassembly digest differs from the original.
  - Response: Reject material before model calls; no partial review artifact.
  - User impact: A concrete evidence-integrity error identifies the parent file.
- **Complete call becomes larger than the128K budget after schema, context, history or repair additions.** (recoverable)
  - Detection: The shared measurer and final normalized provider check exceed min(configured limit,384000 characters) for the actual call.
  - Response: Use existing redivision/reduction to create smaller complete calls; if fixed required context/schema itself cannot fit, fail explicitly. Never drop required context, resend unchanged or raise the budget.
  - User impact: More bounded serial calls, or an explicit irreducible-input error with no review stamped.
- **Provider cannot prevent unmeasured session/project/tool context in bounded structured mode.** (recoverable)
  - Detection: The provider lacks a verified isolation capability or cannot normalize/count its supplied instructions/schema before spawn.
  - Response: Refuse that bounded execution mode before the model call; do not claim the128K invariant was enforced.
  - User impact: Select/update a supported CLI adapter; ordinary completions outside this mode retain existing behavior.
- **Cancellation, missing chunk answer or gather validation failure.** (recoverable)
  - Detection: Existing signal/deadline checks or provenance validation notice unfinished required calls/notes. Parent-file gather also compares validated note provenance with the expected fragment set.
  - Response: Preserve existing stop/fail semantics; no fabricated complete verdict and no parallel retry. Missing parent evidence never uses the generic no-evidence-success branch.
  - User impact: Review stays pending with its actual failure cause.
- **Derived review deadline expires, explicit cancellation, or idle/stall failure.** (recoverable)
  - Detection: Injectable monotonic elapsed clock/absolute deadline and existing progress watchdog; distinguish deadline from idle and cancel.
  - Response: Abort owned execution, reject late output and publish no completed CR. Preserve terminal cause for bounded status retrieval; polling cannot reset timers.
  - User impact: Review remains pending with counts, elapsed time and failure cause.
- **Host wait ends, duplicate start, stale handle, restart or changed source during an active review.** (recoverable)
  - Detection: Daemon-owned operation registry validates handle, epoch, target and source fingerprint.
  - Response: Detach waiter without cancelling the review; same source joins, changed source conflicts. Missing/restarted operation is explicitly lost, never a fabricated success. Explicit cancel stops the real operation.
  - User impact: Resume the same review through returned state; start afresh only after terminal/lost state is reported.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Empty diff, binary file or small ordinary text file. | Existing markers and single-file row behavior remain compatible; no invented graph coverage. |
| Pretty/minified JSON, one line far larger than a call, CRLF, emoji and non-ASCII paths. | Unicode-safe span continuation preserves the exact evidence string, coordinates and deterministic ordered IDs; later chunks never treat an isolated fragment as a whole valid JSON document. |
| Added/deleted/renamed files or lines existing only on the old side. | Original old/new paths and coordinates remain attributable; changedFiles is unique and findings stay within the original Story scope. |
| Many fragments in the same file/module. | Sparse sibling connectivity and parent gather avoid new quadratic fragment-pair generation while retaining all fragment notes/provenance. |
| Existing configured review limit above128K or below it. | Diff calls use the lower of configured limit and128K; schema/context reserve consumes that budget rather than increasing it. |
| A final gather or correction contains large prior notes/history. | Existing bounded reduction/gather plans include those actual notes/history in measurement; no hidden accumulated transcript is resumed. |
| Fragmented diff whose complete quality prompt fits one call. | requiresChunking explicitly selects measured chunk mode and parent gather; a single planned chunk is still plan.single:false and must produce parent notes. |
| 1, 5 or 20 initial chunks; retries, split replacement chunks, zero-model dimensions, huge/invalid count or multi-hour review. | 10, 50 or 200 minutes respectively, per-dimension sums explicit. Retry/splits never extend; deterministic slots count zero; invalid/overflow values fail admission and long timers use slices. One fitting primary call counts one. |

**Invariants to preserve**

- Original changed-file scope, independent daemon reviewer and degraded diff result cap stay intact. [[c1]]
- Existing source-symbol identities and eligible graph coverage remain unchanged; fragment rows carry no invented call/test edges. [[c1]]
- Existing serial prepare/review/gather, cancellation and complete failure semantics are reused. [[c3]]
- All supplied input under one128K estimate includes envelopes, schema, explicit context and history; no budget increase is an implementation workaround. [[c2]]
- S003 evidence contents and disabled release state remain unchanged; its earlier foundation/service coverage is not silently cleared. [[c5]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict via Node22/tsx; extend the existing code-review and review-pipeline *.test.ts suites identified in s1. CLI transport isolation uses subprocess fixtures rather than a live model for deterministic limit checks.`

**Test levels**

- **unit** — Prove complete evidence partition and attribution, including a minified line larger than the128K call budget.
  - Subjects: `DIFF-SPANS: added/modified/deleted/renamed text and binary/small-file compatibility; reassembly equals original diff exactly`, `DIFF-COORDS: CRLF, emoji, Unicode and giant-line continuations preserve offsets/old-new source locations and unique changedFiles`, `DIFF-INTEGRITY: duplicate/missing/reordered span and digest mismatches reject before calls`
  - Fixtures: `Deterministic multi-megabyte pretty/minified inventory-style JSON and mixed unified diffs; do not rewrite the real S003 audit data.`
- **contract** — Prove the128K limit covers the entire sent call and all accumulated supplied context/history.
  - Subjects: `DIFF-BUDGET: at/below/above128000×3 with message role separators, call envelope, actual schema, examples, neighbour context and assistant/history content`, `DIFF-REPAIR: added correction/history causes smaller redivision/reduction or an explicit refusal; no oversized call is sent`, `DIFF-TRANSPORT: provider normalization/schema expansion and isolated fresh-call mode are measured; unmeasured project/tool/session additions are disabled or refused`, `DIFF-ADMISSION: absent/false boundedStructuredInput support yields zero completion calls; declared support receives the exact shared boundedInput shape and authoritative job.plan.limitChars for all chunk/gather/repair requests.`
  - Fixtures: `Independent captured stdin/schema and invocation-argument assertions for configured CLI adapters; include sentinel project/history inputs and a no-child-spawn oversized control.`
- **integration** — Exercise existing prepare/review/gather across every fragment and final bounded call.
  - Subjects: `DIFF-LARGE: S003-sized inventory evidence produces multiple serial review calls under384000 complete-input characters; every source span is carried by a completed chunk`, `DIFF-GATHER: gather combines findings and provenance across parent-file fragments; no fragment omitted, out-of-scope finding promoted, or graph coverage invented`, `DIFF-SCALE: many fragments retain sparse sibling connectivity and avoid new quadratic material construction`, `DIFF-COMPAT: source-symbol and small-file review parity, cancellation, retries, gather/reduction, duplicate comparisons, and lower configured budgets remain supported`, `DIFF-PARENT-QUALITY: no chunk emits a local finding; a parent correctness finding is produced only when gather receives facts from two separate fragments. Reject missing/foreign/duplicate parent notes and prove reduction preserves both facts and provenance.`, `DIFF-READER: through DiffGroundingDeps/git-diff reader, recover truncated per-file input completely or refuse unrecoverable truncation/missing hunks before any model call or completed artifact. Replace the legacy tests that explicitly allow truncated bounded-slice reviews.`, `DIFF-FACTORY-LIMIT: for each of the five model-dimension factories, a provider cap below configured review size reaches adapter reduction/duplicate budgets, createJob.plan.limitChars and every boundedInput.maxInputChars unchanged. Cover the two deterministic callers without introducing a separate budget.`, `DIFF-FITS-ONE-CALL: a file larger than16Ki with complete prompt below128K still forces quality chunk mode, validates one note per fragment and executes parent gather. Ordinary non-fragment input remains single-call compatible.`
  - Fixtures: `Scripted structured model records actual complete calls and emits bounded valid chunk/gather answers; no fake PASS from missing evidence.`
- **smoke** — Demonstrate the filed reproduction is unblocked at the original default budget on the approved built runtime.
  - Subjects: `DIFF-S003-RETRY: rebuild under Node22 then run the actual independent daemon diff review for484fcef7efaf229e/s3 with128000-token setting; record actual verdict/degraded mode and any remaining errors`
  - Fixtures: `Existing S003 approved contract/build/evidence. No automatic user-daemon restart, release enablement, evidence deletion or override approval; report runtime reload needs honestly.`
- **integration** — Prove chunk-derived deadlines and resumable ownership using fake clocks and scripted providers, without wall-clock waits.
  - Subjects: `DIFF-TIME-PLAN: 1/5/20 primary chunks yield 600000/3000000/12000000ms; five model dimensions aggregate correctly, deterministic slots count zero, fitting single-call counts one; all prepared before first completion and execution uses identical job IDs/snapshot/caps.`, `DIFF-TIME-FIXED: root includes grounding/preparation, later serial child receives its own allowance capped by root remaining; repair/retry/gather/duplicates/redivision never extend either clock; structured and reviewer-session dispatch receive min(per-call,remaining); late output produces no CR.`, `DIFF-TIME-OUTER: healthy >20/30min and >4h derived jobs survive outer waiting caps under fake time; idle/stall and explicit cancel still abort owned execution; integer overflow/invalid counts and timer overflow handled safely.`, `DIFF-WAIT-RESUME: >300s review returns pending within200s and repeated status/resume/start joins one execution; disconnect does not cancel, explicit cancel does, stale/lost handle never succeeds; changed source conflicts, active state survives1h TTL/LRU, terminal grace cleans up and exactly one valid CR is written.`, `DIFF-WAIT-COMPAT: legacy stream without operation, freshness proceed:false diff fallback, pending proceed:false cancellation, session refusal, target authorization and independent-review routing remain intact.`
  - Fixtures: `Injectable clocks/timers, captured provider timeout/signal assertions, real IPC transport with scripted long operation and shared state-store lifecycle fixtures. No real long sleeps or fabricated reviewer verdicts.`
- **integration** — Regress the three blocking findings from timing-cycle round2.
  - Subjects: `DIFF-LOW-CAP: 16384-character staging span with effective12000 complete-input cap and fitting fixed context is subdivided before preparation; every call fits, reconstruction exact, initial N reflects final fitted primary plan. A fixed-context-too-large control refuses without calls.`, `DIFF-REFUSAL-SPAN: singleton provider size refusal creates smaller descendant revision, discards old dimension outputs/notes and rebuilds all obligations/closures, then completes all original bytes; original timing N/deadlines unchanged. Repeated no-progress refusal and exhausted time fail with no CR. Include emoji boundaries and cross-fragment correctness regression after repartition.`, `DIFF-SCALE-DUPLICATES: drive actual quality compare/pair/gather for hundreds of fragments: no fragment IDs enter symbol pair comparisons and no quadratic fragment candidates/calls are generated. Existing graph symbol pair behavior preserved. Within-parent and cross-parent duplication only detectable from separate notes is found with correct provenance, including fragmented versus nonfragment evidence.`, `DIFF-WAIT-TRANSPORT: both shared serializer and real socket/in-daemon clients carry start/status/cancel+handle unchanged; pending has no artifact, done.result preserves existing validation, failed/cancelled/malformed variants cannot stamp; waiter timeout detaches and explicit cancel stops the one operation.`
  - Fixtures: `Real pipeline/adapter stage fixtures plus shared serializer, socket and in-daemon scripted transport fixtures, fake timers, small provider cap and scripted refusal.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `DIFF-SPANS`, `DIFF-COORDS`, `DIFF-INTEGRITY`, `DIFF-READER` |
| `ac2` | `DIFF-BUDGET`, `DIFF-REPAIR`, `DIFF-TRANSPORT`, `DIFF-ADMISSION`, `DIFF-FACTORY-LIMIT`, `DIFF-LOW-CAP`, `DIFF-REFUSAL-SPAN` |
| `ac3` | `DIFF-LARGE`, `DIFF-GATHER`, `DIFF-SCALE`, `DIFF-PARENT-QUALITY`, `DIFF-FITS-ONE-CALL`, `DIFF-SCALE-DUPLICATES` |
| `ac4` | `DIFF-COMPAT` |
| `ac5` | `DIFF-S003-RETRY` |
| `ac6` | `DIFF-TIME-PLAN`, `DIFF-TIME-FIXED`, `DIFF-TIME-OUTER`, `DIFF-WAIT-RESUME`, `DIFF-WAIT-COMPAT`, `DIFF-WAIT-TRANSPORT` |

## 7. Migration

**State before:** s1 locates buildDiffSymbols emitting a file-level review summary, codeReviewMaterial turning each row into an indivisible atom, and the existing serial planChunks/runReviewJob pipeline. promptChars callers span job, gather and duplicate planning. The filed S003 reproduction exceeds the current per-call budget before a review is recorded; the original128000 setting has been restored.

**State after:** Fresh diff-review jobs hold complete ordered evidence spans and use the existing bounded serial chunk/gather pipeline. Complete calls include their schema and all supplied context/history under at most128000 estimated tokens. Existing public IPC method names, source-symbol reviews, provider OAuth ownership, S003 historical evidence and disabled release state are preserved. The code-review time budget is 10 minutes per initially planned primary model-review chunk, aggregated across serial dimensions. Retries, repairs, redivision and gather consume that fixed allowance; bounded status waits resume the same daemon-owned operation.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add optional diff-fragment provenance and normalize captured large text into complete ordered source spans; preserve small/binary behavior and deduplicate original changed files. — ↩ rollbackable
2. Integrate span material, sparse sibling relationships and provenance-aware gather into the existing adapters; start new review jobs rather than resuming an old oversized pending call. — ↩ rollbackable
3. Apply common complete-call accounting to planning, correction/redivision, gather and final dispatch. Add bounded isolated structured-completion capability with safe defaults for unrelated callers; no global budget/config change. — ↩ rollbackable
4. Add preparation/execution seam, freeze per-dimension/aggregate timing, enforce deadlines across both execution modes, then add daemon-owned bounded start/status/cancel waits and token lifecycle. Update code-review tool schema/help and canonical shipped guide to teach same-state continuation. Runtime activation follows normal approval; design-artifact review timing is outside this change. — ↩ rollbackable
5. Run only relevant tests during implementation, then one combined Node22 build and focused review/provider regression sweep. Where existing production-source audit checks require refreshed hashes/classifications for changed review code, update only reviewed source metadata under this fix; retain S003's original measurements and pending proofs. Do not compact/delete/split the audit datasets as a workaround. — ↩ rollbackable
6. After approved runtime activation is available, retry the actual S003 independent diff review at128000. Do not restart an in-use daemon automatically; retain any runtime-activation or review error as pending evidence. — ↩ rollbackable

**Backward compat:** Internal additive metadata/options only. Rows without fragment provenance retain legacy semantics, and graph-based source-symbol identities and existing review result shapes remain compatible. No new IPC method or persistent domain schema. Existing codeReview.run gains optional operation/handle fields and control-frame responses for opted-in clients; absent operation retains legacy streaming. Existing step phases stay unchanged; pending-review next/state is additive and its cancellation semantics are documented. Existing pending jobs with old whole-file snapshots are restarted as new jobs; no in-place job rewrite or fabricated continuation. Non-review CLI completions retain defaults; bounded diff calls fail explicitly if isolation cannot be enforced.

## 8. Alternatives considered

### 8.1 a1: Attributable diff spans in the existing chunk pipeline — **CHOSEN**

Represent file diffs as ordered bounded source spans, then reuse existing chunk review and gather with complete-call size checks.

Keep one parent file identity and add complete ordered diff-span metadata to its review rows. Plain text, JSON, additions and removals use the same evidence contract; no file must be a single indivisible atom. Every span retains original evidence and source coordinates, and file-level gather judges across span notes. All context and carried history enter explicitly constructed, freshly measured calls under the128K budget; no ambient conversational transcript is carried. Existing source-symbol graph reviews and independent reviewer selection remain intact.

### 8.2 a2: JSON entry review units with a generic diff fallback

Give JSON object/array entries explicit semantic units and use source spans for non-JSON or oversized values.

Model JSON parent containers and entry identities explicitly, with source coordinates and before/after evidence; review entries independently and gather at the parent. Other diff text and oversized scalar values require the generic bounded-span contract as a fallback. Both paths measure complete rendered calls including schema, context, notes and correction/history under128K, and retain independent degraded review.

**Rejected because:** Also meets the constraints but adds a JSON-specific data model while still requiring generic spans for minified giant values; more implementation and compatibility risk without additional requested capability.

## 9. References

- **[[c1]]** `code` `src/workflow/code-review/grounding.ts:266-338` — "assembleDiffCodeReviewGrounding builds ChangedSymbolSummary rows through buildDiffSymbols; current diff rows are file evidence rather than graph symbols."
- **[[c2]]** `code` `src/workflow/review-pipeline/envelope.ts:44-53` — "promptChars measures the serialized supplied messages; complete-call accounting must also cover the actual supplied schema and later context."
- **[[c3]]** `code` `src/workflow/review-pipeline/driver.ts:42-98` — "runReviewJob drives calls serially with cancellation, explicit execution modes and pipeline-owned retries."
- **[[c4]]** `code` `src/workflow/review-pipeline/adapters/code-review-material.ts:30-85` — "Each grounding row becomes an atom with file/module ownership and relations; duplicate entity IDs are rejected."
- **[[c5]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E202610265384820a/ISSUE.md`
- **[[c6]]** `stakeholder` `User instruction 2026-10-27` — "128K chunk limit including any added context/history; use the already filed bug."
- **[[c7]]** `doc` `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/HLD.md:27` — "Prepare uses review.chunkTokens with the default128000-token limit and fixed3characters/token estimate."
- **[[c8]]** `code` `src/workflow/review-pipeline/adapters/code-review-chunk.ts:76-218` — "Quality currently has findings/descriptions; chunkNotesFrom extracts only an optional notes array."
- **[[c9]]** `code` `src/workflow/review-pipeline/adapters/code-review-gather.ts:155-254` — "Existing obligation/reduction calls can be reused; non-calls sibling relations are not currently adjudicated."
- **[[c10]]** `code` `src/shared/types.ts:266-345` — "ProviderCapabilities and StructuredCompletionOpts are the existing shared support/option declaration sites."
- **[[c11]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/design-review-round1.json`
- **[[c12]]** `code` `src/workflow/code-review/__tests__/diff-grounding.test.ts` — "Legacy tests currently allow a truncated diff to proceed; this intentional behavior change requires explicit recovery/refusal regressions."
- **[[c13]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/sequence-render-round2.json` — "Actual headless-browser render and inspected screenshot for the generated companion; control interactions not claimed."
- **[[c14]]** `code` `src/workflow/review-pipeline/code-review.ts:251-264` — "Current build(snapshot) callback has no limit argument; direct source lookup identifies five model and two deterministic dimension callers."
- **[[c15]]** `code` `src/workflow/review-pipeline/job.ts:108-131` — "enterStage currently accepts singleCalls when they fit; fragmented parent obligations need an explicit force-chunk selection contract."
- **[[c16]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/design-review-round2.json`
- **[[c17]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/sequence-render-round3.json` — "Current companion render evidence after canonical third-round regeneration."
- **[[c18]]** `stakeholder` `User instruction 2026-10-27` — "The time budget should be 10 minutes times number of chunks; fresh review cycle explicitly authorized."
- **[[c19]]** `code` `src/workflow/code-review/runner.ts:172-242` — "Current runner constructs one snapshot then invokes judge slots serially; preparation/execution separation is an explicit addition."
- **[[c20]]** `code` `src/workflow/review-pipeline/job.ts` — "Current withDeadline/nextCalls applies only to reviewer-session pending calls; structured deadline enforcement must be added."
- **[[c21]]** `code` `src/daemon/steps/code-review-step/handler.ts:733-746` — "Current defaults distinguish four-hour total wait from twenty-minute idle wait. Derived code-review timing replaces fixed total ceiling, not idle detection."
- **[[c22]]** `code` `src/daemon/steps/code-review-step/state-store.ts` — "Opaque code-review state currently uses shared TTL/LRU. New active operation ownership and pinning must explicitly outlive one-hour idle token expiry."
- **[[c23]]** `code` `src/workflow/review-pipeline/prepare.ts` — "planChunks rejects an oversized singleton atom; current job.redivide repacks atom IDs and cannot subdivide a diff range."
- **[[c24]]** `code` `src/workflow/review-pipeline/adapters/code-review-duplicates.ts` — "compareStage selects later-chunk descriptions without parent filtering and compareCalls forms every pair of batches; sparse material relations alone do not bound this work."
- **[[c25]]** `code` `src/shared/review-stream.ts` — "codeReviewRequestParams currently reconstructs only legacy fields, and CodeReviewStreamResult requires runId/artifact; new control variants must be explicit in both transports."
- **[[c26]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence/design-review-timing-cycle1-round2.json`
