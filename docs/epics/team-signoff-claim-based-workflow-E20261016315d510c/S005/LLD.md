<!-- insrc:artifact LLD-315d510cb28100e2-s5 -->

# LLD: E20261018315d510c:S005

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `3746c66db3c6...`

Before a developer changes a stage (authors a step, builds, approves locally, applies a review finding, or opens a signoff request), the daemon asks one gate who holds the stage's tracker issue. The holder is the issue's assignee, read live. Only a stage nobody holds can be claimed, a claim never removes another assignee, and a stage someone else holds is refused naming them. Holders and administrators release a stage; nobody can take it over, and analyze and review are never blocked. GitHub cannot assign atomically, so two simultaneous claims are detected and reported, not prevented.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-315d510cb28100e2** § 2. Framework summary

**Rollout phase:** Phase C — claims and handoff
**Owns:** `sc4` (Team gate, claim state, gate outcome, refusal error and completion hook)
**Consumes:** `sc1` (TrackerPort and PortResult), `sc2` (TeamPolicy), `sc3` (Per-unit tracker record and revision)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-s1 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TeamGate`

```typescript
(repo: string, unit: UnitRef, action: GuardedAction) => GateOutcome
```

**Parameters:**
- `repo: string` — Absolute repo path; the policy and the tracker target are read for it
- `unit: UnitRef` — The stage unit (Epic, Story or Task) the action changes
- `action: GuardedAction` — What the actor wants to do

**Returns:** `GateOutcome` — allowed (implicitClaim true when the gate just assigned the actor), held-by-other naming the holder, awaiting-signoff from the registered completion hook, no-issue (with allowFirstAuthor true only for the first author turn of a stage), or refused with a reason

**Errors:**
- `never throws` when Every failure (policy unreadable, tracker missing or signed out, several assignees, a timeout, a throwing hook) is returned as refused with the reason

**Preconditions:**
- action is a guarded action; analyze and code review have no GuardedAction value and never reach the gate

**Postconditions:**
- A repo with no policy, teamMode false or claimsEnforced false returns allowed with no tracker call
- A non-allowed outcome is logged with unit, action and reason
- After the tracker is loaded (loadTracker verifies the signed-in user once and the gate reuses it) the gate makes one live assignee read, plus the reads and writes of an implicit claim
- Local issue resolution may reconcile the unit record on disk before a later tracker failure; it never writes content or approval state
- For author and build the registered completion hook is consulted first, so a stage whose previous stage awaits signoff is refused

### 2.2 `claim`

```typescript
(repo: string, unit: UnitRef) => GateOutcome
```

**Parameters:**
- `repo: string` — Absolute repo path
- `unit: UnitRef` — The unit to claim

**Returns:** `GateOutcome` — allowed when the actor now holds an unassigned unit (or already did); held-by-other when someone else does; refused when the claim is contested or a port step failed

**Errors:**
- `never throws` when Failures return refused

**Preconditions:**
- Team mode with claims enforced

**Postconditions:**
- Only an unassigned unit is claimed
- The claim adds the actor and never removes another assignee, then re-reads; more than one assignee afterwards is reported as contested
- The tracker race between the read and the add is a documented limit (docs/plans/team-workflow.md, s5 claim atomicity)

### 2.3 `release`

```typescript
(repo: string, unit: UnitRef) => GateOutcome
```

**Parameters:**
- `repo: string` — Absolute repo path
- `unit: UnitRef` — The unit to release

**Returns:** `GateOutcome` — allowed when the assignees are cleared; refused for anyone but the holder or a policy administrator

**Errors:**
- `never throws` when Failures return refused

**Preconditions:**
- Team mode with claims enforced

**Postconditions:**
- The assignee is cleared and others can claim
- An administrator may release whoever the holder is, including a contested claim with several assignees
- A release started by the completion hook does not consult the hook again

### 2.4 `ReviewFixDecision`

```typescript
(repo: string, unit: UnitRef) => ReviewFixMode
```

**Parameters:**
- `repo: string` — Absolute repo path
- `unit: UnitRef` — The unit whose artifact is being reviewed

**Returns:** `ReviewFixMode` — apply-auto-fixes for the holder or when no gate applies; report-only for a non-holder or a failed read

**Errors:**
- `never throws` when A failed read yields report-only in team mode

**Preconditions:**
- Consulted by both automatic review paths (verdicts.ts and run-artifact.ts) before they apply fixes

**Postconditions:**
- A review is never refused; only its fix mode changes

### 2.5 `RegisterCompletionHook`

```typescript
(hook: CompletionHook) => void
```

**Parameters:**
- `hook: CompletionHook` — Called by the gate for author and build on a next stage and for open-signoff, revise and release; s7 registers it

**Returns:** `void` — The hook is stored; this Story registers none

**Postconditions:**
- With no hook registered the gate behaves as if the hook returned continue
- The hook's own release goes through the non-recursive internal path

### 2.6 `approveArtifactByJsonPath`

```typescript
(jsonPath: string, opts?: { readonly overrideReview?: string }) => ApprovalResult
```

**Parameters:**
- `jsonPath: string` — The artifact to approve
- `opts: { readonly overrideReview?: string }` _(optional)_ — Existing review override

**Returns:** `ApprovalResult` — Unchanged

**Errors:**
- `TeamGateRefusedError` when In team mode the gate does not allow approve-local; thrown before any review check or stamp
- `ReviewBlockedError` when Unchanged

**Postconditions:**
- Signature unchanged; a repo with no policy behaves exactly as before

### 2.7 `approveWorkflowTarget`

```typescript
(req: WorkflowApproveRequest, opts?: { readonly enforce?: boolean }) => Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Unchanged
- `opts: { readonly enforce?: boolean }` _(optional)_ — Unchanged

