<!-- insrc:artifact LLD-b6c90b3e0240d36c-s3 -->

# LLD: E20260924b6c90b3e:S003

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
- `s4`: Everything JetBrains-specific stays private to s4: the postStartupActivity hook running the opportunistic-when-reachable check (k6), the ls-remote comparison, the insrc Notifications BALLOON with inline Update/Dismiss (k7), the plugin-version-change detection that selects the approval path vs the auto notify-after self-update path (k4), the fire-and-forget scheduling off the UI thread so it never blocks activation, and the reconnect-and-confirm plus single failure balloon (k5). It mirrors s3's behaviour by consuming the same sc1 + sc2 contracts; it shares no code with s3.

## Contract details

**Surface level:** internal

### `runDaemonFreshnessCheck`

```typescript
export function runDaemonFreshnessCheck(deps: DaemonFreshnessDeps): Promise<void>
```

**Parameters:**
- `deps: DaemonFreshnessDeps` — Injected seams: { client, gitLsRemote, notify, versionState, daemonRoot, reconnectBudgetMs? } — the ipc client (status/reachability/update/updateOutcome), a plugin-side git ls-remote runner, a native notification surface, the per-plugin version accessor, and the daemon checkout root. All injected so the flow module stays VS-Code-free + unit-testable.

**Returns:** `Promise<void>` — Resolves when the check completes or is skipped. NEVER rejects (self-contained try/catch) — it is fired fire-and-forget from activation and must never surface an unhandled rejection or block startup.

**Preconditions:**
- Called once per plugin activation, fired fire-and-forget (not awaited) so it never blocks the plugin's own startup (k6).

**Postconditions:**
- Skips silently (no notification, no update) when the daemon is unreachable, or installedCommit is '' (undeterminable), or installedCommit === the upstream ls-remote commit (up to date) — ac2.
- On drift in startup-check mode (versionState.current === lastSeen): shows notify(msg, 'Update','Dismiss') and calls client.update() ONLY on 'Update' (k4/k7/ac1).
- On drift in self-update mode (versionState.current !== lastSeen): calls client.update() with no prompt, notify-after (k4/ac3).
- After client.update(): reconnect-and-confirm by polling client.status().installedCommit / client.updateOutcome() under reconnectBudgetMs; on success a success notify, on failure a SINGLE notify with the raw error — no retry, no rollback (k5/ac4).
- Always calls versionState.setLastSeen(current) so the self-update path fires exactly once per plugin version.
- Invokes the daemon-owned sc1 IPC via client.update(); NEVER shells out to daemon-ctl.sh (k2).

### `activateExtension`

```typescript
export function activateExtension(deps: ActivationDeps): void
```

**Parameters:**
- `deps: ActivationDeps` — Existing activation deps; extension.ts additionally fires runDaemonFreshnessCheck fire-and-forget here (alongside runReachabilityProbe), passing the real vscode-wired DaemonFreshnessDeps.

**Returns:** `void` — Unchanged activation entry; now also schedules the fire-and-forget freshness check. extension.ts (the sole vscode importer) constructs the real seams.

**Preconditions:**
- The daemon IpcClient + globalState + packageJSON.version are available at activation.

**Postconditions:**
- runDaemonFreshnessCheck is invoked without await, so activation returns immediately (nonFunctional, k6). This is the wiring change; the flow logic lives in the VS-Code-free module.

## Data model changes

### `DaemonFreshnessDeps` — new

New injected-seams interface for the flow module (mirrors ActivationDeps / model-tier-picker deps idiom): { client: Pick<IpcClient,'status'|'reachability'|'update'|'updateOutcome'>; gitLsRemote: (root: string, branch: string) => Promise<string> | string; notify: FreshnessNotify; versionState: PluginVersionState; daemonRoot: string; reconnectBudgetMs?: number }. VS-Code-free — no vscode import.

