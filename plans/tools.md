# Tools -- Unified Capability System

> Supersedes `plans/research/delegate-tasks.md` (deleted). That plan
> treated "delegate tasks" as a separate concept from LLM tools; in
> practice they are the same thing from two different callers. This
> plan unifies them.

## Problem

Today we have two parallel registries for executable capabilities:

- **LLM tools** at [src/insrc/agent/tools/registry.ts](../src/insrc/agent/tools/registry.ts) /
  [executor.ts](../src/insrc/agent/tools/executor.ts). Invoked by the LLM via the
  tool-call protocol (Read, Grep, Glob, Bash, WebSearch, WebFetch, ...). Schema
  is JSON Schema so the model can emit structured calls. Approval is
  implicit through risk classification in `tools/validator.ts`.
- **Delegates** at [src/insrc/daemon/delegates/registry.ts](../src/insrc/daemon/delegates/registry.ts) /
  `delegates/*.ts`. Invoked by controllers via `kind: 'delegate'` tasks.
  Input is untyped. Approval is explicit via `requiresApproval` +
  `buildApprovalGate` hooks.

The boundary leaks:

1. **Same capability, two registrations.** `WebSearch` exists as a tool
   (with a stubbed-out `[WebSearch] No BRAVE_API_KEY configured...`
   fallback) and as `web-search` / `web-search:brave` / `web-search:claude`
   delegates. The tool version punts to the delegate version at runtime.
2. **Approval UX diverges.** Tools rely on permission-mode + risk
   heuristics; delegates use a proper gate with Approve / Skip / Edit.
   The LLM path has no way to surface an Edit action today.
3. **New surfaces (git actions, jira actions, file actions) need to be
   callable from both paths.** Writing them twice is wasteful and risks
   drift.

## Proposal: One `Tool` interface, two entry paths

A single `Tool` (= "capability") is registered once and exposed to both
callers. Same schema, same execution, same approval flow.

```typescript
interface Tool {
  /** Unique ID. Namespacing convention: 'domain:action' for sub-handlers. */
  id: string;

  /** Human-readable description -- surfaced to both LLM and user-facing gate. */
  description: string;

  /**
   * JSON Schema for the input. Used to:
   *  - generate the LLM tool-call schema,
   *  - validate controller-supplied input before execute(),
   *  - show an "Edit" form in the approval gate.
   */
  inputSchema: JSONSchema;

  /** When true, a gate fires before execute(). Can be a predicate over input. */
  requiresApproval?: boolean | ((input: unknown) => boolean);

  /** Build the approval gate content from the input (query preview, risk, etc.). */
  buildApprovalGate?(input: unknown): { title: string; content: string; actions: GateAction[] };

  /** Apply user's edit feedback to input before re-gating. Defaults to { ...input, query: feedback }. */
  applyEdit?(input: unknown, feedback: string): unknown;

  /** Do the work. */
  execute(input: unknown, deps: ToolDeps): Promise<ToolResult>;
}

interface ToolDeps {
  session: Session;
  channel: Channel;
  send: (msg: IpcStreamMessage) => void;
  requestId: number;
  /** Signal set when the caller is cancelled. */
  signal: AbortSignal;
}

interface ToolResult {
  output: string;
  format: TaskFormat;     // 'text' | 'markdown' | 'code' | ...
  success: boolean;
  error?: string;
  /** Structured data some callers care about (e.g. web search result array). */
  data?: unknown;
}
```

### Entry path A: LLM tool-call

Tool-loop already shapes the LLM's call into `{ name, input }`. Adapter:

1. Look up tool by `name` -> `id`.
2. Validate `input` against `inputSchema`. Reject malformed calls with a
   helpful error string so the model can self-correct.
3. If `requiresApproval` is truthy for this input, fire the approval gate
   through the session channel (same mechanism delegates use today).
4. Run `execute()`. Stream progress via `send`.
5. Return `output` (stringified if `data` was structured) to the
   tool-loop as the tool result.

### Entry path B: Controller task

Replace `kind: 'delegate'` with `kind: 'tool'` (keep `'delegate'` as an
alias for one release to avoid breaking the brainstorm / research
controllers mid-migration).

```typescript
// Task
{
  kind: 'tool',
  toolId: 'web-search',
  toolInput: { query: '...' },
  description: 'Web search: ...',
  stateKey: K.FINDINGS,
}
```

Execution goes through the same registry + approval + execute pipeline
as path A. The only difference from path A is that the caller is a
controller, not the LLM.

