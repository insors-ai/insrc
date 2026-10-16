<!-- insrc:artifact LLD-0e1265ed8581e188-S001 -->

# LLD: E202610160e1265ed:S001

## Summary

**Epic:** `start-daemon-when-extension-activates-finds`
**HLD base run:** `wf-1792130131235-625nyx`
**HLD effective hash:** `0e1265ed8581...`

When VS Code starts and the extension finds an installed daemon that is not running, it now starts the daemon itself, once, and shows the result in the status bar. The start is a plain spawn of the daemon that is already built: it does not pull, install or build, so it never updates the daemon (updates stay behind the Update prompt of the freshness check). It starts only when the daemon is installed and reported stopped, never when it is merely erroring and never when it is not installed (installing stays the consented first-run step), and it checks once more just before starting that another window has not already started it. A start that fails, or that reports success but leaves the daemon unreachable, shows as an error with the reason and is not retried. The settings pull from the daemon, the daemon update check and the first-run onboarding, which all need a reachable daemon, now run once the probe and any start have settled, so they find the daemon up instead of failing while it is still stopped. A running daemon is left alone, and activation never blocks or throws.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `ActivationDeps`

```typescript
interface ActivationDeps { client: IpcClient; status: StatusSurface; probeTimeoutMs?: number | undefined; controller?: Pick<DaemonLifecycleController, 'isInstalled' | 'run'> | undefined; onSettled?: (() => void) | undefined }
```

**Parameters:**
- `controller: Pick<DaemonLifecycleController, 'isInstalled' | 'run'> | undefined` _(optional)_ — the daemon lifecycle controller, so activation can start an installed daemon that the probe finds stopped; absent means activation behaves exactly as today
- `onSettled: (() => void) | undefined` _(optional)_ — called once when the probe and any automatic start have finished, whatever their outcome, so work that needs a reachable daemon can follow them; absent means nothing is called

**Returns:** `ActivationDeps` — the dependencies of the activation shell, with one optional addition

**Preconditions:**
- the controller, when given, is the one extension.ts builds for the daemon commands

**Postconditions:**
- a deps object without controller is valid and never starts anything
- onSettled is called at most once per activation, never throws into activation, and is called also when the probe or the start failed

### 2.2 `runReachabilityProbe`

```typescript
function runReachabilityProbe(deps: ActivationDeps): Promise<DaemonUiState>  // was Promise<void>
```

**Parameters:**
- `deps: ActivationDeps` — the client to probe and the status surface to update

**Returns:** `Promise<DaemonUiState>` — the state the probe pushed into the status surface ('running', 'stopped' or 'errored'), so the caller can act on it; the status surface is updated exactly as before

**Errors:**
- `swallowed` when a throwing or timed-out probe resolves 'errored', as today; it never rejects

**Postconditions:**
- the status surface holds the returned state

### 2.3 `startDaemonIfStopped`

```typescript
function startDaemonIfStopped(deps: ActivationDeps, probed: DaemonUiState): Promise<void>  // new
```

**Parameters:**
- `deps: ActivationDeps` — the controller to start through and the status surface to update
- `probed: DaemonUiState` — the state the probe found

**Returns:** `Promise<void>` — resolves once the start attempt, if any, is over; the status surface then shows the daemon running, or errored with the reason

