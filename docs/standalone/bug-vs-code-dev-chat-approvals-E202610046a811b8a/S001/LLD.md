<!-- insrc:artifact LLD-6a811b8acca60ac5-s1 -->

# LLD: E202610126a811b8a:S001

## Summary

**Epic:** `bug-vs-code-dev-chat-approvals`
**HLD base run:** `wf-1791783491726-r4q9la`
**HLD effective hash:** `8f087f90ae01...`

When the assistant asks for several permissions in one turn, the chat now asks for them one at a time. Only the current request has Approve and Deny buttons, shown as "1 of N", and the next appears only once it is decided. For claude, which ends the turn when it is refused, nothing runs until every request from that turn is decided; then one follow-up turn runs with every approved tool allowed and tells the model which actions were approved and which were denied, so no follow-up can cut another short. For providers that wait inside the turn, each decision is passed to the running turn before the next request appears.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `approval-request mapping (cli-adapter.ts: claude system/permission_denied branch and normalizeApprovalEvent)`

```typescript
normalizeApprovalEvent(turnId: string, raw: Record<string, unknown>): TurnEvent | null  // now sets resolution: 'in-turn'; the permission_denied branch sets resolution: 'turn-ended'
```

**Parameters:**
- `turnId: string` — The turn the request belongs to.
- `raw: Record<string, unknown>` — The provider envelope (control_request / permission_request / can_use_tool / codex approval item).

**Returns:** `TurnEvent | null` — An approval-request carrying resolution 'in-turn' (the provider waits for decide()), or null for an idless line as today.

**Postconditions:**
- claude's system/permission_denied (the turn ends after it) emits resolution: 'turn-ended'.
- Every in-turn request (control-protocol can_use_tool, codex approval items) emits resolution: 'in-turn'.
- All other fields are unchanged.

### 2.2 `permission-decision (chat-panel handleMessage case)`

```typescript
case 'permission-decision': (msg: { requestId: string; decision: 'approve' | 'deny' }) => void
```

**Parameters:**
- `msg.requestId: string` — The card the user decided.
- `msg.decision: 'approve' | 'deny'` — The user's choice.

**Returns:** `void` — The head request is decided: its outcome recorded, and either the next request presented or (batch complete) the follow-up started.

**Preconditions:**
- A decision is acted on only when requestId is the head of the approval queue; any other requestId (a waiting request, an already-decided one, a stale card) is ignored and logged at debug.

**Postconditions:**
- Exactly one permission-outcome (live chip + persisted role:'permission-outcome' row) per decided request, in decision order (recordPermissionOutcome, unchanged).
- Turn-ended request (resolution 'turn-ended'): the decision is added to the turn's batch; approve of a tool-gate adds its toolName to the session's grant chain; approve of a dir-block posts today's informational message and adds no grant.
- In-turn request (resolution 'in-turn', or absent): decide(live.turnId, requestId, decision) is called before the next request is presented. The path is chosen from the event's resolution, never from whether it carries a toolName (in-turn requests usually carry one too).
- The next queued request is then posted as the actionable card; if none remain and the originating turn has ended, the batch's follow-up runs (see runTurn).

### 2.3 `runTurn`

```typescript
runTurn(text: unknown, allowedTools?: readonly string[], opts?: { readonly suppressEcho?: boolean | undefined }): Promise<void>  // unchanged
```

**Parameters:**
- `text: unknown` — The user's prompt, or the batch follow-up prompt.
- `allowedTools: readonly string[]` _(optional)_ — For a batch follow-up: the session's whole grant chain (every tool approved since the last user-typed turn).
- `opts.suppressEcho: boolean` _(optional)_ — True for the synthetic follow-up (no user bubble), as today.

**Returns:** `Promise<void>` — The turn ran through turns.start (newest-message-wins, unchanged).

**Preconditions:**
- A batch follow-up is started only when the originating turn has ended AND every request it raised is decided; at most one follow-up per batch.

