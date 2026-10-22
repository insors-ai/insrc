<!-- insrc:artifact HLD-315d510cb28100e2 -->

# HLD: team-signoff-claim-based-workflow

## Summary

The daemon-owned workflow library gains one team gate that runs in front of every action that changes a stage. In a repo with a policy file on its remote default branch, the gate reads the policy, asks the tracker live who is acting and who holds the stage, and either lets the action through or refuses it with a reason; signoff completion is added to the same gate by the signoff Story. In a repo without a policy the gate is skipped and behaviour is as today. The tracker is reached through one port that declares what it can do and is refused at load if the policy needs more; GitHub is the first adapter, made by moving the existing GitHub code behind that port. Existing artifact records stay readable: new tracker data is added alongside the old fields, never in place of them.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Problem context

> See **DEF-315d510cb28100e2** § 1. Problem

## 2. Framework summary

A daemon-side team gate over a synchronous, capability-declaring tracker port (alternative a1). The port (sc1) is the only way the workflow library talks to a tracker; GitHub is its first adapter, made by extracting the existing GitHub code (src/workflow/tracker, the issue calls in tracker-auto.ts, and the create and close calls in src/workflow/bugfix/tracker.ts) behind it. sc1 is the one tracker abstraction: the unbuilt tracker-tool design (LLD-38436e90625a83a2-s1) is not built as a second abstraction and is superseded or amended by s1's LLD. The policy (sc2) is read from the remote default branch and says which stages need signoff, whether claims are enforced, the claim units and the administrators. The artifact's tracker record keeps every existing meta.tracker field exactly as it is and gains additive per-unit data, plus an optional meta.revision (sc3). The team gate (sc4) takes a guarded action and returns an outcome. Signoff is a separate record (sc5) that never changes meta.review or approvedAt. Syncing tracker status on git pull and push, and the issue-status read it needs, are deferred with the later-tracker work to a define extend and are not part of this HLD.

## 3. Architecture shape

Request path: a client or MCP call reaches a daemon step. For a guarded action (author step, build, local approval, signoff submission, release, and the auto-fix part of either review path) the gate runs first. The gate loads the policy (sc2); if there is none it returns allowed without any tracker call. Otherwise it learns who is acting, resolves the stage unit and its issue from the artifact record (sc3), reads the assignee live through the tracker port (sc1), and returns one outcome: allowed, held-by-other (naming the holder), no-issue, awaiting-signoff, or refused-with-reason. Code-review and analyze never call the gate, and review is never refused (see Review below).

Caller identity. approveArtifactByJsonPath takes no caller identity, and the other gate sites have none either, so the gate derives who is acting itself: once per gate call it asks the tracker port for the signed-in user (whoAmI on sc1; for GitHub the login that ghCurrentLogin in src/workflow/tracker/github.ts already reads from the authenticated gh user). No function signature that callers use changes, including approveArtifactByJsonPath and its roughly 70 test callers. If the identity cannot be read, the action is refused with the port's reason (missing-signin or missing-tool). In a repo without a policy the gate returns before this read, so no identity call is made.

Gate sites. Daemon step entry points call the gate for author, build, open-signoff, revise, release and claim. Local approval is guarded inside approveArtifactByJsonPath in src/workflow/gates.ts, the one function every approval goes through: the terminal client calls it in-process from src/cli/services/workflow.ts and the MCP path reaches it through approveWorkflowTarget, so one gate call there covers both. This fits k1 because the code that enforces is the workflow library owned by the daemon package, with the same policy, tracker and artifact files for every caller; it is not a client or host connector, and no client can approve without passing through it. The gate stays synchronous, so the roughly 70 existing synchronous test callers of approveArtifactByJsonPath are unaffected.

