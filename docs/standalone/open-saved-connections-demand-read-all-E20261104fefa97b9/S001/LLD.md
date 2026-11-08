<!-- insrc:artifact LLD-fefa97b991537da7-s1 -->

# LLD: STORY-fefa97b991537da7-s1 — Open saved connections on demand and read all credentials with one keychain prompt per daemon run

## Summary

**Epic:** `open-saved-connections-demand-read-all`
**HLD base run:** `wf-1794155046486-rhpg48`
**HLD effective hash:** `675d6e30fa2d...`

The daemon stops touching the Keychain when it starts, and opens a repository's saved connections the first time a request needs them. All secrets move into one Keychain item that the main thread reads once per daemon run and serves to every thread from memory. By stakeholder decision A (2026-11-08) these exceptions to one prompt are accepted: each existing per-item secret prompts when it is successfully copied across, because macOS guards each old item separately; a failed copy or a denied dialog can prompt again on a later attempt; and a save may show one more dialog if the first was answered Allow rather than Always Allow.

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

### 2.1 `getKey`

```typescript
getKey(name: string): Promise<string | null>
```

**Parameters:**
- `name: string` — Secret name, unchanged from today's account names.

**Returns:** `Promise<string | null>` — The secret from the vault held in memory or from this run's cached legacy value, or null when no such secret exists.

**Errors:**
- `KeystoreInputError` when The name is not a non-empty string. Nothing is read.
- `KeystoreUnavailableError` when The vault could not be loaded or validated, the offline maintenance tool holds the vault guard, or this name's legacy read failed. The cause is carried. Other requests are not blocked.

**Preconditions:**
- On a session worker the call is forwarded over the worker's hub channel; only the owning thread calls keytar.

**Postconditions:**
- At most one Keychain read of the vault item per successful daemon run, across all threads and concurrent callers.
- A name absent from the vault, not retired and with no reusable run result has at most one legacy lookup in flight, and at most one successful legacy read per run.

### 2.2 `setKey`

```typescript
setKey(name: string, value: string): Promise<void>
```

**Parameters:**
- `name: string` — Secret name.
- `value: string` — Secret value.

**Returns:** `Promise<void>` — Resolves after the vault item is written and memory updated.

**Errors:**
- `KeystoreInputError` when The name is not a non-empty string or the value is not a string, checked at runtime at the vault owner because IPC params are only cast. Nothing is written and memory is unchanged.
- `KeystoreUnavailableError` when The vault could not be loaded or written. Memory keeps its previous value.

**Preconditions:**
- Runs in the owner's single mutation queue.

**Postconditions:**
- The candidate payload passes the same validation as a load before it is written, so a write can never produce an item that later fails to load.
- The Keychain item is written first; memory changes only after that succeeds.
- Any run state held for the name is cleared and the name leaves the retired list.

### 2.3 `deleteKey`

```typescript
deleteKey(name: string): Promise<void>
```

**Parameters:**
- `name: string` — Secret name.

**Returns:** `Promise<void>` — Resolves after the name is removed from the vault and recorded as retired.

**Errors:**
- `KeystoreInputError` when The name is not a non-empty string. Nothing is written and memory is unchanged.
- `KeystoreUnavailableError` when The vault could not be loaded or written. Memory is unchanged.

**Preconditions:**
- Runs in the owner's single mutation queue.

**Postconditions:**
- The name is recorded as retired, so a leftover legacy item or an in-flight copy cannot bring it back.
- The legacy item is deleted best effort; a failure is logged by name only.

### 2.4 `listKeys`

```typescript
listKeys(): Promise<string[]>
```

**Returns:** `Promise<string[]>` — Names held in the vault. A legacy item not yet copied in is not listed until it is first used or set.

**Errors:**
- `KeystoreUnavailableError` when The vault could not be loaded.

**Postconditions:**
- keytar.findCredentials is no longer called anywhere.

### 2.5 `ensureDefaultManagedRoot`

```typescript
ensureDefaultManagedRoot(root: string, ports?: StartupPorts): Promise<void>
```

