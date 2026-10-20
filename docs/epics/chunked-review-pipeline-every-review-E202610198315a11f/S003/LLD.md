<!-- insrc:artifact LLD-8315a11f29fd2812-s3 -->

# LLD: E202610198315a11f:S003

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**HLD base run:** `wf-1792389266411-gvxl8y`
**HLD effective hash:** `044189484c77...`

This Story makes a code review that was split into chunks come back as one complete result. Each model-judged dimension reviews its chunks with today's prompt plus short notes keyed by what it must judge: each approved design clause and plan task, each functional requirement, each promised test, and each touched module's conventions. The gather then judges each of those on the notes from every chunk. Two related functions held in different chunks get an explicit relationship check, and quality compares symbol descriptions across chunks to find duplicated logic. The merged findings fold into today's DimensionResult and verdict. Finally, Epic c2ba6fa6 Story s1, whose review was refused for size, is reviewed on the installed daemon as the acceptance smoke.

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

**Rollout phase:** Phase B — divided code review and divided design review
**Consumes:** `sc1` (ReviewMaterial), `sc2` (ReviewAdapter), `sc3` (ReviewChunk and ChunkPlan), `sc4` (CallEnvelope), `sc5` (ReviewPipelineJob), `sc6` (Chunk limit setting)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The pipeline module itself: measurement, the generic grouping that packs related atoms together within the limit, staged execution with deterministic stages, the envelope schema wrapping, identifier generation and checking, the pipeline-owned retry policy (providers called with internalRetry: false; one re-issue under a new UUID, two attempts in all), per-stage failure policies, refusal re-division, the serial daemon driver, single-chunk pass-through, the bounded gather machinery (evidence notes keyed by obligation, level-by-level reduction under a note cap, provenance kept in the job, refused gather calls re-planned), and the adoption of ISSUE-aef82b03's InputTooLargeError, inputBudgetChars, packIntoBatches and ReviewJob loop. Change sites beyond the new module: CliProvider (internalRetry honoured by withTransientRetry, runReviewSession and its structured-output retry; a size refusal in the claude reviewer-session error envelope and the codex session classified as InputTooLargeError, as completeStructured already does), OllamaProvider (internalRetry: false maps completeStructured to one attempt; a read-only reviewer session over a generic tool loop extracted from runShaperToolLoop in src/analyze/context/driver.ts, the analyzer keeping its own wrapper), and the single-chunk adapters for both review kinds, so every review takes the pipeline path from s1 on with today's calls and working directory (structured calls run in the repository, as today for code review; the premise review's verify calls gain it as an additive change): one model stage per model-judged code-review dimension, adherence making no call without an approved LLD or plan, ux deterministic on the daemon and diagram's handlers as today (deterministic ones stay deterministic, a failing handler stays a LOW observation); one reviewer session for HLD/LLD; extract, probe, then one verify per premise for DEF/plan, with ISSUE-d4b2cd1c's not-judged recording kept. Tests: S001/ac1 an under-limit code review, template review and premise review each make today's calls and give today's result (recorded fixtures), the diagram dimension included; ac2 a missing or wrong identifier is retried once under a new UUID and no prompt hash repeats, including transient errors, stalls and invalid answers on both CliProvider and OllamaProvider; premise extraction failing fails the review while a verify call failing twice records the premise as not judged; ac3 the default limit is 384,000 characters for every provider; ac4 a size refusal from completeStructured, the claude session envelope and the codex session re-divides the call and never resends it; ac5 a review on an Ollama provider completes through both execution modes; plus a live probe of the envelope schema on claude and codex. Also tested: an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits, and the final verdict keeps every atom's provenance; every structured review call runs in the repository working directory. Also tested: a premise verify call keeps its 3-minute limit through the pipeline; a refused call is re-divided from exactly the atoms and notes it carried; the controller premise review under the limit still sends one batched verify prompt. Also tested: refusal re-planning reads only the job's material snapshot, never the graph or files, so a reindex between turns cannot change the material a call is re-divided from. The ux stage reads companion-mock existence from the snapshot's file facts recorded at prepare, not from disk; tested: adding or removing a mock after prepare does not change the review result. — owns `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`
- `s2`: The code-review adapter's material: changed-symbol atoms, call relations from the grounding's callers and callees among changed symbols, file and module relations, and how neighbour summaries are written for a changed symbol held in another chunk. Tests: S002/ac1 related changed symbols land in the same chunk before file and module grouping; ac2 a call relation cut between chunks yields a neighbour summary on both sides; ac3 every changed symbol appears whole in some chunk and one over the limit is named, never cut.
- `s4`: The design-review adapter: document sections as atoms, cross-reference relations, section summaries for neighbours, chunk prompts for the template checklist and the premise pipeline, and the gather of checklist answers or premise verdicts into today's ReviewReport and verdict rules. Tests: S004/ac1 every section appears whole in some chunk with the sections it references; ac2 a cross-chunk reference yields a section summary; ac3 a divided HLD/LLD review and a divided DEF/plan review each give one ReviewReport under today's verdict rules, and a premise whose call fails twice is still recorded as not judged. Its controller stage plan keeps today's single batched verify prompt under the limit; over the limit it batches premises per chunk.
- `s5`: The two controller steps' use of the job, and the MCP boundary that admits it: the new answers phase in the insrc_review_step and insrc_code_review_step input schemas in src/mcp/server.ts, their registered schema contracts and tool descriptions, with schema and surface tests (src/mcp/__tests__/schema-registry.test.ts); keeping it in step state, frame sizing, answer validation by call identifier, and offering a review under the limit today's prompts as identified calls in the same frame shape. Compatibility: the controller step states gain an optional pipeline field; a state without it (saved before the change) is resumed on today's path; both stores are memory-only, so, as today, a state does not survive a daemon restart. Tests: S005/ac1 a controller review over the limit is handed the daemon's chunks one frame at a time and records the same kind of result; ac2 a missing or wrong identifier in an answer is rejected and the call offered again under a new UUID; ac3 a new controller review under the limit is offered today's prompts, each as an identified call, and gives today's result; a pre-change state resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames, each path tested. The answers phase also accepts a failure outcome per call (size refusal with the reported limit, stall, transient error), mapped to the driver's failure handling and admitted by both MCP input schemas; tested: a controller-reported size refusal re-divides the call, a reported stall or transient error re-issues it once under a new identifier. — owns `sc7`

## 2. Contract details

**Surface level:** internal

### 2.1 `ReviewMaterial.obligations and context (code review, per dimension)`

```typescript
obligations: readonly ReviewObligation[]; context?: readonly ReviewAtom[]  // added to s2's codeReviewMaterial output by each dimension's adapter
```

**Parameters:**
- `subject: CodeReviewSubject` — The saved subject: approved LLD, PLAN, test record and changed files, as today's prompt builders read them.

**Returns:** `ReviewMaterial (sc1)` — adherence: one 'clause' obligation per approved LLD clause and PLAN task, and the clause text as a context atom. The LLD clauses are every section that states what the code must do, as today's single prompt (the whole LLD body) judges them: each contract entry, data-model change, shared-contract interaction, error case, edge case, invariant and migration step, the backward compatibility and the state after, the Story's scope boundary (the hldContextSlice: consume what adjacent Stories own, never re-implement it) and any acceptance criteria an early LLD carries. Every other section is excluded with its reason (testStrategy is coverage's, functionalDefinition functional coverage's, the companion definitions the diagram and ux dimensions', the summary and alternatives are rationale), and a test fails on any LLD section in the repository that is neither judged nor excluded (amended 2026-10-20, after review); none (and no call) without an approved LLD or plan, as today. functional coverage: one 'requirement' obligation per FR. coverage: one 'promised-test' obligation per promised test. Its context is ALL the record evidence today's coverage prompt reads for that test (testRecordView, src/workflow/code-review/dimensions/test-record-view.ts:140): its reportedTests entry (a reported smoke or live pass counts as present and passed, as buildCoveragePrompt says), the build tasks, the record notes, and the status and title atoms of every test file that names it. This is chosen by the test's name, never by which symbols reach it, so a promised test with no test file or reaching edge still gets its evidence. The same holds with empty grounding. conventions: one 'module-conventions' obligation per touched module (the atoms' module values). quality: no obligations. Every obligation exists at prepare, so one with no evidence is still adjudicated.

**Preconditions:**
- Built from the saved subject and the snapshot only.

**Postconditions:**
- The obligation set equals what today's single prompt asks the model to judge.

### 2.2 `AdapterStage.chunkCalls (code-review dimensions)`

```typescript
chunkCalls(chunk: ReviewChunk, prior: StageOutputs, snapshot: ReviewMaterialSnapshot): readonly ChunkPrompt[]
```

**Parameters:**
- `chunk: ReviewChunk` — The chunk's atom ids and neighbour summaries (sc3).
- `prior: StageOutputs` — Earlier stages' outputs (unused by the first stage).

**Returns:** `readonly ChunkPrompt[]` — One structured call per chunk, with the repo as cwd, over the chunk's rows, its neighbour summaries and the context atoms it needs. The answer schema depends on the dimension. adherence, functional coverage and conventions: notes only, [{ key, atomIds, note }], with NO findings array. The note records how the chunk's code realises, partly realises or departs from that obligation (for conventions, the idiom examples and candidate deviations seen in the module), so every finding of these three dimensions comes from the per-obligation judgement over all chunks. coverage: findings restricted to findingKind 'symbol-coverage', each with a symbolId the call carries, plus notes per promised test; promised-test findings come only from gather. quality: today's findings plus descriptions [{ atomId, description }]. A chunk schema cannot express an absence, an unrealized FR or a module verdict, so none can reach the result from a chunk.

**Errors:**
- `AtomTooLargeError (s1)` when A chunk's rendered call cannot fit with its minimum context; s1 names the atom.

**Preconditions:**
- Used only when the plan is not single; the single path keeps today's prompt.

**Postconditions:**
- No chunk answer can carry an absence finding, an obligation verdict or a conventions verdict: the chunk schemas have no field for one.
- Under the limit, s1's single path sends today's prompt and schema unchanged.
- A quality chunk answer carries exactly one description for every atom the call carries, and no other, so every symbol reaches the cross-chunk comparison.

### 2.3 `GatherPlan.obligationCall / reduceCall (code review)`

```typescript
obligationCall(key: string, evidence: readonly EvidenceNote[], context: readonly ReviewAtom[]): ChunkPrompt; reduceCall(key: string, batch: readonly EvidenceNote[]): ChunkPrompt
```

**Parameters:**
- `key: string` — An obligation key of the dimension.
- `evidence: readonly EvidenceNote[]` — Every note for that key from every chunk, reduced by s1 until it fits.
- `context: readonly ReviewAtom[]` — The obligation's own context atoms as s1 supplies them (the material.context entries its atomIds name). Empty once s1 has reduced oversized context into notes (contextReduced): obligationCall renders only what it is given and never re-attaches the obligation's context itself, so a reduced call stays within the limit.

**Returns:** `ChunkPrompt` — obligationCall judges one key with today's rules for that dimension, on all its notes and the obligation's own context atoms, and returns today's findings shape. adherence: departures (located at the atoms the notes name) and unimplemented clauses, with expectationRef. functional coverage: unrealized or partial FRs. coverage: missing or failing promised tests, judged on the full record evidence of that test. conventions: the module's idiom and its deviations, with today's too-few-examples rule. Chunk calls make no conventions findings, so a candidate deviation the module judgement rejects never appears. reduceCall returns one note under the same key, at most noteCapChars (a quarter of the limit), keeping the atom ids it stands for. With zero atoms (s1's divided-with-no-atoms rule), every key is judged on its context alone.

