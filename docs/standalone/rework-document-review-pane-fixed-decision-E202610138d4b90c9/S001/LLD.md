<!-- insrc:artifact LLD-8d4b90c9ab301e66-S001 -->

# LLD: E202610138d4b90c9:S001

## Summary

**Epic:** `rework-document-review-pane-fixed-decision`
**HLD base run:** `wf-1791889940143-a7v5d3`
**HLD effective hash:** `8d4b90c9ab30...`

The document review pane in VS Code is rebuilt around a comment panel that stays at the bottom while the document scrolls: a rounded box with a comment field and three round icon buttons for send feedback, reject and approve, in the VS Code theme's own colours. A reviewer can select text in a markdown document and comment on it; comments are drafts until one of the three buttons is pressed, which saves them all with the decision in one step, under the reviewer's git name and the time, in the artifact's own feedback list. Earlier comments stay with the document, are shown as margin markers that open on click, oldest first, and survive a revision; HTML documents that belong to an artifact open as the page itself. The decision and the new comments are also sent to the chat as a message, so the assistant can revise or move on.

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
appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult  // unchanged. New beside it in src/workflow/artifacts/provenance/writer.ts: appendFeedbackBatch(req: { artifactPath: string; entries: readonly (Omit<FeedbackEntry, 'id' | 'timestamp'>)[] }): { artifactPath: string; entryIds: string[]; total: number }  and  priorFeedback(jsonPath: string): FeedbackEntry[]
```

**Parameters:**
- `req.artifactPath: string` — The artifact JSON to append to; guarded under the artifact root as today.
- `req.entries: readonly Omit<FeedbackEntry, 'id' | 'timestamp'>[]` — The entries of one decision, in the order the reviewer made them. Each has author, target and comment, and may carry kind, anchor, decision and batchId.

**Returns:** `{ artifactPath: string; entryIds: string[]; total: number }` — appendFeedbackBatch validates every entry first (non-empty author and comment, as appendFeedback does), then reads the artifact once, gives each entry an id and the same timestamp, pushes them all onto body.feedback and writes the JSON once. Either all entries are written or none. priorFeedback returns body.feedback of the JSON at that path, or [] when the file is missing, unreadable or has none. The design finalizers in src/workflow/orchestrator.ts (finalizeDefine, finalizeDesignEpic, finalizeDesignStory, finalizeStandaloneLld, finalizePlan) put priorFeedback of the artifact they are about to replace into the new body before they render it, so a re-authored document keeps its comments.

**Errors:**
- `ArtifactFeedbackError` when The path is outside the artifact root, the JSON is missing or malformed, the list is empty, or any entry has a blank author or comment; nothing is written.

**Preconditions:**
- The artifact JSON exists under .insrc/artifacts or docs/

**Postconditions:**
- No key of the artifact other than body.feedback changes, and no existing entry is edited or removed
- The .md is not re-rendered by an append, as today
- A document re-authored through the workflow keeps every earlier feedback entry, in order
- appendFeedback and the 'artifact.feedback.append' IPC behave as before

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
handleArtifactContent(params: { repo?: string; mdPath?: string } | undefined, repoEnv: string | undefined): ArtifactReviewView | ArtifactContentError  // ArtifactReviewView gains: docPath: string; contentVersion: string; feedback?: readonly FeedbackEntry[]; reviewer: { name: string; source: 'git' | 'os' | 'unknown' }; state: 'pending' | 'approved' | 'rejected'
```

**Parameters:**
- `params.mdPath: string` — The artifact's .md under docs/, as today.
- `params.repo: string` _(optional)_ — The repository; falls back to the daemon's repo as today.

**Returns:** `ArtifactReviewView | ArtifactContentError` — The view as today plus five additive fields. docPath is the .md's repo-relative path. contentVersion is the first 16 hex characters of the SHA-256 of the markdown text returned. feedback is body.feedback as stored (absent when there is none). reviewer is the name comments would be saved under: git config user.name in the repo, else the OS login, else 'unknown', from the lookup in src/workflow/artifacts/companion/header.ts, which is exported for this. state is read from meta.approvedAt and meta.rejectedAt.

**Errors:**
- `ArtifactContentError` when As today: repo or mdPath missing, the path outside docs/, not a .md, unreadable, or its JSON unreadable.

**Postconditions:**
- Every existing field keeps its name, type and meaning, so the JetBrains plugin's reader is unaffected
- The feedback list is forwarded as stored: no entry is dropped, reordered or reshaped

### 2.4 `workflow.approve`

```typescript
'workflow.approve' is unchanged. New in the same handler map of src/daemon/index.ts: 'workflow.reviewDecision': (params: { repo?: string; mdPath: string; decision: 'approve' | 'reject' | 'feedback'; comments?: readonly ReviewDecisionComment[] }) => ReviewDecisionResult | { error: string }, delegating to handleReviewDecision in the new src/workflow/review-decision.ts.  ReviewDecisionComment = { comment: string; file?: string; version?: string; anchor?: FeedbackAnchor }.  ReviewDecisionResult = { artifactId: string; decision: 'approve' | 'reject' | 'feedback'; outcome: 'approved' | 'withheld' | 'rejected' | 'recorded'; reason?: string; recorded: number; entryIds: string[]; author: string; commentsError?: string }
```

**Parameters:**
- `mdPath: string` — The artifact's .md under docs/, resolved and guarded exactly as workflow.artifactContent does.
- `decision: 'approve' | 'reject' | 'feedback'` — The button the reviewer pressed.
- `comments: readonly ReviewDecisionComment[]` _(optional)_ — The new comments, in order. file is the repo-relative path of the document commented on (the .md, or an .html companion of this artifact) and defaults to the .md; version is the contentVersion the reviewer saw; anchor is present for an inline comment.
- `repo: string` _(optional)_ — The repository; falls back to the daemon's repo.

