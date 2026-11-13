<!-- insrc:artifact LLD-5d5478c61a25ac8f-s1 -->

# LLD: STORY-5d5478c61a25ac8f-s1 — Enable managed daemon lifecycle on macOS install and upgrade

## Summary

**Epic:** `enable-managed-daemon-lifecycle-macos-install`
**HLD base run:** `wf-1794546820180-mwzp01`
**HLD effective hash:** `792d79af295b...`

The normal macOS installer provisions a per-user supervisor and automatically migrates supported locally built installs. Before cutover the updater verifies the incumbent against release-authorized build evidence and pins its original bytes for rollback. Existing configuration, stores and running state survive a verified rollback.

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

### 2.1 `stageManagedRelease`

```typescript
stageManagedRelease(options: StageOptions): Promise<{ readonly candidate: StagedReleasePin; readonly prior?: StagedReleasePin; readonly compatibility?: QualifiedReleasePair }>
```

**Parameters:**
- `options: StageOptions` — Carries the configured source, exact release pair, authorized build evidence and optional incumbent.

**Returns:** `Promise<{ readonly candidate: StagedReleasePin; readonly prior?: StagedReleasePin; readonly compatibility?: QualifiedReleasePair }>` — Verified candidate and optional byte-exact original rollback pin.

**Errors:**
- `Error` when Missing or invalid signed evidence, unsupported build profile, unaccounted executable differences, ambiguous inventory or unstable pin.

**Preconditions:**
- The official installer script and IDE-bundled copies carry the same dependency-free Node verifier and pinned offline release root. An installed managed controller can reuse its verified copy. Fetch into a fresh owner-private bare Git directory with external hooks, checkout filters and config injection disabled. Before checkout, npm scripts, build, or launch of a downloaded bridge, the trusted verifier validates the signed source/branch/full commit and expected Git tree, approved build inputs and release policy. A configured URL override changes routing only. Never obtain the first verifier or root from the fetched branch.
- Use separately root-signed UTF-8 trust data, and per-channel Ed25519 qualification keys authorized by that data. Verify signatures over exact length-framed UTF-8 payload bytes with distinct trust and qualification domain tags. Enforce strict versioned schemas and limits and reject duplicate keys. Trust data records monotonic epoch, permitted source and branch per key, key ID and public key, validity window and revocations. The root is pinned in the official distribution. Root rotation requires an updated trusted distribution. Production verifier trust excludes fixture keys.

