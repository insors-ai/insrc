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
- **ac5:** Given the git commands covered by Stories s4 and s8 together, when the coverage table is read, then every command of the recorded git command list is covered or excluded with a reason that a reviewer can check, and the only exclusions are those the user accepted.

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

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 36 MED · 8 LOW** · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-24T15:36:59.098Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | inventory | MED | assisted | The backend has both registry tools and direct wrappers that execute git or gh operations. | Unverifiable from the supplied results: all three greps are truncated at 50 matches and provide no current backend source reads confirming both surfaces. docs/plans/tool-registry.md:24, :60 and :65 describe runGit, commitAndPushArtifacts and github.ts wrappers; docs/standalone/five-acceptance-checks-approved-plan-issue-E2026100245106131/ISSUE.md:54–55 quote registry git operations. These are documentation matches, not verification of the actual implementations in src/daemon/tools or the direct wrappers. | Re-run probes scoped to src/daemon/tools, src/workflow/team/git.ts and src/workflow/tracker/github.ts; read the registry registrations and wrapper subprocess implementations to verify both execution surfaces. |
| 1 | semantic | MED | assisted | The daemon's agent-facing git and GitHub registry tools return loosely typed results. | Unverifiable: both grep outputs are truncated at 50 matches and include no source reads or matches from src/daemon/tools. docs/daemon.md:1360 describes optional outputSchema validation, but does not establish whether git and GitHub tools declare schemas or return loosely typed data. The artifact references to generic ToolResult likewise do not verify those tools' current implementations. | Gather scoped source evidence for the git and GitHub registry tools, their result types, output schemas, and executor handling before retaining or revising the premise. |
| 1 | closed-union | MED | assisted | Existing registry git tools cover only a subset of the git command surface. | Both grep results are truncated at 50 matches and supply no registry implementation reads from src/daemon/tools. The historical live-evidence file ollama-20261020T172812.txt:4–88 lists git tool IDs, but does not establish the current registry's complete coverage or identify an unsupported command. The premise is therefore unverifiable from the supplied evidence; no concrete build failure is established. | Gather an untruncated inventory of current registered git tools and their supported operations, then identify a git command outside that coverage to substantiate the subset claim. |
| 1 | closed-union | MED | assisted | Existing registry GitHub tools cover only a subset of the gh command surface. | The matches establish gh wrappers, including src/daemon/tools/builtins/gh/actions.ts:57 (run list), issue.ts:59 (issue list), pr.ts:73 (pr list), project.ts:63 (project list), and release.ts:38 (release list). However, both probes are truncated at 50 matches; neither supplies the complete registered-tool inventory or the full gh command surface. They therefore cannot establish that registry coverage is a strict subset. | Gather an untruncated registry inventory and a gh command inventory, then identify at least one command absent from registry coverage. |
| 1 | semantic | MED | assisted | Workflow callers currently obtain checked result types from their direct git and GitHub wrappers rather than from registry result declarations. | Unverifiable from the supplied evidence: all three searches are truncated and show documentation or recorded measurements, with no current src/workflow definitions or caller reads. docs/plans/tool-registry.md:24 and :52 describe wrapper callers, but do not establish their current result typing. docs/daemon.md:1357 documents schema-derived callTool result types, but does not show whether workflow callers use them. The evidence therefore establishes neither the claimed current typing source nor its exclusion of registry declarations. | Gather current source definitions and representative workflow caller reads for runGit, commitAndPushArtifacts and github.ts, alongside registry result declarations and their workflow usage, before retaining this premise. |
| 1 | semantic | MED | assisted | Tools currently declare whether they require approval. | UNVERIFIABLE against source: the truncated search supplies no matches or reads under src/daemon/tools. docs/daemon.md:1385 describes an approval field on tool definitions, and docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/HLD.md:34 describes requiresApproval flags, but these documentation claims do not establish the current implementation. | Gather the tool-definition type and representative builtin declarations from source to verify how tools declare approval requirements. |
| 1 | semantic | MED | manual | The executor currently executes tools requiring approval as though approval had already been granted. | Unverifiable: the supplied grep output is truncated at 50 matches and contains no executor source matches or reads under src/daemon/tools. Matches such as AGENTS.md:228 and docs/daemon.md:1345 concern workflow approval or test records, and do not establish whether the tool executor bypasses required approval. | Gather scoped matches and source reads from src/daemon/tools showing approval metadata, the executor's approval checks, and the path to tool invocation; reassess the premise against that evidence. |
| 1 | closed-union | MED | assisted | No existing shared execution point enforces tracker refresh after every backend pull or push. | Unverifiable from the supplied evidence: both git-operation and hook searches were truncated at 50 matches and provide no source reads under src/daemon/tools, src/workflow, or src/cli. docs/daemon.md:1407 describes a shared registerToolHook execution mechanism, but does not establish that tracker refresh is registered for both pull and push. The tracker refresh/sync probe returned zero matches; this does not prove absence given the documented hook mechanism and lack of source coverage. | Gather source evidence for shared tool execution, hook registrations, and backend pull/push callers before asserting that no shared execution point enforces refresh. |
| 3 | external-contract | MED | assisted | Git commands launched independently in a terminal or IDE outside the daemon do not pass through the daemon tool executor. | Unverifiable from the supplied evidence. docs/daemon.md:1409 describes executeTool's success exits, and docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/HLD.md:252 describes wrappers calling executeTool. Neither establishes how independently launched terminal or IDE Git commands execute. Both searches are truncated and supply no source reads from src/daemon/tools or src/daemon/server.ts demonstrating this boundary. | Gather source evidence establishing the executor's invocation boundary and whether external Git commands have any interception path before treating this premise as verified. |
| 3 | external-contract | MED | assisted | The editor plugin has a git runner in its own process outside this backend's migration scope. | The supplied grep /(?i)(editor\|plugin\|workbench).*git\|git.*(editor\|plugin\|workbench)/ returned 0 matches. No read lines establish an editor-plugin git runner, its process boundary, or its exclusion from migration scope; the premise is unverifiable. | Supply evidence identifying the editor plugin's git runner and process boundary, or qualify the scope exclusion as an unverified assumption. |
| 4/a1 | external-contract | MED | assisted | Atlassian acli provides the Jira issue transition, comment, assignment and project operations required by the Epic. | The supplied matches contain requirements and assumptions, not verified acli command output. docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md:82 explicitly says its command surface has not been checked; :62 and :241 require checking and recording it before Jira design. :192 scopes coverage to supported operations, and :197 requires unsupported operations to be named. HLD.md:173 lists intended families but supplies no external-contract verification. Thus the premise is unverifiable; no concrete build-breaking contradiction is established. | Record acli's actual command help and representative output for transitions, comments, assignment and projects, then reconcile the required families and unsupported operations before designing the Jira tools. |
| 4/a2 | semantic | MED | assisted | The executor has a single entry point where hooks and result validation can be added without changing agent tool invocation. | docs/daemon.md:1360 describes result validation in executeTool, and docs/daemon.md:1409 describes hooks at its two success exits. These support the proposed extension point, but both capped searches return documentation rather than source matches or reads establishing executeTool's implementation and agent invocation path. The single-entry-point and unchanged-invocation claims therefore remain unverifiable; no concrete build-breaking contradiction is shown. | Gather source reads of executeTool and its agent call sites to verify that validation and hooks can run centrally without changing invocation. |
| 4/a3 | external-contract | MED | assisted | A cheap model can convert unstructured CLI output into the declared result shape often enough to make the conversion useful. | The supplied grep for CLI/tool conversion, normalization, or structuring returned 0 matches. No supplied evidence establishes a cheap model's conversion accuracy or usefulness; the premise is unverifiable. | Validate conversion against representative CLI outputs with a defined success threshold, or explicitly treat the premise as an unvalidated assumption. |
| 4/a3 | semantic | MED | manual | Schema validation can reject structurally invalid converted output without detecting every incorrect value that satisfies the schema. | docs/daemon.md:1360 states that output-schema mismatches produce schema-mismatch failures with data dropped. This supports structural rejection. However, both grep results are truncated and provide no source reads or conversion examples establishing that semantically incorrect, schema-conforming values pass validation. The full premise is therefore unverifiable from the supplied evidence. | Supply validator/conversion source reads and an example demonstrating a schema-conforming but incorrect converted value. |
| 4/a4 | external-contract | MED | assisted | Interactive daemon use normally has an attached terminal, editor or chat client with a connection capable of carrying approval questions and answers. | AGENTS.md:131 confirms JSON-RPC over a Unix socket. README.md:221–223 describes interactive workflow approvals, and AGENTS.md:260 describes explicit in-chat approval. These establish client and approval surfaces, but the truncated matches contain no source reads from src/daemon/server.ts or src/cli establishing an attached client or a connection capable of carrying approval questions and answers. The premise is therefore unverifiable; no concrete build-breaking contradiction is established. | Validate the approval request/response transport and client attachment lifecycle, or qualify the premise as an assumption requiring capability detection. |
| 4/a4 | closed-union | MED | manual | The current daemon-client protocol has no approval question-and-answer exchange. | Unverifiable: the approval/approve/permission probe reports zero matches, but no reads of src/daemon/server.ts or src/shared/types.ts establish the protocol's complete surface. The notification/JSON-RPC probe is truncated and primarily returns documentation. S003/PLAN.md:133 describes approval.subscribe and approval.answer, while S003/CR.md:24 references src/daemon/approval-broker.ts:52; these documentation matches do not establish current implementation or reachability. | Verify the daemon's registered handlers and protocol types, including any approval subscription and answer handlers, before asserting that no approval question-and-answer exchange exists. |
| k2 | cross-artifact | MED | assisted | Constraint k2 attributes the requirement to reject schema-invalid tool results to the accuracy-first principle in CLAUDE.md. | The only supplied read of CLAUDE.md is line 1, its title; it does not establish the accuracy-first principle or k2's attribution. docs/daemon.md:1360 explicitly documents rejecting schema-invalid ToolResult.data as schema-mismatch, but does not establish the claimed attribution to CLAUDE.md. Neither k2 nor [[c2]] was supplied for comparison. | Verify k2 and [[c2]] against the relevant CLAUDE.md principle, or cite docs/daemon.md:1360 for the explicit result-validation requirement. |
| k4 | cross-artifact | MED | assisted | Constraint k4 derives exclusive daemon ownership of all state and access, including approval IPC, from CLAUDE.md. | The supplied read of CLAUDE.md:1 confirms only the document title. CLAUDE.md:131 confirms JSON-RPC over ~/.insrc/daemon.sock; CLAUDE.md:231 and :260 describe explicit-user approval through insrc_workflow_approve. These matches do not establish exclusive daemon ownership of all state and access or locate approval IPC ownership. Both grep results are truncated, and [[c2]] and the full k4 constraint were not supplied. The premise is therefore unverifiable; no concrete build-breaking contradiction is established. | Gather the relevant CLAUDE.md ownership rule, [[c2]], and approval-handler evidence; then distinguish documented DB-access ownership from any broader design constraint. |
| k5 | cross-artifact | MED | assisted | The stakeholder specification requires separate user approval for every destructive call and denial when no client is attached. | The read of docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md:1 confirms only the SPEC-0b8e02355ad3f578 artifact marker. No supplied lines establish that specification's approval requirements. Related evidence supports the policy: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md:95 requires approval for every destructive operation and denial with no client attached, and :139 requires separate approval for later calls. These do not verify the attribution to the cited stakeholder specification. | Read the cited SPEC's relevant requirement lines to verify the attribution, or reattribute the premise to the evidenced DEF requirement. |
| k7 | inventory | MED | assisted | Existing agent tool identifiers include git_pull, git:cherry-pick, gh_pr_create and gh:project:item-add. | The truncated matches show documentation and archived output only. The live-evidence/ollama-20261020T172812.txt file lists the four ids at lines 44, 76, 212 and 252, while DEF.md:97 repeats the premise. No supplied match or source read shows current tool definitions or registration, so current existence as agent tool identifiers is unverifiable. | Gather current source definitions and registration evidence for all four identifiers before treating this inventory as verified. |
| 6.4/ac4 | inventory | MED | assisted | Existing registry git tools include git_pull, git_push, git_reset and git:cherry-pick. | The truncated grep results contain documentation and recorded outputs only. S004/LLD.md:58 lists all four ids, DEF.md:161 repeats the premise, and live-evidence/ollama-20261020T172812.txt:40,44,68,76 records those ids. No supplied match shows current source definitions or registry registration, so the existing registry inventory is unverifiable from this evidence. | Gather source-scoped matches and reads showing the definitions and registration of all four tool ids. |
| 6.5/ac6 | inventory | MED | manual | Existing registry GitHub tools include gh_pr_create, gh_issue_comment, gh_release_delete and gh:project:item-add. | The truncated results show all four IDs in historical output at docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/ollama-20261020T172812.txt:172,212,252,316. docs/plans/tools.md:258 also documents gh:project:item-add. However, no supplied match or read shows current source definitions or registry registration. DEF.md:180 repeats the premise and does not independently verify it. Current registry membership is therefore unverifiable from this evidence. | Gather current source definitions and registry registration evidence for all four IDs before treating this inventory as verified. |
| 6.7/ac2 | inventory | MED | assisted | The current backend contains direct git or gh shell-outs associated with runGit, commitAndPushArtifacts and github.ts. | Unverifiable from the supplied evidence: all three grep results are truncated at 50 matches and provide no current backend source definitions or reads for the named shell-outs. docs/plans/tool-registry.md:24, :60 and :65 describe runGit, commitAndPushArtifacts and github.ts, but these are documentary claims, not verification of their current implementations. | Re-run probes scoped to production src files and read the runGit implementation, commitAndPushArtifacts implementation, and git/gh execution sites in src/workflow/tracker/github.ts. |
| 7/c3 | cross-artifact | MED | assisted | The analyze bundle at s1.analyzeBundles[1] supports the executor, approval, tool identifier and direct-call migration premises attributed to c3. | Unverifiable: the /analyzeBundles/ results are truncated and do not include the relevant c3 entry or the contents of s1.analyzeBundles[1]. docs/plans/tool-registry.md:22–24 describes mixed tool identifiers and direct-call inventories, while DEF.md:97 attributes identifier preservation to [[c3]], but neither establishes what the cited bundle contains. No supplied source reads verify its executor or approval grounding. | Retrieve the relevant c3 entry and s1.analyzeBundles[1], then verify each attributed executor, approval, identifier and migration claim against its underlying evidence. |
| 7/c4 | cross-artifact | MED | assisted | SPEC-0b8e02355ad3f578 records the user's brainstorm decisions dated 2026-10-23 that are cited as c4. | The read of docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md:1 confirms only the marker <!-- insrc:artifact SPEC-0b8e02355ad3f578 -->. It does not establish brainstorm decisions, their date, or their correspondence to c4; those claims are unverifiable from the supplied evidence. | Read the SPEC's decision content and the c4 citation mapping to verify the decisions and date before relying on this premise. |
| 6.4/dependsOn | ordering | MED | assisted | Story s4 depends on both checked results in s2 and destructive-operation approval in s3. | Unverifiable: the supplied grep output is truncated at 50 matches and contains no evidence identifying the target s4, s2, or s3. Matches such as docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/HLD.md:198 describe a different Epic's dependencies; they do not establish checked results or destructive-operation approval for this premise. | Obtain the target artifact's s2, s3, and s4 definitions and dependsOn entries, then verify that s4 requires both predecessors. |
| 6.5/dependsOn | ordering | MED | assisted | Story s5 depends on both checked results in s2 and destructive-operation approval in s3. | Unverifiable: the supplied grep results are truncated at 50 matches and contain no identified artifact for b7a68147dcf72034 or section 6.5. The s5 dependency statements shown concern other epics: docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/HLD.md:206–210 specifies s1 and s3, while docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/HLD.md:513 discusses s3. Neither establishes this premise's s2 checked-results and s3 destructive-operation approval dependencies. | Gather the target artifact's s2, s3, and s5 definitions and section 6.5 dependency edges, then verify both prerequisites before changing the premise. |
| 6.6/dependsOn | ordering | MED | manual | Story s6 depends on both checked results in s2 and destructive-operation approval in s3. | The supplied grep results are truncated at 50 matches and do not identify the relevant s6, s2, or s3 definitions or dependency edges. Matches such as design/analyze-framework.md:242 concern task-output ordering, while docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/HLD.md:198 concerns a different Story graph. None verifies that this s6 depends on checked results from s2 and destructive-operation approval from s3. The premise is unverifiable from the supplied evidence. | Gather the relevant artifact's s6 dependsOn declaration and the s2/s3 responsibilities, then verify both dependency edges and their stated purposes. |
| 6.7/dependsOn | ordering | MED | assisted | Story s7 depends on stories s1, s2, s3, s4 and s5. | Unverifiable: the supplied grep results are truncated at 50 matches and contain no dependency declaration for the target s7 or match for b7a68147dcf72034. Matches such as design/analyze-framework.md:232–242 concern task outputs, while docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/HLD.md:198–210 describe another Epic's s1–s5 dependencies. None establishes that the target s7 depends on s1, s2, s3, s4 and s5. | Obtain the target Epic's s7 declaration and authoritative dependsOn list, then compare it with the premise. |
| 8/s1c | closed-union | MED | assisted | All dependencies required to test later stories are explicitly represented by dependsOn declarations. | UNVERIFIABLE: the supplied grep is truncated at 50 matches and contains no reads of anchors 8/s1c or 6.4–6.8, nor a match identifying b7a68147dcf72034. The matches describe other artifacts: design/analyze-framework.md:232,242 concerns dependsOnOutputs; docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/S001/LLD.md:30,34 concerns valid task references and topological order. These do not establish that all testing prerequisites for the target artifact's later stories have dependsOn edges. No concrete build failure is demonstrated. | Gather the target artifact's story declarations and testing prerequisites at 6.4–6.8, then compare each prerequisite with the explicit and transitive dependsOn edges. |
| 6.8/ac5 | cross-artifact | MED | assisted | Stories s4 and s8 together are required to cover the recorded git command inventory, with exclusions limited to those accepted by the user. | The supplied grep for git coverage, inventory, or exclusions returned 0 matches. No artifact reads establish the recorded inventory, s4/s8 coverage, or user-accepted exclusions, so the premise is unverifiable. | Provide the recorded git command inventory, the s4 and s8 coverage mappings, and evidence of user-accepted exclusions for comparison. |
| 8/sb1 | cross-artifact | MED | assisted | The approved specification uses executor, registry and cheap model as product vocabulary. | The only supplied read of docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md:1 confirms the artifact marker SPEC-0b8e02355ad3f578. The truncated grep shows vocabulary in other documents (for example AGENTS.md:61 and docs/daemon.md:441), but provides no specification text establishing its vocabulary or approval status. The premise is unverifiable. | Read the specification passages containing these terms and evidence of its approval; determine whether they are product vocabulary in that context. |
| 6.1/ac2 | cross-artifact | MED | assisted | Story s1 ac2 traces preservation of tool success after a hook failure to constraint k2, which requires rejection of schema-invalid tool results. | docs/daemon.md:1360 requires schema-invalid results to become failed results with failure.kind 'schema-mismatch'; docs/daemon.md:1410 separately preserves tool success when a hook fails and reports hookFailures. Neither s1/ac2 nor constraint k2 is included in the supplied evidence, so their claimed traceability cannot be verified. No concrete build-breaking consequence is established. | Inspect s1/ac2 and k2, then correct the traceability reference or clarify that schema validation and hook-failure handling are separate requirements. |
| 6.1/ac5 | cross-artifact | MED | assisted | Story s1 ac5 traces preservation of the agent invocation and response shape to k7, which requires preservation of current tool identifiers and meanings. | docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md:97 confirms that k7 preserves existing tool ids and meanings. However, the supplied matches do not include Story s1 ac5 or its trace to k7. docs/daemon.md:1360 describes ToolResult validation, but does not establish that cross-artifact trace or preservation of the invocation and response shape. The premise is therefore unverifiable from this evidence. | Provide the text of s1/ac5 and its trace mapping, then verify whether invocation and response shape preservation is explicitly covered by k7 or requires another requirement reference. |
| 6.3/ac6 | external-contract | MED | assisted | The intended approval exchange can be supported by terminal, editor and chat clients alike. | Unverifiable: the approval/approve/notification probe returned 0 matches. AGENTS.md:131 establishes JSON-RPC over a Unix socket; README.md:72 mentions MCP clients, and README.md:77 identifies the socket as the IDE surface. These establish general connectivity, but do not establish the intended approval exchange across terminal, editor, and chat clients. The client/socket/connection results are truncated and include no approval protocol or client implementation evidence. | Ground the premise with the approval request/response contract and evidence showing how each client supports it, or qualify cross-client support as an unverified design requirement. |
| 6.7/ac3 | semantic | MED | assisted | Current workflow push, sign-off and handover stages produce artifacts, commits and tracker records whose behavior must survive migration. | The sign-off/handover probe returned 0 matches. The commitAndPushArtifacts/runGit/tracker probe was truncated at 50 matches and provides no source implementation reads establishing these stages or their outputs. AGENTS.md:23 and README.md:267 establish a workflow/tracker surface, but do not verify that push, sign-off and handover produce the claimed artifacts, commits and tracker records. The premise is therefore unverifiable; this evidence does not establish a concrete build-breaking contradiction. | Gather source-level evidence for the actual stage entry points and their artifact, commit and tracker side effects, then align the migration requirement with those verified behaviors. |
| 1 | inventory | LOW | manual | More than twenty backend call sites execute git or gh through wrappers outside the tool registry. | The first grep alone shows 27 non-test backend wrapper call sites outside src/daemon/tools: cli/services/workflow.ts:139,174; workflow/questions.ts:470; resolve-comment.ts:218; team/anchor-finder.ts:37,40; handoff.ts:288,312,422,423,624,708,732; policy-reader.ts:68,80,94,116,137,140,161,165; policy-refresh.ts:54; sighting-store.ts:78; signoff.ts:385,388,395,569. Excluding declarations, tests, documentation and plugin matches still establishes more than twenty sites, despite truncation. | none — verified sound |
| 1 | inventory | LOW | manual | The current registry contains no Jira tools. | The case-insensitive grep /jira\|acli/ returned 0 matches, supporting the absence of Jira tools. AGENTS.md:19 and design/analyze-framework.md:29 list the built-in tool categories without Jira. | none — verified sound |
| 4/a1 | external-contract | LOW | manual | Atlassian acli can be installed and authenticated on machines that will use the Jira tools. | docs/plans/tool-registry.md:32 records a probe using acli 1.3.39-stable, signed in via OAuth to insors.atlassian.net, demonstrating an installed and authenticated instance. Line 44 records the signed-out auth-status response and directs users to `acli jira auth login`, supporting the authentication path. This confirms feasibility, though not installation on every target machine. | none — verified sound |
| k1 | citation | LOW | manual | CLAUDE.md requires cloud LLM access through local CLI sessions and prohibits direct cloud REST providers and stored cloud credentials. | CLAUDE.md:12 explicitly requires locally installed claude/codex binaries via CliProvider, retains auth in CLI OAuth sessions, and prohibits direct cloud REST providers. CLAUDE.md:41 states cloud auth is delegated to the CLI OAuth session with no API keys stored on this side; :137 reiterates CLI-only cloud access and no direct REST. The Anthropic API-key matches in src/daemon/index.ts:1468–1472 do not contradict what CLAUDE.md requires. | none — verified sound |
| k3 | citation | LOW | manual | CLAUDE.md prohibits parallel calls reaching any LLM provider, including local embedding and completion calls. | CLAUDE.md:122 explicitly states: “Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits.” This directly confirms the premise, including local embedding and completion calls. | none — verified sound |
| k6 | cross-artifact | LOW | manual | The stakeholder specification requires one complete migration removing runGit, commitAndPushArtifacts and github.ts shell-outs without compatibility shims. | docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md:1 identifies SPEC-0b8e02355ad3f578. Its line 9 explicitly requires runGit, commitAndPushArtifacts and the github.ts wrappers to be cut over in one change with no shims; line 21 prohibits phased or dual-path migration and compatibility shims. This confirms the premise. | none — verified sound |
| 7/c1 | citation | LOW | manual | The referenced specification is located at docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md. | Reading docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md:1 succeeded and returned `<!-- insrc:artifact SPEC-0b8e02355ad3f578 -->`, confirming the specification exists at the cited path. | none — verified sound |
| S006:FR001 | ordering | LOW | manual | The acli command inventory and output evidence must be recorded before Jira tool families are designed. | docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md:62 explicitly requires checking and recording acli's command list and output before designing Jira tool families, with each family citing that evidence. DEF.md:241 (item a2) reiterates recording subcommands and output for transitions, comments, assignment and projects, plus missing-install versus missing-sign-in behavior, before Jira story design. These matches confirm the prescribed ordering. | none — verified sound |

