<!-- insrc:artifact LLD-315d510cb28100e2-s6 -->

# LLD: E20261018315d510c:S006

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `2ed0cef29a4f...`

When a stage is reassigned in the tracker, the previous owner's next changing action is refused as today and now also offers to park: the draft artifacts and a checkpoint of the run (its complete state, who owned it and which upstream artifact revisions it started from) are committed to a handoff branch named from the repo's branch pattern, pushed, and noted on the stage's issue. The new assignee resumes with one command: the daemon checks the repository is registered and is the same one, fetches the branch, restores the files, rebinds the run to their clone and returns the next workflow turn, whichever stage the run was in. If there is no parked branch, for instance after a lost machine, resume tells them which stage to start afresh on the committed artifacts, so finished stages are never redone.

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
**Consumes:** `sc4` (Team gate, claim state, gate outcome, refusal error and completion hook)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-S001 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `teamGate`

```typescript
teamGate(repo: string, unit: UnitRef, action: GuardedAction, authoring?: string): GateOutcome
```

**Parameters:**
- `repo: string` — Repository path
- `unit: UnitRef` — The stage unit
- `action: GuardedAction` — The guarded action
- `authoring: string` _(optional)_ — Workflow being authored, for the first-author exception

**Returns:** `GateOutcome` — Unchanged, except that held-by-other carries offerPark true when the registered park-offer provider says the actor has unparked work for the unit

**Errors:**
- `none` when Never throws; a provider that throws counts as false

**Preconditions:**
- None registered means offerPark false

**Postconditions:**
- offerPark is true only on held-by-other
- A repo with no policy makes no provider call and no tracker call (k4)

### 2.2 `encodeState`

```typescript
encodeState(payload: WorkflowStepStatePayload, meta?: RunEntryMeta): string
```

**Parameters:**
- `payload: WorkflowStepStatePayload` — The run state to store
- `meta: RunEntryMeta` _(optional)_ — { owner?: string; upstream?: UpstreamRevision[] }: the acting user and the upstream revisions captured when the run was created

**Returns:** `string` — The opaque state token

**Errors:**
- `WorkflowStateDecodeError` when The payload version is not the current one (unchanged)

**Postconditions:**
- meta is kept on the store entry beside payload, createdAt and touchedAt; the payload shape and token format are unchanged
- reencodeState and replaceState carry the previous entry's meta onto the replacement, so ownership and the snapshot survive every plan and step turn

### 2.3 `handleStart`

```typescript
handleStart(input: WorkflowStepInputStart): Promise<WorkflowStepOutput>
```

**Parameters:**
- `input: WorkflowStepInputStart` — The start request

**Returns:** `WorkflowStepOutput` — Unchanged turn (emit_plan or the question gate); the run it stores now carries meta

**Errors:**
- `TeamGateRefusedError` when Unchanged: the author gate

**Postconditions:**
- Before encodeState it sets meta.owner from actingUser(repo) and meta.upstream from snapshotUpstream(repo, workflow, params); a repo without a team policy gets neither and makes no tracker call (k4)

### 2.4 `snapshotUpstream`

```typescript
snapshotUpstream(repo: string, workflow: string, params: Record<string, unknown>): readonly UpstreamRevision[]
```

**Parameters:**
- `repo: string` — Repository path
- `workflow: string` — design.epic, design.story or plan
- `params: Record<string, unknown>` — epicHash and storyId

**Returns:** `readonly UpstreamRevision[]` — { artifactId, revision } for each artifact the workflow reads (design.epic: the Define; design.story: the Define and HLD; plan: the Story LLD), revision from readRevision so a missing one is 0

**Errors:**
- `none` when A missing or unreadable artifact is listed with revision 0; never throws

**Postconditions:**
- Read once when the run is created, which is the baseline every step output of the run is computed against

### 2.5 `listStates`

```typescript
listStates(): readonly { token: string; payload: WorkflowStepStatePayload; meta: RunEntryMeta | undefined; touchedAt: number }[]
```

**Returns:** `readonly { token: string; payload: WorkflowStepStatePayload; meta: RunEntryMeta | undefined; touchedAt: number }[]` — Every live entry, newest touch first

