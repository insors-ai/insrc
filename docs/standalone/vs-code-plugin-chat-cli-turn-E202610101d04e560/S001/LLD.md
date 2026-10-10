<!-- insrc:artifact LLD-1d04e56057b3daba-s1 -->

# LLD: E202610101d04e560:S001

## Summary

**Epic:** `vs-code-plugin-chat-cli-turn`
**HLD base run:** `wf-1791650359896-a1tx5r`
**HLD effective hash:** `92be0f55a8af...`

Each chat session gets one rolling output file on disk, and every CLI turn writes straight into it, separated from the turns before it by marker lines; output no longer lives only in a pipe the editor has to keep reading. The chat reads the file line by line and remembers how far it got, so a long turn, a pause in reading, or a window reload loses nothing: after a reload the chat picks up a turn that is still running (or finished while the window was gone) from where it stopped. Half-written lines are never shown. The file rolls over at turn boundaries once it grows past a size cap, so disk use stays bounded at one small file pair per session instead of one directory per turn.

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

### 2.1 `createSessionOutput (new, vscode-plugin/src/chat/session-output.ts)`

```typescript
function createSessionOutput(deps: { readonly root: string; readonly fs: SessionOutputFs; readonly maxBytes?: number | undefined; readonly pollMs?: number | undefined; readonly now?: (() => number) | undefined }): { beginTurn(sessionId: string, turnId: string): Promise<TurnSegment>; endTurn(sessionId: string, turnId: string, exit: { code: number | null; signal: string | null }): Promise<void>; tail(cursor: SegmentCursor, opts: { readonly finished: () => boolean; readonly signal?: AbortSignal | undefined }): AsyncIterable<{ readonly line: string; readonly cursor: SegmentCursor }>; errTail(sessionId: string): string; remove(sessionId: string): Promise<void>; sweep(opts: { readonly olderThanMs: number; readonly keep: ReadonlySet<string> }): Promise<void> } ; interface TurnSegment { readonly outPath: string; readonly errPath: string; readonly cursor: SegmentCursor } ; interface SegmentCursor { readonly sessionId: string; readonly turnId: string; readonly generation: number; readonly offset: number }
```

**Parameters:**
- `deps.root: string` — The output root, ~/.insrc/chat-output in production. Holds <sessionId>.ndjson (current), <sessionId>.1.ndjson (previous generation) and <sessionId>.err.log.
- `deps.fs: SessionOutputFs` — fs seam (mkdir, append, open, read at offset, stat, rename, rm, readdir).
- `deps.maxBytes: number` _(optional)_ — Roll-over threshold for a session file; default 4 MiB.

**Returns:** `SessionOutput` — beginTurn rolls the session file over if it is past maxBytes (rename to <sessionId>.1.ndjson, replacing the older generation, and start a new file whose first line is a generation header), truncates the err log, appends a turn-start marker line for turnId and returns the paths and the cursor just after that marker. endTurn appends a turn-end marker with the exit. tail yields each complete CLI line of that turn's segment with the cursor after it, skipping marker lines, and ends at the segment's turn-end marker, at the next turn's turn-start marker, or once finished() is true and the file is read to its end. remove deletes a session's files; sweep deletes files untouched for olderThanMs whose session is not in keep.

**Errors:**
- `Error (fs)` when beginTurn cannot create or append to the session file: the caller falls back to the pipe for that turn.

**Preconditions:**
- beginTurn is called only while the caller holds the session lease (ISSUE-d6a4bc79), so a session file has one writer at a time and segments never interleave.

**Postconditions:**
- Marker lines carry a reserved key ("insrc.marker": "file" | "turn-start" | "turn-end") that no CLI stream line has; the mapper never sees them.
- A segment is never split across generations: roll-over happens only in beginTurn, between turns.
- tail never yields a line that is not newline-terminated until the writer has finished; a final unterminated line is yielded only once finished() is true.
- A cursor's offset is a byte position in the generation it names, so reading again from a yielded cursor resumes exactly after that line; a cursor naming the previous generation reads <sessionId>.1.ndjson.

### 2.2 `nodeSpawner / SpawnFn`

