<!-- insrc:artifact TESTS-8d4b90c9ab301e66-S001 -->

# Tests: 8d4b90c9ab301e66 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 57 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-13T12:12:45.679Z on commit `cd6cede6`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**unit: feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact | `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-10-13T12:19:23.527Z on commit `bb5afca9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN each keep the feedback entries of the JSON at their own artifact path, in order, and render them in the Feedback section; a first authoring has none; a re-authored Define carries none | `src/workflow/__tests__/feedback-carry-finalize.test.ts` |

**integration: finalize: the prior artifact JSON is byte-identical after the finalizer has run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: the prior artifact JSON is byte-identical after the finalizer has run | `src/workflow/__tests__/feedback-carry-finalize.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/feedback-carry-finalize.test.ts` | 0 | 2 | 0.5 s |  |

## t3

Run at 2026-10-13T12:22:06.311Z on commit `b4760e14`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader's user is unchanged for the same inputs | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — user is git user.name, else the OS login, else unknown | `src/workflow/artifacts/companion/__tests__/header.test.ts` |

**unit: review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review view: docPath, contentVersion, feedback, reviewer and state are returned, the existing fields are unchanged, and a changed markdown gives a different contentVersion | `src/workflow/__tests__/artifact-content.test.ts` |
| pass | t1: the six pre-existing ArtifactReviewView members keep their names, types and meanings | `src/workflow/__tests__/artifact-content.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-content.test.ts` | 0 | 22 | 0.5 s |  |
| `src/workflow/artifacts/companion/__tests__/header.test.ts` | 0 | 14 | 0.5 s |  |

## t4

Run at 2026-10-13T12:28:11.942Z on commit `4e4fca41`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review decision: approve approves first and then saves the comments with decision approve; a withheld approval saves them as feedback and reports the reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review decision: approve approves first and then saves the comments with decision approve; a withheld approval saves them as feedback and reports the reason | `src/workflow/__tests__/review-decision.test.ts` |

**unit: review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject | `src/workflow/__tests__/review-decision.test.ts` |

**unit: review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused | `src/workflow/__tests__/review-decision.test.ts` |

**unit: review decision: a decision with no comments writes no feedback entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review decision: a decision with no comments writes no feedback entry | `src/workflow/__tests__/review-decision.test.ts` |

**unit: review decision: an invalid request (unknown decision, blank or over-long comment, a file that is not the artifact's document, too many comments, a non-pending artifact for approve or reject) answers an error and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review decision: an invalid request (unknown decision, blank or over-long comment, a file that is not the artifact's document, too many comments, a non-pending artifact for approve or reject) answers an error and writes nothing | `src/workflow/__tests__/review-decision.test.ts` |

**unit: review decision: a failing comment write after the decision took effect reports the outcome with commentsError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review decision: a failing comment write after the decision took effect reports the outcome with commentsError | `src/workflow/__tests__/review-decision.test.ts` |

**unit: review decision: the author is the one resolveReviewer gives and is never taken from the request**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review decision: the author is the one resolveReviewer gives and is never taken from the request | `src/workflow/__tests__/review-decision.test.ts` |

**unit: daemon handlers: 'workflow.reviewDecision' is registered and delegates to handleReviewDecision, and the 'workflow.approve', 'workflow.resolveComment' and 'artifact.feedback.append' handlers are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon handlers: 'workflow.reviewDecision' is registered and delegates to handleReviewDecision, and the 'workflow.approve', 'workflow.resolveComment' and 'artifact.feedback.append' handlers are unchanged | `src/workflow/__tests__/review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/review-decision.test.ts` | 0 | 8 | 0.5 s |  |

## t5

Run at 2026-10-13T12:31:31.992Z on commit `7fda274d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: turn lifecycle: busy is true while a started turn waits, sets up or is read and while a follow is read; false after the terminal event is handed over, after a follow ends, after stop and detach, and when follow returns without following; a superseding turn keeps it true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | turn lifecycle: busy is true while a started turn waits, sets up or is read and while a follow is read; false after the terminal event is handed over, after a follow ends, after stop and detach, and when follow returns without following; a superseding turn keeps it true | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: turn lifecycle: a follow whose resume fails calls its end callback exactly once, and busy is false when it is called**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | turn lifecycle: a follow whose resume fails calls its end callback exactly once, and busy is false when it is called | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | a failing resume keeps the cursor saved | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 30 | 1.6 s |  |

## t6

Run at 2026-10-13T12:37:48.576Z on commit `a509e0a3`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat host: submitExternal on a closed panel opens it, answers queued although the session exists, and the message is run when the webview posts ready, not before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: submitExternal on a closed panel opens it, answers queued although the session exists, and the message is run when the webview posts ready, not before | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: chat host: submitExternal runs the message at once when the webview is ready and nothing is in progress, and queues it behind a running turn, a followed turn and an approval follow-up; waiting messages run one per turn end, in order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: submitExternal runs the message at once when the webview is ready and nothing is in progress, and queues it behind a running turn, a followed turn and an approval follow-up; waiting messages run one per turn end, in order | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: chat host: a message waiting behind a turn that a typed message supersedes is run when the typed message's turn ends, and a typed message still supersedes a running turn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a message waiting behind a turn that a typed message supersedes is run when the typed message's turn ends, and a typed message still supersedes a running turn | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: chat host: submitExternal answers unavailable with no CLI or blank text, drains after Stop and after a chat switch into the session then active, keeps waiting across a second ready while a turn runs, and drops its list on dispose with a warning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: submitExternal answers unavailable with no CLI or blank text, drains after Stop and after a chat switch into the session then active, keeps waiting across a second ready while a turn runs, and drops its list on dispose with a warning | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: chat host: a pane message waits while a permission request is unanswered, rejects none, and is run after the last one is decided: at once when all were denied, after the follow-up turn when one was approved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a pane message waits while a permission request is unanswered, rejects none, and is run after the last one is decided: at once when all were denied, after the follow-up turn when one was approved | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: chat host: a pane message waiting behind a followed turn is run when the follow fails as well as when it ends**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a pane message waiting behind a followed turn is run when the follow fails as well as when it ends | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | chat host: a pane message waiting behind a turn that fails is run when the error is reported | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | turn lifecycle: busy is false when a turn's error is reported | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 161 | 4.4 s |  |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 31 | 1.7 s |  |

## t7

Run at 2026-10-13T12:43:36.906Z on commit `347bb43b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: docs review client: decide calls 'workflow.reviewDecision' once with the given path, without the id map, and throws on the error arm; content forwards the new view fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review client: decide calls 'workflow.reviewDecision' once with the given path, without the id map, and throws on the error arm; content forwards the new view fields | `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` |

