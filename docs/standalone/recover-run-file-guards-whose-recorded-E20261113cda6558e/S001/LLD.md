<!-- insrc:artifact LLD-cda6558e4b0e4bea-s1 -->

# LLD: STORY-cda6558e4b0e4bea-s1 — Recover run-file guards whose recorded owner is conclusively dead instead of withholding daemon restart

## Summary

**Epic:** `recover-run-file-guards-whose-recorded`
**HLD base run:** `wf-1794549254332-p1haji`
**HLD effective hash:** `cda6558e4b0e...`

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)

## 1. HLD context

**Framework:** Standalone feature - no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `acquireRunFileGuard`

```typescript
acquireRunFileGuard(path: string, owner?: ProcessIdentity, read?: ProcessIdentityReader): RunFileGuard
```

**Parameters:**
- `path: string` — guard directory
- `owner: ProcessIdentity` _(optional)_ — identity to record in owner.json
- `read: ProcessIdentityReader` _(optional)_ — injected ProcessIdentityReader for verdicts and tests

**Returns:** `RunFileGuard` — the acquired guard; the EEXIST branch reclaims conclusively-dead occupants and retries the mkdir once

**Preconditions:**
- The parent of `path` exists and is writable
- On EEXIST the recorded owner identity is readable and a verdict is computable

**Postconditions:**
- On success the guard directory holds a fresh owner.json naming the caller
- On reclaim the stale guard persists as a quarantine sibling with owner.json intact
- On withhold the guard directory is byte-identical to before the call

## 3. Error paths

**Error cases**

- **Live owner** (recoverable)
  - Detection: EEXIST; verdict 'same'
  - Response: Throw conflict unchanged
  - User impact: Withheld
- **Same-boot PID reuse** (recoverable)
  - Detection: 'replaced'; same boot
  - Response: Withhold; death not provable
  - User impact: Withheld
- **Unverifiable owner** (recoverable)
  - Detection: ownerRecord()/reader throws
  - Response: Withhold; unreadable is never dead
  - User impact: Withheld
- **Competing starter wins retry** (recoverable)
  - Detection: Retry mkdir EEXIST
  - Response: Recompute conflict vs new occupant; throw
  - User impact: Retry after release
- **Rename fails** (recoverable)
  - Detection: renameSync throws
  - Response: Suffix retry; persistent failure rethrows, guard untouched
  - User impact: Withheld as before
- **Log write fails** (recoverable)
  - Detection: appendFileSync throws
  - Response: Swallow; quarantine dir is evidence
  - User impact: Reclaim succeeds

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Previous-boot 'replaced' (boot segments mismatch) | Reclaim |
| Verdict 'gone' (PID positively absent) | Reclaim |
| darwin 'replaced' (no boot segment) | Withhold; only 'gone' |
| Guard path is a symlink | Symlink conflict |
| Extra files beside owner.json | Renamed whole |
| Quarantine name already taken | Suffixed name |

**Invariants to preserve**

- A live owner ('same') is never reclaimed. [[c1]]
- A missing or unreadable owner record is never treated as dead. [[c2]]
- Rename-then-mkdir preserves the atomic arbitration between starters. [[c3]]
- The child never removes a supervisor-owned guard; borrowRunFileGuard untouched. [[c4]]
- Nothing is recursively deleted; the reclaim renames the directory whole. [[c5]]
- The reclaim lives in shared acquireRunFileGuard; vault guard and cutover inherit it. [[c6]]

## 4. Test strategy

**Test framework:** `node:test via `npx tsx --test 'src/**/__tests__/*.test.ts'``

**Test levels**

- **unit** — Decision table via injected reader over mkdtemp guards.
  - Subjects: `gone / previous-boot replaced -> quarantine + acquire`, `same / same-boot replaced / unverifiable -> conflict, nothing renamed`, `quarantine name = timestamp + nonce; owner.json intact; daemonLog line`, `symlink -> conflict; name collision -> suffix`
  - Fixtures: `mkdtemp guards + owner.json`, `fake reader (same/gone/replaced)`, `nonce for the daemonLog scan`
