<!-- insrc:artifact LLD-2f12980837f2595d-s1 -->

# LLD: STORY-2f12980837f2595d-s1 — Stop a stuck review cleanup from blocking BUILD approval and Story completion

## Summary

**Epic:** `stop-stuck-review-cleanup-from-blocking`
**HLD base run:** `wf-1794766449788-6lowkb`
**HLD effective hash:** `904db00a2fb8...`

A BUILD approval stops waiting for ever on the code-review cleanup that runs after it. The approval gives the cleanup a fixed time; if the daemon has not answered by then, the approval returns with the cleanup reported as retained and an error that says the approval stands and how to retry, and the Story and Epic completion runs as it does after any approval. The cleanup's own waits inside the daemon are not changed here, because another Story is reworking that code.

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

### 2.1 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath: string, opts: ApproveOptions): Promise<ApprovalResult>
```

**Parameters:**
- `jsonPath: string` — The artifact to approve; a BUILD triggers the code-review cleanup.
- `opts.afterBuildApproval: (repo: string, hash: string, story: string) => Promise<CleanupResult>` _(optional)_ — Test seam replacing the cleanup; when absent the default calls codeReview.task.cleanup with a deadline.

**Returns:** `ApprovalResult` — Unchanged shape. For a BUILD, cleanup is the daemon's CleanupResult, or, when the cleanup throws or does not answer within BUILD_CLEANUP_TIMEOUT_MS, { deleted: [], retained: [<project>/.insrc/tmp/code-review], errors: [<reason>] } where a timeout's reason names the bound, says the approval stands and that approving the BUILD again retries the cleanup.

**Preconditions:**
- The approval write has completed (or the BUILD was already approved) before the cleanup starts.

**Postconditions:**
- The call returns within BUILD_CLEANUP_TIMEOUT_MS of the cleanup starting, plus the approval's own work.
- A cleanup timeout never turns into a thrown error or a skipped approval.
- The cleanup's start, its outcome and a timeout are logged with the BUILD id.

### 2.2 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?: ApproveWorkflowOptions): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Unchanged.

**Returns:** `WorkflowApproveResult` — Unchanged; because approveArtifactByJsonPath now returns after a bounded cleanup, completeThroughService always runs for an approved BUILD and its story-completion entry is in followOn.

**Postconditions:**
- An approved BUILD's Story and Epic are completed when their roll-up holds, whether the cleanup finished, failed or timed out.

## 3. Data model changes

### 3.1 `CleanupResult` — invariant-change

Shape unchanged ({ deleted, retained, errors }). New producer case: a cleanup that does not answer in time yields retained=[<project>/.insrc/tmp/code-review] and one error naming the timeout, the same form the existing catch already uses for a thrown cleanup.

**Call sites:**
- `src/workflow/gates.ts:711-720`
- `src/workflow/code-review/task-review/cleanup.ts:15`

### 3.2 `BUILD_CLEANUP_TIMEOUT_MS` — new

A named constant (60 000 ms) beside the default cleanup call in src/workflow/gates.ts; passed as the rpc client's existing timeoutMs.

**Call sites:**
- `src/workflow/gates.ts:716`
- `src/shared/ipc-client.ts:66-130`

## 4. Error paths

**Error cases**

- **The daemon accepts codeReview.task.cleanup but never answers (a stuck review-worker wait).** (recoverable)
  - Detection: The rpc call's timeoutMs fires and it rejects with 'daemon did not reply within N ms (timeout)'.
  - Response: The existing catch returns a CleanupResult with retained=[<project>/.insrc/tmp/code-review] and an error naming the bound, saying the approval stands and that approving the BUILD again retries the cleanup; the approval returns and completion runs.
  - User impact: The approval answers within the bound; the checkpoint stays until a retry or restart cleans it.
- **The daemon drops the connection during the cleanup.** (recoverable)
  - Detection: The rpc client's close/error handling rejects (closeAware behaviour, kept).
  - Response: Same catch: retained with the disconnect reason; completion runs.
  - User impact: As today, the approval stands and the cleanup is retained.
- **The cleanup answers with retained entries or errors (busy, unsafe directory).** (recoverable)
  - Detection: The daemon's CleanupResult carries retained/errors.
  - Response: Returned unchanged; completion runs.
  - User impact: Unchanged from today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The BUILD is already approved and the user approves it again. | The approved-already branch runs the bounded cleanup again (the retry path); no new approval is written. |
| A cleanup that answers just before the deadline. | Its result is returned as is; no timeout error is added. |
| A non-BUILD artifact approval. | No cleanup call and no change. |
| A test or caller passes afterBuildApproval. | The seam replaces the default call as today; the bound applies only to the default RPC. |

**Invariants to preserve**

- A cleanup failure never fails or withholds the BUILD approval; it is reported in ApprovalResult.cleanup. [[c1]]
- completeThroughService runs after approveArtifactByJsonPath returns for an approved BUILD, and its own failures surface as a story-completion followOn entry. [[c3]]
- Approving an already-approved BUILD again retries the cleanup without writing a new approval. [[c5]]
- The rpc client's closeAware handling of a dropped connection is kept. [[c2]]

## 5. Test strategy

**Test framework:** `node:test (npx tsx --test), as the existing src/workflow/__tests__ and src/workflow/code-review/task-review/__tests__ files`

**Test levels**

- **integration** — Prove the default cleanup call is bounded and that a stuck cleanup no longer blocks the approval or the Story/Epic completion.
  - Subjects: `approval cleanup: a cleanup RPC that never answers returns after the bound with the cleanup retained and the timeout reason, and the BUILD stays approved`, `approval cleanup: a BUILD approval whose cleanup never answers still completes the Story and the Epic`, `approval cleanup: approving the BUILD again after a timed-out cleanup retries the cleanup and records no new approval`, `approval cleanup: a cleanup that answers in time is returned unchanged with no timeout error`
  - Fixtures: `a daemon socket stand-in that accepts codeReview.task.cleanup and never replies (rpc connect seam or a listening Unix socket under a temporary HOME)`, `the story-completion fixture with a task-based passing code review`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `approval cleanup: a cleanup RPC that never answers returns after the bound with the cleanup retained and the timeout reason, and the BUILD stays approved` |
| `ac2` | `approval cleanup: a BUILD approval whose cleanup never answers still completes the Story and the Epic` |
| `ac3` | `approval cleanup: approving the BUILD again after a timed-out cleanup retries the cleanup and records no new approval` |
| `ac4` | `approval cleanup: a cleanup that answers in time is returned unchanged with no timeout error` |

## 6. Migration

**State before:** A BUILD approval awaits codeReview.task.cleanup with closeAware and no timer (src/workflow/gates.ts:711-720); a cleanup that never answers holds the approval response and the Story/Epic completion that runs after it (src/workflow/gates.ts:1033-1052).

**State after:** The default cleanup call carries BUILD_CLEANUP_TIMEOUT_MS; a timeout is reported as a retained cleanup with its reason, the approval returns, and completion runs. Re-approving the BUILD retries the cleanup as before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add BUILD_CLEANUP_TIMEOUT_MS beside the default cleanup call and pass it as the rpc timeout; word the timeout error to say the approval stands and how to retry; log the cleanup's start, outcome and timeout with the BUILD id. — ↩ rollbackable
2. Deploy with the next daemon update; no stored record changes, and nothing to backfill. — ↩ rollbackable

**Backward compat:** ApprovalResult and CleanupResult keep their shapes; callers that pass afterBuildApproval are unaffected. The only visible change is that a cleanup taking longer than the bound is reported as retained instead of waited on.

## 7. Alternatives considered

### 7.1 a1: Bound the cleanup call in the approval gate — **CHOSEN**

The default cleanup RPC gets a deadline; on timeout the approval reports the cleanup as retained with the reason, and completion runs as usual.

The default afterBuildApproval call to codeReview.task.cleanup uses the rpc client's existing timeoutMs instead of closeAware alone. A timeout is caught by the existing catch, so the approval returns its CleanupResult with retained=[<project>/.insrc/tmp/code-review] and an error naming the timeout; approveWorkflowTarget then runs completeThroughService unchanged. The bound is one named constant beside the call. The approval logs the start, the outcome and a timeout of the cleanup with the BUILD id. A retained cleanup is retried by approving the BUILD again (the existing already-approved branch), which the response names in its error text.

### 7.2 a2: a1 plus deadlines on the cleanup's worker waits

Bound the gate as in a1, and also put deadlines on review.worker.assertIdle, closeEntry and releaseCleaned inside ReviewWorkers.cleanupApproved.

As a1 in the gate. In ReviewWorkers.cleanupApproved, each await on a worker (assertIdle via this.call, closeEntry, preparation.releaseCleaned) races a deadline; a miss adds the root to retained with an error naming the step and releases the cleanup scope so a later attempt can run. Each step logs before and after.

**Rejected because:** Meets all five fix-intent points, but edits src/daemon/threads/review-workers.ts while another session's Story is changing it, and abandoning worker calls part-way interacts with the fence and reclaim rules that Story is reworking; the conflict risk outweighs closing fi3 here.

### 7.3 a3: Run the cleanup in the background after completion

The approval stops awaiting the cleanup; it is started without waiting, after the Story completion, and its result is logged.

approveArtifactByJsonPath starts the cleanup and returns without its result; approveWorkflowTarget runs completion first. The cleanup outcome is written to the log and not returned.

**Rejected because:** Loses the cleanup result callers read today and gains nothing over a bounded wait; a failure would be visible only in the log, so the user could not see a retry is needed.

## 8. References

- **[[c1]]** `code` `src/workflow/gates.ts:711-720`
- **[[c2]]** `code` `src/shared/ipc-client.ts:66-130`
- **[[c3]]** `code` `src/workflow/gates.ts:1033-1052`
- **[[c4]]** `code` `src/daemon/threads/review-workers.ts:511-545`
- **[[c5]]** `code` `src/workflow/code-review/task-review/__tests__/cleanup.test.ts:60-75`
- **[[c6]]** `code` `src/workflow/__tests__/story-completion.test.ts:50`

## 9. Open questions

- The ISSUE's fix intent also asks for deadlines on the cleanup's review-worker waits (review.worker.assertIdle, closeEntry, releaseCleaned in src/daemon/threads/review-workers.ts) and for the daemon-side cleanup to log which step it is on. a1 leaves both, because another session's Story is changing that file now. Defer them to a follow-up after that Story lands (a1), or take them in this Story now (a2)?
