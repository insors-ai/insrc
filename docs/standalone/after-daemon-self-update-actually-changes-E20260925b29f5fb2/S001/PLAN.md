<!-- insrc:artifact PLAN-b29f5fb26f3bd9fe-S001 -->

# Plan: E20260925b29f5fb2:S001

**Epic:** `after-daemon-self-update-actually-changes`
**LLD run:** `wf-1790331939226-pgnorf`
**LLD effective hash:** `b29f5fb26f3b...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** VS Code: add reloadWindow seam + reload-nudge on the update-success branch | S | — | unit: daemon-freshness: confirmed update -> notify called with reload-nudge message + 'Reload Window' action; unit: daemon-freshness: notify resolves 'Reload Window' + seam present -> reloadWindow() invoked exactly once; unit: daemon-freshness: notify dismissed (undefined) -> reloadWindow() NOT invoked; unit: daemon-freshness: reloadWindow omitted -> notification-only, no crash; unit: daemon-freshness: reloadWindow rejection swallowed -> runDaemonFreshnessCheck still resolves; unit: daemon-freshness: no nudge on no-op update (commit unchanged) or failed update | [[c1]] [[c2]] |
| 2 | **`t2`** VS Code: wire the production reloadWindow seam in extension activation | S | `t1` | integration: extension-wiring: production DaemonFreshnessDeps wires reloadWindow -> workbench.action.reloadWindow | [[c1]] |
| 3 | **`t3`** JetBrains: reload-nudge message on the update-success branch (notification-only) | S | — | unit: DaemonFreshnessFlow: confirmed update -> notify.show(INFO, reload-nudge message, null action); unit: DaemonFreshnessFlow: no nudge on no-op/failed update (failure balloon instead); unit: DaemonFreshnessFlow: nudge fires at most once per plugin version (setLastSeen gating) | [[c3]] [[c4]] |
| 4 | **`t4`** Tests: extend the freshness suites in both plugins | M | `t1`, `t2`, `t3` | unit: VS Code freshness suite green: all nudge/reload/gating subjects (t1) pass under tsx --test; integration: VS Code extension-wiring suite green: reloadWindow production wiring (t2) passes; unit: JetBrains DaemonFreshnessFlow suite green: nudge/gating subjects (t3) pass under JUnit5/JDK21 | [[c1]] [[c2]] [[c3]] [[c4]] |

### E20260925b29f5fb2:S001:T001 — VS Code: add reloadWindow seam + reload-nudge on the update-success branch

In vscode-plugin/src/freshness/daemon-freshness.ts: add readonly reloadWindow?: () => Promise<void> to DaemonFreshnessDeps; change the confirmUpdate-success branch (currently notify('insrc daemon updated successfully.')) to notify the MCP-reload nudge with a 'Reload Window' action, and if the returned choice is 'Reload Window' and deps.reloadWindow is set, await it inside try/catch (swallow rejection). Fire-once/no-op/failed gating inherited (no new logic).

**Acceptance checks:**
- DaemonFreshnessDeps has an optional reloadWindow?: () => Promise<void>
- success branch calls notify(nudgeMsg, 'Reload Window'); choice 'Reload Window' + present seam -> await reloadWindow() once; rejection swallowed
- failure/no-op branches unchanged; tsc/eslint clean

### E20260925b29f5fb2:S001:T002 — VS Code: wire the production reloadWindow seam in extension activation

In the VS Code extension activation that constructs the production DaemonFreshnessDeps, inject reloadWindow: () => executeCommand('workbench.action.reloadWindow') (as a Promise<void>).

**Acceptance checks:**
- extension activation passes a reloadWindow seam wired to workbench.action.reloadWindow
- tsc clean; the bundle builds

### E20260925b29f5fb2:S001:T003 — JetBrains: reload-nudge message on the update-success branch (notification-only)

In jetbrains-plugin/.../freshness/DaemonFreshnessFlow.kt performUpdate success branch, change the notify.show(INFO, ...) message to the MCP-reload nudge naming the remedy ('restart your claude or codex session to refresh the insrc MCP connection'); keep the action slot null (no NotificationAction).

**Acceptance checks:**
- success branch notify.show(INFO, nudgeMsg, null) — message changed, action slot stays null
- no new NotificationAction / no EDT dispatch introduced; compiles

### E20260925b29f5fb2:S001:T004 — Tests: extend the freshness suites in both plugins

VS Code: extend the daemon-freshness unit suite (nudge message + 'Reload Window' action; choice->reloadWindow() once; dismiss->not called; seam omitted->notification-only; rejection swallowed; no nudge on no-op/failed) + the extension-wiring source-scan (reloadWindow wired to workbench.action.reloadWindow). JetBrains: extend the DaemonFreshnessFlow unit tests (success->INFO nudge msg + null action; no nudge on no-op/failed; once-per-version).

**Acceptance checks:**
- VS Code freshness unit + extension-wiring tests cover all s6 subjects and pass
- JetBrains DaemonFreshnessFlow tests cover the nudge subjects and pass
- full VS Code + JetBrains freshness suites green (JDK21 for JetBrains)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| on a confirmed update (installed commit advanced), notify is called with the reload-nudge message AND a 'Reload Window' action | `t1`, `t4` |
| when notify resolves to 'Reload Window' and deps.reloadWindow is set, deps.reloadWindow() is invoked exactly once | `t1`, `t4` |
| when notify resolves to undefined (dismissed), deps.reloadWindow() is NOT invoked | `t1`, `t4` |
| when deps.reloadWindow is omitted, no crash (notification-only) | `t1`, `t4` |
| a reloadWindow rejection is swallowed — runDaemonFreshnessCheck still resolves | `t1`, `t4` |
| no nudge on a no-op update (commit unchanged) or a failed update | `t1`, `t4` |
| on a confirmed update, notify.show is called with NotifyKind.INFO + the reload-nudge message + null action | `t3`, `t4` |
| no nudge on a no-op update (commit unchanged) or a failed update (failure balloon instead) | `t3`, `t4` |
| the nudge fires at most once per plugin version (setLastSeen gating) | `t3`, `t4` |
| extension wiring passes a reloadWindow seam that calls workbench.action.reloadWindow | `t2`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contract: VS Code update-success branch notifies the MCP-reload nudge with a 'Reload Window' action (daemon-freshness.ts)`
- **[[c2]]** `prior-artifact` `LLD S001 contract: DaemonFreshnessDeps gains an optional reloadWindow seam invoked once on the 'Reload Window' choice, rejection swallowed`
- **[[c3]]** `prior-artifact` `LLD S001 contract: JetBrains DaemonFreshnessFlow success branch shows the reload nudge as a notification-only INFO balloon (null action)`
- **[[c4]]** `prior-artifact` `LLD S001 contract: nudge inherits the existing fire-once-per-version / no-op / failed gating (no new logic)`
