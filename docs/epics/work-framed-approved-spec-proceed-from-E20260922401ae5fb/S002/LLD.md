<!-- insrc:artifact LLD-401ae5fb7b8537cc-s2 -->

# LLD: E20260922401ae5fb:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790073320669-iy7sqb`
**HLD effective hash:** `790f3d6f5efd...`

## HLD context

**Framework:** The Epic re-expresses the shipped JetBrains settings + nested-pages surface on the VS Code side as two net-new injectable seams layered over the extension's existing sc1-sc7 contracts, following the exact S001-S006 convention: small VS-Code-free cores behind injected boundaries, with extension.ts the SOLE 'vscode' importer and every core unit-testable off the editor API via node:test. Editable config lives in native VS Code Settings (a statically-declared, machine-scoped contributes.configuration for the stable global + fixed per-role keys) driven by ONE ConfigSync engine that keeps the native surface truthful to the daemon (pull on activation/refresh, live-push each change with pre-flight validate and revert-on-reject). The read-only Daemon/Workflows/Debug pages and the per-repo editor live behind ONE WebviewPanelHost (a tabbed Detailed Status panel + a separate Repo Configuration panel) fed by a read-only DaemonData gateway over the existing daemon IPC. Everything reaches the daemon only through the existing config.catalog/config.write + read IPC via sc1; no new daemon capability is added.
**Rollout phase:** Phase B — Config editing complete (per-role + truthful sync)
**Consumes:** `sc8` (ConfigSync)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The exact set of stable global config keys declared in contributes.configuration (machine scope) and the mapping from config.catalog paths to those native keys; the last-synced snapshot representation; and the internal validate→write→revert mechanics of the ConfigSync engine. Only the sc8 ConfigSyncEngine + its injected boundary types are exposed; how the pull and the per-change diff are computed is private. — owns `sc8`
- `s3`: The toast + auto-revert UX on a rejected write (the loop-suppression while reverting), the reconcile-on-activation and the 'Refresh insrc settings' durable command that drives sc8.pullFromDaemon, and the insrc.advanced escape-hatch handling. Consumes sc8; owns no shared contract.
- `s4`: The status-bar item's 2-item QuickPick menu, the concrete Webview panel lifecycle (create/reveal/dispose), the in-panel tab framework + host↔webview postMessage protocol, the durable palette commands for both panels, and the DaemonDataGateway's concrete IPC/log/process-scan wiring. Only the sc9 WebviewPanelHost + DaemonDataGateway types are exposed; the panel HTML/messaging internals are private. — owns `sc9`
- `s5`: The Daemon status view and the Workflows chain-report rendering inside their tabs, and each view's on-demand refresh control (open/tab-switch/manual). Consumes sc9's host + gateway; adds no new contract and does no background polling.
- `s6`: The Debug tab: the MCP-clients list rendering, the continuous polling-ticker live log tail (rotation-aware, the only continuously-refreshing view), and the consent-gated orphan-process cleanup (via the shipped sc4 ConsentGate before any kill). Consumes sc9; the ticker + confirm UX are private.
- `s7`: The Repo Configuration panel's repo picker (populated from sc9's registeredRepos) and the per-repo overrides editor form, plus its own per-repo config writes over the existing sc1 config.write and its inline write-feedback. Consumes sc9 for the panel host + repo list; the form layout + per-repo write handling are private.

## Contract details

**Surface level:** internal-shared

### `buildPerRoleKeyMap`

```typescript
buildPerRoleKeyMap(): readonly ConfigKeyEntry[]
```

**Returns:** `readonly ConfigKeyEntry[]` — The 30 static per-role entries derived from reasoningRoleTaxonomy(): each { nativeKey: `insrc.models.tasks.<roleId>`, path: `models.tasks.<roleId>` (display/id form), segments: ['models','tasks',roleId] (the dot-safe write form), option: a synthetic ConfigOption { type:'enum', enumValues:['cheap','mid','core'], default: role.defaultTier, group:'Models — per-role tiers' }, source:'raw' }. Merged with S001's global ConfigKeyMap so the ONE engine drives both.

**Preconditions:**
- reasoningRoleTaxonomy() returns the closed role registry (30 roles).

