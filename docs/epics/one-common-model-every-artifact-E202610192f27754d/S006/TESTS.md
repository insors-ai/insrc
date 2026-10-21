<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s6 -->

# Tests: 2f27754d4ad00b8e s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T15:43:51.977Z on commit `983c6453`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: github-comments.test.ts: the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list | `src/workflow/tracker/__tests__/github-comments.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-comments.test.ts` | 0 | 1 | 0.6 s |  |

## t2

Run at 2026-10-21T15:46:43.391Z on commit `42069538`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: binding-carry.test.ts: a content write by the store keeps the binding and attachments on disk, a first write keeps what the caller gave, and the carry leaves the revision number and content hash alone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a content write by the store keeps the binding and attachments on disk, a first write keeps what the caller gave, and the carry leaves the revision number and content hash alone | `src/workflow/artifact-core/__tests__/binding-carry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/binding-carry.test.ts` | 0 | 2 | 1.3 s |  |

## t3

Run at 2026-10-21T15:50:38.996Z on commit `f0415cc2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: binding.test.ts: bindArtifact writes the typed binding with createdAtRevision, leaves the revision number and content hash unchanged, is idempotent for the same issue, refuses a different issue, and readBinding returns undefined for an unbound artifact**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bindArtifact writes the typed binding with createdAtRevision, leaves the revision number and content hash unchanged, is idempotent for the same issue, refuses a different issue, and readBinding returns undefined for an unbound artifact | `src/workflow/tracker/__tests__/binding.test.ts` |

**unit: binding.test.ts: recordPosted and setPendingLink record one entry per kind and a pending link that names a child ref or a child id, never twice, and without moving the revision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recordPosted and setPendingLink record one entry per kind and a pending link that names a child ref or a child id, never twice, and without moving the revision | `src/workflow/tracker/__tests__/binding.test.ts` |

**integration: binding-staged.test.ts: a binding, post or attachment patch is refused while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a binding, post or attachment patch is refused while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict | `src/workflow/tracker/__tests__/binding-staged.test.ts` |

**integration: artifact-write-inventory.test.ts: the binding writer is listed as a meta-only writer of meta.envelope and every production writer file still has an entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the binding writer is listed as a meta-only writer of meta.envelope and every production writer file still has an entry | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 7 | 4.2 s |  |
| `src/workflow/tracker/__tests__/binding-staged.test.ts` | 0 | 2 | 1.3 s |  |
| `src/workflow/tracker/__tests__/binding.test.ts` | 0 | 3 | 1.3 s |  |

## t4

Run at 2026-10-21T15:56:12.876Z on commit `43d874f8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: attach.test.ts: attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again | `src/workflow/tracker/__tests__/attach.test.ts` |

**integration: artifact-write-inventory.test.ts: the write inventory lists the binding and attach writers as meta-only writers of meta.envelope and every production writer file still has an entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the write inventory lists the binding and attach writers as meta-only writers of meta.envelope and every production writer file still has an entry | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 8 | 4.4 s |  |
| `src/workflow/tracker/__tests__/attach.test.ts` | 0 | 2 | 1.6 s |  |

## t5

Run at 2026-10-21T16:02:14.809Z on commit `274e6699`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: unit-issue-binding.test.ts: ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit keeps its record on the Plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit keeps its record on the Plan | `src/workflow/tracker/__tests__/unit-issue-binding.test.ts` |

**integration: unit-issue-binding.test.ts: a failed link under the parent is stored as the binding's pending link, retried by the next ensure, cleared once done and not retried again**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failed link under the parent is stored as the binding's pending link, retried by the next ensure, cleared once done and not retried again | `src/workflow/tracker/__tests__/unit-issue-binding.test.ts` |

**integration: unit-issue-binding.test.ts: the draft hook and the handoff check read the binding for an Epic or Story unit, and a pre-s6 head with only the old ref is rebound once from it with no new issue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the draft hook and the handoff check read the binding for an Epic or Story unit, and a pre-s6 head with only the old ref is rebound once from it with no new issue | `src/workflow/tracker/__tests__/unit-issue-binding.test.ts` |

