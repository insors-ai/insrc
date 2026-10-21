<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s3 -->

# Tests: 2f27754d4ad00b8e s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 54 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T05:22:31.620Z on commit `0ecb7437`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/lifecycle-errors.test.ts: the five lifecycle error classes carry their name, reason and ids, and the module exports exactly eleven error classes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the five lifecycle error classes carry their name, reason and ids, and the module exports exactly eleven error classes | `src/workflow/artifact-core/__tests__/lifecycle-errors.test.ts` |
| pass | exports only the eleven error classes at runtime | `src/workflow/artifact-core/__tests__/types-contract.test.ts` |
| pass | the exported types accept the sc2, sc3, sc4 and sc6 sketches and the stated anchor extension | `src/workflow/artifact-core/__tests__/types-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/lifecycle-errors.test.ts` | 0 | 2 | 0.9 s |  |
| `src/workflow/artifact-core/__tests__/types-contract.test.ts` | 0 | 3 | 4.2 s |  |

## t2

Run at 2026-10-21T05:29:13.465Z on commit `ad11ce62`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/content-hash.test.ts: contentHash ignores key order and everything but the description and payload**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ignores key order and everything but the description and payload | `src/workflow/artifact-core/__tests__/content-hash.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-table.test.ts: every lifecycle operation from every status lands where the closed table says or throws IllegalTransitionError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every lifecycle operation from every status lands where the closed table says or throws IllegalTransitionError | `src/workflow/artifact-core/__tests__/lifecycle-table.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts: transition sets approval, review, signoff and stale as the table says and refuses a missing detail**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sets approval, review, signoff and stale as the table says and refuses a missing detail | `src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts: approve on a DEF, HLD or LLD needs a review bound to the current revision or an override, and a PLAN, ISSUE or SPEC needs none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approve on a DEF, HLD or LLD needs a review bound to the current revision or an override, and a PLAN, ISSUE or SPEC needs none | `src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: a create, an identical rewrite, a head with an empty stored hash, a description-only change, a reference-only change and a forged revision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a create, an identical rewrite, a head with an empty stored hash, a description-only change, a reference-only change and a forged revision | `src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: reconcileLifecycle after a content change to an approved artifact with a review and a signoff**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileLifecycle after a content change to an approved artifact with a review and a signoff | `src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts: a content change on a terminal artifact and a create that is not draft are refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a content change on a terminal artifact and a create that is not draft are refused | `src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts: checkHeadIntegrity and checkIntegrity report every reason and treat unhashed and unlogged heads as ok**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checkHeadIntegrity and checkIntegrity report every reason and treat unhashed and unlogged heads as ok | `src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/content-hash.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts` | 0 | 2 | 0.8 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts` | 0 | 4 | 0.9 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-table.test.ts` | 0 | 2 | 0.9 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts` | 0 | 3 | 0.8 s |  |

## t3

Run at 2026-10-21T05:41:06.699Z on commit `9ca9f4fb`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/prepare-lifecycle.test.ts: prepareArtifactWrite reconciles meta.lifecycle for a content write, leaves it for a meta-only write, mints no revision for a metadata-only or key-order-only change, and prepares a head without meta.lifecycle as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | prepareArtifactWrite reconciles meta.lifecycle for a content write, leaves it for a meta-only write, mints no revision for a metadata-only or key-order-only change, and prepares a head without meta.lifecycle as before | `src/workflow/__tests__/prepare-lifecycle.test.ts` |
| pass | prepareArtifactWrite returns the bytes and revision writeArtifact writes for content, meta-only, identical and first writes, and writes nothing | `src/workflow/__tests__/prepare-artifact-write.test.ts` |
| pass | writeArtifact mints and keeps revisions, carries the whole tracker block, and rejects a value without meta | `src/workflow/__tests__/artifact-writer.test.ts` |
| pass | writeAtomic overwrites existing file | `src/workflow/__tests__/storage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-writer.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/__tests__/prepare-artifact-write.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/__tests__/prepare-lifecycle.test.ts` | 0 | 2 | 0.4 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 46 | 0.6 s |  |

