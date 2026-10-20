<!-- insrc:artifact LLD-8315a11f29fd2812-s5 -->

# LLD: E202610208315a11f:S005

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**HLD base run:** `wf-1792389266411-gvxl8y`
**HLD effective hash:** `044189484c77...`

This Story moves the two controller review tools onto the review pipeline, so a review run from the controller side walks the same calls the daemon would make. Every new controller review is handed emit_calls frames: the review's pending calls, each with its own identifier, packed up to the chunk limit. The controller answers each one, by identifier, in a new answers phase, or reports that it could not complete it (too large, stalled, transient error). Under the limit a review gets today's prompts in one frame and gives today's result. A divided review is handed its chunks about one at a time, and a state saved before this change still finishes on today's frames.

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

## 1. HLD context

> See **HLD-8315a11f29fd2812** § 2. Framework summary

**Rollout phase:** Phase C — the controller walks the same chunks
**Owns:** `sc7` (Controller call frames)
**Consumes:** `sc1` (ReviewMaterial), `sc2` (ReviewAdapter), `sc3` (ReviewChunk and ChunkPlan), `sc4` (CallEnvelope), `sc5` (ReviewPipelineJob), `sc6` (Chunk limit setting)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The pipeline module itself: measurement, the generic grouping that packs related atoms together within the limit, staged execution with deterministic stages, the envelope schema wrapping, identifier generation and checking, the pipeline-owned retry policy (providers called with internalRetry: false; one re-issue under a new UUID, two attempts in all), per-stage failure policies, refusal re-division, the serial daemon driver, single-chunk pass-through, the bounded gather machinery (evidence notes keyed by obligation, level-by-level reduction under a note cap, provenance kept in the job, refused gather calls re-planned), and the adoption of ISSUE-aef82b03's InputTooLargeError, inputBudgetChars, packIntoBatches and ReviewJob loop. Change sites beyond the new module: CliProvider (internalRetry honoured by withTransientRetry, runReviewSession and its structured-output retry; a size refusal in the claude reviewer-session error envelope and the codex session classified as InputTooLargeError, as completeStructured already does), OllamaProvider (internalRetry: false maps completeStructured to one attempt; a read-only reviewer session over a generic tool loop extracted from runShaperToolLoop in src/analyze/context/driver.ts, the analyzer keeping its own wrapper), and the single-chunk adapters for both review kinds, so every review takes the pipeline path from s1 on with today's calls and working directory (structured calls run in the repository, as today for code review; the premise review's verify calls gain it as an additive change): one model stage per model-judged code-review dimension, adherence making no call without an approved LLD or plan, ux deterministic on the daemon and diagram's handlers as today (deterministic ones stay deterministic, a failing handler stays a LOW observation); one reviewer session for HLD/LLD; extract, probe, then one verify per premise for DEF/plan, with ISSUE-d4b2cd1c's not-judged recording kept. Tests: S001/ac1 an under-limit code review, template review and premise review each make today's calls and give today's result (recorded fixtures), the diagram dimension included; ac2 a missing or wrong identifier is retried once under a new UUID and no prompt hash repeats, including transient errors, stalls and invalid answers on both CliProvider and OllamaProvider; premise extraction failing fails the review while a verify call failing twice records the premise as not judged; ac3 the default limit is 384,000 characters for every provider; ac4 a size refusal from completeStructured, the claude session envelope and the codex session re-divides the call and never resends it; ac5 a review on an Ollama provider completes through both execution modes; plus a live probe of the envelope schema on claude and codex. Also tested: an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits, and the final verdict keeps every atom's provenance; every structured review call runs in the repository working directory. Also tested: a premise verify call keeps its 3-minute limit through the pipeline; a refused call is re-divided from exactly the atoms and notes it carried; the controller premise review under the limit still sends one batched verify prompt. Also tested: refusal re-planning reads only the job's material snapshot, never the graph or files, so a reindex between turns cannot change the material a call is re-divided from. The ux stage reads companion-mock existence from the snapshot's file facts recorded at prepare, not from disk; tested: adding or removing a mock after prepare does not change the review result. — owns `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`
- `s2`: The code-review adapter's material: changed-symbol atoms, call relations from the grounding's callers and callees among changed symbols, file and module relations, and how neighbour summaries are written for a changed symbol held in another chunk. Tests: S002/ac1 related changed symbols land in the same chunk before file and module grouping; ac2 a call relation cut between chunks yields a neighbour summary on both sides; ac3 every changed symbol appears whole in some chunk and one over the limit is named, never cut.
- `s3`: The code-review adapter's gather: per-dimension chunk prompts, obligation keys and their adjudication over all chunks' evidence, the cross-chunk relationship check, the cross-chunk duplicate comparison for quality, and the fold into today's DimensionResult and verdict. It also owns the acceptance smoke: Epic c2ba6fa6 Story s1's code review runs on the installed daemon, completes and records a verdict, with the chunk plan and calls per stage written to the smoke record. Tests: S003/ac1 a divided review and the same material reviewed in one call under a raised limit give the same obligation verdicts on fixtures that fit both ways; ac2 a mismatch between related functions in different chunks is reported; ac3 a cross-chunk duplicate is reported; ac4 the installed-daemon smoke above.
- `s4`: The design-review adapter: document sections as atoms, cross-reference relations, section summaries for neighbours, chunk prompts for the template checklist and the premise pipeline, and the gather of checklist answers or premise verdicts into today's ReviewReport and verdict rules. Tests: S004/ac1 every section appears whole in some chunk with the sections it references; ac2 a cross-chunk reference yields a section summary; ac3 a divided HLD/LLD review and a divided DEF/plan review each give one ReviewReport under today's verdict rules, and a premise whose call fails twice is still recorded as not judged. Its controller stage plan keeps today's single batched verify prompt under the limit; over the limit it batches premises per chunk.

## 2. Contract details

**Surface level:** public

### 2.1 `EmitCallsFrame (sc7)`

```typescript
interface EmitCallsFrame { readonly next: 'emit_calls'; readonly guidance: string; readonly calls: readonly ReviewCall[]; readonly progress: { readonly stage: string; readonly answered: number; readonly pending: number }; readonly state: string }
```

**Parameters:**
- `calls: readonly ReviewCall[]` — Every currently pending call of the review's jobs that fits, in a fixed order (code review: today's dimension order; design review: stage order). Packed so that the summed rendered size of the calls (messages, envelope schema and execution) is at most limitChars; a call is never split. Each carries a fresh callId and the envelope schema { callId (const), answer }.
- `progress: { stage: string; answered: number; pending: number }` — Where the review stands, for the controller and the log.