**Preconditions:**
- Keys come from material.obligations.

**Postconditions:**
- A key with no notes is adjudicated on the statement that no chunk showed evidence for it.
- obligationCall renders exactly the context it is passed; after s1 reduces an obligation's context into notes it is passed none, and the call carries those notes instead.

### 2.4 `GatherPlan.relationCall (code review)`

```typescript
relationCall(pair: readonly [ReviewAtom, ReviewAtom], maxChars?: number): readonly ChunkPrompt[]
```

**Parameters:**
- `pair: readonly [ReviewAtom, ReviewAtom]` — A caller and callee joined by a 'calls' relation in ChunkPlan.crossRelations (held in different chunks).
- `maxChars: number` _(optional)_ — Set by s1 when a relation call was refused for its size: every returned call must fit it. The two one-row-against-summary calls are returned and each is measured; a row that cannot fit even so is named by AtomTooLargeError, never cut.

**Returns:** `readonly ChunkPrompt[]` — For the quality and adherence dimensions: one call carrying both full summaries when they fit together, otherwise two calls, one full summary against the other's neighbour summary in each direction (the amended s1 GatherPlan.relationCall). Each judges whether the caller's use matches the callee (arguments, return use, error contract; for adherence, the approved clauses either one carries) and returns today's findings shape, a mismatch located at the caller. Evidence (amended 2026-10-20, after review): these calls judge the same structured summaries today's single prompt reads, which is told to 'reason only over the structured symbol summaries' and is given no file contents: each symbol's signature (its parameters and return type), its callers and callees. A mismatch or a duplication visible at that level (for example a callee that may return undefined and a caller that uses the value as always present) is judged; behaviour only a function body shows is beyond today's single call too, and the epic adds no new review criteria.