Refusal path out of approval. approveArtifactByJsonPath signals a refusal only by throwing. When the gate returns a non-allowed outcome there, it throws a typed error, TeamGateRefusedError, that carries the outcome (its kind and reason), and it throws before any stamp is written, so a refused artifact is never partially stamped. approveWorkflowTarget catches TeamGateRefusedError next to ReviewBlockedError and routes it to skipped[] with the outcome's reason, so a batch approve (by epic hash) reports one reason per artifact instead of aborting partway after earlier artifacts were stamped. The terminal client reaches the same error through svc.workflow.approve in src/cli/services/workflow.ts, and its approve case in src/cli/command.ts today formats only an error named ReviewBlockedError and rethrows the rest, so that case is a change site owned by s5: it formats TeamGateRefusedError with the outcome's kind and reason instead of surfacing a raw exception.

Review. Review is never refused, because it reads the work and stamps meta.review. The review paths differ in what they write. findings.ts leaves the body untouched, so it is a meta-only write. Two paths run auto-fixes and rewrite the artifact body and markdown: verdicts.ts (the controller's review) and run-artifact.ts in src/workflow/review (the daemon's own review, covering both its pipeline path for a DEF and its one-session template path for a design). The auto-fix write of both is a content write and, in team mode, one guarded action ('review-fix'), under one rule. A reviewer who does not hold the claim gets a report-only review: meta.review is stamped, the body and markdown are untouched and the revision is not bumped. The holder, or any user in a repo without a policy, gets the auto-fixes, and the revision is bumped when the body changed. Code-review and analyze never write the artifact body and are never guarded.

No-issue outcome. The first author step on a unit that has no issue is allowed and triggers issue creation (shared code, s4) plus an implicit claim; any later guarded action on a unit still without an issue is refused with the creation failure reason, so a failed creation reads as 'cannot be claimed yet: reason' and is retried at the next claim attempt. Release is a guarded action: the gate lets the holder or a listed administrator release and refuses anyone else.

Signoff hooks. sc4 declares a completion hook that s5 ships unregistered. Signoff (s7) registers it: when a stage is attempted the hook reads the signoff request state through the port, produces the awaiting-signoff outcome while the request is open, and on completion releases the claim and records every artifact in the request as signed off together (sc5). s5 therefore does not depend on sc5.

Settings. Tracker settings live in one store: the per-repo map in github.json that resolveGithubConfig already reads; the shared settings catalog gains a repo-scoped kind of row whose reads and writes go to that map, used by VS Code, JetBrains and the terminal client, with policy values shown read-only.

Artifact record compatibility. meta.tracker keeps adapter, epicRef, storyRef, issueRef, storyRefs, taskRefs, milestoneRef, labelsCreated, epicStatus, storyStatus, pushedAt and lastSyncedAt unchanged: storyRefs and taskRefs stay maps from id to an owner/repo#N string, and an issue reference stays that string, so tracker-auto.ts keeps reading storyRefs[storyId] and taskRefs[task.id] on committed artifacts. Only the adapter literal 'github' is widened to the port's tracker kind. New per-unit data is added in a separate key. meta.revision is optional and an artifact without it is read as revision 0. Versioning note: the revision is the binding recorded for a signoff request, that is, which revision of each artifact a request was opened for; a content hash or snapshot binding is later hardening.

Artifact writes. s4 owns the inventory of artifact write paths and the one helper that content writes go through. The list is non-normative. The non-test callers of writeAtomic found are: src/daemon/workflow-rpc.ts, workflow-step synthesize.ts, code-review-step handler.ts, review-step verdicts.ts and findings.ts, questions.ts, resolve-comment.ts, tracker-auto.ts, orchestrator.ts, gates.ts, review/run-artifact.ts, runners/build/standalone-record.ts, runners/build/test-record.ts, amendments/store.ts, bugfix/stamp.ts, review/resolve.ts, code-review/runner.ts, tracker/refs.ts and tracker/link.ts. Two artifact writers use writeFileSync instead: writeArtifactJson in src/workflow/artifacts/provenance/writer.ts, which appends body.feedback entries (a content write that bumps the revision), and the meta rewrite in src/workflow/migrate-docs-tree.ts (a meta-only, one-off migration). src/indexer/repo-ignore-config.ts is not an artifact. bugfix/tracker.ts writes through patchTrackerMeta rather than writeAtomic. s4 finalizes the classification into content writes (bump the revision) and meta-only writes (approval stamp, review stamp, tracker patch: no bump), including review/resolve.ts and resolve-comment.ts, which may be content writes; verdicts.ts and run-artifact.ts are content writes when auto-fixes change the body. The bypass test detects raw writeFileSync calls on artifact paths as well as writeAtomic callers.

