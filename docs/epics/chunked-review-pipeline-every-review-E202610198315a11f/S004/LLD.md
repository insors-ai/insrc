<!-- insrc:artifact LLD-8315a11f29fd2812-s4 -->

# LLD: E202610198315a11f:S004

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**HLD base run:** `wf-1792389266411-gvxl8y`
**HLD effective hash:** `044189484c77...`

This Story lets a design document too long for one call be reviewed in coherent parts that still give one result. The document is split at its headings into whole sections. A section is kept with the sections it links to or whose ids it uses, and with its sibling sections, and each chunk gets the document's outline and a short summary of every related section held in another chunk. An HLD or LLD review then runs one reviewer session per chunk under today's checklist and merges the answers item by item, with extra checks that sections in different chunks agree. A DEF or plan review extracts its premises chunk by chunk and verifies them one by one as today. Under the limit, every review is exactly today's.

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
- `s3`: The code-review adapter's gather: per-dimension chunk prompts, obligation keys and their adjudication over all chunks' evidence, the cross-chunk relationship check, the cross-chunk duplicate comparison for quality, and the fold into today's DimensionResult and verdict. It also owns the acceptance smoke: Epic c2ba6fa6 Story s1's code review runs on the installed daemon, completes and records a verdict, with the chunk plan and calls per stage written to the smoke record. Tests: S003/ac1 a divided review and the same material reviewed in one call under a raised limit give the same obligation verdicts on fixtures that fit both ways; ac2 a mismatch between related functions in different chunks is reported; ac3 a cross-chunk duplicate is reported; ac4 the installed-daemon smoke above.
- `s5`: The two controller steps' use of the job, and the MCP boundary that admits it: the new answers phase in the insrc_review_step and insrc_code_review_step input schemas in src/mcp/server.ts, their registered schema contracts and tool descriptions, with schema and surface tests (src/mcp/__tests__/schema-registry.test.ts); keeping it in step state, frame sizing, answer validation by call identifier, and offering a review under the limit today's prompts as identified calls in the same frame shape. Compatibility: the controller step states gain an optional pipeline field; a state without it (saved before the change) is resumed on today's path; both stores are memory-only, so, as today, a state does not survive a daemon restart. Tests: S005/ac1 a controller review over the limit is handed the daemon's chunks one frame at a time and records the same kind of result; ac2 a missing or wrong identifier in an answer is rejected and the call offered again under a new UUID; ac3 a new controller review under the limit is offered today's prompts, each as an identified call, and gives today's result; a pre-change state resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames, each path tested. The answers phase also accepts a failure outcome per call (size refusal with the reported limit, stall, transient error), mapped to the driver's failure handling and admitted by both MCP input schemas; tested: a controller-reported size refusal re-divides the call, a reported stall or transient error re-issues it once under a new identifier. — owns `sc7`

## 2. Contract details

**Surface level:** internal

### 2.1 `ReviewAdapter.material (design review)`

```typescript
material(): ReviewMaterial  // built by designReviewMaterial(documentText: string, fits: (atomText: string) => boolean): ReviewMaterial
```

**Parameters:**
- `documentText: string` — The document markdown in the job's snapshot (snapshot.documentText); never re-read from disk.
- `fits: (atomText: string) => boolean` — Supplied by the adapter for its review kind: renders the minimal real call holding just this atom (the template session prompt with the resolved template and stage, or the extract prompt for the stage, plus the outline, title and envelope) and measures it against limitChars. designReviewMaterial stays a pure text parser and asks fits() only to decide subdivision.

