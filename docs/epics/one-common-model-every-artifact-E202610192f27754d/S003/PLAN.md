<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s3 -->

# Plan: E202610212f27754d:S003

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792557860113-nm31as`
**LLD effective hash:** `f964e89a6119...`

The build lays the lifecycle in small steps: the error classes, then the pure rules module, then the one reconcile inside prepareArtifactWrite so every writer keeps the hash in step, the missing codecs, the store's write, update and strict child listing, the roll-up with its evidence, the service with its inventory entry, the gate guards placed before the BUILD hook, the optional service on the approval and review paths, and the follow-ups. Every task keeps the existing s2 and gate tests green and leaves a head with no lifecycle exactly as it is.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the lifecycle error classes | S | — | unit: src/workflow/artifact-core/__tests__/lifecycle-errors.test.ts: the five lifecycle error classes carry their name, reason and ids, and the module exports exactly eleven error classes | [[c1]] |
| 2 | **`t2`** Add the pure lifecycle rules module | L | `t1` | unit: src/workflow/artifact-core/__tests__/content-hash.test.ts: contentHash ignores key order and everything but the description and payload; unit: src/workflow/artifact-core/__tests__/lifecycle-table.test.ts: every lifecycle operation from every status lands where the closed table says or throws IllegalTransitionError; unit: src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts: transition sets approval, review, signoff and stale as the table says and refuses a missing detail; unit: src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts: approve on a DEF, HLD or LLD needs a review bound to the current revision or an override, and a PLAN, ISSUE or SPEC needs none; unit: src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: a create, an identical rewrite, a head with an empty stored hash, a description-only change, a reference-only change and a forged revision; unit: src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: reconcileLifecycle after a content change to an approved artifact with a review and a signoff; unit: src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: a content change on a terminal artifact and a create that is not draft are refused; unit: src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts: checkHeadIntegrity and checkIntegrity report every reason and treat unhashed and unlogged heads as ok | [[c2]] |
| 3 | **`t3`** Reconcile meta.lifecycle inside prepareArtifactWrite | M | `t2` | integration: src/workflow/__tests__/prepare-lifecycle.test.ts: prepareArtifactWrite reconciles meta.lifecycle for a content write, leaves it for a meta-only write, mints no revision for a metadata-only or key-order-only change, and prepares a head without meta.lifecycle as before | [[c3]] |
| 4 | **`t4`** Register pass-through codecs for the five missing kinds | S | — | integration: src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts: a TASK, STORY, EPIC, TASKS and DIAG head is written, read, listed and given a status through the store, and registeredKinds lists sixteen kinds | [[c4]] |
| 5 | **`t5`** Teach ArtifactStore.write the lifecycle rules | M | `t3`, `t4` | integration: src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts: write logs a lifecycle operation with status {from, to}, keeps revision on every entry, and refuses a step outside the table; integration: src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts: an ordinary write on a conflicted head is refused and a conflict-resolved write adopts the content | [[c5]] |
| 6 | **`t6`** Add ArtifactStore.update and childrenOfStrict | M | `t5` | integration: src/workflow/artifact-core/__tests__/store-update.test.ts: update runs read, mutate and write inside the queue, awaits an async mutate, keeps two competing operations in order and writes nothing when mutate throws; integration: src/workflow/artifact-core/__tests__/store-update.test.ts: a head replace that failed after the log append is finished before update reads, and the retry is logged once; integration: src/workflow/artifact-core/__tests__/store-children-strict.test.ts: childrenOfStrict returns an unreadable child that childrenOf skips | [[c5]] |
| 7 | **`t7`** Add rollUp, unit membership and the completion evidence | L | `t2`, `t6` | unit: src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts: the Task, Story and Epic roll-up rules, the evidence mapping and the unreadable child; unit: src/workflow/artifact-core/__tests__/completion-evidence.test.ts: storyCodeReview maps the gate, an explicit override wins over a stored one and an advisory warn is blocked without an override; unit: src/workflow/artifact-core/__tests__/lifecycle-members.test.ts: a Story's members keep each DIAG sequence and never include the unit itself | [[c6]] |
| 8 | **`t8`** Add the LifecycleService and its inventory entry | L | `t6`, `t7` | integration: src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts: after a content change to an approved artifact the status is draft, the revision moved, and the earlier approval and review keep their original revision numbers (unit, then through LifecycleService and readWithHistory, then through writeArtifact); integration: src/workflow/artifact-core/__tests__/lifecycle-service.test.ts: apply refuses approve, review and complete on each Integrity reason and writes nothing, while unhashed and unlogged heads are approved normally; integration: src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts: completeIfRolledUp records the Story once, members first and the unit last, and the Epic follows; integration: src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts: a completion that fails part-way is finished by a retry, and reopen reopens the frozen members and is refused while the Epic is completed; integration: src/workflow/__tests__/artifact-write-inventory.test.ts: the lifecycle service file has an entry and a caller of ArtifactStore.update is recognised | [[c7]] |
| 9 | **`t9`** Guard the gates against a hash conflict before the BUILD hook | M | `t2` | integration: src/workflow/__tests__/gates-lifecycle-guard.test.ts: approveWorkflowTarget refuses a conflicted BUILD target in both branches before ensureBuildRecordOnCompletion rewrites it; integration: src/workflow/__tests__/gates-lifecycle-guard.test.ts: approveArtifactByJsonPath and reviewArtifactFile refuse a conflicted head before any stamp and an unhashed head is unchanged | [[c8]] |
| 10 | **`t10`** Wire the optional LifecycleService into the approval and review paths | L | `t8`, `t9` | integration: src/workflow/__tests__/gates-lifecycle-service.test.ts: with a service, an explicit override over an advisory-blocked code review completes the Story through a real approval and the reason is on the complete entry; integration: src/workflow/__tests__/gates-lifecycle-service.test.ts: with a service, a review auto-fix or BUILD hook rewrite keeps the log in step so the next approval is not head-ahead-of-log; integration: src/workflow/__tests__/gates-lifecycle-service.test.ts: without a service the approval and review paths behave as before and meta.approvedAt is still stamped | [[c8]] |
| 11 | **`t11`** Record the s3 follow-ups | S | `t10` | unit: src/workflow/__tests__/docs-s3-follow-ups.test.ts: the plans doc lists the four hand-offs from the lifecycle Story | [[c9]] |

### 1.1 E202610212f27754d:S003:T001 — Add the lifecycle error classes

Add LifecycleConflictError (carrying the Integrity reason and artifact id), IllegalTransitionError, TerminalArtifactError, ReviewRequiredError and UnreadableChildError (carrying the unreadable ids) to src/workflow/artifact-core/types.ts and extend the exports test that pins that module's runtime exports.

**Acceptance checks:**
- the five classes are exported, are Errors and carry their name, and LifecycleConflictError and UnreadableChildError expose the reason and the ids
- the exports test lists exactly the existing six classes plus these five and the repository type-checks

### 1.2 E202610212f27754d:S003:T002 — Add the pure lifecycle rules module

Add src/workflow/artifact-core/lifecycle.ts with the closed LIFECYCLE_TABLE and assertLegalStatusChange, contentHash with its canonical JSON that honours toJSON, ContentView, TransitionDetail, Integrity, checkHeadIntegrity, checkIntegrity (a log with no revision-bearing entry is no history, an empty stored hash has nothing to compare), reconcileLifecycle, the canonical-hash content-changed test, and transition. Nothing calls it yet.

**Acceptance checks:**
- every one of the thirteen lifecycle operations from every one of the ten statuses either lands where the table says or throws IllegalTransitionError
- contentHash is equal for equal content in any key order, differs for a description, body or citations change, and ignores references, parent, attachments, binding and lifecycle
- reconcileLifecycle keeps approval, review and signoff at their original revision numbers after a content change that returns the status to draft, leaves the revision alone for an identical rewrite of a head with an empty stored hash, refuses a content change on a terminal artifact and a create that is not draft
- checkHeadIntegrity and checkIntegrity report each reason and treat an empty stored hash and a log with no revision-bearing entry as ok

### 1.3 E202610212f27754d:S003:T003 — Reconcile meta.lifecycle inside prepareArtifactWrite

Make prepareArtifactWrite call reconcileLifecycle for a head that carries meta.lifecycle, taking the actor and time from new optional opts (defaulting to insrc:system and the clock). For such a head the canonical description/body/citations hash decides whether a content write mints a revision, so metadata, lifecycle fields and key order cannot; a head without meta.lifecycle keeps the legacy comparison. Binding requirements 3 and 4.

**Acceptance checks:**
- a content write to a head with meta.lifecycle reconciles hash, number and the fall-back to draft, and a meta-only write leaves them
- a metadata-only or key-order-only change to a lifecycle-bearing head, written as content, does not mint a revision
- a head without meta.lifecycle is prepared byte for byte as before and the existing storage, artifact-writer and prepare-artifact-write tests pass unchanged

### 1.4 E202610212f27754d:S003:T004 — Register pass-through codecs for the five missing kinds

Register pass-through codecs for EPIC, STORY, TASKS, TASK and DIAG in src/workflow/artifact-core/codecs.ts (body and citations opaque, identity meta from the creation context) and update the s2 assertions that pinned the old registry: the registeredKinds list in codec-create.test.ts and the unknown-kind checks for TASK and STORY in store-write.test.ts.

**Acceptance checks:**
- registeredKinds lists all sixteen kinds and codecFor no longer throws for any id kind
- a TASK, STORY, EPIC, TASKS and DIAG head can be encoded, decoded and written through the store, and a TASK write with a wrong parent still fails on its parent first
- the other s2 tests pass unchanged

### 1.5 E202610212f27754d:S003:T005 — Teach ArtifactStore.write the lifecycle rules

In src/workflow/artifact-core/store.ts make write take WriteOptions (operation, outcome, references, addresses), rely on the lifecycle prepareArtifactWrite computed instead of the canonical() content test, enforce the closed table with assertLegalStatusChange, put status {from, to} on the log entry when the status changed while every entry keeps revision {number, contentHash}, and refuse an ordinary write on a hash-conflicted head while allowing outcome.result 'conflict-resolved' to adopt the head's content.

**Acceptance checks:**
- a lifecycle operation is logged with its real operation and status {from, to}, mark-stale and ack-stale log no status, and the s2 log-revision assertion still holds
- a status change outside the table is refused and an ordinary write on a conflicted head throws LifecycleConflictError while a conflict-resolved write adopts the head's content and logs an update
- the s2 store, journal and recovery tests pass unchanged

### 1.6 E202610212f27754d:S003:T006 — Add ArtifactStore.update and childrenOfStrict

Add update(id, by, mutate, options) whose mutate may be async and which holds the per-artifact queue across the read, the mutate and the write, recovering any pending journal operation under the queue before it reads the head or the history; add childrenOfStrict returning the readable children and the unreadable heads. Binding requirements 2 and 6.

**Acceptance checks:**
- two competing lifecycle-only operations through update both land in order and neither is lost, an async mutate is awaited under the queue, and a mutate that throws writes nothing
- a head replace that fails after the log append is finished by the next update before it reads, and the retry is logged once
- childrenOfStrict returns an unreadable child that childrenOf skips

### 1.7 E202610212f27754d:S003:T007 — Add rollUp, unit membership and the completion evidence

Add rollUp and the unit membership helper to lifecycle.ts over ChildStatusReader (childrenOfStrict plus a status read) and CompletionEvidence, and the default evidence in src/workflow/artifact-core/completion-evidence.ts: the Task side from the BUILD record's per-task results and the Story code review as structured CodeReviewEvidence mapped from enforceCodeReviewGate, where an advisory warn is blocked unless override evidence makes it overridden: an explicit override reason carried by the approval wins, otherwise the stored meta.reviewOverride of the CR or BUILD record. A unit is never its own member. Binding requirements 1 and 5.

**Acceptance checks:**
- rollUp follows the Task, Story and Epic rules, ignores TASKS and DIAG children and withdrawn and superseded Tasks, and throws UnreadableChildError for an unreadable child
- storyCodeReview maps pass and a non-advisory warn to clean, an advisory warn to blocked, overridden and an explicit override over an advisory warn to overridden with the reason, blocked to blocked and no-review to missing, and a stored reviewOverride is used when the approval carries none
- a Story's members are its fixed-id heads plus its STORY, TASKS and DIAG heads with each DIAG sequence kept, never the unit itself, and an Epic's are EPIC, DEF and HLD

### 1.8 E202610212f27754d:S003:T008 — Add the LifecycleService and its inventory entry

Add src/workflow/artifact-core/lifecycle-service.ts with apply and completeIfRolledUp built on ArtifactStore.update: the integrity check against the last revision-bearing entry, the completed-once check, transition and the write with the real operation; complete cascades to the members first with their own updates and records the unit's own entry last through the outer update only; reopen reopens the members and is refused while the parent is completed. Extend the write inventory detector to recognise update as a store write and add the service file's entry in the same task.

**Acceptance checks:**
- approve, review and complete on a head with each Integrity reason write and log nothing, and a head with no stored hash or no revision-bearing entry is approved normally
- after a content change an approved artifact reads draft with its earlier approval and review at the older revision and a log that replays to the same status
- complete is recorded once, the Story completes members first and itself last, completeIfRolledUp walks up to the Epic once, a failure part-way is finished by a retry, and reopen reopens the frozen members
- the write inventory test passes with the service entered and a caller of update is recognised

### 1.9 E202610212f27754d:S003:T009 — Guard the gates against a hash conflict before the BUILD hook

In src/workflow/gates.ts call checkHeadIntegrity at the top of approveArtifactByJsonPath and, in both branches of approveWorkflowTarget, before ensureBuildRecordOnCompletion; call it at the start of reviewArtifactFile in src/workflow/review/run-artifact.ts. A conflicted target goes to skipped[] on the workflow path and raises LifecycleConflictError elsewhere; a head with no stored hash behaves as today.

**Acceptance checks:**
- a BUILD target whose stored hash differs from its content comes back in skipped[] in both branches and its record bytes are unchanged by ensureBuildRecordOnCompletion
- approveArtifactByJsonPath and reviewArtifactFile raise LifecycleConflictError before any stamp, and approveArtifactByJsonPath stays synchronous
- the existing gates, plan-gate, admit-build, review and build-step tests pass unchanged

### 1.10 E202610212f27754d:S003:T010 — Wire the optional LifecycleService into the approval and review paths

Add the optional lifecycle?: LifecycleService field to WorkflowApproveRequest and reviewArtifactFile's arguments: with it the full log-tail check runs, the approval is applied through LifecycleService.apply, completeIfRolledUp is called after a BUILD record approval, and when a service is supplied ensureBuildRecordOnCompletion's persist and reviewArtifactFile's auto-fix write through the service's ArtifactStore (a content update that appends the revision-bearing entry) instead of writeArtifact so the log stays in step; without a service they keep writeArtifact and behaviour is as after t9. The legacy meta.approvedAt stamp still follows. Binding requirement 3.

**Acceptance checks:**
- with a service, an explicit override over an advisory-blocked code review completes the Story through a real approval and the override reason is on the complete entry
- with a service, a review auto-fix or BUILD hook rewrite on a head with existing history leaves the next service approval ok, not head-ahead-of-log
- without a service the approval and review paths behave as after t9 and the legacy meta.approvedAt is still stamped

### 1.11 E202610212f27754d:S003:T011 — Record the s3 follow-ups

Record in docs/plans/core-data-model.md what s3 leaves for other Stories: s4 wires a durable LifecycleService into the daemon and the approval path (AMD-8), the gates keep the legacy meta fields until s9 retires them, the pass-through codecs are refined by s7 and s9, and s7 replaces the Task side of CompletionEvidence.

**Acceptance checks:**
- the plans doc lists the four hand-offs from this Story

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| contentHash gives equal hashes for equal description and payload in any key order, and different hashes when the description, the body or the citations change; references, parent, attachments, binding, lifecycle and a Date value that persists the same do not change it, and two different Dates do | `t2` |
| LIFECYCLE_TABLE: every one of the thirteen lifecycle operations from every one of the ten statuses either lands on the status the table names or throws IllegalTransitionError, and content operations are refused by transition | `t2` |
| transition sets approval {revision, by, at, override?} for the current revision, records a review and returns the status to draft, appends a signoff and moves the latest one to changes-requested or completed, sets and clears stale without changing status, and refuses each operation whose required detail is missing | `t2` |
| transition approve on a DEF, HLD or LLD without a review bound to the current revision, or with a block verdict, throws ReviewRequiredError unless detail.override carries a reason, and a PLAN, ISSUE or SPEC needs no review | `t2` |
| reconcileLifecycle on a create, on an identical rewrite (including a prior head with an empty stored hash, which fills the hash and keeps the number), on a description-only change, on a reference-only change, and on a forged revision number and hash supplied by the caller | `t2` |
| reconcileLifecycle after a content change to an approved artifact with a review and a signoff: the revision number and hash move, the status is draft, and approval, review and signoff keep their original revision numbers | `t2` |
| reconcileLifecycle refuses a content change on a completed, withdrawn or superseded artifact (TerminalArtifactError) and a create with a status other than draft | `t2` |
| checkHeadIntegrity and checkIntegrity: ok, an empty stored hash is ok, hash-mismatch, head-ahead-of-log, log-ahead-of-head, a log with no revision-bearing entry is ok, the same number with a different non-empty hash, and an older log entry with an empty hash | `t2` |
| rollUp for a Task from CompletionEvidence; for a Story with counted Tasks all completed, one unfinished, one rejected, withdrawn and superseded ones that do not count, TASKS and DIAG children that are ignored, no Tasks at all, and each code-review evidence kind (clean, overridden, blocked, missing); for an Epic over its Stories; an unreadable child makes rollUp throw UnreadableChildError | `t7` |
| storyCodeReview maps the gate: pass and a non-advisory warn to clean, an advisory warn to blocked, overridden to overridden with its reason, blocked to blocked, no-review to missing | `t7` |
| prepareArtifactWrite on a head that carries meta.lifecycle (through writeArtifact, as the BUILD record hook and the review auto-fix call it): a content write reconciles hash, number and the fall-back to draft, a meta-only write leaves them, a head with no meta.lifecycle is prepared exactly as before, and the existing artifact-writer and prepare-artifact-write tests pass unchanged | `t3` |
| ArtifactStore.write with a lifecycle operation logs that operation with status {from, to}, every entry still carries revision {number, contentHash}, mark-stale and ack-stale log no status, a status change outside the table is refused, an ordinary write on a conflicted head is refused and a write with outcome.result 'conflict-resolved' adopts the head's content and logs it | `t5` |
| pass-through codecs: a TASK, STORY, EPIC, TASKS and DIAG head is written, read, listed by childrenOfStrict and given a status through the store, and registeredKinds lists sixteen kinds | `t4`, `t6` |
| ArtifactStore.update runs read, mutate and write inside the queue: two competing lifecycle-only operations (approve and open-signoff, or two complete calls) both land in order and neither is lost, and a mutate that throws writes nothing | `t6` |
| ArtifactStore.childrenOfStrict returns an unreadable child that childrenOf skips, and a corrupt unfinished Task makes the Story's roll-up throw instead of completing | `t6`, `t7` |
| LifecycleService.apply end to end for ac7: approve an artifact, change its content through the store, and read it back with readWithHistory to see draft status, the new revision, the earlier approval and review at the older revision, and a log that replays to the same status | `t8` |
| LifecycleService.apply refuses approve, review and complete on a head with each Integrity reason and writes and logs nothing, while a head with no stored hash and a head with no revision-bearing log entry are approved normally | `t8` |
| Story completion for ac9 over a temporary repository of EPIC, STORY, TASK, TASKS, DIAG (two), LLD, PLAN, BUILD, CR, TESTS and EXT heads: completeIfRolledUp after the last Task completes the Task, then the Story with its members first and itself last, records it once, then completes the Epic when its Stories have; withdrawn and superseded Tasks are ignored, an advisory-blocked or missing code review withholds it, an overridden one completes it with the reason on the entry, and a failure part-way is finished by a retry | `t8` |
| reopen of a completed Story reopens the members its completion froze and is refused while its Epic is completed | `t8` |
| approveWorkflowTarget in both branches refuses a conflicted BUILD target in skipped[] BEFORE ensureBuildRecordOnCompletion rewrites it (the record's bytes are unchanged), with a service it applies the approval through LifecycleService and triggers completeIfRolledUp after a BUILD approval, and without a service it behaves as today | `t9`, `t10` |
| approveArtifactByJsonPath and reviewArtifactFile refuse a head whose stored hash differs from its content with LifecycleConflictError before any stamp, a review auto-fix on a head with meta.lifecycle keeps the hash consistent, and the existing gates, plan-gate, admit-build, review and build-step tests pass unchanged | `t9`, `t10` |
| the write inventory test over the real src tree: the lifecycle service file has an entry and a caller of ArtifactStore.write or update is recognised | `t8` |
| the Lifecycle, Integrity, ContentView, TransitionDetail and WriteOptions types accept the sc4 sketch and the declared additions | `t1`, `t2`, `t5` |
| the s2 assertions that change intentionally (registeredKinds, TASK and STORY no longer unknown kinds) are updated and the log-revision assertion in store-write.test.ts stays as it is | `t4`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 migration step 1: the lifecycle error classes`
- **[[c2]]** `prior-artifact` `LLD s3 migration step 2: the pure lifecycle rules module`
- **[[c3]]** `prior-artifact` `LLD s3 migration step 3: reconcile meta.lifecycle in prepareArtifactWrite`
- **[[c4]]** `prior-artifact` `LLD s3 migration step 4: pass-through codecs for the five missing kinds`
- **[[c5]]** `prior-artifact` `LLD s3 migration step 5: ArtifactStore write, update and childrenOfStrict`
- **[[c6]]** `prior-artifact` `LLD s3 migration step 6: rollUp, unit membership and the completion evidence`
- **[[c7]]** `prior-artifact` `LLD s3 migration step 7: the LifecycleService and its inventory entry`
- **[[c8]]** `prior-artifact` `LLD s3 migration step 8: the gate guards and the optional service on the approval and review paths`
- **[[c9]]** `prior-artifact` `LLD s3 migration step 9: the follow-ups and final checks`
