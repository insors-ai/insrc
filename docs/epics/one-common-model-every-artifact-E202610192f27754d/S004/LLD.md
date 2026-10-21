<!-- insrc:artifact LLD-2f27754d4ad00b8e-s4 -->

# LLD: E202610212f27754d:S004

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `aea12dd76292...`

s4 makes an artifact's change log and feedback durable and mergeable, and makes every production approval and review use the durable lifecycle service. Each head gets two append-only line files beside it (a Tasks file's files carry the lines of its Tasks); each line is length-framed so an abandoned fragment is told from corruption, and the files are marked merge=union in a committed .gitattributes, so two clones that add different entries merge without conflict while a changed head still conflicts in git. The write journal becomes a durable file that records the head a write started from, so recovery finishes a write but never overwrites a head that has moved on. The daemon keeps one store and one LifecycleService per repository and gives them to the approve handler, the review-decision step, the daemon review and the controller's verdicts phase, and the BUILD, TESTS and code-review records store their content through that service before their meta and markdown are refreshed, so each round is logged by the same staged write that replaces the record.

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

**Rollout phase:** Phase B — lifecycle and sidecar storage
**Owns:** `sc5` (SidecarStorage)
**Consumes:** `sc1` (ArtifactIdScheme), `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords), `sc4` (Lifecycle)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `SidecarStore.filesOf`

```typescript
filesOf(id: string): ArtifactFiles
```

**Parameters:**
- `id: string` — An artifact id, parsed with ArtifactIds.parse.

**Returns:** `ArtifactFiles` — { head, log, feedback }: .insrc/artifacts/<id>.json, <id>.log.jsonl and <id>.feedback.jsonl, except that a TASK id returns the log and feedback files of the TASKS artifact of its Story.

**Errors:**
- `InvalidArtifactKeyError` when id is not an artifact id

**Preconditions:**
- the store was created for one repository path

**Postconditions:**
- pure: touches no file
- two TASK ids of one Story return the same log and feedback paths, and every other id returns paths named by itself

### 2.2 `SidecarIo.appendRecord`

```typescript
appendRecord<E>(file: SidecarFile, record: SidecarRecord<E>): Promise<void>
```

**Parameters:**
- `file: SidecarFile` — 'log' or 'feedback'.
- `record: SidecarRecord<E>` — The entry and the id of the artifact that owns it.

**Returns:** `Promise<void>` — Resolves once the framed line is in the file.

**Errors:**
- `HistoryEntryError` when the serialised entry is larger than 256 KiB; nothing is appended
- `Error` when the file cannot be written; nothing is appended

**Preconditions:**
- the record's artifactId is an artifact id

**Postconditions:**
- exactly one line of the form <byte length of the json> TAB <json> NEWLINE is added with one append-mode write, through appendSidecarLine
- when the file does not end in a newline (a previous append was torn) the write begins with a newline, so the fragment stays a line of its own
- the file is created with its directory when absent and an existing line is never rewritten

### 2.3 `SidecarIo.readRecords`

```typescript
readRecords<E>(file: SidecarFile, artifactId: string): Promise<E[]>
```

**Parameters:**
- `file: SidecarFile` — 'log' or 'feedback'.
- `artifactId: string` — The artifact whose entries are wanted.

**Returns:** `Promise<E[]>` — The artifact's entries from its file, each once, ordered by timestamp and then by entry id.

**Errors:**
- `HistoryReadError` when a complete frame (its byte length matches) holds invalid json or is not an object with a string artifactId and an entry, or two frames repeat an (artifactId, entry id) with different content; the file and line number are named

**Preconditions:**
- none: a missing file is an empty list

**Postconditions:**
- a line whose frame is incomplete (no tab and length, a length that does not match, or an unterminated last line) is an abandoned fragment: it is skipped and logged with the file and line, and later complete lines are still read
- lines for other artifacts in the same file are ignored
- entries with the same (artifactId, entry id) and the same content are collapsed to one, which makes a repeated append and a union merge harmless

### 2.4 `SidecarStore.mergeAttributes`

```typescript
mergeAttributes(): string[]
```

**Returns:** `string[]` — The .gitattributes lines the store needs: '.insrc/artifacts/*.log.jsonl merge=union' and '.insrc/artifacts/*.feedback.jsonl merge=union'.

**Postconditions:**
- pure
- the store ensures these lines, and the journal folder in the repository ignore file, are present when it is created, adding only what is missing and never removing another line

### 2.5 `WriteJournal.stage`

```typescript
stage(id: string, op: StagedOperation): Promise<void>
```

**Parameters:**
- `id: string` — The artifact id.
- `op: StagedOperation` — The prepared bytes, the whole log entry, the prior revision and the hash of the head the write started from.

**Returns:** `Promise<void>` — Resolves once the staged operation is on disk.

**Errors:**
- `Error` when the journal file cannot be written; the write has not started

**Preconditions:**
- no other operation is staged for id (the store holds the per-artifact queue)

**Postconditions:**
- the operation is written to .insrc/journal/<id>.json with the atomic writer, outside the tracked artifacts folder
- a restart sees it through pending

### 2.6 `WriteJournal.pending`

```typescript
pending(id: string): Promise<StagedOperation | undefined>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<StagedOperation | undefined>` — The staged operation not yet cleared, if any.

**Errors:**
- `Error` when the journal file exists but is not a staged operation; the artifact's writes are refused until a person removes it

**Postconditions:**
- reads one file

### 2.7 `WriteJournal.clear`

```typescript
clear(id: string, operationId: string): Promise<void>
```

**Parameters:**
- `id: string` — The artifact id.
- `operationId: string` — The operation to clear; another staged operation is left alone.

**Returns:** `Promise<void>` — Resolves once the file is removed.

**Postconditions:**
- removing a file that is already gone is not an error

### 2.8 `ArtifactStore.write`

```typescript
write(a: Artifact<HeadPayload>, by: Actor, options?: WriteOptions): Promise<void>
```

**Parameters:**
- `a: Artifact<HeadPayload>` — The whole envelope to store.
- `by: Actor` — As before.
- `options: WriteOptions` _(optional)_ — As before.

**Returns:** `Promise<void>` — As before.

**Errors:**
- `LifecycleConflictError` when recovery finds a staged operation whose head has moved on: the head is neither the hash the write started from nor the staged bytes

**Preconditions:**
- as before

**Postconditions:**
- the order is unchanged: stage, append the log entry, replace the head, clear
- completePending finishes a staged operation only when the head is still the one it started from or already the staged bytes; otherwise it appends nothing, clears nothing, logs the three hashes and throws, so a writeArtifact change made meanwhile is never overwritten
- an entry already in the log is not appended again when recovery replays the operation

### 2.9 `History.openFeedback`

```typescript
openFeedback(id: string): Promise<Feedback[]>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<Feedback[]>` — The feedback no later log entry addressed.

**Errors:**
- `HistoryReadError` when as for readRecords

**Postconditions:**
- feedback and log entries are compared by the same (timestamp, id) order the reader uses, so an entry made at the same instant as the feedback decides by that order and never by the file it was read from
- computed on read: no count, status or open flag is stored

### 2.10 `LifecycleService.inspect`

```typescript
inspect(id: string): Promise<{ status: Status; integrity: Integrity; lifecycle: Lifecycle } | undefined>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<{ status: Status; integrity: Integrity; lifecycle: Lifecycle } | undefined>` — The status of the head, whether it and its log agree, and its lifecycle; undefined when there is no head.

**Errors:**
- `LifecycleConflictError` when a staged write for the artifact found its head moved on

**Postconditions:**
- a staged write the journal still holds is finished under the artifact's queue before the head and the log are read, so a crash between the log append and the head replace never shows as log-ahead-of-head

### 2.11 `LifecycleService.updateContent`

```typescript
updateContent(id: string, by: Actor, payload: HeadPayload): Promise<boolean>
```

**Parameters:**
- `id: string` — The artifact id of a BUILD, TESTS or CR record, a design artifact, or any stored head.
- `by: Actor` — The actor of the log entry.
- `payload: HeadPayload` — The record's new body and citations.

**Returns:** `Promise<boolean>` — True when the store accepted the update.

**Errors:**
- `ArtifactNotFoundError` when no head exists yet; the caller creates the record with its raw writer and logs nothing, as there is no earlier round
- `LifecycleConflictError` when the head conflicts with its hash or a staged write found it moved on

**Postconditions:**
- the content change and its revision-bearing log entry are one staged, queued write, so the earlier round stays readable in the log and the head and the log cannot diverge
- a failure leaves the staged write in the journal for the next write or update to finish; the caller's persist fails with the error and does not go on to write the record's meta or markdown

### 2.12 `persistBuildRecord`

```typescript
persistBuildRecord(repoPath: string, rec: BuildRecord, through?: RoundWriter): Promise<{ md: string; json: string }>
```

**Parameters:**
- `repoPath: string` — The repository.
- `rec: BuildRecord` — The BUILD record to merge and write.
- `through: RoundWriter` _(optional)_ — The LifecycleService and the actor, as in ensureBuildRecordOnCompletion: with it the merged body is stored through updateContent before the raw writers refresh the json meta and the markdown.

**Returns:** `Promise<{ md: string; json: string }>` — The paths written.

**Errors:**
- `LifecycleConflictError` when from updateContent; the persist fails and writes nothing further

**Postconditions:**
- now async; persistStandaloneBuildRecord follows it
- its callers await it: the validate phase, the implement phase and ensureBuildRecordOnCompletion; tests and tools that pass no through keep the plain writeArtifact path

### 2.13 `persistTestRecordTask`

```typescript
persistTestRecordTask(repoPath: string, ident: TestRecordIdent, task: TestRecordTask, seams?: TestRecordSeams, through?: RoundWriter): Promise<{ md: string; json: string }>
```

**Parameters:**
- `repoPath: string` — The repository.
- `ident: TestRecordIdent` — The Story's identity.
- `task: TestRecordTask` — The round's results for one Task.
- `seams: TestRecordSeams` _(optional)_ — As before.
- `through: RoundWriter` _(optional)_ — As for persistBuildRecord.

**Returns:** `Promise<{ md: string; json: string }>` — The paths written.

**Errors:**
- `Error` when the markdown could not be written after the content was stored

**Postconditions:**
- with through, the record's content is stored first; a markdown failure after that does not roll the content back, because the content and its log entry are committed and the markdown is a re-runnable render: the error is returned to the step and the next persist writes it again
- without through the existing json-then-markdown rollback is unchanged
- now async; validate.ts awaits it through its test override seam

### 2.14 `runCodeReview`

```typescript
runCodeReview(subject: CodeReviewSubject, provider: LLMProvider, opts: CodeReviewRunOpts, deps?: CodeReviewRunnerDeps): Promise<CodeReviewRunResult>
```

**Parameters:**
- `subject: CodeReviewSubject` — As before.
- `provider: LLMProvider` — As before.
- `opts: CodeReviewRunOpts` — As before.
- `deps: CodeReviewRunnerDeps` _(optional)_ — Gains an optional through: RoundWriter that the code-review step handler supplies from the registry.

**Returns:** `Promise<CodeReviewRunResult>` — As before.

**Errors:**
- `LifecycleConflictError` when from updateContent; the run reports a failed finalize and no record is replaced

**Postconditions:**
- with deps.through the record's body is stored through updateContent before deps.write refreshes the json and markdown
- without it the finalize is unchanged

### 2.15 `handleVerdicts`

```typescript
handleVerdicts(input: ReviewStepInputVerdicts, lifecycle?: LifecycleService): Promise<ReviewStepDone>
```

**Parameters:**
- `input: ReviewStepInputVerdicts` — The controller's verdicts and the run state token.
- `lifecycle: LifecycleService` _(optional)_ — The repository's service, taken from the registry by the review-step handler for the run's repository.

**Returns:** `Promise<ReviewStepDone>` — As before.

**Errors:**
- `LifecycleConflictError` when the head conflicts with its hash or log; nothing is stamped

**Postconditions:**
- now async; the review-step handler awaits it
- with a service the head and log are checked first, an applied fix is stored through updateContent, the meta.review stamp follows as a meta-only write, and the review is recorded with LifecycleService.apply('review') when the status allows one
- without a service the existing writeArtifact path is unchanged

### 2.16 `workflowReviewStart`

```typescript
workflowReviewStart(rawParams: unknown, send: (msg: IpcStreamMessage) => void, signal: AbortSignal, deps?: WorkflowReviewDeps): Promise<void>
```

**Parameters:**
- `rawParams: unknown` — As before.
- `send: (msg: IpcStreamMessage) => void` — As before.
- `signal: AbortSignal` — As before.
- `deps: WorkflowReviewDeps` _(optional)_ — Gains an optional lifecycle that the daemon fills from the registry; reviewArtifactFile receives it with an actor.

**Returns:** `Promise<void>` — As before.

**Postconditions:**
- the daemon's review passes the repository's LifecycleService to reviewArtifactFile

### 2.17 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { enforce?: boolean }): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Carries lifecycle and actor, which the daemon workflow.approve handler and the review-decision step now always set.
- `opts: { enforce?: boolean }` _(optional)_ — As before.

**Returns:** `Promise<WorkflowApproveResult>` — As before.

**Postconditions:**
- both production callers (src/daemon/index.ts line 657 and src/workflow/review-decision.ts line 164) pass the repository's LifecycleService; the head-only path remains for tests and tools with no daemon

### 2.18 `reviewArtifactFile`

```typescript
reviewArtifactFile(opts: ReviewArtifactOpts): Promise<ReviewArtifactResult>
```

**Parameters:**
- `opts: ReviewArtifactOpts` — Carries lifecycle and actor, which workflowReviewStart now always sets.

**Returns:** `Promise<ReviewArtifactResult>` — As before.

**Postconditions:**
- unchanged by s4 apart from its caller passing the service

### 2.19 `appendSidecarLine`

```typescript
appendSidecarLine(path: string, record: SidecarRecord<unknown>): void
```

**Parameters:**
- `path: string` — A line file.
- `record: SidecarRecord<unknown>` — The record.

**Returns:** `void` — The one place a sidecar line is written, now framed and guarded.

**Postconditions:**
- stays the single writer of a line file, so the write inventory still has one raw append for history

## 3. Data model changes

### 3.1 `Log and feedback line files` — new

<id>.log.jsonl and <id>.feedback.jsonl beside the head in .insrc/artifacts. Each line is <byte length> TAB <SidecarRecord json> NEWLINE. The Tasks file's two files hold the lines of its Tasks. Lines are never rewritten or removed. Reader order is timestamp, then entry id; a repeated (artifactId, entry id) with the same content counts once.

```
+ .insrc/artifacts/<id>.log.jsonl
+ .insrc/artifacts/<id>.feedback.jsonl
```

**Call sites:**
- `src/workflow/artifact-core/sidecar.ts`
- `src/workflow/artifact-core/history.ts`
- `src/workflow/storage.ts`

### 3.2 `.gitattributes merge rules and the ignore entry` — new

Two committed rules, '.insrc/artifacts/*.log.jsonl merge=union' and '.insrc/artifacts/*.feedback.jsonl merge=union', so git keeps the lines of both sides on merge. No rule is set for the head json, so a head changed in two clones conflicts and a person resolves it. The journal folder .insrc/journal/ is added to the ignore file. The store adds missing lines when it is created and never rewrites either file.

```
+ .gitattributes
+ .gitignore: .insrc/journal/
```

**Call sites:**
- `src/workflow/artifact-core/sidecar.ts`

### 3.3 `WriteJournal staged operation file` — new

.insrc/journal/<id>.json holds one StagedOperation as JSON, replaced atomically, removed on clear. It is untracked because a staged write belongs to one working copy and must never be merged.

```
+ .insrc/journal/<id>.json
```

**Call sites:**
- `src/workflow/artifact-core/journal.ts`
- `src/workflow/artifact-core/store.ts`

### 3.4 `StagedOperation` — field-add

priorHeadHash: the sha-256 of the head bytes the write started from, absent for a create. Recovery replaces the head only when it still hashes to priorHeadHash or already equals the staged bytes.

```
+ readonly priorHeadHash?: string | undefined
```

**Call sites:**
- `src/workflow/artifact-core/journal.ts`
- `src/workflow/artifact-core/store.ts`

### 3.5 `RoundWriter` — new

{ writer: { updateContent(id, by, payload): Promise<boolean> }, actor: Actor }: what the round persisters take to store a record's content through the LifecycleService. It is the shape ensureBuildRecordOnCompletion already takes (s3), now shared by persistBuildRecord, persistTestRecordTask and CodeReviewRunnerDeps.

**Call sites:**
- `src/workflow/runners/build/completion-record.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/runners/build/test-record.ts`
- `src/workflow/code-review/runner.ts`

### 3.6 `Per-repository lifecycle registry in the daemon` — new

One ArtifactStore (over the file sidecar and file journal, with the repository's clock), one History and one LifecycleService (createCompletionEvidence as its per-call evidence factory) per registered repository, created on first use and held by the daemon. The workflow.approve handler, the review-decision step, workflowReviewStart, the review-step handler's verdicts phase and the build and code-review step handlers take their service and RoundWriter from it. If creating it fails the request is refused with that error; there is no fallback to the head-only path inside the daemon.

**Call sites:**
- `src/daemon/index.ts`
- `src/workflow/review-decision.ts`
- `src/daemon/workflow-review-rpc.ts`
- `src/daemon/steps/review-step/handler.ts`
- `src/daemon/steps/review-step/phases/verdicts.ts`
- `src/daemon/steps/build-step/phases/validate.ts`
- `src/daemon/steps/build-step/phases/implement.ts`
- `src/daemon/steps/code-review-step/handler.ts`

### 3.7 `CodeReviewRunnerDeps` — field-add

through?: RoundWriter, used by runCodeReview before deps.write.

```
+ readonly through?: RoundWriter | undefined
```

**Call sites:**
- `src/workflow/code-review/runner.ts`
- `src/daemon/steps/code-review-step/handler.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | s4 owns SidecarStorage: filesOf, appendRecord, readRecords and mergeAttributes as in the sketch, implemented over the s2 SidecarIo port. The line format is the SidecarRecord s2 defined, framed with its byte length; the file naming, the Tasks-file sharing, the union rules, the framing, the order and de-duplication are private to s4. |
| `sc3` | consumes | History is unchanged: it reads and appends through SidecarIo. s4 adds nothing to the entry shapes; a round's outcome uses the existing outcome field and the 'update' operation that ArtifactStore.update writes. |
| `sc2` | consumes | Implements the WriteJournal port and uses ArtifactStore.write and update as they are. The only change to the port's data is StagedOperation.priorHeadHash, which s2's follow-up 1 assigned to s4. |
| `sc4` | consumes | Wires LifecycleService over the durable store so approve, review and complete run the log-tail check on every production path (AMD-8), and uses its updateContent and inspect. Consumes checkIntegrity's reasons unchanged. |
| `sc1` | consumes | Parses ids with ArtifactIds.parse, and finds a Task's Tasks file by making the TASKS id from the Task's epic hash and Story. |