**Postconditions:**
- Reading the list does not touch any entry's expiry

### 2.6 `actingUser`

```typescript
actingUser(repo: string): string | undefined
```

**Parameters:**
- `repo: string` — Repository path

**Returns:** `string | undefined` — The signed-in tracker login when claims are enforced for the repo, otherwise undefined with no tracker call

**Errors:**
- `none` when Never throws; any failure reading the user returns undefined

**Postconditions:**
- A repo without a team policy makes no tracker call (k4)

### 2.7 `parkDraft`

```typescript
parkDraft(repo: string, unit: UnitRef, opts?: { runToken?: string }): Promise<ParkResult>
```

**Parameters:**
- `repo: string` — Repository path
- `unit: UnitRef` — The Epic or Story unit being handed over
- `opts.runToken: string` _(optional)_ — State token of the run to checkpoint; when omitted the actor's most recently touched run for the unit is used

**Returns:** `ParkResult` — { ok: true, branch, commit, noted, variant: 'run' | 'draft' } or { ok: false, reason } naming the first step that failed

**Errors:**
- `ParkResult ok:false` when The actor holds the unit, the unit is a Task, the supplied token belongs to another unit, another actor or no owner, git fails, the push is rejected or the branch pattern is invalid

**Preconditions:**
- The tracker shows someone else as holder of the unit
- The actor owns a live run for the unit (any stage, including awaiting_plan) or has an uncommitted draft artifact for it

**Postconditions:**
- A run checkpoint is written when the actor owns a live run, otherwise a draft-only checkpoint when only a draft exists; both are committed with the draft artifacts to the pushed handoff branch
- One note is added through port.issueOps.comment; a failed note is reported as noted:false and does not undo the push
- The user's checked-out branch, index and working tree are unchanged

### 2.8 `inferStageWorkflow`

```typescript
inferStageWorkflow(repo: string, unit: UnitRef): 'design.epic' | 'design.story' | 'plan' | 'complete'
```

**Parameters:**
- `repo: string` — Repository path
- `unit: UnitRef` — The Epic or Story unit

**Returns:** `'design.epic' | 'design.story' | 'plan' | 'complete'` — From the committed artifact chain: an Epic unit with no HLD is design.epic and otherwise complete; a Story unit with no LLD is design.story, with an LLD and no PLAN is plan, with both is complete

**Errors:**
- `none` when Never throws

**Postconditions:**
- A committed LLD never hides an unfinished plan, and a committed PLAN means complete

### 2.9 `verifyReceivingRepo`

```typescript
verifyReceivingRepo(repoPath: string, repositoryId: string | undefined): Promise<{ ok: true } | { ok: false; reason: string }>
```

**Parameters:**
- `repoPath: string` — The receiving clone's path
- `repositoryId: string` _(optional)_ — The checkpoint's repository identity (the root commit id); undefined for a branch-less restart

**Returns:** `{ ok: true } | { ok: false; reason: string }` — ok only when listRepos shows repoPath registered with the daemon and, when an id is given, git rev-list --max-parents=0 HEAD in repoPath yields that id

**Errors:**
- `reason` when Not registered, not a git repository, or a different repository

**Postconditions:**
- Called by both resume entry points before any file is restored or fetched into the working tree

### 2.10 `resumeStage`

```typescript
resumeStage(repo: string, unit: UnitRef, opts?: { workflow?: string }): Promise<ResumeResult>
```

**Parameters:**
- `repo: string` — Repository path of the receiving clone
- `unit: UnitRef` — The Epic or Story unit being taken over
- `opts.workflow: string` _(optional)_ — design.epic, design.story or plan; inferred from the artifact chain by inferStageWorkflow when omitted

**Returns:** `ResumeResult` — { kind: 'resumed', turn } where turn is the next workflow-step turn (emit_plan, emit_step or emit_synthesize) with a fresh state token; { kind: 'restart', workflow, params, draftRestored } when there is no branch or only a draft-only checkpoint; { kind: 'nothing-to-resume', reason } when the stage is complete; or { kind: 'refused', reason }

