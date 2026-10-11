<!-- insrc:artifact LLD-8ca7382b0952a539-s1 -->

# LLD: E202610108ca7382b:S001

## Summary

**Epic:** `defect-vscode-plugin-src-chat-chat`
**HLD base run:** `wf-1791656474528-tybrj9`
**HLD effective hash:** `6631394079e4...`

The chat panel's turn machinery moves out of createChatPanelHost into a new vscode-free module, vscode-plugin/src/chat/turn-lifecycle.ts. The module runs a turn for a session: it waits for the session's lease, applies the newest-message-wins rule, keeps the running CLI process, records where the turn's output is in the session file, follows a saved turn after a reload, and stops or detaches on request. The panel keeps the webview, the transcript rows, titles, and permission and selection handling, and hands the module a set of callbacks. Behaviour does not change, and the module gets its own tests.

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

### 2.1 `createTurnLifecycle`

```typescript
export function createTurnLifecycle(deps: TurnLifecycleDeps): TurnLifecycle; interface TurnLifecycleDeps { readonly providers: ProviderRegistry; readonly store: Pick<ChatSessionStore, 'save'>; readonly locks: SessionLocks; readonly lockTimeoutMs: () => number; readonly hostPid: number; readonly processStartTime: (pid: number) => number | undefined; readonly isAlive: (pid: number) => boolean; readonly isOpen: () => boolean; readonly logger: ChatPanelLogger }
```

**Parameters:**
- `deps: TurnLifecycleDeps` — What the panel resolves today at chat-panel.ts:146-149 and 171 (locks default createMemorySessionLocks, hostPid default process.pid, processStartTime/isAlive defaults from session-lock.ts, lockTimeoutMs default DEFAULT_TURN_LOCK_TIMEOUT_MS), plus isOpen = the panel's !disposed, and store.save for trySave. processStartTime keeps the panel's type (pid) => number | undefined (chat-panel.ts:98, session-lock.ts:322); the module turns undefined into null when it writes liveTurn.startedAt, as chat-panel.ts:851 does.

**Returns:** `TurnLifecycle` — One per panel host; holds the state now at chat-panel.ts:142-177 that concerns turns: activeTurnId, activeProvider, activeIterator, generation, runningTurns, following, resumedProc, detachLive, waitCtl, liveProc.

**Preconditions:**
- Called once from createChatPanelHost, after the panel resolves its defaults.

**Postconditions:**
- No turn is running and live is undefined.

### 2.2 `TurnLifecycle.start`

```typescript
start(session: ChatSession, req: TurnRequest, sink: TurnSink): Promise<void>; interface TurnSink { onWaiting(): void; beforeRun(): Promise<void>; onEvent(ev: TurnEvent): void; onTerminal(ev: TurnEvent & { kind: 'done' | 'error' }): void; onError(message: string, turnId: string): void }
```

**Parameters:**
- `session: ChatSession` — The session the turn runs for; the module sets its liveTurn and nativeSessionId and saves it.
- `req: TurnRequest` — Built by the panel exactly as at chat-panel.ts:820-823 (prompt, cwd, permissionMode, allowedTools, resume).
- `sink: TurnSink` — Panel callbacks: onWaiting posts the waiting status; beforeRun is governor.beginTurn; onEvent posts, appends and records pending permissions/selections and governor.observe; onTerminal saves (store.save, which may throw), governor.resolveTurn, postHistory; onError posts an error turn-event.

**Returns:** `Promise<void>` — Settles when the panel stops reading the turn (terminal event, supersede, detach, stop, or a drop while waiting). The process may keep running; the lease is released when it exits.

**Errors:**
- `none thrown` when Every failure is reported through sink.onError (when current) and logged; start never rejects, so the panel's fire-and-forget call stays safe.

**Preconditions:**
- Synchronously at the call: the pending lease wait is aborted and generation is bumped, as at chat-panel.ts:785-787 (moved after the echo, with no await between, so nothing observable changes).
- No adapter for session.provider: sink.onError('no adapter for provider <p>', 'none') and return, as at 812-818.

