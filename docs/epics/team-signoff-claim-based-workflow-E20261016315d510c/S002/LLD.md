<!-- insrc:artifact LLD-315d510cb28100e2-s2 -->

# LLD: E20261017315d510c:S002

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `381fe69e77e4...`

This Story lets a team lead keep the team rules in one file on the repository's remote default branch, and makes every developer's workflow actions follow that file and nothing local. A repo with no such file behaves exactly as it does today. A team refresh command fetches the default branch on demand and, when the default branch cannot be detected, asks the user to name it; between refreshes the last fetched copy is used, and a repo known to carry a policy whose copy cannot be read is refused with the reason. A team setup command writes a starter policy for the lead to review and commit.

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
**Owns:** `sc2` (TeamPolicy)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-S001 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `PolicyReader`

```typescript
type PolicyReader = (repo: string) => PolicyResult<TeamPolicy | 'none'>
```

**Parameters:**
- `repo: string` — Absolute path of the repository whose policy is wanted.

**Returns:** `PolicyResult<TeamPolicy | 'none'>` — ok with the policy as last fetched from the remote default branch; ok with 'none' only when the repo has no sighting and no local evidence of a policy; ok false with a reason otherwise.

**Errors:**
- `PolicyResult ok:false` when A sighting file exists (even damaged) and the policy cannot be read from the recorded branch's tracking ref or recorded commit; or the default-branch policy file is present but invalid; or the default branch is unknown while a fetched tracking ref of the remote carries a policy file (the reason tells the user to run team refresh with --branch and the default branch's name).

**Preconditions:**
- Synchronous, non-interactive and network-free: it runs only local git commands and file reads.
- Never throws and never guesses a branch. A sighting, when one exists, is checked first and takes precedence over every solo-repo shortcut.
- Only when no sighting exists do a non-git directory, a repo with no commits or no remote return ok 'none'. With a remote but no remote HEAD and no sighting, the reader scans the remote's tracking refs (skipping the symbolic HEAD) for the policy file: found means ok false with the instruction, not found means ok 'none'.

**Postconditions:**
- The working tree and every non-default branch are never consulted, and a policy found on an unlabelled tracking ref is never applied.
- On first observation of a policy file on the default branch with no sighting it creates the sighting by hard link (create-only); an existing or damaged sighting is never overwritten; a failed write does not change the result.
- The default branch is the sighting's recorded branch, else the remote HEAD reference, else unknown. When the tracking ref is gone, the commit recorded in the sighting is read if the object is present, else the result is ok false.

### 2.2 `PolicyRefresh`

```typescript
type PolicyRefresh = (repo: string, branch?: string) => Promise<PolicyResult<PolicyRefreshOutcome>>
```

**Parameters:**
- `repo: string` — Absolute path of the repository to refresh.
- `branch: string` _(optional)_ — The default branch's name, supplied by the user only when the remote cannot name it; ignored when the remote names a default branch.

**Returns:** `PolicyResult<PolicyRefreshOutcome>` — ok with what was fetched (policy, absent, or invalid with the reason) and any warning; ok false when the remote cannot be reached, the default branch cannot be determined, or the fetched policy could not be recorded.

**Errors:**
- `PolicyResult ok:false` when ls-remote or fetch fails or passes the 10-second deadline, the lock cannot be taken, or the sighting cannot be written after the tracking ref moved (the next refresh repairs it).
- `PolicyResult ok:false` when The remote names no default branch, no branch is recorded in a valid sighting and no branch was supplied: the reason asks the user to re-run with --branch and the default branch's name.
- `PolicyResult ok:false` when A supplied branch does not exist on the remote, or the remote is unreachable so it cannot be verified: nothing is recorded.

**Preconditions:**
- Holds a per-repository exclusive lock (a lock older than 30 seconds is stale) for the whole refresh under one 10-second deadline.

