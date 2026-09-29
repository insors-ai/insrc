<!-- insrc:artifact LLD-8e8859ca0ca83612-s4 -->

# LLD: E202609298e8859ca:S004

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**HLD base run:** `wf-1790676258005-32feqt`
**HLD effective hash:** `f5c70630aa71...`

S004 adds a selection-options widget to the dev-chat: when the agent needs the user to pick among choices it presents them as selectable controls (single- or multi-select) with a confirm, the webview relays the chosen option(s) back over a new additive selection-decision message, the host continues the run with a synthesized user turn conveying the choice, and a persisted selection-outcome row records what was chosen so it survives reload. The live prompt is emitted as a new selection-request TurnEvent (parsed by the CLI adapter from a typed marker the model writes) and stays live-only (never persisted); everything is additive over the one dev-chat render pipeline behind insrc.chat.enabled, mirroring the proven approval round-trip. Two openQuestions: the exact marker syntax + steering the model to emit it.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-8e8859ca0ca83612** § 2. Framework summary

**Rollout phase:** Phase C — Selection widget
**Owns:** `undefined` (undefined)
**Consumes:** `undefined` (undefined)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: tool-output row — out of scope. — owns `sc1`
- `s2`: input row + width — out of scope.
- `s3`: approval resolved card + permission-outcome — out of scope (separate path). — owns `sc2`

## 2. Contract details

**Surface level:** internal

### 2.1 `SelectionRequestEvent (stream-events.ts) — additive TurnEvent member`

```typescript
interface SelectionRequestEvent { readonly kind: 'selection-request'; readonly turnId: string; readonly requestId: string; readonly prompt: string; readonly options: readonly { readonly id: string; readonly label: string }[]; readonly multi?: boolean }  // + 'selection-request' in TURN_EVENT_KINDS
```

**Returns:** `TurnEvent` — The live-only prompt carrying the options; rides the existing {type:'turn-event',event} plumbing. Existing kinds unchanged (k1). markerFor->null (live-only, k2).

**Postconditions:**
- A selection prompt can be delivered + rendered without persisting.

### 2.2 `claudeMapper/codexMapper.mapLine (cli-adapter.ts) — selection-request origin (marker parse)`

```typescript
mapLine(line: string, turnId: string, state: TurnState): TurnEvent[]  // + a branch detecting a typed selection marker in assistant text
```

**Returns:** `TurnEvent[]` — On a typed selection marker (a fenced JSON block, e.g. ```insrc:select {prompt, options:[{id,label}], multi?} ```) mapLine emits a selection-request AND strips the raw marker from the visible assistant-delta. A partial/streamed marker is buffered in TurnState; a turn with no marker behaves exactly as today (lc1).

**Errors:**
- `malformed-marker` when The fenced block is not valid JSON or lacks prompt/options — left as ordinary assistant text (no event), never throwing.

**Preconditions:**
- The exact marker syntax + steering the model to emit it are OPEN QUESTIONS.

**Postconditions:**
- ac1 origin: a real model turn can present options; a non-marker turn is unaffected.

### 2.3 `RowKind + SelectionOutcomeRowView + toViewModel + register('selection-request'|'selection-outcome') (render-registry.ts) — additive`

```typescript
type RowKind = /* existing */ | 'selection-request' | 'selection-outcome';  toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel  // + branches; register(...) for the live selection card + the resolved chip
```

**Returns:** `void / RowViewModel` — A live selection-request renders a card (single=radio chips / multi=checkbox chips + confirm). A selection-outcome renders a resolved non-actionable chip listing the chosen label(s). toViewModel maps the replayed entry AND the live outcome to one view (dual-input), mirroring S001/S003, in BOTH the module + the eval'd renderRegistryWebviewSource (parity test extended). textContent/className only (k1/k3).

**Postconditions:**
- ac1: options render as selectable single/multi controls; ac3: the resolved chip replays on reload.

### 2.4 `onSelectionDecision sink + SelectionDecision message (render-registry.ts + protocol.ts) — additive relay`

