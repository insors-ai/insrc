<!-- insrc:artifact LLD-315d510cb28100e2-s1 -->

# LLD: E20261017315d510c:S001

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `0774bc0461d3...`

Story s1 puts every GitHub issue operation the workflow uses behind one tracker port that declares what it can do: creating and finding issues, linking sub-issues, labels, milestones, comments, body edits and closing, for the tracker-auto push, the bugfix path and the question comments. Loading a tracker for a policy is refused, naming the missing capability, when the tracker cannot do something the policy needs, and a missing gh tool or sign-in is reported as such. Results stay the same as today, with two recorded compatibility exceptions: a typed issue create is retried untyped only when the type is rejected (not after any failure), and migrated operations are bounded by a 10 second timeout. Every other caller of a moved wrapper is named, each call site keeps its own failure result through one unwrapping rule with three named exceptions, and repos without a policy keep their lenient, fail-open behaviour. The issue-status read, the task query and the other one-shot setup steps stay outside the port. The unbuilt tracker-tool design is superseded by the owner's decision of 2026-10-17, recorded in that design's own file.

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

**Rollout phase:** Phase A — foundational contracts
**Owns:** `sc1` (TrackerPort and PortResult)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `LoadTracker`

```typescript
(repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort>
```

**Parameters:**
- `repo: string` — Repo path whose tracker target is resolved by the strict resolver.
- `needed: ReadonlySet<Capability>` — Capabilities the policy needs, passed in so s1 never reads the policy.

**Returns:** `PortResult<TrackerPort>` — The adapter when the configuration is valid, gh is present and signed in, and every needed capability is declared.

**Errors:**
- `rejected` when Malformed github.json, non-object file or entry, unsupported type, bad owner or repo, type none, no resolvable target, or a needed capability the tracker does not declare (the reason names it).
- `missing-tool` when The gh program is not installed.
- `missing-signin` when gh is installed but not signed in.
- `unreachable` when A gh command timed out after 10 s or the host cannot be reached.

**Preconditions:**
- repo is a registered repo path

**Postconditions:**
- No reduced mode: either every needed capability is available or the load fails
- The policy is not read and the lenient resolveGithubConfig is not changed
- Used by team features only; lenient callers use the adapter factory instead

### 2.2 `whoAmI`

```typescript
whoAmI(): PortResult<string>
```

**Returns:** `PortResult<string>` — The signed-in login, read through the existing ghCurrentLogin run inside the classified runner.

**Errors:**
- `missing-signin` when gh reports no sign-in, or ghCurrentLogin throws its 'returned no login' error for empty output, which whoAmI converts to this kind.
- `missing-tool` when The gh program is not installed.
- `unreachable` when Timeout or network failure.

**Postconditions:**
- No state changed
- ghCurrentLogin keeps throwing an Error on an empty login with the same 'returned no login' message, so the tasks.test.ts assertions hold

### 2.3 `readAssignee`

```typescript
readAssignee(issue: IssueRef): PortResult<string | null>
```

**Parameters:**
- `issue: IssueRef` — owner/repo#N reference.

**Returns:** `PortResult<string | null>` — The single assignee login, or null when unassigned.

**Errors:**
- `rejected` when More than one assignee, a malformed reference, or the issue does not exist.
- `unreachable` when Timeout or network failure.

**Preconditions:**
- claim capability declared

**Postconditions:**
- Read live every call, never cached

### 2.4 `setAssignee`

```typescript
setAssignee(issue: IssueRef, who: string | null): PortResult<void>
```

**Parameters:**
- `issue: IssueRef` — owner/repo#N reference.
- `who: string | null` — Login to assign, or null to clear every assignee.

**Returns:** `PortResult<void>` — Success only after a re-read shows exactly the requested assignee set.

**Errors:**
- `rejected` when The tracker refuses the assignment, the reference is malformed, or the re-read shows a set other than the requested one (partial state).
- `unreachable` when A step timed out; the resulting state is unknown, is reported as such, and no step is retried.

**Preconditions:**
- claim capability declared

**Postconditions:**
- The steps are: read the current assignees, remove every assignee other than who, add who (or remove all when who is null), re-read and compare
- On success the issue has exactly the requested assignee, or none for null

### 2.5 `createIssue`

```typescript
createIssue(spec: IssueSpec): PortResult<IssueRef>
```

**Parameters:**
- `spec: IssueSpec` — Title, body, readonly labels, optional issueType and optional parent.

**Returns:** `PortResult<IssueRef>` — The reference of the created issue; wraps issueOps.create and returns only its ref.

**Errors:**
- `rejected` when The tracker refuses the create.
- `unreachable` when Timeout or network failure: returned as is and never followed by a second create.

**Preconditions:**
- issue-create capability declared

**Postconditions:**
- A typed create is retried untyped only when the failure is a confirmed issue-type rejection (compatibility exception 1)
- For Epic, Story and Task specs the labels, issue type and parent link match the current ghCreateIssueTyped and ghLinkSubIssue calls; a failed parent link does not fail the create

### 2.6 `findIssue`

```typescript
findIssue(labels: string[]): PortResult<IssueRef | null>
```

**Parameters:**
- `labels: string[]` — Labels the issue must carry, as in the sc1 sketch.

**Returns:** `PortResult<IssueRef | null>` — The first matching issue the list returns, or null when none exists.

**Errors:**
- `unreachable` when A failed or timed-out lookup is an error, never reported as not found.

**Postconditions:**
- First-result selection as in ghFindIssueByLabels, not a sort or minimum
- Not found is ok with null; failure is ok:false
- The two legacy callers of the lookup map ok:false to undefined, as ghFindIssueByLabels does today (autoPushEpicOnHld's adoption lookup and the bugfix close deps' findByLabels)

