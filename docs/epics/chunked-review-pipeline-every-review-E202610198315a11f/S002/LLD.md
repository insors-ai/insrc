<!-- insrc:artifact LLD-8315a11f29fd2812-s2 -->

# LLD: E202610198315a11f:S002

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**HLD base run:** `wf-1792389266411-gvxl8y`
**HLD effective hash:** `044189484c77...`

This Story gives the code-review adapter its material, so a large code review is divided along the lines of the code itself. Each changed symbol in the review's grounding becomes one whole atom. Changed symbols are related when one calls the other, when they share a file and when they share a directory, so the pipeline keeps related code together in that order. A changed symbol held in another chunk is described to the reviewer by a short line written from its signature and its related names, with no model call. Nothing in the grounding, the IPC or today's prompts changes.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Interaction with shared contracts](#3-interaction-with-shared-contracts)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-8315a11f29fd2812** § 2. Framework summary

**Rollout phase:** Phase B — divided code review and divided design review
**Consumes:** `sc1` (ReviewMaterial), `sc2` (ReviewAdapter), `sc3` (ReviewChunk and ChunkPlan), `sc4` (CallEnvelope), `sc6` (Chunk limit setting)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The pipeline module itself: measurement, the generic grouping that packs related atoms together within the limit, staged execution with deterministic stages, the envelope schema wrapping, identifier generation and checking, the pipeline-owned retry policy (providers called with internalRetry: false; one re-issue under a new UUID, two attempts in all), per-stage failure policies, refusal re-division, the serial daemon driver, single-chunk pass-through, the bounded gather machinery (evidence notes keyed by obligation, level-by-level reduction under a note cap, provenance kept in the job, refused gather calls re-planned), and the adoption of ISSUE-aef82b03's InputTooLargeError, inputBudgetChars, packIntoBatches and ReviewJob loop. Change sites beyond the new module: CliProvider (internalRetry honoured by withTransientRetry, runReviewSession and its structured-output retry; a size refusal in the claude reviewer-session error envelope and the codex session classified as InputTooLargeError, as completeStructured already does), OllamaProvider (internalRetry: false maps completeStructured to one attempt; a read-only reviewer session over a generic tool loop extracted from runShaperToolLoop in src/analyze/context/driver.ts, the analyzer keeping its own wrapper), and the single-chunk adapters for both review kinds, so every review takes the pipeline path from s1 on with today's calls and working directory (structured calls run in the repository, as today for code review; the premise review's verify calls gain it as an additive change): one model stage per model-judged code-review dimension, adherence making no call without an approved LLD or plan, ux deterministic on the daemon and diagram's handlers as today (deterministic ones stay deterministic, a failing handler stays a LOW observation); one reviewer session for HLD/LLD; extract, probe, then one verify per premise for DEF/plan, with ISSUE-d4b2cd1c's not-judged recording kept. Tests: S001/ac1 an under-limit code review, template review and premise review each make today's calls and give today's result (recorded fixtures), the diagram dimension included; ac2 a missing or wrong identifier is retried once under a new UUID and no prompt hash repeats, including transient errors, stalls and invalid answers on both CliProvider and OllamaProvider; premise extraction failing fails the review while a verify call failing twice records the premise as not judged; ac3 the default limit is 384,000 characters for every provider; ac4 a size refusal from completeStructured, the claude session envelope and the codex session re-divides the call and never resends it; ac5 a review on an Ollama provider completes through both execution modes; plus a live probe of the envelope schema on claude and codex. Also tested: an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits, and the final verdict keeps every atom's provenance; every structured review call runs in the repository working directory. Also tested: a premise verify call keeps its 3-minute limit through the pipeline; a refused call is re-divided from exactly the atoms and notes it carried; the controller premise review under the limit still sends one batched verify prompt. Also tested: refusal re-planning reads only the job's material snapshot, never the graph or files, so a reindex between turns cannot change the material a call is re-divided from. The ux stage reads companion-mock existence from the snapshot's file facts recorded at prepare, not from disk; tested: adding or removing a mock after prepare does not change the review result. — owns `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`
- `s3`: The code-review adapter's gather: per-dimension chunk prompts, obligation keys and their adjudication over all chunks' evidence, the cross-chunk relationship check, the cross-chunk duplicate comparison for quality, and the fold into today's DimensionResult and verdict. It also owns the acceptance smoke: Epic c2ba6fa6 Story s1's code review runs on the installed daemon, completes and records a verdict, with the chunk plan and calls per stage written to the smoke record. Tests: S003/ac1 a divided review and the same material reviewed in one call under a raised limit give the same obligation verdicts on fixtures that fit both ways; ac2 a mismatch between related functions in different chunks is reported; ac3 a cross-chunk duplicate is reported; ac4 the installed-daemon smoke above.
- `s4`: The design-review adapter: document sections as atoms, cross-reference relations, section summaries for neighbours, chunk prompts for the template checklist and the premise pipeline, and the gather of checklist answers or premise verdicts into today's ReviewReport and verdict rules. Tests: S004/ac1 every section appears whole in some chunk with the sections it references; ac2 a cross-chunk reference yields a section summary; ac3 a divided HLD/LLD review and a divided DEF/plan review each give one ReviewReport under today's verdict rules, and a premise whose call fails twice is still recorded as not judged. Its controller stage plan keeps today's single batched verify prompt under the limit; over the limit it batches premises per chunk.
- `s5`: The two controller steps' use of the job, and the MCP boundary that admits it: the new answers phase in the insrc_review_step and insrc_code_review_step input schemas in src/mcp/server.ts, their registered schema contracts and tool descriptions, with schema and surface tests (src/mcp/__tests__/schema-registry.test.ts); keeping it in step state, frame sizing, answer validation by call identifier, and offering a review under the limit today's prompts as identified calls in the same frame shape. Compatibility: the controller step states gain an optional pipeline field; a state without it (saved before the change) is resumed on today's path; both stores are memory-only, so, as today, a state does not survive a daemon restart. Tests: S005/ac1 a controller review over the limit is handed the daemon's chunks one frame at a time and records the same kind of result; ac2 a missing or wrong identifier in an answer is rejected and the call offered again under a new UUID; ac3 a new controller review under the limit is offered today's prompts, each as an identified call, and gives today's result; a pre-change state resumes on today's emit_judgements / judgements (code review), emit_claims / claims and emit_verdicts / verdicts (DEF/plan premise review) and emit_findings / findings (HLD/LLD template review) frames, each path tested. The answers phase also accepts a failure outcome per call (size refusal with the reported limit, stall, transient error), mapped to the driver's failure handling and admitted by both MCP input schemas; tested: a controller-reported size refusal re-divides the call, a reported stall or transient error re-issues it once under a new identifier. — owns `sc7`

## 2. Contract details

**Surface level:** internal

### 2.1 `ReviewAdapter.material (code review)`

```typescript
material(): ReviewMaterial  // built by codeReviewMaterial(grounding: CodeReviewGrounding): ReviewMaterial
```

**Parameters:**
- `grounding: CodeReviewGrounding` — The dimension's own grounding, exactly as today's prompt builder receives it, derived deterministically from the snapshot's subject and grounding. For most dimensions it is the snapshot grounding itself. For coverage it is prepareCoverageGrounding(subject, grounding, groundingMode) (src/workflow/code-review/dimensions/coverage.ts:135), which both narrows to eligible symbols and adds coverageEvidence. s3's per-dimension adapter supplies it. Never re-queried.

**Returns:** `ReviewMaterial (sc1)` — atoms: one ReviewAtom per ChangedSymbolSummary of that grounding, in grounding order, with id = entityId, label = file#name, file = the summary's file, module = the file's directory, and text = the row's own JSON serialisation (its content, which the chunk prompt carries; it is not a size measure). relations: 'calls' between symbols A and B when B.name is in A.callees or A.name is in B.callers (a name matching several rows of the grounding relates to each of them); 'same-file' between atoms with the same file; 'same-module' between atoms with the same directory. obligations: empty (s3 supplies the dimension's obligations). context: absent (s3 supplies the dimension's context atoms).

**Preconditions:**
- The grounding is the dimension's prepared grounding, derived from the snapshot (s1 sc5) as today's prompt builder derives it.
- s1's prepare groups by relation kind in the order the s1 LLD fixes (createReviewJob postcondition): calls, then same-file, then same-module, splitting an oversized group along the next-weaker kind.
- Whether a chunk fits is decided by s1, which measures each fully rendered chunk call (instructions, the chunk's rows in the prompt's array form, neighbour summaries, context and the envelope) against limitChars, as the delivered job measures promptChars of the rendered messages (src/workflow/code-review/review-job.ts:175). Atom text is never used as the size of a prompt.

**Postconditions:**
- Every row of the given grounding appears exactly once as a whole atom; none is cut or dropped.
- A diff review's rows (kind 'file', empty callers and callees, src/workflow/code-review/grounding.ts:339) yield no 'calls' relations and no 'same-file' relations beyond themselves, only 'same-module' ones.
- Deterministic: the same grounding and filter always give the same material, in the same order.

### 2.2 `ReviewAdapter.neighbourSummary (code review)`

```typescript
neighbourSummary(atom: ReviewAtom, material: ReviewMaterial): string
```

**Parameters:**
- `atom: ReviewAtom` — A changed-symbol atom held in another chunk that is related to an atom in this chunk.
- `material: ReviewMaterial` — The same material, used to name the atom's related changed symbols.

**Returns:** `string` — One deterministic line, with no model call: '<kind> <name> in <file>: <the signature's first line, at most 200 characters>; calls: <related changed callee names>; called by: <related changed caller names>'. It implements the optional sc2 member ReviewAdapter.neighbourSummary that the s1 LLD defines; s1's prepare puts it in NeighbourSummary.summary and sets atomId, label and heldInChunk.

**Preconditions:**
- The atom came from codeReviewMaterial.

**Postconditions:**
- Only this extra line is shortened. The atom itself is reviewed whole in the chunk that holds it (k8).
- The same atom always gives the same line, so a re-plan reproduces it.

### 2.3 `assembleCodeReviewGrounding`

```typescript
assembleCodeReviewGrounding(repoPath: string, changedFiles: readonly string[], deps: GroundingDeps): Promise<CodeReviewGrounding>
```

**Parameters:**
- `repoPath: string` — Unchanged.
- `changedFiles: readonly string[]` — Unchanged.
- `deps: GroundingDeps` — Unchanged.

**Returns:** `Promise<CodeReviewGrounding>` — Consumed unchanged; it remains the source of the snapshot this Story's material is built from.

**Postconditions:**
- Not modified by this Story.

## 3. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Produces ReviewMaterial for code review from the dimension's prepared grounding: atoms from its rows, and relations of kinds calls, same-file and same-module. Obligations and context are left to s3. |
| `sc2` | consumes | Supplies the code-review adapter's material() body and its neighbourSummary member, the optional ReviewAdapter.neighbourSummary the s1 LLD defines. Stages, chunk prompts and gather stay with s1 and s3. |
| `sc3` | consumes | Its relations drive s1's grouping into ReviewChunks; its writer fills NeighbourSummary.summary for each related atom held in another chunk. |
| `sc4` | consumes | Adds no model call, so it issues nothing under the envelope. Its atom ids are what ReviewCall.carries.atomIds records. |
| `sc6` | consumes | Fitting a chunk within limitChars (review.chunkTokens x 3) is s1's measurement of the rendered chunk call; this Story's atoms only supply the content. |

## 4. Error paths

**Error cases**

- **One changed symbol's summary alone exceeds the chunk limit (in practice a diff review row whose signature holds a whole file's hunks).** (terminal)
  - Detection: s1's prepare renders the minimal valid call holding that atom alone (the dimension's instructions, the atom as a one-row array, its neighbour summaries, the context it must carry and the call envelope) and measures that whole call against limitChars, as the delivered packer does (sizeOf([item]) over the built prompt). An atom whose singleton call does not fit cannot fit in any chunk. Atom text alone is never the measure.
  - Response: AtomTooLargeError naming the atom by its label (file#name, or the file path for a diff row), raised before any provider call. The atom is never cut and no review is recorded, as s1 defines.
  - User impact: The review stops and names the oversized symbol, rather than judging part of it silently.
- **Two atoms would share an id (the grounding lists the same entity twice).** (terminal)
  - Detection: codeReviewMaterial checks entityId uniqueness while building atoms.
  - Response: Throws an Error naming the duplicate entityId and both labels. Material with a duplicate atom id would make carries and provenance ambiguous.
  - User impact: The review fails before any call, with the duplicate named.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two changed symbols named the same in different files, one calling a third changed symbol. | The name match relates the third symbol to both. Grouping keeps all three together when they fit, and over-relating never drops the true relation. |
| A caller or callee name that matches no row of the dimension's grounding (an unchanged entity, or a symbol coverage's preparation excluded). | No relation; the name stays in the atom's own text as today. |
| A diff review (kind 'file' rows with empty callers and callees). | Only same-module relations, so files in the same directory are kept together. |
| A symbol calling itself (its own name among its callees). | No self-relation. |
| A file at the repository root. | module is '.', so root files share one module. |
| The dimension's prepared grounding is empty (for example coverage on a degraded review, where prepareCoverageGrounding lists no symbols). | Empty atoms and relations; the single-chunk path applies, as today. |
| Material under the limit. | s1's single-chunk path is used; the relations and neighbour summaries are not used, so today's prompt is unchanged. |

