<!-- insrc:artifact PLAN-401ae5fb7b8537cc-s1 -->

# Plan: E20260922401ae5fb:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790074153585-o14e1o`
**LLD effective hash:** `790f3d6f5efd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Extend the compile-only vscode.d.ts shim with the config API surface | S | — | smoke: tsc -p vscode-plugin/tsconfig.json compiles clean with the extended shim and no @types/vscode dependency | [[c2]] |
| 2 | **`t2`** Declare the 31 machine-scoped global keys in package.json contributes.configuration | M | — | unit: manifest-catalog contract: declared insrc.* keys exactly cover the 31 global CONFIG_CATALOG paths with matching type/enum/default and scope:'machine' | [[c1]] |
| 3 | **`t3`** Build the static ConfigKeyMap (native-key <-> catalog-path <-> ConfigOption) | S | — | unit: ConfigKeyMap covers all 31 global options and resolves both nativeKey->option and path->option 1:1 | [[c1]] |
| 4 | **`t4`** Implement the VS-Code-free ConfigSyncEngine core (createConfigSyncEngine) | M | `t3` | unit: pullFromDaemon writes each catalog value (ConfigOption.default for omitted) into the fake SettingsStore under its native key; unit: pullFromDaemon captures the last-synced snapshot and on a catalog() rejection writes nothing + notifies without throwing; unit: applyChanges on a valid change maps native key->path and calls writeKey exactly once; unit: applyChanges rejects an invalid value (type/enum) without calling writeKey and reports a client-authored reason via Notifier; unit: applyChanges on writeKey {ok:false}/reject reports a rejected write and does not advance the snapshot; unit: applyChanges is an idempotent no-op when the value equals the lastSyncedSnapshot; unit: source-scan: the ConfigSyncEngine core module imports no 'vscode' | [[c3]] [[c1]] |
| 5 | **`t5`** Wire the real sc8 bindings + activation pull + change listener in extension.ts | M | `t1`, `t4` | unit: source-scan: extension.ts wires onDidChangeConfiguration('insrc') -> applyChanges and binds SettingsStore at the machine ConfigurationTarget; unit: source-scan: the ConfigGateway reaches the daemon only via config.catalog/config.write (no new IPC, no cloud/HTTP) | [[c2]] [[c1]] |
| 6 | **`t6`** Add the ConfigSyncEngine unit suite, the manifest<->catalog contract test, and the seam source-scans | M | `t2`, `t4`, `t5` | unit: the full sc8 test suite (engine units + manifest-catalog contract + seam source-scans) passes green under tsx --test | [[c4]] [[c5]] |

### E20260922401ae5fb:S001:T001 — Extend the compile-only vscode.d.ts shim with the config API surface

Add to vscode-plugin/src/vscode.d.ts (no @types/vscode) the minimal ambient declarations sc8's bindings need: workspace.getConfiguration('insrc') returning a WorkspaceConfiguration (get/update/has/inspect), workspace.onDidChangeConfiguration + ConfigurationChangeEvent (affectsConfiguration), and ConfigurationTarget with the Machine member. This gates tsc compile for the extension.ts bindings in t5.

**Acceptance checks:**
- tsc -p vscode-plugin/tsconfig.json compiles the new config API references with no error and no new dependency added
- the shim declares workspace.getConfiguration, workspace.onDidChangeConfiguration, ConfigurationChangeEvent, and ConfigurationTarget.Machine

### E20260922401ae5fb:S001:T002 — Declare the 31 machine-scoped global keys in package.json contributes.configuration

Author one native setting per global CONFIG_CATALOG option (31 keys, 7 group sections): id `insrc.` + ConfigOption.path, JSON-schema type from ConfigOption.type (enum -> enumValues array for the 6 enum options), default from ConfigOption.default, markdownDescription from desc, scope:'machine' on every key. Net-new contributes.configuration block (the manifest had contributes.commands only).

**Acceptance checks:**
- vscode-plugin/package.json contributes.configuration declares exactly the 31 global CONFIG_CATALOG paths as `insrc.<path>` keys, each scope:'machine'
- each key's type/enum/default matches its ConfigOption.type/enumValues/default
- package.json remains valid JSON and the manifest still lists the existing 7 commands

### E20260922401ae5fb:S001:T003 — Build the static ConfigKeyMap (native-key <-> catalog-path <-> ConfigOption)

Add a pure, VS-Code-free module that derives, from the imported global CONFIG_CATALOG, a static bidirectional table pairing each native key (`insrc.<path>`) with its catalog path and its ConfigOption (type + enumValues for validation). This is the single source sc8's pull/apply lookups and the manifest<->catalog contract test both read. Private to the sc8 boundary.

**Acceptance checks:**
- a VS-Code-free module exports a ConfigKeyMap covering all 31 global CONFIG_CATALOG options with native key, catalog path, and ConfigOption
- the module imports CONFIG_CATALOG from the daemon config-catalog source and imports no 'vscode'
- lookups are 1:1 and total over the global options (nativeKey->option and path->option both resolve)

### E20260922401ae5fb:S001:T004 — Implement the VS-Code-free ConfigSyncEngine core (createConfigSyncEngine)

Add createConfigSyncEngine(deps) mirroring the S002 createDaemonLifecycleController pattern, over injected ConfigGateway + SettingsStore + Notifier + the t3 ConfigKeyMap. pullFromDaemon: read ConfigGateway.catalog() values -> write each into SettingsStore under its native key (ConfigOption.default for omitted paths), capture lastSyncedSnapshot, never throw (catch + Notifier on catalog reject). applyChanges: for each ChangedKey map native key->catalog path, pre-flight-validate against the ConfigOption (type + enumValues), writeKey on success; on validation failure or {ok:false}/reject report a rejected write via Notifier without advancing the snapshot; idempotent no-op when the value equals the snapshot. Implements only pull+validate+write (no revert-loop/Refresh UX — that is s3).

**Acceptance checks:**
- createConfigSyncEngine returns { pullFromDaemon, applyChanges } and imports no 'vscode'
- pullFromDaemon maps catalog values (default for omitted) into the SettingsStore and captures the last-synced snapshot; a catalog() rejection writes nothing and surfaces via Notifier without throwing
- applyChanges writes exactly once per valid change, rejects an invalid value (type/enum) without calling writeKey, reports {ok:false}/reject without advancing the snapshot, and is a no-op when the value equals the snapshot

### E20260922401ae5fb:S001:T005 — Wire the real sc8 bindings + activation pull + change listener in extension.ts

In extension.ts (the sole 'vscode' importer): construct ConfigGateway over the existing sc1 SharedIpcClient (rpc('config.catalog')/rpc('config.write'), widening {ok:boolean} to ConfigWriteResult with a client-authored reason), SettingsStore over workspace.getConfiguration('insrc') + a machine-scope update() + snapshot of current insrc.* values, and Notifier over window.showErrorMessage. Call pullFromDaemon() on activation (non-blocking, never throws) and register an onDidChangeConfiguration listener that filters affectsConfiguration('insrc') and passes only insrc.* ChangedKeys to applyChanges. No new daemon capability; the 7 existing commands + status-bar wiring stay intact.

**Acceptance checks:**
- extension.ts constructs the ConfigGateway (over sc1 config.catalog/config.write only), SettingsStore (machine-scope update), and Notifier, and hands them to createConfigSyncEngine
- activation calls pullFromDaemon() without blocking or throwing, and the existing 7 commands + status-bar behavior are unchanged
- an onDidChangeConfiguration listener filters affectsConfiguration('insrc') and invokes applyChanges with only insrc.* keys

### E20260922401ae5fb:S001:T006 — Add the ConfigSyncEngine unit suite, the manifest<->catalog contract test, and the seam source-scans

New node:test (tsx --test) suites: (a) unit tests driving createConfigSyncEngine over a fake SettingsStore/ConfigGateway/Notifier for pull mapping+defaults+snapshot, catalog-reject no-op, valid-write-once, invalid-value rejection, {ok:false}/reject handling, and idempotent no-op; (b) a contract test asserting the declared insrc.* keys exactly cover the 31 global CONFIG_CATALOG paths with matching type/enum/default and scope:'machine'; (c) source-scans proving the ConfigSyncEngine core imports no 'vscode' and the ConfigGateway reaches the daemon only via config.catalog/config.write.

**Acceptance checks:**
- the unit suite covers all six ConfigSyncEngine subjects and passes under tsx --test over the fakes
- the contract test fails on any manifest<->CONFIG_CATALOG drift (missing/extra key, wrong type/enum/default, non-machine scope) and passes on the authored manifest
- source-scan tests assert the core imports no 'vscode' and no IPC method beyond config.catalog/config.write is referenced (k1/k2/k3)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| pullFromDaemon writes each global option's config.catalog value into the fake SettingsStore under its native key, and writes the ConfigOption.default for any path the catalog `values` omits | `t4`, `t6` |
| pullFromDaemon captures a last-synced snapshot equal to what the (fake) daemon returned, and on a ConfigGateway.catalog() rejection performs NO writes + surfaces via the fake Notifier without throwing | `t4`, `t6` |
| applyChanges for a VALID changed value maps native key→catalog path and calls ConfigGateway.writeKey exactly once (value applied immediately, no save step) | `t4`, `t6` |
| applyChanges for an INVALID value (wrong type / outside enumValues) does NOT call writeKey and reports a rejected write with a client-authored reason via the fake Notifier | `t4`, `t6` |
| applyChanges when writeKey resolves {ok:false} or rejects reports a rejected write ('daemon refused'/'unreachable') and does not advance the snapshot for that key | `t4`, `t6` |
| applyChanges is an idempotent no-op when the changed value equals the lastSyncedSnapshot value (no writeKey call) | `t4`, `t6` |
| the declared insrc.* global keys in vscode-plugin/package.json contributes.configuration EXACTLY cover the global CONFIG_CATALOG paths (id = `insrc.` + ConfigOption.path), no missing + no extra | `t2`, `t6` |
| each declared key's JSON-schema type/enum + default match its ConfigOption.type/enumValues/default | `t2`, `t6` |
| EVERY declared insrc.* key carries scope:'machine' (ac3/k7) | `t2`, `t6` |
| the ConfigSyncEngine core module imports NO 'vscode' (only extension.ts constructs the real SettingsStore/Notifier bindings + the onDidChangeConfiguration('insrc') listener that calls applyChanges) | `t4`, `t5`, `t6` |
| the ConfigGateway reaches the daemon ONLY via the existing sc1 SharedIpcClient config.catalog/config.write — no new IPC method, no cloud/HTTP path (k3/k2) | `t5`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails — config.catalog/config.write IPC shapes + CONFIG_CATALOG/ConfigOption + the native insrc.* manifest keys and ConfigKeyMap (src/daemon/index.ts:1327/:1353, src/config/config-catalog.ts:30/:77, src/config/settings-catalog.ts:35)`
- **[[c2]]** `prior-artifact` `LLD s1 invariantsToPreserve + convention — the injectable-seam pattern with extension.ts as the sole 'vscode' importer and never-throw, non-blocking activation preserving the existing 7 commands + status bar (k1)`
- **[[c3]]** `prior-artifact` `LLD s1 errorPaths — config.write does NOT type-validate the value (only refuses an invalid path), so the k5 pre-flight validation against the ConfigOption must live client-side in applyChanges`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy — node:test (tsx --test) over injected fakes (SettingsStore/ConfigGateway/Notifier) + a manifest↔catalog contract test + seam source-scans; the vscode.d.ts shim is extended, no @types/vscode`
- **[[c5]]** `analyze-bundle` `s1 test.locate — vscode-plugin unit tests run via node:test over fakes with the S002 controller.test.ts / surfaces.test.ts precedent; the daemon catalog shape is separately locked by src/config/__tests__/settings-catalog.test.ts`
