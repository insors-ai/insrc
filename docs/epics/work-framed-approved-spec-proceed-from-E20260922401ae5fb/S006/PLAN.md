<!-- insrc:artifact PLAN-401ae5fb7b8537cc-s6 -->

# Plan: E20260923401ae5fb:S006

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790151917927-0ozn6q`
**LLD effective hash:** `790f3d6f5efd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc9 amendment types (types.ts): TabController + TabActivationCtx + tabControllers/onDetailAction | S | — | unit: types source-scan: TabController/TabActivationCtx + tabControllers/onDetailAction added ADDITIVELY (no existing sc9 member removed/renamed; detailRenderers preserved) | [[c1]] |
| 2 | **`t2`** Thin rotation-aware LogTail (new log-tail.ts) | M | — | unit: log-tail: follow emits the maxLines-bounded initial tail then follows appended lines on a watch event; unit: log-tail: a rotation (active segment roll) is tracked — appends emit from the new segment without drop/duplicate; unit: log-tail: dispose() is idempotent and guarantees no onLines fires after dispose; unit: log-tail: a missing dir / readLines throw / watch throw is swallowed — follow never throws | [[c2]] |
| 3 | **`t3`** Consent-gated OrphanKill seam + shared managedPid resolver (new orphan-kill.ts) | M | — | unit: orphan-kill: a live pid -> SIGTERM->SIGKILL 'forced'; a pid dying on SIGTERM -> 'terminated'; unit: orphan-kill: the managed daemon pid is never signalled even if passed in ('not-found'); only non-managed pids targeted; unit: orphan-kill: a per-pid kill throw is caught as 'error', the others proceed, the fn never throws; unit: orphan-kill: non-POSIX no-ops/reports 'error'; readManagedPid parses to number\\|undefined and never throws | [[c3]] |
| 4 | **`t4`** Debug renderer + controller (new debug-renderer.ts) | M | `t1`, `t2` | unit: renderDebugTab: lists gateway.mcpClients() host/wired rows; empty client list renders an explicit empty-state (ac1); unit: renderDebugTab: orphan list EXCLUDES the managed pid; managed-only scan -> empty orphan list, no Clean-up button; unit: renderDebugTab: the Clean-up button shows ONLY with >=1 non-managed orphan and posts {type:'action',action:'cleanupOrphans'}; unit: renderDebugTab: body includes an empty <pre id="insrc-log">; every mcp/orphan value escaped; a gateway rejection propagates; unit: createDebugTabController: onActivate arms exactly ONE logTail.follow -> postMessage appendLog per emit; returned dispose is idempotent | [[c1]] [[c2]] [[c4]] |
| 5 | **`t5`** Amend the sc9 host (webview-host.ts): tab-controller lifecycle + action route + appendLog bootstrap | L | `t1` | unit: host: activating the debug tab (open or switchTab-to 'debug') calls tabControllers.debug.onActivate; switch-away/dispose calls the returned dispose EXACTLY once (one live); unit: host: a {type:'appendLog',lines} message appends the escaped lines to #insrc-log via the bootstrap (rendered-shell + append protocol); unit: host: a {type:'action','cleanupOrphans'} message is forwarded to onDetailAction; an unknown action / malformed message is a silent no-op; unit: host: onActivate/dispose/onDetailAction throwing is caught (never-throw); S004/S005 detailRenderers/switchTab/refresh + daemon/workflows on-demand unchanged | [[c1]] [[c4]] |
| 6 | **`t6`** extension.ts wiring: detailRenderers.debug + tabControllers.debug + onDetailAction consent+kill | M | `t3`, `t4`, `t5` | unit: extension onDetailAction: >=1 non-managed orphan -> consent.ask; kill on 'accepted' with exactly those pids; kill NEVER on 'declined'/'dismissed' (k4); unit: extension onDetailAction: managed pid filtered from scanOrphans() before prompting; zero non-managed orphans -> returns WITHOUT prompting or killing; unit: extension onDetailAction: action !== 'cleanupOrphans' is a no-op; the kill outcome surfaces via the sc2 StatusSurface | [[c3]] [[c4]] |
| 7 | **`t7`** Tests: debug renderer/controller + log-tail + orphan-kill + host lifecycle/action + extension consent-kill + source-scans | M | `t2`, `t3`, `t4`, `t5`, `t6` | unit: source-scan: debug-renderer.ts + log-tail.ts + orphan-kill.ts import no 'vscode' and use no cloud/HTTP (extension.ts stays the sole vscode importer); unit: source-scan: log-tail.ts does NOT import the daemon-side src/cli/services/debug.ts (k5 bundle stays thin); smoke: full node:test (tsx --test) sweep green + tsc clean + the k5 bundle allowlist (node:* + vscode only) still holds | [[c1]] [[c2]] [[c3]] [[c4]] |

