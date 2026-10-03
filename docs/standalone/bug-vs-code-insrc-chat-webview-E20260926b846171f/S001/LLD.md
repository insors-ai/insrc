<!-- insrc:artifact LLD-b846171f48d26a25-s1 -->

# LLD: E20260926b846171f:S001

**Epic:** `lld-approved-standalone-bugfix-issue-b846171f48d26a25`
**HLD base run:** `wf-1790446816695-8c2jhh`
**HLD effective hash:** `c90ce092998d...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `ChatPanelHost.adopt`

```typescript
adopt(channel: ChatPanelChannel): void
```

**Parameters:**
- `channel: ChatPanelChannel` — An externally-supplied channel wrapping a VS-Code-restored WebviewPanel (built by the shared panel->channel factory); the host wires + drives it instead of calling deps.createPanel().

**Returns:** `void` — The host takes ownership of the passed channel exactly as open() does for a freshly-created one: it becomes the live channel, is wired (onDidDispose/onMessage), gets setHtml(renderShell()), and receives theme + session-restored + history-list posts — so the restored tab shows history and is interactive.

**Preconditions:**
- Called from the serializer's deserializeWebviewPanel with a channel over a live restored panel.
- Serializer only registered under insrc.chat.enabled.

**Postconditions:**
- adopt() and open() run the SAME shared post-channel wiring internal (no drift).
- If a channel is already live, the prior one is superseded/disposed so only one active channel remains.

### `createChatPanelHost.open`

```typescript
open(): void
```

**Returns:** `void` — Unchanged public behaviour: reveal an existing channel, else create one via deps.createPanel and wire+post. Refactored internally to delegate its post-channel body to the same shared internal adopt() uses; signature + observable behaviour byte-identical (additive).

**Preconditions:**
- Invoked by the 'insrc.chat.open' command as today.

**Postconditions:**
- No change for existing callers/tests; open() with no live channel still creates + wires + posts theme/session-restored/history-list.

### `window.registerWebviewPanelSerializer`

```typescript
registerWebviewPanelSerializer(viewType: string, serializer: WebviewPanelSerializer): Disposable
```

**Parameters:**
- `viewType: string` — The panel viewType to restore — 'insrc.chatPanel'.
- `serializer: WebviewPanelSerializer` — The object whose deserializeWebviewPanel adopts a restored panel.

**Returns:** `Disposable` — Registration handle pushed to context.subscriptions. NEW addition to the hand-maintained src/vscode.d.ts stub; type-only, matches the real VS Code API.

**Preconditions:**
- Registered during activate() inside the insrc.chat.enabled gate (activationEvents include onStartupFinished).

**Postconditions:**
- Flag off => no serializer registered; VS Code shows its default non-restorable placeholder (acceptable).

### `WebviewPanelSerializer.deserializeWebviewPanel`

```typescript
deserializeWebviewPanel(panel: WebviewPanel, state: unknown): Thenable<void> | void
```

**Parameters:**
- `panel: WebviewPanel` — The restored panel VS Code created; wrapped via the shared factory (NOT createWebviewPanel) and handed to chatHost.adopt().
- `state: unknown` — Opaque persisted webview state; unused (history lives in globalState), accepted for contract shape.

**Returns:** `Thenable<void> | void` — Resolves once the host has adopted the panel. NEW interface in the vscode.d.ts stub.

**Errors:**
- `caught` when Any failure while adopting is swallowed so a restore error never throws into VS Code; the panel is disposed as a fallback.

**Preconditions:**
- The panel is live and its webview accepts html/postMessage (Webview.html settable in the stub).

**Postconditions:**
- The restored panel is adopted in place (tab position preserved) and shows history.

## Data model changes

### `WebviewPanelSerializer (vscode.d.ts stub interface)` — new

Add `interface WebviewPanelSerializer { deserializeWebviewPanel(panel: WebviewPanel, state: unknown): Thenable<void> | void }` and `window.registerWebviewPanelSerializer(viewType: string, serializer: WebviewPanelSerializer): Disposable` to the hand-maintained stub (currently absent). Ensure Webview.html is a settable field (already relied on by the createPanel adapter).

```
+ export interface WebviewPanelSerializer { deserializeWebviewPanel(panel: WebviewPanel, state: unknown): Thenable<void> | void }
+ export function registerWebviewPanelSerializer(viewType: string, serializer: WebviewPanelSerializer): Disposable // in namespace window
```

**Call sites:**
- `src/vscode.d.ts:82-111`
- `src/extension.ts (serializer registration in the chat block)`

### `webviewPanelChannel factory (shared panel->ChatPanelChannel adapter)` — new

Extract extension.ts's inline createWebviewPanel->ChatPanelChannel wrapper into one reusable function used by BOTH the fresh createPanel dep and the serializer's deserialize path, so a restored panel is wrapped identically to a fresh one.

```
+ function webviewPanelChannel(panel: WebviewPanel): ChatPanelChannel  // extracted from extension.ts:513-539
```

**Call sites:**
- `src/extension.ts:513-539`
- `src/extension.ts (serializer deserializeWebviewPanel)`

### `ChatPanelHost.adopt (new method on the existing host)` — field-add

Add adopt(channel) to the ChatPanelHost interface + createChatPanelHost return; refactor open() to route its post-channel wiring+posts through the same shared internal adopt() calls. Additive — existing ChatPanelHost consumers (open/dispose) unchanged.

```
  interface ChatPanelHost { open(): void; adopt(channel: ChatPanelChannel): void; dispose(): void }
