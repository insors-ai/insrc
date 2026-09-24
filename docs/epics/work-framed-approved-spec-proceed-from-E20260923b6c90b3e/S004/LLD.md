<!-- insrc:artifact LLD-b6c90b3e0240d36c-s4 -->

# LLD: E20260924b6c90b3e:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790185288043-yyq6gx`
**HLD effective hash:** `0a15cb12814d...`

## HLD context

**Framework:** Both plugins keep the locally-installed insrc daemon current over ONE net-new daemon-owned update+restart IPC. The daemon exposes a single request that pulls, rebuilds and self-restarts by spawning a DETACHED helper (the proven daemon-ctl.sh update+restart sequence) — the only safe way a process respawns itself, since the request's own socket dies mid-restart. Freshness is judged purely by git-commit comparison: the daemon reports its installed source commit additively on the existing daemon.status; each plugin runs a remote git ls-remote (no pull) against the daemon repo's default branch and compares. On drift the startup path shows a native in-IDE notification (Update/Dismiss) and updates only on approval; a plugin self-update triggers the daemon update automatically (notify-after, fire-and-forget). Failure surfaces once with the raw error; no retry/rollback — the daemon owns its state. The plugin confirms success by reconnecting and re-reading the installed commit.
**Rollout phase:** Phase B — plugin freshness flows (VS Code + JetBrains parity)
**Consumes:** `sc1` (DaemonUpdateRestart IPC), `sc2` (DaemonStatus.installedCommit)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The detached-helper mechanism itself is private to s1: how the daemon spawns daemon-ctl.sh update+restart fully detached (its own session/process group so it survives the daemon exit), where and how the DaemonUpdateOutcome record is persisted under the daemon home, and how the restarted daemon reads that record on boot to surface it. Callers see only the sc1 method shape — launch acknowledgement plus the reconnect-and-read-outcome protocol — never the helper wiring or the daemon-ctl.sh invocation details. — owns `sc1`
- `s2`: How the daemon computes its installed commit (running git rev-parse HEAD against the daemon root under the ~/.insrc home, caching vs re-reading, and the best-effort fallback to "" when the working copy is unavailable) stays private to s2. Consumers see only the installedCommit string on daemon.status; the never-throw best-effort guarantee of daemon.status is preserved. — owns `sc2`
- `s3`: Everything VS-Code-specific stays private to s3: the activation hook that runs the check opportunistically only when the daemon is already reachable (k6), the remote git ls-remote invocation and commit comparison, the showInformationMessage notification with inline Update/Dismiss (k7), the first-activation detection that distinguishes a plugin self-update from an ordinary startup (to pick the approval-prompt path vs the auto notify-after path, k4), the fire-and-forget scheduling so the daemon update never blocks the plugin's own startup, and the reconnect-and-confirm loop plus the single failure notification (k5). None of this is consumed by any other Story.

## Contract details

**Surface level:** internal

### `DaemonGateway.update`

```typescript
fun update(): DaemonActionResult
```

**Returns:** `DaemonActionResult` — Ok(message) when the daemon-owned detached update+restart helper was launched (sc1 DaemonUpdateResult.launched=true), Failed(error) when the launch was refused (e.g. 'update already in progress') or the daemon was unreachable. Reuses the existing DaemonActionResult sealed type (DaemonGateway.kt:460), like shutdown()/compact().

**Errors:**
- `DaemonUnavailableException` when the daemon socket is down when update() is called — surfaced as Failed via the runAction(...) helper, never thrown to the flow

**Preconditions:**
- The daemon is reachable (the flow gates on reachability first, k6).

**Postconditions:**
- Consumes the daemon-owned sc1 daemon.update IPC via rpc.call("daemon.update") (modeled on shutdown()/compact()+runAction, DaemonGateway.kt:1145) — NEVER the daemon-ctl.sh shell-out (k2).
- The daemon then restarts, so the current socket drops; the caller reconnect-and-confirms via updateOutcome()/daemonStatus().

### `DaemonGateway.updateOutcome`

```typescript
fun updateOutcome(): DaemonUpdateOutcomeResult
```

**Returns:** `DaemonUpdateOutcomeResult` — Loaded(state: succeeded|failed, error: String?, finishedAt: String) when the daemon has a persisted terminal outcome record; None when no outcome exists yet (still restarting); Unavailable when the daemon is unreachable. A new sealed type modeled on DaemonStatusResult (DaemonGateway.kt:405).

**Errors:**
- `DaemonUnavailableException` when socket down mid-restart — mapped to Unavailable by runAction, never thrown (the reconnect loop tolerates it)

