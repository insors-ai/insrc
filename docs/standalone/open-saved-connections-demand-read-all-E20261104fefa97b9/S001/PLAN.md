<!-- insrc:artifact PLAN-fefa97b991537da7-s1 -->

# Plan: STORY-fefa97b991537da7-s1

## Summary

**Epic:** `open-saved-connections-demand-read-all`
**LLD run:** `wf-1794155046486-rhpg48`
**LLD effective hash:** `675d6e30fa2d...`

The build first stops the daemon reading the Keychain at start, then adds the single-item vault and the first-use copy of old secrets. Worker threads are pointed at the one main-thread owner, and the offline maintenance tool is kept from running alongside a daemon. The last task moves the remaining keystore users across and carries the conditions recorded when the LLD was approved with an override.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Open saved connections on demand instead of at boot | M | — | — | integration: boot: a daemon start reads nothing from the Keychain and opens its socket; integration: on-demand: the first management request opens the repository and a later one does not reopen it; integration: on-demand: a refused Keychain read reports secret-unavailable and the next request retries; integration: on-demand: a refused first-time set-up leaves nothing on disk; integration: on-demand: a plain listing of an unmanaged repository touches nothing; integration: on-demand: shutdown closes every root opened on demand | [[c1]] |
| 2 | **`t2`** Add the single-item vault with validation and a mutation queue | L | — | — | unit: vault: concurrent reads perform one Keychain read; unit: vault: a refused load fails at once for five minutes and then retries; unit: vault: a payload with a bad version, missing secrets, a non-string value or a bad retired list fails closed and is never rewritten; unit: vault: a malformed name or value leaves memory and the stored item unchanged; unit: vault: a name such as __proto__ is stored and read as an ordinary key; unit: vault: a failed write leaves memory unchanged; unit: vault: concurrent saves lose no update; unit: vault: a deleted name is recorded as retired; unit: vault: a retired name saved again is readable; unit: keystore: listKeys never calls findCredentials | [[c2]] |
| 3 | **`t3`** Migrate legacy secrets on first use | M | — | `t2` | unit: migration: a legacy secret is copied once and read from the vault afterwards; unit: migration: concurrent misses of one name share one legacy read and one copy; unit: migration: a save during a legacy read wins and the copy is discarded; unit: migration: a delete during a legacy read wins and the copy is discarded; unit: migration: a failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run; unit: migration: an absent name causes no write and no second lookup in the run; unit: migration: a refused legacy read fails at once for five minutes for that name only and then retries; unit: vault: a retired name does not fall back to its legacy item | [[c3]] |
| 4 | **`t4`** Forward worker keystore calls to the main thread | M | — | `t2` | integration: threads: workers on two threads share one Keychain read; integration: threads: a worker never calls the backend directly; integration: threads: a closed hub channel does not fall back to the Keychain; integration: threads: a save on one worker is visible on another; integration: threads: a malformed request from a worker reports KeystoreInputError | [[c4]] [[c7]] |
| 5 | **`t5`** Guard the vault across the maintenance tool and a daemon | S | — | `t2` | integration: guard: a daemon holding no vault fails requests while maintenance holds the guard and succeeds after release; integration: guard: maintenance refuses and releases the guard when the daemon socket exists after acquiring it; integration: maintenance: the offline tool reads the vault once | [[c5]] |
| 6 | **`t6`** Move the keys handlers and other users onto the vault | S | — | `t2`, `t3`, `t4` | integration: consumers: notify, web and keys handlers read through the vault; integration: ipc: keys.get reports exists:true for an empty saved secret; integration: ipc: keys.set with a non-string value is refused and other secrets stay readable after a restart; live: live: after a node upgrade one dialog appears across several connections and threads once migration is complete | [[c6]] [[c7]] |

### 1.1 TASK-fefa97b991537da7-s1-t1 — Open saved connections on demand instead of at boot

Remove the boot loop, make the main-thread management handlers open a repository on first use, have fresh initialization take its ticket key before its first disk write, and carry a keystore failure's cause to managementRejection.

**Acceptance checks:**
- A daemon start reads nothing from the Keychain and opens its socket
- The first management request opens a repository and a later one does not reopen it
- A refused Keychain read reports secret-unavailable and the next request retries
- A refused first-time set-up leaves nothing on disk
- A plain listing of an unmanaged repository creates no state and reads no secret
- Shutdown still closes every root opened on demand

### 1.2 TASK-fefa97b991537da7-s1-t2 — Add the single-item vault with validation and a mutation queue

Back getKey, setKey, deleteKey and listKeys with one Keychain item under service insrc-vault: single-flight load with a five-minute memory of a failed load, runtime validation of names and values, whole-payload validation on load and before every write, one mutation queue writing the Keychain first and memory after, retirement on delete, and a test-only backend setter below the vault.

**Acceptance checks:**
- Concurrent reads perform one Keychain read
- A refused load fails at once for five minutes and then retries
- An invalid stored payload fails closed and is never rewritten
- A malformed name or value leaves memory and the stored item unchanged
- A name such as __proto__ is an ordinary key
- A failed write leaves memory unchanged and concurrent saves lose no update
- A deleted name is recorded as retired
- A retired name saved again is readable
- listKeys never calls findCredentials

### 1.3 TASK-fefa97b991537da7-s1-t3 — Migrate legacy secrets on first use

