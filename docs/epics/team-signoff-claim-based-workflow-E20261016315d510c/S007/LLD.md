<!-- insrc:artifact LLD-315d510cb28100e2-s7 -->

# LLD: STORY-315d510cb28100e2-s7

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `0e84c94e4340...`

Story s7 makes signoff a real step in a team repo: the claim holder submits approved, reviewed artifacts as one request in the tracker, and the next stage will not start until the tracker reports that request completed. One read-only decision, taken by the stage an attempt follows, is used both by the team gate's completion hook and by an awaited step at the daemon's stage-start entries, which also records the tracker's answer on every artifact of the request together and releases the claim; the same step runs on demand through a team settle command, which is how a BUILD's request, held on the Story's issue, is read. Story and Epic completion wait inside the completion walk for signoff when the policy lists a member stage, so a listed artifact stays approved until it can be submitted, and signoff facts live in each artifact's lifecycle and are shown apart from model review and local approval.

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

**Rollout phase:** Phase D — signoff
**Owns:** `sc5` (SignoffRecord)
**Consumes:** `sc1` (TrackerPort and PortResult), `sc2` (TeamPolicy), `sc3` (Per-unit tracker record and revision), `sc4` (Team gate, claim state, gate outcome, refusal error and completion hook)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-s1 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `openSignoff`

```typescript
openSignoff(repo: string, unit: UnitRef, artifactIds: readonly string[]): Promise<PortResult<SignoffRequestRef>>
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `unit: UnitRef` — The unit that holds the stage: the epic for DEF and HLD, the story for LLD and for BUILD (the BUILD record is Story-scoped).
- `artifactIds: readonly string[]` — The artifacts chosen for the request.

**Returns:** `Promise<PortResult<SignoffRequestRef>>` — The opened request, or a refusal naming the missing prerequisite.

**Errors:**
- `TeamGateRefusedError` when The signed-in user is not the holder of the issue of that unit, including a unit nobody holds (it must be claimed first).
- `PortResult not ok` when The stage is not listed in signoffStages, an artifact lacks approval at its current revision or lacks its review (named in the reason), or the tracker cannot open the request.

**Preconditions:**
- The policy lists the artifacts' stage in signoffStages
- The signed-in user holds the issue of the unit (for a BUILD, the Story's issue)
- Each artifact is approved at its current revision (the completion hold keeps listed artifacts approved) and reviewed by the other party: the lifecycle review for DEF, HLD and LLD, the Story's code-review record with a verdict that is not block for BUILD

**Postconditions:**
- One request is opened through the port and linked from that unit issue
- Every artifact is recorded open-signoff with the Reference { entityId: the request ref, type: signoff-request, relation: tracked-by }
- A repeat after a partial recording finds the open request and records only the rest

### 2.2 `settleSignoff`

```typescript
settleSignoff(repo: string, unit: UnitRef): Promise<void>
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `unit: UnitRef` — The unit whose open requests are read: DEF and HLD on an epic unit, LLD and BUILD on a story unit, limited to the stages the policy lists.

**Returns:** `Promise<void>` — Resolves after every readable request of the unit's listed stages has been recorded and the completion the hold deferred has run; never throws for a tracker failure.

**Errors:**
- `none thrown` when A tracker or lifecycle failure leaves the remaining artifacts for the next attempt and the stage stays blocked.

**Preconditions:**
- The tracker is loaded with the capabilities claim and signoff-request

**Postconditions:**
- A completed request is applied as signed-off to all its artifacts, then the assignee of the unit issue is cleared
- A changes-requested request is applied as signoff-changes to all its artifacts
- completeIfRolledUp runs for the Story with the hold predicate once nothing is held
- No tracker call is made outside team mode or when no listed stage has an open request

### 2.3 `settleForAttempt`

```typescript
settleForAttempt(repo: string, unit: UnitRef, action: GuardedAction, authoring?: string): Promise<void>
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `unit: UnitRef` — The unit the attempt is on.
- `action: GuardedAction` — The attempted action.
- `authoring: string` _(optional)_ — The authoring workflow for action author.

**Returns:** `Promise<void>` — Resolves when the attempt is not blocked by signoff, after settling the followed stage's unit.

**Errors:**
- `TeamGateRefusedError` when blockedBySignoff still blocks the attempt after settling: awaiting-signoff, changes requested, or a request that could not be read or recorded.

**Preconditions:**
- Awaited first at the daemon's stage-start entries: the workflow-step start phase, runWorkflowServerSide and the second driver entry in workflow-rpc, the two build implement entries and resumeStage

**Postconditions:**
- settleSignoff has run for the unit that holds the followed stage
- The attempt is refused independently of the team gate's first-author exception

### 2.4 `blockedBySignoff`

```typescript
blockedBySignoff(repo: string, unit: UnitRef, action: GuardedAction, authoring?: string): GateOutcome | null
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `unit: UnitRef` — The unit the attempt is on.
- `action: GuardedAction` — The attempted action.
- `authoring: string` _(optional)_ — The authoring workflow for action author.

