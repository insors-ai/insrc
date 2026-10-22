<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s9 -->

# Tests: 2f27754d4ad00b8e s9

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 59 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-22T06:35:52.447Z on commit `6b52fdb4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: convert-feedback.test.ts: each mapping of convertLegacyFeedback from the s5 hand-off (actor, kind, anchor section, kept fields)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-feedback.test.ts: each mapping of convertLegacyFeedback from the s5 hand-off (actor, kind, anchor section, kept fields) | `src/workflow/convert/__tests__/convert-feedback.test.ts` |
| pass | the legacy feedback conversion maps every field and reports what it cannot map | `src/workflow/artifact-core/__tests__/feedback-convert.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/feedback-convert.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/convert/__tests__/convert-feedback.test.ts` | 0 | 2 | 1.5 s |  |

## t2

Run at 2026-10-22T06:37:54.443Z on commit `fb134d5b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: report-log.test.ts: the review report and its resolutions are read back from the review entry and give the verdict the old stamp gave**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | report-log.test.ts: the review report and its resolutions are read back from the review entry and give the verdict the old stamp gave | `src/workflow/review/__tests__/report-log.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/report-log.test.ts` | 0 | 2 | 1.4 s |  |

## t3

Run at 2026-10-22T06:41:44.215Z on commit `473f31b5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: entry-ids.test.ts: migrated entry ids are stable and distinct per part**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | entry-ids.test.ts: migrated entry ids are stable and distinct per part | `src/workflow/convert/__tests__/entry-ids.test.ts` |

**unit: legacy-view.test.ts: legacyDeliveryView reproduces the old delivery reader's approval, review and blocking**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | legacy-view.test.ts: legacyDeliveryView reproduces the old delivery reader's approval, review and blocking | `src/workflow/convert/__tests__/legacy-view.test.ts` |
| pass | legacy-view.test.ts: legacyDeliveryView reads no file | `src/workflow/convert/__tests__/legacy-view.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/entry-ids.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/convert/__tests__/legacy-view.test.ts` | 0 | 3 | 1.3 s |  |

## t4

Run at 2026-10-22T06:45:41.742Z on commit `ebf3549b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: convert-lifecycle-backfill.test.ts: the lifecycle and the migrated entries are computed from the legacy fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-lifecycle-backfill.test.ts: the lifecycle and the migrated entries are computed from the legacy fields | `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` |
| pass | convert-lifecycle-backfill.test.ts: the later stamp decides the status and a review older than the revision is not bound | `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` |
| pass | convert-lifecycle-backfill.test.ts: an existing lifecycle keeps its approval actor and an unreadable head is refused | `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` | 0 | 4 | 1.2 s |  |

## t5

Run at 2026-10-22T06:49:13.152Z on commit `b5ea5f66`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: migrated-head.test.ts: an approved head keeps its revision number, status and approval and a crash at each step then a rerun leaves one entry per id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migrated-head.test.ts: an approved head keeps its revision number, status and approval and a crash at each step then a rerun leaves one entry per id | `src/workflow/convert/__tests__/migrated-head.test.ts` |
| pass | migrated-head.test.ts: a write that would change the revision, the status or the approval is refused and nothing is written | `src/workflow/convert/__tests__/migrated-head.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/migrated-head.test.ts` | 0 | 3 | 1.7 s |  |

## t6

Run at 2026-10-22T06:53:08.129Z on commit `addd9089`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-preview.test.ts: a preview writes nothing, refuses a dirty tree and lists unreadable files as problems**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-preview.test.ts: a preview writes nothing, refuses a dirty tree and lists unreadable files as problems | `src/workflow/convert/__tests__/convert-preview.test.ts` |
| pass | convert-preview.test.ts: a directory that is not a git repository is refused | `src/workflow/convert/__tests__/convert-preview.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-preview.test.ts` | 0 | 3 | 3.6 s |  |

## t7