**Returns:** `Promise<WorkflowApproveResult>` — Unchanged; a TeamGateRefusedError puts the artifact in skipped[] with the refusal reason, as ReviewBlockedError does

**Postconditions:**
- Each target is authorized before ensureBuildRecordOnCompletion creates or merges its BUILD record, so a refused target is not changed
- Other targets of a batch are still approved

### 2.8 `resolveReviewFinding`

```typescript
(artifactPath: string, jsonPath: string, findingId: string, action: ReviewAction, note?: string) => ResolveReviewResult
```

**Parameters:**
- `artifactPath: string` — The artifact markdown path
- `jsonPath: string` — The artifact JSON path
- `findingId: string` — The finding to resolve
- `action: ReviewAction` — apply, accept, override or defer
- `note: string` _(optional)_ — Optional reason

**Returns:** `ResolveReviewResult` — Unchanged

**Errors:**
- `TeamGateRefusedError` when Action apply changes content, so a non-holder is refused before anything is written; accept, override and defer are meta-only and are not guarded

**Postconditions:**
- Signature unchanged; the terminal resolve command shows the refusal

## 3. Data model changes

### 3.1 `GateOutcome` — new

Tagged union returned by the gate: allowed {implicitClaim}, held-by-other {holder, offerPark}, awaiting-signoff {request}, no-issue {allowFirstAuthor, creationFailure?}, refused {reason}. Never persisted.

**Call sites:**
- `src/workflow/gates.ts:587`
- `src/workflow/gates.ts:829`
- `src/workflow/review/resolve.ts:83`
- `src/daemon/steps/workflow-step/phases/start.ts`
- `src/daemon/steps/build-step/phases/implement.ts`

### 3.2 `ClaimState` — new

{ unit, holder: string | null, readAt }: the assignee read live for one call. In memory only; the tracker is the source of truth, so nothing about the claim is stored in artifacts.

**Call sites:**
- `src/workflow/tracker/github-adapter.ts:88`

### 3.3 `TeamGateRefusedError` — new

Error subclass carrying the non-allowed outcome and its reason; thrown by approveArtifactByJsonPath, resolveReviewFinding (apply) and the daemon step entry points, handled beside ReviewBlockedError.

**Call sites:**
- `src/workflow/gates.ts:89`
- `src/workflow/gates.ts:871`
- `src/cli/command.ts:234`
- `src/cli/command.ts:209`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Owns GuardedAction, GateOutcome, ClaimState, TeamGate, TeamGateRefusedError, ReviewFixDecision, CompletionHook and RegisterCompletionHook as sketched; the hook is declared and left unregistered for s7, and is consulted for author and build on a next stage as well as for open-signoff, revise and release. |
| `sc1` | consumes | Uses loadTracker with the claim capability, whoAmI, readAssignee and setAssignee (release only). A claim needs the add-only addAssignee, proposed to s1 as amendment AMD-315d510cb28100e2-12 and pending; until it is agreed the build uses a fake port that implements it. |
| `sc2` | consumes | Reads teamMode, claimsEnforced and administrators through policyReader; a team repo whose policy cannot be read refuses a guarded action, a repo that never had a policy reads as none. |
| `sc3` | consumes | Finds the unit's issue with resolveUnitIssueLocal (which may reconcile the unit record) and creates a missing one with ensureUnitIssue for the no-issue outcome. |

