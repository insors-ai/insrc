<!-- insrc:artifact LLD-edb76e2e4d41217d-s5 -->

# LLD: E20260925edb76e2e:S005

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790343836936-uhegob`
**HLD effective hash:** `f394a9ecb688...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (alternative a1). All chat logic lives in vscode-free, deps-injected host modules that mirror the repo's existing createWebviewPanelHost(deps) factory idiom, so streaming, session, edit-governance and docs-review logic are unit-testable without a webview harness. The webview holds no business logic — it paints terminal-styled surfaces and emits user intents over a single typed, versioned message protocol. Each agentic CLI's native structured stream is normalized to ONE event union by a per-provider stream adapter, quarantining the still-to-spike claude/codex stream/resume contract at that boundary so no downstream surface is provider-specific. Grounding + tracked-workflow behaviour come through the CLI's own insrc MCP (the extension observes, never orchestrates — k8).
**Rollout phase:** Phase C — provider/history, edit governance & docs review
**Consumes:** `sc1` (Terminal-UX design tokens + component vocabulary), `sc5` (CLI provider + stream adapter interface), `sc3` (Webview↔extension message protocol), `sc4` (Extension-local chat/session store shape)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The concrete mockup deliverables (per-surface terminal-styled mock images/HTML), the design-rationale write-up, and the exact palette/character choices are private to S001; downstream stories consume only the sc1 token/vocabulary contract, not the mock files themselves. — owns `sc1`
- `s2`: The subprocess spawn mechanics, the per-provider parsing of each CLI's NATIVE stream format, the exact claude/codex flags (the stream/resume spike), backpressure/cancellation handling, and error normalization stay private to S002; consumers see only the normalized TurnEvent union (sc2) and the StreamAdapter/ProviderRegistry interface (sc5). — owns `sc2`, `sc5`
- `s3`: The terminal renderer internals (how TurnEvents paint as terminal output), the input box, the panel/webview lifecycle and single-active-panel management, and the CSP/webview bootstrap are private to S003; other stories consume only the message protocol (sc3) and the session-store shape (sc4). — owns `sc3`, `sc4`
- `s4`: How status/tool-call TurnEvents are mapped to terminal-style marker lines, and how observed insrc MCP tool-calls are named/enriched into markers, are private to S004; it adds no new shared contract — it renders sc2 events as sc1-styled markers over sc3.
- `s6`: The inline-diff renderer, the EditGovernor that applies the per-session auto/review toggle, and (review mode) the interception of the CLI's edit/write before the write reaches disk are private to S006; it consumes file-edit TurnEvents (sc2), the edit-mode field on the session (sc4), and the edit-prompt/edit-decision messages (sc3).
- `s7`: The docs-review pane and its DocsReviewClient over the existing daemon IPC (the exact pendingApproval listing + insrc_workflow_approve method names/payloads, pinned at the S007 LLD) and the mirroring of the JetBrains review/comment/accept-reject panel are private to S007; it consumes only the message protocol (sc3) and the terminal tokens (sc1) and adds no new shared contract to the Epic.

## Contract details

**Surface level:** internal

### `renderShell`

```typescript
renderShell(): string
```

**Returns:** `string` — The webview HTML shell (S003, chat-panel.ts:~80), RESHAPED by S005 to add two sc1-styled controls inside the SAME one nonce'd inline script: a provider-selector whose <option>s are rendered from deps.providers.available (so no new sc3 message is needed — the installed claude/codex set is fixed per panel, k4), and an (initially empty) history-dropdown container. The bootstrap wires: provider-select change -> postMessage new-chat{provider}; history-select change -> postMessage open-chat{chatId}; and a 'history-list' handler that (re)populates the history <option>s. CSP unchanged (one nonce'd script, no remote origin, textContent for any dynamic label).

**Preconditions:**
- deps.providers.available lists the installed agentic CLIs (claude/codex only, k4).

