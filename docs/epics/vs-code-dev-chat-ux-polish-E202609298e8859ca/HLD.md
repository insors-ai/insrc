<!-- insrc:artifact HLD-8e8859ca0ca83612 -->

# HLD: vs-code-dev-chat-ux-polish

## Summary

The dev-chat's render layer already funnels every row — live or replayed — through one mapper and one persistence record, so this Epic extends that single pipeline additively rather than restructuring it. It establishes two reusable patterns: an 'additive row-kind' extension (declare the kind, carry its payload, map it for both live and replay, persist it via the marker mapper) and a 'live-only interactive prompt that resolves to a persisted outcome' (the pending prompt never persists; only the decided outcome does, and the underlying grant behaviour is untouched). Tool output and the selection widget each add a new row kind; the permission card and selection widget each use the interactive-prompt pattern; the input/width polish is pure render.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Problem context

> See **DEF-8e8859ca0ca83612** § 1. Problem

## 2. Framework summary

Chosen framework (a1): extend the existing single render pipeline through two HLD-level patterns applied additively, never reshaping a shipped contract. Pattern P1 (additive row kind): a new row kind is added by extending the RowKind discriminator, adding its RowViewModel payload, adding a toViewModel branch that maps BOTH the live TurnEvent and the replayed TranscriptEntry to the same row, adding a markerFor branch, and round-tripping a plain-serialisable TranscriptEntry field through both store constructions. Pattern P2 (live-only interactive prompt → persisted outcome): an interactive request is a LIVE-ONLY surface (markerFor->null while pending, never persisted), the webview relays the user's decision back over an additive protocol message, and on resolution the host records a PERSISTED outcome marker (via P1) showing the decided state — without altering the underlying action the decision triggers. S001 applies P1 for a tool-output row. S003 applies P2 to the EXISTING approval-request event (adding a persisted resolved-outcome marker and suppressing the visible synthesized echo) while leaving the shipped resume-grant untouched. S004 applies BOTH P1 and P2 for a new selection surface. S002 is pure render (input + width), owning no contract.

## 3. Architecture shape

The row pipeline is: a live TurnEvent (from the provider stream adapter) OR a replayed TranscriptEntry (from the session store) enters the single mapper toViewModel(entry): RowViewModel; RowKind discriminates the row; markerFor(event): MarkerLine | null decides whether the event also becomes a persisted marker row (null = live-only). The two new event kinds (tool-output for S001, selection-request for S004) are added to the TurnEvent union additively; the provider adapter emits them; the webview render source gains a per-kind render branch; and for interactive kinds the webview posts an additive decision message back over the host<->webview protocol which the host relays (for selection, mirroring how the existing permission-decision relay already works, and preserving the shipped grant path for permission). Persisted kinds (the tool-output row, the resolved permission outcome, the resolved selection outcome) each add a markerFor branch and a plain-serialisable TranscriptEntry field round-tripped by both store constructions; pending interactive prompts stay on the markerFor->null live-only path. Because the Epic's four Stories are independent (no dependency edges), each Story instantiates the relevant pattern within its own boundary rather than consuming another Story's produced contract; P1 and P2 are documented here so the parallel edits to the shared row-model files (RowKind, RowViewModel, toViewModel, markerFor, TranscriptEntry) stay additive and mutually consistent. S002 touches only the input row and the assistant-row width in the render source and owns no cross-cutting shape.

## 4. Shared contracts

### 4.1 sc1: Tool-output row kind (P1 instance)

**Owner Story:** `s1`
**Consumed by:** `s1`

**Purpose:** A persisted tool-output row that carries the command, a separator, and the (default-collapsed) output, mapped identically for a live event and a replayed transcript entry — the S001 instantiation of the additive row-kind pattern P1.

**Interface sketch (type-level):**

```
// stream-events.ts (additive TurnEvent member)
interface ToolOutputEvent { readonly kind: 'tool-output'; readonly turnId: string; readonly command?: string; readonly output: string; readonly exitCode?: number }
// render-registry.ts (additive)
type RowKind = /* existing kinds */ | 'tool-output';
interface ToolOutputRowView { readonly kind: 'tool-output'; readonly command?: string; readonly output: string; readonly collapsedByDefault: true }
// session-store.ts (additive, plain-serialisable)
interface ToolOutputTranscriptEntry { readonly kind: 'tool-output'; readonly command?: string; readonly output: string }
// markers.ts: markerFor returns a non-null MarkerLine for kind 'tool-output' (persisted)
```