**Preconditions:**
- Called during reconnect-and-confirm after update().

**Postconditions:**
- Consumes the daemon-owned sc1 daemon.updateOutcome IPC via rpc.call("daemon.updateOutcome"); parses the {state,error?,finishedAt} record.
- The flow treats an outcome as authoritative only when it is fresh (finishedAt at/after the update started), guarding against a stale prior record.

### `DaemonGateway.daemonStatus`

```typescript
fun daemonStatus(): DaemonStatusResult
```

**Returns:** `DaemonStatusResult` — Existing method (DaemonGateway.kt:664); its Loaded payload DaemonStatusDto now additionally carries installedCommit:String (sc2). The flow reads installedCommit as the freshness anchor and re-reads it during reconnect to confirm the commit advanced.

**Preconditions:**
- Reachable daemon (Stopped/Unavailable are the not-reachable results).

**Postconditions:**
- Consumes sc2: DaemonStatusDto.installedCommit is extracted in parseDaemonStatus (DaemonGateway.kt:1330); '' for a pre-S002 daemon → treated as undeterminable → skip (ac2).

### `DaemonFreshnessFlow.check`

```typescript
fun check(deps: FreshnessDeps): Unit
```

**Parameters:**
- `deps: FreshnessDeps` — The injected seams: a FreshnessGateway view (reachability/installedCommit/update/updateOutcome), a gitLsRemote runner (root,branch)->String, a notify seam (Update/Dismiss + info + failure), a versionState seam (current + lastSeen), and an optional reconnectBudget/clock/sleep. VS-fixture-free so the flow is JUnit5-unit-testable.

**Returns:** `Unit` — Completes when the check finishes or is skipped. NEVER throws — wrapped in an outer try/catch; it is scheduled fire-and-forget off the EDT and must never surface an error or block activation (k6).

**Errors:**
- `none` when all seam failures are caught internally; the function is total (never throws)

**Preconditions:**
- Fired once per plugin activation, off-EDT via AppExecutorUtil.getAppExecutorService(), not awaited on the activation path (k6).

**Postconditions:**
- Skips silently (no balloon, no update) when the daemon is unreachable, installedCommit is '', or installedCommit === the ls-remote upstream (ac2).
- On drift in startup-check mode (versionState.current === lastSeen): shows an insrc balloon with Update/Dismiss (k7) and calls gateway.update() ONLY on Update (k4/ac1).
- On drift in self-update mode (versionState.current !== lastSeen): calls gateway.update() with no prompt, notify-after (k4/ac3).
- After update(): reconnect-and-confirm via updateOutcome()/daemonStatus().installedCommit under the budget; success → info balloon, failure → a SINGLE failure balloon with the raw error, no retry/rollback (k5/ac4).
- Always calls versionState.setLastSeen(current) so the self-update path fires exactly once per plugin version.
- Invokes the daemon-owned sc1 IPC via gateway.update(); NEVER shells out to daemon-ctl.sh (k2).

### `InstalledCommitFreshnessConsumer.onProjectOpened`

```typescript
fun onProjectOpened(ctx: ProjectOpenedContext): Unit
```

**Parameters:**
- `ctx: ProjectOpenedContext` — The existing app-scoped consumer callback context (the same shape DaemonLifecycleService.onProjectOpened/OnboardingLifecycle.onProjectOpened consume), carrying the project + executor entry point.

**Returns:** `Unit` — The thin wiring consumer registered alongside DaemonLifecycleService in AppScopedConsumers.ensureRegistered(); schedules DaemonFreshnessFlow.check(realSeams) fire-and-forget off-EDT and returns immediately (never blocks project-open).

**Preconditions:**
- Registered once via the run-once AppScopedConsumers.ensureRegistered() (InsrcPluginStateListener.kt:99).

**Postconditions:**
- Supplies the real seams: gateway = service<DaemonGatewayService>(); notify = the insrc NotificationGroup balloon (k7); versionState = PluginManagerCore version + the PersistentStateComponent last-seen store; gitLsRemote = a ProcessBuilder git ls-remote runner; executor = AppExecutorUtil.getAppExecutorService().

## Data model changes

### `DaemonStatusDto` — field-add

Add installedCommit: String = "" (sc2). Extracted in parseDaemonStatus from the daemon.status JSON's installedCommit field; defaults to "" when absent (pre-S002 daemon) — the never-throw parse contract is preserved. Additive; all existing fields unchanged.

