<!-- insrc:artifact LLD-5d5478c61a25ac8f-s1 -->

# LLD: STORY-5d5478c61a25ac8f-s1 — Design the approved macOS installer and automatic existing-install migration fix from ISSUE-5d5478c61a25ac8f

## Summary

**Epic:** `enable-managed-daemon-lifecycle-macos-install`
**HLD base run:** `wf-1794414767042-nsonkp`
**HLD effective hash:** `72b5eb5ef17c...`

The normal macOS installer provisions a per-user supervisor. The first upgrade stages and qualifies a separate release, then switches the supported legacy entry points to a guarded launcher before touching the running daemon. Existing configuration, data, and running state are preserved through verified rollback.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `stageManagedInstallation`

```typescript
stageManagedInstallation(installation: ManagedInstallation, revalidate: () => Promise<void>, legacyCutover?: boolean): Promise<void>
```

**Parameters:**
- `installation: ManagedInstallation` — Identifies the owned state root, release, runtime and selector.
- `revalidate: () => Promise<void>` — Verifies transaction ownership before a write.
- `legacyCutover: boolean` _(optional)_ — Selects staging for a verified predecessor.

**Returns:** `Promise<void>` — Writes the staged disabled selector and its descriptor only.

**Errors:**
- `SupervisorLifecycleError` when Selector, descriptor, or state root conflicts with the reservation.

**Preconditions:**
- The installer controller owns an activation reservation with the explicit start intent and candidate pin. It has verified the canonical root, GUI launchd domain and quiescent fresh state.

**Postconditions:**
- The installer controller journals descriptor and provisional-selector publication, exact job registration and idle handshake, and optional child readiness. Enable the selector under the reservation before controller admission. Release the reservation only after a verified idle or running result is durable. --no-start leaves an enabled selector and an idle supervisor. Recovery replays an exact matching partial pair or removes only artifacts created by the activation and restores prior absence.

### 2.2 `completeLegacyMigration`

```typescript
completeLegacyMigration(gate: InstallationMutationGate, update: UpdateReservation, pins: ManagedUpdatePins): Promise<DaemonUpdateOutcome>
```

**Parameters:**
- `gate: InstallationMutationGate` — Owns the cutover and recovery reservation.
- `update: UpdateReservation` — Identifies verified predecessor, release, fence and desired state.
- `pins: ManagedUpdatePins` — Carries the qualified prior and candidate releases.

**Returns:** `Promise<DaemonUpdateOutcome>` — Verified committed cutover, verified rollback, or fenced recovery.

**Errors:**
- `SupervisorLifecycleError` when A release, launch route, exact exit, or recovery state cannot be verified.

**Preconditions:**
- Use the migration-capable installer or updater to prepare the release before invoking any shutdown path. Freeze the canonical legacy launch and checkout paths and verify old mutating helpers are absent before cutover. Verify the pinned predecessor and public socket before sending shutdown.

**Postconditions:**
- Use the journaled predecessor variant for exit, launchd job removal when applicable, and rollback. Publish a provisional selector before bootstrap. Mark terminal success only after exact candidate registration and verified idle or ready state. Retain a fenced reservation after uncertain outcome publication until recovery has read the matching durable outcome.

### 2.3 `launchManagedUpdate`

```typescript
launchManagedUpdate(entry: string, args: readonly string[], awaitReply: () => Promise<boolean>): Promise<{ launched: true; updateId: string }>
```

**Parameters:**
- `entry: string` — Pins the detached controller executable.
- `args: readonly string[]` — Carries the owned release and operation inputs.
- `awaitReply: () => Promise<boolean>` — Confirms that the update acknowledgement was written.

**Returns:** `Promise<{ launched: true; updateId: string }>` — Returns the admitted update identity while the helper owns completion.

**Errors:**
- `SupervisorLifecycleError` when An update is already active or the helper cannot qualify the candidate.

**Preconditions:**
- The running managed daemon routes daemon.update to the transactional helper after candidate preparation and retains its response-written handshake. Shell and TUI update have a local controller route for a stopped installation.

**Postconditions:**
- Managed updates use the same release preparation and transaction for running and stopped cases. A stopped install stays stopped. Preserve existing IPC result shapes and omit the legacy self-shutdown timer for managed requests.

## 3. Data model changes

### 3.1 `InstallationMutationGate activation reservation` — field-add

Persist one activation reservation per state root with exact owner, candidate and explicit start intent. Journal descriptor, provisional selector, exact registration, child admission, readiness and terminal outcome with identities. Previous journals remain decodable. Activation cleanup reverses only receipted owned mutations.

