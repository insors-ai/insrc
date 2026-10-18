<!-- insrc:artifact LLD-315d510cb28100e2-s6 -->

# LLD: E20261018315d510c:S006

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `2ed0cef29a4f...`

When a stage is reassigned in the tracker, the previous owner's next changing action is refused as today and now also offers to park: the draft artifacts and a checkpoint of the run (plan, step outputs, next step) are committed to a handoff branch named from the repo's branch pattern, pushed, and noted on the stage's issue. The new assignee resumes with one command: the daemon fetches the branch, restores the files and rebuilds the run on their machine, continuing at the next unfinished step. If no checkpoint exists, for instance after a lost machine, resume rebuilds from the committed artifact files and restarts only the stage that has no artifact.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

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

**Returns:** `GateOutcome` — Unchanged, except that held-by-other carries offerPark true when a registered park-offer provider says the actor has unparked work for the unit

**Errors:**
- `none` when Never throws; a provider that throws counts as false

**Preconditions:**
- A park-offer provider may be registered; none registered means offerPark false

**Postconditions:**
- offerPark is true only on held-by-other, never on other outcomes
- A repo with no policy makes no provider call and no tracker call (k4)

### 2.2 `parkDraft`

```typescript
parkDraft(repo: string, unit: UnitRef, opts?: { runToken?: string }): Promise<ParkResult>
```

**Parameters:**
- `repo: string` — Repository path
- `unit: UnitRef` — The stage unit being handed over
- `opts.runToken: string` _(optional)_ — State token of the live run to checkpoint; when omitted the daemon's store is searched for the actor's run on this unit

**Returns:** `ParkResult` — { ok: true, branch, commit, noted } or { ok: false, reason } with the reason naming the first step that failed

**Errors:**
- `ParkResult ok:false` when The actor is the current holder, the working tree has unrelated changes under the unit's paths, git fails, the push is rejected, or the branch pattern is invalid

**Preconditions:**
- The tracker shows someone else as holder of the unit (parking while holding is refused)
- The acting user has a live run or a draft artifact for the unit

**Postconditions:**
- The handoff branch holds the unit's draft artifacts and .insrc/handoff/<unit-key>.json and is pushed
- One comment on the unit's issue names the branch and commit; a failed comment is reported in noted:false and does not undo the push
- The user's checked-out branch and index are unchanged

### 2.3 `resumeStage`

```typescript
resumeStage(repo: string, unit: UnitRef): Promise<ResumeResult>
```

**Parameters:**
- `repo: string` — Repository path
- `unit: UnitRef` — The stage unit being taken over

**Returns:** `ResumeResult` — { kind: 'resumed', state, next } when a checkpoint was restored into the daemon's store; { kind: 'restart', workflow, params, reason } when only committed artifacts exist; { kind: 'nothing-to-resume', reason } when the stage's artifact is complete; or { kind: 'refused', reason }

**Errors:**
- `TeamGateRefusedError` when The actor does not hold the unit (the author gate, which also claims an unassigned unit)
- `ResumeResult refused` when Checkpoint schema version unknown, unit mismatch, restore would overwrite uncommitted local changes to the same files, or the fetch fails

**Preconditions:**
- The actor holds or can claim the unit through the author gate

**Postconditions:**
- On resumed: the draft artifacts from the branch are in the working tree and the run state is saved under a new token whose stage and nextStepIndex equal the checkpoint's
- Nothing outside the unit's own paths and the daemon's store is written

### 2.4 `handoffBranchName`

```typescript
handoffBranchName(pattern: string | undefined, unit: UnitRef, slug: string): { ok: true; name: string } | { ok: false; reason: string }
```

**Parameters:**
- `pattern: string` _(optional)_ — The repo's branchPattern, or undefined for the default
- `unit: UnitRef` — The stage unit
- `slug: string` — Epic slug for {slug}

**Returns:** `{ ok: true; name: string } | { ok: false; reason: string }` — The branch name with {id} {slug} {type} filled in and checked against the grammar

**Errors:**
- `reason` when The filled name breaks the grammar (length, characters, slashes, '..', '.lock')

**Postconditions:**
- The name is deterministic for a unit, so a second park lands on the same branch and resume needs no tracker read to find it

### 2.5 `listLiveRuns`

```typescript
listLiveRuns(unit: UnitRef): readonly { token: string; payload: WorkflowStepStatePayload }[]
```

