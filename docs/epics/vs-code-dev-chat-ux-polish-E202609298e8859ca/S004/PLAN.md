<!-- insrc:artifact PLAN-8e8859ca0ca83612-s4 -->

# Plan: E202609298e8859ca:S004

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**LLD run:** `wf-1790689691287-45a8sv`
**LLD effective hash:** `f5c70630aa71...`

Building S004 is the largest of the epic's four stories: a full end-to-end selection round-trip added additively to the one dev-chat pipeline. It threads a new selection-request event + selection-decision protocol message + selection-outcome P1 row through the type scaffold, renders a single/multi selectable card in the webview, parses a fenced ```insrc:select``` marker out of the model's assistant text (buffering partials) as the origin, and wires a host handler that records the persisted outcome and continues the run with a synthesized user turn. The approval path is untouched (k4); everything is verified via the eval'd *WebviewSource + scripted-adapter tests, and the model-steering to actually emit the marker is a deferred tracked follow-up.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Additive type scaffold: selection-request event + selection-decision message + selection RowKinds + selection-outcome TranscriptEntry + markerFor cases | M | — | unit: protocol: 'selection-decision' is in WEBVIEW_TO_HOST_TYPES (exhaustiveness test passes); existing types unchanged; unit: markerFor returns null for selection-request so a replay does NOT re-surface the pending card; never-default preserved | [[c1]] [[c2]] |
| 2 | **`t2`** Selection card renderer (single/multi) + onSelectionDecision sink + toViewModel dual-input + selection-outcome chip (module + eval'd parity) | M | `t1` | unit: A live selection-request renders a card with the prompt + one selectable control per option; multi absent/false = radio-style, multi:true = checkbox-style; unit: The card's confirm calls the decision sink and the webview posts exactly one {type:'selection-decision',requestId,selected:[...ids]}; unit: A multi-select confirm with zero chosen is a no-op until >=1 option is selected; unit: textContent/className only; no innerHTML/remote; card appended un-keyed (live-only); unit: toViewModel maps BOTH the replayed entry and the live outcome to the same SelectionOutcomeRowView (dual-input); the resolved chip lists the chosen label(s), non-actionable; unit: The renderRegistryWebviewSource parity test gains selection-request + selection-outcome samples and stays green | [[c1]] [[c2]] |
| 3 | **`t3`** cli-adapter marker-parse origin (fenced ```insrc:select```, buffer partials, strip marker) + syntax/uniqueness docs | M | `t1` | unit: mapLine given a scripted line with a valid selection marker emits a selection-request with the parsed prompt/options/multi AND strips the raw marker; unit: A malformed marker emits NO selection-request and leaves the text as an assistant-delta (no throw); unit: A marker split across two streamed lines emits only when the closing fence arrives; a half-marker never emits; unit: A line with NO marker emits the usual events unchanged (lc1) | [[c1]] [[c2]] |
| 4 | **`t4`** chat-panel pendingSelections + selection-decision handler + recordSelectionOutcome + run continuation | M | `t1`, `t2` | unit: On a selection-decision for a pending requestId the host records a persisted selection-outcome AND continues the run via a synthesized user turn conveying the choice; unit: An unknown/stale requestId records no outcome and continues no run; a duplicate decision is a no-op; unit: The approval path (pendingPerms, grant runTurn) is untouched (k4) | [[c1]] [[c2]] |
| 5 | **`t5`** Tests: marker-parse, widget render + relay, host record+continue, round-trip + replay, protocol exhaustiveness | M | `t1`, `t2`, `t3`, `t4` | unit: A {role:'selection-outcome',chosen,at} TranscriptEntry round-trips both stores intact | [[c1]] [[c2]] |

### 1.1 E202609298e8859ca:S004:T001 — Additive type scaffold: selection-request event + selection-decision message + selection RowKinds + selection-outcome TranscriptEntry + markerFor cases

Add the co-compiling type/enum scaffold across the module: the selection-request member to TurnEvent + 'selection-request' to TURN_EVENT_KINDS (stream-events.ts); the {type:'selection-decision',requestId,selected[]} member to WebviewToHost + 'selection-decision' to WEBVIEW_TO_HOST_TYPES (protocol.ts); the 'selection-request'+'selection-outcome' RowKind members + SelectionOutcomeRowView (render-registry.ts types); the plain-serialisable { role:'selection-outcome'; chosen; at } TranscriptEntry variant (session-store.ts); and the markers.ts markerFor cases (selection-request -> null, selection-outcome -> null) preserving the exhaustive never-default. Existing members unchanged (k1).

**Acceptance checks:**
- TurnEvent gains selection-request + TURN_EVENT_KINDS gains 'selection-request'; WebviewToHost gains selection-decision + WEBVIEW_TO_HOST_TYPES gains 'selection-decision'; existing members unchanged.
- RowKind gains 'selection-request' + 'selection-outcome'; a SelectionOutcomeRowView payload exists.
- TranscriptEntry gains the plain-serialisable { role:'selection-outcome'; chosen; at } variant; both stores accept it with no migration.
- markers.ts markerFor returns null for both selection-request and selection-outcome; the _never exhaustive default still compiles.
- tsc compiles the whole scaffold together (no half-added union).

### 1.2 E202609298e8859ca:S004:T002 — Selection card renderer (single/multi) + onSelectionDecision sink + toViewModel dual-input + selection-outcome chip (module + eval'd parity)

In render-registry.ts (module AND the eval'd renderRegistryWebviewSource, kept byte-parity): register the selection-request card renderer — the prompt + one selectable control per option (multi absent/false = radio-style single-select, multi:true = checkbox multi-select) + a confirm; add the onSelectionDecision(cb) sink (mirroring onApprovalDecision) that the confirm calls with (requestId, selected[]), guarded so a multi-select confirm posts nothing until >=1 chosen; add the toViewModel dual-input branches (a replayed selection-outcome TranscriptEntry AND the host-emitted live outcome -> one SelectionOutcomeRowView); register the selection-outcome resolved chip renderer (non-actionable, lists chosen labels). Chips keyed by array index (duplicate-id safe). textContent/className only (k1/k3). Extend the parity test with selection-request + selection-outcome samples.

**Acceptance checks:**
- A live selection-request renders a card with the prompt + one selectable control per option; multi absent/false = radio-style, multi:true = checkbox-style.
- The confirm calls onSelectionDecision(requestId, selected[]); a multi-select confirm with zero chosen is a no-op until >=1 selected.
- toViewModel maps BOTH a replayed selection-outcome entry and the live outcome to the same SelectionOutcomeRowView; the chip is non-actionable and lists the chosen label(s).
- Both the module and the eval'd renderRegistryWebviewSource gain the branches; the parity test (with new samples) stays green.
- textContent/className only — no innerHTML/remote origin.

### 1.3 E202609298e8859ca:S004:T003 — cli-adapter marker-parse origin (fenced ```insrc:select```, buffer partials, strip marker) + syntax/uniqueness docs

Add the mapLine marker-parse branch to claudeMapper AND codexMapper (cli-adapter.ts): detect a fenced ```insrc:select {prompt,options:[{id,label}],multi?} ``` block in the assistant text, JSON.parse + validate (prompt + non-empty options) inside try/catch, emit a selection-request event, and STRIP the raw marker from the visible assistant-delta. Buffer a partial/streamed marker (unclosed fence) in TurnState so a half-marker never emits and never leaks a partial fence. A malformed marker (bad JSON / missing fields) falls through as ordinary assistant-delta (no throw). A line with no marker behaves exactly as today (lc1). Document the ```insrc:select grammar + the option-id-uniqueness authoring guideline (duplicate ids render by index but authors should keep them unique) near the parser.

**Acceptance checks:**
- A scripted assistant line with a valid ```insrc:select marker emits a selection-request with the parsed prompt/options/multi AND strips the raw marker from the visible text.
- A malformed marker (bad JSON or missing prompt/options) emits NO selection-request and leaves the text as an assistant-delta; never throws.
- A marker split across two streamed lines is buffered in TurnState and emits the selection-request only when the closing fence arrives; a half-marker never emits.
- A line with no marker emits the usual events unchanged (lc1); both claudeMapper and codexMapper handle it.
- The ```insrc:select grammar + option-id-uniqueness guideline are documented near the parser.

### 1.4 E202609298e8859ca:S004:T004 — chat-panel pendingSelections + selection-decision handler + recordSelectionOutcome + run continuation

In chat-panel.ts: register the onSelectionDecision sink alongside onApprovalDecision in the webview bootstrap; add a pendingSelections Map keyed by requestId, populated when a selection-request turn-event is surfaced (append the live card un-keyed, like approval); add a `case 'selection-decision':` onMessage handler that on a pending requestId records a persisted selection-outcome (a recordSelectionOutcome helper that live-emits the outcome turn-event via the same toViewModel/renderer AND pushes the role:'selection-outcome' TranscriptEntry + saves, mirroring S003's recordPermissionOutcome) AND continues the run via a synthesized user turn (runTurn conveying the chosen label(s)/id(s)); an unknown/stale requestId (or duplicate after delete) is a safe no-op. Leave the approval/permission path, pendingPerms, and runTurn's grant path UNTOUCHED (k4). Extend the webview turn-event router with selection-request + selection-outcome.

**Acceptance checks:**
- A selection-request turn-event appends the live card un-keyed and populates pendingSelections keyed by requestId.
- A selection-decision for a pending requestId records a persisted selection-outcome (live-emit + transcript push + save) AND continues the run via a synthesized user turn conveying the choice; the entry is deleted so a duplicate is a no-op.
- An unknown/stale requestId records no outcome and continues no run.
- The approval/permission-decision path, pendingPerms, and runTurn's grant path are byte-identical to today (k4).
- The webview turn-event router renders selection-request + selection-outcome live.

### 1.5 E202609298e8859ca:S004:T005 — Tests: marker-parse, widget render + relay, host record+continue, round-trip + replay, protocol exhaustiveness

Add/extend the colocated tests per the LLD test strategy: cli-adapter.test.ts (valid marker -> event + strip, malformed -> no event, split marker -> emit on close, no-marker unchanged); chat-panel.test.ts eval'd *WebviewSource + fakeChannel (card renders single/multi controls, confirm posts exactly one selection-decision, zero-chosen no-op, host records outcome + continues run via synthesized user turn, unknown-requestId no-op, approval path untouched); session-store.test.ts (selection-outcome round-trips both stores); markers.test.ts (selection-request/selection-outcome -> null); render-registry.test.ts parity samples + dual-input toViewModel + reload replay (pending card does not re-surface); protocol.test.ts ('selection-decision' in WEBVIEW_TO_HOST_TYPES exhaustiveness).

**Acceptance checks:**
- Unit tests cover ac1 (card single/multi + marker-parse origin), ac2 (confirm posts selection-decision + host records + continues run + zero-chosen guard), ac3 (round-trip both stores + reload replay + markerFor->null pending).
- cli-adapter marker-parse tests cover valid/malformed/split/no-marker for both mappers.
- The renderRegistryWebviewSource parity test is extended with selection samples and stays green; protocol exhaustiveness test passes.
- tsc clean and the full vscode-plugin suite passes (live tests skip under no INSRC_LIVE_TESTS).

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| A live selection-request renders a card with the prompt + one selectable control per option; multi absent/false = radio-style, multi:true = checkbox-style. | `t2` |
| The card's confirm calls the decision sink and the webview posts exactly one {type:'selection-decision',requestId,selected:[...ids]}. | `t2` |
| A multi-select confirm with zero chosen is a no-op until >=1 option is selected. | `t2` |
| textContent/className only; no innerHTML/remote; card appended un-keyed (live-only). | `t2` |
| On a selection-decision for a pending requestId the host records a persisted selection-outcome AND continues the run via a synthesized user turn conveying the choice. | `t4` |
| An unknown/stale requestId records no outcome and continues no run; a duplicate decision is a no-op. | `t4` |
| The approval path (pendingPerms, grant runTurn) is untouched (k4). | `t4` |
| A {role:'selection-outcome',chosen,at} TranscriptEntry round-trips both stores intact. | `t5` |
| toViewModel maps BOTH the replayed entry and the live outcome to the same SelectionOutcomeRowView (dual-input); the resolved chip lists the chosen label(s), non-actionable. | `t2` |
| markerFor returns null for selection-request so a replay does NOT re-surface the pending card; never-default preserved. | `t1` |
| The renderRegistryWebviewSource parity test gains selection-request + selection-outcome samples and stays green. | `t2` |
| mapLine given a scripted line with a valid selection marker emits a selection-request with the parsed prompt/options/multi AND strips the raw marker. | `t3` |
| A malformed marker emits NO selection-request and leaves the text as an assistant-delta (no throw). | `t3` |
| A marker split across two streamed lines emits only when the closing fence arrives; a half-marker never emits. | `t3` |
| A line with NO marker emits the usual events unchanged (lc1). | `t3` |
| protocol: 'selection-decision' is in WEBVIEW_TO_HOST_TYPES (exhaustiveness test passes); existing types unchanged. | `t1` |

## 3. References

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle — the S004 change surface in vscode-plugin/src/chat/ (current anchors after S003): stream-events.ts TurnEvent + TURN_EVENT_KINDS; protocol.ts WebviewToHost + WEBVIEW_TO_HOST_TYPES + permission-decision template; render-registry.ts RowKind + toViewModel + register + onApprovalDecision + approval card + fallback; session-store.ts TranscriptEntry (role-discriminant, both stores); markers.ts markerFor (exhaustive never-default); chat-panel.ts pendingPerms + sink registration + live approval append + permission-decision handler; cli-adapter.ts mapLine + approval-request emit. Grep-confirmed no selection-* symbol exists today.`
- **[[c2]]** `prior-artifact` `LLD s4 — sc3 interfaceSketch (P1+P2 selection round-trip: SelectionRequestEvent / selection-decision message / selection-outcome RowKind+TranscriptEntry) + the interactionWithShared entry + the resolved openQuestions (fenced ```insrc:select``` grammar; steering deferred; duplicate-id guideline-only); the invariant that the selection surface is additive and separate from the approval/grant path (k4).`
