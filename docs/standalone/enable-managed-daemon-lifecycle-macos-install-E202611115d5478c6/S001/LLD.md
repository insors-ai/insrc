<!-- insrc:artifact LLD-5d5478c61a25ac8f-s1 -->

# LLD: STORY-5d5478c61a25ac8f-s1 — Enable managed daemon lifecycle on macOS install

## Summary

**Epic:** `enable-managed-daemon-lifecycle-macos-install`
**HLD base run:** `wf-1794555514618-2phz13`
**HLD effective hash:** `a1f870fbe4e8...`

Use a single signed source release tag. Compile at install time and retain exact local rollback bytes. Keep the supervised migration, crash recovery and existing command entry points.

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

**Surface level:** internal

### 2.1 `fetchReleaseAuthorization`

```typescript
fetchReleaseAuthorization(input: BootstrapInput): Promise<VerifiedSource>
```

**Parameters:**
- `input: BootstrapInput` — Private workspace, channel and trusted verifier inputs.

**Returns:** `VerifiedSource` — Canonical channel, tag object, commit and tree

**Errors:**
- `Error` when Required verification or lifecycle evidence fails.

**Preconditions:**
- A trusted installer or installed verifier carries the pinned public key and authorized channel mapping. Fetch into an owner-private bare repository with controlled Git configuration and a trusted Git/SSH verifier.

**Postconditions:**
- Require an annotated tag with a signed channel identifier and unambiguous version or sequence, a direct commit target matching the fetched release branch head, and an allowed signature. Verify before any candidate checkout, install script or bridge. Consume that immutable object through local staging.
- Read the compatibility catalog as a bounded Git blob from the verified tree before checkout. The catalog keys predecessor declarations and launch profiles by exact prior commit. The signed tag target supplies the candidate commit identity. The installed controller validates the schema, graph and writable-format equality and explicit crash-consistent reopening eligibility. The catalog supplies the known declaration for a historical predecessor without one, and rejects a present conflicting declaration. Journal the verified tag and catalog blob IDs, ordered compatibility pair, approved launch profile and local byte pins for offline recovery.

### 2.2 `stageManagedRelease`

```typescript
stageManagedRelease(options: StageOptions): Promise<StagedRelease>
```

**Parameters:**
- `options: StageOptions` — Verified source, installation root and incumbent runtime.

**Returns:** `StagedRelease` — Candidate and prior exact local fingerprints and compatibility pair

**Errors:**
- `Error` when Required verification or lifecycle evidence fails.

**Preconditions:**
- Use the verified commit and independently capture the actual incumbent bytes. Check known graph and writable-format declarations and restrict support to the known predecessor and explicit rollback-compatible versions.

**Postconditions:**
- Build in private staging. Require a successful build and required runtime entries. Pin local candidate bytes and recheck both pins before mutation.

### 2.3 `completeLegacyMigration`

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
- For a later upgrade of a restored legacy generation, the trusted external entry point acquires an InstallationMutationGate update preparation reservation before fetching the bridge or candidate, running build commands or capturing local fingerprints. Under admission capture the authenticated restored process incarnation and running or stopped intent, then verify the same baseline immediately before cutover. Use the managed preparation reservation pattern. An admitted public stop wins if it reserved first and the updater returns busy. If preparation fails or is cancelled before mutation, record its failure and release the reservation after verifying the incumbent, selector and launcher are unchanged. Dead-owner recovery cancels preparation with no mutation or uses the journaled recovery path if cutover has begun. Upgrade admission stays held continuously when the qualified preparation becomes the cutover reservation.
- Preserve exact prior launch route, selector, state and incarnation under admission.