**Parameters:**
- `unit: UnitRef` — The stage unit

**Returns:** `readonly { token: string; payload: WorkflowStepStatePayload }[]` — The runs in the daemon's state store whose intent maps to the unit, newest first

**Postconditions:**
- Does not touch the entries' expiry

## 3. Data model changes

### 3.1 `HandoffCheckpoint` — new

Written to .insrc/handoff/<unit-key>.json on the handoff branch only. Fields: schemaVersion (1), unit (UnitRef without repoPath), parkedBy, parkedAt, sourceHead (commit the parker was on), stage (WorkflowStepStage), runId, epicKey, intent (workflow, focus, params), executor (ExecutorState: plan, nextStepIndex, stepOutputs, pause) when stage is awaiting_llm_step, stepOutputs when awaiting_synthesize, artifactPaths (repo-relative files parked with it). Restoring it never trusts paths: each must be a file under the unit's own artifact paths.

**Call sites:**
- `src/daemon/steps/workflow-step/state.ts`
- `src/workflow/types.ts:216-228`

### 3.2 `GateOutcome.held-by-other.offerPark` — invariant-change

offerPark was always false. It is now true when the registered park-offer provider returns true for (repo, unit, actor). The type is unchanged.

**Call sites:**
- `src/workflow/team/gate.ts:34`
- `src/workflow/team/gate.ts:228`
- `src/workflow/team/gate.ts:264`

### 3.3 `describeOutcome` — invariant-change

A held-by-other outcome with offerPark true appends the park command to the reason, so every client that prints the refusal also prints the offer.

**Call sites:**
- `src/workflow/team/gate.ts:62-69`
- `src/daemon/steps/workflow-step/handler.ts:75`
- `src/cli/command.ts:244`

### 3.4 `branchPattern row grammar` — field-modify

The row in the shared settings catalog gains a default (insrc/handoff/{type}-{id}) and loses its not-used-yet note; the grammar's placeholders stay id, slug, type. The validator and the settings clients pick the change up from the one row (k6).

**Call sites:**
- `src/config/repo-fields.ts:77-87`
- `src/workflow/config/github.ts:95`

### 3.5 `Issue handoff note` — new

One comment body: a marker line '<!-- insrc:handoff -->', the branch name, the checkpoint commit, who parked and the stage. Posted through the port's comment capability; nothing reads it back.

**Call sites:**
- `src/workflow/tracker/port.ts:59`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | consumes | Reads GateOutcome and TeamGateRefusedError unchanged. resumeStage asks teamGate with action 'author' (which claims an unassigned unit through the add-only assignment). parkDraft reads the holder through the same gate read and refuses when the actor holds the unit. The only addition to sc4 is registerParkOfferProvider, proposed as an amendment, so offerPark can be set without a cycle. |

## 5. Error paths

**Error cases**

- **Park is requested while the actor holds the unit** (recoverable)
  - Detection: parkDraft reads the holder through the gate and finds the actor's own login
  - Response: Return ok:false with 'you hold this stage; there is nothing to hand over'. Nothing is written
  - User impact: A clear refusal instead of a branch for work the user still owns
- **The unit has no issue or no holder (nobody to hand over to)** (recoverable)
  - Detection: The gate outcome for the read is no-issue or the holder is null
  - Response: Return ok:false naming the reason; an unassigned unit is claimed and continued, not parked
  - User impact: The user is told to claim rather than park
- **Nothing to park: no live run and no draft artifact for the unit** (recoverable)
  - Detection: listLiveRuns returns empty and the unit's artifact paths are absent or unchanged from HEAD
  - Response: Return ok:false 'no draft or run to hand over'
  - User impact: No empty branch is created
- **Branch name breaks the grammar after filling placeholders** (recoverable)
  - Detection: handoffBranchName validates against the branchPattern row grammar
  - Response: Return ok:false with the grammar rule broken; no git command runs
  - User impact: The user fixes the pattern in settings
- **Git fails while parking (not a repository, detached HEAD, hook rejects the commit, push rejected, remote unreachable)** (recoverable)
  - Detection: runGit returns ok:false for the failing step
  - Response: Stop at that step, remove the local handoff branch and temporary worktree it created, keep the live run state untouched, and report the git message with the step name. A rejected push because the branch moved reports that someone else parked first
  - User impact: The draft is not lost: the run stays in the daemon and the working files stay where they are
