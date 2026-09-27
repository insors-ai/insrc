<!-- insrc:artifact HLD-f9563bf5bbb29c43 -->

# HLD: Deliver the overhaul as ONE shared inline render layer plus an additively-widened event/protocol contract, both foundational in S001, with S002/S003/S004 building on them

## Framework summary

Deliver the overhaul as ONE shared inline render layer plus an additively-widened event/protocol contract, both foundational in S001, with S002/S003/S004 building on them. S001 establishes (sc1) a message view-model derived at view time from the plain durable transcript + a render registry of inline widget renderers, and (sc2) the additively-widened TurnEvent + webview protocol (tool-call carries its command; the approval event/message + permission-mode are reserved shapes S004 fills). S002 restyles the shell chrome (fixed header, bottom-pinned input, icon-only Send/Stop, one animated progress widget) around the EXISTING DOM regions, preserving their stable element ids so it needs no cross-story contract. S003 adds the concrete renderers to sc1's registry (user/assistant differentiation, collapse-by-default 3-line preview for both roles + tool results/inline diffs via one shared chevron primitive, markdown + JSON widgets). S004 fills sc2's approval event + permission-decision message and adds a CLI permission-mode seam on the adapter spawn, plus an approval-card renderer and the auto-mode status indicator. The agreed mock (k5) and locked directions (k6) are implemented ONCE in the render layer. Everything inline under the nonce'd CSP (k1), the transcript stays plain + replayable (k4), the contract stays additive/non-breaking (k2), and permissions ride CLI flags with no REST (k3).

## Architecture shape

Producer→contract→host→webview, unchanged in shape, widened at the seams. The StreamAdapter (cli-adapter.ts) spawns claude -p / codex exec and parses their stream into TurnEvents (sc2). The host runTurn consumes each event, posts it to the webview (post→envelope→postMessage) and appends a PLAIN row to the durable transcript (k4). The webview render layer (sc1) builds a per-row view-model from the plain transcript + live events and dispatches each row to an inline renderer in the registry; flat line() becomes one fallback renderer. For approvals (S004), the adapter runs claude with --permission-prompts host (codex: its approval routing) so a permission request surfaces as an approval-request TurnEvent; the webview shows the approval card and posts a permission-decision message the host relays back to the adapter's permission channel; auto-mode sets a --permission-mode / bypass flag on the spawn instead. The shell chrome (S002) is pure layout over the existing regions (#transcript node, status bar, input) whose ids stay stable so sc1 renderers and the S004 card/indicator slot in without depending on S002.

## Shared contracts

### sc1: MessageViewModel + inline RenderRegistry

**Owner Story:** `s1`
**Consumed by:** `s3`, `s4`

**Purpose:** The single view-time rendering seam: a typed per-row view-model derived from the plain transcript + live events, and a registry mapping each row kind to an inline renderer (incl. the shared collapse/chevron primitive + role base). S003 adds markdown/JSON/collapse renderers and S004 adds the approval-card renderer to the SAME registry, so the mock (k5) + directions (k6) are implemented once and cannot drift.

**Interface sketch (type-level):**

```
type ChatRole = 'user' | 'assistant';
type RowKind = 'user' | 'assistant-text' | 'assistant-markdown' | 'assistant-json' | 'tool-command' | 'tool-result' | 'inline-diff' | 'approval' | 'progress' | 'fallback';
interface RowViewModel { readonly kind: RowKind; readonly role?: ChatRole; readonly text: string; readonly cssClass?: string; readonly collapsible: boolean; readonly meta?: Readonly<Record<string, unknown>>; }
interface RowRenderer { render(vm: RowViewModel, host: RenderHost): HTMLElement; }
interface RenderHost { collapsible(el: HTMLElement, opts: { defaultCollapsed: boolean }): HTMLElement; readonly tokens: Readonly<Record<string, string>>; }
interface RenderRegistry { register(kind: RowKind, r: RowRenderer): void; renderRow(vm: RowViewModel): HTMLElement; }
declare function toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel;
```

**Assumptions cited:** [[c1]] [[c4]]

### sc2: ChatEventProtocol (additively widened)

