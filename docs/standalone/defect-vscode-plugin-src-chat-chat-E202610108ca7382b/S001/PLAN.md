<!-- insrc:artifact PLAN-8ca7382b0952a539-s1 -->

# Plan: E202610118ca7382b:S001

## Summary

**Epic:** `defect-vscode-plugin-src-chat-chat`
**LLD run:** `wf-1791656474528-tybrj9`
**LLD effective hash:** `6631394079e4...`

The build adds turn-lifecycle.ts in three steps: starting a turn, then stopping and detaching, then following a saved turn. Each step comes with unit tests that use memory locks and a fake adapter. The panel is then switched over to the module and the moved code is deleted from it. The existing 111 panel tests and the wiring tests must pass without edits, which shows behaviour is unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** turn-lifecycle.ts: start, invalidate and live | M | — | unit: start waits for the session lease, reports waiting, runs, and releases the lease when the process exits; unit: a second start drops a turn still waiting for its lease; unit: a superseded turn reports nothing, reads to its end and clears its cursor; unit: a lease granted after the turn stopped being current is released; unit: a lock failure and a missing adapter are reported through onError; unit: a beforeRun failure is reported, the session saved and the lease released; unit: the cursor is saved on spawn, throttled on progress and cleared before onTerminal; unit: invalidate and a closed panel suppress all sink calls; live names the turn being read | [[c1]] [[c2]] [[c3]] [[c5]] |
| 2 | **`t2`** turn-lifecycle.ts: stop and detach | M | `t1` | unit: stop cancels the provider turn and stops the live process; idempotent with nothing running; unit: stop and detach drop a turn waiting for its lease; unit: detach leaves a session-file turn running with its cursor saved and stops a pipe turn; unit: stop continues past a failing cancel or process stop | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** turn-lifecycle.ts: follow a saved turn | M | `t1`, `t2` | unit: follow skips a running turn, a turn already followed and a turn owned by a live host; unit: follow takes ownership from a dead host, reports every event, clears the cursor and calls onEnd; unit: a failing resume keeps the cursor saved; unit: stop ends a followed turn's process; detach leaves it running; unit: a detached session-file turn is resumed by follow | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Switch createChatPanelHost to the module | M | `t1`, `t2`, `t3` | integration: chat-panel.test.ts passes unchanged; integration: extension-chat-wiring.test.ts passes unchanged | [[c1]] [[c4]] [[c5]] |

### 1.1 E202610118ca7382b:S001:T001 — turn-lifecycle.ts: start, invalidate and live

Create vscode-plugin/src/chat/turn-lifecycle.ts with createTurnLifecycle(deps), TurnLifecycleDeps, TurnSink, CURSOR_SAVE_MS and DEFAULT_TURN_LOCK_TIMEOUT_MS. Move into it the turn state (activeTurnId, activeProvider, activeIterator, generation, runningTurns, detachLive, waitCtl, liveProc), acquireSessionLease and the runLeased block of runTurn as start(session, req, sink), plus invalidate() and live, with sink calls only while current. Add turn-lifecycle.test.ts covering these rules. The panel is not changed yet.

**Acceptance checks:**
- start waits for the lease (onWaiting while current), runs, and the lease is released when the process exits, not at done
- a second start drops a waiting turn; a reading turn is superseded, stops reporting, reads to its end and clears its cursor
- a lease granted after the turn stopped being current is released and nothing runs
- a lock failure gives onError('could not lock chat session: ...', 'none'); a beforeRun throw gives onError and a save, and the lease is released
- no adapter for the provider gives onError('no adapter for provider <p>', 'none'); an adapter that never attaches a process has its lease released on return
- liveTurn is saved on spawn, progress saves are throttled to CURSOR_SAVE_MS, and the cursor is cleared before onTerminal; nativeSessionId is set on done
- invalidate and isOpen()=false suppress all sink calls; live is defined after the first event
- plugin tsc --noEmit is clean

### 1.2 E202610118ca7382b:S001:T002 — turn-lifecycle.ts: stop and detach

