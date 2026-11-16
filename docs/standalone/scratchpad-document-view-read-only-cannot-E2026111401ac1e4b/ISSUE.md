<!-- insrc:artifact ISSUE-01ac1e4b6a6c9c2f -->

# Scratchpad document view is read-only — cannot edit scratchpad content inside the VS Code plugin

## Reproduction

In VS Code with the insrc plugin: open the chat panel, click the scratchpad icon, choose 'New scratchpad' (or open an existing one from the menu / Browse all). The scratchpad opens in an editor tab showing its markdown in a non-editable view — clicking into it places no caret and typing does nothing; there is no save control. Expected: the content is editable and saves persist to the underlying ~/.insrc/scratches/<id>.md file.

## Root cause

The document view is read-only by construction: vscode-plugin/src/panels/scratch-panels.ts documentBodyHtml() renders a <pre id="insrc-scratchdoc"> and the webview bootstrap assigns content via textContent only (scratch-panels.ts:164-205); nothing in the view is editable and no message path exists to write content back — ScratchStore (vscode-plugin/src/chat/scratch-store.ts) implements list/create/read/delete only, and protocol.ts has no save message type. This was an explicit scope decision in the original story (LLD ac5: in-plugin editing OUT OF SCOPE), so the current behavior matches the old spec but not the user's need.

## Fix intent

Make the 'insrc.scratchpad' document view editable in-plugin: render the scratchpad content into an editable element (textarea) instead of a read-only <pre>, add a save affordance (icon button and/or Ctrl/Cmd+S) that posts a new 'scratch-save' {id, text} intent, add a matching host->webview saved/error reply, route the intent in scratch-host.ts to a NEW ScratchStore update operation that atomically and safely rewrites the .md file (preserving the store's existing invariants: id validation resolving inside the store root, symlink refusal, temp-write + publish), track a dirty indicator while there are unsaved edits, refresh the browse table (mtime) after a successful save, and keep the selection-based floating Send-to-chat behavior working on the editable surface.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/panels/scratch-panels.ts:146-151` — "documentBodyHtml returns `<pre id="insrc-scratchdoc" class="scratch-doc"></pre>` and the bootstrap sets content with `doc.textContent=m.text` only — no editable element"
- **[[c2]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "ScratchStore interface exposes listScratches/createScratch/readScratch/deleteScratch; no update/write op exists (grep for updateScratch|writeScratch|saveScratch across vscode-plugin/src found none in "
- **[[c3]]** `code` `vscode-plugin/src/chat/scratch-host.ts:101-140` — "'scratch-open' → deps.panels.openDocument(msg.id); 'scratch-new' → createScratch then openDocument — the document view is the only place content is shown"
- **[[c4]]** `doc` `docs/standalone/vs-code-plugin-scratchpads-insrc-scratches-E202611134642d49a/S001/LLD.md` — "ac5: 'Editing existing scratchpad content inside the plugin is OUT OF SCOPE for this increment (the document view is read-only; content is created via New and edited as a plain file outside the plugin"
- **[[c5]]** `code` `vscode-plugin/src/chat/protocol.ts:442-444` — "WEBVIEW_TO_HOST_TYPES / HOST_TO_WEBVIEW_TYPES unions carry the scratch message types; a save round-trip would add new members to both directions"