**Postconditions:**
- Preserve the original raw pin, job policy and stopped or running intent. Keep the canonical dispatcher fenced during candidate cleanup, selector reconciliation, predecessor launch and readiness verification, and until the rollback outcome and receipt are durable.
- For a prior running install, the reservation owner alone may use the private, byte-pinned archived checkout. Reconstruct direct argv and cwd or a private launchd descriptor, mapping only pre-recorded checkout-contained executable/script/cwd paths from the captured inode to its archived location. Preserve UID, domain, label, argument order, runtime, state-root environment and RunAtLoad/KeepAlive policy. Verify the actual registered job and socket peer before recording readiness. A previously stopped job stays passive. Refuse ambiguous mapping and retain the fence.
- Publish the terminal rollback outcome and verified legacy route together before enabling normal access. Keep a guarded canonical dispatcher after rollback. It can select the archived release only for the verified terminal receipt, route restart and update through the same gate, and support a later managed retry without releasing the old mutating scripts. Keep the archived location stable for the live job. Journal dispatch publication separately so interrupted settlement can reconcile without another spawn. Verify exact child or idle state and preserve a committed candidate without rollback.
- Every restored running legacy route uses a trusted, byte-pinned rollback preload from the current installer/controller, passed as an explicit Node --import argument after scrubbing user injection options. For the supported predecessor the synchronous Node module hook matches the verified archived admin-handlers module URL and the pinned main/admin-worker importer URLs. It supplies wrappers for both sharedAdminHandlers and adminWorkerHandlers, retaining the original table except daemon.update and daemon.shutdown. The wrapper returns an update-via-current-installer refusal before invoking any old handler, so it never writes the old marker, spawns the old helper or schedules shutdown. The restored daemon keeps this refusal after terminal rollback and throughout any later migration attempt. The runtime and archived executable keep their raw pins. Set the launcher root to the stable guarded canonical dispatcher, while the daemon entry and cwd use the verified archive. Never resolve launcher operations through the archived checkout.
- At startup require the preload and exact hook configuration in the main thread and any admin worker, including replacements. For the pinned old router, queued admin requests can only reach a constructed wrapped table. Profile validation proves the supported startup and worker imports, default worker argument inheritance and absence of an unguarded update route. A private preload receipt identifies the verified module and invocation for main and the admin worker. Fail startup or keep recovery fenced if the wrapper cannot attest either applicable path before readiness acceptance. Test both threaded and single-threaded operation. The original legacy IPC is unavailable for updating a restored predecessor. Current shell, TUI and IDE paths use the trusted installer route.
- Both wrapped tables forward public daemon.shutdown to one process-level admission path. Before invoking the original drain, atomically acquire a stop reservation through InstallationMutationGate. A competing update, rollback, restart or stop reservation returns the existing busy response without entering the original shutdown handler. Hold an admitted stop reservation through exact predecessor exit and run-file reconciliation. The trusted controller records the generation and exact exit observer before admitting the drain and owns cleanup if the requester or old process exits. Recover abandoned admission through the existing journal and exact-incarnation evidence. A failed admission never schedules a delayed drain.
- Give the admitted migration controller a private local drain channel furnished by the pinned adapter, independent of public daemon.shutdown. Use an owner-private socket with bounded, versioned messages and Darwin peer credentials. The adapter matches the controller peer UID, PID, start time and executable against the current durable reservation, and checks the operation, target state root, restored process incarnation and outstanding drain intent. Reject stale, repeated or mismatched requests without forwarding them. The controller verifies the adapter peer and arms the exact exit observer before sending the request. Main and worker public handlers share the same gate and cannot submit private drain authority. No caller can pass that authority as public RPC parameters.
- Treat the private adapter's authenticated generation and both applicable handler receipts as prerequisites to publishing restored readiness. If the private endpoint or admission proof is missing, keep recovery fenced. During first migration from the untouched historical process, retain the existing authenticated legacy drain and exact-exit/rollback checks. Once restoration has installed the adapter, use the private route for every later controller drain. A stopped predecessor has no adapter process to drain.
- For the known shell LaunchAgent only, replace its verified bash start wrapper with a controller-authored private launchd descriptor using the pinned Node executable, explicit guarded --import preload, original supported tsx loader, archived entry and cwd. Preserve label, UID, domain, approved environment and passive/RunAtLoad policy, pin both descriptor hashes, verify live registration and exact adapter/daemon peer before publishing rollback. A previously stopped job stays passive.

### 2.4 `stageManagedInstallation`

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

### 2.5 `launchManagedUpdate`

```typescript
launchManagedUpdate(entry: string, args: readonly string[], awaitReply: () => Promise<boolean>): Promise<{ launched: true; updateId: string }>
```

**Parameters:**
- `entry: string` — Pins the detached controller executable.
- `args: readonly string[]` — Carries the owned release and operation inputs.
- `awaitReply: () => Promise<boolean>` — Confirms that the update acknowledgement was written.

**Returns:** `Promise<{ launched: true; updateId: string }>` — Returns the admitted update identity while the helper owns completion.

**Errors:**
- `Error` when Admission, trusted helper launch, or acknowledgement fails. Source verification or staging failure after acknowledgement is a detached terminal outcome.

**Preconditions:**
- The already trusted installed helper reserves the update and returns its acknowledgement within the existing client deadline. Launch it without fetching, installing, building or inventory verification before the acknowledgement. Stopped updates use the local controller and preserve idle intent.

**Postconditions:**
- Begin detached preparation only after confirmation that the acknowledgement was written. If reply delivery fails, cancel the unstarted reservation and leave the incumbent running. The helper verifies qualification and stages the candidate before any launcher fence, shutdown or selector change. A lost client connection after confirmed reply does not cancel the admitted update. Preserve the existing response shape and the test for preparation longer than both transport deadlines.

