<!-- insrc:artifact PLAN-1d04e56057b3daba-s1 -->

# Plan: E202610101d04e560:S001

## Summary

**Epic:** `vs-code-plugin-chat-cli-turn`
**LLD run:** `wf-1791650359896-a1tx5r`
**LLD effective hash:** `92be0f55a8af...`

Building this Story adds a vscode-free module that keeps one rolling output file per chat session, with each turn framed as a segment by marker lines, a tail reader that yields only complete lines with a resumable cursor, and roll-over and cleanup that keep disk use bounded. The real spawner then points the CLI's stdout and stderr at those files, the adapter writes each turn as a segment, reports its cursor and can resume a saved one. Finally the lock record and the session store carry the segment and cursor, the panel records the cursor and resumes it after a reload, Stop is separated from merely detaching, and the extension wires it all in.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the session-output module: segments, markers and the tail reader | M | — | unit: session-output.test.ts: a turn's segment is the lines between its turn-start and turn-end markers; tail yields only complete CLI lines with the cursor after each, skips marker lines, holds back a half-written line until its newline, and follows growth until the writer finishes; unit: session-output.test.ts: tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished | [[c1]] [[c7]] |
| 2 | **`t2`** Add roll-over, remove and sweep to the session-output module | S | `t1` | unit: session-output.test.ts: the file rolls over at a turn start once past maxBytes, keeping one previous generation, and a cursor in the previous generation is still read from <sessionId>.1.ndjson; unit: session-output.test.ts: remove deletes a session's files; sweep removes old files of sessions not in keep and leaves the rest; one session uses one file pair however many turns it runs | [[c1]] [[c7]] |
| 3 | **`t3`** Let the real spawner write the CLI's output to the session files | M | `t1` | integration: cli-adapter.test.ts: the real spawner appends the CLI's stdout to the session file inside its turn segment and stderr to the err log, and lines() yields every line including those written after the result line; unit: cli-adapter.test.ts: marker lines reaching a mapper produce no events | [[c2]] |
| 4 | **`t4`** Make run() write each turn as a segment and report progress | M | `t3` | integration: cli-adapter.test.ts: run() yields the same events from the output file as from a pipe, reports progress offsets, and writes the turn-end marker after the process exits; integration: cli-adapter.test.ts: a beginTurn failure falls back to the pipe with one logged error | [[c2]] [[c7]] |
| 5 | **`t5`** Add resume() for following a saved segment | M | `t4` | integration: cli-adapter.test.ts: resume() from a saved offset yields only the later events, ends at the terminal event, and ends with an error when the process is gone without one; integration: cli-adapter.test.ts: resume()'s handed-over process stops the recorded pid's group only while its start time matches | [[c2]] [[c7]] |
| 6 | **`t6`** Record the segment on the lock and the session | S | `t1` | integration: session-lock.test.ts: the lock record carries the holder's session file and turn after attach; unit: session-store.test.ts: liveTurn round-trips through the store, a session without it loads unchanged, and eviction calls onEvict with the evicted id | [[c3]] [[c4]] |
| 7 | **`t7`** Record and clear the turn cursor in the panel | S | `t4`, `t6` | integration: chat-panel.test.ts: a turn records its cursor on the session as lines are handled and clears it at the terminal event | [[c5]] |
| 8 | **`t8`** Resume a saved cursor when a session is shown | M | `t5`, `t7` | integration: chat-panel.test.ts: after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end; integration: chat-panel.test.ts: a cursor whose generation is gone (rolled over twice) is cleared without resuming; integration: chat-panel.test.ts: a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over | [[c5]] [[c7]] |
| 9 | **`t9`** Split Stop from detach in the panel | M | `t8` | integration: chat-panel.test.ts: switching chat or closing the panel stops following a turn writing to the session file without stopping its process, and showing the session again resumes it; a turn without one is still stopped; integration: chat-panel.test.ts: Stop ends a resumed turn's process through the handle resume() hands over | [[c5]] |
| 10 | **`t10`** Wire the session output in the extension | S | `t2`, `t4`, `t6` | integration: extension-chat-wiring.test.ts: the extension builds a session output on ~/.insrc/chat-output, passes it to the provider registry, and wires onEvict and the start-up sweep | [[c6]] |

### 1.1 E202610101d04e560:S001:T001 — Add the session-output module: segments, markers and the tail reader