Move stopLive, stopActive and detachActive into the module as stop() and detach(): abort the lease wait, return the iterator, cancel the provider turn and stop the live process (stop), or for a session-file turn stop reading and keep the process, lease and saved cursor (detach). A pipe turn is stopped either way. Add unit tests.

**Acceptance checks:**
- stop cancels the provider turn, stops the live process, resolves once it has exited, and is idempotent with nothing running
- stop or detach while a turn waits for its lease drops that turn silently
- detach keeps a session-file turn running with its lease, saves its cursor and removes it from runningTurns; detach stops a pipe turn
- failures from cancel or proc.stop are swallowed and the remaining steps still run
- live is undefined after stop and after detach

### 1.3 E202610118ca7382b:S001:T003 — turn-lifecycle.ts: follow a saved turn

Add follow(session, sink) and FollowSink to the module: move followLiveTurn's ownership and skip rules, the resume with the throttled cursor saves, nativeSessionId, the end-of-turn cursor clear and onEnd. Make stop also abort the follow and stop the resumed process, and make detach abort the follow without stopping that process. Add unit tests.

**Acceptance checks:**
- follow is a no-op with no liveTurn, while already following the session, for a turn running in this host, and when the owner is another live host
- follow takes ownership from a dead owner (ownerHostPid saved), passes every event to onEvent, clears the cursor and saves at the end, then calls onEnd
- a resume that throws is logged and the cursor stays saved
- stop aborts the follow and stops the resumed process; detach aborts the follow and leaves that process running
- after detach of a session-file turn started here, follow resumes it

### 1.4 E202610118ca7382b:S001:T004 — Switch createChatPanelHost to the module

In chat-panel.ts, create one lifecycle from the resolved deps (with isOpen = !disposed and the store). runTurn keeps the echo, title and request building, and calls lifecycle.start with a TurnSink (post waiting status, governor.beginTurn, post+appendEvent+pending perms/selections+governor.observe, store.save+resolveTurn+postHistory, error post). followLiveTurn becomes lifecycle.follow with a FollowSink. Map the call sites: cancel-turn to stop; new-chat and open-chat to detach then invalidate; dispose, onDidDispose and adopt to detach; decision to live. Remove the moved state and functions, and re-export DEFAULT_TURN_LOCK_TIMEOUT_MS.

**Acceptance checks:**
- chat-panel.test.ts and extension-chat-wiring.test.ts pass with no test edits
- the full plugin suite shows no new failures against the known baseline
- plugin tsc --noEmit is clean
- extension.ts is unchanged and still imports DEFAULT_TURN_LOCK_TIMEOUT_MS from chat-panel.js
- runTurn calls lifecycle.start after the echo, title and save, with no await before it
- createChatPanelHost no longer declares the moved turn state or functions

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| createTurnLifecycle start: waits for the lease, reports waiting, runs, lease released on process exit not at done | `t1` |
| start supersede: a second start drops a waiting turn; a reading turn stops reporting but reads to its end | `t1` |
| start not current after grant: lease released, nothing runs | `t1` |
| start lock failure: onError('could not lock chat session: ...') | `t1` |
| start throw inside the run (beforeRun rejects): onError with 'none' and the session saved; lease released | `t1` |
| cursor: liveTurn set and saved on spawn, throttled progress saves, cleared at the terminal event before onTerminal; nativeSessionId set on done | `t1` |
| stop: cancels the provider turn and stops the live and resumed processes; idempotent with nothing running | `t2`, `t3` |
| detach: a session-file turn keeps running, cursor saved, follow then resumes it; a pipe turn is stopped | `t2`, `t3` |
| follow: skipped for a running turn and for a live other owner; takes ownership from a dead owner; onEnd after the cursor is cleared | `t3` |
| invalidate and isOpen=false: no sink calls | `t1` |
| live: defined after the first event, undefined after stop/detach | `t1`, `t2` |
| vscode-plugin/src/chat/__tests__/chat-panel.test.ts (111 cases) | `t4` |
| vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s1 errorPaths`
- **[[c3]]** `prior-artifact` `LLD s1 testStrategy`
- **[[c4]]** `prior-artifact` `LLD s1 migration`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges`
