<!-- insrc:artifact TESTS-1f74c81f507dbe78-S001 -->

# Tests: 1f74c81f507dbe78 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

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

## t4

Run at 2026-10-13T16:32:19.913Z on commit `74ad686f`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: docs review shell: the list view shows 25 rows a page ordered by type then title, and the pager moves between pages and is disabled at the ends**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the list view shows 25 rows a page ordered by type then title, and the pager moves between pages and is disabled at the ends | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the search matches every word in the title, id or work item id without regard to case, the type select filters with counts, and either change goes to page 1**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the search matches every word in the title, id or work item id without regard to case, the type select filters with counts, and either change goes to page 1 | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the datalist offers at most 50 titles and ids of the chosen type**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the datalist offers at most 50 titles and ids of the chosen type | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: pressing a row's title posts open-doc, a content with reveal switches to the document view (an unavailable one too), a content without it never changes the view, and the back button returns to the list with the document and its drafts kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: pressing a row's title posts open-doc, a content with reveal switches to the document view (an unavailable one too), a content without it never changes the view, and the back button returns to the list with the document and its drafts kept | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the search, type, page and the view on show are restored from the saved state when the shell is rebuilt, a re-post to the rebuilt shell does not leave the list view, a draft saved after the list state keeps it and the reverse, and a saved state of another shape gives the defaults**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the search, type, page and the view on show are restored from the saved state when the shell is rebuilt, a re-post to the rebuilt shell does not leave the list view, a draft saved after the list state keeps it and the reverse, and a saved state of another shape gives the defaults | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the list view's table is its own scrolling region, the toolbar and pager are outside it, titles and ids are set as text, and the recorded baseline is that of the new shell**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the list view's table is its own scrolling region, the toolbar and pager are outside it, titles and ids are set as text, and the recorded baseline is that of the new shell | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the host's notice of a failed read is shown in the list view's notice line, does not change the view, and is cleared by the next list that carries documents**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the host's notice of a failed read is shown in the list view's notice line, does not change the view, and is cleared by the next list that carries documents | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 225 | 18.2 s |  |

## t5

Run at 2026-10-13T16:38:06.477Z on commit `2800f2a0`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: docs review shell: a reload marked changed keeps the scroll position and the drafts and says the document changed; a reload after the shell's own decision keeps the decision's result line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: a reload marked changed keeps the scroll position and the drafts and says the document changed; a reload after the shell's own decision keeps the decision's result line | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 226 | 19 s |  |

## t6

Run at 2026-10-13T19:26:08.094Z on commit `bd3a9e47`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: The plugin's whole test suite and typecheck pass apart from failures that exist before this Story**

Reported by the builder, not run by the gate: **pass**. Evidence: Plugin suite after t5 and the later hand-check fix: 1260 tests, 1250 pass, 2 fail (the two manifest-catalog failures that exist before this Story); npx tsc --noEmit -p vscode-plugin clean

**smoke: By hand in VS Code: the tab shows the review icon in a light and a dark theme; the table pages, searches with suggestions and filters by type over the real pending list; and a document edited on disk while open is reloaded in place with the scroll position kept**

Reported by the builder, not run by the gate: **pass**. Evidence: Checked by the user in VS Code with the installed plugin 0.5.14. 2026-10-14: asked item by item whether the icon shows in a light and a dark theme, the table pages, searches with suggestions and filters by type, and a document edited on disk reloads in place with the scroll position kept, the user answered 'yes for the 3 earlier stories'

**smoke: Headless Chrome render of the real shell's list view with 240 rows: the toolbar and pager stay in view and the table scrolls**

Reported by the builder, not run by the gate: **pass**. Evidence: google-chrome --headless=new on /tmp/t9/shell-dark-listsearch.html over the live pending list (240 documents): tableScrolls true, toolbar top 0, pager bottom 613 of a 613 viewport, page does not scroll; search 'shared size' gives 1 of 240; ISSUE gives 32 on 2 pages (25 and 7); a row posts open-doc
