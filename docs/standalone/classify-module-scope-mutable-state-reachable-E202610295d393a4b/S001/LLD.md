<!-- insrc:artifact LLD-5d393a4b122cf64a-S001 -->

# LLD: E202610295d393a4b:S001

## Summary

**Epic:** `classify-module-scope-mutable-state-reachable`
**HLD base run:** `wf-1793273734088-3e69mj`
**HLD effective hash:** `5d393a4b122c...`

This Story writes down, for every module-scope variable or container that a daemon session worker can load and that holds changing state, whether a separate copy per thread is correct, whether the value lives in a cross-thread store, or whether exactly one thread must own it, and why. A test-side compiler scanner finds those declarations from the session worker's imports, and a guard test fails when one appears or disappears without a matching entry in a reviewed inventory file. Any value that needs a single copy but does not have one yet is given its owner the way Story s3 did for the chat pool, the todos bus, the understanding service and the run registry.

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

### 2.1 `moduleStateInventory`

```typescript
moduleStateInventory(root: string): ModuleStateSite[]  // new, test-side, beside connectionSourceInventory; interface ModuleStateSite { readonly key: string /* '<file>#<name>' */; readonly file: string; readonly name: string; readonly kind: 'let' | 'var' | 'container' | 'literal' }
```

**Parameters:**
- `root: string` — The repo root holding tsconfig.json and src/

**Returns:** `ModuleStateSite[]` — Every top-level declaration, in the static and dynamic import closure of src/daemon/threads/session-worker.ts (value imports within src/, excluding __tests__ and *.test.ts), that holds mutable state: each `let`/`var`; each `const` bound to a constructed instance (new X) other than a frozen one; and each `const` array/object literal that is not `as const`/Object.freeze'd and that the type checker finds written somewhere in the program (assignment, property write, or a mutating call such as set/add/delete/clear/push/pop/shift/unshift/splice/sort). Sorted by key.

**Errors:**
- `Error` when The repo tsconfig cannot be read or parsed, as connectionSourceInventory throws today

**Preconditions:**
- Runs in a test process with the repo's typescript dependency; reads source only

**Postconditions:**
- Deterministic: the same source tree gives the same list in the same order
- Never edits a file

### 2.2 `connectionSourceInventory`

```typescript
connectionSourceInventory(root: string): InventorySite[]  // existing, unchanged; its sourceProgram/filesUnder approach is the pattern moduleStateInventory follows
```

**Returns:** `InventorySite[]` — Unchanged.

**Postconditions:**
- The session-source inventory and its fixture are not changed by this Story except where a moved value edits a file that fixture pins (then refreshed with the refresh tool)

### 2.3 `SHARED_STATE_METHODS`

```typescript
export const SHARED_STATE_METHODS: ReadonlySet<string>  // existing (src/daemon/threads/method-class.ts:262); extended only if a one-owner value is moved by routing its methods to the shared-state worker
```

**Returns:** `ReadonlySet<string>` — The session-class methods served on the one shared-state worker; the s3 way to give a family of state one owner.

**Postconditions:**
- Every one-owner entry whose owner is the shared-state worker names a method family that this set (or IN_DAEMON_SHARED_METHODS) routes there, and the existing method-class tests keep passing

## 3. Data model changes

### 3.1 `Module-state inventory fixture` — new

A reviewed JSON file beside the new test, keyed by '<file>#<name>' for every site moduleStateInventory returns. Each entry: class 'per-thread' (a separate copy per thread is correct: a cache of immutable or re-readable data, a test seam, a per-thread handle over a shared file or block, logger or diagnostic setup, or a value only used on a thread class that is not a session worker), 'shared-store' (the state is kept in a cross-thread store: the shared lock block, the status board, LMDB/Lance files) or 'one-owner' (exactly one thread may hold it); for one-owner an owner naming the thread and how calls reach it (shared-state worker via SHARED_STATE_METHODS/inDaemonTarget, main thread, admin worker or indexing worker); and a reason of at least 40 characters. No source or site digests: editing a classified file never fails the guard.

```
+ { [key: '<file>#<name>']: { class: 'per-thread' | 'shared-store' | 'one-owner'; owner?: 'shared-state' | 'main' | 'admin' | 'indexing'; reason: string } }
```

**Call sites:**
- `src/daemon/db/__tests__/connection-source-inventory.ts`
- `src/daemon/db/__tests__/session-source-inventory.test.ts`
- `src/daemon/threads/session-worker.ts`

### 3.2 `Session-thread state ownership rule` — invariant-change