**Errors:**
- `TeamGateRefusedError` when The actor does not hold the unit (the author gate, which also claims an unassigned unit)
- `ResumeResult refused` when Receiving repo not registered or not the same repository, unknown schema version, unit mismatch, path outside the unit's artifact paths, upstream revisions differ from the checkpoint's snapshot, uncommitted local changes to files to restore, or a fetch failure that is not a missing branch

**Preconditions:**
- The actor holds or can claim the unit through the author gate

**Postconditions:**
- On resumed: the draft files are in the working tree, both intents are rebound to the receiving clone, and the run is stored with the actor as owner and the checkpoint's snapshot
- On restart with draftRestored true the draft files are restored; if restoring any file fails every file restored by this call is removed again and the result is refused
- On any other kind nothing is written outside the daemon's memory

### 2.11 `rebindCheckpoint`

```typescript
rebindCheckpoint(checkpoint: RunCheckpoint, binding: { repoPath: string; repoIndexedAt: number | null; now: number }): WorkflowStepStatePayload
```

**Parameters:**
- `checkpoint: RunCheckpoint` — A validated run checkpoint
- `binding: { repoPath: string; repoIndexedAt: number | null; now: number }` — The receiving clone's absolute path, its index watermark and the clock

**Returns:** `WorkflowStepStatePayload` — A complete payload with version, runId, epicKey, startedAtMs, stage and intent and, by stage, the executor or stepOutputs, with repoPath and repoIndexedAt replaced in both the payload intent and the executor intent

**Preconditions:**
- The checkpoint passed validation

**Postconditions:**
- No absolute path from the parker's machine remains in the payload

### 2.12 `handoffBranchName`

```typescript
handoffBranchName(pattern: string | undefined, unit: UnitRef, slug: string): { ok: true; name: string } | { ok: false; reason: string }
```

**Parameters:**
- `pattern: string` _(optional)_ — The repo's branchPattern, or undefined for the default
- `unit: UnitRef` — The stage unit
- `slug: string` — Epic slug for {slug}

**Returns:** `{ ok: true; name: string } | { ok: false; reason: string }` — The branch name with {id} {slug} {type} filled in and checked against the grammar

**Errors:**
- `reason` when The name breaks the grammar, or the pattern omits {id} so it does not identify the unit

**Postconditions:**
- Deterministic for a unit, so resume finds the branch without reading the tracker

### 2.13 `insrc_workflow_step`

```typescript
insrc_workflow_step({ phase: 'park' | 'resume', repo?: string, params: { epicHash: string; storyId?: string; runToken?: string; workflow?: string } }): WorkflowStepOutput
```

**Parameters:**
- `phase: 'park' | 'resume'` — Two new phases beside start, plan, step and synthesize
- `params: { epicHash: string; storyId?: string; runToken?: string; workflow?: string }` — Identifies the unit (epic when storyId is absent); runToken applies to park, workflow to resume

**Returns:** `WorkflowStepOutput` — park returns a done-style result with branch, commit, noted and variant; resume returns the next turn (emit_plan, emit_step or emit_synthesize with state) or a restart, nothing-to-resume or error result

**Errors:**
- `team-gate-refused` when Mapped from TeamGateRefusedError exactly as the other phases

**Postconditions:**
- Served by the daemon-hosted handler, so it reaches the run store from an MCP client

### 2.14 `team.park / team.resume`

```typescript
daemon RPC: 'team.park' | 'team.resume' (params: { repoPath: string; epicHash: string; storyId?: string; workflow?: string }) => Promise<ParkResult | ResumeResult>
```

**Parameters:**
- `params: { repoPath: string; epicHash: string; storyId?: string; workflow?: string }` — The unit to hand over or take over

**Returns:** `ParkResult | ResumeResult` — The same results as parkDraft and resumeStage

**Errors:**
- `rpc error` when Bad parameters

**Postconditions:**
- Registered in the daemon handler map beside repo.add, so the terminal reaches the run store

### 2.15 `teamPark / teamResume`

```typescript
teamPark(repoPath: string, unit: { epicHash: string; storyId?: string }): Promise<string>; teamResume(repoPath: string, unit: { epicHash: string; storyId?: string }, workflow?: string): Promise<string>
```