#### Proposed fixes

- **1** (assisted) — The supplied documentation supports the intended inventory but cannot establish its current source-tree accuracy; no evidence-derived artifact correction is safe.
  - option: Verify both surfaces with source-scoped probes and implementation reads before retaining the premise.
  - option: Qualify the premise as a documented inventory pending current-source verification.

- **1** (assisted) — The supplied evidence does not support a mechanical correction or establish a concrete build failure.
  - option: Re-run probes scoped to src/daemon/tools and inspect git/GitHub tool definitions and returned data.
  - option: Qualify the premise as unverified pending scoped source evidence.

- **1** (assisted) — The supplied evidence cannot support a mechanical correction or verify the coverage boundary.
  - option: Retain the premise pending a current registry inventory and a verified coverage gap.
  - option: Reword the premise to state that current registry coverage has not yet been established.

- **1** (assisted) — The evidence confirms individual wrappers but cannot establish completeness or a coverage gap.
  - option: Retain the premise pending complete inventories and a verified missing command.
  - option: Narrow the premise to the observed issue, PR, project, Actions, and release wrappers, without claiming incomplete coverage.

- **1** (assisted) — The supplied documentation cannot establish current caller typing; no evidence-derived mechanical correction is safe.
  - option: Re-run probes scoped to src/workflow and src/daemon/tools, including wrapper return signatures and caller imports, then reassess the premise.
  - option: Mark the current typing source as unverified until source reads establish whether callers derive results from wrappers or registry declarations.