Before: only the four s3 families (chat pool src/daemon/chat-handler.ts, todos bus src/daemon/todos-rpc.ts, understanding service: the module-scope client `understanding` in src/daemon/threads/session-worker.ts:77 (opened at src/daemon/threads/session-worker.ts:184) and, on the thread that hosts shared state, the start-up local understandingService in src/daemon/index.ts:446 (opened at src/daemon/index.ts:523; not module-scope, so outside the scanner), run registry src/daemon/workflow-run-registry.ts) are known to have one owner; all other module-scope state a session worker loads is unclassified. After: every such value is classified with a reason, and each value classified one-owner or shared-store is in fact owned or stored that way; values found to need a single copy that do not have one are moved (their methods routed to the owner, or the value put in an existing cross-thread store).

**Call sites:**
- `src/daemon/threads/method-class.ts:262`
- `src/daemon/threads/method-class.ts:290`
- `src/daemon/workflow-run-registry.ts:76`
- `src/daemon/workflow-run-registry.ts:91`
- `src/daemon/chat-handler.ts`
- `src/daemon/todos-rpc.ts`
- `src/daemon/threads/session-worker.ts:77`
- `src/daemon/threads/session-worker.ts:184`
- `src/daemon/index.ts:446`
- `src/daemon/index.ts:523`

## 4. Error paths

**Error cases**

- **A change adds a module-scope mutable declaration in a file the session worker loads, without classifying it.** (recoverable)
  - Detection: The guard test compares moduleStateInventory's keys with the fixture's keys; the new key is missing from the fixture.
  - Response: The test fails naming the key and asking for a class and reason; nothing is excluded automatically.
  - User impact: The author classifies the new state (or makes it per-call) before the change can land.
- **A classified declaration is renamed, moved to another file, or removed.** (recoverable)
  - Detection: A fixture key no longer appears in moduleStateInventory's output.
  - Response: The test fails naming the stale key, so the fixture never keeps entries for state that no longer exists.
  - User impact: The author updates the key (keeping or revisiting the classification).
- **A fixture entry has no class, an unknown class, a one-owner entry with no owner, or a reason under 40 characters.** (recoverable)
  - Detection: The guard validates every entry's fields.
  - Response: The test fails naming the entry and the missing or invalid field.
  - User impact: None at runtime; the inventory stays reviewable.
- **A one-owner entry names the shared-state worker but no method family routed there serves it.** (recoverable)
  - Detection: For each one-owner entry with owner 'shared-state', the guard checks that the entry names a method prefix covered by SHARED_STATE_METHODS or IN_DAEMON_SHARED_METHODS.
  - Response: The test fails naming the entry; the value is either routed (a move) or reclassified with a correct reason.
  - User impact: A value claimed to have one owner cannot silently exist per worker.
- **The scanner cannot build the program (unreadable tsconfig).** (recoverable)
  - Detection: moduleStateInventory throws, as connectionSourceInventory does.
  - Response: The test fails with that error.
  - User impact: None at runtime.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A const array or object literal that is only read (a lookup table) | Not reported: the type checker finds no write to it. |
| A const literal mutated through an alias the checker cannot follow (passed to a function that pushes into it) | May be missed by the write filter; the LLD accepts this limit, and the classification pass reviews the const literals in files that hold other state. |
| A `let` used only as a test seam (classifierImpl, depsForTest) | Reported and classified per-thread: a test sets it in one thread for that thread. |
| A per-thread store handle (src/db/graph/store.ts _instance) over files shared by every thread | Reported and classified per-thread with the reason that each thread opens its own handle over the shared LMDB/Lance files. |
| A declaration reached only through a dynamic import() | Reported: the closure follows dynamic imports with a string-literal specifier. |
| A module only loaded on the admin or indexing worker or the main thread | Not in the session worker's closure, so not reported. |
| One of the four s3 families (sessionPool in src/daemon/chat-handler.ts, the todos bus, the understanding service, the run registry board) | Classified one-owner (shared-state) or shared-store as s3 made them, with the s3 mechanism as the reason. |

**Invariants to preserve**

