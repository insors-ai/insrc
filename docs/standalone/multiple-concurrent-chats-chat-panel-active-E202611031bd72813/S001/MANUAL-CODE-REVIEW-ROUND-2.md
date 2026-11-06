# S001 manual code review, round 2 — blocked

Date: 2026-11-04. Story: E202611031bd72813:S001.

**Verdict: BLOCK — three HIGH findings and one MED finding remain.** The fixes
correct the original four reproductions, but related cases below still fail.
This is the user-requested manual review, not a daemon CR or BUILD approval.

Reviewed fixes: `0600f4c1b`, `02af6e074`, `a3e531ba0`, and `50fd8cc9b`, through
`50fd8cc9b9ad217aab1ca33617856f7226df6992`. Concurrent history reconciliation
temporarily introduced conflict markers in the shared checkout, so the additional
diagnostics were checked against an isolated snapshot of that commit. The final
checkout, `a21ea79de446803d8b8815e9a537e3674971c768`, has an identical VS Code
tree. Archived probes were also rerun against those identical current sources.

[Evidence and source hashes](evidence/manual-code-review-round-2/evidence.json)
record the exact observations. No production fixes are included in this review.

## MR1-R2 — HIGH: reused request IDs still misroute asynchronous delivery failures

Locations: `vscode-plugin/src/chat/chat-panel.ts:1550`, `:1554`, and `:1588`.

The ownership map now preserves the original conversation after terminal, which
fixes the original unique-request reproduction. However, it is keyed only by
`requestId`. The callback explicitly discards `turnId`; a later decision with the
same request ID overwrites the earlier delivery's owner. Provider identity is
also absent. The adapter's actual pending registry is scoped by turn
(`cli-adapter.ts:1095`), and incoming approval IDs have no globally unique contract.

Reproduction: A and B each decide `shared-request` in different turns; both
`decide()` calls initially report success. After both terminal events, invoke the
delayed failure callback for **A-turn**. The callback starts a continuation in **B**,
resumes **native-B**, and sends **B-command**. A's outcome remains approved.
This is a cross-conversation action-routing failure, even though the nominal
unique-ID case now works.

Required correction: bind each delivery attempt to provider/adapter, turn, request
and originating conversation. Resolve callbacks through that full identity and
scope one-shot/follow-up bookkeeping consistently. Preserve separate pending
attempts when request IDs repeat; unknown callbacks must fail closed. Test repeated
IDs across turns and providers, and late callbacks after terminal/chat switches.

Executable: [routing-collision.mts](evidence/manual-code-review-round-2/probes/routing-collision.mts).

## MR2-R2 — HIGH: closing the legacy panel disables surviving presentation panels

Locations: `vscode-plugin/src/chat/docs-review-panel.ts:2522` and `:1361`.
Legacy entry point: `vscode-plugin/src/extension.ts:903`.

Per-panel contexts fix the original conflicting-document decision and boot routing.
However, the legacy panel's disposal callback still sets the **host-wide**
`disposed` flag, cancels shared polling, and clears the shared pending map. Every
panel's `post()` then drops messages. The legacy panel is reachable through the
regular “Review pending documents” command, so this is a supported mixed-panel flow.

Reproduction: open the legacy panel and two keyed presentation panels, wait for
initial content, then close only the legacy panel. A surviving keyed panel's boot
receives no new content. Approve from that panel still reaches the daemon, but no
decision result reaches the webview:

```json
{"survivingPanelContentBefore":1,"survivingPanelContentAfter":1,"decisionReachedDaemon":1,"decisionReplies":0}
```

This leaves a visible, actionable panel without acknowledgements or refreshes.
The new sibling-disposal regression closes a keyed sibling and misses the legacy
callback. Required correction: make legacy disposal local to its context; reserve
host-wide shutdown for host disposal and retain shared services while consumers
remain. Test closing the legacy panel with keyed panels alive, including decisions,
boot, watch/list refresh, and reopening the legacy panel.

Executable: [panel-dispose.mts](evidence/manual-code-review-round-2/probes/panel-dispose.mts).

## MR3-R2 — HIGH: cancellation does not reach the actual child-spawn boundary

Locations: `vscode-plugin/src/chat/chat-panel.ts:1461`, `:1467`;
`vscode-plugin/src/chat/turn-lifecycle.ts:457`;
`vscode-plugin/src/chat/cli-adapter.ts:1113`, `:1132`.

The new `shouldSpawn` check correctly blocks a timed-out continuation still queued
behind the original turn. It runs before entering `adapter.run()`, though. The real
adapter then awaits `sessionOutput.beginTurn()` before calling `deps.spawn()`.
No cancellation predicate or signal is passed through to recheck after that await.
The delivery timer can therefore record terminal failure after the lifecycle check
but before the child starts; the child still launches when setup finishes.