- **The issue note cannot be posted** (recoverable)
  - Detection: port.comment returns ok:false
  - Response: Keep the pushed branch, return ok:true with noted:false and the failure kind, and print the branch name so the user can tell the new owner
  - User impact: Handoff works but the issue lacks the pointer until the user retries or says it
- **Resume finds a checkpoint with an unknown schemaVersion, a unit that does not match, or a path outside the unit's artifact paths** (recoverable)
  - Detection: Parsing and validating the checkpoint before anything is written
  - Response: Return refused with the specific field; no file is restored and no run state is saved
  - User impact: The new owner is told the checkpoint is unusable and may restart the stage from the committed artifacts
- **Resume would overwrite uncommitted local changes to the same artifact files** (recoverable)
  - Detection: git status --porcelain on the files to restore is non-empty
  - Response: Return refused naming the files; nothing is touched
  - User impact: The new owner commits or stashes first
- **Resume cannot fetch the handoff branch** (recoverable)
  - Detection: git fetch of the deterministic branch name fails
  - Response: Distinguish a missing branch (no checkpoint: fall back to restart from committed artifacts) from a network or permission failure (refused with the git message)
  - User impact: A lost-machine takeover works without the branch; a network failure is not mistaken for a missing branch
- **Restoring a checkpoint whose upstream artifacts changed since it was parked** (recoverable)
  - Detection: Compare the upstream artifact revisions recorded at park time with the current files
  - Response: Return refused with 'the upstream moved since this draft was parked' and the restart option, because step outputs were computed against older input
  - User impact: The new owner redoes the stage on current input instead of resuming a stale one

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The same unit is parked twice (the second owner is reassigned too) | The deterministic branch name is reused and the new checkpoint is committed on top; a non-fast-forward push is reported as someone else having parked first |
| A stage parked after synthesize (draft artifact written, no run left) | The checkpoint stage is awaiting_synthesize or absent; with only the artifact the resume returns nothing-to-resume or restart as the artifact state dictates |
| Two live runs for the same unit in the actor's daemon | Park checkpoints the most recently touched run and names the run id in the note; the other is left alone |
| The daemon restarted after the user was reassigned, so the run state is gone | offerPark is still true when the draft artifact has uncommitted changes; park commits the artifact and writes a checkpoint with stage absent, so the resume restarts the stage with the draft as context |
| Resume on a repo with no policy or with claims not enforced | Refused as 'this repository does not enforce claims'; k4 behaviour is unchanged |
| Resume when the stage's own artifact is already committed and complete | nothing-to-resume with the artifact id, so nobody re-authors a finished stage by accident |
| A branch pattern that renders the same name for two different units | The default pattern includes the unit key; for a custom pattern that omits {id}, parkDraft refuses with 'the pattern does not identify the unit' |

## 6. Test strategy

**Test framework:** `node:test via npx tsx --test, tests co-located in __tests__ directories`

**Test levels**

- **unit** — Pure logic with no git, tracker or daemon store
  - Subjects: `handoffBranchName: placeholder filling, default pattern, grammar rejection, a pattern that omits {id}`, `HandoffCheckpoint parse and validate: schema version, unit match, path containment`, `describeOutcome appends the park command only for held-by-other with offerPark true`, `teamGate sets offerPark only on held-by-other and only through a registered provider; a throwing provider counts as false`
  - Fixtures: `Injected gate dependencies (_setGateDepsForTests)`
- **integration** — The park and resume flows against a real temporary git repository with a bare remote and a faked tracker port
  - Subjects: `parkDraft from a refused holder to a pushed branch, a checkpoint file and one issue comment, leaving the checked-out branch and index unchanged`, `resumeStage on a second clone restores the draft and saves a run state that continues at nextStepIndex`, `resumeStage with no branch rebuilds from committed artifacts and returns restart naming the first stage without an artifact`, `park and resume error paths: push rejected, comment fails, unknown schema, stale upstream, dirty target files, network failure versus missing branch`, `workflow-step handler returns the offer in the refusal message; the terminal prints it`
  - Fixtures: `Temporary repo plus bare origin plus second clone`, `Fake TrackerPort with whoAmI, readAssignee, comment`, `Seeded DEF, HLD, LLD and PLAN artifacts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac25` | `src/workflow/team/__tests__/park-offer.test.ts: a held-by-other refusal carries offerPark when the actor has a live run or an uncommitted draft for the unit, and the refusal text names the park command`, `src/cli/__tests__/team-park-resume.test.ts: team park and team resume print the offer, the outcome and the usage line` |
