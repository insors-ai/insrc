<!-- insrc:artifact PLAN-315d510cb28100e2-s6 -->

# Plan: E20261018315d510c:S006

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1792338834491-rpu44e`
**LLD effective hash:** `2ed0cef29a4f...`

Building s6 starts with the one addition to the team gate (the park-offer provider the approved amendment declares), then gives every authoring run an owner and an upstream snapshot at creation, then adds a pure handoff module (branch name, checkpoints, rebinding, stage inference). On top of that come parking (decide, then commit, push and note through a temporary worktree) and resuming (verify, then restore with rollback and return the next turn). The work finishes by exposing park and resume to the daemon, the MCP server and the terminal, and a two-clone end-to-end test proves the handoff.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Declare registerParkOfferProvider and set offerPark in the gate | S | — | unit: src/workflow/team/__tests__/park-offer.test.ts: teamGate sets offerPark only on held-by-other and only through a registered provider, a throwing provider counts as false, a repo with no policy makes no provider call, and describeOutcome appends the park command only then | [[c1]] [[c2]] |
| 2 | **`t2`** Give the workflow state store an entry meta, listStates and a meta-carrying encodeState | M | — | unit: src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts: the state store keeps meta beside the payload, carries it through reencodeState and replaceState, lists entries newest first without touching expiry, and an entry saved without meta behaves as before | [[c3]] |
| 3 | **`t3`** Capture the acting user and the upstream snapshot when a run is created | M | `t2` | unit: src/workflow/team/__tests__/snapshot-upstream.test.ts: snapshotUpstream lists the artifacts each workflow reads, including the Define and the effective HLD with approved amendments, a missing revision reads as 0, and a standalone Story does not fail; integration: src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts: handleStart records the acting user and the upstream snapshot on the stored run, plan and step turns keep them, and a repo without a policy records neither and makes no tracker call | [[c3]] [[c4]] |
| 4 | **`t4`** Write the pure handoff module: branch name, checkpoints, rebinding, stage inference | M | — | unit: src/workflow/team/__tests__/handoff-pure.test.ts: handoffBranchName fills placeholders, applies the default, rejects a grammar break and a pattern without {id}; unit: src/workflow/team/__tests__/handoff-pure.test.ts: checkpoint validation rejects an unknown schemaVersion or kind, a unit mismatch and a path outside the unit's artifact paths, for the run and draft variants; unit: src/workflow/team/__tests__/handoff-pure.test.ts: rebindCheckpoint replaces repoPath and repoIndexedAt in both intents, resets startedAtMs and leaves no parker path, for all three stages, and inferStageWorkflow follows the committed artifact chain | [[c5]] [[c6]] |
| 5 | **`t5`** Register the park-offer provider from the owner recorded on runs and from uncommitted drafts | S | `t1`, `t2`, `t3` | integration: src/workflow/team/__tests__/park-offer.test.ts: a held-by-other refusal carries offerPark when the actor owns a live run in any stage or has an uncommitted draft for the unit, never for an unowned run, and the workflow-step refusal text names the park command | [[c1]] [[c7]] |
| 6 | **`t6`** Decide what to park: refusals, run selection and checkpoint assembly | M | `t3`, `t4`, `t5` | integration: src/workflow/team/__tests__/handoff-park-plan.test.ts: parkPlan refuses when the actor holds the unit, for a Task, with no issue or holder, with nothing to park, and for a supplied token of another unit, actor or no owner, and assembles a run or draft-only checkpoint otherwise | [[c8]] |
| 7 | **`t7`** Perform the park: temporary worktree, commit, push, issue note and cleanup | M | `t6` | integration: src/workflow/team/__tests__/handoff-park.test.ts: parking commits the draft and checkpoint to the handoff branch, pushes it, notes the branch on the issue through issueOps.comment and leaves the user's branch, index and working tree untouched; integration: src/workflow/team/__tests__/handoff-park.test.ts: a git failure cleans up the worktree and local branch, a failed note returns noted false, a rejected push says someone else parked first, and a second park commits on top | [[c8]] [[c9]] |
| 8 | **`t8`** Verify before resuming: receiving repo, branch lookup, checkpoint and upstream | M | `t3`, `t4` | integration: src/workflow/team/__tests__/handoff-resume-check.test.ts: resumeCheck refuses an unregistered receiving path and a clone of a different repository before restoring anything, and refuses a moved upstream including the effective HLD and the Define; integration: src/workflow/team/__tests__/handoff-resume-check.test.ts: a missing branch returns restart, a network failure is refused, a committed LLD with no PLAN resumes as plan, both committed is nothing-to-resume, and an unknown schema, unit mismatch, outside path and dirty file are each refused | [[c8]] [[c9]] [[c10]] |
| 9 | **`t9`** Restore and resume: apply the plan with rollback and return the next turn | M | `t7`, `t8` | integration: src/workflow/team/__tests__/handoff-resume.test.ts: a new assignee on a clone at another absolute path resumes a run parked before the plan, and one parked mid-steps at its next step with its earlier step outputs, rebound to that clone; integration: src/workflow/team/__tests__/handoff-resume.test.ts: a draft-only checkpoint restores the draft and returns restart, and a restore that fails part way leaves the working tree as it was and saves no state | [[c8]] [[c9]] [[c10]] |
| 10 | **`t10`** Expose park and resume as workflow-step phases and daemon operations | M | `t7`, `t9` | integration: src/daemon/steps/workflow-step/__tests__/handoff-phases.test.ts: the park and resume phases and the team.park and team.resume operations reach the run store, return the park result or the next turn, and map a gate refusal to team-gate-refused | [[c11]] |
| 11 | **`t11`** Declare park and resume at every MCP exposure site | S | `t10` | integration: src/mcp/__tests__/park-resume-phases.test.ts: an MCP call with phase park and with phase resume passes validation and reaches the workflow-step handler, and the schema registry and the tool-surface fixture list both phases | [[c11]] [[c12]] |
| 12 | **`t12`** Add the team park and team resume terminal commands | M | `t10` | integration: src/cli/__tests__/team-park-resume.test.ts: team park and team resume parse the unit and --workflow, print the offer, the outcome or the holder, and print the usage line for bad arguments | [[c11]] [[c13]] |
| 13 | **`t13`** Update the guarded entry-point inventory and prove the two-clone handoff end to end | S | `t11`, `t12` | integration: src/workflow/__tests__/gate-guarded-entry-points.test.ts: the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it; integration: src/workflow/team/__tests__/handoff-e2e.test.ts: from a reassignment refusal with an offer through park to resume on a second clone, and after a lost machine with no parked branch only the stage that has no artifact restarts, a committed LLD leaving the plan to do | [[c13]] [[c14]] |

### 1.1 E20261018315d510c:S006:T001 — Declare registerParkOfferProvider and set offerPark in the gate

In src/workflow/team/gate.ts add registerParkOfferProvider (amendment AMD-315d510cb28100e2-13, shaped like registerCompletionHook, shipped with no provider). teamGate and claim consult it for a held-by-other outcome (a throwing provider counts as false, no call without a policy) and describeOutcome appends the park command when offerPark is true.

**Acceptance checks:**
- With no provider registered offerPark stays false on every outcome
- offerPark is true only on held-by-other and only when the provider returns true for (repo, unit, actor); a throwing provider counts as false
- A repo with no policy makes no provider call and no tracker call
- describeOutcome appends the park command only for held-by-other with offerPark true

### 1.2 E20261018315d510c:S006:T002 — Give the workflow state store an entry meta, listStates and a meta-carrying encodeState

Extend src/daemon/steps/workflow-step/state-store.ts so each entry can carry meta { owner, upstream } beside payload, createdAt and touchedAt, with saveState taking the meta, replaceState carrying the previous entry's meta, and a listStates that returns entries newest first without touching expiry. encodeState takes the optional meta and reencodeState preserves it; the payload shape and token format do not change.

**Acceptance checks:**
- encodeState stores meta beside the payload and reencodeState and replaceState carry it onto the replacement
- listStates returns every live entry newest-touch first and does not change any entry's expiry
- An entry saved without meta behaves exactly as before and has no owner

### 1.3 E20261018315d510c:S006:T003 — Capture the acting user and the upstream snapshot when a run is created

Add actingUser(repo) (the tracker login when claims are enforced, otherwise undefined with no tracker call) and snapshotUpstream(repo, workflow, params) covering every input the stage reads: design.epic the Define; design.story the Define and the effective HLD including approved-amendment state; plan the Story LLD, the effective HLD and the Define dependency edges; revisions through readRevision so a missing one is 0; the standalone exception kept. handleStart sets meta.owner and meta.upstream before encodeState.

**Acceptance checks:**
- handleStart stores the acting user and the upstream snapshot on the run, and the plan and step turns keep them
- snapshotUpstream records the Define and the effective HLD (base revision plus approved-amendment state) for design.story, the LLD, effective HLD and Define for plan, and the Define for design.epic
- A standalone Story with no HLD or Epic does not fail the snapshot
- A repo without a team policy records neither owner nor snapshot and makes no tracker call

### 1.4 E20261018315d510c:S006:T004 — Write the pure handoff module: branch name, checkpoints, rebinding, stage inference

Add src/workflow/team/handoff.ts with handoffBranchName (placeholders id, slug, type; default insrc/handoff/{type}-{id}; grammar check; pattern must contain {id}), the HandoffCheckpoint run and draft variants with validation (schema version, kind, unit match, path containment under the unit's artifact paths), rebindCheckpoint (repoPath and repoIndexedAt replaced in both intents, startedAtMs reset, for all three stages) and inferStageWorkflow from the committed artifact chain. Set the branchPattern catalog row default in src/config/repo-fields.ts and drop its not-used-yet note.

**Acceptance checks:**
- handoffBranchName fills placeholders, applies the default, rejects a name that breaks the grammar and a pattern without {id}
- Checkpoint validation rejects an unknown schemaVersion or kind, a unit mismatch and any path outside the unit's artifact paths
- rebindCheckpoint leaves no parker path in the payload or executor intent and works for awaiting_plan, awaiting_llm_step and awaiting_synthesize
- inferStageWorkflow returns plan for a Story with an LLD and no PLAN and complete when both are committed

### 1.5 E20261018315d510c:S006:T005 — Register the park-offer provider from the owner recorded on runs and from uncommitted drafts

Implement the provider the handoff module registers with the gate: true when the actor owns a live run for the unit in any stage (meta.owner equals the actor, found through listStates) or has an uncommitted draft artifact for the unit (git status on the unit's artifact paths); a run without an owner never counts. Register it at daemon startup beside the other gate registrations.

**Acceptance checks:**
- A held-by-other refusal carries offerPark for an owned run in any stage and for an uncommitted draft
- A run with no owner never produces an offer
- The refusal text printed by the workflow-step handler and the terminal names the park command

### 1.6 E20261018315d510c:S006:T006 — Decide what to park: refusals, run selection and checkpoint assembly

Add parkPlan(repo, unit, opts) in src/workflow/team/handoff.ts: refuse when the actor holds the unit, the unit is a Task, there is no issue or holder, there is nothing to park, the supplied token belongs to another unit, another actor or no owner, or the branch name is invalid; otherwise choose the actor's most recently touched owned run (or only the draft), and assemble the run or draft-only checkpoint with the owner, the upstream snapshot, the repository identity (root commit id) and the artifact paths. No git command that changes anything runs here.

**Acceptance checks:**
- Every park refusal in the LLD's error paths returns ok:false with its reason and writes nothing
- With an owned live run the plan is a run checkpoint carrying the owner, the upstream snapshot and the repository identity; with only an uncommitted draft it is a draft-only checkpoint
- With two owned runs for the unit the most recently touched one is chosen and its run id is named

### 1.7 E20261018315d510c:S006:T007 — Perform the park: temporary worktree, commit, push, issue note and cleanup

Add executePark(plan) and parkDraft(repo, unit, opts) (= parkPlan then executePark): commit the draft artifacts and the checkpoint through a temporary worktree to the handoff branch, push it, add one note through port.issueOps.comment, and clean up the worktree and the local branch on any git failure. A rejected push is reported as another owner having parked first; a failed note returns ok with noted:false without undoing the push.

**Acceptance checks:**
- Parking pushes a branch holding the checkpoint and draft artifacts and adds exactly one issue note, leaving the user's checked-out branch, index and working tree unchanged
- A git failure removes the temporary worktree and local branch and leaves the run in the store
- A failed note returns ok with noted:false; a rejected push is reported as another owner having parked first
- Parking a unit twice reuses the deterministic branch and commits on top

### 1.8 E20261018315d510c:S006:T008 — Verify before resuming: receiving repo, branch lookup, checkpoint and upstream

Add verifyReceivingRepo (path registered through listRepos, repository identity by the root commit id) and resumeCheck(repo, unit, opts): the author gate with the workflow, the registration and identity check before anything is fetched or restored, ls-remote to tell a missing branch from a failure, fetch of the branch into a temporary ref, checkpoint validation, comparison of the whole upstream snapshot with current revisions, the stage inference and the dirty-file check. It returns a validated restore plan, or restart, nothing-to-resume or refused, and changes no working file.

**Acceptance checks:**
- An unregistered path and a clone of a different repository are refused before any file is restored
- A moved upstream (including revision 0 on both sides, the effective HLD and the Define) is refused
- A missing branch returns restart while a network or permission failure is refused with the git message
- An unknown schema, a unit mismatch, a path outside the unit and a dirty target file are each refused with the specific reason
- A committed LLD with no PLAN infers plan and both committed returns nothing-to-resume

### 1.9 E20261018315d510c:S006:T009 — Restore and resume: apply the plan with rollback and return the next turn

Add applyResume(plan) and resumeStage(repo, unit, opts) (= resumeCheck then applyResume): restore the parked files keeping the pre-restore copies, roll every file back if any step fails, rebind both intents to the receiving clone with rebindCheckpoint, store the run with the actor as owner and the checkpoint's snapshot, and return the next turn (emit_plan, emit_step or emit_synthesize); a draft-only checkpoint restores the draft and returns restart with draftRestored.

**Acceptance checks:**
- A run parked before the plan and one parked mid-steps resume on a clone at another absolute path at the right turn with earlier step outputs
- A failed restore leaves the working tree exactly as it was and saves no state
- A draft-only checkpoint restores the draft and returns restart for the inferred stage with draftRestored true
- The stored run is owned by the actor and carries the checkpoint's upstream snapshot

### 1.10 E20261018315d510c:S006:T010 — Expose park and resume as workflow-step phases and daemon operations

Add the park and resume phases to the workflow-step input and output types, the dispatcher in src/daemon/steps/workflow-step/handler.ts (and its unknown-phase message) and new phase handlers that call parkDraft and resumeStage and map TeamGateRefusedError to team-gate-refused; register the team.park and team.resume operations in the daemon handler map beside repo.add.

**Acceptance checks:**
- The park and resume phases reach the run store and return the park result or the next workflow turn
- team.park and team.resume return the same results over the daemon operation
- A refusal by the gate comes back as team-gate-refused naming the holder

### 1.11 E20261018315d510c:S006:T011 — Declare park and resume at every MCP exposure site

Add the two phases to the phases array and the z.enum in src/mcp/server.ts, extend the tool description and the params description for runToken and workflow, update the schema-registry expectation in src/mcp/__tests__/schema-registry.test.ts and regenerate the tool-surface golden fixture, with a test that an MCP call with phase park and with phase resume passes validation and reaches the handler.

**Acceptance checks:**
- The MCP server accepts phase park and phase resume and forwards them to the daemon handler
- The schema-registry test and the tool-surface golden fixture list the new phases
- No other phase's schema changes

### 1.12 E20261018315d510c:S006:T012 — Add the team park and team resume terminal commands

In runTeam (src/cli/command.ts) add team park <epicHash> [storyId] and team resume <epicHash> [storyId] [--workflow <name>], parse the unit and workflow, call teamPark and teamResume in src/cli/services/team.ts, which use the daemon rpc for team.park and team.resume, extend the Services interface and the test fakes, the usage line and the help text, and print the outcome or the refusal naming the holder.

**Acceptance checks:**
- team park and team resume parse the unit and --workflow, call the daemon operations and print the outcome or the holder
- Bad or missing arguments print the usage line and call nothing
- The refusal line for a held stage includes the park command when an offer exists

### 1.13 E20261018315d510c:S006:T013 — Update the guarded entry-point inventory and prove the two-clone handoff end to end

Add the park and resume entry points to src/workflow/__tests__/gate-guarded-entry-points.test.ts (resumeStage asks the author gate, parkDraft reads the holder through the gate) and add an end-to-end test with a bare origin and two clones at different absolute paths: refusal with an offer, park, resume at the right turn, and the lost-machine restart.

**Acceptance checks:**
- Removing the gate call from resumeStage or parkDraft fails the inventory test
- The end-to-end test goes from a reassignment refusal with an offer through park to resume on the second clone
- The lost-machine case restarts only the stage that has no artifact

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| handoffBranchName: placeholder filling, the default pattern, grammar rejection, a pattern that omits {id} | `t4` |
| HandoffCheckpoint validation: schema version, kind, unit match, path containment under the unit's artifact paths, run and draft variants | `t4` |
| rebindCheckpoint: repoPath and repoIndexedAt replaced in both the payload intent and the executor intent, startedAtMs reset, no parker path left, for stages awaiting_plan, awaiting_llm_step and awaiting_synthesize | `t4` |
| inferStageWorkflow: Epic without HLD, Story with no LLD, with an LLD and no PLAN (plan), with both (complete) | `t4` |
| snapshotUpstream: the artifacts each workflow reads, a missing revision reading as 0 | `t3` |
| describeOutcome appends the park command only for held-by-other with offerPark true | `t1` |
| teamGate sets offerPark only on held-by-other and only through a registered provider; a throwing provider counts as false | `t1` |
| state store: encodeState keeps meta beside the payload, reencodeState and replaceState carry it, listStates is newest-first and does not touch expiry | `t2` |
| handleStart records the acting user and the upstream snapshot on the stored run, and the plan and step turns keep them; a repo without a policy records neither and makes no tracker call | `t3` |
| parkDraft from a refused holder to a pushed branch, a checkpoint and one issue note through issueOps.comment, leaving the checked-out branch, index and working tree unchanged | `t7`, `t13` |
| reassignment before the plan: a run parked at awaiting_plan resumes on the second clone and returns the emit_plan turn | `t9` |
| a run parked mid-steps resumes on the second clone at nextStepIndex with its earlier step outputs, rebound to that clone | `t9`, `t13` |
| a daemon restart leaves a draft-only checkpoint; resume restores the draft and returns restart with draftRestored, and a restore that fails part way leaves the working tree as it was | `t9` |
| resumeStage refuses an unregistered receiving path and a clone of a different repository before restoring anything | `t8` |
| a Story whose LLD is committed and whose PLAN is not resumes as plan, and a Story with both committed returns nothing-to-resume | `t8`, `t13` |
| resumeStage with no branch returns restart naming the stage to start fresh | `t8`, `t13` |
| park and resume error paths: supplied token of another unit, actor or no owner, push rejected, comment fails, unknown schema, upstream revision moved (including revision 0 on both sides), dirty target files, network failure versus missing branch | `t6`, `t7`, `t8` |
| the workflow-step park and resume phases and the team.park and team.resume daemon operations reach the run store and return the next turn | `t10`, `t11` |
| the terminal team park and team resume commands parse the unit and --workflow, print the outcome or the holder, and print the usage line for bad arguments | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s6 teamGate and GateOutcome.held-by-other.offerPark`
- **[[c2]]** `prior-artifact` `LLD s6 hld.amendmentProposal registerParkOfferProvider (AMD-315d510cb28100e2-13)`
- **[[c3]]** `prior-artifact` `LLD s6 Workflow state store entry and encodeState`
- **[[c4]]** `prior-artifact` `LLD s6 snapshotUpstream and handleStart`
- **[[c5]]** `prior-artifact` `LLD s6 HandoffCheckpoint, rebindCheckpoint, inferStageWorkflow and handoffBranchName`
- **[[c6]]** `prior-artifact` `LLD s6 branchPattern row`
- **[[c7]]** `prior-artifact` `LLD s6 offerPark invariant change and actingUser`
- **[[c8]]** `prior-artifact` `LLD s6 parkDraft and its error paths`
- **[[c9]]** `analyze-bundle` `src/workflow/team/git.ts:16-33`
- **[[c10]]** `prior-artifact` `LLD s6 resumeStage, verifyReceivingRepo and its error paths`
- **[[c11]]** `prior-artifact` `LLD s6 insrc_workflow_step park and resume phases, team.park and team.resume`
- **[[c12]]** `analyze-bundle` `src/mcp/server.ts:464`
- **[[c13]]** `prior-artifact` `LLD s6 teamPark and teamResume`
- **[[c14]]** `analyze-bundle` `src/workflow/__tests__/gate-guarded-entry-points.test.ts`
