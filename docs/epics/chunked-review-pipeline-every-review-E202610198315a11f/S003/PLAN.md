<!-- insrc:artifact PLAN-8315a11f29fd2812-s3 -->

# Plan: E202610208315a11f:S003

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**LLD run:** `wf-1792401350307-1gkpsq`
**LLD effective hash:** `044189484c77...`

Building this Story gives every model-judged code-review dimension a divided path on top of s1's pipeline and s2's material. Each dimension states what it must judge (obligations with their context), reads chunks with prompts that can only take notes or chunk-local findings, and adjudicates every obligation once on the notes from all chunks. Quality and adherence check calls that cross chunks, and quality compares symbol descriptions across chunks to find duplicates. The merged result folds into today's DimensionResult and verdict. The Story ends by updating the installed daemon and running Epic c2ba6fa6 Story s1's code review, which was refused for size, as the acceptance smoke.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)
4. [Feedback](#4-feedback)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Obligations and context atoms per code-review dimension | M | — | unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'each dimension's obligations equal what today's prompt judges: clauses and plan tasks, FRs, promised tests, touched modules; adherence has none without an approved LLD or plan'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a promised test's obligation context holds its reported result, build tasks, notes and test-file atoms chosen by name, also with empty grounding, and is identical on every rebuild' | [[c1]] |
| 2 | **`t2`** Notes-only chunk stage for adherence, functional coverage and conventions | M | `t1` | unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'adherence, functional-coverage and conventions chunk schemas have no findings field, so a missing clause or unrealized FR naming a valid chunk location cannot be recorded from a chunk'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a notes-only chunk call carries the chunk's rows, neighbour lines and context atoms within the limit, and under the limit the single prompt is today's' | [[c2]] [[c10]] |
| 3 | **`t3`** Chunk stage for coverage and quality | M | `t1` | unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a quality chunk answer missing, repeating or adding a description is rejected, re-issued once, then fails the review' | [[c2]] [[c10]] |
| 4 | **`t4`** Obligation adjudication and reduction per dimension | M | `t2`, `t3` | unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a key with no notes is adjudicated on the no-evidence statement'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a conventions candidate rejected by the module judgement is absent from the merged result'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a promised test passed only by a reported smoke run, with no test file or reaching edge, gets that evidence in its obligation context and is not reported missing'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a key whose notes exceed the limit is reduced into notes within noteCapChars and then judged, and every gather call fits' | [[c3]] [[c10]] |
| 5 | **`t5`** Cross-chunk relation checks for quality and adherence | M | `t4` | unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a relation call carries both full summaries when they fit, else full against neighbour summary in each direction, and every call fits'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a relation answer naming a counterpart or location outside its two symbols is rejected, re-issued once, then fails the review' | [[c4]] [[c10]] |
| 6 | **`t6`** Quality's compare and pair stages for cross-chunk duplicates | M | `t3` | unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a pair answer naming a counterpart outside its two symbols is rejected'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'every two symbols in different chunks are compared through their descriptions in calls within the limit, and no compare or pair call is made under the limit'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'compare and pair calls are counted under pipelineCalls.relation, not chunk' | [[c5]] [[c8]] [[c10]] |
| 7 | **`t7`** Merge and finish into today's DimensionResult | M | `t4`, `t5`, `t6` | unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'merge keeps identical findings once, accepts only file:line locations (a note id is re-asked), moves out-of-set findings to outOfScope, and normalises coverage once'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'out-of-set findings are dropped on the daemon path and kept in outOfScope on the controller path, as today'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by merge, as today'; unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'pipelineCalls counts chunk, obligation, relation and merge calls and is absent on a single-chunk review' | [[c6]] [[c7]] [[c8]] |
| 8 | **`t8`** Divided-versus-single equivalence and failure through runCodeReview | M | `t7` | integration: src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a divided review and the same material in one call under a raised limit give the same obligation verdicts for every dimension, on fixtures that fit both ways'; integration: src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a caller and callee in different chunks whose contract disagrees are judged in a relation call and the mismatch is reported at the caller'; integration: src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'two duplicate symbols in different chunks are named by compare and reported by pair with counterpartRef'; integration: src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a degraded review whose single call is over the limit is divided with zero atoms and judges every promised test at gather on its full record evidence'; integration: src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a gather call failing twice fails the review and records nothing' | [[c7]] [[c10]] [[c11]] |
| 9 | **`t9`** Update the installed daemon and run the c2ba6fa6/s1 smoke | S | `t8` | smoke: src/workflow/review-pipeline/__tests__/smoke-c2ba6fa6-s1.live.test.ts: 'Epic c2ba6fa6 Story s1's code review completes on the installed daemon, records a verdict, and writes the chunk plan and calls per stage to the smoke record' | [[c9]] [[c12]] |

### 1.1 E202610208315a11f:S003:T001 — Obligations and context atoms per code-review dimension

In src/workflow/review-pipeline/code-review.ts (and a new src/workflow/review-pipeline/adapters/code-review-obligations.ts), each model dimension's material() adds obligations and context built from the saved subject and the snapshot only. adherence: one 'clause' obligation per approved LLD clause (keys derived deterministically from the LLD body: each contractDetails entry, dataModelChanges entry, errorPaths case and invariant) and one per PLAN task (its task id), each clause's text a context atom the obligation names; none and no call without an approved LLD or plan (today's skip). functional coverage: one 'requirement' per FR (functionalRequirementsOf). coverage: one 'promised-test' per promised test (promisedTestsOf), its context ALL the record evidence testRecordView gives for that test chosen by name (reportedTests entry, build tasks, record notes, status and title atoms of every test file naming it), also with empty grounding. conventions: one 'module-conventions' per touched module (the atoms' module values). quality: none.

**Acceptance checks:**
- Each dimension's obligation set equals what today's single prompt asks the model to judge: LLD clauses and PLAN tasks, FRs, promised tests, touched modules; quality has none.
- Adherence has no obligations and makes no call without an approved LLD or plan, as today.
- A promised test passed only by a reported smoke or live run, with no test file or reaching edge, has that reported result in its obligation context; this holds with empty grounding.
- Obligations and context are built from the saved subject and the snapshot only, and are identical on every rebuild.

### 1.2 E202610208315a11f:S003:T002 — Notes-only chunk stage for adherence, functional coverage and conventions

The 'judge' stage of adherence, functional coverage and conventions gets chunkCalls(chunk, prior, snapshot): one structured call in the repository over the chunk's rows (the s2 atoms, in today's array form), its neighbour lines and the context atoms the chunk needs, with today's framing. The answer schema is notes only, [{ key, atomIds, note }], with NO findings field: the note records how the chunk's code realises, partly realises or departs from the obligation (for conventions, idiom examples and candidate deviations seen in the module). validate(answer, call) rejects an unknown note key and an atomId outside call.carries.atomIds; withCorrection re-issues with the reasons; gather.notesFrom reads the keyed notes. The single path keeps today's prompt and schema.

