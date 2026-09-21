<!-- insrc:artifact PLAN-57298940cdc341bc-s1 -->

# Plan: E2026092157298940:S001

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**LLD run:** `wf-1789971334172-d6d5rr`
**LLD effective hash:** `7b17d6a14b2a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the abstract InsrcOpsConfigurable page-shell base (sc1) | S | — | unit: InsrcOpsConfigurable source-scan: abstract Configurable with pageTitle()/buildBody(), createComponent() uses executeOnPooledThread + disposed-guarded invokeLater + JBScrollPane over ScrollableColumn, and settings/InsrcSettingsConfigurable.kt is untouched | [[c1]] [[c3]] |
| 2 | **`t2`** Add the three empty-but-navigable child Configurables (sc1) | S | `t1` | unit: Child-Configurable source-scan: each of Daemon/Workflows/DebugConfigurable extends InsrcOpsConfigurable() and overrides pageTitle()/buildBody() with only a placeholder body | [[c1]] |
| 3 | **`t3`** Register the three child pages in plugin.xml under the unchanged parent (sc1, lc1/k4) | S | `t2` | unit: plugin.xml source-scan: exactly three child applicationConfigurables under parentId=ai.insors.insrc.settings (distinct ids + instances) and the parent element unchanged; smoke: gradlew buildPlugin succeeds (plugin descriptor validates with the three new children) | [[c1]] |
| 4 | **`t4`** Add DaemonStatusDto + DaemonStatusResult types (sc2) | S | — | unit: DaemonStatusResult three-state shape: a when() over Loaded/Stopped/Unavailable is exhaustive (compile-checked sealed interface) | [[c4]] [[c5]] |
| 5 | **`t5`** Implement daemonStatus() on the DaemonGateway interface + DaemonGatewayImpl (sc2) | S | `t4` | unit: daemonStatus() Loaded: a well-formed Gson-Double reply coerces to a DaemonStatusDto (uptimeSec/queueDepth Ints, repoCount=repos.size, optionals null, modelPullStatus default 'ready') and the request uses METHOD_STATUS with empty params; unit: daemonStatus() Stopped: a fake DaemonRpc that throws DaemonUnavailableException yields DaemonStatusResult.Stopped; unit: daemonStatus() Unavailable: a !ok/error reply and a malformed (non-numeric/non-map) reply both yield DaemonStatusResult.Unavailable without throwing; probe() classification is unchanged | [[c4]] [[c6]] |
| 6 | **`t6`** Add the daemonStatus() override to the other DaemonGateway implementations (sc2 fanout) | S | `t5` | smoke: gradlew test compiles + runs the full suite green after the daemonStatus() fanout (no missing-override / NoSuchMethodError) | [[c6]] [[c7]] |

### E2026092157298940:S001:T001 — Add the abstract InsrcOpsConfigurable page-shell base (sc1)

Create the new abstract class InsrcOpsConfigurable : com.intellij.openapi.options.Configurable that owns the shared shell: createComponent() builds a JBScrollPane over a ui/InsrcCollapsible.ScrollableColumn, runs the protected abstract buildBody() on ApplicationManager.getApplication().executeOnPooledThread, and mounts the result via a disposed-guarded invokeLater (a @Volatile disposed flag set in disposeUIResources()); getDisplayName() delegates to the protected abstract pageTitle(); isModified()=false + no-op apply()/reset() defaults; a buildBody() throw off the EDT renders a plain error label rather than propagating. Generalizes the existing InsrcSettingsConfigurable.createComponent() idiom WITHOUT editing that shipped file.

**Acceptance checks:**
- InsrcOpsConfigurable is abstract, extends com.intellij.openapi.options.Configurable, and exposes protected abstract pageTitle():String + buildBody():JComponent
- createComponent() calls executeOnPooledThread + a disposed-guarded invokeLater and wraps the body in a JBScrollPane over ui/InsrcCollapsible.ScrollableColumn
- a buildBody() exception is caught and rendered as an error label (never propagates to the EDT)
- settings/InsrcSettingsConfigurable.kt is byte-unchanged

### E2026092157298940:S001:T002 — Add the three empty-but-navigable child Configurables (sc1)

Add three no-arg subclasses — DaemonConfigurable, WorkflowsConfigurable, DebugConfigurable — each extending InsrcOpsConfigurable(), overriding pageTitle() (Daemon/Workflows/Debug) and buildBody() with a PLACEHOLDER body only (a simple 'coming soon'/label component). No page domain logic, no sc3 — those belong to S002/S003/S004.

**Acceptance checks:**
- DaemonConfigurable, WorkflowsConfigurable, DebugConfigurable each extend InsrcOpsConfigurable() with a no-arg constructor
- each overrides pageTitle() + buildBody() and its buildBody() returns only a placeholder component (no daemon/chain/debug domain logic)
- no reference to sc3 / DebugPageHost / lifecycle actions / chain reader

### E2026092157298940:S001:T003 — Register the three child pages in plugin.xml under the unchanged parent (sc1, lc1/k4)

Append three <applicationConfigurable parentId="ai.insors.insrc.settings" id="ai.insors.insrc.daemon|.workflows|.debug" instance="...DaemonConfigurable|WorkflowsConfigurable|DebugConfigurable"/> entries to the existing <extensions> block in META-INF/plugin.xml, leaving the parent <applicationConfigurable id=ai.insors.insrc.settings> element byte-unchanged.

**Acceptance checks:**
- plugin.xml contains exactly three new child applicationConfigurables with parentId=ai.insors.insrc.settings, distinct ids (ai.insors.insrc.daemon/.workflows/.debug), and the three instance= classes
- the parent <applicationConfigurable parentId=tools id=ai.insors.insrc.settings instance=...InsrcSettingsConfigurable/> element is unchanged
- buildPlugin succeeds (the descriptor is valid)

### E2026092157298940:S001:T004 — Add DaemonStatusDto + DaemonStatusResult types (sc2)

Add to daemon/DaemonGateway.kt the new data class DaemonStatusDto(running:Boolean, uptimeSec:Long, queueDepth:Int, embeddingsPending:Int, modelPullStatus:String, modelPullPct:Int?, lmdbFileSizeMb:Int?, repoCount:Int) and the sealed interface DaemonStatusResult { data class Loaded(status) ; data object Stopped ; data class Unavailable(reason) } — mirroring the existing RepoStatsResult/PendingQueryResult sealed-result idiom. Additive types only.

**Acceptance checks:**
- DaemonStatusDto has exactly the 8 realized fields (running/uptimeSec/queueDepth/embeddingsPending/modelPullStatus/modelPullPct/lmdbFileSizeMb/repoCount); no `socket` field
- DaemonStatusResult is a sealed interface with Loaded/Stopped(data object)/Unavailable(reason)
- no existing type is modified

### E2026092157298940:S001:T005 — Implement daemonStatus() on the DaemonGateway interface + DaemonGatewayImpl (sc2)

Add fun daemonStatus(): DaemonStatusResult to the DaemonGateway interface and implement it in DaemonGatewayImpl: rpc.call(METHOD_STATUS, emptyMap()); if(!r.ok||r.error!=null) Unavailable(reason) else Loaded(parseDaemonStatus(r.data)); catch DaemonUnavailableException → Stopped; catch RuntimeException → Unavailable. Add a private parseDaemonStatus that reuses the numberMap/str/(v as? Number)?.toInt()/toLong() coercion (repoCount = size of the repos[] list; modelPullStatus default 'ready'; absent modelPullPct/lmdbFileSizeMb → null). Leave probe() and METHOD_STATUS untouched (reuse the constant).

**Acceptance checks:**
- DaemonGateway interface declares fun daemonStatus(): DaemonStatusResult
- DaemonGatewayImpl.daemonStatus() reuses METHOD_STATUS with emptyMap(), classifies Stopped on DaemonUnavailableException and Unavailable on !ok/error/RuntimeException, else Loaded(parseDaemonStatus)
- parseDaemonStatus coerces Gson Doubles, derives repoCount from repos.size, defaults modelPullStatus to 'ready', and never throws
- the existing probe() read is unchanged

### E2026092157298940:S001:T006 — Add the daemonStatus() override to the other DaemonGateway implementations (sc2 fanout)

Add the daemonStatus() override to the 5 other DaemonGateway implementations so the interface addition compiles: a delegating/thin impl in DaemonGatewayService (daemon/DaemonGatewayService.kt), and a trivial stub (e.g. DaemonStatusResult.Unavailable("not used") or Stopped) in each of the 4 test fakes (DaemonLifecycleServiceTest, OnboardingLifecycleTest, OnboardingWiringTest, OnboardingCleanupIntegrationTest) — exactly the fanout the repoStats()/registerProject() additions required.

**Acceptance checks:**
- DaemonGatewayService and all 4 onboarding/lifecycle test fakes compile with a daemonStatus() override
- the fakes' overrides are trivial stubs (no real socket use)
- the full suite compiles (no NoSuchMethodError / missing-override error)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Loaded on a well-formed reply (Doubles coerced; repoCount=repos.size; optionals null; modelPullStatus default 'ready') | `t5` |
| Stopped when the fake throws DaemonUnavailableException | `t5` |
| Unavailable when !ok/error or malformed | `t5` |
| request uses METHOD_STATUS with empty params; probe() unchanged | `t5` |
| plugin.xml declares three child applicationConfigurables under parentId=ai.insors.insrc.settings with the three ids + instances | `t3` |
| the parent applicationConfigurable + InsrcSettingsConfigurable.kt are unchanged | `t3`, `t1` |
| InsrcOpsConfigurable base uses executeOnPooledThread + guarded invokeLater + disposed guard + JBScrollPane over ScrollableColumn | `t1` |
| each child extends InsrcOpsConfigurable() and overrides pageTitle()/buildBody() | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 sc1 — nested-Configurable registration + child pages (InsrcOpsConfigurable base + Daemon/Workflows/DebugConfigurable under parentId=ai.insors.insrc.settings, parent untouched)`
- **[[c3]]** `analyze-bundle` `s1 convention.detect — settings/InsrcSettingsConfigurable.kt:72 createComponent() off-EDT (executeOnPooledThread) + guarded invokeLater + JBScrollPane idiom the base generalizes; ui/InsrcCollapsible.ScrollableColumn`
- **[[c4]]** `prior-artifact` `LLD s1 sc2 — DaemonStatusDto/DaemonStatusResult data model + daemonStatus() contract (dataModelChanges)`
- **[[c5]]** `analyze-bundle` `s1 external-contract — src/shared/types.ts:882 DaemonStatus payload (uptime/repos[]/queueDepth/embeddingsPending/modelPullStatus/modelPullPct/lmdbFileSizeMb) the DTO is realized to`
- **[[c6]]** `analyze-bundle` `s1 reuse.map — DaemonGateway.kt: METHOD_STATUS(:872)/probe(:552), interface DaemonRpc(:526)/DaemonResult(:538), repoStats() classification + numberMap coercion idiom daemonStatus() clones`
- **[[c7]]** `analyze-bundle` `s1 reuse.map — the 6 DaemonGateway impls needing the override (DaemonGatewayService.kt:27 + 4 test fakes: DaemonLifecycleServiceTest:41, OnboardingLifecycleTest:64, OnboardingWiringTest:57, OnboardingCleanupIntegrationTest:61)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-21T08:04:37.467Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t6 | inventory | LOW | manual | There are exactly 6 DaemonGateway implementations that each override every interface method (so all 6 must gain daemonStatus()): DaemonGatewayImpl + DaemonGatewayService (production) and 4 test fakes (DaemonLifecycleServiceTest, OnboardingLifecycleTest, OnboardingWiringTest, OnboardingCleanupIntegrationTest) — i.e. t5 covers DaemonGatewayImpl and t6 covers the other 5. | grep 'override fun repoStats(projectRootPath: String): RepoStatsResult' returns EXACTLY 6 source matches: DaemonGateway.kt:605 (DaemonGatewayImpl, t5) + DaemonGatewayService.kt:27 + the 4 test fakes (DaemonLifecycleServiceTest:41, OnboardingCleanupIntegrationTest:61, OnboardingLifecycleTest:64, OnboardingWiringTest:57). read DaemonGatewayService.kt:27 found:true. The t6 fanout count (5 others) is exact. |  |
| t6 | citation | LOW | manual | The 4 test fakes that implement DaemonGateway and will need the daemonStatus() stub are in DaemonLifecycleServiceTest.kt, OnboardingLifecycleTest.kt, OnboardingWiringTest.kt, and OnboardingCleanupIntegrationTest.kt. | The 4 named test-fake files each carry an override fun repoStats( at the cited lines (read OnboardingWiringTest.kt:57 found:true); the extra grep hit is this LLD's own doc table, not a 5th fake. |  |
| t5 | citation | LOW | manual | DaemonGatewayImpl.repoStats() (the classification template t5 clones) and METHOD_STATUS='daemon.status' both exist in DaemonGateway.kt, and daemonStatus() is not yet present. | read DaemonGateway.kt:605 found:true (repoStats template); grep confirms const val METHOD_STATUS = "daemon.status" at :872; fun daemonStatus( appears only in the HLD/LLD docs — confirming t5 adds a genuinely new method cloning the repoStats() classification. |  |
| t3 | citation | LOW | manual | The parent applicationConfigurable id=ai.insors.insrc.settings exists in plugin.xml, so t3 appends three child entries under it without editing the parent. | read plugin.xml:289 found:true = '<applicationConfigurable'; the source descriptor (src/main/resources/META-INF/plugin.xml:291) carries id=ai.insors.insrc.settings under parentId=tools — the parent t3 appends children to without editing. |  |
| t1 | citation | LOW | manual | The off-EDT createComponent() idiom (executeOnPooledThread + invokeLater) t1 generalizes lives in InsrcSettingsConfigurable.kt, and ui/InsrcCollapsible.kt provides the ScrollableColumn the base wraps. | read InsrcSettingsConfigurable.kt:72 found:true (createComponent); grep confirms executeOnPooledThread there and class ScrollableColumn in ui/InsrcCollapsible.kt — the off-EDT idiom + scroll primitive t1 generalizes both exist. |  |
