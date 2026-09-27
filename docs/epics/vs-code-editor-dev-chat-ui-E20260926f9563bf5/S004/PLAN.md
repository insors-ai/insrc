<!-- insrc:artifact PLAN-f9563bf5bbb29c43-s4 -->

# Plan: E20260926f9563bf5:S004

**Epic:** `vs-code-editor-dev-chat-ui`
**LLD run:** `wf-1790438685699-mz5wyg`
**LLD effective hash:** `8417b84c742c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc2 types: ApprovalRequestEvent union member + PermissionMode + markerFor null case | M | — | unit: stream-events.test.ts: ApprovalRequestEvent valid; TURN_EVENT_KINDS unchanged; markerFor null + never-check compiles.; unit: markers.test.ts: markerFor(approval-request) and the markerWebviewSource mirror both return null. | [[c1]] [[c2]] |
| 2 | **`t2`** protocol: permission-decision + set-permission-mode WebviewToHost messages | S | `t1` | unit: protocol.test.ts: permission-decision + set-permission-mode in WEBVIEW_TO_HOST_TYPES; existing roundtrips unchanged. | [[c1]] |
| 3 | **`t3`** SpawnedProcess.write seam + fake spawner scripting/recording | M | `t1` | unit: cli-adapter.test.ts: fake spawner records write() calls and scripts permission stdout lines; omitting write() still compiles/behaves as today. | [[c2]] |
| 4 | **`t4`** TurnRequest.permissionMode + buildArgs review/auto flags | M | `t1` | unit: cli-adapter.test.ts: buildArgs review vs auto flags + undefined==today, both providers. | [[c1]] |
| 5 | **`t5`** mapLine permission-request branch + pending-request registry + StreamAdapter.decide | L | `t3`, `t4` | unit: cli-adapter.test.ts: mapLine maps scripted permission line (both providers, via normalizing adapter over field aliases) to one ApprovalRequestEvent; idless line -> []; unparseable -> throws.; unit: cli-adapter.test.ts: decide records correct control write for a live requestId, no-ops stale/unknown, at most one write per id; pending cleaned on cancel/exit.; live: live-cli.test.ts: INSRC_LIVE_TESTS-gated claude --permission-prompts host + written decision; auto bypass; codex exec --json equivalent (validates captured fixtures against installed CLIs). | [[c2]] [[c3]] |
| 6 | **`t6`** sc1 approval-card renderer (icon-only approve/deny) | M | `t1` | unit: render-registry.test.ts: 'approval' renderer builds icon-only approve/deny via className/textContent (no innerHTML) with click listeners. | [[c3]] |
| 7 | **`t7`** chat-panel: live approval routing + permission-decision post + #insrc-permmode status control | L | `t2`, `t5`, `t6` | unit: chat-panel.test.ts: html has the #insrc-permmode status control; mode change posts set-permission-mode; card click posts permission-decision; live approval-request routed to approval renderer. | [[c1]] [[c3]] [[c5]] |
| 8 | **`t8`** Verification: extend suites, tsc + full chat suite green | S | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7` | smoke: Full chat suite green (npx tsx --test 'src/chat/**/__tests__/*.test.ts') + tsc clean; no existing test regressed (additive, k2). | [[c6]] |

### E20260926f9563bf5:S004:T001 — sc2 types: ApprovalRequestEvent union member + PermissionMode + markerFor null case

In stream-events.ts add the ApprovalRequestEvent union member to TurnEvent (kind:'approval-request',turnId,requestId,title,detail,toolName?) — 'approval-request' is already in TURN_EVENT_KINDS. Declare the shared PermissionMode = 'review'|'auto' type with its canonical home in protocol.ts (the sc2 module both the adapter and webview already import), so t2/t4/t7 import one type. In markers.ts add the 'approval-request'->null case to BOTH markerFor (:43, keeping the never-check at :76 compiling) AND its single-sourced webview mirror markerWebviewSource (:84) — review finding cl2. Additive only (k2), live-only so no marker persisted (k4).

**Acceptance checks:**
- ApprovalRequestEvent is a valid TurnEvent member and tsc compiles with the markerFor exhaustiveness never-check intact.
- markerFor(approval-request) and the markerWebviewSource mirror both return null; no transcript marker persisted (k4).
- PermissionMode is declared once in protocol.ts and imported by the adapter/webview; TURN_EVENT_KINDS unchanged; existing stream-events + markers tests stay green.

