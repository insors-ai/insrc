<!-- insrc:artifact LLD-03f4fd3b9102aab8-s5 -->

# LLD: STORY-03f4fd3b9102aab8-s5 — Per-review-type checkpointing and temp-folder lifecycle make a review resumable and its final result durable

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**HLD base run:** `wf-1794986545330-2wntv5`
**HLD effective hash:** `6d57abfa68ac...`
**Tracker:** [insors-ai/insrc#215](https://github.com/insors-ai/insrc/issues/215)

This Story adds the generic review-checkpoint record and the .insrc/tmp/<reviewId>/ folder lifecycle that make a review resumable after a crash and its final result durable after cleanup. A checkpoint is written automatically after each completed unit of work -- a round for design review, a Task for code review -- and a resume reads it back to skip what already finished. Before the temp folder is ever deleted, the final round's output is copied into durable storage first.

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
**Owns:** `sc5` (Review checkpoint record)
**Consumes:** `sc1` (Review-type hook set)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The round-driver function itself -- what it does internally to run the grounding+findings, reconciliation, render+present and checkpoint-write cycle -- stays private to s1; no other Story's type depends on the driver's internals, only on the hook contract sc1 exposes. — owns `sc1`
- `s2`: Which exact per-review-type severity scales exist beyond the HIGH/MED default, and how a review type's Feedback implementation declares its own, stay internal to s2; no other Story's type depends on Finding's shape. — owns `sc2`
- `s3`: How the reconciliation LLM call is actually prompted, and how it reads the temp folder's audit trail when needed, stay internal to s3; no other Story's type depends on ReconciliationResult's internals beyond its verdict shape. — owns `sc3`
- `s4`: The exact docgen docType registration and MD rendering logic (including the resolved/still-open/contradicted annotation rule scoped to this round's own corrections) stay internal to s4; no other Story's type depends on the renderer's internals. — owns `sc4`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `writeCheckpoint`

```typescript
function writeCheckpoint(checkpoint: ReviewCheckpoint): Promise<void>
```

**Parameters:**
- `checkpoint: ReviewCheckpoint` — The reviewId and the unit (round or Task) that just finished -- written automatically by the round-driver's cycle, with no agent-driven step (ac1/k6).

**Returns:** `Promise<void>` — Resolves once the checkpoint JSON has been written to .insrc/tmp/<reviewId>/checkpoint.json.

**Preconditions:**
- Called only after a full unit of work (round, or Task) has actually completed -- never mid-cycle

**Postconditions:**
- The written checkpoint.json reflects exactly this call's checkpoint argument, overwriting any prior checkpoint for the same reviewId

### 2.2 `readCheckpoint`

```typescript
function readCheckpoint(reviewId: string): Promise<ReviewCheckpoint | undefined>
```

**Parameters:**
- `reviewId: string` — Identifies which review's checkpoint to read back on resume (ac2).

**Returns:** `Promise<ReviewCheckpoint | undefined>` — The last-written checkpoint for this reviewId, or undefined when no checkpoint exists yet (a review that never completed its first unit).

**Postconditions:**
- A resume that reads a defined checkpoint re-runs only the unit of work after lastCompletedUnit, never a unit already completed

### 2.3 `finalizeReview`

```typescript
function finalizeReview(reviewId: string, finalOutput: unknown): Promise<void>
```

**Parameters:**
- `reviewId: string` — Identifies which review has reached a terminal state (ac3).
- `finalOutput: unknown` — The final round's review-output JSON to copy into durable artifact storage before the temp folder is deleted.

**Returns:** `Promise<void>` — Resolves once finalOutput has been durably persisted and the .insrc/tmp/<reviewId>/ folder has been deleted.

**Preconditions:**
- Called only once a review has reached a terminal state -- never mid-review

**Postconditions:**
- finalOutput is copied into durable artifact storage BEFORE the .insrc/tmp/<reviewId>/ folder is deleted -- this ordering is never reversed (ac3/k7)
- After this call resolves, .insrc/tmp/<reviewId>/ (including its checkpoint.json) no longer exists

## 3. Data model changes

### 3.1 `ReviewCheckpoint` — new

interface ReviewCheckpoint { readonly reviewId: string; readonly lastCompletedUnit: { readonly kind: 'round' | 'task'; readonly ref: number | string }; } -- exactly sc5's HLD interfaceSketch, unchanged. A generic JSON side-record stored at .insrc/tmp/<reviewId>/checkpoint.json, independent of ReviewContext's own fields (lc4) -- ReviewContext does not exist yet (confirmed in s1's decision-trace bundle), so this Story's reviewId identity guarantee (ac4) covers only its own half: checkpoint.reviewId equals the temp folder's name, by construction.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | ReviewCheckpoint and the three lifecycle functions are authored here as sc5's concrete shape, implementing the HLD interfaceSketch verbatim and generalizing the per-review-type checkpoint pattern s1's how-does-it-work bundle found in the retiring design-review/code-review checkpoint files. |
| `sc1` | consumes | writeCheckpoint's granularity (round vs Task) is determined by whatever sc1's RoundDriverHooks.checkpointGranularity names for that review type; this Story's contract does not redefine or re-derive that mapping, only reads it. |

## 5. Error paths

**Error cases**

- **writeCheckpoint's file write to .insrc/tmp/<reviewId>/checkpoint.json fails (e.g. disk error, permissions)** (recoverable)
  - Detection: the underlying filesystem write call rejects
  - Response: writeCheckpoint propagates the rejection to the caller rather than resolving as if the checkpoint had been saved
  - User impact: the caller knows the checkpoint did not persist, instead of believing a resume-safety guarantee exists that was never actually written
- **finalizeReview's copy of finalOutput into durable artifact storage fails** (recoverable)
  - Detection: the durable-copy operation's Promise rejects
  - Response: finalizeReview propagates the rejection and does NOT proceed to delete the .insrc/tmp/<reviewId>/ folder -- the ordering in ac3/k7 is never reversed even on failure
  - User impact: a review's final result is never lost to a failed copy silently followed by deletion; the temp folder (and its data) stays intact as a fallback until the copy can be retried
- **finalizeReview's deletion of the .insrc/tmp/<reviewId>/ folder fails after the durable copy has already succeeded** (recoverable)
  - Detection: the folder-deletion operation rejects, observed strictly after the durable-copy step already resolved
  - Response: finalizeReview propagates the rejection, but by this point finalOutput is already safely durable -- only cleanup is incomplete, not the review's result
  - User impact: the review's final result is safe; a leftover temp folder is the user-visible residue of a failed cleanup, not data loss

**Edge cases**

| Input | Expected |
| :--- | :--- |
| readCheckpoint is called for a reviewId whose first unit of work has not completed yet (no checkpoint.json exists) | readCheckpoint returns undefined, not an error -- a review that has not completed anything yet is a valid, expected state |
| writeCheckpoint is called twice in a row for the same reviewId (e.g. a retried call after a transient failure) | the second call's checkpoint overwrites the first in checkpoint.json; no duplicate-write error or merge logic is needed |
| lastCompletedUnit.ref is a string (a code-review Task identifier) rather than a number (a design-review round) | ReviewCheckpoint accepts either, exactly as sc5's own interfaceSketch types ref: number \| string -- no special-casing per review kind inside this Story's contract |

## 6. Test strategy

**Test framework:** `node:test, run via npx tsx --test (matches this Epic's s1-s4 convention)`

**Test levels**

- **unit** — Prove the checkpoint is written automatically and read correctly across a crash/resume cycle (ac1/ac2), that finalizeReview's copy-then-delete ordering is never reversed even on failure (ac3), and that this Story's own half of the reviewId identity holds by construction (ac4).
  - Subjects: `writeCheckpoint persists a checkpoint automatically, with no agent-driven step, after a full unit of work completes`, `readCheckpoint after a simulated crash returns the last-completed unit, so a resume re-runs only the in-flight unit, not units already completed`, `finalizeReview copies the final round's output into durable artifact storage before deleting the temp folder, never in the reverse order`, `finalizeReview does not delete the temp folder when the durable-copy step fails`, `finalizeReview propagates a deletion failure but leaves the already-copied durable output intact and safe`, `ReviewCheckpoint.reviewId equals the .insrc/tmp/<reviewId>/ folder's own name, by construction, for every checkpoint this Story writes`, `readCheckpoint returns undefined for a reviewId with no checkpoint yet, not an error`, `writeCheckpoint's second call for the same reviewId overwrites the first in checkpoint.json`, `ReviewCheckpoint.lastCompletedUnit.ref accepts both a number (a design-review round) and a string (a code-review Task identifier) without special-casing`
  - Fixtures: `a temp-directory fixture standing in for .insrc/tmp/<reviewId>/, cleaned up after each test`, `a stub durable-artifact-storage sink and a stub folder-deletion function, each independently failable, to exercise finalizeReview's error paths`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `writeCheckpoint persists a checkpoint automatically, with no agent-driven step, after a full unit of work completes` |
| `ac2` | `readCheckpoint after a simulated crash returns the last-completed unit, so a resume re-runs only the in-flight unit, not units already completed` |
| `ac3` | `finalizeReview copies the final round's output into durable artifact storage before deleting the temp folder, never in the reverse order`, `finalizeReview does not delete the temp folder when the durable-copy step fails` |
| `ac4` | `ReviewCheckpoint.reviewId equals the .insrc/tmp/<reviewId>/ folder's own name, by construction, for every checkpoint this Story writes` |

## 7. Alternatives considered

### 7.1 a1: Flat ReviewCheckpoint per sc5's sketch, plus three small side-record functions keyed by reviewId alone — **CHOSEN**

interface ReviewCheckpoint { reviewId, lastCompletedUnit } exactly as sc5 sketches it; writeCheckpoint/readCheckpoint/finalizeReview operate on '.insrc/tmp/<reviewId>/checkpoint.json', with granularity (round vs Task) read from sc1's RoundDriverHooks.checkpointGranularity, never redefined here.

interface ReviewCheckpoint { readonly reviewId: string; readonly lastCompletedUnit: { readonly kind: 'round' | 'task'; readonly ref: number | string }; } -- exactly sc5's HLD interfaceSketch. Three functions: writeCheckpoint(checkpoint: ReviewCheckpoint): Promise<void> (called automatically by the round-driver after a full round/Task cycle completes, per ac1 -- no agent-driven step); readCheckpoint(reviewId: string): Promise<ReviewCheckpoint | undefined> (used on resume to skip already-completed units, per ac2); finalizeReview(reviewId: string, finalOutput: unknown): Promise<void> (copies the final round's review-output JSON into durable artifact storage, then deletes the .insrc/tmp/<reviewId>/ folder, per ac3). All three key purely off reviewId as a plain string -- the folder name and checkpoint.reviewId are the same value by construction, satisfying this Story's own half of ac4/k8; ReviewContext's header-level reviewId is a separate, not-yet-existing field this Story cannot verify.

### 7.2 a2: Stateful ReviewSession class bundling checkpoint + folder lifecycle together

A `ReviewSession` class wraps write/read/finalize into one object with internal mutable state, instead of three independent functions.

class ReviewSession { constructor(reviewId: string); writeCheckpoint(unit): Promise<void>; readCheckpoint(): Promise<ReviewCheckpoint | undefined>; finalize(finalOutput): Promise<void>; } -- the object tracks its own open/closed lifecycle state internally across calls.

**Rejected because:** Functionally equivalent to a1 on every acceptance criterion, but introduces unrequested statefulness (an open/closed session lifecycle) with no acceptance criterion asking for it, at the same cost.

### 7.3 a3: Checkpoint stored as a field on ReviewContext itself, instead of a separate side-record

Fold lastCompletedUnit directly into ReviewContext's own fields rather than keeping ReviewCheckpoint as an independent JSON side-record.

Add a `checkpoint: { kind, ref }` field directly onto the (not-yet-existing) ReviewContext type, read/written as part of the context object itself rather than a separate file.

**Rejected because:** Violates sc5's own stated invariant (lc4) outright, breaks ac3's clean deletion ordering, and depends on redesigning a type owned by an entirely different Epic -- disqualifying regardless of cost.

## 8. References

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/HLD.md`
- **[[c7]]** `analyze-bundle` `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/DEF.md`
- **[[c8]]** `analyze-bundle` `docs/epics/review-rounds-reconciliation-recovery-E2026111803f4fd3b/DEF.md`
- **[[c9]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc5`

## 9. Open questions

- ac4 requires reviewId to be the same identity as both the .insrc/tmp/<reviewId>/ folder's name AND a header-level field on ReviewContext. This Story's design fully satisfies its own half (checkpoint.reviewId === folder name, by construction) but cannot verify the ReviewContext-side half, since ReviewContext does not exist yet anywhere in the codebase -- confirmed by direct grep and by the companion shared-reviewcontext-data-model Epic's (50cde239426d6e2a) own HLD, which explicitly defers assembling it as Non-Goal follow-on work. This Epic's own DEF already documents this as a HIGH-risk item (line 70): the companion Epic must incorporate a header-level reviewId field before this Story's full ac4 guarantee can be implemented and verified end-to-end. Not a new gap -- surfacing it for the cross-review pass and for a future Story in the companion Epic to track explicitly.

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/HLD.md`
- **[[c7]]** `analyze-bundle` `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/DEF.md`
- **[[c8]]** `analyze-bundle` `docs/epics/review-rounds-reconciliation-recovery-E2026111803f4fd3b/DEF.md`
- **[[c9]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc5`
