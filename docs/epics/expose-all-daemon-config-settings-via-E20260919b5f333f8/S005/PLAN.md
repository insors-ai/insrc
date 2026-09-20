<!-- insrc:artifact PLAN-b5f333f8d7ba421b-s5 -->

# Plan: E20260920b5f333f8:S005

**Epic:** `expose-all-daemon-config-settings-via`
**LLD run:** `wf-1789893931492-5qsnq2`
**LLD effective hash:** `ee39a9f5fd11...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Gateway reads + DTOs (perRepoOverrides over config.show, registeredRepos over repo.list) | M | — | unit: PerRepoOverridesGatewayTest: perRepoOverrides parses the full data.models.byRepo shape (coreFloor + tasks + tiers{runner,model}) over FakeDaemonRpc; missing/non-map/non-string -> Loaded empty/skip/null; DaemonUnavailable -> Unavailable; unit: PerRepoOverridesGatewayTest: registeredRepos parses repo.list data.repos over FakeDaemonRpc; !ok/error/DaemonUnavailable -> Unavailable; unit: PerRepoOverridesGatewayTest (WireRpc): over real UnixSocketDaemonRpc.parse a config.show reply yields the full nested byRepo Loaded and a repo.list reply yields Loaded repos | [[c4]] [[c1]] [[c2]] |
| 2 | **`t2`** Pure PerRepoOverridesModel + PerRepoRow + TierField (leaf-granular collectWrites) | L | `t1` | unit: PerRepoOverridesModelTest: rows() shows coreFloor + task map + tiers map + hasOverride; addableRepos() = registered minus overridden; a repo in current but not registered is a row not addable; unit: PerRepoOverridesModelTest: collectWrites coreFloor/tasks/tiers emit leaf-granular Set/Clear at the exact nested arrays with a DOTTED/SLASHED repoPath + dotted roleId each ONE segment; a tier's runner/model are two independent leaves; unit: PerRepoOverridesModelTest: per-key isolation (one changed leaf -> one PendingWrite); whole-override removal -> ONE Clear at [models,byRepo,repoPath]; same-value not dirty; clear-of-unset / add-then-revert no-op; onSaved advances only the saved leaf/repo | [[c5]] [[c8]] [[c1]] |
| 3 | **`t3`** PerRepoSection : SettingsSection + host registration (register-only) | M | `t2` | unit: InsrcSettingsConfigurableTest (source-scan): PerRepoSection applies via gateway.writeSetting/clearSetting with listOf('models','byRepo',...), never a raw config.write string, throws ConfigurationException on not-Saved; unit: InsrcSettingsConfigurableTest (source-scan): PerRepoSection renders the coreFloor combo + per-role task combos + per-tier runner+model fields driven from model.rows()/model.tierNames() with no hardcoded repo/role/tier literal; unit: InsrcSettingsConfigurableTest (source-scan): the host builds + registers a PerRepoSection into the existing sections list and createComponent reads perRepoOverrides + registeredRepos | [[c8]] |
| 4 | **`t4`** Test suite + JDK21 local gate | M | `t3` | unit: Full jetbrains-plugin suite green on JDK21 via ./gradlew test (PerRepoOverridesModelTest + PerRepoOverridesGatewayTest + InsrcSettingsConfigurableTest additions), no backtick-';' compile break | [[c1]] [[c4]] [[c5]] [[c8]] |

### E20260920b5f333f8:S005:T001 — Gateway reads + DTOs (perRepoOverrides over config.show, registeredRepos over repo.list)

Add PerRepoOverridesResult (Loaded(Map<String,RepoOverrideDto>)|Unavailable) + RegisteredReposResult (Loaded(List<String>)|Unavailable) + RepoOverrideDto {coreFloor:String?, tasks:Map<String,String>, tiers:Map<String,TierSpecDto>} + TierSpecDto {runner:String?, model:String?} sealed/data types in the daemon package. Implement perRepoOverrides() on DaemonGatewayImpl over the EXISTING config.show IPC (METHOD_CONFIG_SHOW), parsing data.models.byRepo per-level with as? Map / string-cast guards (coreFloor String? or null; tasks string tiers only; tiers map of {runner,model} string leaves only; missing/non-map -> Loaded empty/skip; DaemonUnavailable/RuntimeException -> Unavailable, never throws). Implement registeredRepos() over the EXISTING repo.list (METHOD_REPO_LIST) coercing data.repos -> List<String> (!ok/result.error/thrown -> Unavailable). Add both to the DaemonGateway interface + DaemonGatewayService delegates + stubs in the 4 test doubles (DaemonLifecycleServiceTest, OnboardingCleanupIntegrationTest, OnboardingWiringTest, OnboardingLifecycleTest) so the module still compiles.

**Acceptance checks:**
- perRepoOverrides() reads config.show and returns Loaded parsing the full models.byRepo entry (coreFloor + tasks map + tiers map of {runner,model}); missing/non-map/non-string -> Loaded empty/skip/null; DaemonUnavailable -> Unavailable
- registeredRepos() reads repo.list and returns Loaded(data.repos as List<String>); !ok/error/DaemonUnavailable -> Unavailable
- DaemonGateway interface + DaemonGatewayService + all 4 test doubles gain both methods; the module compiles

### E20260920b5f333f8:S005:T002 — Pure PerRepoOverridesModel + PerRepoRow + TierField (leaf-granular collectWrites)

Add the headless PerRepoOverridesModel(registeredRepos, roles, tierNames, current) with internal RepoState (saved+pending for coreFloor + tasks map + tiers map, added/removed flag), plus PerRepoRow {repoPath, coreFloor?, tasks, tiers, hasOverride} and enum TierField{Runner,Model}, reusing PendingWrite/WriteOp from S003. Implement rows()/addableRepos()/addOverride/removeOverride/setCoreFloor/setTaskTier/setTierField/revert/isModified/collectWrites/onSaved. collectWrites emits ONE PendingWrite per changed LEAF at its literal nested segment array (coreFloor at [models,byRepo,repoPath,coreFloor]; a task at [...,tasks,roleId]; a tier field at [...,tiers,tierName,runner|model]) and a whole-override removal as ONE Clear at [models,byRepo,repoPath]; repoPath + dotted roleId each ONE literal segment; same-value not dirty; clear-of-unset / add-then-revert a no-op. Mirror-references the S004 PerRoleOverridesModel shape (not re-implementing s4).

**Acceptance checks:**
- rows() lists overridden/just-added repos with coreFloor + tasks + tiers + hasOverride; addableRepos() = registered minus overridden
- collectWrites emits leaf-granular Set/Clear PendingWrites at the exact nested [models,byRepo,repoPath,...] arrays with repoPath + dotted roleId each ONE segment; per-key isolation (one changed leaf -> one write)
- whole-override removal -> ONE Clear at [models,byRepo,repoPath]; same-value not dirty; add-then-revert / clear-of-unset no-op; onSaved advances only the saved leaf/repo

### E20260920b5f333f8:S005:T003 — PerRepoSection : SettingsSection + host registration (register-only)

Add PerRepoSection(model, gateway) : SettingsSection rendering an add-repo picker of addableRepos() + one nested panel per overridden repo (a coreFloor JComboBox, a per-role tier combo grid mirroring PerRoleSection with a '(use default)' sentinel = clear the task, a per-tier runner+model JTextField pair) + a remove-override control; rows/tiers come from model.rows()/model.tierNames() (no hardcoded repo/role/tier). apply() runs off the EDT (host modal block) writing each collectWrites leaf via gateway.writeSetting/clearSetting, onSaved per Saved leaf, aggregating not-Saved (by repoPath+key) into one ConfigurationException; isModified/reset delegate to the model. Register a PerRepoSection into InsrcSettingsConfigurable's EXISTING sections list at its Loaded section-build point (createComponent's off-EDT read also fetches perRepoOverrides() + registeredRepos()); placeholder + no section when a read is Unavailable. No host fan-out machinery change.

**Acceptance checks:**
- PerRepoSection renders the coreFloor combo + per-role task combos + per-tier runner/model fields + add/remove, all driven from the model; applies via gateway.writeSetting/clearSetting with the literal segment list (never a raw config.write string) and throws ConfigurationException on not-Saved
- InsrcSettingsConfigurable builds + registers a PerRepoSection into the existing sections list; createComponent reads perRepoOverrides + registeredRepos; an Unavailable read -> placeholder + no section
- The per-repo section rides the existing off-EDT apply/isModified/reset fan-out with no host-machinery change

### E20260920b5f333f8:S005:T004 — Test suite + JDK21 local gate

Add PerRepoOverridesModelTest (rows/addableRepos, leaf-granular collectWrites for coreFloor/tasks/tiers incl. a DOTTED/SLASHED repoPath + dotted roleId as ONE segment, per-key isolation, whole-override single-Clear, same-value-not-dirty, add-then-revert, onSaved, unregistered-overridden-repo); a gateway test (FakeDaemonRpc + WireRpc over the real UnixSocketDaemonRpc.parse) proving perRepoOverrides parses the full nested byRepo shape and registeredRepos parses repo.list, with Unavailable paths; and extend the Configurable source-scan test to assert the PerRepoSection render + gateway-segment-list apply + host registration. Run ./gradlew test on JDK21 and confirm green.

**Acceptance checks:**
- PerRepoOverridesModelTest covers ac1/ac2/ac3 (rows/addableRepos, nested-key writes + isolation, edit/clear/whole-override + onSaved + same-value-not-dirty)
- gateway test proves the full-shape config.show parse + repo.list parse over Fake + real WireRpc parse, incl. Unavailable
- source-scan asserts PerRepoSection's three nested editors + segment-list apply + host registration; ./gradlew test green on JDK21 with no backtick-';' compile break

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| rows(): an overridden repo shows its coreFloor + task map + tiers map + hasOverride; addableRepos() = registered minus overridden (ac1) | `t2` |
| dirty: same coreFloor/task/tier-field value not dirty; clear-of-unset / add-then-revert no-op | `t2` |
| collectWrites coreFloor -> Set/Clear at listOf('models','byRepo',repoPath,'coreFloor') | `t2` |
| collectWrites tasks -> Set/Clear at listOf('models','byRepo',repoPath,'tasks',roleId) with a DOTTED roleId ONE segment (ac2/ac3, k4) | `t2` |
| collectWrites tiers -> Set/Clear at listOf('models','byRepo',repoPath,'tiers',tierName,'runner'\|'model') (TWO independent leaves); setting only one leaf writes only that leaf | `t2` |
| per-key isolation: one changed leaf -> exactly one PendingWrite; other repos + untouched leaves absent | `t2` |
| whole-override removal -> ONE Clear at listOf('models','byRepo',repoPath); onSaved(repoPath segments) drops the repo | `t2` |
| DOTTED/SLASHED repoPath ONE literal segment across coreFloor/tasks/tiers writes | `t2` |
| a repo in current but not registered is a row, not in addableRepos | `t2` |
| perRepoOverrides: Loaded from data.models.byRepo parsing coreFloor + tasks map + tiers map of {runner,model}; missing/non-map -> Loaded empty/skip; non-string leaf -> omitted/null; DaemonUnavailable -> Unavailable | `t1` |
| registeredRepos: Loaded from repo.list data.repos; !ok/result.error/DaemonUnavailable -> Unavailable | `t1` |
| WireRpc over real UnixSocketDaemonRpc.parse: {result:{models:{byRepo:{'/p/a.b':{coreFloor:'core',tasks:{review:'core'},tiers:{core:{runner:'cli-claude',model:'opus'}}}}}}} -> Loaded full shape; {result:{repos:[...]}} -> Loaded | `t1` |
| PerRepoSection applies via gateway.writeSetting/clearSetting with listOf('models','byRepo',...) not a raw config.write/dotted string; throws ConfigurationException on not-Saved | `t3` |
| PerRepoSection renders all three nested editors (coreFloor combo, per-role task combos, per-tier runner+model fields) driven from model.rows()/model.tierNames() — no hardcoded repo/role/tier literal | `t3` |
| InsrcSettingsConfigurable builds + registers a PerRepoSection into the existing sections list (createComponent reads perRepoOverrides + registeredRepos) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 citation c1 (src/config/analyze.ts:130 TieringOverride + analyze-tiering.test.ts) — per-repo override = {coreFloor scalar, tasks role->tier, tiers tier->{runner,model}}` — "models.byRepo = Record<repoPath, TieringOverride{ coreFloor?, tasks?, tiers?: Record<tierName,{runner,model}> }>."
- **[[c2]]** `prior-artifact` `LLD s5 citation c2 (src/config/config-catalog.ts + config-reconcile.test.ts:322) — models.byRepo.<repoPath> dynamic-key namespace with a tiers object` — "byRepo['/path'] = { coreFloor: 'core', tiers: { core: { runner: 'cli-claude' } } }."
- **[[c4]]** `prior-artifact` `LLD s5 citation c4 (src/daemon/index.ts:1296 config.show + :535 repo.list + DaemonGateway.kt:585,631,639) — the reads' IPCs + data['ok'] framing` — "config.show returns the raw config object (data.models.byRepo); repo.list returns data.repos; config.write ok lives in data['ok']."
- **[[c5]]** `prior-artifact` `LLD s5 citation c5 (src/config/write-path.ts + write-path.test.ts:25,30 + DaemonGateway.kt sc2) — literal segment array, dotted key one segment` — "writeSetting/clearSetting take a LITERAL List<String> so repoPath (and a dotted roleId) is one segment; setConfigAtPath sets/removes only that leaf."
- **[[c8]]** `prior-artifact` `LLD s5 citation c8 (SettingsView.kt:303-394 PerRoleRow/PerRoleOverridesModel + PerRoleSection.kt:29-120) — the S004 per-role editor mirror-reference + sc3 host glue` — "The S004 per-role editor (RoleState{saved,pending}, collectWrites->PendingWrite, PerRoleSection combo + off-EDT apply) is the mirror-reference for s5's per-repo tasks editor; InsrcSettingsConfigurable"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T09:02:02.628Z

_No load-bearing premises were extracted._