Grandfathering. The policy records the first default-branch commit, and its commit time, at which the policy file appeared; an artifact whose approvedAt is earlier than that time is treated as signed off in team mode.

Test map. Each Story LLD carries at least one test per listed acceptance criterion. Focus per Story: s1 contract tests for ac1, ac2 and ac4 and a pinned-results test for ac3, plus a test of the signed-in-user read; s2 ac5 to ac9 for policy source and offline rule; s3 ac10 to ac14 for the catalog rows and read-only policy display; s4 ac15 to ac18 for dedupe and creation failure, plus a test that fails when an artifact write bypasses the helper; s5 ac19 to ac23 for claim, refusal, live assignee, release and no takeover, plus a refusal test per gate site, a test that a batch approve routes a refusal to skipped[], a test that the terminal client's approve case formats a refusal with its reason, a test that an unreadable identity refuses the action, and a test that a non-holder's review is report-only on both review paths; s6 ac25 to ac28 for parking and resume; s7 ac24 and ac29 to ac35 for signoff; s8 ac36 to ac38 for revision.

Open items. The unbuilt tracker-tool design LLD-38436e90625a83a2-s1 has a conflicting approval status; whether to amend or withdraw it must be settled before s1's LLD. The policy forces Task issues on (the pushTasks setting defaults to off). The in-memory step state stores hold 100 entries for 1 hour and are not relied on for handoff. The terminal client has no per-repo tracker settings editor today (a separate, parked feature that Story s3 also needs).

## 4. Shared contracts

### 4.1 sc1: TrackerPort and PortResult

**Owner Story:** `s1`
**Consumed by:** `s4`, `s5`, `s7`

**Purpose:** The only way the workflow library talks to a tracker. Declares capabilities, is checked against the capabilities the policy needs when loaded, returns structured results with a distinct error for a missing tool or sign-in, and can say who the signed-in user is so the gate knows who is acting. An issue reference is the existing owner/repo#N string. Owned by s1 because s1 is a root and every consumer depends on it.

**Interface sketch (type-level):**

```
type TrackerKind = string;
type IssueRef = string; // 'owner/repo#N', as today
type Capability = 'claim' | 'issue-create' | 'signoff-request' | 'completion';
type PortResult<T> = { ok: true; value: T } | { ok: false; reason: string; kind: 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected' };
interface TrackerPort {
  readonly kind: TrackerKind;
  readonly capabilities: ReadonlySet<Capability>;
  whoAmI(): PortResult<string>; // the signed-in user's login
  readAssignee(issue: IssueRef): PortResult<string | null>;
  setAssignee(issue: IssueRef, who: string | null): PortResult<void>;
  createIssue(spec: IssueSpec): PortResult<IssueRef>;
  findIssue(labels: string[]): PortResult<IssueRef | null>;
  openSignoffRequest(spec: SignoffRequestSpec): PortResult<SignoffRequestRef>;
  readSignoffState(ref: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'>;
}
interface LoadTracker { (repo: string, needed: ReadonlySet<Capability>): PortResult<TrackerPort>; }
```

