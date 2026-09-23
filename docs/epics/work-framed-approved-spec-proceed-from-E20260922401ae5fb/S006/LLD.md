<!-- insrc:artifact LLD-401ae5fb7b8537cc-s6 -->

# LLD: E20260923401ae5fb:S006

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790073320669-iy7sqb`
**HLD effective hash:** `790f3d6f5efd...`

## HLD context

**Framework:** The Epic re-expresses the shipped JetBrains settings + nested-pages surface on the VS Code side as two net-new injectable seams layered over the extension's existing sc1-sc7 contracts, following the exact S001-S006 convention: small VS-Code-free cores behind injected boundaries, with extension.ts the SOLE 'vscode' importer and every core unit-testable off the editor API via node:test. Editable config lives in native VS Code Settings (a statically-declared, machine-scoped contributes.configuration for the stable global + fixed per-role keys) driven by ONE ConfigSync engine that keeps the native surface truthful to the daemon (pull on activation/refresh, live-push each change with pre-flight validate and revert-on-reject). The read-only Daemon/Workflows/Debug pages and the per-repo editor live behind ONE WebviewPanelHost (a tabbed Detailed Status panel + a separate Repo Configuration panel) fed by a read-only DaemonData gateway over the existing daemon IPC. Everything reaches the daemon only through the existing config.catalog/config.write + read IPC via sc1; no new daemon capability is added.
**Rollout phase:** Phase D — Live pages + per-repo editor
**Consumes:** `sc9` (WebviewPanelHost)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The exact set of stable global config keys declared in contributes.configuration (machine scope) and the mapping from config.catalog paths to those native keys; the last-synced snapshot representation; and the internal validate→write→revert mechanics of the ConfigSync engine. Only the sc8 ConfigSyncEngine + its injected boundary types are exposed; how the pull and the per-change diff are computed is private. — owns `sc8`
- `s2`: How the fixed RoleId taxonomy is enumerated into per-role tier-override keys and rendered as enum (core/mid/cheap) native settings, and how a role's effective tier (default vs override, clamped by coreFloor) is displayed. Consumes sc8 for the actual apply/truthful-sync; adds no new contract.
- `s3`: The toast + auto-revert UX on a rejected write (the loop-suppression while reverting), the reconcile-on-activation and the 'Refresh insrc settings' durable command that drives sc8.pullFromDaemon, and the insrc.advanced escape-hatch handling. Consumes sc8; owns no shared contract.
- `s4`: The status-bar item's 2-item QuickPick menu, the concrete Webview panel lifecycle (create/reveal/dispose), the in-panel tab framework + host↔webview postMessage protocol, the durable palette commands for both panels, and the DaemonDataGateway's concrete IPC/log/process-scan wiring. Only the sc9 WebviewPanelHost + DaemonDataGateway types are exposed; the panel HTML/messaging internals are private. — owns `sc9`
- `s5`: The Daemon status view and the Workflows chain-report rendering inside their tabs, and each view's on-demand refresh control (open/tab-switch/manual). Consumes sc9's host + gateway; adds no new contract and does no background polling.
- `s7`: The Repo Configuration panel's repo picker (populated from sc9's registeredRepos) and the per-repo overrides editor form, plus its own per-repo config writes over the existing sc1 config.write and its inline write-feedback. Consumes sc9 for the panel host + repo list; the form layout + per-repo write handling are private.

## Contract details

**Surface level:** internal-shared

### `TabController`

```typescript
export interface TabController { onActivate(ctx: TabActivationCtx): () => void; }
```

**Parameters:**
- `ctx: TabActivationCtx` — The host-supplied activation context (its postMessage into the active panel's webview) the controller uses while its tab is active.

**Returns:** `() => void` — sc9-amendment type. onActivate is called by the host when the controller's tab BECOMES active (open or switchTab-to); it returns a DISPOSE the host calls when the tab deactivates (switch-away) OR the panel is disposed. Exactly one controller is active at a time; none survives dispose — so a continuous ticker started in onActivate is guaranteed stopped (the nonFunctional 'only the Debug tab runs a ticker').

**Errors:**
- `(none thrown)` when The host wraps onActivate + the returned dispose in try/catch (never-throw); a controller error degrades to logger.warn, not a host throw.

**Preconditions:**
- Registered under WebviewPanelHostDeps.tabControllers[tab].

**Postconditions:**
- The returned dispose is idempotent and stops any timer/watcher armed in onActivate.

### `TabActivationCtx`

```typescript
export interface TabActivationCtx { postMessage(message: unknown): void; }
```

**Returns:** `TabActivationCtx` — sc9-amendment type. The context handed to a TabController's onActivate: postMessage sends a host->webview message to the active panel (S006 uses {type:'appendLog', lines} to push appended log lines to the debug body's #insrc-log appender). The host owns the actual webview.postMessage; the ctx keeps the controller VS-Code-free.

**Preconditions:**
- Only valid during the controller's active window (between onActivate and its dispose).

**Postconditions:**
- A postMessage after dispose is a host-side no-op (the panel may be gone).

### `WebviewPanelHostDeps.tabControllers`

```typescript
tabControllers?: Partial<Record<DetailTab, TabController>>
```

**Returns:** `Partial<Record<DetailTab, TabController>> | undefined` — The sc9 amendment's OPTIONAL per-tab lifecycle controllers, supplied at host construction ALONGSIDE the S005 detailRenderers (which stay unchanged). A tab may have a renderer (static body), a controller (live lifecycle), or both. S006 supplies { debug } (the log-tail ticker).

**Preconditions:**
- Passed to createWebviewPanelHost in extension.ts.

**Postconditions:**
- The host activates tabControllers[tab].onActivate when that tab becomes active and disposes it on deactivate/panel-dispose.

### `WebviewPanelHostDeps.onDetailAction`

```typescript
onDetailAction?: (action: string) => void
```

**Parameters:**
- `action: string` — The sanctioned action id a webview control posted (S006: 'cleanupOrphans').

**Returns:** `void` — The sc9 amendment's OPTIONAL webview-action handler. The host's message handler additionally accepts {type:'action', action:string} and forwards the action string to onDetailAction (still rejecting anything else). extension.ts binds it to the consent+kill flow. Keeps the consent modal (VS Code) out of the VS-Code-free host.

**Errors:**
- `(none thrown)` when The host wraps the onDetailAction call in try/catch (never-throw).

**Preconditions:**
- Passed to createWebviewPanelHost in extension.ts.

**Postconditions:**
- A webview {type:'action'} message reaches onDetailAction; the host performs no mutation itself.

### `DaemonDataGateway.mcpClients`

```typescript
mcpClients(): Promise<readonly McpClientView[]>
```

**Returns:** `Promise<readonly McpClientView[]>` — Consumed UNCHANGED (sc9/S004): the debug renderer lists McpClientView { host, wired } — the wired MCP clients (ac1). Maps daemon.debug-status over sc1; no new capability (k3).

**Errors:**
- `GatewayReadError` when daemon.debug-status fails; the debug renderer lets it propagate and the host degrades the tab body.

**Preconditions:**
- sc9 gateway available (from S004).

**Postconditions:**
- Reaches only daemon.debug-status over sc1 (ac1/k2/k3).

### `DaemonDataGateway.scanOrphans`

```typescript
scanOrphans(): Promise<readonly OrphanProcess[]>
```

**Returns:** `Promise<readonly OrphanProcess[]>` — Consumed UNCHANGED (sc9/S004): the read-only local process scan (OrphanProcess { pid, command }). S006 FILTERS OUT the managed daemon pid (read from PATHS.pidFile) in its own renderer + kill — it does NOT modify S004's scanOrphans. Read-only.

**Errors:**
- `GatewayReadError` when The scan fails; the debug renderer degrades the orphan section.

**Preconditions:**
- sc9 gateway available (from S004).

**Postconditions:**
- Read-only; no mutation, no cloud (k2).

### `ConsentGate.ask`

```typescript
ask(request: ConsentRequest): Promise<ConsentOutcome>
```

**Parameters:**
- `request: ConsentRequest { title, detail, acceptLabel, items? }` — The consent prompt for the orphan kill — title + detail naming the pids to be terminated (items).

**Returns:** `Promise<ConsentOutcome>` — Consumed UNCHANGED (sc4/ad0d45c9): the SINGLE k4 consent contract. Returns 'accepted'|'declined'|'dismissed'. extension.ts's onDetailAction calls ask() and kills NOTHING unless the outcome is 'accepted' (ac3/k4).

**Errors:**
- `(none thrown)` when The modal-message fn resolves; a dismissed dialog -> 'dismissed' (no kill).

**Preconditions:**
- Bound in extension.ts to vscode.window.showInformationMessage(modal:true).

**Postconditions:**
- No process is terminated on any outcome other than 'accepted'.

### `renderDebugTab`

```typescript
export function renderDebugTab(deps: DebugRenderDeps): TabRenderer
```

**Parameters:**
- `deps: DebugRenderDeps { managedPid: () => number | undefined }` — Reads the managed daemon pid (from PATHS.pidFile) so it is EXCLUDED from the offered orphan list (the S004-deferred fix).

**Returns:** `TabRenderer` — S006's debug-tab body renderer (registered into detailRenderers.debug — the S005 seam, no amendment). Awaits gateway.mcpClients() + gateway.scanOrphans(), renders the MCP-clients list (host/wired, ac1), the orphan list EXCLUDING the managed pid, an empty <pre id="insrc-log"> live-log region, and a 'Clean up orphaned processes' <button> that posts {type:'action',action:'cleanupOrphans'} (only shown when >=1 non-managed orphan). VS-Code-free; every value HTML-escaped; a gateway rejection propagates so the host degrades.

**Errors:**
- `GatewayReadError` when Propagated from mcpClients/scanOrphans; the host catches + degrades the tab body.

**Preconditions:**
- Registered under detailRenderers.debug.

**Postconditions:**
- The rendered body includes #insrc-log (the appender target) + the escaped mcp/orphan lists; the managed daemon is never listed/offered.

### `createDebugTabController`

```typescript
export function createDebugTabController(deps: DebugTickerDeps): TabController
```

**Parameters:**
- `deps: DebugTickerDeps { logTail: LogTail; logger: PanelLogger }` — The rotation-aware LogTail seam + logger; onActivate subscribes the tail and posts appended lines.

**Returns:** `TabController` — S006's debug TabController (registered into tabControllers.debug). onActivate(ctx) starts logTail.follow(lines => ctx.postMessage({type:'appendLog', lines})) and returns the tail's dispose — so the live tail runs ONLY while the debug tab is active + stops on switch-away/dispose (ac2). No timer survives dispose.

**Errors:**
- `(none thrown)` when logTail.follow never throws (a read/watch failure degrades to no new lines); onActivate returns a dispose regardless.

**Preconditions:**
- Registered under tabControllers.debug.

**Postconditions:**
- onActivate arms exactly one follow; the returned dispose stops it idempotently.

### `createLogTail`

```typescript
export function createLogTail(deps: LogTailDeps): LogTail
```

**Parameters:**
- `deps: LogTailDeps { logDir: string; stem: string; listSegments; readLines; watch; maxLines }` — Injectable rotation-aware file boundaries (mirrors the CLI tailLogWith over listSegments/readLines/watch on /tmp/.insrc/<stem>.*.log), so the tail is unit-testable off disk. Thin + plugin-local (no bundle bloat).

**Returns:** `LogTail` — A thin rotation-aware tail: `follow(onLines: (lines: readonly string[]) => void): () => void` emits the bounded initial tail then follows appends + rotation (active-segment tracking), returns an idempotent dispose. NEVER throws (a missing dir/read/watch is swallowed). Reads only local files (k2).

**Errors:**
- `(none thrown)` when Missing logDir / read / watch failures are swallowed; follow still delivers what it can.

**Preconditions:**
- logDir/stem name the daemon log (PATHS.logDir + 'daemon').

**Postconditions:**
- dispose() removes the watcher + guarantees no post-dispose emit.

### `createOrphanKill`

```typescript
export function createOrphanKill(deps: OrphanKillDeps): (pids: readonly number[]) => Promise<KillOutcome[]>
```

**Parameters:**
- `deps: OrphanKillDeps { kill: (pid, signal) => void; wait: (ms) => Promise<void>; managedPid: () => number | undefined; platform: NodeJS.Platform }` — Injectable process.kill + a wait + the managed-pid resolver + platform, so the kill is unit-testable + POSIX-gated.

**Returns:** `(pids: readonly number[]) => Promise<KillOutcome[]>` — S006's consent-gated kill seam (NOT on the read-only gateway). For each EXPLICITLY-selected pid (never the managed daemon — re-excluded here): SIGTERM -> wait -> SIGKILL-for-survivors, returns one KillOutcome { pid, result:'terminated'|'forced'|'not-found'|'error' } per pid. Non-POSIX -> all 'error'/no-op. Mirrors the daemon-side killOrphansWith. Only ever called by extension.ts AFTER sc4.ask() -> 'accepted' (ac3/k4).

**Errors:**
- `(none thrown)` when A signal that throws is caught and reported as that pid's KillOutcome 'error'; the managed pid is skipped as 'not-found'.

**Preconditions:**
- Invoked only after a consent 'accepted'; deps.kill is the real process.kill in extension.ts.

**Postconditions:**
- The managed daemon is NEVER signalled; only the passed pids are targeted.

## Data model changes

### `sc9 WebviewPanelHostDeps + host message protocol (amended)` — field-add

The sc9 amendment (additive, non-breaking) adds the Debug-tab lifecycle + action seam ALONGSIDE the S005 detailRenderers (which are UNCHANGED). WebviewPanelHostDeps gains OPTIONAL tabControllers?: Partial<Record<DetailTab, TabController>> + onDetailAction?: (action: string) => void; new types TabController + TabActivationCtx are exported from panels/types.ts. The host (webview-host.ts) is amended to: (a) on the active tab becoming active (open or switchTab-to), call tabControllers[tab]?.onActivate({ postMessage }) and cache its dispose; call that dispose on switch-away, on a re-activate, and on panel dispose (so exactly one controller is live, none survives dispose); (b) its message handler accepts a new {type:'action', action:string} branch that forwards to onDetailAction (still rejecting unknown shapes); (c) its host-owned BOOTSTRAP + a host->webview {type:'appendLog', lines} message: the bootstrap appends escaped lines to #insrc-log when present. No existing sc9 member (detailRenderers, the gateway, switchTab/refresh) is removed or changed; S004/S005 behaviour + tests are preserved. Filed as an additive HLD amendment on the S004-owned sc9 (sharedContract.fieldAdd, breaking:false); sc9 ownership stays with S004.

```
WebviewPanelHostDeps += tabControllers?: Partial<Record<DetailTab, TabController>>
WebviewPanelHostDeps += onDetailAction?: (action: string) => void
+ export interface TabController { onActivate(ctx: TabActivationCtx): () => void }
+ export interface TabActivationCtx { postMessage(message: unknown): void }
webview-host.ts message protocol += webview->host {type:'action',action} ; host->webview {type:'appendLog',lines}
```

**Call sites:**
- `vscode-plugin/src/panels/types.ts`
- `vscode-plugin/src/panels/webview-host.ts`
- `vscode-plugin/src/extension.ts`

### `vscode-plugin/src/panels/debug-renderer.ts (new S006 module)` — new

renderDebugTab(deps) (the debug TabRenderer registered into detailRenderers.debug: mcp-clients list from gateway.mcpClients() + orphan list from gateway.scanOrphans() EXCLUDING the managed pid + an empty #insrc-log region + the consent-triggering 'Clean up' button) and createDebugTabController(deps) (the tabControllers.debug lifecycle: onActivate arms the LogTail follow -> ctx.postMessage appendLog, returns the tail dispose). VS-Code-free; every value escaped (reuse panels/html.ts escapeHtml).

```
+ vscode-plugin/src/panels/debug-renderer.ts (renderDebugTab, createDebugTabController)
```

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/panels/webview-host.ts`