- **1** (assisted) — The evidence supports documentation claims but provides no source grounding for the anchored premise; no mechanical correction is justified.
  - option: Verify the premise using source reads of the tool-definition type and builtin approval declarations.
  - option: Qualify the premise as a documented claim pending source verification.

- **1** (manual) — The supplied evidence neither confirms nor contradicts the executor behavior, so no evidence-derived artifact correction is safe.
  - option: Re-probe src/daemon/tools for approval flags and read the executor branches that consume them.
  - option: Defer the behavioral claim until evidence traces an approval-required tool through its execution path.

- **1** (assisted) — The supplied documentation identifies a shared hook mechanism, but the evidence cannot establish whether tracker refresh is wired into it.
  - option: Inspect the shared hook execution and registrations, then retain or correct the premise based on source evidence.
  - option: Reword the premise to state that enforcement of tracker refresh after every backend pull or push remains unverified.

- **3** (assisted) — The evidence neither confirms nor contradicts the claimed external execution boundary; no mechanical correction is supported.
  - option: Retain the premise as an explicit assumption pending targeted source evidence.
  - option: Provide executor and IPC dispatch source reads plus evidence addressing external Git interception, then reassess.

- **3** (assisted) — The empty evidence neither confirms nor contradicts the external contract, so no evidence-derived factual replacement is safe.
  - option: Provide source evidence for the editor plugin's git runner, process boundary, and migration exclusion.
  - option: Reword the premise as an unverified assumption pending external-contract verification.

