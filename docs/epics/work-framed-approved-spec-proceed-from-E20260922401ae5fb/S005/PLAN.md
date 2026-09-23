<!-- insrc:artifact PLAN-401ae5fb7b8537cc-s5 -->

# Plan: E20260923401ae5fb:S005

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790147235518-ps67hf`
**LLD effective hash:** `790f3d6f5efd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc9 amendment types (types.ts): TabRenderer + detailRenderers + PanelHandle bridge | S | — | unit: types.ts structurally exposes TabRenderer + detailRenderers + PanelHandle.onMessage/postMessage (compile-time; exercised transitively by the renderer + host suites constructing against them) | [[c1]] |
| 2 | **`t2`** The two S005 TabRenderers (new detail-renderers.ts) | M | `t1` | unit: renderDaemonTab(gateway) renders gateway.status()'s state + detail into the daemon body (ac1); a missing detail renders just the state (no empty line); unit: renderWorkflowsTab(gateway) renders gateway.workflowChain() rows grouped by slug (one section per slug, one line per stage: stage + status) (ac2); unit: renderWorkflowsTab shows an explicit empty-state when rows=[] (not blank, not error); unit: Both renderers HTML-escape every daemon-derived value (state/detail/slug/stage/status) — an injected '<script>' in a value cannot break out; unit: Both renderers include a Refresh control that (in the rendered html) posts {type:'refresh'}; unit: A renderer lets a gateway rejection propagate (does not swallow it) so the host can degrade | [[c2]] [[c3]] |
| 3 | **`t3`** Amend the sc9 host (webview-host.ts): renderer dispatch + tab-strip buttons + CSP/nonce bridge + on-demand re-render | L | `t1` | unit: openDetailedStatus renders the daemon tab body from detailRenderers.daemon (ac1); switching to workflows renders detailRenderers.workflows (ac2); unit: A {type:'switchTab', tab:'workflows'} message (driven through the fake PanelHandle.onMessage) re-invokes the workflows renderer exactly once and re-sets the html (ac3); unit: A {type:'refresh'} message re-invokes the ACTIVE tab's renderer exactly once (a fresh gateway read at that moment) (ac3); unit: NO timer/interval is armed for the daemon/workflows views — the fake gateway call-count stays flat with no message (no background poll, ac3); unit: An unknown message type, or switchTab with an invalid tab, is a silent no-op (no re-render, no throw); unit: A tab with no renderer (debug) falls back to the S004 'coming soon' placeholder (shipped behaviour preserved); unit: A renderer rejection degrades the tab body in-panel (+warn) and never throws; a setHtml throw after an async render is a logged no-op (never-throw preserved); unit: A late switchTab/refresh after the panel was disposed is skipped (no setHtml on a dead panel) | [[c1]] [[c4]] |
| 4 | **`t4`** extension.ts wiring: enableScripts + detailRenderers + onMessage/postMessage bridge | M | `t2`, `t3` | unit: extension.ts constructs the host with detailRenderers { daemon: renderDaemonTab, workflows: renderWorkflowsTab } and binds the PanelFactory's onMessage->webview.onDidReceiveMessage + postMessage->webview.postMessage; unit: extension.ts creates the Detailed Status panel with enableScripts:true and the rendered shell carries a strict Content-Security-Policy meta + a per-render nonce on the only inline script (no unsafe-inline for arbitrary script) | [[c1]] [[c4]] |
| 5 | **`t5`** Tests: renderers + amended host (message/refresh/no-poll) + source-scan guards | M | `t2`, `t3`, `t4` | unit: Source-scan: detail-renderers.ts imports no 'vscode' and uses no cloud/HTTP (only the injected gateway) — extension.ts stays the sole vscode importer; unit: The webview bootstrap script only posts the two sanctioned message shapes (switchTab/refresh) — source-asserted; unit: Full node:test (tsx --test) sweep is green locally (the aggregate gate over t2/t3/t4 tests) | [[c1]] [[c2]] [[c3]] [[c4]] |

### E20260923401ae5fb:S005:T001 — sc9 amendment types (types.ts): TabRenderer + detailRenderers + PanelHandle bridge

Additively extend vscode-plugin/src/panels/types.ts: export `type TabRenderer = (gateway: DaemonDataGateway) => Promise<string>`; add optional `detailRenderers?: Partial<Record<DetailTab, TabRenderer>>` to WebviewPanelHostDeps; add `onMessage(listener: (message: unknown) => void): void` + `postMessage(message: unknown): void` to PanelHandle. No existing member removed or changed (breaking:false).

