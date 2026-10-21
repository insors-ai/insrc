<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s8 -->

# Plan: E202610212f27754d:S008

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792607869369-3pfy3p`
**LLD effective hash:** `bd468fd6cd6c...`

Building this Story starts with the small additive pieces other code stands on (a source on feedback, a post-comment method on the tracker port with a marker on the attach comment, and an integrity check that ignores revision-less entries), then the pure comment rules, then the sync itself in two halves (reading human comments in, posting local feedback out), and last the places it is called from and the notes for s9.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Let FeedbackInput carry a source | S | — | integration: feedback-source.test.ts: FeedbackService.add stores a source and a repeat of the same id with the same source appends nothing | [[c4]] [[c6]] |
| 2 | **`t2`** Add postComment to the tracker port and mark the attach comment | M | — | integration: port-post-comment.test.ts: the GitHub adapter's postComment answers the comment id and attach posts its marker | [[c3]] [[c6]] |
| 3 | **`t3`** Make the integrity check read the last revision-bearing entry | S | — | unit: integrity-receipts.test.ts: a revision-less receipt or build round after the last content entry does not make a head that differs from that entry pass the integrity check | [[c6]] |
| 4 | **`t4`** Add the comment rules | S | `t2` | unit: comment-rules.test.ts: classifyComment gives revision-request, suggestion or comment from the first line only; unit: comment-rules.test.ts: isFrameworkComment recognises every insrc marker and no human text; unit: comment-rules.test.ts: the author and the entry id are derived from a tracker comment, a mixed-case login lowercased | [[c2]] [[c6]] |
| 5 | **`t5`** Implement the inbound half of the comment sync | L | `t1`, `t4` | integration: comment-sync-inbound.test.ts: a human comment is recorded once as feedback with the tracker user as author, framework comments are never recorded, an edited comment is not mirrored, and a tracker failure is reported without failing the call | [[c1]] [[c6]] |
| 6 | **`t6`** Implement the outbound half of the comment sync | L | `t3`, `t5` | integration: comment-sync-outbound.test.ts: feedback entered here is posted once and its receipt is written, a post whose receipt was lost is found by its marker and not posted again, and failures leave the call repeatable | [[c1]] [[c6]] |
| 7 | **`t7`** Call the sync from implement, validate and the daemon method | M | `t6` | integration: comment-sync-callers.test.ts: implement and validate run the comment sync for the Task and the daemon method tracker.syncComments runs it on request, and neither is failed by it | [[c4]] [[c5]] |
| 8 | **`t8`** Record the s8 hand-offs | S | `t7` | integration: s8-handoffs.test.ts: the plans document names each s8 hand-off to s9 | [[c6]] |

### 1.1 E202610212f27754d:S008:T001 — Let FeedbackInput carry a source

Add the optional source { system, externalId, url? } to FeedbackInput in src/workflow/feedback/feedback-service.ts: FeedbackService.add stores it on the entry, validates it (a system and an external id), and compares it when an id is repeated.

**Acceptance checks:**
- An entry added with a source is stored with it and read back with it
- The same id with the same fields and the same source appends nothing; the same id with a different source is refused as already used with different content
- A source with no system or no external id is refused
- An entry added with no source is stored exactly as before

### 1.2 E202610212f27754d:S008:T002 — Add postComment to the tracker port and mark the attach comment

Add TrackerPort.postComment(issue, body) answering { externalId } to src/workflow/tracker/port.ts, implement it in src/workflow/tracker/github-adapter.ts through ghPostCommentReturningId, give the attach comment the first-line marker <!-- insrc:attach:<artifact id> -->, and add postComment to the two other test fakes (src/workflow/__tests__/approve-fallback-kit.ts and src/workflow/tracker/__tests__/attach.test.ts).

**Acceptance checks:**
- The GitHub adapter's postComment posts one comment and answers its id, and answers a failed PortResult when the post fails or returns no id
- The attach comment starts with the marker line and still holds the Attached line and the link, so s6's reconciliation by link still finds it
- Every TrackerPort fake in the repository typechecks with postComment
- issueOps.comment keeps its behaviour

### 1.3 E202610212f27754d:S008:T003 — Make the integrity check read the last revision-bearing entry

Change checkIntegrity in src/workflow/artifact-core/lifecycle.ts so it compares the head against the last change log entry that carries a revision, not against a revision-less entry such as a build round or a feedback post receipt, and keep its callers working.

**Acceptance checks:**
- A receipt or a build round appended after the last content entry does not make a head that is ahead of or different from that entry pass the check
- A head that matches its last revision-bearing entry still passes, with or without later revision-less entries
- The existing integrity tests still pass

### 1.4 E202610212f27754d:S008:T004 — Add the comment rules

Add src/workflow/tracker/comment-rules.ts: classifyComment (first line /revise or revision: gives revision-request, /suggest or suggestion: gives suggestion, else comment), isFrameworkComment (any insrc marker comment, no legacy shape), the actor of a tracker login (github:<lowercased login>, github:unknown for an empty or deleted author) and the feedback entry id tracker:<comment id>.

**Acceptance checks:**
- Only the first line decides the kind, any case, and ordinary prose that starts with the word suggestion is a comment
- isFrameworkComment is true for the insrc:post, insrc:review, insrc:handoff, insrc:attach and insrc:feedback markers and false for human text and for the old unmarked Attached comment
- A mixed-case login gives its lowercased github actor, and an empty author gives github:unknown
- The entry id is tracker: followed by the comment id

### 1.5 E202610212f27754d:S008:T005 — Implement the inbound half of the comment sync

Add src/workflow/tracker/comment-sync.ts with syncUnitComments' inbound half: find the unit's artifact and issue from its binding (the LLD for a Story, the TASK head for a Task), read the issue's comments in full, drop the framework's comments, and record each human comment once through FeedbackService.add with its entry id, actor, kind and source; failures go in the result and nothing throws.

**Acceptance checks:**
- A human comment is recorded once as feedback by the tracker user with its kind and source, and a repeated sync records nothing
- Framework comments are counted as skipped and never recorded
- A comment edited on the tracker after it was recorded is skipped silently and does not fail later syncs
- A failed read or a failed record is in the result's failed list, the call can be repeated, and a comment that failed to record is picked up on the next sync
- A unit with no binding or no artifact returns a result that says so

### 1.6 E202610212f27754d:S008:T006 — Implement the outbound half of the comment sync

Extend src/workflow/tracker/comment-sync.ts: for each feedback entry of the artifact that has no source and no receipt, check the issue's comments for its marker <!-- insrc:feedback:<artifact id>:<feedback id> -->, post it with postComment when none is found (never when the list cannot be read), and append the revision-less receipt entry (operation update, outcome posted, data kind feedback-post) to the artifact's log.

**Acceptance checks:**
- Feedback entered here is posted once and its receipt is written; a second sync posts nothing
- A post whose receipt was lost is found by its marker and recorded without a second post
- An entry that came from the tracker is never posted back
- A failed post writes no receipt and is retried on the next sync; an unreadable comment list posts nothing
- A reply is posted once as its own comment naming the entry it replies to
- A receipt moves no revision and does not break the integrity check

### 1.7 E202610212f27754d:S008:T007 — Call the sync from implement, validate and the daemon method

Add src/daemon/tracker-sync-comments.ts with handleTrackerSyncComments and a best-effort runner for a Task, register tracker.syncComments in src/daemon/index.ts, and call the runner from src/daemon/steps/build-step/phases/implement.ts and validate.ts, reporting a short result in the phase's answer and never failing the phase.

**Acceptance checks:**
- Implement and validate run the sync for the Task and name what it recorded and posted in their result
- tracker.syncComments runs the sync for the named unit on request and returns its result, or an error that says why nothing was attempted
- A failing sync, or a repository with no tracker, leaves implement and validate working as before

### 1.8 E202610212f27754d:S008:T008 — Record the s8 hand-offs

Add a section to docs/plans/core-data-model.md naming what s8 leaves for s9: the pre-s8 attach comments with no marker, the Story comments recorded on the LLD that move onto the Story artifact, the revision-less feedback-post receipts, and the since point (none, a full read).

**Acceptance checks:**
- The plans document names each s8 hand-off to s9
- No code changes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| classifyComment gives revision-request, suggestion or comment from the first line only | `t4` |
| isFrameworkComment recognises the insrc markers and the older Attached link comment | `t4` |
| the author, the entry id and the since point derived from a tracker comment | `t4`, `t5` |
| a human comment is recorded once as feedback by the tracker user, and framework comments are never recorded | `t5` |
| an edited or deleted tracker comment is not mirrored | `t5`, `t6` |
| feedback entered here is posted once with its receipt, and a post whose receipt was lost is found by its marker and not posted again | `t3`, `t6` |
| the sync failures leave the call repeatable and never fail the caller | `t5`, `t6`, `t7` |
| implement and validate run the sync, and the daemon method tracker.syncComments runs it on request | `t7` |
| FeedbackService.add stores a source and treats the same id with the same source as a repeat | `t1` |
| the GitHub adapter's postComment answers the comment id and attach posts its marker | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s8 the api of syncUnitComments`
- **[[c2]]** `prior-artifact` `LLD s8 the api of classifyComment and isFrameworkComment`
- **[[c3]]** `prior-artifact` `LLD s8 the api of the port's postComment and the attach marker`
- **[[c4]]** `prior-artifact` `LLD s8 the api of FeedbackService.add with a source`
- **[[c5]]** `prior-artifact` `LLD s8 the api of handleTrackerSyncComments`
- **[[c6]]** `prior-artifact` `LLD s8 the data model, the migration and the binding requirements recorded with its approval in docs/plans/core-data-model.md`