**Invariants to preserve**

- The grounding's shape, the IPC payload and assembleCodeReviewGrounding are unchanged. A graph grounding holds structured summaries with no file text. A diff review's grounding keeps its existing diff text: each changed file's hunks in its row's signature (src/workflow/code-review/grounding.ts:339). [[c1]]
- Each dimension prompt serialises its grounding as today. A chunk's prompt fit is measured on the rendered call by s1, never on atom text. [[c1]]
- The material is built from the job's snapshot only, never from a graph or file re-query. [[c2]]
- Coverage's narrowing and its coverageEvidence enrichment stay in prepareCoverageGrounding; coverage material is built from its output, so a coverage chunk carries the same rows today's prompt does. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), as the grounding and review-job tests in s1's third bundle`

**Test levels**

- **unit** — codeReviewMaterial and neighbourSummary on hand-built groundings: atoms, relations, determinism, edge cases.
  - Subjects: `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'each included summary is one atom with id entityId, label file#name, the file's directory as module, and text equal to the row's JSON'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a callee or caller name matching a changed symbol gives a calls relation; a same-named pair relates to both; no self-relation; an unmatched name gives none'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'same-file and same-module relations join atoms sharing a file or directory; a diff review gets same-module relations only'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'coverage material built from prepareCoverageGrounding keeps only eligible rows and carries their coverageEvidence'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a duplicate entityId throws an error naming it'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'the same grounding gives identical material and identical neighbour summaries every time'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a neighbour summary names kind, name, file, the first signature line within 200 characters, and the related changed names'`
  - Fixtures: `hand-built CodeReviewGrounding rows covering call chains, same-named symbols, shared files and directories, and diff rows`
