<!-- insrc:artifact LLD-669ae7a31701e106-S001 -->

# LLD: E20261105669ae7a3:S001

## Summary

**Epic:** `open-saved-connections-demand-read-all`
**HLD base run:** `wf-1793866997587-252c8p`
**HLD effective hash:** `9cfa75910fd8...`

The daemon stops opening every repository's saved connections when it starts, so starting it never touches the macOS Keychain and its socket opens immediately. A repository's saved connections are opened the first time a connection-management request needs them, using the existing per-repository opener that remembers a success and retries after a failure. A first-time set-up that the Keychain refuses now leaves nothing on disk, so the next request simply retries, and a Keychain refusal reaches the client as the existing 'secret-unavailable' error instead of 'recovery-required'. Reducing the number of Keychain prompts to one per run is a separate later Story (user decision 'A', 2026-11-05).

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `ensureDefaultManagedRoot`

```typescript
ensureDefaultManagedRoot(root: string, ports?: StartupPorts): Promise<void>
```

**Parameters:**
- `root: string` — Registered repository whose saved management a request needs.
- `ports: StartupPorts` _(optional)_ — Unchanged registration, keystore and enablement seams; the request handlers use the default (lookupRepoId).

**Returns:** `Promise<void>` — Unchanged contract: resolves once savedManagementFor(root) is installed; memoised per root; a rejected attempt is forgotten so the next call retries. What changes is who calls it: no longer the boot loop, now the main-thread request handlers listed in dataModel.

**Errors:**
- `TicketError('secret-unavailable')` when The Keychain refused or failed reading or creating the root's ticket key (existing mapping in SavedTicketAuthority.open).
- `ManagedStoreError('recovery-required') with cause KeystoreUnavailableError` when A rollback-copy or connection-secret read inside openManagedRoot was refused or failed in the Keychain.
- `ManagedStoreError('recovery-required')` when A legacy unmanaged registry (offline adoption needed), damaged metadata, or any non-keystore integrity failure; unchanged.

**Preconditions:**
- Called on the daemon main thread only (db.* and db.connections.v2.* methods), where the owners memo lives.

**Postconditions:**
- No call is made before server.listen.
- closeDefaultManagedRoots still closes every root opened on demand at shutdown.

### 2.2 `initializeFreshManagedRoot`

```typescript
initializeFreshManagedRoot(root: string, ports: StartupPorts): Promise<void>
```

**Parameters:**
- `root: string` — Registered repository with no registry and no management marker.
- `ports: StartupPorts` — Unchanged seams.

**Returns:** `Promise<void>` — Unchanged result. Changed order: after the existing uid/realpath/registration, enablement, absent-registry and no-marker checks, it generates registryId and calls SavedTicketAuthority.open({ adopted: false }) BEFORE the first filesystem write (parent mkdir/chmod, privateDirectory, proveWriterFence, state-directory mkdir, snapshot, preparing.json). The generated registryId is the one written to preparing.json, the state file and the registry envelope.

**Errors:**
- `TicketError('secret-unavailable')` when The Keychain refused creating or reading back the new ticket key; nothing has been written to disk, and no management marker exists, so the next ensureDefaultManagedRoot runs a clean initialization.
- `ManagedStoreError('recovery-required')` when Any later step fails as today; in addition the freshly created ticket key for the abandoned registryId is deleted best-effort (a failed delete is logged by ref name only and leaves only an unused Keychain item).

**Preconditions:**
- The legacy-registry refusal (before.missing check and managementMarkerExists) still runs before any Keychain access, so a legacy repository never touches the Keychain.

**Postconditions:**
- A Keychain refusal leaves no state directory, snapshot, preparing.json or registry on disk.

### 2.3 `managementRejection`

```typescript
managementRejection(error: unknown): Extract<MutationOutcome, { status: 'rejected' }>
```

**Parameters:**
- `error: unknown` — Any error raised by a management path.

