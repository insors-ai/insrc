<!-- insrc:artifact HLD-b5f333f8d7ba421b -->

# HLD: A daemon-owned, self-describing settings contract feeds a native JetBrains Settings page that renders whatever the daemon reports

## Framework summary

A daemon-owned, self-describing settings contract feeds a native JetBrains Settings page that renders whatever the daemon reports. The daemon's single-definition catalog is enriched with two structured fields (allowed fixed values and a group label) and, together with the recognized role taxonomy and tier names, is exposed over ONE new read-only IPC. The plugin adds config gateway methods behind the established sealed three-state result pattern and a native applicationConfigurable that builds a grouped, collapsible Swing form purely from the daemon's description — hardcoding no setting, group, role, or tier. Reads use the new catalog IPC plus the existing value read; writes reuse the existing segment-aware write. The plugin owns no settings semantics; the daemon stays the single source of truth.

## Architecture shape

Three layers across two modules. (1) Daemon schema layer (src/config): ConfigOption gains readonly enumValues?/group; CONFIG_CATALOG entries are backfilled; the contract test and boot reconcile are extended to keep every existing invariant green. (2) Daemon IPC layer (src/daemon/index.ts): one new string-keyed handler config.catalog, sitting beside config.show, assembles the enriched catalog + role taxonomy + tier names + current values into a single payload; config.show and config.write are reused unchanged. (3) Plugin layer (jetbrains-plugin): new config gateway methods over the existing UnixSocketDaemonRpc transport return data-class DTOs behind sealed results; a new applicationConfigurable hosts a Swing form that groups options into collapsible panels, chooses a control per declared type, and adds two dynamic-key sub-editors (per-role, per-repo) driven by the same payload. Dirty state and Apply/Reset ride the Configurable's native isModified/apply/reset. The data flow is one-directional: daemon describes → plugin renders → user edits → plugin writes back through config.write.

## Shared contracts

### sc1: Self-describing settings catalog (enriched ConfigOption + role taxonomy) over config.catalog, and its plugin read surface

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The single daemon-owned description the whole IDE surface renders from: every recognized setting with type/default/allowed-values/group/description, the recognized roles and their default tiers, the allowed tier names, and the current values — delivered over one read IPC and mirrored as plugin DTOs behind a sealed read result. Satisfies k1/k2/k3 and is the foundation every downstream Story renders from.

**Interface sketch (type-level):**

```
// daemon (src/config/config-catalog.ts) — ConfigOption gains two structured fields:
interface ConfigOption { readonly path: string; readonly type: 'string'|'number'|'boolean'|'enum'; readonly default: unknown; readonly desc: string; readonly enumValues?: readonly string[]; readonly group: string }
// daemon config.catalog IPC payload:
interface SettingsCatalogPayload { readonly options: readonly ConfigOption[]; readonly groups: readonly string[]; readonly roles: readonly { readonly id: string; readonly defaultTier: 'cheap'|'mid'|'core' }[]; readonly tierNames: readonly ('cheap'|'mid'|'core')[]; readonly values: Readonly<Record<string, unknown>> }
// plugin (Kotlin, type-level) mirror + read gateway:
// data class ConfigOptionDto(path: String, type: String, default: Any?, desc: String, enumValues: List<String>?, group: String, currentValue: Any?, isSet: Boolean)
// data class SettingsCatalogDto(groups: List<String>, options: List<ConfigOptionDto>, roles: List<RoleDto>, tierNames: List<String>)
// sealed interface SettingsCatalogResult { data class Loaded(catalog: SettingsCatalogDto); data class Unavailable(reason: String) }
// interface DaemonGateway { fun settingsCatalog(): SettingsCatalogResult }
```

**Assumptions cited:** [[c1]] [[c2]]

