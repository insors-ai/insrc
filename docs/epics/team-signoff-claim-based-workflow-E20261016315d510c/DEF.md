<!-- insrc:artifact DEF-315d510cb28100e2 -->

# Epic: team-signoff-claim-based-workflow

## Summary

**Flavor:** new-capability
**Seeded from:** `SPEC-be8bcc435fe0cf93`

Teams get a workflow where moving to the next stage needs agreement from other people, not just the author, and where each piece of work has exactly one owner at a time. The agreement and ownership live in the tracker the team already uses, so reviewers need not run insrc themselves, and the rules the team sets cannot be loosened on a single machine. A repo that does not opt in works exactly as it does today.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. Problem

The insrc workflow assumes a single person working alone. An artifact is approved by one yes from whoever is at the keyboard, so there is no way for the other people on a team to agree before the work moves to its next stage; the only independent check, the other-party review, is between two models and involves no colleague. Nothing records who owns a piece of work, so two people can author or build the same item at once and discover the collision only when their changes meet. Work that is handed from one person to another cannot be picked up, because the state of an unfinished stage lives on one person's machine and in an opaque token. The tracker support is built for one tracker only, so a team that tracks its work and reviews its changes in a different system cannot use it, and the rules a team wants to hold everyone to (which stages need agreement, whether ownership is enforced) have nowhere to live that one developer cannot quietly change for themselves, since settings today are per machine. The cost falls on every team of more than one person: approvals that mean only that one person was satisfied, duplicated or conflicting work, and a chain whose gates the team cannot trust or enforce.

## 2. Functional requirements

