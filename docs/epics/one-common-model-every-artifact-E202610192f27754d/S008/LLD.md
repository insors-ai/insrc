<!-- insrc:artifact LLD-2f27754d4ad00b8e-s8 -->

# LLD: E202610212f27754d:S008

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `bd468fd6cd6c...`

When the holder starts to implement or validate a Task, or asks for a sync, the comments people wrote on the unit's issue become feedback on the unit's artifact, each recorded once with the tracker user as its author; a comment that starts with a revision or suggestion command is given that kind, and the framework's own posts are never read back. Feedback a person entered here against a unit that has an issue is posted to the issue once and marked as posted. Nothing runs in the background, a later edit or deletion on the tracker is not mirrored, and no new credential is used.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-2f27754d4ad00b8e** § 2. Framework summary

**Rollout phase:** Phase D — Tasks and tracker comment sync
**Consumes:** `sc1` (ArtifactIdScheme), `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords), `sc4` (Lifecycle), `sc6` (TrackerBinding), `sc7` (TaskSet)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `syncUnitComments`

```typescript
syncUnitComments(unit: UnitRef, port: TrackerPort, deps: CommentSyncDeps): Promise<CommentSyncResult>
```

**Parameters:**
- `unit: UnitRef` — The Story or Task whose issue is read; its artifact is the Story's LLD or the Task's TASK head
- `port: TrackerPort` — The tracker the comments are read from and posted to
- `deps: CommentSyncDeps` — The feedback service, the history for receipts, the clock, and the posting actor

**Returns:** `CommentSyncResult` — The comment ids recorded, the framework comments skipped, the feedback ids posted, the posts found already on the issue, and every step that failed with its reason

**Preconditions:**
- The unit has an artifact with a binding to an issue; a unit with no binding returns a result that says so and does nothing

**Postconditions:**
- Never throws: a failed read or post is in the result's failed list and the call can be repeated
- Each human comment is recorded once, with the entry id tracker:<comment id>, the author github:<login>, a kind from its first line and a source naming the comment
- Each feedback entry that was entered here (it has no source) and has no receipt is posted once, then a revision-less receipt entry is appended to the artifact's log
- No revision of any artifact moves

### 2.2 `classifyComment`

```typescript
classifyComment(text: string): 'comment' | 'suggestion' | 'revision-request'
```

**Parameters:**
- `text: string` — The comment's text

**Returns:** `'comment' | 'suggestion' | 'revision-request'` — The feedback kind its first line asks for

**Postconditions:**
- A first line starting with /revise or revision: (any case) is a revision-request, one starting with /suggest or suggestion: is a suggestion, anything else (an empty or later-line command included) is a comment

### 2.3 `isFrameworkComment`

```typescript
isFrameworkComment(text: string): boolean
```

**Parameters:**
- `text: string` — The comment's text

**Returns:** `boolean` — True when the framework posted the comment

**Postconditions:**
- True for any text carrying an insrc marker comment, and for the unmarked 'Attached <type> `<artifact id>`: <link>' shape the attach call posted before this Story; false otherwise

### 2.4 `postComment`

```typescript
postComment(issue: string, body: string): PortResult<{ externalId: string }>
```

**Parameters:**
- `issue: string` — The issue ref owner/repo#N
- `body: string` — The comment text

**Returns:** `PortResult<{ externalId: string }>` — The id of the posted comment, or the failure

**Errors:**
- `PortResult failure` when the tracker is unreachable, rejects the post, or answers no comment id

**Postconditions:**
- Posts one comment through the existing gh path and answers its id; the existing issueOps.comment and attach are unchanged in behaviour

### 2.5 `FeedbackService.add`

```typescript
add(artifactId: string, input: FeedbackInput, actor: Actor): Promise<Feedback>
```

**Parameters:**
- `artifactId: string` — The artifact the feedback is on
- `input: FeedbackInput` — The entry, now with an optional source naming where it came from
- `actor: Actor` — Who the entry is by

**Returns:** `Feedback` — The entry as stored

**Errors:**
- `HistoryEntryError` when the actor, the text or the source is malformed, or the id is already used with different content

**Postconditions:**
- With a source, the stored entry carries it; the same id with the same fields (source included) is a repeat and appends nothing

### 2.6 `handleTrackerSyncComments`

```typescript
handleTrackerSyncComments(params: unknown, repoEnv: string | undefined): Promise<CommentSyncResult | { error: string }>
```

**Parameters:**
- `params: unknown` — { repo, epicHash, storyId, taskId? } naming the unit
- `repoEnv: string | undefined` — The INSRC_REPO fallback

**Returns:** `CommentSyncResult | { error: string }` — What the sync did, or why nothing was attempted (no repo, no tracker, no binding)

**Postconditions:**
- Registered as the daemon method tracker.syncComments; it runs syncUnitComments for the named unit and commits nothing

## 3. Data model changes

### 3.1 `FeedbackInput.source` — field-add

FeedbackInput gains an optional source { system, externalId, url? }, stored on the entry the service writes. The Feedback type already has the field; the service did not pass it. A repeat of an id compares the source too.

```
interface FeedbackInput { ...; readonly source?: Feedback['source'] | undefined }
```

**Call sites:**
- `src/workflow/feedback/feedback-service.ts`
- `src/workflow/artifact-core/types.ts`

### 3.2 `Feedback post receipt (a change log entry)` — new

The durable record that a feedback entry was posted to the issue: a revision-less change log entry on the artifact with operation update and outcome { result: 'posted', summary, data: { kind: 'feedback-post', feedbackId, externalId, issue } }. It is appended after the post and read before one; it is the posting receipt keyed by feedback id that the HLD approval's requirement 4 asks for.

```
ChangeLogEntry.outcome.data = { kind: 'feedback-post'; feedbackId: string; externalId: string; issue: string }
```

**Call sites:**
- `src/workflow/artifact-core/history.ts`
- `src/workflow/tasks/task-set.ts`

### 3.3 `TrackerPort.postComment` — new

One additive method on the tracker port, implemented by the GitHub adapter through ghPostCommentReturningId and by the test fake. IssueOps.comment, which answers nothing, is unchanged.

```
TrackerPort.postComment(issue: IssueRef, body: string): PortResult<{ externalId: string }>
```

**Call sites:**
- `src/workflow/tracker/port.ts`
- `src/workflow/tracker/github-adapter.ts`
- `src/workflow/tracker/github.ts`

### 3.4 `Attach comment text` — field-modify

The comment the GitHub adapter's attach posts gains the marker '<!-- insrc:attach:<artifact id> -->' as its first line, so the framework's own comment is told from a human's by a marker; the link and the 'Attached' line stay, so s6's reconciliation by link is unchanged. Comments posted before this Story keep the old shape, which isFrameworkComment also recognises.

**Call sites:**
- `src/workflow/tracker/github-adapter.ts`
- `src/workflow/tracker/attach.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | Feedback is recorded through FeedbackService over History; the posting receipt is a revision-less History.appendLog entry; entries carry the Feedback source field the shape already has. |
| `sc6` | consumes | The issue comes from the binding; comments are read with listComments; one additive port method, postComment, is added so a post answers its id. |
| `sc7` | consumes | A Task's feedback is recorded on its TASK head, found from the plan row with taskHeadIdOf. |
| `sc2` | consumes | The unit's artifact is read through ArtifactStore; nothing is written to a head. |
| `sc4` | consumes | Feedback and receipts move no revision and no status. |
| `sc1` | consumes | Entry ids and markers name artifacts by their ArtifactIds form. |

