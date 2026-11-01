<!-- insrc:artifact LLD-64703b708590bd68-s1 -->

# LLD: STORY-64703b708590bd68-s1

## Summary

**Epic:** `reject-file-modifying-daemon-calls-do`
**HLD base run:** `wf-1793560988617-vu6v8b`
**HLD effective hash:** `4a3b2b227144...`

The daemon gets one gate, run before a file-modifying RPC method or step phase is dispatched. A table lists those methods and where each keeps its repo and file paths. The gate refuses a call that names no repo, or one that is relative, not registered or not a directory, and it resolves every file path against the named repo and refuses one that leaves it. Handlers no longer fall back to the daemon's INSRC_REPO or working directory. A test compares the table with the registered methods so a new modifying method cannot be added without a row. The MCP server and the terminal client always send an absolute repo.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `requireRepoForCall`

```typescript
requireRepoForCall(method: string, params: unknown, registered: ReadonlySet<string>): RepoCallCheck
```

**Parameters:**
- `method: string` — the RPC method or step phase being dispatched
- `params: unknown` — the call's params as the client sent them
- `registered: ReadonlySet<string>` — the absolute paths of the registered repositories (repo.list)

**Returns:** `RepoCallCheck` — { ok: true, repo, params } with every path param rewritten to an absolute path inside repo, or { ok: false, code, message } naming the first problem

**Errors:**
- `RepoCallRefusal` when returned as ok:false with code repo-missing, repo-not-absolute, repo-not-registered, repo-not-directory or path-outside-repo; never thrown

**Preconditions:**
- method is a key of FILE_MODIFYING_METHODS; for any other method the function is not called

**Postconditions:**
- no handler runs when ok is false
- a relative path param is joined to repo, never to the daemon's working directory
- the daemon's INSRC_REPO and cwd are never read

### 2.2 `FILE_MODIFYING_METHODS`

```typescript
const FILE_MODIFYING_METHODS: Readonly<Record<string, { repoParam: string; pathParams: readonly string[]; repoFromRunToken?: boolean }>>
```

**Returns:** `Readonly<Record<string, RepoCallRule>>` — for each file-modifying RPC method or step phase: the param holding the repo, the params holding file or artifact paths, and whether a later phase may take the repo from its run token

**Postconditions:**
- lists at least workflow.approve, workflow.approvePipeline, workflow.reviewArtifact, workflow.resolveFinding, workflow.resolveComment, workflow.reviewDecision, tracker.sync, tracker.setup, tracker.attach, tracker.syncComments, repo.convert, team.refresh, team.claim, team.release, artifact.feedback.append, artifact.feedback.add and the modifying phases of the workflow, build, review and code-review steps; the plan stage completes the list by reading the registry

### 2.3 `handleWorkflowApprove`

```typescript
handleWorkflowApprove(params: unknown, deps?: WorkflowApproveDeps): Promise<WorkflowApproveResult | { error: string }>
```

**Parameters:**
- `params: unknown` — { repo, artifactPath | epicHash, overrideReview } with repo and a path already checked by the gate
- `deps: WorkflowApproveDeps` _(optional)_ — test seams; the repoEnv argument is removed

**Returns:** `Promise<WorkflowApproveResult | { error: string }>` — as today

**Errors:**
- `none thrown for a missing repo` when the gate has refused the call before this handler runs

**Preconditions:**
- repo is absolute and registered; artifactPath is inside repo

**Postconditions:**
- the repository whose store is written is the named repo, never the one found by walking up from the path (repoOfArtifactPath is no longer used for the target of a write)

### 2.4 `repoSchemaRefusal`

```typescript
repoSchemaRefusal(repo: string | undefined): string | undefined
```

**Parameters:**
- `repo: string | undefined` — the repository to check

**Returns:** `string | undefined` — as today

**Postconditions:**
- runs after the gate, so it never sees a missing repo from a file-modifying call

### 2.5 `approveWorkflow`

```typescript
approveWorkflow(req: { repo: string; artifactPath?: string; epicHash?: string; overrideReview?: string }, deps?: UnaryRpcDeps): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: { repo: string; ... }` — the request the MCP server forwards; repo is now always an absolute path, never ''
- `deps: UnaryRpcDeps` _(optional)_ — test seams

**Returns:** `Promise<WorkflowApproveResult>` — as today

