<!-- insrc:artifact LLD-c3d71313f34bce71-s1 -->

# LLD: STORY-c3d71313f34bce71-s1 — Install and upgrade release bundles with a private runtime

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`
**Tracker:** [insors-ai/insrc#243](https://github.com/insors-ai/insrc/issues/243)

Story 1 supplies the release installer foundation: exact-target bundles, private Node, durable install records and the shared interactive scripts. IDE installation can only launch those scripts in a terminal; success enters the installed TUI after readiness and lock release. Actual daemon shutdown/readiness, migration execution and dependency discovery remain sibling implementations behind required ports.

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

**Rollout phase:** A — bundle foundation
**Owns:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc5` (Ordered upgrade hook delegation), `sc6` (Local transport and explicit installation home), `sc7` (Shared terminal installer launch)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s3`: Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s4`: Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc4`
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ReleaseManifest`

```typescript
interface ReleaseManifest { schemaVersion: 1; releaseId: string; sourceCommit: string; target: Target; runtime: RuntimeIdentity; payloadSha256: string; daemonEntry: string; managerEntry: string; tuiEntry: string; protocolVersion: 1; compatiblePredecessors: string[]; migrations: HookReference[] }
```

**Parameters:**
- `manifest: unknown` — Untrusted standalone release descriptor and requested OS/arch/channel identity.

**Returns:** `ReleaseManifest` — Schema-validated immutable candidate descriptor; module-local installer type, unrelated to the design-corpus namesake.

**Errors:**
- `manifest-invalid` when Unsupported schema/protocol, malformed identity/path/digest, wrong target or predecessor.

**Preconditions:**
- HTTPS artifact metadata; explicit configured repository/channel and target.
- Manifest/schema, target baseline, entrypoint containment, unique ordered hooks, digest format and predecessor compatibility must validate.

**Postconditions:**
- No candidate code is launched before archive and inventory integrity/target validation.
- Archive digest is held in an external sidecar descriptor, never embedded self-referentially inside the archive.

### 2.2 `Installation`

```typescript
interface Installation { schemaVersion: 1; installationId: string; dataHome: string; delivery: Delivery; activeReleaseId?: string; operationId?: string }
```

**Parameters:**
- `record: unknown` — Installation part of the controller snapshot; inspect never allocates an installation.

**Returns:** `Installation` — Validated installation identity and selected delivery.

**Errors:**
- `controller-corrupt` when Unreadable/inconsistent state after enrollment; no silent reinitialization.

**Preconditions:**
- Explicit absolute home; local supported filesystem; no symlinked control roots.
- A mutating caller must hold the OS operation lock.

**Postconditions:**
- Mode and data home cannot silently change during bundle upgrade.
- Default home remains user ~/.insrc; explicit isolated home resolves consistently for all launched peers.

### 2.3 `ManagerRequest`

```typescript
type IdeManagerAction = Exclude<ManagerAction, 'install'>;
interface ManagerRequest { protocolVersion: 1; operationId: string; action: ManagerAction; installationId: string; shutdownMode?: 'graceful' | 'immediate'; acceptedOfferId?: string; installOllama?: boolean }
```

**Parameters:**
- `request: unknown` — Bounded structured request for ordinary control/status; install is forbidden on this IDE-facing input.

**Returns:** `ManagerEvent` — Bounded progress or durable terminal result; all results bind operation and installation identity.

**Errors:**
- `install-terminal-required` when Install on manager protocol or non-TTY interactive entry.
- `busy` when Another process holds installation lock.
- `capability-unavailable` when Lifecycle/migration/dependency port not supplied by its owning story.

**Preconditions:**
- Separate executable entrypoints: interactive installer and ordinary manager.
- Ordinary manager input always rejects action=install, including caller/source flags claiming bootstrap origin.
- Only the shared terminal script invokes the interactive installer entrypoint; stdin/stdout/stderr must be a TTY.

**Postconditions:**
- IDE adapters cannot synthesize a source flag or submit an install action to bypass the terminal.
- Interactive installer internally creates the install action; no cloud/DB/IDE runtime is loaded.
- Unsupported sibling operations fail explicitly rather than using stub success.
- Only same-operation escalation is forwarded before busy admission; the forwarder never writes controller state.

### 2.4 `OperationRecord`

```typescript
interface OperationRecord { operationId: string; predecessorId?: string; candidateId?: string; phase: Phase; hookId?: string; hookStage?: 'check' | 'run' | 'test'; errorCode?: string; message?: string }
```

**Parameters:**
- `record: OperationRecord` — State transition bound to installation lock and immutable candidate.

**Returns:** `OperationRecord` — Operation inside one versioned atomic controller snapshot with installation data.

**Errors:**
- `phase-conflict` when Request tries to resume another candidate or stale operation.

**Preconditions:**
- OS lock held; exact previous revision/phase/identity checked.
- No destructive operation admitted without required peer capabilities and candidate compatibility.