## 5. Error paths

**Error cases**

- **A crash tears the last line of a line file (the process dies mid-append), and a later append follows** (recoverable)
  - Detection: appendRecord reads the last byte of the file before it writes and sees no newline; readRecords later finds a line whose frame is incomplete (no tab and length, or a length that does not match the json that follows)
  - Response: the append begins with a newline, so the fragment is a line of its own and the new record is a complete frame on the next line; the reader skips the fragment, logs it with the file and line, and still returns the later records, so torn text is never joined to a good record and never raises
  - User impact: none; the entry whose append was torn was not acknowledged, and its write is repaired from the journal when it had one
- **A complete frame holds invalid json or is not a record (a hand edit, a bad merge)** (recoverable)
  - Detection: readRecords reads a line whose byte length matches its frame and then fails to parse the json, or parses it to something other than an object with a string artifactId and an entry
  - Response: HistoryReadError naming the file and the line number; reads and writes of every artifact that shares that file are refused, approve included, because the log tail cannot be trusted
  - User impact: the artifact cannot be approved or completed until a person repairs the line; other files are unaffected
- **A line file contains git merge markers because the union rule was missing when the branches merged** (recoverable)
  - Detection: readRecords meets lines beginning with <<<<<<<, ======= or >>>>>>>, which are not complete frames
  - Response: they are skipped as fragments and logged as merge debris; both sides' complete frames stay in the file, so every entry is still read once and none is lost
  - User impact: the history reads correctly; the debris stays in the file until someone removes it, and the warning names the file
