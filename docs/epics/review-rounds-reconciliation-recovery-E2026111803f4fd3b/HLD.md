<!-- insrc:artifact HLD-03f4fd3b9102aab8 -->

# HLD: review-rounds-reconciliation-recovery

## Summary

**Tracker:** [insors-ai/insrc#196](https://github.com/insors-ai/insrc/issues/196)

This HLD gives every review type one shared round-driver: a single process that runs the grounding-and-findings cycle, the dedicated reconciliation pass, the per-round docgen render and presentation, and the checkpoint write, identically for Initial Review and Correction-and-Re-review. Review-type differences (checkpoint granularity, finding taxonomy/severity) are supplied to the driver through a small hook set rather than duplicated into separate per-type drivers.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. Problem context

> See **DEF-03f4fd3b9102aab8** § 1. Problem

## 2. Framework summary

Alternative a2 wins: one shared round-driver function in a new sibling module under src/workflow/ (outside review-history/, which is being retired from rather than extended) takes a small per-review-type hook set -- the grounding/findings call, checkpoint granularity, and finding taxonomy/severity -- and runs the identical round cycle, checkpoint lifecycle, and reconciliation call for every review type.

## 3. Architecture shape

A new kebab-case-named sibling module lands under src/workflow/ (not nested inside review-history/, which the grounded import-graph evidence shows is a heavily-imported reuse hub whose own per-type checkpoint logic is being retired rather than extended). This module owns: the round-driver function (s1) that runs grounding+findings, reconciliation for round>1, MD render+present, and checkpoint write, identically for every review type; the finding taxonomy/severity contract (s2); the reconciliation pass (s3); the review-report docgen render/presentation flow (s4); and the per-review-type checkpoint + .insrc/tmp/<reviewId>/ lifecycle (s5). Per the Epic's own Non-Goals, wiring this module's round-driver into insrc_review_step/insrc_code_review_step is deferred follow-on work -- this HLD defines the driver and its hook contracts, not that wiring.

## 4. Diagrams

- [Sequence diagram](docs/epics/review-rounds-reconciliation-recovery-E2026111803f4fd3b/sequence-diagram.html)

## 5. Shared contracts

### 5.1 sc1: Review-type hook set

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The small hook set (grounding/findings call, checkpoint granularity, taxonomy/severity) that is the only thing legitimately differing per review type, consumed by the round-driver, per the Epic's one-shared-process framing (Story s1 ac1/ac2).

**Interface sketch (type-level):**

```
type ReviewKind = 'design' | 'code';
interface RoundDriverHooks {
  readonly reviewKind: ReviewKind;
  readonly checkpointGranularity: 'round' | 'task';
}
```

**Assumptions cited:** [[c1]]

### 5.2 sc2: Finding taxonomy + severity scale

**Owner Story:** `s2`

**Purpose:** The fixed design-review-specific taxonomy and the per-review-type-configurable severity scale every finding carries, per lc1/lc2.

**Interface sketch (type-level):**

```
type FindingCategory = 'correctness' | 'functional-completeness' | 'security' | 'quality' | 'maintainability';
interface Finding {
  readonly category: FindingCategory;
  readonly severity: string;
}
```

**Assumptions cited:** [[c1]]

### 5.3 sc3: Reconciliation result shape

**Owner Story:** `s3`

**Purpose:** The classification a dedicated reconciliation call assigns to a prior round's HIGH/MED findings, per k3/k5.

**Interface sketch (type-level):**

```
type ReconciliationVerdict = 'confirmed' | 'still-open' | 'contradicted' | 'no-longer-surfaced';
interface ReconciliationResult {
  readonly priorFindingRef: string;
  readonly verdict: ReconciliationVerdict;
}
```

**Assumptions cited:** [[c1]]

### 5.4 sc4: Review-report docgen call shape

**Owner Story:** `s4`

**Purpose:** The explicit, agent-invoked call shape that renders a round's findings (+ relevant reconciliation annotations) to a persisted MD artifact, per k6.

**Interface sketch (type-level):**

```
interface ReviewReportDocgenCall {
  readonly reviewId: string;
  readonly round: number;
}
```

**Assumptions cited:** [[c1]]

### 5.5 sc5: Review checkpoint record

**Owner Story:** `s5`

**Purpose:** The generic 'review checkpoint' JSON side-record and the .insrc/tmp/<reviewId>/ folder lifecycle (per-review-type granularity, durable copy before deletion, reviewId as one identity), per k1/k7/k8/lc4.

**Interface sketch (type-level):**

```
interface ReviewCheckpoint {
  readonly reviewId: string;
  readonly lastCompletedUnit: { readonly kind: 'round' | 'task'; readonly ref: number | string };
}
```

**Assumptions cited:** [[c1]]

## 6. Story boundaries

### 6.1 Story STORY-03f4fd3b9102aab8-s1

**Owns:** `sc1`

The round-driver function itself -- what it does internally to run the grounding+findings, reconciliation, render+present and checkpoint-write cycle -- stays private to s1; no other Story's type depends on the driver's internals, only on the hook contract sc1 exposes.

### 6.2 Story STORY-03f4fd3b9102aab8-s2

**Owns:** `sc2`
**Depends on:** `sc1`

Which exact per-review-type severity scales exist beyond the HIGH/MED default, and how a review type's Feedback implementation declares its own, stay internal to s2; no other Story's type depends on Finding's shape.

### 6.3 Story STORY-03f4fd3b9102aab8-s3

**Owns:** `sc3`
**Depends on:** `sc1`

How the reconciliation LLM call is actually prompted, and how it reads the temp folder's audit trail when needed, stay internal to s3; no other Story's type depends on ReconciliationResult's internals beyond its verdict shape.

### 6.4 Story STORY-03f4fd3b9102aab8-s4

**Owns:** `sc4`
**Depends on:** `sc1`

The exact docgen docType registration and MD rendering logic (including the resolved/still-open/contradicted annotation rule scoped to this round's own corrections) stay internal to s4; no other Story's type depends on the renderer's internals.

### 6.5 Story STORY-03f4fd3b9102aab8-s5

**Owns:** `sc5`
**Depends on:** `sc1`

The exact per-review-type granularity mapping (round-level for design review, per-Task for code review) and the durable-copy-before-deletion mechanics stay internal to s5; no other Story's type depends on ReviewCheckpoint's internals beyond what sc1's round-driver needs to call it.

## 7. Non-functional targets

- **Performance:** Checkpoint write/read (sc5) is a single small JSON file write/read per completed unit of work (a round, or a Task), adding no I/O beyond what the round cycle already performs.
- **Durability:** The final round's review-output JSON is copied into durable artifact storage before the .insrc/tmp/<reviewId>/ folder is deleted at a terminal state (k7), so a completed review's result survives after the ephemeral working folder is gone.

## 8. Rollout

**Phase A — the shared round-driver**

**Stories:** `s1`

s1 owns sc1 (the round-driver + hooks), which s2-s5 all depend on. Nothing else can land before s1.

**Phase B — taxonomy, reconciliation, rendering, checkpointing**

**Stories:** `s2`, `s3`, `s4`, `s5`

s2, s3, s4 and s5 each depend only on s1 (landed in Phase A) and have no dependencies on each other, so they can be built and landed in any order or in parallel once Phase A is done.

**Ordering rationale:** The Epic's Story graph is a single root (s1) with four independent children (s2, s3, s4, s5); the only hard ordering constraint is that s1's round-driver and hook contract (sc1) exist before any of the others can be typed against it.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Hook interface lets review-type-specific logic leak into the shared driver | If the RoundDriverHooks contract (sc1) ends up carrying review-type-specific branching logic rather than staying a thin, declarative hook set (grounding/findings call, checkpoint granularity, taxonomy/severity), the shared driver silently re-accumulates the duplication the Epic exists to remove. | s1's LLD must show the driver's own code never branches on reviewKind directly -- every review-type difference must route through a hook, and code review for s2-s5's Stories checks that no new reviewKind-conditional logic was added to the driver itself. |
| No caller exists yet to exercise the round-driver end-to-end | Per the Epic's Non-Goals, wiring this module into insrc_review_step/insrc_code_review_step is deferred follow-on work, so s1-s5's LLDs can only be tested against synthetic hook implementations, not a real review type, until that later Epic lands. | Each Story's LLD must include a test harness that exercises the round-driver with a minimal synthetic ReviewKind hook set, so the driver's own behavior (shared process, checkpoint granularity routing, reconciliation call shape) is verified now rather than deferred to the wiring Epic. |
| Checkpoint and audit-trail shapes drift between what s3's reconciliation pass expects and what s5's checkpoint actually persists | k5 lets reconciliation read the temp folder's audit trail 'if needed', and s5 owns that temp-folder lifecycle independently of s3 -- if the two Stories' LLDs assume different shapes for what is actually stored there, reconciliation could silently fail to find what it expects. | s3 and s5's LLDs must agree on and cite the same concrete shape for what the temp folder's audit trail actually contains, with s5's LLD authored first (or reviewed against s5's final shape) since s5 owns the lifecycle. |
| A third Epic's Story (security review extension points) assumes 'security' plugs into the existing round cycle without a new RoundDriverHooks.reviewKind member | sc1's reviewKind is closed to 'design'\|'code'. STORY-779e9a08142cb057-s1's LLD never states whether the security reviewer pass runs nested inside the primary round's existing reviewKind (reusing s1's driver as-is) or needs a third enum member added to sc1 -- found during a cross-design review on 2026-11-18/19, not by this Epic's own Stories. | Resolve explicitly, either in s1's own LLD or back-flowed from STORY-779e9a08142cb057-s1's LLD once its matching open question is answered, before s1's round-driver is built; s1's LLD must show which reading it implements. |

## 9. Alternatives considered

### 9.1 a1: Monolithic per-review-type driver

Each review type (design review, code review) gets its own standalone driver function that inlines the round loop, checkpoint read/write, reconciliation call, and docgen render for that type.

Write a separate top-level driver per review type -- e.g. a design-review driver and a code-review driver -- each containing its own copy of the round loop (grounding -> findings -> reconciliation -> render -> present), its own checkpoint read/write at whatever granularity that type needs, and its own call into the reconciliation pass and the review-report docgen docType.

This mirrors the retired implementation's shape (review-history/review/design-review/ and review-history/code-review/task-review/ each already had their own separate admission-checkpoint.ts), just without the heavier attempts/chunks/admission/migration-guard machinery.

**Pros:**
- No new shared module to design; each driver can be written and tested in isolation
- A review-type-specific quirk never risks leaking into a shared abstraction, since there is no shared abstraction

**Cons:**
- Reintroduces exactly the duplication the Epic's own problem statement names: 'every review type must separately solve round sequencing, crash recovery, and how a correction round relates to the round before it'
- Directly contradicts Story s1's acceptance criteria (ac1/ac2), which require Initial Review and Correction-and-Re-review -- and, by the Epic's framing, every review type -- to run through the exact same process

**Cost estimate:** M

**Rejected because:** Each constraint is individually satisfiable inside a per-type driver, but nothing in the structure guarantees it: duplicating the round loop across design-review and code-review drivers is exactly the duplication the Epic's problem statement names, and directly risks Story s1's ac1/ac2 (one shared process) drifting apart over time with no single place enforcing it.

### 9.2 a2: Shared review-process driver with per-review-type hooks — **CHOSEN**

One generic round-driver function in a new review-process module takes a small per-review-type hook set (grounding/findings call, checkpoint granularity, taxonomy/severity) and runs the identical round cycle for every review type.

Introduce one new sibling module under src/workflow/ (landing outside review-history/, since review-history/'s own per-type checkpoint logic is being retired rather than extended, per the grounded import-graph evidence that review-history/ is a heavily-imported reuse hub not itself the new process's home). This module owns a single round-driver function that executes the full cycle -- grounding+findings, reconciliation (round > 1), MD render + present, checkpoint write -- identically for every review type, and accepts a small, review-type-supplied hook set for the three things that legitimately differ: the grounding/findings call itself, the checkpoint granularity (round-level vs per-Task), and the finding taxonomy/severity scale.

Each review type (design review, code review) supplies its own hooks but never its own copy of the round loop, checkpoint lifecycle, or reconciliation call -- those stay single-sourced in the new module, directly satisfying Story s1's requirement that every round, of every review type, runs through the same process.

**Pros:**
- Directly satisfies Story s1 (ac1/ac2): one driver, one execution process, with round number as the only thing distinguishing Initial Review from Correction-and-Re-review
- Checkpoint granularity (k1) varies per review type through a hook, not a duplicated driver, so the per-type difference is isolated to exactly the one place it's supposed to differ
- Lands as a new sibling module following the grounded naming convention (kebab-case files, no base-class idiom to extend), so it reads consistently with the rest of src/workflow/

**Cons:**
- Requires designing the hook interface carefully up front; a poorly-scoped hook could let review-type-specific logic leak back into the shared driver
- The new module has no caller yet at this Epic's scope (wiring it into insrc_review_step/insrc_code_review_step is deferred follow-on work), so it cannot be exercised end-to-end until that later work lands

**Cost estimate:** M

### 9.3 a3: Event-sourced round ledger

Model each round's lifecycle as an append-only event log (RoundStarted, FindingsRecorded, ReconciliationRecorded, MdRendered, Presented) inside the temp folder, with a reducer computing checkpoint/current state by replay.

Instead of a procedural round-driver, persist every round-cycle transition as an event appended to a log file inside .insrc/tmp/<reviewId>/. A reducer function replays the log to compute the review's current state (which round, what stage of the cycle it reached) on resume, making checkpointing a byproduct of the event log rather than a separately-written record.

Reconciliation and docgen rendering would read the event log's audit trail directly rather than a separately-shaped checkpoint record, which could make the 'full audit trail already retained in the temp folder' (k5) richer and more uniform.

**Pros:**
- Recovery (k1/k7/k8) falls out of log replay for free, rather than needing a separately-maintained checkpoint record
- The event log IS the audit trail k5 already requires reconciliation to be able to read, so there is no separate record to keep in sync

**Cons:**
- Introduces an event-sourcing pattern with no precedent anywhere else in this codebase's workflow layer (which uses artifact-core's lifecycle/revision model, not event logs), adding a genuinely new idiom for a single Epic's use case
- More moving parts than the problem needs: a reducer, an event schema, and replay logic, for a crash-recovery need that a single checkpoint record (k1's 'generic review checkpoint JSON side-record') already satisfies at lower cost

**Cost estimate:** L

**Rejected because:** Satisfies every constraint and arguably strengthens k5 (the event log IS the audit trail), but at higher cost (L vs M) and by introducing an event-sourcing idiom with no precedent elsewhere in this codebase's workflow layer, for a crash-recovery need a2's single checkpoint record already meets.

## 10. References

- **[[c1]]** `prior-artifact` `SPEC-e8632c1ae22c3bf8` — "docs/standalone/review-process-rounds-reconciliation-recovery-E20261117e8632c1a/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: review-history checkpoint files + docgen docType registry` — "admission-checkpoint.ts / preparation-checkpoint.ts / checkpoint.ts (per-review-type, retired); src/mcp/docgen/handler.ts docType registry has no 'review-report'"
- **[[c3]]** `analyze-bundle` `structural-map: src/workflow/review-history import-graph + src/workflow/ convention.detect` — "review-history/ totalInDegree 67 vs totalOutDegree 13 (reuse hub); src/workflow/ file naming mixed, kebab-case (448) dominant over snake_case (233); baseClassIdioms: []"

## 11. Open questions

- A new standalone Story (STORY-779e9a08142cb057-s1, 'security review extension points', seeded from approved SPEC-5a5f556b77d7aa31) extends SecurityFinding from this HLD's sc2 Finding and frames security as 'ONE new review type' running a 'security reviewer pass' within a round. sc1's RoundDriverHooks.reviewKind is closed to 'design'|'code' with no third value. Must resolve: does the security pass run nested inside the primary round's existing reviewKind (no enum change), or does reviewKind need a third 'security' member? This changes the round-driver's (s1's) implementation structure.

## Citations

- **[[c1]]** `prior-artifact` `SPEC-e8632c1ae22c3bf8` — "docs/standalone/review-process-rounds-reconciliation-recovery-E20261117e8632c1a/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: review-history checkpoint files + docgen docType registry` — "admission-checkpoint.ts / preparation-checkpoint.ts / checkpoint.ts (per-review-type, retired); src/mcp/docgen/handler.ts docType registry has no 'review-report'"
- **[[c3]]** `analyze-bundle` `structural-map: src/workflow/review-history import-graph + src/workflow/ convention.detect` — "review-history/ totalInDegree 67 vs totalOutDegree 13 (reuse hub); src/workflow/ file naming mixed, kebab-case (448) dominant over snake_case (233); baseClassIdioms: []"