### E20260923401ae5fb:S006:T001 — sc9 amendment types (types.ts): TabController + TabActivationCtx + tabControllers/onDetailAction

Additively extend vscode-plugin/src/panels/types.ts: export `interface TabController { onActivate(ctx: TabActivationCtx): () => void }` + `interface TabActivationCtx { postMessage(message: unknown): void }`; add optional `tabControllers?: Partial<Record<DetailTab, TabController>>` + `onDetailAction?: (action: string) => void` to WebviewPanelHostDeps. No existing member removed/changed (breaking:false); PanelHandle.postMessage (S005) is reused for the ctx.

**Acceptance checks:**
- types.ts exports TabController + TabActivationCtx and adds the two optional WebviewPanelHostDeps fields
- No existing sc9 type member (detailRenderers/PanelHandle/DaemonDataGateway) is removed/renamed — S004/S005 types still compile
- Compiles under strict/exactOptionalPropertyTypes with .js imports; no 'vscode' import

### E20260923401ae5fb:S006:T002 — Thin rotation-aware LogTail (new log-tail.ts)

Create vscode-plugin/src/panels/log-tail.ts: createLogTail(deps: LogTailDeps { logDir, stem, listSegments, readLines, watch, maxLines }): LogTail with follow(onLines): () => void — emits the maxLines-bounded initial tail of the active segment, then follows appends + rotation (active-segment tracking) on a watch event; idempotent dispose flips a disposed flag (no post-dispose emit + removes the watcher); NEVER throws (every listSegments/readLines/watch call try/caught). Mirrors the CLI src/cli/services/debug.ts tailLogWith WITHOUT importing it (k5). VS-Code-free; reads only local files.

**Acceptance checks:**
- follow emits the bounded initial tail then follows appended lines on a watch event; a rotation (active segment change) is tracked without drop/duplicate
- dispose() is idempotent and guarantees no onLines fires after dispose
- a missing dir / readLines throw / watch throw is swallowed (never throws); imports no 'vscode', no cloud, and NOT src/cli/services/debug.ts

### E20260923401ae5fb:S006:T003 — Consent-gated OrphanKill seam + shared managedPid resolver (new orphan-kill.ts)

Create vscode-plugin/src/panels/orphan-kill.ts: readManagedPid(pidFile) (read+parse ~/.insrc/daemon.pid -> number|undefined, never throws) + createOrphanKill(deps: OrphanKillDeps { kill, wait, managedPid, platform }): (pids) => Promise<KillOutcome[]> — for each explicitly-passed pid (NEVER the managed daemon; re-excluded as 'not-found'): SIGTERM -> wait -> SIGKILL-for-survivors, one KillOutcome{pid,result:'terminated'|'forced'|'not-found'|'error'} per pid; a kill throw is caught per-pid as 'error'; non-POSIX -> no-op/'error'. Mirrors the CLI killOrphansWith WITHOUT importing it. VS-Code-free; NOT on the read-only gateway.