**Postconditions:**
- A user-typed submit (not a follow-up) first clears the approval queue: every still-undecided in-turn request (resolution 'in-turn') whose turn is still live is answered with decide(live.turnId, requestId, 'deny') so the waiting provider process can finish and release the session lease; then each undecided request is recorded as rejected (visible chip) and removed, and the grant chain is reset, so nothing approved earlier silently carries into an unrelated conversation turn.
- Follow-up prompt: one approved tool-gate -> today's exact text ('Approved — run exactly this now: <command>' or 'Approved: please proceed with the <tool> action you requested permission for.'); several -> one prompt listing each approved action (exact command where captured) to run now and each denied action not to attempt.
- All denied (or only dir-blocks approved): no follow-up turn runs; an informational message says no action was approved.
- Requests raised by the follow-up turn form the next batch; the grant chain carries over to it.

### 2.4 `TurnSink.onEvent (runTurn) and FollowSink.onEvent / onEnd (followLiveTurn)`

```typescript
TurnSink.onEvent(ev: TurnEvent): void; FollowSink.onEvent(ev: TurnEvent): void; FollowSink.onEnd(): void  // shapes unchanged
```

**Parameters:**
- `ev: TurnEvent` — Each event of the turn.

**Returns:** `void` — Event handled.

**Postconditions:**
- An approval-request is no longer posted to the webview directly by either sink (runTurn's TurnSink or followLiveTurn's FollowSink after a reload): it is enqueued with its resolution, toolName, command and blockKind, and posted only when it becomes the head.
- Every other event is posted and persisted exactly as today; approval-request stays live-only (never a transcript row).
- A batch ends when its turn's terminal event (done or error) reaches onEvent, or when a followed turn's onEnd fires; if its requests are all decided, the follow-up starts then.
- A turn that ends without a terminal event is handled explicitly: Stop clears the queue (each undecided request recorded as rejected); a chat switch or panel close (detach) drops it without outcome rows; a supersede only happens from a user-typed submit, which clears the queue first.

### 2.5 `approval renderer (render-registry register('approval'))`

```typescript
register('approval', (vm: { meta: { requestId: string; title: string; detail?: string; toolName?: string; position?: number; total?: number } }) => Element)
```

**Parameters:**
- `vm.meta.position / vm.meta.total: number` _(optional)_ — The head's place in the queue, shown as '1 of N' when total > 1.

**Returns:** `Element` — The single actionable approval card.

**Postconditions:**
- With no position/total (one request) the card renders exactly as today.
- The card carries a position label element so its count can be updated in place.

### 2.6 `webview approval handlers (chat-panel.ts bootstrap :514) + HostToWebview`

```typescript
HostToWebview |= { type: 'approval-position'; requestId: string; position: number; total: number }
```

**Parameters:**
- `requestId: string` — The head card to update.
- `position / total: number` — The new '1 of N' values.

**Returns:** `void` — The existing card is updated in place.

**Postconditions:**
- The host posts an approval-request card at most once per requestId while it is shown; when requests join the queue behind the head it posts approval-position instead.
- The webview finds .insrc-approval[data-request-id=<id>] and rewrites its position label; an unknown id is ignored (never creates a card).

### 2.7 `postInitialState (chat-panel.ts:258, run on every 'ready')`

```typescript
postInitialState(): void  // unchanged
```

**Returns:** `void` — The full view state is re-sent to a (re)loaded webview.

**Postconditions:**
- After session-restored, the current queue head (if any) is re-posted as its approval card with position and total, so a webview reloaded on hide/show (no retainContextWhenHidden) shows the actionable request again instead of leaving the queue stuck.

## 3. Data model changes

### 3.1 `ApprovalQueue (replaces pendingPerms)` — new

Host-side, per chat panel, keyed to the active session: an ordered list of undecided requests { requestId, turnId, toolName?, command?, blockKind: 'tool-gate' | 'dir-block', resolution: 'turn-ended' | 'in-turn' }, the current batch { originTurnId, ended: boolean, decisions: { requestId, toolName, command?, blockKind, decision }[] }, and the session's grant chain (Set<string> of approved tool names since the last user-typed turn). Only the head is ever posted to the webview. Cleared (undecided -> rejected) on a user-typed submit; dropped without outcome rows on a session switch or panel close, as undecided live-only cards are today.