### `vscode-plugin/src/panels/log-tail.ts (new S006 module)` — new

createLogTail(deps): LogTail — a THIN rotation-aware tail over injectable listSegments/readLines/watch (mirroring the CLI src/cli/services/debug.ts tailLogWith, NOT importing it — k5). follow(onLines) emits the maxLines-bounded initial tail of the active segment then follows appends + rotation; idempotent dispose; never-throws. Reads only /tmp/.insrc/<stem>.*.log (PATHS.logDir). extension.ts binds the real fs deps.

```
+ vscode-plugin/src/panels/log-tail.ts (createLogTail, LogTail, LogTailDeps)
```

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/panels/debug-renderer.ts`

### `vscode-plugin/src/panels/orphan-kill.ts (new S006 module)` — new

createOrphanKill(deps): (pids) => Promise<KillOutcome[]> — a POSIX SIGTERM->wait->SIGKILL kill over an injectable process.kill + wait, reading the managed pid (PATHS.pidFile via managedPid()) and NEVER signalling it (re-excluded). Mirrors the daemon-side killOrphansWith. Called ONLY by extension.ts after sc4.ask()->'accepted'. The managed-pid resolver (read ~/.insrc/daemon.pid) is shared with renderDebugTab so the offered list + the kill agree.

```
+ vscode-plugin/src/panels/orphan-kill.ts (createOrphanKill, KillOutcome, OrphanKillDeps, readManagedPid)
```

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/panels/debug-renderer.ts`