**Postconditions:**
- Refresh root-signed trust data from the configured release channel during preparation and within five minutes before the first cutover mutation. Trust data is valid for at most 24 hours. Validate the UTC window, key status and epoch against an owner-private durable floor advanced atomically under admission. If the same epoch arrives with different bytes, the local clock has rolled behind the stored valid-time floor, or signed trust data is unavailable, refuse admission. Qualification carries key ID, release source, exact current branch head and Git tree, ordered release pair, validity window, supported profile and immutable release-test receipt digests. A revoked key, expired qualification, stale trust epoch or changed candidate prevents cutover.
- Initial profile targets the measured arm64 macOS 27.0 installation class and predecessor ab6a96296ea6f2bde948636424218c0a23136c74. Reference inputs pin Node 22.23.2 with ABI 127, npm 10.9.8, node-gyp 11.5.0, Node 22.22.1 headers, Apple Clang 21.0.0 build 2100.3.34.2, Command Line Tools 27.0.0.0.1788430756, SDK 27.0, Python 3.12.6, -std=c++17 and exact Git tree and lockfile. Release authority records digests for tools, SDK/headers, dependencies, prebuilds and environment allowlist. It produces references from two clean installer builds at separate real paths, with pinned inputs and controlled network dependency retrieval. Each supported optional dependency layout is inventoried and qualifies separately. No profile ships before the real product matrix confirms these inputs and the target incumbent.
- Inventory exact relative paths, type, permitted modes, symlink targets, and digests for the Node runtime, the executable closure in out and node_modules, project-memory dist, scripts used by the daemon or supported entry points, and build/package configuration used by those entry points. Walk by stable owned file handles without following unapproved links. Reject extra or missing execution-bearing files, escaped links or ambiguous optional package layouts. Default to raw SHA-256. A signed profile may explicitly enumerate inert build leftovers with their expected formats and paths. Generated Makefile, gyp and dependency records, intermediate Mach-O object/static library files and npm bookkeeping are eligible only if a verified runtime or rollback path never reads or executes them. Validate their types and allowlisted formats and retain every byte in the raw pin. Optional JavaScript or WASM packages are executable and use a separately qualified exact inventory.
- Native equivalence is limited initially to the signed exact paths of the fs-ext, tree-sitter, tree-sitter-sql and tree-sitter-kotlin thin arm64 bundles observed in the native study. Parse the entire file without gaps or overlaps. Preserve raw bytes of code, mapped data, all padding outside explicitly validated linker regions, and loader semantics including virtual addresses, dependency names, binding, export, rebase, relocation and indirect-symbol tables. Only known debug-only N_SO and N_OSO records may replace an exact observed checkout root with a token. Only N_OSO may normalize its object timestamp. Preserve record order, indices, types, sections, flags, all other values and decoded names. Verify runtime tables never reference any normalized debug record or a mutable byte of its strings. Reject all other native variations.
- Derive the normalized representation from a checked physical layout. For each profile require the signed region order, alignment, permitted padding bytes and extent rules. Verify LC_SYMTAB addresses and sizes select its original bounded symbol and string tables. Decode and validate all n_strx references and account for the complete original string table including suffix sharing, terminators and padding. Preserve exact non-debug values and all runtime reference relationships. Construct a deterministic tokenized string table from the ordered symbol records and retained non-debug strings, with stable offsets assigned in first-appearance order. Replace only validated physical offsets, lengths and string offsets with logical region identifiers and their derived canonical offsets and lengths. Compute the normalized LC_SYMTAB strsize and __LINKEDIT filesize from these canonical extents while preserving loader-visible addresses, protections and alignments. Verify LC_CODE_SIGNATURE dataoff equals the validated original signature boundary and original CodeDirectory codeLimit equals dataoff, with complete coverage from offset zero and no unsigned gap or trailing payload. Verify the original linker-signed ad hoc CodeDirectory page hashes, expected identity, flags and absence of extra slots or entitlements. Represent signature offset and codeLimit by the same derived canonical boundary after normalization and preserve the verified signature policy in the digest. Normalize the linker UUID and generated page hashes only after those checks. Compare the versioned logical representation with the signed reference. The representation is evidence only and is never executed or written over the original binary.
- After independent verification capture and retain a byte-exact digest of every installed runtime and allowed inert file, including portable verifier metadata. Journal the raw incumbent and candidate pins and the signed evidence digest with the exact update before fencing. Recheck raw bytes and identities on both sides of the fence and before rollback. Build the authenticated candidate with the qualified inputs, and verify its signed inventory before executing its installed controller or daemon.

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
- For a later upgrade of a restored legacy generation, the trusted external entry point acquires an InstallationMutationGate update preparation reservation before fetching the bridge or candidate, running build commands or comparing inventories. Under admission capture the authenticated restored process incarnation and running or stopped intent, then verify the same baseline immediately before cutover. Use the managed preparation reservation pattern. An admitted public stop wins if it reserved first and the updater returns busy. If preparation fails or is cancelled before mutation, record its failure and release the reservation after verifying the incumbent, selector and launcher are unchanged. Dead-owner recovery cancels preparation with no mutation or uses the journaled recovery path if cutover has begun. Upgrade admission stays held continuously when the qualified preparation becomes the cutover reservation.

