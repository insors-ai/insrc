<!-- insrc:artifact LLD-c3d71313f34bce71-s4 -->

# LLD: STORY-c3d71313f34bce71-s4 — Control daemon start and shutdown through IPC

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795612799378-x1xqpi`
**HLD effective hash:** `ca69fcdcd2b0...`
**Tracker:** [insors-ai/insrc#246](https://github.com/insors-ai/insrc/issues/246)

S4 connects the existing manager to real daemon start, graceful shutdown and explicit immediate shutdown through IPC. The selected daemon reports exact readiness, keeps its control lane available during draining, and a detached wrapper proves actual child exit before restart. Live launch admission and an exclusive pre-store data lease prevent competing store owners; runtime-store and manager capability prerequisites remain with S1/S2, and hook decisions remain S5.

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

**Rollout phase:** C — dependencies and lifecycle
**Owns:** `sc4` (Daemon shutdown and readiness)
**Consumes:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc5` (Ordered upgrade hook delegation), `sc6` (Local transport and explicit installation home)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. Resolve manifest runtime identity through the private live-downloaded runtime store; remove publisher duplication of tools/node and runtime archives, update probes/launchers/inventory validation and preserve digest/target checks. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged. Build with the identity-bound separately installed Node/npm; omit runtime archives/distributions from prepared dev payloads and share s1 runtime resolution.
- `s3`: Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged. Download the official pinned Ollama asset live only after consent; do not package Ollama or models. Preserve independent Node foundation ownership and disclose downloaded versus installed size.
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged. Verify fresh live dependency acquisition and verified runtime reuse in both modes, application/IDE archives excluding Node/Ollama, decline/offline/digest failure behavior and resolved-runtime launch on each enabled target.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DaemonIdentity`

```typescript
interface DaemonIdentity { instanceId: string; installationId: string; releaseId: string; protocolVersion: 1; state: 'ready' | 'draining' | 'migration-blocked' }
```

**Parameters:**
- `input: unknown` — Exact readiness and lifecycle identity.; untrusted wire input is schema-validated before use.

**Returns:** `DaemonIdentity` — Exact readiness and lifecycle identity.

**Preconditions:**
- Read shared boot guard before opening application stores.
- Start uses the selected private runtime and validated payload.
- Resolve the canonical selected installation/installed receipt through sc1/sc6. Runtime selection is the separately acquired verified runtime store specified by HLD revision 7; no tools/node, host PATH, npm, checkout sync or build fallback. The S1/S2 runtime resolver correction is a production prerequisite.

**Postconditions:**
- Already-ready matching instance is reused; conflicting identity or blocked migration is not success.
- No sync/npm/build on start.
- Proposed private daemon.lifecycleStatus returns this exact identity on the same protected endpoint and main-thread control lane; preserve existing daemon.status response and consumers. Unknown, unreachable, blocked or mismatched identity is not absence.

### 2.2 `ShutdownRequest`

```typescript
interface ShutdownRequest { operationId: string; expectedInstanceId: string; mode: 'graceful' | 'immediate'; completionEndpoint: string; completionNonce: string }
```

**Parameters:**
- `input: unknown` — Authenticated daemon.shutdown request.; untrusted wire input is schema-validated before use.

**Returns:** `ShutdownRequest` — Authenticated daemon.shutdown request.

**Errors:**
- `shutdown-instance-mismatch` when Expected instance differs.
- `shutdown-control-unavailable` when Control request/acknowledgement cannot complete.

**Preconditions:**
- Validate operation/instance, mode, endpoint containment and nonce; default graceful at caller boundary.
- Control handler executes before general work queue and never awaits drain inside the IPC reply handler.
- Immediate supersession of a live graceful operation is forwarded by the current manager owner through approved sc2; competing-manager lock admission cannot reject this forwarded request.
- Dispatch lifecycle status/shutdown before ordinary worker routing, maintenance admission and application queues. Same-user capability checks bind installation, current instance, operation and completion destination; validate protected path/pipe containment before connecting.

**Postconditions:**
- Flush accepted reply before selected exit action.
- Repeated same request is idempotent; explicit immediate can supersede draining.
- No timeout-triggered escalation, PID inspection, signal or kill fallback.
- The server exposes completion of this exact JSON-RPC reply's socket.write callback. Only successful write completion authorizes the selected exit path; aggregate flushPendingWrites, a timer, or scheduling a microtask is insufficient. Write failure/timeout remains uncertain. This is transport flush evidence, not proof of client receipt or process exit.

### 2.3 `ShutdownAccepted`

```typescript
interface ShutdownAccepted { operationId: string; instanceId: string; accepted: true; mode: 'graceful' | 'immediate' }
```

**Parameters:**
- `input: unknown` — Acknowledgement only.; untrusted wire input is schema-validated before use.

**Returns:** `ShutdownAccepted` — Acknowledgement only.

**Preconditions:**
- Corresponding validated request has been admitted.

**Postconditions:**
- Never interpreted as resource or process exit evidence.

### 2.4 `ShutdownCompletion`

```typescript
interface ShutdownCompletion { operationId: string; instanceId: string; completionNonce: string; resourceOwnershipReleased: true }
```

**Parameters:**
- `input: unknown` — Wrapper-observed child exit evidence.; untrusted wire input is schema-validated before use.

**Returns:** `ShutdownCompletion` — Wrapper-observed child exit evidence.

**Preconditions:**
- Wrapper owns the child exit event and request-bound completion channel.
- Any durable receipt is user-protected, identity/nonce-bound and emitted only after child exit.

**Postconditions:**
- Restart requires matching completion and endpoint/ownership reconciliation.
- Missing evidence stays uncertain/blocked; no competing replacement.

### 2.5 `readMigrationExitReceipt`

```typescript
interface MigrationExitReceipt { schemaVersion: 1; purpose: 'migration'; installationId: string; operationId: string; candidateReleaseId: string; candidateInventorySha256: string; sessionId: string; childInstanceId: string; completionNonce: string; exitCode: number | null; signal: string | null }
readMigrationExitReceipt(expected: MigrationExitReceiptIdentity): Promise<MigrationExitReceipt>;
interface MigrationExitReceiptIdentity { installationId: string; operationId: string; candidateReleaseId: string; candidateInventorySha256: string; sessionId: string; childInstanceId: string; completionNonce: string }
```

**Parameters:**
- `expected: MigrationExitReceiptIdentity` — Exact shared-contract identity input; validate untrusted wire data before use.

**Returns:** `Promise<MigrationExitReceipt>` — Validated shared-contract evidence, not application success.

**Errors:**
- `migration-exit-evidence-missing` when Admitted session has no valid durable receipt.
- `migration-exit-evidence-invalid` when Receipt is malformed or identity/nonce/digest mismatches.

**Preconditions:**
- Approved HLD amendment; owner implementation and consumer integration remain separate.

**Postconditions:**
- Every migration-only child is launched through the s4 lifetime wrapper. Before spawn, the manager atomically records an immutable admission containing installationId, operationId, candidateReleaseId, candidateInventorySha256, sessionId, childInstanceId, completionNonce and the exact protected receipt path <home>/install/receipts/<operationId>/<sessionId>.json. IDs are validated opaque path-safe tokens, never arbitrary paths. Wrapper/child acknowledge that admission; a delayed unstarted child must still validate the live owner admission before acquiring the data lease/opening stores. The wrapper is detached from manager/terminal lifetime and never opens application stores. After observing that exact child actually exit, it MUST atomically persist MigrationExitReceipt to the predeclared path, flush file and containing directory where supported, then notify any live observer and exit. This requirement applies to natural migration completion, hook failure and child self-exit; it does not depend on a shutdown request or surviving manager IPC. Wrapper is the sole receipt writer; candidate alone writes hook journal; manager alone writes controller.json. Receipt is immutable per session, user-protected, identity/nonce/digest validated and retained until operation completion/recovery no longer needs it. Native lock/receipt filesystem durability support is qualified before target enablement. A replacement manager under the operation lock reconciles the admitted session, mandatory receipt, lease and exact journal; only matching actual-exit evidence plus released ownership permits another runner/start. ExitCode=0 is never migration success by itself: successful applicable hook tests and exact journal validation are also required. A failure receipt may authorize same-candidate explicit hook recovery, never automatic activation. Missing/corrupt/forged receipt or wrapper death remains blocked/uncertain, never inferred from PID, endpoint disappearance, free lease or completed journal. The wrapper never kills/restarts the child. This mandatory migration receipt does not make general shutdown's optional receipt mandatory.

### 2.6 `LifecyclePort`

```typescript
interface LifecyclePort { observe(location: InstallationLocation): Promise<DaemonObservation>; shutdown(location: InstallationLocation, request: ShutdownRequest): Promise<ShutdownAccepted>; waitShutdownCompletion(location: InstallationLocation, request: ShutdownRequest): Promise<ShutdownCompletion>; reconcileShutdown(location: InstallationLocation, request: ShutdownRequest): Promise<ShutdownCompletion | undefined>; launchMigration(candidate: PreparedCandidate, admission: LaunchAdmission, assertLiveOwner: () => void): Promise<void>; readMigrationExitReceipt(expected: MigrationExitReceiptIdentity): Promise<MigrationExitReceipt>; migrationOwnership(expected: MigrationExitReceiptIdentity): Promise<'released' | 'held' | 'unknown'>; activate(candidate: PreparedCandidate, admission: LaunchAdmission, assertLiveOwner: () => void): Promise<ReadyEvidence>; reconcileActivation(candidate: PreparedCandidate, admission: LaunchAdmission): Promise<ReadyEvidence | undefined>; }
```

**Parameters:**
- `location/candidate: InstallationLocation | PreparedCandidate` — Canonical selected installation or immutable candidate; never discover a different release.
- `request/admission/expected: ShutdownRequest | LaunchAdmission | MigrationExitReceiptIdentity` _(optional)_ — Method-specific exact identity and protected evidence binding from existing sc2/sc4 protocol.
- `assertLiveOwner: () => void` _(optional)_ — Existing in-process manager assertion; invoked before spawn and live-admission grants. Never serialized as executable child input.

**Returns:** `Existing method-specific Promise types in src/installer/peer-contracts.ts` — observe distinguishes known never-started or proven exit from unknown; shutdown is ack only; wait/reconcile validate exact exit evidence; launchMigration is admission only; activate/reconcile require exact ready identity plus admitted session/nonce/inventory.

**Errors:**
- `lifecycle-prerequisite-unavailable` when No verified runtime-store resolution, qualified primitive, live admission or required migration capability; fail closed without placeholders.
- `lifecycle-evidence-uncertain` when Wrapper/session/receipt/lease proof is absent, mismatched or not durable; no competing child or success result.

**Preconditions:**
- Reuse InstallerManager operation lock/controller/admission/forwardImmediate; no second manager, migration engine or controller writer.
- S4 production peer implements all nine methods. S5 owns migration-only execution, journal semantics and installed verification; no fake migration peer or no-op runner.
- Start/activation validates selected runtime/receipt/entry/digest before wrapper spawn and verifies the exact readiness evidence before returning.

**Postconditions:**
- productionPeers adds only the real lifecycle port alongside existing delivery/dependency peers; migrations remains unavailable until S5.
- observe absence requires recorded never-started evidence or exact observed-exit evidence plus ownership reconciliation. Connection refusal/socket disappearance/free lease alone is uncertain.
- launchMigration consumes sc5 runner availability and sc2 admission; the wrapper persists mandatory migration exit receipt even after manager loss. ExitCode=0 never substitutes for hook tests/journal.
- All shutdown/restart behavior concerns the insrc daemon; never stop or restart independently installed Ollama.

## 3. Data model changes

### 3.1 `Daemon control state` — new

Proposed private boundary src/daemon/installation-lifecycle.ts integrates with current src/daemon/index.ts and src/daemon/server.ts. One state machine admits status/shutdown while rejecting ordinary new work during draining. Refactor only the control closure ordering: do not close the control listener before an immediate override can arrive. Existing queue/resource disposal remains application-owned; preserve storage-health checks and native ownership guards. APIs on src/daemon/lifecycle.ts remain model bootstrap, not a restored process engine. Proposed src/daemon/index.ts becomes a thin pre-store entry retaining out/daemon/index.js, with application startup moved to proposed src/daemon/application.ts by dynamic import. A dependency-minimal guard validates exact INSRC_HOME/installation/runtime/admission and takes the exclusive daemon data lease before importing src/shared/paths.ts, DB clients/native stores, or declaring live store ownership. INSRC_HOME is captured at import today. Keep main-thread control responsive through drain and storage/worker cleanup; close it only at the final exit boundary. Preserve existing native storage-health/ownership handling.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/server.ts`
- `src/daemon/queue.ts`
- `src/shared/paths.ts`
- `src/daemon/threads/method-class.ts`

