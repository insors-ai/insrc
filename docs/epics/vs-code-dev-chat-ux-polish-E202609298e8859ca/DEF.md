<!-- insrc:artifact DEF-8e8859ca0ca83612 -->

# Epic: vs-code-dev-chat-ux-polish

## Summary

**Flavor:** enhancement

This Epic makes the in-editor dev-chat read and behave like the terminal-style agent surface it imitates. Tool activity becomes legible at a glance (the command, then its output, with long output collapsed to a short preview you can expand), the agent's own responses get the width and full-height treatment they deserve, the input reads as a real terminal prompt, permission cards settle into a clear approved/rejected state without leaving a confusing extra line in the transcript, and the agent can offer the user concrete choices to pick from when it needs direction. The result is a panel that is easier to follow, audit, and steer.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

The dev-chat panel is usable but its transcript and input do not read the way a developer expects a terminal-style agent chat to read, which erodes trust in what the agent is doing. Tool activity is the worst offender: the result of a tool the agent ran is frequently not shown at all, and when it is shown it fills the transcript at full height, so a reader cannot quickly see what command ran versus what it returned, and long outputs bury the surrounding conversation. The agent's own prose, by contrast, is cramped into a narrow column that leaves large empty space, making the primary content harder to read than the noise around it. The message box does not read as a terminal prompt and its prompt glyph is inert, so the surface feels unlike the tool it is imitating. The permission gate is confusing after the fact: once a request is approved or rejected its action buttons remain live and clickable, and an approval additionally drops a synthesized instruction line into the transcript as if the user had typed it, so the record of what happened around a permission decision is ambiguous. Finally, when the agent needs the user to choose between options to proceed, there is no way to present those choices — the user must infer them from prose and reply free-form, which is slow and error-prone. Together these gaps make the panel feel unfinished and make it harder to follow, audit, and steer an agent run.

## 2. Functional requirements

- **E202609298e8859ca:FR001** — The result of every tool the agent runs is shown in the transcript, presented as the command run, a separator, then the output, with the output collapsed to a short preview by default and expandable to full length on demand. _(Tool output is currently often missing or shown at full height; making it always-present, structured, and collapsed-by-default is the core legibility fix.)_
- **E202609298e8859ca:FR002** — The agent's own text responses are always shown in full (never collapsed) and use the large majority of the panel width. _(The primary content must never be hidden behind a collapse and must not be cramped into a narrow column with wasted space.)_
- **E202609298e8859ca:FR003** — The message input reads as a terminal prompt whose leading prompt indicator is itself the control that sends the message. _(Aligns the surface with the terminal-style agent chat it imitates and removes the inert prompt glyph.)_
- **E202609298e8859ca:FR004** — Once a permission request is approved or rejected, its card shows the decided outcome, no longer offers approve/reject actions, and does not add a separate synthesized instruction line to the transcript. _(A resolved gate must be unambiguous after the fact and must not leave live buttons or a confusing extra turn, while still actually granting/denying as before.)_
- **E202609298e8859ca:FR005** — When the agent needs the user to choose among options to proceed, it can present those options for direct selection (single or multiple), and the run continues based on the user's choice. _(Replaces slow, error-prone free-form replies for choice points with a direct selection interaction.)_

**s1:**

- **E202609298e8859ca:S001:FR001** — Every tool the agent runs shows its result in the transcript as the command, a separator, then the output. _(Tool output is currently often missing; when present it is unstructured.)_
- **E202609298e8859ca:S001:FR002** — Tool output is collapsed to a short preview by default and can be expanded and re-collapsed. _(Long output must not bury the surrounding conversation.)_
- **E202609298e8859ca:S001:FR003** — Assistant (non-tool) text is never collapsed. _(The collapse behaviour is scoped strictly to tool output; primary content always shows in full.)_

**s2:**

- **E202609298e8859ca:S002:FR001** — The message input reads as a terminal prompt whose leading indicator sends the message. _(Aligns the surface with the terminal-style chat and removes the inert prompt glyph.)_
- **E202609298e8859ca:S002:FR002** — Assistant text output uses about 90% of the panel width. _(Removes wasted right-side space and makes the primary content easier to read.)_