**unit: plugin protocol: 'docs-decision-result' and 'docs-companion' are host messages, 'open-companion' is a webview message, and 'docs-decision' carries a decision and a comments list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | plugin protocol: 'docs-decision-result' and 'docs-companion' are host messages, 'open-companion' is a webview message, and 'docs-decision' carries a decision and a comments list | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` | 0 | 13 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 11 | 0.3 s |  |

## t8

Run at 2026-10-13T12:53:02.450Z on commit `abbe50c1`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: docs review host: a docs-decision calls decide once with the open document's docPath and every comment, posts docs-decision-result, re-reads the list and the document by docPath, and hands the chat one message with the decision and the numbered comments**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a docs-decision calls decide once with the open document's docPath and every comment, posts docs-decision-result, re-reads the list and the document by docPath, and hands the chat one message with the decision and the numbered comments | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |
| pass | docs-decision approve records the decision through client.decide by the document's path and re-fetches pending | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | docs-decision reject and feedback send their comments through the same client.decide call and re-fetch | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review host: a decision with no comments sends the chat the decision line alone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a decision with no comments sends the chat the decision line alone | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: send feedback works on a read-only open and on a document just approved, while approve and reject are refused for a document that is not pending or not the open one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: send feedback works on a read-only open and on a document just approved, while approve and reject are refused for a document that is not pending or not the open one | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |
| pass | a docs-decision in the earlier accept/note shape, or for a document that was never opened, reaches no daemon call | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review host: a failing decide posts a failed result, sends no chat message and keeps the open document**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a failing decide posts a failed result, sends no chat message and keeps the open document | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: a withheld approval and a commentsError are each reported in the result and in the chat message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a withheld approval and a commentsError are each reported in the result and in the chat message | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |
| pass | a withheld approval surfaces the reason non-lossily and stays pending | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: open-companion for one of the document's companions posts docs-companion with the file's text and the shell's nonce on every script tag that had none; for any other path, or when the read fails, it posts docs-companion with no html**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: open-companion for one of the document's companions posts docs-companion with the file's text and the shell's nonce on every script tag that had none; for any other path, or when the read fails, it posts docs-companion with no html | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: an absent, throwing or unavailable notifyChat leaves the decision recorded and says so in the result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: an absent, throwing or unavailable notifyChat leaves the decision recorded and says so in the result | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**integration: docs review host: a boot ping while a document is open re-posts that document by its path, for a pending document and for one that is no longer pending**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a boot ping while a document is open re-posts that document by its path, for a pending document and for one that is no longer pending | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` | 0 | 9 | 0.7 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 204 | 18.6 s |  |

## t9

Run at 2026-10-13T13:07:10.483Z on commit `e0d1a19f`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: each of the three buttons posts one docs-decision with the whole-document comment and is disabled until the result arrives, the result line is shown, and feedback with no comment posts nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: each of the three buttons posts one docs-decision with the whole-document comment and is disabled until the result arrives, the result line is shown, and feedback with no comment posts nothing | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the shell is one inline script under a nonce CSP with no remote origin, and its recorded baseline is that of the new shell**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the shell is one inline script under a nonce CSP with no remote origin, and its recorded baseline is that of the new shell | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | rendered shell: one nonce, unwidened CSP, the review pane body, guardMd present, no remote origin | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | the shell inlines each of the five source strings verbatim and exactly once, with the ux CSS fragment | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 208 | 18.5 s |  |

## t10

Run at 2026-10-13T13:15:23.105Z on commit `c3181c44`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: docs review shell: an HTML document's tab posts open-companion, and docs-companion sets the text as the srcdoc of a frame with sandbox allow-scripts and shows the file's path; with no html it shows the path and a line of text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: an HTML document's tab posts open-companion, and docs-companion sets the text as the srcdoc of a frame with sandbox allow-scripts and shows the file's path; with no html it shows the path and a line of text | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: there is one tab per document, the markdown first, and a comment sent from an HTML tab names that file and has no anchor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: there is one tab per document, the markdown first, and a comment sent from an HTML tab names that file and has no anchor | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 210 | 18.8 s |  |

## t11

Run at 2026-10-13T13:26:57.647Z on commit `eae93703`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | docs review shell: each of the three buttons posts one docs-decision with the whole-document comment and is disabled until the result arrives, the result line is shown, and feedback with no comment posts nothing | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: docs review shell: drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored from the saved state when the shell is rebuilt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review shell: drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored from the saved state when the shell is rebuilt | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 213 | 19 s |  |
