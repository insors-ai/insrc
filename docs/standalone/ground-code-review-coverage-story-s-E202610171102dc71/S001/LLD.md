<!-- insrc:artifact LLD-1102dc7125ad0c07-S001 -->

# LLD: E202610171102dc71:S001

## Summary

**Epic:** `ground-code-review-coverage-story-s`
**HLD base run:** `wf-1792218876375-d37wgw`
**HLD effective hash:** `a29e966a7a4e...`

The code review stops calling every test unverified and stops waiting on unrelated work. Its subject now carries the Story's BUILD and TESTS records, and the coverage judge is shown each test file's latest results from the gate. The wait for a fresh index looks only at indexing work that changes the Story repository's code graph, so other repositories and document summaries no longer push a review into the diff fallback; and a review that does fall back records why.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `resolveCodeReviewSubject`

```typescript
resolveCodeReviewSubject(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps): Promise<{ ok: true; subject: CodeReviewSubject } | { ok: false; reason: 'no-build-record' | string }>
```

**Parameters:**
- `repoPath: string` — The repository under review.
- `epicHash: string` — The Epic or standalone work item hash.
- `storyId: string` — The Story under review.
- `deps: SubjectDeps` _(optional)_ — Seams; DEFAULT_DEPS now supplies readBuildRecord and a new readTestRecord.

**Returns:** `{ ok: true; subject: CodeReviewSubject } | { ok: false; reason }` — Unchanged result shape; the subject's buildRecord is the Story's BUILD record when one is on disk, and its new testRecord is the Story's TESTS record when one is on disk.

**Preconditions:**
- None beyond today's.

**Postconditions:**
- subject.buildRecord is non-null whenever .insrc/artifacts/BUILD-<epicHash>-<storyId>.json exists and parses as a build record; it is read as the general BuildRecord (src/workflow/runners/build/standalone-record.ts), whose optional tasks carry per-task passed, rather than StandaloneBuildRecord, whose body has only focus and producesLld.
- subject.testRecord equals readTestRecord(repoPath, epicHash, storyId).
- An absent or unreadable record yields null for that field and never fails the subject.

### 2.2 `buildCoveragePrompt`

```typescript
buildCoveragePrompt(subject: CodeReviewSubject, grounding: CodeReviewGrounding, extraNote: string | undefined): LLMMessage[]
```

**Parameters:**
- `subject: CodeReviewSubject` — Now read for its testRecord and buildRecord.
- `grounding: CodeReviewGrounding` — Unchanged.
- `extraNote: string | undefined` — Unchanged.

**Returns:** `LLMMessage[]` — The coverage prompt; the one-line build-record signal is replaced by a trailing test-record section.

**Postconditions:**
- When testRecord is non-null, the prompt carries a trailing section built per test FILE, not per title: for each file, the latest run is the file entry of the task whose ranAt is latest among the tasks that ran it (a valid ISO ranAt beats a missing one; on a tie or with no valid ranAt the run with a failing outcome wins). That run alone decides the file's current state: its exit code, whether it timed out, and its titles with results. A latest run that timed out, exited non-zero or reported no titles marks every test of the file present-but-failing or unverified, whatever older runs said. A title that appears only in an older run of the file is listed as not in the latest run and is unverified, never passing. The task id and ranAt of the deciding run are shown, plus, from the BUILD record, each task's id and passed result; a task without a passed value, or a record without tasks, is shown as 'unavailable' (there is no aggregate verdict on the record).
- The system text says: a test the record shows passing is passing; a test is unverified only when no record covers its file or title; a failing or skipped title is present-but-failing.
- When testRecord is null, the prompt keeps today's rule that every pass-state is unverified.
- Normalisation runs AFTER the latest run of each file is chosen and never removes a run from that choice: any file entry with a string file name takes part in choosing the latest run, and if the chosen latest entry is malformed (titles not an array, a title without a pass/fail/skipped result, or exitCode/timedOut of the wrong type) it stays as an unverified barrier: the file's tests are shown unverified and no older run's result is shown as current. Only a file entry with no string file name is dropped, with a note, since it cannot be matched to a file; a task without a files array contributes no file runs. readTestRecord validates only the record's top level and each task's taskId and tests (src/workflow/runners/build/test-record.ts).