```
- const pendingPerms = new Map<string, { toolName; command?; blockKind }>()
+ const approvals = createApprovalQueue()  // { enqueue, head, decide, endTurn, clear, grantChain }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.2 `approval-request webview message / approval card meta` — field-add

The posted approval card meta gains optional position and total ('1 of N'); a new host-to-webview message approval-position updates the shown card in place. Absent for a single request, so the existing render is unchanged.

```
+ meta.position?: number; meta.total?: number
+ HostToWebview { type: 'approval-position'; requestId; position; total }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/protocol.ts`

### 3.3 `TurnEvent 'approval-request'` — field-add

Adds resolution?: 'turn-ended' | 'in-turn', set by the adapter mapper that raised it. The host routes on it; absent is treated as 'in-turn' (today's fall-through relay).

```
+ readonly resolution?: 'turn-ended' | 'in-turn';
```

**Call sites:**
- `vscode-plugin/src/chat/stream-events.ts`
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/bug-vs-code-dev-chat-approvals-E202610046a811b8a/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **A decision arrives for a requestId that is not the queue head (a waiting request clicked through a stale or second webview, a duplicate click, or a card left over from a previous batch).** (recoverable)
  - Detection: The permission-decision handler compares msg.requestId with the queue head's requestId before doing anything.
  - Response: Ignore it (debug log); no outcome row, no relay, no follow-up. A request that is not in the queue at all still falls through to the live adapter's decide(), which no-ops on an unknown id, as today.
  - User impact: Nothing happens for the stray click; the actionable card stays the one shown.
- **The live adapter's decide() throws while relaying a live-turn request (adapter gone, provider unavailable).** (recoverable)
  - Detection: try/catch around deps.providers.get(live.provider).decide(...), as today.
  - Response: The decision is still recorded as an outcome, the request leaves the queue, and the next request is presented; the failure is logged.
  - User impact: The chat does not get stuck on an undeliverable decision.
- **Saving the outcome row fails (session store write error).** (recoverable)
  - Detection: recordPermissionOutcome saves through trySave, which logs a failing save (existing test at chat-panel.test.ts:2729).
  - Response: The live chip is still shown and the queue still advances; the save failure is logged as today.
  - User impact: The restored session may lack that chip; the run continues.
- **The originating turn ends with an error after raising some requests.** (recoverable)
  - Detection: onTerminal receives kind 'error' for the batch's turn.
  - Response: The batch is marked ended like a done turn; the user still decides the queued requests and the follow-up runs (or the all-denied notice is shown).
  - User impact: An errored turn does not strand its approval requests.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A turn raises exactly one tool-gate request with a captured command. | One card with no '1 of N'; on Approve the follow-up prompt is exactly 'Approved — run exactly this now: <command>' with allowedTools [tool] (plus earlier grants in the chain); unchanged from today. |
| A turn raises exactly one dir-block request and it is approved. | Today's informational message is posted, an approved chip is recorded, no grant is added and no follow-up runs. |
| Three requests in one turn; the user decides the first before the turn has ended. | The second card is shown after the first is decided; the follow-up waits for both the remaining decisions and the turn's end. |
| All requests in a batch are denied. | One rejected chip per request, no follow-up turn, and an informational message that no action was approved. |
| The user types a new message while requests are still queued. | Undecided in-turn requests are first denied to their live provider with decide(..., 'deny') (so the new turn is not left waiting on a blocked process for the session lease); then each undecided request is recorded as rejected (visible chips) and removed, the grant chain is reset, and the user's message runs as a normal turn. |
| The follow-up turn itself is refused again (raises new requests). | They form the next batch and are asked one at a time; the grant chain from the previous batch is kept and passed with that batch's follow-up. |
| The same tool (e.g. Edit) is approved twice in one batch with different commands. | The grant chain holds the tool once; the follow-up prompt lists both approved actions. |
| A live-turn provider (codex / control protocol) raises two requests in one turn. | Only the first card is shown; its decision is relayed with decide() before the second is shown; no follow-up turn is ever started for live-turn requests. |
| The user switches session or closes the panel with requests queued. | The queue is dropped without outcome rows (the cards were live-only); the other session shows no stray cards. |
| An in-turn provider request that carries a toolName (control-protocol can_use_tool / codex). | Routed by resolution 'in-turn': relayed with decide(), never held for a batch follow-up. |
| The webview reloads (hide/show) while requests are queued. | postInitialState re-posts the head card with its position; deciding it continues the queue. |
| A turn followed after a window reload raises approval requests. | They go through the queue like a live turn's; the followed turn's terminal event or onEnd ends the batch. |
| The user presses Stop with requests queued. | Each undecided request is recorded as rejected and the queue is cleared; no follow-up runs. |
| A fourth request arrives while card 1 of 3 is shown. | No second card; the shown card updates in place to '1 of 4'. |

**Invariants to preserve**

- An approval-request is live-only: it is never written to the transcript and never replayed on restore; only decided outcomes persist, as role:'permission-outcome' rows. [[c3]]
- Exactly one permission-outcome per decided request, recorded through recordPermissionOutcome, in the order decided. [[c1]]
- A dir-block approval never re-runs or grants anything; it posts the informational message. [[c1]]
- A synthetic follow-up never echoes a user bubble (suppressEcho). [[c1]]
- A decision for an id the host does not hold is relayed to the live adapter's decide(), which no-ops on unknown ids (codex / in-turn relay unchanged). [[c1]]
- turns.start keeps newest-message-wins for user-typed turns; the queue only ensures no approval starts a second follow-up while one is running. [[c2]]
- Whenever an in-turn request is recorded as rejected while its turn is still live, the provider is told with decide(..., 'deny'): a chip never says rejected while the provider still waits for an answer (turns.start does not kill the previous process; the new turn waits for its lease). [[c2]]

## 6. Test strategy

**Test framework:** `node:test via tsx (vscode-plugin: tsx --test 'src/**/__tests__/*.test.ts'), assert/strict, the chat-panel test harness with a fake provider registry and a fake webview channel as in vscode-plugin/src/chat/__tests__/chat-panel.test.ts`

**Test levels**

- **unit** — The approval queue's ordering, head-only actionability, batch completion and grant chain, without a webview.
  - Subjects: `approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused`, `approval queue: a batch is complete only when its turn has ended and every request is decided`, `approval queue: the grant chain accumulates approved tool names once each and resets on clear()`
  - Fixtures: `in-memory queue built from three approval-request events of one turn`
- **integration** — The chat host end to end with a fake claude provider that raises several refused tool calls in one turn, and a fake live provider.
  - Subjects: `three requests in one turn: only the first card is posted (with '1 of 3'); the second is posted only after the first is decided; a decision on a waiting card's id does nothing`, `approving all three starts exactly one follow-up turn, after the last decision and the turn's end, with allowedTools = all three tools and a prompt naming the three approved actions`, `no approval ever supersedes a running follow-up: turns.start is called once per batch`, `deny: a denied request gets a rejected chip, the next request is still asked, and the follow-up names it as denied; all denied -> no follow-up and an informational message`, `outcome rows: one role:'permission-outcome' row per decision, in decision order, and no approval-request rows (restore shows only chips)`, `a follow-up that is refused again forms the next batch and its follow-up carries the previous batch's grants`, `a user-typed message while requests are queued records each as rejected, clears the queue, resets the grant chain and runs as a normal turn`, `live-turn provider with two requests: decide() is called for the first before the second card is posted; no follow-up turn is started`, `single request: the existing approve/deny/exact-command/tool-name/dir-block/suppressEcho tests keep passing unchanged`, `an in-turn request that carries a toolName is relayed with decide(), not batched (routing by resolution)`, `reloading the webview while requests are queued re-posts the head card, and deciding it continues the queue`, `a turn followed after reload routes its approval-requests through the queue and its end ends the batch`, `Stop with requests queued records each as rejected and clears the queue`, `a request joining the queue while the head is shown updates the shown card in place (one card per requestId)`, `a live provider with a queued in-turn request, then the user types a message: decide(turnId, requestId, 'deny') is called before the new turn starts, and the request gets a rejected chip`
  - Fixtures: `fake claude provider scripting a turn with three permission_denied approval-requests then done`, `fake live provider recording decide() calls`