### 2.7 `openSignoffRequest`

```typescript
openSignoffRequest(spec: SignoffRequestSpec): PortResult<SignoffRequestRef>
```

**Parameters:**
- `spec: SignoffRequestSpec` — Minimal request spec that s7 extends.

**Returns:** `PortResult<SignoffRequestRef>` — Never ok for GitHub in s1.

**Errors:**
- `rejected` when signoff-request is not declared by the GitHub adapter.

**Postconditions:**
- No tracker call is made

### 2.8 `readSignoffState`

```typescript
readSignoffState(ref: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'>
```

**Parameters:**
- `ref: SignoffRequestRef` — Request reference.

**Returns:** `PortResult<'open' | 'changes-requested' | 'completed'>` — Never ok for GitHub in s1.

**Errors:**
- `rejected` when completion is not declared by the GitHub adapter.

**Postconditions:**
- No tracker call is made

### 2.9 `issueOps`

```typescript
readonly issueOps: IssueOps  // interface IssueOps { create(spec: IssueSpec): PortResult<CreatedIssue>; linkSubIssue(parent: IssueRef, childId: number): PortResult<void>; close(issue: IssueRef): PortResult<void>; comment(issue: IssueRef, body: string): PortResult<void>; readBody(issue: IssueRef): PortResult<string>; writeBody(issue: IssueRef, body: string): PortResult<void>; ensureLabel(name: string): boolean; ensureMilestone(title: string): void; attachMilestone(issue: IssueRef, title: string): PortResult<void>; }
```

**Returns:** `IssueOps` — The grouped issue operations over the existing wrappers ghCreateIssueTyped, ghLinkSubIssue (native numeric child id, as the bugfix dependency passes it), ghCloseIssue, ghComment, ghGetIssueBody, ghEditIssueBody, ghCreateLabel, ghEnsureMilestone and ghAttachMilestone, bound to one owner and repo.

**Errors:**
- `rejected` when The tracker refuses an operation, or the reference is malformed.
- `unreachable` when A gh command timed out or the host is unreachable; a create is never repeated after it.
- `missing-tool` when The gh program is not installed.
- `missing-signin` when gh is installed but not signed in.

**Preconditions:**
- issue-create capability declared

**Postconditions:**
- ONE unwrapping rule: every operation whose wrapper reported failure by throwing (create, linkSubIssue, close, comment, readBody, writeBody, attachMilestone) is unwrapped at its caller or dep adapter by throwing an Error on ok:false, so each existing catch, bestEffort guard and propagation behaves as before
- Exactly three exceptions keep their non-throwing legacy result: lookups map findIssue ok:false to undefined, ensureLabel keeps ghCreateLabel's boolean (false on any error, including a timeout), ensureMilestone keeps swallowing a failed create
- Labels, order and persisted TrackerMeta in tracker-auto are unchanged

### 2.10 `ghCreateIssueTyped`

```typescript
ghCreateIssueTyped(owner: string, repo: string, title: string, body: string, labels: readonly string[], issueType?: string): CreatedIssue
```

**Parameters:**
- `labels: readonly string[]` — Labels for the new issue; kept readonly exactly as in github.ts and TrackerCreateDeps.createIssue.
- `issueType: string` _(optional)_ — Optional GitHub issue type.

**Returns:** `CreatedIssue` — Unchanged result shape { ref, id, typed }; issueOps.create wraps it.

**Errors:**
- `GhCommandError` when Now carries kind and reason; the untyped retry happens only for a confirmed issue-type rejection.

**Postconditions:**
- Compatibility exception 1: today every typed-create failure is swallowed and followed by an untyped POST; after s1 only a confirmed issue-type rejection is, so a typed POST that timed out or failed for another reason is not followed by a second POST, for solo callers too

### 2.11 `defaultTrackerCreateDeps`

```typescript
defaultTrackerCreateDeps(opts?: { readonly labels?: readonly string[]; readonly promptOnLostRef?: PromptOnLostRef }): TrackerCreateDeps
```

**Parameters:**
- `opts: { readonly labels?: readonly string[]; readonly promptOnLostRef?: PromptOnLostRef }` _(optional)_ — Existing options, preserved unchanged.

**Returns:** `TrackerCreateDeps` — Bugfix create dependencies wired through the GitHub adapter bound to the owner and repo of each call; createIssue keeps returning CreatedIssue and linkSubIssue keeps taking the numeric child id and throwing on failure.

**Postconditions:**
- TrackerCreateDeps is unchanged and createBugfixTrackerIssue still passes created.id to linkSubIssue
- linkToParent still returns true after a successful link and false only when the dep throws
- The opts argument keeps its current meaning

### 2.12 `defaultTrackerCloseDeps`

```typescript
defaultTrackerCloseDeps(opts?: { readonly labels?: readonly string[]; readonly promptOnLostRef?: PromptOnLostRef }): TrackerCloseDeps
```

**Parameters:**
- `opts: { readonly labels?: readonly string[]; readonly promptOnLostRef?: PromptOnLostRef }` _(optional)_ — Existing options, preserved unchanged; the relink-by-label recovery needs the same non-empty labels as the create side.

**Returns:** `TrackerCloseDeps` — closeIssue goes through issueOps.close and throws on failure; findByLabels goes through the adapter's findIssue and maps ok:false to undefined exactly as ghFindIssueByLabels does today.

**Postconditions:**
- closeBugfixTrackerIssue still propagates a failed close instead of returning status closed
- In the relink-by-label recovery a found match is recorded with recordRef, closed through issueOps.close and returned as status closed with the ref, exactly as today
- No labels, no match and a mapped lookup failure each return a skipped status, exactly as today; the recovery never creates an issue
- TrackerCloseDeps is unchanged

