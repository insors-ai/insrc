<!-- insrc:artifact LLD-4c7992cc0f79ef2a-S001 -->

# LLD: E202609204c7992cc:S001

**Epic:** `jetbrains-plugin-add-insrc-entry-project`
**HLD base run:** `wf-1789923781696-2z38yg`
**HLD effective hash:** `4c7992cc0f79...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `DaemonGateway.repoStats`

```typescript
fun repoStats(projectRootPath: String): RepoStatsResult
```

**Parameters:**
- `projectRootPath: String` — The opened project's absolute root (e.project.basePath) — passed verbatim as the repo.stats `repoPath` param so the daemon returns the single matching RepoStats (k3, scope-per-project).

**Returns:** `RepoStatsResult` — A sealed two-state result: Loaded(stats: RepoStatsDto) when the daemon returned the single RepoStats object, or Unavailable(reason) when the daemon was unreachable / framed an error / the repo is not registered (repo.stats returns {error} for an unknown repoPath, surfaced by parse() as ok=false).

**Errors:**
- `RepoStatsResult.Unavailable` when DaemonUnavailableException (socket down), a framed result.error (unregistered repoPath), or any RuntimeException (malformed reply) — all caught and mapped, never thrown (mirrors settingsCatalog/registeredRepos).

**Preconditions:**
- projectRootPath is non-empty (the action disables itself when basePath is null/blank).

**Postconditions:**
- Read-only: no registry allocation, no store write (repo.stats is a read-only daemon method).
- On Loaded, RepoStatsDto carries every RepoStats field with numbers coerced from Gson Double and the two Record maps parsed to Map<String,Int>.

### `DaemonGateway.registerProject`

```typescript
fun registerProject(projectRootPath: String, steering: SteeringSelection? = null): RegistrationResult
```

**Parameters:**
- `projectRootPath: String` — The opened project's absolute root, forwarded as repo.add's `path` param (daemon derives name=basename).
- `steering: SteeringSelection?` _(optional)_ — NEW param. The per-file steering selection {claude, agents} from the Register dialog's toggles; forwarded as repo.add's optional `steering` param. Null (the default, preserving the existing call sites) or both-false ⇒ no steering key sent ⇒ the daemon writes no CLAUDE.md/AGENTS.md block and registers no MCP client.

**Returns:** `RegistrationResult` — {registered:true} on repo.add ok=true, else {registered:false, reason} — unchanged from today.

**Errors:**
- `DaemonUnavailableException` when The daemon socket cannot be reached — STILL THROWN (registerProject is one of the two throwing methods); the Register dialog's off-EDT caller catches it and reports failure without treating it as success.

**Preconditions:**
- projectRootPath is non-empty.

**Postconditions:**
- Backward-compatible: the added parameter is nullable with a default, so the existing zero-steering call sites (onboarding OnboardingOffer onAccept, any lifecycle caller) compile and behave exactly as before.
- When steering is non-null with at least one flag true, the daemon injects the steering block + registers the MCP client for the selected clients (guarded daemon-side; a write failure never fails the add).

## Data model changes

### `RepoStatsDto` — new

A new Kotlin data class in the daemon package mirroring the daemon RepoStats payload 1:1: repoPath:String, status:String, lastIndexed:String?, addedAt:String, errorMsg:String?, fileCount:Int, filesByLanguage:Map<String,Int>, entityCount:Int, entityCountByKind:Map<String,Int>, relationCount:Int, sizeBytes:Long, pendingJobs:Int. status is kept as a free String (not an enum) so an unknown daemon status never throws (k1 verbatim-forward). Numbers are coerced from Gson Double; the two Record<string,number> maps parse to Map<String,Int> via (v as? Number)?.toInt(); a missing optional (lastIndexed/errorMsg) is null.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `src/shared/types.ts`

### `RepoStatsResult` — new

A new sealed interface { data class Loaded(val stats: RepoStatsDto); data class Unavailable(val reason: String) } — the same two-state shape as SettingsCatalogResult/RegisteredReposResult, so the Status dialog renders the rich fields on Loaded and a distinct 'stats unavailable' message on Unavailable (never a blank).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `SteeringSelection (plugin-side)` — new

A tiny plugin Kotlin data class SteeringSelection(val claude: Boolean, val agents: Boolean) carrying the Register dialog's two toggles. Serialized on the wire as mapOf('claude' to claude, 'agents' to agents) under the repo.add `steering` param. Distinct from the daemon TS SteeringSelection (mirrors it); named the same for clarity. NOT sent when null/both-false.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `src/shared/types.ts`

### `ShowOrRegisterRepoAction` — new

A new AnAction subclass (the plugin's FIRST). getActionUpdateThread() = ActionUpdateThread.BGT so update() runs off the EDT. update(): reads e.project?.basePath; null/blank → presentation.isEnabledAndVisible=false; else calls service<DaemonGatewayService>().isProjectRegistered(root) in try/catch — registered → text='Show Repo status', not → text='Register Repo', DaemonUnavailableException → text='Register Repo' (safe default) with the item enabled. actionPerformed(): re-reads basePath and shows RepoStatusDialog or RegisterRepoDialog for the current branch.

**Call sites:**
- `jetbrains-plugin/src/main/resources/META-INF/plugin.xml`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ProjectContext.kt`