**Postconditions:**
- Still exactly ONE nonce'd <script> under the strict CSP; the selector/dropdown are sc1-styled (surfaceClass provider-dropdown/history-dropdown); no new sc3 message type introduced.
- Provider <option>s are attribute-escaped; history labels are set via textContent (no innerHTML) — no XSS from a chat title.

### `open`

```typescript
open(): void
```

**Returns:** `void` — The host open() (S003, chat-panel.ts:~255), RESHAPED to ALSO post a 'history-list' message (from deps.store.list()) after theme + session-restored, so the history-dropdown is populated as soon as the panel opens.

**Postconditions:**
- Posts theme, session-restored, and history-list on open; no daemon call (k3), no workflow call (k8).

### `handleMessage`

```typescript
handleMessage(message: unknown): void
```

**Parameters:**
- `message: unknown` — The raw webview->host envelope (sc3 WebviewToHost), validated as in S003.

**Returns:** `void` — The host dispatcher (S003, chat-panel.ts:~213), RESHAPED so that after a new-chat (store.create) or open-chat (store.get) session switch it ALSO re-posts 'history-list' — so a newly created chat appears in the dropdown and the current selection stays in sync. The existing cancelActive()+ ++generation single-in-flight guard is preserved unchanged.

**Preconditions:**
- Envelope passes the S003 {v:1, payload:object} guard; unknown/forward types remain accepted-but-ignored.

**Postconditions:**
- new-chat{provider} creates a session with the SELECTED provider (fixed at create, lc2) and re-posts history-list; open-chat{chatId} restores + re-posts history-list; malformed provider/chatId is a no-op (never throws).

### `runTurn`

```typescript
runTurn(text: unknown): Promise<void>
```

**Parameters:**
- `text: unknown` — The submit-turn prompt (validated typeof string as in S003).

**Returns:** `Promise<void>` — The host turn loop (S003, chat-panel.ts:~137), RESHAPED so that (a) on the FIRST user turn of a session it sets session.title from the trimmed/clipped prompt (replacing the create-time 'new chat') via the existing save() path, and (b) after the terminal 'done' it re-posts 'history-list' (title/updatedAt changed). Native resume (ac3) is ALREADY implemented here (req.resume from s.nativeSessionId; capture ev.sessionId on done) and is unchanged — S005 only verifies it.

**Preconditions:**
- session is defined and prompt is a non-empty string (S003 guards).

**Postconditions:**
- First-turn title is derived from the first user prompt (empty/whitespace falls back to 'new chat'); native resume unchanged (extension replays NO prior turns — lc1); history-list re-posted after done; no workflow call (k8).

### `createMementoChatSessionStore`

```typescript
createMementoChatSessionStore(deps: MementoStoreDeps): ChatSessionStore
```

**Parameters:**
- `deps: MementoStoreDeps` — The store deps (S003), IMPL-extended with an optional maxSessions cap; the sc4 ChatSessionStore interface is unchanged.

**Returns:** `ChatSessionStore` — The sc4 memento store (S003, session-store.ts:84), RESHAPED at the IMPL level: save() now evicts the oldest ids (and their insrc.chat.session.<id> keys) beyond an optional deps.maxSessions cap, so extension-local history (k3) stays bounded (the S003 L4 follow-up). The ChatSession/TranscriptEntry/ChatSummary/ChatSessionStore contract shapes are UNCHANGED (no field add/remove) — this is an interface-compatible impl change.

**Preconditions:**
- maxSessions, when provided, is a positive integer; unset means the S003 unbounded behaviour.

**Postconditions:**
- The index never exceeds maxSessions; eviction removes the oldest sessions' keys too (no orphaned session blobs); get/list/create/append/save signatures are byte-identical to S003; corruption tolerance preserved.

## Data model changes

### `ChatSession.title (session-store.ts)` — field-modify

The existing (mutable) ChatSession.title is now POPULATED from the first user prompt (trimmed + clipped) instead of remaining the create-time constant 'new chat', so the history dropdown rows are distinguishable (ac2). No schema/type change — title is already `title: string`; only its value semantics change. Current-behaviour invariant it changes: s1 bundle notes create() hard-codes title:'new chat' and it is never updated.

