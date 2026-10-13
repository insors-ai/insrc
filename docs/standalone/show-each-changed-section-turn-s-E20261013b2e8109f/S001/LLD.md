<!-- insrc:artifact LLD-b2e8109f42afc0dd-S001 -->

# LLD: E20261013b2e8109f:S001

## Summary

**Epic:** `show-each-changed-section-turn-s`
**HLD base run:** `wf-1791879583690-xuty4f`
**HLD effective hash:** `e608c958c16e...`

When the assistant changes files during a chat turn, the dev chat shows each changed section of each file as its own widget: the path, the lines added and removed, line numbers and the theme's diff colours, cut to 8 lines until the reader opens it. The plugin gets the sections by asking git, after every tool call, how the working tree differs from the snapshot it took when the turn started, so the same thing happens for claude and for codex, whether the change was made by an edit tool or by a shell command. A section that changes again updates its widget in place, and the widgets are saved with the chat so they are still there, in their latest form, after a reload. This replaces the diff box that is squashed to nothing today, and the bare path line and 'file has been updated' line that are all the reader sees; an edit that produces no widget still shows its path line. One limit: if the reader switches chat, closes the panel or reloads the window while a turn is running, the rest of that turn shows path lines as today, not widgets.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `createGitBaseline`

```typescript
createGitBaseline(deps: GitBaselineDeps): WorkspaceBaseline  // WorkspaceBaseline gains changes(handle: BaselineHandle): Promise<string | undefined> and release(handle: BaselineHandle): Promise<void>; BaselineHandle gains readonly index?: string; GitBaselineDeps.runGit gains a third argument env?: Record<string, string>; GitBaselineDeps gains tempIndexPath(): string, copyFile(from: string, to: string): Promise<boolean>, removeFile(path: string): Promise<void>
```

**Parameters:**
- `deps.runGit: (cwd: string, args: string[], env?: Record<string, string>) => Promise<{ ok: boolean; stdout: string }>` — Runs git in cwd; env is added to the process environment (used for GIT_INDEX_FILE). Never rejects.
- `deps.tempIndexPath: () => string` — A fresh absolute path in the system temporary directory for one turn's private index file.
- `deps.copyFile: (from: string, to: string) => Promise<boolean>` — Copies the repository's index to the private path; false when the source does not exist or cannot be read.
- `deps.removeFile: (path: string) => Promise<void>` — Removes the private index (and its lock file if one is left); a missing file is not an error.

