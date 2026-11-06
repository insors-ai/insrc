<!-- insrc:artifact LLD-48ffbec56130edb6-s1 -->

# LLD: STORY-48ffbec56130edb6-s1

## Summary

**Epic:** `end-correlated-claude-turn-s-stdin`
**HLD base run:** `wf-1793964843326-pinqsk`
**HLD effective hash:** `50f12d0b1163...`

When the reader of a Claude turn is abandoned before the turn's result (the chat is detached, you switch chats, or the follow is stopped), the adapter now ends the CLI's input in run()'s finally. The CLI then finishes its in-flight work and exits by itself, so it no longer idles holding the session's chat lock. Nothing closes the input at spawn or before the result, and the background observer is unchanged.

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

### 2.1 `run`

```typescript
run(req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent>  // existing method of makeStreamAdapter, finally extended
```

**Parameters:**
- `req: TurnRequest` — The turn to start; unchanged.
- `opts: RunOptions` _(optional)_ — Spawn, progress and decoder hooks; unchanged.

**Returns:** `AsyncIterable<TurnEvent>` — Unchanged: the turn's events, ending at a done or error.

**Preconditions:**
- The turn is a correlated Claude turn (the mapper has formatInput, so state.requestUuid is defined).

**Postconditions:**
- If the iterator is abandoned before a terminal event, the CLI's input is ended in the finally, once, before any pipe-turn kill.
- If a terminal event was reached, the finally adds nothing: the input was already ended in the read loop.
- A pipe turn that is abandoned is still stopped with SIGTERM and its pending requests are cleared, as before.
- Codex and Vibe turns (no requestUuid) are untouched.

### 2.2 `endInput`

```typescript
endInput?(): void  // existing optional member of SpawnedProcess
```

**Returns:** `void` — Ends the process stdin; idempotent and never throws.

**Postconditions:**
- A second call, or a call on a destroyed or ended stream, does nothing.

## 3. Data model changes

### 3.1 `run() abandonment contract` — invariant-change

Before: a Claude turn that writes to its session file and is abandoned before its result is only detached from, so its input stays open and the CLI idles after its answer. After: the input is ended when the reader is abandoned before the result. The input is never ended earlier than that, and the observer takes no action on the process. The current behaviour that is kept: the CLI's pid, the live entry and the pending requests are released by the process's exit, not by the stream.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts:272`
- `vscode-plugin/src/chat/cli-adapter.ts:1229-1236`
- `vscode-plugin/src/chat/cli-adapter.ts:1322`
- `vscode-plugin/src/chat/cli-adapter.ts:1375-1384`
- `vscode-plugin/src/chat/cli-adapter.ts:1841`
- `vscode-plugin/src/chat/turn-lifecycle.ts:154-160`
- `vscode-plugin/src/chat/turn-lifecycle.ts:486`

## 4. Error paths

**Error cases**

- **The process seam's endInput() throws when called from the finally** (recoverable)
  - Detection: The call in the finally raises an exception (the production seam is guarded, but a test double or another spawner need not be).
  - Response: The call is wrapped so the exception is swallowed and the rest of the finally (pipe-turn kill, pending-request cleanup) still runs.
  - User impact: None: the cleanup the finally already did is not skipped.
- **The CLI does not exit after its input ended** (recoverable)
  - Detection: proc.exit stays unresolved after the abandonment; the adapter does not watch for it.
  - Response: No new action: the live map entry stays until exit, and cancel() and the stop paths remain the way to end it.
  - User impact: The chat lock stays held until the user stops the turn, as for any turn that does not finish.
- **An in-turn approval is pending when the reader is abandoned** (recoverable)
  - Detection: A later decide() finds the stdin ended: the process seam's write() returns false for an ended stream.
  - Response: decide() reports delivered false and does not consume the request, so the existing follow-up path answers it.
  - User impact: The approval is answered by a follow-up run instead of over the closed pipe.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The reader is abandoned after the correlated result | The input was already ended in the read loop; the finally sees terminal true and adds no second call. |
| The reader is abandoned while a read is pending and the next line is the result | The generator resumes, handles the result (ending the input there) and the finally then does nothing more. |
| The reader is abandoned while a read is pending and the next line is not the result | The finally ends the input; the CLI finishes the turn and exits. |
| The input write failed before the first event | The turn is already terminal with the stdin error; the finally adds no call. |
| A Codex or Vibe turn is abandoned | No request id and no endInput: nothing is called. |
| A pipe turn (no session output) is abandoned before its result | The input is ended and the child is stopped with SIGTERM, as before. |

**Invariants to preserve**

- The input is ended at the correlated result inside the read loop, exactly once, and never before it. [[c3]]
- An abandoned pipe turn is stopped with SIGTERM and its pending requests are cleared; a session-file turn is not killed. [[c4]]
- The live entry and the pending requests are released by the process's exit, not by the stream. [[c2]]
- endInput stays optional and idempotent on the process seam, and its production implementation guards destroyed and ended streams. [[c1]]
- The production implementation of endInput stays input.end() behind the destroyed and writableEnded guards. [[c5]]
- Abandoning an iterator stays a non-waiting return(); the lifecycle is not changed. [[c6]]
- Detach keeps leaving the CLI writing to the session file for the observer to finish. [[c7]]
- The observer still reads detached turns and takes no action on the process. [[c9]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (vscode-plugin)`

