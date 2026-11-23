<!-- insrc:artifact HLD-c3d71313f34bce71 -->

# HLD: reliable-cross-platform-daemon-installation-lifecycle

## Summary

**Tracker:** [insors-ai/insrc#242](https://github.com/insors-ai/insrc/issues/242)

VS Code and JetBrains open a visible terminal and run the same installer script used for manual installation. Once installation succeeds and the daemon is ready, that script launches the installed insrc TUI in the same terminal. Failed or cancelled installation leaves diagnostics visible instead.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [UX](#10-ux)
11. [References](#11-references)

## 1. Problem context

> See **DEF-c3d71313f34bce71** § 1. Problem

## 2. Framework summary

Choose a1: one shared user-level installer/manager with bundle and dev delivery adapters. Install launched from either IDE runs the same public platform installer script interactively in a visible terminal; the script owns prompts and output. IDE-specific installation wizards and hidden background installs are excluded. Lifecycle, migration, runtime and privilege constraints remain shared and unchanged. Successful interactive installation hands the same terminal directly to the installed insrc TUI after daemon readiness; it does not finish at an idle shell.

## 3. Architecture shape

Proposed architecture (new ownership boundaries, not claims about existing modules): one short-lived user-level manager, two delivery adapters, a daemon-owned migration-only mode and thin IDE adapters. The manager is a separate pure TypeScript/ESM entrypoint with minimal filesystem/network/process dependencies; it must not import indexer, DB, model or workflow application boot. It remains available when daemon boot fails. Existing integration touchpoints are src/daemon/index.ts, src/daemon/server.ts, src/shared/ipc-client.ts, src/shared/paths.ts, vscode-plugin/src/activation.ts and the JetBrains gateway. New file names are assigned in LLD; nothing restores the retired script set wholesale.

Bootstrap and layout: ship one canonical POSIX installer entrypoint for Linux/macOS and one canonical PowerShell installer entrypoint for Windows inside the IDE packages and release assets. These are the exact entrypoints offered to manual terminal users, with the same release-owned bytes and default options. Each script only establishes private Node and delegates the installation workflow to the same interactive manager; no IDE-specific installer script, forked flow or private installation implementation exists. They contain the same release-owned runtime policy and per-target SHA-256 pins, download/extract an exact Node 22.22.1 distribution and matching npm into ~/.insrc/runtimes/<version>/<target>, verify it and launch the shared manager by absolute path. They contain no upgrade or daemon lifecycle engine. No host Node, npm global install, sudo, installer elevation, system service or execution-policy change is permitted. Missing ordinary extraction/download tools are reported; the platform LLD specifies user-level alternatives. Signed builds are deferred: HTTPS, published digests and target/schema checks provide transport/integrity checks, not a claim of release-signature authentication. The version is release policy, never latest/PATH fallback; changing it requires native qualification.

Controller metadata lives under ~/.insrc/install and immutable payloads under ~/.insrc/releases/<release-id>; these are proposed locations. Existing application data stays in its current home until an applicable hook explicitly moves it. A shared explicit home setting must reach PATHS, the manager, all spawned daemon/worker/MCP processes, both IDE clients and endpoint resolution; default remains ~/.insrc. No partial HOME override is accepted as test isolation. A portable installed launcher selects a complete manager/runtime pair from an atomic metadata record; running operation code is never overwritten during an upgrade. Unknown schema/target/manager protocol versions fail before disruption. Each release owns exactly one runtime identity and an ordered zero-or-more hook list; one installation has zero-or-one active release and zero-or-one unfinished operation. A hook reference names a module within the candidate payload; it is not a URL or remote endpoint. Historical records remain historical and do not create compatibility obligations for retired controls.

Preparation: bundle mode is default and resolves a zipped GitHub release by selected repository/channel plus OS/architecture, digest and immutable release identity. Bundles contain built JS, assets, private runtime and target-native dependencies; no npm/build runs on a bundle consumer. Dev mode resolves the explicitly configured repository/branch to an exact commit, prepares a separate checkout, installs from the lockfile with private Node/npm, builds and probes the target-native payload. Dirty/conflicting source is diagnosed without reset or overwriting user changes. ONNXRUNTIME_NODE_INSTALL_CUDA=skip is set for dependency installation unless already set in the inherited environment; its effective value is recorded. Git/compiler/system-library prerequisites are diagnosed without privilege escalation. Both adapters return the same prepared candidate contract and cannot silently switch modes. Changes to mode/repository/branch require a new explicit user selection.

Operation coordination: inspect/check-upgrade are read-only. Mutating operations acquire one OS-backed exclusive file lock per installation; the OS releases ownership on process death. POSIX advisory locking and Windows exclusive file locking are behind a single small platform adapter; exact binding selection is an s1 LLD decision and must be independently tested on all enabled targets. Do not implement ownership using PIDs, process liveness probes, age-based lock stealing or heartbeat expiry. A concurrent caller receives busy plus operation identity and can inspect status. Atomically replaced, schema-validated records capture predecessor/candidate/phase and hook stage before destructive work. Preparation failures leave incumbent payload/data/running intent unchanged. quiescing/migrating/activating/blocked records deny independent ordinary startup; unreadable or inconsistent records fail closed. All daemon entrypaths apply this boot guard before opening application stores. A crashed controller can be retried only after exclusive lock acquisition; it must reconcile recorded phase and daemon instance evidence before continuing, never guess that an unreachable process exited.

IPC/lifecycle: preserve newline-framed JSON-RPC and existing Unix endpoint by default. Windows uses a named pipe scoped to current user and installation, with a per-user capability handshake/protected token and restrictive endpoint access. VS Code uses Node net directly; JetBrains retains direct Unix IPC on Unix and uses the private manager's Node stdio-to-pipe bridge on Windows. The bridge forwards complete RPC/stream frames and preserves cancellation, disconnect and written/uncertain semantics; it performs no application reasoning or data access. It is a bounded client helper, not a daemon supervisor. All manager subprocesses use argument arrays and bounded protocol records rather than interpolated shell commands.

Start does not sync, install or rebuild; it checks the selected payload, guard and runtime, reuses a matching ready daemon, or launches once and waits for identity-bearing readiness. A reachable different installation/release is surfaced as a conflict, not claimed as success. The daemon implements daemon.shutdown with graceful default and immediate explicit mode; no process.kill, taskkill, kill command, PID fallback or external signal is used for daemon control. Graceful mode stops admission, drains active work and invokes application resource disposal. On timeout the result remains uncertain; the IDE can offer an explicit IPC immediate action. A second immediate request must remain admissible while draining and supersede an earlier graceful request without being trapped behind it.

Shutdown accepted is distinct from completion. A nonce-bound local completion channel, established by the manager for the exact instance/operation, confirms release of application/store ownership only after shutdown. A tiny daemon launcher wrapper owns the child exit event and emits completion after actual child exit; it does not kill or restart the daemon. The application child exits itself after graceful disposal or its own immediate-exit handler. This wrapper exists only for one daemon lifetime, has no policy and must also exit on completion. Managed restart waits for this exit evidence plus endpoint closure; acknowledgement or socket disappearance alone is insufficient. If the completion evidence is lost, return blocked/uncertain and do not spawn a replacement until explicit recovery establishes exclusive ownership. An older daemon lacking this protocol must be stopped through its existing shutdown IPC; adoption remains a diagnosed precondition until a source-specific hook/preflight can establish that it is stopped without PID/kill control. Do not claim all historical installs are automatically upgradeable.

Upgrade ordering: prepare and validate candidate identity/runtime/compatibility and prerequisites while incumbent serves; obtain user acceptance for the exact offer; record quiescing; request shutdown IPC and await verified completion; record migrating; run the candidate daemon in migration-only mode; record activating and select the candidate; start and confirm exact readiness; finally mark ready. Migration-only mode opens only hook-required application services under daemon ownership and exits without starting normal index/model/workflow services. No old and candidate processes open the same stores concurrently. No automatic restart-to-old-release is attempted after a migration or first candidate data write.

Migration delegation: check/run/test are in-process methods, not network APIs. Manifest order is authoritative and there is no dependency graph. For each unique id/version, record the current phase, evaluate check, skip only a clean not-needed result, otherwise record run-started, await run, then test and persist completion. Hooks decide whether/how to move data, import legacy state, back up, rebuild, resume or recover; core imposes none of those policies. A run that completed or may have partially completed but lacks a successful test is never considered validated because a retry check says not-needed: its test must pass before that hook/operation can finish. Check/run/test failure or process interruption records blocked with hook, stage and diagnostics; later hooks and normal startup stop. Explicit retry reacquires the operation lock, uses the same immutable candidate and recorded source release, rechecks applicability and follows hook-owned recovery/idempotency. No generic rollback engine, no automatic data deletion and no silent migration on ordinary daemon start.

Dependencies: inspect both installed executables and Ollama service reachability, distinguishing missing, installed-not-running and unavailable. Existing Ollama is reused. A missing installation offers an exact version and destination; acceptance installs official payload into a user-owned directory without modifying system PATH or service configuration. macOS can use a user-local app/CLI path, Windows a user-local installation/archive, and Linux unpacked official binaries with a user-session serve process. Do not invoke Ollama's privileged Linux install script. Required decompression tools/GPU drivers are diagnosed, never installed with elevation; CPU smoke is sufficient for installer qualification. Declining keeps Ollama absent and shows the unmet requirement; it is not false success for Ollama-dependent features. Detect claude/codex/vibe executables without initiating sign-in, LLM calls or installation; if none are present show recommendations. No download of large models is implicit in this epic.

IDE installation UX: when installation is absent, the native IDE action is Install, with a short explanation that setup runs in a terminal. Selecting it creates or focuses a dedicated visible Insrc Installation terminal in the current IDE and invokes the same public platform installer script as a manual terminal install. The script is launched in an interactive shell that remains open after the command, not a hidden subprocess whose output is reconstructed in a webview or notification. The terminal receives stdin/stdout/stderr directly and owns bundle/default versus dev repo/branch selection, the Ollama consent question, agent recommendations, download/build progress, actionable errors and the final result. One installer flow is the source of truth across manual, VS Code and JetBrains initiation. Do not pre-answer dependency prompts or introduce a duplicate IDE wizard. Auto-start of an already installed daemon and ordinary status/lifecycle calls remain bounded background control operations; this terminal directive applies to installation.

Terminal launch contract: use a resolved absolute script path, explicit platform-appropriate shell, chosen installation home and one operation identity. Both IDEs package the same script version/checksum as its manual release asset. Arguments and paths containing spaces, Unicode or shell metacharacters are transported without concatenating unescaped user text; exact native terminal APIs and quoting adapters are resolved and tested in each IDE LLD. Opening a terminal is not proof of installation success. The script writes the shared durable operation result, while the IDE observes installation state and confirms exact daemon readiness through IPC before marking installation complete. The IDE does not scrape prompts, terminal output or terminal exit codes as the authoritative result. User credentials and terminal input are never captured in an IDE protocol log.

Terminal lifecycle: same-IDE duplicate Install actions focus the existing installation terminal/operation; cross-IDE or cross-window competing requests report the shared operation as busy and never launch concurrent installers. After successful installation and exact daemon readiness, the shared installer marks the install operation complete, releases its mutation lock, and launches the selected release's insrc TUI in the same terminal with stdin/stdout/stderr attached. It uses the installed launcher/private runtime rather than a PATH-resolved executable. This is the default success handoff for interactive manual and IDE installs, with no additional IDE click. The terminal does not merely stop at an idle prompt. Exiting the TUI returns to the terminal shell without stopping the daemon or rerunning setup. Failure or cancellation before install success leaves diagnostics visible and does not launch the TUI. If TUI launch itself fails after installation completed, report a post-install TUI launch error and the exact command to retry the TUI; do not misreport installation failure, reinstall, or undo the successful install. Closing it or pressing Ctrl+C must not be interpreted as success or trigger an automatic relaunch. Cancellation before disruptive work leaves the incumbent unchanged; an interruption after quiescing or during migration follows the existing blocked-operation and explicit-retry rules. Normal daemon processes are isolated from terminal-session teardown; do not send kill commands or signals to control a daemon. If the IDE terminal is unavailable, show an actionable terminal-launch failure and the equivalent manual command; do not silently substitute a hidden installation. No installation begins until there is a user-accessible terminal.

Other IDE UX and ownership: on activation, perform a bounded off-UI-thread reachability probe. Reuse a ready daemon, start an installed stopped daemon, or offer Install when truly absent; a transport error is not evidence of absence. Read-only upgrade discovery still shows an exact Upgrade/Dismiss offer, and every daemon upgrade—including following a plugin update—requires explicit acceptance. Existing native notifications/settings expose ordinary lifecycle status, blocked migration diagnostics, logs and explicit retry or immediate-shutdown choices. This revision does not require upgrade/start/stop operations to open a terminal. Installation completion reconnects normal status/configuration/MCP surfaces without blocking the editor UI. The UX companion is an illustrative flow, not a new install webview.

Platform qualification: release metadata separates OS, CPU architecture and native ABI; enabled support is based on recorded native/runtime evidence, never a universal archive. The planned matrix covers macOS arm64/x64, Linux arm64/x64 and Windows arm64/x64. Linux functional qualification uses isolated OrbStack guests; record whether x64 is translated and use a native x64 Linux runner for architecture-dependent gaps. macOS arm64 uses the existing UTM VM; x64 uses a macOS x64 runner or host, without mutating this host's v2 daemon. Windows uses a Windows 11 ARM64 UTM guest for native ARM64 and explicit x64-emulation cases, plus an actual Windows x64 runner for x64-native dependencies and named-pipe cases. These are selected environments, not assertions they are provisioned or tests have passed. A target is not published as supported until its own native module probes and operation matrix pass. Unsupported baseline/architecture returns an actionable error; qualification does not silently narrow the user-approved OS scope.

Relationship and artifact relevance: Installation owns controller metadata and selects zero-or-one immutable Release; Release refers to one Runtime and zero-or-more ordered HookReferences; Operation belongs to one Installation and may reference predecessor and candidate releases. These additions preserve existing application-store ownership and IPC payloads except additive, versioned lifecycle fields. The structured ER definition visualizes these relationships. Cross-process ordering is specified above in the upgrade and shutdown sequences. The framework.write step accepts the ER source; the final HLD synthesis schema also accepts sequence, component and UX source definitions. Supply the relevant structured definitions at that final boundary and inspect all generated companion sources/rendering. No companion references are hand-authored. The terminal-install UX source depicts the launch action, interactive script transcript and completion/retry behavior. Native terminal API details remain in client LLDs; the mock is not a custom install webview.

## 4. Diagrams

- [ER model](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/er-model.html)
- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/sequence-diagram.html)
- [Component dependencies](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Installation and release identity

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`

**Purpose:** One installation owns one selected delivery mode, zero or one active release and zero or one unresolved operation. Release identities are immutable; the controller metadata never stores application DB contents.

**Interface sketch (type-level):**

```
type Delivery = { mode: 'bundle'; repository: string; channel: string } | { mode: 'dev'; repository: string; branch: string };
interface Target { os: 'darwin' | 'linux' | 'win32'; arch: 'arm64' | 'x64'; baseline: string }
interface RuntimeIdentity { version: string; target: Target; sha256: string; relativeExecutable: string }
interface ReleaseManifest { schemaVersion: 1; releaseId: string; sourceCommit: string; target: Target; runtime: RuntimeIdentity; payloadSha256: string; daemonEntry: string; managerEntry: string; tuiEntry: string; protocolVersion: 1; compatiblePredecessors: string[]; migrations: HookReference[] }
interface Installation { schemaVersion: 1; installationId: string; dataHome: string; delivery: Delivery; activeReleaseId?: string; operationId?: string }
```

### 5.2 sc2: Manager command and operation state

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`

**Purpose:** A private-runtime command runner serves both IDEs when daemon is running, stopped or blocked. One OS-backed exclusive lock serializes all mutating operations per installation; controller records and bounded progress are shared across clients. Interactive install is invoked by the shared script in the terminal. The structured manager protocol remains for ordinary control/status; the IDE does not drive installation prompts through it. The 'install' action is reserved exclusively for the shared bootstrap/installer script executing inside the interactive terminal. VS Code/JetBrains adapters must never invoke ManagerAction.install directly or drive its prompts through this protocol; they only launch/focus the terminal and observe completion/readiness. The s1 LLD must state and enforce this caller restriction.

**Interface sketch (type-level):**

```
/** 'install' is terminal-bootstrap-only; IDE adapters may not invoke it directly. */
type ManagerAction = 'inspect' | 'check-upgrade' | 'install' | 'upgrade' | 'start' | 'stop' | 'restart' | 'retry-migration';
type Phase = 'preparing' | 'quiescing' | 'migrating' | 'activating' | 'ready' | 'stopped' | 'blocked';
interface ManagerRequest { protocolVersion: 1; operationId: string; action: ManagerAction; installationId: string; shutdownMode?: 'graceful' | 'immediate'; acceptedOfferId?: string; installOllama?: boolean }
interface OperationRecord { operationId: string; predecessorId?: string; candidateId?: string; phase: Phase; hookId?: string; hookStage?: 'check' | 'run' | 'test'; errorCode?: string; message?: string }
interface ManagerEvent { protocolVersion: 1; operationId: string; kind: 'progress' | 'result'; state: OperationRecord; retryable: boolean }
interface UpgradeOffer { offerId: string; installationId: string; currentReleaseId?: string; candidateReleaseId: string; delivery: Delivery }
```

### 5.3 sc3: Dependency report and consent

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`

**Purpose:** Foundation contract separates required private Node, Ollama availability and advisory agent CLI detection from their platform implementations in s3; IDEs cannot infer consent from plugin updates.

**Interface sketch (type-level):**

```
interface DependencyReport { runtimeReady: boolean; ollama: 'ready' | 'installed-not-running' | 'missing' | 'unavailable'; ollamaInstallOffer?: { id: string; destination: string; version: string }; agents: { claude: boolean; codex: boolean; vibe: boolean }; recommendations: string[]; blockers: string[] }
interface DependencyDecision { offerId: string; choice: 'install' | 'decline' }
```

### 5.4 sc4: Daemon shutdown and readiness

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`, `s7`, `s8`

**Purpose:** The selected daemon admits shutdown over its local JSON-RPC endpoint only. Acknowledgement is not exit completion. Readiness reports instance/release identity and startup gating; immediate escalation is an explicit second request.

**Interface sketch (type-level):**

```
interface DaemonIdentity { instanceId: string; installationId: string; releaseId: string; protocolVersion: 1; state: 'ready' | 'draining' | 'migration-blocked' }
interface ShutdownRequest { operationId: string; expectedInstanceId: string; mode: 'graceful' | 'immediate'; completionEndpoint: string; completionNonce: string }
interface ShutdownAccepted { operationId: string; instanceId: string; accepted: true; mode: 'graceful' | 'immediate' }
interface ShutdownCompletion { operationId: string; instanceId: string; completionNonce: string; resourceOwnershipReleased: true }
```

### 5.5 sc5: Ordered upgrade hook delegation

**Owner Story:** `s1`
**Consumed by:** `s2`, `s4`, `s5`, `s6`, `s7`, `s8`

**Purpose:** Owned by foundational s1 because delivery preparation, startup guard and s5 runner all require the same hook manifest. s5 implements execution. Hooks run in-process inside a candidate daemon migration-only process that exclusively owns data; manager and IDE never open LMDB/Lance.

**Interface sketch (type-level):**

```
interface HookReference { id: string; version: string; module: string }
interface MigrationContext { installationId: string; operationId: string; fromReleaseId?: string; toReleaseId: string; dataHome: string }
interface HookDecision { needed: boolean; reason: string }
interface HookValidation { passed: boolean; detail: string }
interface UpgradeHook { check(context: MigrationContext): Promise<HookDecision>; run(context: MigrationContext): Promise<void>; test(context: MigrationContext): Promise<HookValidation> }
```

### 5.6 sc6: Local transport and explicit installation home

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`

**Purpose:** All consumers resolve the same installation home and endpoint. Unix retains daemon.sock; Windows uses a per-user/per-installation named pipe. The manager's Node bridge supplies JetBrains Windows transport without changing application RPC payloads.

**Interface sketch (type-level):**

```
interface LocalEndpoint { kind: 'unix' | 'named-pipe'; address: string; installationId: string }
interface InstallationLocation { home: string; installationId: string; daemonEndpoint: LocalEndpoint }
interface IpcBridgeRequest { protocolVersion: 1; endpoint: LocalEndpoint; rpcFrame: string }
interface IpcBridgeEvent { kind: 'frame' | 'closed' | 'error'; frame?: string; written?: boolean; code?: string }
```

### 5.7 sc7: Shared terminal installer launch

**Owner Story:** `s1`
**Consumed by:** `s6`, `s7`, `s8`

**Purpose:** Foundation-owned contract makes manual and both IDE installation entrypoints identical. IDE adapters only open/focus a terminal and invoke the same script; the terminal owns the interaction and durable operation state/readiness determines success. On successful install/readiness the shared script releases installation ownership and launches the installed TUI in the same terminal; failure/cancel does not launch it.

**Interface sketch (type-level):**

```
interface TerminalInstallLaunch { operationId: string; installationId: string; home: string; platform: 'posix' | 'powershell'; scriptPath: string; scriptVersion: string; scriptSha256: string; arguments: string[]; terminalName: 'Insrc Installation'; onInstallSuccess: 'launch-tui' }
interface TerminalInstallHandle { operationId: string; terminalSessionId: string; state: 'opened' | 'reused' | 'launch-failed' }
interface InstallationObservation { operationId: string; phase: Phase; daemonReady: boolean; errorCode?: string }
```

## 6. Story boundaries

### 6.1 Story STORY-c3d71313f34bce71-s1

**Owns:** `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`

Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged.

### 6.2 Story STORY-c3d71313f34bce71-s2

**Depends on:** `sc1`, `sc2`, `sc3`, `sc5`, `sc6`

Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged.

### 6.3 Story STORY-c3d71313f34bce71-s3

**Depends on:** `sc1`, `sc2`, `sc3`, `sc6`

Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged.

### 6.4 Story STORY-c3d71313f34bce71-s4

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc5`, `sc6`

Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged.

### 6.5 Story STORY-c3d71313f34bce71-s5

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.

### 6.6 Story STORY-c3d71313f34bce71-s6

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`

Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.

### 6.7 Story STORY-c3d71313f34bce71-s7

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`

Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.

### 6.8 Story STORY-c3d71313f34bce71-s8

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`

Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

## 7. Non-functional targets

- **Performance:** Targets: local read-only inspection/reachability <=3 seconds; activation never blocks IDE UI. Progress/phase changes emit within 1 second after state changes. Ready startup target <=15 seconds excluding dependency/model initialization; startup probe deadline 30 seconds. Default graceful wait 60 seconds with configurable user deadline; timeout reports uncertainty and never silently escalates. Downloads/builds/hooks have per-operation budgets and progress, not an arbitrary task retry loop.
- **Security:** No elevated commands, global PATH edits, user credential capture, LLM calls for dependency detection or shell-interpolated actions. Verify payload/runtime digests and targets, reject archive traversal/symlink escapes and module paths outside candidate payload. Local endpoints are user-scoped, capability-protected where needed; bind operation/instance/release identity. Signing deferred and no cryptographic authenticity claim from unsigned digest metadata. No IDE prompt automation or credential/input capture; terminal launch preserves argument boundaries. User-visible script identity matches manual release assets.
- **Observability:** Structured operationId/installationId/from-to identity, platform/runtime/digest, phase/hook/stage, duration and actionable error code. Bounded NDJSON to IDE, logs in installation home with rotation; no credentials/tokens or full migration data. Report explicitly which platform/native checks passed and which were unavailable. Interactive installation prints human-readable phases and errors directly in the terminal. The terminal is retained after completion/failure; its output is not scraped or treated as success evidence.
- **Durability:** OS-backed mutation exclusivity plus atomic versioned controller records. Prepared payloads immutable; candidate data mutation is daemon-owned only. Record hook run-started before execution and require test before completion; failures/interruption retain blocked startup. Retry never substitutes a different candidate or starts the predecessor after data changes automatically. Installation completion and lock release precede the interactive TUI session. TUI exit/launch failure cannot roll back the completed installation or keep an installation lock held.

## 8. Rollout

**A — bundle foundation**

**Stories:** `s1`

Establish common contracts, private runtime/bootstrap, platform home/endpoint/lock adapters and immutable bundle format before consumers. Bundle integration can use fixtures until lifecycle/migration stories land; do not claim end-to-end upgrade completion at this stage. Include canonical manual/IDE installer scripts and the terminal launch contract.

**Backward compat:** Default home and Unix daemon.sock remain compatible; current host v2 installation is untouched. Reject unknown controller schemas and unsupported legacy paths before mutation.

**B — dev preparation**

**Stories:** `s2`

Add selected repo/branch candidate preparation using s1 contracts, without defining another lifecycle controller.

**Backward compat:** Preserve dirty source and explicit mode selection; no destructive reset or implicit branch/mode switch.

**C — dependencies and lifecycle**

**Stories:** `s3`, `s4`

Both depend on s1/s2 and can establish dependency policy and IPC lifecycle behind shared contracts before migration integration.

**Backward compat:** Normal IPC payloads remain unchanged; shutdown/readiness additions are versioned. Existing source-specific shutdown IPC is a legacy precondition, not PID fallback.

**D — delegated upgrades**

**Stories:** `s5`

s5 consumes s4 shutdown evidence and foundational manifest/hook contracts to integrate blocked startup and retry safely.

**Backward compat:** Existing data changes only through applicable hook decisions. No generic rollback or migration policy; unsupported predecessors diagnosed before disruption.

**E — IDE parity**

**Stories:** `s6`, `s7`

Both depend on dependency/lifecycle/migration behaviors, so each stays thin and shares operation semantics. Both IDE Install actions open a real terminal and delegate the full interaction to the shared script.

**Backward compat:** Preserve existing status, configuration, registration and MCP integration. Prior silent plugin-triggered daemon upgrades are intentionally replaced by explicit consent.

**F — platform qualification**

**Stories:** `s8`

Integrate both delivery modes and both IDEs on every declared target; only complete/publish targets with exact native and end-to-end evidence. Verify terminal/manual parity, cancellation, retained output and exact readiness rather than process/terminal exit alone. Successful interactive installation must enter TUI in the same terminal; failure/cancel must not.

**Backward compat:** Use isolated homes/endpoints and candidate payloads; do not stop, upgrade or migrate host v2 daemon. Mac UTM interaction avoids recording while user enters guest input.

**Ordering rationale:** s1 owns all cross-cutting contracts needed by distinct branches. s2 depends on s1; s3/s4 follow both; s5 follows s4; s6/s7 follow s3/s4/s5; s8 follows all. Every story appears once and every consumed shared contract is owned by an already-transitive ancestor.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Shutdown completion and Windows transport | IPC acceptance or socket closure does not prove exit; an immediate exit may expose native teardown behavior. JetBrains currently uses Unix-only socket APIs. | Instance/operation/nonce-bound child-exit completion from the minimal launcher wrapper; no competing start on uncertain outcome. Qualify native-module graceful/immediate exit and bridge stream/cancel/disconnect on actual Windows and macOS/Linux. Failure remains explicit and cannot trigger kill fallback. |
| Migration interruption and legacy adoption | Partial writes and an untested run cannot safely be inferred complete or reverted; older daemons lack the new completion protocol. | Durable hook-stage records and daemon boot guard, immutable candidate, exclusive data owner, mandatory post-run test even after a not-needed retry check. Hooks own recovery. Supported predecessor adoption must establish stopped state through IPC/qualified source-specific evidence; unsupported cases block instead of guessing. |
| Private runtime/native dependencies and user-level Ollama | Native modules and extraction/runtime prerequisites differ by OS/CPU; official Linux install instructions assume privileged destinations and cannot be used verbatim. | Exact release-owned Node/npm/headers policy, ONNXRUNTIME_NODE_INSTALL_CUDA handling, target-native bundle probes and negative tests with wrong/no host Node. Unpack Ollama payloads into user-owned paths after consent; diagnose missing extraction tools/drivers without sudo. Record translated versus native evidence and do not mark unqualified targets supported. Validate script checksum parity, safe shell arguments and cancellation/interruption across native IDE terminals; report missing terminal support instead of launching hidden setup. |

## 9. Alternatives considered

### 9.1 a1: Shared out-of-process manager with delivery adapters — **CHOSEN**

One manager and shared manual installer scripts; IDE Install opens a real terminal and delegates the full interaction.

A small Node manager, launched with the private runtime, owns installation metadata, serialized operations and two delivery adapters: release bundle and development checkout. Minimal platform bootstraps obtain that runtime without host Node. It is available while the daemon is stopped and never opens application databases.

For installation, both IDEs open a visible terminal and invoke the same public platform script as manual users; prompts/output stay in that terminal. For ordinary lifecycle and migration control, both IDEs use the shared manager protocol. The manager prepares a candidate while the incumbent runs, shuts the incumbent down through IPC, executes ordered candidate migration hooks in a separate candidate process, then starts and probes the candidate. No persistent supervisor service or generic rollback engine is introduced. After successful interactive setup, the shared script runs the installed TUI in the existing terminal; no separate IDE success flow is introduced.

**Pros:**
- A single operation implementation serves both IDEs and three operating systems.
- Installation and recovery can work when daemon startup is blocked by a migration.
- Only two delivery adapters differ; shutdown and migration sequencing remain shared.

**Cons:**
- The private runtime and manager need an initial platform bootstrap before the first daemon starts.
- Manager and daemon must explicitly coordinate operation identity and shutdown completion.

**Cost estimate:** L

### 9.2 a2: Daemon-owned upgrade with bootstrap launcher

The daemon performs upgrades; an external launcher handles first installation and starting.

A bootstrap launcher installs the private runtime and initially provisions the daemon. When the daemon is reachable, all upgrade and migration management is requested through daemon IPC; a child performs post-shutdown actions.

Both IDEs remain IPC-oriented, but the launcher also handles stopped-daemon setup and recovery. Cross-platform delivery adapters and hooks therefore have to remain usable in both live-daemon and launcher contexts, with explicit handoff before the old daemon exits.

**Pros:**
- Live-daemon operations use the clients' existing JSON-RPC path.
- Daemon status can expose the upgrade while the old process remains alive.

**Cons:**
- Ownership transfers from a process being replaced to a child for each upgrade, increasing shutdown and interruption cases.
- A blocked or unreachable daemon still requires an external recovery path, so daemon ownership does not eliminate the launcher.

**Cost estimate:** L

**Rejected because:** Self-replacement still requires external recovery/handoff.

### 9.3 a3: Platform scripts and independent IDE orchestration

Shell/PowerShell install and lifecycle flows are separately orchestrated by each IDE.

Platform scripts provision private Node, synchronize source or extract bundles, send shutdown IPC and invoke migration hooks. Each IDE chooses and invokes the relevant scripts and translates their results into its own UI.

Shared release metadata can reduce some duplication, but platform control flow and IDE upgrade consent remain independently maintained. The scripts must still support stopped-daemon recovery and explicit migration failure records.

**Pros:**
- Uses familiar platform execution facilities for first installation.
- Each IDE can tailor progress presentation directly to its existing UI framework.

**Cons:**
- Two IDE adapters and three platform script families create multiple implementations of operation sequencing and error interpretation.
- Cross-platform migration interruption and consent behavior must be kept consistent across duplicated flows, recreating the complexity the replacement aims to remove.

**Cost estimate:** L

**Rejected because:** Separate orchestration duplicates installation policy.

## 10. UX

- [UX mock](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/ux-mock.html)

## 11. References

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c2]]** `analyze-bundle` `src/daemon/index.ts` — "s1 reused daemon module profile/import graph; incomplete coverage stated."
- **[[c3]]** `analyze-bundle` `src/daemon/server.ts` — "s1 retained entrypoint import boundary."
- **[[c4]]** `analyze-bundle` `src/shared/ipc-client.ts` — "s1 completed shared IPC module profile."
- **[[c5]]** `analyze-bundle` `src/shared/paths.ts` — "Reused daemon entrypoint import graph; explicit home gap confirmed by direct read."
- **[[c6]]** `analyze-bundle` `vscode-plugin/src/activation.ts` — "s1 completed activation profile."
- **[[c7]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt` — "s1 completed current gateway profile."
- **[[c8]]** `doc` `https://nodejs.org/docs/latest-v22.x/api/net.html` — "Node net supports named pipes on Windows and Unix domain sockets on other operating systems."
- **[[c9]]** `doc` `https://docs.ollama.com/linux`
- **[[c10]]** `doc` `https://docs.ollama.com/windows`
- **[[c11]]** `doc` `https://docs.ollama.com/macos`
- **[[c12]]** `doc` `docs/plans/installer-removal-status.md`
- **[[c13]]** `code` `.npmrc` — "Native headers target Node 22.22.1; matching private runtime required."
- **[[c14]]** `stakeholder` `User correction to pending HLD, 2026-11-23: VS Code/JetBrains installs must open a terminal and run the same install script.`
- **[[c15]]** `analyze-bundle` `vscode-plugin/src/activation.ts` — "Bounded terminal API search returned no selected native terminal launch matches; retained activation profile confirmed."
- **[[c16]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt` — "Bounded JetBrains terminal API search returned no selected matches; retained gateway profile confirmed."
- **[[c17]]** `stakeholder` `User HLD correction: launch the insrc TUI in the installation terminal once install is done.`
- **[[c18]]** `stakeholder` `User HLD review findings: reserve install to terminal bootstrap; explicitly retain each story's DEF FRs/ACs. Dependency granularity advice requires no change.`

## Citations

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c2]]** `analyze-bundle` `src/daemon/index.ts` — "s1 reused daemon module profile/import graph; incomplete coverage stated."
- **[[c3]]** `analyze-bundle` `src/daemon/server.ts` — "s1 retained entrypoint import boundary."
- **[[c4]]** `analyze-bundle` `src/shared/ipc-client.ts` — "s1 completed shared IPC module profile."
- **[[c5]]** `analyze-bundle` `src/shared/paths.ts` — "Reused daemon entrypoint import graph; explicit home gap confirmed by direct read."
- **[[c6]]** `analyze-bundle` `vscode-plugin/src/activation.ts` — "s1 completed activation profile."
- **[[c7]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt` — "s1 completed current gateway profile."
- **[[c8]]** `doc` `https://nodejs.org/docs/latest-v22.x/api/net.html` — "Node net supports named pipes on Windows and Unix domain sockets on other operating systems."
- **[[c9]]** `doc` `https://docs.ollama.com/linux`
- **[[c10]]** `doc` `https://docs.ollama.com/windows`
- **[[c11]]** `doc` `https://docs.ollama.com/macos`
- **[[c12]]** `doc` `docs/plans/installer-removal-status.md`
- **[[c13]]** `code` `.npmrc` — "Native headers target Node 22.22.1; matching private runtime required."
- **[[c14]]** `stakeholder` `User correction to pending HLD, 2026-11-23: VS Code/JetBrains installs must open a terminal and run the same install script.`
- **[[c15]]** `analyze-bundle` `vscode-plugin/src/activation.ts` — "Bounded terminal API search returned no selected native terminal launch matches; retained activation profile confirmed."
- **[[c16]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt` — "Bounded JetBrains terminal API search returned no selected matches; retained gateway profile confirmed."
- **[[c17]]** `stakeholder` `User HLD correction: launch the insrc TUI in the installation terminal once install is done.`
- **[[c18]]** `stakeholder` `User HLD review findings: reserve install to terminal bootstrap; explicitly retain each story's DEF FRs/ACs. Dependency granularity advice requires no change.`
