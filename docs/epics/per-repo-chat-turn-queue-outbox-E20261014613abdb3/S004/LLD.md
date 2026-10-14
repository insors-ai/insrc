<!-- insrc:artifact LLD-613abdb351c2c738-s4 -->

# LLD: E20261014613abdb3:S004

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**HLD base run:** `wf-1791967985926-oydluz`
**HLD effective hash:** `02f5e748bf5b...`

S004 makes a provider hiccup or a start-up failure fix itself. A pure classifier reads a failed turn's error text into a cause, and the chat host's queued-turn runner reports whether the turn acted (any tool call, file edit or tool result) alongside it. The store's finish() then turns a failed outcome that is infrastructure-caused, has not acted and has used fewer than 3 retries into a retrying row due after 10 s, 1 min or 5 min, in the same transaction that releases the lease; every other failure is failed with its error and a resend. The outbox shows the attempt and a countdown with retry-now beside cancel, and a credentials failure is never retried and tells the user how to sign in again.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-613abdb351c2c738** § 2. Framework summary

**Rollout phase:** Phase C — retries and the review pane
**Consumes:** `sc1` (ChatQueueStore), `sc3` (TurnOutcome), `sc4` (ChatQueueWorker), `sc5` (OutboxView)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The SQLite schema, the repo key and store location, the window key, the worker's polling cadence and timers, the turn runner and the chat host's change from starting turns to submitting them. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The outbox's markup, styles and live updates, the projection from queue rows to OutboxView, and the handling of the outbox actions in the chat host. — owns `sc5`
- `s3`: The lease takeover and reclaim rules, the not-delivered rule for a closed window, and the bound on stored records.
- `s5`: Sending review-pane decisions through the queue, the removal of the review pane's waiting list, and keeping attachments of live messages.

## 2. Contract details

**Surface level:** internal

### 2.1 `classifyFailure`

```typescript
classifyFailure(message: string): InfraCause
```

**Parameters:**
- `message: string` — the error text of a failed turn (the TurnEvent error message or the text of a thrown error)

**Returns:** `InfraCause` — 'auth' for a credentials failure, 'spawn' for a CLI that could not start for a passing reason, 'rate-limit', 'overloaded', 'network' or 'timeout' for a passing provider or connection problem, and 'other' for anything else, including a refusal or an error from the model and a CLI that is not installed

**Postconditions:**
- pure: no I/O, no state
- new (a module of the plugin); the plugin cannot import the daemon's isTransientCliError, so it carries its own patterns for the messages cli-adapter.ts produces and the CLIs print
- a message that matches no pattern is 'other', never retried: a wrong guess toward retrying could repeat a turn that acted

### 2.2 `settleQueued`

```typescript
settleQueued(): void  // in chat-panel.ts; resolves the queued message's TurnOutcome
```

**Returns:** `void` — resolves a failed queued turn as {kind:'failed', error, acted, cause} where acted is true once the turn emitted a tool-call, file-edit or tool-result event, and cause is classifyFailure(error)

**Preconditions:**
- a queued turn has ended with an error

**Postconditions:**
- acted:false only when no acting event was seen before the failure
- the 'the chat no longer exists' failure stays acted:false with no cause, so it is never retried
- every failed turn's cause and error text are logged through the chat's logger, so a missed classifier pattern is visible; an unmatched text is 'other' and ends failed

### 2.3 `finish`

```typescript
finish(seq: number, outcome: TurnOutcome): QueuedMessage | undefined
```

**Parameters:**
- `seq: number` — the message
- `outcome: TurnOutcome` — the existing failed outcome with acted and cause

**Returns:** `QueuedMessage | undefined` — the row after the change; for a retryable failure state 'retrying' with attempts+1, nextAttemptAt = now + RETRY_DELAYS_MS[attempts] and the error kept; otherwise 'failed' with the error

**Errors:**
- `StoreBusy` when the write waited past the busy timeout

**Preconditions:**
- the message is the lease's, state processing

**Postconditions:**
- a failed outcome is retried only when cause is spawn, rate-limit, overloaded, network or timeout, acted is false and attempts < MAX_INFRA_RETRIES (3)
- the retrying row keeps its seq, so it stays at the front
- the lease row is deleted in the same transaction in every case
- existing outcomes (done, detached-ended, stopped, not-delivered) behave as before

