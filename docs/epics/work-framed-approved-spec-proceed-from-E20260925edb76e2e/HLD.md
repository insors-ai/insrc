<!-- insrc:artifact HLD-edb76e2e4d41217d -->

# HLD: Layered extension-host core + a thin terminal-styled webview (alternative a1)

## Framework summary

Layered extension-host core + a thin terminal-styled webview (alternative a1). All chat logic lives in vscode-free, deps-injected host modules that mirror the repo's existing createWebviewPanelHost(deps) factory idiom, so streaming, session, edit-governance and docs-review logic are unit-testable without a webview harness. The webview holds no business logic — it paints terminal-styled surfaces and emits user intents over a single typed, versioned message protocol. Each agentic CLI's native structured stream is normalized to ONE event union by a per-provider stream adapter, quarantining the still-to-spike claude/codex stream/resume contract at that boundary so no downstream surface is provider-specific. Grounding + tracked-workflow behaviour come through the CLI's own insrc MCP (the extension observes, never orchestrates — k8).

## Architecture shape

Three layers. (1) HOST CORE (vscode-free, deps-injected): a per-provider StreamAdapter (spawns claude/codex, maps native stream → normalized event union), a ChatSessionStore (extension-local transcripts + provider + native session-id), an EditGovernor (applies the auto/review toggle over file-edit events), and a DocsReviewClient (over the existing daemon IPC). (2) MESSAGE BRIDGE: a single typed, versioned protocol — host→webview render/stream events, webview→host user intents — the only channel between layers. (3) THIN WEBVIEW: a terminal-styled renderer consuming shared design tokens; it renders the chat log, dropdowns, inline-diff and docs-review, and emits intents. Wiring lives in extension.ts activation next to the existing panel host. The daemon is reached ONLY over the existing IPC client (docs-review data); chat CLI execution deliberately bypasses the daemon (k1).

## Shared contracts

### sc1: Terminal-UX design tokens + component vocabulary

**Owner Story:** `s1`
**Consumed by:** `s3`, `s4`, `s5`, `s6`, `s7`

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
**Consumed by:** `s3`, `s4`, `s6`

**Purpose:** The provider-agnostic event union the StreamAdapter emits per turn; the shared vocabulary that drives streaming render (s3), lifecycle markers (s4) and edit detection (s6), so a claude/codex stream-format difference never leaks past the adapter.

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
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** The single typed, versioned channel between the host and the thin webview — host→webview render/stream events and webview→host user intents — that every UI surface (chat, markers, dropdowns, inline-diff, docs-review) rides on, preventing ad-hoc channel drift.

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
**Consumed by:** `s5`, `s6`

**Purpose:** The persisted ChatSession record + store interface (transcript, fixed provider, native session-id, per-session edit-mode) kept extension-local (k3). Introduced by the panel that first needs a live session (s3), extended by history/provider (s5) and per-session edit mode (s6).

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

### Story E20260925edb76e2e:S001

**Owns:** `sc1`

The concrete mockup deliverables (per-surface terminal-styled mock images/HTML), the design-rationale write-up, and the exact palette/character choices are private to S001; downstream stories consume only the sc1 token/vocabulary contract, not the mock files themselves.

### Story E20260925edb76e2e:S002

**Owns:** `sc2`, `sc5`

The subprocess spawn mechanics, the per-provider parsing of each CLI's NATIVE stream format, the exact claude/codex flags (the stream/resume spike), backpressure/cancellation handling, and error normalization stay private to S002; consumers see only the normalized TurnEvent union (sc2) and the StreamAdapter/ProviderRegistry interface (sc5).

### Story E20260925edb76e2e:S003

**Owns:** `sc3`, `sc4`
**Depends on:** `sc1`, `sc2`, `sc5`

The terminal renderer internals (how TurnEvents paint as terminal output), the input box, the panel/webview lifecycle and single-active-panel management, and the CSP/webview bootstrap are private to S003; other stories consume only the message protocol (sc3) and the session-store shape (sc4).

