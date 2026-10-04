<!-- insrc:artifact ISSUE-6a811b8acca60ac5 -->

# Ask for dev-chat approvals one at a time and wait for each decision before proceeding

## Reproduction

1. In the VS Code insrc chat, use the claude provider with a permission mode that asks for approval (manual, or edit-auto for commands).
2. Send a prompt that makes the assistant issue several permission-needing tool calls in one turn, for example edits to several files at once.

Observed (2026-10-04, a turn with eight parallel file edits): eight approval cards appeared together. Each Approve click immediately sent its own follow-up turn ("Approved: please proceed with the Edit action you requested permission for."), so the approvals arrived as a stream of turns. Clicking the next card while the previous follow-up was still running cut that follow-up short, and several of the follow-up turns came back with no response at all. The work only went through after a separate plain-text message approving everything.

Expected: the chat asks for one approval at a time. Nothing further is requested or run until that approval has been accepted or denied; then the next one, if any, is asked.

## Root cause

Nothing in the chat sequences approval requests; each one is raised, shown and acted on independently.

The claude adapter turns every `system/permission_denied` line of a turn into its own approval-request event, so a turn with N denied tool calls emits N requests. The chat host records each in its `pendingPerms` map as it arrives and forwards each to the webview, which renders a live approve/deny card per request. There is no queue and no notion of a current request.

The decision handler then treats every card as a self-contained action. On Approve it removes that one entry from `pendingPerms` and calls `runTurn` straight away with a synthetic "Approved" prompt, pre-allowing only that one tool name. `runTurn` begins by calling `cancelActive()`, so approving a second card while the first card's follow-up turn is still running cancels that turn. The remaining cards stay live and clickable throughout, and each further click starts, and may cancel, another turn. Because each follow-up pre-allows a single tool name, grants also do not accumulate from one follow-up to the next.

This is specific to the path where the provider denies and ends the turn (claude), which is why the approval is carried by a new turn at all. A provider that answers approvals inside the live turn takes the other branch of the same handler, which relays the decision to the running adapter; that branch does not start a turn, but it likewise does nothing to stop several requests being presented at once.

## Fix intent

The chat controller must present approval requests one at a time and must not proceed until the presented one has been accepted or denied.

When a turn raises several requests, only one is actionable at any moment; the others wait their turn and cannot be acted on early. A decision on the current request completes before the next request is presented, and a follow-up turn started by an approval is never cancelled by a later approval. Denying a request must have a defined, visible effect on the requests waiting behind it rather than leaving them live. What has already been approved must still be in force when a later approval's follow-up runs, so the user is not asked again for something they have just granted.

This must hold for both approval paths: the one where the provider ends the turn and the approval is carried by a follow-up turn, and the one where the decision is relayed into a live turn. The persisted record of each decision (the outcome chip shown in a restored session) must stay one per decision and in the order the decisions were made. Existing single-request behaviour, including the informational response for a directory block and the exact-command re-run, must be unchanged.

Tests must cover a turn with several requests: only one actionable at a time, the next presented only after a decision, an approval never cancelling a running follow-up, and the deny case.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "if (obj['subtype'] === 'permission_denied') {"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "pendingPerms.set(ev.requestId, {"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "void runTurn(`Approved: please proceed with the ${pending.toolName} action you requested permission for.`, [pending.toolName], { suppressEcho: true });"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "cancelActive();"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "deps.providers.get(activeProvider).decide(activeTurnId, msg.requestId, msg.decision);"
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "else if(ev&&ev.kind==='approval-request'){var _c=reg.renderRow({kind:'approval'"
- **[[c7]]** `stakeholder` `user report, 2026-10-04` — "Approvals seem to come in a stream, chat controller should ask for approval one at a time, not proceed till an approval has been accepted or denied."