- **integration** — Consumers inherit the reclaim; untouched consumers keep contracts.
  - Subjects: `lease over a dead-owner guard (src/daemon/__tests__/run-file-ownership.test.ts)`, `vault guard reclaims (src/daemon/__tests__/keystore-guard.test.ts); borrowRunFileGuard unchanged (src/daemon/__tests__/supervisor-run-files.test.ts)`
  - Fixtures: `dead-owner guard fixture`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'gone' -> quarantine + retry acquires (src/shared/__tests__/daemon-run-files.test.ts)`, `int: lease over a dead-owner guard (src/daemon/__tests__/run-file-ownership.test.ts)` |
| `ac2` | `unit: previous-boot 'replaced' -> quarantine + acquire` |
| `ac3` | `unit: owner.json byte-identical; nonce in quarantine name; daemonLog line by nonce` |
| `ac4` | `unit: retry EEXIST -> recompute conflict, throw` |
| `ac5` | `unit: 'same'/same-boot 'replaced'/missing or corrupt owner.json/throwing reader -> withhold` |
| `ac6` | `int: vault guard reclaims (src/daemon/__tests__/keystore-guard.test.ts); supervisor suites unchanged` |
| `ac7` | `shutdown suites unchanged (src/daemon/__tests__/shutdown-*.test.ts)` |

## 5. Migration

**State before:** Every existing guard withholds: EEXIST throws runFileGuardConflict, verdict discarded; each orphan blocks restart until manual quarantine (six since 2026-11-02).

**State after:** Conclusively-dead occupants reclaim: quarantine rename keeping owner.json, one daemonLog line, one mkdir retry; live/same-boot/unverifiable still throw; all consumers inherit.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Reclaim decision-table unit tests first (red) — ↩ rollbackable _(needs: `test-first`)_
2. EEXIST branch: read owner record, verdict, compare boot segments — ↩ rollbackable
3. Reclaim: quarantine rename (timestamp+nonce, suffixed), daemonLog line, one retry, recompute on retry EEXIST — ↩ rollbackable
4. Extend integration suites (lease, vault guard) — ↩ rollbackable
5. Update comments at src/shared/daemon-run-files.ts:51 and :73 — ↩ rollbackable
6. Full sweep; shutdown suites unchanged — ↩ rollbackable

**Backward compat:** Additive: call sites, conflict message and owner.json format unchanged; supervisor protocol untouched.

## 6. Alternatives considered

### 6.1 a1: Reclaim inside the shared acquireRunFileGuard (dead-owner verdict + rename-to-quarantine + retry) — **CHOSEN**

The EEXIST branch itself decides dead vs live and self-heals; all guard consumers inherit it for free.

On EEXIST inside acquireRunFileGuard (src/shared/daemon-run-files.ts:64-92), before throwing runFileGuardConflict: read the existing owner.json, compute the liveness verdict with processIdentityState (src/shared/daemon-process.ts:77-80) plus a boot-id comparison. If conclusively dead - 'gone', or the recorded boot-id differs from the current boot (a previous-boot record is dead even when its PID reads 'replaced') - rename the stale guard directory to a quarantine name (timestamp + recorded nonce, matching the manual-quarantine convention) and retry the mkdir once. Rename+mkdir is atomic against competing starters (kernel-serialized on the same parent). Missing/corrupt/unreadable owner.json keeps the existing fail-closed throw. Recovery logged (prior owner identity + quarantine path) so the owner record survives as evidence. No new exports; every consumer - startup lease, supervisor borrow, legacy cutover, vault guard - inherits it. borrowRunFileGuard and removeOwnedRunFile untouched.

### 6.2 a2: Recovery at the daemon ownership wrapper (DaemonRunFileOwnership.lease)

Keep the shared primitive pure; make the daemon's ownership wrapper the recovery policy owner.

Keep acquireRunFileGuard fail-closed and instead teach DaemonRunFileOwnership.lease (src/daemon/run-file-ownership.ts:51-62) to pre-recover: catch runFileGuardConflict, run the same dead-owner verdict, quarantine-and-retry, then re-acquire. The shared primitive stays a pure mkdir-mutex; recovery is a policy of the daemon's ownership wrapper where isAlreadyRunning (:117-135) already implements the analogous stale pid-file policy.

**Rejected because:** Leaves vault guard and cutover unfixed; violates shared-module placement.

### 6.3 a3: Separate shared recovery module consumed by acquireRunFileGuard

Factor verdict + quarantine + retry into its own exported unit that the guard calls on conflict.

New module exporting reclaimIfConclusivelyDead(path, identityReader) returning 'reclaimed' | 'unverifiable' | 'alive', implementing verdict + rename + log; acquireRunFileGuard calls it on EEXIST and throws runFileGuardConflict unless it reports 'reclaimed'. The decision table gets its own focused test file; the guard module keeps only the retry wiring.

**Rejected because:** All constraints met but adds a one-caller module boundary.

### 6.4 a4: Reclaim (a1) plus separately close the shutdown-deadline orphan window

Also change the fail-closed cleanup so it never re-creates the guard the watchdog's SIGKILL can orphan.

The dead-owner reclaim of a1 AND additionally stop the most common orphan at its source: change clearRunFiles (src/daemon/run-file-ownership.ts:106-114) so shutdown cleanup removes daemon.pid/daemon.sock without re-creating the guard (or reorder the watchdog arming so it cannot kill inside the guard window), removing the shutdown-deadline race observed at 2026-11-13 05:01.

**Rejected because:** Contradicts the ISSUE's scope decision; touches fail-closed shutdown code.

## 7. References

- **[[c1]]** `code` `src/shared/daemon-run-files.ts:52-61`
- **[[c2]]** `code` `src/shared/daemon-process.ts:36-80`
- **[[c3]]** `code` `src/shared/daemon-run-files.ts:63`
- **[[c4]]** `code` `src/shared/daemon-run-files.ts:94-113`
- **[[c5]]** `code` `src/shared/daemon-run-files.ts:88`
- **[[c6]]** `code` `src/shared/keystore.ts:96-100`
- **[[c8]]** `prior-artifact` `ISSUE-fb49f73c0a8fb900`
