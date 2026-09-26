<!-- insrc:artifact LLD-be8708a9cd20e286-S001 -->

# LLD: E20260926be8708a9:S001

**Epic:** `add-insrc-icon-vs-code-activity`
**HLD base run:** `wf-1790410257933-gdhoaz`
**HLD effective hash:** `be8708a9cd20...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `webviewViewToChannel`

```typescript
webviewViewToChannel(view: WebviewView): ChatPanelChannel
```

**Parameters:**
- `view: WebviewView` — The sidebar view VS Code delivered to resolveWebviewView; its .webview is the render/message surface.

**Returns:** `ChatPanelChannel` — A ChatPanelChannel (chat-panel.ts:29) backed by the resolved WebviewView: setHtml -> view.webview.html=; postMessage -> view.webview.postMessage; onMessage -> view.webview.onDidReceiveMessage; onDidDispose -> view.onDidDispose; reveal -> view.show(true); dispose -> no-op (VS Code owns the view's lifecycle). vscode-free at the type level.

**Errors:**
- `none` when Pure mapping; a postMessage to a hidden/disposed view is fire-and-forget (rejection swallowed, mirroring the panel channel).

**Preconditions:**
- view.webview.options.enableScripts has been set true by the provider before the host renders the nonce'd shell.

**Postconditions:**
- The returned channel drives createChatPanelHost exactly as the editor-panel channel does today.

### `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost
```

**Parameters:**
- `deps: ChatPanelHostDeps` — REUSED UNCHANGED. For the sidebar, deps.createPanel is supplied as () => webviewViewToChannel(resolvedView); providers/store/cwd/editGovernance are the same objects wired today.

**Returns:** `ChatPanelHost` — The existing chat host (chat-panel.ts:87); open() calls deps.createPanel() for the channel, wires onMessage/onDidDispose, setHtml(renderShell()), posts theme/session-restored/history, runs the unchanged turn-loop. NOT modified.

**Errors:**
- `none-new` when Behavior unchanged; the host is contract-stable (S003-owned).

**Preconditions:**
- Constructed inside resolveWebviewView with a createPanel that returns the resolved-view channel.

**Postconditions:**
- The chat renders in the sidebar view and behaves identically to the editor-tab chat.

### `createChatSidebarViewProvider`

```typescript
createChatSidebarViewProvider(deps: ChatSidebarViewDeps): WebviewViewProvider
```

**Parameters:**
- `deps: ChatSidebarViewDeps` — Injected seams: { toChannel: (view) => ChatPanelChannel; makeHost: (createPanel) => ChatPanelHost; enableScripts: (view) => void; logger? }. Keeps the provider vscode-free/testable.

**Returns:** `WebviewViewProvider` — resolveWebviewView(view) enables scripts, wraps the view via toChannel, builds the host with createPanel:()=>thatChannel, and opens it. Re-resolution rebuilds channel+host so a stale host never posts into a disposed view.

**Errors:**
- `guarded` when A postMessage after the view is disposed is swallowed; re-resolution supersedes the prior host (generation/current-view guard).

**Preconditions:**
- Registered via window.registerWebviewViewProvider('insrc.chatView', provider) ONLY inside the if (chatEnabled) gate.

**Postconditions:**
- Clicking the insrc Activity Bar icon shows the sidebar view rendering the chat.

### `insrc.chat.open`

```typescript
commands.register({ id: 'insrc.chat.open', title: 'insrc: Open chat' }, () => vscode.commands.executeCommand('insrc.chatView.focus')): void
```

**Returns:** `void` — EXISTING command (extension.ts:535), REPOINTED from opening an editor-tab panel to focusing the sidebar view via the auto-generated '<viewId>.focus' command. Same command id (no new InsrcCommandId).

**Errors:**
- `none-new` when executeCommand('insrc.chatView.focus') is a built-in command generated for the contributed view; reveals/focuses it.

**Preconditions:**
- insrc.chat.enabled is true (command + view exist only under the gate).

**Postconditions:**
- The insrc sidebar view is revealed and focused.

## Data model changes

### `package.json contributes.viewsContainers.activitybar` — new

Add the insrc Activity Bar container: [{ id:'insrc', title:'insrc', icon:'media/insrc.svg' }]. VS Code shows the container only while it owns a visible view, so the flag-gated view controls the icon's presence.

```
"viewsContainers": { "activitybar": [{ "id": "insrc", "title": "insrc", "icon": "media/insrc.svg" }] }
```

**Call sites:**
- `vscode-plugin/package.json:13`

### `package.json contributes.views` — new

Add a WEBVIEW view inside the insrc container, gated on the flag: { insrc: [{ id:'insrc.chatView', name:'Chat', type:'webview', when:'config.insrc.chat.enabled' }] }.

```
"views": { "insrc": [{ "id": "insrc.chatView", "name": "Chat", "type": "webview", "when": "config.insrc.chat.enabled" }] }
```

**Call sites:**
- `vscode-plugin/package.json:13`

### `media/insrc.svg (Activity Bar icon asset)` — new

New themeable monochrome SVG (currentColor) for the container icon, packaged in the .vsix (confirm no .vscodeignore exclusion). icon.png stays the Marketplace gallery icon.

```
new file vscode-plugin/media/insrc.svg
```

**Call sites:**
- `vscode-plugin/package.json:13`
- `vscode-plugin/icon.png`

### `src/chat/chat-view-channel.ts (new, vscode-free adapter)` — new

webviewViewToChannel(view): ChatPanelChannel + createChatSidebarViewProvider(deps): WebviewViewProvider. Type-only vscode imports; unit-testable with a fake WebviewView. Reuses the ChatPanelChannel type from chat-panel.ts.

```
new file vscode-plugin/src/chat/chat-view-channel.ts
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:29`

### `src/vscode.d.ts (local vscode type slice)` — field-add

Add the sidebar-view API surface (WebviewView, WebviewViewProvider, window.registerWebviewViewProvider) reusing the existing Webview interface.

```
+ export interface WebviewView { readonly webview: Webview; readonly onDidDispose: Event<void>; readonly visible: boolean; show(preserveFocus?: boolean): void; }
+ export interface WebviewViewProvider { resolveWebviewView(view: WebviewView, context: unknown, token: unknown): void | Thenable<void>; }
+ namespace window { function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider, options?: { webviewOptions?: { retainContextWhenHidden?: boolean } }): Disposable; }
```

**Call sites:**
- `vscode-plugin/src/vscode.d.ts:98`

### `src/extension.ts sidebar view registration + command repoint` — new

Inside if (chatEnabled): build the provider via createChatSidebarViewProvider with real seams (toChannel wraps view.webview; makeHost = (createPanel) => createChatPanelHost({ createPanel, providers, store, cwd, editGovernance }); enableScripts sets view.webview.options), register with registerWebviewViewProvider('insrc.chatView', provider, { webviewOptions: { retainContextWhenHidden: true } }), and REPOINT insrc.chat.open to executeCommand('insrc.chatView.focus'). Replaces the prior editor-panel createPanel chat wiring; docs-review path untouched.

```
+ context.subscriptions.push(vscode.window.registerWebviewViewProvider('insrc.chatView', chatSidebarProvider, { webviewOptions: { retainContextWhenHidden: true } }));
~ commands.register({ id: 'insrc.chat.open', ... }, () => vscode.commands.executeCommand('insrc.chatView.focus'))
```

**Call sites:**
- `vscode-plugin/src/extension.ts:462`
- `vscode-plugin/src/extension.ts:535`

## Error paths

### Error cases

- **The sidebar view id in package.json (insrc.chatView) does not match the id passed to registerWebviewViewProvider.** (recoverable)
  - Detection: At runtime VS Code shows the view body empty / 'no view registered'; caught in dev by the manifest-vs-source assertion that both use the identical literal 'insrc.chatView'.
  - Response: Single-source the view id as one constant referenced by both the manifest-shape test and the provider registration; the wiring test asserts registerWebviewViewProvider is called with the exact contributed id.
  - User impact: Empty sidebar view (no chat) until the ids match.
- **resolveWebviewView renders the nonce'd chat shell but scripts are disabled on the view's webview.** (recoverable)
  - Detection: The webview loads but the inline bootstrap never runs (acquireVsCodeApi undefined); detectable because setHtml content shows but no session-restored render appears.
  - Response: The provider MUST set view.webview.options = { enableScripts: true } BEFORE the host renders; a wiring assertion checks enableScripts is set in resolveWebviewView.
  - User impact: A visible but inert chat (no streaming, no input) until scripts are enabled.
- **VS Code disposes a hidden sidebar view and later re-resolves it while a stale host holds the old channel.** (recoverable)
  - Detection: A post to the disposed webview rejects; the re-resolution path receives a fresh WebviewView instance distinct from the one the stale host captured.
  - Response: createChatSidebarViewProvider treats each resolveWebviewView as authoritative: it builds a fresh channel + host for the new view and lets the old host's channel dispose become a no-op / swallow late posts. postMessage stays fire-and-forget.
  - User impact: None when handled — the chat re-renders in the re-shown view; without the guard a stale turn could error silently.
- **media/insrc.svg is missing from the packaged .vsix or the icon path is wrong.** (recoverable)
  - Detection: Package-time the file is absent (.vscodeignore or wrong relative path); runtime VS Code draws a placeholder.
  - Response: Keep the SVG under media/, reference the correct relative path, add a packaging test asserting the file exists and the manifest icon path resolves.
  - User impact: Cosmetic — the container still works; a placeholder glyph shows instead of the insrc mark.

### Edge cases

| Input | Expected |
| :--- | :--- |
| insrc.chat.enabled is false. | The view's when-clause is false; VS Code hides the view and the whole insrc container/icon; the provider is not registered and insrc.chat.open is absent. No surface leaks. |
| insrc.chat.open is invoked from the command palette. | It runs executeCommand('insrc.chatView.focus'), revealing + focusing the sidebar view (resolving + rendering the chat if not already shown). |
| The user collapses/hides the sidebar view, then reopens it. | With retainContextWhenHidden:true the webview state is preserved where VS Code allows; otherwise re-resolution rebuilds the host and restores the active session from the ChatSessionStore. No duplicate sessions. |
| No workspace folder is open. | Chat still renders; cwd falls back to process.cwd() exactly as the editor-panel path does today. |

### Invariants to preserve

- The chat turn-loop, session store, provider registry, markers, and edit-governance are reused verbatim through createChatPanelHost via the ChatPanelChannel seam — this story does NOT modify createChatPanelHost or the ChatPanelChannel interface (chat-panel.ts:29/87). [[c2]]
- The chat is driven ONLY through the ChatPanelChannel interface; the WebviewView is adapted to that exact interface, so host behavior is identical to the editor-panel channel. [[c2]]
- No new command id is introduced; insrc.chat.open is reused (repointed to <viewId>.focus), so the InsrcCommandId union and the exact-set command tests (count 13) are unchanged. [[c4]]
- The whole surface stays behind insrc.chat.enabled (default false): when disabled there is no Activity Bar container, no view, no provider, and no command. [[c1]]
- extension.ts remains the sole vscode importer; the new adapter/provider factory (chat-view-channel.ts) is vscode-free (type-only vscode imports), mirroring the createChatPanelHost deps-injected idiom. [[c3]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via tsx --test (matches the existing vscode-plugin suites; no VS Code runtime — FakeChannel/fake-WebviewView doubles + regex-over-source + manifest-shape assertions, per chat-panel.test.ts / extension-chat-wiring.test.ts / packaging.test.ts)`

