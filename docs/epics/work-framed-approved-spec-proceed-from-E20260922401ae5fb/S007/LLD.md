<!-- insrc:artifact LLD-401ae5fb7b8537cc-s7 -->

# LLD: E20260923401ae5fb:S007

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
- `s6`: The Debug tab: the MCP-clients list rendering, the continuous polling-ticker live log tail (rotation-aware, the only continuously-refreshing view), and the consent-gated orphan-process cleanup (via the shipped sc4 ConsentGate before any kill). Consumes sc9; the ticker + confirm UX are private.

## Contract details

**Surface level:** internal-shared

### `openRepoConfiguration`

```typescript
openRepoConfiguration(): void
```

**Returns:** `void` — Create-or-reveal the Repo Configuration panel. Public sc9 signature UNCHANGED (S004); internally the host now renders the injected repoRenderer body (or the S004 placeholder when none is wired) and routes the panel's repo-config messages.

**Errors:**
- `never-throws` when A panel-create / renderer / setHtml failure is caught + logged (host never-throw contract); the panel degrades to a logged no-op or an in-panel error body.

**Preconditions:**
- Called from the sc9 host (status-bar menu route or the insrc.status.repoConfig palette command).

**Postconditions:**
- The Repo Configuration panel is visible; when a repoRenderer is wired it shows the repo picker + the selected repo's per-repo form; otherwise the S004 placeholder (preserved).

### `renderRepoConfig`

```typescript
renderRepoConfig(deps: RepoConfigRendererDeps): RepoConfigRenderer  // RepoConfigRenderer = (selected: string | undefined, raw: Record<string, unknown>) => Promise<string>
```

**Parameters:**
- `deps: RepoConfigRendererDeps { registeredRepos(): Promise<readonly RepoRef[]> }` — The narrow injected boundary: the sc9 gateway's registeredRepos read (folder-independent daemon repo registry). extension.ts satisfies it from the already-constructed sc9 DaemonDataGateway.

**Returns:** `RepoConfigRenderer` — A VS-Code-free pure fn: given the currently-selected repoPath (or undefined) + the raw config (config.show), it renders the repo <select> (escaped, from registeredRepos()) + — for the selected repo — a FORM of the per-repo model-tiering fields read from raw.models.byRepo[repoPath] (tiers.core/mid/cheap runner+model + per-role tasks), each field posting {type:'repoWrite',...}. A registeredRepos() rejection PROPAGATES so the host degrades the panel.

**Errors:**
- `GatewayReadError (propagated)` when registeredRepos() rejects (daemon unreachable) — propagated to the host's never-throw wrapper, which renders an error body.

**Preconditions:**
- `raw` is the config.show payload (or {}); a missing models.byRepo[repoPath] renders an all-defaults (empty-override) form.

**Postconditions:**
- Returns escaped HTML; every repo path/name + field value is HTML-escaped; no vscode/no cloud import.

### `createRepoConfigWriteHandler`

```typescript
createRepoConfigWriteHandler(deps: RepoConfigWriteDeps): (write: RepoConfigWrite) => void
```

**Parameters:**
- `deps: RepoConfigWriteDeps { consent: ConsentGate; writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>; rawConfig(): Promise<Record<string, unknown>>; status: StatusSurface; logger: { warn(m: string): void }; refresh(): void }` — The consent-gated per-repo write orchestration, EXTRACTED so it is fake-testable without importing vscode. extension.ts satisfies it from the shipped sc4 ConsentGate, the sc8 ConfigGateway's writeKeyPath, sc2 StatusSurface, and a refresh callback that re-renders the panel from fresh rawConfig.

**Returns:** `(write: RepoConfigWrite) => void` — The host's onRepoConfigWrite sink: validates the RepoConfigWrite, asks sc4 consent (the write mutates daemon config, k4), and ONLY on 'accepted' calls writeKeyPath(['models','byRepo',repoPath,...segments], value); surfaces the outcome via sc2 and triggers a truthful re-render (refresh) from rawConfig. Fire-and-forget + never-throw.