- **Two frames carry the same artifact id and entry id with different content (an id collision or a hand edit)** (recoverable)
  - Detection: readRecords compares a repeated (artifactId, entry id) with the first frame it kept
  - Response: identical content collapses silently; different content raises HistoryReadError naming both lines, because choosing one would hide an entry
  - User impact: as for a bad frame
- **A staged write finds its head has moved on (writeArtifact or a merge changed the head after the stage)** (recoverable)
  - Detection: completePending hashes the head and compares it with priorHeadHash and with the staged bytes; it matches neither
  - Response: LifecycleConflictError for that artifact, the journal file is kept, the three hashes are logged, and the entry is not appended a second time; nothing overwrites the head
  - User impact: the staged write does not complete and the artifact's writes and its approval are refused until a person compares the head with the staged bytes in .insrc/journal and resolves it or removes the journal file
- **The journal file is present but is not a staged operation** (recoverable)
  - Detection: WriteJournal.pending parses the file and checks operationId, priorRevision, bytes, entry and, when present, priorHeadHash
  - Response: an error naming the file; writes to that artifact are refused so nothing builds on an unknown state
  - User impact: that artifact cannot be written until the file is removed
- **The process dies after the journal stage and before the log entry is appended** (recoverable)
  - Detection: the next write, update or inspect finds a pending operation whose entry is not in the log
  - Response: completePending appends the staged entry, replaces the head when it still hashes to priorHeadHash, then clears
  - User impact: none
