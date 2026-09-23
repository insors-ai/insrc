<!-- insrc:artifact LLD-401ae5fb7b8537cc-s5 -->

# LLD: E20260923401ae5fb:S005

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
- `s6`: The Debug tab: the MCP-clients list rendering, the continuous polling-ticker live log tail (rotation-aware, the only continuously-refreshing view), and the consent-gated orphan-process cleanup (via the shipped sc4 ConsentGate before any kill). Consumes sc9; the ticker + confirm UX are private.
- `s7`: The Repo Configuration panel's repo picker (populated from sc9's registeredRepos) and the per-repo overrides editor form, plus its own per-repo config writes over the existing sc1 config.write and its inline write-feedback. Consumes sc9 for the panel host + repo list; the form layout + per-repo write handling are private.

## Contract details

**Surface level:** internal-shared

### `TabRenderer`

```typescript
export type TabRenderer = (gateway: DaemonDataGateway) => Promise<string>
```

**Parameters:**
- `gateway: DaemonDataGateway` — The read-only sc9 gateway the renderer reads from (status/workflowChain) to build its tab body.

**Returns:** `Promise<string>` — The HTML BODY of one Detail tab (escaped/inner content only; the host wraps it in the panel shell + tab strip). Introduced by the sc9 amendment; S005 implements the daemon + workflows renderers.

