<!-- insrc:artifact PLAN-0d565a953288f511-S001 -->

# Plan: E202609180d565a95:S001

**Epic:** `resolve-jetbrains-marketplace-plugin-verifier-s`
**LLD run:** `wf-1789713946904-tv18xw`
**LLD effective hash:** `0d565a953288...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Host-probe: swap to public PluginManager.findEnabledPlugin | S | — | integration: JetBrainsHostProbes host detection: a present+enabled host resolves, an absent/disabled host is omitted (via the public findEnabledPlugin path) | [[c2]] |
| 2 | **`t2`** App-init migration: run-once registration + delete InsrcAppLifecycle | S | — | unit: the run-once registration helper: repeated invocation registers the app-scoped consumers exactly once (a counting/fake registrar sees N registrations on the first call and 0 on subsequent calls); unit: concurrent invocation: only one caller's CAS wins; total registrations == the consumer count; integration: InsrcProjectOpenActivity: opening a project runs the once-only registration then broadcasts the project-open (consumers wired) | [[c1]] [[c3]] |
| 3 | **`t3`** Tests: run-once idempotency unit + extended fixture integration | M | `t1`, `t2` | unit: UninstallPolicy.shouldSignalUninstall unchanged (UNINSTALL signals, disable does not); integration: OnboardingCleanupIntegrationTest (extended): a true firePluginUninstalled still restores host mcp.json + rules.md to pre-insrc bytes; a mere disable leaves them | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** Local build + verifyPlugin sweep (0 internal + 0 deprecated) | S | `t3` | smoke: ./gradlew verifyPlugin: 0 internal + 0 deprecated for appStarted / PluginManagerCore.getPlugin / PluginDescriptor.isEnabled, Compatible retained; integration: ./gradlew test: full JUnit5 + BasePlatformTestCase suite green including the new run-once test | [[c4]] |

### E202609180d565a95:S001:T001 — Host-probe: swap to public PluginManager.findEnabledPlugin

In JetBrainsHostProbes.isInstalledAndEnabled, replace `PluginManagerCore.getPlugin(PluginId.getId(id))` + `descriptor != null && descriptor.isEnabled` with `PluginManager.getInstance().findEnabledPlugin(PluginId.getId(id)) != null`. Drop the `com.intellij.ide.plugins.PluginManagerCore` import; keep public `PluginManager` + `PluginId`. Semantics unchanged (installed AND enabled; a disabled/absent host stays 'not present'). Independent of the app-init migration.

**Acceptance checks:**
- isInstalledAndEnabled resolves each id via PluginManager.getInstance().findEnabledPlugin(PluginId.getId(id)) != null; no PluginManagerCore.getPlugin or PluginDescriptor.isEnabled remains in the file.
- The PluginManagerCore import is removed; the file compiles (./gradlew compileKotlin) with only public PluginManager + PluginId imports.
- A disabled or absent host plugin still yields not-present (return value semantics identical to before).

### E202609180d565a95:S001:T002 — App-init migration: run-once registration + delete InsrcAppLifecycle

Move the five app-scoped consumer registrations off the internal AppLifecycleListener.appStarted() to a run-once path (LLD a2). Extract the registration body (PluginInstaller.addStateListener(InsrcPluginStateListener()) + the four LifecycleBroadcaster.register calls for McpWiringLifecycle/DaemonLifecycleService.production/SteeringInjectionLifecycle/OnboardingLifecycle.production) into a once-only helper guarded by a process-wide AtomicBoolean compareAndSet, wrapped in try/catch that logs a factory throwable (getLogger().warn) without aborting. Invoke that helper at the TOP of InsrcProjectOpenActivity.execute, before the existing project-open broadcast. Delete the InsrcAppLifecycle class and its <applicationListeners> <listener topic=AppLifecycleListener> entry in plugin.xml. InsrcPluginStateListener itself is unchanged. Structure the helper so it is unit-testable off-platform (a registrar seam). This is one atomic change — splitting the helper/invoke/delete risks a double- or zero-registration window.

**Acceptance checks:**
- The five consumers are registered exactly once per process via an AtomicBoolean.compareAndSet-guarded helper; a second/concurrent invocation registers nothing further.
- InsrcProjectOpenActivity.execute invokes the once-only registration BEFORE broadcasting the project-open, so the first opened project is wired.
- InsrcAppLifecycle is deleted and its <applicationListeners> entry is removed from plugin.xml; no override of AppLifecycleListener.appStarted() remains; no other Kotlin references InsrcAppLifecycle.
- A throwable from a consumer factory is caught + logged and does not abort the project-open broadcast.

### E202609180d565a95:S001:T003 — Tests: run-once idempotency unit + extended fixture integration

Add a JUnit5 unit test (condition-first asserts) exercising the run-once registration helper against a fake/counting registrar seam: repeated invocation registers the five consumers exactly once; concurrent invocation has exactly one CAS winner (total registrations == consumer count). Keep/extend the fixture integration tests (junit-vintage BasePlatformTestCase, LifecycleBroadcaster.clear() in setUp): OnboardingCleanupIntegrationTest still proves a true firePluginUninstalled restores host mcp.json + rules.md and a disable does not; and host detection still treats an installed+enabled host as present and a disabled/absent one as not-present via the findEnabledPlugin path. Assert UninstallPolicy.shouldSignalUninstall is unchanged (UNINSTALL signals, disable does not).

**Acceptance checks:**
- A unit test proves the run-once helper registers the five consumers exactly once under repeated and concurrent invocation.
- OnboardingCleanupIntegrationTest (and the host-detection tests) stay green and continue to prove uninstall-restores-vs-disable-leaves and installed-AND-enabled detection.
- UninstallPolicy.shouldSignalUninstall behavior (UNINSTALL=true, disable=false) is covered and unchanged.

### E202609180d565a95:S001:T004 — Local build + verifyPlugin sweep (0 internal + 0 deprecated)

Run ./gradlew test and ./gradlew verifyPlugin locally (JDK21 + the committed 8.10.2 wrapper). Confirm the full JUnit suite is green and the IntelliJ Plugin Verifier reports ZERO internal-API and ZERO deprecated-API usages for the three migrated sites (AppLifecycleListener.appStarted, PluginManagerCore.getPlugin, PluginDescriptor.isEnabled) while retaining the Compatible verdict (since-build 242, open-ended). No GitHub CI. Fix any fallout.

**Acceptance checks:**
- ./gradlew test is green (all JUnit5 + BasePlatformTestCase suites, incl. the new run-once test).
- ./gradlew verifyPlugin reports Compatible with 0 internal-API and 0 deprecated-API usages for appStarted / PluginManagerCore.getPlugin / PluginDescriptor.isEnabled.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ./gradlew verifyPlugin verdict: no 'AppLifecycleListener.appStarted() is overridden' internal usage | `t2`, `t4` |
| no 'PluginManagerCore.getPlugin' internal usage | `t1`, `t4` |
| no 'PluginDescriptor.isEnabled()' deprecated usage | `t1`, `t4` |
| Compatible verdict retained (since-build 242, open-ended) | `t4` |
| the run-once registration helper: repeated invocation registers the app-scoped consumers exactly once (a counting/fake registrar sees N registrations on the first call and 0 on subsequent calls) | `t2` |
| concurrent invocation: only one caller's CAS wins; total registrations == the consumer count | `t2` |
| UninstallPolicy.shouldSignalUninstall unchanged (UNINSTALL signals, disable does not) | `t3` |
| InsrcProjectOpenActivity: opening a project runs the once-only registration then broadcasts the project-open (consumers wired) | `t2` |
| OnboardingCleanupIntegrationTest (extended): a true firePluginUninstalled still restores host mcp.json + rules.md to pre-insrc bytes; a mere disable leaves them | `t3` |
| JetBrainsHostProbes host detection: a present+enabled host resolves, an absent/disabled host is omitted (via the public findEnabledPlugin path) | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails/dataModel + invariants — the five app-scoped consumers (InsrcPluginStateListener uninstall routing + McpWiringLifecycle + DaemonLifecycleService.production + SteeringInjectionLifecycle + OnboardingLifecycle.production) registered exactly-once, migrating off the internal AppLifecycleListener.appStarted()`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api JetBrainsHostProbes.isInstalledAndEnabled — replace internal PluginManagerCore.getPlugin + deprecated PluginDescriptor.isEnabled with public PluginManager.getInstance().findEnabledPlugin(PluginId), preserving installed-AND-enabled`
- **[[c3]]** `prior-artifact` `LLD S001 invariants/migration — blast radius contained to InsrcProjectOpenActivity + InsrcPluginStateListener.kt + plugin.xml; InsrcAppLifecycle + its <applicationListeners> entry deleted with no other Kotlin caller`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy — run-once idempotency unit + fixture integration (OnboardingCleanupIntegrationTest) + ./gradlew verifyPlugin contract check (0 internal + 0 deprecated, Compatible retained)`
