<!-- insrc:artifact PLAN-315d510cb28100e2-s2 -->

# Plan: E20261017315d510c:S002

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1792216010054-u5nrq5`
**LLD effective hash:** `381fe69e77e4...`

Building this Story adds a self-contained team-policy module (policy file parser, per-repository sighting record and lock, anchor finder, reader, refresh and starter writer) and two command-bar commands, team init and team refresh, that expose it. The work is ordered so each piece is tested against real git before the next builds on it, and the existing gate code is not touched.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Team types, PATHS entry and policy-file parser | M | — | unit: src/workflow/team/__tests__/policy-parser.test.ts: a valid policy file parses with the fixed claimUnits and forceTaskIssues true; unit: src/workflow/team/__tests__/policy-parser.test.ts: bad JSON, an unknown field, a wrong type and a file carrying claimUnits, forceTaskIssues or source are rejected with a reason | [[c1]] [[c5]] |
| 2 | **`t2`** Sighting store and per-repository lock | M | `t1` | unit: src/workflow/team/__tests__/sighting-store.test.ts: the sighting key comes from the real path so repositories and symlinks are distinct; unit: src/workflow/team/__tests__/sighting-store.test.ts: a damaged sighting reads as damaged evidence, branchSource remote or user is validated; unit: src/workflow/team/__tests__/sighting-store.test.ts: create-only publish never overwrites an existing or damaged sighting; unit: src/workflow/team/__tests__/sighting-store.test.ts: a known anchor is never replaced by an unknown one and an unknown one is replaced by a known one; unit: src/workflow/team/__tests__/sighting-store.test.ts: the lock refuses a second holder and takes over a lock older than 30 seconds | [[c5]] [[c6]] |
| 3 | **`t3`** AnchorFinder | S | `t1` | unit: src/workflow/team/__tests__/anchor-finder.test.ts: parsing git log output picks the oldest add even after a later delete and re-add; integration: src/workflow/team/__tests__/anchor-finder.test.ts: adoption, approval, deletion and reintroduction keeps the adoption commit on real history; integration: src/workflow/team/__tests__/anchor-finder.test.ts: a depth-1 shallow clone gives known false and deepening gives a known anchor; unit: src/workflow/team/__tests__/anchor-finder.test.ts: a failing git log gives known false without throwing | [[c3]] [[c5]] [[c6]] |
| 4 | **`t4`** PolicyReader | L | `t1`, `t2`, `t3` | integration: src/workflow/team/__tests__/policy-reader.test.ts: reads the policy from the remote default branch's tracking ref; integration: src/workflow/team/__tests__/policy-reader.test.ts: a working-tree edit has no effect; integration: src/workflow/team/__tests__/policy-reader.test.ts: a feature-branch edit has no effect; integration: src/workflow/team/__tests__/policy-reader.test.ts: a policy on an unlabelled tracking ref is never applied; integration: src/workflow/team/__tests__/policy-reader.test.ts: an unknown default branch with a fetched policy is refused with the --branch instruction; integration: src/workflow/team/__tests__/policy-reader.test.ts: a remote without a remote HEAD and with no policy on any fetched ref reads as none; integration: src/workflow/team/__tests__/policy-reader.test.ts: a repo with no policy and no sighting reads as none and writes nothing; integration: src/workflow/team/__tests__/policy-reader.test.ts: non-git, no-commit and no-remote directories without a sighting read as none; integration: src/workflow/team/__tests__/policy-reader.test.ts: a never-fetched repo with no sighting reads as none; integration: src/workflow/team/__tests__/policy-reader.test.ts: a known team repo with no fetched policy is refused with the reason; integration: src/workflow/team/__tests__/policy-reader.test.ts: a known team repo whose remote was removed is refused or read from the recorded commit, never none; unit: src/workflow/team/__tests__/policy-reader.test.ts: the remote is origin, else the sole remote, never guessed, and a sighting's remote stays authoritative; unit: src/workflow/team/__tests__/policy-reader.test.ts: first observation creates the sighting create-only and a failed write does not change the result | [[c1]] [[c5]] [[c6]] [[c7]] |
| 5 | **`t5`** Default-branch resolution and pin verification | M | `t1`, `t2` | unit: src/workflow/team/__tests__/branch-resolution.test.ts: the remote's answer wins over a supplied branch, then the sighting's branch, then the supplied branch after verification; integration: src/workflow/team/__tests__/branch-resolution.test.ts: a dangling remote HEAD is refused without --branch and a real branch is recorded with source user; integration: src/workflow/team/__tests__/branch-resolution.test.ts: a missing branch name or an unreachable remote records nothing | [[c2]] [[c5]] [[c6]] [[c7]] |
| 6 | **`t6`** PolicyRefresh fetch and record | M | `t2`, `t3`, `t4`, `t5` | integration: src/workflow/team/__tests__/policy-refresh.test.ts: refresh brings a changed policy into the tracking ref and the reader applies it; integration: src/workflow/team/__tests__/policy-refresh.test.ts: only the default branch's tracking ref changes with no tag, other branch, FETCH_HEAD or prune effect; integration: src/workflow/team/__tests__/policy-refresh.test.ts: unreachable remote reports failure and the last fetched policy stays in use; integration: src/workflow/team/__tests__/policy-refresh.test.ts: a supplied branch is refused when the remote is unreachable and nothing is recorded; integration: src/workflow/team/__tests__/policy-refresh.test.ts: sighting write failure reports failure and cosmetic HEAD failure is a warning only; integration: src/workflow/team/__tests__/policy-refresh.test.ts: a second refresh is refused while the lock is held and a stale lock is taken over; integration: src/workflow/team/__tests__/policy-refresh.test.ts: default-branch rename and policy file removal | [[c2]] [[c5]] [[c6]] [[c7]] |
| 7 | **`t7`** StarterPolicyWriter | S | `t1` | unit: src/workflow/team/__tests__/starter-policy.test.ts: writes a starter with signoff for DEF, HLD, LLD and BUILD and claims enforced; unit: src/workflow/team/__tests__/starter-policy.test.ts: refuses to overwrite an existing file | [[c4]] [[c6]] |
| 8 | **`t8`** team init and team refresh commands | M | `t6`, `t7` | integration: src/cli/__tests__/command.test.ts: team init writes the starter and reports its path; integration: src/cli/__tests__/command.test.ts: team refresh runs the refresh and reports the outcome; integration: src/cli/__tests__/command.test.ts: team refresh --branch passes the name through and renders the refusal that asks for it; integration: src/cli/__tests__/command.test.ts: a thrown error from either team command renders as a cross-prefixed line; integration: src/cli/__tests__/tui.test.ts: the TUI tests run with fakeServices carrying the team entry | [[c4]] [[c5]] [[c7]] |

### 1.1 E20261017315d510c:S002:T001 — Team types, PATHS entry and policy-file parser

Add the ~/.insrc/team directory entry to PATHS in src/shared/paths.ts, and create src/workflow/team/ with the types (TeamPolicy including source.anchorKnown, PolicyResult, PolicyAnchor, PolicyRefreshOutcome) and the parser that validates .insrc/policy.json against the authored-fields schema (teamMode, signoffStages, claimsEnforced, administrators), rejecting unknown fields, wrong types, and files carrying claimUnits, forceTaskIssues or source, and that derives claimUnits and forceTaskIssues itself.

**Acceptance checks:**
- A valid policy file parses to a TeamPolicy with the fixed claimUnits and forceTaskIssues true.
- Bad JSON, an unknown field, a wrong type, or a file carrying claimUnits, forceTaskIssues or source is rejected with a reason.
- PATHS exposes the team directory used by the sighting store.

### 1.2 E20261017315d510c:S002:T002 — Sighting store and per-repository lock

Implement the per-repository sighting file at ~/.insrc/team/seen/<16 hex sha256 of realpath>.json: read with shape validation (damaged is distinguishable from absent), unique-temp-name overwrite writer for refresh, create-only hard-link publish for the reader, removal, the anchor merge rule (a known anchor is never replaced by an unknown one), and the exclusive lock with the 30 second stale rule.

**Acceptance checks:**
- Two repositories, including a symlinked path, get distinct keys from the real path.
- A damaged sighting reads as damaged evidence, never as absent.
- Create-only publish never overwrites an existing or damaged sighting; the overwrite writer uses a unique temp name.
- The lock refuses a second holder, and takes over a lock older than 30 seconds.

### 1.3 E20261017315d510c:S002:T003 — AnchorFinder

Implement the grandfathering anchor: the oldest add of .insrc/policy.json on the first-parent history of the tracking ref, with committer time in ISO form, known false and empty values for a shallow repository, a failed walk or no add found; a later delete and re-add never moves it.

**Acceptance checks:**
- On a history with adoption, deletion and reintroduction the anchor is the adoption commit.
- A depth-1 shallow clone gives known false with empty commit and time.
- A failing git log gives known false without throwing.

### 1.4 E20261017315d510c:S002:T004 — PolicyReader

Implement the synchronous, network-free reader in the HLD envelope: sighting checked first and taking precedence over every solo shortcut; branch from the sighting, else the remote HEAD, else unknown (remote is origin, else the sole remote, a sighting's recorded remote stays authoritative); read the policy from the tracking ref or the recorded commit; refuse with the team refresh --branch instruction only when a fetched tracking ref (symbolic HEAD skipped) carries the policy file while the branch is unknown; none when no sighting and no evidence; create-only sighting write on first observation; fill the derived source block including the anchor.

**Acceptance checks:**
- The policy is read from the default branch tracking ref and working-tree or feature-branch edits have no effect.
- Non-git, no-commit and no-remote directories without a sighting read as none with no write.
- A known team repo whose remote was removed is refused or read from the recorded commit, never none.
- An unknown default branch with a policy on a fetched ref is refused with the --branch instruction and no policy is applied; with no policy on any fetched ref it reads as none.
- A never-fetched repo with no sighting reads as none.
- The remote is origin when present, else the sole remote; several remotes without origin are not guessed (none without a sighting); a sighting's recorded remote stays authoritative.
- The first observation creates the sighting create-only and a failed write never changes the result.

### 1.5 E20261017315d510c:S002:T005 — Default-branch resolution and pin verification

Implement the refresh's branch decision: parse git ls-remote --symref output (the remote's answer wins over any pin), fall back to the branch recorded in a valid sighting, then to a supplied --branch name verified with git ls-remote --heads (non-empty output) and recorded with source user, otherwise refuse with the instruction to re-run with --branch; an unreachable remote or a missing branch records nothing.

**Acceptance checks:**
- The remote's named default branch is used and overrides an earlier user pin; the supplied name is ignored.
- With a dangling remote HEAD and no pin the result is a refusal asking for --branch.
- A supplied branch is accepted only when ls-remote --heads prints it; a missing branch or an unreachable remote returns a reason and records nothing.

### 1.6 E20261017315d510c:S002:T006 — PolicyRefresh fetch and record

Implement the guarded refresh sequence under the per-repository lock and one 10 second deadline: use the resolved branch, fetch only that branch with an explicit refspec, --refmap= and the isolating flags, read the policy from the updated tracking ref, find the anchor, write the sighting (or remove it when the file is absent) before the cosmetic remote HEAD update, return ok false when the sighting cannot be recorded after the ref moved, and treat a failed cosmetic update as a warning.

**Acceptance checks:**
- Only the default branch tracking ref changes; no tag, other tracking ref, FETCH_HEAD or prune effect.
- A refresh brings a changed policy into the tracking ref and the reader then applies it.
- An unreachable remote reports failure and leaves the last fetched policy in use.
- A sighting write failure reports failure, a cosmetic HEAD failure is only a warning, and a second refresh is refused while the lock is held.
- The policy file removed from the default branch removes the sighting and the repo reads as none.

### 1.7 E20261017315d510c:S002:T007 — StarterPolicyWriter

Write the starter .insrc/policy.json (authored fields: signoff for DEF, HLD, LLD and BUILD, claims enforced) by hard link so an existing file is never overwritten, and nothing is committed or pushed.

**Acceptance checks:**
- The starter has signoff for DEF, HLD, LLD and BUILD and claims enforced.
- An existing file, including an uncommitted one, is refused and left untouched.

### 1.8 E20261017315d510c:S002:T008 — team init and team refresh commands

Add src/cli/services/team.ts with teamInit and teamRefresh, the team entry in the Services interface and makeServices in src/cli/services/index.ts, the help lines and the team dispatch case with runTeam (sub words init and refresh, optional path, --branch flag) in src/cli/command.ts, one-line result formatting and cross-prefixed error rendering, and add the team entry to the two test facades.

**Acceptance checks:**
- team init and team refresh dispatch with an optional path and the context repo as default.
- team refresh --branch passes the name through and the refusal that asks for it is rendered.
- A thrown error from either command renders as a cross-prefixed line.
- The existing command and TUI tests still run with the facades carrying the team entry.
- A team refresh followed by a reader call in a temp clone returns the policy end to end.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Policy file parsing against the authored-fields schema: valid file, unknown field, wrong type, bad JSON, a file carrying claimUnits, forceTaskIssues or source | `t1` |
| Sighting read and validation, branchSource remote or user, damaged sighting treated as evidence | `t2` |
| Reader precedence: a sighting is checked before any solo shortcut; branch precedence is sighting branch, then remote HEAD, then unknown | `t4` |
| Reader with an unknown default branch: refuses with the --branch instruction when a tracking ref carries the policy file, skips the symbolic HEAD, returns none when none does, and never applies a policy from an unlabelled ref | `t4` |
| Reader create-only sighting write on first observation, never overwriting an existing or damaged sighting, failure not changing the result | `t2`, `t4` |
| Anchor parsing of git log output: the oldest add is chosen even after a later delete and re-add; shallow gives known false; a known anchor is never replaced by an unknown one | `t2`, `t3` |
| Refresh branch resolution: the remote's answer wins over a supplied branch, then the sighting's branch, then the supplied branch after verification | `t5` |
| Sighting key derivation from the real path | `t2` |
| StarterPolicyWriter no-clobber hard link | `t7` |
| Reader returns the policy from the default branch's tracking ref and ignores working-tree and feature-branch edits | `t4` |
| Reader returns ok none for a non-git directory, a repo with no commits and a repo with no remote when no sighting exists | `t4` |
| Reader in a repo with a remote, the remote HEAD removed with git remote set-head -d and a fetched policy: refused with the --branch instruction; the same repo with no policy on any fetched ref: none | `t4` |
| Regression: a known team repo whose remote was removed, whose clone has no commits or refs, or that is no longer a git repo is refused or read from the recorded commit, never read as none | `t4` |
| Refresh isolation: only the default branch's tracking ref changes, with no tag, other branch, FETCH_HEAD or prune effect | `t6` |
| Refresh with the remote HEAD dangling: refused without --branch; with --branch naming a real branch it records source user and fetches; with a missing branch name or an unreachable remote nothing is recorded | `t5`, `t6` |
| Refresh where the remote names its default branch overrides an earlier user pin | `t5` |
| Refresh offline: unreachable remote leaves the last fetched policy in use, and a known team repo with nothing fetched is refused with the reason | `t4`, `t6` |
| Refresh step failures: sighting write failure reports failure, cosmetic HEAD failure is a warning only | `t6` |
| Refresh lock: a second refresh is refused, a lock older than 30 seconds is taken over | `t2`, `t6` |
| Default-branch rename and policy file removal | `t6` |
| Anchor on real history: adoption, approval, deletion, reintroduction keeps the adoption commit; a depth-1 shallow clone gives known false; deepening the history lets the next refresh record a known anchor | `t3`, `t6` |
| team init and team refresh dispatch, help lines and result lines, with an optional path and the context repo as default | `t8` |
| team refresh --branch passes the name through to the service and renders the refusal that asks for it | `t8` |
| A thrown error from either command rendered as a cross-prefixed line | `t8` |
| The two Services test facades gain the team entry so the command tests run; no claim is made that they compile | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 PolicyReader contract and reader error paths`
- **[[c2]]** `prior-artifact` `LLD s2 PolicyRefresh contract and refresh error paths`
- **[[c3]]** `prior-artifact` `LLD s2 AnchorFinder contract (first-appearance anchor, shallow gives unknown)`
- **[[c4]]** `prior-artifact` `LLD s2 StarterPolicyWriter, TeamInitCommand and TeamRefreshCommand contracts`
- **[[c5]]** `prior-artifact` `LLD s2 data model changes (TeamPolicy source.anchorKnown, PolicyFile, PolicySighting, Services)`
- **[[c6]]** `prior-artifact` `LLD s2 error paths and edge cases`
- **[[c7]]** `prior-artifact` `LLD s2 test strategy and acceptance mapping`
