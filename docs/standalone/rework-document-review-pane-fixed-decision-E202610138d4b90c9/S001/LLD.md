<!-- insrc:artifact LLD-8d4b90c9ab301e66-S001 -->

# LLD: E202610138d4b90c9:S001

## Summary

**Epic:** `rework-document-review-pane-fixed-decision`
**HLD base run:** `wf-1791891861132-94mwxv`
**HLD effective hash:** `1db9389dad06...`

The document review pane in VS Code is rebuilt around a comment panel that stays at the bottom while the document scrolls: a rounded box with a comment field and three round icon buttons for send feedback, reject and approve, in the VS Code theme's own colours. A reviewer can select text in a markdown document and comment on it; comments are drafts until one of the three buttons is pressed, which sends them all with the decision in one step, and they are saved under the reviewer's git name and the time in the artifact's own feedback list. Earlier comments stay with the document, are shown as margin markers that open on click, oldest first, and survive a revision of an HLD, LLD or PLAN; HTML documents that belong to an artifact open as the page itself. The decision and the new comments are also sent to the chat as a message, so the assistant can revise or move on.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `appendFeedback`

```typescript
appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult  // same signature; the stored entry now also keeps anchor, decision and batchId when the request has them. New beside it in src/workflow/artifacts/provenance/writer.ts: appendFeedbackBatch(req: { artifactPath: string; entries: readonly (Omit<FeedbackEntry, 'id' | 'timestamp'>)[] }): { artifactPath: string; entryIds: string[]; total: number }  and  priorFeedback(jsonPath: string): FeedbackEntry[]
```

**Parameters:**
- `req.artifactPath: string` — The artifact JSON to append to; guarded under the artifact root as today.
- `req.entries: readonly Omit<FeedbackEntry, 'id' | 'timestamp'>[]` — The entries of one decision, in the order the reviewer made them. Each has author, target and comment, and may carry kind, anchor, decision and batchId.

**Returns:** `{ artifactPath: string; entryIds: string[]; total: number }` — SINGLE ENTRY. appendFeedback builds the stored entry from a fixed set of keys today and drops the rest; it now also copies anchor, decision and batchId when present, through one helper that the batch uses too, so both writers store the same shape. The request's schema (the inputSchema of artifactFeedbackTool in provenance/tool.ts, which has additionalProperties false) lists the three optional fields, coerceRequest passes them through, and the stored list's schema (FEEDBACK_PROPERTY_SCHEMA in provenance/schema.ts, also additionalProperties false) lists them, so the 'artifact.feedback.append' IPC and the tool accept and keep them. BATCH. appendFeedbackBatch validates every entry first (non-empty author and comment, as appendFeedback does), then reads the artifact once, gives each entry an id and the same timestamp, pushes them all onto body.feedback and writes the JSON once. Either all entries are written or none. priorFeedback returns body.feedback of the JSON at that path, or [] when the file is missing, unreadable or has none. CARRY-FORWARD. Four finalizers in src/workflow/orchestrator.ts put the prior feedback into the new body before they render it: finalizeDesignEpic (HLD), finalizeDesignStory and finalizeStandaloneLld (LLD) and finalizePlan (PLAN). Each finds the JSON it is about to replace with artifactJsonPath(repoPath, id) from src/workflow/storage.ts, where id is hldArtifactId(epicHash), lldArtifactId(epicHash, storyId) or planArtifactId(epicHash, storyId); these ids do not change when the document is re-authored. A Define is not carried: finalizeDefine gives a re-authored Define a new epic hash, so there is no earlier artifact at its path; extending a Define already keeps its feedback, because appendStoryToDefine spreads the existing body, and is not changed.

**Errors:**
- `ArtifactFeedbackError` when The path is outside the artifact root, the JSON is missing or malformed, the list is empty, or any entry has a blank author or comment; nothing is written.

**Preconditions:**
- The artifact JSON exists under .insrc/artifacts or docs/

**Postconditions:**
- No key of the artifact other than body.feedback changes, and no existing entry is edited or removed
- The .md is not re-rendered by an append, as today
- A request without the three new fields is stored exactly as today
- An HLD, LLD or PLAN re-authored through the workflow keeps every earlier feedback entry, in order, and renders them in its Feedback section
- The carry-forward adds one read of the prior JSON to a finalizer and no write: the artifact's .json and .md are still written only by the synthesize phase
- The 'artifact.feedback.append' IPC keeps its request and response shape; the three fields are optional additions

### 2.2 `feedbackBodyLines`

```typescript
feedbackBodyLines(feedback: FeedbackRecord | undefined): string[]
```

**Parameters:**
- `feedback: FeedbackRecord | undefined` _(optional)_ — The artifact's feedback list.

**Returns:** `string[]` — One bullet per entry as today. An entry with a decision shows it after the kind; an entry with an anchor shows the quoted text (cut to 120 characters) before the comment. An entry with neither renders exactly as today.

**Postconditions:**
- Existing artifacts with feedback render byte-identically
- No feedback still gives no section

### 2.3 `handleArtifactContent`

```typescript
handleArtifactContent(params: { repo?: string; mdPath?: string } | undefined, repoEnv: string | undefined): ArtifactReviewView | ArtifactContentError  // ArtifactReviewView gains: docPath: string; contentVersion: string; feedback?: readonly FeedbackEntry[]; reviewer: { name: string; source: 'git' | 'os' | 'unknown' }; state: 'pending' | 'approved' | 'rejected'.  New in src/workflow/artifacts/companion/header.ts: export function resolveReviewer(repoPath: string, deps?: { gitUserName?: (repoPath: string) => string | undefined; osUserName?: () => string | undefined }): { name: string; source: 'git' | 'os' | 'unknown' }
```

**Parameters:**
- `params.mdPath: string` — The artifact's .md under docs/, as today.
- `params.repo: string` _(optional)_ — The repository; falls back to the daemon's repo as today.

**Returns:** `ArtifactReviewView | ArtifactContentError` — The view as today plus five additive fields. docPath is the .md's repo-relative path. contentVersion is the first 16 hex characters of the SHA-256 of the markdown text returned. feedback is body.feedback as stored (absent when there is none). state is read from meta.approvedAt and meta.rejectedAt. reviewer is the name comments would be saved under, from resolveReviewer. resolveReviewer is a new function made from the three-step fallback that resolveCompanionHeader has inline today: the trimmed git config user.name of the repo with source 'git', else the trimmed OS login with source 'os', else 'unknown' with source 'unknown'. resolveCompanionHeader calls resolveReviewer for its user field, passing its own injected lookups, so the two cannot drift.

**Errors:**
- `ArtifactContentError` when As today: repo or mdPath missing, the path outside docs/, not a .md, unreadable, or its JSON unreadable.

**Postconditions:**
- Every existing field keeps its name, type and meaning; the JetBrains plugin's parseView reads the keys it names and ignores the rest
- The feedback list is forwarded as stored: no entry is dropped, reordered or reshaped
- The companion header's user is the same text as before for every input