```
// no type change; title value now derived from first prompt (was always 'new chat')
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts (create default; save persists)`
- `vscode-plugin/src/chat/chat-panel.ts (runTurn sets title on the first user turn)`

### `chat index cap (session-store.ts insrc.chat.index)` — invariant-change

The insrc.chat.index id list, UNBOUNDED in S003 (create/save only append), is now bounded to an optional maxSessions cap: save() evicts the oldest ids + their session keys beyond the cap. Interface-compatible impl change (no sc4 shape change). Current-behaviour invariant it changes: s1 bundle notes the index is unbounded and nothing evicts (the S003 L4 follow-up).

```
// MementoStoreDeps gains optional maxSessions?: number (impl dep, not part of the sc4 ChatSessionStore contract)
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts (save eviction; create via save)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | The provider-selector + history-dropdown render with the sc1 terminal tokens (the provider-dropdown/history-dropdown SurfaceKind + surfaceClass already exist in sc1); S005 does not modify design-tokens.ts. |
| `sc3` | consumes | Rides the EXISTING sc3 messages only: posts history-list (HostToWebview) and receives new-chat{provider}/open-chat{chatId} (WebviewToHost). Provider options are rendered into the shell from providers.available, so NO new sc3 message/field is added (no amendment). |
| `sc4` | consumes | Consumes list()/create(provider)/get(id) + ChatSession.nativeSessionId as-is; the title-from-prompt and the maxSessions index cap are interface-compatible IMPL changes to the S003 store (no change to the sc4 ChatSession/TranscriptEntry/ChatSummary/ChatSessionStore shapes). |
| `sc5` | consumes | Consumes ProviderRegistry.available (populates the selector, k4) + StreamAdapter.capabilities.resume + TurnRequest.resume (the native-resume path already wired in runTurn); no reshape of sc5. |

## Error paths

### Error cases

- **The history-dropdown offers a chat whose session blob is missing or corrupt (evicted by the cap, or a partial write), and the user selects it.** (recoverable)
  - Detection: handleMessage's open-chat branch calls store.get(chatId) and checks for undefined (the S003 corruption-tolerant get returns undefined on a missing/invalid blob).
  - Response: No-op the switch + log a warn (S003 behaviour), keep the current session, and re-post history-list (whose list() already skips corrupt/missing rows) so the dead entry drops from the dropdown.
  - User impact: The stale row disappears on the next refresh instead of restoring an empty/garbage chat or throwing; the active chat is untouched.
- **No agentic CLI is installed, so the provider-selector would have no options.** (recoverable)
  - Detection: renderShell / open() reads deps.providers.available and finds length === 0.
  - Response: Render the selector disabled (no options) and emit the existing S003 'no agentic CLI (claude/codex) installed' error turn-event; new-chat cannot be issued from an empty selector.
  - User impact: The user sees a clear terminal error rather than an empty selector that silently does nothing; installing claude/codex recovers.
- **The index cap eviction would remove the id of the CURRENTLY-open (or just-saved) session.** (recoverable)
  - Detection: save() computes the over-cap oldest ids from the index and compares against the id being saved / the active id before deleting.
  - Response: Eviction excludes the id being saved (and evicts only the oldest OTHER sessions), so the active chat's blob + index entry always survive a save.
  - User impact: The chat the user is in is never silently evicted mid-use; only old, inactive chats are pruned.
- **A stale webview posts new-chat{provider} for a provider not in providers.available (e.g. the CLI was uninstalled after the shell rendered).** (recoverable)
  - Detection: handleMessage's new-chat branch checks provider is a string AND is a member of deps.providers.available before store.create.
  - Response: Reject the create as a no-op + log a warn; the active session is unchanged (k4 keeps the provider set to installed claude/codex only).
  - User impact: No chat is created against a missing CLI (which would fail on the first turn); the user keeps their current chat.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The first user prompt of a session is very long. | session.title is set from the prompt trimmed + clipped to a fixed max length (e.g. ~60 chars); the full prompt is still the first transcript row. |
| The first user prompt is empty or whitespace-only (guarded by the S003 empty-submit no-op, but e.g. a title derived from a whitespace prompt). | title falls back to the create-time 'new chat' (never an empty dropdown label). |
| The user selects the already-active chat in the history dropdown (open-chat for the current session). | Idempotent: cancelActive() + ++generation then re-post session-restored for the same session; no transcript duplication, no interleave. |
| The user picks a history entry or a new provider WHILE a turn is streaming. | The S003 single-in-flight guard applies: open-chat/new-chat call cancelActive() + ++generation first, so the in-flight turn stops posting before the switch (no cross-session interleave). |
| A second turn is sent but the provider never surfaced a native sessionId on the prior done (nativeSessionId still undefined). | runTurn builds the request WITHOUT resume (fresh turn); no crash, continuity simply not resumed for that provider (lc1 — the extension still never replays prior turns). |
| history-list is posted while the webview dropdown is open/focused. | Re-populating the <option>s preserves the current session as the selected value (the active id) so the selection does not jump. |

### Invariants to preserve

- The webview keeps EXACTLY ONE nonce'd inline <script> under the strict per-render CSP; S005's selector/dropdown live inside that same script, add no second <script>, no remote origin, no asWebviewUri, and set dynamic labels via textContent (no innerHTML). (s1 bundle: chat-panel.ts renderShell shell + S003/S004 CSP invariant.) [[c1]]
- Chat history stays extension-local via the injected Memento only (insrc.chat.index + insrc.chat.session.<id>); S005 writes NOTHING to the daemon graph/config (k3). (s1 bundle: session-store.ts memento binding.) [[c1]]
- The panel remains a passthrough: provider selection, history switch and resume only spawn the chosen CLI via sc5 and read/write the local store — they never invoke an insrc workflow/MCP tool (k8). (s1 bundle: chat-panel.ts passthrough turn loop.) [[c1]]
- Conversation continuity uses each CLI's native resume handle (req.resume from nativeSessionId; capture done.sessionId) — the extension replays NO prior transcript turns to the CLI (lc1). (s1 bundle: chat-panel.ts runTurn resume wiring.) [[c1]]
- The single-in-flight guarantee (cancelActive() + ++generation before any session switch) is preserved so a superseded turn never paints into a newly-selected/created session. (s1 bundle: chat-panel.ts new-chat/open-chat handlers.) [[c2]]
- A chat's provider is fixed at creation and the selector offers only installed claude/codex CLIs (k4, lc2); switching provider always means a NEW chat with its own native session, never mutating an existing session's provider (it is readonly). (s1 bundle: session-store.ts ChatSession.readonly provider.) [[c1]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via tsx --test (no vscode runtime; FakePanel + fake StreamAdapter + in-memory ChatSessionStore double, matching chat-panel.test.ts / session-store.test.ts)`