**Call sites:**
- `src/shared/installation-mutation-gate.ts`
- `src/shared/managed-daemon-installation.ts`
- `src/bin/insrc-daemon-control.ts`

### 3.2 `UpdatePredecessor` — invariant-change

Persist a tagged managed, legacy-job, legacy-direct, or legacy-stopped predecessor. All variants bind canonical state root, prior release/runtime and candidate pin, selector baseline or absence, and prior running state. Managed carries supervisor generation. Legacy-job carries descriptor path/hash, verified label, UID, launchd domain, program argv, working directory and RunAtLoad policy. Running legacy-job and legacy-direct carry exact process incarnation, authenticated socket peer and pinned PID/socket identities. Legacy-direct also carries rollback argv, cwd and a release-qualified environment recipe reconstructed from the supported launcher, without persisting credentials. Legacy-stopped carries proof of no live process and either a pinned idle job or verified absence. Decode historical predecessor.legacy as legacy-job and older enabled prior without legacy as managed. Reject unknown or contradictory variants. Persist each observed exit, its drain classification, and ownership-fence evidence before candidate bootstrap.

**Call sites:**
- `src/shared/installation-mutation-gate.ts`
- `src/daemon/managed-update-recovery.ts`
- `src/daemon/legacy-launch-job.ts`
- `src/daemon/legacy-daemon-cutover.ts`

### 3.3 `Release qualification and launcher fence` — invariant-change

One stable launcher location dispatches to one immutable selected release. The updater builds and verifies candidate and rollback copies under owner-private commit-addressed release roots. Preserve the prior executable, native dependencies, runtime path, configuration references and release identity before mutating the old checkout. Release metadata tied to the trusted configured origin and tested release pair supplies writable-format declarations and the exact legacy commit allowlist, including known predecessors that lack a declaration. Local observations establish identity, not qualification. Unqualified or modified prior releases are refused before mutation. Keep immutable pins and journaled launcher exchanges until settlement.