**Returns:** `ReviewMaterial (sc1)` — atoms: one per level-2 section (heading line plus body up to the next level-2 heading), in document order. A level-2 section for which fits() is false is replaced by its level-3 subsections (then level 4), each atom labelled with its heading path. The text between a parent heading and its first child heading travels with the first child. id = `sec<n>`, the section's occurrence index in document order (unique even when two sections share a heading), label = the heading path. The heading's anchor slug is kept separately and used only to resolve #anchor links; where two headings share a slug, the slug resolves the way markdown renderers do (the second gets the -1 suffix). The text before the first level-2 heading (title, metadata, summary and any body) is itself a reviewed atom, 'preamble', placed in the first chunk, so its premises are judged like any section's. A document with no level-2 heading is one atom: the whole document; if it does not fit, it is split at level-3 headings, and with none it is reported by AtomTooLargeError as 'the whole document (no headings)'. context: an 'outline' atom (every heading with its number) and the document's title line, carried by every chunk. relations: 'references' from a section to each section it links (#anchor links), cites by number (§2.4, section 2.4), or uses an id defined there (sc3, s2, k5, ac1, c14, t3, a1 and the like, resolved to the first section that defines the id as a heading, table row or list item); 'same-module' between sections under the same parent heading. obligations: ALWAYS empty, for both design adapters: s1 makes no obligation calls for a design review. The checklist is resolved once at prepare (resolveDesignReview, then reviewTemplateFor, as today), and the WHOLE resolved template ({ id, intent, maxPremises, items[{ id, dimension, check }] }) is saved with the job's subject, together with the review kind and stage. A rebuilt adapter uses that saved template and never re-reads the artifact store or readDesignReviewSettings, so a configuration change mid-review cannot alter it. The template's check items are never ReviewMaterial obligations: they are the checklist each chunk session answers, merged per item by the template adapter's merge.

**Errors:**
- `AtomTooLargeError (s1)` when A section with no smaller subsections for which fits() is false; named by its heading path.

**Preconditions:**
- Built from the snapshot's document text only.

**Postconditions:**
- Every character of the document belongs to exactly one reviewed atom; nothing is context-only.
- Deterministic: the same text gives the same atoms, relations and order.

### 2.2 `ReviewAdapter.neighbourSummary (design review)`

```typescript
neighbourSummary(atom: ReviewAtom, material: ReviewMaterial): string
```

**Parameters:**
- `atom: ReviewAtom` — A related section held in another chunk.
- `material: ReviewMaterial` — To list the ids the section defines.

**Returns:** `string` — The heading path, the ids the section defines, and its first sentences up to 300 characters, with no model call.

**Postconditions:**
- The section itself is reviewed whole in its own chunk; only this extra line is shortened.

### 2.3 `AdapterStage.chunkCalls (template review: one reviewer session per chunk)`

```typescript
chunkCalls(chunk: ReviewChunk, prior: StageOutputs): readonly ChunkPrompt[]  // execution: { mode: 'reviewer-session', cwd: repo, deadlineMs, tools: 'read-only' }
```

**Parameters:**
- `chunk: ReviewChunk` — The chunk's sections and neighbour summaries.

**Returns:** `readonly ChunkPrompt[]` — One reviewer session per chunk: today's buildTemplateReviewPrompt system text (src/workflow/review/template.ts:182) and checklist, preceded by a note that this is part k of n of the document. The DESIGN part carries the preamble, the outline, the chunk's sections whole, and a 'related sections held in other parts' block of neighbour summaries. The reviewer judges premises found in these sections and answers every check item, using notApplicable for an item with nothing in these sections. The schema is today's TEMPLATE_ANSWER_SCHEMA.

**Preconditions:**
- Used only when the plan is not single; under the limit the stage keeps today's single prompt.

**Postconditions:**
- Each chunk answer passes validateTemplateAnswer (src/workflow/review/template.ts:310), with maxPremises as a ceiling per session.

### 2.4 `AdapterStage.validate (template chunk answers)`

```typescript
validate(answer: unknown, call: ReviewCall): readonly string[]
```

**Parameters:**
- `answer: unknown` — A chunk's template answer.
- `call: ReviewCall` — The session call it answers.

**Returns:** `readonly string[]` — The errors from validating a chunk answer with today's rules (the same checks validateTemplateAnswer makes). An invalid answer is re-issued once by the pipeline with today's correction text. A valid answer is kept as a ValidatedChunkAnswer, not converted to findings: { items: [{ item, notApplicable?: string, premises: [{ premise, outcome, severity, evidence, action, files: string[] }] }] }, produced by a new parseTemplateAnswer in src/workflow/review/template.ts. validateTemplateAnswer keeps its signature and result, implemented over the same parse.

