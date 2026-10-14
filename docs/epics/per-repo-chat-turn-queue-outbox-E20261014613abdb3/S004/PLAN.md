<!-- insrc:artifact PLAN-613abdb351c2c738-s4 -->

# Plan: E20261014613abdb3:S004

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**LLD run:** `wf-1791994925380-8s4900`
**LLD effective hash:** `02f5e748bf5b...`

The build adds a pure failure classifier, gives the store's finish() the retrying branch and retry-now, makes a claude or codex error result a failure instead of a silent done, teaches the runner to report whether a turn acted and why it failed, and lets a retried turn run without a second user row. It then bounds the busy outcome write at 60 seconds, adds the retry-now action and the attempt and countdown on the outbox row, and closes with the constraint scoring and a live hand check. Each store rule is proved with two connections on one file, each worker and runner rule with fake timers, and the webview on a fake DOM.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Failure classifier module and retry constants | S | — | unit: chat-failure.test.ts: overloaded, rate limit, 429 and 5xx texts, timeouts and connection failures map to their causes; unit: chat-failure.test.ts: the adapter's not-authenticated text and the CLIs' unauthorised and invalid key texts map to auth; unit: chat-failure.test.ts: CLI not found and any unmatched text, including a model refusal, map to other | [[c1]] [[c2]] |
| 2 | **`t2`** Store: finish() retrying branch and retryNow | M | `t1` | integration: chat-queue-store.test.ts: an infrastructure failure before acting becomes retrying with attempts 1 and nextAttemptAt now plus 10 s, keeps its seq and error, and releases the lease; integration: chat-queue-store.test.ts: attempts 1 and 2 use 1 min and 5 min, and a failure at attempts 3 becomes failed with the error; integration: chat-queue-store.test.ts: acted true, cause auth, cause other or a missing cause becomes failed with the error and is never retrying; integration: chat-queue-store.test.ts: retryNow makes a retrying row due at once with attempts unchanged and returns false for any other row | [[c3]] [[c4]] |
| 3 | **`t3`** Carry the provider's error text on done ok:false and treat it as a failure | M | — | unit: cli-adapter.test.ts: a claude result with is_error carries its text on done ok:false, a codex error result does too, and a successful result has no message; unit: chat-queue-runner.test.ts: a queued turn that ends with done ok:false resolves failed with the text, not done | [[c5]] [[c6]] |
| 4 | **`t4`** Runner: acted tracking, classification, logging | M | `t1`, `t3` | unit: chat-queue-runner.test.ts: a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true; one that failed with none reports acted false with the classified cause; unit: chat-queue-runner.test.ts: a claude is_error result with an overload text before any tool call is reported failed with the overload cause; the same after a file edit reports acted true; unit: chat-queue-runner.test.ts: every failed turn's cause and error text are logged | [[c5]] [[c7]] |
| 5 | **`t5`** Retried turn: skipUserRow, the stored retry line and the sign-in line | M | `t4` | unit: chat-queue-runner.test.ts: a retried message is started with skipUserRow, so the stored transcript has a single user row after a retry while the prompt is still sent to the CLI; unit: chat-queue-runner.test.ts: a retry stores and posts one retrying line, still in the stored transcript after a reload, and a turn that streamed only text before an infrastructure failure is retried and keeps its partial text; unit: chat-queue-runner.test.ts: an auth failure stores and posts a sign-in line in the chat; unit: chat-queue-runner.test.ts: a normal turn still pushes and echoes its user row exactly as before | [[c8]] [[c9]] |
| 6 | **`t6`** Worker: bound a busy outcome write at 60 s | S | `t2` | unit: chat-queue-worker.test.ts: a finish that stays busy is retried each tick for 60 s, then retrying stops and one chat note is shown; a new worker for the same window frees the lease and fails the message with a resend | [[c10]] |
| 7 | **`t7`** Retry-now: worker action, host handling and the retrying row in the webview | M | `t2` | unit: chat-queue-worker.test.ts: a retrying head is not taken before its due time, holds the queue behind it, and runs when due; unit: chat-queue-worker.test.ts: a message that fails three infrastructure retries ends failed and the next message runs; unit: chat-queue-worker.test.ts: act retry-now on a retrying row runs it at the next tick; on any other row it is refused with a note; unit: chat-outbox.test.ts: a retrying row carries attempt and nextAttemptAt; unit: chat-shell.test.ts: a retrying row shows 'attempt n of 3', a countdown, a retry-now button and a cancel button, and retry-now posts outbox-retry-now with its seq | [[c11]] [[c12]] |
| 8 | **`t8`** Closing: k1-k5, crosswalk, deferred amendments and the live hand check | S | `t5`, `t6`, `t7` | live: hand check with a real provider failure: a passing provider error before acting waits, shows its countdown and runs again; retry-now runs it at once; a failure after an edit stays failed | [[c13]] [[c14]] |

