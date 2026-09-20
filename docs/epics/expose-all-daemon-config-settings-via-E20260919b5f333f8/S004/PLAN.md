<!-- insrc:artifact PLAN-b5f333f8d7ba421b-s4 -->

# Plan: E20260920b5f333f8:S004

**Epic:** `expose-all-daemon-config-settings-via`
**LLD run:** `wf-1789885744362-nsth05`
**LLD effective hash:** `ee39a9f5fd11...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the config.show-backed perRoleOverrides gateway read | M | — | unit: perRoleOverrides Loaded(map) from data.models.tasks; missing/non-map -> Loaded empty; non-string skipped; unit: perRoleOverrides DaemonUnavailable/RuntimeException -> Unavailable; unit: WireRpc real UnixSocketDaemonRpc.parse: {result:{models:{tasks:{...}}}} -> Loaded | [[c1]] [[c2]] |
| 2 | **`t2`** Add the pure PerRoleOverridesModel (rows, override intent, dirty, segment mapping) | M | — | unit: rows(): override shows its value, absent shows defaultTier (ac1); unit: dirty semantics: same-tier not dirty; remove-of-unset no-op; default-tier is an explicit override; unit: collectWrites: Set at listOf('models','tasks',roleId) / Clear; a DOTTED roleId stays ONE segment (ac2/ac3, k4); unit: per-key isolation: one changed role -> exactly one PendingWrite; unit: revert()/onSaved(roleId) | [[c3]] |
| 3 | **`t3`** Add PerRoleSection + activate the sc3 host glue in InsrcSettingsConfigurable | M | `t1`, `t2` | unit: source-scan: InsrcSettingsConfigurable renders registered SettingsSections + fans isModified/apply/reset; section writes ride the off-EDT apply | [[c4]] |
| 4 | **`t4`** Configurable source-scan tests + final green sweep | S | `t1`, `t2`, `t3` | unit: source-scan: PerRoleSection applies via gateway.writeSetting/clearSetting with listOf('models','tasks',...) not a raw config.write/dotted string; unit: source-scan: no hardcoded role/tier literal in the section (built from catalog.roles) | [[c5]] [[c6]] |

### E20260920b5f333f8:S004:T001 — Add the config.show-backed perRoleOverrides gateway read

In DaemonGateway.kt add PerRoleOverridesResult (sealed Loaded(overrides: Map<String,String>) | Unavailable(reason: String)), add perRoleOverrides(): PerRoleOverridesResult to the interface, implement it in DaemonGatewayImpl over rpc.call(METHOD_CONFIG_SHOW='config.show') — parse data.models.tasks as? Map, keep only string-valued entries, missing/non-map -> Loaded(empty), catch DaemonUnavailableException/RuntimeException -> Unavailable — + a METHOD_CONFIG_SHOW const; add the DaemonGatewayService delegate override; add a perRoleOverrides stub to the 4 test doubles (DaemonLifecycleServiceTest throws AssertionError, the 3 Onboarding tests return Unavailable('not used')). Land the gateway Fake + WireRpc real-parse tests with this task.

**Acceptance checks:**
- DaemonGateway declares perRoleOverrides(): PerRoleOverridesResult; PerRoleOverridesResult is a sealed interface Loaded(Map<String,String>)|Unavailable(String).
- DaemonGatewayImpl.perRoleOverrides calls config.show and parses data.models.tasks into a Map<String,String> (string entries only); missing/non-map -> Loaded(empty); DaemonUnavailable/RuntimeException -> Unavailable (never throws).
- DaemonGatewayService delegates it; all 4 test doubles compile with the new stub; ./gradlew test green.
- A WireRpc test over the real UnixSocketDaemonRpc.parse maps a config.show reply {result:{models:{tasks:{...}}}} to Loaded with the map.

### E20260920b5f333f8:S004:T002 — Add the pure PerRoleOverridesModel (rows, override intent, dirty, segment mapping)

In the settings package add PerRoleRow {roleId, effectiveTier, isOverride} and the pure class PerRoleOverridesModel(roles: List<RoleDto>, tierNames: List<String>, current: Map<String,String>) with a private RoleState per role, reusing PendingWrite/WriteOp from S003. Implement rows() (override-vs-default per role), setOverride/removeOverride/revert/isModified/onSaved, and collectWrites() -> only changed roles as PendingWrite(listOf('models','tasks',roleId), Set(tier)) / (..., Clear) with roleId as ONE literal segment (dotted-key safety) + per-key isolation; same-tier not dirty; remove-of-unset a no-op. No Swing, no existing-symbol changes. Land PerRoleOverridesModelTest with this task.

**Acceptance checks:**
- PerRoleOverridesModel + PerRoleRow exist in settings/ and are pure (no Swing/IDE imports); reuse PendingWrite/WriteOp.
- rows() lists each role with effectiveTier + isOverride (override shows its value, absent shows defaultTier).
- collectWrites emits Set/Clear PendingWrites at listOf('models','tasks',roleId) with a DOTTED roleId as one segment; only changed roles; same-tier not dirty; remove-of-unset a no-op.
- revert() restores current; onSaved(roleId) advances that role's baseline; per-key isolation (one changed role -> one PendingWrite).

### E20260920b5f333f8:S004:T003 — Add PerRoleSection + activate the sc3 host glue in InsrcSettingsConfigurable

Add PerRoleSection : SettingsSection (a thin Swing shell of role rows — tier chooser + a use-default/remove affordance — bound to the PerRoleOverridesModel, applying via sc2). Add the minimal host glue in InsrcSettingsConfigurable: build a list of SettingsSection on Loaded (the per-role section, from the catalog's roles/tierNames + the perRoleOverrides read), render each section's component() below the global groups, and fan isModified()/reset() to them plus run each section's writes in the SAME off-EDT ProgressManager apply block (onSaved back on the EDT, ConfigurationException on any not-Saved). Unavailable page installs no section. Per the s3 critique, during build land the host-glue change first and re-run ./gradlew test before adding the PerRoleSection rows, so a regression in the shared apply path is caught early. Depends on t1 (gateway) + t2 (model).

**Acceptance checks:**
- PerRoleSection : SettingsSection renders role rows and applies changes via gateway.writeSetting/clearSetting (segment list), advancing onSaved on Saved.
- InsrcSettingsConfigurable renders registered SettingsSections below the global groups and fans isModified/apply/reset to them.
- Section writes ride the off-EDT ProgressManager apply; a not-Saved section write throws ConfigurationException preserving the pending intent; per-key isolation across roles.
- An Unavailable catalog/overrides page installs no section; no hardcoded role/tier literal (built from catalog.roles).

### E20260920b5f333f8:S004:T004 — Configurable source-scan tests + final green sweep

Extend InsrcSettingsConfigurableTest source-scan: the host renders registered SettingsSections + fans apply/isModified/reset; PerRoleSection applies via gateway.writeSetting/clearSetting with a segment list (not a raw config.write / dotted string). Confirm the PerRoleOverridesModelTest (t2) and gateway perRoleOverrides tests (t1) are present, then run the full JDK21 ./gradlew test green sweep. (Per the plan, the pure-model + gateway tests land with t2/t1; t4 adds the shell source-scan + the consolidated sweep.)

**Acceptance checks:**
- InsrcSettingsConfigurable source-scan asserts section rendering + apply/isModified/reset fan-out + PerRoleSection gateway (segment-list) usage.
- The PerRoleOverridesModelTest (t2) and gateway perRoleOverrides + WireRpc tests (t1) are present and passing.
- ./gradlew test passes on JDK21 with all new tests (full sweep green).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| rows(): override shows its value, absent shows defaultTier (ac1) | `t2` |
| dirty semantics: same-tier not dirty; remove-of-unset no-op; default-tier is an explicit override | `t2` |
| collectWrites: Set at listOf('models','tasks',roleId) / Clear; a DOTTED roleId stays ONE segment (ac2/ac3, k4) | `t2` |
| per-key isolation: one changed role -> exactly one PendingWrite | `t2` |
| revert()/onSaved(roleId) | `t2` |
| Loaded(map) from data.models.tasks; missing/non-map -> Loaded empty; non-string skipped | `t1` |
| DaemonUnavailable/RuntimeException -> Unavailable | `t1` |
| WireRpc over real UnixSocketDaemonRpc.parse: {result:{models:{tasks:{...}}}} -> Loaded (config.show returns the object directly) | `t1` |
| PerRoleSection applies via gateway.writeSetting/clearSetting with listOf('models','tasks',...) not a raw config.write/dotted string | `t4` |
| InsrcSettingsConfigurable renders registered SettingsSections + fans isModified/apply/reset; section writes ride the off-EDT apply | `t3`, `t4` |
| no hardcoded role/tier literal in the section (built from catalog.roles) | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails DaemonGateway.perRoleOverrides (config.show read)` — "perRoleOverrides(): PerRoleOverridesResult over the existing config.show IPC; parses data.models.tasks -> Map<String,String>; missing/non-map -> Loaded empty; DaemonUnavailable/RuntimeException -> Una"
- **[[c2]]** `prior-artifact` `LLD s4 dataModelChanges PerRoleOverridesResult` — "New sealed interface Loaded(Map<String,String>)|Unavailable(String); two-state so an unreachable daemon is distinct from a legitimately-empty override map."
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails PerRoleOverridesModel + dataModelChanges PerRoleRow/RoleState` — "Pure PerRoleOverridesModel(roles, tierNames, current): rows override-vs-default, setOverride/removeOverride/revert/isModified/onSaved, collectWrites -> PendingWrite(listOf('models','tasks',roleId), Se"
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails PerRoleSection + InsrcSettingsConfigurable.apply (host glue)` — "PerRoleSection : SettingsSection applying via sc2 + minimal host glue: render registered sections below the groups, fan isModified/apply(off-EDT)/reset; not-Saved -> ConfigurationException preserving "
- **[[c5]]** `prior-artifact` `LLD s4 testStrategy (test levels + acceptance mapping)` — "Unit: PerRoleOverridesModel logic, gateway perRoleOverrides + WireRpc real-parse, Configurable source-scan; ac1/ac2/ac3 mapped."
- **[[c6]]** `prior-artifact` `LLD s4 testStrategy.testFramework` — "JUnit5 (org.junit.jupiter) on JDK21 via ./gradlew test; source-scan tests read the Kotlin source; no BasePlatformTestCase, no daemon/TS test."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T06:49:03.135Z

_No load-bearing premises were extracted._