### 2.5 `AdapterStage.chunkCalls (premise review extract stage)`

```typescript
chunkCalls(chunk: ReviewChunk, prior: StageOutputs): readonly ChunkPrompt[]  // execution: { mode: 'structured', cwd: repo }
```

**Parameters:**
- `chunk: ReviewChunk` — The chunk's sections and neighbour summaries.

**Returns:** `readonly ChunkPrompt[]` — One extract call per chunk: today's buildExtractPrompt (src/workflow/review/extract.ts:136) system text and EXTRACT_SCHEMA, over the outline and title, the chunk's sections and neighbour summaries, extracting the premises of these sections only. Chunk answers accumulate in the job's answered list, NOT in the snapshot. When the stage's last chunk answer has been applied, the stage output is written ONCE to snapshot.claims (s1's rule): every chunk's claims in chunk order, each re-keyed to a job-unique raw id `r<chunk>-<k>`, where k is the claim's position in that chunk's answer. The model's own id is kept separately as localId, because it can repeat within a chunk and across chunks. The deterministic probe stage (runStage) merges raw claims with the same normalised text and anchors into a MergedClaim: { id: `p<n>` numbered in first-appearance order, text, kind, anchors (union), probe (union of greps and reads, de-duplicated), sources: [{ rawId, localId, chunkId, ref? }], owningChunk: the first source's chunkId }. It gathers evidence for each merged claim, keyed by the merged id as Evidence is today, and outputs [{ claim, evidence }], which s1 writes once to snapshot.evidence. Verify, the controller's per-chunk batches (grouped by owningChunk) and any resumed or re-planned job read the merged claims from snapshot.evidence, never the raw snapshot.claims. MergedClaim is a Claim (same fields, id unique) plus sources and owningChunk, so verifyClaim, normalizeFinding and the id-keyed maps in runReview and handleVerdicts work unchanged.

**Postconditions:**
- Premise extraction failing in any chunk after two attempts fails the review, as today (fail-review).

### 2.6 `GatherPlan.relationCall (design review)`

```typescript
relationCall(pair: readonly [ReviewAtom, ReviewAtom]): readonly ChunkPrompt[]
```

**Parameters:**
- `pair: readonly [ReviewAtom, ReviewAtom]` — A 'references' relation cut between chunks: the referring section and the referenced one.

**Returns:** `readonly ChunkPrompt[]` — Template review only. For a cut 'references' relation, the call carries the FACTS on both sides, quoted whole and never shortened. From the referenced section: the definition excerpt of each id, anchor or number the referring section uses (the heading block, table row, list item or paragraph that defines it). From the referring section: every paragraph, row or list item that mentions it. Facts beyond either section's opening are therefore always compared. When all of a pair's excerpts do not fit one call, they are split per referenced id. For each id, its usage excerpts are packed by the s1 packer into batches that each fit WITH that id's definition excerpt, giving one call per batch, so every returned call fits limitChars. If the definition excerpt and a single usage excerpt cannot fit together, AtomTooLargeError names the pair (the id, the defining heading and the using heading); a single excerpt larger than the limit is named the same way. Each call records its provenance: the two section ids, the referenced id, and the excerpts it carries. Each call asks whether the uses agree with the definition (names, signatures, ids, numbers, rules) and returns premises in today's template premise shape, each under a check item id of the template. A premise review makes no relation calls.

**Postconditions:**
- Every relation call fits limitChars.
- Each cut reference is checked on its full definition and every usage excerpt, across as many calls as needed.
- The provenance of each relation premise is kept in the job.

### 2.7 `GatherPlan.merge / ReviewAdapter.finish (design review)`

```typescript
template adapter, R = ValidatedChunkAnswer: merge(parts: readonly ValidatedChunkAnswer[]): ValidatedChunkAnswer; finish(outputs: StageOutputs): ValidatedChunkAnswer. premise adapter, R = readonly Finding[]: merge and finish over findings
```

