<!-- insrc:artifact PLAN-401ae5fb7b8537cc-s7 -->

# Plan: E20260923401ae5fb:S007

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790156421146-hm2yw1`
**LLD effective hash:** `790f3d6f5efd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc9 amendment types (types.ts): RepoConfigRenderer/RepoConfigRendererDeps/RepoConfigWrite + repoRenderer/onRepoConfigWrite | S | — | unit: types source-scan: RepoConfigRenderer/RepoConfigRendererDeps/RepoConfigWrite + repoRenderer?/onRepoConfigWrite? added ADDITIVELY (no existing sc9 member removed/renamed) | [[c1]] |
| 2 | **`t2`** Repo-config core (new repo-config.ts): renderRepoConfig + createRepoConfigWriteHandler | M | `t1` | unit: renderRepoConfig: repo <select> from registeredRepos() (folder-independent) + explicit empty-state when none; unit: renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath] (tiers/tasks), NOT raw JSON; missing entry -> all-defaults; unit: renderRepoConfig: each field posts {type:'repoWrite',repoPath,segments,value} (segments the trailing path under models.byRepo[repoPath]); selected===undefined -> picker only; unit: renderRepoConfig: every repo path/name + field value HTML-escaped; a registeredRepos()/rawConfig() rejection propagates (not swallowed); unit: createRepoConfigWriteHandler: on 'accepted' writeKeyPath called with EXACTLY ['models','byRepo',repoPath,...segments] + value (ac2 array form); unit: createRepoConfigWriteHandler: declined/dismissed consent writes NEVER (k4); unregistered/malformed write dropped without consent or write; unit: createRepoConfigWriteHandler: {ok:false} refusal surfaces the daemon reason via sc2 + refresh (truthful); a writeKeyPath rejection is caught+logged, never throws; 'accepted'+{ok:true} surfaces success + refresh | [[c2]] [[c4]] |
| 3 | **`t3`** Amend the sc9 host (webview-host.ts): repoRenderer render + repo-config message route + {ready}-gated first render + bootstrap posts | L | `t1` | unit: host: openRepoConfiguration renders the wired repoRenderer(selected) body; with no repoRenderer renders the S004 placeholder unchanged (S004 preserved); unit: host: a {selectRepo} message re-renders via repoRenderer(selectedRepo); a {repoWrite} message forwards a validated RepoConfigWrite to onRepoConfigWrite; unit: host: a malformed selectRepo/repoWrite (missing repoPath, non-array segments, unknown type) is a silent no-op (no re-render, no forward, no throw); unit: host: the repo panel is {ready}-gated on first render; the bootstrap posts only {switchTab,refresh,action,ready,selectRepo,repoWrite}; unit: host: a repoRenderer / onRepoConfigWrite throw is caught + logged (never-throw preserved) | [[c1]] [[c3]] |
| 4 | **`t4`** extension.ts wiring: repoRenderer over registeredRepos+rawConfig + onRepoConfigWrite over sc8 writeKeyPath/rawConfig + sc4 consent + sc2 status | M | `t2`, `t3` | unit: activation source-scan: extension.ts wires repoRenderer (renderRepoConfig over registeredRepos+rawConfig) + onRepoConfigWrite (createRepoConfigWriteHandler over sc8 writeKeyPath/rawConfig + sc4 consent + sc2 status + refresh); no new command | [[c2]] [[c3]] |
| 5 | **`t5`** Tests: repo-config renderer/write-handler + host repo route + source-scans + harness updates | M | `t2`, `t3`, `t4` | unit: source-scan: repo-config.ts imports no 'vscode' and opens no cloud/HTTP path (extension.ts stays the sole vscode importer); unit: source-scan: the per-repo write path reaches the daemon ONLY via the sc8 writeKeyPath/rawConfig (config.write/config.show) — no new IPC method/capability (k3); smoke: full node:test (tsx --test) sweep green + tsc clean + the k5 bundle allowlist (node:* + vscode only) still holds | [[c1]] [[c2]] [[c3]] [[c4]] |

### E20260923401ae5fb:S007:T001 — sc9 amendment types (types.ts): RepoConfigRenderer/RepoConfigRendererDeps/RepoConfigWrite + repoRenderer/onRepoConfigWrite

