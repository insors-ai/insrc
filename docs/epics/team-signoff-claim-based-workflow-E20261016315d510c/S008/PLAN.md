<!-- insrc:artifact PLAN-315d510cb28100e2-s8 -->

# Plan: STORY-315d510cb28100e2-s8

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1792693404411-z8469p`
**LLD effective hash:** `6ec084af5823...`

Building s8 is nine tasks on top of the s7 signoff code: one lifecycle table step so a changes-requested artifact can rejoin unchanged, the optional port reads and their GitHub implementation, the content-write rule that keeps the Signoff history, the stricter submission prerequisites, then the resubmission itself in two steps (deciding which earlier request, then pushing to it), the settle `since` guard, the revise gate on the authoring runs, and an end-to-end test plus a sandbox smoke test. The deferred items (gating `define` on an existing Epic and the other content writers) are not in this plan.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Let open-signoff run from changes-requested at an unchanged approved revision | S | — | — | unit: src/workflow/artifact-core/__tests__/lifecycle-resignoff.test.ts: open-signoff from changes-requested appends a Signoff entry at the current revision and moves to in-signoff, and every other operation from changes-requested is as before | [[c1]] [[c6]] |
| 2 | **`t2`** Port additions and the GitHub adapter: readSignoffRequest and readSignoffState(since) | M | — | — | unit: src/workflow/tracker/__tests__/github-signoff-revise.test.ts: readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to a branch and openness, and rejects a malformed ref and unreadable output; unit: src/workflow/tracker/__tests__/github-signoff-revise.test.ts: readSignoffState with since uses each reviewer's latest decisive review and answers as in s7 without since | [[c5]] [[c6]] |
| 3 | **`t3`** Content write keeps the Signoff history | M | — | — | unit: src/workflow/__tests__/storage-signoff-history.test.ts: a changed content write keeps the prior Signoff entries and carries neither approval nor review, whether the next head has no lifecycle or a fresh draft one; unit: src/workflow/__tests__/storage-signoff-history.test.ts: an identical content write of an in-signoff or changes-requested head with no next lifecycle neither throws nor changes its lifecycle, and a prior head with no Signoff entry is written as before | [[c2]] [[c6]] |
| 4 | **`t4`** Submission prerequisites: review of the current revision and a changes-requested head | S | — | `t1` | unit: src/workflow/team/__tests__/signoff-revise.test.ts: prerequisiteFailure refuses a stale review including an override-approved one, accepts a changes-requested head whose approval and review are current, and refuses one whose approval is behind | [[c1]] [[c3]] [[c6]] |
| 5 | **`t5`** Find the earlier request of the chosen artifacts | M | — | `t2`, `t3`, `t4` | unit: src/workflow/team/__tests__/signoff-revise.test.ts: the earlier request is read from the last Signoff entry of any revision, a failed read never opens a new request, and a merged or closed request, a port without readSignoffRequest and no earlier entry each open a new one; unit: src/workflow/team/__tests__/signoff-revise.test.ts: artifacts naming different earlier open requests are refused as a whole | [[c3]] [[c5]] [[c6]] |
| 6 | **`t6`** Resubmit to the earlier request | M | — | `t5` | unit: src/workflow/team/__tests__/signoff-revise.test.ts: a resubmission pushes to the request's branch, opens no second request and records new Signoff entries with the same Reference, a branch mismatch records nothing, and a repeat finishes the rest; unit: src/workflow/team/__tests__/signoff-revise.test.ts: a changes-requested request resubmitted with one revised and one unchanged artifact goes to the same request | [[c3]] [[c5]] [[c6]] |
| 7 | **`t7`** settleSignoff passes the last submission time as since | S | — | `t2` | unit: src/workflow/team/__tests__/signoff-revise.test.ts: settleSignoff passes the last entry's at as since and records signoff-changes only for a request made after it | [[c3]] [[c5]] |
| 8 | **`t8`** The revise gate on the design.epic and design.story runs | M | — | — | unit: src/workflow/team/__tests__/author-gate-revise.test.ts: assertMayAuthor asks 'revise' for an HLD or LLD in signoff, refuses a non-holder and an unassigned unit without taking the claim, and asks 'author' for any other status, a define run and a plan run; unit: src/workflow/team/__tests__/author-gate-revise.test.ts: a design.story run on an LLD in changes-requested whose HLD is no longer signed off is refused by settleBeforeAuthor before assertMayAuthor | [[c4]] [[c6]] |
| 9 | **`t9`** End-to-end revision flow and the sandbox smoke test | M | — | `t6`, `t7`, `t8` | integration: src/workflow/team/__tests__/signoff-revise-e2e.test.ts: changes requested on a two-artifact request, both re-authored through writeArtifact or one left unchanged, approved again and resubmitted to the same request, settled signed-off for the new revisions only, a lingering old decision not cancelling it, a merged request not carried over, and a non-holder and an unassigned user refused; smoke: Open a signoff pull request on a sandbox repo, push a revision to the same pull request, merge it, then start the next stage | [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-315d510cb28100e2-s8-t1 — Let open-signoff run from changes-requested at an unchanged approved revision

Add the lifecycle table step so 'open-signoff' is also legal from changes-requested (the user's decision to handle the model change now), keep the reducer stamping the current revision and appending a new Signoff entry, and make sure the status mirrors, decoders and transition checks accept it. A changes-requested head whose approval is of its current revision can then be submitted again without a content change.

**Acceptance checks:**
- LIFECYCLE_TABLE lists changes-requested as a source status of open-signoff and no other step changes
- open-signoff from changes-requested appends a new Signoff entry at the current revision with the request Reference and moves the status to in-signoff
- assertLegalStatusChange accepts changes-requested to in-signoff only through open-signoff
- every other operation from changes-requested is as before

### 1.2 TASK-315d510cb28100e2-s8-t2 — Port additions and the GitHub adapter: readSignoffRequest and readSignoffState(since)

Add the optional readSignoffRequest(ref) -> { branch, open } and the optional `since` argument on readSignoffState to the tracker port (the sc1 amendment AMD-27), and implement both in the GitHub adapter: readSignoffRequest through gh pr view --json headRefName,state, and readSignoffState with since through gh pr view --json state,mergedAt,reviews using each reviewer's latest decisive review (APPROVED, CHANGES_REQUESTED or DISMISSED; COMMENTED ignored) made after since; a closed unmerged request stays changes-requested; with no since the answer is as in s7.

**Acceptance checks:**
- The port declares readSignoffRequest as optional and readSignoffState with an optional since, and a tracker without them still type-checks
- readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to { branch, open } and rejects a malformed ref and unreadable output with the port failure kinds
- readSignoffState with since treats a CHANGES_REQUESTED review at or before since as open, one after as changes-requested, a later approval as clearing it, and a COMMENTED review as neither clearing nor creating it
- readSignoffState without since returns exactly what s7 returned

### 1.3 TASK-315d510cb28100e2-s8-t3 — Content write keeps the Signoff history

Make writeArtifact's content write keep the prior head's meta.lifecycle.signoffs when the prior head has at least one entry and the next head has no lifecycle or one with no signoffs: changed content stores the default draft with the prior entries carried (approval and review not carried), unchanged content with no next lifecycle keeps the whole prior lifecycle and synthesizes no draft (the sc3 amendment AMD-28). Anything else is written as today.

**Acceptance checks:**
- A changed rewrite of an in-signoff head with no next lifecycle stores a draft lifecycle with the prior Signoff entries, no approval and no review, and a minted revision
- A changed rewrite whose next lifecycle is a fresh draft with no signoffs keeps the prior entries and keeps entries the next head carries
- An identical rewrite of an in-signoff or changes-requested head with no next lifecycle does not throw and leaves status, approval, review and Signoff entries untouched
- A prior head with no Signoff entry is written exactly as before, and a next head with a fresh draft lifecycle and unchanged content behaves as before

### 1.4 TASK-315d510cb28100e2-s8-t4 — Submission prerequisites: review of the current revision and a changes-requested head

Change prerequisiteFailure so a DEF, HLD or LLD needs a review that exists, is by the other party and is of the head's current revision (an override-approved revision with a stale review is refused), and so a head in changes-requested is accepted for submission when its approval and review are of the current revision (the new lifecycle step) and refused, naming its status, when they are not. A BUILD still uses the Story's code-review record.

**Acceptance checks:**
- A head whose review is of an earlier revision is refused, including one approved with an override reason, and a review of the current revision is accepted
- A changes-requested head whose approval and review are of its current revision is accepted
- A changes-requested head whose approval revision is behind its current revision (built directly in the test fixture, since a content write of a changes-requested head returns it to draft) is refused with its status and a hint to review and approve it again
- The BUILD rule and every s7 refusal text that is not changed here are as before

### 1.5 TASK-315d510cb28100e2-s8-t5 — Find the earlier request of the chosen artifacts

Make openSignoff decide, before it publishes anything, which earlier request the chosen artifacts belong to: read the LAST entry of signoffsOfMeta of each head whatever its revision; when it is open or changes-requested ask readSignoffRequest whether that request is still open; refuse artifacts that name different earlier requests; never fall back to a new request when the read itself fails; and fall back to opening a new request, as in s7, when the earlier request is merged or closed, the port has no readSignoffRequest, or there is no earlier entry. This task only decides; it does not push or record.

**Acceptance checks:**
- The earlier request is taken from the last Signoff entry of any revision, not from signoffViewOf
- A failed read of the earlier request returns that failure and opens no new request
- A merged or closed earlier request, a port without readSignoffRequest and a head with no earlier entry each lead to a new request as in s7
- Artifacts naming different earlier open requests are refused as a whole, asking for separate submissions

### 1.6 TASK-315d510cb28100e2-s8-t6 — Resubmit to the earlier request

Act on the decision of t5: when the earlier request is still open, publish the artifact files to that request's branch (the current branch must be it), open no second request and record open-signoff on every artifact with the same Reference at its current revision; a current branch that is not the request's branch is refused naming both branches and records nothing; a repeat after a partial recording finds the earlier request again and records the rest. A changes-requested request resubmitted with every artifact approved again, or with an unchanged artifact whose approval and review are current, goes to the same request.

**Acceptance checks:**
- A revision of artifacts whose earlier request is still open pushes to that request's branch, creates no second request and records new Signoff entries with the same Reference at the current revisions
- A current branch that is not the request's branch is refused naming both branches and nothing is recorded
- A repeat after a failed recording of one artifact records the rest against the same request and opens no pull request
- A changes-requested request resubmitted with a revised artifact and an unchanged artifact whose approval and review are current goes to the same request

### 1.7 TASK-315d510cb28100e2-s8-t7 — settleSignoff passes the last submission time as since

Make settleSignoff pass the `at` of the last Signoff entry of the waiting heads as `since` to readSignoffState, so only a request for changes made after the latest submission is recorded; keep recording signed-off and signoff-changes on every waiting head together, and the problems it returns, as in s7.

**Acceptance checks:**
- readSignoffState is called with the last entry's at as since for each request it reads
- A stale changes-requested decision made before the latest submission leaves the heads in-signoff and a later merge is recorded signed-off
- A request for changes made after the latest submission still moves every waiting head to changes-requested together
- The returned problems and the claim release and completion behaviour are as in s7

### 1.8 TASK-315d510cb28100e2-s8-t8 — The revise gate on the design.epic and design.story runs

Make assertMayAuthor ask the gate with 'revise' instead of 'author' when the artifact the run writes (the HLD for design.epic, the LLD for design.story) is in-signoff or changes-requested, and, when the gate allows it, read the holder through teamContext and readHolder and refuse an unassigned unit with a claim-first outcome without taking the claim. A define run and a plan run are not covered. The upstream signoff block stays with settleBeforeAuthor.

**Acceptance checks:**
- A non-holder re-authoring an HLD or LLD in-signoff or changes-requested is refused with held-by-other naming the holder
- An unassigned unit is refused with a claim-first outcome and no claim is taken
- The holder is allowed, and an artifact in any other status is asked with 'author' as before
- A design.story run on an LLD in changes-requested whose HLD is no longer signed off is refused by settleBeforeAuthor before the gate is asked
- A define run and a plan run reach no revise gate, and a repo with no policy makes no tracker call

### 1.9 TASK-315d510cb28100e2-s8-t9 — End-to-end revision flow and the sandbox smoke test

Prove the whole flow through the real gate, lifecycle and content write with an in-memory tracker that has readSignoffRequest and timed reviews: changes requested on a two-artifact request, re-author through writeArtifact with a freshly synthesized head, review and approve again, resubmit to the same request, settle records signed-off for the new revisions only, an unchanged artifact rejoining, a merged request not carried over, and a non-holder and an unassigned user refused; and record the sandbox GitHub smoke test as reported by the builder.

**Acceptance checks:**
- Both artifacts of a changes-requested request, one revised and one unchanged, are resubmitted to the same request and settle records them signed-off together for their current revisions only
- A lingering old request for changes does not cancel the resubmission and a later merge is recorded
- A merged request is not carried over to a later revision, which gets its own request
- A non-holder and an unassigned user are refused at the author entry for an artifact in signoff
- The smoke test result is recorded as reported, not run by the gate

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| openSignoff resubmission: an earlier open or changes-requested request that is still open (read from the last Signoff entry of any revision), one merged or closed, none, tracker without readSignoffRequest, different earlier requests, branch mismatch, tracker read failure never opening a new request | `t5`, `t6` |
| prerequisiteFailure refuses a head whose review is of an earlier revision, including one approved with an override reason, and still accepts a review of the current revision | `t4` |
| prerequisiteFailure refuses a head in changes-requested, names its status and says it must be revised or left out of the submission; openSignoff with one revised artifact and one unrevised artifact of a changes-requested request is refused as a whole and records nothing, and with the unrevised one left out is accepted for the revised one | `t4`, `t6` |
| assertMayAuthor action choice for design.epic and design.story over an artifact in-signoff, changes-requested and any other status, no gate call for a define run, and the claim-first refusal for an unassigned unit without taking the claim | `t8` |
| a design.story run on an LLD that is in changes-requested whose HLD is no longer signed off is refused by settleBeforeAuthor before assertMayAuthor is reached, as a run under 'author' is | `t8` |
| teamGate 'revise' by the holder and by another user | `t8` |
| settleSignoff passes the last entry's `at` as `since` and records signoff-changes only for a request made after it | `t7` |
| writeArtifact changed rewrite of an in-signoff head with no next lifecycle: the stored lifecycle is the default draft, the Signoff entries are carried, approval and review are not carried and the revision is minted | `t3` |
| writeArtifact changed rewrite with a fresh draft lifecycle carrying no signoffs: the prior Signoff entries are carried; entries the next head carries are kept | `t3` |
| writeArtifact identical rewrite of an in-signoff head with no next lifecycle: nothing throws and the lifecycle (status, approval, review, Signoff entries) is untouched | `t3` |
| writeArtifact identical rewrite of a changes-requested head with no next lifecycle: nothing throws and the lifecycle is untouched, and the head is still refused for resubmission | `t3`, `t4` |
| writeArtifact over a prior head with no Signoff entry behaves exactly as today | `t3` |
| readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to { branch, open }; malformed ref and unreadable output are rejected; failure kinds map to port kinds | `t2` |
| readSignoffState with `since`: a CHANGES_REQUESTED review at or before it is open, one after it is changes-requested, a reviewer's later approval clears an earlier request, a plain COMMENTED review after a request for changes does not clear it, a COMMENTED review after an old request for changes does not make it current, a closed unmerged request is changes-requested, and with no `since` the answer is as in s7 | `t2` |
| changes requested on a request of two artifacts, both revised through writeArtifact with a freshly synthesized head, their Signoff entries survive, review and approve again, resubmit to the same request, settle records signed-off for the new revisions only | `t9` |
| changes requested on a request of two artifacts and only one revised: the other stays changes-requested, the resubmission of both is refused and its stage stays blocked | `t9` |
| a lingering changes-requested decision on the old push does not cancel the resubmission and a later merge is recorded | `t9` |
| a non-holder and an unassigned user refused at the author entry for an artifact in signoff | `t9`, `t8` |
| a merged request is not carried over to a later revision | `t9` |
| Open a signoff pull request on a sandbox repo, push a revision to the same pull request, merge it, then start the next stage | `t9` |

## 3. References

- **[[c1]]** `analyze-bundle` `s1: the lifecycle table and the open-signoff step (src/workflow/artifact-core/lifecycle.ts:38-52, 228-262; src/workflow/artifact-core/types.ts; src/workflow/artifact-core/decode.ts)`
- **[[c2]]** `analyze-bundle` `s1: the content write and the Signoff history (src/workflow/storage.ts:175-266)`
- **[[c3]]** `analyze-bundle` `s1: the s7 submission, prerequisites and settle code s8 extends (src/workflow/team/signoff.ts)`
- **[[c4]]** `analyze-bundle` `s1: the authoring entries and the gate (src/workflow/team/author-gate.ts; src/workflow/team/gate.ts:208-232; src/daemon/steps/workflow-step/phases/start.ts:61-62; src/daemon/workflow-rpc.ts:183-184)`
- **[[c5]]** `analyze-bundle` `s1: the tracker port and the GitHub adapter (src/workflow/tracker/port.ts:100-120; src/workflow/tracker/github-adapter.ts:145-200)`
- **[[c6]]** `prior-artifact` `LLD-315d510cb28100e2-s8 (approved) with AMD-315d510cb28100e2-27 and AMD-315d510cb28100e2-28, and the user's decisions recorded in docs/plans/team-workflow.md#s8-lld-approval-and-decisions-on-its-open-questions-2026-10-23: the lifecycle step is built in s8, and gating define and the other content writers is deferred`