- **unit** — The approval card shows the queue position.
  - Subjects: `approval renderer: with position/total and total > 1 the card shows '1 of 3'; without them it renders exactly as before`
- **unit** — The adapters mark where a request is answered.
  - Subjects: `claude permission_denied emits resolution 'turn-ended'; control-protocol and codex approval requests emit resolution 'in-turn'`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `three requests in one turn: only the first card is posted (with '1 of 3'); the second is posted only after the first is decided; a decision on a waiting card's id does nothing`, `approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused`, `reloading the webview while requests are queued re-posts the head card, and deciding it continues the queue`, `a request joining the queue while the head is shown updates the shown card in place (one card per requestId)` |
| `ac2` | `approving all three starts exactly one follow-up turn, after the last decision and the turn's end, with allowedTools = all three tools and a prompt naming the three approved actions`, `no approval ever supersedes a running follow-up: turns.start is called once per batch`, `a turn followed after reload routes its approval-requests through the queue and its end ends the batch` |
| `ac3` | `deny: a denied request gets a rejected chip, the next request is still asked, and the follow-up names it as denied; all denied -> no follow-up and an informational message`, `a user-typed message while requests are queued records each as rejected, clears the queue, resets the grant chain and runs as a normal turn`, `Stop with requests queued records each as rejected and clears the queue`, `a live provider with a queued in-turn request, then the user types a message: decide(turnId, requestId, 'deny') is called before the new turn starts, and the request gets a rejected chip` |
| `ac4` | `a follow-up that is refused again forms the next batch and its follow-up carries the previous batch's grants`, `approval queue: the grant chain accumulates approved tool names once each and resets on clear()` |
| `ac5` | `live-turn provider with two requests: decide() is called for the first before the second card is posted; no follow-up turn is started`, `an in-turn request that carries a toolName is relayed with decide(), not batched (routing by resolution)`, `claude permission_denied emits resolution 'turn-ended'; control-protocol and codex approval requests emit resolution 'in-turn'` |
| `ac6` | `outcome rows: one role:'permission-outcome' row per decision, in decision order, and no approval-request rows (restore shows only chips)`, `single request: the existing approve/deny/exact-command/tool-name/dir-block/suppressEcho tests keep passing unchanged` |

