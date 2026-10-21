<!-- insrc:artifact LLD-2f27754d4ad00b8e-s3 -->

# LLD: E202610212f27754d:S003

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `f964e89a6119...`

s3 adds the lifecycle rules as a pure module (src/workflow/artifact-core/lifecycle.ts: the closed transition table, the content hash, the revision and draft fall-back, the integrity check and the roll-up) and a LifecycleService that applies one operation at a time. The one revision rule in prepareArtifactWrite now also keeps meta.lifecycle in step for every writer, so the BUILD hook and the review auto-fix cannot leave a stale hash; ArtifactStore gains update (read, change and write under one lock), WriteOptions and a strict child listing; the five kinds that had no codec get pass-through codecs. The approval path takes an optional LifecycleService: with it approve, review and complete check the log tail, are applied through the service and trigger Story and Epic completion once; without it (production until s4 supplies a durable History) the gates run a synchronous head-only guard placed before the BUILD record hook and otherwise behave as today.

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

**Rollout phase:** Phase B — lifecycle and sidecar storage
**Owns:** `sc4` (Lifecycle)
**Consumes:** `sc1` (ArtifactIdScheme), `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `LifecycleRules.transition`

```typescript
transition(a: Artifact<unknown>, op: Operation, by: Actor, detail?: TransitionDetail): Promise<Lifecycle>
```

**Parameters:**
- `a: Artifact<unknown>` — The artifact as read from the store; only a.id, a.lifecycle and a.references are used.
- `op: Operation` — One of the thirteen lifecycle operations (request-review, review, approve, reject, open-signoff, signoff-changes, signed-off, complete, reopen, withdraw, supersede, mark-stale, ack-stale); create, update, delete and reparent are content operations and are refused here.
- `by: Actor` — Who performs it; recorded in approval.by, signoff actors and the log entry.
- `detail: TransitionDetail` _(optional)_ — What the operation carries: the Review for review, the override reason for approve, the request Reference for open-signoff, the upstream Staleness for mark-stale, the superseding Reference for supersede, a reason for reject, withdraw and ack-stale, and cascade:true when a unit's completion freezes a dependent record.

**Returns:** `Promise<Lifecycle>` — The next lifecycle: pure, nothing is written.

**Errors:**
- `IllegalTransitionError` when the operation is not in the closed table for the current status, or a required detail is missing or malformed
- `ReviewRequiredError` when op is approve on a DEF, HLD or LLD with no review bound to the current revision or with a block verdict, and detail.override is absent

**Preconditions:**
- a.lifecycle is the stored lifecycle of the current head

**Postconditions:**
- request-review: draft to pending-review; review: draft or pending-review to draft, storing review {revision: current number, reviewer, party, verdict, counts, at, report?}; approve: draft to approved, storing approval {revision: current number, by, at, override?}; open-signoff: approved to in-signoff, appending a Signoff {revision, request, state: open, actors: [], at}; signoff-changes: in-signoff to changes-requested; signed-off: in-signoff to signed-off; reject: draft, approved or in-signoff to rejected; complete: approved or signed-off (any non-terminal when detail.cascade) to completed; reopen: completed to draft; withdraw and supersede: any non-terminal to withdrawn or superseded; mark-stale and ack-stale: any non-terminal, status unchanged, setting or clearing stale {upstream, upstreamRevision, since}
- approval, review and signoffs of an older revision are never removed or edited: each keeps the revision number it was made at
- the integrity check is not made here: the service checks before it calls transition

### 2.2 `LifecycleRules.checkIntegrity`

```typescript
checkIntegrity(a: Artifact<unknown>, logTail: ChangeLogEntry | undefined): Integrity
```

**Parameters:**
- `a: Artifact<unknown>` — The artifact read from its head.
- `logTail: ChangeLogEntry | undefined` — The last change log entry that carries a revision. Every entry the store writes carries one, so this is the last entry the store wrote; undefined when the log has no revision-bearing entry.

**Returns:** `Integrity` — { ok: true } or { ok: false, reason }: hash-mismatch when the head's non-empty stored contentHash differs from contentHash of its own description and payload, or when its number equals the log's and both hashes are non-empty and differ; head-ahead-of-log when the log has a revision-bearing entry whose number is below the head's; log-ahead-of-head when it is above.

**Preconditions:**
- a was decoded by decodeArtifactHead

**Postconditions:**
- a head with an empty stored hash has nothing to compare and is { ok: true }
- a log with no revision-bearing entry is no history: it is { ok: true }, never head-ahead-of-log (s9 back-fills history)
- an older log entry with an empty hash and the same number does not conflict with a newer head hash (the hash baseline entry follows it)

### 2.3 `LifecycleRules.rollUp`

```typescript
rollUp(id: string): Promise<Status | undefined>
```

**Parameters:**
- `id: string` — A TASK, STORY or EPIC artifact id.

**Returns:** `Promise<Status | undefined>` — 'completed' when the unit's completion condition is true now, otherwise undefined. Reads only; records nothing.

**Errors:**
- `InvalidArtifactKeyError` when id is not an artifact id
- `UnreadableChildError` when childrenOfStrict reports an unreadable child head; the error names them and nothing is rolled up

**Preconditions:**
- the ports are supplied by the LifecycleService

**Postconditions:**
- a Task: completed when CompletionEvidence.taskBuildPassed(id) is true
- a Story: completed when at least one counted Task child exists, every counted Task is completed, and CompletionEvidence.storyCodeReview gives clean or overridden; withdrawn and superseded Task children are not counted, rejected and unfinished ones are; TASKS and DIAG children are not Tasks and are ignored
- an Epic: completed when at least one counted Story child exists and every counted Story is completed
- any other kind returns undefined

### 2.4 `contentHash`

```typescript
contentHash(description: string, payload: { body: unknown; citations: unknown }): string
```

**Parameters:**
- `description: string` — The artifact description.
- `payload: { body: unknown; citations: unknown }` — The head payload.

**Returns:** `string` — sha-256 hex of the canonical JSON of {description, body, citations}.

**Postconditions:**
- canonical JSON is the JSON.parse(JSON.stringify(x)) form with object keys sorted and undefined removed, so toJSON values hash by what they persist as
- references, parent, attachments, binding, lifecycle and the change log are not hashed

### 2.5 `reconcileLifecycle`

```typescript
reconcileLifecycle(prior: ContentView | undefined, next: ContentView, revisionNumber: number, by: Actor, at: string): { lifecycle: Lifecycle; contentChanged: boolean }
```

**Parameters:**
- `prior: ContentView | undefined` — The stored head's description, payload and lifecycle, or undefined on a create.
- `next: ContentView` — What is being written; next.lifecycle carries the approval, review, signoffs, stale and status the caller set.
- `revisionNumber: number` — The revision prepareArtifactWrite minted (the existing meta.revision rule).
- `by: Actor` — Recorded as revision.by when content changed.
- `at: string` — ISO time recorded as revision.at when content changed.

**Returns:** `{ lifecycle: Lifecycle; contentChanged: boolean }` — The lifecycle to store. contentChanged compares contentHash of prior's own description and payload with next's, never the stored hash.

**Errors:**
- `TerminalArtifactError` when content changed and prior.lifecycle.status is completed, withdrawn or superseded
- `IllegalTransitionError` when a create with a status other than draft, or a status change without a content change that is not a step in the closed table

**Postconditions:**
- revision.contentHash is always contentHash of next's description and payload and revision.number is revisionNumber; revision.at and by are the prior's when content did not change
- on a content change a non-terminal status other than draft becomes draft and approval, review, signoffs and stale are carried over unchanged
- an identical rewrite of a head with an empty stored hash returns contentChanged false and the filled hash, same number

### 2.6 `prepareArtifactWrite`

```typescript
prepareArtifactWrite(path: string, next: unknown, kind: WriteKind, opts?: { replaceUnreadable?: boolean; by?: Actor; at?: string }): PreparedArtifactWrite
```

**Parameters:**
- `path: string` — The head file.
- `next: unknown` — The head object being written, an unchanged input.
- `kind: WriteKind` — content or meta-only, unchanged.
- `opts: { replaceUnreadable?: boolean; by?: Actor; at?: string }` _(optional)_ — by and at are recorded on the revision when a lifecycle-carrying head's content changed; they default to the insrc:system actor and the clock.

**Returns:** `PreparedArtifactWrite` — Unchanged: bytes, revision, contentChanged.

**Errors:**
- `TerminalArtifactError` when as for reconcileLifecycle

**Postconditions:**
- a head with no meta.lifecycle is prepared exactly as today
- a head that carries meta.lifecycle gets lifecycle.revision {number, contentHash, at, by} and the fall-back to draft from reconcileLifecycle, so every writeArtifact caller (the BUILD record hook, the review auto-fix, the gates) keeps the hash in step; this is the one implementation of the revision rule and ArtifactStore.write relies on it
- a meta-only write never changes the hash or number

### 2.7 `checkHeadIntegrity`

```typescript
checkHeadIntegrity(a: ContentView): Integrity
```

**Parameters:**
- `a: ContentView` — A decoded head's description, payload and lifecycle.

**Returns:** `Integrity` — { ok: false, reason: 'hash-mismatch' } when the stored non-empty contentHash differs from contentHash of the head's own description and payload, else { ok: true }. Synchronous, reads nothing.

**Postconditions:**
- this is the part of checkIntegrity that needs no History

### 2.8 `LifecycleService.apply`

```typescript
apply(id: string, op: Operation, by: Actor, detail?: TransitionDetail): Promise<{ lifecycle: Lifecycle; entry: ChangeLogEntry; recorded: boolean }>
```

**Parameters:**
- `id: string` — The artifact id.
- `op: Operation` — A lifecycle operation.
- `by: Actor` — The actor.
- `detail: TransitionDetail` _(optional)_ — As for transition.

**Returns:** `Promise<{ lifecycle: Lifecycle; entry: ChangeLogEntry; recorded: boolean }>` — The stored lifecycle and its log entry; recorded is false when op was complete and a complete entry already stands.

**Errors:**
- `LifecycleConflictError` when approve, review or complete on an artifact whose checkIntegrity is not ok; the error carries the reason
- `IllegalTransitionError` when as for transition, or complete on a Task, Story or Epic whose rollUp is not true
- `UnreadableChildError` when as for rollUp
- `ArtifactNotFoundError` when no head

**Preconditions:**
- the service was built with an ArtifactStore, its History, a clock and the CompletionEvidence port

**Postconditions:**
- the whole of read with history, integrity check, completed-once check, transition and write runs inside ArtifactStore.update, so competing operations on one artifact cannot interleave
- the write carries WriteOptions {operation: op, outcome, references}, so the log entry has the real operation and status {from, to}
- complete on a Story or Epic first completes its members with cascade:true (a Story: its LLD, PLAN, BUILD, CR, TESTS and EXT heads, its STORY head, and the TASKS and DIAG heads found with childrenOf, each DIAG keeping its parsed sequence; an Epic: EPIC, DEF and HLD), skipping a member already terminal or without a head, and records the unit's own complete entry last, so a failure part-way leaves the unit not completed and a retry finishes it
- complete is recorded once: a complete entry with no later reopen makes the call return recorded:false; the outcome carries the code-review override reason when the evidence was overridden
- reopen of a Story or Epic reopens the members its completion froze and is refused while its parent is completed
- writes nothing and appends nothing when it throws before the write

### 2.9 `LifecycleService.completeIfRolledUp`

```typescript
completeIfRolledUp(id: string, by: Actor): Promise<{ completed: string[] }>
```

**Parameters:**
- `id: string` — The artifact whose last step was just recorded (a Task, or a Story whose BUILD was approved).
- `by: Actor` — The actor recorded on the completion entries.

**Returns:** `Promise<{ completed: string[] }>` — The ids completed by this call, from the unit upward.

**Errors:**
- `UnreadableChildError` when as for rollUp

**Postconditions:**
- starting at id it asks rollUp and, when true and the unit is not completed, applies complete; it then moves to the parent (ArtifactIds.parentOf) and repeats until a unit's rollUp is not true
- a unit whose rollUp is not true is left alone and is not an error
- this is the trigger for ac9: the last recorded step completes the Story and then the Epic, once each

### 2.10 `ArtifactStore.update`

```typescript
update(id: string, by: Actor, mutate: (current: Artifact<HeadPayload> & { changeLog: ChangeLogEntry[] }) => { next: Artifact<HeadPayload>; options?: WriteOptions } | undefined): Promise<boolean>
```

**Parameters:**
- `id: string` — The artifact id.
- `by: Actor` — The actor for the log entry.
- `mutate: (current) => { next; options? } | undefined` — Receives the artifact read with its change log inside the per-artifact queue and returns the artifact to store, or undefined for nothing to do.

**Returns:** `Promise<boolean>` — true when a write was made.

**Errors:**
- `ArtifactNotFoundError` when no head

**Postconditions:**
- the per-artifact queue is held across the read, mutate and write, so no other write to this artifact interleaves; the write itself is the same code as write, without re-entering the queue
- if mutate throws, nothing is written

### 2.11 `ArtifactStore.write`

```typescript
write(a: Artifact<HeadPayload>, by: Actor, options?: WriteOptions): Promise<void>
```

**Parameters:**
- `a: Artifact<HeadPayload>` — The whole envelope to store.
- `by: Actor` — As before.
- `options: WriteOptions` _(optional)_ — operation (the log operation; default create or update as today), outcome, references and addresses to put on the change log entry.

**Returns:** `Promise<void>` — As before.

**Errors:**
- `IllegalTransitionError` when a status change that is not a step in the closed table
- `TerminalArtifactError` when content change on a completed, withdrawn or superseded artifact
- `LifecycleConflictError` when an ordinary write on a head whose checkHeadIntegrity is hash-mismatch; a write with options.outcome.result 'conflict-resolved' is the explicit resolution
- `ArtifactShapeError` when options.operation is a content operation other than create or update

**Preconditions:**
- as before

**Postconditions:**
- the lifecycle stored is the one prepareArtifactWrite computed with reconcileLifecycle; the s2 write order, queue, journal and recovery are unchanged
- every log entry still carries revision {number, contentHash} with the stored values, plus status {from, to} when the status differs from the prior head's, so the s2 assertion on log revisions stays valid
- a conflict-resolved write adopts the content now in the head, recomputes the hash and logs an update

### 2.12 `ArtifactStore.childrenOfStrict`

```typescript
childrenOfStrict(id: string): Promise<{ children: string[]; unreadable: string[] }>
```

**Parameters:**
- `id: string` — The parent artifact id.

**Returns:** `Promise<{ children: string[]; unreadable: string[] }>` — The readable children and the ids of heads that could not be read or decoded.

**Errors:**
- `InvalidArtifactKeyError` when id is not an artifact id

**Postconditions:**
- childrenOf keeps its skip-and-log behaviour; childrenOfStrict returns what it skipped so roll-up can refuse
- an unreadable head whose parent link cannot be read is reported as unreadable, not dropped

### 2.13 `codecFor`

```typescript
codecFor(kind: ArtifactIdKind): KindCodec
```

**Parameters:**
- `kind: ArtifactIdKind` — An artifact kind.

**Returns:** `KindCodec` — The codec; EPIC, STORY, TASKS, TASK and DIAG now have pass-through codecs.

**Errors:**
- `UnknownArtifactKindError` when no codec (none of the sixteen id kinds remains without one)

**Postconditions:**
- a pass-through codec decodes body and citations unchanged and builds the identity meta from the creation context like the others; s7 and s9 give those payloads their meaning
- registeredKinds lists all sixteen kinds

### 2.14 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { readonly enforce?: boolean }): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Unchanged plus an optional lifecycle?: LifecycleService field.
- `opts: { readonly enforce?: boolean }` _(optional)_ — Unchanged.

**Returns:** `Promise<WorkflowApproveResult>` — Unchanged; a conflicted target comes back in skipped[] with the integrity reason.

**Postconditions:**
- in both the artifactPath and the epicHash branch the integrity check runs BEFORE ensureBuildRecordOnCompletion, so a conflicted BUILD record is never rewritten
- without req.lifecycle the check is checkHeadIntegrity and everything else is as today
- with req.lifecycle the check is the full checkIntegrity against the log tail, the approval is applied through LifecycleService.apply, and after a BUILD record approval completeIfRolledUp is called for its Story; the legacy meta.approvedAt stamp still follows, for the delivery board

### 2.15 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath: string, opts?: { readonly overrideReview?: string }): ApprovalResult
```

