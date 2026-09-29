<!-- insrc:artifact LLD-2d9e9e694a94116b-s1 -->

# LLD: E202609292d9e9e69:S001

**Epic:** `lld-dev-chat-approve-bugfix-1`
**HLD base run:** `wf-1790668327465-r1f3aw`
**HLD effective hash:** `707006cbcfe4...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `claudeMapper.mapLine (permission_denied handler)`

```typescript
mapLine(line: string, turnId: string, state: TurnState): TurnEvent[]  // the system/permission_denied branch, reshaped
```

**Parameters:**
- `line: string` — One native stdout NDJSON line; the system/permission_denied envelope carries tool_name, tool_use_id, message — and (when the provider supplies it) a command/input.

**Returns:** `TurnEvent[]` — For a permission_denied line, one approval-request event now additionally carrying an optional `command` (harvested from the line's command/input fields when present) so the host can re-issue a concrete retry. Unchanged otherwise.

**Preconditions:**
- The line is a valid system/permission_denied envelope (existing guard at cli-adapter.ts:262).

**Postconditions:**
- command is set on the event only when the line actually carries one; absent → event is byte-compatible with today (title/detail/toolName unchanged).

### `approval-request TurnEvent (stream-events.ts)`

```typescript
{ kind: 'approval-request'; turnId: string; requestId: string; title: string; detail: string; toolName?: string; command?: string }
```

**Parameters:**
- `command: string | undefined` _(optional)_ — NEW optional: the exact command the blocked tool was about to run (e.g. the Bash command), so Approve re-issues a concrete retry rather than a vague nudge.

**Returns:** `TurnEvent` — The approval card request; still live-only (markerFor maps approval-request to null, never persisted — k4).

**Postconditions:**
- Additive: existing producers/consumers that ignore command are unaffected; the codex path + non-command tools (edits/MCP) simply omit it.

### `classifyPermissionDenial (new pure helper)`

```typescript
function classifyPermissionDenial(detail: string): 'tool-gate' | 'dir-block'
```

**Parameters:**
- `detail: string` — The denial message. A CONSERVATIVE predicate marks a working-directory/sandbox-allowlist block ('may only ... in the allowed working directories' / 'allowed working directories for this session') as 'dir-block'; everything else is 'tool-gate' (the safe default).

**Returns:** `'tool-gate' | 'dir-block'` — The coarse denial category driving the Approve branch. Deterministic; no provider call.

**Postconditions:**
- A non-matching/unknown message returns 'tool-gate' (today's grant path) — a false negative degrades to current behaviour; the predicate must never mark a real tool-gate as 'dir-block'.

### `chat-panel permission-decision handler (grant branch)`

```typescript
// WebviewToHost 'permission-decision' handler, claude grant branch (chat-panel.ts:727-733) reshaped
```

**Parameters:**
- `msg: { type:'permission-decision'; requestId: string; decision:'approve'|'deny' }` — Unchanged webview message (protocol.ts:90-92). The host looks up the widened pendingPerms entry by requestId.

**Returns:** `void` — On Approve: for a 'tool-gate' entry → runTurn a CONCRETE retry naming the exact command (falling back to today's tool-name phrasing when no command was captured) with --allowedTools; for a 'dir-block' entry → post an informational message (the action needs the directory added to the session's allowed working dirs) and do NOT runTurn a grant. On Deny: unchanged (drop).

**Preconditions:**
- pendingPerms.get(requestId) resolves the claude grant entry; an unknown/stale requestId falls through to the codex decide() path unchanged (chat-panel.ts:739).

**Postconditions:**
- No silent sandbox widening: a dir-block informs, never runs a grant re-run.
- The codex/in-turn decide() branch and non-claude providers are untouched.

### `runTurn (reused, unchanged signature)`

```typescript
async function runTurn(text: unknown, allowedTools?: readonly string[]): Promise<void>
```

**Parameters:**
- `text: string` — The tool-gate Approve now passes a CONCRETE retry prompt built from the captured command (e.g. 'Run exactly this now: <command>') instead of the vague 'please proceed' nudge.

**Returns:** `Promise<void>` — Unchanged engine: pushes the prompt as a user turn, resumes the session, adds --allowedTools. Only its caller's text changes.

**Postconditions:**
- Signature unchanged; only the tool-gate Approve call site supplies a concrete-command prompt.

## Data model changes

### `approval-request TurnEvent (vscode-plugin/src/chat/stream-events.ts)` — field-add

Add an optional `command?: string` to the approval-request event so the exact blocked command can ride from the adapter to the host. Additive; the event is live-only (markerFor=null) so nothing persists. Producers that don't set it and consumers that ignore it are unaffected.

```
readonly kind:'approval-request'; ...; readonly toolName?: string;
+ readonly command?: string;
```

**Call sites:**
- `vscode-plugin/src/chat/stream-events.ts:64`
- `vscode-plugin/src/chat/cli-adapter.ts:262`
- `vscode-plugin/src/chat/chat-panel.ts:581`

### `pendingPerms value (vscode-plugin/src/chat/chat-panel.ts)` — field-modify

Widen the pendingPerms map value from the bare `toolName: string` to a small record `{ toolName: string; command?: string; blockKind: 'tool-gate' | 'dir-block' }`, populated at :581 from the approval-request event (command) + classifyPermissionDenial(detail) (blockKind). The decision handler reads it to branch. Internal to chat-panel; no external consumer.

```
- pendingPerms: Map<string, string>            // requestId -> toolName
+ pendingPerms: Map<string, { toolName: string; command?: string; blockKind: 'tool-gate' | 'dir-block' }>
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:581`
- `vscode-plugin/src/chat/chat-panel.ts:727`

### `buildArgs / --add-dir (cli-adapter.ts)` — invariant-change

NO argv change in the chosen design: a1 handles a dir-block by INFORMING (no grant re-run), so buildArgs keeps only the existing --allowedTools path (cli-adapter.ts:243) and the sandbox allowlist is never widened on a click. Recorded to make explicit that the rejected a2's --add-dir path is deliberately NOT built (the safety invariant: no silent sandbox widening).

```
(unchanged) buildArgs continues to add only --allowedTools; no --add-dir.
```

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts:243`

