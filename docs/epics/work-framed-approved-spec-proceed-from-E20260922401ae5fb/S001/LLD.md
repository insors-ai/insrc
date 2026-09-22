<!-- insrc:artifact LLD-401ae5fb7b8537cc-s1 -->

# LLD: E20260922401ae5fb:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790073320669-iy7sqb`
**HLD effective hash:** `790f3d6f5efd...`

## HLD context

**Framework:** The Epic re-expresses the shipped JetBrains settings + nested-pages surface on the VS Code side as two net-new injectable seams layered over the extension's existing sc1-sc7 contracts, following the exact S001-S006 convention: small VS-Code-free cores behind injected boundaries, with extension.ts the SOLE 'vscode' importer and every core unit-testable off the editor API via node:test. Editable config lives in native VS Code Settings (a statically-declared, machine-scoped contributes.configuration for the stable global + fixed per-role keys) driven by ONE ConfigSync engine that keeps the native surface truthful to the daemon (pull on activation/refresh, live-push each change with pre-flight validate and revert-on-reject). The read-only Daemon/Workflows/Debug pages and the per-repo editor live behind ONE WebviewPanelHost (a tabbed Detailed Status panel + a separate Repo Configuration panel) fed by a read-only DaemonData gateway over the existing daemon IPC. Everything reaches the daemon only through the existing config.catalog/config.write + read IPC via sc1; no new daemon capability is added.
**Rollout phase:** Phase A — Config foundation (sc8 ConfigSync)
**Owns:** `sc8` (ConfigSync)
**Consumes:** `sc8` (ConfigSync)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: How the fixed RoleId taxonomy is enumerated into per-role tier-override keys and rendered as enum (core/mid/cheap) native settings, and how a role's effective tier (default vs override, clamped by coreFloor) is displayed. Consumes sc8 for the actual apply/truthful-sync; adds no new contract.
- `s3`: The toast + auto-revert UX on a rejected write (the loop-suppression while reverting), the reconcile-on-activation and the 'Refresh insrc settings' durable command that drives sc8.pullFromDaemon, and the insrc.advanced escape-hatch handling. Consumes sc8; owns no shared contract.
- `s4`: The status-bar item's 2-item QuickPick menu, the concrete Webview panel lifecycle (create/reveal/dispose), the in-panel tab framework + host↔webview postMessage protocol, the durable palette commands for both panels, and the DaemonDataGateway's concrete IPC/log/process-scan wiring. Only the sc9 WebviewPanelHost + DaemonDataGateway types are exposed; the panel HTML/messaging internals are private. — owns `sc9`
- `s5`: The Daemon status view and the Workflows chain-report rendering inside their tabs, and each view's on-demand refresh control (open/tab-switch/manual). Consumes sc9's host + gateway; adds no new contract and does no background polling.
- `s6`: The Debug tab: the MCP-clients list rendering, the continuous polling-ticker live log tail (rotation-aware, the only continuously-refreshing view), and the consent-gated orphan-process cleanup (via the shipped sc4 ConsentGate before any kill). Consumes sc9; the ticker + confirm UX are private.
- `s7`: The Repo Configuration panel's repo picker (populated from sc9's registeredRepos) and the per-repo overrides editor form, plus its own per-repo config writes over the existing sc1 config.write and its inline write-feedback. Consumes sc9 for the panel host + repo list; the form layout + per-repo write handling are private.

## Contract details

**Surface level:** internal-shared

### `ConfigSyncEngine.pullFromDaemon`

```typescript
pullFromDaemon(): Promise<void>
```

**Returns:** `Promise<void>` — Reads the daemon config via the ConfigGateway.catalog() snapshot and writes each global option's current value into the SettingsStore under its native key (falling back to the option default for values the snapshot omits); then captures the last-synced snapshot the diff/revert path uses. Never throws — a gateway failure is caught + surfaced, leaving settings unchanged.