```

**Call sites:**
- `src/chat/chat-panel.ts:56-58`
- `src/chat/chat-panel.ts:633-659`

## Error paths

### Error cases

- **adopt() is called while the host already has a live channel (a restored panel arrives while a chat is open, or VS Code deserializes more than once).** (recoverable)
  - Detection: adopt() checks the host's own channel reference (the same `channel !== undefined` guard open() uses at chat-panel.ts:635) before wiring.
  - Response: Supersede deterministically: cancelActive() + dispose the prior channel and clear it, then adopt the new one — exactly one active channel remains (no double wiring, no interleaved turns).
  - User impact: The user ends with a single working chat tab; no duplicate/stuck panels.
- **deserializeWebviewPanel throws while adopting (host disposed, renderShell/theme post fails).** (recoverable)
  - Detection: A try/catch wraps the adopt call inside deserializeWebviewPanel.
  - Response: Swallow the error (never throw into VS Code's restore path) and dispose the restored panel as a fallback so VS Code stops re-attempting rehydration (kills the repeating asBrowserUri/$loadForeignModule loop).
  - User impact: Worst case the restored tab closes instead of hanging as an inert shell; the user reopens via 'insrc: Open chat' and gets full history.
- **A panel is restored but no agentic CLI is installed (providers.available empty).** (recoverable)
  - Detection: adopt() runs the same available-providers check open() does (the host posts an error turn-event when available.length===0).
  - Response: Mirror open(): post the existing 'no agentic CLI installed' error turn-event to the adopted panel.
  - User impact: The restored panel shows the same clear message a fresh open would, not a dead shell.

### Edge cases

| Input | Expected |
| :--- | :--- |
| VS Code restores MORE than one panel of viewType 'insrc.chatPanel'. | The host is a singleton with one active channel: the first deserialize is adopted; any additional restored panel is disposed (or reveals the single host panel) — never more than one live insrc chat channel. |
| The restored panel carries stale/opaque webview `state` from a prior version. | state is ignored; history + transcript are re-derived from context.globalState, so the adopted panel shows CURRENT history. |
| insrc.chat.enabled is false at restore time. | No serializer is registered (inside the flag gate), so VS Code shows its own non-restorable placeholder rather than a dead insrc shell. |
| The session open at shutdown was an unsaved draft (empty transcript). | adopt() posts session-restored for the draft and postHistory() from the store, exactly like a fresh open. |

### Invariants to preserve

- open()'s observable behaviour is unchanged; the refactor only routes open() and adopt() through one shared post-channel internal (open() signature + fresh-open path byte-identical). [[c2]]
- Chat sessions persist in context.globalState via the memento store and MUST NOT be touched/cleared by the restore path — history data is read, never rewritten, on adopt. [[c6]]
- Exactly one active ChatPanelChannel at a time — the single-in-flight turn reap depends on it; adopt must supersede, not stack, channels. [[c1]]
- The webview is rendered by the same single nonce'd renderShell() under its CSP; adopt reuses renderShell + the existing ChatPanelChannel contract, introducing no new webview asset or second script. [[c2]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test 'src/**/__tests__/*.test.ts'` (fakeChannel + in-memory store pattern; extension covered by src/__tests__/activation.test.ts + packaging.test.ts)`

### Test levels

- **unit** — Prove adopt() re-wires an externally-supplied channel exactly like open() and that open() is unchanged, using the existing fakeChannel harness (no vscode runtime).
  - Subjects: `chat-panel.test.ts: host.adopt(fakeChannel) posts theme + session-restored + history-list on the ADOPTED channel and wires onMessage so a subsequent submit-turn flows.`, `chat-panel.test.ts: adopt() when a channel is already live supersedes it (prior channel disposed / cancelActive).`, `chat-panel.test.ts: open() behaviour byte-identical (existing open()/submit/history tests stay green after the shared-internal refactor).`, `chat-panel.test.ts: adopt() with providers empty posts the same 'no agentic CLI' error turn-event open() does.`
  - Fixtures: `The existing fakeChannel() ChatPanelChannel stub + in-memory ChatSessionStore seeded with sessions.`
- **unit** — Prove the serializer's deserializeWebviewPanel wraps a restored panel via the shared factory and hands it to the host (and swallows+disposes on failure).
  - Subjects: `Serializer unit test: deserializeWebviewPanel(fakeWebviewPanel) builds a ChatPanelChannel via webviewPanelChannel() and calls chatHost.adopt() so the fake panel receives setHtml + the initial posts.`, `webviewPanelChannel(panel) maps a fake WebviewPanel to a ChatPanelChannel (setHtml->webview.html, postMessage->webview.postMessage, onMessage->onDidReceiveMessage, onDidDispose, reveal, dispose).`, `deserialize error path: when adopt throws, the error is swallowed and the fake panel disposed.`
  - Fixtures: `A fake WebviewPanel (webview html setter + postMessage + onDidReceiveMessage recorder + onDidDispose + dispose/reveal).`
- **contract** — Guard the additive/non-breaking nature + the vscode.d.ts stub + packaging.
  - Subjects: `tsc --noEmit clean with the new serializer stub types.`, `Full plugin sweep (npx tsx --test 'src/**/__tests__/*.test.ts') green — no existing test regressed.`, `packaging.test.ts / activation.test.ts still pass with the added serializer registration.`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat-panel.test.ts: adopt(fakeChannel) posts theme+session-restored+history-list and wires onMessage.`, `serializer unit test: deserializeWebviewPanel(fakePanel) -> host adopts it and the fake panel receives setHtml + history-list.` |