| `ac26` | `src/workflow/team/__tests__/handoff-park.test.ts: parking commits the draft and checkpoint to the handoff branch, pushes it, notes the branch on the issue and leaves the user's branch untouched` |
| `ac27` | `src/workflow/team/__tests__/handoff-resume.test.ts: a new assignee on another clone resumes the parked run at its next step with its earlier step outputs` |
| `ac28` | `src/workflow/team/__tests__/handoff-resume.test.ts: with no checkpoint, resume rebuilds from the committed artifacts and restarts only the stage that has no artifact` |

## 7. Alternatives considered

### 7.1 a1: Park-time checkpoint on a handoff branch — **CHOSEN**

Parking writes the run's executor state to a checkpoint file, commits it with the draft artifacts to a handoff branch, pushes it, and notes it on the issue; resuming loads the checkpoint into a fresh run.

Add a handoff module under src/workflow/team that owns a HandoffCheckpoint record written to .insrc/handoff/<unit-key>.json. Park names the branch from branchPattern, creates it from the current HEAD, writes the checkpoint and the unit's draft artifacts, commits, pushes, and adds one comment to the unit's issue naming the branch and the checkpoint commit. The gate sets offerPark true on held-by-other when the acting user has a live run for the unit or an uncommitted draft artifact for it. Resume fetches the branch, validates the checkpoint, saves its executor state into the daemon's store and returns the next step turn. With no checkpoint, resume falls back to the committed artifacts alone.

### 7.2 a2: Artifacts-only park, restart the stage on resume

Parking commits whatever artifact files exist and notes the branch; resuming always restarts the stage from its first step, seeded with the parked draft as context.

Park commits the unit's draft artifact files to the handoff branch, pushes, and comments the branch on the issue. No executor state is stored. Resume checks out the files and starts the stage again from step one with the existing artifact as the starting draft.

**Rejected because:** Smallest, but it violates ac27 for the common mid-run case, which is the point of the Story.

### 7.3 a3: Continuous checkpoint to a per-unit handoff branch

Every completed step of a claimed unit writes the checkpoint and pushes it to the unit's handoff branch, so parking is only a note and a lost machine loses at most one step.

Extend a1 so the workflow-step phases, after each step output is stored, write the checkpoint file and the draft artifacts and commit them to a dedicated handoff branch through a separate worktree, pushing in the background with a short deadline. Parking then adds the issue note and a final push.

**Rejected because:** Strongest on ac28, but it commits and pushes on every step of every team run and needs a managed worktree and branch rights for all developers, beyond this Story's boundary.

