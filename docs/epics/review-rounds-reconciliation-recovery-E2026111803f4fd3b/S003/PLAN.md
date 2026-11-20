<!-- insrc:artifact PLAN-03f4fd3b9102aab8-s3 -->

# Plan: STORY-03f4fd3b9102aab8-s3

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**LLD run:** `wf-1795096193568-o7xxbs`
**LLD effective hash:** `6d57abfa68ac...`

Building s3 means adding the reconciliation pass to src/workflow/review-round/: a fixed four-verdict taxonomy, the ReconciliationResult shape, and reconcileRound itself -- a dedicated classification call that compares a prior round's HIGH/MED findings against the current round's findings, reading the review's temp-folder audit trail internally only if the two finding sets alone don't resolve a verdict. The internal classification and audit-trail read are made testable through a module-level test-injection seam, matching the codebase's existing convention, so the full test suite runs without a live LLM call or real filesystem fixture.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ReconciliationVerdict, ReconciliationResult and reconcileRound | M | — | — | unit: reconcileRound produces exactly one ReconciliationResult per entry in priorFindings, keyed by that finding's own id | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Add the full named test suite for reconcileRound/ReconciliationResult | M | — | `t1` | unit: reconcileRound's parameters are reviewId and the two finding sets only -- no ReviewTargets-shaped parameter exists anywhere in its signature, so no re-grounding input is even possible; unit: ReconciliationResult's exported shape contains exactly priorFindingRef and verdict, with no severity, blocking, or gate-facing field of any kind; unit: ReconciliationVerdict accepts exactly the four fixed verdicts (confirmed, still-open, contradicted, no-longer-surfaced) and rejects any other value at compile time; unit: a rejecting reconcileRound call propagates its rejection rather than returning partial or fabricated results; unit: priorFindings as an empty array returns an empty array, not an error; unit: two priorFindings entries with identical category and severity but different id values still produce two separate ReconciliationResult entries, keyed by their distinct ids; unit: when the two finding sets alone do not resolve a classification, reconcileRound reads the audit trail itself from .insrc/tmp/<reviewId>/, rather than requiring the caller to have pre-extracted and passed it in | [[c5]] [[c6]] |

### 1.1 TASK-03f4fd3b9102aab8-s3-t1 — Add ReconciliationVerdict, ReconciliationResult and reconcileRound

Add src/workflow/review-round/reconciliation.ts exporting ReconciliationVerdict (fixed 4-member union), ReconciliationResult {priorFindingRef, verdict} (sc3's interfaceSketch), and reconcileRound(reviewId, priorFindings, currentFindings) which makes one dedicated classification call per prior finding set, reading .insrc/tmp/<reviewId>/ internally only when needed. Includes a module-level _setReconciliationDepsForTests seam (matching src/workflow/team/signoff.ts's convention) injecting the classification call and the audit-trail read, defaulting to the real CliProvider-backed implementation, plus a compile-time typecheck fixture.

**Acceptance checks:**
- ReconciliationVerdict, ReconciliationResult and reconcileRound are exported exactly as dataModelChanges/contractDetails specify, with no extra or missing field or parameter
- reconcileRound never performs its own re-grounding pass and never folds reconciliation into the same pass that produced currentFindings
- the typecheck fixture rejects an invalid verdict literal and an added/removed ReconciliationResult key via @ts-expect-error / Equal<keyof ReconciliationResult,...>
- a rejecting classification call propagates its rejection unchanged rather than returning partial or fabricated results

### 1.2 TASK-03f4fd3b9102aab8-s3-t2 — Add the full named test suite for reconcileRound/ReconciliationResult

One it() per testStrategy.testLevels subject (8 total) in __tests__/reconciliation.test.ts, matching ac1/ac2's acceptanceMapping.provingTests verbatim, using _setReconciliationDepsForTests to inject a spyable classification stub and a temp-directory fixture standing in for .insrc/tmp/<reviewId>/.

**Acceptance checks:**
- All 8 named test subjects from testStrategy.testLevels[0].subjects exist as individual it() cases with matching titles
- ac1 and ac2's acceptanceMapping.provingTests all pass
- npx tsx --test for the new test file passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| reconcileRound produces exactly one ReconciliationResult per entry in priorFindings, keyed by that finding's own id | `t1` |
| reconcileRound's parameters are reviewId and the two finding sets only -- no ReviewTargets-shaped parameter exists anywhere in its signature, so no re-grounding input is even possible | `t2` |
| ReconciliationResult's exported shape contains exactly priorFindingRef and verdict, with no severity, blocking, or gate-facing field of any kind | `t2` |
| ReconciliationVerdict accepts exactly the four fixed verdicts (confirmed, still-open, contradicted, no-longer-surfaced) and rejects any other value at compile time | `t2` |
| a rejecting reconcileRound call propagates its rejection rather than returning partial or fabricated results | `t2` |
| priorFindings as an empty array returns an empty array, not an error | `t2` |
| two priorFindings entries with identical category and severity but different id values still produce two separate ReconciliationResult entries, keyed by their distinct ids | `t2` |
| when the two finding sets alone do not resolve a classification, reconcileRound reads the audit trail itself from .insrc/tmp/<reviewId>/, rather than requiring the caller to have pre-extracted and passed it in | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 dataModelChanges: ReconciliationVerdict`
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges: ReconciliationResult`
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails.api: reconcileRound`
- **[[c4]]** `prior-artifact` `LLD s3 errorPaths.errorCases: rejecting classification call`
- **[[c5]]** `prior-artifact` `LLD s3 testStrategy acceptanceMapping ac1`
- **[[c6]]** `prior-artifact` `LLD s3 testStrategy acceptanceMapping ac2`
