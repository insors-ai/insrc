<!-- insrc:artifact PLAN-315d510cb28100e2-s5 -->

# Plan: E20261018315d510c:S005

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1792331388740-htqbtj`
**LLD effective hash:** `3746c66db3c6...`

Building s5 adds one team gate in the workflow library and wires it into every place that changes a stage: the daemon's authoring and build steps, local approval and the approval of a target, finding application, and the automatic review fixes. It also adds the add-only addAssignee to the tracker port, a claim and a release operation, and two terminal commands (team claim, team release). A repo without a team policy is untouched; a team repo's changes are refused naming the holder.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add addAssignee to the tracker port and the GitHub adapter | S | — | unit: src/workflow/tracker/__tests__/github-adapter.test.ts: addAssignee adds without removing, returns the assignees read back and reports a failed step without a retry | [[c1]] [[c4]] |
| 2 | **`t2`** Build the team gate core and the implicit claim | M | `t1` | unit: src/workflow/team/__tests__/gate.test.ts: teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false; unit: src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding; unit: src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively; unit: src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time | [[c1]] [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Add the completion hook and the first-author exception to the gate | M | `t2` | unit: src/workflow/team/__tests__/gate.test.ts: the first author turn of a stage with no issue and no artifact is allowed as an explicit exception and any other action on a stage with no issue is refused; unit: src/workflow/team/__tests__/gate.test.ts: the registered completion hook is consulted for author and build on a next stage and for open-signoff, revise and release, a release called by the hook does not consult it again, and with none registered the gate behaves as continue (a hook-contract test; the completion-releases-the-claim integration test belongs to s7); unit: src/workflow/team/__tests__/gate.test.ts: each port failure kind, several assignees, an unreadable policy, a missing issue and a throwing completion hook map to refused or no-issue with the reason and never throw | [[c1]] [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Add claim, release and the review-fix decision | M | `t2` | unit: src/workflow/team/__tests__/gate.test.ts: claim takes only an unassigned stage, never removes another assignee, and reports a contested claim or a failed re-read as refused; unit: src/workflow/team/__tests__/gate.test.ts: release clears the assignees for the holder and for an administrator, including a contested claim, and refuses anyone else without calling setAssignee; unit: src/workflow/team/__tests__/review-fix-decision.test.ts: reviewFixDecision returns apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read | [[c1]] [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Guard local approval and approval of a target | M | `t2` | integration: src/workflow/__tests__/gate-approve.test.ts: approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget authorizes a BUILD target before ensureBuildRecordOnCompletion so a refused target creates no BUILD record, puts it in skipped[] with the reason and approves the others | [[c1]] [[c2]] [[c3]] [[c4]] |
| 6 | **`t6`** Guard finding application and the automatic review fixes | M | `t4` | integration: src/workflow/review/__tests__/gate-resolve-finding.test.ts: resolveReviewFinding with action apply by a non-holder throws TeamGateRefusedError before writing the markdown or the artifact, while accept, override and defer still run; integration: src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts: a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged | [[c1]] [[c2]] [[c3]] [[c4]] |
| 7 | **`t7`** Guard the authoring routes | M | `t3` | integration: src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts: workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, the first author turn with no issue is let through, and a repo without a policy behaves as before | [[c1]] [[c2]] [[c3]] [[c4]] |
| 8 | **`t8`** Guard build | S | `t3` | integration: src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts: build implement and validate on a stage held by someone else are refused naming the holder | [[c1]] [[c2]] [[c3]] [[c4]] |
| 9 | **`t9`** Add the team claim and release commands | S | `t4` | integration: src/cli/__tests__/team-claim-release.test.ts: team claim and team release resolve the unit, call the gate functions, print the outcome or the holder, and print the usage line for bad arguments | [[c1]] [[c4]] |
| 10 | **`t10`** Add the guarded entry-point inventory and refusal output tests | S | `t5`, `t6`, `t7`, `t8`, `t9` | integration: src/workflow/__tests__/gate-guarded-entry-points.test.ts: the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it; integration: src/cli/__tests__/gate-refusal-output.test.ts: the terminal approve and resolve commands print the refusal naming the holder, formatted beside the review-block message | [[c1]] [[c3]] [[c4]] |

### 1.1 E20261018315d510c:S005:T001 — Add addAssignee to the tracker port and the GitHub adapter

Add the add-only addAssignee(issue, who) to TrackerPort in src/workflow/tracker/port.ts and implement it in the GitHub adapter (src/workflow/tracker/github-adapter.ts) beside setAssignee: it adds who without removing anyone, re-reads, and returns the assignees read back. setAssignee stays for release. This Task adds the method as the additive sc1 amendment AMD-315d510cb28100e2-12, which is still pending with s1 and needs its approval, as was done for findIssues; it changes no existing method. Other test doubles that cast to TrackerPort are unaffected.

**Acceptance checks:**
- addAssignee adds the login without removing another assignee and returns the assignees read back
- A failed or timed-out step is reported as a classified PortResult failure and is not retried
- setAssignee behaviour is unchanged

### 1.2 E20261018315d510c:S005:T002 — Build the team gate core and the implicit claim

Add src/workflow/team/gate.ts with GuardedAction, GateOutcome, ClaimState, TeamGateRefusedError and teamGate(repo, unit, action): allowed with no tracker call for no policy, teamMode false, claimsEnforced false or an unguarded action; otherwise load the tracker with the claim capability, make its own whoAmI call, read the assignee live, treat the assignee as the holder (logins compared case-insensitively), give held-by-other naming the holder, refuse several assignees and every port or policy failure, and take the implicit claim through addAssignee for author and build. Logs every non-allowed outcome with unit, action and reason. Never throws.

**Acceptance checks:**
- A repo with no policy, teamMode false or claimsEnforced false is allowed with no tracker call
- An unassigned stage is allowed for author and build with implicitClaim true and takes no claim for approve-local or applying a finding
- A developer assigned directly in the tracker is the holder, with logins compared case-insensitively
- Another holder gives held-by-other naming them whatever their idle time
- Several assignees, every port failure kind and an unreadable policy map to refused with the reason and never throw

### 1.3 E20261018315d510c:S005:T003 — Add the completion hook and the first-author exception to the gate

In src/workflow/team/gate.ts add CompletionHook and registerCompletionHook, consult the registered hook for author and build on a next stage and for open-signoff, revise and release (a throwing hook refuses with its message; none registered continues), give the hook's own release a non-recursive internal path that skips the hook, and return no-issue for a stage whose issue cannot be resolved or created, with allowFirstAuthor true only for the first author turn of a stage that has no artifact yet; any other action on such a stage is refused.

**Acceptance checks:**
- The completion hook is consulted for the listed actions, a release from the hook does not consult it again, and with none registered the gate continues
- A throwing hook refuses with its message and never throws
- The first author turn of a stage with no issue and no artifact is allowed and any other action on a stage with no issue is refused
- A missing issue that ensureUnitIssue can create is created and the gate then decides

### 1.4 E20261018315d510c:S005:T004 — Add claim, release and the review-fix decision

In src/workflow/team/gate.ts add claim(repo, unit) (only an unassigned unit; addAssignee then a re-read; a contested or failed claim is refused and nobody is removed, and the wording says contention is reported when observed) and release(repo, unit) (clears the assignees through setAssignee for the holder or a policy administrator, including a contested claim; anyone else refused with no port write), and reviewFixDecision(repo, unit) returning apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read.

**Acceptance checks:**
- claim takes only an unassigned stage and never removes another assignee
- A contested claim and a failed re-read are refused; the interleaving where the earlier claimant returned allowed and only the later one observes contention is tested
- release clears for the holder and for an administrator and refuses anyone else without calling setAssignee
- reviewFixDecision returns report-only for a non-holder and for a failed read

### 1.5 E20261018315d510c:S005:T005 — Guard local approval and approval of a target

In src/workflow/gates.ts make approveArtifactByJsonPath ask the gate for approve-local and throw TeamGateRefusedError before any review check or stamp, and make approveWorkflowTarget authorize each target before ensureBuildRecordOnCompletion creates or merges its BUILD record: a Story-wide BUILD is authorized against every Task claim of the Story (or against the Story unit when the Story has no Task units) and refused naming the first Task held by someone else, a standalone BUILD against the standalone unit, and an approval that cannot resolve a unit is refused. A TeamGateRefusedError puts the target in skipped[] with the refusal reason. Format the refusal in the terminal approve case in src/cli/command.ts beside the review-block message. Signatures are unchanged and a repo with no policy behaves as before.

**Acceptance checks:**
- approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp
- A refused BUILD target creates no BUILD record, is in skipped[] with the reason, and the other targets are approved
- A Story-wide BUILD is refused when any of the Story's Tasks is held by someone else and is authorized against the Story unit when it has no Tasks
- The terminal approve command prints the refusal naming the holder
- A repo with no policy approves exactly as before

### 1.6 E20261018315d510c:S005:T006 — Guard finding application and the automatic review fixes

Make resolveReviewFinding in src/workflow/review/resolve.ts ask the gate before it writes when the action is apply and throw TeamGateRefusedError for a non-holder, leaving accept, override and defer unguarded, and show the refusal in the terminal resolve command in src/cli/command.ts. Make both automatic review paths, src/daemon/steps/review-step/phases/verdicts.ts and src/workflow/review/run-artifact.ts, consult reviewFixDecision and apply no auto-fix when it says report-only, so a review never writes content for a non-holder and is never refused.

**Acceptance checks:**
- resolveReviewFinding with apply by a non-holder is refused before the markdown or the artifact is written, while accept, override and defer still run
- A review of a stage held by someone else runs, reports findings, applies no auto-fix and leaves the revision unchanged
- The terminal resolve command prints the refusal naming the holder

### 1.7 E20261018315d510c:S005:T007 — Guard the authoring routes

Call the gate with action author in the workflow-step phases (src/daemon/steps/workflow-step/phases) and in the daemon's server-side driver (runWorkflowServerSide and its runStart stream handler in src/daemon/workflow-rpc.ts) at its start and before it writes the draft, each deriving its UnitRef from the request it holds. A held-by-other outcome throws TeamGateRefusedError before any state changes; the first-author exception lets the one first draft through. Analyze and code review get no call.

**Acceptance checks:**
- workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes
- runWorkflowServerSide and the workflow.run done path are refused for a non-holder before the draft is written
- The first author turn of a stage with no issue is let through
- A repo with no policy behaves as before

### 1.8 E20261018315d510c:S005:T008 — Guard build

Call the gate with action build in the build-step implement and validate phases (src/daemon/steps/build-step/phases) before they act, deriving the Task or standalone unit from the request, and throw TeamGateRefusedError for a non-holder.

**Acceptance checks:**
- Build implement and validate on a stage held by someone else are refused naming the holder
- A repo with no policy builds as before

### 1.9 E20261018315d510c:S005:T009 — Add the team claim and release commands

Add claim and release subcommands to the terminal team command dispatcher (runTeam in src/cli/command.ts) taking the unit as an epic hash, an epic hash and story id, or an epic hash, story id and task id, call claim and release through the services layer, and print the outcome or the refusal naming the holder in the same format as the review-block message. Unknown input prints the usage line.

**Acceptance checks:**
- team claim and team release resolve the unit, call the gate functions and print the outcome
- A refusal names the holder
- Bad or missing arguments print the usage line

### 1.10 E20261018315d510c:S005:T010 — Add the guarded entry-point inventory and refusal output tests

Add a test that lists the guarded entry points (the workflow-step phases, the workflow driver, the build-step phases, approveArtifactByJsonPath, approveWorkflowTarget, the apply branch of resolveReviewFinding and both review fix sites) and checks each calls the gate or the review-fix decision, and that the analyze and code-review steps do not, and a terminal output test for the approve, resolve, claim and release refusals.

**Acceptance checks:**
- Removing a gate call from any listed entry point fails the inventory test
- Analyze and code-review steps are not on the inventory
- Terminal refusals print the holder

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/team/__tests__/gate.test.ts: teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false | `t2` |
| src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding | `t2` |
| src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively | `t2` |
| src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time | `t2` |
| src/workflow/team/__tests__/gate.test.ts: claim takes only an unassigned stage, never removes another assignee, and reports a contested claim or a failed re-read as refused | `t4` |
| src/workflow/team/__tests__/gate.test.ts: release clears the assignees for the holder and for an administrator, including a contested claim, and refuses anyone else without calling setAssignee | `t4` |
| src/workflow/team/__tests__/gate.test.ts: each port failure kind, several assignees, an unreadable policy, a missing issue and a throwing completion hook map to refused or no-issue with the reason and never throw | `t3` |
| src/workflow/team/__tests__/gate.test.ts: the first author turn of a stage with no issue and no artifact is allowed as an explicit exception and any other action on a stage with no issue is refused | `t3` |
| src/workflow/team/__tests__/gate.test.ts: the registered completion hook is consulted for author and build on a next stage and for open-signoff, revise and release, a release called by the hook does not consult it again, and with none registered the gate behaves as continue (a hook-contract test; the completion-releases-the-claim integration test belongs to s7) | `t3` |
| src/workflow/team/__tests__/review-fix-decision.test.ts: reviewFixDecision returns apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read | `t4` |
| src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts: workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, the first author turn with no issue is let through, and a repo without a policy behaves as before | `t7` |
| src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts: build implement and validate on a stage held by someone else are refused naming the holder | `t8` |
| src/workflow/__tests__/gate-approve.test.ts: approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget authorizes a BUILD target before ensureBuildRecordOnCompletion so a refused target creates no BUILD record, puts it in skipped[] with the reason and approves the others | `t5` |
| src/workflow/review/__tests__/gate-resolve-finding.test.ts: resolveReviewFinding with action apply by a non-holder throws TeamGateRefusedError before writing the markdown or the artifact, while accept, override and defer still run | `t6` |
| src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts: a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged | `t6` |
| src/workflow/__tests__/gate-guarded-entry-points.test.ts: the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it | `t10` |
| src/cli/__tests__/gate-refusal-output.test.ts: the terminal approve and resolve commands print the refusal naming the holder, formatted beside the review-block message | `t10`, `t5`, `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails (TeamGate, claim, release, ReviewFixDecision, RegisterCompletionHook, the approve and resolve entry points)`
- **[[c2]]** `prior-artifact` `LLD s5 errorPaths (refusals, contested claim, first-author exception, hook failures, approval before BUILD record)`
- **[[c3]]** `prior-artifact` `LLD s5 testStrategy (unit and integration subjects and the ac19 to ac24 mapping)`
- **[[c4]]** `doc` `docs/plans/team-workflow.md#s5-lld-approval-2026-10-18`