## t4

Run at 2026-10-21T05:47:11.165Z on commit `8b3f87c3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts: a TASK, STORY, EPIC, TASKS and DIAG head is written, read, listed and given a status through the store, and registeredKinds lists sixteen kinds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a TASK, STORY, EPIC, TASKS and DIAG head is written, read, listed and given a status through the store, and registeredKinds lists sixteen kinds | `src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts` |
| pass | every artifact kind has a codec | `src/workflow/artifact-core/__tests__/codec-create.test.ts` |
| pass | write then read round trip keeps the revision rule for every registered kind | `src/workflow/artifact-core/__tests__/store-write.test.ts` |
| pass | a bad parent or artifact-typed reference is refused and external references are accepted | `src/workflow/artifact-core/__tests__/store-write.test.ts` |
| pass | decodeArtifactHead fills every envelope part, returns empty parts for a head without them, and refuses a malformed head, an unknown kind and a flat amendment | `src/workflow/artifact-core/__tests__/decode.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/codec-create.test.ts` | 0 | 3 | 0.5 s |  |
| `src/workflow/artifact-core/__tests__/decode.test.ts` | 0 | 2 | 0.5 s |  |
| `src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts` | 0 | 2 | 0.7 s |  |
| `src/workflow/artifact-core/__tests__/store-write.test.ts` | 0 | 8 | 0.8 s |  |

## t5

Run at 2026-10-21T05:54:01.652Z on commit `206cb237`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts: write logs a lifecycle operation with status {from, to}, keeps revision on every entry, and refuses a step outside the table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | write logs a lifecycle operation with status {from, to}, keeps revision on every entry, and refuses a step outside the table | `src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts` |
| pass | write then read round trip keeps the revision rule for every registered kind | `src/workflow/artifact-core/__tests__/store-write.test.ts` |
| pass | only a content change moves the revision, and a description change is content | `src/workflow/artifact-core/__tests__/store-write.test.ts` |

**integration: src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts: an ordinary write on a conflicted head is refused and a conflict-resolved write adopts the content**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an ordinary write on a conflicted head is refused and a conflict-resolved write adopts the content | `src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts` |
| pass | a failure at stage, log append, head replace and clear each leaves the documented state and the next write completes the staged operation once | `src/workflow/artifact-core/__tests__/journal.test.ts` |
| pass | a restart before the append, a retry by a different actor and an identical-head append failure all recover the original entry | `src/workflow/artifact-core/__tests__/journal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/journal.test.ts` | 0 | 3 | 1 s |  |
| `src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts` | 0 | 3 | 1 s |  |
| `src/workflow/artifact-core/__tests__/store-write.test.ts` | 0 | 8 | 1.1 s |  |

## t6

Run at 2026-10-21T05:56:28.136Z on commit `51aab8a1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/artifact-core/__tests__/store-update.test.ts: update runs read, mutate and write inside the queue, awaits an async mutate, keeps two competing operations in order and writes nothing when mutate throws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | update runs read, mutate and write inside the queue, awaits an async mutate, keeps two competing operations in order and writes nothing when mutate throws | `src/workflow/artifact-core/__tests__/store-update.test.ts` |

**integration: src/workflow/artifact-core/__tests__/store-update.test.ts: a head replace that failed after the log append is finished before update reads, and the retry is logged once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a head replace that failed after the log append is finished before update reads, and the retry is logged once | `src/workflow/artifact-core/__tests__/store-update.test.ts` |

**integration: src/workflow/artifact-core/__tests__/store-children-strict.test.ts: childrenOfStrict returns an unreadable child that childrenOf skips**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | childrenOfStrict returns an unreadable child that childrenOf skips | `src/workflow/artifact-core/__tests__/store-children-strict.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/store-children-strict.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/artifact-core/__tests__/store-update.test.ts` | 0 | 3 | 1.2 s |  |