**Owner Story:** `s1`
**Consumed by:** `s4`

**Purpose:** The shared TurnEvent union + host<->webview protocol messages both the adapter (producer) and webview (consumer) import. S001 adds the tool command to the tool-call event; S004 fills the reserved approval-request event + permission-decision message + permission-mode. Additive only — every existing kind/message keeps working (k2).

**Interface sketch (type-level):**

```
interface ToolCallEvent { readonly kind: 'tool-call'; readonly turnId: string; readonly tool: string; readonly mcp?: { server: string; name: string }; readonly command?: string; }
interface ApprovalRequestEvent { readonly kind: 'approval-request'; readonly turnId: string; readonly requestId: string; readonly title: string; readonly detail: string; readonly toolName?: string; }
type PermissionMode = 'review' | 'auto';
interface PermissionDecisionMsg { readonly type: 'permission-decision'; readonly requestId: string; readonly decision: 'approve' | 'deny'; readonly scope?: 'once' | 'session'; }
interface SetPermissionModeMsg { readonly type: 'set-permission-mode'; readonly mode: PermissionMode; }
// TURN_EVENT_KINDS gains 'approval-request'; existing kinds unchanged.
```

**Assumptions cited:** [[c4]] [[c5]]

## Story boundaries

### Story E20260926f9563bf5:S001

**Owns:** `sc1`, `sc2`

Owns the two foundations plus its own behaviours: the live user-prompt echo on submit (de-duplicated against the replayed row on session-restored, lc1), per-step assistant text via the view-model, surfacing the tool COMMAND (populating ToolCallEvent.command and a never-collapsed inline tool-command renderer), and the 32-char session-name ellipsis in the header. Introduces the view-model + registry and routes existing rows through it with flat line() kept as the fallback renderer, so no current row kind regresses.

### Story E20260926f9563bf5:S002


Owns the shell chrome as pure layout over the EXISTING DOM regions: fixed header on top, bottom-pinned input with an icon-only Send/Stop button (▶ green / ■ red), and a single animated progress widget above the input (live-only, never written to the transcript). Preserves the stable element ids/regions (the transcript node, the status bar, the input) so the S001 render layer and the S004 approval card + auto-mode indicator slot into the same regions without S002 exposing a cross-story contract. Independent of S001 in the graph; both touch renderShell in separable ways (S001 the render script, S002 the shell CSS/controls) and both keep the element-id contract stable.

### Story E20260926f9563bf5:S003

**Depends on:** `sc1`

Consumes sc1 and registers the concrete message/widget renderers: user-vs-assistant visual differentiation; collapse-by-default to a 3-line preview for long user AND assistant messages via sc1's shared icon-only chevron primitive; tool results and inline diffs collapsing to their caption header via the same primitive (the single-line tool-command renderer from S001 stays inline, never collapsed); and markdown + JSON render widgets. All renderers emit inline DOM (k1) and read only the plain view-model (k4). Adds no new event/protocol shape.

### Story E20260926f9563bf5:S004

**Depends on:** `sc1`, `sc2`

Consumes sc1 (registers the approval-card renderer) and sc2 (fills the approval-request event + permission-decision message + permission-mode). Owns the adapter permission seam: run claude with --permission-prompts host + a permission-prompt handler (codex: its approval routing) so a permission request surfaces as an approval-request event; relay the webview's approve/deny decision back to the CLI's permission channel; and a permission-mode seam on the spawn args (auto = --permission-mode/bypass; review = host-answered) driven by an auto/review selector shown in the status bar. All via CLI flags (k3), no REST.

## Non-functional targets

- **Performance:** Rendering is per-row and incremental (append on each event; re-render only the changed row on collapse/expand), so a long transcript costs O(visible rows); markdown/JSON widgets render synchronously from already-received content with no network.
- **Security:** All webview assets inline under the nonce'd CSP with no external fetch (k1); rendering uses textContent/className, never innerHTML on untrusted text; permission decisions travel host↔adapter↔CLI over local flags/stdio only, no cloud REST (k3).
- **Observability:** The durable transcript remains the human-readable record of the turn; approval decisions and mode changes are visible in-chat (card + status bar), not hidden.
- **Durability:** The session transcript stays a plain, replayable record (roles + text + cssClass) — rich rendering, collapse state, and the progress widget are view-time only and never persisted (k4).