**Errors:**
- `swallowed` when A malformed write, a non-accepted consent, or a writeKeyPath rejection kills nothing / writes nothing and is logged; the handler never throws.

**Preconditions:**
- The write's repoPath is one of the registered repos (the form only emits registered-repo writes).

**Postconditions:**
- On accept + ok: models.byRepo[repoPath] gains/updates the field; the panel re-renders from fresh rawConfig (truthful). On refuse/reject: no write; the daemon's reason surfaces via sc2; the form re-reads.

### `writeKeyPath`

```typescript
writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>
```

**Parameters:**
- `segments: readonly string[]` — The ARRAY form of config.write — each element one literal key segment. For per-repo: ['models','byRepo',repoPath,'tiers','core',...] (array form MANDATORY because repoPath contains dots/slashes).
- `value: unknown` — The field value to write (a runner/model string, or null to clear an override).

**Returns:** `Promise<ConfigWriteResult>` — The EXISTING sc8 ConfigGateway method (vscode-plugin/src/config/gateway.ts) — CONSUMED unchanged. Wraps config.write { path: segments, value }; {ok:true} or a reason-carrying refusal. No new daemon capability (k3).

**Errors:**
- `ConfigWriteResult{ok:false}` when The daemon refuses (invalid path).
- `rejection` when Socket failure — propagates to the caller (the write handler treats it as an aborted write).

**Preconditions:**
- The daemon config IPC is reachable via sc1.

**Postconditions:**
- config.json models.byRepo[repoPath] updated at the segment path; the daemon reloads chat config.

### `rawConfig`

```typescript
rawConfig(): Promise<Record<string, unknown>>
```

**Returns:** `Promise<Record<string, unknown>>` — The EXISTING sc8 ConfigGateway method — CONSUMED unchanged. Wraps config.show; the raw parsed ~/.insrc/config.json (or {}), the source of the dynamic per-repo overrides (models.byRepo) the config.catalog snapshot omits.

**Errors:**
- `rejection` when Socket failure — propagated so the panel degrades.

**Postconditions:**
- Returns the raw config object; the renderer reads models.byRepo[repoPath] from it.

### `registeredRepos`

```typescript
registeredRepos(): Promise<readonly RepoRef[]>
```

**Returns:** `Promise<readonly RepoRef[]>` — The EXISTING sc9 DaemonDataGateway method — CONSUMED unchanged. The daemon's registered repos (RepoRef{path,name}) over repo.list, independent of open workspace folders (ac1/lc1).

**Errors:**
- `GatewayReadError` when repo.list rejects — propagated to the host.

**Postconditions:**
- Supplies the repo picker options.

## Data model changes

### `WebviewPanelHostDeps` — field-add

Additively add TWO optional fields (mirroring S005 detailRenderers + S006 tabControllers/onDetailAction): `repoRenderer?: RepoConfigRenderer | undefined` (renders the Repo Configuration panel body — picker + per-repo form) and `onRepoConfigWrite?: ((write: RepoConfigWrite) => void) | undefined` (the sink the host forwards a validated repo-config write to). Nothing removed/renamed; a host built without them renders the S004 placeholder exactly (fallback preserved). Also add the new types RepoConfigRenderer, RepoConfigRendererDeps, RepoConfigWrite to the sc9 types module.

```
WebviewPanelHostDeps += { repoRenderer?: RepoConfigRenderer | undefined; onRepoConfigWrite?: ((write: RepoConfigWrite) => void) | undefined }
type RepoConfigRenderer = (selected: string | undefined, raw: Record<string, unknown>) => Promise<string>
interface RepoConfigWrite { readonly repoPath: string; readonly segments: readonly string[]; readonly value: unknown }
```