| `ac2` | `chat-panel.test.ts: existing open()/submit-turn/history tests stay green after the shared-internal refactor.`, `contract: full plugin sweep + tsc clean — no regression.` |
| `ac3` | `chat-panel.test.ts: adopt() supersedes an already-live channel.`, `serializer unit test: adopt failure swallowed + restored panel disposed; adopt() with empty providers posts the 'no CLI' error.` |

## Migration

**State before:** chat-panel.ts: ChatPanelHost = {open(),dispose()} and open() (:633-659) is the ONLY path that wires a channel + posts theme/session-restored/history-list — it always obtains the channel from deps.createPanel() (:36). extension.ts (:513-539) builds that channel inline by wrapping createWebviewPanel; the chat block is flag-gated (:423) + command-opened (:553-555). src/vscode.d.ts (:82-111) declares WebviewPanel + createWebviewPanel but NO registerWebviewPanelSerializer / WebviewPanelSerializer. No serializer is registered, so a VS-Code-restored chat tab is never handed back to the host and sits inert.

**State after:** A shared webviewPanelChannel(panel) factory wraps ANY WebviewPanel (fresh or restored) into a ChatPanelChannel. ChatPanelHost gains adopt(channel) and open() delegates its post-channel wiring+posts to the same shared internal. extension.ts registers window.registerWebviewPanelSerializer('insrc.chatPanel', serializer) inside the insrc.chat.enabled gate; deserializeWebviewPanel wraps the restored panel via the factory and calls chatHost.adopt() (try/catch -> dispose fallback). src/vscode.d.ts declares the serializer API. A restored chat tab is adopted in place, shows history, and is fully wired.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Extend src/vscode.d.ts: add WebviewPanelSerializer + window.registerWebviewPanelSerializer, ensure Webview.html is settable. Type-only. — ↩ rollbackable
2. Extract the inline createWebviewPanel->ChatPanelChannel wrapper into one webviewPanelChannel(panel) factory; the existing createPanel dep calls it (pure refactor). — ↩ rollbackable
3. Add ChatPanelHost.adopt(channel) and refactor open() so both route through one shared post-channel internal; add the supersede-if-already-live rule. open() signature + behaviour unchanged. — ↩ rollbackable
4. In the extension.ts chat block (inside the flag gate), register a WebviewPanelSerializer for 'insrc.chatPanel' whose deserializeWebviewPanel wraps the restored panel via the factory and calls chatHost.adopt() within a try/catch that disposes on failure; push the Disposable to context.subscriptions. Optionally add 'onWebviewPanel:insrc.chatPanel' to activationEvents. — ↩ rollbackable
5. Add unit tests (adopt + serializer); run tsc + full plugin sweep; confirm no regression. — ↩ rollbackable