**Errors:**
- `Error` when the daemon refused the call (code and message of the gate)

**Postconditions:**
- the MCP handler (handleWorkflowApprove in src/mcp/server.ts) refuses with the same message before calling when it cannot resolve an absolute repo, and sends artifactPath made absolute against that repo

## 3. Data model changes

### 3.1 `RepoCallRule` — new

One row of FILE_MODIFYING_METHODS: repoParam (the name of the param holding the repo), pathParams (names of params holding a file or artifact path, which the gate rewrites to absolute paths inside the repo), repoFromRunToken (true for a step phase after the first, whose run token records the repo the run started on).

**Call sites:**
- `src/daemon/handler-runtime.ts:446-456`
- `src/daemon/steps/resolve-repo.ts`

### 3.2 `RepoCallCheck` — new

The result of the gate: ok with the checked repo and the rewritten params, or a refusal with a code (repo-missing, repo-not-absolute, repo-not-registered, repo-not-directory, path-outside-repo) and a message that names the method and the param.

**Call sites:**
- `src/daemon/repo-schema-guard.ts:28-47`

### 3.3 `workflow.approve and the other file-modifying RPC methods` — invariant-change

A call whose params carry no repo used to fall back to the daemon process's INSRC_REPO (and, for a single artifact, to the repository found from the path). It is now refused. The invariant that changes is 'a missing repo is resolved by the daemon'. Callers that relied on it (cron or headless scripts that set only INSRC_REPO in the daemon's environment) must send repo.

**Call sites:**
- `src/daemon/handler-runtime.ts:424-425`
- `src/daemon/handler-runtime.ts:446-456`
- `src/daemon/handler-runtime.ts:479-493`
- `src/daemon/workflow-approve.ts:28-62`
- `src/daemon/lifecycle-registry.ts:60-68`

## 4. Error paths

**Error cases**

- **A file-modifying call names no repo** (recoverable)
  - Detection: requireRepoForCall finds the rule's repo param absent, not a string, or empty
  - Response: the call is refused with code repo-missing and a message naming the method and the param; the handler does not run
  - User impact: The caller is told which param to send; nothing is written anywhere
- **The repo is relative, or is not a directory** (recoverable)
  - Detection: the gate checks isAbsolute(repo) and a directory stat
  - Response: refused with repo-not-absolute or repo-not-directory
  - User impact: A clear error instead of a write relative to the daemon's working directory
- **The repo is not registered** (recoverable)
  - Detection: the absolute path is not in the set built from the registry (repo.list)
  - Response: refused with repo-not-registered, naming repo.add
  - User impact: A write into a checkout the daemon does not manage (for example its own install directory) cannot happen
- **An artifact path leaves the repo** (recoverable)
  - Detection: after joining a relative path to the repo and normalising, the path is not inside the repo (a relative path with .. or an absolute path elsewhere)
  - Response: refused with path-outside-repo naming the param
  - User impact: The approval or write is not applied to another repository's file
- **A step phase after the first carries only a run token** (recoverable)
  - Detection: the rule has repoFromRunToken and the params carry state but no repo
  - Response: the repo is the one the run's token recorded when the run started, and the gate still checks it is registered; a token that records no repo is refused with repo-missing
  - User impact: A multi-turn run continues without resending the repo, and cannot be redirected to another repository
- **A file-modifying method is added without a row in the table** (recoverable)
  - Detection: the test that lists the registered RPC methods and step phases and compares them with FILE_MODIFYING_METHODS and a reviewed list of read-only methods fails
  - Response: the build fails until the method is classified
  - User impact: No user impact; the omission is caught before release
- **The registry is unreachable when the gate looks up the registered repos** (recoverable)
  - Detection: repo.list throws or times out inside the gate
  - Response: the call is refused with repo-not-registered and the cause; it is never allowed through, and never falls back to INSRC_REPO
  - User impact: A broken registry stops writes rather than allowing a misrouted one

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An absolute artifactPath inside the named repo | accepted unchanged |
| A relative artifactPath such as .insrc/artifacts/X.json with an absolute registered repo | joined to the repo and accepted; the daemon's working directory is not consulted |
| A symlink inside the repo that points outside it | the real path is checked, so it is refused with path-outside-repo |
| A repo given with a trailing slash or a different case on a case-insensitive file system | normalised before the registry comparison |
| An epicHash batch with a repo | accepted; there is no path param to rewrite |
| A read-only method (workflow.pending, search.query, artifact.get) with no repo | not in the table, so the gate is not applied and the call behaves as today |
| A client that sets only INSRC_REPO in the daemon's environment | its file-modifying calls are refused with repo-missing; the error text says to send repo |
| repo.convert | in the table; it names the repo it converts and is exempt only from the unconverted-repo schema guard, not from this gate |