**Acceptance checks:**
- types.ts exports TabRenderer + adds the optional detailRenderers field + the two PanelHandle bridge methods
- No existing sc9 type member is removed/renamed (S004's shipped types still compile)
- Compiles under strict/exactOptionalPropertyTypes with .js imports; no 'vscode' import

### E20260923401ae5fb:S005:T002 — The two S005 TabRenderers (new detail-renderers.ts)

Create vscode-plugin/src/panels/detail-renderers.ts with renderDaemonTab (awaits gateway.status(), renders DaemonStatusView state heading + optional detail line + a Refresh control that posts {type:'refresh'}) and renderWorkflowsTab (awaits gateway.workflowChain(), groups WorkflowChainRow[] by slug — one section per slug, one line per stage: stage + status — an explicit empty-state when rows=[], + a Refresh control). Both are VS-Code-free pure fns over the injected gateway and let a gateway rejection propagate (no swallow) so the host degrades. HTML-escape every daemon value via a SINGLE shared escaper — per s3, export escapeHtml from webview-host.ts (or lift it to a shared panels/html.ts) so renderers + host use one escaper (no divergent copy). No vscode, no cloud.

**Acceptance checks:**
- renderDaemonTab renders state + optional detail (missing detail -> just the state); renderWorkflowsTab groups rows by slug with stage+status lines + an empty-state for rows=[]
- Every daemon-derived value (state/detail/slug/stage/status) is HTML-escaped via the shared escaper; a '<script>' in a value cannot break out
- Both include a Refresh control that posts {type:'refresh'}; a gateway rejection propagates (not swallowed); no 'vscode'/cloud import

### E20260923401ae5fb:S005:T003 — Amend the sc9 host (webview-host.ts): renderer dispatch + tab-strip buttons + CSP/nonce bridge + on-demand re-render

Amend vscode-plugin/src/panels/webview-host.ts (kept as ONE atomic L task per s3 — the four sub-concerns mutate the same host closure + share the nonce): (1) renderDetail dispatches to deps.detailRenderers?.[tab] (await) with the existing 'coming soon' placeholder fallback, REUSING the current never-throw outer try/catch (degraded body + logger.warn on reject/setHtml throw preserved); (2) track the per-panel active tab alongside the cached detailPanel ref; (3) rebuild detailHtml's tab strip as real buttons + add a Refresh control, and have shellHtml inject a per-render node-crypto NONCE'd <script> (posts {type:'switchTab',tab}/{type:'refresh'}) + a strict CSP <meta> limiting script-src to that nonce — the CSP meta lives in the SHARED shell so it also covers the repo-config placeholder; (4) subscribe via panel.onMessage(handler) where handler validates msg.type∈{switchTab,refresh} + msg.tab∈DETAIL_TABS, updates the active tab, and re-invokes renderDetail — on-demand ONLY, NO timer/interval; a late message after dispose is skipped (cached-ref guard). Stays VS-Code-free (nonce via node:crypto).

**Acceptance checks:**
- The daemon/workflows tab body comes from detailRenderers[tab]; an unregistered tab (debug) falls back to the 'coming soon' placeholder
- The tab strip is interactive (buttons post switchTab) + a Refresh control posts refresh; a switchTab/refresh message re-invokes the active renderer exactly once (fresh read), with NO timer/interval armed
- The rendered shell carries a strict CSP meta + a per-render nonce on the only inline script (shared shell, covers both panels); an unknown message type / invalid tab is a silent no-op; the host never throws (reuses the S004 setHtml guard) and the core imports no 'vscode'

### E20260923401ae5fb:S005:T004 — extension.ts wiring: enableScripts + detailRenderers + onMessage/postMessage bridge

Amend vscode-plugin/src/extension.ts (sole vscode importer): pass detailRenderers { daemon: renderDaemonTab, workflows: renderWorkflowsTab } into createWebviewPanelHost; flip the PanelFactory's createWebviewPanel to enableScripts:true (shared factory — harmless for the script-less repo placeholder, which the shared CSP shell still covers, per s3); extend the returned PanelHandle with onMessage: (cb) => panel.webview.onDidReceiveMessage(cb) and postMessage: (m) => void panel.webview.postMessage(m). Uses the EXISTING vscode.d.ts shim members (no shim change). Remains the sole 'vscode' importer; no cloud path.

**Acceptance checks:**
- extension.ts constructs the host with { daemon: renderDaemonTab, workflows: renderWorkflowsTab } and binds onMessage->webview.onDidReceiveMessage + postMessage->webview.postMessage
- createWebviewPanel is created with enableScripts:true; extension.ts stays the sole 'vscode' importer and opens no cloud path
- The existing onboarding/status/config-sync wiring + S004 panel behaviour are not regressed; no vscode.d.ts change needed

### E20260923401ae5fb:S005:T005 — Tests: renderers + amended host (message/refresh/no-poll) + source-scan guards

Add vscode-plugin/src/panels/__tests__/detail-renderers.test.ts (the two renderers over fakeGateway: ac1 daemon state/detail incl. missing-detail, ac2 workflows grouped-by-slug + empty-state, XSS-escape, propagate-on-reject, Refresh-posts-refresh). Extend webview-host.test.ts's FakePanel with an onMessage capture + injectMessage + postMessage recorder, and add host tests: detailRenderers body injection (ac1/ac2), switchTab/refresh re-invoke exactly once (ac3), NO timer/interval armed — asserted via a CALL-COUNT check per s3 (the fake gateway counts status/workflowChain calls; count stays flat across a wait with no message and increments by exactly one per switch/refresh), invalid-message no-op, disposed-late-message skip, placeholder fallback, never-throw on renderer reject + setHtml throw. Add a source-scan asserting detail-renderers.ts imports no vscode/uses no cloud + the rendered SHARED shell carries a CSP meta + nonce + the bootstrap posts only switchTab/refresh. Full node:test sweep green locally.

**Acceptance checks:**
- detail-renderers.test.ts proves ac1/ac2 + empty-state + XSS-escape + propagate-on-reject
- The host tests prove switchTab/refresh re-invoke exactly once (fresh read via call-count), NO background poll (call-count flat with no message), invalid/late-message no-op, placeholder fallback, and never-throw; the source-scan proves no-vscode/no-cloud + CSP/nonce in the shared shell
- Full node:test (tsx --test) sweep is green locally; tsc clean; bundle stays thin (no new heavy dep)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderDaemonTab(gateway) renders gateway.status()'s state + detail into the daemon body (ac1); a missing detail renders just the state (no empty line) | `t2` |
| renderWorkflowsTab(gateway) renders gateway.workflowChain() rows grouped by slug (one section per slug, one line per stage: stage + status) (ac2) | `t2` |
| renderWorkflowsTab shows an explicit empty-state when rows=[] (not blank, not error) | `t2` |
| Both renderers HTML-escape every daemon-derived value (state/detail/slug/stage/status) — an injected '<script>' in a value cannot break out | `t2` |
| Both renderers include a Refresh control that (in the rendered html) posts {type:'refresh'} | `t2` |
| A renderer lets a gateway rejection propagate (does not swallow it) so the host can degrade | `t2` |
| openDetailedStatus renders the daemon tab body from detailRenderers.daemon (ac1); switching to workflows renders detailRenderers.workflows (ac2) | `t3` |
| A {type:'switchTab', tab:'workflows'} message (driven through the fake PanelHandle.onMessage) re-invokes the workflows renderer exactly once and re-sets the html (ac3) | `t3` |
| A {type:'refresh'} message re-invokes the ACTIVE tab's renderer exactly once (a fresh gateway read at that moment) (ac3) | `t3` |
| NO timer/interval is armed for the daemon/workflows views — asserted by a fake clock / by counting gateway calls staying flat with no message (no background poll, ac3) | `t3` |
| An unknown message type, or switchTab with an invalid tab, is a silent no-op (no re-render, no throw) | `t3` |
| A tab with no renderer (debug) falls back to the S004 'coming soon' placeholder (shipped behaviour preserved) | `t3` |
| A renderer rejection degrades the tab body in-panel (+warn) and never throws; a setHtml throw after an async render is a logged no-op (never-throw preserved) | `t3` |
| A late switchTab/refresh after the panel was disposed is skipped (no setHtml on a dead panel) | `t3` |
| Source-scan: detail-renderers.ts imports no 'vscode' and uses no cloud/HTTP (only the injected gateway) — extension.ts stays the sole vscode importer | `t5` |
| extension.ts constructs the host with detailRenderers { daemon: renderDaemonTab, workflows: renderWorkflowsTab } and binds the PanelFactory's onMessage->webview.onDidReceiveMessage + postMessage->webview.postMessage | `t4` |
| extension.ts creates the Detailed Status panel with enableScripts:true and the rendered shell carries a strict Content-Security-Policy meta + a per-render nonce on the only inline script (no unsafe-inline for arbitrary script) | `t4` |
| The webview bootstrap script only posts the two sanctioned message shapes (switchTab/refresh) — source-asserted | `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails + dataModelChanges — the additive sc9 amendment (TabRenderer + detailRenderers dep + PanelHandle onMessage/postMessage bridge) over the S004 shell (renderDetail/DETAIL_TABS/shellHtml in webview-host.ts, WebviewPanelHostDeps/PanelHandle in types.ts, PanelFactory in extension.ts)`
- **[[c2]]** `prior-artifact` `LLD s5 contractDetails — the consumed-unchanged sc9 gateway (DaemonDataGateway.status -> DaemonStatusView{state,detail?}; workflowChain -> WorkflowChainView{rows: WorkflowChainRow{slug,stage,status}}) the two renderers read`
- **[[c3]]** `prior-artifact` `LLD s5 invariantsToPreserve — XSS-safe webview: HTML-escape every daemon value (shared escaper) + the CSP/nonce mitigation for enableScripts:true (the S004 cold-review flagged enableScripts:false as the current safety)`
- **[[c4]]** `prior-artifact` `LLD s5 invariantsToPreserve + errorPaths — on-demand ONLY (open/tab-switch/manual Refresh re-read, NO timer/interval; the continuous ticker is Debug-log-only/s6) + host never-throw (reuse the S004 setHtml guard) + message validation (msg.type/msg.tab)`
