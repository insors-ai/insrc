<!-- insrc:artifact PLAN-6a811b8acca60ac5-S001 -->

# Plan: E202610126a811b8a:S001

## Summary

**Epic:** `bug-vs-code-dev-chat-approvals`
**LLD run:** `wf-1791783491726-r4q9la`
**LLD effective hash:** `8f087f90ae01...`

Building this fix adds a small approval queue to the chat host and routes every permission request through it. The adapters first mark whether a request ends the turn (claude) or waits inside it (codex and the control protocol); the panel then shows only the current request, relays or batches each decision, and starts one follow-up per finished batch with every approved tool allowed. The card gains a '1 of N' label that updates in place and reappears after the webview reloads.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Approval queue module | M | — | unit: approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused; unit: approval queue: a batch is complete only when its turn has ended and every request is decided; unit: approval queue: the grant chain accumulates approved tool names once each and resets on clear() | [[c1]] [[c8]] |
| 2 | **`t2`** Mark approval requests with where they are answered | S | — | unit: claude permission_denied emits resolution 'turn-ended'; control-protocol and codex approval requests emit resolution 'in-turn' | [[c2]] [[c3]] |
| 3 | **`t3`** Route approval requests through the queue in the panel | M | `t1`, `t2` | integration: three requests in one turn: only the first card is posted (with '1 of 3'); integration: a turn followed after reload routes its approval-requests through the queue and its end ends the batch; integration: Stop with requests queued records each as rejected and clears the queue; integration: outcome rows: one role:'permission-outcome' row per decision, in decision order, and no approval-request rows (restore shows only chips) | [[c5]] [[c1]] [[c8]] |
| 4 | **`t4`** Decide only the head and relay in-turn decisions | M | `t3` | integration: the second card is posted only after the first is decided; a decision on a waiting card's id does nothing; integration: live-turn provider with two requests: decide() is called for the first before the second card is posted; no follow-up turn is started; integration: an in-turn request that carries a toolName is relayed with decide(), not batched (routing by resolution) | [[c3]] [[c8]] |
| 5 | **`t5`** One follow-up per completed turn-ended batch | M | `t4` | integration: approving all three starts exactly one follow-up turn, after the last decision and the turn's end, with allowedTools = all three tools and a prompt naming the three approved actions; integration: no approval ever supersedes a running follow-up: turns.start is called once per batch; integration: deny: a denied request gets a rejected chip, the next request is still asked, and the follow-up names it as denied; all denied -> no follow-up and an informational message; integration: a follow-up that is refused again forms the next batch and its follow-up carries the previous batch's grants; integration: single request: the existing approve/deny/exact-command/tool-name/dir-block/suppressEcho tests keep passing unchanged | [[c4]] [[c8]] |
| 6 | **`t6`** A typed message clears the queue (denying in-turn requests first) | S | `t5` | integration: a user-typed message while requests are queued records each as rejected, clears the queue, resets the grant chain and runs as a normal turn; integration: a live provider with a queued in-turn request, then the user types a message: decide(turnId, requestId, 'deny') is called before the new turn starts, and the request gets a rejected chip | [[c4]] [[c8]] |
| 7 | **`t7`** Card position label, in-place update and re-post on reload | M | `t3` | unit: approval renderer: with position/total and total > 1 the card shows '1 of 3'; without them it renders exactly as before; integration: a request joining the queue while the head is shown updates the shown card in place (one card per requestId); integration: reloading the webview while requests are queued re-posts the head card, and deciding it continues the queue | [[c6]] [[c7]] |

### 1.1 E202610126a811b8a:S001:T001 — Approval queue module

A pure, vscode-free module (vscode-plugin/src/chat/approval-queue.ts) holding the ordered undecided requests {requestId, turnId, toolName?, command?, blockKind, resolution}, the current batch per originating turn {ended, decisions[]}, and the grant chain. Operations: enqueue, head (with position/total), decide(requestId, decision) refusing any id that is not the head, endTurn(turnId), batch completion check, clear() returning the undecided requests, grantChain (approved tool names, once each). No posting, no turns: the panel drives it.

