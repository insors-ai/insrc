# insrc steering block

`repo.add` installs this automatically. When you register a repo — `insrc`
TUI → Repos pane → press `a`, or the daemon `repo.add` IPC — you are asked, per
file, whether to install the insrc steering block into the repo's `CLAUDE.md`
(Claude Code) and/or `AGENTS.md` (Codex). The daemon writes it between
`<!-- insrc:steering:start -->` / `<!-- insrc:steering:end -->` markers with a
safe idempotent upsert: it creates the file if absent, replaces only the marked
region if present, and never clobbers your surrounding content. Re-running
`repo.add` refreshes the block in place.

**The canonical block content lives in [`src/prompts/steering-block.md`](../prompts/steering-block.md)**
(a shipped asset the daemon reads at inject time). It steers a controller
(Claude / Codex) to use `insrc_analyze_step` for code questions, `insrc_triage`
first for build requests, `insrc_workflow_run` to run the routed workflow, and
`insrc_review_step` to review before approving.

## Manual install (if you declined the prompt)

Copy the contents of [`src/prompts/steering-block.md`](../prompts/steering-block.md)
into your repo's `CLAUDE.md` and/or `AGENTS.md`, wrapped in the markers so a
later `repo.add` can update it in place rather than duplicating it:

```
<!-- insrc:steering:start -->
… contents of src/prompts/steering-block.md …
<!-- insrc:steering:end -->
```