### 1.1 E20261014613abdb3:S004:T001 — Failure classifier module and retry constants

Add vscode-plugin/src/chat/chat-failure.ts (vscode-free, pure): classifyFailure(message): InfraCause with conservative patterns written from the messages cli-adapter.ts produces and the daemon's isTransientCliError (overloaded, rate limit, 429 and 5xx, timeouts, connection failures map to their causes; the not-authenticated text and the CLIs' unauthorised, invalid key and login-required texts map to auth; 'CLI not found' (ENOENT) and any unmatched text map to other; passing start-up failures such as EAGAIN map to spawn), plus the constants RETRY_DELAYS_MS = [10000, 60000, 300000] and MAX_INFRA_RETRIES = 3. Nothing calls it yet.

**Acceptance checks:**
- overloaded, rate limit, 429 and 5xx, timeout and connection-failure texts map to their causes
- the adapter's not-authenticated text and the CLIs' unauthorised and invalid key texts map to auth
- CLI not found and any unmatched text, including a model refusal, map to other
- the module imports nothing from vscode and does no I/O

### 1.2 E20261014613abdb3:S004:T002 — Store: finish() retrying branch and retryNow

In chat-queue-store.ts give finish() the retrying branch for a failed outcome: when cause is spawn, rate-limit, overloaded, network or timeout, acted is false and the row's attempts are below MAX_INFRA_RETRIES, write state retrying, attempts+1, next_attempt_at = now + RETRY_DELAYS_MS[attempts] and keep the error; otherwise failed with the error; the lease row is deleted in the same transaction in every case. Add retryNow(seq) to ChatQueueStore: UPDATE a retrying row's next_attempt_at to now, attempts unchanged, returning whether it matched.

**Acceptance checks:**
- an infrastructure failure before acting becomes retrying with attempts 1, nextAttemptAt now plus 10 s, the same seq and the error kept, and the lease is released
- attempts 1 and 2 use 1 min and 5 min, and a failure at attempts 3 becomes failed with the error
- acted true, cause auth, cause other or a missing cause becomes failed and is never retrying
- retryNow makes a retrying row due at once with attempts unchanged and returns false for any other row

### 1.3 E20261014613abdb3:S004:T003 — Carry the provider's error text on done ok:false and treat it as a failure

Add the optional message field to the done TurnEvent in stream-events.ts; make the claude result mapper (cli-adapter.ts ~:655) set it from obj.result when is_error is true and the codex result mapper (~:781) set it from the error text; carry it through both doneEvent wrappers (live and resumed) with the session id; make onTerminal in chat-panel.ts treat done with ok:false as a failure (q.error = message, or 'the turn ended with an error' when there is none) so settleQueued resolves failed. This alone turns a failed claude or codex turn from done into failed before any retry exists, adds a regression test so it cannot be recorded as done again, and finds and updates every existing test that pinned the old done behaviour (named in the build summary).

**Acceptance checks:**
- a claude result with is_error carries its text on done ok:false, a codex error result does too, and a successful result has no message
- a queued turn ending with done ok:false resolves failed with the text, not done
- every existing consumer of done renders as before (the field is additive)
- a regression test fails if an is_error result is recorded as done again
- every existing test that pinned the old behaviour (an is_error result resolving done) is found and updated in this task, and the build summary names them

### 1.4 E20261014613abdb3:S004:T004 — Runner: acted tracking, classification, logging

In chat-panel.ts the queued-turn runner tracks acted: set when the queued turn emits a tool-call, file-edit or tool-result event and never cleared, including across an approval re-run. settleQueued resolves a failed turn as {kind:'failed', error, acted, cause: classifyFailure(error)} and logs every failed turn's cause and error text through the chat logger. The 'the chat no longer exists' failure stays acted:false with no cause.

**Acceptance checks:**
- a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true
- a turn that failed with none of them reports acted false and the classified cause
- acted stays true across an approval re-run of the same queued message
- every failed turn's cause and error text are logged
- the 'chat no longer exists' failure has acted false and no cause

