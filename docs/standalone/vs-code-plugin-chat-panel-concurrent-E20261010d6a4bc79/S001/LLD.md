<!-- insrc:artifact LLD-d6a4bc79bece9d1f-s1 -->

# LLD: E20261010d6a4bc79:S001

## Summary

**Epic:** `vs-code-plugin-chat-panel-concurrent`
**HLD base run:** `wf-1791644499139-4w92ry`
**HLD effective hash:** `1000b102d2be...`

Each chat session gets a lock, so only one CLI process can work on it at a time, in this window or any other. The lock is held until the process has really exited, even if it keeps running after its answer. A new message waits for it and the chat shows that it is waiting; only if the wait runs past a set time is the old process (and everything it started) stopped, and the new turn starts once that is confirmed. Pressing Stop still ends the running turn straight away.

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

### 2.1 `createChatPanelHost`

```typescript
function createChatPanelHost(deps: ChatPanelHostDeps & { readonly sessionLocks?: SessionLocks | undefined; readonly turnLockTimeoutMs?: (() => number) | undefined }): ChatPanelHost
```

**Parameters:**
- `deps.sessionLocks: SessionLocks` _(optional)_ — The lock registry the host acquires a session's lease from before each turn; defaults to an in-memory registry so existing callers and tests keep working.
- `deps.turnLockTimeoutMs: () => number` _(optional)_ — Live read of the wait timeout (setting insrc.chat.turnLockTimeoutMs, default 600000 ms).

**Returns:** `ChatPanelHost` — Unchanged surface.

**Postconditions:**
- extension.ts passes a registry backed by the lock-file directory, so every window shares it.

### 2.2 `runTurn`

```typescript
async function runTurn(text: unknown, allowedTools?: readonly string[], opts?: { readonly suppressEcho?: boolean }): Promise<void>
```

**Parameters:**
- `text: unknown` — Unchanged.

**Returns:** `Promise<void>` — Resolves when the turn's events have been posted; the lease stays with the process until it exits.

**Postconditions:**
- Before starting a CLI process it acquires the session's lease (keyed by ChatSession.id); while waiting it posts a status the webview shows as 'Waiting for the previous turn to finish' with Stop available.
- It no longer cancels a still-running previous turn of its own: it waits for that turn's process like any other holder.
- On timeout it stops the holder's process group, waits for the exit to be confirmed, then starts the turn; the wait and the forced stop are logged.
- A newer submit while one is already waiting replaces the waiting one (the latest message wins); it never queues two turns.
- The lease is attached to the started process and released only when that process's exit settles.

### 2.3 `cancelActive`

```typescript
const cancelActive: () => Promise<void>
```

**Returns:** `Promise<void>` — Resolves once the running process has exited (or there was none).

**Postconditions:**
- Stop ends the running process group at once (no timeout) and cancels any pending wait; the lease is released by the exit.

### 2.4 `StreamAdapter`

```typescript
interface StreamAdapter { run(req: TurnRequest, opts?: { readonly onSpawn?: (proc: { readonly pid: number | undefined; readonly exit: Promise<{ code: number | null; signal: string | null }>; stop(): Promise<void> }) => void }): AsyncIterable<TurnEvent>; cancel(turnId: string): Promise<void>; decide(turnId: string, requestId: string, decision: 'approve' | 'deny'): void; readonly capabilities: { readonly resume: boolean } }
```

**Parameters:**
- `opts.onSpawn: callback` _(optional)_ — Hands the started process (pid, exit, stop) to the caller, which ties the lease to it.

**Returns:** `AsyncIterable<TurnEvent>` — Unchanged events.

