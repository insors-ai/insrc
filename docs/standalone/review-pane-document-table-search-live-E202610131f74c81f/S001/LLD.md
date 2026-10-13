<!-- insrc:artifact LLD-1f74c81f507dbe78-S001 -->

# LLD: E202610131f74c81f:S001

## Summary

**Epic:** `review-pane-document-table-search-live`
**HLD base run:** `wf-1791907160407-xl170j`
**HLD effective hash:** `6ba5f215187f...`

The review pane opens on a table of the documents awaiting review instead of a dropdown: 25 rows a page, a search box that suggests titles and ids as you type, and a dropdown to show one document type. Choosing a row opens the document as today, with a back button to the table. While a document is open the pane notices when its files change on disk and reloads it in place, keeping the reviewer's place and unsent comments. The pane's editor tab and its command get an insrc icon in the style of the delivery board's. Acceptance: ac1, a document changed on disk while it is open is reloaded in place, with the reviewer's place and unsent comments kept; ac2, the pane's tab and command show an insrc review icon in light and dark themes; ac3, documents are chosen from a paged table with a search that completes and a type filter.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `createDocsReviewHost`

```typescript
createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost  // DocsReviewHostDeps gains: watchDocument?: (relPaths: readonly string[], onChange: () => void) => { dispose(): void }; setTimer?: (fn: () => void, ms: number) => { cancel(): void }
```

**Parameters:**
- `deps.watchDocument: (relPaths: readonly string[], onChange: () => void) => { dispose(): void }` _(optional)_ — Watches repo-relative files and calls onChange when any of them is created, changed or deleted. extension.ts wires it to VS Code file watchers under the first workspace folder. Absent means the pane does not follow changes, as today.
- `deps.setTimer: (fn: () => void, ms: number) => { cancel(): void }` _(optional)_ — The timer for the quiet period; defaults to setTimeout. A test passes its own to run the period at once.

**Returns:** `DocsReviewHost` — WATCH. The watch follows the host's record of the open document: at every place that record is assigned (a document is read, a failed open of another document clears it, the panel is closed, dispose()) the host disposes the watch it holds and, when the new record has a docPath, starts one on two files: the docPath and '.insrc/artifacts/<artifactId>.json' (a comment saved by another tool changes only the JSON). A change starts a quiet period of 300 ms; further changes inside it restart it; at its end the host re-reads the pending list and then the open document by its path with the existing reopen(), A change that arrives while a decision for that document is in flight is remembered, not acted on; when the decision settles, on any path (recorded, refused or failed), the quiet period starts if a change was remembered, so no change is lost whether or not the decision re-read the document. A re-read started by the watch posts its 'docs-content' with changed: true. REVEAL. 'docs-content' gains reveal: true when the reviewer asked for the document (an 'open-doc' with an id, or openArtifact); it is absent on every re-read (after a decision, on the boot ping, from the watch). Both messages of an asked-for open carry it: the document's content, and the 'unavailable' content posted when its read fails, so a row whose read fails takes the reviewer to the document view where the error is shown. LIST. 'docs-list' carries, per artifact, the summary as today plus openQuestions and workItemId when the daemon gave them. SHELL: TWO VIEWS. The shell shows either the list view or the document view. Which view is on show is kept in the saved state and restored when the shell is rebuilt; with nothing saved it is the list view. A 'docs-content' with reveal switches to the document view. One without reveal never changes the view: it updates the document the shell holds, so a reviewer on the list stays on the list, also after the tab was hidden and shown. The back button switches to the list view and leaves the document open in the host, with its drafts kept as today. A 'docs-content' with an empty artifact id is the host's notice that the list or a document could not be read: it never switches the view; its text is shown in a notice line at the top of the list view, in place of the 'no documents' line, and cleared by the next 'docs-list' that carries documents or the next document shown. LIST VIEW: a toolbar (a search input with a datalist, a type select, a line 'n of m documents'), a table with the columns Type, Title, Id and Open questions, and a pager (previous, 'page x of y', next), 25 rows a page. Rows are ordered by type (SPEC, DEF, HLD, LLD, PLAN, ISSUE, BUILD, CR, then any other type by name) and then by title. The type select lists 'All types (m)' and each type present with its count. Search is case-insensitive; every word typed must occur in the title, the artifact id or the work item id. The datalist offers the titles and ids of the documents of the chosen type, at most 50, so the field completes as the reviewer types. Changing the search or the type goes to page 1. A row's title is a button; pressing it posts the existing 'open-doc'. The search text, the type and the page are kept in the webview's saved state beside the drafts and restored when the shell is rebuilt. With no pending document the view says so; with none matching it says so and keeps the toolbar. DOCUMENT VIEW: today's pane, with the header's select replaced by a round back button ('Back to the list') and the document's title; the kind badge, the state line and the tabs are unchanged. RELOAD IN PLACE. When a 'docs-content' arrives for the artifact already shown, the shell keeps the scroll position of the document region (it reads scrollTop before rendering and sets it after) and, when the message carries changed: true and its content version differs from the one shown, shows the line 'This document changed on disk and was reloaded.' in the result line. A re-read that follows the shell's own decision carries no such mark, so the decision's result line stays. Drafts are put back on their passages as today. ICON. No host change: extension.ts sets the panel's iconPath to a light and dark pair, media/insrc-review-icon.svg and media/insrc-review-icon-dark.svg, before wrapping the panel as a channel; package.json's insrc.chat.docsReview command declares the same pair.

