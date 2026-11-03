<!-- insrc:artifact PLAN-5d393a4b122cf64a-S001 -->

# Plan: E202610295d393a4b:S001

## Summary

**Epic:** `classify-module-scope-mutable-state-reachable`
**LLD run:** `wf-1793273734088-3e69mj`
**LLD effective hash:** `5d393a4b122c...`

The build adds a test-side compiler scanner that lists the module-scope state a session worker loads, and a small pure guard that compares that list with a reviewed inventory file. Most of the effort is the classification itself: reading each of a few hundred declarations and recording whether a per-thread copy is right, it lives in a shared store, or one thread must own it. Once the inventory is complete the guard runs over the whole repo, and the values that turn out to need a single owner are brought to you to decide, case by case, whether to move them here or track them separately.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Module-state scanner over the session worker's import closure | M | — | unit: module-state-inventory.test.ts: the scanner reports lets, constructed containers and written const literals, skips read-only and frozen tables, follows dynamic imports and skips modules outside the closure (temp project); unit: module-state-inventory.test.ts: the scanner throws on an unreadable tsconfig and is deterministic | [[c1]] [[c4]] |
| 2 | **`t2`** Guard logic: compare sites with the fixture and validate entries | S | `t1` | unit: module-state-inventory.test.ts: the guard names a missing key, a stale key, an invalid class, a missing owner, a short reason and an unrouted shared-state owner, and reports nothing on a clean input | [[c2]] [[c4]] [[c7]] |
| 3 | **`t3`** Classify the src/daemon entries | L | `t2` | unit: module-state-inventory.test.ts: every scanned key under src/daemon/ has a valid fixture entry, and the s3 families are one-owner on the shared-state worker or shared-store | [[c2]] [[c3]] |
| 4 | **`t4`** Classify every scanned key outside src/daemon and turn on the full guard | L | `t3` | unit: module-state-inventory.test.ts: every module-scope mutable value the session worker can load is classified (full guard over the repo) | [[c2]] [[c3]] [[c5]] |
| 5 | **`t5`** Move-candidate review with the user | S | `t4` | unit: module-state-inventory.test.ts: every one-owner or shared-store entry names the mechanism that gives it one copy (no unresolved candidate is left in the fixture) | [[c3]] [[c6]] |
| 6 | **`t6`** Inline moves | M | `t5` | integration: method-class.test.ts and a two-session-worker test per moved family: both workers reach the one owner (or, with no inline moves, method-class.test.ts still passes) | [[c3]] [[c6]] [[c7]] |
| 7 | **`t7`** Refresh the session-source inventory for edited production files | S | `t6` | unit: session-source-inventory.test.ts: the entries for files this Story edited match (or no production file was edited) | [[c6]] |

### 1.1 E202610295d393a4b:S001:T001 — Module-state scanner over the session worker's import closure

Add moduleStateInventory as a test-side module in src/daemon/threads/__tests__/ following connection-source-inventory's ts.Program approach: walk value imports (static and string-literal dynamic) from src/daemon/threads/session-worker.ts within src/, excluding __tests__ and *.test.ts, and report top-level lets/vars, non-frozen constructed instances, and const array/object literals that are not frozen and that the checker finds written. Deterministic order by key. Unit test over a temp project.

**Acceptance checks:**
- Reports let/var, constructed containers and written const literals; skips read-only and `as const`/Object.freeze literals
- Follows static and dynamic imports; skips modules outside the entry's closure and type-only imports
- Throws when the tsconfig cannot be read
- Same input gives the same sorted output

### 1.2 E202610295d393a4b:S001:T002 — Guard logic: compare sites with the fixture and validate entries

A pure function over (sites, fixture, routed method sets) that returns the problems: keys missing from the fixture, stale fixture keys, an invalid class, a one-owner entry with no owner, a reason under 40 characters, and a one-owner entry owned by the shared-state worker whose named method prefix no member of SHARED_STATE_METHODS or IN_DAEMON_SHARED_METHODS starts with. It can be limited to a key prefix so a classification slice can be checked alone.

**Acceptance checks:**
- Each kind of problem is reported, naming the key and what is wrong, on altered inputs
- A clean input reports nothing
- A prefix limit checks only keys under that prefix

### 1.3 E202610295d393a4b:S001:T003 — Classify the src/daemon entries

Run the scanner over the repo and write fixture entries (class, owner for one-owner, reason of at least 40 characters) for every site under src/daemon/, reading each declaration and its uses. The four s3 families are classified as s3 made them. Every entry that needs a single copy but does not have one is listed as a move candidate in the build record. A test checks the src/daemon/ slice with the guard logic.

**Acceptance checks:**
- The guard logic limited to src/daemon/ reports no problem over the real repo
- The four s3 families carry the s3 mechanism as their reason
- Move candidates are listed with the reason a single copy is needed

### 1.4 E202610295d393a4b:S001:T004 — Classify every scanned key outside src/daemon and turn on the full guard

Write fixture entries for every scanned key not under src/daemon/, with the same rules, extending the move-candidate list; then add the full guard test over the real repo (no prefix limit), which from here on fails on any new, stale or invalid entry.

**Acceptance checks:**
- The full guard test passes over the real repo
- The fixture's keys equal the scanner's keys exactly
- Move candidates outside src/daemon are listed

### 1.5 E202610295d393a4b:S001:T005 — Move-candidate review with the user

Present the complete move-candidate list (each value that needs a single copy but lacks one, with its reason and the likely mechanism) to the user, who decides per candidate: move inline in this Story, or raise as a separate tracked item. Record the decisions in the build record; file a tracked item for each one raised separately.

**Acceptance checks:**
- Every move candidate has a recorded user decision
- Each candidate raised separately has a tracked item filed
- If there are no candidates, that is recorded with the evidence

### 1.6 E202610295d393a4b:S001:T006 — Inline moves

For each candidate the user chose to move inline: route its method family to the owner (extending SHARED_STATE_METHODS/inDaemonTarget as s3 did) or keep the value in an existing cross-thread store; update its fixture entry; add a two-session-worker test that both workers reach the one owner. Skipped with a recorded reason if t5 chose none.

**Acceptance checks:**
- Each inline move has a two-session-worker test proving one owner
- method-class tests and the guard pass
- No inline move was made without a t5 decision

### 1.7 E202610295d393a4b:S001:T007 — Refresh the session-source inventory for edited production files

If t6 edited production files the session-source inventory pins, refresh their entries with the refresh tool and run that test; otherwise record that no production file changed.

**Acceptance checks:**
- The session-source inventory entries for every production file this Story edited are refreshed, or the record states none were edited

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| moduleStateInventory over a temp-dir fixture project (as session-source-inventory.test.ts's second test builds one) | `t1` |
| the module-state inventory fixture against moduleStateInventory(repo root) | `t2`, `t3`, `t4` |
| SHARED_STATE_METHODS / IN_DAEMON_SHARED_METHODS coverage of shared-state one-owner entries | `t2`, `t3` |
| src/daemon/threads/__tests__/method-class.test.ts | `t6` |
| src/daemon/threads/__tests__/purge-shared.test.ts or a new two-worker check for the moved family | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api moduleStateInventory`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges Module-state inventory fixture`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges Session-thread state ownership rule`
- **[[c4]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c5]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c6]]** `prior-artifact` `LLD S001 migration`
- **[[c7]]** `prior-artifact` `LLD S001 contractDetails.api SHARED_STATE_METHODS`