**Call sites:**
- `vscode-plugin/src/panels/webview-host.ts (openRepoConfiguration + a repo-config message route)`
- `vscode-plugin/src/extension.ts (wiring)`

### `models.byRepo.<repoPath> (daemon config entry)` — field-modify

The per-repo override entry in ~/.insrc/config.json the panel reads + writes. Flat shape { tasks?: {<roleId>: {runner?,model?}}, tiers?: {core|mid|cheap: {runner?,model?}}, ... } (migrateByRepo, src/config/config-catalog.ts:178). S007 reads it from rawConfig() and writes individual fields via writeKeyPath(['models','byRepo',repoPath,...]). Not a schema change to the daemon — the panel edits the EXISTING per-repo surface run-resolved by readRepoOverride (src/config/analyze.ts:411).

**Call sites:**
- `src/config/analyze.ts:411 (readRepoOverride reads models.byRepo at run-resolve)`
- `src/daemon/index.ts:1353 (config.write persists the array-path write)`

### `RepoConfigWrite` — new

A new S007 value object describing one per-repo field write: { repoPath, segments (the trailing segments UNDER models.byRepo[repoPath], e.g. ['tiers','core','runner']), value }. Emitted by the form as a {type:'repoWrite',...} webview message, validated by the host, and consumed by createRepoConfigWriteHandler which prefixes ['models','byRepo',repoPath] before writeKeyPath.

**Call sites:**
- `vscode-plugin/src/panels/repo-config.ts (new)`
- `vscode-plugin/src/panels/webview-host.ts (message route)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc9` | consumes | S007 CONSUMES sc9 additively (same pattern as S005 detailRenderers + S006 tabControllers/onDetailAction), it does NOT re-design it. The host's openRepoConfiguration (owned S004) is extended to render the injected `repoRenderer` body inside the existing shellHtml (CSP + per-render nonce, enableScripts:true) and to route the panel's webview messages: a {type:'selectRepo',repoPath} re-renders the form for that repo (reading fresh rawConfig), a {type:'repoWrite',...} forwards a validated RepoConfigWrite to `onRepoConfigWrite`, and the {type:'ready'} handshake gates the first render — with the S004 placeholder preserved as the built-in fallback when no repoRenderer is wired (S004 tests stay green). S007 also consumes sc9's DaemonDataGateway.registeredRepos() for the picker (ac1/lc1, folder-independent). NOTE (folded to prose, not this list because they are outside this HLD slice): the per-repo READ/WRITE reuses the already-shipped sc8 ConfigGateway (writeKeyPath ARRAY form + rawConfig — config.write/config.show, no new daemon capability, k3), the write is gated by the shipped sc4 ConsentGate (k4), and the outcome surfaces via the shipped sc2 StatusSurface — all reused unchanged, consistent with the s7 boundary's own 'per-repo config writes over the existing sc1 config.write' internal note; no HLD amendment is required. |

## Error paths

### Error cases

- **registeredRepos() rejects (daemon unreachable) while rendering the panel** (recoverable)
  - Detection: The awaited gateway.registeredRepos() promise rejects with GatewayReadError inside renderRepoConfig
  - Response: renderRepoConfig lets the rejection PROPAGATE to the host's renderRepoConfiguration wrapper, which catches it, logs a warn, and sets an in-panel error body (never-throw) instead of the picker
  - User impact: The panel shows 'insrc: could not load this view' rather than a blank/broken picker; reopening after the daemon returns recovers
- **rawConfig() rejects when (re)reading a repo's overrides** (recoverable)
  - Detection: The awaited gateway.rawConfig() promise rejects inside the render path or the write handler's refresh
  - Response: Same propagate-to-host degrade in the renderer; in createRepoConfigWriteHandler the refresh is guarded so a failed re-read logs a warn and leaves the last body (never-throw)
  - User impact: The form shows an error state or keeps the prior view; no crash
