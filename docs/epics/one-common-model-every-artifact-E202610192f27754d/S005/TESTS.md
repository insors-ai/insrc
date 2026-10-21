<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s5 -->

# Tests: 2f27754d4ad00b8e s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T12:07:40.117Z on commit `91263a04`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: feedback-reply-shape.test.ts: History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies | `src/workflow/artifact-core/__tests__/feedback-reply-shape.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/feedback-reply-shape.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-10-21T12:14:11.102Z on commit `adbac821`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: addresses-rule.test.ts: ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation | `src/workflow/artifact-core/__tests__/addresses-rule.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/addresses-rule.test.ts` | 0 | 2 | 1.2 s |  |

## t3

Run at 2026-10-21T12:17:30.633Z on commit `4e1492ea`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: automated-writers-addresses.test.ts: a review auto-fix on either path and a BUILD, TESTS or code-review round leave open feedback open**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review auto-fix on either path and a BUILD, TESTS or code-review round leave open feedback open | `src/workflow/artifact-core/__tests__/automated-writers-addresses.test.ts` |
| pass | persistBuildRecord and persistTestRecordTask with a RoundWriter store the content through the service and log the round, and the earlier round stays readable in the log | `src/workflow/artifact-core/__tests__/round-recording.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/automated-writers-addresses.test.ts` | 0 | 1 | 1.5 s |  |
| `src/workflow/artifact-core/__tests__/round-recording.test.ts` | 0 | 8 | 1.8 s |  |

## t4

Run at 2026-10-21T12:20:44.657Z on commit `64dc48a0`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: feedback-threads.test.ts: FeedbackService.threads nests replies under their root in time-then-id order, returns an orphan reply as an orphan root, never lists a reply on its own as open, and filters to open threads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | FeedbackService.threads nests replies under their root in time-then-id order, returns an orphan reply as an orphan root, never lists a reply on its own as open, and filters to open threads | `src/workflow/feedback/__tests__/feedback-threads.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/feedback/__tests__/feedback-threads.test.ts` | 0 | 2 | 2.9 s |  |

## t5

Run at 2026-10-21T12:38:24.028Z on commit `37fc75ab`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: feedback-service.test.ts: FeedbackService.add stores one root entry with the author, a minted id and time and the head's revision, defaults the kind to comment, and refuses blank text, a non-namespaced actor and a malformed anchor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | FeedbackService.add stores one root entry with the author, a minted id and time and the head's revision, defaults the kind to comment, and refuses blank text, a non-namespaced actor and a malformed anchor | `src/workflow/feedback/__tests__/feedback-service.test.ts` |

**unit: feedback-service.test.ts: FeedbackService.add stores a reply as its own line with inReplyTo, refuses a missing parent, a parent on another artifact and a reply to a reply, and a repeated caller id returns the stored entry or is refused when the content differs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | FeedbackService.add stores a reply as its own line with inReplyTo, refuses a missing parent, a parent on another artifact and a reply to a reply, and a repeated caller id returns the stored entry or is refused when the content differs | `src/workflow/feedback/__tests__/feedback-service.test.ts` |

**integration: feedback-storage.test.ts: feedback on a design, a plan and a single Task is recorded once as a framed line in the right file, survives a restart, and a Task's line lands in its Story's Tasks file and reads back for that Task only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback on a design, a plan and a single Task is recorded once as a framed line in the right file, survives a restart, and a Task's line lands in its Story's Tasks file and reads back for that Task only | `src/workflow/feedback/__tests__/feedback-storage.test.ts` |

**integration: feedback-storage.test.ts: a revision of an artifact addresses all its open feedback by default and only the listed roots when a list is given, in the shared (timestamp, id) order with the feedback file read first or last**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a revision of an artifact addresses all its open feedback by default and only the listed roots when a list is given, in the shared (timestamp, id) order with the feedback file read first or last | `src/workflow/feedback/__tests__/feedback-storage.test.ts` |