**Acceptance checks:**
- The adherence, functional-coverage and conventions chunk schemas have no findings field, so no chunk answer can record an absence finding, an obligation verdict or a conventions verdict.
- A chunk answer with an unknown key or an atom outside its call's carries is rejected and re-issued once with a correction note, then fails the review. The reasons have a fixed size (a made-up value is located by count and position, never quoted back); when a call already fills the limit and leaves no room for the correction, it is re-issued as planned with the omission logged, as s1's approved LLD rules (src/workflow/review-pipeline/job.ts), and a second invalid answer still fails the review.
- Every chunk call measures within the limit with its rows, neighbour lines and context atoms.
- Under the limit s1's single path sends today's prompt and schema unchanged.

### 1.3 E202610208315a11f:S003:T003 — Chunk stage for coverage and quality

Coverage's 'judge' stage gets chunkCalls returning symbol-coverage findings only (findingKind 'symbol-coverage', each with a symbolId the call carries) plus notes per promised test; quality's returns today's findings plus descriptions [{ atomId, description }], one per carried atom. validate(answer, call) rejects a coverage finding that is not symbol coverage of a carried symbol, a note key or atom outside the call, and a quality description set not equal to the carried atoms (missing, repeated or foreign ids named in the reasons); withCorrection re-issues with the reasons. The single path keeps today's prompts and schemas.