## 7. Migration

**State before:** Each approval-request of a turn is recorded in pendingPerms and posted at once as a live card (chat-panel.ts:166, :647-659, :514); every card is actionable; each Approve immediately runs its own follow-up with only that tool allowed, and turns.start's newest-message-wins supersedes a running follow-up (turn-lifecycle.ts:221, :331-333). Live-turn requests are relayed to decide() as clicked.

**State after:** Approval requests go through a host-side queue: only the head is posted (with '1 of N'), decisions are accepted only for the head, ended-turn batches run one follow-up after the last decision with the accumulated grant chain and a prompt naming approved and denied actions, and live-turn decisions are relayed one at a time. Persisted outcome rows are unchanged in shape and stay one per decision in order.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the approval queue module (ordering, head, batch completion, grant chain) with its unit tests; nothing uses it yet. — ↩ rollbackable
2. Mark each approval-request with its resolution in the adapter (permission_denied -> turn-ended; control-protocol / codex -> in-turn). — ↩ rollbackable
3. Route approval-request events through the queue in both runTurn's TurnSink and followLiveTurn's FollowSink, posting only the head; end the batch on the turn's terminal event or the followed turn's onEnd; clear on Stop, drop on detach. — ↩ rollbackable
4. Rewrite the permission-decision handler to act only on the head, record the outcome, relay live-turn decisions, present the next request, and start one follow-up per completed ended-turn batch with the grant chain and the combined prompt (single-request prompts unchanged). — ↩ rollbackable
5. On a user-typed submit, deny every undecided in-turn request to its live provider with decide(..., 'deny'), then record the undecided requests as rejected, clear the queue and reset the grant chain; drop the queue on session switch / panel close. — ↩ rollbackable
6. Add the optional position/total to the approval card meta, the approval-position in-place update message, and re-post the head card from postInitialState on every 'ready'. — ↩ rollbackable
7. Add the multi-request integration tests; keep every existing single-request approval test passing unchanged. — ↩ rollbackable

