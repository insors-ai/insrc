<!-- insrc:artifact ISSUE-a697282df76a3c1d -->

# chain.ts's next-step advisor and docs/workflow.md both return/document the same dead 'insrc workflow' CLI commands the amendment-guide fix just removed from insrc_guide/insrc_schema

## Reproduction

Call insrc_workflow_step(phase='start', workflow='define', ...) through to an unapproved Define, then inspect the chain-report helper's suggested next action for kind 'approve-define': src/workflow/chain.ts's nextStep() returns `command: "insrc workflow approve ${s.define.path}"` (and the same pattern for approve-hld, approve-story x2, and approve-define's rejected-retry case) -- none of these are real commands; src/cli/command.ts's runWorkflow switch has no 'approve' dispatch that takes a bare path this way outside the TUI's own command bar, and per this project's own hard gate, approval must go through the insrc_workflow_approve MCP tool only, never a CLI/TUI path. When amendments are pending, nextStep() returns kind 'review-amendment' with `amendmentId: "<list via: insrc workflow amend ${epicHash} --list>"` and `command: "insrc workflow amend ${epicHash} --list"` -- the exact dead command already fixed in insrc_guide/insrc_schema by ISSUE-1b517fee7dfb9f1c. nextStep() also returns `command: "insrc workflow sync ${epicHash}"` for the tracker-sync case. Separately, docs/workflow.md documents this same invented CLI with even more invented sub-flags: a code block shows `insrc workflow amend <h16> --list` and `insrc workflow amend <h16> --show AMD-<h16>-1`, and a second code block shows `insrc workflow amend <h16> --approve AMD-<h16>-1` and `--reject AMD-<h16>-2 --notes "..."`, plus a third block repeating --list/--show/--approve/--reject together.

## Root cause

src/workflow/chain.ts's nextStep() function (the chain-report's 'exact next command' advisor) was written, for several NextStepKind cases, using an invented CLI syntax ('insrc workflow approve/amend/sync ...') instead of the real insrc_workflow_approve / insrc_workflow_step MCP tool calls that every OTHER case in the same function already correctly uses (e.g. `insrc_workflow_step phase=start workflow=define focus="<your ask>"` for 'run-define'). The 'review-amendment' case is additionally limited by its own data: countAmendments(repoPath, epicHash) only tallies pending/approved/rejected counts from listAmendments's rows, discarding each row's real id/path before nextStep() ever sees it, so even a corrected 'review-amendment' case has no per-amendment identifier in scope to name. docs/workflow.md was written describing this same invented CLI as if it were real, with additional invented --show/--approve/--reject flags that do not exist in src/cli/command.ts's runWorkflow switch (list/chain/run/review/findings/resolve/approve/reject/ack-stale/sync/deferred) either.

## Fix intent

Replace every invented 'insrc workflow approve/sync ...' string nextStep() returns with the real insrc_workflow_approve({artifactPath}) / insrc_workflow_step(phase='start', workflow='tracker.sync', ...) call shape. For 'review-amendment', decide and apply one of: (a) thread each pending amendment's real id/path from listAmendments through countAmendments/ChainReport.amendments into nextStep() so it can name real artifacts, or (b) keep the aggregate-only shape and replace the invented list command with an accurate instruction to discover pending amendments another way. Rewrite docs/workflow.md's amendment sections to match whichever real mechanism results, removing every invented CLI flag (--list/--show/--approve/--reject).

## Citations

- **[[c1]]** `code` `src/workflow/chain.ts:341` — "command: `insrc workflow approve ${s.define.path}`,"
- **[[c2]]** `code` `src/workflow/chain.ts:378` — "command: `insrc workflow approve ${s.define.path}`,"
- **[[c3]]** `code` `src/workflow/chain.ts:385-386` — "amendmentId: `<list via: insrc workflow amend ${epicHash} --list>`, command: `insrc workflow amend ${epicHash} --list`,"
- **[[c4]]** `code` `src/workflow/chain.ts:399` — "command: `insrc workflow approve ${s.hld.path}`,"
- **[[c5]]** `code` `src/workflow/chain.ts:422` — "command: `insrc workflow approve ${story.path}`,"
- **[[c6]]** `code` `src/workflow/chain.ts:438` — "command: `insrc workflow sync ${epicHash}`,"
- **[[c7]]** `code` `src/workflow/chain.ts:366` — "command: `insrc_workflow_step phase=start workflow=define focus="<your ask>"`, -- the correct real-tool-call style every other case already uses."
- **[[c8]]** `code` `src/workflow/amendments/store.ts:265` — "function countAmendments(repoPath, epicHash): tallies pending/approved/rejected counts from listAmendments's rows; does not retain each row's id/path."
- **[[c9]]** `code` `src/cli/command.ts:166-298` — "runWorkflow's switch: case 'list'/'ls', case 'chain', case 'run', case 'review', case 'findings', case 'resolve', case 'approve', case 'reject', case 'ack-stale', case 'sync', case 'deferred' -- no ca"
- **[[c10]]** `doc` `docs/workflow.md:300-301` — "insrc workflow amend <h16> --list
insrc workflow amend <h16> --show AMD-<h16>-1"
- **[[c11]]** `doc` `docs/workflow.md:307-310` — "insrc workflow amend <h16> --approve AMD-<h16>-1

insrc workflow amend <h16> --reject AMD-<h16>-2 \
  --notes "not needed; existing contract is fine""
- **[[c12]]** `doc` `docs/workflow.md:447-450` — "insrc workflow amend <h16> --list
insrc workflow amend <h16> --show <amendmentId>
insrc workflow amend <h16> --approve <amendmentId>
insrc workflow amend <h16> --reject <amendmentId> --notes <text>"
