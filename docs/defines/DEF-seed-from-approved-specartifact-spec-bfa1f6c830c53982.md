<!-- insrc:artifact DEF-f900cf34c0342d4f -->

# Epic: An operator running the insrc TUI has no in-tool way to see the runtime health of the system they are driving, so when something goes wrong they are working blind.

**Flavor:** enhancement

## Problem

An operator running the insrc TUI has no in-tool way to see the runtime health of the system they are driving, so when something goes wrong they are working blind. There is no single place that shows whether the managed daemon is actually alive and what state it is in, whether stray or orphaned daemon processes have been left behind by earlier crashes or restarts and are now competing for the same socket, whether the MCP clients (claude, codex) are actually registered and connected, who is currently attached to the daemon over its socket, or what the daemon and agent runs are logging as they happen. Today that information is scattered across the operating system's process table, separate CLI invocations, and log files under a hidden directory, reachable only by leaving the TUI and running ad-hoc shell commands — and some of it (which sessions are attached to the socket right now) is not observably surfaced anywhere at all. The most common concrete failure this leaves unaddressed is a leaked, orphaned daemon process from a bad shutdown: the operator can neither see it nor clear it without dropping to the shell. The cost lands exactly when the operator is already debugging a problem, forcing them to context-switch out of the tool and correlate several external sources by hand precisely when a fast, consolidated read of daemon, connection, and log state would matter most.

## Non-goals

- **Restarting the managed daemon from the Debug pane.** — Daemon restart already exists in the main Daemon pane; duplicating a system-wide-impact control here would be redundant and widen blast radius. [[c4]]
- **Disconnecting or killing an individual IPC client from the MCP section.** — The MCP section is a read-only view; forcibly severing a live workbench/MCP/CLI session is out of scope and risky. [[c4]]
- **Tailing more than one log category at once, or splitting the shared agent.log into separate workflow-run vs MCP-subprocess streams.** — Only two physical log files exist (daemon.log + a shared agent.log); a three-way split would require new logger surface this Epic deliberately avoids. [[c3]]
- **Cross-platform (Windows) orphan scan/kill.** — The scan/kill relies on POSIX `ps` + signals; a Windows path doubles the implementation for a surface the codebase has never carried, so Windows degrades to a not-supported message. [[c4]]
- **A new log-streaming IPC surface.** — Logs are read straight from disk client-side so the pane still works when the daemon is down — exactly when debugging matters most; a daemon-mediated stream would go dark then. [[c3]]
- **Automatic or blanket process killing.** — Killing is always an explicit user selection of one or more specific processes behind a confirm guard; the tool only recommends which look stray, it never acts on its own. [[c4]]

## Assumptions

- `med` The existing daemon.status IPC (plus the new debug-status method) can supply the status-card fields the operator needs (liveness, uptime, managed-repo count + index state), with pid/version added to the new method as required. [[c2]]
- `med` The daemon can enumerate the sessions currently attached to its Unix socket with a stable label, pid, and connected-at once per-connection tracking is added to the socket server. [[c2]]
- `high` The two on-disk log files (daemon.log and a shared agent.log covering both workflow/agent runs and the MCP subprocess) under PATHS.logDir, written by the rotating pino-roll logger, are the complete set of log sources and are readable client-side. [[c3]]
- `med` A running orphan daemon process is distinguishable from the managed one by matching the daemon entry cmdline (DAEMON_ENTRY resolving to .../daemon/index.js) and excluding the managed daemon's own reported PID. [[c2]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | The daemon owns all socket/DB access; the CLI Debug pane obtains daemon-held state (status fields, connected socket clients) exclusively over IPC — it never opens the daemon's stores or socket internals directly. | [[c2]] |
| `k2` | invariant | The Debug pane is read-only except for a single guarded action: killing one or more explicitly-selected orphan/zombie daemon processes behind a confirm prompt. No other mutating action exists anywhere in the pane. | [[c4]] |
| `k3` | invariant | The orphan process scan and kill are POSIX-only (ps + SIGTERM-then-SIGKILL); on non-POSIX platforms the Daemon section renders a 'not supported on this platform' message instead of the scan UI. | [[c4]] |
| `k4` | invariant | The Logs section reads log data directly from disk (fs.watch over the known rotated files) with no new daemon log-streaming IPC, so it functions even when the daemon is unreachable. | [[c3]] |
| `k5` | stakeholder | The Debug pane never restarts the managed daemon and never disconnects an IPC client; those controls live elsewhere (restart) or are out of scope (disconnect). | [[c4]] |
| `k6` | convention | A new Debug pane is a peer *Pane.tsx wired into app.tsx's pane switcher and backed by a service in src/cli/services, matching the existing pane/service convention (DaemonPane/ReposPane/WorkflowsPane/SetupPane/ModelTiersPane + makeServices). | [[c1]] |

