<!-- insrc:artifact LLD-03f4fd3b9102aab8-s4 -->

# LLD: STORY-03f4fd3b9102aab8-s4 — Each round's findings are rendered and presented through a new review-report docgen document

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**HLD base run:** `wf-1794986545330-2wntv5`
**HLD effective hash:** `6d57abfa68ac...`
**Tracker:** [insors-ai/insrc#214](https://github.com/insors-ai/insrc/issues/214)

This Story adds the review-report docgen document: a new, explicitly-invoked docType that renders one round's findings (plus, from round 2 onward, its reconciliation annotations) to a persisted MD artifact, then presents it to the submitter every round via the existing insrc_present tool. The annotation rule is deliberately narrow: it marks only the specific prior comments the submitter's corrections addressed or rejected this round, never a running history of everything ever raised.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-03f4fd3b9102aab8** § 2. Framework summary

**Rollout phase:** Phase B — taxonomy, reconciliation, rendering, checkpointing
**Owns:** `sc4` (Review-report docgen call shape)
**Consumes:** `sc1` (Review-type hook set)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The round-driver function itself -- what it does internally to run the grounding+findings, reconciliation, render+present and checkpoint-write cycle -- stays private to s1; no other Story's type depends on the driver's internals, only on the hook contract sc1 exposes. — owns `sc1`
- `s2`: Which exact per-review-type severity scales exist beyond the HIGH/MED default, and how a review type's Feedback implementation declares its own, stay internal to s2; no other Story's type depends on Finding's shape. — owns `sc2`
- `s3`: How the reconciliation LLM call is actually prompted, and how it reads the temp folder's audit trail when needed, stay internal to s3; no other Story's type depends on ReconciliationResult's internals beyond its verdict shape. — owns `sc3`
- `s5`: The exact per-review-type granularity mapping (round-level for design review, per-Task for code review) and the durable-copy-before-deletion mechanics stay internal to s5; no other Story's type depends on ReviewCheckpoint's internals beyond what sc1's round-driver needs to call it. — owns `sc5`

## 2. Contract details

**Surface level:** public

## 3. Data model changes

### 3.1 `ReviewReportDocgenCall` — new

interface ReviewReportDocgenCall { readonly reviewId: string; readonly round: number; } -- exactly sc4's HLD interfaceSketch, the args shape passed to the existing insrc_docgen tool's `params` once docType is set to 'review-report'. No new tool, no new function signature -- insrc_docgen itself (src/mcp/docgen/handler.ts) is unchanged.

**Call sites:**
- `src/mcp/docgen/handler.ts`

### 3.2 `review-report DocTypeRegistration` — new

A new entry registered through the existing DocTypeRegistry.register() (src/docgen/registry.ts): { docType: 'review-report', capability, extractorInputSchema, extract() }. extract() reads the round's finalized Finding[] (sc2) plus, for round>1, the ReconciliationResult[] (sc3), and composes the MD, applying lc3's resolved/still-open/contradicted annotation only to the specific prior Feedback entries (the real artifact-core Feedback type) the submitter's corrections this round addressed or rejected -- derived internally by extract(), never passed in by the caller. This exact mechanism (one more DocTypeRegistration) is already used by type-structure/component-dependency/call-sequence/narrative; no new dispatch path is introduced.

**Call sites:**
- `src/docgen/registry.ts`
- `src/docgen/types.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | ReviewReportDocgenCall and the 'review-report' DocTypeRegistration are authored here as sc4's concrete shape, implementing the HLD interfaceSketch verbatim and wiring it through the existing docgen registry rather than inventing a new call mechanism. |
| `sc1` | consumes | The review-report docgen call is invoked by a review type's round-driver cycle (sc1, owned by s1) once a round's findings (and, for round>1, reconciliation) have finished; this Story's contract does not reference RoundDriverHooks fields directly, it only accepts reviewId and round once the driver decides to render. |

## 5. Error paths

**Error cases**

- **the 'review-report' docType string collides with an already-registered docType (a startup wiring bug, e.g. a duplicate registration)** (recoverable)
  - Detection: DocTypeRegistry.register() throws DuplicateDocTypeError synchronously at startup wiring time (src/docgen/registry.ts)
  - Response: startup wiring fails fast rather than silently letting one registration shadow the other
  - User impact: a docType collision is caught immediately at startup, never discovered later as an unexplained wrong-extractor result at request time
- **extract() itself fails -- e.g. the round's finalized Finding[] or, for round>1, ReconciliationResult[] cannot be read for the given reviewId/round** (recoverable)
  - Detection: extract()'s returned Promise rejects, or it returns a non-ok outcome through docgen's existing DocGenOutcome shape
  - Response: docgenGenerate surfaces the failure through the existing non-ok DocGenOutcome path rather than rendering a partial or fabricated MD for that round
  - User impact: the caller sees generation as having failed outright for that round, not a document that looks complete but is missing content
- **the call names a reviewId/round whose findings (and, for round>1, reconciliation) have not actually finished yet** (recoverable)
  - Detection: extract() finds no stored finalized output for that reviewId/round combination
  - Response: extract() fails rather than rendering an empty or placeholder MD as if the round had completed
  - User impact: a too-early call is caught as a failure, not silently presented to the submitter as a finished round's report

**Edge cases**

| Input | Expected |
| :--- | :--- |
| round is 1 (Initial Review, no reconciliation exists yet) | the MD renders that round's findings with no reconciliation-annotation section at all -- absent, not an empty or placeholder section |
| round > 1, but the submitter's corrections this round addressed or rejected zero prior Feedback entries | the MD's annotation section is empty or absent, never a fabricated audit of unaddressed history |
| many prior Feedback entries exist across the review's full history, but only one was addressed or rejected this round | only that one entry is annotated resolved/still-open/contradicted in this round's MD -- lc3's exact scoping, never the full history |

## 6. Test strategy

**Test framework:** `node:test, run via npx tsx --test (matches registry.test.ts's own register()/assert.throws convention, cited in s1, and this Epic's s1-s3 convention)`

**Test levels**

- **unit** — Prove the review-report docType registers without colliding with existing docTypes (ac1's mechanism), that rendering only succeeds once a round's output has actually finished, that lc3's annotation scoping is exact (ac2), and that presentation happens every round via the existing tool (ac3).
  - Subjects: `registering the 'review-report' docType succeeds without colliding with any existing docType (type-structure, component-dependency, call-sequence, narrative)`, `the review-report extractor renders a persisted MD artifact for a round whose findings (and, for round>1, reconciliation) have already finished`, `the review-report extractor fails rather than rendering when called for a reviewId/round whose findings have not finished yet`, `round 1's rendered MD contains no reconciliation-annotation section at all, since no reconciliation exists yet`, `a correction round's rendered MD annotates only the specific prior Feedback entries the submitter's corrections addressed or rejected this round, as resolved/still-open/contradicted`, `a correction round's rendered MD never annotates a prior Feedback entry the submitter's corrections did not address or reject this round, even when that entry exists in the review's full history`, `insrc_present is invoked with the rendered MD's path once per round, with no response required from the user`
  - Fixtures: `a stub DocTypeRegistry populated with the four existing docTypes plus the new 'review-report' entry, to prove no DuplicateDocTypeError`, `a fixture reviewId/round with finalized Finding[] and ReconciliationResult[] plus a set of prior Feedback entries, some addressed/rejected this round and some not`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `the review-report extractor renders a persisted MD artifact for a round whose findings (and, for round>1, reconciliation) have already finished` |
| `ac2` | `a correction round's rendered MD annotates only the specific prior Feedback entries the submitter's corrections addressed or rejected this round, as resolved/still-open/contradicted`, `a correction round's rendered MD never annotates a prior Feedback entry the submitter's corrections did not address or reject this round, even when that entry exists in the review's full history` |
| `ac3` | `insrc_present is invoked with the rendered MD's path once per round, with no response required from the user` |

## 7. Alternatives considered

### 7.1 a1: Flat ReviewReportDocgenCall per sc4's sketch, registered as a plain new docType via the existing DocTypeRegistry — **CHOSEN**

interface ReviewReportDocgenCall { readonly reviewId: string; readonly round: number; } exactly as sc4 sketches it; 'review-report' becomes one more DocTypeRegistration entry with its own extract(), the identical mechanism type-structure/component-dependency/call-sequence/narrative already use, and insrc_present (the existing tool) is called with the rendered MD's path once per round.

ReviewReportDocgenCall carries only reviewId and round, exactly sc4's interfaceSketch. Rendering is one new src/docgen DocTypeRegistration (docType: 'review-report') whose extract() reads that round's finalized findings (sc2's Finding) plus, for round>1, sc3's ReconciliationResult array, and composes the MD -- including lc3's resolved/still-open/contradicted annotation of only the specific prior Feedback (the real artifact-core Feedback type) the submitter's corrections this round addressed or rejected, derived internally by the extractor, not passed in by the caller. After rendering, the round-driver (s1) calls insrc_present with the new MD's path, satisfying ac3 with the tool docgen and present already provide -- no new presentation mechanism.

### 7.2 a2: ReviewReportDocgenCall carries an explicit priorFeedbackRefs list the caller must pre-filter

interface ReviewReportDocgenCall { readonly reviewId: string; readonly round: number; readonly priorFeedbackRefs: readonly string[]; } -- the caller decides and passes in which prior Feedback entries to annotate, instead of the extractor deriving that internally.

Add a priorFeedbackRefs field so the round-driver (or whatever calls docgen) must itself compute which Feedback entries the submitter's corrections addressed or rejected this round, and hand that pre-filtered list to the docgen call.

**Rejected because:** Violates sc4's approved shape (adds priorFeedbackRefs) and weakens ac2's guarantee by moving lc3's enforcement out of this Story's own rendering logic and onto a caller the HLD explicitly places this responsibility away from.

### 7.3 a3: ReviewReportDocgenCall returns rendered content directly instead of going through docgen's existing DocGenOutcome/present flow

A bespoke function returns { markdown: string; path: string } directly to the caller, bypassing the docgen registry's DocTypeRegistration/DocGenOutcome mechanism entirely.

function renderReviewReport(call: ReviewReportDocgenCall): Promise<{ markdown: string; path: string }> -- a standalone function outside the docgen registry, which the caller then has to separately decide how to persist and present.

**Rejected because:** Violates ac1 directly by bypassing the docgen docType mechanism the acceptance criterion names by name, and reinvents persistence/presentation plumbing the existing registry and insrc_present already provide.

## 8. References

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `src/docgen/registry.ts`
- **[[c7]]** `analyze-bundle` `src/docgen/types.ts`
- **[[c8]]** `analyze-bundle` `src/docgen/__tests__/registry.test.ts`
- **[[c9]]** `analyze-bundle` `docs/epics/review-rounds-reconciliation-recovery-E2026111803f4fd3b/DEF.md`
- **[[c10]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc4`

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `src/docgen/registry.ts`
- **[[c7]]** `analyze-bundle` `src/docgen/types.ts`
- **[[c8]]** `analyze-bundle` `src/docgen/__tests__/registry.test.ts`
- **[[c9]]** `analyze-bundle` `docs/epics/review-rounds-reconciliation-recovery-E2026111803f4fd3b/DEF.md`
- **[[c10]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc4`
