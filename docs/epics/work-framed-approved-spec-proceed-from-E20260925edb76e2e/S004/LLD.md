<!-- insrc:artifact LLD-edb76e2e4d41217d-s4 -->

# LLD: E20260925edb76e2e:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790343836936-uhegob`
**HLD effective hash:** `f394a9ecb688...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (alternative a1). All chat logic lives in vscode-free, deps-injected host modules that mirror the repo's existing createWebviewPanelHost(deps) factory idiom, so streaming, session, edit-governance and docs-review logic are unit-testable without a webview harness. The webview holds no business logic — it paints terminal-styled surfaces and emits user intents over a single typed, versioned message protocol. Each agentic CLI's native structured stream is normalized to ONE event union by a per-provider stream adapter, quarantining the still-to-spike claude/codex stream/resume contract at that boundary so no downstream surface is provider-specific. Grounding + tracked-workflow behaviour come through the CLI's own insrc MCP (the extension observes, never orchestrates — k8).
**Rollout phase:** Phase B — core terminal chat surface
**Consumes:** `sc1` (Terminal-UX design tokens + component vocabulary), `sc2` (Normalized CLI stream-event schema), `sc3` (Webview↔extension message protocol)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The concrete mockup deliverables (per-surface terminal-styled mock images/HTML), the design-rationale write-up, and the exact palette/character choices are private to S001; downstream stories consume only the sc1 token/vocabulary contract, not the mock files themselves. — owns `sc1`
- `s2`: The subprocess spawn mechanics, the per-provider parsing of each CLI's NATIVE stream format, the exact claude/codex flags (the stream/resume spike), backpressure/cancellation handling, and error normalization stay private to S002; consumers see only the normalized TurnEvent union (sc2) and the StreamAdapter/ProviderRegistry interface (sc5). — owns `sc2`, `sc5`
- `s3`: The terminal renderer internals (how TurnEvents paint as terminal output), the input box, the panel/webview lifecycle and single-active-panel management, and the CSP/webview bootstrap are private to S003; other stories consume only the message protocol (sc3) and the session-store shape (sc4). — owns `sc3`, `sc4`
- `s5`: The provider-selector and history-dropdown UI, the new-chat vs open-chat flows, and the wiring of the StreamAdapter's native session-resume handle into a restored session are private to S005; it persists through sc4 and drives turns through sc5, adding no new shared contract.
- `s6`: The inline-diff renderer, the EditGovernor that applies the per-session auto/review toggle, and (review mode) the interception of the CLI's edit/write before the write reaches disk are private to S006; it consumes file-edit TurnEvents (sc2), the edit-mode field on the session (sc4), and the edit-prompt/edit-decision messages (sc3).
- `s7`: The docs-review pane and its DocsReviewClient over the existing daemon IPC (the exact pendingApproval listing + insrc_workflow_approve method names/payloads, pinned at the S007 LLD) and the mirroring of the JetBrains review/comment/accept-reject panel are private to S007; it consumes only the message protocol (sc3) and the terminal tokens (sc1) and adds no new shared contract to the Epic.

## Contract details

**Surface level:** internal

### `markerFor`

```typescript
markerFor(event: TurnEvent): MarkerLine | null
```

**Parameters:**
- `event: TurnEvent` — The sc2 stream event to map to a terminal lifecycle marker. assistant-delta returns null (rendered as plain streamed text, not a marker).

**Returns:** `MarkerLine | null` — { cssClass, label } where cssClass is exactly one of the sc1 marker classes (insrc-term__marker--pending|tool|edit|done|error) and label is the enriched line text; null for assistant-delta. status(thinking)->pending 'thinking…'; status(streaming)->pending 'streaming…'; status(tool)->tool 'running tool…'; status(editing)->edit 'editing…'; tool-call->tool (mcp ? `${mcp.server} · ${mcp.name}` : tool); file-edit->edit path; done->done (ok?'done':'done (failed)'); error->error message.

**Preconditions:**
- event is a well-formed sc2 TurnEvent (discriminated by kind).

**Postconditions:**
- Pure + total over the TurnEvent union: every kind returns either a MarkerLine with a valid sc1 cssClass or (assistant-delta only) null; deterministic; no I/O, no vscode import.
- Never invokes any insrc workflow/MCP tool — it only observes + maps the event (k8).

### `markerWebviewSource`

```typescript
markerWebviewSource(): string
```

**Returns:** `string` — A pure JS function-source string (mirroring markerFor) that the S003 webview bootstrap embeds inline, so the webview computes {cssClass,label} from a live turn-event with the SAME logic as the host markerFor — the single-source mechanism that prevents host/webview drift (a test executes both on sample events and asserts equality).

**Postconditions:**
- The returned source references only the five sc1 marker classes; contains no remote origin / import / vscode reference (stays CSP-safe inside the one nonce'd script).

### `line`

```typescript
line(text: string, markerClass?: string): void
```

**Parameters:**
- `text: string` — The line text (via textContent — XSS-safe, unchanged from S003).
- `markerClass: string` _(optional)_ — Optional sc1 marker class to set on the row <div> so ::before paints the glyph + tone; omitted for plain text lines.

**Returns:** `void` — Appends a (optionally marker-classed) <div> to the terminal transcript and scrolls. The existing S003 webview writer (chat-panel.ts:88), WIDENED by S004 to carry a marker class — the only structural change to the writer.

**Preconditions:**
- Called from inside the webview bootstrap (the one nonce'd inline script).

**Postconditions:**
- Still sets textContent (never innerHTML) — the S003 no-XSS invariant is preserved; markerClass only adds a class attribute.
- The non-assistant-delta fall-through at chat-panel.ts:89 now routes through markerFor-equivalent -> line(label, cssClass) instead of the bare '['+kind+']'.

### `appendEvent`

```typescript
appendEvent(s: ChatSession, ev: TurnEvent): void
```

**Parameters:**
- `s: ChatSession` — The active session whose transcript receives the marker row (sc4, consumed).
- `ev: TurnEvent` — The event to record.

**Returns:** `void` — The existing S003 host transcript writer (chat-panel.ts:205), REUSED to derive marker-row text from markerFor(ev).label so host rows + webview markers share one source; S004 fills the status/done gap (they previously produced no marker row).

**Postconditions:**
- Uses markerFor(ev) for the role:'marker' row label; assistant-delta still -> role:'assistant'; no daemon write (k3), no workflow call (k8).

## Data model changes

### `MarkerLine (markers.ts)` — new

The S004-internal marker descriptor: { readonly cssClass: string; readonly label: string }, where cssClass is one of the sc1 marker classes (insrc-term__marker--pending|tool|edit|done|error). Type-only; vscode-free. New module vscode-plugin/src/chat/markers.ts (markerFor + markerWebviewSource + a MARKER_CLASS map). Not a shared contract — S004 owns no contract; markers.ts is consumed only within the chat area.

```
+ export interface MarkerLine { readonly cssClass: string; readonly label: string; }
+ export function markerFor(event: TurnEvent): MarkerLine | null;
+ export function markerWebviewSource(): string;
```

**Call sites:**
- `vscode-plugin/src/chat/markers.ts (definition; consumed by chat-panel.ts host appendEvent (:205) + the widened webview line() (:88-89) fall-through)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | markerFor emits exactly the sc1 marker CSS classes (insrc-term__marker--pending\|tool\|edit\|done\|error) that renderTerminalStyle already defines with glyph (::before content) + phosphor tone; S004 does not modify design-tokens.ts — it only references the class names. |
| `sc2` | consumes | markerFor is a pure total mapper over the sc2 TurnEvent union (status phases, tool-call incl. mcp, file-edit, done, error, assistant-delta); it reads the union as-is and never reshapes it. |
| `sc3` | consumes | Markers ride the EXISTING sc3 'turn-event' message — no new message type/field. The webview computes the marker from the live event via the embedded markerWebviewSource(); S004 adds nothing to the protocol (no amendment). |