**Returns:** `WorkspaceBaseline` — snapshot(cwd): asks `git rev-parse --git-path index` for the index path, resolves the printed path against cwd with deps.toAbs (git prints it relative to the directory it ran in), copies that file to tempIndexPath(), runs `git add -A --ignore-errors` and then `git write-tree` with GIT_INDEX_FILE set to the copy, and returns { ref: <tree id>, index: <the copy's path> }. The tree holds tracked and untracked files and no ignored ones; the user's own index is not written. When the copy reports false, git starts from an empty private index and the snapshot still works. changes(handle): runs the same add and write-tree against handle.index, returns '' when the new tree id equals handle.ref, otherwise the stdout of `git -c core.quotepath=false diff --no-color --no-ext-diff --no-textconv --no-renames -U3 --src-prefix=a/ --dst-prefix=b/ --relative <handle.ref> <new tree>`; undefined when write-tree or diff fails. read(handle, path): `git show <handle.ref>:./<rel>` as today, now against a tree id; the separate list of untracked files' text is removed because the tree holds those files. release(handle): removes handle.index.

**Errors:**
- `Error (thrown by snapshot)` when `git write-tree` fails or prints no tree id. The governor catches it and the turn runs with no snapshot, as it does today when the snapshot fails.

**Preconditions:**
- available(cwd) returned true (cwd is inside a git work tree)

**Postconditions:**
- The repository's own index file and `git status` are the same before and after snapshot and changes
- `git add` exiting non-zero does not fail snapshot or changes; only write-tree's result decides
- changes returns paths relative to cwd and nothing for a change outside cwd

### 2.2 `createEditGovernor`

```typescript
createEditGovernor(deps: EditGovernorDeps): EditGovernor  // EditGovernor gains sectionsActive(): boolean, check(): Promise<void>, sectionPaths(): ReadonlySet<string> and abandonTurn(): Promise<void>; EditRenderSeam loses showChat and gains showSections(ops: readonly SectionOp[], overflow: { sections: number; files: number } | undefined): void and sectionsUnreadable(): void; EditGovernorDeps loses computeDiff
```

**Parameters:**
- `deps.render.showSections: (ops: readonly SectionOp[], overflow: { sections: number; files: number } | undefined) => void` — Receives the result of one check: sections to add, update and withdraw, and how many new sections the per-check limit left out.
- `deps.render.sectionsUnreadable: () => void` — Called at most once per turn, the first time a check cannot read the changes.

**Returns:** `EditGovernor` — sectionsActive(): true when the current turn has a snapshot handle and diffView() is 'chat'. check(): when sectionsActive(), asks baseline.changes for the patch, parses it with parsePatch and reconciles it with the sections known for this turn with reconcileSections (both in the new diff-sections.ts), then calls render.showSections when there is at least one operation or an overflow. Checks run one at a time: a call made while a check runs sets a flag and one more check runs when the current one ends; the promise of every such call resolves when a check that started after the call has ended. sectionPaths(): the cwd-relative paths of every section known this turn, shown or hidden. observe(path): acts only when diffView() is 'editor': it reads the turn-start content, tracks the edit for decide when the mode is review, and calls showEditor, all as today; in the chat view it does nothing. decide is unchanged. beginTurn: releases the previous turn's handle before taking the new snapshot and clears the known sections. resolveTurn: runs one last check, waits for it, then calls baseline.release. abandonTurn: ends the turn's checks without a last one: it clears the snapshot handle and the known sections at once, so sectionsActive() is false and a check still in flight calls nothing on the render seam, then calls baseline.release.

**Postconditions:**
- A check that ends after a newer turn began, or after abandonTurn, calls nothing on the render seam
- No method of the governor rejects; a failure is logged through deps.logger
- defaultComputeDiff is removed from edit-governor.ts, and computeDiff from ChatEditGovernanceDeps and from the object extension.ts passes

### 2.3 `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost  // unchanged signature; ChatEditGovernanceDeps loses computeDiff and gains relPath(path: string): string
```

**Parameters:**
- `deps.editGovernance.relPath: (path: string) => string` — An edit event's path as git names it: relative to the workspace folder, with forward slashes (extension.ts passes its relForGit over the chat folder).

**Returns:** `ChatPanelHost` — THE TURN'S DIFF STATE. The host makes one object for each turn it starts, in that turn's beforeRun after governor.beginTurn, when governor.sectionsActive() is true. It holds the session, a key made once (the host's clock in milliseconds in base 36 and a counter), the sid of each section, the held paths and whether it has ended. Only the sink of that turn (the onEvent and onTerminal that runTurn passes to turns.start) uses it. A turn with no such object, and every followed turn (followLiveTurn, the other caller of appendEvent), writes and posts every row as today and asks for no check, whatever the governor holds. ROWS. Rows are only ever pushed. showSections, for the diff state that is open: 'add' pushes a role:'diff' row with sid = the key plus the section id, unique in the transcript; 'update' pushes a role:'diff' row with the new content and replaces: <that sid>; 'withdraw' pushes a role:'diff' row with replaces, withdrawn:true and no lines. An overflow pushes a marker row with the edit marker class and the text '<n> more changed sections in <m> files are not shown'. sectionsUnreadable pushes a marker row 'The changes of this turn could not be read'. Each such row, a diff row or a marker row, is posted as { type:'transcript-row', rowIndex, row } while the panel is not disposed and that session is the one shown. HELD PATHS. While its diff state is open, the turn's sink: on a 'file-edit' event writes no marker row and posts nothing, and holds the path; on a 'tool-result' event with editPath and without isError writes no row and posts nothing; on a 'tool-result' event with editPath and isError pushes and posts the held path's marker row (through 'transcript-row') and then the result row as today. A held path is settled after the check that follows the end of its edit: for a 'file-edit' event with applied:true (codex) the check asked for at that event, for a claude edit the check asked for at its successful result. Settling pushes and posts the path's marker row (the row appendEvent writes for a 'file-edit' event today) when governor.sectionPaths() does not contain relPath(path), and nothing otherwise. governor.check() is called after every 'file-edit' and every 'tool-result' event of that sink and is never awaited by the turn loop. ENDING. The diff state is ended once, by whichever comes first: (a) the turn's onTerminal: governor.resolveTurn() runs the last check, then every path still held is settled and the session is saved; (b) any other way the turn stops reporting to its sink: the host ends the open diff state before each call of turns.detach() (a chat switch, the panel closing, adopt) and of turns.stop(), in the sink's onError, and at the top of the next turn's beforeRun before governor.beginTurn. In (b) every held path is settled at once against governor.sectionPaths() as it stands, the session is saved and governor.abandonTurn() is called. After the diff state has ended, a result of a check still in flight is dropped (nothing is pushed or posted) and any later event of that sink is written as today.

**Postconditions:**
- An edit seen while a diff state is open ends as at least one of: a widget for its path, its path's marker row, or its error row, on every way the turn can stop reporting
- No diff state and no snapshot outlives its turn's sink: both are ended at the turn's end, a detach, a stop, an error or the next turn's start
- The 'edit-prompt' message is removed from the protocol, and the shell's renderDiff function and the seven .insrc-diff-* rules are removed; the widget's root keeps the class insrc-term-diff
- The 'edit-decision' message, governor.decide, followLiveTurn and the turn lifecycle are left as they are
- The transcript element's children do not shrink: the shell carries `#insrc-term>*{flex-shrink:0;}`

### 2.4 `pageBefore`

```typescript
pageBefore(transcript: readonly TranscriptEntry[], before: number, pageRows?: number): TranscriptPage  // unchanged signature; latestWindow calls it
```

**Parameters:**
- `transcript: readonly TranscriptEntry[]` — The whole transcript of the session.
- `before: number` — The absolute index the page ends before.
- `pageRows: number` _(optional)_ — The page length; PAGE_ROWS when left out.

**Returns:** `TranscriptPage` — The same run of rows as today, with one change: a role:'diff' row that has a sid and no `replaces` is given with the content of the last row anywhere later in the transcript whose `replaces` equals that sid (keeping the first row's sid and leaving `replaces` out), when such a row exists. A row that has `replaces` is given as it is. The match is on the id, never on position. Both callers get this: 'session-restored' through latestWindow and 'transcript-page' through pageBefore.

**Postconditions:**
- firstIndex and the number of rows are what they are today
- The transcript is not changed

### 2.5 `toViewModel`

```typescript
toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel  // RowViewModel.kind gains 'diff'
```

**Parameters:**
- `entry: TranscriptEntry | TurnEvent` — A saved row or a live event.

**Returns:** `RowViewModel` — A role:'diff' row maps to { kind:'diff', text: row.path, collapsible:false, meta:{ the row's fields } }, in the host function and in its webview mirror. A tool-result view-model is collapsible only when its output is long by the registry's isLong rule (more than 3 lines or 240 characters); a short output is drawn plain with no chevron. The registry registers a 'diff' renderer that, like the other saved kinds, builds its node through line() so it is appended on the live path, on restore and on an older page, and remembers the node under the row's sid. A row with `replaces` or `withdrawn` draws nothing and appends nothing. Otherwise the node is the widget of docs/mocks/chat-diff-widget.html, with the root class insrc-term-diff: a header (chevron, edit glyph, path cut at the front, 'new file' / 'deleted' / 'binary file' when it applies, +added and −removed), then one line per diff line with its line number (the old number for a removed line, the new number otherwise), sign and text; the first 8 lines show, and a 'show N more lines' / 'show less' button and the header toggle the rest; a section of 8 lines or fewer has no chevron and no button; a row with omitted > 0 ends with '<omitted> more lines not saved' when open; a binary row shows 'binary file changed'. The registry also returns redrawDiff(row): it finds the widget remembered under row.replaces, rebuilds its content from the row, keeps it open if it was open, hides it when the row is withdrawn, and does nothing when no widget is remembered under that id. The remembered widgets are forgotten when the registry's keys are reset and when the pager drops their nodes.

**Postconditions:**
- The host toViewModel and the webview mirror give the same view-model for a diff row (the existing parity test covers the new kind)
- The diff renderer writes text with textContent only and names only the shell's theme names

## 3. Data model changes

### 3.1 `DiffSection (new, vscode-plugin/src/chat/diff-sections.ts)` — new

One section of one file's diff: { path: string; oldStart: number; oldLines: number; newStart: number; newLines: number; added: number; removed: number; lines: string[]; omitted?: number; binary?: true; fileState?: 'new' | 'deleted' }. The module is pure and exports: MAX_SECTION_LINES = 400, MAX_NEW_SECTIONS_PER_CHECK = 20, COLLAPSED_LINES = 8; parsePatch(patch: string): DiffSection[] (one entry per @@ section; a file with a 'Binary files' line gives one entry with binary:true and no lines; the path is read from the '+++ b/' line, or the '--- a/' line for a deleted file, or the 'diff --git' line for a binary file, with a trailing tab dropped and a quoted name unquoted; lines beyond 400 are dropped and counted in omitted while added and removed count the whole section; a '\ No newline at end of file' line is kept and counted as neither); SectionOp = { op:'add'; id: number; section: DiffSection } | { op:'update'; id: number; section: DiffSection } | { op:'withdraw'; id: number }; KnownSection = { id: number; section: DiffSection; shown: boolean }; reconcileSections(known: readonly KnownSection[], next: readonly DiffSection[], nextId: number, limit?: number): { ops: SectionOp[]; known: KnownSection[]; nextId: number; overflow: { sections: number; files: number } | undefined }. Matching: within one path, a next section takes the lowest-id known section not yet taken whose old-line range overlaps its own (range = oldStart to oldStart + max(oldLines, 1) - 1; a binary section matches the path's binary section); equal content gives no operation, different content gives 'update'; a known section taken by no next section gives 'withdraw' and is dropped; a next section that takes none gives 'add' until the limit is reached in this call, after which it is kept as known with shown:false and counted in overflow. A known section with shown:false never produces an operation.

**Call sites:**
- `vscode-plugin/src/chat/edit-governor.ts`

### 3.2 `TranscriptEntry` — field-add

A new variant: { role:'diff'; sid?: string; replaces?: string; path; oldStart; oldLines; newStart; newLines; added; removed; lines: readonly string[]; omitted?: number; binary?: true; fileState?: 'new' | 'deleted'; withdrawn?: true; at: string }. The first row of a section carries sid, unique in the transcript; a later version of the section carries replaces with that sid and no sid of its own, and is never drawn at its own place. The link does not use row positions, which the file store does not keep stable when another window appends to the same session. Rows are only pushed, as the file store requires; session-file-store.ts and session-store.ts need no change beyond the type. Existing variants and saved sessions are unchanged.

```
+ | { readonly role: 'diff'; readonly sid?: string; readonly replaces?: string; readonly path: string; readonly oldStart: number; readonly oldLines: number; readonly newStart: number; readonly newLines: number; readonly added: number; readonly removed: number; readonly lines: readonly string[]; readonly omitted?: number; readonly binary?: true; readonly fileState?: 'new' | 'deleted'; readonly withdrawn?: true; readonly at: string }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/session-file-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/transcript-window.ts`
- `vscode-plugin/src/chat/transcript-pager.ts`

### 3.3 `TurnEvent 'tool-result' and 'file-edit', and the adapter's mappers` — field-add

Live-only optional fields, none saved. On 'tool-result': editPath?: string (the file_path of the claude Edit or Write call this result answers; the adapter remembers those tool_use ids as it remembers commands) and isError?: boolean (true when the claude tool_result block has is_error true). On 'file-edit': applied?: true, set by the codex mapper, whose event is emitted when the change is done; the claude mapper leaves it out because its event is emitted when the call is made. The codex mapper changes with it: a completed file_change item emits one 'file-edit' event per entry of item.changes, with that entry's path; an item with no changes list but with a path emits one event with it; an item with neither emits one event with the path '(unknown)' as today. CLAUDE_EDIT_TOOLS stays Edit and Write: a call of any other tool keeps its tool-call row and its result row, and what it changed shows as widgets after the check that follows its result.

```
tool-result: + readonly editPath?: string; + readonly isError?: boolean;
file-edit:   + readonly applied?: true;
```

**Call sites:**
- `vscode-plugin/src/chat/stream-events.ts`
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.4 `HostToWebview message set` — field-modify

'edit-prompt' is removed and { type:'transcript-row'; rowIndex: number; row: TranscriptEntry } is added; the invariant that every host message kind is listed in the protocol's kind list stays, with 'transcript-row' in place of 'edit-prompt'. It carries a row the host pushed outside the event path: a diff row, or a marker row (the overflow line, the unreadable line, a settled path line, the path line before a failed edit's error). The shell handles it inside pager.track(rowIndex, ...): for a role:'diff' row with `replaces` it calls reg.redrawDiff(row); for any other row it calls reg.renderRow(reg.toViewModel(row)), which appends the widget or the marker line through line(). A marker row drawn this way and the same row drawn on restore go through the same toViewModel mapping.

```
- | { type: 'edit-prompt'; path: string; diff: UnifiedDiff; review?: boolean }
+ | { type: 'transcript-row'; rowIndex: number; row: TranscriptEntry }
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/transcript-pager.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/show-each-changed-section-turn-s-E20261013b2e8109f/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The workspace folder is not inside a git repository** (recoverable)
  - Detection: baseline.available(cwd) returns false in beginTurn, so the turn has no snapshot handle, sectionsActive() is false and the host makes no diff state for the turn
  - Response: No check runs and no row is held back: the path line and the tool result row are written as today
  - User impact: No widgets; the reader sees what they see today
- **The snapshot fails at turn start (write-tree fails, git missing, the temporary directory is not writable)** (recoverable)
  - Detection: snapshot throws; the governor's safe wrapper logs it and leaves the handle undefined
  - Response: The turn runs as in a folder with no repository; the private index file, if one was made, is removed
  - User impact: No widgets for this turn; the path lines show as today
- **A check cannot read the changes (write-tree or diff fails, or the patch is larger than the runner's 64 MB buffer)** (recoverable)
  - Detection: baseline.changes returns undefined
  - Response: The governor logs a warning and calls render.sectionsUnreadable() the first time in the turn; later checks still run and can succeed. Known sections are kept. A path held for that check is settled as usual, so its path line is written when it has no section
  - User impact: One line 'The changes of this turn could not be read' and the path lines of the edits; widgets already drawn stay
- **The patch has a part the parser does not understand** (recoverable)
  - Detection: parsePatch meets a line that is not a file header, a section header or a diff line where one is expected
  - Response: The parser skips to the next 'diff --git' line and keeps every section it read; it never throws
  - User impact: The unreadable file has no widget; if it was edited by an edit tool its path line shows; the others show
- **The turn is detached in mid-turn: the reader switches chat, closes the panel, or the host adopts another session** (recoverable)
  - Detection: The host is about to call turns.detach() and a diff state is open
  - Response: Before the call the host ends the diff state: every held path is settled at once against governor.sectionPaths(), the session is saved (the lifecycle's detach saves it again with the cursor) and governor.abandonTurn() releases the snapshot. The lifecycle then stops calling the sink without onTerminal, as today
  - User impact: The widgets drawn so far stay. A file whose edit was pending shows its path line. When the reader comes back, the rest of the turn is followed and shows path lines and result rows as today, with no widgets
- **The turn is stopped with the Stop control** (recoverable)
  - Detection: The host is about to call turns.stop() and a diff state is open
  - Response: The diff state is ended as for a detach. If the lifecycle then calls onTerminal, the diff state has already ended and onTerminal writes and saves as today
  - User impact: The widgets drawn so far stay; a pending edit shows its path line
- **A newer turn starts while an older one has not reached its end (the newest message wins)** (recoverable)
  - Detection: The newer turn's beforeRun finds a diff state still open
  - Response: It ends that diff state as for a detach, before governor.beginTurn takes the new snapshot. The lifecycle no longer calls the older sink
  - User impact: The older turn's widgets stay and its pending edits show their path lines, before the new turn's rows
- **The turn's sink or the adapter throws** (recoverable)
  - Detection: The lifecycle calls the sink's onError instead of onTerminal
  - Response: onError ends the open diff state as for a detach, then posts the error as today
  - User impact: The error shows as today; pending edits show their path lines
- **A check is still running when its diff state is ended** (recoverable)
  - Detection: abandonTurn cleared the governor's turn, so the check finds the turn it captured is no longer current; the host also sees the diff state is ended
  - Response: The check calls nothing on the render seam; nothing is pushed or posted
  - User impact: None; the held paths were settled when the diff state ended
- **A followed turn runs while the governor still holds an older snapshot** (recoverable)
  - Detection: followLiveTurn has no diff state: the holding rules are reached only through the sink of a turn the host started
  - Response: The followed turn's rows are written and posted as today and no check is asked for
  - User impact: Path lines and result rows as today
- **An edit tool call fails (claude reports is_error)** (recoverable)
  - Detection: The tool-result event carries editPath and isError true
  - Response: The host pushes and posts the held path's marker row, then the result row with the error text
  - User impact: The reader sees the path and the error, as today
- **A claude edit never gets a result before the turn ends** (recoverable)
  - Detection: The path is still held when the diff state is ended, by onTerminal after the last check or by any other exit
  - Response: Every held path is settled then: a path with no section gets its marker row
  - User impact: The path line shows, as today
- **A codex file_change item names no file (no changes list and no path)** (recoverable)
  - Detection: The mapper finds neither item.changes nor item.path
  - Response: One 'file-edit' event with the path '(unknown)', as today; when settled it has no section, so its marker row '(unknown)' is written
  - User impact: The line '(unknown)' shows as it does today, beside whatever widgets the check found
- **The 'diff' renderer throws on a malformed saved row** (recoverable)
  - Detection: The registry's renderRow catches a renderer's exception
  - Response: The row is drawn by the fallback renderer, as for any other renderer that throws
  - User impact: One plain line in place of one widget
- **A row's `replaces` names an id that no first row carries (a damaged file, or the first row is missing)** (recoverable)
  - Detection: pageBefore finds no role:'diff' row with that sid to substitute into; redrawDiff finds no widget remembered under it
  - Response: The row is ignored and draws nothing
  - User impact: None
- **The private index file cannot be removed** (recoverable)
  - Detection: removeFile rejects inside release
  - Response: The governor logs a warning; the next turn uses a new path
  - User impact: None; a small file is left in the temporary directory

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two edits far apart in one file | Two sections, two widgets for the same path |
| A second edit next to an earlier one, so git joins them into one section | The earlier widget is updated in place; no second widget. A new row with `replaces` is saved |
| A later edit joins two shown sections into one | The lower-id widget is updated with the joined section and the other is withdrawn |
| The assistant undoes a change it made earlier in the turn | The section's widget is hidden; a row with `replaces` and withdrawn:true is saved, and after a reload the widget is not drawn |
| A section changes five times in a turn | One first row and five rows with `replaces`; the widget shows the fifth, live and after a reload |
| Another window appends rows to the same chat while the turn runs | This window's rows land later in the file than in its memory; the link by sid still joins each section's versions after a reload |
| A turn in another chat starts while a detached turn is still changing files | The new turn's snapshot is the working tree at its own start; what the detached turn changes after that shows as the new turn's widgets, because the comparison cannot tell who wrote a change |
| The window is reloaded in mid-turn | The host that held the diff state is gone; the new host follows the turn and writes path lines and result rows as today. The widgets saved before the reload are drawn from their rows |
| A new file | One widget marked 'new file' with every line added; 8 lines show until opened |
| A deleted file | One widget marked 'deleted' with every line removed, cut to 400 saved lines with the rest counted |
| A binary file is added or changed | One widget with 'binary file' in the header and 'binary file changed' as its body; a later change to the same file causes no new widget |
| A file changed by a shell command (no file-edit event) | Its sections appear after the command's result, for claude and for codex |
| A codex patch that changes two files | Two 'file-edit' events, one per file, each with applied; both paths are held and settled after the check, so each file shows widgets or its path line |
| An edit tool changes a file that git ignores, or a file outside the workspace folder | No widget; the path's marker row is written when its edit is settled, so the edit leaves a trace |
| A shell command changes a file that git ignores | No widget and no path line, as today; the command row and its output show |
| A claude tool other than Edit and Write changes a file | Its tool row and result row show as today, and the changed sections show as widgets after the check |
| A file that was untracked when the turn started is changed | A widget showing only the turn's change, because the snapshot tree holds the file |
| A file was already modified before the turn and is not touched by it | No widget: the snapshot is the working tree, not the last commit |
| The user edits a file by hand while the turn runs | The change is shown as part of the turn; the comparison cannot tell who wrote it |
| One check finds 35 new sections | 20 widgets and one line '15 more changed sections in N files are not shown', which shows at once; those 15 stay hidden in later checks, and an edit of one of their files writes no path line because the path has a known section |
| A section of 3 lines | A widget with no chevron and no 'show more' button |
| A section of 900 lines | The row saves 400 lines and omitted 500; the header counts all added and removed lines; opened, it ends with '500 more lines not saved' |
| A replacement arrives for a widget the pager has trimmed from the view | Nothing changes on screen; when that page is loaded again the host gives the latest version at the first row's place |
| An older page is loaded whose diff rows were replaced by rows in a later page | pageBefore looks through the rest of the transcript, so the page shows the latest versions |
| A widget the reader opened is updated | It stays open with the new content |
| A path with spaces or non-ASCII characters | The path is shown as it is on disk |
| A tool result of one short line | Drawn plain with no chevron |
| insrc.chat.diffView is 'editor' | No diff state and no widgets; the editor diff opens on a file-edit event and the rows are written as today |
| Tool results arrive faster than checks finish | At most one check runs and one waits; the waiting one sees every change made up to its start |
| A repository with no commit yet, or with no index file | The copy step reports false and git creates the private index; the snapshot and the checks work |
| A chat saved before this change is opened | It loads and draws as before; it has no diff rows |

**Invariants to preserve**

- The governor only observes: it never blocks or delays the CLI's write, and the turn loop never waits for git [[c1]]
- The user's own index and working tree are not changed by a snapshot or a check [[c7]]
- git is reached only through the injected runGit, so the baseline is tested with a fake [[c2]]
- A session's transcript is only ever pushed to: no row is removed, inserted or rewritten, so the file store's append-only save writes every row [[c14]]
- Nothing saved depends on a row's position in the file, because another window's rows can come before this window's new rows [[c20]]
- The turn lifecycle is not changed: a detached, superseded or failed turn still gets no onTerminal, and a followed turn still has only onEvent and onEnd; the host ends its own diff state at those points [[c23]]
- A followed turn writes and posts the same rows as today [[c24]]
- A renderer of a saved kind builds its node through line(), so the live path, the restore handler and the pager's older-page path all append it [[c15]]
- A row that is drawn live is drawn the same way on restore: both go through toViewModel [[c5]]
- The host toViewModel and its webview mirror give the same view-model for the same input [[c5]]
- A turn with no editGovernance deps, or with diffView 'editor', writes and posts the same rows as today, and the turn-event path and markerFor are not changed [[c21]]
- Every edit an edit tool makes leaves a trace in the chat, on every way a turn can stop reporting [[c3]]
- The webview writes text with textContent, uses only the shell's theme names and follows the strict content security policy [[c5]]
- baseline.read still returns the turn-start content of a tracked file and of a file that was untracked at the start, and undefined for a file the turn created [[c2]]
- pageBefore returns the same firstIndex and row count for the same transcript and arguments [[c16]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run with tsx (vscode-plugin: npx tsx --test); webview source is run against the fake DOM in __tests__/fake-dom`

**Test levels**

- **contract** — The acceptance criteria this Story is measured by. The Story came with none, so they are taken from the user's decisions of 2026-10-13 and are to be confirmed by the user when the design is approved: ac1 every changed section of the turn's git diff is a widget, for claude and codex, for edit tools and shell commands; ac2 a widget shows 8 lines until opened, with path, added and removed counts, line numbers and theme colours; ac3 a section that changes updates its widget in place and one that disappears is withdrawn; ac4 widgets are saved with the chat, cut to 400 lines, and show in their latest form after a reload and on older pages; ac5 widgets replace the path line and the successful edit result line, while a failed edit shows its path and error, an edit with no section shows its path line on every way a turn can end, and no repository, the editor view and a followed turn behave as today; ac6 at most 20 new widgets per check with a one-line count of the rest shown at once, and ignored files are left out; ac7 the widget is not shrunk by the transcript column and a short tool output has no chevron. The message contract is pinned by the protocol test (__tests__/protocol.test.ts, the kind lists at lines 90 and 116).
  - Subjects: `protocol: transcript-row is a host message and edit-prompt is not`
- **unit** — The pure patch parser and the reconciliation rule (new file __tests__/diff-sections.test.ts)
  - Subjects: `parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file`, `parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name`, `parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section`, `parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw`, `reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id`, `reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn`, `reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later`
- **unit** — The git baseline over a fake runGit (__tests__/git-baseline.test.ts; its four existing tests are replaced by these)
  - Subjects: `git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path`, `git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails`, `git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree`, `git-baseline: release removes the private index, and a failed git add does not fail snapshot`
  - Fixtures: `a fake runGit that records args and env and answers from a script`
- **unit** — The governor over fake baseline and render seams (__tests__/edit-governor.test.ts). The three tests that rely on observe tracking a review edit (lines 88, 108, 121) are kept and run in the editor view, where observe still tracks; the editor-view test (156), the stale-decision test and the cross-turn test are kept; the tests of showChat and defaultComputeDiff are removed
  - Subjects: `governor: check passes the reconciled operations to showSections and calls nothing when nothing changed`, `governor: checks run one at a time, a call made during a check causes exactly one more, and its promise resolves after that one`, `governor: an unreadable check calls sectionsUnreadable once per turn and a later check still shows sections`, `governor: sectionPaths holds the path of every known section, shown or hidden, and is empty after beginTurn`, `governor: no snapshot or the editor view means sectionsActive is false and check does nothing; in the chat view observe does nothing`, `governor: a check that ends after a newer turn began shows nothing, and resolveTurn runs a last check then releases the snapshot`, `governor: abandonTurn makes sectionsActive false at once, releases the snapshot without a last check, and a check in flight shows nothing`
- **unit** — The adapter's mappers, the window cut, the view-model, the wiring and the theme rules
  - Subjects: `claude adapter: the result of an Edit or Write call carries editPath, and isError when the block reports an error; a command's result carries neither`, `codex adapter: a file_change item emits one applied file-edit event per changed file, one for a bare path, and '(unknown)' when it names none; a claude edit's event has no applied`, `transcript window: a diff row is given with the content of the last later row that replaces its sid, wherever those rows sit; a withdrawn one as withdrawn; a row with replaces as it is; firstIndex and the row count do not change`, `toViewModel: a diff row maps to the diff kind in the host and in the webview mirror`, `chat wiring: the governance deps carry relPath and no computeDiff, and git is run with the given environment (__tests__/extension-chat-wiring.test.ts; replaces the assertion on `computeDiff: defaultComputeDiff` at line 89)`, `chat theme: the transcript's children do not shrink, the diff widget's rules name only the shell's theme names, and the .insrc-term-diff rule still out-ranks the shared sheet (__tests__/chat-theme.test.ts; replaces the three has() lines on .insrc-diff-add, .insrc-diff-del and .insrc-diff-actions button, and the seven .insrc-diff-* selectors leave chat-theme-before.json while the widget's selectors join the test's list of added selectors)`
- **unit** — The widget, the row message and the tool-result row, run against the fake DOM (__tests__/render-registry.test.ts, __tests__/chat-shell.test.ts and __tests__/transcript-pager.test.ts)
  - Subjects: `diff widget: header, line numbers, signs and classes are drawn from a diff row; 8 lines show until the header or the button is used`, `diff widget: 8 lines or fewer has no chevron and no button; a binary row, a new file, a deleted file and an omitted count are labelled; a row with replaces or withdrawn appends nothing`, `transcript-row: a diff row without replaces appends a widget stamped with its row index; one with replaces redraws the widget of that sid and keeps it open; a withdrawn one hides it; one for an unknown or trimmed sid changes nothing`, `transcript-row: a marker row appends the same line a restored marker row draws`, `diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget`, `tool result: a short output is drawn with no chevron and a long one folds`
- **integration** — The host with a scripted adapter and a fake governance seam (__tests__/chat-panel.test.ts; the S006 edit-prompt cases at 825-1011 and the renderDiff source assertions at 967, 3538 and 3548 are replaced by these)
  - Subjects: `diff sections: an added section is pushed as a diff row with a sid and posted as transcript-row with its row index; an update and a withdraw are pushed as rows that name that sid, and no earlier row is changed`, `diff sections: while the diff state is open the file-edit marker and the successful edit result write no row, and a failed edit pushes and posts the path marker then the error row`, `diff sections: an edit whose path has no section after its check gets its path marker, posted as transcript-row, for a claude result, for a codex applied file-edit and at the end of the turn; an edit whose path has a section gets none`, `diff sections: a check is requested after every tool-result and file-edit event and once more at the end of the turn, and the session is saved after late rows`, `diff sections: overflow and unreadable push one marker row each and post it as transcript-row`, `diff sections: with no snapshot, or with the editor view, no diff state is made and the rows and messages are those of today`, `diff sections: a chat switch in mid-turn settles the held paths, saves, abandons the governor's turn before the detach, and a check in flight then pushes and posts nothing`, `diff sections: the Stop control, a newer turn's start, a sink error and closing the panel each end the open diff state and settle its held paths`, `diff sections: a followed turn writes and posts its rows as today and asks for no check, also while the governor still holds a snapshot`, `diff sections: the restored window and an older page carry each section's latest version at its first row's place`
- **integration** — The saved form through the store the extension uses (__tests__/session-file-store.test.ts)
  - Subjects: `session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place`
  - Fixtures: `the fake file seam the file store's tests use`
- **integration** — The baseline against real git in a temporary repository (new file __tests__/git-baseline.integration.test.ts; skipped when git is not installed)
  - Subjects: `git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged`
  - Fixtures: `a temporary git repository made and removed by the test`
- **live** — The assumptions about the two CLIs' streams (live-cli.test.ts, behind the existing live flag)
  - Subjects: `live claude: an Edit of a file in a temporary repository yields a tool-result with editPath and the baseline's changes hold the edited section`, `live codex: a patch of two files in a temporary repository yields two applied file-edit events with those files' paths`
  - Fixtures: `the claude and codex CLIs installed and signed in`, `a temporary git repository`
- **smoke** — The whole path in the real editor and the whole suite
  - Subjects: `By hand in VS Code: a claude turn and a codex turn that each change two places in one file, change one of them again and add a file show one widget per section, folded to 8 lines, with the changed one updated in place, and the widgets show in their latest form after a window reload`, `The whole plugin suite passes apart from the two manifest-catalog tests that fail before this change`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file`, `git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged`, `diff sections: an added section is pushed as a diff row with a sid and posted as transcript-row with its row index; an update and a withdraw are pushed as rows that name that sid, and no earlier row is changed`, `diff sections: a check is requested after every tool-result and file-edit event and once more at the end of the turn, and the session is saved after late rows` |
| `ac2` | `diff widget: header, line numbers, signs and classes are drawn from a diff row; 8 lines show until the header or the button is used`, `diff widget: 8 lines or fewer has no chevron and no button; a binary row, a new file, a deleted file and an omitted count are labelled; a row with replaces or withdrawn appends nothing` |
| `ac3` | `reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id`, `reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn`, `transcript-row: a diff row without replaces appends a widget stamped with its row index; one with replaces redraws the widget of that sid and keeps it open; a withdrawn one hides it; one for an unknown or trimmed sid changes nothing`, `session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place` |
| `ac4` | `session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place`, `transcript window: a diff row is given with the content of the last later row that replaces its sid, wherever those rows sit; a withdrawn one as withdrawn; a row with replaces as it is; firstIndex and the row count do not change`, `diff sections: the restored window and an older page carry each section's latest version at its first row's place`, `diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget`, `parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section` |
| `ac5` | `claude adapter: the result of an Edit or Write call carries editPath, and isError when the block reports an error; a command's result carries neither`, `codex adapter: a file_change item emits one applied file-edit event per changed file, one for a bare path, and '(unknown)' when it names none; a claude edit's event has no applied`, `diff sections: while the diff state is open the file-edit marker and the successful edit result write no row, and a failed edit pushes and posts the path marker then the error row`, `diff sections: an edit whose path has no section after its check gets its path marker, posted as transcript-row, for a claude result, for a codex applied file-edit and at the end of the turn; an edit whose path has a section gets none`, `diff sections: a chat switch in mid-turn settles the held paths, saves, abandons the governor's turn before the detach, and a check in flight then pushes and posts nothing`, `diff sections: the Stop control, a newer turn's start, a sink error and closing the panel each end the open diff state and settle its held paths`, `diff sections: a followed turn writes and posts its rows as today and asks for no check, also while the governor still holds a snapshot`, `diff sections: with no snapshot, or with the editor view, no diff state is made and the rows and messages are those of today`, `governor: abandonTurn makes sectionsActive false at once, releases the snapshot without a last check, and a check in flight shows nothing` |
| `ac6` | `reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later`, `diff sections: overflow and unreadable push one marker row each and post it as transcript-row`, `transcript-row: a marker row appends the same line a restored marker row draws`, `git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged` |
| `ac7` | `chat theme: the transcript's children do not shrink, the diff widget's rules name only the shell's theme names, and the .insrc-term-diff rule still out-ranks the shared sheet (__tests__/chat-theme.test.ts; replaces the three has() lines on .insrc-diff-add, .insrc-diff-del and .insrc-diff-actions button, and the seven .insrc-diff-* selectors leave chat-theme-before.json while the widget's selectors join the test's list of added selectors)`, `tool result: a short output is drawn with no chevron and a long one folds` |

## 7. Migration

**State before:** On a 'file-edit' event the governor compares the whole file with its turn-start content in process (defaultComputeDiff, one section covering the file) and the host posts 'edit-prompt'; the shell draws a .insrc-term-diff box that the transcript's flex column shrinks to nothing, and nothing is saved. The reader sees the path's marker row and, for claude, a 'file has been updated' result row with a chevron that changes nothing. A change made by a shell command causes no 'file-edit' event and no diff, and a codex patch shows the path '(unknown)'. The snapshot is `git stash create` plus the text of untracked files. The file store appends rows and never rewrites one. A turn that is detached, superseded or fails gets no onTerminal, and a followed turn has its own event path (s1 bundles: symbol.locate, the two search.text bundles on events and on the turn lifecycle, data-model.trace, probe).

**State after:** The snapshot is a git tree written through a private copy of the index. For each turn the host starts in a git folder with the chat view on, it keeps one diff state: after every tool result and file-edit event, and once at the turn's end, the governor asks git for the patch between the snapshot tree and the working tree; the host pushes each new section as a role:'diff' row with a section id and each change or withdrawal as a further row that names that id, and posts every such row as 'transcript-row'. The path marker and the successful edit result row are held back while the diff state is open, and a held path with no section is written after its check. The diff state is ended at the turn's end, a detach, a stop, an error or the next turn's start, settling its held paths and releasing the snapshot. A followed turn writes its rows as today. The window the host cuts carries each section's latest version at its first row's place, and the shell draws it as a folded widget, live, on reload and on older pages. The codex mapper reports each file a patch changed. 'edit-prompt', renderDiff, the .insrc-diff-* rules and defaultComputeDiff are gone.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add diff-sections.ts (parser, reconciliation, limits) with its tests; nothing uses it yet — ↩ rollbackable
2. Change the git baseline to the tree snapshot, add changes and release, and pass the environment argument and the file helpers from extension.ts; read keeps its results — ↩ rollbackable
3. Add editPath and isError to the claude mapper's tool-result events; make the codex mapper emit one applied file-edit event per changed file — ↩ rollbackable
4. Add the role:'diff' row with sid, replaces and withdrawn, the substitution by sid in pageBefore, the 'diff' view-model and renderer with redrawDiff, the 'transcript-row' message and the shell's handling of it; fold tool results only when long; add the no-shrink rule — ↩ rollbackable
5. Give the governor sectionsActive, check, sectionPaths and abandonTurn and limit observe to the editor view; add the host's per-turn diff state with pushed rows, held paths and its ending on every exit; pass relPath from extension.ts; remove 'edit-prompt', renderDiff, the .insrc-diff-* rules, showChat and defaultComputeDiff together with the assertions that pin them — ↩ rollbackable
6. Rebuild and reinstall the plugin, then check by hand in VS Code with claude and with codex, including a window reload — ↩ rollbackable

**Backward compat:** No public API changes; everything is inside the plugin. A chat saved before the change has no diff rows and loads and draws as before. The store's files keep their format: diff rows are ordinary lines of the rows file. A chat saved after the change and opened by an older plugin build draws each diff row through the fallback renderer as an empty line, because a row with an unknown role has no text. The insrc.chat.diffView setting keeps its meaning. The turn lifecycle and the follow path are not changed.

## 8. Alternatives considered

### 8.1 a1: Git tree diff, appended rows linked by a section id, widget state owned by the started turn — **CHOSEN**

Compare two git trees written through a private index, save each section as a pushed transcript row with an id and each later version as a row naming that id, and keep the widget state in one object per turn the host starts, ended on every way that turn stops reporting.

The baseline snapshots by copying the index and running `git add -A` and `git write-tree` against the copy; a check writes a second tree and returns `git diff --no-renames -U3 --relative <start> <now>`. A pure module parses the patch and reconciles sections by path and old-line range. The host only pushes rows: a new section is a role:'diff' row with a sid, a later version a row with `replaces: <sid>`; the window cut gives the latest version at the first row's place. Rows the host writes outside the event path reach the webview as 'transcript-row'. The host makes one object for each turn it starts; holding back a path line, asking for checks and applying their results all go through that object. The object is ended when the turn ends, is detached, is superseded by a newer turn, errors, or the panel closes: held paths are settled at once, later results are dropped and the snapshot is released. A followed turn has no such object and writes its rows as today.

### 8.2 a2: As a1, but widgets continue through a followed turn

Keep the snapshot alive across a detach and let followLiveTurn pick the widget state up again.

The per-turn object is kept when the turn is detached and is found again, by session and turn id, when the host follows that turn; the follow path then holds paths, asks for checks and applies results as the live path does, and ends the object at onEnd. The object is still ended when a newer turn begins.

**Rejected because:** Better after a chat switch, but a larger build with a second holding path and state that outlives its sink; it can follow as its own change.

### 8.3 a3: As a1, but holding depends on the governor's state

The second revision's shape: the host asks governor.sectionsActive() on every event and ends nothing explicitly.

Rows are held back whenever the governor has a snapshot and the chat view is on, on every caller of appendEvent; held paths are settled by the check after their result or by the last check in onTerminal.

**Rejected because:** Less host state, but it loses path lines on every exit path other than the normal end.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/edit-governor.ts:94-195` — "export function createEditGovernor(deps: EditGovernorDeps): EditGovernor {"
- **[[c2]]** `code` `vscode-plugin/src/chat/git-baseline.ts:17-66` — "runGit: (cwd: string, args: string[]) => Promise<{ ok: boolean; stdout: string }>;"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:1103-1119` — "if (governor !== undefined && ev.kind === 'file-edit') governor.observe(ev.path).catch((err: unknown) => warnGovernor('observe', err));"
- **[[c4]]** `code` `vscode-plugin/src/chat/session-store.ts:31-71` — "export type TranscriptEntry ="
- **[[c5]]** `code` `vscode-plugin/src/chat/render-registry.ts:106-181` — "return { kind: 'tool-result', text: entry.command ?? '', collapsible: true, meta: { command: entry.command, output: entry.output } };"
- **[[c6]]** `code` `vscode-plugin/src/chat/__tests__/edit-governor.test.ts:75` — "test('S006 governor: beginTurn snapshots; auto observe renders visualize-only (review:false) + no tracking', async () => {"
- **[[c7]]** `step-output` `s1 probe bundle: tree snapshot through a private index (git 2.53.0) and a real codex file_change item (codex-cli 0.162.1), both run by hand on 2026-10-13` — "left the real index and `git status` unchanged"
- **[[c8]]** `doc` `docs/mocks/chat-diff-widget.html` — "var LIMIT = 8; // diff lines shown before the widget is expanded"
- **[[c9]]** `stakeholder` `User decisions in chat, 2026-10-13` — "actually for both, claudde and codex, a per file git diff might be enough. each diff section displayed as a widget. this way 2 different builds aren't required"
- **[[c10]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:595-640` — "if (CLAUDE_EDIT_TOOLS.has(toolName) && typeof input['file_path'] === 'string') {"
- **[[c11]]** `code` `vscode-plugin/src/chat/chat-panel.ts:732` — ".insrc-term-diff{border:1px solid var(--border-lit);border-radius:6px;margin:6px 0;overflow:hidden;background:var(--panel);color:var(--fg);}"
- **[[c12]]** `code` `vscode-plugin/src/chat/transcript-pager.ts:70-96` — "function track(rowIndex,fn){var from=term.children.length;try{return fn();}finally{stamp(from,rowIndex);if(!rendering&&following())toBottom();trimIfNeeded();}}"
- **[[c13]]** `code` `vscode-plugin/src/extension.ts:479-497` — "nodeExecFile('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {"
- **[[c14]]** `code` `vscode-plugin/src/chat/session-file-store.ts:17` — "the transcript is only ever pushed to"
- **[[c15]]** `code` `vscode-plugin/src/chat/render-registry.ts:523` — "via line() so it self-appends"
- **[[c16]]** `code` `vscode-plugin/src/chat/transcript-window.ts:45` — "export function pageBefore(transcript: readonly TranscriptEntry[], before: number, pageRows: number = PAGE_ROWS): TranscriptPage {"
- **[[c17]]** `code` `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts:89` — "assert.match(b, /computeDiff:\s*defaultComputeDiff/, 'injects the graph-free computeDiff');"
- **[[c18]]** `code` `vscode-plugin/src/chat/__tests__/chat-theme.test.ts:333` — "assert.deepEqual(before.selectors.filter((s) => !now.has(s)), [], 'no selector was removed or renamed');"
- **[[c19]]** `code` `vscode-plugin/src/chat/session-file-store.ts:344` — "if (fresh.length > 0) fs.appendText(p.rows, rowLines(fresh));"
- **[[c20]]** `code` `vscode-plugin/src/chat/session-file-store.ts:337` — "A rows file longer than this store left it: another writer appended."
- **[[c21]]** `code` `vscode-plugin/src/chat/chat-panel.ts:921` — "const mk=markerFor(ev);if(mk)reg.renderRow({kind:'fallback',text:mk.label,cssClass:mk.cssClass});"
- **[[c22]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:729` — "const path = typeof item['path'] === 'string' ? (item['path'] as string) : '(unknown)';"
- **[[c23]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:79` — "A chat switch, the panel closing, or adopt(): stop reading the live turn."
- **[[c24]]** `code` `vscode-plugin/src/chat/chat-panel.ts:504` — "const followLiveTurn = (s: ChatSession): void => {"
- **[[c25]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:309` — "if (detached) break;"

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 3 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T08:26:55.515Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | The acceptance criteria ac1-ac7 restate the user's decisions of 2026-10-13 (c9), with nothing added and nothing left out. | The only artifact for this story is .insrc/artifacts/LLD-b2e8109f42afc0dd-S001.json (Glob of .insrc/artifacts/*b2e8109f* returns nothing else): there is no SPEC or DEF, and the chat of 2026-10-13 is not in the repository. The design itself says the Story came with no criteria and that they are 'to be confirmed by the user when the design is approved'. Only the mock and two commit messages could be compared. | At approval, have the user confirm ac1-ac7 and the stated limit (after a chat switch, panel close or reload the rest of the turn shows path lines, not widgets). |
| new-versus-reuse | A completed codex file_change item carries a `changes` list with one entry per changed file, each with a path. | The repository holds no sample of a real codex file_change item: `file_change` occurs only in cli-adapter.ts:728 and in a comment of edit-governor.ts, and no test fixture carries a `changes` field. The mapper today reads only `item['path']` (cli-adapter.ts:729). The design rests this on a probe run by hand (c7), which I cannot repeat here. | Keep the planned live test ('live codex: a patch of two files ... yields two applied file-edit events') and add a recorded real item as a unit fixture so the shape is pinned without the live flag. Also decide whether an item whose status is failed should carry `applied`. |
| error-paths | The git commands behave as the design says: `git add -A` and `git write-tree` with GIT_INDEX_FILE on a copy leave the user's index and status untouched, `git diff --relative <tree> <tree>` gives cwd-relative paths, and `git show <tree>:./<rel>` reads from a tree id. | I have no shell in this review, so I could not run git. The design rests this on a probe by hand with git 2.53.0 (c7). The code only confirms the surrounding facts: git runs with `-C cwd` (extension.ts:481), so a relative path printed by `rev-parse --git-path index` is relative to cwd, and read already uses the `<ref>:./<rel>` form (git-baseline.ts:59). | Keep the planned real-git integration test (git-baseline.integration.test.ts) as a required check of the build, and include a linked worktree and a repository with core.splitIndex in it, since both change where the index lives. |