**integration: binding-gate.test.ts: the team gate resolves a bound unit's issue synchronously from the binding with no tracker call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the team gate resolves a bound unit's issue synchronously from the binding with no tracker call | `src/workflow/tracker/__tests__/binding-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/binding-gate.test.ts` | 0 | 1 | 0.6 s |  |
| `src/workflow/tracker/__tests__/unit-issue-binding.test.ts` | 0 | 3 | 0.8 s |  |

## t6

Run at 2026-10-21T16:04:14.989Z on commit `b651ab94`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: unit-issue-bind-failures.test.ts: two racing creates for one unit bind the lowest-numbered issue once, close the other as a duplicate, and keep the created issue when the duplicate check cannot list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two racing creates for one unit bind the lowest-numbered issue once, close the other as a duplicate, and keep the created issue when the duplicate check cannot list | `src/workflow/tracker/__tests__/unit-issue-bind-failures.test.ts` |

**integration: unit-issue-bind-failures.test.ts: a malformed binding makes ensureUnitIssueDetailed fail before creating anything and leaves the store read of that artifact failing until repaired**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a malformed binding makes ensureUnitIssueDetailed fail before creating anything and leaves the store read of that artifact failing until repaired | `src/workflow/tracker/__tests__/unit-issue-bind-failures.test.ts` |

**integration: unit-issue-bind-failures.test.ts: a bind that fails to write after the issue was created returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a bind that fails to write after the issue was created returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label | `src/workflow/tracker/__tests__/unit-issue-bind-failures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/unit-issue-bind-failures.test.ts` | 0 | 3 | 1.1 s |  |

## t7

Run at 2026-10-21T16:10:27.911Z on commit `a487a456`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: unit-extras.test.ts: runUnitExtras skips a kind already in the binding, reconciles a comment step through its marker without posting, reads the comment list once for several steps, fails a step when the list cannot be read, and reports a post whose record failed so the next run reconciles it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runUnitExtras skips a kind already in the binding, reconciles a comment step through its marker without posting, reads the comment list once for several steps, fails a step when the list cannot be read, and reports a post whose record failed so the next run reconciles it | `src/workflow/tracker/__tests__/unit-extras.test.ts` |

**integration: tracker-posts-once.test.ts: the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice | `src/workflow/__tests__/tracker-posts-once.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/tracker-posts-once.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/tracker/__tests__/unit-extras.test.ts` | 0 | 1 | 1 s |  |

## t8

Run at 2026-10-21T16:15:53.339Z on commit `e5fd592a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: tracker-push-modes.test.ts: the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding | `src/workflow/__tests__/tracker-push-modes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/tracker-push-modes.test.ts` | 0 | 1 | 1.5 s |  |

## t9

Run at 2026-10-21T16:26:01.003Z on commit `6c8b5dd5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: approve-attach.test.ts: approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed | `src/workflow/__tests__/approve-attach.test.ts` |

**integration: tracker-attach-followon.test.ts: the BUILD approval's follow-on attaches the build, review and test records that git reports clean and reports the dirty ones, and the daemon workflow.approve commits nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the BUILD approval's follow-on attaches the build, review and test records that git reports clean and reports the dirty ones, and the daemon workflow.approve commits nothing | `src/workflow/__tests__/tracker-attach-followon.test.ts` |

**integration: tracker-attach-followon.test.ts: the design document, plan and build, review and test records are attached to the unit's issue with a link per revision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the design document, plan and build, review and test records are attached to the unit's issue with a link per revision | `src/workflow/__tests__/tracker-attach-followon.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/approve-attach.test.ts` | 0 | 1 | 2 s |  |
| `src/workflow/__tests__/tracker-attach-followon.test.ts` | 0 | 2 | 2 s |  |

## t10

Run at 2026-10-21T16:27:34.958Z on commit `6a03b146`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s6-handoffs.test.ts: the plans document names each s6 hand-off to s7 and s9 and each carve-out this Story chose**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the plans document names each s6 hand-off to s7 and s9 and each carve-out this Story chose | `src/workflow/__tests__/s6-handoffs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/s6-handoffs.test.ts` | 0 | 1 | 1.4 s |  |