## Error paths

### Error cases

- **A TurnEvent arrives with a kind markerFor does not map (adapter drift / a future sc2 kind added by S002 before S004 catches up).** (recoverable)
  - Detection: markerFor's discriminated switch over TurnEvent.kind falls through to its default branch (no matching case); the TypeScript exhaustiveness check (`const _never: never = event`) also flags it at build if the union grew.
  - Response: Return null (treated exactly like assistant-delta at the render seam): the webview line() fall-through and host appendEvent render NO marker row rather than a bracketed placeholder or a throw.
  - User impact: An unknown event is silently skipped instead of crashing the panel or painting a raw '[kind]'; the turn keeps streaming.
- **The webview receives a turn-event whose event payload is malformed (null, missing kind, or non-object) — e.g. a corrupted postMessage.** (recoverable)
  - Detection: The inline markerWebviewSource() function guards `event && typeof event.kind === 'string'` before switching (mirrors the host handleMessage envelope guard).
  - Response: Skip: render no marker line for that message (the existing S003 `if(!m)return` envelope guard already drops a malformed envelope; the marker guard covers a well-formed envelope with a bad event).
  - User impact: A malformed event produces no visible marker rather than an uncaught error inside the one nonce'd script (which would break all further rendering).
- **markerWebviewSource() (the inline webview mapper) drifts from the host markerFor() — the two compute a different cssClass/label for the same event.** (recoverable)
  - Detection: A parity unit test executes BOTH the host markerFor and the eval'd markerWebviewSource() source over a fixed sample of every TurnEvent kind and asserts the {cssClass,label} results are identical; drift fails the build.
  - Response: Build fails (red suite) before ship — the single-source contract is enforced at test time, not left to runtime divergence.
  - User impact: Host transcript rows and live webview markers can never disagree in a shipped build; a drift is caught by the author, never seen by the user.