**Preconditions:**
- Only 'calls' relations whose ends sit in different chunks.

**Postconditions:**
- Each cut call relation is judged once per dimension that uses relationCall.

### 2.5 `AdapterStage (quality compare and pair stages)`

```typescript
stages 'compare' and 'pair' after 'chunk': chunkCalls/singleCalls as for AdapterStage, kind 'model', onCallFailure 'fail-review'
```

**Parameters:**
- `prior: StageOutputs` — The chunk stage's descriptions (compare) or compare's candidate pairs (pair).

**Returns:** `readonly ChunkPrompt[]` — compare: descriptions from different chunks are packed into batches of at most half the limit, and every pair of batches from different chunks is one call that returns candidate duplicate pairs. pair: each candidate pair is judged on both full summaries when they fit together, else full against description in each direction, returning today's quality findings with counterpartRef. Evidence (amended 2026-10-20, after review): these calls judge the same structured summaries today's single prompt reads, which is told to 'reason only over the structured symbol summaries' and is given no file contents: each symbol's signature (its parameters and return type), its callers and callees. A mismatch or a duplication visible at that level (for example a callee that may return undefined and a caller that uses the value as always present) is judged; behaviour only a function body shows is beyond today's single call too, and the epic adds no new review criteria. Carried material and refusals (amended 2026-10-20, after review, with s1's ChunkPrompt.carries and AdapterStage.redivide): every compare call declares the symbols of both its lists, and every pair call its two symbols, so validation and re-planning see exactly what the call sent. A size-refused compare call is re-packed by the stage into smaller batches within the refused size; a refused pair call holding both rows becomes its two halves within the refused size; a refused half has no smaller form and names its own row as too large (AtomTooLargeError), never cut or resent.

**Preconditions:**
- Runs only when the plan is not single.

**Postconditions:**
- Every two symbols in different chunks are compared through their descriptions.

### 2.6 `GatherPlan.merge / ReviewAdapter.finish (code review)`

```typescript
finish(outputs: StageOutputs, context: FinishContext): DimensionResult; merge(parts: readonly DimensionResult[]): DimensionResult
```

**Parameters:**
- `parts: readonly DimensionResult[]` — The chunk, obligation, relation and pair results.

**Returns:** `DimensionResult` — Findings concatenated in stage order. Identical findings (every field equal) kept once. Every finding is located at file:line, as today's single call locates it: an obligation or relation call lists the symbols its notes or pair name, with their files, and gather.validate rejects a finding located at a note id (or anything not file:line), so it is re-asked once with that reason and then fails the review; merge never rewrites a location (amended 2026-10-20 by the stakeholder's decision: s1's merge does not see the job's notes, and a real location is today's behaviour). Findings outside the changed set are handled as each path does today: the daemon judges drop them (for example src/workflow/code-review/dimensions/quality.ts:124) and the controller step keeps them in outOfScope (src/daemon/steps/code-review-step/handler.ts). For coverage, normalizeCoverageFindings runs once over the merged result with the prepared grounding (src/workflow/code-review/dimensions/coverage.ts:185). pipelineCalls { chunk, obligation, relation, merge } is set; it is absent on a single-chunk review. Who applies what (amended 2026-10-20, after review): s1 calls finish(outputs, { divided }) first and then merge([finish's result, ...obligation parts, ...relation parts]), so finish never sees the gather's findings. On a single-chunk review finish maps today's answer through the dimension's toResult, as today. On a divided review finish returns the chunks' own findings only, unfiltered (coverage's symbol findings, quality's findings, then its pair findings), and merge applies the dimension's result filters ONCE over the whole merged list through its toResult: the changed-set filter, the known-FR filter and coverage's normalisation; on the controller path the out-of-set findings are also kept in outOfScope. So every gather finding passes the same filters a single call's findings do. In particular, functional coverage keeps only findings whose expectationRef is absent or a known FR id (src/workflow/code-review/dimensions/functional-coverage.ts), so an invented FR reference cannot reach the verdict.

