<!-- insrc:artifact LLD-03f4fd3b9102aab8-s3 -->

# LLD: STORY-03f4fd3b9102aab8-s3 — A dedicated reconciliation pass tracks prior findings without ever gating approval

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**HLD base run:** `wf-1794986545330-2wntv5`
**HLD effective hash:** `6d57abfa68ac...`
**Tracker:** [insors-ai/insrc#213](https://github.com/insors-ai/insrc/issues/213)

This Story adds the dedicated reconciliation pass that runs after a correction round's findings are finalized. It compares the prior round's HIGH/MED findings against the new round's own independent findings and classifies each as confirmed, still-open, contradicted, or no-longer-surfaced -- purely for the submitter and reviewer to see round-over-round disposition. This classification never feeds the approval gate; round N's own findings alone decide block vs. pass.

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
**Owns:** `sc3` (Reconciliation result shape)
**Consumes:** `sc1` (Review-type hook set)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The round-driver function itself -- what it does internally to run the grounding+findings, reconciliation, render+present and checkpoint-write cycle -- stays private to s1; no other Story's type depends on the driver's internals, only on the hook contract sc1 exposes. — owns `sc1`
- `s2`: Which exact per-review-type severity scales exist beyond the HIGH/MED default, and how a review type's Feedback implementation declares its own, stay internal to s2; no other Story's type depends on Finding's shape. — owns `sc2`
- `s4`: The exact docgen docType registration and MD rendering logic (including the resolved/still-open/contradicted annotation rule scoped to this round's own corrections) stay internal to s4; no other Story's type depends on the renderer's internals. — owns `sc4`
- `s5`: The exact per-review-type granularity mapping (round-level for design review, per-Task for code review) and the durable-copy-before-deletion mechanics stay internal to s5; no other Story's type depends on ReviewCheckpoint's internals beyond what sc1's round-driver needs to call it. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `reconcileRound`

```typescript
function reconcileRound(reviewId: string, priorFindings: readonly Finding[], currentFindings: readonly Finding[]): Promise<readonly ReconciliationResult[]>
```

**Parameters:**
- `reviewId: string` — Identifies which review's .insrc/tmp/<reviewId>/ folder this call may read for its audit trail, if the two finding sets alone do not resolve a classification -- per the HLD's own boundary text ('how it reads the temp folder's audit trail when needed stays internal to s3'), that reading happens inside this function, not by the caller pre-extracting and passing a string.
- `priorFindings: readonly Finding[]` — The prior round's HIGH/MED findings. Finding now carries its own id (sc2, amended HLD revision 4) -- each ReconciliationResult.priorFindingRef is that finding's own id, so this Story no longer needs a caller-assigned key.
- `currentFindings: readonly Finding[]` — Round N's own finalized, self-contained finding set (produced by s1's round-driver per ac1/k4) -- read-only input for classification, never re-derived or re-grounded by this call.

**Returns:** `Promise<readonly ReconciliationResult[]>` — One ReconciliationResult per entry in priorFindings, each carrying that finding's own id as priorFindingRef and the verdict reconciliation assigned it against currentFindings.

**Preconditions:**
- priorFindings and currentFindings both come from round N's own finalized output -- this call never performs its own re-grounding pass
- priorFindings contains only the prior round's HIGH/MED findings, not its LOW findings, per sc3's purpose (k3/k5 only concern HIGH/MED)

**Postconditions:**
- Exactly one ReconciliationResult is produced per entry in priorFindings, keyed by that finding's own id, in a single dedicated call -- never folded into the same pass that produced currentFindings (ac1/k5)
- The returned array is never consulted by or passed into the round N approval gate -- it is purely informational/presentational (ac2/k3)
- If the two finding sets alone do not resolve a classification, reconcileRound reads the audit trail itself from .insrc/tmp/<reviewId>/ -- the caller never extracts or passes that content; cross-review found the original auditTrail?: string parameter contradicted the HLD's own framing that this reading stays internal to s3, and this signature was corrected to match it.

## 3. Data model changes

### 3.1 `ReconciliationVerdict` — new

type ReconciliationVerdict = 'confirmed' | 'still-open' | 'contradicted' | 'no-longer-surfaced'; -- exactly sc3's HLD interfaceSketch, a fixed 4-member union.


### 3.2 `ReconciliationResult` — new

interface ReconciliationResult { readonly priorFindingRef: string; readonly verdict: ReconciliationVerdict; } -- exactly sc3's HLD interfaceSketch, unchanged. priorFindingRef is the matching prior Finding's own id field (sc2, amended HLD revision 4 to add Finding.id) -- this Story no longer needs a caller-assigned opaque key, since Finding now carries stable identity of its own.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | ReconciliationVerdict, ReconciliationResult and reconcileRound are authored here as sc3's concrete shape, implementing the HLD interfaceSketch verbatim and adding the one dedicated call the Story's acceptance criteria require. |
| `sc2` | consumes | priorFindings and currentFindings are both readonly Finding[] (sc2, amended HLD revision 4 to add id); ReconciliationResult.priorFindingRef is read directly from each prior finding's own id field, which this Story does not define or redesign. |
| `sc1` | consumes | reconcileRound is invoked by a review type's round-driver cycle (sc1, owned by s1) once a round's findings are finalized; this Story's contract does not reference RoundDriverHooks fields directly, it only accepts the finding sets and ref keys the driver already has at that point in the cycle. |

## 5. Error paths

**Error cases**

- **the underlying dedicated LLM call that reconcileRound makes rejects (e.g. errors or times out)** (recoverable)
  - Detection: the Promise reconcileRound returns rejects
  - Response: reconcileRound propagates the rejection unchanged to the caller rather than returning partial, empty, or fabricated verdicts for the entries it did not finish classifying
  - User impact: the caller sees reconciliation as having failed outright for this round, rather than silently receiving verdicts that look complete but are not grounded in an actual classification

**Edge cases**

| Input | Expected |
| :--- | :--- |
| priorFindings is an empty array (the prior round had zero HIGH/MED findings) | reconcileRound returns an empty array -- there is nothing to classify, and this is not an error |
| currentFindings is an empty array (round N found nothing) | reconcileRound still returns one ReconciliationResult per entry in priorFindings; an empty currentFindings set is valid input to the classification call, likely yielding 'no-longer-surfaced' verdicts, but that judgment is the LLM call's to make, not this contract's to assume |
| no audit trail file exists yet in .insrc/tmp/<reviewId>/ (nothing has been written there, or the two finding sets alone are enough) | reconcileRound classifies using only the two finding sets; a missing or unneeded audit trail is not an error |
| two entries in priorFindings have identical category and severity but different id values | reconcileRound still produces two separate ReconciliationResult entries, one per distinct id -- Finding.id is what establishes identity here, not category/severity content |

## 6. Test strategy

**Test framework:** `node:test, run via npx tsx --test, with a compile-time @ts-expect-error fixture for ReconciliationVerdict/ReconciliationResult checked through a throwaway tsconfig (matches this Epic's s1/s2 convention)`

**Test levels**

- **unit** — Prove reconcileRound never re-grounds and produces exactly one result per prior ref (ac1), and that ReconciliationResult's shape carries no field a gate could consume (ac2), plus the rejection-propagation and identity-by-ref edge behaviors.
  - Subjects: `reconcileRound produces exactly one ReconciliationResult per entry in priorFindings, keyed by that finding's own id`, `reconcileRound's parameters are reviewId and the two finding sets only -- no ReviewTargets-shaped parameter exists anywhere in its signature, so no re-grounding input is even possible`, `ReconciliationResult's exported shape contains exactly priorFindingRef and verdict, with no severity, blocking, or gate-facing field of any kind`, `ReconciliationVerdict accepts exactly the four fixed verdicts (confirmed, still-open, contradicted, no-longer-surfaced) and rejects any other value at compile time`, `a rejecting reconcileRound call propagates its rejection rather than returning partial or fabricated results`, `priorFindings as an empty array returns an empty array, not an error`, `two priorFindings entries with identical category and severity but different id values still produce two separate ReconciliationResult entries, keyed by their distinct ids`, `when the two finding sets alone do not resolve a classification, reconcileRound reads the audit trail itself from .insrc/tmp/<reviewId>/, rather than requiring the caller to have pre-extracted and passed it in`
  - Fixtures: `a stub reconcileRound-shaped function with a spyable call to assert argument shape and count`, `a compile-time typecheck fixture (__type-tests__/reconciliation-result.typecheck.ts) with @ts-expect-error assertions for an invalid verdict literal and an exact-keys Equal<keyof ReconciliationResult, 'priorFindingRef'|'verdict'> assertion`, `a temp-directory fixture standing in for .insrc/tmp/<reviewId>/ with and without an audit-trail file present, to exercise reconcileRound's own internal read`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `reconcileRound's parameters are reviewId and the two finding sets only -- no ReviewTargets-shaped parameter exists anywhere in its signature, so no re-grounding input is even possible` |
| `ac2` | `ReconciliationResult's exported shape contains exactly priorFindingRef and verdict, with no severity, blocking, or gate-facing field of any kind` |

## 7. Alternatives considered

### 7.1 a1: Flat ReconciliationResult per sc3's sketch, with a caller-assigned opaque priorFindingRef — **CHOSEN**

One function takes the two adjacent rounds' finding sets plus an optional audit-trail string and returns one ReconciliationResult per prior HIGH/MED finding; priorFindingRef is whatever opaque string the caller (the round-driver, s1) already uses to identify that finding, since Finding (sc2) itself carries no id field.

type ReconciliationVerdict = 'confirmed' | 'still-open' | 'contradicted' | 'no-longer-surfaced'; interface ReconciliationResult { readonly priorFindingRef: string; readonly verdict: ReconciliationVerdict; } -- exactly sc3's HLD interfaceSketch. function reconcileRound(priorFindingRefs: ReadonlyMap<string, Finding>, currentFindings: readonly Finding[], auditTrail?: string): Promise<readonly ReconciliationResult[]> -- the caller supplies each prior HIGH/MED finding keyed by whatever ref it already tracks (sc2's Finding has no built-in id, so this Story does not invent one; it only consumes whatever opaque key the round-driver assigns). One ReconciliationResult is produced per entry in priorFindingRefs, classified against currentFindings and, if needed, auditTrail -- a single dedicated LLM call per round, never re-grounding against ReviewTargets.

### 7.2 a2: ReconciliationResult embeds the full prior Finding instead of a string ref

interface ReconciliationResult { readonly priorFinding: Finding; readonly verdict: ReconciliationVerdict }, self-contained without needing any external key.

Replace sc3's flat `priorFindingRef: string` with a `priorFinding: Finding` field carrying the full prior finding inline, so no caller-assigned key is needed at all -- each result is self-describing.

**Rejected because:** Violates sc3's approved shape (embeds the full Finding instead of a string ref) and does not even solve the identity gap it claims to sidestep -- two same-category/same-severity findings remain indistinguishable either way.

### 7.3 a3: Content-hash-derived priorFindingRef computed internally from Finding's fields

reconcileRound computes each priorFindingRef itself as a deterministic hash of category+severity (+ position in the array), rather than requiring the caller to supply one.

function reconcileRound(priorFindings: readonly Finding[], currentFindings: readonly Finding[], auditTrail?: string): Promise<readonly ReconciliationResult[]> -- priorFindingRef is derived internally, e.g. `hash(finding.category + finding.severity + index)`, so the caller need not track any key at all.

**Rejected because:** Technically satisfies the same constraints as a1, but its content-hash approach is fragile (collides on identical category+severity, breaks under reordering) and oversteps into deciding Finding identity semantics on sc2's behalf -- a judgment call this Story's own LLM reconciliation call is supposed to make, not a hash function.

## 8. References

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/tasks/__tests__/task-set-reconcile.test.ts`
- **[[c7]]** `analyze-bundle` `src/config/reconcile.ts`
- **[[c8]]** `analyze-bundle` `src/config/reconcile-io.ts`
- **[[c9]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc3`

## 9. Open questions

- Resolved (following cross-review): sc2 was amended (HLD revision 4, fieldAdd, non-breaking) to add Finding.id: string, giving a finding a stable identity across rounds. reconcileRound now takes priorFindings: readonly Finding[] and keys each ReconciliationResult.priorFindingRef off that finding's own id, instead of requiring the caller to assign and track an opaque ref for a type (Finding, sc2) this Story does not own.
- Cross-review found reconcileRound's original auditTrail?: string parameter contradicted the HLD's own boundary text for s3 ('how it reads the temp folder's audit trail when needed stays internal to s3'): the caller would have had to pre-extract that content itself, and the signature had no reviewId to let reconcileRound read it internally either. Fixed by replacing auditTrail with a reviewId: string first parameter; reconcileRound now reads .insrc/tmp/<reviewId>/ itself when the two finding sets alone do not resolve a classification.

## Resolved questions

- `qd41f38a9` — Resolved (following cross-review): sc2 was amended (HLD revision 4, fieldAdd, non-breaking) to add Finding.id: string, giving a finding a stable identity across rounds. reconcileRound now takes priorFindings: readonly Finding[] and keys each ReconciliationResult.priorFindingRef off that finding's own id, instead of requiring the caller to assign and track an opaque ref for a type (Finding, sc2) this Story does not own.
  - **resolved**: Use Finding.id — Follows the resolved cross-review decision and sc2 HLD revision 4's non-breaking Finding.id addition; removes caller-managed opaque references. _(2026-11-19T19:06:22.010Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/tasks/__tests__/task-set-reconcile.test.ts`
- **[[c7]]** `analyze-bundle` `src/config/reconcile.ts`
- **[[c8]]** `analyze-bundle` `src/config/reconcile-io.ts`
- **[[c9]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc3`
