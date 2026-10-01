<!-- insrc:artifact ISSUE-605c70574633ed67 -->

# Opening two documents quickly can display the wrong one in the docs-review pane

## Reproduction

In the VS Code docs-review pane, click one pending artifact and then immediately click a second one, while the daemon is slow enough that the first content request is still in flight when the second is issued (an indexing daemon under load, or a large artifact body, is enough).

Observed: whichever response arrives LAST wins. If document A's response is slower than document B's, the pane shows B briefly and then replaces it with A's body — while the list selection and the reviewer's intent both point at B. The reviewer can then read, and approve, a document other than the one they opened.

Expected: the pane shows the document that was requested LAST. A response for a request the reviewer has already moved on from is discarded.

## Root cause

The pane has a monotonic supersede guard, but it protects only the pending-LIST path, not the opened-DOCUMENT path.

`refreshSeq` is declared at vscode-plugin/src/chat/docs-review-panel.ts:66 and read at :75, :78 and :83. All of those references sit inside `refreshPending()`, declared at :74 — the function that reloads the pending set and posts the `docs-list` message. Its own comment at :63-65 states the intent in as many words: a guard so that a slow `refreshPending` response can never overwrite a newer one, because open(), the webview boot-ping and every decision all trigger a refresh.

`openDoc()`, declared at :96, is the function that awaits `deps.client.content()` at :99 and posts the `docs-content` message carrying the body the reviewer reads. It takes no sequence number and performs no supersede check at all. Nothing orders two concurrent openDoc calls, so the pane renders whichever IPC completes last rather than whichever the reviewer asked for last.

The defect is pre-existing — it predates the Epic bfe98ff7 work and is not introduced by it. It was surfaced during that Epic's Story S001, task t5, whose acceptance check had initially presumed the existing guard covered this path; the check was corrected before that build ran, and the gap was deliberately left out of the Story's scope rather than absorbed into it.

## Fix intent

Give the opened-document path the same supersede semantics the pending-list path already has: a response for a document the reviewer has since navigated away from is discarded instead of rendered.

The correction should reuse the mechanism already present in this file rather than introduce a second, different one — the pane should end up with one consistent rule for stale responses, not two. It also must not weaken the existing fail-closed behaviour: a content-fetch failure for the CURRENT document must still post blocked:true so approve stays suppressed, and dropping a superseded response must not be mistaken for a failure of the current one.

The fix needs its own regression test. The pane already has one for the refreshPending half, which is the template to mirror: issue two opens, complete them out of order, and assert the newer document wins regardless of completion order.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:66` — "let refreshSeq = 0;"
- **[[c2]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:74` — "async function refreshPending(): Promise<void> {"
- **[[c3]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:75` — "const mySeq = ++refreshSeq;"
- **[[c4]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:78` — "if (mySeq !== refreshSeq) return; // superseded by a newer refresh — drop this response"
- **[[c5]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:96` — "async function openDoc(artifactId: string): Promise<void> {"
- **[[c6]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:99` — "const content = await deps.client.content(artifactId);"
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — "MED-3: a slow refresh response cannot overwrite a newer one (sequence guard)"
- **[[c8]]** `prior-artifact` `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S001/PLAN.md — t5` — "the pre-existing openDoc supersede gap is recorded as out of scope and filed as its own bugfix — this task neither fixes it nor claims to have"