## Stories

### E20260805f900cf34:S001 — Open a Debug pane and move between its Daemon, MCP, and Logs views

**User value:** `size: M`

As an operator, I can open a dedicated Debug view in the TUI and switch between its Daemon, MCP, and Logs sections, so runtime diagnostics have one consistent home alongside the panes I already use.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given the insrc TUI is running, when the operator navigates to the Debug pane, then the pane opens as a peer of the existing panes and presents three selectable sections — Daemon, MCP, and Logs — with one shown at a time. _(operationalizes `k6`)_
- **ac2:** Given the Debug pane is open on one section, when the operator switches to another section, then the newly selected section is shown full-height and the previously shown one is hidden, without leaving the Debug pane. _(operationalizes `k6`)_

### E20260805f900cf34:S002 — See the managed daemon's live status at a glance

**User value:** `size: M`

As an operator, I can see whether the managed daemon is alive and its key runtime state (uptime, version, socket, managed-repo count and index state) without leaving the TUI, so I can tell at a glance whether the system I am driving is healthy.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given the Debug pane's Daemon section is open and the daemon is running, when the section is displayed, then it shows a status card reporting the daemon as running along with its uptime, version, socket, and managed-repo count with each repo's index state, sourced over IPC. _(operationalizes `k1`)_
- **ac2:** Given the Debug pane's Daemon section is open and the daemon is not reachable, when the section is displayed, then the status card reports the daemon as stopped/unreachable rather than showing stale or blank fields. _(operationalizes `k1`)_

### E20260805f900cf34:S003 — Spot and clear leaked orphan daemon processes

**User value:** `size: L`

As an operator, I can see any stray/orphan insrc daemon processes left behind by a bad shutdown and explicitly select one or more of them to terminate, so I can clear leaks without dropping to a shell — while never risking the process I actually rely on.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given the Debug pane's Daemon section is open on a POSIX platform, when the operator triggers (or refreshes) the orphan scan, then the section lists any running daemon-like processes that are not the managed daemon, as recommendations for the operator to review. _(operationalizes `k3`, `lc1`)_
- **ac2:** Given the orphan scan has listed one or more candidate processes, when the operator selects one or more of them and requests a kill, then a confirmation is required before anything happens, and only on explicit confirmation are exactly the selected processes terminated (attempting a graceful stop first, then forcing it if still alive). _(operationalizes `k2`, `lc1`)_
- **ac3:** Given the Debug pane's Daemon section is open on a non-POSIX platform, when the operator views the orphan area, then it shows a 'not supported on this platform' message instead of a scan or kill control. _(operationalizes `k3`)_

**Local constraints:**

- `lc1` (invariant) The scan output is only a recommendation of what looks stray; termination acts solely on the operator's explicit selection and confirmation — never automatically and never as a blanket 'kill all'. [[c4]]

### E20260805f900cf34:S004 — See which MCP clients are connected and who is attached to the daemon now

**User value:** `size: L`

As an operator, I can see whether the MCP clients (claude, codex) are registered and connected and which sessions are currently attached to the daemon over its socket, so I can diagnose connection problems without external tools — as a read-only view.

**Depends on:** `s1`

**Extends:** [[c2]] [[c3]]

**Acceptance criteria:**

- **ac1:** Given the Debug pane's MCP section is open, when the section is displayed (or explicitly refreshed), then it reports, per MCP client, whether the insrc server is registered and whether it is currently connected. _(operationalizes `k1`)_
- **ac2:** Given the Debug pane's MCP section is open and the daemon is running, when the section is displayed, then it lists the sessions currently attached to the daemon's socket with an identifying label, pid, and connected-at time, obtained over IPC and refreshed while the section is open. _(operationalizes `k1`)_
- **ac3:** Given the MCP section is displaying connected clients, when the operator interacts with the section, then no control is offered to disconnect or terminate any client — the section is strictly read-only. _(operationalizes `k5`)_

### E20260805f900cf34:S005 — Watch and filter the daemon and agent logs live

**User value:** `size: L`

As an operator, I can pick a log category and watch it stream live with level/module/text filtering, so I can follow what the daemon and agent runs are doing as it happens — even when the daemon itself is down.

**Depends on:** `s1`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given the Debug pane's Logs section is open, when the section is first displayed, then it lists the available log categories (the daemon log and the agent log) without yet streaming any of them. _(operationalizes `k4`)_
- **ac2:** Given the log categories are listed, when the operator selects one category, then that category's most recent log content begins streaming live and continues to update as new lines are written, and only one category streams at a time. _(operationalizes `k4`, `lc2`)_
- **ac3:** Given a log category is streaming, when the operator sets a level, module, or free-text filter, then the visible lines are limited to those matching the active filters while the stream continues. _(operationalizes `k4`)_

**Local constraints:**