**Postconditions:**
- runCodeReview folds the merged results with foldVerdict unchanged (src/workflow/code-review/runner.ts:257).

### 2.7 `runCodeReview`

```typescript
runCodeReview(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts, deps: CodeReviewRunnerDeps = DEFAULT_DEPS): Promise<CodeReviewOutcome>
```

**Parameters:**
- `subject: CodeReviewSubject` — Unchanged.

**Returns:** `Promise<CodeReviewOutcome>` — Unchanged signature and record shape. Over the limit, each dimension's result is the merged DimensionResult above.

**Errors:**
- `CodeReviewOutcome { ok: false, error }` when A call in a fail-review stage fails both attempts, as s1 defines.

**Postconditions:**
- The verdict rule is unchanged.

## 3. Data model changes

### 3.1 `DimensionResult.pipelineCalls` — field-add

Defined by s1 (sc5); this Story writes it for a divided dimension: { chunk, obligation, relation, merge }, where compare and pair calls count under relation. Absent for one call; parts is not written.

**Call sites:**
- `src/workflow/code-review/types.ts:73`

### 3.2 `Smoke record for Epic c2ba6fa6 Story s1` — new

A JSON file beside S003 (docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S003/smoke-c2ba6fa6-s1.json) recording the run date, the installed daemon commit, the verdict and counts, and per dimension the chunk plan (chunk count, chars per chunk) and calls per stage. The review record itself is written by the daemon as today (.insrc/artifacts/CR-c2ba6fa62a148ed1-s1.json). Where the plan comes from (amended 2026-10-20, after review): the installed daemon's code-review RPC returns only the record, and a DimensionResult carries pipelineCalls but not the plan. So runDimensionJob writes a daemon-log line 'review pipeline: plan' for each dimension job twice: once when the job is created (the prepared plan: the dimension, whether it is single, each chunk's id, atom count and chars), and once from s1's runReviewJob onDone hook when the job finishes (the final plan after any refusal re-planning, and pipelineCalls). A job that fails after it was created therefore still has its prepared plan in the log, beside s1's refusal and failure warnings; a failure at prepare, before any plan exists, is the AtomTooLargeError naming the atom, which the smoke reports as its outcome. The smoke reads those lines from the daemon log for its run, and the verdict and counts from the review record.