## Rollout

### Phase A — foundation (render layer + widened contract + fidelity)

**Stories:** `s1`

S001 owns both shared contracts (sc1 view-model/registry, sc2 the additively-widened event/protocol) that every other story consumes, and delivers the conversation-fidelity fixes on top. It must land first so the render seam + contract exist for S003/S004.

**Backward compat:** Additive only: keep every existing TurnEvent kind + protocol message working and keep flat line() as the registry fallback so no current row kind regresses; the ~151 chat tests must stay green.

### Phase B — shell chrome (layout, input, progress)

**Stories:** `s2`

S002 is independent in the Epic graph but edits the same renderShell as S001, so it lands after Phase A to avoid churn on that file; it restyles the existing regions (fixed header, pinned input, icon Send/Stop, one progress widget) without introducing a cross-story contract.

**Backward compat:** Preserve the stable element ids/regions (transcript node, status bar, input) so the Phase A render layer and later the S004 card/indicator keep targeting the same nodes; the progress widget stays live-only (never persisted).

### Phase C — rich rendering

**Stories:** `s3`

S003 consumes sc1 (owned by S001) to register the concrete renderers — role differentiation, collapse-by-default for both roles + tool results/diffs, markdown/JSON widgets — so it lands after Phase A. Independent of S002's chrome.

**Backward compat:** Renderers are additive to the sc1 registry and derive from the plain transcript (k4); flat line() fallback stays for any unmapped row kind.

### Phase D — approvals & auto-mode

**Stories:** `s4`

S004 consumes sc1 (approval-card renderer) and sc2 (fills the approval-request event + permission-decision message + permission-mode), both owned by S001, so it lands last. It adds the adapter permission seam verified in the CLI spike.

**Backward compat:** The approval-request event + permission messages are additive to sc2; the permission-mode seam defaults to review (host-answered) so existing non-approval turns behave as before; no existing event/message changes shape.

**Ordering rationale:** Phase order follows shared-contract ownership + Epic dependsOn edges: S001 owns sc1+sc2 so it is Phase A; S003 (dependsOn s1, consumes sc1) and S004 (dependsOn s1, consumes sc1+sc2) must follow it; S002 is graph-independent but is sequenced after A only to avoid concurrent edits to renderShell (it shares no contract). The whole feature already sits behind the existing insrc.chat.enabled flag, so no per-phase flag is added.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Widening the shared event/protocol contract (sc2) against ~151 existing tests | Both the adapter (producer) and webview (consumer) import the contract, and chat-panel + cli-adapter tests assert current shapes; a non-additive change would break many at once (k2). | Keep every change additive (new optional fields / new kinds only), retain flat line() as the fallback renderer, and run the chat test suite after each story; no existing kind or message is re-shaped. |
| S001 and S002 both editing renderShell | S001 rewrites the render script and S002 restructures the shell CSS/controls in the same file, risking merge/regression churn on the busiest module. | Sequence Phase A before Phase B; S002 preserves the stable element ids/regions so the render layer is untouched; split the concerns (render script vs shell chrome) within the file. |
| S004 permission wiring to the headless CLIs | Relaying host-answered permission decisions (claude --permission-prompts host + handler; codex approval routing) is the only genuinely new external integration and is the hardest to test end-to-end. | The CLI spike already verified the flags exist; build behind the auto/review selector defaulting to review, unit-test the approval event/decision round-trip with a scripted adapter (no live CLI), and gate one live smoke behind an opt-in env var. |

## Alternatives considered

### a1: Shared view-model + inline widget-registry render layer over an additively-widened event/protocol contract — **CHOSEN**

One derive-at-view-time message view-model + a small inline render registry replaces flat line(); the TurnEvent/protocol contract is widened additively so S001 and S004 plug in.