### `RepoStatusDialog` — new

A new DialogWrapper (title 'insrc — Repo status'). createCenterPanel() shows a loading placeholder; on show, reads gateway.repoStats(root) via ApplicationManager.executeOnPooledThread then invokeLater renders on the EDT guarded on the still-open dialog: on Loaded, the rich fields — status, lastIndexed, addedAt, fileCount, sizeBytes (human-readable), entityCount, relationCount, pendingJobs, plus filesByLanguage and entityCountByKind as small key→count lists, and errorMsg when present; on Unavailable, the reason. OK-only (a read-only view).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### `RegisterRepoDialog` — new

A new DialogWrapper (title 'insrc — Register Repo'). createCenterPanel(): a read-only field showing the detected project root + two JCheckBoxes ('Add insrc steering to CLAUDE.md', 'Add insrc steering to AGENTS.md', both default off) + explanatory text. OK ('Register') runs gateway.registerProject(root, SteeringSelection(claude, agents)) off the EDT (executeOnPooledThread), catching DaemonUnavailableException; on RegistrationResult.registered=true closes with a success notification, else keeps the dialog open and shows the reason. Cancel does nothing.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingOffer.kt`

### `plugin.xml <actions> registration` — new

The FIRST <actions> block: <action id="ai.insors.insrc.ShowOrRegisterRepo" class="ai.insors.insrc.jetbrains.actions.ShowOrRegisterRepoAction" text="insrc"><add-to-group group-id="ProjectViewPopupMenu" anchor="last"/></action>. Depends only on the shared platform module (ProjectViewPopupMenu is a platform group), preserving the single-artifact-four-IDEs guarantee.

**Call sites:**
- `jetbrains-plugin/src/main/resources/META-INF/plugin.xml`

### `DaemonGatewayImpl companion constants` — field-add

Add METHOD_REPO_STATS = "repo.stats" and PARAM_STEERING = "steering" to the DaemonGatewayImpl companion, alongside the existing METHOD_*/PARAM_* constants. DaemonGatewayService gains delegating overrides for repoStats and the new registerProject overload.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`

## Error paths

### Error cases

- **The daemon socket is unreachable when the Status dialog reads stats.** (recoverable)
  - Detection: gateway.repoStats(root) catches DaemonUnavailableException (thrown by UnixSocketDaemonRpc when SocketChannel.connect fails) and returns RepoStatsResult.Unavailable(reason); the dialog's invokeLater render matches on Unavailable.
  - Response: Render a distinct 'Repo stats unavailable: <reason>' message in the dialog body (never a blank panel or fabricated zeros); OK closes it.
  - User impact: The user sees an explicit unavailable state and can retry after starting the daemon.