### E20260926f9563bf5:S004:T002 — protocol: permission-decision + set-permission-mode WebviewToHost messages

In protocol.ts add PermissionDecisionMsg {type:'permission-decision',requestId,decision:'approve'|'deny',scope?:'once'|'session'} and SetPermissionModeMsg {type:'set-permission-mode',mode:PermissionMode} to the WebviewToHost union and append both to WEBVIEW_TO_HOST_TYPES. Reuse the PermissionMode type declared in protocol.ts by t1. Additive; existing message roundtrips unchanged (k2).

**Acceptance checks:**
- permission-decision + set-permission-mode are members of WebviewToHost and present in WEBVIEW_TO_HOST_TYPES.
- scope is an optional 'once'|'session' field (accepted-but-inert 'once' per q2); existing protocol tests stay green.

### E20260926f9563bf5:S004:T003 — SpawnedProcess.write seam + fake spawner scripting/recording

In cli-adapter.ts add the additive optional write?(data:string):void to SpawnedProcess and wire the production SpawnFn to child.stdin.write. Extend the fake spawner (fixtures.ts) so tests can script permission-request stdout lines AND record write() calls. Optional method keeps existing spawner impls/tests compiling (k2, exactOptionalPropertyTypes-safe).

**Acceptance checks:**
- SpawnedProcess.write is optional; existing spawner impls/tests that omit it still compile.
- Production SpawnFn writes to child.stdin; the fake spawner records writes and can script permission lines.
- No behavioural change when write() is never called.

### E20260926f9563bf5:S004:T004 — TurnRequest.permissionMode + buildArgs review/auto flags

In cli-adapter.ts add the optional permissionMode (importing PermissionMode from protocol.ts) to TurnRequest and make each ProviderMapper.buildArgs read it: review->claude --permission-prompts host (codex on-request approval); auto->claude --permission-mode bypassPermissions / codex --dangerously-bypass-approvals-and-sandbox. Undefined => byte-identical argv to today. Provider difference stays inside each mapper.

**Acceptance checks:**
- buildArgs with permissionMode undefined returns byte-identical argv to today (claude :141 / codex :204-207).
- review mode adds the host-answered flag and never a bypass flag; auto mode adds the bypass flag and never a host-answered flag.
- cli-adapter tests cover both providers x {undefined, review, auto}.

### E20260926f9563bf5:S004:T005 — mapLine permission-request branch + pending-request registry + StreamAdapter.decide

Add a permission-request branch to each ProviderMapper.mapLine via a per-provider normalizing adapter over field aliases (q1) that maps a native permission/approval line onto one internal ApprovalRequest{requestId,title,detail,toolName?} -> ApprovalRequestEvent; a parseable-but-idless line yields [] and an unparseable line throws (as today). Add the adapter-side pending-request registry (register on emit) and StreamAdapter.decide(turnId,requestId,decision): look up the live entry, format+write the provider control response via write(), resolve+clear; no-op on unknown/stale; auto-clean outstanding entries on cancel()/exit in the run() loop. Kept as one task (the registry is the shared state decide() reads and mapLine writes; splitting would leave a half-wired commit) — within the build, land the fixtures + normalizing-adapter parser first, then the registry+decide. Capture claude/codex permission-line fixtures for the adapter + live suite.

**Acceptance checks:**
- A scripted permission line maps to exactly one ApprovalRequestEvent with a provider-stable requestId; non-permission lines map exactly as before (k2).
- decide() writes the correct provider control response for a live requestId and no-ops for unknown/stale/dead ids (at most one write per requestId).
- Pending entries are auto-cleaned on cancel()/exit so no card is left dangling; scope is accepted-but-inert 'once'-only.
- The provider difference lives only inside each mapper/normalizing adapter.

### E20260926f9563bf5:S004:T006 — sc1 approval-card renderer (icon-only approve/deny)

In render-registry.ts register a renderer for the already-reserved RowKind 'approval' in the webview source: an inline approval card with icon-only approve/deny controls (k6-i) built via className/textContent only, nonce'd (k1). Do NOT modify sc1 RowKind or toViewModel (s1-owned). Unit-test by eval'ing the *WebviewSource factory against the fake document.

**Acceptance checks:**
- reg.register('approval', ...) yields a card with icon-only approve/deny controls using className/textContent (no innerHTML).
- sc1 RowKind and toViewModel are unchanged; existing render-registry tests stay green.
- The card buttons expose click listeners the eval'd factory test can invoke.

