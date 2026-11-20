<!-- insrc:artifact TESTS-03f4fd3b9102aab8-s3 -->

# Tests: 03f4fd3b9102aab8 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T05:59:31.967Z on commit `68dfdbc3d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: reconcileRound produces exactly one ReconciliationResult per entry in priorFindings, keyed by that finding's own id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileRound produces exactly one ReconciliationResult per entry in priorFindings, keyed by that finding's own id | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/reconciliation.test.ts` | 0 | 18 | 7.4 s |  |

## t2

Run at 2026-11-20T06:01:04.310Z on commit `68dfdbc3d`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: reconcileRound's parameters are reviewId and the two finding sets only -- no ReviewTargets-shaped parameter exists anywhere in its signature, so no re-grounding input is even possible**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileRound's parameters are reviewId and the two finding sets only -- no ReviewTargets-shaped parameter exists anywhere in its signature, so no re-grounding input is even possible | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**unit: ReconciliationResult's exported shape contains exactly priorFindingRef and verdict, with no severity, blocking, or gate-facing field of any kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ReconciliationResult's exported shape contains exactly priorFindingRef and verdict, with no severity, blocking, or gate-facing field of any kind | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**unit: ReconciliationVerdict accepts exactly the four fixed verdicts (confirmed, still-open, contradicted, no-longer-surfaced) and rejects any other value at compile time**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ReconciliationVerdict accepts exactly the four fixed verdicts (confirmed, still-open, contradicted, no-longer-surfaced) and rejects any other value at compile time | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**unit: a rejecting reconcileRound call propagates its rejection rather than returning partial or fabricated results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a rejecting reconcileRound call propagates its rejection rather than returning partial or fabricated results | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**unit: priorFindings as an empty array returns an empty array, not an error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | priorFindings as an empty array returns an empty array, not an error | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**unit: two priorFindings entries with identical category and severity but different id values still produce two separate ReconciliationResult entries, keyed by their distinct ids**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two priorFindings entries with identical category and severity but different id values still produce two separate ReconciliationResult entries, keyed by their distinct ids | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**unit: when the two finding sets alone do not resolve a classification, reconcileRound reads the audit trail itself from .insrc/tmp/<reviewId>/, rather than requiring the caller to have pre-extracted and passed it in**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when the two finding sets alone do not resolve a classification, reconcileRound reads the audit trail itself from .insrc/tmp/<reviewId>/, rather than requiring the caller to have pre-extracted and passed it in | `src/workflow/review-round/__tests__/reconciliation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/reconciliation.test.ts` | 0 | 18 | 7.7 s |  |