**Test levels**

- **unit** — Pin when run() ends a correlated Claude turn's input and when it must not.
  - Subjects: `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts: an abandoned session-file Claude turn ends its input once and is not killed`, `same file: an abandoned pipe turn ends its input and is stopped with SIGTERM`, `same file: nothing ends the input before the correlated result (existing test stays green), and an abandonment after the result adds no second call`, `same file: a throwing endInput does not stop the finally's cleanup`, `same file: an abandoned Codex turn never calls endInput (extends the existing prompt-argument test)`
  - Fixtures: `makeFakeSpawner with hangUntilKilled and the inputEnds() and signals() handles from fixtures.ts`, `createSessionOutput over a temp root for the session-file case`
- **live** — Show the real CLI behaves as the design assumes, reported by the builder because the gate cannot run it.
  - Subjects: `real claude CLI: close stdin mid-turn, the turn completes with the matching request id and the process exits 0`, `real claude CLI: stdin left open idles after the result; closing it at the result lets background work finish`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `cli-adapter-correlation.test.ts: an abandoned session-file Claude turn ends its input once and is not killed`, `cli-adapter-correlation.test.ts: an abandoned pipe turn ends its input and is stopped with SIGTERM` |
| `ac2` | `cli-adapter-correlation.test.ts: a correlated Claude turn ends the CLI stdin at its own result, not before`, `cli-adapter-correlation.test.ts: an abandonment after the result adds no second call` |
| `ac3` | `cli-adapter-correlation.test.ts: a throwing endInput does not stop the finally's cleanup`, `cli-adapter-correlation.test.ts: a prompt-argument CLI turn never has an input to end` |

## 6. Migration

**State before:** A correlated Claude turn's input is ended only in run()'s read loop at the correlated result (cli-adapter.ts:1322); a session-file turn abandoned earlier is only detached from (cli-adapter.ts:1375-1384), so the CLI idles after its answer and holds the chat lock.

**State after:** run()'s finally also ends the input of a correlated turn that is abandoned before its result, so the CLI finishes its in-flight work and exits by itself. Nothing closes the input earlier, and the observer is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the abandonment branch to run()'s finally: for a correlated turn with no terminal event, end the input before the existing pipe-turn kill, shielding the rest of the cleanup from a throwing seam. — ↩ rollbackable
2. Add the unit tests for abandonment, no-early-close and the throwing seam to the correlation suite. — ↩ rollbackable
3. Record the live checks as reported test results in the build's test record. — ↩ rollbackable

**Backward compat:** No public API, wire format, stored record or setting changes. endInput stays an optional member of the process seam; spawners without it behave as before.