### Test levels

- **unit** — Prove the WebviewView->ChatPanelChannel adapter maps every ChatPanelChannel method onto the view's webview correctly, and that a fake WebviewView drives the existing chat host end to end.
  - Subjects: `webviewViewToChannel(fakeView): setHtml -> fakeView.webview.html; postMessage -> fakeView.webview.postMessage; onMessage registers fakeView.webview.onDidReceiveMessage; onDidDispose registers fakeView.onDidDispose; reveal -> fakeView.show(true); dispose is a no-op`, `postMessage after the fake view is disposed is swallowed (never throws inward)`, `driving createChatPanelHost with createPanel:()=>webviewViewToChannel(fakeView) renders the shell (setHtml called) and posts theme/session-restored`, `createChatSidebarViewProvider.resolveWebviewView(fakeView) enables scripts THEN renders, and a second resolveWebviewView(freshView) rebuilds so the stale view is no longer posted to`, `chat-view-channel.ts imports nothing from 'vscode' at runtime (source-scan)`
  - Fixtures: `a fake WebviewView { webview: fakeWebview(html/postMessage/onDidReceiveMessage/options), onDidDispose emitter, show() spy, visible }`, `the existing scripted StreamAdapter + in-memory ChatSessionStore doubles`
- **contract** — Assert the new manifest contribution shape for the Activity Bar container + sidebar webview view.
  - Subjects: `contributes.viewsContainers.activitybar has { id:'insrc', title, icon:'media/insrc.svg' }`, `contributes.views.insrc has { id:'insrc.chatView', type:'webview', when:'config.insrc.chat.enabled' }`, `contributes.commands is UNCHANGED (exact 13-command set; no new command id)`
  - Fixtures: `the parsed package.json (as the existing manifest tests do)`