**Parameters:**
- `unit: { epicHash: string; storyId?: string }` — Parsed from 'team park <epicHash> [storyId]' and 'team resume <epicHash> [storyId] [--workflow <name>]'
- `workflow: string` _(optional)_ — Optional design.epic, design.story or plan

**Returns:** `string` — One printable line: the branch parked, or the resume outcome with the next workflow turn; refusals print as a cross line naming the reason or the holder

**Errors:**
- `Error` when The daemon is not running or the rpc fails; rendered as a cross line

**Postconditions:**
- Bad or missing arguments print the usage line and call nothing

## 3. Data model changes

### 3.1 `HandoffCheckpoint` — new

Written to .insrc/handoff/<unit-key>.json on the handoff branch only, as one of two variants. Common: schemaVersion (1), kind ('run' | 'draft'), unit (epicHash, storyId), parkedBy, parkedAt, sourceHead, repositoryId (the root commit id), artifactPaths (repo-relative files parked with it). RunCheckpoint adds: runId, epicKey, stage (awaiting_plan, awaiting_llm_step or awaiting_synthesize), intent (workflow, focus, params; repoPath and repoIndexedAt are not stored), executor (plan, nextStepIndex, stepOutputs, pause; its own intent is not stored) when stage is awaiting_llm_step, stepOutputs when awaiting_synthesize, owner, upstream (the { artifactId, revision } snapshot captured when the run was created). A DraftCheckpoint carries only the common fields: it is for a daemon that restarted or a draft with no live run. Restoring checks every path lies under the unit's own artifact paths.

**Call sites:**
- `src/daemon/steps/workflow-step/state.ts:60-107`
- `src/workflow/types.ts:45-60`
- `src/workflow/types.ts:216-228`
- `src/workflow/storage.ts:102-110`

### 3.2 `Workflow state store entry` — field-add

Each entry gains optional meta { owner, upstream } beside payload, createdAt and touchedAt, and the module gains listStates. meta is set by handleStart through encodeState and carried by reencodeState and replaceState. Runs created when claims are not enforced, or before this change, have no meta.owner and are never treated as the actor's: they make offerPark false and park refuses them.

**Call sites:**
- `src/daemon/steps/workflow-step/state-store.ts:28-90`
- `src/daemon/steps/workflow-step/state.ts:60-107`
- `src/daemon/steps/workflow-step/phases/start.ts:108`
- `src/daemon/steps/workflow-step/phases/plan.ts:85`
- `src/daemon/steps/workflow-step/phases/plan.ts:108`
- `src/daemon/steps/workflow-step/phases/step.ts:87`
- `src/daemon/steps/workflow-step/phases/step.ts:110`

### 3.3 `GateOutcome.held-by-other.offerPark` — invariant-change

offerPark was always false. It is now true when the registered park-offer provider returns true for (repo, unit, actor): the actor owns a live run for the unit in any stage or has an uncommitted draft artifact for it. The type is unchanged.

**Call sites:**
- `src/workflow/team/gate.ts:34`
- `src/workflow/team/gate.ts:228`
- `src/workflow/team/gate.ts:264`

### 3.4 `describeOutcome` — invariant-change

A held-by-other outcome with offerPark true appends the park command, so every client that prints the refusal also prints the offer.

**Call sites:**
- `src/workflow/team/gate.ts:62-69`
- `src/daemon/steps/workflow-step/handler.ts:75`
- `src/cli/command.ts:244`

### 3.5 `branchPattern row` — field-modify

The catalog row gains the default insrc/handoff/{type}-{id} and loses its not-used-yet note; the grammar's placeholders stay id, slug and type.

**Call sites:**
- `src/config/repo-fields.ts:77-87`
- `src/workflow/config/github.ts:95`

### 3.6 `Issue handoff note` — new

One comment: the marker '<!-- insrc:handoff -->', the branch, the checkpoint commit, who parked, the stage and the variant. Posted with port.issueOps.comment; nothing reads it back.