**Assumptions cited:** [[c1]] [[c2]]

### 4.2 sc2: Interactive-prompt resolved-outcome pattern (P2, over the existing approval-request)

**Owner Story:** `s3`
**Consumed by:** `s3`

**Purpose:** The live-only-prompt → persisted-outcome pattern: a pending interactive request never persists (markerFor->null); on decision the host records a persisted resolved-outcome marker showing the decided state, WITHOUT changing the underlying action the decision triggers — the S003 instantiation over the existing approval-request event, preserving the shipped resume-grant (k4).

**Interface sketch (type-level):**

```
// render-registry.ts (additive): a persisted resolved-outcome row
type RowKind = /* existing */ | 'permission-outcome';
interface PermissionOutcomeRowView { readonly kind: 'permission-outcome'; readonly toolName: string; readonly decision: 'approved' | 'rejected' }
// session-store.ts (additive, plain-serialisable)
interface PermissionOutcomeTranscriptEntry { readonly kind: 'permission-outcome'; readonly toolName: string; readonly decision: 'approved' | 'rejected' }
// NOTE: the pending approval-request TurnEvent is UNCHANGED and stays markerFor->null (live-only);
// the existing 'permission-decision' WebviewToHost message and the shipped grant/resume path are UNCHANGED.
```

**Assumptions cited:** [[c7]]

### 4.3 sc3: Selection round-trip contract (P1 + P2 instance)

**Owner Story:** `s4`
**Consumed by:** `s4`

**Purpose:** A new selection surface: the agent presents options (live-only prompt), the webview posts the user's choice back over an additive protocol message, the host conveys it into the run, and a persisted resolved-selection outcome row records the chosen option(s) — the S004 instantiation of BOTH patterns.

**Interface sketch (type-level):**

```
// stream-events.ts (additive TurnEvent member): live-only prompt
interface SelectionRequestEvent { readonly kind: 'selection-request'; readonly turnId: string; readonly requestId: string; readonly prompt: string; readonly options: readonly { readonly id: string; readonly label: string }[]; readonly multi?: boolean }
// protocol.ts (additive WebviewToHost message): the choice back
interface SelectionDecisionMsg { readonly type: 'selection-decision'; readonly requestId: string; readonly selected: readonly string[] }
// render-registry.ts (additive): persisted resolved-selection row
type RowKind = /* existing */ | 'selection-outcome';
interface SelectionOutcomeRowView { readonly kind: 'selection-outcome'; readonly chosen: readonly string[] }
// session-store.ts (additive, plain-serialisable): SelectionOutcomeTranscriptEntry { kind, chosen }
// markers.ts: selection-request -> null (live-only); selection-outcome -> non-null (persisted)
```

**Assumptions cited:** [[c1]] [[c2]]

## 5. Story boundaries

### 5.1 Story E202609298e8859ca:S001

**Owns:** `sc1`

The webview render + CSS for a tool-output row (command, a visual separator, output collapsed to a ~3-line preview with expand/collapse), the rule that assistant/non-tool rows are never collapsed, and the adapter emission that produces the tool-output event from the provider stream. Private to S001 apart from the sc1 shape it establishes.

### 5.2 Story E202609298e8859ca:S002


The input-row markup/CSS so it reads as a terminal prompt with a leading prompt indicator that acts as the send control (reusing the existing submit-turn intent unchanged), and the assistant-row width (~90%). Pure render; owns no cross-cutting contract and changes no event/protocol/persistence shape.

### 5.3 Story E202609298e8859ca:S003

**Owns:** `sc2`

The approval-card render change (resolved approved/rejected state, action buttons removed once decided), suppressing the visible synthesized 'Approved: please proceed…' user-row echo, and recording the persisted permission-outcome marker on decision. The underlying resume-grant path and the existing permission-decision relay are consumed UNCHANGED (k4).

### 5.4 Story E202609298e8859ca:S004

**Owns:** `sc3`

The selection-widget render (single/multi selectable controls), the host relay that turns a selection-decision message into the run's continuation (mirroring the existing decision-relay shape), and the resolved-selection persistence. Private to S004 apart from the sc3 shape.