**integration: feedback-merge.test.ts: two clones that add feedback and replies to one artifact merge with no conflict and the threads read back once each in order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two clones that add feedback and replies to one artifact merge with no conflict and the threads read back once each in order | `src/workflow/feedback/__tests__/feedback-merge.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/feedback/__tests__/feedback-merge.test.ts` | 0 | 2 | 1.2 s |  |
| `src/workflow/feedback/__tests__/feedback-service.test.ts` | 0 | 3 | 1.1 s |  |
| `src/workflow/feedback/__tests__/feedback-storage.test.ts` | 0 | 3 | 1.1 s |  |

## t6

Run at 2026-10-21T12:41:04.731Z on commit `4dc1e4bb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: identity-service.test.ts: IdentityService.currentActor builds github:<login> from the tracker's whoAmI, falls back to git then os when the tracker does not answer, and copies the declared aliases only onto the declared primary or an alias**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | IdentityService.currentActor builds github:<login> from the tracker's whoAmI, falls back to git then os when the tracker does not answer, and copies the declared aliases only onto the declared primary or an alias | `src/workflow/identity/__tests__/identity-service.test.ts` |

**unit: identity-service.test.ts: IdentityService.declare validates namespaced lower-case ids, rejects duplicates and more than twenty aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | IdentityService.declare validates namespaced lower-case ids, rejects duplicates and more than twenty aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty | `src/workflow/identity/__tests__/identity-service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/identity/__tests__/identity-service.test.ts` | 0 | 3 | 0.7 s |  |

## t7

Run at 2026-10-21T12:43:24.859Z on commit `8c4fb73b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: feedback-wiring.test.ts: the daemon's artifact.feedback.add, artifact.feedback.list, identity.show and identity.declare handlers use the repository's FeedbackService and the identity service**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the daemon's artifact.feedback.add, artifact.feedback.list, identity.show and identity.declare handlers use the repository's FeedbackService and the identity service | `src/daemon/__tests__/feedback-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/feedback-wiring.test.ts` | 0 | 2 | 1.2 s |  |

## t8

Run at 2026-10-21T12:46:25.291Z on commit `544ecd21`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: feedback-wiring.test.ts: the daemon's artifact.feedback.append handler stores a legacy request as a Feedback line with the mapped kind and anchor, keeps a companion-file target in anchor.section, and keeps its request and error shapes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the daemon's artifact.feedback.append handler stores a legacy request as a Feedback line with the mapped kind and anchor, keeps a companion-file target in anchor.section, and keeps its request and error shapes | `src/daemon/__tests__/feedback-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/feedback-wiring.test.ts` | 0 | 3 | 1.6 s |  |

## t9

Run at 2026-10-21T12:50:19.690Z on commit `993d3fff`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: review-decision.test.ts: handleReviewDecision stores its comments as Feedback entries by the request's actor or the current actor, with kind revision-request for send-feedback and one batchId, and still reports commentsError when saving fails after the decision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleReviewDecision stores its comments as Feedback entries by the request's actor or the current actor, with kind revision-request for send-feedback and one batchId, and still reports commentsError when saving fails after the decision | `src/workflow/__tests__/review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/review-decision.test.ts` | 0 | 10 | 0.9 s |  |

## t10

Run at 2026-10-21T12:52:38.863Z on commit `87b58b47`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gate-identity.test.ts: the team gate decides on the tracker's whoAmI only: declaring the claimant's login as an alias of another person does not change the gate's outcome, and nothing under src/workflow/team imports the identity module**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the team gate decides on the tracker's whoAmI only: declaring the claimant's login as an alias of another person does not change the gate's outcome, and nothing under src/workflow/team imports the identity module | `src/workflow/identity/__tests__/gate-identity.test.ts` |

**integration: artifact-write-inventory.test.ts: the identity file writer is classified and appendSidecarLine remains the one raw append for history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the identity file writer is classified and appendSidecarLine remains the one raw append for history | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 6 | 3.5 s |  |
| `src/workflow/identity/__tests__/gate-identity.test.ts` | 0 | 1 | 1.3 s |  |