## What moves where

| Current home | Moves to |
|--------------|----------|
| `agent/tools/registry.ts` (LLM tool defs) | `daemon/tools/registry.ts` (unified) |
| `agent/tools/executor.ts` (builtin* handlers) | `daemon/tools/builtins/*.ts` (one file per tool) |
| `daemon/delegates/registry.ts` | Deleted. `executeDelegate` becomes a thin compat shim that calls `executeTool`. |
| `daemon/delegates/web-search.ts` | `daemon/tools/builtins/web-search.ts` |
| `agent/tools/validator.ts` (permission / risk) | Pushed into `Tool.requiresApproval` predicates. Risk ladder becomes a helper that tools opt into. |

The move from `agent/tools/` to `daemon/tools/` is deliberate: tools need
daemon-only capabilities (session, channel, stream) to support
approval + progress. The LLM path stays in `agent/` but imports the
registry from `daemon/tools/`.

## Tools catalog (post-migration)

Once the unified registry is live, every capability below is
implemented **once** and surfaces to both the LLM (via tool-call) and
controllers (via `kind: 'tool'` tasks). Tools marked as "Yes" fire the
Approve / Skip / Edit gate before executing.

Approval column:
- **No** -- read-only, no gate
- **Yes** -- mutating, gate fires with diff/command preview
- **Config** -- gated behavior depends on permission mode + risk tier

### Shell

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `shell:exec` | Run a single command | Config (risk-tier) | Replaces `Bash`. Low-risk commands (ls, cat, grep, git status) auto-run in `auto-accept` mode. Medium/high always gate. |
| `shell:exec-detached` | Long-running command with streaming output | Yes | For dev servers, watchers. Returns a job handle; output tails via `stream: progress`. |
| `shell:exec-pipeline` | Run a scripted sequence (bash -c with multiple stages) | Yes | For complex flows; whole script shown in gate. |
| `shell:cwd` | Change execution cwd for subsequent calls | No | Session-scoped. |

### File IO

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `file:read` | Read file contents (range-aware) | No | Replaces `Read`. Honors smart-read (entity summaries for big files). |
| `file:write` | Write / overwrite file | Yes | Replaces `Write`. Gate shows full diff vs current. |
| `file:edit` | Find-and-replace within a file | Yes | Replaces `Edit`. Strict match semantics. |
| `file:multi-edit` | Multiple edits in one file | Yes | Replaces `MultiEdit`. |
| `file:delete` | Remove file | Yes | |
| `file:move` | Rename / move file | Yes | Refuses cross-device if not same repo. |
| `file:copy` | Copy file | Yes | |
| `file:mkdir` | Create directory | Yes | |
| `file:stat` | Metadata (size, mtime, kind) | No | Lightweight, for scripting. |

### Search (local filesystem)

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `search:glob` | Filename pattern (`**/*.ts`) | No | Replaces `Glob`. Sorted by mtime. |
| `search:grep` | Content regex | No | Replaces `Grep`. ripgrep-backed. |
| `search:list-dir` | Directory listing | No | Replaces `ListDirectory`. |
| `search:graph` | Semantic search over indexed code entities | No | Replaces `graph_search`. LanceDB ANN. |
| `search:graph-query` | Cypher query against code knowledge graph | No | Replaces `graph_query`. |
| `search:recent` | Files modified in last N minutes | No | Handy for "what did I touch" flows. |

### Git (code actions)

Read-only git tools are ungated; anything mutating requires approval.
Destructive commands (force push, reset --hard) additionally prompt
with an explicit danger label in the gate content.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `git:status` | Porcelain status | No | |
| `git:log` | Commit history (filtered) | No | |
| `git:diff` | Unstaged / staged / commit diff | No | |
| `git:show` | Show a commit | No | |
| `git:blame` | Line-level authorship | No | |
| `git:stage` | `git add` paths | Yes | |
| `git:unstage` | `git restore --staged` | Yes | |
| `git:commit` | Create commit (message, author) | Yes (diff + message preview) | Refuses when detached HEAD unless explicit flag. |
| `git:amend` | Amend previous commit | Yes (warns if already pushed) | |
| `git:branch` | List / create / switch branch | Create/switch: Yes | List: No. |
| `git:checkout` | Checkout path / ref | Yes | Destructive -- overwrites uncommitted changes. |
| `git:merge` | Merge ref into current | Yes | Surfaces conflict state. |
| `git:rebase` | Rebase onto ref (no interactive) | Yes | Blocks `-i` -- not supported in automated flows. |
| `git:stash` | Push / pop / list stash | Push/pop: Yes. List: No. | |
| `git:push` | Push to remote | Yes (warns on force, blocks force-push to main) | Respects per-repo protected-branch config. |
| `git:pull` | `git pull --ff-only` by default | Yes | |
| `git:fetch` | Fetch refs | No | Network-only, no ref updates to tracking branches beyond fetch. |
| `git:reset` | Soft / mixed / hard reset | Yes (hard adds a red confirm) | |
| `git:revert` | Revert commit | Yes | |
| `git:cherry-pick` | Apply commit from another ref | Yes | |
| `git:tag` | List / create / delete tag | Create/delete: Yes | |
| `git:remote` | List / add / remove remote | Add/remove: Yes | |
| `git:worktree` | Add / remove worktree | Yes | |