### sc2: Settings write surface (segment-aware write + clear) behind a sealed SaveResult

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`

**Purpose:** The one way the IDE persists an edit: a plugin gateway write that maps an edited key to config.write's literal segment array (so dotted dynamic keys never mis-nest) and a clear that removes a key (for override removal), each returning a sealed result distinguishing a persisted save from a daemon rejection or unavailability. Satisfies k4; first needed when editing begins (s3) and reused by both override editors.

**Interface sketch (type-level):**

```
// plugin (Kotlin, type-level):
// sealed interface SaveResult { data object Saved; data class Rejected(reason: String); data class Unavailable(reason: String) }
// interface DaemonGateway {
//   fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult   // -> config.write({ path: pathSegments, value })
//   fun clearSetting(pathSegments: List<String>): SaveResult                // remove a key (per-role/per-repo override removal)
// }
```

**Assumptions cited:** [[c5]]

### sc3: Settings page framework (Configurable host + grouped collapsible rendering + type→control mapping)

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`

**Purpose:** The native applicationConfigurable and its rendering scaffold: it turns a SettingsCatalogDto into collapsible group panels, maps each setting's declared type to a read/display control, shows default/current, and exposes extension points where the editing and dynamic-key sub-sections plug in. Owns the page's structure and the daemon-unavailable state; consumed by every Story that adds interaction to the page.

**Interface sketch (type-level):**

```
// plugin (Kotlin, type-level):
// class InsrcSettingsConfigurable : Configurable { /* getDisplayName / createComponent / isModified / apply / reset (signatures only) */ }
// data class SettingsGroupModel(group: String, options: List<ConfigOptionDto>)
// interface SettingRowRenderer { fun rowFor(option: ConfigOptionDto): JComponent }   // type -> control; edit-capable variant supplied by s3
// interface SettingsSection { val title: String; fun component(): JComponent; fun isModified(): Boolean; fun apply(); fun reset() }   // per-role/per-repo sections plug in here
```

**Assumptions cited:** [[c3]]

## Story boundaries

### Story E20260919b5f333f8:S001

**Owns:** `sc1`

The daemon-side enrichment mechanics stay private to s1: exactly how each of the 31 existing catalog entries is assigned its group and (for enum settings) its allowed-values list; how config.catalog assembles the payload (reading CONFIG_CATALOG, the role taxonomy, and current values); and how the contract test and boot reconcile are extended so the two new fields do not disturb defaults-on-boot or retired-path disjointness. None of these internals are consumed by other Stories — they consume only the payload shape (sc1).

### Story E20260919b5f333f8:S002

**Owns:** `sc3`
**Depends on:** `sc1`

Private to s2: the read-only rendering of each setting's current value and default hint, the collapsible group layout and its expand/collapse state, and the daemon-unavailable placeholder state with recovery on reconnect. s2 renders values but installs no editing behaviour; the edit-capable row variant and dirty/apply logic are s3's.

### Story E20260919b5f333f8:S003

**Owns:** `sc2`
**Depends on:** `sc1`, `sc3`

Private to s3: the per-type edit controls (chooser/toggle/number/text), field-level validation before save, dirty tracking against the last-saved value, the reset-to-default affordance, and the write-rejected surfacing that preserves the pending edit. s3 exposes only the write surface (sc2) for the override editors to reuse.

### Story E20260919b5f333f8:S004

**Depends on:** `sc1`, `sc2`, `sc3`

Wholly private to s4: the per-role overrides sub-section — listing roles from the taxonomy in sc1, showing which have an override vs default routing, and the add/change/remove interactions that write or clear models.tasks.<roleId> via sc2. It plugs into sc3's section extension point and introduces no contract others consume.

### Story E20260919b5f333f8:S005

**Depends on:** `sc1`, `sc2`, `sc3`

Wholly private to s5: the per-repo overrides sub-section — listing repositories with overrides, editing the nested settings under one repository (reusing the type→control mapping), and add/remove that writes or clears models.byRepo.<repoPath>.* via sc2 without touching global values. It plugs into sc3's section extension point and introduces no contract others consume.

## Non-functional targets

- **Performance:** The settings page loads from a single config.catalog round-trip plus the existing value read; rendering 31 settings + the two override sections is trivial Swing work. No polling — the page reads on open and after Apply.
- **Security:** No new surface beyond the existing local Unix-socket transport; secrets/keys are explicitly out of scope (they stay on the keystore path). Writes go only to the daemon's existing config.json via config.write.
- **Observability:** config.write already logs each write (path + value); config.catalog is a pure read. The plugin surfaces daemon-unavailable and write-rejected states to the user rather than failing silently.
- **Durability:** Persistence is unchanged — the daemon's existing config.json write + reconcile own durability; the plugin never writes config.json directly.