- **The process dies after the log entry is appended and before the head is replaced (the log is ahead of the head)** (recoverable)
  - Detection: the next write, update or inspect finds the pending operation with its entry already in the log and the head equal to priorHeadHash
  - Response: completePending replaces the head with the staged bytes and clears; the entry is not appended again, and LifecycleService.inspect finishes this before it reads, so approval never sees a spurious log-ahead-of-head
  - User impact: none
- **The process dies after the head is replaced and before the journal is cleared** (recoverable)
  - Detection: the pending operation's bytes equal the head
  - Response: completePending only clears
  - User impact: none
- **A head holds merge conflict markers or is otherwise not a head after a merge** (recoverable)
  - Detection: decodeArtifactHead raises ArtifactShapeError on the read
  - Response: the read fails with that error; the line files are untouched and nothing is merged automatically
  - User impact: a person resolves the head in git (ac13); reads of the artifact resume afterwards
- **After a merge the union of both clones' log lines is ahead of, or disagrees with, the head that git kept** (recoverable)
  - Detection: checkIntegrity in the LifecycleService on approve, review and complete reports log-ahead-of-head, head-ahead-of-log or hash-mismatch
  - Response: the operation is refused with LifecycleConflictError carrying the reason; nothing is written or logged
  - User impact: a person decides which side the head should follow; the conflict-resolved write adopts a head whose hash differs from its content