**Returns:** `ReviewDecisionResult | { error: string }` — The daemon validates the request, resolves the author once, then acts in a fixed order: the decision first, the comments second. approve calls the existing approveWorkflowTarget for this one artifact (and the existing follow-on for an approved bugfix issue, as 'workflow.approve' does); outcome is 'approved', or 'withheld' with the skip reason when the review gate holds it back. reject calls the existing rejectArtifactByJsonPath with the reason: the first whole-document comment if there is one, else 'Rejected in the review pane by <author>'; outcome is 'rejected'. feedback changes no state; outcome is 'recorded'. Then every comment is appended in one appendFeedbackBatch call with kind 'comment', the author, one batchId, and decision set to what happened: 'approve' or 'reject' when that took effect, 'feedback' for a feedback send and for an approval that was withheld. If the append fails after the decision took effect, the result still reports the outcome and carries commentsError, with recorded 0.

**Errors:**
- `{ error: string }` when repo or mdPath missing or failing the docs/ guard; an unknown decision; a comment that is blank, longer than 10,000 characters, or whose file is neither the .md nor a companion listed in the artifact's body; more than 200 comments; feedback with no comments; the artifact not being a pending one for approve or reject; or the approve or reject call throwing. In each of these nothing is written.

**Preconditions:**
- approve and reject need a pending artifact (no approvedAt, no rejectedAt); feedback is accepted in any state

**Postconditions:**
- A comment is never saved with a decision that did not take effect
- A decision with no comments writes no feedback entry
- The existing IPCs workflow.pending, workflow.artifactContent, workflow.approve, workflow.resolveComment and artifact.feedback.append keep their shapes and behaviour
- The author is decided by the daemon, never by the caller

### 2.5 `DocsReviewClient`

```typescript
interface DocsReviewClient { pending(): Promise<DocsArtifactSummary[]>; content(idOrPath: string): Promise<DocsContent>; decide(idOrPath: string, decision: ReviewDecision, comments: readonly ReviewDecisionComment[]): Promise<ReviewDecisionResult> }  // approve() and comment() are removed; DocsContent gains docPath, contentVersion, feedback, reviewer, state
```

**Parameters:**
- `idOrPath: string` — The artifact id, resolved to its .md path from the map pending() keeps, or a path.
- `decision: 'approve' | 'reject' | 'feedback'` — The button pressed.
- `comments: readonly ReviewDecisionComment[]` — The drafts and the whole-document comment.

**Returns:** `Promise<ReviewDecisionResult>` — decide calls 'workflow.reviewDecision' once and throws on the daemon's { error } arm, like the other methods. content forwards the five new view fields unchanged.

**Errors:**
- `Error` when The daemon answered { error } or the socket failed.

**Postconditions:**
- The pane no longer calls workflow.resolveComment or workflow.approve

### 2.6 `createDocsReviewHost`

```typescript
createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost  // DocsReviewHostDeps gains: notifyChat?: (text: string) => 'sent' | 'queued' | 'unavailable'; companionUri?: (relPath: string) => string | undefined; frameSource?: () => string. DocsReviewHost is unchanged (open, dispose, openArtifact).
```

**Parameters:**
- `deps.notifyChat: (text: string) => 'sent' | 'queued' | 'unavailable'` _(optional)_ — Hands a decision message to the chat. Absent means no chat message is sent.
- `deps.companionUri: (relPath: string) => string | undefined` _(optional)_ — The webview address of an HTML companion under the repo's docs/ folder, or undefined when it may not be shown.
- `deps.frameSource: () => string` _(optional)_ — The webview's own resource origin, for the frame-src directive of the shell's CSP.