**Call sites:**
- `src/workflow/tracker/port.ts:55-70`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | consumes | Reads GateOutcome and TeamGateRefusedError unchanged. resumeStage asks teamGate with action 'author' and the workflow, which claims an unassigned unit through the add-only assignment. parkDraft reads the holder through the same gate read and refuses when the actor holds the unit. The only addition to sc4 is registerParkOfferProvider, proposed as an amendment so offerPark can be set without an import cycle. |

## 5. Error paths

**Error cases**

- **Park is requested while the actor holds the unit** (recoverable)
  - Detection: parkDraft reads the holder through the gate and finds the actor's own login
  - Response: Return ok:false 'you hold this stage; there is nothing to hand over'. Nothing is written
  - User impact: A clear refusal instead of a branch for work the user still owns
- **The unit is a Task, or has no issue, or has no holder** (recoverable)
  - Detection: parkDraft checks unit.unit and the gate read: a Task unit, a no-issue outcome or a null holder
  - Response: Return ok:false naming the reason; a Task has no run to checkpoint and an unassigned unit is claimed and continued, not parked
  - User impact: The user is told to claim or to commit their code normally
- **Nothing to park: the actor owns no run for the unit and has no uncommitted draft artifact** (recoverable)
  - Detection: listStates has no entry whose meta.owner is the actor and whose intent maps to the unit, and git status --porcelain on the unit's artifact paths is empty
  - Response: Return ok:false 'no draft or run to hand over'
  - User impact: No empty branch is created
- **A supplied run token belongs to another unit, another actor, or a run with no owner** (recoverable)
  - Detection: The store entry's intent unit, meta.owner and the actor are compared before anything is read from git
  - Response: Return ok:false naming which comparison failed; nothing is written
  - User impact: A user cannot park someone else's run or a run from another stage
- **Branch name breaks the grammar or does not identify the unit** (recoverable)
  - Detection: handoffBranchName validates the filled name against the branchPattern row grammar and requires {id} in the pattern
  - Response: Return ok:false with the rule broken; no git command runs
  - User impact: The user fixes the pattern in settings
- **Git fails while parking (not a repository, hook rejects the commit, push rejected, remote unreachable)** (recoverable)
  - Detection: runGit returns ok:false for the failing step
  - Response: Stop at that step, remove the temporary worktree and the local branch this call created, leave the run in the store untouched, and report the git message with the step name. A rejected push because the branch moved reports that someone else parked first
  - User impact: Nothing is lost: the run stays in the daemon and the working files stay where they are
- **The issue note cannot be posted** (recoverable)
  - Detection: port.issueOps.comment returns ok:false
  - Response: Keep the pushed branch, return ok:true with noted:false and the failure kind, and print the branch name so the user can tell the new owner
  - User impact: Handoff works but the issue lacks the pointer until the user says it
- **The receiving path is not registered with the daemon, or is a different repository from the checkpoint's** (recoverable)
  - Detection: verifyReceivingRepo compares the path with listRepos and the checkpoint's repositoryId with git rev-list --max-parents=0 HEAD, before the branch is fetched into the working tree or any file is restored; resolveRepoPath alone would accept any non-empty path
  - Response: Return refused naming whether it is unregistered, not a git repository or another repository; nothing is restored and no state is saved
  - User impact: The new owner registers the repository, or opens the right clone
- **Resume finds a checkpoint with an unknown schemaVersion, an unknown kind, a unit that does not match, or a path outside the unit's artifact paths** (recoverable)
  - Detection: Parsing and validating the checkpoint before anything is written
  - Response: Return refused with the specific field; no file is restored and no state is saved
  - User impact: The new owner is told the checkpoint is unusable and may start the stage afresh
- **Resume would overwrite uncommitted local changes to the files it restores** (recoverable)
  - Detection: git status --porcelain on the files to restore is non-empty
  - Response: Return refused naming the files; nothing is touched
  - User impact: The new owner commits or stashes first
- **Restoring the draft files fails part way (disk full, permission)** (recoverable)
  - Detection: A write or rename in the restore loop throws or returns an error
  - Response: Remove every file this call already restored, restore any file it replaced from the pre-restore copy kept in memory, save no state, and return refused naming the failing file
  - User impact: The working tree is exactly as it was before the resume