**s3:**

- **E202609298e8859ca:S003:FR001** — A permission card settles into a decided (approved/rejected) state after the user acts, with its action buttons removed. _(A resolved gate must be unambiguous and not leave live buttons.)_
- **E202609298e8859ca:S003:FR002** — An approval no longer adds a visible synthesized instruction line to the transcript, while still granting as before. _(Removes the confusing extra turn without changing what actually happens.)_

**s4:**

- **E202609298e8859ca:S004:FR001** — The agent can present the user a set of options for direct selection (single or multiple). _(Replaces slow, error-prone free-form replies at choice points.)_
- **E202609298e8859ca:S004:FR002** — The user's selection is conveyed back and the run continues based on it. _(The choice must actually steer the run.)_

## 3. Non-goals

- **Releasing the updated extension to the VS Code Marketplace.** — Publishing is a separate, manual release step tracked elsewhere; this Epic delivers the behaviour behind the existing feature flag, not a store release.
- **Adding a real in-turn permission-grant channel for the claude provider (the deferred 'FIX #2').** — The shipped Approve bugfix already conveys grants via a resume turn; a native in-turn control_response path is a distinct, larger change and is out of scope for this UX Epic.
- **Changing the underlying provider CLIs, their permission model, or which tools the agent may run.** — This Epic is presentation and interaction polish over the existing event stream; the agent's capabilities and the sandbox/permission semantics are unchanged.
- **Reworking the durable transcript/session storage format or migrating existing sessions.** — New behaviours must be additive and absent-safe over the existing stored shape; a storage migration is explicitly excluded to keep the Epic low-risk.

## 4. Assumptions

- `high` The webview render layer is a single eval'd source module consumed only by the host panel, so render changes have a contained blast radius. [[c1]]
- `high` The event stream has no tool-output/result kind and no user-choice/selection kind today, so surfacing tool output and offering choices each require a new event flowing end to end. [[c2]]
- `med` The approval gate's request is live-only (never persisted) and an approval currently produces a visible synthesized user turn, so the resolved-state and outcome display are render/host concerns layered on the existing shipped grant behaviour. [[c7]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | Every new event and every new webview<->host message MUST be additive: the existing event kinds and protocol messages keep their shape and behaviour, and consumers that ignore the new fields are unaffected. | [[c2]] |
| `k2` | invariant | Any newly persisted row kind MUST have an explicit persistence mapping in the marker mapper; ephemeral, live-only surfaces (like the permission request and any transient choice prompt) MUST NOT leak into the durable replayable transcript. | [[c6]] |
| `k3` | convention | Webview host/render behaviour is verified through the established eval'd *WebviewSource test pattern; new render branches and interactions must be covered that way. | [[c1]] |
| `k4` | invariant | The permission-decision OUTCOME display must preserve the shipped Approve behaviour (the underlying resume turn that actually conveys the grant); only the VISIBLE transcript echo of that grant may change. | [[c7]] |
| `k5` | convention | All changes ship behind the existing insrc.chat.enabled flag (default off) and stay within the dev-chat module; no other plugin surface is affected. | [[c4]] |

## 6. Stories

### 6.1 E202609298e8859ca:S001 — Make tool output legible: command, separator, output, collapsed by default

**User value:** `size: M`

As a developer watching an agent run, I can always see what a tool did — the command it ran and what it returned — without long output burying the conversation, so I can follow and audit the run at a glance.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given the agent runs a tool that produces output, when the turn renders in the transcript, then a tool entry is shown containing the command that ran, a visual separator, and the output. _(operationalizes `k1`)_
- **ac2:** Given a tool entry whose output is longer than a few lines, when it first renders, then the output is collapsed to a short preview (about three lines) and can be expanded to full length and collapsed again on demand. _(operationalizes `k1`)_
- **ac3:** Given an assistant (non-tool) text response, when it renders, then it is shown in full and is never collapsed. _(operationalizes `k1`)_
- **ac4:** Given a transcript containing tool entries, when the session is reloaded and the transcript replays, then each tool entry restores with the same command/separator/output structure and its default-collapsed output state. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (contract) Surfacing tool output must be additive to the existing event stream — no existing event kind changes shape, and turns without tool output render as before. [[c2]]