**Postconditions:**
- Single file replacement publishes active release and operation together; no independent active-selector file.
- On ready/stopped completion release lock before TUI launch.
- After disruptive uncertainty mark blocked; no automatic rollback or unbounded retry.

### 2.5 `DependencyReport`

```typescript
interface DependencyReport { runtimeReady: boolean; ollama: 'ready' | 'installed-not-running' | 'missing' | 'unavailable'; ollamaInstallOffer?: { id: string; destination: string; version: string }; agents: { claude: boolean; codex: boolean; vibe: boolean }; recommendations: string[]; blockers: string[] }
```

**Parameters:**
- `report: DependencyReport` — s3 supplies actual probes and user-level installation; s1 only renders prompts/results.

**Returns:** `DependencyDecision` — Exact offer and explicit terminal choice returned to s3.

**Errors:**
- `capability-unavailable` when Required s3 dependency implementation missing.

**Preconditions:**
- No default-yes or IDE-filled consent.
- Do not invent a report when s3 is unavailable.

**Postconditions:**
- Coding CLI recommendations never install CLIs.
- Declining Ollama remains visible; it does not become synthetic ready.

### 2.6 `UpgradeHook`

```typescript
interface UpgradeHook { check(context: MigrationContext): Promise<HookDecision>; run(context: MigrationContext): Promise<void>; test(context: MigrationContext): Promise<HookValidation> }
```

**Parameters:**
- `hook: HookReference` — Manifest-owned local module id/version/path.

**Returns:** `HookValidation` — Contract definition only here; s5 owns loading/execution and blocked-state policy.

**Preconditions:**
- s1 validates reference shape, local containment, unique id/version and declared order.
- s1 does not import/run hooks or open application databases.

**Postconditions:**
- Candidate is not activated if required s5 migration service is absent, fails or returns unvalidated result.
- Empty hook list still requires owning service to confirm no required migration; manager never assumes arbitrary state compatibility.

### 2.7 `LocalEndpoint`

```typescript
interface LocalEndpoint { kind: 'unix' | 'named-pipe'; address: string; installationId: string }
interface InstallationLocation { home: string; installationId: string; daemonEndpoint: LocalEndpoint }
```

**Parameters:**
- `home: string` — User default or explicitly selected absolute home.
- `installationId: string` — Persisted installation identity; stable across release upgrades.

**Returns:** `InstallationLocation` — Pure common path/endpoint resolver; peer implementations use this exact result.

**Preconditions:**
- Reject unsupported/network controller filesystems, relative/traversal homes and overlong Unix socket paths rather than truncating.
- Windows pipe identity derives from user SID and installation identity; Unix default remains daemon.sock.

**Postconditions:**
- No application data is opened by the manager.
- s4/s6/s7 wire endpoint/auth transport implementations; s1 only defines/validates location and bridge envelopes.

### 2.8 `TerminalInstallLaunch`

```typescript
interface TerminalInstallLaunch { operationId: string; installationId: string; home: string; platform: 'posix' | 'powershell'; scriptPath: string; scriptVersion: string; scriptSha256: string; arguments: string[]; terminalName: 'Insrc Installation'; onInstallSuccess: 'launch-tui' }
```

**Parameters:**
- `launch: TerminalInstallLaunch` — Canonical script identity and argument vector supplied to later native IDE terminal adapters.

**Returns:** `InstallationObservation` — Durable operation phase plus exact IPC readiness, never scraped terminal output.

**Preconditions:**
- Manual and IDE script bytes/version/digest match release assets.
- Shared POSIX/PowerShell script bootstraps private Node, clears Node injection variables, and invokes interactive installer by absolute path.
- IDE terminal open/focus and quoting belong to s6/s7.

**Postconditions:**
- After valid ready result: persist installation completion, release operation lock, then run selected installed TUI with inherited terminal I/O and private runtime.
- TUI launch failure is a post-install error with exact retry command; no reinstall/rollback.
- Exiting TUI returns to shell and does not stop daemon; installation failure/cancel launches no TUI.

### 2.9 `escalateShutdown`

```typescript
escalateShutdown(request: ManagerRequest): Promise<ManagerEvent>;
```

**Parameters:**
- `input: validated shared-contract input` — Proposed additive HLD method input; validate unknown wire data before use.

**Returns:** `Promise<ManagerEvent>` — Identity-bound control outcome, never synthetic success.

**Errors:**
- `escalation-unavailable` when Missing/stale owner or incompatible peer respectively.

**Preconditions:**
- Proposed localized HLD amendment; no application DB access.