**Postconditions:**
- The default branch is, in order: the one the remote names (which overwrites any earlier pin), else the one recorded in a valid sighting, else the supplied branch after it is verified with ls-remote --heads; a pinned branch is recorded with source 'user', is local like the sighting and is not a security boundary.
- Only the default branch's tracking ref changes: no tag, other tracking ref, FETCH_HEAD or prune.
- The sighting (branch and its source, sha, refreshedAt, merged anchor) is written, or removed when the file is absent, before the cosmetic remote HEAD update.
- A failed cosmetic remote HEAD update is a warning, not a failure; a known anchor is never replaced by an unknown one.

### 2.3 `AnchorFinder`

```typescript
type AnchorFinder = (repo: string, trackingRef: string) => PolicyAnchor
```

**Parameters:**
- `repo: string` — Absolute path of the repository.
- `trackingRef: string` — The default branch's remote-tracking ref whose first-parent history is walked.

**Returns:** `PolicyAnchor` — { known: true, firstCommit, firstCommitTime } or { known: false, firstCommit: '', firstCommitTime: '' }.

**Errors:**
- `PolicyAnchor known false` when The repository is shallow, or the history walk fails, or no add of the policy file is found.

**Preconditions:**
- Local git only; no network.

**Postconditions:**
- The anchor is the oldest add of .insrc/policy.json on the first-parent history of the tracking ref (the first line of the adds listed oldest first), so a later delete and re-add does not move it.
- firstCommitTime is that commit's committer time in ISO form.
- A shallow repository (git rev-parse --is-shallow-repository prints true) always gives known false, because git lists the shallow boundary commit as an add.

### 2.4 `StarterPolicyWriter`

```typescript
type StarterPolicyWriter = (repo: string) => PolicyResult<{ path: string }>
```

**Parameters:**
- `repo: string` — Absolute path of the repository in which to write the starter.

**Returns:** `PolicyResult<{ path: string }>` — ok with the path of the written .insrc/policy.json, or ok false with a reason.

**Errors:**
- `PolicyResult ok:false` when A policy file already exists at the path, or the write fails.

**Preconditions:**
- The repo path exists.

**Postconditions:**
- The starter holds the authored fields with signoff for DEF, HLD, LLD and BUILD and claims enforced; it is published with a hard link so an existing file is never overwritten.
- Nothing is committed or pushed; the lead reviews and commits it.

### 2.5 `TeamInitCommand`

```typescript
teamInit: (repoPath: string) => Promise<string>
```

**Parameters:**
- `repoPath: string` _(optional)_ — Repository path; the command bar's `team init [path]` supplies the context repo when omitted.

**Returns:** `string` — A one-line result for the command bar: the path written or the reason it was not.

**Errors:**
- `Error` when The starter cannot be written; shown as a cross-prefixed line by the command bar.

**Preconditions:**
- Entered through the terminal client's command bar.

**Postconditions:**
- Calls StarterPolicyWriter and nothing else.

### 2.6 `TeamRefreshCommand`

```typescript
teamRefresh: (repoPath: string, branch?: string) => Promise<string>
```

**Parameters:**
- `repoPath: string` _(optional)_ — Repository path; the command bar's `team refresh [path] [--branch name]` supplies the context repo when omitted.
- `branch: string` _(optional)_ — The default branch's name from --branch, passed through to PolicyRefresh.

**Returns:** `string` — A one-line result: fetched (with the branch and short sha), absent (policy file not on the default branch), or invalid (with the reason), plus any warning.

**Errors:**
- `Error` when PolicyRefresh returned ok false, including the request to re-run with --branch; its reason is shown as a cross-prefixed line by the command bar.

**Preconditions:**
- Entered through the terminal client's command bar.

**Postconditions:**
- Calls PolicyRefresh and nothing else.

## 3. Data model changes

### 3.1 `TeamPolicy` — field-add

Adds source.anchorKnown: boolean. false means firstCommit and firstCommitTime are empty strings and s7 must grandfather nothing. The authored fields are read from the policy file; the source block is derived by the reader and is never taken from the file.