- **Resume cannot fetch the handoff branch** (recoverable)
  - Detection: git ls-remote distinguishes a missing ref (empty result) from a failed command (ok:false)
  - Response: A missing branch falls back to restart on the committed artifacts; a network or permission failure is refused with the git message
  - User impact: A lost-machine takeover works without a branch; a network failure is not mistaken for a missing branch
- **The upstream artifacts moved since the run was created** (recoverable)
  - Detection: The run checkpoint's upstream snapshot of { artifactId, revision } (captured by snapshotUpstream when the run was created) is compared with readRevision of each file on the receiving clone, a missing revision reading as 0 on both sides
  - Response: Return refused 'the upstream moved since this run started' naming the artifacts, and offer the restart
  - User impact: The new owner redoes the stage on current input instead of resuming a stale one
- **The workflow named for a resume does not match the unit or the artifact chain** (recoverable)
  - Detection: resumeStage compares opts.workflow with authorUnitOf for the unit and with inferStageWorkflow
  - Response: Return refused naming the mismatch, for example a plan requested while the LLD is missing
  - User impact: The new owner is told which stage is actually next

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The same unit is parked twice (the second owner is reassigned too) | The deterministic branch name is reused and the new checkpoint is committed on top; a non-fast-forward push is reported as someone else having parked first |
| A run parked at stage awaiting_plan, before the decomposer plan was submitted | The run checkpoint has no executor state; resume rebinds the intents and returns the emit_plan turn with a fresh token |
| A run parked at stage awaiting_synthesize | The run checkpoint carries stepOutputs; resume returns the emit_synthesize turn |
| The daemon restarted after the user was reassigned, so the run is gone but the draft artifact has uncommitted changes | offerPark is still true from the uncommitted draft; park writes a draft-only checkpoint with the artifacts; resume restores the draft files and returns restart for the inferred workflow with draftRestored true |
| The actor owns two live runs for the same unit | Park checkpoints the most recently touched one and names its run id in the note; the other is left alone |
| A run created while claims were not enforced (no owner) | It is never treated as the actor's: offerPark is false for it and park refuses it by token |
| Resume on a repo with no policy or with claims not enforced | Refused as 'this repository does not enforce claims'; k4 behaviour is unchanged |
| Story whose LLD is committed and whose PLAN is not | inferStageWorkflow returns plan, so resume restarts the plan and a committed LLD does not report the stage as complete; with both committed it is nothing-to-resume |
| Receiving clones at different absolute paths and with different index watermarks | rebindCheckpoint replaces repoPath and repoIndexedAt in both intents and resets startedAtMs, so the run executes against the receiving clone |
| Lost machine: no branch, the stage has no artifact | resume returns restart naming the workflow and params to start fresh on the committed upstream artifacts; completed stages are not redone (ac28 at stage level, decided 2026-10-18) |

## 6. Test strategy

**Test framework:** `node:test via npx tsx --test, tests co-located in __tests__ directories`

**Test levels**

- **unit** — Pure logic with no git, tracker or daemon store
  - Subjects: `handoffBranchName: placeholder filling, the default pattern, grammar rejection, a pattern that omits {id}`, `HandoffCheckpoint validation: schema version, kind, unit match, path containment under the unit's artifact paths, run and draft variants`, `rebindCheckpoint: repoPath and repoIndexedAt replaced in both the payload intent and the executor intent, startedAtMs reset, no parker path left, for stages awaiting_plan, awaiting_llm_step and awaiting_synthesize`, `inferStageWorkflow: Epic without HLD, Story with no LLD, with an LLD and no PLAN (plan), with both (complete)`, `snapshotUpstream: the artifacts each workflow reads, a missing revision reading as 0`, `describeOutcome appends the park command only for held-by-other with offerPark true`, `teamGate sets offerPark only on held-by-other and only through a registered provider; a throwing provider counts as false`, `state store: encodeState keeps meta beside the payload, reencodeState and replaceState carry it, listStates is newest-first and does not touch expiry`
  - Fixtures: `Injected gate dependencies (_setGateDepsForTests)`, `_clearWorkflowStateStoreForTests`