### GitHub (via `gh` CLI + REST/GraphQL)

`gh` is already installed on most dev machines and handles auth. Tools
shell out to `gh` for CLI-shaped actions and hit REST/GraphQL directly
for bulk queries. Requires `GH_TOKEN` or `gh auth login`.

#### Issues

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `gh:issue:list` | List / filter / search issues | No |
| `gh:issue:view` | View an issue (body, comments, metadata) | No |
| `gh:issue:create` | Open an issue (title, body, labels, assignees) | Yes |
| `gh:issue:comment` | Add comment | Yes |
| `gh:issue:edit` | Edit title / body / labels / assignees | Yes |
| `gh:issue:close` | Close with optional reason | Yes |
| `gh:issue:reopen` | Reopen | Yes |
| `gh:issue:link` | Link to PR / other issue | Yes |

#### Pull Requests

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `gh:pr:list` | List / filter PRs | No |
| `gh:pr:view` | PR body + checks + review status | No |
| `gh:pr:diff` | Unified diff | No |
| `gh:pr:checks` | CI check status | No |
| `gh:pr:files` | Changed files + per-file stats | No |
| `gh:pr:create` | Open PR (title, body, base, draft flag) | Yes |
| `gh:pr:edit` | Edit title / body / labels / reviewers | Yes |
| `gh:pr:comment` | Top-level comment | Yes |
| `gh:pr:review` | Submit review (APPROVE / REQUEST_CHANGES / COMMENT) | Yes |
| `gh:pr:merge` | Merge (squash / rebase / merge-commit) | Yes | Respects branch-protection rules. |
| `gh:pr:close` | Close without merge | Yes |
| `gh:pr:ready` | Mark draft PR ready for review | Yes |

#### Projects v2 (GraphQL -- classic projects are deprecated)

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `gh:project:list` | List projects in org / user | No | |
| `gh:project:view` | View a project (columns, fields, items) | No | |
| `gh:project:item-list` | List items in a project (filter by status/field) | No | |
| `gh:project:item-add` | Add issue / PR / draft to project | Yes | |
| `gh:project:item-update` | Set field values (status, priority, iteration, custom) | Yes | |
| `gh:project:item-archive` | Archive item | Yes | |
| `gh:project:item-delete` | Remove from project | Yes | |
| `gh:project:field-list` | List available fields + options | No | |

#### Actions / Workflows

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `gh:run:list` | Recent workflow runs | No |
| `gh:run:view` | Run details + failed step logs | No |
| `gh:run:rerun` | Re-run (failed jobs or all) | Yes |
| `gh:run:cancel` | Cancel in-progress run | Yes |
| `gh:workflow:list` | List workflows in repo | No |
| `gh:workflow:run` | Dispatch a workflow (with inputs) | Yes |

#### Releases

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `gh:release:list` | List releases | No |
| `gh:release:view` | Release details | No |
| `gh:release:create` | Create release (tag, title, notes, draft, prerelease) | Yes |
| `gh:release:edit` | Edit notes / flags | Yes |
| `gh:release:publish` | Publish a draft | Yes |
| `gh:release:delete` | Delete release | Yes |

#### Repository

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `gh:repo:view` | Repo metadata | No |
| `gh:repo:list` | List user / org repos | No |
| `gh:repo:create` | Create repo | Yes |
| `gh:repo:fork` | Fork | Yes |
| `gh:repo:delete` | Delete (dangerous) | Yes (extra confirm) |
| `gh:repo:clone` | Clone locally | Yes |

