<!-- insrc:artifact ISSUE-42411279eac2687e -->

# Retry a BUILD's Story/Epic completion rollup after the BUILD itself has already gone terminal

## Reproduction

1. Approve a BUILD artifact via insrc_workflow_approve({ artifactPath }) with an overrideReview. approveWorkflowTarget's approveOne() calls approveArtifactByJsonPath, which succeeds and stamps the BUILD's meta.lifecycle.status to 'completed'; completeAfter is then set true and completeThroughService runs lifecycle.completeIfRolledUp for the Story/Epic.
2. Have that rollup itself fail for any transient, unrelated reason -- e.g. a sibling TASK/PLAN/LLD artifact under the same epicHash has a lifecycle-integrity conflict (checkHeadIntegrity/checkIntegrity in src/workflow/artifact-core/lifecycle.ts return hash-mismatch). completeThroughService catches the error and returns a story-completion FollowOnOutcome with ok:false; the STORY artifact stays status 'draft'.
3. Fix the underlying cause (e.g. correct the sibling artifact's integrity conflict) and call insrc_workflow_approve again on the SAME BUILD artifactPath, hoping to retry just the rollup.
Observed: approveOne() calls approveArtifactByJsonPath again, which now throws IllegalTransitionError with message 'record-override is not a step from completed', because the BUILD's lifecycle.status is already 'completed' and record-override is not a legal transition from it. The error is caught and pushed to skipped[]; completeAfter stays false, so completeThroughService is never invoked, and the rollup is never retried.
An epicHash-batch insrc_workflow_approve call does not help either: pendingArtifactJsonPaths (src/workflow/gates.ts) filters by approvalStateOf(meta) !== 'approved', and approvalStateOf (src/workflow/artifact-core/approval-view.ts) treats 'completed' as already-approved-or-beyond (APPROVED_OR_BEYOND includes 'completed'), so the already-completed BUILD is excluded from the sweep and never revisited.
Expected: once the underlying cause of a failed rollup is fixed, there should be a supported way to re-run just the Story/Epic completion rollup for a BUILD that is already 'completed' but whose Story has not rolled up -- without needing a fresh, now-illegal approval transition on the BUILD artifact itself.

## Root cause

In approveWorkflowTarget's approveOne() (src/workflow/gates.ts:886-916), the rollup helper completeThroughService (src/workflow/gates.ts:815-946, nested inside approveWorkflowTarget) is only invoked when the local completeAfter flag is true, and completeAfter is set true ONLY as the side effect of a fresh, successful call to approveArtifactByJsonPath in the same function. There is no independent trigger for completeThroughService: it is not called based on the BUILD artifact's CURRENT lifecycle state (i.e. 'is this BUILD completed but its Story/Epic not yet completed'), only as a one-shot side effect of a state transition that, once the BUILD reaches 'completed', can never legally happen again (approveArtifactByJsonPath's own transition table rejects a record-override from 'completed', surfacing as IllegalTransitionError). Compounding this, the epicHash-batch sweep in the same file (pendingArtifactJsonPaths) also excludes any artifact approvalStateOf() reports as approved-or-beyond -- which explicitly includes 'completed' (APPROVED_OR_BEYOND in src/workflow/artifact-core/approval-view.ts) -- so a completed-but-not-rolled-up BUILD is invisible to that path too. Net effect: completeThroughService's only two real callers (approveWorkflowTarget and approveOne, confirmed via usage.example) both require a fresh, successful approval transition that a terminal BUILD can no longer undergo, leaving no code path that re-checks and retries the rollup for an already-terminal BUILD.

## Fix intent

Decouple the Story/Epic completion rollup from the BUILD artifact's own approval state transition, so it can be retried after the fact. Concretely: let approveWorkflowTarget (or a narrowly-scoped sibling entry point reachable from insrc_workflow_approve) detect a BUILD whose own lifecycle.status is already 'completed' but whose Story (and/or Epic) has not itself reached 'completed', and run completeThroughService's rollup logic (lifecycle.completeIfRolledUp) for it directly -- without requiring approveArtifactByJsonPath to execute a fresh, now-illegal transition first. The fix should not change the happy-path behavior (a fresh BUILD approval still completes and rolls up as it does today), should not weaken the review/override gate, and should be covered by a regression test alongside the existing src/workflow/__tests__/story-completion.test.ts that reproduces: approve a BUILD, force the rollup to fail (simulating a sibling integrity conflict), fix the cause, then verify the Story/Epic DOES reach 'completed' on a subsequent call -- without requiring a second full approval cycle on the now-terminal BUILD.

## Citations

- **[[c1]]** `code` `src/workflow/gates.ts:886-916` — "if (completeAfter) {
			const outcome = await completeThroughService(jsonPath);
			if (outcome !== undefined) followOn.push(outcome);
		}"
- **[[c2]]** `code` `src/workflow/gates.ts:815-946` — "const completeThroughService = async (jsonPath: string): Promise<FollowOnOutcome | undefined> => {"
- **[[c3]]** `code` `src/workflow/artifact-core/approval-view.ts:18` — "export const APPROVED_OR_BEYOND: readonly string[] = ['approved', 'in-signoff', 'changes-requested', 'signed-off', 'completed'];"
- **[[c4]]** `code` `src/workflow/artifact-core/lifecycle.ts:125` — "return stored !== '' && stored !== hashOf(a) ? { ok: false, reason: 'hash-mismatch' } : { ok: true };"