## t7

Run at 2026-10-21T05:59:39.992Z on commit `2046cb8d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts: the Task, Story and Epic roll-up rules, the evidence mapping and the unreadable child**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the Task, Story and Epic roll-up rules, the evidence mapping and the unreadable child | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |

**unit: src/workflow/artifact-core/__tests__/completion-evidence.test.ts: storyCodeReview maps the gate, an explicit override wins over a stored one and an advisory warn is blocked without an override**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | storyCodeReview maps the gate, an explicit override wins over a stored one and an advisory warn is blocked without an override | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-members.test.ts: a Story's members keep each DIAG sequence and never include the unit itself**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story's members keep each DIAG sequence and never include the unit itself | `src/workflow/artifact-core/__tests__/lifecycle-members.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` | 0 | 2 | 1.6 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-members.test.ts` | 0 | 2 | 1.5 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` | 0 | 2 | 1.6 s |  |

## t8

Run at 2026-10-21T06:10:02.253Z on commit `4a156a4b`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts: after a content change to an approved artifact the status is draft, the revision moved, and the earlier approval and review keep their original revision numbers (unit, then through LifecycleService and readWithHistory, then through writeArtifact)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after a content change to an approved artifact the status is draft, the revision moved, and the earlier approval and review keep their original revision numbers (unit, then through LifecycleService and readWithHistory, then through writeArtifact) | `src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts` |

**integration: src/workflow/artifact-core/__tests__/lifecycle-service.test.ts: apply refuses approve, review and complete on each Integrity reason and writes nothing, while unhashed and unlogged heads are approved normally**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | apply refuses approve, review and complete on each Integrity reason and writes nothing, while unhashed and unlogged heads are approved normally | `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` |

**integration: src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts: completeIfRolledUp records the Story once, members first and the unit last, and the Epic follows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | completeIfRolledUp records the Story once, members first and the unit last, and the Epic follows | `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` |

**integration: src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts: a completion that fails part-way is finished by a retry, and reopen reopens the frozen members and is refused while the Epic is completed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a completion that fails part-way is finished by a retry, and reopen reopens the frozen members and is refused while the Epic is completed | `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` |

**integration: src/workflow/__tests__/artifact-write-inventory.test.ts: the lifecycle service file has an entry and a caller of ArtifactStore.update is recognised**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the lifecycle service file has an entry and a caller of ArtifactStore.update is recognised | `src/workflow/__tests__/artifact-write-inventory.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 4 | 2.5 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts` | 0 | 2 | 2.3 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` | 0 | 3 | 2.8 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` | 0 | 2 | 2.7 s |  |

## t9

Run at 2026-10-21T06:17:35.487Z on commit `ead5aa8c`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/gates-lifecycle-guard.test.ts: approveWorkflowTarget refuses a conflicted BUILD target in both branches before ensureBuildRecordOnCompletion rewrites it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approveWorkflowTarget refuses a conflicted BUILD target in both branches before ensureBuildRecordOnCompletion rewrites it | `src/workflow/__tests__/gates-lifecycle-guard.test.ts` |
| pass | single BUILD target with no prior json => the hook CREATES the record, then it completes (no ArtifactMissingError) | `src/workflow/__tests__/approve-build-record-completion.test.ts` |
| pass | requireApprovedLld: returns the LLD when approved + non-stale | `src/workflow/__tests__/plan-gate.test.ts` |
| pass | jsonPathForMd resolves a nested epic DEF md → its hash-named json via the marker | `src/workflow/__tests__/gates.test.ts` |
| pass | ac1: admitBuild returns admitted:true with only the thin pointer when approved + recorded==current | `src/workflow/runners/build/__tests__/admit-build.test.ts` |
| pass | implement: approved+fresh plan returns a prompt carrying acceptance checks + issue ref | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**integration: src/workflow/__tests__/gates-lifecycle-guard.test.ts: approveArtifactByJsonPath and reviewArtifactFile refuse a conflicted head before any stamp and an unhashed head is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approveArtifactByJsonPath and reviewArtifactFile refuse a conflicted head before any stamp and an unhashed head is unchanged | `src/workflow/__tests__/gates-lifecycle-guard.test.ts` |
| pass | approve is refused when the review verdict is block and no override | `src/workflow/__tests__/review-gate.test.ts` |
| pass | auto-fix review and apply resolution bump the revision, report-only review and accept override defer do not, through run-artifact and resolve | `src/workflow/review/__tests__/review-revision.test.ts` |
| pass | single: a review-clean artifact is approved (approvedAt stamped) | `src/workflow/__tests__/approve-workflow-target.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 63 | 16.6 s |  |
| `src/workflow/__tests__/approve-build-record-completion.test.ts` | 0 | 2 | 1.8 s |  |
| `src/workflow/__tests__/approve-workflow-target.test.ts` | 0 | 8 | 1.9 s |  |
| `src/workflow/__tests__/gates-lifecycle-guard.test.ts` | 0 | 2 | 2.1 s |  |
| `src/workflow/__tests__/gates.test.ts` | 0 | 26 | 2.7 s |  |
| `src/workflow/__tests__/plan-gate.test.ts` | 0 | 9 | 1.8 s |  |
| `src/workflow/__tests__/review-gate.test.ts` | 0 | 3 | 1.6 s |  |
| `src/workflow/review/__tests__/review-revision.test.ts` | 0 | 1 | 1.9 s |  |
| `src/workflow/runners/build/__tests__/admit-build.test.ts` | 0 | 18 | 1.7 s |  |

