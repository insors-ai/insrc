<!-- insrc:artifact LLD-2f27754d4ad00b8e-s5 -->

# LLD: E202610212f27754d:S005

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `aea12dd76292...`

Story s5 lets a person add feedback or a reply on any artifact, a Task included, and see what is still open. Every entry is one immutable line with a namespaced author, the time and the artifact revision it was made against; a reply is its own line that names its parent, and a revision of the artifact addresses all open feedback unless its author lists only some. A per-user identity file links a person's several accounts for display, while the gates keep deciding on the tracker's own identity.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-2f27754d4ad00b8e** § 2. Framework summary

**Rollout phase:** Phase C — feedback and tracker binding
**Consumes:** `sc1` (ArtifactIdScheme), `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords), `sc5` (SidecarStorage)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal

### 2.1 `FeedbackService.add`

```typescript
add(artifactId: string, input: FeedbackInput, actor: Actor): Promise<Feedback>
```

**Parameters:**
- `artifactId: string` — The artifact the feedback is about; a TASK id is stored in its Story's Tasks feedback file.
- `input: { text: string; kind?: 'comment'|'suggestion'|'revision-request'; anchor?: Feedback['anchor']; inReplyTo?: string; batchId?: string; id?: string }` — The entry's content. kind defaults to comment. id is an optional caller-chosen key that makes a retried add harmless.
- `actor: Actor` — Who wrote it: a person, agent or system with a namespaced lower-case id.

**Returns:** `Promise<Feedback>` — The entry as stored: id, timestamp and the artifact's current revision filled in, feedback an empty list.

**Errors:**
- `ArtifactNotFoundError` when the artifact has no head (a Task before its artifact exists)
- `HistoryEntryError` when blank text, unknown kind, a malformed anchor or id, an actor that is not namespaced, an inReplyTo that names no entry of this artifact or an entry that is itself a reply, or a repeated id with different content

**Preconditions:**
- the repository has a registry entry (lifecycleFor)

**Postconditions:**
- exactly one framed line is appended to the artifact's feedback file, or none when the same id and content were already stored
- the entry is never changed or removed afterwards; the service has no edit or delete call
- timestamp is minted by the service and revision is the head's revision number at that moment

### 2.2 `FeedbackService.threads`

```typescript
threads(artifactId: string, scope?: { open?: boolean }): Promise<FeedbackThread[]>
```

**Parameters:**
- `artifactId: string` — The artifact whose feedback is wanted.
- `scope: { open?: boolean }` _(optional)_ — With open true, only threads whose root no later update has addressed.

**Returns:** `Promise<FeedbackThread[]>` — Root entries in reader order (timestamp, then id), each with its replies in the same order, an addressed flag and the id of the log entry that addressed it.

**Errors:**
- `HistoryReadError` when the feedback or log file holds a complete frame that is not valid

**Postconditions:**
- a reply whose parent is missing (a merged or hand-edited file) is returned as an orphan root with orphan true and is never dropped
- replies are never listed on their own as open items; a thread is open when its root is open

### 2.3 `History.openFeedback`

```typescript
openFeedback(id: string): Promise<Feedback[]>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<Feedback[]>` — The feedback no later log entry addresses, in reader order.

**Errors:**
- `HistoryReadError` when an unreadable file

**Postconditions:**
- consumed unchanged by FeedbackService.threads; FeedbackService filters out replies

### 2.4 `History.appendFeedback`

```typescript
appendFeedback(id: string, f: Feedback): Promise<void>
```

**Parameters:**
- `id: string` — The artifact id.
- `f: Feedback` — The entry; validated before it is appended.

**Returns:** `Promise<void>` — Resolves once the line is appended.

**Errors:**
- `HistoryEntryError` when validateFeedback fails, which now also checks that inReplyTo is a non-empty string different from the entry's own id and that a reply carries no nested replies

**Postconditions:**
- unchanged otherwise: the one append path for feedback

### 2.5 `LifecycleService.updateContent`

```typescript
updateContent(id: string, by: Actor, payload: HeadPayload, opts?: ContentWriteOptions): Promise<boolean>
```

**Parameters:**
- `id: string` — The artifact.
- `by: Actor` — The author of the revision.
- `payload: HeadPayload` — The new content.
- `opts: ContentWriteOptions` _(optional)_ — Gains addresses: 'all' | string[], the feedback root ids this revision addresses.

**Returns:** `Promise<boolean>` — True when a write was made.

**Errors:**
- `HistoryEntryError` when addresses names an id that is not a root feedback entry of this artifact, or an entry an earlier revision already addressed

**Postconditions:**
- when the revision number moves and no addresses is given, the logged update entry carries addresses 'all'
- a list leaves every other root open
- an update that changes no content (the revision does not move) addresses nothing

### 2.6 `ArtifactStore.update`

```typescript
update(id: string, by: Actor, mutate: (current) => Promise<UpdateResult | undefined> | UpdateResult | undefined, options?: WriteOptions): Promise<boolean>
```

**Parameters:**
- `id: string` — The artifact.
- `by: Actor` — The author.
- `mutate: function` — Builds the next artifact from the current one.
- `options: WriteOptions` _(optional)_ — Carries addresses, already a field of WriteOptions.

**Returns:** `Promise<boolean>` — True when a write was made.

**Errors:**
- `HistoryEntryError` when as for LifecycleService.updateContent

**Postconditions:**
- the addresses rule (default 'all' on a revision, validation of listed ids) is applied in ArtifactStore.write, so every writer of a revision gets it

### 2.7 `IdentityService.currentActor`

```typescript
currentActor(repoPath: string): Promise<Actor>
```

**Parameters:**
- `repoPath: string` — The repository, for the tracker and git configuration.

**Returns:** `Promise<Actor>` — The person acting: github:<login> from the tracker's whoAmI when it answers, else git:<email>, else os:<user>@<host>; kind person; the declared aliases of the identity file copied into properties.aliases when this id is the declared primary or one of the aliases.

**Postconditions:**
- never throws: a tracker that does not answer falls through to the next source
- the id is lower-case and namespaced
- the result is for attribution; no gate reads it

### 2.8 `IdentityService.declare`

```typescript
declare(decl: { primary: string; aliases: string[] }): Promise<IdentityFile>
```

**Parameters:**
- `decl: { primary: string; aliases: string[] }` — The person's own ids. Every id is namespaced and lower-case; the primary is not repeated in aliases.

**Returns:** `Promise<IdentityFile>` — The file as written.

**Errors:**
- `IdentityError` when an id that is not namespaced and lower-case, a duplicate, or more than 20 aliases

**Postconditions:**
- the file ~/.insrc/identity.json is replaced atomically
- nothing outside attribution and display reads it

### 2.9 `IdentityService.show`

```typescript
show(): Promise<IdentityFile | undefined>
```

**Returns:** `Promise<IdentityFile | undefined>` — The declared identity, or undefined when none was declared.

**Errors:**
- `IdentityError` when the file exists and is not valid; it is reported, not treated as empty

**Postconditions:**
- read-only

### 2.10 `TrackerPort.whoAmI`

```typescript
whoAmI(): PortResult<string>
```

**Returns:** `PortResult<string>` — The signed-in tracker login.

**Postconditions:**
- unchanged; the gates in src/workflow/team/gate.ts keep calling it directly and never call IdentityService

### 2.11 `handleReviewDecision`

```typescript
handleReviewDecision(params: ReviewDecisionRequest | undefined, repoEnv: string | undefined, deps?: ReviewDecisionDeps): Promise<ReviewDecisionResult | ReviewDecisionError>
```

**Parameters:**
- `params: ReviewDecisionRequest | undefined` — The decision and its comments.
- `repoEnv: string | undefined` — The environment's repository.
- `deps: ReviewDecisionDeps` _(optional)_ — Gains feedbackFor, the repository's FeedbackService.

**Returns:** `Promise<ReviewDecisionResult | ReviewDecisionError>` — As today, with entryIds now the ids of the stored Feedback entries.

**Postconditions:**
- with a FeedbackService the decision's comments are stored as Feedback entries by the request's actor (else currentActor), kind revision-request for send-feedback and comment for approve and reject, all with one batchId; without one the legacy body.feedback writer runs as before (tests only)

### 2.12 `appendFeedback`

```typescript
appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult
```

**Parameters:**
- `req: AppendFeedbackRequest` — The legacy body.feedback request; the daemon's artifact.feedback.append handler stops calling it and calls FeedbackService.add.

**Returns:** `AppendFeedbackResult` — Unchanged.

**Postconditions:**
- still exists for the callers outside the daemon and for tests until s9 retires body.feedback

## 3. Data model changes

### 3.1 `Feedback` — field-add

Adds optional inReplyTo: string (a root entry's id). A reply is a separate line with feedback: []. Ids are minted as 32 hex characters (a uuid without dashes), or taken from the caller's id; validateFeedback rejects an inReplyTo equal to the entry's own id. Everything else is the s2 shape.

```
interface Feedback { ...; readonly inReplyTo?: string | undefined }
```

**Call sites:**
- `src/workflow/artifact-core/types.ts`
- `src/workflow/artifact-core/history.ts`

### 3.2 `ChangeLogEntry.addresses` — invariant-change

An update entry whose revision number is higher than the previous entry's carries addresses 'all' unless the writer gave a list; a lifecycle operation or an update with no revision change carries none and addresses nothing. This is the Gap 5 rule that open feedback is whatever no later update addressed.

**Call sites:**
- `src/workflow/artifact-core/store.ts`
- `src/workflow/artifact-core/history.ts`

### 3.3 `FeedbackThread` — new

A read-time view, never stored: { root: Feedback; replies: Feedback[]; addressed: boolean; addressedBy?: string; orphan?: boolean }.

**Call sites:**
- `src/workflow/artifact-core/history.ts`

### 3.4 `IdentityFile` — new

~/.insrc/identity.json, { primary: string; aliases: string[] }, every id namespaced and lower-case. Self-declared, local to the machine, used for attribution and display only. Private to this Story.

**Call sites:**
- `docs/plans/core-data-model.md#gap-9-actor-identity-settled`

