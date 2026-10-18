<!-- insrc:artifact LLD-315d510cb28100e2-s5 -->

# LLD: E20261018315d510c:S005

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `3746c66db3c6...`

Before a developer changes a stage (authors a step, builds, approves locally or opens a signoff request), the daemon asks one gate who holds the stage's tracker issue. The holder is the issue's assignee, read live; if nobody holds it the actor proceeds and becomes the holder, if someone else holds it the action is refused naming them. Holders and administrators release a stage; nobody can take it over, and analyze and review are never blocked.

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
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-S001 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
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

**Returns:** `GateOutcome` — allowed (with implicitClaim true when the actor became the holder), held-by-other (naming the holder), awaiting-signoff (from the registered completion hook), no-issue, or refused with a reason

**Errors:**
- `never throws` when Every failure (policy unreadable, tracker missing or signed out, a multi-assignee issue, a timeout) is returned as a refused outcome with the reason

**Preconditions:**
- action is one of the guarded actions; analyze and code-review have no GuardedAction value and never reach the gate

**Postconditions:**
- A repo with no policy, teamMode false, or claimsEnforced false returns allowed with no tracker call
- A non-allowed outcome is logged with unit, action and reason
- At most two live port reads (whoAmI, readAssignee) per call

### 2.2 `claim`

```typescript
(repo: string, unit: UnitRef) => GateOutcome
```

**Parameters:**
- `repo: string` — Absolute repo path
- `unit: UnitRef` — The unit to claim

**Returns:** `GateOutcome` — allowed when the actor now holds the unit (including when they already did); held-by-other when someone else does; refused on a port failure

**Errors:**
- `never throws` when Failures return refused

**Preconditions:**
- Team mode with claims enforced

**Postconditions:**
- On allowed the unit's issue assignee is the actor, verified by the port's re-read
- Never replaces another holder

### 2.3 `release`

```typescript
(repo: string, unit: UnitRef) => GateOutcome
```

**Parameters:**
- `repo: string` — Absolute repo path
- `unit: UnitRef` — The unit to release

**Returns:** `GateOutcome` — allowed when the assignee is cleared; refused for anyone but the holder or a policy administrator

**Errors:**
- `never throws` when Failures return refused

**Preconditions:**
- Team mode with claims enforced

**Postconditions:**
- On allowed the assignee is cleared and others can claim
- Release by an administrator is allowed whoever the holder is

### 2.4 `ReviewFixDecision`

```typescript
(repo: string, unit: UnitRef) => ReviewFixMode
```

**Parameters:**
- `repo: string` — Absolute repo path
- `unit: UnitRef` — The unit whose artifact is being reviewed

**Returns:** `ReviewFixMode` — apply-auto-fixes for the holder, or when no gate applies; report-only for a non-holder, so a review never writes content for someone who does not hold the stage

**Errors:**
- `never throws` when A failed read yields report-only in team mode

**Preconditions:**
- Called by both review paths before they apply fixes (verdicts.ts and run-artifact.ts)

**Postconditions:**
- A review is never refused; only its fix mode changes

### 2.5 `RegisterCompletionHook`

```typescript
(hook: CompletionHook) => void
```

**Parameters:**
- `hook: CompletionHook` — Called by the gate for open-signoff, revise and release on a unit; s7 registers it

**Returns:** `void` — The hook is stored; none is registered by this Story

**Postconditions:**
- With no hook registered the gate behaves as if the hook returned continue

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
- The signature is unchanged; a repo with no policy behaves exactly as before

### 2.7 `approveWorkflowTarget`

