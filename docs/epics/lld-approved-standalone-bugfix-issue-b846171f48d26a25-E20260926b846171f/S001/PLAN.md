<!-- insrc:artifact PLAN-b846171f48d26a25-s1 -->

# Plan: E20260926b846171f:S001

**Epic:** `lld-approved-standalone-bugfix-issue-b846171f48d26a25`
**LLD run:** `wf-1790446816695-8c2jhh`
**LLD effective hash:** `c90ce092998d...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Extend vscode.d.ts stub with the WebviewPanelSerializer API | S | — | smoke: tsc --noEmit clean with the new WebviewPanelSerializer + registerWebviewPanelSerializer stub types. | [[c3]] |
| 2 | **`t2`** Extract the shared webviewPanelChannel(panel) factory in extension.ts | S | `t1` | unit: webviewPanelChannel(panel) maps a fake WebviewPanel to a ChatPanelChannel (setHtml->webview.html, postMessage->webview.postMessage, onMessage->onDidReceiveMessage, onDidDispose, reveal, dispose). | [[c2]] |
| 3 | **`t3`** Add ChatPanelHost.adopt(channel) + refactor open() to one shared wiring internal | M | — | unit: chat-panel.test.ts: host.adopt(fakeChannel) posts theme + session-restored + history-list on the ADOPTED channel and wires onMessage so a subsequent submit-turn flows.; unit: chat-panel.test.ts: adopt() when a channel is already live supersedes it (prior channel disposed / cancelActive).; unit: chat-panel.test.ts: open() behaviour byte-identical (existing open()/submit/history tests stay green after the shared-internal refactor).; unit: chat-panel.test.ts: adopt() with providers empty posts the same 'no agentic CLI' error turn-event open() does. | [[c1]] |
| 4 | **`t4`** Register the WebviewPanelSerializer for 'insrc.chatPanel' in extension.ts | M | `t1`, `t2`, `t3` | unit: Serializer unit test: deserializeWebviewPanel(fakeWebviewPanel) builds a ChatPanelChannel via webviewPanelChannel() and calls chatHost.adopt() so the fake panel receives setHtml + the initial posts.; unit: deserialize error path: when adopt throws, the error is swallowed and the fake panel disposed.; smoke: packaging.test.ts / activation.test.ts still pass with the added serializer registration. | [[c4]] |
| 5 | **`t5`** Tests + verification (adopt, serializer, tsc, full sweep) | S | `t1`, `t2`, `t3`, `t4` | smoke: Full plugin sweep (npx tsx --test 'src/**/__tests__/*.test.ts') green + tsc --noEmit clean — no existing test regressed. | [[c5]] |

### E20260926b846171f:S001:T001 — Extend vscode.d.ts stub with the WebviewPanelSerializer API

Add to src/vscode.d.ts: `interface WebviewPanelSerializer { deserializeWebviewPanel(panel: WebviewPanel, state: unknown): Thenable<void> | void }` and `window.registerWebviewPanelSerializer(viewType: string, serializer: WebviewPanelSerializer): Disposable`; ensure the Webview interface's `html` is a settable field (already used by the createPanel adapter). Type-only, no runtime effect.

**Acceptance checks:**
- src/vscode.d.ts declares registerWebviewPanelSerializer + WebviewPanelSerializer + a settable Webview.html; tsc --noEmit stays clean.
- The additions match the real VS Code API shape (viewType, serializer, Disposable return).

### E20260926b846171f:S001:T002 — Extract the shared webviewPanelChannel(panel) factory in extension.ts

Extract extension.ts's inline createWebviewPanel->ChatPanelChannel wrapper (:513-539) into one reusable `webviewPanelChannel(panel: WebviewPanel): ChatPanelChannel` function (setHtml->webview.html, postMessage->webview.postMessage(...).then, onMessage->onDidReceiveMessage, onDidDispose, reveal, dispose). The existing chat createPanel dep calls it. Pure refactor — no behaviour change.

**Acceptance checks:**
- The chat createPanel dep produces the SAME ChatPanelChannel behaviour via the extracted factory (fresh-open unchanged).
- webviewPanelChannel is reusable by the serializer (takes any WebviewPanel, no createWebviewPanel call inside).

### E20260926b846171f:S001:T003 — Add ChatPanelHost.adopt(channel) + refactor open() to one shared wiring internal

In chat-panel.ts add adopt(channel: ChatPanelChannel) to the ChatPanelHost interface + createChatPanelHost return; extract open()'s post-channel body (wire onDidDispose/onMessage, setHtml(renderShell()), post theme/session-restored/history-list, empty-providers error) into a shared internal that BOTH open() and adopt() call. adopt() supersedes an already-live channel (cancelActive + dispose prior). open()'s signature + observable behaviour byte-identical.

**Acceptance checks:**
- ChatPanelHost gains adopt(channel); open()/dispose() unchanged for existing callers.
- adopt(channel) wires the channel + posts theme/session-restored/history-list (same as open()), and supersedes any already-live channel (single active channel).
- open() and adopt() share ONE post-channel wiring internal (no duplicated wiring).

### E20260926b846171f:S001:T004 — Register the WebviewPanelSerializer for 'insrc.chatPanel' in extension.ts

In the insrc.chat.enabled chat block, register window.registerWebviewPanelSerializer('insrc.chatPanel', { deserializeWebviewPanel(panel){ try { chatHost.adopt(webviewPanelChannel(panel)); } catch { panel.dispose(); } } }) and push the Disposable to context.subscriptions. Optionally add 'onWebviewPanel:insrc.chatPanel' to package.json activationEvents for robust restore.

**Acceptance checks:**
- A restored 'insrc.chatPanel' panel is wrapped via webviewPanelChannel and adopted by chatHost (history + wiring restored).
- deserialize is registered only under insrc.chat.enabled; the Disposable is in context.subscriptions.
- An adopt failure is caught and the panel disposed (no throw into VS Code).

### E20260926b846171f:S001:T005 — Tests + verification (adopt, serializer, tsc, full sweep)

Add unit tests: chat-panel.test.ts adopt(fakeChannel) posts theme/session-restored/history-list + supersede + open()-unchanged + empty-providers error; a serializer unit test driving deserializeWebviewPanel with a fake WebviewPanel (asserts webviewPanelChannel wrap + adopt + error->dispose). Within the build, write the adopt tests right after t3 and the serializer test right after t4, then run `npx tsc --noEmit` and `npx tsx --test 'src/**/__tests__/*.test.ts'`; confirm no existing test regressed.

**Acceptance checks:**
- New adopt + serializer unit tests pass; existing chat/extension tests stay green (additive).
- tsc --noEmit clean; full plugin sweep green.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| chat-panel.test.ts: host.adopt(fakeChannel) posts theme + session-restored + history-list on the ADOPTED channel and wires onMessage so a subsequent submit-turn flows. | `t3` |
| chat-panel.test.ts: adopt() when a channel is already live supersedes it (prior channel disposed / cancelActive). | `t3` |
| chat-panel.test.ts: open() behaviour byte-identical (existing open()/submit/history tests stay green after the shared-internal refactor). | `t3`, `t5` |
| chat-panel.test.ts: adopt() with providers empty posts the same 'no agentic CLI' error turn-event open() does. | `t3` |
| Serializer unit test: deserializeWebviewPanel(fakeWebviewPanel) builds a ChatPanelChannel via webviewPanelChannel() and calls chatHost.adopt() so the fake panel receives setHtml + the initial posts. | `t4` |
| webviewPanelChannel(panel) maps a fake WebviewPanel to a ChatPanelChannel (setHtml->webview.html, postMessage->webview.postMessage, onMessage->onDidReceiveMessage, onDidDispose, reveal, dispose). | `t2` |
| deserialize error path: when adopt throws, the error is swallowed and the fake panel disposed. | `t4` |
| tsc --noEmit clean with the new serializer stub types. | `t1`, `t5` |
| Full plugin sweep (npx tsx --test 'src/**/__tests__/*.test.ts') green — no existing test regressed. | `t5` |
| packaging.test.ts / activation.test.ts still pass with the added serializer registration. | `t4`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1: ChatPanelHost.adopt + createChatPanelHost.open shared-wiring refactor (chat-panel.ts)`
- **[[c2]]** `prior-artifact` `LLD s1: webviewPanelChannel factory extracted from the inline createWebviewPanel->ChatPanelChannel adapter (extension.ts:513-539)`
- **[[c3]]** `prior-artifact` `LLD s1: vscode.d.ts stub extension — WebviewPanelSerializer + window.registerWebviewPanelSerializer + settable Webview.html`
- **[[c4]]** `prior-artifact` `LLD s1: register the WebviewPanelSerializer for 'insrc.chatPanel' in the flag-gated chat block; deserialize wraps+adopts, try/catch->dispose`
- **[[c5]]** `prior-artifact` `LLD s1 testStrategy: adopt + serializer unit tests via fakeChannel/fake WebviewPanel + tsc + full plugin sweep (node:test)`