## Rollout

### Phase A — Daemon settings contract (schema + catalog IPC)

**Stories:** `s1`

s1 owns sc1, the self-describing catalog + role taxonomy + values payload that every other Story renders from; it is the foundation with no upstream dependency and must land first. It is also the only Story that touches the daemon (schema enrichment + config.catalog handler), so it can be verified with the daemon test suite independently of any IDE work.

**Backward compat:** The ConfigOption enrichment (enumValues optional, group added) must keep the existing catalog contract test and boot reconcile green — defaults still fill on boot, live/retired path disjointness holds, and existing config.json files are unaffected. config.show/config.write behaviour is unchanged.

### Phase B — Settings page shell (read-only, grouped, collapsible)

**Stories:** `s2`

s2 owns sc3, the native Configurable + grouped collapsible rendering + type→control display mapping, consuming sc1. It delivers the visible page (read-only) and the daemon-unavailable state, and provides the section extension points the later Stories plug into.

**Backward compat:** Registering a new applicationConfigurable must not disturb the existing tool window or plugin activation; the page stays inert/unavailable when the daemon is unreachable rather than erroring.

### Phase C — Editing + write-back

**Stories:** `s3`

s3 owns sc2, the segment-aware write + clear surface behind a sealed SaveResult, and adds the edit-capable controls, dirty/apply/reset, and write-rejected handling on top of sc3. It must precede the override editors, which reuse sc2.

**Backward compat:** Writes go only through the existing config.write (segment array + reload); unchanged settings are never rewritten, so a save touches exactly the edited keys.

### Phase D — Dynamic-key override editors (per-role, per-repo)

**Stories:** `s4`, `s5`

s4 and s5 both depend on s3 and consume sc1+sc2+sc3; they are independent sibling sub-sections (per-role models.tasks.<roleId> and per-repo models.byRepo.<repoPath>.*) that plug into sc3's section extension point and reuse sc2's write/clear. Grouped together as the final phase since neither blocks the other and both build only on Phases A–C.

**Backward compat:** Override writes/clears must edit only the exact dotted/nested key for one role or one repository, never a sibling override or the corresponding global value.

**Ordering rationale:** The Epic's Story graph is a linear chain s1←s2←s3←s4←s5, and shared-contract ownership matches it: sc1 (owned by s1) is consumed by all; sc3 (owned by s2) is consumed by s3/s4/s5; sc2 (owned by s3) is consumed by s4/s5. Phases therefore follow the chain — contract foundation (A), page shell (B), editing+write (C) — then fold the two override editors, which share the same upstream and are mutually independent, into one final phase (D).

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Enriching ConfigOption / CONFIG_CATALOG (Phase A) | ConfigOption + CONFIG_CATALOG is a load-bearing single-definition site read by the daemon-boot reconcile and guarded by a contract test; adding fields or backfilling 31 entries wrong could break defaults-on-boot or the live/retired disjointness invariant, affecting every daemon start. | Make enumValues optional and group a required-with-safe-default addition; extend the contract test to assert every option has a group and every enum option has enumValues; run the full daemon test suite (npx tsx --test) and confirm reconcile still fills defaults + prunes retired paths on a sample config. |
| Rendering an arbitrary daemon-described schema (Phases B/C) | The page renders whatever the daemon reports; a setting whose declared type the renderer does not recognize (or an enum with an unexpected value) could render blank or uneditable, silently hiding a real setting. | Define a default fallback control (read-only text field showing the raw value) for any unrecognized type, and cover the type→control mapping with headless tests over each declared type plus an unknown-type case, so a new daemon type degrades visibly rather than disappearing. |
| Writing dotted/nested dynamic keys (Phases C/D) | Per-role (models.tasks.<roleId>) and per-repo (models.byRepo.<repoPath>.*) writes/removes must land at the exact key without a naive dotted-string split mis-nesting them or clobbering a sibling override or the global value — the classic dotted-key hazard. | Always route through sc2's segment-array write/clear (never a dotted string), and test per-key isolation directly: adding/removing one role or repo override leaves other overrides and the matching global value byte-unchanged. |