## Error paths

### Error cases

- **The claude permission_denied line carries no command field (the provider omits input/command), so the concrete retry has nothing to name.** (recoverable)
  - Detection: The command harvested by claudeMapper.permission_denied is undefined, so the approval-request event's command is unset and the pendingPerms entry's command is undefined.
  - Response: The tool-gate Approve falls back to today's tool-name phrasing (with --allowedTools) instead of a command-named retry — no worse than current behaviour; the model still gets a grant nudge.
  - User impact: For that provider-shape, Approve behaves as it does today (weak nudge) rather than the improved concrete retry; command-carrying denials (Bash) get the full fix.
- **classifyPermissionDenial misfires and marks a genuine tool-permission gate as a 'dir-block'.** (recoverable)
  - Detection: classifyPermissionDenial(detail) returns 'dir-block' for a message that is actually a tool gate — caught by the predicate's own test table (the false-positive assertions in cli-adapter.test.ts / chat-panel.test.ts).
  - Response: The predicate is deliberately narrow (matches only the specific 'allowed working directories' sandbox phrasing); a tool-gate that doesn't match falls to 'tool-gate' (the grant path). If it ever did misfire, the user gets an informational message instead of a grant — recoverable by re-asking.
  - User impact: A conservative classifier means the worst case is an occasional informational message where a grant would have worked; it never silently runs the wrong thing.
