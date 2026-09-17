<!-- insrc:artifact PLAN-61d8c73edb68041a-s3 -->

# Plan: E2026091761d8c73e:S003

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**LLD run:** `wf-1789654397629-7l4mfy`
**LLD effective hash:** `7ebd2fd85012...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** S003 internal data model + service interfaces (lifecycle package) | S | — | unit: S003TypesTest: DaemonSetupAction/ProvisionKind/NodeSource are closed unions with exactly the declared members; NodeRuntime/ProvisionOutcome carry the declared fields | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** DaemonSetupPolicy.decide — pure probe×consent mapping | S | `t1` | unit: DecidePolicyTest#truthTable_allSixCells (CURRENT->NoOp x2; ABSENT/STALE x !consented->OfferSetup, consented->RunSilently) | [[c1]] |
| 3 | **`t3`** SetupConsentStore — app-scoped persisted consent (@Service APP) | S | `t1` | unit: SetupConsentStoreTest#isConsented_falseInitially_trueAfterRecord_stateRoundTrips | [[c4]] |
| 4 | **`t4`** NodeRuntimeResolver policy — tiered system-else-dispatch (ac3/ac4) | M | `t1` | unit: NodeRuntimeResolverTest#adequateSystemNode_sourceSYSTEM_provisionerNeverInvoked (ac4); unit: NodeRuntimeResolverTest#boundaryEqualsMin_adequate; unparseableOrAbsent_dispatchesToProvisioner; unit: NodeRuntimeResolverTest#noAdequateSystemNode_returnsProvisionedNode_sourcePROVISIONED (ac3); provisionerFailure_propagatesNodeProvisioningException | [[c2]] [[c7]] |
| 5 | **`t5`** PrivateNodeProvisioner — ensure/reuse a private Node under ~/.insrc/node (ac3) | M | `t1` | unit: PrivateNodeProvisionerTest#alreadyPresent_reusedNoReDownload (idempotent, injected fetcher not called); unit: PrivateNodeProvisionerTest#absent_downloadVerifyExtract_returnsExecutable (injected fetcher/extractor); unit: PrivateNodeProvisionerTest#fetchOrVerifyFailure_throwsNodeProvisioningException_noPartialRuntime; targetUrlIsNodeBinaryOnly_noCloudEndpoint | [[c2]] [[c7]] |
| 6 | **`t6`** DaemonProvisioner — delegate to installer / daemon-ctl, map exit codes | M | `t1` | unit: DaemonProvisionerTest#INSTALL_spawnsInstallScript_UPDATE_spawnsDaemonCtlUpdate_withNodeOnPath; unit: DaemonProvisionerTest#exitCodeMapping (0->ok; 2/3/4->ok=false mapped reason; spawnFailure/missingScript->ok=false captured not thrown) | [[c3]] [[c7]] |
| 7 | **`t7`** DaemonLifecycleService — sc1-triggered orchestration + single-flight, registered at app start | M | `t2`, `t3`, `t4`, `t5`, `t6` | integration: DaemonLifecycleServiceTest#absentNoConsent_surfacesOfferSetup_doesNotAutoRun (ac1, IntelliJ fixture); integration: DaemonLifecycleServiceTest#afterConsent_staleOpen_runsUpdateSilently_noPrompt (ac2); current_doesNothing; integration: DaemonLifecycleServiceTest#registeredAsBroadcasterConsumer_runsOffEDT; unit: DaemonLifecycleServiceTest#singleFlightGuard_secondConcurrentTrigger_doesNotLaunchSecondInstaller | [[c5]] [[c6]] |

### E2026091761d8c73e:S003:T001 — S003 internal data model + service interfaces (lifecycle package)

Introduce the S003-internal types under a new package ai.insors.insrc.jetbrains.lifecycle: DaemonSetupAction (closed union NoOp | OfferSetup(ProvisionKind) | RunSilently(ProvisionKind)), ProvisionKind (INSTALL | UPDATE), NodeRuntime ({executablePath, source: NodeSource=SYSTEM|PROVISIONED}), ProvisionOutcome ({ok, exitCode?, reason?}), NodeProvisioningException, and the interfaces DaemonSetupPolicy / NodeRuntimeResolver / PrivateNodeProvisioner / DaemonProvisioner / SetupConsentStore. Types + interfaces only; no behaviour.

**Acceptance checks:**
- DaemonSetupAction and ProvisionKind are closed Kotlin sealed types/enums with exactly the declared members; NodeSource has exactly SYSTEM|PROVISIONED
- NodeRuntime, ProvisionOutcome are immutable data carriers with the LLD-named fields; NodeProvisioningException is a RuntimeException
- the service interfaces declare the LLD signatures (decide/resolve/run/isConsented+recordConsent) plus an injectable PrivateNodeProvisioner interface (ensure-a-private-Node)
- lives under ai.insors.insrc.jetbrains.lifecycle and compiles against the existing S001/S002 module

### E2026091761d8c73e:S003:T002 — DaemonSetupPolicy.decide — pure probe×consent mapping

Implement decide(state: DaemonState, consented: Boolean): DaemonSetupAction as a pure total function over the closed union: CURRENT -> NoOp (either consent); ABSENT/!consented -> OfferSetup(INSTALL); ABSENT/consented -> RunSilently(INSTALL); STALE/!consented -> OfferSetup(UPDATE); STALE/consented -> RunSilently(UPDATE). Consumes sc2's DaemonState (never re-implements the probe). No IO.

**Acceptance checks:**
- the full (DaemonState × consented) truth table maps exactly as specified (ac1/ac2)
- CURRENT always -> NoOp regardless of consent
- pure/total: no IO, every (state,consented) pair returns a defined action

### E2026091761d8c73e:S003:T003 — SetupConsentStore — app-scoped persisted consent (@Service APP)

Implement SetupConsentStore as an application-scoped PersistentStateComponent via @Service(Service.Level.APP) (the S001 DaemonGatewayService pattern): isConsented(): Boolean and recordConsent(): Unit, persisted across IDE restarts. App-scoped, not per-project.

**Acceptance checks:**
- isConsented() is false initially and true after recordConsent()
- the flag is an @Service(APP) PersistentStateComponent (persists across restarts), app-scoped not per-project
- read-only isConsented never mutates state

### E2026091761d8c73e:S003:T004 — NodeRuntimeResolver policy — tiered system-else-dispatch (ac3/ac4)

Implement resolve(): NodeRuntime as the pure tiered POLICY over an injected system-Node probe and an injected PrivateNodeProvisioner (from t1): read the system `node -v`, parse major, compare >= NODE_MIN_MAJOR: adequate -> NodeRuntime(source=SYSTEM) with NO provisioning (ac4; boundary ==NODE_MIN_MAJOR adequate; unparseable/absent -> not adequate). Otherwise dispatch to the injected PrivateNodeProvisioner to ensure the private Node and return NodeRuntime(source=PROVISIONED) (ac3). NodeProvisioningException propagates when the provisioner fails. Fully unit-testable with a fake provisioner — no real download here.

**Acceptance checks:**
- system Node major >= NODE_MIN_MAJOR -> source=SYSTEM and the injected PrivateNodeProvisioner is NEVER invoked (ac4)
- boundary: system Node major == NODE_MIN_MAJOR is adequate; unparseable/absent `node -v` -> treated as not adequate (fail-safe -> dispatch to provisioner)
- no adequate system Node -> resolve() returns the provisioner's private Node as source=PROVISIONED (ac3)
- a provisioner failure surfaces as NodeProvisioningException (installer never handed a bad runtime); the policy holds NO download logic itself (that is t5)

### E2026091761d8c73e:S003:T005 — PrivateNodeProvisioner — ensure/reuse a private Node under ~/.insrc/node (ac3)

Implement the concrete PrivateNodeProvisioner (the interface from t1): ensure a private Node >= NODE_MIN_MAJOR under ~/.insrc/node for the current os/arch — reuse an already-provisioned one (idempotent, no re-download), else download + verify + extract; throw NodeProvisioningException on download/verify/arch/offline failure. Fetches only a Node binary — no cloud LLM/REST path (k1). This is the one genuinely new/risky task; keep the network/fs steps behind small injectable seams so its logic is testable without a real network fetch.

**Acceptance checks:**
- an already-provisioned private Node under ~/.insrc/node is reused with no re-download (idempotent)
- when absent, it downloads+verifies+extracts a Node >= NODE_MIN_MAJOR for the current os/arch and returns its executable path
- download/verify/arch/offline failure -> NodeProvisioningException (no partial/unusable runtime returned)
- fetches only a Node runtime binary — opens no cloud LLM/REST endpoint (k1)

### E2026091761d8c73e:S003:T006 — DaemonProvisioner — delegate to installer / daemon-ctl, map exit codes

Implement run(kind, node): ProvisionOutcome via an injected subprocess runner: put node.executablePath on PATH and spawn the EXISTING tooling unchanged — INSTALL -> scripts/insrc-daemon-install.sh, UPDATE -> daemon-ctl.sh update. Capture the child exit code into ProvisionOutcome (0->ok; 2 prereq / 3 source / 4 git-npm-build -> ok=false with a mapped reason); a missing script or spawn failure is captured (ok=false), not thrown. Never reproduce clone/build logic (lc1/k5).

**Acceptance checks:**
- INSTALL spawns insrc-daemon-install.sh, UPDATE spawns daemon-ctl.sh update, each with the resolved Node on PATH
- exit 0 -> ProvisionOutcome(ok=true); exit 2/3/4 -> ok=false with the mapped reason; spawn failure / missing script -> ok=false captured (not thrown)
- no clone/npm/build logic is reproduced in the plugin — only the scripts are invoked (lc1/k5)
- the subprocess runner is injected so exit-code mapping + target selection are unit-testable with no real process

### E2026091761d8c73e:S003:T007 — DaemonLifecycleService — sc1-triggered orchestration + single-flight, registered at app start

Wire the pieces: a DaemonLifecycleService implementing PluginLifecycle.onProjectOpened(ctx) (sc1 consumer, off-EDT) that probes sc2, calls decide(state, consent), and for OfferSetup prompts a single one-click IDE action (records consent on accept) / for RunSilently runs directly; the action resolves the NodeRuntime (t4->t5) and invokes DaemonProvisioner (t6), surfacing the outcome as an IDE notification (non-modal for silent failures). A single-flight guard serialises concurrent project-open triggers so the app-scoped daemon is never double-installed. Registered as a broadcaster consumer in InsrcAppLifecycle.appStarted (mirroring S002's McpWiringLifecycle).

**Acceptance checks:**
- on project open with ABSENT/STALE + no consent, exactly one one-click OfferSetup is surfaced and nothing auto-runs; accepting records consent (ac1)
- after consent, a later open with STALE runs the update via the provisioner with NO prompt (ac2); CURRENT -> no prompt, no provisioner call
- a silent (consented) failure surfaces a non-modal notification (never a silent breakage); a failed install/update leaves the daemon absent/stale for re-offer on the next open
- concurrent project-open triggers are serialised by a single-flight guard (no double-install); the service runs off the EDT and is registered in InsrcAppLifecycle.appStarted; it never calls registerProject (S005) or touches sc3 (S002)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DaemonSetupPolicy.decide: exhaustive (DaemonState x consented) truth table — CURRENT->NoOp (either consent); ABSENT/!consented->OfferSetup(INSTALL); ABSENT/consented->RunSilently(INSTALL); STALE/!consented->OfferSetup(UPDATE); STALE/consented->RunSilently(UPDATE) | `t2` |
| NodeRuntimeResolver: system Node major >= NODE_MIN_MAJOR -> source=SYSTEM, no provisioning (ac4); system Node absent or too old (or unparseable `node -v`) -> provision private Node under ~/.insrc/node, source=PROVISIONED (ac3); an already-provisioned private Node is reused (idempotent, no re-download); provisioning failure -> NodeProvisioningException | `t4`, `t5` |
| boundary: system Node major == NODE_MIN_MAJOR is treated as adequate (ac4) | `t4` |
| DaemonProvisioner.run: maps installer exit codes to ProvisionOutcome (0->ok; 2 prereq / 3 source / 4 build -> ok=false with mapped reason) and selects the right target (INSTALL->install script, UPDATE->daemon-ctl update) via an injected subprocess runner — no real process | `t6` |
| SetupConsentStore: isConsented reflects recordConsent; after recordConsent, decide yields RunSilently (ac2) | `t3`, `t2` |
| single-flight guard: a second concurrent trigger does not launch a second installer while one is in flight | `t7` |
| On project open with the daemon ABSENT and no prior consent, the service surfaces the one-click OfferSetup and does NOT auto-run (ac1) | `t7` |
| After consent is recorded, a later open with the daemon STALE runs the update via the provisioner WITHOUT a prompt (ac2) | `t7` |
| On project open with the daemon CURRENT, the service does nothing (no prompt, no provisioner call) | `t7` |
| The DaemonLifecycleService is registered as a sc1 LifecycleBroadcaster consumer and its work runs off the EDT | `t7` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails DaemonSetupPolicy.decide + dataModel DaemonSetupAction/ProvisionKind` — "decide(state,consented): pure total mapping over DaemonState x consent -> NoOp/OfferSetup/RunSilently; CURRENT->NoOp, ABSENT->install, STALE->update, prompt-once (ac1) vs silent (ac2)."
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails NodeRuntimeResolver.resolve + dataModel NodeRuntime (installer NODE_MIN_MAJOR)` — "resolve(): system Node >= NODE_MIN_MAJOR -> SYSTEM (ac4) else provision a private Node under ~/.insrc/node -> PROVISIONED (ac3); NodeProvisioningException on failure; the installer (scripts/insrc-daem"
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails DaemonProvisioner.run + dataModel ProvisionKind/ProvisionOutcome (installer + daemon-ctl)` — "run(kind,node): INSTALL->insrc-daemon-install.sh, UPDATE->daemon-ctl.sh update; map exit codes 2/3/4 into ProvisionOutcome; never reproduce clone/build (lc1/k5)."
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails SetupConsentStore + dataModel SetupConsent (@Service APP)` — "SetupConsentStore.isConsented/recordConsent — an app-scoped PersistentStateComponent (@Service(Service.Level.APP), the S001 DaemonGatewayService pattern) gating ac1 prompt-once vs ac2 silent."
- **[[c5]]** `prior-artifact` `LLD s3 contractDetails DaemonLifecycleService.onProjectOpened + interactionWithShared sc1` — "DaemonLifecycleService consumes sc1 onProjectOpened (off-EDT, LifecycleBroadcaster consumer) as the trigger; owns no shared contract; registered at app start."
- **[[c6]]** `prior-artifact` `LLD s3 interactionWithShared sc2 + invariants (lc1/k5 reuse installer)` — "S003 consumes sc2 DaemonGateway.probe() -> DaemonState to drive decide; delegates to the existing installer/daemon-ctl unchanged (lc1/k5), never registerProject (S005)."
- **[[c7]]** `prior-artifact` `LLD s3 invariantsToPreserve (k1 no cloud path; k5 reuse installer + honour NODE_MIN_MAJOR)` — "No new cloud path: S003 fetches only a Node runtime binary and drives the git installer (k1); setup/update reuse the installer unchanged and honour Node>=NODE_MIN_MAJOR (lc1/k5)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T14:44:11.628Z

_No load-bearing premises were extracted._