**Errors:**
- `none thrown` when A watchDocument that throws when called, or whose disposer throws, is logged and the pane goes on without following changes. A re-read that fails posts what a failed re-read posts today.

**Preconditions:**
- The host module stays free of vscode: the watcher and the timer are injected

**Postconditions:**
- A burst of file events causes one re-read
- The reviewer's scroll position, whole-document field and drafts survive a reload of the same document
- The daemon is not called while nothing changes
- The comment panel and the header stay outside the scrolling regions in both views; the list view's table is its own scrolling region
- Every colour in the list view is a VS Code theme variable; titles and ids are set as text
- At most one watch exists at a time, and none while the host holds no open document
- A change reported during a decision is acted on after the decision settles, whatever its outcome
- A re-read never moves the reviewer from the list view to the document view
- A failed list read is visible in the list view

### 2.2 `webviewChannel`

```typescript
webviewChannel(panel: WebviewPanelLike): ChatPanelChannel  // unchanged; extension.ts sets panel.iconPath = { light, dark } on the vscode panel before calling it, as the delivery board's wiring does
```

**Parameters:**
- `panel: WebviewPanelLike` — The VS Code webview panel of the review pane, with its icon already set.

**Returns:** `ChatPanelChannel` — As today. The icon is a property of the vscode panel, so neither the channel nor the host learns of it.

**Preconditions:**
- The two SVG files ship in the .vsix (media/ is not excluded)

**Postconditions:**
- The review pane's tab shows the review icon in light and dark themes
- The 'insrc: Review pending documents' command shows the same icon where VS Code shows command icons

## 3. Data model changes

### 3.1 `DocsArtifactSummary` — field-add

Two optional fields: openQuestions?: number (the daemon's openQuestionCount) and workItemId?: string (the daemon's workItemId, when it could be derived). The client maps them from PendingArtifact; each is an absent key when the daemon sent none. The host forwards the summaries unchanged.

```
DocsArtifactSummary { id; kind; title; status; + openQuestions?: number; + workItemId?: string }
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/docs-review-client.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`

### 3.2 `webview saved state` — field-add

Beside 'rv' (per-artifact drafts and field) the state gains 'list': { q: string; kind: string; page: number; view: 'list' | 'doc' }: the list view's search text, chosen type ('' for all), page (from 1) and which view is on show. A value of another shape is ignored and the defaults are used (empty search, all types, page 1, the list view). A page beyond the last is shown as the last. A saved view of 'doc' with no document held shows the list view until a document arrives. The state is one object with two keys written by two writers: the comment source writes 'rv' on every draft and field change, the list view writes 'list'. Each writer reads the current state, sets its own key and writes the object back, so neither drops the other's key. (Today the draft writer writes an object holding only 'rv'; that changes.)

```
state { rv: {...}; + list?: { q; kind; page; view } }
```