**Returns:** `GateOutcome | null` — awaiting-signoff with the open request, a refusal for changes-requested or for a completed request not yet recorded, or null when nothing blocks, including when every head of the followed stage counts under isSignedOffOrGrandfathered.

**Postconditions:**
- Reads the policy and the followed stage's heads only; never writes and needs no tracker port

### 2.5 `isSignedOffOrGrandfathered`

```typescript
isSignedOffOrGrandfathered(policy: TeamPolicy, meta: unknown): boolean
```

**Parameters:**
- `policy: TeamPolicy` — The policy whose anchor decides grandfathering.
- `meta: unknown` — The head's meta, as approvalStateOf and approvedAtOf take it.

**Returns:** `boolean` — True when the head's status is signed-off, or when policy.source.anchorKnown is true and the head was approved before policy.source.firstCommitTime; never true by grandfathering when anchorKnown is false.

**Postconditions:**
- Pure; the one rule used by blockedBySignoff, signoffHoldsCompletion and signoffRecordsOf

### 2.6 `followedStageOf`

```typescript
followedStageOf(action: GuardedAction, authoring: string | undefined, unit: UnitRef): { stage: 'DEF' | 'HLD' | 'LLD'; unit: UnitRef } | null
```

**Parameters:**
- `action: GuardedAction` — The attempted action.
- `authoring: string` _(optional)_ — The authoring workflow for action author.
- `unit: UnitRef` — The unit the attempt is on.

**Returns:** `{ stage; unit } | null` — The signed-off stage this attempt follows and the unit that holds it: author design.epic follows DEF on the epic; author design.story follows HLD on the epic of the story; author plan and build follow LLD on the story; null for any other attempt, including anything that follows BUILD.

**Postconditions:**
- Pure; reads nothing

### 2.7 `signoffCompletionHook`

```typescript
signoffCompletionHook(repo: string, unit: UnitRef, port: TrackerPort, action: GuardedAction, authoring?: string): GateOutcome | 'continue'
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `unit: UnitRef` — The unit the gate is judging.
- `port: TrackerPort` — The loaded tracker port, not used by the read-only decision.
- `action: GuardedAction` — The attempted action.
- `authoring: string` _(optional)_ — The authoring workflow for action author.

**Returns:** `GateOutcome | 'continue'` — The blockedBySignoff outcome for author and build, and continue for open-signoff, revise and release and when nothing blocks.

**Preconditions:**
- Registered through registerSignoffHook in both the daemon and the terminal
- The action and authoring arguments are those added to sc4 by AMD-315d510cb28100e2-17

**Postconditions:**
- Reads only; never writes

### 2.8 `signoffHoldsCompletion`

```typescript
signoffHoldsCompletion(repo: string, unitId: string): boolean
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `unitId: string` — The id of the Story or Epic whose completion the walk is about to apply.

**Returns:** `boolean` — True when the unit is a Story whose LLD or BUILD, or an Epic whose DEF or HLD, is listed in signoffStages and does not count under isSignedOffOrGrandfathered; false otherwise, and always false outside team mode.

**Postconditions:**
- Reads the policy and the member heads only; never writes

### 2.9 `teamSettle`

```typescript
teamSettle(repoPath: string, unit: Omit<UnitRef, 'repoPath'>, call?: DaemonCall): Promise<string>
```

**Parameters:**
- `repoPath: string` — Repo path as the terminal knows it.
- `unit: Omit<UnitRef, 'repoPath'>` — The unit whose requests are read; a Story for a BUILD's request.
- `call: DaemonCall` _(optional)_ — The daemon call, injectable for tests.

**Returns:** `Promise<string>` — A line saying what the tracker reported and what was recorded, or why nothing was.

**Preconditions:**
- The daemon serves the team.settle operation, registered beside team.park and team.resume

**Postconditions:**
- The daemon runs settleSignoff for the unit, the on-demand way to read a BUILD's request and to run a held completion

### 2.10 `registerSignoffHook`

```typescript
registerSignoffHook(): void
```

**Returns:** `void` — The signoff hook is the registered completion hook of this process.

**Postconditions:**
- registerCompletionHook holds signoffCompletionHook

### 2.11 `signoffRecordsOf`