**Returns:** `DocsReviewHost` — LAYOUT. The shell is a column the height of the pane: a header (a select of pending documents, the open document's kind and state, and one tab per document of the artifact: the markdown first, then each HTML companion by title), a scroll region that holds the document, a collapsed strip of comments on the whole document, and the comment panel. Only the scroll region scrolls. THEME. Every colour, font and border comes from --vscode-* variables. The --it-* tokens the body, functional-requirement, diagram and experience renderers already use are defined for this surface from --vscode-* variables, so those renderers are not rewritten; renderTerminalStyle is no longer used by this pane and there is no theme message or switch. VIEWERS. A markdown document is rendered as today (marked, the section chooser, the functional, diagram and experience slots). An HTML companion is shown in an iframe whose src is deps.companionUri(relPath) and whose sandbox attribute is 'allow-scripts' only; when companionUri is absent or returns undefined the tab shows the file's path and a line saying it cannot be shown here. COMMENTS. On a markdown document, selecting text inside one block shows a round comment button; pressing it wraps the selection in a mark and opens a thread card under that block with a field and round add and close buttons. An added comment is a draft: dashed underline, tagged 'draft, not sent', removable. Its anchor is { quote, sectionSlug, prefix, suffix }: the selected text, the slug of the nearest heading above it from the section index, and up to 40 characters of the block's text on each side. Saved entries with an anchor are placed by finding the quote in the current document (first in the anchor's section with the prefix and suffix, then in that section, then anywhere when it occurs once; the document's own Feedback section is never searched); a placed passage gets a mark and a margin marker with the count, and clicking either opens its thread, oldest first, each with author, time and decision. An entry whose quote is not found, and every entry without an anchor, is listed in the whole-document strip, oldest first; one whose target.version differs from the view's contentVersion is tagged 'on an earlier revision' and shows its quote. Comments on an HTML companion are whole-document comments with that file as target. Drafts and the whole-document field are kept per artifact in the webview's saved state, so hiding and showing the pane does not lose them. DECISION. The three buttons post one 'docs-decision' { artifactId, decision, comments } with every draft and the whole-document comment; send feedback with no comment is refused in the webview with a line of text. The host calls client.decide once, posts 'docs-decision-result' { artifactId, ok, outcome, recorded, message }, and on success re-reads the pending list and the document. The webview clears its drafts only on ok with no commentsError. A read-only open (not awaiting review) shows the history and offers send feedback only. CHAT. After a successful decide the host builds one message and calls deps.notifyChat: the decision and outcome, the artifact id, title and docPath, the reviewer, and the new comments numbered in order, each with its quote and section when it has them; with no comments the message is the decision line alone. The result line in the pane says whether the chat message was sent, is waiting for the running turn, or could not be sent.

**Errors:**
- `none thrown` when A failing decide, content or pending call is logged and shown as a line in the pane; drafts are kept. A failing or absent notifyChat never undoes a saved decision.

**Preconditions:**
- The channel's panel was created with scripts enabled and, for HTML companions, with the repo's docs/ folder among its local resource roots

**Postconditions:**
- The comment panel is visible at every scroll position of the document
- No colour in the shell is a literal or a terminal token value
- Nothing from an artifact reaches the DOM as markup except through the guarded markdown path that exists today; comments, authors and quotes are set as text
- The pane holds no saved state of its own besides unsent drafts
- The 'docs-list' and 'open-doc' messages and openArtifact behave as today

### 2.7 `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost  // ChatPanelHost gains: submitExternal(text: string): 'sent' | 'queued' | 'unavailable'
```

**Parameters:**
- `text: string` — A message to submit in the chat's current session as if the user had typed it.

**Returns:** `'sent' | 'queued' | 'unavailable'` — 'unavailable' when no agentic CLI is installed or the text is blank. Otherwise the chat panel is opened if it is closed (as open() does). If no turn of this host is running or waiting, the message is run at once through the same path a typed message takes (queued approvals are superseded, the user row is echoed and saved) and the answer is 'sent'. If a turn is running, the message is put on a first-in first-out list and the answer is 'queued'; when that turn reaches its end, errors or is stopped, the next waiting message is run, in the session that is active then. The list lives in memory only and is dropped when the panel is disposed.

**Postconditions:**
- A message from another pane never supersedes a running turn
- Messages typed by the user behave as today, including superseding a running turn
- extension.ts passes notifyChat: (text) => chatHost.submitExternal(text) to createDocsReviewHost; the two hosts still do not import each other

## 3. Data model changes

### 3.1 `FeedbackEntry` — field-add

Three optional fields. anchor?: FeedbackAnchor = { quote: string (the selected text, at most 500 characters); sectionSlug?: string; prefix?: string; suffix?: string (at most 40 characters each) } marks an inline comment. decision?: 'approve' | 'reject' | 'feedback' is the decision the entry was saved with. batchId?: string is shared by the entries of one decision. The existing target.file holds the repo-relative path of the document commented on and the existing target.version holds the contentVersion the reviewer saw. Entries written before this change have none of the new fields and stay valid. The JSON schema in provenance/schema.ts and coerceRequest in provenance/tool.ts accept the new fields.

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

### 3.2 `ArtifactReviewView` — field-add

docPath, contentVersion, feedback?, reviewer and state are added; every existing field is unchanged. DocsContent in the plugin mirrors them by indexing the daemon type, as it does for the structured records.

```
ArtifactReviewView { artifactId; kind; renderedMarkdown; openQuestions; approvable; blockReason?; functionalDefinition?; erDefinition?; sequenceDefinition?; uxDefinition?; companions?; + docPath: string; + contentVersion: string; + feedback?: readonly FeedbackEntry[]; + reviewer: { name; source }; + state: 'pending' | 'approved' | 'rejected' }
```

**Call sites:**
- `src/workflow/artifact-content.ts`
- `vscode-plugin/src/chat/docs-review-client.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`

### 3.3 `Webview protocol of the review pane (vscode-plugin/src/chat/protocol.ts)` — field-modify

'docs-decision' changes from { artifactId, accept, note? } to { artifactId, decision: 'approve' | 'reject' | 'feedback', comments: { comment; file?; version?; anchor? }[] }. 'docs-content' gains docPath, contentVersion, feedback, reviewer, state and documents: { title; type: 'markdown' | 'html'; relPath?; uri? }[]. A new host message 'docs-decision-result' { artifactId, ok, outcome?, recorded?, message } is added to the kind list. The 'theme' message is no longer posted to this pane. The webview and the host ship in one plugin build, so there is no mixed-version case.

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
  - Response: The result carries the outcome and commentsError with recorded 0; the host reports ok with the error text, and the webview keeps the drafts
  - User impact: The pane says the document was approved (or rejected) and that the comments were not saved; pressing send feedback sends them again, which is allowed in any state
- **The artifact was approved or rejected elsewhere while the pane had it open** (recoverable)
  - Detection: handleReviewDecision reads meta.approvedAt and meta.rejectedAt before acting and finds one set for an approve or reject
  - Response: { error } naming the state; nothing is written; the host re-reads the pending list and the document
  - User impact: A line says the document is no longer awaiting review; the drafts stay and can be sent as feedback
- **A comment names a file that is not this artifact's document** (recoverable)
  - Detection: handleReviewDecision compares each comment's file with the .md's repo-relative path and the relPath of each companion in the artifact's body
  - Response: { error } naming the file; nothing is written
  - User impact: None in normal use: the pane only sends the paths the view gave it
- **The chat cannot take the message** (recoverable)
  - Detection: notifyChat is absent, throws, or answers 'unavailable'
  - Response: The host catches a throw and logs it; the decision and the comments stay saved; the result line says the chat message was not sent
  - User impact: The decision is recorded; the assistant is not told, and the user can tell it in the chat
- **The chat panel is disposed while a message is waiting for a running turn** (recoverable)
  - Detection: The host's dispose path runs with a non-empty list
  - Response: The list is dropped and a warning is logged with the number of messages dropped
  - User impact: The decision is saved; the assistant is not told
- **An HTML companion cannot be shown** (recoverable)
  - Detection: companionUri is absent or returns undefined (the path is not an .html file under the repo's docs/ folder), or the frame's load event does not arrive within five seconds
  - Response: The tab shows the file's repo-relative path and a line saying it cannot be shown in this pane
  - User impact: The reviewer can still comment on that document as a whole and open the file from the explorer
- **The markdown renderer fails for a document** (recoverable)
  - Detection: renderMarkdownBody reports a degradation, as today
  - Response: The body is shown as plain text with the existing notice; inline comment selection is turned off for that document and saved inline comments are listed in the whole-document strip with their quotes
  - User impact: The document is readable and whole-document comments still work
- **The stored feedback list holds an entry the pane cannot read** (recoverable)
  - Detection: The webview checks each entry for a string author, timestamp and comment before drawing it
  - Response: That entry is skipped and the strip's summary line says how many entries could not be shown
  - User impact: The other comments are shown
- **The git user cannot be read** (recoverable)
  - Detection: The lookup's git call fails or returns an empty name
  - Response: The OS login is used; if that also fails the author is 'unknown' and reviewer.source says so
  - User impact: The panel shows the name comments will be saved under before anything is sent

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Approve or reject with no drafts and an empty whole-document field | One call with an empty comments list; the decision is recorded, no feedback entry is written, and the chat message is the decision line alone |
| Send feedback with no comment | Refused in the webview with a line of text; no message is posted to the host |
| A selection that crosses two blocks, or lies in the Feedback section or in a thread card | No comment button is offered |
| The same quote occurs several times in a section | The prefix and suffix pick the occurrence; if they no longer match, the first occurrence in that section is used |
| A saved inline comment whose quote is gone after a revision | Listed in the whole-document strip, tagged 'on an earlier revision', with its quote, author, time and decision |
| A revision that leaves a commented passage unchanged | The comment is placed on the passage again and is not tagged as earlier |
| Two selections that overlap an existing mark | A selection that would cut through an existing mark is not offered a comment button; a selection wholly inside one opens that thread |
| A document with 300 saved comments | All are placed or listed; the strip scrolls inside its own height and the comment panel stays visible |
| A document re-authored through the workflow | Its feedback list is carried into the new JSON in the same order and its Feedback section is rendered from it |
| A reviewer presses a second button before the first answer arrives | The three buttons are disabled from the press until 'docs-decision-result' arrives |
| The pane is hidden and shown again with drafts | The drafts and the whole-document field are restored from the webview's saved state for that artifact |
| A decision is sent while a chat turn is running, then another | Both messages wait and are run one after the other, in order, after the turn ends |
| An artifact kind with no feedback field in its type (SPEC, ISSUE, CR) | Comments are saved in body.feedback of its JSON all the same; its .md shows them only if that kind's renderer has a Feedback section |
| A read-only open of an approved document | History is shown; send feedback is offered; approve and reject are not |

**Invariants to preserve**

- workflow.pending, workflow.artifactContent, workflow.approve and workflow.resolveComment keep their request and response shapes, which the JetBrains plugin and the CLI read [[c1]]
- appendFeedback is append-only: it never edits or removes an entry and touches no key but body.feedback [[c3]]
- An artifact with no feedback renders with no Feedback section, and existing entries render as they do today [[c2]]
- An artifact is pending only while meta.approvedAt and meta.rejectedAt are both absent, and a rejected DEF, LLD or PLAN stops its downstream stages [[c3]]
- The review view accepts only a .md that resolves under docs/ [[c3]]
- The pane's shell is one inline script under a nonce CSP with no remote origin, and artifact text reaches the DOM as text [[c4]]
- The functional-requirement, diagram and experience renderers of the pane keep working, drawing only from --it-* variables [[c4]]
- A message the user types in the chat supersedes a running turn as today [[c4]]
- The delivery board opens an artifact in the pane through openArtifact({ artifactId, mdPath }) [[c4]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx; tests sit in __tests__ beside the code (*.test.ts), in src/ for the daemon and in vscode-plugin/src/ for the plugin. Webview scripts are run in a fake DOM as the existing pane and chat shell tests do.`

**Test levels**

- **unit** — The feedback record: the batch append, the carry-forward helper, the renderer and the accepted shape.
  - Subjects: `feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid`, `feedback: an entry with an anchor, a decision and a batchId is accepted by the schema and by coerceRequest, and an entry without them is still valid`, `feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically`, `feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact`
  - Fixtures: `A temporary artifact JSON under a .insrc/artifacts folder`
- **unit** — The review decision core in the daemon, over temporary artifacts and injected approve, reject and author functions.
  - Subjects: `review decision: approve approves first and then saves the comments with decision approve; a withheld approval saves them as feedback and reports the reason`, `review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject`, `review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused`, `review decision: a decision with no comments writes no feedback entry`, `review decision: an invalid request (unknown decision, blank or over-long comment, a file that is not the artifact's document, too many comments, a non-pending artifact for approve or reject) answers an error and writes nothing`, `review decision: a failing comment write after the decision took effect reports the outcome with commentsError`, `review decision: the author is the git user name, else the OS login, else unknown, and is never taken from the request`
  - Fixtures: `Temporary repository folder with docs/ and .insrc/artifacts holding a pending artifact and its .md`
- **unit** — The review view's new fields.
  - Subjects: `review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion`
- **contract** — The daemon's handler map and the shapes other clients read.
  - Subjects: `daemon handlers: 'workflow.reviewDecision' is registered and delegates to handleReviewDecision, and the 'workflow.approve', 'workflow.resolveComment' and 'artifact.feedback.append' handlers are unchanged`, `plugin protocol: 'docs-decision-result' is a host message, and 'docs-decision' carries a decision and a comments list`
- **integration** — Re-authoring keeps comments: the design finalizers carry the stored feedback into the new artifact.
  - Subjects: `finalize: a re-authored DEF, HLD, LLD and PLAN each keep the feedback entries of the artifact they replace, in order, and render them in the Feedback section; a first authoring has none`
  - Fixtures: `A prior artifact JSON with two feedback entries at the path the finalizer writes`
- **unit** — The plugin's client and the chat host's new method.
  - Subjects: `docs review client: decide calls 'workflow.reviewDecision' once with the resolved .md path and throws on the error arm; content forwards the new view fields`, `chat host: submitExternal runs the message at once when no turn is running, queues it behind a running turn and runs queued messages in order when the turn ends, errors or is stopped`, `chat host: submitExternal opens a closed panel, answers unavailable with no CLI or blank text, never supersedes a running turn, and drops its list on dispose with a warning`
- **integration** — The pane's host over a fake client and a fake channel.
  - Subjects: `docs review host: a docs-decision calls decide once with every comment, posts docs-decision-result, re-reads the list and the document, and hands the chat one message with the decision and the numbered comments`, `docs review host: a decision with no comments sends the chat the decision line alone`, `docs review host: a failing decide posts a failed result, sends no chat message and keeps the open document`, `docs review host: a withheld approval and a commentsError are each reported in the result and in the chat message`, `docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion with its webview address`, `docs review host: an absent, throwing or unavailable notifyChat leaves the decision recorded and says so in the result`
- **integration** — The pane's webview script in a fake DOM.
  - Subjects: `docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch`, `docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button`, `docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing`, `docs review shell: drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored from the saved state when the shell is rebuilt`, `docs review shell: saved inline entries are placed on their quotes with a margin marker and count and open oldest first; an entry whose quote is gone is listed as on an earlier revision; entries without an anchor are listed in the whole-document strip in time order`, `docs review shell: an HTML document is shown in a frame with sandbox allow-scripts and the given address, and a document without an address shows its path and a line of text`, `docs review shell: author, comment and quote text are set as text, never as markup`, `docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw`
  - Fixtures: `The fake DOM helper the existing shell tests use, extended with a selection and a range`
- **smoke** — What a fake DOM cannot show, checked in a real browser and in VS Code.
  - Subjects: `Headless Chrome render of the real shell with a long document: the comment panel stays in view at the top and at the bottom of the scroll, and a screenshot matches the approved mock's layout`, `By hand in VS Code with a light and a dark theme: the pane follows the theme, an HTML companion with scripts is shown in its tab, an inline comment and a whole-document comment sent with reject are saved under the git user and appear in the chat as one message, and they are shown as history when the document is opened again`, `By hand in VS Code: a decision sent while a chat turn is running is delivered after that turn ends`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch`, `Headless Chrome render of the real shell with a long document: the comment panel stays in view at the top and at the bottom of the scroll, and a screenshot matches the approved mock's layout` |
| `ac2` | `docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch`, `By hand in VS Code with a light and a dark theme: the pane follows the theme, an HTML companion with scripts is shown in its tab, an inline comment and a whole-document comment sent with reject are saved under the git user and appear in the chat as one message, and they are shown as history when the document is opened again` |
| `ac3` | `docs review shell: an HTML document is shown in a frame with sandbox allow-scripts and the given address, and a document without an address shows its path and a line of text`, `docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion with its webview address`, `docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw` |
| `ac4` | `docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button` |
| `ac5` | `docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing`, `docs review host: a docs-decision calls decide once with every comment, posts docs-decision-result, re-reads the list and the document, and hands the chat one message with the decision and the numbered comments`, `review decision: a decision with no comments writes no feedback entry`, `review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject` |
| `ac6` | `review decision: the author is the git user name, else the OS login, else unknown, and is never taken from the request`, `feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid` |
| `ac7` | `docs review shell: saved inline entries are placed on their quotes with a margin marker and count and open oldest first; an entry whose quote is gone is listed as on an earlier revision; entries without an anchor are listed in the whole-document strip in time order`, `finalize: a re-authored DEF, HLD, LLD and PLAN each keep the feedback entries of the artifact they replace, in order, and render them in the Feedback section; a first authoring has none`, `review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion` |
| `ac8` | `docs review host: a decision with no comments sends the chat the decision line alone`, `chat host: submitExternal runs the message at once when no turn is running, queues it behind a running turn and runs queued messages in order when the turn ends, errors or is stopped`, `chat host: submitExternal opens a closed panel, answers unavailable with no CLI or blank text, never supersedes a running turn, and drops its list on dispose with a warning`, `By hand in VS Code: a decision sent while a chat turn is running is delivered after that turn ends` |

## 7. Migration

**State before:** The review pane lays out its list, document, note box and buttons in page flow, in the chat's terminal style, so the controls come after the whole document (analyze bundle 4). Approve calls workflow.approve; request changes calls workflow.resolveComment with an empty anchor, which turns the note into a resolved open question, and is offered only for DEF, HLD and LLD (bundles 1 and 4). The artifact JSON has a feedback list with author, time, target and comment, appended one entry at a time through artifact.feedback.append; the review view does not return it, nothing carries it into a re-authored artifact, and a reject exists only as a function the CLI calls (bundles 2 and 3). The chat host can be given a message only by its own webview, and a new message supersedes a running turn (bundle 4).

**State after:** The pane is a column with a fixed comment panel under one scrolling document, in VS Code theme variables, with one tab per document of the artifact (the markdown and each HTML companion in a sandboxed frame). A reviewer drafts inline and whole-document comments and sends them with approve, reject or send feedback through one daemon call, workflow.reviewDecision, which records the decision and then appends the comments to body.feedback with the author the daemon resolves, an anchor for inline comments, and the decision that took effect. The review view returns the feedback list, a content version, the reviewer and the state; the pane shows saved comments on their passages or in a strip, oldest first. Re-authoring an artifact carries its feedback forward. After a decision the pane hands the chat host a message through submitExternal, which waits for a running turn. The older IPCs and the feedback entries already saved are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional anchor, decision and batchId fields to the feedback entry's type, schema, request coercion and renderer, and add the batch append and the prior-feedback helper — ↩ rollbackable
2. Carry the stored feedback into the new body in the five design finalizers — ↩ rollbackable
3. Add docPath, contentVersion, feedback, reviewer and state to the review view and export the user lookup — ↩ rollbackable
4. Add the review decision core and register the 'workflow.reviewDecision' handler — ↩ rollbackable
5. Add submitExternal and its waiting list to the chat host — ↩ rollbackable
6. Replace approve and comment in the plugin's review client with decide, change the 'docs-decision' message, add 'docs-decision-result', and move the host to the one call and the chat message — ↩ rollbackable
7. Rebuild the pane's shell: the column layout, the theme variables, the document tabs and frame, the comment panel, inline comments and the history; wire notifyChat, companionUri and the panel's local resource root in extension.ts — ↩ rollbackable
8. Update the daemon (push, update, restart) before installing the plugin build, then install the plugin and check by hand — ↩ rollbackable

**Backward compat:** Every change to a shape other clients read is additive and optional: the three new fields of a feedback entry, the five new fields of the review view, and one new IPC method. workflow.pending, workflow.artifactContent, workflow.approve, workflow.resolveComment and artifact.feedback.append keep their requests, responses and behaviour, so the JetBrains plugin, the CLI and the MCP tools are unaffected. Feedback entries already saved stay valid and render as before. Comments saved from the pane's earlier request-changes button remain where they were written, as resolved open questions; they are not converted. The plugin's webview protocol changes inside one plugin build. A plugin newer than its daemon gets an unknown-method error on a decision and shows it without saving anything, so the daemon is updated first. Rolling back the plugin or the daemon leaves the saved entries in place; an older reader ignores the fields it does not know.

## 8. Alternatives considered

### 8.1 a1: One review-decision call in the daemon over the existing feedback record — **CHOSEN**

A new IPC takes the decision and all new comments together; the daemon stamps the author, appends them to body.feedback and then approves or rejects.

FeedbackEntry gains three optional fields: anchor { quote, sectionSlug?, blockText? } for an inline comment, decision ('approve' | 'reject' | 'feedback') and batchId, and the existing target.version is filled with a content hash of the document the comment was made on. A new IPC workflow.reviewDecision { repo, mdPath, decision, comments[] } resolves the artifact as workflow.artifactContent does, resolves the author in the daemon (git user.name, else OS login), appends every comment in one write through a new appendFeedbackBatch in provenance/writer.ts, and only then calls the existing approve or reject function; it answers { decision, recorded, entries, approved?, skipped?, rejectedAt? }. The review view (ArtifactReviewView) gains feedback, contentVersion and reviewer. A second new IPC workflow.companionContent reads one HTML companion of an artifact under docs/. In the plugin the pane sends one docs-decision message with the drafts, the host calls the one IPC, re-reads the view, and hands a text summary to an injected notifyChat seam that extension.ts wires to a new chat host method which queues the message behind a running turn. workflow.resolveComment and artifact.feedback.append stay unchanged for their current callers.

### 8.2 a2: The plugin composes existing calls

The pane's host calls artifact.feedback.append once per comment, then workflow.approve or a thin new workflow.reject, and resolves the author itself.

FeedbackEntry gains the same optional anchor and decision fields, accepted by the existing artifact.feedback.append. The plugin's host resolves the author by running git config user.name in the workspace (else the OS user), appends each comment with one IPC call each, and then calls workflow.approve or a new workflow.reject that wraps rejectArtifactByJsonPath. The review view gains feedback so the pane can show history. The chat message is sent as in a1.

**Rejected because:** Cheaper, but it is partial on the two requirements that concern what is saved.

### 8.3 a3: A separate comments file per artifact

Review comments go to a new sidecar file beside the artifact JSON, with their own read and write calls.

A new file .insrc/artifacts/COMMENTS-<artifactId>.json holds review threads: each thread an anchor and a list of comments with author, time and decision. New IPCs workflow.comments.list and workflow.comments.submit read and write it; the decision is recorded as in a1. body.feedback is left as it is for the notes agents write.

**Rejected because:** Works but ignores the record that exists and costs the most.

## 9. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: Modules and callers of the review flow: the daemon's review IPCs, the plugin's review pane, the chat host.`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: Callers of appendFeedback, rejectArtifactByJsonPath, handleArtifactContent and feedbackBodyLines; sites that name FeedbackEntry or the artifact.feedback.append IPC.`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: Behaviour of the functions the Story changes or calls, read in the source.`
- **[[c4]]** `analyze-bundle` `s1.analyzeBundles[3]: The review pane and the chat host as built.`
- **[[c5]]** `code` `src/workflow/artifacts/provenance/writer.ts:117-150` — "export function appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult {"
- **[[c6]]** `code` `src/workflow/artifacts/provenance/types.ts:37-42` — "export interface FeedbackEntry extends ProvenanceAuthorship {"
- **[[c7]]** `code` `src/workflow/artifacts/format/bindings.ts:81-89` — "export function feedbackBodyLines(feedback: FeedbackRecord | undefined): string[] {"
- **[[c8]]** `code` `src/workflow/artifact-content.ts:142-214` — "export function handleArtifactContent("
- **[[c9]]** `code` `src/workflow/gates.ts:971-990` — "export function rejectArtifactByJsonPath(jsonPath: string, reason: string): RejectionResult {"
- **[[c10]]** `code` `src/daemon/index.ts:638-652` — "'workflow.approve': async (params) => {"
- **[[c11]]** `code` `src/daemon/index.ts:609-619` — "'artifact.feedback.append': async (params) => {"
- **[[c12]]** `code` `src/workflow/artifacts/companion/header.ts:127-141` — "function defaultGitUserName(repoPath: string): string | undefined {"
- **[[c13]]** `code` `src/workflow/pending.ts:128-128` — "if (typeof meta['rejectedAt'] === 'string' && meta['rejectedAt'].length > 0) continue;"
- **[[c14]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:42-55` — "export interface DocsReviewClient {"
- **[[c15]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1220-1220` — "export function createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost {"
- **[[c16]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:28-28` — "const COMMENTABLE_KINDS = new Set(['DEF', 'HLD', 'LLD']);"
- **[[c17]]** `code` `vscode-plugin/src/chat/chat-panel.ts:124-135` — "export interface ChatPanelHost {"
- **[[c18]]** `code` `src/workflow/orchestrator.ts:2312-2312` — "async function finalizeStandaloneLld("
- **[[c19]]** `code` `src/workflow/artifacts/companion/types.ts:29-36` — "export interface CompanionArtifactRef {"
- **[[c20]]** `code` `src/workflow/resolve-comment.ts:132-132` — "export function handleResolveComment("
- **[[c21]]** `code` `vscode-plugin/src/extension.ts:668-672` — "const reviewHost = createDocsReviewHost({"
- **[[c22]]** `code` `src/workflow/artifacts/provenance/schema.ts:59-60` — "export const FEEDBACK_NEVER_AUTHOR_RULE ="
- **[[c23]]** `code` `src/workflow/artifacts/provenance/tool.ts:85-85` — "export function coerceRequest(input: ToolInput): AppendFeedbackRequest {"
- **[[c24]]** `code` `src/workflow/gates.ts:826-826` — "export async function approveWorkflowTarget("
- **[[c25]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:1611-1611` — "const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c26]]** `code` `src/workflow/orchestrator.ts:385-385` — "export async function finalizeArtifact("
- **[[c27]]** `stakeholder` `User request and decisions in chat, 2026-10-13: the seven requirements; the VS Code theme only with no light/dark switch; the comment panel styled like the chat panel with round icon-only buttons; the decision and new comments sent to the chat, with no comments only the decision; the artifact JSON to hold the comments; the recommended answers accepted (the pane records the decision, the chat message is submitted by itself, it waits for a running turn and opens a closed chat).`
- **[[c28]]** `doc` `docs/mocks/docs-review-pane.html` — "Mock of the reworked document viewer / approver pane (VS Code webview)."

## 10. Open questions

- Can a VS Code webview show a repository HTML file that carries its own scripts (the diagram companions are about 3 MB with inline scripts) inside a frame with sandbox 'allow-scripts', addressed through the webview's resource address? This was not run. Recommended: try it first in the build; if it does not work, show the file's path with a control that opens it in the system browser.
- Should comments saved by the pane's earlier request-changes button, which are stored as resolved open questions, be shown in the new history? Recommended: no; they stay in the document's resolved questions.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**6 do not hold · 3 could not be verified · 6 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T11:22:10.978Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | submitExternal can open a closed chat panel and run the message at once, answering 'sent'. | open() (chat-panel.ts:1655-1662) only creates and wires the channel. The session is created later, in postInitialState, which runs when the webview posts 'ready' (:1358-1363, :631 `if (session === undefined) session = deps.store.draft(available[0]!)`). The typed-message path the design reuses drops the message when there is no session: submitTurn :1289 `if (session === undefined) return;` and runTurn :1129 `if ((typed === '' && files.length === 0) \|\| session === undefined) return;`. So on a panel that was closed, 'run at once through the same path a typed message takes' silently discards the message while submitExternal answers 'sent' and the pane reports the chat message as sent. [files: vscode-plugin/src/chat/chat-panel.ts] | Specify that a message submitted before the webview's 'ready' is put on the waiting list and run from postInitialState once the session exists (answer 'queued'), and add a test: submitExternal on a never-opened host delivers the message after 'ready'. |
| coverage-of-intent | MED | The chosen alternative (8.1 a1) describes the design that section 2 specifies. | 8.1 says the daemon 'appends every comment in one write ... and only then calls the existing approve or reject function', adds 'A second new IPC workflow.companionContent', an anchor of '{ quote, sectionSlug?, blockText? }', a view gaining three fields, and a result '{ decision, recorded, entries, approved?, skipped?, rejectedAt? }'. Section 2.4 says the opposite order ('the decision first, the comments second', postcondition 'A comment is never saved with a decision that did not take effect'), has no companionContent IPC (HTML is shown through companionUri in an iframe), an anchor of { quote, sectionSlug, prefix, suffix }, five view fields, and a different result shape. [files: .insrc/artifacts/LLD-8d4b90c9ab301e66-S001.json] | Rewrite 8.1 to match sections 2.3-2.6 and 3.1 (decision first, no workflow.companionContent, prefix/suffix anchor, the ReviewDecisionResult shape), so a builder reading the chosen option does not implement the comments-first order. |
| new-versus-reuse | MED | src/workflow/artifacts/companion/header.ts has a user lookup (git user.name, else OS login, else 'unknown') that can be exported and gives the reviewer's name and source. | There is no lookup function. header.ts:127-141 has two private helpers, defaultGitUserName(repoPath) and defaultOsUserName(); the three-step fallback is written inline inside resolveCompanionHeader (:87-89): `user: nonEmpty((deps.gitUserName ?? defaultGitUserName)(input.repoPath)) ?? nonEmpty((deps.osUserName ?? defaultOsUserName)()) ?? 'unknown'`. It yields a name only; nothing reports which step answered, which the design's reviewer.source ('git' \| 'os' \| 'unknown') needs. The git call returns the raw output with its newline; trimming is done by the private nonEmpty. [files: src/workflow/artifacts/companion/header.ts] | State that a new function is extracted (for example resolveReviewer(repoPath, deps?) returning { name, source }), that resolveCompanionHeader calls it so the two cannot drift, and list header.ts as a change site with a test that the companion header's user is unchanged. |
| change-sites | MED | A queued external message is run 'when that turn reaches its end, errors or is stopped', and never collides with another turn. | Three exits are not covered. (1) A turn superseded by a typed message gets no terminal callback: turn-lifecycle.ts:222-227 'the generation bump stops the previous loop reporting', and the test at turn-lifecycle.test.ts:219 asserts 'the dropped turn is told nothing more'; a message waiting behind that turn is never released unless it re-attaches to the newer turn. (2) The lifecycle exposes no 'running or waiting' state, only `live`, 'once its first event arrived' (turn-lifecycle.ts:87-88), and a turn followed after a reload (followLiveTurn, chat-panel.ts:595-620) ends through onEnd, not onTerminal. (3) onTerminal itself starts a turn: chat-panel.ts:1247-1248 calls runCompletedBatch(), which does `void runTurn(prompt, approvals.grantChain(), { suppressEcho: true })` (:550); a queued message run at the same end supersedes that approval follow-up, or is superseded by it. A chat switch (invalidate/detach) while a message waits is also unstated beyond 'in the session that is active then'. [files: vscode-plugin/src/chat/chat-panel.ts, vscode-plugin/src/chat/turn-lifecycle.ts] | Define the host's own in-flight flag (set in runTurn and followLiveTurn, cleared on onTerminal, onError, onEnd, stop and detach), say that a superseding typed turn inherits the waiting list, and order the drain after runCompletedBatch's follow-up (the follow-up counts as a running turn). Add tests for a superseded turn and for a turn that ends with an approved batch. |
| change-sites | MED | The host can call client.decide (and re-read the document) for an artifact that is not in the pending list: a read-only open, or a document just approved or rejected. | The client resolves ids only from the pending list: docs-review-client.ts:76-77 `resolvePath = (idOrPath) => mdPathById.get(idOrPath) ?? idOrPath`, and pending() does `mdPathById.clear()` then refills with pending artifacts only (:85-88). After an approve or reject the host 're-reads the pending list and the document', so the id no longer resolves and the bare artifact id is sent as mdPath, which the daemon refuses ('mdPath must resolve under docs/'). The same hits the design's stated recovery ('pressing send feedback sends them again, which is allowed in any state') and 'a read-only open ... offers send feedback'. The host today also drops any decision for a non-pending id: docs-review-panel.ts:1799 `if (!pending.has(msg.artifactId)) { ... void refreshPending(); return; }`, and a read-only open is given its path only once, as openDoc's `opts.path` (:1299). [files: vscode-plugin/src/chat/docs-review-client.ts, vscode-plugin/src/chat/docs-review-panel.ts] | State that the host keeps the docPath of the open document (from the view's new docPath) and passes that path to decide() and to the re-read, and that the pending.has guard applies to approve and reject only. Add host tests: feedback on a read-only open, and the re-read after an approve. |
| change-sites | MED | The five design finalizers can put priorFeedback 'of the artifact they are about to replace' into the new body, for DEF, HLD, LLD and PLAN. | For HLD, LLD and PLAN the id comes from params (epicHash, storyId), so a re-run writes the same path and the carry-forward is workable; the finalizers are pure (they return renderedJson; the write is in synthesize.ts:82-83 and workflow-rpc.ts:334), so they must compute the path themselves with the *ArtifactPaths helpers imported at orchestrator.ts:116. For DEF it does not work: finalizeDefine mints the identity from the run, orchestrator.ts:1190 `const epicHash = computeEpicHash(runId);` and hash.ts:36-40 hashes the run id, so a re-authored Define is a new DEF-<hash>.json and there is no artifact 'about to be replaced' to read. The integration test passes only because its fixture is placed 'at the path the finalizer writes'. finalizeDefineExtend (orchestrator.ts:1255), which does rewrite an existing Define, is not in the list of five. [files: src/workflow/orchestrator.ts, src/daemon/steps/workflow-step/phases/synthesize.ts, src/workflow/hash.ts] | Either drop DEF from the carry-forward claim and its test, or say how a re-authored Define finds its predecessor. Say whether finalizeDefineExtend preserves body.feedback when it rewrites the Define, and name the path helper each finalizer uses to locate the prior JSON. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | Each upstream acceptance criterion (ac1..ac8) and stakeholder decision is designed, and no non-goal is built. | The Story is standalone (meta.standalone true, no DEF/HLD). I searched .insrc/artifacts/LLD-8d4b90c9ab301e66-S001.json for the criteria text: it holds only `acceptanceMapping` with ids ac1..ac8 (lines 623-677), no criterion statements and no nonGoals/specHash. The only statement of intent is citation c27 (chat decisions, 2026-10-13); each decision it names (VS Code theme only, round icon-only buttons, decision + new comments sent to chat, decision alone when no comments, artifact JSON holds the comments, wait for a running turn, open a closed chat) has a matching part in sections 2.4-2.7. The wording of ac1..ac8 itself could not be read anywhere, so one-to-one coverage is unconfirmed. | Record the text of ac1..ac8 (or the seven requirements of c27) in the LLD so the mapping in section 6 can be checked against statements, not ids. |
| data-compatibility | The five additive fields on ArtifactReviewView leave the JetBrains plugin's reader unaffected. | The TypeScript side is additive (artifact-content.ts:50-78 already carries optional additive fields under the same rule). On the Kotlin side I found the DTO (jetbrains-plugin/.../daemon/DaemonGateway.kt:73 `data class ArtifactReviewViewDto(`) but a search of that file for Gson, ObjectMapper, `Json {`, ignoreUnknownKeys and FAIL_ON_UNKNOWN_PROPERTIES found nothing, so I could not confirm how the reply is deserialized or that unknown keys are ignored. | Check the artifactContent parser in DaemonGateway.kt (near line 1525) for unknown-key tolerance and cite it in the invariant, or add a Kotlin test with the five new keys in the reply. |
| error-paths | An HTML companion that cannot be shown is detectable: companionUri absent or undefined, or the frame's load event not arriving within five seconds. | The shell's CSP today is `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';` (docs-review-panel.ts:1611), so the frame-src addition is required and is designed. The panel is created with `{ enableScripts: true }` only (extension.ts:671), so the local resource roots are VS Code's defaults. Whether a sandboxed iframe can load a webview resource address at all was not run (the design's own open question 1), and I could not run it either. The detection is doubtful on its own terms: a frame that is refused or fails to fetch usually still fires load on an error document, so 'no load within five seconds' may never trigger and the tab would show a blank frame. | Run the probe before the build starts, as the open question recommends. If the frame is kept, detect failure by something the companion page reports (not possible under sandbox 'allow-scripts' without a message handshake) or fall back to the path line by default; state which. |