Additively extend vscode-plugin/src/panels/types.ts: export `type RepoConfigRenderer = (selected: string | undefined) => Promise<string>` (the renderer reads its own raw config internally — s3 refinement so the host stays a pure dispatcher with no config read), `interface RepoConfigRendererDeps { registeredRepos(): Promise<readonly RepoRef[]>; rawConfig(): Promise<Record<string, unknown>> }`, `interface RepoConfigWrite { readonly repoPath: string; readonly segments: readonly string[]; readonly value: unknown }`; add optional `repoRenderer?: RepoConfigRenderer | undefined` + `onRepoConfigWrite?: ((write: RepoConfigWrite) => void) | undefined` to WebviewPanelHostDeps. No existing member removed/changed (breaking:false); mirrors the S005 detailRenderers + S006 tabControllers/onDetailAction additive precedent.

**Acceptance checks:**
- types.ts exports RepoConfigRenderer ((selected)=>Promise<string>) + RepoConfigRendererDeps { registeredRepos; rawConfig } + RepoConfigWrite and adds the two optional WebviewPanelHostDeps fields
- No existing sc9 type member (detailRenderers/tabControllers/onDetailAction/PanelHandle/DaemonDataGateway) is removed/renamed — S004/S005/S006 types still compile
- Compiles under strict/exactOptionalPropertyTypes with .js imports; no 'vscode' import

### E20260923401ae5fb:S007:T002 — Repo-config core (new repo-config.ts): renderRepoConfig + createRepoConfigWriteHandler

Create vscode-plugin/src/panels/repo-config.ts (VS-Code-free). renderRepoConfig(deps{registeredRepos, rawConfig}): RepoConfigRenderer — a (selected)=>Promise<string> that reads registeredRepos() + rawConfig() ITSELF (host passes no raw), renders a repo <select> (escaped; explicit empty-state when none) and, for the selected repoPath, discrete FORM fields for raw.models.byRepo[repoPath] (tiers.core/mid/cheap runner+model + per-role tasks; all-defaults when the entry is missing), each field emitting {type:'repoWrite',repoPath,segments,value}; selected===undefined renders picker-only; a registeredRepos()/rawConfig() rejection PROPAGATES; every value escaped via panels/html.ts escapeHtml. createRepoConfigWriteHandler(deps{consent,writeKeyPath,rawConfig,status,logger,refresh}): (write)=>void — validates the RepoConfigWrite + cross-checks repoPath is registered, sc4 consent, writes ONLY on 'accepted' via writeKeyPath(['models','byRepo',repoPath,...write.segments], value), surfaces via sc2 + refresh(); fire-and-forget + never-throw (mirrors the S006 createDebugActionHandler extraction). No vscode/no cloud.

**Acceptance checks:**
- renderRepoConfig (a (selected)=>Promise<string>) reads registeredRepos()+rawConfig() itself, lists repos as a <select> (empty-state when none), renders discrete per-repo form fields for the selected repo from models.byRepo[repoPath] (all-defaults on a missing entry), each field posts {type:'repoWrite',...}; a gateway/rawConfig reject propagates; every value escaped
- createRepoConfigWriteHandler: sc4 consent then writeKeyPath(['models','byRepo',repoPath,...segments], value) ONLY on 'accepted'; declined/dismissed/unregistered-repo/malformed writes NOTHING; surfaces via sc2 + refresh; never throws
- imports no 'vscode', no cloud; reuses panels/html.ts escapeHtml

### E20260923401ae5fb:S007:T003 — Amend the sc9 host (webview-host.ts): repoRenderer render + repo-config message route + {ready}-gated first render + bootstrap posts

Amend vscode-plugin/src/panels/webview-host.ts (ONE atomic host change over the panel closure). Per the s3 refinement the host is a PURE DISPATCHER that calls deps.repoRenderer(selectedRepo) — it does NOT read config itself. (1) openRepoConfiguration renders deps.repoRenderer(selectedRepo) inside the existing shellHtml (CSP + per-render nonce, enableScripts:true) with the S004 REPO_PLACEHOLDER preserved as the fallback when no repoRenderer is wired; the repo panel uses the {type:'ready'} handshake to gate its first render (mirroring the S006 debug panel). (2) a repo-config message route in the panel's handleMessage: a {type:'selectRepo',repoPath:string} sets the panel's selectedRepo + re-renders via repoRenderer(selectedRepo); a {type:'repoWrite',repoPath:string,segments:string[],value} is validated then forwarded to deps.onRepoConfigWrite; a malformed/unknown message is a silent no-op; wrapped in the never-throw guard. (3) BOOTSTRAP += the repo <select> change posting {type:'selectRepo',...} + the form-field posting {type:'repoWrite',...}, keeping the closed message set {switchTab,refresh,action,ready,selectRepo,repoWrite}. Stays VS-Code-free + never-throw; S004/S005/S006 behaviour unchanged.

