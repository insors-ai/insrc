<!-- insrc:artifact LLD-f9563bf5bbb29c43-s4 -->

# LLD: E20260926f9563bf5:S004

**Epic:** `vs-code-editor-dev-chat-ui`
**HLD base run:** `wf-1790428640052-v7rbx8`
**HLD effective hash:** `8417b84c742c...`

## HLD context

**Framework:** S004 fills sc2's approval event + permission-decision message and adds a CLI permission-mode seam on the adapter spawn, plus an approval-card renderer and the auto-mode status indicator; inline nonce'd CSP (k1), plain replayable transcript (k4), additive contract (k2), CLI flags no REST (k3).
**Rollout phase:** Phase D — approvals & auto-mode
**Consumes:** `undefined` (undefined), `undefined` (undefined)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Owns the two foundations + tool-command + session-title. — owns `sc1`, `sc2`
- `s2`: Shell chrome over stable element ids incl. the status bar + edit-mode select.
- `s3`: Concrete message/widget renderers registered into sc1.

## Contract details

**Surface level:** internal-shared

### `ProviderMapper.buildArgs`

```typescript
buildArgs(req: TurnRequest): string[]
```

**Parameters:**
- `req: TurnRequest` — The turn request, now carrying an optional permissionMode the mapper reads to choose permission flags.

**Returns:** `string[]` — argv for the spawn; review mode adds claude --permission-prompts host, auto mode adds claude --permission-mode bypassPermissions / codex --dangerously-bypass-approvals-and-sandbox. Existing base args unchanged when permissionMode is undefined.

**Preconditions:**
- permissionMode, if present, is 'review' or 'auto'.

**Postconditions:**
- When permissionMode is undefined the argv is byte-identical to today's (k2).
- auto mode never yields a host-answered flag; review mode never yields a bypass flag.

### `ProviderMapper.mapLine`

```typescript
mapLine(line: string, turnId: string, state: TurnState): TurnEvent[]
```

**Parameters:**
- `line: string` — One native stdout line; a permission-request control line is now recognized.
- `turnId: string` — Correlates emitted events to the active turn.
- `state: TurnState` — Per-turn mutable state (unchanged).

**Returns:** `TurnEvent[]` — A permission line maps to one ApprovalRequestEvent{kind:'approval-request',turnId,requestId,title,detail,toolName?}; existing mappings unchanged.

**Errors:**
- `Error` when An unparseable line still throws, as today.

**Preconditions:**
- The line is a decoded NDJSON line from the provider.

**Postconditions:**
- Non-permission lines map exactly as before (k2).
- A recognized permission line yields exactly one ApprovalRequestEvent with a provider-stable requestId.

### `StreamAdapter.decide`

```typescript
decide(turnId: string, requestId: string, decision: 'approve' | 'deny'): void
```

**Parameters:**
- `turnId: string` — Live turn whose CLI process receives the decision.
- `requestId: string` — The permission request being answered (correlation key).
- `decision: 'approve' | 'deny'` — The user's choice to relay.

**Returns:** `void` — Looks up the live pending entry; if present, formats+writes the provider control response via write() and clears it; absent/stale => no-op.

**Preconditions:**
- A pending request was registered for requestId when the event was emitted.

**Postconditions:**
- Unknown/stale/dead requestId writes nothing.
- At most one control response per requestId.
- Pending requests auto-cleaned on cancel()/exit — no dangling card.

### `SpawnedProcess.write`

```typescript
write?(data: string): void
```

**Parameters:**
- `data: string` — A native control line to the CLI subprocess stdin.

**Returns:** `void` — Writes to child stdin (production wraps child.stdin.write; fake spawner records it).

**Preconditions:**
- The process is still alive.

**Postconditions:**
- Optional+additive: impls omitting write() still compile (k2).
- Only review-mode relay uses it; auto never calls it.

### `markerFor`

```typescript
markerFor(event: TurnEvent): TranscriptMarker | null
```

**Parameters:**
- `event: TurnEvent` — The new ApprovalRequestEvent member must be handled so the never-check compiles.

**Returns:** `TranscriptMarker | null` — null for 'approval-request' (live-only, k4); existing kinds unchanged.

**Preconditions:**
- event.kind is a member of TURN_EVENT_KINDS.