Run at 2026-10-22T06:57:02.482Z on commit `8a948722`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: convert-ids.test.ts: uppercase story ids are renamed once with references rewritten and none left as an alias**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-ids.test.ts: uppercase story ids are renamed once with references rewritten and none left as an alias | `src/workflow/convert/__tests__/convert-ids.test.ts` |
| pass | convert-ids.test.ts: a collision is a plan problem and no rename is applied | `src/workflow/convert/__tests__/convert-ids.test.ts` |
| pass | convert-ids.test.ts: a rerun after a crash that left the renamed twin finishes the rename | `src/workflow/convert/__tests__/convert-ids.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-ids.test.ts` | 0 | 4 | 1.5 s |  |

## t8

Run at 2026-10-22T07:00:22.174Z on commit `eeaf922b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: convert-stamps.test.ts: epicCreatedAt is taken from the head of the work item**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-stamps.test.ts: epicCreatedAt is taken from the head of the work item | `src/workflow/convert/__tests__/convert-stamps.test.ts` |
| pass | convert-stamps.test.ts: anchorOf prefers the head of the work item over the records | `src/workflow/convert/__tests__/convert-stamps.test.ts` |

**unit: convert-amendments.test.ts: a flat amendment becomes a head with a lifecycle from its stamps**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-amendments.test.ts: a flat amendment becomes a head with a lifecycle from its stamps | `src/workflow/convert/__tests__/convert-amendments.test.ts` |
| pass | convert-amendments.test.ts: flatToHead refuses a record it cannot date or place | `src/workflow/convert/__tests__/convert-amendments.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-amendments.test.ts` | 0 | 3 | 1.3 s |  |
| `src/workflow/convert/__tests__/convert-stamps.test.ts` | 0 | 3 | 1.3 s |  |

## t9

Run at 2026-10-22T07:04:16.792Z on commit `5538e623`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-feedback-rule.test.ts: feedback lines are appended before the head is replaced and a crash loses no feedback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-feedback-rule.test.ts: feedback lines are appended before the head is replaced and a crash loses no feedback | `src/workflow/convert/__tests__/convert-feedback-rule.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-feedback-rule.test.ts` | 0 | 3 | 1.4 s |  |

## t10

Run at 2026-10-22T07:07:56.457Z on commit `59b16021`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-units.test.ts: EPIC and STORY heads hold the bindings and attachments moved from the Define and the LLD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-units.test.ts: EPIC and STORY heads hold the bindings and attachments moved from the Define and the LLD | `src/workflow/convert/__tests__/convert-units.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-units.test.ts` | 0 | 2 | 1.4 s |  |

## t11

Run at 2026-10-22T07:10:56.797Z on commit `1b429140`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-story-history.test.ts: tracker feedback lines and receipts move to the STORY head and attach comments are listed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-story-history.test.ts: tracker feedback lines and receipts move to the STORY head and attach comments are listed | `src/workflow/convert/__tests__/convert-story-history.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-story-history.test.ts` | 0 | 2 | 1.2 s |  |

## t12

Run at 2026-10-22T07:13:23.797Z on commit `121107a9`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-tasks.test.ts: Task heads and passed build rounds are created and createFromPlan alone moves the Task record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-tasks.test.ts: Task heads and passed build rounds are created and createFromPlan alone moves the Task record | `src/workflow/convert/__tests__/convert-tasks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-tasks.test.ts` | 0 | 2 | 1.3 s |  |

## t13

Run at 2026-10-22T07:17:08.416Z on commit `e469917d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-apply.test.ts: apply converts every artifact in the stated order and refuses while the delivery reader reads legacy stamps**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-apply.test.ts: apply converts every artifact in the stated order and refuses while the delivery reader reads legacy stamps | `src/workflow/convert/__tests__/convert-apply.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-apply.test.ts` | 0 | 2 | 1.5 s |  |

## t14

