<!-- insrc:artifact LLD-2f27754d4ad00b8e-s6 -->

# LLD: E202610212f27754d:S006

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `bd468fd6cd6c...`

Story s6 gives each Epic and Story one typed tracker binding on its artifact's envelope, and lets a plan, design, diagram or build, review or test record be attached to the unit's issue as a commit-pinned GitHub link. The tracker port gains listComments and attach (GitHub only, through the gh CLI). Posts to an issue carry a stable marker and are reconciled through listComments before any retry, so a post that succeeded and lost its record is never repeated; a link under the parent that failed stays pending and is retried the next time the unit is ensured. Team mode and individual mode (a repository with no team policy) run the same issue, binding, post and attach path; they differ only in claims and in the Task-issue policy.

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

**Rollout phase:** Phase C — feedback and tracker binding
**Owns:** `sc6` (TrackerBinding)
**Consumes:** `sc1` (ArtifactIdScheme), `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords), `sc4` (Lifecycle)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TrackerPort.listComments`

```typescript
listComments(issue: IssueRef, since?: string): PortResult<TrackerComment[]>
```

**Parameters:**
- `issue: IssueRef` — The issue, written owner/repo#N.
- `since: string` _(optional)_ — ISO time; only comments created or updated at or after it.

**Returns:** `PortResult<TrackerComment[]>` — Every comment of the issue in ascending time order, complete across pages, as { externalId, author, text, at, url? }.

**Errors:**
- `PortResult failure (kind unreachable | missing-signin | missing-tool | rejected)` when gh cannot be run, is not signed in, or the issue cannot be read; a failed read is a failure, never an empty list.

**Preconditions:**
- issue is a well-formed owner/repo#N

**Postconditions:**
- read-only: no comment or issue is changed
- implemented for the GitHub adapter only, through gh api; no direct REST call

### 2.2 `TrackerPort.attach`

```typescript
attach(issue: IssueRef, artifact: Reference, link: string): PortResult<{ externalId?: string }>
```

**Parameters:**
- `issue: IssueRef` — The unit's issue.
- `artifact: Reference` — The artifact being attached (entityId, type); names it in the comment text.
- `link: string` — The commit-pinned permalink to the file.

**Returns:** `PortResult<{ externalId?: string }>` — externalId is the id of the comment that carries the link.

**Errors:**
- `PortResult failure` when the comment cannot be posted; nothing is known to have been posted when the failure is before the call, and an unconfirmed failure is reconciled by link before a retry.

**Preconditions:**
- link contains the artifact's file path at a commit

**Postconditions:**
- GitHub has no attachment API: the adapter posts one comment holding the link; a second attach of the same link is the caller's to avoid by reconciling first

### 2.3 `readBinding`

```typescript
readBinding(repoPath: string, artifactId: string): TrackerBinding | undefined
```

**Parameters:**
- `repoPath: string` — The repository.
- `artifactId: string` — A lifecycle artifact id (the Define for an Epic, the LLD for a Story until s9 creates Epic and Story artifacts).

**Returns:** `TrackerBinding | undefined` — The envelope's binding, or undefined when the artifact has none or does not exist.

**Errors:**
- `ArtifactShapeError` when meta.envelope.binding is present and malformed; ensureUnitIssueDetailed calls readBinding before its local resolve and returns a before-create failure; resolveUnitIssueLocal, which the gate and the draft hook call, reports no local issue and the gate's ensure then reports the same failure.

**Postconditions:**
- synchronous and read-only: the team gate reads it on its synchronous path
- its callers are the team gate's teamContext, the draft-issue hook's fast path and its 'could not be recorded' result (src/workflow/draft-issues.ts:113-133) and, through teamContext with createIssue false, the handoff check (src/workflow/team/handoff.ts:395)
- resolveUnitIssueLocal reads the binding for an Epic or Story unit; with no binding it reads the older epicRef, storyRef or the Define's storyRefs and binds the unit from that ref (a one-way rebind, so no second issue is created for an issue that predates unit labels and artifact-id titles); a Task unit still reads its Plan record. s9 removes the fallback with the old fields

### 2.4 `bindArtifact`

```typescript
bindArtifact(repoPath: string, artifactId: string, issue: IssueRef, now?: () => string): BindResult
```

**Parameters:**
- `repoPath: string` — The repository.
- `artifactId: string` — The artifact to bind.
- `issue: IssueRef` — The one issue of the unit.
- `now: () => string` _(optional)_ — Clock for tests.

**Returns:** `BindResult` — { ok: true, binding, created } when the artifact is now bound to this issue (created false when it already was), or { ok: false, reason } when it is bound to a different issue.

**Errors:**
- `BindResult failure` when the artifact already holds a binding to another issue (a unit has exactly one issue), or the head cannot be read or written.

**Preconditions:**
- the artifact head exists