- **A round's content cannot be stored when a BUILD, TESTS or CR record is replaced (the store refuses or the log append fails)** (recoverable)
  - Detection: LifecycleService.updateContent throws inside persistBuildRecord, persistTestRecordTask or runCodeReview
  - Response: the persist fails with that error and writes nothing further: neither the record's meta nor its markdown, and the build verdict is returned with the error named instead of a quiet success; the staged write stays in the journal, and the next write, update or inspect of the artifact finishes it
  - User impact: the round is not recorded until the cause is fixed and the step is repeated; the earlier round and the log stay consistent, so approval and completion are not blocked by a half-recorded round
- **The TESTS record's content is stored and then its markdown cannot be written** (recoverable)
  - Detection: persistTestRecordTask catches the writeAtomic failure after updateContent resolved
  - Response: the content and its log entry stay committed and nothing is rolled back; the error is returned to the step, and the next persist of the record renders the markdown again
  - User impact: the markdown lags the record until the next persist; the log and the head agree
- **The record to be replaced has no head yet (the first BUILD, TESTS or CR record of a Story)** (recoverable)
  - Detection: updateContent raises ArtifactNotFoundError
  - Response: the persister creates the record with its raw writer and logs nothing, because there is no earlier round to keep; the next replacement goes through the store
  - User impact: none
- **The daemon is asked to approve or review in a repository whose registry entry cannot be created** (recoverable)
  - Detection: the registry builds the store and service on first use and the build throws (the artifacts folder cannot be read, the journal folder cannot be created)
  - Response: the request is refused with that error; the daemon does not fall back to the head-only path
  - User impact: the approval or review is not recorded half-way
- **The .gitattributes rules or the ignore entry cannot be written (read-only checkout, permission)** (recoverable)
  - Detection: the ensure step catches the write error when the store is created
  - Response: logged as a warning naming the missing lines and reported in the daemon's status; the store still works, but a merge of line files can leave markers until the rules are added
  - User impact: merge debris is skipped by the reader, so no entry is lost; the fix is to add the lines
- **An entry is too large for one atomic append** (recoverable)
  - Detection: appendRecord measures the serialised line against a cap of 256 KiB before it writes
  - Response: HistoryEntryError; nothing is appended
  - User impact: the caller shortens the outcome data
- **A step handler or writer that became async is still called without await** (recoverable)
  - Detection: the typecheck fails on the Promise used as a value, and the write inventory test lists the changed writer files
  - Response: the call sites named in the contract are changed together; no unawaited call remains
  - User impact: none after the build

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two clones each append different log entries to the same artifact, then merge | git merges the log file with no conflict; a reader sees every entry once, ordered by timestamp then entry id |
| Two clones append the same entry (the same id and content), for example the same recovery run on a shared branch | the union keeps both frames; the reader counts the entry once |
| A torn append, a later append, a re-read and a journal retry of the interrupted write in one sequence | the fragment is skipped, the later record is read, and the retry appends its entry once, so the log holds the entry exactly once and reads without error |
| A Task's log entry is appended while its Tasks file has entries for other Tasks | the frame goes to the Tasks file's log, and reading one Task returns only the frames whose artifactId is that Task |
| A TASK id whose Tasks head does not exist yet | filesOf still returns the Tasks file's paths and an append creates them |
| A feedback entry and a log entry with the same timestamp | openFeedback orders them by the shared (timestamp, id) rule, so the result does not depend on which file was read first |
| Feedback text containing newlines, tabs, quotes or a line separator character | JSON.stringify escapes them, so the json is one line, and the frame's byte length counts the escaped text, so it reads back identical |
| Text with multi-byte characters | the frame length is the byte length, not the character count, and the entry reads back identical |
| An artifact with no line files | log and feedback are empty lists, logTail is undefined, and sc4 treats a log with no revision-bearing entry as no history |
| A repository that already has a .gitattributes or a .gitignore with other rules | only the missing lines are appended, on their own lines, and nothing else changes |
| A round that changes nothing (the same content again) | updateContent stores no revision and appends no entry, because an identical rewrite does not move the revision (k3) |

