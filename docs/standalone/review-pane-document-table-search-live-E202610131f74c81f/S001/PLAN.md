<!-- insrc:artifact PLAN-1f74c81f507dbe78-s1 -->

# Plan: E202610131f74c81f:S001

## Summary

**Epic:** `review-pane-document-table-search-live`
**LLD run:** `wf-1791907160407-xl170j`
**LLD effective hash:** `6ba5f215187f...`

Six tasks, all in the VS Code plugin. First the icon and the two extra fields of the pending summary, which stand alone. Then the host: it watches the open document, reloads it after a change and marks what it posts, and the icon and the watcher are wired in. Then the shell: the table with search, type filter and paging replaces the dropdown, and a reload keeps the reviewer's place. Last, the build is installed and checked by hand.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Give the review pane its icon | S | — | unit: review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command | [[c5]] |
| 2 | **`t2`** Carry open questions and the work item id in the pending summary | S | — | unit: docs review client: pending forwards openQuestions and workItemId when the daemon gives them and leaves them absent otherwise; integration: docs review host: docs-list carries openQuestions and workItemId | [[c2]] [[c3]] [[c8]] |
| 3 | **`t3`** Watch the open document, mark what the host posts, and wire the icon and the watcher | M | `t1` | unit: review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder; integration: docs review host: opening a document watches its markdown file and its artifact JSON, and the watch is disposed wherever the open document's record is replaced or cleared: another document, a failed open of another, the panel closing and dispose; integration: docs review host: a burst of changes causes one re-read of the list and of the open document by its path after the quiet period, marked changed; a change during a decision is acted on when the decision settles, whether it was recorded, refused or failed; integration: docs review host: a watcher or disposer that throws is logged and the document is still shown; with no watcher dep nothing is watched; integration: docs review host: docs-content carries reveal for a list-row open and for openArtifact, on the content and on the unavailable content of a failed read alike, and not for a re-read after a decision, on the boot ping or from the watch | [[c1]] [[c4]] [[c5]] [[c12]] [[c13]] |
| 4 | **`t4`** Replace the dropdown with the list view | M | `t2`, `t3` | integration: docs review shell: the list view shows 25 rows a page ordered by type then title, and the pager moves between pages and is disabled at the ends; integration: docs review shell: the search matches every word in the title, id or work item id without regard to case, the type select filters with counts, and either change goes to page 1; integration: docs review shell: the datalist offers at most 50 titles and ids of the chosen type; integration: docs review shell: pressing a row's title posts open-doc, a content with reveal switches to the document view (an unavailable one too), a content without it never changes the view, and the back button returns to the list with the document and its drafts kept; integration: docs review shell: the search, type, page and the view on show are restored from the saved state when the shell is rebuilt, a re-post to the rebuilt shell does not leave the list view, a draft saved after the list state keeps it and the reverse, and a saved state of another shape gives the defaults; integration: docs review shell: the list view's table is its own scrolling region, the toolbar and pager are outside it, titles and ids are set as text, and the recorded baseline is that of the new shell; integration: docs review shell: the host's notice of a failed read is shown in the list view's notice line, does not change the view, and is cleared by the next list that carries documents | [[c1]] [[c6]] [[c7]] [[c9]] [[c12]] [[c13]] |
| 5 | **`t5`** Reload the shown document in place | S | `t4` | integration: docs review shell: a reload marked changed keeps the scroll position and the drafts and says the document changed; a reload after the shell's own decision keeps the decision's result line | [[c1]] [[c7]] [[c10]] [[c12]] |
| 6 | **`t6`** Build, install and check by hand | S | `t5` | smoke: The plugin's whole test suite and typecheck pass apart from failures that exist before this Story; smoke: By hand in VS Code: the tab shows the review icon in a light and a dark theme; the table pages, searches with suggestions and filters by type over the real pending list; and a document edited on disk while open is reloaded in place with the scroll position kept; smoke: Headless Chrome render of the real shell's list view with 240 rows: the toolbar and pager stay in view and the table scrolls | [[c9]] [[c10]] |