## Alternatives considered

### a1: Daemon-owned self-describing catalog + native Configurable rendering it dynamically — **CHOSEN**

Enrich the single catalog (enumValues + group), expose it plus the role taxonomy over a new config.catalog IPC, and have a native JetBrains Settings Configurable render whatever the daemon describes.

The daemon stays the sole owner of the settings schema. ConfigOption in the single-definition-site catalog gains two structured fields — the fixed allowed values for enum settings and a group label — backfilled for the existing entries, keeping every current catalog invariant (disjointness from retired paths, defaults-on-boot) green under the existing contract test. A new config.catalog IPC handler, registered next to config.show in the same dispatch table, returns the enriched catalog together with the recognized role taxonomy (role ids + default tiers + the allowed tier names) so the dynamic-key editors are also daemon-derived. The plugin gains config gateway methods (a catalog read, the existing value read via config.show, and a write via config.write) as data-class DTOs behind sealed three-state results, mirroring the review epic's gateway conventions and honouring the transport's ok/error framing.

The IDE surface is a native applicationConfigurable registered in plugin.xml, rendering a Swing form built entirely from the described schema: settings bucketed into collapsible group panels, each row a type-appropriate control chosen from the setting's declared type/allowed-values, with the default shown and a reset-to-default affordance, and dedicated sub-panels for the per-role and per-repo dynamic overrides driven by the taxonomy and catalog the same IPC delivered. The plugin hardcodes no setting, no group, and no role — it is a pure renderer of the daemon's self-description, so a future catalog change appears in the IDE with no plugin change. Apply writes each dirty key through config.write's segment-aware path; the Configurable's standard isModified/apply/reset wiring carries dirty state.

**Pros:**
- Single source of truth: the settings list, types, defaults, allowed values, groups, and roles all come from the daemon catalog + taxonomy, so k1/k2/lc1 hold and the IDE never drifts when the catalog changes.
- Idiomatic: a native applicationConfigurable gives searchable Settings placement and the platform's built-in Apply/Reset/isModified dirty handling for free.
- Reuses the existing transport, config.show, config.write, and the segment-aware write path unchanged (k3/k4) — only a read-only config.catalog handler is added on the daemon.
- The three-state sealed-result gateway pattern already proven across S002/S004/S005 of the review epic transfers directly, keeping the daemon-unavailable and write-rejected paths honest.

**Cons:**
- Largest surface: it touches the daemon catalog schema, a new IPC, new plugin gateway methods, and a new Configurable with dynamic typed rendering plus two dynamic-key editors.
- The catalog enrichment must be done carefully so the contract test and boot reconcile stay green — a schema change to a load-bearing single-definition site.
- Dynamic rendering of arbitrary described settings is more code than a fixed form would be, and needs a fallback for any type the renderer does not recognize.

**Cost estimate:** L

### a2: Plugin-hardcoded schema mirror over the existing value IPC (no daemon change)

Hardcode the 31 settings, their groups, and enum values in the plugin and drive a fixed Swing form off config.show/config.write, adding nothing to the daemon.

The plugin ships its own compiled-in description of the settings — the list of keys, their types, defaults, enum choices, and group assignments — authored by hand to match the daemon catalog at build time. It reads current values with the existing config.show and writes edits with the existing config.write, so no daemon code changes at all. The Settings Configurable renders a fixed form from this in-plugin table, with the groups and controls laid out statically.

Because the schema lives in the plugin, the per-role and per-repo editors also carry a hardcoded role list and tier names. There is no new IPC and no catalog enrichment; the daemon is treated purely as a value store reachable through the two existing config methods.

**Pros:**
- Smallest daemon footprint: zero daemon changes, only plugin work, so the daemon test suite is untouched.
- Simplest data flow: the plugin already knows the whole schema, so rendering is a static form with no dynamic-description handling.