```typescript
(req: WorkflowApproveRequest, opts?: { readonly enforce?: boolean }) => Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Unchanged
- `opts: { readonly enforce?: boolean }` _(optional)_ — Unchanged

**Returns:** `Promise<WorkflowApproveResult>` — Unchanged; a TeamGateRefusedError puts the artifact in skipped[] with the refusal reason, as ReviewBlockedError does

**Postconditions:**
- Other artifacts of a batch are still approved

## 3. Data model changes

### 3.1 `GateOutcome` — new

Tagged union returned by the gate: allowed {implicitClaim}, held-by-other {holder, offerPark}, awaiting-signoff {request}, no-issue {allowFirstAuthor, creationFailure?}, refused {reason}. Never persisted.

**Call sites:**
- `src/workflow/gates.ts:587`
- `src/daemon/steps/workflow-step/phases/start.ts`
- `src/daemon/steps/build-step/phases/implement.ts`

### 3.2 `ClaimState` — new

{ unit, holder: string | null, readAt }: the assignee read live for one call. Held in memory for the call only; the tracker is the source of truth, so no claim data is stored in artifacts.

**Call sites:**
- `src/workflow/tracker/github-adapter.ts:88`

### 3.3 `TeamGateRefusedError` — new

Error subclass carrying the non-allowed outcome and its reason; thrown by approveArtifactByJsonPath and by daemon step entry points, handled beside ReviewBlockedError.

**Call sites:**
- `src/workflow/gates.ts:89`
- `src/workflow/gates.ts:871`
- `src/cli/command.ts:234`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Owns GuardedAction, GateOutcome, ClaimState, TeamGate, TeamGateRefusedError, ReviewFixDecision, CompletionHook and RegisterCompletionHook exactly as sketched; the completion hook is declared and left unregistered for s7. |
| `sc1` | consumes | Uses loadTracker with the claim capability, whoAmI, readAssignee and setAssignee only; a port failure kind becomes the refusal reason. |
| `sc2` | consumes | Reads teamMode, claimsEnforced and administrators through policyReader; an unreadable policy refuses a guarded action in team repos only when a team policy was already seen, otherwise follows policyReader's own answer. |
| `sc3` | consumes | Finds the unit's issue with resolveUnitIssueLocal and creates a missing one with ensureUnitIssue for the no-issue outcome. |

## 5. Error paths

**Error cases**

- **The tracker cannot be reached, gh is missing, or the user is signed out when a guarded action is attempted in a team repo.** (recoverable)
  - Detection: loadTracker, whoAmI or readAssignee returns a PortResult failure with kind missing-tool, missing-signin or unreachable.
  - Response: The gate returns refused with the port's reason and kind; the action does not run. Nothing is written.
  - User impact: The author is told the stage cannot be changed until the tracker is reachable, with the reason; analyze and review still work.
- **The stage unit's issue has two or more assignees.** (recoverable)
  - Detection: readAssignee returns a rejected failure whose reason names the assignees (the GitHub adapter refuses a multi-assignee issue).
  - Response: The gate returns refused with that reason and never guesses a holder; release by an administrator (which clears every assignee through setAssignee) is the way out.
  - User impact: The author sees who is assigned and is told to ask an administrator to release.
- **Another developer holds the stage.** (recoverable)
  - Detection: readAssignee returns a login that differs from whoAmI (compared case-insensitively).
  - Response: The gate returns held-by-other naming the holder; the entry point throws TeamGateRefusedError (daemon steps, approveArtifactByJsonPath) or maps it into skipped[] (approveWorkflowTarget). No time or inactivity is consulted, so a long-idle holder is still the holder.
  - User impact: The action is refused naming the holder; analyze and review of the stage still run (review in report-only mode).
- **A non-holder who is not an administrator tries to release a stage.** (recoverable)
  - Detection: release compares the actor with the live assignee and with policy.administrators.
  - Response: release returns refused or held-by-other and does not call setAssignee.
  - User impact: The actor is told only the holder or an administrator may release.
- **claim finds the stage already held by someone else, or two developers claim at the same instant.** (recoverable)
  - Detection: claim reads the assignee first and treats a non-empty other login as held-by-other; after setAssignee the port re-reads and compares, so a lost race shows as a rejected failure.
  - Response: claim returns held-by-other, or refused with the port's mismatch reason; it never removes another holder.
  - User impact: The second claimant is told who holds the stage.
- **setAssignee fails or times out after changing nothing or part of the assignees.** (recoverable)
  - Detection: setAssignee returns a PortResult failure (its own re-read does not match).
  - Response: claim and release return refused with the reason and say the resulting state is unknown; no retry is made inside the call.
  - User impact: The actor is told to re-read the claim before acting.
- **The stage unit has no issue recorded and none can be found or created.** (recoverable)
  - Detection: resolveUnitIssueLocal returns null and ensureUnitIssue returns a failure.
  - Response: The gate returns no-issue with creationFailure and allowFirstAuthor true only for the first author turn of a stage that has no artifact yet; any other action is refused.
  - User impact: The author is told the stage cannot be claimed yet and why; the first draft can still be written and the issue is made right after (s4).
- **The team policy cannot be read for a repo that is known to carry one.** (recoverable)
  - Detection: policyReader returns ok:false (it reports a known team repo as unreadable, never as none).
  - Response: A guarded action is refused with the reason; a repo that has never had a policy reads as none and is not affected.
  - User impact: The author is told the policy cannot be read and how to refresh it.
- **The review-fix decision cannot read the claim.** (recoverable)
  - Detection: readAssignee or whoAmI fails inside ReviewFixDecision.
  - Response: It returns report-only: the review still runs and reports its findings but applies no auto-fix.
  - User impact: Findings are listed; the holder applies fixes.
- **A registered completion hook throws.** (recoverable)
  - Detection: The gate wraps the hook call in a try/catch.
  - Response: The gate returns refused with the hook's message; the action does not run.
  - User impact: The author sees the hook's error; the stage is not changed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no policy file, teamMode false, or claimsEnforced false. | allowed with implicitClaim false and no tracker call; behaviour is exactly as before this Story. |
| The actor already holds the stage and acts again. | allowed with implicitClaim false; no setAssignee call. |
| Nobody holds the stage and the actor authors or builds. | allowed with implicitClaim true; the gate assigns the actor with setAssignee before returning, and a failure of that assignment refuses the action. |
| Nobody holds the stage and the actor approves locally. | allowed with implicitClaim false and no assignment: approve does not take a claim. |
| A developer was assigned directly in the tracker and acts without claiming. | They are the holder because the assignee is read live; allowed with implicitClaim false. |
| Analyze or code review on a stage someone else holds. | Never reaches the gate; works as before. |
| Review of a stage someone else holds. | The review runs; ReviewFixDecision returns report-only, so it applies no auto-fix and writes only meta. |
| A signoff completion is checked (s7) and the request is complete. | The registered completion hook releases the claim through release; with no hook registered this Story does nothing. |
| A login differs only in case from the actor's. | They are the same person. |
| approveWorkflowTarget is given a batch where one artifact is held by someone else. | That artifact is in skipped[] with the refusal reason; the others are approved. |

## 6. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), co-located in __tests__ folders, using in-memory fake ports and injected policy and tracker loaders`

