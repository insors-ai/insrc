<!-- insrc:artifact DEF-b7a68147dcf72034 -->

# Epic: one-tool-registry-git-gh-jira

## Summary

**Flavor:** enhancement

Every git, GitHub and Jira operation goes through one tool layer that agents, the daemon and the workflow all use, so a rule such as refreshing tracker status after a pull or push is written once and applies everywhere. The layer covers the full set of operations the underlying tools offer, adds Jira, gives callers checked result types, and asks the user before any destructive step, which today runs unasked.

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

Git, GitHub and Jira are reached in two unrelated ways. The daemon offers agents a registry of git and GitHub tools that returns loosely typed results, while the workflow library, the daemon and the terminal client's approval service run git and GitHub commands themselves through their own wrappers, in more than twenty places. Because the same operation can be run by either path, there is no single point where behaviour that must follow every pull, push or issue change can live, so the rule that tracker status should be refreshed after a pull or push cannot be enforced, and each new rule has to be added twice or missed. The registry covers only part of what the underlying tools can do, has no Jira support at all, gives workflow code no checked result types, and leaves the safety of destructive operations to each tool's own approval flag, which the executor currently honours by running the tool as if it were approved, so no destructive step asks anyone.

## 2. Functional requirements

- **E20261023b7a68147:FR001** — Agents, the daemon and the workflow library perform git, GitHub and Jira operations only through the tool registry. _(One path means one place for rules that must follow every operation.)_
- **E20261023b7a68147:FR002** — The registry offers a named, typed tool for each operation family of git, gh and Jira, covering every operation the underlying tool supports. _(Hooks and approval key on a tool name.)_
- **E20261023b7a68147:FR003** — A rule registered once on the executor runs after the matching tool succeeds for every caller, and a failure in that rule is reported with the tool result without failing the call. _(The tracker refresh must follow every pull and push.)_
- **E20261023b7a68147:FR004** — Every tool declares the shape of its result, the executor checks each result against it, and workflow code receives results typed from that declaration. _(Workflow code relies on typed values today.)_
- **E20261023b7a68147:FR005** — Where a tool's CLI gives no structured output, a cheap model converts the response to the declared shape, and a response that does not match is a tool failure. _(Accuracy first: the check is the safety net.)_
- **E20261023b7a68147:FR006** — Jira operations are available as agent-facing tools that run through Atlassian's acli. _(Jira is a tracker the product must support.)_
- **E20261023b7a68147:FR007** — A destructive operation asks the attached client for approval each time and is denied if nobody answers in time. _(Agents and workflows now share the tools, so the safety rule has to be uniform; today the executor approves them without asking.)_
- **E20261023b7a68147:FR008** — The old direct shell-outs in the workflow library, the daemon and the terminal client's approval service are removed once their callers use the registry. _(A leftover path could bypass the rules.)_

**s1:**

- **E20261023b7a68147:S001:FR001** — Rules are registered against a tool name in one place and cannot be attached by individual callers.
- **E20261023b7a68147:S001:FR002** — A rule's failure is reported with the tool result and never changes whether the tool is counted as succeeded.

**s2:**

- **E20261023b7a68147:S002:FR001** — A tool without a declared result shape cannot be registered.
- **E20261023b7a68147:S002:FR002** — A model conversion that fails the check is reported as the tool's failure, with the original output available for diagnosis.

**s3:**

- **E20261023b7a68147:S003:FR001** — The approval request names the tool, the repository and the arguments it would run with.
- **E20261023b7a68147:S003:FR002** — The exchange between the daemon and an attached client for asking and answering an approval is built as part of this Story.

**s4:**

- **E20261023b7a68147:S004:FR001** — The coverage of the git family is recorded as a list of operation families against tool names that a reviewer can check.

**s5:**

- **E20261023b7a68147:S005:FR001** — The coverage of the gh family is recorded as a list of operation families against tool names that a reviewer can check.

**s6:**

- **E20261023b7a68147:S006:FR001** — Before the Jira tool families are designed, acli's own command list and output are checked and recorded, and each family cites it.
- **E20261023b7a68147:S006:FR002** — The Jira tools expose issue transitions, so a project that signs off through a workflow transition can be driven.

**s7:**

- **E20261023b7a68147:S007:FR001** — The list of replaced call sites is recorded and each one is covered by a test that runs through the registry.

## 3. Non-goals

