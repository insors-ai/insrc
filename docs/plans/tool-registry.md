# One tool registry for git, gh and Jira — decisions and verified facts

Epic: `one-tool-registry-git-gh-jira` (DEF-b7a68147dcf72034, docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/). Spec: SPEC-0b8e02355ad3f578 (docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md), approved 2026-10-23. Triage: epic, route define.

## Decisions (brainstorm, 2026-10-23)

1. The daemon's tool registry is the single layer; the workflow library calls it through the executor. No separate typed library.
2. Cross-cutting rules are executor-level post-execution hooks keyed by tool name; synchronous; a hook failure is non-fatal and reported with the tool result.
3. Coverage is a curated, typed tool per operation family (no per-subcommand mirroring, no raw passthrough, no generation from help text or OpenAPI).
4. Jira: tools wrapping Atlassian's acli only; auth stays with the user's CLI session; no REST, no stored tokens.
5. Full cutover in one change: runGit, commitAndPushArtifacts, the github.ts wrappers and the existing git_* tools; no shims.
6. Each tool declares an output schema; the executor validates; a typed call helper gives workflow code typed results. Where a CLI gives no structured output the cheap model converts the text to the schema; schema validation is the safety net; deterministic parsing stays preferred where the CLI is structured (gh --json, git porcelain, acli JSON).
7. Destructive operations: an approval request over IPC to whichever client is attached, every time; denied if nobody answers within the timeout; no global opt-in.
8. The plugin's own git runner (vscode-plugin) is outside the backend and is a non-goal.

## Facts verified in the code (2026-10-23)

- `executeTool(toolId, input, deps)` (src/daemon/tools/executor.ts:23) is the only function that runs a registry tool; its only production caller is `src/agent/read-only-tool-loop.ts:78`, which also accepts an injectable `args.execute` that bypasses it, and reads `getTool(name)` at line 90.
- The executor computes `needsGate` for `requiresApproval === true` and for a predicate, and on every gated call logs "the gate dispatcher is gone; auto-approving" and runs the tool (executor.ts:41-48). It is not a fallback branch.
- `registerExternalGate` appears only in a comment (executor.ts:10); no approval exchange over IPC exists, so the Epic builds it.
- `git_push` and `git_reset` declare `requiresApproval: true` for every call (push.ts:45, reset.ts:41), not only force or hard; the DESTRUCTIVE and PROTECTED REF text is only in the approval title. Marking which operations are destructive is new work.
- Tool ids are mixed: `git_*` and `gh_*`, plus `git:cherry-pick` and `gh:project:*`.
- `ToolResult` (src/daemon/tools/types.ts:33) is `{ output, format, success, error?, data?: unknown }`; there is a second `ToolResult` at src/shared/types.ts:46.
- Direct git and gh call sites in the backend: 22 production `runGit` calls in 6 files under src/workflow/team; 5 `commitAndPushArtifacts` callers (src/workflow/questions.ts:470, src/workflow/resolve-comment.ts:218, src/workflow/team/signoff.ts:385, src/cli/services/workflow.ts:139 and :174); the github.ts wrappers are imported by src/workflow/bugfix/tracker.ts, src/workflow/config/github.ts and src/workflow/tracker-auto.ts.

## Open

- Which values the cheap-model conversion cross-checks against the raw CLI text, and what happens when its retries run out.
- Which gh operations are text-only (for example `gh pr diff`, `gh run view --log`) and need the conversion path.
- The team-signoff Epic's s9 Story (tracker refresh after a pull or push) is parked on this Epic and is updated after it is done.

## acli probe (2026-10-23, acli 1.3.39-stable, signed in via OAuth to insors.atlassian.net)

- Top level: `admin auth confluence guard jira rovodev config`. `acli jira`: `auth board dashboard field filter project sprint workitem`.
- `workitem`: archive, assign, attachment, clone, comment (create, delete, list, update, visibility), create, create-bulk, delete, edit, link, list-watchers, search, transition, unarchive, view, watcher.
- `transition --key K1,K2 | --jql | --filter --status "<name>" [--yes] [--json] [--ignore-errors]`: the target is a status name, not a transition id.
- `assign --key | --jql | --filter | --from-file --assignee <email|accountId|@me|default> | --remove-assignee [--yes] [--json]`.
- `view KEY [--json] [--fields ...]`; `search --jql ... [--limit N | --paginate | --count] [--json | --csv]`; `project list|view|create|update|archive|restore|delete`.
- `--json` exists on view, search, transition, assign and `project list` (a JSON array of REST-shaped objects with `key`); comment commands not probed yet.
- Mutating commands prompt unless `--yes` is passed, so tool calls must always pass it.
- Some reads refuse to run unbounded: `project list` needs one of `--recent|--limit|--paginate`; `workitem search` rejects a JQL with no restriction ("Unbounded JQL queries are not allowed").
- Failure modes (all exit 1 except missing install):
  - not installed: shell exit 127, "command not found" (detect with a PATH lookup, not by output);
  - signed out: `acli jira auth status` prints "unauthorized: use 'acli jira auth login' to authenticate", exit 1; other commands only say e.g. "failed to list projects", exit 1, so sign-in must be checked with `auth status` first, not inferred from the failing command;
  - bad key or no permission: "Issue does not exist or you do not have permission to see it.", exit 1 (not told apart from each other).
