<!-- insrc:artifact LLD-c96a97a204fac22b-s1 -->

# LLD: E20261012c96a97a2:S001

## Summary

**Epic:** `every-save-chat-session-rewrites-its`
**HLD base run:** `wf-1791795201517-mco267`
**HLD effective hash:** `57cdb57fc324...`

Chat sessions move out of VS Code's globalState, where every save rewrites one 29.6 MB value, into two files per session under ~/.insrc/chat-sessions: a small head and a transcript file with one row per line. A save appends only the rows that session object has not yet written and replaces the head, so its cost no longer grows with the history, and the history list reads heads only. The store's interface and its callers do not change. Sessions already in globalState are copied to files once, checked, and only then removed from it.

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

### 2.1 `ChatSessionStore`

```typescript
interface ChatSessionStore { create(provider: ProviderId): ChatSession; draft(provider: ProviderId): ChatSession; get(id: string): ChatSession | undefined; list(): ReadonlyArray<ChatSummary>; append(id: string, entry: TranscriptEntry): void; save(session: ChatSession): void }
```

**Returns:** `ChatSessionStore` — Unchanged. The existing synchronous interface; the new file store implements it, so chat-panel.ts and turn-lifecycle.ts are not edited.

**Errors:**
- `Error` when save() throws when a file cannot be written; trySaveSession already catches and logs it.

**Postconditions:**
- get() never throws: a missing or unreadable session is undefined.
- list() never throws: an unreadable head is left out.

### 2.2 `createFileChatSessionStore`

```typescript
function createFileChatSessionStore(deps: FileStoreDeps): ChatSessionStore  // NEW, in vscode-plugin/src/chat/session-file-store.ts. interface FileStoreDeps { readonly root: string; readonly fs?: SessionFilesFs; readonly now?: () => string; readonly genId?: () => string; readonly maxSessions?: number; readonly onEvict?: ((sessionId: string) => void) | undefined; readonly logger?: { warn(msg: string): void } }
```

**Parameters:**
- `deps.root: string` — The directory holding the session files; extension.ts passes join(PATHS.insrc, 'chat-sessions').
- `deps.fs: SessionFilesFs` _(optional)_ — The synchronous file seam; node's fs by default, an in-memory fake in tests.
- `deps.maxSessions: number` _(optional)_ — The session cap, with the same meaning as today: only a positive integer is a cap.
- `deps.onEvict: (sessionId: string) => void` _(optional)_ — Called with the id of each session evicted beyond the cap, as today.

**Returns:** `ChatSessionStore` — A store whose sessions are `<root>/<sessionFileName(id)>.head.json` and `<root>/<sessionFileName(id)>.rows.ndjson`.

**Preconditions:**
- sessionFileName from session-output.ts names the files, so a session's files and its output files share a base name.

**Postconditions:**
- TRACKING. For every session object the store hands out (get, draft, create) or is given to save, it keeps the number of that object's leading rows that are on disk: the rows read for get, 0 for draft, the transcript's length after each successful save. The count belongs to the OBJECT, not the id, and is kept for as long as the object lives. Neither another window's append nor a get() that returns a fresh object for the same id removes or changes it.
- save(s) for a tracked object appends to the rows file exactly the rows of s.transcript beyond its count, then replaces the head through a temporary file and a rename. So an object the callers hold and save again and again (turn-lifecycle.ts cursor tracker, chat-panel.ts `session`) only ever appends, whatever else has happened to the files.
- The rows file is replaced whole (temporary file and rename) in two cases only, neither of which the callers reach: an object the store has NEVER tracked saved for an id whose files exist, and a tracked object whose transcript is shorter than its count.
- The head is written after the rows, so a session that has a head has its rows. The head is last-writer-wins between windows.
- SEVERAL WINDOWS. The store also keeps, per id, the rows file's size as it last left or read it. When the size found before an append differs, another writer appended: this object's new rows are still appended after theirs, the head is written, the recorded size is updated, and the store drops only the id's cached object, so the next get(id) reads the files and returns a fresh object holding every row in file order. File order is the order of the saves: each window's rows keep their own order and the two windows' rows interleave by save time.
- get(id) returns the same object on repeated calls while the head's modification time and the rows file's size are as this store last left them; otherwise it reads the files again and returns a fresh, separately tracked object. The older object stays tracked.
- A rows file whose last line is incomplete (no trailing newline, or not JSON) is read without that line and cut back to the last complete line before anything is appended.
- list() reads heads only and sorts by updatedAt descending, as today.
- When a save creates a new head and more than maxSessions heads exist, the heads with the oldest savedAt are removed with their rows files and onEvict is called for each; the session being saved is never removed.
- draft() writes nothing; create() saves at once, as today.