- **E20261016315d510c:FR001** — A stage that the team's policy marks as needing signoff does not let the next stage start until the signoff request for it has completed in the tracker. _(Signoff is the team's gate to advance, separate from the author's own approval.)_
- **E20261016315d510c:FR002** — Local approval by the author and the LLM, and the existing other-party model review, keep their present meaning and remain prerequisites to opening a signoff request. _(The three layers must not be confused: model review, local approval and team signoff.)_
- **E20261016315d510c:FR003** — One signoff request can cover several artifacts, and its completion signs off every artifact it contains; a request is never partly signed off. _(The author chooses the grouping and a reviewer decides on the request as a whole.)_
- **E20261016315d510c:FR004** — Only the current holder of a stage unit's claim can run the actions that change that stage; anyone can still read, analyze and review it. _(One owner at a time prevents conflicting work on the same item.)_
- **E20261016315d510c:FR005** — A claim is held by the assignee of the stage unit's tracker issue, is read from the tracker at every stage turn, and an assignment made directly in the tracker is honoured. _(The tracker stays the source of truth for who owns work.)_
- **E20261016315d510c:FR006** — A claim ends only by explicit release (by its holder or an administrator) or automatically when the stage's signoff request is seen to have completed; there is no automatic takeover of a stale claim. _(Ownership never changes hands without a person's decision.)_
- **E20261016315d510c:FR007** — When a stage is reassigned while in progress, the previous holder is refused further changes and is offered a way to park their draft so the new holder can resume from it. _(Handoff must not lose unfinished work.)_
- **E20261016315d510c:FR008** — A stage's unfinished state can be rebuilt from files committed to the repo, so that a different person on a different machine can continue it. _(Each developer has their own daemon; the repo and the tracker are the shared truth.)_
- **E20261016315d510c:FR009** — Each stage unit (the Epic's definition and high-level design, a Story's low-level design and plan, and each build Task) gets its own tracker issue automatically when its artifact is first drafted, without ever creating a second issue for the same unit. _(A claim needs an issue to attach to, and some trackers need the item to exist before work begins.)_
- **E20261016315d510c:FR010** — Which stages need signoff, whether claims are enforced and what the claim units are is set by a central policy kept in the repo and read from the remote default branch, and cannot be overridden on a developer's machine. _(The team's rules must hold for everyone.)_
- **E20261016315d510c:FR011** — Each developer's own settings (which tracker and target, tool binaries and sign-in, branch naming) are local and editable from the VS Code settings, the JetBrains settings and the terminal client. _(Personal and environment details differ per person and must not be policy.)_
- **E20261016315d510c:FR012** — The team features reach the tracker only through a common interface that declares what each tracker can do, and a tracker that cannot do something the policy needs is refused when it is loaded. _(Support for further trackers must not weaken the team's gates.)_
- **E20261016315d510c:FR013** — A repo with no policy behaves exactly as it does today. _(Solo use must be unaffected.)_

**s1:**

- **E20261016315d510c:S001:FR001** — Every tracker declares which of claim, issue creation, signoff request and completion detection it supports. _(The policy can be checked against the declared set.)_
- **E20261016315d510c:S001:FR002** — A tracker missing a capability the policy needs is refused at load. _(No gate may be silently skipped.)_

**s2:**

- **E20261016315d510c:S002:FR001** — The policy names team mode, the stages needing signoff, claim enforcement and the claim units. _(These are the rules that must hold for everyone.)_
- **E20261016315d510c:S002:FR002** — A repo without a policy is a solo repo. _(Solo use is unaffected.)_

**s3:**

- **E20261016315d510c:S003:FR001** — Local settings are per user and per repo and are not shared. _(Personal and environment details differ per person.)_
- **E20261016315d510c:S003:FR002** — Every client shows the same settings from one definition. _(Three clients must not drift.)_

**s4:**

- **E20261016315d510c:S004:FR001** — The same stage unit never gets two issues, however often its draft is written. _(A duplicate would split ownership.)_
- **E20261016315d510c:S004:FR002** — Task issues are always created in team mode. _(Each build Task is a claim unit.)_

**s5:**

- **E20261016315d510c:S005:FR001** — A claim is the assignee of the stage unit's issue, read live. _(The tracker stays the source of truth.)_
- **E20261016315d510c:S005:FR002** — Claims end only by explicit release or by completion, never by timeout. _(Ownership changes by a person's decision.)_

**s6:**

- **E20261016315d510c:S006:FR001** — A parked draft carries everything needed to resume. _(The new owner uses a different daemon.)_
- **E20261016315d510c:S006:FR002** — A stage's resumable state can be rebuilt from committed files. _(Local state is not shared.)_

**s7:**

- **E20261016315d510c:S007:FR001** — Signoff is a gate separate from model review and local approval. _(Three layers must stay distinct.)_
- **E20261016315d510c:S007:FR002** — Completion is checked when the next stage is attempted, not in the background. _(No polling or webhooks.)_

**s8:**

- **E20261016315d510c:S008:FR001** — Every change after review feedback passes local approval again. _(Merging must mean the same thing the reviewers saw.)_

## 3. Non-goals

- **No provisional mode: no stage starts before the previous stage's signoff request has completed.** — A blocking gate is simple and safe; tracking which downstream work is stale after an upstream change is a large cost the team did not choose to take on.
- **Team signoff is never called a review and never counts toward the other-party model review; the meaning of model review and local approval is unchanged.** — Three separate layers must stay distinguishable in vocabulary and in code.
- **No partial signoff of a request's contents.** — If reviewers want different outcomes for different artifacts the request is split instead.
- **insrc does not decide who may sign off, how many must, whether bots count, when approvals go stale, or who may override.** — The tracker or code host already owns these rules; duplicating them would drift.
- **No polling or webhooks to detect completion; completion is checked on demand through the tracker.** — Avoids a background service, rate-limit and credential concerns.
- **No direct cloud REST for GitHub or GitLab (command-line tools only; a thin REST client only for Jira), and no enforcement in the AI host's own tracker connectors.** — Enforcement must hold in every host, and connector coverage differs between hosts.
- **No automatic takeover of a stale claim.** — Changing ownership is a person's decision.
- **No shared team daemon or shared index.** — Each developer keeps their own; the repo and tracker are the shared truth.
- **No team policy read from a file in the developer's working tree.** — A locally editable file would let one developer override the team's rules.
- **Building the GitLab and Jira trackers themselves is outside the first delivery; only the common interface they will plug into is in scope.** — GitHub ships first; the interface must make later trackers possible without reworking the gates.

## 4. Assumptions

- `high` Workflow artifacts are files committed to the repo, so version control already shares them between developers. [[c1]]
- `med` Teams that adopt this already use an external tracker or code host in which assignees, reviewers and approval rules are managed. [[c8]]
- `med` The tracker's own permissions and review rules are authoritative, so insrc only needs to know whether a request completed and who the assignee is. [[c8]]
- `high` Today the tracker flow creates issues for Epics, Stories and (optionally) Tasks, and looks up an existing issue by label before creating it only for the Epic; Story and Task issues are created without such a lookup, so making their creation safe to repeat is new work. [[c4]]
- `high` The terminal client already reads the shared settings catalog definition (through its command bar) but has no per-repo tracker settings screen; its Setup screen covers system and model setup. [[c10]]
- `low` Jira has an approval concept that can stand in for a signoff request, but how an approval refers to artifact content is unverified. [[c8]]
- `med` A design for a tracker tool with one implementation per tracker type exists; it has passed its daemon review but carries no approval stamp and is not built, and it overlaps this work, so it must be reconciled with the common interface. [[c7]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Enforcement of signoff and claims lives in the daemon, never in the AI host's connectors. | [[c8]] |
| `k2` | stakeholder | Tracker adapters are command-line-first with structured output and contract tests; only Jira may use a thin REST client. | [[c8]] |
| `k3` | invariant | The meaning of the other-party model review (meta.review) and of local approval (approvedAt) must not change. | [[c3]] |
| `k4` | invariant | A repo without the policy file must behave exactly as it does today. | [[c1]] |
| `k5` | stakeholder | Policy is read only from the remote default branch and cannot be overridden locally; configuration is local and per repo. | [[c8]] |
| `k6` | convention | New settings are defined once in the daemon's shared settings catalog, so that the VS Code settings, the JetBrains settings and the terminal client all present them from one definition. | [[c5]] |
| `k7` | convention | The daemon owns all database access; clients and the MCP server reach it only through IPC. | [[c9]] |
| `k8` | stakeholder | A tracker that lacks a capability the policy requires is rejected when loaded; there is no degraded operation. | [[c8]] |

## 6. Stories

### 6.1 E20261016315d510c:S001 — Rely on a tracker only for what it can really do

**User value:** `size: L`

A team can rely on a tracker only for things it can really do, and later trackers can be added without weakening the team's gates.

**Extends:** [[c11]] [[c12]]

**Acceptance criteria:**

- **ac1:** Given a repo whose configured tracker declares every capability the team policy needs, when the tracker is loaded, then loading succeeds and the team features use only the capabilities the tracker declared. _(operationalizes `k8`)_
- **ac2:** Given the policy needs a capability that the configured tracker does not declare, when the tracker is loaded, then loading is refused with an error naming the missing capability, and no reduced mode is run. _(operationalizes `k8`)_
- **ac3:** Given the tracker behaviour that exists today for GitHub (issues for Epics, Stories and Tasks), when it is reached through the common interface, then its results are the same as before. _(operationalizes `k4`)_
- **ac4:** Given a developer whose machine lacks the tracker's command-line tool or sign-in, when the tracker is loaded, then the error says which tool or sign-in is missing. _(operationalizes `k2`)_

### 6.2 E20261016315d510c:S002 — Set team rules centrally so no one can override them locally

**User value:** `size: M`

A team lead sets which stages need agreement and whether ownership is enforced once, and every developer is held to it.

**Acceptance criteria:**

- **ac5:** Given a repo whose remote default branch carries a policy file, when any developer runs a workflow action, then the policy as it stands on that branch is applied. _(operationalizes `k5`)_
- **ac6:** Given a developer edits the policy file in their working tree or on a feature branch, when workflow actions run, then the edit has no effect until it is on the remote default branch. _(operationalizes `k5`)_
- **ac7:** Given a repo with no policy file, when any workflow action runs, then behaviour is exactly as before and no team check is made. _(operationalizes `k4`)_
- **ac8:** Given a team lead in a repo with no policy, when they run the team setup command, then a starter policy (signoff for definition, high-level design, low-level design and build completion; claims enforced) is written for them to review and commit. _(operationalizes `k5`)_
- **ac9:** Given the remote default branch cannot be reached, when a team action needs the policy, then a previously fetched policy is used if one exists, and otherwise the action is refused with the reason. _(operationalizes `k5`)_

### 6.3 E20261016315d510c:S003 — Keep personal tracker settings local and editable from every client

**User value:** `size: L`

Each developer sets their own tracker target, tool locations and branch naming from the place they already use, without touching the team's rules.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac10:** Given a developer opens insrc settings in VS Code or JetBrains for a repo, when they view the repo's tracker section, then they can see and edit the tracker type, target, tool locations and sign-in, and branch naming for that repo. _(operationalizes `k6`)_
- **ac11:** Given a developer using the terminal client, when they open the repo's tracker settings, then they can see and edit the same fields they can in VS Code and JetBrains. _(operationalizes `k6`)_
- **ac12:** Given a repo with no explicit tracker target, when the tracker is resolved, then the target comes from the repo's git remote. _(operationalizes `k6`)_
- **ac13:** Given a developer changes a local setting in one client, when they open the settings in another client, then the same value is shown. _(operationalizes `k6`, `k7`)_
- **ac14:** Given team rules set by the policy (such as which stages need signoff), when a developer opens their settings in any client, then the rules are shown read-only with the policy's value and cannot be edited there. _(operationalizes `k5`)_

### 6.4 E20261016315d510c:S004 — Have an issue ready for every piece of work

**User value:** `size: M`

Each piece of work has an issue to own, so claims and signoff always have something to attach to.

**Depends on:** `s1`, `s2`

**Extends:** [[c11]]

**Acceptance criteria:**

- **ac15:** Given team mode and an Epic's definition artifact is first drafted, when the draft is written, then an issue for the Epic stage exists in the tracker, and writing the draft again never creates a second one. _(operationalizes `k1`)_
- **ac16:** Given team mode and a Story's design artifact is first drafted, when the draft is written, then an issue for the Story's design stage exists in the tracker, and writing the draft again never creates a second one. _(operationalizes `k1`)_
- **ac17:** Given team mode and a Story's plan with several build Tasks, when the plan is drafted, then each build Task has its own issue whatever the local setting for Task issues says, and drafting again never creates a second issue for a Task. _(operationalizes `k1`, `k5`)_
- **ac18:** Given the tracker cannot be reached when a draft is first written, when the issue cannot be created, then the author is told that the stage cannot yet be claimed and why. _(operationalizes `k1`)_

### 6.5 E20261016315d510c:S005 — Hold a stage by claiming it, and block everyone else from changing it

**User value:** `size: L`

Only one person works on a stage at a time, so two people never collide on the same item.

**Depends on:** `s1`, `s2`, `s4`

**Acceptance criteria:**

- **ac19:** Given team mode and a stage unit whose issue has no assignee, when a developer claims it, then they become the assignee in the tracker and can run changing actions on that stage. _(operationalizes `k1`)_
- **ac20:** Given another developer holds the claim, when someone else tries to author a step, build, approve locally or open a signoff request on that stage, then the action is refused naming the holder, while analyze and review of that stage still work. _(operationalizes `k1`)_
- **ac21:** Given an item that was assigned to a developer directly in the tracker, when that developer next acts on it, then they are recognised as the holder without a separate claim, because the assignee is read from the tracker at every stage turn. _(operationalizes `k1`)_
- **ac22:** Given a claim held by a developer, when the holder or an administrator releases it, then the tracker assignee is cleared and others can claim the stage. _(operationalizes `k1`)_
- **ac23:** Given a claim whose holder has been inactive for a long time, when another developer tries to take the stage without a release, then the attempt is refused, because claims are never taken over automatically. _(operationalizes `k1`)_
- **ac24:** Given a stage whose signoff request has completed, when the completion is next checked, then the claim is released automatically. _(operationalizes `k1`)_

### 6.6 E20261016315d510c:S006 — Hand unfinished work to a new owner without losing it

**User value:** `size: L`

When work is reassigned, the new owner picks up where the previous one stopped, on their own machine.

**Depends on:** `s5`

**Acceptance criteria:**

- **ac25:** Given a developer mid-way through a stage that is then reassigned to someone else in the tracker, when the first developer next tries a changing action, then it is refused and they are offered to park their draft. _(operationalizes `k1`)_
- **ac26:** Given the first developer chooses to park their draft, when parking completes, then the draft is committed to a handoff branch and a note pointing to it is added to the issue. _(operationalizes `k7`)_
- **ac27:** Given a parked draft on a handoff branch, when the new assignee continues the stage on their own machine, then they resume from the parked draft and its progress, without the first developer's machine or session. _(operationalizes `k7`)_
- **ac28:** Given a developer whose machine is lost before they could park, when the new assignee continues the stage, then they resume from the latest committed artifact files and redo only the unfinished step. _(operationalizes `k7`)_

### 6.7 E20261016315d510c:S007 — Require signoff in the tracker before the next stage starts

**User value:** `size: L`

Colleagues agree before work moves on, in the tracker they already use, without needing insrc.

**Depends on:** `s1`, `s2`, `s5`

**Acceptance criteria:**

- **ac29:** Given a stage the policy marks as needing signoff, with artifacts that have passed model review and local approval, when the claim holder submits them for signoff, then a signoff request containing the chosen artifacts is opened in the tracker and linked from the stage's issue. _(operationalizes `k1`, `k3`)_
- **ac30:** Given an artifact that has not passed model review or local approval, when the holder tries to submit it, then the submission is refused saying which prerequisite is missing. _(operationalizes `k3`)_
- **ac31:** Given a signoff request that has not completed, when anyone tries to start the next stage, then it is refused, saying the stage awaits signoff and linking the request. _(operationalizes `k1`)_
- **ac32:** Given the tracker reports the signoff request completed, when someone starts the next stage, then it proceeds and every artifact in the request is recorded as signed off together. _(operationalizes `k1`)_
- **ac33:** Given a signoff request containing several artifacts, when it completes, then all of its artifacts are signed off and none is signed off alone. _(operationalizes `k1`)_
- **ac34:** Given a stage the policy does not list for signoff, when the author approves it locally, then the next stage can start as it does today. _(operationalizes `k4`)_
- **ac35:** Given an artifact that is signed off, when its records are shown, then model review and local approval appear exactly as before, and signoff is shown separately and never counted as a review. _(operationalizes `k3`)_

### 6.8 E20261016315d510c:S008 — Revise a signoff request after reviewers ask for changes

**User value:** `size: M`

Reviewer feedback is handled in one place without weakening the author's own approval.

**Depends on:** `s7`

**Acceptance criteria:**

- **ac36:** Given an open signoff request on which a reviewer asks for changes, when the claim holder revises the artifact, then local approval must be run again before the revised artifact is pushed to the same request. _(operationalizes `k3`)_
- **ac37:** Given a revised artifact that has been pushed, when the request is checked, then it is still the single review thread and an earlier completion does not carry over. _(operationalizes `k1`)_
- **ac38:** Given someone who does not hold the claim, when they try to revise an artifact in an open request, then the revision is refused. _(operationalizes `k1`)_

## 7. References

- **[[c1]]** `doc` `docs/standalone/team-signoff-claim-based-workflow-E20261016be8bcc43/SPEC.md`
- **[[c2]]** `doc` `docs/plans/team-workflow.md`
- **[[c3]]** `code` `src/workflow/gates.ts`
- **[[c4]]** `code` `src/workflow/tracker-auto.ts` — "const adopted = ghFindIssueByLabels(cfg.owner, cfg.repo, [cfg.epicLabel, membership]);"
- **[[c5]]** `code` `src/config/settings-catalog.ts`
- **[[c6]]** `doc` `docs/plans/meta-workflow-framework.md` — "Tracker integration (GitHub only)"
- **[[c7]]** `doc` `docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md` — "ONE tracker tool, with one implementation per tracker type."
- **[[c8]]** `stakeholder` `User decisions made in the 2026-10-16 brainstorm session, recorded in docs/plans/team-workflow.md`
- **[[c9]]** `convention` `CLAUDE.md` — "Daemon owns all DB access"
- **[[c10]]** `code` `src/cli/config-catalog.ts` — "export { CONFIG_CATALOG } from '../config/config-catalog.js';"
- **[[c11]]** `analyze-bundle` `s1.analyzeBundles[0]`
- **[[c12]]** `analyze-bundle` `s1.analyzeBundles[1]`

## 8. Open questions

- Item a2: One assumption is low confidence (Jira approval can stand in for a signoff request, unverified); how a Jira approval refers to artifact content must be verified at design.
- Item s1d: The 'one tracker only' part of the problem is only enabled by the common interface, since GitLab and Jira trackers are a stated non-goal. Open items in the plan doc (migration of existing artifacts, a 'my items' view) have no Story yet.

## Resolved questions

- `q425abf90` — Item a2: One assumption is low confidence (Jira approval can stand in for a signoff request, unverified); how a Jira approval refers to artifact content must be verified at design.
  - **resolved**: Reference by artifact id + version only — Jira follows the GitHub pattern: the daemon creates the Epic, Story and Task issues in Jira, as tracker-auto does for GitHub, and writes the Jira issue key back into the artifact record. The binding is the recorded issue key plus the artifact id and version; no content hash for now. The HLD must carry a note on artifact versioning: record which artifact version a Jira signoff request was opened for, and treat a hash or snapshot binding as a later hardening. A git sync (pull or push) also runs a Jira sync that writes Jira status back into the artifact tracker record, as tracker.sync does for GitHub, and the user can trigger the Jira sync explicitly. A failing or slow Jira call never blocks the git operation; it only reports. Completion is still read live from the tracker when a stage is attempted. _(2026-10-16T16:35:16.152Z)_
- `q8baf0b8f` — Item s1d: The 'one tracker only' part of the problem is only enabled by the common interface, since GitLab and Jira trackers are a stated non-goal. Open items in the plan doc (migration of existing artifacts, a 'my items' view) have no Story yet.
  - **resolved**: Reword the problem statement to narrow scope — User chose option 4 over the daemon's recommendation, to avoid amending the approved DEF. The HLD treats the goal as 'a common tracker interface with GitHub as its first adapter' (GitLab and Jira adapters are later work, but Jira must follow the GitHub pattern: daemon-created issues, Jira key written back to the artifact, git sync also runs a Jira sync). The DEF text is not edited. Migration of existing artifacts means deciding whether artifacts that have a local approval but no signoff are grandfathered in team mode or need a one-time signoff; the HLD must settle that in its Story boundaries. The 'my items' view is deferred as a non-goal of this HLD. _(2026-10-16T16:38:18.518Z)_

## Citations

- **[[c1]]** `doc` `docs/standalone/team-signoff-claim-based-workflow-E20261016be8bcc43/SPEC.md`
- **[[c2]]** `doc` `docs/plans/team-workflow.md`
- **[[c3]]** `code` `src/workflow/gates.ts`
- **[[c4]]** `code` `src/workflow/tracker-auto.ts` — "const adopted = ghFindIssueByLabels(cfg.owner, cfg.repo, [cfg.epicLabel, membership]);"
- **[[c5]]** `code` `src/config/settings-catalog.ts`
- **[[c6]]** `doc` `docs/plans/meta-workflow-framework.md` — "Tracker integration (GitHub only)"
- **[[c7]]** `doc` `docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md` — "ONE tracker tool, with one implementation per tracker type."
- **[[c8]]** `stakeholder` `User decisions made in the 2026-10-16 brainstorm session, recorded in docs/plans/team-workflow.md`
- **[[c9]]** `convention` `CLAUDE.md` — "Daemon owns all DB access"
- **[[c10]]** `code` `src/cli/config-catalog.ts` — "export { CONFIG_CATALOG } from '../config/config-catalog.js';"
- **[[c11]]** `analyze-bundle` `s1.analyzeBundles[0]`
- **[[c12]]** `analyze-bundle` `s1.analyzeBundles[1]`