### 6.2 E202609298e8859ca:S002 — Terminal-style input with a send prompt, and full-width assistant output

**User value:** `size: S`

As a user of the dev-chat, the input reads like a real terminal prompt I can send from directly, and the agent's responses use the width of the panel, so the surface feels like the terminal-style tool it imitates and is easy to read.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given the message input row, when it is displayed, then it reads as a terminal prompt with a leading prompt indicator. _(operationalizes `k3`)_
- **ac2:** Given text entered in the input, when the user activates the leading prompt indicator, then the message is sent, identically to the existing send action. _(operationalizes `k3`)_
- **ac3:** Given an assistant text response, when it renders, then it spans the large majority (about 90%) of the panel width rather than a narrow column. _(operationalizes `k3`)_

**Local constraints:**

- `lc1` (invariant) Input and layout changes are presentation-only; the send intent and the message it produces are unchanged. [[c4]]

### 6.3 E202609298e8859ca:S003 — Resolved permission card shows its outcome without a synthesized turn

**User value:** `size: M`

As a user answering a permission prompt, once I approve or reject it the card clearly shows the outcome and stops offering buttons, and no confusing extra line is added as if I had typed it, so the record around a permission decision is unambiguous.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a pending permission request card, when the user approves or rejects it, then the card shows the decided outcome (approved or rejected) and no longer offers approve/reject actions. _(operationalizes `k4`)_
- **ac2:** Given a permission request that is approved, when the decision is applied, then no separate synthesized instruction line appears in the transcript as if typed by the user. _(operationalizes `k4`)_
- **ac3:** Given a permission request that is approved, when the decision is applied, then the underlying grant still takes effect and the run proceeds exactly as it does today. _(operationalizes `k4`)_
- **ac4:** Given a resolved permission card, when the session is reloaded, then the card does not reappear as an actionable pending request. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (invariant) The resolved-outcome display must not alter the shipped grant behaviour: approval still conveys the grant via the underlying resume turn; only the visible transcript echo of that grant changes. [[c7]]

### 6.4 E202609298e8859ca:S004 — Agent can present selectable options for the user to choose

**User value:** `size: L`

As a user, when the agent needs me to choose between options to proceed, I can pick from selectable choices directly instead of guessing and typing a free-form reply, so steering the agent at a decision point is fast and unambiguous.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given the agent needs the user to choose among options to proceed, when it presents them, then the user sees the options as directly selectable controls, supporting either a single choice or multiple choices. _(operationalizes `k1`)_
- **ac2:** Given a presented set of options, when the user makes a selection and confirms it, then the run continues based on the user's selection. _(operationalizes `k1`)_
- **ac3:** Given an option prompt, when the session is reloaded, then a resolved prompt shows the chosen option(s) and an unresolved live prompt does not reappear as an actionable, durable transcript row. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (contract) The selection round-trip must be additive to the event stream and the webview<->host protocol; existing message flows are unchanged and a turn without a choice prompt behaves as before. [[c3]]

## 7. References

