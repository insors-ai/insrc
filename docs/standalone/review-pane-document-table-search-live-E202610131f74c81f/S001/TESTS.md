<!-- insrc:artifact TESTS-1f74c81f507dbe78-S001 -->

# Tests: 1f74c81f507dbe78 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-13T16:14:59.110Z on commit `f5765ed7`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command | `vscode-plugin/src/chat/__tests__/review-icon.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/review-icon.test.ts` | 0 | 1 | 0.3 s |  |

## t2

Run at 2026-10-13T16:16:02.329Z on commit `727006f3`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: docs review client: pending forwards openQuestions and workItemId when the daemon gives them and leaves them absent otherwise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review client: pending forwards openQuestions and workItemId when the daemon gives them and leaves them absent otherwise | `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` |

**integration: docs review host: docs-list carries openQuestions and workItemId**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: docs-list carries openQuestions and workItemId | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` | 0 | 15 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` | 0 | 10 | 0.7 s |  |