```
data class DaemonStatusDto(..., val repoCount: Int, + val installedCommit: String = "")
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:385`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1330`

### `DaemonUpdateOutcomeResult` — new

A new sealed result type for updateOutcome(): Loaded(state: OutcomeState, error: String?, finishedAt: String) | None (no record yet — still restarting) | Unavailable (daemon down). OutcomeState = succeeded|failed. Modeled on DaemonStatusResult (Loaded/Stopped/Unavailable, DaemonGateway.kt:405). Gson numbers arrive as Double, but this record has no numeric fields.

```
sealed interface DaemonUpdateOutcomeResult { data class Loaded(val state: String, val error: String?, val finishedAt: String): ...; object None; object Unavailable }
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:405`

### `FreshnessDeps` — new

The injected-seams container for DaemonFreshnessFlow.check (the JetBrains analogue of S003's DaemonFreshnessDeps): { gateway: FreshnessGateway (reachability()->DaemonState, installedCommit()->String, update()->DaemonActionResult, updateOutcome()->DaemonUpdateOutcomeResult); gitLsRemote: (root,branch)->String; notify: FreshnessNotify; versionState: PluginVersionState; daemonRoot: String; reconnectBudgetMs: Long = 300_000; sleep/now injectable }. VS-fixture-free.

```
class FreshnessDeps(gateway, gitLsRemote, notify, versionState, daemonRoot, reconnectBudgetMs, sleep, now)
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt:119`

### `FreshnessNotify` — new

The native-balloon seam: notify(kind: UpdatePrompt|Info|Failure, message, onUpdate?)->Unit resolving the chosen action. Real impl = the insrc NotificationGroup balloon with two addAction(NotificationAction.createSimple) buttons for the prompt (k7), a plain info notify, and a single failure balloon. Mirrors DaemonLifecycleService.showOfferSetupNotification.

```
fun interface FreshnessNotify { fun show(kind, message, onUpdate: (() -> Unit)?) }
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt:152`

### `PluginVersionState` — new

The per-plugin last-seen-version accessor (k4): { current: String (PluginManagerCore.getPlugin(PLUGIN_ID)?.version ?? ""); getLastSeen(): String?; setLastSeen(v: String) }. Persistence via a new @Service(APP) PersistentStateComponent modeled on SetupConsentStoreService (Storage insrc.xml), holding lastSeenPluginVersion: String.

```
interface PluginVersionState { val current: String; fun getLastSeen(): String?; fun setLastSeen(v: String) }
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/SetupConsentStoreService.kt:19`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/InsrcPlugin.kt:14`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S004 CONSUMES sc1 by adding the parallel Kotlin client binding the plugin lacks: DaemonGateway.update() calling rpc.call("daemon.update") (launch the daemon-owned update+restart) and updateOutcome() calling rpc.call("daemon.updateOutcome") (read the terminal succeeded/failed record after reconnect). Modeled on the existing shutdown()/compact()+runAction template; it does NOT re-implement the update, does NOT read the DaemonUpdateOutcome file directly, and does NOT reuse the daemon-ctl.sh shell-out (DaemonProvisioner / DaemonLifecycleCommandRunner) — k2. On approval (startup-check) or automatically (self-update) the flow calls update(), then reconnect-and-confirms via updateOutcome()/daemonStatus(). The daemon-side sc1 contract (owned by s1) is unchanged. |
| `sc2` | consumes | S004 CONSUMES sc2 by adding installedCommit:String to DaemonStatusDto + extracting it in parseDaemonStatus, then reading daemonStatus().installedCommit as the freshness anchor and comparing it against the upstream commit from its own git ls-remote (no pull) against the daemon repo default branch (k1). A '' installedCommit (pre-S002 daemon / undeterminable) → skip the check (ac2). How the daemon computes the commit stays s2-internal; S004 only reads the string. |

## Error paths

### Error cases

- **The daemon is unreachable when the check runs (socket down / daemon not started)** (recoverable)
  - Detection: deps.gateway.reachability() returns a non-reachable DaemonState (ABSENT/STALE-as-down), OR the bounded daemonStatus() read comes back Stopped/Unavailable — the flow gates on reachability first.
  - Response: Skip silently: no balloon, no update, no daemon autostart (k6). Still call versionState.setLastSeen(current) so a self-update does not re-fire endlessly across unreachable activations.
  - User impact: Nothing shown; the check is skipped for that activation (ac2).
