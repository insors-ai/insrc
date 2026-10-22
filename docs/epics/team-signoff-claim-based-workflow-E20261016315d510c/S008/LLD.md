<!-- insrc:artifact LLD-315d510cb28100e2-s8 -->

# LLD: STORY-315d510cb28100e2-s8

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `6ec084af5823...`

When reviewers ask for changes, the claim holder revises the artifacts of that request, reviews and approves each again locally, and submits them again; the submission goes to the same pull request, so the reviewers keep one thread, and the new signoff covers only the revisions that were pushed. Because a request with changes requested sends all of its artifacts back together, every artifact that is to stay in it must be revised before it can be resubmitted. A request for changes made on an earlier push is not mistaken for one on the new push, and re-authoring an artifact keeps its Signoff history so the earlier request can be found; an identical re-author of an artifact in signoff changes nothing. Re-authoring an artifact that is in signoff (the design.epic and design.story runs) is allowed only for the holder, and a unit nobody holds must be claimed first; other writers of the same artifacts are not gated here. It builds on the s7 submission and adds two optional tracker additions and a careful rule in the content write; no lifecycle or record type changes.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

> See **HLD-315d510cb28100e2** § 2. Framework summary

**Rollout phase:** Phase D — signoff
**Consumes:** `sc3` (Per-unit tracker record and revision), `sc4` (Team gate, claim state, gate outcome, refusal error and completion hook), `sc5` (SignoffRecord)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-s1 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `openSignoff`

```typescript
openSignoff(repo: string, unit: UnitRef, artifactIds: readonly string[], deps?: SignoffDeps): Promise<PortResult<SignoffRequestRef>>
```

**Parameters:**
- `repo: string` — The repository path.
- `unit: UnitRef` — The Epic or Story unit that holds the artifacts.
- `artifactIds: readonly string[]` — The artifacts to submit; a revised artifact is submitted the same way as a first one.
- `deps: SignoffDeps` _(optional)_ — Test seams, as in s7.

**Returns:** `Promise<PortResult<SignoffRequestRef>>` — The request the artifacts are now recorded against: the earlier request when this was a revision of one that is still open, otherwise a new one.

**Errors:**
- `PortResult rejected` when Not the holder, nobody holds the issue, an artifact is not approved at its current revision (including one still in changes-requested because it was not revised) or its review is not of the current revision or not by the other party, the current branch is not the request's branch, or the chosen artifacts belong to different earlier requests.
- `PortResult failure kinds` when The tracker could not be loaded or read (missing-tool, missing-signin, unreachable, rejected); a failed read of the earlier request never falls back to opening a new one.

**Preconditions:**
- Team mode with signoff stages listed; the caller holds the unit's issue.
- Each artifact is approved at its current revision with a review of that revision by the other party.

**Postconditions:**
- The earlier request of an artifact is the one named by the LAST entry of signoffsOfMeta(meta) whatever its revision (signoffViewOf shows only the current revision, so it is not used for this).
- When that entry is open or changes-requested and readSignoffRequest says the request is still open, the artifact files are pushed to the request's branch, no second request is created and every artifact is recorded open-signoff with the same Reference at its current revision.
- When the earlier request is merged or closed, the tracker has no readSignoffRequest, or there is no earlier entry, a new request is opened as in s7.
- An entry of an earlier revision is never edited, so an earlier completion cannot cover the new revision.
- Every artifact of a request that had changes requested is in changes-requested and can rejoin only after a content change, a review and an approve; an artifact that was not revised is refused and may be left out of the submission, in which case it stays changes-requested under the old request.

### 2.2 `prerequisiteFailure`

```typescript
prerequisiteFailure(repo: string, unit: UnitRef, artifactId: string, stage: SignoffStage, meta: unknown, d: SignoffDeps): string | undefined
```

**Parameters:**
- `repo: string` — The repository path.
- `unit: UnitRef` — The unit that holds the artifact.
- `artifactId: string` — The artifact being checked.
- `stage: SignoffStage` — The artifact's signoff stage.
- `meta: unknown` — The head's stored meta, read through accessors.
- `d: SignoffDeps` — Test seams.

**Returns:** `string | undefined` — The reason the artifact cannot be submitted, or undefined when it can.

**Preconditions:**
- None.

**Postconditions:**
- For a DEF, HLD or LLD the review must exist, be by the other party and be of the head's current revision; before, only the first two were checked and the third was left to 'approve', which an override reason skips. A BUILD still uses the Story's code-review record.
- A head in changes-requested is refused with its status named and a hint that it must be revised (content changed, reviewed and approved again) or left out of the submission.

### 2.3 `readSignoffRequest`

```typescript
readSignoffRequest?(ref: SignoffRequestRef): PortResult<{ branch: string; open: boolean }>
```

**Parameters:**
- `ref: SignoffRequestRef` — The request whose head branch and openness are wanted.

**Returns:** `PortResult<{ branch: string; open: boolean }>` — The branch the request was opened from and whether it can still take pushes (open, not merged and not closed).