**Call sites:**
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/chat/docs-review-comments.ts`

### 3.3 `media/insrc-review-icon.svg, media/insrc-review-icon-dark.svg` — new

A 256x256 pair in the style of the delivery board's: the insrc spiral at 60% opacity behind a drawn glyph, here a document page with a check mark, stroked #1a4528 in the light file and #ffffff in the dark one, with no background.

**Call sites:**
- `vscode-plugin/media/insrc-delivery-icon.svg`
- `vscode-plugin/package.json`
- `vscode-plugin/src/extension.ts`

### 3.4 `'docs-content' message` — field-add

Two optional flags. reveal?: boolean is true when the reviewer asked for this document (a list row or openArtifact) and absent on re-reads; the shell changes to the document view only for it. changed?: boolean is true when the re-read was started by the file watch; the shell says the document changed only for it.

```
docs-content { ...; + reveal?: boolean; + changed?: boolean }
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`

## 4. Error paths

**Error cases**

- **The watcher cannot be started** (recoverable)
  - Detection: deps.watchDocument throws when the host calls it for the newly opened document
  - Response: The throw is caught and logged with the document's path; no watch is kept; the document is shown as usual
  - User impact: The pane works as it does today: the document is not reloaded when it changes until it is opened again
- **The re-read after a file change fails** (recoverable)
  - Detection: client.pending or client.content rejects inside the re-read the watch started
  - Response: A failed list read posts the empty list and the host's notice (a 'docs-content' with an empty artifact id), which the list view shows in its notice line in place of the 'no documents' line; a failed re-read of the open document posts the 'unavailable' content for that artifact and keeps the host's record of it. Neither changes the view. The watch stays, so the next change tries again
  - User impact: On the list view the reviewer sees the error text above the table; on the document view the error text is in place of the document until the next change or a reopen. Drafts are kept in the saved state
- **The document's file is deleted or moved while open** (recoverable)
  - Detection: The watch reports the change; the re-read by path fails in the daemon with 'cannot read'
  - Response: As a failed re-read: the pane shows the daemon's message for that artifact. The pending list, re-read first, no longer lists it if its record is gone too
  - User impact: The reviewer sees that the document cannot be read and goes back to the list
- **A disposer throws** (recoverable)
  - Detection: The watch's dispose() throws when the host replaces or drops the watch
  - Response: Caught and logged; the host forgets the watch and goes on. A change reported later by that watch is ignored because it carries the id of a watch the host no longer holds
  - User impact: None
- **The saved list state is not what the shell wrote** (recoverable)
  - Detection: The shell reads state.list and finds it missing, not an object, or with a q or kind that is not a string or a page that is not a positive whole number
  - Response: The defaults are used for whatever is wrong: empty search, all types, page 1
  - User impact: The list opens unfiltered on its first page
- **An icon file is missing from the installed extension** (recoverable)
  - Detection: Not detected by the plugin: VS Code is given a path and shows its default icon when the file is absent
  - Response: None at run time. A test asserts the two files exist, are valid SVG and are not excluded from the package
  - User impact: The tab would show VS Code's default icon
- **The list cannot be read when the pane opens (the daemon is down, or no workspace folder is open)** (recoverable)
  - Detection: client.pending rejects; the host posts the empty list and a 'docs-content' with an empty artifact id carrying the error text
  - Response: The shell stays on the list view and shows that text in its notice line; the table is empty and the toolbar stays
  - User impact: The reviewer sees why there is no list, not 'no documents are awaiting review'
- **Opening another document fails while one is open** (recoverable)
  - Detection: client.content rejects for an artifact other than the one the host's record names, and the host clears the record
  - Response: Clearing the record disposes the earlier document's watch, like every other assignment of the record
  - User impact: None beyond the error shown for the document that could not be opened; no re-read is caused later by the document that is no longer shown
- **A document chosen from a list row cannot be read** (recoverable)
  - Detection: client.content rejects in the open the row asked for; the host posts the 'unavailable' content for that artifact, with reveal
  - Response: The shell changes to the document view and shows the error text in place of the document, with approve disabled as for any blocked content; the back button returns to the list
  - User impact: The reviewer sees why the document did not open, not an unchanged list

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A change is reported while a decision for that document is waiting for the daemon | The change is remembered. When the decision settles (recorded, refused by the host, or failed in the daemon) the quiet period starts and one re-read follows, marked changed. Nothing is lost when the decision's own path did not re-read the document |
| The pane's own decision writes the artifact's JSON | The decision's own re-read is not marked changed, so the result line of the decision stays whatever the content version is. The watch's report of the same write arrives during or after the decision and causes one more re-read, marked changed; its content version is the one already shown, so the shell says nothing |
| Many file events in a burst (a re-authoring writes the .md, the .json and companions) | One re-read, 300 ms after the last event |
| The reviewer has drafts and has scrolled down when the document is reloaded | The scroll position is kept; each draft is put back on its passage, or kept and counted as on text that is no longer in the document; the whole-document field is untouched |
| The document is reloaded while the reviewer is on the list view | The re-read carries no reveal, so the shell stays on the list view and updates the document it holds. The same holds after the tab was hidden and shown: the rebuilt shell restores the list view from the saved state, and the host's re-post on the boot ping carries no reveal |
| A search of several words, or with capital letters, or with surrounding spaces | Case is ignored, the text is trimmed, and a document matches when every word occurs in its title, id or work item id |
| A search or type that matches nothing | The table is empty with the line 'No document matches', the toolbar stays, and the pager shows page 1 of 1 with both buttons disabled |
| The list changes while the reviewer is on page 9 and now has 3 pages | Page 3 is shown; the saved page is corrected |
| The saved type is one that no pending document has any more | It is treated as all types |
| A document opened from the delivery board that is not awaiting review | The document view opens on it as today; it is not a row of the table; the back button shows the table of pending documents |
| A title of 300 characters, or one with markup characters | Set as text; the cell wraps; nothing is interpreted as markup |
| More than 50 documents of the chosen type | The datalist offers the first 50 in table order; the search still looks at all of them |
| No workspace folder is open | The watcher dep answers a disposer that does nothing; the list read fails with the daemon's 'repo is required' as today |
| The tab is hidden and shown while the reviewer is on the document view | The rebuilt shell restores the document view from the saved state and shows the document when the host's re-post arrives |
| A document is opened from the delivery board while the reviewer is on the list view | The content carries reveal, so the shell changes to the document view |
| A draft is saved after the list's search, type, page and view were saved, or the reverse | Both are in the saved state afterwards: each writer keeps the key it does not own |

**Invariants to preserve**

- A newer open or list refresh always wins over a slower earlier one (openSeq, refreshSeq); the re-read started by a watch goes through the same two guards [[c1]]
- A decision is acted on only for the open document and is sent by its path; the watch changes neither [[c1]]
- The shell is one inline script under a nonce CSP with no remote origin, and its recorded baseline is updated with each change to it [[c6]]
- The header and the comment panel are outside the scrolling regions, and every colour is a VS Code theme variable with no theme switch [[c6]]
- Drafts and the whole-document field are kept per artifact in the webview's saved state and survive a re-render of the same document [[c7]]
- The host module is free of vscode; everything it needs from VS Code is injected in extension.ts [[c4]]
- 'open-doc' with an empty id is the shell's boot ping and re-posts the open document; with an id it opens a pending document [[c1]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), as the plugin's existing suites`