- **The plugin-side git ls-remote fails or returns no commit (network down, no remote, non-git daemon root)** (recoverable)
  - Detection: deps.gitLsRemote(root, branch) throws (ProcessBuilder non-zero exit / IOException) or returns '' after parsing — caught in the flow's try/catch.
  - Response: Treat upstream as undeterminable → skip the drift check silently (no balloon). Bounded so a slow/hanging ls-remote (run off-EDT) never blocks activation.
  - User impact: No balloon; freshness simply not determined this activation (ac2, nonFunctional).
- **installedCommit is '' (daemon on a pre-S002 build, or a non-git daemon root)** (recoverable)
  - Detection: deps.gateway.installedCommit() (from daemonStatus().installedCommit) === '' — the sc2 undeterminable sentinel.
  - Response: Skip silently — cannot compare, so no drift decision; no balloon, no update.
  - User impact: No balloon; the check degrades to 'undeterminable' rather than erroring (ac2). A pre-S002 daemon simply isn't checked until it carries the field.
- **The daemon update fails (update() returns Failed, or reconnect-and-confirm finds a fresh updateOutcome().state=='failed' or the commit never advances within the budget)** (recoverable)
  - Detection: gateway.update() returns DaemonActionResult.Failed(error) (caught), OR after reconnect gateway.updateOutcome() returns a FRESH Loaded(state='failed', error) / gateway.installedCommit() never advances past the pre-update commit within reconnectBudgetMs.
  - Response: Show a SINGLE failure balloon with the raw error (from the fresh updateOutcome().error, or the Failed(error), or 'daemon did not come back'); do NOT retry, do NOT roll back (k5). The daemon owns its post-update state.
  - User impact: One clear failure balloon with the underlying error; the user can retry manually later (ac4).
- **A gateway/notification/version seam throws unexpectedly (e.g. PluginManagerCore returns null, a Notification static fails, Gson coercion error in parse)** (recoverable)
  - Detection: Any throw inside the flow is caught by the outer try/catch backstop wrapping DaemonFreshnessFlow.check.
  - Response: Swallow (best-effort) — check() returns without throwing, since it is scheduled fire-and-forget off-EDT and must never surface an error into project-open. setLastSeen(current) still runs in the finally.
  - User impact: At worst no balloon for that activation; never a crash or an error dialog on project-open.
- **A second activation (rapid re-open of another project) fires a competing freshness check while a prior update is still in flight** (recoverable)
  - Detection: The daemon's own sc1 concurrent-launch guard (S001) rejects the second daemon.update, which surfaces as gateway.update() -> Failed('update already in progress').
  - Response: Surface that as the single failure balloon (or skip if the drift is already resolved) — the flow never spawns a competing update itself (it only calls the daemon-owned update() and lets the daemon arbitrate).
  - User impact: At most one 'update already in progress' balloon; no duplicate updates (ac4/k5).

### Edge cases

| Input | Expected |
| :--- | :--- |
| startup-check mode, drift present, user clicks Dismiss (or lets the balloon expire without choosing) | No update is triggered; nothing changes. The balloon is not re-shown this activation (it re-appears on the next activation if still stale, per k6 every-activation). |
| self-update mode: current !== lastSeen but the daemon is already up to date (installedCommit === upstream) | No update needed — skip the update, but still setLastSeen(current) so the self-update does not re-evaluate on the next activation of the same version. |
| First-ever activation (lastSeen null, no prior persisted state) with drift | Treated as a self-update/first-install (current !== null) → eligible for the auto path IF there is drift; setLastSeen(current) after. A fresh install whose daemon is already current simply records the version and shows nothing. |
| The daemon restarts mid-check (socket drops right after update()) | Expected — that IS the update+restart. The reconnect-and-confirm loop tolerates the socket drop (updateOutcome()->Unavailable / daemonStatus()->Stopped are retried), reconnects, and re-reads installedCommit/updateOutcome under the budget; it does not treat the transient drop as a failure. |
| PluginManagerCore.getPlugin(PLUGIN_ID)?.version returns null (version undeterminable) | current defaults to '' → the self-update branch is NOT taken silently (current=='' is treated as not-a-self-update) → fall back to the startup-check prompt path, mirroring S003's empty-version guard; still setLastSeen(''). |
| reconnect-and-confirm: a STALE updateOutcome record from a PRIOR update is present (finishedAt before this update started) | Ignored — the flow treats an outcome as authoritative only when finishedAt is at/after the update start time; it keeps polling / falls back to the commit-advance check so a stale prior 'failed' never mis-reports this update. |

### Invariants to preserve