**Postconditions:**
- writes meta.envelope.binding { reference: { entityId: issue, type: 'github:issue', relation: 'tracked-by' }, createdAtRevision: the head's revision number, posted: [] } as one meta-only write; the revision number and content hash do not move
- a repository with no tracker never reaches this call, so it has no binding
- refuses and returns false (or a failed result with the reason 'a store write is staged for this artifact') when the artifact has a pending journal operation (.insrc/journal/<id>.json exists), so a patch never changes a head the store has staged a write against; every caller retries at its next call

### 2.5 `recordPosted`

```typescript
recordPosted(repoPath: string, artifactId: string, kind: PostedKind, externalId?: string, now?: () => string): boolean
```

**Parameters:**
- `repoPath: string` — The repository.
- `artifactId: string` — The bound artifact.
- `kind: 'milestone' | 'task-list' | 'design' | 'review' | 'plan'` — What was posted.
- `externalId: string` _(optional)_ — The comment id when known (from a reconciled comment).

**Returns:** `boolean` — True when the kind is now recorded; false when the binding or head could not be written (logged).

**Preconditions:**
- the artifact has a binding

**Postconditions:**
- a kind already recorded is not recorded twice
- meta-only; revision unchanged
- refuses and returns false (or a failed result with the reason 'a store write is staged for this artifact') when the artifact has a pending journal operation (.insrc/journal/<id>.json exists), so a patch never changes a head the store has staged a write against; every caller retries at its next call

### 2.6 `setPendingLink`

```typescript
setPendingLink(repoPath: string, artifactId: string, link: TrackerBinding['pendingLink']): boolean
```

**Parameters:**
- `repoPath: string` — The repository.
- `artifactId: string` — The bound artifact.
- `link: { parent: Reference; child?: Reference; childId?: number } | undefined` — The link under the parent that failed, or undefined to clear it once done.

**Returns:** `boolean` — True when written.

**Preconditions:**
- the artifact has a binding

**Postconditions:**
- a pending link carries at least a child ref or a child id
- meta-only; revision unchanged
- refuses and returns false (or a failed result with the reason 'a store write is staged for this artifact') when the artifact has a pending journal operation (.insrc/journal/<id>.json exists), so a patch never changes a head the store has staged a write against; every caller retries at its next call

### 2.7 `attachDocuments`

```typescript
attachDocuments(unit: UnitRef, port: TrackerPort, targets: readonly AttachTarget[], deps?: AttachDeps): AttachOutcome
```

**Parameters:**
- `unit: UnitRef` — The unit whose issue receives the links.
- `port: TrackerPort` — The tracker.
- `targets: { artifactId: string; relPath: string }[]` — The files to attach, each the rendered markdown (or html companion) under docs/ with its repo-relative path: a plan, a design document, a diagram, or a build, review or test record. The link names this file, never the json under .insrc/artifacts, which an approval always leaves dirty.
- `deps: AttachDeps` _(optional)_ — Seams for git and the clock.

**Returns:** `AttachOutcome` — { attached, reconciled, skipped, failed[] }: links posted now, links found already posted (recorded without a second post), links already recorded, and each failure with its reason.

**Errors:**
- `failed[] entry` when the file has uncommitted changes, is not tracked, the unit has no binding, or the tracker call fails; none of these throws.

**Preconditions:**
- the unit's artifact is bound to its issue
- the files are committed; git decides, whatever the commitArtifacts setting says

**Postconditions:**
- the link is blob/<last commit that touched the file>/<path> on the repository's GitHub host
- a link already recorded for (target, revision) is skipped; a new revision commits to a new sha, so it adds a new link and the old comment stays
- before posting, listComments is searched for the link; a comment holding it is recorded and not posted again
- an Attachment { target, revision, at, externalId } is recorded per link as one meta-only write
- the Attachment records it writes change the artifact head, so the caller commits them with a second commit; a target that was refused as uncommitted is not recorded and is attached by the next call, which recomputes the targets and skips the recorded ones
- every Attachment is written to the head of the unit's own artifact (the Define for an Epic unit, the LLD for a Story unit), the artifact that holds the binding, with target naming the attached artifact; the attached file's own head is not changed
- the head that carries the Attachment records is left changed and uncommitted by this call; the TUI approve() commits it in its second commit, and a follow-on called from the daemon's approval leaves it for the next commit of that artifact
- refuses and returns false (or a failed result with the reason 'a store write is staged for this artifact') when the artifact has a pending journal operation (.insrc/journal/<id>.json exists), so a patch never changes a head the store has staged a write against; every caller retries at its next call

### 2.8 `runUnitExtras`

```typescript
runUnitExtras(unit: UnitRef, steps: readonly ExtraStep[], deps?: ExtrasDeps): ExtrasOutcome
```

**Parameters:**
- `unit: UnitRef` — The unit the posts belong to.
- `steps: ExtraStep[]` — The approve-time posts; a comment step now names the marker its body carries.
- `deps: ExtrasDeps` _(optional)_ — Clock, mark writer and a comment lister for reconciliation.

**Returns:** `ExtrasOutcome` — { done, skipped, reconciled, failed[] }.

**Errors:**
- `failed[] entry` when a post fails, or the comment list for reconciliation cannot be read (the post is then not made).

**Postconditions:**
- a kind already in binding.posted is skipped
- for a comment step whose kind is not recorded, listComments is read once and a comment carrying the step's marker is recorded as done and not posted again
- a post that succeeded but whose record failed is reported, and the next run reconciles it instead of repeating it
- for an Epic or Story the record is the binding's posted list; a Task unit keeps its older record on the Plan until s7

### 2.9 `ensureUnitIssueDetailed`

```typescript
ensureUnitIssueDetailed(unit: UnitRef, port: TrackerPort, deps?: EnsureIssueDeps): EnsureResult<EnsuredIssue>
```

**Parameters:**
- `unit: UnitRef` — The unit needing an issue.
- `port: TrackerPort` — The tracker.
- `deps: EnsureIssueDeps` _(optional)_ — Config reader and clock.

**Returns:** `EnsureResult<EnsuredIssue>` — Unchanged result shape.

**Errors:**
- `EnsureResult failure` when as today: before-create failures create nothing; a failed create is unconfirmed and found again by label or title.
- `EnsureResult failure (phase before-create)` when the artifact head that holds the unit's binding cannot be read, so the issue could not be recorded; checked before any lookup or create, so nothing is created.

**Postconditions:**
- an Epic or Story issue found or created is recorded with bindArtifact on the unit's artifact; a Task issue keeps its record on the Plan until s7
- a failed link under the parent is stored with setPendingLink and retried at the next call until it succeeds, then cleared
- an issue a person created first is adopted through the label or title lookup and bound the same way
- an issue this call creates is bound only after the duplicate check: the unit label is listed first and the lowest-numbered issue is bound once (tieBreak), this call's own issue being commented on and closed as a duplicate when it is not the lowest; when the listing fails the created issue is bound and kept, as today
- bindArtifact is therefore called once per unit by a create and never needs to replace a binding; a crash between the create and the bind is found again by the unit label at the next call
- when the unit's artifact head cannot be read (malformed binding or missing file) the call returns a before-create failure naming the head, before any issue is looked up or created
- a bind that fails to write after the issue was created or adopted (disk full, head unwritable) is never a before-create failure: the call returns ok with the issue (created true and duplicateCheck 'not-run' for a create, as today), the binding stays absent, isUnitSettled is false so the draft hook reports 'exists but could not be recorded', and the next call finds the issue by its label or title and binds it
- works the same in individual mode: it does not read the team policy; the draft hook that calls it before approval runs in team mode only, so an individual-mode unit's issue is created and bound by the approve-time push

### 2.10 `tracker.attach (daemon IPC method)`

```typescript
tracker.attach(params: { repo?: string; epicHash: string; storyId?: string }): Promise<AttachOutcome | { error: string }>
```

**Parameters:**
- `repo: string` _(optional)_ — The repository; falls back to the daemon's INSRC_REPO.
- `epicHash: string` — The Epic of the unit.
- `storyId: string` _(optional)_ — The Story; absent for the Epic's own documents.

**Returns:** `AttachOutcome | { error: string }` — What attachDocuments returned for the unit's design documents, plan and records, or an error for a bad request.

**Errors:**
- `{ error } result` when the repository has no tracker or no binding for the unit, or the request is malformed; never a throw

**Postconditions:**
- resolves the unit's targets (the HLD or LLD and its diagram companions, the plan, and the Story's BUILD, CR and TESTS records) from the artifacts on disk, calls attachDocuments, and commits nothing
- a target that is dirty or untracked is reported refused with 'commit the file first'; recorded attachments are skipped, so a later call attaches only what is new

