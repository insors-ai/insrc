<!-- insrc:artifact DEF-c3d71313f34bce71 -->

# Epic: reliable-cross-platform-daemon-installation-lifecycle

## Summary

**Flavor:** new-capability

Users can install and maintain insrc from GitHub release bundles or a chosen development branch on macOS, Linux and Windows. Predictable dependencies, controlled upgrades and consistent IDE actions make setup and ongoing use reliable.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

The installer branch no longer supplies installation, upgrade or daemon start/stop/restart controls. Users face an unavailable setup and maintenance path, unpredictable behavior across machines with different Node versions, and missing in-editor lifecycle controls. Existing historical release and IDE policies conflict with the newly agreed requirements, and upgrade-time state changes lack a current replacement contract. This prevents users and developers on macOS, Linux and Windows from reliably adopting and maintaining insrc. [[c1]] [[c2]] [[c3]] [[c8]]

## 2. Functional requirements

- **E20261123c3d71313:FR001** — Users can install and upgrade the selected bundle or development source on each supported platform using a private Node runtime and no elevated commands.
- **E20261123c3d71313:FR002** — Users receive explicit dependency guidance and consent prompts without unexpected coding-agent installation or silent daemon upgrades.
- **E20261123c3d71313:FR003** — Users can start, gracefully stop, immediately stop and restart the daemon through consistent IDE controls backed by daemon shutdown IPC.
- **E20261123c3d71313:FR004** — Upgrades run applicable migration hooks in release order, validate results and prevent startup after unresolved migration failures.
- **E20261123c3d71313:FR005** — Platform acceptance is backed by reproducible isolated install, upgrade, migration and lifecycle evidence on macOS, Linux and Windows.

**s1:**

- **E20261123c3d71313:S001:FR001** — Users can install and upgrade a ready-to-run GitHub release bundle without relying on host Node.

**s2:**

- **E20261123c3d71313:S002:FR001** — Developers can install and sync a selected repository and branch with a predictable private Node runtime.

**s3:**

- **E20261123c3d71313:S003:FR001** — Users can resolve missing Ollama and see coding-agent recommendations with clear consent and no privileged commands.

**s4:**

- **E20261123c3d71313:S004:FR001** — Users can start, stop and restart a selected installation reliably using graceful or explicitly immediate shutdown.

**s5:**

- **E20261123c3d71313:S005:FR001** — Users can upgrade state through applicable, validated migration hooks and diagnose or explicitly retry failures.

**s6:**

- **E20261123c3d71313:S006:FR001** — VS Code users can install, maintain and control the daemon without leaving the editor.

**s7:**

- **E20261123c3d71313:S007:FR001** — JetBrains users receive the same daemon setup, upgrade consent and lifecycle behavior as VS Code users.

**s8:**

- **E20261123c3d71313:S008:FR001** — Users can rely on reproducible evidence that both delivery modes and both IDE integrations work on supported platforms.

## 3. Non-goals

- **Build signing and the retired signed-release trust/promotion engine.** — Signing is explicitly deferred; bundle identity and corruption/target checks remain design concerns.
- **PID/signal/kill-command daemon control, privileged service registration or elevated installation commands.** — Daemon stop and restart use IPC only and all delivered operations must run as the ordinary user.
- **A migration dependency graph, universal data migration policy or generic automatic rollback engine.** — Ordered hooks own their migration decisions, work, validation and recovery.
- **Automatic installation of coding agent CLIs or silent daemon upgrades.** — Agent CLI detection is advisory; daemon upgrades need an explicit user prompt.
- **Rebuilding the deprecated insrc-ide fork, restoring the old lifecycle subsystem wholesale, or changing the existing host v2 daemon.** — Only current in-repo clients and the new installer branch are in scope; validation uses isolated environments.

## 4. Assumptions