### 2.3 `SessionFilesFs`

```typescript
interface SessionFilesFs { mkdir(dir: string): void; readText(path: string): string | undefined; writeText(path: string, data: string): void; appendText(path: string, data: string): void; rename(from: string, to: string): void; remove(path: string): void; truncate(path: string, bytes: number): void; stat(path: string): { readonly size: number; readonly mtimeMs: number } | undefined; list(dir: string): string[] }  // NEW; export const nodeSessionFilesFs: SessionFilesFs
```

**Returns:** `SessionFilesFs` — The synchronous file calls the store needs, kept structural so tests inject a fake, as SessionOutputFs does for the output files.

**Errors:**
- `Error` when writeText, appendText, rename and truncate throw on failure; readText and stat return undefined for a missing file; list returns [] for a missing directory.

### 2.4 `migrateChatSessionsFromMemento`

```typescript
function migrateChatSessionsFromMemento(deps: { readonly memento: MementoLike; readonly root: string; readonly fs?: SessionFilesFs; readonly logger?: { warn(msg: string): void; info?(msg: string): void } }): { readonly migrated: number; readonly kept: readonly string[] }  // NEW, in session-file-store.ts
```

**Parameters:**
- `deps.memento: MementoLike` — context.globalState, read through the existing `insrc.chat.index` and `insrc.chat.session.<id>` keys.
- `deps.root: string` — The same directory the file store uses.

**Returns:** `{ migrated: number; kept: readonly string[] }` — How many sessions were moved to files and removed from the memento, and the ids of the sessions left in it. extension.ts adds the kept ids to the output sweep's keep set, so a session still waiting in globalState does not lose its output files.

**Preconditions:**
- Called once at activation, before the file store is built and before the output sweep.

**Postconditions:**
- For each indexed session that isSession accepts: when no head exists, its rows file and then its head are written through temporary files and renames; when a head exists and the files' rows are a prefix of the memento's rows, the missing rows are appended; when the memento's rows are a prefix of the files' rows nothing is written.
- The files are then read back and compared with the memento's session (every row and every head field). Only when they match, or the files hold the memento's rows as a prefix, is `insrc.chat.session.<id>` set to undefined.
- A session whose files and memento copy disagree in any other way, whose write or read-back fails, or that isSession rejects, is left in the memento untouched, logged, and returned in `kept`; it is tried again at the next start.
- `insrc.chat.index` is rewritten to the kept ids, or set to undefined when none were kept.
- Never throws; with no index it does nothing and returns { migrated: 0, kept: [] }.

### 2.5 `createMementoChatSessionStore`

```typescript
function createMementoChatSessionStore(deps: MementoStoreDeps): ChatSessionStore
```

