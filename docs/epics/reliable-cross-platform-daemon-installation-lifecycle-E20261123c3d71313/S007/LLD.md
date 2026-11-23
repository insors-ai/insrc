<!-- insrc:artifact LLD-c3d71313f34bce71-s7 -->

# LLD: STORY-c3d71313f34bce71-s7 — Manage daemon installation and lifecycle in JetBrains

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`
**Tracker:** [insors-ai/insrc#249](https://github.com/insors-ai/insrc/issues/249)

JetBrains gets the same terminal-led installation, automatic TUI handoff and explicit upgrade consent as VS Code. Background coordination keeps the IDE responsive. Unix keeps its existing IPC path; Windows uses the private Node bridge without accessing daemon data.

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
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TerminalInstallLaunch`

```typescript
interface TerminalInstallLaunch { operationId: string; installationId: string; home: string; platform: 'posix' | 'powershell'; scriptPath: string; scriptVersion: string; scriptSha256: string; arguments: string[]; terminalName: 'Insrc Installation'; onInstallSuccess: 'launch-tui' }
```

**Parameters:**
- `input: unknown` — Wire-compatible launch descriptor represented as Kotlin DTO.; untrusted wire input is schema-validated before use.

**Returns:** `TerminalInstallLaunch` — Wire-compatible launch descriptor represented as Kotlin DTO.

**Preconditions:**
- Canonical script identity verified; native Terminal plugin available.
- Terminal creation/focus is EDT-only; filesystem/process/IPC work stays background.

**Postconditions:**
- Dedicated terminal uses an explicit supported shell without changing global IDE shell settings.
- Shared script owns prompts and installed TUI; no direct ManagerRequest.install.

### 2.2 `IpcBridgeRequest`

```typescript
interface IpcBridgeRequest { protocolVersion: 1; endpoint: LocalEndpoint; rpcFrame: string }
```

**Parameters:**
- `input: unknown` — Exact Windows application frame forwarded by the private runtime bridge.; untrusted wire input is schema-validated before use.

**Returns:** `IpcBridgeRequest` — Exact Windows application frame forwarded by the private runtime bridge.

**Preconditions:**
- Resolve installed manager/runtime and protected per-user endpoint/capability; do not use host Node.
- Preserve current UTF-8 newline framing and request ids.
- Require correlated bridge-control protocol 2 and transportId/RPC-id binding under proposed sc6 before dispatch; old frame-only peer is incompatible with this lane.
- First exchange proposed sc6 bridgeHandshake hello/ready within three seconds; no frame dispatch until exact nonce/version confirmation.

**Postconditions:**
- Do not reinterpret application payloads or load DB/provider code.
- Unix existing transport remains unchanged.

### 2.3 `IpcBridgeEvent`

```typescript
interface IpcBridgeEvent { kind: 'frame' | 'closed' | 'error'; frame?: string; written?: boolean; code?: string }
```

**Parameters:**
- `input: unknown` — Frame/close/error with send uncertainty preserved.; untrusted wire input is schema-validated before use.

**Returns:** `IpcBridgeEvent` — Frame/close/error with send uncertainty preserved.

**Preconditions:**
- Bridge validates envelope and limits before forwarding.

**Postconditions:**
- Pre-write cancellation prevents dispatch; after-write cancellation/close retains uncertainty and never promises rollback.
- Unicode/stream frames survive byte chunking; late retired-id replies are discarded.
- This is an inner frame type. Per-request write/cancel outcomes use the proposed sc6 controlBridge outer envelope; do not infer named-pipe writes from helper stdin.

### 2.4 `UpgradeOffer`

```typescript
interface UpgradeOffer { offerId: string; installationId: string; currentReleaseId?: string; candidateReleaseId: string; delivery: Delivery }
```

**Parameters:**
- `input: unknown` — Native notification offer for one candidate.; untrusted wire input is schema-validated before use.

**Returns:** `UpgradeOffer` — Native notification offer for one candidate.

**Preconditions:**
- Application-level single-flight coordinator avoids duplicate project prompts/actions.

**Postconditions:**
- Every upgrade including plugin-update path requires explicit acceptance.
- Dismiss/stale offer causes no mutation.