**Postconditions:**
- Exhaustiveness never-check still compiles.
- No transcript marker for approval-request (k4).

## Data model changes

### `ApprovalRequestEvent` — new

New TurnEvent union member realizing sc2's reserved shape {kind:'approval-request',turnId,requestId,title,detail,toolName?}; kind already in TURN_EVENT_KINDS; forces markerFor null case.

```
+ interface ApprovalRequestEvent { readonly kind:'approval-request'; readonly turnId:string; readonly requestId:string; readonly title:string; readonly detail:string; readonly toolName?:string }
  type TurnEvent = ... | ApprovalRequestEvent;
```

**Call sites:**
- `src/chat/stream-events.ts`
- `src/chat/cli-adapter.ts`
- `src/chat/chat-panel.ts`

### `PermissionMode` — new

Shared type 'review'|'auto' consumed by host buildArgs + webview status-bar.

```
+ type PermissionMode = 'review' | 'auto';
```

**Call sites:**
- `src/chat/protocol.ts`
- `src/chat/cli-adapter.ts`
- `src/chat/chat-panel.ts`

### `PermissionDecisionMsg` — new

WebviewToHost {type:'permission-decision',requestId,decision,scope?} added to WEBVIEW_TO_HOST_TYPES; dispatched to decide().

```
+ interface PermissionDecisionMsg { readonly type:'permission-decision'; readonly requestId:string; readonly decision:'approve'|'deny'; readonly scope?:'once'|'session' }
  WEBVIEW_TO_HOST_TYPES += 'permission-decision'
```

**Call sites:**
- `src/chat/protocol.ts`
- `src/chat/chat-panel.ts`

### `SetPermissionModeMsg` — new

WebviewToHost {type:'set-permission-mode',mode} added to WEBVIEW_TO_HOST_TYPES; stored per-session for next turn's buildArgs.

```
+ interface SetPermissionModeMsg { readonly type:'set-permission-mode'; readonly mode:PermissionMode }
  WEBVIEW_TO_HOST_TYPES += 'set-permission-mode'
```

**Call sites:**
- `src/chat/protocol.ts`
- `src/chat/chat-panel.ts`

### `TurnRequest.permissionMode` — field-add

Additive optional field; undefined preserves today's argv exactly.

```
  interface TurnRequest { ...; readonly permissionMode?: PermissionMode }
```

**Call sites:**
- `src/chat/cli-adapter.ts:35-53`
- `src/chat/cli-adapter.ts:141`
- `src/chat/cli-adapter.ts:204-207`

### `SpawnedProcess.write` — field-add

Additive optional method; existing impls/tests omitting it compile (exactOptionalPropertyTypes-safe).

```
  interface SpawnedProcess { ...; write?(data: string): void }
```

**Call sites:**
- `src/chat/cli-adapter.ts:63-76`

### `RenderRegistry 'approval' renderer` — new