- **4/a1** (assisted) — The evidence supports treating capability coverage as an unchecked assumption, but does not establish which operations acli actually supports.
  - option: Reword the premise as an unchecked assumption gated on recording acli command help and output before Jira design.
  - option: Supply captured acli capability evidence for each required family, then retain or narrow the premise accordingly.

- **4/a2** (assisted) — The supplied documentation supports the concept but does not establish the source-level routing claim.
  - option: Verify the premise with source reads of the executor and agent dispatch call sites.
  - option: Qualify the premise as documented architecture pending source verification.

- **4/a3** (assisted) — An empty search result neither confirms nor contradicts the claimed model capability. Establishing usefulness requires empirical evidence and an agreed success criterion.
  - option: Run a representative conversion evaluation and define the minimum acceptable success rate.
  - option: Reword the premise as an unvalidated assumption pending evaluation.

- **4/a3** (manual) — The evidence supports structural validation but does not establish the claimed semantic limitation for converted output.
  - option: Provide source reads and a test showing that an incorrect converted value satisfying the schema passes validation.
  - option: Narrow the premise to the documented rejection of output-schema mismatches.

- **4/a4** (assisted) — The evidence supports existing approval surfaces but does not establish the claimed runtime connection capability or normal attachment.
  - option: Retain the premise pending source evidence of client attachment and bidirectional approval transport.
  - option: Reword it as an assumption and require runtime detection of an approval-capable client before requesting approval.