**Postconditions:**
- An immediate override during quiescing/draining is a message to the current operation, not a competing mutation. Invoke escalateShutdown with the existing installationId/operationId, action='stop', shutdownMode='immediate'. Before ordinary lock admission, the manager command forwards it to the current lock owner's user-protected local control endpoint. The owner remains responsive while awaiting drain/exit, validates recorded instance/operation and alone sends s4 IPC using its original completion endpoint/nonce and writes controller state. Cross-window requests use this path; duplicates coalesce; all independent mutations still return busy. Private endpoint discovery binds installation/operation/owner-session nonce, validates same-user authorization and phase/identity, and rejects stale endpoints. No lock release/steal to escalate. Missing/dead owner returns escalation-unavailable/uncertain; explicit recovery must acquire the lock and reconcile instance/exit evidence before acting, never automatically replace the daemon.

### 2.10 `controlBridge`

```typescript
controlBridge(command: { kind: 'send'; transportId: string; request: IpcBridgeRequest } | { kind: 'cancel'; transportId: string }): AsyncIterable<{ transportId: string; kind: 'written' | 'cancelled' | 'frame' | 'closed' | 'error'; written?: boolean; frame?: string; code?: string }>;
```

**Parameters:**
- `input: validated shared-contract input` — Proposed additive HLD method input; validate unknown wire data before use.

**Returns:** `AsyncIterable<correlated bridge events>` — Identity-bound control outcome, never synthetic success.

**Errors:**
- `bridge-protocol-mismatch` when Missing/stale owner or incompatible peer respectively.

**Preconditions:**
- Proposed localized HLD amendment; no application DB access.

**Postconditions:**
- The additive sc6 controlBridge envelope preserves existing inner frame types. Launch the helper explicitly in bridge-control protocol 2 and require version confirmation before sending; mismatch fails with no legacy fallback. Each send/cancel/event has a unique transportId bound to its embedded RPC request id and lane, never reused during helper lifetime. Validate before queue admission. A cancel processed before the first named-pipe write attempt removes the send, confirms cancelled/written=false and forbids later dispatch. At the first write attempt, mark written=true conservatively: possible dispatch, not application completion. A helper-stdin write is not pipe dispatch evidence. Post-write cancellation retires the local reply without rollback/replay promises. Helper death/lost outcome leaves unresolved sends unknown unless not-written was positively confirmed. Frame/error/close events carry transportId; report every pending id on lane failure where possible. Preserve 64-pending/16MiB aggregate bounds, fragmented UTF-8 and separate stream-lane cancellation. Input EOF closes the helper lane, never daemon.

### 2.11 `bridgeHandshake`

```typescript
bridgeHandshake(request: { kind: 'hello'; protocolVersion: 2; sessionNonce: string }): Promise<{ kind: 'ready'; protocolVersion: 2; sessionNonce: string }>;
```

**Parameters:**
- `request: { kind: 'hello'; protocolVersion: 2; sessionNonce: string }` — Exact shared-contract identity input; validate untrusted wire data before use.

**Returns:** `Promise<{ kind: 'ready'; protocolVersion: 2; sessionNonce: string }>` — Validated shared-contract evidence, not application success.

**Errors:**
- `bridge-handshake-timeout` when No matching ready within three seconds.
- `bridge-protocol-mismatch` when Malformed, mismatched or out-of-order startup record.

**Preconditions:**
- Pending localized HLD amendment; owner implementation and consumer integration remain separate.

**Postconditions:**
- The bridge-control protocol-2 startup wire exchange is exactly one UTF-8 NDJSON hello record {kind:'hello',protocolVersion:2,sessionNonce} from the client on helper stdin, then exactly one ready record {kind:'ready',protocolVersion:2,sessionNonce} on helper stdout. The client generates a fresh unpredictable sessionNonce per helper process; helper echoes it only after validating the version and binding its configured local installation endpoint. This is a separate startup envelope, not an IpcBridgeRequest and not a correlated controlBridge outcome; it has no transportId because no request exists yet. The helper must not forward any application frame before emitting ready, and the client must not send send/cancel records until matching ready is received. Set a 3-second handshake deadline from helper spawn; missing/malformed/duplicate/wrong-version/wrong-nonce ready, early outcome frames, or helper exit fail with bridge-protocol-mismatch/bridge-handshake-timeout before dispatch. On error the client closes stdin and that helper lane, reports no sends dispatched, and performs no automatic fallback/replay; it sends no daemon signal/stop. Unsupported hello yields only a bounded stderr diagnostic and helper exit without opening an application RPC lane. After ready, stdout contains only the specified correlated controlBridge events, stderr only diagnostics; later hello/ready records are protocol errors. Handshake bytes count toward the bounded parser/input limits; no credentials/capability tokens are echoed. Existing inner IpcBridgeRequest.protocolVersion=1 remains unchanged and is distinct from outer bridge-control version 2.

## 3. Data model changes

### 3.1 `Controller snapshot` — new

One small JSON file at <home>/install/controller.json owns installation plus current operation atomically; relative root notation is a proposed runtime layout. Write a same-directory unique temporary file with exclusive creation, flush contents, replace via platform atomic-replace adapter, then flush containing directory where supported. Never mutate controller.json in place. POSIX rename and Windows ReplaceFile/MoveFileEx semantics are isolated behind state module; qualify interrupted replacement on each filesystem. Serialize all writes under a persistent non-renamed <home>/install/operation.lock OS lock; no PID, heartbeat expiry or stale-lock unlinking. Inspection is read-only and returns missing versus corrupt distinctly. Existing application data is not copied or migrated by this record.