**Parameters:**
- `jsonPath: string` — The artifact head file.
- `opts: { readonly overrideReview?: string }` _(optional)_ — Unchanged.

**Returns:** `ApprovalResult` — Unchanged.

**Errors:**
- `LifecycleConflictError` when checkHeadIntegrity is hash-mismatch, raised before the team gate, the review checks and any write

**Postconditions:**
- stays synchronous; a head with no meta.lifecycle or an empty stored hash is approved exactly as today
- still writes meta.approvedAt with writeArtifact meta-only; a meta-only write never touches the hash

### 2.16 `reviewArtifactFile`

```typescript
reviewArtifactFile(...args: ReviewArtifactFileArgs): Promise<ReviewArtifactResult>
```

**Parameters:**
- `args: ReviewArtifactFileArgs` — Unchanged plus an optional lifecycle?: LifecycleService field.

**Returns:** `Promise<ReviewArtifactResult>` — Unchanged.

**Errors:**
- `LifecycleConflictError` when the head guard (or, with a service, the full check) is not ok, raised before the review pipeline runs or anything is stamped

**Postconditions:**
- its content-changing auto-fix write goes through writeArtifact and therefore prepareArtifactWrite, so a head carrying meta.lifecycle gets its hash, number and fall-back to draft reconciled in that write
- an artifact with no stored hash is reviewed as today