### `extension.ts Debug wiring (tabControllers.debug + onDetailAction + detailRenderers.debug)` — field-add

extension.ts (sole vscode importer) wires: detailRenderers.debug = renderDebugTab({ managedPid }); tabControllers = { debug: createDebugTabController({ logTail: createLogTail({ logDir: PATHS.logDir, stem: 'daemon', ...realFsDeps }), logger: panelLog }) }; onDetailAction = async (action) => { if (action!=='cleanupOrphans') return; const orphans = (await daemonData.scanOrphans()).filter(o => o.pid !== managedPid()); if (orphans.length===0) return; const outcome = await consent.ask({ title:'Terminate orphaned insrc processes?', detail:..., acceptLabel:'Terminate', items: orphans.map(o=>`${o.pid} ${o.command}`) }); if (outcome!=='accepted') return; const results = await createOrphanKill({ kill: process.kill, wait, managedPid, platform: process.platform })(orphans.map(o=>o.pid)); status.set(...) }. Reuses the SHIPPED sc4 consent (already constructed) + sc2 StatusSurface. No new command needed (the action is webview-driven; the panel is already palette-reachable, k6).

```
extension.ts: detailRenderers.debug + tabControllers.debug + onDetailAction wired; managedPid resolver from PATHS.pidFile
```