### Test levels

- **unit** — Pin the sc4 store impl changes (title-from-first-prompt + bounded index) in isolation, extending session-store.test.ts.
  - Subjects: `save() with maxSessions=N keeps at most N sessions: after creating N+2, list() returns N and the OLDEST were evicted (their get() -> undefined, no orphaned session key)`, `eviction never removes the id being saved / the active session even when it is the oldest`, `unset maxSessions preserves the S003 unbounded behaviour (no eviction)`, `a session whose title is updated to a first-prompt string round-trips through get()/list() (ChatSummary.title reflects it); list() still sorts updatedAt desc`
  - Fixtures: `in-memory ChatSessionStore with an injected maxSessions + deterministic now()/genId()`
- **contract** — Assert the rendered shell gains the sc1-styled selector/dropdown and preserves the S003/S004 CSP invariants (no drift into the shell security shell).
  - Subjects: `renderShell() output contains a provider-selector whose <option>s are exactly deps.providers.available (attribute-escaped), and an (empty) history-dropdown container, both with the sc1 surfaceClass (provider-dropdown/history-dropdown)`, `the shell still has EXACTLY ONE <script nonce=...> + strict CSP (script-src 'nonce-...'); no remote origin / asWebviewUri; dynamic history labels are set via textContent (scan: no innerHTML)`, `with providers.available empty, the selector renders disabled/optionless`
  - Fixtures: `createChatPanelHost with a FakePanel + injected genNonce + a registry exposing available=['claude','codex'] (and a second with available=[])`