## 5. Error paths

**Error cases**

- **The tracker is unreachable or rejects the comment read** (recoverable)
  - Detection: listComments returns a failed PortResult (unreachable, rejected, missing sign-in)
  - Response: The inbound half records nothing and the outbound half still runs only if its own reconciliation read succeeds; the failure is in the result's failed list with its reason, the phase that called the sync carries on
  - User impact: Implement and validate are never held up by the tracker; the comments are read on the next call
- **A post succeeds on the tracker but the receipt is not written (the process stops or the append fails)** (recoverable)
  - Detection: The next sync finds no receipt for the feedback id, lists the issue's comments and finds one carrying the entry's marker
  - Response: The receipt is written for that comment and nothing is posted again
  - User impact: No duplicate comment appears on the issue
- **A post fails before it reaches the tracker** (recoverable)
  - Detection: postComment returns a failed PortResult
  - Response: No receipt is written, the entry is listed as failed, and the next sync posts it
  - User impact: The feedback reaches the issue on a later sync
- **The comment list needed to reconcile an uncertain post cannot be read** (recoverable)
  - Detection: listComments fails before an unreceipted entry is posted
  - Response: That entry is not posted: an uncertain post is never retried blind
  - User impact: The entry waits for a sync that can read the issue
- **A tracker comment's id was already recorded with different content** (terminal)
  - Detection: FeedbackService.add refuses the id as already used with different content
  - Response: The comment is listed as failed with that reason and the existing entry stands; nothing is overwritten
  - User impact: An edit made on the tracker after it was recorded is not mirrored
