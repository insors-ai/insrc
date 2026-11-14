<!-- insrc:artifact LLD-4642d49ab0593787-s1 -->

# LLD: STORY-4642d49ab0593787-s1 — VS Code plugin scratchpads: ~/.insrc/scratches store, chat-input scratchpad button with recent/new/browse-all menu, tabular browse webview, Send-to-chat on text selection

## Summary

**Epic:** `vs-code-plugin-scratchpads-insrc-scratches`
**HLD base run:** `wf-1794551362794-fdm5ky`
**HLD effective hash:** `4642d49ab059...`

This story adds scratchpads to the VS Code chat: a scratchpad icon button next to the attach button opens a menu with recent scratchpads, a New scratchpad item and a Browse all item. Browse all opens a tabular editor pane (name, date, icon-only open/delete) over the scratchpads stored as plain markdown files in ~/.insrc/scratches. Opening a scratchpad shows its content in an editor pane where selecting text reveals a floating "Send to chat" button that drops the selection into the chat input (never auto-sends). No daemon IPC is added. Acceptance criteria: ac1 = scratchpads are stored as plain .md files under ~/.insrc/scratches via the vscode-free store (list/create/read/delete); ac2 = an icon-only scratchpad button next to the attach button opens a popup with the 5 most recent entries + New scratchpad + Browse all; ac3 = Browse all opens a single-instance tabular editor pane (Name, Modified, icon-only Open/Delete per row); ac4 = opening a scratchpad shows a document pane where selecting text reveals a floating icon-only Send-to-chat button that inserts the selection into #insrc-input and focuses it (never auto-sends); ac5 = every new button is icon-only with a title hover text. Editing existing scratchpad content inside the plugin is OUT OF SCOPE for this increment (the document view is read-only; content is created via New and edited as a plain file outside the plugin; re-opening a scratchpad re-reads the file, so externally edited content is picked up on the next open). Round-3 review corrections: link()-only publication with post-link unlink-failure semantics defined; O_NOFOLLOW fd-based reads; send-to-chat reveals the chat and awaits its ready handshake; the popup menu itself is now depicted in the UX mock; delete invalidates pending opens of the deleted id; browse-all fetches an unbounded list.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [UX](#9-ux)
10. [References](#10-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** public

### 2.1 `createScratchStore`

```typescript
function createScratchStore(deps: ScratchStoreDeps): ScratchStore
```

**Parameters:**
- `deps: { root: string; fs?: ScratchFs; now?: () => Date; logger?: Logger }` — Deps-injected root (+ optional fs/clock/logger); fs is OPTIONAL and defaults to the node adapter (nodeScratchFs) when omitted — the exact optional-fs + node-default pattern of createAttachmentStore (vscode-plugin/src/chat/attachment-store.ts, wired at extension.ts:635), so production wiring can pass only { root, logger } (root = join(PATHS.insrc, 'scratches'), PATHS.insrc = join(homedir(), '.insrc') per src/shared/paths.ts:4-8)

**Returns:** `ScratchStore` — Store handle exposing list/create/read/delete; vscode-free so fake-dom/fake-fs tests can drive it

**Errors:**
- `ScratchStoreError` when root path is not a directory or mkdir fails (EACCES/ENOSPC)
- `ScratchRefused` when id must match ^[A-Za-z0-9][A-Za-z0-9._-]*\.md$ AND must not be '.' or '..' AND resolve (via path.resolve) to a path strictly inside the store root AND lstat must report a regular file (symlinks are refused, not followed); any violation -> ScratchRefused before ANY fs call beyond the lstat

**Preconditions:**
- deps.root is an absolute path under ~/.insrc

**Postconditions:**
- Store is ready; the scratches root exists or is created lazily on first write
- No daemon IPC is involved — pure filesystem

### 2.2 `listScratches`

```typescript
function listScratches(limit?: number): Promise<ScratchEntry[]>
```

**Parameters:**
- `limit?: number | undefined` _(optional)_ — Cap the returned list (the popup menu passes 5 for recents); OMIT for the unbounded full list — browse-all calls listScratches() with no limit so no entry is ever omitted

**Returns:** `ScratchEntry[]` — Metadata for every ~/.insrc/scratches/*.md file

**Errors:**
- `returns [] (empty list, not an error)` when readdir ENOENT (no scratches dir yet)
- `ScratchStoreError` when readdir EACCES/other

**Preconditions:**
- Store created via createScratchStore

**Postconditions:**
- Entries are sorted by mtime descending (most recent first)
- Each entry carries id, name, mtime and size; ids are the file basenames

### 2.3 `createScratch`

```typescript
function createScratch(title: string, body?: string): Promise<ScratchEntry>
```

**Parameters:**
- `title: string` — Human title for the new scratchpad; slugified into the file name
- `body?: string | undefined` _(optional)_ — Initial content; omitted = a short starter line inviting notes

**Returns:** `Promise<ScratchEntry>` — The created entry's metadata

**Errors:**
- `ScratchStoreError` when write EACCES/ENOSPC or no free collision name within the ladder

**Preconditions:**
- title is a non-empty string

**Postconditions:**
- A new file <yyyymmdd-hhmmss>-<slug>.md exists under the root (collision suffixes -2, -3, ... chosen by probing lstat for non-existence)
- Publication is exclusive and cross-process safe: the temp file gets a unique name (pid + random suffix, not matching *.md), and the final link(oldpath, newpath) + unlink(temp) pair is atomic no-clobber (Node link() fails with EEXIST when the destination exists — unlike rename, which replaces it); on EEXIST the next suffix (-2, -3, ...) is probed and the pair retried, so a concurrent create in another VS Code window can never replace an existing scratchpad and both complete contents survive; any failure BEFORE the link() is a failed create with no scratchpad created (temp best-effort removed); link() itself is the single atomic publication point — once it succeeds the scratchpad EXISTS and the create is a success, so a subsequent unlink(temp) failure is non-fatal: the orphaned temp name does not match *.md, is invisible to listScratches, and is best-effort cleaned on the next create; the documented failure is never returned after publication, and a retry in that window cannot double-create because the EEXIST suffix ladder covers it
- Content is written to the temp file first (never a partial .md visible); publication is the link(oldpath, newpath) + unlink(temp) pair ONLY — rename is never used anywhere in the store, because rename would replace a destination created after the existence probe; link() is the sole atomic no-clobber publication primitive (EEXIST -> next suffix)
- The new entry appears at the head of listScratches unless an existing entry has a strictly later mtime (e.g. a future-dated file) or an equal-mtime tie resolved by id ascending

### 2.4 `readScratch`

```typescript
function readScratch(id: string): Promise<{ entry: ScratchEntry; content: string }>
```

**Parameters:**
- `id: string` — File basename of the scratchpad to open in the document view

**Returns:** `Promise<{ entry: ScratchEntry; content: string }>` — Full text content plus entry metadata

**Errors:**
- `ScratchRefused` when id must match ^[A-Za-z0-9][A-Za-z0-9._-]*\.md$ AND must not be '.' or '..' AND resolve (via path.resolve) to a path strictly inside the store root AND the file is opened with open(path, O_RDONLY | O_NOFOLLOW) and fstat on that fd must report a regular file — a no-follow open, so a symlink swapped in after any earlier check still yields ELOOP -> ScratchRefused and is never followed; any violation -> ScratchRefused before ANY read beyond that open/fstat
- `ScratchNotFound` when the no-follow open rejects ENOENT (file missing before open) OR a read on that fd rejects ENOENT (file deleted between open and read) — both map to ScratchNotFound; the single fd is the source of truth, so validation and read cannot observe different files

**Preconditions:**
- Store created; id passes the filename validation (see errors) before any fs call

**Postconditions:**
- The full markdown content is returned for rendering
- Content is rendered via textContent/escapeHtml only — CSP invariant kept
- The document panel tracks a monotonically increasing openGeneration per scratch-open request; when the async read resolves, the host applies it only if its generation matches the panel’s current generation (a stale read is dropped). Title/content/selection state are replaced atomically; deleting id X closes the panel only if it currently displays X AND invalidates every still-pending open of X: each scratch-open captures its openGeneration at click time and deleteScratch bumps that scratchpad's epoch, so an in-flight readScratch(X) that resolves late finds a generation mismatch and its render is dropped — not merely a panel-close guard; a stale ScratchNotFound for another id is ignored; disposing the panel invalidates its generation check

### 2.5 `deleteScratch`

```typescript
function deleteScratch(id: string): Promise<void>
```

**Parameters:**
- `id: string` — File basename to delete from the browse table row or the document view

**Returns:** `Promise<void>` — Void

**Errors:**
- `ScratchRefused` when id must match ^[A-Za-z0-9][A-Za-z0-9._-]*\.md$ AND must not be '.' or '..' AND resolve (via path.resolve) to a path strictly inside the store root AND lstat must report a regular file (symlinks are refused, not followed); any violation -> ScratchRefused before ANY fs call beyond the lstat
- `treated as success (delete is idempotent: missing file at any checkpoint resolves successfully and refreshes the table / closes the panel only if it displays that id)` when lstat reports ENOENT (already deleted before validation) OR unlink rejects with ENOENT (deleted between lstat and unlink)

**Preconditions:**
- Store created; id passes the filename validation (see errors) before any fs call; delete uses lstat-confirmed regular files only and unlink (never recursive rm), so a symlink or directory named *.md can never be removed

**Postconditions:**
- The file is gone (or was already gone) and drops out of listScratches
- Deleting the currently open document closes that panel

### 2.6 `chat host message handlers (switch on payload.type, chat-panel.ts:3566 pattern)`

```typescript
handleChatMessage(msg: WebviewToHostMessage): Promise<void>
```

**Parameters:**
- `msg: WebviewToHostMessage | HostToWebviewMessage` — Webview→host messages 'scratch-open-menu' | 'scratch-new' (TITLELESS intent — the host acquires the title itself) | 'scratch-open' {id} | 'scratch-delete' {id} | 'scratch-browse' | 'send-to-chat' {text}; host→webview 'scratch-list' {entries} | 'insert-into-input' {text} — each added to its OWN direction's union and const list (WEBVIEW_TO_HOST_TYPES :403 / HOST_TO_WEBVIEW_TYPES :378), exhaustiveness + direction isolation asserted in protocol.test.ts

**Returns:** `void` — Side effects on panels + webviews; no return value

**Errors:**
- `ignored (never throws — postMessage failures are swallowed per extension.ts:465-468 pattern)` when unknown payload.type in the host switch
- `no-op (cancelled)` when title prompt cancelled or empty after trim -> no createScratch call; menu re-renders with the unchanged list

**Preconditions:**
- Chat panel is alive; scratch store is wired in extension.ts next to :635

**Postconditions:**
- 'scratch-open-menu' replies with 'scratch-list' of the top 5
- 'scratch-new' (titleless) → host prompts for a title via the injected prompt-for-title boundary (window.showInputBox, extension.ts:606, fake in tests), then createScratch(title), replies 'scratch-list', opens the document view
- 'scratch-open' opens/creates-or-reveals the insrc.scratchpad document panel
- 'scratch-delete' deletes then refreshes any open browse table
- 'scratch-browse' opens/creates-or-reveals the insrc.scratchpads table panel
- 'send-to-chat' first REVEALS the chat panel (panel.reveal() — the chat does not retain its page while hidden and its readiness handshake discards covered tabs, so a hidden chat cannot reliably receive the insertion), waits for the chat webview's ready handshake before posting, then pushes 'insert-into-input' {text} to the chat webview; if the chat panel was disposed meanwhile the message is dropped silently (same swallow pattern); text must be a string; it is truncated multibyte-safe so the final string INCLUDING the trailing '…' stays within 65,536 UTF-8 bytes
- title handoff is concrete: the webview sends titleless 'scratch-new'; ONLY the host asks the user (injected showInputBox boundary); cancel/empty-after-trim = no createScratch call and the menu re-renders with the unchanged list. The title is validated at runtime too (must be a string) alongside ids/texts
- on any store failure the host replies 'scratch-list' { entries: [], error: '<reason>' } — an explicit optional error field (attachments-pending pattern), distinct from a successful empty list

### 2.7 `scratch webview panels via the injected PanelFactory (extension.ts:447)`

```typescript
panels({ viewType: ScratchViewType, title: string }): PanelHandle | undefined
```

**Parameters:**
- `viewType: ScratchViewType` — 'insrc.scratchpads' | 'insrc.scratchpad' — insrc.scratchpads = browse-all tabular editor-pane view (columns Name, Modified; per-row icon-only Open/Delete buttons with title hover text + data-id); insrc.scratchpad = singleton single-document view with a selectionchange listener
- `title: string` — Panel title at creation (scratchpad name for the document view); the handle ALSO exposes setTitle(title) so a cached singleton can replace the editor tab title

**Returns:** `PanelHandle | undefined` — A live PanelHandle (setHtml/reveal/setTitle/onDidDispose/onMessage/postMessage/dispose) — setTitle is an injected title-update operation with a production adapter calling the underlying WebviewPanel title setter (the stock PanelHandle at panels/types.ts:134-135 has none). A new vscode-free scratch-panels controller wraps the factory with its own create-or-reveal singleton cache per viewType (mirroring the private openSingleton in panels/webview-host.ts:214); undefined + panelLog warning on creation failure

**Errors:**
- `undefined returned + logged via panelLog (never throws; the handler degrades to a VS Code notification)` when panels factory throws (editor API failure)

**Preconditions:**
- Panels factory injected at extension.ts:447; the shared CSP+nonce shell (shellHtml, webview-host.ts:635) is extracted to panels/shell.ts (or re-exported) so the scratch panels get the identical shell

**Postconditions:**
- Browse table rows post scratch-open {id} / scratch-delete {id}; the document view posts send-to-chat {text} from its floating button on non-empty selection
- Both viewTypes are single-instance create-or-reveal; onDidDispose clears the cached handle so the next open creates fresh. Switching the insrc.scratchpad singleton from A to B calls setTitle(B) + setHtml on the SAME cached panel, so the editor tab title updates together with content and selection state

### 2.8 `floating Send-to-chat button (document view bootstrap)`

```typescript
onSelectionChange(sel: Selection): void
```

**Parameters:**
- `sel: Selection` — window.getSelection() on selectionchange inside the insrc.scratchpad document view; button is icon-only with title="Send to chat"

**Returns:** `void` — UI side effect only

**Errors:**
- `floating button stays hidden` when selection empty or collapsed

**Preconditions:**
- Document view is open and has focus

**Postconditions:**
- A floating icon-only button (title="Send to chat") appears near the selection and posts { type: 'send-to-chat', text } with the captured selection text (captured at selectionchange, before the click, so focus/selectionchange cannot lose it)
- Host pushes 'insert-into-input' to the chat webview, which applies ONE deterministic insertion rule to the editable textarea #insrc-input (chat-panel.ts:2784; #insrc-prompt at :2783 is the send/stop span and is NEVER an insertion target): the text is spliced in at the caret position, REPLACING any active selection range; if the caret is at the very end of the value (or selection info is unavailable) it appends with a single separating newline when the current value is non-empty; all other existing content is preserved; then focuses #insrc-input; the turn is NEVER auto-sent

## 3. Data model changes

### 3.1 `ScratchEntry / scratchpad file under ~/.insrc/scratches` — new

ScratchEntry { id, name, mtime, size } — metadata for one ~/.insrc/scratches/<yyyymmdd-hhmmss>-<slug>.md file. id = file basename; validated as a *.md filename that is not '.'/'..' and resolves strictly inside the store root, with lstat confirming a regular file (symlinks refused), before any fs call. Stored as plain markdown files; no daemon store, no LMDB/Lance row. Entries are enumerated by readdir + lstat (ENOENT → []), symlinks and non-files skipped, sorted by mtime desc (size in bytes, mtime in ms since epoch, ties broken by id ascending for deterministic order), optionally limited (menu top 5). Name-after-restart policy: the file basename retains only the slug, not the original title, so after a restart ScratchEntry.name is reconstructed from the id (the <yyyymmdd-hhmmss>-<slug> basename) — the original showInputBox title is not persisted.

**Call sites:**
- `vscode-plugin/src/extension.ts:635`
- `vscode-plugin/src/extension.ts:636`
- `src/shared/paths.ts:4`
- `src/shared/paths.ts:8`

### 3.2 `Webview↔host protocol messages (protocol.ts)` — new

Eight new message types added to the webview→host and host→webview unions, each to its OWN direction's const array only: webview→host 'scratch-open-menu', 'scratch-new' (titleless intent; the host acquires the title via the injected showInputBox boundary), 'scratch-open' {id}, 'scratch-delete' {id}, 'scratch-browse', 'send-to-chat' {text} go in WEBVIEW_TO_HOST_TYPES (protocol.ts:403); host→webview 'scratch-list' {entries, error?}, 'insert-into-input' {text} go in HOST_TO_WEBVIEW_TYPES (:378). Payload field names are part of the contract; ids/texts/titles must be strings at runtime (non-string payloads are rejected by the host switch). protocol.test.ts gains direction-isolation assertions: each new type appears in its own array and NOT in the other's, and the unions cover the arrays exactly.

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts:346`
- `vscode-plugin/src/chat/protocol.ts:378`
- `vscode-plugin/src/chat/protocol.ts:403`
- `vscode-plugin/src/chat/__tests__/protocol.test.ts`

### 3.3 `Chat status-bar UI: scratchpad button + popup menu + input insertion` — new

Chat webview DOM additions: a sibling icon-only button #insrc-scratch (class attachbtn, inline SVG, title="scratchpads") directly next to #insrc-attach (:2796); a dropdown #insrc-scratchmenu reusing the .popup.chatmenu / .item pattern of #insrc-histmenu (:2766, opens upward :2289, rows :2296) whose items are recent entries + "New scratchpad" + "Browse all"; one bootstrap listener (:2465-2486 pattern) posting 'scratch-open-menu'; the host 'insert-into-input' handler inserts text into #insrc-input (:2784) and focuses it — #insrc-prompt (:2783) is the send/stop span and is NEVER an insertion target. Attach flow (.attachbar :2787, 'pick-attachments' :3566) untouched.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:2796`
- `vscode-plugin/src/chat/chat-panel.ts:2766`
- `vscode-plugin/src/chat/chat-panel.ts:2289`
- `vscode-plugin/src/chat/chat-panel.ts:2296`
- `vscode-plugin/src/chat/chat-panel.ts:2465`
- `vscode-plugin/src/chat/chat-panel.ts:2486`
- `vscode-plugin/src/chat/chat-panel.ts:3566`
- `vscode-plugin/src/chat/chat-panel.ts:2783`

### 3.4 `Scratchpad webview panel viewTypes` — new

Two new webview viewTypes through the existing injected PanelFactory: 'insrc.scratchpads' (browse-all tabular editor-pane view: columns Name and Modified, per-row icon-only Open/Delete buttons with title hover text and data-id) and 'insrc.scratchpad' (single-document view rendering scratch content via textContent only, with the selectionchange → floating icon-only "Send to chat" button). Both keep the shared CSP+nonce shell (extracted to panels/shell.ts) and create-or-reveal single-instance lifecycle owned by a NEW vscode-free scratch-panels controller (panels/scratch-panels.ts) wrapping the injected PanelFactory; the controller exposes setTitle on its handle, and the singleton document view calls setTitle + setHtml on the same panel when switching scratchpads. The insrc.scratchpad document view is a SINGLETON panel with a generation counter: opening B while A is displayed bumps the generation, replaces title+content+selection state on render, and discards a late-resolving read of A; ScratchNotFound closes the panel only when the failing id is the one currently displayed.

**Call sites:**
- `vscode-plugin/src/extension.ts:447`
- `vscode-plugin/src/panels/webview-host.ts:162`
- `vscode-plugin/src/panels/types.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/sequence-diagram.html)
- [Component dependencies](docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/component-dependency.html)

## 5. Error paths

**Error cases**

- **~/.insrc/scratches cannot be created or written (read-only home, disk full, permissions)** (recoverable)
  - Detection: fs.mkdir/readdir/writeFile rejects with code EACCES, ENOSPC, EROFS, or the root is not a directory
  - Response: createScratchStore/list/create surface ScratchStoreError; the host handler catches, logs via panelLog and replies 'scratch-list' { entries: [], error: 'scratchpads unavailable: <reason>' } — a typed error distinct from a successful empty list (optional error field, attachments-pending pattern); the menu renders the error row and still offers Browse all, which shows an error row; a later successful scratch-open-menu re-renders the real list (recovery by retry)
  - User impact: Scratchpads cannot be listed/created; the attach flow and chat itself keep working (failure is contained to the scratch features)
- **Malicious or malformed id in a webview message (path traversal ../, separators, metacharacters)** (recoverable)
  - Detection: id fails the ^[A-Za-z0-9._-]+$ check before any fs call
  - Response: readScratch/deleteScratch throw ScratchRefused; host logs and ignores the message — no filesystem access happens
  - User impact: No impact; the attempt is refused and logged
- **Opening or deleting a scratchpad whose file was deleted out-of-band while the menu/table was showing** (recoverable)
  - Detection: lstat or readFile on the id rejects with ENOENT
  - Response: readScratch maps ENOENT (at lstat or readFile) to ScratchNotFound; deleteScratch maps ENOENT (at lstat or unlink) to success; the host closes the document panel ONLY if it currently displays that id, and refreshes the browse table so the stale row disappears. There is no file watcher: an already-rendered document stays open until the next interaction (narrowed guarantee — external deletion is detected on read, not observed live)
  - User impact: Stale menu/table row resolves on next interaction; no crash
- **Crash or EACCES/ENOSPC between temp write and rename during createScratch** (recoverable)
  - Detection: writeFile of the temp file or the rename fails mid-create
  - Response: ScratchStoreError surfaces to the host; the temp file is best-effort removed; no partial .md file is left visible (temp name does not match the *.md listing filter)
  - User impact: No scratchpad is created; user can retry from the menu
- **Corrupt or permission-restricted entries inside ~/.insrc/scratches** (recoverable)
  - Detection: readdir succeeds but a stat on an entry rejects, or an entry is a directory named *.md
  - Response: listScratches skips entries whose stat fails or that are not files; a fully unreadable dir (non-ENOENT error) surfaces ScratchStoreError and the menu shows the unavailable row
  - User impact: List degrades to the readable entries instead of failing wholesale
- **Browse-all or document webview panel cannot be created** (recoverable)
  - Detection: panels.create throws or the webview fails to load
  - Response: Handler never throws (extension.ts:465-468 swallow pattern); error is logged via panelLog and surfaced as a VS Code notification only
  - User impact: Click does nothing visible except a logged/notification error; chat stays usable
- **send-to-chat posted after the chat webview was closed or reloaded** (recoverable)
  - Detection: postMessage to a disposed webview (chat panel closed while scratchpad document posts send-to-chat)
  - Response: The swallow pattern at extension.ts:465-468 discards the post; no error propagates
  - User impact: Nothing is inserted; the selection is simply not delivered that once

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No ~/.insrc/scratches directory exists yet (fresh install) — readdir ENOENT | listScratches returns [] — the menu shows only "New scratchpad" + "Browse all", and Browse all shows an empty table with a hint row |
| Two scratchpads created within the same second from the same title (yyyymmdd-hhmmss-slug collision) | File name gets a -2 (then -3, ...) suffix and the entry is created without error |
| Title containing unicode, spaces, slashes or other non-slug characters | createScratch slugifies the title (lowercase, spaces to dashes, non [a-z0-9-] dropped) so the generated id always matches ^[A-Za-z0-9._-]+$; an all-symbol title falls back to 'scratch' |
| A file in ~/.insrc/scratches disappears between readdir and stat | The entry is skipped from the list (not a crash); an entry whose stat fails is dropped rather than failing the whole list |
| Directory contains unrelated files (e.g. .DS_Store, a leftover .tmp) | Non-.md files in the scratches dir are ignored by listScratches; the temp file from an interrupted write is ignored (its name does not end in .md) |
| User selects more than 64 KiB of text in the scratchpad document view | send-to-chat is accepted up to 64 KiB; larger selections are truncated so the FINAL inserted string including the trailing ellipsis stays within 65,536 UTF-8 bytes, and still inserted |
| A webview-to-host scratch-open/scratch-delete payload carries an id with path separators or shell metacharacters (../, ;, spaces) | readScratch/deleteScratch refuse before touching the filesystem (ScratchRefused); the host handler logs and ignores the message |
| User double-clicks Delete on the same browse-table row | Deleting an already-deleted id resolves successfully — ENOENT at lstat or at unlink is success (idempotent delete); the browse table just re-renders without the row |
| The scratchpad file backing an open insrc.scratchpad document view is deleted (from the browse table or the filesystem) | A subsequent store operation (list/read/delete) detects the external deletion at its own lstat and resolves ScratchNotFound (the panel closes only if it displays that id) or drops the row from the browse table; no watcher closes the panel live, and selecting/sending already-rendered text does NOT re-read the file — the guarantee is narrowed to the next store operation |
| Chat input #insrc-input already contains unsent text (caret mid-draft or an active selection range) when insert-into-input arrives | insert-into-input splices the text at the caret of #insrc-input — replacing an active range selection; appending with one separating newline only when the caret is at the end and the draft is non-empty — and focuses #insrc-input; the turn is NOT sent |
| User clicks into the document without selecting any text (collapsed selection) and selectionchange fires | The floating button stays hidden; nothing is posted |

**Invariants to preserve**

- The attach flow is untouched: #insrc-attach button, .attachbar, and the 'pick-attachments' host case at chat-panel.ts:3566 keep their exact behavior; the scratchpad button is a sibling, not a modification. [[c1]]
- Webview CSP invariant: scratch content is rendered via textContent/escapeHtml only — never innerHTML with user content; new panels reuse the CSP+nonce shell from createWebviewPanelHost (panels/webview-host.ts:162). [[c1]]
- Protocol exhaustiveness: every new message type appears in the protocol.ts union of its OWN direction AND in that direction's const array ONLY (host→webview types in HOST_TO_WEBVIEW_TYPES :378, webview→host types in WEBVIEW_TO_HOST_TYPES :403); protocol.test.ts asserts exhaustiveness, direction isolation (each new type in its own array and NOT the other's) and that each union covers its const array exactly. [[c2]]
- Store pattern: the scratch store stays vscode-free and deps-injected (ScratchFs interface + node impl) exactly like attachment-store.ts, so tests drive it with fakes; root comes from PATHS.insrc (src/shared/paths.ts:4-8), never a hard-coded path. [[c3]]
- Send-to-chat never auto-sends a turn: insert-into-input only inserts text into #insrc-input (:2784) and focuses it; the user presses send. [[c1]]
- Plain files, no daemon IPC: scratchpads are .md files under ~/.insrc/scratches only; no LMDB/Lance/daemon socket usage is introduced. [[c4]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict via npx tsx --test (repo convention; vscode-plugin suites run with the default node, daemon suites need node 22 on PATH)`

**Test levels**

- **unit** — Prove the vscode-free store contract: list/create/read/delete over ~/.insrc/scratches, sorting, slug naming, collision suffixes, temp+rename writes, id validation, ENOENT→[] / idempotent delete, error mapping (ScratchRefused/ScratchNotFound/ScratchStoreError)
  - Subjects: `vscode-plugin/src/chat/scratch-store.ts (new)`, `vscode-plugin/src/chat/__tests__/scratch-store.test.ts (new)`, `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts (new)`, `refusal tests: ids '.', '..', traversal strings, symlinks and directories named *.md cause ScratchRefused with ZERO fs mutation calls (the fake fs records calls)`, `concurrent-create test using TWO INDEPENDENT store instances over the SAME real (tmp) directory with filesystem-faithful link/rename semantics: racing creates on the same basename both succeed with distinct files and both complete contents survive (exclusive publication via link()+unlink, EEXIST retry of the suffix ladder)`, `ENOENT tests: absence before lstat and disappearance between lstat and the final read/unlink`
  - Fixtures: `fake-scratch-fs.ts (in-memory ScratchFs, mirrors fake-attachment-fs.ts)`, `fixed clock injected via deps.now for deterministic yyyymmdd-hhmmss names`
- **integration** — Prove the wiring: protocol type exhaustiveness, chat webview button+menu markup and bootstrap posts, host switch cases for all six webview→host messages and both host→webview pushes, panel create-or-reveal for both viewTypes, insert-into-input behavior on #insrc-input, and the floating Send-to-chat button on selection in the document view
  - Subjects: `vscode-plugin/src/chat/protocol.ts (extended)`, `vscode-plugin/src/chat/chat-panel.ts (button, menu, bootstrap, host cases)`, `vscode-plugin/src/chat/__tests__/protocol.test.ts (exhaustiveness + direction isolation + union/array equality)`, `vscode-plugin/src/chat/__tests__/chat-panel.test.ts (button/menu/insert-into-input)`, `vscode-plugin/src/chat/__tests__/scratch-panel.test.ts (new: browse table + document view + floating button)`, `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts (store root wiring next to extension.ts:635)`, `vscode-plugin/src/extension.ts (createScratchStore wiring + handler registration)`, `chat-panel.test.ts insert-into-input targets #insrc-input (existing textarea content preserved; no submit-turn/cancel-turn posted)`, `scratch-new title acquisition end-to-end (prompt cancelled -> no create + unchanged list; prompt answered -> create + list refresh + document open)`, `scratch-list error field renders the unavailable row and a later success recovers`, `scratch-panel.test.ts A->B document switching asserting setTitle(B) on the SAME panel instance (tab title updated) alongside content, with reversed read completion`, `stale ENOENT, deleting a non-displayed document, generation guard`, `closing/reopening the document panel during an outstanding read (dispose invalidates the generation, late read dropped)`, `panels-factory failure returns undefined + logged notification and the next click retries; existing CSP/nonce tests preserved when the shell is extracted to panels/shell.ts`, `selection-to-button click preserving the captured selection across focus/selectionchange`, `UTF-8 cap: final inserted string incl. ellipsis within 65,536 bytes, with a multibyte boundary case`
  - Fixtures: `fake-dom.ts (existing)`, `a fake panels factory recording create() calls by viewType/title`
- **smoke** — Smoke the real extension host path only if a display/VS Code test harness is available; otherwise covered by the integration fake-dom suite. No live LLM or daemon calls — the feature adds zero daemon IPC
  - Subjects: `manual/optional smoke: click scratchpad button in the chat status bar, create a scratchpad, browse all, select text, Send to chat`
  - Fixtures: `none — no live daemon or network is touched; scratchpads are plain files`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `scratch-store.test.ts: listScratches returns entries sorted by mtime desc with id/name/mtime/size`, `scratch-store.test.ts: createScratch writes <yyyymmdd-hhmmss>-<slug>.md via temp+rename and it appears at list head`, `extension-chat-wiring.test.ts: extension.ts constructs createScratchStore with root join(PATHS.insrc, 'scratches')` |
| `ac2` | `chat-panel.test.ts: #insrc-scratch sibling button with class attachbtn + inline SVG + title exists next to #insrc-attach`, `chat-panel.test.ts: #insrc-scratchmenu .popup.chatmenu renders recent items + New scratchpad + Browse all from a scratch-list push`, `chat-panel.test.ts: bootstrap click on #insrc-scratch posts {type:'scratch-open-menu'}` |
| `ac3` | `scratch-panel.test.ts: browse viewType insrc.scratchpads renders a table with Name and Modified columns`, `scratch-panel.test.ts: each row has icon-only Open/Delete buttons (title hover text, data-id) posting scratch-open/scratch-delete`, `scratch-panel.test.ts: empty list renders a hint row; create-or-reveal reuses a single panel instance` |
| `ac4` | `scratch-panel.test.ts: document viewType insrc.scratchpad renders content via textContent only`, `scratch-panel.test.ts: selectionchange with non-empty selection shows the floating icon-only Send-to-chat button (title) which posts send-to-chat {text}`, `chat-panel.test.ts: host insert-into-input handler inserts into #insrc-input (:2784) per the deterministic rule — caret mid-draft in a non-empty draft, and an active range selection replaced — and focuses it without sending` |
| `ac5` | `chat-panel.test.ts + scratch-panel.test.ts: every button in the new UI is icon-only with a title attribute (assert no visible text content on buttons)`, `protocol.test.ts: all eight new message types appear in their own direction's union + const array only, with direction-isolation and union/array-equality assertions passing` |

## 7. Migration

**State before:** Per s1 bundles (c1-c4): the chat status bar has only the attach button #insrc-attach (chat-panel.ts:2796) wired to 'pick-attachments' (host switch :3566); the only popup menu is #insrc-histmenu (.popup.chatmenu :2766, wiring :2532-2544); protocol.ts has no scratchpad messages (:346, :378, :403); extension.ts wires only chat-attachments (:635) and chat-sessions (:636) stores under PATHS.insrc (src/shared/paths.ts:4-8) and injects the panels factory at :447 whose core is createWebviewPanelHost (panels/webview-host.ts:162); there is no ~/.insrc/scratches usage anywhere and no scratchpad UI or protocol types exist.

**State after:** VS Code plugin ships scratchpads: plain markdown files under ~/.insrc/scratches (created lazily on first use) managed by a vscode-free scratch-store; the chat status bar shows an icon-only scratchpad button next to the attach button whose popup lists the 5 most recent scratchpads plus New scratchpad and Browse all; Browse all opens a single-instance tabular editor-pane webview (Name, Modified, icon-only Open/Delete per row); Open shows the scratchpad in a document webview where selecting text reveals a floating icon-only Send-to-chat button that inserts the selection into the chat input and focuses it (never auto-sends); all eight new protocol messages are additive to the existing unions and their own direction's type lists (direction-isolated); scratch-new is a titleless intent with the title acquired host-side via showInputBox; the singleton document panel updates its tab title via setTitle when switching scratchpads; no daemon IPC, no migration of existing data (the dir starts empty).

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the vscode-free scratch-store.ts module (ScratchFs interface + node impl, createScratchStore/listScratches/createScratch/readScratch/deleteScratch) with its unit tests and fake-scratch-fs.ts — new files only, no edits to existing modules — ↩ rollbackable
2. Extend protocol.ts: add the six webview→host types to the webview→host union + WEBVIEW_TO_HOST_TYPES (:403) and the two host→webview types to the host→webview union + HOST_TO_WEBVIEW_TYPES (:378) — each type in its own direction's array only; update protocol.test.ts expectations — additive only — ↩ rollbackable
3. Wire the store in extension.ts next to the createAttachmentStore call (~:635): createScratchStore({ root: join(PATHS.insrc, 'scratches'), logger: panelLog }) — fs omitted, node adapter default applies (mirrors attachment-store wiring) and register the six new host message handlers plus the insert-into-input push; no changes to existing handlers — ↩ rollbackable
4. Add the chat webview DOM + bootstrap in chat-panel.ts: sibling #insrc-scratch .attachbtn icon button next to #insrc-attach (:2796), #insrc-scratchmenu .popup.chatmenu with recent/New/Browse-all items, the click listener posting scratch-open-menu, and the insert-into-input handler targeting #insrc-input (:2784); CSS reuses existing .attachbtn/.popup/.item rules so only minimal new styles are added — ↩ rollbackable
5. Add the two webview viewTypes (insrc.scratchpads tabular browse view, insrc.scratchpad document view with floating Send-to-chat on selection) through the existing injected PanelFactory (extension.ts:447) with the shared CSP+nonce shell from panels/webview-host.ts:162; single-instance create-or-reveal per viewType — ↩ rollbackable
6. Create the scratches root lazily on first write (mkdir recursive inside createScratch); no pre-creation step needed, no existing directory is modified — ↩ rollbackable

**Backward compat:** Fully backward compatible: no existing public API, protocol message, store root, or package.json contribution is changed or removed. The webview→host and host→webview unions only gain new message types (additive); protocol.test.ts's exhaustiveness assertion is updated in the same change. The attach flow, chat-attachments store, and all existing webview panels are untouched. Older extension versions simply have no scratchpad button; no data exists to migrate because ~/.insrc/scratches starts empty.

## 8. Alternatives considered

### 8.1 a1: Chat-webview menu + dedicated scratchpad webview panels (all-in-plugin, plain files) — **CHOSEN**

Smallest fully-meeting shape: reuse the chat popup for the menu, new webview viewTypes for browse-all and the scratchpad document with floating Send-to-chat; storage via a new vscode-free scratch-store over ~/.insrc/scratches.

One new vscode-free module `vscode-plugin/src/chat/scratch-store.ts` (ScratchFs + node impl; list/create/read/delete over `~/.insrc/scratches/*.md` named `<yyyymmdd-hhmmss>-<slug>.md`), wired in extension.ts next to the attachment store as `join(PATHS.insrc, 'scratches')`. Chat webview: sibling `.attachbtn`-class icon button `#insrc-scratch` next to `#insrc-attach` opening the existing `.popup`/`.item` menu with recent items (top 5 by mtime), New, and Browse-all rows; new message types in protocol.ts. Browse-all = new webview panel viewType `insrc.scratchpads` and document = `insrc.scratchpad`, both owned by a new vscode-free scratch-panels controller (panels/scratch-panels.ts) wrapping the injected PanelFactory with a per-viewType create-or-reveal singleton cache and a setTitle operation, sharing the CSP+nonce shell extracted to panels/shell.ts; the browse table has name/date/icon-only open-delete rows. Opening a scratchpad = document viewType `insrc.scratchpad` with a floating Send-to-chat button on selection posting `send-to-chat`; host pushes `insert-into-input`; the chat webview inserts the text and focuses the input.

### 8.2 a2: Native QuickPick + text-document editor with command-based send-to-chat

Host-side QuickPick menu and a real text editor for scratchpads; selection send-to-chat via command rather than a floating webview button.

VS Code native `window.showQuickPick` for the menu (host-side), `window.createWebviewPanel` for the browse-all table, `vscode.window.showTextDocument` for opening a scratchpad (a real editor), Send-to-chat as a registered command on a status-bar affordance.

**Rejected because:** Rank 3: a native QuickPick moves the menu out of the requested in-panel location next to attach, and a real text document cannot show the required floating Send-to-chat button on selection — the defining interaction is violated.

### 8.3 a3: Sidebar tree view for browse-all + webview reader

Register a scratchpads TreeDataProvider in a sidebar; chat button opens recent/new; tree provides browse-all and open/delete.

Scratchpads as a sidebar tree view (`TreeDataProvider` over ~/.insrc/scratches); chat button only for new/recent; browse-all = the tree itself; open renders in a webview reader pane.

**Rejected because:** Rank 4: a sidebar TreeDataProvider is not the requested editor-pane tabular view with per-row icon-only open/delete buttons, and adds an unrequested package.json views contribution (L cost).

### 8.4 a4: Single-webview overlay for browse + view

Menu in chat webview; browse-all and scratchpad viewing as overlays within the same chat webview.

Chat-webview popup for the menu, but browse-all and single-scratchpad viewing rendered as overlay panes inside the SAME chat webview (no separate panel), with the Send-to-chat floating button inside that overlay.

**Rejected because:** Rank 2: an overlay inside the chat webview is not an editor-pane panel, and selection handling there collides with the existing in-chat selection-decision/edit-mode feature.

## 9. UX

- [UX mock](docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/ux-mock.html)

## 10. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2796` — "s1 analyze bundle c1 (chat webview status bar): the status bar already hosts the icon-only attach button at :2796 with .attachbtn class and inline SVG; a scratchpad button slots in as a sibling with t"
- **[[c2]]** `code` `vscode-plugin/src/chat/protocol.ts:346` — "s1 analyze bundle c2 (protocol): webview→host union at :346, HOST_TO_WEBVIEW_TYPES at :378, WEBVIEW_TO_HOST_TYPES at :403, const arrays asserted for exhaustiveness in protocol.test.ts — new scratchpad"
- **[[c3]]** `code` `vscode-plugin/src/extension.ts:635` — "s1 analyze bundle c3 (extension wiring): extension.ts:635 constructs createAttachmentStore({ root: join(PATHS.insrc, 'chat-attachments'), logger }); panels factory injected at extension.ts:447 via vsc"
- **[[c4]]** `code` `vscode-plugin/src/chat/attachment-store.ts:1` — "s1 analyze bundle c4 (store pattern + tests): attachment-store.ts is a vscode-free deps-injected module with an AttachmentFs interface and node impl; tests inject fake-attachment-fs.ts; chat-panel.tes"
- **[[c5]]** `code` `src/shared/paths.ts:4` — "PATHS.insrc is join(homedir(), '.insrc') — the scratches root derives from it, never a hard-coded path."
- **[[c6]]** `code` `vscode-plugin/src/panels/webview-host.ts:162` — "CSP+nonce shell and single-instance create-or-reveal lifecycle shared by all webview panels; the two new scratch viewTypes reuse it."
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/protocol.test.ts` — "Protocol type lists asserted exhaustively — each new message type must appear in its own direction's union and const array only; the tests also assert union/array equality."

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2796` — "s1 analyze bundle c1 (chat webview status bar): the status bar already hosts the icon-only attach button at :2796 with .attachbtn class and inline SVG; a scratchpad button slots in as a sibling with t"
- **[[c2]]** `code` `vscode-plugin/src/chat/protocol.ts:346` — "s1 analyze bundle c2 (protocol): webview→host union at :346, HOST_TO_WEBVIEW_TYPES at :378, WEBVIEW_TO_HOST_TYPES at :403, const arrays asserted for exhaustiveness in protocol.test.ts — new scratchpad"
- **[[c3]]** `code` `vscode-plugin/src/extension.ts:635` — "s1 analyze bundle c3 (extension wiring): extension.ts:635 constructs createAttachmentStore({ root: join(PATHS.insrc, 'chat-attachments'), logger }); panels factory injected at extension.ts:447 via vsc"
- **[[c4]]** `code` `vscode-plugin/src/chat/attachment-store.ts:1` — "s1 analyze bundle c4 (store pattern + tests): attachment-store.ts is a vscode-free deps-injected module with an AttachmentFs interface and node impl; tests inject fake-attachment-fs.ts; chat-panel.tes"
- **[[c5]]** `code` `src/shared/paths.ts:4` — "PATHS.insrc is join(homedir(), '.insrc') — the scratches root derives from it, never a hard-coded path."
- **[[c6]]** `code` `vscode-plugin/src/panels/webview-host.ts:162` — "CSP+nonce shell and single-instance create-or-reveal lifecycle shared by all webview panels; the two new scratch viewTypes reuse it."
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/protocol.test.ts` — "Protocol type lists asserted exhaustively — each new message type must appear in its own direction's union and const array only; the tests also assert union/array equality."