- **integration** — Drive the provider-selection + history + resume flows through createChatPanelHost with the FakePanel + fake adapter + in-memory store.
  - Subjects: `open() posts a history-list (from store.list()) in addition to theme + session-restored`, `new-chat{provider:'codex'} creates a session whose provider is 'codex' (fixed), makes it active, and re-posts history-list including the new chat`, `new-chat with a provider NOT in available is a no-op (no session created, active session unchanged)`, `after a turn, session.title is set from the first user prompt and a fresh history-list is posted reflecting the new title/order`, `open-chat{chatId} for a prior chat posts session-restored with that chat's transcript; open-chat for a missing/corrupt id is a no-op + re-posts history-list (dead row dropped)`, `ac3 native resume: send turn 1 (adapter emits done{sessionId:'sess-1'}) then turn 2 -> the adapter's TurnRequest for turn 2 carries resume={provider, nativeSessionId:'sess-1'} and NO prior transcript turns are replayed to the adapter`, `selecting a history entry / new provider WHILE a turn streams cancels the in-flight turn first (single-in-flight preserved)`
  - Fixtures: `fake StreamAdapter recording each TurnRequest (to assert req.resume) + emitting a scripted status->delta->done{sessionId} sequence`, `in-memory ChatSessionStore double; registry with available=['claude','codex']`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: renderShell renders a provider-selector with options = providers.available (claude/codex only, k4)`, `integration: new-chat{provider:'codex'} creates a codex session with provider fixed at create; new-chat with a non-available provider is a no-op` |
| `ac2` | `integration: open() + post-turn post a history-list; open-chat{chatId} restores that chat's transcript via session-restored`, `unit: title-from-first-prompt makes ChatSummary rows distinguishable; corrupt/missing id -> no-op + dead row dropped` |
| `ac3` | `integration: turn 2 issues TurnRequest.resume={nativeSessionId} captured from turn 1's done.sessionId, and replays NO prior transcript to the adapter (lc1)` |

## Migration

**State before:** S003 shipped the chat panel + sc4 store behind flag insrc.chat.enabled; S004 added markers. Per s1 bundles: the webview renderShell has ONLY #insrc-term + #insrc-input — no provider-selector, no history-dropdown; it only sends submit-turn. open() posts theme + session-restored but NEVER a history-list. handleMessage already dispatches new-chat{provider}/open-chat{chatId} (each cancelActive()+ ++generation then session-restored) and runTurn already wires native resume (req.resume from nativeSessionId; capture done.sessionId). The sc4 store: create() hard-codes title 'new chat' and never updates it; the insrc.chat.index is unbounded (create/save only append, nothing evicts — the S003 L4 gap). sc3 already declares history-list/new-chat/open-chat; sc5 already has ProviderRegistry.available + capabilities.resume + TurnRequest.resume.

