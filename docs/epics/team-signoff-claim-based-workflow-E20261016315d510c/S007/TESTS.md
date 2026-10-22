<!-- insrc:artifact TESTS-315d510cb28100e2-s7 -->

# Tests: 315d510cb28100e2 s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-22T15:59:53.331Z on commit `64bd9eb0`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff.test.ts: signoffRecordsOf derives sc5 records from lifecycle facts, groups by the ref read from entityId, and grandfathers by the shared rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | signoffRecordsOf derives sc5 records from lifecycle facts, groups by the ref read from entityId, and grandfathers by the shared rule | `src/workflow/team/__tests__/signoff.test.ts` |

**unit: src/workflow/team/__tests__/signoff-hook.test.ts: isSignedOffOrGrandfathered counts a signed-off head, counts a head approved before the anchor only when anchorKnown is true, and never grandfathers when anchorKnown is false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | isSignedOffOrGrandfathered counts a signed-off head, counts a head approved before the anchor only when anchorKnown is true, and never grandfathers when anchorKnown is false | `src/workflow/team/__tests__/signoff-hook.test.ts` |

**unit: src/workflow/team/__tests__/signoff-hook.test.ts: followedStageOf maps author design.epic to DEF on the epic, author design.story to HLD on the epic, author plan and build to LLD on the story, and anything else to null**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | followedStageOf maps author design.epic to DEF on the epic, author design.story to HLD on the epic, author plan and build to LLD on the story, and anything else to null | `src/workflow/team/__tests__/signoff-hook.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-hook.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/team/__tests__/signoff.test.ts` | 0 | 3 | 1.2 s |  |

## t2

Run at 2026-10-22T16:03:47.211Z on commit `6e048d5f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff-hook.test.ts: blockedBySignoff and signoffCompletionHook on one story unit block design.story authoring on the HLD's open request and plan authoring on the LLD's open request, but not the LLD's own authoring, skip a grandfathered head, return awaiting-signoff, a changes-requested refusal, an unsettled-completed refusal, or continue, never write, and need no tracker call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | blockedBySignoff and signoffCompletionHook on one story unit block design.story authoring on the HLD's open request and plan authoring on the LLD's open request, but not the LLD's own authoring, skip a grandfathered head, return awaiting-signoff, a changes-requested refusal, an unsettled-completed refusal, or continue, never write, and need no tracker call | `src/workflow/team/__tests__/signoff-hook.test.ts` |

**unit: src/workflow/team/__tests__/signoff-hold.test.ts: signoffHoldsCompletion is true for a Story whose listed LLD or BUILD is not signed off and for an Epic whose listed DEF or HLD is not, false for a grandfathered pre-anchor member when anchorKnown is true, true for it when anchorKnown is false, and false outside team mode, with no policy, or with no member stage listed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | signoffHoldsCompletion is true for a Story whose listed LLD or BUILD is not signed off and for an Epic whose listed DEF or HLD is not, false for a grandfathered pre-anchor member when anchorKnown is true, true for it when anchorKnown is false, and false outside team mode, with no policy, or with no member stage listed | `src/workflow/team/__tests__/signoff-hold.test.ts` |

**unit: src/workflow/team/__tests__/signoff-registration.test.ts: consultHook passes the action and the authoring workflow to the hook and an older three-argument hook still works**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | consultHook passes the action and the authoring workflow to the hook and an older three-argument hook still works | `src/workflow/team/__tests__/signoff-registration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-hold.test.ts` | 0 | 1 | 3.3 s |  |
| `src/workflow/team/__tests__/signoff-hook.test.ts` | 0 | 3 | 3 s |  |
| `src/workflow/team/__tests__/signoff-registration.test.ts` | 0 | 1 | 3.3 s |  |

## t3

Run at 2026-10-22T16:07:37.840Z on commit `761d2f01`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/completion-holds.test.ts: completeIfRolledUp with a holds predicate stops the walk at a held Story so the Epic is not completed, completes an unheld Story and then stops at a held Epic, and with no predicate behaves as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | completeIfRolledUp with a holds predicate stops the walk at a held Story so the Epic is not completed, completes an unheld Story and then stops at a held Epic, and with no predicate behaves as before | `src/workflow/artifact-core/__tests__/completion-holds.test.ts` |
| pass | with no predicate the walk behaves as before | `src/workflow/artifact-core/__tests__/completion-holds.test.ts` |

**unit: src/workflow/__tests__/signoff-hold.test.ts: completeThroughService leaves a Story approved-not-completed while its listed BUILD awaits signoff**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | completeThroughService leaves a Story approved-not-completed while its listed BUILD awaits signoff | `src/workflow/__tests__/signoff-hold.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/signoff-hold.test.ts` | 0 | 1 | 1.5 s |  |
| `src/workflow/artifact-core/__tests__/completion-holds.test.ts` | 0 | 3 | 1.3 s |  |

## t4

Run at 2026-10-22T16:10:56.555Z on commit `6892df08`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-signoff.test.ts: loadTracker accepts signoff-request once declared; openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url; readSignoffState maps review decision and merge state to open, changes-requested and completed; failure kinds map to PortResult kinds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | loadTracker accepts signoff-request once declared; openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url; readSignoffState maps review decision and merge state to open, changes-requested and completed; failure kinds map to PortResult kinds | `src/workflow/tracker/__tests__/github-signoff.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-signoff.test.ts` | 0 | 1 | 0.8 s |  |

## t5

Run at 2026-10-22T16:15:37.336Z on commit `c9aedef3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses a missing approval, a missing or author-written review for DEF, HLD and LLD, a stage the policy does not list, and a submitter who is not the holder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openSignoff refuses a missing approval, a missing or author-written review for DEF, HLD and LLD, a stage the policy does not list, and a submitter who is not the holder | `src/workflow/team/__tests__/signoff.test.ts` |

**unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses an unassigned unit saying it must be claimed first**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openSignoff refuses an unassigned unit saying it must be claimed first | `src/workflow/team/__tests__/signoff.test.ts` |

**unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD checks the Story's code-review record (missing, written by the author, or blocking is refused; pass or warn by the other party is accepted) and never the lifecycle review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openSignoff for BUILD checks the Story's code-review record (missing, written by the author, or blocking is refused; pass or warn by the other party is accepted) and never the lifecycle review | `src/workflow/team/__tests__/signoff.test.ts` |

**unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD reads the holder of the Story's issue and links the request from it even when claimUnits puts BUILD on task units, and settleSignoff for a story unit selects LLD and BUILD while an epic unit selects DEF and HLD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openSignoff for BUILD reads the holder of the Story's issue and links the request from it even when claimUnits puts BUILD on task units, and settleSignoff for a story unit selects LLD and BUILD while an epic unit selects DEF and HLD | `src/workflow/team/__tests__/signoff.test.ts` |

**unit: src/workflow/team/__tests__/signoff.test.ts: openSignoff opens one request, records open-signoff on every artifact with the Reference { entityId: ref, type: signoff-request, relation: tracked-by }, and finds the open request on a repeat after a partial recording**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openSignoff opens one request, records open-signoff on every artifact with the Reference { entityId: ref, type: signoff-request, relation: tracked-by }, and finds the open request on a repeat after a partial recording | `src/workflow/team/__tests__/signoff.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff.test.ts` | 0 | 8 | 1.1 s |  |

## t6

