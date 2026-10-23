<!-- insrc:artifact SPEC-0b8e02355ad3f578 -->

# Spec: Build one consolidated tool layer for git, gh and Jira, and make the daemon's tool registry that layer.

**Category:** design

## Intent

Build one consolidated tool layer for git, gh and Jira, and make the daemon's tool registry that layer. The workflow library calls it through the executor and no longer shells out. runGit, commitAndPushArtifacts, the github.ts wrappers and the existing git_* tools are all cut over in this one change, with no shims. Coverage is a curated, typed tool per operation family for git, gh and Jira. Jira gets its own agent-facing tools beside the GitHub ones, wrapping Atlassian's official acli so auth stays with the user's CLI session. Cross-cutting hooks, such as 'refresh tracker status after a pull or push', are executor-level post-execution hooks keyed by tool name. They run synchronously after the call, and a hook failure is non-fatal and is reported alongside the tool result. Each tool declares an output schema. The executor validates results, and a generic typed call helper infers the result type for the workflow library. Where a tool's CLI output is not already structured, the cheap model converts the tool response to the tool's declared output schema, and the executor's schema validation is the safety net: a response that does not validate is a tool failure and is never passed on. Deterministic parsing stays preferred where the CLI gives structured output (gh --json, git porcelain, acli JSON). Destructive operations (force push, reset --hard, clean, branch/release/issue deletion) send an approval request over IPC to whichever client is attached, each time. If no client answers within the timeout, the call is denied.

## Scope boundary

The scope covers the tool registry as the single layer for git, gh and Jira, the cutover of every workflow and daemon call site that shells out to them, the executor hook mechanism, output schemas with validation, and the per-call approval of destructive operations. It does not cover a separate in-process library beside the registry, a hook bus outside the executor, one tool per subcommand, direct Jira REST calls or stored Jira tokens, a phased migration with shims, any Jira CLI other than acli, a blanket allow-all for destructive operations, or auto-approval when no client is attached.

## Non-goals

- No separate typed in-process library alongside the registry; the registry is the only layer
- No hook bus outside the executor; hooks are not registered in workflow code or per-wrapper
- No one-tool-per-subcommand mirroring of git, gh or Jira
- No direct Jira REST calls or stored Jira API tokens in the daemon
- No phased or dual-path migration; no compatibility shims left for the old runGit/github.ts shell-outs
- No support for Jira CLIs other than acli
- No unguarded destructive operations; there is no blanket allow-all bypass for agents
- No auto-approval of destructive calls when no client is attached; they are denied after the timeout
- Typed service layer, with tools as thin adapters
- Shared low-level exec helper only
- Hooks declared inside each tool's own definition
- Event bus: tools emit events, subscribers react
- No hook mechanism now; only guarantee a single call path
- Typed tools for common operations plus a raw passthrough tool per CLI/API
- Generate tools from the CLI help text or OpenAPI spec
- Direct Jira REST via undici with an API token or OAuth stored in daemon config
- Jira via an MCP server the daemon connects to
- Staged: wrappers become thin shims over the registry
- New tools first, migrate call sites per story later
- Synchronous, hook failure fails the tool call
- Asynchronous fire-and-forget
- Single supported CLI: community jira-cli (ankitpokhrel)
- Adapter per CLI behind one tool surface
- Tools return structured JSON by convention; workflow code casts or parses per call site
- Tools return raw CLI text; workflow code parses it
- Explicit opt-in flag per destructive call, enforced by the tool
- Exclude destructive operations from the layer entirely
- Separate destructive tools, hidden from agents by default and enabled via config
- Approval prompt for agent callers only; workflow code declares its destructive ops up front and is pre-authorised by the approved plan
- Destructive tools are refused outright unless the caller passes an explicit per-call confirmation token from the user

## Decisions

- **Tool registry is the layer; workflow calls it through the executor** — The idea names runGit, commitAndPushArtifacts and github.ts in the workflow library on one side and the daemon's separate git_* tool registry on the other.
  - Ruled out: _Typed service layer, with tools as thin adapters_, _Shared low-level exec helper only_
- **Executor-level post-execution hooks keyed by tool name** — Since the point of the layer is a single place for hooks like 'refresh tracker status after a pull or push', how should hooks attach to the tools?
  - Ruled out: _Hooks declared inside each tool's own definition_, _Event bus: tools emit events, subscribers react_, _No hook mechanism now; only guarantee a single call path_
- **Curated typed tool per operation family** — The hook mechanism keys on tool name (decision 2), so every mutating operation must be a distinct named tool, not a subcommand argument inside a generic one.
  - Ruled out: _Typed tools for common operations plus a raw passthrough tool per CLI/API_, _Generate tools from the CLI help text or OpenAPI spec_
- **Shell out to a local Jira CLI (e.g. jira-cli / acli)** — How should the Jira tools authenticate, given the project principle that auth stays with the user's local CLI sessions and the daemon makes no direct cloud REST calls?
  - Ruled out: _Direct Jira REST via undici with an API token or OAuth stored in daemon config_, _Jira via an MCP server the daemon connects to_
- **Full cutover in this change** — How should the existing workflow shell-outs (runGit, commitAndPushArtifacts, github.ts wrappers) and the current git_* tools move onto the consolidated layer?
  - Ruled out: _Staged: wrappers become thin shims over the registry_, _New tools first, migrate call sites per story later_
- **Synchronous, hook failure is non-fatal and reported** — Follows from decision 2 (executor-level post-execution hooks keyed by tool name) and 5 (workflow now depends on the executor for git/gh results, so hook behavior affects workflow correctness).
  - Ruled out: _Synchronous, hook failure fails the tool call_, _Asynchronous fire-and-forget_
- **Single supported CLI: Atlassian's official acli** — Which Jira CLI should the Jira tools wrap, given that the tools must behave deterministically and the daemon cannot support every CLI's differing command surface and output format?
  - Ruled out: _Single supported CLI: community jira-cli (ankitpokhrel)_, _Adapter per CLI behind one tool surface_
- **Each tool declares an output schema; executor validates and a generic typed call helper infers the result type** — The registry is the only layer and the workflow library must call it through the executor, but tools today return generic results while workflow code (e.g. commitAndPushArtifacts, github.ts wrappers) relies on typed return values.
  - Ruled out: _Tools return structured JSON by convention; workflow code casts or parses per call site_, _Tools return raw CLI text; workflow code parses it_
- **Route destructive calls through an approval prompt to the user** — Prior decisions made the registry the single layer shared by agents and workflows with full-operation coverage, so the existing git_* tools' safety posture must be settled explicitly.
  - Ruled out: _Explicit opt-in flag per destructive call, enforced by the tool_, _Exclude destructive operations from the layer entirely_, _Separate destructive tools, hidden from agents by default and enabled via config_
- **Approval request via IPC to whichever client is attached; deny if none within timeout** — Follows from decision 9 (approval prompt for destructive calls) combined with decision 1 (workflows and agents share the same registry).
  - Ruled out: _Approval prompt for agent callers only; workflow code declares its destructive ops up front and is pre-authorised by the approved plan_, _Destructive tools are refused outright unless the caller passes an explicit per-call confirmation token from the user_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `stakeholder` `User's confirmation on 2026-10-23: use the cheap model to convert tool responses to the expected JSON schema; schema validation is the safety net`