Introduce a single rendering seam in the webview: a view-model is derived at render time from the plain durable transcript + live events (k4 keeps storage plain), and a small render registry maps each row kind (user message, assistant markdown, assistant JSON, tool-command, tool-result, inline diff, approval card, live progress) to an inline renderer that emits DOM via textContent/className only under the nonce'd CSP (k1). The existing flat line() becomes one fallback renderer; markers.ts stays the single shared host+webview label source. The mock (k5) and the locked directions (k6) are implemented once in this layer, so collapse-by-default, the icon-only chevron, role differentiation, and the fixed-header/pinned-input/progress-widget chrome are defined in one place and reused by every story. The cross-cutting contract is widened ADDITIVELY (k2): the tool-call event gains an optional command field (S001); a new approval-request event + a webview decision message are added for S004; the adapter gains a permission-mode seam on the spawn args. Every existing event kind and message keeps working, so the ~151 tests extend rather than break.

**Pros:**
- Collapse/role/markdown/JSON/chevron rules from the mock live in ONE render layer, so S001+S003 cannot drift from k6 and the mock is implemented once.
- The event/protocol contract stays additive (k2): every existing kind + message keeps passing, so the 151 tests extend not rewrite.
- Rendering derives from the plain transcript at view time, so k4 (plain replayable storage) holds with no schema churn.
- S004's approval surface is a clean pair (one event + one decision message) that reuses the same render registry for its card.

**Cons:**
- Introduces a new render-layer abstraction up front, a larger first move than patching handlers in place.
- The view-model must cover every current row kind before flat line() can be retired, so S001 carries some shared-seam cost the later stories benefit from.

**Cost estimate:** L

### a2: Per-story in-place patches to the existing bootstrap + markers pipeline

Each story edits the existing message handler / markers.ts / CSS directly, with no unifying view-model.

Keep the current webview bootstrap shape and have each story add what it needs directly: S001 adds a user-echo call on submit + a tool-command branch in markers.ts + a title clamp; S002 rewrites the shell CSS + adds Send/Stop + a progress element; S003 adds collapse + markdown/JSON branches inside the existing message handler; S004 adds approval handling. The event/protocol contract is still widened additively, but the rendering logic stays distributed across the existing handler functions rather than centralized. Lowest-ceremony and mirrors the original build (flat line() + a marker switch), but the collapse/role/markdown rules end up per-branch, so keeping them consistent with the mock (k6) depends on discipline rather than structure.

**Pros:**
- Smallest first move: no new abstraction, each story is a contained patch.
- Lowest risk to the existing 151 tests per individual change since handlers are touched narrowly.

**Cons:**
- Collapse / role differentiation / markdown-JSON rules get implemented across several handler branches, so k6 consistency is by convention not by construction — high drift risk across S001/S003.
- Retiring flat line() is awkward; user and assistant rendering paths diverge, contradicting the 'uniform across roles' direction (k6 b/c).
- S003 and S004 each re-touch the same message handler S001 changed, raising merge/regression churn on chat-panel.ts.

**Cost estimate:** M

**Rejected because:** Satisfies the hard contract/CSP/CLI constraints but only partial on k4/k5/k6 — per-branch rendering leaves the exact-mock + uniform-collapse directions drift-prone because rendering isn't centralized.

### a3: Rebuild the transcript as a component tree on a small webview UI library

Replace the hand-rolled bootstrap with a component framework (e.g. a lit/preact UMD build) rendering the transcript.