- **integration** — Prove extension.ts registers the sidebar provider inside the flag gate, repoints insrc.chat.open to focus the view, and the icon asset ships.
  - Subjects: `source-scan: inside if (chatEnabled), extension.ts calls vscode.window.registerWebviewViewProvider('insrc.chatView', ...) with the exact contributed id and pushes the Disposable to context.subscriptions`, `source-scan: resolveWebviewView sets webview.options enableScripts before rendering`, `source-scan: insrc.chat.open handler calls executeCommand('insrc.chatView.focus') (no new command id)`, `packaging: vscode-plugin/media/insrc.svg exists, is currentColor/themeable, and is not .vscodeignore'd`, `vscode.d.ts declares WebviewView + WebviewViewProvider + registerWebviewViewProvider (tsc --noEmit clean)`
  - Fixtures: `read extension.ts / package.json / .vscodeignore / media/insrc.svg / vscode.d.ts from disk (fs, no VS Code runtime)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: viewsContainers.activitybar has the insrc container referencing media/insrc.svg`, `contract: views.insrc has insrc.chatView (type:webview, when=config.insrc.chat.enabled)`, `integration: media/insrc.svg exists, is themeable, and is packaged` |
| `ac2` | `unit: webviewViewToChannel maps all ChatPanelChannel methods onto the view`, `unit: createChatPanelHost driven by the view-backed channel renders + streams (reuse proven)`, `unit: chat-view-channel.ts is vscode-free` |
| `ac3` | `integration: extension.ts registers registerWebviewViewProvider('insrc.chatView', ...) inside the chatEnabled gate with enableScripts set`, `integration: insrc.chat.open repointed to executeCommand('insrc.chatView.focus'); no new command id`, `contract: contributes.commands remains the exact 13-command set` |
| `ac4` | `unit: a second resolveWebviewView rebuilds the host so a stale/disposed view is not posted to`, `unit: postMessage after dispose is swallowed`, `integration: vscode.d.ts declares the WebviewView/WebviewViewProvider/registerWebviewViewProvider slice (tsc --noEmit clean)` |