### 2.11 `autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan`

```typescript
autoPushEpicOnHld(hldJsonPath: string): AutoPushResult; autoPushStoryOnLld(lldJsonPath: string): AutoPushResult; autoPushTasksOnPlan(planJsonPath: string): AutoPushResult
```

**Parameters:**
- `hldJsonPath | lldJsonPath | planJsonPath: string` — The approved artifact's json path; the repository, Epic and Story come from its meta.

**Returns:** `AutoPushResult` — Unchanged result shape; extrasFailed is reported in both modes, not only in team mode.

**Errors:**
- `AutoPushResult failed or skipped` when as today: no tracker configured, gh not signed in, a failed lookup, or a head that cannot be read; nothing is created on a guess.

**Postconditions:**
- team mode and individual mode (a repository with no policy, or teamMode off) run one path: ensureUnitIssueDetailed binds each unit's artifact, runUnitExtras posts each comment once with its marker, and the pending link is retried; the two modes differ only in claims (team mode) and in the Task-issue policy (individual mode keeps the pushTasks setting, team mode makes a Task issue for every Task)
- legacyPushEpic, legacyPushStory and legacyPushTasks are removed: their own issue creation, their meta.tracker-only record and their best-effort unmarked comments are replaced by the shared path, so an individual-mode repository gets the binding, once-only posts and attachments as a team-mode one does
- a repository with no tracker (config none, or gh not signed in) is skipped before anything is looked up and has no binding

## 3. Data model changes

### 3.1 `TrackerBinding` — invariant-change