- **A comment has an author that cannot be an actor id (an empty login, a deleted user)** (recoverable)
  - Detection: The login is empty or does not make a namespaced lower-case id
  - Response: The comment is recorded under the actor github:unknown with the source kept, not dropped
  - User impact: The text is kept and its origin is traceable through the source
- **The unit has no artifact, no binding or no tracker** (recoverable)
  - Detection: The artifact id cannot be found, readBinding answers undefined, or openTracker answers a skip
  - Response: The sync does nothing and the result says why
  - User impact: A unit with no issue has nothing to read or post

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The same comment is read on two syncs | It is recorded once: the entry id tracker:<comment id> is a repeat the second time |
| A comment carries an insrc marker, or is the unmarked Attached link comment of an older attach | It is skipped and counted as a framework comment, never recorded |
| A comment whose first line is /revise but whose later line says /suggest | It is a revision-request: only the first line decides |
| A comment that starts with the word suggestion in ordinary prose | It is a plain comment: only the command forms /suggest, /revise, suggestion: and revision: count |
| An entry the tracker supplied (it has a source) is read on the outbound pass | It is not posted back: only entries with no source are posted |
| The latest tracker-sourced entry is newer than some comments not yet read | The since point is that entry's time less a margin, so the overlap is read again and the repeats record nothing |
| A Story and a Task share one TASKS feedback file | Entries stay separate by artifact id; a Task's comments are never listed under its Story |
| A reply entered here to an earlier entry | It is posted as its own comment that names the entry it replies to, once |

**Invariants to preserve**

- Feedback entries are immutable and append-only: a recorded tracker comment is never changed or removed, and an edit or deletion on the tracker is never mirrored [[c1]]
- A repeated append of the same (artifact id, entry id) is harmless: the entry id derived from the comment id makes a repeated read a no-op [[c1]]
- No revision and no status of any artifact moves for a feedback entry or a receipt [[c2]]
- The author of a recorded comment is the tracker login read from the tracker, never a declared alias [[c3]]
- A sync never fails the implement or validate phase that calls it [[c4]]

## 6. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — The pure parts: the first-line classification, the framework-comment test, and the actor, entry id and since point derived from a comment
  - Subjects: `classifyComment gives revision-request, suggestion or comment from the first line only`, `isFrameworkComment recognises the insrc markers and the older Attached link comment`, `the author, the entry id and the since point derived from a tracker comment`
  - Fixtures: `comment fixtures`
- **integration** — The sync against a real durable store and a fake tracker: inbound recording, outbound posting with its receipt and reconciliation, and the calls from the build step and the daemon method
  - Subjects: `a human comment is recorded once as feedback by the tracker user, and framework comments are never recorded`, `an edited or deleted tracker comment is not mirrored`, `feedback entered here is posted once with its receipt, and a post whose receipt was lost is found by its marker and not posted again`, `the sync failures leave the call repeatable and never fail the caller`, `implement and validate run the sync, and the daemon method tracker.syncComments runs it on request`, `FeedbackService.add stores a source and treats the same id with the same source as a repeat`, `the GitHub adapter's postComment answers the comment id and attach posts its marker`
  - Fixtures: `durableKit (a temp repo with a durable store)`, `the fake tracker of the approve-fallback kit with a comment list and postComment`, `the build-step fixtures of build-step.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac24` | `unit: comment-rules.test.ts: isFrameworkComment recognises every insrc marker and the older Attached link comment and no human text`, `integration: comment-sync-inbound.test.ts: a human comment is recorded once as feedback with the tracker user as author, framework comments are never recorded, and a tracker failure is reported without failing the call`, `integration: comment-sync-callers.test.ts: implement and validate run the comment sync for the Task and the daemon method tracker.syncComments runs it on request, and neither is failed by it` |