- The session-source inventory guard and its fixture keep their meaning; this Story adds a separate guard and does not change theirs. [[c3]]
- s3's routing of chat.*, todos.* and understanding.* methods to the shared-state worker, and the run registry's board, stay as they are; method-class tests keep passing. [[c4]]
- Each thread keeps its own store handles over the shared LMDB/Lance files. [[c2]]
- The session worker still loads the full handler runtime; the guard reads its import closure and changes nothing in it. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run with npx tsx --test (the convention of src/daemon/db/__tests__/session-source-inventory.test.ts and src/daemon/threads/__tests__)`

**Test levels**

- **unit** — The scanner finds the right declarations: lets/vars, constructed containers, and written const literals, through static and dynamic imports, and skips read-only tables, frozen values and files outside the closure.
  - Subjects: `moduleStateInventory over a temp-dir fixture project (as session-source-inventory.test.ts's second test builds one)`
  - Fixtures: `A small temp project with a tsconfig, an entry file importing (statically and dynamically) modules that declare each kind of state, a read-only table, an `as const` table, and a module not in the closure`
- **contract** — The guard: every site the scanner reports over the real source tree has a valid fixture entry, every fixture key still exists, and shared-state one-owner entries name a routed family.
  - Subjects: `the module-state inventory fixture against moduleStateInventory(repo root)`, `SHARED_STATE_METHODS / IN_DAEMON_SHARED_METHODS coverage of shared-state one-owner entries`
- **integration** — For any value this Story moves to an owner, the existing ownership tests (method-class routing, shared-state purge) prove calls reach that owner from two session workers.
  - Subjects: `src/daemon/threads/__tests__/method-class.test.ts`, `src/daemon/threads/__tests__/purge-shared.test.ts or a new two-worker check for the moved family`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `module-state-inventory.test.ts: every site moduleStateInventory reports over the source tree has a fixture entry with a valid class, owner where needed and a reason of at least 40 characters` |
| `ac2` | `module-state-inventory.test.ts: a new unclassified declaration fails the guard (scanner unit test over a temp project shows the new key is reported, and the guard's key comparison names it)`, `module-state-inventory.test.ts: a fixture key that no longer exists fails the guard` |
| `ac3` | `module-state-inventory.test.ts: each one-owner entry owned by the shared-state worker names a method family SHARED_STATE_METHODS or IN_DAEMON_SHARED_METHODS routes there`, `for each value moved by this Story: a two-session-worker test that both workers reach the one owner` |
| `ac4` | `module-state-inventory.test.ts scanner unit test: lets, constructed containers and written const literals are reported, read-only and frozen tables are not, dynamic imports are followed, modules outside the closure are skipped` |

## 6. Migration

**State before:** Per the s1 bundles: a session worker loads nearly all of src/ (548 files) and with it 583 top-level candidates for module-scope state; only the four s3 families are known to have one owner (src/daemon/threads/method-class.ts:262 routing, src/daemon/workflow-run-registry.ts:91 board), and no test notices new module-scope state. The only source inventory, src/daemon/db/__tests__/session-source-inventory.test.ts, covers provider/connection boundary sites, not module state.

**State after:** A test-side scanner lists every module-scope mutable declaration in the session worker's import closure; a reviewed fixture classifies each one (per-thread, shared-store or one-owner with its owner) with a reason; a guard test fails on any unclassified, stale or invalid entry and on a shared-state one-owner entry whose family is not routed. Values found to need one copy but lacking one are moved to an owner the s3 way.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the test-side scanner beside the existing source inventory, with a unit test over a temporary project covering each declaration kind, read-only and frozen tables, dynamic imports and out-of-closure modules. — ↩ rollbackable
2. Generate the list of sites over the real source tree and classify every entry with a class, owner where needed, and a reason; record the classification as the fixture. — ↩ rollbackable
3. Add the guard test comparing the scanner's output with the fixture and validating each entry, including the shared-state routing check. — ↩ rollbackable
4. For each entry classified one-owner or shared-store that is not already owned or stored that way, move it: route its method family to the owner (as s3 did with SHARED_STATE_METHODS) or keep it in an existing cross-thread store, with a two-session-worker test. If a needed move is large enough to deserve its own design, stop and raise it as a separate tracked item instead of folding it in. — ↩ rollbackable
5. Refresh the session-source inventory entries for any production file a move edits. — ↩ rollbackable

**Backward compat:** No public API, IPC method or payload changes. The scanner, fixture and guard are test-side. A move that routes a method family to the shared-state worker changes only which thread serves it; replies are unchanged, as with s3's routing. Threads stay behind daemon.threads.enabled (default off).

## 7. Alternatives considered

### 7.1 a1: Declaration-level inventory fixture with a compiler scanner over the session worker's import closure — **CHOSEN**

A test-side scanner (a ts.Program like connectionSourceInventory) lists every module-scope mutable declaration the session worker can load; a JSON fixture keyed by file#name classifies each with a reason; the guard fails on any unclassified or stale key.

A new scanner beside connectionSourceInventory walks the static and dynamic import closure from src/daemon/threads/session-worker.ts and collects, per file, the top-level declarations that hold mutable state: every `let`/`var`, and every `const` whose initializer is a mutable container (new Map/Set/WeakMap/WeakSet/AsyncLocalStorage or another constructed instance, or an array/object literal) unless it is frozen (`as const`, Object.freeze) or the type checker finds no write to it (assignment, property write, or a mutating method call such as set/add/delete/push/splice) anywhere in the program. A fixture keyed by `<file>#<name>` gives each a class: `per-thread` (a separate copy per thread is correct: caches of immutable or re-readable data, test seams, per-thread handles over shared files, logger setup), `shared-store` (the value lives in a cross-thread store: the lock block, the status board, LMDB/Lance) or `one-owner` (only one thread may hold it; names the owner and how calls reach it, as s3's shared-state routing does), plus a reason of at least 40 characters. The guard test fails when a declaration is missing from the fixture, when a fixture key no longer exists, or when an entry has no valid class or reason; it does not digest source, so editing a classified file does not fail it. Any declaration classified one-owner or shared-store that is not already so is moved to its owner the s3 way (route its methods to the owning worker, or put the value in an existing cross-thread store).

### 7.2 a2: File-level classification in the existing session-source inventory style

Extend the session-source inventory pattern: one entry per file that holds module-scope mutable state, with a class and rationale for the file and a whole-file source digest.

Reuse the session-source-inventory shape: a fixture keyed by file listing the file's mutable declarations, one classification and rationale per file, and a sourceDigest so any edit forces re-inspection. The guard fails on a new or removed file, a changed declaration list, or a changed digest. Moves as in a1.

**Rejected because:** Classifies files, not values, and the source digest fails the guard on every edit to ~280 files.

### 7.3 a3: Classification comments at each declaration, checked by the guard

Each module-scope mutable declaration carries a `// thread-state: <class> — <reason>` comment; the guard scans the same closure and fails on any declaration without a valid comment.

The scanner of a1 finds the declarations; instead of a fixture, each declaration has a leading comment naming its class and reason, which the guard parses. New state fails until its author writes the comment next to it. Moves as in a1.

**Rejected because:** Classifies values, but by editing a few hundred source files, many in areas another session is changing.

## 8. References

- **[[c1]]** `analyze-bundle` `What a session-class handler can reach (TypeScript compiler walk of static and dynamic imports from src/daemon/threads/session-worker.ts, value imports only, within src/)`
- **[[c2]]** `analyze-bundle` `Size and shape of module-scope mutable declarations in that closure (same compiler walk, top-level variable statements)`
- **[[c3]]** `analyze-bundle` `The existing source-inventory guard to mirror (direct read of src/daemon/db/__tests__/connection-source-inventory.ts and src/daemon/db/__tests__/session-source-inventory.test.ts)`
- **[[c4]]** `analyze-bundle` `How s3 gave its four families one owner (direct read of src/daemon/threads/method-class.ts and its tests)`
- **[[c5]]** `analyze-bundle` `Tests to extend (test.locate over threads and inventory)`
- **[[c6]]** `doc` `plans/module-state-inventory-sweep.md`

## 9. Open questions

- cd1 (partial): moduleStateInventory is a new test-side function this Story adds beside connectionSourceInventory; it is not an existing symbol.
- ts1 (ambiguous): the Story has no acceptance criteria; ac1-ac4 are derived from the work item's done-when list (plans/module-state-inventory-sweep.md) plus the scanner's correctness.
- Moves (ambiguous): which values need a move is known only after the classification; any move large enough to need its own design is raised as a separate tracked item rather than folded into this Story.

## Resolved questions

- `qd3a46991` — cd1 (partial): moduleStateInventory is a new test-side function this Story adds beside connectionSourceInventory; it is not an existing symbol.
  - **resolved**: A. Standalone new helper (confirm as designed) — The approved LLD declares moduleStateInventory as a new test-side function beside connectionSourceInventory. _(2026-10-29T11:50:52.079Z)_
- `q4da5879d` — ts1 (ambiguous): the Story has no acceptance criteria; ac1-ac4 are derived from the work item's done-when list (plans/module-state-inventory-sweep.md) plus the scanner's correctness.
  - **resolved**: Adopt as-is (plan-local) — Raised with the LLD at presentation; the user approved the LLD with ac1-ac4 derived from plans/module-state-inventory-sweep.md. _(2026-10-29T11:51:35.306Z)_

## Citations

- **[[c1]]** `analyze-bundle` `What a session-class handler can reach (TypeScript compiler walk of static and dynamic imports from src/daemon/threads/session-worker.ts, value imports only, within src/)`
- **[[c2]]** `analyze-bundle` `Size and shape of module-scope mutable declarations in that closure (same compiler walk, top-level variable statements)`
- **[[c3]]** `analyze-bundle` `The existing source-inventory guard to mirror (direct read of src/daemon/db/__tests__/connection-source-inventory.ts and src/daemon/db/__tests__/session-source-inventory.test.ts)`
- **[[c4]]** `analyze-bundle` `How s3 gave its four families one owner (direct read of src/daemon/threads/method-class.ts and its tests)`
- **[[c5]]** `analyze-bundle` `Tests to extend (test.locate over threads and inventory)`
- **[[c6]]** `doc` `plans/module-state-inventory-sweep.md`