**Parameters:**
- `parts: readonly ValidatedChunkAnswer[]` — Every chunk's validated answer and every relation call's premises, in chunk order then relation order.

**Returns:** `R (ValidatedChunkAnswer for the template adapter; readonly Finding[] for the premise adapter)` — This satisfies sc2 as written: merge(parts: R[]) => R and finish => R, each with one R per adapter. Template adapter: merge per check item as before (premises unioned; identical premises, by normalised text and normalised file set, kept once with does-not-hold over could-not-verify over holds and HIGH over MED over LOW; notApplicable only when unanimous). It has no obligations, so s1 never calls its obligationCall or reduceCall (which return the empty-gather prompts) and makes no obligation calls. runTemplateReview takes the job's R and builds today's ReviewReport from it: it converts to findings exactly as validateTemplateAnswer does, assigns report-wide unique claimIds (`${item}.${n}` across each item's merged premises, relation premises included), and runs computeVerdict with today's blockOn, tally and the template id, setting pipelineCalls when divided. Premise adapter: R is the findings of every verified or not-judged premise; runReview folds them as today. The merged premise count may exceed maxPremises, which stays a per-session ceiling.

**Postconditions:**
- Satisfies sc2's merge(parts: R[]) => R and finish => R.
- The verdict rules are unchanged.
- claimIds are unique across the whole report.

### 2.8 `runReview / runTemplateReview`

```typescript
runReview(artifactMarkdown: string, opts: RunReviewOpts): Promise<ReviewReport>; runTemplateReview(artifactMarkdown: string, opts: RunReviewOpts): Promise<ReviewReport>
```

**Parameters:**
- `artifactMarkdown: string` — Unchanged.

**Returns:** `Promise<ReviewReport>` — Unchanged signatures and report shape. Over the limit, the design-review adapter's divided path runs.

**Errors:**
- `Error (time limit)` when The job's deadline passes, with today's message. A divided template review's budget is the per-session limit times its planned sessions, each session capped at 30 minutes (s1's amended deadline rule, decided 2026-10-20).

### 2.9 `buildBatchedVerifyPrompt (controller premise stage plan)`

```typescript
buildBatchedVerifyPrompt(claims: readonly Claim[], evidence: readonly Evidence[]): { system: string; user: string }
```

**Parameters:**
- `claims: readonly Claim[]` — One chunk's de-duplicated claims when divided; all claims under the limit, as today.

**Returns:** `{ system: string; user: string }` — Today it is a private function in src/daemon/steps/review-step/phases/claims.ts:64, called only by handleClaims there. This Story moves it, unchanged, to src/workflow/review/verify.ts as an export beside buildVerifyPrompt, so the workflow-layer adapter can use it without importing from the daemon. handleClaims imports it from there and keeps its behaviour. The controller stage plan offers one batched verify call per chunk's claims when divided, and today's single batch otherwise; s5 offers the frames.

## 3. Data model changes

### 3.1 `ReviewReport.pipelineCalls` — field-add

Defined by s1 (sc5); this Story writes it for a divided design review: chunk (sessions or extract calls), obligation (0), relation (relation calls), merge (0). Absent when single.

**Call sites:**
- `src/workflow/review/types.ts:144`

### 3.2 `ValidatedChunkAnswer` — new

Internal to the design-review adapter: a chunk's checklist answer after validation, keeping items, notApplicable reasons and premises with their file sets, so merge can de-duplicate before findings are made. Produced by parseTemplateAnswer (new, src/workflow/review/template.ts); validateTemplateAnswer is re-expressed over it with no change to its signature or results.

**Call sites:**
- `src/workflow/review/template.ts:310`

### 3.3 `MergedClaim (design review, divided premise path)` — new

A Claim with a job-unique id `p<n>` plus sources [{ rawId, localId, chunkId, ref? }] and owningChunk. It lives only in snapshot.evidence; existing Claim and Evidence consumers read it as a Claim.