**Test levels**

- **unit** — The client and the wiring: the summary's new fields, the icon pair and the watcher dep.
  - Subjects: `docs review client: pending forwards openQuestions and workItemId when the daemon gives them and leaves them absent otherwise`, `review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command`, `review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder`
- **integration** — The host over a fake channel, client, watcher and timer: when it watches, what a change does, and when the watch ends.
  - Subjects: `docs review host: opening a document watches its markdown file and its artifact JSON, and the watch is disposed wherever the open document's record is replaced or cleared: another document, a failed open of another, the panel closing and dispose`, `docs review host: a burst of changes causes one re-read of the list and of the open document by its path after the quiet period, marked changed; a change during a decision is acted on when the decision settles, whether it was recorded, refused or failed`, `docs review host: a watcher or disposer that throws is logged and the document is still shown; with no watcher dep nothing is watched`, `docs review host: docs-list carries openQuestions and workItemId`, `docs review host: docs-content carries reveal for a list-row open and for openArtifact, on the content and on the unavailable content of a failed read alike, and not for a re-read after a decision, on the boot ping or from the watch`
- **integration** — The real shell script against the stub DOM: the list view, the two views and the reload in place.
  - Subjects: `docs review shell: the list view shows 25 rows a page ordered by type then title, and the pager moves between pages and is disabled at the ends`, `docs review shell: the search matches every word in the title, id or work item id without regard to case, the type select filters with counts, and either change goes to page 1`, `docs review shell: the datalist offers at most 50 titles and ids of the chosen type`, `docs review shell: pressing a row's title posts open-doc, a content with reveal switches to the document view (an unavailable one too), a content without it never changes the view, and the back button returns to the list with the document and its drafts kept`, `docs review shell: the search, type, page and the view on show are restored from the saved state when the shell is rebuilt, a re-post to the rebuilt shell does not leave the list view, a draft saved after the list state keeps it and the reverse, and a saved state of another shape gives the defaults`, `docs review shell: a reload marked changed keeps the scroll position and the drafts and says the document changed; a reload after the shell's own decision keeps the decision's result line`, `docs review shell: the list view's table is its own scrolling region, the toolbar and pager are outside it, titles and ids are set as text, and the recorded baseline is that of the new shell`, `docs review shell: the host's notice of a failed read is shown in the list view's notice line, does not change the view, and is cleared by the next list that carries documents`