## 3. Data model changes

### 3.1 `TrackerPort, PortResult, Capability, IssueSpec, SignoffRequestSpec, SignoffRequestRef, IssueOps, CreatedIssue` — new

New types in src/workflow/tracker/port.ts: the sc1 sketch plus the issueOps field of the amendment. IssueSpec is title, body, readonly labels, optional issueType, optional parent; the signoff types are minimal placeholders that s7 extends by amendment. CreatedIssue is the existing { ref, id, typed } shape; IssueOps.linkSubIssue takes the native numeric child id so it matches the unchanged bugfix dependency.

**Call sites:**
- `src/workflow/tracker/port.ts`

### 3.2 `GitHub adapter factory` — new

A factory bound to one owner and repo, needing no policy and no strict configuration, used by lenient fail-open callers (tracker-auto push functions, the bugfix deps, questions.ts) so a repo without the policy file behaves exactly as before apart from the two recorded compatibility exceptions. loadTracker builds the same adapter after the strict checks.

**Call sites:**
- `src/workflow/tracker-auto.ts:93`
- `src/workflow/bugfix/tracker.ts:419-456`
- `src/workflow/questions.ts:466-481`

### 3.3 `GhCommandError` — new

Error carrying kind (missing-tool, missing-signin, unreachable, rejected) and reason, thrown by the new runGh runner that applies a 10 s timeout and classifies spawn ENOENT as missing-tool and an authentication failure as missing-signin. The migrated wrappers move onto runGh: the issue operations, ghCreateLabel and ghCurrentLogin. Their other callers are AFFECTED and named: (a) src/workflow/tracker/setup.ts ensureLabels calls ghCreateLabel for every setup label and inherits the 10 s timeout with unchanged failure behaviour (false on any error, so a timed-out label is recorded as failed); (b) listMyOpenTasks in github.ts is ghCurrentLogin's only non-test caller: its login read gains the 10 s timeout and a classified GhCommandError, still a thrown Error, and an empty login still throws the 'returned no login' message, so a login failure still propagates out of listMyOpenTasks before any search call. The 10 s timeout is compatibility exception 2 (HLD NFR). The other setup.ts functions, ghGetIssueState in sync.ts, queryTasks and commitAndPushArtifacts keep their current exec path. whoAmI maps ghCurrentLogin's thrown 'returned no login' error to missing-signin.

**Call sites:**
- `src/workflow/tracker/github.ts:23-39`
- `src/workflow/tracker/github.ts:111-120`
- `src/workflow/tracker/github.ts:122-129`
- `src/workflow/tracker/github.ts:408-412`
- `src/workflow/tracker/github.ts:505-507`
- `src/workflow/tracker/setup.ts:204-215`

### 3.4 `StrictTrackerTarget` — new

Result of the strict resolver used only by loadTracker. Precedence follows resolveGithubConfig: the repo's own entry first (explicit owner and repo, or type github falling back to the origin remote, an omitted type accepted when owner and repo are present); the default entry supplies enablement only and its owner and repo are never a target; type none, malformed JSON, a non-object file or entry, an unsupported type and a bad owner or repo are refusals. The lenient resolveGithubConfig is unchanged.

**Call sites:**
- `src/workflow/config/github.ts:151-160`
- `src/workflow/config/github.ts:196-262`

### 3.5 `Compatibility exceptions to DEF ac3 and k4` — invariant-change

Two deliberate, recorded differences from today's results, both reaching solo callers: (1) the typed create no longer retries untyped after a failure that is not a confirmed issue-type rejection (ghCreateIssueTyped today swallows every typed-create failure and retries, which can duplicate an issue after a timed-out committed POST); (2) migrated operations are bounded by the 10 s timeout from the HLD NFR, including setup label creation and the login read in listMyOpenTasks. Invariants c1 and c11 hold except for these two exceptions. They are surfaced for the user to accept.

**Call sites:**
- `src/workflow/tracker/github.ts:151-175`
- `src/workflow/tracker/github.ts:23-39`

### 3.6 `Migrated call sites and their legacy failure results` — invariant-change

tracker-auto.ts, bugfix/tracker.ts and questions.ts call the adapter instead of the wrappers under the one unwrapping rule: operations that threw are unwrapped by throwing, so bugfix linkToParent returns false in its catch, closeBugfixTrackerIssue propagates a failed close, the tracker-auto create try/catch and bestEffort calls and the questions.ts comment catch behave as before. Three exceptions keep their non-throwing legacy result: autoPushEpicOnHld's adoption lookup (called before the create try/catch and outside bestEffort) and the bugfix close deps' findByLabels map findIssue ok:false to undefined, ensureLabel returns a boolean, ensureMilestone swallows a failed create. Invariants c1 and c11 hold: same gh arguments, same order and the same persisted TrackerMeta, apart from the two compatibility exceptions. s4 refactors the orchestration of the three push functions afterwards on top of these call sites.

**Call sites:**
- `src/workflow/tracker-auto.ts:102`
- `src/workflow/tracker-auto.ts:123`
- `src/workflow/tracker-auto.ts:130-155`
- `src/workflow/tracker-auto.ts:165`
- `src/workflow/tracker-auto.ts:213-230`
- `src/workflow/tracker-auto.ts:245`
- `src/workflow/tracker-auto.ts:290-310`
- `src/workflow/tracker-auto.ts:345-362`
- `src/workflow/bugfix/tracker.ts:142`
- `src/workflow/bugfix/tracker.ts:176`
- `src/workflow/bugfix/tracker.ts:191-208`
- `src/workflow/bugfix/tracker.ts:266-287`
- `src/workflow/bugfix/tracker.ts:290-325`
- `src/workflow/questions.ts:466-481`

