<!-- insrc:artifact PLAN-1102dc7125ad0c07-S001 -->

# Plan: E202610171102dc71:S001

## Summary

**Epic:** `ground-code-review-coverage-story-s`
**LLD run:** `wf-1792218876375-d37wgw`
**LLD effective hash:** `a29e966a7a4e...`

Building this Story is six small changes along two paths. The review's subject learns to read the Story's BUILD and TESTS records, and the coverage prompt shows each test file's latest run from them. The index queue learns to report a repository's own code-index work, freshness uses that instead of the whole queue, and every fallback to the diff review records why, carried through the step, the daemon request and the stored record.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** The review subject carries the Story's BUILD and TESTS records | S | — | unit: src/workflow/code-review/__tests__/subject.test.ts: the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built | [[c1]] |
| 2 | **`t2`** Coverage shows each test file's latest run from the TESTS record | M | `t1` | unit: src/workflow/code-review/dimensions/__tests__/coverage.test.ts: the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable' | [[c2]] |
| 3 | **`t3`** The index queue reports a repository's code-index work | S | — | unit: src/daemon/__tests__/queue-code-index-work.test.ts: codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor | [[c3]] |
| 4 | **`t4`** Freshness counts only the repository's code-index work, through both clients | M | `t3` | unit: src/workflow/code-review/__tests__/freshness.test.ts: computeCodeReviewFreshness reports isProcessing and pendingCodeIndexJobs from codeIndexWork and leaves staleFiles as before; unit: src/shared/__tests__/review-stream-freshness.test.ts: freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0 | [[c4]] |
| 5 | **`t5`** The step decides and carries the fallback reason | M | `t4` | unit: src/daemon/steps/code-review-step/__tests__/handler.test.ts: a proceed:true wait that times out falls back with fallbackReason freshness-timeout carrying waitedMs, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a fresh full review carries none; the daemon-reviewed path forwards the reason; unit: src/daemon/steps/code-review-step/__tests__/handler.test.ts: on the controller-reviewed path, a timed-out wait saves the reason in the state and the judgements turn writes it to the record and the done frame, distinguishing queued-only from in-flight work | [[c5]] |
| 6 | **`t6`** The daemon-reviewed path carries the fallback reason to the record | M | `t5` | unit: src/shared/__tests__/review-stream.test.ts: codeReviewRequestParams forwards fallbackReason exactly and omits the key when absent (fails if serialization drops it); unit: src/daemon/__tests__/code-review-rpc-fallback.test.ts: codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason; unit: src/daemon/__tests__/code-review-rpc-fallback.test.ts: a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason | [[c5]] |

### 1.1 E202610171102dc71:S001:T001 — The review subject carries the Story's BUILD and TESTS records

