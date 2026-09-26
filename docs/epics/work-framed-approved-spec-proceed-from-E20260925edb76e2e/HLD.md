<!-- insrc:artifact HLD-edb76e2e4d41217d -->

# HLD: Layered extension-host core + a thin terminal-styled webview (alternative a1)

## Framework summary

Layered extension-host core + a thin terminal-styled webview (alternative a1). All chat logic lives in vscode-free, deps-injected host modules that mirror the repo's existing createWebviewPanelHost(deps) factory idiom, so streaming, session, edit-governance and docs-review logic are unit-testable without a webview harness. The webview holds no business logic — it paints terminal-styled surfaces and emits user intents over a single typed, versioned message protocol. Each agentic CLI's native structured stream is normalized to ONE event union by a per-provider stream adapter, quarantining the still-to-spike claude/codex stream/resume contract at that boundary so no downstream surface is provider-specific. Grounding + tracked-workflow behaviour come through the CLI's own insrc MCP (the extension observes, never orchestrates — k8). This revision is a preserve-only application of amendment AMD-edb76e2e4d41217d-2: it adds story boundary s8 (restored-marker style fidelity) and changes nothing else in the shipped framework or contracts.

## Architecture shape

extension.ts (the sole vscode importer) is the composition root: behind flag insrc.chat.enabled it constructs the vscode-free host modules with injected vscode seams. sc1 design-tokens.ts renders the terminal <style>; sc2 stream-events.ts + sc5 cli-adapter.ts spawn the selected claude/codex CLI and normalize its native stream to a TurnEvent union; sc3 protocol.ts is the one typed webview<->host channel; sc4 session-store.ts persists chat sessions over a vscode Memento (k3). The chat panel host runs the turn loop, renders a single nonce'd webview shell under a strict CSP, and appends transcript rows; markers (s4), provider/history/resume (s5), inline-diff governance (s6), docs-review (s7) and restored-marker style (s8) are slices layered over those five contracts.

## Shared contracts

### sc1: Terminal-UX design tokens + component vocabulary

**Owner Story:** `s1`
**Consumed by:** `s3`, `s4`, `s5`, `s6`, `s7`, `s8`

**Purpose:** The single source of the terminal look & feel (monospace, box-drawing chrome, phosphor accents from the insrc docs-site TUI) that every rendered surface consumes, so the whole experience is terminal-styled and not a chat-bubble UI (k6).

**Interface sketch (type-level):**

```
// design-tokens.ts (type-level)
export interface TerminalTheme {
  readonly font: { mono: string; sizePx: number; linePx: number };
  readonly color: { bg: string; fg: string; dim: string; accent: string; warn: string; err: string; sel: string };
  readonly chrome: { border: string; boxChars: { h: string; v: string; tl: string; tr: string; bl: string; br: string } };
  readonly marker: { pending: string; toolCall: string; edit: string; done: string; error: string };
}
export type SurfaceKind = 'chat' | 'provider-dropdown' | 'history-dropdown' | 'inline-diff' | 'docs-review';
```

**Assumptions cited:** [[c2]]

### sc2: Normalized CLI stream-event schema

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s6`, `s8`

**Purpose:** The provider-agnostic event union the StreamAdapter emits per turn; the shared vocabulary that drives streaming render (s3), lifecycle markers (s4), edit detection (s6) and restored-marker style (s8), so a claude/codex stream-format difference never leaks past the adapter.

**Interface sketch (type-level):**

```
// stream-events.ts (type-level)
export type TurnEvent =
  | { kind: 'assistant-delta'; turnId: string; text: string }
  | { kind: 'tool-call'; turnId: string; tool: string; mcp?: { server: string; name: string } }
  | { kind: 'file-edit'; turnId: string; path: string; diff: UnifiedDiff }
  | { kind: 'status'; turnId: string; phase: 'thinking' | 'streaming' | 'tool' | 'editing' }
  | { kind: 'done'; turnId: string; ok: boolean }
  | { kind: 'error'; turnId: string; message: string };