**Returns:** `EmitCallsFrame` — Returned by phase='start' for every new controller review, and by phase='answers' while calls remain. Under the limit, a code review's calls are today's emit_judgements prompts, one call each. They share ONE frame when their summed rendered size fits limitChars, as today's frame does for ordinary reviews; if several single-chunk dimension calls each fit but not together, they are spread over as many frames as needed, never split; a premise review's frames hold the extract call, then the single batched verify call; a template review's frame holds the one findings call.

**Preconditions:**
- The step state holds the review's jobs in its pipeline field.

**Postconditions:**
- The frame fits limitChars.
- Only the stages that each adapter's stagesFor('controller') marks 'deterministic' are run daemon-side with runStage before a frame is built: the premise review's probe and the deterministic diagram handlers. The code review's ux and diagram prompts are offered to the controller as calls, as today's emit_judgements frame offers them (src/daemon/steps/code-review-step/handler.ts:439).

### 2.2 `AnswersInput / CallFailure (sc7) and the 'answers' phase handler`

```typescript
interface AnswersInput { readonly phase: 'answers'; readonly answers: readonly (EnvelopedAnswer | CallFailure)[]; readonly state: string }; interface CallFailure { readonly callId?: string | undefined; readonly failure: { readonly cause: 'size-refusal' | 'stall' | 'transient'; readonly maxChars?: number | undefined; readonly detail?: string | undefined } }; handleAnswers(input: AnswersInput): Promise<EmitCallsFrame | <tool>Done | <tool>Error>
```

**Parameters:**
- `answers: readonly (EnvelopedAnswer | CallFailure)[]` — One entry per call of the last frame: { callId, answer } or { callId, failure }.
- `state: string` — The token the last frame returned.