```typescript
type SpawnFn = (command: string, args: readonly string[], opts: { readonly cwd: string; readonly output?: { readonly outPath: string; readonly errPath: string; readonly cursor: SegmentCursor; readonly tail: (cursor: SegmentCursor, finished: () => boolean) => AsyncIterable<{ readonly line: string; readonly cursor: SegmentCursor }>; readonly errTail: () => string } | undefined }) => SpawnedProcess
```

**Parameters:**
- `opts.output: { outPath; errPath; cursor; tail; errTail }` _(optional)_ — When present, the CLI's stdout and stderr are opened in append mode on the session's files and passed as the child's file descriptors (stdin stays a pipe for write()); lines() reads the turn's segment through tail from cursor.

**Returns:** `SpawnedProcess` — lines() yields the turn's complete lines until the process has exited and the segment is read; stderr() returns errTail(); SpawnedProcess gains readonly cursor?: SegmentCursor (the latest position read).

**Postconditions:**
- Without opts.output the spawner behaves as today (pipes), so fakes and fallbacks keep working.

### 2.3 `StreamAdapter`

```typescript
interface StreamAdapter { run(req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent>; resume(req: { readonly cursor: SegmentCursor; readonly pid: number | undefined; readonly startedAt: number | null }, opts?: { readonly onProgress?: ((cursor: TurnCursor) => void) | undefined; readonly signal?: AbortSignal | undefined; readonly onAttach?: ((proc: TurnProcess) => void) | undefined }): AsyncIterable<TurnEvent>; cancel(turnId: string): Promise<void>; decide(turnId: string, requestId: string, decision: 'approve' | 'deny'): void; readonly capabilities: { readonly resume: boolean } } ; interface RunOptions { readonly onSpawn?: ((proc: TurnProcess) => void) | undefined; readonly onProgress?: ((cursor: TurnCursor) => void) | undefined; readonly sessionId?: string | undefined } ; interface AdapterDeps { readonly spawn: SpawnFn; readonly isInstalled: BinaryProbe; readonly logger?: AdapterLogger; readonly stopGraceMs?: number; readonly sessionOutput?: SessionOutput | undefined } ; type TurnCursor = SegmentCursor
```

**Parameters:**
- `opts.onProgress: (cursor: TurnCursor) => void` _(optional)_ — Called after the events of each output line have been yielded, with the offset just after that line, so the caller can persist how far it has handled.
- `resume req: { cursor; pid; startedAt }` — Follow an earlier turn's segment from a saved cursor (after a reload): map its lines with the same mapper until a terminal event, the segment's end marker, or until the process has exited and the segment is read.
- `resume opts.onAttach: (proc: TurnProcess) => void` _(optional)_ — Hands the followed turn's process (built from the recorded pid and start time) to the caller, so Stop can end a resumed turn: its stop() signals the recorded pid's process group only while the start time still matches (never a reused pid), SIGTERM then SIGKILL after the grace.
- `opts.sessionId: string` _(optional)_ — The chat session the turn belongs to (ChatSession.id). chat-panel runTurn passes it, inside runLeased, so the adapter only begins a segment while the caller holds that session's lease. Without it (title generation, fakes) the turn uses the pipe.
- `deps.sessionOutput: SessionOutput` _(optional)_ — The session-output instance createProviderRegistry hands to each adapter; extension.ts builds it on ~/.insrc/chat-output. Without it every turn uses the pipe.

**Returns:** `AsyncIterable<TurnEvent>` — The same events a live run would have yielded for those lines.

**Postconditions:**
- When both deps.sessionOutput and opts.sessionId are present, run() calls beginTurn(sessionId, turnId) and passes the turn's segment to the spawner; if that fails it logs once and uses the pipe for that turn. With either missing it uses the pipe as today.
- run() appends the turn-end marker when the process exits (endTurn). If the extension host is gone at that moment there is no end marker; a reader then ends the segment at the next turn-start marker or once the recorded process is no longer alive and the file is read.
- After the terminal event run() keeps draining the segment in the background, so nothing the CLI writes later is lost and the turn-end marker is written after the real exit.

### 2.4 `TurnProcess`

```typescript
interface TurnProcess { readonly pid: number | undefined; readonly exit: Promise<{ code: number | null; signal: string | null }>; readonly cursor: SegmentCursor | undefined; kill(signal: 'SIGTERM' | 'SIGKILL'): void; stop(): Promise<void> }
```

