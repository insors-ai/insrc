<!-- insrc:artifact CR-2f27754d4ad00b8e-s7 -->

# Code review: 2f27754d4ad00b8e:s7

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 14 · model `claude:opus`

**Changed files:** 50

## adherence — 0 finding(s)

_No findings._

## conventions — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/gates.ts:616 | approveArtifactByJsonPath declares `opts?: { readonly overrideReview?: string }`. Under exactOptionalPropertyTypes the optional property should be `overrideReview?: string \| undefined`. The line probably predates s7 (the file's history shows s3 and s6 work), but it is in a file s7 touched. |
| LOW | src/workflow/gates.ts:915 | approveWorkflowTarget declares `opts?: { readonly enforce?: boolean }` without `\| undefined` on the optional property. |
| LOW | src/workflow/gates.ts:1088 | readArtifactMeta returns `{ epicHash?: string; storyId?: string }`. These optional properties are not declared `\| undefined`. |
| LOW | src/cli/services/workflow.ts:140 | attachApprovedDocuments returns a type containing `commit?: CommitArtifactsResult` without `\| undefined`. |
| LOW | src/workflow/artifact-core/completion-evidence.ts:1 | completion-evidence.ts adds its own readJson/asRecord helpers. gates.ts (readJsonOrUndefined) and tracker/resolve.ts (readArtifact) each have equivalents. The modules touched here usually keep a private reader per file, so this may be the local idiom; it is drawn from few examples. |

## coverage — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/tasks-sync.ts:85 | Present but unverified: recordTaskRound has an empty testsReaching. The passing validate-task-round.test.ts ('a validate turn records its round in the Task's own log…') should reach it through handleBuildStep → runValidateTurn, but the graph shows no edge from runValidateTurn either. The test record shows the file passing, yet the grounding cannot confirm that this function is the one exercised. |
| MED | src/daemon/tasks-sync.ts:63 | Present but unverified: syncPlanTasks and followOnTasksSync (the daemon seam behind plan approval) have no testsReaching edges. task-set-approve.test.ts passes and its title claims coverage 'through the daemon seam', but no reaching edge confirms it. |
| LOW | src/workflow/tasks/task-set.ts:148 | Present but unverified: the TaskSets methods createFromPlan, reconcile, edit, recordBuildRound and syncOnPlanApproval have empty testsReaching. The graph appears to lack call edges into class methods. The promised task-set-create, task-set-reconcile, task-set-edit, task-set-sync and task-build-rounds tests are all present and passing in the test record, so this looks like a grounding gap, not a missing test. |
| LOW | src/workflow/tasks/lookup.ts:59 | Present but unverified: taskHeadIdOf and taskIssueRefsOf have no testsReaching edges. task-readers.test.ts passes and covers the head-based readers by title, but no edge confirms that these functions are reached. |
| LOW | src/workflow/artifact-core/task-bodies.ts:19 | Present but unverified: checkTaskBody and checkTasksBody have no testsReaching edges. tasks-codec.test.ts ('…refuse a malformed body') passes and probably reaches them through codecFor, but the graph does not confirm it. |
| LOW | src/cli/panes/WorkflowsPane.tsx:113 | Unverified: doApprove is now async and has an empty testsReaching. The test meant to cover it (in tui.test.ts) is not in the build test record, so its pass state cannot be confirmed. |
| LOW | src/workflow/artifact-write-inventory.ts:286 | Unverified: checkInventoryEntry and the scanWriters helpers have no testsReaching edges. artifact-write-inventory.test.ts references them, but that file is not in the test record, so its pass state is unverified. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/artifact-core/completion-evidence.ts:30 | readJson re-implements the existing safe JSON reader in gates.ts (read the file if it exists, parse it, return undefined on any failure). The only difference is that this one also narrows the result to an object. Two copies can drift on how they treat a missing or corrupt record. |
| LOW | src/workflow/artifact-core/completion-evidence.ts:38 | asRecord duplicates the plain-object guard isObject in task-bodies.ts (not null, typeof 'object', not an array). Consider sharing one helper. |
| LOW | src/workflow/tracker/unit-issue.ts | firstSentence is defined twice in the changed set, here and in runners/tracker/context.ts, for the same purpose: a one-line summary of a Task or Story for a tracker issue. If the two copies diverge, the issue body could summarize the same text differently depending on which path rendered it. |
| LOW | src/workflow/artifact-core/completion-evidence.ts:55 | taskBuildPassed calls History.log without a guard. Every other read in this module returns undefined/false on a bad record, but a corrupt or unreadable sidecar log throws out of the CompletionEvidence port and into the completion roll-up. If throwing is the intended fail-closed behaviour, it should be stated; otherwise catch the error and return false like the BUILD-record fallback does. |