**Errors:**
- `swallowed` when a start that fails, throws, or reports success while the daemon is still not reachable leaves an errored status with the reason (the controller's message, or 'the daemon did not answer after start'); it never rejects

**Preconditions:**
- deps.controller is present

**Postconditions:**
- a start is attempted only when probed is 'stopped', the controller reports the daemon installed, and a fresh reachability check made just before the start does not find it running
- when that fresh check finds the daemon running, no start is made and the status shows running
- the start is a plain start: it passes the controller's plain option, so nothing is pulled, installed or built
- no start is attempted for 'running', 'errored' or 'unknown', or for a daemon that is not installed
- at most one start is attempted per call, and the activation calls it once

### 2.4 `DaemonLifecycleController.run`

```typescript
run(action: LifecycleAction, options?: { plain?: boolean } | undefined): Promise<LifecycleResult>  // options is new
```

**Parameters:**
- `action: LifecycleAction` — start, stop, restart or update, as today
- `options: { plain?: boolean } | undefined` _(optional)_ — plain: true adds --skip-sync, --skip-install and --skip-build to the daemon-ctl.sh command line, so a start only spawns the built daemon; absent or false runs the command exactly as today

**Returns:** `Promise<LifecycleResult>` — as today: ok and the true post-action reachability, with the reason on failure

**Errors:**
- `swallowed` when a missing ctl script answers an errored result 'insrc daemon is not installed'; a non-zero exit answers an errored result with daemon-ctl.sh's reason (exit 4, 'the daemon git / npm / build / start step failed', is also what a start that did not become ready within 60 s gives); it never throws

**Preconditions:**
- the daemon is installed

**Postconditions:**
- without options the command line is byte for byte what it is today, so the insrc.daemon.* commands and every other caller are unchanged

### 2.5 `activateExtension`

```typescript
function activateExtension(deps: ActivationDeps): void
```

**Parameters:**
- `deps: ActivationDeps` — as before, plus the optional controller

**Returns:** `void` — returns at once; the probe and then the start run in the background, and onSettled, when given, is called once they have finished

**Errors:**
- `swallowed` when any failure in the probe or the start leaves the status 'errored' and is never thrown into activation

**Postconditions:**
- activation does not wait for the probe or the start
- the start, when it happens, comes after the probe has set 'stopped'
- onSettled, when given, is called exactly once after the probe and any start have finished (the chain ends in a finally), also when either failed or threw; the call is wrapped so a throwing onSettled is contained

## 3. Data model changes

### 3.1 `ActivationDeps` — field-add

ActivationDeps gains the optional controller field. extension.ts passes the controller it already builds for the daemon commands. runReachabilityProbe returns the state it set instead of nothing, which its existing callers (activateExtension and the tests) can ignore. startDaemonIfStopped is new and lives in activation.ts beside the probe; activateExtension chains it after the probe in the same fire-and-forget background. Before it starts, it asks the client for reachability once more and does nothing if the daemon is now running (another window won the race). DaemonLifecycleController.run gains an optional options argument whose plain flag adds --skip-sync --skip-install --skip-build to the daemon-ctl.sh start, so the automatic start only spawns the already built daemon and never pulls, installs or builds; the daemon is updated only through the freshness check's Update prompt or the Update command. A start that returns ok with the daemon still not running is shown as errored with the detail 'the daemon did not answer after start'. No new setting, command, manifest entry or daemon change is made, and onboarding is untouched: it still offers installation behind consent. ActivationDeps also gains the optional onSettled callback, which activateExtension calls once after the probe and any start have finished. extension.ts uses it so that three things that need a reachable daemon wait for it: the settings pull from the daemon (configSync.pullFromDaemon), the daemon update check (runDaemonFreshnessCheck) and the first-run onboarding (runOnboarding). All three are unchanged in themselves; they now run after activation has settled instead of at once, so after an automatic start they find the daemon up (no 'could not read daemon config' toast, the settings mirror is synced, the Update prompt or the update check's plugin-upgrade update can happen in the same activation, and onboarding sees the true registration state), and when the daemon is not installed or the start fails they behave as before. The extension entry keeps the call shapes its source-scan tests pin: the onboarding IIFE keeps its guarded form and only begins with an await of the settled signal, the settings pull is still a .pullFromDaemon() call, and the update check call is wrapped so that it runs after the signal, with its wiring test's block pattern updated to accept the wrapped form. The settings sync engine, the update check module, onboarding and the registrar are not changed.

**Call sites:**
- `vscode-plugin/src/activation.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/daemon/controller.ts`
- `vscode-plugin/src/__tests__/activation.test.ts`
- `vscode-plugin/src/daemon/__tests__/controller.test.ts`
- `vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts`

