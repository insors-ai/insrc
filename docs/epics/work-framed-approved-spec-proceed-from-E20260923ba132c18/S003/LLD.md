<!-- insrc:artifact LLD-ba132c185fe45860-s3 -->

# LLD: E20260923ba132c18:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790165706650-c3lbx6`
**HLD effective hash:** `3fb0b2204d88...`

## HLD context

**Framework:** The Epic adds a single read-only daemon capability that answers 'which models can I pick for provider X', plus the two thin plugin surfaces that render it as an authoritative dropdown for the global model tiers. The daemon is the sole proxy: it revives the offline-stubbed model-listing entry as ONE new read-only IPC handler that dispatches per provider — for ollama a live local query through the existing ollama provider, for cli-claude/cli-codex a curated JSON catalog shipped as a daemon asset — and returns the provider's model list plus an explicit availability signal, without ever making a direct cloud REST call. Both plugins are provider-agnostic consumers of that one contract over the already-shipped shared ipc-client: VS Code adds an 'insrc: Set model tier' QuickPick command, JetBrains turns its Settings-page model field into an inline combo + Refresh. Every empty/error/'(current, not in catalog)'/clear-on-provider-switch behaviour is expressed once over the daemon's returned list, so neither plugin carries per-provider logic. The tier runner enum is reused unchanged and the catalog stays out of the user-config reconcile system.
**Rollout phase:** Phase B — plugin pickers (VS Code + JetBrains)
**Consumes:** `sc2` (ModelList)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: S001's catalog file, copy-assets registration, boot-time load/validation, and curated entries are private; only the CuratedCatalog accessor + file shape are exposed. — owns `sc1`
- `s2`: How the handler dispatches per provider, the concrete live ollama model query, how it determines availability, and how it reads the curated catalog are private. Only the read-only listModels IPC + its ModelListResult shape (sc2) are exposed; the handler mutates nothing. — owns `sc2`
- `s4`: The JetBrains inline combo + Refresh + the same UX are private to S004; it consumes only sc2 over the DaemonGateway.

## Contract details

**Surface level:** internal

### `runSetModelTier`

```typescript
function runSetModelTier(deps: SetModelTierDeps): Promise<void>
```

**Parameters:**
- `deps: SetModelTierDeps { listModels(provider: ModelProvider): Promise<ModelListResult>; catalog(): Promise<ConfigCatalogSnapshot>; writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>; pick<T extends QuickPickItemLike>(items: readonly T[], opts: { placeHolder: string }): Promise<T | undefined>; notify(message: string): void }` — The injected VS-Code-free seams (default: client.rpc('providers.listModels'), the sc8 configGateway.catalog + writeKeyPath, vscode.window.showQuickPick, and a status/notify surface) so the whole flow is unit-testable over fakes.

**Returns:** `Promise<void>` — The S003-private orchestrator for the 'insrc: Set model tier' command. Flow: pick a tier -> read its effective runner (provider) + current model from catalog() -> (optionally change provider, clearing the pending model) -> listModels(provider) -> render the dropdown (or 'no models available' + Refresh on !available/empty) -> on pick, writeKeyPath(['models','tiers',tier,'model'], id). Never throws to VS Code (errors surface via notify).

