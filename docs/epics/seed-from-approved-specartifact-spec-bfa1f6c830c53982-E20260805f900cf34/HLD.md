<!-- insrc:artifact HLD-f900cf34c0342d4f -->

# HLD: A new Debug pane (peer *Pane

## Framework summary

A new Debug pane (peer *Pane.tsx in app.tsx's switcher, k6) with pane-local inner sub-tab navigation over three sections — Daemon, MCP, Logs — backed by a new debug service added to makeServices. The chosen shape (a1) keeps the daemon surface minimal: the status card reuses the existing daemon.status IPC, and the ONE genuinely new daemon contract (a read-only debug-status IPC that returns the daemon's own list of currently-attached socket clients, backed by per-connection tracking in the socket server) is built and consumed entirely inside the MCP-section story. Everything else is client-side: the POSIX orphan scan/kill keys on the managed daemon entry and OS signals (k3), and the log viewer fs.watch-tails the two rotated files on disk (k4) — so the Daemon and Logs sections keep working when the daemon is unreachable. The only cross-STORY contract is the pane's section-hosting shape + the debug-service facade that every section plugs into; it is owned by the foundational scaffold story (S001) that every section story already depends on.

## Architecture shape

Client-side (src/cli): a DebugPane component registered in app.tsx's pane switcher renders exactly one inner section at a time from pane-local state; a new DebugService (added to makeServices, alongside the existing daemon/repo/workflow services) is the single facade each section's data access hangs off. Daemon section: a status card assembled from the existing daemon.status RPC plus client-known fields (socket path, managed pid, install version), and — on POSIX — an orphan scan that shells `ps`, matches the resolved DAEMON_ENTRY (.../daemon/index.js) cmdline, excludes the managed pid, and offers a multi-select confirm-gated kill (graceful signal then force). MCP section: `mcp list` per client for registration/connection, plus the new daemon debug-status RPC for the live attached-client list. Logs section: an fs.watch tailer over the two PATHS.logDir files with a client-side filter.

Daemon-side (src/daemon): a single additive read-only request handler (debug-status) registered beside daemon.status in the handler map (src/daemon/index.ts), served over the existing Unix socket (src/daemon/server.ts), which now keeps a small in-memory registry of accepted connections (a label + pid + connected-at per live connection, added on accept, removed on close). No store access, no streaming, no mutation. The kill action and the log reads never touch the daemon; the daemon-owned data (status + attached clients) is only ever read over IPC (k1), and the pane offers no restart or client-disconnect control (k5).

## Shared contracts

### sc1: Debug pane section-hosting shape + DebugService facade

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The single client-side foundation every Debug section plugs into: how the DebugPane hosts and switches its inner sections (Daemon/MCP/Logs, one full-height at a time) and the DebugService facade (added to makeServices) that each section's data access extends. Owned by the scaffold story so the four section stories — which all depend on it — build against one stable shape.

**Interface sketch (type-level):**

```
// src/cli — type-level only
export type DebugSectionId = 'daemon' | 'mcp' | 'logs';

export interface DebugSection {
  readonly id: DebugSectionId;
  readonly title: string;
  // the section's view is a React component rendered full-height when selected;
  // each section story supplies its own component + wires its data via DebugService
}

// Facade added to the Services object returned by makeServices(); each section
// story augments it with its own read methods (status card fields, orphan scan/kill,
// mcp list + debug-status clients, log tail). s1 defines the empty facade + registration.
export interface DebugService {
  readonly sections: readonly DebugSection[];
}

export interface DebugPaneProps {
  readonly services: { readonly debug: DebugService };
}
```

**Assumptions cited:** [[c1]]

## Story boundaries

### Story E20260805f900cf34:S001

**Owns:** `sc1`

The DebugPane component itself, its registration in app.tsx's pane switcher (k6), the pane-local state that tracks which inner section is shown and the keypress navigation between them, and the wiring of a new DebugService into makeServices. Owns the section-hosting shape + facade (sc1) that the four section stories build against; the concrete section components + their data methods are private to those stories.

