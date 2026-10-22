<!-- insrc:artifact PLAN-59da3204a44afd1b-s1 -->

# Plan: E2026101259da3204:S001

## Summary

**Epic:** `paste-images-attach-documents-dev-chat`
**LLD run:** `wf-1791799586800-yoy6xq`
**LLD effective hash:** `b689b72d757c...`

The work adds a small store that copies pasted images and picked documents into a per-chat folder under ~/.insrc/chat-attachments, then teaches the chat host to keep a pending list per chat and send it with the next message as file paths the CLI may read. The panel gains an icon-only attach button under the prompt, removable chips, image paste, and chips on sent messages that open the file. Three review findings accepted by override are built in as explicit behaviour: only a real submit takes attachments, an attachment-only submit supersedes queued approvals, and a submit is tied to the chat it started in. The recorded limits are 20 MB per file, 10 per message and PNG/JPEG/GIF/WebP for pasted images; drag-and-drop and image previews in the transcript are out of scope.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Attachment store | M | — | unit: attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path; unit: attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written; unit: attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone; unit: attachment store: sweep removes only directories of sessions not kept whose files are all older than the age; unit: attachment store: a failed write leaves no partial file | [[c1]] [[c8]] |
| 2 | **`t2`** readDirs on the turn request and the claude flag | S | — | unit: claude argv: readDirs adds --add-dir with each directory before the permission flags and the prompt stays last after --; without readDirs the argv is byte-identical to today; unit: codex argv is unchanged by readDirs | [[c2]] [[c12]] |
| 3 | **`t3`** Protocol messages and the row's attachments field | S | `t1` | unit: protocol: the four new webview messages and attachments-pending are in the type lists, and user-row carries attachments; unit: session file store: a user row with attachments round-trips unchanged | [[c3]] [[c9]] |
| 4 | **`t4`** Attachment chips on the user row | S | `t3` | unit: render registry: a user row with attachments renders a chip per attachment with textContent only, a click calls the open sink with the attachment's id, and a row without attachments renders as today | [[c4]] |
| 5 | **`t5`** Host: the pending list and its messages | M | `t3` | integration: host: attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one; errors are posted as one sentence and the list is unchanged; integration: host: ready, new-chat and open-chat post each session's own pending list; an unknown or foreign attachment id in remove or open does nothing; open-attachment opens the resolved path of a row's or a pending attachment; integration: host without the attachments seams: the shell has no attach button or chip row and the four messages are ignored; integration: host: an attach-image whose base64 length implies more than the limit is refused without decoding and without calling the store; integration: host: a dismissed dialog posts nothing, and a pick over the limit keeps the first ten and posts one error sentence | [[c5]] [[c6]] |
| 6 | **`t6`** Host: sending attachments with a message | M | `t2`, `t5` | integration: host: a submit stores the user's text with the attachments on the row, echoes them on user-row, sends a prompt that ends with the attached-files block of absolute paths, passes readDirs, and clears the pending list; integration: host: a submit with blank text and an attachment runs a turn and names the chat from the attachment; with blank text and none it is a no-op; integration: host: a submit waits for an attachment still being written, and the message carries every chip in order; integration: host: a later turn of a session with an attachment still passes readDirs, a session with none passes none, and a grant re-run keeps it; integration: host: a grant re-run and a selection continuation leave the pending list untouched and attach nothing; integration: host: a submit with blank text and an attachment supersedes queued approvals; integration: host: a chat switch while a submit waits drops the submit and keeps the chips on their session, and a second submit runs after the first | [[c5]] [[c9]] |
| 7 | **`t7`** Shell: attach button, chips and paste | M | `t4`, `t5` | integration: shell script: the attach button posts pick-attachments, an image paste posts attach-image with its base64 and is prevented, a text paste is untouched, chips render from attachments-pending with a remove control, and a blank box with chips submits; integration: shell: the attach button is icon-only with an aria-label, sits first in the status bar, and the content security policy is unchanged; integration: shell script: a chip click on a sent message posts open-attachment, and the error sentence is shown and cleared | [[c7]] [[c8]] |
| 8 | **`t8`** Wire attachments into the extension | S | `t6`, `t7` | integration: extension wiring: the store is built on ~/.insrc/chat-attachments, the picker and opener are injected, onEvict removes a session's attachments and the start-up sweep uses the same keep set | [[c10]] |
| 9 | **`t9`** Real CLIs and the real panel | S | `t8` | live: live claude: with the argv the adapter builds for a request with readDirs, a prompt naming an image and a text file in that directory is answered from their content; live: live codex: with the argv the adapter builds, a prompt naming an image and a text file in the attachments directory is answered from their content; smoke: in VS Code: pasting a screenshot and attaching a document show chips, the message shows them after sending, the assistant answers from their content, and a chip click opens the file; smoke: whole plugin suite: every test passes apart from the two manifest-catalog tests that failed before this Story | [[c11]] [[c12]] |

