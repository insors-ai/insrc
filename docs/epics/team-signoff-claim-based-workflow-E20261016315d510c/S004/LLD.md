<!-- insrc:artifact LLD-315d510cb28100e2-s4 -->

# LLD: E20261018315d510c:S004

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `3738518e4be6...`

In team mode, when the first draft of a Define, a Story's LLD or a plan is written, the daemon makes sure each unit of work has one tracker issue: the Epic on the Define, the Story on its LLD, and one issue per build Task on the plan, whatever the local Task-issue setting says. Each unit is first resolved from local records with no tracker call; only an unresolved unit loads the tracker, where ensureUnitIssue(unit, port) looks for a stable per-unit label before it creates the issue, records it at once, and then lists every issue carrying that label and keeps the lowest number, which is the uniqueness the owner accepted and recorded in docs/plans/team-workflow.md. A repo without the policy keeps today's behaviour through an explicit legacy mode. A failed create is reported as unconfirmed and the author is told through every result type up to the workflow.run frame. The approve-time comments and Epic task-list entry run step by step, each with its own completion mark. One write helper adds an optional meta.revision on content writes, including the code-review and TESTS records, keeps the whole tracker block when a draft is replaced, and a test fails when any code writes an artifact around it.

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

**Rollout phase:** Phase B — settings and issue readiness
**Owns:** `sc3` (Per-unit tracker record and revision)
**Consumes:** `sc1` (TrackerPort and PortResult), `sc2` (TeamPolicy)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-s1 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ensureUnitIssue`

```typescript
(unit: UnitRef, port: TrackerPort) => PortResult<IssueRef>
```

**Parameters:**
- `unit: UnitRef` — Which unit needs an issue: { unit: 'epic' | 'story' | 'task', repoPath, epicHash, storyId?, taskId? }. repoPath lets the function find the Define, LLD or plan and the github config itself.
- `port: TrackerPort` — The sc1 port for the repo's tracker; only findIssue, findIssues and issueOps are used.

**Returns:** `PortResult<IssueRef>` — The unit's issue, found or created, in team mode. This is the HLD's EnsureIssue exactly, so s5, s7 and s8 consume sc3 unchanged. A failure carries the sc1 kind and reason; the creation phase is not part of this public type.

**Errors:**
- `PortResult ok:false, kind unreachable | missing-tool | missing-signin | rejected` when Local resolution missed and then the lookup, a label creation, the create call or reading the unit's artifact failed. A failed lookup is returned as this failure and never read as 'no issue found'.

**Preconditions:**
- The unit's artifact is on disk (the Define for an Epic, the LLD for a Story, the plan for a Task).
- The caller has decided the unit needs an issue (team mode, or the team-mode approve fallback).

**Postconditions:**
- Thin wrapper over ensureUnitIssueDetailed in mode 'team' that returns only the issue and drops the phase.
- Calling it again for the same unit, from any entry point, returns the same issue and creates nothing, subject to the amended uniqueness wording recorded in docs/plans/team-workflow.md#known-limitations.

### 2.2 `ensureUnitIssueDetailed`

```typescript
(unit: UnitRef, port: TrackerPort, deps?: EnsureIssueDeps) => EnsureResult<EnsuredIssue>
```

**Parameters:**
- `unit: UnitRef` — As for ensureUnitIssue.
- `port: TrackerPort` — The sc1 port.
- `deps: EnsureIssueDeps` _(optional)_ — Mode and test seams: mode ('team' by default, or 'legacy'), readConfig (default resolveGithubConfig) and now.

**Returns:** `EnsureResult<EnsuredIssue>` — A module-local union: { ok: true, value: { issue: IssueRef, created: boolean, duplicateCheck: 'clean' | 'adopted-other' | 'not-run' } } or { ok: false, reason: string, kind: PortFailureKind, phase: 'before-create' | 'create' }. It is not PortResult, because the sc1 failure branch has no phase.

**Errors:**
- `EnsureResult ok:false, kind unreachable | missing-tool | missing-signin | rejected, phase before-create | create` when Team mode only. Phase before-create: the unit's artifact cannot be read, the lookup fails, a label cannot be created or an id cannot form a label; nothing was created. Phase create: the create call failed or timed out; the issue may or may not exist. Once the create call has succeeded this function never returns ok:false.

**Preconditions:**
- Module-internal: called by tracker-auto.ts, ensureDraftIssues and tests; not part of the shared sc3 surface.

**Postconditions:**
- Team mode, step 1: resolveUnitIssueLocal(unit); a hit is returned with created false and no tracker call.
- Team mode, step 2, on a local miss: findIssue([epic membership label, per-unit label]); for the Epic only, then the old findIssue([epic label, membership label]). A hit is recorded and returned with created false. A failed lookup returns ok:false (phase before-create) and creates nothing.
- Team mode, step 3, only when every lookup missed: ensure the labels (a failure returns phase before-create), create through issueOps.create with the kind label, the epic membership label and the per-unit label, and link a Story or Task as a sub-issue of its parent (a link failure is logged and does not fail the call). A failure of the create call returns phase create and is never described as proof that no issue exists.
- Team mode, step 4: the created ref is recorded at once in meta.tracker.units and the legacy refs through patchTrackerMeta; if recording fails the issue is still returned and the per-unit label finds it next time.
- Team mode, step 5, best effort after recording: port.findIssues([per-unit label]) lists every issue carrying the label in ascending numeric order. If the first is not this call's own issue, the call adopts that lowest-numbered issue, records it in place of its own, comments on its own issue naming the adopted one and closes it as a duplicate, and logs the pair (duplicateCheck adopted-other). Every daemon applies the same rule, so two daemons that each created before the other's issue existed converge once either re-checks after both exist. If the listing fails the created issue is kept, a warning is logged, and the call returns ok with created true and duplicateCheck not-run.
- Retry after a create-phase failure: the next call runs step 1 and step 2 before any create, so an issue that was committed but not reported is adopted by its per-unit label.
- Legacy mode keeps today's approve-time code path exactly: the adoption lookup failing falls through to a create, label failures are best-effort, no per-unit label is added, no post-create lookup runs, no units record is written, and the same gh command sequence and tracker block result.
- Residual race, accepted by the owner and recorded in docs/plans/team-workflow.md#known-limitations (accepted 2026-10-18): if each daemon's duplicate check ran before the other's issue existed, two issues remain until a person closes one. The design satisfies DEF S004:FR001 as amended there.

### 2.3 `resolveUnitIssueLocal`

```typescript
(unit: UnitRef) => IssueRef | null
```

**Parameters:**
- `unit: UnitRef` — The unit to resolve from local artifacts only.

**Returns:** `IssueRef | null` — The unit's issue if any local record or legacy ref names it, otherwise null. Makes no tracker call and never throws: an unreadable artifact reads as null.

**Postconditions:**
- Epic order: Define meta.tracker.units, Define meta.tracker.epicRef, then the HLD's meta.tracker.epicRef.
- Story order: the LLD's meta.tracker.units, the LLD's own meta.tracker.storyRef, then the Define's meta.tracker.storyRefs entry for the story id (lower-cased).
- Task order: the plan's meta.tracker.units, then the plan's meta.tracker.taskRefs entry for the task id.
- Team mode only: on a hit it reconciles locally through patchTrackerMeta (meta-only): the missing units record and the missing sibling refs are written. A reconcile write failure is logged and does not change the result.
- A legacy LLD-only storyRef with no units and no unit label resolves here, so no second issue is created.

### 2.4 `runUnitExtras`

```typescript
(unit: UnitRef, ops: IssueOps, steps: readonly ExtraStep[]) => ExtrasOutcome
```

**Parameters:**
- `unit: UnitRef` — The unit whose approve-time extras are run; the record lives in the unit's artifact.
- `ops: IssueOps` — The sc1 issueOps (comment, readBody, writeBody, ensureMilestone, attachMilestone).
- `steps: readonly ExtraStep[]` — The extras that apply to the unit, each { name: 'milestone' | 'taskList' | 'designComment' | 'reviewComment', run: () => PortResult<void> }: the Epic gets milestone and the HLD summary comment, a Story gets taskList (the Epic task-list splice), designComment and reviewComment, a Task gets its body comment.

**Returns:** `ExtrasOutcome` — { done: string[], skipped: string[], failed: { name: string, reason: string }[] }. A partial result is a normal outcome, not an exception.

**Preconditions:**
- Team mode only. Legacy mode never calls it and keeps bestEffort.

**Postconditions:**
- Each step runs on its own and returns success or failure; none goes through bestEffort, so a failure is seen and not swallowed.
- A step whose name already has a timestamp in the unit's extrasDone is skipped. After a step succeeds, its timestamp is written to extrasDone through patchTrackerMeta (meta-only) before the next step runs. A failed step is left unset, logged and reported in failed; the next approve retries only the unset steps.
- A comment is therefore posted at most once per step, except when the marker write itself fails after a successful post; that is the one residual repeat. The review comment keeps its '<!-- insrc:review -->' marker so a person can recognise it.

### 2.5 `unitLabel`

```typescript
(unit: UnitRef) => string
```

**Parameters:**
- `unit: UnitRef` — The unit to label.

**Returns:** `string` — 'insrc:unit:<epicHash>' for the Epic, 'insrc:unit:<epicHash>:<storyId>' for a Story and 'insrc:unit:<epicHash>:<storyId>:<taskId>' for a Task, ids lower-cased; at most 50 characters.

**Errors:**
- `Error` when The label would exceed the 50-character GitHub limit, or an id contains a character that is not a letter, digit, hyphen or underscore.

**Preconditions:**
- epicHash is the canonical 16-character hash.

**Postconditions:**
- Pure and deterministic: the same unit always gets the same label, so a lookup after a crash or a re-draft finds the issue.

### 2.6 `ensureDraftIssues`

```typescript
(jsonPath: string, deps?: DraftHookDeps) => IssueReadiness
```

**Parameters:**
- `jsonPath: string` — The absolute path of the artifact JSON that was just written.
- `deps: DraftHookDeps` _(optional)_ — Injected readPolicy (default policyReader), loadTracker (default the strict loader) and the ensureUnitIssueDetailed deps so tests need no network.

**Returns:** `IssueReadiness` — not-applicable (a workflow with no claim unit, or a repo whose policy is 'none' or has teamMode false), ready (each unit's issue and whether it was created) or not-ready (the failing unit, the failure kind, outcomeKnown, the reason, and the message shown to the author).

**Preconditions:**
- The artifact JSON and its markdown are already on disk.

**Postconditions:**
- Never throws: every failure becomes not-ready; the draft is never undone. It always works in team mode: it does nothing unless the policy says team mode.
- A repo with policy 'none' or teamMode false makes no tracker call (k4). A policy that cannot be read gives not-ready with kind policy-unreadable and creates nothing.
- Local-record fast path: it lists the units the artifact needs (Define: the Epic; HLD: adopts the Epic from the Define; LLD: the Epic then the Story; plan: the Story then each Task in plan order, forced on) and resolves each with resolveUnitIssueLocal. If every unit resolves locally it returns ready with no loadTracker call and no gh command.
- Only when at least one unit is unresolved does it call loadTracker(repo, {'issue-create'}) and then ensureUnitIssueDetailed for each unresolved unit in order, stopping at the first failure; resolved units are reported ready with created false.
- A not-ready result has outcomeKnown true for a failure before the create call and outcomeKnown false for a failed create (the message says readiness could not be confirmed, that the issue may or may not have been created, and why).
- A plan with no Tasks returns ready with no units and does not load the tracker.

### 2.7 `writeArtifact`

```typescript
(path: string, next: unknown, kind: WriteKind) => number
```

**Parameters:**
- `path: string` — Absolute path of the artifact JSON.
- `next: unknown` — The artifact object to write; typed unknown because it is parsed JSON of any artifact kind, and checked at run time to be an object with a meta object.
- `kind: WriteKind` — 'content' when the body, citations or anything a signoff covers changed; 'meta-only' for stamps, review stamps, tracker patches and question or finding resolutions.

**Returns:** `number` — The meta.revision now on disk (0 when the file has none). The HLD's ArtifactWriter returns void; a number is assignable where void is expected.

**Errors:**
- `TypeError` when next is not an object with a meta object; the file on disk is left as it was.

**Preconditions:**
- path is absolute (as for writeAtomic).

**Postconditions:**
- For 'content' it writes meta.revision = (revision of the file already at path, or 0) + 1, so the first draft is 1.
- For 'content' over an existing file it carries the WHOLE prior meta.tracker block into next: every legacy field and units; a key present in next wins, and units are merged key by key. Fields such as approvedAt and review are not carried.
- For 'meta-only' it leaves the revision exactly as it was on disk: it copies the on-disk revision into next, or leaves it absent when the file has none.
- The write is atomic through writeAtomic.
- Callers that restore a file's earlier bytes (the TESTS record rollback) restore its earlier revision with it, because the revision lives in those bytes.

### 2.8 `readRevision`

```typescript
(artifact: unknown) => number
```

**Parameters:**
- `artifact: unknown` — A parsed artifact object (any kind).

**Returns:** `number` — meta.revision when it is a non-negative integer, otherwise 0.

**Postconditions:**
- An artifact without meta.revision reads as revision 0; a malformed value reads as 0.

### 2.9 `appendStoryToDefine`

```typescript
(repoPath: string, epicHash: string, story: DefineStory) => DefineArtifact
```

**Parameters:**
- `repoPath: string` — Repo holding the Define.
- `epicHash: string` — The Epic whose Define is extended.
- `story: DefineStory` — The Story appended to the Define body.

**Returns:** `DefineArtifact` — Unchanged result type.

**Postconditions:**
- Existing signature kept. Its JSON write moves to writeArtifact(..., 'content') because it changes body.stories of a Define a signoff may cover. The approve, ack-stale and reject stamps in the same file stay meta-only.

### 2.10 `patchTrackerMeta`

```typescript
(jsonPath: string, patch: Readonly<Partial<TrackerMeta>>) => TrackerMeta
```

**Parameters:**
- `jsonPath: string` — Artifact JSON path.
- `patch: Readonly<Partial<TrackerMeta>>` — Fields to merge into meta.tracker; may now include units.

**Returns:** `TrackerMeta` — The merged tracker block.

**Postconditions:**
- Existing behaviour is kept for every existing field; units are merged key by key.
- It writes through writeArtifact with kind 'meta-only', so a tracker patch never changes meta.revision.

### 2.11 `autoPushEpicOnHld`

```typescript
(hldJsonPath: string) => AutoPushResult
```

**Parameters:**
- `hldJsonPath: string` — The approved HLD JSON.

**Returns:** `AutoPushResult` — Unchanged result type.

**Postconditions:**
- It reads the policy to pick the mode. Policy 'none' or teamMode false: legacy mode, today's behaviour exactly, including the HLD summary comment only when the push itself created the issue and the use of bestEffort, and the existing tracker-auto tests pass unedited. teamMode true: team mode, in which an issue created at draft time is adopted, a failed lookup is a 'failed' result instead of a new Epic, and the milestone and the HLD summary comment run through runUnitExtras. Policy ok:false: a 'failed' result.
- The signature is unchanged, so the terminal approve fallback in src/cli/services/workflow.ts is untouched.

### 2.12 `autoPushStoryOnLld`

```typescript
(lldJsonPath: string) => AutoPushResult
```

**Parameters:**
- `lldJsonPath: string` — The approved LLD JSON.

**Returns:** `AutoPushResult` — Unchanged result type.

**Postconditions:**
- Picks the mode from the policy in the same way. Legacy mode is today's behaviour exactly, including the Epic task-list splice and the design comment only inside the adopted === undefined branch. Team mode obtains the Story issue from ensureUnitIssueDetailed and runs the Epic task-list splice, the design comment and the review comment through runUnitExtras; it creates no second Story issue.

### 2.13 `autoPushTasksOnPlan`

```typescript
(planJsonPath: string) => AutoPushResult
```

**Parameters:**
- `planJsonPath: string` — The approved plan JSON.

**Returns:** `AutoPushResult` — Unchanged result type.

**Postconditions:**
- Picks the mode from the policy. Legacy mode is today's behaviour exactly, including returning 'skipped' when pushTasks is off (k4). Team mode creates Task issues whatever cfg.pushTasks says (forceTaskIssues), each through ensureUnitIssueDetailed, and posts each Task's body comment through runUnitExtras.

### 2.14 `policyReader`

```typescript
(repo: string) => PolicyResult<TeamPolicy | 'none'>
```

**Parameters:**
- `repo: string` — Repo whose policy is read.

**Returns:** `PolicyResult<TeamPolicy | 'none'>` — The sc2 reader, consumed unchanged.

**Errors:**
- `PolicyResult ok:false` when The policy could not be read.

**Postconditions:**
- Used only to decide team or legacy mode and forceTaskIssues.

### 2.15 `loadTracker`

```typescript
(repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort>
```

**Parameters:**
- `repo: string` — Repo whose tracker is loaded.
- `needed: ReadonlySet<Capability>` — Here the set {'issue-create'}.

**Returns:** `PortResult<TrackerPort>` — The sc1 strict loader, consumed unchanged.

**Errors:**
- `PortResult ok:false` when Target unresolved, capability missing, gh missing or not signed in: its kind and reason become the author's message.

**Postconditions:**
- It runs one gh call (the signed-in user) whenever it succeeds, so s4 calls it only when a unit is unresolved locally.
- Its failure is what ac18 reports as 'cannot yet be claimed: <reason>'.

### 2.16 `synthesize phase, RunWorkflowResult and the workflow.run terminal frame`

```typescript
WorkflowStepDone, RunWorkflowResult and the workflow.run done frame gain issueReadiness?: IssueReadiness and notice?: string
```

**Returns:** `two additive optional fields on three result shapes` — issueReadiness is present for a Define, HLD, LLD or plan in team mode; notice is present only when not-ready.

**Postconditions:**
- WorkflowStepDone in src/daemon/steps/workflow-step/types.ts (lines 117 to 135) gains the two optional fields; the synthesize phase in src/daemon/steps/workflow-step/phases/synthesize.ts fills them after both draft files are written and after ensureDraftIssues returns.
- RunWorkflowResult (interface at src/daemon/workflow-rpc.ts line 154) gains the two optional fields; runWorkflowServerSide runs the hook right after it writes the draft pair at lines 333 and 334 and adds the fields to the value it returns at line 352.
- runStart receives that value as out and adds the fields to the done frame it sends at line 475 when they are present.
- A repo without a policy sees no new field in any of the three places.

## 3. Data model changes

### 3.1 `UnitRef` — new

{ unit: 'epic' | 'story' | 'task'; repoPath: string; epicHash: string; storyId?: string; taskId?: string }, the argument type of the HLD's EnsureIssue. The record key derived from it is 'epic', 'story:<storyId>' or 'task:<storyId>/<taskId>'.

**Call sites:**
- `src/workflow/tracker-auto.ts:171-230`
- `src/workflow/tracker/refs.ts:24-37`

### 3.2 `UnitIssue` — new

{ unit: 'epic' | 'story' | 'task'; unitId: string; issue: IssueRef; createdAtRevision: number; extrasDone?: { milestone?: string; taskList?: string; designComment?: string; reviewComment?: string } } stored under meta.tracker.units, in team mode only. The Epic record lives on the Define, a Story record on its LLD, Task records on the plan. createdAtRevision is the revision of the artifact when the issue was recorded. extrasDone holds, per approve-time extra, the ISO time at which that extra succeeded; an absent entry means the extra still has to run. It is module-owned and independent of whether this process created the issue.

**Call sites:**
- `src/workflow/tracker-auto.ts:102-162`
- `src/workflow/tracker-auto.ts:232`
- `src/workflow/tracker/refs.ts:24-37`
- `src/daemon/steps/workflow-step/phases/synthesize.ts:82-83`

### 3.3 `TrackerMeta` — field-add

Adds optional units?: Readonly<Record<string, UnitIssue>>, written in team mode only; in legacy mode the block is exactly today's. Every existing field keeps its meaning and is still written, and a content write keeps the whole block (see writeArtifact).

```
+ readonly units?: Readonly<Record<string, UnitIssue>>;
```

**Call sites:**
- `src/workflow/tracker/refs.ts:24-37`
- `src/workflow/tracker/sync.ts:27-52`
- `src/workflow/chain.ts:208-212`
- `src/workflow/questions.ts:341`
- `src/workflow/artifacts/lld.ts:341`
- `src/workflow/orchestrator.ts:2932-2956`

### 3.4 `ArtifactMetaBase` — field-add

Adds optional revision?: number. Absent reads as 0. Minted only by writeArtifact on 'content' writes; never changed by a 'meta-only' write; never written by hand.

```
+ readonly revision?: number;
```

**Call sites:**
- `src/workflow/types.ts:299-360`
- `src/workflow/artifacts/lld.ts:192`
- `src/workflow/artifacts/plan.ts:79`
- `src/workflow/gates.ts:506`

### 3.5 `EnsureResult` — new

Module-local union { ok: true; value: T } | { ok: false; reason: string; kind: PortFailureKind; phase: 'before-create' | 'create' }, used inside ensureUnitIssueDetailed and ensureDraftIssues. It exists because the sc1 PortResult failure branch has no phase. ensureUnitIssue converts it to PortResult<IssueRef> by dropping phase.

**Call sites:**
- `src/workflow/tracker/port.ts:76`

### 3.6 `ExtrasOutcome` — new

Result of runUnitExtras: { done: string[]; skipped: string[]; failed: { name: string; reason: string }[] }. Returned to tracker-auto, which reports a partial result in AutoPushResult and logs it; never persisted.

**Call sites:**
- `src/workflow/tracker-auto.ts:363`
- `src/workflow/tracker-auto.ts:377-381`

### 3.7 `IssueReadiness` — new

Result of the draft hook, returned to the author and never persisted: not-applicable (reason no-team-policy or no-claim-unit), ready (units: { unit, issue, created }[]) or not-ready (unit, kind = a sc1 failure kind or policy-unreadable, outcomeKnown: boolean, reason, message, readyUnits). outcomeKnown is false only when the create call failed. Carried on WorkflowStepDone, on RunWorkflowResult and on the workflow.run done frame.

**Call sites:**
- `src/daemon/steps/workflow-step/types.ts:117-135`
- `src/daemon/steps/workflow-step/phases/synthesize.ts:60-110`
- `src/daemon/workflow-rpc.ts:154`
- `src/daemon/workflow-rpc.ts:333-334`
- `src/daemon/workflow-rpc.ts:352`
- `src/daemon/workflow-rpc.ts:475`

### 3.8 `ARTIFACT_WRITE_INVENTORY` — new

A checked-in table with one entry per source file that calls writeArtifact, writeAtomic, writeFileSync or renameSync, or that passes one of them as a value (a default parameter such as write: writeAtomic, an alias such as const w = writeAtomic, or an object property). Each entry has a class (content, meta-only, mixed, render, record, migration or non-artifact) and a via field: 'writeArtifact', 'raw', 'injected' or 'both'. A mixed entry lists each write site with its own kind. Test rules: a file with a writeArtifact call, a raw write or a writer passed as a value must have an entry, and an entry must have at least one of the three; a content, meta-only or mixed entry must call writeArtifact (for an injected writer, the default value passed is writeArtifact-based), and for a mixed entry every named site must use the kind its entry gives; every raw write in such a file carries a raw-write annotation naming why it is not an artifact JSON write; render, record, migration and non-artifact entries may use raw or injected writers. Classification, read from each writer's body handling: content: synthesize.ts, workflow-rpc.ts (the draft pair at lines 333 and 334), resolve-comment.ts, provenance/writer.ts, the BUILD standalone-record.ts, code-review/runner.ts and code-review-step/handler.ts (the code-review json is a signoff-covered record: the upstream plan sends a Story's BUILD, TESTS and code-review records in one code signoff request and sc5 binds signoff to the revision, so each regeneration mints a revision; the injected default becomes a writeArtifact-based content writer and the markdown stays an annotated render), and runners/build/test-record.ts (persistTestRecordTask replaces body.tasks, so its json write is content; the markdown is an annotated render; its rollback restores the prior json bytes and with them the prior revision). mixed: gates.ts (appendStoryToDefine content; approveArtifact, rejectArtifact and ackStaleArtifact meta-only); review/resolve.ts (apply content; accept, override, defer meta-only); run-artifact.ts and verdicts.ts (auto-fix content, report-only meta-only). meta-only: questions.ts, findings.ts, refs.ts, bugfix/stamp.ts, orchestrator.ts tracker patches. record: amendments/store.ts only (an amendment is a change request against the HLD, not a claim unit or a signoff-covered stage artifact, so no signoff binds to its revision; if the owner later puts amendments under signoff the entry becomes content). render: tracker/link.ts and the re-render in tracker-auto.ts. migration: migrate-docs-tree.ts. Each meta-only classification is backed by a test that the body is byte-identical before and after.

**Call sites:**
- `src/workflow/storage.ts:77-88`
- `src/workflow/gates.ts:194-203`
- `src/workflow/gates.ts:506`
- `src/workflow/gates.ts:654`
- `src/workflow/gates.ts:988`
- `src/workflow/questions.ts:419-420`
- `src/workflow/resolve-comment.ts:250`
- `src/workflow/review/resolve.ts:109-129`
- `src/workflow/review/run-artifact.ts:119-121`
- `src/daemon/steps/review-step/phases/verdicts.ts:96-98`
- `src/daemon/steps/review-step/phases/findings.ts:91-92`
- `src/workflow/orchestrator.ts:2932-2956`
- `src/workflow/bugfix/stamp.ts:87`
- `src/workflow/code-review/runner.ts:154`
- `src/workflow/code-review/runner.ts:219-220`
- `src/daemon/steps/code-review-step/handler.ts:132`
- `src/daemon/steps/code-review-step/handler.ts:531`
- `src/workflow/runners/build/test-record.ts:255-270`
- `src/workflow/artifacts/provenance/writer.ts:101`
- `src/workflow/migrate-docs-tree.ts:856`
- `src/workflow/amendments/store.ts:97`
- `src/workflow/runners/build/standalone-record.ts:322-332`
- `src/workflow/tracker/refs.ts:96`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | s4 owns sc3 and implements it as sketched. ensureUnitIssue is EnsureIssue with the same two arguments and a PortResult<IssueRef> result; the created flag, the mode and the failure phase live in the module-internal ensureUnitIssueDetailed and its local EnsureResult, so no consumer contract changes. writeArtifact is the ArtifactWriter (path, next, kind) and returns the revision now on disk. UnitIssue (with its optional extrasDone marks) and TrackerMeta.units are the additive per-unit record, written in team mode; ArtifactMetaBase.revision is the optional revision, absent reads as 0, and is minted by the code-review and TESTS record writes as well as by drafts. Every existing TrackerMeta field is kept, still written, and now survives a content write. |
| `sc1` | consumes | Uses loadTracker with the capability set {'issue-create'} to get a port and to learn why a tracker is not usable, and only when a unit cannot be resolved locally; then port.findIssue for the lookups and port.issueOps (ensureLabel, create returning { ref, id, typed }, linkSubIssue, comment, close, readBody, writeBody, ensureMilestone, attachMilestone) for creation, the duplicate check and the extras. One additive method is proposed to s1 as an HLD amendment and recorded in docs/plans/team-workflow.md: findIssues(labels), returning PortResult<IssueRef[]> with every matching issue open or closed, complete pagination and ascending numeric order; the GitHub adapter contract test for it is s1's, and the s4 build starts only after it is agreed. Until then s4 tests use a fake port that implements findIssues. Legacy mode keeps using the existing tracker-auto path unchanged. |
| `sc2` | consumes | Uses policyReader(repo) to pick the mode and to force Task issues: 'none' or teamMode false means the draft hook does nothing and the approve-time pushes run in legacy mode, as today (k4); teamMode true selects team mode, with forceTaskIssues making Task issues unconditional; ok:false is reported as policy-unreadable and the pushes return failed. |

## 5. Error paths

**Error cases**

- **The tracker cannot be reached when a draft is first written and a unit is not recorded locally, and the failure comes before the create call (gh missing, not signed in, network down, or a lookup or label command times out).** (recoverable)
  - Detection: resolveUnitIssueLocal misses, then loadTracker returns a PortResult failure with kind missing-tool, missing-signin or unreachable, or findIssue or ensureLabel does; ensureDraftIssues turns the first failure into IssueReadiness not-ready with outcomeKnown true.
  - Response: The draft files stay as written, no issue was created, and the result carries issueReadiness not-ready plus a notice, on WorkflowStepDone, on RunWorkflowResult and on the workflow.run done frame. The next draft write, the team-mode approve fallback or the s5 claim attempt runs the same function again.
  - User impact: The author reads 'cannot be claimed yet: no issue was created for <unit> because <reason>' (ac18) and can fix sign-in or connectivity and write the draft again; nothing is lost.
- **The create call itself fails or times out in team mode.** (recoverable)
  - Detection: issueOps.create returns ok:false, or ghCreateIssueTyped rethrows a timeout or other non-type error that may have committed the issue remotely, and ensureUnitIssueDetailed returns phase 'create'.
  - Response: The outcome is unconfirmed: ensureDraftIssues returns not-ready with outcomeKnown false and a message that says readiness could not be confirmed, that the issue may or may not have been created, and why; it never says that no issue exists. No retry runs inside the call. The next call resolves locally, then looks up the per-unit label before any create, so an issue that was committed but not reported is adopted and recorded.
  - User impact: The author is told 'readiness could not be confirmed for <unit>: the issue may or may not exist; <reason>' (ac18) and writes the draft again to settle it.
- **Sign-in or connectivity is lost after every unit of the draft already has a record.** (recoverable)
  - Detection: resolveUnitIssueLocal resolves every unit from the units record or a legacy ref, so ensureDraftIssues never reaches loadTracker.
  - Response: It returns ready with created false for each unit and runs no gh command.
  - User impact: None: the author is not told the stage cannot be claimed when its issues exist.
- **A tracker lookup (findIssue) fails before any issue is created, in team mode.** (recoverable)
  - Detection: port.findIssue returns ok:false inside ensureUnitIssueDetailed after a local miss.
  - Response: The failure is returned with phase before-create and nothing is created. In team mode a failed lookup is never read as 'not found'. In legacy mode (a repo without a policy) the old behaviour stays: the Epic lookup failing still leads to a create, by design (k4).
  - User impact: The unit is reported as not ready with the lookup's reason; a flaky lookup cannot create a duplicate in a team repo.
- **A tracker label (kind, epic membership or per-unit) cannot be created in team mode.** (recoverable)
  - Detection: issueOps.ensureLabel returns false for a label the issue needs.
  - Response: ensureUnitIssueDetailed returns a rejected failure naming the label, phase before-create, and creates no issue, because an issue created without the per-unit label could not be found again. In legacy mode label creation stays best-effort.
  - User impact: The author is told the stage cannot be claimed yet and which label could not be created.
- **The create call fails for one Task of several when a plan is drafted.** (recoverable)
  - Detection: ensureUnitIssueDetailed returns phase 'create' for Task k.
  - Response: ensureDraftIssues stops at the first failure, keeps the Tasks already created (each recorded in meta.tracker.units and taskRefs), and returns not-ready naming the failing Task, with outcomeKnown false, together with the ready ones. Later Tasks are not attempted.
  - User impact: The author sees which Task is unconfirmed and why; the next write adopts or creates only the missing Tasks because the earlier ones resolve locally.
- **The post-create duplicate check (the findIssues listing) fails after the issue already exists.** (recoverable)
  - Detection: After issueOps.create succeeded and the record was written, port.findIssues returns ok:false.
  - Response: The created ref is known and already recorded, so the call returns ok with created true and duplicateCheck 'not-run' and logs a warning. It is not reported as a missing issue. The next call finds the record locally and makes no tracker call.
  - User impact: None visible; the unit is ready. A duplicate made by another daemon in the same window stays until a person closes it, which is the accepted residual.
- **The issue is created but the record cannot be written (disk error or a concurrent edit).** (recoverable)
  - Detection: patchTrackerMeta throws after issueOps.create succeeded.
  - Response: The error is logged and the issue is still returned as created, skipping the duplicate check. The per-unit label is already on the issue, so the next call finds it by lookup and records it then.
  - User impact: None visible; the issue exists once.
- **The post-create listing shows another issue with the same per-unit label and a lower number than this call's own.** (recoverable)
  - Detection: After create and recording, port.findIssues returns a list whose first entry is not this call's own issue.
  - Response: The call adopts the lowest-numbered issue, records it in place of its own, comments on its own issue naming the adopted one and closes it as a duplicate, and logs both refs; if the comment or close fails it logs the failure and still adopts. Every daemon applies the same rule, so two creators converge once both issues exist at the time of either check.
  - User impact: A stray issue may stay open if closing failed; the unit has one recorded issue.
- **Two developers draft the same unit at the same moment on different machines and each daemon's duplicate check runs before the other's issue exists.** (recoverable)
  - Detection: Both lookups miss, both create, and both listings show only their own issue.
  - Response: Two open issues remain with different records and nothing re-checks on the local-record fast path. This is the narrow race the owner accepted and recorded in docs/plans/team-workflow.md#known-limitations (2026-10-18) as the amended wording of DEF S004:FR001. The claim rule in s5 makes one author per unit the normal case.
  - User impact: In the rare residual interleaving a person closes one issue by hand and fixes one record.
- **The findIssues method is not yet available on the port (the s1 amendment is not agreed or built).** (recoverable)
  - Detection: The s4 build checks that TrackerPort declares findIssues; the build is gated on the amendment being recorded and on the s1 adapter contract test passing.
  - Response: The s4 build does not start until the amendment is agreed; until then s4 tests use a fake port that implements findIssues. If s1 declines, the tie-break is dropped and the design falls back to the record-and-label lookup, with the residual window as accepted.
  - User impact: None for users; it is a sequencing dependency between stories.
- **The team policy cannot be read when the draft is written or when an approve-time push picks its mode.** (recoverable)
  - Detection: policyReader returns ok:false.
  - Response: The draft hook returns not-ready with kind policy-unreadable and the reader's reason, with no tracker call; an approve-time push returns a 'failed' result.
  - User impact: The author is told the policy could not be read and what to do (for example run team refresh), and the draft is kept.
- **The tracker target cannot be resolved in a team repo (no github config entry and no parseable origin remote).** (recoverable)
  - Detection: loadTracker returns a rejected failure from the strict target resolver.
  - Response: Not-ready with kind rejected and the resolver's message, outcomeKnown true; nothing is created.
  - User impact: The author is told which setting or remote is missing, which s3 lets them fix in settings.
- **A parent issue is missing: an LLD is drafted before any Epic issue exists, or a plan before its Story issue.** (recoverable)
  - Detection: ensureDraftIssues finds no record, legacy ref or labelled issue for the parent.
  - Response: It ensures the parent first (Epic from the Define, then Story from the LLD) in that order; if the parent artifact cannot be read it returns not-ready with kind rejected and the path.
  - User impact: Normal drafts need no action; a missing parent artifact is reported with its path.
- **A unit label cannot be built because an id is malformed or the label would exceed 50 characters.** (terminal)
  - Detection: unitLabel throws.
  - Response: ensureUnitIssueDetailed converts it to a rejected failure naming the id, phase before-create; nothing is created.
  - User impact: The author is told the unit id is not valid for a tracker label.
- **The unit's own artifact cannot be read or lacks the unit.** (recoverable)
  - Detection: Reading the Define, LLD or plan fails, or the unit is not found in its body.
  - Response: ensureUnitIssueDetailed returns a rejected failure naming the artifact and the unit, phase before-create; nothing is created.
  - User impact: The author is told which artifact or unit is missing.
- **One approve-time extra fails after a team-mode issue exists (the milestone, the Epic task-list splice, the design comment or the review comment).** (recoverable)
  - Detection: runUnitExtras runs each step on its own and the step returns a failure result; the failure is not swallowed by bestEffort.
  - Response: The step is left unset in extrasDone, the failure is logged and returned in ExtrasOutcome.failed, and tracker-auto reports a partial result. Steps that already succeeded keep their timestamps and are not repeated. The next approve retries only the unset steps.
  - User impact: The author sees which extra did not run and why, and a retry posts only what is missing.
- **The marker write fails after an extra succeeded.** (recoverable)
  - Detection: patchTrackerMeta throws after a step's tracker call returned success.
  - Response: The error is logged and the step stays unset, so the next approve may post that one comment again. This is the one residual repeat and it is stated; no other path repeats a posted comment.
  - User impact: At most one repeated comment for that step, visible to a person and harmless.
- **The readiness fields are lost between the draft hook and the workflow.run terminal frame.** (recoverable)
  - Detection: The whole-path test compares the driver return, RunWorkflowResult and the frame emitted by runStart, and finds issueReadiness missing at one of the three hops.
  - Response: The test fails until WorkflowStepDone, RunWorkflowResult (src/daemon/workflow-rpc.ts line 154), the return at line 352 and the projection at line 475 all carry the fields.
  - User impact: None for users; it stops the ac18 notice from being lost on either path.
- **writeArtifact is called with something that is not an artifact object (no meta).** (terminal)
  - Detection: writeArtifact checks that next is an object with a meta object before writing.
  - Response: It throws TypeError and the file on disk is left as it was.
  - User impact: The calling operation fails loudly instead of silently writing a file that later breaks readers.
- **The TESTS record document write fails after its json was written.** (recoverable)
  - Detection: persistTestRecordTask's second write throws.
  - Response: The prior json bytes are put back (or the new json is removed when it was new), so the earlier revision is restored with them; the caller is told the record was not written.
  - User impact: The record and its revision are exactly as before the failed turn.
- **New code writes an artifact JSON with a raw writeAtomic or writeFileSync, through an alias, or through an injected writer, instead of writeArtifact, or a file is classified with the wrong kind.** (recoverable)
  - Detection: The bypass test fails: a source file that calls a raw write or writeArtifact, or passes writeAtomic or writeFileSync as a value (a default parameter, an alias or an object property such as write: writeAtomic), has no inventory entry; a content, meta-only or mixed file has no writeArtifact call; a raw write has no annotation; a mixed file's named site uses another kind; or a meta-only site changes the body.
  - Response: The test run fails until the file is classified, routed through writeArtifact where it is content or meta-only, and the kind corrected.
  - User impact: None for users; it stops a missed content write from leaving a stale revision under a signoff.
- **The daemon is blocked while issues are created, because the gh calls are synchronous.** (recoverable)
  - Detection: ensureDraftIssues runs inside the synthesize phase and the workflow.run path; each tracker command has the ten-second port timeout.
  - Response: The work is bounded: about nine commands for an Epic or Story and about six more per Task, and none at all when every unit is recorded. It stops at the first failure.
  - User impact: A draft with many Tasks can hold the daemon for tens of seconds; recorded as an open question about moving it off the event loop.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no policy file (policyReader returns 'none') or with teamMode false. | ensureDraftIssues returns not-applicable and makes no tracker call; the three approve-time pushes run in legacy mode and behave exactly as today, including the exact gh command sequence, the tracker block without units, bestEffort extras only when the push created the issue, the fall-through to create after a failed lookup, and skipping Tasks when pushTasks is off. |
| A draft is written a second time for units that already have a record. | Every unit resolves locally, loadTracker is not called, no gh command runs, no issue is created, and the result reports ready with created false. |
| A Story issue created at draft time is later approved for the first time. | In team mode runUnitExtras finds no extrasDone marks, runs the Epic task-list splice, the design comment and the review comment, marks each as it succeeds, and a second approve posts nothing. |
| A Story's extras partly succeed (the design comment posts, the task-list splice fails) and the unit is approved again. | The design comment keeps its mark and is not posted again; only the task-list splice is retried. |
| A legacy LLD whose only tracker data is meta.tracker.storyRef (an interrupted autoPushStoryOnLld), with no units record and no unit label on the issue. | In team mode resolveUnitIssueLocal returns the LLD storyRef, writes the missing units record and the Define storyRefs entry locally, and no second Story issue is created. |
| A legacy Define whose epicRef is missing but the HLD carries epicRef, or the reverse. | In team mode the Epic resolves from whichever is present and the missing sibling ref and units record are written locally with no tracker call. |
| A re-draft replaces the artifact file, which carries a full tracker block from an earlier push. | writeArtifact carries the whole prior meta.tracker block into the new file, so sync, the chain report, the question and LLD renderers and the Task approval still find epicRef, storyRef and storyRefs, and the unit records and extrasDone marks survive. |
| A re-draft of a file that was written before this change and has no units or revision. | The legacy refs are carried forward, the revision becomes 1 on the first content write, and in team mode the unit resolves from its legacy ref and is recorded. |
| A plan with no Tasks. | ready with no units; the tracker is not loaded or called. |
| A Task id that was renamed or removed between two drafts of the same plan. | The new id gets a new issue; the old Task's issue is left as it is (closing it belongs to the lifecycle work in s9). |
| A Story or Task issue created by the old approve-time code, with no per-unit label and all local refs lost. | For the Epic the old two-label search adopts it; a Story or Task would get a new issue. This needs the refs to be lost entirely and is listed as an open question. |
| findIssue matches a closed issue (gh issue list is run with --state all). | The closed issue is adopted as the unit's issue, because creating another would split ownership. |
| A Story id written in upper case, such as S004, in one place and lower case in another. | unitLabel and the record key lower-case the id, so both forms give the same label and the same issue. |
| An artifact written before this change, with no meta.revision. | readRevision returns 0; a meta-only write leaves the field absent; the first content write after the change writes revision 1. |
| A meta-only write is handed a next object whose meta.revision differs from the file on disk. | writeArtifact copies the on-disk revision into next, so a meta-only write can never change the revision. |
| The extend path appends a Story to a signed-off Define through appendStoryToDefine, versus approving or rejecting the same Define. | appendStoryToDefine changes body.stories and mints a revision; the approve, ack-stale and reject stamps change only meta and leave the revision alone. |
| A review that applies auto-fixes versus a report-only review (verdicts.ts and run-artifact.ts). | The first is a content write and mints a revision; the second is meta-only and does not. |
| A finding resolved with action apply versus accept, override or defer (review/resolve.ts). | apply changes the body and is a content write; the other three change only meta.reviewResolutions and are meta-only. |
| A second code review of the same Story, or a second persisted test mapping for the same Task. | Each regeneration is a content write through writeArtifact and bumps the record's revision, so a signoff bound to the earlier revision no longer matches. |
| A file such as tracker/refs.ts is fully migrated and now has no raw write at all. | Its inventory entry (via writeArtifact) stays valid; the stale-entry rule only rejects an entry with none of a writeArtifact call, a raw write and an injected writer. |
| The org has no native issue type for Epic, Story or Task. | issueOps.create falls back to an untyped issue as it does today; the unit label is still applied in team mode. |

**Invariants to preserve**

- A repo without the policy file behaves exactly as it does today: no tracker call is made when a draft is written, and the approve-time pushes keep their present gh command sequence, results and tracker blocks, including the comments and task-list entry only when the push created the issue, creating after a failed lookup, best-effort labels and skipping Task issues when pushTasks is off. The existing tracker-auto tests pass unedited against legacy mode. [[c1]]
- Writing the revision, the unit record or a tracker patch never changes meta.review or approvedAt, and a meta-only write never changes meta.revision. [[c3]]
- The existing meta.tracker fields (epicRef, storyRef, storyRefs, taskRefs and the rest) keep their meaning, are still written and now survive a replacement of the artifact, and the terminal approve path keeps creating, adopting and linking issues as it does now. [[c4]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), tests co-located in __tests__ directories as in src/workflow/tracker/__tests__/setup.test.ts; the tracker is faked through _setTrackerExecForTests with INSRC_GITHUB_CONFIG pointed at a temp file, policy and tracker seams are injected, and source-scan tests follow src/cli/__tests__/tracker-setup-service.test.ts`

**Test levels**

- **unit** — Prove the shared issue function, the local resolver, the extras runner, the label, the write helper and the revision rules on their own, with no real tracker.
  - Subjects: `src/workflow/tracker/__tests__/unit-issue.test.ts: ensureUnitIssue(unit, port) takes only a unit and a port, derives the title, body, labels and parent from the Define, LLD or plan, and returns a PortResult<IssueRef> without a phase; this is the call s5 will make for its no-issue outcome`, `src/workflow/tracker/__tests__/unit-issue.test.ts: resolveUnitIssueLocal resolves a Story from its units record, from the LLD's own storyRef when there is no units record and no unit label, and from the Define's storyRefs entry; resolves the Epic from the Define epicRef or the HLD epicRef and a Task from the plan taskRefs; reconciles the missing units record and sibling refs locally in team mode; makes no tracker command`, `src/workflow/tracker/__tests__/unit-issue.test.ts: a legacy LLD with only meta.tracker.storyRef, no units and an issue with no unit label creates no second Story issue`, `src/workflow/tracker/__tests__/unit-issue.test.ts: in team mode ensureUnitIssueDetailed returns a recorded unit with no tracker call; adopts an issue found by the per-unit label and records it; creates only when record, legacy ref and lookup all miss, with the kind, epic membership and per-unit labels; returns an EnsureResult failure with phase before-create when findIssue fails; creates nothing when a label cannot be created; adopts a closed issue; links a Story or Task to its parent and ignores a link failure; still returns the issue when recording fails`, `src/workflow/tracker/__tests__/unit-issue.test.ts: after creating, a listing in which a lower-numbered issue carries the same per-unit label makes the function adopt it, comment on and close its own, and log both refs; a failing close still adopts; a listing whose first entry is its own issue keeps it`, `src/workflow/tracker/__tests__/unit-issue.test.ts: two simulated daemons that both create before either lists end with one open issue, the lowest, and both records name it`, `src/workflow/tracker/__tests__/unit-issue.test.ts: create succeeds and then the findIssues listing fails: the issue is recorded, the result is ok with created true and duplicateCheck not-run, and a following call makes no second create and no tracker call`, `src/workflow/tracker/__tests__/unit-issue.test.ts: the create call times out after the fake remote committed the issue: the result is a failure with phase create; the next call finds the issue by its per-unit label, records it and creates nothing`, `src/workflow/tracker/__tests__/unit-issue.test.ts: unitLabel gives the three label forms, lower-cases ids, stays within 50 characters and throws for a malformed id`, `src/workflow/tracker/__tests__/unit-extras.test.ts: runUnitExtras runs each step on its own and records its mark in extrasDone; skips a step that already has a mark; reports a failed step in ExtrasOutcome.failed and leaves it unmarked; with the design comment succeeding and the task-list splice failing, a second run posts only the task-list splice; when the marker write fails after a successful post, the next run posts that step again (the stated residual); no step goes through bestEffort`, `src/workflow/__tests__/artifact-writer.test.ts: writeArtifact mints revision 1 on a first content write and +1 on each later one, carries the whole prior meta.tracker block (every legacy field, units and extrasDone) into a replaced file with next winning per key, does not carry approvedAt or review, leaves a missing revision absent on a meta-only write, forces the on-disk revision back when a meta-only next differs, throws TypeError for a value without meta and leaves the file untouched`, `src/workflow/__tests__/artifact-writer.test.ts: readRevision reads 0 for absent, negative, fractional or non-numeric values; patchTrackerMeta keeps every existing field, merges units key by key and does not change the revision`, `src/workflow/__tests__/draft-issues.test.ts: ensureDraftIssues returns not-applicable and makes no tracker call for a policy of none and for teamMode false; reports policy-unreadable; maps each sc1 failure kind into a not-ready message with outcomeKnown true`
  - Fixtures: `a fake gh/git exec seam that records every command and answers issue list, issue create, issue close, issue comment, label create and sub-issue link, can list several issues for one label, and can commit an issue and then time out`, `a fake port that implements findIssues, used until the s1 adapter method exists`, `a temp repo with a Define, an HLD, an LLD and a plan artifact JSON`, `an injected PolicyReader returning none, a team policy, and ok:false`, `a failing temp directory or read-only file for the record-write failure`
- **integration** — Prove the draft hook through the real synthesize phase and the whole workflow.run path, the re-draft path and the terminal approve fallback, for each Story acceptance criterion, and prove that a repo without a policy is unchanged.
  - Subjects: `src/workflow/__tests__/draft-issues.test.ts: a Define draft in team mode creates one Epic issue and a second write of the draft creates none (ac15)`, `src/workflow/__tests__/draft-issues.test.ts: an LLD draft creates the Epic first when needed and then one Story issue under it; a re-draft that replaced the file and a re-draft that lost the record both create nothing (ac16)`, `src/workflow/__tests__/draft-issues.test.ts: a plan with three Tasks and pushTasks false in the github config creates three Task issues in plan order, each linked to the Story; a second write creates none; a failure on the second Task stops, keeps the first and reports the second (ac17)`, `src/workflow/__tests__/draft-issues.test.ts: after a first successful draft, a second write with sign-in lost (the fake gh fails every command) returns ready, does not call loadTracker and runs no command`, `src/workflow/__tests__/draft-issues.test.ts: a failed lookup before create reports outcomeKnown true and says nothing was created; a create that times out reports outcomeKnown false and says readiness could not be confirmed and the issue may or may not exist, and never says that no issue exists`, `src/workflow/__tests__/redraft-preserves-tracker.test.ts: re-drafting a Define after its Stories have issues keeps epicRef and storyRefs, so syncTracker does not skip, buildChainReport still reports the Epic as pushed, and autoPushTasksOnPlan still finds the Story ref`, `src/daemon/__tests__/draft-issues-synthesize.test.ts: the synthesize phase writes the draft, runs the hook and returns issueReadiness ready on the WorkflowStepDone result; with a tracker that cannot be reached the draft files still exist and the result carries issueReadiness not-ready with a notice that says the stage cannot yet be claimed and gives the reason (ac18); in a repo with no policy the result has no new field and no tracker command ran`, `src/daemon/__tests__/draft-issues-synthesize.test.ts: the whole workflow.run path carries readiness at every hop: the value returned by runWorkflowServerSide (RunWorkflowResult), the frame emitted by runStart (captured from the send callback at src/daemon/workflow-rpc.ts line 475), each carrying issueReadiness and notice for a team repo and neither field for a repo without a policy`, `src/workflow/__tests__/approve-fallback-issues.test.ts: in team mode autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan adopt issues that the draft hook already created and create none; autoPushEpicOnHld returns failed when its lookup fails instead of creating an Epic; autoPushTasksOnPlan creates Task issues with pushTasks off; an unreadable policy makes all three return failed`, `src/workflow/__tests__/approve-fallback-issues.test.ts: after the draft hook created the Story issue, the first approve runs the Epic task-list splice, the design comment and the review comment once and marks each; a second approve posts nothing; with one extra failing the push reports a partial result and the next approve retries only that extra`, `src/workflow/__tests__/tracker-auto.test.ts (unedited): the existing tests, including the exact gh command sequence of the three pushes, the deep-equal tracker block without units, 'a failing adoption lookup still leads to a create and does not throw' and 'a failing create is reported as a failed result, not thrown', are the solo regression suite; they pass without any edit because a repo without a policy runs in legacy mode, and the file is not changed by this Story`, `src/workflow/__tests__/approve-fallback-issues.test.ts: with policy none and with teamMode false the three pushes run in legacy mode, produce the same gh command sequence and tracker block as before, post the extras only when the push created the issue, and pushTasks off still returns skipped`
  - Fixtures: `the same fake exec seam and temp repo`, `a stub of finalizeArtifact output for the synthesize phase or the real stub workflow with a Define fixture`, `a capture of the frames sent by workflow-rpc runStart`, `a temp INSRC_GITHUB_CONFIG`, `a fake tracker whose lookups can be scripted per call to model the two daemons`
- **contract** — Prove no artifact is written outside the helper, directly, through an alias or through an injected writer, that every write site is classified with the right kind, and that the extend path, the review paths and the code-review and TESTS records mint revisions only when the content changes.
  - Subjects: `src/workflow/__tests__/artifact-write-inventory.test.ts: every production file that calls writeArtifact, writeAtomic, writeFileSync or renameSync, or passes one of them as a value, appears in ARTIFACT_WRITE_INVENTORY, and every entry has a writeArtifact call, a raw write or an injected writer`, `src/workflow/__tests__/artifact-write-inventory.test.ts: a content, meta-only or mixed entry calls writeArtifact, every raw write in such a file carries a raw-write annotation, and every site named by a mixed entry (gates.ts, review/resolve.ts, run-artifact.ts, verdicts.ts) calls writeArtifact with the kind its entry gives`, `src/workflow/__tests__/artifact-write-inventory.test.ts: the detector flags a temporary file that writes artifact JSON with raw writeFileSync, one that uses raw writeAtomic without an annotation, one with the injected default 'write: writeAtomic', one with an alias 'const w = writeAtomic' and one that passes writeFileSync as an argument, when none has an entry (negative controls); it accepts a file that only calls writeArtifact (positive control), a file that writes only markdown with an annotation, and the same injected-writer file once it has an entry; it flags a mixed entry whose site uses the wrong kind and an entry that has none of the three`, `src/workflow/__tests__/artifact-write-inventory.test.ts: the real code-review/runner.ts, code-review-step/handler.ts and runners/build/test-record.ts are found by the detector and classified content, and amendments/store.ts is classified record with its stated reason`, `src/workflow/__tests__/artifact-write-inventory.test.ts: the classification matches the design: questions.ts, findings.ts, refs.ts, bugfix/stamp.ts and orchestrator.ts are meta-only; synthesize.ts, workflow-rpc.ts, resolve-comment.ts, provenance/writer.ts, the BUILD record, the code-review record and the TESTS record are content; gates.ts, review/resolve.ts, run-artifact.ts and verdicts.ts are mixed`, `src/workflow/__tests__/gates-revision.test.ts: appendStoryToDefine mints a revision and keeps the tracker block, while approveArtifact, rejectArtifact and ackStaleArtifact leave the revision and the body byte-identical`, `src/workflow/__tests__/meta-only-body-unchanged.test.ts: for each meta-only writer (questions resolution, findings review stamp, refs patch, bugfix stamp, orchestrator tracker push and sync) the artifact body is byte-identical before and after and the revision is unchanged`, `src/workflow/code-review/__tests__/record-revision.test.ts: a second code review of the same Story bumps the code-review record's revision, through the runner's default writer and through the step handler's injected writer`, `src/workflow/runners/build/__tests__/test-record-revision.test.ts: a second persisted test mapping for the same Task bumps the TESTS record's revision, and a rolled-back record (the document write fails) leaves the json bytes and the revision as they were`, `src/workflow/review/__tests__ and src/daemon/steps/review-step: a review that applies auto-fixes bumps the revision and a report-only review does not, through both verdicts.ts and run-artifact.ts; resolving a finding with apply bumps it and with accept, override or defer does not`
  - Fixtures: `a temp directory holding the negative-control and positive-control source files`, `temp artifacts for the review paths, the extend path, the code-review record and the TESTS record`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac15` | `src/workflow/__tests__/draft-issues.test.ts: a Define draft in team mode creates one Epic issue and a second write of the draft creates none (ac15)`, `src/workflow/tracker/__tests__/unit-issue.test.ts: in team mode ensureUnitIssueDetailed returns a recorded unit with no tracker call; adopts an issue found by the per-unit label and records it`, `src/workflow/__tests__/draft-issues.test.ts: after a first successful draft, a second write with sign-in lost returns ready and runs no command`, `src/daemon/__tests__/draft-issues-synthesize.test.ts: the synthesize phase writes the draft, runs the hook and returns issueReadiness ready on the WorkflowStepDone result` |
| `ac16` | `src/workflow/__tests__/draft-issues.test.ts: an LLD draft creates the Epic first when needed and then one Story issue under it, and a re-draft creates nothing (ac16)`, `src/workflow/tracker/__tests__/unit-issue.test.ts: a legacy LLD with only meta.tracker.storyRef, no units and an issue with no unit label creates no second Story issue`, `src/workflow/tracker/__tests__/unit-issue.test.ts: in team mode ensureUnitIssueDetailed links a Story to its parent and ignores a link failure`, `src/workflow/__tests__/redraft-preserves-tracker.test.ts: re-drafting a Define after its Stories have issues keeps epicRef and storyRefs`, `src/workflow/__tests__/approve-fallback-issues.test.ts: in team mode autoPushStoryOnLld adopts the issue the draft hook already created and runs its extras once` |
| `ac17` | `src/workflow/__tests__/draft-issues.test.ts: a plan with three Tasks and pushTasks false creates three Task issues in plan order and a second write creates none (ac17)`, `src/workflow/__tests__/draft-issues.test.ts: a failure on the second Task stops, keeps the first and reports the second`, `src/workflow/__tests__/approve-fallback-issues.test.ts: in team mode autoPushTasksOnPlan creates Task issues with pushTasks off, and with policy none it still returns skipped`, `src/workflow/tracker/__tests__/unit-issue.test.ts: two simulated daemons that both create before either lists end with one open issue, the lowest` |
| `ac18` | `src/daemon/__tests__/draft-issues-synthesize.test.ts: with a tracker that cannot be reached the draft files still exist and the result carries a not-ready notice that gives the reason (ac18)`, `src/daemon/__tests__/draft-issues-synthesize.test.ts: the whole workflow.run path carries readiness at every hop, including the emitted done frame`, `src/workflow/__tests__/draft-issues.test.ts: ensureDraftIssues maps each sc1 failure kind into a not-ready message and reports policy-unreadable`, `src/workflow/__tests__/draft-issues.test.ts: a failed lookup before create reports outcomeKnown true; a create that times out reports outcomeKnown false and says the issue may or may not exist`, `src/workflow/tracker/__tests__/unit-issue.test.ts: the create call times out after the fake remote committed the issue; the next call finds it by its per-unit label and creates nothing` |

## 7. Alternatives considered

### 7.1 a1: Extend the three approve-time pushes in place

Keep tracker-auto.ts as the one place that creates issues and call its entry points from the daemon when a draft is written, adding only a team-mode switch.

Leave autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan where they are. Add a team-mode argument that forces Task issues on and lets each function accept a draft instead of an approved artifact. Call them from the synthesize phase and from src/daemon/workflow-rpc.ts after the draft pair is written, when the PolicyReader reports team mode. Dedupe stays as today: the Epic by its two labels, the Story by the Define's storyRefs map, the Task by the plan's taskRefs map. The revision is a small helper next to writeAtomic that content-write sites call.

**Rejected because:** Smallest and keeps k4 and sc1 untouched, but it leaves the duplicate window and gives s5 nothing to call.

### 7.2 a2: A mode-split ensureUnitIssue with a lowest-number tie-break, a per-step extras runner and a fully carried readiness result — **CHOSEN**

Add the HLD's EnsureIssue(unit, port) as the single owner of 'does this unit have an issue' for team repos, keeping today's behaviour for a repo without a policy, converging concurrent creators to the lowest issue number as the owner-accepted amendment of FR001 says, running approve-time extras step by step with their own progress marks, and carrying readiness through every result type to the workflow.run frame.

A new module owns issue readiness, in a strict team mode and a legacy mode that keeps today's approve-time behaviour. Team mode resolves each unit locally first (units record, legacy refs, local reconcile), then looks it up by its per-unit label, ensures labels, creates, records at once, and lists every issue carrying the label to keep the lowest number, closing its own as a duplicate when higher; the listing is an additive sc1 method findIssues(labels), recorded as an amendment to be agreed with s1 before the build. The module returns a local EnsureResult with a failure phase; ensureUnitIssue keeps the sc3 type. A team-only extras runner runs the Epic task-list splice, the milestone and the design and review comments as separate steps that each report success or failure and record their own completion in the unit record, so only unfinished steps are retried; legacy mode keeps bestEffort and the created-only condition. Readiness is carried on WorkflowStepDone, on RunWorkflowResult and on the workflow.run done frame. writeArtifact(path, next, kind) mints meta.revision on content writes and carries the whole prior tracker block; the inventory routes the code-review and TESTS record json writes through writeArtifact as content, classifies gates.ts as mixed, and follows injected writers.

### 7.3 a3: Trigger from inside the content-write helper

Make the single artifact write helper detect the first write of a draft and create the issue itself.

Give writeArtifact(path, content, kind) a first-write check and, on a first content write of a Define, LLD or plan in team mode, call ensureUnitIssue before returning. The synthesize phase and the daemon workflow.run path need no change because both write through the helper. The helper takes the PolicyReader and tracker loader as injected seams.

**Rejected because:** Hides slow network calls inside a file write and cannot report failure.

### 7.4 a4: Create the issue lazily at the first guarded action

Do not create issues at draft time; let the s5 gate create the issue the first time someone claims or edits the unit.

Leave drafting alone and let the team gate treat a unit with no issue as 'create it now' on the first guarded action, using the same ensureUnitIssue. Only the record and the revision are added by s4.

**Rejected because:** Fails all four acceptance criteria of the Story.

## 8. References

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md#5.4`
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md`
- **[[c3]]** `code` `src/workflow/tracker-auto.ts`
- **[[c4]]** `code` `src/workflow/tracker/refs.ts:24-37`
- **[[c5]]** `code` `src/daemon/steps/workflow-step/phases/synthesize.ts:60-85`
- **[[c6]]** `code` `src/workflow/storage.ts:77-88`
- **[[c7]]** `code` `src/workflow/tracker/port.ts:55-95`
- **[[c8]]** `code` `src/workflow/team/policy-reader.ts:265`
- **[[c9]]** `code` `src/workflow/tracker/sync.ts:27-52`
- **[[c10]]** `code` `src/workflow/gates.ts:194-203`
- **[[c11]]** `code` `src/workflow/tracker/github-adapter.ts:173-181`
- **[[c12]]** `code` `src/workflow/tracker/github.ts:233-242`
- **[[c13]]** `code` `src/workflow/code-review/runner.ts:154`
- **[[c14]]** `code` `src/daemon/workflow-rpc.ts:154`
- **[[c15]]** `code` `src/daemon/workflow-rpc.ts:475`
- **[[c16]]** `doc` `docs/plans/team-workflow.md#known-limitations`
- **[[c17]]** `step-output` `s3.winnerId`

## 9. Open questions

- sg1: ensureDraftIssues runs inside the synthesize phase and the workflow.run path on the daemon's event loop and the gh commands are synchronous, so a draft with many Tasks can hold the daemon for tens of seconds (none when every unit is recorded). Options: (A) accept it, bounded by the ten-second port timeout and stop-at-first-failure; (B) run it off the event loop and return issueReadiness pending, which loses the immediate message ac18 asks for. Recommendation: A for now, and revisit if it shows in use.
- sg2: Story and Task issues created before this change carry no per-unit label. They are adopted from the LLD storyRef, the Define storyRefs and the plan taskRefs and recorded, but not relabelled; if every local ref is lost, a Story or Task (unlike the Epic, which has the old two-label search) would get a second issue. Options: (A) accept, since the refs live in committed files; (B) add a relabel or a title search to the port. Recommendation: A; B needs a new port method owned by s1.
- sg4: Legacy mode keeps the old approve-time behaviour for a repo without a policy by design (k4), including its fail-open weaknesses: a failed Epic lookup still leads to a create and label failures are best-effort, so such a repo can still get a duplicate Epic. Options: (A) accept, since k4 requires an unchanged repo and the strict behaviour is team-only; (B) raise an HLD amendment to harden the solo path too. Recommendation: A.
- sg5: The duplicate tie-break needs a new additive sc1 method, findIssues(labels), returning PortResult<IssueRef[]> with every matching issue open or closed, complete pagination and ascending numeric order, because findIssue returns only the first match and gh lists newest first. It is recorded as an amendment in docs/plans/team-workflow.md and proposed to s1 as a sharedContract.methodAdd; the GitHub adapter contract test is s1's. Options: (A) agree the amendment with s1 and gate the s4 build on it; (B) build without the tie-break and accept the duplicate window with no convergence. Recommendation: A.

## Resolved questions

- `q22fb8489` — sg1: ensureDraftIssues runs inside the synthesize phase and the workflow.run path on the daemon's event loop and the gh commands are synchronous, so a draft with many Tasks can hold the daemon for tens of seconds (none when every unit is recorded). Options: (A) accept it, bounded by the ten-second port timeout and stop-at-first-failure; (B) run it off the event loop and return issueReadiness pending, which loses the immediate message ac18 asks for. Recommendation: A for now, and revisit if it shows in use.
  - **resolved**: A — Keep synchronous creation — Recommended in the approved LLD; preserves the immediate ac18 message. _(2026-10-18T04:33:39.530Z)_
- `q071506f5` — sg2: Story and Task issues created before this change carry no per-unit label. They are adopted from the LLD storyRef, the Define storyRefs and the plan taskRefs and recorded, but not relabelled; if every local ref is lost, a Story or Task (unlike the Epic, which has the old two-label search) would get a second issue. Options: (A) accept, since the refs live in committed files; (B) add a relabel or a title search to the port. Recommendation: A; B needs a new port method owned by s1.
  - **resolved**: A — Accept the legacy recovery gap — Recommended in the approved LLD. _(2026-10-18T04:34:09.975Z)_
- `q40802bd9` — sg4: Legacy mode keeps the old approve-time behaviour for a repo without a policy by design (k4), including its fail-open weaknesses: a failed Epic lookup still leads to a create and label failures are best-effort, so such a repo can still get a duplicate Epic. Options: (A) accept, since k4 requires an unchanged repo and the strict behaviour is team-only; (B) raise an HLD amendment to harden the solo path too. Recommendation: A.
  - **resolved**: A — Preserve legacy behavior — k4 requires an unchanged repo without a policy. _(2026-10-18T04:34:35.273Z)_
- `q702698e7` — sg5: The duplicate tie-break needs a new additive sc1 method, findIssues(labels), returning PortResult<IssueRef[]> with every matching issue open or closed, complete pagination and ascending numeric order, because findIssue returns only the first match and gh lists newest first. It is recorded as an amendment in docs/plans/team-workflow.md and proposed to s1 as a sharedContract.methodAdd; the GitHub adapter contract test is s1's. Options: (A) agree the amendment with s1 and gate the s4 build on it; (B) build without the tie-break and accept the duplicate window with no convergence. Recommendation: A.
  - **resolved**: A — Amend contract and gate s4 — Recorded in docs/plans/team-workflow.md; tie-break task is gated on AMD-315d510cb28100e2-10, fake port until then. _(2026-10-18T04:34:49.379Z)_

## Citations

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md#5.4`
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md`
- **[[c3]]** `code` `src/workflow/tracker-auto.ts`
- **[[c4]]** `code` `src/workflow/tracker/refs.ts:24-37`
- **[[c5]]** `code` `src/daemon/steps/workflow-step/phases/synthesize.ts:60-85`
- **[[c6]]** `code` `src/workflow/storage.ts:77-88`
- **[[c7]]** `code` `src/workflow/tracker/port.ts:55-95`
- **[[c8]]** `code` `src/workflow/team/policy-reader.ts:265`
- **[[c9]]** `code` `src/workflow/tracker/sync.ts:27-52`
- **[[c10]]** `code` `src/workflow/gates.ts:194-203`
- **[[c11]]** `code` `src/workflow/tracker/github-adapter.ts:173-181`
- **[[c12]]** `code` `src/workflow/tracker/github.ts:233-242`
- **[[c13]]** `code` `src/workflow/code-review/runner.ts:154`
- **[[c14]]** `code` `src/daemon/workflow-rpc.ts:154`
- **[[c15]]** `code` `src/daemon/workflow-rpc.ts:475`
- **[[c16]]** `doc` `docs/plans/team-workflow.md#known-limitations`
- **[[c17]]** `step-output` `s3.winnerId`
