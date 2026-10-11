<!-- insrc:artifact PLAN-d6a4bc79bece9d1f-s1 -->

# Plan: E20261010d6a4bc79:S001

## Summary

**Epic:** `vs-code-plugin-chat-panel-concurrent`
**LLD run:** `wf-1791644499139-4w92ry`
**LLD effective hash:** `1000b102d2be...`

Building this Story adds a small, vscode-free lock module that hands out one lease per chat session, first in memory and then backed by lock files that every window can see. The chat adapter's process lifecycle changes so a CLI process is no longer killed or forgotten when its answer ends: it runs in its own process group, its exit is tracked, and stopping it is awaited. The panel then takes the lease before every turn, shows a waiting state, and only stops the old process after the timeout, while Stop stays immediate. A new setting and the extension wiring finish it.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the in-memory session lock | M | — | unit: session-lock.test.ts: one lease per session; a second acquire waits until the holder's process exits, then is granted; unit: session-lock.test.ts: past the timeout the holder is stopped (SIGTERM, then SIGKILL after the grace period), its exit is awaited, then the lease is granted; unit: session-lock.test.ts: an aborted wait is cancelled without stopping anything, and a newer waiter replaces an older one | [[c1]] [[c6]] |
| 2 | **`t2`** Add the file-backed session lock | M | `t1` | unit: session-lock.test.ts: a lock file from another window is honoured while its pid is alive, and a stale file (dead pid or mismatched start time) is replaced; unit: session-lock.test.ts: on timeout a cross-window holder's group is stopped only when its start time matches; unit: session-lock.test.ts: an unwritable lock directory falls back to memory | [[c1]] [[c6]] |
| 3 | **`t3`** Change the adapter's process lifecycle | M | — | unit: cli-adapter.test.ts: run() ends at the first done event without killing the process, and onSpawn hands over pid, exit and stop; unit: cli-adapter.test.ts: cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group; unit: cli-adapter.test.ts: after run() returns at done, decide() still reaches the live process, and the live entry is dropped only when the exit settles | [[c2]] |
| 4 | **`t4`** Add the 'waiting' status phase and its marker | S | — | unit: markers.test.ts: phase 'waiting' maps to 'Waiting for the previous turn to finish' in both markerFor and the webview mirror | [[c4]] |
| 5 | **`t5`** Take the session lease in the chat panel | L | `t1`, `t3`, `t4` | integration: chat-panel.test.ts: a message sent while the previous CLI process is still alive after its answer waits, shows 'Waiting for the previous turn to finish', and starts only after that process exits; integration: chat-panel.test.ts: with a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed; integration: chat-panel.test.ts: Stop ends the running process at once and cancels a waiting message; the generation guard still keeps superseded events out of the transcript | [[c3]] [[c4]] [[c6]] |
| 6 | **`t6`** Declare the setting and wire the file-backed registry | S | `t2`, `t5` | integration: extension-chat-wiring.test.ts: the extension passes a file-backed lock registry and the turnLockTimeoutMs setting; integration: extension-chat-wiring.test.ts: package.json contributes insrc.chat.turnLockTimeoutMs (number, default 600000, minimum 1000) | [[c5]] |

### 1.1 E20261010d6a4bc79:S001:T001 — Add the in-memory session lock

New vscode-free vscode-plugin/src/chat/session-lock.ts with the SessionLocks / SessionLease types and the in-memory registry: acquire(sessionId, { timeoutMs, onWaiting, signal }) -> SessionLease { attach(proc), release() }. One lease per session; the lease is released when the attached process's exit settles (or by release() when no process was started). A newer waiter replaces an older one (the older rejects as superseded); an aborted wait rejects without stopping anything. Past timeoutMs the holder's stop is escalated: SIGTERM, then SIGKILL after a grace (default 5 s), then the exit is awaited; if it never settles the lease is granted anyway with an error logged. Seams: now/timers, graceMs, logger.

**Acceptance checks:**
- A second acquire for the same session waits until the holder's process exits, then is granted; different sessions do not block each other.
- Past timeoutMs the holder is stopped with SIGTERM, then SIGKILL after the grace, and the lease is granted only after the exit is confirmed (or after the second grace, with an error logged).
- An aborted wait rejects without stopping anything; a newer waiter supersedes an older one; a process that exits by itself grants the waiter at once without any stop.

### 1.2 E20261010d6a4bc79:S001:T002 — Add the file-backed session lock

In session-lock.ts, a file-backed registry layered on the in-memory one: on attach it writes ~/.insrc/chat-locks/<sessionId>.lock { sessionId, cliPid, hostPid, startedAt } (create-exclusive, rename on update) and removes it when the process exits. A waiter honours a file whose pid is alive (polling until it disappears or its pid dies), replaces a stale file (dead pid, or a start time that does not match startedAt) at once with a warning, and on timeout signals the recorded pid's process group only when its start time matches. Any fs failure falls back to the in-memory lock with one logged error. Seams: fs, isAlive, killGroup, processStartTime, lockDir, hostPid, pollMs.

**Acceptance checks:**
- A lock file whose pid is alive blocks a waiter in a second registry instance until the file is removed or the pid dies.
- A file with a dead pid or a mismatched start time is replaced at once, and an unrelated process (start time mismatch) is never signalled.
- On timeout a live cross-window holder's process group gets SIGTERM, then SIGKILL, and the lease is granted after its pid is gone.
- An unwritable lock directory falls back to the in-memory lock with one logged error.