New vscode-free vscode-plugin/src/chat/session-output.ts: createSessionOutput({ root, fs, maxBytes, pollMs, now }) with beginTurn (generation header on a new file, closes an open segment with a turn-end marker of unknown code, appends turn-start, truncates the err log, returns paths and cursor), endTurn (turn-end marker), tail(cursor, { finished, signal }) yielding complete CLI lines of one segment with the cursor after each (markers skipped; ends at the segment's turn-end, the next turn-start, or EOF once finished), errTail, and the marker grammar (top-level "insrc.marker" key only).

**Acceptance checks:**
- A segment is exactly the CLI lines between its turn-start and turn-end markers; markers are never yielded.
- tail holds back a half-written line until its newline and follows growth until finished() is true; a final unterminated line is yielded only then.
- Tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end ends at the next turn-start or once finished at EOF, and the next beginTurn closes it with a turn-end of unknown code.
- A CLI line that merely contains the text insrc.marker inside a string is yielded as a CLI line.

### 1.2 E202610101d04e560:S001:T002 — Add roll-over, remove and sweep to the session-output module

beginTurn rolls the session file over at a turn start once it passes maxBytes (default 4 MiB): rename to <sessionId>.1.ndjson replacing the older generation, start a new generation with its header. tail reads a cursor's generation from whichever file holds it; an offset past its file's end re-anchors at the cursor's turn-start marker or reports the segment gone. remove(sessionId) deletes the session's files; sweep({ olderThanMs, keep }) removes stale files of sessions not in keep.

**Acceptance checks:**
- Past maxBytes the file rolls over only at a turn start, keeping exactly one previous generation; a segment is never split.
- A cursor in the previous generation is read from <sessionId>.1.ndjson; a generation that is gone is reported so the caller can clear its cursor.
- One session uses one file pair (plus one previous generation) however many turns it runs; remove and sweep delete only what they should.

### 1.3 E202610101d04e560:S001:T003 — Let the real spawner write the CLI's output to the session files

cli-adapter.ts: SpawnFn opts.output { outPath, errPath, cursor, tail, errTail }; when present nodeSpawner opens outPath and errPath in append mode and passes them as the child's stdout and stderr (stdin stays a pipe), lines() reads the turn's segment through tail until the process has exited and the segment is read, stderr() returns errTail(), and SpawnedProcess.cursor tracks the latest position. Without output the pipe path is unchanged. The stream mappers skip marker lines.

**Acceptance checks:**
- With output, the CLI's stdout lands in the session file inside its segment and stderr in the err log; lines() yields every line, including lines written after the result line.
- Without output, the spawner and all existing adapter tests behave as before.
- Marker lines reaching a mapper produce no events.

### 1.4 E202610101d04e560:S001:T004 — Make run() write each turn as a segment and report progress

AdapterDeps.sessionOutput and RunOptions.sessionId/onProgress. When both are present run() calls beginTurn(sessionId, turnId) before spawning, passes the segment to the spawner, reports onProgress(cursor) after each line's events, hands TurnProcess.cursor in onSpawn, keeps draining after the terminal event, and calls endTurn with the exit when the process exits (only while this host is alive; a turn that outlives the host is closed by the next beginTurn). A beginTurn failure logs once and uses the pipe for that turn.

**Acceptance checks:**
- run() yields the same events from the session file as from a pipe and reports a cursor after each line.
- The turn-end marker is written after the process's real exit, including when it outlives its answer.
- A beginTurn failure falls back to the pipe with one logged error; without sessionId or sessionOutput the pipe is used.

### 1.5 E202610101d04e560:S001:T005 — Add resume() for following a saved segment

StreamAdapter.resume({ cursor, pid, startedAt }, { onProgress, signal, onAttach }): maps the segment's lines from the cursor with the same mapper, ends at the terminal event or the segment's end, and ends with an error when the recorded process is gone without one; onAttach hands a TurnProcess whose stop() signals the recorded pid's group only while its start time matches (SIGTERM, then SIGKILL after the grace).

**Acceptance checks:**
- resume() from a saved cursor yields only the later events and ends at the terminal event.
- When the recorded process is gone and the segment has no terminal event, resume() ends with an error saying the turn ended without a result.
- The handed-over process stops the recorded group only while the start time matches; a reused pid is never signalled.

### 1.6 E202610101d04e560:S001:T006 — Record the segment on the lock and the session

session-lock.ts: LockFileRecord gains output: { sessionFile, turnId } | null, written on attach from TurnProcess.cursor. session-store.ts: ChatSession gains optional liveTurn { cursor, ownerHostPid, pid?, startedAt? }, and the memento store gains an onEvict hook so an evicted session's output files can be removed.

**Acceptance checks:**
- After attach the lock record names the holder's session file and turn.
- A stored session without liveTurn loads unchanged; liveTurn round-trips through the store.
- Evicting a session calls onEvict with its id.

### 1.7 E202610101d04e560:S001:T007 — Record and clear the turn cursor in the panel

chat-panel.ts: runTurn passes sessionId and onProgress to adapter.run (inside runLeased), saves liveTurn { cursor, ownerHostPid: this host, pid, startedAt } as lines are handled, and clears it at the terminal event.

**Acceptance checks:**
- A turn records its cursor on the session as lines are handled, with this host as owner.
- The cursor is cleared at the terminal event; a pipe turn records none.

### 1.8 E202610101d04e560:S001:T008 — Resume a saved cursor when a session is shown

chat-panel.ts: when a session is shown (open, ready, restore, open-chat) with a liveTurn, follow it with adapter.resume only if its owner host is this host or is gone (taking ownership), post and append only the new events, clear liveTurn at the end, and clear a cursor whose generation is gone without resuming.

**Acceptance checks:**
- A new host over the same store follows a live cursor from the saved offset; only new events are posted and appended; the cursor is cleared at the end.
- A second live window that is not the owner does not follow; once the owner host is gone it takes over.
- A cursor whose generation is gone is cleared without resuming.

### 1.9 E202610101d04e560:S001:T009 — Split Stop from detach in the panel

cancelActive splits: Stop (cancel-turn) ends the running process at once for a live turn and for a resumed one (the TurnProcess from onAttach). A chat switch, onDidDispose, dispose and adopt only stop following a turn that writes to the session file, leaving its process running with the lease and its cursor saved; a turn without a session file is still stopped on those paths.

**Acceptance checks:**
- Switching chat or closing the panel leaves a session-file turn's process running, and showing the session again resumes it.
- A turn without a session file is still stopped on those paths (existing tests pass).
- Stop ends a resumed turn's process through the handed-over handle.

### 1.10 E202610101d04e560:S001:T010 — Wire the session output in the extension

extension.ts: build createSessionOutput on ~/.insrc/chat-output, pass it as AdapterDeps.sessionOutput to createProviderRegistry, remove an evicted session's files via the store's onEvict, and sweep stale files of sessions not in the store at start (30 days).

**Acceptance checks:**
- extension.ts passes a session output on ~/.insrc/chat-output into the provider registry and wires onEvict and the start-up sweep (wiring test).
- The plugin's full suite and typecheck pass apart from the known manifest-catalog baseline.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| session-output.test.ts: a turn's segment is the lines between its turn-start and turn-end markers; tail yields only complete CLI lines with the cursor after each, skips marker lines, holds back a half-written line until its newline, and follows growth until the writer finishes | `t1` |
| session-output.test.ts: tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished | `t1` |
| session-output.test.ts: the file rolls over at a turn start once past maxBytes, keeping one previous generation, and a cursor in the previous generation is still read from <sessionId>.1.ndjson | `t2` |
| session-output.test.ts: remove deletes a session's files; sweep removes old files of sessions not in keep and leaves the rest; one session uses one file pair however many turns it runs | `t2` |
| cli-adapter.test.ts: the real spawner appends the CLI's stdout to the session file inside its turn segment and stderr to the err log, and lines() yields every line including those written after the result line | `t3` |
| cli-adapter.test.ts: run() yields the same events from the output file as from a pipe, reports progress offsets, and writes the turn-end marker after the process exits | `t4` |
| cli-adapter.test.ts: resume() from a saved offset yields only the later events, ends at the terminal event, and ends with an error when the process is gone without one | `t5` |
| session-lock.test.ts: the lock record carries the holder's session file and turn after attach | `t6` |
| cli-adapter.test.ts: resume()'s handed-over process stops the recorded pid's group only while its start time matches | `t5` |
| chat-panel.test.ts: a turn records its cursor on the session as lines are handled and clears it at the terminal event | `t7` |
| chat-panel.test.ts: after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end | `t8` |
| chat-panel.test.ts: a cursor whose generation is gone (rolled over twice) is cleared without resuming | `t8` |
| chat-panel.test.ts: switching chat or closing the panel stops following a turn writing to the session file without stopping its process, and showing the session again resumes it; a turn without one is still stopped | `t9` |
| chat-panel.test.ts: Stop ends a resumed turn's process through the handle resume() hands over | `t9` |
| chat-panel.test.ts: a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails + dataModelChanges: createSessionOutput and the session output files (segments, markers, roll-over)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails: nodeSpawner/SpawnFn output, StreamAdapter run/resume, RunOptions, AdapterDeps.sessionOutput, TurnProcess.cursor`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges: LockFileRecord.output`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges: ChatSession.liveTurn and removal with the session`
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails + dataModelChanges: createChatPanelHost runTurn / postInitialState / cancelActive (cursor, resume, owner host, Stop vs detach)`
- **[[c6]]** `prior-artifact` `LLD s1 dataModelChanges + migration step 4: extension wiring and start-up sweep`
- **[[c7]]** `prior-artifact` `LLD s1 errorPaths: create/append failure, unreadable file, gone generation, no terminal event, offset past end, missing turn-end marker`