### 2.17 `CompletionEvidence.storyCodeReview`

```typescript
storyCodeReview(epicHash: string, storyId: string): Promise<CodeReviewEvidence>
```

**Parameters:**
- `epicHash: string` — The Epic hash.
- `storyId: string` — The s<n> story id.

**Returns:** `Promise<CodeReviewEvidence>` — { kind: 'clean' | 'overridden' | 'blocked' | 'missing', overrideReason?: string } read from enforceCodeReviewGate: pass and a warn without advisory are clean; a warn with advisory:true (a block verdict with enforcement off) is blocked; overridden keeps its overrideReason; no-review is missing; blocked is blocked.

**Postconditions:**
- only clean and overridden allow a Story to complete; the override reason goes on the complete entry's outcome
- it reads the gate and never changes the gate's behaviour or its fail-open semantics

## 3. Data model changes

### 3.1 `Lifecycle (sc4 structures)` — invariant-change

The structures are exactly the HLD's. What becomes true after s3: for every head that carries meta.lifecycle and was written by any writer, revision.contentHash is the contentHash of its description and payload, revision.number equals meta.revision, a content change returns a non-terminal status to draft while approval.revision, review.revision and signoff.revision keep the number they were made at, and a status changes only by a step in the closed table. A head with no meta.lifecycle is unchanged. Current behaviour it must not break: the one revision rule and an identical rewrite keeping the revision (storage.ts, c2) and a head with no lifecycle decoding as draft (decode.ts, c1).

**Call sites:**
- `src/workflow/artifact-core/types.ts`
- `src/workflow/artifact-core/decode.ts`
- `src/workflow/storage.ts`

### 3.2 `LIFECYCLE_TABLE and assertLegalStatusChange` — new

A frozen map from the thirteen lifecycle operations to {from: Status[], to: Status | 'same'}, plus TERMINAL = completed, withdrawn, superseded. assertLegalStatusChange(from, to, op) answers whether a step is allowed and is used by transition, reconcileLifecycle and ArtifactStore.write.

```
type Step = { from: readonly Status[]; to: Status | 'same' }; const LIFECYCLE_TABLE: Readonly<Record<LifecycleOperation, Step>>
```

**Call sites:**
- `src/workflow/artifact-core/lifecycle.ts`

### 3.3 `ContentView` — new