## 3. Data model changes

### 3.1 `InstallationMutationGate activation reservation` — field-add

Persist one activation reservation per state root with exact owner, candidate and explicit start intent. Journal descriptor, provisional selector, exact registration, child admission, readiness and terminal outcome with identities. Previous journals remain decodable. Activation cleanup reverses only receipted owned mutations.

**Call sites:**
- `src/shared/installation-mutation-gate.ts`
- `src/shared/managed-daemon-installation.ts`
- `src/bin/insrc-daemon-control.ts`

### 3.2 `UpdatePredecessor` — invariant-change

Persist a tagged managed, legacy-job, legacy-direct, or legacy-stopped predecessor. All variants bind canonical state root, prior release/runtime and candidate pin, selector baseline or absence, and prior running state. Managed carries supervisor generation. Legacy-job carries descriptor path/hash, verified label, UID, launchd domain, program argv, working directory and RunAtLoad policy. Running legacy-job and legacy-direct carry exact process incarnation, authenticated socket peer and pinned PID/socket identities. Legacy-direct also carries rollback argv, cwd and a release-qualified environment recipe reconstructed from the supported launcher, without persisting credentials. Legacy-stopped carries proof of no live process and either a pinned idle job or verified absence. Decode historical predecessor.legacy as legacy-job and older enabled prior without legacy as managed. Reject unknown or contradictory variants. Persist each observed exit, its drain classification, and ownership-fence evidence before candidate bootstrap. A rollback route maps only verified original checkout-relative argv/cwd paths into the archived directory. It binds a single archived release and recorded job or direct launch to the update and keeps the canonical launcher fenced until terminal evidence. The archive route pins one trusted preload, its supported old release and import/worker topology. The stable launcher root is distinct from the archived daemon cwd and entry. The old update RPC remains refused for this restoration generation. A restored incarnation owns one pinned adapter and one private drain endpoint. One stop or update reservation owns the matching drain authorization and exit receipt. An already-admitted public stop cannot overlap migration or rollback.

**Call sites:**
- `src/shared/installation-mutation-gate.ts`
- `src/daemon/managed-update-recovery.ts`
- `src/daemon/legacy-launch-job.ts`
- `src/daemon/legacy-daemon-cutover.ts`

### 3.3 `VerifiedSource` — new

One signed annotated tag authorizes one channel and one commit. A reservation owns at most one verified source receipt and one pair of exact local pins. The receipt stores signer identity and tag, commit and tree object IDs. Keep a durable channel floor to reject replay of an older release and reuse of a sequence with a different tag. The candidate tree owns the bounded compatibility catalog, keyed by exact predecessor commit with explicit ordered-pair and launch-profile semantics. The receipt binds the catalog blob and decoded pair to the update for offline recovery.

**Call sites:**
- `src/bin/insrc-release-bootstrap.ts`
- `src/shared/installation-mutation-gate.ts`

### 3.4 `Release qualification metadata` — field-remove

Supersede published runtime references, Mach-O normalization and delegation metadata for new releases. Retain decoding needed for any historical journal already requiring offline recovery. No new authorization can use the prior unsigned route.

**Call sites:**
- `src/shared/installation-mutation-gate.ts`
- `src/daemon/managed-release-staging.ts`

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
  - Response: Reconcile the candidate under the reservation, Keep the canonical dispatcher fenced while restoring the predecessor via the archived route. Publish verified rollback before enabling guarded ordinary commands. Retain a fence when restoration is unverified.
  - User impact: Verified rollback restores the previous service state and reports the failed update.
- **Outcome publication throws or its acknowledgement is lost** (recoverable)
  - Detection: Publication fails, or retry sees an active reservation without a verified terminal reply.
  - Response: Keep the reservation. Re-read the exact matching durable outcome through existing recovery. A durable success verifies or completes activation without rollback. A durable rollback verifies the old state. Only a proven uncommitted transaction can unwind. Unknown ownership remains fenced.
  - User impact: The updater reports an unconfirmed result until recovery determines the terminal state.
- **A restored legacy client attempts an unadmitted lifecycle RPC or the rollback adapter cannot bind both handlers** (recoverable)
  - Detection: The pinned adapter wraps both legacy admin factories and requires readiness receipts for each applicable path. Public shutdown requires a stop reservation. Private drain requires peer and intent checks against the current reservation and exact restored incarnation.
  - Response: Refuse public update and reject a busy public stop before the legacy handler can run. Accept an idle public stop through normal stop admission. A competing client or stale controller cannot initiate a private drain. Keep recovery fenced if adapter admission is unproven.
  - User impact: The previous service remains available through supported commands or the controller reports fenced recovery.