### 1.3 E20261010d6a4bc79:S001:T003 — Change the adapter's process lifecycle

cli-adapter.ts: SpawnedProcess gains pid and kill(signal); the real spawner starts the CLI detached in its own process group and kill() signals the group (-pid, falling back to the child). run(req, { onSpawn }) hands over { pid, exit, stop } once spawned; returns right after its first done or error event without awaiting the next line or proc.exit and without killing; the live entry and pending permission requests are dropped when proc.exit settles; a consumer that abandons run() before any terminal event still stops the group. cancel() returns a promise that stops the group (SIGTERM, then SIGKILL after a grace) and resolves after the exit. Update the title generator's stop() for the async cancel, and update the adapter tests that assumed kill-after-done.

**Acceptance checks:**
- run() completes right after a done event while the fake process stays alive; no kill is recorded; onSpawn received pid, exit and stop.
- decide() after run() has returned still writes to the live process; the live entry is gone after the exit settles.
- cancel() sends SIGTERM to the group, escalates to SIGKILL after the grace when the process does not exit, and resolves only after the exit.
- collect()-based adapter tests still yield the same events; tests that asserted a kill after done now assert no kill plus cleanup on exit; the real spawner passes detached: true and kill() targets the negative pid.

### 1.4 E20261010d6a4bc79:S001:T004 — Add the 'waiting' status phase and its marker

stream-events.ts: the status phase union gains 'waiting'. markers.ts: markerFor and markerWebviewSource map it to the pending marker labelled 'Waiting for the previous turn to finish'.

**Acceptance checks:**
- markerFor({ kind: 'status', phase: 'waiting' }) returns the pending marker with the label 'Waiting for the previous turn to finish', and the webview mirror returns the same.
- The typecheck is clean (the exhaustive switch covers the new phase).

### 1.5 E20261010d6a4bc79:S001:T005 — Take the session lease in the chat panel

chat-panel.ts: createChatPanelHost accepts optional sessionLocks (in-memory default) and turnLockTimeoutMs. runTurn acquires the lease keyed by ChatSession.id before adapter.run, posts the waiting status while it waits, attaches the lease to the started process through onSpawn, calls the iterator's return() at done or error, and no longer cancels the previous turn of its own. A newer submit replaces a waiting one. cancelActive (Stop) aborts any pending wait, stops the running process at once and resolves after its exit. The generation guard is kept. The inline webview keeps Stop available while waiting.

**Acceptance checks:**
- A message sent while the previous fake CLI process is still alive after its answer posts the waiting status and starts only after that process exits.
- With a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed.
- Stop while a turn waits cancels it (the adapter never runs) and stops the running process at once; superseded events never reach the transcript.
- Grant re-runs and selection replies go through the same lease; the existing chat-panel tests pass.

### 1.6 E20261010d6a4bc79:S001:T006 — Declare the setting and wire the file-backed registry

package.json: declare insrc.chat.turnLockTimeoutMs (number, default 600000, minimum 1000) beside the other insrc.chat.* settings. extension.ts: build the file-backed SessionLocks on ~/.insrc/chat-locks and pass it with a live read of the setting into createChatPanelHost.

**Acceptance checks:**
- package.json contributes insrc.chat.turnLockTimeoutMs with type number, default 600000 and minimum 1000.
- extension.ts passes a file-backed sessionLocks and a turnLockTimeoutMs reader into createChatPanelHost (wiring test).
- The plugin's full suite and typecheck pass apart from the known manifest-catalog baseline.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| session-lock.test.ts: one lease per session; a second acquire waits until the holder's process exits, then is granted | `t1` |
| session-lock.test.ts: past the timeout the holder is stopped (SIGTERM, then SIGKILL after the grace period), its exit is awaited, then the lease is granted | `t1` |
| session-lock.test.ts: a lock file from another window is honoured while its pid is alive, and a stale file (dead pid or mismatched start time) is replaced | `t2` |
| session-lock.test.ts: an aborted wait (Stop) is cancelled without stopping anything; a newer waiter replaces an older one; an unwritable lock directory falls back to memory | `t1`, `t2` |
| cli-adapter.test.ts: run() ends at the first done event without killing the process, and onSpawn hands over pid, exit and stop | `t3` |
| cli-adapter.test.ts: cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group | `t3` |
| cli-adapter.test.ts: after run() returns at done, decide() still reaches the live process, and the live entry is dropped only when the exit settles | `t3` |
| markers.test.ts: phase 'waiting' maps to 'Waiting for the previous turn to finish' in both markerFor and the webview mirror | `t4` |
| chat-panel.test.ts: a message sent while the previous CLI process is still alive after its answer waits, shows 'Waiting for the previous turn to finish', and starts only after that process exits | `t5` |
| chat-panel.test.ts: with a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed | `t5` |
| chat-panel.test.ts: Stop ends the running process at once and cancels a waiting message; the generation guard still keeps superseded events out of the transcript | `t5` |
| extension-chat-wiring.test.ts: the extension passes a file-backed lock registry and the turnLockTimeoutMs setting | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges: SessionLocks (session-lock.ts) and the chat lock file`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails: StreamAdapter / SpawnedProcess lifecycle (cli-adapter.ts)`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails: createChatPanelHost / runTurn / cancelActive`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges: status phase 'waiting', status markers and the chat webview script`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges: setting insrc.chat.turnLockTimeoutMs and extension wiring`
- **[[c6]]** `prior-artifact` `LLD s1 errorPaths: stuck holder, stale lock, unwritable directory, pid reuse, edge cases`