**Call sites:**
- `.insrc/artifacts/BUILD-c2ba6fa62a148ed1-s1.json`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Adds each dimension's obligations and context atoms to s2's material. |
| `sc2` | consumes | Implements the code-review dimensions' chunkCalls, gather plan (obligationCall, reduceCall, relationCall, merge), quality's extra compare and pair stages, and finish. Quality's compare and pair calls declare their carries (ChunkPrompt.carries) and the two stages re-divide their own refused calls (AdapterStage.redivide). |
| `sc3` | consumes | Reads ChunkPlan.crossRelations for the relation checks and each chunk's neighbours for its prompt. |
| `sc4` | consumes | Every chunk, obligation, reduce, relation, compare and pair call is sent by s1's enveloped driver. |
| `sc5` | consumes | Reads the notes each obligation call carries (their ids and atoms) to list the symbols a finding may be located at, and writes pipelineCalls. |
| `sc6` | consumes | Every call it builds is measured by s1 against limitChars; the relation and pair fallbacks keep each within it. |

## 5. Error paths

**Error cases**

- **A chunk answer names an obligation key that does not exist, or an atom id outside its chunk.** (recoverable)
  - Detection: The chunk stage's validate(answer, call) (amended s1 AdapterStage.validate) checks every note key against material.obligations, and every atomId and symbolId against call.carries.atomIds.
  - Response: Invalid answer: s1 re-issues the call once under a new callId with the reasons as the correction note. A second failure applies fail-review. The reasons have a fixed size (a made-up value is located by count and position, never quoted back). As s1 rules, when a call already fills the limit and leaves no room for the correction, it is re-issued as planned with the omission logged; a second invalid answer still fails the review.
  - User impact: None when the re-issue succeeds; otherwise the review fails and records nothing, as today.
- **A coverage chunk answer carries a finding that is not a symbol-coverage finding of a symbol it was given.** (recoverable)
  - Detection: validate(answer, call) rejects any coverage chunk finding whose findingKind is not 'symbol-coverage', or whose symbolId is not in call.carries.atomIds. The adherence, functional-coverage and conventions chunk schemas have no findings field at all, so their absences cannot be expressed.
  - Response: Invalid answer: one re-issue under a new callId with the reasons, then fail-review.
  - User impact: No false 'missing' or verdict finding from a chunk that saw only part of the change.
- **A pair or relation answer names a counterpart that is not one of the two symbols it was given.** (recoverable)
  - Detection: validate(answer, call) compares counterpartRef and the finding's location with the two atoms in call.carries.atomIds.
  - Response: Invalid answer: one re-issue, then fail-review.
  - User impact: No invented counterpart is recorded.
- **An obligation, relation, compare or pair call fails both attempts.** (terminal)
  - Detection: s1's driver applies the stage's onCallFailure, which is fail-review for every gather stage of code review.
  - Response: The review fails and records nothing; runCodeReview returns { ok: false, error }, as today for a failed dimension.
  - User impact: As today: no partial code-review record.
- **The smoke's code review does not complete on the installed daemon (a refusal, a failure, or an atom too large).** (recoverable)
  - Detection: The smoke reads the code-review RPC outcome; anything other than a recorded verdict fails it.
  - Response: The smoke fails with the outcome and the plan logged; Story s3's ac4 is not met and the Story is not completed.
  - User impact: Acceptance is withheld until the review completes.
- **A quality chunk answer omits a description for a carried symbol, repeats one, or describes a symbol it was not given.** (recoverable)
  - Detection: validate(answer, call) compares the set of description atomIds with call.carries.atomIds; they must be equal and without duplicates.
  - Response: Invalid answer: one re-issue under a new callId naming the missing, duplicate or foreign ids, then fail-review.
  - User impact: No symbol silently drops out of duplicate detection.
- **An obligation answer for functional coverage names an FR that does not exist.** (recoverable)
  - Detection: merge applies today's FR-reference filter once over the merged result, through functional coverage's toResult (expectationRef must be absent or a known FR id).
  - Response: The finding is dropped, as today's judge drops it.
  - User impact: As today.
