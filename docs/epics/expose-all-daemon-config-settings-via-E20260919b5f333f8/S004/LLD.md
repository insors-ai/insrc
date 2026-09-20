<!-- insrc:artifact LLD-b5f333f8d7ba421b-s4 -->

# LLD: E20260920b5f333f8:S004

**Epic:** `expose-all-daemon-config-settings-via`
**HLD base run:** `wf-1789841045868-kib3gd`
**HLD effective hash:** `ee39a9f5fd11...`

## HLD context

**Framework:** A daemon-owned, self-describing settings contract feeds a native JetBrains Settings page that renders whatever the daemon reports. The plugin adds config gateway methods behind the established sealed three-state result pattern and a native applicationConfigurable built purely from the daemon's description. Reads use the catalog IPC plus the existing value read; writes reuse the existing segment-aware write. The plugin owns no settings semantics; the daemon stays the single source of truth.
**Rollout phase:** Phase D — Dynamic-key override editors (per-role, per-repo)
**Consumes:** `sc1` (Self-describing settings catalog (enriched ConfigOption + role taxonomy) over config.catalog, and its plugin read surface), `sc2` (Settings write surface (segment-aware write + clear) behind a sealed SaveResult), `sc3` (Settings page framework (Configurable host + grouped collapsible rendering + type→control mapping))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Daemon-side catalog enrichment + config.catalog assembly stay private to s1; other stories consume only the sc1 payload shape. — owns `sc1`
- `s2`: Read-only rendering + collapsible layout + the daemon-unavailable placeholder stay private to s2; the SettingsSection seam is declared here. — owns `sc3`
- `s3`: Per-type edit controls + validation/dirty/apply for global settings stay private to s3; it exposes only sc2 for the override editors. — owns `sc2`
- `s5`: The per-repo overrides sub-section (models.byRepo.<repoPath>.*) is wholly private to s5; it plugs into sc3's section seam and reuses sc2.

## Contract details

**Surface level:** internal

### `DaemonGateway.perRoleOverrides`

```typescript
fun perRoleOverrides(): PerRoleOverridesResult
```

**Returns:** `PerRoleOverridesResult` — Loaded(overrides: Map<String,String>) = the current models.tasks { roleId -> tierName } read over the EXISTING config.show IPC; Unavailable(reason) when the daemon is unreachable / a transport fault. No new daemon code.

**Errors:**
- `PerRoleOverridesResult.Unavailable` when DaemonUnavailableException / a RuntimeException from the config.show call (never throws).

**Preconditions:**
- None — global read, no params (config.show is global).

**Postconditions:**
- Parses data.models.tasks into a Map<String,String>; a missing/non-map models or tasks yields a Loaded empty map (distinct from Unavailable).
- Only string-valued entries kept (a non-string tier skipped); never a partial throw.

### `PerRoleOverridesModel`

```typescript
class PerRoleOverridesModel(roles: List<RoleDto>, tierNames: List<String>, current: Map<String,String>) { fun rows(): List<PerRoleRow>; fun setOverride(roleId: String, tier: String): Unit; fun removeOverride(roleId: String): Unit; fun revert(): Unit; fun isModified(): Boolean; fun collectWrites(): List<PendingWrite>; fun onSaved(roleId: String): Unit }
```

**Parameters:**
- `roles: List<RoleDto>` — The recognized roles (id + defaultTier) from sc1 — daemon-derived (lc1), never hardcoded.
- `tierNames: List<String>` — The allowed tier names from sc1 (cheap/mid/core) — chooser options + validation domain.
- `current: Map<String,String>` — The current models.tasks overrides (roleId -> tier) from the config.show read; present = override, absent = default routing.

**Returns:** `PerRoleOverridesModel` — The pure, headless per-role editor state: override-vs-default rows, add/change/remove intent, dirty, and the roleId->segment mapping. Load-bearing logic lives here (not the Swing section) so it is unit-testable.

**Errors:**
- `IllegalArgumentException` when setOverride/removeOverride with a roleId not in `roles`, or setOverride with a tier not in `tierNames` (programmer error).

**Preconditions:**
- setOverride's tier is one of tierNames.

