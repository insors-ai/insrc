<!-- insrc:artifact TESTS-1102dc7125ad0c07-S001 -->

# Tests: 1102dc7125ad0c07 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T06:57:58.056Z on commit `e52f50e2`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/subject.test.ts: the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built | `src/workflow/code-review/__tests__/subject.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/subject.test.ts` | 0 | 20 | 1.4 s |  |

## t2

Run at 2026-10-17T07:02:30.802Z on commit `2142a074`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/dimensions/__tests__/coverage.test.ts: the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable' | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | buildCoveragePrompt: a null test record degrades the pass-state to unverified in the prompt | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` | 0 | 19 | 0.9 s |  |