- daemon.status remains best-effort and never-throws: reading installedCommit (a client-side field extraction) must not change daemonStatus()'s existing Loaded/Stopped/Unavailable contract, and an absent field defaults to '' rather than failing the parse. [[c6]]
- The plugin reaches the daemon ONLY through the gateway/IPC (k5 architectural rule) and drives the update ONLY through the daemon-owned sc1 IPC — never re-implementing or shelling out to daemon-ctl.sh (k2). [[c2]]

## Test strategy

**Test framework:** `JUnit5 (Jupiter 5.11.3, useJUnitPlatform) for the pure flow + gateway-parse + state round-trip unit tests (the S003TypesTest.kt / DecidePolicyTest.kt / DaemonStatusGatewayTest.kt idioms over fakes — no BasePlatformTestCase); JUnit4+vintage reserved only if a platform-fixture wiring test is added.`

### Test levels

- **unit** — Assert the pure DaemonFreshnessFlow.check over injected fakes (fake FreshnessGateway, fake notify recording kind+message+onUpdate, fake gitLsRemote, fake versionState, no-wait sleep + fixed clock) — every acceptance path with NO IDE fixture and no real daemon/git (the S003TypesTest/DecidePolicyTest pure-logic idiom, JUnit5).
  - Subjects: `startup-check drift: reachable + installedCommit != upstream + current==lastSeen → an Update/Dismiss balloon is shown; on Update gateway.update() is called; on Dismiss/expire it is NOT (ac1)`, `skip paths: unreachable → no balloon/no update; installedCommit=='' → skip; installedCommit==upstream → skip; gitLsRemote ''/throws → skip (ac2)`, `self-update: current!=lastSeen + drift → gateway.update() called with NO prompt (notify-after), setLastSeen(current) recorded (ac3)`, `reconnect-and-confirm success: after update() a fresh updateOutcome().state=='succeeded' / installedCommit advances → an info balloon`, `failure: update() Failed OR fresh updateOutcome().state=='failed' OR commit never advances within budget → exactly ONE failure balloon carrying the raw error; no retry, no second update() (ac4)`, `never-throws: any throwing seam is swallowed by the outer backstop — check() returns, setLastSeen(current) runs on every terminal path`, `empty-version guard: current=='' (PluginManagerCore null) → startup-check prompt path, not the silent auto path`, `stale-outcome guard: a prior updateOutcome with finishedAt before the update start is ignored; commit-advance decides`
  - Fixtures: `a fake FreshnessGateway (scriptable reachability / installedCommit / update->Ok|Failed / updateOutcome->Loaded|None|Unavailable, incl. a Failed update)`, `a fake FreshnessNotify recording (kind, message, onUpdate) and invoking onUpdate to simulate the Update click or leaving it uninvoked for Dismiss`, `a fake gitLsRemote returning a scripted sha / '' / throwing`, `a fake PluginVersionState { current, getLastSeen, setLastSeen } recording writes`, `an injected no-wait sleep + a fixed/advanceable now for the reconnect loop`
- **unit** — Assert the new gateway sc1/sc2 client bindings parse/map correctly — drive DaemonGatewayImpl(rpc) against a fake DaemonRpc (the RecordingRpc/FakeDaemonRpc idiom, DaemonStatusGatewayTest.kt), no socket.
  - Subjects: `update(): rpc.call('daemon.update') mapping — launched:true → Ok, launched:false / error result → Failed; DaemonUnavailable → Failed (k2: the call goes to daemon.update, never a shell-out)`, `updateOutcome(): rpc.call('daemon.updateOutcome') → Loaded(state,error?,finishedAt) for a record, None for null, Unavailable when the daemon is down`, `daemonStatus(): installedCommit extracted into DaemonStatusDto (present → the sha; absent → ''); Gson Double coercion of the other numeric fields still holds; the Loaded/Stopped/Unavailable contract is unchanged`
  - Fixtures: `a fake DaemonRpc (RecordingRpc) returning scripted DaemonResult payloads incl. an installedCommit field and a {state,finishedAt,error} record, plus a DaemonUnavailable path`
- **unit** — Assert the PluginVersionState / last-seen PersistentStateComponent round-trips (getState/loadState) without an IDE fixture (plain JUnit5 over the @State inner State object).
  - Subjects: `the last-seen store returns null before any write and the persisted value after setLastSeen; getState/loadState round-trip the lastSeenPluginVersion string`
  - Fixtures: `the PersistentStateComponent State holder constructed directly (no application service lookup)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: reachable + drift + startup-check mode → an Update/Dismiss balloon (no modal) is shown and gateway.update() runs ONLY on Update`, `unit(gateway): update() routes to rpc.call('daemon.update') — the daemon-owned IPC, not a shell-out (k2)` |