### 1.1 E2026101259da3204:S001:T001 — Attachment store

New vscode-plugin/src/chat/attachment-store.ts: AttachmentRef, the AttachmentFs seam with its node implementation, AttachmentRefused, createAttachmentStore (dirOf, addBytes, addFile, remove, removeSession, sweep) and the three limits as recorded by the user: MAX_ATTACHMENT_BYTES 20 MiB, MAX_ATTACHMENTS_PER_MESSAGE 10, PASTE_IMAGE_MIMES png/jpeg/gif/webp. Files go to `<root>/<sessionFileName(id)>/<n>-<safe name>`; a picked document is copied. Nothing uses it yet.

**Acceptance checks:**
- addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path
- An oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written; a failed write leaves no partial file
- remove ignores an id that is not a plain file name in the session's directory; remove and removeSession succeed when the target is gone
- sweep removes only directories of sessions not kept whose files are all older than the age
- The limits are the recorded constants

### 1.2 E2026101259da3204:S001:T002 — readDirs on the turn request and the claude flag

TurnRequest gains optional readDirs. The claude adapter's buildArgs adds `--add-dir` with each directory before the permission flags when readDirs is non-empty. The codex adapter's argv is unchanged (checked with the real CLI: paths in the prompt are enough).

**Acceptance checks:**
- With readDirs the claude argv has --add-dir and each directory before the permission flags, and the prompt is still last after --
- Without readDirs the claude argv is byte-identical to today, with and without resume, each mode and allowedTools
- The codex argv is the same with and without readDirs

### 1.3 E2026101259da3204:S001:T003 — Protocol messages and the row's attachments field

protocol.ts: add attach-image, pick-attachments, remove-attachment and open-attachment (webview to host), attachments-pending (host to webview) with PendingAttachmentView, and `attachments?` on user-row; add each new kind to its type list. session-store.ts: the user row variant gains `attachments?: readonly AttachmentRef[]`. AttachmentRef is imported as a type from attachment-store.ts, which is why this follows t1. The lists are not exhaustive today, so the test asserts each new kind by name (review finding accepted by override).

**Acceptance checks:**
- Each of the five new kinds is in its type list and the protocol test asserts each by name
- user-row and the stored user row accept attachments; a row without them has exactly today's shape
- A user row with attachments round-trips through the file store unchanged

### 1.4 E2026101259da3204:S001:T004 — Attachment chips on the user row

render-registry.ts: toViewModel, in its host and webview copies, carries attachments on a user row; the user row renders a chip per attachment under the text (kind glyph, name, size; textContent only, no image loaded); the registry gains the setter onAttachmentOpen(cb), returned on the registry object beside onApprovalDecision and onSelectionDecision; a chip click calls it with the attachment's id.

**Acceptance checks:**
- A user row with attachments renders one chip per attachment, built with textContent only
- A chip click calls the open sink with that attachment's id; with no sink set it does nothing
- A user row without attachments renders exactly as today, and the host and webview copies of toViewModel agree

### 1.5 E2026101259da3204:S001:T005 — Host: the pending list and its messages

