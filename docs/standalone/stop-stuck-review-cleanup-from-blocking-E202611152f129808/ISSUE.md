<!-- insrc:artifact ISSUE-2f12980837f2595d -->

# Stop a stuck review cleanup from blocking BUILD approval and Story completion

## Reproduction

Observed on 2026-11-15 with daemon pid 62333. Approving BUILD-c5b49ff953a9a295-s1 through insrc_workflow_approve with an override reason: the BUILD's approval was written (lifecycle approved at 13:03:09Z, override recorded), but the call never returned; after about ten minutes the MCP connection closed. STORY-c5b49ff953a9a295-s1 had not been created and EPIC-c5b49ff953a9a295 stayed a draft; the code review's checkpoint .insrc/tmp/code-review/trivial-issue-c5b4-s1.json was not removed; the daemon log had no cleanup or completion entry after 13:03. After the daemon was restarted (new pid 2334) the Story, the Epic and the BUILD were completed and the checkpoint was gone. Expected: the approval answers promptly, and the Story and Epic complete when their roll-up holds, whatever the cleanup does.

## Root cause

After the BUILD's approve write, approveArtifactByJsonPath awaits the daemon RPC codeReview.task.cleanup with no time limit (src/workflow/gates.ts:713-717), and approveWorkflowTarget runs the Story completion (completeThroughService) only after that approval returns (src/workflow/gates.ts:1035-1051). So the completion, and the answer to the caller, wait on the cleanup. The cleanup itself is a chain of unbounded waits on review workers: cleanupApprovedTaskReviews hands it to the registered owner (src/daemon/task-review-rpc.ts:29-33, src/workflow/review/cleanup-owner.ts:11), and ReviewWorkers.cleanupApproved awaits review.worker.assertIdle, closeEntry, a stored-evidence worker operation, admitOwned and review.worker.cleanup for each candidate, none with a deadline (src/daemon/threads/review-workers.ts:342-372). Any one of those waits not answering leaves the approval hanging. Which one did not answer on 2026-11-15 is not known: the log has no entry from the cleanup path, and the restart cleared the state.

## Fix intent

A cleanup that does not answer must not hold back the approval or the completion. The approval reports the cleanup as retained with an error when it does not finish within a bound, and the Story and Epic completion runs whether the cleanup finished or not. The cleanup's waits on review workers get deadlines, so a stuck worker is reported rather than waited on for ever, and the cleanup path logs where it is so the next occurrence can be located. A retained cleanup stays retryable without re-approving.

## Citations

- **[[c1]]** `code` `src/workflow/gates.ts:713-717`
- **[[c2]]** `code` `src/workflow/gates.ts:1035-1051`
- **[[c3]]** `code` `src/daemon/task-review-rpc.ts:29-33`
- **[[c4]]** `code` `src/workflow/review/cleanup-owner.ts:11`
- **[[c5]]** `code` `src/daemon/threads/review-workers.ts:342-372`
- **[[c6]]** `prior-artifact` `BUILD-c5b49ff953a9a295-s1`