**Acceptance checks:**
- Requests keep arrival order; head() is the oldest undecided; decide() on any other id returns a refusal and changes nothing
- A batch reports complete only after endTurn for its turn AND every request it raised is decided
- The grant chain holds each approved tool-gate toolName once; dir-block approvals add nothing; clear() resets it and returns the undecided requests

### 1.2 E202610126a811b8a:S001:T002 — Mark approval requests with where they are answered

Add optional resolution?: 'turn-ended' | 'in-turn' to the approval-request TurnEvent (stream-events.ts). In cli-adapter.ts the claude system/permission_denied branch sets 'turn-ended'; normalizeApprovalEvent (control-protocol and codex) sets 'in-turn'. No other field changes.

**Acceptance checks:**
- claude permission_denied events carry resolution 'turn-ended'
- control-protocol (can_use_tool / permission_request) and codex approval events carry resolution 'in-turn'
- Existing adapter tests pass with only the added field

### 1.3 E202610126a811b8a:S001:T003 — Route approval requests through the queue in the panel

Replace pendingPerms with the t1 queue in chat-panel.ts. runTurn's TurnSink.onEvent and followLiveTurn's FollowSink.onEvent enqueue approval-requests (classifying blockKind as today) instead of posting them, and post only the head card with position/total; every other event is posted and persisted as today. A batch ends on its turn's terminal event (done/error) or a followed turn's onEnd. Stop (cancel-turn) records each undecided request as rejected and clears the queue; a chat switch or panel close drops it without outcome rows.

**Acceptance checks:**
- A turn raising three approval-requests posts exactly one card (the first) with position 1 of 3
- A followed turn's approval-requests also go through the queue
- Stop records each undecided request as rejected and clears the queue; open-chat / new-chat / dispose drop it with no outcome rows
- approval-request is still never written to the transcript

### 1.4 E202610126a811b8a:S001:T004 — Decide only the head and relay in-turn decisions

Rewrite the permission-decision handler's queue branch: a decision for a queued id that is not the head is ignored (debug log); the head's decision is recorded once (recordPermissionOutcome, in decision order); an in-turn request is relayed with decide(live.turnId, requestId, decision) (try/catch, a throw is logged and the queue still advances) before the next card is posted; a turn-ended request's decision joins its batch (an approved tool-gate joins the grant chain; an approved dir-block posts today's informational message). The next head is then posted. Ids not in the queue still fall through to decide() as today.

**Acceptance checks:**
- A decision on a waiting card's id does nothing; the head's decision records exactly one outcome chip/row
- The second card is posted only after the first is decided
- An in-turn request (even one carrying a toolName) is relayed with decide() before the next card is posted and never starts a follow-up; a throwing decide() is logged and the queue advances
- An id not in the queue still reaches the live adapter's decide()

### 1.5 E202610126a811b8a:S001:T005 — One follow-up per completed turn-ended batch

When a turn-ended batch is complete (its turn ended and every request decided), run exactly one follow-up via runTurn(prompt, grantChain, { suppressEcho: true }): one approved tool-gate uses today's exact prompt text ('Approved — run exactly this now: <command>' or the tool-name fallback); several use one combined prompt naming each approved action (exact command where captured) and each denied one; all denied (or only dir-blocks approved) posts an informational 'no action was approved' message and runs nothing. Requests the follow-up raises form the next batch; the grant chain carries over.

**Acceptance checks:**
- Approving three turn-ended requests starts turns.start exactly once, after the last decision and the turn's end, with allowedTools = the three tools and a prompt naming the three actions
- A denied request is named as denied in the combined follow-up; all denied runs no follow-up and posts the notice
- A follow-up that is refused again forms a new batch whose follow-up carries the earlier grants
- The existing single-request approve / deny / exact-command / tool-name / dir-block / suppressEcho tests pass unchanged

### 1.6 E202610126a811b8a:S001:T006 — A typed message clears the queue (denying in-turn requests first)

On a user-typed submit-turn (not a follow-up), before the turn starts: answer every undecided in-turn request whose turn is still live with decide(live.turnId, requestId, 'deny'); then record each undecided request as rejected, clear the queue and reset the grant chain; then run the user's message as a normal turn.