**Returns:** `type` — Gains the segment cursor so the lease and the session can record which turn of which file the process is writing.

### 2.5 `createChatPanelHost (runTurn / postInitialState / cancelActive)`

```typescript
function createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost
```

**Returns:** `ChatPanelHost` — Unchanged surface.

**Postconditions:**
- runTurn records the turn's cursor on the session (liveTurn, with this extension host's pid as owner) as lines are handled (onProgress) and clears it at the terminal event.
- When a session is shown (open, ready, restore, open-chat) with a liveTurn whose session file still holds its segment (same generation, or the previous one), the panel follows it with adapter.resume from the saved offset only if liveTurn's owner host is this host or is no longer alive (a reload gives a new host pid; a second live window is not the owner and does not follow). On taking over it records itself as owner. It posts and appends only the events after the offset and clears liveTurn at the terminal event; a cursor whose generation is gone (rolled over twice since) clears liveTurn.
- A resumed turn holds no lease of its own: the session lock still names the original process, so a new message waits for it as for any holder.
- cancelActive splits in two. Stop (cancel-turn) ends the running process at once, for a live turn (liveProc from onSpawn, adapter.cancel) and for a resumed one (the TurnProcess from resume's onAttach). A chat switch (open-chat, new-chat), the panel closing (onDidDispose, dispose) and adopt() only stop following a turn that writes to the session file: its process keeps running and keeps the lease, and its cursor stays saved so showing the session again resumes it. A turn without a session file (pipe fallback, test fakes) is still stopped on those paths, as today, since it could not be resumed.

## 3. Data model changes

### 3.1 `session output files (new, ~/.insrc/chat-output/<sessionId>.ndjson, <sessionId>.1.ndjson, <sessionId>.err.log)` — new

One rolling file per chat session, not per turn. The first line of each generation is {"insrc.marker":"file","sessionId","generation"}. Each turn is a segment: {"insrc.marker":"turn-start","turnId","at"}, then the CLI's own stream-json lines (appended by the CLI itself), then {"insrc.marker":"turn-end","turnId","code","signal"}. Once the file passes maxBytes (default 4 MiB) it rolls over at the next turn start: the current file becomes <sessionId>.1.ndjson (the older .1 is dropped) and a new generation begins, so a session uses at most about 2 x maxBytes. The err log holds the current turn's stderr only. Files are removed with their session (history eviction or delete) and swept when untouched for 30 days with no session referring to them. This session-scoped removal, plus roll-over, replaces the ISSUE's intent of cleaning up after each turn.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `LockFileRecord (session-lock.ts)` — field-add

output: { sessionFile: string; turnId: string } | null, written on attach with the CLI pid, so whoever finds the session held knows which file and which turn segment the holder is writing.

```
+ output: { sessionFile: string; turnId: string } | null
```

**Call sites:**
- `vscode-plugin/src/chat/session-lock.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `ChatSession (session-store.ts)` — field-add

liveTurn?: { cursor: { turnId: string; generation: number; offset: number }; ownerHostPid: number; pid?: number; startedAt?: number | null } while a turn's segment has not been fully handled; ownerHostPid names the extension host following it, because sessions live in globalState shared by every window. Optional, so stored sessions without it load unchanged.

```
+ liveTurn?: { cursor: { turnId; generation; offset }; ownerHostPid: number; pid?: number; startedAt?: number | null }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.4 `SpawnedProcess / RunOptions / StreamAdapter (cli-adapter.ts)` — field-add

SpawnFn opts.output (session file paths, segment cursor, tail); SpawnedProcess.cursor; TurnProcess.cursor; RunOptions.onProgress and RunOptions.sessionId (written by chat-panel runTurn); AdapterDeps.sessionOutput (written by extension.ts through createProviderRegistry); StreamAdapter.resume(cursor); the stream mappers skip marker lines.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/__tests__/fixtures.ts`

### 3.5 `cancelActive callers (chat-panel.ts)` — invariant-change

Today every caller of cancelActive stops the process (Stop, open-chat, new-chat, onDidDispose, dispose, adopt). After this Story only Stop does; the others detach from a turn that writes to the session file and leave it running and resumable. This changes the invariant 'switching chat or closing the panel ends the turn' (c4) on purpose: with durable output, ending it would lose the very output this Story keeps.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Error paths

**Error cases**

- **The session file cannot be created or appended to (permissions, disk full) when a turn starts.** (recoverable)
  - Detection: beginTurn rejects inside run() before spawning.
  - Response: run() logs once and spawns with pipes as today for that turn; no cursor is recorded, so that turn cannot be resumed after a reload.
  - User impact: The turn works; only its reload-resume is lost.
- **The output file disappears or cannot be read while tailing (deleted by hand, disk error).** (recoverable)
  - Detection: The tail's read or stat rejects with an fs error other than end of file.
  - Response: The tail ends; run()/resume() yield an error event naming the output file and the turn ends; the session's liveTurn is cleared.
  - User impact: The turn shows an error instead of hanging.
- **After a reload the saved liveTurn names a generation that no longer exists (the session file rolled over twice since, or the session's files were removed).** (recoverable)
  - Detection: Neither <sessionId>.ndjson nor <sessionId>.1.ndjson has a generation header matching the cursor's generation, or the files are missing (ENOENT).
  - Response: liveTurn is cleared and saved; nothing is resumed; the stored transcript is shown as before.
  - User impact: None beyond what was already stored.
- **The process died without writing a terminal event and the file ends without one.** (recoverable)
  - Detection: The tail reaches end of file after the process is gone (exit settled, or for resume, the recorded pid is no longer alive or its start time no longer matches).
  - Response: As today for a closed stdout: a done(false) if it was signalled, an error with the err.log tail if it exited non-zero, or a done(true) for a clean exit; for resume, where the exit code is unknown, an error saying the turn ended without a result.
  - User impact: The turn ends visibly instead of hanging.
- **The cursor's offset is past the end of its generation file (truncated or replaced by hand).** (recoverable)
  - Detection: stat size of the file holding the cursor's generation is smaller than the offset.
  - Response: The reader looks for the cursor's turn-start marker in that generation and resumes from just after it, with a warning; if the marker is not found, liveTurn is cleared.
  - User impact: Possible duplicate rows in a corrupted case; output is never shown out of order.
- **A turn ended while the extension host was gone, so no turn-end marker was written.** (recoverable)
  - Detection: The reader reaches end of file without a turn-end marker, and the recorded pid is no longer alive (or its start time no longer matches); or it meets the next turn-start marker first.
  - Response: The segment ends there; if no terminal event was seen, an error says the turn ended without a result. The next beginTurn writes a turn-end marker for the open segment (code unknown) before its own turn-start, so the file stays well-formed.
  - User impact: The turn ends visibly; no hang.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A turn that runs for a long time and writes output long after its result line (background work). | Every line is kept in the session file inside the turn's segment; the panel shows events up to the terminal one, the rest is drained, and the turn-end marker follows the real exit. |
| A line written in two parts (the CLI flushes half a JSON line, then the rest). | The tail waits for the newline; the half line is never mapped or shown. |
| The window reloads while a turn is still running. | On reopening the session, the panel follows the same output file from the last handled offset, shows only the new events, and the session stays held by the original process until it exits. |
| The window reloads after the turn finished but before its output was read. | The panel reads the rest of the turn's segment from the saved cursor, shows the remaining events including the terminal one, and clears liveTurn. Nothing is removed at the end of a turn: the session file stays (bounded by roll-over) and is removed with its session or by the sweep. This session-scoped cleanup replaces the ISSUE's per-turn cleanup intent, which would have meant one directory per turn. |
| The same session open in two windows while a turn runs. | liveTurn records its owner host. The other window, whose host is alive and not the owner, does not follow the output; a new message there waits on the lock. If the owner window closes or reloads (its host pid is gone), the next window to show the session takes ownership and follows from the saved offset. |
| A provider adapter or fake spawner that does not support output files. | run() uses the pipe path unchanged and records no cursor; resume() is never called for it. |
| The user switches to another chat, or closes the panel, while a turn with an output file is running. | The panel stops following; the process keeps running and holds the lease; showing the session again resumes from the saved offset. |
| The user presses Stop on a turn that was resumed after a reload. | Its process group is stopped at once (SIGTERM, then SIGKILL after the grace) if the recorded pid's start time still matches; the lease is released when it exits. |
| Many short turns in one session over days. | They are segments of one file; once it passes 4 MiB it rolls over at a turn start, so the session never uses more than about two files of that size plus its err log. |
| A roll-over happens while a reloaded window still holds a cursor in the previous generation. | The cursor names the previous generation, which is now <sessionId>.1.ndjson; the reader follows it there. Roll-over never happens while a turn is writing, so the followed segment is complete in that file. |
| A CLI line that happens to contain the text "insrc.marker" inside a string. | Only lines whose top-level JSON object has the "insrc.marker" key are markers; such a CLI line is mapped as usual. |

**Invariants to preserve**

- The adapter yields the same events for the same CLI lines, up to and including the first terminal event; permission decisions still reach the live process through stdin. [[c1]]
- The per-session lock still names the process that holds a session and is released only when that process exits. [[c2]]
- Stored sessions without the new field load unchanged; the transcript shape does not change. [[c3]]
- The panel's generation guard keeps superseded events out of the transcript, and Stop still ends the running process at once (now also for a resumed turn). Changed on purpose: a chat switch or closing the panel no longer ends a turn that has an output file (see the cancelActive data-model change). [[c4]]
- Existing adapter and panel tests keep passing; fakes without session files keep working, and the mappers yield the same events for CLI lines. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via tsx in vscode-plugin (npx tsx --test 'src/**/__tests__/*.test.ts'), node:assert/strict; real temp directories for output files; fakes from __tests__/fixtures.ts; the real nodeSpawner against 'sh -c' scripts`

**Test levels**

- **unit** — The session-output module on its own.
  - Subjects: `session-output.test.ts: a turn's segment is the lines between its turn-start and turn-end markers; tail yields only complete CLI lines with the cursor after each, skips marker lines, holds back a half-written line until its newline, and follows growth until the writer finishes`, `session-output.test.ts: tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished`, `session-output.test.ts: the file rolls over at a turn start once past maxBytes, keeping one previous generation, and a cursor in the previous generation is still read from <sessionId>.1.ndjson`, `session-output.test.ts: remove deletes a session's files; sweep removes old files of sessions not in keep and leaves the rest; one session uses one file pair however many turns it runs`
- **integration** — The real spawner and the adapter over output files.
  - Subjects: `cli-adapter.test.ts: the real spawner appends the CLI's stdout to the session file inside its turn segment and stderr to the err log, and lines() yields every line including those written after the result line`, `cli-adapter.test.ts: run() yields the same events from the output file as from a pipe, reports progress offsets, and writes the turn-end marker after the process exits`, `cli-adapter.test.ts: resume() from a saved offset yields only the later events, ends at the terminal event, and ends with an error when the process is gone without one`, `session-lock.test.ts: the lock record carries the holder's session file and turn after attach`, `cli-adapter.test.ts: resume()'s handed-over process stops the recorded pid's group only while its start time matches`
- **integration** — The panel's cursor and reload resume.
  - Subjects: `chat-panel.test.ts: a turn records its cursor on the session as lines are handled and clears it at the terminal event`, `chat-panel.test.ts: after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end`, `chat-panel.test.ts: a cursor whose generation is gone (rolled over twice) is cleared without resuming`, `chat-panel.test.ts: switching chat or closing the panel stops following a turn writing to the session file without stopping its process, and showing the session again resumes it; a turn without one is still stopped`, `chat-panel.test.ts: Stop ends a resumed turn's process through the handle resume() hands over`, `chat-panel.test.ts: a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `cli-adapter.test.ts: 'the real spawner appends the CLI's stdout to the session file inside its turn segment ... including those written after the result line'`, `session-output.test.ts: 'tail ... follows growth until the writer finishes'` |
| `ac2` | `chat-panel.test.ts: 'after a reload a session with a live cursor is followed from the saved offset, only new events are posted and appended'`, `cli-adapter.test.ts: 'resume() from a saved offset yields only the later events'` |
| `ac3` | `session-output.test.ts: 'tail ... holds back a half-written line until its newline'` |
| `ac4` | `session-output.test.ts: 'the file rolls over at a turn start once past maxBytes, keeping one previous generation'`, `session-output.test.ts: 'one session uses one file pair however many turns it runs'` |
| `ac5` | `session-lock.test.ts: 'the lock record carries the holder's session file and turn after attach'`, `chat-panel.test.ts: 'a turn records its cursor on the session as lines are handled'` |

## 6. Migration

**State before:** Per s1: the real spawner pipes the CLI's stdout and stderr; lines() reads the pipe in memory and stderr is an in-memory string. run() stops yielding at the first terminal event and drains the rest of the pipe in the background, discarding it. Anything in flight when the extension host stops reading or goes away (reload, crash) is lost, and the panel never resumes a turn after a reload; it only replays the stored transcript.

**State after:** Each session has one rolling output file under ~/.insrc/chat-output/ (<sessionId>.ndjson, one previous generation, and an err log). Every turn's CLI appends its stdout to that file inside a segment framed by turn-start and turn-end markers. The adapter tails the turn's segment by cursor and reports progress; the session stores the cursor while the segment is unread, and the lock record names the file and turn. After a reload the panel follows a still-running or unread turn from its cursor. Files roll over at turn starts past 4 MiB and are removed with their session or swept when stale. Without a session file (fakes, or a failure to create it) the pipe path works as before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the session-output module (begin/end turn markers, segment tail by cursor, roll-over, remove, sweep) with its tests. — ↩ rollbackable
2. Let the real spawner append stdout and stderr to the session's files when given a segment; make run() begin and end the turn's segment, report progress cursors and keep draining after the terminal event; add resume(cursor); make the mappers skip marker lines; keep the pipe path for fakes and fallbacks. — ↩ rollbackable
3. Add output (session file and turn) to the lock record and liveTurn (cursor and owner host) to the chat session (both optional). — ↩ rollbackable
4. Make the panel record and clear the cursor during a turn, follow a live cursor when a session is shown, and remove a session's files when the session is removed; wire the output root and the start-up sweep in extension.ts. — ↩ rollbackable

**Backward compat:** Internal to the plugin. The new fields on ChatSession and LockFileRecord are optional, so stored sessions and existing lock files load unchanged. SpawnFn's output option and RunOptions.onProgress are optional, so fake spawners and existing callers keep the pipe path. StreamAdapter gains resume(); in-repo adapters and test fakes are updated. Rolling back leaves session output files, which are harmless and bounded (about two files per session) and swept by age.

## 7. Alternatives considered

### 7.1 a1: One rolling output file per session, with turns as segments framed by marker lines — **CHOSEN**

Every turn's CLI appends its stdout to the session's file under ~/.insrc/chat-output/, between turn-start and turn-end marker lines; the adapter tails the turn's segment by cursor, the file rolls over at turn boundaries past a size cap, and the lock file names the file and turn so a reloaded window can resume.

A vscode-free session-output module owns <sessionId>.ndjson, one previous generation and an err log per session. Because the session lock allows one CLI process per session, turns append one after another: before spawning, the host appends a turn-start marker, and the real spawner passes the session file (opened in append mode) as the child's stdout, so the CLI writes its own lines into the file and keeps writing even if the extension host goes away; the host appends a turn-end marker when the process exits. lines() tails the turn's segment from the cursor after its turn-start marker, yields only newline-terminated CLI lines (markers are skipped, partial lines wait), and stops at the segment's end. The session stores the cursor (turn, generation, offset) while the segment is unread, so after a reload the panel resumes from there. Once the file passes a size cap it rolls over at the next turn start, keeping one previous generation, so disk use is bounded per session.

### 7.2 a2: An IPC channel owned by the extension (a named pipe or Unix socket per turn)

The extension listens on a per-turn socket and the CLI's stdout is connected to it; the extension buffers lines in memory and serves replays.

The extension creates a per-turn Unix socket (or Windows named pipe) and spawns the CLI with stdout connected to it through a small shim. Incoming bytes are split into lines and kept in an in-memory ring per turn with sequence numbers; readers subscribe from a sequence number. A reloaded window reconnects by turn id.

**Rejected because:** Fails the reload case without a new broker process.

### 7.3 a3: Keep the pipe, tee everything the extension reads into a per-turn file

The extension still reads stdout from the pipe but appends each chunk to a per-turn file so the panel can re-read it later.

lines() keeps iterating child.stdout but writes every chunk to a per-turn log file before splitting lines; the adapter keeps reading after done to keep the log complete. The panel can replay the log from an offset.

**Rejected because:** Cheap, but loses output whenever the extension host is not reading.

### 7.4 a4: A per-turn output file the CLI writes to directly, tailed by the extension

The CLI's stdout and stderr are redirected at spawn to files under ~/.insrc/chat-output/<turnId>/, the adapter reads complete lines by tailing the stdout file from an offset, and the lock file names the output file so a reloaded window can resume.

A vscode-free turn-output module owns a per-turn directory with out.ndjson and err.log. The real spawner opens both in append mode and passes them as the child's stdout and stderr file descriptors (stdin stays a pipe for permission decisions), so the CLI writes to the file itself and keeps writing even if the extension host goes away. lines() becomes a tail reader over out.ndjson: it reads from a byte offset, yields only newline-terminated lines (a trailing partial line waits for more bytes), follows growth until the process has exited and the file is fully read, and reports the offset after each line. The adapter yields the same events as today. The lock file record gains the output directory, so after a reload the panel can find a still-running (or finished but unread) turn of its session, and the chat session stores the last handled offset per turn so the panel resumes from there and appends only new events to the transcript. The directory is removed once the process has exited and the reader reached end of file; stale directories are swept on start.

**Rejected because:** One directory and two files per turn floods the filesystem: a busy session creates thousands of entries, and cleanup depends on every turn being read to its end. A per-session rolling file keeps one bounded file pair per session (user review, 2026-10-10).

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "nodeSpawner stdio pipes; lines() over child.stdout; run() drains after the terminal event"
- **[[c2]]** `code` `vscode-plugin/src/chat/session-lock.ts` — "LockFileRecord { sessionId, cliPid, hostPid, startedAt, token }"
- **[[c3]]** `code` `vscode-plugin/src/chat/session-store.ts` — "ChatSession { id, provider, nativeSessionId?, ..., transcript }"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "runTurn / acquireSessionLease / runLeased / postInitialState"
- **[[c5]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — "fake spawner and real nodeSpawner against sh -c; chat-panel.test.ts; session-lock.test.ts"
- **[[c6]]** `prior-artifact` `docs/standalone/vs-code-plugin-chat-cli-turn-E202610101d04e560/ISSUE.md` — "ISSUE-1d04e56057b3daba"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T16:56:12.039Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| fix-targets-defect | MED | The cleanup the design describes (a per-session rolling file removed with its session or swept when stale) stays consistent everywhere in the LLD, replacing the ISSUE's 'cleaned up once the turn's process has exited and its output has been read'. | Section 3.1 and the rejected alternative a4 say files are removed with the session and never per turn. The edge-case row 'The window reloads after the turn finished but before its output was read' still says the panel '...shows the remaining events including the terminal one, then removes the directory'. That text is left over from the rejected per-turn-directory design a4. It contradicts the chosen design, and the ISSUE's per-turn cleanup intent is replaced without saying so in the edge cases. [files: docs/standalone/vs-code-plugin-chat-cli-turn-E202610101d04e560/S001/LLD.md, docs/standalone/vs-code-plugin-chat-cli-turn-E202610101d04e560/ISSUE.md] | Fix the edge-case row: nothing is removed at the end of a turn; liveTurn is cleared. State explicitly that the session-scoped removal and sweep replace the ISSUE's per-turn cleanup intent. |
| change-sites | MED | run() can call beginTurn(sessionId, turnId) 'for the session (it holds the lease)' without any change beyond those listed (SpawnFn opts.output, RunOptions.onProgress, resume, TurnProcess.cursor). | TurnRequest (cli-adapter.ts:42-60) carries only provider, prompt, resume, cwd, permissionMode and allowedTools. It has no chat session id. The adapter never sees the lease either: chat-panel.ts:694-719 acquires it and passes only `{ onSpawn }` to `adapter.run(req, ...)`. The design gives the adapter no way to learn the session id or the session-output instance, and its change list (3.4) adds neither a TurnRequest/RunOptions field nor an AdapterDeps member for SessionOutput. [files: vscode-plugin/src/chat/cli-adapter.ts, vscode-plugin/src/chat/chat-panel.ts] | Add the missing change sites: a session id on TurnRequest or RunOptions, and the SessionOutput dependency on AdapterDeps or RunOptions. List chat-panel.ts runTurn as their writer. |

#### Could not verify (does not block)

_None._
