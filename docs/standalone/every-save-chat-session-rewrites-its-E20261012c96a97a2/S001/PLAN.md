<!-- insrc:artifact PLAN-c96a97a204fac22b-S001 -->

# Plan: E20261012c96a97a2:S001

## Summary

**Epic:** `every-save-chat-session-rewrites-its`
**LLD run:** `wf-1791795201517-mco267`
**LLD effective hash:** `57cdb57fc324...`

The build adds one new module, a file-backed chat session store with a one-time migration out of VS Code's globalState, and switches the extension to it. It goes in six steps: export the old store's keys and checks, build the file store's core, add its rules for several windows, eviction and failing writes, add the migration, wire it into the extension, then prove it over the real file system and the chat panel. The panel and the turn lifecycle are not edited. The last step includes a check on the user's own machine, because the real migration cannot be run by the gate.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Export the store's keys and checks, and correct its comments | S | — | unit: INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf are exported from session-store.ts and are the keys and checks the memento store itself uses | [[c1]] [[c7]] |
| 2 | **`t2`** File seam and the file store's core: files, read, list and appending save | M | `t1` | unit: a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row); unit: a save with no new rows writes the head only; unit: a draft writes nothing until its first save, which writes its rows and then its head; create() saves at once; unit: get returns the saved session with every row variant, editMode, mode, nativeSessionId and liveTurn unchanged, and the same object on a second call without reading the files again; unit: list reads head files only, never a rows file, and returns id, provider, title and updatedAt sorted by updatedAt descending; unit: a damaged head reads as no session and is left out of list; a rows file with a torn last line is read without it and cut back before the next append; a bad line in the middle is skipped; unit: an id with characters outside A-Za-z0-9_- is stored under sessionFileName(id) and read back with its real id | [[c2]] [[c3]] |
| 3 | **`t3`** Several windows, whole-file writes, failing writes and the session cap | M | `t2` | unit: after another writer has appended to the rows file, the same held session object is saved three times (with a new row, with only a head change, and after a get of its id): every save only appends, the rows file is never replaced, it holds both writers' rows in save order, and the get returns a fresh object with all of them (mutation: untrack the object when the cached copy is dropped); unit: an object the store has never tracked, saved for an id whose files exist, replaces the rows file whole through a temporary file and a rename; so does a tracked object whose transcript is shorter than its count; unit: a failing append or head write makes save throw and leaves the object's count where the rows on disk are, so the next save writes the missing rows once and none twice; unit: with maxSessions set, a save that creates a new session removes the sessions with the oldest savedAt and their rows files and calls onEvict for each, never the session being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap; unit: a held session object saved after its files were removed is written whole with its head, get then returns every row, and the cap is applied without removing it (mutation: append only the rows beyond its count); unit: a save after the store cut back a torn last line appends and does not replace the rows file | [[c2]] [[c4]] [[c8]] |
| 4 | **`t4`** Migrate sessions out of globalState | M | `t2` | unit: the migration writes each indexed session's files, reads them back equal, then removes its memento key and the index; the store then lists and returns every session as the memento store did; unit: a session whose write or read-back fails is left in the memento untouched, stays in the index and is returned in kept, and the others are still migrated; unit: a session whose files already hold a prefix of the memento's rows gets the missing rows appended and its memento key removed; one whose files hold more rows than the memento is left as it is on disk and its key removed; one that disagrees is changed in neither place and returned in kept; unit: the migration with no index, or run a second time, reads no session, writes nothing and returns no kept id; an entry isSession rejects is kept and logged | [[c5]] [[c4]] |
| 5 | **`t5`** Wire the file store into the extension | S | `t3`, `t4` | integration: extension.ts runs the migration before it builds the file store over join(PATHS.insrc, 'chat-sessions') with the session cap and the onEvict, and the output sweep keeps the store's ids and the migration's kept ids | [[c6]] |
| 6 | **`t6`** Integration tests over the real file system and the chat panel, and the real migration | M | `t5` | integration: over a real temporary directory with two store instances on one session: each appends, then the first saves its held object twice more with a get between; the rows file holds every row of both, was never replaced, and a torn last line written by hand is dropped and cut back; integration: the chat panel run over the file store: a turn's saves append only that turn's rows, a restored session shows the same rows, and a failing save is logged without breaking the turn; integration: a session the migration kept in globalState keeps its output files through the start-up sweep; smoke: after installing the build and reloading the window, the three existing chats open with their history, ~/.insrc/chat-sessions holds a head and a rows file for each, and the extension's value in state.vscdb no longer holds the sessions | [[c9]] [[c4]] |