**Call sites:**
- `vscode-plugin/src/extension.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc9` | consumes | S006 CONSUMES sc9 (owned by S004): it reads gateway.mcpClients() (ac1) + gateway.scanOrphans() UNCHANGED, and registers its debug body renderer into the S005 detailRenderers.debug seam (no amendment there). Because the continuous log ticker (ac2) + the webview kill action (ac3) are UNCOVERED by sc9 and by S006's contract-less boundary, S006 requires an ADDITIVE sc9 AMENDMENT (sharedContract.fieldAdd, breaking:false): OPTIONAL tabControllers (a per-DetailTab onActivate/dispose lifecycle the host drives on tab-active + panel-dispose — so the ticker is host-owned + guaranteed stopped) + OPTIONAL onDetailAction (the host forwards a sanctioned {type:'action'} webview message to it) + the host-owned {type:'appendLog'} host->webview protocol (the bootstrap appends to #insrc-log). It adds ALONGSIDE detailRenderers (unchanged), removes/renames nothing, and preserves S004/S005 behaviour. The read-only DaemonDataGateway is NOT extended — the kill is a SEPARATE consent-gated seam (createOrphanKill), keeping the gateway read-only. Ownership of sc9 stays with S004. S006 ALSO CONSUMES the shipped sc4 ConsentGate (owned by ad0d45c9, not in this HLD's slice): the orphan-kill onDetailAction calls consent.ask() and terminates NOTHING unless the outcome is 'accepted' (ac3/k4) — the single k4 gate before the only daemon-mutating action; the consent modal is an extension.ts binding. (a2 reshape-detailRenderers + a3 webview-self-poll were rejected in s3.) |

## Error paths

### Error cases

- **The user clicks 'Clean up' but declines or dismisses the consent modal.** (recoverable)
  - Detection: extension.ts's onDetailAction awaits consent.ask() and checks the ConsentOutcome; 'declined'/'dismissed' is any value !== 'accepted'.
  - Response: Return immediately WITHOUT calling createOrphanKill — no process is signalled; optionally surface 'cleanup cancelled' via sc2 StatusSurface.
  - User impact: Nothing is terminated (ac3/k4); the Debug tab is unchanged.
- **gateway.mcpClients() or scanOrphans() rejects while the debug renderer builds the tab body.** (recoverable)
  - Detection: renderDebugTab awaits the gateway calls without catching; the GatewayReadError propagates to the host's renderDetail try/catch (S005 never-throw wrapper).
  - Response: The host degrades the debug tab body to an error state + logger.warn; the tab strip stays; no kill button is shown (no orphan data).
  - User impact: The Debug tab shows a read error instead of a crash; switching tabs / Refresh retries.