**Postconditions:**
- Preserve the original raw pin, job policy and stopped or running intent. Keep the canonical dispatcher fenced during candidate cleanup, selector reconciliation, predecessor launch and readiness verification, and until the rollback outcome and receipt are durable.
- For a prior running install, the reservation owner alone may use the private, byte-pinned archived checkout. Reconstruct direct argv and cwd or a private launchd descriptor, mapping only pre-recorded checkout-contained executable/script/cwd paths from the captured inode to its archived location. Preserve UID, domain, label, argument order, runtime, state-root environment and RunAtLoad/KeepAlive policy. Verify the actual registered job and socket peer before recording readiness. A previously stopped job stays passive. Refuse ambiguous mapping and retain the fence.
- Publish the terminal rollback outcome and verified legacy route together before enabling normal access. Keep a guarded canonical dispatcher after rollback. It can select the archived release only for the verified terminal receipt, route restart and update through the same gate, and support a later managed retry without releasing the old mutating scripts. Keep the archived location stable for the live job. Journal dispatch publication separately so interrupted settlement can reconcile without another spawn. Verify exact child or idle state and preserve a committed candidate without rollback.
- Every restored running legacy route uses a trusted, byte-pinned rollback preload from the current installer/controller, passed as an explicit Node --import argument after scrubbing user injection options. For the signed predecessor profile the synchronous Node module hook matches the verified archived admin-handlers module URL and the pinned main/admin-worker importer URLs. It supplies wrappers for both sharedAdminHandlers and adminWorkerHandlers, retaining the original table except daemon.update and daemon.shutdown. The wrapper returns an update-via-current-installer refusal before invoking any old handler, so it never writes the old marker, spawns the old helper or schedules shutdown. The restored daemon keeps this refusal after terminal rollback and throughout any later migration attempt. The runtime and archived executable keep their raw pins. Set the launcher root to the stable guarded canonical dispatcher, while the daemon entry and cwd use the verified archive. Never resolve launcher operations through the archived checkout.
- At startup require the preload and exact hook configuration in the main thread and any admin worker, including replacements. For the pinned old router, queued admin requests can only reach a constructed wrapped table. Profile validation proves the supported startup and worker imports, default worker argument inheritance and absence of an unguarded update route. A private preload receipt identifies the verified module and invocation for main and the admin worker. Fail startup or keep recovery fenced if the wrapper cannot attest either applicable path before readiness acceptance. Test both threaded and single-threaded operation. The original legacy IPC is unavailable for updating a restored predecessor. Current shell, TUI and IDE paths use the trusted installer route.
- Both wrapped tables forward public daemon.shutdown to one process-level admission path. Before invoking the original drain, atomically acquire a stop reservation through InstallationMutationGate. A competing update, rollback, restart or stop reservation returns the existing busy response without entering the original shutdown handler. Hold an admitted stop reservation through exact predecessor exit and run-file reconciliation. The trusted controller records the generation and exact exit observer before admitting the drain and owns cleanup if the requester or old process exits. Recover abandoned admission through the existing journal and exact-incarnation evidence. A failed admission never schedules a delayed drain.
- Give the admitted migration controller a private local drain channel furnished by the pinned adapter, independent of public daemon.shutdown. Use an owner-private socket with bounded, versioned messages and Darwin peer credentials. The adapter matches the controller peer UID, PID, start time and executable against the current durable reservation, and checks the operation, target state root, restored process incarnation and outstanding drain intent. Reject stale, repeated or mismatched requests without forwarding them. The controller verifies the adapter peer and arms the exact exit observer before sending the request. Main and worker public handlers share the same gate and cannot submit private drain authority. No caller can pass that authority as public RPC parameters.
- Treat the private adapter's authenticated generation and both applicable handler receipts as prerequisites to publishing restored readiness. If the private endpoint or admission proof is missing, keep recovery fenced. During first migration from the untouched historical process, retain the existing authenticated legacy drain and exact-exit/rollback checks. Once restoration has installed the adapter, use the private route for every later controller drain. A stopped predecessor has no adapter process to drain.