### 3.7 `Operations that stay outside the port` — invariant-change

ghGetIssueState in src/workflow/tracker/sync.ts (the issue-status read, which the HLD defers to the define extend); queryTasks (a graphql task search) and the query step of listMyOpenTasks, which keep their current execution path and have no non-test caller outside github.ts; the setup.ts functions other than label creation (ghTokenScopes, org issue types and projects: one-shot admin bootstrap, not a gate-time operation); and commitAndPushArtifacts (a git operation used by questions.ts, resolve-comment.ts and src/cli/services/workflow.ts). ghAuthOk stays exported for sync.ts and setup.ts. All keep today's behaviour and execution path.

**Call sites:**
- `src/workflow/tracker/sync.ts`
- `src/workflow/tracker/github.ts:474`
- `src/workflow/tracker/github.ts:505-507`
- `src/workflow/tracker/setup.ts`
- `src/workflow/questions.ts:59`
- `src/workflow/resolve-comment.ts`

### 3.8 `TrackerCreateDeps` — field-modify

Default wiring only; the interface is unchanged, createIssue keeps returning CreatedIssue and linkSubIssue keeps taking the numeric child id, so the current-behaviour invariant that the bugfix parent link uses created.id is preserved.

**Call sites:**
- `src/workflow/bugfix/tracker.ts:106-130`
- `src/workflow/bugfix/tracker.ts:419-436`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns sc1 and implements the sketch exactly. GitHub declares claim and issue-create only; signoff-request and completion are undeclared so loadTracker refuses a policy that needs them, and the signoff methods return rejected without a tracker call. To deliver the HLD's full extraction scope, s1 proposes one additive amendment: the issueOps field (sharedContract.fieldAdd, breaking false); the sketch methods are unchanged so s4, s5 and s7 are unaffected. Supersession: the owner decided in chat on 2026-10-17 that s1 supersedes the unbuilt tracker-tool LLD-38436e90625a83a2-S001 (approvedAt unset). The durable record is the 'Superseded (2026-10-17)' note under that LLD's title in docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md, which settles the conflicting approval status the HLD names; its companion LLD-9a7bbe63297457c2-S001 needs its own decision. sc1 is the one tracker abstraction. |

## 5. Error paths

**Error cases**

- **gh is not installed** (recoverable)
  - Detection: runGh sees a spawn failure with code ENOENT for the gh program.
  - Response: Throws GhCommandError kind missing-tool; loadTracker and whoAmI return ok:false naming gh as the missing tool.
  - User impact: The developer is told gh is missing and to install it; no gate is skipped.
- **gh is installed but not signed in** (recoverable)
  - Detection: gh auth status exits non-zero with its not-logged-in message, or a command fails with an authentication message.
  - Response: GhCommandError kind missing-signin; loadTracker returns ok:false naming the sign-in, with the gh auth login hint.
  - User impact: The developer is told to sign in; the error is distinct from a missing tool.
- **whoAmI gets an empty login** (recoverable)
  - Detection: ghCurrentLogin throws its 'returned no login' Error for empty output; the adapter catches that exception around the call and recognises it by its message.
  - Response: whoAmI returns ok:false kind missing-signin rather than an empty actor; ghCurrentLogin still throws the same message, so the tasks.test.ts assertion holds.
  - User impact: The gate never treats an empty string as the acting user.
- **The login read inside listMyOpenTasks fails or times out** (recoverable)
  - Detection: ghCurrentLogin, now on the classified runner, throws a GhCommandError (missing tool, missing sign-in or unreachable) or its 'returned no login' Error; listMyOpenTasks does not catch it.
  - Response: The error propagates out of listMyOpenTasks before queryTasks runs, so no search call is made; it is still a thrown Error as before, now carrying a kind.
  - User impact: A caller of listMyOpenTasks sees the same kind of failure as before with a clearer reason and a bounded wait.
- **A gh command takes longer than 10 seconds (compatibility exception 2)** (recoverable)
  - Detection: The exec timeout option set by runGh fires and the child is killed (ETIMEDOUT or killed signal).
  - Response: GhCommandError kind unreachable with the timeout reason; a create is never repeated after it. Callers keep their own failure handling (a catch, bestEffort or propagation).
  - User impact: The action is refused with the reason instead of hanging; for a create the outcome is unknown and the user is told to check the tracker before retrying.
- **A setup label create takes longer than 10 seconds** (recoverable)
  - Detection: ghCreateLabel's migrated runGh call hits the timeout; ghCreateLabel catches the error as it catches every error.
  - Response: ghCreateLabel returns false, so setup ensureLabels records the label as failed exactly as for any other failure.
  - User impact: The setup step reports the label as failed instead of hanging; the rest of the setup is unaffected.
- **Typed create times out or fails for a reason other than the type (compatibility exception 1)** (recoverable)
  - Detection: The typed POST fails with kind unreachable, missing-tool, missing-signin or a rejected failure whose message is not an issue-type rejection.
  - Response: issueOps.create returns the failure as is; there is no untyped retry, so no duplicate issue is created. Today such a failure is swallowed and followed by an untyped POST.
  - User impact: No duplicate; the caller may use findIssue by labels to adopt a committed issue. This is a recorded difference from today for solo callers too.
- **The organisation does not support issue types** (recoverable)
  - Detection: The typed POST fails with kind rejected and a message that the issue type is unknown or unsupported.
  - Response: Retry once untyped and return the ref with typed false, as today.
  - User impact: The issue is created without a type, same as today.
- **A sub-issue link fails in the bugfix path** (recoverable)
  - Detection: The deps adapter unwraps ok:false from issueOps.linkSubIssue by throwing; linkToParent catches it.
  - Response: linkToParent returns false exactly as when ghLinkSubIssue threw; the create still succeeds with linked false.
  - User impact: Same as today: the issue is created and reported as not linked.