**Postconditions:**
- rows() returns one PerRoleRow per role {roleId, effectiveTier, isOverride}, reflecting PENDING state; effectiveTier = pending override tier when overridden else defaultTier (ac1).
- isModified() true iff any role's pending override differs from its `current` state.
- collectWrites() returns only changed roles as PendingWrite(listOf("models","tasks",roleId), Set(tier)) for add/change and (..., Clear) for a removal — roleId is ONE literal segment (dots intact), per-key isolation (ac2/ac3).
- onSaved(roleId) advances that role's `current` baseline and clears its dirty flag.
- Selecting the same tier a role already overrides to is NOT dirty; removing a role with no override is a no-op.

### `PerRoleSection`

```typescript
class PerRoleSection(model: PerRoleOverridesModel, gateway: DaemonGateway) : SettingsSection { override val title: String; override fun component(): JComponent; override fun isModified(): Boolean; override fun apply(); override fun reset() }
```

**Parameters:**
- `model: PerRoleOverridesModel` — The pure per-role edit state the section renders + drives.
- `gateway: DaemonGateway` — The sc2 write surface (writeSetting/clearSetting) the section applies through.

**Returns:** `SettingsSection` — The per-role sub-section plugged into the sc3 seam: a thin Swing shell of role rows (tier chooser + use-default/remove) bound to the model. apply() runs collectWrites via sc2 and advances onSaved on Saved; isModified/reset delegate to the model.

**Errors:**
- `SettingsWriteException` when apply surfaces a not-Saved SaveResult to the host so the host throws ConfigurationException preserving the pending intent (returned to the host, not thrown raw).

**Preconditions:**
- Rendered only on a Loaded catalog; an Unavailable page installs no section.

**Postconditions:**
- apply writes only changed roles via sc2 with the literal segment array; a Saved role advances the model; a not-Saved role keeps its pending intent and is surfaced (ac2/ac3, never a false success).
- Registers NO new shared contract; consumes sc1/sc2/sc3 only.

### `InsrcSettingsConfigurable.apply`

```typescript
override fun apply(): Unit  // + isModified(), reset(), createComponent host glue for SettingsSection
```

**Returns:** `Unit` — The host now also drives registered SettingsSections: createComponent renders each section below the global groups; isModified() ORs the global model with any section.isModified(); apply() runs the global dirty writes AND each section's writes in the SAME off-EDT ProgressManager block, then throws ConfigurationException if any failed; reset() reverts the global model AND each section. Minimal glue activating the sc3 seam s2 declared.

**Errors:**
- `ConfigurationException` when any global field or section write returns not-Saved, or a validation error — thrown after the off-EDT writes so the dialog stays open with edits preserved (ac2/ac3).

**Preconditions:**
- Loaded catalog; sections built from the same catalog + the perRoleOverrides read.

**Postconditions:**
- Per-key isolation: each section write is an independent sc2 call at one literal key; a partial failure advances only the Saved ones.
- Writes run OFF the EDT (S003 pattern); model/section mutation + re-seed back on the EDT.

## Data model changes

### `PerRoleOverridesResult` — new

New sealed interface in the daemon package: Loaded(val overrides: Map<String,String>) | Unavailable(val reason: String). The config.show-backed perRoleOverrides() result; two-state (mirrors SettingsCatalogResult) so an unreachable daemon is distinct from a legitimately-empty override map.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `PerRoleRow` — new

New pure row DTO in the settings package: {roleId: String, effectiveTier: String, isOverride: Boolean}. What the section renders per role (ac1). Reuses PendingWrite/WriteOp from S003 for collectWrites().

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `RoleState (internal to PerRoleOverridesModel)` — new

Per-role pure state: the RoleDto, the current-override tier (or none), the pending intent (override-to-tier / removed / unchanged). Private to s4.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `InsrcSettingsConfigurable section list` — field-add