**Acceptance checks:**
- createOrphanKill: a live pid -> SIGTERM->SIGKILL 'forced'; a pid dying on SIGTERM -> 'terminated'; a kill throw -> 'error'; the managed pid is never signalled ('not-found')
- readManagedPid parses the pidFile to a number (or undefined on missing/garbage) and never throws
- non-POSIX platform no-ops/reports 'error'; imports no 'vscode', no cloud; is NOT a gateway method

### E20260923401ae5fb:S006:T004 — Debug renderer + controller (new debug-renderer.ts)

Create vscode-plugin/src/panels/debug-renderer.ts: renderDebugTab(deps { managedPid }): TabRenderer — awaits gateway.mcpClients() (host/wired list, empty-state when none; ac1) + gateway.scanOrphans() (filter out managedPid()), renders the escaped mcp + orphan lists, an empty <pre id="insrc-log">, and a 'Clean up orphaned processes' <button> posting {type:'action',action:'cleanupOrphans'} ONLY when >=1 non-managed orphan; a gateway rejection propagates so the host degrades. createDebugTabController(deps { logTail, logger }): TabController — onActivate(ctx) starts logTail.follow(lines => ctx.postMessage({type:'appendLog', lines})) and returns the tail's dispose. VS-Code-free; reuse panels/html.ts escapeHtml.

**Acceptance checks:**
- renderDebugTab lists mcpClients (host/wired, empty-state) + the managed-pid-excluded orphans + #insrc-log; the Clean-up button (posting {type:'action','cleanupOrphans'}) shows ONLY with >=1 non-managed orphan; every value escaped; a gateway reject propagates
- createDebugTabController.onActivate arms exactly one logTail.follow -> ctx.postMessage appendLog and returns the tail dispose (idempotent)
- imports no 'vscode', no cloud

### E20260923401ae5fb:S006:T005 — Amend the sc9 host (webview-host.ts): tab-controller lifecycle + action route + appendLog bootstrap

Amend vscode-plugin/src/panels/webview-host.ts (ONE atomic host change — the pieces share the panel closure): (1) a per-panel active-controller lifecycle — activateTab(tab) disposes the previous controller then calls deps.tabControllers?.[tab]?.onActivate({ postMessage: (m)=>panel.postMessage(m) }) caching its dispose; invoked from openDetailedStatus (initial active tab) + handleDetailMessage (switchTab) + on panel onDidDispose (dispose the live controller). Exactly one controller live; none survives dispose. (2) handleDetailMessage += a {type:'action', action:string} branch -> deps.onDetailAction?.(action) (validated; unknown/malformed rejected; wrapped in the never-throw guard). (3) the host BOOTSTRAP += a window 'message' listener that on {type:'appendLog', lines} appends each line to #insrc-log via textContent (inherently XSS-safe). Stays VS-Code-free + never-throw; S004/S005 detailRenderers/switchTab/refresh behaviour unchanged.

**Acceptance checks:**
- activating a tab with a controller calls onActivate({postMessage}); switching away / re-activating / disposing the panel calls the previous controller's dispose exactly once (one live at a time, none survives dispose)
- a {type:'action',action} message forwards to onDetailAction; an unknown action / malformed message is a silent no-op; the appendLog bootstrap appends lines to #insrc-log via textContent
- the host stays never-throw (onActivate/dispose/onDetailAction try/caught) + XSS-safe (CSP/nonce unchanged); detailRenderers/switchTab/refresh + daemon/workflows on-demand behaviour is preserved

### E20260923401ae5fb:S006:T006 — extension.ts wiring: detailRenderers.debug + tabControllers.debug + onDetailAction consent+kill