### 1.1 E20261012c96a97a2:S001:T001 — Export the store's keys and checks, and correct its comments

In session-store.ts export INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf so the file store and the migration use the same keys and checks (review finding accepted by override). Correct the file header ('no local-JSON file') and the ChatSession.liveTurn comment ('Sessions live in globalState') to say sessions are kept in files under ~/.insrc/chat-sessions. No behaviour changes.

**Acceptance checks:**
- INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf are exported from session-store.ts with their values and behaviour unchanged
- The header and the liveTurn comment name the files, not globalState
- Every existing session-store test still passes unchanged

### 1.2 E20261012c96a97a2:S001:T002 — File seam and the file store's core: files, read, list and appending save

New vscode-plugin/src/chat/session-file-store.ts: the SessionFilesFs interface with nodeSessionFilesFs, and createFileChatSessionStore implementing ChatSessionStore over `<root>/<sessionFileName(id)>.head.json` and `.rows.ndjson`. Per-object tracking of the rows on disk; save appends the rows beyond the object's count and replaces the head through a temporary file and a rename, head after rows; draft writes nothing and create saves at once; get reads once and returns the same object while the files are unchanged; list reads heads only; a damaged head reads as absent; a torn last rows line is dropped and cut back, a bad middle line skipped; an id is stored under sessionFileName(id) and read back with its real id. Includes the in-memory recording fake used by the tests.

**Acceptance checks:**
- A save of a session holding 1,000 stored rows and one new row appends exactly that row and replaces the head; the bytes written do not grow with the stored rows
- A save with no new rows writes the head only
- draft() writes nothing until its first save; create() saves at once
- get() returns every row variant, editMode, mode, nativeSessionId and liveTurn unchanged, and the same object on a second call without reading the files again
- list() reads head files only and returns id, provider, title and updatedAt sorted by updatedAt descending
- A damaged head is absent from get and list; a torn last line is dropped and the file cut back before the next append; a bad middle line is skipped
- An id with characters outside A-Za-z0-9_- is stored under sessionFileName(id) and read back with its real id

### 1.3 E20261012c96a97a2:S001:T003 — Several windows, whole-file writes, failing writes and the session cap

Complete the store's save rules. Per id, record the rows file's size as the store last left or read it, including after its own cut-back of a torn last line. When the file has grown, another writer appended: still append this object's new rows, keep the object tracked, drop only the id's cached object so the next get reads the files. Write the rows file whole (temporary file and rename) in exactly three cases: an object never tracked for an id whose files exist; a tracked object whose transcript is shorter than its count; and (review finding accepted by override) a tracked object whose rows file is missing or smaller than the recorded size, or whose head is gone, as after an eviction, so the session comes back complete. That last save counts as creating a new head, so the cap is applied. A failing append or head write throws and leaves the count where the rows on disk are. With maxSessions, a save that creates a new head removes the oldest heads by savedAt with their rows files and calls onEvict, never the session being saved; a failing remove is logged.

**Acceptance checks:**
- After another writer appended, the same held object saved three times (new row, head change only, after a get of its id) only ever appends; the rows file is never replaced and holds both writers' rows in save order; the get returns a fresh object with all of them
- A held object saved after its files were removed (evicted) writes its whole transcript and its head, get then returns every row, and the cap is applied without removing it
- A save after the store cut back a torn last line appends and does not replace the rows file
- A never-tracked object saved for an id whose files exist, and a tracked object whose transcript is shorter than its count, each replace the rows file whole through a temporary file and a rename
- A failing append or head write makes save throw; the next save writes the missing rows once and none twice
- With maxSessions set, a save that creates a new session removes the oldest sessions' files and calls onEvict for each, never the one being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap

### 1.4 E20261012c96a97a2:S001:T004 — Migrate sessions out of globalState

In session-file-store.ts add migrateChatSessionsFromMemento: for each indexed session isSession accepts, write its files when no head exists (rows then head, through temporary files), append the missing rows when the files hold a prefix, write nothing when the memento holds a prefix of the files; read the files back and compare every row and head field; remove the memento key only then. A session that fails, disagrees or is rejected is left untouched, logged and returned in kept. Rewrite or remove the index. Never throws.

**Acceptance checks:**
- Each indexed session is written, read back equal, and only then removed from the memento with the index; the file store then lists and returns every session as the memento store did
- A session whose write or read-back fails is left in the memento untouched, stays in the index and is in kept, and the others are still migrated
- Files holding a prefix of the memento's rows get the missing rows and the key is removed; files holding more rows are left and the key removed; a disagreeing session is changed in neither place and is in kept
- With no index, or on a second run, nothing is read or written and kept is empty; an entry isSession rejects is kept and logged

### 1.5 E20261012c96a97a2:S001:T005 — Wire the file store into the extension

In extension.ts run migrateChatSessionsFromMemento over context.globalState first, build chatStore with createFileChatSessionStore over join(PATHS.insrc, 'chat-sessions') with the same maxSessions and onEvict, and give the output sweep a keep set of the store's ids plus the migration's kept ids. Update extension-chat-wiring.test.ts: replace the line-46 assertion with ones for the file store, its root and the migration placed before it; keep the onEvict assertion; change the sweep assertion to the new keep set.

**Acceptance checks:**
- extension.ts calls the migration before it builds the file store over join(PATHS.insrc, 'chat-sessions') with the session cap and the onEvict
- The sweep's keep set holds the store's ids and the migration's kept ids
- createMementoChatSessionStore is no longer constructed in extension.ts
- The plugin type-checks and the wiring test passes with the updated assertions

### 1.6 E20261012c96a97a2:S001:T006 — Integration tests over the real file system and the chat panel, and the real migration

Tests, plus one reported check. Over a real temporary directory, two store instances on one session each append, the first saves its held object twice more with a get between, and a hand-written torn last line is dropped and cut back. The chat panel run over the file store: a turn's saves append only that turn's rows, a restored session shows the same rows, and a failing save is logged without breaking the turn. A session the migration kept in globalState keeps its output files through the start-up sweep. Any defect these expose in the code of t2 to t5 is fixed here. Last, the builder installs the build and reports what the real migration did on the user's machine; the gate cannot run that, so it is recorded as reported.