### Story E20260805f900cf34:S002

**Depends on:** `sc1`

The Daemon-section status card: reading the existing daemon.status RPC + client-known fields (socket path, managed pid, install version) to render running/uptime/version/socket/repo-count-with-index-state, and inferring stopped/unreachable the way the existing Daemon pane does (a failed status call). All private to s2; consumes only the sc1 hosting shape.

### Story E20260805f900cf34:S003

**Depends on:** `sc1`

The POSIX orphan scan (a `ps` cmdline match on the resolved DAEMON_ENTRY excluding the managed pid), the multi-select + confirm-gated kill (graceful signal then forced escalation), and the non-POSIX 'not supported' degrade (k3). Entirely client-side; no daemon IPC, no shared contract beyond sc1.

### Story E20260805f900cf34:S004

**Depends on:** `sc1`

BOTH sides of the connected-client feature are private to s4: the new daemon debug-status request handler + the per-connection tracking (label/pid/connected-at) added to the socket server, AND the CLI consumption of it, plus the per-client `mcp list` registration view. The debug-status IPC is a new daemon surface but is built and consumed only here (k1 read-only), so it is s4-internal rather than a cross-story contract; the section is strictly read-only (k5).

### Story E20260805f900cf34:S005

**Depends on:** `sc1`

The fs.watch rotation-aware tailer over the two PATHS.logDir files (daemon.log, agent.log), the most-recent-segment resolution + follow-across-rotation, and the persistent level/module/free-text filter bar. Entirely client-side (k4); consumes only sc1.

## Non-functional targets

- **Performance:** The debug-status IPC (attached-client list + any polled status) is bounded to the number of live socket connections; the orphan `ps` scan and `mcp list` are on-entry + explicit-refresh only (not continuous) to avoid steady subprocess churn; the log tail is fs.watch event-driven, not a poll loop.
- **Security:** All daemon-held state is read over IPC only — the CLI never opens the daemon's stores or socket internals (k1); no direct cloud/network access is introduced. The pane is read-only except the one confirm-gated, explicitly-multi-selected orphan kill (k2); it never restarts the daemon or disconnects a client (k5).
- **Observability:** This Epic IS an observability surface; it adds no logging of its own beyond what already flows to the two log files it tails. The new debug-status handler is a plain additive read handler with no persistent side effects.
- **Durability:** No new persistent state — the connected-client registry is in-memory and rebuilt from live connections; the orphan kill is a one-shot OS action behind an explicit confirm, and nothing the pane does mutates on-disk data.

## Rollout

### Phase A — pane foundation

**Stories:** `s1`

s1 owns sc1 (the section-hosting shape + DebugService facade) and registers the DebugPane in app.tsx's switcher; every section story consumes sc1, so the scaffold must land first. Ships as an empty-but-navigable Debug pane (the three sections present, each a placeholder).

**Backward compat:** Adding a new peer pane must not disturb the existing DaemonPane/ReposPane/WorkflowsPane/SetupPane/ModelTiersPane switcher behaviour or their keybindings; the new pane is additive and inert until navigated to.

### Phase B — diagnostic sections

**Stories:** `s2`, `s3`, `s4`, `s5`

All four section stories depend only on s1/sc1 and are independent of each other, so they can be built in any order (or in parallel) once Phase A lands. Each fills in one section: s2 the daemon status card (reuses daemon.status), s3 the orphan scan + guarded multi-select kill, s4 the new debug-status IPC + connected-client + MCP view, s5 the log tailer + filter bar.

**Backward compat:** s4 adds a new read-only debug-status request handler + per-connection tracking to the socket server; this must be purely additive — existing IPC methods (daemon.status, daemon.shutdown, etc.) and the accept/close lifecycle must be unchanged for all current clients (CLI/MCP/workbench).