**Postconditions:**
- Total + pure: one entry per fixed role, byNativeKey/byPath resolve 1:1; every entry carries segments (dot-safe) + source:'raw'.

### `reasoningRoleTaxonomy`

```typescript
reasoningRoleTaxonomy(): RoleTaxonomy
```

**Returns:** `RoleTaxonomy = { roles: readonly RoleDescriptor[]; rankOf: Record<TierName, number> }` — The EXISTING closed reasoning-role registry (src/config/role-taxonomy.ts:102) S002 enumerates into per-role keys. RoleDescriptor = { id: RoleId(string), criticality, defaultTier: TierName }; 30 roles, ids may contain dots. tierNames derive from Object.keys(rankOf) = cheap|mid|core.

**Postconditions:**
- Consumed read-only; the per-role manifest keys are a faithful projection of ROLES (checked by a manifest<->taxonomy contract test).

### `ConfigGateway.writeKeyPath`

```typescript
writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>
```

**Parameters:**
- `segments: readonly string[]` — The literal config path segments (e.g. ['models','tasks','context.assemble']) — the dot-safe ARRAY form config.write requires for dotted roleIds; a dot-split string would mis-nest roleTiers['context.assemble'].
- `value: unknown` — The already-pre-flight-validated tier value to write.

**Returns:** `ConfigWriteResult = { ok: true } | { ok: false; reason: string }` — The ADDED sc8 gateway method (HLD amendment, additive): wraps rpc('config.write', { path: segments, value }) — the string[] form — widening the daemon's {ok:boolean} with a client-authored reason on failure. S001's existing writeKey(key:string) is UNCHANGED (globals keep the string form).

**Errors:**
- `(rpc reject)` when The underlying sc1 rpc rejects (daemon unreachable) — propagated so applyChanges treats it as an aborted write, identical to writeKey.

**Preconditions:**
- Bound to the existing sc1 SharedIpcClient; the daemon config.write already accepts path: string | string[].

**Postconditions:**
- No new daemon capability (k3) — only the existing string[] form of config.write is used; the per-role leaf is written un-mis-nested.

### `ConfigGateway.rawConfig`

```typescript
rawConfig(): Promise<Record<string, unknown>>
```

**Returns:** `Promise<Record<string, unknown>>` — The ADDED sc8 gateway method (HLD amendment, additive): wraps the EXISTING config.show IPC (src/daemon/index.ts:1314), returning the raw parsed ~/.insrc/config.json (or {} when absent). pullFromDaemon reads the current per-role override from raw.models?.tasks?.[roleId] because config.catalog.values OMITS dynamic models.tasks.* keys.

**Errors:**
- `(rpc reject)` when config.show rejects (daemon unreachable) — propagated; the per-role pull is caught + surfaced like the global pull, leaving settings unchanged (never throws).

**Preconditions:**
- Daemon reachable over the local socket.

**Postconditions:**
- Read-only; reflects ~/.insrc/config.json (lc1). No new daemon capability (config.show already exists, k3).

### `config.show`

```typescript
'config.show': () => Promise<Record<string, unknown>>
```

**Returns:** `Record<string, unknown>` — The EXISTING daemon IPC (src/daemon/index.ts:1314): returns the raw parsed config.json (or {} on missing/invalid). The source of the current per-role override values (models.tasks.<roleId>) that config.catalog omits.

**Preconditions:**
- Daemon reachable.

**Postconditions:**
- Read-only; no session reload, no write.

### `config.write`

```typescript
'config.write': (params: { path: string | string[]; value: unknown }) => Promise<{ ok: boolean }>
```

**Parameters:**
- `path: string | string[]` — S002 uses the ARRAY form ['models','tasks',roleId] for the dotted per-role keys (a dot-string would mis-nest); the daemon's setConfigAtPath/toConfigSegments (src/config/write-path.ts) treats each array element as one literal key.
- `value: unknown` — The tier value; the daemon does NOT type-validate it, so sc8 pre-flight-validates against the enum first.

**Returns:** `{ ok: boolean }` — The EXISTING daemon IPC (src/daemon/index.ts:1353): writes value at the (segment) path and reloads chat config; {ok:false} only on an invalid/empty path/segment.