## Migration

**State before:** The insrc chat is reachable only via the command palette (insrc.chat.open), which opens an editor-tab WebviewPanel through createChatPanelHost's injected createPanel -> vscode.window.createWebviewPanel (extension.ts ~462-535, chat-panel.ts:412). package.json contributes only `commands` + `configuration` (no viewsContainers/views), so there is NO Activity Bar icon and no sidebar chat. The chat host talks to VS Code only through the ChatPanelChannel interface (chat-panel.ts:29). Only the full-color icon.png asset exists.

**State after:** An insrc icon appears in the Activity Bar (when insrc.chat.enabled is true); clicking it reveals a sidebar webview view (insrc.chatView) that renders the SAME chat, driven by the unchanged createChatPanelHost over a WebviewView->ChatPanelChannel adapter. insrc.chat.open is repointed to focus that view. When the flag is off, the container/view/provider/command are all absent. The chat rendering now lives in the sidebar rather than an editor tab.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the themeable monochrome media/insrc.svg (currentColor) and confirm it is packaged (not .vscodeignore'd). — ↩ rollbackable
2. Extend the local vscode.d.ts slice with WebviewView, WebviewViewProvider, and window.registerWebviewViewProvider so tsc stays clean. — ↩ rollbackable
3. Add the vscode-free adapter module chat-view-channel.ts: webviewViewToChannel(view) + createChatSidebarViewProvider(deps) that on resolveWebviewView enables scripts, wraps the view, builds the host, and opens it — rebuilding on re-resolution. — ↩ rollbackable
4. Add manifest contributions: viewsContainers.activitybar (insrc container -> media/insrc.svg) + views.insrc (insrc.chatView, type:webview, when:config.insrc.chat.enabled). — ↩ rollbackable _(needs: `insrc.chat.enabled`)_
5. In extension.ts, inside if (chatEnabled), register the sidebar provider via registerWebviewViewProvider('insrc.chatView', ..., { webviewOptions: { retainContextWhenHidden: true } }) using the same providers/store/cwd/editGovernance deps, and REPOINT insrc.chat.open to executeCommand('insrc.chatView.focus'). Replace the prior editor-panel createPanel chat wiring (docs-review untouched). — ↩ rollbackable _(needs: `insrc.chat.enabled`)_
6. Update tests: new chat-view-channel unit tests (adapter mapping + host-driven-by-view + re-resolution guard + vscode-free); extend extension-chat-wiring.test.ts (provider registration + command repoint + enableScripts); add manifest-shape assertions; confirm the command count stays 13. — ↩ rollbackable

**Backward compat:** One user-visible behavior change: insrc.chat.open now focuses the sidebar chat view instead of opening an editor-tab chat panel (the chat's new home is the sidebar, per the user decision). The command id, title, and palette entry are unchanged, so keybindings still work. All chat surface stays behind insrc.chat.enabled (default false). The createChatPanelHost / ChatPanelChannel contract and the chat session store are unchanged, so existing sessions/history carry over. No settings schema, stored-state, or IPC contract changes. Toggling the flag at runtime needs a window reload. The docs-review command/panel is untouched.

## Alternatives considered

### a1: WebviewView→ChatPanelChannel adapter, host reused unchanged (createPanel returns the resolved view) — **CHOSEN**

A WebviewViewProvider resolves the sidebar view, wraps it as a ChatPanelChannel, and drives the EXISTING createChatPanelHost by injecting a createPanel that hands back that already-resolved view's channel.

Add viewsContainers.activitybar (insrc -> media/insrc.svg) + views.insrc = [{ id:'insrc.chatView', type:'webview', when:'config.insrc.chat.enabled' }]. New vscode-free chat-view-channel.ts exposes webviewViewToChannel(view): ChatPanelChannel. extension.ts registers a WebviewViewProvider (inside the gate) whose resolveWebviewView enables scripts, wraps the view, constructs createChatPanelHost({ createPanel: () => channel, ...same deps }), and calls host.open(). insrc.chat.open -> executeCommand('insrc.chatView.focus'). createChatPanelHost NOT modified.

### a2: Explicit externally-provided channel entry on the chat host (host bind refactor)

Add a small createChatPanelHost option/entry that accepts an already-built ChatPanelChannel instead of creating one, and the provider passes the resolved-view channel to it.

Same manifest + adapter as a1, but refactor createChatPanelHost to accept an optional injected channel (deps.channel? or host.attach(channel)) that open() uses directly, falling back to createPanel otherwise. Provider builds the channel and calls attach/open.

**Rejected because:** winnerRank 2: functionally equal and semantically cleaner, but 'partial' on nf-minimal-blast-radius because it modifies the S003 chat-host contract for one caller; a1 achieves the same reuse without touching that contract.

### a3: Dedicated sidebar chat host module (separate from createChatPanelHost)

Write a new createChatSidebarHost that renders the shell and runs the turn-loop for a WebviewView directly, independent of createChatPanelHost.

A new module owns the sidebar view lifecycle end to end (resolveWebviewView -> render shell -> run the turn-loop -> post events), reusing lower-level pieces but NOT createChatPanelHost. insrc.chat.open focuses the view.

**Rejected because:** winnerRank 3: 'violates' both uv-reuse-turn-loop and nf-minimal-blast-radius by duplicating the entire chat turn-loop; highest regression risk.

## Citations

- **[[c1]]** `analyze-bundle` `s1 search.text+concept.resolve — VS Code manifest contribution surface today` — "package.json contributes ONLY commands and configuration — no viewsContainers/views; a container is shown only while it owns a visible view (gate the view on config.insrc.chat.enabled)."
- **[[c2]]** `analyze-bundle` `s1 usage.example — createChatPanelHost / ChatPanelChannel lifecycle (chat-panel.ts:29/87/412)` — "The chat host talks to VS Code only through ChatPanelChannel (setHtml/postMessage/onMessage/onDidDispose/reveal/dispose); a WebviewView satisfies that interface, so the host is reused unchanged over a"
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — webview mechanism + vscode.d.ts:98 slice` — "Zero WebviewViewProvider usages today; vscode.d.ts declares only createWebviewPanel — WebviewView/WebviewViewProvider/registerWebviewViewProvider must be added; adapter stays vscode-free."
- **[[c4]]** `analyze-bundle` `s1 module.profile — command wiring + icon assets (extension.ts:535, command-registry.ts:14, icon.png)` — "insrc.chat.open is registered inside the chatEnabled gate; repoint it to <viewId>.focus (no new InsrcCommandId). Only icon.png exists; add a themeable media/insrc.svg."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-26T08:18:35.973Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | The ChatPanelChannel interface (chat-panel.ts:29) is exactly { setHtml, postMessage, onMessage, onDidDispose, reveal, dispose } — the surface a WebviewView must be adapted onto. | reads confirm chat-panel.ts:29 = 'export interface ChatPanelChannel {' with setHtml(html) at :30 (and the interface carries postMessage/onMessage/onDidDispose/reveal/dispose). A WebviewView can satisfy all of these. Accurate. | Confirmed; no change. |
| c2 | citation | LOW | manual | createChatPanelHost.open() obtains its channel by calling the injected deps.createPanel(), so injecting createPanel:()=>webviewViewToChannel(view) binds the host to a pre-resolved WebviewView without modifying the host. | grep confirms chat-panel.ts:418 `channel = deps.createPanel({ viewType, title })` inside open() (:412), and createChatPanelHost at :87. So injecting createPanel:()=>webviewViewToChannel(view) binds the host to a resolved view without modifying it. Accurate. | Confirmed; no change. |
| c3 | citation | LOW | manual | The command insrc.chat.open is registered inside the if (chatEnabled) gate in extension.ts (today opening the editor-tab panel), and is reused/repointed by this story rather than replaced with a new command id. | reads confirm extension.ts:535 registers insrc.chat.open, and :424 is the if (chatEnabled) gate. The command is reused/repointed, not duplicated. Accurate. | Confirmed; no change. |
| c4 | closed-union | LOW | manual | There are ZERO WebviewViewProvider/registerWebviewViewProvider/resolveWebviewView usages in the plugin today, and the local vscode.d.ts slice declares createWebviewPanel (so the sidebar-view API must be newly added). | vscode.d.ts:98 = 'export function createWebviewPanel('; the WebviewViewProvider/registerWebviewViewProvider/resolveWebviewView greps return NONE in src (only the LLD itself) — confirming 0 usages today and that the sidebar-view API must be newly added. Accurate. | Confirmed; add the type slice during build. No artifact change. |
| c5 | inventory | LOW | manual | contributes.commands has exactly 13 commands (pinned by truthful-sync.test.ts) and this story adds NO new command id (reuses insrc.chat.open), so the count stays 13. | truthful-sync.test.ts:201 asserts cmds.length === 13; the story adds no new command id (reuses insrc.chat.open), so the count stays 13 and the exact-set tests stay green. Accurate. | Confirmed; keep command count at 13. No artifact change. |
