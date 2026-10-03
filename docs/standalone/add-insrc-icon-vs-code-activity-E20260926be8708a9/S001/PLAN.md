<!-- insrc:artifact PLAN-be8708a9cd20e286-S001 -->

# Plan: E20260926be8708a9:S001

**Epic:** `add-insrc-icon-vs-code-activity`
**LLD run:** `wf-1790410257933-gdhoaz`
**LLD effective hash:** `be8708a9cd20...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the themeable Activity Bar icon asset | S | — | integration: packaging: media/insrc.svg exists on disk, uses currentColor, and is not .vscodeignore'd | [[c1]] |
| 2 | **`t2`** Extend the local vscode.d.ts type slice for sidebar-view APIs | S | — | integration: vscode.d.ts declares WebviewView + WebviewViewProvider + registerWebviewViewProvider (tsc --noEmit clean) | [[c3]] |
| 3 | **`t3`** Add the vscode-free WebviewView->ChatPanelChannel adapter + provider factory | M | `t2` | unit: webviewViewToChannel maps setHtml/postMessage/onMessage/onDidDispose/reveal(->show(true))/dispose(->noop) onto the fake view; unit: postMessage after the fake view is disposed is swallowed (never throws inward); unit: createChatPanelHost driven by createPanel:()=>webviewViewToChannel(fakeView) renders the shell + posts theme/session-restored; unit: resolveWebviewView enables scripts THEN renders; a second resolveWebviewView(freshView) rebuilds so the stale view is not posted to; unit: chat-view-channel.ts is vscode-free (source-scan, no runtime 'vscode' import) | [[c2]] [[c3]] |
| 4 | **`t4`** Add the manifest Activity Bar container + sidebar webview view | S | `t1` | integration: contract: viewsContainers.activitybar has { id:'insrc', title, icon:'media/insrc.svg' }; integration: contract: views.insrc has { id:'insrc.chatView', type:'webview', when:'config.insrc.chat.enabled' }; integration: contract: contributes.commands is UNCHANGED (exact 13-command set; no new command id) | [[c1]] [[c4]] |
| 5 | **`t5`** Wire the sidebar provider + repoint insrc.chat.open in extension.ts | M | `t2`, `t3`, `t4` | integration: source-scan: inside if (chatEnabled), extension.ts calls registerWebviewViewProvider('insrc.chatView', ...) and pushes the Disposable to context.subscriptions; integration: source-scan: resolveWebviewView sets webview.options enableScripts before rendering; integration: source-scan: insrc.chat.open handler calls executeCommand('insrc.chatView.focus') (no new command id); integration: source-scan: createDocsReviewHost + insrc.chat.docsReview remain registered (docs-review untouched) | [[c2]] [[c4]] |
| 6 | **`t6`** Tests + full sweep | M | `t3`, `t4`, `t5` | integration: full vscode-plugin sweep (tsx --test) passes with 0 failures and tsc --noEmit is clean | [[c1]] [[c2]] [[c3]] [[c4]] |

### E20260926be8708a9:S001:T001 — Add the themeable Activity Bar icon asset

Create vscode-plugin/media/insrc.svg as a single-color currentColor SVG derived from the insrc mark; ensure it is packaged (not excluded by .vscodeignore).

**Acceptance checks:**
- vscode-plugin/media/insrc.svg exists and uses currentColor (no hardcoded fill that breaks theming)
- the file is not excluded by .vscodeignore

### E20260926be8708a9:S001:T002 — Extend the local vscode.d.ts type slice for sidebar-view APIs

Add WebviewView, WebviewViewProvider, and window.registerWebviewViewProvider to src/vscode.d.ts, reusing the existing Webview interface, so the adapter + extension compile.

**Acceptance checks:**
- vscode.d.ts declares WebviewView (webview/onDidDispose/visible/show), WebviewViewProvider.resolveWebviewView, and window.registerWebviewViewProvider
- tsc --noEmit is clean after the additions

### E20260926be8708a9:S001:T003 — Add the vscode-free WebviewView->ChatPanelChannel adapter + provider factory

Create src/chat/chat-view-channel.ts with webviewViewToChannel(view): ChatPanelChannel (setHtml/postMessage/onMessage/onDidDispose/reveal/dispose mapping) and createChatSidebarViewProvider(deps): WebviewViewProvider that on resolveWebviewView enables scripts, wraps the view, builds the host, opens it, and rebuilds on re-resolution. Type-only vscode imports; reuse ChatPanelChannel from chat-panel.ts.

**Acceptance checks:**
- webviewViewToChannel maps all six ChatPanelChannel methods; dispose is a no-op; post-dispose postMessage is swallowed
- createChatSidebarViewProvider.resolveWebviewView enables scripts before rendering and rebuilds host+channel on a fresh view (stale view not posted to)
- chat-view-channel.ts imports nothing from 'vscode' at runtime (type-only)

### E20260926be8708a9:S001:T004 — Add the manifest Activity Bar container + sidebar webview view

In package.json add contributes.viewsContainers.activitybar (insrc container -> media/insrc.svg) and contributes.views.insrc (insrc.chatView, type:webview, when:config.insrc.chat.enabled). Add NO new command.

**Acceptance checks:**
- viewsContainers.activitybar has { id:'insrc', title, icon:'media/insrc.svg' }
- views.insrc has { id:'insrc.chatView', type:'webview', when:'config.insrc.chat.enabled' }
- contributes.commands remains the exact 13-command set (no new command id)

### E20260926be8708a9:S001:T005 — Wire the sidebar provider + repoint insrc.chat.open in extension.ts

Inside the existing if (chatEnabled) block, build the provider via createChatSidebarViewProvider with real vscode-bound seams (toChannel over view.webview; makeHost = (createPanel) => createChatPanelHost({ createPanel, providers, store, cwd, editGovernance }); enableScripts sets view.webview.options), register it via registerWebviewViewProvider('insrc.chatView', ..., { webviewOptions: { retainContextWhenHidden: true } }) pushed to context.subscriptions, and repoint insrc.chat.open to executeCommand('insrc.chatView.focus'). SCOPE THE EDIT to the CHAT host construction + insrc.chat.open handler ONLY — leave createDocsReviewHost / insrc.chat.docsReview and their createWebviewPanel wiring intact (per s3 critique).

**Acceptance checks:**
- registerWebviewViewProvider is called with the exact contributed id 'insrc.chatView' inside the chatEnabled gate and its Disposable pushed to context.subscriptions
- resolveWebviewView sets webview.options enableScripts before rendering
- insrc.chat.open handler calls executeCommand('insrc.chatView.focus'); no new command id added
- createDocsReviewHost + insrc.chat.docsReview registration remain intact (docs-review untouched)
- extension.ts remains the sole vscode importer; tsc --noEmit clean

### E20260926be8708a9:S001:T006 — Tests + full sweep

Add chat-view-channel unit tests (adapter mapping, host-driven-by-fake-view render/stream, re-resolution guard, post-dispose swallow, vscode-free source-scan); extend extension-chat-wiring.test.ts (provider registration + command repoint + enableScripts + docs-review still registered) and packaging/truthful-sync manifest tests (container + webview view present, command count still 13). Run tsc --noEmit + the full vscode-plugin suite.

**Acceptance checks:**
- new chat-view-channel.test.ts covers adapter mapping + re-resolution + vscode-free
- extension-chat-wiring/packaging/truthful-sync updated and green (incl. docs-review-still-registered assertion)
- full vscode-plugin sweep passes (0 fail) and tsc --noEmit is clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| webviewViewToChannel(fakeView): setHtml -> fakeView.webview.html; postMessage -> fakeView.webview.postMessage; onMessage registers fakeView.webview.onDidReceiveMessage; onDidDispose registers fakeView.onDidDispose; reveal -> fakeView.show(true); dispose is a no-op | `t3` |
| postMessage after the fake view is disposed is swallowed (never throws inward) | `t3` |
| driving createChatPanelHost with createPanel:()=>webviewViewToChannel(fakeView) renders the shell (setHtml called) and posts theme/session-restored | `t3` |
| createChatSidebarViewProvider.resolveWebviewView(fakeView) enables scripts THEN renders, and a second resolveWebviewView(freshView) rebuilds so the stale view is no longer posted to | `t3` |
| chat-view-channel.ts imports nothing from 'vscode' at runtime (source-scan) | `t3` |
| contributes.viewsContainers.activitybar has { id:'insrc', title, icon:'media/insrc.svg' } | `t4` |
| contributes.views.insrc has { id:'insrc.chatView', type:'webview', when:'config.insrc.chat.enabled' } | `t4` |
| contributes.commands is UNCHANGED (exact 13-command set; no new command id) | `t4` |
| source-scan: inside if (chatEnabled), extension.ts calls vscode.window.registerWebviewViewProvider('insrc.chatView', ...) with the exact contributed id and pushes the Disposable to context.subscriptions | `t5` |
| source-scan: resolveWebviewView sets webview.options enableScripts before rendering | `t5` |
| source-scan: insrc.chat.open handler calls executeCommand('insrc.chatView.focus') (no new command id) | `t5` |
| packaging: vscode-plugin/media/insrc.svg exists, is currentColor/themeable, and is not .vscodeignore'd | `t1` |
| vscode.d.ts declares WebviewView + WebviewViewProvider + registerWebviewViewProvider (tsc --noEmit clean) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges: package.json viewsContainers.activitybar + views + media/insrc.svg icon asset`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails: webviewViewToChannel + createChatSidebarViewProvider reuse createChatPanelHost via ChatPanelChannel; insrc.chat.open repoint`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges: src/vscode.d.ts WebviewView/WebviewViewProvider/registerWebviewViewProvider slice + vscode-free adapter`
- **[[c4]]** `prior-artifact` `LLD S001 invariants: no new command id (reuse insrc.chat.open), contributes.commands count stays 13`