**Acceptance checks:**
- With a queued in-turn request, a typed message calls decide(turnId, requestId, 'deny') before the new turn starts
- Every undecided request gets a rejected chip and the queue is empty
- The next approval follow-up does not carry grants from before the typed message

### 1.7 E202610126a811b8a:S001:T007 — Card position label, in-place update and re-post on reload

Add a position label to the approval card in render-registry (shown as '1 of N' when total > 1; card unchanged without position/total). Add HostToWebview {type:'approval-position', requestId, position, total} in protocol.ts and a webview branch that finds .insrc-approval[data-request-id] and rewrites its label (unknown id ignored). The host posts a card at most once per requestId while shown and posts approval-position when the queue grows. postInitialState re-posts the head card with its position after session-restored (which clears the webview transcript), so exactly one head card exists afterwards.

**Acceptance checks:**
- A card with position/total and total > 1 shows '1 of 3'; without them it renders exactly as before
- A request joining the queue while the head is shown produces an approval-position message, not a second card
- approval-position for an unknown id changes nothing
- On 'ready' with a queued head, the head card is posted again, after session-restored, with its position, and exactly one card for it is posted

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused | `t1` |
| approval queue: a batch is complete only when its turn has ended and every request is decided | `t1` |
| approval queue: the grant chain accumulates approved tool names once each and resets on clear() | `t1` |
| three requests in one turn: only the first card is posted (with '1 of 3'); the second is posted only after the first is decided; a decision on a waiting card's id does nothing | `t3`, `t4` |
| approving all three starts exactly one follow-up turn, after the last decision and the turn's end, with allowedTools = all three tools and a prompt naming the three approved actions | `t5` |
| no approval ever supersedes a running follow-up: turns.start is called once per batch | `t5` |
| deny: a denied request gets a rejected chip, the next request is still asked, and the follow-up names it as denied; all denied -> no follow-up and an informational message | `t5` |
| outcome rows: one role:'permission-outcome' row per decision, in decision order, and no approval-request rows (restore shows only chips) | `t3` |
| a follow-up that is refused again forms the next batch and its follow-up carries the previous batch's grants | `t5` |
| a user-typed message while requests are queued records each as rejected, clears the queue, resets the grant chain and runs as a normal turn | `t6` |
| live-turn provider with two requests: decide() is called for the first before the second card is posted; no follow-up turn is started | `t4` |
| single request: the existing approve/deny/exact-command/tool-name/dir-block/suppressEcho tests keep passing unchanged | `t5` |
| an in-turn request that carries a toolName is relayed with decide(), not batched (routing by resolution) | `t4` |
| reloading the webview while requests are queued re-posts the head card, and deciding it continues the queue | `t7` |
| a turn followed after reload routes its approval-requests through the queue and its end ends the batch | `t3` |
| Stop with requests queued records each as rejected and clears the queue | `t3` |
| a request joining the queue while the head is shown updates the shown card in place (one card per requestId) | `t7` |
| a live provider with a queued in-turn request, then the user types a message: decide(turnId, requestId, 'deny') is called before the new turn starts, and the request gets a rejected chip | `t6` |
| approval renderer: with position/total and total > 1 the card shows '1 of 3'; without them it renders exactly as before | `t7` |
| claude permission_denied emits resolution 'turn-ended'; control-protocol and codex approval requests emit resolution 'in-turn' | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges: ApprovalQueue (replaces pendingPerms)`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api: approval-request mapping (permission_denied -> turn-ended; normalizeApprovalEvent -> in-turn)`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api: permission-decision handler + dataModelChanges TurnEvent approval-request resolution`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails.api: runTurn (batch follow-up prompt rules, typed-submit clear)`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails.api: TurnSink.onEvent and FollowSink.onEvent / onEnd (enqueue, batch end, Stop / detach)`
- **[[c6]]** `prior-artifact` `LLD S001 contractDetails.api: approval renderer + webview approval-position handler; dataModelChanges approval card meta`
- **[[c7]]** `prior-artifact` `LLD S001 contractDetails.api: postInitialState re-posts the head card`
- **[[c8]]** `prior-artifact` `LLD S001 errorPaths (error cases, edge cases, invariants)`