The diagnostic uses the real host/lifecycle and an injected adapter with a gate at
that asynchronous pre-spawn boundary. It releases the original turn, lets the
continuation enter adapter setup, waits for the 30 ms diagnostic delivery timeout,
then releases setup. Observed spawn callbacks increase from **1 to 2 after
`delivery-failed`**. The late continuation carries:
`Approved — run exactly this now: echo fixture`.

No real shell action or child process is executed by the diagnostic. The injected
await models the concrete production `beginTurn()` await above; it does not claim
that ordinary filesystem setup always exceeds the default 30-second timeout.

Required correction: propagate cancellation/attempt validity through adapter setup
and check it immediately before the actual spawn, with appropriate setup cleanup.
Once terminal failure is reported, a delayed setup must not launch that attempt.
Add a regression using delayed `SessionOutput.beginTurn()` and the real adapter,
in addition to the existing lifecycle-queue regression.

The earlier review's live-unwritable recovery concern is also only partly addressed:
capturing a first-turn native handle and rejecting a missing handle improve context
safety, but the fallback still relies on generic turn serialization rather than
explicitly stopping/verifying a live unwritable original as specified in the LLD.

Executable: [spawn-gap.mts](evidence/manual-code-review-round-2/probes/spawn-gap.mts).

## MR4-R2 — MED: presentation deduplication suppresses a distinct later declaration

Locations: `vscode-plugin/src/chat/chat-panel.ts:766`, `:1695`, and `:1709`.

The shared durable ledger fixes observer-to-follow replay of the same declaration.
Its identity is `ev.callId` when supplied, with turn ID used only in the fallback
when call ID is absent. That bare call ID is retained across the entire conversation.
Provider item IDs may repeat in different turns or CLI invocations; the event's
turn ID is available but discarded from this key.

Reproduction: two completed turns in the same conversation each emit a genuine
`insrc_present` declaration with call ID `item_1`. The first opens a panel; the
second is silently suppressed. The stored ledger is `["item_1"]`, and only **one
panel opens for two distinct turn declarations**.

Required correction: use a stable conversation/turn/call identity across live,
followed and observer readers, including compatible handling of existing persisted
IDs. A replay of one declaration must open once, while a new turn reusing a call ID
must still present. Test both properties together, including reload.

Executable: [present-turns.mts](evidence/manual-code-review-round-2/probes/present-turns.mts).

## What the fixes resolved

The archived original-flow diagnostics now show:

| Finding | Original reproduction after fixes | Remaining gap |
| --- | --- | --- |
| MR1 | A's unique-request failure starts A's continuation after switching to B | Repeated request ID overwrites attempt ownership |
| MR2 | A's decision reaches the daemon and A receives its result; B boot refreshes B | Closing the legacy panel shuts down all panel posts |
| MR3 | A timed-out continuation still queued behind the original turn does not run | Timeout during adapter setup still allows late spawn |
| MR4 | Observer dispatch followed by reattach opens one panel | A later turn reusing the call ID opens no new panel |

The original MR3/MR4 diagnostics used waits for the defective late effect; these
round-2 versions instead wait a bounded 80 ms after release/reattach to observe
its absence. New focused regressions in the production suite also cover those
original flows. These observations establish those cases, not exhaustive safety.

## Validation and review limits

- **741 passed, 0 failed, 0 skipped, 0 cancelled** across the same 15 affected test
  files, Node 22.23.2, serial file concurrency, `--test-force-exit`;
  duration 45,601.322208 ms. [Raw TAP](evidence/manual-code-review-round-2/affected-tests.tap).
- Plugin typecheck passed from `vscode-plugin`:
  `../node_modules/.bin/tsc --noEmit -p tsconfig.json`.
- Eight archived diagnostics ran successfully. Exit zero means the diagnostic
  executed; inspect its observation to distinguish a corrected case from a defect.
  Run with Node 22 and `--import tsx`. Clients, processes and stores are injected;
  host/lifecycle/presenter code is real. No live model calls, real approvals or
  shell actions were performed.
- Reviewed the fix diff, related transport/lifecycle/presentation code and regression
  coverage against the original review and story requirements. Adherence and quality
  remain blocked by the findings above; passing coverage misses these boundary cases.
  No additional concrete conventions blocker was established.
- Force-exit testing does not prove natural teardown. No full backend sweep, live
  provider testing, rendered VS Code UI or JetBrains validation was performed.
- No production code, runtime configuration, existing BUILD/test ledger or approval
  records were changed. **BUILD remains unapproved.**
