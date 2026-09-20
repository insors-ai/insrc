<!-- insrc:artifact LLD-b5f333f8d7ba421b-s2 -->

# LLD: E20260919b5f333f8:S002

**Epic:** `expose-all-daemon-config-settings-via`
**HLD base run:** `wf-1789841045868-kib3gd`
**HLD effective hash:** `ee39a9f5fd11...`

## HLD context

**Framework:** A daemon-owned, self-describing settings contract feeds a native JetBrains Settings page that renders whatever the daemon reports. The daemon's single-definition catalog is enriched with two structured fields (allowed fixed values and a group label) and, together with the recognized role taxonomy and tier names, is exposed over ONE new read-only IPC. The plugin adds config gateway methods behind the established sealed three-state result pattern and a native applicationConfigurable that builds a grouped, collapsible Swing form purely from the daemon's description — hardcoding no setting, group, role, or tier. Reads use the new catalog IPC plus the existing value read; writes reuse the existing segment-aware write. The plugin owns no settings semantics; the daemon stays the single source of truth.
**Rollout phase:** Phase B — Settings page shell (read-only, grouped, collapsible)
**Owns:** `sc3` (Settings page framework (Configurable host + grouped collapsible rendering + type→control mapping))
**Consumes:** `sc1` (Self-describing settings catalog (enriched ConfigOption + role taxonomy) over config.catalog, and its plugin read surface)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Daemon-side: the enriched ConfigOption + config.catalog assembly. Consumed only via the sc1 payload shape. — owns `sc1`
- `s3`: Per-type edit controls, validation, dirty/apply/reset, write-rejected surfacing (owns the write surface sc2). — owns `sc2`
- `s4`: Per-role overrides sub-section (models.tasks.<roleId>).
- `s5`: Per-repo overrides sub-section (models.byRepo.<repoPath>.*).

## Contract details

**Surface level:** internal-shared

### `DaemonGateway.settingsCatalog`

```typescript
fun settingsCatalog(): SettingsCatalogResult
```

**Returns:** `SettingsCatalogResult` — Loaded(SettingsCatalogDto) on a successful config.catalog reply; Unavailable(reason) on a framed error (!ok || error != null), a DaemonUnavailableException, or any RuntimeException transport fault. No params — config.catalog is global.

**Errors:**
- `SettingsCatalogResult.Unavailable` when !r.ok || r.error != null (framed error), DaemonUnavailableException (socket down), or a malformed-reply RuntimeException — never a blank Loaded.

**Preconditions:**
- Added to interface DaemonGateway; implemented in DaemonGatewayImpl; delegated by DaemonGatewayService; stubbed in the 4 test doubles — all in the same task (compile break).

**Postconditions:**
- Loaded carries a SettingsCatalogDto parsed from r.data (options/groups/roles/tierNames/values); config unchanged; goes over the existing UnixSocketDaemonRpc transport (k3).

### `SettingsCatalogResult`

```typescript
sealed interface SettingsCatalogResult { data class Loaded(val catalog: SettingsCatalogDto); data class Unavailable(val reason: String) }
```

**Returns:** `sealed interface` — The read result mirroring ArtifactContentResult (Loaded distinct from Unavailable so the page never blanks on error — ac3).

**Postconditions:**
- Loaded is only produced on ok && error==null.

### `SettingsCatalogDto`

```typescript
data class SettingsCatalogDto(val groups: List<String>, val options: List<ConfigOptionDto>, val roles: List<RoleDto>, val tierNames: List<String>)
```

**Returns:** `data class` — The plugin mirror of S001's SettingsCatalogPayload; parsed from the config.catalog reply map (values folded into each ConfigOptionDto.currentValue/isSet).

**Postconditions:**
- groups/options/roles/tierNames come verbatim from the daemon payload — nothing hardcoded (lc1).

### `ConfigOptionDto`

```typescript
data class ConfigOptionDto(val path: String, val type: String, val default: Any?, val desc: String, val enumValues: List<String>?, val group: String, val currentValue: Any?, val isSet: Boolean)
```

**Returns:** `data class` — One enriched catalog row + its resolved current value; isSet=true iff the payload's values map contained this path, else using default.