**Ordering rationale:** The Epic graph is a star: s2/s3/s4/s5 each dependsOn s1 and nothing else, and sc1 is owned by s1 and consumed by all four. So exactly two phases are required: the s1 foundation (owner of the only shared contract) before the four independent section stories. No inter-section ordering exists, so Phase B stories carry no relative order.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Per-connection tracking in the socket server (s4) | Adding accept/close bookkeeping to the live socket is the first per-connection state the server holds; a missed close handler would leak stale 'connected' entries and misreport who is attached. | Register a connection on accept and remove it on BOTH close and error; derive the reported list from currently-live connections each time debug-status is called (never from an append-only log), so a missed event self-corrects on the next query. Keep the change strictly additive to the existing accept path. |
| Orphan cmdline matching (s3) | Matching the daemon entry cmdline can false-positive on an unrelated node process with a similar path, or false-negative on a wrapped/renamed process — and the action is a process kill. | Match the RESOLVED absolute DAEMON_ENTRY path (not a loose substring) and always exclude the managed daemon's own reported pid; present results as recommendations only, with the kill gated behind explicit multi-select + confirm (lc1), so a mis-scan can never auto-terminate anything. |
| Log rotation follow (s5) | pino-roll rotates the log file; a naive fs.watch on a single path can stop receiving new lines after the active segment rolls over, silently freezing the tail. | Resolve the most-recent segment for the chosen category and re-resolve/re-attach the watch when a rotation is detected, so streaming continues across a rollover (lc2). |

## Alternatives considered

### a1: Thin daemon contract + CLI-side debug service — **CHOSEN**

One new daemon.debug-status IPC (status fields + connected-client list) added to the existing handler registry with per-connection tracking in the socket server; everything else (orphan ps scan/kill, log fs.watch tail, `mcp list`) lives in a new CLI-side debug service, and the DebugPane is a peer pane with pane-local sub-tab state.

The Epic's only cross-cutting shared contract is a single new request handler daemon.debug-status registered beside daemon.status in the daemon's handler map (src/daemon/index.ts), served over the existing Unix socket (src/daemon/server.ts). To answer 'who is attached right now' the socket server keeps a small in-memory registry of accepted connections (label/pid/connected-at), and the debug-status handler returns that list plus the status-card fields; the CLI consumes it with the same rpc<T>(method) client used for daemon.status. Everything the daemon does not need to own stays client-side in a new debug service added to makeServices: the POSIX orphan scan/kill keys on DAEMON_ENTRY and OS signals, the log tailer fs.watch-es the two rotated files under PATHS.logDir, and MCP registration status shells `mcp list`.

The DebugPane is a peer *Pane.tsx wired into app.tsx's switcher, holding pane-local state for which inner section (Daemon|MCP|Logs) is shown — the same full-height-one-section idiom the existing panes use. This keeps the daemon surface minimal (one additive IPC), maximises reuse of proven seams (daemon.status, the rpc client, the pane/service convention), and honours the invariants directly: the orphan scan/kill and log tail are CLI-side so the pane still works when the daemon is unreachable, and the pane is read-only apart from the one guarded kill.

**Pros:**
- Adds exactly ONE new daemon IPC method + a small per-connection tracking map — the smallest daemon surface that satisfies the 'live socket clients' requirement
- Honours k3/k4 structurally: orphan scan/kill + log tail are client-side, so the Daemon and Logs sections keep working when the daemon is down (the moment debugging matters most)
- Maximal reuse: daemon.status for the card, the existing rpc<T> client, and the *Pane.tsx + makeServices convention (k6) — no new architectural pattern
- Clean story boundaries: S004 owns the one shared contract (daemon side + client consumption); S002/S003/S005 are independent client-only slices on top of the S001 scaffold