### 1.1 E202610131f74c81f:S001:T001 — Give the review pane its icon

Add the light and dark review icon to media/ and declare the pair on the insrc.chat.docsReview command.

**Acceptance checks:**
- The two SVG files exist, draw the insrc spiral behind a document glyph with no background, and are not excluded from the package
- The command declares the pair

### 1.2 E202610131f74c81f:S001:T002 — Carry open questions and the work item id in the pending summary

Add openQuestions and workItemId to DocsArtifactSummary and map them in the client from the daemon's pending artifact; the host forwards the summaries unchanged.

**Acceptance checks:**
- pending() gives openQuestions and workItemId when the daemon sends them and leaves the keys absent otherwise
- docs-list carries them

### 1.3 E202610131f74c81f:S001:T003 — Watch the open document, mark what the host posts, and wire the icon and the watcher

Add the watchDocument and setTimer deps. The watch follows the open document's record (kept when the same document is read again, replaced or dropped when the record changes or is cleared); a change starts a 300 ms quiet period and then one re-read of the list and the document, marked changed; a change during a decision is remembered until the decision settles. Mark asked-for opens with reveal, on the content and on the unavailable content alike. Wire a file watcher in extension.ts. Set the review panel's iconPath to the icon pair there too.

**Acceptance checks:**
- Opening a document watches its markdown file and its artifact JSON; the watch is disposed wherever the record is replaced or cleared, and kept when the same document is re-read
- A burst of changes causes one re-read, marked changed; a change during a decision is acted on when it settles, whatever its outcome
- A throwing watcher or disposer is logged and the document is still shown; with no watcher nothing is watched
- reveal is set for a list-row open and openArtifact, on success and on failure, and never on a re-read
- extension.ts sets the review panel's iconPath to the icon pair and gives the host a watchDocument bound to file watchers under the workspace folder

### 1.4 E202610131f74c81f:S001:T004 — Replace the dropdown with the list view

Add the list view to the shell: a toolbar (search with a datalist, type select with counts, a count line), a notice line, a table of 25 rows a page ordered by type then title, and a pager. Replace the header's select with a back button and the document's title. The view changes to the document only on reveal. The search, type, page and view are kept in the saved state, and both writers of that state keep each other's key. Update the shell's recorded baseline and the layout tests.

**Acceptance checks:**
- The table pages 25 rows ordered by type then title, and the pager is disabled at the ends
- The search matches every word without regard to case, the type select filters with counts, and either goes to page 1; the datalist offers at most 50
- A row posts open-doc; reveal changes to the document view, a content without it never does; back returns to the list with the document and drafts kept
- The host's notice of a failed read is shown in the list view's notice line
- The saved search, type, page and view are restored on rebuild, and a draft saved after the list state keeps it and the reverse
- The table is its own scrolling region with the toolbar and pager outside it, in theme variables, with titles and ids set as text

### 1.5 E202610131f74c81f:S001:T005 — Reload the shown document in place

On a content for the document already shown, keep the scroll position of the document region, and when it is marked changed and its version differs, say that the document changed on disk. A reload after the shell's own decision keeps the decision's result line.

**Acceptance checks:**
- The scroll position and the drafts are kept across a reload
- The changed line is shown only for a reload marked changed with a different version
- The decision's result line survives the decision's own re-read

### 1.6 E202610131f74c81f:S001:T006 — Build, install and check by hand

Run the plugin's suite and typecheck, render the real list view with 240 rows in headless Chrome, build, package and install the plugin, and have the user check it in VS Code.