## 5. Error paths

**Error cases**

- **The tracker cannot be reached, gh is missing, or the user is signed out when a guarded action is attempted in a team repo.** (recoverable)
  - Detection: loadTracker, readAssignee or addAssignee returns a PortResult failure with kind missing-tool, missing-signin or unreachable.
  - Response: The gate returns refused with the port's reason and kind; the action does not run and nothing is written except possible metadata reconciliation done by local issue resolution before the tracker load.
  - User impact: The author is told the stage cannot be changed until the tracker is reachable, with the reason; analyze and review still work.
- **The stage unit's issue has two or more assignees (a contested claim, or an issue assigned by hand).** (recoverable)
  - Detection: readAssignee returns a rejected failure whose reason names the assignees (the GitHub adapter refuses a multi-assignee issue).
  - Response: The gate returns refused with that reason and never guesses a holder; an administrator's release clears every assignee, after which one developer claims again.
  - User impact: The author sees who is assigned and is told to ask an administrator to release.
- **Another developer holds the stage.** (recoverable)
  - Detection: readAssignee returns a login that differs from the signed-in login (compared case-insensitively).
  - Response: The gate returns held-by-other naming the holder; the entry point throws TeamGateRefusedError (daemon steps, approveArtifactByJsonPath, resolveReviewFinding apply) or maps it into skipped[] (approveWorkflowTarget). No time or inactivity is consulted, so a long-idle holder is still the holder.
  - User impact: The action is refused naming the holder; analyze and review still run (review in report-only mode).
- **A non-holder who is not an administrator tries to release a stage.** (recoverable)
  - Detection: release compares the signed-in login with the live assignee and with policy.administrators.
  - Response: release returns refused and does not call setAssignee.
  - User impact: The actor is told only the holder or an administrator may release.
- **Two developers claim the same unassigned stage at the same moment.** (recoverable)
  - Detection: Both read no assignee, both call addAssignee; the claim's re-read after the add shows more than one assignee, or the other's login.
  - Response: The claim returns refused as contested and removes nobody; the stage then reads as several assignees until an administrator releases it. GitHub offers no atomic assign-if-unassigned, so this is detected after the fact and documented as a known limit (docs/plans/team-workflow.md, s5 claim atomicity).
  - User impact: Both claimants are told the claim is contested and that an administrator must release; no work is lost.
- **addAssignee or setAssignee fails or times out partway.** (recoverable)
  - Detection: The port returns a PortResult failure (its own re-read does not match).
  - Response: claim and release return refused with the reason and say the resulting state is unknown; no retry runs inside the call.
  - User impact: The actor is told to read the claim again before acting.
- **The stage unit has no issue and one cannot be found or created.** (recoverable)
  - Detection: resolveUnitIssueLocal returns null and ensureUnitIssue returns a failure (for a Story, because its LLD does not exist yet).
  - Response: The gate returns no-issue with creationFailure. allowFirstAuthor is true only for the first author turn of a stage that has no artifact yet, and the entry point lets that one draft be written instead of throwing; every other action is refused. After the draft is written the draft hook creates the issue, and the implicit claim is taken by the gate on the next guarded turn.
  - User impact: The author can write the first draft; the stage cannot be claimed or changed further until its issue exists.
- **The team policy cannot be read for a repo that is known to carry one.** (recoverable)
  - Detection: policyReader returns ok:false (it reports a known team repo as unreadable, never as none).
  - Response: A guarded action is refused with the reason; a repo that never had a policy reads as none and is unaffected.
  - User impact: The author is told the policy cannot be read and how to refresh it.
- **The review-fix decision cannot read the claim.** (recoverable)
  - Detection: readAssignee or the tracker load fails inside ReviewFixDecision.
  - Response: It returns report-only: the review runs and lists findings but applies no auto-fix.
  - User impact: Findings are listed; the holder applies fixes.
