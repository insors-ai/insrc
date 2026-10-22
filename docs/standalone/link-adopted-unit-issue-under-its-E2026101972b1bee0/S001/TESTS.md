<!-- insrc:artifact TESTS-72b1bee074ba2dab-s1 -->

# Tests: 72b1bee074ba2dab S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-19T04:20:07.833Z on commit `e77aca2e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: unit: ghGetIssueId and the adapter's resolveIssueId run gh api for the issue number, return the numeric id, and fail on a non-integer or a gh error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ghGetIssueId and the adapter's resolveIssueId run gh api for the issue number, return the numeric id, and fail on a non-integer or a gh error | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: unit: the signature fixture compiles with resolveIssueId and its broken twin does not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the signature fixture compiles with resolveIssueId and its broken twin does not | `src/workflow/tracker/__tests__/port.test.ts` |

**integration: integration: a Story or Task issue adopted by its label after a timed-out create is resolved and linked under its parent, a failed resolve records pendingLink with child and a failed link records childId, the next ensure completes either, an Epic adoption makes no call, and an old pendingLink with childId still links without a resolve**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story or Task issue adopted by its label after a timed-out create is resolved and linked under its parent, a failed resolve records pendingLink with child and a failed link records childId, the next ensure completes either, an Epic adoption makes no call, and an old pendingLink with childId still links without a resolve | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 20 | 1.1 s |  |
| `src/workflow/tracker/__tests__/port.test.ts` | 0 | 11 | 6.3 s |  |
| `src/workflow/tracker/__tests__/unit-issue.test.ts` | 0 | 12 | 1.1 s |  |