- `high` Current daemon resource cleanup and IDE IPC consumers remain available as integration boundaries; removal did not provide a replacement installer. [[c2]]
- `high` The macOS UTM VM is set up; Linux OrbStack test machines must be recreated. A Windows validation environment must be selected during design before Windows acceptance can pass. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Support macOS, Linux and Windows in both default GitHub zipped-bundle mode and configurable repository/branch dev mode; never silently switch delivery modes. | [[c1]] |
| `k2` | stakeholder | Install a versioned, predictable private Node runtime under ~/.insrc and use it for daemon install/build/run independently of Node versions on PATH. | [[c1]] |
| `k3` | stakeholder | Check Ollama; prompt before auto-install if absent. Detect Claude Code, Codex and Mistral Vibe, recommending at least one when none is present without installing them. | [[c1]] |
| `k4` | stakeholder | Stop/restart use daemon shutdown IPC exclusively: graceful by default and an explicit immediate override without graceful draining. No daemon PID/kill fallback. | [[c1]] |
| `k5` | stakeholder | Migration hooks are simple in-process upgrade delegation with check/run/test, executed in explicit release-manifest order. Each hook owns what to migrate. A run/test failure halts upgrade and blocks startup until explicit retry or hook-owned recovery. | [[c1]] |
| `k6` | stakeholder | Expose install, upgrade, migration and start/stop/restart in both current IDE clients. Startup checks reachability and starts if absent; it also checks upgrades and prompts before any daemon upgrade, including following plugin updates. | [[c1]] |
| `k7` | stakeholder | All operations work without elevated-privilege commands. Signing is deferred; do not restore the retired subsystem wholesale. | [[c1]] |
| `k8` | invariant | Use isolated state and test daemons. Leave the existing host Mac v2 daemon and its installation untouched. Qualify Linux on OrbStack and macOS on UTM; record real Windows validation independently. | [[c1]] |
| `k9` | contract | Current VS Code and JetBrains clients remain thin orchestrators; daemon-owned data stays behind IPC. Use origin/v2 as behavior reference where code was removed, with the new requirements taking precedence over historical contracts. | [[c4]] |

## 6. Stories

### 6.1 STORY-c3d71313f34bce71-s1 — Install and upgrade release bundles with a private runtime

**User value:** `size: L`

Users can install and upgrade a ready-to-run GitHub release bundle without relying on host Node.

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a clean supported macOS, Linux or Windows user account with no Node on PATH, when the user selects default installation, then the matching zipped GitHub bundle installs with its declared private Node version under ~/.insrc, serves the selected release identity and needs no elevation or local source compilation. _(operationalizes `k1`, `k2`, `k7`)_
- **ac2:** Given an installed bundle and a successor for the same supported target, when the user requests an upgrade, then the selected release is prepared using its private runtime, retains bundle mode, reports success only after the intended release is reachable, and does not advance through unresolved migration failure. _(operationalizes `k1`, `k2`, `k5`)_
- **ac3:** Given an unavailable download, corrupt archive, incompatible target or unusable runtime, when installation or upgrade is attempted, then it reports the specific failure without claiming success or silently switching to dev mode; failure before migration/cutover leaves the incumbent usable. _(operationalizes `k1`, `k2`, `k7`)_
- **ac4:** Given a release maintainer selects an exact source revision and supported target, when release bundles are prepared for GitHub distribution, then each target has a zipped installable bundle with its declared runtime, required native dependencies and release/source identity; installation does not require rebuilding daemon source. _(operationalizes `k1`, `k2`, `k7`)_

### 6.2 STORY-c3d71313f34bce71-s2 — Install and upgrade development checkouts

**User value:** `size: L`

Developers can install and sync a selected repository and branch with a predictable private Node runtime.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a supported platform and an explicitly selected repository and branch, when dev installation runs, then the selected revision is built and started with private Node and matching package tooling under ~/.insrc, with missing source-build prerequisites reported without elevation. _(operationalizes `k1`, `k2`, `k7`)_
- **ac2:** Given a dev installation with a newer selected-branch revision and an unrelated upstream branch, when an upgrade is requested, then only the configured repository/branch is synchronized, built and activated; the resulting daemon identifies that revision and stays in dev mode. _(operationalizes `k1`, `k2`)_
- **ac3:** Given a checkout with local changes, a branch conflict or a failed build, when dev upgrade is requested, then local changes are not silently discarded and a failed preparation does not report a successful upgrade or stop the usable incumbent. _(operationalizes `k1`, `k7`)_

### 6.3 STORY-c3d71313f34bce71-s3 — Guide dependency setup without privilege escalation

