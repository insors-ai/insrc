<!-- insrc:artifact LLD-edb76e2e4d41217d-s3 -->

# LLD: E20260925edb76e2e:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790343836936-uhegob`
**HLD effective hash:** `f394a9ecb688...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (alternative a1). All chat logic lives in vscode-free, deps-injected host modules that mirror the repo's existing createWebviewPanelHost(deps) factory idiom, so streaming, session, edit-governance and docs-review logic are unit-testable without a webview harness. The webview holds no business logic — it paints terminal-styled surfaces and emits user intents over a single typed, versioned message protocol. Each agentic CLI's native structured stream is normalized to ONE event union by a per-provider stream adapter, quarantining the still-to-spike claude/codex stream/resume contract at that boundary so no downstream surface is provider-specific. Grounding + tracked-workflow behaviour come through the CLI's own insrc MCP (the extension observes, never orchestrates — k8).
**Rollout phase:** Phase B — core terminal chat surface
**Owns:** `sc3` (Webview↔extension message protocol), `sc4` (Extension-local chat/session store shape)
**Consumes:** `sc1` (Terminal-UX design tokens + component vocabulary), `sc2` (Normalized CLI stream-event schema), `sc5` (CLI provider + stream adapter interface)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The concrete mockup deliverables (per-surface terminal-styled mock images/HTML), the design-rationale write-up, and the exact palette/character choices are private to S001; downstream stories consume only the sc1 token/vocabulary contract, not the mock files themselves. — owns `sc1`
- `s2`: The subprocess spawn mechanics, the per-provider parsing of each CLI's NATIVE stream format, the exact claude/codex flags (the stream/resume spike), backpressure/cancellation handling, and error normalization stay private to S002; consumers see only the normalized TurnEvent union (sc2) and the StreamAdapter/ProviderRegistry interface (sc5). — owns `sc2`, `sc5`
- `s4`: How status/tool-call TurnEvents are mapped to terminal-style marker lines, and how observed insrc MCP tool-calls are named/enriched into markers, are private to S004; it adds no new shared contract — it renders sc2 events as sc1-styled markers over sc3.
- `s5`: The provider-selector and history-dropdown UI, the new-chat vs open-chat flows, and the wiring of the StreamAdapter's native session-resume handle into a restored session are private to S005; it persists through sc4 and drives turns through sc5, adding no new shared contract.
- `s6`: The inline-diff renderer, the EditGovernor that applies the per-session auto/review toggle, and (review mode) the interception of the CLI's edit/write before the write reaches disk are private to S006; it consumes file-edit TurnEvents (sc2), the edit-mode field on the session (sc4), and the edit-prompt/edit-decision messages (sc3).
- `s7`: The docs-review pane and its DocsReviewClient over the existing daemon IPC (the exact pendingApproval listing + insrc_workflow_approve method names/payloads, pinned at the S007 LLD) and the mirroring of the JetBrains review/comment/accept-reject panel are private to S007; it consumes only the message protocol (sc3) and the terminal tokens (sc1) and adds no new shared contract to the Epic.

## Contract details

**Surface level:** internal-shared

### `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost
```

**Parameters:**
- `deps: ChatPanelHostDeps` — Injected seams (mirrors the createWebviewPanelHost(deps) idiom): the vscode channel (createPanel/postMessage/onDidReceiveMessage/onDidDispose), a ProviderRegistry (sc5), a ChatSessionStore (sc4), renderTerminalStyle+surfaceClass (sc1), a cwd resolver, and a logger — so the whole host is unit-testable with a FakePanel + in-memory store.

**Returns:** `ChatPanelHost` — The narrow host handle (open()/dispose()) held by extension.ts. On open it renders the chat webview shell (one nonce'd inline script under a strict per-render CSP, the sc1 <style>) and wires the sc3 channel; it holds no vscode object directly.

**Errors:**
- `unknown-provider (surfaced, not thrown)` when a submit-turn/new-chat names a ProviderId the ProviderRegistry has no adapter for — the host posts a terminal error TurnEvent to the webview rather than throwing.

**Preconditions:**
- deps.providers.available is non-empty (at least one agentic CLI installed); an empty registry renders an inline 'no provider installed' terminal notice.

**Postconditions:**
- On a WebviewToHost 'submit-turn', the host resolves/creates the ChatSession, calls the provider StreamAdapter.run(TurnRequest{provider,prompt,cwd}) and for-await posts each TurnEvent as a HostToWebview 'turn-event' INCREMENTALLY (no whole-turn buffering — ac2), appending TranscriptEntry rows as it streams.
- The host RELAYS the prompt to the CLI and only observes TurnEvents; it never invokes an insrc workflow tool itself (k8/ac3).
- Every host->webview post goes through the injected fire-and-forget postMessage (a post to a disposed panel cannot reject inward).
- sc3 message variants s3 does not implement (edit-*/docs-*) are accepted-but-ignored no-ops (defined seams for S006/S007), never errors.

### `createMementoChatSessionStore`

```typescript
createMementoChatSessionStore(deps: { memento: Memento; now?: () => string; genId?: () => string }): ChatSessionStore
```

**Parameters:**
- `deps: { memento: Memento; now?: () => string; genId?: () => string }` — The sc4 real binding over a vscode Memento (chat sessions under an insrc.chat.* key prefix, JSON-serializable), mirroring the OnboardingStore/PromptStore seam template; now/genId are injectable for deterministic tests.

**Returns:** `ChatSessionStore` — The sc4 store persisting ChatSession records extension-local so history survives window reload (k3/durability). A sibling createInMemoryChatSessionStore(): ChatSessionStore is the volatile test double.

**Errors:**
- `graceful-degrade (no throw)` when a missing/corrupt memento entry — get returns undefined and list returns [] rather than throwing (durability NFR: degrade to empty history, never crash).

**Preconditions:**
- deps.memento is a vscode Memento (context.globalState or workspaceState); never the daemon store (k3).

**Postconditions:**
- create(provider) returns a ChatSession with a fresh id, createdAt=now(), editMode default 'auto', empty transcript; save/append persist via memento.update (fire-and-forget void).
- No chat data is written to the daemon graph/config store (k3).

## Data model changes

### `Envelope / HostToWebview / WebviewToHost / DocsArtifactSummary (sc3 protocol.ts)` — new

The sc3 typed, versioned channel verbatim from the HLD sketch: Envelope<T>{v:1;payload:T} wrapping the HostToWebview union (turn-event/session-restored/history-list/edit-prompt/docs-list/theme) and the WebviewToHost union (submit-turn/new-chat/open-chat/set-edit-mode/edit-decision/docs-decision), discriminated by `type`. protocol.ts imports TurnEvent/UnifiedDiff (sc2), TerminalTheme (sc1), ProviderId (sc5), TranscriptEntry/ChatSummary (sc4). s3 also DEFINES the minimal DocsArtifactSummary shape the docs-list variant carries (the protocol owns it; S007 consumes). Type-only; vscode-free. New module vscode-plugin/src/chat/protocol.ts.

```
+ export interface Envelope<T> { readonly v: 1; readonly payload: T; }
+ export type HostToWebview = ... ; export type WebviewToHost = ... ;
+ export interface DocsArtifactSummary { readonly id: string; readonly kind: string; readonly title: string; readonly status: string; }
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts (definition; consumed over the injected postMessage/onDidReceiveMessage channel that extension.ts:323-328 wires — keeping the `type` discriminant the existing channel already uses)`

### `ChatSession / TranscriptEntry / ChatSummary / ChatSessionStore (sc4 session-store.ts)` — new

The sc4 store shape verbatim from the sketch: ChatSession (id, provider, nativeSessionId?, createdAt, title, editMode, transcript), TranscriptEntry (role user|assistant|marker, text, at), ChatSummary, and the ChatSessionStore interface (create/get/list/append/save). New module vscode-plugin/src/chat/session-store.ts + a Memento-backed impl + an in-memory double (the OnboardingStore/PromptStore template).

```
+ export interface ChatSession { readonly id: string; readonly provider: ProviderId; nativeSessionId?: string; readonly createdAt: string; title: string; editMode: 'auto'|'review'; transcript: TranscriptEntry[]; }
+ export interface ChatSessionStore { create(provider): ChatSession; get(id): ChatSession|undefined; list(): ReadonlyArray<ChatSummary>; append(id, entry): void; save(session): void; }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts (definition; the real binding constructed at extension.ts activation over context.globalState/workspaceState, mirroring extension.ts:162-163 / :412-419)`

### `ChatPanelHost / ChatPanelHostDeps (chat-panel.ts)` — new

The s3-internal host factory contract (the returned narrow handle + the injected deps bag), mirroring WebviewPanelHost/WebviewPanelHostDeps in panels/types.ts. Private to S003 (not a shared contract) — downstream consumes sc3/sc4, not this factory. New module vscode-plugin/src/chat/chat-panel.ts.

```
+ export interface ChatPanelHost { open(): void; dispose(): void; }
+ export interface ChatPanelHostDeps { createPanel; postMessage; onMessage; onDidDispose; providers: ProviderRegistry; store: ChatSessionStore; renderStyle: typeof renderTerminalStyle; cwd: () => string; logger; }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts (definition; constructed once in extension.ts activate() behind the insrc.chat.enabled gate, mirroring createWebviewPanelHost at extension.ts:305)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | s3 OWNS sc3 and defines the full typed protocol (protocol.ts) verbatim from the sketch (Envelope<T> + both unions, `type` discriminant), including the minimal DocsArtifactSummary the docs-list variant carries. The host implements the chat slice (turn-event/session-restored out; submit-turn/new-chat/open-chat in); edit-*/docs-* variants are defined-but-unhandled seams S006/S007 wire. The channel rides the existing injected postMessage/onDidReceiveMessage seams (consuming, not modifying, webview-host.ts). |
| `sc4` | implements | s3 OWNS sc4 and ships session-store.ts (types + a Memento-backed ChatSessionStore keeping chat history extension-local per k3 + an in-memory double for tests). S005 extends it (history/provider), S006 uses editMode — they consume this shape, s3 does not pre-build their surfaces. |
| `sc1` | consumes | The host calls renderTerminalStyle(terminalTheme) to build the webview <style> and surfaceClass('chat') for the root class; it does not modify sc1. The rendered shell keeps the proven strict-CSP + single nonce'd inline script invariants (webview-host.test.ts:321-338). |
| `sc2` | consumes | The webview renders the TurnEvent union as terminal output (assistant-delta as streaming text, status/tool-call/file-edit/done/error as terminal lines); s3 consumes the union as-is and never reshapes it — provider differences stay behind sc5. |
| `sc5` | consumes | The host drives a turn via ProviderRegistry.get(provider).run(TurnRequest) and cancel(turnId); it reads capabilities but implements no provider/subprocess logic (that stays in S002's adapter, k1/k4). |

## Error paths

### Error cases

- **The selected CLI is unavailable or the subprocess fails to spawn / errors mid-turn.** (recoverable)
  - Detection: The host consumes the StreamAdapter async-iterable and observes a terminal `error` TurnEvent (S002 normalizes spawn/ENOENT/auth/stderr into an in-stream error event; it never throws).
  - Response: Post the error TurnEvent to the webview so it renders inline as a terminal error line, mark the turn done, and leave the session usable for the next turn. If ProviderRegistry.get throws unknown-provider, the host synthesizes an error TurnEvent instead of propagating.
  - User impact: The user sees the failure as terminal output (not a silent hang or a crashed panel) and can retry or switch chats.
- **The panel is disposed (closed) or hidden while a turn is still streaming.** (recoverable)
  - Detection: The injected onDidDispose fires (extension.ts:319-320) and sets the host's disposed flag; the outbound postMessage is the injected fire-and-forget that swallows the vscode rejection (extension.ts:328) so a post to a gone panel cannot reject inward.
  - Response: On dispose the host calls StreamAdapter.cancel(activeTurnId) to stop the subprocess and stops consuming/posting; no further postMessage is attempted after disposed.
  - User impact: Closing the panel mid-turn stops the CLI cleanly with no orphaned subprocess and no unhandled rejection.
- **The persisted chat store entry is missing or corrupt (bad JSON) on load/restore.** (recoverable)
  - Detection: createMementoChatSessionStore.get()/list() parse the memento value inside try/catch; a parse failure or missing key is caught.
  - Response: get returns undefined and list returns [] (degrade to empty history); on open with no restorable session the host creates a fresh ChatSession rather than throwing.
  - User impact: A corrupt store degrades to a clean empty history instead of a broken/crashing panel (durability NFR).
- **An inbound webview->host message is malformed or is a variant s3 does not implement (edit-*/docs-*, or an unknown type).** (recoverable)
  - Detection: The host validates the Envelope (v===1) and switches on payload.type; unknown/unimplemented variants fall to a default branch.
  - Response: edit-*/docs-* are accepted-but-ignored no-ops (defined seams for S006/S007); a malformed/unknown message is logged via the injected logger and dropped — never thrown, never a crash.
  - User impact: None — forward/foreign messages are inert; the chat keeps working.
- **A second submit-turn arrives while a turn is already streaming in the same session.** (recoverable)
  - Detection: The host tracks the active turnId per session; a submit while one is in flight is detected by that non-null active turnId.
  - Response: The host guards single-in-flight per session: it cancels the prior turn (StreamAdapter.cancel) before starting the new one, or ignores the submit with an inline terminal notice — pinned at build; either way the transcript never interleaves two turns.
  - User impact: No garbled interleaved output; one turn streams at a time per chat.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The user submits an empty or whitespace-only message. | The host does not spawn a turn (no StreamAdapter.run); the input is a no-op, optionally cleared. |
| A turn streams a very large volume of assistant-delta events. | Each delta is posted + appended incrementally (no whole-turn buffering); the webview appends to the terminal transcript and scrolls — memory stays bounded to the transcript, not a per-turn buffer (ac2/performance NFR). |
| The window is reloaded mid-turn, then the panel reopened. | The persisted transcript is restored via a session-restored message (history intact, k3/durability); the prior in-flight turn's un-persisted tail is lost (the external subprocess ended with the host) — no crash, the session is usable. |
| The chat command is invoked while a chat panel is already open. | The single-active-panel management reveals the existing panel (or its existing session) rather than creating a duplicate webview. |
| insrc.chat.enabled is false (or unset) at activation. | The chat command is not registered / the panel is not created (Phase B flag gate); no chat surface appears and nothing else regresses. |

### Invariants to preserve

- The rendered webview keeps the proven security shell: exactly ONE inline script carrying a per-render nonce, a strict Content-Security-Policy whose script-src is limited to that nonce, the script nonce identical to the CSP nonce, and a FRESH nonce minted every render — no cspSource/asWebviewUri (s1 code bundle: webview-host.ts builds CSP+nonce at render time, enforced by panels/__tests__/webview-host.test.ts:321-338). The chat shell must not weaken this. [[c2]]
- The whole vscode surface stays INJECTED at the extension.ts callsite (createWebviewPanel/onDidReceiveMessage/postMessage/onDidDispose), so the chat host module is vscode-free and unit-testable with a FakePanel (s1 code bundle: extension.ts:305-328 deps literal; webview-host.ts is vscode-free). s3's host must follow the same factory+deps idiom, not import vscode. [[c2]]
- Host->webview postMessage is fire-and-forget void that swallows the vscode promise rejection, so a post to a disposed/hidden panel never rejects inward (s1 code bundle: extension.ts:328 `panel.webview.postMessage(message).then(undefined, ()=>{})`). The streaming turn loop must post through this seam and stop on dispose. [[c2]]
- Chat history/sessions persist EXCLUSIVELY through a vscode Memento (globalState/workspaceState) behind an injected store seam — never the daemon graph/config store, and no local-JSON-file persistence (s1 code bundle: the plugin's only persistence idiom is Memento, e.g. extension.ts:162-163/:412-419; k3). sc4's real binding is a Memento with an in-memory double for tests. [[c1]]
- The extension is a passthrough: the chat host relays the prompt to the CLI's StreamAdapter and only observes TurnEvents; it never invokes an insrc workflow/MCP tool itself (grounding + tracked workflow come through the CLI's own MCP — k8/ac3). [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test) + node:assert/strict, mirroring vscode-plugin/src/panels/__tests__/webview-host.test.ts (FakePanel-driven, no vscode runtime).`

### Test levels

- **unit** — Prove the vscode-free chat host's message dispatch + turn loop + session persistence with a FakePanel, a fake StreamAdapter, and an in-memory ChatSessionStore.
  - Subjects: `submit-turn -> host calls StreamAdapter.run(TurnRequest{provider,prompt,cwd}) and posts each yielded TurnEvent as a HostToWebview 'turn-event' INCREMENTALLY (assert posts interleave with the async iterable, not buffered to the end) — ac2`, `a terminal error TurnEvent (fake adapter) is posted inline and the turn is marked done, session still usable; unknown-provider is surfaced as an error event, not thrown`, `empty/whitespace submit-turn is a no-op (no StreamAdapter.run)`, `single-in-flight guard: a second submit while streaming cancels the prior turn (StreamAdapter.cancel) or is ignored — transcript never interleaves`, `onDidDispose -> host calls StreamAdapter.cancel(activeTurnId) and posts nothing further (posts routed through the fire-and-forget seam)`, `edit-*/docs-* and unknown/malformed inbound messages are accepted-but-ignored no-ops (logged, never thrown)`, `createMementoChatSessionStore round-trip over a fake Memento: create/append/save then get/list reflect it; a corrupt/missing entry degrades to undefined/[] (no throw); createInMemoryChatSessionStore parity`, `no chat data written anywhere but the injected memento (k3)`
  - Fixtures: `A FakePanel (onDidDispose/postMessage/onDidReceiveMessage capture) mirroring panels/__tests__/webview-host.test.ts`, `A fake StreamAdapter yielding a scripted TurnEvent sequence (deltas + done, and an error variant)`, `A fake Memento (get/update map) for the store round-trip`
- **contract** — Lock the sc3 protocol type-exhaustiveness and the rendered chat shell's security + sc1 consumption.
  - Subjects: `The rendered chat webview shell keeps the proven invariants: exactly one inline nonce'd script, strict CSP script-src limited to 'nonce-...', script nonce == CSP nonce, fresh nonce per render (mirrors webview-host.test.ts:321-338)`, `The shell embeds renderTerminalStyle(terminalTheme) (sc1) and targets surfaceClass('chat') — terminal styled, not chat-bubble (k6)`, `sc3 protocol.ts: an exhaustive switch over HostToWebview/WebviewToHost `type` compiles (compile-time exhaustiveness) and every message keeps the `type` discriminant; Envelope v===1`, `no remote origin / asWebviewUri in the rendered shell (k2 CSP-safe)`
  - Fixtures: `A sample ChatSession + TranscriptEntry[] for a session-restored render`
- **integration** — Prove the extension.ts wiring (source-scan idiom, like config/__tests__/seam.test.ts) gates + injects correctly.
  - Subjects: `extension.ts registers the chat panel command ONLY when insrc.chat.enabled is read true (config gate), via getConfiguration().get with the full dotted key`, `extension.ts constructs createChatPanelHost with the real injected vscode seams (createWebviewPanel/onDidReceiveMessage/postMessage/onDidDispose) and the memento-backed ChatSessionStore — the chat host module imports nothing from 'vscode'`, `the chat panel Disposable is pushed into context.subscriptions`
  - Fixtures: `Source-scan over extension.ts + the chat modules (readFileSync + regex), no runtime`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `submit-turn -> StreamAdapter.run called with the typed prompt and the turn-events posted to the webview (unit)`, `the rendered shell is terminal-styled via renderTerminalStyle + surfaceClass('chat'), not chat-bubble (contract)`, `extension.ts wires the chat command to createChatPanelHost with injected vscode seams (integration)` |
| `ac2` | `turn-events are posted INCREMENTALLY as the async iterable yields (assert interleaving / no whole-turn buffering) (unit)`, `large-delta-volume edge: each delta appended incrementally (unit)` |
| `ac3` | `the host only calls StreamAdapter.run/cancel and never invokes an insrc workflow/MCP tool (unit: assert no such call on the injected deps; passthrough)`, `arbitrary prompt text is relayed verbatim to the adapter (unit)` |

## Migration

**State before:** vscode-plugin/src/chat/ currently holds only the S001/S002 modules (design-tokens.ts, cli-adapter.ts, stream-events.ts + their tests); there is NO chat panel, protocol, or session store. The only webview is the status/repo-config panel created via createWebviewPanelHost at extension.ts:305 (s1 code bundle). extension.ts activate() already has the config-read idiom (getConfiguration().get, extension.ts:181) and the Memento persistence idiom (globalState/workspaceState, extension.ts:162-163/:412-419) but no insrc.chat.enabled setting and no chat command. Nothing wires the sc5 StreamAdapter into a UI yet (S002 shipped it un-wired, Phase A).

**State after:** Three new vscode-free modules under vscode-plugin/src/chat/: protocol.ts (sc3), session-store.ts (sc4, memento-backed impl + in-memory double), and chat-panel.ts (createChatPanelHost, the terminal chat webview host consuming sc1/sc2/sc5). extension.ts activate() additionally reads insrc.chat.enabled and, ONLY when true, constructs the memento-backed ChatSessionStore + the ProviderRegistry-backed host and registers the chat command (its Disposable pushed into context.subscriptions), with the vscode channel seams injected exactly as the status panel does. package.json contributes the chat command + the insrc.chat.enabled configuration (default false). Unit/contract/integration suites added under vscode-plugin/src/chat/__tests__/. The status panel, all existing commands, and createWebviewPanelHost are byte-unchanged; the flag defaults off so nothing changes for a user until they opt in (Phase B).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add vscode-plugin/src/chat/protocol.ts (sc3: Envelope + HostToWebview/WebviewToHost unions + minimal DocsArtifactSummary) and session-store.ts (sc4: ChatSession/TranscriptEntry/ChatSummary/ChatSessionStore + createMementoChatSessionStore + createInMemoryChatSessionStore). Type-only + a pure store; no existing file edited. — ↩ rollbackable
2. Add vscode-plugin/src/chat/chat-panel.ts: createChatPanelHost(deps) + the terminal chat webview shell renderer (consumes renderTerminalStyle + surfaceClass('chat'), one nonce'd inline script under a strict per-render CSP). vscode-free; no existing file edited. — ↩ rollbackable
3. Wire extension.ts activate(): read insrc.chat.enabled via getConfiguration().get; when true, construct the memento-backed ChatSessionStore + createChatPanelHost with the injected vscode channel seams (createWebviewPanel/onDidReceiveMessage/postMessage/onDidDispose) mirroring the status-panel callsite, register the chat command, and push its Disposable into context.subscriptions. Existing wiring untouched. — ↩ rollbackable _(needs: `insrc.chat.enabled`)_
4. Add to vscode-plugin/package.json contributes: the chat command entry and the insrc.chat.enabled configuration property (type boolean, default false). Purely additive manifest change. — ↩ rollbackable
5. Add the test suites under vscode-plugin/src/chat/__tests__/ (host dispatch/turn-loop/store unit with a FakePanel + fake StreamAdapter + fake Memento; rendered-shell CSP/nonce + sc1 contract; extension-wiring source-scan for the flag gate + injected seams). Run the scoped src/chat suite, then tsc + the full plugin sweep as the regression gate. — ↩ rollbackable

**Backward compat:** Additive only. createWebviewPanelHost and the existing status/repo-config panel are untouched; every existing command and activation path is unchanged. sc3/sc4 are brand-new contracts with no prior consumers. The chat command + insrc.chat.enabled are new, and the flag DEFAULTS OFF, so a user who does not opt in sees no behavioral change; the package.json additions are additive (new command + new config property). No existing public API signature changes.

## Alternatives considered

### a1: HLD-as-is: versioned Envelope<T> wrapper + memento-backed ChatSessionStore + host-run turn loop — **CHOSEN**

Ship sc3 and sc4 exactly as the HLD sketches them — an Envelope<T>{v:1,payload} wrapping the HostToWebview/WebviewToHost unions, and a ChatSession/ChatSessionStore persisted over a vscode Memento with an in-memory double for tests; the vscode-free chat host runs the StreamAdapter turn loop and streams turn-events out.

A new createChatPanelHost(deps) factory in vscode-plugin/src/chat/ mirrors createWebviewPanelHost: deps inject the vscode channel seams (createPanel/postMessage/onDidReceiveMessage/onDidDispose), a ProviderRegistry (sc5), a ChatSessionStore (sc4), renderTerminalStyle+surfaceClass (sc1), and a logger. Wire messages are Envelope<T>{v:1,payload} as the HLD shows; the payload discriminant stays `type`. sc3 (protocol.ts) is the full typed HostToWebview/WebviewToHost union verbatim from the sketch, plus a minimal DocsArtifactSummary the docs-list variant carries (the protocol owns the shape; S007 fills it). sc4 (session-store.ts) is ChatSession/TranscriptEntry/ChatSummary/ChatSessionStore verbatim + a Memento-backed implementation (chat sessions under an insrc.chat.* key prefix, JSON-serializable) + a volatile in-memory double for tests. On submit-turn the host creates/loads the session, calls StreamAdapter.run(TurnRequest{provider,prompt,cwd}), and for-await yields TurnEvents -> postMessage {type:'turn-event'} INCREMENTALLY while appending TranscriptEntry rows; the thin webview (one nonce'd inline script under the proven strict CSP) renders turn-events as terminal output via the sc1 <style> and posts submit-turn/new-chat/open-chat. s3 IMPLEMENTS the chat slice; edit-* / docs-* variants are defined-but-unhandled seams for S006/S007. Command registration gated on insrc.chat.enabled.

### a2: Flat versioned messages (no Envelope generic) matching the existing channel idiom

Same host + memento store, but sc3 messages are FLAT discriminated objects keyed by `type` with a shared `v: 1` field on each (dropping the Envelope<T> generic), matching the plugin's existing postMessage({type:...}) channel.

Identical to a1 in every respect (createChatPanelHost factory, memento-backed ChatSessionStore + in-memory double, host turn loop, thin nonce'd webview, insrc.chat.enabled gate) EXCEPT the wire shape: sc3 becomes flat unions where each member carries both `type` (discriminant) and a `v: 1` version field, with no Envelope<T> wrapper. This matches the existing `panel.webview.postMessage({ type: '...' })` convention the current suites parse literally, keeping ONE wire idiom across the whole plugin. Requires a small sc3 HLD amendment (sharedContract shape refine: remove Envelope<T>, add `v` to each message) since the sketch shows the wrapper.

**Rejected because:** Equivalent on every ac and only marginally 'more consistent' on the wire shape, but scores partial on sc3 because it needs an amendment to a widely-consumed contract for a cosmetic win. Loses to a1, which needs no churn.

### a3: In-memory store now; defer the memento persistence to S005

Ship sc3 as in a1 but sc4's only implementation in s3 is the in-memory store; the durable Memento binding is deferred to S005 (history), so a reload loses the current chat.

createChatPanelHost + the full sc3 envelope + the host turn loop exactly as a1, but s3 provides ONLY the volatile in-memory ChatSessionStore; the real Memento-backed binding (persistence across reload) is left for S005 when history/provider land. sc4's TYPES ship in s3 (so downstream can consume), but its durable implementation does not.

**Rejected because:** Ranked last: VIOLATES sc4 by leaving the s3-owned store's durable binding unbuilt, breaking the story's own durability/k3 NFR for a small saving. a1 ships the (small) memento seam and satisfies sc4 outright.

## Citations

- **[[c1]]** `analyze-bundle` `s1 code bundle: webview message channel + panel lifecycle + CSP/nonce (webview-host.ts:111-401, extension.ts:305-328, webview-host.test.ts:321-338)`
- **[[c2]]** `analyze-bundle` `s1 code bundle: config-flag read (extension.ts:181) + Memento persistence idiom (extension.ts:162-163/:412-419; OnboardingStore/PromptStore)`
- **[[c3]]** `analyze-bundle` `s1 test bundle: FakePanel-driven suite + CSP/nonce invariants (webview-host.test.ts) + config seam source-scan (config/__tests__/seam.test.ts)`
- **[[c4]]** `prior-artifact` `HLD sharedContracts sc3 (protocol) + sc4 (ChatSessionStore), ownedByStory=s3; sc1/sc2/sc5 consumed`
- **[[c5]]** `stakeholder` `k1/k6/k8 (extension-managed streaming, terminal look, passthrough) + k3 (chat history extension-local)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-25T16:04:30.003Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | extension.ts wires createWebviewPanelHost with the vscode channel injected: it creates the panel and forwards onDidReceiveMessage/postMessage/onDidDispose in the deps literal (~extension.ts:305-328). | read extension.ts:305 found; grep matched createWebviewPanel( at extension.ts:313 and panel.webview.onDidReceiveMessage at extension.ts:323 — the injected channel wiring is exactly where cited. | none — verified sound |
| cl2 | citation | LOW | manual | The host->webview postMessage is fire-and-forget: extension.ts calls panel.webview.postMessage(message).then(undefined, ()=>{}) so a post to a disposed panel cannot reject inward (~extension.ts:328). | grep matched postMessage(message).then(undefined at vscode-plugin/src/extension.ts:328 (read found) — the fire-and-forget seam is confirmed. | none — verified sound |
| cl3 | citation | LOW | manual | The webview security shell (strict CSP script-src limited to a per-render nonce; script nonce == CSP nonce; fresh nonce per render) is asserted in panels/__tests__/webview-host.test.ts around lines 321-338. | grep matched script-src 'nonce- and 'each render uses a fresh nonce' in panels/__tests__/webview-host.test.ts (read :327 found) — the CSP/nonce invariants exist as cited. | none — verified sound |
| cl4 | citation | LOW | manual | The plugin reads config with vscode.workspace.getConfiguration().get(key) using the full dotted key (extension.ts:181) — the idiom the insrc.chat.enabled gate follows. | grep matched getConfiguration().get( exactly once at extension.ts:181 (read found) — the config-read idiom the flag gate follows. | none — verified sound |
| cl5 | citation | LOW | manual | The plugin persists extension-local state via vscode Memento (globalState/workspaceState) — the idiom sc4's memento-backed ChatSessionStore follows (extension.ts:162-163 lastSeen / :412-419 onboarded). | grep matched globalState.(get\|update) at extension.ts:162 and workspaceState.(get\|update) at extension.ts:118 (read :162 found) — the Memento persistence idiom sc4 mirrors. | none — verified sound |
| cl6 | semantic | LOW | manual | The consumed contracts already exist as shipped exports: sc1 renderTerminalStyle + surfaceClass (design-tokens.ts), sc2 TurnEvent (stream-events.ts), sc5 StreamAdapter/ProviderRegistry (cli-adapter.ts). | renderTerminalStyle is a real export at vscode-plugin/src/chat/design-tokens.ts:174 (sc1 shipped, read found); StreamAdapter/TurnEvent exports resolve in the shipped S002 chat modules (grep counts include the code files beyond the docs). Consumed contracts exist. | none — verified sound |
| cl7 | semantic | LOW | manual | The sc3/sc4/chat-panel modules (protocol.ts, session-store.ts, chat-panel.ts, createChatPanelHost, ChatSessionStore) are net-new — they do not yet exist in vscode-plugin/src/chat and the change is additive. | createChatPanelHost / createMementoChatSessionStore / chat/protocol match ONLY under docs/ (the artifact), with no hit in vscode-plugin/src — confirming the sc3/sc4/chat-panel modules are genuinely net-new and the change is additive. | none — verified sound |
| cl8 | citation | LOW | manual | An injected store-seam template (an interface with a memento-backed real binding + a volatile in-memory double) already exists as OnboardingStore, the pattern sc4 mirrors. | OnboardingStore resolves (read onboarding/types.ts:1 found; 43 refs) — the injected store-seam template (memento binding + in-memory double) sc4 mirrors exists. | none — verified sound |