- **A registered completion hook throws, or calls release.** (recoverable)
  - Detection: The gate wraps the hook call in try/catch, and the hook's release goes through an internal path that does not consult the hook.
  - Response: A throw returns refused with the hook's message and the action does not run; a release from the hook cannot recurse.
  - User impact: The author sees the hook's error; the stage is not changed.
- **An approval target is refused but its BUILD record does not exist yet.** (recoverable)
  - Detection: approveWorkflowTarget authorizes each target before it calls ensureBuildRecordOnCompletion.
  - Response: The target goes to skipped[] with the refusal reason and no BUILD record is created or merged for it.
  - User impact: A refused approval leaves the repo unchanged.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no policy file, teamMode false, or claimsEnforced false. | allowed with implicitClaim false and no tracker call; behaviour is exactly as before this Story. |
| The actor already holds the stage and acts again. | allowed with implicitClaim false; no addAssignee call. |
| Nobody holds the stage and the actor authors or builds. | allowed with implicitClaim true; the gate adds the actor through addAssignee before returning, and a failed or contested add refuses the action. |
| Nobody holds the stage and the actor approves locally or applies a review finding. | allowed with implicitClaim false and no assignment: approving or applying does not take a claim. |
| A developer was assigned directly in the tracker and acts without claiming. | They are the holder because the assignee is read live; allowed with implicitClaim false. |
| Analyze or code review on a stage someone else holds. | Never reaches the gate; works as before. |
| Automatic review or the accept, override and defer resolutions of a finding on a stage someone else holds. | They run: the automatic review is report-only through ReviewFixDecision, and accept, override and defer are meta-only and unguarded. |
| Author or build on the next stage while the previous stage's signoff is open or not yet complete. | The gate consults the registered completion hook, which may return awaiting-signoff; with no hook registered the gate continues. |
| A login differs only in case from the signed-in login. | They are the same person. |
| approveWorkflowTarget is given a batch where one artifact is held by someone else. | That artifact is in skipped[] with the refusal reason and no BUILD record is created for it; the others are approved. |

## 6. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), co-located in __tests__ folders, using in-memory fake ports and injected policy and tracker loaders`

**Test levels**

- **unit** — Prove the gate's decisions, claim and release, the review-fix decision and the completion-hook contract against a fake tracker port and a fake policy, with no network.
  - Subjects: `src/workflow/team/__tests__/gate.test.ts: teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false`, `src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding`, `src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively`, `src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time`, `src/workflow/team/__tests__/gate.test.ts: claim takes only an unassigned stage, never removes another assignee, and reports a contested claim or a failed re-read as refused`, `src/workflow/team/__tests__/gate.test.ts: release clears the assignees for the holder and for an administrator, including a contested claim, and refuses anyone else without calling setAssignee`, `src/workflow/team/__tests__/gate.test.ts: each port failure kind, several assignees, an unreadable policy, a missing issue and a throwing completion hook map to refused or no-issue with the reason and never throw`, `src/workflow/team/__tests__/gate.test.ts: the first author turn of a stage with no issue and no artifact is allowed as an explicit exception and any other action on a stage with no issue is refused`, `src/workflow/team/__tests__/gate.test.ts: the registered completion hook is consulted for author and build on a next stage and for open-signoff, revise and release, a release called by the hook does not consult it again, and with none registered the gate behaves as continue (a hook-contract test; the completion-releases-the-claim integration test belongs to s7)`, `src/workflow/team/__tests__/review-fix-decision.test.ts: reviewFixDecision returns apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read`
  - Fixtures: `a fake TrackerPort with whoAmI, readAssignee, addAssignee and setAssignee that records calls and can fail each`, `an injected PolicyReader returning none, a team policy with administrators, and ok:false`, `a temp repo with a Define, an LLD and a plan carrying unit records`
