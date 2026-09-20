<!-- insrc:artifact PLAN-4c7992cc0f79ef2a-S001 -->

# Plan: E202609204c7992cc:S001

**Epic:** `jetbrains-plugin-add-insrc-entry-project`
**LLD run:** `wf-1789923781696-2z38yg`
**LLD effective hash:** `4c7992cc0f79...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add value types + companion constants | S | — | unit: RepoStatsResult is a sealed two-state (Loaded/Unavailable) and RepoStatsDto/SteeringSelection compile with the LLD field types (covered indirectly by the t6 gateway/parse tests that construct them) | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Add DaemonGateway.repoStats + parseRepoStats + service delegate | M | `t1` | unit: repoStats(root): a Gson-Double-shaped data map → RepoStatsResult.Loaded with coerced Int/Long + Map<String,Int>; unit: repoStats(root): framed {error} / DaemonUnavailableException / malformed reply → Unavailable (never throws); unit: repoStats(root): the fake rpc records METHOD_REPO_STATS and params {repoPath: root}; unit: parseRepoStats: Double→Int/Long, nested maps→Map<String,Int>, absent optionals→null, unknown status verbatim, empty maps | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Extend registerProject to forward steering | S | `t1` | unit: registerProject(root, SteeringSelection(true,false)): fake rpc records METHOD_REPO_ADD params path=root AND steering={claude:true,agents:false}; unit: registerProject(root, null) and registerProject(root): NO steering key in the recorded params (backward-compat); unit: registerProject: r.ok=true→registered=true; r.ok=false→registered=false+reason; DaemonUnavailableException still propagates | [[c1]] |
| 4 | **`t4`** Add ShowOrRegisterRepoAction + first plugin.xml <actions> block | S | `t2`, `t3` | unit: source-scan: plugin.xml registers <action> class=...ShowOrRegisterRepoAction with <add-to-group group-id=ProjectViewPopupMenu>; still <depends> only com.intellij.modules.platform; unit: source-scan: ShowOrRegisterRepoAction source shows getActionUpdateThread=BGT, basePath null/blank disable, 'Show Repo status'/'Register Repo' labels, try/catch around the probe | [[c4]] |
| 5 | **`t5`** Add RepoStatusDialog + RegisterRepoDialog | M | `t2`, `t3` | unit: source-scan: RepoStatusDialog reads gateway.repoStats via executeOnPooledThread+invokeLater and renders both Loaded (rich fields) and Unavailable branches; unit: source-scan: RegisterRepoDialog has a read-only root + two JCheckBoxes, calls registerProject(root, SteeringSelection(...)) off the EDT, and does NOT close-as-success on failure; reuses the 'insrc' NotificationGroup | [[c3]] [[c1]] |
| 6 | **`t6`** Add unit + source-scan tests | M | `t2`, `t3`, `t4`, `t5` | unit: The full gateway + parse unit suite and the action/plugin.xml/dialogs source-scan suite named on t2–t5 are authored and pass | [[c2]] [[c3]] [[c4]] |
| 7 | **`t7`** Verify locally (gradlew test buildPlugin) | S | `t6` | smoke: gradlew test buildPlugin (JDK21, --no-build-cache) is green and produces the plugin ZIP | [[c2]] |

### E202609204c7992cc:S001:T001 — Add value types + companion constants

Add to the daemon package: RepoStatsDto (data class mirroring RepoStats 1:1 — repoPath/status:String, lastIndexed?/errorMsg?:String?, addedAt:String, fileCount/entityCount/relationCount/pendingJobs:Int, sizeBytes:Long, filesByLanguage/entityCountByKind:Map<String,Int>); the sealed interface RepoStatsResult { Loaded(stats) | Unavailable(reason) }; the plugin-side SteeringSelection(claude:Boolean, agents:Boolean); and the companion constants METHOD_REPO_STATS="repo.stats", PARAM_REPO_PATH="repoPath" (the repo.stats request key — the daemon handler reads params.repoPath, NOT the existing PARAM_REPO="repo"), and PARAM_STEERING="steering". Purely additive, no existing type touched.

**Acceptance checks:**
- RepoStatsDto declares every RepoStats field with Int/Long/Map<String,Int>/String? types matching the LLD.
- RepoStatsResult is a sealed interface with exactly Loaded(stats: RepoStatsDto) and Unavailable(reason: String).
- SteeringSelection(claude:Boolean, agents:Boolean) exists plugin-side.
- METHOD_REPO_STATS="repo.stats", PARAM_REPO_PATH="repoPath", and PARAM_STEERING="steering" constants are declared in the DaemonGatewayImpl companion.

### E202609204c7992cc:S001:T002 — Add DaemonGateway.repoStats + parseRepoStats + service delegate

Add fun repoStats(projectRootPath: String): RepoStatsResult to the interface and DaemonGatewayImpl: rpc.call(METHOD_REPO_STATS, mapOf(PARAM_REPO_PATH to projectRootPath)) — the key MUST be "repoPath". Classify !r.ok||r.error!=null → Unavailable(reason) else Loaded(parseRepoStats(r.data)); wrap in the DaemonUnavailableException + RuntimeException try/catch (never throws). Add a private parseRepoStats companion helper coercing Gson Double→Int/Long and nested Map<*,*>→Map<String,Int>, absent optionals→null, unknown status verbatim. Add the delegating override in DaemonGatewayService.

**Acceptance checks:**
- repoStats calls rpc with METHOD_REPO_STATS and params carrying the repoPath key (not "repo").
- repoStats classifies a framed {error}/unreachable/malformed reply to Unavailable and never throws.
- parseRepoStats coerces Double→Int/Long and nested maps to Map<String,Int>, leaving absent optionals null and an unknown status verbatim.
- DaemonGatewayService delegates repoStats so it still compiles as a DaemonGateway.

### E202609204c7992cc:S001:T003 — Extend registerProject to forward steering

Change registerProject to registerProject(projectRootPath: String, steering: SteeringSelection? = null): RegistrationResult; when steering != null build mapOf(PARAM_PATH to root, PARAM_STEERING to mapOf("claude" to steering.claude, "agents" to steering.agents)) else the existing path-only map; keep the r.ok classification + DaemonUnavailableException throw. Update the DaemonGatewayService delegate. Nullable-default = backward-compatible. SteeringSelection(false,false) sends both-false (daemon no-op); null sends NO steering key.

**Acceptance checks:**
- registerProject(root, SteeringSelection(true,false)) sends repo.add params with steering={claude:true,agents:false}.
- registerProject(root, SteeringSelection(false,false)) sends steering={claude:false,agents:false} (daemon no-op).
- registerProject(root) / registerProject(root, null) sends NO steering key (existing callers unchanged).
- The nullable-default param compiles against the existing onboarding call site with no edit.

### E202609204c7992cc:S001:T004 — Add ShowOrRegisterRepoAction + first plugin.xml <actions> block

Add ShowOrRegisterRepoAction (package ai.insors.insrc.jetbrains.actions) extending AnAction: getActionUpdateThread()=ActionUpdateThread.BGT; update() reads e.project?.basePath (null/blank → isEnabledAndVisible=false) then isProjectRegistered(root) in try/catch → 'Show Repo status' vs 'Register Repo' (DaemonUnavailableException → 'Register Repo', enabled); actionPerformed(e) opens RepoStatusDialog or RegisterRepoDialog. Register it in the FIRST plugin.xml <actions> block with <add-to-group group-id=ProjectViewPopupMenu anchor=last>, keeping <depends> platform-only.

**Acceptance checks:**
- ShowOrRegisterRepoAction overrides getActionUpdateThread()=BGT and sets the dynamic label from isProjectRegistered, disabling on null/blank basePath, catching DaemonUnavailableException.
- plugin.xml has an <actions> block with the action added to ProjectViewPopupMenu and still <depends> only com.intellij.modules.platform.

### E202609204c7992cc:S001:T005 — Add RepoStatusDialog + RegisterRepoDialog

Add RepoStatusDialog (DialogWrapper 'insrc — Repo status'): loading placeholder → executeOnPooledThread { gateway.repoStats(root) } → invokeLater (guarded) render Loaded rich fields (status/lastIndexed/addedAt/fileCount/sizeBytes/entityCount/relationCount/pendingJobs/filesByLanguage/entityCountByKind/errorMsg) vs Unavailable message; OK-only. Add RegisterRepoDialog (DialogWrapper 'insrc — Register Repo'): read-only root field + two JCheckBoxes (CLAUDE.md/AGENTS.md, default off) + Register runs gateway.registerProject(root, SteeringSelection(claude,agents)) off the EDT catching DaemonUnavailableException; registered=true → close + success via the EXISTING 'insrc' NotificationGroup, else keep open + show reason (no close-as-success on failure).

**Acceptance checks:**
- RepoStatusDialog reads repoStats off the EDT (executeOnPooledThread+invokeLater guarded) and renders the rich fields on Loaded / a distinct message on Unavailable.
- RegisterRepoDialog shows a read-only root + two steering checkboxes, calls registerProject off the EDT, and does NOT close-as-success on registered=false / DaemonUnavailableException.
- The success notification reuses the existing 'insrc' NotificationGroup (no new declaration).

### E202609204c7992cc:S001:T006 — Add unit + source-scan tests

Add the fake-DaemonRpc gateway unit tests + the pure parseRepoStats boundary-type unit test + the source-scan tests named on t2–t5. Reuses the Sc2DaemonGatewayTest (fake DaemonRpc recording method+params) and InsrcSettingsConfigurableTest (File.readText source-scan) idioms.

**Acceptance checks:**
- Gateway unit tests assert repoStats records the repoPath key + classification + parseRepoStats boundary types + registerProject steering(true/false-false/null) backward-compat against a fake DaemonRpc.
- Source-scan tests assert the plugin.xml action registration + platform-only depends, the action's BGT/dynamic label/try-catch, and the dialogs' off-EDT/no-close-as-success wiring.

### E202609204c7992cc:S001:T007 — Verify locally (gradlew test buildPlugin)

Run cd jetbrains-plugin && JAVA_HOME=<corretto-21> ./gradlew test buildPlugin --console=plain --no-build-cache --no-configuration-cache (cache OFF because the registerProject signature + RepoStatsDto ctor changed — stale cache → NoSuchMethodError). All tests green + the plugin ZIP builds. NO GitHub CI.

**Acceptance checks:**
- gradlew test buildPlugin runs with --no-build-cache and reports all tests green.
- buildPlugin produces the plugin distribution ZIP without error.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| repoStats: a Gson-Double-shaped data map → RepoStatsResult.Loaded with correctly coerced Int/Long fields and Map<String,Int> maps | `t2`, `t6` |
| repoStats: a DaemonResult(ok=false, error='not a registered repo') → Unavailable(reason) | `t2`, `t6` |
| repoStats: a DaemonUnavailableException → Unavailable (never thrown); a malformed field → Unavailable via the RuntimeException catch | `t2`, `t6` |
| repoStats: the fake rpc is called with METHOD_REPO_STATS and params carrying repoPath=the projectRootPath | `t2`, `t6` |
| registerProject(root, SteeringSelection(true,false)): the fake rpc records METHOD_REPO_ADD params carrying path=root AND steering=mapOf('claude' to true,'agents' to false) | `t3`, `t6` |
| registerProject(root, null) and registerProject(root): NO steering key in the params (backward-compatible zero-steering path) | `t3`, `t6` |
| registerProject: r.ok=true → registered=true; r.ok=false → registered=false+reason; DaemonUnavailableException still propagates | `t3`, `t6` |
| plugin.xml registers an <action> with class ai.insors.insrc.jetbrains.actions.ShowOrRegisterRepoAction and <add-to-group group-id="ProjectViewPopupMenu"> | `t4`, `t6` |
| ShowOrRegisterRepoAction: getActionUpdateThread=BGT; update() reads basePath and disables when null/blank; sets 'Show Repo status' vs 'Register Repo'; wraps the probe in try/catch | `t4`, `t6` |
| RepoStatusDialog: reads gateway.repoStats OFF the EDT (executeOnPooledThread + invokeLater), renders Loaded vs Unavailable, references the rich fields | `t5`, `t6` |
| RegisterRepoDialog: read-only root + two JCheckBoxes (CLAUDE.md/AGENTS.md) + Register calls registerProject(root, SteeringSelection(...)) off the EDT and does NOT close-as-success on failure | `t5`, `t6` |
| plugin.xml still <depends> ONLY com.intellij.modules.platform | `t4`, `t6` |
| parseRepoStats: sizeBytes 1024.0 (Double) → Long 1024; fileCount 3.0 → Int 3 | `t2`, `t6` |
| parseRepoStats: lastIndexed/errorMsg absent → null | `t2`, `t6` |
| parseRepoStats: unknown status string → verbatim String | `t2`, `t6` |
| parseRepoStats: empty filesByLanguage/entityCountByKind → empty maps | `t2`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 — DaemonGateway.repoStats + registerProject(steering) APIs; RepoStatsDto/RepoStatsResult/SteeringSelection types; companion constants; onboarding backward-compat` — "fun registerProject(projectRootPath: String, steering: SteeringSelection? = null): RegistrationResult"
- **[[c2]]** `prior-artifact` `LLD S001 — RepoStatsDto Gson-Double/nested-Map coercion + the repo.stats/repo.add wire contract (repoPath key)` — "Numbers are coerced from Gson Double; the two Record<string,number> maps parse to Map<String,Int> via (v as? Number)?.toInt()"
- **[[c3]]** `prior-artifact` `LLD S001 — error paths + off-EDT idiom + sealed-result framing (UnixSocketDaemonRpc.parse classifies !r.ok||r.error, executeOnPooledThread+invokeLater guarded)` — "All daemon I/O happens OFF the EDT (executeOnPooledThread) with the render marshalled back via invokeLater guarded on a still-live component"
- **[[c4]]** `prior-artifact` `LLD S001 — the first plugin.xml <actions> block on ProjectViewPopupMenu + platform-only depends + BGT action` — "The FIRST <actions> block: <action id="ai.insors.insrc.ShowOrRegisterRepo" class="ai.insors.insrc.jetbrains.actions.ShowOrRegisterRepoAction"><add-to-group group-id="ProjectViewPopupMenu" anchor="last"
- **[[c5]]** `analyze-bundle` `s1 test.locate — fake-DaemonRpc gateway unit idiom (Sc2DaemonGatewayTest) + File.readText source-scan idiom (InsrcSettingsConfigurableTest)` — "construct DaemonGatewayImpl(fakeRpc) ... assert the sealed-result classification ... a pure DTO-parse test over a Gson-shaped Map"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-09-20T17:23:40.596Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1/t2 | external-contract | LOW | manual | The daemon repo.stats handler reads its request param as `repoPath` (not `repo`), so the plan's new PARAM_REPO_PATH="repoPath" is the correct request key. | CONFIRMED: src/daemon/index.ts:546 `const { repoPath } = (params ?? {})` and :545 the 'repo.stats' handler; the shipped LLD signature is `(params?: { repoPath?: string })`. The plan's PARAM_REPO_PATH="repoPath" is the correct request key. | none — verified sound. |
| t1/t2 | citation | LOW | manual | The existing DaemonGatewayImpl companion defines PARAM_REPO="repo" (distinct from the repoPath key repo.stats needs) and PARAM_PATH="path" (repo.add's key) — so reusing PARAM_REPO for repo.stats would be wrong, confirming the plan's need for a new PARAM_REPO_PATH. | CONFIRMED: DaemonGateway.kt:795 PARAM_REPO="repo", :793 PARAM_PATH="path", and grep for PARAM_REPO_PATH returns 0 — so repo.stats needs the NEW constant the plan adds; reusing PARAM_REPO would send the wrong key. | none — verified sound (the plan's PARAM_REPO_PATH addition is exactly right). |
| t3 | citation | LOW | manual | registerProject today calls repo.add with a path-only map and returns RegistrationResult, so extending it with a nullable-default steering param is an additive change over the existing impl. | CONFIRMED: DaemonGateway.kt:524 `override fun registerProject(projectRootPath: String): RegistrationResult` and :525 `rpc.call(METHOD_REPO_ADD, mapOf(PARAM_PATH to projectRootPath))` (path-only). The nullable-default steering param is additive; the test FakeGateways override the current single-arg signature (they will compile against a default-arg overload). | none — verified sound. |
| t5 | citation | LOW | manual | The 'insrc' BALLOON NotificationGroup the RegisterRepoDialog success path reuses already exists in plugin.xml (no new declaration needed). | CONFIRMED: src/main/resources/META-INF/plugin.xml:245 `<notificationGroup id="insrc" displayType="BALLOON"/>` — the dialog reuses it, no new declaration. | none — verified sound. |
| t6 | citation | LOW | manual | The two test idioms the plan reuses exist: the fake-DaemonRpc gateway unit test (Sc2DaemonGatewayTest) and the File.readText source-scan test (InsrcSettingsConfigurableTest). | CONFIRMED: Sc2DaemonGatewayTest.kt:17 and InsrcSettingsConfigurableTest.kt:19 both exist — the two reused test idioms are real. | none — verified sound. |
| tasks | ordering | LOW | manual | The task DAG is acyclic and topologically ordered: t1 has no deps; t2,t3 depend on t1; t4,t5 depend on t2,t3; t6 depends on t2-t5; t7 depends on t6. | No probe (ordering is an artifact-internal fact). By inspection of the PLAN dependsOn lists the DAG is acyclic and order 1..7 is a valid topological sort: t1(∅)→t2,t3(t1)→t4,t5(t2,t3)→t6(t2-t5)→t7(t6). No cycle, no forward dependency. | none — verified sound by inspection of the artifact's own dependency lists. |