- **integration** — The material through s1's prepare with a small limit: grouping order, neighbour summaries on both sides of a cut, whole atoms, and an oversized atom named.
  - Subjects: `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'over the limit, symbols that call each other share a chunk before symbols that only share a file, and those before symbols that only share a directory'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a call relation cut between two chunks gives each chunk a neighbour summary of the other symbol'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every changed symbol is whole in exactly one chunk and every chunk fits the limit'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a summary larger than the limit on its own raises AtomTooLargeError naming its file#name'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'under the limit the plan is one chunk and the dimension prompt is unchanged'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every rendered chunk call, with array formatting, neighbours, context and envelope, measures within limitChars'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call'`
  - Fixtures: `the s1 prepare entry point with a test limitChars`, `groundings large enough to divide under that limit`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'over the limit, symbols that call each other share a chunk before symbols that only share a file, and those before symbols that only share a directory'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every changed symbol is whole in exactly one chunk and every chunk fits the limit'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a callee or caller name matching a changed symbol gives a calls relation; a same-named pair relates to both; no self-relation; an unmatched name gives none'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every rendered chunk call, with array formatting, neighbours, context and envelope, measures within limitChars'` |
| `ac2` | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a call relation cut between two chunks gives each chunk a neighbour summary of the other symbol'`, `src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a neighbour summary names kind, name, file, the first signature line within 200 characters, and the related changed names'` |
| `ac3` | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every changed symbol is whole in exactly one chunk and every chunk fits the limit'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a summary larger than the limit on its own raises AtomTooLargeError naming its file#name'`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call'` |

