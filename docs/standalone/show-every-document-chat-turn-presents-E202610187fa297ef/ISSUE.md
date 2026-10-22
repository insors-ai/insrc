<!-- insrc:artifact ISSUE-7fa297efd4bd1c59 -->

# Show every document a chat turn presents for review, not only the last

## Reproduction

In the VS Code dev chat, have a turn call insrc_present with two pending documents in one call, for example a Story's BUILD record and its code review. Observed: the review pane shows only the last one (the code review); the first (the BUILD record) is never shown, though insrc_present answers that both are presented. Expected: the reviewer sees every document the turn presented, so none awaiting a decision is missed. Seen 2026-10-18 with BUILD-dced43851723554f-s1 and CR-dced43851723554f-s1: the user approved the code review and never saw the BUILD record that carried the completion decision.

## Root cause

The chat's review presenter opens each declared document, in order, through the review pane host (vscode-plugin/src/chat/review-presenter.ts:108-117, wired at vscode-plugin/src/extension.ts:590). The review pane holds one opened document: each open increments a sequence number and an open whose response arrives after a newer open is dropped (vscode-plugin/src/chat/docs-review-panel.ts:1450-1456). Two opens in a row therefore leave only the second document showing, and nothing tells the reviewer another declared document is waiting. The daemon side of insrc_present (src/mcp/server.ts:967-969) promises the chat opens exactly the documents named, so the controller has no signal that one was hidden.

## Fix intent

Every document a chat turn presents for review stays reachable until the reviewer has seen it: when a turn presents more than one, the reviewer can see that several were presented and move between them, and none is silently replaced by a later one. A single presented document behaves as today. The fix keeps the existing guard against a slow, stale open overwriting a newer one, and stays consistent with the open-supersede race already filed as ISSUE-605c70574633ed67 in the same open path.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/review-presenter.ts:108-117` — "for (const name of documents) { ... open(state, doc);"
- **[[c2]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1450-1456` — "const mySeq = ++openSeq; ... if (mySeq !== openSeq) return; // superseded by a newer open — drop this response"
- **[[c3]]** `code` `vscode-plugin/src/extension.ts:590` — "open: (target) => docsReviewHost?.openArtifact({ ...target, quiet: true }),"
- **[[c4]]** `code` `src/mcp/server.ts:967-969` — "the chat opens exactly the documents named here in its review pane"
- **[[c5]]** `stakeholder` `user, 2026-10-18` — "why wasn't the build shown for approval?"
- **[[c6]]** `prior-artifact` `ISSUE-605c70574633ed67` — "openDoc has no supersede guard"
