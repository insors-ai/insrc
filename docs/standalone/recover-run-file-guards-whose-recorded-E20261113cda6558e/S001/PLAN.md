<!-- insrc:artifact PLAN-cda6558e4b0e4bea-s1 -->

# Plan: STORY-cda6558e4b0e4bea-s1

## Summary

**Epic:** `recover-run-file-guards-whose-recorded`
**LLD run:** `wf-1794549254332-p1haji`
**LLD effective hash:** `cda6558e4b0e...`

A four-task build: the decision-table unit tests first (red), then the reclaim itself in the EEXIST branch of the shared acquireRunFileGuard, then consumer-path integration cases with real exited-process fixtures, then the full sweep confirming the untouched consumers keep their contracts. All code change lives in one module; every consumer inherits the recovery for free.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Write the reclaim decision-table unit tests first (red) | M | — | — | unit: acquireRunFileGuard quarantines and acquires when the verdict is 'gone' (fake reader, mkdtemp guard); unit: acquireRunFileGuard quarantines and acquires on previous-boot 'replaced' (boot segments mismatch); unit: acquireRunFileGuard withholds 'same', same-boot 'replaced', corrupt or missing owner.json and a throwing reader; nothing is renamed; unit: acquireRunFileGuard recomputes the conflict and throws when the retry mkdir hits EEXIST; unit: acquireRunFileGuard leaves a symlink guard as a conflict; unit: acquireRunFileGuard suffixes the quarantine name on collision; owner.json stays byte-identical and one daemonLog line is keyed by the recorded nonce; a log-write failure is swallowed | [[c1]] [[c3]] |
| 2 | **`t2`** Implement dead-owner reclaim inside shared acquireRunFileGuard | M | — | `t1` | unit: the t1 decision-table suite turns green against the implementation (no new tests) | [[c1]] [[c2]] [[c4]] [[c5]] |
| 3 | **`t3`** Add consumer-path integration cases (lease, vault guard) with real-exited-owner fixtures | M | — | `t2` | integration: startup lease acquires over a guard whose owner.json records a genuinely exited child process (src/daemon/__tests__/run-file-ownership.test.ts); integration: vault guard reclaims a genuinely-exited-owner guard through the real readProcessIdentity verdict path (src/daemon/__tests__/keystore-guard.test.ts) | [[c3]] [[c5]] |
| 4 | **`t4`** Full sweep with shutdown/supervisor regression confirmation | S | — | `t3` | integration: full sweep npx tsx --test 'src/**/__tests__/*.test.ts' exits clean with shutdown and supervisor suites unmodified | [[c3]] |

### 1.1 TASK-cda6558e4b0e4bea-s1-t1 — Write the reclaim decision-table unit tests first (red)

Test-first: extend src/shared/__tests__/daemon-run-files.test.ts with the decision-table cases - gone -> quarantine+acquire, previous-boot replaced -> quarantine+acquire, same/same-boot-replaced/corrupt-or-missing owner.json/throwing reader -> withhold with nothing renamed, retry EEXIST -> recompute and throw, symlink -> conflict, quarantine-name collision -> suffixed name, daemonLog line by nonce, log-write failure swallowed. Uses mkdtemp guard fixtures and a fake ProcessIdentityReader injected via the new optional third parameter.

**Acceptance checks:**
- Suite fails red against the current fail-closed behavior for the reclaim cases
- Withhold cases pass unchanged (same, same-boot replaced, corrupt owner.json, throwing reader)
- Fake reader + mkdtemp fixtures in place, no real PID probing

### 1.2 TASK-cda6558e4b0e4bea-s1-t2 — Implement dead-owner reclaim inside shared acquireRunFileGuard

Implement the reclaim in the EEXIST branch of acquireRunFileGuard (src/shared/daemon-run-files.ts): add the optional ProcessIdentityReader third param, read ownerRecord, compute processIdentityState plus the boot-id comparison ('gone', or recorded boot segment differs from the current boot), rename the stale guard to '<path>.quarantine-<UTC-timestamp>-<recorded-nonce>' with incremented-suffix collision handling, append a best-effort recovery line to PATHS.daemonLog (failures swallowed), retry mkdirSync once and recompute the conflict on retry EEXIST. Add renameSync/appendFileSync to the fs import; narrow the comments at :51 and :73 to the unverifiable-owner case.