### 2.4 `retryNow`

```typescript
retryNow(seq: number): boolean
```

**Parameters:**
- `seq: number` — a retrying message

**Returns:** `boolean` — true when the row was retrying and its nextAttemptAt is now at or before the clock, so the next worker tick takes it; false for any other row

**Errors:**
- `StoreBusy` when the write waited past the busy timeout

**Postconditions:**
- attempts is not changed: retry-now does not consume or refund an attempt
- new on sc1 (additive)

### 2.5 `act`

```typescript
act(seq: number, action: 'cancel' | 'dismiss' | 'resend' | 'retry-now'): { readonly ok: true } | { readonly ok: false; readonly note: string }
```

**Parameters:**
- `seq: number` — the outbox row
- `action: 'cancel' | 'dismiss' | 'resend' | 'retry-now'` — the outbox action; 'retry-now' is the one S004 adds

**Returns:** `{ ok: true } | { ok: false; note: string }` — retry-now on a retrying message calls retryNow and ticks at once; on any other row it is refused with a sentence

**Postconditions:**
- a refusal carries a note and is never thrown
- cancel on a retrying row works as S002 built it

### 2.6 `outbox-retry-now`

```typescript
{ type: 'outbox-retry-now'; seq: number }  // webview -> host, named by sc5's OutboxAction
```

**Parameters:**
- `seq: number` — the retrying row

**Returns:** `void` — the chat host calls worker.act(seq, 'retry-now') and re-posts the outbox with any refusal note

**Postconditions:**
- the webview draws, for a retrying row, 'attempt n of 3', a countdown to nextAttemptAt, retry-now and cancel; a failed row's error line is unchanged

### 2.7 `runTurn`

```typescript
runTurn(text: string, ..., opts?: { attachments?: ...; suppressEcho?: boolean; skipUserRow?: boolean }): Promise<void>  // in chat-panel.ts; skipUserRow is the option S004 adds
```

**Parameters:**
- `opts.skipUserRow: boolean` _(optional)_ — set by the queued-turn runner when message.attempts > 0: startTurn does not push a user row to the stored transcript, does not echo it, skips the title check and does not save it again, but still sends the prompt to the CLI

**Returns:** `Promise<void>` — unchanged; a retried turn runs exactly as the first one did, minus the user row

**Preconditions:**
- the message is a retried queued message (attempts > 0)

**Postconditions:**
- with this version's runner on every window, the stored transcript holds one user row for the message after any number of retries (a retry run by a previous-plugin window adds a second row; see Backward compat)
- suppressEcho alone is not used for this: it guards only the live echo, startTurn still pushes the row
- the prompt is still sent to the CLI (a retry must re-send it), also on a resumed native session
- existing: runTurn as S001 and earlier built it; the option is new and additive

### 2.8 `persistInfo`

```typescript
persistInfo(s: ChatSession, turnId: string, text: string): void  // new helper in chat-panel.ts, beside the live-only postInfo
```

**Parameters:**
- `s: ChatSession` — the session whose stored transcript gets the line
- `turnId: string` — its own turn id, so the line closes itself
- `text: string` — one self-contained informational line

**Returns:** `void` — appends an assistant-delta and a done event for the line to the session's stored transcript with appendEvent and posts each with its row index (as followLiveTurn does), so the line shows live and again after a reload

**Postconditions:**
- unlike the existing postInfo, which only posts to the webview, the line is stored: the transcript shows 'the turn failed with <cause>; retrying (attempt n of 3)' between the failed attempt and the retried output after a reload, and the sign-in line after an auth failure
- used for exactly two lines: the retry line when a retried message starts and the sign-in line on an auth failure
- new (additive); postInfo is unchanged and still used for the live-only queue note

### 2.9 `done`

```typescript
{ kind: 'done'; turnId: string; ok: boolean; sessionId?: string; message?: string }  // TurnEvent in stream-events.ts; message is the field S004 adds
```

**Parameters:**
- `message: string` _(optional)_ — the provider's error text when ok is false: claude's result text on an is_error result, codex's error text; absent when ok is true or the CLI gave none

**Returns:** `TurnEvent` — a terminal event; with ok:false it now carries why the turn failed, so the host can classify it