- **smoke** — What only a real VS Code shows.
  - Subjects: `By hand in VS Code: the tab shows the review icon in a light and a dark theme; the table pages, searches with suggestions and filters by type over the real pending list; and a document edited on disk while open is reloaded in place with the scroll position kept`, `Headless Chrome render of the real shell's list view with 240 rows: the toolbar and pager stay in view and the table scrolls`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `docs review host: opening a document watches its markdown file and its artifact JSON, and the watch is disposed wherever the open document's record is replaced or cleared: another document, a failed open of another, the panel closing and dispose`, `docs review host: a burst of changes causes one re-read of the list and of the open document by its path after the quiet period, marked changed; a change during a decision is acted on when the decision settles, whether it was recorded, refused or failed`, `docs review shell: a reload marked changed keeps the scroll position and the drafts and says the document changed; a reload after the shell's own decision keeps the decision's result line`, `docs review host: docs-content carries reveal for a list-row open and for openArtifact, on the content and on the unavailable content of a failed read alike, and not for a re-read after a decision, on the boot ping or from the watch` |
| `ac2` | `review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command`, `review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder` |
| `ac3` | `docs review shell: the list view shows 25 rows a page ordered by type then title, and the pager moves between pages and is disabled at the ends`, `docs review shell: the search matches every word in the title, id or work item id without regard to case, the type select filters with counts, and either change goes to page 1`, `docs review shell: the datalist offers at most 50 titles and ids of the chosen type`, `docs review shell: pressing a row's title posts open-doc, a content with reveal switches to the document view (an unavailable one too), a content without it never changes the view, and the back button returns to the list with the document and its drafts kept`, `docs review shell: the host's notice of a failed read is shown in the list view's notice line, does not change the view, and is cleared by the next list that carries documents` |

## 6. Migration

**State before:** The review pane's header holds a select of every pending document (240 options on this repository). The pending summary the host receives is { id, kind, title, status }. The open document is re-read only when it is opened, after a decision, or when the shell is rebuilt; the plugin watches no file. The pane's tab and its command have no icon. (s1: symbol.locate, data-model.trace, usage.example, search.text.)

**State after:** The pane opens on a paged table of the pending documents with a search field that completes from titles and ids and a type filter; a row opens the document, and a back button returns to the table. The summary also carries openQuestions and workItemId. While a document is open the host watches its markdown file and its artifact JSON through an injected watcher and reloads it in place after a quiet period, keeping the scroll position and the drafts; a change during a decision is acted on when the decision settles. A document is brought into view only when the reviewer asked for it, and the view on show survives the tab being hidden. The tab and the command show an insrc review icon in light and dark themes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the icon pair to media/, declare it on the command in package.json and set it on the review panel in extension.ts — ↩ rollbackable
2. Add openQuestions and workItemId to the summary type and map them in the client — ↩ rollbackable
3. Add the watchDocument and setTimer deps to the host: the watch follows the open document's record, a change during a decision is remembered until it settles, re-reads are marked changed and asked-for opens are marked reveal; wire a file watcher in extension.ts — ↩ rollbackable
4. Add the list view to the shell (toolbar, notice line, table, pager, saved state with the view on show) and replace the header's select with a back button and the title; change view only on reveal; keep the scroll position and say so on a reload marked changed; update the shell's recorded baseline and the layout tests — ↩ rollbackable
5. Build, package and install the plugin; check by hand in VS Code — ↩ rollbackable