**User value:** `size: M`

Users can resolve missing Ollama and see coding-agent recommendations with clear consent and no privileged commands.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given Ollama is absent, when dependency checks run, then the user is offered auto-install, nothing installs before acceptance, and accepting uses a supported user-level route or reports a concrete limitation without requesting elevation. _(operationalizes `k3`, `k7`)_
- **ac2:** Given Ollama is present or the user declines its installation, when dependency checks finish, then the detected state is shown accurately, a working installation is not replaced, and declining leaves Ollama uninstalled with the unmet requirement visible. _(operationalizes `k3`)_
- **ac3:** Given none, one or several of Claude Code, Codex and Mistral Vibe are present, when agent checks run, then each detected CLI is reported; if none are present at least one is recommended; the installer never automatically installs an agent CLI. _(operationalizes `k3`)_

### 6.4 STORY-c3d71313f34bce71-s4 — Control daemon start and shutdown through IPC

**User value:** `size: L`

Users can start, stop and restart a selected installation reliably using graceful or explicitly immediate shutdown.

**Depends on:** `s1`, `s2`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a selected installed daemon is stopped or already running, when start is requested, including competing IDE startup requests, then one daemon serves the selected installation, an already reachable daemon is reused, and readiness rather than PID existence determines success. _(operationalizes `k1`, `k4`, `k6`)_
- **ac2:** Given a reachable daemon has active work, when default stop or restart is requested, then shutdown is requested through IPC and allows graceful draining; restart starts the intended installation only after shutdown completion and reports its readiness. _(operationalizes `k4`)_
- **ac3:** Given a reachable daemon has active work, when the user explicitly chooses immediate shutdown, then IPC requests immediate exit without waiting for graceful work draining and the resulting stopped state is reported. _(operationalizes `k4`)_
- **ac4:** Given shutdown IPC fails or the daemon does not complete shutdown, when stop or restart is requested, then the operation reports the failure and offers explicit next steps, sends no PID/signal/kill command, and does not launch a competing replacement while shutdown remains uncertain. _(operationalizes `k4`, `k8`)_

### 6.5 STORY-c3d71313f34bce71-s5 — Delegate upgrade migrations to ordered hooks

**User value:** `size: L`

Users can upgrade state through applicable, validated migration hooks and diagnose or explicitly retry failures.

**Depends on:** `s1`, `s2`, `s4`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given an upgrade manifest contains ordered in-process hooks whose checks return needed or not needed, when an upgrade is prepared and applied, then checks decide applicability, unneeded hooks are skipped, and needed hooks run then test in declared order before normal daemon startup. _(operationalizes `k5`)_
- **ac2:** Given one hook check, run or test fails, when the upgrade reaches that hook, then the failing hook and phase are reported, later hooks do not run, activation does not claim success, and normal startup stays blocked until the failed migration is resolved. _(operationalizes `k5`)_
- **ac3:** Given a migration attempt failed or was interrupted, when the user explicitly retries or invokes hook-owned recovery, then the outcome is diagnosed and rechecked under the hook's own policy, required validation must pass before startup unblocks, and the framework imposes no generic data migration or automatic rollback policy. _(operationalizes `k5`)_
- **ac4:** Given no upgrade migration is applicable, when installation, ordinary startup or a no-migration upgrade runs, then migration work does not run unnecessarily; applicable upgrade hooks are driven identically for bundle and dev delivery. _(operationalizes `k1`, `k5`)_
- **ac5:** Given an existing installation with representative user state and an explicitly supported upgrade path, when the user upgrades to the replacement installer, then applicable hooks decide and validate the required migration; an unsupported predecessor is diagnosed before state changes, and no generic migration policy silently deletes or rebuilds user state. _(operationalizes `k1`, `k5`)_

### 6.6 STORY-c3d71313f34bce71-s6 — Manage daemon installation and lifecycle in VS Code

**User value:** `size: L`

VS Code users can install, maintain and control the daemon without leaving the editor.

**Depends on:** `s3`, `s4`, `s5`

**Extends:** [[c6]]

**Acceptance criteria:**