**Acceptance checks:**
- acquireRunFileGuard signature matches the LLD contract with optional read param
- Verdict + boot-segment comparison implemented and only 'gone' or previous-boot mismatch reclaims
- Stale guard renamed whole with owner.json intact; one daemonLog line; single mkdir retry; retry EEXIST recomputes the conflict and throws
- Comments at :51 and :73 narrowed; borrowRunFileGuard and removeOwnedRunFile untouched

### 1.3 TASK-cda6558e4b0e4bea-s1-t3 — Add consumer-path integration cases (lease, vault guard) with real-exited-owner fixtures

Extend the integration suites with real-exited-owner fixtures (no fake reader - these paths call acquireRunFileGuard without injection): spawn a short-lived child process, wait for exit, write its recorded identity (current boot-id + the child's start ticks) into the guard's owner.json. src/daemon/__tests__/run-file-ownership.test.ts gains a startup-lease-over-dead-owner-guard case; src/daemon/__tests__/keystore-guard.test.ts gains a vault-guard reclaim case proving the offline maintenance path inherits the shared recovery through the real verdict.

**Acceptance checks:**
- Lease acquires over a guard whose owner.json records a genuinely exited child process
- Vault guard (PATHS.vaultGuard) reclaims a genuinely-exited-owner guard through the real readProcessIdentity verdict path
- Supervisor borrow/release suites pass unchanged

### 1.4 TASK-cda6558e4b0e4bea-s1-t4 — Full sweep with shutdown/supervisor regression confirmation

Run the full test sweep and confirm the untouched consumers keep their contracts: supervisor and shutdown suites pass unchanged (regression only, no edits to them).

**Acceptance checks:**
- npx tsx --test 'src/**/__tests__/*.test.ts' exits clean
- Shutdown and supervisor suites pass with no test modifications

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| gone / previous-boot replaced -> quarantine + acquire | `t1` |
| same / same-boot replaced / unverifiable -> conflict, nothing renamed | `t1` |
| quarantine name = timestamp + nonce; owner.json intact; daemonLog line | `t1` |
| symlink -> conflict; name collision -> suffix | `t1` |
| lease over a dead-owner guard (src/daemon/__tests__/run-file-ownership.test.ts) | `t3` |
| vault guard reclaims (src/daemon/__tests__/keystore-guard.test.ts); borrowRunFileGuard unchanged (src/daemon/__tests__/supervisor-run-files.test.ts) | `t3`, `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-cda6558e4b0e4bea-s1 migration (six rollbackable steps: red decision-table tests, EEXIST verdict + boot comparison, quarantine rename + daemonLog line + one retry, integration suites, comment updates, full sweep)`
- **[[c2]]** `prior-artifact` `LLD-cda6558e4b0e4bea-s1 errorPaths (6 error cases incl. live owner, same-boot PID reuse, unverifiable owner, competing starter, rename failure, log-write failure; 6 edge cases incl. previous-boot replaced, darwin replaced, symlink, collision)`
- **[[c3]]** `prior-artifact` `LLD-cda6558e4b0e4bea-s1 testStrategy (node:test sweep, unit decision table via injected reader over mkdtemp guards, integration cases for lease and vault guard, supervisor/shutdown suites unchanged)`
- **[[c4]]** `prior-artifact` `LLD-cda6558e4b0e4bea-s1 contractDetails (acquireRunFileGuard(path: string, owner?: ProcessIdentity, read?: ProcessIdentityReader): RunFileGuard, internal-shared surface)`
- **[[c5]]** `prior-artifact` `LLD-cda6558e4b0e4bea-s1 invariantsToPreserve (c1-c6: live owner never reclaimed, unreadable never dead, rename-then-mkdir atomicity, supervisor-owned guard untouched, no recursive delete, shared-module placement)`