- **4/a4** (manual) — The supplied evidence does not establish either the absence or implementation of this exchange, so no evidence-derived replacement is safe.
  - option: Gather source reads covering protocol types, handler registration, and approval exchange implementation, then reassess the premise.
  - option: Qualify the premise as unverified pending inspection of the current daemon-client protocol.

- **k2** (assisted) — The requirement has supporting evidence, but its claimed cross-artifact attribution is unverifiable and the artifact text needed for an exact edit is absent.
  - option: Supply the relevant CLAUDE.md passage and k2/[[c2]] text to verify the attribution.
  - option: Reword k2 to cite docs/daemon.md:1360 for the explicit rejection behavior, treating accuracy-first as rationale only.

- **k4** (assisted) — The evidence supports the socket transport and explicit approval discipline, but does not support a mechanical correction to the broader ownership claim.
  - option: Supply the exact ownership rule and approval IPC implementation evidence to substantiate k4.
  - option: Narrow k4 to the ownership scope actually documented, and identify broader state and approval ownership as a separate design decision.

- **k5** (assisted) — The policy is supported by the DEF, but the cited SPEC's substantive content was not supplied.
  - option: Retain the premise after obtaining SPEC lines confirming both requirements.
  - option: Reattribute the premise to DEF.md:95 and :139, which explicitly support both requirements.

