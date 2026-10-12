<!-- insrc:artifact LLD-59da3204a44afd1b-S001 -->

# LLD: E2026101259da3204:S001

## Summary

**Epic:** `paste-images-attach-documents-dev-chat`
**HLD base run:** `wf-1791799586800-yoy6xq`
**HLD effective hash:** `b689b72d757c...`

In the dev chat you can paste an image into the prompt, or press an icon-only attach button under the prompt to pick documents. Each attachment appears as a removable chip before you send, travels with the message, and is shown on your message in the transcript, where a click opens it. The files are copied into a per-chat folder under ~/.insrc/chat-attachments and the assistant is given their paths and permission to read that folder only. This is measured to work with the claude CLI; for codex the paths are passed the same way but could not be checked on this machine.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `TurnRequest`

```typescript
interface TurnRequest { readonly provider: ProviderId; readonly prompt: string; readonly resume?: SessionHandle; readonly cwd: string; readonly permissionMode?: PermissionMode; readonly allowedTools?: readonly string[]; readonly readDirs?: readonly string[] /* NEW */ }
```

**Parameters:**
- `readDirs: readonly string[]` _(optional)_ — Directories outside cwd the CLI may read this turn: the session's attachments directory when the session has any attachment.

**Returns:** `TurnRequest` — Existing type in cli-adapter.ts with one optional field added. The claude adapter's buildArgs adds `--add-dir <dir>...` before the permission flags when readDirs is non-empty; with no readDirs its argv is byte-identical to today. The codex adapter's argv is unchanged: the attached paths are in the prompt only.

**Postconditions:**
- The prompt is still the last argv item after `--`.

### 2.2 `runTurn (chat-panel.ts)`

```typescript
function runTurn(text: unknown, allowedTools?: readonly string[], opts?: { readonly suppressEcho?: boolean | undefined }): Promise<void>  // existing; behaviour extended
```