- **A close fails in the bugfix path** (recoverable)
  - Detection: The deps adapter unwraps ok:false from issueOps.close by throwing; closeBugfixTrackerIssue does not catch it.
  - Response: The error propagates instead of the function returning status closed, exactly as when ghCloseIssue threw.
  - User impact: A failed close is never reported as closed.
- **A question comment fails in questions.ts** (recoverable)
  - Detection: The call site unwraps ok:false from issueOps.comment by throwing inside the existing try; its catch logs 'tracker comment failed (best-effort)'.
  - Response: The failure is logged and swallowed, as when ghComment threw.
  - User impact: No change to what a user sees.
- **A migrated operation inside tracker-auto's create try/catch or bestEffort fails** (recoverable)
  - Detection: The call site unwraps the PortResult and throws when ok is false; the existing try/catch reports a failed result and bestEffort catches and logs.
  - Response: The failure is reported or swallowed exactly as the thrown wrapper error was before; the push continues where it did before.
  - User impact: No change to what a user sees when a step fails.
- **The adoption lookup in autoPushEpicOnHld fails** (recoverable)
  - Detection: The adapter's findIssue returns ok:false; the call site, which sits before the create try/catch and outside bestEffort, maps ok:false to undefined instead of throwing.
  - Response: adopted is undefined, so the function goes on to create the Epic issue exactly as it does today when ghFindIssueByLabels fails (a pre-existing behaviour, kept for k4 and not changed in s1).
  - User impact: Same as today; no new uncaught exception on a failed lookup.
- **The label lookup used by the relink-by-label recovery fails** (recoverable)
  - Detection: The adapter's findIssue returns ok:false for a failed or timed-out lookup.
  - Response: The bugfix close deps map ok:false to undefined, exactly as ghFindIssueByLabels did; onLostRefOnClose returns a skipped status with 'relink-by-label found no matching issue'.
  - User impact: Same skipped message as today; the recovery never creates an issue.
- **github.json is malformed, not an object, or the entry is not an object** (recoverable)
  - Detection: The strict resolver parses the file itself and checks the shape; a JSON parse error or a wrong type is detected.
  - Response: loadTracker returns ok:false kind rejected naming the file problem; the lenient resolver is not consulted as a fallback. Lenient callers using the adapter factory are unaffected.
  - User impact: The developer is told which file is broken when a team feature needs the tracker; solo flows keep their current behaviour.
- **Unsupported tracker type, bad owner or repo, type none, or no resolvable target** (recoverable)
  - Detection: The strict resolver checks the type is github (or omitted with owner and repo), owner and repo are non-empty valid names, and the origin remote parses when it is the fallback.
  - Response: loadTracker returns ok:false kind rejected naming the field.
  - User impact: A policy that needs a tracker is refused rather than assumed to be GitHub.
- **Only the default entry names an owner and repo** (recoverable)
  - Detection: The strict resolver ignores owner and repo on the default entry, as resolveGithubConfig does.
  - Response: The target resolves from the repo's own entry or the origin remote, or loadTracker refuses when neither exists.
  - User impact: A global default can never point a repo at another repo's issues.
- **Policy needs a capability the tracker does not declare (signoff-request or completion on GitHub)** (terminal)
  - Detection: missingCapabilities(declared, needed) is non-empty.
  - Response: loadTracker returns ok:false kind rejected with the missing capability names; no reduced mode.
  - User impact: The team is told exactly what the tracker cannot do.
- **Issue has more than one assignee** (recoverable)
  - Detection: readAssignee sees an assignees array longer than one.
  - Response: Returns ok:false kind rejected naming the assignees; never picks one.
  - User impact: The claim is not honoured until the tracker shows a single assignee.
- **setAssignee leaves a partial state** (recoverable)
  - Detection: After removing and adding, the re-read assignee set differs from the requested set, or a step fails midway.
  - Response: Returns ok:false kind rejected (state differs) or unreachable (a step timed out, state unknown); no step is retried and the actual set is named in the reason.
  - User impact: The caller sees the real state and decides; the gate never treats a partial change as a successful claim.
- **Lookup by labels fails for a team feature** (recoverable)
  - Detection: The strict label lookup exits non-zero or times out, as opposed to returning an empty list.
  - Response: findIssue returns ok:false; an empty result returns ok with null. New team callers must check the result.
  - User impact: A failed lookup is never mistaken for not found by a caller that checks the result.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| needed is empty | loadTracker still validates configuration, gh and sign-in and returns the port. |
| A capability name in needed that is not one of the four | Reported as missing by name and refused. |
| Issue ref not in owner/repo#N form | Every operation taking an issue returns ok:false kind rejected without calling gh. |
| setAssignee(issue, null) on an unassigned issue | Succeeds with no assignee and no removal call. |
| setAssignee to a user when the issue has zero, one (the same user), one (another user) or several assignees | Ends with exactly that user as the only assignee, verified by the re-read; an already-correct set makes no change call. |
| findIssue with several matching issues | Returns the first result the list returns, as ghFindIssueByLabels does today. |
| Relink-by-label recovery finds a match | The match is recorded with recordRef, closed through issueOps.close and returned as status closed with that ref. |
| Relink-by-label recovery with no labels, no match, or a mapped lookup failure | Each returns a skipped status with the same reason text as today. |
| listMyOpenTasks with a working login | Resolves the current login and runs the same search as before (assignee:<me> is:open); only the login read is timed. |
| issueOps.linkSubIssue called with the numeric id from created.id | Runs the same sub_issues POST with sub_issue_id as ghLinkSubIssue does; no other CreatedIssue field is needed or passed. |
| Own entry has owner and repo but no type | Accepted as GitHub, as resolveGithubConfig accepts it. |
| Own entry has type github and no owner or repo | The target comes from the origin remote; loadTracker refuses when the remote does not parse. |
| issueOps.close on an already-closed issue | Succeeds as a no-op, as ghCloseIssue does today. |
| issueOps.ensureMilestone when the milestone already exists | The 422 is swallowed and the following attach proceeds, as today. |
| defaultTrackerCreateDeps and defaultTrackerCloseDeps called with and without opts | Both accept the optional labels and promptOnLostRef exactly as today; with no labels the relink-by-label recovery reports 'no labels' as today. |
| A readonly string[] passed as the labels of the detailed create | Accepted without a copy or cast, so assignment to TrackerCreateDeps.createIssue still type-checks. |
| Epic, Story and Task specs with parent | The same labels, type and sub-issue link as the current autoPush calls; a failed parent link does not fail the create. |