### 3.2 `Immediate self-exit path` — new

Immediate is explicit authenticated IPC only. After successful per-reply transport flush, add a minimal calling-process _Exit(0) Node-API primitive to src/installer/native/control.c and its typed src/installer/native.ts binding; no process handle, PID, signal, external command, watchdog or automatic deadline escalation. _Exit skips CRT atexit/stream flushing; OS/DLL behavior and actual native-store recovery still require target qualification. No universal bounded-exit or cleanup-bypass guarantee is inferred from the symbol alone. Missing/unqualified primitive gives unsupported before accepting immediate; a non-exiting primitive remains uncertain, never stopped. Primary reference: https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/exit-exit-exit?view=msvc-170

**Call sites:**
- `src/installer/native.ts`
- `src/installer/native/control.c`

### 3.3 `Lifetime wrapper and ownership` — new

Wrapper starts detached from the install terminal with log-bound standard streams and a private child IPC channel; child readiness binds installation/release/instance. It observes child exit, produces ShutdownCompletion on the manager's protected local endpoint and optionally an atomic receipt keyed by operation/nonce, then exits. It has no watchdog, respawn or kill policy. Normal daemon and migration-only process share an exclusive daemon-owned data-lease primitive; manager never opens DB. All managed boot paths apply foundation startup guard and refuse conflicting ownership before store open. Consume the sole-controller-writer/admitted-candidate crash protocol from approved sc2. Only the lock-owning manager writes controller.json. Only the candidate daemon writes its operation/candidate-bound hook journal atomically while holding the exclusive data lease; it never writes controller.json or inherits the manager lock. Journal run-started commits before mutation. Stage events are advisory; OperationRecord is a possibly lagging projection, never migration validation evidence. Validate journal identity/version/order/digests before accepting results. On manager exit, a live candidate may finish its admitted hooks/journal but cannot activate or write controller state. A new lock owner first reconciles the exact candidate session, lease and protected observed-exit evidence; held/unknown ownership means busy/uncertain, never a second runner. Lease availability alone is not migration success. Only after prior candidate actual exit may explicit recovery validate the journal and resume the same operation or retry unvalidated hooks under hook policy. Reject stale session/revision writes; no PID/age inference or predecessor restart. Initial migration in migrating and candidate normal boot in activating require matching live-owner admission; independent ordinary boot remains denied. General shutdown receipts remain optional; migration-only children additionally require the mandatory receipt protocol below. Cardinality/ownership: installation has at most one store-owning daemon; each admitted session has one detached wrapper observing exactly one child; controller has many historical sessions but only the lock owner writes it; migration session has one child-written journal and one wrapper-written immutable receipt. Wrapper does not inherit/hold manager or data locks and never opens DB. Normal activation also binds wrapper/child to admitted session; capture exact actual-exit evidence for live completion, with optional protected shutdown receipt for later reconciliation. If optional evidence was not retained, later recovery stays uncertain. Release a data lease only after all stores and DB workers close, or let OS release it at actual process exit; cleanup uncertainty cannot authorize another store owner.

