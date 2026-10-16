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

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 12 MED · 8 LOW** · model `cli-claude:opus` · reviewed 2026-10-16T14:46:50.819Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| Assumptions/c4 | inventory | MED | assisted | The current tracker flow creates issues for three kinds: Epics, Stories and (optionally) Tasks. | The evidence partly supports the premise. grep /ghCreateIssueTyped\\(/ finds exactly three call sites in the anchor file: src/workflow/tracker-auto.ts:137 (`epicRef = ghCreateIssueTyped(cfg.owner, cfg.repo, title,`), :205 (`created = ghCreateIssueTyped(cfg.owner, cfg.repo, title,`) and :302 (`issue = ghCreateIssueTyped(`). The fourth match is the definition at src/workflow/tracker/github.ts:151. Three creation sites fit a count of three kinds, and the `epicRef` binding at :137 confirms one of them is the Epic. The read lines do not show which kinds the sites at :205 and :302 create; nothing ties them to Stories and Tasks. Nothing shows that Task issues are optional either: no flag or guard was returned. grep /createTaskIssues\|taskIssues/ returned 0 matches, so no named Task-issue path was found. The count is consistent with the code, but 'Stories' at :205, 'Tasks' at :302 and 'optionally' cannot be verified from this evidence. | Read the code around src/workflow/tracker-auto.ts:205 and :302 to confirm that they create the Story and Task issues. Also find the condition that makes Task issue creation optional, such as a config flag or guard before :302. Then cite those lines in Assumptions/c4. If :302 turns out not to be a Task issue, or Task creation is not optional, correct the premise. |
| Assumptions/c10 | semantic | MED | assisted | The terminal client reads the shared settings catalog through its command bar but has no per-repo tracker settings screen; its Setup screen covers only system and model setup. | Part of the premise is confirmed. `read src/cli/config-catalog.ts:14` shows `export { CONFIG_CATALOG } from '../config/config-catalog.js';`, so the terminal client does re-export the shared catalog. README.md:209 describes the Setup pane as "hardware detection + model recommendation; `a` apply config · `p` …", which fits the claim that Setup covers only system and model setup. The rest of the premise has no support in the evidence. Nothing shows the command bar reading CONFIG_CATALOG; the only evidence is the re-export, not a consumer under src/cli/panes. The claim that no per-repo tracker settings screen exists is a negative claim. The grep for /tracker/ was cut off at 50 matches, all in AGENTS.md, CLAUDE.md, README.md, design/ and docs/epics/, with no hit under src/cli/panes. The grep for /SetupPane\|Setup/ was also cut off, mostly at camon/ and docs/epics/ matches, and never reaches src/cli/panes. Because both searches stopped early, they cannot show that src/cli/panes has no tracker screen. The anchor `src/cli/panes` was never read. | Confirm the premise against src/cli/panes directly. List the pane files and grep them for `tracker` and for `CONFIG_CATALOG` or `config-catalog` consumers, so the search is not cut off by docs matches. Record where the command bar reads the catalog with a file:line citation. If a tracker or per-repo settings pane exists, or the Setup pane writes tracker config, rewrite the assumption and any scope that depends on the terminal client having no tracker settings screen. |
| c5/k6 | citation | MED | assisted | src/config/settings-catalog.ts is the daemon's shared settings catalog from which VS Code, JetBrains and the terminal client present settings from one definition. | The file exists. The read of src/config/settings-catalog.ts:1 returned FOUND, and line 7 describes it as "The self-describing settings-catalog payload (Story S001 / sc1)". The daemon uses it: src/daemon/index.ts:113 imports `buildSettingsCatalog` from '../config/settings-catalog.js', and src/config/__tests__/settings-catalog.test.ts:23 tests it.  Two clients are supported by the evidence. For JetBrains, plans/reviews/design-intelligence-di1-original-approved-hld.json:72 says SettingsView.kt `groupsOf` iterates `catalog.groups`, which comes from this payload. For VS Code, the work-framed DEF.md:149 says config.catalog is "the existing IPC the VS Code surface reuses".  Two parts of the premise are not supported: - **The terminal client.** No match shows the terminal client reading this payload. - **Where the definition lives.** Several matches put the single static definition in `CONFIG_CATALOG` in src/config/config-catalog.ts. For example, HLD.md:50 says it "derives groups from first-seen CONFIG_CATALOG order", and S004/LLD.md:254 says `values` is "populated only for the static CONFIG_CATALOG paths". settings-catalog.ts builds the wire payload (options/groups/roles/tierNames/values) from that definition rather than holding it.  So the anchor points at the right concept, but the premise overstates its role and claims a terminal consumer that the evidence does not show. Nothing gets built differently because of this, since clients still read the catalog over config.catalog, so it does not reach HIGH. | Change the premise to say that src/config/settings-catalog.ts builds the config.catalog payload (`buildSettingsCatalog` → SettingsCatalogPayload) from the static `CONFIG_CATALOG` definition in src/config/config-catalog.ts. Cite both files. Name the terminal client as a consumer only if it can be shown to call config.catalog, for example a grep for config.catalog under src/cli; otherwise drop it from the premise. |
| c7 | cross-artifact | MED | assisted | docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md contains 'ONE tracker tool, with one implementation per tracker type.'; that LLD has passed daemon review, carries no approval stamp, and is not built. | The quoted part of the premise holds. A read of docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md:134 returns "ONE tracker tool, with one implementation per tracker type. The tool is a normal insrc MCP tool, insrc_tracker, registered in src/mcp/server.ts…". The grep for that sentence matches only this LLD line and the DEF's own citation at docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md:254.  The rest of the premise has no support in the evidence. It claims the LLD "has passed daemon review, carries no approval stamp, and is not built". The `approvedAt` grep stopped at its 50-match cap, and none of the matches it returned come from this LLD's .json or .md. No evidence reads the LLD's meta.review, meta.approvedAt or a BUILD.md for this work item. The evidence does show that a companion LLD (tracker-epics…E202610069a7bbe63/S001/LLD.md) depends on insrc_tracker, but that says nothing about this LLD's lifecycle state. So the quote is verified, and the review, approval and build status cannot be verified from this evidence. | Ground the status claim directly. Read docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.json and check three things: meta.review is present, its reviewer is the daemon and its verdict is not 'block'; meta.approvedAt is absent; and no S001/BUILD.md or BUILD.json exists. Then add those reads as anchors to c7. Until that is done, the DEF should not rely on the LLD being reviewed but unapproved and unbuilt. If the check shows otherwise, change the wording: for example, an approved LLD makes insrc_tracker a committed design, and a built one makes it existing code. |
| c2/c8 | cross-artifact | MED | assisted | docs/plans/team-workflow.md exists and records the user decisions of the 2026-10-16 brainstorm session that constraints k1, k2, k5, k8 cite. | The file exists. `read docs/plans/team-workflow.md:1` returned FOUND with the heading "# Plan: Team-compatible workflow". All four grep matches for /team-workflow/ are references to the file from the artifacts themselves: DEF.md:249 (citation c2), DEF.md:255 (citation c8, "User decisions made in the 2026-10-16 brainstorm session, recorded in docs/plans/team-workflow.md"), and SPEC.md:13 and SPEC.md:31. None of the matches comes from inside team-workflow.md, and the only line read is its heading. Nothing in the evidence shows that the file records decisions from a 2026-10-16 brainstorm session, or that it holds the content that constraints k1, k2, k5 and k8 rely on. The first half of the premise (the file exists) is confirmed. The second half (what the file records) cannot be verified from this evidence. It is not contradicted, so this is not HIGH. | Re-probe docs/plans/team-workflow.md for its decision content. Read past line 1 and grep it for "decision", "2026-10-16", and the specific choices behind k1, k2, k5 and k8. Confirm the file actually records each decision those constraints cite. If any decision is missing, either add it to the plan doc or change constraint c8 to cite the brainstorm SpecArtifact (docs/standalone/team-signoff-claim-based-workflow-E20261016be8bcc43/SPEC.md) instead. |
| Problem/s1 | semantic | MED | assisted | Tracker support today is GitHub-only (gh CLI), with no common tracker interface declaring capabilities. | The GitHub-only half is supported. Every tracker consumer in the evidence imports the GitHub module `tracker/github.js` directly: src/workflow/tracker-auto.ts:43, src/workflow/bugfix/tracker.ts:49, src/workflow/questions.ts:59 (commitAndPushArtifacts, ghComment), src/workflow/resolve-comment.ts:39, src/workflow/config/github.ts:43 (gitOriginOwnerRepo, parseGithubRemoteUrl), src/cli/services/workflow.ts:55, and three tests (bugfix-tracker, tracker-auto, tracker-tasks via _setTrackerExecForTests / TrackerExec). No match imports any tracker abstraction module. That other half (no common tracker interface declaring capabilities) cannot be confirmed from this evidence. The /capabilit/ grep hit its 50-match cap. Its results are sorted by path and stop inside docs/epics/build-deployment-design-..., so they never reach src/. The visible matches are all prose in AGENTS.md, CLAUDE.md, README.md, design/ and docs/, plus the LLM-provider field `provider.capabilities.structuredOutput` in some LLDs. None of them is a tracker interface. Even so, a tracker capability declaration somewhere under src/ is not ruled out. The `TrackerExec` type in github.ts only injects the exec function for tests. It is not a provider interface. | Re-run the absence probe limited to src/, so docs no longer use up the match cap. For example, grep /interface\\s+\\w*Tracker\|TrackerProvider\|TrackerCapabilit\|capabilities/ over src/workflow/ and src/workflow/tracker/. Confirm that nothing apart from github.ts implements or declares a tracker contract. If the probe finds nothing, the premise holds as written. If it finds an existing interface, change the Problem statement to "extend the existing interface" instead of "introduce one". |
| Problem/FR008 | semantic | MED | assisted | Unfinished stage state lives in the local daemon and an opaque state token, so it cannot be resumed on another machine. | The evidence supports what the premise says. Its anchor (src/mcp) is stale.  Supporting: The state token is a short reference into a store on one machine, not a self-contained payload: - mcp.txt:27 shows "encodeState mints a short URL-safe base64 token (22 chars, no padding)". A token that short cannot carry the folded payload, so it can only point to an entry held elsewhere. - S001/LLD.md:39 says the token is "realized as a private state-store record, never persisted to LMDB/Lance/DuckDB". - frame-epic S005/LLD.md:35 says "The token was minted by a prior encodeState/saveState on this server instance and has not expired (TTL) or been released." - S005/LLD.md:31 and :55 say an unknown token raises StateTokenNotFound, with the messages "server restarted / TTL expired / already completed". - mcp.txt:32 shows "releaseState drops the entry so a subsequent decodeState fails".  Together these confirm that unfinished stage state lives only in the local daemon's own store, behind an opaque token. Another machine's daemon cannot resolve that token.  Stale anchor: Every match in live source is under src/daemon/steps/*. Examples: src/daemon/steps/workflow-step/types.ts:37/44/50, src/daemon/steps/analyze-step/types.ts:35, and src/daemon/steps/workflow-step/phases/synthesize.ts:139 (inputStateToken). The src/mcp/workflow-step/state.ts path appears only in older LLD/PLAN docs (S005/LLD.md:55, PLAN.md:18). The gathered evidence has no source match under src/mcp. The anchor is out of date but still points at the right concept. | Keep the premise. Re-anchor it from src/mcp to the live state-token code under src/daemon/steps: the per-step types.ts files and the step state module or state store, wherever encodeState/decodeState/saveState now live. Then the probe can resolve against current source and not against old design docs. |
| Stories | inventory | MED | assisted | The Epic has 8 Stories (s1–s8), 13 Epic-level FRs, 8 constraints (k1–k8) and 38 acceptance criteria (ac1–ac38). | Only part of the premise is confirmed. The Story count holds: grep /### 6\\.\\d E20261016315d510c:S00\\d/ returns exactly 8 headings in docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md, from line 120 (6.1 S001 "Rely on a tracker only for what it can really do") to line 232 (6.8 S008 "Revise a signoff request after reviewers ask for changes"). That matches "8 Stories (s1–s8)".  The other three counts are not addressed by the evidence. The acceptance-criteria grep /\\*\\*ac\\d+:\\*\\*/ ran across the whole repo and was cut off at 50 matches. Every match shown comes from other Epics (add-bugfix-triage-category…, add-build-workflow-insrc-5th-stage…, add-daemon-driven-code-review-stage…), and none comes from the team-signoff DEF.md, so "38 acceptance criteria (ac1–ac38)" cannot be confirmed. No probe counted the Epic-level FRs ("13") or the constraints k1–k8 ("8"). Those inventory counts are therefore unverifiable. Even if one is miscounted, it changes no Story boundary or task that would be built, so this is MED, not HIGH. | Re-run the count probes limited to docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md: - `rg -c '\\*\\*ac\\d+:\\*\\*'` for acceptance criteria. Note that ac numbering restarts in each Story, so the total is the sum of the per-Story counts. Check whether "ac1–ac38" means a global numbering or a sum of per-Story numbering. - the FR heading/bullet pattern, for the 13 Epic-level FRs. - `rg '\\*\\*k\\d+'`, for the 8 constraints. Then correct whichever count differs. The Story count (8, s1–s8) is verified and needs no change. |
| Stories | ordering | MED | manual | Story dependencies: s3 on s2; s4 on s1,s2; s5 on s1,s2,s4; s6 on s5; s7 on s1,s2,s5; s8 on s7 — acyclic. | The grep for /\\*\\*Depends on:\\*\\*/ returned 50 matches and was TRUNCATED at the cap. None of the returned matches can be identified as this artifact's Stories section. The DEF dependency blocks shown come from other epics, and none of them match the stated graph. add-bugfix-triage DEF.md:57/70/90/104 give s1, s1, s2+s3, s2+s3. add-build-workflow DEF.md:71/92/115/129 give s1, s2, s3, s3+s4. add-daemon-driven-code-review DEF.md:79–195 give s1×4, s2–s5, s6, s6. add-module-test-health DEF.md:59–119 give s1, s2, s3, s2, s2+s3+s5. add-plan-workflow DEF.md:62–104 give s1×3, s1+s3. build-deployment-design DEF.md:58/74 give s1, s2, and the list is cut off there. No match shows "s3 on s2; s4 on s1,s2; s5 on s1,s2,s4; s6 on s5; s7 on s1,s2,s5; s8 on s7", and no 8-story DEF appears. The evidence neither confirms nor contradicts the claimed edges. The acyclicity claim is consistent as stated, since every edge points to a lower-numbered story. Even so, the edges themselves are not grounded. | Re-run the probe scoped to this artifact's own DEF.md, the epic dir that holds stories s1–s8, so the 50-match cap does not cut off its "**Depends on:**" lines. Then check the eight stories' Depends-on lines against the stated graph: s1 and s2 have no deps, s3→s2, s4→s1,s2, s5→s1,s2,s4, s6→s5, s7→s1,s2,s5, s8→s7. If they match, downgrade to LOW. Acyclicity holds on its face, because every edge points to a lower-numbered story. |
| Assumptions/a2 | external-contract | MED | manual | Jira has an approval concept that can stand in for a signoff request (low confidence, unverified). | No probes were run for this premise, so there are no ripgrep matches and no path:line reads. The premise concerns an external system (Jira), and the artifact itself marks it "low confidence, unverified". Nothing in the gathered evidence confirms or contradicts that Jira has an approval concept that could map to a signoff request. | Before any task builds a Jira signoff path, check this premise against Jira's own documentation. Find out whether Jira Service Management's approval steps or a workflow transition or status can stand in for a signoff request, and whether Jira Software (without Service Management) has any approval primitive at all. Then either cite the specific Jira feature and the API that drives it, or re-scope signoff for Jira to a fallback such as a comment, label or status transition. Record that fallback as a design decision. |
| S005/S007 | external-contract | MED | assisted | The tracker (GitHub) exposes issue assignee and pull-request/review completion readable on demand via the gh CLI, sufficient for claims and signoff without polling or webhooks. | Assignee: the evidence supports this half. Existing passing tests show that assignee data is read through gh on demand: `workflow.txt:1588 ok 1588 - queryTasks: owner → assignee:, epic/story → label qualifiers` and `workflow.txt:1592 ok 1592 - listMyOpenTasks: resolves the current login → assignee:<me> is:open` (make-insrc-analysis S007 measurements/after). The build-handler LLD:70 projects `assignees: string[]` from the GitHub issue shape. docs/plans/tools.md:227,229 list `gh:issue:create` / `gh:issue:edit` with assignees, so assignees can be written, which claim and release (ac19, ac22) need. The DEF itself only states the premise (DEF.md:33, :65, :99) and does not prove it.  Pull-request and review completion: no evidence. The grep pattern (`gh issue\|'issue', 'edit'\|assignee`) did not cover `gh pr`, `reviewDecision`, `reviews` or merge state. None of the 50 matches, which were cut off at the cap, shows a gh wrapper, tool or test that reads whether a PR or review is complete. The other part, "without polling or webhooks", is a design stance (DEF.md:99 "insrc only needs to know whether a request completed"). No probe addresses it. Half the premise, the half that signoff (S007) depends on, cannot be verified from what was gathered. | Ground the PR and review half before S007 builds on it. Re-run the probe with a pattern that covers `gh pr view\|gh pr list\|reviewDecision\|statusCheckRollup\|mergedAt\|gh:pr:` across src/workflow/tracker and docs/plans/tools.md. Then confirm one of two things: either a gh wrapper or built-in tool already reads a PR's review decision and merge state, or S007 must add one, for example `gh pr view <N> --json reviewDecision,state,mergedAt,reviews`. Record the result as a cited premise in the S007 LLD. The S005 assignee half can stay as written: the evidence supports it (queryTasks / listMyOpenTasks assignee: qualifiers, gh:issue:edit with assignees). |
| s4/ac17 | semantic | MED | assisted | The task-issue creation is controlled today by a local setting (Task issues optional), which team mode must override. | The only probe was a grep for /createTaskIssues\|taskIssues\|tasksAsIssues/. It returned 0 matches, and no `path:line` reads were gathered from src/workflow/tracker-auto.ts or anywhere else. The evidence therefore shows no local setting that controls task-issue creation under those names. It also doesn't show any other control, such as a 'Task issues optional' toggle, a config key or a flag. So the premise that task-issue creation is controlled today by a local setting that team mode must override can't be verified. The probe may also have missed the setting because it has a name the pattern doesn't cover. | Re-ground ac17 against src/workflow/tracker-auto.ts and the tracker config. Find the actual identifier (config key, field or function) that decides whether task issues are created, cite it as `file:line` in the premise, and probe again with that identifier. If no such local setting exists, reword ac17. Team mode would then need to introduce the control rather than override an existing one, which changes what s4 builds. |
| c4 | citation | LOW | manual | src/workflow/tracker-auto.ts looks up an existing Epic issue by label before creating it, via `const adopted = ghFindIssueByLabels(cfg.owner, cfg.repo, [cfg.epicLabel, membership]);`. | The grep for the exact cited text found it in source at src/workflow/tracker-auto.ts:123: `const adopted = ghFindIssueByLabels(cfg.owner, cfg.repo, [cfg.epicLabel, membership]);`. A direct read of src/workflow/tracker-auto.ts:123 also returned FOUND with the same line. The only other match is the DEF's own citation entry (DEF.md:251). The file, the symbol `ghFindIssueByLabels` and the label-based lookup on `[cfg.epicLabel, membership]` all resolve as the citation says. The evidence does not show the create path that follows. Still, a variable named `adopted` that is assigned from a find-by-labels lookup fits the premise's description of finding an existing Epic issue to adopt. | none — verified sound |
| Assumptions/c4 | closed-union | LOW | manual | In tracker-auto.ts the label lookup before create (ghFindIssueByLabels) is used only for the Epic issue; Story and Task issues are created via ghCreateIssueTyped without any prior lookup, so idempotent creation for them is new work. | grep /ghFindIssueByLabels\\(/ finds one call site in tracker-auto.ts, `src/workflow/tracker-auto.ts:123` (`const adopted = ghFindIssueByLabels(cfg.owner, cfg.repo, [cfg.epicLabel, membership]);`). Its label set uses `cfg.epicLabel`, so it looks up the Epic issue. Its only other matches are the definition at `src/workflow/tracker/github.ts:215` and the DEF's own citation. grep /ghCreateIssueTyped\\(/ finds three create sites in tracker-auto.ts: `:137` (`epicRef = ghCreateIssueTyped(...)`, the Epic create, right after the line-123 lookup), `:205` (`created = ghCreateIssueTyped(...)`) and `:302` (`issue = ghCreateIssueTyped(`). Neither the line-205 nor the line-302 create has a ghFindIssueByLabels call before it. This supports the claim that the label lookup is used only for the Epic, and that Story and Task issues are created without it. One caveat: the evidence does not include the code around lines 205 and 302. Some other guard there, such as a stored-ref check, is not ruled out, but there is no label-based lookup. | none — verified sound |
| c10 | citation | LOW | manual | src/cli/config-catalog.ts re-exports the shared catalog: `export { CONFIG_CATALOG } from '../config/config-catalog.js';`. | Read of src/cli/config-catalog.ts:14 returns exactly the line "export { CONFIG_CATALOG } from '../config/config-catalog.js';". The grep also found this line in that file, alongside the DEF citation itself (DEF.md:257) and the earlier PLAN.md:51, which planned this re-export when CONFIG_CATALOG moved to src/config/config-catalog.ts. The premise matches the source word for word. | none — verified sound |
| c3/k3 | citation | LOW | manual | src/workflow/gates.ts is where the meaning of the other-party model review (meta.review) and local approval (approvedAt) is enforced. | The evidence backs both halves of the premise. For meta.review, `src/workflow/gates.ts:40` imports `effectiveReviewVerdict` from './review/resolve.js', and `src/workflow/gates.ts:603` uses it to enforce the review: `if (review !== undefined && effectiveReviewVerdict(review, artifact.meta.reviewResolutions) === 'block') {`. For approvedAt, the gates.ts grep hits are cut off by the cap, but several artifacts point at the same place. docs/epics/add-daemon-driven-code-review-stage-E20260803761a43a6/HLD.md:353 cites gates.ts `approveArtifactByJsonPath(jsonPath, {overrideReview}) (488) which, before stamping approvedAt, filters review.findings for unresolved HIGH/MED and refuses unless overrideRe…`. S007/LLD.md:169 and :211 say gates.ts holds ReviewBlockedError:71, approveArtifactByJsonPath:488 (which enforces meta.review) and approveWorkflowTarget:586 (which routes a block into skipped[]). add-plan-workflow S003/LLD.md:80 says plan approval "sets meta.approvedAt … reused verbatim from gates.ts". delivery/gate.ts:119 also calls gates.ts "The approval gate". So gates.ts is the module that enforces the review block before approval and stamps approvedAt. | none — verified sound |
| c6 | citation | LOW | manual | docs/plans/meta-workflow-framework.md has a section titled 'Tracker integration (GitHub only)'. | Verified: grep found `docs/plans/meta-workflow-framework.md:532: ### 7.4 Tracker integration (GitHub only)`, and the read of line 532 confirms that heading (FOUND). The only other match is the DEF's own citation line, docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md:253. The section exists under the title the premise cites. It is numbered §7.4, but the premise does not mention a section number. | none — verified sound |
| c9/k7 | citation | LOW | manual | CLAUDE.md states 'Daemon owns all DB access'. | The read of CLAUDE.md:135 returned "1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only." The grep /Daemon owns all DB access/ also matched CLAUDE.md:135 with the same text, and AGENTS.md:135 holds the same line. The quoted phrase appears word for word in the cited anchor, CLAUDE.md, so the citation resolves exactly. | none — verified sound |
| c1 | cross-artifact | LOW | manual | The seeding SPEC exists at docs/standalone/team-signoff-claim-based-workflow-E20261016be8bcc43/SPEC.md (SPEC-be8bcc435fe0cf93). | read docs/standalone/team-signoff-claim-based-workflow-E20261016be8bcc43/SPEC.md:1 → FOUND: `<!-- insrc:artifact SPEC-be8bcc435fe0cf93 -->`. The file is at the cited path and carries the cited artifact id. A grep for SPEC-be8bcc435fe0cf93 also hits docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md:8 (`**Seeded from:** `SPEC-be8bcc435fe0cf93``), so the DEF cites this SPEC as its seed. | none — verified sound |
| Problem | semantic | LOW | manual | Settings today are per machine; there is no repo-committed team policy file read by the daemon. | The premise says no repo-committed team policy file exists yet. The evidence agrees. `grep /policy\\.(json\|ya?ml)/` found only 2 matches, and both are in design docs, not source code. `docs/plans/team-workflow.md:88` proposes a future `.insrc/policy.json` read from the remote default branch. The other is the team-signoff SPEC.md:9. Neither match is under `src/config` or anywhere else in `src/`. `grep /teamMode\|team-policy/` found 0 matches, so no code yet reads a team-mode or team-policy setting. The 'per machine' part of the premise is not directly shown by these probes. They do not contradict it, and the doc at team-workflow.md:88 describes the current settings as per-repo entries in `~/.insrc/github.json` plus per-user items in the user config, which is per-machine storage under the home directory. | none — verified sound |

#### Proposed fixes

- **Assumptions/c4** (assisted) — The count of three creation sites matches the code, and the Epic site is confirmed. The kinds behind :205 and :302, and whether Tasks are optional, were not shown in the evidence, so a person must confirm before the anchors are made more specific. No auto-edit is safe because the evidence does not establish the kinds.
  - option: Keep the premise and add anchors: src/workflow/tracker-auto.ts:137 (Epic), :205 (Story), :302 (Task), after confirming each by reading the code around it.
  - option: Reword it to say what the evidence supports: 'The current tracker flow creates issues at three ghCreateIssueTyped call sites in tracker-auto.ts (Epic at :137, plus two more at :205 and :302).'
  - option: If reading the code shows Task issues are not optional, drop '(optionally)' from the premise.

- **Assumptions/c10** (assisted) — The re-export at src/cli/config-catalog.ts:14 and the Setup pane scope in README.md:209 are confirmed. The command-bar consumer and the absence of a tracker screen were not checked because both greps were cut off before reaching src/cli/panes. The wording can't be corrected automatically without inventing facts, so a person needs to check the panes and pick an option.
  - option: Keep the premise as written after a scoped grep of src/cli/panes finds no tracker pane and confirms a command-bar consumer of CONFIG_CATALOG, and add the file:line citations.
  - option: Reword it to cover only what the evidence shows: 'The terminal client re-exports the shared settings catalog (src/cli/config-catalog.ts:14); its Setup screen covers hardware detection and model recommendation (README.md:209).' Then add the tracker-screen claim back only once it is checked.
  - option: If a scoped check finds a tracker or per-repo settings surface in src/cli/panes, revise the assumption and the scope that depends on it.

- **c5/k6** (assisted) — The anchor is right, but the premise gives settings-catalog.ts the single definition, which actually lives in CONFIG_CATALOG (config-catalog.ts). It also names a terminal consumer the evidence does not show. Choosing the new wording, and whether to keep the terminal client, needs a human decision.
  - option: Reword: 'src/config/settings-catalog.ts (buildSettingsCatalog) builds the config.catalog payload from CONFIG_CATALOG in src/config/config-catalog.ts; VS Code and JetBrains render settings from that payload.' Then add config-catalog.ts as an anchor.
  - option: Keep the current wording, but first confirm with a grep that the terminal client (src/cli) calls config.catalog, and cite that call.
  - option: Remove the terminal client from the premise, and keep settings-catalog.ts as the payload builder with config-catalog.ts as the definition.

- **c7** (assisted) — The quote is verified at LLD.md:134. The review, approval and build status cannot be verified because no read of the LLD's meta or BUILD record was gathered. That status has to be confirmed before the wording is fixed or reworded, and nothing in the evidence supports an automatic edit.
  - option: Keep c7 as written and add anchors on LLD.json (meta.review, meta.approvedAt) and on the absence of S001/BUILD.md that confirm the status.
  - option: Narrow c7 to the verified quote only, removing the review, approval and build status, and record the status in a separate premise backed by its own evidence.
  - option: If the LLD.json read shows it is approved or built, reword c7 to match, and recheck any DEF reasoning that treats insrc_tracker as not built yet.

- **c2/c8** (assisted) — The file is confirmed to exist, but the evidence does not show that it contains the 2026-10-16 decisions. Someone needs to read the file and decide whether citation c8 points to the right source. Making a text edit without that check would mean inventing grounding.
  - option: Keep c8 as written once a fuller read of docs/plans/team-workflow.md confirms it records the decisions that k1, k2, k5 and k8 cite.
  - option: Re-point c8 to the approved brainstorm SpecArtifact (docs/standalone/team-signoff-claim-based-workflow-E20261016be8bcc43/SPEC.md), which also says the decisions are pinned, and keep c2 as the plan-doc citation.
  - option: Add the missing decisions to docs/plans/team-workflow.md under a dated 2026-10-16 decisions section, then keep c8 unchanged.

- **Problem/s1** (assisted) — The GitHub-only claim is supported by the imports. The no-common-interface claim is unverified only because the capability grep hit its cap before reaching src/. If a scoped re-probe confirms the absence, the planned change stays the same. Only a human-run probe can settle it, so no auto-edit is safe.
  - option: Keep the premise as written once a src/-scoped probe confirms there is no tracker interface or capability declaration
  - option: Narrow the premise to what the evidence shows: 'All tracker callers (tracker-auto.ts, bugfix/tracker.ts, questions.ts, resolve-comment.ts, config/github.ts, cli/services/workflow.ts) import tracker/github.js directly; no tracker abstraction is imported anywhere'
  - option: If the probe finds an existing tracker contract, re-scope s1 to extend that contract instead of introducing a new one

- **Problem/FR008** (assisted) — The premise is correct according to the evidence: short opaque token, a private store on this server instance that is never persisted, and not-found after a restart or TTL. Only the anchor directory is stale, because the live matches are under src/daemon/steps and not src/mcp. The anchors field may not appear verbatim in the artifact markdown, so no safe find/replace can be derived.
  - option: Change the anchor from src/mcp to src/daemon/steps.
  - option: Anchor to the specific state module that defines encodeState/decodeState/saveState under src/daemon/steps, once its path is confirmed.
  - option: Leave the anchor as it is and record that the state-token code moved from src/mcp to src/daemon/steps.

- **Stories** (assisted) — The Story count is confirmed by the evidence. The FR, constraint and acceptance-criteria counts could not be checked because the ac grep ran across the repo, was truncated, and returned no match from this DEF, and no FR or constraint probe ran. No edit can be derived from the evidence. A person needs to re-run the probes limited to this DEF and confirm or correct the numbers.
  - option: Re-run the ac, FR and k count probes on the team-signoff DEF.md only, and replace any count that differs with the measured value
  - option: Restate the premise as an inventory of Stories only (8, s1–s8), the part the evidence supports, and drop the unverified counts
  - option: Keep the counts but label the ac total as the sum of per-Story criteria (each Story numbers from ac1), if that is how the DEF is structured

- **Stories** (manual) — The evidence is truncated and does not reach this artifact's Stories, so no evidence-backed edit is possible. A narrower re-probe is needed before anything can change.
  - option: Re-probe with the grep scoped to this epic's DEF.md and re-judge
  - option: Keep the premise as-is, since the stated graph is internally acyclic (every edge points to a lower-numbered story), and accept it as unverified
  - option: Cite each story's Depends-on file:line in the premise so later probes can ground it

- **Assumptions/a2** (manual) — The premise is about how an external product behaves and has no grounding in the repo. Resolving it is a design decision about how signoff maps onto Jira, not a mechanical text fix, so no artifact edits are proposed.
  - option: Verify against Atlassian docs that Jira Service Management approvals (or a workflow approval step) exist, then cite the feature and its REST endpoint in the assumption.
  - option: Map signoff to a generic Jira workflow transition or status (for example 'Awaiting Signoff' → 'Signed Off') that works on any Jira project, and state this as the contract.
  - option: Mark Jira signoff as unsupported or degraded (a comment plus a label only) and keep it out of the story's scope until it is verified.

- **S005/S007** (assisted) — The assignee half (S005) is backed by existing tracker code and passing tests. The PR and review completion half (S007) has no gathered evidence because the probe pattern never searched for gh pr or review reads. The premise needs either a citation added or a scope note. Choosing between those is a human decision, not a mechanical text fix.
  - option: Split the premise. Keep the S005 assignee claim, citing queryTasks and listMyOpenTasks (assignee: qualifiers) and gh:issue:edit. Add a separate S007 premise that cites an existing gh PR read wrapper, once a re-probe finds one.
  - option: If no PR or review read exists, reword the S007 part as new work: S007 adds a gh wrapper (`gh pr view --json reviewDecision,state,mergedAt`) through the injectable _exec, read on demand at each stage turn.
  - option: Re-run the probe with a pr/reviewDecision pattern before deciding, and keep the premise unverified until then.

- **s4/ac17** (assisted) — The evidence has no matches and no reads, so no value from it can go into an auto-edit. The premise has to be re-grounded, or reworded once the author confirms whether the setting exists.
  - option: Find the real setting in tracker-auto.ts / tracker config (e.g. grep for 'task' + 'issue' near the config reader), cite it as file:line in ac17, and keep the 'team mode overrides it' wording.
  - option: If no local setting exists, reword ac17 so that team mode introduces task-issue creation control (a new setting and its default) instead of overriding one.
  - option: If task issues are always or never created with no setting at all, re-scope ac17 to describe that hard-coded behaviour and what team mode changes.