**Acceptance checks:**
- openRepoConfiguration renders deps.repoRenderer(selectedRepo)'s body (picker) when wired, and the exact S004 placeholder when not (S004 tests preserved); the first render is {ready}-gated; the host reads no config itself (pure dispatcher)
- a {selectRepo} message updates selectedRepo + re-renders via repoRenderer(selectedRepo); a {repoWrite} message forwards a validated RepoConfigWrite to onRepoConfigWrite; a malformed/unknown message is a silent no-op
- the host stays never-throw (repoRenderer/onRepoConfigWrite try/caught) + XSS-safe (CSP/nonce unchanged); the bootstrap posts only {switchTab,refresh,action,ready,selectRepo,repoWrite}; detailRenderers/tabControllers/onDetailAction behaviour is preserved

### E20260923401ae5fb:S007:T004 — extension.ts wiring: repoRenderer over registeredRepos+rawConfig + onRepoConfigWrite over sc8 writeKeyPath/rawConfig + sc4 consent + sc2 status

Amend vscode-plugin/src/extension.ts (sole vscode importer): construct the sc8 ConfigGateway once (createDaemonConfigGateway(client)) if not already present, then pass repoRenderer = renderRepoConfig({ registeredRepos: () => daemonData.registeredRepos(), rawConfig: () => configGateway.rawConfig() }) and onRepoConfigWrite = createRepoConfigWriteHandler({ consent, writeKeyPath: (segs,val) => configGateway.writeKeyPath(segs,val), rawConfig: () => configGateway.rawConfig(), status, logger: panelLog, refresh: () => panelHost.openRepoConfiguration() }) into createWebviewPanelHost. Reuses the shipped sc8 ConfigGateway + sc9 DaemonDataGateway + sc4 consent + sc2 status — no new command, no vscode.d.ts change; remains the sole 'vscode' importer.

**Acceptance checks:**
- extension.ts wires repoRenderer (renderRepoConfig over daemonData.registeredRepos + the sc8 gateway rawConfig) + onRepoConfigWrite (createRepoConfigWriteHandler over the sc8 gateway writeKeyPath/rawConfig + sc4 consent + sc2 status + a refresh that re-opens the repo panel), constructing the sc8 ConfigGateway once
- the per-repo read/write reuses the existing sc8 ConfigGateway (config.write ARRAY form + config.show) — no new daemon capability, no new command
- extension.ts stays the sole 'vscode' importer, opens no cloud path, and does not regress S004/S005/S006 wiring

### E20260923401ae5fb:S007:T005 — Tests: repo-config renderer/write-handler + host repo route + source-scans + harness updates

Add vscode-plugin/src/panels/__tests__/repo-config.test.ts + extend webview-host.test.ts for the repo route + add the source-scans + update the detail-renderers bootstrap-posts test + activation.test.ts detailRenderers-shape test for the new {selectRepo,repoWrite} shapes. Aggregates the per-task suites (t2 renderer/write-handler, t3 host, t4 wiring), adds the cross-cutting source-scans (repo-config.ts no vscode/no cloud; write reaches daemon only via sc8 writeKeyPath/rawConfig) + the full-sweep smoke. node:test (tsx --test) over fakes; no VS Code host, no live daemon.