### 2.3 `computeCodeReviewFreshness`

```typescript
computeCodeReviewFreshness(repoPath: string, changedFiles: readonly string[], deps: FreshnessDeps): Promise<FreshnessResult>
```

**Parameters:**
- `repoPath: string` — The Story's repository.
- `changedFiles: readonly string[]` — The Story's changed files, repo-relative.
- `deps: FreshnessDeps` — isProcessing is replaced by codeIndexWork(repoPath) => { inFlight: boolean; pending: number }.

**Returns:** `FreshnessResult` — { isProcessing, inFlight, pendingCodeIndexJobs, staleFiles }: inFlight is true when the job being processed is code-index work for repoPath; pendingCodeIndexJobs counts queued code-index jobs for repoPath; isProcessing = inFlight || pendingCodeIndexJobs > 0.

**Postconditions:**
- Jobs for other repositories, config jobs, re-embeds and document-summary jobs never set isProcessing, inFlight or pendingCodeIndexJobs.
- staleFiles is computed exactly as today.

### 2.4 `IndexQueue.codeIndexWorkFor`

```typescript
codeIndexWorkFor(repoPath: string): { inFlight: boolean; pending: number }
```

**Parameters:**
- `repoPath: string` — The repository whose code-graph work is counted.

**Returns:** `{ inFlight: boolean; pending: number }` — inFlight: the job being processed is a code-index job for repoPath; pending: queued code-index jobs for repoPath. A code-index job is kind 'full' or 'reconcile' naming repoPath, or kind 'file' whose filePath is repoPath or under it.

**Postconditions:**
- Read-only over the in-memory queue; the queue records the in-flight job for the duration of processor(job) and clears it in finally.

### 2.5 `codeReview.freshness`

```typescript
IPC 'codeReview.freshness' (params: { repo?: string; epicHash: string; storyId: string; changedFiles?: string[] }) => { isProcessing: boolean; inFlight: boolean; pendingCodeIndexJobs: number; staleFiles: string[] } | { error: string }
```

**Parameters:**
- `params: { repo?, epicHash, storyId, changedFiles? }` — Unchanged.

**Returns:** `{ isProcessing; inFlight; pendingCodeIndexJobs; staleFiles } | { error }` — Additive inFlight and pendingCodeIndexJobs; isProcessing narrowed to the repository code-index work.

**Errors:**
- `{ error }` when Unchanged: missing repo, epicHash or storyId.

**Postconditions:**
- The handler supplies codeIndexWork from IndexQueue.codeIndexWorkFor.

### 2.6 `beginDiffOnlyReview`

```typescript
beginDiffOnlyReview(repo: string, epicHash: string, storyId: string, subject: CodeReviewSubject, deps: CodeReviewStepDeps, reason: CodeReviewFallbackReason): Promise<CodeReviewStepOutput>
```

**Parameters:**
- `reason: CodeReviewFallbackReason` — Why the review is falling back to the diff.

**Returns:** `CodeReviewStepOutput` — Unchanged, except the done frame carries fallbackReason and the review record stores it.

**Preconditions:**
- Every caller passes a reason: 'freshness-timeout' from the proceed:true wait, 'declined' from proceed:false, 'hollow-grounding' from an empty symbol set.

**Postconditions:**
- The daemon-reviewed path passes the reason in CodeReviewStreamParams.fallbackReason; codeReviewRequestParams forwards it; codeReview.run's parseParams accepts and validates it; the run passes it to runCodeReview, whose buildArtifact stamps body.fallbackReason.
- The controller-reviewed path saves the reason in the step state (CodeReviewStepState.fallbackReason, src/daemon/steps/code-review-step/types.ts) so the separate judgements turn passes it to runCodeReview.
- The done frame (CodeReviewStepDone, src/daemon/steps/code-review-step/types.ts) carries fallbackReason on both paths.