**Call sites:**
- `src/installer/manager.ts`
- `src/installer/peer-contracts.ts`
- `src/installer/native.ts`
- `src/daemon/index.ts`

### 3.4 `Platform transport integration` — new

Unix retains protected daemon.sock and existing application payloads; never unlink a live endpoint. Windows uses the sc6 per-user/install named pipe with protected capability handshake before lifecycle control. Foundation manager adapters and application IPC consumers use identical location resolution. Existing application cleanup signal handlers can remain for OS/application disposal; manager stop/restart never sends those signals. Legacy daemons without qualified completion evidence are a diagnosed adoption precondition, not automatically replaceable. Add proposed daemon.lifecycleStatus without changing legacy daemon.status fields; register its identity schema and main-thread routing plus daemon.shutdown consistently in server/method registries and parity tests. Authentication/control must work while ordinary workers are blocked. Socket write callbacks are flush barriers only; positive wrapper child-exit observation remains the stopped proof. Node semantics reference: https://nodejs.org/download/release/v22.22.1/docs/api/net.html

**Call sites:**
- `src/daemon/server.ts`
- `src/daemon/threads/method-class.ts`
- `src/shared/paths.ts`

### 3.5 `Existing-operation escalation consumer` — new

Consume the approved s1-owned sc2 escalateShutdown method, not a new lock or lifecycle controller. An immediate override during quiescing/draining is a message to the current operation, not a competing mutation. Invoke escalateShutdown with the existing installationId/operationId, action='stop', shutdownMode='immediate'. Before ordinary lock admission, the manager command forwards it to the current lock owner's user-protected local control endpoint. The owner remains responsive while awaiting drain/exit, validates recorded instance/operation and alone sends s4 IPC using its original completion endpoint/nonce and writes controller state. Cross-window requests use this path; duplicates coalesce; all independent mutations still return busy. Private endpoint discovery binds installation/operation/owner-session nonce, validates same-user authorization and phase/identity, and rejects stale endpoints. No lock release/steal to escalate. Missing/dead owner returns escalation-unavailable/uncertain; explicit recovery must acquire the lock and reconcile instance/exit evidence before acting, never automatically replace the daemon. The s4 daemon handler/wrapper preserves its existing operation, instance and completion nonce on immediate supersession.