**Returns:** `EmitCallsFrame | <tool>Done | <tool>Error` — Each EnvelopedAnswer goes to applyAnswer and each CallFailure to applyFailure (size-refusal with maxChars re-divides the call; stall or transient re-issues it once under a new callId). Entries are classified inside handleAnswers (the MCP schema admits any entry). A malformed entry, an entry with no callId or a non-string one, an unknown callId, or a repeated one is matched to no call: it is ignored and logged. Every call of the last frame without exactly one valid entry is applied as identifier-mismatch, so it is re-issued once under a new callId. A missing identifier therefore reaches the same recovery as a wrong one (S005/ac2). Then the next frame is returned, or, when every job is done, the tool's record is written exactly as today (code review: the CR record through today's runner path, with coverage normalised once; design review: the report stamped as today) and today's done frame is returned.

**Errors:**
- `<tool>Error { code: 'bad-input' }` when answers is missing or not an array. Individual malformed entries are not an error; they leave their call unanswered, which is re-issued.
- `<tool>Error { code: 'state-not-found' }` when The token is unknown, as today for code review. For insrc_review_step this is a deliberate change: today its dispatch turns StateTokenNotFound into 'internal' (src/daemon/steps/review-step/handler.ts). It now catches StateTokenNotFound and returns 'state-not-found' like code review.
- `<tool>Error (review failed)` when A call in a fail-review stage failed both attempts; nothing is recorded, as today.

**Preconditions:**
- The state's pipeline field is present.

**Postconditions:**
- No answer is applied to a call it does not name.

### 2.3 `handleStart (insrc_code_review_step and insrc_review_step)`

```typescript
handleStart(step, deps): Promise<EmitCallsFrame | <existing outputs>>
```

**Parameters:**
- `step: CodeReviewStepInputStart | ReviewStepInputStart` — Unchanged input.

**Returns:** `Promise<EmitCallsFrame | existing outputs>` — Unchanged routing (daemon reviewer vs controller reviewer, confirm_wait, errors). When the controller is the reviewer, it now builds the review's jobs (createReviewJob with path 'controller' for each code-review dimension, or one design-review job), saves them in the state's pipeline field with the subject and snapshot, and returns the first EmitCallsFrame instead of emit_judgements, emit_claims or emit_findings. Every place that today creates a controller review state switches to the pipeline. For code review that is BOTH the fresh-grounding branch AND beginDiffOnlyReview (src/daemon/steps/code-review-step/handler.ts:382), reached from a decline (:263), a freshness timeout (:313) and hollow grounding (:353). The diff-only state keeps its diff-scoped subject, groundingMode 'degraded', fallbackReason, and the warn cap applied when the record is written (capVerdictAtWarn).

**Errors:**
- `existing errors` when As today; AtomTooLargeError from prepare is returned as an error naming the item.

**Postconditions:**
- New controller reviews always use emit_calls.

### 2.4 `CodeReviewStepStatePayload / ReviewStepStatePayload`

```typescript
readonly pipeline?: { readonly jobs: readonly ReviewPipelineJob[]; readonly limitChars: number; readonly lastFrameCallIds: readonly string[] } | undefined
```

**Parameters:**
- `pipeline: { jobs; limitChars; lastFrameCallIds }` _(optional)_ — Present for every review started after this change. Absent: the state was saved before it, and resumes on today's phases.

**Returns:** `state payload` — Kept in the existing memory-only stores, unchanged: at most 100 entries, with idle entries older than one hour swept opportunistically when a state is saved, so a token idle longer than an hour can still load if no save has swept it. A state does not survive a daemon restart, as today.

### 2.5 `handleJudgements / handleClaims / handleVerdicts / handleFindings`

```typescript
unchanged
```

**Parameters:**
- `step: existing inputs` — Unchanged.

**Returns:** `unchanged` — Kept only for states without a pipeline field (saved before the change). Called with a pipeline state, they return bad-phase naming 'answers'.

**Errors:**
- `<tool>Error { code: 'bad-phase' }` when A legacy phase used on a pipeline state.

### 2.6 `MCP input schemas and registry (src/mcp/server.ts)`

```typescript
insrc_review_step phase: z.enum(['start','claims','verdicts','findings','answers']) + answers?: z.array(z.unknown()); insrc_code_review_step phase: z.enum(['start','judgements','answers']) + answers?: z.array(z.unknown())
```

**Parameters:**
- `answers: array` _(optional)_ — Only for phase=answers.

**Returns:** `registry entries` — The tool registry's phase lists gain 'answers' (src/mcp/server.ts:81, src/mcp/server.ts:87), and both tool descriptions describe the emit_calls / answers loop and the failure outcomes, so insrc_schema returns them.

