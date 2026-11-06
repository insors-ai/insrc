# S001 manual code review, round 5 — blocked

Date: 2026-11-05. Story: E202611031bd72813:S001.
Review cycle 2, round 2.

**Verdict: BLOCK — one HIGH finding remains.** Reviewed fixes since `f77303f76`
through `e34b2bc7e9aff3c6b508131f1b617583cddbb346`, including shared recovery,
verified-stop propagation, restored batch outcome correlation and the additional
decoder/checkpoint correlation-map changes. The previous round's three direct
reproductions now pass. The cross-chat recovery case below still fails.

Archived probes also ran at `5c5bc0cf189d2f4918411a9d6f6c1f8e7f6ce70d` after an
unrelated backend commit; its VS Code tree is identical to the reviewed fix head.

This is the user-requested manual review, not a daemon CR or BUILD approval.
[Evidence, source hashes and commands](evidence/manual-code-review-round-5/evidence.json)
are preserved with eleven portable diagnostic scripts. No production fixes are included.

## MR3-R5 — HIGH: recovery stops the selected chat instead of the failed attempt's process

Location: `vscode-plugin/src/chat/chat-panel.ts:1691`–`:1707`.
Caller: async failure callback at `:1603`–`:1619`.
Stop target: `vscode-plugin/src/chat/turn-lifecycle.ts:637`–`:694`.

The shared recovery function receives the correct originating session and request
turn, but its process operation is still the host-wide `turns.stop()`. That lifecycle
belongs to the currently active/followed chat. It does not receive or validate the
originating session, turn, PID or process start identity before stopping a process.
Moreover, recovery probes `s.liveTurn` without checking that its turn still equals
`originTurnId`. A verified stop result therefore does not establish that the
**failed delivery's original process** was stopped.

Reproduction uses the actual chat host and lifecycle:

1. Chat A starts an output-backed turn and accepts an in-turn decision. The injected
   adapter initially reports delivery success; A's native handle is saved.
2. Switch to chat B, detaching A's reader while A's process stays alive. Allow the
   detached read to finish, then start B's own process and keep it active.
3. Report the delayed asynchronous write failure for **A-turn / req-A**.

Observed before diagnostic cleanup:

```json
{
  "originStillAlive": true,
  "selectedStillAlive": false,
  "originSignals": [],
  "selectedSignals": ["SIGTERM"],
  "cancelledTurns": ["B-turn"],
  "originOutcome": "delivery-failed"
}
```

The failure cancels and signals B, receives a successful stop result for B, then
attempts A's continuation behind A's still-live lease. A's recovery times out;
the unrelated foreground work in B has already been interrupted. The diagnostic
uses separate injected process handles and a 30 ms delivery timeout. It performs
no real process kill, shell action or model call.

Required correction: bind the stop/verification operation to the originating
session **and exact turn/process identity**, rather than using the currently active
lifecycle unconditionally. For a detached original, obtain a matching process handle
or perform validated targeted recovery; fail closed if that identity cannot be
established. Never treat stopping an unrelated turn, or having no active handle,
as verification of the original's exit. Preserve B's reading, process and queued
work throughout A's recovery.

Regression coverage must include late failure after a chat switch with both original
and foreground processes alive, a newer turn in the same conversation, no active
reader for the original, process-identity mismatch, and missing native handle.
Assert the exact process stopped and resumed, not only that some signal was sent.

Executable: [wrong-chat-stop.mts](evidence/manual-code-review-round-5/probes/wrong-chat-stop.mts).

## Previous findings and validation

| Area | This round's result |
| --- | --- |
| MR3-R4a, async failure while original is active | Stops original, resumes native-original, outcome approved |
| MR3-R4b, exit not confirmed | Real adapter stopVerified returns false; actual host regression records failure and launches no continuation |
| MR1-R4, restored same-ID records | Deny changes only new-turn to denied; approve runs new-command and resolves only new-turn; old-turn stays approved |
| Earlier live same-chat ID collision | Separate command-1/command-3 continuations and records |
| Earlier legacy presentation case | Later turn still opens a distinct panel |
| Earlier panel disposal and timeout cases | Surviving keyed panel receives its reply; cancelled continuation does not run late |
| Decoder correlation checkpoint additions | New budget-boundary and idle-pass regressions pass; command/edit-path maps propagate through adapter, live cursor and observer checkpoint |

**760 passed, 0 failed, 0 skipped, 0 cancelled** across 16 affected test files,
Node 22.23.2, serial file concurrency, `--test-force-exit`, 39,823.1395 ms.
[Raw TAP](evidence/manual-code-review-round-5/affected-tests.tap).
Plugin typecheck passed from `vscode-plugin`:
`../node_modules/.bin/tsc --noEmit -p tsconfig.json`.

Eleven archived diagnostic scripts were rerun against the reviewed sources. Exit
zero means the diagnostic executed, not that its safety outcome passed. The async
success probe now waits for the recovered continuation; the stop probe exercises
the new `stopVerified()` method, rather than treating best-effort `stop()` as a
verification contract.

Adherence/quality remain blocked by the process-ownership error. Coverage proves
the nominal fixes but misses the supported detached-origin/foreground-chat
transition. No additional concrete conventions blocker was established in this diff.

This is host/source verification with injected process/provider/client seams and
in-memory stores. No live provider suite, full backend sweep, rendered VS Code UI
or JetBrains validation was performed. Force-exit testing does not prove natural
teardown. Unrelated backend edits and dirty workflow records were preserved; no
production code, runtime configuration or existing approval records were changed.
**BUILD remains unapproved.**