**Call sites:**
- `src/installer/manager.ts`
- `src/installer/operation-control.ts`

### 3.6 `Mandatory migration lifetime receipt` — new

Every migration-only child is launched through the s4 lifetime wrapper. Before spawn, the manager atomically records an immutable admission containing installationId, operationId, candidateReleaseId, candidateInventorySha256, sessionId, childInstanceId, completionNonce and the exact protected receipt path <home>/install/receipts/<operationId>/<sessionId>.json. IDs are validated opaque path-safe tokens, never arbitrary paths. Wrapper/child acknowledge that admission; a delayed unstarted child must still validate the live owner admission before acquiring the data lease/opening stores. The wrapper is detached from manager/terminal lifetime and never opens application stores. After observing that exact child actually exit, it MUST atomically persist MigrationExitReceipt to the predeclared path, flush file and containing directory where supported, then notify any live observer and exit. This requirement applies to natural migration completion, hook failure and child self-exit; it does not depend on a shutdown request or surviving manager IPC. Wrapper is the sole receipt writer; candidate alone writes hook journal; manager alone writes controller.json. Receipt is immutable per session, user-protected, identity/nonce/digest validated and retained until operation completion/recovery no longer needs it. Native lock/receipt filesystem durability support is qualified before target enablement. A replacement manager under the operation lock reconciles the admitted session, mandatory receipt, lease and exact journal; only matching actual-exit evidence plus released ownership permits another runner/start. ExitCode=0 is never migration success by itself: successful applicable hook tests and exact journal validation are also required. A failure receipt may authorize same-candidate explicit hook recovery, never automatic activation. Missing/corrupt/forged receipt or wrapper death remains blocked/uncertain, never inferred from PID, endpoint disappearance, free lease or completed journal. The wrapper never kills/restarts the child. This mandatory migration receipt does not make general shutdown's optional receipt mandatory.