**Returns:** `Extract<MutationOutcome, { status: 'rejected' }>` — As today, except: when the error is a KeystoreUnavailableError, or its `cause` is one, the code is 'secret-unavailable' with message 'Connection credentials are unavailable.'.

**Postconditions:**
- No secret value and no ref value appears in code or message; only the fixed message for the code.

### 2.4 `ManagedStoreError`

```typescript
class ManagedStoreError extends Error { constructor(code: 'registry-unreadable' | 'recovery-required' | 'reconciliation-required' | 'unsupported-filesystem', options?: ErrorOptions | undefined) }
```

**Parameters:**
- `code: 'registry-unreadable' | 'recovery-required' | 'reconciliation-required' | 'unsupported-filesystem'` — Unchanged.
- `options: ErrorOptions | undefined` _(optional)_ — New optional standard `cause`, used only to carry a KeystoreUnavailableError.

**Returns:** `ManagedStoreError` — Unchanged code and message; internal recovery semantics (assertReady, journal pending, retry) are unchanged.

**Postconditions:**
- Existing callers that pass only a code are unaffected.

## 3. Data model changes

### 3.1 `KeystoreUnavailableError (internal error class in src/daemon/db/secrets.ts)` — new

Internal marker `class KeystoreUnavailableError extends Error` (name only, fixed message 'keystore unavailable', the original keytar error as `cause` for debugging; never serialised to a client). Thrown by a small wrapper around the keystore port calls that management code makes: CredentialGenerations.current (src/daemon/db/secrets.ts:210), the staged-value reads and writes in stageSnapshot (:272 and the setKey staging loop), and openManagedRoot's rollback-copy read (src/daemon/db/management-startup.ts:53) and enabled() secret reads (:85). A returned null is NOT a keystore failure and keeps its existing recovery-required meaning. The catch sites at src/daemon/db/secrets.ts:212, :236, :242 and the staging-loop catch at :328 keep throwing ManagedStoreError('recovery-required') but pass the KeystoreUnavailableError as cause when the caught error is or wraps one.

**Call sites:**
- `src/daemon/db/secrets.ts:205-219`
- `src/daemon/db/secrets.ts:221-245`
- `src/daemon/db/secrets.ts:312-321`
- `src/daemon/db/management-startup.ts:53`
- `src/daemon/db/management-startup.ts:85`
- `src/daemon/db/management.ts:62-68`

### 3.2 `Saved management opening (daemon start and request handlers)` — invariant-change

Before: main awaited ensureDefaultManagedRoot for every registered repository before server.listen (src/daemon/index.ts:455-461), reading each repository's ticket key, rollback copies and every connection secret; request handlers assumed a missing service meant recovery/upgrade (owner, safeList) or an unopened managed registry (listConnectionsRpc returns []). After: the loop is deleted; closeDefaultManagedRoots stays in connectionOwners. Rule: a READ opens only an EXISTING managed root, a WRITE or capability probe may also initialize a fresh one. Concretely: owner() (src/daemon/connection-management-rpc.ts:46) awaits ensureDefaultManagedRoot(repoRoot) when savedManagementFor(repoRoot) is unset, swallowing the failure and then keeping its current recovery-required/upgrade-required decision unless the failure is a keystore refusal, which it rethrows so managementRejection reports 'secret-unavailable'; safeList() (:52) does the same only when the registry has a management marker; capabilities (:117) is unchanged (already on demand; failure suppresses mutation features). listConnectionsRpc (src/daemon/db-rpc.ts:79) awaits the open only when a transport is present and the registry has a management marker, and keeps returning [] on failure, logging the rejection code. saveConnection (src/daemon/db-rpc.ts:135) awaits the open for a registered root before reading savedManagementFor; a keystore refusal returns `{ error: 'secret-unavailable: ...' }`; any other failure falls through to today's legacy path. deleteConnection (src/daemon/db-rpc.ts:222) is unchanged: it refuses every managed registry from loaded.file._management and never needs an open service.