- **An obligation or relation answer locates a finding at an evidence note id, or at anything that is not file:line.** (recoverable)
  - Detection: gather.validate(answer, call) checks every finding's location is file:line; the call lists the symbols and files its notes or pair name.
  - Response: Invalid answer: one re-issue under a new callId with the reason (fixed size), then fail-review.
  - User impact: No finding is recorded at a location a reader cannot open.
- **A quality compare or pair call is refused for its size below the configured limit.** (recoverable)
  - Detection: s1's applyFailure routes the size refusal of a chunk-stage call whose stage has redivide to that stage.
  - Response: compare: the call's two lists re-packed into smaller batches within the refused size. pair: both rows become the two halves within the refused size; a refused half names its row (AtomTooLargeError). Never resent, never cut. Tested by a refusal of each.
  - User impact: A provider-side size limit below review.chunkTokens does not end the review while any smaller form exists.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A divided review in which an obligation has no notes from any chunk. | Adjudicated on the statement that no chunk showed evidence, so a missing clause, FR or promised test is reported as one call would report it. |
| A degraded (diff) review with promised tests and a large test record. | Coverage has no symbol atoms. Its rendered single call does not fit, so s1 divides it with zero atoms. Every promised test is judged in an obligation call on its full record evidence (reported tests, build tasks, notes, file atoms), packed to fit, and nothing is reported as symbol coverage. |
| Two related functions whose full summaries do not fit one call together. | relationCall returns two calls, one full summary against the other's neighbour summary in each direction; both are counted under relation, and the relation is judged when both are answered. |
| Two symbols with identical findings reported by two chunks. | Kept once. |
| A conventions module whose examples are spread across chunks with fewer than today's minimum examples in each. | Judged once at gather on all examples, under today's too-few-examples rule. |
| A review under the limit. | s1's single-chunk path: today's prompts and result; no chunk, obligation, relation or compare call, and no pipelineCalls. |
| Adherence with neither an approved LLD nor a plan. | No obligations and no call, as today. |
| A promised test passed only as a reported smoke or live run, with no test file and no symbol reaching it. | Its obligation context holds the reported result, so it is judged present and passed, not missing. |
| A conventions candidate deviation seen in one chunk that the module judgement rejects. | It never appears: chunks make no conventions findings, only notes. |

**Invariants to preserve**

- foldVerdict's rule is unchanged: any HIGH blocks, any MED warns, otherwise pass, capped at warn on request. [[c1]]
- Coverage is normalised once over the dimension's whole result on both paths, the daemon (judgeCoverage) and the controller step (src/daemon/steps/code-review-step/handler.ts:534). [[c1]]
- Absence findings come only from a judgement over all the evidence, as in ISSUE-aef82b03's approved design. [[c2]]
- The DimensionResult and DimensionFinding shapes are unchanged apart from the optional pipelineCalls s1 defines. [[c1]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), as the existing code-review tests (src/daemon/__tests__/code-review-rpc.test.ts); providers faked with scripted answers`

**Test levels**

- **unit** — Each dimension's gather pieces in isolation: obligations, chunk validation, obligation and relation prompts, compare and pair, merge and finish.
  - Subjects: `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'each dimension's obligations equal what today's prompt judges: clauses and plan tasks, FRs, promised tests, touched modules; adherence has none without an approved LLD or plan'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a key with no notes is adjudicated on the no-evidence statement'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a relation call carries both full summaries when they fit, else full against neighbour summary in each direction, and every call fits'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a pair answer naming a counterpart outside its two symbols is rejected'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'merge keeps identical findings once, accepts only file:line locations (a note id is re-asked), moves out-of-set findings to outOfScope, and normalises coverage once'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'pipelineCalls counts chunk, obligation, relation and merge calls and is absent on a single-chunk review'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'adherence, functional-coverage and conventions chunk schemas have no findings field, so a missing clause or unrealized FR naming a valid chunk location cannot be recorded from a chunk'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a promised test passed only by a reported smoke run, with no test file or reaching edge, gets that evidence in its obligation context and is not reported missing'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a conventions candidate rejected by the module judgement is absent from the merged result'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'out-of-set findings are dropped on the daemon path and kept in outOfScope on the controller path, as today'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by merge, as today'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a quality chunk answer missing, repeating or adding a description is rejected, re-issued once, then fails the review'`
  - Fixtures: `a grounding and subject that divide under a small test limit`, `scripted provider answers keyed by stage and callId`