**Call sites:**
- `src/installer/manager.ts`
- `src/installer/peer-contracts.ts`
- `src/installer/controller-store.ts`

### 3.7 `Live launch admission handshake` — new

Manager's assertLiveOwner closure is process-local. The detached wrapper/child instead use a protected bounded local rendezvous bound to the exact persisted LaunchAdmission and fresh capability. Manager validates its held OS lock, current operation phase/revision, ownerNonce and canonical admission before granting; do not pass a closure string or trust an admission file alone. Validate live admission immediately before spawn and before acquiring the data lease; after acquiring lease obtain final current-owner grant before application imports/store open. The final accepted grant is the admission linearization point: owner loss before it denies startup and closes the lease; owner loss afterward permits that already-admitted candidate to finish its owned work/journal but not activate a new process or mutate controller state. No inherited manager lock. Every later activation requires its own current admission. Cross-process tests exercise delayed launch, revoked/replaced admission, manager loss at each barrier and a live child retaining the lease.

**Call sites:**
- `src/installer/manager.ts`
- `src/installer/peer-contracts.ts`
- `src/installer/operation-control.ts`
- `src/daemon/index.ts`

### 3.8 `Production composition and owned prerequisites` — invariant-change

Proposed src/installer/lifecycle-peer.ts and detached wrapper implement existing LifecyclePort; src/installer/production-peers.ts publishes the real lifecycle alongside the existing S1/S2/S3 peers, leaving S5 migrations absent. Existing factory tests must assert lifecycle methods and retain migrations undefined. Two prerequisite corrections stay with their owners: S1/S2 must replace installed-launcher/dev preparation tools/node assumptions with HLD7's verified external runtime store; S1/sc2 must scope manager required-peer admission by action so stop does not need migrations. Record linked tracked corrective work and passing owner-contract evidence before production lifecycle acceptance. Do not silently implement those owner-owned changes in S4, add a no-op migrations peer, launch from PATH, or report full install/upgrade/start acceptance before S5. Preserve S3 install-only explicit Retry/cleanup and retained installed Ollama; update recovery is not install Retry.

