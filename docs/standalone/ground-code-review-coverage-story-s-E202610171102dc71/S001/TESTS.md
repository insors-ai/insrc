<!-- insrc:artifact TESTS-1102dc7125ad0c07-S001 -->

# Tests: 1102dc7125ad0c07 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T06:57:58.056Z on commit `e52f50e2`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/subject.test.ts: the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built | `src/workflow/code-review/__tests__/subject.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/subject.test.ts` | 0 | 20 | 1.4 s |  |

## t2

Run at 2026-10-17T07:02:30.802Z on commit `2142a074`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/dimensions/__tests__/coverage.test.ts: the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable' | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | buildCoveragePrompt: a null test record degrades the pass-state to unverified in the prompt | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` | 0 | 19 | 0.9 s |  |

## t3

Run at 2026-10-17T07:07:48.129Z on commit `ebc27d78`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/queue-code-index-work.test.ts: codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor | `src/daemon/__tests__/queue-code-index-work.test.ts` |
| pass | codeIndexWorkFor clears the in-flight job when the processor throws | `src/daemon/__tests__/queue-code-index-work.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-code-index-work.test.ts` | 0 | 2 | 0.7 s |  |

## t4

Run at 2026-10-17T07:15:16.317Z on commit `5d28d6c2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/freshness.test.ts: computeCodeReviewFreshness reports isProcessing and pendingCodeIndexJobs from codeIndexWork and leaves staleFiles as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | computeCodeReviewFreshness reports isProcessing and pendingCodeIndexJobs from codeIndexWork and leaves staleFiles as before | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/shared/__tests__/review-stream-freshness.test.ts: freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0 | `src/shared/__tests__/review-stream-freshness.test.ts` |
| pass | in-daemon review client: the codeReview.freshness reply keeps inFlight and pendingCodeIndexJobs (ISSUE-1102dc71) | `src/daemon/steps/__tests__/in-daemon-client.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/in-daemon-client.test.ts` | 0 | 8 | 1 s |  |
| `src/shared/__tests__/review-stream-freshness.test.ts` | 0 | 1 | 0.4 s |  |
| `src/workflow/code-review/__tests__/freshness.test.ts` | 0 | 9 | 0.4 s |  |

## t5

Run at 2026-10-17T07:22:14.986Z on commit `cf468dc3`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/code-review-step/__tests__/handler.test.ts: a proceed:true wait that times out falls back with fallbackReason freshness-timeout carrying waitedMs, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a fresh full review carries none; the daemon-reviewed path forwards the reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a proceed:true wait that times out falls back with fallbackReason freshness-timeout carrying waitedMs, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a fresh full review carries none; the daemon-reviewed path forwards the reason | `src/daemon/steps/code-review-step/__tests__/handler.test.ts` |

**unit: src/daemon/steps/code-review-step/__tests__/handler.test.ts: on the controller-reviewed path, a timed-out wait saves the reason in the state and the judgements turn writes it to the record and the done frame, distinguishing queued-only from in-flight work**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on the controller-reviewed path, a timed-out wait saves the reason in the state and the judgements turn writes it to the record and the done frame, distinguishing queued-only from in-flight work | `src/daemon/steps/code-review-step/__tests__/handler.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/code-review-step/__tests__/handler.test.ts` | 0 | 30 | 0.7 s |  |

## t6

Run at 2026-10-17T07:30:22.039Z on commit `35a3a1ea`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/shared/__tests__/review-stream.test.ts: codeReviewRequestParams forwards fallbackReason exactly and omits the key when absent (fails if serialization drops it)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codeReviewRequestParams forwards fallbackReason exactly and omits the key when absent (fails if serialization drops it) | `src/shared/__tests__/review-stream.test.ts` |

**unit: src/daemon/__tests__/code-review-rpc-fallback.test.ts: codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason | `src/daemon/__tests__/code-review-rpc-fallback.test.ts` |

**unit: src/daemon/__tests__/code-review-rpc-fallback.test.ts: a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason | `src/daemon/__tests__/code-review-rpc-fallback.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/code-review-rpc-fallback.test.ts` | 0 | 2 | 0.7 s |  |
| `src/shared/__tests__/review-stream.test.ts` | 0 | 7 | 0.5 s |  |