**Cons:**
- Introduces the codebase's first per-connection tracking state in the socket server — a new (if small) daemon-side concern to get right (connect/disconnect bookkeeping)
- Splits debug logic across two processes (a little daemon, mostly CLI), so a reader must look in two places to see the whole Debug pane

**Cost estimate:** M

### a2: Fat daemon debug subsystem, thin pane

Push most diagnostics server-side: a daemon debug module that also performs the orphan scan and reads logs, exposed via several new IPC methods, with the pane as a thin renderer.

Instead of keeping orphan scanning and log tailing on the client, this shape centralises them in a new daemon-side debug subsystem: additional IPC methods for scan-orphans, kill-orphan, list-logs, and tail-logs, plus the connected-client list and status fields. The DebugPane becomes a thin client that only renders whatever the daemon streams or returns.

The appeal is a single home for all diagnostic logic and one access path (everything over IPC). But it inverts the Epic's deliberate boundaries: the orphan scan exists precisely to find a daemon that may be wedged or duplicated, and the log tail exists to be readable when the daemon is down — both are least useful when routed THROUGH the daemon.

**Pros:**
- All diagnostic logic lives in one place (the daemon), so a reader sees the whole picture in one module
- One uniform access path (IPC) for every section, no client-side OS code

**Cons:**
- Directly violates k4 (logs must be readable with no daemon IPC) and the spirit of k3 (orphan scan must work when the managed daemon is wedged/absent) — the pane goes dark exactly when it is needed
- Much larger new daemon surface (4+ new IPC methods incl. a streaming log method the Epic explicitly rules out as a non-goal)
- A daemon-side kill of sibling daemon processes concentrates real blast radius inside the daemon rather than behind an explicit client confirm

**Cost estimate:** L

**Rejected because:** Violates k3 and k4 head-on — the two sections most needed during an outage (orphan scan, log tail) are routed through the very process that may be down — and inflates the daemon surface (4+ new IPC incl. a ruled-out streaming method). Worst fit for the Epic's invariants.

### a3: No daemon changes — CLI OS-introspects the socket

Skip the new debug-status IPC entirely: the CLI reads daemon.status for the card and uses OS tools (lsof/ss) to count peers on the socket, with everything else client-side.

This shape avoids any daemon contract change: the status card comes from the existing daemon.status, and 'who is attached' is approximated by the CLI inspecting the Unix socket with OS tooling to count connected peers. Orphan scan/kill and log tail remain client-side as in a1.

It is the smallest daemon footprint (zero), but it cannot label a connection (which is workbench vs MCP vs CLI) because the socket peer table only yields counts/pids, not the daemon's own notion of each client — so it fails the 'label/pid/connected-at per client' requirement and contradicts the approved decision to add the debug-status IPC.

**Pros:**
- Zero daemon changes — no new IPC, no server-side state
- Entirely client-side, so the whole pane is trivially daemon-down tolerant

**Cons:**
- Cannot label connected clients (raw peer count/pid only), failing S004's 'per client label + connected-at' acceptance criterion
- OS socket introspection (lsof/ss) is brittle + platform-specific and duplicates information the daemon already has authoritatively
- Contradicts the approved spec decision (a NEW daemon debug-status IPC owns the connected-client list), reopening a settled choice

**Cost estimate:** S

**Rejected because:** Scores only partial on k1 (OS socket introspection reaches around the daemon) and cannot deliver S004's per-client label/connected-at (OS peer tables give counts/pids, not the daemon's client identities), so it fails an acceptance criterion and reopens the settled spec decision to add the debug-status IPC.

## Citations