**Postconditions:**
- Changed: run() returns straight after its first done or error event. It no longer waits for the next stdout line or for proc.exit, and it does not kill the process. A process that keeps running after its answer keeps running and keeps its lease.
- The live map entry and the turn's pending permission requests are kept until the process's exit settles (cleanup chained on proc.exit, not on run()'s finally), so decide() still reaches a live process. Nothing on the done path relies on run()'s finally.
- A consumer that abandons run() before any terminal event (return() mid-turn) still stops the process group, as today's early-break cleanup does.
- cancel() stops the process group and resolves when the exit is confirmed (SIGTERM, then SIGKILL after a short grace period).

### 2.5 `SpawnedProcess`

```typescript
interface SpawnedProcess { lines(): AsyncIterable<string>; stderr(): string; readonly exit: Promise<{ code: number | null; signal: string | null }>; readonly spawnError: Promise<NodeJS.ErrnoException | undefined>; readonly pid?: number | undefined; kill(signal?: 'SIGTERM' | 'SIGKILL'): void; write?(data: string): void }
```

**Returns:** `type` — Gains pid and a signal choice; the real spawner starts the CLI in its own process group (detached) and kill() signals the whole group.

**Postconditions:**
- A fake spawner without pid still works; the lock file then records only the owning extension host.

## 3. Data model changes

### 3.1 `SessionLocks (new, vscode-plugin/src/chat/session-lock.ts)` — new

acquire(sessionId: string, opts: { timeoutMs: number; onWaiting?: () => void; signal?: AbortSignal }): Promise<SessionLease>; SessionLease { attach(proc: { pid; exit; stop() }): void; release(): void }. In-memory per-session queue plus, in the file-backed variant, a lock file. Waiting past timeoutMs calls the holder's stop() (or, for a holder in another window, signals its recorded pid's process group), waits for its exit, then grants the lease. Seams: fs, now, isAlive(pid), killGroup(pid, signal), lockDir.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `chat lock file (~/.insrc/chat-locks/<sessionId>.lock)` — new

JSON { sessionId, cliPid, hostPid, startedAt }. Written when a lease is attached to a process, removed when that process exits. A file whose cliPid (or, without one, hostPid) is no longer alive is stale and is taken over. Written atomically (create-exclusive, then rename on update).

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `SpawnedProcess / StreamAdapter (cli-adapter.ts)` — field-modify

SpawnedProcess gains pid and kill(signal); StreamAdapter.run gains opts.onSpawn and cancel() returns Promise<void>. run() returns right after its first terminal event without awaiting proc.exit and without killing; the live entry and pending requests are dropped when the exit settles. The panel calls the iterator's return() at done so the generator is not left parked.

```
+ pid?: number; kill(signal?)
+ run(req, opts?: { onSpawn })
- cancel(turnId): void
+ cancel(turnId): Promise<void>
```

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts`

### 3.4 `setting insrc.chat.turnLockTimeoutMs` — new

Declared under contributes.configuration in vscode-plugin/package.json beside insrc.chat.enabled, diffView and lockGroup. Number, default 600000 (10 minutes), minimum 1000; how long a new turn waits for the previous process before stopping it. Read live in extension.ts.

**Call sites:**
- `vscode-plugin/package.json`
- `vscode-plugin/src/extension.ts`

### 3.5 `TurnEvent status phase (vscode-plugin/src/chat/stream-events.ts)` — field-modify

The status event's phase gains 'waiting'. The host posts { kind: 'status', phase: 'waiting' } as a turn-event while runTurn waits for the lease, before any CLI process starts.

```
- phase: 'thinking' | 'streaming' | 'tool' | 'editing'
+ phase: 'waiting' | 'thinking' | 'streaming' | 'tool' | 'editing'
```

**Call sites:**
- `vscode-plugin/src/chat/stream-events.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.6 `status markers (vscode-plugin/src/chat/markers.ts)` — field-modify

markerFor and its webview mirror markerWebviewSource map phase 'waiting' to the pending marker labelled 'Waiting for the previous turn to finish'. The exhaustive switch makes the compiler flag a missed case.

**Call sites:**
- `vscode-plugin/src/chat/markers.ts`

### 3.7 `chat webview script (inline in vscode-plugin/src/chat/chat-panel.ts)` — field-modify

The webview already marks the turn running on submit, so the waiting marker renders through the existing running-only status path and Stop stays available. Stop while waiting posts cancel-turn as today; the host cancels the wait and the panel returns to idle.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The holding process does not exit after SIGTERM (it ignores it or hangs in a child).** (recoverable)
  - Detection: The stop waits on the process's exit promise with a grace period (5 s) after SIGTERM to the group.
  - Response: SIGKILL to the process group, then wait for the exit again; if even that does not settle within the grace period, the lease is taken anyway, the lock file is overwritten and an error is logged naming the pid.
  - User impact: The new turn starts a few seconds later; the log names the stuck process.
- **A lock file is left behind by a crashed window or a killed extension host.** (recoverable)
  - Detection: On acquire, the file's cliPid (or, without one, hostPid) is checked with isAlive (signal 0); a dead pid marks the file stale.
  - Response: The stale file is replaced and the lease granted at once; a warning is logged.
  - User impact: None.