Run at 2026-10-22T16:19:17.064Z on commit `05498c6f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff.test.ts: settleSignoff records signed-off on all artifacts of a completed request, clears the assignee of the unit issue, records signoff-changes on changes-requested, leaves the rest on a part-way failure, skips a Signoff whose Reference is not a signoff-request, and is idempotent across two clones**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | settleSignoff records signed-off on all artifacts of a completed request, clears the assignee of the unit issue, records signoff-changes on changes-requested, leaves the rest on a part-way failure, skips a Signoff whose Reference is not a signoff-request, and is idempotent across two clones | `src/workflow/team/__tests__/signoff.test.ts` |

**unit: src/workflow/team/__tests__/signoff-hook.test.ts: settleForAttempt refuses a first design.story turn on a story whose issue could not be created while the HLD awaits signoff, before teamGate's allowFirstAuthor exception is reached**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | settleForAttempt refuses a first design.story turn on a story whose issue could not be created while the HLD awaits signoff, before teamGate's allowFirstAuthor exception is reached | `src/workflow/team/__tests__/signoff-hook.test.ts` |

**unit: src/workflow/__tests__/signoff-hold.test.ts: settleSignoff completes the Story and its Epic once signed-off is recorded, with the members cascaded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | settleSignoff completes the Story and its Epic once signed-off is recorded, with the members cascaded | `src/workflow/__tests__/signoff-hold.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/signoff-hold.test.ts` | 0 | 2 | 1.9 s |  |
| `src/workflow/team/__tests__/signoff-hook.test.ts` | 0 | 4 | 1.3 s |  |
| `src/workflow/team/__tests__/signoff.test.ts` | 0 | 9 | 1.4 s |  |

## t7

Run at 2026-10-22T16:26:38.264Z on commit `288f9f29`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff-registration.test.ts: both the daemon start and makeServices in the terminal call registerSignoffHook, and each listed daemon entry (workflow-step start, runWorkflowServerSide, the second driver entry, both build implement entries, resumeStage) awaits settleForAttempt before its gate call while plan, step, synthesize and validate do not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both the daemon start and makeServices in the terminal call registerSignoffHook, and each listed daemon entry (workflow-step start, runWorkflowServerSide, the second driver entry, both build implement entries, resumeStage) awaits settleForAttempt before its gate call while plan, step, synthesize and validate do not | `src/workflow/team/__tests__/signoff-registration.test.ts` |

**unit: src/daemon/__tests__/team-settle.test.ts: the team.settle operation runs settleSignoff for the unit, so a BUILD's completed request is recorded as signed-off and the held Story completes, and teamSettle prints what was recorded or why nothing was**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the team.settle operation runs settleSignoff for the unit, so a BUILD's completed request is recorded as signed-off and the held Story completes, and teamSettle prints what was recorded or why nothing was | `src/daemon/__tests__/team-settle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/team-settle.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/team/__tests__/signoff-registration.test.ts` | 0 | 2 | 0.9 s |  |

## t8

Run at 2026-10-22T16:30:29.476Z on commit `e9b895e1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/signoff-view.test.ts: signoffViewOf, ArtifactGate, DeliveryEvidenceEntry and the existing chain report lines show signoff separately while approval and review output is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | signoffViewOf, ArtifactGate, DeliveryEvidenceEntry and the existing chain report lines show signoff separately while approval and review output is unchanged | `src/workflow/__tests__/signoff-view.test.ts` |

**unit: src/workflow/delivery/__tests__/signoff-delivery.test.ts: the delivery evidence of a Story lists its BUILD record with its signoff entry, so a BUILD that is in signoff or approved and held is visible there**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the delivery evidence of a Story lists its BUILD record with its signoff entry, so a BUILD that is in signoff or approved and held is visible there | `src/workflow/delivery/__tests__/signoff-delivery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/signoff-view.test.ts` | 0 | 1 | 3.8 s |  |
| `src/workflow/delivery/__tests__/signoff-delivery.test.ts` | 0 | 1 | 2.9 s |  |

## t9

Run at 2026-10-22T16:42:12.967Z on commit `7fb55988`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/signoff-e2e.test.ts: claim, submit, refused next stage while open, completion settled at the next-stage attempt, all artifacts signed off together, claim released, deferred Story completion run by team.settle for a BUILD, and an unlisted stage unaffected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | claim, submit, refused next stage while open, completion settled at the next-stage attempt, all artifacts signed off together, claim released, deferred Story completion run by team.settle for a BUILD, and an unlisted stage unaffected | `src/workflow/team/__tests__/signoff-e2e.test.ts` |

**smoke: Open a signoff pull request on a sandbox repo, approve and merge it, then start the next stage**

Reported by the builder, not run by the gate: **pass**. Evidence: Run on subhagho/FieldML: signoff PR https://github.com/subhagho/FieldML/pull/4 (issue #3 linked), refused while open, merged by owner admin merge (no second reviewer available), then design.story attempt settled DEF+HLD to signed-off, released the claim and was allowed. Console output of the run was observed by the builder; the script was temporary and removed.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-e2e.test.ts` | 0 | 1 | 1.4 s |  |
