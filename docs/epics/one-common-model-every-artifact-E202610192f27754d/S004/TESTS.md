<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s4 -->

# Tests: 2f27754d4ad00b8e s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 26 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T09:28:45.059Z on commit `2d43606c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sidecar-append.test.ts: appendRecord writes one framed line, counts bytes for multi-byte text, starts a new line after a torn one, and refuses an oversize entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | appendRecord writes one framed line, counts bytes for multi-byte text, starts a new line after a torn one, and refuses an oversize entry | `src/workflow/artifact-core/__tests__/sidecar-append.test.ts` |
| pass | appendSidecarLine appends one framed JSON line per call to the path it is given | `src/workflow/artifact-core/__tests__/sidecar.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/sidecar-append.test.ts` | 0 | 3 | 0.6 s |  |
| `src/workflow/artifact-core/__tests__/sidecar.test.ts` | 0 | 2 | 0.8 s |  |

## t2

Run at 2026-10-21T09:30:34.232Z on commit `6cb5ab5d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sidecar-files.test.ts: filesOf maps an id to its head, log and feedback files and a TASK id to its Story's Tasks files, and mergeAttributes returns the two union rules**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | filesOf maps an id to its head, log and feedback files and a TASK id to its Story's Tasks files, and mergeAttributes returns the two union rules | `src/workflow/artifact-core/__tests__/sidecar-files.test.ts` |

**unit: sidecar-read.test.ts: readRecords filters by artifact id, collapses repeated entries, orders by timestamp then id, skips an abandoned fragment and merge debris, and refuses a complete frame with bad json and a conflicting duplicate**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readRecords filters by artifact id, collapses repeated entries, orders by timestamp then id, skips an abandoned fragment and merge debris, and refuses a complete frame with bad json and a conflicting duplicate | `src/workflow/artifact-core/__tests__/sidecar-read.test.ts` |

**unit: sidecar-append.test.ts: a torn append, a later append, a re-read and a journal retry leave the entry once and the file readable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a torn append, a later append, a re-read and a journal retry leave the entry once and the file readable | `src/workflow/artifact-core/__tests__/sidecar-append.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/sidecar-append.test.ts` | 0 | 3 | 0.7 s |  |
| `src/workflow/artifact-core/__tests__/sidecar-files.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/artifact-core/__tests__/sidecar-read.test.ts` | 0 | 2 | 2.2 s |  |

## t3

Run at 2026-10-21T09:33:30.265Z on commit `0377a90b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: journal-durable.test.ts: the journal stages, reports and clears one file per artifact and refuses an invalid file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the journal stages, reports and clears one file per artifact and refuses an invalid file | `src/workflow/artifact-core/__tests__/journal-durable.test.ts` |

**unit: journal-recovery-durable.test.ts: a staged write is finished at each crash point and refused with LifecycleConflictError when the head moved on, and the head is never overwritten**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a staged write is finished at each crash point and refused with LifecycleConflictError when the head moved on, and the head is never overwritten | `src/workflow/artifact-core/__tests__/journal-recovery-durable.test.ts` |
| pass | a failure at stage, log append, head replace and clear each leaves the documented state and the next write completes the staged operation once | `src/workflow/artifact-core/__tests__/journal.test.ts` |

**unit: journal-recovery-durable.test.ts: an oversized entry is rejected before it is staged and a later valid write of the artifact goes through**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an oversized entry is rejected before it is staged and a later valid write of the artifact goes through | `src/workflow/artifact-core/__tests__/journal-recovery-durable.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/journal-durable.test.ts` | 0 | 2 | 0.5 s |  |
| `src/workflow/artifact-core/__tests__/journal-recovery-durable.test.ts` | 0 | 3 | 0.6 s |  |
| `src/workflow/artifact-core/__tests__/journal.test.ts` | 0 | 3 | 0.5 s |  |

## t4

Run at 2026-10-21T09:37:20.030Z on commit `c158c75c`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: history-order.test.ts: openFeedback orders a feedback entry and a log entry with the same timestamp by the shared rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openFeedback orders a feedback entry and a log entry with the same timestamp by the shared rule | `src/workflow/artifact-core/__tests__/history-order.test.ts` |

**unit: journal-recovery-durable.test.ts: LifecycleService.inspect finishes a staged write before it reads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | LifecycleService.inspect finishes a staged write before it reads | `src/workflow/artifact-core/__tests__/journal-recovery-durable.test.ts` |

**unit: journal-recovery-durable.test.ts: an ordinary write on an artifact whose log is ahead of its head is refused and a conflict-resolved write is accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an ordinary write on an artifact whose log is ahead of its head is refused and a conflict-resolved write is accepted | `src/workflow/artifact-core/__tests__/journal-recovery-durable.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/history-order.test.ts` | 0 | 2 | 0.5 s |  |
| `src/workflow/artifact-core/__tests__/journal-recovery-durable.test.ts` | 0 | 5 | 0.5 s |  |

## t5

