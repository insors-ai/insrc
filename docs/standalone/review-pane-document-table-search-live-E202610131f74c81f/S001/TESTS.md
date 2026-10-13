<!-- insrc:artifact TESTS-1f74c81f507dbe78-S001 -->

# Tests: 1f74c81f507dbe78 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-10-13T16:20:17.087Z on commit `a6475dad`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder | `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` |

**integration: docs review host: opening a document watches its markdown file and its artifact JSON, and the watch is disposed wherever the open document's record is replaced or cleared: another document, a failed open of another, the panel closing and dispose**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: opening a document watches its markdown file and its artifact JSON, and the watch is disposed wherever the open document's record is replaced or cleared: another document, a failed open of another, the panel closing and dispose | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: a burst of changes causes one re-read of the list and of the open document by its path after the quiet period, marked changed; a change during a decision is acted on when the decision settles, whether it was recorded, refused or failed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a burst of changes causes one re-read of the list and of the open document by its path after the quiet period, marked changed; a change during a decision is acted on when the decision settles, whether it was recorded, refused or failed | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: a watcher or disposer that throws is logged and the document is still shown; with no watcher dep nothing is watched**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a watcher or disposer that throws is logged and the document is still shown; with no watcher dep nothing is watched | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: docs-content carries reveal for a list-row open and for openArtifact, on the content and on the unavailable content of a failed read alike, and not for a re-read after a decision, on the boot ping or from the watch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: docs-content carries reveal for a list-row open and for openArtifact, on the content and on the unavailable content of a failed read alike, and not for a re-read after a decision, on the boot ping or from the watch | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` | 0 | 14 | 0.8 s |  |
| `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` | 0 | 3 | 0.4 s |  |
