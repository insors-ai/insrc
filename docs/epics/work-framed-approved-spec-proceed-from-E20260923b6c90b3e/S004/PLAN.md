<!-- insrc:artifact PLAN-b6c90b3e0240d36c-s4 -->

# Plan: E20260924b6c90b3e:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790230251000-v9ucge`
**LLD effective hash:** `0a15cb12814d...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Gateway sc1/sc2 client bindings + last-seen state store | M | — | unit: gateway update(): rpc.call('daemon.update') -> launched:true=Ok, launched:false/error=Failed, DaemonUnavailable=Failed (never a shell-out, k2); unit: gateway updateOutcome(): rpc.call('daemon.updateOutcome') -> Loaded(state,error?,finishedAt) for a record, None for null, Unavailable when down; unit: gateway daemonStatus(): installedCommit extracted (present=sha, absent=''); Gson-Double coercion + Loaded/Stopped/Unavailable contract unchanged; unit: last-seen PersistentStateComponent: null before write, persisted after setLastSeen; getState/loadState round-trip lastSeenPluginVersion | [[c1]] [[c2]] [[c3]] [[c7]] |
| 2 | **`t2`** Pure DaemonFreshnessFlow + seam types | M | `t1` | unit: startup-check drift: reachable + installedCommit != upstream + current==lastSeen -> Update/Dismiss balloon; update() ONLY on Update, NOT on Dismiss/expire (ac1); unit: skip paths: unreachable -> no balloon/no update; installedCommit=='' -> skip; installedCommit==upstream -> skip; gitLsRemote ''/throws -> skip (ac2); unit: self-update: current!=lastSeen + drift -> update() with NO prompt (notify-after), setLastSeen(current) recorded (ac3); unit: reconnect-and-confirm success: fresh updateOutcome().state=='succeeded' / installedCommit advances -> info balloon; unit: failure: update() Failed OR fresh updateOutcome().state=='failed' OR no commit advance in budget -> exactly ONE failure balloon with the raw error, no retry, no second update() (ac4); unit: never-throws: a throwing seam is swallowed by the outer backstop; check() returns; setLastSeen(current) runs on every terminal path; unit: empty-version guard: current=='' (PluginManagerCore null) -> startup-check prompt path, not the silent auto path; unit: stale-outcome guard: a prior updateOutcome with finishedAt before the update start is ignored; commit-advance decides | [[c4]] [[c5]] [[c6]] |
| 3 | **`t3`** App-scoped freshness consumer wiring (off-EDT, real seams) | S | `t2` | unit: consumer onProjectOpened schedules check() via the injected executor (fire-and-forget, returns immediately) — driven with a synchronous test executor; unit: source-scan: the freshness consumer wiring adds NO controller.run / daemon-ctl.sh shell-out for the update (k2) | [[c4]] [[c5]] |

### E20260924b6c90b3e:S004:T001 — Gateway sc1/sc2 client bindings + last-seen state store

Add the client-side bindings the Kotlin plugin lacks so the flow can CONSUME the daemon-owned sc1/sc2 IPC (never a shell-out, k2): (a) DaemonGateway.update(): DaemonActionResult calling rpc.call("daemon.update") via the runAction template (like shutdown()/compact()); (b) DaemonGateway.updateOutcome(): DaemonUpdateOutcomeResult calling rpc.call("daemon.updateOutcome") — add the new sealed DaemonUpdateOutcomeResult { Loaded(state,error?,finishedAt) | None | Unavailable } modeled on DaemonStatusResult; (c) DaemonStatusDto gains installedCommit: String = "" extracted in parseDaemonStatus (default '' for a pre-S002 daemon, never-throw parse preserved); (d) add the delegate lines in DaemonGatewayService; (e) a new @Service(APP) PersistentStateComponent last-seen store (lastSeenPluginVersion: String) modeled on SetupConsentStoreService (Storage insrc.xml). PATCH every DaemonGateway fake/impl in tests (FakeGateway + any others) for the two new interface methods (known gotcha). No deps.

**Acceptance checks:**
- DaemonGateway interface + DaemonGatewayImpl gain update(): DaemonActionResult (rpc.call('daemon.update')) and updateOutcome(): DaemonUpdateOutcomeResult (rpc.call('daemon.updateOutcome')); DaemonGatewayService delegates both
- new sealed DaemonUpdateOutcomeResult { Loaded(state,error?,finishedAt) | None | Unavailable } added, modeled on DaemonStatusResult
- DaemonStatusDto has installedCommit: String = "" and parseDaemonStatus extracts it (present -> sha, absent -> ''); Loaded/Stopped/Unavailable contract + Gson-Double coercion of existing fields unchanged
- a new @Service(APP) PersistentStateComponent stores lastSeenPluginVersion:String (getState/loadState round-trip), Storage insrc.xml
- every DaemonGateway fake/impl in test sources (incl. FakeGateway) is patched for the two new methods; ./gradlew test compiles + green (JDK21)

### E20260924b6c90b3e:S004:T002 — Pure DaemonFreshnessFlow + seam types

Add the VS-fixture-free pure flow DaemonFreshnessFlow.check(deps: FreshnessDeps) — the JetBrains analogue of S003's runDaemonFreshnessCheck — plus the seam types FreshnessDeps / FreshnessGateway (reachability/installedCommit/update/updateOutcome view over t1's gateway) / FreshnessNotify (UpdatePrompt|Info|Failure) / PluginVersionState (current + getLastSeen/setLastSeen). Flow: reachability gate (k6, skip unless reachable) -> installedCommit (sc2, '' -> skip) -> gitLsRemote(root,branch) drift (k1 no pull; ''/throw -> skip; ==installed -> skip) -> branch on version delta (k4, current=='' guard -> prompt path): self-update auto notify-after vs startup-check Update/Dismiss balloon -> update() -> reconnect-and-confirm via updateOutcome()/installedCommit under reconnectBudgetMs (300_000; stale-outcome guard by finishedAt>=start) -> success info balloon OR exactly ONE failure balloon with the raw error (k5, no retry/rollback); always setLastSeen(current) on every terminal path; outer try/catch = never throws. Injected sleep/now for deterministic tests. Deps t1.

**Acceptance checks:**
- DaemonFreshnessFlow.check(deps) + FreshnessDeps/FreshnessGateway/FreshnessNotify/PluginVersionState added; pure, no IDE-fixture/platform import; never throws (outer try/catch)
- startup-check drift (current==lastSeen) -> Update/Dismiss balloon (k7); update() ONLY on Update; unreachable/''-commit/==upstream/ls-remote-fail -> skip (no balloon/update)
- self-update (current!=lastSeen, current!='') + drift -> update() with NO prompt (notify-after); current=='' guard -> prompt path
- after update(): bounded reconnect-and-confirm via updateOutcome()/installedCommit; success -> info balloon; update() Failed OR fresh updateOutcome().state=='failed' OR no commit advance in budget -> exactly ONE failure balloon with the raw error, no retry; stale outcome (finishedAt<start) ignored
- setLastSeen(current) on every terminal path; ./gradlew test green (JDK21)

### E20260924b6c90b3e:S004:T003 — App-scoped freshness consumer wiring (off-EDT, real seams)

Add InstalledCommitFreshnessConsumer (a new app-scoped consumer) registered in AppScopedConsumers.ensureRegistered() alongside DaemonLifecycleService; onProjectOpened schedules DaemonFreshnessFlow.check(realSeams) fire-and-forget off-EDT via AppExecutorUtil.getAppExecutorService() and returns immediately (never blocks project-open, k6). Supply the real seams: gateway view = service<DaemonGatewayService>(); notify = the insrc NotificationGroup balloon (two NotificationAction.createSimple buttons Update/Dismiss for the prompt, a plain info notify, a single failure balloon — mirroring showOfferSetupNotification, k7); versionState = PluginManagerCore.getPlugin(PLUGIN_ID)?.version (?? '') + the t1 last-seen store; gitLsRemote = a ProcessBuilder git ls-remote origin <branch> runner (returns '' on any failure, never throws). Deps t2.

**Acceptance checks:**
- InstalledCommitFreshnessConsumer registered in AppScopedConsumers.ensureRegistered() alongside DaemonLifecycleService; onProjectOpened schedules check() off-EDT via AppExecutorUtil.getAppExecutorService() and returns immediately (fire-and-forget)
- real seams wired: gateway view over service<DaemonGatewayService>(); notify = insrc NotificationGroup balloon with Update/Dismiss (k7); versionState = PluginManagerCore version + the last-seen store; gitLsRemote = a ProcessBuilder git ls-remote returning '' on failure
- no controller.run / daemon-ctl.sh shell-out is added for the freshness update (k2)
- a unit test drives onProjectOpened with a synchronous test executor to assert check() is scheduled fire-and-forget; ./gradlew test green (JDK21)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| startup-check drift: reachable + installedCommit != upstream + current==lastSeen → an Update/Dismiss balloon is shown; on Update gateway.update() is called; on Dismiss/expire it is NOT (ac1) | `t2` |
| skip paths: unreachable → no balloon/no update; installedCommit=='' → skip; installedCommit==upstream → skip; gitLsRemote ''/throws → skip (ac2) | `t2` |
| self-update: current!=lastSeen + drift → gateway.update() called with NO prompt (notify-after), setLastSeen(current) recorded (ac3) | `t2` |
| reconnect-and-confirm success: after update() a fresh updateOutcome().state=='succeeded' / installedCommit advances → an info balloon | `t2` |
| failure: update() Failed OR fresh updateOutcome().state=='failed' OR commit never advances within budget → exactly ONE failure balloon carrying the raw error; no retry, no second update() (ac4) | `t2` |
| never-throws: any throwing seam is swallowed by the outer backstop — check() returns, setLastSeen(current) runs on every terminal path | `t2` |
| empty-version guard: current=='' (PluginManagerCore null) → startup-check prompt path, not the silent auto path | `t2` |
| stale-outcome guard: a prior updateOutcome with finishedAt before the update start is ignored; commit-advance decides | `t2` |
| update(): rpc.call('daemon.update') mapping — launched:true → Ok, launched:false / error result → Failed; DaemonUnavailable → Failed (k2: the call goes to daemon.update, never a shell-out) | `t1` |
| updateOutcome(): rpc.call('daemon.updateOutcome') → Loaded(state,error?,finishedAt) for a record, None for null, Unavailable when the daemon is down | `t1` |
| daemonStatus(): installedCommit extracted into DaemonStatusDto (present → the sha; absent → ''); Gson Double coercion of the other numeric fields still holds; the Loaded/Stopped/Unavailable contract is unchanged | `t1` |
| the last-seen store returns null before any write and the persisted value after setLastSeen; getState/loadState round-trip the lastSeenPluginVersion string | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails: DaemonGateway.update()/updateOutcome() + the runAction template (DaemonGateway.kt:492/:1145) — the gateway surface t1 extends`
- **[[c2]]** `prior-artifact` `LLD s4 interactionWithShared sc1 (daemon.update/daemon.updateOutcome) + dataModelChanges DaemonUpdateOutcomeResult — the sc1 client binding t1 adds`
- **[[c3]]** `prior-artifact` `LLD s4 error/convention: the k2 boundary (no daemon-ctl.sh shell-out; DaemonProvisioner/DaemonLifecycleCommandRunner NOT reused) t1/t3 honor`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails DaemonFreshnessFlow.check + InstalledCommitFreshnessConsumer.onProjectOpened + errorPaths (never-throws, reconnect-confirm, single-failure) — the pure flow (t2) + off-EDT wiring (t3)`
- **[[c5]]** `analyze-bundle` `s1 structural-map: startup/off-EDT wiring (InsrcProjectOpenActivity/AppScopedConsumers/DaemonLifecycleService AppExecutorUtil) + the insrc NotificationGroup balloon (showOfferSetupNotification) — t2 notify seam shape + t3 real seams`
- **[[c6]]** `prior-artifact` `LLD s4 interactionWithShared sc2 (DaemonStatus.installedCommit) + the never-throw daemon.status invariant — the freshness anchor t2 reads (t1 extracts)`
- **[[c7]]** `analyze-bundle` `s1 capability-discovery + convention: DaemonStatusDto/parseDaemonStatus (DaemonGateway.kt:385/:1330), the SetupConsentStoreService PersistentStateComponent template + PLUGIN_ID, and the JUnit5 gateway-parse fake idiom (RecordingRpc/FakeGateway) — t1 DTO field-add + last-seen store + the fake-patching gotcha`