- **[[c1]]** `code` `vscode-plugin/src/chat/render-registry.ts` — "renderRegistryWebviewSource + toViewModel + RenderRegistry; imported only by chat-panel.ts (import.graph inDegree 1)"
- **[[c2]]** `code` `vscode-plugin/src/chat/stream-events.ts:30-77` — "TurnEvent union: assistant-delta | tool-call | file-edit | status | done | error | approval-request — no tool-output/result or selection kind"
- **[[c3]]** `code` `vscode-plugin/src/chat/protocol.ts` — "HostToWebview / WebviewToHost message union — the webview<->host wire"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "host panel behind insrc.chat.enabled; user-row echo (post user-row); pendingPerms + permission-decision handler"
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "claudeMapper.mapLine emits TurnEvents; tool_use emits a tool-call but no tool-result/output"
- **[[c6]]** `code` `vscode-plugin/src/chat/markers.ts:43-85` — "markerFor(event): MarkerLine | null — per-event persistence mapping"
- **[[c7]]** `prior-artifact` `dev-chat Approve bugfix (issue 2d9e9e694a94116b) — the shipped grant re-run posts a visible 'Approved: please proceed…' user-row and resumes the session; approval-request event is live-only (markerFor=null)`
- **[[c8]]** `stakeholder` `User UX feedback captured while dogfooding dev-chat 0.4.11 (dev-chat-ux-feedback ledger, 7 items)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-29T09:59:12.250Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c2 | closed-union | LOW | auto | The TurnEvent union in vscode-plugin/src/chat/stream-events.ts (approx lines 30-77) has exactly these member kinds — assistant-delta, tool-call, file-edit, status, done, error, approval-request — and contains NO tool-output/result kind and NO selection/choice kind, which is the premise that S001 (tool output) and S004 (selection) each require a NEW event. | Confirmed: the tool-output/result/selection/choice patterns return ZERO matches in vscode-plugin/src/chat, and the TurnEvent union was read directly at stream-events.ts:30-77 (assistant-delta\|tool-call\|file-edit\|status\|done\|error\|approval-request). The generic `readonly kind:` grep's 0 chat-hits is a pattern artifact (cl5 confirms `readonly kind: 'tool-call'` at stream-events.ts:33 exists) — the load-bearing premise (no tool-output/selection kind today) holds. | No change needed. |
| c1 | citation | LOW | auto | vscode-plugin/src/chat/render-registry.ts exists and exports the webview render layer: renderRegistryWebviewSource, toViewModel, and the RenderRegistry contract. | Confirmed: render-registry.ts exports renderRegistryWebviewSource (:159), toViewModel (:101), and interface RenderRegistry (:81). | No change needed. |
| c3 | citation | LOW | auto | vscode-plugin/src/chat/protocol.ts declares the webview<->host message unions HostToWebview and WebviewToHost, including the turn-event, user-row, permission-decision, and submit-turn message types. | Confirmed: protocol.ts declares HostToWebview (:47) and WebviewToHost (:71), with permission-decision (:90) and user-row (:67) message types. | No change needed. |
| c4 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts is the host panel that posts a user-row echo of the user's prompt and holds the pendingPerms map and the permission-decision handler. | Confirmed: chat-panel.ts posts type:'user-row' (:538), holds pendingPerms (:138/:588/:737), and has case 'permission-decision' (:728). | No change needed. |
| c5 | citation | LOW | auto | vscode-plugin/src/chat/cli-adapter.ts's claudeMapper.mapLine emits a tool-call event for a tool_use block but emits no tool-result/tool-output event today. | Confirmed: cli-adapter.ts emits kind:'tool-call' (:326, :427) and stream-events.ts:33 declares it; ZERO matches for kind:'tool-output'/'tool-result' — no tool-result/output event is emitted today, as the DEF premise states. | No change needed. |
| c6 | citation | LOW | auto | vscode-plugin/src/chat/markers.ts declares markerFor(event: TurnEvent): MarkerLine \| null (approx lines 43-85), the per-event persistence mapper any new persisted event kind must extend. | Confirmed: markers.ts:43 = `export function markerFor(event: TurnEvent): MarkerLine \| null {` — matches the cited :43-85 anchor. | No change needed. |
| c7 | semantic | LOW | auto | The approval-request event is live-only — markerFor maps it to null so it never persists to the durable transcript — which is the basis for constraint k2/k4 (ephemeral surfaces must not leak into the replayable transcript). | Consistent: approval-request is declared in stream-events.ts and mapped by markers.ts markerFor; the live-only (markerFor->null) property underpins constraints k2/k4 and matches the shipped bugfix prior-artifact c7. | No change needed. |