- **ac1:** Given the VS Code plugin activates with a running, stopped or missing daemon, when startup checks complete, then it reuses a reachable daemon, starts an installed stopped daemon, or offers installation when absent; failures remain visible without blocking editor startup. _(operationalizes `k6`, `k9`)_
- **ac2:** Given an upgrade is available in the selected delivery mode, including after a plugin update, when the startup upgrade check completes, then the user receives an upgrade prompt; dismissal changes nothing and acceptance invokes the shared upgrade path and reports outcome. _(operationalizes `k1`, `k6`)_
- **ac3:** Given a selected installation or a blocked migration, when the user opens daemon actions, then install, mode-appropriate upgrade, start, graceful stop, explicit immediate stop, restart and migration status/retry are accessible and reflect operation results through the supported control boundary. _(operationalizes `k4`, `k5`, `k6`, `k9`)_

### 6.7 STORY-c3d71313f34bce71-s7 — Manage daemon installation and lifecycle in JetBrains

**User value:** `size: L`

JetBrains users receive the same daemon setup, upgrade consent and lifecycle behavior as VS Code users.

**Depends on:** `s3`, `s4`, `s5`

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given the JetBrains plugin activates with a running, stopped or missing daemon, when startup checks complete, then it reuses a reachable daemon, starts an installed stopped daemon, or offers installation when absent, without blocking the UI thread. _(operationalizes `k6`, `k9`)_
- **ac2:** Given a bundle or dev upgrade is available, including following a plugin update, when startup checks complete, then the IDE prompts before upgrading; dismissal leaves the installation unchanged and acceptance reports the actual result. _(operationalizes `k1`, `k6`)_
- **ac3:** Given a selected installation or blocked migration, when the user opens daemon actions, then install, mode-appropriate upgrade, start, graceful stop, explicit immediate stop, restart and migration status/retry match the shared behavior and expose failures. _(operationalizes `k4`, `k5`, `k6`, `k9`)_

### 6.8 STORY-c3d71313f34bce71-s8 — Qualify installation, upgrades and lifecycle across platforms

**User value:** `size: L`

Users can rely on reproducible evidence that both delivery modes and both IDE integrations work on supported platforms.

**Depends on:** `s1`, `s2`, `s3`, `s4`, `s5`, `s6`, `s7`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given isolated Linux OrbStack, macOS UTM and actual Windows test environments, when the qualification matrix runs, then both delivery modes pass clean install, successor upgrade, private-Node isolation, start, graceful stop, immediate stop, restart and migration skip/success/failure/retry scenarios; evidence records OS, architecture, runtime and exact source or archive identity. _(operationalizes `k1`, `k2`, `k4`, `k5`, `k8`)_
- **ac2:** Given both IDE clients on each supported platform, when startup, upgrade-decline/accept and manual action scenarios run, then reachability, autostart, explicit upgrade consent, dependency prompts and failure/migration diagnostics work consistently; missing Windows evidence remains explicitly unverified. _(operationalizes `k3`, `k6`, `k9`)_
- **ac3:** Given the host Mac daemon tracks v2 and VM tests are running, when the qualification suite completes, then all mutations remain in isolated installations/state; no elevation, daemon kill command or host-daemon installation/lifecycle mutation occurs, and test failures retain diagnostic evidence. _(operationalizes `k4`, `k7`, `k8`)_

## 7. References

- **[[c1]]** `stakeholder` `Current installation/lifecycle brainstorm and Define direction, 2026-11-23` — "Bundle default; dev repo/branch sync; Linux/Mac/Windows; private Node; Ollama consent; agent CLI recommendation; IPC-only stop/restart; ordered check/run/test upgrade hooks; both IDEs; isolated VM val"
- **[[c2]]** `doc` `docs/plans/installer-removal-status.md` — "No replacement is supplied in this change. Earlier installation instructions and historical workflow records describe the retired implementation."
- **[[c3]]** `prior-artifact` `docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/DEF.md`
- **[[c4]]** `doc` `AGENTS.md`
- **[[c5]]** `code` `src/daemon/index.ts`
- **[[c6]]** `code` `vscode-plugin/src/activation.ts`
- **[[c7]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`
- **[[c8]]** `prior-artifact` `docs/epics/work-framed-approved-spec-proceed-from-E20260923b6c90b3e/DEF.md`