- **k7** (assisted) — Historical output supports prior mentions, but does not establish the current registered inventory.
  - option: Verify all four ids against current tool definitions and registry wiring.
  - option: Qualify the premise as identifiers recorded in historical tool output until current registration is verified.

- **6.4/ac4** (assisted) — The evidence neither verifies current registration nor establishes a safe inventory correction.
  - option: Verify all four ids against current tool definitions and registry registration, then retain the premise if confirmed.
  - option: Qualify the inventory as documented but unverified until source evidence is available.

- **6.5/ac6** (manual) — The supplied documentation and historical output do not establish current registry membership or support a safe inventory correction.
  - option: Provide current source definitions and registration evidence for all four IDs.
  - option: Reconcile the inventory with the current registry after obtaining source evidence.

- **6.7/ac2** (assisted) — The supplied documentary matches neither confirm nor contradict the current-source inventory; no evidence-derived artifact correction is safe.
  - option: Gather production-source matches and implementation reads to verify the premise.
  - option: Mark this inventory as unverified pending source-scoped probes.

- **7/c3** (assisted) — The supplied evidence cannot establish the cross-artifact attribution or support an exact replacement.
  - option: Supply the cited bundle and c3 entry to verify the attribution.
  - option: Replace the bundle attribution with specific verified source references after gathering the missing evidence.