- **integration** — Prove every guarded entry point asks the gate and refuses before acting, approval and finding application map the refusal like a review block without changing the repo, and analyze and code review stay unguarded.
  - Subjects: `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts: workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, the first author turn with no issue is let through, and a repo without a policy behaves as before`, `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts: build implement and validate on a stage held by someone else are refused naming the holder`, `src/workflow/__tests__/gate-approve.test.ts: approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget authorizes a BUILD target before ensureBuildRecordOnCompletion so a refused target creates no BUILD record, puts it in skipped[] with the reason and approves the others`, `src/workflow/review/__tests__/gate-resolve-finding.test.ts: resolveReviewFinding with action apply by a non-holder throws TeamGateRefusedError before writing the markdown or the artifact, while accept, override and defer still run`, `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts: a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged`, `src/workflow/__tests__/gate-guarded-entry-points.test.ts: the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it`, `src/cli/__tests__/gate-refusal-output.test.ts: the terminal approve and resolve commands print the refusal naming the holder, formatted beside the review-block message`
  - Fixtures: `the same fake tracker port and policy injected through module-level test seams`, `a temp repo with draft artifacts for each stage`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac19` | `src/workflow/team/__tests__/gate.test.ts: claim takes only an unassigned stage, never removes another assignee, and reports a contested claim or a failed re-read as refused`, `src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding` |
| `ac20` | `src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time`, `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts: workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, the first author turn with no issue is let through, and a repo without a policy behaves as before`, `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts: build implement and validate on a stage held by someone else are refused naming the holder`, `src/workflow/__tests__/gate-approve.test.ts: approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget authorizes a BUILD target before ensureBuildRecordOnCompletion so a refused target creates no BUILD record, puts it in skipped[] with the reason and approves the others`, `src/workflow/review/__tests__/gate-resolve-finding.test.ts: resolveReviewFinding with action apply by a non-holder throws TeamGateRefusedError before writing the markdown or the artifact, while accept, override and defer still run`, `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts: a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged` |
| `ac21` | `src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively` |
| `ac22` | `src/workflow/team/__tests__/gate.test.ts: release clears the assignees for the holder and for an administrator, including a contested claim, and refuses anyone else without calling setAssignee` |
| `ac23` | `src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time`, `src/workflow/team/__tests__/gate.test.ts: claim takes only an unassigned stage, never removes another assignee, and reports a contested claim or a failed re-read as refused` |
| `ac24` | `src/workflow/team/__tests__/gate.test.ts: the registered completion hook is consulted for author and build on a next stage and for open-signoff, revise and release, a release called by the hook does not consult it again, and with none registered the gate behaves as continue (a hook-contract test; the completion-releases-the-claim integration test belongs to s7)` |

## 7. Alternatives considered

### 7.1 a1: One gate function, called explicitly at each guarded entry point, with an inventory test — **CHOSEN**

A single teamGate(repo, unit, action) in the workflow library; every entry point that changes a stage calls it first; a test lists the guarded entry points so a new one cannot forget.

Add src/workflow/team/gate.ts exporting teamGate, claim, release, reviewFixDecision, registerCompletionHook and TeamGateRefusedError. teamGate reads the policy and returns allowed with no tracker call when there is no policy, teamMode is false, claimsEnforced is false, or the action is not guarded. Otherwise it loads the tracker with the claim capability, reuses the identity that load verified, reads the assignee live, and decides: the assignee is the holder; an unassigned stage lets the actor proceed and, for author and build, takes an implicit claim through the add-only addAssignee (never removing anyone); another holder gives held-by-other; several assignees give refused (never a guessed holder). The first author turn of a stage whose issue cannot be created yet is the one explicit exception: the gate returns no-issue with allowFirstAuthor true, the entry point lets that draft be written, and the draft hook then creates the issue and the implicit claim is taken by the gate on the next guarded turn. The guarded entry points are the workflow-step phases, the build-step phases, approveArtifactByJsonPath, approveWorkflowTarget (authorized before ensureBuildRecordOnCompletion), and the content-changing review resolution (resolveReviewFinding with action apply, reached from the terminal resolve command); automatic review fixes consult reviewFixDecision. For author and build on a next stage the gate also consults the registered completion hook, and the hook's own release call goes through a non-recursive internal release that skips the hook. claim and release are commands: claim only takes an unassigned stage; release clears the assignee for the holder or a policy administrator.

### 7.2 a2: Wrap the daemon step handlers in a gate middleware

One wrapper around the workflow-step, build-step and review-step handlers derives the unit and action from the request and applies the gate before the handler runs.

A higher-order guardHandler(handler, describe) maps a request to { unit, action } or undefined for unguarded requests, and the daemon registers the handlers through it. The gate logic is the same as in a1, but approveArtifactByJsonPath, approveWorkflowTarget and the terminal resolve path are not daemon step handlers and would still need explicit calls.

**Rejected because:** Two mechanisms are needed and the unit must be derived from the opaque state token before the handler parses it.

### 7.3 a3: Enforce in the artifact writer

writeArtifact (kind content) asks the gate before it writes, so any content change by a non-holder is refused wherever it comes from.

Pass an optional action into writeArtifact and consult teamGate for kind content writes, so every path through the single writer s4 built is covered, and let the gate derive the unit from the artifact path.

**Rejected because:** Violates ac20 for approve and build and couples storage to the tracker.

## 8. References

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md`
- **[[c3]]** `code` `src/workflow/gates.ts:587`
- **[[c4]]** `code` `src/workflow/gates.ts:829`
- **[[c5]]** `code` `src/workflow/review/resolve.ts:83`
- **[[c6]]** `code` `src/workflow/tracker/github-adapter.ts:88`
- **[[c7]]** `code` `src/workflow/tracker/unit-issue.ts`
- **[[c8]]** `doc` `docs/plans/team-workflow.md`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**4 do not hold · 1 could not be verified · 7 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-18T13:53:13.343Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | HIGH | The design delivers the explicit claim and release commands owned by s5. | HLD §5.5 explicitly assigns 'claim and release commands' to s5. The LLD defines library functions but no command syntax, dispatch, service or IPC integration. The existing runTeam dispatcher supports only 'init' and 'refresh', then returns usage. Implementing the listed changes leaves users without the promised explicit release operation. [files: docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md, src/cli/command.ts] | Specify the user-facing claim/release entry points, target resolution, dispatch wiring and refusal output. |
| new-versus-reuse | HIGH | The gate can reuse the identity already verified by loadTracker without another identity call. | loadTracker executes 'const who = tracker.whoAmI(); if (!who.ok) return who;' but returns only '{ ok: true, value: tracker }'. TrackerPort exposes no verified identity field, and its whoAmI implementation calls ghCurrentLogin every time. The verified login is discarded. [files: src/workflow/tracker/github-adapter.ts, src/workflow/tracker/port.ts] | Agree an sc1 change that exposes or caches the verified identity, or explicitly design and budget a second whoAmI call. |
| change-sites | HIGH | The listed guarded entry points cover every authoring route. | The terminal calls runWorkflowStreaming. daemon/index.ts routes 'workflow.run' to workflow-rpc.runStart, whose driver runs startRun/resumeRun directly and persists with 'writeArtifact(paths.json, JSON.parse(finalized.renderedJson),  27content 27)'. It does not call the workflow-step phase handlers listed by the LLD. Guarding those phases leaves this authoring route unprotected. [files: src/cli/services/workflow.ts, src/daemon/index.ts, src/daemon/workflow-rpc.ts] | Add authorization to the server-side workflow driver at the relevant turns and before persistence, and include the terminal streaming route in the inventory and refusal tests. |
| error-paths | MED | Two simultaneous claimants will both be told their claim is contested. | docs/plans/team-workflow.md explicitly says both developers can believe they hold the claim 'until the next read'. With the proposed separate read/add/reread operations, A and B can both read empty, A can add and reread only A, and B can add afterward. A has already returned allowed; only B necessarily observes contention. The LLD's promise that both callers are told is stronger than the documented mechanism. [files: docs/plans/team-workflow.md, .insrc/artifacts/AMD-315d510cb28100e2-12.json, src/workflow/tracker/github-adapter.ts] | State that contention is reported when observed and that an earlier successful claimant may discover it only on a subsequent gate read. Add this interleaving to tests. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | The design supplies enough target information to authorize BUILD approval against the correct claim unit. | The policy assigns BUILD claims to Tasks. Task implementation resolves a taskId, but approveWorkflowTarget's buildRefFor returns only epicHash and storyId for a Story-wide BUILD record. The LLD supplies no rule for selecting or aggregating Task claims at this approval site. Standalone implement/validate branches also bypass Task resolution. [files: src/workflow/team/types.ts, src/workflow/gates.ts, src/daemon/steps/build-step/phases/implement.ts, src/daemon/steps/build-step/phases/validate.ts, src/workflow/tracker/refs.ts] | Define artifact/action-to-UnitRef mapping, including Story-wide BUILD approval and standalone routes, with explicit multi-holder behavior. |