- **The project root is registered per isProjectRegistered but repo.stats returns {error: 'not a registered repo'} (a race / registry skew).** (recoverable)
  - Detection: UnixSocketDaemonRpc.parse() surfaces the framed result.error as DaemonResult(ok=false, error=...); gateway.repoStats classifies `!r.ok || r.error != null` → RepoStatsResult.Unavailable(error).
  - Response: The Status dialog shows the framed error reason rather than treating it as an empty success; no partial/blank stats.
  - User impact: Rare; the user sees the daemon's own message and can re-open once indexing/registration settles.
- **repo.add rejects the registration (e.g. invalid path).** (recoverable)
  - Detection: registerProject sees r.ok=false (or catches the framed error) and returns RegistrationResult(registered=false, reason); the Register dialog's off-EDT caller inspects registered=false.
  - Response: Keep the Register dialog open and show the reason inline; do NOT close or report success.
  - User impact: The user sees why registration failed and can correct it or cancel.
- **The daemon is down when the user clicks Register.** (recoverable)
  - Detection: registerProject STILL THROWS DaemonUnavailableException; the Register dialog's executeOnPooledThread block wraps the call in try/catch.
  - Response: Catch it, keep the dialog open, and show 'daemon unavailable' — never close as if registered (the S001 framing invariant).
  - User impact: The user is told the daemon is unreachable and can start it then retry.
- **The repo.stats reply is malformed (a field is the wrong JSON type).** (recoverable)
  - Detection: parseRepoStats coerces each field defensively ((v as? Number)?.toInt(), as? Map<*,*>); a hard shape mismatch that would throw is caught by the gateway's catch (e: RuntimeException) and mapped to Unavailable.
  - Response: Unavailable(reason) rather than a crash or a half-parsed DTO — mirrors parseCatalog's require+catch discipline.
  - User impact: The user sees an unavailable message instead of a broken/half-filled dialog; no EDT crash.
- **update() calls isProjectRegistered and the daemon is unreachable.** (recoverable)
  - Detection: isProjectRegistered THROWS DaemonUnavailableException on the BGT update thread; update() wraps it in try/catch.
  - Response: Default the presentation text to 'Register Repo' (safe default) and keep the item enabled; never let the exception escape update().
  - User impact: The menu item still appears with a sensible label even with the daemon down; clicking then surfaces the daemon-unavailable path in the dialog.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The active window has no project root (light/default/rootless window — e.project?.basePath is null or blank). | update() sets presentation.isEnabledAndVisible=false — the insrc item does not appear on the Project-view menu (no gateway call attempted). |
| The user opens the Register dialog with BOTH steering toggles left off and clicks Register. | registerProject(root, SteeringSelection(false,false)) is sent; because both flags are false the daemon writes no CLAUDE.md/AGENTS.md block and registers no MCP client — the repo is still registered. |
| A registered repo that has never finished indexing (status 'pending'/'indexing', fileCount 0, empty maps). | The Status dialog renders the real status and zero counts / empty maps verbatim — a legitimate zero-state, not an error or a blank. |
| A repo.stats reply carrying an unknown status string. | RepoStatsDto.status is a free String, so the raw value renders verbatim (k1) — no throw, no coercion to a default. |
| The Status/Register dialog is closed before the off-EDT read completes. | The invokeLater render is guarded on the still-open/live-component check, so a late result is dropped — no exception, no write to a disposed component. |

### Invariants to preserve

- The daemon owns all registry membership; the plugin's reads (isProjectRegistered, repoStats) never allocate a registry row — repo.stats and repo.list are read-only (k2). [[c1]]
- An error or unreachable-daemon reply is NEVER rendered as a silent empty/blank success: every read maps to a distinct Unavailable state, and Register never closes-as-success on a failure (the S001 framing invariant). [[c3]]
- All daemon I/O happens OFF the EDT (executeOnPooledThread) with the render marshalled back via invokeLater guarded on a still-live component; update() runs on ActionUpdateThread.BGT so the isProjectRegistered probe never blocks the EDT. [[c3]]
- Numbers cross the Gson socket as Double and Record<string,number> maps as Map<*,*> — the DTO parse must coerce via (v as? Number)?.toInt()/toLong() and as? Map<*,*>, exactly as parseArtifacts/parseRepoOverride do; a boundary value must be tested with the real Double type. [[c2]]
- The plugin depends ONLY on com.intellij.modules.platform; the new <action> attaches to the platform group ProjectViewPopupMenu, preserving the single-artifact-four-IDEs guarantee. [[c4]]
- registerProject's new steering parameter is nullable with a default, so every existing zero-steering call site compiles and behaves exactly as before — a purely additive extension. [[c1]]

