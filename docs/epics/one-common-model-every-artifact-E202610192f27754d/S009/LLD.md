<!-- insrc:artifact LLD-2f27754d4ad00b8e-s9 -->

# LLD: E202610222f27754d:S009

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `bd468fd6cd6c...`

This Story adds one conversion command, repo.convert, that brings a repository onto the common artifact model: a planner computes every change from the stored files (a preview writes nothing), an applier runs the rules in a fixed order, a verifier compares a delivery snapshot computed before from the legacy stamps with one read afterwards by the delivery reader, and the version marker is written last. Heads are written by a conversion-owned migration write that keeps each head's revision number, status and approval as stored, because writing them through ArtifactStore would move revisions and return approved heads to draft. The same Story then retires the legacy approval and review stamps, the body.feedback writers and the s6 to s8 fallbacks, so the repository ends on one code path.

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

**Rollout phase:** Phase E — conversion and cutover
**Consumes:** `sc1` (ArtifactIdScheme), `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords), `sc4` (Lifecycle), `sc5` (SidecarStorage), `sc6` (TrackerBinding), `sc7` (TaskSet), `sc8` (RepoSchemaVersion)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `planConversion`

```typescript
planConversion(repo: string, options?: { tracker?: TrackerPort | undefined }): Promise<ConversionPlan>
```

**Parameters:**
- `repo: string` — Absolute path of the repository to convert.
- `options: { tracker?: TrackerPort | undefined }` _(optional)_ — A tracker port, when the optional issue relabel and pre-s8 comment listing may be planned; without one those steps are reported as skipped.

**Returns:** `ConversionPlan` — The typed changes per artifact, the renames, the unmapped values, the problems and the before-snapshot. Nothing is written.

**Errors:**
- `ConversionRefused` when A merge is in progress, the working tree has uncommitted changes under .insrc/artifacts or docs/epics, or the marker file cannot be read.
- `ConversionUnreadable` when A stored file is not JSON or has merge conflict markers; it is listed as a problem in the plan, never skipped silently.

**Preconditions:**
- The working tree is clean under .insrc/artifacts and docs/epics

**Postconditions:**
- No file is created, changed or removed
- The same tree gives equal plans
- A converted tree gives a plan with no changes
- The before-snapshot is computed from the raw legacy heads by legacyDeliveryView, not by the delivery reader

### 2.2 `legacyDeliveryView`

```typescript
legacyDeliveryView(heads: readonly RawHead[]): DeliverySnapshot
```

**Parameters:**
- `heads: readonly RawHead[]` — The raw parsed legacy heads the planner read.

**Returns:** `DeliverySnapshot` — Per unit: status, revision number, approval, review verdict and blocking, open feedback count, derived from meta.approvedAt, rejectedAt, review and reviewResolutions the way the old delivery reader did.

**Postconditions:**
- Pure: no file is read or written
- Used only by the conversion; it is the one place the legacy stamp rules are kept, and it is deleted with the conversion

### 2.3 `applyConversion`

```typescript
applyConversion(repo: string, plan: ConversionPlan, deps: ConversionDeps): Promise<ConversionResult>
```

**Parameters:**
- `repo: string` — Absolute path of the repository.
- `plan: ConversionPlan` — The plan from planConversion; it is recomputed inside the call and compared, so a tree that changed since the preview is refused.
- `deps: ConversionDeps` — The store, history, lifecycle service, task sets, the clock and the migration actor.

**Returns:** `ConversionResult` — What each rule wrote, what was reported, and whether the marker was written.

**Errors:**
- `ConversionRefused` when The recomputed plan differs from the one passed in.
- `ConversionIncomplete` when A head still carries a legacy field, or fails checkHeadIntegrity or checkIntegrity, after its rules ran; the marker is not written and the heads are listed.

**Preconditions:**
- The plan has no unreadable files and no open problem

**Postconditions:**
- Rules run in this order: rename ids and files, stamp epicCreatedAt, convert flat amendments, migrate every head (log entries, then the head), convert body.feedback, create EPIC and STORY heads, create Task heads for earlier Stories through TaskSets.createFromPlan, move the Epic and Story bindings, move story history, strip the legacy fields
- The marker is written last and only when every head is clean
- A second run writes nothing

### 2.4 `writeMigratedHead`

```typescript
writeMigratedHead(repo: string, converted: ConvertedHead, deps: ConversionDeps): Promise<'written' | 'unchanged'>
```

**Parameters:**
- `repo: string` — Absolute path of the repository.
- `converted: ConvertedHead` — The converted artifact: its id, the full head bytes, and the migrated log entries to record first.
- `deps: ConversionDeps` — The store (for exclusive), the history and the clock.

**Returns:** `'written' | 'unchanged'` — written when the head or an entry changed, unchanged when both already hold the converted state.

**Errors:**
- `ConversionIncomplete` when An append or the atomic replace failed; entries already appended stay and a rerun finishes the head.

**Preconditions:**
- Called only by applyConversion

**Postconditions:**
- Under ArtifactStore.exclusive, each migrated log entry whose id is not found in History.log is appended (stamp and review entries first, the revision-bearing migrated-<artifact id> entry last), and only then is the head replaced with writeAtomic
- meta.revision, the lifecycle status, approval and review binding are kept as stored; revision.contentHash is the hash of the converted content; lifecycle.review.report references the review entry
- The head write appends nothing, so a head has each migrated entry once however often it runs

### 2.5 `migratedEntryId`

```typescript
migratedEntryId(artifactId: string, part?: 'approve' | 'reject' | 'review' | 'mark-stale'): string
```

**Parameters:**
- `artifactId: string` — The converted artifact's id.
- `part: 'approve' | 'reject' | 'review' | 'mark-stale'` _(optional)_ — Which recorded legacy fact the entry carries; absent for the revision-bearing entry.

**Returns:** `string` — migrated-<artifact id>, or migrated-<artifact id>-<part>: stable across runs, so a rerun finds the entry instead of adding one.

**Postconditions:**
- The same inputs give the same id

### 2.6 `verifyConversion`

```typescript
verifyConversion(repo: string, before: DeliverySnapshot): Promise<VerifyReport>
```

**Parameters:**
- `repo: string` — Absolute path of the repository.
- `before: DeliverySnapshot` — The snapshot the planner computed with legacyDeliveryView before the apply.

**Returns:** `VerifyReport` — Each unit whose status, revision number, approval, review verdict or feedback count differs between the before-snapshot and the snapshot the delivery reader builds from the converted repository, with the reason; a contentHash difference is expected and not reported.

**Errors:**
- `RepoSchemaError` when The marker is missing or below version 2.

**Preconditions:**
- The marker is at version 2
- The delivery reader already reads the lifecycle (the reader group is done before the conversion is first run)

**Postconditions:**
- Nothing is written
- A difference is reported, never corrected

### 2.7 `runConversion`

```typescript
runConversion(repo: string, mode: 'preview' | 'apply' | 'verify', deps: ConversionDeps): Promise<ConversionReport>
```

**Parameters:**
- `repo: string` — Absolute path of the repository.
- `mode: 'preview' | 'apply' | 'verify'` — preview plans only; apply plans, applies, verifies and writes the marker; verify reads back only (it recomputes the before-snapshot from the converted heads' migrated entries).
- `deps: ConversionDeps` — The collaborators.

**Returns:** `ConversionReport` — The plan or result, the verification and the counts printed to the user.

**Errors:**
- `ConversionRefused` when A precondition of the stage that mode runs is not met.

**Postconditions:**
- preview and verify write nothing
- apply leaves the working tree changed for one commit and does not commit

### 2.8 `handleRepoConvert`

```typescript
handleRepoConvert(params: unknown, repoEnv: string | undefined): Promise<ConversionReport | { error: string }>
```

**Parameters:**
- `params: { repo?: string; mode?: 'preview' | 'apply' | 'verify' }` — The IPC parameters of repo.convert.
- `repoEnv: string | undefined` _(optional)_ — INSRC_REPO fallback.

**Returns:** `ConversionReport | { error: string }` — The report, or an error that says why nothing was attempted.

**Errors:**
- `invalid-params` when No repo, or a mode that is not preview, apply or verify.

**Preconditions:**
- The daemon owns all file access; the CLI calls this through IPC
- repo.convert is the only method that does not require the marker

**Postconditions:**
- The default mode is preview

### 2.9 `RepoSchemaGate.require`

```typescript
require(repo: string, atLeast: number): { ok: true } | { ok: false; message: string }
```

**Parameters:**
- `repo: string` — Repository path.
- `atLeast: number` — 2 for every daemon method and MCP step that reads or writes artifacts, except repo.convert.

**Returns:** `{ ok: true } | { ok: false; message: string }` — ok, or a message that names the conversion and the repo.convert command.

**Errors:**
- `RepoSchemaError` when The marker exists and is not valid.

**Postconditions:**
- The new tools refuse an unconverted repository with that message

### 2.10 `convertLegacyFeedback`

```typescript
convertLegacyFeedback(entry: FeedbackEntry, ownDocument?: string | undefined): ConvertedFeedback
```

**Parameters:**
- `entry: FeedbackEntry` — A stored body.feedback entry.
- `ownDocument: string | undefined` _(optional)_ — The artifact's own document path.

**Returns:** `ConvertedFeedback` — The Feedback line, the decision of its batch and the values with no home.

**Postconditions:**
- The actor id is the author text when it is already an os:, git: or github: id (lower-cased), otherwise legacy:<slug of the author> with the author text in actor.properties.name
- kind is revision-request for an entry whose decision or kind is feedback, suggestion stays suggestion, everything else is comment
- A target.file other than ownDocument is stored in anchor.section; nothing is reported unmapped for it
- id, timestamp, batchId and revision are kept

### 2.11 `persistReview`

```typescript
persistReview(input: PersistReviewInput): Promise<PersistedReview>
```

**Parameters:**
- `input: PersistReviewInput` — The artifact, the review report, the reviewer actor and party, an optional auto-fix, and the markdown to render.

**Returns:** `PersistedReview` — What was stored: the fix revision if any, the lifecycle review, the id of the review change-log entry, and the markdown path.

**Errors:**
- `ReviewPersistError` when A step failed; the error names the step (inspect, fix, record-review, render) and what is already stored.

**Preconditions:**
- The reviewer is the other party

**Postconditions:**
- Steps run in this order: inspect, head conflict check, store the fix through updateContent with addresses [], record the review (a 'review' log entry whose outcome.data holds the full report, then lifecycle.review with a report Reference to that entry), render the markdown; the lifecycle record comes before the markdown so a failure leaves a state the next run repairs
- src/daemon/steps/review-step/phases/findings.ts, src/daemon/steps/review-step/phases/verdicts.ts and src/workflow/review/run-artifact.ts all call it

### 2.12 `readReviewReport`

```typescript
readReviewReport(history: History, artifactId: string, review: Review): Promise<ReviewReport | undefined>
```

**Parameters:**
- `history: History` — The artifact's history reader.
- `artifactId: string` — The reviewed artifact.
- `review: Review` — The lifecycle review whose report Reference names the entry.

**Returns:** `ReviewReport | undefined` — The full report and its resolutions, read from the review log entry the Reference names; undefined when the Reference or the entry is absent.

**Postconditions:**
- Replaces every read of meta.review: effectiveReviewVerdict, readReview in tracker-auto, the delivery gate, reviewerPartyOf and the currency check read the report through it

## 3. Data model changes

### 3.1 `ConversionPlan` — new

{ changes: ConversionChange[]; renames: { from: string; to: string }[]; unmapped: UnmappedField[]; problems: { file: string; reason: string }[]; legacyAttachComments: { issue: string; commentId: string }[]; snapshot: DeliverySnapshot }. snapshot is the before-snapshot from legacyDeliveryView. ConversionChange is a union keyed by rule (rename-id, stamp-epic-created-at, convert-amendment, migrate-head, convert-feedback, create-epic, create-story, create-tasks, move-binding, move-story-history, strip-legacy-field, relabel-issue); each names the artifact id and the stored state that makes the rule apply.

**Call sites:**
- `src/workflow/artifact-core/feedback-convert.ts`
- `src/workflow/tasks/task-set.ts`
- `src/workflow/tracker/binding.ts`
- `src/workflow/delivery/snapshot.ts`

### 3.2 `MigratedLogEntry` — new

Deterministic ids: migrated-<artifact id> is the revision-bearing entry (operation create when the artifact has no log, update otherwise; revision { number: the head's meta.revision, contentHash: the hash of the converted content }; actor insrc:migration; outcome.data.kind 'migrated'; timestamp = the conversion's clock, so it is the last revision-bearing entry and checkIntegrity compares the head against it). migrated-<artifact id>-approve, -reject and -mark-stale are revision-less entries carrying the legacy fact (original time from the stamp, actor legacy:unknown, status from/to). migrated-<artifact id>-review is a revision-less 'review' entry whose outcome.data holds { kind: 'review', report: the stored ReviewReport, resolutions: reviewResolutions }. An entry is appended only when its id is not found in History.log.

**Call sites:**
- `src/workflow/artifact-core/history.ts`
- `src/workflow/artifact-core/lifecycle.ts`
- `src/workflow/artifact-core/sidecar.ts`

### 3.3 `Lifecycle (converted head)` — field-modify

status, approval, review and stale are computed from meta.approvedAt, rejectedAt, rejectReason, reviewOverride, staleAckedAt and meta.review with reviewResolutions applied (as effectiveReviewVerdict decides), bound to the head's current meta.revision; a review dated before the revision is not bound to it. The revision number, status and approval are kept as stored; revision.contentHash is contentHash of the converted description, body and citations. lifecycle.review keeps verdict, counts, party and at, and its report is a Reference { entityId: the artifact id, type: 'change-log-entry', relation: 'reviews', fragment: the review entry id }. Current behaviour kept (invariant): approval and review bind to a revision number, not to a hash, so a changed hash does not unbind them (src/workflow/storage.ts, src/workflow/artifact-core/lifecycle.ts).

**Call sites:**
- `src/workflow/artifact-core/lifecycle.ts`
- `src/workflow/artifact-core/types.ts`
- `src/workflow/storage.ts`
- `src/workflow/gates.ts`
- `src/workflow/review/resolve.ts`

### 3.4 `Review report location` — field-modify

The full ReviewReport (findings, claims, model, reviewedBy) and the resolutions leave meta.review and meta.reviewResolutions and live in the outcome.data of the artifact's 'review' change-log entry; new reviews written by persistReview do the same, and a later resolution is a further log entry with outcome.data.kind 'review-resolution'. Readers use readReviewReport: src/workflow/review/resolve.ts (effectiveReviewVerdict), src/workflow/tracker-auto.ts (readReview, 377-381), src/workflow/delivery/gate.ts (103), src/workflow/delivery/currency.ts (80, 181), src/workflow/review/party.ts (reviewerPartyOf), src/workflow/gates.ts (641, 746, 889), src/workflow/artifact-content.ts.

**Call sites:**
- `src/workflow/review/resolve.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/delivery/gate.ts`
- `src/workflow/delivery/currency.ts`
- `src/workflow/review/party.ts`
- `src/workflow/gates.ts`
- `src/workflow/artifact-content.ts`

### 3.5 `Migration write (head)` — new

A head is written by writeMigratedHead, not by ArtifactStore.write: the store's content write moves meta.revision and returns the head to draft when the content hash changes (src/workflow/storage.ts, prepareArtifactWrite), and the conversion changes the body (it strips body.feedback and rewrites ids). The migration write sets meta.envelope and meta.lifecycle, strips the legacy fields, keeps meta.revision, and writes by writeAtomic after the log entries; it does not touch the sc2 store contract.

**Call sites:**
- `src/workflow/artifact-core/store.ts`
- `src/workflow/storage.ts`
- `src/workflow/artifact-core/history.ts`

### 3.6 `meta legacy stamps: writers and gates` — field-remove

Move to LifecycleService (apply, updateContent) and delete the stamp: src/workflow/gates.ts (approveArtifactByJsonPath, reject and ack-stale gates, STAMP_KEYS, mirrorLegacyReview, headConflict becomes the full log check), src/workflow/review-decision.ts, src/workflow/review/resolve.ts, src/workflow/bugfix/stamp.ts, src/workflow/bugfix/mount.ts, src/workflow/artifacts/issue.ts, src/daemon/tasks-sync.ts, src/daemon/index.ts, src/workflow/runners/build/completion-record.ts, src/workflow/runners/build/standalone-record.ts, src/workflow/runners/build/range-base.ts. LifecycleService becomes mandatory on WorkflowApproveRequest and ReviewArtifactOpts.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/review-decision.ts`
- `src/workflow/review/resolve.ts`
- `src/workflow/bugfix/stamp.ts`
- `src/workflow/bugfix/mount.ts`
- `src/workflow/artifacts/issue.ts`
- `src/daemon/tasks-sync.ts`
- `src/daemon/index.ts`
- `src/workflow/runners/build/completion-record.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/runners/build/range-base.ts`