```typescript
signoffRecordsOf(repo: string, unit: UnitRef): SignoffRecord[]
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `unit: UnitRef` — The unit whose heads are read.

**Returns:** `SignoffRecord[]` — sc5 records derived from the completed Lifecycle.signoffs of the unit's heads, grouped by the request ref read from Reference.entityId, with grandfathered set by isSignedOffOrGrandfathered's anchor rule.

**Postconditions:**
- No stored stamp is read or written

### 2.12 `signoffViewOf`

```typescript
signoffViewOf(meta: unknown): { state: 'none' | 'open' | 'changes-requested' | 'completed'; request: SignoffRequestRef | null; revision: number | null }
```

**Parameters:**
- `meta: unknown` — The artifact's meta, as approvalStateOf and lifecycleReviewOf take it.

**Returns:** `{ state; request; revision }` — The signoff of the head, shown separately from model review and local approval.

**Postconditions:**
- Used by ArtifactGate and DeliveryEvidenceEntry in delivery, which also list a Story's BUILD, and by the chain report's existing lines; never counted as a review

### 2.13 `openSignoffRequest`

```typescript
openSignoffRequest(spec: SignoffRequestSpec): PortResult<SignoffRequestRef>
```

**Parameters:**
- `spec: SignoffRequestSpec` — Title, body, the stage unit, the artifacts with their revision and committed path, the branch and the issue to link from; extended by the pending sc1 amendment.

**Returns:** `PortResult<SignoffRequestRef>` — The GitHub adapter opens a pull request from a branch holding the committed artifacts and links it from the unit issue; the ref carries an optional url.

**Errors:**
- `PortResult not ok` when missing-tool, missing-signin, unreachable or rejected.

**Preconditions:**
- The adapter declares signoff-request

**Postconditions:**
- The request is linked from the stage's issue

### 2.14 `readSignoffState`

```typescript
readSignoffState(ref: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'>
```

**Parameters:**
- `ref: SignoffRequestRef` — The request to read.

**Returns:** `PortResult<'open' | 'changes-requested' | 'completed'>` — Read from the pull request's review decision and merge state.

**Errors:**
- `PortResult not ok` when missing-tool, missing-signin, unreachable or rejected.

**Postconditions:**
- Read-only

## 3. Data model changes

### 3.1 `SignoffRecord` — new

sc5 record { request, artifacts: [{artifactId, revision}], completedAt, grandfathered? } produced by signoffRecordsOf from Lifecycle.signoffs; no stored stamp. The request Reference stored on each Signoff is { entityId: the request ref, type: 'signoff-request', relation: 'tracked-by' }, an existing member of the closed relation union, so the Reference type is not changed; the ref is read back from entityId, so settle and signoffRecordsOf group artifacts by it.

**Call sites:**
- `src/workflow/artifact-core/types.ts:28-32`
- `src/workflow/artifact-core/types.ts:131`
- `src/workflow/artifact-core/lifecycle.ts:36-45`
- `src/workflow/artifact-core/lifecycle.ts:197-200`

### 3.2 `SignoffRequestSpec` — field-add

Gains the stage unit, the artifacts with revision and committed path, the branch and the issue to link from; SignoffRequestRef gains an optional url (the pending sc1 amendment AMD-315d510cb28100e2-16).

**Call sites:**
- `src/workflow/tracker/port.ts:44-56`
- `src/workflow/tracker/github-adapter.ts:203-222`

### 3.3 `GitHub adapter capability set` — field-modify

CAPABILITIES gains signoff-request, because loadTracker rejects a needed capability the adapter does not declare. Invariant at risk: the adapter declares only what it implements, so it is added together with the two methods and only then.

**Call sites:**
- `src/workflow/tracker/github-adapter.ts:54`
- `src/workflow/tracker/github-adapter.ts:203-222`

### 3.4 `CompletionHook` — field-modify

Gains trailing action and authoring arguments (sc4 amendment AMD-315d510cb28100e2-17); consultHook passes them. Invariant at risk: a hook written with three arguments keeps working.

**Call sites:**
- `src/workflow/team/gate.ts:94-123`

### 3.5 `EvidenceContext` — field-add

Gains an optional holds predicate, (unitId) => boolean, that the completion walk consults for every unit it visits and that stops the walk at a unit it holds. Absent, the walk is unchanged.

**Call sites:**
- `src/workflow/artifact-core/lifecycle-service.ts:27-29`
- `src/workflow/artifact-core/lifecycle-service.ts:158-176`

### 3.6 `Story and Epic completion` — invariant-change

completeThroughService passes signoffHoldsCompletion as the holds predicate, so the walk skips a held Story and therefore also the Epic above it, and settleSignoff runs the walk again once nothing is held. Invariant at risk: a Story completes, and cascades complete onto its members, as soon as its roll-up holds; with no policy, outside team mode, with no member stage listed, or with every listed member signed off or grandfathered the predicate is false and completion is unchanged.

**Call sites:**
- `src/workflow/gates.ts:945-949`
- `src/workflow/artifact-core/lifecycle-service.ts:158-176`
- `src/workflow/artifact-core/lifecycle.ts:332-362`

### 3.7 `ArtifactGate` — field-add

Gains a signoff entry from signoffViewOf next to approval and review, which keep their values.

**Call sites:**
- `src/workflow/delivery/types.ts:185-205`
- `src/workflow/delivery/load.ts:54`

### 3.8 `DeliveryEvidenceEntry` — field-add

Gains the same signoff entry beside approval, review and reviewCurrency; the evidence of a story already includes its BUILD records, so a held BUILD shows its signoff state there.

**Call sites:**
- `src/workflow/delivery/types.ts:281-289`
- `src/workflow/delivery/gate.ts:204`
- `src/workflow/delivery/gate.ts:332`

### 3.9 `ChainReport` — field-add

Each existing artifact line (define, HLD and LLD) gains its signoff state after the approval state; no BUILD or Story-completion line is added, because the report carries none and a held BUILD is shown in the delivery evidence.

**Call sites:**
- `src/workflow/chain.ts:86-94`
- `src/workflow/chain.ts:321`
- `src/workflow/artifact-core/approval-view.ts:24-51`

### 3.10 `team daemon operations` — field-add

handoffRpcHandlers gains team.settle beside team.park and team.resume, and the terminal's team service gains teamSettle beside teamPark and teamResume.

**Call sites:**
- `src/daemon/steps/workflow-step/handoff-rpc.ts:22-23`
- `src/cli/services/team.ts:79`
- `src/cli/services/team.ts:90`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | SignoffRecord is implemented as the HLD sketch, derived from lifecycle facts through signoffRecordsOf. |
| `sc1` | consumes | Uses openSignoffRequest, readSignoffState, readAssignee, whoAmI and setAssignee; the adapter declares signoff-request and implements the two signoff methods, and the request types are extended by the pending amendment. |
| `sc2` | consumes | Reads signoffStages, source.firstCommitTime and source.anchorKnown; claimUnits is read only for who may author, never to decide which unit a request belongs to; never grandfathers when anchorKnown is false. |
| `sc3` | consumes | Reads the unit issue and the revision the signoff is bound to. |
| `sc4` | consumes | Registers the completion hook in the daemon and the terminal, returns awaiting-signoff, and relies on the additive action and authoring arguments of AMD-315d510cb28100e2-17. |

## 5. Error paths

**Error cases**

- **An artifact is submitted without local approval at its current revision** (recoverable)
  - Detection: openSignoff reads each artifact's lifecycle through approvalStateOf and compares the revision of the approval with the head revision
  - Response: Refuse before any tracker call, naming the artifact and that local approval is missing
  - User impact: The holder sees which artifact needs approval and approves it first
- **A DEF, HLD or LLD is submitted without an other-party review** (recoverable)
  - Detection: openSignoff reads lifecycleReviewOf for the head and checks the review exists and its reviewer is not the author
  - Response: Refuse before any tracker call, naming the artifact and the missing review
  - User impact: The holder runs the review first
- **A BUILD is submitted without a usable code review** (recoverable)
  - Detection: openSignoff reads the Story's code-review CR record and checks it exists, was written by the other party and its body.verdict is not block, because a BUILD head carries no lifecycle review
  - Response: Refuse before any tracker call, saying the code review is missing, written by the author, or blocking
  - User impact: The holder completes or resolves the code review first
- **The submitter is not the holder, or nobody holds the unit** (recoverable)
  - Detection: openSignoff reads the assignee of the issue of the unit that holds the stage (the epic for DEF and HLD, the story for LLD and BUILD) through port.readAssignee and compares it with port.whoAmI, because teamGate returns allowed for open-signoff on an unassigned stage
  - Response: Refuse with a TeamGateRefusedError naming the holder, or saying the stage must be claimed first when nobody holds it; no request is opened
  - User impact: A non-holder is told who holds the unit; on an unassigned stage the user claims it before submitting, and for a BUILD it is the Story's issue that must be claimed
- **The stage is not listed in signoffStages** (recoverable)
  - Detection: openSignoff finds the artifacts' stage absent from policy.signoffStages
  - Response: Refuse saying the policy does not ask for signoff at this stage
  - User impact: The author continues with local approval alone
- **The artifact to submit is no longer approved because its Story or Epic completed first** (terminal)
  - Detection: openSignoff reads the head's status as completed and open-signoff would be an illegal transition from it
  - Response: Refuse naming the status; this cannot arise for a listed, non-grandfathered stage in team mode because the holds predicate keeps the completion walk from completing it, so it signals an artifact that completed before the policy listed its stage
  - User impact: The holder is told the artifact is already completed and cannot be submitted
- **The tracker cannot be loaded because the adapter lacks signoff-request** (terminal)
  - Detection: loadTracker returns a not-ok PortResult naming the missing capability
  - Response: Return the refusal with its reason; there is no degraded mode
  - User impact: Signoff is unavailable for that tracker until it declares the capability
- **The tracker cannot open the request (missing tool, missing sign-in, unreachable, rejected)** (recoverable)
  - Detection: openSignoffRequest returns a not-ok PortResult with its kind
  - Response: Return the PortResult with its reason; record nothing on any artifact
  - User impact: The holder sees the cause and retries
- **Recording open-signoff fails part-way across the artifacts of a request** (recoverable)
  - Detection: LifecycleService.apply rejects for one artifact after others were recorded
  - Response: Stop and report; a repeat finds the open request through the Reference already stored on the recorded artifacts and records only the rest, never opening a second request
  - User impact: A retry completes the submission
- **The stored request Reference cannot be read back as a request ref** (terminal)
  - Detection: settleSignoff or signoffRecordsOf finds a Signoff whose Reference type is not signoff-request or whose entityId is empty
  - Response: Skip that Signoff, log it, and keep the stage blocked
  - User impact: The next stage stays refused and the log names the artifact
- **The tracker cannot be read during settle** (recoverable)
  - Detection: readSignoffState returns a not-ok PortResult
  - Response: settleSignoff records nothing for that request and logs the kind; settleForAttempt then throws the awaiting-signoff refusal because blockedBySignoff still blocks; team.settle reports the failure
  - User impact: The next stage is refused, or the settle command says the tracker could not be read, until it is reachable
- **Settle fails part-way recording signed-off across a completed request** (recoverable)
  - Detection: LifecycleService.apply rejects for one artifact after others were recorded
  - Response: Stop; blockedBySignoff refuses while any artifact of a completed request is unrecorded; the next settle records the rest; the claim is released and the deferred completion runs only after all are recorded
  - User impact: The next stage waits for the next attempt, and no artifact stays signed off alone
- **The request reports changes requested** (recoverable)
  - Detection: readSignoffState returns changes-requested
  - Response: Settle applies signoff-changes to every artifact of the request; the attempt is refused saying changes were requested and linking the request
  - User impact: The holder revises through s8's flow
- **Clearing the assignee on completion fails** (recoverable)
  - Detection: setAssignee returns a not-ok PortResult after all artifacts were recorded
  - Response: Log it and continue; the artifacts stay signed off and the next stage proceeds
  - User impact: The claim stays until released by the holder or an administrator
- **The deferred Story or Epic completion fails after signoff was recorded** (recoverable)
  - Detection: completeIfRolledUp throws or returns no completed ids while the holds predicate is now false and the roll-up holds
  - Response: Log it and leave the signoff recorded; the completion is retried by the next settle, by team.settle and by the next approval of a BUILD
  - User impact: The Story stays approved until the next attempt completes it
- **A BUILD's request completes but no stage start follows** (recoverable)
  - Detection: nothing reads a request that follows no stage, so the held Story stays approved; the user sees the BUILD record in the delivery evidence with its signoff entry still open (DeliveryEvidenceEntry lists a story's BUILD records), since the chain report has no BUILD line
  - Response: The user runs team settle for the Story, which makes the daemon read the request, record signed-off on the BUILD and run the held completion
  - User impact: The Story completes once team settle runs after the tracker reports completion
- **A first author turn is attempted on a story whose issue could not be created while the HLD awaits signoff** (recoverable)
  - Detection: teamGate returns allowFirstAuthor before it consults the hook, so settleForAttempt calls blockedBySignoff itself at the entry before the gate is reached
  - Response: Refuse with the awaiting-signoff outcome at the entry; the gate's exception is not reached
  - User impact: The first turn is refused until the HLD is signed off
- **The hook runs in a process where it was not registered** (terminal)
  - Detection: A test asserts both entry points call registerSignoffHook
  - Response: Registration is added at the daemon start and in makeServices in the terminal; a missing registration fails that test, and the entry step still refuses in the daemon
  - User impact: None when correct

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo without a policy file, teamMode off or claims not enforced | The hook, settle and the holds predicate make no tracker call and change nothing; the next stage and completion proceed as today |
| A policy listing LLD or BUILD when the BUILD of the Story's last task is approved | The approval stands, the walk stops at the held Story and so does not reach the Epic, and the BUILD and LLD stay approved until their signoff is recorded |
| A BUILD signoff when the policy's claimUnits puts BUILD on task units | The request still belongs to the Story's issue, because the BUILD record is Story-scoped; claimUnits decides who may author a task's build, not which unit holds a request |
| A Story whose every listed member is signed off while its Epic's DEF or HLD is listed and unsigned | The Story completes, the walk then stops at the held Epic, and the Epic completes when its listed members are signed off or grandfathered |
| A policy listing neither LLD nor BUILD nor DEF nor HLD | The holds predicate is false and the Story and Epic complete as soon as their roll-up holds |
| A pre-anchor LLD that stays approved and is never submitted, with anchorKnown true | isSignedOffOrGrandfathered counts it, so neither blockedBySignoff nor the holds predicate is affected by it and the Story completes |
| The same artifact when anchorKnown is false | Nothing is grandfathered: it blocks the next stage and holds completion until it is signed off |
| Authoring design.story on a story unit while the HLD on the epic has an open request | The attempt is judged by the HLD on the epic unit and refused as awaiting signoff; the same unit's LLD request does not block its own authoring |
| Authoring plan on the same story unit while the LLD has an open request | The attempt is judged by the LLD on the story and refused as awaiting signoff |
| A planned task build while the Story's LLD is signed off | The attempt follows the LLD on the story and proceeds |
| An attempt that follows BUILD, or any other action | followedStageOf returns null and nothing blocks |
| The next stage is attempted after the artifact was edited since it was signed off | Editing returned the head to draft, so approval and signoff are needed again; the old signoff covers the older revision |
| A request holds several artifacts and the tracker reports completed | Every artifact is recorded signed-off together, none alone |
| A pending request exists while the attempted action is open-signoff, revise or release | The hook returns continue so submission and retry never meet their own refusal |
| A later phase of a run already started (plan, step, synthesize, validate) | Only the registered hook judges it, from the recorded state, with no tracker call |
| Two clones settle the same completed request | The second finds the artifacts already signed off and does nothing |

**Invariants to preserve**

- The meaning of meta.review and of local approval does not change; signoff is never counted as a review and is shown beside them. [[c7]]
- A repo without the policy file, with teamMode off or with claims not enforced behaves exactly as today, with no tracker call. [[c5]]
- A BUILD's review stays the code-review record and never the lifecycle review. [[c6]]
- A Story completes and cascades complete onto its members, and the walk continues to its Epic, as soon as the roll-up holds, unless the policy lists a member stage that is neither signed off nor grandfathered. [[c9]]
- The Reference type's relation stays the closed union it is today. [[c1]]

## 6. Test strategy

**Test framework:** `node:test through tsx`

**Test levels**

- **unit** — Prove the submission prerequisites, the holder rule and the unit a request belongs to, the followed-stage mapping, the grandfather rule, the read-only decision, settle and its entry refusal, the completion hold, the Reference round trip, the derived records and registration with injected policy, tracker and lifecycle.
  - Subjects: `src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses a missing approval, a missing or author-written review for DEF, HLD and LLD, a stage the policy does not list, and a submitter who is not the holder`, `src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses an unassigned unit saying it must be claimed first`, `src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD checks the Story's code-review record (missing, written by the author, or blocking is refused; pass or warn by the other party is accepted) and never the lifecycle review`, `src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD reads the holder of the Story's issue and links the request from it even when claimUnits puts BUILD on task units, and settleSignoff for a story unit selects LLD and BUILD while an epic unit selects DEF and HLD`, `src/workflow/team/__tests__/signoff.test.ts: openSignoff opens one request, records open-signoff on every artifact with the Reference { entityId: ref, type: signoff-request, relation: tracked-by }, and finds the open request on a repeat after a partial recording`, `src/workflow/team/__tests__/signoff.test.ts: settleSignoff records signed-off on all artifacts of a completed request, clears the assignee of the unit issue, records signoff-changes on changes-requested, leaves the rest on a part-way failure, skips a Signoff whose Reference is not a signoff-request, and is idempotent across two clones`, `src/workflow/team/__tests__/signoff.test.ts: signoffRecordsOf derives sc5 records from lifecycle facts, groups by the ref read from entityId, and grandfathers by the shared rule`, `src/workflow/team/__tests__/signoff-hook.test.ts: isSignedOffOrGrandfathered counts a signed-off head, counts a head approved before the anchor only when anchorKnown is true, and never grandfathers when anchorKnown is false`, `src/workflow/team/__tests__/signoff-hook.test.ts: followedStageOf maps author design.epic to DEF on the epic, author design.story to HLD on the epic, author plan and build to LLD on the story, and anything else to null`, `src/workflow/team/__tests__/signoff-hook.test.ts: blockedBySignoff and signoffCompletionHook on one story unit block design.story authoring on the HLD's open request and plan authoring on the LLD's open request, but not the LLD's own authoring, skip a grandfathered head, return awaiting-signoff, a changes-requested refusal, an unsettled-completed refusal, or continue, never write, and need no tracker call`, `src/workflow/team/__tests__/signoff-hook.test.ts: settleForAttempt refuses a first design.story turn on a story whose issue could not be created while the HLD awaits signoff, before teamGate's allowFirstAuthor exception is reached`, `src/workflow/team/__tests__/signoff-hold.test.ts: signoffHoldsCompletion is true for a Story whose listed LLD or BUILD is not signed off and for an Epic whose listed DEF or HLD is not, false for a grandfathered pre-anchor member when anchorKnown is true, true for it when anchorKnown is false, and false outside team mode, with no policy, or with no member stage listed`, `src/workflow/artifact-core/__tests__/completion-holds.test.ts: completeIfRolledUp with a holds predicate stops the walk at a held Story so the Epic is not completed, completes an unheld Story and then stops at a held Epic, and with no predicate behaves as before`, `src/workflow/__tests__/signoff-hold.test.ts: completeThroughService leaves a Story approved-not-completed while its listed BUILD awaits signoff, and settleSignoff completes the Story and its Epic once signed-off is recorded, with the members cascaded`, `src/workflow/team/__tests__/signoff-registration.test.ts: both the daemon start and makeServices in the terminal call registerSignoffHook, consultHook passes the action and the authoring workflow to the hook, and each listed daemon entry (workflow-step start, runWorkflowServerSide, the second driver entry, both build implement entries, resumeStage) awaits settleForAttempt before its gate call while plan, step, synthesize and validate do not`, `src/daemon/__tests__/team-settle.test.ts: the team.settle operation runs settleSignoff for the unit, so a BUILD's completed request is recorded as signed-off and the held Story completes, and teamSettle prints what was recorded or why nothing was`
  - Fixtures: `_setGateDepsForTests with fake policy reader, tracker loader and issue lookup`, `temp repo marked converted via src/workflow/__tests__/helpers/converted-repos.ts`, `fake TrackerPort with scripted readSignoffState, readAssignee and whoAmI`, `temp Story with a code-review record, approved Task builds and a pre-anchor LLD`
- **unit** — Prove signoff is shown apart from review and approval on the display surfaces, including a held BUILD.
  - Subjects: `src/workflow/__tests__/signoff-view.test.ts: signoffViewOf, ArtifactGate, DeliveryEvidenceEntry and the existing chain report lines show signoff separately while approval and review output is unchanged`, `src/workflow/delivery/__tests__/signoff-delivery.test.ts: the delivery evidence of a Story lists its BUILD record with its signoff entry, so a BUILD that is in signoff or approved and held is visible there`
  - Fixtures: `temp repo with a signed-off head`, `temp Story with an approved BUILD held for signoff`
- **contract** — Prove the GitHub adapter declares signoff-request and implements the two signoff methods against the gh command contract.
  - Subjects: `src/workflow/tracker/__tests__/github-signoff.test.ts: loadTracker accepts signoff-request once declared; openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url; readSignoffState maps review decision and merge state to open, changes-requested and completed; failure kinds map to PortResult kinds`
  - Fixtures: `fake gh executable with scripted output`
- **integration** — Prove the whole flow through the real gate, lifecycle and a fake tracker.
  - Subjects: `src/workflow/team/__tests__/signoff-e2e.test.ts: claim, submit, refused next stage while open, completion settled at the next-stage attempt, all artifacts signed off together, claim released, deferred Story completion run by team.settle for a BUILD, and an unlisted stage unaffected`
  - Fixtures: `temp repo with approved and reviewed artifacts`, `fake TrackerPort`
- **smoke** — Confirm the real GitHub request against a sandbox repository, reported by the builder since the gate cannot run it.
  - Subjects: `Open a signoff pull request on a sandbox repo, approve and merge it, then start the next stage`
  - Fixtures: `sandbox GitHub repository and gh sign-in`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac29` | `src/workflow/team/__tests__/signoff.test.ts: openSignoff opens one request, records open-signoff on every artifact with the Reference, and finds the open request on a repeat after a partial recording`, `src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD reads the holder of the Story's issue and links the request from it even when claimUnits puts BUILD on task units`, `src/workflow/__tests__/signoff-hold.test.ts: completeThroughService leaves a Story approved-not-completed while its listed BUILD awaits signoff, and settleSignoff completes the Story and its Epic once signed-off is recorded`, `src/workflow/tracker/__tests__/github-signoff.test.ts: openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url`, `src/workflow/team/__tests__/signoff-e2e.test.ts: claim, submit, refused next stage while open` |
| `ac30` | `src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses a missing approval, a missing or author-written review for DEF, HLD and LLD, a stage the policy does not list, and a submitter who is not the holder`, `src/workflow/team/__tests__/signoff.test.ts: openSignoff refuses an unassigned unit saying it must be claimed first`, `src/workflow/team/__tests__/signoff.test.ts: openSignoff for BUILD checks the Story's code-review record and never the lifecycle review` |
| `ac31` | `src/workflow/team/__tests__/signoff-hook.test.ts: blockedBySignoff and signoffCompletionHook on one story unit block design.story authoring on the HLD's open request and plan authoring on the LLD's open request, but not the LLD's own authoring`, `src/workflow/team/__tests__/signoff-hook.test.ts: settleForAttempt refuses a first design.story turn on a story whose issue could not be created while the HLD awaits signoff`, `src/workflow/team/__tests__/signoff-e2e.test.ts: refused next stage while open` |
| `ac32` | `src/workflow/team/__tests__/signoff.test.ts: settleSignoff records signed-off on all artifacts of a completed request, clears the assignee of the unit issue`, `src/workflow/team/__tests__/signoff-registration.test.ts: each listed daemon entry awaits settleForAttempt before its gate call`, `src/daemon/__tests__/team-settle.test.ts: the team.settle operation runs settleSignoff for the unit`, `src/workflow/team/__tests__/signoff-e2e.test.ts: completion settled at the next-stage attempt` |
| `ac33` | `src/workflow/team/__tests__/signoff.test.ts: settleSignoff leaves the rest on a part-way failure`, `src/workflow/team/__tests__/signoff-e2e.test.ts: all artifacts signed off together` |
| `ac34` | `src/workflow/team/__tests__/signoff-hook.test.ts: continue for a followed stage the policy does not list and with no policy, and a grandfathered head does not block`, `src/workflow/team/__tests__/signoff-hold.test.ts: signoffHoldsCompletion is false outside team mode, with no policy, with no member stage listed, or for a grandfathered member`, `src/workflow/artifact-core/__tests__/completion-holds.test.ts: with no predicate the walk behaves as before`, `src/workflow/team/__tests__/signoff-e2e.test.ts: an unlisted stage unaffected` |
| `ac35` | `src/workflow/__tests__/signoff-view.test.ts: signoffViewOf, ArtifactGate, DeliveryEvidenceEntry and the existing chain report lines show signoff separately while approval and review output is unchanged`, `src/workflow/delivery/__tests__/signoff-delivery.test.ts: the delivery evidence of a Story lists its BUILD record with its signoff entry` |

## 7. Alternatives considered

### 7.1 a1: Read-only decision, an async settle step at the entries and on demand, a completion hold inside the walk, lifecycle facts, pull request as the request — **CHOSEN**

One read-only check (blockedBySignoff) judges an attempt by the stage it follows and is used by the sync hook and by the async settle entry step; settle also runs on demand through team.settle, which is how a BUILD's request is read; Story and Epic completion are held inside the completion walk until every listed, non-grandfathered member is signed off; signoff facts live in Lifecycle.signoffs.



### 7.2 a2: Make the gate and the hook asynchronous

teamGate, assertMayAuthor and the hook return promises so the hook can record signoff itself.



**Rejected because:** Meets most criteria but breaks sc4's synchronous contract across about a dozen call sites and leaves the first-author gap open; a larger blast radius than a1.

### 7.3 a3: A stored meta.signoffs stamp and a synchronous write in the hook

Write SignoffRecord into each artifact's meta synchronously from the hook, as the HLD sketches it.



**Rejected because:** Duplicates Lifecycle.signoffs, drifts from the common model and violates the read-only nature of the gate (sc4).

## 8. References

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:28-32` — "a Reference's relation is a closed union; Lifecycle.signoffs and the open-signoff, signoff-changes and signed-off operations"
- **[[c2]]** `analyze-bundle` `src/workflow/team/gate.ts:94-123` — "CompletionHook is synchronous and receives no action; consultHook calls it"
- **[[c3]]** `analyze-bundle` `src/cli/services/index.ts:101-102` — "the terminal runs the team gate in its own process"
- **[[c4]]** `analyze-bundle` `src/workflow/tracker/github-adapter.ts:203-222` — "openSignoffRequest and readSignoffState are unsupported; CAPABILITIES lacks signoff-request"
- **[[c5]]** `analyze-bundle` `src/workflow/team/types.ts:13-48` — "signoffStages, claimUnits, firstCommitTime and source.anchorKnown"
- **[[c6]]** `analyze-bundle` `src/workflow/gates.ts:945-949` — "a BUILD artifact is Story-scoped and its review is the code-review record, never the lifecycle review"
- **[[c7]]** `analyze-bundle` `src/workflow/delivery/gate.ts:204` — "the delivery evidence of a story includes its BUILD records; the chain report has no BUILD line"
- **[[c8]]** `analyze-bundle` `src/workflow/team/__tests__` — "gate unit tests with injected deps; node:test through tsx"
- **[[c9]]** `analyze-bundle` `src/workflow/artifact-core/lifecycle-service.ts:158-176` — "completeIfRolledUp walks upward from the Story to its Epic, so a check before the call cannot stop the Epic step"
- **[[c10]]** `analyze-bundle` `src/daemon/steps/workflow-step/handoff-rpc.ts:22-23` — "team.park and team.resume are the pattern for a team.settle operation"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-22T15:44:26.196Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
