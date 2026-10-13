<!-- insrc:artifact PLAN-8d4b90c9ab301e66-S001 -->

# Plan: E202610138d4b90c9:S001

## Summary

**Epic:** `rework-document-review-pane-fixed-decision`
**LLD run:** `wf-1791891861132-94mwxv`
**LLD effective hash:** `1db9389dad06...`

The build goes from the daemon outward. First the saved feedback entry learns to carry an inline anchor and a decision, comments survive a re-authoring, and one new daemon call records a decision with its comments. Then the chat learns to take a message from another pane and hold it until it can run, and the review pane's host moves to that one call. Last the pane's shell is rebuilt in four steps (fixed comment panel and theme, document tabs, inline drafts, comment history), wired up, and checked in a browser and by hand in VS Code.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Give the feedback entry an anchor, a decision and a batch id, and add the batch append | M | — | unit: feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid; unit: feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before; unit: feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid; unit: feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically; unit: feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact | [[c1]] [[c2]] [[c8]] |
| 2 | **`t2`** Keep a document's comments when it is re-authored | S | `t1` | integration: finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none; integration: finalize: the prior artifact JSON is byte-identical after the finalizer has run | [[c1]] [[c9]] |
| 3 | **`t3`** Extract the reviewer lookup and add the new fields to the review view | S | `t1` | unit: reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs; unit: review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion | [[c3]] [[c8]] |
| 4 | **`t4`** Add the review decision call to the daemon | M | `t1`, `t3` | unit: review decision: approve approves first and then saves the comments with decision approve; a withheld approval saves them as feedback and reports the reason; unit: review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject; unit: review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused; unit: review decision: a decision with no comments writes no feedback entry; unit: review decision: an invalid request (unknown decision, blank or over-long comment, a file that is not the artifact's document, too many comments, a non-pending artifact for approve or reject) answers an error and writes nothing; unit: review decision: a failing comment write after the decision took effect reports the outcome with commentsError; unit: review decision: the author is the one resolveReviewer gives and is never taken from the request; unit: daemon handlers: 'workflow.reviewDecision' is registered and delegates to handleReviewDecision, and the 'workflow.approve', 'workflow.resolveComment' and 'artifact.feedback.append' handlers are unchanged | [[c4]] [[c9]] |
| 5 | **`t5`** Let the turn lifecycle say whether a turn is in progress, and report a failed follow | S | — | unit: turn lifecycle: busy is true while a started turn waits, sets up or is read and while a follow is read; false after the terminal event is handed over, after a follow ends, after stop and detach, and when follow returns without following; a superseding turn keeps it true; unit: turn lifecycle: a follow whose resume fails calls its end callback exactly once, and busy is false when it is called | [[c7]] [[c12]] |
| 6 | **`t6`** Let another pane hand the chat a message that waits its turn | M | `t5` | unit: chat host: submitExternal on a closed panel opens it, answers queued although the session exists, and the message is run when the webview posts ready, not before; unit: chat host: submitExternal runs the message at once when the webview is ready and nothing is in progress, and queues it behind a running turn, a followed turn and an approval follow-up; waiting messages run one per turn end, in order; unit: chat host: a message waiting behind a turn that a typed message supersedes is run when the typed message's turn ends, and a typed message still supersedes a running turn; unit: chat host: submitExternal answers unavailable with no CLI or blank text, drains after Stop and after a chat switch into the session then active, keeps waiting across a second ready while a turn runs, and drops its list on dispose with a warning; unit: chat host: a pane message waits while a permission request is unanswered, rejects none, and is run after the last one is decided: at once when all were denied, after the follow-up turn when one was approved; unit: chat host: a pane message waiting behind a followed turn is run when the follow fails as well as when it ends | [[c7]] [[c9]] [[c12]] |
| 7 | **`t7`** Give the pane's client one decide call and add the new messages to the protocol | S | `t4` | unit: docs review client: decide calls 'workflow.reviewDecision' once with the given path, without the id map, and throws on the error arm; content forwards the new view fields; unit: plugin protocol: 'docs-decision-result' and 'docs-companion' are host messages, 'open-companion' is a webview message, and 'docs-decision' carries a decision and a comments list | [[c5]] [[c8]] |
| 8 | **`t8`** Move the pane's host to the open document's path, the one call and the chat message | M | `t7` | integration: docs review host: a docs-decision calls decide once with the open document's docPath and every comment, posts docs-decision-result, re-reads the list and the document by docPath, and hands the chat one message with the decision and the numbered comments; integration: docs review host: a decision with no comments sends the chat the decision line alone; integration: docs review host: send feedback works on a read-only open and on a document just approved, while approve and reject are refused for a document that is not pending or not the open one; integration: docs review host: a failing decide posts a failed result, sends no chat message and keeps the open document; integration: docs review host: a withheld approval and a commentsError are each reported in the result and in the chat message; integration: docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion; integration: docs review host: open-companion for one of the document's companions posts docs-companion with the file's text and the shell's nonce on every script tag that had none; for any other path, or when the read fails, it posts docs-companion with no html; integration: docs review host: an absent, throwing or unavailable notifyChat leaves the decision recorded and says so in the result; integration: docs review host: a boot ping while a document is open re-posts that document by its path, for a pending document and for one that is no longer pending | [[c6]] [[c9]] [[c12]] |
| 9 | **`t9`** Rebuild the pane's shell: fixed comment panel in the VS Code theme | M | `t8` | integration: docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch; integration: docs review shell: each of the three buttons posts one docs-decision with the whole-document comment and is disabled until the result arrives, the result line is shown, and feedback with no comment posts nothing; integration: docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw; integration: docs review shell: the shell is one inline script under a nonce CSP with no remote origin, and its recorded baseline is that of the new shell | [[c6]] [[c14]] |
| 10 | **`t10`** Show each document of an artifact in its own tab, HTML artifacts as the full page | M | `t9` | integration: docs review shell: an HTML document's tab posts open-companion, and docs-companion sets the text as the srcdoc of a frame with sandbox allow-scripts and shows the file's path; with no html it shows the path and a line of text; integration: docs review shell: there is one tab per document, the markdown first, and a comment sent from an HTML tab names that file and has no anchor | [[c6]] [[c13]] [[c14]] |
| 11 | **`t11`** Add inline comments as drafts | M | `t9` | integration: docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button; integration: docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing; integration: docs review shell: drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored from the saved state when the shell is rebuilt | [[c6]] [[c9]] [[c14]] |
| 12 | **`t12`** Show the saved comments of a document | M | `t11` | integration: docs review shell: saved inline entries are placed on their quotes with a margin marker and count and open oldest first; an entry whose quote is gone is listed as on an earlier revision; entries without an anchor are listed in the whole-document strip in time order; integration: docs review shell: a document that is not awaiting review shows its history and offers send feedback only; integration: docs review shell: author, comment and quote text are set as text, never as markup; integration: docs review shell: a saved entry with no string author, timestamp or comment is skipped and the strip says how many could not be shown | [[c6]] [[c9]] [[c13]] [[c14]] |
| 13 | **`t13`** Wire the pane to the chat and to the companion files, and check the real shell in a browser | S | `t6`, `t10`, `t12` | unit: review wiring: the review host is given notifyChat bound to the chat host's submitExternal and a readCompanion, and neither host module imports the other; unit: review wiring: readCompanion answers the text of an .html file under the workspace's docs/ folder and undefined for another extension, a path that leaves docs/, a missing file and a file over 8 MB; smoke: Headless Chrome render of the real shell with a long document: the comment panel stays in view at the top and at the bottom of the scroll, and a screenshot matches the approved mock's layout | [[c6]] [[c7]] [[c10]] [[c14]] |
| 14 | **`t14`** Run the suites, update the daemon, install the plugin and check by hand | S | `t13` | smoke: The daemon's and the plugin's whole test suites pass apart from failures that exist before this Story; smoke: By hand in VS Code with a light and a dark theme: the pane follows the theme, an HTML companion with scripts is drawn in its tab, an inline comment and a whole-document comment sent with reject are saved under the git user and appear in the chat as one message, and they are shown as history when the document is opened again; smoke: By hand in VS Code: a decision sent while a chat turn is running is delivered after that turn ends, and one sent with the chat panel closed opens the chat and is delivered; smoke: By hand in VS Code: a sequence diagram, one other mermaid diagram and a UI mock are each drawn in their own tab, with the result recorded for each | [[c10]] [[c11]] [[c13]] |

### 1.1 E202610138d4b90c9:S001:T001 — Give the feedback entry an anchor, a decision and a batch id, and add the batch append

Add the three optional fields to the entry's type, the stored list's schema, the append request's schema and coercion, the single-entry writer and the Feedback section renderer. Add appendFeedbackBatch (all entries in one write, or none) and priorFeedback (the stored list of an artifact JSON, or an empty list).

**Acceptance checks:**
- An entry with an anchor, a decision and a batch id is accepted and stored by the single-entry append and by the batch
- A request without the new fields is stored and rendered exactly as before
- The batch writes every entry in one write, or nothing when one entry is invalid
- The Feedback section shows an entry's decision and quoted text

### 1.2 E202610138d4b90c9:S001:T002 — Keep a document's comments when it is re-authored

In the HLD, epic LLD, standalone LLD and PLAN finalizers, read the feedback of the JSON at the artifact's own path and put it into the new body before rendering. A Define is not carried.

**Acceptance checks:**
- A re-authored HLD, LLD and PLAN keep their earlier feedback entries in order and render them
- A first authoring has no Feedback section, and a re-authored Define carries none
- The carry-forward only reads: the prior JSON file is unchanged after the finalizer has run

### 1.3 E202610138d4b90c9:S001:T003 — Extract the reviewer lookup and add the new fields to the review view

Make resolveReviewer in the companion header module from the inline fallback and have the header use it. Add docPath, contentVersion, feedback, reviewer and state to the review view.

**Acceptance checks:**
- resolveReviewer gives the git name, else the OS login, else unknown, with its source
- The companion header's user text is unchanged
- The view returns the five new fields and its existing fields are unchanged
- The daemon's typecheck and the existing review-view tests pass with the new fields

### 1.4 E202610138d4b90c9:S001:T004 — Add the review decision call to the daemon

Add handleReviewDecision in a new src/workflow/review-decision.ts and register 'workflow.reviewDecision'. It validates the request, resolves the author, records the decision first (approve or reject through the existing functions; feedback changes no state) and then appends the comments in one batch with the decision that took effect.

**Acceptance checks:**
- Approve, reject and feedback each give the outcome and saved entries the design states, including a withheld approval
- An invalid request answers an error and writes nothing
- A failed comment write after the decision reports the outcome with commentsError
- The existing review handlers are unchanged

### 1.5 E202610138d4b90c9:S001:T005 — Let the turn lifecycle say whether a turn is in progress, and report a failed follow

Add busy() to the lifecycle. Make a follow call its sink's end callback when the resume fails as well as when it ends normally.

**Acceptance checks:**
- busy is true and false at the moments the design lists, and a superseding turn keeps it true
- A follow whose resume fails calls its end callback once and busy is false then

### 1.6 E202610138d4b90c9:S001:T006 — Let another pane hand the chat a message that waits its turn

Add the ready flag, submitExternal, the waiting list and the drain to the chat host. A waiting message is run only when the webview is ready, no turn is in progress, no runTurn is starting and no permission request is unanswered. The host drains at the points the design lists, at a follow's end on either path, and when the last waiting permission request has been decided and its batch handled: at once if no follow-up turn was started, otherwise when that turn ends.

**Acceptance checks:**
- A message handed to a closed panel opens it, is reported as queued and is run when the webview posts ready, not before
- A message waits behind a running turn, a followed turn and an approval follow-up, and waiting messages run one per turn end, in order
- A message waits while a permission request is unanswered and is run after the last one is decided, with or without a follow-up turn; no waiting request is rejected by it
- A message waiting behind a turn that a typed message supersedes is run when the typed message's turn ends, and a typed message behaves as before
- The list drains after Stop and after a chat switch, keeps waiting across a second ready while a turn runs, and is dropped with a warning on dispose

### 1.7 E202610138d4b90c9:S001:T007 — Give the pane's client one decide call and add the new messages to the protocol

Replace approve and comment in the review client with decide over 'workflow.reviewDecision', and forward the view's new fields. Change the 'docs-decision' message and add 'docs-decision-result', 'open-companion' and 'docs-companion' to the protocol and its kind lists.

**Acceptance checks:**
- decide calls the daemon once with the given path and throws on the error arm
- content forwards docPath, contentVersion, feedback, reviewer and state
- The three new kinds are listed and 'docs-decision' carries a decision and a comments list

### 1.8 E202610138d4b90c9:S001:T008 — Move the pane's host to the open document's path, the one call and the chat message

The host keeps the open document's id, path and companions; acts on a decision for that document only (approve and reject need it pending, feedback does not); calls decide once; posts the result; re-reads the list and the document by path; and hands the chat one message. It answers 'open-companion' with the file's text, scripts stamped with the shell's nonce, and re-posts the open document when the rebuilt shell sends its boot ping.

**Acceptance checks:**
- A decision calls decide once with the document's path and every comment, and the chat gets one message, the decision line alone when there are no comments
- Send feedback works on a document that is not pending; approve and reject are refused for it
- A companion of the open document is posted with its scripts stamped; any other path, or a failed read, is posted with no html
- A boot ping from a rebuilt shell re-posts the open document, pending or not
- A failing decide or chat hand-over is reported and nothing saved is undone
- The tests that pin the replaced decision handling are rewritten for the new call; none is removed without a replacement

### 1.9 E202610138d4b90c9:S001:T009 — Rebuild the pane's shell: fixed comment panel in the VS Code theme

Lay the shell out as a column with the header and the comment panel outside one scrolling region. Take every colour from VS Code theme variables and define the --it-* tokens from them. The comment panel is a rounded box with a field and round icon-only buttons that post one decision with the whole-document comment, stay disabled until the result arrives and show the result line.

**Acceptance checks:**
- The comment panel and header stay outside the scrolling region
- No terminal style, theme message or literal colour is used
- The three buttons post one decision with the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing
- The section chooser and the functional, diagram and experience renderers still draw
- The shell baseline and the assertions on the old layout and style are updated to the new shell, and one inline script, the nonce CSP and no remote origin are still asserted

### 1.10 E202610138d4b90c9:S001:T010 — Show each document of an artifact in its own tab, HTML artifacts as the full page

The header shows one tab per document: the markdown first, then each HTML artifact by title. Choosing an HTML tab asks the host for the file and sets its text as the srcdoc of a frame with sandbox allow-scripts, with the file's path shown above it. Comments made on an HTML tab are whole-document comments with that file as their target.

**Acceptance checks:**
- Each HTML artifact has its own tab, and choosing it posts open-companion
- The frame is set from the posted text with sandbox allow-scripts and nothing else; without text the tab shows the path and a line
- A comment sent from an HTML tab names that file and carries no anchor

### 1.11 E202610138d4b90c9:S001:T011 — Add inline comments as drafts

Selecting text in one block of a markdown document offers a round comment button that marks the passage and opens a thread card with a field. An added comment is a draft with a quote, section, prefix and suffix. Drafts are sent with the decision, cleared only on a clean result, removable, and kept in the webview's saved state per artifact.

**Acceptance checks:**
- A selection in one block makes a draft with its anchor; a selection across blocks, in the Feedback section or cutting a mark offers no button
- Every draft is posted with the decision
- Drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored when the shell is rebuilt
- Comment and quote text are set as text

### 1.12 E202610138d4b90c9:S001:T012 — Show the saved comments of a document

Saved entries with an anchor are placed on their quotes with a mark and a margin marker that shows the count; clicking either opens the thread, oldest first, with author, time and decision. Entries with no place, and entries without an anchor, are listed in the whole-document strip in time order, tagged when they are from an earlier revision. A document not awaiting review shows its history and offers send feedback only.

**Acceptance checks:**
- Saved inline entries appear on their passages with a count and open oldest first
- An entry whose quote is gone is listed as on an earlier revision with its quote; entries without an anchor are listed in time order
- An entry the shell cannot read is skipped and counted
- A document not awaiting review shows its history and offers send feedback only
- Author, comment and quote text are set as text

### 1.13 E202610138d4b90c9:S001:T013 — Wire the pane to the chat and to the companion files, and check the real shell in a browser

In extension.ts pass notifyChat (the chat host's submitExternal) and readCompanion (an .html file under the workspace's docs/ folder, at most 8 MB) to the review host. Render the real shell with a long document in headless Chrome and compare it with the approved mock.

**Acceptance checks:**
- The review host is given notifyChat and readCompanion, and the two hosts do not import each other
- readCompanion refuses a path that is not an .html file under docs/ or is over the size limit
- In headless Chrome the comment panel is in view at the top and at the bottom of a long document

### 1.14 E202610138d4b90c9:S001:T014 — Run the suites, update the daemon, install the plugin and check by hand

Run the daemon's and the plugin's typechecks and test suites. Ask the user before pushing, since the installed daemon is updated from the remote; update and restart the daemon before installing the plugin build. The user then checks in VS Code: the theme, an inline and a whole-document comment sent with reject, the history on reopening, a decision sent while a chat turn runs and with the chat closed, and three HTML artifacts (a sequence diagram, one other mermaid diagram and a UI mock). The results are recorded as reported.

**Acceptance checks:**
- Both suites pass apart from failures that exist before this Story
- The daemon is updated before the plugin is installed, and nothing is pushed without the user's word
- The user's checks in VS Code pass, and the result for each of the three HTML artifacts is recorded

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid | `t1` |
| feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before | `t1` |
| feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid | `t1` |
| feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically | `t1` |
| feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact | `t1` |
| reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs | `t3` |
| review decision: approve approves first and then saves the comments with decision approve; a withheld approval saves them as feedback and reports the reason | `t4` |
| review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject | `t4` |
| review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused | `t4` |
| review decision: a decision with no comments writes no feedback entry | `t4` |
| review decision: an invalid request (unknown decision, blank or over-long comment, a file that is not the artifact's document, too many comments, a non-pending artifact for approve or reject) answers an error and writes nothing | `t4` |
| review decision: a failing comment write after the decision took effect reports the outcome with commentsError | `t4` |
| review decision: the author is the one resolveReviewer gives and is never taken from the request | `t4` |
| review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion | `t3` |
| daemon handlers: 'workflow.reviewDecision' is registered and delegates to handleReviewDecision, and the 'workflow.approve', 'workflow.resolveComment' and 'artifact.feedback.append' handlers are unchanged | `t4` |
| plugin protocol: 'docs-decision-result' and 'docs-companion' are host messages, 'open-companion' is a webview message, and 'docs-decision' carries a decision and a comments list | `t7` |
| finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none | `t2` |
| docs review client: decide calls 'workflow.reviewDecision' once with the given path, without the id map, and throws on the error arm; content forwards the new view fields | `t7` |
| turn lifecycle: busy is true while a started turn waits, sets up or is read and while a follow is read; false after the terminal event is handed over, after a follow ends, after stop and detach, and when follow returns without following; a superseding turn keeps it true | `t5` |
| chat host: submitExternal on a closed panel opens it, answers queued although the session exists, and the message is run when the webview posts ready, not before | `t6` |
| chat host: submitExternal runs the message at once when the webview is ready and nothing is in progress, and queues it behind a running turn, a followed turn and an approval follow-up; waiting messages run one per turn end, in order | `t6` |
| chat host: a message waiting behind a turn that a typed message supersedes is run when the typed message's turn ends, and a typed message still supersedes a running turn | `t6` |
| chat host: submitExternal answers unavailable with no CLI or blank text, drains after Stop and after a chat switch into the session then active, keeps waiting across a second ready while a turn runs, and drops its list on dispose with a warning | `t6` |
| docs review host: a docs-decision calls decide once with the open document's docPath and every comment, posts docs-decision-result, re-reads the list and the document by docPath, and hands the chat one message with the decision and the numbered comments | `t8` |
| docs review host: a decision with no comments sends the chat the decision line alone | `t8` |
| docs review host: send feedback works on a read-only open and on a document just approved, while approve and reject are refused for a document that is not pending or not the open one | `t8` |
| docs review host: a failing decide posts a failed result, sends no chat message and keeps the open document | `t8` |
| docs review host: a withheld approval and a commentsError are each reported in the result and in the chat message | `t8` |
| docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion | `t8` |
| docs review host: open-companion for one of the document's companions posts docs-companion with the file's text and the shell's nonce on every script tag that had none; for any other path, or when the read fails, it posts docs-companion with no html | `t8` |
| docs review host: an absent, throwing or unavailable notifyChat leaves the decision recorded and says so in the result | `t8` |
| docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch | `t9` |
| docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button | `t11` |
| docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing | `t9`, `t11` |
| docs review shell: drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored from the saved state when the shell is rebuilt | `t11` |
| docs review shell: saved inline entries are placed on their quotes with a margin marker and count and open oldest first; an entry whose quote is gone is listed as on an earlier revision; entries without an anchor are listed in the whole-document strip in time order | `t12` |
| docs review shell: an HTML document's tab posts open-companion, and docs-companion sets the text as the srcdoc of a frame with sandbox allow-scripts and shows the file's path; with no html it shows the path and a line of text | `t10` |
| docs review shell: a document that is not awaiting review shows its history and offers send feedback only | `t12` |
| docs review shell: author, comment and quote text are set as text, never as markup | `t11`, `t12` |
| docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw | `t9` |
| Headless Chrome render of the real shell with a long document: the comment panel stays in view at the top and at the bottom of the scroll, and a screenshot matches the approved mock's layout | `t13` |
| By hand in VS Code with a light and a dark theme: the pane follows the theme, an HTML companion with scripts is drawn in its tab, an inline comment and a whole-document comment sent with reject are saved under the git user and appear in the chat as one message, and they are shown as history when the document is opened again | `t14` |
| By hand in VS Code: a decision sent while a chat turn is running is delivered after that turn ends, and one sent with the chat panel closed opens the chat and is delivered | `t14` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails: appendFeedback (the new fields in both writers and both schemas, appendFeedbackBatch, priorFeedback, the carry-forward in the HLD, LLD and PLAN finalizers)`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails: feedbackBodyLines (the decision and the quoted text in the Feedback section)`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails: handleArtifactContent (the five new view fields) and resolveReviewer`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails: workflow.approve entry, the new 'workflow.reviewDecision' handler and handleReviewDecision`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails: DocsReviewClient (decide in place of approve and comment)`
- **[[c6]]** `prior-artifact` `LLD S001 contractDetails: createDocsReviewHost (layout, theme, open document, viewers, comments, decision, chat)`
- **[[c7]]** `prior-artifact` `LLD S001 contractDetails: createChatPanelHost (submitExternal, the ready flag, the waiting list and drain points) and the lifecycle's busy()`
- **[[c8]]** `prior-artifact` `LLD S001 dataModelChanges: FeedbackEntry, ArtifactReviewView and the review pane's webview protocol`
- **[[c9]]** `prior-artifact` `LLD S001 errorPaths: error cases, edge cases and invariants to preserve`
- **[[c10]]** `prior-artifact` `LLD S001 testStrategy: test levels, subjects and the mapping of ac1 to ac8`
- **[[c11]]** `prior-artifact` `LLD S001 migration: the order of change, daemon before plugin, and backward compatibility`
- **[[c12]]** `stakeholder` `Approval override of the LLD, given by the user in chat on 2026-10-13 after the third daemon review (0 high, 3 medium): a failed follow reports its end and the chat host drains then; the pane's host re-posts the open document by its path on the rebuilt shell's boot ping; the chat host's drain waits while a permission request is unanswered and runs when the last one is decided`
- **[[c13]]** `stakeholder` `The LLD's two open questions, resolved by the user in chat on 2026-10-13: the history shows only comments saved the new way; the hand check opens a UI mock and one other mermaid diagram besides a sequence diagram. The user also confirmed that each additional HTML artifact is its own tab with the full HTML loaded in it`
- **[[c14]]** `doc` `docs/mocks/docs-review-pane.html` — "Mock of the reworked document viewer / approver pane (VS Code webview)."