```
source: { ref; fetchedAt; firstCommit; firstCommitTime; + anchorKnown: boolean }
```

**Call sites:**
- `src/workflow/gates.ts:569-578`
- `src/workflow/gates.ts:584`

### 3.2 `PolicyFile` — new

The authored file .insrc/policy.json on the default branch, read with git show from the tracking ref (or the recorded commit when the ref is gone). It holds only teamMode (boolean), signoffStages (array of DEF, HLD, LLD, BUILD), claimsEnforced (boolean) and administrators (array of strings). claimUnits and forceTaskIssues are fixed by the daemon, and source is derived, so a file that carries claimUnits, forceTaskIssues, source, an unknown field or a wrong type is invalid.

**Call sites:**
- `src/cli/command.ts:32-62`

### 3.3 `PolicySighting` — new

One file per repository at ~/.insrc/team/seen/<16 hex sha256 of realpath>.json, with a .lock beside it. Holds remote, default branch, branchSource ('remote' when the remote named it, 'user' when it was pinned with --branch), last fetched sha, refreshedAt and the anchor (known flag, firstCommit, firstCommitTime). Written with a unique temp name, never the fixed .tmp of writeAtomic. A damaged sighting is evidence the repo carries a policy, never absence. A known anchor is never replaced by an unknown one; an unknown anchor is replaced by a known one when history arrives.

**Call sites:**
- `src/workflow/storage.ts:77-88`
- `src/shared/paths.ts`

### 3.4 `Services` — field-add

Gains a team entry with teamInit and teamRefresh (with its optional branch), bound in makeServices, with a help line for each and a `team` dispatch case whose runTeam handles the sub words init and refresh and parses the --branch flag from the rest of the line. The two test facades that build a Services object gain the new entry so the command tests run.

**Call sites:**
- `src/cli/services/index.ts`
- `src/cli/command.ts:32-62`
- `src/cli/__tests__/command.test.ts:29`
- `src/cli/__tests__/tui.test.ts:50`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | s2 owns sc2. PolicyReader and PolicyResult keep the HLD envelope exactly; TeamPolicy gains the additive source.anchorKnown through a fieldAdd amendment. The reader feeds s3, s4, s5 and s7 and never calls the tracker port. |

## 5. Error paths

**Error cases**

- **The remote cannot be reached during a refresh (ls-remote or fetch fails or passes the 10-second deadline).** (recoverable)
  - Detection: The git child process exits non-zero (128 for an unreachable remote) or the single deadline timer fires; the refresh kills the child and reads the exit status.
  - Response: PolicyRefresh returns ok false with the git reason; no ref, sighting or file is changed by the failed step. The reader keeps using the last fetched tracking ref.
  - User impact: The developer is told the refresh failed and why; actions continue on the last fetched policy, or are refused with the reason when the repo is known to carry a policy and none was ever fetched.
- **A repo known to carry a policy (a sighting exists) has no readable policy: the tracking ref is gone or was never fetched, and the recorded commit object is absent.** (recoverable)
  - Detection: The reader finds the sighting file, then git show of the recorded branch's tracking ref and of the recorded commit both exit non-zero.
  - Response: PolicyReader returns ok false with a reason naming the missing ref and suggesting team refresh.
  - User impact: A team action is refused with the reason instead of running unguarded.
- **A repo with a sighting no longer looks like a team repo to git: the remote was removed, the clone has no commits, or the directory is no longer a git repo.** (recoverable)
  - Detection: The reader checks the sighting before any solo shortcut; git rev-parse or git show for the recorded commit exits non-zero afterwards.
  - Response: The recorded commit is read if its object is present; otherwise PolicyReader returns ok false naming the sighting and the git failure. It never returns ok 'none' while a sighting exists.
  - User impact: Refused with the reason until a refresh succeeds or the sighting is removed by a refresh that finds the policy file absent.