### 4.2 sc2: TeamPolicy

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`, `s7`

**Purpose:** The central rules read from the remote default branch: team mode, signoff stages, claim enforcement, claim units, administrators, and the grandfathering anchor. Owned by s2.

**Interface sketch (type-level):**

```
interface TeamPolicy {
  teamMode: boolean;
  signoffStages: Array<'DEF' | 'HLD' | 'LLD' | 'BUILD'>;
  claimsEnforced: boolean;
  claimUnits: { epic: ['DEF','HLD']; story: ['LLD','PLAN']; task: ['BUILD'] };
  administrators: string[];
  forceTaskIssues: true;
  source: { ref: string; fetchedAt: string; firstCommit: string; firstCommitTime: string };
}
interface PolicyReader { (repo: string): PolicyResult<TeamPolicy | 'none'>; }
type PolicyResult<T> = { ok: true; value: T } | { ok: false; reason: string };
```

### 4.3 sc3: Per-unit tracker record and revision

**Owner Story:** `s4`
**Consumed by:** `s5`, `s7`, `s8`

**Purpose:** Adds data next to the artifact's existing meta.tracker without changing any existing field: a per-stage-unit issue map in a new key, and an optional meta.revision (default 0 when absent), minted on content writes and not on meta-only writes. A review that applies auto-fixes, whether through verdicts.ts or run-artifact.ts, is a content write; a report-only review is meta-only. Owned by s4, which also owns the inventory of artifact write paths and the shared issue-creation code.

**Interface sketch (type-level):**

```
interface ExistingTrackerMeta { // unchanged; today's TrackerMeta
  adapter?: TrackerKind; epicRef?: string; storyRef?: string; issueRef?: string;
  storyRefs?: Readonly<Record<string, string>>; taskRefs?: Readonly<Record<string, string>>;
  milestoneRef?: string; labelsCreated?: readonly string[];
  epicStatus?: string; storyStatus?: Readonly<Record<string, string>>;
  pushedAt?: string; lastSyncedAt?: string;
}
interface UnitIssue { unit: 'epic' | 'story' | 'task'; unitId: string; issue: IssueRef; createdAtRevision: number; }
interface ArtifactTrackerRecord extends ExistingTrackerMeta { units?: Readonly<Record<string, UnitIssue>>; }
interface ArtifactMetaAdditions { revision?: number; /* absent reads as 0 */ tracker?: ArtifactTrackerRecord; }
type WriteKind = 'content' | 'meta-only';
interface ArtifactWriter { (path: string, next: unknown, kind: WriteKind): void; }
interface EnsureIssue { (unit: UnitRef, port: TrackerPort): PortResult<IssueRef>; }
```

### 4.4 sc4: Team gate, claim state, gate outcome, refusal error and completion hook

**Owner Story:** `s5`
**Consumed by:** `s6`, `s7`, `s8`

**Purpose:** The single gate for guarded actions in the daemon-owned workflow library, the claim state read live from the tracker, the outcome type, the typed refusal error that leaves approval, the review-fix decision that both review paths (verdicts.ts and run-artifact.ts) consult, and a completion hook that s5 ships unregistered and s7 registers. The gate derives the acting user itself through the port, so no caller signature changes. Owned by s5; s4 supplies issue creation which the gate calls for the no-issue outcome.

**Interface sketch (type-level):**

```
type GuardedAction = 'author' | 'build' | 'approve-local' | 'open-signoff' | 'revise' | 'release' | 'claim' | 'review-fix';
type GateOutcome =
  | { kind: 'allowed'; implicitClaim: boolean }
  | { kind: 'held-by-other'; holder: string; offerPark: boolean }
  | { kind: 'awaiting-signoff'; request: SignoffRequestRef }
  | { kind: 'no-issue'; allowFirstAuthor: boolean; creationFailure?: string }
  | { kind: 'refused'; reason: string };