```
interface ControllerSnapshot { schemaVersion: 1; revision: number; installation: Installation; operation?: OperationRecord; lastResult?: OperationRecord }
```


### 3.2 `Target and runtime policy` — new

Release-owned Node 22.22.1 plus matching npm and current .npmrc headers are one policy. Pin exact official archive URL and independently recorded SHA-256 for each OS/arch; no latest or host Node fallback. Installed runtime path is <home>/runtimes/22.22.1/<target>. Bootstrap obtains official tar.gz on POSIX and zip on Windows using platform stock download/extract/hash facilities, verifies first, stages then publishes; if an extraction prerequisite is absent, fail with a user-level prerequisite message rather than sudo. Bundle contains the same official runtime archive so normal successor installs can reuse verified local bytes. Runtime extraction accepts only contained expected files; skip unneeded bin/npm aliases and invoke npm-cli.js through the private Node. Build/publish checks ensure .npmrc and runtime policy remain aligned. Shared source-development launcher is not silently rewritten as the installed launcher. Call sites here identify inspected publisher/launcher integration context, not existing consumers of this new model or instructions to edit those files.

**Call sites:**
- `scripts/insrc`

### 3.3 `Bundle descriptor and payload inventory` — new

Publish release.json sidecar with HLD ReleaseManifest, artifact URLs/sizes and digests for manager bootstrap assets and target lock binding; no hash refers to bytes that contain that hash. ZIP holds inventory.json of file paths/digests/sizes/modes, built out tree/assets, production dependency closure, single-file manager/installer bootstrap JS, native lock binding and the official private runtime archive. Content/root paths are bounded. Pure-JS yauzl reader is bundled into bootstrap JS; use lazyEntries, strictFileNames and validateEntrySizes plus our canonical-path, byte-count, entry-count and ratio limits. Reject absolute/UNC/drive/ADS/traversal/backslash ambiguities, duplicate or case-colliding paths, encrypted/unsupported entries, special files and symlink entries. Package builder dereferences only verified in-root workspace links; it never copies arbitrary host paths. Stage with exclusive creation and atomic same-filesystem publication. No end-user npm, compiler or daemon source build in bundle mode. Call sites here identify inspected publisher/launcher integration context, not existing consumers of this new model or instructions to edit those files.

**Call sites:**
- `copy-assets.mjs`

### 3.4 `Bootstrap/control assets` — new

Proposed source files: scripts/install.sh, scripts/install.ps1 and scripts/package-installer.mjs. A release-specific script embeds Node/bootstrap-JS/lock-binding digests; the tiny bootstrap JS is single-file bundled and uses builtin network/hash/fs plus its bundled ZIP reader. It downloads the separately digest-bound platform lock binding before acquiring the controller lock. This avoids requiring system unzip or host npm to read the full bundle. No payload/controller code runs before its digest matches. Bundle publisher emits identical installer bytes to manual assets and IDE resource staging; package root entrypoint managerEntry identifies this dependency-minimal artifact, not the whole application. Signing remains deferred; this provides digest/transport integrity only. Call sites here identify inspected publisher/launcher integration context, not existing consumers of this new model or instructions to edit those files.

**Call sites:**
- `scripts/insrc`
- `copy-assets.mjs`

### 3.5 `Required sibling capability boundary` — new

s1 controller prepares candidate and owns durable installation transitions. It requires lifecycle/readiness (s4), dependency report/decision handling (s3), and candidate migration outcome (s5) through explicit peers. Those contract shapes are specified in this LLD's §2 and the HLD's shared contracts; this does not identify an existing source file. Their implementations are neither imported from hypothetical modules nor replaced with no-ops. Before any disruption, verify peer availability and exact candidate/predecessor compatibility. In the s1 build, deterministic peer fixtures exercise bundle orchestration; absent real peers produce capability-unavailable. Full live install/upgrade AC evidence remains contingent on sibling integration and s8; do not certify a real upgrade from fixture-only results. Dev preparation is a future s2 adapter, and native IDE terminal launch is s6/s7.


### 3.6 `OS operation-lock handle` — new

A minimal bundled Node-API v8 addon owns only an OS file-lock handle: nonblocking flock(LOCK_EX|LOCK_NB) on macOS/Linux; LockFileEx(LOCKFILE_EXCLUSIVE_LOCK|LOCKFILE_FAIL_IMMEDIATELY) on a fixed byte range on Windows. Keep the descriptor/handle alive, mark non-inheritable, release on close and process exit. Never rename/delete the lock file, and do not interpret file contents/PIDs as ownership. Deny lock-root symlinks and restrict user access; atomic-replace helper and user-SID lookup can share this small platform binding. It opens no DB, sends no process signal and is built/qualified in release environments, never compiled on client machines. Ongoing controller cancellation/exit must close handles; killed/crashed fixture cases are simulated by fixture self-exit commands, not daemon kill controls.