- **The lock directory cannot be created or written (permissions, disk full).** (recoverable)
  - Detection: The file-backed registry's fs calls throw.
  - Response: It falls back to the in-memory lock for this window, logs an error once, and the turn proceeds.
  - User impact: Protection across windows is lost until the directory is writable; within the window the lock still holds.
- **A lock file holds a pid that has been reused by an unrelated process.** (recoverable)
  - Detection: isAlive says alive, so the waiter waits; on timeout the group stop targets the recorded pid only if its process start time matches the file's startedAt (read where the platform allows), otherwise the file is treated as stale.
  - Response: An unrelated process is never signalled; the stale file is replaced.
  - User impact: None.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A turn whose CLI keeps running after its done event (pending background task or wake-up), then the user sends a new message. | The new message waits with 'Waiting for the previous turn to finish' and Stop; it starts when that process exits, or after the timeout once the process is stopped. |
| The user presses Stop while a new message is waiting. | The running process is stopped at once, the waiting message is cancelled (not started), and the panel returns to idle. |
| Two messages sent while the first is still waiting. | The second replaces the first in the queue: only the latest waits and runs. |
| The same session open in two windows. | A turn in the second window waits for the first window's process via the lock file and shows the same waiting state. |
| A window reload while a process is running. | The process keeps its lock file; after the reload a new message waits for it as for any other holder. |
| A grant re-run (Approve) or a selection reply. | They take the lease like any turn; the previous process has normally exited already, so they start at once. |
| A process that exits by itself while a waiter is pending. | The waiter gets the lease immediately, without any stop. |

**Invariants to preserve**

- The panel shows one turn's events at a time; a superseded turn never posts into the transcript (the generation guard stays). [[c1]]
- The adapter yields the same events as today, up to and including the first done or error event; permission decisions still reach the live process. (How run() ends after that event changes, as stated in 2.4.) [[c2]]
- Sessions are identified by ChatSession.id and resumed by nativeSessionId; neither changes. [[c3]]
- Existing callers and tests of createChatPanelHost keep working without a lock registry (the in-memory default). [[c4]]
- The chat's existing tests pass, with the old kill-after-done expectation replaced by the new lifecycle. [[c5]]

## 6. Test strategy

**Test framework:** `node:test via tsx in vscode-plugin (npx tsx --test 'src/**/__tests__/*.test.ts'), node:assert/strict; fake spawner and fake providers as in cli-adapter.test.ts and chat-panel.test.ts; a temp directory for lock files`

**Test levels**

- **unit** — The lock registry on its own.
  - Subjects: `session-lock.test.ts: one lease per session; a second acquire waits until the holder's process exits, then is granted`, `session-lock.test.ts: past the timeout the holder is stopped (SIGTERM, then SIGKILL after the grace period), its exit is awaited, then the lease is granted`, `session-lock.test.ts: a lock file from another window is honoured while its pid is alive, and a stale file (dead pid or mismatched start time) is replaced`, `session-lock.test.ts: an aborted wait (Stop) is cancelled without stopping anything; a newer waiter replaces an older one; an unwritable lock directory falls back to memory`
- **unit** — The adapter's new process lifecycle.
  - Subjects: `cli-adapter.test.ts: run() ends at the first done event without killing the process, and onSpawn hands over pid, exit and stop`, `cli-adapter.test.ts: cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group`, `cli-adapter.test.ts: after run() returns at done, decide() still reaches the live process, and the live entry is dropped only when the exit settles`, `markers.test.ts: phase 'waiting' maps to 'Waiting for the previous turn to finish' in both markerFor and the webview mirror`
- **integration** — The panel with the lock.
  - Subjects: `chat-panel.test.ts: a message sent while the previous CLI process is still alive after its answer waits, shows 'Waiting for the previous turn to finish', and starts only after that process exits`, `chat-panel.test.ts: with a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed`, `chat-panel.test.ts: Stop ends the running process at once and cancels a waiting message; the generation guard still keeps superseded events out of the transcript`, `extension-chat-wiring.test.ts: the extension passes a file-backed lock registry and the turnLockTimeoutMs setting`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat-panel.test.ts: 'a message sent while the previous CLI process is still alive after its answer waits, then starts after that process exits'`, `session-lock.test.ts: 'one lease per session; a second acquire waits until the holder's process exits'` |
