# S001 manual code review — blocked

Date: 2026-11-04. Story: E202611031bd72813:S001.
Packet: `/tmp/review-packet-E202611031bd72813-S001.md`.
Reviewed packet range: `afdedb5b3e5378af06f953fc64ad8ab72ce96a44` through
`0092d8d4b325606b4916ebbed2d5e77fced70c83`.

**Verdict: BLOCK — three HIGH findings and one MED finding.** Each was reproduced
with the real host/lifecycle/presenter code and injected process/client seams.
Passing task gates and existing tests do not cover these flows.

The user requested this manual in-session review because automated review exceeded
its budget. This report does not fabricate a daemon CR record or approve BUILD.
No production fixes are included. The checked working HEAD was `b6551fab6`;
its VS Code tree and clean working sources match packet HEAD. Source fingerprints,
test evidence and observations are in
[evidence.json](evidence/manual-code-review/evidence.json).

## MR1 — HIGH: late delivery failure resumes the currently selected chat

Location: `vscode-plugin/src/chat/chat-panel.ts:1535–1546`.

The asynchronous stdin failure callback searches for a conversation whose current
`liveTurn` has the failed turn ID, then falls back to the global selected `session`.
A normal terminal event clears the original conversation's `liveTurn`. If the
callback arrives after that and the user has switched chats, the fallback identifies
the selected chat as the failed request's owner. It inserts the old request there
and starts an approval/denial continuation using that chat's native session.

Reproduction: chat A raises an in-turn request; `decide()` initially reports
delivered. A then reaches terminal, clearing `liveTurn`. Select chat B and deliver
the asynchronous failure for A's original turn/request through the registered
adapter callback. The result is:

```text
followUpTarget == selected B, not originating A
followUpResume == { provider: "claude", nativeSessionId: "native-B" }
requestInsertedIntoB == true
A's original outcome remains "approved"
```

This crosses the permission/conversation boundary, and also leaves the original
delivery record incorrect. It violates t6's requirement to correlate the delivery
result with its originating request and preserve the native session context.

Required correction: retain explicit provider/turn/request-to-conversation ownership
for the delivery attempt, including after terminal, and resolve callbacks through
that binding. An unknown/stale binding must fail closed and never fall back to the
selected chat. Scope one-shot delivery bookkeeping by that identity; ensure callback
ownership survives or is safely disposed with the host. Regression: asynchronous
failure after original terminal and a chat switch, with a different native session
and a newer live turn, must never mutate or resume the selected conversation.

Executable: [async-routing.mts](evidence/manual-code-review/probes/async-routing.mts).

## MR2 — HIGH: per-presentation panels retain singleton document state and routing

Locations: `vscode-plugin/src/chat/docs-review-panel.ts:1286–1333`,
`:1710–1716`, `:2518`, and `:2537–2541`.

The new `panels` map creates separate channels, but `opened`, document/watch state,
`openSeq`, `shellNonce` and decision handling remain shared. Every channel registers
the same handler without a panel binding. `post()` only targets `openPostTarget`
during the initial queued content read; that target is then cleared. Outside this
short window, messages go to the legacy channel or are dropped if no legacy panel
exists. Serializing initial loads does not isolate later interactions.

Reproduction: present different pending artifacts A and B under different
`presentKey`s, wait for both initial loads, then send Approve from A's panel. The
host compares A with the singleton `opened` record for B and refuses it. The refusal
itself has no destination. A subsequent webview boot/reload ping also receives no
content on its channel:

```json
{"initial":[["LLD-a-S001"],["LLD-b-S001"]],"firstPanelDecisionReachedDaemon":0,"firstPanelDecisionReplies":0,"contentCountsAfterSecondPanelBoot":[1,1]}
```

Consequences extend to pending refreshes, companion requests/nonces, watches and
decision results: these operations cannot reliably target their originating panel.
The first panel containing its initial text is insufficient evidence for ac3's
functional, independent presentation panels.

Required correction: bind messages, posts, opened-document state, load sequencing,
nonce, watches, decision state and disposal to a per-panel context. Share only
appropriate list/cache data. A completed/disposed panel must not reroute its
callbacks into another panel. Regression: two different artifacts, independent
approval/feedback and companion opens, shell reload/ready, async content responses,
external approval/watch updates and disposal of one sibling while the other works.
Retain the legacy presentKey-less path in those tests.

The current t8 panel test at `docs-review-panel.test.ts:7351` opens the same artifact
twice and checks initial messages/map behavior. It does not exercise the conflicting
document identities or post-load interactions reproduced here.

Executable: [panels.mts](evidence/manual-code-review/probes/panels.mts).

## MR3 — HIGH: a timed-out decision continuation can still execute later

Location: `vscode-plugin/src/chat/chat-panel.ts:1450–1463`;
related serialization: `vscode-plugin/src/chat/turn-lifecycle.ts:311–351`.

When an in-turn decision cannot reach stdin, the host starts a follow-up using
`runTurn()`. If the original turn is still blocked, the continuation waits behind
it in the lifecycle chain or session lease. The 30-second stall timer removes the
request from `pendingFollowUps` and records `delivery-failed`, but does not cancel
or invalidate that scheduled continuation. When the original turn eventually ends,
the continuation still runs the approved command after the UI reported failure.

Reproduction uses the real lifecycle and a blocked injected process, with the
private delivery timeout reduced to 30 ms:

```json
{"outcomeBeforeOriginalEnds":"delivery-failed","runsBeforeOriginalEnds":1,"runsAfterOriginalEnds":2,"lateFollowUpPrompt":"Approved — run exactly this now: echo fixture","nativeResume":null}
```

