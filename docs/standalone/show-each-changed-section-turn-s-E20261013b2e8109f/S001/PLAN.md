<!-- insrc:artifact PLAN-b2e8109f42afc0dd-s1 -->

# Plan: E20261013b2e8109f:S001

## Summary

**Epic:** `show-each-changed-section-turn-s`
**LLD run:** `wf-1791879583690-xuty4f`
**LLD effective hash:** `e608c958c16e...`

The build goes bottom-up in eight tasks so the plugin typechecks and its tests pass after each one. First the parts with no users yet: the patch parser and section matching, the git tree snapshot, the adapter's new event fields, and the saved diff row with its window cut. Then the webview widget, then the governor and the host that connect them, then the rules that hold back and settle the path line and end the turn's diff state on every exit. The last task runs the whole suite, installs the plugin and checks it by hand with claude and codex.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the patch parser and the section reconciliation | M | — | unit: parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file; unit: parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name; unit: parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section; unit: parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw; unit: reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id; unit: reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn; unit: reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later | [[c6]] [[c10]] |
| 2 | **`t2`** Snapshot the working tree as a git tree and report its changes | M | — | unit: git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path; unit: git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails; unit: git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree; unit: git-baseline: release removes the private index, and a failed git add does not fail snapshot; integration: git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged | [[c1]] [[c10]] |
| 3 | **`t3`** Report which edit a result answers, and each file a codex patch changed | S | — | unit: claude adapter: the result of an Edit or Write call carries editPath, and isError when the block reports an error; a command's result carries neither; unit: codex adapter: a file_change item emits one applied file-edit event per changed file, one for a bare path, and '(unknown)' when it names none; a claude edit's event has no applied; live: live claude: an Edit of a file in a temporary repository yields a tool-result with editPath and the baseline's changes hold the edited section; live: live codex: a patch of two files in a temporary repository yields two applied file-edit events with those files' paths | [[c8]] |
| 4 | **`t4`** Add the saved diff row and give its latest version at the first row's place | M | — | unit: transcript window: a diff row is given with the content of the last later row that replaces its sid, wherever those rows sit; a withdrawn one as withdrawn; a row with replaces as it is; firstIndex and the row count do not change; unit: toViewModel: a diff row maps to the diff kind in the host and in the webview mirror; integration: session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place | [[c4]] [[c5]] [[c7]] |
| 5 | **`t5`** Draw the diff widget and the row message in the webview | L | `t4` | unit: diff widget: header, line numbers, signs and classes are drawn from a diff row; 8 lines show until the header or the button is used; unit: diff widget: 8 lines or fewer has no chevron and no button; a binary row, a new file, a deleted file and an omitted count are labelled; a row with replaces or withdrawn appends nothing; unit: transcript-row: a diff row without replaces appends a widget stamped with its row index; one with replaces redraws the widget of that sid and keeps it open; a withdrawn one hides it; one for an unknown or trimmed sid changes nothing; unit: transcript-row: a marker row appends the same line a restored marker row draws; unit: diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget; unit: tool result: a short output is drawn with no chevron and a long one folds; unit: chat theme: the transcript's children do not shrink, the diff widget's rules name only the shell's theme names, and the .insrc-term-diff rule still out-ranks the shared sheet (__tests__/chat-theme.test.ts; replaces the three has() lines on .insrc-diff-add, .insrc-diff-del and .insrc-diff-actions button, and the seven .insrc-diff-* selectors leave chat-theme-before.json while the widget's selectors join the test's list of added selectors) | [[c5]] [[c9]] [[c10]] |
| 6 | **`t6`** Check for changes after each tool call and push the sections as rows | L | `t1`, `t2`, `t4`, `t5` | unit: governor: check passes the reconciled operations to showSections and calls nothing when nothing changed; unit: governor: checks run one at a time, a call made during a check causes exactly one more, and its promise resolves after that one; unit: governor: an unreadable check calls sectionsUnreadable once per turn and a later check still shows sections; unit: governor: sectionPaths holds the path of every known section, shown or hidden, and is empty after beginTurn; unit: governor: no snapshot or the editor view means sectionsActive is false and check does nothing; in the chat view observe does nothing; unit: governor: a check that ends after a newer turn began shows nothing, and resolveTurn runs a last check then releases the snapshot; unit: governor: abandonTurn makes sectionsActive false at once, releases the snapshot without a last check, and a check in flight shows nothing; unit: protocol: transcript-row is a host message and edit-prompt is not; unit: chat wiring: the governance deps carry relPath and no computeDiff, and git is run with the given environment (__tests__/extension-chat-wiring.test.ts; replaces the assertion on `computeDiff: defaultComputeDiff` at line 89); integration: diff sections: an added section is pushed as a diff row with a sid and posted as transcript-row with its row index; an update and a withdraw are pushed as rows that name that sid, and no earlier row is changed; integration: diff sections: a check is requested after every tool-result and file-edit event and once more at the end of the turn, and the session is saved after late rows; integration: diff sections: overflow and unreadable push one marker row each and post it as transcript-row; integration: diff sections: with no snapshot, or with the editor view, no diff state is made and the rows and messages are those of today; integration: diff sections: the restored window and an older page carry each section's latest version at its first row's place | [[c2]] [[c3]] [[c9]] [[c10]] |
| 7 | **`t7`** Hold back the path line, settle it, and end the diff state on every exit | M | `t3`, `t6` | integration: diff sections: while the diff state is open the file-edit marker and the successful edit result write no row, and a failed edit pushes and posts the path marker then the error row; integration: diff sections: an edit whose path has no section after its check gets its path marker, posted as transcript-row, for a claude result, for a codex applied file-edit and at the end of the turn; an edit whose path has a section gets none; integration: diff sections: a chat switch in mid-turn settles the held paths, saves, abandons the governor's turn before the detach, and a check in flight then pushes and posts nothing; integration: diff sections: the Stop control, a newer turn's start, a sink error and closing the panel each end the open diff state and settle its held paths; integration: diff sections: a followed turn writes and posts its rows as today and asks for no check, also while the governor still holds a snapshot | [[c3]] [[c10]] |
| 8 | **`t8`** Run the whole suite, install the plugin and check by hand | S | `t7` | smoke: By hand in VS Code: a claude turn and a codex turn that each change two places in one file, change one of them again and add a file show one widget per section, folded to 8 lines, with the changed one updated in place, and the widgets show in their latest form after a window reload; smoke: The whole plugin suite passes apart from the two manifest-catalog tests that fail before this change | [[c11]] [[c12]] |

