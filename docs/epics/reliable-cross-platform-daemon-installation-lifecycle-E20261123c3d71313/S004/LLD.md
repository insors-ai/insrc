<!-- insrc:artifact LLD-c3d71313f34bce71-s4 -->

# LLD: STORY-c3d71313f34bce71-s4 — Control daemon start and shutdown through IPC

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`

Daemon controls use instance-bound local IPC and a single shutdown state. Graceful shutdown drains work; an explicit immediate request bypasses that drain. Restart waits for observed child exit and then confirms the selected release is ready.

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
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s3`: Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

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

**Postconditions:**
- Already-ready matching instance is reused; conflicting identity or blocked migration is not success.
- No sync/npm/build on start.

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

**Postconditions:**
- Flush accepted reply before selected exit action.
- Repeated same request is idempotent; explicit immediate can supersede draining.
- No timeout-triggered escalation, PID inspection, signal or kill fallback.

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

## 3. Data model changes

### 3.1 `Daemon control state` — new

Proposed private boundary src/daemon/installation-lifecycle.ts integrates with current src/daemon/index.ts and src/daemon/server.ts. One state machine admits status/shutdown while rejecting ordinary new work during draining. Refactor only the control closure ordering: do not close the control listener before an immediate override can arrive. Existing queue/resource disposal remains application-owned; preserve storage-health checks and native ownership guards. APIs on src/daemon/lifecycle.ts remain model bootstrap, not a restored process engine.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/server.ts`
- `src/daemon/queue.ts`

### 3.2 `Immediate self-exit path` — new

Immediate is an authenticated explicit IPC request, not a drain timeout policy. After reply flush, a small target-qualified Node-API primitive performs calling-process _Exit(0), bypassing pending graceful promises and native atexit hooks. This is self-exit inside the daemon, not a PID-based or external termination command. It opens no control process handle and sends no signal. If unavailable, return an explicit unsupported-handler failure. Qualify crash recovery of actual native stores afterward; never claim immediate works when IPC itself is unresponsive.


### 3.3 `Lifetime wrapper and ownership` — new

Wrapper starts detached from the install terminal with log-bound standard streams and a private child IPC channel; child readiness binds installation/release/instance. It observes child exit, produces ShutdownCompletion on the manager's protected local endpoint and optionally an atomic receipt keyed by operation/nonce, then exits. It has no watchdog, respawn or kill policy. Normal daemon and migration-only process share an exclusive daemon-owned data-lease primitive; manager never opens DB. All managed boot paths apply foundation startup guard and refuse conflicting ownership before store open.


### 3.4 `Platform transport integration` — new

Unix retains protected daemon.sock and existing application payloads; never unlink a live endpoint. Windows uses the sc6 per-user/install named pipe with protected capability handshake before lifecycle control. Foundation manager adapters and application IPC consumers use identical location resolution. Existing application cleanup signal handlers can remain for OS/application disposal; manager stop/restart never sends those signals. Legacy daemons without qualified completion evidence are a diagnosed adoption precondition, not automatically replaceable.


## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consume foundation identity/state/home/report/hook-shape boundary; only lifecycle/readiness implementation is owned here. |
| `sc2` | consumes | Consume foundation identity/state/home/report/hook-shape boundary; only lifecycle/readiness implementation is owned here. |
| `sc3` | consumes | Consume foundation identity/state/home/report/hook-shape boundary; only lifecycle/readiness implementation is owned here. |
| `sc5` | consumes | Consume foundation identity/state/home/report/hook-shape boundary; only lifecycle/readiness implementation is owned here. |
| `sc6` | consumes | Consume foundation identity/state/home/report/hook-shape boundary; only lifecycle/readiness implementation is owned here. |
| `sc4` | implements | Own request/acknowledgement/readiness/completion semantics, control-lane ordering, wrapper exit proof and platform-qualified immediate self-exit. |

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

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Duplicate start from multiple IDEs | Foundation serialization reuses one matching ready daemon. |
| Immediate request arrives during graceful drain | Control lane admits it independently of the drain promise. |
| Daemon is unresponsive to IPC | Report inability to stop; do not claim an immediate override can bypass an unreachable control channel. |

**Invariants to preserve**

- Remain inside s4 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S004:FR001 and this story acceptance criteria apply unchanged. [[c3]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict; canonical *.test.ts coordinator. Real platform/IDE qualification is recorded separately and not inferred from fakes.`

**Test levels**

- **contract** — Validate instance/nonce/auth/idempotency and distinct ack/exit evidence.
  - Subjects: `wrong-instance/stale/duplicate requests`, `ack cannot authorize restart`, `forged completion rejected`
- **integration** — Exercise real child lifetime and resource control without external daemon signals.
  - Subjects: `pending work graceful drain and immediate supersession`, `wrapper receipt after child self-exit`, `control remains available while draining`, `startup guard and exclusive data lease`
  - Fixtures: `Disposable daemon/queue/store peers and isolated IPC paths.`
- **live** — Prove actual native shutdown/recovery on every target.
  - Subjects: `Mac/Linux/Windows graceful and immediate exit`, `restart exact release ready`, `no PID/kill command execution`, `native DB reopen after immediate self-exit`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `serialized-start-reuse-and-identity`, `start-no-sync-install-build`, `conflicting-instance-refused` |
| `ac2` | `graceful-drain-before-exit-completion`, `restart-waits-actual-child-exit`, `ready-identity-matches-selected-release` |
| `ac3` | `explicit-immediate-bypasses-drain-and-native-exit-hooks`, `immediate-ack-flushed-before-self-exit`, `native-recovery-per-target` |
| `ac4` | `ipc-failure-no-kill-no-replacement`, `missing-forged-completion-blocks`, `deadline-does-not-auto-escalate` |

## 8. Alternatives considered

### 8.1 a1: One in-daemon control state and lifetime exit wrapper — **CHOSEN**

Daemon owns drain/immediate decisions; wrapper proves actual child exit.

A single daemon control lane transitions ready to draining and still admits authenticated shutdown/status requests. Start and restart use s1 controller serialization and release identity.

A minimal detached lifetime wrapper observes child exit and emits the nonce-bound completion; it never signals, kills, retries or selects another release.

### 8.2 a2: Separate daemon-local control worker

A dedicated worker brokers shutdown while the application drains.

A daemon-owned control worker handles the same public IPC contracts and forwards resource draining to the application. The wrapper still observes process exit.

Worker boot/channel health and shutdown handoff add a second control lifetime inside the daemon, despite an existing main-thread server.

**Rejected because:** A second control worker adds lifecycle/channel states; it does not eliminate the required wrapper or solve a fully unresponsive process under IPC-only constraints.

## 9. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `src/daemon/index.ts`
- **[[c5]]** `analyze-bundle` `src/daemon/server.ts`
- **[[c6]]** `analyze-bundle` `src/daemon/queue.ts`
- **[[c7]]** `analyze-bundle` `src/db/graph/store.ts`
- **[[c8]]** `doc` `https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/exit-exit-exit?view=msvc-170`
- **[[c9]]** `doc` `https://nodejs.org/docs/latest-v22.x/api/net.html`