**Invariants to preserve**

- A call that names an absolute registered repo and paths inside it behaves exactly as before [[c1]]
- The repo-schema guard still refuses an unconverted repo for every artifact entry point except repo.convert [[c4]]
- Read-only calls keep their session-aware repo resolution (explicit repo, then the registered repo containing the caller's cwd, then INSRC_REPO) [[c4]]
- The MCP server keeps resolving the session workspace on its own side to fill in repo, so an agent in a registered repo does not have to pass it [[c3]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), tests co-located in __tests__`

**Test levels**

- **unit** — The gate and its table
  - Subjects: `requireRepoForCall: a missing, empty, relative, non-directory and unregistered repo are each refused with their code; a relative path is joined to the repo; a path with .. or an absolute path elsewhere and a symlink that leaves the repo are refused; a run-token phase takes the recorded repo; a registry failure refuses`, `FILE_MODIFYING_METHODS against the registered RPC methods and step phases: every registered method is either a row or on a reviewed read-only list, and every row names a registered method`
  - Fixtures: `temp directories as registered and unregistered repos`, `a fake registry set`
- **integration** — The daemon dispatch, the handlers and the MCP forward
  - Subjects: `a daemon started with INSRC_REPO set and its working directory inside a registered repo: workflow.approve with a relative artifactPath and no repo is refused and writes nothing in either repository (the 2026-11-01 case)`, `workflow.approve with an absolute registered repo and a relative path approves the artifact in that repo's store only`, `each method in the table called with no repo is refused and leaves the file system unchanged`, `insrc_workflow_approve through the MCP handler sends an absolute repo and an absolute artifactPath, and refuses when it cannot resolve one`, `the terminal client's approve, tracker sync and attach calls send repo`
  - Fixtures: `a daemon dispatcher with the real gate and a stub handler per method`, `two temp repos, one registered as the daemon's cwd`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `each method in the table called with no repo is refused and leaves the file system unchanged (integration)`, `requireRepoForCall refuses a missing and an empty repo (unit)` |
| `ac2` | `a daemon with INSRC_REPO set and its cwd inside a registered repo refuses workflow.approve with no repo (integration)`, `requireRepoForCall never reads the daemon's INSRC_REPO or cwd (unit)` |
| `ac3` | `requireRepoForCall refuses a relative, non-directory or unregistered repo, a path outside the repo and a symlink that leaves it (unit)`, `workflow.approve with an absolute registered repo and a relative path approves in that repo only (integration)` |
| `ac4` | `every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method (unit)` |

## 6. Migration

**State before:** The daemon's RPC registry passes its own INSRC_REPO as the fallback repo to the file-modifying methods, each handler repeats its own check and message, handleWorkflowApprove takes the repository of a single artifact from the path (walking up from dirname with existsSync, so a relative path resolves against the daemon's working directory), and the MCP server forwards repo ?? '' and the path as given (s1 bundles 1 to 3).

**State after:** A table names every file-modifying method; one gate before dispatch refuses a call with no absolute registered repo and rewrites or refuses every path against it; handlers receive the checked repo; the MCP server and the terminal client always send an absolute repo and absolute paths; a test keeps the table and the registered methods in step.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the gate, the table and their unit tests, with the table built from the registry and the gate not yet called by the dispatcher — ↩ rollbackable
2. Make the MCP server and the terminal client send an absolute repo and absolute artifact paths for every method in the table (they already resolve the session workspace, so an agent in a registered repo sends the same repo as before) — ↩ rollbackable
3. Switch the dispatcher to call the gate for every method in the table and remove the process.env['INSRC_REPO'] argument from those handlers and their own fallback checks — ↩ rollbackable _(needs: `step 2 released in the MCP server and the terminal client`)_
4. Apply the gate to the modifying phases of the workflow, build, review and code-review steps, taking the repo of a later phase from its run token — ↩ rollbackable
5. Reset the daemon clone's stray artifact changes left by earlier misrouted approvals and verify that the installed daemon's checkout has no uncommitted .insrc/artifacts files — ✕ non-rollbackable