### 3.7 `meta legacy stamps: readers` — field-remove

Read the lifecycle (status, approval, review, stale) instead; ordered before the conversion is first run: src/workflow/delivery/load.ts (approvalOf), src/workflow/delivery/gate.ts, src/workflow/delivery/currency.ts, src/workflow/delivery/types.ts, src/workflow/pending.ts, src/workflow/bugfix/admit.ts, src/workflow/chain.ts, src/workflow/artifact-content.ts, src/workflow/artifact-core/completion-evidence.ts, src/workflow/runners/tracker/context.ts, src/workflow/tracker/conventions.ts, src/workflow/types.ts, src/shared/access.ts, src/mcp/server.ts, src/cli/services/workflow.ts, src/workflow/tracker-auto.ts, src/workflow/review/party.ts, src/daemon/workflow-rpc.ts, src/workflow/artifact-write-inventory.ts (the findings.ts entry changes with persistReview).

**Call sites:**
- `src/workflow/delivery/load.ts`
- `src/workflow/delivery/gate.ts`
- `src/workflow/delivery/currency.ts`
- `src/workflow/delivery/types.ts`
- `src/workflow/pending.ts`
- `src/workflow/bugfix/admit.ts`
- `src/workflow/chain.ts`
- `src/workflow/artifact-content.ts`
- `src/workflow/artifact-core/completion-evidence.ts`
- `src/workflow/runners/tracker/context.ts`
- `src/workflow/tracker/conventions.ts`
- `src/workflow/types.ts`
- `src/shared/access.ts`
- `src/mcp/server.ts`
- `src/cli/services/workflow.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/review/party.ts`
- `src/daemon/workflow-rpc.ts`
- `src/workflow/artifact-write-inventory.ts`