### 1.1 E20261013b2e8109f:S001:T001 — Add the patch parser and the section reconciliation

New pure module vscode-plugin/src/chat/diff-sections.ts: DiffSection, SectionOp, KnownSection, the three limits, parsePatch and reconcileSections, with its test file. Nothing uses it yet.

**Acceptance checks:**
- parsePatch gives one entry per section with path, ranges, counts and lines, and handles a new, a deleted and a binary file, a name with a space and a quoted name
- A section over 400 lines is cut with the rest counted in omitted
- reconcileSections adds, updates under the same id, withdraws, joins, and hides sections beyond the limit
- The plugin typechecks

### 1.2 E20261013b2e8109f:S001:T002 — Snapshot the working tree as a git tree and report its changes

git-baseline.ts takes its snapshot through a private copy of the index and gains changes and release; WorkspaceBaseline and BaselineHandle in edit-governor.ts gain the new members; extension.ts gives runGit an environment argument and passes tempIndexPath, copyFile and removeFile. read keeps its results. The fakes of the baseline in the existing tests gain the new members. The real-git test also covers a linked worktree and a repository with core.splitIndex.

**Acceptance checks:**
- snapshot writes a tree with GIT_INDEX_FILE set to a copy of the index and returns the tree id and the copy's path
- changes returns an empty string, the patch, or undefined on failure
- Against real git in a temporary repository the user's index and status are unchanged and the patch holds the expected sections, also in a linked worktree and with core.splitIndex on
- The plugin typechecks and the existing governor and host tests pass

### 1.3 E20261013b2e8109f:S001:T003 — Report which edit a result answers, and each file a codex patch changed

stream-events.ts gains editPath and isError on 'tool-result' and applied on 'file-edit'. The claude mapper remembers Edit and Write tool_use ids and sets editPath and isError on their results. The codex mapper emits one 'file-edit' event per entry of a file_change item's changes list, one for a bare path, and '(unknown)' when the item names none; the events carry applied unless the item's status is 'failed', in which case the host holds the path and writes its path line when the turn's diff state ends. A recorded real codex item is added as a unit fixture, and the two live tests are added behind the live flag.

**Acceptance checks:**
- A claude Edit or Write result carries editPath, and isError when the block reports an error; a command's result carries neither
- A codex file_change item with two changes gives two applied file-edit events with those paths, and a failed item gives them without applied
- Existing adapter tests pass

### 1.4 E20261013b2e8109f:S001:T004 — Add the saved diff row and give its latest version at the first row's place

session-store.ts gains the role:'diff' variant with sid, replaces and withdrawn. pageBefore in transcript-window.ts substitutes by sid. The host toViewModel and its webview mirror map a diff row to the 'diff' kind. Tests of the window cut, of the view-model parity and of the file store round trip with another writer's rows in between.

**Acceptance checks:**
- pageBefore gives a diff row with the content of the last later row that replaces its sid, and leaves firstIndex and the row count as they are
- A diff row, a replacing row and a withdrawing row saved through the file store by separate saves are read back by a new store
- The host and webview toViewModel agree on a diff row