**Postconditions:**
- additive: every existing consumer of 'done' ignores the new field and renders as before
- cli-adapter.ts's two mappers set it (claude: obj.result when is_error is true; codex: the error text of a result with an error) and both doneEvent wrappers (live and resumed turn) carry it through with the session id
- onTerminal in chat-panel.ts treats done with ok:false as a failure: q.error = message ?? 'the turn ended with an error', so settleQueued resolves failed, not done

### 2.10 `finishNow`

```typescript
finishNow(seq: number, outcome: TurnOutcome): boolean  // existing in chat-queue-worker.ts; BUSY_GIVE_UP_MS is the constant S004 adds
```

**Parameters:**
- `seq: number` — the message whose outcome is written
- `outcome: TurnOutcome` — the outcome to write

**Returns:** `boolean` — true when finish and release were written; false when the store was busy, and the worker keeps the outcome in pendingFinish and tries again each tick

**Errors:**
- `StoreBusy` when the write waited past the busy timeout

**Postconditions:**
- the retry of a busy outcome write is bounded: after BUSY_GIVE_UP_MS (60000 ms) of failed attempts the worker stops retrying, logs an error and shows one chat note saying the queue could not record the message's result and that reloading the window recovers it
- after the give-up the message stays processing and the lease unheartbeated; a reload recovers it through S003's rule (same windowKey, the old process gone: the lease is freed at once, the message fails with a resend, the queue moves on)
- existing behaviour (keep the outcome, retry each tick, before any new message is taken) is unchanged inside the bound

## 3. Data model changes

### 3.1 `messages (state retrying)` — invariant-change