### Edge cases

| Input | Expected |
| :--- | :--- |
| done event with ok=false (the turn ended in failure). | markerFor -> { cssClass: 'insrc-term__marker--done', label: 'done (failed)' } (done glyph ✓ in the accent tone; the failure is conveyed in the label). A separate error event, if emitted, still renders its own error marker. |
| tool-call event WITHOUT an mcp field (a plain CLI tool, not an insrc MCP call). | markerFor -> { cssClass: 'insrc-term__marker--tool', label: ev.tool } — the bare tool name, no server prefix. |
| tool-call event WITH mcp { server, name } (an observed insrc MCP call — ac2). | markerFor -> { cssClass: 'insrc-term__marker--tool', label: `${mcp.server} · ${mcp.name}` } — the marker NAMES the observed activity without the extension driving it (k8 passthrough). |
| Repeated status events within one turn (thinking -> tool -> streaming -> editing -> ...). | Each maps to its pending/tool/edit marker and appends a fresh cheap status line; markers are not deduped or collapsed (the transcript is an append-only log of what happened). |
| assistant-delta event. | markerFor returns null; the delta text renders as plain streamed terminal text (no marker glyph/class), exactly as S003 did. |
| status event with phase 'streaming' arriving before any assistant-delta. | markerFor -> { cssClass: 'insrc-term__marker--pending', label: 'streaming…' }; the pending marker paints even with an empty transcript body. |

### Invariants to preserve