**Call sites:**
- `src/workflow/review/types.ts:93`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Produces design-review material: section atoms (the preamble included), outline and title context, and references and same-module relations. obligations is always empty for design review. |
| `sc2` | consumes | Implements the design adapters within sc2 as written: the template adapter with R = ValidatedChunkAnswer and no obligations (so no obligation calls), the premise adapter with R = findings; material with a review-kind fits() measure, neighbourSummary, chunkCalls, validate, relationCall, merge and finish. runTemplateReview and runReview build today's ReviewReport from R. |
| `sc3` | consumes | Uses the chunk plan, crossRelations and neighbours. |
| `sc4` | consumes | Every session, extract, relation and verify call is enveloped by s1. |
| `sc5` | consumes | snapshot.claims holds the raw extraction, written once when the extract stage completes. The deterministic probe stage merges duplicates (union of probes, all source refs kept) and its output [{ claim, evidence }] is written once to snapshot.evidence, the only claim set verify and resumed jobs read. Also writes pipelineCalls and keeps not-judged premises. |
| `sc6` | consumes | Section splitting and every call are measured against limitChars. |

## 5. Error paths

**Error cases**

- **A section with no subsections is too large for any call.** (terminal)
  - Detection: designReviewMaterial measures the section's minimal call (instructions, preamble, outline, the section alone, the envelope) against limitChars after splitting down to its leaf headings.
  - Response: AtomTooLargeError naming the heading path, before any provider call. The section is never cut.
  - User impact: The review stops and names the section, rather than judging part of it.
- **A chunk's template answer breaks the checklist (an item missing or doubled, too many premises, a does-not-hold premise without files).** (recoverable)
  - Detection: AdapterStage.validate runs validateTemplateAnswer on the chunk answer.
  - Response: Re-issued once under a new callId with today's correction text, then fail-review: no review is recorded, as today.
  - User impact: As today.
- **A relation answer names a check item id the template does not have.** (recoverable)
  - Detection: validate(answer, call) checks every premise's item against the template's item ids.
  - Response: Invalid answer: one re-issue, then fail-review.
  - User impact: No premise is filed under an invented item.
- **Extraction fails twice in one chunk of a premise review.** (terminal)
  - Detection: The extract stage's onCallFailure is fail-review.
  - Response: The review fails and records nothing, as today.
  - User impact: As today.
- **A premise's verify call fails twice in a divided review.** (recoverable)
  - Detection: The verify stage's onCallFailure is record-not-judged.
  - Response: That premise is recorded as a MED not-judged finding; the rest are kept (ISSUE-d4b2cd1c).
  - User impact: The review blocks under the default policy, but is recorded.
