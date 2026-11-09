<!-- insrc:artifact TESTS-fefa97b991537da7-s1 -->

# Tests: fefa97b991537da7 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 35 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T17:11:18.840Z on commit `3260a9940`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: boot: a daemon start reads nothing from the Keychain and opens its socket**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | boot: a daemon start reads nothing from the Keychain and opens its socket | `src/daemon/__tests__/on-demand-open.test.ts` |

**integration: on-demand: the first management request opens the repository and a later one does not reopen it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on-demand: the first management request opens the repository and a later one does not reopen it | `src/daemon/__tests__/on-demand-open.test.ts` |

**integration: on-demand: a refused Keychain read reports secret-unavailable and the next request retries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on-demand: a refused Keychain read reports secret-unavailable and the next request retries | `src/daemon/__tests__/on-demand-open.test.ts` |

**integration: on-demand: a refused first-time set-up leaves nothing on disk**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on-demand: a refused first-time set-up leaves nothing on disk | `src/daemon/__tests__/on-demand-open.test.ts` |

**integration: on-demand: a plain listing of an unmanaged repository touches nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on-demand: a plain listing of an unmanaged repository touches nothing | `src/daemon/__tests__/on-demand-open.test.ts` |

**integration: on-demand: shutdown closes every root opened on demand**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on-demand: shutdown closes every root opened on demand | `src/daemon/__tests__/on-demand-open.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/on-demand-open.test.ts` | 0 | 6 | 23.8 s |  |

## t2

Run at 2026-11-08T17:16:31.205Z on commit `15ab2f42c`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vault: concurrent reads perform one Keychain read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: concurrent reads perform one Keychain read | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a refused load fails at once for five minutes and then retries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a refused load fails at once for five minutes and then retries | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a payload with a bad version, missing secrets, a non-string value or a bad retired list fails closed and is never rewritten**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a payload with a bad version, missing secrets, a non-string value or a bad retired list fails closed and is never rewritten | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a malformed name or value leaves memory and the stored item unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a malformed name or value leaves memory and the stored item unchanged | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a name such as __proto__ is stored and read as an ordinary key**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a name such as __proto__ is stored and read as an ordinary key | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a failed write leaves memory unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a failed write leaves memory unchanged | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: concurrent saves lose no update**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: concurrent saves lose no update | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a deleted name is recorded as retired**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a deleted name is recorded as retired | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a retired name saved again is readable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a retired name saved again is readable | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: keystore: listKeys never calls findCredentials**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | keystore: listKeys never calls findCredentials | `src/shared/__tests__/keystore-vault.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/keystore-vault.test.ts` | 0 | 11 | 0.9 s |  |

## t3

Run at 2026-11-08T17:19:27.210Z on commit `c58d36110`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: migration: a legacy secret is copied once and read from the vault afterwards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration: a legacy secret is copied once and read from the vault afterwards | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: migration: concurrent misses of one name share one legacy read and one copy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration: concurrent misses of one name share one legacy read and one copy | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: migration: a save during a legacy read wins and the copy is discarded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration: a save during a legacy read wins and the copy is discarded | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: migration: a delete during a legacy read wins and the copy is discarded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration: a delete during a legacy read wins and the copy is discarded | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: migration: a failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration: a failed copy serves later reads from memory, keeps the legacy item and reads it again on the next run | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: migration: an absent name causes no write and no second lookup in the run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration: an absent name causes no write and no second lookup in the run | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: migration: a refused legacy read fails at once for five minutes for that name only and then retries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration: a refused legacy read fails at once for five minutes for that name only and then retries | `src/shared/__tests__/keystore-vault.test.ts` |

**unit: vault: a retired name does not fall back to its legacy item**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault: a retired name does not fall back to its legacy item | `src/shared/__tests__/keystore-vault.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/keystore-vault.test.ts` | 0 | 19 | 0.7 s |  |

## t4

Run at 2026-11-08T17:24:05.710Z on commit `19d10b5b9`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: threads: workers on two threads share one Keychain read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | threads: workers on two threads share one Keychain read | `src/daemon/__tests__/keystore-forwarding.test.ts` |

**integration: threads: a worker never calls the backend directly**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | threads: a worker never calls the backend directly | `src/daemon/__tests__/keystore-forwarding.test.ts` |

**integration: threads: a closed hub channel does not fall back to the Keychain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | threads: a closed hub channel does not fall back to the Keychain | `src/daemon/__tests__/keystore-forwarding.test.ts` |

**integration: threads: a save on one worker is visible on another**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | threads: a save on one worker is visible on another | `src/daemon/__tests__/keystore-forwarding.test.ts` |

**integration: threads: a malformed request from a worker reports KeystoreInputError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | threads: a malformed request from a worker reports KeystoreInputError | `src/daemon/__tests__/keystore-forwarding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/keystore-forwarding.test.ts` | 0 | 5 | 3.5 s |  |

## t5

Run at 2026-11-08T18:39:41.076Z on commit `0ed541b91`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: guard: a daemon holding no vault fails requests while maintenance holds the guard and succeeds after release**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | guard: a daemon holding no vault fails requests while maintenance holds the guard and succeeds after release | `src/daemon/__tests__/keystore-guard.test.ts` |

**integration: guard: maintenance refuses and releases the guard when the daemon socket exists after acquiring it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | guard: maintenance refuses and releases the guard when the daemon socket exists after acquiring it | `src/daemon/__tests__/keystore-guard.test.ts` |

**integration: maintenance: the offline tool reads the vault once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | maintenance: the offline tool reads the vault once | `src/daemon/__tests__/keystore-guard.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/keystore-guard.test.ts` | 0 | 3 | 8.3 s |  |

## t6

Run at 2026-11-08T17:36:01.579Z on commit `640372bb9`. Tests check: **failed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named tests matched no test file: live: after a node upgrade one dialog appears across several connections and threads once migration is complete (pass a `tests` mapping at the validate turn: for each named test, the file and title of the test cases that carry it)

**integration: consumers: notify, web and keys handlers read through the vault**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | consumers: notify, web and keys handlers read through the vault | `src/daemon/__tests__/keystore-consumers.test.ts` |

**integration: ipc: keys.get reports exists:true for an empty saved secret**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ipc: keys.get reports exists:true for an empty saved secret | `src/daemon/__tests__/keystore-consumers.test.ts` |

**integration: ipc: keys.set with a non-string value is refused and other secrets stay readable after a restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ipc: keys.set with a non-string value is refused and other secrets stay readable after a restart | `src/daemon/__tests__/keystore-consumers.test.ts` |

**live: live: after a node upgrade one dialog appears across several connections and threads once migration is complete**

Not mapped: no test case was named for this test, and nothing was run for it.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/keystore-consumers.test.ts` | 0 | 3 | 14.2 s |  |