Run at 2026-10-21T09:39:13.167Z on commit `a5db745d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sidecar-files.test.ts: the ensure step adds only the missing lines to .gitattributes and .gitignore, is idempotent, and an unwritable file is a warning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the ensure step adds only the missing lines to .gitattributes and .gitignore, is idempotent, and an unwritable file is a warning | `src/workflow/artifact-core/__tests__/sidecar-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/sidecar-files.test.ts` | 0 | 3 | 0.7 s |  |

## t6

Run at 2026-10-21T09:40:22.861Z on commit `79c90986`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: sidecar-merge.test.ts: two clones that append different log and feedback entries to one artifact merge with no conflict and a reader sees every entry once, in timestamp then id order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two clones that append different log and feedback entries to one artifact merge with no conflict and a reader sees every entry once, in timestamp then id order | `src/workflow/artifact-core/__tests__/sidecar-merge.test.ts` |

**integration: sidecar-merge.test.ts: a head changed in two clones conflicts in git and the line files of the same merge still union**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a head changed in two clones conflicts in git and the line files of the same merge still union | `src/workflow/artifact-core/__tests__/sidecar-merge.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/sidecar-merge.test.ts` | 0 | 3 | 0.7 s |  |

## t7

Run at 2026-10-21T09:42:18.237Z on commit `cc43483c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: lifecycle-update-outcome.test.ts: updateContent with an outcome and references logs them with the new revision, an update without behaves as before, and an identical rewrite logs nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | updateContent with an outcome and references logs them with the new revision, an update without behaves as before, and an identical rewrite logs nothing | `src/workflow/artifact-core/__tests__/lifecycle-update-outcome.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/lifecycle-update-outcome.test.ts` | 0 | 2 | 0.5 s |  |

## t8

Run at 2026-10-21T09:47:14.371Z on commit `a1c7ec30`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: lifecycle-wiring.test.ts: the daemon approve handler, the review-decision step and workflowReviewStart use the repository's durable LifecycleService, refuse a head ahead of its log, use the request's person actor or insrc:approval, and a repository whose registry entry cannot be created is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the daemon approve handler, the review-decision step and workflowReviewStart use the repository's durable LifecycleService, refuse a head ahead of its log, use the request's person actor or insrc:approval, and a repository whose registry entry cannot be created is refused | `src/daemon/__tests__/lifecycle-wiring.test.ts` |
| pass | daemon handlers: 'workflow.reviewDecision' is registered and delegates to handleReviewDecision, and the 'workflow.approve', 'workflow.resolveComment' and 'artifact.feedback.append' handlers are unchanged | `src/workflow/__tests__/review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/lifecycle-wiring.test.ts` | 0 | 1 | 0.7 s |  |
| `src/workflow/__tests__/review-decision.test.ts` | 0 | 9 | 0.8 s |  |

## t9

Run at 2026-10-21T09:51:47.347Z on commit `9ca3872c`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: verdicts-lifecycle.test.ts: handleVerdicts with a service stores an applied fix through the service, stamps the review and records it on the lifecycle, and refuses a head that is ahead of its log**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleVerdicts with a service stores an applied fix through the service, stamps the review and records it on the lifecycle, and refuses a head that is ahead of its log | `src/daemon/steps/review-step/__tests__/verdicts-lifecycle.test.ts` |
| pass | a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged | `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` |
| pass | the verdicts path bumps the revision only when auto-fixes change the body | `src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` | 0 | 1 | 3.3 s |  |
| `src/daemon/steps/review-step/__tests__/verdicts-lifecycle.test.ts` | 0 | 1 | 3.6 s |  |
| `src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts` | 0 | 1 | 3.6 s |  |

## t10

Run at 2026-10-21T10:14:59.888Z on commit `a18861fa`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: round-recording.test.ts: persistBuildRecord and persistTestRecordTask with a RoundWriter store the content through the service and log the round, and the earlier round stays readable in the log**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | persistBuildRecord and persistTestRecordTask with a RoundWriter store the content through the service and log the round, and the earlier round stays readable in the log | `src/workflow/artifact-core/__tests__/round-recording.test.ts` |

**integration: round-recording.test.ts: a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry, and the next persist renders the markdown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry, and the next persist renders the markdown | `src/workflow/artifact-core/__tests__/round-recording.test.ts` |

**integration: round-recording.test.ts: a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so the next approval is not refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so the next approval is not refused | `src/workflow/artifact-core/__tests__/round-recording.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/round-recording.test.ts` | 0 | 4 | 1.3 s |  |

## t11

Run at 2026-10-21T10:19:22.844Z on commit `bc83d24b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: round-recording.test.ts: runCodeReview with a RoundWriter stores the content through the service and logs the round on the daemon route and the controller route, and a failed store replaces no record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runCodeReview with a RoundWriter stores the content through the service and logs the round on the daemon route and the controller route, and a failed store replaces no record | `src/workflow/artifact-core/__tests__/round-recording.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/round-recording.test.ts` | 0 | 5 | 1.4 s |  |

## t12

Run at 2026-10-21T10:22:30.559Z on commit `9f5ee465`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: artifact-write-inventory.test.ts: the sidecar files, the journal folder and the changed round writers are classified and appendSidecarLine remains the one raw append for history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the sidecar files, the journal folder and the changed round writers are classified and appendSidecarLine remains the one raw append for history | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 5 | 2.5 s |  |