## Test strategy

**Test framework:** `JUnit (kotlin.test/JUnit5 for pure unit + source-scan tests; BasePlatformTestCase/JUnit4-vintage only if an IDE fixture is needed) — the existing plugin split: fake-DaemonRpc gateway unit tests (Sc2DaemonGatewayTest) + File(path).readText() source-scan tests (InsrcSettingsConfigurableTest). No GitHub CI; verified locally with JDK21 gradlew test buildPlugin.`

### Test levels

- **unit** — Prove the new DaemonGateway.repoStats classification + RepoStatsDto parse and the registerProject-steering wire shape against a fake DaemonRpc — no socket, no IDE.
  - Subjects: `repoStats: a Gson-Double-shaped data map → RepoStatsResult.Loaded with correctly coerced Int/Long fields and Map<String,Int> maps`, `repoStats: a DaemonResult(ok=false, error='not a registered repo') → Unavailable(reason)`, `repoStats: a DaemonUnavailableException → Unavailable (never thrown); a malformed field → Unavailable via the RuntimeException catch`, `repoStats: the fake rpc is called with METHOD_REPO_STATS and params carrying repoPath=the projectRootPath`, `registerProject(root, SteeringSelection(true,false)): the fake rpc records METHOD_REPO_ADD params carrying path=root AND steering=mapOf('claude' to true,'agents' to false)`, `registerProject(root, null) and registerProject(root): NO steering key in the params (backward-compatible zero-steering path)`, `registerProject: r.ok=true → registered=true; r.ok=false → registered=false+reason; DaemonUnavailableException still propagates`
  - Fixtures: `A fake DaemonRpc that returns a canned DaemonResult (or throws DaemonUnavailableException) and records the (method, params) — the Sc2DaemonGatewayTest idiom`