### 2.4 `workflow.approve`

```typescript
'workflow.approve' is unchanged. New in the same handler map of src/daemon/index.ts: 'workflow.reviewDecision': (params: { repo?: string; mdPath: string; decision: 'approve' | 'reject' | 'feedback'; comments?: readonly ReviewDecisionComment[] }) => ReviewDecisionResult | { error: string }, delegating to handleReviewDecision in the new src/workflow/review-decision.ts.  ReviewDecisionComment = { comment: string; file?: string; version?: string; anchor?: FeedbackAnchor }.  ReviewDecisionResult = { artifactId: string; decision: 'approve' | 'reject' | 'feedback'; outcome: 'approved' | 'withheld' | 'rejected' | 'recorded'; reason?: string; recorded: number; entryIds: string[]; author: string; commentsError?: string }
```

**Parameters:**
- `mdPath: string` — The artifact's .md under docs/, resolved and guarded exactly as workflow.artifactContent does.
- `decision: 'approve' | 'reject' | 'feedback'` — The button the reviewer pressed.
- `comments: readonly ReviewDecisionComment[]` _(optional)_ — The new comments, in order. file is the repo-relative path of the document commented on (the .md, or an .html companion of this artifact) and defaults to the .md; version is the contentVersion the reviewer saw; anchor is present for an inline comment.
- `repo: string` _(optional)_ — The repository; falls back to the daemon's repo.

**Returns:** `ReviewDecisionResult | { error: string }` — The daemon validates the request, resolves the author once with resolveReviewer, then acts in a fixed order: the decision first, the comments second. approve calls the existing approveWorkflowTarget for this one artifact (and the existing follow-on for an approved bugfix issue, as 'workflow.approve' does); outcome is 'approved', or 'withheld' with the skip reason when the review gate holds it back. reject calls the existing rejectArtifactByJsonPath with the reason: the first whole-document comment if there is one, else 'Rejected in the review pane by <author>'; outcome is 'rejected'. feedback changes no state; outcome is 'recorded'. Then every comment is appended in one appendFeedbackBatch call with kind 'comment', the author, one batchId, and decision set to what happened: 'approve' or 'reject' when that took effect, 'feedback' for a feedback send and for an approval that was withheld. If the append fails after the decision took effect, the result still reports the outcome and carries commentsError, with recorded 0.

**Errors:**
- `{ error: string }` when repo or mdPath missing or failing the docs/ guard; an unknown decision; a comment that is blank, longer than 10,000 characters, or whose file is neither the .md nor a companion listed in the artifact's body; more than 200 comments; feedback with no comments; the artifact not being a pending one for approve or reject; or the approve or reject call throwing. In each of these nothing is written.

**Preconditions:**
- approve and reject need a pending artifact (no approvedAt, no rejectedAt); feedback is accepted in any state

**Postconditions:**
- A comment is never saved with a decision that did not take effect
- A decision with no comments writes no feedback entry
- The existing IPCs workflow.pending, workflow.artifactContent, workflow.approve and workflow.resolveComment keep their shapes and behaviour
- The author is decided by the daemon, never by the caller

### 2.5 `DocsReviewClient`

```typescript
interface DocsReviewClient { pending(): Promise<DocsArtifactSummary[]>; content(idOrPath: string): Promise<DocsContent>; decide(mdPath: string, decision: ReviewDecision, comments: readonly ReviewDecisionComment[]): Promise<ReviewDecisionResult> }  // approve() and comment() are removed; DocsContent gains docPath, contentVersion, feedback, reviewer, state
```

**Parameters:**
- `mdPath: string` — The repo-relative path of the artifact's .md, taken from the view's docPath. decide takes a path only; it does not look an id up.
- `decision: 'approve' | 'reject' | 'feedback'` — The button pressed.
- `comments: readonly ReviewDecisionComment[]` — The drafts and the whole-document comment.

**Returns:** `Promise<ReviewDecisionResult>` — decide calls 'workflow.reviewDecision' once with that path and throws on the daemon's { error } arm, like the other methods. content is as today (an id of a pending artifact, or a path) and forwards the five new view fields unchanged.

**Errors:**
- `Error` when The daemon answered { error } or the socket failed.

**Postconditions:**
- The pane no longer calls workflow.resolveComment or workflow.approve
- A decision never depends on the id-to-path map that pending() refills with pending artifacts only

### 2.6 `createDocsReviewHost`

```typescript
createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost  // DocsReviewHostDeps gains: notifyChat?: (text: string) => 'sent' | 'queued' | 'unavailable'; readCompanion?: (relPath: string) => Promise<string | undefined>. DocsReviewHost is unchanged (open, dispose, openArtifact).
```

**Parameters:**
- `deps.notifyChat: (text: string) => 'sent' | 'queued' | 'unavailable'` _(optional)_ — Hands a decision message to the chat. Absent means no chat message is sent.
- `deps.readCompanion: (relPath: string) => Promise<string | undefined>` _(optional)_ — The text of an HTML companion, given its repo-relative path. extension.ts resolves the path against the workspace folder and answers undefined unless it ends in .html, stays under that folder's docs/ directory after resolving, and the file is at most 8 MB.