Run at 2026-10-22T07:22:51.550Z on commit `1142f09d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-marker.test.ts: the marker is written last and only when every head is clean**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-marker.test.ts: the marker is written last and only when every head is clean | `src/workflow/convert/__tests__/convert-marker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-marker.test.ts` | 0 | 2 | 3.2 s |  |

## t17

Run at 2026-10-22T07:26:57.611Z on commit `59103978`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: persist-review.test.ts: a failure at each step names the step and a rerun repairs the state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | persist-review.test.ts: a failure at each step names the step and a rerun repairs the state | `src/workflow/review/__tests__/persist-review.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/persist-review.test.ts` | 0 | 2 | 1.4 s |  |

## t18

Run at 2026-10-22T07:29:47.128Z on commit `70297548`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: lifecycle-fixtures.test.ts: each helper produces a head the lifecycle readers see in that state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lifecycle-fixtures.test.ts: each helper produces a head the lifecycle readers see in that state | `src/workflow/__tests__/lifecycle-fixtures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/lifecycle-fixtures.test.ts` | 0 | 2 | 2.8 s |  |

## t19

Run at 2026-10-22T07:34:59.691Z on commit `4615a47f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: load.test.ts: approval state comes from the lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | load.test.ts: approval state comes from the lifecycle | `src/workflow/delivery/__tests__/load.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/load.test.ts` | 0 | 7 | 0.7 s |  |

## t20

Run at 2026-10-22T07:40:50.130Z on commit `e90a6a7c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gate.test.ts: blocking comes from the lifecycle review and the review log entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gate.test.ts: blocking comes from the lifecycle review and the review log entry | `src/workflow/delivery/__tests__/gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/gate.test.ts` | 0 | 16 | 1.2 s |  |

## t21

Run at 2026-10-22T07:49:59.214Z on commit `b46e5274`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: snapshot.test.ts: the delivery snapshot of a lifecycle fixture equals the old snapshot of the same unit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | snapshot.test.ts: the delivery snapshot of a lifecycle fixture equals the old snapshot of the same unit | `src/workflow/delivery/__tests__/snapshot.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/snapshot.test.ts` | 0 | 9 | 0.6 s |  |

## t15

Run at 2026-10-22T07:53:16.752Z on commit `90640f37`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-verify.test.ts: an approved legacy head verifies with no difference and a planted difference is reported**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-verify.test.ts: an approved legacy head verifies with no difference and a planted difference is reported | `src/workflow/convert/__tests__/convert-verify.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-verify.test.ts` | 0 | 2 | 1.4 s |  |

## t16

Run at 2026-10-22T07:57:07.723Z on commit `0a8b65e0`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more | `src/workflow/convert/__tests__/convert-repeat.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-repeat.test.ts` | 0 | 2 | 2.8 s |  |

## t22

Run at 2026-10-22T08:01:02.593Z on commit `702bcec3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: pending.test.ts: pending approvals read the lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pending.test.ts: pending approvals read the lifecycle | `src/workflow/__tests__/pending.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/pending.test.ts` | 0 | 14 | 1.4 s |  |

## t23

Run at 2026-10-22T08:05:36.149Z on commit `fdbcbdfe`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: completion-evidence.test.ts: completion evidence reads the lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | completion-evidence.test.ts: completion evidence reads the lifecycle | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` | 0 | 3 | 1.3 s |  |

## t24

Run at 2026-10-22T08:10:57.173Z on commit `cb259ff6`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: resolve.test.ts: the review report is read from the review log entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolve.test.ts: the review report is read from the review log entry | `src/workflow/review/__tests__/resolve.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/resolve.test.ts` | 0 | 4 | 1.5 s |  |

## t25

Run at 2026-10-22T08:16:35.779Z on commit `e874e1ad`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: workflow-approve-dispatch.test.ts: the MCP approve dispatch reads the lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow-approve-dispatch.test.ts: the MCP approve dispatch reads the lifecycle | `src/mcp/__tests__/workflow-approve-dispatch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/workflow-approve-dispatch.test.ts` | 0 | 5 | 1.5 s |  |

## t26

Run at 2026-10-22T08:28:57.991Z on commit `6201b388`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gates.test.ts: approval goes through LifecycleService and stamps none of the removed fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gates.test.ts: approval goes through LifecycleService and stamps none of the removed fields | `src/workflow/__tests__/gates.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/gates.test.ts` | 0 | 25 | 2.4 s |  |

## t27

Run at 2026-10-22T08:35:25.723Z on commit `86f50f1d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gates-lifecycle-service.test.ts: rejection and stale acknowledgement go through LifecycleService**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gates-lifecycle-service.test.ts: rejection and stale acknowledgement go through LifecycleService | `src/workflow/__tests__/gates-lifecycle-service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/gates-lifecycle-service.test.ts` | 0 | 6 | 0.8 s |  |

## t28