Amend vscode-plugin/src/extension.ts (sole vscode importer): build a shared managedPid = () => readManagedPid(PATHS.pidFile); pass detailRenderers.debug = renderDebugTab({ managedPid }); tabControllers = { debug: createDebugTabController({ logTail: createLogTail({ logDir: PATHS.logDir, stem: 'daemon', listSegments/readLines/watch over node:fs, maxLines }), logger: panelLog }) }; onDetailAction = async (action) => { if (action!=='cleanupOrphans') return; const orphans=(await daemonData.scanOrphans()).filter(o=>o.pid!==managedPid()); if(!orphans.length) return; const outcome=await consent.ask({title,detail,acceptLabel:'Terminate',items}); if(outcome!=='accepted') return; const results=await createOrphanKill({kill:process.kill,wait,managedPid,platform:process.platform})(orphans.map(o=>o.pid)); status.set(<summary>) }. Reuses the already-constructed sc4 consent + sc2 StatusSurface; no new command; no vscode.d.ts change; remains the sole 'vscode' importer.

**Acceptance checks:**
- extension.ts wires detailRenderers.debug + tabControllers.debug (logTail over real node:fs deps) + onDetailAction, with ONE shared managedPid resolver (PATHS.pidFile) used by both the renderer and the kill
- onDetailAction filters the managed pid, short-circuits on zero orphans (no prompt), calls consent.ask, and calls the kill ONLY on 'accepted'; the outcome surfaces via sc2 StatusSurface
- extension.ts stays the sole 'vscode' importer, opens no cloud path, adds no new command, and does not regress S004/S005 wiring

### E20260923401ae5fb:S006:T007 — Tests: debug renderer/controller + log-tail + orphan-kill + host lifecycle/action + extension consent-kill + source-scans

Add vscode-plugin/src/panels/__tests__/{debug-renderer,log-tail,orphan-kill}.test.ts + extend webview-host.test.ts (+ an extension onDetailAction test). Aggregates the per-task suites above; adds the cross-cutting source-scans (3 new files no vscode/no cloud; log-tail not importing src/cli debug.ts) and the full-sweep smoke. node:test (tsx --test) over injected fakes — no VS Code host, no live daemon, fake watch/kill/clock.

