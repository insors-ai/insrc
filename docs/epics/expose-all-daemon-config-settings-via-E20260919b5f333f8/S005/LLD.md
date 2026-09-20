<!-- insrc:artifact LLD-b5f333f8d7ba421b-s5 -->

# LLD: E20260920b5f333f8:S005

**Epic:** `expose-all-daemon-config-settings-via`
**HLD base run:** `wf-1789841045868-kib3gd`
**HLD effective hash:** `ee39a9f5fd11...`

## HLD context

**Framework:** A daemon-owned, self-describing settings contract feeds a native JetBrains Settings page that renders whatever the daemon reports. The plugin adds config gateway methods behind the established sealed three-state result pattern and a native applicationConfigurable built purely from the daemon's description. Reads use the catalog IPC plus the existing value read; writes reuse the existing segment-aware write. The plugin owns no settings semantics; the daemon stays the single source of truth.
**Rollout phase:** Phase D — Dynamic-key override editors (per-role, per-repo)
**Consumes:** `sc1` (Self-describing settings catalog (enriched ConfigOption + role taxonomy) over config.catalog, and its plugin read surface), `sc2` (Settings write surface (segment-aware write + clear) behind a sealed SaveResult), `sc3` (Settings page framework (Configurable host + grouped collapsible rendering + type-to-control mapping))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Daemon-side catalog enrichment + config.catalog assembly stay private to s1; other stories consume only the sc1 payload shape. — owns `sc1`
- `s2`: Read-only rendering + collapsible layout + the SettingsSection seam are private to s2. — owns `sc3`
- `s3`: Per-type edit controls + validation/dirty/apply for global settings stay private to s3; it exposes only sc2. — owns `sc2`
- `s4`: The per-role overrides sub-section (models.tasks.<roleId>) is wholly private to s4; it activated the sc3 host glue (the sections list + fan-out) s5 reuses. Its PerRoleOverridesModel/PerRoleSection are a mirror-reference for s5's per-repo tasks editor, not re-implemented.

## Contract details

**Surface level:** internal

### `DaemonGateway.perRepoOverrides`

```typescript
fun perRepoOverrides(): PerRepoOverridesResult
```

**Returns:** `PerRepoOverridesResult` — Loaded(overrides: Map<String, RepoOverrideDto>) = per repoPath in config's models.byRepo, its full override {coreFloor?, tasks: Map<roleId,tier>, tiers: Map<tierName,{runner?,model?}>}; Unavailable(reason) on an unreachable/errored daemon. Read over the EXISTING config.show IPC (data.models.byRepo).

**Errors:**
- `PerRepoOverridesResult.Unavailable` when DaemonUnavailableException / RuntimeException from config.show (never throws).

**Preconditions:**
- None — global read, no params.

**Postconditions:**
- Parses data.models.byRepo (map of repoPath -> entry); per entry pulls coreFloor as String? (non-string -> null), tasks as Map<String,String> (string tiers only), tiers as Map<String,{runner:String?,model:String?}> (string leaves only); missing/non-map models|byRepo -> Loaded empty; a non-map entry is skipped; never a partial throw.

### `DaemonGateway.registeredRepos`

```typescript
fun registeredRepos(): RegisteredReposResult
```

**Returns:** `RegisteredReposResult` — Loaded(repos: List<String>) = the daemon's registered repo paths (repo.list data.repos); Unavailable(reason) otherwise. Feeds the add-override picker.

**Errors:**
- `RegisteredReposResult.Unavailable` when !ok / result.error / DaemonUnavailableException / RuntimeException from repo.list.

**Preconditions:**
- None — global read (repo.list, the call isProjectRegistered uses).