- `lc2` (invariant) Streaming follows the currently-active (most recent) rotated log segment and continues across a rotation, so the operator keeps seeing new lines after the underlying file rolls over. [[c3]]

## Citations

- **[[c1]]** `analyze-bundle` `s1 module.profile — src/cli TUI pane architecture: app.tsx pane host/switcher, panes/*Pane.tsx, services/ (Services + makeServices); src/cli/app.tsx, src/cli/panes, src/cli/services/index.ts`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — daemon.status handler (src/daemon/index.ts:849) consumed via src/cli/services/daemon.ts:50; daemon owns the Unix socket (src/daemon/server.ts); DAEMON_ENTRY = .../daemon/index.js (src/cli/services/daemon.ts:24); no connected-client enumeration exists today`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — mcp-register/`mcp list` (src/daemon/mcp-register.ts); PATHS.logDir daemon.log + agent.log (src/shared/paths.ts:104-105) written by the pino-roll logger with cli+mcp sharing agent.log (src/shared/logger.ts)`
- **[[c4]]** `prior-artifact` `Approved SPEC-bfa1f6c830c53982 (docs/specs/SPEC-add-debug-pane-tab-insrc-tui.md) — 10 recorded decisions incl. multi-select confirm-gated orphan kill, read-only MCP section, POSIX-only scan, no restart/disconnect, two-category disk-tailed logs`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-05T11:02:19.945Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | The daemon exposes a daemon.status IPC handler (src/daemon/index.ts) consumed by the CLI daemon service (src/cli/services/daemon.ts), backing the status card. | daemon.status handler at src/daemon/index.ts:849, consumed by src/cli/services/daemon.ts:50 (rpc<DaemonStatus>('daemon.status')) + getStatus at daemon.ts:49 / useDaemonStatus.ts:32 / command.ts:103. The status card's IPC source is real. Confirmed. | None — anchors resolve. |
| cl2 | citation | LOW | auto | The managed daemon entry is defined as DAEMON_ENTRY = join(__dirname, '../../daemon/index.js') in src/cli/services/daemon.ts — the cmdline anchor for the orphan ps scan. | DAEMON_ENTRY = join(__dirname, '../../daemon/index.js') at src/cli/services/daemon.ts:24, used to spawn the daemon at :63. The orphan ps-scan cmdline anchor is exactly this resolved entry. Confirmed. | None — anchor resolves. |
| cl3 | semantic | LOW | auto | No debug-status IPC that enumerates the daemon's connected socket clients (label/pid/connected-at) exists today — the Epic introduces it as a new daemon surface + the socket server is src/daemon/server.ts. | Zero matches for debug-status/debugStatus/debug.status or any connected-clients/clientList/socketClients enumeration in src/ — confirming the connected-socket-client debug-status IPC is genuinely a NEW daemon surface the Epic introduces (the socket server src/daemon/server.ts exists as the place it is added). Confirmed. | None — the 'new surface' premise holds; design must add the tracking + method. |
| cl4 | inventory | LOW | auto | Exactly two log files exist under PATHS.logDir — daemon.log and a shared agent.log (cli + mcp modes) — written by the pino-roll logger. | PATHS.daemonLog/agentLog (paths.ts:104-105 per direct read; PATHS.daemonLog used at daemon.ts:59/70/71), pino-roll transports at src/shared/logger.ts:66/101/130 (daemon/cli/mcp modes, cli+mcp -> agentLog). Exactly two physical files, rotated. Confirmed — the two-log-category premise holds. | None — the disk-tailed two-file premise resolves. |
| cl5 | citation | LOW | auto | MCP per-client registration/connection status is obtained via `mcp list` through src/daemon/mcp-register.ts (registerMcpClients). | registerMcpClients defined in src/daemon/mcp-register.ts and invoked at src/daemon/index.ts:499; it drives the `mcp list`/`mcp add` argv flow (the `mcp list` literal lives as an argv array, so the plain-string grep under-hit but the mechanism is confirmed). The MCP registration/status source is real. Confirmed. | None — anchor resolves. |
| cl6 | inventory | LOW | auto | The existing TUI panes (DaemonPane/ReposPane/WorkflowsPane/SetupPane/ModelTiersPane) are *Pane.tsx components under src/cli/panes backed by the services layer (makeServices), the convention the new Debug pane follows. | makeServices at src/cli/services/index.ts:7 + wired in src/cli/index.tsx:32/34; the existing *Pane.tsx files resolve as real paths (e.g. src/cli/panes/ReposPane.tsx surfaced in the cl1 probe) and the earlier module.profile enumerated DaemonPane/ReposPane/WorkflowsPane/SetupPane/ModelTiersPane under src/cli/panes. The literal-filename grep under-hit only because ripgrep scans contents, not names. Confirmed. | None — the pane/service convention the Debug pane follows is real. |
