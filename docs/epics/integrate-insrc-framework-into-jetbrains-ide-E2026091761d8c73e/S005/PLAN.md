<!-- insrc:artifact PLAN-61d8c73edb68041a-s5 -->

# Plan: E2026091761d8c73e:S005

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**LLD run:** `wf-1789662272635-nyd1tu`
**LLD effective hash:** `7ebd2fd85012...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** OnboardingOffer seam + production notification impl | S | — | unit: OnboardingOfferTest.offerEnable_isAFunInterface_capturesRootAndOnAccept | [[c6]] |
| 2 | **`t2`** OnboardingLifecycle (both hooks) + production() factory | M | `t1` | unit: OnboardingLifecycleTest.hostPresentUnregistered_offersOnce_registersNothingUntilAccept; unit: OnboardingLifecycleTest.acceptCallback_registersOnce_reportsResult; unit: OnboardingLifecycleTest.emptyDetectPresent_noOffer_noop; unit: OnboardingLifecycleTest.alreadyRegistered_noOffer; unit: OnboardingLifecycleTest.isProjectRegisteredThrows_caught_noOffer; unit: OnboardingLifecycleTest.registerProjectThrows_caught_failureNotification_noCrash; unit: OnboardingLifecycleTest.registrationRejected_surfacesReason; unit: OnboardingLifecycleTest.onPluginUninstalled_removesMcpAndRulesPerHost_zeroWrites; unit: OnboardingLifecycleTest.onPluginUninstalled_emptyDetect_noop; unit: OnboardingLifecycleTest.perHostRemovalException_isolated_otherHostStillCleaned | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 3 | **`t3`** Register OnboardingLifecycle in InsrcAppLifecycle.appStarted | S | `t2` | integration: OnboardingWiringTest.onboardingLifecycle_registeredOnBroadcaster_offEdt_and_reachedByUninstall | [[c4]] |
| 4 | **`t4`** Unit + integration tests (JUnit + IntelliJ Platform Test Framework) | M | `t3` | integration: OnboardingCleanupIntegrationTest.uninstall_restoresMcpAndRulesToPreInsrcBytes_realAdapter; integration: OnboardingCleanupIntegrationTest.hostWithNoInsrcSection_leftByteUnchanged; integration: OnboardingCleanupIntegrationTest.disable_deliversNoUninstallEvent_filesLeftInPlace | [[c7]] |

### E2026091761d8c73e:S005:T001 — OnboardingOffer seam + production notification impl

Add the OnboardingOffer fun-interface (fun offerEnable(projectRootPath: String, onAccept: () -> Unit)) in a new ai.insors.insrc.jetbrains.onboarding package, plus a production impl mirroring DaemonLifecycleService.showOfferSetupNotification: the 'insrc' BALLOON NotificationGroup + a NotificationAction 'Enable' whose click runs onAccept (title e.g. 'insrc: enable for this project?'). Injectable so the onboarding orchestration is unit-testable with a fake.

**Acceptance checks:**
- OnboardingOffer is a fun-interface with offerEnable(projectRootPath, onAccept).
- The production impl uses the existing 'insrc' NotificationGroup + NotificationAction whose click invokes onAccept (mirrors showOfferSetupNotification).
- No cloud path introduced (k1); the offer allocates nothing by itself.

### E2026091761d8c73e:S005:T002 — OnboardingLifecycle (both hooks) + production() factory

Add OnboardingLifecycle : PluginLifecycle with injected (gateway: DaemonGateway, adapter: AiHostAdapter, offer: OnboardingOffer, notify: (String)->Unit, execute: (Runnable)->Unit) and a companion production() binding service<DaemonGatewayService>() + AiHostAdapterImpl() + the real OnboardingOffer + IDE notify + AppExecutorUtil (mirroring DaemonLifecycleService.production). Implement in the order production()/constructor wiring -> onPluginUninstalled (simplest, mirrors the S002/S004 per-host loop) -> onProjectOpened offer+accept-callback last, so the trickiest path lands on a compiling base. onProjectOpened(ctx): off-EDT; runCatching gateway.isProjectRegistered; adapter.detectPresent() empty -> no-op; else if !registered call offer.offerEnable(ctx.projectRootPath) { off-EDT runCatching gateway.registerProject(root); on DaemonUnavailableException notify a failure; on RegistrationResult(false,reason) notify reason; on true notify enabled }. onPluginUninstalled(): for each detectPresent() host, per-host runCatching { removeMcpRegistration(host); removeRulesBlock(host) }. Never writes host files; never re-implements detection/repo.add/removers.

**Acceptance checks:**
- onProjectOpened: detectPresent() empty -> no offer, nothing registered (ac3); host present + isProjectRegistered==false -> offerEnable called once; isProjectRegistered==true -> no offer (ac2).
- registerProject is called ONLY from the offer accept-callback, never during onProjectOpened (ac1/ac2/lc1).
- DaemonUnavailableException from isProjectRegistered (open) and from registerProject (accept) are both caught -> no crash, no offer / failure notification respectively; RegistrationResult(false,reason) surfaces the reason.
- onPluginUninstalled: per detected host calls removeMcpRegistration+removeRulesBlock with per-host runCatching isolation; 0 writeMcp/0 writeRules calls; empty detectPresent -> no-op (ac4).
- production() wires the real @Service gateway + AiHostAdapterImpl + notifications; work runs off the EDT.

### E2026091761d8c73e:S005:T003 — Register OnboardingLifecycle in InsrcAppLifecycle.appStarted

Add LifecycleBroadcaster.register(OnboardingLifecycle.production()) in InsrcAppLifecycle.appStarted, alongside the existing McpWiringLifecycle/DaemonLifecycleService/SteeringInjectionLifecycle registrations, so the onboarding offer runs on project open and the cleanup runs on true uninstall.

**Acceptance checks:**
- InsrcAppLifecycle.appStarted registers OnboardingLifecycle via LifecycleBroadcaster.register alongside the three existing consumers.
- onProjectOpened work runs off the EDT; onPluginUninstalled is reached via firePluginUninstalled on a true uninstall (not a disable).

### E2026091761d8c73e:S005:T004 — Unit + integration tests (JUnit + IntelliJ Platform Test Framework)

Wave A (pure fakes, no fixture): unit tests over OnboardingLifecycle with a fake DaemonGateway (isProjectRegistered true/false/throws; registerProject true/false/throws), a recording fake AiHostAdapter (detectPresent present/absent/both; recording removeMcp/removeRules + write* asserted never called; optional HostFileAccessException), a fake OnboardingOffer capturing (root,onAccept), a recording notify + synchronous executor — covering ac1/ac2/ac3 offer gating, accept-callback registerProject + error/reason handling, and ac4 per-host cleanup + isolation. Wave B (IntelliJ Platform fixture): an integration test over the real AiHostAdapterImpl proving onPluginUninstalled restores a host's mcp.json + rules.md to their pre-insrc bytes (seeded via the real writeMcpRegistration/writeRulesBlock), and that OnboardingLifecycle is a registered sc1 broadcaster consumer running off the EDT. Implement Wave A first. Verify locally JDK21+Gradle8.10; no GitHub CI.

**Acceptance checks:**
- Wave A unit tests cover: offer gating (host+unregistered->offer, empty-detect no-op, already-registered no-op), registerProject only-on-accept + DaemonUnavailableException/RegistrationResult(false) handling, and per-host removeMcp+removeRules with isolation and 0 writes.
- Wave B integration test proves uninstall restores mcp.json + rules.md to pre-insrc bytes via the real AiHostAdapterImpl, and the disable-vs-uninstall distinction (no uninstall event on disable).
- The full jetbrains-plugin suite compiles and passes locally (JDK21 + Gradle 8.10).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| onProjectOpened with a host present + isProjectRegistered==false -> OnboardingOffer.offerEnable is called once with ctx.projectRootPath and NOTHING is registered until the injected onAccept runs (ac1/ac2) | `t2` |
| the offer's accept-callback calls gateway.registerProject(projectRootPath) exactly once and reports the RegistrationResult (registered / reason) | `t2` |
| onProjectOpened with detectPresent() empty -> no offerEnable call, no gateway query beyond nothing visible (ac3 no-op) | `t2` |
| onProjectOpened with isProjectRegistered==true -> no offerEnable call (already registered, ac2) | `t2` |
| a DaemonUnavailableException from isProjectRegistered is caught -> no offer shown, no throw into the caller | `t2` |
| a DaemonUnavailableException from registerProject in the accept-callback is caught -> a failure notification, no crash | `t2` |
| registerProject returning RegistrationResult(false, reason) -> the reason is surfaced via notify and nothing further registered | `t2` |
| onPluginUninstalled iterates detectPresent() and calls removeMcpRegistration(host)+removeRulesBlock(host) once per host (ac4), with 0 writeMcp/0 writeRules calls (S005 never writes) | `t2` |
| onPluginUninstalled with empty detectPresent() -> no removal calls (clean no-op) | `t2` |
| a HostFileAccessException from one host's removal is caught (per-host runCatching) and the other host is still fully cleaned | `t2` |
| onPluginUninstalled over a real AiHostAdapterImpl with a host whose mcp.json + rules.md carry insrc content restores BOTH files to their exact pre-insrc bytes (ac4/lc2) — the insrc mcpServers.insrc key and the RULES-delimited section are gone, surrounding developer content preserved | `t4` |
| a host whose files have developer content but NO insrc section is left byte-unchanged by the removals (no-op removal) | `t4` |
| OnboardingLifecycle is registered as a sc1 LifecycleBroadcaster consumer and its onProjectOpened work runs off the EDT | `t3` |
| firePluginUninstalled (the true-uninstall path) reaches OnboardingLifecycle.onPluginUninstalled, whereas no such event is delivered on a mere disable (ac4 uninstall-vs-disable) | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails/interactionWithShared — sc2 DaemonGateway.isProjectRegistered + registerProject (strict repo.add), consumed unchanged`
- **[[c2]]** `prior-artifact` `LLD s5 contractDetails/interactionWithShared — sc3 AiHostAdapter.detectPresent + removeMcpRegistration + removeRulesBlock (inverses of S002/S004 writes), consumed unchanged`
- **[[c3]]** `prior-artifact` `LLD s5 errorPaths — DaemonUnavailableException on open/accept, RegistrationResult(false,reason) rejection, per-host HostFileAccessException isolation`
- **[[c4]]** `analyze-bundle` `s1 usage.example — InsrcAppLifecycle.appStarted registration point + InsrcPluginStateListener.uninstall->firePluginUninstalled routing (true-uninstall only) + sibling onPluginUninstalled no-ops S005 fills`
- **[[c5]]** `prior-artifact` `LLD s5 contractDetails + dataModel — OnboardingLifecycle.onProjectOpened (offer gating + accept-callback) and onPluginUninstalled (per-host cleanup); OnboardingLifecycle new entity`
- **[[c6]]** `analyze-bundle` `s1 capability-discovery — DaemonLifecycleService one-click offer + production() factory pattern (showOfferSetupNotification, NotificationGroup 'insrc' + NotificationAction) the OnboardingOffer seam mirrors`
- **[[c7]]** `prior-artifact` `LLD s5 testStrategy — unit (fake gateway/adapter/offer) + integration (real AiHostAdapterImpl restore, uninstall-vs-disable)`
