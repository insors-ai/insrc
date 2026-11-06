# S001 manual code review, round 4 — blocked

Date: 2026-11-05. Story: E202611031bd72813:S001.
Review cycle 2, round 1: the user explicitly requested another review after fixes.

**Verdict: BLOCK — one HIGH and two MED findings remain.** Reviewed the fixes
since `3cc27f978`, through `515d914571edb8c7a389230e605c57e6cb1e9a12`.
The original round-3 reproductions now pass: same-chat live decisions with reused
IDs receive distinct continuations/records; synchronous dead-stdin recovery stops
the original and resumes its saved native session; a legacy bare declaration ID
does not suppress a later turn's presentation.

The remaining boundary cases below are reproducible. This is a manual review,
not a daemon CR or BUILD approval. [Evidence, hashes and exact commands](evidence/manual-code-review-round-4/evidence.json)
are preserved, together with ten portable diagnostic scripts. No production fixes
are included.

## MR3-R4a — HIGH: asynchronous stdin failure bypasses live-unwritable recovery

Location: `vscode-plugin/src/chat/chat-panel.ts:1607`–`:1613`.
Compare synchronous recovery at `:1686`–`:1704`.

The new stop-and-resume sequence is reachable only through `relayDecision()` when
`decide()` immediately reports `delivered:false`. The actual adapter also reports
write failures asynchronously, after initially accepting the write. That callback
resolves the originating session correctly but calls `deliverDecisionAsFollowUp()`
directly. It performs neither the new live-unwritable recovery nor the missing-native-
handle triage.

Reproduction: the original process is alive and waiting for its approval; its native
handle is durably known. `decide()` initially reports success, then the adapter's
failure callback fires for that exact turn/request. The original receives **no stop
signals**, remains alive, and only its original run exists at delivery timeout.
The follow-up waits behind it and the request becomes `delivery-failed`.
Manually releasing the process afterward does not run the timed-out continuation,
as the cancellation fix correctly prevents late execution.

This reproduces the prior live-unwritable deadlock through the other production
delivery-failure entry point. The diagnostic uses a configured 30 ms delivery timeout
instead of the production 30 seconds; no real child or shell action is executed.

Required correction: route synchronous and asynchronous delivery failure through
the same owner/turn-bound transport recovery, including native-handle recovery,
liveness, stop/verified exit and failure settlement. Do not act on the selected
chat's unrelated live process. Test an asynchronous write failure while the original
is still alive, both with and without a recoverable native handle, plus a chat switch.

Executable: [async-live-unwritable.mts](evidence/manual-code-review-round-4/probes/async-live-unwritable.mts).

## MR3-R4b — MED: awaiting stop does not establish verified process exit

Locations: `vscode-plugin/src/chat/chat-panel.ts:1694`;
`vscode-plugin/src/chat/cli-adapter.ts:1284`–`:1285`, `:1387`;
`vscode-plugin/src/chat/turn-lifecycle.ts:650`–`:671`.
Underlying contract: `vscode-plugin/src/chat/session-lock.ts:116`.

Recovery treats fulfillment of `turns.stop()` as verified exit and starts preparing
a continuation. However, the adapter maps `stopProcess()`'s boolean result to void,
discarding **false** (exit still unconfirmed after SIGTERM and SIGKILL grace periods).
The lifecycle additionally swallows cancellation/process-stop errors. The new
recovery catch therefore cannot distinguish verified termination from these failures.

The diagnostic exercises the **real adapter's handed-over stop handle**, with an
injected process whose exit promise never settles and which ignores both signals.
Using a 5 ms grace, observed:

```json
{"stopResolved":true,"processExitConfirmed":false,"signals":["SIGTERM","SIGKILL"]}
```

This proves loss of the exit-verification result, not that a competing child actually
spawns: session lease protections still apply and may block the attempted continuation.
The defect is that the new explicit recovery uses a best-effort stop contract as a
positive verified-exit prerequisite, and cannot take its stated failure branch.

Required correction: expose a verified stop result or a rejecting stop operation for
recovery, preserving failure through adapter/lifecycle boundaries. Prepare the
continuation only on positive confirmation for the original process. Add ignored-
signal and rejected-stop regressions; retain best-effort user Stop behavior where
appropriate without treating it as verification.