```
interface DaemonFreshnessDeps { client: Pick<IpcClient,'status'|'reachability'|'update'|'updateOutcome'>; gitLsRemote(root: string, branch: string): Promise<string> | string; notify: FreshnessNotify; versionState: PluginVersionState; daemonRoot: string; reconnectBudgetMs?: number }
```

**Call sites:**
- `vscode-plugin/src/freshness/daemon-freshness.ts (definition + the flow)`
- `vscode-plugin/src/extension.ts (constructs the real seams + fires it)`

### `FreshnessNotify` — new

The native-notification seam shape mirroring the extension.ts showInformationMessage seam: notify(message, ...actions) resolving the chosen action label (or undefined on dismiss). Real impl = vscode.window.showInformationMessage(message, {}, ...actions) (extension.ts:76; the vscode.d.ts:64 stub requires the {} options arg). No modal (k7).

```
type FreshnessNotify = (message: string, ...actions: string[]) => Promise<string | undefined>
```

**Call sites:**
- `vscode-plugin/src/freshness/daemon-freshness.ts`
- `vscode-plugin/src/extension.ts (bound to vscode.window.showInformationMessage(message,{},...actions))`

### `PluginVersionState` — new

The per-plugin last-seen-version accessor for self-update detection (k4): { current: string; getLastSeen(): string | undefined; setLastSeen(v: string): void | Promise<void> }. Real impl = context.extension.packageJSON.version + context.globalState.get/update under a new key constant (e.g. 'insrc.daemonSelfUpdate.lastSeenPluginVersion'). New globalState usage (none exists today).

```
interface PluginVersionState { current: string; getLastSeen(): string | undefined; setLastSeen(v: string): void | Promise<void> }
```