No schema change (schema version stays 2). attempts and next_attempt_at already exist and are read by rowToMessage, the outbox projection, LIVE_HEAD and acknowledge; S004 is the first writer of retrying, attempts and next_attempt_at. The retrying row keeps the last error so the outbox can show why. The infrastructure retry schedule is RETRY_DELAYS_MS = [10000, 60000, 300000] and MAX_INFRA_RETRIES = 3. S004 also changes how an existing failure is reported: today a claude turn that ends with an is_error result is mapped to done ok:false with the text dropped, onTerminal records only terminal 'done', and settleQueued resolves done, so the message is deleted as if it had succeeded; S004 carries the text and resolves it failed. That is a defect fix in S001's behaviour, not only a new capability.

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-store.ts`
- `vscode-plugin/src/chat/chat-queue-worker.ts`
- `vscode-plugin/src/chat/chat-outbox.ts`
- `vscode-plugin/src/chat/chat-panel.ts (settleQueued, the queued-turn runner, runTurn/startTurn, the host's outbox action switch, the webview script)`
- `vscode-plugin/src/chat/chat-failure.ts (new: the classifier and the retry constants)`
- `vscode-plugin/src/chat/cli-adapter.ts (the claude and codex result mappers and the doneEvent wrappers)`
- `vscode-plugin/src/chat/stream-events.ts (the done event)`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Completes the finish() retrying branch the sketch names and adds retryNow beside the existing methods (additive); uses cancel, acknowledge and LIVE_HEAD unchanged, so a retrying head still holds the queue and S003's closed-window rule still marks it when its window is closed. |
| `sc3` | consumes | Uses the existing failed outcome with acted and cause; adds no outcome kind. The runner now fills cause and a true acted. |
| `sc4` | consumes | Adds the 'retry-now' action to the worker's act (additive to cancel, dismiss, resend). The worker's tick, due logic and pendingFinish retry of a busy finish are unchanged: a StoreBusy on finish is waited out each tick, and enqueue already refuses a busy store with a note. |
| `sc5` | consumes | Completes what sc5 names and S002 did not build: the 'outbox-retry-now' action, a retry-now button, attempt text and a countdown on retrying rows. The OutboxRow already carries attempt and nextAttemptAt; no new field. |

## 5. Error paths

**Error cases**

- **A turn fails after it acted (a file edit or a tool call came before the error)** (recoverable)
  - Detection: the runner sets acted when it sees a tool-call, file-edit or tool-result event for the queued turn and never clears it, including across an approval re-run; finish reads outcome.acted
  - Response: finish writes failed with the error and never a retrying row, whatever the cause
  - User impact: the message shows failed with the error and a resend; it is not repeated behind the user's back (ac2)
- **The error text matches no known infrastructure pattern, or only a model refusal or model error** (recoverable)
  - Detection: classifyFailure returns 'other' when no pattern matches
  - Response: finish writes failed; nothing is retried on a guess
  - User impact: failed with the error and a resend
- **The provider rejects the credentials** (recoverable)
  - Detection: classifyFailure returns 'auth' for the adapter's 'is not authenticated' text and for the CLIs' unauthorised, invalid API key and login-required texts
  - Response: finish writes failed; the runner stores one line in the chat (persistInfo) naming the CLI's login command so the user can sign in again, also after a reload
  - User impact: failed with a resend after signing in; the chat says how to sign in (ac5)
- **The CLI binary is not installed** (recoverable)
  - Detection: the adapter's ENOENT message ('<binary> CLI not found') is classified 'other', not 'spawn'
  - Response: finish writes failed with that message at once: waiting 10 s, 1 min and 5 min cannot install a binary
  - User impact: failed with the install hint and a resend
- **The retry budget is spent** (recoverable)
  - Detection: finish sees attempts already at MAX_INFRA_RETRIES (3) when the third retry fails
  - Response: failed with the error; the next message becomes the head and runs (ac3)
  - User impact: failed with the error and a resend
- **The store stays busy when a turn's outcome is written** (recoverable)
  - Detection: StoreBusy from finish; finishNow keeps the outcome in pendingFinish and tries again each tick, before any new message is taken, for at most BUSY_GIVE_UP_MS (60 s)
  - Response: inside the bound the retrying row simply appears a poll later (state, attempts, time and lease are one transaction, nothing is half written); at the bound the worker stops retrying, logs an error and shows a chat note asking the user to reload the window. The reloaded window frees the lease at once (S003's same-windowKey rule), the message fails with a resend and the queue moves on
  - User impact: a brief conflict delays the retry wait by a poll; a persistent one shows a note after 60 s and one reload recovers
- **The user presses retry-now on a row that has meanwhile been taken, cancelled or finished** (recoverable)
  - Detection: retryNow's UPDATE matches only a row still in state retrying
  - Response: retryNow returns false and act answers with a note; nothing changes
  - User impact: a short note in the outbox
- **The window of a retrying head closes during the wait** (recoverable)
  - Detection: the closed-window rule of S003 sees the head's window with a stale presence row and a dead pid, and markNotDeliveredIfHead accepts a retrying head
  - Response: the message is marked not delivered with a resend and the queue moves on
  - User impact: not sent, with a resend
- **A claude or codex turn ends with an error result (is_error true) instead of an error event, which is how a provider overload or rate limit usually arrives** (recoverable)
  - Detection: the mapper turns the result into done with ok:false and now keeps the result text in done.message; onTerminal sees done ok:false and sets q.error to that text (or 'the turn ended with an error' when there is none), so settleQueued resolves failed with the text
  - Response: the text is classified: an overload before acting is retried (ac1); a failure after acting, an auth failure or an unmatched text ends failed with the text
  - User impact: a provider failure shows as failed (or retries) instead of silently counting as done

**Edge cases**

| Input | Expected |
| :--- | :--- |
| a retried message is started again for the same message (attempts > 0) | the runner passes the new skipUserRow option: startTurn pushes no user row, echoes none and does not save it again, so the stored transcript holds one user row after any number of retries; the prompt is still sent to the CLI. suppressEcho is not enough, it guards only the live echo |
| the first run fails on an overload, the second on a timeout, the third on a rate limit, and the fourth on a network error, none of them after acting | retries wait 10 s, 1 min and 5 min in that order, then the fourth failure is failed; attempts reads 1, 2, 3 and never exceeds 3 |
| retry-now pressed with 8 s of a 10 s wait left | the row is due at once; attempts stays at 1, so the schedule for a later failure continues with 1 min |
| the window reloads while a message waits to retry | the new worker reads the same absolute nextAttemptAt: it runs when due, not earlier and not after a fresh 10 s |
| a message with attachments is retried | it carries the same attachment refs; the retrying row keeps them and the attachment sweep still keeps its session |
| another window's message is queued behind a retrying head of this window | it waits: a retrying head that is not yet due holds the queue (S001's rule), and runs once the retrying message has run, failed or been cancelled |
| the turn's streamed output contains the word 'overloaded' but the turn ended without an error, or ended with an unrelated error | classification reads only the turn's error message, never the streamed output, so the streamed word has no effect |
| a turn streamed assistant text, no tool call or edit, and then failed with an overload | it has acted:false and an infrastructure cause, so it is retried (streamed text repeats no side effect). The partial text stays in the transcript, the failed attempt's error row stays, and the runner stores and posts one line 'the turn failed with <cause>; retrying (attempt n of 3)' before the retried output, so the transcript reads as a record of what happened |

**Invariants to preserve**

- A message is taken only by the window whose windowKey matches, and acknowledge takes the lease in the same transaction, so a retried message is never run twice at once. [[c11]]
- Every write is one short IMMEDIATE transaction: the retrying row, attempts, the due time and the lease release are written together. [[c12]]
- The lease is released only when no CLI of the turn is running: a failed outcome reaches finish only after the turn and its continuations have ended. [[c13]]
- The worker decides from the database alone: the retry's due time is stored on the row, not held in one window's memory. [[c3]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test in vscode-plugin), assert/strict, the existing fakeTime timers, gatedRunner and repo() helpers of chat-queue-worker.test.ts, real node:sqlite files in a temp directory, and the fake-DOM runShell of chat-shell.test.ts for the webview script`

**Test levels**

- **unit** — Prove the classifier is pure and conservative: only the five passing causes are retryable, everything unknown is other
  - Subjects: `classifyFailure: overloaded, rate limit, 429 and 5xx texts, timeouts and connection failures map to their causes`, `classifyFailure: the adapter's not-authenticated text and the CLIs' unauthorised and invalid key texts map to auth`, `classifyFailure: CLI not found (ENOENT) and any unmatched text, including a model refusal, map to other`
- **integration** — Prove finish() decides retry or failed in one transaction against a real SQLite file with two connections
  - Subjects: `finish: an infrastructure failure before acting becomes retrying with attempts 1 and nextAttemptAt now plus 10 s, keeps its seq and error, and releases the lease`, `finish: attempts 1 and 2 use 1 min and 5 min, and a failure at attempts 3 becomes failed with the error`, `finish: acted true, cause auth, cause other or a missing cause becomes failed with the error and is never retrying`, `retryNow: a retrying row becomes due at once with attempts unchanged; any other row returns false`
  - Fixtures: `repo() helper opening several stores on one file with a controllable clock`
- **unit** — Prove the worker and the runner carry the outcome and the action through, with fake timers
  - Subjects: `worker: a retrying head is not taken before its due time, holds the queue behind it, and runs when due`, `worker: a message that fails three infrastructure retries ends failed and the next message runs`, `worker: act retry-now on a retrying row runs it at the next tick; on any other row it is refused with a note`, `runner: a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true; one that failed with none reports acted false with the classified cause`, `runner: a retried message is started with skipUserRow, so the stored transcript has a single user row after a retry while the prompt is still sent to the CLI`, `runner: a retry stores and posts one 'retrying (attempt n of 3)' line, still in the stored transcript after a reload,, and a turn that streamed only text before an infrastructure failure is retried and keeps its partial text`, `runner: an auth failure stores and posts a sign-in line in the chat`, `cli-adapter: a claude result with is_error carries its text on done ok:false, a codex error result does too, and a successful result has no message`, `runner: a claude is_error result with an overload text before any tool call is reported failed with the overload cause and is retried; the same after a file edit ends failed`, `worker: a finish that stays busy is retried each tick for 60 s, then retrying stops and one chat note is shown; a new worker for the same window frees the lease and fails the message with a resend`, `runner: every failed turn's cause and error text are logged`
  - Fixtures: `fakeTime`, `gatedRunner`, `the chat host test harness of chat-queue-runner.test.ts`
- **unit** — Prove the outbox row and the webview draw a retrying message
  - Subjects: `outbox projection: a retrying row carries attempt and nextAttemptAt`, `webview: a retrying row shows 'attempt n of 3', a countdown, a retry-now button and a cancel button, and retry-now posts outbox-retry-now with its seq`
  - Fixtures: `runShell of chat-shell.test.ts`
- **live** — Hand check with a real provider failure
  - Subjects: `a turn that fails with a passing provider error before acting waits, shows its countdown, and runs again; retry-now runs it at once`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: finish turns an infrastructure failure before acting into a retrying row due after 10 s at the front, releasing the lease`, `unit: worker holds a retrying head until due and then runs it`, `unit: webview shows attempt 1 of 3 and a countdown on a retrying row`, `unit: runner starts the retried message with skipUserRow and the transcript keeps one user row`, `unit: a claude is_error result with an overload text, before acting, is retried (the runner reports failed with the text)` |
| `ac2` | `integration: finish with acted true becomes failed with the error and is never retrying`, `unit: runner reports acted true after a file-edit before a network error`, `unit: a claude is_error result after a file edit ends failed and is not retried` |
| `ac3` | `integration: a failure at attempts 3 becomes failed with the error`, `unit: worker ends a message failed after three retries and runs the next message` |
| `ac4` | `integration: retryNow makes a retrying row due at once without changing attempts`, `unit: worker act retry-now runs the retrying head at the next tick`, `unit: webview retry-now posts outbox-retry-now; cancel still removes a retrying row`, `live: retry-now and the countdown on a real provider failure` |
| `ac5` | `unit: classifyFailure maps the not-authenticated text to auth`, `integration: finish with cause auth becomes failed and is never retrying`, `unit: runner stores and posts a sign-in line in the chat on an auth failure (also present in the stored transcript)` |

## 7. Migration

**State before:** Every queued turn that ends with an error is final: settleQueued reports failed with acted always true and no cause, and the store's finish() writes failed for every failed outcome, so the retrying state, attempts and next_attempt_at exist in the schema and in the readers (LIVE_HEAD, acknowledge, the outbox projection) but nothing writes them (read:runner-failure-path, read:store-retry-surface). The outbox draws a cancel button for a retrying row but no retry-now, attempt text or countdown, and the worker's act has no retry-now (read:worker-and-outbox). A claude or codex result with is_error is mapped to done ok:false with its text dropped, so a provider failure that arrives as a result is recorded as done (read:failure-sources, cli-adapter.ts mappers; chat-panel.ts onTerminal).

**State after:** A pure classifier and an acted tracker feed the failed outcome; finish() writes retrying (attempts+1, due 10 s, 1 min or 5 min later, error kept, lease released) for an infrastructure failure that has not acted and has used fewer than 3 retries, and failed otherwise; retryNow and the worker's retry-now action make a retrying row due at once; the outbox row shows attempt n of 3, a countdown, retry-now and cancel; a retried turn is started with the new skipUserRow option (so the stored transcript keeps one user row); an auth failure stores a sign-in line in the chat. Schema version stays 2. A done event with ok:false carries the provider's text and is treated as a failed turn. A persistently busy outcome write stops after 60 s with a chat note.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the pure failure classifier module and its constants (RETRY_DELAYS_MS, MAX_INFRA_RETRIES); nothing calls it yet — ↩ rollbackable
2. Add the retrying branch to the store's finish() and retryNow; with no caller supplying a cause yet, every outcome still ends failed, so behaviour is unchanged until step 3 — ↩ rollbackable
3. Carry the provider's error text on done(ok:false) in both result mappers and the doneEvent wrappers, and make onTerminal treat done ok:false as a failure so settleQueued resolves failed; this alone turns a failed claude or codex turn from done into failed (a defect fix) before any retry exists — ↩ rollbackable
4. Make the chat host's runner track acted from the turn's events, classify the error and report acted and cause; add the skipUserRow option to runTurn/startTurn and use it for a retried message; store and post the retry line and the sign-in line (a new persistInfo helper, since postInfo is live-only) — ↩ rollbackable
5. Add retry-now to the worker's act and to the chat host's outbox action handling, and draw attempt text, a countdown and a retry-now button on a retrying row in the webview — ↩ rollbackable
6. Bound the worker's retry of a busy outcome write at BUSY_GIVE_UP_MS (60 s) with a chat note and reload recovery, and log every failed turn's cause and text — ↩ rollbackable
7. Hand check with a real provider failure: wait, countdown, retry-now, and a failure after an edit staying failed — ↩ rollbackable

**Backward compat:** No schema change and no change to a signature another story or the host calls: finish() keeps its signature and its outcomes (a failed outcome without a cause or with acted true ends failed as before), retryNow and the 'retry-now' action are additive. Mixed versions, stated explicitly: a window still on the previous plugin never writes a retrying row and ends every failure as failed; it reads and runs a retrying row written by a new window exactly as S001 built it (a retrying head waits until its due time, then runs), so the two versions interoperate on one file. One mixed-version caveat: a retrying message that a previous-plugin window takes (a retrying row written by a new window, run by an old one) is started by the old runner without skipUserRow, so that run adds a second user row to the transcript. Queue state is unaffected. It is accepted: it needs a window left on the old plugin after an update, VS Code asks for the reload, and the duplicate is a cosmetic transcript row.

## 8. Alternatives considered

### 8.1 a1: Retry decision inside finish(), classifier and acted tracking in the runner — **CHOSEN**

finish() turns a failed outcome into retrying or failed in one transaction; a pure classifier and an acted tracker in the plugin feed the outcome; retry-now is one more store method and worker action.

A pure module classifies a failure message into an InfraCause and the runner reports failed with acted and cause. finish() gains the retrying branch the HLD sketch names, writing state, attempts, due time and the lease release in one transaction. retryNow sets the due time to now; the worker adds a retry-now action; the outbox draws the attempt and a countdown with retry-now.

### 8.2 a2: Retry decision in the worker over a new store.scheduleRetry

The worker reads the failed outcome, decides, and calls a new store method that records the retry and releases the lease.

The runner and classifier are as in a1. The worker inspects the failed outcome and calls scheduleRetry for a retryable one, otherwise finish as today.

**Rejected because:** Ranked 2: splits the decision across worker and store and adds a second terminal write path next to finish(), against the HLD's single finish().

### 8.3 a3: A retry outcome from the runner

The runner decides the retry and resolves a new TurnOutcome kind the worker obeys.

Add a 'retry' kind to TurnOutcome (sc3), with the runner owning attempts and the schedule.

**Rejected because:** Ranked 3: changes sc3, which S001 owns and S003 consumes unchanged, and moves queue policy into the chat host.

## 9. References

- **[[c3]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c3 (the worker decides from the database alone)`
- **[[c11]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c11 (acknowledge takes the lease in one transaction)`
- **[[c12]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c12 (writes are short IMMEDIATE transactions)`
- **[[c13]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c13 (the lease is released only when no CLI of the turn runs)`
- **[[c14]]** `code` `vscode-plugin/src/chat/chat-panel.ts (settleQueued, the queued-turn runner) and vscode-plugin/src/chat/cli-adapter.ts (acting events and error messages)`
- **[[c15]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts (finish, LIVE_HEAD, acknowledge, cancel) and chat-queue-worker.ts (due logic, finishNow, act)`
- **[[c16]]** `code` `vscode-plugin/src/chat/chat-outbox.ts and the webview script in chat-panel.ts (retrying row, cancel button)`

## 10. Open questions

- RESOLVED by the owner: a turn that streamed text but made no tool call, command or edit before an infrastructure failure is retried; anything the agent did with a tool call, command or edit is never retried. The partial text stays in the transcript with a stored 'retrying' line before the retried output.
- RESOLVED by the owner: a CLI that is not installed (ENOENT, 'CLI not found') is classified 'other' and fails at once with the install hint and a resend, not retried.
- RESOLVED by the owner: the retry of a busy outcome write is bounded at 60 s, then a chat note asks for a reload, and the reload frees the lease through S003's rule (FR004; enqueue was already bounded by the busy timeout and refused with a note).
- RESOLVED by the owner: the classifier ships with conservative patterns written from the adapter's messages and the daemon's isTransientCliError; an unmatched text is never retried, every failed turn's cause and text are logged, and the live hand check confirms the patterns against real failures.
- RESOLVED by the owner: a claude or codex turn that ends with an is_error result is recorded as failed with a resend (the text carried on done ok:false), not as done as S001 recorded it.
- RESOLVED by the owner: the additive additions (retryNow on sc1, the retry-now action on sc4, completing outbox-retry-now on sc5, and S003's) stay recorded in the LLDs; HLD amendments are filed in one batch at the end of the Epic.
- RESOLVED by the owner: Epic constraints k1-k5 are scored in the plan's closing task, not in the LLD.
- RESOLVED by the owner: the invariantsToPreserve keep the HLD assumption ids (c11, c12, c13, c3); the plan carries a crosswalk to the analyze bundles.

## Resolved questions

- `q80e30701` — RESOLVED by the owner: a turn that streamed text but made no tool call, command or edit before an infrastructure failure is retried; anything the agent did with a tool call, command or edit is never retried. The partial text stays in the transcript with a stored 'retrying' line before the retried output.
  - **resolved**: Retry text-only turns, keep partial text plus a stored 'retrying' line (owner's resolution) — Owner decision: a text-only turn is retried; a tool call, command or edit is never retried. _(2026-10-14T17:15:50.853Z)_
- `qf72d3469` — RESOLVED by the owner: a CLI that is not installed (ENOENT, 'CLI not found') is classified 'other' and fails at once with the install hint and a resend, not retried.
  - **resolved**: Classify 'other', fail fast with install hint + resend (owner's resolution) — Owner decision: a missing CLI cannot be fixed by waiting. _(2026-10-14T17:17:06.008Z)_
- `q2ee914d5` — RESOLVED by the owner: the retry of a busy outcome write is bounded at 60 s, then a chat note asks for a reload, and the reload frees the lease through S003's rule (FR004; enqueue was already bounded by the busy timeout and refused with a note).
  - **resolved**: Bounded 60 s retry, then a reload note (owner's decision) — Owner decision: retries cannot be indefinite. _(2026-10-14T17:19:05.046Z)_
- `q823f47b9` — RESOLVED by the owner: the classifier ships with conservative patterns written from the adapter's messages and the daemon's isTransientCliError; an unmatched text is never retried, every failed turn's cause and text are logged, and the live hand check confirms the patterns against real failures.
  - **resolved**: Conservative seeded patterns + log + live check (owner's resolution) — Owner decision. _(2026-10-14T17:19:48.958Z)_
- `q66692ae9` — RESOLVED by the owner: a claude or codex turn that ends with an is_error result is recorded as failed with a resend (the text carried on done ok:false), not as done as S001 recorded it.
  - **resolved**: Failed + resend, with S001 back-fix task — Owner decision: an is_error result is failed with a resend; the text travels on done ok:false. A regression test keeps it from being recorded as done again. _(2026-10-14T17:20:23.964Z)_
- `q844bb1ed` — RESOLVED by the owner: the additive additions (retryNow on sc1, the retry-now action on sc4, completing outbox-retry-now on sc5, and S003's) stay recorded in the LLDs; HLD amendments are filed in one batch at the end of the Epic.
  - **resolved**: Keep in LLDs; batch HLD amendments at Epic end — Owner decision (option A). _(2026-10-14T17:20:52.301Z)_
- `qc5c07fb1` — RESOLVED by the owner: Epic constraints k1-k5 are scored in the plan's closing task, not in the LLD.
  - **resolved**: Apply owner ruling: score k1-k5 in the plan's closing task — Owner decision (option A). _(2026-10-14T17:21:13.684Z)_
- `qb1d8d443` — RESOLVED by the owner: the invariantsToPreserve keep the HLD assumption ids (c11, c12, c13, c3); the plan carries a crosswalk to the analyze bundles.
  - **resolved**: Keep HLD c-ids + plan crosswalk (owner's decision) — Owner decision (option A). _(2026-10-14T17:21:25.852Z)_

## Citations

- **[[c3]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c3 (the worker decides from the database alone)`
- **[[c11]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c11 (acknowledge takes the lease in one transaction)`
- **[[c12]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c12 (writes are short IMMEDIATE transactions)`
- **[[c13]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c13 (the lease is released only when no CLI of the turn runs)`
- **[[c14]]** `code` `vscode-plugin/src/chat/chat-panel.ts (settleQueued, the queued-turn runner) and vscode-plugin/src/chat/cli-adapter.ts (acting events and error messages)`
- **[[c15]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts (finish, LIVE_HEAD, acknowledge, cancel) and chat-queue-worker.ts (due logic, finishNow, act)`
- **[[c16]]** `code` `vscode-plugin/src/chat/chat-outbox.ts and the webview script in chat-panel.ts (retrying row, cancel button)`