**Errors:**
- `PortResult failure kinds` when gh missing, not signed in, unreachable, or the request not found (rejected).

**Preconditions:**
- The ref is well formed (owner/repo#N).

**Postconditions:**
- Reads only; nothing is changed in the tracker.

### 2.4 `readSignoffState`

```typescript
readSignoffState(ref: SignoffRequestRef, since?: string): PortResult<'open' | 'changes-requested' | 'completed'>
```

**Parameters:**
- `ref: SignoffRequestRef` — The request to read.
- `since: string` _(optional)_ — ISO time the latest submission was recorded; a changes-requested decision counts only when made after it.

**Returns:** `PortResult<'open' | 'changes-requested' | 'completed'>` — completed when merged; changes-requested when closed unmerged, or when, among each reviewer's latest decisive review (APPROVED, CHANGES_REQUESTED or DISMISSED; COMMENTED ignored), one requests changes and was submitted after `since`; otherwise open.

**Errors:**
- `PortResult failure kinds` when gh missing, not signed in, unreachable, malformed ref or unreadable output (rejected).

**Preconditions:**
- The ref is well formed (owner/repo#N).

**Postconditions:**
- With no `since` the answer is as in s7.
- A lingering CHANGES_REQUESTED decision older than `since` does not make the request changes-requested, and a plain comment after it does not clear one made after `since`.

### 2.5 `settleSignoff`

```typescript
settleSignoff(repo: string, unit: UnitRef, deps?: SignoffDeps): Promise<readonly string[]>
```

**Parameters:**
- `repo: string` — The repository path.
- `unit: UnitRef` — The unit whose open requests are read.
- `deps: SignoffDeps` _(optional)_ — Test seams.

**Returns:** `Promise<readonly string[]>` — The problems met (unchanged from s7).

**Preconditions:**
- None.

**Postconditions:**
- For each open request it reads, it passes the `at` of the last Signoff entry of the waiting heads as `since`, so only a request for changes made after the latest submission is recorded.
- As in s7, a request with changes requested moves every waiting head of the request to changes-requested together.

### 2.6 `settleBeforeAuthor`

```typescript
settleBeforeAuthor(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>): Promise<void>
```

**Parameters:**
- `intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>` — The authoring run: its workflow, repo and params.

**Returns:** `Promise<void>` — Returns when signoff no longer blocks the stage the run follows; otherwise throws.

**Errors:**
- `TeamGateRefusedError` when blockedBySignoff still blocks the followed stage after settling its signoff.

**Preconditions:**
- Awaited before assertMayAuthor at every authoring entry (src/daemon/steps/workflow-step/phases/start.ts, src/daemon/workflow-rpc.ts).

**Postconditions:**
- Unchanged from s7: it settles the followed unit and refuses with the action 'author' and the workflow, whatever action assertMayAuthor later asks the gate. The upstream signoff block therefore still applies to a run that is a revise: a design.story run on an LLD whose HLD is no longer signed off is refused here before the gate is asked.

### 2.7 `assertMayAuthor`

```typescript
assertMayAuthor(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>): void
```

**Parameters:**
- `intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>` — The authoring run: its workflow, repo and params.

**Returns:** `void` — Returns when the run may change the stage; otherwise throws.

**Errors:**
- `TeamGateRefusedError` when The gate refuses the action (held by another user), or the artifact the run would write is in signoff and nobody holds the unit.

**Preconditions:**
- The run is a design.epic run (it writes the HLD) or a design.story run (it writes the LLD) on an existing unit.

**Postconditions:**
- When the artifact the run would write is in-signoff or changes-requested the gate is asked with 'revise', and when the gate allows it the entry reads the holder itself (teamContext and readHolder, both exported by the gate) and refuses with a claim-first outcome if nobody holds the unit; no claim is taken. Otherwise the gate is asked with 'author' as before. 'revise' only changes the claim handling: the upstream signoff block is enforced earlier by settleBeforeAuthor.
- Scope: this gates the authoring runs only. Other writers that change a DEF, HLD or LLD body with writeArtifact 'content' (resolveComment, appendStoryToDefine and any other caller outside the authoring runs) are not gated by this Story and are raised as an open question. A define run is not a claim unit (authorUnitOf gives it none), so DEF is not covered here; a plan run writes the PLAN, which is not a signoff stage.

### 2.8 `writeArtifact`

```typescript
writeArtifact(path: string, next: unknown, kind: WriteKind, opts?: { replaceUnreadable?: boolean }): number
```

**Parameters:**
- `path: string` — The artifact file.
- `next: unknown` — The next head; an object with a meta object.
- `kind: WriteKind` — 'content' or 'meta-only'.
- `opts: { replaceUnreadable?: boolean }` _(optional)_ — As today.

**Returns:** `number` — The revision the file carries.

**Errors:**
- `TypeError` when As today: next is not an object with a meta object.

**Preconditions:**
- None beyond today's.

**Postconditions:**
- On a content write whose prior head has at least one entry in meta.lifecycle.signoffs and whose next head has no lifecycle or a lifecycle with no signoffs: when the content CHANGED, the stored lifecycle is the default draft with the prior Signoff entries carried and the revision minted as today (approval and review are not carried); when the content is UNCHANGED and the next head has NO lifecycle, the prior lifecycle is kept exactly as it is (status, approval, review, Signoff entries) and no draft lifecycle is synthesized, so no illegal transition is attempted and no error is thrown.
- When the content is unchanged and the next head carries a lifecycle, behaviour is as today and is not changed here.
- A prior head with no Signoff entry is written exactly as today.

### 2.9 `signoffViewOf`

```typescript
signoffViewOf(meta: unknown): SignoffView
```

**Parameters:**
- `meta: unknown` — A head's meta.

**Returns:** `SignoffView` — The Signoff entry at the head's current revision, or none.

**Preconditions:**
- None.

**Postconditions:**
- Unchanged: for a revised, re-approved head it shows no signoff until it is submitted again, and then shows the new entry; the earlier request is read from signoffsOfMeta, not from this view.

## 3. Data model changes

### 3.1 `Signoff (meta.lifecycle.signoffs entry)` — invariant-change

No field changes. A request may now be named by more than one Signoff entry of the same artifact, one per submitted revision, newest last; an entry's `at` is the time that submission was recorded. An entry is never edited after its request is recorded signed-off or changes-requested, and signed-off and signoff-changes move only the last entry when it is open (lifecycle.ts:255-262), so a completion of revision n cannot cover revision n+1. A content write now carries the entries forward instead of resetting them.

**Call sites:**
- `src/workflow/artifact-core/lifecycle.ts:250-262`
- `src/workflow/team/signoff.ts:141-148`
- `src/workflow/storage.ts:175-266`

### 3.2 `meta.lifecycle on a content write` — invariant-change

Today a content write stores the next head's lifecycle (or none), so a re-authored artifact in signoff loses its Signoff history (no meta.lifecycle, or signoffs reset to []), and an unchanged re-author with a freshly synthesized lifecycle would throw. The write now keeps the prior history in two cases only: changed content with no next lifecycle (or one with no signoffs) stores the default draft with the prior Signoff entries; unchanged content with no next lifecycle keeps the prior lifecycle as it is. Approval and review are never carried through a change: a changed artifact is a draft that needs both again.

**Call sites:**
- `src/workflow/storage.ts:186-213`
- `src/workflow/storage.ts:245-266`
- `src/workflow/artifact-core/lifecycle.ts:156-172`
- `src/daemon/workflow-rpc.ts:332-347`

### 3.3 `TrackerPort` — field-add

Optional readSignoffRequest(ref) returning { branch, open }, and an optional `since` argument on readSignoffState. The GitHub adapter implements them with gh pr view --json headRefName,state and gh pr view --json state,mergedAt,reviews, and declares nothing new: the existing signoff-request capability covers both.

**Call sites:**
- `src/workflow/team/signoff.ts:432`
- `src/workflow/tracker/port.ts:100-120`
- `src/workflow/tracker/github-adapter.ts:176-195`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | Relies on content writes minting a new meta.revision and returning the artifact to draft, so a revised artifact must be reviewed and approved again at the new revision before openSignoff accepts it; and needs the content write to keep the prior Signoff history (changed content) and the whole prior lifecycle (unchanged content, no next lifecycle), which is one amendment to sc3 proposed in the error paths (the helper belongs to s4). Other content writers outside the authoring runs are not changed here. |
| `sc4` | consumes | Calls the existing 'revise' guarded action from the authoring runs (design.epic and design.story) on an artifact in signoff, and reads the holder through the gate's exported teamContext and readHolder to refuse an unassigned unit; 'revise' never takes a claim. The hook returns 'continue' for 'revise' (signoff.ts:311-313), so the upstream block comes from settleBeforeAuthor, which refuses with 'author' before the gate is asked. No outcome or hook type changes and no amendment to sc4 is needed. |
| `sc5` | consumes | Records the new Signoff entry through the s7 open-signoff path; the SignoffRecord derived from heads groups entries by request and revision, so a resubmitted request shows its latest revision. |

## 5. Error paths

**Error cases**

- **A revised artifact is submitted without being reviewed and approved again** (recoverable)
  - Detection: prerequisiteFailure finds the head is draft, or approved at an earlier revision than its current one, or without a review that exists, is by the other party and is of the current revision
  - Response: openSignoff returns a rejected result naming the artifact and what is missing; nothing is pushed
  - User impact: The holder is told to review and approve the revision first (ac36); an override-approved revision with a stale review is told to be reviewed again
- **An artifact of a request that had changes requested is submitted without having been revised** (recoverable)
  - Detection: prerequisiteFailure reads the head's lifecycle status as changes-requested (the status settleSignoff gave every waiting head of the request together) and refuses it, because open-signoff needs approved and the lifecycle table has no step out of changes-requested except a content change
  - Response: openSignoff returns a rejected result naming the artifact, its status changes-requested, and that it must be revised (content changed, reviewed and approved again) or left out of the submission; nothing is pushed or recorded for any artifact of the submission
  - User impact: The holder revises that artifact too, or resubmits without it; the stage it belongs to stays blocked until it is revised
- **Someone who does not hold the claim re-authors an artifact that is in signoff through the design.epic or design.story run** (recoverable)
  - Detection: assertMayAuthor finds the artifact in-signoff or changes-requested and asks the gate with 'revise'; the gate reads the assignee and it is another user
  - Response: TeamGateRefusedError with held-by-other and the holder; the authoring run does not start
  - User impact: The refusal names the holder (ac38, for the authoring runs)
- **A user tries to re-author an artifact in signoff on a unit nobody holds** (recoverable)
  - Detection: The gate allows 'revise' for an unassigned unit; assertMayAuthor then reads the holder through teamContext and readHolder and finds nobody
  - Response: TeamGateRefusedError with a refused outcome saying the unit must be claimed first; the claim is not taken
  - User impact: They claim the unit, then revise (ac38)
- **A run re-authors an artifact in signoff while the stage it follows is no longer signed off** (recoverable)
  - Detection: settleBeforeAuthor (awaited before assertMayAuthor at every authoring entry) calls settleForAttempt with 'author' and the workflow, and blockedBySignoff still blocks the followed stage, for example an HLD returned to draft or changes-requested after the LLD was submitted
  - Response: TeamGateRefusedError awaiting-signoff naming the request; the run does not reach assertMayAuthor, so the 'revise' choice cannot bypass the upstream block, which signoffCompletionHook does not check for 'revise'
  - User impact: The holder gets the upstream stage signed off first
- **The earlier request cannot be read from the tracker (offline, not signed in, request not found)** (recoverable)
  - Detection: readSignoffRequest returns a failed PortResult
  - Response: openSignoff returns that failure; it does not fall back to opening a new request, so the thread is never split by an outage
  - User impact: Submission is refused with the tracker's reason; retry when reachable
- **The current branch is not the branch the request was opened from** (recoverable)
  - Detection: The branch publishBranch returns differs from the branch readSignoffRequest reports
  - Response: openSignoff returns a rejected result naming both branches; nothing is recorded
  - User impact: The holder checks out the request's branch and submits again
- **The chosen artifacts name different earlier open requests** (recoverable)
  - Detection: More than one distinct request Reference among the last Signoff entries (any revision) that are open or changes-requested
  - Response: Rejected, asking for separate submissions, as for in-signoff heads in s7
  - User impact: Submit the artifacts separately
- **The push to the request branch succeeds but recording an artifact fails** (recoverable)
  - Detection: service.apply throws for an artifact
  - Response: The result names the artifact and the request; no new pull request exists. A repeat finds the earlier request again (still open) and records the rest
  - User impact: Submit again to finish
- **The tracker has no readSignoffRequest** (recoverable)
  - Detection: The port method is undefined
  - Response: A resubmission is treated as a first submission: a new request is opened as in s7, and openSignoffRequest reuses an open pull request on the branch
  - User impact: No worse than s7; the thread may be split on such a tracker
- **A changes-requested decision is stale: made on an earlier push** (recoverable)
  - Detection: readSignoffState is given `since` (the last Signoff entry's `at`) and each reviewer's latest decisive review that requests changes was submitted at or before it
  - Response: The request is read as open, not changes-requested; the head stays in-signoff and a later merge is recorded signed-off
  - User impact: A resubmission is not cancelled by feedback on the old push
- **A re-authored artifact in signoff loses its Signoff history** (recoverable)
  - Detection: writeArtifact reads the prior head's meta.lifecycle.signoffs and the next head's lifecycle is missing or has none
  - Response: For changed content the default draft lifecycle is stored with the prior entries carried, so the last entry still names the earlier request; without the carry, openSignoff finds no earlier entry and would open a second request
  - User impact: The revision goes to the same request
- **An identical re-author of an artifact in signoff would be routed through an illegal transition to draft** (recoverable)
  - Detection: writeArtifact finds the content unchanged (same hash as the prior head), a prior lifecycle with Signoff entries and a next head with no lifecycle; a synthesized draft would make reconcileLifecycle call assertLegalStatusChange(in-signoff or changes-requested, draft), which is not in the lifecycle table
  - Response: The prior lifecycle is kept exactly as it is and no draft is synthesized, so nothing throws and the status, approval, review and Signoff entries are untouched
  - User impact: Re-running a stage with identical output does not fail or move the artifact

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The reviewer merges the request while the author's revision is still a local draft | The head is not in-signoff so settle does not record it; the merged content is of an earlier revision and is not carried over. The artifact needs its own request at the new revision, and because the earlier request is merged a new one is opened |
| A resubmission whose earlier request was merged or closed | readSignoffRequest reports not open, so a new request is opened; the old Signoff entry is left as it is |
| A reviewer who asked for changes on the old push approves the new push | The latest decisive review of that reviewer is an approval, so the request is not changes-requested; it is recorded signed-off when merged |
| A reviewer requests changes after the latest submission and then leaves a plain comment | COMMENTED reviews are ignored, so the latest decisive review is still the request for changes made after `since`: the request is changes-requested and the head moves to changes-requested |
| A reviewer requested changes before the latest submission and has only commented since | The decisive review is older than `since`, so the request is open and the resubmission stands |
| A request of two artifacts that is still in-signoff, and only one is revised | The revised one is draft until approved again; the other stays in-signoff under the same request. Submitting the revised one alone records it against the same request |
| A request of two artifacts on which changes were requested, and the reviewers only objected to one of them | settleSignoff moved both to changes-requested together. The holder revises the objected one and also has to change the other before it can be resubmitted; if it is left out, it stays changes-requested under the old request and its stage stays blocked until it is revised. A changes-requested request means its artifacts change together or not at all |
| An artifact of a changes-requested request is re-authored with identical content | The write keeps the prior lifecycle as it is; the artifact stays changes-requested at the same revision and cannot be resubmitted until its content changes |
| A holder re-authors the stage while its artifact is in-signoff and the output changed | The gate is asked with 'revise' and allows the holder; the content write returns the artifact to draft at a new revision and keeps the Signoff entries, and the request stays open |
| A holder re-authors the stage while its artifact is in-signoff and the output is identical to the prior head | The write keeps the prior lifecycle as it is; the artifact stays in-signoff at the same revision and nothing throws |
| Another writer changes an artifact in signoff outside the authoring runs (resolveComment appends to body.openQuestions; appendStoryToDefine appends to the Define's stories) | Not gated by this Story: the content write returns the head to draft, whoever the caller is. It is raised as an open question and deferred; the Signoff entries survive the write through the sc3 carry |
| A re-authored artifact whose prior head has no Signoff entry | The content write behaves as today: nothing is carried and no lifecycle is created that the next head did not have |
| Unchanged content and a next head that carries a fresh draft lifecycle | Behaviour is as today and is not changed by this Story; the case is out of scope and unchanged |
| A define run | Not a claim unit (authorUnitOf gives it none), so no revise gate applies to a DEF. Re-running define on an existing Epic is an open question, not designed here |
| A solo repo or a repo with no policy | No gate call changes: assertMayAuthor returns before any tracker call and openSignoff is rejected as not using team signoff |

## 6. Test strategy

**Test framework:** `node:test run through tsx, co-located in __tests__ (npx tsx --test), with the s7 injected SignoffDeps world, the store-backed lifecycle kit, temporary files for writeArtifact and the fake gh through _setTrackerExecForTests`

**Test levels**

- **unit** — The decision between revising the same request and opening a new one, the prerequisite, branch and stale-decision checks, the review-revision check, the revise-together rule, the revise gate, the upstream block under a revise and the content-write rules for changed and unchanged content.
  - Subjects: `openSignoff resubmission: an earlier open or changes-requested request that is still open (read from the last Signoff entry of any revision), one merged or closed, none, tracker without readSignoffRequest, different earlier requests, branch mismatch, tracker read failure never opening a new request`, `prerequisiteFailure refuses a head whose review is of an earlier revision, including one approved with an override reason, and still accepts a review of the current revision`, `prerequisiteFailure refuses a head in changes-requested, names its status and says it must be revised or left out of the submission; openSignoff with one revised artifact and one unrevised artifact of a changes-requested request is refused as a whole and records nothing, and with the unrevised one left out is accepted for the revised one`, `assertMayAuthor action choice for design.epic and design.story over an artifact in-signoff, changes-requested and any other status, no gate call for a define run, and the claim-first refusal for an unassigned unit without taking the claim`, `a design.story run on an LLD that is in changes-requested whose HLD is no longer signed off is refused by settleBeforeAuthor before assertMayAuthor is reached, as a run under 'author' is`, `teamGate 'revise' by the holder and by another user`, `settleSignoff passes the last entry's `at` as `since` and records signoff-changes only for a request made after it`, `writeArtifact changed rewrite of an in-signoff head with no next lifecycle: the stored lifecycle is the default draft, the Signoff entries are carried, approval and review are not carried and the revision is minted`, `writeArtifact changed rewrite with a fresh draft lifecycle carrying no signoffs: the prior Signoff entries are carried; entries the next head carries are kept`, `writeArtifact identical rewrite of an in-signoff head with no next lifecycle: nothing throws and the lifecycle (status, approval, review, Signoff entries) is untouched`, `writeArtifact identical rewrite of a changes-requested head with no next lifecycle: nothing throws and the lifecycle is untouched, and the head is still refused for resubmission`, `writeArtifact over a prior head with no Signoff entry behaves exactly as today`
  - Fixtures: `SignoffDeps world from signoff.test.ts with readSignoffRequest, a current-branch answer and a readSignoffState that records its `since``, `heads in each lifecycle status with entries at two revisions`, `temporary artifact files for writeArtifact with an in-signoff and a changes-requested prior head`
- **contract** — The GitHub adapter's readSignoffRequest and the `since` argument of readSignoffState through a fake gh.
  - Subjects: `readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to { branch, open }; malformed ref and unreadable output are rejected; failure kinds map to port kinds`, `readSignoffState with `since`: a CHANGES_REQUESTED review at or before it is open, one after it is changes-requested, a reviewer's later approval clears an earlier request, a plain COMMENTED review after a request for changes does not clear it, a COMMENTED review after an old request for changes does not make it current, a closed unmerged request is changes-requested, and with no `since` the answer is as in s7`
  - Fixtures: `fake gh through _setTrackerExecForTests returning gh pr view JSON with reviews (author, state, submittedAt)`
- **integration** — The whole revision flow over the real gate, lifecycle and content write with an in-memory tracker.
  - Subjects: `changes requested on a request of two artifacts, both revised through writeArtifact with a freshly synthesized head, their Signoff entries survive, review and approve again, resubmit to the same request, settle records signed-off for the new revisions only`, `changes requested on a request of two artifacts and only one revised: the other stays changes-requested, the resubmission of both is refused and its stage stays blocked`, `a lingering changes-requested decision on the old push does not cancel the resubmission and a later merge is recorded`, `a non-holder and an unassigned user refused at the author entry for an artifact in signoff`, `a merged request is not carried over to a later revision`
  - Fixtures: `store-backed kit, in-memory tracker with readSignoffRequest and timed reviews, signoff-e2e world`
- **smoke** — A real pull request revised and merged on a sandbox repo.
  - Subjects: `Open a signoff pull request on a sandbox repo, push a revision to the same pull request, merge it, then start the next stage`
  - Fixtures: `a sandbox GitHub repo and a signed-in gh; reported by the builder, who with no second account cannot make a real changes-requested review (that part is covered by the contract and integration tests)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac36` | `openSignoff refuses a revised artifact that is draft, approved at an earlier revision, or reviewed at an earlier revision (including an override-approved one), and pushes nothing`, `openSignoff refuses an artifact of a changes-requested request that was not revised and accepts the revised ones when it is left out (unit)`, `revise flow: changes requested, re-author, review and approve again, submit again to the same request (integration)` |
| `ac37` | `openSignoff on a revision pushes to the request's branch, opens no second pull request and records a new Signoff entry with the same Reference (unit)`, `writeArtifact content write carries the prior Signoff entries so the earlier request is still found after a re-author, and an identical re-author of an in-signoff or changes-requested head keeps its lifecycle without throwing (unit)`, `readSignoffState with `since` ignores a changes-requested decision older than the latest submission and keeps one made after it through a later comment (contract)`, `settle records signed-off for the resubmitted revisions only; a merged request is not carried over to a later revision; a lingering old decision does not cancel the resubmission (integration)` |
| `ac38` | `assertMayAuthor asks 'revise' for an artifact in signoff, refuses a non-holder with held-by-other and an unassigned user with a claim-first refusal without taking the claim, for the design.epic and design.story runs (unit)`, `a design.story run whose followed stage is no longer signed off is refused by settleBeforeAuthor before the gate is asked (unit)`, `a non-holder and an unassigned user are refused at the author entry for an artifact in signoff (integration)` |

## 7. Alternatives considered

### 7.1 a1: Resubmit through openSignoff to the request the earlier Signoff entry names, with a stale-decision guard, a content write that keeps the Signoff history, revise-together for a changes-requested request, and a revise gate on the authoring runs — **CHOSEN**

A repeat submission of revised artifacts finds the request named by the last Signoff entry of their heads, pushes to that request's branch and records new open entries with the same Reference; a content write keeps the Signoff history; every artifact of a changes-requested request that stays in it must be revised and approved again; the authoring runs ask the gate with 'revise'; settle ignores a changes-requested decision older than the entry.

No new lifecycle operation: a content change already returns an artifact to draft at a new revision. The content write (writeArtifact, owned by s4 under sc3) keeps the prior head's lifecycle history the way it already keeps meta.tracker and meta.envelope, in two cases only. When the content CHANGED and the next head's lifecycle is missing or has none, the stored lifecycle is the default draft with the prior Signoff entries carried (approval and review are not carried). When the content is UNCHANGED and the next head has no lifecycle, the prior lifecycle is kept exactly as it is, so an identical re-author of an in-signoff or changes-requested head neither throws nor changes status. openSignoff then reads the LAST entry of signoffsOfMeta(meta) of each chosen head whatever its revision (signoffViewOf shows only the current revision). When that entry is open or changes-requested and the tracker's readSignoffRequest says the request is still open, the submission is a revision of that request: the files are committed and pushed to the request's branch (the current branch must be that branch) and open-signoff is recorded with the same Reference, which appends a new entry at the new revision. When the earlier request is merged or closed, or there is none, a new request is opened as in s7. When changes are requested, settleSignoff moves EVERY waiting head of the request to changes-requested together, and the lifecycle table has no step back from changes-requested except a content change, so every artifact that is to stay in that request must be revised (content changed), reviewed and approved again, and resubmitted with the others; an artifact re-authored with identical content stays changes-requested and prerequisiteFailure refuses it, naming that it must be revised or left out of the submission. An artifact left out stays changes-requested under the old request and its stage stays blocked until it is revised. prerequisiteFailure also requires the review's revision to equal the current revision. readSignoffState takes an optional `since` (the `at` of the last Signoff entry) and counts a changes-requested decision only when each reviewer's latest decisive review (APPROVED, CHANGES_REQUESTED or DISMISSED; COMMENTED ignored) is a request for changes submitted after `since`; a closed unmerged request stays changes-requested. The authoring runs (design.epic for the HLD, design.story for the LLD) ask the gate with 'revise' when their artifact is in-signoff or changes-requested; the entry itself refuses when nobody holds the unit. The upstream signoff block is unchanged: the entries await settleBeforeAuthor first, which settles the followed stage and refuses with the action 'author' whatever action assertMayAuthor then asks. The gate covers the authoring runs only; other writers of the same artifacts (resolveComment, appendStoryToDefine) are not gated by this Story and are raised as an open question. A define run is not a claim unit and is not covered.

### 7.2 a2: Keep the request reference outside the lifecycle

Record the request a unit's artifacts were submitted under in the unit's tracker record, so a re-author cannot lose it, and read it from there on a resubmission.

Store the request Reference for each stage in meta.tracker.units (or a new key beside it), written by openSignoff, which a content write already carries forward (carryTracker). A resubmission reads the Reference from there instead of from the Signoff entries, and the Signoff entries are recorded as in s7. No change to the content write. The 'revise' gate, the `since` guard, the review-revision check and the port read are as in a1.

**Rejected because:** Records one fact twice, changes the shape of meta.tracker that sc3 keeps as it is, and still resets the Signoff entries that display and the next-stage block read (partial on ac37, sc3 and sc5).

### 7.3 a3: An explicit lifecycle revise step, a separate reviseSignoff function and a gate on every content writer

Add a lifecycle operation that takes changes-requested back to draft or approved, a separate reviseSignoff that pushes to the existing request, and gate every writeArtifact content caller with 'revise'.

Add a 'revise' lifecycle operation (changes-requested back to draft) and a reviseSignoff(repo, unit, artifactIds) function next to openSignoff. It asks the gate with 'revise', requires each artifact approved at its current revision with a current review, pushes to the request's branch and records open-signoff against the same Reference. openSignoff refuses artifacts that already have an earlier request. This would also let an unchanged artifact rejoin without a content change. Every content writer of an artifact in signoff (the authoring runs, resolveComment, appendStoryToDefine and any other writeArtifact 'content' caller) would ask the gate with 'revise'. The history still has to survive a re-author, so the content write change is needed here too.

**Rejected because:** Would close every content writer and let an unchanged artifact rejoin, but changes the lifecycle table that this Story does not own (partial on k3 and sc3), touches write paths owned elsewhere and adds a second entry point; it still needs the content-write change. Its two advantages are kept as open questions.

### 7.4 a4: Open a new request and close the old one

A revision opens a fresh signoff request and closes the earlier one with a pointer to it.

openSignoff always opens a new request; when an earlier request exists for an artifact in changes-requested, the tracker closes it with a comment linking to the new one. No branch read, stale-decision guard or Signoff history is needed because each request is its own pull request.

**Rejected because:** A new request per revision loses the single review thread ac37 requires and strands an approval on the old pull request.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: lifecycle behaviour when an artifact is changed after a request opens (src/workflow/artifact-core/lifecycle.ts:38-52, 156-172, 228-262)`
- **[[c2]]** `analyze-bundle` `s1: what a content write of a re-authored artifact keeps of the prior head, changed and unchanged (src/workflow/storage.ts:175-266, 186-213; src/daemon/workflow-rpc.ts:332-347)`
- **[[c3]]** `analyze-bundle` `s1: how s7 opens, reads and settles a signoff request (src/workflow/team/signoff.ts:141-148, 397-420, 432, 540, 593-598; src/workflow/tracker/github-adapter.ts:176-195; src/workflow/tracker/port.ts:100-120)`
- **[[c4]]** `analyze-bundle` `s1: where the 'revise' guarded action and the claim holder rule are used, and what the hook does for it (src/workflow/team/gate.ts:30,121-139,208-232,277-280; src/workflow/team/signoff.ts:311-313; src/workflow/team/author-gate.ts:25-50)`
- **[[c5]]** `analyze-bundle` `s1: how the authoring entries order the signoff settle and the team gate (src/daemon/steps/workflow-step/phases/start.ts:61-62; src/daemon/workflow-rpc.ts:183-184, 343, 484-485)`
- **[[c6]]** `analyze-bundle` `s1: other writers that change a stage artifact's content outside the authoring runs (src/workflow/resolve-comment.ts:248-251; src/daemon/index.ts:739-745; src/workflow/gates.ts:209-220)`
- **[[c7]]** `step-output` `s3 alternatives.judge: winner a1`
- **[[c8]]** `stakeholder` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md: sc3, sc4, sc5 consumed by s8`
- **[[c9]]** `prior-artifact` `LLD-315d510cb28100e2-s8 daemon review rounds (block): revise for an unassigned unit, define not a claim unit, stale CHANGES_REQUESTED, signoffViewOf current-revision filter, prerequisiteFailure review revision, COMMENTED reviews, the Signoff history lost on a re-author (confirmed by running writeArtifact), the unchanged-content case, the changes-requested resubmission rule, the scope of the revise gate and the upstream block under a revise`

## 9. Open questions

- Re-running define on an existing Epic is not a claim unit, so a DEF in signoff is not gated against changes by non-holders; should define on an existing Epic be gated, and if so with which unit?
- The lifecycle table has no way back from changes-requested for an unchanged artifact, so an artifact the reviewers did not object to must still change before it can rejoin a changes-requested request; should the common artifact model allow open-signoff also from changes-requested at an unchanged approved revision? The table belongs to the common artifact model, not to this Story, so it is not designed here.
- Writers other than the authoring runs also change a DEF, HLD or LLD body without a team gate: resolveComment (src/workflow/resolve-comment.ts:248-251, reached from the workflow.resolveComment handler at src/daemon/index.ts:739-745) and appendStoryToDefine (src/workflow/gates.ts:209-220). A content change returns the artifact to draft, so a non-holder can move an artifact in signoff to draft through them. Should every content writer of an artifact in signoff or changes-requested ask the gate with 'revise'? This Story gates the authoring runs only; gating the other writers is deferred to a follow-up.

## Resolved questions

- `q3aaa4bf0` — The lifecycle table has no way back from changes-requested for an unchanged artifact, so an artifact the reviewers did not object to must still change before it can rejoin a changes-requested request; should the common artifact model allow open-signoff also from changes-requested at an unchanged approved revision? The table belongs to the common artifact model, not to this Story, so it is not designed here.
  - **resolved**: Allow re-signoff at unchanged revision — Decided by the user: handle the model change now, in s8, to avoid extra work later. Add a lifecycle step so open-signoff is also allowed from changes-requested when the artifact's approval and other-party review are still of its current revision (unchanged content); prerequisiteFailure and openSignoff accept such a head; the revise-together rule then no longer applies, because an artifact nobody objected to rejoins the request unchanged. Includes the lifecycle.ts table change, its tests, and the changes to the s8 tests that assumed an unchanged changes-requested artifact is refused. _(2026-10-22T20:24:58.121Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1: lifecycle behaviour when an artifact is changed after a request opens (src/workflow/artifact-core/lifecycle.ts:38-52, 156-172, 228-262)`
- **[[c2]]** `analyze-bundle` `s1: what a content write of a re-authored artifact keeps of the prior head, changed and unchanged (src/workflow/storage.ts:175-266, 186-213; src/daemon/workflow-rpc.ts:332-347)`
- **[[c3]]** `analyze-bundle` `s1: how s7 opens, reads and settles a signoff request (src/workflow/team/signoff.ts:141-148, 397-420, 432, 540, 593-598; src/workflow/tracker/github-adapter.ts:176-195; src/workflow/tracker/port.ts:100-120)`
- **[[c4]]** `analyze-bundle` `s1: where the 'revise' guarded action and the claim holder rule are used, and what the hook does for it (src/workflow/team/gate.ts:30,121-139,208-232,277-280; src/workflow/team/signoff.ts:311-313; src/workflow/team/author-gate.ts:25-50)`
- **[[c5]]** `analyze-bundle` `s1: how the authoring entries order the signoff settle and the team gate (src/daemon/steps/workflow-step/phases/start.ts:61-62; src/daemon/workflow-rpc.ts:183-184, 343, 484-485)`
- **[[c6]]** `analyze-bundle` `s1: other writers that change a stage artifact's content outside the authoring runs (src/workflow/resolve-comment.ts:248-251; src/daemon/index.ts:739-745; src/workflow/gates.ts:209-220)`
- **[[c7]]** `step-output` `s3 alternatives.judge: winner a1`
- **[[c8]]** `stakeholder` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md: sc3, sc4, sc5 consumed by s8`
- **[[c9]]** `prior-artifact` `LLD-315d510cb28100e2-s8 daemon review rounds (block): revise for an unassigned unit, define not a claim unit, stale CHANGES_REQUESTED, signoffViewOf current-revision filter, prerequisiteFailure review revision, COMMENTED reviews, the Signoff history lost on a re-author (confirmed by running writeArtifact), the unchanged-content case, the changes-requested resubmission rule, the scope of the revise gate and the upstream block under a revise`