**State after:** The webview shell gains an sc1-styled provider-selector (options from providers.available) + a history-dropdown, both inside the existing one nonce'd script; the selector emits new-chat{provider}, the history-dropdown emits open-chat{chatId}, and a history-list handler (re)populates the dropdown keeping the active id selected. The host posts history-list on open() and re-posts it after each new-chat/open-chat and after each turn's done. runTurn sets session.title from the first user prompt (clipped; whitespace falls back to 'new chat'). The sc4 store impl gains an optional maxSessions cap: save() evicts the oldest non-active sessions (ids + session keys) beyond the cap. new-chat validates the provider against providers.available. Native resume is unchanged (verified by test). No sc1/sc3/sc4/sc5 contract shape change; no manifest change; still behind insrc.chat.enabled.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Extend the sc4 store impl (session-store.ts): add an optional maxSessions dep and evict the oldest non-active ids + their session keys in save() beyond the cap; keep create/get/list/append/save signatures byte-identical. Purely additive + interface-compatible; unset maxSessions = S003 behaviour. — ↩ rollbackable
2. Reshape renderShell (chat-panel.ts) to add the sc1-styled provider-selector (options from providers.available) + history-dropdown inside the SAME nonce'd script, wired to emit new-chat{provider}/open-chat{chatId} and to (re)populate history <option>s from a history-list message (labels via textContent). Keep exactly one script + strict CSP. — ↩ rollbackable
3. Reshape the host (chat-panel.ts): post history-list on open(); re-post after new-chat/open-chat and after a turn's done; set session.title from the first user prompt in runTurn; validate new-chat's provider against providers.available. Preserve the single-in-flight cancelActive()+ ++generation guard and the existing native-resume wiring. — ↩ rollbackable
4. Extend chat-panel.test.ts + session-store.test.ts: provider-selector/history-dropdown shell contract, history-list on open + after turns, open-chat restore + corrupt-id drop, title-from-first-prompt, maxSessions eviction (active-safe), and the two-turn native-resume assertion (req.resume carries the captured sessionId; no transcript replay). Run the full sweep. — ↩ rollbackable

**Backward compat:** No public/shared-contract API changes: sc1/sc3/sc4/sc5 shapes are untouched; the sc4 ChatSessionStore interface + create/get/list/append/save signatures are byte-identical (maxSessions is an optional impl dep on MementoStoreDeps, defaulting to the S003 unbounded behaviour). ChatSession.title stays `title: string` — only its populated value changes (was always 'new chat'), which no consumer parsed. Existing persisted sessions from S003/S004 load unchanged (older rows simply keep title 'new chat' until their next turn); no data rewrite. renderShell/open/handleMessage/runTurn are internal to the panel host (not exported public API); their reshapes are additive (new UI + extra history-list posts) and preserve all S003/S004 behaviour. No package.json/command/config change.

## Alternatives considered

### a1: In-panel sc1 chrome + host-driven history, with title-from-first-prompt and a bounded index — **CHOSEN**

Extend the S003 renderShell to add an sc1-styled provider-selector + history-dropdown inside the SAME one nonce'd script; the host posts history-list on open + after each done/new-chat/open, the dropdowns emit the already-handled new-chat{provider}/open-chat{chatId}; set session.title from the first user prompt and cap the sc4 index so the history list stays meaningful + bounded. Native resume is already wired in runTurn (verify+test).

renderShell webview bootstrap gains two sc1-styled controls (a provider <select> populated from the posted available providers, and a history <select> populated from history-list), both inside the existing single nonce'd inline script (no second script, CSP unchanged). Provider-select change -> postMessage new-chat{provider}; history-select change -> open-chat{chatId} (both already dispatched host-side). Host: on open() also post the available provider list + history-list; after a turn's done and after new-chat/open-chat, re-post history-list so the dropdown stays current. In service of ac2's own usefulness, set ChatSession.title from the first user prompt (trim/clip) on the first submit-turn via the existing save() path (a small sc4-IMPL touch, no interface/shape change), so the dropdown shows real titles not 'new chat'. Add a bounded cap to the memento store's index (evict oldest ids + their session keys beyond a constant N) so extension-local history (k3) does not grow unbounded (the S003 L4 follow-up) — also an sc4-impl-only change (no interface change). Native resume (ac3) is already implemented in runTurn (req.resume from s.nativeSessionId; capture ev.sessionId on done) — S005 asserts it with a two-turn test. NO new shared contract, NO HLD amendment.

### a2: Pure UI + wiring, store impl untouched (defer title + cap)