### 3.7 `Operation-bound escalation routing` — new

An immediate override during quiescing/draining is a message to the current operation, not a competing mutation. Invoke escalateShutdown with the existing installationId/operationId, action='stop', shutdownMode='immediate'. Before ordinary lock admission, the manager command forwards it to the current lock owner's user-protected local control endpoint. The owner remains responsive while awaiting drain/exit, validates recorded instance/operation and alone sends s4 IPC using its original completion endpoint/nonce and writes controller state. Cross-window requests use this path; duplicates coalesce; all independent mutations still return busy. Private endpoint discovery binds installation/operation/owner-session nonce, validates same-user authorization and phase/identity, and rejects stale endpoints. No lock release/steal to escalate. Missing/dead owner returns escalation-unavailable/uncertain; explicit recovery must acquire the lock and reconcile instance/exit evidence before acting, never automatically replace the daemon.


### 3.8 `Controller and hook-journal writer protocol` — new

Only the lock-owning manager writes controller.json. Only the candidate daemon writes its operation/candidate-bound hook journal atomically while holding the exclusive data lease; it never writes controller.json or inherits the manager lock. Journal run-started commits before mutation. Stage events are advisory; OperationRecord is a possibly lagging projection, never migration validation evidence. Validate journal identity/version/order/digests before accepting results. On manager exit, a live candidate may finish its admitted hooks/journal but cannot activate or write controller state. A new lock owner first reconciles the exact candidate session, lease and protected observed-exit evidence; held/unknown ownership means busy/uncertain, never a second runner. Lease availability alone is not migration success. Only after prior candidate actual exit may explicit recovery validate the journal and resume the same operation or retry unvalidated hooks under hook policy. Reject stale session/revision writes; no PID/age inference or predecessor restart. Initial migration in migrating and candidate normal boot in activating require matching live-owner admission; independent ordinary boot remains denied. s4 owns lease/exit evidence; s5 owns hook execution/journal. Consume s4's proposed mandatory migration receipt contract: manager records admission/session/nonce/path before spawn and validates receipt before recovery; receipt writing is wrapper-owned, not a controller.json mutation. Full receipt production/format is owned by s4.


### 3.9 `Correlated bridge-control envelope` — new

The additive sc6 controlBridge envelope preserves existing inner frame types. Launch the helper explicitly in bridge-control protocol 2 and require version confirmation before sending; mismatch fails with no legacy fallback. Each send/cancel/event has a unique transportId bound to its embedded RPC request id and lane, never reused during helper lifetime. Validate before queue admission. A cancel processed before the first named-pipe write attempt removes the send, confirms cancelled/written=false and forbids later dispatch. At the first write attempt, mark written=true conservatively: possible dispatch, not application completion. A helper-stdin write is not pipe dispatch evidence. Post-write cancellation retires the local reply without rollback/replay promises. Helper death/lost outcome leaves unresolved sends unknown unless not-written was positively confirmed. Frame/error/close events carry transportId; report every pending id on lane failure where possible. Preserve 64-pending/16MiB aggregate bounds, fragmented UTF-8 and separate stream-lane cancellation. Input EOF closes the helper lane, never daemon. s1 defines schemas; s7 implements Windows transport. The bridge-control protocol-2 startup wire exchange is exactly one UTF-8 NDJSON hello record {kind:'hello',protocolVersion:2,sessionNonce} from the client on helper stdin, then exactly one ready record {kind:'ready',protocolVersion:2,sessionNonce} on helper stdout. The client generates a fresh unpredictable sessionNonce per helper process; helper echoes it only after validating the version and binding its configured local installation endpoint. This is a separate startup envelope, not an IpcBridgeRequest and not a correlated controlBridge outcome; it has no transportId because no request exists yet. The helper must not forward any application frame before emitting ready, and the client must not send send/cancel records until matching ready is received. Set a 3-second handshake deadline from helper spawn; missing/malformed/duplicate/wrong-version/wrong-nonce ready, early outcome frames, or helper exit fail with bridge-protocol-mismatch/bridge-handshake-timeout before dispatch. On error the client closes stdin and that helper lane, reports no sends dispatched, and performs no automatic fallback/replay; it sends no daemon signal/stop. Unsupported hello yields only a bounded stderr diagnostic and helper exit without opening an application RPC lane. After ready, stdout contains only the specified correlated controlBridge events, stderr only diagnostics; later hello/ready records are protocol errors. Handshake bytes count toward the bounded parser/input limits; no credentials/capability tokens are echoed. Existing inner IpcBridgeRequest.protocolVersion=1 remains unchanged and is distinct from outer bridge-control version 2.


## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/sequence-diagram.html)
- [Component dependencies](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/component-dependency.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Define strict manifest/location/runtime/installation schemas, immutable bundle preparation and identity/digest checks; add only internal sidecar/inventory metadata with no public contract rename. |
| `sc2` | implements | Ordinary manager entrypoint rejects install unconditionally; terminal bootstrap entrypoint alone constructs it after TTY validation. One OS-locked atomic snapshot enforces operation transitions; peers are required and never silently successful. |
| `sc3` | implements | Own report/decision types and terminal rendering; consume s3 implementation later. No Ollama installation or agent detection implementation in s1. |
| `sc5` | implements | Own ordered reference/check-run-test types and shape validation only; s5 owns actual hook execution and migration failure/retry policy. Manager never opens DB. |
| `sc6` | implements | Own explicit home/endpoint resolver and bridge envelope schemas. Existing PATHS/IPC adaptations and authenticated daemon transport are integrated by owning lifecycle/client stories. |
| `sc7` | implements | Publish identical terminal installer scripts and launch descriptor; success commits ready state/releases lock before foreground TUI. Native IDE terminal open/focus/escaping is explicitly deferred to s6/s7. |

## 6. Error paths

**Error cases**

- **Wrong target, schema or predecessor** (recoverable)
  - Detection: Strict release/target validators compare requested OS/arch/baseline/protocol and installed predecessor before candidate execution.
  - Response: manifest-invalid; leave incumbent/controller selection unchanged.
  - User impact: Actionable unsupported target/release message; no source-mode fallback.
- **Download or artifact integrity failure** (recoverable)
  - Detection: HTTP status/deadline/size counters, streaming SHA-256 and pinned control/runtime asset checks fail.
  - Response: Remove only operation-owned staging bytes; retain incumbent and retryable diagnostics.
  - User impact: No partial install is reported ready.
- **Unsafe or excessive ZIP contents** (recoverable)
  - Detection: Prevalidated central directory plus canonical destination checks, exclusive creation, actual byte counters, inventory hashes and case-collision tracking detect invalid entries.
  - Response: archive-unsafe; do not execute extracted code or publish release directory.
  - User impact: No filesystem writes escape the staging root.
- **Runtime version/ABI mismatch** (recoverable)
  - Detection: Absolute private Node reports different version/arch than policy or packaged native smoke probes fail.
  - Response: runtime-invalid before disruption; never fall back to PATH Node/npm.
  - User impact: Existing unrelated Node installations remain untouched.
- **IDE attempts direct install** (recoverable)
  - Detection: Ordinary manager validates the request action before dispatch; install always fails there even with a forged bootstrap/source field.
  - Response: install-terminal-required; interactive installer additionally requires TTY on all standard streams.
  - User impact: User must use the shared terminal script; no hidden install or remote prompt driver.
- **Controller missing after enrollment or unreadable** (recoverable)
  - Detection: Schema validation/revision/installation linkage fails when selected state already exists.
  - Response: controller-corrupt and fail closed; do not recreate or select arbitrary payloads.
  - User impact: User gets explicit recovery diagnostics; data remains untouched.
- **Concurrent mutation** (recoverable)
  - Detection: OS nonblocking lock acquisition returns busy; lock contents/age are never considered.
  - Response: Independent mutation returns busy; same-operation immediate escalation forwards to the live lock owner under proposed sc2.
  - User impact: Duplicate windows do not race upgrades.
- **Missing lifecycle/dependency/migration capability** (recoverable)
  - Detection: Required handler admission fails before destructive phase; no fixture or implicit no-op is available in production.
  - Response: capability-unavailable. Internal peer handlers use s1-owned ManagerRequest/ManagerEvent/report contracts; s1 never imports or redesigns s4's shutdown implementation or s5's runner.
  - User impact: s1 alone cannot falsely report live end-to-end installation; later integration is explicit.
- **Crash or cancellation before disruption** (recoverable)
  - Detection: Abort signal/stream close or resumed preparing record with no quiescing admission.
  - Response: Retain error/result and clear only owned incomplete candidate staging under lock.
  - User impact: Incumbent remains usable; no TUI launches.
- **Interruption after quiescing or during migration/activation** (recoverable)
  - Detection: Durable phase/hook-stage record lacks successful completion/readiness; owning peer reports failure/uncertainty.
  - Response: blocked; retain exact candidate/predecessor and peer diagnostics. Only explicit retry can reconcile; no automatic predecessor start or rollback.
  - User impact: Ordinary startup stays blocked through sibling boot guard.
- **Successful install but TUI launch fails** (recoverable)
  - Detection: Ready result is already durable and lock released; installed private-runtime spawn or executable verification fails.
  - Response: post-install-tui-error with exact installed retry command. Do not change ready record or rerun installer.
  - User impact: Installation remains complete; terminal shows how to open TUI.
- **Atomic state replacement or disk exhaustion** (recoverable)
  - Detection: Staging/fsync/atomic-replace adapter reports OS error; reread validates whether old or new snapshot is authoritative.
  - Response: Before disruption preserve usable incumbent; after disruption retain/report blocked/uncertain state and avoid further writes until reconciled.
  - User impact: Never claim success from an uncommitted state transition.
- **Manager exits while candidate hooks run** (recoverable)
  - Detection: Owner control fails; explicit recovery validates controller revision, journal identity, candidate lease/session and observed exit.
  - Response: Follow sole-writer/journal reconciliation; never launch duplicate hooks or trust a lagging controller projection.
  - User impact: Safe explicit recovery without automatic activation/rollback.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Home or script path contains spaces/Unicode/shell punctuation | Argument-vector transport and canonical path handling preserve identity; no shell expansion or global PATH mutation. |
| No host Node or a wrong host Node is first on PATH | Bootstrap and all installer/daemon/TUI launches use the pinned private executable; matching npm used only on release/build machines or future dev adapter. |
| Retry exact prepared candidate after a completed download | Revalidate immutable digests and resume only the recorded operation/phase; never select a different candidate silently. |
| Fresh installation versus supported bundle upgrade | No predecessor is valid on first install; an upgrade retains bundle mode and requires predecessor compatibility and exact peer readiness. |
| Empty hooks list or s3 reports no agent CLI | No speculative migration and no automatic agent install; owning peer confirms no-migration result and terminal shows advisory recommendations. |
| User exits the successfully launched TUI | Return to the terminal shell with installation lock already released and daemon still running. |
| Inspect/check-upgrade while another operation is busy | Read-only schema-validated snapshot/result; no lock stealing, startup or source sync. |

**Invariants to preserve**

- Daemon alone owns LMDB/Lance access; installer/control never opens them. [[c1]]
- No host v2 daemon mutation, no daemon PID/kill/signal fallback, and no elevated commands. [[c2]]
- DEF E20261123c3d71313:S001:FR001 and s1 AC1-AC4 apply unchanged; fixture tests are not claimed as live qualification. [[c3]]
- Shared manual/IDE scripts own install prompts; ready → lock release → installed same-terminal TUI, with no direct IDE install action. [[c2]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict, *.test.ts under the canonical npm test coordinator; native/terminal evidence is recorded separately per OS/architecture, never inferred from fixtures.`

**Test levels**

- **contract** — Validate untrusted inputs and enforce shared caller/identity boundaries rather than mirroring implementation.
  - Subjects: `Strict manifest/runtime/entrypoint/hook validation; unrelated design-corpus ReleaseManifest is not imported.`, `Manager JSON install is rejected even with a forged source/bootstrap marker; non-TTY interactive entry is rejected.`, `Explicit home/endpoint and terminal launch schema preserve operation/release identity.`
  - Fixtures: `Malformed/wrong-target descriptors; corrupt enrolled snapshots; unsafe entrypoints; duplicate hooks; hostile shell/path values.`
- **integration** — Prove real filesystem preparation/state transitions and cross-process OS-lock exclusion with deterministic admitted peer processes.
  - Subjects: `Immutable safe ZIP preparation and inventory verification, including ZIP traversal/ADS/case collision/symlink/oversize/truncation attacks.`, `Native lock exclusion/release and atomic-replace crash points with fixture processes that self-exit on control input.`, `Prepare/peer-quiesce/peer-migrate/peer-ready transitions; missing capabilities, uncertainty and first-data-write failures remain blocked.`, `Complete state and release lock before TUI fixture enters foreground; TUI fixture exit/failure leaves ready installation and peer daemon alive.`, `Cross-window immediate forwarding while lock stays held: duplicates, stale endpoint, owner death and same completion nonce.`, `Manager self-exit at journal crash points; live candidate completion; held/unknown lease; stale session/revision; no duplicate hook runs.`, `Correlated protocol-2 send/cancel/write-boundary contract fixtures; actual Windows binding belongs to s7.`, `Protocol-2 hello/ready with exact nonce, three-second deadline, no application send before ready, old-helper/malformed/duplicate/early frame failures.`
  - Fixtures: `Small local HTTPS artifact server with controlled descriptors/runtime stubs and corrupt ZIPs; no cloud or LLM calls.`, `Disposable isolated home; peer capability/daemon/TUI fixtures clearly labelled non-production; phase fault injection.`, `Private-runtime identity spy; wrong-host-node executable trap; no default host daemon socket is ever used.`
- **smoke** — Exercise real platform bootstrap and built dependency-minimal control assets without host Node/npm/compiler in the consumer environment.
  - Subjects: `Exact Node version/architecture and native lock addon under each target's shipped runtime.`, `Shared POSIX/PowerShell scripts preserve direct TTY I/O, report failure/cancel and successful same-terminal TUI handoff.`, `Bundled manager has no application DB/index/model imports; bundle consumer performs no npm/source build.`
  - Fixtures: `Clean OrbStack Linux and UTM macOS guests; Windows native terminal/runner evidence remains required before Windows acceptance.`, `Set missing/wrong host Node, restricted PATH, spaces/Unicode home and no-elevation sentinel.`
- **live** — Final native AC acceptance after real sibling lifecycle/dependency/migration implementations are integrated; not claimed by the s1 fixture suite.
  - Subjects: `Clean install and successor upgrade with actual bundle/native dependencies and IPC readiness on every enabled target.`, `Both IDE scripts have exact byte parity with manual release script; terminal frontend integration belongs to s6/s7.`, `Migration refusal/failure blocks actual startup and upgrade; real TUI uses selected daemon and exits without stopping it.`
  - Fixtures: `s3/s4/s5 integration and s8 platform matrix; exact archive/runtime/source identity and OS/arch/translation evidence.`, `Keep host Mac v2 daemon untouched; record unavailable platform evidence as pending, not passed.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract-target-and-runtime-policy; integration-bootstrap-with-host-node-trap; terminal-entry-caller-restriction; foreground-tui-after-ready-lock-release`, `Required later live: clean consumer install per target with actual private runtime and IPC readiness.` |
| `ac2` | `integration-successor-mode-preservation; exact-ready-candidate-validation; missing-peer-admission; peer-migration-failure-no-activation; interrupted-cutover-blocked`, `Required later live: real predecessor/successor upgrade with s4/s5 and retained representative state.`, `cross-window-immediate-with-lock-held`, `manager-crash-journal-reconcile-no-duplicate-hooks` |
| `ac3` | `integration-download-status-timeout-size-and-digest; unsafe-zip-corpus; wrong-target-runtime; corrupt-controller-fail-closed; pre-cutover-incumbent-remains-usable`, `stale-owner-session-and-lagging-projection-rejected`, `bridge-handshake-before-any-send` |
| `ac4` | `package-bundle-inventory-and-independent-sidecar-digest; exact-source-target-runtime-identity; native-lock-runtime-smoke; manual-IDE-script-byte-parity; production-dependency-closure-with-workspace-links`, `Required per-target native qualification before publication; translated evidence is identified and cannot substitute unsupported native checks.` |

## 8. Alternatives considered

### 8.1 a1: One versioned controller snapshot and immutable candidates — **CHOSEN**

Atomic installation/operation snapshot plus immutable release folders and a small typed set of sibling-service ports.

Keep the HLD Installation and OperationRecord together in one schema-validated controller snapshot so selected release and operation phase change atomically. Manifests, target policy and immutable payloads are separate read-only inputs; an OS-backed lock serializes writes.

A bundle preparer and terminal-only interactive entrypoint return typed results. Lifecycle, dependencies and migration are required capability ports implemented by their owning sibling stories, not interchangeable plugin registries. Missing capability yields explicit unavailable/blocked results, not a successful partial install.

Both storage alternatives use operation-owner escalation and correlated bridge control only through the proposed sc2/sc6 amendments; no permanent supervisor or second controller writer is added.

### 8.2 a2: Append-only event journal with projected installation records

Every phase transition is a durable event, with installation and operation views projected from history.

Keep the same HLD public types but persist an append-only sequence of admission, preparation, cutover and completion events. Inspection replays events or reads a versioned projection to reconstruct Installation and OperationRecord.

The terminal entrypoint and bundle preparer use the same sibling capability ports. Journal replay, projection versioning and truncation policy become additional internal contracts even though no user-facing history feature was requested.

Both storage alternatives use operation-owner escalation and correlated bridge control only through the proposed sc2/sc6 amendments; no permanent supervisor or second controller writer is added.

**Rejected because:** Technically viable, but event replay/projection lifecycle adds unnecessary internal contracts.

## 9. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `scripts/insrc` — "Current launcher is source/development boundary, not reusable installed private-runtime bootstrap unchanged."
- **[[c5]]** `analyze-bundle` `copy-assets.mjs`
- **[[c6]]** `analyze-bundle` `src/design/corpus/contracts.ts` — "Existing ReleaseManifest name is a separate design-corpus schema; not installer reuse."
- **[[c7]]** `analyze-bundle` `scripts/__tests__/client-assets-retirement.test.ts`
- **[[c8]]** `analyze-bundle` `src/shared/__tests__/ipc-client.test.ts`
- **[[c9]]** `code` `.npmrc`
- **[[c10]]** `doc` `https://github.com/thejoshwolfe/yauzl/blob/master/README.md`
- **[[c11]]** `doc` `https://nodejs.org/docs/latest-v22.x/api/n-api.html`
- **[[c12]]** `doc` `https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex`
- **[[c13]]** `step-output` `s4` — "New proposed record/contract detail scoped to s1; no sibling execution implementations."
- **[[c14]]** `step-output` `s5`
- **[[c15]]** `step-output` `s6`
- **[[c16]]** `stakeholder` `User LLD advisory review: clarify contract-shape reference and publisher/launcher call-site context; preserve forged source/bootstrap marker test intent verbatim in plan. FR-to-AC traceability needs no change.`
