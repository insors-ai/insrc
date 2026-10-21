<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s6 -->

# Plan: E202610212f27754d:S006

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792589176560-aszz3i`
**LLD effective hash:** `bd468fd6cd6c...`

Building s6 gives every Epic and Story one typed tracker binding and lets design documents, plans and build records be linked from the unit's issue at the commit that holds them. The work starts with the tracker port additions and the storage carry rule, then adds the binding and attach modules, moves the unit-issue bookkeeping and the approve-time posts onto the binding with once-only markers, runs team mode and individual mode through one push path, and finishes with the tracker.attach method, the approve-time attach and the recorded hand-offs to s7 and s9.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add listComments and attach to the tracker port and the GitHub adapter | M | — | integration: github-comments.test.ts: the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list | [[c1]] [[c6]] |
| 2 | **`t2`** Carry the envelope binding and attachments through a content write | M | — | integration: binding-carry.test.ts: a content write by the store keeps the binding and attachments on disk, a first write keeps what the caller gave, and the carry leaves the revision number and content hash alone | [[c3]] [[c6]] |
| 3 | **`t3`** Add the binding module with the staged-write check | L | `t2` | unit: binding.test.ts: bindArtifact writes the typed binding with createdAtRevision, leaves the revision number and content hash unchanged, is idempotent for the same issue, refuses a different issue, and readBinding returns undefined for an unbound artifact; unit: binding.test.ts: recordPosted and setPendingLink record one entry per kind and a pending link that names a child ref or a child id, never twice, and without moving the revision; integration: binding-staged.test.ts: a binding, post or attachment patch is refused while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict; integration: artifact-write-inventory.test.ts: the binding writer is listed as a meta-only writer of meta.envelope and every production writer file still has an entry | [[c2]] [[c3]] [[c4]] [[c6]] |
| 4 | **`t4`** Add the attach module with commit-pinned links | M | `t1`, `t3` | unit: attach.test.ts: attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again; integration: artifact-write-inventory.test.ts: the write inventory lists the binding and attach writers as meta-only writers of meta.envelope and every production writer file still has an entry | [[c2]] [[c3]] [[c4]] [[c6]] |
| 5 | **`t5`** Move Epic and Story unit records onto the binding | L | `t3` | integration: unit-issue-binding.test.ts: ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit keeps its record on the Plan; integration: unit-issue-binding.test.ts: a failed link under the parent is stored as the binding's pending link, retried by the next ensure, cleared once done and not retried again; integration: unit-issue-binding.test.ts: the draft hook and the handoff check read the binding for an Epic or Story unit, and a pre-s6 head with only the old ref is rebound once from it with no new issue; integration: binding-gate.test.ts: the team gate resolves a bound unit's issue synchronously from the binding with no tracker call | [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] |
| 6 | **`t6`** Bind after the duplicate check and define the failure results | M | `t5` | integration: unit-issue-bind-failures.test.ts: two racing creates for one unit bind the lowest-numbered issue once, close the other as a duplicate, and keep the created issue when the duplicate check cannot list; integration: unit-issue-bind-failures.test.ts: a malformed binding makes ensureUnitIssueDetailed fail before creating anything and leaves the store read of that artifact failing until repaired; integration: unit-issue-bind-failures.test.ts: a bind that fails to write after the issue was created returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label | [[c2]] [[c4]] [[c5]] [[c6]] |
| 7 | **`t7`** Make the approve-time posts once-only with markers | L | `t1`, `t6` | unit: unit-extras.test.ts: runUnitExtras skips a kind already in the binding, reconciles a comment step through its marker without posting, reads the comment list once for several steps, fails a step when the list cannot be read, and reports a post whose record failed so the next run reconciles it; integration: tracker-posts-once.test.ts: the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice | [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |
| 8 | **`t8`** Run team mode and individual mode through one push path | L | `t7` | integration: tracker-push-modes.test.ts: the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding | [[c2]] [[c4]] [[c5]] [[c6]] [[c7]] |
| 9 | **`t9`** Add tracker.attach, the approve-time attach and the follow-on kind | M | `t4`, `t8` | integration: approve-attach.test.ts: approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed; integration: tracker-attach-followon.test.ts: the BUILD approval's follow-on attaches the build, review and test records that git reports clean and reports the dirty ones, and the daemon workflow.approve commits nothing; integration: tracker-attach-followon.test.ts: the design document, plan and build, review and test records are attached to the unit's issue with a link per revision | [[c1]] [[c2]] [[c4]] [[c5]] [[c6]] [[c7]] |
| 10 | **`t10`** Record the s9 and s7 hand-offs | S | `t9` | integration: s6-handoffs.test.ts: the plans document names each s6 hand-off to s7 and s9 and each carve-out this Story chose | [[c6]] [[c7]] |

### 1.1 E202610212f27754d:S006:T001 — Add listComments and attach to the tracker port and the GitHub adapter

Add the TrackerComment type, TrackerPort.listComments(issue, since?) and TrackerPort.attach(issue, artifact, link) to src/workflow/tracker/port.ts, two gh wrappers in src/workflow/tracker/github.ts (a paged read of an issue's comments in ascending time order with since, and a comment post that returns the comment id) and their binding in createGithubTracker. A failed gh is a classified failure, never an empty list; attach posts one comment that holds the link and names the artifact. Give every in-memory fake port a stub only where a test calls it.

**Acceptance checks:**
- listComments returns every comment of the issue in ascending time order across pages, passes since to gh, and fails with a classified kind when gh fails
- attach posts one comment holding the link and returns its id as externalId
- TrackerPort declares both methods and the project typechecks

### 1.2 E202610212f27754d:S006:T002 — Carry the envelope binding and attachments through a content write

Add carryBinding beside carryTracker in src/workflow/storage.ts and call it in the content branch of prepareArtifactWrite: for an existing artifact the meta.envelope.binding and meta.envelope.attachments on disk win over the caller's, and a first write keeps what the caller gave. The change moves no revision number and no content hash.

**Acceptance checks:**
- a content write of an existing artifact through the store keeps the on-disk binding and attachments whatever the caller's artifact carries
- a first write keeps the binding and attachments the caller gave
- the revision number and content hash are unchanged by the carry
- the existing storage and store write tests pass unchanged

### 1.3 E202610212f27754d:S006:T003 — Add the binding module with the staged-write check

Add src/workflow/tracker/binding.ts with readBinding, bindArtifact, recordPosted and setPendingLink as synchronous meta-only patches of meta.envelope.binding, each refusing while the artifact has a pending journal file (.insrc/journal/<id>.json); bindArtifact writes { reference: { entityId: issue, type: 'github:issue', relation: 'tracked-by' }, createdAtRevision, posted: [] }, is idempotent for the same issue and refuses a different one; record the module in ARTIFACT_WRITE_INVENTORY as a meta-only writer.

**Acceptance checks:**
- bindArtifact writes the typed binding with createdAtRevision and leaves the revision number and content hash unchanged, is idempotent for the same issue and refuses a different issue
- readBinding returns undefined for an unbound or missing artifact and reports a malformed binding
- recordPosted records a kind once and setPendingLink keeps a child ref or a child id and clears on undefined
- every writer refuses while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict; the test stages a write with the durable-kit store's journal (fail after stage), patches, then completes the staged write
- the write inventory has an entry for the module and its test passes

### 1.4 E202610212f27754d:S006:T004 — Add the attach module with commit-pinned links

Add src/workflow/tracker/attach.ts with the permalink (blob/<last commit that touched the file>/<path> on the repository's GitHub host) and attachDocuments(unit, port, targets, deps): refuse a dirty or untracked file, skip an Attachment already recorded for (target, revision), find a link already posted through listComments and record it without posting again, otherwise port.attach and record an Attachment { target, revision, at, externalId } on the head of the unit's own artifact; honour the staged-write check; record the module in ARTIFACT_WRITE_INVENTORY.

**Acceptance checks:**
- the link names the last commit that touched the rendered file and a new commit adds a new link while the old attachment stays
- a dirty or untracked file, an unbound unit and a failing tracker are reported in failed[] and nothing is posted or recorded for them
- a link found in listComments is recorded as reconciled and not posted again, and a recorded (target, revision) is skipped with no tracker call
- the write inventory has an entry for the module and its test passes

### 1.5 E202610212f27754d:S006:T005 — Move Epic and Story unit records onto the binding

Switch resolveUnitIssueLocal, recordUnit, the pending-link save and retry and isUnitSettled in src/workflow/tracker/unit-issue.ts from meta.tracker.units to the binding for an Epic or Story unit, behind one record accessor whose Task branch keeps the Plan record until s7. With no binding the older epicRef, storyRef or storyRefs is read as a one-way rebind source. Update the tests that seed units so the draft hook, the gate and the handoff check read the binding.

**Acceptance checks:**
- ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit keeps its record on the Plan
- a failed link under the parent is stored as the binding's pending link, retried by the next ensure and cleared once done and not retried again
- a pre-s6 head with only the old ref is rebound once from it with no new issue
- the draft hook, the gate and the handoff check read the binding and the tests that seed units (unit-issue, draft-issues, redraft-preserves-tracker, artifact-writer, gate-approve, pending, draft-issues-synthesize and the cli tests) are updated and pass

### 1.6 E202610212f27754d:S006:T006 — Bind after the duplicate check and define the failure results

In src/workflow/tracker/unit-issue.ts bind an issue this call creates only after the duplicate check, so tieBreak binds the lowest-numbered issue once and closes this call's own as a duplicate (keeping the created issue when the listing fails); a head that cannot be read (malformed binding, missing file) fails ensureUnitIssueDetailed before any lookup or create; a bind that fails to write after a create or adopt returns ok with the issue and leaves the unit unsettled, never a before-create failure.

**Acceptance checks:**
- two racing creates bind the lowest-numbered issue once and close the other as a duplicate, and keep the created issue when the duplicate check cannot list
- a malformed binding makes ensureUnitIssueDetailed fail before creating anything and the store read of that artifact keeps failing until repaired
- a bind that fails to write after the create returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label

### 1.7 E202610212f27754d:S006:T007 — Make the approve-time posts once-only with markers

Switch runUnitExtras to the binding's posted list for an Epic or Story unit, add marker?: string to ExtraStep and reconciled to ExtrasOutcome, put the marker '<!-- insrc:post:<artifactId>:<kind> -->' in the design, review and plan comment bodies built in src/workflow/tracker-auto.ts, and reconcile an unrecorded comment step through one listComments read shared by the unit's steps before posting; a failed list fails the step and posts nothing. Remove extrasDone from UnitIssue and update the extras tests.

**Acceptance checks:**
- a kind already in the binding is skipped and an unrecorded comment step whose marker is found is recorded as reconciled and not posted
- the comment list is read once for several steps, and a failed list fails the step with nothing posted
- a post whose record failed is reported and the next run reconciles it by its marker instead of repeating it
- extrasDone is gone from UnitIssue and the extras tests pass

### 1.8 E202610212f27754d:S006:T008 — Run team mode and individual mode through one push path

Remove legacyPushEpic, legacyPushStory, legacyPushTasks, pickMode's legacy branch and the createTracker test seam from src/workflow/tracker-auto.ts: autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan call the shared ensure, extras and binding path in both modes, individual mode keeping the pushTasks policy for Task issues and making no claim, and extrasFailed reported in both modes. Move the individual-mode cases of the tracker-auto, tracker-tasks and approve-fallback tests onto the shared path.

**Acceptance checks:**
- the three pushes bind the Epic or Story, post each comment once, retry a pending link and report extrasFailed the same way in team mode and in individual mode
- individual mode keeps its pushTasks policy (no Task issues when it is off) and makes no claim
- a repository with no tracker is skipped before anything is looked up and has no binding
- no production file or test references legacyPushEpic, legacyPushStory, legacyPushTasks or the createTracker seam, and the tracker-auto, tracker-tasks and approve-fallback tests pass

### 1.9 E202610212f27754d:S006:T009 — Add tracker.attach, the approve-time attach and the follow-on kind

Add the tracker.attach daemon method (resolve the unit's targets: HLD or LLD, plan and the Story's BUILD, CR and TESTS rendered files and diagram companions; call attachDocuments; commit nothing; return the outcome or { error }), call attachDocuments from the TUI approve() after commitApprovedArtifacts for the HLD, LLD and plan and commit the unit's head with the Attachment records in a second commit (skip with 'attachments skipped: the artifacts are not committed' when commitArtifacts is false), add the 'tracker-attach' kind to FollowOnOutcome and wire the BUILD approval's follow-on at both sites in src/daemon/index.ts.

**Acceptance checks:**
- approve() attaches the approved HLD, LLD and plan documents after its commit so the links name that commit, commits the attachment records in a second commit and skips with a stated reason when commitArtifacts is false
- tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed and returns { error } for a repository with no tracker or binding
- the BUILD approval's follow-on attaches the build, review and test records that git reports clean, reports the dirty ones and commits nothing
- the tracker-attach follow-on kind is wired at both follow-on sites and the existing follow-on tests pass

### 1.10 E202610212f27754d:S006:T010 — Record the s9 and s7 hand-offs

Add a section to docs/plans/core-data-model.md recording what s6 leaves: the Epic and Story bindings sit on the Define and the LLD until s9 moves each onto the Epic and Story artifact it creates and removes the epicRef, storyRef, storyRefs and taskRefs fallback and the renderers' use of them; the Task record accessor and the Plan record that s7 moves onto the Task artifact's binding; the binding bookkeeping carve-out from the change log; the cross-process lost-update window and its reconciliation; the pre-s6 comments without markers that may post once more; and the carryBinding rule.

**Acceptance checks:**
- the plans document has a section that names each hand-off: Epic and Story bindings to s9 with the fallback removal, the Task accessor and Plan record to s7, the change-log carve-out, the lost-update window with its recovery, the unmarked pre-s6 comments, and the carryBinding rule
- no code changes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| bindArtifact writes the typed binding with createdAtRevision, leaves the revision number and content hash unchanged, is idempotent for the same issue, refuses a different issue, and readBinding returns undefined for an unbound artifact | `t3` |
| recordPosted and setPendingLink record one entry per kind and a pending link that names a child ref or a child id, never twice, and without moving the revision | `t3` |
| attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again | `t4` |
| runUnitExtras skips a kind already in the binding, reconciles a comment step through its marker without posting, reads the comment list once for several steps, fails a step when the list cannot be read, and reports a post whose record failed so the next run reconciles it | `t7` |
| the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list | `t1` |
| ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit keeps its record on the Plan | `t5` |
| a failed link under the parent is stored as the binding's pending link, retried by the next ensure, cleared once done and not retried again | `t5` |
| a content write by the store keeps the binding and attachments on disk, a binding patch leaves the revision and content hash alone, and the team gate resolves a bound unit's issue synchronously with no tracker call | `t2`, `t5` |
| the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice, and the design document, plan and build, review and test records are attached to the unit's issue with a link per revision | `t7`, `t9` |
| two racing creates for one unit bind the lowest-numbered issue once, close the other as a duplicate, and keep the created issue when the duplicate check cannot list | `t6` |
| approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed | `t9` |
| the draft hook and the handoff check read the binding for an Epic or Story unit, and a pre-s6 head with only the old ref is rebound once from it with no new issue | `t5` |
| a malformed binding makes ensureUnitIssueDetailed fail before creating anything and leaves the store read of that artifact failing until repaired | `t6` |
| the BUILD approval's follow-on attaches the build, review and test records that git reports clean and reports the dirty ones, and the daemon workflow.approve commits nothing | `t9` |
| the write inventory lists the binding and attach writers as meta-only writers of meta.envelope and every production writer file still has an entry | `t3`, `t4` |
| a bind that fails to write after the issue was created returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label | `t6` |
| the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link and attaches the documents, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding | `t8`, `t9` |
| a binding, post or attachment patch is refused while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s6 contractDetails: TrackerPort.listComments and TrackerPort.attach`
- **[[c2]]** `prior-artifact` `LLD s6 contractDetails: readBinding, bindArtifact, recordPosted, setPendingLink, attachDocuments, runUnitExtras, ensureUnitIssueDetailed and the three approve-time pushes`
- **[[c3]]** `prior-artifact` `LLD s6 dataModelChanges: TrackerBinding, Attachment, TrackerComment, UnitIssue, ExtraStep and carryBinding`
- **[[c4]]** `prior-artifact` `LLD s6 errorPaths: error cases, edge cases and invariants to preserve`
- **[[c5]]** `prior-artifact` `LLD s6 testStrategy: test levels, subjects and acceptance mapping`
- **[[c6]]** `prior-artifact` `LLD s6 migration: the seven ordered steps and the backward compatibility note`
- **[[c7]]** `prior-artifact` `LLD s6 openQuestions: the seven resolved questions`