### 2.3 `stageManagedInstallation`

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

### 2.4 `launchManagedUpdate`

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

### 3.3 `Release qualification profile and exact rollback pin` — invariant-change

The release authority owns a signed, versioned profile for one configured source, ordered commit pair and tested build profile. A release pair can have multiple profiles. Exactly one applicable profile must verify a particular installation. An update reservation owns one verified profile receipt and one exact incumbent pin and binds both to its candidate, selector and state root. The profile verifies a complete measured inventory and accounts for variability. The local pin freezes raw bytes for rollback, and the receipt is reusable during recovery without remote network access. Historical journals retain their original verification rules. Versioned notes that lack the required portable proof cannot qualify a source-built variant. Record one immutable admission receipt per update with signing key, trust epoch and payload digest, verification time, qualification and reference digests, commit/tree pair, source, release profile, raw pins and exact update ID. Before a recorded fence, expiry, refresh failure or revocation forces refusal. After the fence, the recorded decision applies only to that transaction while its owner settles it within its admitted authorization window. If recovery begins without a durable success, it can verify and roll back offline using the receipt and raw pin. It needs fresh authorization to newly activate a candidate. If revocation is known before a new candidate activation, roll back. Durable success is reconciled offline and is never reinterpreted as uncommitted.

**Call sites:**
- `src/daemon/managed-release-staging.ts`
- `src/daemon/managed-update-preparation.ts`
- `src/daemon/release-compatibility.ts`
- `src/daemon/managed-update-recovery.ts`

## 4. Diagrams

- [Cutover sequence](sequence-diagram.html)
- [Running, idle and rollback branches](component-dependency.html)

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
- **Release qualification is missing, ambiguous, stale, revoked or invalid** (recoverable)
  - Detection: Reject absent note, invalid signature or key, unsupported profile or verifier version, source or commit mismatch, conflicting profiles and any unaccounted runtime difference.
  - Response: Report the failed verification before any incumbent shutdown, fence or selector mutation. Discard only owned preparation artifacts and preserve the incumbent.
  - User impact: The daemon remains available with an update diagnostic and can retry after a qualified release is published.
- **Installed runtime changes after independent verification** (recoverable)
  - Detection: Recheck the original raw digest and exact file identities while holding update admission at the designated cutover and rollback boundaries.
  - Response: Stop cutover before touching the incumbent when possible. After mutation use the existing exact rollback or fenced recovery. Refuse to execute any changed rollback copy.
  - User impact: The update fails with a verification diagnostic.
- **Legacy mutation competes with rollback or cutover authorization expires** (recoverable)
  - Detection: Read the admitted trust receipt and launcher fence identities. Detect a concurrent old command through the guarded canonical route or a fresh candidate admission after expiry or revocation.
  - Response: Reject the old command. Use only the private archive route for rollback, verify the prior state, publish terminal evidence, then permit guarded dispatch. If admission is no longer valid, recover offline by rollback unless the candidate already has a verified durable success.
  - User impact: The previous verified service is restored or the installation remains fenced for recovery.
- **A restored legacy client attempts an unadmitted lifecycle RPC or the rollback adapter cannot bind both handlers** (recoverable)
  - Detection: The pinned adapter wraps both legacy admin factories and requires readiness receipts for each applicable path. Public shutdown requires a stop reservation. Private drain requires peer and intent checks against the current reservation and exact restored incarnation.
  - Response: Refuse public update and reject a busy public stop before the legacy handler can run. Accept an idle public stop through normal stop admission. A competing client or stale controller cannot initiate a private drain. Keep recovery fenced if adapter admission is unproven.
  - User impact: The previous service remains available through supported commands or the controller reports fenced recovery.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Fresh --no-start | Register the supervisor, enable the selector and verify idle with no daemon child. Subsequent normal start uses the same supervisor. |