**Returns:** `DocsReviewHost` — LAYOUT. The shell is a column the height of the pane: a header (a select of pending documents, the open document's kind and state, and one tab per document of the artifact: the markdown first, then each HTML companion by title), a scroll region that holds the document, a collapsed strip of comments on the whole document, and the comment panel. Only the scroll region scrolls. THEME. Every colour, font and border comes from --vscode-* variables. The --it-* tokens the body, functional-requirement, diagram and experience renderers already use are defined for this surface from --vscode-* variables, so those renderers are not rewritten; renderTerminalStyle is no longer used by this pane and there is no theme message or switch. OPEN DOCUMENT. For the document it shows, the host keeps the artifact id, the docPath and the companions of the view it last read. It re-reads that document by docPath, and it passes docPath to client.decide, so neither depends on the document still being pending. VIEWERS. A markdown document is rendered as today (marked, the section chooser, the functional, diagram and experience slots). An HTML companion is shown the way the probe found to work: the webview posts 'open-companion' { artifactId, relPath }; the host checks that relPath is one of the open document's companions, reads its text with deps.readCompanion, adds the shell's nonce to every script tag that has none, and posts 'docs-companion' { artifactId, relPath, html }; the webview sets that text as the srcdoc of an iframe whose sandbox attribute is 'allow-scripts' only. The frame inherits the shell's CSP, so the page's scripts run only because they carry the nonce, and it can load nothing from the network. When readCompanion is absent or answers undefined, or relPath is not one of the document's companions, the host posts 'docs-companion' with no html and the tab shows the file's path and a line saying it cannot be shown here. COMMENTS. On a markdown document, selecting text inside one block shows a round comment button; pressing it wraps the selection in a mark and opens a thread card under that block with a field and round add and close buttons. An added comment is a draft: dashed underline, tagged 'draft, not sent', removable. Its anchor is { quote, sectionSlug, prefix, suffix }: the selected text, the slug of the nearest heading above it from the section index, and up to 40 characters of the block's text on each side. Saved entries with an anchor are placed by finding the quote in the current document (first in the anchor's section with the prefix and suffix, then in that section, then anywhere when it occurs once; the document's own Feedback section is never searched); a placed passage gets a mark and a margin marker with the count, and clicking either opens its thread, oldest first, each with author, time and decision. An entry whose quote is not found, and every entry without an anchor, is listed in the whole-document strip, oldest first; one whose target.version differs from the view's contentVersion is tagged 'on an earlier revision' and shows its quote. Comments on an HTML companion are whole-document comments with that file as target. Drafts and the whole-document field are kept per artifact in the webview's saved state, so hiding and showing the pane does not lose them. DECISION. The three buttons post one 'docs-decision' { artifactId, decision, comments } with every draft and the whole-document comment; send feedback with no comment is refused in the webview with a line of text. The host acts on it only when artifactId is the open document's; approve and reject also need that document to be in the pending list, and send feedback does not. The host calls client.decide once with the open document's docPath, posts 'docs-decision-result' { artifactId, ok, outcome, recorded, message }, and on success re-reads the pending list and, by docPath, the document. The webview clears its drafts only on ok with no commentsError. A document that is not awaiting review (a read-only open, or one just approved or rejected) shows its history and offers send feedback only. CHAT. After a successful decide the host builds one message and calls deps.notifyChat: the decision and outcome, the artifact id, title and docPath, the reviewer, and the new comments numbered in order, each with its quote and section when it has them; with no comments the message is the decision line alone. The result line in the pane says whether the chat message was sent, is waiting, or could not be sent.

**Errors:**
- `none thrown` when A failing decide, content, pending or readCompanion call is logged and shown as a line in the pane; drafts are kept. A failing or absent notifyChat never undoes a saved decision.

**Preconditions:**
- The channel's panel was created with scripts enabled, as today; no local resource root and no frame-src directive are needed

**Postconditions:**
- The comment panel is visible at every scroll position of the document
- No colour in the shell is a literal or a terminal token value
- Nothing from an artifact reaches the shell's own DOM as markup except through the guarded markdown path that exists today; comments, authors and quotes are set as text; an HTML companion's markup exists only inside the sandboxed frame, which has no access to the shell or to the VS Code API
- The shell's CSP is unchanged: default-src 'none'; style-src 'unsafe-inline'; script-src with the nonce
- The pane holds no saved state of its own besides unsent drafts
- The 'docs-list' and 'open-doc' messages and openArtifact behave as today

### 2.7 `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost  // ChatPanelHost gains: submitExternal(text: string): 'sent' | 'queued' | 'unavailable'.  The lifecycle in vscode-plugin/src/chat/turn-lifecycle.ts gains: busy(): boolean
```

**Parameters:**
- `text: string` — A message to submit in the chat's current session as if the user had typed it.

**Returns:** `'sent' | 'queued' | 'unavailable'` — 'unavailable' when no agentic CLI is installed or the text is blank; nothing is kept. Otherwise the chat panel is opened if it is closed (as open() does) and the message is put on a first-in first-out waiting list held by the host, in memory. The host then tries to drain the list. READY. The host keeps a flag that says its webview has posted 'ready' since the channel was wired. wireChannel sets it false, the 'ready' message sets it true, and disposing the channel sets it false. The session is not the test: opening the panel drafts the session at once, before the webview has loaded, and a turn started then would post its rows to a webview that is not listening yet. A DRAIN runs the first waiting message through runTurn, the path a typed message takes (queued approvals are superseded, the user row is echoed and saved), when all three hold: the ready flag is true, the lifecycle is not busy, and no runTurn call of the host is between its start and its turns.start. One message is run per drain. submitExternal answers 'sent' when its own message was run by that first drain and 'queued' when it is still waiting; on a panel it has just opened the answer is therefore 'queued'. BUSY. turns.busy() is true while a turn begun by start() is waiting for its lease, setting up or being read, and while a turn begun by follow() is being read. It is false once that turn's terminal event has been handed to the sink (before onTerminal is called), once a follow has ended (before onEnd is called), after stop() or detach() has taken effect, and when follow() returned without following. A superseded turn does not make it false: the turn that superseded it keeps it true. DRAIN POINTS. The host drains at the end of the sink's onTerminal and of the follow sink's onEnd, in both after runCompletedBatch (so an approval follow-up that runCompletedBatch starts is in progress and the waiting message stays behind it), in the sink's onError, after the Stop control's turns.stop(), after a chat switch has set the new session, and at the end of the 'ready' message's handling, after postInitialState (so a message handed to a panel that was closed is run once its webview is listening, behind a followed turn if there is one). A waiting message is run in the session that is active when it is drained. The list is dropped, with a logged warning naming how many, when the panel is disposed.

**Postconditions:**
- A message handed in before the chat's webview is ready is kept and run after 'ready', never dropped and never run into a webview that is not listening
- A message from another pane never supersedes a turn in progress, including an approval follow-up and a followed turn
- A waiting message is not lost when the turn it waits behind is superseded by a typed message: it is run when the newer turn ends
- Messages typed by the user behave as today, including superseding a running turn
- extension.ts passes notifyChat: (text) => chatHost.submitExternal(text) to createDocsReviewHost; the two hosts still do not import each other

## 3. Data model changes

### 3.1 `FeedbackEntry` — field-add

Three optional fields. anchor?: FeedbackAnchor = { quote: string (the selected text, at most 500 characters); sectionSlug?: string; prefix?: string; suffix?: string (at most 40 characters each) } marks an inline comment. decision?: 'approve' | 'reject' | 'feedback' is the decision the entry was saved with. batchId?: string is shared by the entries of one decision. The existing target.file holds the repo-relative path of the document commented on and the existing target.version holds the contentVersion the reviewer saw. Entries written before this change have none of the new fields and stay valid. The fields are added in every place that fixes the entry's shape: the type (provenance/types.ts), the stored list's schema (FEEDBACK_PROPERTY_SCHEMA in provenance/schema.ts), the append request's schema (the inputSchema of artifactFeedbackTool in provenance/tool.ts) and coerceRequest, and both writers in provenance/writer.ts.

```
FeedbackEntry { id; author; timestamp; target { file; version?; segment? }; comment; kind?; + anchor?: { quote; sectionSlug?; prefix?; suffix? }; + decision?: 'approve' | 'reject' | 'feedback'; + batchId?: string }
```

**Call sites:**
- `src/workflow/artifacts/provenance/types.ts`
- `src/workflow/artifacts/provenance/schema.ts`
- `src/workflow/artifacts/provenance/tool.ts`
- `src/workflow/artifacts/provenance/writer.ts`
- `src/workflow/artifacts/format/bindings.ts`
- `src/workflow/artifacts/define.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/plan.ts`
- `src/workflow/orchestrator.ts`

### 3.2 `ArtifactReviewView` — field-add

docPath, contentVersion, feedback?, reviewer and state are added; every existing field is unchanged. DocsContent in the plugin mirrors them by indexing the daemon type, as it does for the structured records. The JetBrains reader takes the keys it names from a map, so the new keys do not affect it.

```
ArtifactReviewView { artifactId; kind; renderedMarkdown; openQuestions; approvable; blockReason?; functionalDefinition?; erDefinition?; sequenceDefinition?; uxDefinition?; companions?; + docPath: string; + contentVersion: string; + feedback?: readonly FeedbackEntry[]; + reviewer: { name; source }; + state: 'pending' | 'approved' | 'rejected' }
```

**Call sites:**
- `src/workflow/artifact-content.ts`
- `src/workflow/artifacts/companion/header.ts`
- `vscode-plugin/src/chat/docs-review-client.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### 3.3 `Webview protocol of the review pane (vscode-plugin/src/chat/protocol.ts)` — field-modify

'docs-decision' changes from { artifactId, accept, note? } to { artifactId, decision: 'approve' | 'reject' | 'feedback', comments: { comment; file?; version?; anchor? }[] }; the host no longer reads accept or note. 'docs-content' gains docPath, contentVersion, feedback, reviewer, state and documents: { title; type: 'markdown' | 'html'; relPath? }[]. Three kinds are added to the kind lists: the webview message 'open-companion' { artifactId, relPath } and the host messages 'docs-companion' { artifactId, relPath, html? } and 'docs-decision-result' { artifactId, ok, outcome?, recorded?, message }. The 'theme' message is no longer posted to this pane. The invariant that the old 'docs-decision' shape was what the host acted on ends with this change; the webview and the host ship in one plugin build, so there is no mixed-version case.

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/rework-document-review-pane-fixed-decision-E202610138d4b90c9/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The daemon is older than the plugin and does not know 'workflow.reviewDecision'** (recoverable)
  - Detection: The IPC answers an unknown-method error, which client.decide throws
  - Response: The host posts 'docs-decision-result' with ok false and the message; nothing is saved and no chat message is sent
  - User impact: A line in the pane says the decision could not be recorded and names the cause; the drafts stay
- **An approval is withheld by the review gate** (recoverable)
  - Detection: approveWorkflowTarget returns nothing in approved[] and an entry in skipped[] for this artifact
  - Response: The result's outcome is 'withheld' with the skip reason; the comments are saved with decision 'feedback'; the artifact stays pending
  - User impact: The pane says the document was not approved and why; the comments are in its history as feedback; the chat message says the approval was withheld
- **The decision took effect but the comments could not be written** (recoverable)
  - Detection: appendFeedbackBatch throws after approve or reject returned
  - Response: The result carries the outcome and commentsError with recorded 0; the host reports ok with the error text, re-reads the document by its docPath, and the webview keeps the drafts
  - User impact: The pane says the document was approved (or rejected) and that the comments were not saved; pressing send feedback sends them again, which works on a document that is no longer pending because the host passes its docPath
- **The artifact was approved or rejected elsewhere while the pane had it open** (recoverable)
  - Detection: handleReviewDecision reads meta.approvedAt and meta.rejectedAt before acting and finds one set for an approve or reject
  - Response: { error } naming the state; nothing is written; the host re-reads the pending list and, by docPath, the document, which now shows as not awaiting review
  - User impact: A line says the document is no longer awaiting review; the drafts stay and can be sent as feedback
- **A decision arrives for a document that is not the open one** (recoverable)
  - Detection: The host compares the message's artifactId with the open document's id
  - Response: The message is dropped with a logged warning and the pending list is refreshed, as the host does for a stale decision today
  - User impact: None in normal use: the webview only sends the id of the document it shows
- **A comment names a file that is not this artifact's document** (recoverable)
  - Detection: handleReviewDecision compares each comment's file with the .md's repo-relative path and the relPath of each companion in the artifact's body
  - Response: { error } naming the file; nothing is written
  - User impact: None in normal use: the pane only sends the paths the view gave it
- **The chat cannot take the message** (recoverable)
  - Detection: notifyChat is absent, throws, or answers 'unavailable'
  - Response: The host catches a throw and logs it; the decision and the comments stay saved; the result line says the chat message was not sent
  - User impact: The decision is recorded; the assistant is not told, and the user can tell it in the chat
- **The chat panel is disposed while a message is waiting** (recoverable)
  - Detection: The host's dispose path runs with a non-empty waiting list
  - Response: The list is dropped and a warning is logged with the number of messages dropped
  - User impact: The decision is saved; the assistant is not told
- **The chat's webview never posts 'ready' after the panel was opened for a pane message** (recoverable)
  - Detection: Not detected by a timer: the ready flag simply stays false, so no drain runs
  - Response: The message stays on the waiting list until 'ready' arrives or the panel is disposed, when it is dropped with the logged warning
  - User impact: The pane has already said the message is waiting; the decision itself is saved
- **An HTML companion cannot be read** (recoverable)
  - Detection: readCompanion is absent, rejects, or answers undefined (the path does not end in .html, leaves the workspace's docs/ folder when resolved, the file is missing or it is over 8 MB), or the requested relPath is not among the open document's companions
  - Response: The host posts 'docs-companion' with no html; the tab shows the file's repo-relative path and a line saying it cannot be shown in this pane
  - User impact: The reviewer can still comment on that document as a whole and open the file from the explorer
- **An HTML companion is shown but one of its scripts fails inside the frame** (recoverable)
  - Detection: Not detected by the pane: the frame is sandboxed and reports nothing to the shell
  - Response: The frame shows whatever the page drew; the tab always shows the file's repo-relative path above the frame
  - User impact: A page that draws with scripts may show its source text instead; the path lets the reviewer open the file in a browser
- **The markdown renderer fails for a document** (recoverable)
  - Detection: renderMarkdownBody reports a degradation, as today
  - Response: The body is shown as plain text with the existing notice; inline comment selection is turned off for that document and saved inline comments are listed in the whole-document strip with their quotes
  - User impact: The document is readable and whole-document comments still work
- **The stored feedback list holds an entry the pane cannot read** (recoverable)
  - Detection: The webview checks each entry for a string author, timestamp and comment before drawing it
  - Response: That entry is skipped and the strip's summary line says how many entries could not be shown
  - User impact: The other comments are shown
- **The prior artifact cannot be read when a document is re-authored** (terminal)
  - Detection: priorFeedback catches the read or parse failure of the JSON at the artifact's path
  - Response: It returns an empty list and logs a warning naming the path; the new document is written without earlier comments
  - User impact: The earlier comments of that document are not carried; the file in git history still has them
- **The git user cannot be read** (recoverable)
  - Detection: resolveReviewer's git call fails or returns an empty name
  - Response: The OS login is used with source 'os'; if that also fails the name is 'unknown' with source 'unknown'
  - User impact: The panel shows the name comments will be saved under before anything is sent

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Approve or reject with no drafts and an empty whole-document field | One call with an empty comments list; the decision is recorded, no feedback entry is written, and the chat message is the decision line alone |
| Send feedback with no comment | Refused in the webview with a line of text; no message is posted to the host |
| Send feedback on a document that is not pending (a read-only open, or one just approved or rejected) | Accepted: the host calls decide with the open document's docPath and the comments are saved with decision feedback |
| A selection that crosses two blocks, or lies in the Feedback section or in a thread card | No comment button is offered |
| The same quote occurs several times in a section | The prefix and suffix pick the occurrence; if they no longer match, the first occurrence in that section is used |
| A saved inline comment whose quote is gone after a revision | Listed in the whole-document strip, tagged 'on an earlier revision', with its quote, author, time and decision |
| A revision that leaves a commented passage unchanged | The comment is placed on the passage again and is not tagged as earlier |
| Two selections that overlap an existing mark | A selection that would cut through an existing mark is not offered a comment button; a selection wholly inside one opens that thread |
| A document with 300 saved comments | All are placed or listed; the strip scrolls inside its own height and the comment panel stays visible |
| An HLD, LLD or PLAN re-authored through the workflow | Its feedback list is carried into the new JSON in the same order and its Feedback section is rendered from it |
| A Define re-authored through the workflow | It is a new artifact with a new id and starts with no feedback; the earlier Define's JSON keeps its own |
| A single entry appended through 'artifact.feedback.append' with an anchor, a decision and a batchId | The three fields are stored with the entry; a request without them is stored exactly as today |
| A reviewer presses a second button before the first answer arrives | The three buttons are disabled from the press until 'docs-decision-result' arrives |
| The pane is hidden and shown again with drafts | The drafts and the whole-document field are restored from the webview's saved state for that artifact |
| A decision is sent while the chat panel is closed | The panel is opened and the message waits, although the host already has a session; it is run when the chat's webview posts 'ready'; the pane reports it as waiting |
| A decision is sent while a chat turn is running, then another | Both messages wait and are run one after the other, in order: the first when the turn ends, the second when the first one's turn ends |
| The user types a message while a pane message waits behind a running turn | The typed message supersedes the running turn as today; the pane message is run when the typed message's turn ends |
| A turn ends with approvals decided, so an approval follow-up turn starts | The pane message stays waiting behind the follow-up and is run when the follow-up ends |
| The chat shows a turn followed after a reload when a pane message arrives | The message waits and is run when the follow ends |
| The user switches chat while a pane message waits | The switch ends the wait, and the message is run in the chat that is then active |
| The chat's webview is reloaded (hidden and shown) while a pane message waits behind a running turn | The reload posts 'ready' again; the turn is still in progress, so the message keeps waiting and is run when the turn ends |
| An HTML companion with script tags that already carry a nonce attribute | Those tags are left as they are; only tags without one get the shell's nonce |
| An artifact kind with no feedback field in its type (SPEC, ISSUE, CR) | Comments are saved in body.feedback of its JSON all the same; its .md shows them only if that kind's renderer has a Feedback section |

**Invariants to preserve**

- workflow.pending, workflow.artifactContent, workflow.approve and workflow.resolveComment keep their request and response shapes, which the JetBrains plugin and the CLI read [[c1]]
- A feedback append never edits or removes an entry and touches no key but body.feedback, and a request without the new fields is stored as today [[c3]]
- An artifact with no feedback renders with no Feedback section, and existing entries render as they do today [[c2]]
- An artifact is pending only while meta.approvedAt and meta.rejectedAt are both absent, and a rejected DEF, LLD or PLAN stops its downstream stages [[c3]]
- The review view accepts only a .md that resolves under docs/ [[c3]]
- The design finalizers do not write the artifact's .json or .md; those are written by the synthesize phase (the finalizers do write companion HTML files, as today) [[c3]]
- The companion header's user text is the git user name, else the OS login, else 'unknown' [[c3]]
- The pane's shell is one inline script under a nonce CSP with no remote origin, and artifact text reaches the shell's DOM as text [[c4]]
- The functional-requirement, diagram and experience renderers of the pane keep working, drawing only from --it-* variables [[c4]]
- Opening the chat panel drafts its session at once, and the webview's 'ready' makes the host post its state again [[c4]]
- A message the user types in the chat supersedes a running turn as today, and the superseded turn's sink is told nothing more [[c4]]
- The delivery board opens an artifact in the pane through openArtifact({ artifactId, mdPath }), pending or read-only [[c4]]
- The JetBrains plugin reads the review view by named keys, so added keys do not affect it [[c5]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx; tests sit in __tests__ beside the code (*.test.ts), in src/ for the daemon and in vscode-plugin/src/ for the plugin. Webview scripts are run in a fake DOM as the existing pane and chat shell tests do.`

**Test levels**

- **unit** — The feedback record: both writers, the carry-forward helper, the renderer and the accepted shape.
  - Subjects: `feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid`, `feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before`, `feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid`, `feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically`, `feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact`
  - Fixtures: `A temporary artifact JSON under a .insrc/artifacts folder`
- **unit** — The reviewer lookup extracted from the companion header.
  - Subjects: `reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs`
- **unit** — The review decision core in the daemon, over temporary artifacts and injected approve, reject and author functions.
  - Subjects: `review decision: approve approves first and then saves the comments with decision approve; a withheld approval saves them as feedback and reports the reason`, `review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject`, `review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused`, `review decision: a decision with no comments writes no feedback entry`, `review decision: an invalid request (unknown decision, blank or over-long comment, a file that is not the artifact's document, too many comments, a non-pending artifact for approve or reject) answers an error and writes nothing`, `review decision: a failing comment write after the decision took effect reports the outcome with commentsError`, `review decision: the author is the one resolveReviewer gives and is never taken from the request`
  - Fixtures: `Temporary repository folder with docs/ and .insrc/artifacts holding a pending artifact and its .md`
- **unit** — The review view's new fields.
  - Subjects: `review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion`
- **contract** — The daemon's handler map and the shapes other clients read.
  - Subjects: `daemon handlers: 'workflow.reviewDecision' is registered and delegates to handleReviewDecision, and the 'workflow.approve', 'workflow.resolveComment' and 'artifact.feedback.append' handlers are unchanged`, `plugin protocol: 'docs-decision-result' and 'docs-companion' are host messages, 'open-companion' is a webview message, and 'docs-decision' carries a decision and a comments list`
- **integration** — Re-authoring keeps comments: the HLD, LLD and PLAN finalizers carry the stored feedback into the new artifact.
  - Subjects: `finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none`
  - Fixtures: `A prior artifact JSON with two feedback entries at artifactJsonPath of the artifact's id, in a temporary repository`
- **unit** — The plugin's client, the lifecycle's busy reading and the chat host's new method.
  - Subjects: `docs review client: decide calls 'workflow.reviewDecision' once with the given path, without the id map, and throws on the error arm; content forwards the new view fields`, `turn lifecycle: busy is true while a started turn waits, sets up or is read and while a follow is read; false after the terminal event is handed over, after a follow ends, after stop and detach, and when follow returns without following; a superseding turn keeps it true`, `chat host: submitExternal on a closed panel opens it, answers queued although the session exists, and the message is run when the webview posts ready, not before`, `chat host: submitExternal runs the message at once when the webview is ready and nothing is in progress, and queues it behind a running turn, a followed turn and an approval follow-up; waiting messages run one per turn end, in order`, `chat host: a message waiting behind a turn that a typed message supersedes is run when the typed message's turn ends, and a typed message still supersedes a running turn`, `chat host: submitExternal answers unavailable with no CLI or blank text, drains after Stop and after a chat switch into the session then active, keeps waiting across a second ready while a turn runs, and drops its list on dispose with a warning`
- **integration** — The pane's host over a fake client and a fake channel.
  - Subjects: `docs review host: a docs-decision calls decide once with the open document's docPath and every comment, posts docs-decision-result, re-reads the list and the document by docPath, and hands the chat one message with the decision and the numbered comments`, `docs review host: a decision with no comments sends the chat the decision line alone`, `docs review host: send feedback works on a read-only open and on a document just approved, while approve and reject are refused for a document that is not pending or not the open one`, `docs review host: a failing decide posts a failed result, sends no chat message and keeps the open document`, `docs review host: a withheld approval and a commentsError are each reported in the result and in the chat message`, `docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion`, `docs review host: open-companion for one of the document's companions posts docs-companion with the file's text and the shell's nonce on every script tag that had none; for any other path, or when the read fails, it posts docs-companion with no html`, `docs review host: an absent, throwing or unavailable notifyChat leaves the decision recorded and says so in the result`
- **integration** — The pane's webview script in a fake DOM.
  - Subjects: `docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch`, `docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button`, `docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing`, `docs review shell: drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored from the saved state when the shell is rebuilt`, `docs review shell: saved inline entries are placed on their quotes with a margin marker and count and open oldest first; an entry whose quote is gone is listed as on an earlier revision; entries without an anchor are listed in the whole-document strip in time order`, `docs review shell: an HTML document's tab posts open-companion, and docs-companion sets the text as the srcdoc of a frame with sandbox allow-scripts and shows the file's path; with no html it shows the path and a line of text`, `docs review shell: a document that is not awaiting review shows its history and offers send feedback only`, `docs review shell: author, comment and quote text are set as text, never as markup`, `docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw`
  - Fixtures: `The fake DOM helper the existing shell tests use, extended with a selection and a range`
- **smoke** — What a fake DOM cannot show, checked in a real browser and in VS Code.
  - Subjects: `Headless Chrome render of the real shell with a long document: the comment panel stays in view at the top and at the bottom of the scroll, and a screenshot matches the approved mock's layout`, `By hand in VS Code with a light and a dark theme: the pane follows the theme, an HTML companion with scripts is drawn in its tab, an inline comment and a whole-document comment sent with reject are saved under the git user and appear in the chat as one message, and they are shown as history when the document is opened again`, `By hand in VS Code: a decision sent while a chat turn is running is delivered after that turn ends, and one sent with the chat panel closed opens the chat and is delivered`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch`, `Headless Chrome render of the real shell with a long document: the comment panel stays in view at the top and at the bottom of the scroll, and a screenshot matches the approved mock's layout` |
| `ac2` | `docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch`, `By hand in VS Code with a light and a dark theme: the pane follows the theme, an HTML companion with scripts is drawn in its tab, an inline comment and a whole-document comment sent with reject are saved under the git user and appear in the chat as one message, and they are shown as history when the document is opened again` |
| `ac3` | `docs review shell: an HTML document's tab posts open-companion, and docs-companion sets the text as the srcdoc of a frame with sandbox allow-scripts and shows the file's path; with no html it shows the path and a line of text`, `docs review host: open-companion for one of the document's companions posts docs-companion with the file's text and the shell's nonce on every script tag that had none; for any other path, or when the read fails, it posts docs-companion with no html`, `docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw` |
| `ac4` | `docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button` |
| `ac5` | `docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing`, `docs review host: a docs-decision calls decide once with the open document's docPath and every comment, posts docs-decision-result, re-reads the list and the document by docPath, and hands the chat one message with the decision and the numbered comments`, `review decision: a decision with no comments writes no feedback entry`, `review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject` |
| `ac6` | `review decision: the author is the one resolveReviewer gives and is never taken from the request`, `reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs`, `feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid` |
| `ac7` | `docs review shell: saved inline entries are placed on their quotes with a margin marker and count and open oldest first; an entry whose quote is gone is listed as on an earlier revision; entries without an anchor are listed in the whole-document strip in time order`, `finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none`, `review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion` |
| `ac8` | `docs review host: a decision with no comments sends the chat the decision line alone`, `chat host: submitExternal on a closed panel opens it, answers queued although the session exists, and the message is run when the webview posts ready, not before`, `chat host: submitExternal runs the message at once when the webview is ready and nothing is in progress, and queues it behind a running turn, a followed turn and an approval follow-up; waiting messages run one per turn end, in order`, `chat host: a message waiting behind a turn that a typed message supersedes is run when the typed message's turn ends, and a typed message still supersedes a running turn`, `By hand in VS Code: a decision sent while a chat turn is running is delivered after that turn ends, and one sent with the chat panel closed opens the chat and is delivered` |

## 7. Migration

**State before:** The review pane lays out its list, document, note box and buttons in page flow, in the chat's terminal style, so the controls come after the whole document (analyze bundle 4). Approve calls workflow.approve; request changes calls workflow.resolveComment with an empty anchor, which turns the note into a resolved open question, and is offered only for DEF, HLD and LLD; the pane's client finds a document's path only while the document is pending (bundles 1 and 4). The artifact JSON has a feedback list with author, time, target and comment, appended one entry at a time through artifact.feedback.append, whose writer keeps a fixed set of keys; the review view does not return the list, nothing carries it into a re-authored HLD, LLD or PLAN, the user name is computed inline in the companion header code, and a reject exists only as a function the CLI calls (bundles 2 and 3). The chat host can be given a message only by its own webview; it drafts its session as soon as its panel is opened, before the webview is listening, and a new message supersedes a running turn (bundle 4). A repository HTML document with scripts can be shown in a webview frame only from its text, with its scripts carrying the page's nonce (bundle 5).

**State after:** The pane is a column with a fixed comment panel under one scrolling document, in VS Code theme variables, with one tab per document of the artifact (the markdown, and each HTML companion as the srcdoc of a sandboxed frame). A reviewer drafts inline and whole-document comments and sends them with approve, reject or send feedback through one daemon call, workflow.reviewDecision, which records the decision and then appends the comments to body.feedback with the author the daemon resolves, an anchor for inline comments, and the decision that took effect. Both feedback writers and both schemas carry the new optional fields. The review view returns the feedback list, a content version, the reviewer, the state and the document's path; the pane keeps that path, so feedback works on a document that is no longer pending, and shows saved comments on their passages or in a strip, oldest first. Re-authoring an HLD, LLD or PLAN carries its feedback forward. After a decision the pane hands the chat host a message through submitExternal, which waits while a turn is in progress or the chat's webview has not posted 'ready'. The older IPCs and the feedback entries already saved are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional anchor, decision and batchId fields to the feedback entry's type, to the stored list's schema, to the append request's schema and coercion, to the single-entry writer and to the renderer; add the batch append and the prior-feedback helper — ↩ rollbackable
2. Carry the stored feedback into the new body in the HLD, LLD (epic and standalone) and PLAN finalizers — ↩ rollbackable
3. Extract resolveReviewer in the companion header module and have the header use it; add docPath, contentVersion, feedback, reviewer and state to the review view — ↩ rollbackable
4. Add the review decision core and register the 'workflow.reviewDecision' handler — ↩ rollbackable
5. Add busy() to the turn lifecycle, and the ready flag, submitExternal, its waiting list and its drain points to the chat host — ↩ rollbackable
6. Replace approve and comment in the plugin's review client with decide; change the 'docs-decision' message and add 'docs-decision-result', 'open-companion' and 'docs-companion'; move the host to the open document's path, the one call, the companion read and the chat message — ↩ rollbackable
7. Rebuild the pane's shell: the column layout, the theme variables, the document tabs and frame, the comment panel, inline comments and the history; wire notifyChat and readCompanion in extension.ts — ↩ rollbackable
8. Update the daemon (push, update, restart) before installing the plugin build, then install the plugin and check by hand — ↩ rollbackable

**Backward compat:** Every change to a shape other clients read is additive and optional: the three new fields of a feedback entry (in its type, both schemas and both writers), the five new fields of the review view, and one new IPC method. workflow.pending, workflow.artifactContent, workflow.approve and workflow.resolveComment keep their requests, responses and behaviour, and artifact.feedback.append keeps its request and response shape and stores a request without the new fields exactly as before, so the CLI and the MCP tools are unaffected; the JetBrains plugin reads the review view by named keys and ignores the new ones. The companion header's user text is unchanged. Feedback entries already saved stay valid and render as before. Comments saved from the pane's earlier request-changes button remain where they were written, as resolved open questions; they are not converted. The plugin's webview protocol changes inside one plugin build. A plugin newer than its daemon gets an unknown-method error on a decision and shows it without saving anything, so the daemon is updated first. Rolling back the plugin leaves the saved entries in place. Rolling back the daemon after entries with the new fields were saved leaves them in the JSON; the older stored-list schema does not allow unknown keys, so an artifact holding such entries may be refused where that schema is applied until the daemon is updated again.

## 8. Alternatives considered

### 8.1 a1: One review-decision call in the daemon over the existing feedback record — **CHOSEN**

A new IPC takes the decision and all new comments together; the daemon stamps the author, records the decision, then appends the comments to body.feedback.

FeedbackEntry gains three optional fields: anchor { quote, sectionSlug?, prefix?, suffix? } for an inline comment, decision ('approve' | 'reject' | 'feedback') and batchId; the existing target.version is filled with a content version of the document the comment was made on. One new IPC, workflow.reviewDecision { repo, mdPath, decision, comments[] }, resolves the artifact as workflow.artifactContent does and resolves the author in the daemon. It acts in a fixed order: the decision first (the existing approve or reject function), the comments second, in one write through a new appendFeedbackBatch, each entry carrying the decision that took effect. It answers { artifactId, decision, outcome, reason?, recorded, entryIds, author, commentsError? }. The review view gains docPath, contentVersion, feedback, reviewer and state. There is no IPC for HTML documents: the plugin reads an artifact's HTML companion itself, under the repo's docs/ folder, and shows its text as a sandboxed frame's srcdoc. The pane sends one docs-decision message with the drafts, its host calls the one IPC with the open document's path, re-reads the view, and hands a text summary to an injected notifyChat seam that extension.ts wires to a new chat host method, which queues the message while a turn is in progress or the chat's webview is not ready yet. workflow.resolveComment, workflow.approve and artifact.feedback.append keep their shapes for their current callers; the single-entry append also stores the new optional fields when a caller sends them.

### 8.2 a2: The plugin composes existing calls

The pane's host calls artifact.feedback.append once per comment, then workflow.approve or a thin new workflow.reject, and resolves the author itself.

FeedbackEntry gains the same optional anchor and decision fields, accepted by the existing artifact.feedback.append. The plugin's host resolves the author by running git config user.name in the workspace (else the OS user), appends each comment with one IPC call each, and then calls workflow.approve or a new workflow.reject that wraps rejectArtifactByJsonPath. The review view gains feedback so the pane can show history. The chat message is sent as in a1.

**Rejected because:** Cheaper, but it is partial on the two criteria that concern what is saved.

### 8.3 a3: A separate comments file per artifact

Review comments go to a new sidecar file beside the artifact JSON, with their own read and write calls.

A new file .insrc/artifacts/COMMENTS-<artifactId>.json holds review threads: each thread an anchor and a list of comments with author, time and decision. New IPCs workflow.comments.list and workflow.comments.submit read and write it; the decision is recorded as in a1. body.feedback is left as it is for the notes agents write.

**Rejected because:** Works but ignores the record that exists and costs the most.

## 9. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: Modules and callers of the review flow: the daemon's review IPCs, the plugin's review pane, the chat host.`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: Callers of appendFeedback, rejectArtifactByJsonPath, handleArtifactContent and feedbackBodyLines; sites that name FeedbackEntry or the artifact.feedback.append IPC.`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: Behaviour of the daemon functions the Story changes or calls, read in the source.`
- **[[c4]]** `analyze-bundle` `s1.analyzeBundles[3]: The review pane and the chat host as built.`
- **[[c5]]** `analyze-bundle` `s1.analyzeBundles[4]: How a webview can show a repository HTML document that has its own scripts (probe run in VS Code, 2026-10-13); how the JetBrains plugin reads the review view.`
- **[[c6]]** `code` `src/workflow/artifacts/provenance/writer.ts:117-150` — "export function appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult {"
- **[[c7]]** `code` `src/workflow/artifacts/provenance/types.ts:37-42` — "export interface FeedbackEntry extends ProvenanceAuthorship {"
- **[[c8]]** `code` `src/workflow/artifacts/format/bindings.ts:81-89` — "export function feedbackBodyLines(feedback: FeedbackRecord | undefined): string[] {"
- **[[c9]]** `code` `src/workflow/artifact-content.ts:142-214` — "export function handleArtifactContent("
- **[[c10]]** `code` `src/workflow/gates.ts:971-990` — "export function rejectArtifactByJsonPath(jsonPath: string, reason: string): RejectionResult {"
- **[[c11]]** `code` `src/daemon/index.ts:638-652` — "'workflow.approve': async (params) => {"
- **[[c12]]** `code` `src/daemon/index.ts:609-619` — "'artifact.feedback.append': async (params) => {"
- **[[c13]]** `code` `src/workflow/artifacts/companion/header.ts:127-141` — "function defaultGitUserName(repoPath: string): string | undefined {"
- **[[c14]]** `code` `src/workflow/artifacts/companion/header.ts:87-89` — "user:        nonEmpty((deps.gitUserName ?? defaultGitUserName)(input.repoPath))"
- **[[c15]]** `code` `src/workflow/pending.ts:128-128` — "if (typeof meta['rejectedAt'] === 'string' && meta['rejectedAt'].length > 0) continue;"
- **[[c16]]** `code` `src/workflow/orchestrator.ts:2312-2312` — "async function finalizeStandaloneLld("
- **[[c17]]** `code` `src/workflow/orchestrator.ts:1190-1190` — "const epicHash = computeEpicHash(runId);"
- **[[c18]]** `code` `src/daemon/steps/workflow-step/phases/synthesize.ts:83-83` — "writeAtomic(paths.json, result.finalized.renderedJson);"
- **[[c19]]** `code` `src/workflow/storage.ts:583-585` — "export function artifactJsonPath(repoPath: string, artifactId: string): string {"
- **[[c20]]** `code` `src/workflow/gates.ts:201-201` — "const next: DefineArtifact = { ...define, body: { ...define.body, stories: [...define.body.stories, story] } };"
- **[[c21]]** `code` `src/workflow/gates.ts:826-826` — "export async function approveWorkflowTarget("
- **[[c22]]** `code` `src/workflow/artifacts/companion/types.ts:29-36` — "export interface CompanionArtifactRef {"
- **[[c23]]** `code` `src/workflow/artifacts/provenance/tool.ts:85-85` — "export function coerceRequest(input: ToolInput): AppendFeedbackRequest {"
- **[[c24]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:42-55` — "export interface DocsReviewClient {"
- **[[c25]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:77-77` — "const resolvePath = (idOrPath: string): string => mdPathById.get(idOrPath) ?? idOrPath;"
- **[[c26]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1220-1220` — "export function createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost {"
- **[[c27]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1800-1800` — "log.warn(`[docs-review] docs-decision: unknown/stale artifact ${msg.artifactId}`);"
- **[[c28]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1611-1611` — "const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c29]]** `code` `vscode-plugin/src/chat/chat-panel.ts:124-135` — "export interface ChatPanelHost {"
- **[[c30]]** `code` `vscode-plugin/src/chat/chat-panel.ts:631-631` — "if (session === undefined) session = deps.store.draft(available[0]!);"
- **[[c31]]** `code` `vscode-plugin/src/chat/chat-panel.ts:1129-1129` — "if ((typed === '' && files.length === 0) || session === undefined) return; // empty submit is a no-op"
- **[[c32]]** `code` `vscode-plugin/src/chat/chat-panel.ts:550-550` — "void runTurn(prompt, approvals.grantChain(), { suppressEcho: true });"
- **[[c33]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:372-373` — "if (live === undefined || following?.sessionId === s.id || runningTurns.has(live.cursor.turnId)) return;"
- **[[c34]]** `code` `vscode-plugin/src/extension.ts:668-672` — "const reviewHost = createDocsReviewHost({"
- **[[c35]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1531-1534` — "private fun parseView(data: Map<String, Any?>): ArtifactReviewViewDto {"
- **[[c36]]** `code` `src/workflow/runners/design-story/standalone.ts:57-57` — "acceptanceCriteria: [],"
- **[[c37]]** `stakeholder` `User request and decisions in chat, 2026-10-13. ac1: a fixed comment panel at the bottom, styled like the chat input, with round icon-only buttons. ac2: the VS Code theme only, no light/dark switch. ac3: a viewer by document type, markdown or HTML. ac4: inline comments, annotated inline. ac5: all comments sent when approve, reject or send feedback is pressed; with no comments only the decision. ac6: comments saved with the user (git or OS) and a timestamp, in the artifact JSON. ac7: earlier comments shown as markers that open on click, in time order. ac8: the decision and the new comments sent to the chat; the pane records the decision, the chat message is submitted by itself, it waits for a running turn and opens a closed chat (the recommended answers, accepted). The user ran the frame probe in VS Code and sent its result.`
- **[[c38]]** `doc` `docs/mocks/docs-review-pane.html` — "Mock of the reworked document viewer / approver pane (VS Code webview)."
- **[[c39]]** `prior-artifact` `Daemon reviews of revisions 1 and 2 of this LLD, 2026-10-13. Revision 1: block, 1 high and 5 medium (a message to a closed chat dropped; the chosen option's text out of step with the contract; no user lookup function to export; the waiting list missing a superseded turn, a followed turn and an approval follow-up; a decision on a document that is no longer pending; no carry-forward possible for a Define). Revision 2: block, 4 medium (the chat's session exists as soon as the panel is opened, so the wait must be for the webview's ready; the finalizers do write companion files; the single-entry append would drop the new fields; the closed-panel test).`
- **[[c40]]** `code` `src/workflow/artifacts/companion/render.ts:79-79` — "writeFileSync(destPath, html, 'utf8');"
- **[[c41]]** `code` `src/workflow/artifacts/provenance/tool.ts:39-39` — "additionalProperties: false,"
- **[[c42]]** `code` `src/workflow/artifacts/provenance/writer.ts:134-141` — "const entry: FeedbackEntry = {"
- **[[c43]]** `code` `vscode-plugin/src/chat/chat-panel.ts:1650-1651` — "channel.setHtml(renderShell());"
- **[[c44]]** `code` `vscode-plugin/src/chat/chat-panel.ts:1358-1364` — "case 'ready':"
- **[[c45]]** `code` `src/workflow/artifacts/provenance/schema.ts:23-28` — "export const FEEDBACK_PROPERTY_SCHEMA: Record<string, unknown> = {"

## 10. Open questions

- Should comments saved by the pane's earlier request-changes button, which are stored as resolved open questions, be shown in the new history? Recommended: no; they stay in the document's resolved questions.
- The frame was run in VS Code with one sequence-diagram companion. The other companion kinds (er-model, ux-mock, component-dependency, mocks) were not each run. Recommended: check one of each in the build's hand check; a page that does not draw still shows its path.