Registers a renderer for the already-reserved RowKind 'approval' (icon-only approve/deny, textContent/className, nonce'd). sc1 RowKind/toViewModel UNCHANGED — event->row routing in S004's live handler.

```
  reg.register('approval', approvalCardRenderer)
```

**Call sites:**
- `src/chat/render-registry.ts`
- `src/chat/chat-panel.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Registers an 'approval'-kind renderer into the existing RenderRegistry; does NOT modify sc1 RowKind/toViewModel (s1-owned). Event->row mapping in S004's live handler, mirroring S003's render-time a1. Inline DOM via textContent/className (k1). |
| `sc2` | consumes | Realizes sc2's HLD-sketched reserved members (s1-owned): ApprovalRequestEvent union member (kind already in TURN_EVENT_KINDS), PermissionDecisionMsg + SetPermissionModeMsg + PermissionMode. Strictly additive (k2); markerFor gains an 'approval-request'->null case (k4). No removals/renames, so no HLD amendment. |

## Error paths

### Error cases

- **A permission-decision message arrives for a requestId that has no live pending entry (turn ended, process exited, or already answered/duplicate click).** (recoverable)
  - Detection: StreamAdapter.decide looks up (turnId,requestId) in the pending-request registry and finds no entry (or one already resolved).
  - Response: No-op: nothing written to CLI stdin; the stale decision is dropped at the seam. Optionally warn-logged.
  - User impact: None — a double-click or late click cannot corrupt CLI state.
- **The CLI process for a turn exits or is cancelled while permission requests are still outstanding.** (recoverable)
  - Detection: The run() loop observes proc.exit resolving / cancel() with non-empty pending entries for that turn.
  - Response: Auto-clean the pending registry, reset any live card, post the terminal done/error (S002 stop-reset hygiene).
  - User impact: No dangling unanswerable card after the turn ends; chat returns to idle.
- **A permission control line is malformed or missing the requestId needed to correlate a later decision.** (recoverable)
  - Detection: The mapper's permission-request branch parses the line and finds no usable requestId (parse fails or field absent).
  - Response: Unparseable line throws (as today); a parseable-but-idless line yields [] (no card).
  - User impact: No orphaned uncorrelatable card.
- **review mode active but the process cannot accept a decision write (write() undefined, or stdin closed).** (recoverable)
  - Detection: decide() checks for proc.write before calling; a closed-stdin write throws, caught around the write.
  - Response: Skip/absorb + warn; clear the pending entry so the card is not left live.
  - User impact: Rare misconfig: decision undeliverable but UI does not hang; turn can still terminate.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Multiple permission requests in one turn. | Each registered under its own requestId + own card; answered in any order without confusion. |
| Mode changed mid-turn. | Status-bar updates immediately; the change applies to the NEXT turn's buildArgs, not the in-flight spawn. |
| permissionMode undefined. | buildArgs = today's argv (review-equivalent default); ~211 tests unchanged (k2). |
| approval-request replayed/restored. | Live->approval renderer; restore->no marker was written (k4), card never reappears; appendKeyed/resetKeys unaffected. |
| auto mode selected. | buildArgs emits bypass flag; CLI emits no permission requests; status bar shows 'auto'. |

### Invariants to preserve

- TurnEvent+protocol stays additive/non-breaking; undefined permissionMode => byte-identical argv; ~211 tests green. [[c4]]
- Durable transcript stays plain/replayable; approval cards + mode are live-only (markerFor null), never persisted. [[c1]]
- All webview assets inline under nonce'd CSP; textContent/className only; no external fetch. [[c1]]
- Decisions + mode travel host<->adapter<->CLI over local stdio+flags only; no cloud REST. [[c5]]
- ProviderMapper stays the ONLY place a provider difference lives. [[c4]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test 'src/chat/**/__tests__/*.test.ts'` (fake-spawner unit tests + eval'd *WebviewSource() factories against a fake document; live suites gated behind INSRC_LIVE_TESTS)`

### Test levels

- **unit** — Cover each seam in its owning suite with the fake spawner + eval'd factories, no live CLI.
  - Subjects: `stream-events.test.ts: ApprovalRequestEvent valid; TURN_EVENT_KINDS unchanged; markerFor null + never-check compiles.`, `protocol.test.ts: permission-decision + set-permission-mode in WEBVIEW_TO_HOST_TYPES; existing roundtrips unchanged.`, `cli-adapter.test.ts: buildArgs review vs auto flags + undefined==today; mapLine maps scripted permission line to one ApprovalRequestEvent; decide records correct write / no-ops stale; pending cleaned on cancel/exit.`, `render-registry.test.ts: 'approval' renderer builds icon-only approve/deny via className/textContent (no innerHTML) with click listeners.`, `chat-panel.test.ts: html has status-bar mode control; mode change posts set-permission-mode; card click posts permission-decision; live approval-request routed to approval renderer.`
  - Fixtures: `Fake SpawnedProcess scripting permission lines + recording write() calls.`, `Scripted claude/codex permission-line samples.`, `Fake document (createElement recorder).`
- **live** — Confirm real CLIs emit approvable prompts + accept host-answered decisions/flags (lc1 end-to-end; flags spiked at 7100435).
  - Subjects: `INSRC_LIVE_TESTS-gated claude -p --permission-prompts host + written decision; auto bypass; codex exec --json equivalent.`
  - Fixtures: `Installed claude + codex CLIs (skips when INSRC_LIVE_TESTS unset).`
- **contract** — Guard additive/non-breaking against the ~211-test contract.
  - Subjects: `Full chat suite green; tsc clean (optional write?/permissionMode?).`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `cli-adapter.test.ts: scripted permission line -> one ApprovalRequestEvent.`, `render-registry.test.ts: approval renderer builds approve/deny card.`, `chat-panel.test.ts: live approval-request routed to the renderer.` |
| `ac2` | `chat-panel.test.ts: card click posts permission-decision{requestId,decision}.`, `cli-adapter.test.ts: decide records correct control write; no-ops for unknown/stale requestId.` |
| `ac3` | `cli-adapter.test.ts: auto buildArgs emits bypass flag; undefined==today.`, `chat-panel.test.ts: status-bar posts set-permission-mode + html indicates active mode.` |

## Migration

**State before:** run() spawns with fixed per-provider buildArgs (no permission flags); SpawnedProcess has no write channel so a permission prompt is effectively silently blocked; TurnEvent has no approval member ('approval-request' reserved in TURN_EVENT_KINDS only); protocol.ts has no permission-decision/set-permission-mode; render-registry.ts reserves RowKind 'approval' with no renderer; chat-panel .statusbar has '✓ idle' + edit-mode select only. (cli-adapter.ts:35-53/63-76/141/204-207/278-297; stream-events.ts; protocol.ts; render-registry.ts; chat-panel.ts)

**State after:** buildArgs reads permissionMode (review/auto flags; undefined=today); mapLine emits ApprovalRequestEvent + adapter registers pending entries; SpawnedProcess.write + StreamAdapter.decide relay decisions with cleanup on cancel/exit; markerFor null for approval-request; protocol gains the two messages + PermissionMode; render-registry registers the approval renderer; chat-panel routes the live event, posts decisions, and gains an auto/review status-bar control. Nothing new persisted (k4).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add PermissionMode + ApprovalRequestEvent union member + markerFor null case (stream-events.ts). Additive. — ↩ rollbackable
2. Add permission-decision + set-permission-mode to WebviewToHost + WEBVIEW_TO_HOST_TYPES (protocol.ts). Additive. — ↩ rollbackable
3. Add optional write?() to SpawnedProcess + wire production SpawnFn; extend fake spawner to record writes + script permission lines. — ↩ rollbackable
4. Add optional permissionMode to TurnRequest; buildArgs appends review/auto flags; undefined => today's argv. — ↩ rollbackable
5. Extend mapLine with a permission-request branch emitting ApprovalRequestEvent + add the pending-request registry (register on emit; decide resolves+writes; auto-clean on cancel/exit). — ↩ rollbackable
6. Register the inline icon-only 'approval' renderer in render-registry.ts webview source (className/textContent, nonce'd). — ↩ rollbackable
7. In chat-panel.ts route the live approval-request to the renderer + wire buttons to post permission-decision; add the .statusbar auto/review control posting set-permission-mode + a mode seg; add handleMessage cases (permission-decision->decide; set-permission-mode->store per-session, apply next turn). — ↩ rollbackable
8. Extend the five chat suites; run full chat suite + tsc locally to confirm green. — ↩ rollbackable

**Backward compat:** All changes additive. TurnRequest.permissionMode + SpawnedProcess.write are OPTIONAL (exactOptionalPropertyTypes-safe): existing callers/spawners omitting them compile and behave as today; buildArgs undefined => byte-identical argv. ApprovalRequestEvent is a new union member (kind already whitelisted); existing kinds unchanged; markerFor stays exhaustive. Two new protocol messages are additive union members. StreamAdapter.decide is a new method; existing consumers unaffected. ~211 existing chat tests stay green (k2).

## Alternatives considered

### a1: Fire-and-forget write seam + StreamAdapter.decide()

Add an additive optional write() to SpawnedProcess and a StreamAdapter.decide(turnId,requestId,decision) that formats the provider control line and writes it to the running CLI's stdin.

SpawnedProcess gains an ADDITIVE optional write(). StreamAdapter.decide formats+writes the native control response; mapLine emits ApprovalRequestEvent; the run-loop keeps streaming; buildArgs reads permissionMode. requestId is the sole correlation key with no adapter-side pending state.

### a2: Awaited pending-request registry inside the adapter — **CHOSEN**

The adapter holds a Map<requestId, resolver>; on a permission line it emits the event and parks that request until decide() resolves, then writes the native response.

Same sc2 shapes + additive write() as a1, but the adapter registers a pending entry per requestId; decide() looks it up, writes the response, resolves+clears; unknown/stale ids dropped; entries cleaned on cancel/exit.

### a3: No live channel — decision folded into a re-spawn via resume/flags

Avoid any stdin write seam: on a permission request, cancel and re-spawn the turn with the decision expressed as allow/deny CLI flags.

Keep SpawnedProcess unchanged; on a permission line emit the event, then kill()+re-spawn via resume with the decision folded into --allowed-tools/--disallowed-tools. buildArgs still carries permissionMode for auto.

## Open questions

- The precise claude stream-json permission control-line schema + codex approval-item schema (field names for requestId/title/detail) are confirmed to EXIST by the 7100435 spike but must be pinned against the installed CLI versions during build; unit tests use scripted samples and the INSRC_LIVE_TESTS suite validates the real shape.
- Whether scope:'session' auto-answer is wired in this Story or deferred: the a2 registry supports it, but ac1-ac3 only require per-request approve/deny — recommend building the 'once' path and leaving 'session' as an optional field the registry can honour later.

## Resolved questions

- `qee8aadf4` — The precise claude stream-json permission control-line schema + codex approval-item schema (field names for requestId/title/detail) are confirmed to EXIST by the 7100435 spike but must be pinned against the installed CLI versions during build; unit tests use scripted samples and the INSRC_LIVE_TESTS suite validates the real shape.
  - **resolved**: Normalizing adapter over field aliases — Keeps one internal ApprovalRequest type behind each ProviderMapper (upholds the 'provider difference lives only in the mapper' invariant), survives a cosmetic CLI field rename, and raises a typed parse error on genuinely unknown shapes; paired with fixtures captured from the installed CLIs so the INSRC_LIVE_TESTS suite has a concrete diff target. _(2026-09-26T16:36:09.642Z)_
- `q1b9abdd3` — Whether scope:'session' auto-answer is wired in this Story or deferred: the a2 registry supports it, but ac1-ac3 only require per-request approve/deny — recommend building the 'once' path and leaving 'session' as an optional field the registry can honour later.
  - **resolved**: Once-only, scope field accepted but inert — Satisfies ac1-ac3 exactly and stays inside the Story boundary; the scope field is parsed/persisted by the a2 registry but no prompt is short-circuited, keeping the decision wire shape stable so a later story adds the 'session' auto-answer without a breaking change. _(2026-09-26T16:36:39.905Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle: sc2 reserved shapes (stream-events.ts TurnEvent + TURN_EVENT_KINDS + markerFor never-check)` — "S001 added the string 'approval-request' to TURN_EVENT_KINDS but deliberately did NOT add a union member ... markerFor must handle 'approval-request' ... return null, consistent with k4"
- **[[c2]]** `analyze-bundle` `s1 bundle: cli-adapter spawn/stream seam (cli-adapter.ts:63-76/141/204-207/278-297)` — "SpawnedProcess exposes ONLY lines()/stderr()/exit/spawnError/kill() — there is NO stdin write channel ... add an ADDITIVE optional write(data:string):void"
- **[[c3]]** `analyze-bundle` `s1 bundle: sc1 RenderRegistry 'approval' renderer + chat-panel routing (render-registry.ts, chat-panel.ts)` — "RowKind already reserves 'approval' ... register an approval-card renderer ... do NOT touch sc1 toViewModel (render-time routing in S004's live handler, mirroring S003 a1)"
- **[[c4]]** `code` `verified headless CLI flags spike, commit 7100435` — "claude -p --permission-prompts host / none; --permission-mode bypassPermissions|acceptEdits|manual; codex --dangerously-bypass-approvals-and-sandbox + --json"
- **[[c5]]** `stakeholder` `Epic constraint k6-i / mocks.html` — "tool-permission requests surface in-chat as an approve/deny card and the chosen auto/review mode shows in the status bar"
- **[[c6]]** `analyze-bundle` `s1 bundle: test.locate (five chat suites, ~211 tests)` — "the fake spawner must be extended to record write() calls for the decision-relay assertion"