## t10

Run at 2026-10-21T06:31:27.497Z on commit `29a9c401`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/gates-lifecycle-service.test.ts: with a service, an explicit override over an advisory-blocked code review completes the Story through a real approval and the reason is on the complete entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a service, an explicit override over an advisory-blocked code review completes the Story through a real approval and the reason is on the complete entry | `src/workflow/__tests__/gates-lifecycle-service.test.ts` |

**integration: src/workflow/__tests__/gates-lifecycle-service.test.ts: with a service, a review auto-fix or BUILD hook rewrite keeps the log in step so the next approval is not head-ahead-of-log**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a service, a review auto-fix or BUILD hook rewrite keeps the log in step so the next approval is not head-ahead-of-log | `src/workflow/__tests__/gates-lifecycle-service.test.ts` |

**integration: src/workflow/__tests__/gates-lifecycle-service.test.ts: without a service the approval and review paths behave as before and meta.approvedAt is still stamped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | without a service the approval and review paths behave as before and meta.approvedAt is still stamped | `src/workflow/__tests__/gates-lifecycle-service.test.ts` |
| pass | approveWorkflowTarget refuses a conflicted BUILD target in both branches before ensureBuildRecordOnCompletion rewrites it | `src/workflow/__tests__/gates-lifecycle-guard.test.ts` |
| pass | single: a review-clean artifact is approved (approvedAt stamped) | `src/workflow/__tests__/approve-workflow-target.test.ts` |
| pass | auto-fix review and apply resolution bump the revision, report-only review and accept override defer do not, through run-artifact and resolve | `src/workflow/review/__tests__/review-revision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/approve-workflow-target.test.ts` | 0 | 8 | 1.6 s |  |
| `src/workflow/__tests__/gates-lifecycle-guard.test.ts` | 0 | 2 | 1.9 s |  |
| `src/workflow/__tests__/gates-lifecycle-service.test.ts` | 0 | 3 | 2.3 s |  |
| `src/workflow/review/__tests__/review-revision.test.ts` | 0 | 1 | 1.8 s |  |
