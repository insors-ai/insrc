<!-- insrc:artifact PLAN-b5f333f8d7ba421b-s2 -->

# Plan: E20260919b5f333f8:S002

**Epic:** `expose-all-daemon-config-settings-via`
**LLD run:** `wf-1789847310051-dhdmrw`
**LLD effective hash:** `ee39a9f5fd11...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add settingsCatalog gateway method + DTOs + parseCatalog | M | — | unit: SettingsCatalogGatewayTest: ok+data -> Loaded with options/groups/roles/tierNames parsed and values folded into currentValue/isSet (over a FakeDaemonRpc); unit: SettingsCatalogGatewayTest: !ok/error/DaemonUnavailable/malformed(options not a list) -> Unavailable, no throw; unit: SettingsCatalogGatewayTest: over the real UnixSocketDaemonRpc.parse, {result:{payload}} -> Loaded and {result:{error}} -> Unavailable (framing) | [[c1]] [[c4]] |
| 2 | **`t2`** Fix the gateway-extension compile break (delegate + 4 test doubles) | S | `t1` | unit: the full ./gradlew test suite compiles + passes green (the delegate + 4 test-double overrides are proven by the test source set building) | [[c4]] |
| 3 | **`t3`** Add the pure sc3 view types: SettingsGroupModel + SettingsView + SettingsSection | M | `t1` | unit: SettingsViewTest: groupsOf orders by payload.groups, every option in exactly one model, out-of-groups -> trailing bucket, empty group -> no model; unit: SettingsViewTest: displayValue shows the value when isSet and the default with an explicit marker when unset; unit: SettingsViewTest: an unrecognized type still yields a display string (text fallback), never dropped/thrown | [[c3]] |
| 4 | **`t4`** Add InsrcSettingsConfigurable (read-only page) + applicationConfigurable registration | M | `t1`, `t3` | unit: InsrcSettingsConfigurableTest (source-scan): plugin.xml registers <applicationConfigurable> pointing at InsrcSettingsConfigurable; unit: InsrcSettingsConfigurableTest (source-scan): read-only — isModified() returns false, apply()/reset() no-ops, no config.write/writeSetting call in the class | [[c2]] [[c3]] |

### E20260919b5f333f8:S002:T001 — Add settingsCatalog gateway method + DTOs + parseCatalog

In DaemonGateway.kt add `fun settingsCatalog(): SettingsCatalogResult` to the interface, the sealed SettingsCatalogResult (Loaded|Unavailable) + data-class DTOs (SettingsCatalogDto, ConfigOptionDto, RoleDto), a parseCatalog helper (parse options/groups/roles/tierNames from the reply map; fold payload.values into each ConfigOptionDto.currentValue/isSet), and implement settingsCatalog() in DaemonGatewayImpl following the pendingArtifacts/artifactReviewView idiom (rpc.call config.catalog; !ok||error -> Unavailable; DaemonUnavailableException + RuntimeException -> Unavailable; else Loaded).

**Acceptance checks:**
- DaemonGatewayImpl.settingsCatalog() returns Loaded(SettingsCatalogDto) on an ok reply with options/groups/roles/tierNames parsed and values folded into currentValue/isSet.
- !ok||error, DaemonUnavailableException, and a malformed reply (e.g. options not a list) all map to Unavailable(reason) — never a blank Loaded, never a throw.
- The call issues method 'config.catalog' with no params over the existing DaemonRpc transport.

### E20260919b5f333f8:S002:T002 — Fix the gateway-extension compile break (delegate + 4 test doubles)

Add the settingsCatalog() delegate to DaemonGatewayService (forwarding to the impl) and a trivial `override fun settingsCatalog()` stub returning a canned Unavailable/Loaded to the four DaemonGateway test doubles (DaemonLifecycleServiceTest, OnboardingCleanupIntegrationTest, OnboardingWiringTest, OnboardingLifecycleTest), all in this change so the module compiles.

**Acceptance checks:**
- DaemonGatewayService exposes settingsCatalog() delegating to the impl.
- All four test doubles override settingsCatalog(); `./gradlew test` compiles the test source set green (no other double left unimplemented).

### E20260919b5f333f8:S002:T003 — Add the pure sc3 view types: SettingsGroupModel + SettingsView + SettingsSection

In a new plugin settings package add SettingsGroupModel(group, options), the pure `object SettingsView { groupsOf(catalog): List<SettingsGroupModel>; displayValue(option): String }`, and the SettingsSection extension interface. groupsOf buckets options into SettingsGroupModels in payload.groups order (an option whose group is absent from groups[] goes into a trailing bucket; an empty group yields no model; every option appears exactly once). displayValue returns the current value when isSet, else the default with an explicit default marker.

**Acceptance checks:**
- SettingsView.groupsOf orders groups by payload.groups, drops no option, emits no empty-group model, and trailing-buckets an out-of-groups option.
- SettingsView.displayValue shows the actual value when isSet and the default with an explicit default marker when unset.
- SettingsView is pure — no Swing/IO imports; SettingsSection is declared for downstream override sections.

### E20260919b5f333f8:S002:T004 — Add InsrcSettingsConfigurable (read-only page) + applicationConfigurable registration

Add InsrcSettingsConfigurable : Configurable that obtains the gateway via service<DaemonGatewayService>(), calls settingsCatalog() off the EDT and marshals onto the EDT, and renders: Loaded -> collapsible group panels (one per SettingsView.groupsOf model) of read-only per-type display rows (chooser/toggle/number/text shown read-only; unknown type -> text fallback) with value/default/desc; Unavailable -> a distinct placeholder carrying the reason that re-reads on reopen. Read-only: isModified()=false, apply()/reset() no-ops, no config.write. Register it via a new <applicationConfigurable> entry in plugin.xml beside the toolWindow (displayName under Tools ▸ insrc).

**Acceptance checks:**
- Opening the page renders collapsible group panels with each setting's current value + default + description (Loaded); a daemon-unavailable read shows the distinct placeholder and re-reads on reopen.
- The Configurable never writes config.json / calls config.write and never triggers a reload; isModified()=false and apply()/reset() are no-ops.
- plugin.xml registers an <applicationConfigurable> pointing at InsrcSettingsConfigurable; the plugin builds (./gradlew buildPlugin) and the descriptor validates.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| SettingsView.groupsOf buckets options into SettingsGroupModels in payload.groups order; every option appears in exactly one group; an option whose group is absent from groups[] falls into a trailing bucket (never dropped); an empty group yields no model | `t3` |
| SettingsView.displayValue returns the current value when isSet and the default with an explicit default-marker when unset (ac2) | `t3` |
| an unrecognized ConfigOptionDto.type degrades to a read-only text display, not dropped/thrown | `t3` |
| settingsCatalog() over a fake DaemonRpc: ok+data -> Loaded(SettingsCatalogDto) with options/groups/roles/tierNames parsed and values folded into currentValue/isSet | `t1` |
| !ok or error!=null -> Unavailable(reason); DaemonUnavailableException -> Unavailable; a malformed reply (options not a list) -> Unavailable (no throw) | `t1` |
| over the REAL UnixSocketDaemonRpc.parse: a {result:{...payload}} reply -> Loaded; a {result:{error}} reply -> Unavailable (result.error framing) | `t1` |
| isSet is true iff the values map contained the path; currentValue is that value | `t1` |
| plugin.xml registers an <applicationConfigurable> pointing at InsrcSettingsConfigurable | `t4` |
| InsrcSettingsConfigurable is read-only: isModified() returns false and apply()/reset() are no-ops (no gateway write / config.write call) | `t4` |
| the DaemonGatewayService delegate + all four test doubles implement settingsCatalog() (compile-green is itself the proof) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api settingsCatalog + SettingsCatalogDto/ConfigOptionDto/RoleDto (sc1 gateway consumption; jetbrains-plugin DaemonGateway.kt)`
- **[[c2]]** `prior-artifact` `LLD s2 invariantsToPreserve: read-only page (no config.write, no reload; k5)`
- **[[c3]]** `prior-artifact` `LLD s2 contractDetails.api SettingsView/SettingsGroupModel/SettingsSection/InsrcSettingsConfigurable + applicationConfigurable registration (sc3)`
- **[[c4]]** `prior-artifact` `LLD s2 migration: DaemonGateway interface extension breaks impl+DaemonGatewayService delegate+4 test doubles (compile-break)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T20:26:58.192Z

_No load-bearing premises were extracted._