**Postconditions:**
- The MCP boundary admits any array entries. The installed SDK rejects the whole call when its zod schema fails (validateToolInput), so entry shapes are NOT checked there. handleAnswers classifies each entry instead: a well-formed answer ({ callId: string, answer }), a well-formed failure ({ callId: string, failure: { cause in size-refusal | stall | transient, maxChars?: positive integer, detail?: string } }), or malformed (anything else, including no or a non-string callId and an unknown cause). A malformed entry is ignored and logged, and its call is re-issued as identifier-mismatch, so one bad entry never rejects the turn.
- The tool description documents both entry shapes, so insrc_schema shows them even though the schema is permissive.

### 2.7 `Review and code-review guide sections (src/prompts/steering-block.md)`

```typescript
the 'review' and 'code-review' sections served by insrc_guide (guideGetResult) and stamped into marked repos' CLAUDE.md by the boot steering refresh
```

**Parameters:**
- `section text: markdown` — The step-by-step loop each guide gives a controller.

**Returns:** `guide text` — Rewritten so a NEW review follows start, then emit_calls and answers (each entry { callId, answer } or { callId, failure }) until done. The old claims / verdicts, findings and judgements loops are described only as continuing a state saved before the change. This is the only copy outside src/mcp/server.ts and the step handlers that names the old frames (checked by grep across src/, vscode-plugin/src and jetbrains-plugin/src).

**Postconditions:**
- insrc_guide({ workflow: 'review' }) and insrc_guide({ workflow: 'code-review' }) return the emit_calls / answers loop.

## 3. Data model changes

### 3.1 `CodeReviewStepStatePayload.pipeline / ReviewStepStatePayload.pipeline` — field-add

Optional { jobs, limitChars, lastFrameCallIds }. Absent marks a pre-change state, resumed on today's phases.

**Call sites:**
- `src/daemon/steps/code-review-step/types.ts:150`
- `src/daemon/steps/review-step/types.ts:167`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc7` | implements | EmitCallsFrame, AnswersInput and CallFailure, the answers phase in both tools, frame packing, and pre-change resume. |
| `sc5` | consumes | Keeps the jobs in step state and drives them with nextCalls, applyAnswer, applyFailure, runStage and result. |
| `sc4` | consumes | Hands the controller enveloped ReviewCalls; answers are matched by callId. |
| `sc2` | consumes | Uses each adapter's controller stage plan (code review offers ux and diagram prompts as today; premise review batches verify). |
| `sc3` | consumes | Frames follow the jobs' chunk plans. |
| `sc1` | consumes | Material comes from the adapters, built from the saved subject and snapshot. |
| `sc6` | consumes | limitChars bounds both each call and each frame. |

## 5. Error paths

**Error cases**

- **An answers entry has no callId, an unknown callId, or a callId already used in the same answers turn.** (recoverable)
  - Detection: handleAnswers checks every entry's callId against the state's lastFrameCallIds, and counts entries per callId.
  - Response: The unknown entry is ignored and logged. Every call of the last frame without exactly one valid entry is applied as identifier-mismatch and re-issued once under a new callId.
  - User impact: No answer is ever taken for another call; the call is offered again.
- **An answer's inner content fails the call's schema or the stage's validate.** (recoverable)
  - Detection: applyAnswer validates the envelope's answer against the call schema, then the stage's validate(answer, call).
  - Response: invalid-answer: one re-issue with the correction note, then the stage's failure policy.
  - User impact: As on the daemon path.
- **The controller reports a size refusal.** (recoverable)
  - Detection: A CallFailure with cause 'size-refusal' (and maxChars when the controller knows it).
  - Response: applyFailure re-divides the call's carried atoms and notes within maxChars, or half the refused size, and the new, smaller calls appear in the next frame. The refused prompt is never offered again.
  - User impact: More, smaller calls.
- **The controller reports a stall or a transient error.** (recoverable)
  - Detection: A CallFailure with cause 'stall' or 'transient'.
  - Response: Re-issued once under a new callId; a second failure applies the stage's policy (fail-review, record-not-judged or record-observation).
  - User impact: As on the daemon path.
- **A legacy phase (judgements, claims, verdicts, findings) is called on a pipeline state.** (recoverable)
  - Detection: The phase handler sees state.pipeline present.
  - Response: bad-phase error naming 'answers' as the expected phase; the state is kept, so the controller can retry.
  - User impact: A clear message; nothing lost.
- **phase='answers' on a pre-change state (no pipeline field).** (recoverable)
  - Detection: handleAnswers sees state.pipeline absent.
  - Response: bad-phase error naming the legacy phase the state expects; the state is kept.
  - User impact: A clear message; nothing lost.
- **The state token is unknown: swept after an hour idle (sweeps run when a state is saved) or lost in a daemon restart.** (terminal)
  - Detection: loadState throws StateTokenNotFound. Both tools' dispatch catches it; insrc_review_step newly maps it to 'state-not-found' instead of 'internal'.
  - Response: Today's state-not-found error; the review must be started again.
  - User impact: As today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A code review under the limit, started from the controller. | Today's dimension prompts (ux and diagram included, as today), each an identified call, in one frame when they fit together, otherwise in consecutive frames. The record equals today's for the same answers. |
| A DEF review under the limit from the controller. | Frame 1 holds the extract call. The probe runs daemon-side. Frame 2 holds today's single batched verify call. Today's report. |
| An HLD review under the limit from the controller. | One frame with the findings call; today's report. |
| A divided code review from the controller. | Frames of one chunk call each (a chunk nearly fills the limit), then gather calls; the record has the same shape as the daemon's, with pipelineCalls. |
| Several small gather calls pending at once (for example obligation calls). | Packed into one frame up to the limit. |
| A pre-change state resumed after the update, within the same daemon process. | Today's emit_judgements / judgements, emit_claims / claims, emit_verdicts / verdicts or emit_findings / findings frames, as before. |
| A code review that falls back to the diff (declined wait, freshness timeout, hollow grounding), reviewed by the controller. | emit_calls frames from a pipeline state carrying the diff subject, groundingMode 'degraded' and fallbackReason; the record is capped at warn as today. |

**Invariants to preserve**

- Routing by author is unchanged: the daemon reviews controller-authored work, and the controller reviews daemon-authored work. [[c1]]
- The record written at the end is today's: the CR record with coverage normalised once, and the design report stamped through today's path. [[c1]]
- Step states stay memory-only, with today's 100-entry cap and opportunistic one-hour sweep on save. [[c1]]
- The start, confirm_wait and error frames of both tools are unchanged. [[c1]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), as the existing step and MCP tests`