**Postconditions:**
- isSet derived from presence of path in payload.values; currentValue is that value when set.

### `RoleDto`

```typescript
data class RoleDto(val id: String, val defaultTier: String)
```

**Returns:** `data class` — One recognized role + default tier from payload.roles (rendered by S004; carried through for the shared DTO).

### `SettingsGroupModel`

```typescript
data class SettingsGroupModel(val group: String, val options: List<ConfigOptionDto>)
```

**Returns:** `data class` — sc3 view-model: the options belonging to one group, in catalog order.

### `SettingsView`

```typescript
object SettingsView { fun groupsOf(catalog: SettingsCatalogDto): List<SettingsGroupModel>; fun displayValue(option: ConfigOptionDto): String }
```

**Returns:** `object (pure)` — Pure sc3 view logic. groupsOf buckets options into SettingsGroupModels in payload.groups order (an option whose group is not in groups[] falls into a trailing bucket, never dropped; an empty group yields no panel). displayValue returns the current value when isSet, else the default with an explicit default marker (ac2).

**Preconditions:**
- Pure: no Swing, no IO; unit-tested directly.

**Postconditions:**
- Every option appears in exactly one SettingsGroupModel; no option dropped.

### `SettingsSection`

```typescript
interface SettingsSection { val title: String; fun component(): JComponent; fun isModified(): Boolean; fun apply(); fun reset() }
```

**Returns:** `interface` — The sc3 extension seam where the per-role (s4) and per-repo (s5) override sub-sections plug in. Declared by S002; no override section registered here.

**Postconditions:**
- Downstream stories add sections without modifying InsrcSettingsConfigurable's core.

### `InsrcSettingsConfigurable`

```typescript
class InsrcSettingsConfigurable : Configurable { getDisplayName(); createComponent(): JComponent?; isModified(): Boolean; apply(); reset(); disposeUIResources() }
```

**Returns:** `Configurable` — The native Settings page (registered via <applicationConfigurable> under Tools ▸ insrc). createComponent() calls settingsCatalog() off the EDT, marshals onto the EDT, and renders Loaded ⇒ collapsible group panels of read-only per-type display rows (value/default/desc); Unavailable ⇒ a clear placeholder that re-reads on reopen. Read-only: isModified()=false, apply()/reset() no-ops.

**Preconditions:**
- Registered in plugin.xml <extensions> as <applicationConfigurable> beside the existing toolWindow.

**Postconditions:**
- Renders whatever the daemon described (lc1); no config write, no reload (k5).

## Data model changes

### `SettingsCatalogResult / SettingsCatalogDto / ConfigOptionDto / RoleDto` — new

New Kotlin data-class DTOs + sealed result mirroring S001's config.catalog payload, parsed from the reply map by a parseCatalog helper following the parseView/parseArtifacts idiom (values folded into each ConfigOptionDto's currentValue/isSet). Consumed from sc1.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `SettingsGroupModel / SettingsView / SettingsSection` — new

