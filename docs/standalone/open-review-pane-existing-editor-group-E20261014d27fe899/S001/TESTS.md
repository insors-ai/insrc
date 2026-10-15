<!-- insrc:artifact TESTS-d27fe8996fc3a2db-S001 -->

# Tests: d27fe8996fc3a2db S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-15T04:54:23.764Z on commit `999d729a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chooseReviewColumn: groups other than the chat's are chosen (the active one first, else the lowest view column), a group with any chat tab is left out whole, and undefined is returned when only the chat's group is open or there are no groups**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chooseReviewColumn picks a group without the chat tab, the active one first, else the lowest column, and none when only the chat's group is open | `vscode-plugin/src/chat/__tests__/review-column.test.ts` |

**unit: chooseReviewColumn: a tab whose input is not an object or has no viewType does not mark its group as the chat's**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chooseReviewColumn: a tab whose input is not an object or has no viewType does not mark its group as the chat's | `vscode-plugin/src/chat/__tests__/review-column.test.ts` |

**unit: extension.ts's review host createPanel reads vscode.window.tabGroups.all through a try, passes the chosen column (or, when there is none or reading fails, today's placement: ViewColumn.Beside with preserveFocus when quiet, ViewColumn.Active otherwise), and keeps preserveFocus for a quiet open (source scan)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in an open editor group that holds no chat tab and otherwise in the active column without quiet, or beside the chat without focus with it; there is no presenter when the review pane is not created | `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` |

**unit: review-wiring.test.ts: TWO existing source scans pin the current createPanel calls and are rewritten: 'review wiring: extension.ts sets the review panel's iconPath...' (about :128, asserts the ViewColumn.Active call) and 'extension wiring: the chat host's presenter opens a document...' (about :175, asserts the quiet Beside/preserveFocus ternary, and its title states the old placement). The new createPanel body keeps the `createPanel: ({ viewType, title, quiet }) => {` block shape their extractor regex expects; the createPanel wiring scan lives in review-wiring.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder | `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` |
| pass | extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in an open editor group that holds no chat tab and otherwise in the active column without quiet, or beside the chat without focus with it; there is no presenter when the review pane is not created | `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/review-column.test.ts` | 0 | 2 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` | 0 | 4 | 0.4 s |  |