**Invariants to preserve**

- A write stages its operation, appends its log entry, replaces the head atomically and then clears the journal, in that order, under the per-artifact queue; the order does not change when the journal becomes durable [[c2]]
- Appending the same entry twice is harmless: a reader collapses a repeated (artifactId, entry id) [[c4]]
- A change log or feedback line is never rewritten or removed once appended [[c4]]
- appendSidecarLine stays the only function that writes a line file, so the write inventory keeps one raw append for history [[c4]]
- A head with no log or feedback file behaves as before: it reads, writes and decodes with empty history [[c1]]
- A recorded operation id is reused by a retry and never minted twice for one staged write [[c2]]
- A record written without a RoundWriter (tests, tools with no daemon) is written exactly as before, including the TESTS json-then-markdown rollback [[c3]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), with node:assert/strict; tests live in __tests__ beside the code and real git is run through child_process in a temporary directory`

**Test levels**

- **unit** — The single-file behaviour of the durable sidecar and journal: where files are, what a reader returns for any file content, and each recovery decision.
  - Subjects: `SidecarStore.filesOf maps an id to its head, log and feedback files and a TASK id to its Story's Tasks files`, `SidecarIo.readRecords filters by artifact id, collapses repeated entries, orders by timestamp then id, skips an abandoned fragment and merge debris, and refuses a complete frame with bad json and a conflicting duplicate`, `SidecarIo.appendRecord writes one framed line, starts a new line after a torn one, counts bytes for multi-byte text, and refuses an oversize entry`, `a torn append, a later append, a re-read and a journal retry as one sequence`, `SidecarStore.mergeAttributes and the ensure step add only the missing lines to .gitattributes and .gitignore and are idempotent`, `WriteJournal stage, pending and clear over files, including an invalid journal file`, `completePending decisions for each crash point and for a head that moved on, using priorHeadHash`, `LifecycleService.inspect finishes a staged write before it reads`, `History.openFeedback ordering when a feedback entry and a log entry share a timestamp`
  - Fixtures: `a temporary repository directory`, `store-kit.ts extended with a durable mode that uses the file sidecar and journal and keeps its fault switches`
- **integration** — The acceptance criteria against real git and the real write paths: merges, conflicts, recorded rounds, failed rounds and the daemon wiring of every approval and review path.
  - Subjects: `two real clones of a temporary git repository append different log and feedback entries to one artifact and merge with no conflict`, `two clones change the same head and git reports a conflict`, `persistBuildRecord, persistTestRecordTask and runCodeReview with a RoundWriter each store the content through the LifecycleService, log the round and refresh the meta and markdown, and the earlier round stays readable`, `a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry and the next persist renders the markdown`, `a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so approval is not blocked`, `the daemon workflow.approve handler, the review-decision step, workflowReviewStart and the review step's verdicts phase each use the repository's durable LifecycleService and refuse a head that is ahead of its log`, `controller verdict persistence: handleVerdicts with an auto-fix stores the content through the service, stamps the review and records it on the lifecycle`, `a restart between each step of a write leaves the repository in the state the recovery decisions expect and the next write completes it once`, `the write inventory test classifies the new files and the changed writers and still finds one raw append for history`
  - Fixtures: `git available on the path, with a skip when it is not`, `a bare origin and two clones created per test`, `a daemon test harness that registers a temporary repository and an enveloped fake provider (as in gate-review-fix.test.ts)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac11` | `src/workflow/artifact-core/__tests__/sidecar-merge.test.ts: two clones that append different log and feedback entries to one artifact merge with no conflict and a reader sees every entry once, in timestamp then id order`, `src/workflow/artifact-core/__tests__/sidecar-read.test.ts: readRecords filters by artifact id, collapses repeated entries, orders by timestamp then id, skips an abandoned fragment and merge debris, and refuses a complete frame with bad json and a conflicting duplicate`, `src/workflow/artifact-core/__tests__/sidecar-append.test.ts: a torn append, a later append, a re-read and a journal retry leave the entry once and the file readable`, `src/workflow/artifact-core/__tests__/sidecar-files.test.ts: filesOf names the head and line files of an artifact and gives every Task of a Story its Tasks file, and the merge rules and the ignore entry are added once`, `src/workflow/artifact-core/__tests__/history-order.test.ts: openFeedback orders a feedback entry and a log entry with the same timestamp by the shared rule` |
| `ac12` | `src/workflow/artifact-core/__tests__/round-recording.test.ts: persistBuildRecord, persistTestRecordTask and runCodeReview with a RoundWriter store the content through the service and log the round, and the earlier round stays readable in the log`, `src/workflow/artifact-core/__tests__/round-recording.test.ts: a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry, and the next persist renders the markdown`, `src/workflow/artifact-core/__tests__/round-recording.test.ts: a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so the next approval is not refused`, `src/daemon/steps/review-step/__tests__/verdicts-lifecycle.test.ts: handleVerdicts with a service stores an applied fix through the service, stamps the review and records it on the lifecycle, and refuses a head that is ahead of its log` |
| `ac13` | `src/workflow/artifact-core/__tests__/sidecar-merge.test.ts: a head changed in two clones conflicts in git and the line files of the same merge still union`, `src/workflow/artifact-core/__tests__/journal-recovery-durable.test.ts: a staged write is finished at each crash point and refused with LifecycleConflictError when the head moved on, and the head is never overwritten` |
| `ac11` | `src/workflow/artifact-core/__tests__/journal-durable.test.ts: the journal stages, reports and clears one file per artifact and refuses an invalid file`, `src/daemon/__tests__/lifecycle-wiring.test.ts: the daemon approve handler, the review-decision step, workflowReviewStart and the verdicts phase use the repository's durable LifecycleService, and a repository whose registry entry cannot be created is refused`, `src/workflow/__tests__/artifact-write-inventory.test.ts: the sidecar files, the journal folder and the changed round writers are classified and appendSidecarLine remains the one raw append for history` |