- **Missing tag, wrong signer, channel, target, or stale sequence** (recoverable)
  - Detection: Controlled Git verification and durable floor comparison.
  - Response: Refuse before checkout and npm. Leave predecessor service and selector untouched.
  - User impact: Update reports the verification failure.
- **Build, compatibility, raw-pin, or readiness verification fails** (recoverable)
  - Detection: Check local build outputs, writable-format declarations, captured pins and supervisor readiness.
  - Response: Release an untouched preparation or restore the exact prior bytes and route after cutover. Keep fenced if recovery evidence is uncertain.
  - User impact: Prior service resumes when verified.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Authorized tag for a different channel or retargeted branch | Reject before checkout. |
| Retry same signed tag after failed migration | Allow the same tag at the recorded floor. Reject an equal sequence with a different tag. |
| Offline recovery | Recover using durable local pins, without contacting Git. |

**Invariants to preserve**

- One state root has at most one daemon process admitted to use its stores. [[c2]]
- Committed success is never rolled back because the publication reply was lost. [[c4]]
- Linux keeps its current lifecycle and update behavior. [[c1]]

## 6. Test strategy

**Test framework:** `Node test runner with real Git, disposable SSH signing keys, and macOS launchd integration. Retain Linux and IDE routing coverage. Acceptance criteria: ac1 Authorize the exact configured source before checkout. ac2 Pin and verify exact local rollback bytes. ac3 Preserve running or stopped intent across source-built migration. ac4 Keep restored lifecycle and retry guarded.`

**Test levels**

- **integration** — Verify normal updater entry points and local crash-safe cutover.
  - Subjects: `Only an authorized channel tag can reach checkout and npm`, `Changed local runtime bytes block cutover or offline rollback`
- **smoke** — Test production source compilation with disposable signing keys and state.
  - Subjects: `Source-built macOS migration preserves running and stopped service intent`, `Restored rollback guards public lifecycle and admits private retry`
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
| `ac1` | `Only an authorized channel tag can reach checkout and npm` |
| `ac2` | `Changed local runtime bytes block cutover or offline rollback` |
| `ac3` | `Source-built macOS migration preserves running and stopped service intent` |
| `ac4` | `Restored rollback guards public lifecycle and admits private retry` |

## 7. Migration

**State before:** Legacy or managed daemon installed from source. The reference-inventory implementation is development work.

**State after:** Authorized Git source builds locally and cuts over transactionally. Existing state and exact rollback bytes are retained.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Bundle the same trusted verifier and public key into the shell distribution and both IDEs. — ↩ rollbackable
2. Sign and publish the exact release head after source-built macOS tests. Publish tag and branch consistently and verify via the normal channel. — ↩ rollbackable
3. Reserve a restored route before slow work. Authenticate before checkout, stage the local build, and capture both raw fingerprints. — ↩ rollbackable
4. Verify and drain the exact incumbent. Activate the candidate under the supervisor or recover using the guarded original bytes. Publish the terminal result before releasing admission. — ↩ rollbackable

**Backward compat:** Keep old journal decoding as needed for offline reconciliation. Existing users upgrade with the current installer or IDE. Fresh install and Linux remain within their existing lifecycle scope.

## 8. Alternatives considered

### 8.1 a1: Signed annotated channel tags — **CHOSEN**

Verify the exact locally built release source with Git.

Fetch privately, verify a signed annotated tag using an independently pinned release key, bind signed channel and commit, then check out its exact tree.

### 8.2 a2: Signed commit plus separate channel policy

Verify a release commit with the same pinned key.

Require a release-team-signed head commit and add channel metadata to signed commit content to disambiguate promotion.

**Rejected because:** Applies release policy to source commits and complicates branch promotion.

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
- **[[c20]]** `code` `src/daemon/managed-release-staging.ts`
- **[[c21]]** `code` `src/daemon/managed-update-preparation.ts`
- **[[c22]]** `prior-artifact` `BUILD-5d5478c61a25ac8f-s1`
- **[[c23]]** `code` `scripts/insrc-daemon-install.sh`
- **[[c24]]** `code` `.npmrc`
- **[[c25]]** `code` `src/daemon/legacy-launch-job.ts`
- **[[c26]]** `code` `src/daemon/admin-handlers.ts`
- **[[c27]]** `code` `src/daemon/threads/admin-worker.ts`
- **[[c28]]** `code` `src/daemon/__tests__/managed-update-handoff.test.ts`
- **[[c29]]** `code` `src/daemon/supervisor.ts`
- **[[c30]]** `code` `src/shared/installation-mutation-gate.ts`
- **[[c31]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
