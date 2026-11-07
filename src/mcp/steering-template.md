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
first for build requests AND bug/defect fixes (a bugfix is classified + routed to
the `issue` stage, tracked like a feature), `insrc_workflow_step` to drive the
routed workflow turn-by-turn, and `insrc_review_step` to review before approving.

For code questions it tells the agent to read the user's prompt itself and send
`insrc_analyze_step` / `insrc_analyze` a structured `request` (`question`,
`scopeRef`, optional `target`, `sizeHint`, `context`) rather than only the
prompt, while keeping the rule for choosing between `Grep`/`Read` and the
analyzer. That guidance sits between `<!-- insrc:analyze-request:start -->` and
`<!-- insrc:analyze-request:end -->` in the block, and the daemon publishes it
(on `repo.add` and in the boot refresh) only when it advertises `analyze-request`
in `daemon.status`; otherwise the region is left out.

## Rollout of the structured analyze request

- **Deploy order:** update the MCP processes first (a restarted client
  re-reads the tool schemas), then restart the daemon; or suspend analysis
  during the transition. A request-carrying call to a daemon that does not
  advertise `analyze-request` is refused by the MCP forwarder with
  `DaemonTooOldError`.
- **In-flight runs end at the restart:** an `insrc_analyze_step` state token
  issued before the restart is not carried across it.
- **`zeroDowntime` is false** for this change: the daemon restart is required.
- **Prompt-only calls stay accepted** (`focus` alone analyses the workspace);
  refusing them is possible only through a declared contract in a later Story.
- **Follow-up scope:** a later Story is limited to the runners that already
  have an area filter; the rest keep their current whole-repo behaviour.

## Manual install (if you declined the prompt)

Copy the contents of [`src/prompts/steering-block.md`](../prompts/steering-block.md)
into your repo's `CLAUDE.md` and/or `AGENTS.md`, wrapped in the markers so a
later `repo.add` can update it in place rather than duplicating it:

```
<!-- insrc:steering:start -->
… contents of src/prompts/steering-block.md …
<!-- insrc:steering:end -->
```