Executable: [unverified-stop.mts](evidence/manual-code-review-round-4/probes/unverified-stop.mts).

## MR1-R4 — MED: restored turn-ended decisions still update the older same-ID record

Locations: `vscode-plugin/src/chat/chat-panel.ts:1416`, `:1437`, `:1572`, `:3097`.

Live in-turn decisions now carry their turn through persistence and one-shot
bookkeeping. Turn-ended batch settlement still has unscoped paths. A no-run batch
calls `markPersistedRequest()` without the decision's turn. A batch that does run
stores the **currently live exclusion turn** in `excludeTurnId`, then incorrectly
uses that value as the request's originating turn when confirming delivery.
For restored requests with no live turn, it is undefined, returning to bare-ID
lookup even though the marker's key contains the correct origin turn.

Reproduction seeds the newly supported format: two persisted approval records named
`shared`, an older resolved `old-turn` and a current unresolved `new-turn`, with no
LiveTurn. Reattach and decide the new request:

- **Deny:** the old record changes from approved to denied; the new record remains
  unresolved. No action runs.
- **Approve:** a continuation correctly carries `new-command`, but the new record
  still remains unresolved after the continuation completes. The old record remains
  the one matched for settlement.

Thus request retention and outcome correlation still fail across reload. Reattaching
can surface an already-decided request again, and the audit record for the old turn
can be rewritten by a decision about the new turn.

Required correction: retain `originTurnId` separately from the turn excluded from
spawn confirmation, use the origin for every outcome write, and capture the owning
session for asynchronous batch settlement. Supply the decision's turn to no-run
and dir-block writes too. Test restored approve/deny, a different live exclusion
turn, and repeated-ID records across reload; each must update only its own record.

Executables: [restored-denial.mts](evidence/manual-code-review-round-4/probes/restored-denial.mts)
and [restored-approval.mts](evidence/manual-code-review-round-4/probes/restored-approval.mts).

## What passed

| Area | Evidence |
| --- | --- |
| Same-chat repeated request ID, live decisions | Four runs for two decisions, carrying command-1 and command-3, with two resolved turn-scoped records |
| Synchronous live-unwritable recovery | Original receives SIGTERM, exits, then continuation resumes native-original; outcome approved |
| Legacy declaration compatibility | Later turn opens a second panel and adds turn-2:item_1; original bare ID no longer acts as a future-turn wildcard |
| Cross-chat late failure ownership | A's callback targets A with A-command despite B reusing the request ID |
| Legacy panel disposal | Surviving keyed panel receives new content and its decision result |
| Timeout cancellation | Queued continuation does not run when the original is released after timeout; actual-adapter delayed-setup regression also passes |
| Restored multi-selection card | Added regression preserves actionable prompt/options/multi after LiveTurn clears |

**755 passed, 0 failed, 0 skipped, 0 cancelled** across 16 affected files, Node
22.23.2, serial file concurrency, `--test-force-exit`, 36,461.993375 ms.
[Raw TAP](evidence/manual-code-review-round-4/affected-tests.tap).
Plugin typecheck passed from `vscode-plugin`:
`../node_modules/.bin/tsc --noEmit -p tsconfig.json`.

Ten archived diagnostic scripts were rerun against the reviewed sources. Exit zero
means the diagnostic executed; inspect the observations for its safety outcome.
Tests use injected process/provider/client seams and in-memory sessions; no live
CLI/model calls, real shell actions or workflow approvals were performed.

Review covered the fix diff, related stop/lease and persisted-request contracts,
the LLD recovery requirement and regression evidence. Adherence/quality remain
blocked by the findings above; coverage establishes the nominal corrections but
misses these failure/restoration cases. No additional concrete conventions blocker
was established.

Force-exit testing does not establish natural teardown. No full backend sweep, live
provider suite, rendered VS Code UI or JetBrains verification was performed. Other
streams' dirty workflow artifacts were preserved. No production code, runtime
configuration or existing approval records were changed. **BUILD remains unapproved.**