| `ac2` | `session-lock.test.ts: 'past the timeout the holder is stopped and its exit awaited before the lease is granted'`, `chat-panel.test.ts: 'with a short timeout the still-running holder is stopped and the new turn starts after its exit'` |
| `ac3` | `session-lock.test.ts: 'a lock file from another window is honoured while its pid is alive, and a stale file is replaced'` |
| `ac4` | `chat-panel.test.ts: 'Stop ends the running process at once and cancels a waiting message'` |
| `ac5` | `cli-adapter.test.ts: 'run() ends at the first done event without killing the process, and onSpawn hands over pid, exit and stop'`, `cli-adapter.test.ts: 'cancel() stops the process group and resolves only after the exit'` |

## 7. Migration

**State before:** runTurn in chat-panel.ts cancels only the turn it is still reading, then starts the next CLI process at once. At a done event it breaks out of its own loop without calling the iterator's return(), and its finally clears activeIterator and activeTurnId. The adapter's generator stays parked at the done yield, so run()'s finally (proc.kill(), live.delete, pendingByTurn cleanup) never runs on the panel path. A process that keeps running after its answer is neither killed nor tracked, and a later cancelActive cannot reach it. Only consumers that drain the generator (collect() in the tests) or abandon it with return() reach the kill. The real spawner is not detached, so even that kill signals only the direct child. No lock exists in memory or on disk.

**State after:** Every turn acquires its session's lease before starting a CLI process; the lease lives until that process exits and is visible to every window through ~/.insrc/chat-locks; a waiting turn shows its state and stops the holder's process group only after insrc.chat.turnLockTimeoutMs; Stop ends the running process at once.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the session-lock module (in-memory and file-backed registries) with its tests. — ↩ rollbackable
2. Give the spawner a process group, pid and signal choice; stop killing at the first done event; make cancel() wait for the exit; update the adapter's tests to the new lifecycle. — ↩ rollbackable
3. Acquire and attach the lease in runTurn, show the waiting state in the webview, make Stop cancel a waiting turn and end the running one; wire the file-backed registry and the new setting in extension.ts. — ↩ rollbackable

**Backward compat:** Internal to the plugin. createChatPanelHost's new deps are optional with an in-memory default, so existing callers and tests keep working. StreamAdapter.cancel() now returns a promise; its in-repo callers are updated. The new setting has a default. Lock files are new and self-cleaning; stale ones are taken over.

## 8. Alternatives considered

### 8.1 a1: A session lock module held by the process, with a lock file shared across windows — **CHOSEN**

A new session-lock module grants one lease per chat session, held until the CLI process exits; leases are recorded both in memory and in a lock file so a second window sees them; a waiting turn times out into a process-group stop.

A vscode-free module (session-lock.ts) offers acquire(sessionId, { timeoutMs, onWaiting }) returning a lease. The lease is tied to the CLI process the turn starts: it is released only when that process's exit promise settles, never when the event stream ends. Inside one window an in-memory queue orders waiters per session. Across windows, the holder writes a lock file under ~/.insrc/chat-locks/<sessionId>.lock naming the CLI process's pid and the owning extension-host pid; a waiter in any window treats the file as held while that pid is alive and as stale otherwise. When the wait exceeds the timeout (a setting, insrc.chat.turnLockTimeoutMs), the waiter stops the holder's whole process group, waits for its exit to be confirmed, then takes the lease. The adapter starts each CLI in its own process group, exposes its pid, stops killing it after the first done event (a process that outlives its answer keeps its lease instead), and its cancel() stops the group and resolves once the exit is confirmed. The panel acquires the lease before run(), shows 'Waiting for the previous turn to finish' while waiting, and Stop ends the running process at once.

### 8.2 a2: An in-memory lock per window only

The same lease and timeout, but held only in the chat host's memory.

The chat host keeps a per-session promise chain; runTurn waits on it with a timeout and stops the holder's process group after the timeout. No lock file.

**Rejected because:** Cheaper, but a reload or a second window reopens the fork.

### 8.3 a3: A lock inside the adapter keyed by the native session id

makeStreamAdapter serialises run() calls that resume the same native session id.

The adapter keeps a map from nativeSessionId to the live process and makes run() wait (with the timeout) for that process to exit before spawning another --resume of it.