**Cons:**
- Directly violates k1/k5: the schema is duplicated and forked into the plugin, so it drifts the moment the catalog changes — a new, removed, or re-typed setting silently mismatches until someone hand-edits the plugin.
- The recognized roles (role-taxonomy.ts) and tier names would be hardcoded too, so S004 diverges from the daemon's actual taxonomy — exactly the opacity the Epic set out to remove.
- No structured allowed-values source: enum choices are copied from prose, so a daemon-side change to an enum's options is invisible to the IDE.
- Pushes settings semantics into the plugin, contradicting the thin-surface convention the whole integration is built on.

**Cost estimate:** M

**Rejected because:** Cheapest on the daemon but violates k1, k2, and k5 — it forks the single-definition catalog and pushes schema ownership into the plugin, guaranteeing drift and re-creating the opacity the Epic exists to remove.

### a3: JCEF HTML settings panel backed by config.catalog

Keep the daemon catalog IPC of a1 but render the settings form as bundled HTML inside a JBCefBrowser, reusing the review panel's JCEF hosting instead of a native Configurable.

The daemon side is identical to a1 — enriched catalog + config.catalog IPC + role taxonomy — but the IDE surface is an HTML page served into a JBCefBrowser, reusing the review epic's bundled-renderer/JCEF hosting and JS<->Kotlin bridge to build the grouped, collapsible form and post edits back. The page renders the described schema into collapsible sections and typed inputs in HTML/JS, and a bridge marshals saves onto the daemon write.

The settings surface could live either in the existing review tool window as a second tab or in a Configurable whose component is a JCEF browser, but the rendering and interaction logic sit in web code rather than Swing.

**Pros:**
- Reuses the review epic's mature JCEF hosting, bundled-renderer CSP, and EDT-marshaling bridge, so the presentation layer is familiar.
- HTML/CSS makes rich collapsible layout and styling straightforward compared with hand-built Swing.

**Cons:**
- Non-idiomatic for settings: it forgoes the platform's native Settings search, Apply/Reset, and isModified integration that a Configurable provides for free.
- JCEF is gated on a JCEF-capable runtime; a settings page that silently degrades or needs a native fallback re-introduces the exact fallback complexity the review epic already had to carry.
- More moving parts for a plain form: a JS bridge, CSP, and off-EDT marshaling for what native controls handle directly — higher defect surface (the review epic's HIGH/MED findings clustered in this bridge).

**Cost estimate:** L

**Rejected because:** Constraint-equivalent to a1 (it shares a1's daemon design), but the JCEF/HTML surface is non-idiomatic for settings, forgoes native Settings search + Apply/Reset/isModified, is gated on a JCEF-capable runtime with a fallback to carry, and concentrates defect risk in a JS bridge — all avoidable cost for a plain settings form.

## Citations

- **[[c1]]** `analyze-bundle` `src/config/config-catalog.ts` — "CONFIG_CATALOG single-definition-site of 31 typed ConfigOption entries (path/type/default/desc); enum allowed-values only in prose desc, no group field; config.show/config.write exist, no config.catal"
- **[[c2]]** `analyze-bundle` `src/daemon/index.ts` — "All IPC handlers register in one string-keyed dispatch object; the config.* family sits together; config.show is a trivial reader — config.catalog is one new entry beside it."
- **[[c3]]** `analyze-bundle` `src/config/role-taxonomy.ts` — "RoleTaxonomy = { roles: RoleDescriptor{ id, criticality, defaultTier }[] } is the authoritative recognized-role set for models.tasks.<roleId> overrides; TierName cheap|mid|core are the allowed values."
- **[[c4]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — "DaemonGateway: data-class DTOs + sealed three-state results over DaemonRpc.call -> DaemonResult (ok/error framing); the pattern the new config gateway methods follow."
- **[[c5]]** `analyze-bundle` `jetbrains-plugin/src/main/resources/META-INF/plugin.xml` — "Plugin registers a toolWindow but no applicationConfigurable/projectConfigurable and zero Configurable classes — the Settings page is a brand-new applicationConfigurable surface."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T18:12:38.906Z

_No load-bearing premises were extracted._
