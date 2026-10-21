<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s8 -->

# Tests: 2f27754d4ad00b8e s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T20:24:57.645Z on commit `a83a5351`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: feedback-source.test.ts: FeedbackService.add stores a source and a repeat of the same id with the same source appends nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | FeedbackService.add stores a source and a repeat of the same id with the same source appends nothing | `src/workflow/feedback/__tests__/feedback-source.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/feedback/__tests__/feedback-source.test.ts` | 0 | 2 | 1.2 s |  |

## t2

Run at 2026-10-21T20:27:02.523Z on commit `695872fa`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: port-post-comment.test.ts: the GitHub adapter's postComment answers the comment id and attach posts its marker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the GitHub adapter's postComment answers the comment id and attach posts its marker | `src/workflow/tracker/__tests__/port-post-comment.test.ts` |
| pass | the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list | `src/workflow/tracker/__tests__/github-comments.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-comments.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/tracker/__tests__/port-post-comment.test.ts` | 0 | 1 | 1.2 s |  |

## t3

Run at 2026-10-21T20:29:11.040Z on commit `e6c815a7`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: integrity-receipts.test.ts: a revision-less receipt or build round after the last content entry does not make a head that differs from that entry pass the integrity check**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a revision-less receipt or build round after the last content entry does not make a head that differs from that entry pass the integrity check | `src/workflow/artifact-core/__tests__/integrity-receipts.test.ts` |
| pass | checkHeadIntegrity and checkIntegrity report every reason and treat unhashed and unlogged heads as ok | `src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/integrity-receipts.test.ts` | 0 | 2 | 0.8 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts` | 0 | 2 | 0.9 s |  |

## t4

Run at 2026-10-21T20:30:48.315Z on commit `e918d096`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: comment-rules.test.ts: classifyComment gives revision-request, suggestion or comment from the first line only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classifyComment gives revision-request, suggestion or comment from the first line only | `src/workflow/tracker/__tests__/comment-rules.test.ts` |

**unit: comment-rules.test.ts: isFrameworkComment recognises every insrc marker and no human text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | isFrameworkComment recognises every insrc marker and no human text | `src/workflow/tracker/__tests__/comment-rules.test.ts` |

**unit: comment-rules.test.ts: the author and the entry id are derived from a tracker comment, a mixed-case login lowercased**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the author and the entry id are derived from a tracker comment, a mixed-case login lowercased | `src/workflow/tracker/__tests__/comment-rules.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/comment-rules.test.ts` | 0 | 4 | 1 s |  |

## t5

Run at 2026-10-21T20:33:39.174Z on commit `664f179e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: comment-sync-inbound.test.ts: a human comment is recorded once as feedback with the tracker user as author, framework comments are never recorded, an edited comment is not mirrored, and a tracker failure is reported without failing the call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a human comment is recorded once as feedback with the tracker user as author, framework comments are never recorded, an edited comment is not mirrored, and a tracker failure is reported without failing the call | `src/workflow/tracker/__tests__/comment-sync-inbound.test.ts` |
| pass | a comment that failed to record is picked up on the next sync, and a unit with no binding or no artifact says so | `src/workflow/tracker/__tests__/comment-sync-inbound.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/comment-sync-inbound.test.ts` | 0 | 3 | 0.6 s |  |

## t6

Run at 2026-10-21T20:36:12.455Z on commit `98d15550`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: comment-sync-outbound.test.ts: feedback entered here is posted once and its receipt is written, a post whose receipt was lost is found by its marker and not posted again, and failures leave the call repeatable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback entered here is posted once and its receipt is written, a post whose receipt was lost is found by its marker and not posted again, and failures leave the call repeatable | `src/workflow/tracker/__tests__/comment-sync-outbound.test.ts` |
| pass | a post whose receipt was lost, or whose answer was lost, is found by its marker and not posted again | `src/workflow/tracker/__tests__/comment-sync-outbound.test.ts` |
| pass | a failed post writes no receipt and is retried, and an unreadable comment list posts nothing | `src/workflow/tracker/__tests__/comment-sync-outbound.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/comment-sync-outbound.test.ts` | 0 | 4 | 0.9 s |  |

## t7

Run at 2026-10-21T20:40:14.623Z on commit `ebd69b5b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: comment-sync-callers.test.ts: implement and validate run the comment sync for the Task and the daemon method tracker.syncComments runs it on request, and neither is failed by it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | comment-sync-callers.test.ts: implement and validate run the comment sync for the Task and the daemon method tracker.syncComments runs it on request, and neither is failed by it | `src/daemon/steps/build-step/__tests__/comment-sync-callers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/comment-sync-callers.test.ts` | 0 | 1 | 1.8 s |  |

## t8

Run at 2026-10-21T20:41:20.371Z on commit `fb2af039`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s8-handoffs.test.ts: the plans document names each s8 hand-off to s9**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8-handoffs.test.ts: the plans document names each s8 hand-off to s9 | `src/workflow/__tests__/s8-handoffs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/s8-handoffs.test.ts` | 0 | 1 | 1 s |  |