export interface UnifiedDiff { readonly path: string; readonly hunks: ReadonlyArray<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }>; }
```

**Assumptions cited:** [[c1]]

### sc5: CLI provider + stream adapter interface

**Owner Story:** `s2`
**Consumed by:** `s3`, `s5`

**Purpose:** The boundary that spawns a selected agentic CLI (claude/codex) for a turn and yields a normalized TurnEvent stream, plus the native session-resume handle — the only place a provider difference lives (k1, k4). Consumed by the panel to run turns (s3) and by provider-selection/continuity (s5).

**Interface sketch (type-level):**

```
// cli-adapter.ts (type-level)
export type ProviderId = 'claude' | 'codex';
export interface TurnRequest { readonly provider: ProviderId; readonly prompt: string; readonly resume?: SessionHandle; readonly cwd: string; }
export interface SessionHandle { readonly provider: ProviderId; readonly nativeSessionId: string; }
export interface StreamAdapter {
  run(req: TurnRequest): AsyncIterable<TurnEvent>;
  cancel(turnId: string): void;
  readonly capabilities: { readonly resume: boolean };
}
export interface ProviderRegistry { get(id: ProviderId): StreamAdapter; readonly available: ReadonlyArray<ProviderId>; }
```

**Assumptions cited:** [[c1]]

### sc3: Webview↔extension message protocol

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`, `s6`, `s7`, `s8`

**Purpose:** The single typed, versioned channel between the host and the thin webview — host→webview render/stream events and webview→host user intents — that every UI surface (chat, markers, dropdowns, inline-diff, docs-review, restored-marker style) rides on, preventing ad-hoc channel drift.

**Interface sketch (type-level):**

```
// protocol.ts (type-level)
export interface Envelope<T> { readonly v: 1; readonly payload: T; }
export type HostToWebview =
  | { type: 'turn-event'; event: TurnEvent }
  | { type: 'session-restored'; sessionId: string; transcript: TranscriptEntry[] }
  | { type: 'history-list'; chats: ChatSummary[] }
  | { type: 'edit-prompt'; path: string; diff: UnifiedDiff }
  | { type: 'docs-list'; artifacts: DocsArtifactSummary[] }
  | { type: 'theme'; theme: TerminalTheme };
export type WebviewToHost =
  | { type: 'submit-turn'; text: string }
  | { type: 'new-chat'; provider: ProviderId }
  | { type: 'open-chat'; chatId: string }
  | { type: 'set-edit-mode'; mode: 'auto' | 'review' }
  | { type: 'edit-decision'; path: string; accept: boolean }
  | { type: 'docs-decision'; artifactId: string; accept: boolean };
```