- **integration** — The park and resume flows against real temporary git repositories (a bare origin and two clones at different absolute paths) with a faked tracker port
  - Subjects: `handleStart records the acting user and the upstream snapshot on the stored run, and the plan and step turns keep them; a repo without a policy records neither and makes no tracker call`, `parkDraft from a refused holder to a pushed branch, a checkpoint and one issue note through issueOps.comment, leaving the checked-out branch, index and working tree unchanged`, `reassignment before the plan: a run parked at awaiting_plan resumes on the second clone and returns the emit_plan turn`, `a run parked mid-steps resumes on the second clone at nextStepIndex with its earlier step outputs, rebound to that clone`, `a daemon restart leaves a draft-only checkpoint; resume restores the draft and returns restart with draftRestored, and a restore that fails part way leaves the working tree as it was`, `resumeStage refuses an unregistered receiving path and a clone of a different repository before restoring anything`, `a Story whose LLD is committed and whose PLAN is not resumes as plan, and a Story with both committed returns nothing-to-resume`, `resumeStage with no branch returns restart naming the stage to start fresh`, `park and resume error paths: supplied token of another unit, actor or no owner, push rejected, comment fails, unknown schema, upstream revision moved (including revision 0 on both sides), dirty target files, network failure versus missing branch`, `the workflow-step park and resume phases and the team.park and team.resume daemon operations reach the run store and return the next turn`, `the terminal team park and team resume commands parse the unit and --workflow, print the outcome or the holder, and print the usage line for bad arguments`
  - Fixtures: `Temporary repo plus bare origin plus a second clone at another absolute path`, `Fake TrackerPort with whoAmI, readAssignee and issueOps.comment`, `Seeded DEF, HLD, LLD and PLAN artifacts with and without meta.revision`, `A fake repo registry (listRepos)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac25` | `src/workflow/team/__tests__/park-offer.test.ts: a held-by-other refusal carries offerPark when the actor owns a live run in any stage or has an uncommitted draft for the unit, never for an unowned run, and the refusal text names the park command`, `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts: handleStart records the acting user and the upstream snapshot on the stored run, plan and step turns keep them, and a repo without a policy records neither`, `src/cli/__tests__/team-park-resume.test.ts: team park and team resume print the offer, the outcome or the holder, and the usage line for bad arguments`, `src/daemon/steps/workflow-step/__tests__/handoff-phases.test.ts: the park and resume phases and the team.park and team.resume operations reach the run store` |
| `ac26` | `src/workflow/team/__tests__/handoff-park.test.ts: parking commits the draft and checkpoint to the handoff branch, pushes it, notes the branch on the issue through issueOps.comment and leaves the user's branch, index and working tree untouched` |
| `ac27` | `src/workflow/team/__tests__/handoff-resume.test.ts: a new assignee on a clone at another absolute path resumes a run parked before the plan, and one parked mid-steps at its next step with its earlier step outputs, rebound to that clone after the registration and repository checks` |
| `ac28` | `src/workflow/team/__tests__/handoff-resume.test.ts: after a lost machine with no parked branch, or with only a draft-only checkpoint, resume restarts only the stage that has no artifact on the committed upstream artifacts, treats a committed LLD as leaving the plan to do, and never offers to redo a committed stage` |

## 7. Alternatives considered

### 7.1 a1: Park-time checkpoint (run or draft-only) on a handoff branch, delivered through daemon-hosted park and resume — **CHOSEN**

Parking writes a run checkpoint or a draft-only checkpoint, with the draft artifacts, to a handoff branch, pushes it and notes it on the issue; resume validates the registration and repository identity, restores it on the new owner's daemon, rebound to that clone.