### Web

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `web:search` | Web search (Brave -> Claude fallback with approval) | Config | Replaces `WebSearch`. |
| `web:fetch` | Fetch URL body | No | Replaces `WebFetch`. Cached on disk for the session. |

### LSP / language services  (BACKLOG)

Deferred: the IDE side (`IInsrcLSPToolService`) is wired and the
bridge file (`lspToolBridge.ts`) exists, but the daemon IPC is
one-directional today -- the daemon has no way to send requests
*back* to the connected IDE. Building the tools requires the
reverse-RPC plumbing first. See `plans/lsp-integration.md`.

Scope when picked up:

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `lsp:go-to-definition` | Resolve symbol -> file:line | No |
| `lsp:find-references` | All references of a symbol | No |
| `lsp:workspace-symbols` | Symbol search across repo | No |
| `lsp:document-symbols` | Outline of one file | No |
| `lsp:hover` | Hover info (type, docs) | No |
| `lsp:rename` | Rename symbol (workspace edit) | Yes (diff preview) |
| `lsp:code-actions` | List quick-fixes / refactors at position | No |
| `lsp:apply-code-action` | Apply a code-action by ID | Yes |
| `lsp:diagnostics` | Current errors / warnings for a file or workspace | No |

### Testing / build

Thin wrappers around `shell:exec` with result parsing so the LLM gets
structured output instead of raw logs.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `test:run` | Run detected test framework (jest/vitest/mocha/pytest/go test/cargo test) | Yes | Parses failures into `[{ file, line, message }]`. |
| `test:focus` | Run tests matching name pattern | Yes | |
| `build:run` | `npm run build` / `cargo build` / `go build` | Yes | |
| `lint:run` | eslint / ruff / golangci-lint | Yes | Returns structured findings. |
| `format:run` | prettier / black / gofmt | Yes | Dry-run preview in gate. |

### Package managers

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `pkg:install` | Install dependency (auto-detect npm/pip/cargo/go) | Yes |
| `pkg:remove` | Remove dependency | Yes |
| `pkg:update` | Update dependency | Yes |
| `pkg:audit` | Security / vulnerability audit | No |
| `pkg:list` | List installed deps | No |
| `pkg:why` | Explain why a dep is present (npm ls / cargo tree) | No |

### Docker / containers (optional, register only when daemon detects docker CLI)

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `docker:ps` | List containers | No |
| `docker:logs` | Tail container logs | No |
| `docker:exec` | Run command inside container | Yes |
| `docker:compose-up` | Start compose stack | Yes |
| `docker:compose-down` | Stop compose stack | Yes |

### Database / schema (opt-in via config)

| Tool ID | Purpose | Approval |
|---------|---------|----------|
| `db:schema` | Introspect tables / columns | No |
| `db:query` | Run SELECT | Yes (auto-approve for explicit read-only mode) |
| `db:mutate` | Run INSERT / UPDATE / DELETE | Yes |

### Jira  (BACKLOG)

Deferred: non-blocking for the current system-action push. Picked
up once a customer actually needs the hooks; scope sits here ready
to implement.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `jira:search` | JQL query | No | Requires `JIRA_URL` + token. |
| `jira:view` | View issue | No | |
| `jira:create` | Create issue | Yes | |
| `jira:comment` | Add comment | Yes | |
| `jira:transition` | Move state | Yes | |
| `jira:assign` | Assign user | Yes | |
| `jira:link` | Link issues | Yes | |

### SSH / remote

Run commands on a remote host. Uses the system `ssh` client so the
user's existing `~/.ssh/config` + agent + keys just work.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `ssh:exec` | Run command on remote host | Yes (host + command shown in gate) | Uses `~/.ssh/config` aliases; `host` input can be an alias or `user@host[:port]`. |
| `ssh:exec-detached` | Long-running remote command with streamed output | Yes | For tailing remote logs, running remote builds. |
| `scp:upload` | Copy local file(s) to remote | Yes | |
| `scp:download` | Copy remote file(s) to local | No | Downloads are read-only from the user's perspective, but high-risk paths (over 50 MB, `/etc`, `/var/log`) require approval. |
| `ssh:port-forward` | Open SSH tunnel | Yes | Session-scoped; torn down when chat closes. |

### HTTP / REST