- **[[c1]]** `analyze-bundle` `s1 module.profile — src/cli TUI pane + service architecture: app.tsx pane host/switcher, panes/*Pane.tsx, services/index.ts Services + makeServices`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — daemon handler registry (src/daemon/index.ts, daemon.status at :849) + Unix socket server (src/daemon/server.ts) + rpc<T> client (src/cli/services/daemon.ts:50); DAEMON_ENTRY .../daemon/index.js (daemon.ts:24); no connected-client enumeration today`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — mcp-register/`mcp list` (src/daemon/mcp-register.ts); PATHS.logDir daemon.log + agent.log (src/shared/paths.ts) via the pino-roll logger (src/shared/logger.ts), cli+mcp sharing agent.log`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-05T11:21:35.702Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c2 | citation | LOW | auto | The daemon.status request handler is registered in the daemon handler map at src/daemon/index.ts around line 849. | read src/daemon/index.ts:849 = "'daemon.status': async () => {" — the daemon.status handler is registered exactly at the cited line. | None — anchor resolves verbatim. |
| c2 | citation | LOW | auto | A generic rpc<T>(method) client used to call daemon.status lives in src/cli/services/daemon.ts around line 50. | read src/cli/services/daemon.ts:50 = "return rpc<DaemonStatus>('daemon.status');" — the generic rpc<T> client is at the cited line. | None — anchor resolves. |
| c2 | citation | LOW | auto | DAEMON_ENTRY resolves to the daemon index (.../daemon/index.js) and is defined in src/cli/services/daemon.ts around line 24. | read src/cli/services/daemon.ts:24 = "const DAEMON_ENTRY = join(__dirname, '../../daemon/index.js');" — resolves to the daemon index as cited. | None — anchor resolves. |
| c3 | citation | LOW | auto | PATHS.logDir contains daemon.log and agent.log, defined in src/shared/paths.ts. | read src/shared/paths.ts:104 = "daemonLog: join(LOG_DIR, 'daemon.log'),"; agent.log is the adjacent entry — PATHS.logDir carries both files. | None — anchor resolves. |
| c3 | citation | LOW | auto | The daemon/agent logs are written by a rotating pino-roll logger in src/shared/logger.ts. | read src/shared/logger.ts:66 = "target: 'pino-roll'," — the rotating pino-roll transport is configured there. | None — anchor resolves. |
| c3 | citation | LOW | auto | MCP client registration (mcp list / mcp-register) is handled in src/daemon/mcp-register.ts. | src/daemon/mcp-register.ts resolves as a real file; registerMcpClients drives the mcp list/add argv flow (invoked at index.ts:499 per prior grounding). Mechanism confirmed. | None — anchor resolves. |
| c1 | citation | LOW | auto | The TUI pane switcher lives in src/cli/app.tsx and hosts *Pane.tsx panes (DaemonPane/ReposPane/WorkflowsPane/SetupPane/ModelTiersPane). | src/cli/app.tsx resolves; DaemonPane/ReposPane/WorkflowsPane/SetupPane/ModelTiersPane are established existing panes. Debug pane follows the same *Pane.tsx switcher convention. | None — anchor resolves. |
| c1 | citation | LOW | auto | makeServices in src/cli/services/index.ts builds the Services object (daemon/repo/workflow) that a new DebugService would be added to. | src/cli/services/index.ts resolves; makeServices at :7 builds the Services object a DebugService is added to. Confirmed. | None — anchor resolves. |
| c2 | closed-union | LOW | auto | No connected-client enumeration exists in the daemon today; the debug-status IPC that returns attached socket clients is genuinely new. | grep for debug-status/debugStatus/connectedClients/attachedClients found zero occurrences in src/ — the connected-client debug-status IPC is genuinely new, as the HLD claims. src/daemon/server.ts confirmed as the socket server. | None — the new-surface premise holds. |
| sc1 | ordering | LOW | auto | sc1 is owned by story s1 and consumed by s2/s3/s4/s5, so s1 (Phase A) must land before the four section stories (Phase B). | Internal consistency: sc1 ownedByStory s1, consumedByStories s2/s3/s4/s5; all four section stories dependsOn s1 only. Phase A (s1) before Phase B (s2-s5) is self-consistent with no cycles. | None — ordering is internally consistent. |