Run at 2026-10-22T08:40:38.194Z on commit `ea08e1f8`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: review-gate.test.ts: a blocking lifecycle review withholds approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review-gate.test.ts: a blocking lifecycle review withholds approval | `src/workflow/__tests__/review-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/review-gate.test.ts` | 0 | 4 | 1.4 s |  |

## t29

Run at 2026-10-22T08:49:02.245Z on commit `ad920d67`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: review-step-findings.test.ts: the findings phase binds the review to the lifecycle through persistReview**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review-step-findings.test.ts: the findings phase binds the review to the lifecycle through persistReview | `src/daemon/steps/review-step/__tests__/review-step-findings.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/review-step/__tests__/review-step-findings.test.ts` | 0 | 10 | 4.1 s |  |

## t30

Run at 2026-10-22T08:53:25.262Z on commit `cf1076b6`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: review-decision.test.ts: a review decision records its resolution as a log entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review-decision.test.ts: a review decision records its resolution as a log entry | `src/workflow/__tests__/review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/review-decision.test.ts` | 0 | 11 | 5.4 s |  |

## t31

Run at 2026-10-22T08:57:48.987Z on commit `b126882d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bugfix-orchestration.test.ts: the bugfix chain advances from a lifecycle approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bugfix-orchestration.test.ts: the bugfix chain advances from a lifecycle approval | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/bugfix-orchestration.test.ts` | 0 | 24 | 2 s |  |

## t32

Run at 2026-10-22T09:07:45.170Z on commit `1cb89af1`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: build-record.test.ts: the completion record needs no legacy stamp**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-record.test.ts: the completion record needs no legacy stamp | `src/workflow/runners/build/__tests__/build-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/build-record.test.ts` | 0 | 43 | 3.1 s |  |

## t33

Run at 2026-10-22T09:10:09.636Z on commit `200f6041`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: range-base.test.ts: a Story's build range still resolves from meta.rangeBase**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | range-base.test.ts: a Story's build range still resolves from meta.rangeBase | `src/workflow/runners/build/__tests__/range-base.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/range-base.test.ts` | 0 | 46 | 7.1 s |  |

## t34

Run at 2026-10-22T09:15:44.465Z on commit `a0a448c7`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: task-set-approve.test.ts: plan approval syncs Task heads from the lifecycle approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | task-set-approve.test.ts: plan approval syncs Task heads from the lifecycle approval | `src/workflow/tasks/__tests__/task-set-approve.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tasks/__tests__/task-set-approve.test.ts` | 0 | 2 | 1.9 s |  |

## t35

Run at 2026-10-22T09:26:59.397Z on commit `b1d8ba1b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store.test.ts: amendments are heads with a lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store.test.ts: amendments are heads with a lifecycle | `src/workflow/amendments/__tests__/store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/amendments/__tests__/store.test.ts` | 0 | 14 | 2.1 s |  |

## t36

Run at 2026-10-22T09:37:28.612Z on commit `5d35bace`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: round-recording.test.ts: round recording runs with a mandatory lifecycle service**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | round-recording.test.ts: round recording runs with a mandatory lifecycle service | `src/workflow/artifact-core/__tests__/round-recording.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/round-recording.test.ts` | 0 | 9 | 0.9 s |  |

## t37

Run at 2026-10-22T09:41:51.338Z on commit `0d740d52`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: artifact-writer.test.ts: the writer tests run on lifecycle fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | artifact-writer.test.ts: the writer tests run on lifecycle fixtures | `src/workflow/__tests__/artifact-writer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-writer.test.ts` | 0 | 3 | 1.1 s |  |

## t38

Run at 2026-10-22T09:44:27.792Z on commit `29fd165f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: questions.test.ts: the question tests run on lifecycle fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | questions.test.ts: the question tests run on lifecycle fixtures | `src/workflow/__tests__/questions.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/questions.test.ts` | 0 | 8 | 1.3 s |  |

## t39