For a name absent from the vault, not retired and with no reusable run result, read the legacy item single-flight per name and copy a found value through the mutation queue after re-checking the current state, with per-name run states for a cached value, an absence and a refused read.

**Acceptance checks:**
- A legacy secret is copied once and read from the vault afterwards
- Concurrent misses of one name share one legacy read and one copy
- A save or delete during a legacy read wins and the copy is discarded
- A failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run
- An absent name causes no write and no second lookup in the run
- A refused legacy read fails at once for five minutes for that name only and then retries
- A retired name does not read its legacy item

### 1.4 TASK-fefa97b991537da7-s1-t4 — Forward worker keystore calls to the main thread

Serve the vault to workers through a hub operation and install the forwarder in worker-entry, preserving the owner's KeystoreInputError and mapping only availability and transport failures to KeystoreUnavailableError.

**Acceptance checks:**
- Workers on two threads share one Keychain read
- A worker never calls the backend directly
- A closed hub channel does not fall back to the Keychain
- A save on one worker is visible on another
- A malformed request from a worker reports KeystoreInputError, the same as on the main thread

### 1.5 TASK-fefa97b991537da7-s1-t5 — Guard the vault across the maintenance tool and a daemon

Have the offline maintenance binary take the run-file guard before its pid and socket check and hold it until exit, and have a daemon's vault load fail without touching the Keychain while the guard is held.

**Acceptance checks:**
- A daemon fails requests needing a secret while maintenance holds the guard and succeeds after release
- Maintenance refuses and releases the guard when the daemon socket exists after acquiring it
- The offline tool reads the vault once

### 1.6 TASK-fefa97b991537da7-s1-t6 — Move the keys handlers and other users onto the vault

Make keys.list read through the vault, make keys.get use a null check so an empty saved secret exists, confirm notify, web and tool configuration read through the vault, document in the vault module that a remembered refusal applies during the five-minute cooldown and that legacy items are retained after copying, and refresh the pinned inventory.

**Acceptance checks:**
- Notify, web and keys handlers read through the vault
- keys.get reports exists:true for an empty saved secret
- keys.set with a non-string value is refused and other secrets stay readable after a restart
- The vault module documents the cooldown and the retention of legacy items
- The connection-management inventory matches the changed sources

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vault: concurrent reads perform one Keychain read | `t2` |
| vault: a refused load fails at once for five minutes and then retries | `t2` |
| vault: a payload with a bad version, missing secrets, a non-string value or a bad retired list fails closed and is never rewritten | `t2` |
| vault: a malformed name or value leaves memory and the stored item unchanged | `t2` |
| vault: a name such as __proto__ is stored and read as an ordinary key | `t2` |
| vault: a failed write leaves memory unchanged | `t2` |
| vault: concurrent saves lose no update | `t2` |
| vault: a retired name does not fall back to its legacy item | `t3` |
| vault: a retired name saved again is readable | `t2` |
| migration: a legacy secret is copied once and read from the vault afterwards | `t3` |
| migration: concurrent misses of one name share one legacy read and one copy | `t3` |
| migration: a save during a legacy read wins and the copy is discarded | `t3` |
| migration: a delete during a legacy read wins and the copy is discarded | `t3` |
| migration: a failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run | `t3` |
| migration: an absent name causes no write and no second lookup in the run | `t3` |
| migration: a refused legacy read fails at once for five minutes for that name only and then retries | `t3` |
| keystore: listKeys never calls findCredentials | `t2` |
| threads: workers on two threads share one Keychain read | `t4` |
| threads: a worker never calls the backend directly | `t4` |
| threads: a closed hub channel does not fall back to the Keychain | `t4` |
| threads: a save on one worker is visible on another | `t4` |
| ipc: keys.set with a non-string value is refused and other secrets stay readable after a restart | `t6` |
| guard: a daemon holding no vault fails requests while maintenance holds the guard and succeeds after release | `t5` |
| guard: maintenance refuses and releases the guard when the daemon socket exists after acquiring it | `t5` |
| boot: a daemon start reads nothing from the Keychain and opens its socket | `t1` |
| on-demand: the first management request opens the repository and a later one does not reopen it | `t1` |
| on-demand: a refused Keychain read reports secret-unavailable and the next request retries | `t1` |
| on-demand: a refused first-time set-up leaves nothing on disk | `t1` |
| on-demand: a plain listing of an unmanaged repository touches nothing | `t1` |
| consumers: notify, web and keys handlers read through the vault | `t6` |
| maintenance: the offline tool reads the vault once | `t5` |
| live: after a node upgrade one dialog appears across several connections and threads once migration is complete | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 ensureDefaultManagedRoot and Daemon boot`
- **[[c2]]** `prior-artifact` `LLD s1 SecretVaultItem and In-memory vault`
- **[[c3]]** `prior-artifact` `LLD s1 Per-name run state and Legacy per-item secrets`
- **[[c4]]** `prior-artifact` `LLD s1 Worker keystore forwarding`
- **[[c5]]** `prior-artifact` `LLD s1 Vault run-file guard`
- **[[c6]]** `prior-artifact` `LLD s1 keys.list handler and keystore consumers`
- **[[c7]]** `stakeholder` `Approval override on LLD s1, 2026-11-08` — "Workers preserve KeystoreInputError; keys.get uses a null check; the sequence notes are corrected for the cooldown and the retention of legacy items."