**Acceptance checks:**
- A coverage chunk finding that is not symbol coverage of a carried symbol is rejected and re-issued once with a correction note, then fails the review; promised-test findings come only from gather.
- A quality chunk answer carries exactly one description for every atom the call carries, and no other; a missing, repeated or foreign description is rejected, re-issued once, then fails the review.
- Under the limit s1's single path sends today's coverage and quality prompts and schemas unchanged.

### 1.4 E202610208315a11f:S003:T004 — Obligation adjudication and reduction per dimension

Each model dimension with obligations gets a gather plan: obligationCall(key, evidence, context) judges one key with today's rules for that dimension on all its notes and the obligation's own context atoms, returning today's findings shape (adherence: departures located at the atoms the notes name, and unimplemented clauses, with expectationRef; functional coverage: unrealized or partial FRs; coverage: missing or failing promised tests on the test's full record evidence; conventions: the module's idiom and deviations with today's too-few-examples rule). A key with no notes is judged on the statement that no chunk showed evidence for it; with zero atoms every key is judged on its context alone. reduceCall returns one note under the same key within noteCapChars (a quarter of the limit), keeping its atom ids. partOf maps an obligation answer to a DimensionResult part. Locations are governed by today's per-dimension filters, applied by merge (t7), not by a gather validate.

**Acceptance checks:**
- A key with no notes is adjudicated on the no-evidence statement, so a missing clause, FR or promised test is reported as one call would report it.
- A conventions candidate deviation seen in one chunk that the module judgement rejects never appears in the result.
- A key whose notes exceed the limit is reduced by reduceCall into notes within noteCapChars and then judged; every gather call fits the limit.
- With zero atoms every promised test is judged on its full record evidence, and nothing is reported as symbol coverage.

### 1.5 E202610208315a11f:S003:T005 — Cross-chunk relation checks for quality and adherence

gather.relationCall(pair, maxChars?) for the quality and adherence dimensions judges each 'calls' relation in ChunkPlan.crossRelations: one call carrying both full rows when they fit together, otherwise (or when maxChars is set after a refusal) two calls, one full row against the other's neighbour summary in each direction, each within the size. Each judges whether the caller's use matches the callee (arguments, return use, error contract; for adherence the approved clauses either carries) and returns today's findings shape with a mismatch located at the caller. gather.validate rejects a relation answer naming a counterpart or location outside its two symbols.

**Acceptance checks:**
- A relation call carries both full rows when they fit, else full against neighbour summary in each direction, and every call fits the limit (or the reported maxChars).
- A caller and callee in different chunks whose contract disagrees are judged in a relation call and the mismatch is reported at the caller.
- A relation answer naming a counterpart outside its two symbols is rejected, re-issued once, then fails the review.

### 1.6 E202610208315a11f:S003:T006 — Quality's compare and pair stages for cross-chunk duplicates

Quality's adapter adds model stages 'compare' and 'pair' after its chunk stage, onCallFailure 'fail-review', run only when the plan is divided. s1 issues every later stage per chunk, so compare's chunkCalls for chunk i packs the chunk's descriptions (from the chunk stage's output) into batches of at most half the limit and pairs each with the batches of every later chunk; each call returns candidate duplicate pairs. pair's chunkCalls for chunk i judges each candidate pair whose first symbol chunk i holds, on both full rows when they fit together, else full against description in each direction, returning today's quality findings with counterpartRef; validate rejects a counterpart outside the pair. Both stages set countAs: 'relation' (s1's AdapterStage.countAs, added by the stakeholder's decision of 2026-10-20), so their calls are counted under pipelineCalls.relation as the LLD's data-model note says, while keeping role 'chunk' for retry and re-division.

