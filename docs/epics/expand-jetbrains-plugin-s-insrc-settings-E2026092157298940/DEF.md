<!-- insrc:artifact DEF-57298940cdc341bc -->

# Epic: A developer working inside a JetBrains IDE can now inspect and edit the insrc daemon's configuration from the IDE Settings, but the other operational capabilities the interactive CLI gives them remain reachable only from the terminal.

**Flavor:** enhancement

## Problem

A developer working inside a JetBrains IDE can now inspect and edit the insrc daemon's configuration from the IDE Settings, but the other operational capabilities the interactive CLI gives them remain reachable only from the terminal. Three whole classes of day-to-day operation have no in-IDE home. First, the daemon's lifecycle and health: whether it is running and for how long, how deep its work queue is, whether its model is ready, how large its on-disk index has grown and how many repos it holds — and the controls to start, stop, restart, update, back up, or compact it — are visible and actionable only outside the IDE. Second, the state of the tracked workflow for the project the developer has open: which Epics exist, and for each one how far its define/design/story chain has progressed, which stories are approved or stale, what the next action is, and how many amendments are outstanding — a read that today requires leaving the IDE or inspecting artifact files by hand. Third, runtime diagnosis: when something misbehaves there is no in-IDE way to read the daemon's status, spot and clear leaked orphan daemon processes, see which assistant clients are registered and which sessions are attached to the daemon right now, or watch the daemon and agent logs as they stream. Each of these already exists as a first-class surface in the CLI, so the JetBrains developer the IDE integration was built to serve is forced to context-switch to the terminal for exactly the operational and debugging moments where staying in the IDE would matter most, and their daily operations end up split across two disconnected surfaces.

## Non-goals