The host gains a list of SettingsSection built on Loaded (S003 rendered only global groups); createComponent renders them and isModified/apply/reset fan out to them — activating the sc3 seam s2 declared but left unused.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consumes settingsCatalog()'s roles (id+defaultTier) + tierNames UNCHANGED for the rows + chooser (lc1). Does NOT amend sc1: the CURRENT override values come from the existing config.show read (perRoleOverrides), not a grown catalog payload. |
| `sc2` | consumes | Consumes writeSetting/clearSetting VERBATIM: add/change = writeSetting(listOf("models","tasks",roleId), tier); removal = clearSetting(listOf("models","tasks",roleId)). roleId is ONE literal segment (dotted roleId never mis-nested, k4; per-key isolation, ac2/ac3). Reuses the S003 SaveResult + off-EDT apply. |
| `sc3` | consumes | Consumes the SettingsSection seam s2 declared: provides PerRoleSection : SettingsSection + minimal host glue to render registered sections and fan isModified/apply/reset. Activates the declared extension point; does not redesign sc3. |

## Error paths

### Error cases

- **The daemon is unreachable when reading the current per-role overrides on page open.** (recoverable)
  - Detection: perRoleOverrides() catches DaemonUnavailableException/RuntimeException from config.show and returns PerRoleOverridesResult.Unavailable(reason).
  - Response: The section renders an unavailable placeholder and installs no editable rows; consistent with the settingsCatalog Unavailable page.
  - User impact: The section is shown unavailable rather than an empty/misleading role list; retry on reopen.
- **A per-role override write is rejected by the daemon (config.write ok=false).** (recoverable)
  - Detection: sc2.writeSetting/clearSetting returns SaveResult.Rejected (data['ok']==false) — the S003 classification.
  - Response: The host apply does not advance that role via onSaved, keeps the pending intent, collects the failure, throws ConfigurationException naming the role; other roles' Saved writes stand.
  - User impact: Clear failure; the pending override/removal preserved; never a false success (ac2/ac3).
- **The daemon drops mid-apply after some role writes succeeded.** (recoverable)
  - Detection: a later write throws DaemonUnavailableException -> SaveResult.Unavailable; the host records it in failures.
  - Response: Already-Saved roles advanced; failed + remaining roles keep pending intent; apply throws ConfigurationException summarizing failures.
  - User impact: Honest partial progress; no override silently lost (ac2/ac3).
- **config.show returns a config whose models.tasks is present but not a JSON object.** (recoverable)
  - Detection: perRoleOverrides's `as? Map` cast fails -> treated as no overrides (empty); non-string entries skipped.
  - Response: The editor shows every role as default routing rather than throwing; the developer can still add overrides.
  - User impact: Degrades to 'no overrides' instead of a crash.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A roleId that contains dots (e.g. 'design.contract.detail') is overridden. | collectWrites emits PendingWrite(listOf("models","tasks","design.contract.detail"), Set(tier)) — roleId ONE segment; config.write keys models.tasks['design.contract.detail'] flat (k4/ac2). |
| Set a role's override to the SAME tier it already overrides to. | Not dirty; collectWrites omits it; no write. |
| Set a role's override equal to its defaultTier. | An explicit override write (models.tasks.<roleId> = defaultTier) — dirty vs 'no override', written, NOT auto-converted to a removal; removal is the separate use-default affordance. |
| Mark a removal on a role that has an override, then revert before apply. | revert() restores every role to `current`; isModified()=false; no daemon call. |
| The daemon has an override for a roleId NOT in the recognized role set. | rows() lists only recognized roles (lc1); the unknown key is not shown and is left untouched (per-key isolation). |
| The per-role overrides map is empty. | Every recognized role listed as default routing (ac1); isModified()=false until a change. |

### Invariants to preserve