- **7/c4** (assisted) — The artifact identity is verified, but the substantive cross-artifact claim lacks supporting evidence.
  - option: Gather the SPEC decision passages and c4 mapping, then retain the premise if confirmed.
  - option: Narrow the premise to the verified artifact identity and leave the decisions, date, and c4 correspondence unverified.

- **6.4/dependsOn** (assisted) — The supplied evidence neither confirms nor contradicts the target dependency, so no evidence-derived text correction is safe.
  - option: Provide targeted reads of the target artifact's s2, s3, and s4 definitions and dependency entries.
  - option: Re-run the probe scoped to the target artifact to avoid unrelated matches and truncation.

- **6.5/dependsOn** (assisted) — The evidence does not identify the target Story graph, so no evidence-derived text replacement is safe.
  - option: Provide targeted reads of section 6.5 and the target artifact's s2, s3, and s5 definitions.
  - option: Re-run a narrowly scoped dependency probe against the target artifact to avoid unrelated, truncated matches.

- **6.6/dependsOn** (manual) — The evidence provides no relevant dependency declaration from which to derive a safe artifact correction.
  - option: Provide the relevant s6 dependency declaration together with s2 and s3 definitions for verification.
  - option: Reassess the ordering premise after obtaining targeted evidence from the intended artifact.