- **Approving or rejecting workflow artifacts (or amendments) from the new Workflows navigation page.** — Approval already has a dedicated in-IDE home in the shipped 'insrc Review' tool window; the Workflows page is explicitly a READ-ONLY chain-status readout (the user's chosen scope), so duplicating the approve/reject action would fork the approval surface. [[c2]]
- **Changing the existing parent Settings page (the collapsible daemon-config sections).** — That page is already shipped and hardened; it stays the unchanged parent/default, and the new capabilities are added as sibling child navigation items beneath it. [[c8]]
- **Rendering the live log stream inline inside a Settings navigation page.** — A Settings page is a static form surface unsuited to a continuously-scrolling log; per the user's explicit choice the log opens in an IDE editor panel instead. [[c6]]
- **Adding new daemon reasoning or backend behaviour beyond surfacing the readouts and actions the CLI already exposes.** — The plugin is a thin orchestrator that owns no reasoning; this Epic mirrors existing CLI capabilities into the IDE, it does not invent new daemon behaviour (a read-only projection of the workflow chain is the one net-new read surface, not new reasoning). [[c1]] [[c9]]

## Assumptions

- `high` The daemon runs on the same machine as the IDE, so the plugin can reach its Unix socket, read its local log/artifact files, and enumerate/kill its OS processes directly. [[c7]]
- `high` The socket IPCs the operational readouts/actions need already exist and are stable: daemon.status, daemon.backup, daemon.compact, daemon.shutdown, and daemon.debug-status. [[c7]]
- `med` The plugin's existing daemon-lifecycle machinery can perform start / update / restart (the non-IPC lifecycle steps the CLI runs via scripts). [[c8]]
- `high` The orphan scan/kill, MCP-client listing, and log tail are CLI-local operations (OS process table, a CLI subprocess, and local file watching) that the plugin must reimplement with IDE-native equivalents rather than call over IPC. [[c5]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Plugin-only (Kotlin/Swing on the JetBrains platform), built and verified LOCALLY under JDK21 — no daemon or GitHub-CI changes are in scope. | [[c10]] |
| `k2` | convention | All daemon/socket/file I/O runs OFF the EDT (executeOnPooledThread) with any UI render marshalled back via a guarded invokeLater — never block the EDT on a socket or long-running lifecycle op. | [[c8]] |
| `k3` | invariant | The ONLY mutating control on the Debug surface is the orphan-process kill, and it must be gated behind an explicit confirm and act solely on the operator's explicit selection; everything else on Debug (status, MCP clients, attached sessions, logs) is strictly read-only. | [[c4]] |
| `k4` | invariant | The new capabilities are CHILD navigation pages nested under the existing insrc Settings node (parent id ai.insors.insrc.settings), which stays the default; the parent settings page is not modified. | [[c8]] |
| `k5` | stakeholder | The live log view opens as an IDE editor panel (a virtual-file/editor surface), not as an inline component inside a Settings navigation page. | [[c6]] |
| `k6` | stakeholder | The Workflows page is read-only chain status: it surfaces the Epic/story chain state but performs no approve/reject/amendment action. | [[c2]] |

## Stories

### E2026092157298940:S001 — Reach Daemon, Workflows, and Debug as nested pages under insrc Settings

**User value:** `size: M`

A JetBrains developer opens IDE Settings and finds insrc's operational surfaces where they already look for its configuration — the insrc node now carries child navigation items for Daemon, Workflows, and Debug, while the insrc node itself still shows the existing configuration page as the default.

**Acceptance criteria:**

- **ac1:** Given the insrc plugin is active and the developer opens IDE Settings, when they expand the insrc node under Tools, then they see three child navigation items — Daemon, Workflows, and Debug — nested beneath it, and selecting the insrc node itself still shows the existing configuration page unchanged. _(operationalizes `k4`)_
- **ac2:** Given the developer is on IDE Settings with the insrc node expanded, when they click any one of the Daemon / Workflows / Debug child items, then that item's own page opens in the settings detail area, distinct from the other pages and from the parent configuration page. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (invariant) The three new pages are peers nested under the SAME parent insrc node; adding them must not alter the parent configuration page's content or position. [[c8]]

### E2026092157298940:S002 — See daemon health and run its full lifecycle from the IDE

**User value:** `size: L`

A developer can see at a glance whether the insrc daemon is running and healthy — uptime, work-queue depth, pending embeddings, model readiness, on-disk index size, and how many repos it holds — and can start, stop, restart, update, back up, or compact it without leaving the IDE, with each long-running action showing progress and a clear outcome.

**Depends on:** `s1`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given the developer opens the Daemon page and the daemon is running, when the page loads its health readout, then it shows the running state with uptime, queue depth, pending embeddings, model-ready status, on-disk index size, and registered-repo count; and when the daemon is not running it shows a distinct stopped state instead of a blank or fabricated readout. _(operationalizes `k2`)_
- **ac2:** Given the developer is on the Daemon page, when they invoke any of start, stop, restart, update, backup, or compact, then the action runs without freezing the IDE and reports a clear success or failure outcome when it finishes (a backup first asks where to write it). _(operationalizes `k1`, `k2`)_

### E2026092157298940:S003 — See the tracked-workflow chain status for the open project

**User value:** `size: L`

A developer can see, for the project they have open, every insrc Epic and how far its tracked chain has progressed — whether its define and design are done, which stories have a design and which are approved or stale, what the next action is, and how many amendments are outstanding — as a read-only status view, without leaving the IDE or reading artifact files by hand.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given the open project has insrc workflow artifacts, when the developer opens the Workflows page, then it lists the project's Epics and, for a chosen Epic, shows its chain status: the define and design state, each story's design/approved/stale state, the next action, and the pending/approved amendment counts. _(operationalizes `k6`, `k2`)_
- **ac2:** Given the developer is viewing an Epic's chain status on the Workflows page, when they look for a way to approve or reject anything, then the page offers no approve/reject/amend control — it is purely a status readout, and approvals remain in the existing review surface. _(operationalizes `k6`)_
- **ac3:** Given the open project has no insrc workflow artifacts, when the developer opens the Workflows page, then it shows a clear empty state rather than an error or a blank page. _(operationalizes `k2`)_

### E2026092157298940:S004 — See the daemon's runtime status and clear leaked orphan processes

**User value:** `size: L`

When something is wrong, a developer can open the Debug page and read the daemon's runtime status, and — the one corrective action — find and clear stray orphaned daemon processes left over from a bad shutdown, choosing exactly which to terminate and confirming before anything is killed.

**Depends on:** `s1`

**Extends:** [[c4]]

**Acceptance criteria:**

- **ac1:** Given the developer opens the Debug page, when its daemon-status area loads, then it shows the daemon's runtime status (running/stopped, uptime, socket, version, pid, and registered repos when reachable) as a read-only card. _(operationalizes `k2`)_
- **ac2:** Given leaked orphan daemon processes exist and the developer has selected some of them on the Debug page, when they request a kill and confirm the prompt, then only the explicitly selected processes are terminated and each one's outcome is reported; with nothing selected the kill does nothing, and on a platform where this is unsupported the area says so instead of acting. _(operationalizes `k3`)_

### E2026092157298940:S005 — See which MCP clients are connected and who is attached to the daemon

**User value:** `size: M`

A developer can see, from the Debug page, which assistant MCP clients are registered and connected and which sessions are currently attached to the daemon's socket — a read-only diagnostic that needs no terminal, with nothing that disconnects or terminates a client.

**Depends on:** `s4`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given the developer is on the Debug page, when its MCP area loads, then it shows each known MCP client's registration and connection status, and the sessions currently attached to the daemon socket (with their identity and connection time), degrading to a clear unavailable line when the daemon cannot be reached rather than a blank. _(operationalizes `k2`)_
- **ac2:** Given the MCP diagnostic is shown, when the developer looks for a control to disconnect or terminate a client or session, then no such control exists — the area is strictly read-only. _(operationalizes `k3`)_

### E2026092157298940:S006 — Watch the daemon and agent logs in an editor panel

**User value:** `size: L`

A developer can open the daemon and agent logs from the Debug page and read them as a live, filterable, read-only stream in a normal IDE editor tab — the right surface for a continuously-scrolling log — without dropping to the shell to tail files.

**Depends on:** `s4`

**Extends:** [[c6]]

**Acceptance criteria:**

- **ac1:** Given the developer is on the Debug page, when they choose to view a log category, then that log opens in an IDE editor panel (not inline in the settings page) and streams new lines live as the daemon/agent write them. _(operationalizes `k5`, `k2`)_
- **ac2:** Given a log is open in the editor panel, when the developer applies a level, module, or text filter, then the view shows only matching lines and the log remains strictly read-only — nothing the developer does deletes, rotates, or clears the underlying log. _(operationalizes `k5`)_

## Citations

- **[[c1]]** `code` `src/cli/panes/DaemonPane.tsx` — "Daemon pane — health readout + the full maintenance lifecycle (start / stop / restart / update / backup / compact)"
- **[[c2]]** `code` `src/cli/panes/WorkflowsPane.tsx` — "the list view shows every Epic (a DEF-*.json under .insrc/artifacts); Enter opens a detail view with the chain state + a cursor over the actionable items"
- **[[c3]]** `code` `src/cli/panes/DebugPane.tsx` — "a peer pane hosting three inner sections (Daemon / MCP / Logs)"
- **[[c4]]** `code` `src/cli/panes/DaemonSection.tsx` — "debug.killOrphans(selection) ... This kill is the ONLY mutating control in the whole pane, acts solely on the explicit selection ... gated behind a ConfirmPrompt"
- **[[c5]]** `analyze-bundle` `s1 external-contract bundle (src/cli/services/debug.ts + workflow.ts)` — "scanOrphans/killOrphans use POSIX ps+kill; mcpStatus spawns `<cli> mcp list`; tailLog fs-watches local log files; workflow chain/listEpics read .insrc/artifacts files locally"
- **[[c6]]** `code` `src/cli/panes/LogsSection.tsx` — "a live, filterable, read-only tail ... into a bounded ring buffer ... filtered by a persistent { minLevel?, module?, text? } filter"
- **[[c7]]** `code` `src/daemon/index.ts` — "daemon.status, daemon.backup, daemon.compact, daemon.shutdown handlers (+ daemon.debug-status) exist as socket IPCs"
- **[[c8]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt` — "the existing applicationConfigurable (parentId=tools, id=ai.insors.insrc.settings), the parent under which the new child pages nest; DaemonGateway/DaemonLifecycleService reused"
- **[[c9]]** `prior-artifact` `docs/epics/integrate-insrc-framework-into-jetbrains-ide-E2026091761d8c73e/` — "thin orchestrator that owns no reasoning of its own"
- **[[c10]]** `convention` `avoid-github-ci-credits / plugin local-verify convention (JDK21 gradlew test buildPlugin)` — "plugin-only, Kotlin/Swing, JDK21, verify locally (no GitHub CI)"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-21T05:48:24.349Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| d1 | citation | LOW | manual | The CLI Daemon pane exists and offers the six lifecycle actions start/stop/restart/update/backup/compact via its daemon service. | CONFIRMED: DaemonPane.tsx invokes all six — svc.daemon.startDaemon (:50), stopDaemon (:53), restart (:55), update (:60), backup (:80), compact (:66). | none — verified sound. |
| d2 | citation | LOW | manual | The CLI Workflows pane lists Epics for a repo and opens an EpicDetail showing the chain state (define/hld/stories/amendments). | CONFIRMED: WorkflowsPane.tsx uses svc.workflow.listEpics (:39), chain (:99) and amendments (:100) — the Epic-list + chain-state read the read-only Workflows page mirrors. | none — verified sound. |
| d3 | citation | LOW | manual | The CLI Debug pane hosts three sections — Daemon, MCP, Logs. | CONFIRMED: DebugPane.tsx imports/uses MCPSection (:25/:40) and LogsSection (:26/:41), plus DaemonSection (:24/:39, read directly) — the three sections. | none — verified sound. |
| d4 | citation | LOW | manual | In the Debug Daemon section, the orphan-process kill is the only mutating control and is gated behind a ConfirmPrompt acting on the explicit selection. | CONFIRMED: DaemonSection.tsx uses debug.scanOrphans (:62), debug.killOrphans (:133) behind a ConfirmPrompt, documented as the ONLY mutating control acting on the explicit selection. | none — verified sound. |
| d5 | external-contract | LOW | manual | The daemon registers the socket IPCs the operational readouts/actions use: daemon.status, daemon.backup, daemon.compact, daemon.shutdown, and daemon.debug-status. | CONFIRMED: src/daemon/index.ts registers 'daemon.backup' (:1456), 'daemon.compact' (:1465), 'daemon.shutdown' (:1450) and 'daemon.debug-status' (:937); daemon.status is called via rpc (daemon.ts). All the socket IPCs the readouts/actions need exist. | none — verified sound. |
| d6 | external-contract | LOW | manual | The orphan scan/kill, MCP listing, and log tail are CLI-LOCAL (POSIX ps+kill, a `mcp list` subprocess, fs-watched log files), not daemon IPCs — so the plugin must reimplement them IDE-natively. | CONFIRMED: debug.ts uses execFileSync('ps', ...) (:227), spawn(bin, ['mcp','list']) (:328), and fsWatch (:494) — so orphan scan/kill, MCP listing, and log tail are CLI-local and must be reimplemented IDE-natively (a real design implication for S004/S005/S006). | none — verified sound. |
| d7 | citation | LOW | manual | The CLI Logs section is a filterable read-only tail with a {minLevel, module, text} filter over a bounded buffer. | CONFIRMED: LogsSection.tsx subscribes via debug.tailLog (:85) into a MAX_BUFFER ring buffer (:29/:86) with a {minLevel,module,text} filter (:122). The log files daemon.log/agent.log exist under a known LOG_DIR (paths.ts:104-105), so S006 can tail them locally. | none — verified sound. |
| d8 | citation | LOW | manual | The plugin's existing InsrcSettingsConfigurable registers the parent applicationConfigurable id ai.insors.insrc.settings under Tools — the node the new child pages nest beneath. | CONFIRMED: plugin.xml:290-291 registers the applicationConfigurable parentId="tools" id="ai.insors.insrc.settings"; InsrcSettingsConfigurable.kt:58 is the class — the exact parent node the new child pages nest under (k4). | none — verified sound. |
| d9 | citation | LOW | manual | The plugin already has a DaemonLifecycleService the Daemon page reuses for start/update/restart. | CONFIRMED: DaemonLifecycleService.kt:28 exists — the plugin machinery the Daemon page reuses for the non-IPC start/update/restart steps. | none — verified sound. |