### E20260926f9563bf5:S004:T007 — chat-panel: live approval routing + permission-decision post + #insrc-permmode status control

In chat-panel.ts add an approval-request branch to the live turn-event handler (:304) that renders the approval card and wires its buttons to postMessage({type:'permission-decision',requestId,decision}). Add a DISTINCT #insrc-permmode 'perms' auto/review control to the .statusbar (:354-357), separate from the existing #insrc-editmode select (review finding cl11), posting set-permission-mode + showing the active mode as a seg. Add handleMessage cases: permission-decision->adapter.decide; set-permission-mode->store per-session, apply to the NEXT turn's buildArgs (not the in-flight spawn).

**Acceptance checks:**
- A live approval-request event routes to the approval renderer; a card click posts permission-decision{requestId,decision} dispatched to decide().
- The status bar has a distinct #insrc-permmode auto/review control (not conflated with #insrc-editmode); changing it posts set-permission-mode and updates the mode seg.
- set-permission-mode stores the per-session mode applied to the next turn's buildArgs; chat-panel tests assert on html + posted messages.

### E20260926f9563bf5:S004:T008 — Verification: extend suites, tsc + full chat suite green

Ensure the five owning suites (stream-events, protocol, cli-adapter, render-registry, chat-panel) + markers cover the new seams, then run tsc and the full chat suite locally to confirm all ~211+ tests green and the contract stayed additive (k2). Validate/code-review gates are hollow here — verify locally.

**Acceptance checks:**
- `npx tsx --test 'src/chat/**/__tests__/*.test.ts'` is fully green with the new coverage added.
- tsc is clean (optional write?/permissionMode? exactOptionalPropertyTypes-safe).
- No existing chat test regressed (additive contract, k2).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| stream-events.test.ts: ApprovalRequestEvent valid; TURN_EVENT_KINDS unchanged; markerFor null + never-check compiles. | `t1` |
| protocol.test.ts: permission-decision + set-permission-mode in WEBVIEW_TO_HOST_TYPES; existing roundtrips unchanged. | `t2` |
| cli-adapter.test.ts: buildArgs review vs auto flags + undefined==today; mapLine maps scripted permission line to one ApprovalRequestEvent; decide records correct write / no-ops stale; pending cleaned on cancel/exit. | `t3`, `t4`, `t5` |
| render-registry.test.ts: 'approval' renderer builds icon-only approve/deny via className/textContent (no innerHTML) with click listeners. | `t6` |
| chat-panel.test.ts: html has status-bar mode control; mode change posts set-permission-mode; card click posts permission-decision; live approval-request routed to approval renderer. | `t7` |
| INSRC_LIVE_TESTS-gated claude -p --permission-prompts host + written decision; auto bypass; codex exec --json equivalent. | `t5` |
| Full chat suite green; tsc clean (optional write?/permissionMode?). | `t8` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4: sc2 ApprovalRequestEvent + PermissionMode + PermissionDecisionMsg/SetPermissionModeMsg + buildArgs permission flags` — "Realizes sc2's HLD-sketched reserved members ... ApprovalRequestEvent union member, PermissionDecisionMsg + SetPermissionModeMsg + PermissionMode; buildArgs adds review/auto flags."
- **[[c2]]** `prior-artifact` `LLD s4: cli-adapter permission seam — SpawnedProcess.write + mapLine permission branch + pending-request registry + StreamAdapter.decide` — "SpawnedProcess needs an additive write() seam ... StreamAdapter.decide looks up the live pending entry, writes the provider control response, resolves+clears; auto-clean on cancel()/exit."
- **[[c3]]** `prior-artifact` `LLD s4: sc1 approval-card renderer registration + chat-panel live approval-request routing` — "Registers an 'approval'-kind renderer into the existing RenderRegistry ... event->row mapping in S004's own live handler."
- **[[c5]]** `stakeholder` `Epic constraint k6-i / mocks.html — approve/deny card + auto/review status-bar mode` — "tool-permission requests surface in-chat as an approve/deny card and the chosen auto/review mode shows in the status bar."
- **[[c6]]** `prior-artifact` `LLD s4 testStrategy: five owning chat suites + tsc/full-suite verification (~211 tests)` — "node:test via `npx tsx --test 'src/chat/**/__tests__/*.test.ts'` ... verify tsc + full chat suite locally."