**Test levels**

- **unit** — Frame packing, answer matching and failure mapping in isolation.
  - Subjects: `src/daemon/steps/__tests__/pipeline-frames.test.ts: 'pending calls are packed in a fixed order into a frame whose summed rendered size fits limitChars, and no call is split'`, `src/daemon/steps/__tests__/pipeline-frames.test.ts: 'an answers entry with an unknown or duplicated callId is ignored, and the unanswered call is re-issued once under a new callId'`, `src/daemon/steps/__tests__/pipeline-frames.test.ts: 'a CallFailure size-refusal re-divides the call and the refused prompt is never offered again; stall and transient re-issue once'`, `src/daemon/steps/__tests__/pipeline-frames.test.ts: 'single-chunk dimension calls that each fit but not together are offered in consecutive frames, none split'`
- **integration** — Both controller steps end to end with scripted controller answers, under and over the limit, plus pre-change resume.
  - Subjects: `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'a code review under the limit is offered today's dimension prompts as identified calls in one frame and writes today's record'`, `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'a code review over the limit is handed the daemon's chunks about one call per frame and records the same kind of result as the daemon path'`, `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'a pre-change state resumes on emit_judgements and judgements'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'a DEF review under the limit: extract call, daemon-side probe, then today's single batched verify call, and today's report'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'an HLD review under the limit: one findings call and today's report'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'a divided design review is handed its chunks call by call and gives one report'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'pre-change states resume on emit_claims and claims, emit_verdicts and verdicts, and emit_findings and findings'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'a missing or wrong callId in an answer is rejected and the call offered again under a new identifier'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'a legacy phase on a pipeline state, or answers on a pre-change state, returns bad-phase and keeps the state'`, `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'each diff-only entry (declined, freshness timeout, hollow grounding) starts a pipeline review that keeps the degraded mode, fallback reason and warn cap'`, `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'the controller is offered the ux and diagram prompts as calls, as today; only deterministic controller stages run daemon-side'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'an unknown state token returns state-not-found from insrc_review_step'`
  - Fixtures: `a Story fixture with a BUILD record authored by the daemon (so the controller reviews)`, `daemon-authored DEF and HLD fixtures`, `scripted controller answers keyed by callId`