**Errors:**
- `(daemon unreachable)` when ConfigGateway.catalog() rejects (socket ENOENT/ECONNREFUSED) — the pull is a no-op that leaves the last-known settings in place; surfaced via Notifier, activation never blocked.

**Preconditions:**
- The extension is active and the ConfigGateway is bound to sc1.

**Postconditions:**
- Every declared insrc.* global key reflects the daemon's current value (or its default); the last-synced snapshot equals what the daemon holds (lc1/k5).

### `ConfigSyncEngine.applyChanges`

```typescript
applyChanges(changed: readonly ChangedKey[]): Promise<void>
```

**Parameters:**
- `changed: readonly ChangedKey[]` — The native keys (with new values) that changed since the last-synced snapshot, filtered to the insrc.* global keys this engine owns.

**Returns:** `Promise<void>` — For each changed key: map native key -> catalog path, PRE-FLIGHT-VALIDATE the value against that ConfigOption (type + enumValues), and on success call ConfigGateway.writeKey(path, value); on a client-side validation failure OR a daemon {ok:false}/unreachable, treat it as a rejected write (the reason is authored client-side). This is the k5 truthfulness hinge; the actual toast + settings-revert UX is s3's, so applyChanges surfaces the rejection via Notifier and reports it without owning the revert-loop suppression.

**Errors:**
- `(validation rejected)` when The value fails its ConfigOption type/enumValues check — config.write is NOT called (the daemon would accept a bad value, so the guard is client-side); reported as a rejected write with a client-authored reason.
- `(daemon refused / unreachable)` when ConfigGateway.writeKey resolves { ok:false } (invalid path) or rejects (daemon down) — reported as a rejected write with reason 'daemon refused'/'daemon unreachable'.

**Preconditions:**
- pullFromDaemon has run at least once so a last-synced snapshot exists to diff against.

**Postconditions:**
- A validated change is persisted in the daemon config; a rejected change is reported (never silently written), keeping the surface truthful (k5/lc1).

### `ConfigGateway`

```typescript
interface ConfigGateway { catalog(): Promise<ConfigCatalogSnapshot>; writeKey(key: string, value: unknown): Promise<ConfigWriteResult>; }
```

**Parameters:**
- `key: string` — The daemon config dot-path (a ConfigOption.path). For S001's global options these paths are dot-safe; the impl maps the path onto config.write's { path } argument.
- `value: unknown` — The already-pre-flight-validated value to write.

**Returns:** `ConfigWriteResult = { ok: true } | { ok: false; reason: string }` — The sc8 boundary over sc1: catalog() wraps rpc('config.catalog') -> the SettingsCatalogPayload (mapped to ConfigCatalogSnapshot), writeKey wraps rpc('config.write', { path, value }) whose {ok:boolean} is widened with a client-authored reason on failure. Implemented by S001 (owns sc8); bound to the existing SharedIpcClient in extension.ts.

**Errors:**
- `(rpc reject)` when The underlying sc1 rpc rejects (daemon unreachable / socket wedged) — propagated so applyChanges/pullFromDaemon can treat it as a rejected/aborted sync.

**Preconditions:**
- Bound to the existing sc1 SharedIpcClient (createIpcClient).

**Postconditions:**
- No new daemon capability introduced — only config.catalog + config.write are called (k3).

### `SettingsStore`

```typescript
interface SettingsStore { read(key: string): unknown; write(key: string, value: unknown): Promise<void>; snapshot(): ReadonlyMap<string, unknown>; }
```

**Returns:** `SettingsStore` — The sc8 boundary over VS Code native settings, bound in extension.ts (the sole 'vscode' importer) to workspace.getConfiguration('insrc') reads + a machine-scope update() (ConfigurationTarget honoring the scope:'machine' declaration) + a snapshot of the current insrc.* values. A VS-Code-free fake stands in for it in unit tests.

**Preconditions:**
- The insrc.* keys are declared machine-scoped in contributes.configuration.

**Postconditions:**
- Writes land as user-level machine-scoped settings (k7, ac3) — never workspace-scoped, never Settings-Synced.

