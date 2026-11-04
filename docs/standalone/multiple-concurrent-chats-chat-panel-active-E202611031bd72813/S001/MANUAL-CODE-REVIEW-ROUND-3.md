# S001 manual code review, round 3 — blocked

Date: 2026-11-05. Story: E202611031bd72813:S001.

**Verdict: BLOCK — two HIGH findings and one MED finding remain.**
Reviewed `e6fe41ae4..71813edbc230f1987ca20ad207db89becf435a71`:
round-2 corrections, the additional conversation-scoped follow-up guard,
observer native-session checkpoint persistence, and protocol-contract additions.
This is the requested manual review, not a daemon CR or BUILD approval.

The round-2 cross-chat collision, legacy-panel disposal, asynchronous pre-spawn
cancellation and fresh-store declaration cases now pass. The remaining gaps below
were reproduced with the real hosts/lifecycle and injected provider/process seams.
[Evidence, source hashes and commands](evidence/manual-code-review-round-3/evidence.json)
are preserved with nine portable diagnostic scripts.

## MR1-R3 — HIGH: a later turn reusing a request ID silently loses its decision

Locations: `vscode-plugin/src/chat/chat-panel.ts:1506`, `:1636`, `:1646`;
related persistence: `:627`, `:1091`, `:1103`.

Delivery ownership now includes provider, turn and request, fixing the wrong-chat
callback case. The follow-up guard only includes conversation and request, however,
and persisted request lookups still use the bare request ID. Reuse in a later turn
of the same conversation therefore collides with the earlier resolved request.

Reproduction: turn t1 raises `shared` for `command-1`; its in-turn decision reports
`delivered:false`, so a follow-up answers it. The next user turn t3 raises `shared`
for **command-3**. The second decision also reaches the adapter and reports
`delivered:false`. No second continuation starts: the earlier resolved record
causes `undelivered` to be reset, and the conversation/request one-shot guard also
considers the new request already handled. The only persisted record is still t1's
`command-1`, `resolved:true`, `outcome:approved`.

Observed: three runs (first user turn, its continuation, second user turn), where
four are required to deliver both decisions. Both adapter decision calls are
recorded, for t1 and t3, ruling out a missing click or transport probe. The new
decision is neither delivered nor recorded as a new delivery failure.

Required correction: carry the originating turn/request identity through persisted
request lookup/update, replay detection, outcome correlation and one-shot follow-up
bookkeeping. A genuine new turn must not inherit an earlier turn's resolution;
replaying the same request must still remain one-shot. Add same-conversation reuse
coverage alongside the passing cross-conversation cases.

Executable: [same-chat-request.mts](evidence/manual-code-review-round-3/probes/same-chat-request.mts).

## MR3-R3 — HIGH: live-unwritable recovery still waits instead of stopping the original

Locations: `vscode-plugin/src/chat/chat-panel.ts:1620`, `:1649`, `:1464`, `:1467`.
Requirement: [LLD.md](LLD.md), section 7, request retention/decision transport
(line 199, explicit live-unwritable recovery sequence).

The actual child-spawn cancellation gap from round 2 is fixed: the predicate now
reaches the adapter and is checked after `beginTurn()` immediately before spawn.
That does not implement the separately identified live-unwritable recovery sequence.

When the original process is alive, its native session handle is durably known,
and `decide()` reports unwritable stdin, the host simply queues `runTurn()` behind
the still-running original. The explicit liveness branch only rejects a missing
handle; it neither stops the original nor verifies exit when the handle exists.
If the original is waiting for that very decision, the continuation cannot run,
and the delivery timer records failure instead of performing recovery.

Reproduction: keep the original injected process alive and blocked on an approval,
set a known native handle `native-original`, report `isAlive:true` and dead stdin,
then approve. At delivery timeout the original remains alive, its recorded stop/
kill signals are **empty**, only the original run has started, and the request is
`delivery-failed`. Releasing it manually afterward starts no continuation, as the
new cancellation guard correctly prevents the timed-out action.

The diagnostic uses a 30 ms configured timeout rather than the production 30-second
default; it performs no real kill or shell action. This is the recovery gap already
called out in rounds 1 and 2, not a new background-progress requirement.