- **The default branch is unknown (no sighting, no remote HEAD) while a fetched tracking ref of the remote carries the policy file.** (recoverable)
  - Detection: The reader finds no sighting and no remote HEAD reference, lists the remote's tracking refs (skipping the symbolic HEAD) and git cat-file -e of .insrc/policy.json succeeds on at least one.
  - Response: PolicyReader returns ok false whose reason says the default branch is unknown and tells the user to run team refresh with --branch and the default branch's name. No policy is applied from any of those refs.
  - User impact: The user is asked explicitly to name the default branch instead of the team rules being silently skipped.
- **The remote names no default branch, no valid sighting records one and no branch was supplied.** (recoverable)
  - Detection: git ls-remote --symref prints no symbolic HEAD line (dangling remote HEAD) or fails, and the sighting has no branch.
  - Response: PolicyRefresh returns ok false asking the user to re-run team refresh with --branch and the default branch's name; nothing is fetched or recorded.
  - User impact: The user is told exactly what to supply.
- **A branch supplied with --branch does not exist on the remote, or the remote is unreachable so it cannot be checked.** (recoverable)
  - Detection: git ls-remote --heads <remote> refs/heads/<name> prints nothing (missing branch) or exits non-zero (unreachable).
  - Response: PolicyRefresh returns ok false naming the branch and the cause; no sighting is written, so an unverified pin is never recorded.
  - User impact: The user corrects the name or retries when the remote is reachable.
- **The sighting file is damaged (unparseable or wrong shape).** (recoverable)
  - Detection: JSON parse or shape validation of the sighting fails after the file is found to exist.
  - Response: Treated as evidence the repo carries a policy: the reader tries the remote HEAD branch and, if no policy can be read, returns ok false naming the damaged sighting. It is never overwritten by the reader; the next successful refresh replaces it.
  - User impact: Refused with the reason until a refresh repairs the sighting; never silently treated as a solo repo.
- **The default-branch policy file is present but invalid (bad JSON, unknown field, wrong type, or it carries claimUnits, forceTaskIssues or source).** (recoverable)
  - Detection: Parse and shape validation of the git show output against the authored-fields schema fails.
  - Response: The reader returns ok false with the validation reason (fails closed). A refresh that fetches an invalid file reports it as an outcome, writes the sighting and does not remove it.
  - User impact: Team actions are refused until the policy file on the default branch is corrected.
- **The sighting cannot be written after the fetch moved the tracking ref.** (recoverable)
  - Detection: The unique-temp write or rename throws, or the hard link fails for a reason other than the file existing.
  - Response: PolicyRefresh returns ok false 'fetched policy could not be recorded'; the tracking ref has already moved and the next refresh repairs the record.
  - User impact: The developer sees a failed refresh; the reader may still read the policy through the remote HEAD branch if it is set.
- **The cosmetic update of the remote HEAD reference fails.** (recoverable)
  - Detection: git symbolic-ref exits non-zero.
  - Response: The refresh still returns ok and adds a warning; the sighting already carries the branch.
  - User impact: None beyond the warning line.
- **Another refresh holds the repository lock.** (recoverable)
  - Detection: The exclusive create of the lock file fails because it exists and is not older than 30 seconds.
  - Response: PolicyRefresh returns ok false 'a refresh is already running'; a lock older than 30 seconds is taken over.
  - User impact: The developer retries; no double fetch occurs.
- **The reader's create-only sighting write fails on first observation.** (recoverable)
  - Detection: The hard link throws a non-EEXIST error.
  - Response: The error is logged and ignored; the reader returns the policy it read.
  - User impact: None now; the next refresh records the sighting.
- **The history walk for the anchor fails.** (recoverable)
  - Detection: The git log command exits non-zero or its output cannot be parsed.
  - Response: AnchorFinder returns known false with empty commit and time; the policy is still returned with source.anchorKnown false.
  - User impact: s7 grandfathers nothing for this read; a later refresh may find the anchor.