## 4. Error paths

**Error cases**

- **The start fails (daemon-ctl.sh exits non-zero, for example because the daemon did not become ready within 60 seconds or a stale daemon could not be stopped)** (recoverable)
  - Detection: controller.run('start', { plain: true }) answers ok:false with a message (its mapping of daemon-ctl.sh's exit codes, exit 4 for a start that did not become ready)
  - Response: The status surface shows errored with that message; the start is not retried in this activation
  - User impact: The status bar shows the daemon errored with why; the user can fix it and use the Start daemon command
- **The start reports success but the daemon is still not reachable (slow to bind its socket, or it exited at once)** (recoverable)
  - Detection: controller.run answers ok:true with a post-start state other than 'running'
  - Response: startDaemonIfStopped treats it as a failed start: the status surface shows errored with the detail 'the daemon did not answer after start'; it is not retried
  - User impact: The status bar shows errored with a reason, never a bare 'stopped'; the user can use the Start daemon command
- **The controller throws instead of answering** (recoverable)
  - Detection: the call to controller.isInstalled() or controller.run('start', { plain: true }) rejects inside startDaemonIfStopped
  - Response: It is caught; the status surface shows 'errored'; nothing is thrown into activation
  - User impact: The status bar shows errored; the daemon commands still work
- **The probe cannot tell (it times out or throws)** (recoverable)
  - Detection: runReachabilityProbe resolves 'errored' after the deadline or on an exception
  - Response: No start is attempted, since 'errored' may mean a daemon that is up but not answering; the status shows errored as today
  - User impact: The user sees errored and can restart the daemon by hand
- **The daemon is stopped and not installed** (recoverable)
  - Detection: controller.isInstalled() resolves false
  - Response: No start is attempted and the status stays 'stopped'; installing remains the consented first-run onboarding step
  - User impact: The user is offered installation by onboarding as before

**Edge cases**

| Input | Expected |
| :--- | :--- |
| the daemon is already running when VS Code starts | The probe says 'running'; nothing is started |
| no controller is passed in the deps | Activation behaves exactly as today: probe and status only |
| several VS Code windows start at once with the daemon stopped | Each re-checks reachability just before starting and skips the start when another window has already brought the daemon up. Two windows that both pass the check in the same instant can still both start; daemon-ctl.sh start stops a daemon whose pid file is alive before it spawns, so they can restart each other's daemon before one remains. This narrow window is accepted, with no lock |
| the origin has newer commits than the installed daemon when the automatic start runs | The daemon that is already built is started as it is; nothing is pulled. The update check runs after activation has settled, so it finds the daemon up and can offer the Update prompt in this same activation |
| the first-run onboarding and the update check, which also need the daemon | Both run after activation has settled, so neither overlaps the start: onboarding's register offer reads the true registration state from a running daemon, and the update check finds the daemon up. When the daemon is not installed, onboarding's install offer comes after the probe, a few seconds later than before |
| the daemon is stopped and not installed, or the automatic start fails | Activation still settles, then the settings pull, the update check and onboarding run and behave exactly as they do today with an unreachable daemon: the pull shows its 'could not read daemon config' toast, the update check skips silently, onboarding offers install |
| the daemon is already running at activation | Activation settles after the probe, and the settings pull and the update check run then, one probe later than before; nothing else differs |
| the installed checkout was never built (no out/daemon/index.js) | isInstalled() is false, so no start is attempted and the status stays 'stopped', as for a daemon that is not installed |
| the plugin was upgraded since the last activation, the daemon was stopped, and the automatic start brought it up | The update check's own plugin-upgrade path (versionState current differs from last seen) then updates and restarts the daemon without a prompt, as it does today whenever the daemon is reachable at that point. This is accepted: before, a stopped daemon made the check skip and mark the new version as seen without updating |

**Invariants to preserve**

- Activation never blocks and never throws: the probe and any start run in the background, and every failure ends as a status state [[c1]]
- Installing the daemon stays behind the consent gate and the first-run onboarding; the extension starts only a daemon that is already installed [[c3]]
- The lifecycle commands (insrc.daemon.start and the others) and their status reflection behave exactly as before: the controller's run without the new option builds the same command line [[c2]]
- The automatic start itself never updates the daemon: updates come from the update check (its Update prompt, or its own plugin-upgrade path) and the Update command [[c3]]
- A deps object without a controller leaves the activation's probe-only behaviour byte for byte as it is [[c1]]
- The settings pull, the update check and onboarding keep their own behaviour, errors and notifications; only the moment they start changes, to after activation has settled [[c3]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), as the existing activation and daemon tests`

**Test levels**

- **unit** — The activation starts an installed, stopped daemon once, and otherwise starts nothing
  - Subjects: `a stopped, installed daemon is started once after the probe, as a plain start, and the status shows running`, `no start is attempted for a running or errored daemon, for a daemon that is not installed, or when no controller is given`, `a start is skipped when the fresh reachability check just before it finds the daemon running`, `a failed or throwing start leaves an errored status with the reason, is not retried, and never rejects into activation`, `a start that reports success while the daemon is still unreachable is shown as errored with the reason 'the daemon did not answer after start'`, `runReachabilityProbe answers the state it pushed into the status surface`, `activation calls onSettled once after the probe and any start have finished, also when the probe or the start fails or throws`
  - Fixtures: `the fake client and fake status surface the activation tests already use, with a client whose reachability answers can differ between the probe and the re-check`, `a fake controller recording isInstalled and run calls and their options`
- **unit** — The controller's plain start adds the skip flags and nothing else changes
  - Subjects: `a plain start runs daemon-ctl.sh start with --skip-sync, --skip-install and --skip-build, and a run without options builds the same command line as before`
  - Fixtures: `the fake subprocess runner the controller tests already use`
- **integration** — The extension entry hands the controller to the activation
  - Subjects: `the extension entry passes the daemon lifecycle controller into the activation`, `the extension entry runs the settings pull, the update check and onboarding only after activation has settled`
  - Fixtures: `the extension entry's source, as the other wiring tests read it`
- **live** — What only a real VS Code restart with a real daemon shows
  - Subjects: `after VS Code restarts with the installed daemon stopped, the daemon is running and the status bar shows it`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a stopped, installed daemon is started once after the probe, as a plain start, and the status shows running`, `runReachabilityProbe answers the state it pushed into the status surface`, `the extension entry passes the daemon lifecycle controller into the activation`, `after VS Code restarts with the installed daemon stopped, the daemon is running and the status bar shows it`, `the extension entry runs the settings pull, the update check and onboarding only after activation has settled` |
| `ac2` | `no start is attempted for a running or errored daemon, for a daemon that is not installed, or when no controller is given`, `a start is skipped when the fresh reachability check just before it finds the daemon running` |
| `ac3` | `a failed or throwing start leaves an errored status with the reason, is not retried, and never rejects into activation`, `a start that reports success while the daemon is still unreachable is shown as errored with the reason 'the daemon did not answer after start'` |
| `ac4` | `a plain start runs daemon-ctl.sh start with --skip-sync, --skip-install and --skip-build, and a run without options builds the same command line as before` |
| `ac5` | `activation calls onSettled once after the probe and any start have finished, also when the probe or the start fails or throws`, `the extension entry runs the settings pull, the update check and onboarding only after activation has settled` |

## 6. Migration

**State before:** On activation the extension fires a reachability probe and shows the result in the status surface; it never starts anything. ActivationDeps holds only the client, the status surface and an optional probe timeout, and an installed but stopped daemon stays stopped until the user runs the Start daemon command (activation.ts, daemon/commands.ts and extension.ts from the s1 bundles).

**State after:** The probe also reports the state it found. When that state is 'stopped' and the lifecycle controller says the daemon is installed, activation checks reachability once more and, if the daemon is still not up, starts it once as a plain start (no pull, install or build) and shows running, or errored with the reason. Everything else is as before. Activation then signals that it has settled, and the settings pull, the daemon update check and the first-run onboarding run after that signal instead of at once.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Give the lifecycle controller's run an optional plain option that adds --skip-sync, --skip-install and --skip-build to the start command; without it the command line is unchanged — ↩ rollbackable
2. Make the reachability probe answer the state it pushed into the status surface, and add the optional controller to the activation's dependencies; with no controller given, behaviour is unchanged — ↩ rollbackable
3. Add the start-if-stopped step beside the probe (re-check reachability, plain start, success without reachability treated as failure) and chain it after the probe in the activation's background run, guarded to the stopped-and-installed case and to one attempt — ↩ rollbackable
4. Add the optional onSettled callback to the activation's dependencies, called once after the probe and any start have finished; in the extension entry, have the settings pull, the daemon update check and the first-run onboarding wait for it — ↩ rollbackable
5. Pass the daemon lifecycle controller from the extension entry into the activation, which is what turns the behaviour on — ↩ rollbackable

**Backward compat:** Additive and internal: the new activation dependency and the controller's new option are both optional, the probe's extra return value is ignored by its existing callers, and no command, setting, manifest entry, IPC or daemon behaviour changes. Removing the controller from the entry's call turns the feature off again.

## 7. Alternatives considered

### 7.1 a1: Start it inside the activation probe, silently, once — **CHOSEN**

When the activation probe finds the daemon stopped and installed, run the controller's start once and show the result in the status surface.

ActivationDeps gains an optional controller. After the probe sets 'stopped', activation asks the controller whether the daemon is installed and, if so, runs start once and reflects its result (running, or errored with the controller's message) in the status surface, in the same fire-and-forget background as the probe. It starts only on 'stopped' (never on 'errored', where something is up but wrong), at most once per activation, and never when the daemon is not installed, since installing stays the consented onboarding step. A start that fails shows as errored with the reason and is not retried. Without a controller in the deps, activation behaves exactly as today. The start is a plain spawn (no pull, install or build) and a fresh reachability check just before it skips the start when another window already brought the daemon up.

### 7.2 a2: Start it silently, with a setting to turn it off

Same as a1, gated by a new insrc.daemon.autoStart setting that defaults to on.

As a1, but activation first reads a machine-scoped boolean setting insrc.daemon.autoStart (default true) and starts the daemon only when it is on. The setting is declared in the extension manifest and in the daemon's config catalog so the settings sync and the catalog-versus-manifest test stay in step.

**Rejected because:** Same behaviour with an opt-out, at the cost of the manifest and catalog changes the request did not ask for; it can be added later if wanted.

### 7.3 a3: Ask first with a Start button

When the probe finds the daemon stopped, show a notification with a Start button instead of starting it.

After the probe sets 'stopped' and the daemon is installed, activation shows a notification through the consent gate with a Start action; only an accept runs the controller's start. A decline or dismiss leaves the daemon stopped, and nothing is remembered.

**Rejected because:** Does not start the daemon by itself, so it does not meet the request.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: The activation shell and its probe (activation.ts)`
- **[[c2]]** `analyze-bundle` `s1: The daemon lifecycle controller and commands (daemon/controller.ts, daemon/commands.ts)`
- **[[c3]]** `analyze-bundle` `s1: How extension.ts wires activation, the controller and onboarding`
- **[[c4]]** `analyze-bundle` `s1: Existing tests for activation and the controller`

## 9. Open questions

- There is no setting to turn the automatic start off (alternative a2); it can be added later if wanted.
- Two windows that pass the re-check in the same instant can still both start the daemon and restart each other's before one remains; this is accepted with no lock.
- The Story has no acceptance criteria; ac1-ac5 were derived from its stated need and from the live check, where the settings pull raced the start.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-16T06:29:09.413Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