- **integration** — A divided review end to end through runCodeReview, compared with the same material in one call under a raised limit; cross-chunk mismatch and duplicate detection.
  - Subjects: `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a divided review and the same material in one call under a raised limit give the same obligation verdicts for every dimension, on fixtures that fit both ways'`, `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a caller and callee in different chunks whose contract disagrees are judged in a relation call and the mismatch is reported at the caller'`, `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'two duplicate symbols in different chunks are named by compare and reported by pair with counterpartRef'`, `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a degraded review whose single call is over the limit is divided with zero atoms and judges every promised test at gather on its full record evidence'`, `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a gather call failing twice fails the review and records nothing'`
  - Fixtures: `recorded or scripted answers for the divided and single runs`, `a fixture pair of related functions with a mismatched contract`, `a fixture pair of duplicated functions with unrelated names`
- **smoke** — Epic c2ba6fa6 Story s1's code review on the installed daemon (ac4).
  - Subjects: `src/workflow/review-pipeline/__tests__/smoke-c2ba6fa6-s1.live.test.ts: 'Epic c2ba6fa6 Story s1's code review completes on the installed daemon, records a verdict, and writes the chunk plan and calls per stage to the smoke record'`
  - Fixtures: `INSRC_LIVE_TESTS=1`, `the installed daemon updated to the s3 build`, `Epic c2ba6fa6 Story s1's BUILD, LLD, PLAN and TESTS records`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a divided review and the same material in one call under a raised limit give the same obligation verdicts for every dimension, on fixtures that fit both ways'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a key with no notes is adjudicated on the no-evidence statement'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'merge keeps identical findings once, accepts only file:line locations (a note id is re-asked), moves out-of-set findings to outOfScope, and normalises coverage once'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'adherence, functional-coverage and conventions chunk schemas have no findings field, so a missing clause or unrealized FR naming a valid chunk location cannot be recorded from a chunk'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a promised test passed only by a reported smoke run, with no test file or reaching edge, gets that evidence in its obligation context and is not reported missing'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a conventions candidate rejected by the module judgement is absent from the merged result'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by merge, as today'` |
| `ac2` | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a caller and callee in different chunks whose contract disagrees are judged in a relation call and the mismatch is reported at the caller'` |
| `ac3` | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'two duplicate symbols in different chunks are named by compare and reported by pair with counterpartRef'`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a quality chunk answer missing, repeating or adding a description is rejected, re-issued once, then fails the review'` |
| `ac4` | `src/workflow/review-pipeline/__tests__/smoke-c2ba6fa6-s1.live.test.ts: 'Epic c2ba6fa6 Story s1's code review completes on the installed daemon, records a verdict, and writes the chunk plan and calls per stage to the smoke record'` |

## 7. Migration

**State before:** After s1 and s2, a code review over the limit is divided into chunks of related code (s2), but no dimension has chunk prompts, obligations or a gather plan, so it cannot be judged across chunks. Today each dimension judges once (src/workflow/code-review/runner.ts:171), coverage is prepared and normalised once on both paths (src/workflow/code-review/dimensions/coverage.ts:135, src/workflow/code-review/dimensions/coverage.ts:185, src/daemon/steps/code-review-step/handler.ts:534), and foldVerdict folds the counts (src/workflow/code-review/runner.ts:257). ISSUE-aef82b03's per-dimension gather design was approved but not built. Epic c2ba6fa6 Story s1 has no code-review record because its review was refused for size. As of the 2026-10-20 amendments, PLAN tasks t1-t6 have been through the build gate (the BUILD record; t2's scope finding is carried to the BUILD approval): obligations, chunk calls, obligation adjudication, relation checks and quality's compare and pair stages. t7's divided finish and merge are implemented and committed but not yet through the build gate (finish returns the chunks' own findings; merge applies the dimension's filters once), with the note-id rule, the fuller adherence obligations, and the compare and pair carries and refusals added after review. What remains: the divided-versus-single integration tests (t8), and the plan log line with the installed-daemon smoke (t9).

**State after:** Each model-judged dimension's adapter has obligations and context, chunk prompts that return findings plus keyed notes, an obligation adjudication per key, relation checks for cut call relations (quality, adherence), quality's compare and pair stages, a divided finish that returns the chunks' own findings, and a merge that folds every part into today's DimensionResult through the dimension's filters with pipelineCalls. A divided review gives one result per dimension and today's verdict rule. Epic c2ba6fa6 Story s1's code review completes on the installed daemon and its smoke record is written.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the per-dimension obligations, context and chunk prompts, with each chunk stage's validate. — ↩ rollbackable
2. Add each dimension's gather plan (obligationCall, reduceCall, relationCall for quality and adherence, merge) and quality's compare and pair stages; merge applies each dimension's toResult once over the merged result (coverage normalised once, the FR filter, the changed-set filter) and s1 sets pipelineCalls; finish returns only the chunks' own findings on a divided review. — ↩ rollbackable
3. Run the unit and integration suites, including the divided-versus-single comparison on fixtures that fit both ways. — ↩ rollbackable
4. Rebuild and update the installed daemon, then run the smoke: Epic c2ba6fa6 Story s1's code review through the daemon's code-review RPC, writing the smoke record beside S003. runDimensionJob writes the 'review pipeline: plan' log line (onDone) that the smoke reads. — ↩ rollbackable