- **The daemon REFUSES a per-repo write (config.write returns {ok:false} — invalid path)** (recoverable)
  - Detection: writeKeyPath resolves ConfigWriteResult{ok:false, reason}
  - Response: createRepoConfigWriteHandler does NOT treat it as success: it surfaces the daemon's reason via sc2 StatusSurface and re-renders the form from fresh rawConfig so the UI shows only what the daemon actually holds (truthful; no optimistic value)
  - User impact: The field snaps back to the daemon's stored value + a status message explains the refusal
- **writeKeyPath rejects (socket failure mid-write)** (recoverable)
  - Detection: The writeKeyPath promise rejects inside the handler's try/catch
  - Response: Caught + logged (logger.warn); no partial UI state is committed; the form re-reads on the next open/select. The handler never throws (fire-and-forget)
  - User impact: The edit did not apply; the panel remains usable; retry after the daemon returns
- **A malformed / spoofed repo-config webview message reaches the host** (recoverable)
  - Detection: The host's repo-config message branch validates the shape: {type:'selectRepo',repoPath:string} and {type:'repoWrite',repoPath:string,segments:string[],value} — anything failing the shape check (missing repoPath, non-array segments, unknown type) is rejected
  - Response: A malformed message is a silent no-op (no re-render, no write, no throw), exactly as S005/S006 handle malformed switchTab/action messages
  - User impact: None — a spoofed message cannot drive a write or crash the host
- **A repoWrite names a repoPath that is NOT in the registered-repo set** (recoverable)
  - Detection: createRepoConfigWriteHandler cross-checks the write's repoPath against registeredRepos() (or the form only ever emits registered paths, but the handler re-validates) before prompting consent
  - Response: The write is dropped (logged) without prompting consent or calling writeKeyPath — the panel only edits daemon-registered repos (lc1)
  - User impact: None — a stale/forged repo path cannot write config

### Edge cases

| Input | Expected |
| :--- | :--- |
| The selected repo has NO models.byRepo[repoPath] entry (never overridden) | The form renders with all fields at their empty/default (no override) state; a first edit CREATES models.byRepo[repoPath] via the array-path write (setConfigAtPath auto-nests) |
| registeredRepos() returns an empty list (no repos registered with the daemon) | The picker renders an explicit empty-state ('No repos registered') and no form; no write path is reachable |
| The panel opens with no repo selected yet (selected === undefined) | renderRepoConfig shows the picker only (prompt to choose a repo); no form + no write until a {selectRepo} message arrives |
| A repoPath containing dots and slashes (e.g. /Users/x/work/a.b/repo) | The write uses the ARRAY form writeKeyPath(['models','byRepo',repoPath,...]) so the daemon's setConfigAtPath treats repoPath as ONE literal segment (never dot-split) — the value lands at models.byRepo[the exact repoPath] |
| Clearing an override (setting a field back to default) | The form emits a repoWrite with value=null; writeKeyPath(segments, null) removes/blanks that override key; the run-resolver falls back to the global/default tier |
| A field value containing HTML metacharacters (e.g. a model id with <, &) | renderRepoConfig escapes every repo path/name + field value via escapeHtml (XSS-safe); the value round-trips through the form input value attribute escaped |

### Invariants to preserve