### 3.8 `Amendment records (flat) and their stamps` — new

Each flat AMD file becomes a { meta, body, citations } head with a lifecycle from its own approval and rejection stamps; approveAmendment and the other amendment functions move to the head shape and the lifecycle in the same change.

**Call sites:**
- `src/workflow/amendments/store.ts`
- `src/workflow/amendments/types.ts`
- `src/workflow/amendments/effective.ts`
- `src/workflow/amendments/staleness.ts`
- `src/workflow/artifact-core/decode.ts`

### 3.9 `Review persist path` — field-modify

persistReview replaces the three copies of inspect, head conflict check, fix, stamp, lifecycle record and markdown. src/daemon/steps/review-step/phases/findings.ts, which today stamps meta.review with a meta-only write and records nothing on the lifecycle, joins it, so HLD and LLD design reviews are bound to the lifecycle without the approval-time mirror. The lifecycle record comes before the markdown; a failure names the step.

**Call sites:**
- `src/daemon/steps/review-step/phases/findings.ts`
- `src/daemon/steps/review-step/phases/verdicts.ts`
- `src/workflow/review/run-artifact.ts`
- `src/workflow/gates.ts`

### 3.10 `body.feedback` — field-remove

Each entry becomes a Feedback line through convertLegacyFeedback and the decision of each batch the outcome of a change log entry; the field is stripped by the migration write from DEF, HLD, LLD and PLAN heads. appendFeedback, appendFeedbackBatch and the tool artifact_feedback_append are removed; the companion headers and the delivery text read FeedbackService threads. convertLegacyFeedback changes: actor id (namespaced id kept, else legacy:<slug>, author text in actor.properties.name), kind by decision, foreign target.file in anchor.section.