- **The daemon log dir/file is missing or a read/watch fails while the live tail is active.** (recoverable)
  - Detection: createLogTail's follow wraps every listSegments/readLines/watch call in try/catch (never-throws); a missing dir yields no segments, a watch failure yields no follow events.
  - Response: follow delivers whatever initial tail it can (possibly empty) and simply stops receiving new lines; onActivate still returns a valid dispose. The #insrc-log region shows the last-known lines (or an empty state), never an error thrown to the host.
  - User impact: The log section is empty/stale rather than crashing the tab; when the daemon starts writing again the watcher (re-installed on the next debug-activate) resumes.
- **A process.kill signal throws (EPERM / the pid exited between scan and kill / ESRCH).** (recoverable)
  - Detection: createOrphanKill wraps each deps.kill(pid, signal) in try/catch; a throw on SIGTERM/SIGKILL is caught per-pid.
  - Response: Map that pid to KillOutcome { result:'error' } (or 'not-found'/'forced' per the SIGTERM->probe->SIGKILL sequence); continue the other pids; return the full outcome list. extension.ts surfaces a summary via sc2 StatusSurface.
  - User impact: A pid that can't be killed is reported (not silently dropped); the others are still cleaned; no throw.
- **A webview posts a {type:'action'} whose action is not a sanctioned id (unknown/absent action, or a spoofed message).** (recoverable)
  - Detection: The host forwards only a validated {type:'action', action:string} to onDetailAction; extension.ts's handler checks action === 'cleanupOrphans' before doing anything.
  - Response: Any non-'cleanupOrphans' action is a silent no-op (no consent, no kill); a malformed message is already rejected by the host's shape validation.
  - User impact: None — an unknown/spoofed action does nothing.
- **A log-append postMessage fires after the debug tab was switched away or the panel disposed (a late tail emit).** (recoverable)
  - Detection: The host caches the ACTIVE controller's dispose and calls it on switch-away/dispose; createLogTail's dispose flips a disposed flag so no onLines fires after dispose; additionally the host's postMessage to a gone panel is a no-op.
  - Response: No appendLog is posted after deactivate (the tail is disposed first); a race is a host-side postMessage no-op. No throw, no leak.
  - User impact: None — the log stops updating the instant the tab is left; nothing accumulates in the background.

### Edge cases

| Input | Expected |
| :--- | :--- |
| gateway.scanOrphans() returns ONLY the managed daemon (no true orphans). | renderDebugTab filters out the managed pid -> the orphan list is empty and the 'Clean up' button is NOT shown; the managed daemon is never offered. |
| gateway.mcpClients() returns [] (no attached clients). | The MCP section renders an explicit empty-state ('No MCP clients attached.'), not a blank/error. |
| The debug tab is opened, switched away, and re-opened. | Each activation arms exactly one log-tail follow and each deactivation disposes it (exactly one tail live at a time); re-open starts a fresh tail with a fresh bounded initial tail — no duplicate tickers. |
| The daemon log rotates (active segment daemon.log rolls to daemon.1.log, a new daemon.log starts) while the tail is following. | The rotation-aware follow tracks the new active segment and continues emitting appended lines without dropping/duplicating across the roll (mirrors the CLI tailLogWith segment tracking). |
| The user selects the cleanup but there are zero non-managed orphans by the time onDetailAction runs. | onDetailAction sees an empty filtered list and returns WITHOUT prompting consent or killing (no empty 'terminate 0 processes' modal). |
| Running on a non-POSIX platform (win32) where process signalling differs. | createOrphanKill's platform gate returns 'error'/no-op outcomes rather than mis-signalling; the scan (defaultProcessScan) already returns empty on win32, so the button typically never appears. |

### Invariants to preserve

- NO process is EVER terminated without an explicit consent 'accepted' (ac3/k4): the webview click only posts an action; extension.ts calls sc4.ask() and invokes createOrphanKill ONLY on 'accepted'. The consent modal is the single k4 gate before the only daemon-mutating action in the epic. [[c3]]
- The MANAGED daemon is NEVER offered or signalled: renderDebugTab excludes the managed pid (PATHS.pidFile) from the orphan list, and createOrphanKill re-excludes it before any signal (the S004-deferred fix). The scan/offer/kill all agree on the same managedPid resolver. [[c3]]
- The continuous log ticker runs ONLY while the debug tab is active and is STOPPED on tab-switch-away + panel dispose (the nonFunctional 'only the Debug log tail runs a continuous ticker'): the host arms tabControllers[debug].onActivate on debug-active and calls its dispose on deactivate/dispose — exactly one tail live, none survives dispose. Daemon/Workflows (S005) remain on-demand-only. [[c4]]
- extension.ts remains the SOLE 'vscode' importer: the debug renderer/controller + the LogTail + the OrphanKill are VS-Code-free over injected boundaries (gateway, LogTail fs deps, process.kill, managedPid, sc4 ask); only extension.ts binds process.kill/showInformationMessage/the real fs. [[c1]]
- The read-only DaemonDataGateway stays read-only: the kill is a SEPARATE consent-gated seam (createOrphanKill), NOT a gateway method. No new DAEMON capability (k3): mcp via the existing daemon.debug-status; logs + processes are LOCAL fs/OS reads; no cloud (k2). [[c2]]
- The sc9 host stays never-throw + XSS-safe: the debug renderer's body reuses the S005 CSP/nonce shell + escapeHtml (every mcp/orphan/log value escaped, incl. appended log lines escaped by the host before #insrc-log insertion); the host wraps onActivate/dispose/onDetailAction in try/catch. S004/S005 behaviour + tests are preserved (the amendment is additive; detailRenderers/switchTab/refresh unchanged). [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test) over injected fakes — the shipped vscode-plugin panels convention (webview-host.test.ts / detail-renderers.test.ts / process-scan.test.ts); no VS Code host, no live daemon, no real fs/process (fake watch/kill/clock).`

