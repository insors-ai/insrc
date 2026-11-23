<!-- insrc:artifact LLD-c3d71313f34bce71-s6 -->

# LLD: STORY-c3d71313f34bce71-s6 — Manage daemon installation and lifecycle in VS Code

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`

VS Code offers Install by opening a focused native terminal and running the shared manual installer script. It observes real operation/readiness state, reconnects existing features and lets that script launch TUI. Startup, upgrade consent and manual controls remain responsive native IDE actions.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-c3d71313f34bce71** § 2. Framework summary

**Rollout phase:** E — IDE parity
**Consumes:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc4` (Daemon shutdown and readiness), `sc5` (Ordered upgrade hook delegation), `sc6` (Local transport and explicit installation home), `sc7` (Shared terminal installer launch)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s3`: Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s4`: Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc4`
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TerminalInstallLaunch`

```typescript
interface TerminalInstallLaunch { operationId: string; installationId: string; home: string; platform: 'posix' | 'powershell'; scriptPath: string; scriptVersion: string; scriptSha256: string; arguments: string[]; terminalName: 'Insrc Installation'; onInstallSuccess: 'launch-tui' }
```

**Parameters:**
- `input: unknown` — Validated native terminal launch descriptor.; untrusted wire input is schema-validated before use.

**Returns:** `TerminalInstallLaunch` — Validated native terminal launch descriptor.

**Errors:**
- `terminal-launch-failed` when Native terminal unavailable, script mismatch or shell policy prevents execution.

**Preconditions:**
- Script bytes/version/hash match manual release assets; target execution environment matches selected daemon home.
- Use a real shell terminal, not a pseudoterminal/webview pretending to install.

**Postconditions:**
- Open/focus Insrc Installation once, then send the one canonical command safely.
- No dependency prompt automation and no ManagerRequest.install from extension.

### 2.2 `TerminalInstallHandle`

```typescript
interface TerminalInstallHandle { operationId: string; terminalSessionId: string; state: 'opened' | 'reused' | 'launch-failed' }
```

**Parameters:**
- `input: unknown` — UI handle, never installation-success proof.; untrusted wire input is schema-validated before use.

**Returns:** `TerminalInstallHandle` — UI handle, never installation-success proof.

**Preconditions:**
- Handle belongs to selected installation and current extension lifetime.

**Postconditions:**
- Same-IDE duplicates focus the active terminal; other windows respect shared busy state.
- Closing terminal does not mark ready or automatically relaunch.

### 2.3 `InstallationObservation`

```typescript
interface InstallationObservation { operationId: string; phase: Phase; daemonReady: boolean; errorCode?: string }
```

**Parameters:**
- `input: unknown` — Authoritative shared state and exact readiness observation.; untrusted wire input is schema-validated before use.

**Returns:** `InstallationObservation` — Authoritative shared state and exact readiness observation.

**Preconditions:**
- Observe controller/IPC through bounded calls, not terminal text/exit parsing.

**Postconditions:**
- Ready means exact selected release and completed operation; TUI remains in terminal.
- Failure shows operation/hook/stage and explicit log/retry action.

### 2.4 `UpgradeOffer`

```typescript
interface UpgradeOffer { offerId: string; installationId: string; currentReleaseId?: string; candidateReleaseId: string; delivery: Delivery }
```

**Parameters:**
- `input: unknown` — Native Upgrade/Dismiss prompt for one exact candidate.; untrusted wire input is schema-validated before use.

**Returns:** `UpgradeOffer` — Native Upgrade/Dismiss prompt for one exact candidate.

**Preconditions:**
- Check on startup after reachability/start settles; plugin update supplies no implicit consent.

**Postconditions:**
- Dismiss changes nothing; accepted offer alone dispatches upgrade.
- Stale changed candidate requires a new prompt; no infinite retry.

## 3. Data model changes

### 3.1 `Activation and state observation` — new

Proposed boundary vscode-plugin/src/installer-terminal.ts binds into inspected activation.ts/extension.ts. A <=3-second initial reachability probe returns running/stopped/errored, never assumes errored means absent. Read-only installation inspection distinguishes missing from corrupt. Installed/stopped starts via common manager; ready reuses exact daemon; missing offers Install. A single settling callback reconnects existing status/config/MCP; no editor-startup blocking or daemon-private imports.