**Call sites:**
- `src/daemon/index.ts:455-461`
- `src/daemon/connection-management-rpc.ts:46-51`
- `src/daemon/connection-management-rpc.ts:52-66`
- `src/daemon/connection-management-rpc.ts:117`
- `src/daemon/db-rpc.ts:79`
- `src/daemon/db-rpc.ts:135`
- `src/daemon/db-rpc.ts:222`

### 3.3 `Fresh-root initialization order` — invariant-change

Before: initializeFreshManagedRoot wrote the parent directory, the state directory (a management marker), the owner lease, the snapshot and preparing.json (src/daemon/db/management-defaults.ts:25-40) and only then opened the ticket authority (:41), so a Keychain refusal left a marker and every later open failed as recovery-required. After: the ticket authority is opened right after the read-only checks (:20-24) and before the first write; a failure leaves the disk untouched; a later failure deletes the just-created ticket key best-effort.

**Call sites:**
- `src/daemon/db/management-defaults.ts:19-54`
- `src/daemon/db/management-tickets.ts:99-118`

### 3.4 `db_* data tools (no change)` — invariant-change

Documented non-change, not a code change: withDriver -> savedConnectionResolver -> acquirePool -> DriverPool.reload -> loadConnections reads the committed db-connections.json and resolves only the used connection's secrets at driver build; it never read management state, so it never depended on the boot open (and already ran whenever that open failed). Journal recovery (CredentialGenerations.recover) never rewrites the registry; it only deletes refs the committed registry does not reference, so the registry a data tool reads is consistent whether or not recovery has run. The tools run on session workers; no worker-to-main route is added.

**Call sites:**
- `src/daemon/tools/builtins/db/index.ts:148`
- `src/daemon/db/pool-cache.ts:128-137`
- `src/daemon/db/pool.ts:57-110`
- `src/daemon/db/pool.ts:290-301`
- `src/daemon/db/secrets.ts:336-376`

## 4. Error paths

**Error cases**

- **The user denies the Keychain prompt for a repository's ticket key on its first management request** (recoverable)
  - Detection: SavedTicketAuthority.open catches the rejected keystore.getKey and throws TicketError('secret-unavailable') inside openManagedRoot, which ensureDefaultManagedRoot propagates after forgetting the attempt
  - Response: owner() rethrows it, so managementRejection returns code 'secret-unavailable'; listConnectionsRpc logs the code and returns [] (array contract kept); saveConnection returns { error: 'secret-unavailable: Connection credentials are unavailable.' }; capabilities advertises no mutation features. The next request retries the open.
  - User impact: That request fails with 'Connection credentials are unavailable.'; the daemon and all non-connection work keep running; allowing the prompt on retry works.
- **The Keychain refuses a rollback-copy or connection-secret read during openManagedRoot** (recoverable)
  - Detection: The keystore wrapper in openManagedRoot (rollback read, enabled() secret reads) turns the rejected getKey into KeystoreUnavailableError; the enclosing open rethrows ManagedStoreError('recovery-required', { cause })
  - Response: ensureDefaultManagedRoot forgets the attempt; managementRejection sees the cause and reports 'secret-unavailable'.
  - User impact: Same as above: retryable, reported as unavailable credentials instead of a recovery demand.
- **The Keychain refuses creating the ticket key while a fresh repository is initialised** (recoverable)
  - Detection: SavedTicketAuthority.open({ adopted:false }), now the first side-effecting step of initializeFreshManagedRoot, throws TicketError('secret-unavailable')
  - Response: No directory, marker, snapshot, preparing.json or registry has been written; the error propagates and the attempt is forgotten. The next request runs a clean initialization.
  - User impact: No partial root, no recovery-required state; retrying works.