**Call sites:**
- `src/workflow/artifact-core/feedback-convert.ts`
- `src/workflow/artifacts/provenance/writer.ts`
- `src/workflow/artifacts/provenance/tool.ts`
- `src/workflow/artifacts/provenance/schema.ts`
- `src/workflow/artifacts/provenance/types.ts`
- `src/workflow/artifacts/define.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/plan.ts`
- `src/workflow/artifact-content.ts`
- `src/workflow/artifact-core/history.ts`
- `src/workflow/feedback/feedback-service.ts`
- `src/workflow/runners/build/standalone-record.ts`

### 3.11 `meta.tracker unit records` — field-remove

epicRef and storyRef(s) move to the binding of the EPIC and STORY head they describe (move-binding, limited to Define to EPIC and LLD to STORY); taskRefs and units for Tasks are moved by TaskSets.createFromPlan alone (no second writer). All are removed with their readers: src/workflow/tracker/unit-issue.ts (older-refs rebind, Task branch of recordUnit, bindingHome's Plan fallback), refs.ts, resolve.ts, sync.ts, link.ts, conventions.ts, src/workflow/orchestrator.ts, chain.ts, questions.ts, storage.ts, tracker-auto.ts, the artifact renderers define.ts, hld.ts, lld.ts, tracker.ts, the tracker runners context.ts, index.ts, schemas.ts, runners/build/changed-files.ts, code-review/grounding.ts, tasks/task-set.ts, daemon/steps/build-step/render.ts.

**Call sites:**
- `src/workflow/tracker/unit-issue.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/tracker/resolve.ts`
- `src/workflow/tracker/sync.ts`
- `src/workflow/tracker/link.ts`
- `src/workflow/tracker/conventions.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/chain.ts`
- `src/workflow/questions.ts`
- `src/workflow/storage.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/artifacts/define.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/tracker.ts`
- `src/workflow/runners/tracker/context.ts`
- `src/workflow/runners/tracker/index.ts`
- `src/workflow/runners/tracker/schemas.ts`
- `src/workflow/runners/build/changed-files.ts`
- `src/workflow/code-review/grounding.ts`
- `src/workflow/tasks/task-set.ts`
- `src/daemon/steps/build-step/render.ts`

### 3.12 `Story history on the LLD` — field-modify

The move-story-history rule copies, for each Story, the LLD's attachments, its tracker:<comment id> feedback lines and its feedback-post receipts to the STORY head (sidecar lines are append-only, so the LLD keeps its copies as history; feedback ids de-duplicate). artifactOfUnit in src/workflow/tracker/comment-sync.ts then answers the STORY head, so the sync reads and posts there. The unmarked pre-s8 'Attached ...' comments are not rewritten: when a tracker port is supplied the plan lists them in legacyAttachComments and the report names them.

**Call sites:**
- `src/workflow/tracker/comment-sync.ts`
- `src/workflow/tracker/binding.ts`
- `src/workflow/tracker/unit-issue.ts`

### 3.13 `EPIC and STORY heads` — new

One EPIC head per Define and one STORY head per Story in it, created with the pass-through codecs; parent chain Epic, Story, LLD; the Epic binding moves from the Define's envelope and the Story binding from the LLD's, with their attachments; status by rollUp. Folders under docs/epics keep their names.

**Call sites:**
- `src/workflow/artifact-core/codecs.ts`
- `src/workflow/artifact-core/store.ts`
- `src/workflow/tracker/binding.ts`

### 3.14 `Task heads for earlier Stories` — new

TaskSets.createFromPlan runs for each approved PLAN that has no TASKS head (plan row ids kept); it already moves the Plan's Task tracker record onto each head's binding (src/workflow/tasks/task-set.ts, doc at lines 140-146), so the conversion adds no Task-record writer. One revision-less build round (kind build-round) is back-filled per BUILD task result that passed. bindingHome's Plan fallback and taskBuildPassed's BUILD-record branch are then deleted.

**Call sites:**
- `src/workflow/tasks/task-set.ts`
- `src/workflow/tracker/unit-issue.ts`
- `src/workflow/artifact-core/completion-evidence.ts`

### 3.15 `RepoSchema marker` — new

writeRepoSchema writes .insrc/schema.json as { version: 2, convertedAt } by a temporary file and a rename, only after every head is clean. The RepoSchema shape is the sc8 shape unchanged; this Story is the only writer. No other file is written for older builds, which are not expected to work with a converted repository (owner ruling, ac29 revision 2).

**Call sites:**
- `src/workflow/artifact-core/repo-schema.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | The rename rule uses ArtifactIds.parse and make to turn S001 into s1 and derives EPIC, STORY and TASK ids with make; no other id is formed by hand (the single rename k2 allows). |
| `sc2` | consumes | The planner and the verifier read through ArtifactStore (read, readWithHistory, childrenOf); heads are written by the conversion-owned migration write, so the store contract is unchanged. EPIC, STORY and Task heads are created through the store. |
| `sc3` | consumes | Migrated log entries (including the review entry that carries the full report) and build rounds are appended with History.appendLog, converted and moved feedback with History.appendFeedback; entries de-duplicate by id. |
| `sc4` | consumes | Statuses are computed with the lifecycle rules and rollUp; checkHeadIntegrity and checkIntegrity must pass for every head before the marker; the revision-bearing migrated entry is the last revision-bearing entry. lifecycle.review.report uses the Review type's existing report Reference. |
| `sc5` | consumes | Uses the sidecar store for the log and feedback files and relies on its merge rules, ordering and de-duplication; the conversion commit includes the new line files. |
| `sc6` | consumes | Moves the Epic and Story bindings and attachments with bindArtifact and readBinding; the optional relabel and legacy-comment listing use the tracker port only when one is supplied and never block the marker. |
| `sc7` | consumes | Creates the Task heads of earlier Stories with TaskSets.createFromPlan, which is also the only mover of Task records; the TaskSet contract is unchanged. |
| `sc8` | consumes | Writes the marker RepoSchemaGate reads and uses RepoSchemaGate.require as the refusal at every entry point of the new tools. |

## 5. Error paths

**Error cases**

- **The working tree has uncommitted changes under .insrc/artifacts or docs/epics, or a merge is in progress, when a run starts** (recoverable)
  - Detection: planConversion runs git status on those paths and checks for MERGE_HEAD before it reads any file
  - Response: Refuse with ConversionRefused naming the paths; write nothing
  - User impact: The user commits or stashes first, so the conversion's diff holds only conversion changes and reverts with one git revert
- **A stored file is not valid JSON, has merge conflict markers, or has meta but no body** (recoverable)
  - Detection: The planner reads raw JSON per file and records a problem instead of passing the file to the strict decoder
  - Response: The plan lists the file as a problem; apply refuses while any problem is open and the marker is not written
  - User impact: The user fixes or removes the file and previews again
- **The tree changed between preview and apply** (recoverable)
  - Detection: applyConversion recomputes the plan and compares it with the plan it was given
  - Response: Refuse with ConversionRefused and show what differs
  - User impact: Preview again, then apply
- **Apply stops after a migrated log entry was appended and before the head was replaced** (recoverable)
  - Detection: On the rerun the planner finds the entry by its deterministic id (migrated-<artifact id>) in History.log while the head still lacks the envelope or lifecycle or still carries a legacy field
  - Response: The rerun appends no second entry and runs the migration write for the head only
  - User impact: A rerun finishes the head; until then the marker is absent and the new tools refuse the repository
- **Apply stops before any entry was appended, or between two stamp entries** (recoverable)
  - Detection: The planner finds some of the ids migrated-<artifact id>, -approve, -reject, -review, -mark-stale and not others
  - Response: Only the missing entries are appended, stamp and review entries first and the revision-bearing entry last, then the head is written
  - User impact: None beyond running the command again
- **The migration write would change an approved head's revision number, status or approval** (terminal)
  - Detection: writeMigratedHead compares the converted head's meta.revision, lifecycle status and approval with the stored ones before the replace
  - Response: Refuse that head with ConversionIncomplete, write nothing for it and list it; this is a conversion bug, not a user error
  - User impact: The marker is not written and the head is named
- **A head still carries a legacy field, or fails checkHeadIntegrity or checkIntegrity, after its rules ran** (recoverable)
  - Detection: The post-apply sweep re-reads every head and runs both checks
  - Response: ConversionIncomplete lists the heads and the field or reason; the marker is not written
  - User impact: The conversion is reported unfinished; the user sees which artifacts need attention
- **The after-snapshot differs from the before-snapshot for a unit (an approval is missing, a review is no longer blocking)** (recoverable)
  - Detection: verifyConversion compares the planner's legacyDeliveryView snapshot with the snapshot the delivery reader builds from the lifecycle of the converted heads
  - Response: Report each difference with the unit and the reason; never correct it; a contentHash difference is expected and not reported
  - User impact: The user decides whether a difference is expected
- **The conversion is run before the delivery readers were moved to the lifecycle** (recoverable)
  - Detection: verifyConversion reads the converted heads through the delivery reader and finds no approval on any approved unit; apply checks, before it starts, that the delivery reader's approval source is the lifecycle (a build-time guard in the plan: the reader group is a precondition)
  - Response: Refuse to apply with ConversionRefused naming the unmoved reader
  - User impact: The reader group is finished first
- **A review report cannot be placed (the review stamp has no verdict, or its findings are malformed)** (recoverable)
  - Detection: The lifecycle back-fill validates the stored report the way the delivery gate does and drops malformed findings into the report's own list of dropped values
  - Response: The review entry carries the report as stored plus the dropped values; the lifecycle gets the verdict only when it is valid; the report counts these heads
  - User impact: Nothing is lost silently
- **An uppercase story id would rename onto an existing file or onto another rename's target** (recoverable)
  - Detection: The planner builds the rename map first and checks every target name against existing files and other renames
  - Response: A collision is a problem in the plan and no rename is applied
  - User impact: The user resolves the collision by hand
- **A reference to a renamed id sits where the planner cannot rewrite it (free text, an issue body on the tracker)** (recoverable)
  - Detection: After the rename map is built, the planner searches heads and docs for each old id
  - Response: References in structured fields are rewritten; references in prose are listed in the report and left as they are
  - User impact: The report names each remaining place
- **The optional tracker step fails (no gh access, rate limit, the issue was deleted)** (recoverable)
  - Detection: The tracker port returns a failed PortResult
  - Response: Record the failure in the report with the issue and the reason; do not block the marker; the next run retries
  - User impact: A possible duplicate issue is accepted until the step succeeds, as the s1 hand-off says
- **Pre-s8 'Attached ...' comments exist on a bound issue** (recoverable)
  - Detection: With a tracker port supplied, the planner lists the issue's comments and matches the legacy attach shape (no insrc marker)
  - Response: They are listed in legacyAttachComments and in the report; nothing is rewritten or deleted and no reader recognises them
  - User impact: The first comment sync records each as a person's comment; the owner may delete them on the issue first
- **A legacy review is dated before the head's current revision, or reviewResolutions contradict the stored verdict** (recoverable)
  - Detection: The lifecycle back-fill applies the same rule as effectiveReviewVerdict and the gate's mirror: a review older than the revision is not bound to it
  - Response: The lifecycle gets no review for that head and the report counts it under unbound reviews; the review entry still records the report
  - User impact: The other-party review gate asks for a new review, as it would have before
- **A body.feedback entry has an author that is not a namespaced id, or a target.file that is not the artifact's own document** (recoverable)
  - Detection: convertLegacyFeedback inspects the author text and the target
  - Response: The author becomes legacy:<slug> with the text in actor.properties.name; a foreign file goes to anchor.section; both are counted in the report
  - User impact: Nothing is dropped
- **A new tool runs on an unconverted repository** (recoverable)
  - Detection: RepoSchemaGate.require(repo, 2) at the entry of each daemon method and MCP step
  - Response: Return the message that names the conversion and repo.convert
  - User impact: A clear refusal instead of a decoder error
- **A step of persistReview fails (the fix is stored, the lifecycle review is not)** (recoverable)
  - Detection: persistReview wraps each of its steps and records which completed
  - Response: ReviewPersistError names the failed step and what is stored; the lifecycle record comes before the markdown, so a rerun repairs the rest
  - User impact: The reviewer sees which step to repeat

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository that is already converted | preview and apply report no changes and write nothing; the marker's convertedAt is not touched |
| A repository with no artifacts | apply writes the marker only and reports zero changes |
| A head that already has meta.lifecycle (written after s3) and a log from s4 | Only the legacy fields are stripped and the hash refreshed; the migrated entry is operation update and revision-bearing, so checkIntegrity compares against it |
| A head with no log at all | The migrated entry is operation create and is the first entry; the head and the log agree |
| A head with meta.rejectedAt and a later meta.approvedAt | Status follows the later stamp; both stamp entries are recorded with their original times |
| A design artifact with a review and resolutions for some findings | The review entry holds the report and resolutions; effectiveReviewVerdict computed from it equals the verdict the old stamp gave |
| A Define whose Stories were never designed | An EPIC head and STORY heads are created in draft with no binding; no Task heads |
| A PLAN that was never approved | No Task heads are created; its tasks stay rows of the PLAN |
| A PLAN whose Task already has a TASK head | createFromPlan is not run again; only missing back-fills are written |
| A BUILD record with a task result that did not pass | No build round is back-filled for it |
| An LLD whose tracker feedback lines were already copied to its STORY head | Feedback ids de-duplicate, so nothing is appended twice |
| A feedback entry with no kind, or kind and decision feedback | No kind becomes comment; kind or decision feedback becomes revision-request |
| A standalone design with no Define and no epicCreatedAt | The stamp is taken from the design's own createdAt; none is a problem |
| Thousands of files | The plan is held in memory; the report prints counts and the first problems, the full list is in the result |

**Invariants to preserve**

- A revision moves only when content changes: the conversion keeps every head's meta.revision, status and approval as stored, and only the contentHash (of the converted content) changes (k3; src/workflow/storage.ts reconciles the hash on a content write, which is why the store is not the write path) [[c1]]
- Approval and review bind to a revision number, not to a hash, so the new contentHash does not unbind them (src/workflow/artifact-core/lifecycle.ts) [[c1]]
- The delivery reader reads one shape after the reader group is done: the lifecycle; the legacy stamp rules live only in the conversion's legacyDeliveryView and go with it (src/workflow/delivery/load.ts approvalOf is the behaviour that is reproduced once) [[c2]]
- An artifact id never changes once created, except the single rename of an uppercase story id to lowercase by this conversion (k2) [[c3]]
- The marker is written last and only when every head passes the head and log integrity checks, so a half-converted repository is refused by the new tools [[c4]]
- The conversion is repeatable: every rule tests the stored state and every migrated log entry has a deterministic id, so a second run writes nothing [[c1]]
- Feedback entries are immutable and append-only; converting or copying them stores each id once (the sidecar reader de-duplicates by id) [[c1]]
- Folder names under docs/epics stay as they are (k7) [[c4]]
- The daemon owns all file access; the command is an IPC method and the CLI only calls it [[c4]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), tests co-located in __tests__ directories, as for the rest of src/workflow`

**Test levels**

- **unit** — Each conversion rule on a small fixture: it applies to the stored state it names, changes nothing when that state is absent, and is repeatable.
  - Subjects: `convertLegacyFeedback: a namespaced author is kept lower-cased, any other author becomes legacy:<slug> with the text in actor.properties.name`, `convertLegacyFeedback: decision or kind feedback is revision-request, suggestion stays, the rest comment`, `convertLegacyFeedback: a foreign target.file goes to anchor.section and is not reported unmapped; id, timestamp, batchId and revision are kept`, `rename of uppercase story ids with collision and prose-reference reporting`, `epicCreatedAt stamping from the work item head`, `flat amendment to head conversion`, `lifecycle computed from approvedAt, rejectedAt, reviewOverride, staleAckedAt and review with reviewResolutions, including a review older than the revision and a rejection followed by an approval`, `migratedEntryId is stable; the stamp entries carry the original times; the review entry carries the full report and the resolutions`, `readReviewReport returns the report from the entry the lifecycle Reference names, and effectiveReviewVerdict computed from it equals the verdict the old stamp gave`, `legacyDeliveryView reproduces the old delivery reader's approval, review and blocking for approved, rejected, pending and blocked heads`, `writeMigratedHead: an approved head keeps its revision number, status and approval, and contentHash is that of the converted content`, `writeRepoSchema writes by temporary file and rename`, `RepoSchemaGate.require refusal message`
  - Fixtures: `a small repository builder with one file per artifact type in the legacy shape`, `legacy review and stamp combinations`, `heads with and without meta.lifecycle and a log`
- **integration** — The whole command on a repository with every artifact type, through the real store, history, lifecycle service, delivery reader and task sets; the entry points that must refuse an unconverted repository; and the crash and rerun paths.
  - Subjects: `preview writes nothing and lists the changes`, `apply on a legacy fixture converts every head, creates EPIC, STORY and Task heads, and writes the marker last`, `a second apply writes nothing (bytes of every file and line file unchanged)`, `a crash injected after each step of writeMigratedHead and each rule, then a rerun, gives the same result as an uninterrupted run with one migrated entry per head`, `an approved head keeps its revision number, status and approval after conversion and checkIntegrity passes`, `verify: an approved legacy head verifies with no difference (before-snapshot from legacyDeliveryView, after-snapshot from the real delivery reader), and a planted difference is reported`, `apply refuses while the delivery reader still reads the legacy stamps`, `move-binding (Define to EPIC, LLD to STORY) and move-story-history: the STORY head holds the binding, the attachments, the tracker:<id> feedback lines and the receipts, and artifactOfUnit answers it`, `createFromPlan for earlier Stories moves the Plan's Task record, and the conversion writes no Task record itself`, `daemon repo.convert default mode is preview`, `each daemon method and MCP step refuses an unconverted repository with the conversion message`
  - Fixtures: `a legacy repository fixture with a Define, HLD, LLD, PLAN, BUILD, CR, TESTS, ISSUE, SPEC, EXT and flat AMD files, uppercase S001 ids, body.feedback, a design review with resolutions and an approved LLD with a bound issue`, `a fake tracker port with legacy attach comments`
- **contract** — Retiring the legacy fields: no production file reads or writes the removed stamps, and the gates, delivery board and review paths work from the lifecycle alone.
  - Subjects: `a source check that no production file under src names meta.approvedAt, rejectedAt, staleAckedAt, reviewOverride, reviewResolutions, rejectReason, meta.review or the body.feedback writers, outside the conversion module`, `approval, rejection, stale acknowledgement and review through LifecycleService only`, `persistReview with a failure injected at each of its steps: the error names the step and a rerun repairs the state`, `findings, verdicts and run-artifact all call persistReview and HLD and LLD design reviews bind to the lifecycle`, `tracker-auto readReview, reviewerPartyOf and the delivery gate read the report through readReviewReport`, `the PLAN task table rendered from the Task heads`, `delivery board status and counts equal the pre-conversion read on the fixture`
  - Fixtures: `converted fixture repository`
- **smoke** — The command on this repository's own copy, reported by hand because it needs a real checkout and a person to read the report.
  - Subjects: `preview on a copy of this repository lists the expected 444 renames and 56 flat amendments`, `apply then verify on the copy reports no unexplained difference and every approved artifact keeps its revision number`
  - Fixtures: `a clean copy of the repository`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac27` | `convert-apply.test.ts: apply on a legacy fixture converts every artifact, creates Epic, Story and Task heads, computes statuses and fills the log marked as migrated`, `convert-lifecycle-backfill.test.ts: the lifecycle and the migrated entries are computed from the legacy fields, an approved head keeps its revision number, status and approval, and the review report is read back from its entry`, `convert-feedback.test.ts: each mapping of convertLegacyFeedback from the s5 hand-off`, `convert-ids.test.ts: uppercase story ids are renamed once with references rewritten and none left as an alias`, `convert-tasks.test.ts: Task heads, bindings and build rounds are created for Stories planned before s7 and createFromPlan alone moves the Task records`, `convert-story-history.test.ts: bindings, attachments, tracker feedback lines and receipts move to the STORY head` |
| `ac28` | `convert-preview.test.ts: a preview writes nothing and lists what would change`, `convert-repeat.test.ts: a second apply, and an apply crashed at each step then rerun, write nothing more and leave one migrated entry per head`, `convert-verify.test.ts: an approved legacy head verifies with no difference through the delivery reader and a planted difference is reported` |
| `ac29` | `repo-schema-entry-points.test.ts: each daemon method and MCP step refuses an unconverted repository with a message naming the conversion`, `convert-marker.test.ts: the marker is written last and only when every head is clean` |

## 7. Migration

**State before:** Repository at schema version 1 (no .insrc/schema.json). Heads carry the legacy stamps (meta.approvedAt, rejectedAt, rejectReason, reviewOverride, staleAckedAt, review, reviewResolutions) beside or instead of meta.lifecycle; body.feedback holds pre-s5 feedback; the Epic and Story bindings and attachments sit on the Define and the LLD; a Story's tracker feedback lines and receipts sit on the LLD; the Plan keeps the Task tracker records; no EPIC, STORY, TASKS or TASK heads exist for Stories planned before s7; AMD files are flat records; 444 files carry uppercase S0nn ids. The delivery reader derives approval and review only from the legacy stamps (src/workflow/delivery/load.ts approvalOf, gate.ts, currency.ts). A content write through ArtifactStore moves meta.revision and returns the head to draft when the content hash changes (src/workflow/storage.ts). The gates still write the legacy fields while the readers read them (s1 bundles 'how a head is written', 'the delivery reader derives approval and review only from the legacy stamps', 'the legacy stamp surface after s1-s8, by role', 'the lifecycle Review keeps only a summary of a review', 'tracker records, story history and feedback that move or go').

**State after:** Repository at schema version 2. Every head has meta.envelope and meta.lifecycle with the revision number, status and approval it had, a contentHash of the converted content, a revision-bearing migrated log entry (migrated-<artifact id>), stamp entries that record the legacy approval, rejection and stale marks, and a review entry that carries the full review report and resolutions (lifecycle.review.report references it). Feedback is in sidecar lines with namespaced actors; EPIC, STORY, TASKS and TASK heads exist and hold the bindings, attachments, tracker feedback lines and receipts; AMD records are heads; ids are lowercase. The legacy stamps, meta.review, the body.feedback writers, the Plan Task records and the head-less fallbacks are gone from heads and production code; the delivery reader and every other reader read the lifecycle; LifecycleService is the only approval path; persistReview is the one review path; new tools refuse a repository without the marker.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Build the conversion engine behind the daemon method repo.convert (default mode preview): the planner with legacyDeliveryView, the per-rule converters, the migration write, the applier, the verifier and the marker writer. Change convertLegacyFeedback to the s5 mapping. Add readReviewReport and persistReview. Nothing is switched on for a repository yet. — ↩ rollbackable
2. Move the readers to the lifecycle, delivery readers first (load, gate, currency, types), then pending, admit, chain, artifact-content, completion-evidence, the tracker readers, party, workflow-rpc, access, mcp server and cli service; the review readers use readReviewReport. Update the write inventory for findings.ts. This group is a precondition of the first run of the conversion. — ↩ rollbackable
3. Move the writers and gates to LifecycleService and delete the stamps (STAMP_KEYS, mirrorLegacyReview, headConflict becomes the full log check); findings, verdicts and run-artifact call persistReview; make LifecycleService mandatory. — ↩ rollbackable
4. Remove body.feedback writers and the tool artifact_feedback_append; remove the Plan Task record readers, bindingHome's Plan fallback, taskBuildPassed's BUILD-record branch and the older tracker refs (epicRef, storyRef, storyRefs, taskRefs, units); point artifactOfUnit at the STORY head; render the PLAN task table from the Task heads; add the RepoSchemaGate.require guards at each daemon method and MCP step (repo.convert is exempt). — ↩ rollbackable
5. Run the Story's full test sweep and build, code-review and approve the BUILD with the previous daemon still running; the daemon that drives the build keeps its old code until it is restarted, so the build tooling is not refused by its own guards. — ↩ rollbackable
6. Restart the daemon on the new code, then on a clean working tree run preview and read the plan: renames, problems, unmapped values, reviews that cannot be bound, prose references to renamed ids, legacy attach comments. — ↩ rollbackable _(needs: `clean working tree`, `no merge in progress`, `steps 2 to 4 built`)_
7. Run apply. Rules run in order: rename uppercase ids and files; stamp epicCreatedAt; convert flat amendments; for each head, under the artifact's lock, append the missing migrated log entries (stamp and review entries first, the revision-bearing entry last) and then replace the head with the migration write; convert body.feedback; create EPIC and STORY heads; create Task heads for earlier Stories through TaskSets.createFromPlan and back-fill build rounds; move the Epic and Story bindings and attachments; move story history; strip the legacy fields. The working tree is left changed. — ↩ rollbackable _(needs: `step 6 preview read`)_
8. Run the post-apply sweep: every head decodes, carries no legacy field and passes checkHeadIntegrity and checkIntegrity, and every approved head has its stored revision number, status and approval. Only then write .insrc/schema.json (version 2) by temporary file and rename. — ↩ rollbackable
9. Run verify: the before-snapshot the planner computed from the legacy stamps against the snapshot the delivery reader builds from the converted repository; print each difference. — ↩ rollbackable
10. Optional, with a tracker: relabel and retitle old issues so the create guard recognises them and list the pre-s8 attach comments; report failures. — ✕ non-rollbackable _(needs: `gh access`)_
11. Commit the result as one commit (the data changes, the new line files and the marker). Reverting it with git revert returns the tree to version 1 for the tools of the previous release. — ↩ rollbackable

**Backward compat:** None is kept in the new tools: a repository without the marker is refused, and the old shapes are not read after this Story. Builds from before this model are not expected to work with a converted repository (the owner's ruling, recorded in docs/plans/core-data-model.md and in ac29 revision 2 of the DEF); no notice file or compatibility reader is added. The IPC method names are unchanged; repo.convert is added; artifact_feedback_append and the legacy-stamp parameters of the gates are removed.

## 8. Alternatives considered

### 8.1 a1: Conversion engine with its own migration write and planner-side before-snapshot — **CHOSEN**

A planner, an applier, a verifier and a marker writer in src/workflow/convert; heads are written by a conversion-owned migration write that keeps revision, status and approval as stored; the before-snapshot is computed from the raw legacy heads and the after-snapshot is read with the real delivery reader.

A new module src/workflow/convert holds planConversion, applyConversion, verifyConversion and a migration writer. The planner reads raw JSON files (not through the strict decoder), returns a typed list of changes per artifact, and computes the BEFORE snapshot with a pure conversion-owned function legacyDeliveryView over the legacy stamps (status, revision number, approval, review verdict, blocking, open feedback count). The applier runs the rules in a fixed order. For each head it takes ArtifactStore.exclusive, appends the missing migrated log entries with deterministic ids (migrated-<artifact id>-approve, -reject, -review, -mark-stale, then the revision-bearing migrated-<artifact id>) through History.appendLog, then replaces the head with the migration write. The migration write builds meta.envelope and meta.lifecycle, strips the legacy body and meta fields, keeps meta.revision, status and approval as stored, sets revision.contentHash to the hash of the converted content, sets lifecycle.review.report to a Reference to the review change-log entry (which carries the full review report and resolutions as outcome.data), and writes by writeAtomic; it appends nothing. EPIC and STORY heads, Task heads (TaskSets.createFromPlan, which also moves the Plan's Task record), the Epic and Story bindings and the Story history are created or moved by the same applier. The AFTER snapshot is read with the real delivery reader, which by then reads the lifecycle only, because the reader move is ordered before the first run of the conversion; the new tools refuse an unconverted repository and repo.convert is exempt. The marker is written last, only when every head passes the integrity checks. The retirement of the legacy stamps and fallbacks is a separate, ordered group of changes in the same Story.

### 8.2 a2: Add a migrate method to ArtifactStore and a dual-shape delivery reader

The store gets a migration write of its own (added to sc2 by an amendment) and the delivery reader reads both the legacy stamps and the lifecycle, so the snapshots use the one reader.

ArtifactStore gains migrate(a, by, options) that writes the envelope and lifecycle and the stripped body without moving the revision, through the same staged operation and journal as write, with a caller-chosen operation id (a sharedContract.methodAdd amendment on sc2). The delivery reader gains a mode that reads the lifecycle when a head has one and the legacy stamps otherwise, so the same reader produces the before and after snapshots. The rest follows a1.

**Rejected because:** Equal on the criteria but partial on sc2 and sc5, and it keeps a dual-shape delivery reader the owner ruled out.

### 8.3 a3: Write through the store and re-approve

Use ArtifactStore.write for every converted head and accept that stripped bodies move revisions and return heads to draft; approvals are re-granted by script.

The converter calls ArtifactStore.write with the converted artifact. Because the body changes, the store moves meta.revision and sets the head to draft; the conversion then re-applies each recorded approval and review through LifecycleService.apply with the migration actor.

**Rejected because:** Smallest, but violates k3, k5 and sc4.

## 9. References

- **[[c1]]** `analyze-bundle` `how a head is written, and why the store cannot be the conversion's write path` — "a 'content' write on a head that carries meta.lifecycle reconciles the lifecycle by the canonical hash of description, body and citations: when it changes, meta.revision becomes the prior revision plu"
- **[[c2]]** `analyze-bundle` `the delivery reader derives approval and review only from the legacy stamps` — "Nothing under src/workflow/delivery reads meta.lifecycle."
- **[[c3]]** `analyze-bundle` `what a conversion has to convert in this repository` — "444 files carry an uppercase S0nn story id"
- **[[c4]]** `analyze-bundle` `the recorded s9 inputs and the no-compatibility ruling` — "the second half of ac29 (an older clone reading the converted repository with a clear message) is dropped"
- **[[c5]]** `analyze-bundle` `the legacy stamp surface after s1-s8, by role` — "src/daemon/steps/review-step/phases/findings.ts writes meta.review with a meta-only write and records nothing on the lifecycle"
- **[[c6]]** `analyze-bundle` `tracker records, story history and feedback that move or go` — "artifactOfUnit in src/workflow/tracker/comment-sync.ts answers the LLD for a Story"
- **[[c7]]** `analyze-bundle` `the legacy feedback converter as it stands` — "convertLegacyFeedback ... builds the actor as { id: 'unknown:<author>', kind: 'person', properties: {} }"

## 10. Open questions

- The test framework is node:test through tsx, as CLAUDE.md states and the artifact-core tests use; the analyze bundles did not report it. Resolve: confirm (recommended).

## Resolved questions

- `qc2b8d3f2` — The test framework is node:test through tsx, as CLAUDE.md states and the artifact-core tests use; the analyze bundles did not report it. Resolve: confirm (recommended).
  - **resolved**: Confirm node:test through tsx (recommended) — CLAUDE.md states it and the artifact-core tests use it. _(2026-10-22T06:16:05.171Z)_

## Citations

- **[[c1]]** `analyze-bundle` `how a head is written, and why the store cannot be the conversion's write path` — "a 'content' write on a head that carries meta.lifecycle reconciles the lifecycle by the canonical hash of description, body and citations: when it changes, meta.revision becomes the prior revision plu"
- **[[c2]]** `analyze-bundle` `the delivery reader derives approval and review only from the legacy stamps` — "Nothing under src/workflow/delivery reads meta.lifecycle."
- **[[c3]]** `analyze-bundle` `what a conversion has to convert in this repository` — "444 files carry an uppercase S0nn story id"
- **[[c4]]** `analyze-bundle` `the recorded s9 inputs and the no-compatibility ruling` — "the second half of ac29 (an older clone reading the converted repository with a clear message) is dropped"
- **[[c5]]** `analyze-bundle` `the legacy stamp surface after s1-s8, by role` — "src/daemon/steps/review-step/phases/findings.ts writes meta.review with a meta-only write and records nothing on the lifecycle"
- **[[c6]]** `analyze-bundle` `tracker records, story history and feedback that move or go` — "artifactOfUnit in src/workflow/tracker/comment-sync.ts answers the LLD for a Story"
- **[[c7]]** `analyze-bundle` `the legacy feedback converter as it stands` — "convertLegacyFeedback ... builds the actor as { id: 'unknown:<author>', kind: 'person', properties: {} }"