**Acceptance checks:**
- Every two symbols in different chunks are compared through their descriptions, in calls that each fit the limit.
- Two duplicate symbols in different chunks are named by compare and reported by pair with counterpartRef.
- A pair answer naming a counterpart outside its two symbols is rejected, re-issued once, then fails the review.
- Under the limit no compare or pair call is made.
- Every compare and pair call, re-issues and re-divisions included, is counted under pipelineCalls.relation (countAs: 'relation'), not under chunk.

### 1.7 E202610208315a11f:S003:T007 — Merge and finish into today's DimensionResult

Each model dimension's finish handles a divided review (replacing today's 'dividing a code review is not available yet' error): the chunk results (coverage symbol findings, quality findings and pair findings) in stage order; gather.merge concatenates them with the obligation and relation parts, keeps identical findings once, re-asks a finding located at a note id rather than rewriting it, and applies each dimension's existing result filters: today's changed-set filter on the daemon path (findings outside it dropped, as today), functional coverage's known-FR expectationRef filter, and normalizeCoverageFindings run once over coverage's merged result with the prepared grounding. On the controller path out-of-set findings still reach the step handler's outOfScope handling (src/daemon/steps/code-review-step/handler.ts) as today. pipelineCalls is set by s1 and absent on a single-chunk review; runCodeReview folds with foldVerdict unchanged.

**Acceptance checks:**
- merge keeps identical findings once and normalises coverage once over the merged result; it never rewrites a location: a gather finding located at an evidence note id (or anything not file:line) is re-asked once with the reason, then fails the review (the approved LLD, stakeholder option A).
- Out-of-set findings are dropped on the daemon path and kept in outOfScope on the controller path, as today.
- A functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by finish, as today.
- pipelineCalls counts the divided review's calls per role and is absent on a single-chunk review.
- runCodeReview's signature, record shape and foldVerdict rule are unchanged.

### 1.8 E202610208315a11f:S003:T008 — Divided-versus-single equivalence and failure through runCodeReview

Integration tests drive a divided review end to end through runCodeReview with a small limit and scripted answers keyed by stage and callId, and compare it with the same material in one call under a raised limit, on fixtures that fit both ways.

**Acceptance checks:**
- A divided review and the same material in one call under a raised limit give the same obligation verdicts for every dimension.
- A caller and callee in different chunks whose contract disagrees are reported at the caller through runCodeReview.
- Two duplicate symbols in different chunks are reported with counterpartRef through runCodeReview.
- A degraded review whose single call is over the limit is divided with zero atoms and judges every promised test at gather on its full record evidence.
- A gather call failing twice fails the review and records nothing (runCodeReview returns ok: false).
- Every call the divided review sends measures within the limit.

### 1.9 E202610208315a11f:S003:T009 — Update the installed daemon and run the c2ba6fa6/s1 smoke

Rebuild and update the installed daemon (maintenance update, then restart), then run Epic c2ba6fa6 Story s1's code review through the daemon's code-review RPC in the gated live test src/workflow/review-pipeline/__tests__/smoke-c2ba6fa6-s1.live.test.ts (INSRC_LIVE_TESTS=1), which writes docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S003/smoke-c2ba6fa6-s1.json with the run date, the installed daemon commit, the verdict and counts, and per dimension the chunk plan (chunk count, chars per chunk) and calls per stage. The review record itself is written by the daemon as today. The gate receives the result as a reported smoke pointing at the smoke record.