Generic HTTP client for API exploration when `web:fetch` is too
narrow. `web:fetch` stays for "just give me the rendered body"; this
category exposes headers, methods, auth, structured responses.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `http:get` | GET request with query params + headers | No | Read-only. Mocks / localhost exempt from any gating. |
| `http:post` | POST with JSON or form body | Yes | Body + endpoint shown in gate. |
| `http:put` | PUT | Yes | |
| `http:patch` | PATCH | Yes | |
| `http:delete` | DELETE | Yes (extra confirm) | |
| `http:request` | Generic (any method + body + headers) | Yes | Escape hatch for non-standard methods (MKCOL, etc.). |
| `http:curl-import` | Parse a `curl ...` string into a typed request | No | Lets the LLM take a user-pasted curl command and turn it into a subsequent `http:*` call. |

All `http:*` tools honor a per-session allowlist: unknown hosts require
approval, known hosts (localhost, plus a user-configurable list) run
without a gate for GET.

### Kubernetes

Wraps `kubectl`. Registers only when the CLI is on PATH. All
mutating tools respect the current kubeconfig context -- the gate
content shows `cluster / namespace / resource` so an accidental prod
click is obvious.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `k8s:context-list` | List contexts | No | |
| `k8s:context-switch` | Switch active context | Yes | Warns on prod-flagged contexts. |
| `k8s:get` | `kubectl get <kind>` | No | Pods, services, deployments, etc. |
| `k8s:describe` | `kubectl describe <kind>/<name>` | No | |
| `k8s:logs` | Pod logs (optionally streamed / follow) | No | |
| `k8s:exec` | `kubectl exec` into pod | Yes | |
| `k8s:port-forward` | Port-forward pod/svc | Yes | Session-scoped. |
| `k8s:apply` | `kubectl apply -f` | Yes (diff preview via `kubectl diff`) | Blocks if context is prod unless `--confirm-prod` in input. |
| `k8s:delete` | `kubectl delete` | Yes (extra confirm) | |
| `k8s:rollout-restart` | `kubectl rollout restart` | Yes | |
| `k8s:rollout-undo` | `kubectl rollout undo` | Yes | |
| `k8s:top` | `kubectl top pods / nodes` | No | |

### Cloud CLIs (AWS / GCP / Azure)

Thin wrappers around `aws` / `gcloud` / `az`. Same allowlist-by-default
stance as kubernetes: reads are cheap, mutations gate with the full
command + target resource.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `aws:exec` | Run `aws ...` command | Config (risk) | Reads (get/list/describe) auto-run; writes / deletes gate. |
| `aws:s3-ls` | List / head S3 objects | No | |
| `aws:s3-cp` | Copy S3 object (up/down) | Yes | |
| `aws:logs-tail` | CloudWatch Logs tail | No | |
| `gcloud:exec` | Run `gcloud ...` command | Config (risk) | Same read-vs-write split. |
| `gcloud:logs-tail` | Cloud Logging tail | No | |
| `az:exec` | Run `az ...` command | Config (risk) | |
| `az:logs-tail` | Azure Monitor log stream | No | |

Each provider registers only when its CLI is detected on PATH, to
avoid cluttering the LLM's tool list on machines without them.

### Diff / patch (outside git)

For proposing or applying patches to files that aren't yet committed,
working with external patch sets, or showing changes in chat.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `diff:files` | Unified diff between two files / two strings | No | |
| `diff:dirs` | Recursive diff between two directories | No | |
| `patch:generate` | Build a patch from pending edits in the agent session | No | Useful when the LLM wants to hand a patch back to the user for review. |
| `patch:apply` | Apply a patch to the working tree | Yes | 3-way apply; surfaces conflicts in gate content. |
| `patch:reverse` | Reverse-apply | Yes | |

### Notifications (Slack / Discord / email)

Explicit outbound messaging. Always gated with the full rendered
message + destination -- nobody wants the LLM paging on-call at 3 a.m.

| Tool ID | Purpose | Approval | Notes |
|---------|---------|----------|-------|
| `slack:send` | Post to a Slack channel / user | Yes | Requires `SLACK_TOKEN`. Gate shows rendered message + target. |
| `slack:reply` | Thread reply to a message (by ts) | Yes | |
| `slack:search` | Search messages | No | |
| `discord:send` | Post to channel via webhook or bot token | Yes | |
| `email:send` | Send email (SMTP or provider API) | Yes (extra confirm) | Off by default; requires explicit config. |

### MCP tools

External MCP server tools keep their existing contract but flow through
the unified registry as dynamic entries. No change for MCP users.

---