- **contract** — The MCP boundary admits the answers phase.
  - Subjects: `src/mcp/__tests__/schema-registry.test.ts: 'insrc_review_step and insrc_code_review_step list the answers phase, and their input schemas accept answer and failure entries with no union at the root'`, `src/mcp/__tests__/schema-handler.test.ts: 'insrc_schema returns the answers phase and its entry shapes for both tools'`, `src/mcp/__tests__/schema-handler.test.ts: 'through the MCP boundary, an answer with no callId is accepted by the schema and its call is re-issued under a new identifier'`, `src/mcp/__tests__/schema-handler.test.ts: 'through the MCP boundary, an answers turn mixing valid entries with a null, a numeric callId and an unknown failure cause is accepted; the valid answers apply and the malformed entries' calls are re-issued'`, `src/mcp/__tests__/guide-handler.test.ts: 'insrc_guide review and code-review sections describe the emit_calls / answers loop, and name the legacy phases only for pre-change states'`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'a code review over the limit is handed the daemon's chunks about one call per frame and records the same kind of result as the daemon path'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'a divided design review is handed its chunks call by call and gives one report'`, `src/daemon/steps/__tests__/pipeline-frames.test.ts: 'a CallFailure size-refusal re-divides the call and the refused prompt is never offered again; stall and transient re-issue once'`, `src/mcp/__tests__/guide-handler.test.ts: 'insrc_guide review and code-review sections describe the emit_calls / answers loop, and name the legacy phases only for pre-change states'` |
| `ac2` | `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'a missing or wrong callId in an answer is rejected and the call offered again under a new identifier'`, `src/daemon/steps/__tests__/pipeline-frames.test.ts: 'an answers entry with an unknown or duplicated callId is ignored, and the unanswered call is re-issued once under a new callId'`, `src/mcp/__tests__/schema-handler.test.ts: 'through the MCP boundary, an answer with no callId is accepted by the schema and its call is re-issued under a new identifier'`, `src/mcp/__tests__/schema-handler.test.ts: 'through the MCP boundary, an answers turn mixing valid entries with a null, a numeric callId and an unknown failure cause is accepted; the valid answers apply and the malformed entries' calls are re-issued'` |
| `ac3` | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'a code review under the limit is offered today's dimension prompts as identified calls in one frame and writes today's record'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'a DEF review under the limit: extract call, daemon-side probe, then today's single batched verify call, and today's report'`, `src/daemon/steps/review-step/__tests__/controller-pipeline.test.ts: 'an HLD review under the limit: one findings call and today's report'`, `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'a pre-change state resumes on emit_judgements and judgements'`, `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'each diff-only entry (declined, freshness timeout, hollow grounding) starts a pipeline review that keeps the degraded mode, fallback reason and warn cap'`, `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts: 'the controller is offered the ux and diagram prompts as calls, as today; only deterministic controller stages run daemon-side'`, `src/daemon/steps/__tests__/pipeline-frames.test.ts: 'single-chunk dimension calls that each fit but not together are offered in consecutive frames, none split'` |

## 7. Migration

**State before:** A controller review today gets fixed frames (s1 bundle). Code review gets emit_judgements, all dimension prompts in one frame, answered once with judgements (src/daemon/steps/code-review-step/handler.ts:439, src/daemon/steps/code-review-step/handler.ts:496). Premise review gets emit_claims, then emit_verdicts with one batched prompt; template review gets emit_findings (src/daemon/steps/review-step/phases/start.ts:36, src/daemon/steps/review-step/phases/claims.ts:28). No answer carries a call identifier, nothing is divided, and the MCP registry lists only those phases (src/mcp/server.ts:81, src/mcp/server.ts:87).