- **Starter policy cannot be written because a policy file already exists or the path is not writable.** (recoverable)
  - Detection: The hard link fails with EEXIST or another error.
  - Response: StarterPolicyWriter returns ok false with the reason; the existing file is untouched; team init shows it as a cross-prefixed line.
  - User impact: The lead is told the file already exists or why the write failed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A directory that is not a git repo, a repo with no commits, or a repo with no remote, and no sighting for it. | PolicyReader returns ok 'none' with no write and no network call. |
| The same cases with a sighting recorded earlier for that repo. | The reader uses the recorded branch and commit, or returns ok false; it never returns ok 'none'. |
| A repo with a remote, no remote HEAD reference, no sighting, and no fetched tracking ref carrying a policy file. | The reader returns ok 'none' (no local evidence of a policy), so an ordinary solo repo behaves as today. |
| The same repo after team refresh --branch main verified main on the remote. | The sighting records main with source user, the policy is fetched from main and read, and the reader applies it from then on. |
| team refresh --branch trunk while the remote itself names main as its default branch. | The remote's answer wins: main is used and recorded with source remote, and the supplied name is ignored. |
| A remote whose default branch is renamed (main to trunk) after a sighting recorded main. | The reader keeps reading the recorded branch until a refresh runs ls-remote, fetches the new branch and rewrites the sighting with it. |
| A shallow clone. | The policy is returned with source.anchorKnown false and empty commit and time, even though git lists the boundary commit as an add; s7 grandfathers nothing. |
| A policy file that was added, approved against, deleted and added again on the default branch. | The anchor stays the first (adoption) commit, the oldest add listed, so an artifact approved between adoption and reintroduction is grandfathered exactly as the HLD states. |
| History is deepened after an unknown anchor was recorded. | The next refresh finds the anchor and replaces the unknown anchor with the known one; a known anchor is never replaced by an unknown one. |
| The policy file removed from the default branch after a refresh recorded it. | The refresh sees the file absent and removes the sighting; the repo reads as 'none' again. |
| A developer edits .insrc/policy.json in the working tree or on a feature branch. | The reader only runs git show on the default branch's tracking ref, so the edit has no effect. |
| A starter policy is requested in a repo that already has an uncommitted policy file in the working tree. | StarterPolicyWriter refuses, because the hard link finds the name taken; nothing is overwritten. |
| Two repos with the same directory name or a symlinked path. | The sighting key is the first 16 hex characters of the sha256 of the real path, so each real repository has its own record. |

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), files under src/**/__tests__/*.test.ts, with real git in temporary directories`

**Test levels**

- **unit** — Prove the policy-file parser, the sighting record, the anchor parser, the branch-resolution order and the reader's precedence and fail-closed rules without a network.
  - Subjects: `Policy file parsing against the authored-fields schema: valid file, unknown field, wrong type, bad JSON, a file carrying claimUnits, forceTaskIssues or source`, `Sighting read and validation, branchSource remote or user, damaged sighting treated as evidence`, `Reader precedence: a sighting is checked before any solo shortcut; branch precedence is sighting branch, then remote HEAD, then unknown`, `Reader with an unknown default branch: refuses with the --branch instruction when a tracking ref carries the policy file, skips the symbolic HEAD, returns none when none does, and never applies a policy from an unlabelled ref`, `Reader create-only sighting write on first observation, never overwriting an existing or damaged sighting, failure not changing the result`, `Anchor parsing of git log output: the oldest add is chosen even after a later delete and re-add; shallow gives known false; a known anchor is never replaced by an unknown one`, `Refresh branch resolution: the remote's answer wins over a supplied branch, then the sighting's branch, then the supplied branch after verification`, `Sighting key derivation from the real path`, `StarterPolicyWriter no-clobber hard link`
  - Fixtures: `temp directories`, `hand-written sighting files`, `canned git log and ls-remote output`
- **integration** — Prove the reader, refresh and anchor against real git: a bare remote, a normal clone with the standard fetch mapping, and a shallow clone.
  - Subjects: `Reader returns the policy from the default branch's tracking ref and ignores working-tree and feature-branch edits`, `Reader returns ok none for a non-git directory, a repo with no commits and a repo with no remote when no sighting exists`, `Reader in a repo with a remote, the remote HEAD removed with git remote set-head -d and a fetched policy: refused with the --branch instruction; the same repo with no policy on any fetched ref: none`, `Regression: a known team repo whose remote was removed, whose clone has no commits or refs, or that is no longer a git repo is refused or read from the recorded commit, never read as none`, `Refresh isolation: only the default branch's tracking ref changes, with no tag, other branch, FETCH_HEAD or prune effect`, `Refresh with the remote HEAD dangling: refused without --branch; with --branch naming a real branch it records source user and fetches; with a missing branch name or an unreachable remote nothing is recorded`, `Refresh where the remote names its default branch overrides an earlier user pin`, `Refresh offline: unreachable remote leaves the last fetched policy in use, and a known team repo with nothing fetched is refused with the reason`, `Refresh step failures: sighting write failure reports failure, cosmetic HEAD failure is a warning only`, `Refresh lock: a second refresh is refused, a lock older than 30 seconds is taken over`, `Default-branch rename and policy file removal`, `Anchor on real history: adoption, approval, deletion, reintroduction keeps the adoption commit; a depth-1 shallow clone gives known false; deepening the history lets the next refresh record a known anchor`
  - Fixtures: `bare remote created with git init --bare`, `normal clone`, `shallow clone made with --depth 1`, `remote with a dangling HEAD`
- **integration** — Prove the team commands through the command bar and the Services composition at runtime; type completeness of the test sources is out of scope because tsconfig.json excludes tests and tests run through tsx.
  - Subjects: `team init and team refresh dispatch, help lines and result lines, with an optional path and the context repo as default`, `team refresh --branch passes the name through to the service and renders the refusal that asks for it`, `A thrown error from either command rendered as a cross-prefixed line`, `The two Services test facades gain the team entry so the command tests run; no claim is made that they compile`
  - Fixtures: `src/cli/__tests__/command.test.ts base Services`, `src/cli/__tests__/tui.test.ts fakeServices`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac5` | `src/workflow/team/__tests__/policy-reader.test.ts: reads the policy from the remote default branch's tracking ref`, `src/workflow/team/__tests__/policy-reader.test.ts: an unknown default branch with a fetched policy is refused with the --branch instruction`, `src/workflow/team/__tests__/policy-refresh.test.ts: refresh brings a changed policy into the tracking ref and the reader applies it`, `src/cli/__tests__/command.test.ts: team refresh runs the refresh and reports the outcome` |
| `ac6` | `src/workflow/team/__tests__/policy-reader.test.ts: a working-tree edit has no effect`, `src/workflow/team/__tests__/policy-reader.test.ts: a feature-branch edit has no effect`, `src/workflow/team/__tests__/policy-reader.test.ts: a policy on an unlabelled tracking ref is never applied` |
| `ac7` | `src/workflow/team/__tests__/policy-reader.test.ts: a repo with no policy and no sighting reads as none and writes nothing`, `src/workflow/team/__tests__/policy-reader.test.ts: non-git, no-commit and no-remote directories without a sighting read as none`, `src/workflow/team/__tests__/policy-reader.test.ts: a remote without a remote HEAD and with no policy on any fetched ref reads as none` |
| `ac8` | `src/workflow/team/__tests__/starter-policy.test.ts: writes a starter with signoff for DEF, HLD, LLD and BUILD and claims enforced`, `src/workflow/team/__tests__/starter-policy.test.ts: refuses to overwrite an existing file`, `src/cli/__tests__/command.test.ts: team init writes the starter and reports its path` |
| `ac9` | `src/workflow/team/__tests__/policy-refresh.test.ts: unreachable remote reports failure and the last fetched policy stays in use`, `src/workflow/team/__tests__/policy-reader.test.ts: a known team repo with no fetched policy is refused with the reason`, `src/workflow/team/__tests__/policy-reader.test.ts: a known team repo whose remote was removed is refused or read from the recorded commit, never none`, `src/workflow/team/__tests__/policy-refresh.test.ts: a supplied branch is refused when the remote is unreachable and nothing is recorded` |

## 7. Alternatives considered

### 7.1 a1: Remote-tracking ref as the cache: a no-network reader that refuses when the default branch is unknown, a locked refresh that asks for the branch when it cannot detect it, and the first-appearance anchor — **CHOSEN**

Read the policy from the local copy of the remote default branch that git already keeps, in the HLD's own result envelope; refresh with one explicit-refspec fetch under a per-repository lock; when the default branch cannot be detected, the refresh command asks the user to name it and verifies the name on the remote.

The reader is synchronous, non-interactive and never touches the network or guesses a branch. A sighting file, when one exists, takes precedence over every solo-repo shortcut. The default branch comes only from authoritative local data: the branch recorded in a valid sighting, else the remote HEAD reference, else unknown. When it is unknown and a remote exists, the reader checks locally whether any remote-tracking ref of that remote (skipping the symbolic HEAD) carries the policy file: if one does it returns ok false telling the user to run team refresh with --branch and the default branch's name, and it never applies a policy from an unlabelled ref; if none does it returns ok 'none', so ordinary solo repos behave as today. With a known branch it reads .insrc/policy.json from the tracking ref (or the recorded commit when the ref is gone), validates it against the authored-fields schema and fills the derived source metadata itself, returning the HLD envelope unchanged. The first time it finds a policy file with no sighting it creates the sighting by no-clobber hard link. The refresh is the one network call, run from team refresh [path] [--branch name]. Under a per-repository lock and one 10-second deadline it asks ls-remote for the remote's default branch; when the remote names one, that answer wins and overwrites any earlier pin. Only when ls-remote cannot name a branch and no branch is recorded in a valid sighting does it refuse and ask the user to re-run with --branch. A branch given with --branch is verified to exist on the remote with ls-remote --heads before it is recorded with source user; an unverifiable name is refused. It then fetches only that branch with an explicit refspec and an empty refmap, reads the policy, writes the sighting (or removes it when the file is gone) and points the remote HEAD at the branch, which is only cosmetic. The grandfathering anchor is the oldest add of the policy file on the first-parent history of the tracking ref, so a later delete and re-add does not move it; a shallow repository gives anchorKnown false. A pinned branch is local like the sighting, so it is not a security boundary.

### 7.2 a2: Own cache file as the only read source, refreshed asynchronously

Keep a copy of the policy in a file under the user's insrc directory and read only that copy; a background refresh keeps it current.

A refresh job fetches the default branch, extracts the policy and writes it to a per-repo cache file; every read parses that file and never runs git. The cache entry doubles as the team-repo sighting.

**Rejected because:** A second, user-writable source of truth that violates the spirit of k5 and needs a scheduler nothing provides (partial on ac5, ac7 and ac9).

### 7.3 a3: Fetch inside every read

Every read runs a bounded fetch of the default branch before reading it, so the policy is always as it stands on the branch.

The reader is synchronous and performs a git fetch of the remote default branch with the 10-second bound each time it is called, then reads the policy from the fetched ref; a failed fetch falls back to the last fetched ref.

**Rejected because:** Puts a network round trip and up to 10 seconds in every guarded action, violates ac7 and is partial on sc2.

## 8. References

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md` — "A repo without the policy file must behave exactly as it does today."
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md` — "The policy (sc2) is read from the remote default branch and says which stages need signoff"
- **[[c3]]** `code` `src/workflow/gates.ts:569-578`
- **[[c4]]** `code` `src/workflow/tracker/github.ts:17-40`
- **[[c5]]** `code` `src/shared/paths.ts`
- **[[c6]]** `code` `src/workflow/storage.ts:77-88`
- **[[c7]]** `code` `src/cli/command.ts:32-62`
- **[[c8]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md` — "Policy is read only from the remote default branch and cannot be overridden locally; configuration is local and per repository."
- **[[c9]]** `code` `tsconfig.json:27-30`

## 9. Open questions

- cd1 (partial): PolicyRefresh, AnchorFinder, StarterPolicyWriter, TeamInitCommand and TeamRefreshCommand are new functions inside s2's boundary that sc2 does not name; decide whether sc2 should list them or they stay internal to s2.
- dm1 (partial): the call sites for the new PolicyFile and PolicySighting entities are the nearest existing code the new code follows, since no existing code touches them.
- ts2 (partial): no test-location pass was run in s1; node:test through tsx is taken from the repo's CLAUDE.md and the existing suites.
- alt2 (partial): the Epic constraints k4 and k5 are covered through the acceptance criteria but not scored separately.
- sbdry3 (partial): the one change to the HLD contract, source.anchorKnown, is proposed as a non-breaking fieldAdd amendment.
- A repo that never fetched anything and has no sighting has no local evidence of a policy and reads as none until a refresh; this is the one remaining unenforced state and is accepted because nothing can be known locally without a network call.

## Resolved questions

- `q90c58cff` — cd1 (partial): PolicyRefresh, AnchorFinder, StarterPolicyWriter, TeamInitCommand and TeamRefreshCommand are new functions inside s2's boundary that sc2 does not name; decide whether sc2 should list them or they stay internal to s2.
  - **resolved**: Keep all five internal — They are implementation details inside s2's boundary; sc2 stays the HLD envelope. _(2026-10-17T06:11:05.997Z)_
- `q6f462bb4` — dm1 (partial): the call sites for the new PolicyFile and PolicySighting entities are the nearest existing code the new code follows, since no existing code touches them.
  - **resolved**: Follow call-site conventions — Follow the nearest existing code (storage.ts atomic writes, paths.ts layout, daemon lock rule) as integration precedent. _(2026-10-17T06:12:00.844Z)_
- `q6d9271ce` — ts2 (partial): no test-location pass was run in s1; node:test through tsx is taken from the repo's CLAUDE.md and the existing suites.
  - **resolved**: Verify test locations before planning — Tests live in src/**/__tests__/*.test.ts run by tsx --test; confirm existing suites while planning. _(2026-10-17T06:12:45.609Z)_
- `q042661a7` — alt2 (partial): the Epic constraints k4 and k5 are covered through the acceptance criteria but not scored separately.
  - **resolved**: Keep acceptance-criteria scoring — Design-time scoring only; k4 and k5 are already proved by ac5-ac9 tests in the build. _(2026-10-17T06:13:19.963Z)_
- `q6e2bbee3` — sbdry3 (partial): the one change to the HLD contract, source.anchorKnown, is proposed as a non-breaking fieldAdd amendment.
  - **resolved**: Optional field addition — AMD-315d510cb28100e2-4 approved as additive and non-breaking; the reader always populates it and a consumer treats absence as unknown (grandfather nothing). _(2026-10-17T06:13:45.109Z)_

## Citations

- **[[c1]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md` — "A repo without the policy file must behave exactly as it does today."
- **[[c2]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md` — "The policy (sc2) is read from the remote default branch and says which stages need signoff"
- **[[c3]]** `code` `src/workflow/gates.ts:569-578`
- **[[c4]]** `code` `src/workflow/tracker/github.ts:17-40`
- **[[c5]]** `code` `src/shared/paths.ts`
- **[[c6]]** `code` `src/workflow/storage.ts:77-88`
- **[[c7]]** `code` `src/cli/command.ts:32-62`
- **[[c8]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md` — "Policy is read only from the remote default branch and cannot be overridden locally; configuration is local and per repository."
- **[[c9]]** `code` `tsconfig.json:27-30`
