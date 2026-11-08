<!-- insrc:artifact ISSUE-1b83eadf639af8a9 -->

# Do not request artifact approval for tracker run logs

## Reproduction

Run tracker.push, tracker.sync or tracker.post to completion through insrc_workflow_step. The operation succeeds and writes its operational report under ~/.insrc/workflow-runs, but the done response also returns pendingApproval for that report. insrc_present returns notPending; insrc_workflow_approve refuses the path as outside the repository, even with an explicit override. Observed during design-review epic9b04adb36cac716d publication: GitHub epic108, four stories and34 tasks were already closed and their bindings saved, while the false gate incorrectly appeared to block local completion. Expected: operational tracker reports are returned as completed run results without requesting repository artifact approval.

## Root cause

src/workflow/storage.ts:1198-1204 intentionally chooses runsDirFor(epicHash) for the three tracker workflows. Their finalizer persists tracker side effects before returning the audit report. However handleSynthesize in src/daemon/steps/workflow-step/phases/synthesize.ts:119-130 unconditionally includes pendingApproval for every successful workflow output. It does not distinguish tracker run logs from repository artifacts. The run report therefore receives an impossible approval instruction; the repository path boundary itself is functioning correctly.

## Fix intent

Return tracker.push, tracker.sync and tracker.post results without the false artifact approval gate. Preserve their current run-report storage and tracker metadata/binding side effects, and preserve human approval prompts for actual repository workflow artifacts. Do not allow arbitrary external paths into approval, relocate run logs or require new review/activation machinery. Add focused regression coverage for all three tracker completions and representative real artifact gates, including persisted tracker effects. After the fix is deployed, synchronize the already-closed design-review tracker states and publish the local records without creating duplicate GitHub issues.

## Citations

- **[[c1]]** `code` `src/daemon/steps/workflow-step/phases/synthesize.ts:35-130`
- **[[c2]]** `code` `src/workflow/storage.ts:1127-1206`
- **[[c3]]** `prior-artifact` `/home/subho/.insrc/workflow-runs/9b04adb36cac716d/tracker.push-wf-1794158777139-50634e.json`
- **[[c4]]** `stakeholder` `User authorized fixing the false tracker approval response, syncing closed tracker states and publishing the records.`
