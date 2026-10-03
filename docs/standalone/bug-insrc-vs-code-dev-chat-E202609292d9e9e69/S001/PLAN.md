<!-- insrc:artifact PLAN-2d9e9e694a94116b-s1 -->

# Plan: E202609292d9e9e69:S001

**Epic:** `lld-dev-chat-approve-bugfix-1`
**LLD run:** `wf-1790668327465-r1f3aw`
**LLD effective hash:** `707006cbcfe4...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add optional command to the approval-request event | S | — | unit: stream-events: the approval-request event admits the optional command field without disturbing the other event kinds | [[c2]] |
| 2 | **`t2`** Harvest the blocked command in the claude permission_denied handler | S | `t1` | unit: claudeMapper.mapLine: a permission_denied line WITH a command yields an approval-request event with command set (title/detail/toolName unchanged); unit: claudeMapper.mapLine: a permission_denied line WITHOUT a command (or empty command) yields the event with command undefined, byte-compatible with today | [[c1]] |
| 3 | **`t3`** Add the classifyPermissionDenial pure helper | S | — | unit: classifyPermissionDenial: the sandbox 'allowed working directories' message classifies as 'dir-block'; tool-gate/unknown/empty classify as 'tool-gate'; false-positive table proves no real tool-gate is marked 'dir-block' | [[c3]] |
| 4 | **`t4`** Widen the pendingPerms value and populate it | S | `t1`, `t3` | unit: chat-panel: the pendingPerms value carries { toolName, command?, blockKind } populated from the event + classifyPermissionDenial(detail) | [[c1]] [[c3]] |
| 5 | **`t5`** Branch the Approve path on blockKind | M | `t2`, `t4` | unit: chat-panel permission-decision Approve, tool-gate WITH command: runTurn is called with a CONCRETE retry naming the exact command + --allowedTools (not the vague nudge); unit: chat-panel Approve, tool-gate WITHOUT command: runTurn falls back to today's tool-name phrasing with --allowedTools (no empty command injected); unit: chat-panel Approve, dir-block: NO runTurn grant is issued; an informational message is posted; the sandbox allowlist/argv is not modified; unit: cli-adapter buildArgs: unchanged — still adds only --allowedTools, never --add-dir (the no-sandbox-widening invariant) | [[c1]] [[c3]] |
| 6 | **`t6`** Regression tests across the changed seams | M | `t5` | unit: chat-panel Deny (tool-gate or dir-block): the request is dropped — no runTurn, no informational post (unchanged); unit: chat-panel: codex/live-channel provider OR a stale/unknown requestId falls through to providers.decide(...) exactly as today; the new command/blockKind fields are not consulted; unit: The full chat suite (cli-adapter/stream-events/chat-panel/protocol) passes locally with the existing approval tests green | [[c1]] [[c2]] [[c3]] |

### E202609292d9e9e69:S001:T001 — Add optional command to the approval-request event

Add a pure additive `readonly command?: string` to the approval-request TurnEvent in vscode-plugin/src/chat/stream-events.ts (:64). No producer is required to set it; no consumer is required to read it. Other event kinds untouched.

**Acceptance checks:**
- stream-events.ts approval-request event type declares an optional command?: string
- The other event kinds are structurally unchanged; the event stays live-only (markerFor maps approval-request to null)

### E202609292d9e9e69:S001:T002 — Harvest the blocked command in the claude permission_denied handler

In claudeMapper.mapLine's system/permission_denied branch (cli-adapter.ts:262), read the command from the line's command/input.command fields when present and set it on the emitted approval-request event; leave it undefined otherwise so the event is byte-compatible with today (title/detail/toolName unchanged). An empty-string command is treated as absent.

**Acceptance checks:**
- A permission_denied line carrying a command yields an approval-request event with command set
- A permission_denied line without a command (or an empty command) yields the event with command undefined, byte-compatible with today

### E202609292d9e9e69:S001:T003 — Add the classifyPermissionDenial pure helper

Add a deterministic `classifyPermissionDenial(detail: string): 'tool-gate' | 'dir-block'` (in cli-adapter.ts or a shared module the host can import). A conservative predicate marks only the specific working-directory/sandbox-allowlist phrasing ('allowed working directories') as 'dir-block'; every other/unknown/empty message returns 'tool-gate' (the safe default). Never marks a real tool-gate as dir-block.

**Acceptance checks:**
- The sandbox 'allowed working directories' message classifies as 'dir-block'
- An ordinary tool-permission message, an unknown message, and an empty message all classify as 'tool-gate'
- The false-positive table confirms no real tool-gate message is marked 'dir-block'

### E202609292d9e9e69:S001:T004 — Widen the pendingPerms value and populate it

Widen the pendingPerms map value in chat-panel.ts from the bare toolName:string to { toolName: string; command?: string; blockKind: 'tool-gate' | 'dir-block' }, populated where the approval-request event is registered (:581) from the event's command and classifyPermissionDenial(detail). Host-internal; no external consumer.

**Acceptance checks:**
- pendingPerms value carries { toolName, command?, blockKind } populated from the approval-request event + classifyPermissionDenial(detail)
- No external consumer of pendingPerms is broken (it is host-internal)

### E202609292d9e9e69:S001:T005 — Branch the Approve path on blockKind

In the chat-panel permission-decision handler's claude grant branch (:727-733), branch on the widened pendingPerms entry: tool-gate → runTurn a CONCRETE retry naming the exact command (falling back to today's tool-name phrasing when no command was captured) with --allowedTools; dir-block → post an informational message (add the directory to the session's allowed working dirs) and issue NO grant. Deny unchanged; an unknown/stale requestId falls through to the codex decide() relay (:739) unchanged. runTurn's signature and buildArgs (--allowedTools only, no --add-dir) are unchanged.

**Acceptance checks:**
- Approve on a tool-gate WITH a command calls runTurn with a concrete retry naming the exact command + --allowedTools (not the vague 'please proceed' nudge)
- Approve on a tool-gate WITHOUT a command falls back to the tool-name phrasing with --allowedTools (no empty command injected)
- Approve on a dir-block posts an informational message and issues NO grant re-run; buildArgs/allowlist unchanged (no --add-dir)
- Deny drops the request (no runTurn, no informational post); a codex/stale requestId falls through to providers.decide(...) unchanged

### E202609292d9e9e69:S001:T006 — Regression tests across the changed seams

Add regression tests: adapter command-harvest + classifier table (cli-adapter.test.ts), event shape (stream-events.test.ts), and the host Approve/Deny branch matrix incl. tool-gate-with/without-command, dir-block, codex, and stale requestId (chat-panel.test.ts via the eval'd WebviewSource harness). Also assert the codex/stale fall-through and Deny path stay byte-identical. Confirm protocol.test.ts and the existing approval tests stay green.

**Acceptance checks:**
- New/extended cli-adapter, stream-events, and chat-panel suites cover command-harvest, the classifier table, and the full Approve/Deny branch matrix
- The codex/stale requestId fall-through and the Deny path are explicitly asserted byte-identical to today
- protocol.test.ts and the existing approval tests remain green
- The full chat suite passes locally

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| claudeMapper.mapLine: a system/permission_denied line carrying a command yields an approval-request event with command set (+ title/detail/toolName unchanged); a line WITHOUT a command yields the event with command undefined (byte-compatible with today). | `t2` |
| classifyPermissionDenial: the sandbox 'allowed working directories' message → 'dir-block'; an ordinary tool-permission message → 'tool-gate'; an unknown/empty message → 'tool-gate' (conservative default); the false-positive table proves no real tool-gate is marked 'dir-block'. | `t3` |
| stream-events.ts: the approval-request event admits the optional command field (event-kind shape) without disturbing the other kinds. | `t1` |
| cli-adapter buildArgs: unchanged — still adds only --allowedTools, never --add-dir (the no-sandbox-widening invariant). | `t5` |
| chat-panel permission-decision Approve, tool-gate WITH command: runTurn is called with a CONCRETE retry naming the exact command + --allowedTools (NOT the vague 'please proceed' nudge). | `t5` |
| Approve, tool-gate WITHOUT command: runTurn falls back to today's tool-name phrasing with --allowedTools (no empty command injected). | `t5` |
| Approve, dir-block: NO runTurn grant is issued; an informational message is posted; the sandbox allowlist/argv is not modified. | `t5` |
| Deny (tool-gate or dir-block): the request is dropped — no runTurn, no informational post (unchanged). | `t6` |
| codex/live-channel provider OR a stale/unknown requestId: falls through to providers.decide(...) exactly as today; the new command/blockKind fields are not consulted. | `t6` |
| pendingPerms value carries { toolName, command?, blockKind } populated from the event + classifyPermissionDenial(detail). | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 invariant: additive change for every path except the claude tool-gate Approve text; runTurn signature unchanged (chat-panel.ts:517/:731; codex decide() :739)`
- **[[c2]]** `prior-artifact` `LLD s1 invariant: approval-request event stays live-only (markerFor=null); optional command field is additive (stream-events.ts:64)`
- **[[c3]]** `prior-artifact` `LLD s1 invariant: no sandbox widening on a click — buildArgs keeps only --allowedTools, never --add-dir (cli-adapter.ts:243); dir-block informs via classifyPermissionDenial`
