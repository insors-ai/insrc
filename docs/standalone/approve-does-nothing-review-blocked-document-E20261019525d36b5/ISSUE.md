<!-- insrc:artifact ISSUE-525d36b5d84c68bb -->

# Approve does nothing on a review-blocked document in the VS Code review pane

## Reproduction

Open a pending DEF, HLD or LLD in the VS Code docs-review pane whose latest daemon review is a block (seen 2026-10-19 on HLD-8315a11f29fd2812, after its last review round blocked on one finding that was then fixed). Click Approve. Observed: nothing happens; no decision is recorded, no message reaches the chat, and the button looks the same as an enabled one; the only hint is a small state line 'pending review · blocked: it cannot be approved'. The reviewer clicked several times before asking why. Expected: the pane says plainly that this document's review blocks approval and that approval needs an override reason, and lets the reviewer approve with that reason (or hands the decision to the chat), since approval with an override is a normal outcome for a review that converges but never fully passes.

## Root cause

Two parts. (1) The pane turns the daemon's 'not approvable' into a silently disabled button: the docs-review client maps the artifact-content result to blocked = !res.approvable (vscode-plugin/src/chat/docs-review-client.ts:151), and the webview sets btn.approve.disabled whenever blocked is set (vscode-plugin/src/chat/docs-review-panel.ts:2027), so a click on the review-blocked document fires no event and nothing explains it beyond the small state line. (2) Even with the button enabled there is no override path: the pane records decisions through the daemon's workflow.reviewDecision call (vscode-plugin/src/chat/docs-review-client.ts:168-172; src/daemon/index.ts:749), whose parameters are repo, mdPath, decision and comments only (src/workflow/review-decision.ts:103 and its params parsing), so an approval of a review-blocked document can only be withheld; an override reason can be given only through the chat's insrc_workflow_approve.

## Fix intent

A reviewer can always tell why Approve is unavailable and can still approve a review-blocked document deliberately. The pane shows plainly that the document's latest review blocks approval and that approving needs an override reason; it lets the reviewer enter that reason and approve, the decision being recorded with the reason exactly as an in-chat approval with an override is, or, failing that, hands the decision to the chat; a click never silently does nothing. Documents whose review passes, or that are not awaiting review, behave as today.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:151` — "blocked: !res.approvable,"
- **[[c2]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:2027` — "btn.approve.disabled=busy||!pend||!!m.blocked;"
- **[[c3]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:168` — "async decide(mdPath: string, decision: ReviewDecision, comments: readonly ReviewDecisionComment[]): Promise<ReviewDecisionResult> {"
- **[[c4]]** `code` `src/daemon/index.ts:749` — "'workflow.reviewDecision': async (params) => {"
- **[[c5]]** `code` `src/workflow/review-decision.ts:103` — "export async function handleReviewDecision("
- **[[c6]]** `stakeholder` `user, 2026-10-19` — "I am clicking the approve button but no event is being triggered, check why"
