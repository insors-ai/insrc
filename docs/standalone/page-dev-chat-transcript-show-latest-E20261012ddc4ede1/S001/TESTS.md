<!-- insrc:artifact TESTS-ddc4ede1dbf84626-S001 -->

# Tests: ddc4ede1dbf84626 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T07:35:29.855Z on commit `f14226ea`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: latestWindow: a transcript no longer than one page is returned whole with firstIndex 0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | latestWindow: a transcript no longer than one page is returned whole with firstIndex 0 | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0 | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` | 0 | 5 | 0.3 s |  |
