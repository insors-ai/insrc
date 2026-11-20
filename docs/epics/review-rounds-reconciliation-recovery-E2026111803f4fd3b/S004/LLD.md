<!-- insrc:artifact LLD-03f4fd3b9102aab8-s4 -->

# LLD: STORY-03f4fd3b9102aab8-s4 — Each round's findings are rendered and presented through a new review-report docgen document

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**HLD base run:** `wf-1794986545330-2wntv5`
**HLD effective hash:** `6d57abfa68ac...`
**Tracker:** [insors-ai/insrc#214](https://github.com/insors-ai/insrc/issues/214)

Story s4 adds renderReviewReport (sc4): a function the round-driver calls once per round, after that round's own findings (and, for round>1, s3's reconciliation classification) are in hand, to render the round's outcome into a persisted Markdown artifact under the review's own .insrc/tmp/<reviewId>/ directory. For a correction round it annotates each prior HIGH/MED finding with the verdict s3's reconciliation pass already computed (confirmed/still-open/contradicted/no-longer-surfaced), scoped to only that one adjacent round pair -- never a running audit of the full review history. The round-driver then presents the written path to the user via insrc_present every round.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

> See **HLD-03f4fd3b9102aab8** § 2. Framework summary

**Rollout phase:** Phase B — taxonomy, reconciliation, rendering, checkpointing
**Owns:** `sc4` (Review-report docgen call shape)
**Consumes:** `sc1` (Review-type hook set), `sc2` (Finding taxonomy + severity scale)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The round-driver function itself -- what it does internally to run the grounding+findings, reconciliation, render+present and checkpoint-write cycle -- stays private to s1; no other Story's type depends on the driver's internals, only on the hook contract sc1 exposes. — owns `sc1`
- `s2`: Which exact per-review-type severity scales exist beyond the HIGH/MED default, and how a review type's Feedback implementation declares its own, stay internal to s2; no other Story's type depends on Finding's shape. — owns `sc2`
- `s3`: How the reconciliation LLM call is actually prompted, and how it reads the temp folder's audit trail when needed, stay internal to s3; no other Story's type depends on ReconciliationResult's internals beyond its verdict shape. — owns `sc3`
- `s5`: The exact per-review-type granularity mapping (round-level for design review, per-Task for code review) and the durable-copy-before-deletion mechanics stay internal to s5; no other Story's type depends on ReviewCheckpoint's internals beyond what sc1's round-driver needs to call it. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `renderReviewReport`

```typescript
function renderReviewReport(call: ReviewReportDocgenCall, findings: readonly Finding[], reconciliation: readonly ReconciliationResult[] | undefined): Promise<string>
```

**Parameters:**
- `call: ReviewReportDocgenCall` — Identifies which round of which review this call renders -- exactly sc4's interfaceSketch, the HLD's own named call shape.
- `findings: readonly Finding[]` — This round's own finalized, self-contained finding set (produced by s1's round-driver per k4) -- rendered as this round's own report section; never re-derived or re-grounded by this call.
- `reconciliation: readonly ReconciliationResult[] | undefined` _(optional)_ — For round>1, s3's reconcileRound output classifying the prior round's HIGH/MED findings against this round's findings -- rendered as inline resolved/still-open/contradicted/no-longer-surfaced annotations (ac2/lc3). Undefined for round 1, where no prior round exists to reconcile against.

**Returns:** `Promise<string>` — The absolute path of the persisted Markdown file written for this round, ready for the caller to pass directly to insrc_present (ac3) with no further path computation.

**Errors:**
- `Error` when call.reviewId fails the same literal-identifier validation s3's reconcileRound already enforces (requireValidReviewId) -- rejected before any path is joined or any file is written.
- `Error` when call.round is not a positive integer.

**Preconditions:**
- findings is this round's own finalized, self-contained finding set -- never re-derived or re-grounded by this call
- reconciliation, when provided, is s3's reconcileRound output for the (round-1, round) adjacent pair only, never a multi-round accumulation

**Postconditions:**
- Exactly one Markdown file is written under the reviewed repository's .insrc/tmp/<call.reviewId>/ directory for this round, matching k7's own listing of what the temp folder holds before terminal-state deletion
- The returned path points to that exact file

## 3. Data model changes

### 3.1 `ReviewReportDocgenCall` — new