**Postconditions:**
- data.repos coerced to List<String> (each repo's path; non-string skipped); !ok/thrown -> Unavailable.

### `PerRepoOverridesModel`

```typescript
class PerRepoOverridesModel(registeredRepos: List<String>, roles: List<RoleDto>, tierNames: List<String>, current: Map<String, RepoOverrideDto>) { fun rows(): List<PerRepoRow>; fun addableRepos(): List<String>; fun addOverride(repoPath: String); fun removeOverride(repoPath: String); fun setCoreFloor(repoPath: String, tier: String?); fun setTaskTier(repoPath: String, roleId: String, tier: String?); fun setTierField(repoPath: String, tierName: String, field: TierField, value: String?); fun revert(); fun isModified(): Boolean; fun collectWrites(): List<PendingWrite>; fun onSaved(segments: List<String>) }
```

**Parameters:**
- `registeredRepos: List<String>` — The daemon's registered repos (add-candidate set; k5 daemon-derived).
- `roles: List<RoleDto>` — The recognized roles from sc1 — the per-repo tasks (role->tier) editor's row set + defaultTier display.
- `tierNames: List<String>` — Allowed tier names from sc1 — the coreFloor + per-repo tasks choosers' options and the tiers editor's tier-name row set + validation domain.
- `current: Map<String, RepoOverrideDto>` — Current per-repo overrides (repoPath -> {coreFloor?, tasks, tiers}) from config.show; key present = that repo has an override entry.

**Returns:** `PerRepoOverridesModel` — The pure, headless per-repo editor state: which repos overridden + their nested coreFloor/tasks/tiers pending edits, dirty, and the repoPath->literal-nested-segment mapping. Load-bearing logic lives here (not the Swing section) so it is unit-testable (the S002-S004 split).

**Errors:**
- `IllegalArgumentException` when setCoreFloor/setTaskTier with a non-null tier not in tierNames; any mutator with a repoPath outside the known set (registered ∪ currently-overridden); setTaskTier with a roleId not in roles; setTierField with a tierName not in tierNames.

**Preconditions:**
- addOverride's repoPath is a registered repo not already overridden; a non-null tier passed to setCoreFloor/setTaskTier is one of tierNames.

**Postconditions:**
- rows() = one PerRepoRow per overridden-or-just-added repo, each carrying its coreFloor?, its role->tier task map, and its tier->{runner,model} map for the nested editors (ac1); addableRepos() = registered repos with no override.
- isModified() true iff any repo's pending state (added / removed / any nested coreFloor|task|tier leaf changed) differs from `current`.
- collectWrites() emits ONE PendingWrite per changed LEAF: coreFloor -> Set/Clear at listOf('models','byRepo',repoPath,'coreFloor'); a task -> Set(tier)/Clear at listOf('models','byRepo',repoPath,'tasks',roleId); a tier field -> Set(value)/Clear at listOf('models','byRepo',repoPath,'tiers',tierName,'runner'|'model'); a whole-override removal -> ONE Clear at listOf('models','byRepo',repoPath). repoPath and dotted roleId are each ONE literal segment (per-repo isolation, ac2/ac3, lc1, k4).
- onSaved(segments) advances the baseline for exactly the one leaf (or the whole repo on a repoPath Clear); same-value not dirty; add-then-revert / clear-of-unset a no-op.

### `PerRepoSection`

```typescript
class PerRepoSection(model: PerRepoOverridesModel, gateway: DaemonGateway) : SettingsSection { override val title: String; override fun component(): JComponent; override fun isModified(): Boolean; override fun apply(); override fun reset() }
```

**Parameters:**
- `model: PerRepoOverridesModel` — The pure per-repo edit state the section renders + drives.
- `gateway: DaemonGateway` — The sc2 write surface (writeSetting/clearSetting) the section applies through.

**Returns:** `SettingsSection` — The per-repo overrides sub-section plugged into the sc3 seam: an add-repo picker of addableRepos() + one nested panel per overridden repo (a coreFloor combo, a role->tier combo grid mirroring PerRoleSection with a '(use default)' sentinel = clear the task, and a per-tier runner+model text-field pair), plus a remove-override control. apply() runs collectWrites via sc2 (off-EDT, host-driven) + onSaved per Saved leaf; isModified/reset delegate to the model.

**Errors:**
- `ConfigurationException` when apply surfaces the not-Saved leaves (by repoPath + key) so the host aggregates it (mirrors PerRoleSection); preserves the pending intent.

**Preconditions:**
- Rendered only when the catalog (roles + tierNames), the per-repo read, and the registered-repos read are all Loaded; else a placeholder + no section.

**Postconditions:**
- apply writes only changed leaves via sc2 with the literal nested segment array; a Saved leaf advances via onSaved(segments), a not-Saved one keeps its pending intent + is surfaced (ac2/ac3, never a false success).
- Registers NO new shared contract; consumes sc1/sc2/sc3 only; reuses the S004 host fan-out unchanged.

### `InsrcSettingsConfigurable.createComponent`

```typescript
override fun createComponent(): JComponent  // + the Loaded render registers PerRepoSection into the existing sections list
```

**Returns:** `JComponent` — The host's off-EDT read now also fetches perRepoOverrides() + registeredRepos(); on a Loaded catalog + both reads Loaded it builds + registers a PerRepoSection (alongside the S004 PerRoleSection) into the SAME sections list, which the existing glue renders below the groups and drives via isModified/apply(off-EDT)/reset. No new host machinery — a register-only touch.

**Errors:**
- `none` when reads never throw (sealed results); a not-Loaded read yields a placeholder + no section (as S004).

**Preconditions:**
- Loaded catalog; the per-repo section additionally needs the perRepoOverrides + registeredRepos reads Loaded.

**Postconditions:**
- The per-repo section rides the existing sections fan-out (isModified OR, apply off-EDT aggregating failures, reset).
- An Unavailable per-repo/registered-repos read -> a placeholder, no PerRepoSection registered.

## Data model changes

### `PerRepoOverridesResult` — new

New sealed interface in the daemon package: Loaded(val overrides: Map<String, RepoOverrideDto>) | Unavailable(val reason: String). The config.show-backed per-repo read (repoPath -> full override); two-state so an unreachable daemon is distinct from an empty byRepo map.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `RegisteredReposResult` — new

New sealed interface in the daemon package: Loaded(val repos: List<String>) | Unavailable(val reason: String). The repo.list-backed registered-repo read for the add-picker.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `RepoOverrideDto` — new

New DTO in the daemon package mirroring one models.byRepo.<repoPath> entry: {coreFloor: String?, tasks: Map<String,String> (roleId->tier), tiers: Map<String, TierSpecDto> (tierName->{runner:String?, model:String?})}. Parsed from config.show; the shape the model consumes as `current`.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `TierSpecDto / TierField` — new

TierSpecDto = {runner: String?, model: String?} (one per-repo tier's two leaves). TierField = enum { Runner, Model } naming which leaf a setTierField edit targets (maps to the final segment 'runner'|'model').

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `PerRepoRow` — new

New pure row DTO in the settings package: {repoPath: String, coreFloor: String?, tasks: Map<String,String>, tiers: Map<String,TierSpecDto>, hasOverride: Boolean} — the full pending per-repo state the section renders per overridden repo (ac1). Reuses PendingWrite/WriteOp from S003.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `RepoState (internal to PerRepoOverridesModel)` — new

Per-repo pure state: the repoPath, the saved override (coreFloor + tasks map + tiers map) and the pending copy, plus an added/removed flag. Diffing saved-vs-pending per leaf yields collectWrites. Private to s5.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `InsrcSettingsConfigurable per-repo registration` — field-add

The host's Loaded render additionally builds + adds a PerRepoSection to the existing sections list (S004 introduced the list + fan-out); createComponent's off-EDT read gains perRepoOverrides() + registeredRepos(). No new host fan-out logic.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consumes settingsCatalog()'s roles + tierNames UNCHANGED: tierNames for the coreFloor combo + the per-repo tasks choosers + the tiers editor's tier-name row set; roles for the per-repo tasks (role->tier) editor rows. The tiers editor's runner/model VALUES are daemon-side free strings (no sc1 enum domain) rendered as text fields — no sc1 amendment. Current per-repo values + candidate repos come from config.show + repo.list, not a grown sc1 payload. |
| `sc2` | consumes | Consumes writeSetting/clearSetting VERBATIM for every nested leaf: coreFloor = writeSetting(listOf('models','byRepo',repoPath,'coreFloor'), tier); a task = writeSetting(listOf('models','byRepo',repoPath,'tasks',roleId), tier); a tier field = writeSetting(listOf('models','byRepo',repoPath,'tiers',tierName,'runner'\|'model'), value); a clear of any leaf or the whole override = clearSetting(the corresponding segment array, ending at repoPath for a whole-override removal). repoPath + dotted roleId are single literal segments (k4/lc1). Reuses the S003 SaveResult + S004 off-EDT apply. |
| `sc3` | consumes | Consumes the sc3 SettingsSection seam + the S004 host glue: provides PerRepoSection : SettingsSection (with its nested per-repo sub-editors inside the ONE section component) and registers it in the host's existing sections list (a register-only touch). Does not redesign sc3 or add host machinery. |

## Error paths

### Error cases

- **The daemon is unreachable when reading the per-repo overrides or the registered repos on open.** (recoverable)
  - Detection: perRepoOverrides()/registeredRepos() catch DaemonUnavailableException/RuntimeException (or !ok/result.error for repo.list) -> their Unavailable variant.
  - Response: The host shows a per-repo placeholder and registers NO PerRepoSection; global + per-role sections still render.
  - User impact: The section shows unavailable rather than an empty/misleading repo list; retry on reopen.
- **A per-repo leaf write is rejected by the daemon (config.write ok=false) — e.g. an out-of-domain tier or an invalid tiers-runner value.** (recoverable)
  - Detection: sc2.writeSetting/clearSetting returns SaveResult.Rejected (classified on data['ok']==false at DaemonGateway.kt:585), NOT the transport-level ok.
  - Response: apply does not advance that leaf via onSaved, keeps its pending intent, and adds it (by repoPath + key) to the aggregated ConfigurationException; other leaves' Saved writes stand.
  - User impact: Clear failure naming which repo+key failed; pending edit preserved; never a false success (ac2/ac3).
- **The daemon drops mid-apply after some per-repo leaf writes succeeded.** (recoverable)
  - Detection: a later writeSetting/clearSetting throws DaemonUnavailableException -> SaveResult.Unavailable; recorded in the failures list.
  - Response: Already-Saved leaves advanced via onSaved; the failed + remaining leaves keep pending intent; apply throws the aggregated ConfigurationException the host surfaces.
  - User impact: Honest partial progress; no edit silently lost (ac2/ac3).
- **config.show returns a config whose models.byRepo, a repo entry, or a nested tasks/tiers value is present but not the expected JSON shape.** (recoverable)
  - Detection: perRepoOverrides's `as? Map` / string-cast guards fail per level -> byRepo empty / that repo entry skipped / that nested leaf omitted (coreFloor non-string -> null; a tier spec non-map -> skipped; a runner/model non-string -> null).
  - Response: The editor shows only the well-formed leaves for that repo rather than throwing; other repos + leaves still editable.
  - User impact: Degrades to 'not shown' for the malformed leaf instead of a crash.
- **A tiers editor field is left with only one of {runner, model} set for a tier the user is adding.** (recoverable)
  - Detection: collectWrites emits a PendingWrite only for the leaf(s) the user actually set; an untouched sibling leaf is not written (pending==saved).
  - Response: Only the set leaf is written at its exact segment array; the daemon stores a partial tier spec (its existing behaviour), never a fabricated sibling value.
  - User impact: The user's exact intent is persisted; no plugin-invented runner/model default (k5).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A repoPath with dots and slashes (e.g. /Users/x/work/insors.ide) gets a coreFloor + a task override. | collectWrites emits PendingWrite(listOf('models','byRepo','/Users/x/work/insors.ide','coreFloor'),Set) and PendingWrite(listOf('models','byRepo','/Users/x/work/insors.ide','tasks',roleId),Set) — repoPath (and a dotted roleId) each ONE segment; config.write keys the flat leaves, never nesting on '.'/'/' (k4/ac2). |
| Set a repo's coreFloor / task tier / tier field to the SAME value it already has. | Not dirty for that leaf; collectWrites omits it; no write. |
| Add an override, set some nested values, then remove it / revert before applying. | returns to the current state; isModified()=false; no daemon call; a just-added override with no leaf set writes nothing. |
| Remove an existing whole override (with coreFloor + tasks + tiers), then Apply. | ONE clearSetting(listOf('models','byRepo',repoPath)) drops that repo's entire byRepo subtree in a single write; the repo returns to global; other repos + global models.* untouched (ac3/lc1). |
| A repoPath present in models.byRepo but NOT registered. | Still LISTED as an override with its nested settings (rows from current, ac1) and editable/removable; just not offered again by addableRepos (registered minus overridden). |
| A per-repo tasks map keyed by a dotted roleId (e.g. design.contract.detail) or a per-repo tiers map keyed by a recognized tier. | The task write targets listOf('models','byRepo',repoPath,'tasks','design.contract.detail') (dotted roleId ONE segment); a tier field targets listOf('models','byRepo',repoPath,'tiers',tierName,'runner'\|'model') — leaf-exact, per-key isolation. |
| models.byRepo empty with registered repos present. | No override rows; the add-picker offers every registered repo; isModified()=false until add + a leaf edit. |

### Invariants to preserve

- A per-repo override edits only the nested keys under that ONE repository via config.write's literal segment array [models, byRepo, repoPath, ...]; repoPath (and any dotted roleId/tier segment) is a single literal segment so a dotted/slashed path never mis-nests, and a global setting of the same name is never changed as a side effect (lc1). [[c5]]
- Per-repo isolation: writing/clearing one repo's leaf never disturbs another repo's byRepo entry, another leaf of the same repo the user did not change, or the surrounding models.byRepo map; removing the whole override clears exactly models.byRepo.<repoPath> in one write. [[c5]]
- The plugin talks to the daemon only over the existing Unix-socket transport and honours its framing (config.show + repo.list return their object/collection directly; config.write's ok lives in data, classified at DaemonGateway.kt:585); no new transport, no direct config.json write. [[c4]]
- The daemon stays the single source of truth: the tier domain (coreFloor + tasks choosers) comes from sc1 tierNames, the roles from sc1, and the candidate repos from repo.list — none hardcoded; the tiers editor's runner/model are the user's free-string values, and the plugin invents no default for an unset sibling leaf; removing an override returns the repo to the daemon's global values. [[c7]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) on JDK21 via ./gradlew test, matching S002-S004's *ModelTest/*GatewayTest + the InsrcSettingsConfigurableTest source-scan idiom. No BasePlatformTestCase and no daemon/TS test (config.show + repo.list + config.write reused unchanged).`

### Test levels

- **unit** — Prove the pure per-repo logic headlessly: rows/addableRepos, add/remove/edit intent across coreFloor + tasks + tiers, dirty, the DOTTED/SLASHED repoPath + dotted-roleId nested-key mapping, leaf-granular per-key isolation, and the whole-override single-Clear.
  - Subjects: `rows(): an overridden repo shows its coreFloor + task map + tiers map + hasOverride; addableRepos() = registered minus overridden (ac1)`, `dirty: same coreFloor/task/tier-field value not dirty; clear-of-unset / add-then-revert no-op`, `collectWrites coreFloor -> Set/Clear at listOf('models','byRepo',repoPath,'coreFloor')`, `collectWrites tasks -> Set/Clear at listOf('models','byRepo',repoPath,'tasks',roleId) with a DOTTED roleId ONE segment (ac2/ac3, k4)`, `collectWrites tiers -> Set/Clear at listOf('models','byRepo',repoPath,'tiers',tierName,'runner'|'model') (TWO independent leaves); setting only one leaf writes only that leaf`, `per-key isolation: one changed leaf -> exactly one PendingWrite; other repos + untouched leaves absent`, `whole-override removal -> ONE Clear at listOf('models','byRepo',repoPath); onSaved(repoPath segments) drops the repo`, `DOTTED/SLASHED repoPath ONE literal segment across coreFloor/tasks/tiers writes`, `a repo in current but not registered is a row, not in addableRepos`
  - Fixtures: `registeredRepos incl. a dotted/slashed path + roles (incl. a dotted roleId) + tierNames [cheap,mid,core] + a current map with one fully-overridden repo (coreFloor + tasks + tiers) and repos with none/partial`
- **unit** — Prove the config.show/repo.list-backed gateway reads + parse against the real transport framing, including the full nested per-repo shape.
  - Subjects: `perRepoOverrides: Loaded from data.models.byRepo parsing coreFloor + tasks map + tiers map of {runner,model}; missing/non-map -> Loaded empty/skip; non-string leaf -> omitted/null; DaemonUnavailable -> Unavailable`, `registeredRepos: Loaded from repo.list data.repos; !ok/result.error/DaemonUnavailable -> Unavailable`, `WireRpc over real UnixSocketDaemonRpc.parse: {result:{models:{byRepo:{'/p/a.b':{coreFloor:'core',tasks:{review:'core'},tiers:{core:{runner:'cli-claude',model:'opus'}}}}}}} -> Loaded full shape; {result:{repos:[...]}} -> Loaded`
  - Fixtures: `FakeDaemonRpc returning a canned full-shape config / repo.list reply`, `WireRpc replaying canned config.show + repo.list JSON through parse`
- **unit** — Guard the section + host registration by source-scan (Swing shell not headlessly bootable), matching the S002-S004 InsrcSettingsConfigurableTest idiom.
  - Subjects: `PerRepoSection applies via gateway.writeSetting/clearSetting with listOf('models','byRepo',...) not a raw config.write/dotted string; throws ConfigurationException on not-Saved`, `PerRepoSection renders all three nested editors (coreFloor combo, per-role task combos, per-tier runner+model fields) driven from model.rows()/model.tierNames() — no hardcoded repo/role/tier literal`, `InsrcSettingsConfigurable builds + registers a PerRepoSection into the existing sections list (createComponent reads perRepoOverrides + registeredRepos)`
  - Fixtures: `Read of PerRepoSection.kt + InsrcSettingsConfigurable.kt source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `PerRepoOverridesModel.rows lists overridden repos with coreFloor + tasks + tiers, addableRepos shows repos with none`, `perRepoOverrides parses the full data.models.byRepo shape (Fake + WireRpc); registeredRepos parses repo.list`, `source-scan: PerRepoSection renders coreFloor + per-role tasks + per-tier runner/model editors from the model` |
| `ac2` | `collectWrites: add + set coreFloor/task/tier-field emits Set at the exact nested listOf('models','byRepo',repoPath,...) arrays with a DOTTED/SLASHED repoPath + dotted roleId each ONE segment`, `per-key isolation: setting one leaf of one repo -> exactly one PendingWrite; global + other repos/leaves untouched`, `source-scan: PerRepoSection applies via gateway.writeSetting (segment list), never a raw config.write string` |
| `ac3` | `collectWrites: edit a leaf -> Set; clear a leaf -> Clear; whole-override removal -> ONE Clear at listOf('models','byRepo',repoPath)`, `onSaved after a whole-override clear drops the repo (returns to global); other repos unchanged`, `same coreFloor/task/tier value not dirty (no spurious write)` |

## Migration

**State before:** After S004 (main 8c1f66b) the page edits global settings + a per-role overrides section, and the sc3 host glue (sections list + off-EDT fan-out) is ACTIVE (InsrcSettingsConfigurable holds a sections MutableList driven by isModified/apply/reset). The gateway reads config.show (perRoleOverrides over METHOD_CONFIG_SHOW) but has NO per-repo (models.byRepo) read nor a registered-repos read (METHOD_REPO_LIST exists at DaemonGateway.kt:631 but is used only internally by isProjectRegistered). writeSetting/clearSetting (sc2, classifying on data['ok'] at :585), sealed SaveResult, PendingWrite/WriteOp, and the daemon config.show + repo.list + config.write IPCs all exist and are unchanged.

**State after:** The page shows a per-repo overrides sub-section below the per-role one: repos with an override listed with their FULL nested settings (coreFloor + per-role tasks + per-tier {runner,model}), an add-repo picker of registered repos without one, edit (coreFloor combo, per-role tier combos, per-tier runner+model fields) + remove (whole override). Two thin reads (perRepoOverrides over config.show parsing the full byRepo entry, registeredRepos over repo.list) supply the data; a pure PerRepoOverridesModel owns the leaf-granular logic; PerRepoSection registers into the existing sc3 sections list. Daemon UNCHANGED. Completes the epic's 5 stories with full per-repo parity (no follow-up story).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add PerRepoOverridesResult + RegisteredReposResult + RepoOverrideDto + TierSpecDto sealed/data types and perRepoOverrides()/registeredRepos() on DaemonGateway+Impl (over the existing config.show / repo.list), the DaemonGatewayService delegates, and stubs in the 4 test doubles (DaemonLifecycleServiceTest, OnboardingCleanupIntegrationTest, OnboardingWiringTest, OnboardingLifecycleTest). Additive to the interface. — ↩ rollbackable
2. Add the pure PerRepoOverridesModel + PerRepoRow + TierField (+ internal RepoState) reusing PendingWrite/WriteOp; repoPath and dotted roleId as ONE literal segment; leaf-granular collectWrites for coreFloor/tasks/tiers + single-Clear whole-override removal. No existing-symbol changes. — ↩ rollbackable
3. Add PerRepoSection : SettingsSection (add-repo picker + a nested panel per overridden repo: coreFloor combo, per-role tier combos, per-tier runner+model fields, remove control) + register it in InsrcSettingsConfigurable's existing Loaded section-build point (createComponent also reads perRepoOverrides + registeredRepos). Reuses the S004 host fan-out; placeholder + no section when a read is Unavailable. — ↩ rollbackable
4. Extend the test suite (PerRepoOverridesModelTest, perRepoOverrides + registeredRepos gateway Fake+WireRpc parsing the full byRepo shape, Configurable/section source-scan) and run ./gradlew test on JDK21. — ↩ rollbackable

**Backward compat:** The DaemonGateway interface only GAINS perRepoOverrides()/registeredRepos() (+ 4 test-double stubs); all S001-S004 behaviour unchanged. config.show + repo.list + config.write reused verbatim — no daemon code change, config.json stays valid, older/newer daemons interoperate. Per-repo writes land at models.byRepo.<repoPath>.{coreFloor|tasks.<roleId>|tiers.<tierName>.<runner|model>} (the daemon's existing dynamic-key namespace); per-repo isolation leaves other repos + global values untouched; removing an override clears models.byRepo.<repoPath> in one write. An Unavailable daemon renders no per-repo section. No migration or data rewrite.

## Alternatives considered

### a1: One unified pure PerRepoOverridesModel + a single PerRepoSection with per-repo nested sub-panels — **CHOSEN**

A single pure PerRepoOverridesModel owns all three per-repo knobs (coreFloor + tasks role->tier + tiers tier->{runner,model}) keyed by repoPath; one PerRepoSection renders a repo picker + a nested edit panel per overridden repo; all writes via sc2 at literal nested segment arrays.

Two thin gateway reads over existing IPCs (perRepoOverrides over config.show parsing the full byRepo entry, registeredRepos over repo.list); a pure PerRepoOverridesModel(registeredRepos, roles, tierNames, current) with rows/addableRepos/add/remove/setCoreFloor/setTaskTier/setTierField/revert/isModified/collectWrites/onSaved emitting ONE PendingWrite per changed leaf; PerRepoSection : SettingsSection registered into the S004 host glue.

### a2: Compose per-repo by delegating tasks to a reused PerRoleOverridesModel instance per repo

Reuse the S004 PerRoleOverridesModel as-is for each repo's tasks sub-editor, with separate small models for coreFloor and tiers, composed by a PerRepoSection.

Same two reads as a1, but the per-repo tasks sub-editor instantiates the existing PerRoleOverridesModel per selected repo and rebases its emitted segments under ['models','byRepo',repoPath,'tasks',...]; coreFloor + tiers get their own tiny per-repo models; PerRepoSection composes the three.

**Rejected because:** Partial on ac2/ac3/sc2/k4: reusing PerRoleOverridesModel per-repo needs a segment-prefix seam it does not expose (SettingsView.kt:383), forcing a change to s4-owned internal code or fragile segment rewriting — the mis-nest hazard k4/sc2 forbid. a1 keeps the isolation guarantee in one place at the same cost.

### a3: coreFloor-scoped only (the prior draft), tiers/tasks deferred

Ship only the scalar coreFloor per-repo knob; per-repo tiers + tasks editors are a separate follow-up story.

A pure PerRepoOverridesModel with only coreFloor per repo, one PerRepoSection with a coreFloor combo + add/remove, reads perRepoOverrides (coreFloor only) + registeredRepos, writes ['models','byRepo',repoPath,'coreFloor'] / Clears ['models','byRepo',repoPath].

**Rejected because:** Partial on ac1: it leaves per-repo tasks/tiers uneditable AND invisible, contradicting the full-parity scope the user explicitly chose for this final story and reintroducing the blind spot the epic's reviews kept flagging.

## Open questions

- The per-repo tiers editor edits the daemon's free-string runner + model values (there is no sc1 enum domain for model names), so it uses text fields with no membership validation — an invalid runner/model is caught only at the daemon (SaveResult.Rejected). This matches k5 (the plugin owns no settings semantics) and is the accepted trade for full per-repo parity; surfaced for the user at LLD approval.

## Resolved questions

- `q70aa37ec` — The per-repo tiers editor edits the daemon's free-string runner + model values (there is no sc1 enum domain for model names), so it uses text fields with no membership validation — an invalid runner/model is caught only at the daemon (SaveResult.Rejected). This matches k5 (the plugin owns no settings semantics) and is the accepted trade for full per-repo parity; surfaced for the user at LLD approval.
  - **resolved**: A — Keep free-text, daemon is the only validator — Matches the LLD scope + k5 (plugin owns no settings semantics); SaveResult.Rejected already surfaces the daemon's authoritative error. A catalog runner/model domain (C) is an out-of-scope daemon change fileable as a follow-up; B is a later refinement on top of A. _(2026-09-20T08:56:54.800Z)_

## Citations

- **[[c1]]** `code` `src/config/analyze.ts:130 (TieringOverride) + src/config/__tests__/analyze-tiering.test.ts:21-51` — "models.byRepo = Record<repoPath, TieringOverride{ coreFloor?: TierName, tasks?/roleTiers?: Record<roleId,TierName>, tiers?: Record<tierName,{runner,model}> }>; coreFloor is a scalar tier, tasks is rol"
- **[[c2]]** `code` `src/config/config-catalog.ts + src/config/__tests__/config-reconcile.test.ts:322 (byRepo dynamic-key namespace)` — "models.byRepo.<repoPath>.{tiers,tasks,coreFloor} is a dynamic-key namespace; byRepo['/path'] = { coreFloor: 'core', tiers: { core: { runner: 'cli-claude' } } }."
- **[[c4]]** `code` `src/daemon/index.ts:1296 (config.show) + :535 (repo.list) + jetbrains-plugin/.../daemon/DaemonGateway.kt:585,639,631` — "config.show returns the raw config object directly (data.models.byRepo is the map); repo.list returns data.repos; config.write's ok lives in data['ok'] (classified at DaemonGateway.kt:585); the transp"
- **[[c5]]** `code` `src/config/write-path.ts + src/config/__tests__/write-path.test.ts:25,30 + jetbrains-plugin/.../daemon/DaemonGateway.kt (sc2)` — "sc2 writeSetting/clearSetting take a LITERAL List<String> so repoPath (and a dotted roleId) is one segment; toConfigSegments uses an array verbatim (a dotted element stays ONE segment); setConfigAtPat"
- **[[c7]]** `convention` `HLD constraint k5 / CLAUDE.md project principles` — "Changing which values are stored is the daemon's job; the plugin owns no settings semantics — the coreFloor/tasks tier domain (tierNames) + roles are daemon-derived (sc1), candidate repos come from re"
- **[[c8]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:303-394 (PerRoleRow/PerRoleOverridesModel) + PerRoleSection.kt:29-120` — "The S004 per-role editor (RoleState{saved,pending}, rows/setOverride/removeOverride/revert/isModified/collectWrites->PendingWrite(listOf('models','tasks',roleId))/onSaved; PerRoleSection combo + '(use"