- **The divided template review runs past its time limit.** (terminal)
  - Detection: s1's driver compares now with job.deadlineAt before each session, and each session runs with the remaining time.
  - Response: The review fails with today's time-limit message and records nothing.
  - User impact: Rare: the budget is the per-session limit times the planned sessions (s1's amended rule), so only sessions that each run near their limit exhaust it.
- **Two chunks produce findings for the same check item.** (recoverable)
  - Detection: finish numbers claimIds across the merged premises of each item.
  - Response: Every finding gets a unique claimId, so a resolution recorded against one never applies to another.
  - User impact: Resolving one finding leaves the others blocking as they should.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A document under the limit. | s1's single path: today's one session or one extract call, unchanged. |
| A level-2 section with no subsections that alone fills most of a chunk. | It is one atom, with its references as neighbour summaries if they do not fit with it. |
| A reference to an id the document never defines (for example an id from another document). | No relation; the text stays as written. |
| The same premise extracted from two chunks (a section and the section it references, summarised in both). | Merged into one claim in the probe stage. Its probes are the union of both extractions' greps and reads, so evidence either asked for is gathered, and both source refs are kept. |
| A check item that only one chunk finds premises for. | The item carries that chunk's premises; the other chunks' notApplicable is dropped for it. |
| A plan or DEF whose sections reference HLD contract ids defined in another document. | Unresolved ids give no relation; same-module relations still keep sibling sections together. |
| Text before the first level-2 heading that makes design claims. | It is the 'preamble' atom, reviewed in the first chunk; its premises are judged like any section's. |
| A document with no level-2 headings. | One atom; under the limit, today's single review. Over the limit it is split at level-3 headings, and without any it is named too large. |
| Two sections in different chunks that conflict in facts stated deep in both. | The relation call carries the definition and usage excerpts, wherever they sit, so the conflict is compared. |

**Invariants to preserve**

- Each template answer is validated by today's validateTemplateAnswer, on both the daemon session and the controller findings phase. [[c1]]
- The verdict is computeVerdict over the findings with today's blockOn, and counts come from tally, unverified included on template reviews. [[c1]]
- Premise verification stays one call per premise on the daemon, with its 3-minute limit, and records a premise that fails twice as not judged. [[c1]]
- The controller premise review under the limit sends today's single batched verify prompt. [[c1]]
- The material is built from the snapshot's document text only. [[c2]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), as src/workflow/review/__tests__/template.test.ts`

**Test levels**

- **unit** — Section atoms, references, neighbour summaries, the per-item merge, claim de-duplication and validation.
  - Subjects: `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'a document splits at level-2 headings, an oversized section into its subsections, and every character belongs to one atom or the preamble'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'anchor links, numbered section references and defined ids give references relations to the defining section; an undefined id gives none'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'sections under one parent heading get same-module relations'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'a leaf section whose minimal call exceeds the limit raises AtomTooLargeError naming its heading path'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'a neighbour summary carries the heading path, defined ids and first sentences, deterministically'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'chunk answers merge per check item: premises unioned, identical premises kept once at the worst outcome, notApplicable only when every chunk says so'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'a relation answer naming an unknown check item is rejected'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'duplicate claims from several chunks are merged in the probe stage with the union of their probes, so complementary and contradictory evidence are both gathered'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'a preamble with design claims is a reviewed atom; a heading-free document is one atom'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'merge works on validated chunk answers: files normalised, outcome and severity precedence applied, notApplicable kept only when unanimous'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'two chunks' findings under the same item get unique claimIds, and resolving one leaves the other blocking'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'chunk answers accumulate outside the snapshot; snapshot.claims is written once after the last extract answer, including when the job is resumed between answers'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'an id with many usages is checked in usage batches that each fit with its definition'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'a definition and one usage that cannot fit together raise AtomTooLargeError naming the id and both headings'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'template obligations come from the template resolved at prepare and saved with the subject; designReviewMaterial has no obligations'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'subdivision follows the adapter's fits(): the same text splits differently for a template session and an extract call when their prompts differ in size'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'the template adapter makes no obligation calls and its R is the merged validated answer; runTemplateReview turns it into today's ReviewReport'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'verify and a resumed job read the merged claims from snapshot.evidence; snapshot.claims keeps the raw extraction'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'distinct claims repeating a local id within one chunk and across chunks get distinct raw ids; duplicate claims with different probes merge with both probes'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'a rebuilt adapter uses the saved resolved template, maxPremises and items included, even after the design-review settings change'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'design-review material has no obligations, so a divided design review makes no obligation calls'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'two sections with the same heading get distinct atom ids, and #anchor links resolve to the right one'`
  - Fixtures: `markdown fixtures: an HLD and a DEF with cross-references, made to divide under a small test limit`
- **integration** — Divided template and premise reviews end to end under a small limit, compared with the same document in one call.
  - Subjects: `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a divided HLD review keeps each section with the sections it references, runs one session per chunk and gives one ReviewReport under today's verdict rules'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a chunk whose section references a section in another chunk carries that section's summary'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'two sections in different chunks that disagree are reported by the relation check'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a divided DEF review extracts per chunk, verifies each premise, records a premise whose verify fails twice as not judged, and folds one verdict'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'the controller plan under the limit offers one batched verify prompt; over the limit one per chunk'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a document under the limit is reviewed exactly as today'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a divided HLD review with three planned sessions gets three per-session limits of budget, and no session runs past 30 minutes'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a conflict between facts stated beyond both sections' openings is found by the relation call's definition and usage excerpts'`, `src/daemon/steps/review-step/__tests__/review-step.test.ts: 'handleClaims still sends one batched verify prompt after buildBatchedVerifyPrompt moves to src/workflow/review/verify.ts'`
  - Fixtures: `scripted reviewer-session and structured answers keyed by stage and callId`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a divided HLD review keeps each section with the sections it references, runs one session per chunk and gives one ReviewReport under today's verdict rules'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'a document splits at level-2 headings, an oversized section into its subsections, and every character belongs to one atom or the preamble'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'a leaf section whose minimal call exceeds the limit raises AtomTooLargeError naming its heading path'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'a preamble with design claims is a reviewed atom; a heading-free document is one atom'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'subdivision follows the adapter's fits(): the same text splits differently for a template session and an extract call when their prompts differ in size'` |
| `ac2` | `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a chunk whose section references a section in another chunk carries that section's summary'`, `src/workflow/review-pipeline/__tests__/design-review-material.test.ts: 'anchor links, numbered section references and defined ids give references relations to the defining section; an undefined id gives none'` |
| `ac3` | `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a divided HLD review keeps each section with the sections it references, runs one session per chunk and gives one ReviewReport under today's verdict rules'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a divided DEF review extracts per chunk, verifies each premise, records a premise whose verify fails twice as not judged, and folds one verdict'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'chunk answers merge per check item: premises unioned, identical premises kept once at the worst outcome, notApplicable only when every chunk says so'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a divided HLD review with three planned sessions gets three per-session limits of budget, and no session runs past 30 minutes'`, `src/workflow/review-pipeline/__tests__/design-review-divided.test.ts: 'a conflict between facts stated beyond both sections' openings is found by the relation call's definition and usage excerpts'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'merge works on validated chunk answers: files normalised, outcome and severity precedence applied, notApplicable kept only when unanimous'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'two chunks' findings under the same item get unique claimIds, and resolving one leaves the other blocking'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'an id with many usages is checked in usage batches that each fit with its definition'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'a definition and one usage that cannot fit together raise AtomTooLargeError naming the id and both headings'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'the template adapter makes no obligation calls and its R is the merged validated answer; runTemplateReview turns it into today's ReviewReport'`, `src/workflow/review-pipeline/__tests__/design-review-gather.test.ts: 'verify and a resumed job read the merged claims from snapshot.evidence; snapshot.claims keeps the raw extraction'` |

## 7. Migration

**State before:** After s1, a design review over the limit has no material to divide (s1 bundles). runTemplateReview sends the whole document in one reviewer session (src/workflow/review/template.ts:182) under one limit capped at 30 minutes (src/workflow/review/template.ts:62). extractClaims sends the whole document in one extract call (src/workflow/review/extract.ts:136). verifyClaim works per premise without the document (src/workflow/review/verify.ts:214), and computeVerdict folds the findings (src/workflow/review/verdict.ts:44).

**State after:** A design review over the limit is divided into heading sections kept with the sections they reference and their siblings. Template reviews run one reviewer session per chunk and merge per check item, with relation checks for cut references. Premise reviews extract per chunk, de-duplicate and verify per premise. One ReviewReport under today's verdict rules. Under the limit, unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Move buildBatchedVerifyPrompt unchanged from src/daemon/steps/review-step/phases/claims.ts to src/workflow/review/verify.ts as an export, and import it in handleClaims. — ↩ rollbackable
2. Add designReviewMaterial and its neighbourSummary under src/workflow/review-pipeline/adapters, as pure functions of the document text, with unit tests. — ↩ rollbackable
3. Add the template adapter's per-chunk session prompt, validation, relation calls and per-item merge, and the premise adapter's per-chunk extract with claim de-duplication and the per-chunk controller verify batches. — ↩ rollbackable
4. Run the divided-review integration tests against single-call runs of the same fixtures, then rebuild and update the installed daemon. — ↩ rollbackable

**Backward compat:** runReview and runTemplateReview keep their signatures; ReviewReport keeps its shape apart from s1's optional pipelineCalls. validateTemplateAnswer, verifyClaim, computeVerdict and buildBatchedVerifyPrompt are unchanged. Under the limit, every design review is exactly today's.

## 8. Alternatives considered

### 8.1 a1: Sections as atoms with reference relations; per-chunk sessions and extraction; deterministic merge plus relation checks — **CHOSEN**

A design-review material builder turns the snapshot's document text into heading-section atoms with 'references' and 'same-module' relations and a deterministic outline context. Divided template reviews run one reviewer session per chunk and merge the checklist answers per item, with relation calls checking cut references. Divided premise reviews extract claims per chunk, de-duplicate them, and verify as today.

Material: the document is split at level-2 headings. A level-2 section larger than the limit is split into its level-3 subsections (then level 4), each atom keeping its heading path, and a leaf section still too large raises s1's AtomTooLargeError naming its heading. The text before the first level-2 heading is itself a reviewed atom ('preamble', in the first chunk), and a generated outline of every heading plus the title line is context carried by every chunk; a heading-free document is one atom. Relations: 'references' from a section to each section it links (#anchor links, numbered references such as §2.4, and ids such as sc3, s2, k5, ac1 or c14, resolved to the section that defines them); 'same-module' between sections under the same parent heading. neighbourSummary writes the heading path, the ids the section defines and its first sentences up to 300 characters, with no model call. Template review over the limit: one reviewer-session call per chunk with today's checklist rules, the outline and preamble, the chunk's sections and their neighbour summaries. The reviewer judges the premises of these sections and answers every check item (premises, or notApplicable meaning 'nothing in these sections'). Each chunk answer is validated by validateTemplateAnswer, with maxPremises as a per-session ceiling. Gather merges per check item: the union of premises, with identical premises (same normalised text and files) kept once at their worst outcome; an item is notApplicable only if every chunk says so. relationCall checks each cut 'references' relation on the full definition excerpts of the referenced ids and every usage excerpt in the referring section (batched per id so each call fits), reporting a premise under the check item it names (validated against the template's ids) when the two sections disagree. Premise review over the limit: the extract stage runs per chunk with the outline and neighbour summaries; claims from all chunks are de-duplicated (same normalised text and anchors) and given ids in chunk order before they enter the snapshot; probe and verify run per claim as today, since a verify prompt holds the claim and evidence, not the document. Controller path: one batched verify prompt per chunk's claims over the limit, today's single batch under it. finish merges validated chunk answers per item, assigns report-wide unique claimIds, and folds the findings with computeVerdict and today's blockOn, tally and the template id; pipelineCalls is set when divided.