- **6.7/dependsOn** (assisted) — The evidence supplies no verified replacement dependency list, so no safe artifact edit can be derived.
  - option: Read the target Epic's s7 record and verify its explicit dependsOn list.
  - option: Run a narrowly scoped probe against the target artifact to avoid truncation and retrieve its dependency declarations.

- **8/s1c** (assisted) — The evidence does not identify the target dependency graph, so neither a missing edge nor an exact artifact correction can be safely derived.
  - option: Re-run scoped probes and anchor reads against the target artifact to verify dependency completeness.
  - option: Qualify the completeness claim as unverified pending an audit of later-story testing prerequisites.

- **6.8/ac5** (assisted) — The evidence neither confirms nor contradicts the cross-artifact requirement and supports no mechanical correction.
  - option: Supply the inventory, story coverage table, and accepted exclusions, then re-evaluate the premise.
  - option: Mark the coverage requirement as unverified pending supporting artifact evidence.

- **8/sb1** (assisted) — The supplied evidence identifies the specification but does not establish the claimed vocabulary or approval.
  - option: Provide specification passages and approval evidence to verify the premise.
  - option: Reword the premise to describe vocabulary only after checking the specification's actual text.

- **6.1/ac2** (assisted) — The evidence supports both behaviors separately but does not establish the artifact references or a replacement constraint identifier.
  - option: Provide the actual s1/ac2 and k2 text to verify the traceability.
  - option: Trace hook-failure success preservation to an independently verified hook-handling requirement.
  - option: Clarify the two distinct requirements without claiming that schema rejection implies hook-failure success preservation.

- **6.1/ac5** (assisted) — The evidence confirms k7's wording but does not supply the acceptance criterion needed to verify or mechanically correct the trace.
  - option: Supply s1/ac5 and its trace mapping to verify the existing reference.
  - option: If shape preservation exceeds k7's scope, explicitly document that requirement and update the trace after review.

- **6.3/ac6** (assisted) — General transport support does not verify approval semantics; the supplied evidence supports neither a concrete failure nor a mechanical correction.
  - option: Retain the premise after supplying approval contract and implementation evidence for all three client types.
  - option: Reword cross-client approval support as a design requirement pending verification.

- **6.7/ac3** (assisted) — The supplied evidence cannot establish the claimed stages or safely support an exact replacement premise.
  - option: Retain the premise pending targeted source probes and reads establishing each stage and output.
  - option: Reword the premise around verified workflow/tracker behavior after identifying its actual producers and migration acceptance checks.