**Parameters:**
- `root: string` — Registered repository whose saved management a request needs.
- `ports: StartupPorts` _(optional)_ — Unchanged registration, keystore and enablement seams.

**Returns:** `Promise<void>` — Unchanged: resolves once saved management for the root is installed, memoised per root; a rejected attempt is forgotten so the next call retries. What changes is the caller: the boot loop is removed and the main-thread request handlers call it.

**Errors:**
- `TicketError('secret-unavailable')` when The Keychain refused or failed reading or creating the root's ticket key.
- `ManagedStoreError('recovery-required') with cause KeystoreUnavailableError` when A rollback-copy or connection-secret read failed in the Keychain; managementRejection reports it as 'secret-unavailable' from the cause.
- `ManagedStoreError('recovery-required')` when A legacy unmanaged registry, damaged metadata or any other integrity failure; unchanged.

**Preconditions:**
- Called on the daemon main thread only, by owner and safeList and the listing and save paths, as capabilities already does.

**Postconditions:**
- No call is made before server.listen, so a daemon start reads nothing from the Keychain.
- Fresh initialization takes its ticket key before its first disk write, so a refused Keychain read leaves no partial state.
- closeDefaultManagedRoots still closes every root opened on demand at shutdown.

## 3. Data model changes

### 3.1 `SecretVaultItem` — new

One Keychain item under the new service 'insrc-vault', reserved account 'secrets', with a value of JSON: version 1, secrets (a map of name to value) and retired (names deleted after the vault existed). The separate service means keys.get, keys.set, keys.delete and keys.list can never address the vault item itself. The whole payload is validated on load and before every write: an object with version exactly 1, secrets an object whose values are all strings, retired an array of unique strings, and no name in both. Entries are held in a Map, so an arbitrary account name such as __proto__ is an ordinary key. A validation failure on load is fail-closed: the item is never overwritten and reads report KeystoreUnavailableError.

```
+ service insrc-vault, account secrets: { version: 1, secrets: Record<string, string>, retired: string[] }
```

**Call sites:**
- `src/shared/keystore.ts:10-40`

### 3.2 `In-memory vault` — new

Owned by the main thread, or by the offline maintenance process. Names and values are checked at runtime at this boundary, on every thread's request, because the keys handlers only cast their IPC params. Load is single-flight, so a pending dialog holds one load and concurrent callers await it. A refused or failed load is remembered for five minutes, in which reads fail at once with KeystoreUnavailableError, so a user who denies access is not prompted by every following request. Every change to the vault, including a migration copy, runs in one mutation queue that writes the Keychain item first and memory only after success. Decrypted values stay in memory and pass between threads only over the in-process hub channel; nothing decrypted is written to disk or logged.

**Call sites:**
- `src/shared/keystore.ts:10-40`
- `src/daemon/threads/main-services.ts:207`
- `src/daemon/threads/worker-entry.ts:81`
- `src/daemon/handler-runtime.ts:1474-1503`

### 3.3 `Per-name run state` — new

In memory for the run only, for a name absent from the vault and not retired. Lookup in flight: one legacy read per name, shared by concurrent callers. Copied: the found value entered the vault and the state is dropped; this is the successful copy after which the name never reads its legacy item again. Cached value: the read succeeded but the copy failed, so this run's later reads are served from memory with no further Keychain access and the copy is retried on the next run, where the legacy read can prompt again. Absent: the legacy item does not exist, so null is returned for the rest of the run with no write. Failed: the legacy read was refused, so reads of that name fail at once for five minutes and then retry, which can prompt again. Both retries are accepted exceptions under decision A. A setKey or deleteKey clears the name's state. A copy happens only for a found value and commits inside the mutation queue only if the name is still neither in the vault nor retired, so a copy that lost a race with a save or delete is discarded.

**Call sites:**
- `src/shared/keystore.ts:10-40`

### 3.4 `Worker keystore forwarding` — new

A hub operation served by the main thread through serveHub for get, set, delete and list; worker-entry installs the forwarder, so getKey and its siblings keep their signatures on every thread. With daemon.threads.enabled off, the main thread uses the vault directly. No RPC method is added, so the method-class table is unchanged.