## 6. Migration

**State before:** After s1, a code review over the limit has no code-review material to divide (s1 bundles). The grounding (src/workflow/code-review/types.ts:133) holds ChangedSymbolSummary rows whose callers and callees are names only (src/workflow/code-review/grounding.ts:103), with no module field; a graph grounding carries no source text, while a diff review's rows are files whose signature holds their diff hunks, with no edges (src/workflow/code-review/grounding.ts:339). The delivered review job packed symbol atoms by size alone (src/workflow/code-review/review-job.ts:40), with no relation between them and no neighbour summaries.

**State after:** The code-review adapter's material() is built by codeReviewMaterial from the snapshot's grounding: one whole atom per included changed symbol, plus calls, same-file and same-module relations. s1's prepare groups by them and attaches a deterministic neighbour summary for each related atom held in another chunk. Under the limit nothing changes: one chunk and today's prompt.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add codeReviewMaterial and neighbourSummary under src/workflow/review-pipeline/adapters, as pure functions of the grounding, with their unit tests. — ↩ rollbackable
2. Point the code-review adapter's material() and neighbour-summary slot at them, so a review over the limit is divided by relations. Under the limit the single-chunk path is unchanged. — ↩ rollbackable
3. Rebuild and update the installed daemon. No stored record, grounding or config changes. — ↩ rollbackable