**Postconditions:**
- The lease is acquired through locks.acquire with timeoutMs = lockTimeoutMs() and released through runLeased: by the attached process's exit, otherwise on return.
- Only while current (isOpen() and the generation unchanged) are onWaiting, onEvent, onTerminal and onError called. A superseded turn keeps reading but reports nothing; at its terminal event it clears its cursor and returns the iterator (900-906).
- On spawn, if the process writes to the session file, session.liveTurn = {cursor, ownerHostPid: hostPid, pid, startedAt} is saved at once; progress updates the cursor and saves at most every CURSOR_SAVE_MS (500 ms); at the terminal event the cursor is cleared before onTerminal; a done event's sessionId is set as session.nativeSessionId before onTerminal.
- A throw inside the run (beforeRun, adapter start, onTerminal's save) calls onError(message, activeTurnId ?? 'none') and then saves the session, when current.

### 2.3 `TurnLifecycle.follow`

```typescript
follow(session: ChatSession, sink: FollowSink): void; interface FollowSink { onEvent(ev: TurnEvent): void; onEnd(): void }
```

**Parameters:**
- `session: ChatSession` — The session to resume; nothing happens unless it has a liveTurn this host may follow.
- `sink: FollowSink` — onEvent gets every event (the panel appends it, and posts it only while the panel is open and this session is shown); onEnd runs after the cursor has been cleared and saved (the panel posts the history when the session is shown).

**Returns:** `void` — Starts the resume in the background, as followLiveTurn does today (269-324).

**Errors:**
- `logged` when adapter.resume throws: logged as a warning, the cursor stays saved.

**Preconditions:**
- Skipped when: no liveTurn; this session is already being followed; the turn is running in this host (runningTurns); the owner host pid is not this host and is alive; there is no adapter or it has no resume.

**Postconditions:**
- Takes ownership (ownerHostPid = hostPid, saved) before reading.
- Cursor progress saved at most every CURSOR_SAVE_MS; a done event's sessionId becomes nativeSessionId; at the end (not aborted) the cursor is cleared if unchanged and the session saved.

### 2.4 `TurnLifecycle.stop`

```typescript
stop(): Promise<void>
```

**Returns:** `Promise<void>` — The Stop control (stopActive today, 712-718): aborts the lease wait and the follow, returns the iterator, cancels the provider turn, stops the live process and the resumed process. Resolves once they have exited.

**Errors:**
- `none thrown` when Each step swallows its own failure, as stopLive does (678-709).

**Postconditions:**
- live is undefined; idempotent.

### 2.5 `TurnLifecycle.detach`

```typescript
detach(): Promise<void>
```

**Returns:** `Promise<void>` — A chat switch, panel close or adopt (detachActive today, 725-739): stops following; a turn writing to the session file keeps running with its lease and saved cursor; a pipe turn is stopped as by stop().

**Postconditions:**
- live is undefined; the detached turn's id leaves runningTurns so a later follow can resume it.

### 2.6 `TurnLifecycle.invalidate`

```typescript
invalidate(): void
```

**Returns:** `void` — Bumps the generation so a running turn stops reporting (the ++generation after detachActive in new-chat and open-chat).

**Postconditions:**
- The turn that was current is no longer current.

### 2.7 `TurnLifecycle.live`

```typescript
readonly live: { readonly provider: ProviderId; readonly turnId: string } | undefined
```

**Returns:** `{ provider, turnId } | undefined` — The turn the panel is reading live, defined once its first event arrived; the panel's decision message uses it in place of activeProvider/activeTurnId.

## 3. Data model changes

### 3.1 `TurnLifecycle (module state)` — new

The turn state leaves the createChatPanelHost closure for the createTurnLifecycle closure; names and rules unchanged. CURSOR_SAVE_MS and DEFAULT_TURN_LOCK_TIMEOUT_MS move to turn-lifecycle.ts; chat-panel.ts re-exports DEFAULT_TURN_LOCK_TIMEOUT_MS so extension.ts:52 keeps its import.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `ChatSession.liveTurn` — invariant-change

No shape change. Its writer moves from chat-panel.ts to turn-lifecycle.ts; the rules (owner pid, cursor throttle, clear at the terminal event) are unchanged.

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Error paths

**Error cases**

- **The lease cannot be acquired for a reason other than being dropped (lock dir unwritable, corrupt lock).** (recoverable)
  - Detection: locks.acquire rejects with an error that is not LockWaitAborted or LockWaitSuperseded.
  - Response: Log an error and, when current, sink.onError('could not lock chat session: <msg>', 'none'); start returns without running.
  - User impact: An error line in the chat; the user can resend.
- **The turn is dropped while waiting (a newer submit, Stop, chat switch, panel close).** (recoverable)
  - Detection: locks.acquire rejects with LockWaitAborted or LockWaitSuperseded (the wait's AbortController was aborted).
  - Response: Return silently; nothing runs.
  - User impact: None: the newer action takes over.
- **The lease is granted after the turn stopped being current.** (recoverable)
  - Detection: After acquire resolves, isOpen() is false or generation differs from the turn's.
  - Response: Release the lease and return without running.
  - User impact: None.
- **beforeRun (governor.beginTurn), adapter.run or onTerminal's store.save throws.** (recoverable)
  - Detection: The try around the read loop inside runLeased catches it.
  - Response: When current, sink.onError(message, activeTurnId ?? 'none') and save the session; runLeased releases the lease unless a process was attached (then its exit releases it).
  - User impact: An error line; the transcript so far is kept.
- **A save fails during cursor recording.** (recoverable)
  - Detection: store.save throws inside trySave.
  - Response: Logged as a warning; the turn continues.
  - User impact: A reload may resume from an older cursor.
- **Resuming a saved turn fails.** (recoverable)
  - Detection: adapter.resume or its iteration throws inside follow's background task.
  - Response: Log a warning; following is cleared and resumedProc forgotten; the cursor stays saved.
  - User impact: The turn's remaining output is not shown until a later reopen succeeds.
- **Stopping a process or cancelling a provider turn fails.** (recoverable)
  - Detection: proc.stop() or providers.get(p).cancel(id) rejects or throws.
  - Response: Swallowed per step, as stopLive does; the remaining steps still run.
  - User impact: None visible.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A second start() while the first turn is still waiting for its lease. | The first wait is aborted and that turn is dropped; the second waits. |
| A second start() while the first turn is reading. | The first turn stops reporting but keeps reading to its end (its CLI never stalls); the second waits for the first process to exit, then runs. |
| detach() while a session-file turn is running. | The iterator is returned, the cursor is saved, the turn id leaves runningTurns, the process and lease stay; follow() on the session then resumes it. |
| detach() while a pipe turn (no cursor) is running. | Same as stop(): the process is stopped. |
| follow() on a session whose turn is running in this host. | No-op (runningTurns has its turn id). |
| follow() when the cursor's owner is another live host. | No-op; when that host is gone, this host takes ownership and follows. |
| stop() with nothing running. | Resolves at once; no error. |
| invalidate() then the old turn's terminal event. | No sink call; its cursor is cleared. |
| An adapter without onSpawn support (no process attached). | runLeased releases the lease when start's body returns. |

**Invariants to preserve**

- One CLI process per session: a turn waits for the session lease, stopping the previous process only after lockTimeoutMs; the lease is released when the process exits, not when its answer ends (acquireSessionLease and runLeased at chat-panel.ts:747-829). [[c1]]
- Newest message wins: only the current generation posts; a superseded turn keeps reading to its terminal event (chat-panel.ts:900-906). [[c1]]
- Stop ends the live and the followed turn; a chat switch, close or adopt only detaches a session-file turn (stopActive/detachActive called from cancel-turn vs new-chat/open-chat/dispose/adopt). [[c2]]
- liveTurn is owned by one host; another host follows only once the owner pid is dead; the cursor is cleared at the terminal event (ChatSession.liveTurn). [[c3]]
- ChatPanelHostDeps and chat-panel.ts exports, including DEFAULT_TURN_LOCK_TIMEOUT_MS used by extension.ts:52, are unchanged. [[c4]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (vscode-plugin/src/**/__tests__/*.test.ts)`

**Test levels**

- **unit** — The lifecycle rules in isolation, with memory session locks, a fake ProviderRegistry whose adapter yields scripted TurnEvents and reports a fake TurnProcess through onSpawn, an in-memory store and a recording sink.
  - Subjects: `createTurnLifecycle start: waits for the lease, reports waiting, runs, lease released on process exit not at done`, `start supersede: a second start drops a waiting turn; a reading turn stops reporting but reads to its end`, `start not current after grant: lease released, nothing runs`, `start lock failure: onError('could not lock chat session: ...')`, `start throw inside the run (beforeRun rejects): onError with 'none' and the session saved; lease released`, `cursor: liveTurn set and saved on spawn, throttled progress saves, cleared at the terminal event before onTerminal; nativeSessionId set on done`, `stop: cancels the provider turn and stops the live and resumed processes; idempotent with nothing running`, `detach: a session-file turn keeps running, cursor saved, follow then resumes it; a pipe turn is stopped`, `follow: skipped for a running turn and for a live other owner; takes ownership from a dead owner; onEnd after the cursor is cleared`, `invalidate and isOpen=false: no sink calls`, `live: defined after the first event, undefined after stop/detach`
  - Fixtures: `vscode-plugin/src/chat/__tests__/fixtures.ts (fakeLiveProc, waitFor, tick)`, `createMemorySessionLocks from session-lock.ts`
- **integration** — The panel still behaves the same through the module: the existing chat-panel.test.ts and extension-chat-wiring.test.ts suites pass unchanged.
  - Subjects: `vscode-plugin/src/chat/__tests__/chat-panel.test.ts (111 cases)`, `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `turn-lifecycle.test.ts: the unit cases above, one per lifecycle rule` |
| `ac2` | `chat-panel.test.ts and extension-chat-wiring.test.ts unchanged and passing`, `plugin tsc --noEmit clean` |

## 6. Migration

**State before:** The turn lifecycle lives inside the createChatPanelHost closure (chat-panel.ts:132-1220): turn state at 142-177, followLiveTurn 269-324, stopLive/stopActive/detachActive 678-739, acquireSessionLease 747-775, and runTurn 777-958 which mixes prompt bookkeeping with the lease, the generation rules, the process and the cursor (s1 symbol.locate and usage.example bundles).

**State after:** vscode-plugin/src/chat/turn-lifecycle.ts holds createTurnLifecycle with that state and those rules plus CURSOR_SAVE_MS and DEFAULT_TURN_LOCK_TIMEOUT_MS. createChatPanelHost creates one lifecycle from its resolved deps and calls start/follow/stop/detach/invalidate/live; runTurn keeps the echo, title, request building and a TurnSink; followLiveTurn becomes a FollowSink passed to follow. chat-panel.ts re-exports DEFAULT_TURN_LOCK_TIMEOUT_MS.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add turn-lifecycle.ts with createTurnLifecycle and its unit tests (turn-lifecycle.test.ts); the panel does not use it yet. — ↩ rollbackable
2. Switch createChatPanelHost to the module: remove the moved state and functions, route runTurn/followLiveTurn/cancel-turn/new-chat/open-chat/decision/dispose/adopt through the lifecycle, re-export DEFAULT_TURN_LOCK_TIMEOUT_MS. Run chat-panel.test.ts and extension-chat-wiring.test.ts unchanged, the full plugin suite and the plugin tsc. — ↩ rollbackable

**Backward compat:** No public change: ChatPanelHostDeps, ChatPanelHost and every chat-panel.ts export (including DEFAULT_TURN_LOCK_TIMEOUT_MS imported by extension.ts:52) keep their shape. Persisted ChatSession data (liveTurn) and the lock and session files are unchanged, so sessions saved by the previous build resume as before.

## 7. Alternatives considered

### 7.1 a1: Turn lifecycle factory with a sink — **CHOSEN**

createTurnLifecycle(deps) in a new chat/turn-lifecycle.ts owns lease, generation, process, cursor and follow; the panel passes a TurnSink of callbacks per turn.

New vscode-free module turn-lifecycle.ts exporting createTurnLifecycle(deps: {providers, store, locks, lockTimeoutMs, hostPid, processStartTime, isAlive, logger}) returning TurnLifecycle {start(session, req, sink), follow(session, sink), stop(), detach(), invalidate(), live}. It holds all of the state currently at chat-panel.ts:142-177 that concerns turns (activeTurnId, activeProvider, activeIterator, generation, runningTurns, following, resumedProc, detachLive, waitCtl, liveProc) and the bodies of acquireSessionLease, the runLeased block of runTurn, followLiveTurn, stopLive, stopActive and detachActive. A TurnSink carries the panel callbacks: isCurrent-aware onWaiting, onEvent(ev) (panel posts, appends, records pending perms/selections, governor.observe), onTerminal(ev) (save, governor.resolveTurn, postHistory), beforeRun (governor.beginTurn), onError(message). The panel keeps echo, title, request building, appendEvent and the message switch. CURSOR_SAVE_MS and DEFAULT_TURN_LOCK_TIMEOUT_MS move to the module; chat-panel re-exports DEFAULT_TURN_LOCK_TIMEOUT_MS so extension.ts is unchanged.

### 7.2 a2: Event-emitter lifecycle object

A TurnLifecycle class that emits typed events (waiting/event/terminal/error) the panel subscribes to once.

Same state and rules as a1 but exposed as a class with on('event'|'terminal'|'waiting'|'error') subscriptions registered once at host creation; start(session, req) returns a promise. The panel subscribes in createChatPanelHost and routes events to post/appendEvent based on the session carried in each event.

**Rejected because:** Same ownership as a1 but a new idiom and weaker ordering guarantees for the awaited pre-spawn hook (partial on keeping behaviour).

### 7.3 a3: Split into two modules: lease runner and follower

turn-runner.ts for live turns (lease, generation, process) and turn-follower.ts for resuming saved turns, coordinated by the panel.

Extract runTurn's lease and loop into createTurnRunner and followLiveTurn into createTurnFollower; the panel composes them and implements stopActive/detachActive by calling both.

**Rejected because:** Leaves the coupling in the panel: partial on ownership and testability because Stop/detach and runningTurns stay coordinated by the panel.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "export function createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost {"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "const stopActive = async (): Promise<void> => {"
- **[[c3]]** `code` `vscode-plugin/src/chat/session-store.ts` — "liveTurn?: LiveTurn;"
- **[[c4]]** `code` `vscode-plugin/src/extension.ts` — "import { createChatPanelHost, CHAT_VIEW_TYPE, DEFAULT_TURN_LOCK_TIMEOUT_MS, type ChatPanelChannel } from './chat/chat-panel.js';"
- **[[c5]]** `code` `vscode-plugin/src/chat/session-lock.ts` — "export async function runLeased<T>(lease: SessionLease, body: (attach: (proc: LeaseProcess) => void) => Promise<T>): Promise<T> {"
- **[[c6]]** `prior-artifact` `docs/standalone/defect-vscode-plugin-src-chat-chat-E202610108ca7382b/ISSUE.md`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 0 could not be verified · 7 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T18:27:21.989Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | MED | TurnLifecycleDeps.processStartTime has the type (pid: number) => number \| null and takes what the panel resolves today. | chat-panel.ts:98 declares `readonly processStartTime?: ((pid: number) => number \| undefined) \| undefined;`. session-lock.ts:322 declares `export function defaultProcessStartTime(pid: number): number \| undefined`. Line 851 turns undefined into null itself (`startTime(proc.pid) ?? null`). Under strict TS, passing the panel's resolved `startTime` into a dep typed `number \| null` fails tsc. That breaks the LLD's own 'plugin tsc --noEmit clean' acceptance check. Type the dep as `number \| undefined` and keep the `?? null` inside the module. [files: vscode-plugin/src/chat/chat-panel.ts, vscode-plugin/src/chat/session-lock.ts] | Change TurnLifecycleDeps.processStartTime to `(pid: number) => number \| undefined` (matching ChatPanelHostDeps and defaultProcessStartTime), and keep the `?? null` coercion when writing liveTurn.startedAt. |

#### Could not verify (does not block)

_None._