### Story E20260925edb76e2e:S004

**Depends on:** `sc1`, `sc2`, `sc3`

How status/tool-call TurnEvents are mapped to terminal-style marker lines, and how observed insrc MCP tool-calls are named/enriched into markers, are private to S004; it adds no new shared contract — it renders sc2 events as sc1-styled markers over sc3.

### Story E20260925edb76e2e:S005

**Depends on:** `sc1`, `sc3`, `sc4`, `sc5`

The provider-selector and history-dropdown UI, the new-chat vs open-chat flows, and the wiring of the StreamAdapter's native session-resume handle into a restored session are private to S005; it persists through sc4 and drives turns through sc5, adding no new shared contract.

### Story E20260925edb76e2e:S006

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The inline-diff renderer, the EditGovernor that applies the per-session auto/review toggle, and (review mode) the interception of the CLI's edit/write before the write reaches disk are private to S006; it consumes file-edit TurnEvents (sc2), the edit-mode field on the session (sc4), and the edit-prompt/edit-decision messages (sc3).

### Story E20260925edb76e2e:S007

**Depends on:** `sc1`, `sc3`

The docs-review pane and its DocsReviewClient over the existing daemon IPC (the exact pendingApproval listing + insrc_workflow_approve method names/payloads, pinned at the S007 LLD) and the mirroring of the JetBrains review/comment/accept-reject panel are private to S007; it consumes only the message protocol (sc3) and the terminal tokens (sc1) and adds no new shared contract to the Epic.

## Non-functional targets

- **Performance:** Streaming is incremental: assistant-delta events render to the terminal panel as they arrive (no wait-for-turn-complete); the host must not buffer a whole turn before painting. Marker updates are cheap status lines. The webview holds no heavy state.
- **Security:** No direct cloud REST from the extension (k2); all model access is via the user's own claude/codex CLI OAuth sessions. The webview runs under a strict CSP (no remote origins); host↔webview traffic is the typed sc3 protocol only. Chat history stays on the local machine (k3).
- **Observability:** Per-turn lifecycle markers (thinking/tool-call/streaming/done) are the user-facing progress signal; host modules log via the repo's getLogger, never console.log. Errors surface as an error TurnEvent rendered inline, not a silent failure.
- **Durability:** Chat history + per-session provider/native-session-id/edit-mode persist extension-local (VS Code state / local JSON) and survive window reload; nothing is written to the daemon. A missing/corrupt local store degrades to an empty history, never a crash.

## Rollout

### Phase A — foundational contracts (design system + CLI bridge)

**Stories:** `s1`, `s2`

The two dependency roots that own the cross-cutting contracts every later story consumes: S001 owns the terminal-UX tokens (sc1) and S002 owns the normalized stream-event schema (sc2) + the provider/stream-adapter interface (sc5). S002 also runs the claude/codex stream+resume spike here, behind the adapter, so the external unknown is retired before any UI is built. Neither ships a user-facing surface yet, so they can proceed in parallel.

**Backward compat:** Add only new modules; do not alter the existing extension.ts activation behaviour or the current status/repo-config webview host. No new user surface appears in this phase.

### Phase B — core terminal chat surface

**Stories:** `s3`, `s4`
**Flag:** `insrc.chat.enabled`

S003 (owns the webview↔extension message protocol sc3 + the extension-local session store sc4) builds the terminal-styled panel that renders S002's events over S001's tokens, then S004 adds per-turn lifecycle markers on top of that same event stream + protocol. S003 must precede S004 (S004 dependsOn s3). This is the first user-visible chat.

**Backward compat:** The chat panel is additive alongside the existing status panel; the two webview hosts must coexist without interfering. Gate the new surface behind the feature flag until it is proven.

### Phase C — provider/history, edit governance & docs review