**Call sites:**
- `src/daemon/threads/channel.ts:117`
- `src/daemon/threads/main-services.ts:207`
- `src/daemon/threads/worker-entry.ts:81`
- `src/daemon/threads/method-class.ts:142-160`

### 3.5 `Vault run-file guard` — new

A guard directory under ~/.insrc, created with acquireRunFileGuard. The offline maintenance binary acquires it first, then performs its existing pid and socket absence check, and holds it until exit. A daemon checks runFileGuardConflict before loading the vault and fails with KeystoreUnavailableError while it is held, without touching the Keychain and without the five-minute memory. The ordering closes the race: a daemon only loads the vault after its socket is open, so a maintenance run that acquires the guard either sees that socket and refuses, or holds the guard before the daemon's first load. A maintenance crash leaves the guard in place, fail-closed, and the error names its path for an operator to clear, as run-file guards already do.

**Call sites:**
- `src/bin/insrc-connection-maintenance.ts:14-24`
- `src/shared/daemon-run-files.ts:52`
- `src/shared/daemon-run-files.ts:64`

### 3.6 `Legacy per-item secrets` — invariant-change

Items under service 'insrc' stop being the source of truth once copied, and migration never deletes them, so a failed or partial migration leaves them readable. Only an explicit deleteKey removes one. Abandoning the vault is a recovery that loses data: see the migration section.

**Call sites:**
- `src/shared/keystore.ts:10-40`
- `src/daemon/db/secrets.ts:26-44`

### 3.7 `keys.list handler` — invariant-change

Today it runs one Keychain read per name; it now reads names and values through the vault. No in-repo client calls keys.list today.

**Call sites:**
- `src/daemon/handler-runtime.ts:1474-1503`

### 3.8 `Daemon boot` — invariant-change

Today the daemon opens every registered repository before server.listen; that loop is removed, and closeDefaultManagedRoots stays registered for shutdown.

**Call sites:**
- `src/daemon/index.ts:470-476`
- `src/daemon/index.ts:539`

## 4. Diagrams