## 7. Alternatives considered

### 7.1 a1: End the input in run()'s finally when a correlated turn is abandoned before its result — **CHOSEN**

In run()'s existing finally, call the existing endInput() seam when the turn is correlated and no terminal event was reached.

In run()'s finally (cli-adapter.ts:1375-1384), add one branch: when state.requestUuid is defined and 'terminal' is still false, call proc.endInput?.() before the existing pipe-turn kill. endInput() is already idempotent and never throws (it checks destroyed and writableEnded), so a later normal terminal path or a second call is harmless. A turn that reached its terminal has already ended its input in the read loop, so the finally changes nothing for it. A session-file turn is then left to finish its in-flight work and exit by itself (live check: it completes the turn, answers with the matching request id, exits 0, and lets background tasks finish); a pipe turn is still killed as today. Nothing closes the input at spawn or before the correlated result, and the observer is unchanged. Codex and Vibe have no endInput and are untouched.

### 7.2 a2: Give the lifecycle an explicit handle to end the input at detach

Expose endInput on the TurnProcess handle passed to onSpawn and have the lifecycle's detach and stop call it directly.

Add an optional endInput() to the TurnProcess handle that run() passes to opts.onSpawn, and have turn-lifecycle.ts call it in detachThis and the other places that abandon a live iterator, instead of relying on run()'s finally. The adapter keeps its call at the correlated result.

**Rejected because:** Closes at the exact moment of detach but widens the TurnProcess contract and every abandon site in the lifecycle for no gain the finally does not already give.

### 7.3 a3: Keep the input open and let a background watcher close it after the result

When the reader is abandoned, hand the process to a watcher that closes the input once the correlated result appears in the session file.

On abandonment, keep a watcher in the adapter that tails the session output for the correlated result of that turn and ends the input when it appears, so the CLI never sees EOF mid-turn.

**Rejected because:** Adds a second reader per detached turn to avoid an EOF-in-the-middle risk that the live check shows does not exist.

### 7.4 a4: Close the input at spawn when no approvals can arrive

End stdin right after writing the user message for turns that cannot raise a permission request.

After the user message is written, end the input at once for permission modes where the CLI never asks the host, so the CLI exits at its own result without any later close.

**Rejected because:** Is the preemptive closing the user ruled out and cannot serve review-mode turns.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:272`
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1229-1236`
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1322`
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1375-1384`
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1841`
- **[[c6]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:154-160`
- **[[c7]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:486`
- **[[c8]]** `code` `vscode-plugin/src/chat/chat-panel.ts:640`
- **[[c9]]** `code` `vscode-plugin/src/chat/chat-panel.ts:895`
- **[[c10]]** `doc` `docs/plans/main-sync-2-conflicts.md`
- **[[c11]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts:204`
- **[[c12]]** `code` `vscode-plugin/src/chat/__tests__/fixtures.ts`

## 9. Open questions

- alt2: constraintScore is empty because the Story has no acceptance criteria, HLD contracts or epic constraints to score against.

## Resolved questions

- `qd90111c1` — alt2: constraintScore is empty because the Story has no acceptance criteria, HLD contracts or epic constraints to score against.
  - **resolved**: Proceed explicitly unscored — User decision 2026-11-06: keep constraintScore empty; no acceptance criteria, HLD contracts or epic constraints exist, and the LLD maps ac1 to ac3 to proving tests. _(2026-11-06T13:15:13.644Z)_

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:272`
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1229-1236`
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1322`
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1375-1384`
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1841`
- **[[c6]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:154-160`
- **[[c7]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:486`
- **[[c8]]** `code` `vscode-plugin/src/chat/chat-panel.ts:640`
- **[[c9]]** `code` `vscode-plugin/src/chat/chat-panel.ts:895`
- **[[c10]]** `doc` `docs/plans/main-sync-2-conflicts.md`
- **[[c11]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts:204`
- **[[c12]]** `code` `vscode-plugin/src/chat/__tests__/fixtures.ts`