**Backward compat:** Plugin only; no daemon call or stored record changes, so no daemon update is needed. The new summary fields and host deps are optional. The webview and the host ship in one plugin build, so there is no mixed-version case. A webview state saved by the earlier build has no 'list' key and gets the defaults; its drafts are read as before.

## 7. Alternatives considered

### 7.1 a1: List view in the webview, watcher as a host dep — **CHOSEN**

The pane opens on a table of all pending documents; search, type filter and paging are done in the webview over the list it already receives; the host is given a watcher for the open document's files.

The shell gains a second view. The LIST view is a table (type, title, id, open questions) with a search field backed by a datalist of titles and ids, a type dropdown with counts, and pager controls; it filters and pages the 'docs-list' it holds, in the webview. Choosing a row posts the existing 'open-doc'. The DOCUMENT view is today's pane with the header's select replaced by a back button and the document's title. The summary posted in 'docs-list' gains openQuestionCount and workItemId, which the daemon already sends. The host gains one optional dep, watchDocument(relPath, onChange) returning a disposer, wired in extension.ts to a VS Code file watcher; while a document is open the host watches its markdown file and the artifact store, and on a change, after a short quiet period, re-reads the pending list and the document by its path with the existing reopen(). The panel gets a tab icon through an optional tabIcon dep set on the channel's panel, and the command declares the icon pair.

### 7.2 a2: Paged and searched by the host

The webview asks the host for one page at a time with a query and a type; the host filters the list it holds and answers with that page.

A new webview message 'docs-query' { text, kind, page } and a host message 'docs-page' { rows, total, kinds, suggestions }. The host keeps the pending list, filters and slices it, and computes the autocomplete suggestions. The webview shows only what it is sent. Live refresh and the icon as in a1.

**Rejected because:** Adds two message kinds and a stale-answer guard to page a list that is small and already delivered whole.

### 7.3 a3: Side column beside the document

The table is a column at the left of the pane, always visible beside the open document.

The pane becomes two columns: the table with its search and filter at the left, the document and the comment panel at the right. Selecting a row opens the document without leaving the list. Data handling as in a1.

**Rejected because:** Costs the document a third of its width and is the largest change to a layout the user approved.

### 7.4 a4: Poll instead of watch

As a1, but the host re-reads the open document on a timer and when the pane becomes visible, with no file watcher.

The host compares the content version the daemon returns with the one it last posted, every few seconds while the pane is visible, and posts the document again when it differs. The list view and the icon as in a1.

**Rejected because:** Same list view as a1; polling is simpler to wire but costs a daemon read of the whole document on every tick and shows a change late.

## 8. References

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
- **[[c11]]** `prior-artifact` `LLD-8d4b90c9ab301e66-S001 (the review pane rework this Story follows)`
- **[[c12]]** `prior-artifact` `The daemon review of revision 1 of this LLD, 2026-10-13: block, 5 medium (a change during a failed decision lost; the watch kept after a failed open clears the record; a failed list read not visible on the list view; the decision result line overwritten; a re-post pulling the reviewer off the list)`
- **[[c13]]** `prior-artifact` `The daemon review of revision 2 of this LLD, 2026-10-13: block, 2 medium (the draft writer overwrites the whole saved state; the failure of an asked-for open not visible), and the acceptance criteria not stated`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T15:59:22.935Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | Disposing and restarting the watch at every assignment of the record loses no file change. | The record is reassigned on every successful read, including each re-read the watch itself starts (docs-review-panel.ts:1375). As written, every reload disposes both watchers and creates two new ones on the same paths. Whether VS Code delivers an event that lands between the dispose and the new watcher becoming live cannot be checked from the code; it needs a real VS Code. [files: vscode-plugin/src/chat/docs-review-panel.ts] | Keep the existing watch when the new record's docPath and artifactId are unchanged; dispose and restart only when they differ. |