- Errors are plain text on the output, not JSON, even with `--json`; so error classification is by text and exit code, and the conversion path is needed there.
- Not probed: comment create/list JSON, `workitem create --json`, link and watcher output.

## HLD review round 1 facts (2026-10-23)

- Approval-flagged builtins today: git has `requiresApproval: true` on amend, checkout, cherry-pick, commit, merge, pull, push, rebase, reset, revert and stage, and an input-dependent predicate on branch, remote, stash, tag and worktree; it is false on blame, diff, fetch, log, show and status. gh has true on 27 operations (actions 3, issue 5, project 4, pr 7, release 4, repo 4). Other families (file, cloud, k8s, ...) carry the flag too. So once the gate is real, commit, stage and pull would also ask until the family Stories narrow the marker.
- Production files that import src/workflow/tracker/github.ts: 11 (src/cli/services/workflow.ts, src/workflow/bugfix/tracker.ts, src/workflow/config/github.ts, src/workflow/questions.ts, src/workflow/resolve-comment.ts, src/workflow/team/signoff.ts, src/workflow/tracker-auto.ts, src/workflow/tracker/attach.ts, src/workflow/tracker/github-adapter.ts, src/workflow/tracker/setup.ts, src/workflow/tracker/sync.ts); the file has 45 exports, about 30 of them shell-out wrappers. With the runGit users under src/workflow/team (anchor-finder, handoff, policy-reader, policy-refresh, sighting-store, signoff, and git.ts itself) the cutover touches about 17 production files, plus tests (31 test files import a github.js module).
- About 110 builtins have no output schema; `ToolResult.output` is a string, so `outputSchema` has to be optional.

## Direct git / gh spawn inventory (2026-10-23, HLD review round 2)

Found by a source search of src (tests excluded, src/daemon/tools excluded) for git, gh or acli as a spawn target in any form (first argument, first array element, or a wrapper's first argument). Counts are sites per file. This replaces the earlier "about 17 files" figure; the s7 LLD rebuilds it again with the build check itself, because a text search misses indirect forms.

Spawn the CLI directly (17 files):
- src/workflow/tracker/github.ts (21; the gh and git wrappers, commitAndPushArtifacts)
- src/cli/services/maintenance.ts (17; the daemon self-update and repo sync)
- src/workflow/runners/build/story-commits.ts (3), range-base.ts (3), standalone-record.ts (1)
- src/daemon/steps/build-step/validation-checks.ts (3)
- src/understanding/identity.ts (4; git config user.email, gh identity)
- src/workflow/team/git.ts (1; runGit), src/workflow/team/git-async.ts (1)
- src/workflow/tracker/attach.ts (1; its own git helper), src/workflow/gates.ts (1), src/workflow/convert/plan.ts (1), src/workflow/artifacts/companion/header.ts (1), src/daemon/installed-commit.ts (1)
- src/design/corpus/sources/git-reader.ts (1; a hardened bounded reader with its own environment and limits)
- src/indexer/index.ts (line 91) and src/analyze/context/repo-ignore-filter.ts (line 112; git ls-files for ignore handling)

Call a wrapper (15 more files): runGit users anchor-finder.ts, handoff.ts, policy-reader.ts, policy-refresh.ts, sighting-store.ts, signoff.ts (all under src/workflow/team); importers of tracker/github.ts: src/cli/services/workflow.ts, src/workflow/bugfix/tracker.ts, src/workflow/config/github.ts, src/workflow/questions.ts, src/workflow/resolve-comment.ts, src/workflow/tracker-auto.ts, src/workflow/tracker/github-adapter.ts, src/workflow/tracker/setup.ts, src/workflow/tracker/sync.ts.

Total: about 32 production files, plus 31 test files that import a github.js module.

Open scope question for s7 (the Epic says "the workflow library, the daemon and the terminal client's approval service" for the move, and "the backend" for the build check): the indexer, the design corpus reader, the analyze ignore filter, the understanding identity and the daemon self-update (installed-commit, maintenance) are independent subsystems that read git for their own purposes. Either they move onto the registry too, or the check carries a named allowlist with a reason per entry.

## Decisions after HLD review round 2 (2026-10-23)

1. Scope of the cutover (s7): every direct git, gh and acli spawn in the backend moves onto the registry, with no allowlist. The indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup, installed-commit and the maintenance self-update are included. Inventory above (about 32 production files).
2. Approval has two classes. Common operations (tools that declare requiresApproval today and are not destructive: commit, stage, pull and the like) follow one global approval setting. Destructive operations ask every time and no setting can skip that. The global setting's default is the s3 LLD's to settle; the HLD proposes `auto` for common operations so existing behaviour holds (they run today as approved) and `ask` is an opt-in, which keeps unattended workflows running. This reads DEF s3 ac6 ("a tool that declares it needs approval asks") as "asks when the setting is ask"; confirm at approval.
3. The typed helper takes the tool definition object (callers import it), not a string id, so the result type follows from the definition.