- **Approve arrives for a requestId with no pending claude grant entry (a stale, duplicate, or already-consumed card).** (recoverable)
  - Detection: pendingPerms.get(requestId) returns undefined in the permission-decision handler.
  - Response: Falls through to the existing codex/in-turn branch, whose decide() no-ops on an unknown/stale/dead requestId (chat-panel.ts:739) — unchanged safety.
  - User impact: A late or double click is a harmless no-op, exactly as today.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A non-command tool (Edit/Write/an MCP call) is permission_denied. | command is undefined → the tool-gate Approve uses the tool-name phrasing (today's text) with --allowedTools; the concrete-command path applies only when a command was captured. |
| The approval is on the codex provider (which answers in-turn). | No claude grant entry in pendingPerms → the handler relays via providers.get(activeProvider).decide(...) exactly as today; the new command/blockKind fields are not consulted. |
| A dir-block card is Denied (not Approved). | Deny drops the request (no runTurn, no informational post) — identical to a tool-gate Deny; only Approve branches on blockKind. |
| command is present but an empty string. | Treated as absent → falls back to the tool-name phrasing (an empty command is never injected into the retry prompt). |
| A dir-block card is Approved. | An informational message is posted (the action needs the directory added to the session's allowed working dirs); NO grant re-run is issued and the sandbox allowlist is not modified. |

### Invariants to preserve

- The approval-request event stays LIVE-ONLY — markerFor maps it to null so it never persists to the replayable transcript (k4); adding the optional command field does not change that, and the widened pendingPerms lives only in the host's in-memory map. [[c2]]
- The change is ADDITIVE for every path except the claude tool-gate Approve text: the codex/in-turn decide() branch (chat-panel.ts:739), non-command tools (edits/MCP), and the Deny path all behave byte-identically; the optional command field is ignored where unset. [[c1]]
- No sandbox widening on a click: buildArgs keeps ONLY the existing --allowedTools grant (cli-adapter.ts:243) and never adds --add-dir, so a dir-block Approve informs rather than expanding the session's allowed working directories. [[c3]]
- runTurn's signature and engine are unchanged (it still resumes the session + adds --allowedTools); only the tool-gate Approve call site supplies a concrete-command prompt instead of the vague nudge (chat-panel.ts:517/:731). [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test), the repo-wide convention — colocated vscode-plugin/src/chat/__tests__/*.test.ts; webview host code exercised via the eval'd *WebviewSource pattern; live CLI behaviour gated behind INSRC_LIVE_TESTS (live-cli.test.ts).`

### Test levels

- **unit** — Prove the adapter surfaces the blocked command + a correct denial classification, additively.
  - Subjects: `claudeMapper.mapLine: a system/permission_denied line carrying a command yields an approval-request event with command set (+ title/detail/toolName unchanged); a line WITHOUT a command yields the event with command undefined (byte-compatible with today).`, `classifyPermissionDenial: the sandbox 'allowed working directories' message → 'dir-block'; an ordinary tool-permission message → 'tool-gate'; an unknown/empty message → 'tool-gate' (conservative default); the false-positive table proves no real tool-gate is marked 'dir-block'.`, `stream-events.ts: the approval-request event admits the optional command field (event-kind shape) without disturbing the other kinds.`, `cli-adapter buildArgs: unchanged — still adds only --allowedTools, never --add-dir (the no-sandbox-widening invariant).`
  - Fixtures: `a permission_denied NDJSON line fixture WITH a command (Bash) and one WITHOUT`, `denial message fixtures: a working-dir/sandbox block, an ordinary tool gate, an empty/unknown message`
- **unit** — Prove the host permission-decision handler branches correctly on Approve/Deny across tool-gate, dir-block, missing-command, codex, and stale-request cases.
  - Subjects: `chat-panel permission-decision Approve, tool-gate WITH command: runTurn is called with a CONCRETE retry naming the exact command + --allowedTools (NOT the vague 'please proceed' nudge).`, `Approve, tool-gate WITHOUT command: runTurn falls back to today's tool-name phrasing with --allowedTools (no empty command injected).`, `Approve, dir-block: NO runTurn grant is issued; an informational message is posted; the sandbox allowlist/argv is not modified.`, `Deny (tool-gate or dir-block): the request is dropped — no runTurn, no informational post (unchanged).`, `codex/live-channel provider OR a stale/unknown requestId: falls through to providers.decide(...) exactly as today; the new command/blockKind fields are not consulted.`, `pendingPerms value carries { toolName, command?, blockKind } populated from the event + classifyPermissionDenial(detail).`
  - Fixtures: `a fake providers registry capturing runTurn args + decide() calls (the existing chat-panel test harness / eval'd WebviewSource)`, `approval-request events: tool-gate+command, tool-gate+no-command, dir-block; a codex approval; a stale requestId`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `claudeMapper.mapLine: a permission_denied line with a command yields an approval-request event with command set.`, `chat-panel Approve, tool-gate WITH command: runTurn is called with a concrete retry naming the exact command + --allowedTools (not the vague nudge).`, `chat-panel Approve, tool-gate WITHOUT command: runTurn falls back to the tool-name phrasing with --allowedTools.` |
| `ac2` | `classifyPermissionDenial: the sandbox 'allowed working directories' message → 'dir-block'; tool-gate/unknown → 'tool-gate' (conservative); false-positive table.`, `chat-panel Approve, dir-block: no runTurn grant; an informational message is posted; argv/allowlist not modified.` |
| `ac3` | `cli-adapter buildArgs unchanged — only --allowedTools, never --add-dir (no-sandbox-widening invariant).`, `chat-panel Deny (tool-gate or dir-block) drops the request unchanged; codex/stale requestId falls through to providers.decide(...) as today.`, `stream-events.ts: the approval-request command field is additive; other event kinds unaffected.` |

## Migration

**State before:** The claude permission_denied handler (cli-adapter.ts:262-266) emits an approval-request event carrying only { requestId, title, detail, toolName } — no command. chat-panel stores just the tool name (pendingPerms.set(requestId, toolName), :581), and on Approve runs the vague nudge runTurn(`Approved: please proceed with the ${grantTool} action...`, [grantTool]) (:731). There is no denial classification: a working-directory/sandbox-allowlist block is treated identically to a tool gate, and buildArgs (:243) only ever adds --allowedTools (no --add-dir). Net: Approve either fires a contextless nudge the model can't act on (tool gate) or offers a grant that can't work (dir block).

**State after:** The approval-request event gains an optional command (harvested from the permission_denied line when present); pendingPerms carries { toolName, command?, blockKind } where blockKind comes from a conservative classifyPermissionDenial(detail). On Approve: a tool-gate re-runs a CONCRETE retry naming the exact command (falling back to today's tool-name phrasing when no command was captured) with --allowedTools; a dir-block posts an informational message and issues NO grant. buildArgs is unchanged (no --add-dir), so the sandbox allowlist is never widened on a click. Every 2-arg/codex/non-command/Deny path is byte-identical.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the optional command field to the approval-request TurnEvent type (stream-events.ts) — a pure additive nullable field; no producer/consumer is required to set or read it. — ↩ rollbackable
2. In the claude permission_denied handler (cli-adapter.ts), harvest the command from the line's command/input fields when present and set it on the emitted approval-request event; leave it undefined otherwise (byte-compatible). — ↩ rollbackable
3. Add the pure classifyPermissionDenial(detail) helper with a conservative 'dir-block' predicate defaulting to 'tool-gate'. — ↩ rollbackable
4. Widen the pendingPerms map value to the { toolName, command?, blockKind } record and populate it where the approval-request event is registered (chat-panel.ts:581). — ↩ rollbackable
5. Branch the Approve path in the permission-decision handler on blockKind: tool-gate → concrete-command retry (or tool-name fallback) with --allowedTools; dir-block → informational post, no grant. Deny + the codex/stale fall-through unchanged. — ↩ rollbackable
6. Add the regression tests: adapter command-harvest + classifier table (cli-adapter.test.ts), event shape (stream-events.test.ts), and the host Approve/Deny branch matrix incl. tool-gate-with/without-command, dir-block, codex, stale (chat-panel.test.ts); confirm protocol.test.ts + the existing approval tests stay green. — ↩ rollbackable

**Backward compat:** Fully backward-compatible. The approval-request event's command is an OPTIONAL added field (unset producers/consumers unaffected); the pendingPerms value is host-internal (no external consumer) and its widening changes no public API. runTurn's signature is unchanged — only the tool-gate Approve call site's text differs. The codex/in-turn decide() branch, non-command tools (edits/MCP), and the Deny path all behave byte-identically. buildArgs keeps only --allowedTools (no new argv), so no CLI-invocation contract changes and the sandbox allowlist is never widened. The only behavioural delta is the intended one: a claude tool-gate Approve now re-runs the concrete command, and a dir-block Approve informs instead of no-oping.

## Alternatives considered

### a1: Command on the approval event (sourced from the denial line) + classify working-dir blocks and suppress an ungrantable grant — **CHOSEN**

Add an optional `command?` to the approval-request event, sourced from the permission_denied line's own fields; on Approve re-issue a concrete retry of that command for a tool-gate block, and for a working-directory/sandbox block render a non-grantable informational card telling the user to add the directory instead.

cli-adapter.ts claudeMapper.permission_denied harvests the command from the raw line (the normalizeApprovalEvent alias set already lists 'command'; extend the denied handler to read input.command / a top-level command field when present) and rides it on the approval-request event via a new optional `command?` (stream-events.ts, additive; the event still never persists per markerFor=null). It ALSO classifies the denial: a deterministic predicate over the denial `message` marks a working-directory/sandbox-allowlist block distinct from a tool-permission gate. chat-panel.ts stores { toolName, command?, kind:'tool-gate'|'dir-block' } in pendingPerms (widened from the bare toolName). On Approve: for a tool-gate, runTurn issues a CONCRETE retry (e.g. 'Run exactly this now: <command>' or, absent a command, today's tool-name phrasing) with --allowedTools; for a dir-block, DO NOT runTurn a grant — post an informational message that the action needs the directory added to the session's allowed working dirs (no silent sandbox widening). protocol.ts unchanged.

### a2: Command correlated from the preceding tool-call event + auto --add-dir widen on approve

Correlate the blocked command from the preceding tool-call event (by tool_use_id) rather than the denial line, and on Approve of a working-dir block automatically re-run with `--add-dir <blocked dir>` extracted from the message.

Add the tool_use_id to the tool-call event so the run loop can remember each tool_use's command; when a permission_denied arrives with a matching tool_use_id, attach that remembered command to the approval-request event. chat-panel.ts pendingPerms carries the command. On Approve of a dir-block, buildArgs gains a `--add-dir <dir>` path where <dir> is parsed out of the denial message, and runTurn re-runs the command with the directory pre-authorized; a tool-gate approves as a concrete-command retry with --allowedTools.

**Rejected because:** Robust command source, but 'violates' safety (silent sandbox widening) and 'partial' robustness (parsing the dir path from prose). Loses to a1, which achieves fix1/fix3 without the security-sensitive auto-widen.

### a3: Prose-only: build a concrete approve prompt by parsing the denial message; no event-shape change

Leave the event shape alone; on Approve, construct the retry prompt by extracting the command from the approval card's existing `detail` message, and detect a dir-block from the same message to inform the user.

No new fields. chat-panel.ts, on Approve, parses the command out of the pendingPerms request's `detail` (the human message already shows the Bash command) and issues 'Re-run exactly: <parsed command>' with --allowedTools; a message-match on the same detail flags a dir-block and posts an informational note instead of a grant. cli-adapter.ts + stream-events.ts + protocol.ts unchanged.

**Rejected because:** Smallest surface and safe, but 'violates' robustness (parses the command from prose) and only 'partial' on fix1 — the brittleness a1's structured field exists to remove. Last.

## Citations

- **[[c1]]** `analyze-bundle` `s1 approval-flow-map: chat-panel.ts permission-decision handler (:718-742) + grant re-run nudge (:731) + pendingPerms (:581, toolName only) + runTurn (:517)`
- **[[c2]]** `analyze-bundle` `s1 event-shape-map: stream-events.ts approval-request event (:64-71, no command) + tool-call event carries command? (:33-42) + protocol.ts permission-decision message (:90-92)`
- **[[c3]]** `analyze-bundle` `s1 adapter-map: cli-adapter.ts claudeMapper permission_denied (:262-266, reads tool_name/tool_use_id/message) + buildArgs --allowedTools only (:243) + formatDecision/decide codex in-turn path (:315-345, out of scope)`
- **[[c4]]** `analyze-bundle` `s1 test-map: vscode-plugin/src/chat/__tests__ cli-adapter/chat-panel/stream-events/protocol suites; eval'd *WebviewSource; INSRC_LIVE_TESTS-gated live-cli.test.ts`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-29T08:00:21.176Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | The claude-provider Approve grant re-run in chat-panel.ts sends the vague nudge runTurn('Approved: please proceed with the ${grantTool} action...', [grantTool]) — the defect FIX #1 replaces. | Confirmed: chat-panel.ts:731 = `void runTurn(\\`Approved: please proceed with the ${grantTool} ac...` — the vague grant-nudge the fix replaces, verbatim. | No change needed. |
| cl2 | citation | LOW | auto | pendingPerms is populated with ONLY the tool name (pendingPerms.set(ev.requestId, ev.toolName)) so the exact command isn't available to re-issue — the field-modify target. | Confirmed: chat-panel.ts:581 is the approval-request registration block (the `if (ev.kind === 'approval-request' ...)` guard whose body sets pendingPerms with the tool name) — the field-modify locus. | No change needed. |
| cl3 | citation | LOW | auto | runTurn(text, allowedTools?) is the reused engine (resumes the session + adds --allowedTools); its signature is unchanged and only the tool-gate Approve call site's text changes. | Confirmed: chat-panel.ts:517 = `async function runTurn(text: unknown, allowedTools?: readonly string[])` — the reused engine, signature unchanged. | No change needed. |
| cl4 | citation | LOW | auto | The codex/in-turn branch relays a decision via providers.get(activeProvider).decide(...) — the path consumed unchanged (and the deferred FIX #2), a stale/unknown requestId falls through to it. | Confirmed: chat-panel.ts:739 = `deps.providers.get(activeProvider).decide(activeTurnId, msg.reque...` — the codex/in-turn relay consumed unchanged (deferred FIX #2 path). | No change needed. |
| cl5 | semantic | LOW | auto | The approval-request TurnEvent (stream-events.ts) today carries { kind, turnId, requestId, title, detail, toolName? } with NO command field — the additive field-add target. | Confirmed: stream-events.ts:64 = `readonly kind: 'approval-request';` — the event whose optional command field is the additive field-add. | No change needed. |
| cl6 | semantic | LOW | auto | The tool-call TurnEvent (stream-events.ts) already carries an optional command?: string (from the assistant tool_use input.command), evidencing the command is available in the stream. | Confirmed: stream-events.ts:42 = `readonly command?: string;` on the tool-call event — the command IS present in the stream (evidence the harvest is feasible). | No change needed. |
| cl7 | citation | LOW | auto | claudeMapper.mapLine's system/permission_denied handler reads tool_name + tool_use_id + message and emits an approval-request event { title:`Permission: ${toolName}`, detail:message, toolName } — no command harvested today. | Confirmed: cli-adapter.ts:262 = `if (obj['subtype'] === 'permission_denied') {` — the claude denial handler that emits the approval-request event. | No change needed. |
| cl8 | citation | LOW | auto | buildArgs adds only --allowedTools for the grant re-run; there is no --add-dir / working-directory-widening argv (the no-sandbox-widening invariant the chosen design keeps). | Confirmed: cli-adapter.ts:243 is the buildArgs grant region (the S001 --allowedTools pre-allow comment); no --add-dir exists — the no-sandbox-widening invariant the design preserves. | No change needed. |
| cl9 | citation | LOW | auto | The WebviewToHost permission-decision message is { type:'permission-decision'; requestId: string; decision:'approve'\|'deny' } — unchanged by this design (the host owns the command via pendingPerms). | Confirmed: protocol.ts:90 = `readonly type: 'permission-decision';` — the webview message left unchanged by this design. | No change needed. |
| cl10 | citation | LOW | auto | The chat test suites the regression extends exist: cli-adapter.test.ts, chat-panel.test.ts, stream-events.test.ts, protocol.test.ts under vscode-plugin/src/chat/__tests__/. | Confirmed: vscode-plugin/src/chat/__tests__/chat-panel.test.ts (and the cli-adapter/stream-events/protocol suites) exist — the suites the regression extends. | No change needed. |