Rebuild the webview transcript as a component tree using a small UI library loaded as a pinned UMD build, giving declarative components for each message/widget kind and built-in reactivity for collapse/expand and live streaming. The event/protocol contract is still additive; the difference is the rendering substrate. This buys the most expressive rendering model, but it is a wholesale rewrite of the webview bootstrap that ~90 of the 151 tests exercise, and it sits in tension with k1 (everything inline under the nonce'd CSP): a library adds a load path the current design deliberately avoids.

**Pros:**
- Most expressive/reactive rendering model for collapse, streaming, and future widgets.
- Declarative components make per-kind rendering individually testable.

**Cons:**
- Wholesale rewrite of the webview bootstrap that ~90 of the 151 tests cover — high regression cost against a working surface.
- Adds a library load path that sits in tension with k1's inline-only CSP posture and the terminal aesthetic.
- Over-engineered for a four-story UI overhaul; the abstraction outweighs the problem (YAGNI).

**Cost estimate:** L

**Rejected because:** Violates k1 (an external UI-library load against the inline-only CSP) and is only partial on k2 (wholesale rewrite risking ~90 tests); the added machinery is disproportionate to a four-story UI polish (YAGNI).

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map — vscode-plugin/src/chat/* modules + ~151 tests` — "chat-panel.ts (renderShell + bootstrap render script + host runTurn/appendEvent), cli-adapter.ts (StreamAdapter + spawn), stream-events.ts (TurnEvent union + TURN_EVENT_KINDS), protocol.ts, session-st"
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work — render/event/protocol pipeline` — "runTurn (chat-panel.ts:326) posts turn-event + appendEvent to the plain transcript; the webview renders assistant-delta via flat textContent line() (:234); user prompt not echoed live (:262); markers."
- **[[c3]]** `analyze-bundle` `s1 external-contract — verified headless permission flags (CLI spike)` — "claude -p: --permission-mode (bypassPermissions/manual) + --permission-prompts host|none (none = auto-denied) + --allowed/--disallowed-tools; codex exec: -s/--sandbox + approval routing + --dangerousl"
- **[[c4]]** `analyze-bundle` `s1 capability-discovery — no existing approval/permission surface` — "No tool-permission/approval TurnEvent, protocol message, webview control, or CLI permission flag exists; the only approval-like flow is the auto/review EDIT governor scoped to file edits."
- **[[c5]]** `convention` `s1 convention.detect + CLAUDE.md — chat conventions + no-REST principle` — "Nonce'd inline CSP webview (textContent/className only); additive TurnEvent contract; plain replayable transcript; cloud LLM access via local claude/codex CLIs only (no REST)."
- **[[c6]]** `doc` `docs/epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/mocks.html` — "The agreed UX mock (k5/k6) — the single design source of truth every story boundary implements exactly."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 4 LOW** · model `client` · reviewed 2026-09-26T13:26:14.608Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c2 | citation | LOW | manual | The webview render pipeline the HLD reshapes exists as claimed: chat-panel.ts has the flat textContent line() renderer and markers.ts maps a tool-call to the tool NAME only. | read chat-panel.ts:234 = `function line(s,cls){...d.textContent=s;...}` (flat textContent render) and markers.ts:66 = `label: event.mcp ? server·name : event.tool` (tool NAME only) — both confirmed. | none — verified sound |
| c1 | citation | LOW | manual | The additive-contract seam exists: stream-events.ts declares the TurnEvent union + TURN_EVENT_KINDS that both adapter and webview import. | stream-events.ts:50 `export const TURN_EVENT_KINDS = [` + :33 `kind: 'tool-call'`; the adapter emits it at cli-adapter.ts:171/223 and the webview/tests import it — the additive contract seam exists as claimed. | none — verified sound |
| c3 | external-contract | LOW | manual | The S004 permission approach rests on real CLI flags: claude -p accepts --permission-prompts (host\|none) and --permission-mode; the adapter spawn currently sets none. | cli-adapter.ts:141 args = ['-p', prompt, '--output-format=stream-json', '--verbose'] — no permission flag today; and --permission-mode is a real accepted claude flag, independently corroborated by the backend src/agent/providers/cli-provider.ts:254 using `--permission-mode acceptEdits`. The S004 approach rests on verified flags. | none — verified sound |
| c6 | cross-artifact | LOW | manual | Shared-contract ownership fits the Epic graph: sc1 (owned s1) is consumed by s3 and s4, and sc2 (owned s1) by s4 — every consumer transitively dependsOn s1 (s3->s1, s4->s1 in the DEF). | The HLD owns sc1+sc2 at s1 and lists sc1.consumedBy=[s3,s4], sc2.consumedBy=[s4]; the DEF graph has s3->s1 and s4->s1, so every consumer is transitively downstream of the owner — ownership fits the graph (the HLD audit sc2 item also passed). | none — verified sound |