**Errors:**
- `{ ok: false }` when Empty path or empty segment — refused; nothing written.

**Preconditions:**
- Daemon reachable.

**Postconditions:**
- A valid write persists to ~/.insrc/config.json under the un-mis-nested models.tasks[roleId] leaf.

## Data model changes

### `vscode-plugin/package.json contributes.configuration (per-role insrc.models.tasks.<roleId> keys)` — new

One machine-scoped native ENUM setting per fixed role (30 keys): id `insrc.models.tasks.` + roleId, type 'string' + enum ['cheap','mid','core'], default = the role's defaultTier, markdownDescription naming the role + its criticality, scope:'machine' (k7). Added as new configuration section(s) alongside S001's 7 global sections; the manifest is generated FROM reasoningRoleTaxonomy() so it cannot drift (contract-tested).

**Call sites:**
- `vscode-plugin/package.json`
- `src/config/role-taxonomy.ts`

### `PerRoleKeyMap (static roleId -> {nativeKey, segments, enum-option} table)` — new

A pure VS-Code-free table built from reasoningRoleTaxonomy(): for each role, the native key `insrc.models.tasks.<roleId>`, the write SEGMENTS ['models','tasks',roleId], and a synthetic enum ConfigOption (default = defaultTier). Merged into the engine's key map so the ONE engine's pull/apply drives per-role keys 1:1. Private to S002 but shaped as S001's ConfigKeyEntry.

**Call sites:**
- `src/config/role-taxonomy.ts`
- `vscode-plugin/src/config/key-map.ts`

### `ConfigKeyEntry (S001 sc8 internal type)` — field-add

Add two OPTIONAL fields so the ONE engine handles both global and per-role keys without special-casing: `segments?: readonly string[]` (when present, the engine writes via ConfigGateway.writeKeyPath(segments,...) instead of writeKey(path,...)) and `source?: 'catalog' | 'raw'` (default 'catalog'; 'raw' pulls the current value from ConfigGateway.rawConfig() at the segment path instead of the catalog snapshot). S001's global entries omit both (default behavior unchanged). Additive, non-breaking to S001.

```
interface ConfigKeyEntry { nativeKey: string; path: string | readonly string[]; option: ConfigOption; segments?: readonly string[]; source?: 'catalog' | 'raw'; }
```

**Call sites:**
- `vscode-plugin/src/config/types.ts`
- `vscode-plugin/src/config/sync-engine.ts`

### `models.tasks.<roleId> (daemon config, dynamic per-role override)` — invariant-change

S002 WRITES this dynamic per-role override path (a TierName) via the array-segment form — it must preserve the daemon invariant that models.tasks[roleId] is a flat key whose id may contain dots (src/config/analyze.ts roleTiers parse). Writing via a dot-split string would mis-nest and silently no-op (write-path.ts). The effective-tier semantics (roleTiers[role] ?? defaultTier, clamped by coreFloor for critical roles) are the daemon's and are NOT re-implemented here — S002 only presents + writes the raw per-role tier.