A handoff module under src/workflow/team owns two checkpoint variants written to .insrc/handoff/<unit-key>.json: a run checkpoint (the run's complete state at stage awaiting_plan, awaiting_llm_step or awaiting_synthesize, plus the owner, the upstream revisions captured when the run was created, and the repository identity) and a draft-only checkpoint (artifact files and identity, no run). The state store entry gains an owner and an upstream snapshot, set in handleStart through encodeState and carried through reencodeState and replaceState, and a listing function. Park commits through a temporary worktree so the user's checkout never changes, pushes, and adds one note through port.issueOps.comment. Resume takes the unit and, optionally, the workflow (inferred from the artifact chain when absent); it checks the repo is registered and is the checkpoint's repository, fetches the deterministic branch, validates the checkpoint, compares the stored upstream snapshot with current revisions, restores the files (rolling them back on failure), rebinds both intents, saves the run and returns the next turn (emit_plan, emit_step or emit_synthesize). With no branch, or a draft-only checkpoint, it returns restart (with the draft restored for draft-only). Park and resume are two new phases of insrc_workflow_step and two daemon RPC operations used by the terminal's team park and team resume.

### 7.2 a2: Artifacts-only park, restart the stage on resume

Parking commits whatever artifact files exist and notes the branch; resuming always restarts the stage from its first step with the parked draft as context.

Park commits the unit's draft artifact files to the handoff branch, pushes, and comments the branch on the issue. No run state is stored, so there is no ownership capture, snapshot, checkpoint schema or rebinding. Resume restores the files and starts the stage again from step one.

**Rejected because:** Smallest, but it violates ac27 for the common mid-run case, which is the point of the Story.

### 7.3 a3: Continuous checkpoint to a per-unit handoff branch

Every completed step of a claimed unit commits and pushes its checkpoint, so a lost machine loses at most one step.

Extend a1 so each completed step writes the checkpoint and draft artifacts to the handoff branch through a managed second worktree, pushing in the background with a short deadline. Parking then only adds the note and a final push.

**Rejected because:** Meets ac28 at step level, which the user decided is not needed (docs/plans/team-workflow.md, s6 decision on ac28), at the cost of a commit and push on every step of every team run.

## 8. References

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md`
- **[[c3]]** `doc` `docs/plans/team-workflow.md`
- **[[c4]]** `code` `src/workflow/team/gate.ts:34`
- **[[c5]]** `code` `src/daemon/steps/workflow-step/state-store.ts:28-90`
- **[[c6]]** `code` `src/daemon/steps/workflow-step/phases/start.ts:108`
- **[[c7]]** `code` `src/workflow/types.ts:216-228`
- **[[c8]]** `code` `src/workflow/team/git.ts:16-33`
- **[[c9]]** `code` `src/workflow/tracker/port.ts:55-70`
- **[[c10]]** `code` `src/workflow/storage.ts:102-110`
- **[[c11]]** `code` `src/db/repos.ts:214`
- **[[c12]]** `code` `src/config/repo-fields.ts:77-87`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 0 could not be verified · 8 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-18T15:57:46.910Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | HIGH | snapshotUpstream's listed artifacts cover the inputs consumed by plan and design.story. | readPlanUpstream reads 'requireApprovedLld', 'requireApprovedHld' and 'requireApprovedEpic', returning both HLD context and Define dependency edges. The design snapshots only LLD for plan. Furthermore, requireApprovedHld returns getEffectiveHld, which applies approved amendments while retaining base metadata. Comparing only the base HLD revision misses changes to the effective HLD used by design.story. [files: src/workflow/gates.ts, src/workflow/amendments/effective.ts, src/workflow/runners/plan/index.ts, src/workflow/runners/design-story/index.ts] | Snapshot all actual upstream inputs, including Define and effective HLD state for Epic-scoped plans and approved amendment state for HLD consumers. Preserve the standalone exception. |
| change-sites | HIGH | The listed change sites are sufficient to expose park and resume to MCP clients. | src/mcp/server.ts independently validates phase with 'z.enum([start, plan, step, synthesize, resolve_question, review_deferred])'. The design's change-site inventory omits this registration and the workflow-step input/output types. Adding daemon handlers alone leaves park and resume rejected at the MCP boundary. [files: src/mcp/server.ts, src/daemon/steps/workflow-step/types.ts, src/daemon/steps/workflow-step/handler.ts, src/mcp/__tests__/schema-registry.test.ts, src/mcp/__tests__/fixtures/tool-surface.golden.json] | Include the MCP registration, workflow-step input/output unions, dispatcher, schema-registry expectations and tool-surface fixture in the implementation inventory. |

#### Could not verify (does not block)

_None._