CodeReviewSubject.buildRecord becomes the general BuildRecord | null and gains testRecord: TestRecord | null; SubjectDeps gains an optional readTestRecord; DEFAULT_DEPS supplies readBuildRecord (the Story's BUILD json, null with a warning when absent or misshapen) and readTestRecord.

**Acceptance checks:**
- With BUILD and TESTS records on disk, resolveCodeReviewSubject with default deps returns both on the subject.
- An absent or misshapen BUILD json gives buildRecord null and the subject is still built; an absent or unreadable TESTS record gives testRecord null.
- subject-paths.ts keeps resolving the record's folder from buildRecord.meta.

### 1.2 E202610171102dc71:S001:T002 — Coverage shows each test file's latest run from the TESTS record

buildCoveragePrompt replaces the one-line build-record signal with a trailing section built per test file: the latest run by ranAt (valid ranAt beats missing; tie or no ranAt -> the failing run), chosen before normalisation; that run alone decides the file; a timed-out, non-zero or title-less latest run makes the file failing/unverified; titles only in older runs are unverified; a malformed latest entry is an unverified barrier; entries without a file name are dropped with a note; the BUILD record's per-task passed is shown, or 'unavailable'. With no TESTS record, today's every-test-unverified rule stays.

**Acceptance checks:**
- A re-run task stored first with a newer ranAt decides its file's results.
- A newer timed-out or title-less run supersedes an older passing title, which is not shown as passing.
- A newer malformed entry for a file makes the file unverified; the older pass is not shown.
- A tie or missing ranAt is decided by the failing run.
- Per-task passed from the BUILD record is shown; no tasks or no passed shows 'unavailable'.
- With testRecord null the prompt keeps the every-test-unverified rule.

### 1.3 E202610171102dc71:S001:T003 — The index queue reports a repository's code-index work

IndexQueue records the job in flight for the duration of processor(job), clearing it in finally, and gains codeIndexWorkFor(repoPath) => { inFlight, pending } counting kind full/reconcile naming repoPath and kind file under repoPath (repoPath or repoPath + separator). depthForRepo is unchanged.

**Acceptance checks:**
- Pending and in-flight full, reconcile and file jobs for the repository are counted.
- Other repositories, a prefix-sharing repository, config, reembed and document-summary jobs are not.
- After a throwing processor the in-flight job is cleared.
- depthForRepo returns what it did before.

### 1.4 E202610171102dc71:S001:T004 — Freshness counts only the repository's code-index work, through both clients

FreshnessDeps.isProcessing is replaced by codeIndexWork(repoPath); FreshnessResult adds inFlight and pendingCodeIndexJobs (isProcessing = inFlight || pending > 0); the codeReview.freshness handler supplies queue.codeIndexWorkFor; CodeReviewFreshnessResult and freshnessFromReply carry the two fields, mapping an older reply to inFlight = isProcessing and 0.

**Acceptance checks:**
- computeCodeReviewFreshness reports isProcessing, inFlight and pendingCodeIndexJobs from codeIndexWork; staleFiles is unchanged.
- The codeReview.freshness reply carries inFlight and pendingCodeIndexJobs.
- freshnessFromReply keeps the new fields and maps an older reply to inFlight = isProcessing and pendingCodeIndexJobs 0.

### 1.5 E202610171102dc71:S001:T005 — The step decides and carries the fallback reason

A CodeReviewFallbackReason type (freshness-timeout {waitedMs, inFlight, pendingCodeIndexJobs, staleFiles} | declined | hollow-grounding); beginDiffOnlyReview takes it from its three callers in the step handler; it is carried on the done frame and saved in the step state across the judgements turn; on the controller-reviewed path it reaches the record through RunCodeReviewOpts.fallbackReason and buildArtifact (optional CodeReviewBody.fallbackReason).

**Acceptance checks:**
- A timed-out wait falls back with freshness-timeout carrying waitedMs, inFlight, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a full review carries none.
- On the controller-reviewed path the reason survives the judgements turn into the record and the done frame.
- A record without fallbackReason reads and renders as before.

### 1.6 E202610171102dc71:S001:T006 — The daemon-reviewed path carries the fallback reason to the record

CodeReviewStreamParams gains fallbackReason and codeReviewRequestParams forwards it; codeReview.run's CodeReviewRunParams and parseParams accept and validate it and pass it to runCodeReview, so the daemon-written record's body.fallbackReason equals the step's done-frame reason.

**Acceptance checks:**
- codeReviewRequestParams forwards fallbackReason exactly and omits the key when absent.
- codeReview.run stores params.fallbackReason as body.fallbackReason, refuses a malformed one, and writes none without it.
- A step-to-daemon run through the real serializer and codeReview.run writes body.fallbackReason identical to the done frame's.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/code-review/__tests__/subject.test.ts: the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built | `t1` |
| src/workflow/code-review/dimensions/__tests__/coverage.test.ts: the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable' | `t2` |
| src/daemon/__tests__/queue-code-index-work.test.ts: codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: computeCodeReviewFreshness reports isProcessing and pendingCodeIndexJobs from codeIndexWork and leaves staleFiles as before | `t4` |
| src/daemon/steps/code-review-step/__tests__/handler.test.ts: a proceed:true wait that times out falls back with fallbackReason freshness-timeout carrying waitedMs, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a fresh full review carries none; the daemon-reviewed path forwards the reason | `t5` |
| src/shared/__tests__/review-stream-freshness.test.ts: freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0 | `t4` |
| src/daemon/__tests__/code-review-rpc-fallback.test.ts: codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason | `t6` |
| src/daemon/steps/code-review-step/__tests__/handler.test.ts: on the controller-reviewed path, a timed-out wait saves the reason in the state and the judgements turn writes it to the record and the done frame, distinguishing queued-only from in-flight work | `t5` |
| src/shared/__tests__/review-stream.test.ts: codeReviewRequestParams forwards fallbackReason exactly and omits the key when absent (fails if serialization drops it) | `t6` |
| src/daemon/__tests__/code-review-rpc-fallback.test.ts: a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api resolveCodeReviewSubject and dataModelChanges CodeReviewSubject/SubjectDeps`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api buildCoveragePrompt`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api IndexQueue.codeIndexWorkFor`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails.api computeCodeReviewFreshness, codeReview.freshness and freshnessFromReply; dataModelChanges FreshnessDeps/FreshnessResult`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails.api beginDiffOnlyReview, runCodeReview and codeReviewRequestParams; dataModelChanges CodeReviewFallbackReason`