**Stories:** `s5`, `s6`, `s7`
**Flag:** `insrc.chat.enabled`

The three consumer stories that layer on the Phase-B panel: S005 (provider selector + history dropdown + native session resume, over sc4/sc5), S006 (inline-diff with per-session auto/review over sc2 file-edit events + sc4 edit-mode), and S007 (docs-review pane over sc3 + sc1, reaching the daemon over the existing IPC). All depend (transitively) on S003 and add no new shared contract; they can be built in any order within the phase once B lands.

**Backward compat:** Preserve the extension-local session store shape (sc4) introduced in Phase B so restored chats keep working; the docs-review pane must not change the daemon's approval semantics — it only calls the existing approve flow. Keep everything behind the feature flag until the epic is GA.

**Ordering rationale:** Phases follow the Epic dependency graph and shared-contract ownership: owners land before consumers. Phase A = roots s1,s2 (own sc1, sc2, sc5). Phase B = s3 (owns sc3, sc4; dependsOn s1,s2) then s4 (dependsOn s2,s3). Phase C = s5 (dependsOn s3), s6 (dependsOn s2,s3), s7 (dependsOn s1,s3) — all downstream of B. No consumer precedes the story that owns a contract it depends on, and the claude/codex external-contract spike is deliberately front-loaded into Phase A behind the adapter boundary.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| External claude/codex structured-stream + native session-resume contract (S002/sc5) | The exact CLI flags and event schema are an out-of-process assumption (MED confidence) not verifiable from src; if a CLI lacks a machine-readable stream or resume, the event union and continuity model are affected. | Front-load a small S002 spike against the real claude/codex CLIs before UI work; keep the whole difference inside the StreamAdapter so a per-provider surprise never leaks into sc2/sc3 or any UI story; if a provider lacks resume, StreamAdapter.capabilities.resume=false degrades that provider's S005 continuity gracefully. |
| Review-mode edit interception BEFORE the write reaches disk (S006) | Gating an agentic CLI's file edit before it lands may not be possible if the CLI writes files itself in auto mode; the extension can reliably visualize post-write (auto) but pre-write gating depends on the CLI exposing an approval/permission hook. | Design S006 so 'auto' (visualize-only) is always available; scope 'review' (pre-write gate) to what the CLI's permission mode actually supports, discovered in the same S002 spike, and fall back to a clearly-labelled post-write review when a provider offers no pre-write hook. |
| Webview streaming throughput + message-protocol drift (sc3) | High-frequency assistant-delta events over the webview channel can jank the UI, and an evolving protocol risks host/webview handlers falling out of sync as surfaces are added. | Version the protocol envelope (v:1) and keep it typed in one shared module both sides import; batch/coalesce delta rendering in the thin webview; the host must stream incrementally (never buffer a whole turn). |

## Alternatives considered

### a1: Layered extension-host core + thin terminal webview (adapter-normalized stream) — **CHOSEN**

All logic lives in vscode-free host modules behind the existing factory+deps idiom; a thin terminal-styled webview renders over one typed, versioned message protocol; each CLI's native stream is normalized to one event union by a per-provider adapter.

The extension host owns every piece of logic as small, vscode-free, deps-injected modules (mirroring vscode-plugin/src/panels/webview-host.ts createWebviewPanelHost(deps)): a per-provider StreamAdapter that spawns claude/codex and maps each CLI's native structured stream into ONE normalized event union; a ChatSessionStore that persists transcripts + provider + native session-id extension-local; an EditGovernor that applies the auto/review toggle over file-edit events; and a DocsReviewClient over the existing daemon IPC. The webview is a thin renderer over a single typed, versioned message protocol, and the terminal look is a shared design-token set derived from site/css/tui.css. Provider differences are absorbed entirely inside the adapter.