The diagnostic executes no shell action: it records the request passed to the
adapter. In a real client this request starts an agent continuation. A user retry
after the apparent failure can therefore duplicate an action. Merely deleting the
pending map entry also prevents that later spawn from correcting the failed record.

This is also where the LLD's live-unwritable recovery sequence matters: capture
the original native session, stop and verify the original process, then perform a
bound continuation. The current fallback queues another run without implementing
that coordinated recovery.

Required correction: give each continuation a cancellation/attempt identity that
is checked immediately before spawn. A timeout recorded as terminal delivery
failure must prevent later execution; alternatively keep an honest pending/unknown
state until the outcome is settled. Implement the approved live-writable,
live-unwritable and dead-process triage without losing native context or implicitly
relying on the generic long session-lock timeout. Regression: let the stall timer
fire, then release the original process and verify no failed/cancelled continuation
can spawn. Include a user retry/new turn and the first-turn native-session case.

The existing stall test at `chat-panel.test.ts:6816` verifies the failure record but
does not then release the original turn and check for late execution.

Executable: [followup.mts](evidence/manual-code-review/probes/followup.mts).

## MR4 — MED: reattaching reopens an already dispatched presentation declaration

Locations: `vscode-plugin/src/chat/chat-panel.ts:763–780` and `:1675–1678`.

The detached observer persists and checks `observerCheckpoint.declaredIds`, but
the normal follow path unconditionally calls `presentDeclared()` for replayed tool
calls. Its cursor is intentionally separate from the observer's cursor and may
still precede a declaration the observer already dispatched. The presenter now
deduplicates within a declaration, so a new `declared()` invocation creates a new
panel even for the same provider call ID.

Reproduction: an orphaned still-running turn emits one `insrc_present` with call ID
`declaration-1`. The observer opens its panel and checkpoints that declaration.
Reattach the chat while the turn is still running; the regular follow reader
replays the same call. The persisted ID is present, but a second panel opens:

```json
{"persistedDeclaration":"declaration-1","panelsBeforeReattach":1,"panelsAfterReattach":2,"keys":["LLD-a-S001#1","LLD-a-S001#2"]}
```

This violates the LLD's explicit observer-to-transcript-replay deduplication rule.
Repeated switches/reloads can create repeated presentation panels for a single
declaration. Distinct real declarations must still open distinct panels.

Required correction: use a shared durable declaration identity and dispatch check
across live, followed and observer paths, scoped to the conversation and turn.
Coordinate checkpoint/dispatch outcomes so failed opens are not silently treated
as successfully presented. Regression: observer dispatch followed by normal
reattach and reload opens once; a later different call ID opens a new panel.

The current detached-presentation test at `chat-panel.test.ts:6386` checks repeated
observer passes, but not the transition to the independent normal follow reader.

Executable: [present-replay.mts](evidence/manual-code-review/probes/present-replay.mts).

## Four review dimensions

| Dimension | Assessment |
| --- | --- |
| Adherence | Blocked by per-panel interaction isolation, originating-session decision delivery, timeout settlement and cross-reader presentation dedup. Active-list status/purge logic and open-chat reuse have source and passing test support. |
| Conventions | No additional concrete blocking finding established. Changes use the existing ESM/type boundaries, injected plugin logging, provider seams and IPC contracts. This feature does not introduce direct cloud REST calls or new raw daemon database access. |
| Coverage | Existing selected suite passes, but the four diagnostic flows expose gaps. Initial panel message/map assertions do not prove independent interaction; a recorded timeout alone does not prove that execution was cancelled; same-observer dedup does not prove cross-reader dedup. |
| Quality | Shared singleton state beneath multiple channels and unbound asynchronous delivery callbacks are correctness problems, not cosmetic concerns. A failure record must correspond to a settled or prevented action. |

## Validation, scope and limits

- Ran 15 affected non-live test files with supported Node 22.23.2, serial file
  concurrency, and the packet's `--test-force-exit` approach: **735 pass, 0 fail,
  0 skip, 0 cancelled**, duration 36,438.4485 ms. Raw
  [TAP](evidence/manual-code-review/affected-tests.tap) is preserved; this is the
  observed count for the explicit selection, not a repetition of the packet's 729.
- Plugin typecheck passed: from `vscode-plugin`,
  `../node_modules/.bin/tsc --noEmit -p tsconfig.json`.
- The first unforced test attempt finished the chat-panel file and remained alive.
  Only that review runner was stopped before using the packet's force-exit mode.
  Natural teardown is therefore not established by this test result. This review
  does not assert a new production leak without further isolation.
- All four portable diagnostic scripts were rerun from their archived paths and
  reproduced the observations. Run each with Node 22 and `--import tsx`. Their exit
  zero means the diagnostic executed; it is not a passing safety assertion. They
  use injected clients/processes and in-memory sessions, with no live CLI/model
  calls, actual workflow approvals or real shell actions.
- Inspected the packet's production changes, relevant current code, approved
  LLD/plan, and regression tests. Focus included observer cursor/decoder and terminal
  gates, queue snapshot/restore, session status/purge, rollover/pin locking,
  decision transport and backpressure, presentation multiplicity/drafts, extension
  wiring and protocol/CSP changes. No additional concrete blocker is claimed for
  the nominal source paths covered by the selected tests.
- This is host/source-level verification. VS Code webview rendering, native select
  colors and interactive companion rendering were not visually verified. No full
  backend sweep or live provider suite was run.
- The separate background-progress specification is not an acceptance requirement
  retroactively imposed on this story. Findings above follow this story's own
  design and its executable behavior.
- No production code, existing build/test ledger, runtime model configuration or
  workflow approval was changed. **Fix and regression-test the findings before
  approving this BUILD.**