- The overridable roles + tier names come from the daemon's recognized taxonomy (sc1), never hardcoded (lc1). [[c1]]
- A per-role write goes through config.write with a LITERAL [models, tasks, roleId] segment array so a dotted roleId is never mis-nested; per-key isolation — one role's key never disturbs another or the surrounding models.tasks map. [[c5]]
- The plugin talks to the daemon only over the existing Unix-socket transport and honours its framing (config.show returns the object directly; config.write's ok lives in data); no new transport, no direct config.json write. [[c4]]
- The daemon stays the single source of truth: removing an override CLEARS the key so the role falls back to the daemon's default routing. [[c7]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) on JDK21 via ./gradlew test, matching S002/S003's SettingsEditModelTest/SettingsWriteGatewayTest; source-scan tests read the Kotlin source. No BasePlatformTestCase and no daemon/TS test (config.show + config.write reused unchanged).`

### Test levels

- **unit** — Prove the pure per-role logic headlessly: override-vs-default rows, add/change/remove intent, dirty, and the DOTTED roleId->literal-segment mapping + per-key isolation.
  - Subjects: `rows(): override shows its value, absent shows defaultTier (ac1)`, `dirty semantics: same-tier not dirty; remove-of-unset no-op; default-tier is an explicit override`, `collectWrites: Set at listOf('models','tasks',roleId) / Clear; a DOTTED roleId stays ONE segment (ac2/ac3, k4)`, `per-key isolation: one changed role -> exactly one PendingWrite`, `revert()/onSaved(roleId)`
  - Fixtures: `roles (incl. a dotted roleId) + tierNames [cheap,mid,core] + a current map with one override and one unset role`
- **unit** — Prove the config.show-backed perRoleOverrides read + parse against the real transport framing.
  - Subjects: `Loaded(map) from data.models.tasks; missing/non-map -> Loaded empty; non-string skipped`, `DaemonUnavailable/RuntimeException -> Unavailable`, `WireRpc over real UnixSocketDaemonRpc.parse: {result:{models:{tasks:{...}}}} -> Loaded (config.show returns the object directly)`
  - Fixtures: `FakeDaemonRpc returning a canned config`, `WireRpc replaying a config.show JSON reply through parse`
- **unit** — Guard the section + host glue by source-scan (Swing shell not headlessly bootable).
  - Subjects: `PerRoleSection applies via gateway.writeSetting/clearSetting with listOf('models','tasks',...) not a raw config.write/dotted string`, `InsrcSettingsConfigurable renders registered SettingsSections + fans isModified/apply/reset; section writes ride the off-EDT apply`, `no hardcoded role/tier literal in the section (built from catalog.roles)`
  - Fixtures: `Read of PerRoleSection.kt + InsrcSettingsConfigurable.kt source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `PerRoleOverridesModel.rows lists overrides with value + non-overrides as default routing`, `perRoleOverrides parses data.models.tasks (Fake + WireRpc)` |
| `ac2` | `collectWrites emits Set at listOf('models','tasks',roleId) with a DOTTED roleId as one segment`, `per-key isolation: adding one override -> exactly one PendingWrite`, `source-scan: PerRoleSection applies via gateway.writeSetting (segment list)` |
| `ac3` | `collectWrites emits Clear on removal`, `removing one override leaves others unchanged (per-key isolation)`, `onSaved after a clear advances the role to default-routing baseline` |

## Migration

**State before:** After S003 (main c5eab8f) the page edits the GLOBAL catalog settings via sc2 with a pure SettingsEditModel + off-EDT apply. The sc3 SettingsSection interface is declared but the InsrcSettingsConfigurable host NEVER renders a section. The gateway has no read of the dynamic per-role overrides (models.tasks.<roleId>); sc1's `values` carries only the ~31 static paths. config.show + config.write exist and are unchanged.

**State after:** The page shows a per-role overrides sub-section below the global groups: each recognized role with its effective tier + override-vs-default, add/change (writeSetting models.tasks.<roleId>=tier) and remove (clearSetting) via sc2. A thin perRoleOverrides read over config.show supplies the current overrides; a pure PerRoleOverridesModel owns the logic; PerRoleSection plugs into the now-activated sc3 host glue. Daemon UNCHANGED; s5 not built.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add PerRoleOverridesResult + DaemonGateway.perRoleOverrides() over config.show + the DaemonGatewayService delegate + stubs in the 4 test doubles. Additive to the interface. — ↩ rollbackable
2. Add the pure PerRoleOverridesModel + PerRoleRow (+ RoleState) reusing PendingWrite/WriteOp; no existing-symbol changes. — ↩ rollbackable
3. Add PerRoleSection : SettingsSection + the minimal host glue in InsrcSettingsConfigurable (section list on Loaded, render below groups, fan isModified/apply(off-EDT)/reset). Activates the sc3 seam. — ↩ rollbackable
4. Extend the test suite (PerRoleOverridesModelTest, perRoleOverrides gateway Fake+WireRpc, Configurable source-scan) and run ./gradlew test on JDK21. — ↩ rollbackable

**Backward compat:** The DaemonGateway interface only GAINS perRoleOverrides() (+ 4 test-double stubs); settingsCatalog/writeSetting/clearSetting and all S001-S003 behaviour unchanged. config.show + config.write reused verbatim — no daemon code change, config.json stays valid, older/newer daemons interoperate. A per-role write lands at models.tasks.<roleId> (the daemon's existing dynamic-key namespace); per-key isolation leaves existing overrides untouched. A page against an Unavailable daemon renders no section. No migration or data rewrite.

## Alternatives considered

### a1: config.show read + generic SettingsSection registry + pure per-role model — **CHOSEN**

A thin gateway read over the existing config.show yields the current models.tasks map; a pure PerRoleOverridesModel owns the logic; a PerRoleSection : SettingsSection plugs into the host, which renders registered sections generically and fans apply/isModified/reset to them.

perRoleOverrides() over config.show -> Map<roleId,tier>; PerRoleOverridesModel(roles, tierNames, current) exposes rows/setOverride/removeOverride/revert/isModified/collectWrites/onSaved with roleId as one literal segment; PerRoleSection : SettingsSection; minimal host glue renders sections + fans apply/isModified/reset; s5 reuses the same glue.

### a2: Amend sc1 to include current per-role override values in the catalog payload

Propose an HLD amendment (sharedContract.fieldAdd) so config.catalog also carries the current models.tasks overrides, read from the existing settingsCatalog().

fieldAdd roleOverrides to SettingsCatalogPayload/DTO; the daemon's buildSettingsCatalog folds config's models.tasks in; the section reads catalog.roleOverrides. Same pure model + host glue otherwise.

**Rejected because:** Only partial on sc1: it redesigns another story's contract + daemon code for a capability the existing config.show already exposes; a1 gets the same result within s4's boundary.

### a3: config.show read but hardcode the per-role section in the Configurable (logic in the shell)

Same config.show read, but build the per-role rows + add/change/remove logic directly inside InsrcSettingsConfigurable instead of a pure model + generic SettingsSection.

perRoleOverrides() read as in a1, but the Configurable constructs the rows inline, tracks dirty by walking combo boxes, and calls sc2 in apply — no pure model, no generic section list.

**Rejected because:** Partial on ac1/ac2/ac3 (logic in the untestable shell) and partial on sc3 (seam unused) — the exact pattern the review split exists to prevent.

## Citations

- **[[c1]]** `code` `src/config/settings-catalog.ts:82-84 + src/config/role-taxonomy.ts` — "buildSettingsCatalog: roles = taxonomy.roles.map({id, defaultTier}); tierNames = Object.keys(taxonomy.rankOf) (cheap/mid/core) — the daemon-derived role set/tiers sc1 delivers."
- **[[c2]]** `code` `src/config/settings-catalog.ts (values assembly)` — "buildSettingsCatalog `values` is populated only for the static CONFIG_CATALOG paths; the dynamic models.tasks.<roleId> keys never appear in it."
- **[[c3]]** `prior-artifact` `jetbrains-plugin/.../settings/SettingsView.kt (S002) + InsrcSettingsConfigurable.kt` — "interface SettingsSection { title; component(); isModified(); apply(); reset() } declared as the sc3 seam but never rendered by the host (renderBody builds only the catalog groups)."
- **[[c4]]** `code` `src/daemon/index.ts:1296 (config.show) + jetbrains-plugin/.../daemon/UnixSocketDaemonRpc.kt` — "config.show returns the raw config object directly (parse-or-{}), so data.models.tasks is the current { roleId: tier } map; the transport framing is the existing Unix-socket JSON-RPC."
- **[[c5]]** `code` `src/config/write-path.ts + jetbrains-plugin/.../daemon/DaemonGateway.kt (sc2)` — "models.tasks.<roleId> keys contain dots; sc2 writeSetting/clearSetting take a LITERAL List<String> so roleId is one segment; setConfigAtPath sets/removes only that leaf (per-key isolation)."
- **[[c7]]** `convention` `HLD constraint k5 / CLAUDE.md project principles` — "Changing which values are stored is the daemon's job; the plugin owns no settings semantics or defaults — removing an override clears the key so the daemon default governs."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T06:38:32.883Z

_No load-bearing premises were extracted._