**Backward compat:** Fully additive. ChatPanelHost gains adopt() (new method) — open()/dispose() consumers unaffected; open()'s signature + observable behaviour byte-identical (internals refactored to share one wiring path). ChatPanelChannel unchanged. vscode.d.ts additions are type-only, matching the real API. Serializer registered only under insrc.chat.enabled. globalState sessions read, never rewritten.

## Alternatives considered

### a1: Host adopt(channel) + shared panel->channel adapter factory — **CHOSEN**

Extract the inline createWebviewPanel->ChatPanelChannel adapter into a reusable factory, add ChatPanelHost.adopt(channel) that runs open()'s wiring+posts against an externally-supplied channel, and register a serializer that wraps the restored panel and calls adopt.

Extract the wrapper into one factory reused by createPanel (fresh) and the serializer (restored). Add adopt(channel) doing open()'s post-channel wiring+posts; open() delegates to the same shared internal. Register the serializer for 'insrc.chatPanel' + extend vscode.d.ts.

### a2: Overload open(existingChannel?) instead of a new adopt method

Reshape ChatPanelHost.open to accept an optional pre-built channel; the serializer calls open(wrappedRestoredPanel).

open(existing?): use the passed channel when provided, else behave as today. Same factory + stub as a1 but on open()'s signature.

**Rejected because:** Functionally equal to a1 on restore but only PARTIAL on g2/g4: overloading the command's open() with dual intent widens the hot path and is less self-documenting than a1's distinct adopt().

### a3: Dispose-and-reopen (no host contract change)

The serializer disposes the restored panel and calls chatHost.open() to create a fresh, fully-wired panel.

deserializeWebviewPanel(panel){ panel.dispose(); chatHost.open(); }. Still needs the vscode.d.ts stub but no factory/host change.

