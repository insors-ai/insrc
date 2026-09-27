<!-- insrc:artifact ISSUE-b846171f48d26a25 -->

# Restored insrc chat webview panel is a dead shell after window reload / extension update (empty history, dead transcript)

## Reproduction

1. Enable the chat (insrc.chat.enabled) and open it via 'insrc: Open chat' (or the title/status action); create/use one or more chats so the session dropdown has history. 2. Reload the window (Developer: Reload Window) or update/reinstall the extension and restart VS Code, with the chat tab left open. Observed: VS Code re-opens the chat tab, but the session dropdown is empty and the transcript is blank/non-functional; the webview DevTools/workbench console shows repeating VS Code-internal errors 'Cannot read properties of undefined (reading toUrl)' at asBrowserUri / $loadForeignModule. Expected: the restored chat tab shows the prior session history in the dropdown and a working, wired panel (or is cleanly re-opened) exactly as a freshly-opened chat does. Workaround that confirms the diagnosis: close the restored tab and re-open via 'insrc: Open chat' — history returns immediately (the underlying sessions were never lost).

## Root cause

The extension registers no vscode.window.registerWebviewPanelSerializer for any of its webview panels. Every panel is created imperatively inside the host's injected createPanel seam via vscode.window.createWebviewPanel (extension.ts: the chat host at ~:516, the docs-review host at ~:565, the detailed-status/repo-config panelHost at ~:323). The chat host only ever creates its panel from its own open() path (createChatPanelHost.open() -> deps.createPanel({viewType:'insrc.chatPanel',...}) -> post theme/session-restored + postHistory). When VS Code restarts it restores the serialized webview tab for viewType 'insrc.chatPanel', but with no serializer registered VS Code cannot hand the restored WebviewPanel back to the extension, so the host never adopts it: open()/postHistory() never run for the restored panel, and it receives no theme/session-restored/history-list message. The restored webview therefore sits as an inert shell (its HTML reloads, so the tab appears, but the host<->webview channel is never re-established). The asBrowserUri(undefined)/$loadForeignModule console errors are VS Code failing to rehydrate the orphaned webview's resources. The chat SESSIONS are unaffected — they persist in context.globalState via the memento store — so the data is intact; only the restored panel's wiring is missing.

## Fix intent

Make a restored insrc webview panel reconnect to its host so it behaves like a freshly-opened one (history + working channel), instead of leaving a dead shell. Intent (not implementation): register a WebviewPanelSerializer for the chat viewType (and evaluate the docs-review viewType) that routes VS Code's deserializeWebviewPanel into the existing webview-host seam so the host ADOPTS the VS-Code-provided panel and re-satisfies its channel contract (setHtml + onMessage/onDidDispose + the initial theme/session-restored/history-list posts) — or, where restoring is not worthwhile, deterministically dispose the restored panel and reopen cleanly rather than showing an inert shell. The exact seam design (adopt-existing-panel vs dispose-and-reopen, and whether docs-review/status panels opt in) is deferred to the LLD.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:88` — "const VIEW_TYPE = 'insrc.chatPanel';"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts (createChatPanelHost.open(): channel = deps.createPanel({viewType: VIEW_TYPE, title:'insrc chat'}) then post theme/session-restored + postHistory)`
- **[[c3]]** `code` `vscode-plugin/src/extension.ts:516` — "const panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Beside, { enableScripts: true });"
- **[[c4]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:41` — "const VIEW_TYPE = 'insrc.docsReviewPanel';"
- **[[c5]]** `code` `vscode-plugin/src/panels/webview-host.ts:43-44 (DETAIL_VIEW_TYPE 'insrc.detailedStatus' / REPO_VIEW_TYPE 'insrc.repoConfiguration' — also created via createWebviewPanel with no serializer)`
- **[[c6]]** `code` `vscode-plugin/src/extension.ts:427 (createMementoChatSessionStore({ memento: context.globalState, maxSessions: 200 }) — sessions persist in globalState, so history data survives; only the restored panel wiring is missing)`
- **[[c7]]** `convention` `grep registerWebviewPanelSerializer over vscode-plugin/src/*.ts returns no matches — no serializer is registered anywhere in the plugin`