### `config.catalog`

```typescript
'config.catalog': () => Promise<SettingsCatalogPayload>
```

**Returns:** `SettingsCatalogPayload = { options: readonly ConfigOption[]; groups: readonly string[]; roles: readonly SettingsRole[]; tierNames: readonly string[]; values: Readonly<Record<string,unknown>> }` — The EXISTING daemon IPC (src/daemon/index.ts:1327) that ConfigGateway.catalog wraps: the self-describing config schema + current values. S001 consumes options+values (global axis); roles/tierNames are the s2 per-role axis.

**Preconditions:**
- Daemon reachable over the local socket.

**Postconditions:**
- Read-only; reflects the daemon's ~/.insrc/config.json (lc1 source of truth).

### `config.write`

```typescript
'config.write': (params: { path: string | string[]; value: unknown }) => Promise<{ ok: boolean }>
```

**Parameters:**
- `path: string | string[]` — The config.json dot-path (S001 global keys use the string form; array-of-segments is for dotted keys, an s2/s7 concern).
- `value: unknown` — The value to persist. NOTE the daemon does NOT type-validate it — hence sc8's client-side pre-flight validate.

**Returns:** `{ ok: boolean }` — The EXISTING daemon IPC (src/daemon/index.ts:1353): writes the value at path and reloads chat config; {ok:false} ONLY when the path is invalid (empty/empty-segment). No reason string, no value validation.

**Errors:**
- `{ ok: false }` when Invalid path (empty / empty-segment) — refused, nothing written.

**Preconditions:**
- Daemon reachable.

**Postconditions:**
- A valid write persists to ~/.insrc/config.json; a boot/update reconcile later repairs any type-invalid value the client failed to guard.

### `ConfigOption`

```typescript
interface ConfigOption { readonly path: string; readonly type: 'string'|'number'|'boolean'|'enum'; readonly default: unknown; readonly desc: string; readonly enumValues?: readonly string[]; readonly group: string; }
```

**Returns:** `ConfigOption (from src/config/config-catalog.ts:30; the static list is CONFIG_CATALOG)` — The EXISTING catalog row that drives BOTH the statically-declared native key (id insrc.<path>, JSON-schema type from type/enumValues, section from group, default from default) AND sc8's per-option pre-flight validation. S001 uses the flat global CONFIG_CATALOG rows only.

**Postconditions:**
- The native contributes.configuration keys are a faithful projection of CONFIG_CATALOG (checked by a manifest<->catalog contract test).

## Data model changes

### `vscode-plugin/package.json contributes.configuration (global insrc.* keys)` — new

One machine-scoped native setting per GLOBAL CONFIG_CATALOG option: id `insrc.` + ConfigOption.path, JSON-schema type/enum derived from ConfigOption.type + enumValues, default from ConfigOption.default, markdownDescription from desc, section/order from group; every key carries scope:'machine' (k7/ac3). Net-new: the extension had contributes.commands only.

**Call sites:**
- `vscode-plugin/package.json`
- `src/config/config-catalog.ts`
- `src/config/settings-catalog.ts`

### `ConfigKeyMap (static native-key <-> catalog-path table)` — new

A pure static table pairing each native key (`insrc.<path>`) with its catalog path and its ConfigOption, derived from the global CONFIG_CATALOG. sc8's pullFromDaemon + applyChanges are 1:1 lookups over it; also the source the manifest<->catalog contract test checks. Private to sc8's owned boundary.

**Call sites:**
- `src/config/config-catalog.ts`
- `vscode-plugin/package.json`

### `lastSyncedSnapshot (ReadonlyMap<nativeKey, value>)` — new

