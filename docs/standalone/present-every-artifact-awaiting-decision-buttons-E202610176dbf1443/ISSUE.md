<!-- insrc:artifact ISSUE-6dbf14435972af7a -->

# Present every artifact awaiting a decision, with buttons that follow its state

## Reproduction

(1) Open a pending artifact in the VS Code review pane, then approve it from the chat (insrc_workflow_approve) or, for an HLD amendment, through approveAmendmentById. Observed: the pane keeps showing the document with live Approve / Reject buttons and still presents it as awaiting review; pressing a button acts on an artifact that is already decided. Expected: the buttons follow the artifact's state (pending: the decision buttons; approved or rejected: the outcome and no decision buttons), and once the artifact is decided the pane stops presenting it as awaiting review. (2) Ask the chat to present an HLD amendment or a Story extension that awaits approval, for example insrc_present({ documents: ['AMD-c2ba6fa62a148ed1-9', 'docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S013/EXT.md'] }). Observed (2026-10-17, for AMD-c2ba6fa62a148ed1-8, -9 and -10 and S013/EXT.md): every name comes back notPending and nothing opens, so their content had to be shown inline in the chat. Expected: every artifact that awaits the user's decision can be presented and decided in the pane.

## Root cause

(1) The pane reads the pending list only when it opens, on the webview's boot ping and after a decision made in the pane itself (vscode-plugin/src/chat/docs-review-panel.ts:1275-1278); nothing tells it about a decision made through the chat or another surface, so its buttons and its presentation keep the state it last read. (2) insrc_present keeps only pending artifacts that have a document path (src/mcp/server.ts:1208-1214: 'A record with no document file (an empty mdPath) cannot be shown'). An HLD amendment is a JSON record with no document, and a Story extension record (EXT.md) is not reported in the pending list the present tool and the pane read (src/workflow/pending.ts), so neither can be presented or decided there; amendments are approved only through approveAmendmentById.

## Fix intent

The review pane always shows an artifact in its current state: decision buttons while it awaits a decision, its outcome and no decision buttons once it is approved or rejected, whichever surface made the decision; a decided artifact is no longer presented as awaiting review. Every artifact that awaits the user's decision, including HLD amendments and Story extensions, can be presented in the pane and decided there.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1275-1278` — "(open() + the webview boot-ping + each decision all trigger a refresh"
- **[[c2]]** `code` `src/mcp/server.ts:1208-1214` — "A record with no document file (an empty mdPath) cannot be shown, so it is not presentable."
- **[[c3]]** `code` `src/workflow/pending.ts`
- **[[c4]]** `step-output` `insrc_present 2026-10-17 for AMD-c2ba6fa62a148ed1-9, AMD-c2ba6fa62a148ed1-10 and S013/EXT.md` — "{"presented":[],"notPending":[...all four...]}"
- **[[c5]]** `stakeholder` `chat 2026-10-17` — "based on the state of the artifact the buttons should change, it should stop the presenting"