**Call sites:**
- `scripts/insrc-daemon-install.sh`
- `src/shared/managed-daemon-installation.ts`
- `src/daemon/release-compatibility.ts`
- `src/daemon/managed-update-launch.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **An older launcher or updater can still mutate the legacy install** (recoverable)
  - Detection: Resolve the canonical checkout and every supported launch route. Atomically exchange the canonical checkout entry with a gate-aware dispatcher on the same filesystem while the old daemon is still running. Preserve the displaced checkout separately. Before stopping, verify the dispatcher and archived checkout identities, an absent or owned legacy update marker, and absence of known old shell, detached helper and installer processes bound to the retired root, using verified argv and cwd. Repeat admission after the swap. An unrecognized launch path, unresolved process identity, live old mutator, or exchange failure makes exclusivity unproven.
  - Response: The dispatcher rejects concurrent mutation while cutover owns the reservation. Qualify only predecessors that acquire the shared run-file guard before opening data and whose shipped old commands use the canonical absolute entry. Keep that guard through owned cleanup and transfer it to candidate startup before the legacy route can reacquire it. Refuse when another legacy route cannot be fenced. Preserve or restore the old service before releasing a failed admission.
  - User impact: The supported update retries safely after a concurrent operation ends.
- **Predecessor job or runtime does not match the qualified route** (recoverable)
  - Detection: Match the verified launchd registration against its owned descriptor bytes and approved exact argv. Match direct socket peer and executable against the qualified launch recipe. Accept the documented recovery LaunchAgent only with its pinned tsx loader arguments, canonical entry, matching working directory, bounded owned descriptor and passive restart policy.
  - Response: Reject foreign jobs, unknown loaders or args, conflicting restart policy and unverifiable direct rollback settings before disruption. Recheck the descriptor, PID incarnation and run-file identities immediately before each action.
  - User impact: The updater reports the unsupported predecessor while preserving the current service.
- **Exit is unconfirmed or graceful drain cannot be classified** (recoverable)
  - Detection: Observe the exact predecessor exit independently of the broker and bind any qualified terminal evidence to the authenticated shutdown request and process incarnation. An RPC acknowledgement, socket close, PID disappearance, or generic log entry alone does not prove a graceful drain.
  - Response: Withhold candidate admission until exact exit is proved. Journal the exit plus graceful, broker-denied, or unknown. Use graceful only for a qualified positive completion signal, broker-denied only for correlated watchdog evidence, and unknown otherwise. Both broker-denied and unknown require a release pair explicitly qualified for crash-consistent reopening. Report the observed classification in the update detail.
  - User impact: The user can distinguish a verified shutdown from an exit whose drain could not be confirmed.
- **Candidate bootstrap or readiness fails before a durable outcome** (recoverable)
  - Detection: Registration, startup generation, owned run files, or candidate idle/readiness cannot be verified.
  - Response: Reconcile the candidate under the reservation, restore the prior selector or absence and the canonical launcher, then restore and verify the exact previous job or direct launch only if it was running. Retain a fence when restoration is unverified.
  - User impact: Verified rollback restores the previous service state and reports the failed update.
- **Outcome publication throws or its acknowledgement is lost** (recoverable)
  - Detection: Publication fails, or retry sees an active reservation without a verified terminal reply.
  - Response: Keep the reservation. Re-read the exact matching durable outcome through existing recovery. A durable success verifies or completes activation without rollback. A durable rollback verifies the old state. Only a proven uncommitted transaction can unwind. Unknown ownership remains fenced.
  - User impact: The updater reports an unconfirmed result until recovery determines the terminal state.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Fresh --no-start | Register the supervisor, enable the selector and verify idle with no daemon child. Subsequent normal start uses the same supervisor. |
| Already-managed update when the daemon is stopped | The external controller prepares and commits the update using supervisor status; no daemon RPC is required. Keep the candidate idle. |
| Legacy daemon remains running while the candidate is staged | Build outside the live root, preserve the running predecessor and only then acquire a cutover reservation. Failed fetch, build, or qualification leaves the running install unchanged. |
| An unchanged older shell or IDE freshness client invokes legacy restart or daemon.update | An old client cannot acquire new preflight behavior before executing its existing shutdown sequence. The first upgrade is delivered by the current standard installer or the ordinary update action in updated IDE clients. The installer may be rerun on an existing installation without launchctl or file edits. Never present an old acknowledgement as migration success. |

**Invariants to preserve**

- One state root has at most one daemon process admitted to use its stores. [[c2]]
- Committed success is never rolled back because the publication reply was lost. [[c4]]
- Linux keeps its current lifecycle and update behavior. [[c1]]

## 6. Test strategy

**Test framework:** `Node.js test runner via tsx, installed shell integration fixtures, and real macOS launchd smoke tests in disposable state roots.`

**Test levels**

- **unit** — Verify admission, qualification, journal compatibility and outcome recovery.
  - Subjects: `Predecessor variants and backward decoding`, `Explicit fresh activation start intent and owned partial publication`, `Release provenance, changed bytes and absent legacy declaration`, `Graceful, broker-denied and unknown drain evidence`, `Uncertain publication with durable success versus no outcome`
- **integration** — Drive supported entry points and competing legacy operations through the real controller boundaries.
  - Subjects: `Installer and updated CLI, VS Code and JetBrains route matrix`, `Running managed update IPC and stopped local managed update`, `Old shell/helper concurrent with canonical launcher exchange and old child attempting to open stores`, `Startup guard transfer, candidate bootstrap failure, rollback and repeated recovery`, `Linux normal install, update and restart unchanged`
- **smoke** — Verify actual launchd and daemon state on macOS.
  - Subjects: `Fresh install and verified ordinary restart`, `Fresh --no-start and later supervisor start`, `First supported update of a qualified prior build with broker denial`, `Direct install and passive recovery job with exact loader argv`, `Verified stopped and running rollback with configuration and store integrity`
  - Fixtures: `Disposable macOS state roots and isolated launchd labels`, `Pinned released predecessors, including the regression and clean-drain cases`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Fresh install and verified ordinary restart`, `Fresh --no-start and later supervisor start` |
| `ac2` | `Installer and updated CLI, VS Code and JetBrains route matrix`, `First supported update of a qualified prior build with broker denial`, `Direct install and passive recovery job with exact loader argv`, `Old shell/helper concurrent with canonical launcher exchange and old child attempting to open stores` |
| `ac3` | `Running managed update IPC and stopped local managed update`, `Verified stopped and running rollback with configuration and store integrity`, `Uncertain publication with durable success versus no outcome`, `Linux normal install, update and restart unchanged` |

## 7. Migration

**State before:** The installed shell restarts by stopping before preparing a new release, and daemon.update launches its helper and schedules shutdown. The normal installer mutates the checkout in place. The supervisor and transactional update exist but ordinary fresh install and managed update do not provision their inputs. See the s1 discovery bundle.