New sc3 view types: SettingsGroupModel, the pure SettingsView (groupsOf + displayValue), and the SettingsSection extension interface, in a new plugin settings package.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt`

### `InsrcSettingsConfigurable + plugin.xml registration` — new

New Configurable class + a new <applicationConfigurable> extension entry in plugin.xml beside the existing toolWindow.

**Call sites:**
- `jetbrains-plugin/src/main/resources/META-INF/plugin.xml`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | S002 implements sc3: the InsrcSettingsConfigurable host + SettingsGroupModel + the pure SettingsView + the per-type read/display control mapping + the SettingsSection extension seam and the daemon-unavailable state. Renders only static-catalog groups read-only; s3/s4/s5 plug into the seam later. |
| `sc1` | consumes | S002 is the first consumer of sc1: it adds the plugin-side settingsCatalog() gateway + the Kotlin DTO mirror of S001's payload, calls config.catalog over the existing transport, and renders whatever the daemon described — never forking/hardcoding the schema (k1/lc1). |

## Error paths

### Error cases

- **config.catalog returns a framed error (repo/store fault) or the daemon socket is down when the page opens.** (recoverable)
  - Detection: settingsCatalog() sees !r.ok || r.error != null, or catches DaemonUnavailableException, and returns SettingsCatalogResult.Unavailable(reason) (the established pendingArtifacts/artifactReviewView idiom).
  - Response: InsrcSettingsConfigurable renders a distinct unavailable placeholder carrying the reason (never a blank/half form), and re-reads settingsCatalog() when the page is next opened so it recovers once the daemon is reachable.
  - User impact: The developer sees a clear 'settings unavailable — <reason>' state instead of an empty form; reopening after the daemon is up shows the real settings (ac3).
- **The config.catalog reply is malformed (missing/failed-typed fields, e.g. options not a list).** (recoverable)
  - Detection: The parseCatalog helper / gateway wraps parsing so any RuntimeException during parse is caught and mapped to Unavailable rather than propagating (defense-in-depth like the existing gateway reads).
  - Response: Return Unavailable(reason) — the page shows the unavailable placeholder, not a partially-rendered/corrupt form.
  - User impact: No crash of the Settings dialog; a clear unavailable state.
- **A ConfigOptionDto arrives with a type string the display-control mapping does not recognize (e.g. a future daemon adds a new type).** (recoverable)
  - Detection: SettingsView/the row renderer's type switch has no case for the unknown type; a default branch handles it.
  - Response: Render the setting with a read-only fallback display (its value as text) rather than dropping it or throwing, so an unknown type degrades visibly.
  - User impact: A newly-typed setting still appears (as text) rather than silently vanishing from the page (lc1).

### Edge cases

| Input | Expected |
| :--- | :--- |
| The payload's groups[] contains a group with no options, or an option whose group is not listed in groups[]. | An empty group yields no panel; an option whose group is absent from groups[] falls into a trailing bucket and is still rendered — no option is ever dropped (SettingsView.groupsOf covers this). |
| A setting is unset (isSet=false) — its path was absent from the payload's values map. | displayValue shows the default with an explicit 'default'/'using default' marker, not a blank field (ac2). |
| An enum setting whose current value is not among enumValues (a value set out-of-band). | Read-only display shows the actual current value as-is (no coercion); S002 does not validate or edit — validation is S003's concern. |
| The catalog is legitimately empty (options=[]), e.g. a future stripped-down daemon. | The page renders an empty-but-valid Loaded state (no groups), not the Unavailable placeholder — Loaded and Unavailable are distinct. |

### Invariants to preserve

- The plugin reaches the daemon only over the existing UnixSocketDaemonRpc transport and honours its DaemonResult ok/error framing; settingsCatalog() maps a non-ok/error reply to Unavailable, never a blank Loaded (the S001 framing invariant the existing gateway reads follow). [[c4]]
- The page renders whatever the daemon described — groups, options, types, allowed values all come from the config.catalog payload; the plugin hardcodes no setting/group/role/tier (lc1/k1), so a catalog change surfaces without a plugin change. [[c1]]
- S002 is read-only: the Configurable never writes config.json and never triggers a reload; isModified()=false and apply()/reset() are no-ops (k5). Editing is S003. [[c2]]
- Adding settingsCatalog() to the DaemonGateway interface requires updating the DaemonGatewayImpl, the DaemonGatewayService delegate, and all four test doubles in the same change or the plugin will not compile (the recurring gateway-extension compile break). [[c4]]

## Test strategy

**Test framework:** `JUnit5 (JUnit Platform) via ./gradlew test on JDK21 — the jetbrains-plugin src/test/kotlin convention (fake DaemonRpc + WireRpc doubles, headless pure-object + source-scan tests, as in ApproveTest)`

### Test levels

- **unit** — Prove the pure SettingsView (grouping + current-vs-default display) headlessly — the load-bearing view logic for ac1/ac2.
  - Subjects: `SettingsView.groupsOf buckets options into SettingsGroupModels in payload.groups order; every option appears in exactly one group; an option whose group is absent from groups[] falls into a trailing bucket (never dropped); an empty group yields no model`, `SettingsView.displayValue returns the current value when isSet and the default with an explicit default-marker when unset (ac2)`, `an unrecognized ConfigOptionDto.type degrades to a read-only text display, not dropped/thrown`
  - Fixtures: `An in-memory SettingsCatalogDto fixture with multiple groups, a set option, an unset option, an out-of-groups option, and an unknown-type option`
- **unit** — Prove the gateway settingsCatalog() classification + parse over a fake DaemonRpc AND the real parse boundary (the S001 framing invariant).
  - Subjects: `settingsCatalog() over a fake DaemonRpc: ok+data -> Loaded(SettingsCatalogDto) with options/groups/roles/tierNames parsed and values folded into currentValue/isSet`, `!ok or error!=null -> Unavailable(reason); DaemonUnavailableException -> Unavailable; a malformed reply (options not a list) -> Unavailable (no throw)`, `over the REAL UnixSocketDaemonRpc.parse: a {result:{...payload}} reply -> Loaded; a {result:{error}} reply -> Unavailable (result.error framing)`, `isSet is true iff the values map contained the path; currentValue is that value`
  - Fixtures: `A FakeDaemonRpc returning canned DaemonResults; a WireRpc replaying raw JSON reply strings through UnixSocketDaemonRpc.parse`
- **unit** — Guard the read-only + registration invariants by source-scan (the Configurable/Swing shell is not headlessly bootable).
  - Subjects: `plugin.xml registers an <applicationConfigurable> pointing at InsrcSettingsConfigurable`, `InsrcSettingsConfigurable is read-only: isModified() returns false and apply()/reset() are no-ops (no gateway write / config.write call)`, `the DaemonGatewayService delegate + all four test doubles implement settingsCatalog() (compile-green is itself the proof)`
  - Fixtures: `The plugin.xml resource + InsrcSettingsConfigurable source (source-scan)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: SettingsView.groupsOf produces ordered SettingsGroupModels covering every option (grouping for the collapsible panels)`, `unit: settingsCatalog() Loaded carries options with type/default/desc/group + folded current values that the rows render`, `unit: plugin.xml <applicationConfigurable> registration present (the page is reachable in Settings)` |
| `ac2` | `unit: SettingsView.displayValue marks an unset option as using-default (not blank) and shows the actual value when set` |
| `ac3` | `unit: settingsCatalog() maps !ok/error/DaemonUnavailable/malformed to Unavailable (never a blank Loaded)`, `unit: over the real UnixSocketDaemonRpc.parse a {result:{error}} reply -> Unavailable`, `unit (source-scan): InsrcSettingsConfigurable renders a distinct unavailable placeholder and re-reads on open` |

## Migration

**State before:** The plugin has no Settings Configurable of any kind (plugin.xml registers only a postStartupActivity, an 'insrc' notificationGroup, and the review toolWindow), and the DaemonGateway exposes no config read methods (its methods are probe/isProjectRegistered/registerProject/pendingArtifacts/artifactReviewView/resolveComment/approve over DaemonRpc). S001 shipped the daemon config.catalog IPC + payload; nothing in the plugin consumes it yet.

**State after:** The DaemonGateway gains a settingsCatalog(): SettingsCatalogResult read (+ DTOs + parseCatalog), delegated by DaemonGatewayService and stubbed in the four test doubles. A new pure SettingsView + SettingsGroupModel + SettingsSection seam and a new InsrcSettingsConfigurable render the settings read-only, grouped + collapsible, with a daemon-unavailable placeholder; the Configurable is registered via a new <applicationConfigurable> in plugin.xml. No editing, no write, no override sections.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add `fun settingsCatalog(): SettingsCatalogResult` to the DaemonGateway interface and the DTOs/sealed result (SettingsCatalogResult, SettingsCatalogDto, ConfigOptionDto, RoleDto) + parseCatalog helper; implement it in DaemonGatewayImpl following the pendingArtifacts/artifactReviewView idiom. — ↩ rollbackable
2. Add the settingsCatalog() delegate to DaemonGatewayService and a trivial override stub to the four DaemonGateway test doubles — in the SAME change so the module compiles (the recurring gateway-extension break). — ↩ rollbackable
3. Add the pure sc3 view types: SettingsGroupModel, the SettingsView object (groupsOf + displayValue), and the SettingsSection extension interface, in a new plugin settings package. — ↩ rollbackable
4. Add InsrcSettingsConfigurable (read-only: off-EDT settingsCatalog() read, EDT-marshaled render of collapsible group panels + per-type display rows + unavailable placeholder; isModified()=false, apply()/reset() no-ops). — ↩ rollbackable
5. Register the Configurable via a new <applicationConfigurable> entry in plugin.xml beside the existing toolWindow. — ↩ rollbackable
6. Add the headless tests: SettingsView unit tests, the gateway settingsCatalog classification + real-parse tests, and the source-scan read-only/registration guards. — ↩ rollbackable

**Backward compat:** Adding settingsCatalog() to the DaemonGateway interface is a source-incompatible interface change WITHIN the plugin module only (no external consumer) — handled by updating DaemonGatewayImpl, the DaemonGatewayService delegate, and all four test doubles in the same change; every existing gateway method is untouched. The new <applicationConfigurable> is purely additive — it does not alter the existing toolWindow, postStartupActivity, or notificationGroup, and the page stays inert/unavailable when the daemon is unreachable rather than affecting plugin activation. No daemon change (config.catalog already shipped in S001). No user data or config.json is read-migrated or written — S002 is read-only.

## Alternatives considered

### a1: Pure settings view-model builder + thin Swing Configurable — **CHOSEN**

settingsCatalog() gateway behind a sealed result; a PURE builder turns SettingsCatalogDto into ordered SettingsGroupModels + per-option display strings; a thin InsrcSettingsConfigurable renders collapsible group panels read-only.

The gateway gains settingsCatalog(): SettingsCatalogResult (Loaded|Unavailable) following the established read pattern, with data-class DTOs parsed from the reply map. All load-bearing view logic lives in a PURE object (SettingsView): SettingsCatalogDto -> ordered SettingsGroupModels in payload.groups order + a display helper for current-vs-default, so ac1/ac2 are unit-testable headlessly. A new InsrcSettingsConfigurable (registered via <applicationConfigurable>) is a thin shell that reads off-EDT, marshals onto the EDT, renders collapsible group panels + a daemon-unavailable placeholder; read-only no-ops for isModified/apply/reset. A SettingsSection seam is declared for s4/s5.

### a2: All rendering logic inline in the Configurable

Same gateway + DTOs, but the grouping, current-vs-default, and Loaded/Unavailable logic live directly inside the Swing Configurable with no pure view-model.

The gateway/DTOs are as in a1, but createComponent() does the grouping, current-vs-default computation, and unavailable branching inline in Swing. No separate pure object.

**Rejected because:** Functionally reaches the ACs but places the load-bearing logic where only a headful IDE fixture can test it — the exact untestable placement the review epic's defects clustered in — and weakens the sc3 seam.

### a3: Render straight from the DTO (no SettingsGroupModel), group on the fly

Gateway + DTOs as in a1, but skip the SettingsGroupModel type and the pure builder; the panel iterates groups and filters options inline while still isolating a small pure display helper.

The Configurable iterates dto.groups and filters dto.options by group inline; a small pure helper computes the current-vs-default display string, but there is no SettingsGroupModel type or ordered-grouping builder.

**Rejected because:** A middle ground that keeps the display helper pure but leaves grouping in Swing and skips the SettingsGroupModel type, so ac1 grouping correctness is only partially covered and the sc3 seam is thinner than the HLD sketch prescribes.

## Citations

- **[[c1]]** `code` `src/config/config-catalog.ts + src/config/settings-catalog.ts` — "S001's config.catalog payload (options/groups/roles/tierNames/values) is the single daemon-owned schema the page renders from (lc1/k1)."
- **[[c2]]** `code` `src/daemon/index.ts` — "config.catalog is a read-only IPC (no write, no reload); S002's page is read-only over it (k5)."
- **[[c3]]** `code` `jetbrains-plugin/src/main/resources/META-INF/plugin.xml` — "extensions register a toolWindow but no applicationConfigurable/Configurable — the Settings page is a new applicationConfigurable surface."
- **[[c4]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — "DaemonGateway over UnixSocketDaemonRpc with DaemonResult ok/error framing; sealed Loaded|Unavailable read results; adding a method breaks impl+delegate+4 test doubles."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T19:56:06.265Z

_No load-bearing premises were extracted._