{ description: string; payload: { body: unknown; citations: unknown }; lifecycle: Lifecycle }, the part of a head the lifecycle rules read. prepareArtifactWrite builds one from a raw head (meta.envelope.description, body, citations, meta.lifecycle) and ArtifactStore builds one from an Artifact, so the rules run on raw heads and on decoded artifacts alike.

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/artifact-core/store.ts`
- `src/workflow/artifact-core/decode.ts`

### 3.4 `TransitionDetail` — new

{ review?: Review (without revision), override?: { reason }, request?: Reference, signoffActors?: Actor[], upstream?: Staleness fields, supersededBy?: Reference, reason?: string, cascade?: boolean }; each operation reads only its own fields.

**Call sites:**
- `src/workflow/artifact-core/lifecycle.ts`

### 3.5 `WriteOptions` — new

{ operation?: Operation; outcome?: ChangeLogEntry['outcome']; references?: Reference[]; addresses?: 'all' | string[] }, an optional trailing parameter of ArtifactStore.write and the options of update; s5 uses addresses, s3 uses operation and outcome.

**Call sites:**
- `src/workflow/artifact-core/store.ts`

### 3.6 `Integrity` — new

The HLD's union { ok: true } | { ok: false; reason: 'hash-mismatch' | 'head-ahead-of-log' | 'log-ahead-of-head' }.

**Call sites:**
- `src/workflow/artifact-core/lifecycle.ts`

### 3.7 `CompletionEvidence and CodeReviewEvidence` — new

CompletionEvidence { taskBuildPassed(taskId): Promise<boolean>; storyCodeReview(epicHash, storyId): Promise<CodeReviewEvidence> } with CodeReviewEvidence { kind: 'clean' | 'overridden' | 'blocked' | 'missing'; overrideReason?: string }. The default implementation reads the BUILD record's per-task results and enforceCodeReviewGate; s7 replaces the Task side with the Task artifact's own build rounds.

**Call sites:**
- `src/workflow/code-review/gate.ts`
- `src/workflow/runners/build/standalone-record.ts`

### 3.8 `Codec registry (five pass-through kinds)` — field-modify

registeredKinds grows from eleven to sixteen: EPIC, STORY, TASKS, TASK and DIAG get codecs whose decode returns body and citations unchanged and whose encode builds the identity meta from the creation context. Current behaviour changed on purpose: the s2 assertions that these kinds are unknown change.

**Call sites:**
- `src/workflow/artifact-core/codecs.ts`
- `src/workflow/artifact-core/decode.ts`

### 3.9 `WorkflowApproveRequest.lifecycle and the review arguments` — field-add

An optional lifecycle?: LifecycleService field. Absent means today's behaviour.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/review/run-artifact.ts`

### 3.10 `Error classes` — new

LifecycleConflictError (carries the Integrity reason and artifact id), IllegalTransitionError, TerminalArtifactError, ReviewRequiredError and UnreadableChildError (carries the unreadable ids), beside the s2 classes in types.ts.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.11 `ChangeLogEntry usage rules` — invariant-change

sc3 shape unchanged. Every store log entry carries revision {number, contentHash} (s2 behaviour, kept); an entry also carries status {from, to} whenever the status changed; review and completion entries carry outcome {result, summary, data?} with the verdict and counts or the override reason. Replaying the log rebuilds the status.

**Call sites:**
- `src/workflow/artifact-core/store.ts`
- `src/workflow/artifact-core/history.ts`

### 3.12 `meta.approvedAt, rejectedAt, rejectReason, staleAckedAt, review, reviewOverride (existing)` — invariant-change

Untouched by s3. The gates keep writing them; the delivery board and review currency read them (c4). A head can carry both representations; s9 back-fills lifecycle.approval and review from them. Whether they are retired is the owner's decision.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/delivery/currency.ts`

## 4. Diagrams