chat-panel.ts, behind the optional `attachments` seams on ChatPanelHostDeps: a per-session pending list in host memory; attach-image (size checked from the base64 length before decoding, then addBytes), pick-attachments (pickFiles then addFile for each, up to the remaining room), remove-attachment and open-attachment (ids resolved against the active session's pending list and rows, never a path from the message); adds serialized per session; attachments-pending posted after every add, remove and pick and with the session state on ready, new-chat and open-chat; refusals and failures posted as one error sentence. Without the seams the four messages are ignored.

**Acceptance checks:**
- attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one
- An attach-image whose base64 length implies more than the limit is refused without decoding and without calling the store
- A refusal or a failing write or dialog posts one error sentence and leaves the list unchanged; a dismissed dialog posts nothing; over the limit the first ten are kept
- ready, new-chat and open-chat post each session's own pending list
- An unknown or foreign id in remove or open does nothing; open-attachment opens the resolved path of a row's or a pending attachment
- Without the seams the four messages are ignored and nothing is posted

### 1.6 E2026101259da3204:S001:T006 — Host: sending attachments with a message

chat-panel.ts. Only the submit-turn caller takes the pending attachments: runTurn gains an explicit attachments argument that the submit-turn case fills, and the grant re-run and the selection continuation pass none (review finding). The submit-turn case supersedes queued approvals when the text is non-blank OR attachments are pending (review finding). The session and its pending list are captured before waiting for in-flight attachment writes; if the active session changed or the panel closed during the wait the submit is dropped and the attachments stay pending on their session; a second submit waits its turn behind the first (review finding). The user row stores the user's text with the attachments and user-row echoes them; the prompt sent to the CLI ends with the attached-files block of absolute paths; readDirs carries the session's attachments directory on this turn and on every later turn of a session whose transcript holds an attachment, including grant re-runs and selection continuations; a first message with blank text names the chat from its first attachment.

**Acceptance checks:**
- A submit stores the text with the attachments on the row, echoes them on user-row, sends a prompt ending with the attached-files block, passes readDirs, clears the pending list and posts an attachments-pending with no items
- A submit with blank text and an attachment runs a turn, supersedes queued approvals and names the chat from the attachment; with blank text and none it is a no-op
- A grant re-run and a selection continuation leave the pending list untouched and attach nothing, but pass readDirs when the session has an attachment
- A submit waits for an attachment still being written and carries every chip in order; a chat switch during the wait drops the submit and keeps the chips on their session; a second submit runs after the first
- A session with no attachment passes no readDirs and stores rows exactly as today

### 1.7 E2026101259da3204:S001:T007 — Shell: attach button, chips and paste

renderShell in chat-panel.ts, only when the seams are present: the icon-only `#insrc-attach` button as the first item of `.statusbar` posting pick-attachments; the chip row `#insrc-attachments` between `.inputbar` and `.statusbar`, hidden while empty, built with textContent, each chip with a remove control and, for a just-pasted image, a thumbnail from the data: URL the webview holds, matched by clientId; the error line; a paste on `#insrc-input` with image items posts attach-image per image and is prevented while a text paste is untouched; doSubmit also submits when the box is blank and chips are shown; the registry's onAttachmentOpen wired to post open-attachment. The content security policy is unchanged. Drag-and-drop and image previews in the transcript are out of scope, as recorded.

**Acceptance checks:**
- The attach button posts pick-attachments and has no text, only an icon with an aria-label and title
- An image paste posts attach-image with its base64 and mime and is prevented; a text paste is untouched
- Chips render from attachments-pending with a remove control that posts remove-attachment; the error sentence is shown; an empty list hides the row
- A blank box with chips submits; a blank box with none does not
- The shell is still one nonce'd inline script under the same policy, with no innerHTML outside the guarded markdown path; without the seams it has no attach button or chip row

### 1.8 E2026101259da3204:S001:T008 — Wire attachments into the extension

vscode.d.ts: declare window.showOpenDialog. extension.ts: build the store on join(PATHS.insrc, 'chat-attachments'); inject pickFiles (showOpenDialog with canSelectMany, returning fsPath values, none when dismissed) and open (the vscode.open command on a file URI); remove a session's attachments in onEvict beside its output files; sweep at start with the same keep set and age as the output sweep. Update extension-chat-wiring.test.ts.

**Acceptance checks:**
- The store is built on ~/.insrc/chat-attachments and the picker and opener are injected into the chat host
- onEvict removes a session's attachments and its output files; the start-up sweep uses the same keep set
- The plugin type-checks with showOpenDialog declared and the wiring test passes

### 1.9 E2026101259da3204:S001:T009 — Real CLIs and the real panel

Checks the gate cannot run, reported by the builder. With the argv each adapter builds for a request with readDirs, the real claude CLI and the real codex CLI answer from an image and a text file in that directory. Then the build is installed and, after the user reloads the window, pasting a screenshot and attaching a document are checked in the panel. The whole plugin suite is run and its TAP output saved to a file that is named as evidence.

**Acceptance checks:**
- Reported: claude, run with the adapter's own argv for a request with readDirs, answers from the image and the text file
- Reported: codex, run with the adapter's own argv, answers from the image and the text file
- Reported after install and the user's reload: chips appear for a pasted screenshot and an attached document, the sent message shows them, the assistant answers from their content, and a chip click opens the file
- The whole plugin suite passes apart from the two manifest-catalog tests that failed before this Story, with its TAP output saved to a file named as evidence

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path | `t1` |
| attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written | `t1` |
| attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone | `t1` |
| attachment store: sweep removes only directories of sessions not kept whose files are all older than the age | `t1` |
| claude argv: readDirs adds --add-dir with each directory before the permission flags and the prompt stays last after --; without readDirs the argv is byte-identical to today | `t2` |
| codex argv is unchanged by readDirs | `t2` |
| protocol: the four new webview messages and attachments-pending are in the type lists, and user-row carries attachments | `t3` |
| render registry: a user row with attachments renders a chip per attachment with textContent only, a click calls the open sink with the attachment's id, and a row without attachments renders as today | `t4` |
| host: attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one; errors are posted as one sentence and the list is unchanged | `t5` |
| host: a submit stores the user's text with the attachments on the row, echoes them on user-row, sends a prompt that ends with the attached-files block of absolute paths, passes readDirs, and clears the pending list | `t6` |
| host: a submit with blank text and an attachment runs a turn and names the chat from the attachment; with blank text and none it is a no-op | `t6` |
| host: a submit waits for an attachment still being written, and the message carries every chip in order | `t6` |
| host: a later turn of a session with an attachment still passes readDirs, a session with none passes none, and a grant re-run keeps it | `t6` |
| host: ready, new-chat and open-chat post each session's own pending list; an unknown or foreign attachment id in remove or open does nothing; open-attachment opens the resolved path of a row's or a pending attachment | `t5` |
| host without the attachments seams: the shell has no attach button or chip row and the four messages are ignored | `t5`, `t7` |
| shell script: the attach button posts pick-attachments, an image paste posts attach-image with its base64 and is prevented, a text paste is untouched, chips render from attachments-pending with a remove control, and a blank box with chips submits | `t7` |
| extension wiring: the store is built on ~/.insrc/chat-attachments, the picker and opener are injected, onEvict removes a session's attachments and the start-up sweep uses the same keep set | `t8` |
| live claude: with the argv the adapter builds for a request with readDirs, a prompt naming an image and a text file in that directory is answered from their content | `t9` |
| in VS Code: pasting a screenshot and attaching a document show chips, the message shows them after sending, the assistant answers from their content, and a chip click opens the file | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api AttachmentStore`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api TurnRequest (readDirs and the claude --add-dir flag)`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api WebviewToHost / HostToWebview (protocol.ts)`
- **[[c4]]** `prior-artifact` `LLD S001 render registry: attachments on the user row and onAttachmentOpen`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails.api runTurn (chat-panel.ts) and the review findings accepted by override`
- **[[c6]]** `prior-artifact` `LLD S001 ChatPanelHostDeps.attachments seams (store, pickFiles, open)`
- **[[c7]]** `prior-artifact` `LLD S001 shell: attach button, chip row, paste handler, unchanged content security policy`
- **[[c8]]** `stakeholder` `User decision 2026-10-12: limits of 20 MB per file, 10 per message, pasted images PNG/JPEG/GIF/WebP; drag-and-drop and transcript image previews out of scope`
- **[[c9]]** `prior-artifact` `LLD S001 stored user row: text plus attachments, prompt block of absolute paths`
- **[[c10]]** `prior-artifact` `LLD S001 extension wiring: store root, picker, opener, eviction and start-up sweep, vscode.d.ts showOpenDialog`
- **[[c11]]** `prior-artifact` `LLD S001 testStrategy live and smoke levels`
- **[[c12]]** `prior-artifact` `LLD S001 open question q70a38cf1 resolution: codex-cli 0.162.1 reads attached paths from the prompt with no extra flag; codex argv unchanged`