### 1.5 E20261013b2e8109f:S001:T005 — Draw the diff widget and the row message in the webview

render-registry.ts registers the 'diff' renderer (built through line(), remembered by sid) and redrawDiff, and folds a tool result only when its output is long. protocol.ts gains 'transcript-row'. The shell in chat-panel.ts handles 'transcript-row', carries the widget's rules and the no-shrink rule, and loses renderDiff, its 'edit-prompt' handler and the seven .insrc-diff-* rules. chat-theme.test.ts and chat-theme-before.json follow, and the renderDiff source assertions in chat-panel.test.ts are replaced. Until t6 the host still posts 'edit-prompt' and the shell ignores it; the old box was already invisible, so nothing the reader sees is lost.

**Acceptance checks:**
- A diff row draws the widget of the mock: header, line numbers, signs, 8 lines until opened, labels for new, deleted and binary files and for omitted lines
- A transcript-row with a replacing row redraws the widget of that sid and keeps it open; a withdrawing one hides it
- A diff row in a restored window and in an older page is appended as a widget
- A short tool output has no chevron
- The transcript's children do not shrink and the widget's rules name only the shell's theme names

### 1.6 E20261013b2e8109f:S001:T006 — Check for changes after each tool call and push the sections as rows

edit-governor.ts gains sectionsActive, check, sectionPaths and abandonTurn, limits observe to the editor view, swaps showChat for showSections and sectionsUnreadable, and loses computeDiff and defaultComputeDiff. The host opens a diff state in a turn's beforeRun, asks for a check after every 'file-edit' and 'tool-result' event of that turn's sink, pushes diff rows with sid and replaces and the overflow and unreadable marker rows, posts them as 'transcript-row', and ends the diff state in onTerminal after resolveTurn. 'edit-prompt' leaves protocol.ts. extension.ts passes relPath and no computeDiff. The S006 edit-prompt host tests, the governor tests and the wiring and protocol tests follow. One Task because the seam does not typecheck until the host stops using showChat and computeDiff.

**Acceptance checks:**
- A check passes add, update and withdraw operations to the host, which pushes rows and never changes an earlier row
- Checks run one at a time and a call made during a check causes exactly one more
- With no snapshot or with the editor view no diff state is made and the rows are those of today
- The restored window carries each section's latest version
- The plugin typechecks with 'edit-prompt', showChat, computeDiff and defaultComputeDiff gone

### 1.7 E20261013b2e8109f:S001:T007 — Hold back the path line, settle it, and end the diff state on every exit

While a turn's diff state is open the host writes no marker row for 'file-edit' and no row for a successful edit result, writes the path marker before a failed edit's error, and settles a held path after the check that follows its edit. The diff state is also ended, with its held paths settled at once and governor.abandonTurn called, before every turns.detach() and turns.stop(), in the sink's onError and at the top of the next turn's beforeRun. A followed turn is untouched.

**Acceptance checks:**
- A successful edit shows widgets and no path or result line; a failed edit shows its path and error
- An edit whose path has no section gets its path line after its check, for claude, for codex and at the end of the turn
- A chat switch, the Stop control, a newer turn, a sink error and closing the panel each settle the held paths and abandon the governor's turn
- A followed turn writes and posts its rows as today while the governor still holds a snapshot

### 1.8 E20261013b2e8109f:S001:T008 — Run the whole suite, install the plugin and check by hand

Run the plugin's typecheck and whole test suite, build, package and install the plugin, and check a claude turn and a codex turn in VS Code, including a window reload.

