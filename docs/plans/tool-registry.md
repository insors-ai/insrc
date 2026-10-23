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

- acli's command surface is unchecked (install it and record transitions, comments, assignment, projects, and how not-installed differs from not-signed-in) before the Jira stories are designed.
- Which values the cheap-model conversion cross-checks against the raw CLI text, and what happens when its retries run out.
- Which gh operations are text-only (for example `gh pr diff`, `gh run view --log`) and need the conversion path.
- The team-signoff Epic's s9 Story (tracker refresh after a pull or push) is parked on this Epic and is updated after it is done.