**Acceptance checks:**
- the renderer + write-handler + host repo-route + source-scans are covered (ac1/ac2/ac3), incl. the consent-gated no-write, the array-form segment assertion, the discrete-fields-not-raw-JSON assertion, and the S004-placeholder-preserved assertion
- the bootstrap-posts + activation detailRenderers-shape tests are updated for {selectRepo,repoWrite}; source-scans prove repo-config.ts imports no vscode/no cloud and the sc9 types amendment is additive
- full node:test (tsx --test) sweep green locally; tsc clean; the k5 bundle allowlist (node:* + vscode only) still holds

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderRepoConfig renders a repo <select> of registeredRepos() (folder-independent, ac1); an empty registeredRepos() renders an explicit empty-state and no form | `t2` |
| with a selected repo, renderRepoConfig renders discrete FORM fields for that repo's models.byRepo[repoPath] overrides (tiers.core/mid/cheap runner+model + per-role tasks) — NOT a raw-JSON textarea (ac3); a missing byRepo entry renders all-defaults (empty-override) fields | `t2` |
| each editable field posts a {type:'repoWrite',repoPath,segments,value} message; the segments are the trailing path UNDER models.byRepo[repoPath] | `t2` |
| selected===undefined renders the picker only (prompt to choose), no form + no write-emitting fields | `t2` |
| every repo path/name + field value is HTML-escaped (a value with <,&," round-trips escaped); a registeredRepos() rejection PROPAGATES (not swallowed) | `t2` |
| a valid repoWrite -> consent.ask; on 'accepted' it calls writeKeyPath with EXACTLY ['models','byRepo',repoPath, ...write.segments] and the value (ac2 — applied to that specific repo via the array form) | `t2` |
| on 'declined'/'dismissed' consent it calls writeKeyPath NEVER (k4) — nothing written | `t2` |
| on a {ok:false} refusal it surfaces the daemon reason via sc2 StatusSurface and triggers a refresh (truthful re-read), not an optimistic value; on a writeKeyPath rejection it catches+logs and never throws | `t2` |
| a repoWrite whose repoPath is not a registered repo, or a malformed write (missing repoPath / non-array segments), is dropped WITHOUT prompting consent or writing | `t2` |
| on 'accepted' + {ok:true} it surfaces success via sc2 and calls refresh() to re-render from fresh rawConfig | `t2` |
| openRepoConfiguration with a wired repoRenderer renders its body (picker) inside the shell; with NO repoRenderer it renders the S004 placeholder unchanged (S004 tests preserved) | `t3` |
| a {type:'selectRepo',repoPath} message re-renders the form for that repo (reading fresh rawConfig); a {type:'repoWrite',...} message forwards a validated RepoConfigWrite to onRepoConfigWrite | `t3` |
| a malformed selectRepo/repoWrite (missing repoPath, non-array segments, unknown type) is a silent no-op (no re-render, no forward, no throw) | `t3` |
| the repo-config panel uses the {type:'ready'} handshake to gate its first render; the bootstrap posts only the closed set {switchTab,refresh,action,ready,selectRepo,repoWrite} | `t3` |
| a repoRenderer / onRepoConfigWrite throw is caught + logged (host never-throw preserved) | `t3` |
| Source-scan: repo-config.ts imports no 'vscode' and opens no cloud/HTTP path (extension.ts stays the sole vscode importer) | `t5` |
| the per-repo write path reaches the daemon ONLY via the sc8 writeKeyPath/rawConfig (config.write/config.show) — no new IPC method, no new daemon capability (k3) | `t5` |
| types.ts adds RepoConfigRenderer/RepoConfigRendererDeps/RepoConfigWrite + the two optional WebviewPanelHostDeps fields ADDITIVELY (no existing sc9 member removed/renamed) | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s7 — sc9 additive host/types amendment: RepoConfigRenderer/RepoConfigRendererDeps/RepoConfigWrite + repoRenderer/onRepoConfigWrite on WebviewPanelHostDeps, openRepoConfiguration renders the injected renderer over the S004 placeholder fallback, the {selectRepo}/{repoWrite} message route + {ready} handshake + closed bootstrap set (types.ts + webview-host.ts)`
- **[[c2]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s7 — the repo-config core reusing the shipped sc8 ConfigGateway: renderRepoConfig (picker from registeredRepos + discrete per-repo form from models.byRepo via rawConfig) + createRepoConfigWriteHandler (consent-gated writeKeyPath ARRAY form; the extracted, fake-testable orchestration)`
- **[[c3]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s7 — the daemon config IPC + extension.ts wiring: config.write ARRAY form (src/daemon/index.ts:1353) + config.show over the existing sc8 gateway (no new capability, k3); consent-gated (sc4) + status (sc2); models.byRepo per-repo surface (src/config/analyze.ts:411, migrateByRepo)`
- **[[c4]]** `prior-artifact` `LLD 401ae5fb7b8537cc:s7 — the test strategy over the shipped harnesses: the FakePanel harness (webview-host.test.ts) + the fake-IpcClient config seam convention (seam.test.ts/per-role-engine.test.ts), node:test over fakes`