## 7. Migration

**State before:** SidecarIo and WriteJournal are ports with only in-memory implementations and one raw, unframed line append (src/workflow/artifact-core/sidecar.ts, src/workflow/artifact-core/journal.ts). History reads and appends through SidecarIo, and ArtifactStore writes stage in the journal, append the log entry and replace the head, but recovery replaces any head that differs from the staged bytes (src/workflow/artifact-core/store.ts). The repository has no .gitattributes and the daemon holds no ArtifactStore, History or LifecycleService, so approve and review run the head-only guard (src/workflow/gates.ts, src/daemon/index.ts, src/daemon/workflow-review-rpc.ts); the controller's verdicts phase writes with writeArtifact (src/daemon/steps/review-step/phases/verdicts.ts). The BUILD, TESTS and CR records are replaced in place by synchronous writers (persistBuildRecord, persistTestRecordTask, runCodeReview's write dependency) with no log entry for the earlier round, and the TESTS writer rolls its json back when the markdown fails.

**State after:** The log and feedback of an artifact live in length-framed line files beside its head, union-merged by a committed .gitattributes and read filtered, de-duplicated and ordered; the journal is a durable untracked file that remembers the head a write started from, and recovery refuses to overwrite a head that moved on. The daemon holds one durable store, history and LifecycleService per repository, and the approve handler, the review-decision step, the daemon review and the verdicts phase all use them, so the full log-tail check runs on every path. The BUILD, TESTS and CR records store their content through the service before their meta and markdown are refreshed, so each round is logged by the staged write that replaces it, and a failed round log fails the persist instead of leaving the head ahead of its log.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the framed line format to appendSidecarLine (with the torn-line guard and the size cap) and the file-backed SidecarIo and SidecarStore (filesOf, the filtered de-duplicated ordered read that skips fragments and merge debris, mergeAttributes) beside the in-memory one; nothing uses them yet. — ↩ rollbackable
2. Add priorHeadHash to StagedOperation, stage it in ArtifactStore.write, make completePending finish an operation only when the head is the prior head or already the staged bytes, and add the durable file journal. Run the existing recovery tests against both journals. — ↩ rollbackable _(needs: `step 1`)_
3. Give History.openFeedback the shared (timestamp, id) order, and make LifecycleService.inspect finish a staged write under the artifact's queue before it reads. — ↩ rollbackable _(needs: `step 1`, `step 2`)_
4. Add the ensure step that adds the two union merge rules to .gitattributes and the journal folder to the ignore file, adding only missing lines. Commit the two files for this repository. — ↩ rollbackable _(needs: `step 1`)_
5. Add the daemon's per-repository registry (store over the file sidecar and journal, history, LifecycleService with the per-call evidence factory) and pass it to the workflow.approve handler, the review-decision step and workflowReviewStart; the head-only path stays for callers with no daemon. — ↩ rollbackable _(needs: `step 2`, `step 4`)_
6. Make handleVerdicts async and give it the service; the review-step handler awaits it with the registry's service for the run's repository. The auto-fix goes through updateContent, the review stamp stays a meta-only write, and the review is applied on the lifecycle. — ↩ rollbackable _(needs: `step 5`)_
7. Make persistBuildRecord, persistStandaloneBuildRecord and persistTestRecordTask async with an optional RoundWriter, add through to the code-review runner dependencies, and change every caller (the validate and implement phases, ensureBuildRecordOnCompletion, the code-review step handler, the tests) to await them with the registry's RoundWriter. A failed content store fails the persist; a TESTS markdown failure after the content was stored is not rolled back. — ↩ rollbackable _(needs: `step 5`)_
8. Add the real-git two-clone merge tests, the framing and recovery matrix tests, the round-recording and failure tests, the wiring tests and the inventory entries; record the s9 inputs (existing artifacts have no line files, so the conversion back-fills history and writes the first entries). — ↩ rollbackable _(needs: `step 6`, `step 7`)_

**Backward compat:** No compatibility code. An artifact with no line files reads as an empty history, so every existing head keeps working. The in-memory SidecarIo and journal stay for tests only. The head-only gate path and the round writers' plain writeArtifact path (no RoundWriter) stay for callers that have no daemon (tests and tools), not as a fallback inside the daemon, which refuses a request when its registry entry cannot be created. Making persistBuildRecord, persistStandaloneBuildRecord, persistTestRecordTask and handleVerdicts async changes their signatures; all callers are in this repository and are changed together. Existing BUILD, TESTS and CR records gain log entries only from their next replacement; earlier rounds are not reconstructed (s9 back-fills what it can).

## 8. Alternatives considered

### 8.1 a1: Per-head framed line files, rounds through the store, one daemon registry — **CHOSEN**

Per-head log and feedback files with length-framed lines and union merge, a durable untracked journal, round records stored through LifecycleService.updateContent, and one per-repository registry the approval and review paths all take their service from.

