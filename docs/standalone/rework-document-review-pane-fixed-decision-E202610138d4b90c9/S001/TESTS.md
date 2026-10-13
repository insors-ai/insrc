<!-- insrc:artifact TESTS-8d4b90c9ab301e66-S001 -->

# Tests: 8d4b90c9ab301e66 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-13T12:12:45.679Z on commit `cd6cede6`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-10-13T12:19:23.527Z on commit `bb5afca9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none | `src/workflow/__tests__/feedback-carry-finalize.test.ts` |

**integration: finalize: the prior artifact JSON is byte-identical after the finalizer has run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: the prior artifact JSON is byte-identical after the finalizer has run | `src/workflow/__tests__/feedback-carry-finalize.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/feedback-carry-finalize.test.ts` | 0 | 2 | 0.5 s |  |

## t3

Run at 2026-10-13T12:22:06.311Z on commit `b4760e14`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — user is git user.name, else the OS login, else unknown | `src/workflow/artifacts/companion/__tests__/header.test.ts` |

**unit: review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion | `src/workflow/__tests__/artifact-content.test.ts` |
| pass | t1: the six pre-existing ArtifactReviewView members keep their names, types and meanings | `src/workflow/__tests__/artifact-content.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-content.test.ts` | 0 | 22 | 0.5 s |  |
| `src/workflow/artifacts/companion/__tests__/header.test.ts` | 0 | 14 | 0.5 s |  |