**Call sites:**
- `src/installer/production-peers.ts`
- `src/installer/installed-launcher.ts`
- `src/installer/runtime-policy.ts`
- `src/installer/manager.ts`
- `src/installer/peer-contracts.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Selected immutable release/installed receipt and separately verified private runtime are foundation inputs, not S4 delivery work. S1/S2 HLD7 runtime-store correction must be linked and validated first; no release-local tools/node or PATH fallback. |
| `sc2` | consumes | Consume exact persisted LaunchAdmission, held OS mutation lock, manager-only controller writer and existing same-operation escalation endpoint. Live admission rendezvous supplies current-owner proof without serializing assertLiveOwner. S1 owns action-specific capability admission correction; no fake S5 port. |
| `sc3` | consumes | Preserve S3 dependency reports/consent and independent Ollama ownership. No lifecycle operation installs dependencies or applies install-only Retry cleanup to update. |
| `sc5` | consumes | Consume hook/journal verification and candidate migration-only runner from S5. Supply launch/lease/exit evidence only; no hook policy or placeholder journal success. Until S5 is real, production actions requiring migration capability fail closed. |
| `sc6` | consumes | Use one canonical installation location, exact home, protected Unix/named-pipe endpoints and platform policy in manager/wrapper/daemon/clients; never unlink a live endpoint or require elevated commands. |
| `sc4` | implements | Implement existing LifecyclePort, exact readiness/shutdown/ack/completion/migration receipt semantics, pre-store lease guard, main-thread authenticated control with per-reply flush, detached lifetime observation and qualified immediate self-exit. Shared wire types stay unchanged. |

## 6. Error paths

**Error cases**

- **IPC failure or wrong instance** (recoverable)
  - Detection: Connect/auth/timeout/schema/instance validation fails.
  - Response: Report shutdown failed/uncertain; no kill fallback or replacement.
  - User impact: User may explicitly retry IPC.
- **Graceful drain exceeds deadline** (recoverable)
  - Detection: Caller deadline expires without matching completion.
  - Response: Keep draining state observable; offer explicit immediate IPC choice.
  - User impact: No silent escalation or false stopped state.
- **Completion lost or forged** (recoverable)
  - Detection: Nonce/operation/instance mismatch, missing exit event/receipt or ambiguous ownership.
  - Response: Block restart until exact evidence reconciles.
  - User impact: No competing daemon.
- **Immediate primitive/native cleanup not qualified** (recoverable)
  - Detection: Target policy/binding unavailable or test evidence absent.
  - Response: Explicit unsupported/qualification failure; no alternate process killer.
  - User impact: Target cannot claim this lifecycle behavior yet.
- **Shutdown reply cannot be flushed** (recoverable)
  - Detection: The write callback for the exact accepted request errors, the socket closes before callback success, or its bounded flush deadline expires.
  - Response: Do not invoke the newly selected exit action. Preserve observable phase/diagnostics and any prior admitted shutdown; reconciliation still requires actual child exit evidence.
  - User impact: The caller sees control failure/uncertainty; no stopped result or replacement is inferred.
- **Admission stale, owner lost, or child delayed** (recoverable)
  - Detection: Live rendezvous fails or current lock/ownerNonce/controller revision/phase/admission differs at a pre-spawn/pre-store barrier.
  - Response: Reject unadmitted startup before store imports, close any acquired data lease, retain records for reconciliation; already-admitted child may finish its owned work, never write controller or independently activate.
  - User impact: Explicit retry after exact session reconciliation; no lock stealing or parallel candidate.
- **Boot guard ordering or home/runtime identity invalid** (recoverable)
  - Detection: Thin entry validation rejects malformed/canonical-home mismatch, selected receipt/runtime/digest mismatch, missing foundation resolver, or held/unknown data lease.
  - Response: Fail before application/DB imports and live-store ownership declaration; do not fall back to PATH/tools/node, a different release or raw source launch.
  - User impact: Actionable missing-prerequisite or conflicting-owner error; installed host daemon remains untouched.
- **Wrapper disappears or receipt publication/durability fails** (recoverable)
  - Detection: No matching live completion/immutable receipt after deadline, wrapper channel closes early, or exclusive publication/fsync/protection fails.
  - Response: Keep uncertain/blocked; never synthesize completion from socket absence, free lease, PID, exit code or hook journal. Retain exact admission and diagnostic evidence; migration recovery needs mandatory receipt and ownership/journal validation.
  - User impact: No automatic competing process or predecessor restart.
- **Wrong endpoint, stale session, or invalid control capability** (recoverable)
  - Detection: Canonical location/protected channel validation or installation/operation/instance/session/nonce comparison fails before command execution or proof acceptance.
  - Response: Reject and log bounded identity diagnostics without secrets; never unlink an active endpoint or redirect completion to arbitrary paths.
  - User impact: No unauthenticated control or falsely matched stopped state.
- **S1/S2 runtime or capability prerequisites absent; S5 not built** (recoverable)
  - Detection: Production peer admission and selected runtime resolution report unavailable capability; current all-port manager gate still blocks stop without S5 until its owning correction.
  - Response: Report the linked owner prerequisite and stop before launch. S4 contributes only its real lifecycle port; no fake migrations, alternate manager, duplicated runtime installer or untracked foundation patch.
  - User impact: S4 fixture evidence is distinct from production acceptance; full action coverage awaits actual prerequisites.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Duplicate start from multiple IDEs | Foundation serialization reuses one matching ready daemon. |
| Immediate request arrives during graceful drain | Control lane admits it independently of the drain promise. |
| Daemon is unresponsive to IPC | Report inability to stop; do not claim an immediate override can bypass an unreachable control channel. |
| Graceful request and duplicates overlap explicit immediate | Coalesce same operation/instance/nonce; an accepted immediate is monotonic, preserves completion identity, and awaits its own successful reply flush. Wrong operation is refused; timeout never chooses immediate. |
| Manager exits after final live-admission grant while child is running | Detached wrapper/child continue only their admitted lifetime. Data lease protects stores; migration child may complete hooks/journal, wrapper writes receipt without manager IPC. New manager reconciles before further action. |
| Normal daemon exits without a shutdown request | Wrapper may retain optional bound normal-lifetime evidence; no ShutdownCompletion is invented for an unknown future operation. Missing retained evidence leaves later recovery uncertain. |
| Fresh installation, stopped installation, or already-ready daemon | Only persisted never-started or exact exit evidence plus ownership permits absent; matching ready identity is reused under manager serialization, and blocked/mismatched/unreachable never counts as ready/absent. |
| Target not actually qualified or isolated VM unavailable | Record route pending with reason, never fabricate Mac/Linux/Windows evidence or touch host v2/Ollama. Missing immediate/native qualification cannot silently enable that target. |

**Invariants to preserve**

- Remain inside s4 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S004:FR001 and this story acceptance criteria apply unchanged. [[c3]]
- S3 install-only explicit Retry and retained Ollama boundaries; no update cleanup semantics or lifecycle control of Ollama. Existing daemon.status response, pre-store native ownership safeguards and no direct DB access from manager/clients are preserved. [[c4]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict through the canonical *.test.ts coordinator, using Node 22.22.1 and ONNXRUNTIME_NODE_INSTALL_CUDA=skip when unset. Each build task runs surrounding tests only; after all story tasks run the full installer/lifecycle scoped regression once, preserving intentional S2 long-file budgets. Record the selected test files, controller/run IDs, fingerprints, actor closure and cleanup. S3 baseline is 209 tests/44 files (run 3cdda64a-f71b-40ea-a4c7-336a32dce819), not a requirement to freeze test counts. Human BUILD approval follows all tasks; automated reviews unavailable. Native route qualification is separate and never inferred from fixture success.`

**Test levels**