**Returns:** `ChatSessionStore` — Unchanged and kept: createInMemoryChatSessionStore (the tests' store) is built on it, and its key names are what the migration reads. extension.ts stops constructing it.

## 3. Data model changes

### 3.1 `session head file (<root>/<name>.head.json)` — new

One JSON object: v (1), id, provider, createdAt, title, editMode, and when present mode, nativeSessionId and liveTurn, exactly as on ChatSession; plus updatedAt (the last row's `at`, else createdAt, as updatedAtOf computes today), rows (the transcript's length at the save, a record only) and savedAt (the time of the save, the eviction order). No transcript. A head that is not valid JSON or fails the same field checks as isSession (without transcript) reads as no session.

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `session rows file (<root>/<name>.rows.ndjson)` — new

One TranscriptEntry per line as JSON, each line ended by a newline. A read takes its rows from this file in file order. Only ever appended to by save(), except the two whole-file cases named in the contract and the migration's first copy.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/turn-lifecycle.ts`

### 3.3 `ChatSession` — invariant-change

No field changes. The store now relies on what the callers already do: the transcript is only pushed to (chat-panel.ts 238, 389, 812, 884, 896, 911). A tracked object whose transcript is shorter than its count is written whole instead of appended, so a caller that ever breaks the rule still gets a file equal to its transcript.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.4 `globalState keys insrc.chat.index and insrc.chat.session.<id>` — field-remove

No longer written. Read only by the migration, which removes each one after its session is verified on disk.

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/session-store.ts`

### 3.5 `extension.ts chat wiring and the text that pins it` — field-modify

Change sites beyond the new file and its tests. extension.ts: call migrateChatSessionsFromMemento over context.globalState first, build chatStore with createFileChatSessionStore over join(PATHS.insrc, 'chat-sessions') with the same maxSessions and the same onEvict, and sweep with a keep set of chatStore.list() ids plus the migration's kept ids. extension-chat-wiring.test.ts: replace the line-46 assertion (createMementoChatSessionStore over context.globalState) with ones for the file store, its root and the migration call placed before it; keep the onEvict assertion (255); change the sweep assertion (256) to the new keep set. Comments: the session-store.ts header ('no local-JSON file') and the ChatSession.liveTurn comment ('Sessions live in globalState') are corrected to name the files.

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`
- `vscode-plugin/src/chat/session-store.ts`

## 4. Error paths

**Error cases**

- **A save cannot write (disk full, directory not writable).** (recoverable)
  - Detection: appendText, writeText or rename throws inside save().
  - Response: save() lets the error out; trySaveSession logs it. The object's count is advanced only after its append succeeded, so rows that were not written are tried again by the next save and rows that were written are never written twice. A rows append that succeeded before a failing head write is kept: a read takes its rows from the rows file, not from the head's count.
  - User impact: The turn carries on; the rows are saved by a later save, or lost if every later save fails too.
- **The process dies in the middle of appending rows.** (recoverable)
  - Detection: On the next read the rows file's last line has no trailing newline or is not JSON.
  - Response: The read leaves that line out and cuts the file back to the end of the last complete line, so later appends start on a clean line.
  - User impact: At most the rows of the interrupted save are missing.
- **A head file is damaged or is not a session head.** (recoverable)
  - Detection: It is not valid JSON, or fails the field checks (id, provider, createdAt, title, editMode).
  - Response: get() returns undefined and list() leaves it out; nothing is deleted. A warning is logged once per file.
  - User impact: That chat is missing from the history; its files remain on disk.
- **A rows file holds a line in its middle that is not JSON.** (recoverable)
  - Detection: JSON.parse throws on a line that is not the last.
  - Response: The line is skipped and logged; the other rows are returned in order. The file is not rewritten.
  - User impact: One row of that chat is missing.
- **Another window appended to a session this window also holds.** (recoverable)
  - Detection: Before a save's append, the rows file's size is not the size this store recorded for that id after its last read or write.
  - Response: This object's new rows are appended after the other window's rows, the head is written and the recorded size is updated. The object stays tracked with its own count, so every later save of it (the cursor tracker's, the panel's, and the save after chat-panel.ts 1065's get) still only appends its new rows. Only the id's cached object is dropped, so the next get() reads the files and returns a fresh object with every row in file order.
  - User impact: No row of either window is lost and no file is replaced. The panel showing the older object keeps its own view until the chat is opened again, and the two windows' rows appear in the order they were saved.
- **The migration cannot write or verify a session.** (recoverable)
  - Detection: A file call throws, or the session read back from the files differs from the memento's copy.
  - Response: The memento entry is left exactly as it was, the id stays in the index and is returned in `kept`, a warning names the session, and the migration goes on with the next one. extension.ts keeps that id's output files out of the sweep.
  - User impact: That chat is still in globalState and not in the history until a later start migrates it; its output files are not removed meanwhile.
- **A memento session and its files disagree (neither is a prefix of the other).** (terminal)
  - Detection: The migration compares the rows pairwise up to the shorter length and finds a difference.
  - Response: Neither copy is changed; the memento entry is kept, the id is returned in `kept`, and a warning is logged.
  - User impact: The history shows the files' copy; the other copy stays in globalState.
- **Removing an evicted session's files fails.** (recoverable)
  - Detection: remove() throws during eviction.
  - Response: The error is logged, onEvict is still called for that id, and the save that triggered the eviction succeeds.
  - User impact: None; a stale file may remain.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| save() of a draft that has never been saved. | The directory is made if missing, all its rows are written, then its head; it now appears in list(). |
| save() with no new rows (only the title, mode or liveTurn changed). | Nothing is appended; only the head is replaced. |
| The same held object saved three times after another window appended: with a new row, with only a head change, and after a get() of its id. | Each save appends at most that object's new rows; the rows file is never replaced and holds both windows' rows. |
| save() of an object the store has never tracked, for an id whose files exist. | The rows file is replaced whole through a temporary file and a rename, then the head. No caller does this. |
| A session with an empty transcript. | A head and an empty or absent rows file; get() returns it with transcript []. |
| get() twice for one id with no outside change. | The same object both times, read from disk once. |
| An id containing characters outside A-Za-z0-9_-. | Its files are named by sessionFileName(id); the head's id field is the real id and is what get() and list() return. |
| maxSessions of 0, negative, or not set. | No cap, as today. |
| The migration runs with no index, or a second time after a full migration. | It reads nothing further, writes nothing and returns no kept id. |
| Two windows start at once and both migrate. | Each writes the same content through its own temporary file; the second finds the files equal to its memento copy and removes its memento entry. |
| A window running the previous plugin version saved a session to globalState after it was migrated. | At the next start the files' rows are a prefix of the memento's rows: the extra rows are appended, the result is verified, and the memento entry is removed. |
| list() with 200 sessions. | 200 small head reads and no rows file read. |

**Invariants to preserve**

- A missing or damaged entry reads as absent: get() returns undefined and list() returns what is readable, never throwing. [[c1]]
- draft() persists nothing until the first save; create() persists at once. [[c1]]
- list() returns id, provider, title and updatedAt, sorted by updatedAt descending, where updatedAt is the last row's `at` or createdAt. [[c1]]
- With a cap, saving never evicts the session being saved, the oldest sessions go first, and onEvict is called with each evicted id. [[c1]]
- Every row variant, editMode, mode, nativeSessionId and liveTurn round-trip unchanged through save and get. [[c1]]
- A save that fails throws to trySaveSession, which logs it; a turn never breaks on it. [[c3]]
- The callers hold one session object and save it repeatedly, and read and save synchronously; they are not edited. [[c2]]
- The output files of every session the user still has are kept by the start-up sweep. [[c4]]
- The wiring test still pins the store's construction, the onEvict and the sweep by text. [[c8]]

## 5. Test strategy

**Test framework:** `node:test run through tsx, with node:assert/strict; fakes injected, no real VS Code (as session-store.test.ts and chat-panel.test.ts do)`

**Test levels**

- **unit** — The file store's behaviour over an in-memory SessionFilesFs that records every call, so what a save writes is observed and not assumed.
  - Subjects: `a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row)`, `a save with no new rows writes the head only`, `a draft writes nothing until its first save, which writes its rows and then its head; create() saves at once`, `get returns the saved session with every row variant, editMode, mode, nativeSessionId and liveTurn unchanged, and the same object on a second call without reading the files again`, `list reads head files only, never a rows file, and returns id, provider, title and updatedAt sorted by updatedAt descending`, `a damaged head reads as no session and is left out of list; a rows file with a torn last line is read without it and cut back before the next append; a bad line in the middle is skipped`, `after another writer has appended to the rows file, the same held session object is saved three times (with a new row, with only a head change, and after a get of its id): every save only appends, the rows file is never replaced, it holds both writers' rows in save order, and the get returns a fresh object with all of them (mutation: untrack the object when the cached copy is dropped)`, `an object the store has never tracked, saved for an id whose files exist, replaces the rows file whole through a temporary file and a rename; so does a tracked object whose transcript is shorter than its count`, `a failing append or head write makes save throw and leaves the object's count where the rows on disk are, so the next save writes the missing rows once and none twice`, `with maxSessions set, a save that creates a new session removes the sessions with the oldest savedAt and their rows files and calls onEvict for each, never the session being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap`, `an id with characters outside A-Za-z0-9_- is stored under sessionFileName(id) and read back with its real id`
  - Fixtures: `an in-memory SessionFilesFs that records calls and can be told to fail one`
- **unit** — The one-time move out of globalState loses nothing and removes a memento entry only after its files are verified.
  - Subjects: `the migration writes each indexed session's files, reads them back equal, then removes its memento key and the index; the store then lists and returns every session as the memento store did`, `a session whose write or read-back fails is left in the memento untouched, stays in the index and is returned in kept, and the others are still migrated`, `a session whose files already hold a prefix of the memento's rows gets the missing rows appended and its memento key removed; one whose files hold more rows than the memento is left as it is on disk and its key removed; one that disagrees is changed in neither place and returned in kept`, `the migration with no index, or run a second time, reads no session, writes nothing and returns no kept id; an entry isSession rejects is kept and logged`
  - Fixtures: `a Map-backed MementoLike holding sessions written by createMementoChatSessionStore`
- **integration** — The file store over the real file system, under the real chat panel, and in the extension's wiring.
  - Subjects: `over a real temporary directory with two store instances on one session: each appends, then the first saves its held object twice more with a get between; the rows file holds every row of both, was never replaced, and a torn last line written by hand is dropped and cut back`, `the chat panel run over the file store: a turn's saves append only that turn's rows, a restored session shows the same rows, and a failing save is logged without breaking the turn`, `extension.ts runs the migration before it builds the file store over join(PATHS.insrc, 'chat-sessions') with the session cap and the onEvict, and the output sweep keeps the store's ids and the migration's kept ids`, `a session the migration kept in globalState keeps its output files through the start-up sweep`
  - Fixtures: `a temporary directory removed after the test`
- **smoke** — The real migration on the user's machine, which no automated test can stand in for.
  - Subjects: `after installing the build and reloading the window, the three existing chats open with their history, ~/.insrc/chat-sessions holds a head and a rows file for each, and the extension's value in state.vscdb no longer holds the sessions`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row)`, `a save with no new rows writes the head only` |
| `ac2` | `the migration writes each indexed session's files, reads them back equal, then removes its memento key and the index; the store then lists and returns every session as the memento store did`, `a session whose write or read-back fails is left in the memento untouched, stays in the index and is returned in kept, and the others are still migrated`, `a session the migration kept in globalState keeps its output files through the start-up sweep` |
| `ac3` | `after another writer has appended to the rows file, the same held session object is saved three times (with a new row, with only a head change, and after a get of its id): every save only appends, the rows file is never replaced, it holds both writers' rows in save order, and the get returns a fresh object with all of them (mutation: untrack the object when the cached copy is dropped)`, `over a real temporary directory with two store instances on one session: each appends, then the first saves its held object twice more with a get between; the rows file holds every row of both, was never replaced, and a torn last line written by hand is dropped and cut back`, `with maxSessions set, a save that creates a new session removes the sessions with the oldest savedAt and their rows files and calls onEvict for each, never the session being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap` |
| `ac4` | `list reads head files only, never a rows file, and returns id, provider, title and updatedAt sorted by updatedAt descending` |

## 6. Migration

**State before:** Sessions live in VS Code's globalState, one key per session with the transcript inline and an index key (s1: symbol.locate). VS Code stores all of the extension's keys as one value, measured at 29.6 MB for three sessions (s1: search.text), so each save rewrites all of it, up to every 500 ms during a turn (s1: usage.example, how callers hold and save a session).

**State after:** Sessions live in ~/.insrc/chat-sessions as a head file and a rows file each. globalState holds no chat session and no chat index once every session has been migrated. A save appends new rows and replaces a small head.

**Zero downtime:** yes — **Data rewrite:** yes

**Steps**

1. Add the file store and the migration function beside the memento store, with their tests. Nothing uses them yet. — ↩ rollbackable
2. At activation, run the migration before the store is built: copy each indexed session to files, read it back, and compare it with the memento's copy. Up to this point globalState is unchanged, so going back to the previous plugin version loses nothing. — ↩ rollbackable
3. For each session that verified, remove its key from globalState; rewrite the index to the kept ids, or remove it. From here the previous plugin version no longer sees the migrated chats; they remain in the files. — ✕ non-rollbackable
4. Build the chat store from the file store in extension.ts, with the same cap and the same onEvict, and give the output sweep the store's ids plus the ids the migration kept. Update the wiring test's pinned text and the two comments that say sessions live in globalState. — ↩ rollbackable
5. On every later activation the migration runs again and finds nothing, or picks up sessions a window on the previous version wrote to globalState in the meantime. — ↩ rollbackable

**Backward compat:** No public API changes: ChatSessionStore is unchanged. The stored location changes. A window still running the previous plugin version keeps reading and writing globalState: it does not see chats migrated by a newer window, and what it writes is migrated at the next start of a newer window (rows appended when the files hold a prefix of them, kept in globalState when the copies disagree). Installing the previous version after step 3 shows an empty history until the newer version is installed again; the files are not touched by it.

## 7. Alternatives considered

### 7.1 a1: Head file plus append-only rows file, synchronous — **CHOSEN**

Each session is two files under ~/.insrc/chat-sessions: a small head written whole and a rows file that a save only appends to.

A new file-backed ChatSessionStore keeps `<name>.head.json` (every ChatSession field except the transcript) and `<name>.rows.ndjson` (one transcript row per line). The store remembers, for each session object it has handed out or saved, how many of that object's rows are on disk; a save appends the rest and replaces the head through a temporary file and a rename. list() reads heads only. File access is synchronous through an injected seam, so the interface and its callers are unchanged. Sessions in globalState are copied to files once at start, read back, and only then removed.

### 7.2 a2: Same files, asynchronous store

The same two files, but every store method returns a promise and writes are queued per session.

The file layout of a1 with ChatSessionStore made asynchronous: get, list and save return promises and a per-session queue keeps writes in order. chat-panel.ts and turn-lifecycle.ts await the store wherever they read or save a session.

**Rejected because:** Same result on disk, but it rewrites the callers and their tests to remove synchronous calls that a1 already keeps small. Worth revisiting only if the first read of a very long session proves too slow in practice.

### 7.3 a3: Keep globalState, save less often

Leave sessions in globalState and reduce how often they are saved.

Keep the memento store and cut the number of updates: a longer cursor interval, and one save per turn at its end, with the cursor in a separate small key.

**Rejected because:** Does not fix the defect: fewer saves of the same size, and more lost on a crash.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/session-store.ts:195` — "void memento.update(SESSION_PREFIX + session.id, session);"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:1065` — "if (deps.store.get(session.id) !== undefined) deps.store.save(session);"
- **[[c3]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:92` — "export function trySaveSession(store: Pick<ChatSessionStore, 'save'>, log: ChatPanelLogger, target: ChatSession): void {"
- **[[c4]]** `code` `vscode-plugin/src/extension.ts:446` — "const chatStore = createMementoChatSessionStore({"
- **[[c5]]** `code` `vscode-plugin/src/chat/session-output.ts:176` — "export const sessionFileName = (sessionId: string): string => sessionId.replace(/[^A-Za-z0-9_-]/g, '_');"
- **[[c6]]** `step-output` `s1 search.text: measurement of state.vscdb on 2026-10-12` — "the extension's whole globalState is ONE row, key `insors.insrc-vscode`, 29,583,235 bytes of JSON"
- **[[c7]]** `prior-artifact` `ISSUE-c96a97a204fac22b` — "Make the cost of a save depend on what changed, not on the length of the history"
- **[[c8]]** `code` `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts:46` — "'the sc4 store binds over context.globalState (k3) with a bounded history cap (S005)'"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 0 could not be verified · 6 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-12T08:57:28.112Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| fix-targets-defect | MED | The design keeps a session from being lost or corrupted 'when a session is evicted', as the ISSUE's fix intent requires, including for a session object that is still held and saved after its files were removed. | ISSUE.md fix intent: 'must not be lost or corrupted by the change, including when several windows share the same global state and when a session is evicted'. Today a save after eviction rewrites the whole record and re-adds the id (session-store.ts:195-206), so the session comes back complete. The design says a tracked object 'only ever appends, whatever else has happened to the files', keeps its count 'for as long as the object lives', and treats any size difference as 'another writer appended'. It names no case for a rows file that is missing or smaller than the recorded size. So after eviction (by another window, or by this store while a non-current turn still holds the object — turn-lifecycle.ts:326 and 338 call trySave(s) on such an object) the save appends only the rows beyond the count and writes a head: the session reappears holding only its newest rows, or none. The whole-file rewrite only triggers for an untracked object or a transcript shorter than its count, neither of which is this case. [files: vscode-plugin/src/chat/session-store.ts, vscode-plugin/src/chat/turn-lifecycle.ts, docs/standalone/every-save-chat-session-rewrites-its-E20261012c96a97a2/ISSUE.md] | Add a third whole-file case to 2.2: when the rows file is missing or smaller than the size this store recorded for the id (or the head is gone), write the object's full transcript through a temporary file and rename, then the head. Add an error-path entry and a unit test for 'held object saved after its files were evicted/removed'. |
| change-sites | MED | The edits to session-store.ts are complete as listed (two comments; createMementoChatSessionStore 'unchanged and kept'), with the migration in session-file-store.ts reading 'the existing insrc.chat.index and insrc.chat.session.<id> keys' and using isSession and updatedAtOf. | session-store.ts:138-139 `const INDEX_KEY = 'insrc.chat.index'; const SESSION_PREFIX = 'insrc.chat.session.';`, line 141 `function isSession(v: unknown): v is ChatSession {` and line 154 `function updatedAtOf(s: ChatSession): string {` are all module-private (no `export`). The design puts migrateChatSessionsFromMemento and the head writer in a different file and relies on all four ('each indexed session that isSession accepts', head checks 'the same field checks as isSession', updatedAt 'as updatedAtOf computes today'), but lists only comment edits for session-store.ts. As written the new file cannot import them; the builder must either export them (an unlisted edit) or duplicate the key strings and checks, which would let the migration and the memento store drift. [files: vscode-plugin/src/chat/session-store.ts] | Add to 3.5: export INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf from session-store.ts (or state that the migration lives in session-store.ts), so the keys and checks have one source. |

#### Could not verify (does not block)

_None._