**Acceptance checks:**
- Over a real directory the rows file holds every row of both store instances, was never replaced, and a torn last line is dropped and cut back
- Under the chat panel a turn's saves append only that turn's rows, a restored session shows the same rows, and a failing save is logged without breaking the turn
- A session kept by the migration keeps its output files through the sweep
- The whole plugin test suite passes apart from the two manifest-catalog tests that failed before this Story
- Reported by the builder after installing the build and the user reloading the window: the existing chats open with their history, ~/.insrc/chat-sessions holds a head and a rows file for each, and the extension's value in state.vscdb no longer holds the sessions

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row) | `t2` |
| a save with no new rows writes the head only | `t2` |
| a draft writes nothing until its first save, which writes its rows and then its head; create() saves at once | `t2` |
| get returns the saved session with every row variant, editMode, mode, nativeSessionId and liveTurn unchanged, and the same object on a second call without reading the files again | `t2` |
| list reads head files only, never a rows file, and returns id, provider, title and updatedAt sorted by updatedAt descending | `t2` |
| a damaged head reads as no session and is left out of list; a rows file with a torn last line is read without it and cut back before the next append; a bad line in the middle is skipped | `t2` |
| after another writer has appended to the rows file, the same held session object is saved three times (with a new row, with only a head change, and after a get of its id): every save only appends, the rows file is never replaced, it holds both writers' rows in save order, and the get returns a fresh object with all of them (mutation: untrack the object when the cached copy is dropped) | `t3` |
| an object the store has never tracked, saved for an id whose files exist, replaces the rows file whole through a temporary file and a rename; so does a tracked object whose transcript is shorter than its count | `t3` |
| a failing append or head write makes save throw and leaves the object's count where the rows on disk are, so the next save writes the missing rows once and none twice | `t3` |
| with maxSessions set, a save that creates a new session removes the sessions with the oldest savedAt and their rows files and calls onEvict for each, never the session being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap | `t3` |
| an id with characters outside A-Za-z0-9_- is stored under sessionFileName(id) and read back with its real id | `t2` |
| the migration writes each indexed session's files, reads them back equal, then removes its memento key and the index; the store then lists and returns every session as the memento store did | `t4` |
| a session whose write or read-back fails is left in the memento untouched, stays in the index and is returned in kept, and the others are still migrated | `t4` |
| a session whose files already hold a prefix of the memento's rows gets the missing rows appended and its memento key removed; one whose files hold more rows than the memento is left as it is on disk and its key removed; one that disagrees is changed in neither place and returned in kept | `t4` |
| the migration with no index, or run a second time, reads no session, writes nothing and returns no kept id; an entry isSession rejects is kept and logged | `t4` |
| over a real temporary directory with two store instances on one session: each appends, then the first saves its held object twice more with a get between; the rows file holds every row of both, was never replaced, and a torn last line written by hand is dropped and cut back | `t6` |
| the chat panel run over the file store: a turn's saves append only that turn's rows, a restored session shows the same rows, and a failing save is logged without breaking the turn | `t6` |
| extension.ts runs the migration before it builds the file store over join(PATHS.insrc, 'chat-sessions') with the session cap and the onEvict, and the output sweep keeps the store's ids and the migration's kept ids | `t5` |
| a session the migration kept in globalState keeps its output files through the start-up sweep | `t6` |
| after installing the build and reloading the window, the three existing chats open with their history, ~/.insrc/chat-sessions holds a head and a rows file for each, and the extension's value in state.vscdb no longer holds the sessions | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges: extension.ts chat wiring and the text that pins it (the two comments)` — "the session-store.ts header ('no local-JSON file') and the ChatSession.liveTurn comment ('Sessions live in globalState') are corrected to name the files"
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api: createFileChatSessionStore` — "save(s) for a tracked object appends to the rows file exactly the rows of s.transcript beyond its count, then replaces the head through a temporary file and a rename."
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api: SessionFilesFs; dataModelChanges: session head file and session rows file` — "The synchronous file calls the store needs, kept structural so tests inject a fake"
- **[[c4]]** `prior-artifact` `LLD S001 errorPaths` — "The object's count is advanced only after its append succeeded, so rows that were not written are tried again by the next save and rows that were written are never written twice."
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails.api: migrateChatSessionsFromMemento; migration` — "Only when they match, or the files hold the memento's rows as a prefix, is `insrc.chat.session.<id>` set to undefined."
- **[[c6]]** `prior-artifact` `LLD S001 dataModelChanges: extension.ts chat wiring and the text that pins it` — "call migrateChatSessionsFromMemento over context.globalState first, build chatStore with createFileChatSessionStore over join(PATHS.insrc, 'chat-sessions')"
- **[[c7]]** `prior-artifact` `LLD S001 review finding accepted by override (change-sites): export INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf from session-store.ts` — "INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf are exported from session-store.ts so the file store and the migration share one source."
- **[[c8]]** `prior-artifact` `LLD S001 review finding accepted by override (fix-targets-defect): a held object saved after its files were evicted is written whole` — "A held session object saved after its files were evicted or removed (rows file missing or smaller than the recorded size, or head gone) is written whole, with an error-path entry and a unit test."
- **[[c9]]** `prior-artifact` `LLD S001 testStrategy: integration and smoke levels` — "The file store over the real file system, under the real chat panel, and in the extension's wiring."