**Acceptance checks:**
- The installed daemon runs the build containing t1-t8.
- Epic c2ba6fa6 Story s1's code review completes on the installed daemon and records a verdict; anything else fails the smoke with the outcome and plan logged.
- The smoke record holds the run date, daemon commit, verdict and counts, and per dimension the chunk plan and calls per stage.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'each dimension's obligations equal what today's prompt judges: clauses and plan tasks, FRs, promised tests, touched modules; adherence has none without an approved LLD or plan' | `t1` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note' | `t2`, `t3` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a key with no notes is adjudicated on the no-evidence statement' | `t4` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a relation call carries both full summaries when they fit, else full against neighbour summary in each direction, and every call fits' | `t5` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a pair answer naming a counterpart outside its two symbols is rejected' | `t6` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'merge keeps identical findings once, accepts only file:line locations (a note id is re-asked), moves out-of-set findings to outOfScope, and normalises coverage once' | `t7` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'pipelineCalls counts chunk, obligation, relation and merge calls and is absent on a single-chunk review' | `t7` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'adherence, functional-coverage and conventions chunk schemas have no findings field, so a missing clause or unrealized FR naming a valid chunk location cannot be recorded from a chunk' | `t2` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a promised test passed only by a reported smoke run, with no test file or reaching edge, gets that evidence in its obligation context and is not reported missing' | `t4` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a conventions candidate rejected by the module judgement is absent from the merged result' | `t4` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'out-of-set findings are dropped on the daemon path and kept in outOfScope on the controller path, as today' | `t7` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by merge, as today' | `t7` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a quality chunk answer missing, repeating or adding a description is rejected, re-issued once, then fails the review' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a divided review and the same material in one call under a raised limit give the same obligation verdicts for every dimension, on fixtures that fit both ways' | `t8` |
| src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a caller and callee in different chunks whose contract disagrees are judged in a relation call and the mismatch is reported at the caller' | `t8` |
| src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'two duplicate symbols in different chunks are named by compare and reported by pair with counterpartRef' | `t8` |
| src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a degraded review whose single call is over the limit is divided with zero atoms and judges every promised test at gather on its full record evidence' | `t8` |
| src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: 'a gather call failing twice fails the review and records nothing' | `t8` |
| src/workflow/review-pipeline/__tests__/smoke-c2ba6fa6-s1.live.test.ts: 'Epic c2ba6fa6 Story s1's code review completes on the installed daemon, records a verdict, and writes the chunk plan and calls per stage to the smoke record' | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails 2.1 ReviewMaterial.obligations and context (code review, per dimension)`
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails 2.2 AdapterStage.chunkCalls (code-review dimensions)`
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails 2.3 GatherPlan.obligationCall / reduceCall (code review)`
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails 2.4 GatherPlan.relationCall (code review)`
- **[[c5]]** `prior-artifact` `LLD s3 contractDetails 2.5 AdapterStage (quality compare and pair stages)`
- **[[c6]]** `prior-artifact` `LLD s3 contractDetails 2.6 GatherPlan.merge / ReviewAdapter.finish (code review)`
- **[[c7]]** `prior-artifact` `LLD s3 contractDetails 2.7 runCodeReview`
- **[[c8]]** `prior-artifact` `LLD s3 dataModelChanges 3.1 DimensionResult.pipelineCalls`
- **[[c9]]** `prior-artifact` `LLD s3 dataModelChanges 3.2 Smoke record for Epic c2ba6fa6 Story s1`
- **[[c10]]** `prior-artifact` `LLD s3 errorPaths`
- **[[c11]]** `prior-artifact` `LLD s3 testStrategy`
- **[[c12]]** `prior-artifact` `LLD s3 migration`

## 4. Feedback

- **Subho Ghosh** (2026-10-20T18:00:07.782Z) `feedback` — `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S003/PLAN.md`: Amended 2026-10-20 by the stakeholder's decision after t2's third build gate. t2's check required a correction note on every re-issue, which conflicts with s1's approved rule: prepare lets one symbol fill the hard limit, and a correction that does not fit beside such a call is left out and logged, never cut. The check now follows s1: the reasons have a fixed size (a made-up value is located by count and position, never quoted back), so the correction is sent whenever the call has room; a call that already fills the limit is re-issued as planned with the omission logged, and a second invalid answer still fails the review. Also recorded: commit 581e1d76 (a t2 fix) changed quality's description reasons to the same fixed-size form for consistency, since every chunk validator lives in one module; that part belongs to t3's surface.
- **Subho Ghosh** (2026-10-21T04:28:16.013Z) `feedback` — `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S003/PLAN.md`: Amended 2026-10-21: t7 follows the approved LLD on note ids (stakeholder option A, 2026-10-20): merge never rewrites a location; a gather finding located at an evidence note id is re-asked, then fails the review. The note-id expansion wording in t7 (check, summary, test name, coverage row) was missed when the LLD was amended; it is corrected here.
