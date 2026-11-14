<!-- insrc:artifact ISSUE-3183af2a005db14f -->

# Scratchpad popup: "New scratchpad" does not open the created document; New/Browse rows must be icon-only

## Reproduction

With insrc.chat.enabled=true, open the insrc chat panel, click the scratchpads icon (top right of the chat status bar) to open the popup, then click the "New scratchpad" row: a title input box appears, a file is created under ~/.insrc/scratches, but no scratchpad document tab/panel ever opens (observed: panel never appears). Expected: the newly created scratchpad opens in the insrc.scratchpad document view. Separately, the popup's "New scratchpad" and "Browse all" entries render as full text rows at the bottom of the menu, while the user expects icon-only entries at the top right of the popup, matching the icon-only status-bar buttons.

## Root cause

Defect 1: in the scratch-new chain, openDocument's content delivery depends on the webview ready handshake (scratch-ready with matching generation) and on postMessage not racing the listener install; the extension adapter's postMessage swallows rejections (vscode-plugin/src/extension.ts:987-989) and the initial posts race the not-yet-attached message listener, so the created document's panel either never reveals or its content post is lost — combined with the singleton reveal path in vscode-plugin/src/panels/scratch-panels.ts:234-254, the net observed behavior is that nothing visibly opens. Defect 2: renderScratchMenu (vscode-plugin/src/chat/chat-panel.ts:2528-2532) builds the New/Browse actions as text mitem rows appended at the bottom of the menu instead of icon-only rows anchored at the top right.

## Fix intent

Two corrections, both inside the shipped scratchpads feature. (1) Make the scratch-new intent reliably open the created document: audit the scratch-new chain (webview post at vscode-plugin/src/chat/chat-panel.ts:2531 → vscode-plugin/src/extension.ts:792 intercept → vscode-plugin/src/chat/scratch-host.ts:101-128 → vscode-plugin/src/panels/scratch-panels.ts openDocument) so that after createScratch succeeds, openDocument(entry.id) actually creates/reveals the insrc.scratchpad panel — e.g. ensure the singleton path that posts scratch-content cannot drop the panel when the read resolves before the webview's ready handshake, and that a postMessage to a not-yet-attached webview is not silently dropped. (2) Render the popup's New scratchpad and Browse all entries as icon-only rows (SVG icon + title/aria-label hover text, consistent with the icon-only #insrc-scratch status-bar button at vscode-plugin/src/chat/chat-panel.ts:2865-2867) instead of text mitem rows. Update the chat-panel tests that pin the current text-row behavior.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2531`
- **[[c2]]** `code` `vscode-plugin/src/extension.ts:792`
- **[[c3]]** `code` `vscode-plugin/src/chat/scratch-host.ts:117-119`
- **[[c4]]** `code` `vscode-plugin/src/extension.ts:987-989`
- **[[c5]]** `code` `vscode-plugin/src/panels/scratch-panels.ts:234-254`
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2532`
- **[[c7]]** `prior-artifact` `.insrc/artifacts/BUILD-4642d49ab0593787-s1.json`
