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

**0 HIGH · 11 MED · 7 LOW** · model `cli-claude:opus` · reviewed 2026-10-23T08:45:55.619Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| p1 | semantic | MED | assisted | The tool executor auto-approves tools that declare requiresApproval (true or a predicate), logging a warning and running the tool without asking anyone. | src/daemon/tools/executor.ts:44 logs `log.warn({ id: tool.id }, 'tool requires approval but the gate dispatcher is gone; auto-approving')`, so the executor does warn and auto-approve tools that need a gate. The read of executor.ts:41 is cut off at `const needsGate = tool.requiresApproval === true`. It does not show whether a predicate-form `requiresApproval` (docs/plans/tools.md:57 `boolean \| ((input: unknown) => boolean)`) is evaluated and counted toward `needsGate`. It also does not show whether line 44 runs on every call or only on a branch where the dispatcher is missing. The evidence supports the auto-approve-with-warning behaviour for `requiresApproval: true`. The 'or a predicate' part and the 'always, without asking anyone' part are not confirmed. | Read src/daemon/tools/executor.ts:38-50 to confirm two things: that the full `needsGate` expression evaluates predicate-form requiresApproval, and that the auto-approve branch runs every time and is not a fallback. Then reword the premise to cite executor.ts:41-44 and to state the condition it runs under ('the gate dispatcher is gone'). |
| p2 | semantic | MED | assisted | The executor has a single entry point executeTool(toolId, input, deps) that every registry tool call passes through, so a hook stage and result-shape check can be hosted there. | The entry point exists: `src/daemon/tools/executor.ts:23: export async function executeTool(` (grep for /export async function executeTool/ found 1 match, and the read of line 23 found it). A grep for /executeTool\\(/ found only one call site in source: `src/agent/read-only-tool-loop.ts:78`, which calls `executeTool(name, input as never, deps)`. That line also accepts an injectable `args.execute` override, so this caller can be routed around executeTool. The third match is a measurement JSON under docs/, which is not code. Nothing gathered covers the rest of the claim: no search was run for other ways a registry tool can be called, such as code that calls a tool's handler directly, IPC tool handlers in daemon/index.ts, MCP paths or workflow steps. So 'every registry tool call passes through' is neither confirmed nor contradicted. The evidence confirms the function and its (name, input, deps) signature. It does not show that the function is the only route. | Before hosting the hook stage and the result-shape check in executeTool, check that no path invokes a registry tool without going through it. Search for direct handler calls (e.g. `.handler(`, `.execute(`, `registry.get(`) under src/daemon, src/mcp and src/workflow. Also note that read-only-tool-loop.ts:78 accepts an injectable `args.execute` that skips executeTool. Either make that override go through the hook stage too, or say in the artifact that it is exempt (for example, test-only). If any direct paths exist, route them through executeTool or reword the premise to list them. |
| p5 | citation | MED | assisted | commitAndPushArtifacts is a direct git shell-out defined in src/workflow/tracker/github.ts, which itself contains gh shell-outs. | The location is confirmed: grep /export function commitAndPushArtifacts/ finds the source definition at src/workflow/tracker/github.ts:120, and the read of that line returns `export function commitAndPushArtifacts(repoPath: string, paths: readonly string[], message: string): CommitArtifactsResult {`. The evidence does not show the function body, so nothing here proves it shells out to git directly. The /['"]gh['"]/ grep stopped at its 50-match cap before it reached any source line in github.ts, so the file's gh shell-outs are only backed by committed documents, not by source lines: docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S001/T010-REGRESSION.md:16 says every out(/silent( call with a 'gh' or 'git' command in non-test src is in src/workflow/tracker/github.ts, and S009/LLD.md:406 cites `silent('gh', ['auth','status'])` at github.ts:168-175. The premise is very likely true, but this evidence does not verify its main point (commitAndPushArtifacts is a direct git shell-out). | Re-probe the function body, for example by reading src/workflow/tracker/github.ts:120-160 or grepping /silent\\('git'\|out\\('git'/ in github.ts only, to confirm that commitAndPushArtifacts runs git through out/silent (the legacy exec). Re-run the gh grep with the path limited to github.ts so source lines, not docs, ground the gh shell-out claim. If the body turns out to call a wrapper rather than git itself, reword the premise to match. |
| p6 | semantic | MED | assisted | The terminal client's approval service runs git or gh itself rather than through the registry. | No source line from src/cli/services/workflow.ts is in the evidence. The grep hit its 50-match cap on docs and measurement files and never reached that file. The premise is supported only second-hand, by committed review documents. docs/epics/one-tool-registry-git-gh-jira-E2026102372024208/DEF.md:229 says a grep found production callers of `commitAndPushArtifacts(` at src/cli/services/workflow.ts:139 (`const result = commitAndPushArtifacts(rep…`). DEF.md:254 adds that removing commitAndPushArtifacts would make tsc fail at src/cli/services/workflow.ts:139 and :174. docs/epics/one-common-model-every-artifact-E202610192f27754d/S006/CR.md:34 says approve() at src/cli/services/workflow.ts:147 runs commitApprovedArtifacts and attachApprovedDocuments, and that the second of these calls commitAndPushArtifacts. Separately, DEF.md:231 and S001/T010-REGRESSION.md:20 put commitAndPushArtifacts at src/workflow/tracker/github.ts:120 and describe it as a git commit and push through the out/silent shell-out runners. Taken together, the documents suggest the CLI approval service reaches git through the workflow library's commitAndPushArtifacts wrapper rather than through the registry. That is a path outside the registry, but the service does not call git itself. Neither the call site nor any gh use in workflow.ts is confirmed by a source read. | Re-probe the anchor directly, for example with grep /commitAndPushArtifacts\|openTracker\|attachApprovedDocument/ restricted to src/cli/services/workflow.ts, plus reads of lines 139, 147 and 174. That confirms the call sites. Then reword the premise: the service runs git (and possibly gh, through attachApprovedDocuments/openTracker) by way of the workflow library's direct shell-out wrappers, not the registry. Keep src/cli/services/workflow.ts in the cutover scope so that removing commitAndPushArtifacts does not break tsc. |
| p8 | semantic | MED | assisted | Registry tools return loosely typed results (ToolResult with output text/format/success) and declare no result schema. | The anchor exists. grep /interface ToolResult/ matches src/daemon/tools/types.ts:33 `export interface ToolResult {` (there is a second ToolResult at src/shared/types.ts:46, and docs/plans/tools.md:78 describes it). The 'declares no result schema' half is supported: none of the 34 /output(Schema\|Shape)\|resultSchema/ matches is under src/daemon/tools. They are in the analyze planner templates (src/analyze/planner/templates/*), src/shared/analyze-types.ts:123, src/shared/understanding.ts:60 and docs. The evidence does not include the body of ToolResult, so the claimed fields (output text / format / success) and the 'loosely typed' description cannot be checked. Two interfaces share the name (src/daemon/tools/types.ts:33 and src/shared/types.ts:46), so it is also unclear which one registry tools actually return. | Read src/daemon/tools/types.ts:33 onward and confirm that ToolResult has the stated fields (output text, format, success) with no typed payload. Also say which ToolResult the registry executor returns, src/daemon/tools/types.ts or src/shared/types.ts:46. The 'no result schema in the tool registry' part needs no change. |
| s4/ac3 | semantic | MED | assisted | Destructive git operations (hard reset, force push) are already marked as needing approval in their tool definitions. | The cited anchors resolve to approval-style titles, not to an approval flag. At src/daemon/tools/builtins/git/reset.ts:67 the line is `title: mode === 'hard' ? 'git:reset --hard (DESTRUCTIVE)' : 'git_reset'`, which marks a hard reset as DESTRUCTIVE in what looks like an approval descriptor. At src/daemon/tools/builtins/git/push.ts:71 the line is `title: protectedRef && (force \|\| forceRaw) ? 'git:push (PROTECTED REF)' : 'git_push'`, so the special title applies only to a force push to a protected ref, not to every force push. The /requiresApproval/ grep stopped at its 50-match cap and shows only the cloud/aws and cloud/az tools, so the evidence never shows a `requiresApproval` declaration in git/reset.ts or git/push.ts. The premise is therefore only partly supported. A hard reset appears to be singled out. A force push is singled out only for protected refs, and the evidence cannot confirm that either tool actually requires approval. | Read the requiresApproval field or predicate in git/reset.ts and git/push.ts to confirm that both tools declare approval, and to see which inputs trigger it. Then reword s4/ac3 to match: a hard reset is flagged as DESTRUCTIVE; a force push is flagged only when it targets a protected ref. If AC3 relies on every force push already needing approval, either add that gating to the story's scope or narrow the acceptance criterion. |
| s3 | closed-union | MED | assisted | No question-and-answer approval exchange between the daemon and an attached client exists over IPC today. | grep /approval\\.(request\|answer\|respond)/ returned 0 matches, which supports the claim that no approval question-and-answer IPC method exists. The other hits are only docs and comments. registerExternalGate appears in docs/plans/tools.md:547 ('render this via `channel.registerExternalGate`; the LLM tool-loop will') and in a comment at src/daemon/tools/executor.ts:10 ('the approval-gate dispatcher (channel.registerExternalGate, GateAction,'). GateAction appears in docs/plans/tools.md:60 (buildApprovalGate?) and in a comment at src/daemon/tools/types.ts:88. None of these is an IPC handler in the anchors src/daemon/index.ts or src/daemon/server.ts. But the comment at executor.ts:10 names an 'approval-gate dispatcher', and the evidence does not show whether that dispatcher is implemented or only planned. Neither anchor file was read, and the grep only checked the approval.* method names, so an approval exchange under another name (for example gate.* or question.*) is not ruled out. | Confirm the premise directly. List the IPC method names registered in src/daemon/index.ts, and read the context around src/daemon/tools/executor.ts:10 to see whether the approval-gate dispatcher (channel.registerExternalGate) is implemented or only described. If that dispatcher does exist as an exchange over IPC, s3 should reuse or extend it rather than build a new one. If it does not, the premise holds as written. |
| s6 | external-contract | MED | manual | Atlassian's acli exposes Jira issue, transition, comment, assignment and project operations; its command surface is unverified. | All 27 /\\bacli\\b/ matches are in the project's own planning documents, not in source code or vendor docs. They are in docs/epics/one-tool-registry-git-gh-jira-E2026102372024208/DEF.md (:33, :72, :79, :173, :183, :184, :187, :234, :242, :249, :280, :281), docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md (:33, :62, :74, :82, :182, :192, :193, :196, :197, :227) and docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md (:9, :13, :22, :56, :62). These lines state the requirement and the decision to wrap acli. None of them shows acli's real subcommands, its output format, how it is installed and signed in, or whether it supports transitions, comments, assignment and projects. The premise itself says the command surface is unverified. The newer DEF records this as a known gap: DEF.md:82 marks the assumption `low` with "its command surface has not been checked yet", S006:FR001 at DEF.md:62 requires acli's command list and output to be checked and recorded before the Jira tool families are designed, ac6 at DEF.md:197 says an operation acli does not offer must be named unsupported, and item a2 at DEF.md:227 asks for acli to be installed and its subcommands recorded. So the repo neither confirms nor contradicts the premise. It cannot be verified from this evidence, and the artifact already says so and plans a step to check it. | Before the s6 LLD is written, check acli's real command surface by installing it and capturing `acli jira --help` plus the subcommand help for workitem/issue, transition, comment, assign and project, or by citing Atlassian's acli documentation. Record the result as S006:FR001 requires, and cite it in each Jira tool family. Mark any operation acli lacks as unsupported (ac6). Also record how a missing install differs from a missing sign-in, for ac2. |
| s2/ac3 | external-contract | MED | manual | The gh CLI offers structured (JSON) output for many commands, while some CLI operations give only text requiring cheap-model conversion. | The first half of the premise holds. The grep for /--json/ shows gh's structured output in use across the repo's design docs: team-signoff S008/LLD.md:266 and S008/PLAN.md:45 (`gh pr view --json headRefName,state`, `gh pr view --json state,mergedAt,reviews`), S009/LLD.md:105 and :330 (`gh issue view --json state,labels`), and understand-changes S001/identity-sources.md:7 (`gh auth status --json hosts`). The tool-registry DEF.md:245 (FR005) states the same premise. The second half is not covered by the evidence: no match shows a gh operation that gives only text, which is the half that justifies the cheap-model conversion path. None of the matches come from the anchor src/daemon/tools/builtins/gh. Every hit is a markdown design doc, so the evidence does not show how the existing gh builtins call gh. Most matches (claude/codex --json, --json-schema, qwen) are about other CLIs and say nothing on this premise. | Back the text-only half with a concrete example: name at least one gh operation the s2 tool layer must wrap that has no --json output (for example `gh pr diff`, `gh pr checkout`, `gh auth status` without --json on older gh versions, or `gh run view --log`). Cite either a source file under src/daemon/tools/builtins/gh that parses gh text output today, or `gh <cmd> --help`. If no such operation is in scope, narrow AC3 so the model conversion path is not presented as required for gh. |
| p17 | ordering | MED | assisted | s4, s5 and s6 depend on s2 and s3; s7 depends on s1-s5 but not s6. | No probes were run for this premise, so there is no ripgrep match or path:line read to confirm or contradict the claimed story ordering (s4/s5/s6 depend on s2+s3; s7 depends on s1-s5 but not s6). The premise cannot be verified from the evidence given. | Check the ordering against the Define/HLD story dependency list (each story's dependsOn). Confirm that s4, s5 and s6 each list s2 and s3, and that s7 lists s1-s5 and leaves out s6. If they don't match, correct the premise or the story dependencies. |
| p18 | semantic | MED | assisted | The git runner inside the editor plugin's process lives outside the daemon/backend and is out of scope for migration. | The evidence does not show a production git runner inside the editor plugin. Every vscode-plugin hit is in a test file or a document that quotes one: vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:1501, :3567, :4023 and :5648 call `execFileSync('git', …)` directly, or a local `git(...)` helper. Other hits mention vscode-plugin/src/extension.ts:633 (a CR note on tabIcon, nothing to do with git). The evidence does support that the plugin is a separate source tree (vscode-plugin/) from the backend (src/). The revised DEF agrees with the non-goal: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md:212 scopes the build check to 'a new direct git or gh call appears in the backend outside the registry'. The earlier DEF (E2026102372024208/DEF.md:202) had no 'in the backend' qualifier. So the scope boundary is consistent, but the premise names a specific plugin runner, and the 50-match cap cut the grep off before any such runner turned up. The premise is unverifiable from this evidence. It is also not build-breaking: a non-goal that excludes plugin code does not change what gets built in src/. | Name the plugin's git runner by file:line (for example, the module under vscode-plugin/src that spawns git at runtime), or reword the non-goal to exclude all git calls under vscode-plugin/, tests included. Make sure the ac2 build check is scoped to src/ so plugin code and test fixtures do not trip it. |
| p3 | inventory | LOW | manual | The workflow library, the daemon and the terminal client's approval service run git/gh directly through their own wrappers in more than twenty places. | The evidence supports the count. The `runGit(` grep finds 23 production call sites in the workflow library. They are in src/workflow/team: anchor-finder.ts:37,40; handoff.ts:288,312,422,423,624,708,732; policy-reader.ts:68,80,94,116,137,140,161,165; policy-refresh.ts:54; sighting-store.ts:78; and signoff.ts:388,395,569. The wrapper itself is defined at src/workflow/team/git.ts:25. The `commitAndPushArtifacts(` grep, whose wrapper is defined at src/workflow/tracker/github.ts:120, finds 5 more production callers. Two are in the terminal client's approval service, at src/cli/services/workflow.ts:139 and :174. The others are src/workflow/questions.ts:470, src/workflow/resolve-comment.ts:218 and src/workflow/team/signoff.ts:385. That makes 28 or more direct git/gh call sites through the library's own wrappers, which is well over twenty. One part is not shown. The gathered matches under src/daemon are all in tests, such as build-step.test.ts and repo-settings.test.ts. The execFileSync grep was cut off at 50 matches, and the only daemon production call it surfaces is quoted in an ISSUE doc (validation-checks.ts:323-338). So the daemon's share is not shown directly. This does not change the outcome, because the workflow library and the CLI already pass twenty. | none — verified sound |
| p4 | citation | LOW | manual | runGit is a direct git shell-out wrapper defined in the workflow library. | grep /export function runGit/ found exactly one source match, at src/workflow/team/git.ts:25: `export function runGit(cwd: string, args: readonly string[], timeoutMs: number = LOCAL_GIT_TIMEOUT_MS): GitRun {`. Reading src/workflow/team/git.ts:25 returns the same line. The other two matches are in DEF.md (docs/epics/.../DEF.md:230 and :240), and both agree that runGit is defined at this anchor. So the anchor resolves to runGit in the workflow library (src/workflow/team/). It takes a cwd, git args and a timeout, which fits a git shell-out wrapper. The evidence does not show the function body, so the exact spawn mechanism is not visible here. The signature and the name are enough to support the premise. | none — verified sound |
| p7 | inventory | LOW | manual | The registry has no Jira tools today. | The case-insensitive grep /(?i)jira/ over the anchor scope (src/daemon/tools/builtins) found 0 matches, so no Jira tool is defined there. The /\\bacli\\b/ grep found 27 matches. Every one is in a planning document: docs/epics/one-tool-registry-git-gh-jira-E2026102372024208/DEF.md (:33, :72, :79, :173, :183, :184, :187, :234, :242, :249, :280, :281), docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md (:33, :62, :74, :82, :182, :192, :193, :196, :197, :227) and docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md (:9, :13, :22, :56, :62). None is in source under src/daemon/tools/builtins. The evidence supports the claim that the registry has no Jira tools today. | none — verified sound |
| s4/ac4 | inventory | LOW | manual | Existing git tool ids git_pull, git_push, git_reset and git:cherry-pick are registered with mixed naming. | All four anchors resolve to the cited ids: src/daemon/tools/builtins/git/pull.ts:23 `id: 'git_pull'`, push.ts:28 `id: 'git_push'`, reset.ts:29 `id: 'git_reset'`, and cherry-pick.ts:19 `id: 'git:cherry-pick'`. The wider grep for /id: 'git[_:]/ finds 22 git tool ids in src/daemon/tools/builtins/git/. Every one uses the underscore form (git_amend, git_blame, git_branch, git_checkout, git_commit, git_diff, git_fetch, git_log, git_merge, git_pull, git_push, git_rebase, git_remote, git_reset, git_revert, git_show, git_stage, git_stash, git_status, git_tag, git_worktree) except git:cherry-pick, which uses a colon. So the naming really is mixed. | none — verified sound |
| s5/ac6 | inventory | LOW | manual | Existing gh tool ids gh_pr_create, gh_issue_comment, gh_release_delete and gh:project:item-add are registered. | All four tool ids are defined in the cited anchor files: src/daemon/tools/builtins/gh/pr.ts:242 `id: 'gh_pr_create'`, src/daemon/tools/builtins/gh/issue.ts:191 `id: 'gh_issue_comment'`, src/daemon/tools/builtins/gh/release.ts:274 `id: 'gh_release_delete'`, src/daemon/tools/builtins/gh/project.ts:170 `id: 'gh:project:item-add'`. Each also uses its id in a title and in its fail/shellFail paths (e.g. pr.ts:268/294/309, project.ts:190/201/206/210). The full `id: 'gh[_:]` inventory (44 matches) shows the mixed naming the premise relies on: underscore ids in pr/issue/release/repo/actions and colon ids for the project item/field tools (project.ts:124-360). gh_pr_create is also listed in src/analyze/context/__tests__/tool-surface.test.ts:183. The evidence does not show the registry wiring itself, but the ids exist exactly as stated. | none — verified sound |
| p15 | cross-artifact | LOW | manual | The cited spec docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md exists and SPEC-0b8e02355ad3f578 records the brainstorm decisions. | read docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md:1 → FOUND: `<!-- insrc:artifact SPEC-0b8e02355ad3f578 -->`. The spec exists at the cited path and carries the cited artifact id. DEF.md:209 (E2026102372024208) and DEF.md:220 (E20261023b7a68147) both cite this SPEC path as source [[c1]]. The evidence shows that the file exists and that the id matches. It does not show the spec's content, so it cannot confirm which brainstorm decisions the spec records. | none — verified sound |
| p16 | cross-artifact | LOW | manual | Constraints k1-k4 trace to CLAUDE.md principles: no direct cloud REST, accuracy first, no parallel LLM calls, daemon owns all access via IPC. | The evidence backs all four principles in CLAUDE.md. No direct cloud REST: CLAUDE.md:12 "**No direct cloud REST calls from our process.** Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`)". Accuracy first: CLAUDE.md:11 "**Accuracy is primary; cost is the least priority.**". No parallel LLM calls: CLAUDE.md:122 "Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits.". Daemon owns access via IPC: CLAUDE.md:136 "1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only.". AGENTS.md has the same text at lines 11, 12, 122 and 136. | none — verified sound |

#### Proposed fixes

- **p1** (assisted) — The core claim holds: the executor warns and auto-approves a tool that requires approval (executor.ts:44). Whether this covers predicates, and whether it happens on every call, is not shown by the evidence. The work prescribed by the premise (a uniform approval rule in place of the auto-approve) most likely still applies, so this is imprecision and not a build-breaking contradiction.
  - option: Keep the premise and add the anchor 'executor.ts:41-44 (the gate dispatcher is gone, so every gated call is auto-approved with a warning)' once the read confirms the branch runs every time
  - option: Narrow the premise to `requiresApproval === true` if the full line 41 shows predicates are not evaluated
  - option: Reword it as a conditional fallback ('when no gate dispatcher is registered, gated tools are auto-approved with a warning') if line 44 is in a fallback branch

- **p2** (assisted) — The anchor is correct, but the evidence cannot show the claim that every call passes through executeTool. The one confirmed caller also has an injectable override that bypasses it. A person needs to decide whether to widen the scope or reword the claim.
  - option: Keep the premise, and add a task that checks for and routes any direct tool-handler calls through executeTool, including the `args.execute` override in read-only-tool-loop.ts:78.
  - option: Reword the premise to: 'executeTool(toolId, input, deps) at src/daemon/tools/executor.ts:23 is the standard entry point for registry tool calls (the caller found is src/agent/read-only-tool-loop.ts:78); injected executors and any direct handler calls must also be routed through the hook stage.'
  - option: Scope the hook stage to calls that go through executeTool only, and document which paths are exempt.

- **p5** (assisted) — The anchor is correct. What the evidence cannot show is how the shell-out works (direct git versus a wrapper), so the premise is unverified, not contradicted. A narrower probe or a softer wording settles it.
  - option: Keep the premise as written and add a probe that reads src/workflow/tracker/github.ts:120-160 so the git shell-out is grounded.
  - option: Reword it to: 'commitAndPushArtifacts (src/workflow/tracker/github.ts:120) commits and pushes artifacts. The same module holds the tracker's direct gh/git shell-outs (out/silent).' This keeps the claim to what the cited docs support.
  - option: Limit the gh grep to src/workflow/tracker/github.ts so source lines, not docs, ground the module-level claim.

- **p6** (assisted) — Committed reviews point to commitAndPushArtifacts calls at workflow.ts:139/174, which support the gist of the premise. The evidence holds no source read, though, and it shows the git use is indirect, through the github.ts wrapper. Either the wording or the grounding needs a human-approved adjustment.
  - option: Reword: "The terminal client's approval service (src/cli/services/workflow.ts) runs git and gh through the workflow library's direct shell-out wrappers (commitAndPushArtifacts, the tracker attach path) rather than through the registry."
  - option: Keep the wording, and add direct file:line anchors (src/cli/services/workflow.ts:139, :174) after re-probing the source.
  - option: Narrow the premise to the git commit/push path only (commitAndPushArtifacts) if a re-probe shows no gh use from this service.

- **p8** (assisted) — The missing-schema claim is grounded. The field list and which interface is meant are not shown in the evidence, so a person should confirm them before an edit; no edit can be derived safely.
  - option: Keep the premise once a read of src/daemon/tools/types.ts:33 confirms the fields output/format/success
  - option: Reword the premise to cite the field names and the exact ToolResult it means (src/daemon/tools/types.ts:33 rather than src/shared/types.ts:46)
  - option: Narrow the premise to the grounded part: 'no result/output schema is declared anywhere under src/daemon/tools'

- **s4/ac3** (assisted) — The anchors show a DESTRUCTIVE title for `reset --hard` and a PROTECTED REF title for a force push to a protected ref only. The capped grep cannot show whether the git tools' requiresApproval is set, so the wording has to be confirmed or narrowed by a person rather than edited mechanically.
  - option: Narrow the premise: hard reset is flagged DESTRUCTIVE (reset.ts:67); force push is flagged only for protected refs (push.ts:71). Force pushes to other refs are not covered today.
  - option: Keep the premise but add work to s4 so that every force push, not just a push to a protected ref, requires approval.
  - option: Verify requiresApproval in both git tool files first, then cite the actual predicate lines instead of the title lines.

- **s3** (assisted) — The grep evidence supports the claim that no approval method exists, but the comment at executor.ts:10 points to a possible approval-gate dispatcher that the evidence does not settle. A human check decides whether s3 builds a new exchange or extends an existing one.
  - option: Keep the premise as written once the index.ts handler registry shows no approval or gate methods.
  - option: Reword the premise: 'No approval question-and-answer IPC method exists; the tool executor has only an approval-gate dispatcher concept (channel.registerExternalGate / GateAction, executor.ts:10) that is not exposed over IPC.'
  - option: If the gate dispatcher is live and reachable over IPC, re-scope s3 to extend channel.registerExternalGate instead of adding a new exchange.

- **s6** (manual) — Whether acli offers these operations is a fact outside the repo. No evidence here supports a text edit, and the premise already says the surface is unverified. Settling it needs an external check, and possibly a scope decision if an operation turns out to be missing.
  - option: Check acli's command surface (help output or Atlassian docs) and cite it in the s6 LLD as grounding for each Jira tool family (Story S006:FR001)
  - option: If acli lacks an operation (for example assignment or project listing), narrow s6 so that family is listed as unsupported under ac6 instead of approximated
  - option: Gate the s6 design.story on a recorded acli capability check (item a2), and keep the DEF assumption at `low` until that check is done

- **s2/ac3** (manual) — gh's --json support is confirmed, but whether any in-scope gh operation is text-only is unverified, and only that half motivates the conversion path. The prescribed design still holds, since a conversion fallback costs nothing when unused, so this is MED, not HIGH. The evidence gives no value to auto-edit with.
  - option: Name the specific text-only gh operations in scope (e.g. gh pr diff, gh run view --log), each with its gh --help or builtin source cited, and keep the conversion path.
  - option: Restrict the model conversion path in AC3 to git and Jira/acli operations that have been shown to be text-only, and require --json for every gh tool.
  - option: Keep AC3 as written, but mark the text-only half as an assumption to confirm during s2 build with a probe of each wrapped gh command.

- **p17** (assisted) — The premise is an ordering claim with no gathered evidence. It needs a human to check it against the artifact's story dependency declarations before any edit.
  - option: Keep the premise as written once the Define/HLD story dependsOn entries are confirmed to match
  - option: Add s6 to s7's dependencies if s7 actually consumes something s6 produces
  - option: Correct the s4/s5/s6 dependency sets if any of them does not actually need both s2 and s3

- **p18** (assisted) — The scope boundary (backend src/ vs the vscode-plugin/ tree) is supported, and DEF ac2 already says 'in the backend'. What is missing is a concrete anchor for the plugin's git runner. The evidence shows only test-file git calls in vscode-plugin, so the premise should either cite the runtime runner or be reworded as a tree-level exclusion.
  - option: Reword the non-goal: 'Git and gh calls under vscode-plugin/ (the editor plugin's own process, including its tests) are out of scope; the registry cutover and its build check cover src/ only.'
  - option: Keep the wording and add a citation to the plugin module that actually runs git at runtime (to be confirmed by a targeted grep under vscode-plugin/src excluding __tests__).
  - option: Bring plugin git calls into scope if a later story needs one registry across processes (needs a design decision).