**Acceptance checks:**
- The plugin's suite passes apart from failures that exist before this Story
- In headless Chrome the toolbar and pager stay in view while the table scrolls
- In VS Code the icon shows in light and dark themes, the table pages, searches with suggestions and filters, and a document edited on disk is reloaded in place

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| docs review client: pending forwards openQuestions and workItemId when the daemon gives them and leaves them absent otherwise | `t2` |
| review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command | `t1` |
| review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder | `t3` |
| docs review host: opening a document watches its markdown file and its artifact JSON, and the watch is disposed wherever the open document's record is replaced or cleared: another document, a failed open of another, the panel closing and dispose | `t3` |
| docs review host: a burst of changes causes one re-read of the list and of the open document by its path after the quiet period, marked changed; a change during a decision is acted on when the decision settles, whether it was recorded, refused or failed | `t3` |
| docs review host: a watcher or disposer that throws is logged and the document is still shown; with no watcher dep nothing is watched | `t3` |
| docs review host: docs-list carries openQuestions and workItemId | `t2` |
| docs review host: docs-content carries reveal for a list-row open and for openArtifact, on the content and on the unavailable content of a failed read alike, and not for a re-read after a decision, on the boot ping or from the watch | `t3` |
| docs review shell: the list view shows 25 rows a page ordered by type then title, and the pager moves between pages and is disabled at the ends | `t4` |
| docs review shell: the search matches every word in the title, id or work item id without regard to case, the type select filters with counts, and either change goes to page 1 | `t4` |
| docs review shell: the datalist offers at most 50 titles and ids of the chosen type | `t4` |
| docs review shell: pressing a row's title posts open-doc, a content with reveal switches to the document view (an unavailable one too), a content without it never changes the view, and the back button returns to the list with the document and its drafts kept | `t4` |
| docs review shell: the search, type, page and the view on show are restored from the saved state when the shell is rebuilt, a re-post to the rebuilt shell does not leave the list view, a draft saved after the list state keeps it and the reverse, and a saved state of another shape gives the defaults | `t4` |
| docs review shell: a reload marked changed keeps the scroll position and the drafts and says the document changed; a reload after the shell's own decision keeps the decision's result line | `t5` |
| docs review shell: the list view's table is its own scrolling region, the toolbar and pager are outside it, titles and ids are set as text, and the recorded baseline is that of the new shell | `t4` |
| docs review shell: the host's notice of a failed read is shown in the list view's notice line, does not change the view, and is cleared by the next list that carries documents | `t4` |
| By hand in VS Code: the tab shows the review icon in a light and a dark theme; the table pages, searches with suggestions and filters by type over the real pending list; and a document edited on disk while open is reloaded in place with the scroll position kept | `t6` |
| Headless Chrome render of the real shell's list view with 240 rows: the toolbar and pager stay in view and the table scrolls | `t6` |

## 3. References

- **[[c1]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/protocol.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/docs-review-client.ts`
- **[[c4]]** `code` `vscode-plugin/src/extension.ts`
- **[[c5]]** `code` `vscode-plugin/src/delivery/board-wiring.ts` — "if (deps.tabIcon !== undefined) panel.iconPath = deps.tabIcon;"
- **[[c6]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- **[[c7]]** `code` `vscode-plugin/src/chat/docs-review-comments.ts`
- **[[c8]]** `code` `src/workflow/pending.ts` — "readonly openQuestionCount: number;"
- **[[c9]]** `stakeholder` `The user in chat on 2026-10-13, after the hand check of Story 8d4b90c9ab301e66/S001` — "the doc review selection shouldn't be a dropdown, should be a paginated table, also should have a search with type selection dropdown and autocomplete"
- **[[c10]]** `stakeholder` `The user in chat on 2026-10-13` — "the modification did not get reflected in the open view. still showing old text; need to create an insrc icon for doc review, something in line with the delivery board icon"
- **[[c12]]** `prior-artifact` `The daemon review of revision 1 of this LLD, 2026-10-13: block, 5 medium (a change during a failed decision lost; the watch kept after a failed open clears the record; a failed list read not visible on the list view; the decision result line overwritten; a re-post pulling the reviewer off the list)`
- **[[c13]]** `prior-artifact` `The daemon review of revision 2 of this LLD, 2026-10-13: block, 2 medium (the draft writer overwrites the whole saved state; the failure of an asked-for open not visible), and the acceptance criteria not stated`