**Errors:**
- `handled-not-thrown` when A listModels rejection / socket error (daemon unreachable) is caught and surfaced via notify + treated like available:false (hard-block + Refresh); the saved model is left untouched. A writeKeyPath refusal (ConfigWriteResult.ok=false) is surfaced via notify; no exception escapes the command callback (the plugin's never-throw idiom).

**Preconditions:**
- The daemon is reachable over the shared client for the list + the catalog read (a failure degrades gracefully to the empty/Refresh state, not a crash).

**Postconditions:**
- Dropdown-only (k4): only models from the daemon's returned list are selectable. On !available/empty, nothing is written (ac2). On a real pick, exactly models.tiers.<tier>.model is written (and the runner only if the provider was changed, ac4). No per-provider logic in the plugin (k2).

### `providers.listModels`

```typescript
client.rpc<ModelListResult>('providers.listModels', { provider: ModelProvider }): Promise<ModelListResult>
```

**Parameters:**
- `provider: ModelProvider ('ollama' | 'cli-claude' | 'cli-codex')` — The tier's runner (provider) whose available models to list; passed to the sc2 IPC over the shared client.

**Returns:** `Promise<ModelListResult>` — The sc2 result { provider, available, models: {id, displayName?}[] } S003 renders authoritatively. available:false + [] => hard-block + Refresh; available:true + models => the dropdown; a saved model absent from a successful list => a disabled '(current, not in catalog)' entry. S003 CONSUMES this; it does not implement or re-derive it.

**Errors:**
- `socket rejection` when client.rpc rejects when the daemon socket is absent/refused; S003 catches it and treats it as available:false (hard-block + Refresh), never a fabricated list.

**Preconditions:**
- The sc2 handler is registered (S002 shipped); the shared client is constructed in extension.ts.

**Postconditions:**
- Read-only: listing changes no daemon/config state (the mutation is only S003's own writeKeyPath of the chosen model).

### `createDaemonConfigGateway`

```typescript
createDaemonConfigGateway(client: IpcClient): ConfigGateway
```

**Parameters:**
- `client: IpcClient` — The shared ipc-client; S003 reuses the extension.ts-hoisted configGateway instance (:160) rather than constructing its own.

**Returns:** `ConfigGateway` — The sc8 gateway S003 consumes: catalog() (effective config.catalog snapshot — the tier's runner+model incl. defaults) + writeKeyPath(segments,value) (config.write ARRAY form — writes ['models','tiers',tier,'model']). No new daemon capability (k3).

**Errors:**
- `ConfigWriteResult refusal` when writeKeyPath resolves { ok:false, reason } when the daemon refuses the path; S003 surfaces the reason via notify and writes nothing further.

**Preconditions:**
- Constructed once in extension.ts from the shared client.

**Postconditions:**
- catalog() is a pure read; writeKeyPath mutates only the targeted global-tier config key.

## Data model changes

### `SetModelTierDeps` — new

The injected-seams interface for the S003 picker module (listModels / catalog / writeKeyPath / pick / notify), mirroring S007's repo-config injected-deps shape so the flow is unit-testable over fakes without vscode. The concrete QuickPick item type carries { label, description?, id?, kind (model | refresh | current-not-in-catalog | no-models) } so the k7 states are represented in one place.

```
+ interface SetModelTierDeps { listModels; catalog; writeKeyPath; pick; notify }  (S003-private)
```

**Call sites:**
- `runSetModelTier(deps) parameter`
- `vscode-plugin/src/extension.ts (the command wiring, mirroring the S007 wiring at extension.ts:315)`

### `models.tiers.<tier>.model (config key)` — field-modify

S003 WRITES the existing global-tier model key models.tiers.<core|mid|cheap>.model (a static CONFIG_CATALOG path, config-catalog.ts:96) via writeKeyPath(['models','tiers',tier,'model'], id). No schema change — the key already exists; S003 only changes HOW its value is chosen (from a daemon-backed dropdown instead of free text). The runner key is written only if the provider is changed in-flow (ac4).

```
(no schema change — write path ['models','tiers',tier,'model'] on the existing key)
```

**Call sites:**
- `configGateway.writeKeyPath (vscode-plugin/src/config/gateway.ts:42)`
- `src/config/config-catalog.ts:96 (the models.tiers.<tier>.{runner,model} key definitions, reused unchanged)`

### `insrc.models.setTier (command)` — new

A new command id + title ('insrc: Set model tier') registered via the sc3 registry (commands.register) and declared as a contributes.commands manifest entry so it is palette-reachable (k6). The command callback invokes runSetModelTier over the default seams.

```
+ contributes.commands: { command: 'insrc.models.setTier', title: 'insrc: Set model tier' }
```

**Call sites:**
- `vscode-plugin/src/daemon/commands.ts:61 (the commands.register({id,title}, cb) pattern)`
- `vscode-plugin/src/extension.ts:70 (the registry binding)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | S003 consumes sc2 (ModelList) over the shared client: client.rpc<ModelListResult>('providers.listModels', { provider }) where provider is the tier's runner. It renders the returned ModelListResult authoritatively (dropdown-only, k4): available:false/empty -> a disabled 'no models available' + a Refresh entry that re-queries and leaves the saved model untouched (ac2/k7); a saved model absent from a successful list -> a disabled '(current, not in catalog)' entry (ac3); switching the provider -> clear the pending model (ac4). S003 adds NO shared contract, touches none of S002's dispatch/ollama/catalog internals, and introduces no new daemon capability — it reuses the already-shipped sc3 command registry + sc8 ConfigGateway + the shared client only. |

## Error paths

### Error cases

- **The daemon is unreachable when listing a provider's models (socket absent/refused).** (recoverable)
  - Detection: client.rpc('providers.listModels', ...) rejects (the shared client's socket-absent rejection); runSetModelTier's try/catch around the listModels call catches the rejection.
  - Response: Treat it exactly like an available:false result: render the disabled 'no models available' entry + a Refresh, surface a brief notify, and write NOTHING (the tier's saved model is untouched, ac2/k7). No exception escapes the command callback (never-throw idiom).
  - User impact: The user sees 'no models available' + Refresh instead of an error toast/crash; starting the daemon + Refresh recovers. Recoverable.
- **The provider genuinely cannot be listed (ollama unreachable) — sc2 returns available:false + [].** (recoverable)
  - Detection: The ModelListResult from listModels has available:false; runSetModelTier branches on the availability signal (it does NOT re-derive availability itself — k2).
  - Response: Render a single disabled 'no models available' item + a Refresh item that re-invokes listModels; leave the saved model untouched (ac2/k7). Picking Refresh re-queries; picking the disabled item is a no-op.
  - User impact: Honest empty state + a one-click retry; the configured model is never silently cleared. Recoverable.
- **The catalog read fails (config.catalog rejects) so the tier's current runner/model is unknown.** (recoverable)
  - Detection: configGateway.catalog() rejects; runSetModelTier's try/catch around the read catches it.
  - Response: Surface a brief notify ('couldn't read the current configuration') and abort the flow without writing anything — do NOT guess a provider or fabricate a model. The command ends cleanly.
  - User impact: The user is told the config couldn't be read and nothing changes; retry once the daemon is up. Recoverable.
- **The daemon refuses the model write (writeKeyPath resolves { ok:false, reason }).** (recoverable)
  - Detection: The ConfigWriteResult from writeKeyPath has ok:false (the gateway maps the daemon's {ok:false} to a reason-carrying refusal).
  - Response: Surface the reason via notify; write nothing further and leave the prior saved model intact. No throw.
  - User impact: The user learns the write was refused (e.g. an invalid path) with a reason; the tier is unchanged. Recoverable by correcting + retrying.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The user dismisses the QuickPick (Esc) at the tier step, the provider step, or the model step. | pick() resolves undefined; runSetModelTier returns without writing anything (a cancel is a clean no-op, not an error). No config change. |
| A successful list whose models include the tier's currently-saved model. | The saved model is shown as the pre-selected/marked entry (not a duplicate '(current, not in catalog)' entry); picking it again is an idempotent no-op (no needless writeKeyPath). |
| A successful list that does NOT include the tier's saved model (e.g. a curated model was removed, or a hand-set id). | A disabled '(current, not in catalog)' entry shows the saved id so the user sees exactly what is configured (ac3); it is not selectable, and picking any real model replaces it. |
| available:true but models:[] (a curated-empty or reachable-zero provider). | Same as unavailable for presentation — 'no models available' + Refresh, saved model untouched — but the semantics differ (the source responded honestly with zero, not a failure). The picker treats an empty list as nothing-to-pick regardless of the availability flag. |
| The user changes the provider mid-flow to one different from the tier's runner. | The pending model selection clears and the model list re-queries for the NEW provider (ac4); the tier cannot be saved until a model from the new provider's list is picked. If the provider is changed, the runner key is also written on confirm. |
| The tier's runner is a value outside the three ModelProvider literals (a stale/hand-edited config). | runSetModelTier does not pass an out-of-enum provider to sc2; it surfaces a notify that the tier's provider is unrecognised and offers the provider-selection step (from the reused runner enum, k3) rather than calling listModels with a bad value. |

### Invariants to preserve

- The plugin is a DUMB dropdown: it renders the daemon's ModelListResult authoritatively and carries NO per-provider list logic or freshness/resilience handling — availability comes from the sc2 available flag, not a plugin-side probe (k2/k4). The models offered are exactly the daemon's list; there is no free-text model entry. [[c1]]
- No new daemon capability and no new transport: S003 reuses the already-shipped shared ipc-client (client.rpc), the sc3 command registry (commands.register), and the sc8 ConfigGateway (catalog + writeKeyPath config.write ARRAY form) — all over the existing Unix socket, no cloud path (k3). The daemon's config.json stays the single source of truth for what IS selected; the picker holds no shadow state and re-reads on open/refresh. [[c5]]
- The write goes through the sc8 writeKeyPath ARRAY form (['models','tiers',tier,'model']) — the config.write path-as-array form the settings-UI epic established so a multi-segment key is written un-mis-nested — targeting the EXISTING models.tiers.<tier>.model CONFIG_CATALOG key (config-catalog.ts:96), reusing the runner enum unchanged (k3). On any non-availability / empty / refusal path, the saved value is left untouched (ac2/k7). [[c5]]

## Test strategy

**Test framework:** `node:test (tsx --test), colocated under vscode-plugin/src/**/__tests__/*.test.ts — the picker-flow unit tests beside the new module (e.g. vscode-plugin/src/models/__tests__/), mirroring vscode-plugin/src/panels/__tests__/repo-config.test.ts (inject-the-dependency) + the vscode-plugin/src/__tests__/packaging.test.ts contributes-manifest scan`

### Test levels

- **unit** — Exercise runSetModelTier over injected fakes (a fake listModels + a stub catalog + a scripted fake pick + a recording writeKeyPath + a notify spy) so every k7 branch — dropdown, empty/unavailable+Refresh, '(current, not in catalog)', clear-on-provider-switch, and the write — is verified WITHOUT vscode. Mirrors the S007 repo-config inject-the-dependency approach.
  - Subjects: `happy path: tier picked, provider read from catalog(), listModels returns available:true + models -> the QuickPick shows exactly those models (dropdown-only), picking one calls writeKeyPath(['models','tiers',tier,'model'], id) exactly once`, `available:false -> the items are a disabled 'no models available' + a Refresh entry; picking Refresh re-invokes listModels; NO writeKeyPath is called (saved model untouched)`, `available:true + models:[] (curated-empty/reachable-zero) -> same 'no models available' + Refresh presentation, no write`, `saved model present in a successful list -> shown once (marked current), not duplicated as '(current, not in catalog)'; re-picking it is an idempotent no-op (no writeKeyPath)`, `saved model ABSENT from a successful list -> a disabled '(current, not in catalog)' entry showing the saved id; it is not selectable; picking a real model writes the new id`, `provider changed mid-flow -> the pending model clears + listModels re-queries for the NEW provider; the model can only be saved from the new list; on confirm the runner key is also written`, `a listModels rejection (daemon unreachable) -> treated as available:false (Refresh), a notify is emitted, no writeKeyPath, no throw escapes`, `a catalog() rejection -> notify + clean abort, no write, no throw`, `a writeKeyPath refusal ({ok:false, reason}) -> the reason is surfaced via notify, no further write, no throw`, `Esc/cancel at the tier / provider / model step -> pick() undefined -> clean return, no write`, `a tier runner outside the ModelProvider enum -> no out-of-enum provider is passed to listModels; a notify + the provider-selection step is offered`
  - Fixtures: `a fake SetModelTierDeps: listModels returning available:true+models / available:false / available:true+[] / rejecting; catalog() returning a snapshot with a known models.tiers.<tier>.{runner,model} (incl. a defaulted-runner variant) / rejecting; a scripted pick() returning a chosen item / Refresh / undefined; a writeKeyPath recording {segments,value} and returning {ok:true} or {ok:false,reason}; a notify spy`, `no vscode import in the module under test`
- **unit** — Guard the packaging + wiring invariants via source-scans (the plugin's k5/k6 test idiom): the module is VS-Code-free and the command is palette-reachable.
  - Subjects: `the S003 picker module imports no 'vscode' (the SOLE vscode importer stays extension.ts) — an import source-scan`, `package.json contributes.commands includes { command: 'insrc.models.setTier', title: 'insrc: Set model tier' } (palette-reachable, k6) — mirrors the packaging.test.ts command-manifest assertion`, `extension.ts registers 'insrc.models.setTier' via the sc3 registry and wires runSetModelTier over the default seams (client.rpc + the hoisted configGateway + showQuickPick)`
  - Fixtures: `a read of the module's import list`, `a read of vscode-plugin/package.json contributes.commands + extension.ts`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `happy path: listModels available:true+models -> the QuickPick shows exactly those models (dropdown-only) and picking one writes models.tiers.<tier>.model once`, `package.json contributes.commands includes insrc.models.setTier (palette-reachable, k6); extension.ts registers + wires it` |
| `ac2` | `available:false -> 'no models available' + Refresh, no writeKeyPath (saved model untouched); Refresh re-queries`, `available:true + models:[] -> same 'no models available' + Refresh, no write`, `a listModels rejection -> treated as available:false (Refresh), no write, no throw` |
| `ac3` | `saved model ABSENT from a successful list -> a disabled '(current, not in catalog)' entry showing the saved id; picking a real model writes the new id`, `saved model PRESENT -> shown once (marked current), not duplicated; re-pick is an idempotent no-op` |
| `ac4` | `provider changed mid-flow -> pending model clears + listModels re-queries for the new provider; save only from the new list; the runner key is written on confirm`, `a tier runner outside the enum -> the provider-selection step is offered instead of passing a bad provider to sc2` |

## Migration

**State before:** Today the VS Code plugin exposes the global model tiers only through native contributes.configuration (the settings-UI epic S001): models.tiers.<core|mid|cheap>.{runner,model} where `model` is a FREE-TEXT field — the user types a raw model id with no validation, no list of what's available, and a typo silently mis-configures the tier. The plugin already has the seams S003 needs: the sc3 command registry (commands.register, vscode-plugin/src/daemon/commands.ts:61), the shared ipc-client exposing client.rpc<T>(method, params?) (src/shared/ipc-client.ts:105, constructed at extension.ts:67), the sc8 ConfigGateway (createDaemonConfigGateway, config/gateway.ts:28, with catalog() over config.catalog + writeKeyPath ARRAY form over config.write, hoisted at extension.ts:160), and the showQuickPick pattern (extension.ts:293). The sc2 list-models IPC ('providers.listModels') is shipped (S002, main 131c14d). No command surfaces a provider-filtered model dropdown yet.

**State after:** A new VS-Code-free module (e.g. vscode-plugin/src/models/model-tier-picker.ts) exports runSetModelTier(deps) + SetModelTierDeps; extension.ts registers an 'insrc.models.setTier' command ('insrc: Set model tier') via the sc3 registry, declared in package.json contributes.commands (palette-reachable, k6), wiring runSetModelTier over default seams (client.rpc('providers.listModels'), the hoisted configGateway.catalog + writeKeyPath, showQuickPick, a notify). The command reads the tier's effective runner+model from catalog(), lists via sc2, presents an authoritative dropdown (dropdown-only, k4) with the k7 states (empty/unavailable+Refresh untouched, '(current, not in catalog)', clear-on-provider-switch), and writes the chosen model via writeKeyPath(['models','tiers',tier,'model']). The native free-text model field stays (unchanged); the command is the guided alternative. Colocated node:test tests cover every branch via injected fakes + a contributes-manifest scan.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the VS-Code-free picker module (vscode-plugin/src/models/model-tier-picker.ts) exporting SetModelTierDeps + runSetModelTier(deps): the tier→provider→model flow, the k7 item states (model / refresh / current-not-in-catalog / no-models), and the writeKeyPath on pick. Purely additive; imports no vscode; nothing wires it yet. — ↩ rollbackable
2. Wire the command in extension.ts: register 'insrc.models.setTier' via the sc3 registry and invoke runSetModelTier over the default seams (client.rpc('providers.listModels'), the already-hoisted configGateway.catalog + writeKeyPath, vscode.window.showQuickPick, a notify surface). Additive to the existing command wiring; no existing command changes. — ↩ rollbackable
3. Declare the command in vscode-plugin/package.json contributes.commands ({ command: 'insrc.models.setTier', title: 'insrc: Set model tier' }) so it is palette-reachable (k6). Manifest-only additive change. — ↩ rollbackable
4. Add colocated node:test tests (vscode-plugin/src/models/__tests__/): the picker-flow branches (dropdown / empty+Refresh untouched / '(current, not in catalog)' / clear-on-provider-switch / write / never-throw error paths / cancel) via injected fakes, plus source-scans that the module imports no vscode and that package.json contributes the command. — ↩ rollbackable

**Backward compat:** No existing public API changes. The native models.tiers.<tier>.{runner,model} settings (S001) are UNCHANGED — the free-text model field remains; S003 only ADDS a guided command that writes the same existing key via the existing sc8 writeKeyPath, so a user who ignores the command sees no difference and existing configured values are untouched. The command reuses the already-shipped shared client, sc3 registry, and sc8 gateway — no new daemon capability, no config-schema change, no change to the runner enum (k3). Rolling back any step (module, wiring, manifest entry, tests) removes the command with no residue; the native settings continue to work.

## Alternatives considered

### a1: Standalone VS-Code-free picker module over injected seams; reads effective tier via the sc8 gateway's catalog() — **CHOSEN**

A new pure module (e.g. vscode-plugin/src/models/model-tier-picker.ts) exporting runSetModelTier(deps) that orchestrates tier→provider→model over injected seams {listModels(provider), catalog(), writeKeyPath, pick, status}; reads the tier's effective runner+model from the sc8 gateway's catalog() and writes the chosen model via writeKeyPath(['models','tiers',tier,'model']); registered as an 'insrc: Set model tier' command in extension.ts.

Extract the whole flow into a VS-Code-free module (the plugin's established extract-into-modules + inject-deps idiom, mirroring S007's repo-config.ts): runSetModelTier(deps) takes injected seams — listModels(provider) (default client.rpc('providers.listModels')), catalog() (the sc8 gateway's effective config.catalog snapshot so a defaulted runner is visible), writeKeyPath (the sc8 ARRAY form), a pick(items, opts) QuickPick fn (default vscode.window.showQuickPick), and a notify surface. Flow: pick the TIER; read its effective runner (provider) + current model from catalog(); optionally offer a provider step (defaulting to the runner) — changing it CLEARS the pending model (ac4); call listModels(provider); if available:false or empty render a single disabled 'no models available' + a Refresh entry that re-queries and leaves the saved model untouched (ac2/k7); render the models as QuickPick items (dropdown-only, k4), and when the saved model is absent from a successful list add a disabled '(current, not in catalog)' entry (ac3); on a real pick, writeKeyPath(['models','tiers',tier,'model'], id). extension.ts registers 'insrc.models.setTier' via the sc3 registry + a contributes.commands entry (k6). All k7 branches expressed ONCE over the daemon's returned list.

### a2: Inline the picker flow directly in extension.ts

Write the tier→provider→model QuickPick flow inline in the extension.ts command callback, calling client.rpc + configGateway directly.

Register the command in extension.ts and put the whole flow — tier pick, catalog read, listModels call, empty/Refresh/'(current, not in catalog)'/clear-on-switch handling, and the writeKeyPath — inline in the command callback. No new module.

**Rejected because:** Behaviourally meets the ACs but scores partial on ac2/ac3/ac4/k7 because burying the multi-step flow in extension.ts (the sole vscode importer) makes the k7 branches untestable off vscode — contradicting the plugin's extract-into-modules + inject-deps idiom that every prior story (S004-S007) follows. Same M cost as a1 for strictly worse verifiability.

### a3: Standalone module but read the current runner/model from rawConfig() instead of catalog()

Same VS-Code-free module as a1, but reads the tier's current runner+model from the sc8 gateway's rawConfig() (raw config.json overrides) rather than catalog() (effective values).

Identical module + flow to a1, except the tier's current provider (runner) and saved model are read from rawConfig() (the raw ~/.insrc/config.json) instead of the config.catalog effective snapshot.

**Rejected because:** Same module + flow as a1 but scores only partial on ac1 and ac3 because rawConfig() omits catalog DEFAULTS — a GLOBAL tier's defaulted runner/model reads as undefined (the S007 rawConfig precedent does not transfer: byRepo keys have no defaults). catalog() (a1) reads the effective value and avoids both gaps for no extra cost.

## Citations

- **[[c1]]** `analyze-bundle` `S002 (shipped, main 131c14d): the sc2 'providers.listModels' IPC returning ModelListResult { provider, available, models } (src/daemon/list-models.ts, registered at src/daemon/index.ts:1520), consumed by S003 over the shared client.rpc; the dumb-dropdown/no-per-provider-logic invariant.` — "S003 calls client.rpc('providers.listModels', { provider }) and renders the list authoritatively (dropdown-only, k4); availability comes from the sc2 available flag, not a plugin-side probe."
- **[[c5]]** `analyze-bundle` `vscode-plugin seams (extension.ts:70/:160/:293, config/gateway.ts:28/42/50, daemon/commands.ts:61, src/shared/ipc-client.ts:105, src/config/config-catalog.ts:96): the sc3 command registry + sc8 ConfigGateway (catalog + writeKeyPath ARRAY form over config.write) + the showQuickPick pattern + the models.tiers.<tier>.{runner,model} keys, all reused unchanged (no new daemon capability, k3).` — "S003 reuses the already-shipped shared ipc-client (client.rpc), the sc3 command registry (commands.register), and the sc8 ConfigGateway (catalog + writeKeyPath config.write ARRAY form) — no new daemon"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-23T14:40:45.930Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | auto | The sc2 'providers.listModels' handler is implemented in src/daemon/list-models.ts and registered in the daemon handler map at src/daemon/index.ts around line 1520, returning ModelListResult { provider, available, models }. | Direct source read confirms src/daemon/index.ts:1520 EXACTLY: `'providers.listModels': (params) => listModels(params),   // sc2 (Epic ba132c185fe45860, S002)`. Implementation confirmed in src/daemon/list-models.ts:46/:100 (ModelListResult, listModels). The doc-crowded grep obscured it but the exact line matches. | None — verified sound. sc2 handler is registered at the cited line and returns the cited shape. |
| contract/createDaemonConfigGateway | citation | LOW | auto | createDaemonConfigGateway is defined in vscode-plugin/src/config/gateway.ts around line 28 and exposes catalog() plus writeKeyPath(segments,value) (config.write ARRAY form) around lines 42/50. | createDaemonConfigGateway at gateway.ts:28 EXACT; writeKeyPath at gateway.ts:42 EXACT; catalog() at gateway.ts:30. The c5 citation's stray ':50' does not map to either method (catalog is :30, writeKeyPath :42), but every load-bearing anchor (the factory + the writeKeyPath ARRAY form S003 actually calls) is exact. | Non-blocking: the stray ':50' in the c5 citation string is cosmetic. Optionally correct to gateway.ts:30 (catalog) / :42 (writeKeyPath) at build time; the reusable seams are confirmed. |
| datamodel/command-registry | citation | LOW | auto | The sc3 command registry pattern commands.register({id,title}, cb) exists at vscode-plugin/src/daemon/commands.ts:61. | Read anchor vscode-plugin/src/daemon/commands.ts:61 EXACT: `commands.register({ id: 'insrc.daemon.install', title: 'insrc: Install daemon' }, async () => {` — the commands.register({id,title},cb) pattern S003 mirrors. | None — verified sound. |
| migration/ipc-client | citation | LOW | auto | The shared ipc-client exposing client.rpc<T>(method, params?) is at src/shared/ipc-client.ts:105. | The rpc<T>(method, params?) signature is at src/shared/ipc-client.ts:93 (`rpc<T = unknown>(method: string, params?: unknown): Promise<T>;`); the cited :105 is the createIpcClient factory whose returned object exposes .rpc (:107 calls rpc<T>). Right capability, cited line points at the factory not the signature. | Non-blocking cosmetic drift: the client.rpc capability S003 consumes is confirmed. At build, reference the signature at ipc-client.ts:93 (or the factory at :105). No design impact. |
| datamodel/config-key | citation | LOW | auto | The global model-tier keys models.tiers.<core\|mid\|cheap>.{runner,model} are defined in src/config/config-catalog.ts around line 96 and are reused unchanged (no schema change). | Read anchor src/config/config-catalog.ts:96 EXACT: the models.tiers.core.runner catalog entry with enumValues ['ollama','cli-claude','cli-codex']. Confirms the global-tier keys S003 writes exist and the schema is unchanged. | None — verified sound. |
| migration/extension-wiring | citation | LOW | auto | vscode-plugin/src/extension.ts is the sole vscode importer and already constructs the ipc client (:67), binds the command registry (:70), hoists configGateway (:160), and uses the showQuickPick pattern (:293) — S003 wires the new command alongside these. | extension.ts:67 EXACT (`const client = createIpcClient();`); extension.ts:160 EXACT (`const configGateway = createDaemonConfigGateway(client);`); extension.ts:293 EXACT (the showQuickPick pattern). All wiring anchors S003 extends are confirmed in real source. | None — verified sound; strongest-grounded claim. |
| test/prior-art | citation | LOW | auto | The inject-the-dependency test prior art exists at vscode-plugin/src/panels/__tests__/repo-config.test.ts and the contributes-manifest scan at vscode-plugin/src/__tests__/packaging.test.ts. | Both test prior-art files exist: vscode-plugin/src/panels/__tests__/repo-config.test.ts (confirmed by grep) AND vscode-plugin/src/__tests__/packaging.test.ts (confirmed by direct `ls`). The doc-saturated grep had crowded out the packaging path but it is present. | None — verified sound; both inject-the-dependency and contributes-manifest-scan prior art exist to mirror. |
| invariant/runner-enum | closed-union | LOW | auto | The runner/provider enum is exactly 'ollama' \| 'cli-claude' \| 'cli-codex' and is reused unchanged (k3); S003 adds no new provider literal. | Read anchor src/daemon/list-models.ts:30 EXACT: `export type ModelProvider = 'ollama' \| 'cli-claude' \| 'cli-codex';`. The closed union is exactly the three literals; S003 reuses it unchanged (k3). | None — verified sound. |
| boundary/consumes-sc2-only | cross-artifact | LOW | manual | S003 consumes sc2 only and introduces no new shared contract and no new daemon capability — it reuses the already-shipped sc3 registry, sc8 gateway, and shared client. | Not deterministically probeable (a boundary/architectural claim), but consistent with the confirmed evidence: S003's only sc2 touchpoint is client.rpc('providers.listModels') (cl1), and it reuses the already-shipped sc3 registry (cl3), sc8 gateway (cl2), and shared client (cl4/cl6) — no new daemon handler is introduced in any cited file. | None actionable — the boundary (consumes sc2 only, no new capability) is corroborated by the surrounding confirmed citations. No new-contract or new-handler edit appears anywhere in the LLD. |