### 2.7 `freshnessFromReply`

```typescript
freshnessFromReply(res: { isProcessing?: boolean; inFlight?: boolean; pendingCodeIndexJobs?: number; staleFiles?: readonly string[]; error?: string }): CodeReviewFreshnessResult
```

**Parameters:**
- `res: the codeReview.freshness reply` — The raw IPC reply, from a current or an older daemon.

**Returns:** `CodeReviewFreshnessResult = { ok: true; isProcessing: boolean; inFlight: boolean; pendingCodeIndexJobs: number; staleFiles: readonly string[] } | { ok: false; reason: string }` — The reply normalised for both clients (src/daemon/steps/daemon-client.ts and src/mcp/daemon-stream.ts). An older reply without the new fields maps inFlight to its isProcessing and pendingCodeIndexJobs to 0.

**Postconditions:**
- The new fields survive the socket and in-process clients unchanged.

### 2.8 `runCodeReview`

```typescript
runCodeReview(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts, deps?: CodeReviewRunnerDeps): Promise<CodeReviewOutcome>
```

**Parameters:**
- `opts: RunCodeReviewOpts` — Adds optional fallbackReason?: CodeReviewFallbackReason | undefined beside groundingMode.

**Returns:** `CodeReviewOutcome` — Unchanged; the artifact body carries fallbackReason when opts has one.

**Postconditions:**
- buildArtifact copies opts.fallbackReason onto CodeReviewBody.fallbackReason (src/workflow/code-review/types.ts) and omits the key when absent.

### 2.9 `codeReviewRequestParams`

```typescript
codeReviewRequestParams(params: CodeReviewStreamParams): Record<string, unknown>
```

**Parameters:**
- `params: CodeReviewStreamParams` — Adds optional fallbackReason?: CodeReviewFallbackReason | undefined beside groundingMode.

**Returns:** `Record<string, unknown>` — The codeReview.run request params; carries fallbackReason when params has one and omits the key otherwise.

**Postconditions:**
- Both clients (src/daemon/steps/daemon-client.ts and src/mcp/daemon-stream.ts) send the reason to codeReview.run unchanged.

## 3. Data model changes

### 3.1 `CodeReviewSubject` — field-add

Adds testRecord: TestRecord | null; buildRecord changes type from StandaloneBuildRecord | null to the general BuildRecord | null (a superset carrying optional per-task passed) and is now populated in production. subject-paths.ts reads only buildRecord.meta, which both types share.

```
+ readonly testRecord: TestRecord | null;
~ readonly buildRecord: BuildRecord | null;  (was StandaloneBuildRecord | null)
```

**Call sites:**
- `src/workflow/code-review/types.ts:122`
- `src/workflow/code-review/subject.ts:140`
- `src/workflow/code-review/subject-paths.ts:31`

### 3.2 `SubjectDeps` — field-add