- [ER model](docs/epics/one-common-model-every-artifact-E202610192f27754d/S003/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Implements transition, checkIntegrity and rollUp with the HLD's names and return types; transition gains an optional trailing detail parameter. The structures are used as declared in artifact-core/types.ts. |
| `sc2` | consumes | Uses ArtifactStore.read, readWithHistory and childrenOf unchanged. Adds update, childrenOfStrict, the options parameter of write, the five pass-through codecs and the lifecycle reconcile inside prepareArtifactWrite; all additive and call-compatible, raised as open questions for the sc2 owner. |
| `sc3` | consumes | Uses History.log and the closed Operation set through readWithHistory; adds no operation and no entry field. |
| `sc1` | consumes | Uses ArtifactIds.parse and parentOf for the roll-up chain and ArtifactIds.make with the same hash and story for a unit's fixed members; DIAG members keep the sequence they were parsed with. |

## 6. Error paths

**Error cases**

- **A head's stored contentHash no longer matches the hash of its own description and payload (a hand edit, or two clones that bumped to the same number with different content and merged silently)** (recoverable)
  - Detection: checkHeadIntegrity recomputes contentHash from the decoded head and compares it with lifecycle.revision.contentHash when that is non-empty; the gates call it before anything else, the service calls the full checkIntegrity
  - Response: approve, review and complete throw LifecycleConflictError {reason: 'hash-mismatch'} before the team gate, the review checks, ensureBuildRecordOnCompletion or any write; the workflow path reports it in skipped[]. A person resolves it by an explicit ArtifactStore.write with options.outcome.result 'conflict-resolved', which adopts the content now in the head, recomputes the hash and logs an update; an ordinary write on a conflicted head throws the same error, so nothing picks a side silently
  - User impact: The artifact cannot be approved, reviewed or completed until someone confirms which content stands; other artifacts are unaffected
- **The change log and the head disagree about the revision number (head below or above the last revision-bearing entry)** (recoverable)
  - Detection: LifecycleService reads the log inside ArtifactStore.update and passes the last revision-bearing entry to checkIntegrity, which compares numbers and, when equal, the non-empty hashes
  - Response: head-ahead-of-log (the log has revision entries below the head's number) or log-ahead-of-head throws LifecycleConflictError with that reason and writes nothing; a log with no revision-bearing entry is no history and is not a conflict
  - User impact: Approval is withheld until the log and head agree; the message names the reason
- **An operation that the closed table does not allow from the current status, or an operation missing its required detail** (recoverable)
  - Detection: assertLegalStatusChange in transition, reconcileLifecycle and ArtifactStore.write
  - Response: Throw IllegalTransitionError naming the status and the operation; nothing is staged, logged or written
  - User impact: The call fails with the allowed operations listed; the artifact is unchanged
- **Approving a DEF, HLD or LLD with no review bound to the current revision, or with a block verdict, and no override** (recoverable)
  - Detection: transition compares lifecycle.review.revision with lifecycle.revision.number and the verdict for the review-required kinds
  - Response: Throw ReviewRequiredError; with detail.override.reason the approval is recorded with approval.override and the log entry's outcome carries the reason
  - User impact: Same as the existing ReviewBlockedError: resolve the findings or approve with a reason
- **A content change is written to a completed, withdrawn or superseded artifact, by any writer** (recoverable)
  - Detection: reconcileLifecycle (called from prepareArtifactWrite) sees contentChanged and a terminal prior status
  - Response: Throw TerminalArtifactError before the file is touched; the caller reopens (completed only) and writes again
  - User impact: A finished unit's documents cannot be edited by accident, through the store or through writeArtifact
- **complete on a Task, Story or Epic whose roll-up is not true yet** (recoverable)
  - Detection: LifecycleService.apply calls rollUp(id) for TASK, STORY and EPIC
  - Response: Throw IllegalTransitionError naming the first unmet condition (an unfinished Task, no counted Task, a code review that is blocked or missing); nothing is written
  - User impact: The unit stays as it is; the result says what is outstanding
- **A child head of the unit cannot be read or decoded while rolling up** (recoverable)
  - Detection: childrenOfStrict returns it in unreadable, instead of dropping it as childrenOf does
  - Response: rollUp throws UnreadableChildError naming the ids and the service writes nothing; an unreadable child is never counted as completed or as absent
  - User impact: Completion is withheld and the corrupt child is named
- **Two operations on the same artifact at once (approve and a content write, two lifecycle-only operations, two complete calls)** (recoverable)
  - Detection: LifecycleService runs its read, integrity check, completed-once check, transition and write inside ArtifactStore.update, which holds the per-artifact queue
  - Response: The operations run one after the other, each reading the head the previous one left; the second complete finds the first one's complete entry and returns recorded:false; no lost update
  - User impact: No overwrite of another operation's approval, review or signoff and no duplicate complete entry within one process (cross-process safety is s4)
- **A Story or Epic completion cascade fails part-way (a member write fails)** (recoverable)
  - Detection: Each member is its own ArtifactStore.update with its own journal staging; a thrown error aborts the loop
  - Response: Members are completed first and the unit's own complete entry last, so a failure leaves the unit not completed; a retry skips members already terminal, finishes the rest and then records the unit once
  - User impact: A retry of the same call completes the unit; nothing reads as completed that is not
- **ack-stale on an artifact that is not stale, or mark-stale or any lifecycle operation on a terminal artifact** (recoverable)
  - Detection: transition checks lifecycle.stale and the terminal set
  - Response: Throw IllegalTransitionError
  - User impact: No entry is logged for a no-op
- **A create is written with a status other than draft, or with a hand-made revision number and hash** (recoverable)
  - Detection: reconcileLifecycle on a create
  - Response: A non-draft status throws IllegalTransitionError; a supplied revision.number and contentHash are overwritten with the minted number and computed hash, never trusted
  - User impact: A caller cannot forge an approved or already-hashed artifact
- **The code review's block verdict comes back as an advisory warn because enforcement is off** (recoverable)
  - Detection: storyCodeReview reads gate.status 'warn' with advisory:true
  - Response: The evidence is blocked unless the user overrode it; the Story does not complete and the result says the review is advisory-blocked
  - User impact: Completion needs a clean review or an explicit override even when gate enforcement is off

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An identical rewrite of an artifact whose head has no stored hash (every head before s9) that carries meta.lifecycle | The comparison hashes the prior head's own content, so the revision does not move (ac8); the write fills the hash and logs an update whose entry carries the same revision number and the new hash, so the log agrees with the head; the hash-baseline follows an older entry with an empty hash without conflict |
| A head with no meta.lifecycle is rewritten by writeArtifact, approved or reviewed | Nothing about lifecycle is added or checked: prepareArtifactWrite leaves it as today, and the head guard sees an empty hash and passes |
| Only the description changes | The hash changes, so the revision moves and the status returns to draft (the description is content) |
| A payload whose object keys are reordered, or whose nested value has a toJSON (a Date) | The canonical JSON sorts keys and uses the persisted form, so reordering is no change and two different dates are a change |
| A reference, attachment, binding, parent or lifecycle-only change (approval, review, signoff, stale) | The hash is unchanged, the revision does not move and the status does not fall back (ac8) |
| A content change to an approved artifact that also has a review and a signoff | number and contentHash move, status becomes draft, and approval.revision, review.revision and signoff.revision keep the older number (ac7, binding requirement 6) |
| The BUILD record hook rewrites a BUILD head that carries meta.lifecycle | prepareArtifactWrite reconciles the lifecycle in that content write, so the hash and number stay right; the guard ran before the hook, so a conflicted record was never rewritten |
| reviewArtifactFile applies an auto-fix to an LLD that carries meta.lifecycle | The 'content' write reconciles the hash, moves the number and returns the status to draft, so the review's own fix does not make the head conflict with itself |
| A Story whose Tasks are all withdrawn or superseded, or that has no Task children | rollUp returns undefined: at least one counted Task is needed |
| A Task child that is rejected or still draft | It counts as unfinished and blocks the Story, unlike a withdrawn or superseded Task |
| A Story with two diagrams DIAG-<hash>-s1-1 and DIAG-<hash>-s1-2 | Both are found through childrenOf(STORY id), keep their parsed sequence and are completed with the Story; a DIAG or TASKS child is never counted as a Task |
| The Story's code review is overridden by the user over a block verdict | storyCodeReview gives overridden, the Story completes and its complete entry's outcome carries the override reason |
| complete is requested twice, or after a reopen | The second call returns recorded:false; after a reopen the old complete entry no longer counts and the unit can complete again |
| reopen of a Story whose Epic is completed | Refused with IllegalTransitionError: the Epic is reopened first; reopening a unit also reopens the members its completion froze |
| The s2 tests that assert the old registry | registeredKinds now lists sixteen kinds and TASK, STORY, TASKS, EPIC and DIAG decode and write through pass-through codecs; the assertion on log revisions in store-write.test.ts (create 1, update 1, update 1, update 2) stays as it is |

**Invariants to preserve**

- The revision rule has one implementation, prepareArtifactWrite: meta.revision rises only for a changed 'content' write and an identical rewrite keeps it; ArtifactStore.write keeps meta.revision and lifecycle.revision.number equal [[c2]]
- ArtifactStore.write keeps its write order (stage, append the log entry, replace the head, clear), its per-artifact queue, idempotent recovery and its refusal to stage an entry the log would reject; every store log entry carries revision {number, contentHash} [[c1]]
- A head with no meta.lifecycle still decodes (draft, revision from meta.revision) and is written, approved and reviewed as it is today; no stored data is converted by s3 [[c1]]
- approveArtifactByJsonPath stays synchronous with the same return shape and keeps the team gate, the review gate, the other-party review rule, the write-once rangeBase and the meta-only write; approveWorkflowTarget keeps its skipped[] and codeReview outcomes and its order of events except that the guard comes first [[c3]]
- The code-review gate's outcomes (no-review, pass, warn with or without advisory, blocked, overridden) and its fail-open behaviour are unchanged; the lifecycle reads them and does not redefine them [[c3]]
- The delivery board and review currency read meta.approvedAt, rejectedAt and the review fields, not a lifecycle status, and keep doing so [[c5]]
- childrenOf keeps skipping and logging an unreadable head, derives children from each head's parent link, works for every kind and stores nothing on the parent [[c4]]
- Any file that writes artifacts through the store or appends a history line needs an entry in the write inventory, and the new lifecycle service file is entered with the task that creates it [[c6]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run with npx tsx --test; tests sit in __tests__ beside the code, and the artifact-core tests reuse the temporary-repository kit (store-kit.ts) with its memory sidecar, memory journal and injectable faults`

**Test levels**

- **unit** — The pure rules, with no disk and no clock: hash, table, transitions, reconcile, integrity, roll-up, evidence mapping.
  - Subjects: `contentHash gives equal hashes for equal description and payload in any key order, and different hashes when the description, the body or the citations change; references, parent, attachments, binding, lifecycle and a Date value that persists the same do not change it, and two different Dates do`, `LIFECYCLE_TABLE: every one of the thirteen lifecycle operations from every one of the ten statuses either lands on the status the table names or throws IllegalTransitionError, and content operations are refused by transition`, `transition sets approval {revision, by, at, override?} for the current revision, records a review and returns the status to draft, appends a signoff and moves the latest one to changes-requested or completed, sets and clears stale without changing status, and refuses each operation whose required detail is missing`, `transition approve on a DEF, HLD or LLD without a review bound to the current revision, or with a block verdict, throws ReviewRequiredError unless detail.override carries a reason, and a PLAN, ISSUE or SPEC needs no review`, `reconcileLifecycle on a create, on an identical rewrite (including a prior head with an empty stored hash, which fills the hash and keeps the number), on a description-only change, on a reference-only change, and on a forged revision number and hash supplied by the caller`, `reconcileLifecycle after a content change to an approved artifact with a review and a signoff: the revision number and hash move, the status is draft, and approval, review and signoff keep their original revision numbers`, `reconcileLifecycle refuses a content change on a completed, withdrawn or superseded artifact (TerminalArtifactError) and a create with a status other than draft`, `checkHeadIntegrity and checkIntegrity: ok, an empty stored hash is ok, hash-mismatch, head-ahead-of-log, log-ahead-of-head, a log with no revision-bearing entry is ok, the same number with a different non-empty hash, and an older log entry with an empty hash`, `rollUp for a Task from CompletionEvidence; for a Story with counted Tasks all completed, one unfinished, one rejected, withdrawn and superseded ones that do not count, TASKS and DIAG children that are ignored, no Tasks at all, and each code-review evidence kind (clean, overridden, blocked, missing); for an Epic over its Stories; an unreadable child makes rollUp throw UnreadableChildError`, `storyCodeReview maps the gate: pass and a non-advisory warn to clean, an advisory warn to blocked, overridden to overridden with its reason, blocked to blocked, no-review to missing`
  - Fixtures: `artifact fixtures built with the artifact() helper of store-kit.ts`, `in-memory ChildStatusReader and CompletionEvidence`
- **integration** — The store, prepareArtifactWrite, the service and the gates against a temporary repository with real head files.
  - Subjects: `prepareArtifactWrite on a head that carries meta.lifecycle (through writeArtifact, as the BUILD record hook and the review auto-fix call it): a content write reconciles hash, number and the fall-back to draft, a meta-only write leaves them, a head with no meta.lifecycle is prepared exactly as before, and the existing artifact-writer and prepare-artifact-write tests pass unchanged`, `ArtifactStore.write with a lifecycle operation logs that operation with status {from, to}, every entry still carries revision {number, contentHash}, mark-stale and ack-stale log no status, a status change outside the table is refused, an ordinary write on a conflicted head is refused and a write with outcome.result 'conflict-resolved' adopts the head's content and logs it`, `pass-through codecs: a TASK, STORY, EPIC, TASKS and DIAG head is written, read, listed by childrenOfStrict and given a status through the store, and registeredKinds lists sixteen kinds`, `ArtifactStore.update runs read, mutate and write inside the queue: two competing lifecycle-only operations (approve and open-signoff, or two complete calls) both land in order and neither is lost, and a mutate that throws writes nothing`, `ArtifactStore.childrenOfStrict returns an unreadable child that childrenOf skips, and a corrupt unfinished Task makes the Story's roll-up throw instead of completing`, `LifecycleService.apply end to end for ac7: approve an artifact, change its content through the store, and read it back with readWithHistory to see draft status, the new revision, the earlier approval and review at the older revision, and a log that replays to the same status`, `LifecycleService.apply refuses approve, review and complete on a head with each Integrity reason and writes and logs nothing, while a head with no stored hash and a head with no revision-bearing log entry are approved normally`, `Story completion for ac9 over a temporary repository of EPIC, STORY, TASK, TASKS, DIAG (two), LLD, PLAN, BUILD, CR, TESTS and EXT heads: completeIfRolledUp after the last Task completes the Task, then the Story with its members first and itself last, records it once, then completes the Epic when its Stories have; withdrawn and superseded Tasks are ignored, an advisory-blocked or missing code review withholds it, an overridden one completes it with the reason on the entry, and a failure part-way is finished by a retry`, `reopen of a completed Story reopens the members its completion froze and is refused while its Epic is completed`, `approveWorkflowTarget in both branches refuses a conflicted BUILD target in skipped[] BEFORE ensureBuildRecordOnCompletion rewrites it (the record's bytes are unchanged), with a service it applies the approval through LifecycleService and triggers completeIfRolledUp after a BUILD approval, and without a service it behaves as today`, `approveArtifactByJsonPath and reviewArtifactFile refuse a head whose stored hash differs from its content with LifecycleConflictError before any stamp, a review auto-fix on a head with meta.lifecycle keeps the hash consistent, and the existing gates, plan-gate, admit-build, review and build-step tests pass unchanged`
  - Fixtures: `a temporary repository with .insrc/artifacts`, `heads written with and without meta.lifecycle and with a stored hash that is right and wrong`, `the store-kit memory sidecar, journal and fault switches`
- **contract** — The shapes, the registry and the write inventory stay in step with the contract.
  - Subjects: `the write inventory test over the real src tree: the lifecycle service file has an entry and a caller of ArtifactStore.write or update is recognised`, `the Lifecycle, Integrity, ContentView, TransitionDetail and WriteOptions types accept the sc4 sketch and the declared additions`, `the s2 assertions that change intentionally (registeredKinds, TASK and STORY no longer unknown kinds) are updated and the log-revision assertion in store-write.test.ts stays as it is`
  - Fixtures: `the type-fixture and negative-control files pattern of types-contract.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac7` | `src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts: after a content change to an approved artifact the status is draft, the revision moved, and the earlier approval and review keep their original revision numbers (unit, then through LifecycleService and readWithHistory, then through writeArtifact)`, `src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: reconcileLifecycle after a content change to an approved artifact with a review and a signoff` |
| `ac8` | `src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: an identical rewrite, a head with an empty stored hash, a reference-only change and a lifecycle-only change leave the revision where it is`, `src/workflow/artifact-core/__tests__/content-hash.test.ts: contentHash ignores key order and everything but the description and payload` |
| `ac9` | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts: the Task, Story and Epic roll-up rules, the evidence mapping and the unreadable child`, `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts: completeIfRolledUp records the Story once, members first and the unit last, and the Epic follows` |
| `ac10` | `src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts: checkHeadIntegrity and checkIntegrity for every reason, and the service and the gates refuse approve, review and complete on a conflict before the BUILD record hook` |

## 8. Migration

**State before:** prepareArtifactWrite (src/workflow/storage.ts) is the one revision rule but knows nothing about meta.lifecycle, so a writeArtifact caller that rewrites a head carrying meta.lifecycle would leave its number, hash and status stale. ArtifactStore.write (src/workflow/artifact-core/store.ts) stores a.lifecycle as the caller supplies it except revision.number, decides content versus meta-only with a sorted-key canonical() comparison, logs every write as create or update with the supplied contentHash, and holds the per-artifact queue only around write. childrenOf skips and logs unreadable heads. decodeArtifactHead and write require a codec, and EPIC, STORY, TASKS, TASK and DIAG have none. The gates (approveArtifactByJsonPath, rejectArtifactByJsonPath, ackStaleArtifact, approveWorkflowTarget in src/workflow/gates.ts) and reviewArtifactFile write meta.approvedAt, rejectedAt, staleAckedAt and meta.review directly, never touch meta.lifecycle, and approveWorkflowTarget calls ensureBuildRecordOnCompletion before approving a BUILD target in both branches; reviewArtifactFile may write a content-changing auto-fix. Nothing computes a content hash or reads the log tail on approve. The only History and WriteJournal implementations are in memory until s4.

**State after:** A pure lifecycle module (src/workflow/artifact-core/lifecycle.ts) holds the closed table, contentHash, ContentView, reconcileLifecycle, transition, checkIntegrity, checkHeadIntegrity and rollUp. prepareArtifactWrite calls reconcileLifecycle for any head that carries meta.lifecycle, so every writer keeps the hash, number and fall-back to draft in step and ArtifactStore.write relies on it. The registry holds pass-through codecs for the five missing kinds. ArtifactStore gains update (read, mutate and write under the queue), childrenOfStrict and the WriteOptions parameter, and refuses a status change outside the table and an ordinary write on a conflicted head. A LifecycleService (src/workflow/artifact-core/lifecycle-service.ts) applies one operation at a time inside update, records complete once with members first and the unit last, and walks the parent chain with completeIfRolledUp. approveWorkflowTarget and reviewArtifactFile check integrity before the BUILD record hook; with an optional lifecycle service they use the full log-tail check, apply the approval through the service and trigger roll-up, and without one they run the synchronous head-only guard and behave as today. The gates still write the legacy meta fields for the delivery board.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add LifecycleConflictError, IllegalTransitionError, TerminalArtifactError, ReviewRequiredError and UnreadableChildError to src/workflow/artifact-core/types.ts and extend the exports test that pins the module's runtime exports. — ↩ rollbackable
2. Add src/workflow/artifact-core/lifecycle.ts with the pure parts only: LIFECYCLE_TABLE and assertLegalStatusChange, contentHash with its canonical JSON, ContentView, TransitionDetail, Integrity, checkHeadIntegrity, checkIntegrity, reconcileLifecycle and transition, with unit tests for each; nothing calls it yet. — ↩ rollbackable _(needs: `step 1`)_
3. Make prepareArtifactWrite call reconcileLifecycle for a head that carries meta.lifecycle, taking the actor and time from new optional opts (defaulting to the insrc:system actor and the clock); a head with no meta.lifecycle is untouched. The existing storage, artifact-writer, prepare-artifact-write and BUILD-record tests must pass unchanged. — ↩ rollbackable _(needs: `step 2`)_
4. Register pass-through codecs for EPIC, STORY, TASKS, TASK and DIAG in src/workflow/artifact-core/codecs.ts. Update the s2 assertions that pin the old registry: the registeredKinds list and the unknown-kind checks for TASK and STORY in codec-create.test.ts and store-write.test.ts (the write of a TASK with a wrong parent still fails on its parent first), and the children and decode tests that use TASK ids only through the head file stay valid. — ↩ rollbackable _(needs: `step 1`)_
5. Change ArtifactStore: write takes WriteOptions and relies on the lifecycle prepareArtifactWrite computed (dropping the canonical() content test), enforces the closed table, refuses an ordinary write on a conflicted head and allows outcome.result 'conflict-resolved'; add update, which holds the queue across read, mutate and write, and childrenOfStrict. The s2 store tests, including the log-revision assertion, must pass unchanged. — ↩ rollbackable _(needs: `step 3`, `step 4`)_
6. Add rollUp and the unit membership helper to lifecycle.ts over ChildStatusReader (childrenOfStrict plus a status read) and CompletionEvidence, and add the default evidence in src/workflow/artifact-core/completion-evidence.ts (Task from the BUILD record's per-task results; Story code review as the structured CodeReviewEvidence mapped from enforceCodeReviewGate with the advisory warn as blocked). The evidence file only reads, so it needs no inventory entry. — ↩ rollbackable _(needs: `step 2`, `step 5`)_
7. Add src/workflow/artifact-core/lifecycle-service.ts with apply and completeIfRolledUp, built on ArtifactStore.update, and add its inventory entry in the same task, since the inventory test rejects a store caller with no entry and an entry for a file that does not exist. — ↩ rollbackable _(needs: `step 5`, `step 6`)_
8. In src/workflow/gates.ts call the integrity check at the top of approveArtifactByJsonPath and, in both branches of approveWorkflowTarget, before ensureBuildRecordOnCompletion; add the optional lifecycle field to WorkflowApproveRequest and to reviewArtifactFile's arguments, using the full log-tail check, LifecycleService.apply and completeIfRolledUp when it is supplied and checkHeadIntegrity when it is not. The existing gates, plan-gate, admit-build, review and build-step tests must pass unchanged. — ↩ rollbackable _(needs: `step 2`, `step 7`)_
9. Record the follow-ups in docs/plans/core-data-model.md: s4 wires a durable LifecycleService into the daemon and the approval path, the legacy meta fields stay until the owner retires them, the pass-through codecs are refined by s7 and s9, and s7 replaces the Task side of CompletionEvidence. Run the workflow, mcp and daemon subsets once and the build. — ↩ rollbackable _(needs: `step 8`)_

**Backward compat:** No stored data changes and no signature is broken: ArtifactStore.write, transition, prepareArtifactWrite and reviewArtifactFile gain optional trailing parameters, WorkflowApproveRequest gains an optional field, and the gates keep their synchronous or async shapes and return values. A head with no meta.lifecycle or with an empty contentHash is read, written, approved and reviewed exactly as today, and an identical rewrite of such a head does not move its revision because the comparison hashes the prior head's own content. Heads that carry meta.lifecycle, and only those, now have their hash, number and status kept in step by every writer, a hash mismatch refuses approve, review and complete, a status change outside the table is refused, and a content change to a completed, withdrawn or superseded artifact is refused until reopen. The five new pass-through codecs change the s2 assertions that listed them as unknown kinds; no production code relied on that. The old meta.approvedAt, rejectedAt, staleAckedAt and review fields stay the truth for the delivery board and the existing readers.

## 9. Alternatives considered

### 9.1 a1: Injected LifecycleService, one reconcile in prepareArtifactWrite, pass-through codecs, update() under the queue — **CHOSEN**

Pure lifecycle rules plus a LifecycleService that the async approval path takes as an optional parameter; prepareArtifactWrite reconciles meta.lifecycle for every writer; the five missing kinds get pass-through codecs; ArtifactStore.update holds the queue across read, mutate and write.

Add src/workflow/artifact-core/lifecycle.ts (pure: closed table, contentHash, reconcileLifecycle, transition, checkIntegrity, checkHeadIntegrity, rollUp over ports) and call reconcileLifecycle from prepareArtifactWrite when the head carries meta.lifecycle, so writeArtifact, the BUILD record hook, the review auto-fix and ArtifactStore.write all keep hash, number and the draft fall-back in step through one implementation. Register pass-through codecs for EPIC, STORY, TASKS, TASK and DIAG so the store, the service and rollUp work for them. Add ArtifactStore.update(id, by, mutate, options) (queue held across read, mutate and write), WriteOptions (operation, outcome, references, addresses) and childrenOfStrict. Add LifecycleService (apply, completeIfRolledUp) with structured CompletionEvidence. approveWorkflowTarget and the review step take an optional lifecycle service on their request: with it they run the guard before ensureBuildRecordOnCompletion, run the full integrity check against the log tail, apply the operation and walk up the parents to record a Story or Epic completion once; without it they run the synchronous head-only guard and behave as today. The gates keep writing meta.approvedAt, rejectedAt, staleAckedAt and meta.review for the board.

### 9.2 a2: Rules, reconcile in prepareArtifactWrite and the head-only guard; service built and tested but not wired

The same pure rules, the single reconcile and the head-only gate guard, with the LifecycleService delivered and tested against the memory ports but with no gate or review parameter to receive it.

Everything in a1 except the optional service parameter on approveWorkflowTarget and the review step and the parent walk-up trigger: the service exists and is covered by tests, and s4's LLD is told to add the wiring and the roll-up trigger. The gates call only checkHeadIntegrity (before ensureBuildRecordOnCompletion) and stay synchronous.

**Rejected because:** Smaller, but leaves ac9, ac10 and k8 only partly met and moves unscoped work into s4.

### 9.3 a3: A process-wide registered LifecycleService

As a1, but the service is registered once at daemon start in a module-level slot that the gates read, instead of being passed on the request.

lifecycle-service exports setLifecycleService and getLifecycleService; approveWorkflowTarget, the review step and the Task completion path call getLifecycleService() and use it when set. s4's daemon start sets it. All other parts as a1.

**Rejected because:** Meets the criteria like a1 but adds a hidden process-wide slot that leaks between tests and callers, against the project's explicit dependency passing.

## 10. References

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/store.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/storage.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/gates.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/artifact-ids.ts`
- **[[c5]]** `analyze-bundle` `src/workflow/team/gate.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/artifact-core/__tests__/store-kit.ts`
- **[[c7]]** `doc` `docs/plans/core-data-model.md#gap-2-payload-and-lifecycle-on-the-base-settled`

## 11. Open questions

- sbdry5: the build edits s2's store, codecs and prepareArtifactWrite (update, childrenOfStrict, the options parameter of write, five pass-through codecs and the lifecycle reconcile) and adds an optional field to the gate request; confirm with the sc2 owner (s2, already built) that these additions are accepted and whether they need an HLD amendment like readWithHistory did (AMD-7)
- sbdry3: transition gains an optional detail parameter and ArtifactStore gains update, childrenOfStrict and an options parameter that the HLD sketch does not show; only the storyBoundary.addConsumer making s4 a consumer of sc4 is proposed as an amendment, so decide whether the others need one (contentHash is also not in the sketch)
- The gates keep writing meta.approvedAt, rejectedAt, staleAckedAt and meta.review for the delivery board, so a head can carry both representations until s9 back-fills; decide whether and when those fields and their readers are retired (the owner's no-compatibility ruling disfavours keeping both indefinitely)
- The service reaches production only when s4 wires a durable History and WriteJournal into the daemon and passes the service on the approval request; confirm that handoff and the addConsumer amendment with s4
- The Task side of CompletionEvidence reads the BUILD record's per-task results because no Task head has a payload yet; s7 replaces it with the Task artifact's own build rounds, so confirm that handoff
- cd1/cd2/dm1/dm2: new helper names (contentHash, reconcileLifecycle, checkHeadIntegrity, LifecycleService, update, childrenOfStrict, CompletionEvidence) are not in s1 or the HLD, the reviewArtifactFile arguments are given as a placeholder type, and not every invariant-change entry cites its current-behaviour invariant (the invariantsToPreserve cite c1 to c6)

## Resolved questions

- `q6f07234c` — sbdry5: the build edits s2's store, codecs and prepareArtifactWrite (update, childrenOfStrict, the options parameter of write, five pass-through codecs and the lifecycle reconcile) and adds an optional field to the gate request; confirm with the sc2 owner (s2, already built) that these additions are accepted and whether they need an HLD amendment like readWithHistory did (AMD-7)
  - **resolved**: Split acceptance by change — Owner: covered additions are recorded; the rest are amended as AMD-7 was. _(2026-10-21T05:09:56.116Z)_
- `qd5676e97` — sbdry3: transition gains an optional detail parameter and ArtifactStore gains update, childrenOfStrict and an options parameter that the HLD sketch does not show; only the storyBoundary.addConsumer making s4 a consumer of sc4 is proposed as an amendment, so decide whether the others need one (contentHash is also not in the sketch)
  - **resolved**: Amend according to contract impact — Keep AMD-8; amend only additions that change cross-story obligations. _(2026-10-21T05:11:18.174Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/store.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/storage.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/gates.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/artifact-ids.ts`
- **[[c5]]** `analyze-bundle` `src/workflow/team/gate.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/artifact-core/__tests__/store-kit.ts`
- **[[c7]]** `doc` `docs/plans/core-data-model.md#gap-2-payload-and-lifecycle-on-the-base-settled`