- The sc9 WebviewPanelHost NEVER throws to its caller: every editor-API call (panels/reveal/setHtml/onDidDispose) + every injected callback (repoRenderer, onRepoConfigWrite) is guarded; a failure degrades to a logged warn + an in-panel error/no-op. S007's repo-config route must preserve this (as S005/S006 did for their routes). [[c2]]
- extension.ts stays the SOLE 'vscode' importer; the new repo-config panel core imports no 'vscode' and opens no cloud/HTTP path (k5 thin bundle, k2). The core is unit-testable off the editor over injected fakes. [[c2]]
- The daemon is reached ONLY through the existing config.catalog/config.show/config.write IPC via sc1 (k3): the per-repo write reuses the sc8 writeKeyPath ARRAY form + rawConfig; no new daemon capability and no new IPC method are introduced. [[c3]]
- Every daemon-mutating action is consent-gated before it runs (k4): the per-repo config write calls sc4 consent and writes ONLY on 'accepted'; declined/dismissed writes nothing. [[c2]]
- The webview posts only a fixed, closed set of message shapes; S007 adds {selectRepo} + {repoWrite} to the existing {switchTab,refresh,action,ready} set, all validated host-side, and appends NOTHING else. A host built without repoRenderer/onRepoConfigWrite renders the S004 placeholder unchanged (S004 tests stay green). [[c1]]
- The panel is a stateless view/editor over the daemon's ~/.insrc/config.json (single source of truth): the form is (re)rendered from fresh rawConfig on open/select/after-write, never from an optimistic local shadow — so the UI never shows a value the daemon does not hold (k5 truthfulness). [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test) over injected fakes — the shipped vscode-plugin panels + config convention (webview-host.test.ts FakePanel harness; seam.test.ts/per-role-engine.test.ts fake IpcClient recording {method,params}); no VS Code host, no live daemon, no real socket.`

### Test levels

- **unit** — Drive renderRepoConfig as a pure fn over a fake registeredRepos + a raw-config object, asserting the picker (ac1), the per-repo FORM authored through discrete fields (ac3), the empty-override + empty-repo-list edge states, XSS escaping, and reject-propagation.
  - Subjects: `renderRepoConfig renders a repo <select> of registeredRepos() (folder-independent, ac1); an empty registeredRepos() renders an explicit empty-state and no form`, `with a selected repo, renderRepoConfig renders discrete FORM fields for that repo's models.byRepo[repoPath] overrides (tiers.core/mid/cheap runner+model + per-role tasks) — NOT a raw-JSON textarea (ac3); a missing byRepo entry renders all-defaults (empty-override) fields`, `each editable field posts a {type:'repoWrite',repoPath,segments,value} message; the segments are the trailing path UNDER models.byRepo[repoPath]`, `selected===undefined renders the picker only (prompt to choose), no form + no write-emitting fields`, `every repo path/name + field value is HTML-escaped (a value with <,&," round-trips escaped); a registeredRepos() rejection PROPAGATES (not swallowed)`
  - Fixtures: `A fake registeredRepos() returning a scripted RepoRef[] (incl. empty + reject variants)`, `A raw-config fixture with + without a models.byRepo[repoPath] entry, incl. a dotted/slashed repoPath + HTML-metachar values`
- **unit** — Drive createRepoConfigWriteHandler over fake consent/writeKeyPath/rawConfig/status, asserting the consent gate (k4), the ARRAY-form segment prefixing (ac2/k3), the truthful re-render, and the never-throw refuse/reject paths.
  - Subjects: `a valid repoWrite -> consent.ask; on 'accepted' it calls writeKeyPath with EXACTLY ['models','byRepo',repoPath, ...write.segments] and the value (ac2 — applied to that specific repo via the array form)`, `on 'declined'/'dismissed' consent it calls writeKeyPath NEVER (k4) — nothing written`, `on a {ok:false} refusal it surfaces the daemon reason via sc2 StatusSurface and triggers a refresh (truthful re-read), not an optimistic value; on a writeKeyPath rejection it catches+logs and never throws`, `a repoWrite whose repoPath is not a registered repo, or a malformed write (missing repoPath / non-array segments), is dropped WITHOUT prompting consent or writing`, `on 'accepted' + {ok:true} it surfaces success via sc2 and calls refresh() to re-render from fresh rawConfig`
  - Fixtures: `A fake ConsentGate (scripted outcome), a recording writeKeyPath (captures segments+value), a fake rawConfig, a fake StatusSurface, a recording refresh + logger`