**Acceptance checks:**
- all three seams + the debug renderer/controller + the host lifecycle/action + the extension consent-kill orchestration are covered (ac1/ac2/ac3), incl. the no-kill-without-consent + managed-exclusion + one-ticker-live assertions
- source-scans prove the 3 new files import no 'vscode'/no cloud, log-tail.ts does not import src/cli/services/debug.ts, and the sc9 amendment is additive (no member removed)
- full node:test (tsx --test) sweep is green locally; tsc clean; bundle stays thin

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderDebugTab lists gateway.mcpClients() as host/wired rows (ac1); an empty client list renders an explicit empty-state | `t4` |
| renderDebugTab renders the gateway.scanOrphans() orphan list EXCLUDING the managed pid (managedPid()); when only the managed daemon is scanned the orphan list is empty and the 'Clean up' button is NOT shown | `t4` |
| the 'Clean up orphaned processes' button is shown ONLY when >=1 non-managed orphan exists and (in the html) posts {type:'action',action:'cleanupOrphans'} | `t4` |
| the body includes an empty <pre id="insrc-log"> appender target | `t4` |
| every mcp/orphan value (host/command) is HTML-escaped; a gateway rejection propagates (not swallowed) so the host degrades | `t4` |
| follow emits the maxLines-bounded initial tail of the active segment, then follows appended lines on a watch event | `t2` |
| a rotation (active segment rolls; a new active segment appears) is tracked — subsequent appends emit from the new segment without dropping/duplicating across the roll | `t2` |
| dispose() is idempotent and guarantees NO onLines fires after dispose (no post-dispose emit) | `t2` |
| a missing logDir / a readLines throw / a watch throw is SWALLOWED — follow never throws and still delivers what it can | `t2` |
| for a live pid: SIGTERM -> (still alive after wait) -> SIGKILL -> KillOutcome 'forced'; for a pid that dies on SIGTERM -> 'terminated' | `t3` |
| the managed daemon pid is NEVER signalled even if passed in — reported 'not-found'/skipped; only the explicitly-passed non-managed pids are targeted | `t3` |
| a kill that throws (EPERM/ESRCH) is caught per-pid and reported as 'error'; the other pids still proceed; the fn never throws | `t3` |
| on a non-POSIX platform the kill no-ops/reports 'error' rather than mis-signalling | `t3` |
| createDebugTabController.onActivate(ctx) arms exactly ONE logTail.follow and postMessages {type:'appendLog',lines} on each emit; the returned dispose stops the follow idempotently | `t4` |
| host: activating the debug tab (open or switchTab-to 'debug') calls tabControllers.debug.onActivate; switching AWAY or disposing the panel calls the returned dispose EXACTLY once (no ticker survives; only one live at a time) | `t5` |
| host: a {type:'appendLog',lines} host->webview message appends the (escaped) lines to #insrc-log via the bootstrap (source/asserted on the rendered shell + the append protocol) | `t5` |
| host: a {type:'action',action:'cleanupOrphans'} webview message is forwarded to onDetailAction; an unknown action / malformed message is a silent no-op (no throw) | `t5` |
| host: onActivate/dispose/onDetailAction throwing is caught (never-throw preserved); S004/S005 behaviour (detailRenderers, switchTab/refresh, daemon/workflows on-demand) is unchanged | `t5` |
| onDetailAction('cleanupOrphans') with >=1 non-managed orphan calls consent.ask(); on 'accepted' it calls the kill with exactly those pids; on 'declined'/'dismissed' it calls the kill NEVER (ac3/k4) | `t6` |
| onDetailAction filters the managed pid out of scanOrphans() before prompting; with zero non-managed orphans it returns WITHOUT prompting consent or killing (no empty modal) | `t6` |
| any action !== 'cleanupOrphans' is a no-op (no consent, no kill) | `t6` |
| the kill outcome is surfaced via the sc2 StatusSurface (a summary), never console | `t6` |
| Source-scan: debug-renderer.ts + log-tail.ts + orphan-kill.ts import no 'vscode' and use no cloud/HTTP (extension.ts stays the sole vscode importer) | `t7` |
| Source-scan: log-tail.ts does NOT import the daemon-side src/cli/services/debug.ts (k5 bundle stays thin) — it is a plugin-local tail | `t7` |
| types.ts adds TabController/TabActivationCtx + tabControllers/onDetailAction ADDITIVELY (no existing sc9 member removed/renamed; detailRenderers preserved) | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s6 — sc9 additive host/types amendment: TabController/TabActivationCtx + tabControllers/onDetailAction on WebviewPanelHostDeps, the per-panel activateTab controller lifecycle, and the host-owned {type:'appendLog'} bootstrap over the S005 detailRenderers/switchTab/refresh surface (types.ts + webview-host.ts)`
- **[[c2]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s6 — thin rotation-aware LogTail seam: createLogTail over injectable listSegments/readLines/watch, bounded initial tail + follow + idempotent never-throw dispose, mirroring the CLI src/cli/services/debug.ts tailLogWith without importing it (k5)`
- **[[c3]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s6 — consent-gated OrphanKill seam: readManagedPid + createOrphanKill (SIGTERM->SIGKILL, managed-daemon excluded, per-pid KillOutcome, non-POSIX gated), mirroring the CLI killOrphansWith; off the read-only gateway`
- **[[c4]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s6 — debug renderer/controller + extension.ts wiring: renderDebugTab (mcpClients ac1 + managed-pid-excluded orphans + conditional cleanup button) into detailRenderers.debug, createDebugTabController into tabControllers.debug, and the onDetailAction consent(sc4)+kill+StatusSurface(sc2) orchestration with one shared managedPid resolver`
