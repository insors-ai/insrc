<!-- insrc:artifact ISSUE-8f02bdce15c671dc -->

# Preserve reviewed BUILD content and recognize task-based review approval

## Reproduction

S2 review-e6ddcdcb3d9cf330-s2-final attempt 5 passed with 0 HIGH/MED. Approving BUILD-e6ddcdcb3d9cf330-s2 rewrote commit 2850809c9 to audit commit 48abed2fb and added eight PLAN/TASK ledger targets, changing fingerprint b9a819299ee133762e20c358af3bc331aa4b1c12285116ad7313e0cb3e86641f. Restoring only commit/changeLog reestablished that fingerprint, but artifact-level approval then rejected the schemaVersion 2 CR as unverifiable. Expected: unchanged reviewed BUILD approves without override or another model review.

## Root cause

src/workflow/gates.ts approveWorkflowTarget unconditionally runs the completion BUILD writer before review validation, regenerating existing reviewed content. Its otherPartyReviewGap separately applies legacy reviewBuildGap to task-based CR bodies instead of reusing src/workflow/code-review/task-review/completion.ts inspectTaskCompletion, so the two approval checks disagree.

## Fix intent

Preserve an existing BUILD during approval and retain creation for missing BUILD records. Recognize task-based CRs through the existing strict completion validator, retaining whole-story task coverage, current BUILD fingerprint, reviewer provenance and other-party checks. Add focused regressions for normal and direct approval, stable bookkeeping, missing record creation, and stale/incomplete/foreign review rejection. No schema change, review override, retired-engine restoration or additional S2 model review.

## Citations

- **[[c1]]** `code` `src/workflow/gates.ts`
- **[[c2]]** `code` `src/workflow/code-review/task-review/completion.ts`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/CR-e6ddcdcb3d9cf330-s2.json`