**Test levels**

- **unit** — Prove the gate's decisions, claim and release, and the review-fix decision against a fake tracker port and a fake policy, with no network.
  - Subjects: `src/workflow/team/__tests__/gate.test.ts: teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false`, `src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and assigns the actor (implicitClaim true), and does not assign for approve-local`, `src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively`, `src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local and open-signoff, whatever the holder's idle time`, `src/workflow/team/__tests__/gate.test.ts: claim assigns the actor when nobody holds the stage, never replaces another holder, and reports a failed re-read as refused`, `src/workflow/team/__tests__/gate.test.ts: release clears the assignee for the holder and for an administrator and refuses anyone else without calling setAssignee`, `src/workflow/team/__tests__/gate.test.ts: each port failure kind, a multi-assignee issue, an unreadable policy, a missing issue and a throwing completion hook map to refused or no-issue with the reason and never throw`, `src/workflow/team/__tests__/gate.test.ts: the registered completion hook is consulted for open-signoff, revise and release, and with none registered the gate behaves as continue`, `src/workflow/team/__tests__/review-fix-decision.test.ts: reviewFixDecision returns apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read`
  - Fixtures: `a fake TrackerPort with whoAmI, readAssignee and setAssignee that records calls and can fail each`, `an injected PolicyReader returning none, a team policy with administrators, and ok:false`, `a temp repo with a Define, an LLD and a plan carrying unit records`
