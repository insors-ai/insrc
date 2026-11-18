<!-- insrc:artifact DEF-03f4fd3b9102aab8 -->

# Epic: review-rounds-reconciliation-recovery

## Summary

**Flavor:** new-capability
**Seeded from:** `SPEC-e8632c1ae22c3bf8`
**Tracker:** [insors-ai/insrc#196](https://github.com/insors-ai/insrc/issues/196)

This Epic gives every review type -- design review and code review alike -- one shared process for running a review across multiple rounds: a reviewer re-grounds independently each round, a separate reconciliation pass tracks how a correction round relates to the round before it, each round's findings are rendered and presented to the submitter, and a round can recover from a crash without losing already-completed work. It replaces per-review-type checkpoint logic that previously had to be built and recovered separately for each review kind.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

The review framework has no process for running a review across multiple rounds with reliable recovery. The retired per-review-type implementation duplicated checkpoint/admission logic separately for design review and code review, had no dedicated step for reconciling a new round's findings against a prior round's, had no way to render a round's output for the submitter other than ad hoc chat summaries, and risked the reviewer anchoring on the submitter's own framing of what matters rather than independently re-deriving findings from source. Without a shared process, every review type must separately solve round sequencing, crash recovery, and how a correction round relates to the round before it, and there is no common way to decide, after a correction round runs, whether a previously raised concern has actually been addressed.

## 2. Functional requirements

- **E2026111803f4fd3b:FR001** — Run Initial Review and Correction-and-Re-review as one shared execution process, distinguished purely by round number (round 1 vs round > 1), with no divergent steering/checklist logic beyond reconciliation. _(A single process keeps the two review kinds from drifting apart in behavior that reconciliation does not already account for.)_
- **E2026111803f4fd3b:FR002** — Perform full independent re-grounding over the entire ReviewTargets scope every round, ignoring prior findings as input, so every round produces a self-contained finding set. _(Independent re-grounding is what lets a correction round genuinely re-catch a defect that is still present, rather than trusting a prior round's or the submitter's account of it.)_
- **E2026111803f4fd3b:FR003** — Classify every finding against a fixed design-review-specific taxonomy (correctness, functional-completeness, security, quality, maintainability) with a severity scale that is controller-configured per review type, defaulting to HIGH/MED. _(A fixed taxonomy keeps findings comparable across rounds and review types while leaving room for a different review type's Feedback implementation to configure its own severity scale.)_
- **E2026111803f4fd3b:FR004** — Run a dedicated reconciliation pass after each round's findings are finalized, classifying each of the prior round's HIGH/MED findings as confirmed, still-open, contradicted, or no-longer-surfaced. _(Reconciliation is what tells the submitter and reviewer how a correction round's independent findings relate to what was raised before, without that judgment ever gating approval itself.)_
- **E2026111803f4fd3b:FR005** — Render each round's findings (plus, for round > 1, the reconciliation annotations relevant to that round's own corrections) to a persisted MD artifact via a new public docgen docType, and present it to the user every round. _(A persisted, presentable artifact per round is what lets the submitter see and act on each round's outcome, and keeps the review's record auditable after the fact.)_
- **E2026111803f4fd3b:FR006** — Maintain a checkpoint record, written and read automatically and invisibly by the review process, at the granularity appropriate to the review type (round-level for design review, per-Task for code review), so a crash re-runs only the in-flight unit of work. _(Per-review-type granularity keeps recovery minimal without forcing one review type's unit of work onto another that does not share its structure.)_
- **E2026111803f4fd3b:FR007** — Copy the final round's review-output JSON into the review's durable artifact storage before deleting the .insrc/tmp/<reviewId>/ temp folder at a terminal state. _(The completed result must stay recoverable and referenceable after the ephemeral working folder is gone, even though the intermediate round material does not need to persist.)_

**s1:**

- **E2026111803f4fd3b:S001:FR001** — Run every review round, regardless of round number, through the same grounding-and-findings process. _(A shared process is what keeps Correction-and-Re-review from silently drifting from Initial Review's behavior.)_

**s2:**

- **E2026111803f4fd3b:S002:FR001** — Classify every finding against the fixed taxonomy and a per-review-type severity scale. _(Comparable categorization across rounds and review types is what lets the gate and reconciliation reason about findings uniformly.)_

**s3:**

- **E2026111803f4fd3b:S003:FR001** — Run a reconciliation pass after each round's findings are finalized, classifying each of the prior round's HIGH/MED findings as confirmed, still-open, contradicted, or no-longer-surfaced. _(Reconciliation gives visibility into round-over-round disposition without becoming a second, less reliable gate.)_

**s4:**

- **E2026111803f4fd3b:S004:FR001** — Render each round's outcome to a persisted MD artifact via a new public docgen docType and present it to the user every round. _(A persisted, explicitly-invoked document is what makes each round's outcome auditable and reviewable after the fact.)_

**s5:**

- **E2026111803f4fd3b:S005:FR001** — Checkpoint a review at the granularity appropriate to its review type, written/read automatically and invisibly, and copy the final round's output into durable storage before the temp folder is deleted. _(Minimal, per-type-appropriate recovery and durable final results are what makes the process trustworthy across crashes.)_

## 3. Non-goals

- **Reinstating the retired checkpoint model's attempts/chunks/admission/migration-guard machinery** — That machinery is being deliberately replaced by a simpler round-level (or per-Task) checkpoint, not carried forward.
- **Changing the existing ReviewContext data model (round, Scope, ReviewTargets, Comments)** — The data model is already converged and approved under the companion Epic 50cde239426d6e2a; only two specific amendments (header-level reviewId, a corrections array) are fed back to it, not a broader change.
- **Changing the existing 3-round review cap policy itself** — The cap is an existing, separately-decided policy this Epic operates within, not something it revisits.
- **Mid-round resume of in-flight grounding/analysis state** — Round-level checkpointing means recovery is always a full round (or full Task, for code review) restart, never a partial resume of work in progress.
- **Diverging the steering/checklist logic for Correction-and-Re-review from Initial Review beyond what reconciliation already provides** — The two review kinds share one execution process distinguished purely by round number; reconciliation is the only round>1-specific behavior.
- **Letting reconciliation influence the round N gate's block-vs-pass decision** — The gate reads only the current round's own findings; full independent re-grounding already re-catches any defect genuinely still present, and reconciliation is a separate, less reliable judgment that is not a substitute safety net.
- **Mechanically enforcing independent grounding (e.g. stripping or withholding submitter narrative from the reviewer)** — Enforcement is policy/instruction-only via steering; a prior structural claim-extraction mechanism was observed to itself cause tunnel vision by anchoring the reviewer on the submitter's framing.
- **Exposing the docgen render or the checkpoint write as a separate agent-driven step beyond the docgen call itself** — The review-report docgen render is an explicit agent-invoked call, but checkpoint read/write stays internal to the review process, never a step the driving agent must remember to call.

## 4. Assumptions

- `high` The companion ReviewContext data-model Epic (50cde239426d6e2a, HLD approved) will incorporate this Epic's two amendments -- a header-level reviewId field and a per-round corrections array -- before this process is implemented against it. [[c1]]
- `high` The prior review framework (insrc_review_step/insrc_code_review_step) is fully retired/being rewritten, so this process is not required to preserve backward compatibility with its prior invocation shape or its attempts/chunks/admission/migration-guard checkpoint model. [[c1]]
- `high` No generalized round-based checkpoint/temp-folder/reconciliation runtime, and no 'review-report' docgen docType, exist anywhere in the codebase today; the only prior art is per-review-type checkpoint logic that is itself retired. [[c2]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Checkpoint granularity is defined per review type, not by one universal rule: design review checkpoints at the round level (no natural sub-unit); code review checkpoints per-Task within a round, using Scope's existing tasks: Pointer[] as the natural unit. | [[c1]] |
| `k2` | invariant | Independent grounding is enforced by policy/steering instruction only -- the reviewer is handed the full artifact including submitter narrative and instructed to re-derive independently and disregard it; no technical/structural mechanism strips or withholds that narrative. | [[c1]] |
| `k3` | invariant | The round N approval gate decides block vs. pass from that round's own HIGH/MED findings only; reconciliation (confirmed/still-open/contradicted/no-longer-surfaced) is informational/presentational and never feeds the gate. | [[c1]] |
| `k4` | invariant | Every round performs full independent re-grounding over the entire ReviewTargets scope, ignoring prior findings as input, producing a self-contained finding set. | [[c1]] |
| `k5` | invariant | Reconciliation runs as a separate, dedicated LLM call after a round's findings are finalized (no re-grounding), given the two adjacent rounds' finding sets plus the temp folder's audit trail if needed -- never folded into the same pass that produces the round's findings. | [[c1]] |
| `k6` | contract | The review-report docgen render is an explicit, agent-invoked docgen docType call (never auto-triggered internally); checkpoint write/read is automatic and internal to the review process (never an agent-driven step). | [[c1]] |
| `k7` | invariant | The .insrc/tmp/<reviewId>/ temp folder (per-round input/output, the checkpoint record, rendered MD) is deleted once the review reaches a terminal state, but only after the final round's review-output JSON is copied into the review's durable artifact storage alongside the other persisted artifacts. | [[c1]] |
| `k8` | invariant | The reviewId is one identity, not two: it is both the .insrc/tmp/<reviewId>/ folder's own name and a header-level field on ReviewContext, so a resume attempt can recover by reading the id off the artifact/context itself rather than depending solely on caller-side bookkeeping. | [[c1]] |

## 6. Stories

### 6.1 STORY-03f4fd3b9102aab8-s1 — Initial Review and Correction-and-Re-review share one round-driven execution process

**User value:** `size: L`

So that every review, whatever round it is on, runs through one predictable process that always re-derives its own findings from source rather than trusting what came before.

**Acceptance criteria:**

- **ac1:** Given a review starts at round 1 (Initial Review), when that round's cycle runs, then it performs full independent re-grounding over the entire ReviewTargets scope, ignoring any prior findings, producing a self-contained finding set. _(operationalizes `k4`)_
- **ac2:** Given a review is at round > 1 (Correction-and-Re-review) following corrections submitted by the submitter, when that round's cycle runs, then it executes through the exact same process as round 1, distinguished only by its round number, with no divergent steering or checklist logic beyond reconciliation. _(operationalizes `lc1`)_
- **ac3:** Given a round's grounding runs, when the reviewer is handed the full artifact including any submitter rationale, then it is instructed via steering to re-derive its findings independently and disregard that narrative, with no structural mechanism stripping or withholding it. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (invariant) Initial Review and Correction-and-Re-review share one execution process distinguished purely by round number, with no divergent steering/checklist logic beyond reconciliation. [[c1]]

### 6.2 STORY-03f4fd3b9102aab8-s2 — Findings are classified against a fixed taxonomy with a per-review-type-configurable severity scale

**User value:** `size: M`

So that findings stay comparable across rounds and review types, while each review type can still set its own severity vocabulary.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a finding is produced in any round, when it is recorded, then it is classified against exactly one of the fixed taxonomy categories (correctness, functional-completeness, security, quality, maintainability). _(operationalizes `lc1`)_
- **ac2:** Given a review type's Feedback implementation declares its own severity scale, when a finding is recorded for that review type, then it carries that configured severity scale, defaulting to HIGH/MED when the review type declares none. _(operationalizes `lc2`)_

**Local constraints:**

- `lc1` (convention) Every finding is classified against the fixed design-review-specific taxonomy: correctness, functional-completeness, security, quality, maintainability. [[c1]]
- `lc2` (contract) The severity scale a finding carries is configured by the controller per review type, defaulting to HIGH/MED, consistent with Feedback being an abstract base type with per-review-type implementations. [[c1]]

### 6.3 STORY-03f4fd3b9102aab8-s3 — A dedicated reconciliation pass tracks prior findings without ever gating approval

**User value:** `size: M`

So that the submitter and reviewer can see how a correction round's independent findings relate to what was raised before, without that judgment ever deciding approval itself.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given round N's (N > 1) findings are finalized, when the dedicated reconciliation pass runs, then it executes as a separate LLM call reading only the two adjacent rounds' finding sets, plus the temp folder's audit trail if needed, with no re-grounding. _(operationalizes `k5`)_
- **ac2:** Given reconciliation has classified a prior round's HIGH/MED finding as confirmed, still-open, contradicted, or no-longer-surfaced, when round N's approval gate evaluates block vs. pass, then the gate decision uses only round N's own HIGH/MED findings and is unaffected by the reconciliation classification. _(operationalizes `k3`)_

### 6.4 STORY-03f4fd3b9102aab8-s4 — Each round's findings are rendered and presented through a new review-report docgen document

**User value:** `size: M`

So that the submitter can see and act on each round's outcome through a persisted, reviewable document rather than an ephemeral chat summary.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a round's findings, and for round > 1 its reconciliation, have finished, when the agent explicitly invokes the review-report docgen docType with the review id and round, then it renders a persisted MD artifact for that round. _(operationalizes `k6`)_
- **ac2:** Given a correction round's MD is rendered and the submitter's corrections entries addressed or rejected specific prior Feedback this round, when the MD is composed, then it annotates only those specifically addressed or rejected prior Feedback items as resolved/still-open/contradicted, not a running audit of all prior history. _(operationalizes `lc3`)_
- **ac3:** Given a round's review-report MD has been rendered, when the round completes, then it is presented to the user via insrc_present every round, with no response required from the user until the existing 3-round cap is reached. _(operationalizes `k6`)_

**Local constraints:**

- `lc3` (invariant) A round's review-report MD shows only that round's own findings, with inline resolved/still-open/contradicted annotations limited to whichever prior Feedback the submitter's corrections entries actually addressed or rejected this round -- never a running audit of all history. [[c1]]

### 6.5 STORY-03f4fd3b9102aab8-s5 — Per-review-type checkpointing and temp-folder lifecycle make a review resumable and its final result durable

**User value:** `size: L`

So that a crash costs at most one unit of rework, and a completed review's result survives after its scratch working folder is gone.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a review is underway, when a round's full cycle (grounding, findings, reconciliation, MD render, present) completes, then the review process automatically writes a checkpoint at the granularity defined for its review type -- round-level for design review, per-Task for code review -- with no agent-driven step. _(operationalizes `k1`, `k6`)_
- **ac2:** Given a crash occurs before a round's full cycle completes, when the review is resumed, then only the in-flight unit of work (the round, or the in-flight Task for code review) is re-run, not units already completed. _(operationalizes `k1`)_
- **ac3:** Given a review reaches a terminal state, when its .insrc/tmp/<reviewId>/ temp folder is due to be deleted, then the final round's review-output JSON is first copied into the review's durable artifact storage before deletion occurs. _(operationalizes `k7`)_
- **ac4:** Given a review is resumed after an interruption, when the resuming call supplies the reviewId, then the system locates the review's prior state, because reviewId is the same identity as both ReviewContext's header-level field and the temp folder's name. _(operationalizes `k8`)_

**Local constraints:**

- `lc4` (invariant) A review's checkpoint is a generic 'review checkpoint' JSON side-record, independent of ReviewContext's own fields, stored inside the .insrc/tmp/<reviewId>/ folder. [[c1]]

## 7. References

- **[[c1]]** `prior-artifact` `SPEC-e8632c1ae22c3bf8` — "docs/standalone/review-process-rounds-reconciliation-recovery-E20261117e8632c1a/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: review-history checkpoint files + docgen docType registry` — "admission-checkpoint.ts / preparation-checkpoint.ts / checkpoint.ts (per-review-type, retired); src/mcp/docgen/handler.ts docType registry has no 'review-report'"

## Citations

- **[[c1]]** `prior-artifact` `SPEC-e8632c1ae22c3bf8` — "docs/standalone/review-process-rounds-reconciliation-recovery-E20261117e8632c1a/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: review-history checkpoint files + docgen docType registry` — "admission-checkpoint.ts / preparation-checkpoint.ts / checkpoint.ts (per-review-type, retired); src/mcp/docgen/handler.ts docType registry has no 'review-report'"
