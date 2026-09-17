<!-- insrc:artifact PLAN-61d8c73edb68041a-s1 -->

# Plan: E2026091761d8c73e:S001

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**LLD run:** `wf-1789642862990-sub8fm`
**LLD effective hash:** `7ebd2fd85012...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Scaffold the single Gradle/Kotlin IntelliJ-Platform plugin module + descriptor + CI lane | M | — | smoke: Smoke: the plugin module Gradle build succeeds and produces one loadable plugin distribution artifact | [[c6]] [[c5]] |
| 2 | **`t2`** Implement sc1: IdeKind/ProjectContext types + project-open & uninstall lifecycle | M | `t1` | unit: Unit: product-identity-to-IdeKind resolves each of idea/pycharm/goland/webstorm; unit: Unit: ProjectContext carries the opened project's absolute root; a rootless window is skipped (no bogus ProjectContext); unit: Unit: onPluginUninstalled fires on uninstall but not on a mere disable | [[c1]] [[c3]] |
| 3 | **`t3`** Implement sc2: application-scoped DaemonGateway over the daemon socket | M | `t1` | unit: Unit: probe() maps reachable/unreachable/unknown-freshness to current/stale/absent and never throws; unit: Unit: isProjectRegistered() is read-only, surfaces DaemonUnavailable, and never auto-allocates; unit: Unit: registerProject() routes repo.add, is idempotent, returns reason on rejection, and never auto-allocates other repos | [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Acceptance tests: integration (plugin activation) + contract (single-artifact / common-platform) | S | `t2`, `t3` | integration: Integration: plugin activates in the platform fixture and fires onProjectOpened for an opened project, with multi-window per-project scoping (k3); smoke: Contract: the build emits one versioned artifact depending only on the common platform module (no IDE-specific module) | [[c5]] |

### E2026091761d8c73e:S001:T001 — Scaffold the single Gradle/Kotlin IntelliJ-Platform plugin module + descriptor + CI lane

Create the new in-repo Gradle/Kotlin subproject (distinct from the ESM/TS backend, k6) with an IntelliJ-Platform plugin descriptor that depends only on the common platform module so one artifact activates in IntelliJ IDEA, PyCharm, GoLand, and WebStorm (lc1). Wire the Gradle IntelliJ-plugin build to emit a single versioned artifact with valid since-build/until-build, and add a dedicated CI lane that builds + runs the plugin's tests.

**Acceptance checks:**
- The Gradle build compiles the new Kotlin module and emits exactly one plugin distribution artifact (no per-IDE variant) with a version + since-build/until-build.
- The plugin descriptor declares a dependency only on the common platform module, not an IDE-specific module.
- A CI lane builds the module and runs its test task, separate from the TS backend's test sweep.

### E2026091761d8c73e:S001:T002 — Implement sc1: IdeKind/ProjectContext types + project-open & uninstall lifecycle

Add the IdeKind closed union and immutable ProjectContext, resolve IdeKind from the running product identity for each of the four IDEs, and hook the platform lifecycle: a project-open listener that constructs a ProjectContext (absolute root + IdeKind) and broadcasts onProjectOpened once per opened project (skipping rootless windows), plus a teardown hook that fires onPluginUninstalled only on true uninstall, not on disable. The hooks are non-throwing and run off the UI thread. Ships with its own unit tests for the product-to-IdeKind mapping and the disable-vs-uninstall distinction.

**Acceptance checks:**
- ProjectContext is constructed with the opened project's absolute basePath and the IdeKind resolved for each of idea/pycharm/goland/webstorm, verified by unit tests.
- onProjectOpened fires exactly once per opened project window and is skipped (no bogus ProjectContext) for a rootless/light project.
- onPluginUninstalled fires only on uninstall and not on a mere disable, verified by a unit test.

### E2026091761d8c73e:S001:T003 — Implement sc2: application-scoped DaemonGateway over the daemon socket

Add DaemonState and RegistrationResult, and implement DaemonGateway as one application-scoped service holding a single JSON-RPC client to ~/.insrc/daemon.sock. probe() returns absent/stale/current (absent when the socket is unreachable, conservative when freshness is unknown, never throwing). isProjectRegistered(projectRootPath) and registerProject(projectRootPath) front the strict repo.add registry: read-only paths never allocate, registerProject is idempotent and returns a reason on rejection, and a DaemonUnavailable error is surfaced (not swallowed) when the socket is down. Every method takes projectRootPath explicitly (k3); the socket wire format stays private to S001. Ships with its own unit tests driving a fake daemon socket.

**Acceptance checks:**
- probe() returns 'absent' when no socket file is present and never throws; a reachable daemon yields current/stale, verified by unit tests against a fake socket.
- isProjectRegistered() is read-only and surfaces DaemonUnavailable when the daemon is unreachable, never auto-allocating (k2, c3).
- registerProject() routes repo.add for exactly that one project, is idempotent for an already-registered project, returns RegistrationResult{registered:false,reason} on backend rejection, and opens only the local socket — no cloud path (c7).

### E2026091761d8c73e:S001:T004 — Acceptance tests: integration (plugin activation) + contract (single-artifact / common-platform)

With sc1 and sc2 assembled, add the acceptance-level suites that require the whole plugin: an integration test that activates the plugin in the IntelliJ Platform test fixture and asserts onProjectOpened fires for an opened project (including multi-window per-project scoping, k3); and a contract test over the built descriptor/artifact asserting a single versioned artifact that depends only on the common platform module. Per-task unit tests for the gateway and IdeKind mapping live with t2/t3, not here.

**Acceptance checks:**
- An integration test activates the plugin in the platform fixture and asserts onProjectOpened fires for an opened project with its absolute root (ac1), including multi-window per-project scoping (k3).
- A contract test asserts the build emits one versioned artifact depending only on the common platform module (ac2/ac3, lc1).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DaemonGateway.probe (maps reachable/unreachable/unknown-freshness to current/absent, never throws for absent) | `t3` |
| DaemonGateway.isProjectRegistered (read-only, surfaces DaemonUnavailable, never allocates) | `t3` |
| DaemonGateway.registerProject (routes repo.add, idempotent, returns RegistrationResult with reason on rejection, never auto-allocates others) | `t3` |
| ProjectContext construction + the product-identity-to-IdeKind mapping for all four IDEs | `t2` |
| PluginLifecycle: onPluginUninstalled fires only on uninstall, not disable | `t2` |
| Plugin activation on project open (onProjectOpened fires once per opened project with the project's absolute basePath as projectRootPath) | `t4` |
| Rootless/light project window is skipped without firing a bogus ProjectContext | `t2`, `t4` |
| Multiple open projects each resolve their own ProjectContext, and the shared gateway scopes each call by its explicit projectRootPath (k3) | `t4` |
| The plugin descriptor depends only on the common platform module (not an IDE-specific module), so one artifact is compatible with IDEA/PyCharm/GoLand/WebStorm | `t1`, `t4` |
| The Gradle build emits exactly one versioned plugin artifact (no per-IDE variant) with valid since-build/until-build + version metadata | `t1`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails sc1 (PluginLifecycle / ProjectContext / IdeKind)` — "onProjectOpened(ctx: ProjectContext) fires once per opened project window; onPluginUninstalled fires only on true uninstall, not disable."
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails sc2 (DaemonGateway)` — "probe(): DaemonState; isProjectRegistered(projectRootPath): Boolean (never auto-allocates); registerProject(projectRootPath): RegistrationResult (explicit repo.add only)."
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges (IdeKind, ProjectContext, DaemonState, RegistrationResult)` — "New closed unions and value types: IdeKind (four products), ProjectContext {projectRootPath, ide}, DaemonState (absent/stale/current), RegistrationResult {registered, reason?}."
- **[[c4]]** `prior-artifact` `LLD s1 errorPaths (DaemonUnavailable, repo.add rejection, unknown freshness; invariants c3/c7)` — "Surface DaemonUnavailable rather than fabricate; registerProject returns reason on rejection with no partial allocation; conservative freshness reading; registry non-auto-allocating; no cloud path."
- **[[c5]]** `prior-artifact` `LLD s1 testStrategy (unit gateway/mapping, integration activation, contract single-artifact) + acceptanceMapping ac1/ac2/ac3` — "JUnit + IntelliJ Platform Test Framework; unit against a fake socket, integration activation via the platform fixture, contract single-versioned-artifact / common-platform-only dependency."
- **[[c6]]** `prior-artifact` `LLD s1 hldContextSlice.boundary (single-plugin packaging + per-IDE activation, k6/lc1)` — "The Marketplace-published single-plugin packaging and per-IDE activation manifest bring the plugin up identically across all four IDEs; a new codebase distinct from the TS backend."