- [Sequence diagram](docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **A save, delete or read arrives with a malformed name or value** (recoverable)
  - Detection: The runtime type check at the vault owner boundary fails
  - Response: KeystoreInputError; the mutation queue is not entered and neither memory nor the Keychain changes.
  - User impact: That request fails; other secrets stay readable.
- **The user denies the Keychain dialog, or the Keychain read of the vault item fails** (recoverable)
  - Detection: keytar.getPassword rejects during the single-flight vault load
  - Response: Every waiting caller gets KeystoreUnavailableError with the cause. The failure is remembered for five minutes, in which reads fail at once without a dialog; the next read after that retries.
  - User impact: Requests needing a secret report the connection unavailable with the cause; requests needing no secret continue.
- **The vault item fails validation on load** (recoverable)
  - Detection: JSON parsing, the version check or the whole-payload shape check fails after a successful Keychain read
  - Response: Fail closed: KeystoreUnavailableError, the item is never rewritten and no legacy fallback is used, so a damaged item cannot be replaced by a partial one.
  - User impact: Saved secrets are unavailable until the item is repaired or deliberately abandoned.
- **A candidate payload fails validation before a write** (recoverable)
  - Detection: The same whole-payload check runs on the candidate inside the mutation queue
  - Response: KeystoreUnavailableError; nothing is written and memory is unchanged.
  - User impact: The save fails and the existing vault stays readable.
- **The offline maintenance tool holds the vault guard when a daemon needs a secret** (recoverable)
  - Detection: runFileGuardConflict reports the guard before the vault load
  - Response: KeystoreUnavailableError naming the guard, with no Keychain access and no five-minute memory, so the first request after the guard is released succeeds.
  - User impact: Requests needing a secret fail until maintenance ends; a crashed maintenance run leaves the guard for an operator to clear.
- **The maintenance tool finds the daemon running after taking the guard** (recoverable)
  - Detection: The existing pid and socket absence check, now made after the guard is acquired, finds a file
  - Response: The tool releases the guard and exits with its existing failure message, without touching the vault.
  - User impact: Maintenance does not run; management stays disabled pending recovery as today.
- **Writing the vault item fails on a save or delete** (recoverable)
  - Detection: keytar.setPassword rejects inside the mutation queue
  - Response: KeystoreUnavailableError to that caller; memory keeps its previous value, so memory and Keychain stay consistent.
  - User impact: The save reports failure and the old value remains in force.
- **Copying a legacy secret into the vault fails** (recoverable)
  - Detection: keytar.setPassword rejects inside the mutation queue after the legacy read found a value
  - Response: The value is kept as this run's cached value for the name and returned; the legacy item is untouched and the copy is retried on the next run.
  - User impact: None this run; that name's legacy read on the next run can prompt again, an accepted exception under decision A.
- **A legacy item read is refused during migration** (recoverable)
  - Detection: keytar.getPassword on the legacy service rejects
  - Response: KeystoreUnavailableError for that name only, remembered for five minutes per name; the vault and other names are unaffected.
  - User impact: That connection is reported unavailable with the cause and is not re-prompted by each following request; the retry after five minutes can prompt again, an accepted exception under decision A.
- **Opening a repository's saved connections fails on first use** (recoverable)
  - Detection: ensureDefaultManagedRoot rejects with a keystore cause or an integrity failure
  - Response: The rejected attempt is forgotten, the request gets 'secret-unavailable' for a keystore cause and 'recovery-required' otherwise; fresh initialization has written nothing if its ticket key could not be taken.
  - User impact: That repository's request fails with its cause; the daemon and other repositories are unaffected.
- **A worker's hub call to the vault owner fails or the channel closes** (recoverable)
  - Detection: The hub request rejects on the worker
  - Response: KeystoreUnavailableError with the cause; the worker does not fall back to calling keytar itself.
  - User impact: That request fails; no extra Keychain access occurs.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No vault item exists yet | keytar returns null with no dialog for a missing item; the vault starts empty and the item is created on the first write. |
| A name exists nowhere, such as an unset web search key | getKey returns null; the absence is remembered for the run, not persisted, so a lookup causes no write. |
| A save or delete lands while a legacy read for the same name is in flight | The save or delete wins; the copy finds the name in the vault or retired inside the mutation queue and is discarded. |
| Two callers miss the same name at once | They share one legacy read and one copy. |
| A name is deleted and an old legacy item for it remains | The retired list stops the legacy fallback, and getKey returns null with no legacy read. |
| A retired name is saved again | setKey adds it to secrets and removes it from retired. |
| An account name such as __proto__ or constructor | It is an ordinary key, because entries are held in a Map. |
| An empty string as a secret value | It is a valid string and is stored; only a non-string value is refused. |
| Many threads ask for different secrets while the first dialog is open | They wait on the one load; exactly one Keychain read of the vault occurs and requests needing no secret do not wait. |
| daemon.threads.enabled is false | The main thread uses the vault directly with the same behaviour. |
| A plain listing of a repository with no management marker | No state is created and the Keychain is not touched. |

**Invariants to preserve**

- getKey, setKey, deleteKey and listKeys keep their signatures, and the KeystoreLike port and its test seam keep working. [[c1]]
- ensureDefaultManagedRoot stays memoised per root and forgets a failed attempt. [[c3]]
- The CLI never opens the Keychain; only daemon code and the daemon-owned offline maintenance binary do. [[c4]]
- Hub traffic stays in-process between the main thread and its workers. [[c5]]
- A daemon shutdown still closes every root that was opened. [[c3]]

## 6. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — The vault's load, read, write, retire, validation, ordering and failure rules against a fake Keychain backend injected below the vault that counts calls.
  - Subjects: `vault: concurrent reads perform one Keychain read`, `vault: a refused load fails at once for five minutes and then retries`, `vault: a payload with a bad version, missing secrets, a non-string value or a bad retired list fails closed and is never rewritten`, `vault: a malformed name or value leaves memory and the stored item unchanged`, `vault: a name such as __proto__ is stored and read as an ordinary key`, `vault: a failed write leaves memory unchanged`, `vault: concurrent saves lose no update`, `vault: a retired name does not fall back to its legacy item`, `vault: a retired name saved again is readable`, `migration: a legacy secret is copied once and read from the vault afterwards`, `migration: concurrent misses of one name share one legacy read and one copy`, `migration: a save during a legacy read wins and the copy is discarded`, `migration: a delete during a legacy read wins and the copy is discarded`, `migration: a failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run`, `migration: an absent name causes no write and no second lookup in the run`, `migration: a refused legacy read fails at once for five minutes for that name only and then retries`, `keystore: listKeys never calls findCredentials`
  - Fixtures: `A fake Keychain backend that counts reads and writes, can refuse them and can hold a read open, installed through a test-only setter below the vault`
- **integration** — Thread ownership, process exclusion, on-demand opening and error mapping in real processes, with the fake backend installed below the vault in the process that owns it.
  - Subjects: `threads: workers on two threads share one Keychain read`, `threads: a worker never calls the backend directly`, `threads: a closed hub channel does not fall back to the Keychain`, `threads: a save on one worker is visible on another`, `ipc: keys.set with a non-string value is refused and other secrets stay readable after a restart`, `guard: a daemon holding no vault fails requests while maintenance holds the guard and succeeds after release`, `guard: maintenance refuses and releases the guard when the daemon socket exists after acquiring it`, `boot: a daemon start reads nothing from the Keychain and opens its socket`, `on-demand: the first management request opens the repository and a later one does not reopen it`, `on-demand: a refused Keychain read reports secret-unavailable and the next request retries`, `on-demand: a refused first-time set-up leaves nothing on disk`, `on-demand: a plain listing of an unmanaged repository touches nothing`, `consumers: notify, web and keys handlers read through the vault`, `maintenance: the offline tool reads the vault once`
  - Fixtures: `A node --import test preload that installs the fake backend in a spawned daemon or maintenance process, so no production switch is added, and that throws if the backend is called on a worker`, `A temporary repository with seeded saved connections`
- **live** — The real macOS behaviour no fake can show, run by a person.
  - Subjects: `live: after a node upgrade one dialog appears across several connections and threads once migration is complete`
  - Fixtures: `A macOS login Keychain with several saved connections`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `boot: a daemon start reads nothing from the Keychain and opens its socket`, `on-demand: the first management request opens the repository and a later one does not reopen it`, `on-demand: a refused Keychain read reports secret-unavailable and the next request retries` |
| `ac2` | `vault: concurrent reads perform one Keychain read`, `threads: workers on two threads share one Keychain read`, `threads: a save on one worker is visible on another`, `migration: a failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run`, `migration: a refused legacy read fails at once for five minutes for that name only and then retries`, `live: after a node upgrade one dialog appears across several connections and threads once migration is complete` |
| `ac3` | `consumers: notify, web and keys handlers read through the vault`, `maintenance: the offline tool reads the vault once`, `guard: a daemon holding no vault fails requests while maintenance holds the guard and succeeds after release` |
| `ac4` | `migration: a legacy secret is copied once and read from the vault afterwards`, `migration: a save during a legacy read wins and the copy is discarded`, `migration: a delete during a legacy read wins and the copy is discarded`, `vault: a malformed name or value leaves memory and the stored item unchanged`, `ipc: keys.set with a non-string value is refused and other secrets stay readable after a restart` |

## 7. Migration

**State before:** Each secret is its own Keychain item under service 'insrc', read through keytar on every use (s1 symbol.locate), and main() opens every repository's saved connections before server.listen (s1 usage.example).

**State after:** One vault item under service 'insrc-vault' holds every secret and is read once per daemon run by the main thread; saved connections open on first use. Legacy items remain until an explicit delete.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Ship the vault with the legacy fallback: a name absent from the vault, not retired and with no reusable run result is read from its legacy item and, when a value is found, copied in on first use. — ↩ rollbackable
2. Remove the boot loop and open saved connections on first request. — ↩ rollbackable
3. Each legacy secret is copied into the vault the first time it is used; a successful copy shows at most one dialog for that item and that name never reads its legacy item again. A failed copy or a denied dialog can prompt again on a later attempt (accepted exceptions, stakeholder decision A). No legacy item is deleted by migration. Once any secret has been saved or deleted through the vault, going back loses data, as step 4 states. — ✕ non-rollbackable
4. Recovery if the vault must be abandoned: delete the single vault item, or run the previous daemon version; both read the untouched legacy items. This is not a clean rollback. A secret first saved after migration is lost and must be re-entered; a secret changed after migration reverts to its older legacy value; a secret deleted after migration whose best-effort legacy delete failed comes back and must be deleted again. — ✕ non-rollbackable

**Backward compat:** getKey, setKey, deleteKey and listKeys keep their signatures and the KeystoreLike port and test seam are unchanged. A malformed name or value is now refused with KeystoreInputError where keytar refused it before. listKeys now reports vault names only, so a legacy item appears after first use; no in-repo client calls keys.list. A previous daemon version keeps reading legacy items and does not see the vault, with the losses stated in step 4.

## 8. Alternatives considered

### 8.1 a1: One Keychain item holding every secret, owned by the main thread — **CHOSEN**

A JSON map of all secrets lives in one Keychain item under a new service; the main thread loads it once on first need and serves every thread from memory.

getKey, setKey, deleteKey and listKeys keep their signatures but use a vault: one Keychain item under a new service whose value is a versioned JSON map of name to secret. The first read loads it once, single-flight, and later reads come from memory. Workers forward over their existing hub channel, so only one thread touches the Keychain. The owner validates every name and value, and every change to the vault, including a migration copy, runs through one mutation queue that writes the item first and memory only after success. A name absent from the vault, not retired and with no reusable run result is read from its legacy item, single-flight per name, and a found value is copied in through that queue after re-checking the current state, so a stale copy cannot overwrite a save or undo a delete. Legacy items stay readable. The offline maintenance tool holds a cross-process guard for its whole run. The boot loop is removed and saved connections open on demand.

### 8.2 a2: One Keychain master key with secrets in an encrypted file

The Keychain holds only an AES key; secrets live in an AES-GCM file under ~/.insrc, so saving a secret never touches the Keychain after the first read.

The vault keeps the same read and write surface and the same main-thread ownership, but its single Keychain item holds a random 256-bit key. Secrets are stored in one AES-GCM encrypted file written atomically under ~/.insrc; the key is read once per run and writes only re-encrypt the file. Migration and on-demand opening are as in a1.

**Rejected because:** Removes the save dialog but moves secrets to a new encrypted store, and is only partial on lossless migration; the stakeholder declined it in decision A.

### 8.3 a3: One Keychain item cached separately on each thread

The smallest change: the keystore module caches the single item in module scope, so each thread that needs a secret loads it for itself.

The keystore module holds the consolidated map in a module-level variable with no cross-thread forwarding. The main thread and each session worker load the item on their own first read and keep their own copy. Writes go to the Keychain and update only the writing thread's copy.

**Rejected because:** Violates the one-prompt requirement: each thread does its own Keychain access and holds a stale copy after a write.

## 9. References

- **[[c1]]** `code` `src/shared/keystore.ts:10-40`
- **[[c2]]** `code` `src/daemon/db/secrets.ts:26-44`
- **[[c3]]** `code` `src/daemon/db/management-defaults.ts`
- **[[c4]]** `code` `src/bin/insrc-connection-maintenance.ts:14-30`
- **[[c5]]** `code` `src/daemon/threads/channel.ts:117`
- **[[c6]]** `code` `src/daemon/index.ts:470-476`
- **[[c7]]** `code` `src/daemon/threads/method-class.ts:142-160`
- **[[c8]]** `code` `src/shared/daemon-run-files.ts:64`
- **[[c9]]** `prior-artifact` `ISSUE-fefa97b991537da7`
- **[[c10]]** `prior-artifact` `LLD-669ae7a31701e106-S001`
- **[[c11]]** `stakeholder` `Decision A, 2026-11-08` — "Keep one Keychain item holding everything; accept that each legacy item prompts when successfully copied, that a failed copy or a denied dialog can prompt again on a later attempt, and that a save may"