interface ReviewReportDocgenCall { readonly reviewId: string; readonly round: number; } -- exactly sc4's HLD interfaceSketch, used as renderReviewReport's own identifying first parameter.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | ReviewReportDocgenCall and renderReviewReport are authored here as sc4's concrete shape, implementing the HLD interfaceSketch verbatim as renderReviewReport's first parameter and adding the findings/reconciliation parameters the render logic itself needs -- the same precedent sc3/reconcileRound already established, whose own bare interfaceSketch likewise omitted reconcileRound's full parameter list. |
| `sc1` | consumes | This Story's contract does not reference RoundDriverHooks fields directly -- renderReviewReport is called by s1's round-driver cycle once reviewKind/checkpointGranularity have already shaped that cycle; s4 only needs the findings and reconciliation results the cycle already produced at that point. |
| `sc2` | consumes | findings: readonly Finding[] is read directly -- each finding's id/category/severity is rendered verbatim; this Story does not redefine Finding's shape. |
| `sc3` | consumes | reconciliation: readonly ReconciliationResult[] \| undefined is read directly -- each result's verdict becomes that prior finding's inline annotation, keyed by priorFindingRef back to the finding it refers to; this Story does not redefine ReconciliationResult's shape or recompute verdicts. The HLD's own sc3.consumedByStories and s4's boundary.depends do not yet list this dependency even though ac1/ac2 require it -- see the hld.amendmentProposal submitted at the contract.detail step, which declares it explicitly. |

## 5. Error paths

**Error cases**

