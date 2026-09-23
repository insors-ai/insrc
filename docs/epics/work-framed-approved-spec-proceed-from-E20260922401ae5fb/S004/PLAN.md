<!-- insrc:artifact PLAN-401ae5fb7b8537cc-s4 -->

# Plan: E20260922401ae5fb:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790084888032-vo5nbo`
**LLD effective hash:** `790f3d6f5efd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc9 types + injected-boundary types (panels/types.ts) | S | — | unit: panels/types.ts structurally exposes the sc9 host/gateway/view types (compile-time structural assertion; covered transitively by the host + gateway suites constructing against these types) | [[c1]] [[c2]] |
| 2 | **`t2`** vscode.d.ts shim: Webview + QuickPick additive declarations | S | — | unit: tsc --noEmit compile gate proves extension.ts's createWebviewPanel/showQuickPick usage type-checks against the extended shim (and StatusBarItem.command still resolves) | [[c3]] |
| 3 | **`t3`** DaemonDataGateway core (panels/daemon-gateway.ts) — all 5 methods wired | M | `t1` | unit: status() maps a DaemonStatus payload (incl. one with missing optional fields) to a valid DaemonStatusView { state, detail? }; unit: registeredRepos() maps repo.list -> RepoRef[]; mcpClients() maps daemon.debug-status clients on the reachable branch -> McpClientView[], and an unreachable payload -> empty McpClientView[]; unit: workflowChain() returns empty rows on absent artifactsRoot and rejects GatewayReadError on a malformed/unreadable chain file; unit: scanOrphans() maps a scripted process scan to OrphanProcess[], rejects GatewayReadError on scan failure, and never mutates/kills; unit: Each daemon-backed method calls ONLY its expected sc1 rpc method name (fake client records it) and the source-scan confirms no undici/fetch/http and no 'vscode' import in daemon-gateway.ts | [[c2]] [[c4]] |
| 4 | **`t4`** WebviewPanelHost core (panels/webview-host.ts) — shell + menu + tab framework | L | `t1`, `t3` | unit: showStatusMenu offers EXACTLY two items (Detailed Status, Repo Configuration) and routes each choice to the matching open method (ac1); unit: Cancel path: pickMenu resolving undefined opens no panel (no-op); unit: openDetailedStatus creates ONE panel with the fixed daemon/workflows/debug tab triad, defaults to 'daemon', and renders the daemon body from gateway.status() (ac2); unit: Degraded render: a rejected gateway.status() still opens the panel + tabs with a daemon-tab error state and never throws (host never-throw invariant); unit: Single-instance: a second openDetailedStatus reveals the same panel and switches tab without duplicating; after onDidDispose a later open creates fresh; unit: openRepoConfiguration creates/reveals the separate Repo Configuration panel shell (single-instance); unit: Source-scan: webview-host.ts imports no 'vscode' module (extension.ts stays the sole vscode importer) | [[c1]] [[c5]] |
| 5 | **`t5`** sc3 InsrcCommandId additive union + package.json palette commands | S | — | unit: The sc3 InsrcCommandId union additively includes insrc.status.menu/detailed/repoConfig with no existing member removed; unit: package.json contributes.commands includes insrc.status.detailed + insrc.status.repoConfig with their titles (ac3/k6) and NOT insrc.status.menu | [[c6]] |
| 6 | **`t6`** extension.ts integration — build gateway + host, wire status-bar click + 3 commands | M | `t2`, `t4`, `t5` | unit: The activation test asserts the status-bar item's command is set to insrc.status.menu and the host commands (menu/detailed/repoConfig) are registered | [[c1]] [[c7]] |
| 7 | **`t7`** Update command-count tests (packaging + activation) | S | `t5`, `t6` | unit: The packaging test's exact command set is updated to include the two new palette commands (and NOT insrc.status.menu, which is the status-bar item command, not a palette entry); unit: Full node:test (tsx --test) sweep is green locally | [[c6]] [[c8]] |

### E20260922401ae5fb:S004:T001 — sc9 types + injected-boundary types (panels/types.ts)

Create vscode-plugin/src/panels/types.ts with the sc9 contract VERBATIM from the LLD/HLD sketch: DetailTab='daemon'|'workflows'|'debug'; WebviewPanelHost { openDetailedStatus(tab?), openRepoConfiguration() }; DaemonDataGateway { status, workflowChain, mcpClients, registeredRepos, scanOrphans }; the View types (DaemonStatusView{state,detail?}, WorkflowChainView{rows}, WorkflowChainRow{slug,stage,status}, McpClientView{host,wired}, OrphanProcess{pid,command}, RepoRef{path,name}); and the injected-boundary types PanelFactory, MenuPicker, ProcessScan, WebviewPanelHostDeps, DaemonDataGatewayDeps, plus GatewayReadError. No surface members beyond the sketch.

**Acceptance checks:**
- panels/types.ts exports all sc9 host/gateway/view types matching the LLD interfaceSketch exactly (no added surface members)
- Injected-boundary types (PanelFactory/MenuPicker/ProcessScan/WebviewPanelHostDeps/DaemonDataGatewayDeps) + GatewayReadError are declared
- Compiles under strict/exactOptionalPropertyTypes with .js import extensions; imports no 'vscode'

### E20260922401ae5fb:S004:T002 — vscode.d.ts shim: Webview + QuickPick additive declarations

Additively extend the compile-only vscode.d.ts shim (no @types/vscode) with the net-new API the panels need: window.createWebviewPanel + WebviewPanel { webview{html,postMessage,onDidReceiveMessage}, reveal, onDidDispose, dispose, active, visible } + ViewColumn, and window.showQuickPick + QuickPickItem. Leave the existing StatusBarItem.command (and every other member) unchanged.

**Acceptance checks:**
- vscode.d.ts declares createWebviewPanel/WebviewPanel/Webview/ViewColumn + showQuickPick/QuickPickItem
- No existing shim member is modified or removed (StatusBarItem.command still present)
- extension.ts's real vscode usage of these APIs type-checks against the shim

### E20260922401ae5fb:S004:T003 — DaemonDataGateway core (panels/daemon-gateway.ts) — all 5 methods wired

Implement createDaemonDataGateway(deps) as the VS-Code-free read-only facade wiring all five methods: status()->client.rpc('daemon.status') mapped to DaemonStatusView{state,detail?} (tolerating absent optional fields); registeredRepos()->repo.list mapped to RepoRef[]; mcpClients()->daemon.debug-status mapping clients ONLY on the reachable branch of the {reachable}-discriminated union (unreachable -> empty McpClientView[]); workflowChain()->local .insrc/artifacts read (absent root -> empty rows, read/parse failure -> GatewayReadError); scanOrphans()->injected ProcessScan (read-only, never kills). Each method reaches only sc1/local fs/process — no cloud/HTTP; failures reject GatewayReadError (the gateway surfaces no UI).

**Acceptance checks:**
- status/registeredRepos/mcpClients map their sc1 rpc payloads into the View types; mcpClients reads clients on the reachable branch only (unreachable -> empty McpClientView[])
- workflowChain returns empty rows on absent artifactsRoot and rejects GatewayReadError on read/parse failure; scanOrphans is read-only
- The core imports no 'vscode' and uses no undici/fetch/http — only the sc1 client + node fs/process (ac4/k2/k3)

### E20260922401ae5fb:S004:T004 — WebviewPanelHost core (panels/webview-host.ts) — shell + menu + tab framework

Implement createWebviewPanelHost(deps) as the VS-Code-free host: showStatusMenu() shows a 2-item QuickPick (Detailed Status, Repo Configuration) via deps.pickMenu and routes to openDetailedStatus()/openRepoConfiguration() (cancel = no-op); openDetailedStatus(tab?) creates-or-reveals a SINGLE Detailed Status panel with the fixed daemon/workflows/debug tab framework, landing on 'daemon' by default, rendering the daemon body from gateway.status() (degrading to an in-panel error + logger.warn on reject, never throwing) and leaving Workflows/Debug as placeholders for s5/s6; openRepoConfiguration() creates-or-reveals the separate Repo Configuration panel shell (form body deferred to s7). Single-instance discipline via a cached reference cleared on panel.onDidDispose; a panel-create failure is caught+logged (visible no-op). Kept as one L task per s3 critique — the concerns share one host closure + cached-reference state; the acceptanceChecks decompose it for discrete tests.

**Acceptance checks:**
- showStatusMenu offers EXACTLY two items and routes each choice; a dismissed pick is a no-op (ac1)
- openDetailedStatus creates one panel with the daemon/workflows/debug tabs, defaults to 'daemon', renders daemon body from gateway.status(); a rejected status still opens the panel+tabs with a daemon-tab error state (ac2)
- Single-instance: a second open reveals/switches-tab without duplicating; onDidDispose clears the cached ref so a later open creates fresh; the host never throws
- openRepoConfiguration creates/reveals the separate Repo Configuration panel shell (ac2-adjacent); the core imports no 'vscode'

### E20260922401ae5fb:S004:T005 — sc3 InsrcCommandId additive union + package.json palette commands

Additively extend the closed InsrcCommandId union in surfaces/command-registry.ts with the three new ids ('insrc.status.menu', 'insrc.status.detailed', 'insrc.status.repoConfig') — no existing member changed (same additive touch S003 made for insrc.settings.refresh). Add the two durable palette commands to package.json contributes.commands: insrc.status.detailed ('insrc: Open Detailed Status') and insrc.status.repoConfig ('insrc: Open Repo Configuration'). insrc.status.menu is the status-bar item's command (set in extension.ts), NOT a palette entry.

**Acceptance checks:**
- InsrcCommandId includes the 3 new ids additively; no existing member removed/changed
- package.json contributes.commands gains exactly the 2 palette entries (detailed + repoConfig) with their titles; insrc.status.menu is not a palette command
- No new daemon capability (k3)

### E20260922401ae5fb:S004:T006 — extension.ts integration — build gateway + host, wire status-bar click + 3 commands

In extension.ts (sole vscode importer): construct the DaemonDataGateway (over the existing sc1 client + an artifactsRoot resolver + a concrete ProcessScan) and the WebviewPanelHost (PanelFactory wrapping window.createWebviewPanel, MenuPicker wrapping window.showQuickPick), set the raw statusItem.command = 'insrc.status.menu' (the StatusBarHandle/sc2 wrapper is unchanged), and register the 3 commands via the sc3 CommandRegistry (menu->showStatusMenu, detailed->openDetailedStatus, repoConfig->openRepoConfiguration), all after the host is built so a click never reaches an unbuilt host. No cloud path introduced.

**Acceptance checks:**
- extension.ts builds the gateway (sc1 client + artifactsRoot + ProcessScan) and the host (real PanelFactory/MenuPicker), and remains the sole 'vscode' importer
- statusItem.command is set to 'insrc.status.menu' and the 3 commands are registered (ac1/ac3), all after host construction
- The existing onboarding/status-surface lifecycle is not regressed; no cloud path (ac4/k2)

### E20260922401ae5fb:S004:T007 — Update command-count tests (packaging + activation)

Update the exact-command-set assertion in __tests__/packaging.test.ts to include the 2 new palette commands (insrc.status.detailed + insrc.status.repoConfig) and NOT insrc.status.menu (status-bar-only), and the workspace/__tests__/activation.test.ts assertions to cover the status-bar command wiring + registered host commands — the same test touch S003 required so the suite stays green.

**Acceptance checks:**
- packaging.test.ts asserts the new exact command set (existing + 2 palette commands; menu excluded)
- activation.test.ts asserts statusItem.command = insrc.status.menu and the host commands are registered
- Full node:test sweep is green locally

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| createWebviewPanelHost.showStatusMenu offers EXACTLY two menu items (Detailed Status, Repo Configuration) and routes each choice to the matching open method (ac1) | `t4` |
| createWebviewPanelHost.openDetailedStatus creates ONE panel with the fixed daemon/workflows/debug tab triad, landing on 'daemon' by default, and renders the daemon body from gateway.status() (ac2) | `t4` |
| openDetailedStatus single-instance: a second call reveals the same panel (and switches tab) rather than creating a duplicate; after onDidDispose it creates fresh | `t4` |
| openRepoConfiguration creates/reveals the separate Repo Configuration panel shell (single-instance) | `t4` |
| Cancel path: pickMenu resolving undefined is a no-op (no panel opened) | `t4` |
| Degraded render: a rejected gateway.status() still opens the panel + tabs and shows a daemon-tab error state, never throwing (host never-throw invariant) | `t4` |
| status() maps a DaemonStatus payload (incl. one missing optional fields) to a valid DaemonStatusView { state, detail? } | `t3` |
| registeredRepos() maps repo.list -> RepoRef[]; mcpClients() maps daemon.debug-status { clients } -> McpClientView[] | `t3` |
| workflowChain() returns empty rows when the artifacts root is absent, and rejects GatewayReadError on a malformed/unreadable chain file | `t3` |
| scanOrphans() maps a scripted process scan to OrphanProcess[] and rejects GatewayReadError on a scan failure (and never mutates/kills) | `t3` |
| Each daemon-backed method calls ONLY its expected sc1 rpc method name (recorded by the fake client) and no HTTP/cloud path is opened | `t3` |
| Source-scan: src/panels/webview-host.ts + daemon-gateway.ts import no 'vscode' module (extension.ts stays the sole vscode importer) | `t3`, `t4` |
| Source-scan: the gateway core contains no cloud/HTTP client usage (undici/fetch/http) — only sc1 + fs + process (ac4/k2) | `t3` |
| The sc3 InsrcCommandId union additively includes insrc.status.menu/detailed/repoConfig with no existing member removed | `t5` |
| package.json contributes.commands includes insrc.status.detailed + insrc.status.repoConfig with their titles (ac3/k6) | `t5` |
| The packaging test's exact command set is updated to include the two new palette commands (and NOT insrc.status.menu, which is the status-bar item command, not a palette entry) | `t7` |
| The activation test asserts the status-bar item's command is set to insrc.status.menu and the host commands are registered | `t6`, `t7` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails — WebviewPanelHost/showStatusMenu + status-bar 'insrc.status.menu' click wiring (sc9 + sc2 consume)`
- **[[c2]]** `prior-artifact` `LLD s4 interactionWithShared/invariants — the read-only DaemonDataGateway over the existing sc1 SharedIpcClient (daemon.status/repo.list/daemon.debug-status); no cloud, no new daemon capability (ac4/k2/k3)`
- **[[c3]]** `prior-artifact` `LLD s4 dataModelChanges — src/vscode.d.ts additive Webview + QuickPick declarations (StatusBarItem.command already present)`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails + review LOW — gateway method mappings incl. mcpClients reachable-branch of the daemon.debug-status union, workflowChain .insrc/artifacts read, scanOrphans ProcessScan (read-only), GatewayReadError`
- **[[c5]]** `prior-artifact` `LLD s4 contractDetails + errorPaths — the host shell: single-instance create/reveal/dispose, fixed daemon/workflows/debug tab framework (default daemon), degraded status render, never-throw`
- **[[c6]]** `prior-artifact` `LLD s4 dataModelChanges — additive InsrcCommandId union (insrc.status.menu/detailed/repoConfig) + package.json contributes.commands (2 palette entries); consumes shipped sc3`
- **[[c7]]** `prior-artifact` `LLD s4 dataModelChanges — extension.ts integration (sole vscode importer builds gateway+host, sets statusItem.command, registers 3 commands after host construction)`
- **[[c8]]** `prior-artifact` `LLD s4 testStrategy — packaging.test.ts + workspace/activation.test.ts command-count updates (the S003 test touch); node:test convention`