Same in-panel provider-selector + history-dropdown + host history-list posting, but do NOT touch the sc4 store impl: the dropdown labels each chat by provider + updatedAt (from ChatSummary as-is), and the unbounded-index + 'new chat' title stay as-is, deferred to follow-ups.

Identical webview + host wiring as a1 (selector + dropdown in the one nonce'd script; post available providers + history-list; dropdowns emit new-chat/open-chat; verify native resume). The ONLY difference: leave session-store.ts (sc4, S003-owned) completely untouched. The history dropdown renders each row from the existing ChatSummary {provider, title:'new chat', updatedAt} — so rows are labelled e.g. 'claude · <time>' since title is always 'new chat'. No title-from-prompt, no index cap. File both (real titles, prune/cap) as separate follow-ups.

**Rejected because:** Maximally in-scope + lowest risk, and literally satisfies all three ACs, but scores PARTIAL on ac2 because the dropdown rows are indistinguishable ('new chat') and it leaves the S003 L4 unbounded-index growth. A good fallback if touching the S003-owned store is deemed out of bounds; loses to a1 on ac2 fidelity.

### a3: Separate createChatControls host module composed with the panel

Introduce a new vscode-free createChatControls(deps) host module that owns provider/history selection + history-list posting + title/cap logic, composed alongside createChatPanelHost, rather than extending the panel host in place.

A new module chat-controls.ts exports createChatControls(deps) that, given the store + provider registry + a post seam, computes the provider list + history-list and handles new-chat/open-chat selection, delegating the actual session switch back to the panel. The panel host wires it in. The webview still renders the sc1 selector/dropdown but its intents route through the controls module. title-from-prompt + index cap live in the controls/store layer.

**Rejected because:** Adds a controls sub-host that duplicates the panel's already-owned new-chat/open-chat + single-in-flight session switching — more surface, a new controls<->panel seam (the interleave-bug class S003's generation guard addressed), and no contract benefit. Over-engineered vs a1 for the same ACs.

## Open questions

- S004 MED-1 follow-up (persist a marker cssClass on TranscriptEntry so restore reproduces per-kind glyph/tone) is OUT of S005 scope — file as its own small tracked story that amends sc4.

## Resolved questions

- `qb5e33325` — S004 MED-1 follow-up (persist a marker cssClass on TranscriptEntry so restore reproduces per-kind glyph/tone) is OUT of S005 scope — file as its own small tracked story that amends sc4.
  - **resolved**: Extend the epic with a new small story (sc4 amendment) — The MED-1 fix mutates sc4/TranscriptEntry, a contract this epic's HLD owns, so the amendment trail + restore-fidelity criterion belong on epic edb76e2e4d41217d next to S004 — not folded into S005 (scope discipline) nor detached. To be filed as a new small story AFTER S005 ships. _(2026-09-25T18:57:36.351Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1: session-store.ts (sc4) create/get/list/save + insrc.chat.index; title hard-coded 'new chat' + unbounded index` — "create() hard-codes title:'new chat' and never updates it; the index is unbounded (nothing evicts)"
- **[[c2]]** `analyze-bundle` `s1: chat-panel.ts new-chat/open-chat/open/runTurn + renderShell shell; single-in-flight + native resume already wired` — "handleMessage dispatches new-chat/open-chat (cancelActive+ ++generation); runTurn wires req.resume from nativeSessionId + captures done.sessionId; renderShell has no selector/dropdown and open() posts"
- **[[c3]]** `analyze-bundle` `s1: protocol.ts (sc3) + cli-adapter.ts (sc5) already declare history-list/new-chat/open-chat + available/resume` — "sc3 has history-list + new-chat{provider} + open-chat{chatId}; sc5 has ProviderRegistry.available + capabilities.resume + TurnRequest.resume"
- **[[c4]]** `prior-artifact` `HLD edb76e2e4d41217d: S005 boundary owns:[] depends:[sc1,sc3,sc4,sc5]; sc1 provider-dropdown/history-dropdown SurfaceKind` — "provider-selector + history-dropdown + native-resume wiring are private to S005; adds no new shared contract"