| `ac2` | `unit: unreachable → no balloon, no update, nothing changed`, `unit: installedCommit=='' → skip; installedCommit==upstream (up to date) → skip; gitLsRemote fails → skip` |
| `ac3` | `unit: current!=lastSeen + drift → gateway.update() called with NO prompt, notify-after, setLastSeen(current) recorded`, `unit: the freshness consumer schedules check() off-EDT via the injected executor (fire-and-forget, never blocks) — asserted by driving onProjectOpened with a synchronous test executor` |
| `ac4` | `unit: update() Failed → exactly one failure balloon with the raw error, no retry/rollback`, `unit: reconnect finds a fresh updateOutcome().state=='failed' (or the commit never advances within budget) → one failure balloon carrying the raw error` |

## Alternatives considered

### a1: Pure JetBrains-internal freshness flow over injected seams + gateway sc1/sc2 bindings — **CHOSEN**

A pure DaemonFreshnessFlow (drift → prompt/auto → update → reconnect-confirm) over injected seams, plus new gateway update()/updateOutcome() + DaemonStatusDto.installedCommit, fired off-EDT from the project-open path.

Add the client-side sc1/sc2 bindings to the Kotlin gateway: DaemonGateway.update():DaemonActionResult (rpc.call("daemon.update") via the shutdown()/compact()+runAction template) and updateOutcome():DaemonUpdateOutcomeResult (rpc.call("daemon.updateOutcome"), a new sealed Loaded(state,error?,finishedAt)/None/Unavailable), and installedCommit:String on DaemonStatusDto + parseDaemonStatus extraction (default '' pre-S002). Then a NEW pure object DaemonFreshnessFlow.check(seams) — the JetBrains analogue of S003's runDaemonFreshnessCheck — over injected seams: a FreshnessGateway view (reachability/installedCommit/update/updateOutcome), a gitLsRemote runner, a notify seam (Update/Dismiss + info + failure), a versionState seam (current + lastSeen), an executor, and a clock/sleep. Flow: reachability gate (k6) → installedCommit (sc2, '' → skip) → gitLsRemote drift (k1, no pull, ''/throw → skip, ===installed → skip) → branch on plugin-version delta (k4): self-update auto notify-after vs startup-check Update/Dismiss balloon → update() → reconnect-and-confirm via updateOutcome()/installedCommit under a budget → success or a SINGLE failure balloon (k5); always setLastSeen(current); never throws. Wire it as a new app-scoped consumer registered in AppScopedConsumers.ensureRegistered() alongside DaemonLifecycleService, fired fire-and-forget off-EDT via AppExecutorUtil.getAppExecutorService(); a thin binding class supplies the real seams (NotificationGroup 'insrc' balloon, PluginManagerCore version, a PersistentStateComponent last-seen store, a git ls-remote ProcessBuilder runner).

### a2: Fold the freshness check into the existing DaemonLifecycleService.evaluate()

Extend the existing probe→policy→offer/silent-run lifecycle to also do the git-commit drift check and drive the update through its existing STALE→UPDATE path.

Reuse DaemonLifecycleService.onProjectOpened→evaluate() (which already runs off-EDT, gateway.probe() then DaemonSetupPolicy.decide, and shows the offer notification). Add the installedCommit read + gitLsRemote drift comparison + the self-update-vs-startup branch INTO that evaluate() path, and drive the update through the service's existing UPDATE action.

**Rejected because:** Disqualified on sc1/k2: reusing the lifecycle UPDATE path shells out to daemon-ctl.sh instead of the daemon-owned IPC S001 built. Also conflates git-commit drift (k1) with socket-staleness and couples the freshness paths to the consent/setup gate, weakening every acceptance criterion to partial.

### a3: Inline the whole flow in the ProjectActivity / a listener with real platform calls

Put the drift + notify + update + reconnect logic directly in a startup activity/listener calling the real gateway, NotificationGroup and version APIs inline (no pure core).

Extend InsrcProjectOpenActivity (or a dedicated listener) to run the check inline: call the gateway, read the plugin version, build the balloon, call the new update() and poll — all directly against the platform APIs, with no separated pure flow object.