**Rejected because:** Only PARTIAL on the primary goal g1 (in-place restore) — it reopens rather than restores, losing the tab position for the stateful chat panel. Reserved for the ephemeral panels, not the chat regression being fixed.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:31-58,633-659 (ChatPanelChannel + ChatPanelHost {open,dispose} + open() wiring/posts + single-channel model)`
- **[[c2]]** `code` `vscode-plugin/src/extension.ts:513-539,423,553-555 (inline createWebviewPanel->ChatPanelChannel adapter; insrc.chat.enabled gate; insrc.chat.open command)`
- **[[c3]]** `code` `vscode-plugin/src/vscode.d.ts:82-111 (WebviewPanel + createWebviewPanel present; registerWebviewPanelSerializer + WebviewPanelSerializer ABSENT)`
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:88 (VIEW_TYPE='insrc.chatPanel'); docs-review-panel.ts:41 ('insrc.docsReviewPanel'); panels/webview-host.ts:43-44 (detailedStatus/repoConfiguration)`
- **[[c6]]** `code` `vscode-plugin/src/extension.ts:427 (createMementoChatSessionStore over context.globalState) — history persists; restore only re-wires the panel`
- **[[c7]]** `convention` `grep registerWebviewPanelSerializer over vscode-plugin/src/*.ts returns no matches; package.json activationEvents=['onStartupFinished']`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-26T18:29:25.482Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | inventory | LOW | auto | No WebviewPanelSerializer is registered anywhere in the plugin (the root-cause premise); registerWebviewPanelSerializer does not appear in vscode-plugin/src. | grep registerWebviewPanelSerializer over src/ = 0 matches — no serializer is registered anywhere. Root-cause premise verified. | none |
| cl2 | citation | LOW | auto | The chat panel viewType is 'insrc.chatPanel' (VIEW_TYPE in chat-panel.ts). | chat-panel.ts:88 `const VIEW_TYPE = 'insrc.chatPanel';` — verified. | none |
| cl3 | citation | LOW | assisted | ChatPanelHost currently exposes only open() + dispose() (adopt is new); ChatPanelChannel has setHtml/postMessage/onMessage/onDidDispose/reveal/dispose. | `adopt(` count in chat-panel.ts = 0 (no adopt yet) — correct. Minor: the cited line range :56-58 actually lands on ChatEditGovernanceDeps fields, not the ChatPanelHost interface (line-anchor drift); the substance (ChatPanelHost is open()+dispose() only; ChatPanelChannel has setHtml/postMessage/onMessage/onDidDispose/reveal/dispose) is correct and verified earlier this session. | During build, locate the ChatPanelHost interface by symbol (not the drifted :56-58 anchor) when adding adopt(). |
| cl4 | semantic | LOW | auto | createChatPanelHost.open() obtains its channel from deps.createPanel and posts theme + session-restored + history-list (postHistory) — the wiring the restore path must replicate. | chat-panel.ts:656-658 open() posts theme + session-restored + postHistory() — the exact wiring the restore path must replicate. Verified. | none |
| cl5 | citation | LOW | auto | extension.ts builds the chat ChatPanelChannel inline by wrapping vscode.window.createWebviewPanel (the adapter to extract into webviewPanelChannel). | extension.ts:516 createWebviewPanel inside the chat createPanel adapter (setHtml/postMessage/onDidReceiveMessage/onDidDispose/reveal/dispose) — verified as the factory to extract. | none |
| cl6 | external-contract | LOW | auto | The bundled src/vscode.d.ts stub declares WebviewPanel + window.createWebviewPanel but NOT registerWebviewPanelSerializer / WebviewPanelSerializer, so the fix must extend the stub. | grep over src/vscode.d.ts = 0 matches for registerWebviewPanelSerializer/WebviewPanelSerializer; createWebviewPanel + WebviewPanel present — the stub must be extended, as the LLD states. Verified. | none |
| cl7 | semantic | LOW | auto | Chat sessions persist in context.globalState via createMementoChatSessionStore — history survives restore; the fix only re-wires the panel. | extension.ts:427 createMementoChatSessionStore({ memento: context.globalState, maxSessions: 200 }) — sessions persist in globalState; restore only re-wires the panel. Verified. | none |
| cl8 | citation | LOW | auto | package.json activationEvents include onStartupFinished (extension activates at startup, so the serializer registers before restore). | package.json activationEvents = ['onStartupFinished'] — extension activates at startup so the serializer registers before restore; adding onWebviewPanel is optional per the LLD. Verified. | none |