Run at 2026-10-22T09:55:36.561Z on commit `22e8028c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: body-fields.test.ts: no body.feedback field is declared or written**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | body-fields.test.ts: no body.feedback field is declared or written | `src/workflow/artifacts/provenance/__tests__/body-fields.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/provenance/__tests__/body-fields.test.ts` | 0 | 2 | 1.7 s |  |

## t40

Run at 2026-10-22T10:11:17.185Z on commit `e8401077`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: unit-issue.test.ts: the unit issue resolves from the binding with no Plan Task record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unit-issue.test.ts: the unit issue resolves from the binding with no Plan Task record | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/unit-issue.test.ts` | 0 | 13 | 1.9 s |  |

## t41

Run at 2026-10-22T10:47:18.161Z on commit `a281d3d5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: tracker-artifact.test.ts: the tracker lines read the binding, not the older refs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tracker-artifact.test.ts: the tracker lines read the binding, not the older refs | `src/workflow/__tests__/tracker-artifact.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/tracker-artifact.test.ts` | 0 | 9 | 1.2 s |  |

## t42

Run at 2026-10-22T10:53:13.220Z on commit `50c9a57a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: comment-sync-inbound.test.ts: comment sync reads and posts on the STORY head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | comment-sync-inbound.test.ts: comment sync reads and posts on the STORY head | `src/workflow/tracker/__tests__/comment-sync-inbound.test.ts` |

**integration: plan-artifact.test.ts: the PLAN task table shows each Task's status and revision from its head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | plan-artifact.test.ts: the PLAN task table shows each Task's status and revision from its head | `src/workflow/__tests__/plan-artifact.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/plan-artifact.test.ts` | 0 | 20 | 1.4 s |  |
| `src/workflow/tracker/__tests__/comment-sync-inbound.test.ts` | 0 | 4 | 1.3 s |  |

## t43

Run at 2026-10-22T10:56:57.150Z on commit `4fd99bb2`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repo-convert.test.ts: a bare repo.convert call runs a preview and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-convert.test.ts: a bare repo.convert call runs a preview and writes nothing | `src/daemon/__tests__/repo-convert.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-convert.test.ts` | 0 | 1 | 1.1 s |  |

## t44

Run at 2026-10-22T11:12:51.318Z on commit `c187bca9`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repo-schema-entry-points.test.ts: each daemon entry point refuses an unconverted repository with the conversion message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-schema-entry-points.test.ts: each daemon entry point refuses an unconverted repository with the conversion message | `src/daemon/__tests__/repo-schema-entry-points.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-schema-entry-points.test.ts` | 0 | 1 | 1.4 s |  |

## t45

Run at 2026-10-22T11:15:32.895Z on commit `af81cbbf`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repo-schema-guard.test.ts: the MCP artifact tools refuse an unconverted repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-schema-guard.test.ts: the MCP artifact tools refuse an unconverted repository | `src/mcp/__tests__/repo-schema-guard.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/repo-schema-guard.test.ts` | 0 | 1 | 1.6 s |  |

## t46

Run at 2026-10-22T11:24:12.560Z on commit `05355f6a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**integration: s9-handoffs.test.ts: the plans document names each s9 hand-off and no production file outside the conversion names a removed stamp**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9-handoffs.test.ts: the plans document names each s9 hand-off and no production file outside the conversion names a removed stamp | `src/workflow/__tests__/s9-handoffs.test.ts` |

**smoke: smoke: preview on a copy of this repository lists the expected 444 renames and 56 flat amendments**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/core-data-model.md, section 's9 build: hand-offs', item 1. Preview (handleRepoConvert, mode preview) on a git clone of this repository listed 453 renamed head files, equal to a direct count of S0nn head files in .insrc/artifacts; the 444 in the plan was an earlier analyzer figure. It listed 56 flat amendments (convert-amendment) and 0 problems. The same preview at the LLD-approval commit gave 453 too. The run also found PLAN-dfc0371b7200f5b5-s001 (a lowercase zero-padded id), now renamed by the conversion.

**smoke: smoke: apply on the copy reports no unexplained difference and every approved artifact keeps its revision number**

Reported by the builder, not run by the gate: **pass**. Evidence: Apply on a fresh clone of this repository (3m29s): 3532 files written, marker written, 0 problems, verification differences [] (the verifier compares approval, revision, review and open feedback per unit before and after). Output is in the t46 session; summary in docs/plans/core-data-model.md, s9 build: hand-offs, item 1.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/s9-handoffs.test.ts` | 0 | 1 | 0.9 s |  |