**Call sites:**
- `vscode-plugin/src/freshness/daemon-freshness.ts`
- `vscode-plugin/src/extension.ts (bound to context.globalState + context.extension.packageJSON.version)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S003 CONSUMES sc1 via the shared ipc-client wrappers client.update() (launch the daemon-owned update+restart) and client.updateOutcome() (read the terminal succeeded/failed result after reconnect). It does NOT re-implement the update, does NOT read the DaemonUpdateOutcome file directly, and does NOT shell out to daemon-ctl.sh (k2) — the detached-helper mechanism stays s1-internal. On approval (startup-check) or automatically (self-update) it calls update(), then reconnect-and-confirm via updateOutcome()/status(). |
| `sc2` | consumes | S003 CONSUMES sc2 by reading client.status().installedCommit as the freshness anchor: it compares that string against the upstream commit from its own git ls-remote (no pull) against the daemon repo default branch (k1 commit comparison). A '' installedCommit is treated as undeterminable → skip the check (ac2). How the commit is computed stays s2-internal; S003 only reads the string. |

## Error paths

### Error cases

- **The daemon is unreachable when the check runs (socket down / daemon not started)** (recoverable)
  - Detection: deps.client.reachability() returns 'stopped' or 'errored' (never-throws), OR the bounded status read fails — the flow gates on reachability first.
  - Response: Skip silently: no notification, no update, no daemon autostart. Still setLastSeen(current) so a self-update does not re-fire endlessly across unreachable activations.
  - User impact: Nothing shown; the check is simply skipped for that activation (ac2).
- **The plugin-side git ls-remote fails or returns no commit (network down, no remote, non-git daemon root)** (recoverable)
  - Detection: deps.gitLsRemote(root, branch) rejects/throws or returns '' — caught in the flow's try/catch.
  - Response: Treat upstream as undeterminable → skip the drift check silently (no notification). Fire-and-forget so a slow/hanging ls-remote never blocks activation (bounded).
  - User impact: No notification; freshness is simply not determined this activation (ac2, nonFunctional).
- **installedCommit is '' (daemon on an old pre-S002 build, or a non-git daemon root)** (recoverable)
  - Detection: deps.client.status().installedCommit === '' (the sc2 undeterminable sentinel).
  - Response: Skip silently — cannot compare, so no drift decision; no notification, no update.
  - User impact: No notification; the check degrades to 'undeterminable' rather than erroring (ac2). A pre-S002 daemon simply isn't checked until it carries the field.
- **The daemon update fails (client.update() rejects, or reconnect-and-confirm finds updateOutcome().state==='failed' or the daemon never returns within the budget)** (recoverable)
  - Detection: client.update() rejects (caught), OR after reconnect the polled client.updateOutcome() returns { state:'failed', error } / the installedCommit did not advance within reconnectBudgetMs.
  - Response: Show a SINGLE failure notify with the raw error (from updateOutcome().error, or the caught error, or 'daemon did not come back'); do NOT retry, do NOT roll back (k5). The daemon owns its post-update state.
  - User impact: One clear failure notification with the underlying error; the user can retry manually later (ac4).
- **showInformationMessage / a seam throws unexpectedly** (recoverable)
  - Detection: Any throw inside the flow is caught by the outer try/catch backstop wrapping runDaemonFreshnessCheck.
  - Response: Swallow (best-effort) — the function resolves without rejecting, since it is fired fire-and-forget and must never surface an unhandled rejection.
  - User impact: At worst no notification for that activation; never a crash or an unhandled-rejection banner.

### Edge cases

| Input | Expected |
| :--- | :--- |
| startup-check mode, drift present, user chooses Dismiss (or closes the notification → notify resolves undefined) | No update is triggered; nothing changes. The notification is not re-shown this activation (it re-appears next activation if still stale, per k6 every-activation). |
| self-update mode: currentVersion !== lastSeen but the daemon is already up to date (installedCommit === upstream) | No update needed — skip the update, but still setLastSeen(current) so the self-update does not re-evaluate on the next activation of the same version. |
| First-ever activation (lastSeen is undefined, no prior globalState) | Treated as a self-update/first-install (current !== undefined) → eligible for the auto path IF there is drift; setLastSeen(current) after. A fresh install whose daemon is already current simply records the version and shows nothing. |
| The daemon restarts mid-check (socket drops right after client.update()) | Expected — that IS the update+restart. The reconnect-and-confirm loop tolerates the socket drop, reconnects, and re-reads installedCommit/updateOutcome under the budget; it does not treat the transient drop as a failure. |
| A second activation fires while a prior fire-and-forget check is still running (rapid reopen) | The daemon's own sc1 concurrent-launch guard (S001) rejects a second in-flight update with 'update already in progress'; S003 surfaces that as the single failure notify or skips — it never spawns a competing update itself. |

## Test strategy

**Test framework:** `node:test (tsx --test), per vscode-plugin/src/**/__tests__/*.test.ts (activation.test.ts injected-seam + source-scan idiom)`

### Test levels

- **unit** — Assert the VS-Code-free runDaemonFreshnessCheck flow over injected fakes (fake ipc client, fake notify returning a chosen action, fake gitLsRemote, fake versionState) — every acceptance path with no vscode import and no real daemon/git.
  - Subjects: `startup-check drift: reachable + installedCommit !== upstream + current===lastSeen → notify('Update','Dismiss') shown; on 'Update' client.update() is called; on 'Dismiss'/undefined it is NOT (ac1)`, `skip paths: unreachable → no notify/no update; installedCommit==='' → skip; installedCommit===upstream → skip; ls-remote ''/throws → skip (ac2)`, `self-update: current!==lastSeen + drift → client.update() called with NO prompt (notify-after), and setLastSeen(current) recorded (ac3)`, `reconnect-and-confirm success: after update() the polled status().installedCommit advances / updateOutcome().state==='succeeded' → a success notify`, `failure: update() rejects OR updateOutcome().state==='failed' OR commit never advances within budget → exactly ONE failure notify carrying the raw error; no retry, no second update() (ac4)`, `never-throws: any seam throwing is swallowed by the outer backstop — runDaemonFreshnessCheck resolves, never rejects`, `setLastSeen(current) is called on every terminal path (skip, updated, failed) so the self-update fires once`
  - Fixtures: `a fake IpcClient (scriptable reachability/status.installedCommit/update/updateOutcome, incl. a throwing update)`, `a fake notify recording (message, actions) and returning a scripted choice or undefined`, `a fake gitLsRemote returning a scripted sha / '' / throwing`, `a fake versionState { current, getLastSeen, setLastSeen } recording writes`
- **unit** — Assert extension.ts wires the real vscode seams + fires the check fire-and-forget — via a SOURCE-SCAN of extension.ts (the sole vscode importer), mirroring the existing activation/bundle source-scan tests.
  - Subjects: `extension.ts constructs the DaemonFreshnessDeps real seams (showInformationMessage(message,{},...actions), context.globalState + packageJSON.version, a child_process git ls-remote) and invokes runDaemonFreshnessCheck WITHOUT await (fire-and-forget)`, `the new globalState key constant is referenced for lastSeen persistence`
  - Fixtures: `read extension.ts source text + regex-assert the wiring (no vscode runtime), like activation.test.ts's `export function activate(` scan`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: reachable + drift + startup-check mode → notify shows 'Update'/'Dismiss' (no modal) and client.update() runs ONLY on 'Update'`, `unit: extension.ts source-scan — notify bound to vscode.window.showInformationMessage(message,{},...actions)` |
| `ac2` | `unit: unreachable → no notify, no update, nothing changed`, `unit: installedCommit==='' → skip; installedCommit===upstream (up to date) → skip; ls-remote fails → skip` |
| `ac3` | `unit: current!==lastSeen + drift → client.update() called with NO prompt, notify-after, setLastSeen(current) recorded`, `unit: extension.ts source-scan — runDaemonFreshnessCheck is fired WITHOUT await (never blocks activation)` |
| `ac4` | `unit: update() rejects → exactly one failure notify with the raw error, no retry/rollback`, `unit: reconnect finds updateOutcome().state==='failed' (or commit never advances within budget) → one failure notify carrying the raw error` |

## Alternatives considered

### a1: New VS-Code-free flow module over injected seams, invoking the sc1 ipc-client update() — **CHOSEN**

A new src/freshness/daemon-freshness.ts exports runDaemonFreshnessCheck(deps) over injected seams (ipc client status/reachability/update/updateOutcome, gitLsRemote, notify, versionState); extension.ts wires the real vscode seams and fires it fire-and-forget from activation, branching self-update vs startup-check on a plugin-version delta.

runDaemonFreshnessCheck(deps) is a single VS-Code-free async function (the model-tier-picker idiom): opportunistic reachability gate; read status().installedCommit (sc2); compute upstream via gitLsRemote (no pull); branch self-update vs startup-check on the version delta; on approval/auto call client.update() (sc1); reconnect-and-confirm via updateOutcome()/status(); single failure notify; always setLastSeen(current). extension.ts injects the real seams and fires it fire-and-forget like runReachabilityProbe. Uses the ipc-client update() (sc1) — NOT controller.run('update').

### a2: Reuse the existing daemon lifecycle controller.run('update') (shell-out)

Drive the daemon update through the plugin's existing DaemonLifecycleController.run('update') (which spawns `bash <ctlScript> update`) instead of the sc1 ipc-client update().

The freshness flow detects drift the same way, but on approval/self-update calls the already-wired controller.run('update') — reusing the plugin's existing lifecycle path that shells out to daemon-ctl.sh and re-probes reachability — rather than the daemon-owned IPC.

**Rejected because:** Disqualified: VIOLATES k2 and does not consume sc1 — the plugin shells out to daemon-ctl.sh instead of invoking the daemon-owned IPC that S001 was built to provide. Reuses an existing path at the cost of the epic's core architectural rule; the acceptance criteria only 'partial' because the update no longer runs through the daemon-owned contract.

### a3: Fold the freshness check into the existing runReachabilityProbe

Extend activation.ts's runReachabilityProbe (and ActivationDeps) to also run the drift check + update flow, rather than adding a separate flow module.

Add the installedCommit read, ls-remote, notify, and update() calls INTO runReachabilityProbe after it derives reachability, extending ActivationDeps with the extra seams. One activation hook does both the status-surface push and the freshness check.

**Rejected because:** Correct on k2/sc1/sc2 and most acceptance criteria, but overloads the single-purpose bounded runReachabilityProbe with a multi-step notify+update flow, coupling the freshness lifecycle to the probe's timeout cadence and making the acceptance paths harder to test in isolation. a1's separate VS-Code-free module is the cleaner boundary for the same behaviour.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: VS Code activation flow + injected-seam idiom (extension.ts:76 showInformationMessage seam, activation.ts:34/66 runReachabilityProbe fire-and-forget, vscode.d.ts:64 stub)` — "extension.ts is the sole vscode importer; activation fires runReachabilityProbe WITHOUT awaiting — the fire-and-forget hook S003's check uses; showInformationMessage(message,{},...items) is the k7 not"
- **[[c2]]** `analyze-bundle` `s1 structural-map: consumed contracts on src/shared/ipc-client.ts (status().installedCommit sc2, update()/updateOutcome() sc1, reachability())` — "createIpcClient exposes status()->DaemonStatus (installedCommit), reachability(), update()->DaemonUpdateResult, updateOutcome()->DaemonUpdateOutcome|null — S003 consumes these, does not re-implement."
- **[[c3]]** `convention` `s1 convention: the k2 boundary (daemon/controller.ts:60 shell-out update is NOT reused; plugin-side git ls-remote mirrors daemon-ctl.sh HEAD-vs-origin)` — "controller.run('update') shells out to daemon-ctl.sh; S003 must call the daemon-owned IPC (client.update()) instead (k2), and detect drift via a plugin-side git ls-remote (k1)."
- **[[c4]]** `analyze-bundle` `s1 data-model: per-plugin last-seen-version via context.globalState + context.extension.packageJSON.version (no globalState usage today)` — "No globalState usage exists in vscode-plugin/src today; S003 introduces it for the self-update first-activation detection (k4), injected as a versionState seam."
- **[[c5]]** `convention` `s1 test-strategy: vscode-plugin injected-seam node:test + extension.ts source-scan idiom (activation.test.ts)` — "activation.test.ts drives runReachabilityProbe over a fake IpcClient + source-scans extension.ts; S003's flow module is unit-tested over fakes and the wiring via a source-scan. node:test (tsx --test)."
- **[[c6]]** `prior-artifact` `HLD-b6c90b3e0240d36c sc1+sc2 + Epic constraints k1/k2/k4/k5/k6/k7` — "S003 consumes sc1 (daemon-owned update IPC) + sc2 (installedCommit); startup-check prompts approval (k4/k7), self-update auto notify-after (k4), opportunistic-when-reachable (k6), single failure no-re"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-24T05:28:22.681Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | extension.ts is the sole vscode importer and surfaces a showInformationMessage seam of the form vscode.window.showInformationMessage(message, options, ...items). | read vscode-plugin/src/extension.ts:76 = `vscode.window.showInformationMessage(message, options, ...items),` — the notify seam shape the LLD cites resolves verbatim. | No change. Citation resolves. |
| c1 | citation | LOW | manual | activation.ts exposes runReachabilityProbe(deps: ActivationDeps) and activateExtension(deps) fires it fire-and-forget (without await) — the activation hook S003 extends. | read vscode-plugin/src/activation.ts:34 = `export async function runReachabilityProbe(deps: ActivationDeps): Promise<void> {` and :66 = `export function activateExtension(deps: ActivationDeps): void {` — the fire-and-forget activation hook S003 extends exists as cited. | No change. Citations resolve verbatim. |
| c1 | citation | LOW | manual | The bundled vscode.d.ts stub declares showInformationMessage(message, options: MessageOptions, ...items: string[]) — requiring the options arg the notify seam passes. | read vscode-plugin/src/vscode.d.ts:64 = `export function showInformationMessage(message: string, options: MessageOptions, ...items: string[])` — the stub requiring the options arg resolves. | No change. Citation resolves. |
| c2 | semantic | LOW | manual | The shared ipc-client (createIpcClient) exposes status(), reachability(), update(), and updateOutcome() — the sc1/sc2 wrappers S003 consumes. | src/shared/ipc-client.ts:121 status, :122 reachability, :131 update -> call<DaemonUpdateResult>('daemon.update'), :132 updateOutcome -> call<DaemonUpdateOutcome\|null>('daemon.updateOutcome') — all four consumed wrappers exist on createIpcClient. | No change. The consumed sc1/sc2 client surface exists. |
| c2 | semantic | LOW | manual | The IpcClient interface declares update(): Promise<DaemonUpdateResult> and updateOutcome(): Promise<DaemonUpdateOutcome \| null> (S001) plus status()/reachability(), so Pick<IpcClient,'status'\|'reachability'\|'update'\|'updateOutcome'> is valid. | src/shared/ipc-client.ts:105 `update(): Promise<DaemonUpdateResult>;` and :107 `updateOutcome(): Promise<DaemonUpdateOutcome \| null>;` on the IpcClient interface — the Pick<IpcClient,...> in DaemonFreshnessDeps is valid. | No change. The interface members exist. |
| c3 | citation | LOW | manual | The VS Code daemon lifecycle controller exposes run(action) over LifecycleAction incl 'update' by shelling out (bash <ctlScript> <action>) — the shell-out path S003 must NOT reuse for the daemon self-update (k2). | read vscode-plugin/src/daemon/controller.ts:16 = `export type LifecycleAction = 'start' \| 'stop' \| 'restart' \| 'update';` — the shell-out 'update' path S003 deliberately does NOT reuse (k2) is real as cited. | No change. The k2 boundary (controller shell-out not reused) is grounded. |
| c4 | semantic | LOW | manual | No context.globalState / context.extension.packageJSON usage exists in vscode-plugin/src today — so S003's per-plugin last-seen-version persistence (globalState) is genuinely net-new. | grep for globalState / extension.packageJSON returns hits ONLY in the S003 LLD/HLD docs, none in vscode-plugin/src — confirming the per-plugin last-seen-version persistence is genuinely net-new (S003 introduces it). | No change. The net-new globalState usage is correctly stated. |
| c5 | citation | LOW | manual | vscode-plugin/src/__tests__/activation.test.ts drives runReachabilityProbe over a fake IpcClient and source-scans extension.ts for `export function activate(` — the injected-seam + source-scan node:test idiom S003 extends. | read vscode-plugin/src/__tests__/activation.test.ts:28 = `function clientReturning(reachability...): IpcClient` and runReachabilityProbe appears there — the injected-seam fake-IpcClient node:test idiom S003 extends is confirmed. (The `export function activate\\(` probe returned 0 due to a regex over-escape in the probe, not a missing pattern; the source-scan idiom itself is established.) | No change. The test idiom S003 extends exists; the 0-hit is a probe-escaping artifact. |
| c6 | cross-artifact | LOW | manual | The HLD (b6c90b3e0240d36c) places S003 in Phase B consuming sc1 (owned by s1) + sc2 (owned by s2), owning no contract — consistent with the LLD's consumes-only interaction. | read docs/epics/work-framed-approved-spec-proceed-from-E20260923b6c90b3e/HLD.md:1 resolves the approved HLD placing S003 in Phase B consuming sc1 (owned s1) + sc2 (owned s2), owning none — consistent with the LLD's consumes-only interaction and the s1/s2 adjacent boundaries. | No change. The cross-artifact placement/ownership trace holds. |
| boundary | semantic | LOW | manual | runDaemonFreshnessCheck / DaemonFreshnessDeps / a src/freshness/ module are net-new (do not exist yet) — S003 introduces them. | grep for runDaemonFreshnessCheck / DaemonFreshnessDeps returns hits ONLY in the S003 LLD doc — no src definition yet, confirming the flow module + deps are genuinely net-new S003 additions. | No change. Correctly stated as net-new. |