**State after:** Every new controller review is driven by emit_calls frames packed up to the limit and an answers phase matched by callId, with per-call failure outcomes. Under the limit, a review gets today's prompts in today's single frame (or today's two frames for a premise review) and gives today's result. Over the limit, the controller walks the daemon's chunks about one call per frame. States saved before the change resume on today's phases.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional pipeline field to both step state payloads, the shared frame packing and answer matching, and handleAnswers in both tools, with unit tests. — ↩ rollbackable
2. Switch every controller-review entry to build the jobs and return emit_calls: both handleStart paths, and beginDiffOnlyReview for the declined, freshness-timeout and hollow-grounding fallbacks. Keep the legacy phase handlers for states without the pipeline field, and make them return bad-phase on pipeline states. Map StateTokenNotFound to state-not-found in insrc_review_step's dispatch. — ↩ rollbackable
3. Add 'answers' to both tools' input schemas, the registry phase lists and the tool descriptions in src/mcp/server.ts, with schema-registry and schema-handler tests. — ↩ rollbackable
4. Update the review and code-review sections of src/prompts/steering-block.md (served by insrc_guide, and re-stamped into marked repos' CLAUDE.md steering blocks by the boot steering refresh after the daemon update). — ↩ rollbackable
5. Rebuild and update the installed daemon and the MCP server, so controllers re-read the tool schemas (the plugins' existing post-update MCP reload nudge covers this). — ↩ rollbackable

**Backward compat:** The MCP tools keep their names and existing phases; 'answers' and the answers field are additive. The start, confirm_wait, done and error outputs are unchanged. A controller that still sends today's judgements, claims, verdicts or findings on a NEW review gets a bad-phase error naming 'answers', because new reviews always use emit_calls. States saved before the change keep today's phases until they expire or the daemon restarts. Stored records keep their shape.

## 8. Alternatives considered

### 8.1 a1: Strictly one call per frame

Every new controller review is driven one ReviewCall per emit_calls frame, in a fixed order across all of the review's jobs; the controller answers that one call (answer or failure) per answers turn.

Each step's state gains an optional pipeline field: { jobs: ReviewPipelineJob[] } (one per code-review dimension, or one design-review job) plus the saved subject and snapshot. Each turn the step rebuilds the adapters, runs any deterministic stage with runStage, collects the pending calls of all jobs with nextCalls, and offers exactly the next one. The answers turn takes that call's EnvelopedAnswer or CallFailure and maps it to applyAnswer or applyFailure. Under the limit a code review becomes one frame per dimension prompt instead of today's single emit_judgements frame.

**Rejected because:** Correct, but under the limit it multiplies turns compared with today.

### 8.2 a2: Frames packed with the pending calls up to the limit — **CHOSEN**

Each emit_calls frame offers every currently pending call of the review's jobs that fits, packed in a fixed order up to limitChars of rendered calls. The controller answers every call in the frame, each with an answer or a failure outcome.

State as in a1. Each turn the step rebuilds the adapters, runs deterministic stages with runStage, and gathers pending calls from every job with nextCalls in a fixed order (code review: today's dimension order; design review: stage order). It packs them into one frame whose summed rendered size (messages, schema and envelope of each call) stays within limitChars, never splitting a call. Under the limit a code review's dimension calls normally fit one frame, as today's emit_judgements does, and a premise review offers extract, then the single batched verify, as today. Over the limit a chunk call nearly fills the limit, so frames carry one call at a time. The answers phase must cover every call in the frame: an EnvelopedAnswer goes to applyAnswer, and a CallFailure to applyFailure with its cause and maxChars. A call left unanswered, or answered under an unknown or wrong callId, is treated as an identifier mismatch and re-issued under a new callId. When every job is done, the step writes today's record (code review) or report (design review). A state without the pipeline field resumes on today's frames.

### 8.3 a3: Today's frames under the limit, new frames only when divided

New controller reviews under the limit keep emit_judgements, emit_claims, emit_verdicts and emit_findings; only a divided review switches to emit_calls.

The step chooses the frame by the chunk plan: single uses today's frames and phases unchanged, divided uses emit_calls and answers.

**Rejected because:** Two frame shapes and unidentified answers under the limit.

## 9. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: How the two controller review steps work today (insrc_analyze_step how-does-it-work, plus a direct read of the state payloads and the MCP registry).`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: What the approved s1-s4 LLDs give the controller path.`
- **[[c3]]** `prior-artifact` `HLD-8315a11f29fd2812`
- **[[c4]]** `prior-artifact` `DEF-8315a11f29fd2812`
- **[[c5]]** `step-output` `s2 alternatives`
- **[[c6]]** `step-output` `s3 judge`
- **[[c7]]** `step-output` `s4 contract`
- **[[c8]]** `step-output` `s5 error paths`
- **[[c9]]** `step-output` `s6 test strategy`
- **[[c10]]** `step-output` `s7 migration`
- **[[c11]]** `step-output` `s8 checklist`