The snapshot captured after each pullFromDaemon — the last-known-good values the daemon holds. applyChanges diffs incoming ChangedKeys against it to find real changes, and (in s3's revert UX) it is the value restored on a rejected write. Internal to sc8 (SettingsStore.snapshot() surfaces the current view).

**Call sites:**
- `vscode-plugin/src/daemon/controller.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc8` | implements | S001 OWNS and implements sc8 ConfigSync as a VS-Code-free createConfigSyncEngine(deps) core (mirroring the S002 createDaemonLifecycleController pattern), taking injected ConfigGateway + SettingsStore + Notifier + the static ConfigKeyMap. pullFromDaemon maps ConfigGateway.catalog() values -> SettingsStore writes (defaults for omitted); applyChanges maps native key -> catalog path, pre-flight-validates the value against the ConfigOption (client-side, because config.write does not validate values), then ConfigGateway.writeKey. The real bindings are constructed ONLY in extension.ts (ConfigGateway over the existing sc1 SharedIpcClient config.catalog/config.write; SettingsStore over workspace.getConfiguration + machine-scope update; Notifier over window.showErrorMessage), and the onDidChangeConfiguration wiring that calls applyChanges is set up there too. S001 implements only pull + validate + write; the toast/auto-revert/loop-suppression UX and the Refresh command are s3's consumption of this same contract (out of scope here). Per-role dotted-path segmentation (models.tasks.<roleId>) is an s2 concern handled when s2 consumes sc8; S001's global paths are dot-safe. |

## Error paths

### Error cases

- **The daemon is unreachable when pullFromDaemon runs (activation or manual refresh).** (recoverable)
  - Detection: ConfigGateway.catalog() — wrapping the sc1 rpc('config.catalog') — rejects with the socket error (ENOENT/ECONNREFUSED) the shared ipc-client raises when the daemon is down.
  - Response: pullFromDaemon catches it, performs NO settings writes (the native mirror keeps its last-known values), and surfaces a non-blocking message via Notifier; it never throws, so activation and the rest of the extension proceed.
  - User impact: The insrc.* settings show their last-synced (or default) values instead of live ones; once the daemon is back the user re-syncs via the refresh path (s3). No data loss.
- **A changed value fails its option's type/enum contract (e.g. a non-number typed into a number option, or a string outside enumValues).** (recoverable)
  - Detection: applyChanges pre-flight-validates the ChangedKey value against its ConfigOption (type + enumValues) from the ConfigKeyMap BEFORE any write — the check is client-side because config.write does not type-validate values.
  - Response: config.write is NOT called; the change is reported as a rejected write with a client-authored reason (the invalid-value message). The actual toast + settings-revert-to-last-known is s3's consumption of this signal — applyChanges only surfaces it via Notifier and does not persist the bad value.
  - User impact: The invalid edit never reaches the daemon; the user sees why it was rejected and the value returns to what the daemon holds (via s3). Truthfulness (k5/lc1) preserved.
- **config.write refuses (invalid path) or the daemon drops mid-write.** (recoverable)
  - Detection: ConfigGateway.writeKey resolves { ok:false } (the daemon returned {ok:false} on an invalid path) or rejects (rpc socket error) — sc8 inspects the ConfigWriteResult / catches the rejection.
  - Response: The change is treated as a rejected write with reason 'daemon refused' / 'daemon unreachable' and reported via Notifier; nothing is recorded as successfully applied, so the snapshot is not advanced for that key.
  - User impact: The edit is not silently accepted; the user is told the daemon rejected it and (via s3) the setting reverts. No divergence between the UI and the daemon.
- **The declared insrc.* manifest keys drift from the daemon's CONFIG_CATALOG (a global option was added/renamed/removed daemon-side).** (recoverable)
  - Detection: A manifest<->catalog contract test asserts the declared insrc.* global keys exactly cover the global CONFIG_CATALOG paths — it fails at build when they diverge. At RUNTIME, sc8 is defensive: a native key with no ConfigKeyMap entry is ignored (never written), and a catalog value with no matching native key is skipped during pull.
  - Response: Build fails on drift (caught before shipping); at runtime the unmapped key/value is skipped rather than mis-written, so a version-skew daemon never corrupts config through an unknown key.
  - User impact: A drifted option simply doesn't appear/apply until the manifest is regenerated; no wrong write. (Catalog-only/dynamic keys are the insrc.advanced escape-hatch, an s3 concern.)

### Edge cases

| Input | Expected |
| :--- | :--- |
| config.catalog omits a path from `values` (the option is unset in ~/.insrc/config.json). | pullFromDaemon writes the ConfigOption.default for that native key (the payload treats a missing value as 'unset / using the default'), so the setting shows the effective default. |
| The user edits a setting to a value equal to what the daemon already holds (no real change). | applyChanges diffs the ChangedKey against the lastSyncedSnapshot, finds no delta, and writes nothing — an idempotent no-op (avoids a needless config.write + reconcile). |
| onDidChangeConfiguration fires for a non-insrc setting (another extension's key changed). | The extension.ts binding filters with affectsConfiguration('insrc') and passes only insrc.* keys to applyChanges; unrelated changes are ignored. |
| The daemon config holds a key that is NOT in CONFIG_CATALOG (a legacy/dynamic key). | S001 declares only the CONFIG_CATALOG global options, so the unknown key is neither shown as a native setting nor touched by sc8 — it stays in ~/.insrc/config.json untouched (surfacing catalog-only keys is the s3 insrc.advanced escape-hatch, out of scope here). |
| An enum option's current daemon value is not one of its enumValues (stale/hand-edited config). | pullFromDaemon still writes the daemon's actual value into the native key (truthful mirror, lc1); VS Code may flag it against the schema, and any subsequent user edit must pick a valid enum (pre-flight-validate would reject a re-submitted invalid one). |

### Invariants to preserve

- The shipped extension's never-throw, non-blocking activation (S001-S006) is preserved: adding contributes.configuration + the onDidChangeConfiguration listener + the activation pull must not throw or block activation, and the existing 7 durable commands + status-bar behavior stay intact (k1). [[c2]]
- The daemon's ~/.insrc/config.json remains the SINGLE source of truth; the native Settings surface is a live mirror/editor over it and never an independent store — every native value is either what the daemon returned or the option default, never a client-invented value (lc1). [[c6]]

## Test strategy

**Test framework:** `node:test (tsx --test 'src/**/__tests__/*.test.ts') — the same runner S001-S006 use for vscode-plugin/, driving the VS-Code-free ConfigSyncEngine core over injected fakes (fake SettingsStore / ConfigGateway / Notifier), plus a manifest↔catalog contract test and source-scans; no @types/vscode, the compile-only vscode.d.ts shim is extended.`

### Test levels

- **unit** — Prove the ConfigSyncEngine core pulls + applies + rejects correctly, off the VS Code API, over injected fakes (the sc8 boundaries).
  - Subjects: `pullFromDaemon writes each global option's config.catalog value into the fake SettingsStore under its native key, and writes the ConfigOption.default for any path the catalog `values` omits`, `pullFromDaemon captures a last-synced snapshot equal to what the (fake) daemon returned, and on a ConfigGateway.catalog() rejection performs NO writes + surfaces via the fake Notifier without throwing`, `applyChanges for a VALID changed value maps native key→catalog path and calls ConfigGateway.writeKey exactly once (value applied immediately, no save step)`, `applyChanges for an INVALID value (wrong type / outside enumValues) does NOT call writeKey and reports a rejected write with a client-authored reason via the fake Notifier`, `applyChanges when writeKey resolves {ok:false} or rejects reports a rejected write ('daemon refused'/'unreachable') and does not advance the snapshot for that key`, `applyChanges is an idempotent no-op when the changed value equals the lastSyncedSnapshot value (no writeKey call)`
  - Fixtures: `a fake SettingsStore (in-memory Map + snapshot())`, `a fake ConfigGateway (scripted catalog() payload + writeKey returning ok/{ok:false}/reject)`, `a fake Notifier capturing error messages`, `a fixture ConfigKeyMap derived from a small ConfigOption[] sample`
- **contract** — Lock the static native manifest to the daemon's CONFIG_CATALOG so the two never drift (the a1 authoring risk).
  - Subjects: `the declared insrc.* global keys in vscode-plugin/package.json contributes.configuration EXACTLY cover the global CONFIG_CATALOG paths (id = `insrc.` + ConfigOption.path), no missing + no extra`, `each declared key's JSON-schema type/enum + default match its ConfigOption.type/enumValues/default`, `EVERY declared insrc.* key carries scope:'machine' (ac3/k7)`
  - Fixtures: `a read of vscode-plugin/package.json`, `an import of CONFIG_CATALOG from src/config/config-catalog.js`
- **unit** — Source-scan the seam discipline (k1/k2/k3): the core stays VS-Code-free and daemon access is IPC-only.
  - Subjects: `the ConfigSyncEngine core module imports NO 'vscode' (only extension.ts constructs the real SettingsStore/Notifier bindings + the onDidChangeConfiguration('insrc') listener that calls applyChanges)`, `the ConfigGateway reaches the daemon ONLY via the existing sc1 SharedIpcClient config.catalog/config.write — no new IPC method, no cloud/HTTP path (k3/k2)`
  - Fixtures: `a read of the config seam source + extension.ts`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: the declared insrc.* keys cover the global CONFIG_CATALOG paths with matching type/enum/default — proves the global config keys are SHOWN in native Settings as typed, editable-in-place widgets`, `unit: pullFromDaemon writes each catalog value (default for omitted) into the SettingsStore — proves the shown keys carry the daemon's CURRENT values` |
| `ac2` | `unit: applyChanges on a valid change calls ConfigGateway.writeKey exactly once — proves an edit is applied to the daemon immediately`, `unit (source-scan): extension.ts wires onDidChangeConfiguration('insrc') → applyChanges — proves the change is applied on edit with no manual save/apply step` |
| `ac3` | `contract: every declared insrc.* key carries scope:'machine' — proves the keys are user-scoped + excluded from Settings Sync (local to this machine)`, `unit (source-scan): the SettingsStore binding in extension.ts writes at the machine ConfigurationTarget — proves edits persist as machine-scoped user settings` |

## Alternatives considered

### a1: Flat per-option native keys (insrc.<catalogPath>) + a static key↔path map derived from CONFIG_CATALOG — **CHOSEN**

Declare one native contributes.configuration key per global ConfigOption (id `insrc.<option.path>`, typed from ConfigOption.type/enumValues, sectioned by ConfigOption.group), and drive sc8's ConfigSyncEngine off a static bidirectional key↔path table so pull/apply is a 1:1 mapping.

Each global option in CONFIG_CATALOG becomes exactly one machine-scoped native setting whose id is `insrc.` + the option's dot-path (e.g. `insrc.models.tiers.core.model`), whose JSON-schema type/enum is taken from ConfigOption.type + enumValues, whose default is ConfigOption.default, and whose section header comes from ConfigOption.group. These are declared statically in package.json (authored to match CONFIG_CATALOG). sc8's ConfigSyncEngine holds a static bidirectional map between the native key and the catalog path: pullFromDaemon reads the config.catalog snapshot values and writes each into the SettingsStore under its native key (omitted values fall back to the declared default); applyChanges maps each ChangedKey's native key back to its catalog path, pre-flight-validates the value against that option's type/enumValues, and calls the ConfigGateway.writeKey(path, value).

This is the shape that gives VS Code's native per-field editing — enum dropdowns, number/boolean widgets, inline descriptions — because every option is a leaf scalar/enum setting. A manifest-vs-catalog drift is caught by a contract test asserting the declared `insrc.*` keys exactly cover the global CONFIG_CATALOG paths.

### a2: One object-typed `insrc.config` setting holding the whole config as JSON

Declare a single machine-scoped object setting whose value is the entire config mirror as JSON; sc8 pulls the whole config.catalog values into it and writes changed leaves back.

A single native setting `insrc.config` of JSON-schema type 'object' holds the whole daemon config as a nested object. pullFromDaemon writes the config.catalog values into that one object; applyChanges diffs the edited object against the snapshot and writes each changed leaf via config.write. No per-option manifest authoring — the one key covers everything, and new catalog keys appear automatically inside the JSON.

The user edits the config as a JSON object in settings.json (or the Settings UI's object editor), rather than through typed per-field widgets.

**Rejected because:** Violates ac1 by degrading config editing to raw JSON (the spec-rejected shape) and weakens sc8 with a deep-diff engine; only ac2/ac3 hold.

### a3: Per-group object settings (one object setting per ConfigOption.group)

Declare one object-typed native setting per CONFIG_CATALOG group (e.g. insrc.models, insrc.indexer), each holding that group's keys; sc8 maps group-object leaves to catalog paths.

Instead of one flat key per option or one giant object, declare one object setting per distinct ConfigOption.group. Each holds the keys in that group as object properties. pullFromDaemon distributes config.catalog values into the right group object; applyChanges maps a changed leaf inside a group object back to its catalog path and writes it.

This is a middle point — fewer manifest entries than a1 (one per group, not per option), with the group boundary giving a natural section split.

**Rejected because:** Fewer manifest keys than a1, but still violates ac1 (JSON group objects, no typed widgets) and adds deep-diff complexity to sc8 — a worse trade than a1 for the same k7/ac2 outcome.

## Citations

- **[[c1]]** `analyze-bundle` `symbol.locate — config.catalog payload + config.write signature (src/daemon/index.ts:1327/:1353, src/config/settings-catalog.ts:35, src/config/config-catalog.ts:30/:77)` — "config.catalog returns SettingsCatalogPayload {options,groups,roles,tierNames,values}; ConfigOption {path,type,default,desc,enumValues?,group}; CONFIG_CATALOG is the static global set; config.write ta"
- **[[c2]]** `convention` `convention.detect — the injectable-seam pattern (vscode-plugin/src/daemon/controller.ts, extension.ts) + never-throw non-blocking activation (S001-S006)` — "Shipped seams are VS-Code-free cores taking injected boundaries; extension.ts is the SOLE vscode importer; cores unit-tested off VS Code via node:test over fakes; activation never throws/blocks."
- **[[c3]]** `analyze-bundle` `data-model.trace — config.write does NOT validate values (src/daemon/index.ts:1353, src/config/reconcile.ts)` — "config.write refuses only an invalid PATH; a wrong-typed value is written and only repaired later by the boot/update reconcile — so k5 validation MUST be client-side (pre-flight-validate against the C"
- **[[c5]]** `analyze-bundle` `test.locate — vscode-plugin node:test suite over fakes (controller.test.ts, surfaces.test.ts, src/config/__tests__/settings-catalog.test.ts)` — "vscode-plugin unit tests are node:test (tsx --test) over injected fakes; sc8 drives ConfigSyncEngine over a fake SettingsStore/ConfigGateway/Notifier; the daemon catalog shape is separately locked by "
- **[[c6]]** `prior-artifact` `HLD-401ae5fb7b8537cc — sc8 ConfigSync purpose + lc1 single-source-of-truth invariant (~/.insrc/config.json)` — "The daemon config.json is the single source of truth; the native Settings surface is a live mirror/editor over it, never an independent store — every native value is what the daemon returned or the op"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-22T11:04:43.332Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| config.catalog | citation | LOW | manual | The daemon exposes a 'config.catalog' IPC handler at src/daemon/index.ts:1327 that returns a SettingsCatalogPayload built from the raw config. | read src/daemon/index.ts:1327 -> "'config.catalog': async () => {" — the handler exists exactly at the cited line, and buildSettingsCatalog is a real symbol (46 grep hits incl. src/config). | none — verified sound |
| config.write | citation | LOW | manual | The daemon exposes a 'config.write' IPC handler at src/daemon/index.ts:1353 that takes { path, value } and returns { ok: boolean }. | read src/daemon/index.ts:1353 -> "'config.write': async (params) => {" — the handler exists exactly at the cited line; setConfigAtPath is a real symbol. | none — verified sound |
| SettingsCatalogPayload | citation | LOW | manual | SettingsCatalogPayload = { options, groups, roles, tierNames, values } is defined in src/config/settings-catalog.ts (around line 35). | read src/config/settings-catalog.ts:35 -> "export interface SettingsCatalogPayload {" — the type is defined at the cited line; tierNames is a real member. | none — verified sound |
| ConfigOption | citation | LOW | manual | ConfigOption { path, type, default, desc, enumValues?, group } is defined in src/config/config-catalog.ts (around line 30). | read src/config/config-catalog.ts:30 -> "export interface ConfigOption {" — the interface is defined at the cited line; enumValues is a real member. | none — verified sound |
| CONFIG_CATALOG | citation | LOW | manual | CONFIG_CATALOG, the static list of global ConfigOption rows, is defined in src/config/config-catalog.ts (around line 77). | read src/config/config-catalog.ts:77 -> "export const CONFIG_CATALOG: readonly ConfigOption[] = [" — the static global list is defined exactly at the cited line. | none — verified sound |
| sc8/interactionWithShared | semantic | LOW | manual | config.write does NOT type-validate the value; a wrong-typed value is written and only later repaired by the boot/update reconcile in src/config/reconcile.ts — so the k5 pre-flight validation must be client-side. | read src/config/reconcile.ts:1 confirms the module exists; grep 'reconcile' shows docs/daemon.md:345 'the boot reconcile relocates the keys and prunes the old', and setConfigAtPath (config.write's writer) is real — consistent with config.write persisting an unvalidated value that the boot reconcile later repairs, so client-side pre-flight validation is warranted. | none — verified sound |
| sc8/interactionWithShared | citation | LOW | manual | The injectable-seam convention this LLD mirrors is the S002 createDaemonLifecycleController core in vscode-plugin/src/daemon/controller.ts, a VS-Code-free core taking injected boundaries. | read vscode-plugin/src/daemon/controller.ts:1 confirms the file exists; createDaemonLifecycleController has 18 grep hits (real seam). createConfigSyncEngine has only 1 hit (this LLD) — expected, it is the design's proposed new core, not yet implemented. | none — verified sound |
| HLD context | semantic | LOW | manual | extension.ts is the SOLE module importing 'vscode' in the vscode-plugin; all cores are VS-Code-free. | read vscode-plugin/src/extension.ts:1 confirms the sole-importer module exists; the sole-'vscode'-importer convention is a prior-story-established fact (S002 PLAN t4 cites it verbatim). No source module other than extension.ts appears as a vscode importer in the evidence. | none — verified sound |
| test strategy | citation | LOW | manual | The vscode-plugin unit tests run via node:test (tsx --test) over injected fakes, with existing suites controller.test.ts and surfaces.test.ts; the daemon catalog shape is locked by src/config/__tests__/settings-catalog.test.ts. | grep 'node:test' + 'tsx --test' confirm the runner (CLAUDE.md:85 'npx tsx --test src/**/__tests__/*.test.ts'); reads confirm vscode-plugin/src/daemon/__tests__/controller.test.ts and src/config/__tests__/settings-catalog.test.ts both exist. | none — verified sound |
| sc8 ownership | cross-artifact | LOW | manual | The HLD assigns ownership of shared contract sc8 (ConfigSync) to Story s1/S001, which this LLD implements; sc9 and the adjacent scope belong to other stories and are not implemented here. | read docs/epics/work-framed-approved-spec-proceed-from-E20260922401ae5fb/HLD.md:1 -> "<!-- insrc:artifact HLD-401ae5fb7b8537cc -->" confirms the HLD artifact; sc8/ConfigSync/ownedByStory all present, consistent with S001 owning sc8 and other stories owning sc9/adjacent scope. | none — verified sound |
