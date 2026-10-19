<!-- insrc:artifact HLD-8315a11f29fd2812 -->

# HLD: chunked-review-pipeline-every-review

## Summary

Every review runs through one shared review pipeline: prepare measures the review's material and, when it is over the chunk limit, groups it into coherent chunks; review sends one identified model call per chunk, one after another; gather turns the answers into the review's one result. Each review kind plugs in through an adapter that supplies its material, how that material relates, today's prompts, and how a divided review is gathered. A review under the limit is one chunk carrying exactly today's prompt, so its result is exactly today's.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Problem context

> See **DEF-8315a11f29fd2812** § 1. Problem

## 2. Framework summary

A new shared module, the review pipeline (proposed at src/workflow/review-pipeline), owns the three stages for every review. It is a serialisable job: the daemon drives it to the end; the controller is handed its calls one frame at a time and answers them by call identifier. Prepare measures material at 3 characters per token against review.chunkTokens (default 128,000 tokens); at or under the limit it emits one chunk whose prompt is the adapter's current single-call prompt, otherwise it groups the adapter's atoms by the adapter's relations and packs whole groups into chunks that each fit, adding a short summary of each related atom held in another chunk. Review issues one call per chunk serially; every call carries a fresh UUID that the answer must echo inside an envelope, an answer whose identifier is missing or wrong is rejected and retried under a new UUID, and a size refusal re-divides the chunk instead of resending it. Gather passes a single chunk's answer through unchanged and otherwise applies the adapter's gather rules (keyed obligations judged on all chunks' evidence, cross-chunk relationships, cross-chunk duplicates), each gather call itself bounded by the chunk limit. ISSUE-aef82b03's delivered InputTooLargeError, LLMProvider.inputBudgetChars, packIntoBatches and ReviewJob loop are moved under the pipeline as its core. A review kind is a series of stages, each a model stage or a deterministic one, preserving today's execution exactly: code review runs one stage per dimension exactly as today on each path: on the daemon, adherence (no call at all when there is neither an approved LLD nor an approved plan), conventions, coverage, quality and functional coverage are model calls, ux is deterministic and provider-free, and diagram keeps its registered handlers (some deterministic, such as the component handler) with today's per-handler isolation, a failing handler still recorded as a LOW observation; on the controller path the ux and diagram prompts are offered to the controller as today; HLD/LLD template review is one reviewer-session stage; DEF/plan premise review is extract (model), probe (deterministic) and verify, where the daemon path verifies one premise per call and the controller path verifies every premise in one batched call, as each does today; an adapter therefore declares its stage plan per path (daemon or controller). A review under the limit therefore makes exactly today's calls in today's order. Each call names its execution mode: a structured call run in the repository as its working directory (as today's code-review judges pass subject.repoPath; for the premise review's verify calls, which pass no working directory today, this is an additive change), each with its own per-call time limit where it has one today (the premise verify call keeps its 3-minute VERIFY_CALL_TIMEOUT_MS from ISSUE-d4b2cd1c), or a read-only reviewer session with the repository as working directory, the review's remaining deadline and its cancellation signal. Ollama gains a reviewer session through a generic read-only tool loop extracted from the analyzer's runShaperToolLoop, taking caller-supplied messages, answer schema, deadline, signal and retry policy, while the analyzer keeps its own wrapper unchanged. The pipeline owns every retry of a review call: every provider is called with internalRetry: false (CliProvider's transient retry and reviewer-session retry, and both providers' structured-output retry, make exactly one attempt), and the pipeline re-issues a transient failure, a stall, an invalid answer or an identifier mismatch once, under a new UUID: two attempts in all per call. Failure policy is per stage: a cancelled review always ends at once; a premise-review verify call that fails both attempts records that premise as not judged (MED, never a pass) and keeps the rest, as ISSUE-d4b2cd1c delivered; a diagram handler failure stays a LOW observation, as today; any other failed call (premise extraction included) fails the review and records nothing, as today. Gather is bounded at every step: an obligation's evidence (notes from every chunk, each keyed by the obligation and carrying the atom ids it stands for) is packed into the final adjudication call when it fits the limit; when it does not, it is reduced level by level, each reduction call reading one batch of that key's evidence and returning one note of at most a quarter of the limit under the same key, the job keeping which atoms and earlier notes each note stands for, until the key's evidence fits one adjudication call; a gather call refused for its size is re-planned like a chunk. Scope of the identifier and limit rules (stakeholder decision 2026-10-19 [[c14]]): they apply to every request the pipeline sends. A reviewer session's internal tool turns belong to the session, as they already do inside the claude and codex CLIs, where insrc cannot see them; the Ollama session's tool loop is likewise not identified or measured per turn. Every call records which material it carries (its chunk, atom ids and evidence-note ids), and the job keeps an immutable snapshot of the review's material taken once at prepare: for code review, today's grounding snapshot (the controller step already saves subject and grounding) plus every fact a deterministic stage reads from disk today, recorded at prepare (the ux stage's companion-mock existence checks); for design review, the document text and, for the premise review, the extracted claims and their gathered evidence. The adapter is rebuilt on every turn from the saved subject plus that snapshot and never re-queries the code graph or the files, so a refused call is re-divided from exactly the material it carried and a controller review resumes on the same material. A controller reports a call it could not complete as a failure outcome keyed by the call's identifier (size refusal with the reported limit, stall, transient error), which the driver handles exactly as a daemon-side failure: a size refusal re-divides the call, the others are re-issued once under a new identifier.

## 3. Architecture shape

Two layers. The pipeline core (s1) is review-kind-agnostic: measurement, chunk planning over atoms and relations, the call envelope with identifiers, the serial driver with refusal re-division and identifier retries, the serialisable job state, and the single-chunk pass-through gather. Review-kind adapters sit above it: the code-review adapter (atoms = changed-symbol summaries with call, file and module relations; obligations = approved clauses, FRs, promised tests, module conventions; s2 supplies its chunking relations and neighbour summaries, s3 its gather) wraps today's seven dimension judges; the design-review adapter (s4; atoms = document sections with cross-reference relations) wraps today's template review (HLD/LLD) and premise review (DEF/plan). The existing entry points keep their signatures: runCodeReview, runReview / runTemplateReview, and the two controller steps call the pipeline instead of calling the provider or emitting their single frame directly. The controller protocol (s5) is one shared frame shape used by both controller steps for every new controller review, one chunk or many, so every controller answer carries its call identifier; a review under the limit is offered today's prompts, one identified call each, and only a state saved before the change resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames.

## 4. Shared contracts

### 4.1 sc1: ReviewMaterial

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** What an adapter hands the pipeline to prepare: whole indivisible atoms, the relations between them, and the obligations a gather must judge.

**Interface sketch (type-level):**

```
interface ReviewAtom { readonly id: string; readonly label: string; readonly text: string; readonly file?: string | undefined; readonly module?: string | undefined; }
interface ReviewRelation { readonly from: string; readonly to: string; readonly kind: 'calls' | 'same-file' | 'same-module' | 'references'; }
interface ReviewObligation { readonly key: string; readonly kind: 'clause' | 'requirement' | 'promised-test' | 'module-conventions' | 'check-item'; readonly text: string; readonly atomIds?: readonly string[] | undefined; }
interface ReviewMaterial { readonly atoms: readonly ReviewAtom[]; readonly relations: readonly ReviewRelation[]; readonly obligations: readonly ReviewObligation[]; readonly context?: readonly ReviewAtom[] | undefined; }
```

**Assumptions cited:** [[c7]]

### 4.2 sc2: ReviewAdapter

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** How a review kind plugs into the pipeline: its material, its ordered stages (model or deterministic) with each stage's own failure policy, each stage's calls for the whole review and for one chunk, and the gather rules for a divided review.

**Interface sketch (type-level):**

```
interface ChunkPrompt { readonly messages: readonly LLMMessage[]; readonly schema: StructuredSchema; readonly execution: ExecutionMode; }
type ExecutionMode =
  | { readonly mode: 'structured'; readonly cwd?: string | undefined; readonly timeoutMs?: number | undefined }
  | { readonly mode: 'reviewer-session'; readonly cwd: string; readonly deadlineMs: number; readonly tools: 'read-only' };
type StageOutputs = Readonly<Record<string, unknown>>;
interface AdapterStage {
  readonly id: string;
  readonly kind: 'model' | 'deterministic';
  readonly after: readonly string[];
  singleCalls(prior: StageOutputs): readonly ChunkPrompt[];
  chunkCalls(chunk: ReviewChunk, prior: StageOutputs): readonly ChunkPrompt[];
  run?(prior: StageOutputs): Promise<unknown>;
  readonly onCallFailure: 'fail-review' | 'record-not-judged' | 'record-observation';
}
interface ReviewAdapter<R> {
  readonly kind: 'code-review' | 'design-review';
  readonly dimension: string;
  material(): ReviewMaterial;
  stagesFor(path: 'daemon' | 'controller'): readonly AdapterStage[];
  finish(outputs: StageOutputs): R;
  readonly gather: GatherPlan<R>;
}
interface EvidenceNote { readonly noteId: string; readonly key: string; readonly text: string; readonly atomIds: readonly string[]; }
interface GatherPlan<R> {
  readonly obligationCall: (key: string, evidence: readonly EvidenceNote[]) => ChunkPrompt;
  readonly reduceCall: (key: string, batch: readonly EvidenceNote[]) => ChunkPrompt; // answer: one EvidenceNote under the same key
  readonly noteCapChars: number; // a quarter of the limit
  readonly relationCall?: ((pair: readonly [ReviewAtom, ReviewAtom]) => ChunkPrompt) | undefined;
  readonly merge: (parts: readonly R[]) => R;
}
```

**Assumptions cited:** [[c9]]

### 4.3 sc3: ReviewChunk and ChunkPlan

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The output of prepare: the chunks a review is read in, each within the limit, with summaries of related atoms held elsewhere.

**Interface sketch (type-level):**

```
interface NeighbourSummary { readonly atomId: string; readonly label: string; readonly summary: string; readonly heldInChunk: string; }
interface ReviewChunk { readonly id: string; readonly atomIds: readonly string[]; readonly neighbours: readonly NeighbourSummary[]; readonly chars: number; }
interface ChunkPlan { readonly limitChars: number; readonly single: boolean; readonly chunks: readonly ReviewChunk[]; readonly crossRelations: readonly ReviewRelation[]; }
```

**Assumptions cited:** [[c4]]

### 4.4 sc4: CallEnvelope

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** Every model call of every review carries a fresh identifier the answer must echo, and every retry is the pipeline's own re-issue under a new identifier; one rule for daemon and controller. The rule covers every request the pipeline sends; a reviewer session's internal tool turns are the session's own.

**Interface sketch (type-level):**

```
interface ReviewCall { readonly callId: string; readonly attempt: number; readonly stage: string; readonly role: 'single' | 'chunk' | 'reduce' | 'obligation' | 'relation' | 'merge'; readonly messages: readonly LLMMessage[]; readonly schema: StructuredSchema; readonly execution: ExecutionMode; readonly chars: number; readonly carries: { readonly chunkId?: string | undefined; readonly atomIds: readonly string[]; readonly noteIds: readonly string[]; readonly key?: string | undefined }; }
interface EnvelopedAnswer { readonly callId: string; readonly answer: unknown; }
// schema sent to the model: { type: 'object', required: ['callId', 'answer'], properties: { callId: { const: <callId> }, answer: <adapter schema> } }
// provider options the pipeline sets on every call (additive, optional):
interface StructuredCompletionOpts { readonly internalRetry?: boolean | undefined; /* false: the provider makes exactly one attempt */ }
interface ReviewSessionOpts { readonly internalRetry?: boolean | undefined; readonly signal?: AbortSignal | undefined; }
interface LLMProvider { runReviewSession?<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T>; }
```

**Assumptions cited:** [[c3]]

### 4.5 sc5: ReviewPipelineJob

**Owner Story:** `s1`
**Consumed by:** `s3`, `s4`, `s5`

**Purpose:** The serialisable state of one review's pipeline run, driven to the end by the daemon or one frame at a time by the controller.

**Interface sketch (type-level):**

```
interface ReviewPipelineJob { readonly reviewId: string; readonly path: 'daemon' | 'controller'; readonly snapshot: ReviewMaterialSnapshot; readonly kind: 'code-review' | 'design-review'; readonly dimension: string; readonly phase: 'prepare' | 'review' | 'reduce' | 'gather' | 'done'; readonly plan: ChunkPlan; readonly stage: string; readonly outputs: StageOutputs; readonly pending: readonly ReviewCall[]; readonly answered: readonly { readonly callId: string; readonly stage: string; readonly answer: unknown }[]; readonly notes: readonly EvidenceNote[]; readonly noteProvenance: Readonly<Record<string, readonly string[]>>; readonly notJudged: readonly { readonly stage: string; readonly key: string; readonly cause: string }[]; readonly issuedHashes: readonly string[]; }
// taken once at prepare, never re-queried: code review = the saved grounding; design review = the document text, and for the premise review its claims and gathered evidence
interface ReviewMaterialSnapshot { readonly kind: 'code-review' | 'design-review'; readonly grounding?: unknown; readonly fileFacts?: Readonly<Record<string, { readonly exists: boolean }>> | undefined; readonly documentText?: string | undefined; readonly claims?: readonly unknown[] | undefined; readonly evidence?: readonly unknown[] | undefined; }
// runtime state, never serialised: the AbortSignal; the adapter is rebuilt from the review's subject on every turn
interface ReviewPipelineDriver { nextCalls(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): readonly ReviewCall[]; applyAnswer(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, answer: EnvelopedAnswer): ReviewPipelineJob; applyFailure(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, callId: string, cause: 'size-refusal' | 'transient' | 'stall' | 'identifier-mismatch' | 'invalid-answer', maxChars?: number | undefined): ReviewPipelineJob; result<R>(job: ReviewPipelineJob): R; }
// additive, optional record fields under a NEW name, absent when a review was one chunk:
// DimensionResult.pipelineCalls?: { chunk: number; obligation: number; relation: number; merge: number }
// ReviewReport.pipelineCalls?: the same shape.
// The existing DimensionResult.parts ({ map, reduce, compare }) is left as it is and is no longer written.
```

**Assumptions cited:** [[c9]]

### 4.6 sc6: Chunk limit setting

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** One limit for every provider and every review kind.

**Interface sketch (type-level):**

```
// config catalog entry
{ path: 'review.chunkTokens', type: 'number', default: 128000 }
// fixed conversion
const REVIEW_CHARS_PER_TOKEN = 3; // limitChars = review.chunkTokens * REVIEW_CHARS_PER_TOKEN = 384000
```

**Assumptions cited:** [[c4]] [[c3]]

### 4.7 sc7: Controller call frames

**Owner Story:** `s5`

**Purpose:** The one frame shape both controller steps use for every new controller review, one chunk or many: the review's calls, each with its identifier, and the controller's answers matched by call identifier. Only a controller state saved before the change resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames.

**Interface sketch (type-level):**

```
interface EmitCallsFrame { readonly next: 'emit_calls'; readonly calls: readonly ReviewCall[]; readonly state: string; }
interface CallFailure { readonly callId: string; readonly failure: { readonly cause: 'size-refusal' | 'stall' | 'transient'; readonly maxChars?: number | undefined; readonly detail?: string | undefined } }
interface AnswersInput { readonly phase: 'answers'; readonly answers: readonly (EnvelopedAnswer | CallFailure)[]; readonly state: string; }
// a CallFailure maps to ReviewPipelineDriver.applyFailure(job, adapter, callId, cause, maxChars)
// a new controller review under the limit gets the same prompts as today, one ReviewCall per today's prompt, each enveloped
```

## 5. Story boundaries

### 5.1 Story E202610198315a11f:S001

**Owns:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

The pipeline module itself: measurement, the generic grouping that packs related atoms together within the limit, staged execution with deterministic stages, the envelope schema wrapping, identifier generation and checking, the pipeline-owned retry policy (providers called with internalRetry: false; one re-issue under a new UUID, two attempts in all), per-stage failure policies, refusal re-division, the serial daemon driver, single-chunk pass-through, the bounded gather machinery (evidence notes keyed by obligation, level-by-level reduction under a note cap, provenance kept in the job, refused gather calls re-planned), and the adoption of ISSUE-aef82b03's InputTooLargeError, inputBudgetChars, packIntoBatches and ReviewJob loop. Change sites beyond the new module: CliProvider (internalRetry honoured by withTransientRetry, runReviewSession and its structured-output retry; a size refusal in the claude reviewer-session error envelope and the codex session classified as InputTooLargeError, as completeStructured already does), OllamaProvider (internalRetry: false maps completeStructured to one attempt; a read-only reviewer session over a generic tool loop extracted from runShaperToolLoop in src/analyze/context/driver.ts, the analyzer keeping its own wrapper), and the single-chunk adapters for both review kinds, so every review takes the pipeline path from s1 on with today's calls and working directory (structured calls run in the repository, as today for code review; the premise review's verify calls gain it as an additive change): one model stage per model-judged code-review dimension, adherence making no call without an approved LLD or plan, ux deterministic on the daemon and diagram's handlers as today (deterministic ones stay deterministic, a failing handler stays a LOW observation); one reviewer session for HLD/LLD; extract, probe, then one verify per premise for DEF/plan, with ISSUE-d4b2cd1c's not-judged recording kept. Tests: S001/ac1 an under-limit code review, template review and premise review each make today's calls and give today's result (recorded fixtures), the diagram dimension included; ac2 a missing or wrong identifier is retried once under a new UUID and no prompt hash repeats, including transient errors, stalls and invalid answers on both CliProvider and OllamaProvider; premise extraction failing fails the review while a verify call failing twice records the premise as not judged; ac3 the default limit is 384,000 characters for every provider; ac4 a size refusal from completeStructured, the claude session envelope and the codex session re-divides the call and never resends it; ac5 a review on an Ollama provider completes through both execution modes; plus a live probe of the envelope schema on claude and codex. Also tested: an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits, and the final verdict keeps every atom's provenance; every structured review call runs in the repository working directory. Also tested: a premise verify call keeps its 3-minute limit through the pipeline; a refused call is re-divided from exactly the atoms and notes it carried; the controller premise review under the limit still sends one batched verify prompt. Also tested: refusal re-planning reads only the job's material snapshot, never the graph or files, so a reindex between turns cannot change the material a call is re-divided from. The ux stage reads companion-mock existence from the snapshot's file facts recorded at prepare, not from disk; tested: adding or removing a mock after prepare does not change the review result.

### 5.2 Story E202610198315a11f:S002

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`

The code-review adapter's material: changed-symbol atoms, call relations from the grounding's callers and callees among changed symbols, file and module relations, and how neighbour summaries are written for a changed symbol held in another chunk. Tests: S002/ac1 related changed symbols land in the same chunk before file and module grouping; ac2 a call relation cut between chunks yields a neighbour summary on both sides; ac3 every changed symbol appears whole in some chunk and one over the limit is named, never cut.

### 5.3 Story E202610198315a11f:S003

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

The code-review adapter's gather: per-dimension chunk prompts, obligation keys and their adjudication over all chunks' evidence, the cross-chunk relationship check, the cross-chunk duplicate comparison for quality, and the fold into today's DimensionResult and verdict. It also owns the acceptance smoke: Epic c2ba6fa6 Story s1's code review runs on the installed daemon, completes and records a verdict, with the chunk plan and calls per stage written to the smoke record. Tests: S003/ac1 a divided review and the same material reviewed in one call under a raised limit give the same obligation verdicts on fixtures that fit both ways; ac2 a mismatch between related functions in different chunks is reported; ac3 a cross-chunk duplicate is reported; ac4 the installed-daemon smoke above.

### 5.4 Story E202610198315a11f:S004

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

The design-review adapter: document sections as atoms, cross-reference relations, section summaries for neighbours, chunk prompts for the template checklist and the premise pipeline, and the gather of checklist answers or premise verdicts into today's ReviewReport and verdict rules. Tests: S004/ac1 every section appears whole in some chunk with the sections it references; ac2 a cross-chunk reference yields a section summary; ac3 a divided HLD/LLD review and a divided DEF/plan review each give one ReviewReport under today's verdict rules, and a premise whose call fails twice is still recorded as not judged. Its controller stage plan keeps today's single batched verify prompt under the limit; over the limit it batches premises per chunk.

### 5.5 Story E202610198315a11f:S005

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

The two controller steps' use of the job, and the MCP boundary that admits it: the new answers phase in the insrc_review_step and insrc_code_review_step input schemas in src/mcp/server.ts, their registered schema contracts and tool descriptions, with schema and surface tests (src/mcp/__tests__/schema-registry.test.ts); keeping it in step state, frame sizing, answer validation by call identifier, and offering a review under the limit today's prompts as identified calls in the same frame shape. Compatibility: the controller step states gain an optional pipeline field; a state without it (saved before the change) is resumed on today's path; both stores are memory-only, so, as today, a state does not survive a daemon restart. Tests: S005/ac1 a controller review over the limit is handed the daemon's chunks one frame at a time and records the same kind of result; ac2 a missing or wrong identifier in an answer is rejected and the call offered again under a new UUID; ac3 a new controller review under the limit is offered today's prompts, each as an identified call, and gives today's result; a pre-change state resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames, each path tested. The answers phase also accepts a failure outcome per call (size refusal with the reported limit, stall, transient error), mapped to the driver's failure handling and admitted by both MCP input schemas; tested: a controller-reported size refusal re-divides the call, a reported stall or transient error re-issues it once under a new identifier.

## 6. Non-functional targets

- **Performance:** Calls are serial (k6). A review under the limit makes the same number of calls as today. Every prompt sent, chunk or gather, is at most review.chunkTokens x 3 characters.
- **Security:** No new transport: calls go through the existing LLMProvider and the installed CLIs (k7). Reviewer sessions keep their read-only tool sets.
- **Observability:** Each review logs its plan (single or N chunks, chars per chunk), every call's identifier, stage and size, every identifier mismatch and refusal, and the gather's obligation count; DimensionResult and ReviewReport record the number of calls per stage when a review was divided.
- **Durability:** The job is serialisable, so the controller path survives across turns in the existing step state (memory-only, so not across a daemon restart, as today). A daemon review whose call fails after its retries records nothing, as today, except the premise review, which records that premise as not judged and keeps the rest (ISSUE-d4b2cd1c). New record fields (pipelineCalls) are optional, under a new name, and absent on one-chunk reviews; the existing parts field keeps its shape; so existing records keep validating.

## 7. Rollout

**Phase A — the pipeline, single chunk everywhere**

**Stories:** `s1`

s1 owns every shared contract but sc7 and routes both review kinds through the pipeline with single-chunk adapters, so every later Story builds on a pipeline already in use.

**Backward compat:** A review at or under the limit sends exactly today's prompt (now inside the identifier envelope) and records today's result; existing review records keep validating.

**Phase B — divided code review and divided design review**

**Stories:** `s2`, `s3`, `s4`

s2 then s3 complete the code-review adapter (chunking, then gather); s4 completes the design-review adapter. s4 depends only on s1, so it can land before, between or after s2 and s3.

**Backward compat:** Reviews under the limit are unaffected; only reviews over 384K characters take the divided path, which before this phase failed or was refused.

**Phase C — the controller walks the same chunks**

**Stories:** `s5`

s5 depends on s3 and s4 and owns sc7, the multi-chunk controller frames.

**Backward compat:** Every new controller review, under the limit or over, uses identified calls; under the limit it is offered today's prompts and gives today's result. A controller state saved before the change resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames.

**Ordering rationale:** Owner before consumers: s1 owns sc1-sc6, consumed by s2-s5; s2 precedes s3 (dependsOn); s3 and s4 precede s5 (dependsOn), which owns sc7 and has no consumers.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| The identifier envelope changes every review's answer schema | Wrapping today's answer as { callId, answer } changes what the CLI must return for every review, including the ones under the limit; a schema both CLIs refuse (for example a root union) would break every review at once. | Keep the envelope a plain object with the adapter schema below the root (the CLIs refuse oneOf/anyOf/allOf only at the root); prove it live on both claude and codex in s1 before any adapter changes. |
| Gather adjudication may disagree with a single review | An obligation judged from notes gathered across chunks could be marked missing when a single review would have found it, breaking k10's 'what it is judged against' for divided reviews. | s3 and s4 tests compare a divided review against the same material reviewed in one call under a raised limit, on fixtures that fit both ways. |
| Graph call edges can be incomplete | Chunk grouping relies on callers and callees among changed symbols; a missing edge splits related code with no neighbour summary. | Group by file and module as well as calls (s2), and judge cross-chunk relations from the relations that do exist; record the relation counts in the review log. |
| Provider-internal retries would resend a prompt under the same identifier | CliProvider.withTransientRetry and runReviewSession retry the same prompt inside one provider call, below the pipeline's identifier boundary. | s1 adds internalRetry: false and the pipeline re-issues every retry itself under a new UUID; a test asserts no prompt hash repeats across transient errors and stalls. |
| Ollama reviewer session quality | The read-only tool loop that serves the analyzer has not run a design review; a weaker model could judge from the design text alone. | s1 extracts a generic read-only tool loop from runShaperToolLoop (caller-supplied messages, schema, deadline, signal, retry policy), keeps the analyzer's wrapper and its tests unchanged, and runs the HLD/LLD template review on a configured high-end Ollama model in a live test, checking the answer cites files it read. |

## 8. Alternatives considered

### 8.1 a1: One review pipeline with per-kind adapters — **CHOSEN**

A single prepare -> review -> gather engine that every review runs through, with each review kind plugging in its material, its relations and its gather rules.

A shared review pipeline owns the three stages and everything they have in common: measuring a review's material against the chunk limit, grouping it into chunks by the relations the review kind declares, attaching short summaries of related material held elsewhere, running the chunk calls one after another with a fresh call identifier per attempt, re-dividing on a size refusal, and gathering. The pipeline is a serialisable job, so the daemon runs it to the end while the controller is handed the same calls one at a time. ISSUE-aef82b03's delivered size-refusal detection, provider input budgets, batch packing and job loop become its core.

Each review kind contributes an adapter: code review supplies its changed symbols as atoms with their call, file and module relations, its obligations (clauses, requirements, promised tests, module conventions) and today's per-dimension prompts; design review supplies the document's sections with their cross-references and today's checklist or premise prompts. A review at or under the limit is one chunk whose prompt is exactly today's, and the gather stage passes its answer through unchanged; a divided review is gathered by the adapter's rules on top of the pipeline's merge.

**Pros:**
- The three stages, call identifiers, refusal handling and the controller walk are written once and hold for all five review paths (code review daemon and controller, HLD/LLD template, DEF/plan premises, design-review controller).
- A review at or under the limit runs today's prompt unchanged, so k10's 'exactly today's result' is a property of the single-chunk path rather than five separate guarantees.
- Reuses the delivered ReviewJob loop, packIntoBatches and InputTooLargeError instead of replacing them.

**Cons:**
- Needs a new shared contract (atoms, relations, obligations, chunk prompt, gather) that both review kinds must fit; the design-review premise path and the template path differ enough that the adapter contract has to admit both.
- Touches the code-review runner, all seven dimension judges, the design-review router, and both controller steps in one Epic.

**Cost estimate:** L

### 8.2 a2: Chunking inside each review kind

Code review and design review each gain their own splitter and gatherer, with only small helpers shared.

Code review extends ISSUE-aef82b03's job with coherent grouping by call relations, file and module, neighbour summaries and its keyed gather; design review separately gains a section splitter with cross-reference summaries and its own merge of checklist answers or premise verdicts. Each subsystem keeps its own driver, its own controller frames and its own retry and identifier handling, sharing only the batch packer and the size-refusal detection.

Each kind can follow its own shape closely, and no common contract has to be agreed first. A review under the limit keeps today's code path in each subsystem.

**Pros:**
- Each subsystem changes only its own modules, so a defect in one kind's chunking cannot affect the other kind.
- No shared adapter contract to design up front.

**Cons:**
- The three stages, the call-identifier rule, refusal re-division and the controller walk are written twice, so k2 ('the same three stages') and k4 are held by two implementations that can drift.
- Two controller protocols for large reviews instead of one.

**Cost estimate:** L

**Rejected because:** Only partial on k2 and k4: the three stages and the call-identifier rule would live in two implementations that can drift, with two controller protocols.

### 8.3 a3: Chunking provider wrapper

A provider wrapper that splits any oversized prompt by its text sections and merges the structured answers, invisible to the reviews.

Every review keeps building its one prompt as today; a wrapper around the provider measures each prompt, splits one that is over the limit at section or paragraph boundaries, sends the parts with call identifiers and merges the returned structured answers field by field.

No review code changes beyond using the wrapper, and any future model call gets the same protection.

**Pros:**
- Smallest change to the review subsystems: one wrapper.
- Covers every model call, not only reviews.

**Cons:**
- Splits by text position, not by how code or sections relate, which the stakeholder ruled out (k1).
- A merge without review knowledge cannot judge an obligation on evidence from every part or a relationship that crosses parts (FR006), and would report an approved clause as missing in every part that does not hold its code.

**Cost estimate:** M

**Rejected because:** Violates k1 (splits by text position) and k5 (a gather without review knowledge reports false absences), and is partial on k8 (a paragraph split can cut an atom).

## 9. References

- **[[c1]]** `analyze-bundle` `s1: insrc_analyze_step structural map of src/workflow/code-review, src/daemon/steps/code-review-step and src/workflow/review (2026-10-19)`
- **[[c2]]** `analyze-bundle` `s1: insrc_analyze_step prose retrieval on review chunking in docs (ISSUE-aef82b03 LLD; analyzer Epic b9d5c5c4 HLD S003)`
- **[[c3]]** `analyze-bundle` `s1: insrc_analyze_step how-does-it-work on the review prompt builders and senders (runCodeReview, the dimension judges, emitJudgementsResult, runReview, runTemplateReview, buildTemplateReviewPrompt, extractClaims, verifyClaim, review-step phases)`
- **[[c4]]** `code` `src/workflow/code-review/runner.ts:171-234` — "runCodeReview("
- **[[c5]]** `code` `src/daemon/steps/code-review-step/handler.ts:439-469` — "function emitJudgementsResult("
- **[[c6]]** `code` `src/workflow/review/template.ts:182-230` — "export function buildTemplateReviewPrompt("
- **[[c7]]** `code` `src/workflow/review/review.ts:108-158` — "runReview("
- **[[c8]]** `code` `src/workflow/code-review/review-job.ts:210` — "export function createReviewJob("
- **[[c9]]** `prior-artifact` `DEF-8315a11f29fd2812 (approved 2026-10-19)`
- **[[c10]]** `code` `src/analyze/context/driver.ts:824` — "export async function runShaperToolLoop("
- **[[c11]]** `code` `src/workflow/review/template-review.ts:85` — "raw = await session.runReviewSession<RawTemplateAnswer>(prompt, TEMPLATE_ANSWER_SCHEMA as StructuredSchema, { cwd: repo, deadlineMs: remainingMs });"
- **[[c12]]** `prior-artifact` `ISSUE-d4b2cd1c2c1ba649 (complete): a premise whose call fails twice is recorded as not judged`
- **[[c13]]** `code` `src/workflow/code-review/dimensions/diagram/index.ts:84` — "judgeDiagram"
- **[[c14]]** `stakeholder` `user, 2026-10-19` — "fix all five, reading "every model call" as every request the pipeline sends. A tool session's inner turns belong to the session"
- **[[c15]]** `code` `src/mcp/server.ts:751` — "z.enum(['start', 'judgements'])"