Adds optional readTestRecord seam; DEFAULT_DEPS supplies readBuildRecord (the Story's BUILD json, null when absent or misshapen) and readTestRecord (the existing reader).

```
+ readonly readTestRecord?: (repoPath: string, epicHash: string, storyId: string) => TestRecord | null;
```

**Call sites:**
- `src/workflow/code-review/subject.ts:66`

### 3.3 `FreshnessDeps / FreshnessResult` — field-modify

FreshnessDeps.isProcessing() is replaced by codeIndexWork(repoPath) => { inFlight, pending }; FreshnessResult adds inFlight: boolean and pendingCodeIndexJobs: number. The shared CodeReviewFreshnessResult (src/shared/review-stream.ts:72) and freshnessFromReply (src/shared/review-stream.ts:81) add the same two fields.

**Call sites:**
- `src/workflow/code-review/freshness.ts`
- `src/daemon/index.ts:808-830`
- `src/shared/review-stream.ts:72`
- `src/shared/review-stream.ts:81`
- `src/daemon/steps/daemon-client.ts:124`
- `src/mcp/daemon-stream.ts:350`

### 3.4 `CodeReviewFallbackReason` — new

{ kind: 'freshness-timeout'; waitedMs: number; inFlight: boolean; pendingCodeIndexJobs: number; staleFiles: string[] } | { kind: 'declined' } | { kind: 'hollow-grounding' }. Carried on CodeReviewStepDone.fallbackReason, saved on CodeReviewStepState.fallbackReason across the judgements turn, passed as CodeReviewStreamParams.fallbackReason, serialized by codeReviewRequestParams, received as codeReview.run params.fallbackReason (CodeReviewRunParams, parseParams) and RunCodeReviewOpts.fallbackReason, and stored as the optional CodeReviewBody.fallbackReason.

**Call sites:**
- `src/daemon/steps/code-review-step/handler.ts:285-345`
- `src/daemon/steps/code-review-step/types.ts`
- `src/daemon/code-review-rpc.ts:50-60`
- `src/daemon/code-review-rpc.ts:189-208`
- `src/workflow/code-review/runner.ts:90-102`
- `src/workflow/code-review/runner.ts:275-292`
- `src/workflow/code-review/types.ts:150-162`
- `src/shared/review-stream.ts:51-58`
- `src/shared/review-stream.ts:111-119`

## 4. Error paths

**Error cases**

- **The Story's BUILD json exists but is not valid json or lacks a build record's shape.** (recoverable)
  - Detection: DEFAULT_DEPS.readBuildRecord catches the parse error or the shape check fails (meta.epicHash/storyId strings, body object).
  - Response: Return null and log a warning naming the path; the subject is still built.
  - User impact: Coverage behaves as with no build record (pass-state from the TESTS record only, or unverified).
- **The Story's TESTS record is unreadable or misshapen.** (recoverable)
  - Detection: readTestRecord already returns null for an unreadable or misshapen record (testRecordState 'unreadable').
  - Response: testRecord is null; coverage keeps today's every-test-unverified rule.
  - User impact: Same as today; no worse.
- **The queue's processor throws while a code-index job is in flight.** (recoverable)
  - Detection: IndexQueue.start's try/finally.
  - Response: The in-flight job is cleared in finally, as processing already is, so codeIndexWorkFor never reports a stale in-flight job.
  - User impact: None.
- **The freshness IPC call fails or returns an error during the wait.** (recoverable)
  - Detection: fetchFreshness returns ok:false.
  - Response: Unchanged: the step returns freshness-unavailable; no fallback reason is written because no review runs.
  - User impact: Unchanged.
- **A TESTS record passes readTestRecord's shape check but a task lacks files, a file lacks titles, or a title has an unknown result.** (recoverable)
  - Detection: The coverage normaliser checks Array.isArray(task.files), Array.isArray(file.titles) and the result value for each item it reads.
  - Response: Choose each file's latest run first, including malformed entries that name a file; a malformed latest entry stays as an unverified barrier, so no older result becomes current. Drop only entries with no file name, with a note.
  - User impact: The review runs; a malformed latest run makes that file's tests unverified rather than letting an older pass show.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An older task passed a title of a file; a newer task's run of the same file timed out with no titles. | The file is shown from the newer run: timed out, no titles; the older pass is not shown as current, and the title is unverified. |
| A TESTS record whose files list is empty (a trivial build with no touched test files). | The section says the gate ran no test files; pass-state stays unverified for every symbol. |
| A repository path that is a prefix of another (e.g. /a/repo and /a/repo2) with a file job under /a/repo2. | codeIndexWorkFor('/a/repo') does not count it: the match is repoPath itself or repoPath followed by the path separator, as depthForRepo does. |
| Only doc-summarise-entity, config and reembed jobs queued, and one in flight. | isProcessing false and pendingCodeIndexJobs 0; the review proceeds immediately when no file is stale. |
| proceed:false (an explicit decline). | The diff review runs with fallbackReason {kind:'declined'}. |
| Fresh index but the graph grounding returns no symbols. | The diff review runs with fallbackReason {kind:'hollow-grounding'}. |
| A code-review record written before this change (no fallbackReason). | Reads and renders as today; the field is optional. |
| A freshness reply from an older daemon (no inFlight, no pendingCodeIndexJobs). | freshnessFromReply maps inFlight to isProcessing and pendingCodeIndexJobs to 0; the step works as before. |
| Only queued code-index work (nothing in flight) versus a code-index job in flight with none queued. | The first gives inFlight false, pendingCodeIndexJobs > 0; the second inFlight true, pendingCodeIndexJobs 0; a timeout records each exactly. |
| Two tasks ran the same file with equal ranAt, or neither has a valid ranAt, and one run failed. | The failing run decides the file: a tie never yields an unsupported green. |
| A newer successful run of a file no longer reports a title an older run passed. | That title is listed as not in the latest run and is unverified. |
| An older task passed a file's title; a newer task's entry for the same file is malformed (titles missing or not an array). | The malformed newer entry is the latest run: the file is shown unverified, and the older pass is not shown as current. |
| A BUILD record with no tasks, or tasks without a passed value (a standalone record). | Coverage shows the BUILD result as 'unavailable' for those tasks; the test record still decides each test's state. |

**Invariants to preserve**

- The subject never fails because a record is missing or unreadable: an absent record is null, as buildRecord is today. [[c1]]
- readTestRecord never throws and treats an unreadable record as absent. [[c2]]
- With no test record the coverage judge never asserts a green it cannot support. [[c3]]
- staleFiles is computed exactly as today (entity watermark vs mtime, repo lastIndexed fallback), and freshness stays read-only, never triggering a reindex. [[c4]]
- The proceed:true wait is still bounded by codeReview.freshnessTimeoutMs and still falls back to the diff review rather than waiting forever. [[c5]]
- depthForRepo and repo.stats pendingJobs keep counting every per-repo job kind as today; the new count is separate. [[c4]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (assert/strict), run under Node 22`

**Test levels**

- **unit** — The subject carries the Story's records, and coverage renders them.
  - Subjects: `src/workflow/code-review/__tests__/subject.test.ts: the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built`, `src/workflow/code-review/dimensions/__tests__/coverage.test.ts: the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable'`
  - Fixtures: `A temp repo with .insrc/artifacts/BUILD-<hash>-S001.json and TESTS-<hash>-S001.json, one valid and one misshapen variant.`
- **unit** — Freshness counts only the Story repository's code-index work.
  - Subjects: `src/daemon/__tests__/queue-code-index-work.test.ts: codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor`, `src/workflow/code-review/__tests__/freshness.test.ts: computeCodeReviewFreshness reports isProcessing and pendingCodeIndexJobs from codeIndexWork and leaves staleFiles as before`
- **unit** — A fallback says why.
  - Subjects: `src/daemon/steps/code-review-step/__tests__/handler.test.ts: a proceed:true wait that times out falls back with fallbackReason freshness-timeout carrying waitedMs, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a fresh full review carries none; the daemon-reviewed path forwards the reason`
- **unit** — The fallback reason and freshness fields survive every transport boundary to the persisted record.
  - Subjects: `src/shared/__tests__/review-stream-freshness.test.ts: freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0`, `src/daemon/__tests__/code-review-rpc-fallback.test.ts: codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason`, `src/daemon/steps/code-review-step/__tests__/handler.test.ts: on the controller-reviewed path, a timed-out wait saves the reason in the state and the judgements turn writes it to the record and the done frame, distinguishing queued-only from in-flight work`, `src/shared/__tests__/review-stream.test.ts: codeReviewRequestParams forwards fallbackReason exactly and omits the key when absent (fails if serialization drops it)`, `src/daemon/__tests__/code-review-rpc-fallback.test.ts: a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/code-review/__tests__/subject.test.ts: the default deps read the Story's BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built`, `src/workflow/code-review/dimensions/__tests__/coverage.test.ts: the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable'` |
| `ac2` | `src/daemon/__tests__/queue-code-index-work.test.ts: codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor`, `src/workflow/code-review/__tests__/freshness.test.ts: computeCodeReviewFreshness reports isProcessing and pendingCodeIndexJobs from codeIndexWork and leaves staleFiles as before` |
| `ac3` | `src/daemon/steps/code-review-step/__tests__/handler.test.ts: a proceed:true wait that times out falls back with fallbackReason freshness-timeout carrying waitedMs, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a fresh full review carries none; the daemon-reviewed path forwards the reason`, `src/shared/__tests__/review-stream-freshness.test.ts: freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0`, `src/daemon/__tests__/code-review-rpc-fallback.test.ts: codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason`, `src/daemon/steps/code-review-step/__tests__/handler.test.ts: on the controller-reviewed path, a timed-out wait saves the reason in the state and the judgements turn writes it to the record and the done frame, distinguishing queued-only from in-flight work`, `src/shared/__tests__/review-stream.test.ts: codeReviewRequestParams forwards fallbackReason exactly and omits the key when absent (fails if serialization drops it)`, `src/daemon/__tests__/code-review-rpc-fallback.test.ts: a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason` |

## 6. Migration

**State before:** Per the s1 bundles: the review subject's buildRecord is always null in production (src/workflow/code-review/subject.ts:140) and there is no testRecord, so coverage tells the judge every test is unverified (src/workflow/code-review/dimensions/coverage.ts:99-102); codeReview.freshness reports isProcessing from the whole queue (src/daemon/index.ts:808-830); the step's diff fallback records only groundingMode degraded (src/daemon/steps/code-review-step/handler.ts:285-345).

**State after:** The subject carries the Story's BUILD and TESTS records; coverage shows the judge per-file test results; freshness's isProcessing reflects only the Story repository's code-index jobs and the answer adds pendingCodeIndexJobs; every diff fallback stores a fallbackReason on the done frame and the code-review record.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional testRecord field to the subject, the optional readTestRecord seam, and supply readBuildRecord and readTestRecord in the default subject deps. — ↩ rollbackable
2. Replace the one-line build-record signal in the coverage prompt with the trailing test-record section and the pass/unverified rule. — ↩ rollbackable
3. Record the in-flight job in the index queue and add codeIndexWorkFor; switch the freshness compute and the daemon handler from the whole-queue flag to it, adding inFlight and pendingCodeIndexJobs to the answer, to the shared CodeReviewFreshnessResult and to freshnessFromReply. — ↩ rollbackable
4. Pass a fallback reason into the diff-only review from each of its three callers; carry it on the done frame and in the step state across the judgements turn; add it to CodeReviewStreamParams and forward it in codeReviewRequestParams; accept it in codeReview.run params and parseParams; pass it through RunCodeReviewOpts so buildArtifact stores it as the optional CodeReviewBody.fallbackReason. — ↩ rollbackable
5. Update and restart the installed daemon so the IPC handler and the review use the new code. — ↩ rollbackable

**Backward compat:** All additions are optional fields: older code-review records without fallbackReason read and render as before; a freshness answer without pendingCodeIndexJobs (an older daemon) is read as 0 by the step. isProcessing keeps its name and type with a narrower meaning. depthForRepo and repo.stats pendingJobs are unchanged. freshnessFromReply reads an older daemon's reply (no inFlight, no pendingCodeIndexJobs) as inFlight=isProcessing and 0.

## 7. Alternatives considered

### 7.1 a1: Records on the subject; repo-scoped code-index freshness; recorded fallback reason — **CHOSEN**

The subject carries the Story's BUILD and TESTS records, coverage renders the per-test results, and freshness counts only the Story repository's code-index jobs, with any diff fallback stating why.

Coverage: the default subject dependencies read the Story's BUILD record (the existing optional readBuildRecord, now supplied) and its TESTS record (readTestRecord, already never-throwing) onto the CodeReviewSubject as buildRecord and a new testRecord field. The coverage prompt replaces the one-line build-record signal with a trailing section that lists, for each test file the gate ran, its titles and results from the latest run, and states the rule: a test the record shows passing is passing; it is unverified only when no record covers it. Freshness: the queue exposes the job in flight and a count of pending jobs matching a predicate; the codeReview.freshness handler reports isProcessing true only while a job that changes the Story repository's code graph (a full index, a reconcile, or a file job under that repository) is in flight or pending, and ignores other repositories, config jobs, re-embeds and document summaries. Fallback: when the step falls back to the diff review, the done frame and the code-review record carry a reason (the wait timed out, with how long it waited, the pending relevant job count and the stale files; or the graph grounding was hollow).

### 7.2 a2: Per-file freshness

As a1 for coverage, but freshness waits only for jobs on the Story's own changed files.

Same subject and coverage change as a1. The freshness handler treats as relevant only a file job whose path is one of the Story's changed files, plus a full index or reconcile of the repository; file jobs for other files in the repository are ignored. Fallback reason as a1.

**Rejected because:** Partial on fixIntent-2: it ignores re-indexing of other files that hold callers of the changed symbols, so the review can ground on stale callers.

### 7.3 a3: Keep the global signal; wait longer

Fix coverage as a1, leave freshness on the whole queue, and raise the timeout or wait without limit.

Same subject and coverage change as a1. The freshness answer is unchanged; codeReview.freshnessTimeoutMs gets a larger default (or proceed:true waits until the queue drains), and the fallback reason is recorded as a1.

**Rejected because:** Violates fixIntent-2: it keeps the whole-queue signal, so reviews still wait on other repositories and document summaries.

## 8. References

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: resolveCodeReviewSubject and its build-record seam (src/workflow/code-review/subject.ts:66, src/workflow/code-review/subject.ts:140)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: the TESTS record and readTestRecord (src/workflow/runners/build/test-record.ts:96, src/workflow/runners/build/test-record.ts:162)`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: the coverage build-record signal (src/workflow/code-review/dimensions/coverage.ts:99-102)`
- **[[c4]]** `step-output` `s1 context.assemble bundle 4: codeReview.freshness and IndexQueue (src/daemon/index.ts:808-830, src/daemon/queue.ts)`
- **[[c5]]** `step-output` `s1 context.assemble bundle 5: the step handler wait and diff fallback (src/daemon/steps/code-review-step/handler.ts:285-345)`
- **[[c6]]** `step-output` `s1 context.assemble bundle 6: existing tests for subject, freshness, runner and step handler`
- **[[c7]]** `step-output` `s1 context.assemble bundle 7: freshnessFromReply, codeReview.run params, buildArtifact and the step state (src/shared/review-stream.ts:81, src/daemon/code-review-rpc.ts:189-208, src/workflow/code-review/runner.ts:275-292)`
- **[[c8]]** `prior-artifact` `ISSUE-1102dc7125ad0c07 fix intent`
- **[[c11]]** `prior-artifact` `Review cycle 1 round 3 and cycle 2 round 1 of LLD-1102dc7125ad0c07-S001 (2026-10-17): test results resolved per file by the latest run (ranAt), so a newer failed, timed-out or title-less run supersedes older passes; addressed in this version`
- **[[c10]]** `prior-artifact` `Review round 2 of LLD-1102dc7125ad0c07-S001 (2026-10-17): the request serializer codeReviewRequestParams was missing from the change sites and tests; addressed in this version`
- **[[c9]]** `prior-artifact` `Review round 1 of LLD-1102dc7125ad0c07-S001 (2026-10-17): inFlight not carried, transport sites missing, nested TESTS fields unvalidated, no transport-to-record tests; all four addressed in this version`

## 9. Open questions

- cd1 (partial): IndexQueue.codeIndexWorkFor is a new method on the existing IndexQueue class (src/daemon/queue.ts); there is no HLD to own it [c4].
- ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps three derived from the approved issue's fix intent (ac1 coverage reads the Story's records, ac2 freshness counts only the repository's code-index work, ac3 a fallback records why, through every transport boundary to the record) [c8].