### 8.2 a2: One reviewer session that reads the document from disk

For template reviews, send the outline and the document path instead of its text and let one reviewer session read the sections it needs; premise reviews divide extraction as in a1.

The reviewer session already has read-only tools, so the prompt carries the checklist, the outline and the path, and the session reads sections itself. The session's own context management handles size. Premise extraction is divided as in a1.

**Rejected because:** Simple, but cannot guarantee every section is read, and the session can still overflow.

### 8.3 a3: Sequential section packing without references

Sections are packed in document order until a chunk is full; no relations, no neighbour summaries, no relation checks.

Atoms as in a1, but chunks are consecutive sections packed by size, and gather is the per-item union only.

**Rejected because:** Divides by size alone, which the Epic rules out.

## 9. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: How design documents become a ReviewReport on the template (HLD/LLD) and premise (DEF/plan) paths, and who calls them, including the controller step (insrc_anal`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: What the approved s1 LLD gives the design-review adapter.`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: Tests to extend.`
- **[[c4]]** `prior-artifact` `HLD-8315a11f29fd2812`
- **[[c5]]** `prior-artifact` `DEF-8315a11f29fd2812`
- **[[c6]]** `step-output` `s2 alternatives`
- **[[c7]]** `step-output` `s3 judge`
- **[[c8]]** `step-output` `s4 contract`
- **[[c9]]** `step-output` `s5 error paths`
- **[[c10]]** `step-output` `s6 test strategy`
- **[[c11]]** `step-output` `s7 migration`
- **[[c12]]** `step-output` `s8 checklist`