- **contract** — Validate instance/nonce/auth/idempotency and distinct ack/exit evidence.
  - Subjects: `wrong-instance/stale/duplicate requests`, `ack cannot authorize restart`, `forged completion rejected`, `production-peers-exposes-nine-real-lifecycle-methods-and-no-placeholder-migrations`, `legacy-daemon-status-payload-preserved-and-lifecycle-control-registry-parity`, `control-auth-validates-installation-instance-operation-and-endpoint`, `observe-connection-refusal-and-free-lease-remain-uncertain`, `missing-runtime-store-resolver-fails-before-launch`, `receipt-decoder-rejects-extra-identity-mismatch-wrong-purpose-path-escape-and-replacement`
- **integration** — Exercise real child lifetime and resource control without external daemon signals.
  - Subjects: `pending work graceful drain and immediate supersession`, `wrapper receipt after child self-exit`, `control remains available while draining`, `startup guard and exclusive data lease`, `Real separate manager/IDE client escalates while original operation lock is held; duplicate/stale/owner-loss cases and unchanged nonce.`, `Candidate live after manager death denies competing store ownership; only admitted activating boot proceeds.`, `Wrapper survives manager self-exit; natural/failed migration child exit persists exact receipt without shutdown IPC.`, `Receipt fsync/publication crash points, wrong session/nonce/digest, wrapper death and missing receipt cannot authorize replacement.`, `thin-entry-guard-runs-before-path-capture-db-imports-and-live-store-declaration`, `exclusive-data-lease-held-until-all-store-workers-close-or-actual-exit`, `delayed-child-revalidates-live-admission-before-spawn-lease-and-store-open`, `owner-loss-before-final-grant-denies-start-owner-loss-after-grant-retains-single-owner`, `lifecycle-control-bypasses-stalled-worker-maintenance-and-drain-queues`, `per-request-write-callback-success-authorizes-exit-not-global-flush`, `failed-or-backpressured-ack-never-triggers-new-immediate-action`, `receipt-selected-private-runtime-and-bound-ready-evidence-no-path-tools-node-or-sync-build`, `normal-lifetime-optional-receipt-and-missing-evidence-recovery-remain-truthful`, `S3-install-retry-still-install-only-update-cannot-clean-admission-and-Ollama-is-never-stopped`
  - Fixtures: `Disposable private INSRC_HOME directories, short protected sockets/pipes, detached wrapper and exact self-exiting children; all owned actors accounted for by canonical coordinator.`, `Instrumented pre-import sentinel and fake queue/store peers for ordering; real cross-process admission/lease/receipt cases so callbacks alone cannot fake lifetime proof.`, `Separate live-admission manager process and current operation-control endpoint; children self-exit or use the explicit tested IPC path, never daemon PID/signal/kill.`, `Actual manager integration with production lifecycle and real S1/S2 prerequisite evidence. Missing S5 stays a declared unavailable dependency; fake migration runners are fixtures only and cannot qualify production install/start.`
- **live** — Qualify real native process/transport/store behavior on each enabled OS/architecture. First use isolated Linux OrbStack and macOS UTM guests when available; Windows and unavailable routes remain pending until actual runner evidence exists. S3 Linux dependency qualification does not qualify S4 lifecycle.
  - Subjects: `Mac/Linux/Windows graceful and immediate exit`, `restart exact release ready`, `no PID/kill command execution`, `native DB reopen after immediate self-exit`, `qualified-_Exit-with-native-cleanup-hang-and-atexit-fixture-plus-real-LMDB-Lance-reopen`, `Unix-owner-protection-endpoint-length-stale-socket-safety-and-directory-durability`, `Windows-named-pipe-same-user-capability-protection-real-CRT-DLL-exit-and-lock-release`, `manager-terminal-loss-retains-wrapper-child-receipt-with-no-inherited-owner-lock`, `both-delivery-modes-use-verified-separate-runtime-store-and-no-host-fallback`, `leave-installed-host-v2-daemon-and-host-Ollama-untouched-use-only-isolated-test-homes`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `serialized-start-reuse-and-identity`, `start-no-sync-install-build`, `conflicting-instance-refused`, `thin-entry-guard-runs-before-path-capture-db-imports-and-live-store-declaration`, `delayed-child-revalidates-live-admission-before-spawn-lease-and-store-open`, `production-peers-exposes-nine-real-lifecycle-methods-and-no-placeholder-migrations` |
| `ac2` | `graceful-drain-before-exit-completion`, `restart-waits-actual-child-exit`, `ready-identity-matches-selected-release`, `cross-process-immediate-during-held-lock`, `lifecycle-control-bypasses-stalled-worker-maintenance-and-drain-queues`, `exclusive-data-lease-held-until-all-store-workers-close-or-actual-exit`, `receipt-selected-private-runtime-and-bound-ready-evidence-no-path-tools-node-or-sync-build` |
| `ac3` | `explicit-immediate-bypasses-drain-and-native-exit-hooks`, `immediate-ack-flushed-before-self-exit`, `native-recovery-per-target`, `same-operation-nonce-preserved-on-override`, `per-request-write-callback-success-authorizes-exit-not-global-flush`, `failed-or-backpressured-ack-never-triggers-new-immediate-action`, `qualified-_Exit-with-native-cleanup-hang-and-atexit-fixture-plus-real-LMDB-Lance-reopen` |
| `ac4` | `ipc-failure-no-kill-no-replacement`, `missing-forged-completion-blocks`, `deadline-does-not-auto-escalate`, `dead-owner-escalation-no-replacement`, `migration-natural-exit-durable-receipt-after-manager-loss`, `missing-or-invalid-migration-receipt-blocks`, `observe-connection-refusal-and-free-lease-remain-uncertain`, `missing-runtime-store-resolver-fails-before-launch`, `owner-loss-before-final-grant-denies-start-owner-loss-after-grant-retains-single-owner` |