## 3. Data model changes

### 3.1 `Native terminal compatibility binding` — new

Current build targets SDK 2024.2/Java21. Compile against the bundled Terminal plugin as an optional dependency, keeping core status/MCP available when it is disabled. Use TerminalToolWindowManager/TerminalWidget abstraction rather than ShellTerminalWidget casts or the experimental 2025.3-only TerminalView API. For a dedicated explicit-shell session, TerminalTabState.myShellCommand accepts a list; createNewSession with the runner/tab state is available at the pinned baseline. Capture the newly created widget on the EDT using setup notification or before/after widget identity, failing if ambiguous. Send the one safely encoded command through TerminalWidget.sendCommandToExecute and request focus; never read terminal text for status. Native compatibility is verified against configured IDE products/versions.


### 3.2 `Shell and terminal lifetime` — new

POSIX session starts a supported sh-family interpreter; Windows starts supported PowerShell with interactive/no-exit behavior. The shared literal-argument encoder handles spaces, Unicode, quotes and metacharacters; no execution-policy bypass or global settings change. Preserve widget identity even if user renames its tab. Duplicate Install focuses the same session; terminal close/cancel never replays setup. The script, not Kotlin, launches TUI after ready/lock release and returns to shell on TUI exit. Missing Terminal support produces visible instructions/manual command, never hidden setup.


### 3.3 `Background service and ordinary controls` — new

Proposed new JetBrains lifecycle/terminal adapter composes with current DaemonGatewayService; SDK UI calls are marshalled to EDT, all bounded probes/manager operations run off it. Running/stopped/missing/errored states follow VS Code semantics and exact identity checks. Project dispose cancels observations, not the daemon. Native notification Upgrade/Dismiss always gates both bundle/dev upgrades, including plugin updates. Existing settings/registration/MCP remain gateway IPC clients.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`

### 3.4 `Windows bridge transport` — new

Use an installed private-node manager bridge for Windows only; no JVM UnixDomainSocketAddress on Windows and no new JNA pipe dependency. Persistent unary lanes retain current 64-pending/16MiB aggregate budgets and safe-id/late-reply logic; streams use independently closable bridge lanes where socket close is their cancellation semantic. Input EOF closes only the bridge client; it does not shut down daemon. Separate stderr diagnostics from protocol-only stdout, bind local endpoint/auth to selected user/install, and preserve before/after-write error meaning. No new smaller frame limit breaks existing payloads; large fragmented UTF-8/frame tests prove parity. Consume the proposed sc6 controlBridge protocol, not an independent Kotlin protocol. The additive sc6 controlBridge envelope preserves existing inner frame types. Launch the helper explicitly in bridge-control protocol 2 and require version confirmation before sending; mismatch fails with no legacy fallback. Each send/cancel/event has a unique transportId bound to its embedded RPC request id and lane, never reused during helper lifetime. Validate before queue admission. A cancel processed before the first named-pipe write attempt removes the send, confirms cancelled/written=false and forbids later dispatch. At the first write attempt, mark written=true conservatively: possible dispatch, not application completion. A helper-stdin write is not pipe dispatch evidence. Post-write cancellation retires the local reply without rollback/replay promises. Helper death/lost outcome leaves unresolved sends unknown unless not-written was positively confirmed. Frame/error/close events carry transportId; report every pending id on lane failure where possible. Preserve 64-pending/16MiB aggregate bounds, fragmented UTF-8 and separate stream-lane cancellation. Input EOF closes the helper lane, never daemon. Consume the foundation-owned bridgeHandshake startup exchange without introducing Kotlin-specific messages. The bridge-control protocol-2 startup wire exchange is exactly one UTF-8 NDJSON hello record {kind:'hello',protocolVersion:2,sessionNonce} from the client on helper stdin, then exactly one ready record {kind:'ready',protocolVersion:2,sessionNonce} on helper stdout. The client generates a fresh unpredictable sessionNonce per helper process; helper echoes it only after validating the version and binding its configured local installation endpoint. This is a separate startup envelope, not an IpcBridgeRequest and not a correlated controlBridge outcome; it has no transportId because no request exists yet. The helper must not forward any application frame before emitting ready, and the client must not send send/cancel records until matching ready is received. Set a 3-second handshake deadline from helper spawn; missing/malformed/duplicate/wrong-version/wrong-nonce ready, early outcome frames, or helper exit fail with bridge-protocol-mismatch/bridge-handshake-timeout before dispatch. On error the client closes stdin and that helper lane, reports no sends dispatched, and performs no automatic fallback/replay; it sends no daemon signal/stop. Unsupported hello yields only a bounded stderr diagnostic and helper exit without opening an application RPC lane. After ready, stdout contains only the specified correlated controlBridge events, stderr only diagnostics; later hello/ready records are protocol errors. Handshake bytes count toward the bounded parser/input limits; no credentials/capability tokens are echoed. Existing inner IpcBridgeRequest.protocolVersion=1 remains unchanged and is distinct from outer bridge-control version 2.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`

