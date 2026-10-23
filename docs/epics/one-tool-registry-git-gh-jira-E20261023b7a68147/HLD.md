<!-- insrc:artifact HLD-b7a68147dcf72034 -->

# HLD: one-tool-registry-git-gh-jira

## Summary

Every git, gh and Jira operation becomes a tool in the daemon's registry, and every caller (an agent, the daemon, the workflow) runs it through the same executor. The executor gains a fixed sequence: ask the user first when the call needs it, run the tool, check the result against its declared shape, then run the rules registered for that tool. Destructive calls always ask; other calls that need approval follow one global setting. A rule such as refreshing tracker status after a push is therefore written once. The old direct git and gh calls are removed in one change and a build check keeps them out.

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
10. [Open questions](#10-open-questions)

## 1. Problem context

> See **DEF-b7a68147dcf72034** § 1. Problem

## 2. Framework summary

Alternative a1: the executor in src/daemon/tools/executor.ts becomes the one pipeline for all external operations, and git, gh and Jira (acli) are registry tool families with an optional declared output schema and an approval class (none, common or destructive). Workflow and daemon code call tools through a typed helper that takes the tool definition; about 32 production files that spawn git or gh, or call a wrapper that does, move onto it in one change.

## 3. Architecture shape

Pipeline order inside executeTool (fixed, and the same for every caller): (1) resolve the tool and validate input; (2) resolve the call's approval class: a destructive call always sends an approval request over the daemon's IPC to the attached client and waits, and no setting, argument or caller can skip it; a common call asks only when the one global approval setting says 'ask', and runs without asking when it says 'auto'; a call with class none never asks; a request is denied on decline, on timeout or when no client is attached; (3) run the tool; (4) if the tool declares an output schema, check the result against it and fail the call on a mismatch; (5) only if the call succeeded, run the hooks registered for that tool id one after another in registration order, collecting any hook failure into a report on the result; (6) return. A failed or denied call never reaches step 5.

Approval today: the executor treats a tool's requiresApproval flag as approved and runs it (src/daemon/tools/executor.ts), so no tool asks. The flag is set on 11 git tools (amend, checkout, cherry-pick, commit, merge, pull, push, rebase, reset, revert, stage), as a predicate on 5 more (branch, remote, stash, tag, worktree), on 27 gh operations, and on tools in the file, cloud and other families. s3 maps every existing flag to the common class, for every family, so nothing is left inert: a flag that is true becomes common and a predicate becomes a function from the input to a class. The global setting proposed for the common class defaults to 'auto', which is how those tools behave today, so unattended workflows keep running; 'ask' is opt-in. The default is settled in the s3 LLD. s4, s5 and s6 then mark as destructive the operations that can destroy work, which ask every time whatever the setting. This reads the DEF's s3 ac6 as: a tool that needs approval asks when the setting is 'ask', and always asks when it is destructive.

Tool layer: git (extend the 22 existing ids), gh (extend the gh_* and gh:project:* ids) and Jira (new family over acli) each register one tool per operation family with an approval class, and an output schema where the tool returns data a caller uses; about 110 builtins have no schema today and stay unchecked until their family Story adds one. The existing ids stay as they are, including the mixed 'git:cherry-pick' and 'gh:project:*' forms. Where the CLI gives structured output (gh --json, git porcelain, acli --json) the tool reads it directly; where it gives only text, a conversion step uses the cheap model, checks the key values against the raw text, and may escalate once to a higher-tier model; conversions run serially. Failures from a missing CLI, a missing sign-in, a time-out or a rejection are returned in one shared set of kinds (the same kinds the tracker port already uses), so a missing acli is told apart from a signed-out acli by 'acli jira auth status' and a PATH lookup, not by parsing a failing command.

Caller side: a typed helper takes the tool definition object, which the caller imports, plus the input, and returns a result typed from the definition's schema; a string id alone carries no type. Cutover: every direct git, gh and acli spawn in the backend moves onto the registry, with no allowlist. The inventory in docs/plans/tool-registry.md lists about 32 production files: 17 that spawn the CLI themselves (src/workflow/tracker/github.ts, src/cli/services/maintenance.ts, src/workflow/team/git.ts and git-async.ts, the build runners story-commits.ts, range-base.ts and standalone-record.ts, src/daemon/steps/build-step/validation-checks.ts, src/understanding/identity.ts, src/workflow/tracker/attach.ts, gates.ts, convert/plan.ts, companion/header.ts, src/daemon/installed-commit.ts, src/design/corpus/sources/git-reader.ts, src/indexer/index.ts and src/analyze/context/repo-ignore-filter.ts) and 15 that call a wrapper; 31 test files import a github.js module. A text search misses indirect forms, so the list is a floor: s7 first builds the repository check that fails on any git, gh or acli spawn outside src/daemon/tools, and takes the final inventory from what that check finds. The plugin's own git runner is outside scope.

Glossary (the spec's terms, tied to the code): 'executor' is executeTool in src/daemon/tools/executor.ts; 'registry' is the tool registry in src/daemon/tools/registry.ts with its builtins under src/daemon/tools/builtins; 'cheap model' is a peripheral-tier model role under the per-role model tiering in docs/daemon.md#model-tiering, which the coreFloor never serves to the critical roles; 'rule' is a hook registered on a tool id; 'destructive' is a tool or call whose approval class says it can destroy work; 'client' is any process attached to the daemon's socket (the terminal client, the editor, a chat).

## 4. Shared contracts

### 4.1 sc1: Tool hook registry

**Owner Story:** `s1`
**Consumed by:** `s7`

**Purpose:** Lets a rule be registered against a tool id once and run after that tool succeeds for every caller, with failures reported on the result and not thrown.

**Interface sketch (type-level):**

```
interface ToolHook { id: string; toolId: string; run(ctx: ToolHookContext): Promise<void> }
interface ToolHookContext { toolId: string; input: unknown; result: ToolResult; caller: 'agent' | 'daemon' | 'workflow' }
interface HookFailure { hookId: string; message: string }
interface ToolResultHookReport { hookFailures?: HookFailure[] }
registerToolHook(hook: ToolHook): void
```

**Assumptions cited:** [[c2]]

### 4.2 sc2: Tool output schema and typed call

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** Lets a tool declare its result shape, has the executor check it when declared, and gives callers a result typed from the tool definition they pass.

**Interface sketch (type-level):**

```
interface OutputSchemaField<O> { outputSchema?: JsonSchema; readonly outputType?: O }
type ToolOutput<T> = T extends OutputSchemaField<infer O> ? O : unknown
interface TypedToolResult<O> { success: boolean; data?: O; error?: ToolFailure }
callTool<T extends OutputSchemaField<any> & { id: string }>(tool: T, input: ToolInput<T>, deps: ToolDeps): Promise<TypedToolResult<ToolOutput<T>>>
```

**Assumptions cited:** [[c2]] [[c3]]

### 4.3 sc3: Text conversion with cross-check

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`

**Purpose:** Turns text-only CLI output into the declared shape using the cheap model, cross-checks the key values against the raw text, and escalates once to a higher-tier model; conversions run serially.

**Interface sketch (type-level):**

```
interface ConversionRequest<O> { toolId: string; rawText: string; schema: JsonSchema; keyValues: (value: O) => string[] }
interface ConversionResult<O> { ok: boolean; value?: O; tier: 'cheap' | 'escalated'; failure?: ConversionFailure }
interface ConversionFailure { kind: 'shape-mismatch' | 'value-not-in-text' | 'retries-exhausted'; detail: string }
convertText<O>(req: ConversionRequest<O>): Promise<ConversionResult<O>>
```

**Assumptions cited:** [[c2]]

### 4.4 sc4: Approval class and approval exchange

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** Defines the one field that gives a tool or call its approval class, the global setting that governs the common class, the request the executor sends to the attached client, the answer, the timeout and the denial reasons, so that every client implements the same exchange.

**Interface sketch (type-level):**

```
type ApprovalClass = 'none' | 'common' | 'destructive'
interface ApprovalField<I> { approval?: ApprovalClass | ((input: I) => ApprovalClass) }
type CommonApprovalMode = 'auto' | 'ask'
interface ApprovalRequest { requestId: string; toolId: string; approvalClass: 'common' | 'destructive'; inputSummary: string; reason: string; expiresAt: string }
interface ApprovalAnswer { requestId: string; decision: 'approve' | 'decline' }
type ApprovalDenial = 'declined' | 'timed-out' | 'no-client'
interface ApprovalGate { ask(req: ApprovalRequest): Promise<ApprovalAnswer | ApprovalDenial> }
// IPC methods: approval.request (daemon to client), approval.answer (client to daemon)
```

**Assumptions cited:** [[c4]]

### 4.5 sc5: CLI failure kinds

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** One set of failure kinds returned by every git, gh and acli tool so callers tell a missing CLI, a missing sign-in, a time-out and a rejection apart.

**Interface sketch (type-level):**

```
type ToolFailureKind = 'missing-tool' | 'missing-signin' | 'unreachable' | 'timed-out' | 'rejected' | 'conversion-failed' | 'schema-mismatch' | 'denied'
interface ToolFailure { kind: ToolFailureKind; message: string; denial?: ApprovalDenial }
```

**Assumptions cited:** [[c3]]

## 5. Story boundaries

### 5.1 Story STORY-b7a68147dcf72034-s1

**Owns:** `sc1`

The hook stage inside executeTool: the registry of hooks keyed by tool id, registration order, the rule that a hook runs only after a successful, checked call, and the way a hook failure is carried on the result. It places its stage at step 5 of the pipeline order in the architecture shape and does not own the schema check or the approval step.

### 5.2 Story STORY-b7a68147dcf72034-s2

**Owns:** `sc2`, `sc3`, `sc5`

The optional output-schema field and the check at step 4 of the pipeline, the typed call helper that takes a tool definition, the serial conversion queue, the key-value cross-check and the one-time escalation, and the shared failure kinds. It includes the choice of schema language and the way an input-to-tool mismatch is reported. It does not declare or read the approval class.

### 5.3 Story STORY-b7a68147dcf72034-s3

**Owns:** `sc4`

The approval step at step 2 of the pipeline: the single approval field on a tool definition, the global approval setting for the common class and its default, the IPC request and answer methods, the timeout value, the daemon-side holder of the pending requests, the terminal-client, editor and chat implementations of the answer, and removal of the 'auto-approving' fallback in executor.ts. It maps every existing requiresApproval flag, in every family, to the common class, and lists the tools that change. It does not choose which individual git, gh or Jira operations are destructive; each family Story marks its own.

### 5.4 Story STORY-b7a68147dcf72034-s4

**Depends on:** `sc2`, `sc3`, `sc4`, `sc5`

The list of git operation families, their input and output schemas, which git operations are in the destructive class (for example force push, hard reset, clean, deleting a branch or tag), and the parsing of git porcelain output. Operations that need approval but cannot destroy work stay in the common class. Existing git ids keep their meaning.

### 5.5 Story STORY-b7a68147dcf72034-s5

**Depends on:** `sc2`, `sc3`, `sc4`, `sc5`

The list of gh operation families, their schemas (read from gh --json where it exists, converted from text otherwise, for example gh pr diff and gh run view --log), which of the 27 gh operations that need approval are in the destructive class, and the 120 second time limit and its message. Existing gh ids keep their meaning.

### 5.6 Story STORY-b7a68147dcf72034-s6

**Depends on:** `sc2`, `sc3`, `sc4`, `sc5`

The Jira tool families over acli (work item view, search, create, edit, transition, assign, comment, link, project list and view), their schemas, the --yes flag on every mutating command, the bounded forms of search and project list that acli requires, the 'acli jira auth status' sign-in check, and which operations are in the destructive class. An operation acli does not offer is left out and named as unsupported.

### 5.7 Story STORY-b7a68147dcf72034-s7

**Depends on:** `sc1`, `sc2`, `sc4`, `sc5`

The repository check that fails on a direct git, gh or acli spawn outside src/daemon/tools, built first; the inventory it produces (about 32 production files known today, with the indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup and the daemon self-update included and no allowlist); the rewrite of every listed site and of the tests that import the old wrappers onto the typed helper; and the removal of runGit, commitAndPushArtifacts and the github.ts wrappers. It keeps the artifacts, commits and tracker records the same as before.

## 6. Non-functional targets

- **Performance:** gh commands time out after 120 seconds (decided with the user; the daemon is expected to become multi-threaded so a slow gh will not block it). The approval wait has its own timeout, set in s3's LLD. Conversion is serial, so a text-only tool that needs the cheap model costs one model call per attempt plus at most one escalated call; structured-output tools make no model call.
- **Security:** No argument, setting, environment variable or caller identity can skip the approval for a destructive call; with no client attached the call is denied. Common calls follow one global setting. Approval requests travel only over the daemon's Unix socket. No credentials are read or stored: gh, git and acli use the user's own CLI sessions. A tool that declares an output schema and returns a result that does not match it fails and its result is not passed on. Today the executor runs every tool flagged requiresApproval as approved (11 git tools, 5 more by predicate, 27 gh operations and other families), so nothing asks; this Epic makes destructive calls ask every time and puts the rest under the global setting.
- **Observability:** The executor logs each stage per call with the tool id, the caller, the approval class and decision and its reason, the schema check result, and each hook outcome. Hook failures, denials and conversion escalations are returned to the caller as part of the result, not only logged.
- **Durability:** Pending approval requests are held in memory by the daemon and are lost on restart; a request left open at restart is treated as denied. Hooks are registered in code at start-up, not stored. The global approval setting is stored in the daemon's config. The cutover leaves artifacts, commits and tracker records unchanged.

## 7. Rollout

**Phase A — executor pipeline stages**

**Stories:** `s1`, `s2`, `s3`

The three stages of the executor pipeline (hooks, result check with conversion, approval) have no dependencies on each other in the Epic graph and own all five shared contracts the later phases consume. They are built one after another in the order s2, s3, s1, because s2 and s3 are what s4 to s6 wait on, and s1 only has a consumer in s7.

**Backward compat:** Agents keep calling every tool id the same way and get the same result shape. A tool with no output schema is not checked until its family Story adds one. s3 maps every existing requiresApproval flag to the common class, and the global setting for that class defaults to 'auto', which is how those tools behave today, so no tool starts to ask in this phase and unattended workflows keep running. Destructive marking comes with the family Stories.

**Phase B — tool families**

**Stories:** `s4`, `s5`, `s6`

The git, gh and Jira families each need the output-schema check, the conversion contract, the failure kinds and the approval exchange from phase A. They do not depend on each other and can be built in any order; git first, because s7 moves the most call sites onto it, then gh, then Jira, which has no call sites yet and so can trail.

**Backward compat:** Every existing git_* and gh_* id keeps its name and meaning (k7). s4 and s5 put the operations that can destroy work into the destructive class, so those start to ask every time; the rest stay in the common class under the global setting. New operations are added as new tools; an existing tool's input and output stay as they are unless the declared schema only names what it already returned.

**Phase C — cutover**

**Stories:** `s7`

The cutover needs the hook stage (s1), the typed helper and failure kinds (s2), the approval exchange (s3) and the git and gh families (s4, s5) so that every call site has a tool to move to. It is one change with no shims (k6), so it lands only when the families are complete, and it starts with the repository check that finds every direct spawn.

**Backward compat:** Workflow stages produce the same artifacts, commits and tracker records as before; the existing tests of those stages are the check. runGit, commitAndPushArtifacts and the github.ts wrappers are deleted in the same change.

**Ordering rationale:** The order follows the Epic's dependsOn edges: s1, s2 and s3 have none; s4, s5 and s6 each depend on s2 and s3; s7 depends on s1 to s5. Contract ownership agrees with it: sc1 (s1) is consumed only by s7; sc2, sc3 and sc5 (s2) and sc4 (s3) are consumed by s4 to s7, all of which come later. s6 is not a dependency of s7, so it can land before or after the cutover.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Executor blast radius | executeTool runs every external operation; the three new stages change it for every agent, daemon and workflow call at once, and a fault in the stage order could skip an approval or run a hook on a failed call. | Pin the stage order with tests that assert it directly (a denied call never runs the tool, a failed or mismatching call never runs a hook, a hook failure does not change success), and keep the pipeline in one function with no per-caller branches. |
| Approval starts to ask where it never asked | Today the executor runs approval-flagged tools as approved, so agent loops and workflow stages run them without a prompt. Destructive calls will now wait for a client and be denied when none is attached, which can stop an unattended loop or workflow stage that worked before; the common class has the same effect for anyone who sets the global setting to 'ask'. | Keep the common-class default at 'auto' so behaviour is unchanged until a user opts in; narrow the destructive class to operations that can destroy work; list in each family Story's LLD which workflow stages can reach a destructive tool and what they do on denial; s7's acceptance criterion fails the stage with the denial reported. |
| One-change cutover | About 32 production files and 31 test files that import a github.js module move at once with no shims (k6), including subsystems that read git for their own purposes (the indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup and the daemon self-update), and a text search misses indirect forms (the graph is also missing 57 relationships). | Build the repository check first and take the inventory from what it finds, not from a text search; keep the inventory in docs/plans/tool-registry.md; size s7 from it before the rewrite begins; the check then fails the build on any file the rewrite missed. |
| Text conversion accuracy | A cheap model can return a value that fits the schema but is wrong; the cross-check only covers the key values it is told about. | Prefer structured CLI output (gh --json, git porcelain, acli --json) so the model path is the exception; each text-only tool declares its key values; tests replay captured real CLI output through both the cheap and the escalated path, including truncated and made-up values. |

## 8. Alternatives considered

### 8.1 a1: Executor pipeline with a typed call helper — **CHOSEN**

Every git, gh and Jira operation is a registry tool; executeTool becomes a fixed pipeline (approval, run, result check, hooks) and workflow code calls it through a typed helper that takes the tool definition.

executeTool in src/daemon/tools/executor.ts becomes the one pipeline every caller passes through: resolve the tool, ask for approval when the call needs it (destructive calls always, common calls according to one global approval setting), run it, check the result against the tool's declared output schema when it has one, then run the hooks registered for that tool name one after another. The tool families (git, gh, Jira) are registry builtins, one tool per operation family, each with an optional output schema and an approval class. Workflow and daemon code call a typed helper that takes the tool definition object (imported by the caller) and returns a result typed from its schema, so no caller parses text.

The approval request goes over the daemon's IPC to the attached client and is denied on timeout or when no client is attached. Output built from text goes through a conversion step: the CLI's structured output is read directly where it exists, and otherwise a cheap model converts the text, the key values are checked against the raw text, and one escalation to a higher-tier model is allowed. The cutover replaces every direct git, gh and acli spawn in the backend, and the runGit, commitAndPushArtifacts and github.ts wrappers, in one change, and a repository check fails the build on a new direct call outside the registry.

**Pros:**
- One place for every cross-cutting rule: a hook registered on git_push runs for the agent loop, the daemon and the workflow, so the s9 refresh needs no second implementation.
- No new API surface besides the typed helper: the 22 runGit calls and the 5 commitAndPushArtifacts callers move onto the registry that agents already use.
- Matches the approved SPEC decisions (registry as the single layer, executor-level hooks, schema validated by the executor) with no translation layer to keep in step.
- Approval, result check and hooks have a fixed order, so a destructive call is gated before it runs and no hook sees an unchecked result.

**Cons:**
- The executor becomes a larger, security-relevant module: one fault in the pipeline affects every external operation, so it needs the heaviest tests of the Epic.
- Workflow code that today calls plain functions must go through async tool calls; callers import the tool definition so the type is carried, and a tool addressed only by a string id gets no type.
- The cutover in one change touches about 32 production files (17 that spawn the CLI directly and 15 that call a wrapper) and 31 test files that import a github.js module, so the change set is large and hard to bisect.

**Cost estimate:** L

### 8.2 a2: Typed service facade over the registry

Workflow and daemon code call small typed services (a git service, a gh service, a Jira service) that internally call registry tools; the executor stays close to today's shape.

A thin typed module per CLI (for example a git service with methods such as push, pull and commit) is written for workflow and daemon code. Each method calls executeTool with the matching tool id and converts the generic ToolResult to a method-specific type. Hooks and the approval exchange are still added to the executor, so the cross-cutting rules still apply to calls that go through it.

Agents keep calling tool ids directly. The facade gives workflow authors named methods and compile-time types without a generic typed helper, and it keeps the large call-site rewrite mechanical: runGit(args) becomes a named method. Output schemas stay on the tools; the facade adds a second, hand-written layer of types on top of them.

**Pros:**
- Call sites read as named methods (git.push(...)) and give workflow authors editor completion and a place to hold per-operation defaults.
- The executor change is smaller than in a1, because typing is done in the facade instead of by a generic helper.
- The facade can be adopted per module, so the call-site rewrite can be reviewed in smaller pieces.

**Cons:**
- Two descriptions of every operation exist, the tool's output schema and the facade's hand-written type; they can drift apart, which breaks the accuracy-first rule when a type no longer matches the result.
- A facade method is a second path to add for each new operation: a new git tool is not reachable from workflow code until its method is written, which brings back the 'added twice or missed' problem the Epic removes.
- The facade is a new place where someone can add a direct spawn of git, so the build-time check needs to guard two layers, not one.
- Adds roughly one module per CLI family (three) and their tests on top of the work in a1.

**Cost estimate:** L

**Rejected because:** Partial on k2 (hand-written types can drift from the declared schema) and k6 (the facade is a second place a direct call can be added); it gets the same rule placement as a1 but adds a second type layer to keep in step.

### 8.3 a3: Shared typed library under both the registry and the workflow

A typed git, gh and Jira library holds the real logic; the registry tools and the workflow code are both thin callers of it, and hooks and approval are applied inside the library.

The logic that runs git, gh and acli moves into one typed library module with the result checks, the cheap-model conversion, the approval request and the hooks inside it. The registry builtins become thin adapters that call the library and return its result as a ToolResult, and the workflow code calls the library directly, without the executor.

Because the rules live in the library, they apply to any caller of the library whether it comes through the registry or not. Agents keep using the tool ids; the executor itself is changed little, since approval and hooks are no longer its job.

**Pros:**
- Workflow code gets native TypeScript types and plain function calls, with no tool-id strings and no ToolResult wrapping.
- The executor stays small, so a change to it cannot affect every external operation.
- The library can be unit-tested without the registry or the executor.

**Cons:**
- Departs from the approved SPEC decision that the daemon's tool registry is the single layer: the registry becomes an adapter and the library becomes the real layer, so the SPEC and the DEF would need an amendment.
- Any code that reaches an external CLI through the executor but not through the library, such as a tool defined outside the git, gh and Jira families, would skip the rules; the registry no longer guarantees that every external operation is covered.
- Approval and hooks tied to a tool name do not exist at the registry level, so the rule 'every tool gets the same treatment' has to be re-implemented for each adapter.
- Rewrites the existing tools into adapters over a new library, which is more rewriting than a1 for the same call-site cutover.

**Cost estimate:** L

**Rejected because:** Partial on k2, k4, k5 and k6: the rules sit in a library beside the registry instead of in the registry's executor, which also contradicts the approved SPEC decision that the registry is the single layer.

## 9. References

- **[[c1]]** `code` `src/daemon/tools/executor.ts`
- **[[c2]]** `code` `src/daemon/tools/registry.ts`
- **[[c3]]** `code` `src/daemon/tools/types.ts`
- **[[c4]]** `code` `src/agent/read-only-tool-loop.ts:78`
- **[[c5]]** `code` `src/workflow/team/git.ts`
- **[[c6]]** `code` `src/workflow/tracker/github.ts`
- **[[c7]]** `code` `src/cli/services/maintenance.ts`
- **[[c8]]** `code` `src/design/corpus/sources/git-reader.ts`
- **[[c9]]** `doc` `docs/plans/tool-registry.md`
- **[[c10]]** `doc` `docs/daemon.md#model-tiering`

## 10. Open questions

- The DEF's s3 ac6 says a tool that needs approval 'asks'; this HLD reads it as 'asks when the global setting is ask, and always asks when destructive', following the user's decision of 2026-10-23. The DEF may need an amendment to ac6 to match (audit item sbdry4, partial).

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**7 do not hold · 0 could not be verified · 5 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-23T09:43:17.307Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | The HLD designs every DEF requirement on result shapes: the output schema is optional and about 110 builtins 'stay unchecked until their family Story adds one'. | DEF S002:FR001 says 'A tool without a declared result shape cannot be registered.' FR004 says 'Every tool declares the shape of its result, the executor checks each result against it'. The HLD's sc2 has `outputSchema?: JsonSchema` and §3 says the builtins without one 'stay unchecked'. tool-registry.md:53 records why ('ToolResult.output is a string, so outputSchema has to be optional'). The HLD's Open questions list only the ac6 reading, so this departure from S002:FR001/FR004 is neither designed nor flagged for a DEF amendment. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md, docs/plans/tool-registry.md] | Add an open question or DEF amendment for S002:FR001/FR004 (optional schema, unchecked builtins), or design how registration rejects a tool with no schema. |
| coverage-of-intent | MED | The sc4 ApprovalRequest carries what the DEF requires the approval request to name. | DEF S003:FR001: 'The approval request names the tool, the repository and the arguments it would run with.' The sc4 sketch has `{ requestId; toolId; approvalClass; inputSummary; reason; expiresAt }`. There is no repository field, and the arguments appear only as a free-form 'inputSummary'. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md] | Add the repository (repoPath from ToolDeps) and the exact arguments to ApprovalRequest in sc4. |
| new-versus-reuse | MED | sc4's approval field is 'the one field that gives a tool or call its approval class', and the destructive class is new, marked by the family Stories. | types.ts:127-128 already declares `readonly destructive?: boolean` on Tool ('Flags the tool as destructive / irreversible'). 8 builtins set `destructive: true`: az/vm.ts:238, k8s/index.ts:340, aws/s3.ts:210, gcp/compute.ts:247, aws/cloudformation.ts:235, gcp/run.ts:212, gcp/storage.ts:189 and aws/ec2.ts:255. types.ts:83-145 also has ToolApprovalGate / buildApprovalGate. The HLD mentions neither. s3 maps only requiresApproval to 'common', so these 8 tools would be downgraded to 'common', or a second field would be left beside the new one. [files: src/daemon/tools/types.ts, src/daemon/tools/builtins/cloud/aws/s3.ts, src/daemon/tools/builtins/k8s/index.ts] | In s3, map `destructive: true` to the destructive class (or retire the field) and say how buildApprovalGate relates to ApprovalRequest. |
| change-sites | MED | Hooks receive `caller: 'agent' \| 'daemon' \| 'workflow'` in ToolHookContext, which the executor can supply. | `executeTool(toolId, input, deps)` (executor.ts:23) takes no caller identity, and ToolDeps (types.ts:50-81) has no caller field. The only production caller is read-only-tool-loop.ts:78. Neither sc1 nor sc2 (callTool takes `deps: ToolDeps`) says where the caller value comes from, or which signature or ToolDeps change carries it. [files: src/daemon/tools/executor.ts, src/daemon/tools/types.ts, src/agent/read-only-tool-loop.ts] | State in sc1/sc2 the field that carries the caller (for example `ToolDeps.caller`) and who sets it on each path. |
| data-compatibility | MED | sc5 failure kinds are 'the same kinds the tracker port already uses'. | port.ts:23 has `PortFailureKind = 'missing-tool' \| 'missing-signin' \| 'unreachable' \| 'rejected'`, and github.ts:76 maps a timeout to 'unreachable'. sc5 adds 'timed-out', 'conversion-failed', 'schema-mismatch' and 'denied'. unit-issue.test.ts:390 iterates exactly the four port kinds. The HLD gives no mapping from the new kinds onto PortFailureKind for the tracker port and its stored or tested results, even though s7 promises 'the same tracker records as before'. [files: src/workflow/tracker/port.ts, src/workflow/tracker/github.ts, src/workflow/tracker/__tests__/unit-issue.test.ts] | State in sc5 or s7 how the new kinds map onto PortFailureKind, or that PortFailureKind is widened and its consumers updated. |
| error-paths | MED | Every caller's call reaches an approval gate that sends the request 'over the daemon's IPC to the attached client'. | maintenance.ts:81-83 ('Fast-forward sync + conditional install + build against DAEMON_ROOT. Never starts the daemon.') runs in the terminal client process. It runs git checkout -B, merge and remote set-url, often while the daemon is not running. cli/services/workflow.ts calls commitAndPushArtifacts (:139, :174). Both move onto the registry under s7, but the HLD only describes a daemon-side gate. It does not say which process runs the executor for these callers, or what the ApprovalGate does there (with no daemon a destructive call would always be 'no-client'). [files: src/cli/services/maintenance.ts, src/cli/services/workflow.ts] | State in s3/s7 whether CLI-process callers go through daemon IPC or an in-process gate, and how the self-update works when the daemon is down. |
| tests | MED | Each acceptance criterion maps to a test, including S007:FR001 ('each replaced call site is covered by a test that runs through the registry'). | The HLD names tests for the pipeline order (risk table) and replayed CLI output for conversion. For the cutover it says only 'the existing tests of those stages are the check' (§7 Phase C). DEF S007:FR001 requires a registry-path test per replaced site. Sites such as indexer/index.ts:91, repo-ignore-filter.ts:112 and identity.ts are not covered by any workflow-stage test. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md] | Add to s7's boundary that each inventoried site gets a test through the registry (or through the typed helper with a recorded executor). |

#### Could not verify (does not block)

_None._
