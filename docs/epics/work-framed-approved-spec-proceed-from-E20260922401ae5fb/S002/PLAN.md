<!-- insrc:artifact PLAN-401ae5fb7b8537cc-s2 -->

# Plan: E20260922401ae5fb:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790077893433-yhnei5`
**LLD effective hash:** `790f3d6f5efd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Additively extend the sc8 boundary: ConfigKeyEntry.segments/source + ConfigGateway.writeKeyPath/rawConfig | S | — | unit: gateway writeKeyPath calls config.write with the array path form + rawConfig calls config.show (over a fake IpcClient recording method+params) | [[c3]] [[c6]] |
| 2 | **`t2`** Route per-role keys in the ConfigSyncEngine (segment write + raw read) | M | `t1` | unit: applyChanges on a valid per-role change calls writeKeyPath(['models','tasks',roleId], tier) exactly once and NOT writeKey; unit: applyChanges rejects an invalid per-role tier without calling writeKeyPath and reports a reason; {ok:false}/reject does not advance the snapshot; unit: pullFromDaemon reads rawConfig() at models.tasks[roleId] and writes it (defaultTier when absent); a rawConfig() rejection writes nothing + notifies without throwing; unit: per-role idempotent no-op: re-applying the pulled value calls no writeKeyPath (snapshot published before writes) | [[c6]] |
| 3 | **`t3`** Build the static PerRoleKeyMap from reasoningRoleTaxonomy() | S | `t1` | unit: buildPerRoleKeyMap returns 30 entries with correct nativeKey/segments/enum/default/source; a dotted roleId gives a single literal 3rd segment; unit: the merged (global + per-role) key map resolves both a global and a per-role key by nativeKey without collision | [[c1]] [[c6]] |
| 4 | **`t4`** Generate the 30 per-role manifest keys in package.json from the taxonomy | S | — | unit: manifest-taxonomy contract: declared insrc.models.tasks.<roleId> keys exactly cover the 30 roles with enum cheap/mid/core + default=defaultTier + scope:'machine' | [[c1]] |
| 5 | **`t5`** Merge the PerRoleKeyMap into the engine in extension.ts | S | `t2`, `t3`, `t4` | unit: source-scan: extension.ts constructs the engine over the merged global+per-role key map and adds no new listener/command; the ConfigGateway binding exposes writeKeyPath/rawConfig | [[c6]] |
| 6 | **`t6`** Add the per-role engine unit suite, the manifest<->taxonomy contract test, and the seam scans | M | `t2`, `t3`, `t4`, `t5` | unit: the full S002 per-role suite (key-map + engine + manifest-taxonomy contract + seam scans) passes green under tsx --test alongside S001; unit: seam source-scan: per-role key-map + engine import no 'vscode'; the gateway references only config.show + config.write (k1/k2/k3) | [[c1]] [[c6]] |

### E20260922401ae5fb:S002:T001 — Additively extend the sc8 boundary: ConfigKeyEntry.segments/source + ConfigGateway.writeKeyPath/rawConfig

In vscode-plugin/src/config/types.ts add two OPTIONAL ConfigKeyEntry fields (segments?: readonly string[]; source?: 'catalog' | 'raw') and two ConfigGateway methods (writeKeyPath(segments, value): Promise<ConfigWriteResult>; rawConfig(): Promise<Record<string,unknown>>). In gateway.ts implement them on createDaemonConfigGateway: writeKeyPath wraps rpc('config.write', {path: segments, value}) widening {ok:boolean} to a reason-carrying ConfigWriteResult; rawConfig wraps rpc('config.show'). S001's writeKey + catalog + global entries are UNCHANGED (fields optional). Strictly additive.

**Acceptance checks:**
- ConfigKeyEntry gains optional segments?/source? and ConfigGateway gains writeKeyPath + rawConfig; S001's writeKey(key:string)/catalog signatures are unchanged and tsc compiles
- createDaemonConfigGateway.writeKeyPath calls config.write with the ARRAY path form and rawConfig calls config.show — no new IPC method
- the existing 104 S001 plugin tests still pass (global path behavior untouched, k1)

### E20260922401ae5fb:S002:T002 — Route per-role keys in the ConfigSyncEngine (segment write + raw read)

In vscode-plugin/src/config/sync-engine.ts add a per-entry branch to the existing engine: applyChanges writes via ConfigGateway.writeKeyPath(entry.segments, value) when entry.segments is present (else the S001 writeKey(path) path); pullFromDaemon reads a source:'raw' entry's current value from ConfigGateway.rawConfig() at the entry's segment path (models.tasks[roleId]), falling back to option.default (the role defaultTier) when absent, else the S001 catalog path. Reuses validate/snapshot-before-write/never-throw/idempotent-no-op unchanged.

**Acceptance checks:**
- applyChanges routes a segments-bearing entry to writeKeyPath (exactly once) and a plain entry to writeKey — no cross-routing
- pullFromDaemon for a source:'raw' entry reads rawConfig() at models.tasks[roleId] (literal dotted key) and writes it (or option.default when absent) into the SettingsStore; a rawConfig() rejection writes nothing + notifies without throwing
- the validate + snapshot-published-before-writes + idempotent-no-op behaviors are shared with the global path (no duplication)

### E20260922401ae5fb:S002:T003 — Build the static PerRoleKeyMap from reasoningRoleTaxonomy()

Add a pure VS-Code-free builder (in vscode-plugin/src/config/key-map.ts or a sibling) that maps each of the 30 reasoningRoleTaxonomy() roles to a ConfigKeyEntry: nativeKey `insrc.models.tasks.<roleId>`, segments ['models','tasks',roleId], source:'raw', option = synthetic enum ConfigOption {type:'enum', enumValues:['cheap','mid','core'], default: role.defaultTier, group:'Models — per-role tiers'}. Expose a merged key map (global CONFIG_KEY_MAP + per-role) with collision-free byNativeKey/byPath.

**Acceptance checks:**
- buildPerRoleKeyMap() returns exactly one entry per taxonomy role (30), each with the right nativeKey/segments/enum/default/source
- a dotted roleId yields segments with the roleId as a SINGLE literal 3rd element (not a dot-split)
- the merged key map resolves both a global and a per-role key by nativeKey without collision

### E20260922401ae5fb:S002:T004 — Generate the 30 per-role manifest keys in package.json from the taxonomy

Add a machine-scoped native ENUM setting per role to vscode-plugin/package.json contributes.configuration: id `insrc.models.tasks.` + roleId, type 'string' + enum ['cheap','mid','core'], default = role.defaultTier, markdownDescription (role id + criticality), scope:'machine' — GENERATED from reasoningRoleTaxonomy() (as S001 generated its 31 keys), in a new 'Models — per-role tiers' section alongside S001's sections. The existing 31 global keys + 7 commands stay intact.

**Acceptance checks:**
- package.json declares exactly the 30 per-role `insrc.models.tasks.<roleId>` keys, each type 'string' + enum cheap/mid/core + default = the role's defaultTier + scope:'machine'
- the 31 S001 global keys and the 7 commands remain unchanged; package.json is valid JSON

### E20260922401ae5fb:S002:T005 — Merge the PerRoleKeyMap into the engine in extension.ts

In vscode-plugin/src/extension.ts pass the MERGED key map (global CONFIG_KEY_MAP + buildPerRoleKeyMap()) to createConfigSyncEngine so the ONE engine drives both. The existing onDidChangeConfiguration('insrc') listener + activation pull already iterate the merged map (they filter insrc.* and per-key over the map), so no new listener/command is added. The ConfigGateway bound here now also exposes writeKeyPath/rawConfig from t1.

**Acceptance checks:**
- extension.ts constructs the engine over the merged (global + per-role) key map; the existing listener + activation pull cover the per-role keys with no new listener/command
- activation still never throws/blocks and the S001 global behavior + status bar + 7 commands are unchanged (k1)

### E20260922401ae5fb:S002:T006 — Add the per-role engine unit suite, the manifest<->taxonomy contract test, and the seam scans

New node:test (tsx --test) coverage: (a) buildPerRoleKeyMap unit tests (30 entries, dotted-id segments, merged-map no-collision); (b) engine per-role unit tests over the fakes (writeKeyPath-once, invalid-tier reject, {ok:false}/reject no-advance, rawConfig pull incl. default-for-absent, rawConfig-reject no-op, idempotent no-op); (c) a manifest<->reasoningRoleTaxonomy contract test (30 keys, enum, default=defaultTier, scope:'machine'); (d) seam source-scans (per-role modules import no 'vscode'; gateway references only config.show + config.write). Extend the S001 fakes with writeKeyPath/rawConfig.

**Acceptance checks:**
- the per-role unit + contract + seam suites pass under tsx --test; the fake ConfigGateway records writeKeyPath segments + serves a scripted rawConfig
- the contract test fails on any manifest<->taxonomy drift (missing/extra role key, wrong enum/default, non-machine scope) and passes on the generated manifest
- the full vscode-plugin suite (S001 + S002) is green and tsc is clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildPerRoleKeyMap() returns exactly one entry per reasoningRoleTaxonomy() role (30), each nativeKey = 'insrc.models.tasks.' + roleId, segments = ['models','tasks',roleId], option.enumValues = ['cheap','mid','core'], option.default = role.defaultTier, source = 'raw' | `t3`, `t6` |
| a role whose id CONTAINS DOTS (e.g. 'context.assemble') yields segments ['models','tasks','context.assemble'] (a single literal 3rd segment) — NOT a 4-element dot-split | `t3`, `t6` |
| the merged key map (global + per-role) resolves byNativeKey for both an S001 global key and a per-role key without collision | `t3`, `t6` |
| applyChanges on a valid per-role change (source:'raw' entry) calls ConfigGateway.writeKeyPath(['models','tasks',roleId], tier) EXACTLY once and NOT writeKey — the dot-safe segment write | `t2`, `t6` |
| applyChanges rejects a per-role value outside {cheap,mid,core} without calling writeKeyPath and reports a client-authored reason via Notifier | `t2`, `t6` |
| applyChanges on a per-role writeKeyPath {ok:false}/reject reports a rejected write and does not advance the snapshot (retry re-writes) | `t2`, `t6` |
| pullFromDaemon for a source:'raw' entry reads the current value from ConfigGateway.rawConfig() at models.tasks[roleId] (by the literal dotted key) and writes it into the fake SettingsStore; an ABSENT override writes the role's defaultTier | `t2`, `t6` |
| pullFromDaemon on a rawConfig() rejection performs NO per-role writes and surfaces via Notifier without throwing (activation never blocked) | `t2`, `t6` |
| the idempotent no-op holds for per-role keys: re-applying the pulled value calls no writeKeyPath (snapshot published before writes, per the S001 pattern) | `t2`, `t6` |
| the declared insrc.models.tasks.<roleId> keys in vscode-plugin/package.json EXACTLY cover reasoningRoleTaxonomy() (30 roles), id = 'insrc.models.tasks.' + roleId, no missing + no extra | `t4`, `t6` |
| each per-role key is type 'string' with enum ['cheap','mid','core'] and default = the role's defaultTier | `t4`, `t6` |
| EVERY per-role key carries scope:'machine' (k7) | `t4`, `t6` |
| the per-role key-map + engine modules import NO 'vscode' | `t6` |
| the gateway's writeKeyPath/rawConfig reference ONLY config.write (string[] form) + config.show — no new IPC method, no cloud/HTTP (k3/k2) | `t1`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 — reasoningRoleTaxonomy() 30 fixed roles (src/config/role-taxonomy.ts:102) projected into the 30 per-role manifest keys (insrc.models.tasks.<roleId>, enum cheap/mid/core, default=defaultTier) + the PerRoleKeyMap`
- **[[c3]]** `code` `src/daemon/index.ts:1314 config.show + :1353/:1358 config.write path:string|string[] — the existing IPC sc8's added writeKeyPath/rawConfig wrap (no new daemon capability, k3)`
- **[[c6]]** `prior-artifact` `LLD s2 interactionWithShared — consumes+additively-extends the S001-owned sc8 modules (vscode-plugin/src/config/{types,gateway,sync-engine,key-map}.ts + extension.ts): the per-role segmentation S001 deferred, driving the engine's per-entry routing + merged key map`