- **A second typed library beside the tool registry** — The registry is meant to be the only layer, so one set of rules applies to every caller.
- **A hook mechanism outside the tool executor** — Hooks must fire for every caller and cannot be left to workflow code or to individual wrappers.
- **A tool per CLI subcommand, or a raw passthrough tool** — Hooks and approval key on a named tool, so a mutating operation must not hide behind a generic argument.
- **Direct Jira REST calls, stored Jira tokens, or Jira CLIs other than Atlassian's acli** — Authentication stays with the user's local CLI session and the daemon holds no cloud credentials.
- **A phased migration or compatibility shims for the old shell-outs** — A leftover path could bypass the hooks and the approval rule.
- **A blanket allow-all for destructive operations, or approving them when no client answers** — Every destructive call is approved by the user each time, and with nobody to ask it is denied.
- **Capturing git run in a terminal or IDE outside the daemon** — No hook can see commands the daemon does not run.
- **The git runner inside the editor plugin's own process** — It runs outside the daemon and the backend, so the daemon's registry cannot carry it; the migration covers the backend only.

## 4. Assumptions

- `low` Atlassian's acli can be installed and signed in on the machines that use the Jira tools, and it exposes the operations the tools need, including issue transitions, comments, assignment and projects; its command surface has not been checked yet. [[c4]]
- `med` The tool executor can host a hook stage and a result-shape check inside its single entry point without changing the way agents call a tool; this is a design assertion to be confirmed when the stories are designed. [[c3]]
- `low` A cheap model can convert the text output of a CLI into a declared shape often enough to be useful, and the shape check rejects output that is structurally wrong; the check does not catch values that fit the shape but are wrong, so the value checks are a design question. [[c4]]
- `med` During interactive use at least one client (the terminal client, the editor or a chat) is attached to the daemon and can be asked a question over its connection; no such question-and-answer exchange exists yet and the Epic builds it. [[c3]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | Cloud access goes through the user's locally installed CLI sessions; no direct cloud REST calls and no stored credentials in the daemon. | [[c2]] |
| `k2` | invariant | Accuracy is the first principle: a tool result that does not match its declared schema is a failure and is never passed on. | [[c2]] |
| `k3` | convention | Nothing that reaches an LLM provider runs in parallel; model calls, including the cheap-model conversion, run one after another. | [[c2]] |
| `k4` | convention | The daemon owns all state and access; clients reach it only through IPC, including approval requests. | [[c2]] |
| `k5` | stakeholder | Every destructive operation is approved by the user each time; there is no global opt-in, and with no client attached the call is denied. | [[c4]] |
| `k6` | stakeholder | The cutover is complete in one change: the old runGit, commitAndPushArtifacts and github.ts shell-outs are removed with no shims. | [[c4]] |
| `k7` | invariant | Every tool id that agents use today keeps working, including the mixed naming such as git_pull, git:cherry-pick, gh_pr_create and gh:project:item-add, with the same meaning. | [[c3]] |

## 6. Stories

### 6.1 STORY-b7a68147dcf72034-s1 — Run a rule once after a tool succeeds, for every caller

**User value:** `size: M`

A rule that must follow an operation, such as refreshing tracker status after a push, is written once and applies whoever ran the tool.

**Acceptance criteria:**

- **ac1:** Given a rule is registered for a named tool, when that tool succeeds for any caller (an agent, the daemon or the workflow), then the rule runs once after the tool result is known. _(operationalizes `k4`)_
- **ac2:** Given a rule fails after its tool succeeded, when the caller receives the result, then the tool result is returned as a success together with a clear report of the rule's failure. _(operationalizes `k2`)_
- **ac3:** Given a tool fails or is denied, when the executor finishes the call, then no rule registered for that tool runs.
- **ac4:** Given several rules are registered for one tool, when the tool succeeds, then they run one after another in registration order and one failing rule does not stop the next.
- **ac5:** Given an agent calls a tool the way it does today, when the rule stage is added to the executor, then the agent's way of calling the tool and the shape of what it gets back are unchanged apart from the report of a failed rule. _(operationalizes `k7`)_

### 6.2 STORY-b7a68147dcf72034-s2 — Give every tool a checked, typed result

**User value:** `size: L`

Callers get results they can trust and use without parsing text, and a result that is wrong is never passed on.

**Acceptance criteria:**

- **ac1:** Given a tool declares the shape of its result, when the tool returns, then the result is checked against that shape before any caller or rule sees it. _(operationalizes `k2`)_
- **ac2:** Given a result does not match its declared shape, when the check runs, then the call fails with a message naming the mismatch and the unmatched result is not passed on. _(operationalizes `k2`)_
- **ac3:** Given a tool's underlying CLI gives structured output, when the tool builds its result, then the structured output is read directly and no model is used.
- **ac4:** Given a tool's underlying CLI gives only text, when the tool builds its result, then a cheap model converts the text to the declared shape, the conversions run one after another, and the check in ac1 decides whether the conversion is accepted. _(operationalizes `k2`, `k3`)_
- **ac5:** Given workflow code calls a tool through the executor, when the call returns, then the code receives a result whose type follows from the tool's declared shape without a cast.
- **ac6:** Given a model conversion produced output that fits the declared shape, when a value in it can be checked against the raw CLI text, then the key values are cross-checked against that text and a mismatch fails the call. _(operationalizes `k2`)_

### 6.3 STORY-b7a68147dcf72034-s3 — Ask the user before any destructive operation, every time

**User value:** `size: L`

No tool run by an agent or workflow can destroy work without the user saying yes to that exact call, which no tool asks today.

**Acceptance criteria:**

- **ac1:** Given a tool is marked destructive, when any caller invokes it, then the executor sends an approval request describing the exact call to the attached client and waits for an answer. _(operationalizes `k4`, `k5`)_
- **ac2:** Given the user approves one destructive call, when the same or another destructive call is made later, then that later call asks for its own approval. _(operationalizes `k5`)_
- **ac3:** Given no client answers within the timeout, or none is attached, when the request expires, then the call is denied and the caller is told it was denied for lack of an answer. _(operationalizes `k5`)_
- **ac4:** Given the user declines, when the answer arrives, then the call is denied and nothing is changed. _(operationalizes `k5`)_
- **ac5:** Given any setting, argument or caller identity, when a destructive call is made, then none of them can skip the approval. _(operationalizes `k5`)_
- **ac6:** Given a tool that today declares it needs approval and is run as if approved, when the change is complete, then it asks for approval before it runs, in the terminal client, the editor and a chat alike. _(operationalizes `k5`)_
- **ac7:** Given a client attaches to the daemon, when an approval request is raised, then the client can show the exact call and send back an answer over its connection. _(operationalizes `k4`)_

### 6.4 STORY-b7a68147dcf72034-s4 — Cover every git operation with a named, typed tool

**User value:** `size: L`

Anything git can do is available through the registry, and each mutating operation is a distinct tool the rules can see.

**Depends on:** `s2`, `s3`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given an operation that git supports, when the registry's git tools are listed, then the operation is reachable through a named tool for its family, with no raw passthrough.
- **ac2:** Given a git tool is invoked, when it returns, then its result follows the declared shape from the checked-result story. _(operationalizes `k2`)_
- **ac3:** Given a git operation can destroy work (force push, hard reset, clean, deleting a branch or tag), when the registry is read, then that operation is marked destructive so the approval story applies. _(operationalizes `k5`)_
- **ac4:** Given the git tools that exist today, including git_pull, git_push, git_reset and git:cherry-pick, when the family is complete, then each keeps its current id and meaning, so agents using it keep working. _(operationalizes `k7`)_

### 6.5 STORY-b7a68147dcf72034-s5 — Cover every GitHub CLI operation with a named, typed tool

**User value:** `size: L`

Anything gh can do is available through the registry with the same rules as git, so issues, pull requests, releases and the rest are handled uniformly.

**Depends on:** `s2`, `s3`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given an operation that gh supports, when the registry's gh tools are listed, then the operation is reachable through a named tool for its family, with no raw passthrough.
- **ac2:** Given a gh tool is invoked, when it returns, then its result follows the declared shape from the checked-result story. _(operationalizes `k2`)_
- **ac3:** Given a gh operation can destroy work (closing or deleting an issue, deleting a release or branch, merging a pull request), when the registry is read, then that operation is marked destructive so the approval story applies. _(operationalizes `k5`)_
- **ac4:** Given gh is missing or not signed in, when a gh tool is invoked, then the call fails with a message saying which, using the user's own gh session. _(operationalizes `k1`)_
- **ac5:** Given a gh command does not finish, when its time limit passes, then the call ends with a message saying it timed out.
- **ac6:** Given the gh tools that exist today, including gh_pr_create, gh_issue_comment, gh_release_delete and gh:project:item-add, when the family is complete, then each keeps its current id and meaning, so agents using it keep working. _(operationalizes `k7`)_

### 6.6 STORY-b7a68147dcf72034-s6 — Offer Jira operations as tools through Atlassian's acli

**User value:** `size: L`

Agents and workflows can read and change Jira issues, move them through their workflow and comment on them, on the user's own Jira session.

**Depends on:** `s2`, `s3`

**Acceptance criteria:**

- **ac1:** Given an operation that acli supports on Jira issues, projects, transitions, comments and assignment, when the registry's Jira tools are listed, then the operation is reachable through a named tool for its family.
- **ac2:** Given acli is not installed or not signed in, when a Jira tool is invoked, then the call fails with a message saying which and no credentials are asked for or stored by the daemon. _(operationalizes `k1`)_
- **ac3:** Given a Jira tool is invoked, when it returns, then its result follows the declared shape from the checked-result story. _(operationalizes `k2`)_
- **ac4:** Given a Jira operation can destroy work (deleting an issue, comment or project), when the registry is read, then that operation is marked destructive so the approval story applies. _(operationalizes `k5`)_
- **ac5:** Given the user has a CLI other than acli for Jira, when a Jira tool is invoked, then it does not use that CLI.
- **ac6:** Given an operation that acli does not offer, when the registry's Jira tools are listed, then it is absent and is named as unsupported instead of being approximated.

### 6.7 STORY-b7a68147dcf72034-s7 — Move every direct git and gh call onto the registry and remove the old paths

**User value:** `size: XL`

The workflow, the daemon and the terminal client's approval service follow the same rules as agents, and no backend code path can run git or gh around them.

**Depends on:** `s1`, `s2`, `s3`, `s4`, `s5`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given each place in the workflow library, the daemon and the terminal client's approval service that runs git or gh itself today, when the change is complete, then it performs the operation by calling a registry tool through the executor. _(operationalizes `k6`)_
- **ac2:** Given the old runGit, commitAndPushArtifacts and github.ts shell-outs, when the change is complete, then they no longer exist and a check fails the build if a new direct git or gh call appears in the backend outside the registry. _(operationalizes `k6`)_
- **ac3:** Given a workflow stage that pushes, signs off or hands over, when it runs after the change, then it produces the same artifacts, commits and tracker records as before.
- **ac4:** Given a rule registered on a tool, when a workflow call to that tool succeeds, then the rule runs as it does for an agent call. _(operationalizes `k4`)_
- **ac5:** Given a workflow call to a destructive tool with no client attached, when the approval request expires, then the workflow stage fails with the denial reported and does not continue. _(operationalizes `k5`)_
- **ac6:** Given the list of call sites taken from a complete search of the backend source, when the change is complete, then every site on the list has moved, and the list is kept with the change so none is missed. _(operationalizes `k6`)_

### 6.8 STORY-b7a68147dcf72034-s8 — Reach the rest of git through named, typed tools

**User value:**

Every git command a person or a program can run unattended is reachable through the registry with a declared result shape and the right approval class, so nothing falls back to a raw shell.

**Acceptance criteria:**

- **ac1:** Given a git command that can run without a person, a GUI, a mail server or a server role, when the registry's git tools are listed, then the command is reachable through a named tool with an operation-selecting input, and a case in the coverage table runs it through the executor against a temporary repository and checks its result and effect.
- **ac2:** Given a git command that reads from standard input (apply, am, mktree, mktag, fast-import and similar), when its tool is called with the content as an input, then the content reaches the command without a raw shell, and a failure to deliver it is reported as the tool's failure.
- **ac3:** Given a tool of this family is called, when it returns, then its result follows the declared shape, and a result that does not fit, or whose output was cut, is a failure.
- **ac4:** Given an operation of this family can destroy work or overwrite a file (clean, restore of the worktree, rm with force, prune, deleting a ref, removing notes, overwriting an archive or patch), when the registry is read, then that operation is marked destructive so the approval story applies.
- **ac5:** Given the git commands covered by Stories s4 and s4b together, when the coverage table is read, then every command of the recorded git command list is covered or excluded with a reason that a reviewer can check, and the only exclusions are those the user accepted.

### 6.9 STORY-b7a68147dcf72034-s9 — Move the workflow library's and the daemon's direct git and gh calls onto the registry

**User value:**

The build runners, the gates, the team policy code, the identity lookup and the design corpus reader follow the same approval, hook and result-check rules as agents, and no site in them can run git or gh around the registry.

**Acceptance criteria:**

- **ac1:** Given each place in the workflow library, the daemon, the analyze path, the understanding identity lookup and the design corpus reader that runs git or gh itself today, or calls a git or gh tool's execute directly, and is listed in the Story's replacement table, when the change is complete, then it performs the operation by calling a registry tool through callTool and the executor, with the caller, the abort signal and the approval mode set by the site.
- **ac2:** Given a workflow stage that builds, gates, converts, hands over or signs off through a moved site, when it runs after the change, then it produces the same artifacts, commits and records as before.
- **ac3:** Given the team policy refresh and its total deadline of 10 seconds, when the deadline passes or the refresh's signal is aborted, then the refresh stops at its first aborted call, starts no call after it, and the lock-lifetime reasoning that depends on the 10 second deadline still holds.
- **ac4:** Given the identity lookup and the design corpus reader, when they run through the registry, then their multi-host and multi-account semantics, their public options, their validation results and their error codes are unchanged, except the recorded identity behaviour on gh versions without `gh auth status --json`.
- **ac5:** Given a moved site whose call needs approval under the effective approval mode and finds no client, or whose approval expires, when the call is denied, then the calling stage fails with the denial reported and does not continue.
- **ac6:** Given the list of sites taken from a complete search of the source, including direct calls of a tool's execute, when the change is complete, then every site has an entry in the replacement table, a test that runs through the registry with a recorded executor, and an entry in the migration record.

### 6.10 STORY-b7a68147dcf72034-s10 — Move the tracker and the terminal client onto the registry and remove the old paths

**User value:**

Every tracker, commit-and-push and terminal-client git or gh call follows the registry's approval, hook and result-check rules, and the old wrappers and seams are gone so no code can run git or gh around the registry.

**Acceptance criteria:**

- **ac1:** Given each caller of the functions in src/workflow/tracker/github.ts (questions, resolve-comment, bugfix/tracker, config/github, tracker-auto, github-adapter, setup, sync) and each of the five callers of commitAndPushArtifacts, when the change is complete, then it performs the operation by calling a registry tool through callTool and the executor, using the replacement table that maps every github.ts wrapper to a registry tool, and commit-and-push becomes a sequence of git tool calls that returns the same result and the same reasons as before.
- **ac2:** Given the terminal client's workflow service in src/cli/services/workflow.ts, when it runs git or gh, then it does so through the daemon's tools.call request with the caller set, and no longer spawns git or gh itself.
- **ac3:** Given a tracker push, sync, setup, question or comment-resolution run, when it runs after the change, then it creates and updates the same issues, sub-issues, milestones, comments and labels as before and records the same results.
- **ac4:** Given a moved call that needs approval under the effective approval mode and finds no client, or whose approval expires, when the call is denied, then the calling stage fails with the denial reported and does not continue.
- **ac5:** Given the old paths runGit, runGitAsync, runGh, commitAndPushArtifacts, the other github.ts wrappers, createGitRunner and the _setTrackerExecForTests seam, when the change is complete, then they no longer exist, the forbidden-spawn scan runs in failing mode in the build chain and finds nothing outside the exemptions (the daemon self-update and src/indexer/index.ts), and the 25 test files that used the seams run through the recorded executor.
- **ac6:** Given the migration record and the origin/main session source inventory baseline, when the change is complete, then both are regenerated, every site has an entry, and the full sweep passes with no new skipped tests.

## 7. References

- **[[c1]]** `doc` `docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md`
- **[[c2]]** `convention` `CLAUDE.md`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[1]`
- **[[c4]]** `stakeholder` `The user's decisions in the brainstorm of 2026-10-23, recorded in SPEC-0b8e02355ad3f578`

## 8. Open questions

- Item a2: the acli command surface is unchecked; before the Jira stories are designed, install acli and record its subcommands and output for transitions, comments, assignment and projects, and how a missing install differs from a missing sign-in.
- Item a2: the cheap-model conversion is only checked for structure by the shape check; the design stage must decide which values are cross-checked against the raw CLI text, whether a deterministic parser or a higher-tier model is used when retries run out, and how the conversion is tested on representative CLI outputs.
- Item s1c: the later stories depend on earlier ones, so they are testable only once their dependencies exist; the dependencies are explicit in dependsOn.
- Item sb1: the criteria use the terms executor, registry and cheap model, the product's own vocabulary from the approved spec; a reviewer may want them kept as is.