- **unit** — Drive the amended sc9 host over the FakePanel harness, asserting the repo-config message route, the ready-gated first render, malformed-message no-op, and the preserved S004 placeholder fallback + never-throw.
  - Subjects: `openRepoConfiguration with a wired repoRenderer renders its body (picker) inside the shell; with NO repoRenderer it renders the S004 placeholder unchanged (S004 tests preserved)`, `a {type:'selectRepo',repoPath} message re-renders the form for that repo (reading fresh rawConfig); a {type:'repoWrite',...} message forwards a validated RepoConfigWrite to onRepoConfigWrite`, `a malformed selectRepo/repoWrite (missing repoPath, non-array segments, unknown type) is a silent no-op (no re-render, no forward, no throw)`, `the repo-config panel uses the {type:'ready'} handshake to gate its first render; the bootstrap posts only the closed set {switchTab,refresh,action,ready,selectRepo,repoWrite}`, `a repoRenderer / onRepoConfigWrite throw is caught + logged (host never-throw preserved)`
  - Fixtures: `The S004/S005/S006 FakePanel harness (setHtml/posted/injectMessage) extended for the repo panel`, `A fake repoRenderer + recording onRepoConfigWrite`
- **unit** — Static/source guards — the repo-config seam stays VS-Code-free, cloud-free, IPC-minimal, and the sc9 amendment is additive.
  - Subjects: `Source-scan: repo-config.ts imports no 'vscode' and opens no cloud/HTTP path (extension.ts stays the sole vscode importer)`, `the per-repo write path reaches the daemon ONLY via the sc8 writeKeyPath/rawConfig (config.write/config.show) — no new IPC method, no new daemon capability (k3)`, `types.ts adds RepoConfigRenderer/RepoConfigRendererDeps/RepoConfigWrite + the two optional WebviewPanelHostDeps fields ADDITIVELY (no existing sc9 member removed/renamed)`
  - Fixtures: `Read of the new source files + types.ts + the extension.ts wiring block`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(renderer): renders the registeredRepos() picker, folder-independent; empty list -> empty-state`, `unit(host): openRepoConfiguration renders the repoRenderer picker body (and the palette command reaches it, k6)` |
| `ac2` | `unit(writeHandler): on 'accepted' consent, writeKeyPath is called with ['models','byRepo',repoPath,...segments] + value — applied to that specific repo`, `unit(host): a {repoWrite} message forwards the validated RepoConfigWrite to onRepoConfigWrite`, `unit(source): the write reaches the daemon only via the existing config.write ARRAY form (k3)` |
| `ac3` | `unit(renderer): the selected repo's overrides render as DISCRETE form fields (tiers/tasks), NOT a raw-JSON textarea; each field posts a typed repoWrite`, `unit(renderer): field values are escaped + authored through inputs (no hand-edited raw JSON surface)` |

## Alternatives considered

### a1: Additive sc9 repoRenderer + narrow RepoConfigGateway, focused per-repo model-tiering form — **CHOSEN**

Mirror the S005/S006 additive-amendment pattern: an optional repoRenderer + repo-config message route on sc9, a VS-Code-free repo-config core rendering a repo picker (registeredRepos) + a per-repo overrides FORM for the model-tiering fields that models.byRepo actually holds, writing via the existing sc8 writeKeyPath ARRAY form under consent.



### a2: Per-repo overrides as native contributes.configuration keys (sc8 native-settings style)

Expose per-repo overrides as additional native VS Code Settings keys driven through the sc8 ConfigSync engine, one key-set per registered repo, instead of a webview form.



**Rejected because:** Violates ac1, ac3, and k3: contributes.configuration is STATIC + machine-scoped while registered repos are DYNAMIC (cannot statically declare a key-set per unknown repo); directly contradicts 'authored through panel fields, not raw Settings keys' and would need a nonexistent config-changed push channel.

### a3: Raw-JSON textarea editor for the whole byRepo entry