**Errors:**
- `(propagates)` when A renderer may let a gateway GatewayReadError propagate; the host catches it and renders a degraded body (never-throw stays the host's invariant).

**Preconditions:**
- The renderer is a pure data->html function; it reaches the daemon only via the injected gateway (no vscode, no cloud).

**Postconditions:**
- Returns a self-contained HTML fragment for the tab; the host re-invokes it on open/switch/refresh.

### `WebviewPanelHostDeps.detailRenderers`

```typescript
detailRenderers?: Partial<Record<DetailTab, TabRenderer>>
```

**Returns:** `Partial<Record<DetailTab, TabRenderer>> | undefined` — The sc9 amendment's OPTIONAL per-tab renderer map, supplied at host construction. A tab with no entry falls back to the existing 'coming soon' placeholder (preserving S004 behaviour + the debug tab until s6). S005 supplies { daemon, workflows }.

**Preconditions:**
- Passed to createWebviewPanelHost in extension.ts (the sole vscode importer).

**Postconditions:**
- The host renders the active tab via detailRenderers[tab] when present, else the placeholder.

### `PanelHandle.onMessage`

```typescript
onMessage(listener: (message: unknown) => void): void
```

**Parameters:**
- `listener: (message: unknown) => void` — Receives webview->host messages ({type:'switchTab',tab} | {type:'refresh'}) so the host can re-render on-demand.

**Returns:** `void` — sc9-amendment addition to the injected PanelHandle boundary: wraps webview.onDidReceiveMessage so the host core stays VS-Code-free. Bound in extension.ts's PanelFactory.

**Preconditions:**
- The panel was created with enableScripts:true (the amendment flips this on for the Detailed Status panel).

**Postconditions:**
- The host receives each webview message and routes switchTab/refresh to a re-render.

### `WebviewPanelHost.openDetailedStatus`

```typescript
openDetailedStatus(tab?: DetailTab): void
```

**Parameters:**
- `tab: DetailTab` _(optional)_ — The tab to open on; S005 consumes the existing default 'daemon'. Consumed unchanged from sc9.

**Returns:** `void` — Consumed as-is: the sc9 host opens/reveals the single Detailed Status panel. Under the amendment its tab strip is now interactive (real buttons post switchTab) and the active tab body comes from detailRenderers.

**Errors:**
- `(none thrown)` when Host never-throws is preserved by the amendment (renderer errors degrade in-panel).

**Preconditions:**
- The host was constructed with detailRenderers (S005's map) in extension.ts.

**Postconditions:**
- The daemon tab (default) renders gateway.status() (ac1); switching to workflows renders gateway.workflowChain() (ac2).

### `DaemonDataGateway.status`

```typescript
status(): Promise<DaemonStatusView>
```

**Returns:** `Promise<DaemonStatusView>` — Consumed unchanged: the daemon renderer reads { state, detail? } and renders the current operational status (ac1). No gateway change.

**Errors:**
- `GatewayReadError` when daemon.status failed/unreachable; the daemon renderer lets it propagate and the host degrades the body.

**Preconditions:**
- sc9 gateway available (from S004).

**Postconditions:**
- Reaches only daemon.status over sc1 (k2/k3).

### `DaemonDataGateway.workflowChain`

```typescript
workflowChain(): Promise<WorkflowChainView>
```

**Returns:** `Promise<WorkflowChainView>` — Consumed unchanged: the workflows renderer reads { rows: WorkflowChainRow[] } and renders the chain report grouped by slug (ac2). No gateway change; a pure local .insrc/artifacts read.

**Errors:**
- `GatewayReadError` when A malformed artifact json; the workflows renderer lets it propagate and the host degrades the body.

**Preconditions:**
- sc9 gateway available (from S004).

**Postconditions:**
- Reads only the local filesystem; no cloud/no new daemon capability (k2/k3).

### `renderDaemonTab`

```typescript
export const renderDaemonTab: TabRenderer
```

**Parameters:**
- `gateway: DaemonDataGateway` — Reads gateway.status().

**Returns:** `Promise<string>` — S005's daemon-tab renderer: awaits gateway.status() and renders the DaemonStatusView { state, detail } as the operational-status body (state heading + detail line), plus a Refresh control that posts {type:'refresh'} (ac1/ac3). A VS-Code-free pure fn in a new S005 module.

**Errors:**
- `GatewayReadError` when Propagated from gateway.status(); the host catches + degrades.

**Preconditions:**
- Registered under detailRenderers.daemon.

**Postconditions:**
- Escapes every daemon-derived value before it enters the HTML (XSS-safe, matching S004's escapeHtml discipline).

### `renderWorkflowsTab`

```typescript
export const renderWorkflowsTab: TabRenderer
```

**Parameters:**
- `gateway: DaemonDataGateway` — Reads gateway.workflowChain().

**Returns:** `Promise<string>` — S005's workflows-tab renderer: awaits gateway.workflowChain() and renders the rows grouped by slug (one section per work item, one line per stage: stage + status), an empty-state when rows=[], plus a Refresh control that posts {type:'refresh'} (ac2/ac3). VS-Code-free pure fn.

**Errors:**
- `GatewayReadError` when Propagated from gateway.workflowChain(); the host catches + degrades.

**Preconditions:**
- Registered under detailRenderers.workflows.

**Postconditions:**
- Escapes every row value (slug/stage/status) before it enters the HTML.

## Data model changes

### `sc9 WebviewPanelHostDeps + PanelHandle + TabRenderer (amended)` — field-add

The sc9 amendment (additive, non-breaking) finishes the tab framework + host<->webview bridge the S004 shell stubbed. WebviewPanelHostDeps gains OPTIONAL detailRenderers?: Partial<Record<DetailTab, TabRenderer>>; a new TabRenderer type is exported; PanelHandle gains onMessage(listener) + postMessage(message). The host (webview-host.ts) is amended to: render the active tab via detailRenderers[tab] (placeholder fallback when absent), make the tab strip real buttons that postMessage {type:'switchTab',tab}, add a Refresh control that posts {type:'refresh'}, and on either message RE-INVOKE the active renderer + re-set the html (on-demand only — NO timer/interval). extension.ts's PanelFactory creates the Detailed Status panel with enableScripts:true + a strict CSP meta + a per-render nonce on the inline bootstrap script, and binds onMessage->webview.onDidReceiveMessage + postMessage->webview.postMessage. No existing sc9 member is removed or changed; S004's shipped tests/behaviour are preserved by the optional dep + placeholder fallback. NOTE: this is filed as an additive HLD amendment on the S004-owned sc9 (sharedContract.fieldAdd, breaking:false); ownership of sc9 stays with S004.

```
WebviewPanelHostDeps += detailRenderers?: Partial<Record<DetailTab, TabRenderer>>
PanelHandle += onMessage(listener), postMessage(message)
+ export type TabRenderer = (gateway: DaemonDataGateway) => Promise<string>
```

**Call sites:**
- `vscode-plugin/src/panels/types.ts`
- `vscode-plugin/src/panels/webview-host.ts`
- `vscode-plugin/src/extension.ts`

### `vscode-plugin/src/panels/detail-renderers.ts (new S005 module)` — new

The two S005-owned TabRenderers: renderDaemonTab (gateway.status() -> operational-status body + Refresh control) and renderWorkflowsTab (gateway.workflowChain() -> rows grouped by slug, one line per stage, empty-state, + Refresh control). VS-Code-free pure fns over the injected gateway; every daemon-derived value HTML-escaped. Wired into the host via detailRenderers in extension.ts.

```
+ vscode-plugin/src/panels/detail-renderers.ts (renderDaemonTab, renderWorkflowsTab)
```

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/panels/webview-host.ts`

### `vscode.d.ts Webview.onDidReceiveMessage/postMessage (already declared)` — invariant-change

The shim already declares Webview { html, postMessage, onDidReceiveMessage } + createWebviewPanel's options { enableScripts? } (added in S004 t2). S005 USES these existing shim members (no shim change needed): the PanelFactory now passes enableScripts:true and wires onDidReceiveMessage/postMessage. Invariant change: the Detailed Status panel goes from enableScripts:false (S004) to enableScripts:true (S005) — mitigated by a strict CSP + per-render nonce so only the host's own nonce'd bootstrap script runs (still XSS-safe; the tab bodies remain escaped fragments).

```
(no shim diff — existing members; behavior: enableScripts false -> true for the Detailed Status panel, under CSP+nonce)
```

**Call sites:**
- `vscode-plugin/src/vscode.d.ts`
- `vscode-plugin/src/extension.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc9` | consumes | S005 CONSUMES sc9 (owned by S004): it reads the DaemonDataGateway (status + workflowChain, both unchanged) and plugs into the WebviewPanelHost via the injected detailRenderers map. S005 owns ONLY the two pure TabRenderers (renderDaemonTab/renderWorkflowsTab) + their on-demand refresh semantics; the tab framework, the create/reveal lifecycle, and the host<->webview message bridge remain sc9's (S004's). Because the S004 shell stubbed the tab framework as non-interactive (enableScripts:false, no bridge, renderDetail hardcoded to 'daemon'), S005 requires an ADDITIVE sc9 AMENDMENT (sharedContract.fieldAdd, breaking:false): the optional detailRenderers dep + the PanelHandle onMessage/postMessage bridge + the host enabling scripts (CSP+nonce) and routing switchTab/refresh to a re-render. This finishes the exact capability the HLD already assigned to sc9 ('the in-panel tab framework + host<->webview postMessage protocol'); it removes/renames no existing member and preserves S004's shipped behaviour via the placeholder fallback. Ownership of sc9 stays with S004; S005 extends it under this amendment and owns only the two pure renderers. No new DAEMON capability (k3): status/workflowChain already exist; the amendment is entirely client-side. (a2 runtime-registry and a3 single-shared-provider were rejected in s3 for a wider public surface / cross-story coupling.) |

## Error paths

### Error cases

- **gateway.status() rejects (daemon unreachable) while the daemon renderer is building the daemon tab body.** (recoverable)
  - Detection: renderDaemonTab awaits gateway.status() and does NOT catch — the rejection propagates to the host's renderActive wrapper (the S004 renderDetail try/catch), which recognises the rejected promise.
  - Response: The host renders the daemon tab as a degraded body ('insrc daemon unreachable') + logger.warn, keeping the tab strip + Refresh control visible; the renderer itself stays a pure function that just reads-and-throws.
  - User impact: The daemon tab shows a clear unreachable message with the tabs/refresh still usable (clicking Refresh retries) instead of a blank or crashed panel.
- **gateway.workflowChain() rejects (a malformed .insrc/artifacts/*.json) while the workflows renderer builds its body.** (recoverable)
  - Detection: renderWorkflowsTab awaits gateway.workflowChain(); the GatewayReadError propagates to the host's render wrapper.
  - Response: The host degrades the workflows tab body to an error state + logger.warn; the daemon tab and the tab strip are unaffected.
  - User impact: The Workflows tab shows a read-error message (not a crash); the rest of the panel keeps working; Refresh retries.
- **A webview->host message arrives with an unknown/absent type, or a switchTab carrying a tab that is not a valid DetailTab.** (recoverable)
  - Detection: The host's onMessage listener validates the parsed message: it checks msg.type against the known set ('switchTab'|'refresh') and, for switchTab, checks msg.tab is one of the DETAIL_TABS union before acting.
  - Response: Ignore the message (no re-render, no throw); optionally logger.warn once. The webview cannot drive the host outside the two sanctioned actions.
  - User impact: None — a malformed or spoofed message is a silent no-op; the panel state is unchanged.
- **A switchTab/refresh message fires after the user has closed (disposed) the Detailed Status panel.** (recoverable)
  - Detection: The host's message listener is bound to that panel's handle; after onDidDispose cleared the cached ref, a late message finds no live panel (the guard checks the panel is still the current cached one before re-rendering).
  - Response: The re-render is skipped (no setHtml on a disposed panel — the S004 never-throw setHtml guard also covers this); no throw.
  - User impact: None — a stray late message after close does nothing.
- **A tab renderer resolves but the subsequent host setHtml throws (panel disposed between the async render and the html set).** (recoverable)
  - Detection: The S004 host already wraps the renderActive body (incl. setHtml) in try/catch; the same guard covers the renderer-driven re-render path S005 adds.
  - Response: logger.warn + no-op (the never-throw invariant holds for the switch/refresh re-render exactly as for the initial open).
  - User impact: None — a race between close and re-render degrades to a logged no-op.

### Edge cases

| Input | Expected |
| :--- | :--- |
| gateway.workflowChain() resolves with rows: [] (a repo with no .insrc/artifacts yet, or an absent artifacts root). | The workflows renderer shows an explicit empty-state ('No workflow artifacts yet.') — NOT a blank body and NOT an error; the tab + Refresh remain. |
| workflowChain rows span multiple slugs with several stages each. | The renderer groups rows by slug (one section per work item) and lists each stage line (stage + status) under its slug, mirroring the JetBrains chain report; ordering is stable. |
| DaemonStatusView.detail is undefined (status resolved but the gateway produced only { state }). | The daemon renderer shows just the state heading (no empty detail line); still a valid body. |
| The user rapidly clicks Refresh several times. | Each click posts one {type:'refresh'} and triggers exactly one gateway re-read + re-render; there is no debounce requirement but also no timer is ever armed (each is a discrete on-demand read, ac3). |
| The user switches daemon->workflows->daemon. | Each switch re-invokes the destination tab's renderer once (a fresh read at switch time, ac3); no cached stale body is shown and no background poll runs between switches. |
| A tab with no registered renderer is activated (e.g. 'debug' before s6). | The host falls back to the existing 'coming soon' placeholder (S004 behaviour preserved via the optional-map fallback); no error. |

### Invariants to preserve

- The sc9 host NEVER throws to its caller: renderer rejections degrade the tab body in-panel (+logger.warn) and setHtml stays guarded — S005's switch/refresh re-render path reuses the exact S004 never-throw wrapper, not a new unguarded path. [[c1]]
- extension.ts remains the SOLE 'vscode' importer: the tab renderers + the host message handling are VS-Code-free over the injected gateway + the PanelHandle onMessage/postMessage boundary; only extension.ts binds enableScripts/CSP/nonce + webview.onDidReceiveMessage/postMessage. [[c2]]
- No new daemon capability and no cloud path (k2/k3): the daemon + workflows renderers reach the daemon only through the UNCHANGED sc9 gateway (daemon.status over sc1; workflowChain is a local .insrc/artifacts read). The amendment is entirely client-side. [[c2]]
- On-demand ONLY (ac3/k3, the JetBrains discipline): the Daemon + Workflows views re-read on open / tab-switch / manual Refresh and arm NO timer or interval — the continuous polling-ticker is reserved for the Debug log tail (s6), which S005 must not introduce. [[c4]]
- XSS-safe webview: enabling scripts (enableScripts:true) is bounded by a strict CSP + a per-render nonce so only the host's own bootstrap script runs; every daemon-derived value in a tab body stays HTML-escaped (matching S004's escapeHtml), and the tab bodies remain data-only fragments. [[c3]]
- S004's shipped behaviour + tests are preserved: the detailRenderers dep is OPTIONAL with a placeholder fallback, and the amendment removes/renames no existing sc9 member — a host constructed without renderers behaves exactly as the S004 shell. [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test) over injected fakes — the shipped vscode-plugin panels convention (webview-host.test.ts / daemon-gateway.test.ts); no VS Code host, no live daemon.`

### Test levels

- **unit** — Drive the two S005 TabRenderers as pure fns over a fake DaemonDataGateway, asserting the daemon + workflows tab HTML reflects the gateway data (ac1/ac2) and is XSS-safe.
  - Subjects: `renderDaemonTab(gateway) renders gateway.status()'s state + detail into the daemon body (ac1); a missing detail renders just the state (no empty line)`, `renderWorkflowsTab(gateway) renders gateway.workflowChain() rows grouped by slug (one section per slug, one line per stage: stage + status) (ac2)`, `renderWorkflowsTab shows an explicit empty-state when rows=[] (not blank, not error)`, `Both renderers HTML-escape every daemon-derived value (state/detail/slug/stage/status) — an injected '<script>' in a value cannot break out`, `Both renderers include a Refresh control that (in the rendered html) posts {type:'refresh'}`, `A renderer lets a gateway rejection propagate (does not swallow it) so the host can degrade`
  - Fixtures: `Fake DaemonDataGateway scripting status()/workflowChain() (resolve variants incl. empty rows + missing detail; reject variant)`, `A value-with-HTML-metacharacters fixture for the escaping assertion`
- **unit** — Drive the amended sc9 host over the S004 fake harness, asserting tab-body injection via detailRenderers + the on-demand re-render on switch/refresh with no polling (ac1/ac2/ac3) + never-throw.
  - Subjects: `openDetailedStatus renders the daemon tab body from detailRenderers.daemon (ac1); switching to workflows renders detailRenderers.workflows (ac2)`, `A {type:'switchTab', tab:'workflows'} message (driven through the fake PanelHandle.onMessage) re-invokes the workflows renderer exactly once and re-sets the html (ac3)`, `A {type:'refresh'} message re-invokes the ACTIVE tab's renderer exactly once (a fresh gateway read at that moment) (ac3)`, `NO timer/interval is armed for the daemon/workflows views — asserted by a fake clock / by counting gateway calls staying flat with no message (no background poll, ac3)`, `An unknown message type, or switchTab with an invalid tab, is a silent no-op (no re-render, no throw)`, `A tab with no renderer (debug) falls back to the S004 'coming soon' placeholder (shipped behaviour preserved)`, `A renderer rejection degrades the tab body in-panel (+warn) and never throws; a setHtml throw after an async render is a logged no-op (never-throw preserved)`, `A late switchTab/refresh after the panel was disposed is skipped (no setHtml on a dead panel)`
  - Fixtures: `The S004 fake PanelFactory extended with an onMessage capture + a way to inject a scripted webview message + a postMessage recorder`, `Fake DaemonDataGateway (call-counting) + fake logger capturing warns`, `A fake timer/clock or a call-count assertion to prove no interval is armed`
- **unit** — Static/source guards + the extension.ts wiring for the amended sc9 host (sole-vscode-importer, CSP/nonce, enableScripts, message bridge).
  - Subjects: `Source-scan: detail-renderers.ts imports no 'vscode' and uses no cloud/HTTP (only the injected gateway) — extension.ts stays the sole vscode importer`, `extension.ts constructs the host with detailRenderers { daemon: renderDaemonTab, workflows: renderWorkflowsTab } and binds the PanelFactory's onMessage->webview.onDidReceiveMessage + postMessage->webview.postMessage`, `extension.ts creates the Detailed Status panel with enableScripts:true and the rendered shell carries a strict Content-Security-Policy meta + a per-render nonce on the only inline script (no unsafe-inline for arbitrary script)`, `The webview bootstrap script only posts the two sanctioned message shapes (switchTab/refresh) — source-asserted`
  - Fixtures: `Read of detail-renderers.ts + webview-host.ts + extension.ts sources`, `A regex/assertion for the CSP meta + nonce presence in the rendered shell html`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(renderer): renderDaemonTab renders gateway.status() state + detail into the daemon body`, `unit(host): openDetailedStatus renders the daemon tab from detailRenderers.daemon on open`, `unit(renderer): missing detail renders just the state heading` |
| `ac2` | `unit(renderer): renderWorkflowsTab renders workflowChain rows grouped by slug (stage+status per line)`, `unit(renderer): empty rows -> explicit empty-state`, `unit(host): switching to the workflows tab renders detailRenderers.workflows` |
| `ac3` | `unit(host): a switchTab message re-invokes the destination renderer exactly once (fresh read at switch)`, `unit(host): a refresh message re-invokes the active renderer exactly once (fresh read at click)`, `unit(host): no timer/interval is armed for daemon/workflows — gateway call count stays flat with no message (no background poll)` |

## Alternatives considered

### a1: sc9 deps-extension: static per-tab renderer map + host-owned message bridge — **CHOSEN**

Amend sc9 so the host is CONSTRUCTED with an optional per-DetailTab renderer map and enables a scripted webview message bridge; S005 supplies the daemon + workflows renderers, the host runs the active tab's renderer on open/switch/refresh.



### a2: sc9 runtime registry: host.registerDetailTab(tab, renderer)

Amend sc9 with a runtime method the consuming stories call to register their tab renderer, plus the same message bridge; the host renders whichever tabs have registered.



**Rejected because:** Drops to partial on ac2 (tab presence becomes registration-order dependent — a missed/late registration silently leaves the workflows tab a placeholder) and on sc9 (a wider mutating public-method surface + a runtime coverage/ordering concern) — the exact tab-registry weakness S004 s3 already rejected.

### a3: sc9 single view-model provider fn + bridge (minimal surface)

Amend sc9 with ONE injected active-tab body provider `renderTabBody(tab)=>Promise<string>` plus the bridge; S005 implements the provider covering daemon+workflows (debug placeholder until s6).



**Rejected because:** Drops to partial on sc9: the single provider fn is SHARED across S005 (daemon/workflows) and S006 (debug), coupling this story's LLD to S006's future edit and interleaving their branches; less cohesive/per-tab-testable than a1's isolated renderers, and the minimal surface is not worth the cross-story coupling.

## Citations

- **[[c1]]** `step-output` `s1 symbol.locate + s4 contract — the S004 sc9 host shell (renderDetail private, decorative tabs, enableScripts:false) + the additive detailRenderers/never-throw amendment` — "createWebviewPanelHost ... built the Detailed Status panel as a SHELL ... the panel is created with enableScripts:false ... NO webview→host message bridge"
- **[[c2]]** `step-output` `s1 symbol.locate — the sc9 gateway status()/workflowChain() S005 consumes unchanged (daemon.status over sc1; workflowChain a local .insrc/artifacts read); no new daemon capability` — "The sc9 gateway ... already exposes the two reads S005 needs: status() ... and workflowChain() ... S005 consumes BOTH as-is — no gateway signature change needed"
- **[[c3]]** `convention` `S004 XSS discipline + the CSP/nonce mitigation for enableScripts:true (the S004 cold review flagged enableScripts:false as the current safety)` — "enabling scripts (enableScripts:true) is bounded by a strict CSP + a per-render nonce so only the host's own bootstrap script runs; every daemon-derived value ... stays HTML-escaped"
- **[[c4]]** `step-output` `s1 reuse.map — the JetBrains on-demand-refresh discipline (Daemon+Workflows refresh only on open/tab-switch/manual; the continuous ticker is Debug-log-only, s6)` — "On-demand refresh (open/tab-switch/manual) mirrors the JetBrains discipline: Daemon+Workflows refresh only on those three triggers, NEVER a background poll (the continuous ticker is Debug-log-only, s6"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-09-23T07:18:16.276Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | The S004 sc9 host (webview-host.ts) has a PRIVATE renderDetail with a fixed DETAIL_TABS triad, decorative (non-interactive) tab spans, and is the shell S005's amendment extends. | CONFIRMED: webview-host.ts:71 `const renderDetail = async (panel, tab)` is private; :30 `DETAIL_TABS = ['daemon','workflows','debug']`; :90 the 'coming soon' placeholder. The amendment correctly extends this exact shell. | No change — the base the amendment builds on is accurately described. |
| cl2 | semantic | LOW | manual | The Detailed Status panel is currently created with enableScripts:false and has NO webview->host message bridge (no onDidReceiveMessage/postMessage wiring) — the amendment flips enableScripts to true + adds the bridge. | CONFIRMED: extension.ts:204 createWebviewPanel currently passes enableScripts:false (S004); onDidReceiveMessage/postMessage appear only in the vscode.d.ts shim, NOT wired in extension.ts — so the message bridge is genuinely net-new. The amendment's enableScripts:true + bridge wiring is real work, not already present. | No change — accurate. |
| cl3 | semantic | LOW | manual | The injected sc9 boundaries PanelHandle + WebviewPanelHostDeps exist in types.ts and are the additive surface the amendment extends (detailRenderers, onMessage/postMessage, TabRenderer). | CONFIRMED: types.ts:106 `interface PanelHandle`, :144 WebviewPanelHostDeps, :116 PanelFactory, :129 MenuPicker — the injected boundaries the amendment additively extends. | No change. |
| cl4 | citation | LOW | manual | The sc9 DaemonDataGateway already exposes status(): Promise<DaemonStatusView> and workflowChain(): Promise<WorkflowChainView>, both consumed UNCHANGED by S005 (no gateway signature change). | CONFIRMED: daemon-gateway.ts:52 status(), :90 workflowChain(); types.ts:48-49 the gateway interface. Both consumed unchanged — no gateway signature change. | No change — the consume-unchanged claim holds. |
| cl5 | semantic | LOW | manual | WorkflowChainView.rows are WorkflowChainRow { slug, stage, status } — the shape the workflows renderer groups by slug (ac2). | CONFIRMED: types.ts:66-69 WorkflowChainRow { slug, stage, status } (readonly). The workflows renderer's group-by-slug + stage/status lines map to the real shape. | No change. |
| cl6 | semantic | LOW | manual | DaemonStatusView is { state: string; detail?: string } — the daemon renderer reads state + optional detail (ac1). | CONFIRMED: types.ts:56-58 DaemonStatusView { state: string; detail?: string }. The daemon renderer reads exactly this. | No change. |
| cl7 | semantic | LOW | manual | The vscode.d.ts shim ALREADY declares Webview { html, postMessage, onDidReceiveMessage } + createWebviewPanel options { enableScripts? } (added S004), so S005 needs NO shim change to enable scripts + wire the bridge. | CONFIRMED: vscode.d.ts:49 postMessage, :50 onDidReceiveMessage, :72 enableScripts? — all already declared (S004 t2). S005 needs NO shim change to enable scripts + wire the bridge, as claimed. | No change — accurate. |
| cl8 | semantic | LOW | manual | The host is VS-Code-free and extension.ts is the SOLE 'vscode' importer; S005's renderers + host message handling stay VS-Code-free (only extension.ts binds enableScripts/CSP/onDidReceiveMessage/postMessage). | CONFIRMED: the only `import ... from 'vscode'` in vscode-plugin/src is extension.ts:12. The sole-vscode-importer invariant holds; the renderers + host stay VS-Code-free. | No change. |
| cl9 | semantic | LOW | manual | The S004 host already guards its render body incl. setHtml in a try/catch (never-throw), which S005's switch/refresh re-render path reuses rather than adding a new unguarded path. | CONFIRMED: webview-host.ts:73 comment 'the outer catch covers a setHtml throw' + the try/catch around renderDetail's body + logger.warn (:85 etc.). S005's switch/refresh re-render reuses this existing guard rather than a new unguarded path. | No change — the never-throw reuse is real. |
| cl10 | closed-union | LOW | manual | DetailTab is the closed union 'daemon'\|'workflows'\|'debug' — the detailRenderers map keys + the switchTab tab validation rely on this exhaustive set. | CONFIRMED: types.ts:25 `type DetailTab = 'daemon' \| 'workflows' \| 'debug'` — the closed union the detailRenderers keys + switchTab validation rely on. | No change. |
| cl11 | cross-artifact | LOW | manual | sc9 is owned by S004 (not S005); S005 consumes it and extends it only via an additive HLD amendment (sharedContract.fieldAdd, breaking:false) that removes/renames no existing member. | CONFIRMED: the HLD boundary assigns sc9 to S004; the LLD marks role=consumes and raises the extension as an additive sharedContract.fieldAdd (breaking:false) that removes/renames nothing — ownership stays with S004. | No change — the amendment framing is correct. |
