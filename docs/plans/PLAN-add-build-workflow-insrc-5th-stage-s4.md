<!-- insrc:artifact PLAN-185807ba9a6b35d3-s4 -->

# Plan: E20260717185807ba:S004

**Epic:** `add-build-workflow-insrc-5th-stage`
**LLD run:** `wf-1784314958112-fd2glm`
**LLD effective hash:** `6d130af6ef10...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define the build-stage schema vocabulary | S | — | unit: unit: src/workflow/runners/build/schemas.ts exports BuildRunState/BuildHaltInfo/BuildRunProgress with contract-matching readonly signatures (optional inFlightTaskId/halt as `\\| undefined`) and shadows no existing workflow enum | [[c1]] |
| 2 | **`t2`** Add the 'running' member to sc4 BuildTaskStatus | S | — | unit: unit: BuildTaskStatus additively includes 'running' alongside the four prior members and existing exhaustive switches still compile via their default path (backwardCompat, ownership stays s3) | [[c2]] |
| 3 | **`t3`** Insert the halt branch into the per-Task drive loop | L | `t1`, `t2` | integration: integration: per-Task drive loop gives up on an unrepairable Task on the daemon's own test verdict, records only that Task's outcome 'failed', writes no blocked/not-reached rows, and starts no transitive DEPENDS_ON dependent (ac1, reuses gates.ts, stub sc5 TaskImplementerAdapter set to 'failed') | [[c3]] |
| 4 | **`t4`** Route finalize-on-halt through the ChainReport carrier | M | `t3` | integration: integration: a halted run (>=1 completed + one failed) finalizes into a ChainReport record via storage.ts/hash.ts/slug.ts with the accumulated BuildTaskOutcome[] checkpointed per Task boundary and read back from a temp storage dir; no parallel result store introduced (ac3, invariant c2) | [[c4]] |
| 5 | **`t5`** Implement the BuildRunProgress/BuildHaltInfo projection | M | `t1`, `t2` | unit: unit: BuildRunProgress/BuildHaltInfo projection folds BuildTaskOutcome[] + live PlanArtifact DEPENDS_ON graph — determinism/idempotent recompute, runState/completedTaskIds/inFlightTaskId/filesTouchedSoFar set-union, blockedTaskIds as recomputed transitive closure, all five thrown error paths, and edge cases (all-completed, no-dependents halt, empty plan, root failure, overlapping/empty filesTouched, mid-flight single 'running'), using the plan-artifact.test.ts fixture idiom (not mkTask, c5) | [[c5]] |
| 6 | **`t6`** Surface progress through WorkflowStepOutputBuild | M | `t4`, `t5` | integration: integration (driving-surface mirror, src/mcp/workflow-step/__tests__): a halted finalize emits WorkflowStepOutputBuild.next==='done' with progress carrying the halt frame (failedTaskId/failedTaskTitle/reason) + filesTouchedSoFar through the standard insrc_workflow_step surface (no new IPC/UI), driven via a stub sc5 TaskImplementerAdapter set to 'failed' (ac2) | [[c6]] |
| 7 | **`t7`** Wire the halt/progress path live through the build runner registration | M | `t3`, `t4`, `t6` | integration: integration (halt-and-report end-to-end, extends executor.test.ts registration/drive path): with the build runner registered via registerBuildRunners()/registerWorkflowRunners, a run that gives up on an unrepairable Task halts, starts no dependent, checkpoints per boundary (read back from temp storage dir), finalizes into a ChainReport via storage.ts/hash.ts/slug.ts, and surfaces the halt frame via WorkflowStepOutputBuild — no new registry mechanism; unregistering reverts to prior behavior (invariants c1/c3) | [[c7]] |

### E20260717185807ba:S004:T001 — Define the build-stage schema vocabulary

Create src/workflow/runners/build/schemas.ts and add the net-new, types-only vocabulary that s4 owns (sc6): the BuildRunState union ('running'|'halted'|'complete'), the BuildHaltInfo value object (failedTaskId, failedTaskTitle, reason, blockedTaskIds), and the BuildRunProgress projection interface (storyId, runState, totalTasks, completedTaskIds, optional inFlightTaskId, optional halt, filesTouchedSoFar). Signatures must match contractDetails.api exactly — readonly members, optional props as `| undefined`, declared as a read-time view rather than a stored record. Mirror the sibling-per-stage idiom; introduce no behavior and reuse/shadow no existing workflow enum (search.text confirmed no prior halt/status vocabulary in the package).

**Acceptance checks:**
- BuildRunState, BuildHaltInfo, and BuildRunProgress are exported from src/workflow/runners/build/schemas.ts with signatures matching contractDetails.api verbatim (readonly members; inFlightTaskId/halt optional as `| undefined`).
- The file introduces fresh vocabulary only — no existing workflow type in chain.ts/executor.ts/gates.ts/orchestrator.ts/types.ts is modified, duplicated, or shadowed (invariant c4).
- `tsc` compiles with the new file present and nothing yet consuming the new types.

### E20260717185807ba:S004:T002 — Add the 'running' member to sc4 BuildTaskStatus

Additively extend the s3-owned BuildTaskStatus union from 'completed'|'failed'|'blocked'|'not-reached' to add 'running', so the single in-flight Task is representable in the authoritative BuildTaskOutcome[] the s4 projection folds over. Additive value only — ownership stays with s3, no ownership relocation, and existing outcome rows/consumers remain valid because none produced or matched a 'running' value before. Ordered after s3 lands per storyDependsOn=[s3].

**Acceptance checks:**
- BuildTaskStatus includes 'running' alongside 'completed'|'failed'|'blocked'|'not-reached'; the change is strictly additive.
- Existing exhaustive switches over BuildTaskStatus continue to compile via their default/unhandled path; no producer or matcher of the prior members breaks (backwardCompat).
- The amendment lands after s3's sc4 (storyDependsOn=[s3]) and leaves ownership of BuildTaskOutcome/BuildTaskStatus with s3.

### E20260717185807ba:S004:T003 — Insert the halt branch into the per-Task drive loop

Open src/workflow/orchestrator.ts and src/workflow/gates.ts directly to confirm the actual halt-vs-press-on behavior of the per-Task drive loop (unread by graph exploration — the largest sizing risk in the Story), then implement the halt per the chosen alt a1: on the daemon's own test-verdict failure for a Task, record ONLY that Task's outcome status 'failed' and start no transitive DEPENDS_ON dependent. Do NOT stamp blocked/not-reached rows into the outcome array — under a1 that classification is recomputed at read time by t5's projection (eager materialization is the rejected a3 approach and would fork the single source of truth). The give-up decision is taken on the daemon's test verdict + tree diff, never the implementer adapter's advisory self-report. Reuse the existing gates.ts checkpoint machinery; add no new gate type and no parallel runner-registration path. At each Task boundary the loop emits observability via getLogger('workflow:build').

**Acceptance checks:**
- Before editing, orchestrator.ts and gates.ts are read directly and the current halt-vs-press-on branch is confirmed (not assumed); confirm whether 'cannot be completed' is observed via tracker state before finalizing the insertion point.
- On a daemon test-verdict failure the failed Task's outcome is recorded 'failed' and NO transitive DEPENDS_ON dependent Task is started (ac1); the loop does not write blocked/not-reached outcome rows — that classification is left to t5's read-time projection (alt a1, single source of truth; a3 eager-materialization is not used).
- The halt reuses existing gates.ts machinery — no new gate type and no new/parallel registry or runner-registration mechanism is introduced (invariant c3).
- Each Task boundary (task-start / implementer-finished / test-verdict / advance-or-halt) emits via getLogger('workflow:build') with no console.log, satisfying the observability NFR's per-boundary requirement.

### E20260717185807ba:S004:T004 — Route finalize-on-halt through the ChainReport carrier

Make a run that gives up on one Task still finalize into a ChainReport-carried record via the existing storage.ts/hash.ts/slug.ts artifact-writer envelope — the same durability substrate the sibling stages use — persisted incrementally at each Task boundary so a daemon restart mid-run leaves a readable record of what already landed on the tree. The halted run must reach finalize rather than ending as an untracked side-effect; add no second, parallel result store.

**Acceptance checks:**
- A halted run (>=1 'completed' Task plus one 'failed') finalizes into a ChainReport record through storage.ts/hash.ts/slug.ts, the same envelope as define/design.epic/design.story/plan (ac3, invariant c2).
- The accumulated BuildTaskOutcome[] is checkpointed at each Task boundary, so a restart mid-run leaves the already-landed outcomes readable rather than lost.
- No new or parallel result store is introduced; finalize reuses the existing ChainReport persistence substrate.

### E20260717185807ba:S004:T005 — Implement the BuildRunProgress/BuildHaltInfo projection

Implement the winning alt a1 pure read-time fold from the accumulated BuildTaskOutcome[] plus the live approved-plan DEPENDS_ON graph into BuildRunProgress and its nested BuildHaltInfo, with no separately stored record: runState from the presence of a 'failed' row, completedTaskIds/filesTouchedSoFar by folding the array (set-union for files), inFlightTaskId from the single 'running' slot, and blockedTaskIds recomputed as the failed Task's transitive dependent closure (never snapshotted). The projection throws the defined invariant errors rather than fabricating a frame. Author the sc6 unit suite alongside the implementation.

**Acceptance checks:**
- The projection is a pure deterministic fold: two reads with no intervening outcome write return an identical frame; no time- or random-derived field exists.
- runState==='halted' iff exactly one 'failed' row and 'complete' iff every Task is terminal with none failed; inFlightTaskId is the single 'running' slot or undefined; filesTouchedSoFar is the deduped set-union of completed rows' filesTouched; blockedTaskIds is the recomputed transitive DEPENDS_ON closure of the failed Task.
- The projection throws (never fabricates a frame) on: more than one 'failed' row, a taskId absent from the live plan graph (failed or non-failed row), an undecodable persisted outcome envelope, or an out-of-union status string.
- The testStrategy unit suite is authored using the src/workflow/__tests__ plan-artifact.test.ts fixture idiom (explicitly NOT the src/analyze/** mkTask helpers, invariant c5), covering: determinism/idempotent-recompute, all five thrown error paths, and the edge cases (all-completed, no-dependents halt, empty plan, root failure, overlapping/empty filesTouched, mid-flight single 'running').

### E20260717185807ba:S004:T006 — Surface progress through WorkflowStepOutputBuild

Populate the build finalize handler's WorkflowStepOutputBuild so a developer inspects the run through the same insrc_workflow_step turn shape as every earlier stage: set next='done' on a halted-or-complete finalize and fill progress?: BuildRunProgress with the sc6 projection carrying the halt frame (failedTaskId/failedTaskTitle/reason) and filesTouchedSoFar. No bespoke command, IPC method, or UI — the existing driving surface is the only channel. Author the driving-surface mirror integration suite for this turn shape.

**Acceptance checks:**
- On a halted-or-complete finalize, WorkflowStepOutputBuild.next==='done' and progress is the sc6 projection whose halt frame names failedTaskId, failedTaskTitle, and reason (daemon test-verdict summary, not a bare exit code), with filesTouchedSoFar populated.
- Inspection names the failed Task and what earlier Tasks left in place without a working-tree read (ac2), flowing through the standard insrc_workflow_step surface with no new IPC method or UI.
- A driving-surface mirror integration suite is authored in src/mcp/workflow-step/__tests__ asserting WorkflowStepOutputBuild.next==='done' with the halt-frame progress (failedTaskId/failedTaskTitle/reason + filesTouchedSoFar) for a halted finalize, driven via the stub sc5 TaskImplementerAdapter set to a chosen 'failed' verdict.

### E20260717185807ba:S004:T007 — Wire the halt/progress path live through the build runner registration

Wire s4's halt, finalize-on-halt, and progress handlers into the build runner registered through registerBuildRunners() via the existing registerWorkflowRunners seam in src/workflow/index.ts, mirroring the registerDesignEpicRunners/llmPauseRunner idiom. This is the flip that makes the halt-and-report seam live; rolling back = unregister, which fully reverts to the prior no-build-stage behavior. No new registry mechanism. Author the halt-and-report end-to-end integration suite.

**Acceptance checks:**
- The halt/progress path is reachable only via the build runner registered through registerBuildRunners()/registerWorkflowRunners — no new registry mechanism or parallel runner-registration path (invariants c1/c3).
- With the runner registered, an end-to-end run that gives up on an unrepairable Task halts, starts no dependent Task, finalizes into a ChainReport record, and surfaces the halt frame via WorkflowStepOutputBuild; unregistering fully reverts to prior no-build-stage behavior.
- The testStrategy halt-and-report integration suite is authored, driving the registered build runner + orchestrator drive loop + gates.ts with a stub sc5 TaskImplementerAdapter set to a chosen 'failed' verdict and a temp storage dir, asserting: no dependent Task is started, the incremental per-boundary checkpoint is readable back, and the halted run finalizes into a ChainReport via storage.ts/hash.ts/slug.ts.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/runners/build/schemas.ts — BuildRunProgress, BuildHaltInfo, BuildRunState (and the consumed BuildTaskStatus incl. the additive 'running' member) | `t1`, `t2`, `t5` |
| The BuildRunProgress projection function that folds BuildTaskOutcome[] + PlanArtifact graph into the run-level frame (src/workflow/runners/build/) | `t5` |
| registerBuildRunners wired via registerWorkflowRunners (src/workflow/index.ts, src/workflow/executor.ts) | `t7` |
| The per-Task drive loop halt insertion point (src/workflow/orchestrator.ts + src/workflow/gates.ts) | `t3`, `t7` |
| Halted-run finalize into ChainReport (src/workflow/chain.ts + src/workflow/storage.ts) | `t4`, `t7` |
| WorkflowStepOutputBuild population in the build runner (sc2, owned by s1) surfaced through the driving-surface mirror | `t6` |
| src/mcp/workflow-step/__tests__ (driving-surface exercise; mirrors tracker-tasks-coarse.test.ts) and src/daemon/__tests__/workflow-rpc.test.ts (IPC-level shape) | `t6` |