The Repo Configuration panel shows the selected repo's models.byRepo.<repoPath> entry as a raw-JSON textarea; Save writes the whole parsed object via writeKeyPath under consent.



**Rejected because:** Violates ac3 head-on: a raw-JSON textarea IS hand-editing raw JSON — the exact thing the Story forbids; loses per-field validation/consent granularity + the JetBrains PerRepoSection parity.

## Citations

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work bundle — the daemon config IPC (config.catalog/config.show/config.write) is GLOBAL + array-path capable; per-repo lives at models.byRepo.<repoPath> in ~/.insrc/config.json; no repo/scope param, no push channel (src/daemon/index.ts:1327/1353, src/config/analyze.ts:411, vscode-plugin/src/config/__tests__/seam.test.ts)`
- **[[c2]]** `analyze-bundle` `s1 reuse.map bundle — the sc8 ConfigGateway (vscode-plugin/src/config/gateway.ts) already exposes writeKeyPath (ARRAY-form config.write) + rawConfig (config.show) + catalog; the flat byRepo entry shape (migrateByRepo, src/config/config-catalog.ts:178); S007 mirrors the S002 per-role pattern scoped to a repo`
- **[[c3]]** `analyze-bundle` `s1 structural-map bundle — the sc9 host's openRepoConfiguration placeholder shell + registeredRepos gateway + the S005/S006 additive-amendment convention (optional injected renderer + message route, built-in fallback, {ready} handshake, never-throw) that S007 extends (vscode-plugin/src/panels/webview-host.ts, daemon-gateway.ts, types.ts, html.ts)`
- **[[c4]]** `analyze-bundle` `s1 test.locate bundle — node:test (tsx --test) over injected fakes: the FakePanel harness (webview-host.test.ts) + the fake-IpcClient config seam tests (seam.test.ts/per-role-engine.test.ts) S007's tests combine`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-09-23T09:53:14.117Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | The daemon config.write IPC handler at src/daemon/index.ts:1353 takes { path: string \| string[], value } and writes a dot-path or array-of-segments over ~/.insrc/config.json (the array form S007's per-repo write depends on). | CONFIRMED: read src/daemon/index.ts:1353 -> "'config.write': async (params) => {"; the handler takes {path: string\|string[], value} (the array form S007's per-repo write relies on). | Confirmed — no change needed. |
| cl2 | citation | LOW | manual | The daemon config.catalog IPC handler is registered at src/daemon/index.ts:1327 (read-only schema+values assembler). | CONFIRMED: read src/daemon/index.ts:1327 -> "'config.catalog': async () => {" (read-only catalog handler). | Confirmed — no change needed. |
| cl3 | citation | LOW | manual | readRepoOverride in src/config/analyze.ts reads the per-repo models.byRepo override at run-resolve (the surface S007's panel edits), around line 411. | CONFIRMED: read src/config/analyze.ts:411 -> "function readRepoOverride(repoPath: string, configPath: string): RepoShaperOverride \| undefined {"; grep confirms it reads models.byRepo. docs/daemon.md:384-398 corroborate the byRepo per-repo surface. | Confirmed — no change needed. |
| cl4 | citation | LOW | manual | migrateByRepo in src/config/config-catalog.ts (around line 178) defines the flat per-repo byRepo entry shape (tasks / tiers) S007 renders as form fields. | CONFIRMED: read src/config/config-catalog.ts:178 -> "function migrateByRepo(value: unknown): unknown {"; the flat byRepo tasks/tiers shape S007 renders. | Confirmed — no change needed. |
| cl5 | semantic | LOW | manual | The vscode-plugin sc8 ConfigGateway (vscode-plugin/src/config/gateway.ts) already exposes writeKeyPath(segments, value) (ARRAY-form config.write) + rawConfig() (config.show) + catalog() — the exact primitives S007 reuses, so no new daemon capability is added. | CONFIRMED: grep found `async writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>` and rawConfig in the vscode-plugin config seam (gateway + its fakes in per-role-engine.test.ts/truthful-sync.test.ts). The sc8 ConfigGateway already exposes writeKeyPath (ARRAY-form config.write) + rawConfig (config.show) — S007 adds no new capability. | Confirmed — no change needed. |
| cl6 | closed-union | LOW | manual | The vscode-plugin config seam calls ONLY config.catalog + config.show + config.write daemon IPC (enforced by a seam test asserting deepEqual of the method set) — S007 introduces no new IPC method. | CONFIRMED: seam.test.ts:37 + per-role-engine.test.ts:176 assert deepEqual(methods, ['config.catalog','config.show','config.write']) — the config seam calls only those three IPC methods; S007 introduces no new IPC (k3 holds). | Confirmed — no change needed. |
| cl7 | semantic | LOW | manual | The sc9 DaemonDataGateway exposes registeredRepos(): Promise<readonly RepoRef[]> (RepoRef{path,name}) over repo.list — the folder-independent repo picker source for S007. | CONFIRMED: the sc9 DaemonDataGateway.registeredRepos() over repo.list + RepoRef{path,name} exists (daemon-gateway.ts / types.ts, read directly during grounding); the folder-independent repo picker source. | Confirmed — no change needed. |
| cl8 | citation | LOW | manual | The sc9 host (vscode-plugin/src/panels/webview-host.ts) exposes openRepoConfiguration() and currently renders a placeholder (REPO_PLACEHOLDER) — the shell S007 fills additively. | CONFIRMED: webview-host.ts exposes openRepoConfiguration() rendering REPO_PLACEHOLDER (read directly during S006); HLD.md:62 + S004/LLD.md corroborate the sc9 signature. The placeholder shell S007 fills additively. | Confirmed — no change needed. |
| cl9 | semantic | LOW | manual | extension.ts is the SOLE module importing 'vscode'; the new repo-config panel core must not import vscode (k5 thin bundle), matching the S004/S005/S006 panel cores. | CONFIRMED: vscode-plugin/src/extension.ts carries the sole `import * as vscode from 'vscode'` (per the build-extension epic PLAN + read directly); the new repo-config core must stay vscode-free (k5), matching S004/S005/S006 cores. | Confirmed — no change needed. |
| cl10 | semantic | LOW | manual | The sc9 WebviewPanelHostDeps already grows by ADDITIVE optional fields per story (S005 detailRenderers, S006 tabControllers/onDetailAction); S007 adds repoRenderer + onRepoConfigWrite the same way with a preserved built-in fallback. | CONFIRMED: types.ts already carries detailRenderers? (S005) + tabControllers?/onDetailAction? (S006) as additive optional WebviewPanelHostDeps fields; S007 adds repoRenderer?/onRepoConfigWrite? the same additive way with a preserved fallback. | Confirmed — no change needed. |
| cl11 | citation | LOW | manual | The panel tests use a FakePanel harness (setHtml/posted/injectMessage) in vscode-plugin/src/panels/__tests__/webview-host.test.ts that S007's host tests extend. | CONFIRMED: webview-host.test.ts:24 `class FakePanel implements PanelHandle` + :55 injectMessage() — the harness S007's host tests extend. | Confirmed — no change needed. |
| cl12 | semantic | LOW | manual | The webview bootstrap already posts a closed set {switchTab,refresh,action,ready}; S007 adds {selectRepo,repoWrite} to that closed set (validated host-side), and the {ready} handshake gates the first render (the S006-established pattern). | CONFIRMED: the webview-host.ts BOOTSTRAP posts the closed set {switchTab,refresh,action,ready} (authored S005/S006, read directly); S007 extends it with {selectRepo,repoWrite}, host-validated, and reuses the {ready} handshake to gate the first render. | Confirmed — no change needed. |