**Pros:**
- Host logic is unit-testable with fakes and no vscode runtime (matches the repo's *.test + deps-injection idiom).
- The per-provider adapter is the ONLY place a claude/codex difference lives, so the S002 stream-flag spike can't ripple into S003-S007.
- Clean 1:1 story-to-module boundaries; S002 can land before the UI stories.
- Reuses the proven createWebviewPanelHost(deps) construction pattern.

**Cons:**
- More upfront structure (a defined message protocol + event union) than a quick monolith.
- A typed protocol means every new surface event is added in two places (host emitter + webview handler).

**Cost estimate:** L

### a2: Monolithic webview application (logic in the webview, host as thin CLI proxy)

A single large React/HTML webview owns chat, dropdowns, inline-diff and docs-review with an ad-hoc postMessage channel; the extension host is a thin proxy that just spawns the CLI and forwards raw stdout.

One webview bundle contains all the application logic — stream parsing, session/history state, edit governance, docs-review — and the extension host is a minimal shim that spawns the claude/codex subprocess and pipes its raw output to the webview, plus proxies daemon IPC calls. There is no formal host↔webview contract beyond an ad-hoc message channel; features are added by growing the webview app.

**Pros:**
- Fastest path to a first rendered turn — fewer module boundaries.
- No dual-maintenance of a typed protocol; UI and logic evolve together.

**Cons:**
- Stream/edit/history logic runs only inside a webview, far harder to unit-test — erodes accuracy-first coverage.
- VS Code webviews cannot spawn processes, so the host must proxy raw bytes anyway (proxy + in-webview parsing).
- Provider differences leak into the webview parser.
- An ad-hoc message channel drifts as surfaces are added.

**Cost estimate:** M

**Rejected because:** Weakens k1 and k5: a VS Code webview cannot spawn a subprocess so a host proxy is forced (proxy + in-webview parsing, the worst of both), and putting stream/edit/docs-review logic in the webview erodes the unit-test coverage the accuracy-first principle demands; provider differences also leak into UI code.

### a3: Extend the existing status webview-host into one multi-tab panel

Grow createWebviewPanelHost to add chat / inline-diff / docs-review tabs alongside the existing Detailed-Status panel, sharing one webview and one message channel.

Rather than a dedicated chat surface, the existing status/repo-config webview host is extended with new tabs for chat, inline-diff and docs-review, reusing its single webview, its message plumbing and its lifecycle. The chat CLI bridge and stores are added as new deps on the same host, fusing the long-lived streaming per-chat-session surface with the short-lived read-mostly status/config surface.

**Pros:**
- Maximal reuse of the existing panel host + message plumbing.
- One place for the user to find every insrc surface.

**Cons:**
- Fuses two very different lifecycles (streaming per-session chat vs stateless status/config) into one host.
- The status panel's message channel was not designed for high-frequency streaming events.
- Bloats the existing status host's surface area and test burden.
- A regression in the shared host can take down both surfaces at once.

**Cost estimate:** M

**Rejected because:** Fuses two incompatible lifecycles (streaming per-session chat vs stateless status/config) into one host, straining k6's pure-terminal aesthetic (partial), coupling chat stream throughput to unrelated status UI, and letting one regression take down both surfaces — worse operational fit than a1 despite similar constraint satisfaction.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map of vscode-plugin/src` — "Only existing webview is panels/webview-host.ts createWebviewPanelHost (status/repo-config); no chat webview; factory+deps idiom; the extension talks to the daemon over a shared IPC client (daemon/ su"
- **[[c2]]** `analyze-bundle` `s1 capability + IPC-surface probes` — "insrc_workflow_approve (50 refs) + pendingApproval (18 refs) exist as the docs-review pane's daemon surface; the JetBrains review panel (ReviewToolWindow.kt/ArtifactContentPane.kt/ReviewComment.kt) is"
- **[[c3]]** `analyze-bundle` `s1 external-contract note` — "claude/codex structured-stream (e.g. claude --output-format stream-json) + native session-resume are a MED-confidence external contract, quarantined behind the per-provider StreamAdapter so the normal"