- **integration** — Prove the call sites: each guarded entry point asks the gate and refuses before acting, approval maps the refusal like a review block, and analyze and code review are unguarded.
  - Subjects: `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts: workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, while a repo without a policy behaves as before`, `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts: build implement and validate on a stage held by someone else are refused naming the holder`, `src/workflow/__tests__/gate-approve.test.ts: approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget puts that artifact in skipped[] with the reason while approving the others`, `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts: a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged`, `src/workflow/__tests__/gate-guarded-entry-points.test.ts: the list of guarded entry points matches the daemon steps and analyze and code-review steps are not on it`, `src/cli/__tests__/approve-gate-refusal.test.ts: the terminal approve case prints the refusal naming the holder, formatted beside the review-block message`
  - Fixtures: `the same fake tracker port and policy injected through module-level test seams`, `a temp repo with draft artifacts for each stage`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac19` | `src/workflow/team/__tests__/gate.test.ts: claim assigns the actor when nobody holds the stage, never replaces another holder, and reports a failed re-read as refused`, `src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and assigns the actor (implicitClaim true), and does not assign for approve-local` |
| `ac20` | `src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local and open-signoff, whatever the holder's idle time`, `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts: workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, while a repo without a policy behaves as before`, `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts: build implement and validate on a stage held by someone else are refused naming the holder`, `src/workflow/__tests__/gate-approve.test.ts: approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget puts that artifact in skipped[] with the reason while approving the others`, `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts: a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged` |
| `ac21` | `src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively` |
| `ac22` | `src/workflow/team/__tests__/gate.test.ts: release clears the assignee for the holder and for an administrator and refuses anyone else without calling setAssignee` |
| `ac23` | `src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local and open-signoff, whatever the holder's idle time`, `src/workflow/team/__tests__/gate.test.ts: claim assigns the actor when nobody holds the stage, never replaces another holder, and reports a failed re-read as refused` |
| `ac24` | `src/workflow/team/__tests__/gate.test.ts: the registered completion hook is consulted for open-signoff, revise and release, and with none registered the gate behaves as continue` |

## 7. Alternatives considered

### 7.1 a1: One gate function, called explicitly at each guarded entry point — **CHOSEN**

A single teamGate(repo, unit, action) in the workflow library; each guarded daemon step and approveArtifactByJsonPath calls it first and turns a non-allowed outcome into a typed TeamGateRefusedError.

Add src/workflow/team/gate.ts exporting teamGate, claim, release, reviewFixDecision, registerCompletionHook and TeamGateRefusedError. teamGate reads the policy (policyReader) and returns 'allowed' with no tracker call for a repo with no policy, teamMode false, claimsEnforced false, or an action outside the guarded list. Otherwise it resolves the unit's issue locally (resolveUnitIssueLocal), loads the tracker (loadTracker with the 'claim' capability), reads whoAmI and readAssignee live, and decides: the assignee is the holder; no assignee lets the actor proceed with an implicit claim for author and build; another holder is held-by-other; a missing issue yields no-issue after trying ensureUnitIssue. Each entry point (workflow-step start/plan/step/synthesize, build-step implement/validate, review-step for the fix decision, approveArtifactByJsonPath) derives its UnitRef from the request it already holds and calls teamGate once per turn. claim and release are two new commands that call setAssignee after a gate check; release by an administrator is allowed, release by the holder is allowed, anyone else is refused.

### 7.2 a2: Wrap the daemon step handlers in a gate middleware

One wrapper around handleWorkflowStep, handleBuildStep and the review handlers derives the unit and action from the request and applies the gate before the handler runs.

Add a higher-order function guardHandler(handler, describe) where describe maps a request to { unit, action } or undefined for unguarded requests, and register the three handlers through it. The gate logic is the same as in a1, but the call sites are the handler registrations, not the phases. approveArtifactByJsonPath, which is not a daemon step, would still need its own explicit call.

**Rejected because:** Unit derivation from the opaque state token before the handler runs duplicates parsing, and approve-local still needs an explicit call, so there would be two mechanisms.

### 7.3 a3: Enforce in the artifact writer

writeArtifact (kind content) asks the gate before it writes, so any content change by a non-holder is refused wherever it comes from.

Pass an optional action into writeArtifact and consult teamGate for kind 'content' writes. Every path that changes a stage artifact is covered because they all pass through the single writer s4 built. The gate would also need to know the actor and the unit from the artifact path.

**Rejected because:** Violates ac20 for approve and build, and couples storage to the tracker.