**Call sites:**
- `src/config/analyze.ts`
- `src/config/write-path.ts`
- `src/config/core-floor-guard.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc8` | consumes | S002 CONSUMES the sc8 ConfigSyncEngine (owned by S001) and drives the 30 per-role enum keys through the SAME engine so the k5 truthful-apply invariant stays in one place. It requires the two additive sc8 gateway methods proposed as an HLD amendment (writeKeyPath for dot-safe segment writes + rawConfig over config.show for the current per-role value — exactly the per-role segmentation S001's contractDetails deferred to S002), plus the additive ConfigKeyEntry.segments/source fields so the engine routes per-role keys to writeKeyPath + rawConfig while global keys keep writeKey + catalog. extension.ts (sole 'vscode' importer) merges the PerRoleKeyMap into the engine's key map and the existing onDidChangeConfiguration('insrc') listener already fans every insrc.* change (incl. insrc.models.tasks.*) to applyChanges. NO scope from S001 (the global engine internals), s3 (revert/Refresh UX), or the panel track is re-designed — only sc8 is extended, additively, within its stated 'global + per-role keys' purpose. config.show + the string[] form of config.write already exist (no new daemon capability, k3). |

## Error paths

### Error cases

- **A per-role setting is edited to a value that is not a valid tier (should be impossible via the enum dropdown, but reachable by hand-editing settings.json).** (recoverable)
  - Detection: applyChanges pre-flight-validates the ChangedKey value against the per-role entry's synthetic enum ConfigOption (enumValues ['cheap','mid','core']) BEFORE any write — the same client-side guard S001 uses, because config.write does not type-validate and the daemon would warn-drop a non-TierName silently.
  - Response: writeKeyPath is NOT called; the change is reported as a rejected write via the Notifier with a client-authored reason ('must be one of: cheap, mid, core'); the snapshot is not advanced. The full toast/auto-revert UX is s3's — S002 only surfaces + does not persist the bad value.
  - User impact: The invalid tier never reaches the daemon (so the role would not silently fall back with no feedback); the user sees why it was rejected.
- **The daemon is unreachable when the per-role pull runs (activation/refresh) — config.show rejects.** (recoverable)
  - Detection: ConfigGateway.rawConfig() — wrapping rpc('config.show') — rejects with the socket error the shared ipc-client raises when the daemon is down; pullFromDaemon catches it in the same try/catch that guards the global catalog() read.
  - Response: No settings writes for the per-role keys (the native mirror keeps its last-known values); surfaced non-blocking via Notifier; never throws, so activation proceeds (k1 preserved).
  - User impact: The per-role settings show their last-synced (or default = defaultTier) values instead of live ones; a later refresh re-syncs. No data loss.
- **config.write refuses the per-role write ({ok:false}) or the daemon drops mid-write.** (recoverable)
  - Detection: ConfigGateway.writeKeyPath resolves { ok:false } (empty/invalid segment) or the rpc rejects (socket error) — sc8 inspects the ConfigWriteResult / catches the rejection, identically to the global writeKey path.
  - Response: Reported as a rejected write ('daemon refused' / 'daemon unreachable') via Notifier; the snapshot is not advanced for that role key.
  - User impact: The per-role edit is not silently accepted; the user is told the daemon rejected it (and via s3 it reverts). UI stays consistent with the daemon.
- **The declared insrc.models.tasks.<roleId> manifest keys drift from the daemon's reasoningRoleTaxonomy() role registry (a role added/renamed/removed daemon-side).** (recoverable)
  - Detection: A manifest<->taxonomy contract test asserts the declared per-role keys EXACTLY cover the 30 roles (id = 'insrc.models.tasks.' + roleId) with enum cheap/mid/core + scope:'machine' — fails at build on divergence. At RUNTIME the engine is drift-safe: a native key with no PerRoleKeyMap entry is ignored, and a raw models.tasks override with no matching role key is skipped during pull.
  - Response: Build fails on drift (caught before shipping); at runtime an unknown role key is skipped rather than mis-written, so a version-skew daemon never corrupts config via an unknown role.
  - User impact: A drifted role simply doesn't appear/apply until the manifest is regenerated from the taxonomy; no wrong write.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A roleId contains dots (e.g. 'context.assemble', 'design.alternatives.enumerate'). | The write uses the SEGMENT-ARRAY form ['models','tasks','context.assemble'] via writeKeyPath, so the daemon's setConfigAtPath writes the flat leaf roleTiers['context.assemble'] — NOT a mis-nested roleTiers.context.assemble. The pull reads raw.models?.tasks?.['context.assemble'] by the same literal key. This is the load-bearing correctness edge for S002. |
| The daemon has NO override for a role (models.tasks omits that roleId, or models.tasks is absent). | pullFromDaemon writes the role's defaultTier (from reasoningRoleTaxonomy()) into the native key — the truthful 'using the default routing' state, matching the JetBrains 'use default' first entry. |
| The user sets a role's native value equal to its defaultTier. | S002 writes models.tasks.<roleId> = that tier (an explicit override equal to the default). This is behaviourally identical to no override (effective tier = roleTiers[role] ?? defaultTier resolves the same), so it is harmless + truthful. The richer 'remove the override on Reset' affordance (deleting the key) is out of scope — config.write sets, it does not delete — and is a later/s3 refinement, flagged as an openQuestion, not built here. |
| A CRITICAL role's chosen tier is below the coreFloor (e.g. 'cheap' for a role clamped to 'mid'). | S002 WRITES the raw chosen override faithfully (truthful mirror); it does NOT re-implement the coreFloor clamp — the daemon's applyCoreFloor decides the effective tier at resolution time. S002 presents the raw per-role override, not the clamped-effective tier (displaying the clamped/effective value is an optional later enhancement, not required by ac1/ac2). |
| onDidChangeConfiguration fires for a global insrc.* key (S001) in the same event as a per-role key. | The existing listener fans BOTH to applyChanges; the merged key map routes each key by its entry (global -> writeKey/catalog, per-role -> writeKeyPath/raw). No cross-interference; each key applies independently. |

### Invariants to preserve

- The daemon's models.tasks[roleId] override is a FLAT key whose id may contain dots — S002 must write it via the array-segment form so the daemon reader (roleTiers["context.assemble"]) sees it; a dot-split string mis-nests and silently no-ops (write-path.ts). S002 does not re-implement the effective-tier / coreFloor resolution — that stays the daemon's. [[c1]]
- S001's sc8 engine + its global-key behavior stay UNCHANGED: the ConfigKeyEntry additions (segments/source) are optional and default to the S001 path, writeKey(key:string) is untouched, and the 104 existing plugin tests + never-throw non-blocking activation remain green (k1). [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test 'src/**/__tests__/*.test.ts') — the same runner S001-S006 + the S001 sc8 suites use for vscode-plugin/, driving the VS-Code-free engine + per-role key map over injected fakes (fake SettingsStore / ConfigGateway / Notifier), plus a manifest↔role-taxonomy contract test; no @types/vscode.`

### Test levels

- **unit** — Prove buildPerRoleKeyMap projects the fixed role taxonomy into correct per-role entries (segments, enum option, default = defaultTier).
  - Subjects: `buildPerRoleKeyMap() returns exactly one entry per reasoningRoleTaxonomy() role (30), each nativeKey = 'insrc.models.tasks.' + roleId, segments = ['models','tasks',roleId], option.enumValues = ['cheap','mid','core'], option.default = role.defaultTier, source = 'raw'`, `a role whose id CONTAINS DOTS (e.g. 'context.assemble') yields segments ['models','tasks','context.assemble'] (a single literal 3rd segment) — NOT a 4-element dot-split`, `the merged key map (global + per-role) resolves byNativeKey for both an S001 global key and a per-role key without collision`
- **unit** — Prove the ONE engine applies + pulls per-role keys correctly over the sc8 boundaries (segment write + raw read), reusing S001's validate/snapshot/never-throw.
  - Subjects: `applyChanges on a valid per-role change (source:'raw' entry) calls ConfigGateway.writeKeyPath(['models','tasks',roleId], tier) EXACTLY once and NOT writeKey — the dot-safe segment write`, `applyChanges rejects a per-role value outside {cheap,mid,core} without calling writeKeyPath and reports a client-authored reason via Notifier`, `applyChanges on a per-role writeKeyPath {ok:false}/reject reports a rejected write and does not advance the snapshot (retry re-writes)`, `pullFromDaemon for a source:'raw' entry reads the current value from ConfigGateway.rawConfig() at models.tasks[roleId] (by the literal dotted key) and writes it into the fake SettingsStore; an ABSENT override writes the role's defaultTier`, `pullFromDaemon on a rawConfig() rejection performs NO per-role writes and surfaces via Notifier without throwing (activation never blocked)`, `the idempotent no-op holds for per-role keys: re-applying the pulled value calls no writeKeyPath (snapshot published before writes, per the S001 pattern)`
  - Fixtures: `the existing fake SettingsStore / Notifier`, `a fake ConfigGateway extended with writeKeyPath (records segments) + rawConfig (scripted raw config incl. a models.tasks map)`, `a fixture PerRoleKeyMap over a few roles incl. a dotted-id role`
- **contract** — Lock the static per-role manifest keys to the daemon role taxonomy so they never drift.
  - Subjects: `the declared insrc.models.tasks.<roleId> keys in vscode-plugin/package.json EXACTLY cover reasoningRoleTaxonomy() (30 roles), id = 'insrc.models.tasks.' + roleId, no missing + no extra`, `each per-role key is type 'string' with enum ['cheap','mid','core'] and default = the role's defaultTier`, `EVERY per-role key carries scope:'machine' (k7)`
  - Fixtures: `a read of vscode-plugin/package.json`, `an import of reasoningRoleTaxonomy from src/config/role-taxonomy.js`
- **unit** — Seam discipline (k1/k2/k3): the per-role modules stay VS-Code-free and daemon access stays IPC-only via the added gateway methods.
  - Subjects: `the per-role key-map + engine modules import NO 'vscode'`, `the gateway's writeKeyPath/rawConfig reference ONLY config.write (string[] form) + config.show — no new IPC method, no cloud/HTTP (k3/k2)`
  - Fixtures: `a read of the config seam source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: the declared insrc.models.tasks.<roleId> keys cover all 30 roles with enum cheap/mid/core + default defaultTier — proves each role's tier is PRESENTED as an editable choice in native Settings`, `unit: pullFromDaemon writes each role's current daemon value (models.tasks override, or defaultTier when absent) into the SettingsStore — proves the shown choice REFLECTS the daemon's current assignment` |
| `ac2` | `unit: applyChanges on a valid per-role change calls writeKeyPath(['models','tasks',roleId], tier) exactly once — proves the change is applied to the daemon immediately via the dot-safe segment write`, `unit: a per-role change routes through the SAME engine validate/snapshot/never-throw path as S001 globals (invalid rejected, {ok:false} reported, idempotent no-op) — proves the identical truthful-apply behavior as other config edits` |

## Alternatives considered

### a1: Flat per-role enum keys + reuse the sc8 engine via a minimal segment/raw-read extension — **CHOSEN**

Declare one static machine-scoped enum key `insrc.models.tasks.<roleId>` per fixed role (values cheap|mid|core, default = the role's defaultTier), and drive them through the SAME S001 ConfigSyncEngine after minimally widening sc8 to (a) carry array-segment write paths and (b) read the current per-role value from config.show.

Enumerate the 30 fixed roles from reasoningRoleTaxonomy() into a static PerRoleKeyMap of ConfigKeyEntry-shaped rows: nativeKey `insrc.models.tasks.<roleId>`, the write path as literal SEGMENTS ['models','tasks',roleId] (dot-safe for dotted roleIds), and a validator/option enforcing the tier enum {cheap,mid,core} with default = role.defaultTier. These 30 keys are declared statically in package.json contributes.configuration (scope:'machine', enum), exactly like S001's global keys, and are covered by a manifest<->role-taxonomy contract test.

To drive them through the ONE sc8 ConfigSyncEngine (keeping the k5 invariant in one place), S002 makes two minimal, S001-sanctioned extensions to sc8: (1) widen ConfigKeyEntry.path and ConfigGateway.writeKey to accept `string | readonly string[]` so a dotted roleId writes via the array form through config.write (the daemon already accepts string[]); (2) add a gateway read for the current per-role value over the EXISTING config.show IPC (config.catalog.values omits dynamic models.tasks.*), so pullFromDaemon can mirror the daemon's actual override (or the role's defaultTier when unset). The engine gains a tiny per-entry 'source' notion (catalog value vs raw config.show) so global keys keep pulling from catalog and per-role keys pull from raw. Everything else (validate, write-once, idempotent no-op, snapshot, never-throw) is reused unchanged.

### a2: Flat per-role keys driven by a SEPARATE S002-owned per-role sync core

Same static per-role enum keys, but S002 builds its own per-role sync core (its own gateway + apply/pull) calling config.show/config.write directly via sc1, leaving S001's sc8 engine untouched.

Declare the same 30 static `insrc.models.tasks.<roleId>` enum keys, but instead of extending sc8, S002 introduces a parallel VS-Code-free core (e.g. createPerRoleSync) over its own thin gateway that reads config.show and writes the segment-array form of config.write. It re-implements the validate + last-synced-snapshot + never-throw + idempotent-no-op logic for the per-role key set, and extension.ts wires a second onDidChangeConfiguration path (or the same listener fanning per-role keys to this core).

**Rejected because:** Matches a1 on ac1/ac2/k3/k7 but VIOLATES the sc8 contract intent and only PARTIALLY holds k5 by duplicating the truthful-apply engine — a real drift hazard S003 would then have to consume twice. Worse than a1 for the same user outcome.

### a3: Single object-typed `insrc.models.tasks` blob setting

Declare one machine-scoped object setting whose value is the whole roleId->tier override map as JSON; sc8 pulls config.show's models.tasks into it and writes changed leaves.

A single native setting `insrc.models.tasks` of JSON-schema type 'object' holds the entire per-role override map (roleId keys -> tier values). pullFromDaemon writes the daemon's models.tasks object into that one key; applyChanges deep-diffs the edited object against the snapshot and writes each changed roleId leaf via the segment-array config.write. No per-role manifest authoring — one key covers all roles, and a new role appears automatically.

**Rejected because:** Violates ac1 by degrading per-role editing to raw JSON (no typed choice) and only partially holds sc8/k5 via a deep-diff; only ac2/k3/k7 hold. Its 'no default-ambiguity' advantage does not offset losing the native editable choice ac1 requires.

## Open questions

- Remove-override-on-Reset: when the user Resets a per-role setting (or sets it equal to defaultTier), S002 leaves an explicit models.tasks.<roleId>=defaultTier override rather than DELETING the key (config.write sets, it does not delete). Behaviourally identical to no override but not a true removal; the delete-on-reset affordance is deferred to s3 or a later refinement.
- sc8 extension confirmation: S002 adds two ADDITIVE methods to the S001-owned sc8 ConfigGateway (writeKeyPath, rawConfig) + two optional ConfigKeyEntry fields (segments, source) via a tracked sharedContract.methodAdd HLD amendment, realizing the per-role segmentation S001 explicitly deferred to S002. Confirm at approval that additively extending S001-owned sc8 is acceptable (vs an S001 back-flow).

## Resolved questions

- `q0df05a28` — Remove-override-on-Reset: when the user Resets a per-role setting (or sets it equal to defaultTier), S002 leaves an explicit models.tasks.<roleId>=defaultTier override rather than DELETING the key (config.write sets, it does not delete). Behaviourally identical to no override but not a true removal; the delete-on-reset affordance is deferred to s3 or a later refinement.
  - **resolved**: Accept explicit override (defer delete) — Behaviourally identical to no override; true key-removal via a config.write unset is a deferred s3/later follow-up. No new daemon capability (k3). User-approved. _(2026-09-22T12:08:14.801Z)_

## Citations

- **[[c1]]** `code` `src/config/role-taxonomy.ts:102 reasoningRoleTaxonomy() — 30 fixed roles (dotted ids), RoleDescriptor{id,criticality,defaultTier}; rankOf cheap<mid<core`
- **[[c2]]** `code` `src/config/write-path.ts (toConfigSegments/setConfigAtPath) — dotted models.tasks.<roleId> REQUIRES the array-segment form; a dot-split mis-nests + silently no-ops`
- **[[c3]]** `code` `src/daemon/index.ts:1314 config.show (raw config read) + :1353/:1358 config.write path:string|string[] — both existing (no new capability, k3)`
- **[[c4]]** `code` `src/config/settings-catalog.ts:83-91 — config.catalog surfaces roles/tierNames but its values OMITS dynamic models.tasks.* (CONFIG_CATALOG-only)`
- **[[c5]]** `code` `src/config/analyze.ts roleTiers parse (:361-366) + src/config/core-floor-guard.ts:107 applyCoreFloor — effective tier = roleTiers[role]??defaultTier, clamped for critical roles (daemon-side, not re-implemented)`
- **[[c6]]** `prior-artifact` `S001 LLD contractDetails — 'Per-role dotted-path segmentation (models.tasks.<roleId>) is an s2 concern handled when s2 consumes sc8'; extends vscode-plugin/src/config/{types,key-map,sync-engine,gateway}.ts`
- **[[c7]]** `code` `jetbrains-plugin PerRoleSection.kt — parity: per-role tier chooser, use-default first entry, segment-array writeSetting`