All existing LLM tools (`Read`, `Grep`, `Glob`, `Bash`, `WebSearch`,
`WebFetch`, `ListDirectory`, `graph_search`, `graph_query`, `MultiEdit`)
are kept as stable aliases to their new canonical IDs for one release
so models trained on the old schema still work.

## Migration stages

1. **Types + skeleton** (`daemon/tools/types.ts`, `daemon/tools/registry.ts`,
   `daemon/tools/executor.ts`). No migration yet -- just the new
   interfaces. **[done]**
2. **Dual-write**. For each existing tool / delegate, register a `Tool`
   entry alongside the legacy registration. Both paths keep working.
   **[done]**
3. **Fold registries**. Rewrite `executeDelegate` and the LLM tool
   executor to look up in the unified registry. Legacy interfaces become
   thin shims.
   - 3a: `executeDelegate` fold. **[done]**
   - 3b: LLM tool executor fold. **[in progress]**
4. **Controllers migrate**. Replace `kind: 'delegate'` with `kind: 'tool'`
   in research / pair / delegate controllers. The old kind stays as an
   alias for one release. **[done]**
5. **New tools land**. git / jira / file / shell system-action tools
   get implemented as first-class `Tool`s. **[done for shipped
   domains]** -- see below.
6. **Remove shims**. Drop `daemon/delegates/` entirely, drop the legacy
   LLM tool interfaces, drop `kind: 'delegate'`. **[done]**

### Stage 5 -- shipped vs deferred

| Domain | Status | Tool count |
|--------|--------|------------|
| git | done | 22 |
| file | done | 9 |
| shell | done | 4 |
| search | done | 6 |
| gh | done | 46 |
| ssh | done | 5 |
| http | done | 4 |
| k8s | done | 6 |
| cloud:aws | done | 28 |
| cloud:gcp | done | 20 |
| cloud:az | done | 18 |
| diff-patch | done | 4 |
| notifications | done | 4 |
| test | done | 3 |
| pkg | done | 5 |
| lsp | **backlog** -- needs reverse-RPC | -- |
| jira | **backlog** -- no customer asks yet | -- |

Each stage is independently committable; 2 and 3 are the longest.

## Approval UX unification

The three-action gate (Approve / Skip / Edit) from the new web-search
flow becomes the default for every mutating tool. Controllers already
render this via `channel.registerExternalGate`; the LLM tool-loop will
re-use the same mechanism by exposing `deps.channel` to each tool's
execute().

Consequence: the LLM can trigger a Bash call, the user sees the diff +
command, approves or edits, and the tool-loop continues -- the same
flow a brainstorm / pair agent gets today.

## Compatibility promise

- Tool IDs stay stable. `WebSearch` (tool) and `web-search` (delegate)
  both resolve to the same underlying Tool during migration; the tool
  side eventually consolidates on `web-search` with `WebSearch` as an
  alias for one release.
- Controller task format stays stable: a `kind: 'delegate'` task with
  `delegateTo: 'web-search'` continues to work until stage 6.
- External callers of the daemon RPC are unaffected -- tools are an
  internal concept.

## Verification per stage

| Stage | How we know it works |
|-------|----------------------|
| 1 | Compile clean, no runtime callers. |
| 2 | Each legacy callsite + the unified registry produces the same output. Spot-check one tool + one delegate end-to-end. |
| 3 | Legacy shims pass through. All existing flows (research web search, pair debug, brainstorm convergence) work unchanged. |
| 4 | Controllers emit `kind: 'tool'` tasks; `kind: 'delegate'` still accepted by the orchestrator. |
| 5 | Each new tool has a smoke test hitting both entry paths. |
| 6 | `grep -rn "kind: 'delegate'"` is empty. `daemon/delegates/` is gone. |

## Open questions

- **Where does risk classification live?** Today `tools/validator.ts`
  has a risk ladder (low/medium/high) feeding permission mode. In the
  unified model, should risk be a field on `Tool`, a predicate the tool
  provides, or a cross-cutting policy enforced by the executor? Leaning
  predicate -- each tool knows its own risk best, but the executor
  consults a global policy for auto-accept.
- **Schema validation strategy.** JSON Schema via `ajv` is the obvious
  pick but adds ~60 KB. Alternative: a hand-rolled schema checker for
  the small surface we actually use. Leaning `ajv` for the LLM-facing
  clarity it gives.
- **MCP tools.** MCP currently registers external tools into the LLM
  tool-loop. Post-migration, each MCP server's tools become dynamic
  entries in the unified registry. No change for existing MCP users.