| Already-managed update when the daemon is stopped | The external controller prepares and commits the update using supervisor status; no daemon RPC is required. Keep the candidate idle. |
| Legacy daemon remains running while the candidate is staged | On a restored legacy route the updater acquires the preparation reservation before any fetch, build or inventory verification and captures the exact running or stopped baseline. Stage outside the live root without fencing or stopping the incumbent. Keep the same reservation through qualification and cutover. Refused or interrupted preparation leaves the incumbent intact and releases admission through the journal. An untouched predecessor uses the original stage-before-cutover ordering and revalidates its baseline at cutover. |
| An unchanged older shell or IDE freshness client invokes legacy restart or daemon.update | An old client cannot acquire new preflight behavior before executing its existing shutdown sequence. The first upgrade is delivered by the current standard installer or the ordinary update action in updated IDE clients. The installer may be rerun on an existing installation without launchctl or file edits. Never present an old acknowledgement as migration success. |
| Two qualified installs share a commit but have different build paths or raw native artifact bytes | Each matches independent expected execution-bearing bytes under the same tested profile and retains its own raw exact pin. |

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
- **contract** — Verify release signatures, independent expected inventory, applicability, exact runtime coverage, and report provenance.
  - Subjects: `Independent same-commit macOS build equivalence and tamper rejection`, `Changed native code, loadable data, bindings, signature policy, injected modules, symlinks and unidentified variance fail closed`, `Missing or stale release evidence prevents promotion and leaves the incumbent running`
- **smoke** — Require real product builds before promoting a source-built profile.
  - Subjects: `Release publication validates real running and stopped upgrades for every enabled profile`, `Real product passive and recovery job loader arguments, verified broker refusal, data-preserving rollback and subsequent managed update`
  - Fixtures: `Two independent production installer builds of the same supported predecessor in different homes with observed native variance`, `Real predecessor and candidate installs using disposable homes and distinct launchd jobs`, `Qualification from an isolated release authority, plus immutable test receipts bound to promoted release metadata`
- **integration** — Prove trust ordering and rollback fences at the real controller boundaries.
  - Subjects: `Trust rotation, expiry, replay and offline rollback at the fence boundary`, `Invalid or missing authorization prevents bootstrap checkout execution, npm scripts and bridge invocation`, `A competing legacy command and interruption during rollback cannot reopen the launcher before durable outcome`
  - Fixtures: `A trusted installer and distinct trusted/unauthorized signed Git origins with executable marker probes`, `A real archived legacy daemon, fresh and expired signed trust epochs, and controller crash points before outcome and before guarded dispatch`
- **contract** — Cover derived Mach-O layout, signature coverage and preserved runtime semantics.
  - Subjects: `Independent unequal-length debug roots preserve canonical native identity and malformed offsets or codeLimit are rejected`
  - Fixtures: `Two real fs-ext builds with different path lengths and different physical string-table size, __LINKEDIT extent, signature offset and codeLimit`, `Malformed linkedit offsets, unexpected string aliases or padding, truncated CodeDirectory and mismatched codeLimit`
- **integration** — Prove restored old IPC containment and preserve the bounded managed acknowledgement.
  - Subjects: `Real restored legacy update and shutdown RPCs cannot interrupt rollback or a managed retry`, `Managed acknowledgement precedes a preparation exceeding the client deadlines and lost reply cancels only unstarted work`, `Idle public stop and authorized private drain require distinct admission and reconcile exact exit`, `A restored installer reserves before fetch, build or inventory and releases admission on preparation failure`
  - Fixtures: `Actual old predecessor with normal and threaded admin routing and worker replacement, paused before rollback publication and during a later managed preparation`, `Existing managed-update-handoff slow preparation fixture, Unix socket delivery failure and correlated update outcome`, `Use real old main and admin-worker handler paths, including worker replacement. Send JetBrains-compatible shutdown during rollback and later preparation. Verify no marker, helper, scheduled or immediate drain, or exit before authorization. Cover idle stop, forged or stale private drain attempts, competing admission and owner death.`, `Pause the actual restored installer before bridge fetch, during build and during inventory. Send public shutdown through both admin routes. Assert busy with the same PID, selector and launcher. Force verification failure and controller death. Verify admission clears and an ordinary public Stop can then succeed. Assert a public Stop that reserved first prevents preparation.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Fresh install and verified ordinary restart`, `Fresh --no-start and later supervisor start` |