**Backward compat:** No public signature, IPC payload or record shape changes beyond s1's optional pipelineCalls. Under the limit every dimension keeps s1's single-chunk path and today's prompt. Existing code-review records stay valid; DimensionResult.parts is left as it is and not written.

## 8. Alternatives considered

### 8.1 a1: Per-dimension gather plans on s1's GatherPlan, carried over from ISSUE-aef82b03's strategies — **CHOSEN**

Each model-judged dimension's adapter gets chunk prompts (today's prompt over the chunk's rows, neighbour lines and its context) that return today's findings plus evidence notes keyed by obligation; s1's gather adjudicates every obligation key on all notes, judges each cut call relation in a relation call, and quality adds a compare stage for cross-chunk duplicates; merge folds the chunks' findings and every part into today's DimensionResult.

Obligations per dimension, all created at prepare so a key with no evidence is still adjudicated: adherence keys each approved LLD clause and PLAN task; functional coverage each FR; coverage each promised test; conventions each touched module. Each dimension's chunkCalls build today's prompt over the chunk's rows (the s2 material), with the chunk's neighbour summaries and the context atoms the chunk needs (clauses, FRs, test-record atoms of the files its symbols reach). The answer schema is today's findings plus notes [{key, atomIds, note}]. Chunk answers never emit absence findings (unimplemented clause, unrealized FR, missing promised test, module idiom verdict); only obligation adjudication does. GatherPlan.obligationCall adjudicates one key on its notes and its own context atom, with today's rules (conventions keeps today's too-few-examples rule and confirms or drops chunk-level candidate deviations). reduceCall merges a key's notes under the quarter-limit cap. GatherPlan.relationCall judges each 'calls' relation in ChunkPlan.crossRelations once, on the two symbols' full summaries, and reports a mismatch between caller and callee as a finding at the caller's location; it is used by quality and adherence, the dimensions that judge behaviour. Quality's adapter adds a model stage 'compare' after its chunk stage: chunk answers include a one-line description per symbol, descriptions from different chunks are packed into batch pairs within the limit, and each pair call names duplicate candidates, which a 'pair' stage judges on both full summaries, reporting duplication with counterpartRef. merge concatenates findings, keeps identical ones once, accepts only file:line locations (a note id is re-asked), and drops any finding outside the changed set as today. merge runs the dimension's toResult once over the merged result (for coverage, normalizeCoverageFindings once), and DimensionResult gets pipelineCalls. foldVerdict is unchanged. The smoke runs Epic c2ba6fa6 Story s1's code review through the installed daemon's code-review RPC and writes the verdict, chunk plan and calls per stage to a smoke record beside S003.

### 8.2 a2: One synthesis gather per dimension

Chunks return today's findings plus free-form notes; one gather call per dimension (reduced level by level when too large) reads all chunks' findings and notes and judges obligations, cross-chunk relationships and duplicates together.

No per-obligation keys: every note goes under one key per dimension, the gather call receives all notes (reduced under the quarter cap when needed) plus the dimension's context, and returns the dimension's final findings. Relations and duplicates are judged from notes, not from the full summaries.

**Rejected because:** Cheaper, but one note pool per dimension and judgements on notes weaken ac1-ac3.

### 8.3 a3: Deterministic union, no gather calls

The gather concatenates chunk findings and treats an obligation as met when any chunk reports evidence for it; no relation or duplicate check.

Chunks return findings plus obligation evidence flags; merge unions findings and reports an obligation unmet only if no chunk flagged it. No model call at gather.

**Rejected because:** No gather judgement at all; fails ac2 and ac3.

## 9. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: How per-dimension results fold into the verdict and where coverage is prepared and normalised, with every caller (insrc_analyze_step how-does-it-work, plus a gr`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: The per-dimension gather already designed in ISSUE-aef82b03's approved LLD, which this Story carries into the pipeline (t5-t14 there were superseded, not built)`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: Upstream s1 and s2 LLD contracts this Story consumes, and the smoke subject.`
- **[[c4]]** `prior-artifact` `HLD-8315a11f29fd2812`
- **[[c5]]** `prior-artifact` `DEF-8315a11f29fd2812`
- **[[c6]]** `step-output` `s2 alternatives`
- **[[c7]]** `step-output` `s3 judge`
- **[[c8]]** `step-output` `s4 contract`
- **[[c9]]** `step-output` `s5 error paths`
- **[[c10]]** `step-output` `s6 test strategy`
- **[[c11]]** `step-output` `s7 migration`
- **[[c12]]** `step-output` `s8 checklist`