FileSidecarStore implements SidecarIo and the sc5 SidecarStore. filesOf(id) returns { head: .insrc/artifacts/<id>.json, log: .insrc/artifacts/<id>.log.jsonl, feedback: .insrc/artifacts/<id>.feedback.jsonl }, with a TASK id mapped to the files of its Story's TASKS head. Each line is framed as <byte length> TAB <json> NEWLINE and written with one append-mode write; readRecords skips a frame whose length does not match (an abandoned fragment, logged), raises HistoryReadError for a complete frame whose json is invalid, keeps the lines of the requested artifact, collapses repeated (artifactId, entry id) and orders by timestamp then entry id. mergeAttributes() yields the two merge=union rules, ensured in .gitattributes with the journal folder in the ignore file. The journal is a file per artifact under .insrc/journal/<id>.json and StagedOperation gains priorHeadHash; completePending replaces a head only when it still has that hash or already equals the staged bytes. The content of a BUILD, TESTS or CR record is stored through LifecycleService.updateContent, awaited by the step handlers (validate, implement, the test-record caller, the code-review step handler, completion-record) before the synchronous raw writers refresh the record's meta and markdown; a failed store call fails that persist, and the staged write stays in the journal for the next write or update to finish. The daemon keeps one registry of {ArtifactStore, History, LifecycleService} per repository and gives it to the workflow.approve handler, the review-decision step, workflowReviewStart and the review step's verdicts phase.

### 8.2 a2: Per-head files with after-the-fact round events

As a1 for layout and journal, but the round writers stay synchronous and a separate round event is appended to the log after they succeed.

The layout, framing, journal and registry are as in a1. The BUILD, TESTS and CR writers keep replacing their record with writeArtifact, unchanged and synchronous; afterwards the step handler appends one log entry carrying the round's outcome and the record's new revision. A failed append is logged and surfaced in the step result, and the registry offers a repair call that appends the missing entry on the next approval.

**Rejected because:** Keeps the writers synchronous but opens a window in which the head is ahead of its log and adds a second write path for the log.

### 8.3 a3: One repository-wide pair of framed line files

Two framed line files for the whole repository, union-merged, with the rounds and the registry as in a1.

FileSidecarStore appends every record to .insrc/history/log.jsonl or .insrc/history/feedback.jsonl; readRecords scans the file for the artifact id. One attributes rule covers both files. Framing, journal, round recording and the registry are as in a1.

**Rejected because:** Scan cost grows with the repository, unrelated artifacts share a merge tail, and one damaged frame blocks every artifact.

## 9. References

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/history.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/artifact-core/store.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/runners/build/test-record.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/artifact-core/sidecar.ts`
- **[[c5]]** `analyze-bundle` `src/workflow/gates.ts`
- **[[c6]]** `analyze-bundle` `src/daemon/index.ts`
- **[[c7]]** `doc` `docs/plans/core-data-model.md`
- **[[c8]]** `prior-artifact` `docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md`

## 10. Open questions

- ep3: the invariants name the capability ids c1 to c4 whose citations point at the s1 bundles, but they do not quote the bundle text
- After a merge the union of both clones' log lines can be ahead of the head git kept (log-ahead-of-head), and ArtifactStore.write refuses only a hash-mismatch: should a write on a log-ahead-of-head artifact also need the conflict-resolved option, or should the next ordinary write move the head up to the log?
- The daemon's approval actor today is the gate itself (insrc:approval); the live tracker identity that k5 requires is s5's, so should s4 pass a person actor from the request when the client supplies one and fall back to the gate actor otherwise?
- Making persistBuildRecord, persistStandaloneBuildRecord, persistTestRecordTask and handleVerdicts async touches many existing tests; should the tests be moved to the async forms in the same tasks as the writers, or kept on a thin synchronous test-only wrapper?

## Resolved questions

- `q162d5894` — After a merge the union of both clones' log lines can be ahead of the head git kept (log-ahead-of-head), and ArtifactStore.write refuses only a hash-mismatch: should a write on a log-ahead-of-head artifact also need the conflict-resolved option, or should the next ordinary write move the head up to the log?
  - **resolved**: Require explicit conflict resolution — Recommended: a matching head hash alone does not establish that the merged log has been reconciled. _(2026-10-21T09:16:44.137Z)_
- `q0e79065e` — The daemon's approval actor today is the gate itself (insrc:approval); the live tracker identity that k5 requires is s5's, so should s4 pass a person actor from the request when the client supplies one and fall back to the gate actor otherwise?
  - **resolved**: Optional request actor with fallback — Recommended: person attribution in s4 while preserving existing approvals; live tracker identity stays with s5. _(2026-10-21T09:17:31.996Z)_
- `qcfedb02f` — Making persistBuildRecord, persistStandaloneBuildRecord, persistTestRecordTask and handleVerdicts async touches many existing tests; should the tests be moved to the async forms in the same tasks as the writers, or kept on a thin synchronous test-only wrapper?
  - **resolved**: Migrate tests with writers — Recommended: tests exercise the real async interfaces. _(2026-10-21T09:18:05.123Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/history.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/artifact-core/store.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/runners/build/test-record.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/artifact-core/sidecar.ts`
- **[[c5]]** `analyze-bundle` `src/workflow/gates.ts`
- **[[c6]]** `analyze-bundle` `src/daemon/index.ts`
- **[[c7]]** `doc` `docs/plans/core-data-model.md`
- **[[c8]]** `prior-artifact` `docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md`