interface ClaimState { unit: UnitRef; holder: string | null; readAt: string; }
interface TeamGate { (repo: string, unit: UnitRef, action: GuardedAction): GateOutcome; } // who = port.whoAmI(), read inside
interface TeamGateRefusedError extends Error { readonly outcome: Exclude<GateOutcome, { kind: 'allowed' }>; readonly reason: string; }
type ReviewFixMode = 'apply-auto-fixes' | 'report-only';
interface ReviewFixDecision { (repo: string, unit: UnitRef): ReviewFixMode; }
interface CompletionHook { (repo: string, unit: UnitRef, port: TrackerPort): GateOutcome | 'continue'; }
interface RegisterCompletionHook { (hook: CompletionHook): void; }
interface ReleaseRule { holderMayRelease: true; administratorsMayRelease: true; othersRefused: true; }
```

### 4.5 sc5: SignoffRecord

**Owner Story:** `s7`
**Consumed by:** `s8`

**Purpose:** A record separate from meta.review and approvedAt, stating that a signoff request completed and which artifacts and revisions it covered. The revision is the binding; a content hash is later hardening. Owned by s7.

**Interface sketch (type-level):**

```
interface SignoffRecord {
  request: SignoffRequestRef;
  artifacts: Array<{ artifactId: string; revision: number }>;
  completedAt: string;
  grandfathered?: boolean;
}
interface ArtifactSignoffMeta { signoffs?: SignoffRecord[]; }
```

## 5. Story boundaries

### 5.1 Story E20261016315d510c:S001

**Owns:** `sc1`

The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-s1 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend.

### 5.2 Story E20261016315d510c:S002

**Owns:** `sc2`

Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command.

### 5.3 Story E20261016315d510c:S003

**Depends on:** `sc2`

The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.

### 5.4 Story E20261016315d510c:S004

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0.

### 5.5 Story E20261016315d510c:S005

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered.

### 5.6 Story E20261016315d510c:S006

**Depends on:** `sc4`

Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.

### 5.7 Story E20261016315d510c:S007

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff.

### 5.8 Story E20261016315d510c:S008

**Depends on:** `sc3`, `sc4`, `sc5`

Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.

## 6. Non-functional targets

- **Performance:** Each guarded action makes at most two live reads through the port (the signed-in user and the assignee); every tracker command has a 10-second timeout, after which the action is refused with the reason. A repo without a policy makes no tracker call.
- **Security:** Policy is read only from the remote default branch ref and is not locally overridable; enforcement lives in the daemon-owned workflow library (k1); no tracker secrets are stored by insrc, sign-in stays with the tracker's CLI; administrators come only from the policy.
- **Observability:** Every gate outcome other than allowed is logged with unit, action and reason; port failures carry their kind (missing-tool, missing-signin, unreachable, rejected).
- **Durability:** Claim, issue and signoff state live in the tracker and in committed artifact files; the in-memory step state stores (100 entries, 1 hour) are not relied on for handoff. Artifact writes stay atomic through the existing helper.

## 7. Rollout

**Phase A — foundational contracts**

**Stories:** `s1`, `s2`

s1 owns the tracker port (sc1) and s2 owns the policy (sc2). Both are roots and every other Story consumes one of them.

**Backward compat:** The GitHub code moves behind the port with unchanged results (ac3), and the existing meta.tracker fields are untouched. Without a policy file no team check is made (ac7).

**Phase B — settings and issue readiness**

**Stories:** `s3`, `s4`

s3 needs only sc2. s4 needs sc1 and sc2 and owns sc3 (additive per-unit record, optional revision, artifact write inventory), which s5, s7 and s8 consume.

**Backward compat:** The terminal approve path keeps creating issues as a manual fallback. meta.revision is optional and absent reads as 0; schemaVersion and every existing meta.tracker field, including issueRef, storyRefs and taskRefs, are unchanged.

**Phase C — claims and handoff**

**Stories:** `s5`, `s6`

s5 owns the team gate (sc4) and needs sc1, sc2 and sc3. s6 needs s5. The completion hook ships unregistered, so this phase works without s7.

**Backward compat:** The gate returns allowed with no tracker call, and no identity read, when there is no policy. Code-review and analyze are never guarded, review is never refused, and approveArtifactByJsonPath keeps its signature and stays synchronous. In a repo without a policy both review paths apply their auto-fixes exactly as today, and the terminal client's approve case still formats a blocked review as before.

**Phase D — signoff**

**Stories:** `s7`, `s8`

s7 owns the signoff record (sc5), needs sc1 to sc4, and registers the completion hook. s8 needs s7.

**Backward compat:** Artifacts approved before the policy file first appeared on the default branch are grandfathered. Stages the policy does not list for signoff advance on local approval as today.

**Ordering rationale:** Owners land before their consumers: sc1 and sc2 (s1, s2), then sc3 (s4), then sc4 (s5), then sc5 (s7). This respects the Epic edges s3→s2, s4→s1,s2, s5→s1,s2,s4, s6→s5, s7→s1,s2,s5 and s8→s7. s5 does not consume sc5 because the completion hook lets s7 add the awaiting-signoff outcome later. No feature flag is needed because a repo without a policy file runs no team code (k4).

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Artifact write inventory (s4) | The revision is only correct if every artifact write path is classified. A missed content write leaves the revision stale, and a signoff then covers a revision that no longer matches the artifact. Nineteen files call writeAtomic, two more write with writeFileSync, and several (both review auto-fix paths, review/resolve.ts, resolve-comment.ts) are content writes or may be. | s4 finalizes the classification, routes content writes through one helper, and adds a test that fails when an artifact write bypasses the helper, covering raw writeFileSync on artifact paths as well as writeAtomic callers. |
| Gate coverage and refusal path (s5) | If any guarded action is entered without the gate, a developer can change a stage held by someone else, which breaks k1. Local approval is reached in-process by the terminal client as well as through the MCP path, and a refusal thrown there that is not caught or formatted would abort a batch approve after earlier artifacts were stamped or reach the user as a raw exception. | List the guarded actions once in sc4, guard local approval inside approveArtifactByJsonPath before any stamp, throw a typed TeamGateRefusedError that approveWorkflowTarget routes to skipped[] and the terminal client's approve case formats, and add a refusal test per gate site, for the batch path and for the terminal client. |
| GitHub extraction (s1) | Moving tracker-auto, refs, sync, resolve, link and bugfix/tracker behind the port touches about eight modules and could change results for solo users (k4) or break reads of committed artifacts. | Pin today's results and the existing meta.tracker shape with tests before the move, and keep the port synchronous in shape so approveArtifactByJsonPath and its roughly 70 test callers stay synchronous. |

## 8. Alternatives considered

### 8.1 a1: Daemon-side team gate over a synchronous, capability-declaring tracker port — **CHOSEN**

One gate in the daemon-owned workflow library checks policy, claim and signoff before any guarded action, through a tracker port that declares its capabilities at load.

A single team gate sits in front of every guarded action, including the auto-fix part of either review path, learns who is acting from the tracker port, and asks the port for the live assignee and signoff-request state. A refusal leaving approveArtifactByJsonPath is a typed error that approveWorkflowTarget routes to skipped[] and the terminal client formats. GitHub is the first adapter, built by extracting the existing GitHub code behind the port. Artifact records keep every existing meta.tracker field and add per-unit data plus an optional meta.revision.

**Pros:**
- Enforcement is in one place in the daemon-owned workflow library, so no client or host connector can bypass it (k1).
- The port keeps approval functions synchronous and the gate reads the user itself, so no function signature that callers use changes and about 70 existing test call sites are unaffected.
- Capability check at load gives the fail-fast rejection k8 requires, with no degraded mode.
- Repos without a policy skip the gate entirely, preserving k4.
- Additive record changes leave existing committed artifacts readable.
- A typed refusal error lets a batch approve report one reason per artifact and the terminal client show the same reason.

**Cons:**
- The gate must be wired into every guarded entry point, so the inventory of write paths and actions has to be complete or a path escapes the gate.
- Live tracker reads (assignee and signed-in user) at every guarded turn add CLI call latency per action, bounded by a 10-second command timeout.
- Extracting the GitHub code behind a port touches tracker-auto, refs, sync, resolve, link and bugfix/tracker, which is a wide refactor.

**Cost estimate:** L

### 8.2 a2: Wrap the existing GitHub code with a thin adapter and check in the clients

Leave the GitHub code in place, add a thin wrapper, and apply team checks in the terminal client and MCP layers.

The existing tracker functions stay as they are and a thin wrapper exposes them under the new interface. Team checks are added where actions are entered today: the terminal client service layer and the MCP step tools.

**Pros:**
- Smallest initial diff: existing tracker modules are not moved.
- GitHub behaviour is unchanged by construction.

**Cons:**
- Checks in clients and MCP layers can be bypassed by any path that does not go through them, which violates k1.
- Duplicate checks in several entry points drift apart over time.
- A wrapper does not give the capability declaration needed to reject an incomplete tracker at load (k8) for later adapters.

**Cost estimate:** M

**Rejected because:** Violates k1 because checks sit in client and MCP entry points rather than the daemon-owned library, and is partial on k5, k7 and k8.

### 8.3 a3: Shared team daemon with a central claim store

One team-hosted daemon holds claims and signoff state, and developers' clients talk to it.

A single daemon per team keeps the claim table, policy and signoff state, and every developer's client calls it. The tracker is updated as a mirror of that state.

**Pros:**
- Claim reads are immediate and consistent without a tracker round trip.
- One place to apply the policy.

**Cons:**
- Contradicts the decision that each developer keeps their own daemon and that repo files and the tracker are the shared truth.
- Assignment made directly in the tracker would not be seen unless synced, breaking ac21.
- Needs hosting, sign-in and availability that no current component provides.

**Cost estimate:** L

**Rejected because:** Contradicts the per-developer daemon decision, is partial on k4, k5 and k7, and would miss assignments made directly in the tracker (ac21).

## 9. References

- **[[c1]]** `analyze-bundle` `Sizing the team-compatibility change: tracker layer, config surface, gate importers (src/workflow/tracker/github.ts, src/workflow/gates.ts, src/config/settings-catalog.ts, src/workflow/config/github.ts, src/workflow/tracker-auto.ts)`
- **[[c2]]** `analyze-bundle` `Existing docs on signoff, claims and tracker-neutral adapters (docs/plans/meta-workflow-framework.md, docs/workflow.md)`
- **[[c3]]** `analyze-bundle` `Whole-Epic gates, refusal path and terminal client formatting (src/workflow/gates.ts:88-93, src/workflow/gates.ts:584, src/workflow/gates.ts:865-873, src/cli/services/workflow.ts:158-161, src/cli/command.ts:224-233)`
- **[[c4]]** `analyze-bundle` `What the artifact tracker record holds today, where issues are created and how the current user is read (src/workflow/tracker/refs.ts:24-37, src/workflow/tracker-auto.ts, src/workflow/tracker/github.ts:406-412)`
- **[[c5]]** `analyze-bundle` `Artifact write paths, review phases and issueRef writers (src/workflow/storage.ts:77-88, src/daemon/steps/review-step/phases/findings.ts:80-92, src/daemon/steps/review-step/phases/verdicts.ts:93-96, src/workflow/review/run-artifact.ts:104-121, src/workflow/artifacts/provenance/writer.ts:98-101, src/workflow/migrate-docs-tree.ts:856, src/workflow/bugfix/tracker.ts:381-387)`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**1 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-16T19:04:24.273Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| error-paths | MED | The design states how a repo with no policy is told apart from a repo whose policy cannot be fetched, so that the gate placed inside approveArtifactByJsonPath stays a no-op for solo, offline, remote-less or non-git repos. | The HLD says 'In a repo without a policy the gate is skipped and behaviour is as today' and 'Without a policy file no team check is made (ac7)'. It also adopts ac9's offline rule: when the remote default branch cannot be reached, use a cached policy if one exists, otherwise refuse the action. PolicyReader returns `{ ok:false; reason }` on failure, separate from the 'none' value. Nowhere does the design say what the gate does on `ok:false` when no cached copy exists and the repo has never had a policy (offline, no remote, or not a git repo). The approval path runs in non-git temp dirs: gates.ts:575-578 already tolerates 'not a git repo, no commits yet, or git unavailable' for headFullSha, and the ~70 test callers use temp repos. If the reader's ok:false is treated as a refusal, as ac9 reads, every approval in a remote-less or offline solo repo is refused, which breaks k4 and ac7. The design also does not say whether reading the remote default branch requires a fetch (network) on every guarded action; the NFT budgets only the tracker reads. [files: src/workflow/gates.ts, docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md] | In sc2 and s2, define the outcomes explicitly: no remote, not a git repo, or no policy file on a cached or fetched ref → 'none' (no team checks); a known team repo whose policy cannot be refreshed → cached copy, otherwise refuse. Record in the cache that a repo is a team repo, so a repo is treated as 'unknown' only when it has never been seen to carry a policy. State whether the default-branch read fetches, and bound its timeout in the non-functional targets. |

#### Could not verify (does not block)

_None._