### 1.5 E20261014613abdb3:S004:T005 — Retried turn: skipUserRow, the stored retry line and the sign-in line

Add the skipUserRow option to runTurn/startTurn in chat-panel.ts: no user row pushed to the stored transcript, no echo, title check skipped and no second save, while the prompt is still sent to the CLI; the queued-turn runner passes it when message.attempts > 0. Add persistInfo (appendEvent plus post with the row index, as followLiveTurn does): the runner stores and posts 'the turn failed with <cause>; retrying (attempt n of 3)' when a retried message starts, and on an auth failure stores and posts one line naming the CLI's login command. Streamed partial text and the failed attempt's error row stay in the transcript. A normal turn's shared startTurn path is pinned unchanged.

**Acceptance checks:**
- a retried message is started with skipUserRow and the stored transcript holds a single user row after a retry while the prompt is still sent to the CLI
- a retry stores and posts one retrying line that is still in the stored transcript after a reload
- an auth failure stores and posts a sign-in line, also present after a reload
- a text-only turn that fails with an infrastructure cause is retried and keeps its partial text
- a normal (non-retried) turn still pushes and echoes its user row exactly as before

### 1.6 E20261014613abdb3:S004:T006 — Worker: bound a busy outcome write at 60 s

In chat-queue-worker.ts bound the retry of a busy outcome write: finishNow keeps the outcome in pendingFinish and retries each tick for at most BUSY_GIVE_UP_MS (60000 ms); then the worker stops retrying, logs an error and posts one chat note that the queue could not record the message's result and that reloading the window recovers it. The reload is recovered by S003's same-windowKey lease rule (the lease is freed at once, the message fails with a resend, the queue moves on).

**Acceptance checks:**
- a busy outcome write is retried each tick for 60 s and the outcome is written when the store frees up inside the bound
- after 60 s the worker stops retrying and one chat note is shown
- a new worker for the same window frees the lease and fails the message with a resend, and the next message runs
- enqueue's own busy refusal with its note is unchanged

### 1.7 E20261014613abdb3:S004:T007 — Retry-now: worker action, host handling and the retrying row in the webview

Add 'retry-now' to the worker's act (retryNow then an immediate tick; refused with a note on any other row); handle outbox-retry-now in the chat host's outbox action switch beside cancel, dismiss and resend; in the webview script draw, for a retrying row, 'attempt n of 3', a countdown to nextAttemptAt that ticks, a retry-now button and the existing cancel button; the chat-outbox projection already carries attempt and nextAttemptAt. This task also carries the worker-level test of the whole retry progression against the real store (a retrying head is held until due, then runs; three failed retries end failed and the next message runs), so it is not lost.

**Acceptance checks:**
- act retry-now on a retrying row runs it at the next tick; on any other row it is refused with a note
- outbox-retry-now from the webview reaches the worker with its seq and re-posts the outbox with any refusal note
- a retrying row shows 'attempt n of 3', a countdown, a retry-now button and a cancel button, and cancel still removes it
- a worker holds a retrying head until due and then runs it; three failed retries end failed and the next message runs

### 1.8 E20261014613abdb3:S004:T008 — Closing: k1-k5, crosswalk, deferred amendments and the live hand check