```typescript
// render-registry: onSelectionDecision(cb: (requestId: string, selected: readonly string[]) => void): void
// protocol.ts: | { readonly type: 'selection-decision'; readonly requestId: string; readonly selected: readonly string[] }  // + 'selection-decision' in WEBVIEW_TO_HOST_TYPES
```

**Returns:** `void / WebviewToHost` — The card's confirm calls the decision sink (registered like onApprovalDecision at chat-panel.ts:361); the webview posts the additive {type:'selection-decision',requestId,selected[]}. Existing messages + WEBVIEW_TO_HOST_TYPES otherwise unchanged (lc1/k1).

**Postconditions:**
- The confirmed choice is conveyed to the host over one additive message.

### 2.5 `selection-decision host handler + pendingSelections + run continuation (chat-panel.ts) — additive onMessage case`

```typescript
case 'selection-decision': { /* pendingSelections.get(requestId); record selection-outcome; runTurn(<choice>) */ }  // + const pendingSelections = new Map<string, { options }>()
```

**Returns:** `void` — Mirrors the permission-decision handler (chat-panel.ts:745): a pendingSelections Map keyed by requestId; on a decision the host records a persisted selection-outcome (live-emit via the same toViewModel/renderer, like S003's recordPermissionOutcome) AND continues the run via a synthesized user turn conveying the chosen label(s)/id(s). Unknown/stale requestId is a safe no-op. Existing cases unchanged.

**Errors:**
- `unknown-requestId` when A selection-decision with no pending entry (stale/duplicate) records no outcome and continues no run — a safe no-op, mirroring the permission-decision stale path.

**Preconditions:**
- A selection-request was surfaced for this requestId.

**Postconditions:**
- ac2: the run continues based on the selection; ac3/k2: the outcome persists, the live prompt does not.

## 3. Data model changes

### 3.1 `TranscriptEntry (session-store.ts)` — field-add

Add a plain-serialisable variant { role: 'selection-outcome'; chosen: readonly string[]; at } (matching the role-discriminant convention S001 tool-result / S003 permission-outcome use). Round-trips both stores. The pending selection-request is NOT persisted (markerFor->null); only the resolved outcome enters the durable transcript.

```
TranscriptEntry = /* existing */ | { role: 'selection-outcome'; chosen: readonly string[]; at: number }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/markers.ts`
- `vscode-plugin/src/chat/render-registry.ts`

### 3.2 `markerFor (markers.ts:43-85)` — field-add

Add cases: selection-request -> null (live-only, k2); selection-outcome -> null too (persisted structurally via the transcript push, like tool-result/permission-outcome). Preserve the exhaustive-switch never-default.

```
markerFor(event): MarkerLine | null  // + case 'selection-request': null; case 'selection-outcome': null (structured persist)
```

**Call sites:**
- `vscode-plugin/src/chat/markers.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | S004 owns sc3 and instantiates BOTH patterns per its interfaceSketch: (P2 live prompt) the additive selection-request TurnEvent + its live selection card, markerFor->null; (P2 relay) the additive {type:'selection-decision',requestId,selected[]} message + the pendingSelections host handler that continues the run via a synthesized user turn; (P1 outcome) the additive selection-outcome RowKind + SelectionOutcomeRowView + dual-input toViewModel + plain-serialisable TranscriptEntry + resolved-chip renderer. The CLI-adapter marker parse supplies the origin. Existing events/messages/persistence are UNCHANGED (k1); the approval/permission path is untouched (k4). |

## 5. Error paths

**Error cases**

- **A selection-decision arrives for a requestId with no pending selection (stale/duplicate/already-resolved).** (recoverable)
  - Detection: The selection-decision handler looks up pendingSelections.get(requestId) and finds undefined (mirrors pendingPerms.get at chat-panel.ts:754).
  - Response: Records no outcome, continues no run — a safe no-op; the entry is deleted on the first decision so a duplicate finds nothing.
  - User impact: A late/duplicate confirm does nothing; no double run, no spurious outcome row.
- **The model emits a malformed selection marker (bad JSON or missing prompt/options).** (recoverable)
  - Detection: The mapLine parse branch attempts JSON.parse of the fenced block inside try/catch and validates prompt + a non-empty options array.
  - Response: No selection-request is emitted; the block is left as ordinary assistant text (an assistant-delta), never throwing.
  - User impact: The user sees the raw text instead of a widget for that malformed prompt; the run is otherwise unaffected.
- **A selection marker is split across multiple streamed assistant-delta chunks.** (recoverable)
  - Detection: mapLine holds an in-progress marker buffer in the per-turn TurnState; an unclosed fence leaves the buffer pending rather than emitting.
  - Response: The event emits only once the closing fence arrives and the block parses; a half-marker never emits and never leaks a partial raw fence.
  - User impact: The widget appears once the full marker has streamed; no flicker.
- **A persisted transcript is loaded from an older (pre-S004) session with no selection-outcome entries.** (recoverable)
  - Detection: Store validation accepts the union without the new variant (additive/optional); replay encounters none.
  - Response: toViewModel + the selection renderers are never invoked for the new kinds; the transcript replays exactly as before (no migration).
  - User impact: Older chats load unchanged.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A single-select prompt (multi absent/false). | Radio-style chips where choosing one deselects the others; confirm posts selected:[oneId]. |
| A multi-select prompt with zero options chosen at confirm. | Confirm is disabled/no-op until >=1 option is selected, so selected[] is never empty on a posted decision (mirrors doSubmit's non-empty guard). |
| A multi-select prompt with several options chosen. | confirm posts selected:[id1,id2,...]; the persisted chip lists all chosen labels; the continuation conveys all chosen labels. |
| The selection card is confirmed, then the session is reloaded. | The pending card (live-only, markerFor->null) does not reappear; the persisted selection-outcome replays as a non-actionable resolved chip (ac3). |
| A turn with NO selection marker. | Unchanged: mapLine emits the usual events; no selection-request, no new message (lc1). |
| A duplicate option id in the marker's options array. | The renderer keys chips by array index so duplicate ids render distinctly; the continuation conveys labels so ambiguity is user-visible — noted as a marker-authoring concern for the openQuestion. |

**Invariants to preserve**

- The selection round-trip is ADDITIVE: selection-request (+ TURN_EVENT_KINDS) and selection-decision (+ WEBVIEW_TO_HOST_TYPES) are new members; every existing event, message, and behaviour is unchanged, and a turn without a marker behaves as before (lc1/k1). [[c3]]
- The pending selection-request stays LIVE-ONLY: markerFor->null, appended un-keyed (mirroring approval-request at chat-panel.ts:412), never in the durable transcript; only the resolved selection-outcome is persisted (k2/ac3). [[c1]]
- The selection surface is SEPARATE from the approval/permission-decision + resume-grant flow: S004 touches neither pendingPerms nor runTurn's grant path (k4); it reuses the same plumbing shapes (turn-event router, decision-sink registration at chat-panel.ts:361, a pending-Map keyed by requestId) additively. [[c2]]
- The persisted selection-outcome TranscriptEntry is plain-serialisable (role:'selection-outcome', chosen:string[]) and round-trips both stores, mirroring S001 tool-result / S003 permission-outcome. [[c1]]
- Both the module toViewModel/renderer and the eval'd renderRegistryWebviewSource inline copy gain the selection branches, kept byte-parity by the existing parity test (k3). [[c1]]

## 6. Test strategy

**Test framework:** `node:test (tsx --test) — colocated vscode-plugin/src/chat/__tests__/: chat-panel.test.ts (eval'd *WebviewSource + fakeChannel/scriptedAdapter) for the widget render + host relay, cli-adapter.test.ts for the marker-parse, session-store.test.ts for the round-trip, protocol.test.ts for the exhaustive WEBVIEW_TO_HOST_TYPES, and markers/render-registry unit tests; live provider turns gated behind INSRC_LIVE_TESTS.`

**Test levels**

- **unit** — Prove the selection card renders single/multi controls and relays the confirmed choice (ac1/ac2).
  - Subjects: `A live selection-request renders a card with the prompt + one selectable control per option; multi absent/false = radio-style, multi:true = checkbox-style.`, `The card's confirm calls the decision sink and the webview posts exactly one {type:'selection-decision',requestId,selected:[...ids]}.`, `A multi-select confirm with zero chosen is a no-op until >=1 option is selected.`, `textContent/className only; no innerHTML/remote; card appended un-keyed (live-only).`
- **unit** — Prove the host relay records the outcome and continues the run (ac2/ac3).
  - Subjects: `On a selection-decision for a pending requestId the host records a persisted selection-outcome AND continues the run via a synthesized user turn conveying the choice.`, `An unknown/stale requestId records no outcome and continues no run; a duplicate decision is a no-op.`, `The approval path (pendingPerms, grant runTurn) is untouched (k4).`
- **unit** — Prove persistence + replay (P1) and the live-only invariant (ac3/k2).
  - Subjects: `A {role:'selection-outcome',chosen,at} TranscriptEntry round-trips both stores intact.`, `toViewModel maps BOTH the replayed entry and the live outcome to the same SelectionOutcomeRowView (dual-input); the resolved chip lists the chosen label(s), non-actionable.`, `markerFor returns null for selection-request so a replay does NOT re-surface the pending card; never-default preserved.`, `The renderRegistryWebviewSource parity test gains selection-request + selection-outcome samples and stays green.`
- **unit** — Prove the marker-parse origin + additive protocol (ac1 origin / lc1 / k1).
  - Subjects: `mapLine given a scripted line with a valid selection marker emits a selection-request with the parsed prompt/options/multi AND strips the raw marker.`, `A malformed marker emits NO selection-request and leaves the text as an assistant-delta (no throw).`, `A marker split across two streamed lines emits only when the closing fence arrives; a half-marker never emits.`, `A line with NO marker emits the usual events unchanged (lc1).`, `protocol: 'selection-decision' is in WEBVIEW_TO_HOST_TYPES (exhaustiveness test passes); existing types unchanged.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `A live selection-request renders a card with one selectable control per option (radio single / checkbox multi)`, `mapLine parses a valid marker into a selection-request (origin) and strips the raw marker` |
| `ac2` | `The card's confirm posts exactly one {type:'selection-decision',requestId,selected}`, `On a selection-decision the host records the outcome AND continues the run via a synthesized user turn conveying the choice`, `A multi-select confirm with zero chosen posts nothing (guard)` |
| `ac3` | `A {role:'selection-outcome',chosen,at} TranscriptEntry round-trips both stores and replays as a non-actionable resolved chip listing the chosen option(s)`, `markerFor returns null for selection-request so the pending card does not re-surface on reload` |

## 7. Migration

**State before:** Today the dev-chat has NO selection surface. TurnEvent has no selection kind; protocol.ts has no selection message; render-registry has no selection RowKind/renderer; there is no pendingSelections handler. The only interactive round-trip is approval: claude system/permission_denied -> mapLine (cli-adapter.ts:216/316) -> approval-request -> register('approval') card (render-registry.ts:315-330) appended un-keyed (chat-panel.ts:412, markerFor->null) -> {type:'permission-decision'} (chat-panel.ts:361) -> case 'permission-decision' (:745-796) with pendingPerms(:138). A model cannot present selectable options; the user replies free-form.

**State after:** A new selection surface exists, additive and mirroring approval end-to-end: mapLine parses a typed selection marker into a selection-request (buffering partials, stripping the marker); a selection card renders single/multi controls + confirm; confirm posts {type:'selection-decision',requestId,selected[]}; a case 'selection-decision' host handler keyed by pendingSelections records a persisted selection-outcome and continues the run via a synthesized user turn; the selection-outcome is a plain-serialisable role:'selection-outcome' entry replayed as a resolved chip, while the pending selection-request stays markerFor->null. Existing shapes UNCHANGED; the approval path untouched. OpenQuestions: the marker syntax + model-steering.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the selection-request member to TurnEvent + 'selection-request' to TURN_EVENT_KINDS (stream-events.ts). — ↩ rollbackable
2. Add the selection-decision member to WebviewToHost + 'selection-decision' to WEBVIEW_TO_HOST_TYPES (protocol.ts). — ↩ rollbackable
3. Add the 'selection-request' + 'selection-outcome' RowKind members + the SelectionOutcomeRowView payload (render-registry.ts). — ↩ rollbackable
4. Add the plain-serialisable { role:'selection-outcome'; chosen; at } variant to the TranscriptEntry union (session-store.ts). — ↩ rollbackable
5. Add the toViewModel branches + register the selection-request card renderer (single=radio / multi=checkbox + confirm calling onSelectionDecision) and the selection-outcome chip renderer, in BOTH the module and the eval'd renderRegistryWebviewSource; add the onSelectionDecision sink; extend the parity test. — ↩ rollbackable
6. Add markers.ts markerFor cases: selection-request -> null; selection-outcome -> null (structured persistence). Preserve the never-default. — ↩ rollbackable
7. Add the mapLine marker-parse branch (claude + codex): detect the typed marker, buffer partials in TurnState, emit the selection-request, strip the raw marker; malformed markers fall through as assistant-delta. — ↩ rollbackable
8. Add the pendingSelections Map + populate it when a selection-request is surfaced + the case 'selection-decision' host handler (record outcome live-emit+persist + continue the run via a synthesized user turn); register onSelectionDecision alongside onApprovalDecision (chat-panel.ts:361). Leave the permission path untouched. — ↩ rollbackable
9. Add/extend the tests: cli-adapter marker-parse (valid/malformed/split/no-marker), *WebviewSource widget+relay, session-store round-trip, protocol exhaustiveness, markers, render-registry parity samples. — ↩ rollbackable

**Backward compat:** Fully backward-compatible: the selection-request event, selection-decision message, selection-* RowKinds, and the selection-outcome TranscriptEntry are all NEW additive members; every existing event, message, RowKind, renderer, and persisted entry keeps its shape and behaviour, and consumers that ignore the new members are unaffected (k1/lc1). Older transcripts replay unchanged (no data rewrite). The mapLine change only ADDS a branch that fires on a marker the model does not emit today, so a non-marker turn behaves exactly as before. The approval/permission-decision + resume-grant path is a separate surface, untouched (k4). All behind insrc.chat.enabled (k5).

## 8. Alternatives considered

### 8.1 a1: Full selection round-trip incl. adapter marker-parse origin; choice continues the run as a synthesized user turn — **CHOSEN**

Build the whole additive P1+P2 selection contract AND its origin: the cli-adapter parses a typed assistant-text marker into a selection-request; the widget relays the choice via a new selection-decision message; the host records a persisted selection-outcome and continues the run with a synthesized user turn.

Instantiate sc3 end-to-end: selection-request TurnEvent + live selection card (single=radio/multi=checkbox + confirm), the marker-parse origin in mapLine (buffer partials, strip the marker), the additive selection-decision message + onSelectionDecision sink, a pendingSelections host handler that continues the run via a synthesized user turn, and the persisted selection-outcome P1 row. All additive; existing events/messages unchanged; approval path untouched (k4). Verified via the eval'd *WebviewSource + a scripted-adapter line.

### 8.2 a2: Ship the render + protocol + relay + persistence seam; leave the adapter-parse ORIGIN as an openQuestion

Everything in a1 except the cli-adapter marker parse: the round-trip is shipped + verified via a SYNTHESIZED selection-request; the emission trigger (marker format) is an openQuestion / follow-up.

Same additive contract as a1 (event, card, message, host relay, persisted row), but the event is driven only from a synthesized selection-request until a follow-up wires the adapter trigger. The marker syntax + parse are recorded as an openQuestion.

**Rejected because:** ac1/ac2 only PARTIAL (synthesized-only) — it defers the user-visible trigger; a1 meets all ACs end-to-end and is the accuracy-first choice.

### 8.3 a3: Selection widget + relay WITHOUT a persisted outcome row (P2 only, no P1)

Render the card + relay the choice + continue the run, but do NOT persist a selection-outcome.

Add the event + card + message + host relay that continues the run, but skip the P1 persisted selection-outcome (no RowKind/TranscriptEntry/markerFor for the outcome). Chosen state lives only in the live DOM.

**Rejected because:** Violates sc3 + fails ac3 by dropping the persisted outcome the owned contract requires.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 code-map + interactive-roundtrip + protocol-additive bundles — render-registry.ts (RowKind/RowViewModel/toViewModel/register/onApprovalDecision, approval card :315-330), stream-events.ts (TurnEvent + TURN_EVENT_KINDS), protocol.ts (WebviewToHost + WEBVIEW_TO_HOST_TYPES + permission-decision :89-94), markers.ts (markerFor :43-85), session-store.ts (TranscriptEntry + both stores), chat-panel.ts (:361 sink registration, :412 live append, :745-796 permission-decision handler, :138 pendingPerms).`
- **[[c2]]** `prior-artifact` `HLD sc3 interfaceSketch — the P1+P2 selection round-trip shapes (SelectionRequestEvent / SelectionDecision message / selection-outcome RowKind + TranscriptEntry) + the invariant that the selection surface is additive and separate from the approval/grant path (k4).`
- **[[c3]]** `prior-artifact` `Story lc1 — the selection round-trip must be additive to the event stream + the webview<->host protocol; existing message flows unchanged and a turn without a choice prompt behaves as before.`

## 10. Open questions

- Marker syntax: the exact typed-marker format the model writes to trigger a selection-request (e.g. a fenced ```insrc:select {prompt,options:[{id,label}],multi?} ``` JSON block) is a product+protocol decision — the LLD assumes a fenced typed-JSON block but the concrete grammar should be confirmed before build.
- Model steering: the model must be PROMPTED to emit the marker for the widget to fire in production (a steering/prompt concern outside the dev-chat module, k5). Without it the full round-trip is present + testable but rarely triggered. This steering is a follow-up, not part of this story's webview-module code.
- Duplicate/ës option ids in a marker: the renderer keys chips by array index so duplicates render, but the marker author should keep ids unique — a marker-authoring guideline tied to the syntax openQuestion.

## Resolved questions

- `q6b92849a` — Marker syntax: the exact typed-marker format the model writes to trigger a selection-request (e.g. a fenced ```insrc:select {prompt,options:[{id,label}],multi?} ``` JSON block) is a product+protocol decision — the LLD assumes a fenced typed-JSON block but the concrete grammar should be confirmed before build.
  - **resolved**: Fenced typed-JSON block (```insrc:select) — Matches the LLD's assumption + the user's approval; reuses the existing fenced-block scanner and fails safe (renders as a labelled code block in any client that doesn't know the tag). _(2026-09-29T14:15:30.180Z)_
- `q549434d5` — Model steering: the model must be PROMPTED to emit the marker for the widget to fire in production (a steering/prompt concern outside the dev-chat module, k5). Without it the full round-trip is present + testable but rarely triggered. This steering is a follow-up, not part of this story's webview-module code.
  - **resolved**: Defer to a tracked follow-up story — Keeps S004's boundary honest (webview module only, k5); the round-trip ships fully testable via fixtures, and the steering surface (session preamble vs repo steering block) is decided on its own merits as a separate tracked item. _(2026-09-29T14:16:36.227Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 code-map + interactive-roundtrip + protocol-additive bundles — render-registry.ts (RowKind/RowViewModel/toViewModel/register/onApprovalDecision, approval card :315-330), stream-events.ts (TurnEvent + TURN_EVENT_KINDS), protocol.ts (WebviewToHost + WEBVIEW_TO_HOST_TYPES + permission-decision :89-94), markers.ts (markerFor :43-85), session-store.ts (TranscriptEntry + both stores), chat-panel.ts (:361 sink registration, :412 live append, :745-796 permission-decision handler, :138 pendingPerms).`
- **[[c2]]** `prior-artifact` `HLD sc3 interfaceSketch — the P1+P2 selection round-trip shapes (SelectionRequestEvent / SelectionDecision message / selection-outcome RowKind + TranscriptEntry) + the invariant that the selection surface is additive and separate from the approval/grant path (k4).`
- **[[c3]]** `prior-artifact` `Story lc1 — the selection round-trip must be additive to the event stream + the webview<->host protocol; existing message flows unchanged and a turn without a choice prompt behaves as before.`