## 6. Non-functional targets

- **Performance:** Rendering stays incremental per turn; collapse/expand is a DOM/CSS state toggle on the tool-output row, not a re-layout of the transcript. New events are small additive payloads; the Memento persistence path only gains plain-serialisable fields.
- **Security:** No new sandbox/permission surface and no change to which tools may run; k4 preserved — the permission outcome display and the selection relay convey decisions exactly as the shipped path does, only the visible transcript representation changes. All behind insrc.chat.enabled (k5).
- **Observability:** N/A — webview-only UX; behaviour verified through the eval'd *WebviewSource test pattern (k3).
- **Durability:** Persisted kinds (tool-output, permission-outcome, selection-outcome) round-trip through both createInMemoryChatSessionStore and createMementoChatSessionStore and must be plain-serialisable; pending interactive prompts (approval-request, selection-request) stay live-only (markerFor->null) and never enter the durable transcript (k2).

## 7. Rollout

**Phase A — Row-kind pattern + render polish**

**Stories:** `s1`, `s2`
**Flag:** `insrc.chat.enabled`

S001 establishes pattern P1 (the additive persisted row kind) in the shared row-model files first, so the later selection story reuses a proven reference rather than inventing it; S002 is pure render (input + width), owns no contract, and rides along as a low-risk quick win that touches only the render source. Neither depends on the other.

**Backward compat:** Existing event kinds, protocol messages, and the stored transcript shape stay byte-identical; the tool-output row and the input/width changes are additive and turns without tool output render exactly as before.

**Phase B — Approval-card resolved outcome**

**Stories:** `s3`
**Flag:** `insrc.chat.enabled`

S003 establishes pattern P2 (live-only prompt → persisted resolved outcome) over the EXISTING approval-request event, giving the selection story a second proven reference. It lands after Phase A so the persisted-outcome marker reuses P1's persistence approach.

**Backward compat:** The pending approval-request event, the permission-decision relay, and the shipped resume-grant path are all consumed UNCHANGED (k4); only the visible echo is suppressed and a resolved-outcome marker is added.

**Phase C — Selection widget**

**Stories:** `s4`
**Flag:** `insrc.chat.enabled`

S004 is the largest slice and instantiates BOTH P1 (persisted resolved-selection row) and P2 (live-only selection prompt + decision relay). Sequencing it last lets it follow the row-kind and interactive-prompt patterns already landed by Phases A and B, minimising divergent edits to the shared row-model files.

**Backward compat:** The new selection-request event and selection-decision message are additive; existing message flows and a turn without a choice prompt behave exactly as before.

**Ordering rationale:** The Epic's four Stories carry no formal dependency edges (each dependsOn []), so this ordering is a merge-and-reuse convenience, not a hard prerequisite. S001 is sequenced first because it establishes P1 in the shared row-model files (RowKind/RowViewModel/toViewModel/markerFor/TranscriptEntry); S003 second because it establishes P2 over the existing approval-request; S004 last because it reuses BOTH patterns and edits the same row-model files as S001, so landing after them keeps its additive branches consistent and conflict-free. S002 is grouped into Phase A as an independent, contract-free render change that can land at any time.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Concurrent edits to the shared row-model files (RowKind, RowViewModel, toViewModel, markerFor, TranscriptEntry) by S001 and S004 | Both stories add a new persisted row kind to the same five seams; built out of order or concurrently they touch overlapping lines and can diverge in shape. | Land S001 (P1) first as the documented reference; S004 follows the identical additive-branch pattern; every change is additive (a new union member + a new branch), never a rewrite of an existing branch, so merges stay clean. |
| Persistence round-trip of new kinds through the Memento store | A new persisted kind that omits its markerFor branch or carries a non-plain-serialisable field will silently fail to replay on session reload (the tool-output/permission-outcome/selection-outcome rows would vanish or render differently). | k2 mandates a markerFor branch + a plain-serialisable TranscriptEntry field for every persisted kind, and each story's reload acceptance criterion (ac4/ac3) is proven by a both-store round-trip test in the eval'd *WebviewSource suite (k3). |
| Preserving the shipped Approve grant while changing its visible echo (S003) | Suppressing the synthesized 'Approved: please proceed…' user-row must not disturb the underlying resume-grant that actually conveys permission (k4); a careless change could stop the grant firing. | S003 changes only the visible echo + adds a resolved-outcome marker, consuming the existing permission-decision relay and resume-grant path unchanged; a regression test asserts an approved permission still issues the resume-grant turn exactly as today. |