Score the Epic constraints k1-k5 against the finished change in the BUILD summary; carry the c-id crosswalk (c11 and c12 to read:store-retry-surface, c13 and c3 to read:worker-and-outbox); list the deferred HLD additions for the Epic-end batch (sc1 retryNow, sc4 retry-now action, sc5 outbox-retry-now completion, and S003's markNotDeliveredIfHead, presenceOf, holderGone and the same-windowKey takeOver rule). Run the live hand check with a real provider failure: a passing provider failure before acting waits, shows its countdown and runs again; retry-now runs it at once; a failure after an edit stays failed; check the classifier against the logged texts. If no real failure can be produced, record the check as not run with the reason, and record a fault-injection run (a fake CLI that prints an overload result) as evidence of the wiring, clearly labelled as such.

**Acceptance checks:**
- the BUILD summary scores k1-k5 and lists the deferred HLD additions and the crosswalk
- the classifier's patterns are compared with the failure texts the logs captured, and any miss is recorded
- the hand check is recorded as a reported live test with its evidence, or recorded as not run with the reason and the fault-injection evidence labelled as such

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| classifyFailure: overloaded, rate limit, 429 and 5xx texts, timeouts and connection failures map to their causes | `t1` |
| classifyFailure: the adapter's not-authenticated text and the CLIs' unauthorised and invalid key texts map to auth | `t1` |
| classifyFailure: CLI not found (ENOENT) and any unmatched text, including a model refusal, map to other | `t1` |
| finish: an infrastructure failure before acting becomes retrying with attempts 1 and nextAttemptAt now plus 10 s, keeps its seq and error, and releases the lease | `t2` |
| finish: attempts 1 and 2 use 1 min and 5 min, and a failure at attempts 3 becomes failed with the error | `t2` |
| finish: acted true, cause auth, cause other or a missing cause becomes failed with the error and is never retrying | `t2` |
| retryNow: a retrying row becomes due at once with attempts unchanged; any other row returns false | `t2` |
| worker: a retrying head is not taken before its due time, holds the queue behind it, and runs when due | `t7` |
| worker: a message that fails three infrastructure retries ends failed and the next message runs | `t7` |
| worker: act retry-now on a retrying row runs it at the next tick; on any other row it is refused with a note | `t7` |
| runner: a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true; one that failed with none reports acted false with the classified cause | `t4` |
| runner: a retried message is started with skipUserRow, so the stored transcript has a single user row after a retry while the prompt is still sent to the CLI | `t5` |
| runner: a retry stores and posts one 'retrying (attempt n of 3)' line, still in the stored transcript after a reload,, and a turn that streamed only text before an infrastructure failure is retried and keeps its partial text | `t5` |
| runner: an auth failure stores and posts a sign-in line in the chat | `t5` |
| cli-adapter: a claude result with is_error carries its text on done ok:false, a codex error result does too, and a successful result has no message | `t3` |
| runner: a claude is_error result with an overload text before any tool call is reported failed with the overload cause and is retried; the same after a file edit ends failed | `t3`, `t4` |
| worker: a finish that stays busy is retried each tick for 60 s, then retrying stops and one chat note is shown; a new worker for the same window frees the lease and fails the message with a resend | `t6` |
| runner: every failed turn's cause and error text are logged | `t4` |
| outbox projection: a retrying row carries attempt and nextAttemptAt | `t7` |
| webview: a retrying row shows 'attempt n of 3', a countdown, a retry-now button and a cancel button, and retry-now posts outbox-retry-now with its seq | `t7` |
| a turn that fails with a passing provider error before acting waits, shows its countdown, and runs again; retry-now runs it at once | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails: classifyFailure, the pure classifier and its cause mapping`
- **[[c2]]** `prior-artifact` `LLD s4 errorPaths: no pattern matches, auth, and the CLI not installed (classified other); RETRY_DELAYS_MS and MAX_INFRA_RETRIES`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails: finish() retrying branch and its postconditions`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails: retryNow, and the retry-budget and retry-now edge cases`
- **[[c5]]** `prior-artifact` `LLD s4 contractDetails: settleQueued, the done event and its message, and the runner's acted and cause`
- **[[c6]]** `prior-artifact` `LLD s4 dataModelChanges and errorPaths: the claude and codex is_error result recorded as failed instead of done`
- **[[c7]]** `prior-artifact` `LLD s4 errorPaths: a turn that acted is never retried, acted across an approval re-run, every failed turn logged`
- **[[c8]]** `prior-artifact` `LLD s4 contractDetails: runTurn skipUserRow and the one-user-row postcondition; backward compat for a previous-plugin window`
- **[[c9]]** `prior-artifact` `LLD s4 contractDetails: persistInfo and the stored retry and sign-in lines; edge case for a text-only turn`
- **[[c10]]** `prior-artifact` `LLD s4 contractDetails: finishNow and BUSY_GIVE_UP_MS; the busy outcome write error path`
- **[[c11]]** `prior-artifact` `LLD s4 contractDetails: act retry-now and the outbox-retry-now message`
- **[[c12]]** `prior-artifact` `LLD s4 interactionWithShared sc5 and testStrategy: the retrying row, attempt text and countdown in the webview`
- **[[c13]]** `prior-artifact` `LLD s4 openQuestions (resolved): constraints k1-k5 scored in the plan, the c-id crosswalk and the deferred HLD amendments`
- **[[c14]]** `prior-artifact` `LLD s4 testStrategy live level and migration step: the hand check with a real provider failure`