**Returns:** `Promise<void>` — On a submit the host takes ALL pending attachments of the active session with the message. The stored user row keeps the user's own text and gains `attachments`; the prompt sent to the CLI is the text followed by a block listing each attached file's absolute path, one per line, under the line 'Attached files (read them with your file tools):'. The request carries readDirs = [the session's attachments directory] on this turn and on every later turn of a session whose transcript holds an attachment, including the synthesized grant re-runs.

**Preconditions:**
- Attachments still being written when the user submits are awaited first, so a message never goes without a file the user saw as a chip.

**Postconditions:**
- A submit with blank text and at least one pending attachment runs a turn; with blank text and none it is still a no-op.
- After a submit the session's pending list is empty and an `attachments-pending` with no items is posted.
- A first message with blank text names the chat from its first attachment's name.

### 2.3 `WebviewToHost / HostToWebview (protocol.ts)`

```typescript
NEW webview->host: { type: 'attach-image'; mime: string; dataBase64: string; name?: string; clientId?: string } | { type: 'pick-attachments' } | { type: 'remove-attachment'; attachmentId: string } | { type: 'open-attachment'; attachmentId: string }.  NEW host->webview: { type: 'attachments-pending'; sessionId: string; items: readonly PendingAttachmentView[]; error?: string }.  CHANGED host->webview: 'user-row' gains `attachments?: readonly AttachmentRef[]`.  type PendingAttachmentView = { id: string; name: string; kind: 'image' | 'file'; size: number; clientId?: string }
```

**Returns:** `protocol union members` — `submit-turn` is unchanged: the host owns the pending list, so a rebuilt webview loses nothing. Every new kind is added to the two type lists the protocol test pins. No message carries a file path from the webview: attachments are named by the id the host issued.

**Postconditions:**
- `attachments-pending` is posted after every add, remove and pick, after a submit, and with the session state on `ready`, new-chat and open-chat.
- `error` carries one plain sentence when an attachment was refused (too large, too many, not an image, unreadable).

### 2.4 `AttachmentStore`

```typescript
NEW, in vscode-plugin/src/chat/attachment-store.ts.  interface AttachmentRef { readonly id: string; readonly name: string; readonly kind: 'image' | 'file'; readonly size: number; readonly path: string }.  interface AttachmentStore { dirOf(sessionId: string): string; addBytes(sessionId: string, input: { name: string; mime: string; bytes: Uint8Array }): Promise<AttachmentRef>; addFile(sessionId: string, sourcePath: string): Promise<AttachmentRef>; remove(sessionId: string, attachmentId: string): Promise<void>; removeSession(sessionId: string): Promise<void>; sweep(opts: { olderThanMs: number; keep: ReadonlySet<string> }): Promise<void> }.  function createAttachmentStore(deps: { root: string; fs?: AttachmentFs; logger?: { warn(msg: string): void }; now?: () => number }): AttachmentStore.  export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; export const MAX_ATTACHMENTS_PER_MESSAGE = 10; export const PASTE_IMAGE_MIMES = ['image/png','image/jpeg','image/gif','image/webp']
```

**Parameters:**
- `deps.root: string` — extension.ts passes join(PATHS.insrc, 'chat-attachments').
- `deps.fs: AttachmentFs` _(optional)_ — The file seam (mkdir, writeFile, copyFile, stat, rm, readdir), node's fs/promises by default, a fake in tests, as SessionOutputFs is.

**Returns:** `AttachmentStore` — Each session's attachments are files in `<root>/<sessionFileName(sessionId)>/`, named `<n>-<safe name>`; that file name is the attachment's id. A picked document is copied, never referenced in place.

**Errors:**
- `AttachmentRefused` when The bytes or the source file are larger than MAX_ATTACHMENT_BYTES, a pasted mime is not in PASTE_IMAGE_MIMES, or the source is not a regular file. Its message is the sentence shown to the user.
- `Error` when A file call fails; the host shows it as the pending list's error and logs it.

**Postconditions:**
- The stored name keeps only A-Za-z0-9._- from the given name, never a path separator, and a pasted image with no name is `pasted-image.<ext from mime>`.
- remove() and removeSession() succeed when the file or directory is already gone; remove() ignores an id that is not a plain file name in that session's directory.
- sweep() removes the directories of sessions not in `keep` whose every file is older than olderThanMs, as the output sweep does.

### 2.5 `ChatPanelHostDeps`

```typescript
interface ChatPanelHostDeps { ...existing; readonly attachments?: { readonly store: AttachmentStore; pickFiles(): Promise<readonly string[]>; open(path: string): void } /* NEW */ }
```

**Parameters:**
- `attachments: { store; pickFiles; open }` _(optional)_ — The attachment store and the two VS Code seams (the file dialog and opening a file), injected by extension.ts so chat-panel.ts stays free of the vscode module.

**Returns:** `ChatPanelHostDeps` — Without `attachments` the shell renders no attach button and no chip row, pasting an image does nothing, and the four new messages are ignored: today's behaviour exactly.

**Preconditions:**
- vscode-plugin/src/vscode.d.ts, the plugin's own declaration of the vscode module, gains `window.showOpenDialog(options: { canSelectMany?: boolean; openLabel?: string }): PromiseLike<readonly Uri[] | undefined>`; it already declares Uri.file and commands.executeCommand.

**Postconditions:**
- extension.ts builds the store on join(PATHS.insrc, 'chat-attachments'); passes pickFiles, which calls vscode.window.showOpenDialog with canSelectMany and returns the chosen files' fsPath values (none when the dialog is dismissed); passes open, which runs commands.executeCommand('vscode.open', Uri.file(path)); removes a session's attachments in the store's onEvict beside its output files; and sweeps at start with the same keep set and age as the output sweep.

## 3. Data model changes

### 3.1 `TranscriptEntry (user row)` — field-add

The user row gains `attachments?: readonly AttachmentRef[]`, absent when the message had none, so every existing row and every message without attachments is stored exactly as today. The file store already carries a field it does not know, so nothing in the store changes. `text` stays the user's own words; the path block exists only in the prompt sent to the CLI.

```
{ role: 'user', text, at }  ->  { role: 'user', text, at, attachments?: [{ id, name, kind, size, path }] }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/render-registry.ts`

### 3.2 `attachments directory (<PATHS.insrc>/chat-attachments/<sessionFileName(id)>/)` — new

One directory per session holding the copied files. It is the only path given to the CLI as readDirs. Removed when its session is evicted; a directory no session keeps (a draft never sent, or pending files lost at a window reload) is removed by the start-up sweep once its files are older than the sweep's age.

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/session-output.ts`

### 3.3 `pending attachments (host memory)` — new

Per session id, in the panel host: the AttachmentRefs added since the last submit, in order, at most MAX_ATTACHMENTS_PER_MESSAGE. Kept across a webview rebuild and a chat switch within the window; lost at a window reload. Adds are serialized per session and a submit waits for them.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.4 `chat shell (renderShell in chat-panel.ts)` — field-modify

When attachments are enabled: `.statusbar` gains, as its first item, an icon-only button `#insrc-attach` (an inline SVG paperclip, aria-label and title 'attach files') that posts pick-attachments; a chip row `#insrc-attachments` sits between `.inputbar` and `.statusbar`, hidden while empty, each chip showing a kind glyph, the name, the size and a remove control, built with textContent only; a paste on `#insrc-input` whose clipboard holds image items posts one attach-image per image and is prevented, while a text paste is untouched; doSubmit also submits when the box is blank and chips are shown. A pasted image's chip shows a thumbnail from the data: URL the webview already holds (allowed by the existing `img-src data:`), matched by clientId; after a rebuild it shows the glyph. The content security policy is not changed.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.5 `user row rendering (render-registry.ts)` — field-modify

toViewModel, in both its host and webview copies, carries `attachments` on a user row, and the user row renders them as chips under the text (kind glyph, name, size; textContent only, no image is loaded). The registry gains a callback setter `onAttachmentOpen(cb)` beside onApprovalDecision and onSelectionDecision, returned on the registry object; a click on a chip calls it with the attachment's id, and the shell wires it to post open-attachment. The host resolves the id against the active session's rows and pending list and opens that file; an unknown id does nothing.

**Call sites:**
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.6 `vscode module declaration (vscode-plugin/src/vscode.d.ts)` — field-add

`namespace window` gains showOpenDialog, the only VS Code call this Story uses that the plugin's declaration does not have yet.

**Call sites:**
- `vscode-plugin/src/vscode.d.ts`
- `vscode-plugin/src/extension.ts`

## 4. Error paths

**Error cases**

- **A pasted image or a picked file is larger than the limit.** (recoverable)
  - Detection: For a paste, the base64 text's length times 3/4 exceeds MAX_ATTACHMENT_BYTES before it is decoded; for a file, stat's size exceeds it before any copy.
  - Response: Nothing is written. The pending list is posted unchanged with an error sentence naming the file and the limit.
  - User impact: The chip does not appear and a line under the prompt says why.
- **More than MAX_ATTACHMENTS_PER_MESSAGE attachments are added to one message.** (recoverable)
  - Detection: The session's pending list is already at the limit when an add arrives, or a pick returns more files than the remaining room.
  - Response: Files are taken in order up to the limit; the rest are refused with one error sentence giving the limit.
  - User impact: The first ten are attached; the user is told the others were not.
- **A pasted item is not an allowed image type, or its base64 does not decode.** (recoverable)
  - Detection: The message's mime is not in PASTE_IMAGE_MIMES, or the decoded length is zero or disagrees with the text's length.
  - Response: Refused with an error sentence; nothing is written.
  - User impact: No chip; a line says the pasted item is not a supported image.
- **A picked path is not a readable regular file.** (recoverable)
  - Detection: stat fails or reports a directory or another kind of file; copyFile fails.
  - Response: That file is refused with an error sentence naming it; the other picked files are still attached.
  - User impact: One file is missing from the chips, with the reason shown.
- **Writing an attachment fails (disk full, directory not writable).** (recoverable)
  - Detection: mkdir, writeFile or copyFile rejects.
  - Response: The error is logged and posted as the pending list's error; a partly written file is removed; the pending list is unchanged.
  - User impact: The attachment is not added and the user sees why.
- **The file dialog fails or is dismissed.** (recoverable)
  - Detection: pickFiles rejects, or resolves with no path.
  - Response: A rejection is logged and posted as the pending list's error; a dismissal changes nothing and posts nothing.
  - User impact: None for a dismissal; an error line for a failure.
- **An attached file is gone when the turn runs or when a chip is clicked.** (recoverable)
  - Detection: For a click, the host's stat of the resolved path fails; for a turn, the CLI's own read fails.
  - Response: A click logs and does nothing. A turn is still sent with the path listed; the assistant reports it could not read the file.
  - User impact: The message is sent; the assistant says the file is missing.
- **A message names an attachment id the host did not issue.** (recoverable)
  - Detection: remove-attachment or open-attachment carries an id that is not a string, or matches no pending attachment and no row of the active session.
  - Response: Ignored; no file call is made with a path built from the message.
  - User impact: None.
- **Removing an evicted session's attachments, or the start-up sweep, fails.** (recoverable)
  - Detection: rm or readdir rejects.
  - Response: Logged; the eviction and the start-up carry on, as they do for the output files.
  - User impact: None; a stale directory may remain until the next sweep.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A submit with blank text and one pending attachment. | A turn runs; the user row has empty text and the attachment; the prompt is the attached-files block alone. |
| A paste that holds both text and an image. | The image is attached and the text paste is prevented; a paste with only text behaves as today. |
| Two images pasted in quick succession, then a submit before the second is written. | The submit waits for both; the message carries both, in paste order. |
| A picked file whose name has spaces, unicode or path separators. | Stored under a name of A-Za-z0-9._- characters with a numeric prefix; the chip and the row show the original file name. |
| The same file attached twice. | Two attachments with different ids; removing one leaves the other. |
| The webview is hidden and shown again with chips pending. | On `ready` the host re-posts the pending list; the chips return, a pasted image's thumbnail is replaced by the glyph. |
| The user switches chat with chips pending, then switches back. | Each chat shows its own pending list. |
| A later turn in a chat that had an attachment three messages ago. | The request still carries the attachments directory in readDirs, so the assistant can read the file again. |
| A chat that never had an attachment. | No readDirs; the claude argv and the stored rows are exactly as today. |
| The host is built without the attachments seams. | No attach button, no chip row, an image paste does nothing, the four new messages are ignored. |
| The provider is codex. | The paths are in the prompt and the argv is unchanged; whether codex reads them is not established here. |
| A long chat paged out and back in. | A user row loaded from an older page shows its attachment chips, since they are part of the row. |

**Invariants to preserve**

- The prompt is the last argv item after `--` for both CLIs, and with no readDirs each argv is byte-identical to today. [[c1]]
- A submit with blank text and nothing attached is a no-op; a malformed submit never throws. [[c2]]
- The shell stays one nonce'd inline script under the same content security policy, builds text with textContent, and loads nothing from a remote origin. [[c2]]
- chat-panel.ts does not import the vscode module; VS Code is reached only through injected seams. [[c2]]
- Every message kind is named in the protocol's type lists, and an unknown inbound message is ignored. [[c3]]
- A stored row is plain JSON, existing rows keep their exact shape, and the transcript is only pushed to. [[c4]]
- A live user row and its replay reconcile to one rendered row by its key; the host and webview copies of toViewModel agree. [[c5]]
- An evicted session's files are removed and stale files are swept at start, failures logged and not thrown. [[c6]]

## 5. Test strategy

**Test framework:** `node:test run through tsx, with node:assert/strict; fakes injected, no real VS Code (as chat-panel.test.ts and chat-shell.test.ts do)`

**Test levels**

- **unit** — The attachment store over a fake file seam.
  - Subjects: `attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path`, `attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written`, `attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone`, `attachment store: sweep removes only directories of sessions not kept whose files are all older than the age`
  - Fixtures: `an in-memory AttachmentFs that records calls`
- **unit** — The request, the protocol and the row rendering.
  - Subjects: `claude argv: readDirs adds --add-dir with each directory before the permission flags and the prompt stays last after --; without readDirs the argv is byte-identical to today`, `codex argv is unchanged by readDirs`, `protocol: the four new webview messages and attachments-pending are in the type lists, and user-row carries attachments`, `render registry: a user row with attachments renders a chip per attachment with textContent only, a click calls the open sink with the attachment's id, and a row without attachments renders as today`
- **integration** — The panel host driven through a fake channel with a fake attachment store, picker and opener.
  - Subjects: `host: attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one; errors are posted as one sentence and the list is unchanged`, `host: a submit stores the user's text with the attachments on the row, echoes them on user-row, sends a prompt that ends with the attached-files block of absolute paths, passes readDirs, and clears the pending list`, `host: a submit with blank text and an attachment runs a turn and names the chat from the attachment; with blank text and none it is a no-op`, `host: a submit waits for an attachment still being written, and the message carries every chip in order`, `host: a later turn of a session with an attachment still passes readDirs, a session with none passes none, and a grant re-run keeps it`, `host: ready, new-chat and open-chat post each session's own pending list; an unknown or foreign attachment id in remove or open does nothing; open-attachment opens the resolved path of a row's or a pending attachment`, `host without the attachments seams: the shell has no attach button or chip row and the four messages are ignored`, `shell script: the attach button posts pick-attachments, an image paste posts attach-image with its base64 and is prevented, a text paste is untouched, chips render from attachments-pending with a remove control, and a blank box with chips submits`, `extension wiring: the store is built on ~/.insrc/chat-attachments, the picker and opener are injected, onEvict removes a session's attachments and the start-up sweep uses the same keep set`
  - Fixtures: `a fake attachment store, picker and opener`, `the shared fake DOM with a paste event carrying clipboard items`
- **live** — The real claude CLI reads what the host hands it; cannot run in the gate.
  - Subjects: `live claude: with the argv the adapter builds for a request with readDirs, a prompt naming an image and a text file in that directory is answered from their content`
- **smoke** — The feature in the real panel.
  - Subjects: `in VS Code: pasting a screenshot and attaching a document show chips, the message shows them after sending, the assistant answers from their content, and a chip click opens the file`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `shell script: the attach button posts pick-attachments, an image paste posts attach-image with its base64 and is prevented, a text paste is untouched, chips render from attachments-pending with a remove control, and a blank box with chips submits`, `host: attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one; errors are posted as one sentence and the list is unchanged` |
| `ac2` | `host: a submit stores the user's text with the attachments on the row, echoes them on user-row, sends a prompt that ends with the attached-files block of absolute paths, passes readDirs, and clears the pending list`, `claude argv: readDirs adds --add-dir with each directory before the permission flags and the prompt stays last after --; without readDirs the argv is byte-identical to today`, `live claude: with the argv the adapter builds for a request with readDirs, a prompt naming an image and a text file in that directory is answered from their content` |
| `ac3` | `render registry: a user row with attachments renders a chip per attachment with textContent only, a click calls the open sink with the attachment's id, and a row without attachments renders as today`, `in VS Code: pasting a screenshot and attaching a document show chips, the message shows them after sending, the assistant answers from their content, and a chip click opens the file` |

## 6. Migration

**State before:** A turn is a prompt string only: the webview sends submit-turn with text, the user row stores text, and each CLI gets the prompt as its last argv item (s1: how a turn's prompt reaches each CLI; s1: the message protocol and the stored user row). The prompt area has a send control, a textarea and a status bar with two selects (s1: the shell's prompt area).

**State after:** A message can carry attachments. They are files in the chat's own directory under ~/.insrc/chat-attachments, listed on the stored user row, named by path in the prompt, and readable by the claude CLI through --add-dir. The prompt area has an attach button in the status bar and a chip row. Chats and messages without attachments are stored and sent exactly as before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the attachment store and the optional readDirs field with the claude flag. Nothing calls them yet; every existing argv is unchanged. — ↩ rollbackable
2. Add the new message kinds and the optional attachments field on the user row and the user-row echo. Old rows have no such field and read as before. — ↩ rollbackable
3. Add the host handling behind the optional attachments seams and the row chips in the renderer. With the seams absent nothing changes. — ↩ rollbackable
4. Add the attach button, the chip row and the paste handling to the shell, shown only when the seams are present. — ↩ rollbackable
5. Declare showOpenDialog in the plugin's vscode declaration, inject the seams in extension.ts, remove a session's attachments on eviction and sweep them at start. From here the feature is on. — ↩ rollbackable

**Backward compat:** Additive only. submit-turn is unchanged; TurnRequest, the user row and user-row gain optional fields; ChatPanelHostDeps gains an optional member. A session written by this version and opened by an older one shows its messages without the chips, since the older renderer ignores the extra field, and the attachment files stay on disk. No stored data is rewritten.

## 7. Alternatives considered

### 7.1 a1: Copy into a per-session attachments directory and hand the CLI paths — **CHOSEN**

Every pasted image and picked document is copied to ~/.insrc/chat-attachments/<session>/, and the turn's prompt names those paths with the directory allowed for the CLI.

A new host-side attachment store keeps each session's attachments as files in its own directory. A pasted image travels from the webview to the host as base64 in a message; a document is chosen in VS Code's own file dialog, opened by the host, and copied in. The host holds the pending list for the session and shows it as removable chips under the prompt. On submit the user row stores the attachments beside the text, and the prompt sent to the CLI is the user's text followed by a short list of the attached paths. TurnRequest gains the directories to allow; the claude adapter passes them with --add-dir.

### 7.2 a2: Reference documents in place

Pasted images are saved as in a1, but a picked document is not copied: its own path goes into the prompt and its folder is allowed.

The same messages and row shape as a1, except that a document chosen in the file dialog is recorded by its original path. The directories allowed for the CLI are the attachments directory plus the parent folder of every referenced document.

**Rejected because:** Saves a copy at the price of exposing whole folders and of attachments that break when the original moves.

### 7.3 a3: Send content inline over the CLI's streaming input

Run the claude CLI with --input-format=stream-json and send the image bytes and document text inside the user message.

Change the claude adapter to write the turn to the CLI's standard input as a stream-json user message whose content holds image and text blocks, instead of passing a prompt argument. Attachments are still kept on disk for the transcript, but the model receives them inline.

**Rejected because:** The most direct delivery to the model, but unproven, claude-only and a rewrite of how every turn is started.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:504` — "args.push('--', req.prompt);"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:488` — "const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c3]]** `code` `vscode-plugin/src/chat/protocol.ts:179` — "| { readonly type: 'submit-turn'; readonly text: string }"
- **[[c4]]** `code` `vscode-plugin/src/chat/session-store.ts:32` — "readonly role: 'user' | 'assistant' | 'marker';"
- **[[c5]]** `code` `vscode-plugin/src/chat/render-registry.ts:109` — "if (entry.role === 'user') return { kind: 'user', role: 'user', text: entry.text, collapsible: true };"
- **[[c6]]** `code` `vscode-plugin/src/extension.ts:455` — "onEvict: (id) => void chatOutput.remove(id)"
- **[[c7]]** `step-output` `s1 search.text: probe of claude 2.1.296 on 2026-10-12` — "With `--add-dir <dir>` and a prompt naming an image and a text file in that directory it answered from both."

## 9. Open questions

- How does the codex CLI take an image or a file? It is not installed on the machine this was designed on, so the design passes the attached paths in the prompt and leaves the codex argv unchanged. Options: leave as designed and verify on a machine with codex; or add a per-image flag for codex once its CLI is checked.

## Resolved questions

- `q70a38cf1` — How does the codex CLI take an image or a file? It is not installed on the machine this was designed on, so the design passes the attached paths in the prompt and leaves the codex argv unchanged. Options: leave as designed and verify on a machine with codex; or add a per-image flag for codex once its CLI is checked.
  - **resolved**: Keep as designed, verify later — Already verified on 2026-10-12 with codex-cli 0.162.1 after the user installed it: with only the attached paths in the prompt and no extra flag, run from a directory that did not hold the files, it answered with the image's colour and the text file's content. Codex also has -i/--image, which the design does not need; the codex argv stays unchanged. _(2026-10-12T10:16:52.242Z)_

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:504` — "args.push('--', req.prompt);"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:488` — "const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c3]]** `code` `vscode-plugin/src/chat/protocol.ts:179` — "| { readonly type: 'submit-turn'; readonly text: string }"
- **[[c4]]** `code` `vscode-plugin/src/chat/session-store.ts:32` — "readonly role: 'user' | 'assistant' | 'marker';"
- **[[c5]]** `code` `vscode-plugin/src/chat/render-registry.ts:109` — "if (entry.role === 'user') return { kind: 'user', role: 'user', text: entry.text, collapsible: true };"
- **[[c6]]** `code` `vscode-plugin/src/extension.ts:455` — "onEvict: (id) => void chatOutput.remove(id)"
- **[[c7]]** `step-output` `s1 search.text: probe of claude 2.1.296 on 2026-10-12` — "With `--add-dir <dir>` and a prompt naming an image and a text file in that directory it answered from both."