**Rejected because:** Functionally correct on all criteria and k2, but with no separated pure core the k4/k5/k7 acceptance paths can only be exercised through a heavy BasePlatformTestCase fixture — the exact testability failure S003 rejected a3 for. It also saves nothing on the sc1/sc2 surface (same bindings needed), so a1's clean boundary wins with no offsetting cost.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: the JetBrains DaemonGateway surface + sc1/sc2 client-binding gap (DaemonGateway.kt:492 interface, :734 impl, :711 DaemonRpc.call, :1145 runAction; DaemonGatewayService.kt:16)` — "there is NO update(), NO updateOutcome(), NO reachability()/status() convenience... the Kotlin plugin has a PARALLEL client that must be extended to REACH the same daemon-owned daemon.update/daemon.up"
- **[[c2]]** `prior-artifact` `HLD-b6c90b3e0240d36c sc1 (DaemonUpdateRestart IPC, daemon-owned update+restart) + k2/k3; the k2 IPC-only rule the plugin must consume, never shell out` — "both plugins invoke it through a single daemon-owned IPC (no shelling out to daemon-ctl.sh from the plugin)"
- **[[c3]]** `analyze-bundle` `s1 convention: the k2 boundary — UPDATE is shell-out-only today (DaemonLifecycleContracts.kt:49 DaemonProvisioner UPDATE->daemon-ctl.sh; DaemonLifecycleCommandRunner.kt:37) — do NOT reuse` — "S004 must NOT reuse either — it consumes the daemon-owned daemon.update IPC (sc1) via a new gateway update() modeled on shutdown()/compact()+runAction"
- **[[c4]]** `analyze-bundle` `s1 structural-map: the startup hook + off-EDT freshness skeleton (InsrcProjectOpenActivity.kt:20, plugin.xml:276, InsrcPluginStateListener.kt:99 AppScopedConsumers, DaemonLifecycleService.kt:42/:119)` — "S004 mirrors this STRUCTURE as a NEW app-scoped consumer... off-EDT via AppExecutorUtil.getAppExecutorService()"
- **[[c5]]** `analyze-bundle` `s1 usage-example: the insrc Notifications BALLOON with inline Update/Dismiss (plugin.xml:282 notificationGroup 'insrc'; DaemonLifecycleService.kt:152 showOfferSetupNotification; OnboardingOffer.kt:27)` — "An Update/Dismiss balloon = the same shape with two addAction calls (k7 native balloon, no modal)"
- **[[c6]]** `prior-artifact` `HLD-b6c90b3e0240d36c sc2 (DaemonStatus.installedCommit, git-commit freshness anchor, k1) + the daemon.status never-throw best-effort guarantee (owned by s2)` — "the daemon reports its installed source commit additively on the existing daemon.status... the never-throw best-effort guarantee of daemon.status is preserved"
- **[[c7]]** `analyze-bundle` `s1 capability-discovery + convention: plugin-version read (PluginManagerCore, InsrcPlugin.kt:14) + PersistentStateComponent last-seen store (SetupConsentStoreService.kt:19) + JUnit5 test/fakes idiom (DaemonStatusGatewayTest.kt:17, DaemonLifecycleServiceTest.kt:40 FakeGateway)` — "adding a method to the DaemonGateway interface breaks EVERY fake that implements it... store lastSeenPluginVersion via a PersistentStateComponent modeled on SetupConsentStoreService"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-24T06:25:58.073Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/DaemonGateway | citation | LOW | manual | DaemonGateway is an interface at DaemonGateway.kt:492 with impl DaemonGatewayImpl(rpc) around :734, exposing daemonStatus() at :664, and a runAction(...) helper around :1145 that shutdown()/compact() use. | DaemonGateway.kt:492 read = 'interface DaemonGateway {'; :664 = 'fun daemonStatus(): DaemonStatusResult'; grep confirms class DaemonGatewayImpl (1 hit in src) and fun runAction (2 hits). All anchors resolve. | No change. The gateway surface + runAction template resolve as cited. |
| contract/gateway-gap | semantic | LOW | manual | The DaemonGateway has NO update() and NO updateOutcome() method today (they are net-new in S004); the generic call is DaemonRpc.call(method, params). | grep 'fun update(): DaemonActionResult' and 'fun updateOutcome()' hit ONLY the S004 doc, not the plugin src — confirming both gateway methods are genuinely net-new. DaemonRpc.call exists (fun call( has hits incl. the transport). | No change. The net-new gateway update()/updateOutcome() gap is correctly stated. |
| dataModel/DaemonStatusDto | citation | LOW | manual | DaemonStatusDto is defined around DaemonGateway.kt:385 and parsed by parseDaemonStatus around :1330; it does NOT currently carry an installedCommit field (net-new field-add in S004). | DaemonGateway.kt:385 read = 'data class DaemonStatusDto('; fun parseDaemonStatus resolves (1 src hit); grep 'installedCommit' hits only docs (S004/HLD), NOT the JetBrains src — confirming the field-add is net-new. | No change. DaemonStatusDto + parseDaemonStatus resolve; installedCommit is a genuine additive field. |
| dataModel/result-types | citation | LOW | manual | The sealed result templates exist: DaemonStatusResult around DaemonGateway.kt:405 and DaemonActionResult (Ok/Failed) around :460 — the shapes S004's new DaemonUpdateOutcomeResult and update() return type are modeled on. | DaemonGateway.kt:405 read = 'sealed interface DaemonStatusResult {'; DaemonActionResult resolves in src. Both sealed-type templates for the new DaemonUpdateOutcomeResult / update() return exist. | No change. The result-type templates resolve as cited. |
| convention/k2-shellout | citation | LOW | manual | The UPDATE action is a daemon-ctl.sh shell-out today in DaemonLifecycleContracts.kt (DaemonProvisioner ~:49) and DaemonLifecycleCommandRunner.kt (~:37) — the path S004 must NOT reuse (k2). | DaemonLifecycleCommandRunner.kt:37 read = 'fun run(command: LifecycleCommand): DaemonActionResult {'; DaemonProvisioner + daemon-ctl resolve in src — confirming UPDATE is a daemon-ctl.sh shell-out today (the k2 path S004 does not reuse). | No change. The k2 shell-out boundary is grounded. |
| wiring/startup | citation | LOW | manual | The startup path is InsrcProjectOpenActivity (ProjectActivity) registered as a postStartupActivity in plugin.xml, calling AppScopedConsumers.ensureRegistered() in InsrcPluginStateListener.kt, which registers DaemonLifecycleService (off-EDT via AppExecutorUtil.getAppExecutorService()). | class InsrcProjectOpenActivity resolves (1 src hit); postStartupActivity, ensureRegistered, getAppExecutorService all resolve — the startup + off-EDT app-scoped-consumer wiring S004 extends is real. | No change. The startup/off-EDT wiring resolves as cited. |
| wiring/notification | citation | LOW | manual | The insrc Notifications BALLOON group id 'insrc' is registered in plugin.xml (~:282) and the addAction(NotificationAction.createSimple) template is DaemonLifecycleService.showOfferSetupNotification (~:152). | notificationGroup, showOfferSetupNotification, and NotificationAction.createSimple all resolve in the plugin src — the insrc balloon + Update/Dismiss (k7) template exists. | No change. The notification balloon idiom resolves as cited. |
| wiring/version-and-state | citation | LOW | manual | PLUGIN_ID is defined in InsrcPlugin.kt (~:14) and the persisted-state convention is a @Service(APP) PersistentStateComponent modeled on SetupConsentStoreService.kt (~:19, @State Storage insrc.xml). | PLUGIN_ID, class SetupConsentStoreService (1 src hit), PersistentStateComponent, and @State all resolve — the plugin-version + persisted-state convention S004 models the last-seen store on exists. | No change. The version + PersistentStateComponent convention resolves as cited. |
| test/idiom | citation | LOW | manual | The JUnit5 gateway-parse test idiom exists (DaemonStatusGatewayTest.kt with a RecordingRpc ~:17) and the full-interface FakeGateway : DaemonGateway is in DaemonLifecycleServiceTest.kt (~:40) — the fake that adding gateway methods will break. | class RecordingRpc resolves in test src; FakeGateway + DaemonStatusGatewayTest resolve — the JUnit5 gateway-parse fake idiom + the full-interface FakeGateway (which the new gateway methods will require patching) both exist. | No change. The test idiom + the fake-breakage gotcha are grounded. |
| boundary/consume-not-redesign | cross-artifact | LOW | manual | S004 consumes sc1 (daemon.update/daemon.updateOutcome IPC, owned by s1) and sc2 (DaemonStatus.installedCommit, owned by s2) without re-designing them — it only adds the parallel Kotlin client binding; the daemon-side contracts (already shipped by S001/S002) are unchanged. | HLD.md:1 resolves to the approved HLD artifact; daemon.update + installedCommit appear in the HLD/S004 docs — S004 consumes sc1 (s1) + sc2 (s2) without re-designing them; the daemon-side contracts (S001/S002, already shipped) are unchanged. | No change. The consumes-only cross-artifact trace holds; no adjacent scope is re-designed. |