| `ac25` | `unit: comment-rules.test.ts: classifyComment gives revision-request, suggestion or comment from the first line only` |
| `ac26` | `integration: comment-sync-outbound.test.ts: feedback entered here is posted once and its receipt is written, a post whose receipt was lost is found by its marker and not posted again, and an edited or deleted tracker comment is not mirrored`, `integration: feedback-source.test.ts: FeedbackService.add stores a source and a repeat of the same id with the same source appends nothing`, `integration: port-post-comment.test.ts: the GitHub adapter's postComment answers the comment id and attach posts its marker` |

## 7. Migration

**State before:** Comments on an issue are read only by the s6 attach and approve-time reconciliations; nothing records a human comment as feedback. FeedbackService.add writes feedback with no source, IssueOps.comment posts without answering an id, and the attach comment carries no marker (src/workflow/feedback/feedback-service.ts, src/workflow/tracker/github-adapter.ts, src/workflow/tracker/unit-issue.ts). The build step's implement and validate phases do not touch the tracker for comments.

**State after:** A comment sync records human comments as feedback and posts locally entered feedback once, run from the build step's implement and validate phases and from the daemon method tracker.syncComments. FeedbackInput carries a source, the port has postComment, the attach comment carries a marker, and posts are recorded by revision-less receipts on the artifact's log.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional source to FeedbackInput and store it; no existing caller passes it, so stored feedback is unchanged — ↩ rollbackable
2. Add postComment to the tracker port, the GitHub adapter and the test fake, and add the marker line to the adapter's attach comment — ↩ rollbackable
3. Add the pure rules: the first-line classification and the framework-comment test — ↩ rollbackable
4. Add the comment-sync module with its inbound half (read, filter, record) and its outbound half (receipt check, marker reconciliation, post, receipt) — ↩ rollbackable
5. Call the sync best-effort from the build step's implement and validate phases and register the daemon method tracker.syncComments — ↩ rollbackable _(needs: `step 4 is in place`)_
6. Record the hand-offs in docs/plans/core-data-model.md for s9 — ↩ rollbackable

**Backward compat:** The new FeedbackInput source, the port's postComment and the marker line on attach comments are additive. Attach comments posted before this Story have no marker; isFrameworkComment recognises their shape, and s6's reconciliation of an attachment is by its link, which the new comment keeps. Nothing already stored is rewritten.

## 8. Alternatives considered

### 8.1 a1: One comment-sync module, called where the holder works, with receipts in the artifact's own log — **CHOSEN**

A single module reads human comments into feedback and posts unposted feedback, run from the build step's implement and validate phases and from a daemon method; once-only comes from entry ids and revision-less log receipts.