| `ac2` | `Installer and updated CLI, VS Code and JetBrains route matrix`, `First supported update of a qualified prior build with broker denial`, `Direct install and passive recovery job with exact loader argv`, `Old shell/helper concurrent with canonical launcher exchange and old child attempting to open stores` |
| `ac3` | `Running managed update IPC and stopped local managed update`, `Verified stopped and running rollback with configuration and store integrity`, `Uncertain publication with durable success versus no outcome`, `Linux normal install, update and restart unchanged` |
| `ac4` | `Independent same-commit macOS build equivalence and tamper rejection`, `Release publication validates real running and stopped upgrades for every enabled profile`, `Trust rotation, expiry, replay and offline rollback at the fence boundary`, `Invalid or missing authorization prevents bootstrap checkout execution, npm scripts and bridge invocation`, `A competing legacy command and interruption during rollback cannot reopen the launcher before durable outcome`, `Independent unequal-length debug roots preserve canonical native identity and malformed offsets or codeLimit are rejected`, `Real restored legacy update and shutdown RPCs cannot interrupt rollback or a managed retry`, `Managed acknowledgement precedes a preparation exceeding the client deadlines and lost reply cancels only unstarted work`, `Idle public stop and authorized private drain require distinct admission and reconcile exact exit`, `A restored installer reserves before fetch, build or inventory and releases admission on preparation failure` |

## 7. Migration

**State before:** The s1 discovery bundle identified whole-tree prior fingerprint qualification before managed migration. Two builds of the same legacy commit produced different native executable bytes. The configured origin was missing the qualification ref.