## 8. References

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md`
- **[[c3]]** `code` `src/workflow/team/gate.ts:34`
- **[[c4]]** `code` `src/daemon/steps/workflow-step/state-store.ts:28-60`
- **[[c5]]** `code` `src/workflow/types.ts:216-228`
- **[[c6]]** `code` `src/workflow/team/git.ts:16-33`
- **[[c7]]** `code` `src/workflow/tracker/port.ts:59`
- **[[c8]]** `code` `src/config/repo-fields.ts:77-87`

## 9. Open questions

- ac28 says the new assignee 'redoes only the unfinished step'. Committed artifact files exist only per finished stage, so after a lost machine a half-run stage restarts from its first step (completed stages are never redone). Accept stage-level redo, or adopt continuous checkpointing (a3), which commits and pushes on every step of every team run?
- sbdry check dm1 (partial): callSites gate.ts:62-69 and src/cli/command.ts:244 were read during discovery but are not cited by an s1 analyze bundle.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**7 do not hold · 0 could not be verified · 2 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-18T15:44:38.727Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | HIGH | The artifact-only fallback satisfies ac28. | DEF ac28 requires 'redo only the unfinished step'. The design instead restarts the whole unfinished stage and leaves acceptance of that change open. state-store.ts keeps progress in 'const store = new Map<string, Entry>()'; synthesize.ts writes artifacts only after execution completes. Committed artifacts therefore cannot recover earlier completed steps within the lost run. [files: docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md, src/daemon/steps/workflow-step/state-store.ts, src/daemon/steps/workflow-step/phases/synthesize.ts] | Resolve the upstream acceptance criterion explicitly before approval, or design durable progress sufficient to meet its existing wording. |
| new-versus-reuse | HIGH | The reused tracker port exposes port.comment and a comment capability. | TrackerPort exposes 'readonly issueOps: IssueOps'; comment is declared on IssueOps as 'comment(issue: IssueRef, body: string): PortResult<void>'. Capability is 'claim' \| 'issue-create' \| 'signoff-request' \| 'completion', with no comment member. The proposed error handling and fake TrackerPort use the wrong shape. [files: src/workflow/tracker/port.ts] | Use port.issueOps.comment and document the existing capability requirements; update fixtures accordingly. |
| change-sites | HIGH | The inventory is sufficient to expose park/resume commands that operate on the daemon's run store. | runTeam handles claim/release, init and refresh only. services/team.ts invokes claim/release directly in the CLI process. The workflow store is a module-local Map in the daemon. The design names command tests but specifies no command arguments, service additions, daemon RPC endpoints or registration that would reach that Map. [files: src/cli/command.ts, src/cli/services/team.ts, src/cli/services/index.ts, src/daemon/index.ts, src/daemon/steps/workflow-step/state-store.ts] | Specify the CLI-to-daemon request/response contracts, command parsing, service interface changes and daemon handlers, including delivery of the resumed workflow turn. |
| data-compatibility | HIGH | The specified checkpoint can restore an executable run on another machine. | ExecutorState contains 'readonly intent: WorkflowIntent', including an absolute repoPath and repoIndexedAt, beyond the four executor fields listed in the design. resumeRun uses 'intent: state.intent' to construct runner context; design-story runners read upstream artifacts through ctx.intent.repoPath. WorkflowStepStatePayload additionally requires version and startedAtMs. The design specifies neither reconstruction of omitted fields nor rebinding the nested executor intent to the receiving clone. [files: src/workflow/types.ts, src/workflow/executor.ts, src/workflow/runners/design-story/index.ts, src/daemon/steps/workflow-step/state.ts, src/daemon/steps/workflow-step/phases/step.ts] | Define a complete checkpoint-to-payload conversion, rebind both intents to the receiving repository, establish local timestamp/index-watermark semantics, and test clones at different absolute paths. |
| data-compatibility | HIGH | The existing store can identify the actor's most recently touched run using the proposed data model. | Entry records payload, createdAt and touchedAt; WorkflowStepStatePayload and WorkflowIntent contain no acting-user identity. listLiveRuns(unit) can filter by intent and sort by touchedAt, but cannot establish the promised actor ownership. parkedBy records the parker, not who authored the selected run. [files: src/daemon/steps/workflow-step/state-store.ts, src/daemon/steps/workflow-step/state.ts, src/workflow/types.ts] | Specify run ownership capture and filtering, plus safe behavior for existing runs without ownership metadata and supplied tokens belonging to another unit or actor. |
| error-paths | HIGH | The proposed checkpoint supports the promised stale-upstream detection. | The error path requires comparing upstream revisions 'recorded at park time', but HandoffCheckpoint lists no upstream revision bindings. Existing ExecutorState and WorkflowStepStatePayload have none either. design-story readUpstream reads both approved Epic and HLD; the HLD explicitly says missing meta.revision means revision 0. sourceHead alone does not record the working-tree revisions used by the run. [files: src/workflow/types.ts, src/daemon/steps/workflow-step/state.ts, src/workflow/runners/design-story/index.ts, docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md] | Add explicit upstream artifact identities and revision bindings, define legacy revision-0 handling, and capture the inputs actually used by the run. |
| tests | MED | The acceptance mapping proves every upstream criterion as written. | The proposed ac28 test checks 'restarts only the stage that has no artifact', whereas DEF requires 'redo only the unfinished step'. The in-memory store and synthesize-only artifact write confirm these are different behaviors. The proposed assertion could pass while repeating completed steps. [files: docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md, src/daemon/steps/workflow-step/state-store.ts, src/daemon/steps/workflow-step/phases/synthesize.ts] | After resolving ac28, align its test with the accepted wording and include a lost run with at least one completed step and one unfinished step. |

#### Could not verify (does not block)

_None._
