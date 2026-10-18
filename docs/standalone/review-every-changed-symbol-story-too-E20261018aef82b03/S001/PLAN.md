<!-- insrc:artifact PLAN-aef82b034d7209fa-S001 -->

# Plan: E20261018aef82b03:S001

## Summary

**Epic:** `review-every-changed-symbol-story-too`
**LLD run:** `wf-1792343404222-54bw8h`
**LLD effective hash:** `951d004796fc...`

Building this Story first makes size refusals visible and never retried, gives providers a known input budget and adds a pure batch packer. On those it builds one serialisable review job in three stages (map, keyed reduce with capped merges, and quality's cross-part compare, with a fit-or-digest chain for any combined call), then gives each of the five symbol-reading dimensions its strategy and routes the judges through their jobs. The controller path then runs the same jobs one measured frame at a time, answered by call id through the MCP tool, and the Story ends by reviewing Epic c2ba6fa6 s1 on the installed daemon.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Size refusals are recognised on every CLI failure path and never retried | M | — | unit: src/agent/providers/__tests__/input-too-large.test.ts: 'codex input_too_large becomes an InputTooLargeError with maxChars and actualChars; the message is unchanged'; unit: src/agent/providers/__tests__/input-too-large.test.ts: 'withStructuredRetry rethrows an InputTooLargeError after one call'; integration: src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a fake codex emitting an input_too_large error event, or exiting non-zero with it on stderr, and a fake claude returning an is_error Prompt is too long envelope each surface an InputTooLargeError from completeStructured after one run'; integration: src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a size refusal whose text also matches the transient classifier (API Error: Prompt is too long) runs the CLI once' | [[c4]] [[c5]] |
| 2 | **`t2`** Providers state their input budget | S | — | unit: src/agent/providers/__tests__/input-budget.test.ts: 'a codex CliProvider reports 1048576; claude and Ollama report undefined' | [[c6]] |
| 3 | **`t3`** packIntoBatches and AtomTooLargeError | S | — | unit: src/workflow/code-review/__tests__/pack-into-batches.test.ts: 'every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it' | [[c1]] |
| 4 | **`t4`** ReviewJob core: whole call, MAP, merge, refusals, daemon driver | M | `t1`, `t3` | unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a fitting dimension, or an unknown budget, is one call with today's prompt and schema'; unit: src/workflow/code-review/__tests__/review-job.test.ts: 'every call the job issues fits the budget at every stage, for a Story many times the budget'; unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a refused call is re-planned and the job completes, sending no prompt twice'; unit: src/workflow/code-review/__tests__/review-job.test.ts: 'identical findings merge once; findings differing in any field are all kept'; unit: src/workflow/code-review/__tests__/review-job.test.ts: 'every original symbol summary and clause is read whole by some call' | [[c2]] [[c12]] |
| 5 | **`t5`** ReviewJob REDUCE: obligation keys, capped merge levels, context-only calls | M | `t4` | unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a key whose notes do not fit is merged level by level under capped notes and the job terminates'; unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a merge or digest answer over its cap or naming unknown note ids is rejected'; unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a requirement whose symbolIds alone exceed the budget is merged under note ids, adjudicated in one call and its findings expanded to the real symbols' | [[c2]] [[c12]] |
| 6 | **`t6`** ReviewJob COMPARE and the joint-fit chain | M | `t4` | unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a merge or digest answer over its cap or naming unknown note ids is rejected'; unit: src/workflow/code-review/__tests__/review-job.test.ts: 'every pair of atoms in different description batches is compared, and atoms too large together go full, full+digest, then digest+digest with every call fitting' | [[c2]] [[c12]] |
| 7 | **`t7`** Adherence and functional-coverage strategies | M | `t5`, `t6` | integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'adherence, functional-coverage and coverage adjudicate each requirement on evidence from every part, with or without a test record'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'an approved design larger than the budget is split by clause and every clause adjudicated'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a symbol and a clause that each fit alone but not together are judged through the joint-fit chain and every call fits'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'every clause, FR and promised test reaches adjudication, and one no part shows evidence for is reported missing' | [[c3]] |
| 8 | **`t8`** Coverage strategy | M | `t5`, `t6` | integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with a test record larger than the budget, every coverage call fits when serialised and every promised test is adjudicated on all its record evidence and notes'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a single test file whose titles exceed the budget is split into title atoms with its file metadata and every promised test is adjudicated on all of them'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'timed-out, non-zero-exit and malformed test files with no titles keep their state through the file-status atom in every call that names them'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with no symbols and a test record over the budget, context-only calls judge every promised test, reporting the missing one and not the passing one' | [[c3]] |
| 9 | **`t9`** Conventions and quality strategies | M | `t5`, `t6` | integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'conventions judges a module idiom on examples from every part'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'quality reports duplication between symbols in different parts with counterpartRef'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries fit only one at a time are judged in two directions against digests'; integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries each nearly fill the budget are judged digest against digest, and every pair prompt fits when serialised' | [[c3]] |
| 10 | **`t10`** The five judges run as jobs; parts recorded | M | `t2`, `t7`, `t8`, `t9` | integration: src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'the runner folds one verdict and writes one record with parts per dimension; coverage is normalised once' | [[c7]] [[c10]] |
| 11 | **`t11`** codeReview.controllerFrameChars setting | S | — | integration: src/config/__tests__/config-catalog-contract.test.ts (existing, updated: 38 settings, codeReview.controllerFrameChars a number with default 400000) | [[c11]] |
| 12 | **`t12`** Controller jobs and emit_calls frames within the measured envelope | M | `t10`, `t11` | integration: src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a review that fits one frame is exactly as today, out-of-scope findings disclosed as today'; integration: src/daemon/steps/code-review-step/__tests__/handler.test.ts (existing, still passes); integration: src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'every serialised emit_calls frame fits controllerFrameChars, with no grounding or legacy prompts, including a call near the frame budget'; integration: src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'with a test record larger than the frame budget, every emit_calls frame fits and the record written matches the daemon path'; integration: src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a symbol and clause too large together, and a test file too large alone, complete frame by frame with every serialised frame within the budget' | [[c8]] |
| 13 | **`t13`** Controller answers by callId, frame tokens and the MCP schema | M | `t12` | integration: src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'an over-budget review is answered frame by frame by callId through the registered MCP tool and writes the same record as the daemon path'; integration: src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a wrong callId is bad-judgements and a replayed frame token is state-not-found'; integration: src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a degraded review with no symbols and an oversized record completes frame by frame and reports the missing promised test' | [[c8]] [[c9]] |
| 14 | **`t14`** Ship and smoke | S | `t13` | smoke: docs/standalone/review-every-changed-symbol-story-too-E20261018aef82b03/S001/smoke.md: the code review of Epic c2ba6fa6 s1 completes (it failed with a 1,247,701-character prompt), recording the calls per stage per dimension and the largest prompt sent | [[c13]] |

### 1.1 E20261018aef82b03:S001:T001 — Size refusals are recognised on every CLI failure path and never retried

Add classifyInputTooLarge and InputTooLargeError (a CliExitError with maxChars/actualChars) and apply them at runCodex's error/turn.failed check, cliExitError and the claude is_error envelope check; CliProvider.withTransientRetry and withStructuredRetry rethrow an InputTooLargeError at once.

**Acceptance checks:**
- codex input_too_large on any of its failure paths and a claude 'Prompt is too long' envelope each surface an InputTooLargeError from completeStructured after exactly one CLI run, with maxChars/actualChars when reported.
- Error messages are unchanged; other errors are retried as today.

### 1.2 E20261018aef82b03:S001:T002 — Providers state their input budget

Add the optional readonly inputBudgetChars to LLMProvider; CliProvider sets 1,048,576 for codex and leaves claude undefined; Ollama leaves it undefined.

**Acceptance checks:**
- A codex CliProvider reports 1048576; claude and Ollama report undefined.

### 1.3 E20261018aef82b03:S001:T003 — packIntoBatches and AtomTooLargeError

A pure greedy packer of indivisible atoms into batches whose built prompt fits a budget, and AtomTooLargeError naming an atom whose prompt alone exceeds it.

**Acceptance checks:**
- Every atom is in exactly one batch, in order, and every batch's measured prompt fits the budget.
- An atom that alone does not fit raises AtomTooLargeError naming it with both sizes.

### 1.4 E20261018aef82b03:S001:T004 — ReviewJob core: whole call, MAP, merge, refusals, daemon driver

createReviewJob / nextCalls / applyAnswer with the whole-call path (one call with the supplied whole prompt when it fits or the budget is unknown), MAP over the cross product of each needed input source's batches (local findings and keyed notes, never absence findings), the finding merge (identical findings once) with parts counts, refusal re-planning (re-pack with the reported maxChars, else halves), and a daemon driver that runs a job's calls serially.

**Acceptance checks:**
- A job whose whole prompt fits, or with an unknown budget, is exactly one call with the supplied whole prompt and schema.
- Every MAP call fits when serialised and every original atom of every source is read whole by some MAP call, for inputs many times the budget.
- A refused call is re-planned and no prompt is sent twice.

### 1.5 E20261018aef82b03:S001:T005 — ReviewJob REDUCE: obligation keys, capped merge levels, context-only calls

REDUCE keys initialised from every obligation before MAP; keys adjudicated in packed calls (a key with no notes too); a key whose notes do not fit is merged level by level into capped notes under short ids with provenance kept in the job; context-only calls when there are no symbols; merge answers over their cap or naming unknown note ids rejected.

**Acceptance checks:**
- Every obligation reaches adjudication, including one with no notes and every one when there are no symbols.
- A key whose symbolIds alone exceed the budget is merged under note ids, adjudicated in one call and its findings expanded to the real symbols; the job terminates.
- A merge answer over its cap or naming unknown note ids is rejected.

### 1.6 E20261018aef82b03:S001:T006 — ReviewJob COMPARE and the joint-fit chain

COMPARE over pairs of description batches (each at most half the budget); the joint-fit chain (all full, one full with the others as digests, all digests) for every combining call, with digests capped at DIGEST_CHARS and written by calls that read their atom whole.

**Acceptance checks:**
- Every pair of atoms in different description batches is compared by some call.
- Two atoms that each fit alone but not together, including two near-budget atoms, are combined through the chain and every call fits when serialised.

### 1.7 E20261018aef82b03:S001:T007 — Adherence and functional-coverage strategies

DimensionStrategy for adherence (LLD clauses and PLAN tasks as context atoms, per-clause evidence notes, clause adjudication, no-contract short circuit kept) and functional-coverage (FR atoms, per-FR evidence, FR adjudication).

**Acceptance checks:**
- A clause or FR implemented by symbols in different parts is not reported unrealized; one with no evidence is.
- An approved design larger than the budget is split by clause and every clause adjudicated.

### 1.8 E20261018aef82b03:S001:T008 — Coverage strategy

DimensionStrategy for coverage: test-record atoms (a file-status atom per file always, title atoms carrying file metadata, reported tests, BUILD task results, notes), MAP with only the reached files' atoms, REDUCE per promised test with its record atoms, context-only calls when there are no symbols, normalizeCoverageFindings once after the merge.

**Acceptance checks:**
- With a test record larger than the budget, or no symbols, every promised test is adjudicated on all its evidence; a missing one is reported and a passing one is not.
- A title-less failing or malformed test file keeps its state in every call naming it.

### 1.9 E20261018aef82b03:S001:T009 — Conventions and quality strategies

DimensionStrategy for conventions (per-module idiom notes and module adjudication with today's too-few-examples rule) and quality (within-part MAP, one-line descriptions, COMPARE, pair judgement through the joint-fit chain).

**Acceptance checks:**
- A module idiom spread over parts is judged on all its examples.
- Duplicated logic in symbols in different parts, including two near-budget summaries, is reported with counterpartRef.

### 1.10 E20261018aef82b03:S001:T010 — The five judges run as jobs; parts recorded

Route judgeAdherence, judgeConventions, judgeCoverage, judgeFunctionalCoverage and judgeQuality through their job with the provider's budget; add the optional DimensionResult.parts counts and keep them on the record.

**Acceptance checks:**
- A fitting review makes the same provider calls with byte-identical prompts as before, and the existing judge, runner and handler suites pass unchanged.
- An over-budget review completes through the runner with one verdict and parts counts recorded per dimension.

### 1.11 E20261018aef82b03:S001:T011 — codeReview.controllerFrameChars setting

Add the catalog row (type number, default 400000) and update the catalog contract test; the reader requires a positive integer and falls back to the default with a warning.

**Acceptance checks:**
- The catalog has 38 settings with codeReview.controllerFrameChars a number defaulting to 400000; a non-positive or non-integer value falls back to 400000.

### 1.12 E20261018aef82b03:S001:T012 — Controller jobs and emit_calls frames within the measured envelope

The controller path keeps one ReviewJob per dimension in the step state; when the review does not fit today's single frame it emits next 'emit_calls' frames (calls with callId, dimension, stage, prompt, schema; no grounding or legacy prompts), planned with a per-call budget of controllerFrameChars minus the measured frame envelope and packed while the serialised frame fits. A review that fits one frame is exactly as today.

**Acceptance checks:**
- Every serialised emit_calls frame fits controllerFrameChars, including a call near the frame budget.
- A review that fits one frame produces today's emit_judgements frame unchanged.

### 1.13 E20261018aef82b03:S001:T013 — Controller answers by callId, frame tokens and the MCP schema

The judgements phase accepts answers [{ callId, output }] for an emit_calls frame; applyAnswer advances each job; a fresh token per frame with the previous released; a wrong callId is bad-judgements and a replayed token state-not-found; the insrc_code_review_step MCP input schema accepts answers, forwarded unchanged; the last answers drive the runner.

**Acceptance checks:**
- An over-budget review completes through the registered MCP tool frame by frame and writes the same record as the daemon path.
- A wrong callId is bad-judgements and a replayed frame token is state-not-found.

### 1.14 E20261018aef82b03:S001:T014 — Ship and smoke

Push, update the installed daemon, run the code review of Epic c2ba6fa6 s1 on codex and record calls per stage per dimension and the largest prompt sent; send one oversized prompt through the claude CLI and record what it returns; record in smoke.md.

**Acceptance checks:**
- smoke.md records s1's completed review with calls per stage and the largest prompt, and the claude CLI's oversized-prompt response.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/code-review/__tests__/pack-into-batches.test.ts: 'every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it' | `t3` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'a fitting dimension, or an unknown budget, is one call with today's prompt and schema' | `t4` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'every call the job issues fits the budget at every stage, for a Story many times the budget' | `t4` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'a key whose notes do not fit is merged level by level under capped notes and the job terminates' | `t5` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'a merge or digest answer over its cap or naming unknown note ids is rejected' | `t5`, `t6` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'a refused call is re-planned and the job completes, sending no prompt twice' | `t4` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'identical findings merge once; findings differing in any field are all kept' | `t4` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'a requirement whose symbolIds alone exceed the budget is merged under note ids, adjudicated in one call and its findings expanded to the real symbols' | `t5` |
| src/workflow/code-review/__tests__/review-job.test.ts: 'every original symbol summary and clause is read whole by some call' | `t4` |
| src/agent/providers/__tests__/input-too-large.test.ts: 'codex input_too_large becomes an InputTooLargeError with maxChars and actualChars; the message is unchanged' | `t1` |
| src/agent/providers/__tests__/input-too-large.test.ts: 'withStructuredRetry rethrows an InputTooLargeError after one call' | `t1` |
| src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a fake codex emitting an input_too_large error event, or exiting non-zero with it on stderr, and a fake claude returning an is_error Prompt is too long envelope each surface an InputTooLargeError from completeStructured after one run' | `t1` |
| src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a size refusal whose text also matches the transient classifier (API Error: Prompt is too long) runs the CLI once' | `t1` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'adherence, functional-coverage and coverage adjudicate each requirement on evidence from every part, with or without a test record' | `t7`, `t8` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'conventions judges a module idiom on examples from every part' | `t9` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'quality reports duplication between symbols in different parts with counterpartRef' | `t9`, `t6` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'an approved design larger than the budget is split by clause and every clause adjudicated' | `t7`, `t6` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'the runner folds one verdict and writes one record with parts per dimension; coverage is normalised once' | `t10` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries fit only one at a time are judged in two directions against digests' | `t9`, `t6` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'two duplicate symbols whose summaries each nearly fill the budget are judged digest against digest, and every pair prompt fits when serialised' | `t9`, `t6` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with a test record larger than the budget, every coverage call fits when serialised and every promised test is adjudicated on all its record evidence and notes' | `t8` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a symbol and a clause that each fit alone but not together are judged through the joint-fit chain and every call fits' | `t7`, `t6` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'a single test file whose titles exceed the budget is split into title atoms with its file metadata and every promised test is adjudicated on all of them' | `t8` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'timed-out, non-zero-exit and malformed test files with no titles keep their state through the file-status atom in every call that names them' | `t8` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'every clause, FR and promised test reaches adjudication, and one no part shows evidence for is reported missing' | `t7`, `t8` |
| src/workflow/code-review/__tests__/review-job-dimensions.test.ts: 'with no symbols and a test record over the budget, context-only calls judge every promised test, reporting the missing one and not the passing one' | `t8` |
| src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'an over-budget review is answered frame by frame by callId through the registered MCP tool and writes the same record as the daemon path' | `t13` |
| src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a wrong callId is bad-judgements and a replayed frame token is state-not-found' | `t13` |
| src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a review that fits one frame is exactly as today, out-of-scope findings disclosed as today' | `t12` |
| src/daemon/steps/code-review-step/__tests__/handler.test.ts (existing, still passes) | `t12`, `t13` |
| src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'every serialised emit_calls frame fits controllerFrameChars, with no grounding or legacy prompts, including a call near the frame budget' | `t12` |
| src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'with a test record larger than the frame budget, every emit_calls frame fits and the record written matches the daemon path' | `t12` |
| src/config/__tests__/config-catalog-contract.test.ts (existing, updated: 38 settings, codeReview.controllerFrameChars a number with default 400000) | `t11` |
| src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a symbol and clause too large together, and a test file too large alone, complete frame by frame with every serialised frame within the budget' | `t12` |
| src/daemon/steps/code-review-step/__tests__/controller-jobs.test.ts: 'a degraded review with no symbols and an oversized record completes frame by frame and reports the missing promised test' | `t13` |
| docs/standalone/review-every-changed-symbol-story-too-E20261018aef82b03/S001/smoke.md: the code review of Epic c2ba6fa6 s1 completes (it failed with a 1,247,701-character prompt), recording the calls per stage per dimension and the largest prompt sent | `t14` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 packIntoBatches`
- **[[c2]]** `prior-artifact` `LLD S001 ReviewJob (createReviewJob / nextCalls / applyAnswer)`
- **[[c3]]** `prior-artifact` `LLD S001 DimensionStrategy`
- **[[c4]]** `prior-artifact` `LLD S001 withStructuredRetry`
- **[[c5]]** `prior-artifact` `LLD S001 classifyInputTooLarge`
- **[[c6]]** `prior-artifact` `LLD S001 CliProvider.inputBudgetChars`
- **[[c7]]** `prior-artifact` `LLD S001 judgeAdherence / judgeConventions / judgeCoverage / judgeFunctionalCoverage / judgeQuality`
- **[[c8]]** `prior-artifact` `LLD S001 emitJudgementsResult`
- **[[c9]]** `prior-artifact` `LLD S001 insrc_code_review_step MCP registration`
- **[[c10]]** `prior-artifact` `LLD S001 data model: DimensionResult.parts`
- **[[c11]]** `prior-artifact` `LLD S001 data model: config codeReview.controllerFrameChars`
- **[[c12]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c13]]** `prior-artifact` `LLD S001 testStrategy smoke (Epic c2ba6fa6 s1 review)`