### 3.5 `Operation escalation UI binding` — new

An explicitly selected immediate override during a draining operation consumes proposed sc2 escalateShutdown with the existing operationId. Other windows may forward the same intent to the owner; no second mutation/lock, fresh operation id, repeated shutdown timer or automatic escalation. Display escalation-unavailable/uncertain on dead owner; explicit recovery remains separate.


## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S007/sequence-diagram.html)
- [Component dependencies](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S007/component-dependency.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Bind shared contract to Kotlin/native IDE behavior and platform client transport only; owner semantics and install/migration policy remain unchanged. |
| `sc2` | consumes | Bind shared contract to Kotlin/native IDE behavior and platform client transport only; owner semantics and install/migration policy remain unchanged. |
| `sc3` | consumes | Bind shared contract to Kotlin/native IDE behavior and platform client transport only; owner semantics and install/migration policy remain unchanged. |
| `sc4` | consumes | Bind shared contract to Kotlin/native IDE behavior and platform client transport only; owner semantics and install/migration policy remain unchanged. |
| `sc5` | consumes | Bind shared contract to Kotlin/native IDE behavior and platform client transport only; owner semantics and install/migration policy remain unchanged. |
| `sc6` | consumes | Bind shared contract to Kotlin/native IDE behavior and platform client transport only; owner semantics and install/migration policy remain unchanged. |
| `sc7` | consumes | Bind shared contract to Kotlin/native IDE behavior and platform client transport only; owner semantics and install/migration policy remain unchanged. |

## 6. Error paths

**Error cases**

- **Terminal plugin/API unavailable** (recoverable)
  - Detection: Optional service resolution or compatible SDK API invocation fails.
  - Response: Show terminal unavailable and manual command; no hidden installer.
  - User impact: Core status/MCP still loads.
- **Windows bridge missing or disconnects** (recoverable)
  - Detection: Private runtime/entry identity, child framing/deadline/EOF or pipe authentication fails.
  - Response: Typed gateway error with written/uncertain status; no PID fallback or automatic retry.
  - User impact: Caller can inspect/retry deliberately.
- **Ambiguous terminal identity or shell failure** (recoverable)
  - Detection: Native creation yields no unique owned widget or launch validation fails.
  - Response: Do not send commands to arbitrary user terminals; show exact failure.
  - User impact: No unrelated shell receives installer input.
- **Upgrade offer stale or dismissed** (recoverable)
  - Detection: Candidate identity changes or user dismisses native notification.
  - Response: No mutation.
  - User impact: Consent remains exact and explicit.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Terminal engine changes across IDE versions | Use TerminalWidget abstraction and verifier matrix; no classic-widget casts or output-buffer dependence. |
| Project closes while daemon/TUI remains active | Release observers/bridge clients only; no daemon stop or setup replay. |
| Private runtime absent during Windows inspection | Differentiate missing installation/prerequisite from IPC error; shared script handles first install. |

**Invariants to preserve**

- Remain inside s7 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S007:FR001 and this story acceptance criteria apply unchanged. [[c3]]

## 7. Test strategy

**Test framework:** `JetBrains JUnit Platform (existing JUnit 5/4 build configuration) for Kotlin/native adapters; canonical node:test coordinator for shared bridge peers; real IDE/OS evidence separate.`

**Test levels**

- **contract** — Kotlin DTO/actions and consent parity.
  - Subjects: `startup state/single-flight project coordination`, `no direct install action`, `literal shell command encoding and owned widget reuse`
- **integration** — Native JetBrains terminal and bridge behavior.
  - Subjects: `real terminal visibility/focus/script/TUI`, `Windows named-pipe Unicode/stream/cancel/EOF parity`, `SDK verifier across current IDE family and terminal-disabled path`, `Two windows: graceful stop remains under owner lock; user immediate override reaches that owner; duplicate/stale/dead-owner results remain accurate.`, `Cancel queued send before pipe write confirms false and sends no bytes; cancel racing first write stays possibly-written; each of 64 requests gets correct outcome.`, `Helper dies after stdin accept/before pipe write acknowledgement: unresolved outcome unknown, no replay; protocol mismatch fails before send.`, `Real Node/Kotlin hello/ready exchange: exact nonce/version and deadline; no named-pipe application bytes before ready; malformed/early/late/duplicate startup records fail.`
  - Fixtures: `Disposable IDE sandbox/home and deterministic Node bridge peers.`
- **live** — Both modes/control/migration UI on actual target OS.
  - Subjects: `Install terminal/manual byte parity`, `startup/autostart and explicit upgrade consent`, `readiness-confirmed TUI and migration diagnostics`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `background-running-stopped-missing-errored-matrix`, `native-terminal-open-focus-shared-script`, `UI-thread-nonblocking` |
| `ac2` | `bundle-dev-offer-accept-dismiss`, `plugin-update-never-silent`, `application-single-flight-prompt` |
| `ac3` | `all-actions-shared-result-parity`, `windows-pipe-bridge-cancel-stream-written-semantics`, `terminal-success-tui-and-migration-error-retry`, `cross-window-immediate-existing-operation`, `bridge-correlated-cancel-write-race`, `bridge-death-unconfirmed-write-unknown`, `bridge-control-version-mismatch`, `bridge-handshake-native-client-parity`, `handshake-failure-zero-dispatch` |

## 8. Alternatives considered

### 8.1 a1: Native terminal adapter and platform RPC selector — **CHOSEN**

Keep one Kotlin UI adapter and use the private Node pipe bridge only where Unix sockets do not apply.

An application-scoped coordinator runs probes/control off the EDT; project-scoped native terminal handles launch the exact shared script. Platform selection preserves direct Unix RPC and uses the foundation bridge for Windows.

The plugin observes shared state and exact readiness, with no terminal scraping or silent upgrades. Optional terminal binding loads only when the Terminal plugin is available.

### 8.2 a2: Node bridge for all JetBrains RPC

Route Unix and Windows through the same helper subprocess.

The same terminal adapter is retained, but every application RPC goes through a private Node helper even on Unix. Kotlin owns one process transport rather than selecting direct Unix sockets.

This can unify code paths but replaces a working Unix transport and adds a private-runtime prerequisite to current Unix status calls.

**Rejected because:** Routing working Unix RPC through an extra helper broadens the change and creates an unnecessary runtime/lifetime dependency.

## 9. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`
- **[[c5]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`
- **[[c6]]** `code` `jetbrains-plugin/gradle.properties`
- **[[c7]]** `code` `jetbrains-plugin/build.gradle.kts`
- **[[c8]]** `doc` `https://raw.githubusercontent.com/JetBrains/intellij-community/idea/242.23726.103/plugins/terminal/src/org/jetbrains/plugins/terminal/TerminalToolWindowManager.java`
- **[[c9]]** `doc` `https://raw.githubusercontent.com/JetBrains/intellij-community/idea/242.23726.103/plugins/terminal/src/org/jetbrains/plugins/terminal/TerminalTabState.java`
- **[[c10]]** `doc` `https://platform.jetbrains.com/t/terminal-implementation-changes-from-v2025-2-of-intellij-based-ides/2264`
- **[[c11]]** `doc` `https://plugins.jetbrains.com/docs/intellij/embedded-terminal.html`