## 8. Alternatives considered

### 8.1 a1: Shared row-kind + live-prompt seams, each Story an instance — **CHOSEN**

The HLD fixes TWO shared patterns — an 'add-a-persisted-row-kind' seam and a 'live-only interactive prompt that resolves to a persisted outcome marker' seam — and each Story instantiates the relevant one; S002 stays pure render.

The HLD names one shared 'persisted row kind' contract: extend RowKind, add its RowViewModel payload, add the toViewModel branch mapping BOTH the live TurnEvent and the replayed TranscriptEntry to the same row, add its markerFor branch, and round-trip its TranscriptEntry field through both store constructions. S001 instantiates this for a tool-result row. It also names a second shared 'interactive prompt' contract: an interactive request is a LIVE-ONLY event (markerFor->null while pending), the webview relays the decision back over a protocol message, and on resolution the host records a PERSISTED outcome marker via the first contract. S003 instantiates it over the EXISTING approval-request event; S004 instantiates BOTH. Story boundaries fall out cleanly and the row-model touch-points are extended the same way each time.

**Pros:**
- Both new event paths (S001 tool-output, S004 selection) extend the SAME five row-model seams the same way, so toViewModel/markerFor/TranscriptEntry gain parallel, reviewable branches rather than divergent ones.
- The live-only-then-resolved pattern is defined once and reused by both S003 and S004, so 'pending prompt never persists, resolved outcome does' (k2) is enforced identically in both.
- S003 and S004 layer strictly additively on the existing approval-request event and the shipped grant behaviour (k4).
- Story slices stay independent and testable on their own, so they can build in any order with no cross-story merge dependency beyond the shared seam.

**Cons:**
- Requires the HLD to specify two shared contracts up front, more design work than letting each story improvise its own slice.
- S001 and S004 both edit the same five files, so concurrent builds touch overlapping lines and need careful additive merges.

**Cost estimate:** M

### 8.2 a2: Independent per-Story vertical slices, no shared HLD contract

Each Story adds its own event/protocol/render/persistence end to end with no shared pattern, so the four slices are fully self-contained.

Every Story owns its full vertical: S001 invents its own tool-output event + row + persistence; S004 independently invents its own selection event + row + persistence; S003 handles the approval card in isolation; S002 is render-only. The HLD only lists story boundaries and defers all contract shape to each Story's LLD, with no cross-story pattern mandated.

**Pros:**
- Least HLD design effort — the framework write only fixes story boundaries and leaves the contract shape to each LLD.
- Each Story's LLD is unconstrained, so it can pick the simplest local representation for its own row/persistence needs.

**Cons:**
- S001 and S004 solve the identical 'add a persisted row kind' problem twice with no shared template, so the two extensions are likely to diverge and be harder to review together.
- The live-only-then-resolved rule (k2) is re-derived separately in S003 and S004, risking one of them persisting a pending prompt or dropping a resolved outcome inconsistently.
- toViewModel/markerFor/TranscriptEntry become an unmanaged merge hotspot edited by three stories with no agreed extension pattern.

**Cost estimate:** L

**Rejected because:** Lowest up-front design cost but leaves k2 and k4 to be re-derived per story and makes toViewModel/markerFor/TranscriptEntry an unmanaged merge hotspot; only partial on k1/k2/k4 where a1 is structural.

### 8.3 a3: One generic interactive-widget event abstraction

Collapse tool-output, permission, and selection into instances of a single new generic 'widget' event kind with one render dispatcher and one decision channel.

Introduce one generic interactive-widget event kind parameterised by a widget type (tool-output | permission | selection), a single render dispatcher in the webview source, and a single generic decision message back over the protocol. S001/S003/S004 all become configurations of this one contract, and the existing approval-request event is folded into the generic widget type.

**Pros:**
- Maximum uniformity: one event kind, one render dispatcher and one decision channel serve every current and future interactive surface.
- A future interactive surface needs no new event/protocol wiring — only a new widget-type value.

