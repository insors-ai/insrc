# S001 manual code review, round 6 — blocked

Date: 2026-11-05. Story: E202611031bd72813:S001.
Review cycle 2, round 3.

**Verdict: BLOCK — one MED finding in the new batch handoff.** The previous HIGH
cross-chat recovery finding is fixed. Reviewed `529213b28..e48d92501cbf0820c4bb34737657cffb185269c6`,
including targeted stop, dropdown/provider protocol changes and the batch reload
correction. This is the requested manual review, not a daemon CR or BUILD approval.

[Evidence, source hashes and commands](evidence/manual-code-review-round-6/evidence.json)
and thirteen portable diagnostics are preserved. No production fixes are included.

## MR6 — MED: batch removal is persisted before a recoverable delivery record exists

Location: `vscode-plugin/src/chat/chat-panel.ts:1424`–`:1429`, `:1461`–`:1465`.

The new reload fix prevents a delivered batch from being restored and rerun, but
persists its removal as soon as `takeCompletedBatch()` returns, before the follow-up
starts. Between removal and confirmed spawn, the delivery markers exist only in
the host's `pendingFollowUps` map. For a fresh live **turn-ended** approval, the
decision handler does not create the full unresolved request record: that upsert
is limited to `resolution === 'in-turn'`. The durable batch was therefore the
remaining actionable record, and it has already been removed.

Reproduction:

1. A fresh turn emits a turn-ended approval and finishes. Approve that request.
2. Gate continuation setup before its `onSpawn` callback. This corresponds to the
   real adapter's asynchronous output setup or a queued/leased continuation.
3. Serialize the saved session at this point and load it into an independent
   store/host, modeling the state available to a restarted panel/process.

Observed:

```json
{
  "followUpEnteredButNotSpawned": true,
  "persistedUnresolvedRequests": [],
  "persistedWaiting": [],
  "persistedBatches": [],
  "restoredApprovalEvents": 0,
  "retryStartedRun": false,
  "transcriptRetainsCommand": true
}
```

The continuation has not spawned, but the reload has no request or decision to
recover. The command text remains in history; actionable delivery state is lost.
An attempted decision for the old request is ignored. This contradicts the LLD's
requirement to preserve the full actionable payload and resolution state during
delivery. The new regression only reloads **after** the follow-up resolves, so it
misses this handoff window.

Required correction: durably preserve the full pending delivery/decision before
persisting batch removal, then settle it on confirmed delivery or failure. Keep
the delivered-batch duplicate suppression. Recovery must distinguish pending from
delivered/uncertain work without blindly rerunning an action that may have started.
Test reload before setup completes, before spawn, and after confirmed delivery;
include a multi-request batch and setup failure.

Executable: [batch-handoff.mts](evidence/manual-code-review-round-6/probes/batch-handoff.mts).
This uses the real host/lifecycle with injected adapter gates and an independent
restored store; it does not claim to simulate an actual disk or operating-system crash.

## Previous HIGH finding resolved

Recovery now checks the originating turn against the saved cursor and uses a
per-turn `stopTurnVerified` handle for a detached/other-chat original. The foreground
lifecycle is stopped only when it is the original current turn. The real adapter
looks up the named process in its turn map; absence fails closed.

The original no-handle reproduction now leaves **both** A and B unsignaled and
records A's delivery failure. With a valid targeted handle, the extended diagnostic
stops **only A**, observes B still alive with no signals, and lets B finish naturally.
A's continuation then carries A-command and resumes native-A; outcome is approved.
Both successful targeted recovery and the no-handle regression pass in the suite.

Executables: [targeted-stop.mts](evidence/manual-code-review-round-6/probes/targeted-stop.mts)
and [wrong-chat-stop.mts](evidence/manual-code-review-round-6/probes/wrong-chat-stop.mts).

## Validation and scope

- **764 passed, 0 failed, 0 skipped, 0 cancelled**, 16 affected files, Node
  22.23.2, serial file concurrency, `--test-force-exit`, 43,587.727041 ms.
  [Raw TAP](evidence/manual-code-review-round-6/affected-tests.tap).
- Plugin typecheck passed from `vscode-plugin`:
  `../node_modules/.bin/tsc --noEmit -p tsconfig.json`.
- Thirteen archived diagnostic scripts reran against the reviewed source. Their
  exit zero means execution succeeded; observations distinguish corrected cases
  from defects. Prior synchronous/asynchronous recovery, verified-stop refusal,
  turn-scoped live/restored outcomes, declaration compatibility, panel disposal
  and cancellation checks remain correct in their covered cases.
- Provider data is added to the active-list producer/type/compile-time contract and
  consumed by the dropdown script. Icon/selection wiring was inspected in source;
  native option backgrounds and rendered dropdown behavior were not visually verified.
- Review covered the latest fix diff and related process, lease, batch persistence,
  protocol and replay paths. Adherence/quality remain blocked by the pending-batch
  durability gap. No additional concrete conventions blocker was established.
- Injected processes/providers/clients and in-memory stores; no real model calls,
  shell actions or workflow approvals. No full backend sweep, live provider suite
  or JetBrains validation. Force-exit testing does not establish natural teardown.
  Unrelated dirty source and workflow records were preserved. No production code,
  runtime configuration or existing approval records were changed.

## Review-cycle limit

Cycle 2's first round found async recovery, stop verification and restored outcome
gaps. Its second round confirmed those direct corrections and identified the
cross-chat stop error. This third round confirms targeted stopping and identifies
the new batch persistence window above.

**BUILD remains unapproved.** The three-round limit is reached. No further review
will start without the user's choice of another cycle, approval with an explicit
override reason, or a change of course.