### Test levels

- **unit** — Drive renderDebugTab as a pure fn over a fake gateway + fake managedPid, asserting the mcp list (ac1) + the managed-pid-excluded orphan list + the log region + the conditional Clean-up button, XSS-safe.
  - Subjects: `renderDebugTab lists gateway.mcpClients() as host/wired rows (ac1); an empty client list renders an explicit empty-state`, `renderDebugTab renders the gateway.scanOrphans() orphan list EXCLUDING the managed pid (managedPid()); when only the managed daemon is scanned the orphan list is empty and the 'Clean up' button is NOT shown`, `the 'Clean up orphaned processes' button is shown ONLY when >=1 non-managed orphan exists and (in the html) posts {type:'action',action:'cleanupOrphans'}`, `the body includes an empty <pre id="insrc-log"> appender target`, `every mcp/orphan value (host/command) is HTML-escaped; a gateway rejection propagates (not swallowed) so the host degrades`
  - Fixtures: `Fake DaemonDataGateway scripting mcpClients()/scanOrphans() (incl. empty + managed-only + reject variants)`, `A fake managedPid resolver`
- **unit** — Drive createLogTail over injectable listSegments/readLines/watch fakes, asserting the rotation-aware follow + bounded initial tail + idempotent dispose + never-throws (ac2 mechanism).
  - Subjects: `follow emits the maxLines-bounded initial tail of the active segment, then follows appended lines on a watch event`, `a rotation (active segment rolls; a new active segment appears) is tracked — subsequent appends emit from the new segment without dropping/duplicating across the roll`, `dispose() is idempotent and guarantees NO onLines fires after dispose (no post-dispose emit)`, `a missing logDir / a readLines throw / a watch throw is SWALLOWED — follow never throws and still delivers what it can`
  - Fixtures: `Injectable listSegments/readLines/watch fakes (scriptable segment list, per-file lines, a manual watch trigger)`, `A fixture simulating a rotation (segment list change between reads)`
- **unit** — Drive createOrphanKill over an injectable kill/wait/managedPid/platform, asserting SIGTERM->SIGKILL, the managed-pid exclusion, per-pid outcomes, and non-POSIX gating (ac3 safety).
  - Subjects: `for a live pid: SIGTERM -> (still alive after wait) -> SIGKILL -> KillOutcome 'forced'; for a pid that dies on SIGTERM -> 'terminated'`, `the managed daemon pid is NEVER signalled even if passed in — reported 'not-found'/skipped; only the explicitly-passed non-managed pids are targeted`, `a kill that throws (EPERM/ESRCH) is caught per-pid and reported as 'error'; the other pids still proceed; the fn never throws`, `on a non-POSIX platform the kill no-ops/reports 'error' rather than mis-signalling`
  - Fixtures: `Injectable kill (records (pid,signal), scriptable alive/throw), a synchronous wait fake, a managedPid resolver, a platform value`
- **unit** — Drive createDebugTabController + the amended host, asserting the ticker lifecycle (arm-on-active / stop-on-switch-away+dispose) + the appendLog append + the action route (ac2/ac3).
  - Subjects: `createDebugTabController.onActivate(ctx) arms exactly ONE logTail.follow and postMessages {type:'appendLog',lines} on each emit; the returned dispose stops the follow idempotently`, `host: activating the debug tab (open or switchTab-to 'debug') calls tabControllers.debug.onActivate; switching AWAY or disposing the panel calls the returned dispose EXACTLY once (no ticker survives; only one live at a time)`, `host: a {type:'appendLog',lines} host->webview message appends the (escaped) lines to #insrc-log via the bootstrap (source/asserted on the rendered shell + the append protocol)`, `host: a {type:'action',action:'cleanupOrphans'} webview message is forwarded to onDetailAction; an unknown action / malformed message is a silent no-op (no throw)`, `host: onActivate/dispose/onDetailAction throwing is caught (never-throw preserved); S004/S005 behaviour (detailRenderers, switchTab/refresh, daemon/workflows on-demand) is unchanged`
  - Fixtures: `The S004/S005 fake PanelFactory (setHtml + posted messages + injectMessage) extended for tab-activation`, `A fake LogTail (scriptable follow emits + a dispose recorder) + fake clock`, `A recording onDetailAction + fake logger`
- **unit** — Drive extension.ts's onDetailAction consent+kill orchestration over fakes, asserting NO kill unless consent 'accepted' + the managed-pid filter + the empty-orphan short-circuit (ac3).
  - Subjects: `onDetailAction('cleanupOrphans') with >=1 non-managed orphan calls consent.ask(); on 'accepted' it calls the kill with exactly those pids; on 'declined'/'dismissed' it calls the kill NEVER (ac3/k4)`, `onDetailAction filters the managed pid out of scanOrphans() before prompting; with zero non-managed orphans it returns WITHOUT prompting consent or killing (no empty modal)`, `any action !== 'cleanupOrphans' is a no-op (no consent, no kill)`, `the kill outcome is surfaced via the sc2 StatusSurface (a summary), never console`
  - Fixtures: `A fake ConsentGate (scripted outcome), a fake scanOrphans, a recording kill fn, a fake managedPid, a fake StatusSurface`