The declared sc6 shape is kept. The reference is { entityId: 'owner/repo#N', type: 'github:issue', relation: 'tracked-by' } (an external target with the namespaced external type docs/plans/core-data-model.md names, github:issue, so the store's artifact-id check does not apply). posted holds one entry per kind at most (milestone, task-list, design, review, plan), with the comment id as externalId when it was reconciled or known. Written only by bindArtifact, recordPosted and setPendingLink.

**Call sites:**
- `src/workflow/artifact-core/types.ts:158-171`
- `src/workflow/artifact-core/decode.ts:117-128`
- `src/workflow/artifact-core/store.ts:401-407`

### 3.2 `Attachment` — invariant-change

The declared sc6 shape is kept. One entry per (target, revision); target is a Reference { entityId: artifact id, type: its kind, relation: 'documents' }; revision is the artifact's lifecycle revision number when attached; externalId is the comment id. Written only by attachDocuments.

**Call sites:**
- `src/workflow/artifact-core/types.ts:173-178`
- `src/workflow/artifact-core/decode.ts:109-114`
- `src/workflow/artifact-core/store.ts:400`

### 3.3 `TrackerComment` — new

{ externalId: string; author: string; text: string; at: string; url?: string }, the element of listComments' result (the shape the sc6 sketch gives).

```
+ interface TrackerComment { externalId; author; text; at; url? } in src/workflow/tracker/port.ts
```

**Call sites:**
- `src/workflow/tracker/port.ts:69-90`

### 3.4 `UnitIssue` — field-remove

extrasDone is removed from UnitIssue: the posted marks for an Epic and a Story are binding.posted. A Task unit's record keeps issue, createdAtRevision and pendingLink on the Plan's meta.tracker.units until s7 creates Task artifacts; the Epic and Story entries of units are no longer written. resolveUnitIssueLocal keeps reading the older epicRef, storyRef and storyRefs as a read-only source for the one-way rebind of an Epic or Story unit that has no binding (issues that predate unit labels and artifact-id titles are not found by the lookups); s9 removes it with the old fields.

```
- extrasDone?: {...} from UnitIssue in src/workflow/tracker/refs.ts:40-46
```

**Call sites:**
- `src/workflow/tracker/refs.ts:26-47`
- `src/workflow/tracker/unit-issue.ts:176-197`
- `src/workflow/tracker/unit-issue.ts:540-545`
- `src/workflow/tracker-auto.ts:528-533`
- `src/workflow/draft-issues.ts:113-133`
- `src/workflow/team/handoff.ts:395`

### 3.5 `ExtraStep` — field-add

A comment step gains marker?: string, the stable marker its body carries ('<!-- insrc:post:<artifactId>:<kind> -->'); the milestone and task-list steps are idempotent on the tracker already and carry none. ExtrasOutcome gains reconciled: string[].

```
+ marker?: string on ExtraStep; + reconciled: string[] on ExtrasOutcome
```

**Call sites:**
- `src/workflow/tracker/unit-issue.ts:518-536`
- `src/workflow/tracker-auto.ts:495-535`

### 3.6 `carryBinding (storage write rule)` — invariant-change

prepareArtifactWrite carries meta.envelope.binding and meta.envelope.attachments from the head already on disk into every content write of an existing artifact, as it carries meta.tracker today; a first write (no head on disk) keeps what the caller gave. So a content write by the store that prepares after a binding patch keeps it, and the binding module is the one writer of both fields after creation. The rule narrows the lost-update window and does not close it: a store write already prepared (its bytes held across the journal stage and the change log append) replaces the head without re-reading the binding; see the error path 'A binding patch lands inside a store write'.

```
+ carryBinding(prior, next) beside carryTracker in src/workflow/storage.ts; called in the content branch of prepareArtifactWrite
```

**Call sites:**
- `src/workflow/storage.ts:125-134`
- `src/workflow/storage.ts:216-250`
- `src/workflow/artifact-core/store.ts:279-293`
- `src/workflow/artifact-core/store.ts:293`
- `src/workflow/artifact-core/store.ts:331-333`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | Implements TrackerBinding and Attachment as declared, and the port additions listComments and attach for the GitHub adapter. Adds the TrackerComment type the sketch implies and the read, bind, record and attach functions that are the only writers of the two envelope fields. |
| `sc2` | consumes | Uses the envelope's binding and attachments fields and their decoding and validation unchanged. The store's write path gains one carry rule for those two fields (carryBinding), which keeps the store a faithful reader and writer of everything else. |
| `sc4` | consumes | Reads the lifecycle revision number for createdAtRevision and for Attachment.revision. A binding or attachment change is a meta-only write, so the revision number and content hash do not move (k3) and the integrity check against the log tail is unaffected. |
| `sc1` | consumes | Maps a unit to its artifact id with ArtifactIds.make (the Define for an Epic, the LLD for a Story, until s9 creates Epic and Story artifacts) and builds the post marker from the artifact id; adds no second title lookup and uses findIssuesByTitleToken as AMD-2f27754d4ad00b8e-6 states. |
| `sc3` | consumes | Does not append to the change log or feedback. Binding and attachment bookkeeping is recorded in the binding itself (posted[].at, attachments[].at) and in the log output; this is a stated deviation from 'every state change appends a change log entry' and is raised as an open question. |

## 5. Error paths

**Error cases**

- **The tracker does not answer listComments before a comment step that might already be posted** (recoverable)
  - Detection: TrackerPort.listComments returns a failed PortResult inside runUnitExtras for the first unrecorded comment step
  - Response: The step is reported failed with the tracker's reason and is not posted; the next run tries the read again. An uncertain post is never retried blind.
  - User impact: The design, review or plan comment is delayed until the tracker answers; no duplicate appears.
- **A post succeeds and recording it in the binding fails (disk full, head unreadable)** (recoverable)
  - Detection: recordPosted returns false after the port call succeeded
  - Response: The step is reported failed with 'posted, but its record was not written'; the next run lists the comments, finds the marker, records the kind and does not post again.
  - User impact: The author is told once; nothing is repeated on the issue.
- **A second, different issue is offered for an artifact that is already bound** (recoverable)
  - Detection: bindArtifact reads an existing binding whose reference names another issue
  - Response: Returns { ok: false, reason } naming both issues and changes nothing; ensureUnitIssueDetailed returns a before-create failure so the caller sees that the unit has two candidate issues.
  - User impact: A person must close one of the two issues; the unit never ends up bound to two.
- **The link under the parent issue fails (Story under its Epic)** (recoverable)
  - Detection: port.issueOps.linkSubIssue returns a failed result after the child was created or adopted
  - Response: setPendingLink stores { parent, childId } (or child when the id lookup failed); the next ensureUnitIssueDetailed retries it and clears it with setPendingLink(undefined) on success; the failure is logged and shown in the unit's result.
  - User impact: The unit is usable at once; its issue appears under the parent after the next retry.
- **A file to attach has uncommitted changes or is not tracked by git** (recoverable)
  - Detection: attachDocuments runs git status --porcelain for the path and finds output, or git log -1 --format=%H for the path prints nothing
  - Response: The target is reported in failed[] with 'commit the file first'; nothing is posted and nothing recorded. The calling approval path runs attachDocuments only after its commit step ran; when it did not (commitArtifacts is false, or the approval came through the daemon's workflow.approve, which commits nothing), the approval result says 'attachments skipped: the artifacts are not committed' and tracker.attach is run once they are.
  - User impact: The author commits and attaches again; the link always names a commit that holds the content shown.
- **The unit has no binding when attachDocuments or recordPosted is called** (recoverable)
  - Detection: readBinding returns undefined for the unit's artifact
  - Response: attachDocuments reports every target failed with 'the unit is not bound to an issue yet'; recordPosted returns false. Nothing is written.
  - User impact: A repository with no tracker has no binding and no attach is attempted.
- **The tracker is not GitHub** (terminal)
  - Detection: TrackerPort.kind is not 'github' when listComments or attach is called
  - Response: The adapter for another kind answers a rejected 'unsupported' failure; attach is reported failed and nothing is posted.
  - User impact: Only GitHub is supported, as the owner ruled; no partial behaviour on other trackers.
- **Two daemons create the same unit's issue at once** (recoverable)
  - Detection: after its create, ensureUnitIssueDetailed lists the unit label with findIssues and finds more than one issue
  - Response: The lowest-numbered issue is bound once; this call's own issue, when it is not the lowest, is commented on and closed as a duplicate; when the listing fails the created issue is bound and kept and the duplicate check is reported as not run.
  - User impact: The unit ends bound to exactly one issue; the duplicate is closed with a pointer to the kept one.
- **The head holding the binding cannot be read (malformed meta.envelope.binding, unreadable file)** (recoverable)
  - Detection: decodeArtifactHead raises ArtifactShapeError, so ArtifactStore.read and update of that artifact fail as well as readBinding
  - Response: ensureUnitIssueDetailed calls readBinding on the unit's artifact before its local resolve; an ArtifactShapeError or an unreadable file there makes it return a before-create failure naming the head, before anything is looked up or created. resolveUnitIssueLocal (the gate's and the draft hook's read) catches the same error and reports no local issue, so those callers fall to ensure and get the same failure; isUnitSettled is false, so the draft hook reports not-ready with that reason.
  - User impact: The artifact is unreadable through the store until a person repairs the binding (or removes it, after which the next ensure rebinds through the unit label); no second issue is created.
- **An approval path that does not commit calls for attachment (commitArtifacts false, or the daemon workflow.approve behind insrc_workflow_approve)** (recoverable)
  - Detection: the TUI approve() reads cfg.commitArtifacts === false or commitApprovedArtifacts returns undefined; the daemon path has no commit step by design
  - Response: No attachDocuments call is made from that path; its result carries 'attachments skipped: the artifacts are not committed'. For a BUILD approval through the daemon, the followOn calls attachDocuments for the build, review and test records and reports each one the git check finds dirty.
  - User impact: The links are added by tracker.attach once the person or the build flow has committed the files; nothing is posted for a file that is not committed.
- **A binding patch from another process lands inside a store write (between the store's prepare and its head replace)** (recoverable)
  - Detection: nothing at write time: within one process the check for a staged operation and the patch run in one synchronous step, so only a patch from another process (the TUI approve() runs autoPush in a separate CLI process) can fall between a store write's prepare and its head replace; the loss shows at the next ensure
  - Response: Recovery is by reconciliation, never by a second remote action: the next ensureUnitIssueDetailed rebinds the unit through its label or title (or the older ref), a post mark that was lost is reconciled by the marker through listComments, a lost attachment by its link, and a lost pending link is found again because the child is looked up by label and linked again.
  - User impact: A recorded post, link or attachment may be briefly forgotten locally; nothing is posted twice and no second issue is created.
- **The binding cannot be written after the issue was created or adopted** (recoverable)
  - Detection: bindArtifact returns { ok: false } from a write error (not from reading another binding) inside ensureUnitIssueDetailed after the create or the adopt
  - Response: The call returns ok with the issue (created true, duplicateCheck 'not-run' for a create), logs the failure, and leaves the binding absent; isUnitSettled reports false so the draft hook says 'the issue exists but could not be recorded'. The next ensure finds the issue by its unit label or title and binds it.
  - User impact: The unit has an issue that is not yet recorded locally; the author is told to write the draft again; no second issue is created.
- **A binding, post or attachment patch is attempted while the store has a write staged for the artifact** (recoverable)
  - Detection: the binding writer finds the journal file .insrc/journal/<artifactId>.json before it patches the head (the same check the store's completePending acts on)
  - Response: The patch is refused (recordPosted and setPendingLink return false, bindArtifact and attachDocuments return a failed result naming a staged store write); nothing is written, so the store's later completion of its staged write finds the head it staged against and raises no head-changed-after-stage conflict.
  - User impact: The record is written by the next call; a post that was made is reconciled by its marker, a link by its URL; no person has to resolve a conflict.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| attachDocuments is called twice for an unchanged file | The second call finds the Attachment for (target, revision) and reports it skipped; no tracker call is made. |
| An artifact is revised and committed, then attached again | The commit sha changes, the link is new, a new comment is posted and a second Attachment is recorded; the first comment and Attachment stay. |
| A revision is made but not yet committed | The file is dirty, so the target is refused; the earlier attachment remains valid. |
| The attach comment was posted but the Attachment was not recorded | The next attachDocuments finds a comment holding the same link in listComments, records the Attachment with that comment's id as externalId, and reports it reconciled. |
| A comment on the issue quotes the marker text of a framework post | It is treated as the post (the marker is the key); the framework posts its markers at the start of the body and only comments authored through the tracker whose text starts with the marker count. |
| A person created the issue first and the framework adopts it | The Epic or Story artifact is bound to that issue through the label or title lookup; createdAtRevision is the head's revision at that moment. |
| A repository has no tracker configuration | No lookup, create, bind, post or attach is attempted and the artifacts carry no binding. |
| A Task unit asks for its issue | The Task's record is read and written on the Plan's meta.tracker.units as before, with pendingLink retry; s7 moves it to the Task artifact's binding. |
| A head written before s6 has meta.tracker.units but no binding | readBinding returns undefined; resolveUnitIssueLocal reads the older ref, binds the unit from it, and the old approve-time marks are not read (a design, review or plan comment may be posted once more unless it carries the new marker); s9 converts what remains. |
| Two comment steps of one unit are both unrecorded | listComments is read once and shared across both steps. |
| Two daemons create a unit's issue at the same moment | Both lists show both issues; both calls bind the lowest-numbered one; the other call's issue is closed as a duplicate; the unit has one binding. |
| A pre-s6 Epic or Story whose only record is epicRef, storyRef or meta.tracker.units | resolveUnitIssueLocal finds the issue through the older ref and binds the unit from it once; the draft hook, the gate and the handoff check then resolve it from the binding; no lookup and no second issue are needed. |
| An individual-mode repository (no team policy) approves an HLD, an LLD and a plan | Each approval runs the shared push: the Epic and Story artifacts are bound, each design, review and plan comment is posted once with its marker, a failed link under the parent is kept pending and retried, and the approve flow attaches the documents; no claim is made. |
| An individual-mode repository has pushTasks off | No Task issues are created (the policy is kept); the Epic and Story are still bound and their posts and attachments are made. |

**Invariants to preserve**

- A Task's issue record, its pending link and its retry keep working unchanged on the Plan until s7: the Epic and Story change must not alter a Task unit's behaviour. [[c2]]
- A failed lookup is a failure, never 'not found': ensureUnitIssueDetailed creates nothing when a lookup, the title guard or the parent lookup failed. [[c2]]
- The unit's issue is found again by its label or title after a crash, so a lost local record never produces a second issue. [[c2]]
- Tracker access stays through the gh CLI only: listComments and attach add no direct REST call and no new credential. [[c6]]
- The team gate decides on the tracker's live identity and the unit's issue; reading the binding changes neither, and the gate's synchronous path stays synchronous. [[c2]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), with node:assert/strict; tests live in __tests__ beside the code (src/workflow/tracker/__tests__, src/workflow/__tests__, src/workflow/artifact-core/__tests__)`

**Test levels**

- **unit** — The single-module behaviour of the binding functions, the permalink and attach logic, and the once-only extras runner, over a temporary repository and an in-memory fake port.
  - Subjects: `bindArtifact writes the typed binding with createdAtRevision, leaves the revision number and content hash unchanged, is idempotent for the same issue, refuses a different issue, and readBinding returns undefined for an unbound artifact`, `recordPosted and setPendingLink record one entry per kind and a pending link that names a child ref or a child id, never twice, and without moving the revision`, `attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again`, `runUnitExtras skips a kind already in the binding, reconciles a comment step through its marker without posting, reads the comment list once for several steps, fails a step when the list cannot be read, and reports a post whose record failed so the next run reconciles it`
  - Fixtures: `a temporary repository with a git history (src/workflow/tracker/__tests__ helpers)`, `an in-memory fake TrackerPort with listComments and attach recording their calls (the fakePort style of src/workflow/team/__tests__/gate.test.ts)`, `a durable-kit store for the head files (src/workflow/artifact-core/__tests__/durable-kit.ts)`
- **integration** — The GitHub adapter through a fake gh, the unit-issue flow end to end, the store's carry rule and the approve-time pushes, each over a temporary repository.
  - Subjects: `the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list`, `ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit keeps its record on the Plan`, `a failed link under the parent is stored as the binding's pending link, retried by the next ensure, cleared once done and not retried again`, `a content write by the store keeps the binding and attachments on disk, a binding patch leaves the revision and content hash alone, and the team gate resolves a bound unit's issue synchronously with no tracker call`, `the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice, and the design document, plan and build, review and test records are attached to the unit's issue with a link per revision`, `two racing creates for one unit bind the lowest-numbered issue once, close the other as a duplicate, and keep the created issue when the duplicate check cannot list`, `approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed`, `the draft hook and the handoff check read the binding for an Epic or Story unit, and a pre-s6 head with only the old ref is rebound once from it with no new issue`, `a malformed binding makes ensureUnitIssueDetailed fail before creating anything and leaves the store read of that artifact failing until repaired`, `the BUILD approval's follow-on attaches the build, review and test records that git reports clean and reports the dirty ones, and the daemon workflow.approve commits nothing`, `the write inventory lists the binding and attach writers as meta-only writers of meta.envelope and every production writer file still has an entry`, `a bind that fails to write after the issue was created returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label`, `the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link and attaches the documents, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding`, `a binding, post or attachment patch is refused while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict`
  - Fixtures: `a fake gh runner for the adapter (the runGh seam used by src/workflow/tracker/github.ts tests)`, `the fake gh call recorder of src/workflow/__tests__/tracker-auto.test.ts`, `a temporary git repository with a committed artifact for the permalink`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac17` | `bindArtifact writes the typed binding with createdAtRevision, leaves the revision number and content hash unchanged, is idempotent for the same issue, refuses a different issue, and readBinding returns undefined for an unbound artifact`, `ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit keeps its record on the Plan`, `two racing creates for one unit bind the lowest-numbered issue once, close the other as a duplicate, and keep the created issue when the duplicate check cannot list`, `the draft hook and the handoff check read the binding for an Epic or Story unit, and a pre-s6 head with only the old ref is rebound once from it with no new issue`, `a malformed binding makes ensureUnitIssueDetailed fail before creating anything and leaves the store read of that artifact failing until repaired`, `the write inventory lists the binding and attach writers as meta-only writers of meta.envelope and every production writer file still has an entry`, `a bind that fails to write after the issue was created returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label`, `the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link and attaches the documents, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding`, `a binding, post or attachment patch is refused while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict` |
| `ac18` | `attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again`, `the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list`, `the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice, and the design document, plan and build, review and test records are attached to the unit's issue with a link per revision`, `approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed`, `the BUILD approval's follow-on attaches the build, review and test records that git reports clean and reports the dirty ones, and the daemon workflow.approve commits nothing`, `the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link and attaches the documents, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding` |
| `ac19` | `a failed link under the parent is stored as the binding's pending link, retried by the next ensure, cleared once done and not retried again`, `runUnitExtras skips a kind already in the binding, reconciles a comment step through its marker without posting, reads the comment list once for several steps, fails a step when the list cannot be read, and reports a post whose record failed so the next run reconciles it`, `the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice, and the design document, plan and build, review and test records are attached to the unit's issue with a link per revision`, `approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed`, `the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link and attaches the documents, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding` |

## 7. Migration

**State before:** Unit-issue bookkeeping is a loose record under meta.tracker.units on the Define (Epic), the LLD (Story) or the Plan (Task): issue ref, createdAtRevision, a pendingLink for a failed parent link, and extrasDone marks for the approve-time posts (src/workflow/tracker/refs.ts:26-47, src/workflow/tracker/unit-issue.ts:176-197 and :518-576). A post is marked after it succeeds, so a crash between the post and its mark repeats the post. The tracker port has no listComments and no attach; the envelope's binding and attachments fields exist (src/workflow/artifact-core/types.ts:155-181) and are read and validated but never written.

**State after:** An Epic's Define and a Story's LLD carry a typed binding (meta.envelope.binding) written by one set of functions, and any artifact can carry attachments; the approve-time comments carry a marker and are reconciled through listComments before a retry, so no post repeats. The port has listComments and attach for GitHub. A content write by the store carries the on-disk binding and attachments. A Task unit keeps its older record on the Plan until s7. Existing meta.tracker.epicRef, storyRef, storyRefs, taskRefs and pushedAt are still written for the renderers and the chain report; s9 converts them. Individual mode (no team policy) and team mode share one push path; the separate individual-mode push functions are gone.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the TrackerComment type, listComments and attach to the tracker port, the GitHub adapter and the in-memory fakes; additive, no caller yet. — ↩ rollbackable
2. Add the binding module (readBinding, bindArtifact, recordPosted, setPendingLink) as meta-only patches of meta.envelope, and the carryBinding rule in the content branch of the storage write so a store write keeps the on-disk binding and attachments; additive, no caller yet. Add one entry per new writer file to ARTIFACT_WRITE_INVENTORY in src/workflow/artifact-write-inventory.ts (class meta-only, via writeArtifact, note: meta.envelope.binding and attachments), for the binding module and the attach module. — ↩ rollbackable
3. Add the permalink and attachDocuments, with the dirty-file and tracked-file checks and the reconcile-by-link step; no caller yet. — ↩ rollbackable
4. Switch ensureUnitIssueDetailed, resolveUnitIssueLocal, isUnitSettled and the pending-link retry for an Epic or Story unit from meta.tracker.units to the binding; a Task unit keeps its record. A head with only the old record has no binding, so the next ensure finds its issue by the unit label or title and binds it. A created issue is bound after the duplicate check (tieBreak binds the lowest-numbered issue once). resolveUnitIssueLocal keeps the epicRef, storyRef and storyRefs fallback only as a one-way rebind source for a unit with no binding; draft-issues.ts and team/handoff.ts follow it through resolveUnitIssueLocal. — ✕ non-rollbackable
5. Switch runUnitExtras to the binding's posted list for an Epic or Story, add the comment markers to the design, review and plan comment bodies in tracker-auto, and reconcile an unrecorded comment step through one listComments read before posting; remove extrasDone from UnitIssue. Remove legacyPushEpic, legacyPushStory and legacyPushTasks from src/workflow/tracker-auto.ts: the three exported pushes call the shared ensure, extras and attach path in both modes, keeping individual mode's pushTasks policy. — ✕ non-rollbackable
6. Add the tracker.attach daemon method. Call attachDocuments from the TUI approve() after its commit step for the HLD, LLD and plan documents (their diagram companions are attached by tracker.attach once committed), committing the unit's head (the Define for an Epic, the LLD for a Story) that carries the Attachment records in a second commit; skip it with a stated reason when commitArtifacts is false. Call it from the daemon's BUILD approval followOn for the build, review and test records, only for files git reports clean. The follow-on outcome union in src/workflow/gates.ts:827-832 gains a 'tracker-attach' kind carrying the AttachOutcome, wired at both follow-on sites in src/daemon/index.ts (workflow.approve at :652 and workflow.reviewDecision at :744). The attach targets are the rendered markdown files (HLD.md, LLD.md, PLAN.md, BUILD.md, CR.md, TESTS.md and the html companions), whose cleanliness git decides; an approval's meta-only write to a record's json does not affect them. — ↩ rollbackable
7. Update the tests that seed or assert Epic or Story records under meta.tracker.units or extrasDone: src/workflow/tracker/__tests__/unit-issue.test.ts, src/workflow/tracker/__tests__/unit-extras.test.ts, src/workflow/__tests__/tracker-auto.test.ts, src/workflow/__tests__/approve-fallback-issues.test.ts, src/workflow/__tests__/draft-issues.test.ts, src/workflow/__tests__/redraft-preserves-tracker.test.ts, src/workflow/__tests__/artifact-writer.test.ts, src/workflow/__tests__/gate-approve.test.ts, src/workflow/__tests__/pending.test.ts, src/daemon/__tests__/draft-issues-synthesize.test.ts, src/cli/__tests__/run-readiness-notice.test.ts, src/cli/__tests__/services.test.ts and src/cli/__tests__/team-claim-release.test.ts (a grep for units and extrasDone in the tests finds these; each is checked), the write-inventory test src/workflow/__tests__/artifact-write-inventory.test.ts (the two new writer entries), and the individual-mode (formerly 'legacy') cases of src/workflow/__tests__/tracker-auto.test.ts and tracker-tasks.test.ts, and record the s9 conversion inputs in docs/plans/core-data-model.md. — ↩ rollbackable

**Backward compat:** No compatibility code is written (owner ruling). The IPC surface gains the tracker.attach method and the 'tracker-attach' follow-on outcome kind (additive); no existing method or result shape changes. Heads written before s6 carry meta.tracker.units with extrasDone but no binding: the next ensure rebinds the Epic or Story through the label or title lookup, and the old approve-time marks are not read, so an old unit's design, review or plan comment may be posted once more unless its comment already carries the new marker; s9 converts the old records into bindings and marks before that matters. meta.tracker.epicRef, storyRef, storyRefs, taskRefs and pushedAt keep being written for the markdown renderers and the chain report until s9. The older epicRef, storyRef and storyRefs stay readable as a one-way rebind source for an Epic or Story unit with no binding until s9. In an individual-mode repository the design, review and plan comments become once-only and carry a marker, and the Epic and Story gain a binding; an individual-mode unit whose comment was posted before s6 may be posted once more (its comment has no marker) until s9.

## 8. Alternatives considered

### 8.1 a1: Binding on the envelope through a BindingService, marker-reconciled posts — **CHOSEN**

A small service over ArtifactStore reads and updates the envelope's typed binding and attachments; every post carries a stable marker and is reconciled through listComments before a retry.

Add src/workflow/tracker/binding-service.ts: BindingService { bind(artifactId, issueRef, by), read(artifactId), recordPosted(artifactId, kind, externalId?), setPendingLink(artifactId, link | undefined), attach(artifactId, target, port, links) } built on ArtifactStore.update (the binding and attachments are envelope fields, so they move no revision and add one change-log entry without a content hash change). Extend TrackerPort with listComments(issue, since?) and attach(issue, artifact, link), both implemented for the GitHub adapter only through the gh CLI (attach on GitHub is a comment that carries the permalink and a marker '<!-- insrc:attach:<artifactId>:r<revision> -->'; no attachment API exists). Post markers '<!-- insrc:post:<artifactId>:<kind> -->' are put in the comment bodies the approve-time extras already write; before running a post whose kind is not in binding.posted, the runner calls listComments and, if a comment with the marker exists, records the post (externalId = the comment id) and does not post again; otherwise it posts, then records. unit-issue.ts resolveUnitIssueLocal/recordUnit/retryPendingLink/runUnitExtras switch from meta.tracker.units to the binding for Epic and Story artifacts; a Task's record (no artifact until s7) stays under the Plan's meta.tracker.units behind the same function signatures, and s7 moves it. The permalink is blob/<commit sha>/<path> where the sha is the last commit that touched the file (git log -1 --format=%H -- <path>), built privately in this Story.

### 8.2 a2: Keep meta.tracker.units, add attachments and the two port methods

Leave the loose UnitIssue records alone; add an attachments list beside them and listComments/attach on the port.

Do not touch the binding field on the envelope. Add listComments and attach to TrackerPort and the GitHub adapter, add an attachments array to meta.tracker (an Attachment-shaped list), and have the attach caller record each link there. Posts and pending links stay in extrasDone and pendingLink as today.

**Rejected because:** Cheapest but fails the typed-record requirement and leaves the repeat-post gap (rank 3 in s3: partial on ac17 and ac19, violates sc2).

### 8.3 a3: Binding plus a durable posting receipt line file

As a1, but once-only posting is kept in a new append-only sidecar of receipts keyed by what was posted, not by a marker comment check.

BindingService as in a1, plus a new receipts sidecar (append-only lines keyed by artifact id and post kind) written before the post is sent and completed after, with a reconcile step that reads the receipts. Reuses the s4 SidecarStore for storage and merge rules.

**Rejected because:** Works but needs a third sidecar kind owned by s4's boundary and does not remove the need to read comments back (rank 2 in s3: partial on ac19).

## 9. References

- **[[c1]]** `analyze-bundle` `src/workflow/tracker/refs.ts:26-47` — "UnitIssue record with pendingLink and extrasDone"
- **[[c2]]** `code` `src/workflow/tracker/unit-issue.ts:176-337` — "resolveUnitIssueLocal, ensureUnitIssueDetailed, pending-link retry"
- **[[c3]]** `code` `src/workflow/tracker/unit-issue.ts:518-576` — "runUnitExtras and its mark-after-post residual"
- **[[c4]]** `code` `src/workflow/artifact-core/types.ts:155-181` — "TrackerBinding and Attachment declared by s2"
- **[[c5]]** `code` `src/workflow/tracker/port.ts:69-90` — "TrackerPort without listComments and attach"
- **[[c6]]** `doc` `docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md` — "sc6 TrackerBinding, AMD-2f27754d4ad00b8e-6"
- **[[c7]]** `code` `src/workflow/tracker-auto.ts:495-620` — "approve-time extras and teamPush functions"
- **[[c8]]** `code` `src/workflow/storage.ts:125-250` — "carryTracker and prepareArtifactWrite"
- **[[c9]]** `code` `src/workflow/team/gate.ts:204-225` — "synchronous teamContext resolve and ensure"

## 10. Open questions

- The binding and attachments are written by sync meta-only patches, not through ArtifactStore.update, because the team gate and the draft-issue hook that record a unit's issue are synchronous and the store is async; making them async would rewrite every teamGate caller. To keep a store write from undoing a patch, prepareArtifactWrite carries meta.envelope.binding and meta.envelope.attachments from the head on disk into every content write of an existing artifact (carryBinding, as carryTracker does for meta.tracker). That touches the store's write path owned by s2 and s4. Resolve: accept it as an s6-owned change to src/workflow/storage.ts (recommended), or move the two sync recording points to the async store and make the gate async (a large change outside s6).
- Binding and attachment bookkeeping appends no change log entry, although the HLD's observability line says every state change does; the record is in the binding itself (posted[].at, attachments[].at) and the log output. Resolve: accept this as tracker bookkeeping rather than artifact state (recommended), or add an Operation for it and have a sync path append through History (needs an HLD amendment to sc3).
- A Task unit keeps its issue record on the Plan's meta.tracker.units until s7 creates Task artifacts, so unit-issue.ts has two homes for a record (binding for Epic and Story, the Plan for Task). Resolve: accept for now and have s7 move Task records onto the Task artifact's binding (recommended), or have s6 create the Task artifacts (that is s7's scope).
- Until s9 creates Epic and Story artifacts, an Epic's binding sits on the Define and a Story's on the LLD (the artifacts that hold the unit's record today). Resolve: accept and record in docs/plans/core-data-model.md that s9 moves each binding onto the Epic and Story artifact it creates (recommended).
- A permalink names the last commit that touched the file but the commit may not be pushed, so the link is dead on GitHub until it is. Resolve: accept; the sha link becomes valid when the commit is pushed (recommended), or refuse to attach until the commit is on a remote branch.
- No step commits the build, review and test records: the TUI approve() commits only the Define for a BUILD, and the daemon workflow.approve commits nothing. s6 adds no commit. The BUILD approval's followOn calls attachDocuments for those records and the new tracker.attach method attaches them on demand, in each case only for files git reports clean (the build flow's controller commits the records before approval, as it does for the s4 and s5 BUILD and TESTS records). Resolve: accept (recommended), or add a commit of the Story's records to the BUILD completion path (a change to the build gate outside s6).
- Individual mode currently has its own push functions (named legacy in src/workflow/tracker-auto.ts) with their own issue creation and unmarked best-effort comments. This LLD removes them and runs both modes through one path so both get the binding, once-only posts and attachments. Resolve: accept (recommended; the owner asked for both modes to be complete), or keep two paths and bind and mark in each.

## Resolved questions

- `q0430b408` — The binding and attachments are written by sync meta-only patches, not through ArtifactStore.update, because the team gate and the draft-issue hook that record a unit's issue are synchronous and the store is async; making them async would rewrite every teamGate caller. To keep a store write from undoing a patch, prepareArtifactWrite carries meta.envelope.binding and meta.envelope.attachments from the head on disk into every content write of an existing artifact (carryBinding, as carryTracker does for meta.tracker). That touches the store's write path owned by s2 and s4. Resolve: accept it as an s6-owned change to src/workflow/storage.ts (recommended), or move the two sync recording points to the async store and make the gate async (a large change outside s6).
  - **resolved**: s6 owns carryBinding in storage.ts — Approved LLD review: the owner approved with the recommended answers. _(2026-10-21T15:32:40.100Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/tracker/refs.ts:26-47` — "UnitIssue record with pendingLink and extrasDone"
- **[[c2]]** `code` `src/workflow/tracker/unit-issue.ts:176-337` — "resolveUnitIssueLocal, ensureUnitIssueDetailed, pending-link retry"
- **[[c3]]** `code` `src/workflow/tracker/unit-issue.ts:518-576` — "runUnitExtras and its mark-after-post residual"
- **[[c4]]** `code` `src/workflow/artifact-core/types.ts:155-181` — "TrackerBinding and Attachment declared by s2"
- **[[c5]]** `code` `src/workflow/tracker/port.ts:69-90` — "TrackerPort without listComments and attach"
- **[[c6]]** `doc` `docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md` — "sc6 TrackerBinding, AMD-2f27754d4ad00b8e-6"
- **[[c7]]** `code` `src/workflow/tracker-auto.ts:495-620` — "approve-time extras and teamPush functions"
- **[[c8]]** `code` `src/workflow/storage.ts:125-250` — "carryTracker and prepareArtifactWrite"
- **[[c9]]** `code` `src/workflow/team/gate.ts:204-225` — "synchronous teamContext resolve and ensure"
