<!-- insrc:artifact PLAN-315d510cb28100e2-s7 -->

# Plan: STORY-315d510cb28100e2-s7

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1792683553239-39ffrv`
**LLD effective hash:** `0e84c94e4340...`

Building s7 starts with the pure signoff decisions and the hook signature, then holds Story and Epic completion inside the completion walk, adds the GitHub pull-request request, and only then the submit and settle steps that use all of them. The entry wiring, the team settle command, the display surfaces and the end-to-end and smoke tests close the work. Each task is proved by new test files that run on injected policy, tracker and lifecycle, and the real GitHub request is confirmed once against a sandbox repository.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pure signoff decisions and the request Reference mapping | M | — | — | unit: src/workflow/team/__tests__/signoff.test.ts: signoffRecordsOf derives sc5 records from lifecycle facts, groups by the ref read from entityId, and grandfathers by the shared rule; unit: src/workflow/team/__tests__/signoff-hook.test.ts: isSignedOffOrGrandfathered counts a signed-off head, counts a head approved before the anchor only when anchorKnown is true, and never grandfathers when anchorKnown is false; unit: src/workflow/team/__tests__/signoff-hook.test.ts: followedStageOf maps author design.epic to DEF on the epic, author design.story to HLD on the epic, author plan and build to LLD on the story, and anything else to null | [[c1]] [[c2]] |
| 2 | **`t2`** The read-only decision, the completion hook and its registration | M | — | `t1` | unit: src/workflow/team/__tests__/signoff-hook.test.ts: blockedBySignoff and signoffCompletionHook on one story unit block design.story authoring on the HLD's open request and plan authoring on the LLD's open request, but not the LLD's own authoring, skip a grandfathered head, return awaiting-signoff, a changes-requested refusal, an unsettled-completed refusal, or continue, never write, and need no tracker call; unit: src/workflow/team/__tests__/signoff-hold.test.ts: signoffHoldsCompletion is true for a Story whose listed LLD or BUILD is not signed off and for an Epic whose listed DEF or HLD is not, false for a grandfathered pre-anchor member when anchorKnown is true, true for it when anchorKnown is false, and false outside team mode, with no policy, or with no member stage listed; unit: src/workflow/team/__tests__/signoff-registration.test.ts: consultHook passes the action and the authoring workflow to the hook and an older three-argument hook still works | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Hold completion inside the completion walk | M | — | `t2` | unit: src/workflow/artifact-core/__tests__/completion-holds.test.ts: completeIfRolledUp with a holds predicate stops the walk at a held Story so the Epic is not completed, completes an unheld Story and then stops at a held Epic, and with no predicate behaves as before; unit: src/workflow/__tests__/signoff-hold.test.ts: completeThroughService leaves a Story approved-not-completed while its listed BUILD awaits signoff | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** GitHub signoff request and state | L | — | `t1` | unit: src/workflow/tracker/__tests__/github-signoff.test.ts: loadTracker accepts signoff-request once declared; openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url; readSignoffState maps review decision and merge state to open, changes-requested and completed; failure kinds map to PortResult kinds | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Submit artifacts for signoff | M | — | `t2`, `t4` | unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses a missing approval, a missing or author-written review for DEF, HLD and LLD, a stage the policy does not list, and a submitter who is not the holder; unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses an unassigned unit saying it must be claimed first; unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD checks the Story's code-review record (missing, written by the author, or blocking is refused; pass or warn by the other party is accepted) and never the lifecycle review; unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD reads the holder of the Story's issue and links the request from it even when claimUnits puts BUILD on task units, and settleSignoff for a story unit selects LLD and BUILD while an epic unit selects DEF and HLD; unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff opens one request, records open-signoff on every artifact with the Reference { entityId: ref, type: signoff-request, relation: tracked-by }, and finds the open request on a repeat after a partial recording | [[c1]] [[c3]] [[c4]] |
| 6 | **`t6`** Settle requests and refuse at the entry | M | — | `t3`, `t5` | unit: src/workflow/team/__tests__/signoff.test.ts: settleSignoff records signed-off on all artifacts of a completed request, clears the assignee of the unit issue, records signoff-changes on changes-requested, leaves the rest on a part-way failure, skips a Signoff whose Reference is not a signoff-request, and is idempotent across two clones; unit: src/workflow/team/__tests__/signoff-hook.test.ts: settleForAttempt refuses a first design.story turn on a story whose issue could not be created while the HLD awaits signoff, before teamGate's allowFirstAuthor exception is reached; unit: src/workflow/__tests__/signoff-hold.test.ts: settleSignoff completes the Story and its Epic once signed-off is recorded, with the members cascaded | [[c1]] [[c4]] |
| 7 | **`t7`** Wire settle at the entries, team.settle and registration | M | — | `t6` | unit: src/workflow/team/__tests__/signoff-registration.test.ts: both the daemon start and makeServices in the terminal call registerSignoffHook, and each listed daemon entry (workflow-step start, runWorkflowServerSide, the second driver entry, both build implement entries, resumeStage) awaits settleForAttempt before its gate call while plan, step, synthesize and validate do not; unit: src/daemon/__tests__/team-settle.test.ts: the team.settle operation runs settleSignoff for the unit, so a BUILD's completed request is recorded as signed-off and the held Story completes, and teamSettle prints what was recorded or why nothing was | [[c1]] [[c3]] [[c4]] |
| 8 | **`t8`** Show signoff apart from review and approval | M | — | `t1` | unit: src/workflow/__tests__/signoff-view.test.ts: signoffViewOf, ArtifactGate, DeliveryEvidenceEntry and the existing chain report lines show signoff separately while approval and review output is unchanged; unit: src/workflow/delivery/__tests__/signoff-delivery.test.ts: the delivery evidence of a Story lists its BUILD record with its signoff entry, so a BUILD that is in signoff or approved and held is visible there | [[c1]] [[c2]] [[c3]] |
| 9 | **`t9`** End-to-end flow and the sandbox smoke test | M | — | `t7`, `t8` | integration: src/workflow/team/__tests__/signoff-e2e.test.ts: claim, submit, refused next stage while open, completion settled at the next-stage attempt, all artifacts signed off together, claim released, deferred Story completion run by team.settle for a BUILD, and an unlisted stage unaffected; smoke: Open a signoff pull request on a sandbox repo, approve and merge it, then start the next stage | [[c5]] |

### 1.1 TASK-315d510cb28100e2-s7-t1 — Pure signoff decisions and the request Reference mapping

Add src/workflow/team/signoff.ts with followedStageOf, isSignedOffOrGrandfathered, signoffViewOf and signoffRecordsOf, and the conversion between a request ref and the lifecycle Reference { entityId, type signoff-request, relation tracked-by }. All pure, over injected policy and heads.

**Acceptance checks:**
- followedStageOf maps author design.epic, design.story, plan and build to the stage they follow and anything else to null
- isSignedOffOrGrandfathered counts signed-off heads and grandfathers only when anchorKnown is true
- signoffRecordsOf groups completed signoffs by the ref read from entityId
- The Reference round trip keeps the ref and never changes the Reference type

### 1.2 TASK-315d510cb28100e2-s7-t2 — The read-only decision, the completion hook and its registration

Add blockedBySignoff, signoffHoldsCompletion, signoffCompletionHook and registerSignoffHook, and change consultHook in team/gate.ts to pass the action and the authoring workflow to the hook (AMD-17), keeping a three-argument hook working.

**Acceptance checks:**
- blockedBySignoff refuses a stage on the followed stage's open request, changes-requested or an unrecorded completed request, and returns null for an unlisted or grandfathered stage with no tracker call
- signoffHoldsCompletion is true for a Story with a listed unsigned LLD or BUILD and for an Epic with a listed unsigned DEF or HLD, and false outside team mode
- consultHook passes the action and authoring to the hook and an older three-argument hook still works
- The hook returns continue for open-signoff, revise and release

### 1.3 TASK-315d510cb28100e2-s7-t3 — Hold completion inside the completion walk

Add the optional holds predicate to EvidenceContext, consult it for every unit completeIfRolledUp visits so the walk stops at a held Story and therefore its Epic, and pass signoffHoldsCompletion from completeThroughService in gates.ts.

**Acceptance checks:**
- With no predicate the walk behaves exactly as before
- A held Story is left approved and the Epic above it is not completed
- An unheld Story completes and the walk stops at a held Epic
- completeThroughService leaves a Story approved while its listed BUILD awaits signoff

### 1.4 TASK-315d510cb28100e2-s7-t4 — GitHub signoff request and state

Extend the request spec and ref types (AMD-16), declare signoff-request in the GitHub adapter and implement openSignoffRequest as a pull request from a branch holding the committed artifacts, linked from the unit issue, and readSignoffState from the review decision and merge state, with contract tests over a fake gh.

**Acceptance checks:**
- loadTracker accepts signoff-request once declared and still rejects a tracker that lacks it
- openSignoffRequest opens a pull request, links it from the unit issue and returns its ref and url
- readSignoffState maps the review decision and merge state to open, changing-requested and completed
- Failure kinds map to the port's failure kinds

### 1.5 TASK-315d510cb28100e2-s7-t5 — Submit artifacts for signoff

Add openSignoff: the holder rule on the issue of the unit that holds the stage (the Story's issue for a BUILD), the policy stage check, the approval and review prerequisites (the lifecycle review, or the Story's code-review record for BUILD), one request through the port linked from the unit issue, and open-signoff recorded on every artifact with the request Reference.

**Acceptance checks:**
- openSignoff refuses a missing approval or review naming it, a non-holder and an unassigned unit, and uses the Story's issue for a BUILD
- For BUILD a missing, author-written or blocking code review is refused and the lifecycle review is never consulted
- One request is opened and open-signoff is recorded on every artifact with the Reference
- A repeat after a partial recording finds the open request and records only the rest

### 1.6 TASK-315d510cb28100e2-s7-t6 — Settle requests and refuse at the entry

Add settleSignoff (read each open request of the unit's listed stages once, record signed-off or signoff-changes on every artifact of a request together, release the claim, run the deferred completion) and settleForAttempt (settle the followed stage's unit, then refuse when blockedBySignoff still blocks, independently of the gate's first-author exception).

**Acceptance checks:**
- settleSignoff records signed-off on all artifacts of a completed request together, then clears the assignee and runs the held completion
- A part-way failure leaves the rest, keeps the stage blocked and releases nothing
- settleForAttempt refuses a first design.story turn on a story with no issue while the HLD awaits signoff
- No tracker call is made outside team mode or when no listed stage has an open request

### 1.7 TASK-315d510cb28100e2-s7-t7 — Wire settle at the entries, team.settle and registration

Await settleForAttempt first at the workflow-step start phase, runWorkflowServerSide and the second driver entry, the two build implement entries and resumeStage; add the team.settle daemon operation and the teamSettle terminal command beside park and resume; call registerSignoffHook in the daemon and in makeServices.

**Acceptance checks:**
- Each listed entry awaits settleForAttempt before its gate call and plan, step, synthesize and validate do not
- team.settle runs settleSignoff and teamSettle prints what was recorded
- Both the daemon and makeServices register the hook

### 1.8 TASK-315d510cb28100e2-s7-t8 — Show signoff apart from review and approval

Add the signoff entry to ArtifactGate and DeliveryEvidenceEntry from signoffViewOf and to the chain report's existing lines, leaving approval and review output unchanged.

**Acceptance checks:**
- Approval and review output is unchanged for an artifact with no signoff
- A signed-off artifact shows signoff separately and never counted as a review
- The delivery evidence of a Story lists its BUILD record with its signoff entry

### 1.9 TASK-315d510cb28100e2-s7-t9 — End-to-end flow and the sandbox smoke test

Prove the whole flow through the real gate, lifecycle and a fake tracker, including a BUILD settled by team.settle, an unlisted stage unaffected and grandfathering; and record the sandbox GitHub smoke test as reported by the builder.

**Acceptance checks:**
- Claim, submit, refused next stage while open, settled completion, all artifacts signed off together and the claim released all pass
- A BUILD request settled through team.settle completes the held Story
- An unlisted stage proceeds as today
- The smoke test result is recorded as reported, not run by the gate

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses a missing approval, a missing or author-written review for DEF, HLD and LLD, a stage the policy does not list, and a submitter who is not the holder | `t5` |
| src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses an unassigned unit saying it must be claimed first | `t5` |
| src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD checks the Story's code-review record (missing, written by the author, or blocking is refused; pass or warn by the other party is accepted) and never the lifecycle review | `t5` |
| src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD reads the holder of the Story's issue and links the request from it even when claimUnits puts BUILD on task units, and settleSignoff for a story unit selects LLD and BUILD while an epic unit selects DEF and HLD | `t5`, `t6` |
| src/workflow/team/__tests__/signoff.test.ts: openSignoff opens one request, records open-signoff on every artifact with the Reference { entityId: ref, type: signoff-request, relation: tracked-by }, and finds the open request on a repeat after a partial recording | `t5` |
| src/workflow/team/__tests__/signoff.test.ts: settleSignoff records signed-off on all artifacts of a completed request, clears the assignee of the unit issue, records signoff-changes on changes-requested, leaves the rest on a part-way failure, skips a Signoff whose Reference is not a signoff-request, and is idempotent across two clones | `t6` |
| src/workflow/team/__tests__/signoff.test.ts: signoffRecordsOf derives sc5 records from lifecycle facts, groups by the ref read from entityId, and grandfathers by the shared rule | `t1` |
| src/workflow/team/__tests__/signoff-hook.test.ts: isSignedOffOrGrandfathered counts a signed-off head, counts a head approved before the anchor only when anchorKnown is true, and never grandfathers when anchorKnown is false | `t1` |
| src/workflow/team/__tests__/signoff-hook.test.ts: followedStageOf maps author design.epic to DEF on the epic, author design.story to HLD on the epic, author plan and build to LLD on the story, and anything else to null | `t1` |
| src/workflow/team/__tests__/signoff-hook.test.ts: blockedBySignoff and signoffCompletionHook on one story unit block design.story authoring on the HLD's open request and plan authoring on the LLD's open request, but not the LLD's own authoring, skip a grandfathered head, return awaiting-signoff, a changes-requested refusal, an unsettled-completed refusal, or continue, never write, and need no tracker call | `t2` |
| src/workflow/team/__tests__/signoff-hook.test.ts: settleForAttempt refuses a first design.story turn on a story whose issue could not be created while the HLD awaits signoff, before teamGate's allowFirstAuthor exception is reached | `t6` |
| src/workflow/team/__tests__/signoff-hold.test.ts: signoffHoldsCompletion is true for a Story whose listed LLD or BUILD is not signed off and for an Epic whose listed DEF or HLD is not, false for a grandfathered pre-anchor member when anchorKnown is true, true for it when anchorKnown is false, and false outside team mode, with no policy, or with no member stage listed | `t2` |
| src/workflow/artifact-core/__tests__/completion-holds.test.ts: completeIfRolledUp with a holds predicate stops the walk at a held Story so the Epic is not completed, completes an unheld Story and then stops at a held Epic, and with no predicate behaves as before | `t3` |
| src/workflow/__tests__/signoff-hold.test.ts: completeThroughService leaves a Story approved-not-completed while its listed BUILD awaits signoff, and settleSignoff completes the Story and its Epic once signed-off is recorded, with the members cascaded | `t3`, `t6` |
| src/workflow/team/__tests__/signoff-registration.test.ts: both the daemon start and makeServices in the terminal call registerSignoffHook, consultHook passes the action and the authoring workflow to the hook, and each listed daemon entry (workflow-step start, runWorkflowServerSide, the second driver entry, both build implement entries, resumeStage) awaits settleForAttempt before its gate call while plan, step, synthesize and validate do not | `t2`, `t7` |
| src/daemon/__tests__/team-settle.test.ts: the team.settle operation runs settleSignoff for the unit, so a BUILD's completed request is recorded as signed-off and the held Story completes, and teamSettle prints what was recorded or why nothing was | `t7` |
| src/workflow/__tests__/signoff-view.test.ts: signoffViewOf, ArtifactGate, DeliveryEvidenceEntry and the existing chain report lines show signoff separately while approval and review output is unchanged | `t8` |
| src/workflow/delivery/__tests__/signoff-delivery.test.ts: the delivery evidence of a Story lists its BUILD record with its signoff entry, so a BUILD that is in signoff or approved and held is visible there | `t8` |
| src/workflow/tracker/__tests__/github-signoff.test.ts: loadTracker accepts signoff-request once declared; openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url; readSignoffState maps review decision and merge state to open, changes-requested and completed; failure kinds map to PortResult kinds | `t4` |
| src/workflow/team/__tests__/signoff-e2e.test.ts: claim, submit, refused next stage while open, completion settled at the next-stage attempt, all artifacts signed off together, claim released, deferred Story completion run by team.settle for a BUILD, and an unlisted stage unaffected | `t9` |
| Open a signoff pull request on a sandbox repo, approve and merge it, then start the next stage | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s7 contractDetails (the api: openSignoff, settleSignoff, settleForAttempt, blockedBySignoff, isSignedOffOrGrandfathered, followedStageOf, signoffCompletionHook, signoffHoldsCompletion, teamSettle, registerSignoffHook, signoffRecordsOf, signoffViewOf)`
- **[[c2]]** `prior-artifact` `LLD s7 dataModelChanges (SignoffRecord, SignoffRequestSpec, the adapter capability set, CompletionHook, EvidenceContext, completion, ArtifactGate, DeliveryEvidenceEntry, ChainReport, team daemon operations)`
- **[[c3]]** `prior-artifact` `LLD s7 interactionWithShared (sc1, sc2, sc3, sc4, sc5)`
- **[[c4]]** `prior-artifact` `LLD s7 errorPaths (error cases, edge cases and invariants to preserve)`
- **[[c5]]** `prior-artifact` `LLD s7 testStrategy (test levels, subjects and acceptance mapping ac29 to ac35)`