- **contract** — Source-scan the non-bootable wiring (the AnAction, its plugin.xml registration, the two dialogs' off-EDT reads).
  - Subjects: `plugin.xml registers an <action> with class ai.insors.insrc.jetbrains.actions.ShowOrRegisterRepoAction and <add-to-group group-id="ProjectViewPopupMenu">`, `ShowOrRegisterRepoAction: getActionUpdateThread=BGT; update() reads basePath and disables when null/blank; sets 'Show Repo status' vs 'Register Repo'; wraps the probe in try/catch`, `RepoStatusDialog: reads gateway.repoStats OFF the EDT (executeOnPooledThread + invokeLater), renders Loaded vs Unavailable, references the rich fields`, `RegisterRepoDialog: read-only root + two JCheckBoxes (CLAUDE.md/AGENTS.md) + Register calls registerProject(root, SteeringSelection(...)) off the EDT and does NOT close-as-success on failure`, `plugin.xml still <depends> ONLY com.intellij.modules.platform`
  - Fixtures: `File(path).readText() over plugin.xml + the new Kotlin sources (test cwd = jetbrains-plugin)`
- **unit** — Guard the pure RepoStatsDto parse directly over a Gson-shaped Map (boundary-type discipline).
  - Subjects: `parseRepoStats: sizeBytes 1024.0 (Double) → Long 1024; fileCount 3.0 → Int 3`, `parseRepoStats: lastIndexed/errorMsg absent → null`, `parseRepoStats: unknown status string → verbatim String`, `parseRepoStats: empty filesByLanguage/entityCountByKind → empty maps`
  - Fixtures: `Inline Kotlin Map<String,Any?> literals shaped exactly as Gson emits (Double numbers, nested maps)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: plugin.xml registers the <action> on ProjectViewPopupMenu`, `contract: ShowOrRegisterRepoAction update() sets 'Show Repo status' vs 'Register Repo' from isProjectRegistered; getActionUpdateThread=BGT` |
| `ac2` | `unit: repoStats Gson-Double map → Loaded with coerced fields`, `unit: parseRepoStats boundary types`, `contract: RepoStatusDialog reads repoStats off-EDT and renders the rich fields vs a distinct Unavailable message` |
| `ac3` | `unit: registerProject sends steering{claude,agents} on repo.add`, `unit: registerProject(null) sends NO steering key`, `contract: RegisterRepoDialog shows read-only root + two steering checkboxes and calls registerProject off the EDT` |
| `ac4` | `unit: repoStats maps DaemonUnavailableException/malformed/{error} to Unavailable (never throws)`, `contract: RegisterRepoDialog does not close-as-success on registered=false / DaemonUnavailableException` |
| `ac5` | `contract: all daemon I/O off the EDT in both dialogs; update() is BGT`, `contract: plugin.xml depends only on com.intellij.modules.platform` |

## Migration

**State before:** The plugin has NO Project-view context-menu entry (plugin.xml has no <actions> block). DaemonGateway exposes isProjectRegistered/registerProject(path-only)/registeredRepos but no repoStats mirror, no RepoStatsDto, no METHOD_REPO_STATS. The daemon repo.stats + repo.add(steering) IPCs already exist and are UNCHANGED.

**State after:** The Project-view right-click menu shows one insrc entry whose label is dynamic ('Show Repo status' when registered, else 'Register Repo'). Show opens a read-only rich repo.stats popup; Register opens a popup with the read-only project root + two steering toggles + Register. DaemonGateway gains repoStats(root):RepoStatsResult and a registerProject(root, steering:SteeringSelection?=null) overload. Daemon contracts unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new value types (RepoStatsDto, sealed RepoStatsResult, plugin-side SteeringSelection) and the constants METHOD_REPO_STATS/PARAM_STEERING. Purely additive. — ↩ rollbackable
2. Add DaemonGateway.repoStats (interface + impl + service delegate) with pure parseRepoStats + sealed-result classification. — ↩ rollbackable
3. Add a nullable, default-null steering param to registerProject across interface + impl + service delegate, forwarding steering only when non-null. — ↩ rollbackable
4. Add ShowOrRegisterRepoAction (BGT dynamic label) and the two DialogWrapper popups (off-EDT reads, guarded EDT render). — ↩ rollbackable
5. Add the first plugin.xml <actions> block registering the action on ProjectViewPopupMenu (anchor=last). — ↩ rollbackable
6. Add the unit + source-scan tests; run the suite locally under JDK21 gradlew test buildPlugin (no GitHub CI). — ↩ rollbackable

**Backward compat:** registerProject gains a nullable parameter with a default (steering: SteeringSelection? = null), so the existing zero-steering call site (onboarding onAccept) and any lifecycle caller compile and behave EXACTLY as before — no wire change when steering is null. Every other addition is net-new and consumed only by this Story. The daemon repo.add/repo.stats contracts are untouched; a daemon too old to know repo.stats frames an 'unknown method' error, which repoStats already classifies as Unavailable (graceful degrade, not a crash).

## Alternatives considered

### a1: BGT dynamic update() + sealed RepoStatsResult + modal DialogWrappers — **CHOSEN**

A single AnAction with getActionUpdateThread=BGT computes the Register/Show label off the EDT via isProjectRegistered; two modal DialogWrappers do their daemon I/O off-EDT; repo.stats mirrors as RepoStatsDto + sealed Loaded|Unavailable.

ONE AnAction registered in plugin.xml's first <actions> block on ProjectViewPopupMenu, getActionUpdateThread=BGT; update() computes the dynamic label off-EDT via isProjectRegistered; a new RepoStatsDto + sealed RepoStatsResult + DaemonGateway.repoStats; registerProject gains a SteeringSelection? param; two DialogWrapper popups (Status read-only rich stats, Register root+toggles) reading/writing off the EDT.

### a2: EDT-only static label, branch resolved on click

The action shows a fixed 'insrc' label (no daemon call in update()); the Register-vs-Status decision happens after the user clicks.

update() stays purely on the EDT with a constant label; actionPerformed() does the isProjectRegistered probe off the EDT and opens the matching dialog. Same DTO/gateway/dialog machinery as a1.

### a3: Cached-registration service + EDT update() reads the cache

A background-refreshed per-project registration cache lets update() set the dynamic label synchronously on the EDT without any socket call.

A small service caches isProjectRegistered per projectRootPath, refreshed off the EDT; update() reads the cache synchronously and sets the label, invalidating after a Register. Same DTO/gateway/dialog machinery as a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — DaemonGateway.kt isProjectRegistered/registerProject/registeredRepos; no repoStats; DaemonGatewayImpl(rpc) + DaemonGatewayService` — "registerProject ... calls METHOD_REPO_ADD with mapOf(PARAM_PATH to projectRootPath) ONLY ... MISSING: no repoStats method, no RepoStats DTO, no METHOD_REPO_STATS constant."
- **[[c2]]** `analyze-bundle` `s1 data-model.trace — RepoStats + SteeringSelection wire shapes; Gson-Double gotcha` — "JSON numbers cross the Gson socket as Double; Record<string,number> maps arrive as Map<*,*> ... coerce via (v as? Number)?.toX() and as? Map<*,*>."
- **[[c3]]** `analyze-bundle` `s1 usage.example — UnixSocketDaemonRpc.parse() by-kind + off-EDT read idiom` — "the daemon returns a single RepoStats OBJECT for a repoPath ... {error} ... surfaced as ok=false ... classify Unavailable purely on !r.ok || r.error != null ... the daemon read is ALWAYS off the EDT."
- **[[c4]]** `analyze-bundle` `s1 search.text — plugin.xml has no <actions> yet; ProjectViewPopupMenu; basePath seam; BGT` — "This Story adds the FIRST <actions> block: an <action> added to the built-in group ProjectViewPopupMenu ... plugin.xml can set getActionUpdateThread=BGT."
- **[[c5]]** `analyze-bundle` `s1 test.locate — source-scan (InsrcSettingsConfigurableTest) + fake-DaemonRpc (Sc2DaemonGatewayTest) idioms` — "construct DaemonGatewayImpl(fakeRpc) ... assert the sealed-result classification ... a pure DTO-parse test over a Gson-shaped Map."
- **[[c6]]** `code` `src/daemon/index.ts — repo.stats handler + repo.add steering gate` — "return one ?? { error: `repo.stats: ${repoPath} is not a registered repo` } ... if (sel !== undefined && (sel.claude === true || sel.agents === true))."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-09-20T17:15:30.948Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | DaemonGateway already declares isProjectRegistered(projectRootPath) and registerProject(projectRootPath) and registeredRepos(), but does NOT yet declare a repoStats method (the Story adds it). | CONFIRMED: DaemonGateway.kt:328 declares isProjectRegistered and :336 registerProject and registeredRepos; grep for `fun repoStats` finds it ONLY in the new LLD, not in any plugin source — exactly as the LLD asserts (net-new). | None — citation resolves. |
| cl2 | citation | LOW | manual | registerProject's impl today calls repo.add with only the path param: rpc.call(METHOD_REPO_ADD, mapOf(PARAM_PATH to projectRootPath)) — no steering key. | CONFIRMED: DaemonGateway.kt:525 `rpc.call(METHOD_REPO_ADD, mapOf(PARAM_PATH to projectRootPath))` (path-only), METHOD_REPO_ADD="repo.add":782, PARAM_PATH="path". The steering extension is genuinely additive. | None. |
| cl3 | closed-union | LOW | manual | There is NO repoStats method, RepoStatsDto/RepoStatsResult type, or METHOD_REPO_STATS constant in the plugin today (all net-new for this Story). | CONFIRMED: RepoStatsDto/RepoStatsResult/METHOD_REPO_STATS/PARAM_STEERING appear ONLY in the new LLD doc, never in jetbrains-plugin/src — all net-new as claimed. | None. |
| cl4 | semantic | LOW | manual | UnixSocketDaemonRpc.parse() classifies a framed result.error (a returned {error}) as DaemonResult(ok=false, error=...), so repoStats can classify Unavailable on !r.ok \|\| r.error != null. | CONFIRMED: UnixSocketDaemonRpc.kt:131 reads result.get("error") and :134 returns DaemonResult(ok = false, error = structuredError) — the framed-error classification the repoStats Unavailable path relies on. | None. |
| cl5 | citation | LOW | manual | plugin.xml has NO <action>/<actions>/add-to-group ProjectViewPopupMenu registration today, and depends only on com.intellij.modules.platform. | CONFIRMED: the source plugin.xml has no <action>/<actions> (matches only in the LLD + build artifacts); build/resources/main/META-INF/plugin.xml:227 shows <depends>com.intellij.modules.platform</depends>, and BuildContractTest/PluginDescriptorSmokeTest guard that platform-only dependency. | None — the first <actions> block is genuinely new. |
| cl6 | external-contract | LOW | manual | The daemon repo.stats handler returns the single matching RepoStats for a non-empty repoPath, or { error: 'repo.stats: <repoPath> is not a registered repo' } when unknown. | CONFIRMED: src/daemon/index.ts:549 collectRepoStats(store, repos, queue) and :552 `return one ?? { error: \\`repo.stats: ${repoPath} is not a registered repo\\` }` — the exact single-object-or-{error} contract the plugin repoStats consumes. | None. |
| cl7 | external-contract | LOW | manual | The daemon repo.add handler reads an optional steering:SteeringSelection and injects only when sel !== undefined && (sel.claude===true \|\| sel.agents===true). | CONFIRMED: src/daemon/index.ts:491 reads params.steering:SteeringSelection and :492 gates on `sel !== undefined && (sel.claude === true \|\| sel.agents === true)`; src/shared/types.ts:646 declares SteeringSelection — the forward-when-non-null contract is exactly as described. | None. |
| cl8 | inventory | LOW | manual | The RepoStats payload fields the DTO mirrors 1:1 exist on the daemon RepoStats interface: repoPath,status,lastIndexed?,addedAt,errorMsg?,fileCount,filesByLanguage,entityCount,entityCountByKind,relationCount,sizeBytes,pendingJobs. | CONFIRMED: src/shared/types.ts:906 `export interface RepoStats {` with filesByLanguage/entityCountByKind/pendingJobs — the DTO mirrors the real payload 1:1. | None. |
| cl9 | citation | LOW | manual | The off-EDT read idiom (ApplicationManager.getApplication().executeOnPooledThread { ... invokeLater { ... } }) that the two dialogs reuse exists in InsrcSettingsConfigurable / ReviewToolWindow. | CONFIRMED: executeOnPooledThread + invokeLater is the established idiom (InsrcSettingsConfigurable.kt:88/:93, ReviewToolWindow.kt:198/:201, ArtifactContentPane.kt) the two dialogs reuse. | None. |
| cl10 | semantic | LOW | manual | isProjectRegistered and registerProject are the two DaemonGateway methods that THROW DaemonUnavailableException (the read methods instead map to an Unavailable sealed variant), so the action's update() and the Register dialog must catch it. | CONFIRMED: DaemonUnavailableException is declared (DaemonGateway.kt:161) and the isProjectRegistered/registerProject KDoc marks them @throws (unlike the read methods that catch+map to Unavailable) — the action/register-dialog catch requirement is grounded. | None. |
| cl11 | cross-artifact | LOW | manual | registerProject's existing call site is the onboarding onAccept path (used to justify the backward-compatible nullable-default steering param). | CONFIRMED (sufficient): registerProject is invoked by the onboarding path (OnboardingLifecycleTest FakeGateway + HLD/LLD trace). The load-bearing point — that a nullable-default steering param preserves EVERY existing caller with no wire change — holds regardless of the exact production call site, since Kotlin default args are source- and binary-compatible. | None — backward-compat reasoning is sound. |