**Invariants to preserve**

- A repo without the policy file behaves exactly as today, except for the two recorded compatibility exceptions (the narrowed typed-create retry and the 10 s timeout): lenient config and fail-open gh handling are kept because tracker-auto, the bugfix deps and questions.ts use the adapter factory, not the strict loadTracker; no tracker call is added. [[c1]]
- The results of the existing GitHub create, find, link, label, milestone, body, comment and close operations are the same through the port as before, except for the two recorded compatibility exceptions: same gh arguments, same order, same persisted TrackerMeta, the same failure result at every call site through the one unwrapping rule and its three named exceptions, and the bugfix create still hands created.id and the typed flag to its callers. [[c11]]
- No tracker secrets are stored by insrc; sign-in stays with the gh CLI. [[c12]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), with the fake gh seam _setTrackerExecForTests`

**Test levels**

- **unit** — Prove the pure rules: capability check, strict target resolution, failure classification, assignee handling.
  - Subjects: `missingCapabilities names every capability the tracker does not declare`, `strict resolver refuses malformed JSON, a non-object file or entry, an unsupported type, a bad owner or repo, and type none`, `strict resolver accepts an own entry with owner and repo and no type, and an own entry with type github that falls back to the origin remote`, `strict resolver never takes a target from the default entry's owner and repo`, `runGh classifies ENOENT as missing-tool, an authentication failure as missing-signin, a timeout as unreachable and anything else as rejected`, `readAssignee returns the single login, null when unassigned, and rejected for more than one assignee or a malformed reference`, `setAssignee starting from zero, one (same user), one (another user) and several assignees ends with exactly the requested user, makes no change call when the set is already right, clears every assignee for null, and reports rejected or unreachable without a retry when the re-read differs or a step times out`
  - Fixtures: `fake gh through _setTrackerExecForTests with a mutable assignee list`, `scratch HOME with a github.json and a scratch repo with an origin remote`
- **contract** — Pin the GitHub adapter against the TrackerPort contract and against the exact gh arguments and failure results of the existing wrappers, operation by operation, and pin the two compatibility exceptions.
  - Subjects: `createIssue and issueOps.create yield the same gh commands, labels, issue type and parent link as ghCreateIssueTyped and ghLinkSubIssue for an Epic, a Story (with Epic parent) and a Task (with Story parent)`, `compatibility exception 1: a typed create that fails with a timeout, a missing tool, a missing sign-in or a non-type rejection is not followed by a second create, whereas the old behaviour would have retried untyped; this test states the old and the new behaviour side by side`, `a typed create rejected as an unknown issue type is retried once untyped and reports typed false`, `findIssue returns the first result like ghFindIssueByLabels when several issues match, ok with null when nothing matches, and ok:false when the lookup fails`, `issueOps.linkSubIssue(parent, childId), close, comment, readBody, writeBody, ensureLabel, ensureMilestone and attachMilestone each run the same gh argv as ghLinkSubIssue, ghCloseIssue, ghComment, ghGetIssueBody, ghEditIssueBody, ghCreateLabel, ghEnsureMilestone and ghAttachMilestone, compared with a recording fake gh`, `ensureLabel returns false on failure, ensureMilestone swallows a failed create, closing a closed issue succeeds`, `compatibility exception 2: a migrated operation that exceeds 10 s is killed and reported as unreachable, and the fake exec receives the timeout option`, `whoAmI returns the login on success, converts ghCurrentLogin's thrown 'no login' error to missing-signin, and fails with missing-tool for a missing gh, missing-signin for an unauthenticated gh, and unreachable for a timeout`, `signoff-request and completion are undeclared and the signoff methods return rejected without running gh`
  - Fixtures: `recording fake gh that captures every argv and the options passed`, `Epic, Story and Task IssueSpec fixtures taken from tracker-auto.ts`