- **call.reviewId contains a path-traversal or otherwise non-literal segment (e.g. '../../../private')** (recoverable)
  - Detection: A literal-identifier regex check (matching s3's own requireValidReviewId, src/workflow/review-round/reconciliation.ts) run before any path is joined.
  - Response: Throws synchronously before any filesystem access, rather than joining the value into the write path unvalidated.
  - User impact: The round-driver's render call fails outright for this round rather than silently writing outside the review's own .insrc/tmp/<reviewId>/ directory.
- **call.round is not a positive integer** (recoverable)
  - Detection: Number.isInteger(call.round) && call.round >= 1 check, mirroring runReviewRound's own round validation (src/workflow/review-round/driver.ts).
  - Response: Throws a RangeError synchronously before any write.
  - User impact: The caller sees an immediate, specific failure rather than a file silently written under a round-0 or fractional-round filename.
- **The reviewed repository cannot be resolved (no registered repo for the request's cwd, and no INSRC_REPO fallback) -- the exact class of defect s3's reconciliation.ts needed three external review rounds to fully fix** (recoverable)
  - Detection: resolveRepoPath (the canonical precedence resolver, src/daemon/steps/resolve-repo.ts) returns undefined.
  - Response: Rejects rather than silently defaulting to the daemon process's own cwd, applying the identical fix s3's reconcileRound already required.
  - User impact: The round's render step fails outright rather than writing the Markdown file under the wrong repository's temp folder.
- **The write to .insrc/tmp/<reviewId>/ fails (disk full, permission denied, directory cannot be created)** (recoverable)
  - Detection: The underlying filesystem write call rejects.
  - Response: renderReviewReport propagates the rejection unchanged rather than returning a path to a file that was never actually written.
  - User impact: The round-driver sees the render step as having failed outright, rather than receiving a path to a nonexistent file it might hand to insrc_present.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| round is 1 (no prior round exists) | reconciliation and priorFindings are both undefined/omitted; the rendered MD shows only this round's own findings with no annotation section at all -- not an empty annotation section, since there is nothing to reconcile against. |
| findings is an empty array (this round found nothing) | The rendered MD still renders successfully, showing an explicit 'no findings this round' statement rather than an empty or malformed section. |
| reconciliation is provided (round>1) but describing what each priorFindingRef actually refers to requires the prior round's own Finding objects, which ReconciliationResult does not carry (it only carries priorFindingRef + verdict, per sc3's own interfaceSketch) | renderReviewReport's signature therefore also takes priorFindings: readonly Finding[] \| undefined -- the exact prior-round finding set s3's reconcileRound was called with -- alongside reconciliation, so each ReconciliationResult.priorFindingRef can be resolved back to that prior finding's own category/severity for a meaningful inline annotation. This corrects the contract section's initial two-parameter signature (call, findings, reconciliation), which omitted this third parameter; the Task that implements this Story must carry the corrected four-parameter signature (call, findings, reconciliation, priorFindings). |
| reconciliation contains a priorFindingRef with no matching entry in the supplied priorFindings | That annotation is rendered with its verdict alone, naming the bare priorFindingRef since no richer description is available -- renderReviewReport never throws for a lookup miss here, since s3's own reconciliation contract guarantees the id itself (not the lookup) is correct, and a rendering gap is not a reason to fail the whole round's report. |

**Invariants to preserve**

- A round's review-report MD shows only that round's own findings, with inline annotations limited to whichever prior findings this round's own reconciliation pass actually classified -- never a running audit of all history (lc3). [[c1]]
- findings is this round's own full, independently re-grounded set -- never re-derived or re-grounded by this call (k4). [[c1]]
- Reconciliation is a separate, already-completed dedicated pass; this call never performs its own reconciliation or re-grounding (k5). [[c1]]

## 6. Test strategy

**Test framework:** `node:test, run via npx tsx --test, with a compile-time @ts-expect-error fixture for ReviewReportDocgenCall checked through a throwaway tsconfig (matches this Epic's s1/s2/s3 convention)`

**Test levels**

- **unit** — Prove renderReviewReport writes exactly one persisted Markdown file under the review's own temp directory and returns its path (ac1), that round-1 vs round>1 rendering differs exactly as lc3/ac2 require, and the error/edge behaviors error-paths names.
  - Subjects: `renderReviewReport writes a persisted Markdown file under the review's own .insrc/tmp/<reviewId>/ directory and returns its path`, `the written Markdown renders every finding in this round's own findings array, each annotated with its category and severity`, `for round 1, the rendered Markdown carries no reconciliation annotation section at all, since no prior round exists to reconcile against`, `for round greater than 1, the rendered Markdown inlines each reconciliation result's verdict next to the prior finding it refers to (via priorFindings), limited to only the findings this round's own reconciliation classified -- never a running audit of all history`, `a reviewId containing a path-traversal segment is rejected before any filesystem access`, `a non-positive-integer round is rejected with a RangeError before any write`, `when the reviewed repository cannot be resolved, renderReviewReport rejects rather than silently defaulting to the daemon process's own cwd`, `a rejecting filesystem write propagates its rejection rather than returning a path to a file that was never actually written`, `an empty findings array still renders successfully with an explicit statement that no findings were produced this round`, `the path renderReviewReport returns points to a file that exists and is readable immediately after the call resolves, so insrc_present can open it with no further round-driver action`
  - Fixtures: `a temp-directory fixture standing in for .insrc/tmp/<reviewId>/`, `a compile-time typecheck fixture (__type-tests__/review-report.typecheck.ts) with an exact-keys Equal<keyof ReviewReportDocgenCall, 'reviewId'|'round'> assertion`, `a stub repo-resolution dependency (resolveRepoRoot override) to avoid the real daemon client in unit tests, matching s3's own test seam convention`, `sample Finding and ReconciliationResult fixtures, including a reconciliation entry whose priorFindingRef has no matching priorFindings entry`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `renderReviewReport writes a persisted Markdown file under the review's own .insrc/tmp/<reviewId>/ directory and returns its path`, `the written Markdown renders every finding in this round's own findings array, each annotated with its category and severity` |
| `ac2` | `for round greater than 1, the rendered Markdown inlines each reconciliation result's verdict next to the prior finding it refers to (via priorFindings), limited to only the findings this round's own reconciliation classified -- never a running audit of all history` |
| `ac3` | `the path renderReviewReport returns points to a file that exists and is readable immediately after the call resolves, so insrc_present can open it with no further round-driver action` |

## 7. Alternatives considered

### 7.1 a1: Standalone render-to-Markdown function, not wired into the existing HTML/SVG docgen registry — **CHOSEN**

A dedicated reviewReportDocgen(reviewId, round) call composes the round's Finding[] (+ReconciliationResult[] for round>1) directly into a Markdown string and persists it, independent of src/docgen/'s diagram framework.

A single function (the Epic's own 'review-report docgen' call, sc4) takes reviewId and round, reads the round's own findings and -- for round>1 -- the reconciliation result (both already in hand from s1's round-driver cycle, never re-derived), and renders them to a Markdown string: a heading, the round's findings grouped/annotated by category+severity, and (round>1 only) inline resolved/still-open/contradicted annotations limited to the specific prior Feedback items the submitter's corrections entries addressed or rejected this round (ac2/lc3). It writes that Markdown to a persisted path and returns it, matching ac1's literal 'persisted MD artifact' wording. It is never registered into src/docgen/registry.ts's InMemoryDocTypeRegistry -- that registry's own contract (DocumentIR -> RenderedDocumentShell) is diagram-first (derived graph nodes/edges rendered to a self-contained HTML/SVG shell per the how-does-it-work grounding), a shape with no natural meaning for a findings list, and handleDocgen itself never persists to disk anyway.

### 7.2 a2: Register a literal 'review-report' docType into the existing src/docgen/ HTML/SVG registry

Add a DocTypeRegistration (src/docgen/registry.ts) whose extract() returns a DocumentIR with empty derived.nodes/edges and the round's findings/reconciliation rendered as narrated.sections prose, producing a RenderedDocumentShell.

Follow the exact pattern narrativeRegistration (src/docgen/extract/narrative.ts) uses: register 'review-report' with its own extractorInputSchema ({reviewId, round}), an extract() that builds a DocumentIR (derived.nodes/edges left empty -- a findings list has no diagram shape -- narrated.sections carrying the findings/reconciliation as prose), rendered through the shared shell to a self-contained offline HTML file with diagramFormat:'svg' (literal) and an inlined SVG runtime it will never actually use.

**Rejected because:** Violates ac1 and sc4 directly on their own literal wording (an HTML shell is not a persisted MD artifact), and still requires its own separate disk-write step on top since handleDocgen never persists -- the registration buys reuse of a dispatch mechanism while failing the actual acceptance requirement it exists to satisfy.

### 7.3 a3: Both: register a diagram-shaped docType AND a separate Markdown writer

Do a2's registration for discoverability on the existing docgen surfaces, plus a1's standalone Markdown writer for the actual persisted artifact ac1 requires.

Register 'review-report' into src/docgen/registry.ts (as in a2) purely so it is enumerable alongside the other docTypes, while the actual rendered-and-persisted document ac1 requires is produced by a1's separate Markdown composer -- the HTML registration becomes a secondary, effectively unused surface.

**Rejected because:** Technically satisfies every constraint by including a1's mechanism, but only by also building a second, acceptance-criteria-unused rendering path (a2's registry entry) purely for its own sake -- a direct instance of the flexibility-nobody-asked-for this Story's acceptance criteria do not call for, at the highest cost (L) for zero additional satisfied constraint.

## 8. References

- **[[c1]]** `code` `src/mcp/docgen/handler.ts`
- **[[c2]]** `code` `src/docgen/types.ts`
- **[[c3]]** `code` `src/docgen/registry.ts`
- **[[c4]]** `code` `src/docgen/extract/narrative.ts`
- **[[c5]]** `code` `src/docgen/render/narrative.ts`
- **[[c6]]** `code` `src/workflow/review-round/reconciliation.ts`
- **[[c7]]** `code` `src/workflow/review-round/driver.ts`
- **[[c8]]** `code` `src/daemon/steps/resolve-repo.ts`
- **[[c9]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc4`

## 9. Open questions

- The contract section's renderReviewReport signature currently lists three parameters (call, findings, reconciliation); error-paths/test-strategy identified that a fourth parameter, priorFindings: readonly Finding[] | undefined, is required so each ReconciliationResult.priorFindingRef can be resolved back to the prior finding's own category/severity for a meaningful inline annotation. The Task implementing this Story must carry the corrected four-parameter signature.
- The contract section's api.errors lists type 'Error' for an invalid round; error-paths names this specifically as a RangeError (mirroring runReviewRound's own RangeError for an invalid round). The Task implementing this Story must align to RangeError.

## Resolved questions

- `q62f7c578` — The contract section's renderReviewReport signature currently lists three parameters (call, findings, reconciliation); error-paths/test-strategy identified that a fourth parameter, priorFindings: readonly Finding[] | undefined, is required so each ReconciliationResult.priorFindingRef can be resolved back to the prior finding's own category/severity for a meaningful inline annotation. The Task implementing this Story must carry the corrected four-parameter signature.
  - **resolved**: Add priorFindings as a fourth parameter — ReconciliationResult only carries priorFindingRef + verdict (sc3's own interfaceSketch), not the prior finding's own category/severity -- renderReviewReport needs priorFindings: readonly Finding[] | undefined (the exact set s3's reconcileRound was called with) to render a meaningful annotation. The implementing Task carries this corrected four-parameter signature: (call, findings, reconciliation, priorFindings). _(2026-11-20T06:38:26.237Z)_
- `q8c471cdf` — The contract section's api.errors lists type 'Error' for an invalid round; error-paths names this specifically as a RangeError (mirroring runReviewRound's own RangeError for an invalid round). The Task implementing this Story must align to RangeError.
  - **resolved**: Specify RangeError consistently — Matches error-paths' own detail and the established runReviewRound precedent (src/workflow/review-round/driver.ts), which already throws a RangeError for an invalid round -- removes ambiguity rather than leaving a broad Error type that undersells the actual, more specific contract. _(2026-11-20T06:38:52.987Z)_

## Citations

- **[[c1]]** `code` `src/mcp/docgen/handler.ts`
- **[[c2]]** `code` `src/docgen/types.ts`
- **[[c3]]** `code` `src/docgen/registry.ts`
- **[[c4]]** `code` `src/docgen/extract/narrative.ts`
- **[[c5]]** `code` `src/docgen/render/narrative.ts`
- **[[c6]]** `code` `src/workflow/review-round/reconciliation.ts`
- **[[c7]]** `code` `src/workflow/review-round/driver.ts`
- **[[c8]]** `code` `src/daemon/steps/resolve-repo.ts`
- **[[c9]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc4`