**State after:** Current install and update entry points share a migration-capable controller and immutable releases. A supported first upgrade retains the previous release and establishes one verified per-user supervisor. User data remains in the existing state root.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Use the current standard installer for both fresh installs and first upgrades. Updated VS Code and JetBrains lifecycle Update on unmanaged Darwin dispatch the packaged migration-capable installer in existing-install mode with the configured branch and root. Updated freshness clients route unmanaged Darwin to that same action before sending any daemon.update RPC. A migration-capable shell or TUI starts the same external preflight on ordinary Update. For already-installed binaries that cannot obtain new code before shutdown, the supported first-upgrade action is the current standard installer, including the normal Install action in an updated IDE. No manual service administration is part of that path. — ↩ rollbackable
2. Fetch the configured origin into a separate staging root, build the candidate, and validate release metadata and runtime. Pin the exact predecessor commit, compatibility record and rollback artifacts before changing any installed pathname. Use the trusted release allowlist for old builds missing an on-disk declaration. Confirm launchd and supported predecessor route. Fresh install enters the activation reservation with explicit start intent. — ↩ rollbackable
3. For legacy cutover, reserve and atomically replace the canonical installed checkout entry with a gate-aware dispatcher while preserving its original directory identity. Recover either side of the exchange by journaled inode evidence. Recheck for in-flight old helpers, update markers, unsupported launch routes, and mismatched job registrations. The dispatcher has no old executable or mutable checkout target. Refuse when the old launcher or writer cannot be excluded. Keep the prior checkout pinned until rollback is no longer needed. — ↩ rollbackable
4. Authenticate the running predecessor over the pinned socket and observe exact exit. While the canonical launcher remains fenced, acquire the legacy-compatible run-file guard before cleanup, reconcile only the recorded publications, and retain the guard until a verified supervisor has adopted it for startup. Transfer owner evidence under the same directory identity with no unguarded interval. Remove a verified passive old job after its child exits. Apply the stored outcome policy for graceful, broker-denied, or unknown exit. — ↩ rollbackable
5. Journal the provisional selector and register the supervisor. Start a child for a normal fresh install or previously running update. Verify idle for --no-start or previously stopped update. Publish the matching durable terminal record before release. An already-managed shell/TUI update uses the external transaction even when stopped, and the running managed RPC uses the detached helper and acknowledgement handshake. — ↩ rollbackable
6. Recover from interrupted activation or cutover using the matching durable outcome. Restore an uncommitted predecessor by reversing owned mutations, restoring the canonical legacy entry and revalidating the predecessor's exact original launch route. Retain a fence on uncertainty. Do not roll back a verified durable success. — ↩ rollbackable

**Backward compat:** Preserve the CLI flags, configured source, IDE IPC result shapes, supported user settings, Linux behavior and historical journal decoding. Existing binaries that stop before they can fetch the migration use the current normal installer for the first upgrade. The canonical installed launcher remains a compatible entry point after migration.

## 8. Alternatives considered

### 8.1 a1: Stage a bridge before cutover — **CHOSEN**

A common updater prepares releases and fences the old entry point before changing ownership.

Reuse the supervisor and outcome transactions with explicit install, stopped legacy, live legacy, and already-managed admissions. Ship the bridge through the normal installer and updated clients.

### 8.2 a2: Migrate at a later start

Apply the new supervisor only after the daemon has stopped.

Defer all lifecycle changes to a later start after a verified legacy stop.

**Rejected because:** Requires a stopped predecessor and can strand an affected user.

## 9. References

- **[[c1]]** `code` `scripts/insrc-daemon-install.sh`
- **[[c2]]** `code` `src/shared/managed-daemon-installation.ts`
- **[[c3]]** `code` `src/daemon/managed-update-recovery.ts`
- **[[c4]]** `code` `src/daemon/managed-update-transaction.ts`
- **[[c5]]** `code` `src/bin/insrc-daemon-control.ts`
- **[[c6]]** `code` `src/daemon/legacy-launch-job.ts`
- **[[c7]]** `code` `src/daemon/legacy-daemon-cutover.ts`
- **[[c8]]** `code` `src/daemon/update-runner.ts`
- **[[c9]]** `code` `src/daemon/admin-handlers.ts`
- **[[c10]]** `code` `src/daemon/release-compatibility.ts`
- **[[c11]]** `code` `src/daemon/index.ts`
- **[[c12]]** `code` `src/shared/daemon-run-files.ts`
- **[[c13]]** `code` `scripts/daemon-ctl.sh`
- **[[c14]]** `prior-artifact` `ISSUE-5d5478c61a25ac8f`