Required correction: preserve the native handle, explicitly stop the original,
verify exit, then resume that native session with the bound decision. If safe exit
cannot be verified, record the failure without launching a competing continuation.
Test a genuinely alive, unwritable original with a recoverable handle; the existing
known-handle test changes liveness to dead after reload and misses this branch.

Executable: [live-unwritable.mts](evidence/manual-code-review-round-3/probes/live-unwritable.mts).

## MR4-R3 — MED: legacy bare declaration IDs still suppress new turns after upgrade

Location: `vscode-plugin/src/chat/chat-panel.ts:1718`–`:1721`.

New entries are correctly turn-scoped, fixing repeated call IDs in a fresh ledger.
The compatibility check still searches the entire ledger for the legacy bare call
ID without validating its original turn. Its comment says that old entries match
only their own turn, but the implementation has no such condition.

Reproduction: after turn 1, retain its presentation ledger in the prior-version
format `["item_1"]`. Turn 2 emits its own declaration with call ID `item_1`.
Only one panel opens for the two genuine declarations; the old bare ID suppresses
turn 2 exactly as before. No legacy entry is migrated or bounded to an old turn.

Required correction: scope legacy matching to the known owning turn where that
provenance exists, and define a safe migration strategy for ambiguous old entries.
A bare ID must not remain a wildcard over every future turn. Test same-turn replay
and a new turn after loading the old persisted format, as well as fresh stores.

Executable: [legacy-present.mts](evidence/manual-code-review-round-3/probes/legacy-present.mts).

## Changes that passed and validation

| Area | Result this round |
| --- | --- |
| Cross-chat async failure ownership | Reused ID in A/B targets A and carries A-command, with no native-B resume |
| Legacy panel disposal | Surviving keyed panel receives boot content and a decision result |
| Timeout during asynchronous adapter setup | Passing MR3-R2 test uses the real adapter and delayed `SessionOutput.beginTurn`; no late child spawn |
| Fresh presentation ledger | Two turns reusing item_1 open two panels with separate turn-scoped IDs |
| Observer-to-follow replay | Existing regression passes with the new scoped declaration IDs |
| Observer native-session checkpoint | Added checkpoint/native-handle regression passes |
| Protocol contracts | New compile-time source contracts and runtime assertions pass typecheck/tests |

- **754 passed, 0 failed, 0 skipped, 0 cancelled**, Node 22.23.2; 16 affected
  test files, serial file concurrency, `--test-force-exit`, 42,485.922375 ms.
  [Raw TAP](evidence/manual-code-review-round-3/affected-tests.tap).
- Plugin typecheck passed: from `vscode-plugin`,
  `../node_modules/.bin/tsc --noEmit -p tsconfig.json`.
- Nine archived diagnostics ran successfully against the reviewed sources.
  Exit zero means the diagnostic executed, not that its safety property passed.
  The earlier injected `spawn-gap` adapter ignores the new `shouldSpawn` option;
  rerunning it unchanged would be an invalid claim against the corrected adapter.
  The actual-adapter regression is the applicable evidence for that correction.
- Adherence/quality remain blocked by incomplete request identity, specified process
  recovery and persisted-format compatibility. Coverage now verifies the original
  fixes but misses the three cases above. No additional concrete conventions blocker
  was established in the reviewed diff.
- No live providers, real shell actions, rendered VS Code UI, JetBrains verification
  or full backend sweep. Force-exit testing does not establish natural teardown.
  Unrelated dirty workflow artifacts and another stream's temporary probes were
  preserved. No production code or existing approval records were changed.

## Three-round limit

Round 1 identified wrong-chat routing, singleton panel state, late execution after
failure and observer/follow duplicate presentations. Round 2 verified improvements
but found narrower collision, disposal, pre-spawn and deduplication gaps. This round
confirms those direct fixes and identifies the remaining cases above.

**BUILD remains unapproved.** This completes the permitted three-round cycle.
No fourth review will start without the user's choice of another cycle, approval
with an explicit override reason, or a change of course.