- **integration** — Prove loadTracker end to end and that every migrated caller, and every other caller of a migrated wrapper, behaves as before including its failure result.
  - Subjects: `loadTracker succeeds when gh is present and signed in and every needed capability is declared (claim, issue-create)`, `loadTracker refuses a policy needing signoff-request, naming it, and runs no reduced mode`, `loadTracker names gh as the missing tool when gh is not found, and names the sign-in when gh is not signed in`, `autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan produce the same gh argv sequence, the same best-effort behaviour on a failing step and the same persisted TrackerMeta as before, with the adapter factory and lenient configuration, including fail-open when gh is unavailable`, `autoPushEpicOnHld with a failing adoption lookup does not throw and still goes on to create the Epic issue, as today`, `a failing tracker-auto create is reported as a failed result by the existing try/catch, not thrown`, `questions.ts posts its comment through the adapter with the same argv, and a failed comment is logged in its catch`, `setup ensureLabels with a label create that times out records that label as failed and continues with the others, as for any failure`, `listMyOpenTasks still resolves the current login and runs the same search; a login failure (missing tool, missing sign-in, timeout) and an empty login each propagate as a thrown Error out of listMyOpenTasks before any search call is made, and the empty-login message still matches /no login/`, `queryTasks keeps its current execution path and results`, `defaultTrackerCreateDeps still returns CreatedIssue with ref, id and typed, createBugfixTrackerIssue still passes created.id to linkSubIssue, and a readonly string[] of labels type-checks against TrackerCreateDeps.createIssue`, `a failed sub-issue link makes linkToParent return false and the create still reports created with linked false`, `a failed close makes closeBugfixTrackerIssue propagate the error instead of returning status closed`, `the relink-by-label recovery with a lookup match records the ref with recordRef, closes it through issueOps.close and returns status closed with that ref`, `the relink-by-label recovery with no labels, with no match, and with a failed lookup mapped to undefined each return a skipped status with the same reason text as today and never create an issue`, `both default deps factories accept the optional labels and promptOnLostRef as today, including the 'no labels' result of the recovery when none are given`, `existing tracker.test.ts, tasks.test.ts (including the empty-login throw), setup.test.ts, tracker-auto.test.ts, tracker-tasks.test.ts and bugfix-tracker.test.ts keep passing unchanged, except the existing tests that pin the old catch-everything typed-create retry, which are updated to the new retry policy`
  - Fixtures: `fake gh through _setTrackerExecForTests`, `scratch repo with and without github.json`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/tracker/__tests__/port.test.ts: loadTracker succeeds when every needed capability is declared`, `src/workflow/tracker/__tests__/port.test.ts: loadTracker with an empty needed set validates configuration and sign-in` |
| `ac2` | `src/workflow/tracker/__tests__/port.test.ts: loadTracker refuses a needed signoff-request capability naming it`, `src/workflow/tracker/__tests__/port.test.ts: missingCapabilities names every missing capability`, `src/workflow/tracker/__tests__/port.test.ts: strict resolver refuses malformed or unsupported configuration`, `src/workflow/tracker/__tests__/port.test.ts: strict resolver never takes a target from the default entry` |
| `ac3` | `src/workflow/tracker/__tests__/github-adapter.test.ts: Epic create parity with ghCreateIssueTyped`, `src/workflow/tracker/__tests__/github-adapter.test.ts: Story create and Epic parent link parity`, `src/workflow/tracker/__tests__/github-adapter.test.ts: Task create and Story parent link parity`, `src/workflow/tracker/__tests__/github-adapter.test.ts: compatibility exception 1, a failed typed create is not retried untyped unless the type is rejected`, `src/workflow/tracker/__tests__/github-adapter.test.ts: compatibility exception 2, a migrated operation passes the 10 s timeout and a timeout is reported as unreachable`, `src/workflow/tracker/__tests__/github-adapter.test.ts: findIssue returns the first of several matches and separates failure from not found`, `src/workflow/tracker/__tests__/github-adapter.test.ts: each issueOps operation runs the same gh argv and keeps the same failure result as its wrapper`, `src/workflow/__tests__/tracker-auto.test.ts: the three push functions keep their gh sequence, best-effort behaviour and TrackerMeta through the adapter`, `src/workflow/__tests__/tracker-auto.test.ts: a failing adoption lookup still leads to a create and does not throw`, `src/workflow/__tests__/tracker-auto.test.ts: a failing create is reported as a failed result, not thrown`, `src/workflow/__tests__/bugfix-tracker.test.ts: bugfix create keeps CreatedIssue, readonly labels and the parent link through the adapter`, `src/workflow/__tests__/bugfix-tracker.test.ts: a failed link makes linkToParent return false and a failed close propagates instead of reporting closed`, `src/workflow/__tests__/bugfix-tracker.test.ts: relink-by-label match is recorded, closed and returned as closed; no labels, no match and a failed lookup return skipped`, `src/workflow/__tests__/bugfix-tracker.test.ts: both default deps factories keep their optional opts`, `src/workflow/tracker/__tests__/setup.test.ts: ensureLabels with a timing-out label create records the label as failed`, `src/workflow/tracker/__tests__/tasks.test.ts: listMyOpenTasks propagates a classified or empty login failure before any search call`, `src/workflow/__tests__/questions.test.ts: a failed tracker comment is logged in the existing catch` |
| `ac4` | `src/workflow/tracker/__tests__/port.test.ts: loadTracker names gh as the missing tool`, `src/workflow/tracker/__tests__/port.test.ts: loadTracker names the missing sign-in`, `src/workflow/tracker/__tests__/github-adapter.test.ts: runGh classifies ENOENT, authentication failure and timeout`, `src/workflow/tracker/__tests__/github-adapter.test.ts: whoAmI success, empty login converted to missing-signin, missing tool, missing sign-in and unreachable` |

## 7. Alternatives considered

### 7.1 a1: Full extraction through one grouped IssueOps field added to sc1 by a single additive amendment, one failure-unwrapping rule with three named exceptions, and recorded compatibility exceptions — **CHOSEN**

TrackerPort keeps its sketch methods and gains one readonly issueOps: IssueOps field (fieldAdd, breaking false) whose linkSubIssue takes the numeric child id; every caller that relied on a thrown error unwraps ok:false by throwing; the narrowed typed-create retry and the 10 s timeout are recorded as the two compatibility exceptions.



### 7.2 a2: One sc1 methodAdd amendment per operation

Add closeIssue, addComment, readIssueBody, writeIssueBody, linkSubIssue, ensureLabel, ensureMilestone and attachMilestone to TrackerPort individually.



**Rejected because:** Same behaviour with far more contract churn: eight amendments to a contract s4, s5 and s7 consume.

### 7.3 a3: Keep the catch-everything typed-create retry and no timeout

Preserve both legacy behaviours exactly so no compatibility exception is needed.



**Rejected because:** Keeps the duplicate-issue hazard the earlier reviews flagged and contradicts the HLD NFR that every tracker command has a 10 second timeout.

## 8. References

- **[[c1]]** `analyze-bundle` `src/workflow/config/github.ts:196-262`
- **[[c11]]** `analyze-bundle` `src/workflow/tracker-auto.ts:102`
- **[[c12]]** `analyze-bundle` `src/workflow/tracker/github.ts:111-120`
- **[[c13]]** `analyze-bundle` `src/workflow/tracker/github.ts:151-175`
- **[[c14]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:419-456`
- **[[c15]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c16]]** `analyze-bundle` `src/workflow/tracker/github.ts:408-412`
- **[[c17]]** `doc` `docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md`
- **[[c18]]** `analyze-bundle` `src/workflow/tracker-auto.ts:345-362`
- **[[c19]]** `analyze-bundle` `src/workflow/tracker/setup.ts:204-215`
- **[[c20]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:290-325`
- **[[c21]]** `analyze-bundle` `src/workflow/tracker/github.ts:505-507`
- **[[c22]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:191-208`
- **[[c23]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:266-287`

## 9. Open questions

- Compatibility exceptions for the user to accept: DEF ac3 and k4 say results are the same as before, but (1) the typed create no longer retries untyped after a failure that is not a confirmed issue-type rejection, and (2) migrated operations, including setup label creation and the login read in listMyOpenTasks, are bounded by the 10 s timeout from the HLD NFR. Both reach solo callers; both are pinned by tests; if either is unacceptable the alternative is to keep the old behaviour for the lenient callers.
- s1 now edits the tracker-auto call sites that s4 later refactors (shared issue-creation code, find-by-label dedupe). The split is: s1 switches the calls mechanically with no change to labels, order or persisted TrackerMeta; s4 refactors the orchestration afterwards on top of the port (it depends on sc1). s4's LLD should cite this.
- The adoption lookup in autoPushEpicOnHld creates the Epic issue when the lookup fails, which can duplicate an Epic after a transient lookup failure. This is a pre-existing behaviour kept unchanged for k4; s4's find-by-label dedupe work is the place to decide whether to change it.
- The companion design LLD-9a7bbe63297457c2-S001 (Epic, Story and Task entries in the same flow, retiring the three tracker workflows) was planned to be built with the superseded LLD-38436e90625a83a2-S001; it needs its own decision.
- GitHub declares neither signoff-request nor completion; a policy needing them is refused at load until a later story adds those capabilities.
- The 10 s timeout applies to the migrated operations, to setup label creation through ghCreateLabel and to the login read in listMyOpenTasks; queryTasks, the sync.ts status read and the rest of setup.ts keep no timeout until their own migration.

## Resolved questions

- `qcf73b12e` — Compatibility exceptions for the user to accept: DEF ac3 and k4 say results are the same as before, but (1) the typed create no longer retries untyped after a failure that is not a confirmed issue-type rejection, and (2) migrated operations, including setup label creation and the login read in listMyOpenTasks, are bounded by the 10 s timeout from the HLD NFR. Both reach solo callers; both are pinned by tests; if either is unacceptable the alternative is to keep the old behaviour for the lenient callers.
  - **resolved**: Accept both exceptions — Accepted by the owner when approving the s1 LLD on 2026-10-17; recorded in docs/plans/team-workflow.md. _(2026-10-17T10:20:04.310Z)_
- `qcf440188` — s1 now edits the tracker-auto call sites that s4 later refactors (shared issue-creation code, find-by-label dedupe). The split is: s1 switches the calls mechanically with no change to labels, order or persisted TrackerMeta; s4 refactors the orchestration afterwards on top of the port (it depends on sc1). s4's LLD should cite this.
  - **resolved**: Keep the staged split — This is the split in the approved LLD; s4's LLD will cite it. _(2026-10-17T10:21:05.794Z)_
- `q3bd77fe4` — GitHub declares neither signoff-request nor completion; a policy needing them is refused at load until a later story adds those capabilities.
  - **resolved**: Reject at load — Follows k8 and the approved LLD. _(2026-10-17T10:22:03.547Z)_
- `qfb7fb47f` — The 10 s timeout applies to the migrated operations, to setup label creation through ghCreateLabel and to the login read in listMyOpenTasks; queryTasks, the sync.ts status read and the rest of setup.ts keep no timeout until their own migration.
  - **resolved**: Keep the stated scope — Matches the approved LLD's timeout scope. _(2026-10-17T10:22:43.303Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/config/github.ts:196-262`
- **[[c11]]** `analyze-bundle` `src/workflow/tracker-auto.ts:102`
- **[[c12]]** `analyze-bundle` `src/workflow/tracker/github.ts:111-120`
- **[[c13]]** `analyze-bundle` `src/workflow/tracker/github.ts:151-175`
- **[[c14]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:419-456`
- **[[c15]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c16]]** `analyze-bundle` `src/workflow/tracker/github.ts:408-412`
- **[[c17]]** `doc` `docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md`
- **[[c18]]** `analyze-bundle` `src/workflow/tracker-auto.ts:345-362`
- **[[c19]]** `analyze-bundle` `src/workflow/tracker/setup.ts:204-215`
- **[[c20]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:290-325`
- **[[c21]]** `analyze-bundle` `src/workflow/tracker/github.ts:505-507`
- **[[c22]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:191-208`
- **[[c23]]** `analyze-bundle` `src/workflow/bugfix/tracker.ts:266-287`
