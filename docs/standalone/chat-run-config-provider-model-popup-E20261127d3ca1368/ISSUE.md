<!-- insrc:artifact ISSUE-d3ca1368b1f4cccd -->

# Chat run-config provider/model popup flickers while open (rebuilt on every host echo)

## Reproduction

Open the insrc chat panel in VS Code, click the bottom-right provider·model button to open the run-config popup, then pick a provider (or a model of another provider) to start a new chat. Observed: the open menu visibly rebuilds/jumps after every click, and 2-3 times on every open even without clicking (catalog loading -> ready re-renders), because hover targets are destroyed mid-interaction. Expected: the popup stays put while open; it re-renders only when the underlying selection/catalog actually changes.

## Root cause

In vscode-plugin/src/chat/chat-panel.ts the webview handler calls updatePickers() on EVERY run-config (~2773) and run-catalog (~2774) message; updatePickers() (~2626) re-renders an open popup via renderProvPane() (~2668), which rebuilds both panes with innerHTML. rb.onclick (~2673) calls requestCatalog() on every popup open; the host (refreshRunCatalog ~391, publishCatalog ~362, open-run-picker case ~3343) posts run-catalog twice per refresh (loading then ready), and definitions() is a daemon IPC with a 10s timeout (extension.ts ~662) so the ready re-render lands mid-browse. The different-provider branches of pickModel (~2670) and the provider item onclick (~2668) post new-chat WITHOUT closePops(), so the host run-config echo (postRunConfig ~1078 via postRestored ~1070) re-renders the still-open popup after every new-chat selection.

## Fix intent

(1) re-render an open popup only when the data it shows actually changed (compare provider/model/effort and catalog revision+status before rebuilding); (2) skip the catalog refresh on popup open when the catalog is already ready; (3) closePops() when a different-provider pick starts a new chat; (4) no-op the status-bar label rewrite when values are identical. Confined to chat-panel.ts plus regression tests in vscode-plugin/src/chat/__tests__/chat-panel.test.ts; no protocol/IPC changes.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c6]]** `code` `vscode-plugin/src/extension.ts`
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts`