- **unit** — Static/source guards — the debug seams stay VS-Code-free + the amendment is additive.
  - Subjects: `Source-scan: debug-renderer.ts + log-tail.ts + orphan-kill.ts import no 'vscode' and use no cloud/HTTP (extension.ts stays the sole vscode importer)`, `Source-scan: log-tail.ts does NOT import the daemon-side src/cli/services/debug.ts (k5 bundle stays thin) — it is a plugin-local tail`, `types.ts adds TabController/TabActivationCtx + tabControllers/onDetailAction ADDITIVELY (no existing sc9 member removed/renamed; detailRenderers preserved)`
  - Fixtures: `Read of the new source files + types.ts`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(renderer): renderDebugTab lists gateway.mcpClients() host/wired rows (empty-state when none)` |
| `ac2` | `unit(logtail): follow emits the initial tail then follows appends + rotation; dispose is idempotent + never-throws`, `unit(controller/host): onActivate arms one follow + postMessages appendLog; switch-away/dispose stops it (exactly one live, none survives) — the log tails live while the tab stays open and stops when left`, `unit(host): a {type:'appendLog'} message appends escaped lines to #insrc-log` |
| `ac3` | `unit(kill): SIGTERM->SIGKILL, managed pid never signalled, per-pid outcomes, non-POSIX gated`, `unit(extension onDetailAction): NO kill unless consent.ask()->'accepted'; managed-pid filtered; zero-orphan short-circuit (no prompt)`, `unit(host): {type:'action','cleanupOrphans'} is forwarded to onDetailAction; unknown action is a no-op` |

## Alternatives considered

### a1: Minimal additive host hooks: a per-tab TabController (host-side ticker) + an onDetailAction route — **CHOSEN**

Amend sc9 with two OPTIONAL additive deps — a per-DetailTab TabController the host activates/deactivates (host-owned ticker lifecycle + postMessage append) and an onDetailAction handler the host forwards a sanctioned webview action to — leaving S005's detailRenderers untouched.



### a2: Unified per-tab TabController that SUPERSEDES detailRenderers

Reshape sc9 so each tab is ONE controller { render, onActivate?, onAction? }, migrating S005's daemon/workflows renderers into controllers and folding S006's ticker + action into the same contract.



**Rejected because:** Meets every AC but drops to PARTIAL on sc9 (s3): it REPLACES the S005-owned detailRenderers member (a remove/rename — arguably breaking, not additive) and forces MIGRATING S005's daemon/workflows renderers into the new controller shape — a cross-story change that re-opens a shipped contract + couples S005's/S006's evolution, which the additive a1 avoids for a cohesion win S006 does not need.

### a3: Webview self-poll refresh + an onDetailAction route (no host ticker hook)

Avoid a host lifecycle hook: the debug body's nonce'd script arms its OWN setInterval that posts {type:'refresh'} while the debug tab is visible, and the host re-renders the whole debug tab (re-reading the log tail) each tick; add only the onDetailAction route for the kill.