## 8. References

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md`
- **[[c3]]** `code` `src/workflow/gates.ts:587`
- **[[c4]]** `code` `src/workflow/gates.ts:829`
- **[[c5]]** `code` `src/workflow/tracker/github-adapter.ts:88`
- **[[c6]]** `code` `src/workflow/tracker/unit-issue.ts`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**8 do not hold · 0 could not be verified · 5 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-18T13:13:17.198Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | HIGH | The first author turn can proceed when its issue cannot yet be created. | HLD §3 explicitly allows the first author step without an issue. ensureUnitIssueDetailed returns failure when a Story LLD does not exist: 'draft it before its issue'. The LLD returns no-issue with allowFirstAuthor:true but also instructs every entry point to throw for any non-allowed outcome. Implementing that rule blocks the draft required to create the issue. [files: docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md, src/workflow/tracker/unit-issue.ts] | Specify an explicit first-author exception in entry-point outcome handling and how successful draft creation subsequently triggers the implicit claim. |
| change-sites | HIGH | The listed gate sites cover changes to held artifacts. | The terminal's 'resolve' command calls resolveFinding. resolveReviewFinding's apply branch executes 'writeAtomic(mdPath, one.markdown)', assigns 'artifact.body = one.body', and persists a content write. This path is absent from the LLD's guarded inventory and bypasses both proposed review-fix sites. [files: src/cli/command.ts, src/workflow/review/resolve.ts] | Inventory and guard explicit finding application and other content-changing resolution paths, not only automatic review fixes. |
| change-sites | HIGH | Guarding only approveArtifactByJsonPath prevents approval requests from changing state before refusal. | approveWorkflowTarget invokes 'await ensureBuildRecordOnCompletion(req.repoPath, ref)' before approveOne for BUILD targets, including batch targets. Its comment explicitly says 'CREATE-or-MERGE' before approval. The proposed gate inside approveArtifactByJsonPath runs after that mutation. [files: src/workflow/gates.ts] | Authorize the target before BUILD completion-record creation or merging, while retaining the guard inside the direct approval function. |
| boundaries | HIGH | Restricting the completion hook to open-signoff, revise, and release preserves the HLD's signoff integration contract. | HLD §3 says 'when a stage is attempted the hook reads the signoff request state' and produces awaiting-signoff. DEF ac31 requires refusal when anyone starts the next stage. The LLD's hook invocation list excludes author and build, so s7 cannot enforce that transition through this hook as specified. [files: docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md, docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md] | Define hook invocation for downstream stage attempts and upstream-unit resolution. Also specify a nonrecursive completion-release path because the hook itself is expected to call release. |
| error-paths | HIGH | Reading before setAssignee and verifying afterward guarantees that concurrent claims never replace another holder. | setAssignee calculates 'others = current.logins.filter(...)' and executes '--remove-assignee' before adding the requested actor. If A and B initially observe no holder, A can claim successfully, then B's setAssignee can read A, remove A, assign B, and verify B successfully. Neither reread must report a mismatch. [files: src/workflow/tracker/github-adapter.ts, src/workflow/tracker/port.ts] | Amend sc1 with a concurrency-safe claim operation or explicitly resolve the unsupported exclusivity guarantee. Do not use replacement-style setAssignee as a safe claim primitive. |
| new-versus-reuse | MED | Loading the tracker and then reading identity and assignee requires at most two live port reads. | loadTracker already executes 'const who = tracker.whoAmI()'. The proposed gate then calls whoAmI and readAssignee again. That is three live reads even before setAssignee performs its own before/after reads or ensureUnitIssue performs lookups. [files: src/workflow/tracker/github-adapter.ts, src/workflow/tracker/unit-issue.ts] | Clarify whether the bound excludes loader and mutation reads, or amend the loader contract to return the verified identity without a duplicate read. |
| error-paths | MED | A refused gate call can perform local issue resolution first while guaranteeing that nothing is written. | resolveUnitIssueLocal invokes 'reconcile(unit, hit, now())'. Reconciliation calls recordUnit, which calls patchTrackerMeta on artifact and sibling records. The proposed ordering resolves locally before loading the tracker, so a later missing-signin or unreachable failure can follow metadata writes. [files: src/workflow/tracker/unit-issue.ts] | Either make preauthorization resolution read-only or narrow the guarantee to prohibit content and approval changes while explicitly permitting metadata reconciliation. |
| tests | MED | The ac24 test listed proves automatic claim release on completed signoff. | DEF ac24 requires the claim to be released when completion is checked. The LLD maps it only to testing hook consultation and the unregistered-hook default. HLD §3 explicitly allocates the actual ac24 test to s7. Hook invocation alone does not prove release. [files: docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md, docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md, docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/LLD.md] | Label this as an s5 hook-contract test and explicitly reference the deferred s7 ac24 integration test asserting that completion clears the assignee. |

#### Could not verify (does not block)

_None._