**Call sites:**
- `vscode-plugin/src/activation.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `Native terminal launch` — new

Use window.createTerminal with explicit supported shell, home/cwd and nonsecret launch environment, then terminal.show(false) and one safely encoded command via sendText. POSIX literal arguments use shell-safe quoting; Windows chooses supported PowerShell and literal single-quote encoding, never cmd interpolation or execution-policy bypass. The shell remains interactive so successful installer can enter TUI and TUI exit returns to shell. Terminal stream/keystrokes are not logged or scraped. VS Code's API escaping is not a security guarantee: test shell punctuation/Unicode/whitespace explicitly.


### 3.3 `Packaged resources and ordinary controls` — new

Client resource sync copies only current canonical script/policy/metadata bytes from s1 release resources and verifies equality; do not restore retired script names as compatibility. Private Node manager handles ordinary start/stop/restart/check-upgrade/retry, with bounded NDJSON and exact operation identity; install action is rejected by design and never generated here. Explicit immediate shutdown is separately labelled. Every available upgrade, including after extension update, prompts; regular status/config/registration/MCP continue through existing daemon IPC. If remote execution context differs from the daemon target, fail visibly rather than install in the wrong environment.


### 3.4 `Install outcome and terminal lifetime` — new

After success the shared script releases the install lock and starts selected TUI; extension merely observes readiness. Cancel/failure leaves terminal diagnostics, not a fake success notification. While a terminal hosts TUI, duplicate Install focuses it rather than starting a new setup. After reload, inspect durable state before reattaching; do not replay prior launch intent.


## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S006/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consume authoritative shared identity/state/report/control/hook-shape/home/terminal contract; implement only VS Code UI/transport binding, never the owner engine. |
| `sc2` | consumes | Consume authoritative shared identity/state/report/control/hook-shape/home/terminal contract; implement only VS Code UI/transport binding, never the owner engine. |
| `sc3` | consumes | Consume authoritative shared identity/state/report/control/hook-shape/home/terminal contract; implement only VS Code UI/transport binding, never the owner engine. |
| `sc4` | consumes | Consume authoritative shared identity/state/report/control/hook-shape/home/terminal contract; implement only VS Code UI/transport binding, never the owner engine. |
| `sc5` | consumes | Consume authoritative shared identity/state/report/control/hook-shape/home/terminal contract; implement only VS Code UI/transport binding, never the owner engine. |
| `sc6` | consumes | Consume authoritative shared identity/state/report/control/hook-shape/home/terminal contract; implement only VS Code UI/transport binding, never the owner engine. |
| `sc7` | consumes | Consume authoritative shared identity/state/report/control/hook-shape/home/terminal contract; implement only VS Code UI/transport binding, never the owner engine. |

## 6. Error paths

**Error cases**

- **Terminal cannot open or command cannot run** (recoverable)
  - Detection: Native API exception, absent shell, script identity check or policy failure.
  - Response: Visible launch error plus exact manual command; no hidden installer fallback.
  - User impact: User can fix terminal support and retry explicitly.
- **Startup probe/manager errors** (recoverable)
  - Detection: Bounded IPC/process read reports failure or wrong instance.
  - Response: Show errored/conflict; do not treat as missing or launch competing daemon.
  - User impact: Editor remains responsive.
- **Upgrade offer changed or dismissed** (recoverable)
  - Detection: Offer identity comparison/user dismissal before dispatch.
  - Response: No upgrade; re-prompt changed candidate only after explicit new check.
  - User impact: No silent changes.
- **Terminal closes during installation** (recoverable)
  - Detection: Terminal lifetime event plus still-incomplete authoritative record.
  - Response: Show incomplete/cancelled/blocked state; no automatic relaunch or success inference.
  - User impact: Diagnostics and explicit retry remain available.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two IDE windows choose Install | One shared operation; focus/reuse local session or show busy. |
| No coding CLI or declined Ollama | Shared script owns recommendations/consent, not an IDE wizard. |
| TUI runs or exits after successful install | Daemon readiness/status remains accurate; no reinstall or automatic daemon stop. |

**Invariants to preserve**

- Remain inside s6 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S006:FR001 and this story acceptance criteria apply unchanged. [[c3]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict; canonical *.test.ts coordinator. Real platform/IDE qualification is recorded separately and not inferred from fakes.`

**Test levels**

- **contract** — Prove adapter never generates forbidden install protocol or silent upgrade.
  - Subjects: `startup state classification and one settling callback`, `terminal command literal encoding`, `offer accept/dismiss/plugin-update behavior`
- **integration** — Native extension-host terminal and daemon-peer behavior.
  - Subjects: `real visible/focused terminal with exact script`, `spaces/Unicode/metacharacters and PowerShell/POSIX shells`, `TUI handoff/close/failure and duplicate windows`
  - Fixtures: `VS Code extension host, disposable home, deterministic script/daemon peers.`
- **live** — Actual both-mode installer/control in VS Code on each qualified target.
  - Subjects: `Install → terminal → TUI`, `startup autostart and upgrade prompts`, `migration status/retry and explicit immediate stop`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `running-stopped-missing-errored-startup-matrix`, `nonblocking-native-terminal-install-offer`, `one-ready-reconnect` |
| `ac2` | `startup-offer-accept-dismiss`, `plugin-update-still-prompts`, `stale-offer-no-dispatch` |
| `ac3` | `native-actions-use-shared-contracts`, `terminal-only-install-then-tui`, `migration-diagnostics-retry-and-explicit-immediate` |

## 8. Alternatives considered

### 8.1 a1: One thin activation/terminal adapter — **CHOSEN**

Native commands call the shared manager or launch the canonical installer terminal.

Keep bounded startup coordination and one terminal-session handle per installation in the extension. Installation launches the shared script with direct user I/O; manager observation confirms completion.

Ordinary lifecycle/status and exact upgrade offers use the private-runtime manager/IPC boundary. The extension does no install/migration interpretation beyond displaying typed results.

### 8.2 a2: Persistent extension-side operation queue

Store pending commands and replay them after extension reload.

The same shared installer can be launched through an extension-owned queue of startup and user operations. Pending queue items are persisted across IDE reloads.

This requires a second replay/cancellation policy in addition to the controller operation record and can resend actions after the user closed a terminal.

**Rejected because:** An extension-side replay queue duplicates controller ownership and risks relaunching user-cancelled operations.

## 9. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `vscode-plugin/src/activation.ts`
- **[[c5]]** `analyze-bundle` `vscode-plugin/src/extension.ts`
- **[[c6]]** `analyze-bundle` `scripts/sync-client-runtime-assets.mjs`
- **[[c7]]** `doc` `https://code.visualstudio.com/api/references/vscode-api`