### 3.5 `Actor.properties.aliases` — invariant-change

When an actor is recorded, the declared aliases are copied into properties.aliases only when the actor's id is the declared primary or one of the aliases; a linked id never makes one actor stand for another in any decision.

**Call sites:**
- `src/workflow/artifact-core/types.ts`
- `src/workflow/team/gate.ts`

## 4. Diagrams

- [ER model](docs/epics/one-common-model-every-artifact-E202610192f27754d/S005/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | Uses History.appendFeedback, feedback and openFeedback and the ChangeLogEntry.addresses field; asks for one additive field (inReplyTo) through the amendment above. |
| `sc5` | consumes | Reads and appends feedback through the SidecarStore (filesOf, appendRecord, readRecords) as built by s4; a Task's feedback lands in its Story's Tasks file and is filtered by artifact id. |
| `sc2` | consumes | Reads the head through ArtifactStore.read (existence and current revision) and uses readWithHistory for the combined view; Actor is the sc2 shape. |
| `sc1` | consumes | Validates and classifies artifact ids with ArtifactIds.parse (a TASK id maps to its Tasks file). |

## 6. Error paths

**Error cases**

- **Feedback is added to a Task whose artifact does not exist yet** (recoverable)
  - Detection: ArtifactStore.read(artifactId) raises ArtifactNotFoundError before any line is appended
  - Response: FeedbackService.add rethrows it; nothing is written
  - User impact: A person gets 'no such artifact'; a Task takes feedback once the plan approval creates its artifact (s7)
- **A reply names a parent that is missing, belongs to another artifact, or is itself a reply** (recoverable)
  - Detection: add reads the artifact's feedback and looks the inReplyTo id up among root entries
  - Response: HistoryEntryError naming the id; nothing is appended
  - User impact: The reply is refused with the reason; the person re-sends it against the thread's root
- **A retried add with the same caller id but different text** (recoverable)
  - Detection: the sidecar reader sees one (artifactId, id) with two contents and raises HistoryReadError; add checks the stored entry for the id before appending
  - Response: HistoryEntryError 'id already used with different content'; the first entry stays as stored
  - User impact: The client learns its key was reused; the original entry is intact
- **A process dies after the line is appended but before the caller sees the result, and the client retries with the same id** (recoverable)
  - Detection: add finds an identical stored entry for the id
  - Response: returns the stored entry and appends nothing
  - User impact: No duplicate; the retry returns the first result
- **A revision lists feedback ids in addresses that are not roots of this artifact, or were addressed by an earlier revision** (recoverable)
  - Detection: ArtifactStore.write reads the artifact's feedback and its earlier update entries before staging
  - Response: HistoryEntryError listing the unknown ids; nothing is staged and the head is unchanged
  - User impact: The revision is refused and says which ids are wrong
- **The identity file is present but is not valid JSON, or holds an id that is not namespaced and lower-case** (recoverable)
  - Detection: IdentityService.show parses and validates the file
  - Response: IdentityError naming the file and the problem; currentActor logs it and records the actor without aliases, so feedback is never blocked by the file
  - User impact: Attribution continues with no links; show and declare report the problem
- **The tracker does not answer whoAmI (not signed in, offline, no tracker)** (recoverable)
  - Detection: PortResult is not ok, or the tracker cannot be loaded
  - Response: currentActor falls back to git:<email>, then os:<user>@<host>; the fallback and the reason are logged
  - User impact: The entry is recorded under a git or OS identity; gates are unaffected because they never read this
- **A request names an actor that is not a namespaced lower-case id** (recoverable)
  - Detection: approvalActorOf and the add path's actor check
  - Response: the request is refused with the id it received; nothing is recorded
  - User impact: The client fixes the id; no entry is attributed to a guessed identity
- **The review decision stored the approval but saving its comments through the service fails** (recoverable)
  - Detection: handleReviewDecision catches the add error after the decision took effect
  - Response: the result reports commentsError exactly as it does now; the decision stays
  - User impact: The approval stands and the person is told the comments were not saved
- **Two clones add feedback to one artifact and are merged** (recoverable)
  - Detection: the feedback file is merge=union; the reader dedupes by (artifactId, id)
  - Response: both sets of lines are read once each, ordered by time then id; two different entries that picked the same caller id are a HistoryReadError on read
  - User impact: Both people's feedback appears; a true id clash is reported, not hidden

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A reply to a reply | refused: threads are one level deep, so the reply is made against the root (the nested feedback[] of the s2 shape stays for tracker-ingested entries) |
| Feedback added with no kind | stored as comment |
| A revision that changes no content (an identical rewrite) | writes nothing, so nothing is addressed and all feedback stays open |
| A revision with addresses as an empty list | valid: it addresses nothing, every root stays open |
| A lifecycle operation such as approve or review | its log entry has no addresses; approval does not resolve feedback |
| A reply added after its root was addressed | stored; the thread stays addressed because the reply carries no state, and a later revision does not need to address it |
| A person whose github id is the declared primary and whose jira id is an alias adds feedback | recorded as github:<login> with properties.aliases [jira:<id>]; a different person's actor never receives these aliases |
| Feedback with the same timestamp as the update that addresses it | ordered by the shared (timestamp, id) rule: the update addresses it only when its id sorts after the feedback's |
| A Task id | the line goes to the Story's TASKS feedback file with the TASK id as artifactId, and is read back for that Task only |

**Invariants to preserve**

- A stored feedback line is never edited or removed: the service has no edit or delete call and appendRecord is the only writer of the file [[c1]]
- A repeated append of the same (artifactId, id) with the same content is harmless, and with different content is corruption the reader reports (s4's rule is not weakened) [[c2]]
- Gates decide on TrackerPort.whoAmI only; nothing under src/workflow/team imports the identity module or reads the identity file [[c4]]
- A revision moves only when content changes (k3); addressing feedback and adding feedback never move it [[c5]]
- Open feedback is derived from the log, never stored on an entry, and uses the shared (timestamp, id) order so the feedback and log files agree whichever is read first [[c1]]
- The legacy body.feedback writers and readers keep working until s9 retires them; s5 adds no compatibility code for them [[c3]]

## 7. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), with node:assert/strict; tests live in __tests__ beside the code; the registry and the line files run over a temporary repository directory, the identity file over a temporary HOME`

**Test levels**

- **unit** — The single-module behaviour of the feedback service, the thread builder, the addresses rule and the identity module.
  - Subjects: `FeedbackService.add stores one root entry with the author, a minted id and time and the head's revision, defaults the kind to comment, and refuses blank text, a non-namespaced actor and a malformed anchor`, `FeedbackService.add stores a reply as its own line with inReplyTo, refuses a missing parent, a parent on another artifact and a reply to a reply, and a repeated caller id returns the stored entry or is refused when the content differs`, `FeedbackService.threads nests replies under their root in time-then-id order, returns an orphan reply as an orphan root, never lists a reply on its own as open, and filters to open threads`, `ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation`, `History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies`, `IdentityService.currentActor builds github:<login> from the tracker's whoAmI, falls back to git then os when the tracker does not answer, and copies the declared aliases only onto the declared primary or an alias`, `IdentityService.declare validates namespaced lower-case ids, rejects duplicates and more than twenty aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty`
  - Fixtures: `a temporary repository with the durable store (durable-kit.ts)`, `a fake whoAmI returning a login, an error, or nothing`, `a temporary HOME for the identity file`
- **integration** — The acceptance criteria over the real storage, the daemon wiring and the gates.
  - Subjects: `feedback on a design, a plan and a single Task is recorded once as a framed line in the right file, survives a restart, and a Task's line lands in its Story's Tasks file and reads back for that Task only`, `a revision of an artifact addresses all its open feedback by default and only the listed roots when a list is given, in the shared (timestamp, id) order with the feedback file read first or last`, `two clones that add feedback and replies to one artifact merge with no conflict and the threads read back once each in order`, `handleReviewDecision stores its comments as Feedback entries by the request's actor or the current actor, with kind revision-request for send-feedback and one batchId, and still reports commentsError when saving fails after the decision`, `the daemon's artifact.feedback.add, artifact.feedback.list, artifact.feedback.append, identity.show and identity.declare handlers use the repository's FeedbackService and the identity service`, `the team gate decides on the tracker's whoAmI only: declaring the claimant's login as an alias of another person does not change the gate's outcome, and nothing under src/workflow/team imports the identity module`
  - Fixtures: `git available on the path, with a skip when it is not`, `a temporary repository registered in the lifecycle registry`, `a fake tracker for the gate test`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac14` | `src/workflow/feedback/__tests__/feedback-service.test.ts: FeedbackService.add stores one root entry with the author, a minted id and time and the head's revision, defaults the kind to comment, and refuses blank text, a non-namespaced actor and a malformed anchor`, `src/workflow/feedback/__tests__/feedback-service.test.ts: FeedbackService.add stores a reply as its own line with inReplyTo, refuses a missing parent, a parent on another artifact and a reply to a reply, and a repeated caller id returns the stored entry or is refused when the content differs`, `src/workflow/feedback/__tests__/feedback-storage.test.ts: feedback on a design, a plan and a single Task is recorded once as a framed line in the right file, survives a restart, and a Task's line lands in its Story's Tasks file and reads back for that Task only`, `src/workflow/feedback/__tests__/feedback-merge.test.ts: two clones that add feedback and replies to one artifact merge with no conflict and the threads read back once each in order`, `src/workflow/__tests__/review-decision.test.ts: handleReviewDecision stores its comments as Feedback entries by the request's actor or the current actor, with kind revision-request for send-feedback and one batchId, and still reports commentsError when saving fails after the decision` |
| `ac15` | `src/workflow/artifact-core/__tests__/addresses-rule.test.ts: ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation`, `src/workflow/feedback/__tests__/feedback-threads.test.ts: FeedbackService.threads nests replies under their root in time-then-id order, returns an orphan reply as an orphan root, never lists a reply on its own as open, and filters to open threads`, `src/workflow/feedback/__tests__/feedback-storage.test.ts: a revision of an artifact addresses all its open feedback by default and only the listed roots when a list is given, in the shared (timestamp, id) order with the feedback file read first or last` |
| `ac16` | `src/workflow/identity/__tests__/identity-service.test.ts: IdentityService.currentActor builds github:<login> from the tracker's whoAmI, falls back to git then os when the tracker does not answer, and copies the declared aliases only onto the declared primary or an alias`, `src/workflow/identity/__tests__/identity-service.test.ts: IdentityService.declare validates namespaced lower-case ids, rejects duplicates and more than twenty aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty`, `src/workflow/identity/__tests__/gate-identity.test.ts: the team gate decides on the tracker's whoAmI only: declaring the claimant's login as an alias of another person does not change the gate's outcome, and nothing under src/workflow/team imports the identity module`, `src/daemon/__tests__/feedback-wiring.test.ts: the daemon's artifact.feedback.add, artifact.feedback.list, artifact.feedback.append, identity.show and identity.declare handlers use the repository's FeedbackService and the identity service` |

## 8. Migration

**State before:** Feedback reaches an artifact only as body.feedback in its head JSON, written by appendFeedback and appendFeedbackBatch (the daemon's artifact.feedback.append and the review decision), with a plain-name author, no replies, no revision-request kind and no addresses. The sidecar History.appendFeedback exists (s2) over the durable line files (s4) but nothing in production calls it; no namespaced actor is built for a person and no identity file exists. Gates decide on TrackerPort.whoAmI.

**State after:** A FeedbackService over History records feedback and replies on any artifact, a Task included, as immutable framed lines with a namespaced actor; every revision addresses open feedback by default or by list; an identity service builds the person's actor and reads the local identity file for display only; the daemon's feedback add and list, identity show and declare, the artifact.feedback.append handler and the review decision's comments all go through the service. Gates are unchanged. Entries already in body.feedback stay where they are until s9 converts them.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional inReplyTo field to the Feedback shape and its validation in History, and file the sc3 amendment; no stored line changes — ↩ rollbackable
2. Apply the addresses rule in the store: stamp 'all' on an update that moves the revision, validate listed ids; existing update entries without addresses are read as addressing nothing, as before — ↩ rollbackable
3. Add the feedback module (service, thread view) and the identity module with its local file, unused by any caller yet — ↩ rollbackable
4. Give the registry entry a FeedbackService and add the daemon methods for feedback add and list and for identity show and declare — ↩ rollbackable
5. Point artifact.feedback.append and the review decision's comments at the service for every artifact the registry can read; the legacy body.feedback writers stay in place for callers outside the daemon and for tests — ↩ rollbackable _(needs: `step 4 shipped`)_
6. Record in the plans document what s9 must do with body.feedback entries (convert them into feedback lines with a synthesised actor and kind) and that the readers of body.feedback show only old entries until then — ↩ rollbackable

**Backward compat:** No compatibility code is added, by the owner's ruling for this branch. The only existing public surfaces are the daemon's artifact.feedback.append request, which keeps its request shape and now stores a Feedback line (its author string becomes the actor name when no actor id is given, its kind 'feedback' is stored as revision-request), and the review decision's request and result, whose entryIds are now Feedback ids. Callers of the legacy writers outside the daemon keep working unchanged. Entries already written to body.feedback are not read by the new service and not rewritten until the s9 conversion.

## 9. Alternatives considered

### 9.1 a1: Feedback service, flat lines with inReplyTo, one identity module — **CHOSEN**

A FeedbackService over History records entries and replies as flat immutable lines (a reply names its parent in a new inReplyTo field), a thread view nests them at read, and an identity module builds namespaced actors; the production feedback writers move onto it.

A new feedback module (service plus pure thread builder) sits on History and the s4 registry. add(artifactId, input, actor) checks the artifact exists, the actor is namespaced, a reply's parent exists on the same artifact and is not itself a reply, mints the id and the time, validates through History.appendFeedback and returns the stored entry; there is no edit or delete call. Because a stored line can never be rewritten, a reply is its own line carrying inReplyTo (the parent's id); this needs one added optional field on the sc3 Feedback shape, filed as an amendment to the HLD and validated by History.validateFeedback, and threads(artifactId) nests replies under parents at read (the stored feedback[] stays empty for new lines, so the s2 shape and its recursion still hold for tracker-ingested entries s8 may write). open(artifactId) is History.openFeedback, ordered by the shared (timestamp, id) rule; the addresses of a revision are chosen by the author when the content update is recorded (LifecycleService.updateContent and ArtifactStore.update take an addresses option, default 'all'; a list leaves the rest open, and a list naming an unknown id is refused). An identity module reads ~/.insrc/identity.json ({ primary, aliases[] }, self-declared, attribution only), builds Actors (github:<login> from the tracker's whoAmI, git:<email>, os:<user>@<host> as fallbacks) with the declared aliases copied into properties.aliases, and exposes declare/show; gates keep calling the tracker's whoAmI directly and never read the file. The daemon gets IPC methods to add, list and declare, and artifact.feedback.append and the review decision's comments are re-pointed at the service for every artifact the registry can store, the legacy body.feedback reader staying until s9.

### 9.2 a2: New path only, legacy writers untouched until s9

The same service, thread view and identity module, but artifact.feedback.append and the review decision keep writing body.feedback, so new feedback calls are the only users of the sidecar.

Build the FeedbackService, the thread builder and the identity module as in a1 (same inReplyTo amendment, same addresses option, same identity file), expose them through new IPC methods, and leave the legacy appendFeedback and appendFeedbackBatch writers, their IPC and the review pane's comment saving exactly as they are; s9's conversion later moves old entries into the line files and retires body.feedback and its writers together.

**Rejected because:** Cheapest and safest to ship, but it leaves the most used feedback path outside ac14 to ac16 and leaves two stores for s9 to reconcile, which the acceptance criteria say should be one.

### 9.3 a3: Replies stored inside the parent, merged at read

A reply is appended as a new line with the parent's id and the reply in feedback[], and the reader merges lines that share an id into one thread, so no new Feedback field is needed.

Keep the sc3 Feedback shape exactly as s2 shipped it. add() of a top-level entry appends one line; a reply appends a second line with the SAME id and text as the parent and a feedback[] holding the reply, and the sidecar reader (s4's sc5) merges lines with the same (artifactId, entry id) by concatenating their feedback[] instead of treating different content as a conflict; the thread view is then the merged list. The identity module and the addresses option are as in a1.

**Rejected because:** Avoids a new field by weakening the integrity rule of the storage s4 built; it violates ac14, k4 and the ownership of sc5.

## 10. References

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/history.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/artifact-core/sidecar-store.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/artifacts/provenance/writer.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/team/gate.ts`
- **[[c5]]** `doc` `docs/plans/core-data-model.md#gap-9-actor-identity-settled`

## 11. Open questions

- ep3: the invariants name the capability ids c1 to c5 whose citations point at the s1 bundles, but they do not quote the bundle text
- A legacy review comment can target a companion file (target.file other than the artifact's own document, for example a diagram or mock) while the Feedback shape has an anchor but no file: should such a comment be stored on the companion's own DIAG artifact when one exists, kept on the parent artifact with the file path in anchor.section, or have its file dropped?
- The legacy kind 'feedback' (a request to change the artifact) has no direct match: should it be stored as revision-request, as comment, or by the decision it came with (send-feedback to revision-request, approve and reject to comment)?
- The readers of body.feedback (companion headers, delivery) will show only entries written before s5 until the s9 conversion, while new feedback is in the line files: should s5 add the line-file entries to those readers, or leave the mixed view until s9?

## Resolved questions

- `q684a09a1` — A legacy review comment can target a companion file (target.file other than the artifact's own document, for example a diagram or mock) while the Feedback shape has an anchor but no file: should such a comment be stored on the companion's own DIAG artifact when one exists, kept on the parent artifact with the file path in anchor.section, or have its file dropped?
  - **resolved**: Keep on the parent artifact with the file path in anchor.section — No DIAG lookup; the file is not lost and the thread stays on the artifact the person reviewed. _(2026-10-21T11:51:00.707Z)_
- `q937a3db7` — The legacy kind 'feedback' (a request to change the artifact) has no direct match: should it be stored as revision-request, as comment, or by the decision it came with (send-feedback to revision-request, approve and reject to comment)?
  - **resolved**: By the decision that took effect (feedback to revision-request, approve and reject to comment) — A withheld approval records its comments under the feedback decision, which is a request to change the artifact; the legacy IPC kind feedback maps to revision-request. _(2026-10-21T11:51:36.440Z)_
- `qb737f0d4` — The readers of body.feedback (companion headers, delivery) will show only entries written before s5 until the s9 conversion, while new feedback is in the line files: should s5 add the line-file entries to those readers, or leave the mixed view until s9?
  - **resolved**: Leave the mixed view until s9 — The readers switch with the conversion; s5 adds no reader changes. _(2026-10-21T11:52:19.055Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/history.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/artifact-core/sidecar-store.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/artifacts/provenance/writer.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/team/gate.ts`
- **[[c5]]** `doc` `docs/plans/core-data-model.md#gap-9-actor-identity-settled`