### sc4: Extension-local chat/session store shape

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`, `s8`

**Purpose:** The persisted ChatSession record + store interface (transcript, fixed provider, native session-id, per-session edit-mode) kept extension-local (k3). Introduced by the panel that first needs a live session (s3), extended by history/provider (s5), per-session edit mode (s6) and restored-marker style (s8).

**Interface sketch (type-level):**

```
// session-store.ts (type-level)
export interface ChatSession { readonly id: string; readonly provider: ProviderId; nativeSessionId?: string; readonly createdAt: string; title: string; editMode: 'auto' | 'review'; transcript: TranscriptEntry[]; }
export interface TranscriptEntry { readonly role: 'user' | 'assistant' | 'marker'; readonly text: string; readonly at: string; }
export interface ChatSummary { readonly id: string; readonly provider: ProviderId; readonly title: string; readonly updatedAt: string; }
export interface ChatSessionStore {
  create(provider: ProviderId): ChatSession;
  get(id: string): ChatSession | undefined;
  list(): ReadonlyArray<ChatSummary>;
  append(id: string, entry: TranscriptEntry): void;
  save(session: ChatSession): void;
}
```

**Assumptions cited:** [[c1]]

## Story boundaries

### Story E20260926edb76e2e:S001

**Owns:** `sc1`

The concrete mockup deliverables (per-surface terminal-styled mock images/HTML), the design-rationale write-up, and the exact palette/character choices are private to S001; downstream stories consume only the sc1 token/vocabulary contract, not the mock files themselves.

### Story E20260926edb76e2e:S002

**Owns:** `sc2`, `sc5`

The subprocess spawn mechanics, the per-provider parsing of each CLI's NATIVE stream format, the exact claude/codex flags (the stream/resume spike), backpressure/cancellation handling, and error normalization stay private to S002; consumers see only the normalized TurnEvent union (sc2) and the StreamAdapter/ProviderRegistry interface (sc5).

### Story E20260926edb76e2e:S003

**Owns:** `sc3`, `sc4`
**Depends on:** `sc1`, `sc2`, `sc5`

The terminal renderer internals (how TurnEvents paint as terminal output), the input box, the panel/webview lifecycle and single-active-panel management, and the CSP/webview bootstrap are private to S003; other stories consume only the message protocol (sc3) and the session-store shape (sc4).

### Story E20260926edb76e2e:S004

**Depends on:** `sc1`, `sc2`, `sc3`

How status/tool-call TurnEvents are mapped to terminal-style marker lines, and how observed insrc MCP tool-calls are named/enriched into markers, are private to S004; it adds no new shared contract — it renders sc2 events as sc1-styled markers over sc3.

### Story E20260926edb76e2e:S005

**Depends on:** `sc1`, `sc3`, `sc4`, `sc5`

The provider-selector and history-dropdown UI, the new-chat vs open-chat flows, and the wiring of the StreamAdapter's native session-resume handle into a restored session are private to S005; it persists through sc4 and drives turns through sc5, adding no new shared contract.

### Story E20260926edb76e2e:S006

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The inline-diff renderer (both a terminal-styled chat-panel view and a native VS Code editor-diff view, selected by the plugin-local `insrc.chat.diffView` setting), the EditGovernor that applies the per-session auto/review toggle, and the pre-turn snapshot baseline it reverts to on reject are private to S006. S006 is a passthrough observer (k8): it does NOT gate the CLI's write before disk; in review mode it renders the resulting edit and, on reject, restores the pre-turn snapshot. It consumes file-edit TurnEvents (sc2), the edit-mode field on the session (sc4), and the edit-prompt/edit-decision/set-edit-mode messages (sc3), and adds no new shared contract (the diffView setting is a plugin-local package.json config, not an Epic contract).

### Story E20260926edb76e2e:S007

**Depends on:** `sc1`, `sc3`

The docs-review pane and its DocsReviewClient over the existing daemon IPC (the exact pendingApproval listing + insrc_workflow_approve method names/payloads, pinned at the S007 LLD) and the mirroring of the JetBrains review/comment/accept-reject panel are private to S007; it consumes only the message protocol (sc3) and the terminal tokens (sc1) and adds no new shared contract to the Epic.

### Story E20260926edb76e2e:S008

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

How a marker row's sc1 cssClass (computed by the s4 markerFor over an sc2 TurnEvent) is persisted onto the sc4 transcript entry and replayed on the sc3 session-restored message so a reopened chat reproduces each marker's glyph + phosphor tone, are private to S008. It adds no new shared contract; at its LLD it proposes a sharedContract.fieldAdd on sc4 (an optional TranscriptEntry.cssClass) owned by s3 — additive + backward-compatible (older rows without the field restore as plain text). Depends on s3 (sc3/sc4), s2 (sc2) and s1 (sc1), all shipped Phase-A/B contracts.

## Non-functional targets

- **Performance:** Streaming is incremental: assistant-delta events render to the terminal panel as they arrive (no wait-for-turn-complete); the host must not buffer a whole turn before painting. Marker updates are cheap status lines. The webview holds no heavy state. Restoring a chat replays its transcript rows without re-running any turn.
- **Security:** No direct cloud REST from the extension (k2); all model access is via the user's own claude/codex CLI OAuth sessions. The webview runs under a strict CSP (no remote origins) with exactly one nonce'd inline script; host↔webview traffic is the typed sc3 protocol only, and dynamic text is set via textContent (no innerHTML). Chat history stays on the local machine (k3).
- **Observability:** Per-turn lifecycle markers (thinking/tool-call/streaming/done) are the user-facing progress signal, live AND on restore; host modules log via the repo's getLogger, never console.log. Errors surface as an error TurnEvent rendered inline, not a silent failure.
- **Durability:** Chat history + per-session provider/native-session-id/edit-mode + (s8) per-marker style persist extension-local (VS Code Memento) and survive window reload; nothing is written to the daemon. A missing/corrupt local store degrades to an empty history, and an older transcript row without the s8 cssClass restores as plain text — never a crash, no migration.

## Rollout

### Phase A — foundational contracts (design + CLI bridge)

**Stories:** `s1`, `s2`

s1 owns sc1 (terminal tokens) and s2 owns sc2/sc5 (the normalized stream + adapter) with no dependencies — every other story consumes them, so they land first. Shipped.

### Phase B — core terminal chat surface

**Stories:** `s3`, `s4`
**Flag:** `insrc.chat.enabled`

s3 owns sc3/sc4 (protocol + session store) and depends on sc1/sc2/sc5; s4 layers lifecycle markers over sc1/sc2/sc3. Both land after Phase A. Shipped behind the flag.

**Backward compat:** Additive only; the chat panel is gated so it cannot affect the existing status/repo-config webview.

### Phase C — provider/history, edit governance, docs review & restore fidelity

**Stories:** `s5`, `s6`, `s7`, `s8`
**Flag:** `insrc.chat.enabled`

All consume the Phase-A/B contracts and add no new shared contract: s5 (provider/history/resume over sc4/sc5/sc3), s6 (inline-diff governance over sc2/sc3/sc4), s7 (docs-review over sc3/sc1), and s8 (restored-marker style over sc1/sc2/sc3/sc4). s8 lands here because it builds on the shipped sc4 store (s3) + s4 markers; it proposes an additive sc4 fieldAdd (TranscriptEntry.cssClass) at its LLD.

**Backward compat:** s8 keeps the sc4 store backward-compatible: the new optional cssClass is additive, and older stored transcript rows without it restore as plain text with no migration. All Phase-C stories stay gated behind insrc.chat.enabled.

**Ordering rationale:** Phases follow the shipped contract-ownership DAG: Phase A lands the leaf-owned contracts (sc1 by s1; sc2/sc5 by s2), Phase B lands sc3/sc4 (s3) + markers (s4) that depend on them, and Phase C lands the consumer-only stories (s5/s6/s7/s8). s8 is placed in Phase C after s3 (sc3/sc4) and s4 (markers) because it consumes the shipped session-store + marker mapper; it introduces no new contract and only an additive sc4 field, so it does not reorder any earlier phase.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| HLD<->code drift from re-authoring an already-built HLD | This pass re-emits the shipped framework + 5 contracts to apply one storyBoundary amendment; any accidental wording/shape change could desync from S001-S005 code. | Preserve-only: the framework summary, all five contract interfaceSketches, owners, and boundaries s1..s7 are reproduced verbatim from the approved HLD; only s8's boundary + Phase-C membership are added. Reviewed against the shipped code before approval. |
| sc4 field-add applied at the LLD, not this HLD pass | The actual TranscriptEntry.cssClass change is a separate sharedContract.fieldAdd amendment from s8's LLD; if forgotten, the HLD's sc4 sketch and the shipped store would diverge. | s8's boundary explicitly records that it will propose the sc4 fieldAdd at its LLD; the field is additive + backward-compatible so no earlier story is affected, and the LLD review gates it. |

## Alternatives considered

### a1: Preserve the shipped a1 framework; apply AMD-2 as a pure boundary add — **CHOSEN**

Keep the layered extension-host + thin terminal-webview framework and all 5 shared contracts (sc1..sc5) + boundaries s1..s7 exactly as shipped, and add ONLY story boundary s8 (owns nothing; consumes sc1/sc2/sc3/sc4) in rollout Phase C.

The epic is already built through S005 against the a1 framework: vscode-free deps-injected host modules + a thin terminal webview over a single typed message protocol, with the five shared contracts realized as design-tokens.ts (sc1), stream-events.ts (sc2), cli-adapter.ts (sc5), protocol.ts (sc3) and session-store.ts (sc4). This alternative treats the HLD re-author as a mechanical amendment application: reproduce the framework summary, the five contract sketches, their owners, and boundaries s1..s7 verbatim, and append boundary s8.

s8's boundary owns no new contract and depends on sc1 (the insrc-term__marker--* classes), sc2 (TurnEvent via markerFor), sc3 (the session-restored message it rides) and sc4 (TranscriptEntry, which s8's LLD will extend with an optional cssClass — a sharedContract.fieldAdd owned by s3). It slots into Phase C alongside s5/s6/s7. No existing contract shape or boundary changes in this pass.

**Pros:**
- Zero churn to the 5 shipped contracts — S001-S005 code stays byte-aligned with the HLD sketches
- Smallest possible change: one boundary added, matching the pending AMD-2 exactly
- Keeps the sc4 field change where it belongs (s8's LLD amendment), not smeared into the HLD pass

**Cons:**
- Requires faithfully reproducing the existing HLD text so nothing drifts (a transcription burden, mitigated because the same author wrote it)

**Cost estimate:** S

### a2: Re-derive the HLD from scratch

Re-open the framework decision and re-synthesize all shared contracts + boundaries fresh, then add s8.

Ignore the shipped design and re-run the whole HLD synthesis — re-evaluate the framework alternatives, re-shape sc1..sc5, and re-draw every boundary s1..s8 from the current code.

This would produce a 'clean' HLD but is disproportionate to applying a single storyBoundary.addStory amendment.

**Pros:**
- Would catch any latent drift between the HLD sketches and the shipped code

**Cons:**
- High risk of re-writing contract sketches that S001-S005 already shipped against, creating HLD<->code drift the epic does not have today
- Disproportionate effort (whole-epic re-synthesis) for a one-boundary amendment
- Re-opening approved+built contracts violates the preserve-only intent of an amendment application

**Cost estimate:** L

**Rejected because:** Re-deriving the whole HLD would nominally satisfy the same constraints, but at high risk of rewriting the five contract sketches S001-S005 already shipped against — introducing HLD<->code drift the epic does not have today — for no benefit over a1 on a single-boundary amendment. Disproportionate; loses to a1 on preserve-only fit.

## Citations

- **[[c1]]** `analyze-bundle` `s1: shipped HLD framework (a1) + 5 contracts realized in vscode-plugin/src/chat (design-tokens.ts, stream-events.ts, cli-adapter.ts, protocol.ts, session-store.ts)` — "a1 layered extension-host + thin terminal webview; sc1 design-tokens.ts, sc2 stream-events.ts, sc5 cli-adapter.ts, sc3 protocol.ts, sc4 session-store.ts — all shipped"
- **[[c2]]** `analyze-bundle` `s1: the sc4 seam s8 amends + markerFor cssClass (session-store.ts, chat-panel.ts, markers.ts)` — "TranscriptEntry has no cssClass; appendEvent drops markerFor's cssClass; the session-restored branch replays line(x.text) with no class (S004 MED-1)"
- **[[c3]]** `doc` `s1: the pending amendment AMD-edb76e2e4d41217d-2 (storyBoundary.addStory s8) against docs/epics/work-framed-approved-spec-proceed-from-E20260925edb76e2e/HLD.md` — "design.story s8 failed: HLD has no boundary for s8; this re-author adds it"