**Rejected because:** Drops to PARTIAL on ac2 (s3): a full-body re-render on a webview-armed interval resets scroll/focus + re-fetches mcp/orphans each tick, a full-tail re-read can drop/duplicate lines across a mid-tick rotation, and it moves the ticker lifecycle into fragile webview timing (harder to prove stop-on-switch-away/dispose) — degrading the story's central live-log feature for a one-amendment saving.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/panels/webview-host.ts + types.ts — the S005 detailRenderers one-shot render + the switchTab/refresh-only message bridge + the never-throw/CSP-nonce shell the S006 amendment extends (adding tabControllers/onDetailAction/appendLog)`
- **[[c2]]** `code` `vscode-plugin/src/panels/daemon-gateway.ts + process-scan.ts — the read-only sc9 gateway (mcpClients/scanOrphans) consumed unchanged; the kill is a SEPARATE seam off the gateway (managed-pid exclusion = the S004-deferred fix)`
- **[[c3]]** `code` `vscode-plugin/src/surfaces/consent-gate.ts + src/cli/services/debug.ts — sc4 ConsentGate.ask() the kill gates through (k4/ac3) + the killOrphansWith/managed-pid-exclusion parity the OrphanKill seam mirrors`
- **[[c4]]** `doc` `HLD nonFunctional — 'only the Debug log tail runs a continuous ticker' + sc9 owning 'the host<->webview postMessage protocol'; src/shared/paths.ts logDir/daemonLog + logger.ts pino-roll (the rotation-aware tail target)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-09-23T08:38:29.360Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | The sc9 gateway exposes mcpClients() and scanOrphans() (consumed unchanged for ac1 + the orphan list), both real methods on daemon-gateway.ts. | CONFIRMED: daemon-gateway.ts:78 async mcpClients(), :119 async scanOrphans() — both real gateway methods consumed unchanged (ac1 + orphan list). | No change. |
| cl2 | citation | LOW | manual | sc4 ConsentGate.ask(request) returns 'accepted'\|'declined'\|'dismissed' (the k4 gate the kill uses; nothing killed unless 'accepted'). | CONFIRMED: consent-gate.ts:20 `ConsentOutcome = 'accepted' \| 'declined' \| 'dismissed'`; :23/:34 ask(request): Promise<ConsentOutcome>. The k4 gate the kill uses is exactly as described. | No change. |
| cl3 | citation | LOW | manual | The daemon logs are files at PATHS.logDir (/tmp/.insrc) with PATHS.daemonLog = daemon.log, and PATHS.pidFile = ~/.insrc/daemon.pid (the managed pid source) — the tail target + the exclusion source. | CONFIRMED: paths.ts:103 logDir: LOG_DIR (/tmp/.insrc), :104 daemonLog: <LOG_DIR>/daemon.log, and pidFile exists (~/.insrc/daemon.pid). The tail target + the managed-pid source are real. | No change. |
| cl4 | external-contract | LOW | manual | The daemon logs via pino-roll (rotating segments), so a rotation-aware tail must track the active segment — the reason createLogTail follows appends + rotation. | CONFIRMED: logger.ts:66 pino-roll transport; debug-types.ts documents the `<stem>.*.log` rotation glob. The rotation-aware-tail requirement is grounded. | No change. |
| cl5 | citation | LOW | manual | The CLI src/cli/services/debug.ts is the parity reference: tailLogWith (rotation-aware tail over listSegments/readLines/watch) + killOrphansWith (SIGTERM->wait->SIGKILL, managed pid excluded) — which S006's LogTail + OrphanKill mirror WITHOUT importing (k5). | CONFIRMED: src/cli/services/debug.ts:406 tailLogWith + :180 killOrphansWith (SIGTERM->SIGKILL) — the daemon-side parity S006's thin LogTail + OrphanKill mirror without importing (k5). | No change — the parity references are real; keep the plugin-local re-implementation to avoid bundle bloat. |
| cl6 | semantic | LOW | manual | The S004 defaultProcessScan/scanOrphans does NOT exclude the managed daemon pid — so S006 must filter it in its own renderer + kill (the S004-deferred fix); process-scan.ts is read-only (never kills). | CONFIRMED: process-scan.ts is wired as gateway.scanOrphans (extension.ts:200) and contains NO pidFile/managedPid/kill reference — it does not exclude the managed daemon and never kills. S006's own managed-pid filter (renderer + kill) is the correct S004-deferred fix without modifying S004's read-only scan. | No change — the exclusion belongs in S006's renderer/kill, agreeing on one managedPid resolver. |
| cl7 | semantic | LOW | manual | The S005 sc9 surface offers a ONE-SHOT detailRenderers (TabRenderer) + a switchTab/refresh-only message bridge — NO per-tab activation lifecycle hook and NO webview->host action route, so S006's ticker + kill-action are genuinely uncovered (the amendment premise). | CONFIRMED: webview-host.ts has detailRenderers + switchTab/refresh but NO tabControllers/onDetailAction/onActivate anywhere in vscode-plugin/src — the per-tab lifecycle hook + the action route are genuinely uncovered, so the additive amendment is justified (not a silent build). | No change — the amendment premise holds. |
| cl8 | semantic | LOW | manual | The S005 host is XSS-safe (CSP + per-render nonce) + never-throws (guarded setHtml/openSingleton) + escapeHtml is shared in panels/html.ts — the discipline the debug renderer + the appendLog append reuse. | CONFIRMED: webview-host.ts:229 the CSP meta; html.ts:30 makeNonce; html.ts escapeHtml shared by the host + renderers. The debug renderer + the host appendLog reuse the shipped XSS/nonce discipline. | No change — escape appended log lines host-side before #insrc-log insertion, as the LLD states. |
| cl9 | semantic | LOW | manual | The sc9 DaemonDataGateway is READ-ONLY (status/workflowChain/mcpClients/registeredRepos/scanOrphans; no mutating method) — so S006 keeps the kill OFF the gateway as a separate seam. | CONFIRMED: types.ts:47 interface DaemonDataGateway with status/workflowChain/mcpClients/registeredRepos/scanOrphans and NO kill/terminate method — the gateway is read-only, so keeping the kill as a separate seam is correct. | No change. |
| cl10 | semantic | LOW | manual | extension.ts is the SOLE 'vscode' importer + already constructs the sc4 consent gate + the sc2 StatusSurface (reused for the kill flow) + the panel host (where tabControllers/onDetailAction/detailRenderers.debug get wired). | CONFIRMED: extension.ts:12 the sole `import * as vscode`; :203 createWebviewPanelHost; the sc4 consent gate + sc2 StatusSurface are already constructed there (reused for the kill flow). The wiring site is real. | No change. |
| cl11 | closed-union | LOW | manual | DetailTab is 'daemon'\|'workflows'\|'debug' — tabControllers is keyed by it and S006 supplies only the 'debug' entry. | CONFIRMED: types.ts:25 `DetailTab = 'daemon' \| 'workflows' \| 'debug'` — the closed union tabControllers is keyed by; S006 supplies only the 'debug' entry. | No change. |
| cl12 | cross-artifact | LOW | manual | sc9 is owned by S004 (not S006); S006 consumes it + extends it ONLY via an additive amendment (tabControllers/onDetailAction) that removes/renames nothing and leaves the S005 detailRenderers untouched. | CONFIRMED: the HLD boundary assigns sc9 to S004; the LLD marks role=consumes + raises the extension as an additive sharedContract.fieldAdd (breaking:false) leaving detailRenderers untouched — ownership stays with S004. | No change — the additive-amendment framing is correct. |