A new src/workflow/tracker/comment-sync.ts holds syncUnitComments. Inbound: it reads the unit's issue from its binding, lists comments since a point derived from the artifact's latest tracker-sourced feedback (less a margin, because an overlap is harmless), drops every comment the framework posted (a marker test plus the pre-marker 'Attached' shape), and records each remaining comment through FeedbackService.add with the entry id tracker:<comment id> (so a repeat records nothing), the tracker login as a github:<login> actor, a kind taken from the first line (/revise or revision: gives revision-request, /suggest or suggestion: gives suggestion, anything else comment) and a source of { system: github, externalId, url }. Outbound: for each entry of the artifact that came from a person here (no source) and has no receipt, it looks for a comment carrying the entry's marker <!-- insrc:feedback:<artifactId>:<feedbackId> -->, posts one if none is found (through a new TrackerPort.postComment that returns the comment id), and appends a revision-less log entry on the artifact as the durable receipt (operation update, outcome posted, data kind feedback-post with feedbackId, externalId, issue). A tracker edit or deletion is never read back: a stored line is immutable and a recorded comment id is never revisited. The sync runs best-effort in the build step's implement and validate phases for the Task, and on request through a daemon method tracker.syncComments; a failure is returned in the result and never fails the phase. FeedbackInput gains an optional source (additive, s5's service).

### 8.2 a2: Keep the sync cursor and the receipts on the tracker binding

The binding gains a comments block with the last read time and the posted receipts.

TrackerBinding gets a comments field: lastReadAt and posted receipts keyed by feedback id. The sync reads and patches the binding with the same synchronous meta-only patch s6 uses, instead of the artifact's log.

**Rejected because:** Exact cursor, but it changes s6's binding shape and risks a double post on a lost patch.

### 8.3 a3: A background poller for every bound issue

A daemon loop reads comments for every open unit on an interval.

The daemon runs a timer that lists comments for each bound open issue and records them.

**Rejected because:** Violates the Story's no-polling requirement and spends calls on units nobody works on.

### 8.4 a4: Read comments on request only

Only the daemon method reads comments; implement and validate do not.

tracker.syncComments is the single entry; the build phases are left alone.

**Rejected because:** Smallest, but fails ac24.

## 9. References

- **[[c1]]** `analyze-bundle` `the feedback service s8 records tracker comments through` — "a caller-chosen id makes the call idempotent (the same id with the same fields returns the stored entry and appends nothing, different fields are refused)"
- **[[c2]]** `analyze-bundle` `the tracker port's comment reading and the comments the framework itself posts` — "Every one of them is posted from the user's own gh login, so the author cannot tell a framework post from a human comment; only the markers can."
- **[[c3]]** `analyze-bundle` `where a unit's issue and artifact are found` — "a Task's the binding on its TASK head, found from the plan row by taskHeadIdOf"
- **[[c4]]** `analyze-bundle` `where the holder works on a unit: implement, validate and the daemon methods` — "Nothing polls: s6 and s7 added no background loop."

## 10. Open questions

- FeedbackInput gets an optional source field, which is a change to the s5 feedback service (src/workflow/feedback/feedback-service.ts). Resolve: accept it as an additive s8-owned change (recommended), or record a tracker comment's origin only in its entry id and text (no source on the entry).
- TrackerPort gains postComment so a post answers its comment id, an additive method on the sc6 port s6 owns. Resolve: accept it as additive with no HLD amendment (recommended), or file a sharedContract.methodAdd amendment on sc6 first.
- The attach comment gets a marker line so the framework's own comments are told by a marker. This changes the text s6's attach posts, though not its link. Resolve: accept (recommended), or keep the attach comment as it is and recognise it only by its shape.
- The comment commands are /revise and revision: for a revision request, /suggest and suggestion: for a suggestion, on the first line only. Resolve: accept these forms (recommended), or name other words.
- A Story's comments are recorded on the artifact that holds its binding, the LLD, until s9 gives the Story its own artifact. Resolve: accept and record the move for s9 in docs/plans/core-data-model.md (recommended), or record Story comments only once the Story artifact exists.

## Resolved questions

- `q57bc254e` — FeedbackInput gets an optional source field, which is a change to the s5 feedback service (src/workflow/feedback/feedback-service.ts). Resolve: accept it as an additive s8-owned change (recommended), or record a tracker comment's origin only in its entry id and text (no source on the entry).
  - **resolved**: Accept it as an additive s8-owned change (recommended) — Approved with the LLD (option A, recommended answers). _(2026-10-21T20:15:57.505Z)_

## Citations

- **[[c1]]** `analyze-bundle` `the feedback service s8 records tracker comments through` — "a caller-chosen id makes the call idempotent (the same id with the same fields returns the stored entry and appends nothing, different fields are refused)"
- **[[c2]]** `analyze-bundle` `the tracker port's comment reading and the comments the framework itself posts` — "Every one of them is posted from the user's own gh login, so the author cannot tell a framework post from a human comment; only the markers can."
- **[[c3]]** `analyze-bundle` `where a unit's issue and artifact are found` — "a Task's the binding on its TASK head, found from the plan row by taskHeadIdOf"
- **[[c4]]** `analyze-bundle` `where the holder works on a unit: implement, validate and the daemon methods` — "Nothing polls: s6 and s7 added no background loop."