- **A fresh initialization fails AFTER its ticket key was created (e.g. writer-fence proof fails, or a racing process published a registry)** (recoverable)
  - Detection: Any throw in initializeFreshManagedRoot after SavedTicketAuthority.open
  - Response: As today the error propagates (recovery-required, or the racing writer's root is opened next time); additionally keystore.deleteKey for the abandoned db-management:v2:<registryId>:ticket-key is attempted; a failed delete is logged with the ref name only.
  - User impact: Unchanged outcome; at worst one unused Keychain item remains.
- **A Keychain read or write fails while credentials are staged or checked during a saved upsert** (recoverable)
  - Detection: The keystore wrapper in CredentialGenerations.current / stageSnapshot raises KeystoreUnavailableError, caught at the existing catch sites
  - Response: The catch sites still throw ManagedStoreError('recovery-required') (journal and assertReady semantics unchanged) but with the KeystoreUnavailableError as cause; managementRejection reports 'secret-unavailable'.
  - User impact: The save fails with 'Connection credentials are unavailable.' instead of 'requires recovery'; previous secrets are intact; any pending journal is handled exactly as today.
- **A repository has a legacy unmanaged db-connections.json** (recoverable)
  - Detection: initializeFreshManagedRoot's existing absent-registry check (before.missing false) throws recovery-required before any Keychain access
  - Response: ensureDefaultManagedRoot forgets the attempt; owner()/saveConnection keep today's legacy behaviour (upgrade-required / legacy write path); listConnectionsRpc and safeList do not open at all because there is no management marker.
  - User impact: Unchanged from today; no Keychain prompt.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Daemon start with N registered repositories, some managed | No ensureDefaultManagedRoot call and no keystore access before server.listen; the socket opens immediately. |
| Two concurrent first requests for the same repository | One open, shared through the owners memo; both requests see the same result. |
| db.listConnections for a registered repository with no registry file | Returns [] without creating a managed root and without touching the Keychain. |
| db.listConnections without a transport (internal caller) on a managed registry | Returns [] as today without opening the root. |
| A repository registered after the daemon started | Opened (or initialised fresh) on its first saved upsert, owner() call or capabilities probe, exactly like a repository registered before start. |
| A data tool (db_*) used before any management request in this run | Runs as today: reads the committed registry and resolves only that connection's secrets; the root stays unopened; any pending journal is recovered by the first later management request. |
| Daemon shutdown after roots were opened on demand | closeDefaultManagedRoots closes each of them, as for boot-opened roots today. |

**Invariants to preserve**

- Journal recovery never rewrites the registry; it only deletes refs the committed registry does not reference, and mutations stay refused while a journal is pending (assertReady). [[c2]]
- ensureDefaultManagedRoot memoises one open per root and forgets a failed attempt so a later call retries. [[c3]]
- A legacy unmanaged registry is never adopted online and is refused before any Keychain access. [[c3]]
- The data-tool path reads only the committed registry and the used connection's secrets, on workers, without management state. [[c1]]
- Client-facing rejections carry only a code and its fixed message; no secret or ref value is exposed. [[c5]]
- deleteConnection refuses every managed registry from the file's _management field without an open service. [[c4]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), matching src/daemon/db/__tests__/*.test.ts; the keystore is swapped with _setKeystoreForTests (a counting fake with per-call failure injection), never the OS Keychain`

**Test levels**

- **unit** — Error classification and fresh-initialization ordering against a fake keystore and temp-directory roots.
  - Subjects: `unit: managementRejection maps a KeystoreUnavailableError, and a ManagedStoreError whose cause is one, to 'secret-unavailable' with the fixed message; a plain ManagedStoreError and a null-secret failure stay 'recovery-required'; no secret or ref text in the result`, `unit: initializeFreshManagedRoot with a keystore whose setKey rejects throws TicketError('secret-unavailable') and leaves the repository's directory tree byte-identical (no state directory, snapshot, preparing.json or registry); a second call with a working keystore succeeds`, `unit: initializeFreshManagedRoot that fails after creating its ticket key (writer-fence failure injected) deletes that ticket key from the fake keystore`, `unit: initializeFreshManagedRoot on a legacy registry refuses with zero keystore calls`, `unit: CredentialGenerations.current and stage with a getKey/setKey that rejects throw ManagedStoreError('recovery-required') carrying a KeystoreUnavailableError cause; with getKey returning null they throw without that cause`
  - Fixtures: `A counting fake KeystoreLike (getKey/setKey/deleteKey) with per-call failure injection, installed with _setKeystoreForTests and restored after each test`, `Temp-directory registered roots as in src/daemon/db/__tests__/management-defaults.test.ts`
- **integration** — On-demand opening through the real handlers and real managed roots in temp directories, with the fake keystore.
  - Subjects: `integration: connection-management owner() on an unopened, previously managed root opens it on demand and serves the request as a boot-opened root did`, `integration: safeList and db.listConnections (with a transport) open an existing managed root on demand and return its connections; for a registered root with no registry they return [] with zero keystore calls and no state directory created`, `integration: db.saveConnection on a fresh registered root initialises and opens it on demand and saves; with the keystore refusing it returns 'secret-unavailable: ...' and a retry with a working keystore succeeds`, `integration: a keystore refusal during openManagedRoot's ticket, rollback or connection-secret read reaches the client as 'secret-unavailable' from owner(), and the next request retries the open`, `integration: two concurrent first requests for one root produce exactly one open (one ticket-key read)`, `integration: a db_* data tool (withDriver over savedConnectionResolver) on a managed root that was never opened reads its connections and builds the driver, with keystore reads only for that connection's refs`, `integration: daemon start with a registered repository that has no registry creates no management state before or after the socket opens (spawned test daemon with isolated HOME); this test fails on the pre-change boot loop, which initialises the root at start`
  - Fixtures: `The spawned test daemon harness with an isolated HOME used by the existing daemon tests`, `A managed root fixture created with the fake keystore (initializeFreshManagedRoot + one saved connection)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: daemon start with a registered repository that has no registry creates no management state before or after the socket opens (spawned test daemon with isolated HOME); this test fails on the pre-change boot loop, which initialises the root at start` |
| `ac2` | `integration: connection-management owner() on an unopened, previously managed root opens it on demand and serves the request as a boot-opened root did`, `integration: safeList and db.listConnections (with a transport) open an existing managed root on demand and return its connections; for a registered root with no registry they return [] with zero keystore calls and no state directory created`, `integration: db.saveConnection on a fresh registered root initialises and opens it on demand and saves; with the keystore refusing it returns 'secret-unavailable: ...' and a retry with a working keystore succeeds`, `integration: two concurrent first requests for one root produce exactly one open (one ticket-key read)` |
| `ac3` | `unit: initializeFreshManagedRoot with a keystore whose setKey rejects throws TicketError('secret-unavailable') and leaves the repository's directory tree byte-identical (no state directory, snapshot, preparing.json or registry); a second call with a working keystore succeeds`, `unit: initializeFreshManagedRoot that fails after creating its ticket key (writer-fence failure injected) deletes that ticket key from the fake keystore`, `unit: initializeFreshManagedRoot on a legacy registry refuses with zero keystore calls` |
| `ac4` | `unit: managementRejection maps a KeystoreUnavailableError, and a ManagedStoreError whose cause is one, to 'secret-unavailable' with the fixed message; a plain ManagedStoreError and a null-secret failure stay 'recovery-required'; no secret or ref text in the result`, `unit: CredentialGenerations.current and stage with a getKey/setKey that rejects throw ManagedStoreError('recovery-required') carrying a KeystoreUnavailableError cause; with getKey returning null they throw without that cause`, `integration: a keystore refusal during openManagedRoot's ticket, rollback or connection-secret read reaches the client as 'secret-unavailable' from owner(), and the next request retries the open` |
| `ac5` | `integration: a db_* data tool (withDriver over savedConnectionResolver) on a managed root that was never opened reads its connections and builds the driver, with keystore reads only for that connection's refs` |

## 6. Migration

**State before:** At daemon start main awaits ensureDefaultManagedRoot for every registered repository before server.listen (src/daemon/index.ts:455-461), so each start reads every managed repository's ticket key, rollback copies and connection secrets and initialises a fresh managed root for every registered repository without a registry. initializeFreshManagedRoot writes its state directory, snapshot and preparing.json before obtaining the ticket key (src/daemon/db/management-defaults.ts:25-41). Keystore failures in CredentialGenerations and openManagedRoot surface as recovery-required with no cause (src/daemon/db/secrets.ts:212,236,242,328; src/daemon/db/management-startup.ts:53,85), and managementRejection cannot tell them apart (src/daemon/db/management.ts:62-68).

**State after:** Daemon start opens no managed root and touches no Keychain item. The main-thread management handlers open a repository on its first request through the memoised ensureDefaultManagedRoot (reads open only an existing managed root; writes and capability probes may initialise a fresh one). Fresh initialisation obtains the ticket key before writing to disk. Keystore failures keep their internal recovery-required semantics but carry a KeystoreUnavailableError cause, and clients receive 'secret-unavailable'. Data tools are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional ErrorOptions cause to ManagedStoreError and the internal KeystoreUnavailableError; wrap the keystore port calls in CredentialGenerations and openManagedRoot so a thrown keystore error becomes the cause of the existing recovery-required error; teach managementRejection to report 'secret-unavailable' for that cause. — ↩ rollbackable
2. Reorder initializeFreshManagedRoot so the registryId is generated and SavedTicketAuthority.open runs before the first filesystem write, with best-effort deletion of that new ticket key on any later failure. — ↩ rollbackable
3. Add the on-demand ensureDefaultManagedRoot call to owner(), safeList(), listConnectionsRpc and saveConnection per the read/write rule; leave capabilities and deleteConnection as they are. — ↩ rollbackable
4. Delete the boot loop in main; keep closeDefaultManagedRoots in connectionOwners for shutdown. — ↩ rollbackable

**Backward compat:** No on-disk or wire format change: existing managed roots, legacy registries and Keychain items are used as they are, and the daemon can be rolled back to the previous build at any time. 'secret-unavailable' is an existing wire code that clients already render; some failures that were reported as 'recovery-required' are now reported as 'secret-unavailable'. Repositories without a registry are no longer initialised at daemon start but on their first saved write or capability probe; until then db.listConnections returns [] for them, which is the same answer an empty managed registry gave.

## 7. Alternatives considered

### 7.1 a1: Open on first management request through the existing memoised opener — **CHOSEN**

Delete the boot loop; the main-thread management handlers that need an open service await ensureDefaultManagedRoot first; fresh initialization takes its ticket key before writing to disk; keystore failures carry their cause to managementRejection. Data tools unchanged.

Boot: remove the for-loop at src/daemon/index.ts:455-461 (closeDefaultManagedRoots stays registered for shutdown). On demand: the main-thread handlers that need an open service await the memoised ensureDefaultManagedRoot(root) (forgets failures) and then read savedManagementFor(root). Callers: owner() and safeList() in src/daemon/connection-management-rpc.ts, listConnectionsRpc (only when a transport is present and the registry carries a management marker, so a plain listing of an unmanaged or absent registry never creates state or touches the Keychain) and saveConnection (registered root) in src/daemon/db-rpc.ts; capabilities already does this. deleteConnection needs no open: it already refuses every managed registry from the file's _management field. Fresh init: in initializeFreshManagedRoot, generate registryId and call SavedTicketAuthority.open (adopted:false) right after the absent-registry and marker checks and before the first chmod/mkdir/write; on any later failure delete that freshly created ticket key best-effort. Cause: ManagedStoreError gains an optional ErrorOptions cause; the keystore port calls in CredentialGenerations.current/stage/prepareRemoval and openManagedRoot's rollback and enabled() reads wrap a thrown keystore error as KeystoreUnavailableError and the catch sites keep throwing recovery-required but with that cause; managementRejection reports 'secret-unavailable' when the error or its cause is a KeystoreUnavailableError. Data tools: unchanged, because they never read management state and journal recovery never rewrites the registry they read.

### 7.2 a2: a1 plus a recovery gate on the data-tool path

As a1, and additionally make DriverPool.reload refuse a managed registry whose preparation journal has pending records, as a metadata-only check on the worker.

Everything in a1. In addition, DriverPool.reloadNow (src/daemon/db/pool.ts:70) checks, when file._management is present, whether the PreparationJournal for that registryId has pending records (a file read, no Keychain) and throws ConnectionUseError('recovery-required') if so, so a data tool never runs against a root whose staging has not been recovered. Works on any thread without a worker-to-main route because it only reads files.

**Rejected because:** Same as a1 plus a gate that adds a new failure mode without protecting the data the tools read.

### 7.3 a3: Make savedManagementFor itself lazy and async

Turn savedManagementFor(root) into an async accessor that opens the root on first call, so every reader opens implicitly.

Change savedManagementFor in src/daemon/db/management.ts to `async savedManagementFor(root)` that awaits ensureDefaultManagedRoot when no service is installed, and update every caller (ensureDefaultManagedRoot's own early return, the RPC readers, deleteConnection) to await it.

**Rejected because:** Opens roots for readers that need no service, touching the Keychain more than a1, and creates an accessor cycle.

### 7.4 a4: Keep eager opening but run it after the socket listens

Move the boot loop after server.listen so the socket opens first, still opening every registered root in the background.

Move src/daemon/index.ts:455-461 after server.listen and run it without awaiting, logging failures as today.

**Rejected because:** Does not meet the fix intent.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work: db_* data-tool read path, thread and independence from the managed-root open`
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work: journal recovery never rewrites the registry`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate: ensureDefaultManagedRoot, initializeFreshManagedRoot, openManagedRoot, SavedTicketAuthority.open`
- **[[c4]]** `analyze-bundle` `s1 usage.example: every savedManagementFor reader and its fallback`
- **[[c5]]** `analyze-bundle` `s1 symbol.locate: managementRejection and the management error classes`
- **[[c6]]** `analyze-bundle` `s1 test.locate: tests to extend`
- **[[c7]]** `code` `src/daemon/index.ts:456` — "for (const registered of await listRepos(db)) {"
- **[[c8]]** `code` `src/daemon/db/management-defaults.ts:41` — "const tickets=await SavedTicketAuthority.open({root,registryId,adopted:false,keystore:ports.keystore??credentialKeystore,isRegistered:ports.isRegistered});"
- **[[c9]]** `code` `src/daemon/db/secrets.ts:242` — "catch {"
- **[[c10]]** `code` `src/daemon/db/management-startup.ts:85` — "if (!generations.owns(ref) || await keystore.getKey(ref) === null)"
- **[[c11]]** `code` `src/daemon/connection-management-rpc.ts:117` — "if(!savedManagementFor(repoRoot)&&!testPorts.sessionRuntime){try{await ensureDefaultManagedRoot(repoRoot);}catch{/* Existing legacy data or damaged metadata still needs recovery. */}}"
- **[[c12]]** `stakeholder` `User decision 'A' (split) on 2026-11-05 after LLD-669ae7a31701e106-S001 review round 3: this Story is on-demand opening only; the one-prompt vault is a separate Story`
- **[[c13]]** `prior-artifact` `ISSUE-fefa97b991537da7`

## 9. Open questions

- Scope refinement (stakeholder decision 'A', 2026-11-05, after design review round 3 of this LLD): ISSUE-fefa97b991537da7 fix intent 3 (at most one Keychain prompt per daemon run for every saved credential, including tool configuration, notify and web keys) is NOT delivered here; it moves to a separate later tracked Story (a connection vault). Until it ships, the first management request for a managed repository can still prompt once per Keychain item of that repository (ticket key, rollback copies, connection secrets), but a daemon start prompts for nothing.
- Carry-over lessons for that vault Story from rounds 2-3 of this LLD: use a separate Keychain service or enforce a reserved account across keys.get/set/delete/list; do not inventory legacy items with keytar findCredentials (on macOS it reads every secret and returns empty pairs on a refused read); define a rollback for a failed or partial migration.