**Acceptance checks:**
- The whole plugin suite passes apart from the two manifest-catalog tests that fail before this change
- In VS Code a claude turn and a codex turn show one widget per section, folded to 8 lines, updated in place, and still there after a reload

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| protocol: transcript-row is a host message and edit-prompt is not | `t6` |
| parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file | `t1` |
| parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name | `t1` |
| parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section | `t1` |
| parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw | `t1` |
| reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id | `t1` |
| reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn | `t1` |
| reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later | `t1` |
| git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path | `t2` |
| git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails | `t2` |
| git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree | `t2` |
| git-baseline: release removes the private index, and a failed git add does not fail snapshot | `t2` |
| governor: check passes the reconciled operations to showSections and calls nothing when nothing changed | `t6` |
| governor: checks run one at a time, a call made during a check causes exactly one more, and its promise resolves after that one | `t6` |
| governor: an unreadable check calls sectionsUnreadable once per turn and a later check still shows sections | `t6` |
| governor: sectionPaths holds the path of every known section, shown or hidden, and is empty after beginTurn | `t6` |
| governor: no snapshot or the editor view means sectionsActive is false and check does nothing; in the chat view observe does nothing | `t6` |
| governor: a check that ends after a newer turn began shows nothing, and resolveTurn runs a last check then releases the snapshot | `t6` |
| governor: abandonTurn makes sectionsActive false at once, releases the snapshot without a last check, and a check in flight shows nothing | `t6` |
| claude adapter: the result of an Edit or Write call carries editPath, and isError when the block reports an error; a command's result carries neither | `t3` |
| codex adapter: a file_change item emits one applied file-edit event per changed file, one for a bare path, and '(unknown)' when it names none; a claude edit's event has no applied | `t3` |
| transcript window: a diff row is given with the content of the last later row that replaces its sid, wherever those rows sit; a withdrawn one as withdrawn; a row with replaces as it is; firstIndex and the row count do not change | `t4` |
| toViewModel: a diff row maps to the diff kind in the host and in the webview mirror | `t4` |
| chat wiring: the governance deps carry relPath and no computeDiff, and git is run with the given environment (__tests__/extension-chat-wiring.test.ts; replaces the assertion on `computeDiff: defaultComputeDiff` at line 89) | `t6` |
| chat theme: the transcript's children do not shrink, the diff widget's rules name only the shell's theme names, and the .insrc-term-diff rule still out-ranks the shared sheet (__tests__/chat-theme.test.ts; replaces the three has() lines on .insrc-diff-add, .insrc-diff-del and .insrc-diff-actions button, and the seven .insrc-diff-* selectors leave chat-theme-before.json while the widget's selectors join the test's list of added selectors) | `t5` |
| diff widget: header, line numbers, signs and classes are drawn from a diff row; 8 lines show until the header or the button is used | `t5` |
| diff widget: 8 lines or fewer has no chevron and no button; a binary row, a new file, a deleted file and an omitted count are labelled; a row with replaces or withdrawn appends nothing | `t5` |
| transcript-row: a diff row without replaces appends a widget stamped with its row index; one with replaces redraws the widget of that sid and keeps it open; a withdrawn one hides it; one for an unknown or trimmed sid changes nothing | `t5` |
| transcript-row: a marker row appends the same line a restored marker row draws | `t5` |
| diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget | `t5` |
| tool result: a short output is drawn with no chevron and a long one folds | `t5` |
| diff sections: an added section is pushed as a diff row with a sid and posted as transcript-row with its row index; an update and a withdraw are pushed as rows that name that sid, and no earlier row is changed | `t6` |
| diff sections: while the diff state is open the file-edit marker and the successful edit result write no row, and a failed edit pushes and posts the path marker then the error row | `t7` |
| diff sections: an edit whose path has no section after its check gets its path marker, posted as transcript-row, for a claude result, for a codex applied file-edit and at the end of the turn; an edit whose path has a section gets none | `t7` |
| diff sections: a check is requested after every tool-result and file-edit event and once more at the end of the turn, and the session is saved after late rows | `t6` |
| diff sections: overflow and unreadable push one marker row each and post it as transcript-row | `t6` |
| diff sections: with no snapshot, or with the editor view, no diff state is made and the rows and messages are those of today | `t6` |
| diff sections: a chat switch in mid-turn settles the held paths, saves, abandons the governor's turn before the detach, and a check in flight then pushes and posts nothing | `t7` |
| diff sections: the Stop control, a newer turn's start, a sink error and closing the panel each end the open diff state and settle its held paths | `t7` |
| diff sections: a followed turn writes and posts its rows as today and asks for no check, also while the governor still holds a snapshot | `t7` |
| diff sections: the restored window and an older page carry each section's latest version at its first row's place | `t6` |
| session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place | `t4` |
| git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged | `t2` |
| live claude: an Edit of a file in a temporary repository yields a tool-result with editPath and the baseline's changes hold the edited section | `t3` |
| live codex: a patch of two files in a temporary repository yields two applied file-edit events with those files' paths | `t3` |
| By hand in VS Code: a claude turn and a codex turn that each change two places in one file, change one of them again and add a file show one widget per section, folded to 8 lines, with the changed one updated in place, and the widgets show in their latest form after a window reload | `t8` |
| The whole plugin suite passes apart from the two manifest-catalog tests that fail before this change | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api createGitBaseline`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api createEditGovernor`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api createChatPanelHost`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails.api pageBefore`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails.api toViewModel`
- **[[c6]]** `prior-artifact` `LLD S001 dataModelChanges DiffSection`
- **[[c7]]** `prior-artifact` `LLD S001 dataModelChanges TranscriptEntry`
- **[[c8]]** `prior-artifact` `LLD S001 dataModelChanges TurnEvent 'tool-result' and 'file-edit', and the adapter's mappers`
- **[[c9]]** `prior-artifact` `LLD S001 dataModelChanges HostToWebview message set`
- **[[c10]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c11]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c12]]** `prior-artifact` `LLD S001 migration`