**State after:** Current install and update entry points share a migration-capable controller and immutable releases. A supported first upgrade retains the previous release and establishes one verified per-user supervisor. User data remains in the existing state root.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. The release maintainer builds independent references, signs profile and product test receipt digests, and uploads qualification for the exact target commit. A promotion gate verifies the note and reference receipts against the intended head before advancing the channel ref. Publish the note before the branch moves, or publish both atomically. Re-fetch both from the ordinary updater endpoint and confirm the signed head and trust epoch agree. Unsupported profiles remain unavailable. Fixture keys never authorize production. — ↩ rollbackable
2. Use the current standard installer for both fresh installs and first upgrades. Updated VS Code and JetBrains lifecycle Update on unmanaged Darwin dispatch the packaged migration-capable installer in existing-install mode with the configured branch and root. Updated freshness clients route unmanaged Darwin to that same action before sending any daemon.update RPC. A migration-capable shell or TUI starts the same external preflight on ordinary Update. For already-installed binaries that cannot obtain new code before shutdown, the supported first-upgrade action is the current standard installer, including the normal Install action in an updated IDE. No manual service administration is part of that path. The distributed first-stage verifier authenticates the exact bridge commit, tree and build inputs before checkout or running any candidate-controlled instructions. Updated IDEs ship the same first-stage verifier. — ↩ rollbackable
3. For a previously restored legacy installation, acquire the preparation reservation before bridge or candidate fetch, build, or inventory checks. Under that reservation verify and record the incumbent incarnation and running or stopped intent. A concurrent Stop or restart that reserved first makes Update return busy. After admission, public Stop returns busy throughout preparation. Verify signed evidence, stage outside the live root, and pin the raw incumbent and candidate bytes. Refresh trust and revalidate the exact baseline before promoting the same reservation to cutover. Preparation failure or pre-mutation owner death cancels the reservation after proving no installed state changed. An untouched legacy installation still stages before cutover reservation and authenticates its observed baseline before mutation. Fresh install uses explicit activation intent. — ↩ rollbackable
4. For legacy cutover, admit cutover under the existing preparation reservation for a restored legacy route, or acquire the initial cutover reservation for an untouched route, then atomically replace the canonical installed checkout entry with a gate-aware dispatcher while preserving its original directory identity. Recover either side of the exchange by journaled inode evidence. Recheck for in-flight old helpers, update markers, unsupported launch routes, and mismatched job registrations. The dispatcher has no old executable or mutable checkout target. Refuse when the old launcher or writer cannot be excluded. Keep the prior checkout pinned until rollback is no longer needed. — ↩ rollbackable
5. Authenticate the running predecessor over the pinned socket and observe exact exit. While the canonical launcher remains fenced, acquire the legacy-compatible run-file guard before cleanup, reconcile only the recorded publications, and retain the guard until a verified supervisor has adopted it for startup. Transfer owner evidence under the same directory identity with no unguarded interval. Remove a verified passive old job after its child exits. Apply the stored outcome policy for graceful, broker-denied, or unknown exit. — ↩ rollbackable
6. Journal the provisional selector and register the supervisor. Start a child for a normal fresh install or previously running update. Verify idle for --no-start or previously stopped update. Publish the matching durable terminal record before release. An already-managed shell/TUI update uses the external transaction even when stopped, and the running managed RPC uses the detached helper and acknowledgement handshake. For the running managed route the trusted installed helper reserves and acknowledges before it starts fetch or build. Confirm reply delivery before preparation and complete qualification before shutdown. — ↩ rollbackable
7. Recover interrupted activation or cutover using the matching durable outcome. Keep the canonical dispatcher fenced. Reconcile the selector and restore the previous service only through the verified private archive route, then verify exact running or stopped state. Publish the terminal rollback receipt and outcome before the dispatcher resumes guarded legacy commands. Recover an interruption after publication without relaunching the old service. Keep the archived path stable for loaded jobs and later managed retries. Uncertain ownership retains the fence. A durable success is reconciled without rollback. A running predecessor starts only with the pinned admin preload. Route its launcher root to the canonical dispatcher. Keep the obsolete update RPC disabled in both main and admin worker before and after terminal rollback. A later update uses the verified external entry point. Gate restored public shutdown with an atomic stop reservation until exact exit reconciliation. An update owner drains a restored predecessor over its private authenticated adapter channel. A public request during rollback or preparation receives busy before the legacy handler runs. — ↩ rollbackable

**Backward compat:** Preserve the CLI flags, configured source, IDE IPC result shapes, supported user settings, Linux behavior and historical journal decoding. Existing binaries that stop before they can fetch the migration use the current normal installer for the first upgrade. The canonical installed launcher remains a compatible entry point after migration.

## 8. Alternatives considered

### 8.1 a1: Release-signed build verification profiles — **CHOSEN**

Use independent release evidence for portable equivalence and an exact local pin for rollback.

Publish a signed profile per tested predecessor and platform. Verify its complete runtime inventory against an independently built reference using exact hashes by default and bounded deterministic transformations only for verified build variance. Bind the original measured bytes to the cutover journal.

### 8.2 a2: Exact release fingerprints only

Accept an inventory of byte-identical prior builds.

Publish one exact fingerprint for each independently archived prior package and continue requiring an exact installed match.

**Rejected because:** An exact reference fingerprint rejects separately built valid native binaries.

### 8.3 a3: Rebuild a rollback release from the old commit

Use an independently verified replacement rollback build.

Fetch and rebuild the predecessor in a separate directory using pinned release inputs, then use that result as the rollback executable.

**Rejected because:** A replacement rollback build leaves original executable provenance unverified and changes rollback identity.

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
