<!-- insrc:artifact PLAN-61d8c73edb68041a-s4 -->

# Plan: E2026091761d8c73e:S004

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**LLD run:** `wf-1789659446150-8ut1pb`
**LLD effective hash:** `7ebd2fd85012...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Bundle the canonical steering block into plugin resources (Gradle) | S | — | integration: processResources bundles steering-block.md to build/resources/main/insrc/ byte-identical to src (gradle task wiring) | [[c1]] [[c2]] |
| 2 | **`t2`** SteeringContent provider (bundled-resource read + empty/missing guard) | S | `t1` | unit: SteeringContentTest.steeringBody_returnsNonEmptyBundledBody; unit: SteeringContentTest.steeringBody_missingOrEmptyResource_throwsIllegalStateException | [[c3]] [[c4]] |
| 3 | **`t3`** SteeringInjectionLifecycle sc1-consumer | M | `t2` | unit: SteeringInjectionLifecycleTest.composesRulesBlockAndWritesOncePerDetectedHost; unit: SteeringInjectionLifecycleTest.emptyDetectPresent_noWrite; unit: SteeringInjectionLifecycleTest.steeringBodyThrows_noWriteOnAnyHost; unit: SteeringInjectionLifecycleTest.perHostHostFileAccessException_isolated_otherHostStillWritten | [[c5]] [[c6]] [[c7]] |
| 4 | **`t4`** Register SteeringInjectionLifecycle in InsrcAppLifecycle.appStarted | S | `t3` | integration: ProjectOpenSteeringWiringTest.projectOpen_broadcasterDrivesSteeringInjection_offEdt | [[c8]] |
| 5 | **`t5`** Unit + integration tests (JUnit + IntelliJ Platform Test Framework) | M | `t4` | integration: SteeringInjectionIntegrationTest.projectOpen_writesRulesDelimitedSteeringIntoHostRulesFilePath_ac1; integration: SteeringInjectionIntegrationTest.preExistingDeveloperContent_preservedByteForByte_onlyInsrcSectionChanged_ac2; integration: SteeringInjectionIntegrationTest.bothHostsPresent_eachGetsSteeringInOwnRulesFilePath_ac3 | [[c9]] [[c10]] |

### E2026091761d8c73e:S004:T001 — Bundle the canonical steering block into plugin resources (Gradle)

Add a `bundleSteeringBlock` Copy task in jetbrains-plugin/build.gradle.kts mirroring `bundleInstallerScript`: from(rootProject.file("../src/prompts/steering-block.md")) into(layout.buildDirectory.dir("generated-resources/insrc")), and make processResources dependsOn(bundleSteeringBlock). The generated-resources dir is already a main resources srcDir, so the asset ships at classpath /insrc/steering-block.md.

**Acceptance checks:**
- A `bundleSteeringBlock` Copy task exists and processResources dependsOn it (alongside bundleInstallerScript).
- After `gradle processResources`, build/resources/main/insrc/steering-block.md exists and is byte-identical to src/prompts/steering-block.md.
- The jar packages the asset at /insrc/steering-block.md (getResourceAsStream resolvable).

### E2026091761d8c73e:S004:T002 — SteeringContent provider (bundled-resource read + empty/missing guard)

Add SteeringContent with steeringBody(): String that reads the bundled /insrc/steering-block.md via getResourceAsStream, trims it, and throws IllegalStateException when the resource is null or trims to empty. The resource stream accessor is injectable so it is unit-testable with present/missing/empty fakes. Read-only, independent of daemon install state.

**Acceptance checks:**
- steeringBody() returns the non-empty trimmed canonical steering body from the bundled resource.
- A null or empty/whitespace-only resource -> IllegalStateException.
- The resource accessor is injectable (constructor/param seam) for unit tests.

### E2026091761d8c73e:S004:T003 — SteeringInjectionLifecycle sc1-consumer

Add SteeringInjectionLifecycle : PluginLifecycle mirroring McpWiringLifecycle, with an injectable AiHostAdapter (default AiHostAdapterImpl()) and an injectable SteeringContent. onProjectOpened: resolve steeringBody() ONCE up front (catch IllegalStateException -> log + write nothing); call adapter.detectPresent(), return early if empty; for each host compose MarkerDelimitedBlock(AiHostAdapterImpl.RULES_BEGIN, RULES_END, steeringBody) and write via `runCatching { adapter.writeRulesBlock(host, block) }.onFailure { log.warn(...) }`. onPluginUninstalled is a no-op. Never writes the mcp file, never calls removeRulesBlock.

**Acceptance checks:**
- onProjectOpened composes MarkerDelimitedBlock with the sc3 RULES markers + steeringBody and calls writeRulesBlock once per detected host.
- Empty detectPresent() -> no writeRulesBlock call (no-op).
- A missing/empty steering resource (steeringBody throws) -> no writeRulesBlock call on any host.
- A HostFileAccessException from one host is caught (per-host runCatching) and the other present host is still written.
- onPluginUninstalled is a no-op; no mcp write and no removeRulesBlock invocation anywhere.

### E2026091761d8c73e:S004:T004 — Register SteeringInjectionLifecycle in InsrcAppLifecycle.appStarted

Add LifecycleBroadcaster.register(SteeringInjectionLifecycle()) (or a .production() factory mirroring DaemonLifecycleService) in InsrcAppLifecycle.appStarted, alongside the existing McpWiringLifecycle and DaemonLifecycleService registrations, so steering injection runs off-EDT on every project open.

**Acceptance checks:**
- InsrcAppLifecycle.appStarted registers SteeringInjectionLifecycle via LifecycleBroadcaster.register alongside the two existing consumers.
- Its onProjectOpened work runs off the EDT (delivered via the broadcaster's off-EDT project-open path).

### E2026091761d8c73e:S004:T005 — Unit + integration tests (JUnit + IntelliJ Platform Test Framework)

Add tests in two waves within this task. Wave A (pure fakes, no fixture): unit tests for SteeringContent (present/missing/empty) and SteeringInjectionLifecycle (compose-and-write per host; empty-detect no-op; steeringBody-throws no-write; per-host HostFileAccessException isolation) using a recording fake AiHostAdapter (mirroring ProjectOpenWiringTest) + a fake steering-resource loader. Wave B (IntelliJ Platform fixture): an integration test over the real AiHostAdapterImpl rules writer on temp files proving ac2 (developer content byte-preserved, only the insrc RULES section added/replaced) and ac3 (both hosts each in their own rulesFilePath). Implement Wave A first so a fixture problem doesn't block the unit coverage. Verify locally with JDK21 + Gradle 8.10 + IntelliJ 2024.2 SDK; no GitHub CI.

**Acceptance checks:**
- Wave A unit tests cover: steeringBody present/missing/empty; compose-and-write once per host; empty-detect no-op; steeringBody-throws -> no write; per-host exception isolation.
- Wave B integration test proves ac2 (surrounding developer content byte-preserved, only insrc section changed) via the real AiHostAdapterImpl rules writer over a temp file, and ac3 (both hosts written to their own rulesFilePath).
- The full jetbrains-plugin suite compiles and passes locally (JDK21 + Gradle 8.10).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| SteeringContent.steeringBody: returns the bundled canonical steering body (non-empty); a missing or empty bundled resource -> IllegalStateException | `t2` |
| SteeringInjectionLifecycle composes MarkerDelimitedBlock(RULES_BEGIN, RULES_END, steeringBody) and calls adapter.writeRulesBlock(host, block) once per detected host (block markers == the sc3 RULES markers, body == steeringBody) | `t3` |
| empty detectPresent() -> no writeRulesBlock call (no-op) | `t3` |
| a HostFileAccessException from writeRulesBlock on one host is caught (per-host runCatching) and the other present host is still written | `t3` |
| a missing/empty steering resource (steeringBody throws) -> NO writeRulesBlock call on any host (never writes an empty block) | `t3` |
| On project open with one host present, the steering section (RULES-delimited) is written into that host's rulesFilePath (ac1) | `t5` |
| Writing into a rules file that already has developer content adds/replaces ONLY the insrc section; the surrounding content is preserved verbatim (ac2) — exercised through the real AiHostAdapterImpl rules writer over a temp file | `t5` |
| With both hosts present, each host's rulesFilePath receives the steering (ac3) | `t5` |
| The SteeringInjectionLifecycle is registered as a sc1 LifecycleBroadcaster consumer and its work runs off the EDT | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 dataModelChanges — SteeringContent bundles src/prompts/steering-block.md into plugin resources (Gradle copy)`
- **[[c2]]** `analyze-bundle` `s1 capability-discovery — S003 bundleInstallerScript Copy task pattern in build.gradle.kts:94-104 (generated-resources srcDir + processResources dependsOn)`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails — SteeringContent.steeringBody(): String returns the plugin-bundled canonical steering body`
- **[[c4]]** `prior-artifact` `LLD s4 errorPaths — missing/empty bundled steering resource -> IllegalStateException (never write an empty block)`
- **[[c5]]** `prior-artifact` `LLD s4 contractDetails + interactionWithShared — SteeringInjectionLifecycle.onProjectOpened composes MarkerDelimitedBlock(RULES markers, steeringBody) and calls sc3 writeRulesBlock per host`
- **[[c6]]** `analyze-bundle` `s1 capability-discovery — S002 McpWiringLifecycle sc1-consumer shape (McpWiringLifecycle.kt:22,29-40): detectPresent, empty no-op, per-host runCatching`
- **[[c7]]** `prior-artifact` `LLD s4 errorPaths/invariants — per-host runCatching isolates HostFileAccessException; never mcp write, never removeRulesBlock (k4/lc1, k1 no cloud)`
- **[[c8]]** `analyze-bundle` `s1 capability-discovery — registration point InsrcAppLifecycle.appStarted (InsrcPluginStateListener.kt:47-50) registers McpWiringLifecycle + DaemonLifecycleService via LifecycleBroadcaster`
- **[[c9]]** `prior-artifact` `LLD s4 testStrategy unit level — SteeringContent + SteeringInjectionLifecycle against injected fakes (recording AiHostAdapter + fake steering-resource loader)`
- **[[c10]]** `prior-artifact` `LLD s4 testStrategy integration level — real AiHostAdapterImpl rules writer over temp files proving ac1/ac2/ac3`