**Rejected because:** The waiting state is invisible and first turns are not covered.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "createChatPanelHost / runTurn / cancelActive"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "StreamAdapter / SpawnedProcess / makeStreamAdapter run() kills after the first done event"
- **[[c3]]** `code` `vscode-plugin/src/chat/session-store.ts` — "ChatSession { id, provider, nativeSessionId? }"
- **[[c4]]** `code` `vscode-plugin/src/extension.ts` — "one createChatPanelHost per extension host"
- **[[c5]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — "fake spawner; chat-panel.test.ts fake channel and providers"
- **[[c6]]** `prior-artifact` `docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/ISSUE.md` — "ISSUE-d6a4bc79bece9d1f"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 0 could not be verified · 4 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T15:07:49.617Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | MED | Migration 'State before' and 2.4/3.3 say that today cli-adapter.ts run() kills the child with an unawaited SIGTERM at its first done event, so a process outlives its answer only by ignoring the kill. | The kill lives in run()'s `finally { proc.kill(); ... }` at cli-adapter.ts:754-757. That block runs only when the generator finishes or the consumer calls return(). The panel's runTurn reads the iterator by hand and simply `break`s on done (chat-panel.ts:675-681). It never calls iterator.return(). Its finally (:698-703) only clears activeIterator/activeTurnId, so a later cancelActive cannot reach the turn either. The generator stays parked at `yield` on the done event, so in the panel the finally, and the kill, never run after a normal done. That is how the process outlives its answer, unkilled and untracked. The 'kill at the first done' that the design removes does not happen today on the panel path. Only consumers that drive the generator to the end (collect() in the tests) or abandon it with return() reach the kill. [files: vscode-plugin/src/chat/chat-panel.ts, vscode-plugin/src/chat/cli-adapter.ts] | Correct the State before: the panel abandons the iterator at done without return(), so the child is neither killed nor tracked. Make sure the new lifecycle does not rely on run()'s finally for anything on the done path (for example releasing the lease or clearing pendingByTurn). In the panel path that finally never runs. |
| change-sites | MED | The change sites are complete. The design lists only session-lock.ts, cli-adapter.ts, chat-panel.ts, extension.ts and the adapter test for the waiting state and the new setting. | Three needed sites are missing. (1) The setting insrc.chat.turnLockTimeoutMs must be declared under contributes.configuration in vscode-plugin/package.json, where the other insrc.chat.* settings live (package.json:123 enabled, :129 diffView, :143 lockGroup). The design lists only extension.ts. (2) The waiting status cannot be expressed with today's event types. stream-events.ts:51 limits status to `phase: 'thinking' \| 'streaming' \| 'tool' \| 'editing'`. The webview renders a status through markerFor (markers.ts:47/122), and only `if(running&&mkp)` (chat-panel.ts:463). A 'Waiting for the previous turn to finish' state therefore needs changes in stream-events.ts and markers.ts, plus the inline webview script, or a new host-to-webview message. None of these is listed. (3) The webview must keep Stop available while waiting, which again touches the inline script. [files: vscode-plugin/package.json, vscode-plugin/src/chat/stream-events.ts, vscode-plugin/src/chat/markers.ts, vscode-plugin/src/chat/chat-panel.ts] | Add vscode-plugin/package.json (the setting declaration), stream-events.ts, markers.ts (or a new message type) and the webview script in chat-panel.ts to the change sites, and say how the waiting state is encoded. |
| preserved-behaviour | MED | Invariant c2 and section 2.4 say run() 'still ends at the first done or error event' and yields the same events as today. | Today run() does not end at done when it is pulled further. After yielding done, the inner `break` (cli-adapter.ts:728) only leaves the events loop. The outer `for await (const line of proc.lines())` (:705) then waits for the next stdout line or for stdout to close before `if (sawDone \|\| sawError) break` (:706). It then runs `const { code, signal } = await proc.exit;` (:731) before returning. For a process that outlives its answer, a fully drained run() does not settle until the process exits. The panel only avoids this by abandoning the iterator. The planned test 'run() ends at the first done event without killing the process' would hang against a still-alive fake unless the post-done `await proc.exit` and the next-line wait are removed. The design presents this as preserved behaviour rather than as a change. [files: vscode-plugin/src/chat/cli-adapter.ts] | State this as a change: return straight after a terminal event without awaiting proc.exit, and keep pendingByTurn and the live map alive until the exit settles, so in-turn decide() still reaches a live process. Alternatively, keep the panel's abandon-at-done pattern and say so. |

#### Could not verify (does not block)

_None._