**Backward compat:** The RPC and MCP input shapes do not change: repo already exists as a param. What changes is that an omitted or empty repo, which was accepted, is refused for the listed methods. Clients that send repo are unaffected. A cron or headless script that relied on INSRC_REPO in the daemon's environment must send repo; the refusal message says so. Read-only methods keep their session-aware resolution.

## 7. Alternatives considered

### 7.1 a1: One declared table and one gate before dispatch — **CHOSEN**

A table lists every file-modifying daemon method with where its repo and file paths are in the params; one gate runs before the handler, refuses a call with no absolute registered repo, and resolves or checks every path against it.

A module in src/daemon holds FILE_MODIFYING_METHODS, a table keyed by RPC method name. Each row says which param is the repo, which params are file or artifact paths, and whether the repo may come from a run token (state) instead. The RPC dispatcher calls one function, requireRepoForCall(method, params), before it runs the handler. The function refuses when the repo is missing, empty, not absolute or not in the registry (repo.list), and rewrites every named path: a relative path is joined to the repo, and an absolute or resolved path outside the repo is refused. The handlers lose their process.env['INSRC_REPO'] fallback and receive the checked repo. A test lists every registered method and fails when a method that is not in the table writes a file (the table is the source, the registry is checked against it), so a new handler cannot skip the rule. Step handlers (workflow-step, build-step, review and code-review steps) get the same gate for their modifying phases; a later phase that carries only a run token takes the repo the run started on. The MCP server and the terminal client always send the repo they resolved (the MCP session workspace stays a convenience on the client side only).

### 7.2 a2: A shared helper each handler calls

Replace each INSRC_REPO fallback with a call to one requireRepo helper inside the handler.

Add requireRepo(params, opts) next to the repo schema guard. It refuses a missing, relative or unregistered repo and resolves paths against it. Each file-modifying handler calls it as its first line in place of its own check, and handler-runtime.ts stops passing process.env['INSRC_REPO']. There is no table and no dispatcher gate.

**Rejected because:** Meets the rule for the handlers it is applied to, but nothing keeps a new or forgotten handler honest.

### 7.3 a3: Take the repo away from the daemon process

Start the daemon with no INSRC_REPO and a neutral working directory so nothing resolves against its clone.

The daemon launcher unsets INSRC_REPO and starts the process in a directory that is not a repository. A relative path then finds no .insrc/artifacts and fails.

**Rejected because:** A mitigation, not the rule: it does not make the repo mandatory.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: how a repo is chosen for a daemon RPC today (src/daemon/handler-runtime.ts:424-425; src/daemon/handler-runtime.ts:446-456; src/daemon/handler-runtime.ts:479-493; src/daemon/repo-convert.ts:37; src/daemon/tracker-attach.ts:34; src/daemon/tracker-sync-comments.ts:35; src/daemon/workflow-rpc.ts:418-420)`
- **[[c2]]** `analyze-bundle` `s1: how workflow.approve turns an artifact path into a repository (src/daemon/workflow-approve.ts:28-62; src/daemon/lifecycle-registry.ts:60-68)`
- **[[c3]]** `analyze-bundle` `s1: what the MCP server sends for an approval (src/mcp/server.ts:773-860; src/mcp/server.ts:985-1014; src/mcp/resolve-repo.ts; src/mcp/daemon-stream.ts:306-313)`
- **[[c4]]** `analyze-bundle` `s1: the existing shared guards (src/daemon/repo-schema-guard.ts:28-47; src/daemon/steps/resolve-repo.ts; src/shared/resolve-repo-core.ts)`
- **[[c5]]** `doc` `docs/standalone/reject-file-modifying-daemon-calls-do-E2026110164703b70/ISSUE.md`

## 9. Open questions

- Which RPC methods and step phases modify files was taken from the registry listing in handler-runtime.ts and not checked method by method (sbdry4, partial); the plan stage completes and verifies the table.
- The Story has no acceptance criteria of its own; ac1 to ac4 in the test mapping stand for the four requirements of ISSUE-64703b708590bd68 (ts1, partial).