**Backward compat:** No public API, IPC payload, grounding shape, prompt or stored record changes. assembleCodeReviewGrounding and ChangedSymbolSummary are untouched. The new functions are internal to the pipeline module. A review under the limit sends exactly today's prompt.

## 7. Alternatives considered

### 7.1 a1: Material derived from today's grounding, call relations matched by name — **CHOSEN**

A pure function turns the snapshot's CodeReviewGrounding into sc1 ReviewMaterial (one atom per changed-symbol summary; calls, same-file and same-module relations), plus a deterministic neighbour-summary writer; nothing in the grounding changes.

A new codeReviewMaterial(grounding) in src/workflow/review-pipeline/adapters/code-review-material.ts builds the material. Each ChangedSymbolSummary of the dimension's prepared grounding (s3 supplies it; for coverage, prepareCoverageGrounding's output) becomes one ReviewAtom: id entityId, label file#name, file, module = the file's directory, and text = the row's JSON as content; s1 measures each rendered chunk call for fit. A 'calls' relation joins changed symbols A and B when B's name is in A's callees or A's name is in B's callers. A name that matches several changed symbols relates to all of them, so a true relation is never missed and an ambiguous one only keeps more code together. 'same-file' and 'same-module' relations join atoms sharing a file or a directory; s1's generic grouping consumes them in the kind order calls, same-file, same-module. A diff review's rows (kind 'file', no callers or callees) get same-module relations only. neighbourSummary(atom) writes a short deterministic line with no model call: kind, name, file, the signature's first line cut at 200 characters, and the related changed names. It fills s1's neighbour-summary slot. The material is a function of the snapshot alone.

### 7.2 a2: Add caller and callee ids to the grounding

assembleCodeReviewGrounding also records callerIds and calleeIds (deps.callersOf and deps.calleesOf already return GroundedEntity.id), and call relations are matched by id, with a name match as fallback for older snapshots and diff rows.

ChangedSymbolSummary gains optional callerIds and calleeIds, filled at grounding time from the GroundedEntity ids the graph seams already return. codeReviewMaterial builds 'calls' relations by id when they are present and by name otherwise. Atoms, file and module relations, and neighbour summaries are as in a1. Because today's dimension prompts serialise grounding.symbols whole, each prompt builder must strip the new fields to keep s1's single-chunk prompts unchanged, or accept that today's prompts grow.

**Rejected because:** Exact call relations, but it changes the IPC grounding and either today's prompts or five prompt builders, and it still needs a1's name fallback.

### 7.3 a3: Model-written neighbour summaries

As a1 for atoms and relations, but each neighbour summary is produced by a short model call summarising the related symbol.

Prepare issues one summarise call per atom that is cut from a related atom, through the pipeline's enveloped calls, and stores the answers in the snapshot so that re-plans reuse them. The chunk prompts then carry model-written summaries.

**Rejected because:** Model-written summaries put model calls and a new failure path into prepare, with little to summarise beyond the signature.

## 8. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: How the code-review grounding represents changed symbols and their callers/callees, and the delivered atom shape (insrc_` — "callers and callees are entity NAMES only, not ids"
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: What the approved upstream designs leave for s2 to fill (HLD and s1 LLD).` — "the generic grouping and neighbour-summary slots exist for s2/s4 to fill"
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: Tests that cover the grounding and the delivered job, to extend.`
- **[[c4]]** `prior-artifact` `HLD-8315a11f29fd2812`
- **[[c5]]** `prior-artifact` `LLD-8315a11f29fd2812-s1`
- **[[c6]]** `step-output` `s2 alternatives`
- **[[c7]]** `step-output` `s3 judge`
- **[[c8]]** `step-output` `s4 contract`
- **[[c9]]** `step-output` `s5 error paths`
- **[[c10]]** `step-output` `s6 test strategy`
- **[[c11]]** `step-output` `s7 migration`
- **[[c12]]** `step-output` `s8 checklist`
- **[[c13]]** `code` `src/workflow/code-review/grounding.ts:103`