**Backward compat:** Internal to the VS Code plugin. Persisted sessions are unchanged: approval-request was never persisted and permission-outcome rows keep their shape, so sessions saved before the change restore exactly as before. The webview message gains only optional fields; a single-request turn behaves byte-for-byte as today.

## 8. Alternatives considered

### 8.1 a1: Host queue, one serialized follow-up per approval

The host queues a turn's approval requests, shows only the head, and on each Approve runs a follow-up turn with all grants so far, presenting the next request only after that follow-up ends.

Replace pendingPerms with an ordered host-side approval queue (requestId, toolName, command?, blockKind, source: ended-turn | live-turn). Only the head is posted to the webview as an actionable card; the others are held host-side and announced as a count ('1 of N'). A decision is accepted only for the head's requestId. On Approve of an ended-turn request the host runs ONE follow-up turn (runTurn) with allowedTools = every tool approved so far in this session, and does not present the next request until that follow-up's onTerminal; requests the follow-up raises are appended to the queue. Deny records a rejected outcome and presents the next request. Live-turn requests are relayed with decide() and the next is presented once the relay returns.

**Rejected because:** Meets the core sequencing but costs N model round-trips and re-raises requests already in the queue, which weakens fi4 and fi7.

### 8.2 a2: Host queue, decide all first, then one combined follow-up — **CHOSEN**

The host queues the requests and asks them one at a time; once every request from the ended turn is decided it runs a single follow-up turn that pre-allows every approved tool and tells the model which actions were approved and which denied.

Same ordered host-side approval queue and head-only presentation as a1, with the decision accepted only for the head. For requests from a turn that ENDED on denial (claude), each decision is recorded (outcome chip, persisted in decision order) and the next request is presented immediately; nothing runs until the queue for that turn is empty. Then exactly one follow-up turn runs with allowedTools = all tools approved so far in the session (accumulated), and a prompt that lists the approved actions (exact commands where captured) to run now and the denied ones not to attempt. If every request was denied, no follow-up runs and a short notice says so. Live-turn requests (codex / control protocol) are relayed one at a time with decide(); the next is presented after the relay. A dir-block approval keeps today's informational response and contributes no grant.

### 8.3 a3: Webview gating only

Render every card but enable only the first in the webview, and serialize runTurn calls host-side.

Keep pendingPerms and the per-approval follow-up. The webview renders all cards but enables buttons only on the oldest undecided one; the host chains each approval's runTurn after the previous follow-up finishes instead of letting turns.start supersede it.

**Rejected because:** Still shows every card at once (the reported stream), leaves grants un-accumulated and gives deny no defined effect.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts pendingPerms (:166), runTurn sink (:603-680), permission-decision handler (:794-849), recordPermissionOutcome (:214)`
- **[[c2]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts start (:221) newest-message-wins supersede (:331-333), live (:494)`
- **[[c3]]** `code` `vscode-plugin/src/chat/stream-events.ts approval-request / permission-outcome; markers.ts:84/139 (approval-request live-only)`
- **[[c4]]** `code` `vscode-plugin/src/chat/render-registry.ts:444-459 approval card; chat-panel.ts:514 webview approval-request render`
- **[[c5]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts single-request approval tests (:1575-2080, :2729)`
- **[[c6]]** `prior-artifact` `ISSUE-6a811b8acca60ac5 (approved 2026-10-12): fix intent fi1-fi8`
- **[[c7]]** `code` `vscode-plugin/src/chat/cli-adapter.ts claude permission_denied -> approval-request per line; pendingByTurn (:775-777) for decide()`
- **[[c8]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:304-320 normalizeApprovalEvent (toolName from APPROVAL_TOOL_KEYS), :612-625 control-protocol branch, :513-540 permission_denied branch`
- **[[c9]]** `code` `vscode-plugin/src/chat/chat-panel.ts:247-272 followLiveTurn sink and postInitialState (run on every ready); turn-lifecycle.ts:292/309 start returns without onTerminal when superseded, aborted or detached`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-12T05:47:20.480Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