**Cons:**
- Tool-output is display-only while permission and selection are interactive, so forcing them into one 'widget' shape carries an unused decision channel and a leaky, over-general payload.
- Folding the EXISTING approval-request event into a new generic kind reshapes a shipped contract, violating k1 and risking the shipped Approve grant behaviour k4.
- The generic dispatcher becomes a single indirection every story routes through, making per-surface render/behaviour harder to read and test in isolation (k3).

**Cost estimate:** L

**Rejected because:** Violates k1 and k4 by folding the shipped approval-request event into a new generic kind (reshaping/endangering the shipped grant), and over-generalises a display-only surface (tool-output) with interactive ones.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 code-map: dev-chat webview render layer + TurnEvent/protocol surface` — "render-registry.ts exports RenderRegistry + toViewModel + renderRegistryWebviewSource (imported only by chat-panel.ts); TurnEvent union (stream-events.ts:30-77) has no tool-output/result or selection "
- **[[c2]]** `analyze-bundle` `s1 row-model-and-persistence: toViewModel(TranscriptEntry|TurnEvent):RowViewModel + RowKind + markerFor + TranscriptEntry` — "toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel (render-registry.ts:101-119) converges live + replay; RowKind :37-47; RowViewModel :53-60; markerFor(event):MarkerLine|null (markers.ts:43"
- **[[c7]]** `prior-artifact` `dev-chat Approve bugfix (issue 2d9e9e694a94116b): approval posts a visible 'Approved: please proceed…' user-row and resumes the session; approval-request event is live-only (markerFor=null)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-29T10:14:51.423Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc1/P1 | citation | LOW | manual | The five row-model seams the P1 pattern extends all exist: RowKind and RowViewModel and toViewModel in render-registry.ts, markerFor in markers.ts, and TranscriptEntry in session-store.ts. | Confirmed all five seams: render-registry.ts:37 `export type RowKind =`, :53 `export interface RowViewModel {`, :101 `export function toViewModel(entry: TranscriptEntry \| TurnEvent): RowViewModel {`; markers.ts:43 `export function markerFor(event: TurnEvent): MarkerLine \| null {`; session-store.ts:16 `export interface TranscriptEntry {`. The P1 pattern extends real code. | none — verified sound |
| architecture | closed-union | LOW | manual | The current TurnEvent union has no tool-output/result kind and no selection kind, so both are genuinely NEW additive events. | The tool-output/selection kind literals return ZERO src matches (only the new HLD doc), confirming no such TurnEvent kind exists today. NOTE: the prior dev-chat-ui HLD (f9563bf5) shows the render RowKind already includes 'tool-command'/'tool-result' row-kind members — distinct from the NEW TurnEvent event kinds this HLD adds. The premise (no tool-output/selection EVENT kind) holds. | At S001 LLD time, read render-registry.ts:37-47 to reconcile the illustrative 'tool-output' naming against the actual RowKind members (which may already carry tool-command/tool-result) so the new tool-output row kind does not collide or duplicate — an LLD-level naming reconciliation, not an HLD change. |
| sc2 | citation | LOW | manual | The S003-consumed-unchanged targets exist in chat-panel.ts: the permission-decision handler and the user-row echo of the user's prompt. | Confirmed: chat-panel.ts:728 `case 'permission-decision': {` and chat-panel.ts:538 `post({ type: 'user-row', ... })` both exist — the S003-consumed-unchanged targets are real. | none — verified sound |
| durability | inventory | LOW | manual | The session store has exactly two constructions that any new persisted kind must round-trip: createInMemoryChatSessionStore and createMementoChatSessionStore. | Confirmed exactly two constructions: session-store.ts:195 createInMemoryChatSessionStore and session-store.ts:106 createMementoChatSessionStore. A new persisted kind must round-trip both. | none — verified sound |
| sharedContracts | semantic | LOW | manual | Each shared contract is owned by exactly one story and consumed only by its owner (sc1->s1, sc2->s3, sc3->s4), which is graph-valid for the all-independent (dependsOn []) Epic story graph. | The HLD artifact shows each shared contract owned by exactly one story and consumed only by its owner (sc1->s1, sc2->s3, sc3->s4); with the all-independent (dependsOn []) Epic graph this is graph-valid (no consumer needs to be downstream of a different owner). Internally consistent. | none — verified sound |
