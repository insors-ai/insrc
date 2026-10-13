# Story s11: ship and smoke checks (Task t13)

Run on 2026-10-13 against the installed daemon.

## Ship

- Pushed `main` at `99c6a8df`, after two `--no-ff` merges of other sessions' work
  (`089993b7`, `eb4314b5`). The sweeps of the merged tree are in `sweeps.md`.
- Updated the installed daemon (`~/.insrc/daemon`) to `99c6a8df` with the
  `update()` service function: sync, build, config reconcile, steering refresh.
- Restart: the `restart()` service function stopped the old daemon (pid 57247)
  and started a new one, but the new one did not become ready within 60 s.
  The old process had logged `shutdown signal received; draining...` and
  `bye` and removed its pid file and socket, yet it never exited. It ignored
  SIGTERM; its log also showed `MDB_LOCK_FAILURE: Failed to get robust
  semaphore` (the condition of ISSUE-0d577569). It was ended with SIGKILL, no
  process then held the store, and `startDaemon()` started the daemon as pid
  81990 on `99c6a8df`. The stop logic trusting the removed pid file and socket
  while the process lives on is an unfiled defect.
- The VS Code extension was repackaged from `99c6a8df` and installed
  (`insors.insrc-vscode@0.5.14`); it bundles none of the code s11 changed.
- The user then restarted every Claude Code and Codex session.

## After every session restarted

Processes: the daemon (pid 81990, started 11:50:09) and one MCP server
(pid 87098, started 11:59:44, after the update), from
`~/.insrc/daemon/out/bin/insrc-mcp.js`. No MCP server from before the update
was left running.

### 1. An analysis through a restarted client session

Ran `insrc_analyze` (one-shot) through this session's MCP server (pid 87098):
focus "how does the MCP server forward the step tools to the daemon
(forwardStep and the step.call host)", repo `insrc`, target `code`.

Seen: a full bundle (size M, 34 files, 76 items, `model=opus`,
`toolCalls=6`), grounded on `src/mcp/forward-step.ts`, `src/mcp/server.ts`,
`src/daemon/index.ts:1902` (`'step.call'`) and `src/daemon/steps/host.ts`.
The pipeline ran in the daemon; the MCP process only forwarded the call.

### 2. A multi-turn workflow step continues after the MCP server restarts

1. Through this session's MCP server (pid 87098): `insrc_workflow_step`
   `phase: start`, workflow `issue`, focus marked as a smoke check. Seen:
   `next: emit_plan`, state `WNVfux58ECv6yBWX9tcJvw`.
2. Through a NEW process of the installed MCP server (pid 88099, started by
   a stdio MCP client, closed afterwards): `phase: plan` with that state.
   Seen: `next: emit_step`, `stepId: s1`, runner `issue.capture`, new state
   `havXUlViLBdYc1vLxFmAbw`.
3. Back through pid 87098: `phase: step`, `stepId: s1`, with the new state.
   Seen: `next: emit_step`, `stepId: s2`, runner `checklist.verify`.

The run's state lives in the daemon, so it survived a change of MCP process in
both directions. The run was then abandoned (never synthesized): no file was
written for it.

### 3. Only the daemon holds the store files

After both checks, with pid 88099 exited:

- `lsof -n ~/.insrc/graph.lmdb ~/.insrc/graph.lmdb-lock`: only pid 81990
  (the daemon), on both files.
- `lsof -n +D ~/.insrc/lance`: no process held a file under the vector store
  at that moment (it opens its files per query).
- Every other `node` process, the MCP server included, checked with
  `lsof -p`: none has a path under `~/.insrc/graph.lmdb*` or `~/.insrc/lance`
  open.