- The webview keeps EXACTLY ONE nonce'd inline <script> under the strict per-render CSP (script-src 'nonce-...'): S004 widens line() and injects markerWebviewSource() INSIDE that same script; it adds no second <script>, no remote origin, no asWebviewUri. (s1 bundle: chat-panel.ts render seam :80-101.) [[c1]]
- Marker rows render via textContent only (never innerHTML); markerClass adds only a class attribute to the row <div>. The S003 no-XSS invariant on assistant/tool/edit text holds. (s1 bundle: chat-panel.ts:88 line() textContent.) [[c1]]
- markerFor and the webview marker path never invoke an insrc workflow/MCP tool: they only observe and render sc2 events. The extension stays a passthrough, not an orchestrator (k8). (s1 bundle: chat-panel.ts passthrough turn loop.) [[c2]]
- The sc3 protocol is unchanged: markers ride the EXISTING 'turn-event' message; S004 adds no new HostToWebview/WebviewToHost variant or field, and does not modify design-tokens.ts (sc1) or stream-events.ts (sc2). (s1 bundles: sc1 marker classes; sc2 TurnEvent union.) [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via tsx --test (no vscode runtime; FakePanel + source-scans, matching design-tokens.test.ts / chat-panel.test.ts)`

### Test levels

- **unit** — Pin markerFor as a pure, total mapper over the sc2 TurnEvent union: every kind -> the right sc1 cssClass + enriched label (or null for assistant-delta), deterministic and vscode-free.
  - Subjects: `markerFor(status{thinking|streaming|tool|editing}) -> pending/pending/tool/edit class + 'thinking…'/'streaming…'/'running tool…'/'editing…' label`, `markerFor(tool-call) -> tool class; label = ev.tool when no mcp, `${server} · ${name}` when mcp present (ac2)`, `markerFor(file-edit) -> edit class + path label; markerFor(done{ok:true|false}) -> done class + 'done'/'done (failed)'; markerFor(error) -> error class + message`, `markerFor(assistant-delta) -> null; markerFor(unknown/forward kind) -> null (no throw)`, `every returned cssClass is one of the five insrc-term__marker--* stems that renderTerminalStyle defines`
  - Fixtures: `one sample TurnEvent per kind (incl. tool-call with and without mcp, done ok true/false)`
- **unit** — Guard the host<->webview single-source: the eval'd markerWebviewSource() output computes the identical {cssClass,label} as markerFor for every kind, and the source stays CSP-safe.
  - Subjects: `for each sample event, eval(markerWebviewSource()) and assert its {cssClass,label} deepEquals markerFor(event) (drift fails the build)`, `markerWebviewSource() references only the five marker classes; contains no import / http(s): / asWebviewUri / vscode token`
  - Fixtures: `the same per-kind TurnEvent sample set`, `a tiny eval harness that exposes the webview mapper fn from its source string`
- **contract** — Assert the rendered webview shell wires markers through the new path and preserves the S003 CSP/XSS invariants (no drift into S003-owned shell internals).
  - Subjects: `renderShell() output routes the non-assistant-delta turn-event through the marker mapper (applies an insrc-term__marker--* class), NOT the old bare '['+kind+']' fall-through`, `the shell still has EXACTLY ONE <script nonce=...> and the strict CSP (script-src 'nonce-...'); line() still uses textContent, never innerHTML`, `renderTerminalStyle output (sc1) is unchanged by S004 (design-tokens.ts not modified) and defines all five marker ::before rules the classes rely on`
  - Fixtures: `render the shell via createChatPanelHost with a FakePanel + injected genNonce`
- **integration** — Drive a realistic turn through createChatPanelHost with a fake StreamAdapter and assert both the posted turn-events and the persisted transcript get marker rows for status/done (the S003 gap) as well as tool-call/file-edit/error.
  - Subjects: `a status(thinking)->tool-call(mcp)->status(streaming)->file-edit->done(ok:true) sequence posts a turn-event per event AND appendEvent records a role:'marker' row for status and done (previously dropped) with markerFor(ev).label`, `an insrc MCP tool-call (mcp:{server:'insrc',name:'insrc_analyze_step'}) yields a marker row labelled 'insrc · insrc_analyze_step' and the host never invokes any workflow tool (k8 passthrough — fake adapter is the only side-effecting collaborator)`, `assistant-delta still -> role:'assistant' (no marker row); the errored-turn persistence from S003 still holds`
  - Fixtures: `fake StreamAdapter/ProviderRegistry emitting a scripted TurnEvent sequence (reuse the chat-panel.test.ts harness)`, `in-memory ChatSessionStore double`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: markerFor(status thinking/streaming/tool/editing) + done -> the correct pending/tool/edit/done sc1 class + label`, `contract: rendered shell routes non-delta turn-events to an insrc-term__marker--* class (not the bare bracket) under the one-nonce'd-script CSP`, `integration: a status->...->done turn posts marker turn-events and persists status+done marker rows` |
| `ac2` | `unit: markerFor(tool-call with mcp{server,name}) -> tool class + label `${server} · ${name}` (bare ev.tool when no mcp)`, `integration: an insrc MCP tool-call renders an enriched 'insrc · <tool>' marker while the host invokes no workflow tool (k8 passthrough)` |

## Migration

**State before:** S003 shipped the terminal chat panel behind flag insrc.chat.enabled (default off). In the webview bootstrap, line(s) sets textContent on a bare <div> with no class, and the non-assistant-delta fall-through renders every event as the bare '['+ev.kind+']' with no glyph/tone (s1 bundle: chat-panel.ts:88-89); the restore path replays rows via the same unstyled line (chat-panel.ts:90). Host-side, appendEvent already writes role:'marker' transcript rows for tool-call/file-edit/error but produces NO row for status or done (s1 bundle: chat-panel.ts:205-209). sc1 already defines the five insrc-term__marker--pending|tool|edit|done|error ::before glyph+tone rules (s1 bundle: design-tokens.ts renderTerminalStyle), but nothing maps a TurnEvent onto them. There is no markers.ts.

**State after:** A new pure vscode-free markers.ts exports markerFor(event)->MarkerLine|null + markerWebviewSource()->string (single-sourced mapper). The webview line() is widened to line(text, markerClass?) and the non-delta fall-through routes through the embedded markerWebviewSource() so each non-delta event paints with its sc1 marker class + enriched label instead of the bare bracket; the restore path replays rows unchanged (plain text). Host appendEvent derives every marker row's label from markerFor(ev) and now also records status and done rows (the S003 gap), while assistant-delta still -> role:'assistant'. sc1/sc2/sc3 are untouched; the panel stays behind insrc.chat.enabled.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new module markers.ts (MarkerLine type + pure markerFor + markerWebviewSource) alongside its unit + parity suites. Purely additive; nothing imports it yet. — ↩ rollbackable
2. Widen the webview writer to accept an optional marker class and set it on the row <div> (still textContent only), and route the non-assistant-delta fall-through through the embedded markerWebviewSource() mapper so a non-delta event applies its sc1 marker class + label instead of '['+kind+']'. Assistant-delta and the session-restore replay path are unchanged. — ↩ rollbackable
3. Point host appendEvent's marker-row labels at markerFor(ev) and add the previously-missing status and done marker rows; keep assistant-delta -> role:'assistant' and preserve the errored-turn persistence behaviour. — ↩ rollbackable
4. Extend the contract/rendered-shell test to assert the shell routes non-delta events to an insrc-term__marker--* class (not the bare bracket) while keeping exactly one nonce'd script + strict CSP; run the full sweep. — ↩ rollbackable

**Backward compat:** line() gains an OPTIONAL second parameter (markerClass?) so all existing call sites remain valid; it is an inline-bootstrap-local function, not an exported public API. appendEvent keeps its (session, event) signature and its assistant-delta/tool-call/file-edit/error behaviour; it only ADDS status+done marker rows (previously silently dropped) — a strictly additive change to the transcript. No exported/public API is removed or reshaped; sc1/sc2/sc3 contracts are unchanged, so S003/S005/S006/S007 are unaffected.

## Alternatives considered

### a1: Single-source pure markers.ts consumed by BOTH host + webview (full sc1 tone) — **CHOSEN**

A new pure markers.ts maps each TurnEvent to a MarkerLine {cssClass (one of the sc1 .insrc-term__marker--* classes), label}; the host uses it for transcript rows and the S003 webview bootstrap applies the class via a widened line(text, cssClass?) so live markers render with the sc1 glyph + phosphor tone. No sc3/sc4 change.

Add vscode-plugin/src/chat/markers.ts (vscode-free, pure): markerFor(event: TurnEvent): { cssClass: string; label: string } | null — assistant-delta -> null (plain text); status{phase} -> pending/tool/edit class + a phase label ('thinking…', etc.); tool-call -> --tool class + enriched label (mcp ? `${mcp.server} · ${mcp.name}` : tool); file-edit -> --edit + path; done -> --done + (ok?'done':'done (failed)'); error -> --error + message. cssClass values are exactly the sc1 classes renderTerminalStyle already emits. To keep the webview mapping single-sourced (the bootstrap is an inline JS string), markers.ts ALSO exports the tiny mapping as data/a snippet the chat-panel bootstrap embeds; S004 widens the webview line() to line(text, cssClass?) so a marker row is a <div class="insrc-term__marker--X">label</div> (::before paints the glyph+tone). Host-side appendEvent is filled in for the status/done gap using the same markerFor label. Live turn-events get full glyph+tone; restored transcript rows keep their existing marker-role text (no sc4 field added). Purely additive marker slice inside chat-panel.ts + the new markers.ts; no channel/session/CSP change.

### a2: Host bakes the sc1 glyph into the marker text; webview stays unchanged

markers.ts computes a marker string that PREPENDS the sc1 glyph char to the label (e.g. '▸ insrc · insrc_analyze_step'); the host writes that as the transcript/marker text and the webview prints it plain — no widened line(), no CSS classes.

markers.ts maps each TurnEvent to a single display string `${glyph} ${label}` using terminalTheme.marker glyphs + the mcp enrichment. The host posts these (and stores them in transcript rows), and the existing webview line(text) prints them verbatim — zero webview/bootstrap change. Because the glyph is IN the text, both live and restored rows show the marker glyph identically.

**Rejected because:** Simplest and covers restore uniformly, and markerFor stays testable — but it scores partial on ac1 and sc1 because baking the glyph into plain text drops the sc1 phosphor tone (k6's marker color), and it couples persisted transcript text to the current glyph set. Loses to a1 on styling fidelity.

### a3: Webview-inline marker mapping, no shared module

Hand-write the TurnEvent->marker-class+label mapping directly inside the webview bootstrap string; the host keeps its plain-text transcript rows unchanged.

Extend only the inline bootstrap: replace the `'['+ev.kind+']'` fall-through with an inline switch that picks the sc1 marker class + label per kind and renders a classed <div>. No markers.ts module; the host transcript rows stay as they are.

**Rejected because:** Full styling but the mapping is un-unit-testable (buried in the inline bootstrap string) and DRIFTS from the host transcript logic — partial on ac2 and sc2. a1 gets the same styling with a single-sourced, tested mapper.

## Citations

- **[[c1]]** `analyze-bundle` `s1 analyze bundle: chat-panel.ts:80-101/88-90/205-209 render seam + host appendEvent` — "the fall-through at :89 renders every NON-assistant-delta event as the bare '['+ev.kind+']'; appendEvent writes role:'marker' rows for tool-call/file-edit/error but NOT for status or done"
- **[[c2]]** `analyze-bundle` `s1 analyze bundle: design-tokens.ts renderTerminalStyle sc1 marker classes + sc2 TurnEvent union` — "renderTerminalStyle emits five marker rules .insrc-term__marker--pending|tool|edit|done|error with glyph (::before) + tone"
- **[[c3]]** `step-output` `s3 judge: winnerId a1 (single-source pure markers.ts consumed by host+webview, full sc1 tone)` — "a1 satisfies every acceptance criterion and every touched contract with the full sc1 marker styling ... single-sourced across host+webview"
- **[[c4]]** `prior-artifact` `HLD edb76e2e4d41217d: sc1/sc2/sc3 consumedContracts; S004 boundary.owns=[]` — "boundary s4 owns:[] depends:[sc1,sc2,sc3]; renders sc2 events as sc1-styled markers over sc3"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-25T17:36:46.227Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contractDetails/line | citation | LOW | manual | chat-panel.ts:88 defines the webview writer line(s) that sets textContent on a created <div> (the S003 writer S004 widens). | CONFIRMED by the tool's path-anchored read: chat-panel.ts:88 = `function line(s){const d=document.createElement('div');d.textContent=s;...}` — the S003 writer S004 widens. Accurate. | No change — citation resolves verbatim. |
| migration/stateBefore | citation | LOW | manual | The non-assistant-delta fall-through at chat-panel.ts:89 renders every non-delta event as the bare '['+ev.kind+']' (no glyph, no CSS class). | CONFIRMED by read: chat-panel.ts:89 = the message handler rendering `line(ev.kind==='assistant-delta'?ev.text:'['+ev.kind+']')` — the bare-bracket non-delta fall-through. Accurate. | No change — citation resolves verbatim. |
| contractDetails/appendEvent | citation | LOW | manual | The host appendEvent writer is at chat-panel.ts:205 and writes role:'marker' transcript rows for tool-call/file-edit/error but NOT for status or done. | CONFIRMED: chat-panel.ts:205 appendEvent writes role:'marker' rows for tool-call/file-edit/error, and its trailing comment "'status'/'done' are transient markers — not persisted as transcript rows" proves the status/done gap the LLD targets. Accurate. | No change — citation + gap resolve verbatim. |
| interactionWithShared/sc1 | citation | LOW | manual | design-tokens.ts renderTerminalStyle emits the five marker CSS classes insrc-term__marker--pending\|tool\|edit\|done\|error (with ::before glyph + tone) that markerFor's cssClass values reference. | CONFIRMED by direct grep of vscode-plugin/src/chat/design-tokens.ts: 5 `insrc-term__marker--` occurrences + renderTerminalStyle present (the tool's own greps were scoped to the backend src/ root and returned 0, i.e. hollow; verified against the real subtree). Accurate. | No change — the five sc1 marker classes exist as cited. |
| dataModelChanges/MarkerLine | citation | LOW | manual | markers.ts does not yet exist in vscode-plugin/src/chat/ — it is a NEW module this LLD introduces (markerFor + markerWebviewSource + MarkerLine). | CONFIRMED: `ls vscode-plugin/src/chat/markers.ts` -> No such file. markers.ts is correctly a NEW module (change:'new' is truthful). | No change — new module, no collision. |
| contractDetails/markerFor | closed-union | LOW | manual | The sc2 TurnEvent union markerFor maps over has exactly these kinds: assistant-delta, tool-call, file-edit, status, done, error — and tool-call carries an optional mcp{server,name}. | CONFIRMED by grep of stream-events.ts: exactly the six kinds assistant-delta/tool-call/file-edit/status/done/error, and tool-call carries optional mcp. The closed-union markerFor maps over is accurate. | No change — union matches sc2. |
| interactionWithShared/sc3 | semantic | LOW | manual | The sc3 protocol carries a 'turn-event' HostToWebview message that markers ride on; S004 adds no new message type (protocol.ts already defines type:'turn-event'). | CONFIRMED: protocol.ts contains type:'turn-event' (1) and HostToWebview (2). Markers ride the existing message; no new protocol type needed. Accurate. | No change — sc3 unchanged as claimed. |
| testStrategy/testFramework | citation | LOW | manual | The test homes design-tokens.test.ts and chat-panel.test.ts exist under vscode-plugin/src/chat/__tests__/ and use node:test (the framework S004's suites extend). | CONFIRMED: both __tests__/design-tokens.test.ts and __tests__/chat-panel.test.ts exist and import from 'node:test'. The framework claim is accurate. | No change — test homes + framework resolve. |