## 8. Alternatives considered

### 8.1 a1: One daemon control lane and detached lifetime wrapper — **CHOSEN**

Keep the existing selected design and implement the existing LifecyclePort behind one instance-bound daemon control lane.

Reuse InstallerManager, LaunchAdmission, operation-control forwarding, private home resolution and server write-completion tracking. A dependency-minimal daemon entry admits the selected installed runtime/identity and exclusive daemon data lease before importing application/store code. One local control lane remains responsive through graceful drain; a detached wrapper observes actual child exit and writes required migration receipts without taking controller or hook-journal ownership. Keep runtime-store corrections with S1/S2 and hook execution with S5.

### 8.2 a2: Daemon-local control worker plus lifetime wrapper

A separate daemon-owned worker handles lifecycle requests while the lifetime wrapper observes exit.

Keep all shared sc4 and manager contracts, but add a control worker within the daemon, communicating through a dedicated internal channel to application resource draining. The external detached lifetime wrapper still owns actual-exit receipts and has no kill/respawn policy. Runtime selection, data-lease and S5 dependencies are identical to a1.

**Rejected because:** Can meet the same ACs and sc1–sc6 but adds worker admission, control-channel failure and closure states without reducing required wrapper or owner prerequisites.

## 9. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `src/daemon/index.ts`
- **[[c5]]** `analyze-bundle` `src/daemon/server.ts`
- **[[c6]]** `analyze-bundle` `src/daemon/queue.ts`
- **[[c7]]** `analyze-bundle` `src/db/graph/store.ts`
- **[[c8]]** `doc` `https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/exit-exit-exit?view=msvc-170`
- **[[c9]]** `doc` `https://nodejs.org/download/release/v22.22.1/docs/api/net.html`
- **[[c10]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-1.json`
- **[[c11]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-2.json`
- **[[c12]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-3.json`
- **[[c13]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-4.json`
- **[[c14]]** `analyze-bundle` `src/installer/manager.ts`
- **[[c15]]** `analyze-bundle` `src/installer/peer-contracts.ts`
- **[[c16]]** `analyze-bundle` `src/installer/operation-control.ts`
- **[[c17]]** `analyze-bundle` `src/installer/production-peers.ts`
- **[[c18]]** `analyze-bundle` `src/installer/installed-launcher.ts`
- **[[c19]]** `analyze-bundle` `src/daemon/threads/method-class.ts`
- **[[c20]]** `analyze-bundle` `src/shared/paths.ts`
- **[[c21]]** `code` `src/installer/native.ts`
- **[[c22]]** `code` `src/installer/native/control.c`
- **[[c23]]** `code` `src/installer/controller-store.ts`
- **[[c24]]** `code` `src/installer/runtime-policy.ts`
- **[[c25]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md`
- **[[c26]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/BUILD.md`
- **[[c27]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/TESTS.md`

## Citations

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `src/daemon/index.ts`
- **[[c5]]** `analyze-bundle` `src/daemon/server.ts`
- **[[c6]]** `analyze-bundle` `src/daemon/queue.ts`
- **[[c7]]** `analyze-bundle` `src/db/graph/store.ts`
- **[[c8]]** `doc` `https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/exit-exit-exit?view=msvc-170`
- **[[c9]]** `doc` `https://nodejs.org/download/release/v22.22.1/docs/api/net.html`
- **[[c10]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-1.json`
- **[[c11]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-2.json`
- **[[c12]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-3.json`
- **[[c13]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-4.json`
- **[[c14]]** `analyze-bundle` `src/installer/manager.ts`
- **[[c15]]** `analyze-bundle` `src/installer/peer-contracts.ts`
- **[[c16]]** `analyze-bundle` `src/installer/operation-control.ts`
- **[[c17]]** `analyze-bundle` `src/installer/production-peers.ts`
- **[[c18]]** `analyze-bundle` `src/installer/installed-launcher.ts`
- **[[c19]]** `analyze-bundle` `src/daemon/threads/method-class.ts`
- **[[c20]]** `analyze-bundle` `src/shared/paths.ts`
- **[[c21]]** `code` `src/installer/native.ts`
- **[[c22]]** `code` `src/installer/native/control.c`
- **[[c23]]** `code` `src/installer/controller-store.ts`
- **[[c24]]** `code` `src/installer/runtime-policy.ts`
- **[[c25]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md`
- **[[c26]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/BUILD.md`
- **[[c27]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/TESTS.md`
