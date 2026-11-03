<!-- insrc:artifact PLAN-1ad687e69c9218de-S001 -->

# Plan: E202611031ad687e6:S001

## Summary

**Epic:** `typescript-reader-drops-calls-user-functions`
**LLD run:** `wf-1793687010733-gsei9y`
**LLD effective hash:** `140afac384d0...`

Building this fix means changing one decision in the TypeScript reader's call walk so a built-in method name drops a call only when its receiver is not known to be user code: first the shapes that need no types (bare calls, this/super, imports), then receivers proven by a type annotation or a new expression on fields, parameters and locals, and finally proving the restored calls resolve correctly and show up on the installed daemon after a re-index.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Bare, this/super and import-bound calls are kept whatever the name | M | — | unit: S001 t1: bare calls to user functions named like built-ins are kept; bare global functions are not; unit: S001 t1: calls on this, super and import bindings are kept whatever the name; a local shadowing an import is not; unit: S001 t1: built-in-named member calls on untyped locals and built-in objects record no row, and import bindings do not leak to the next file | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Typed and new-created fields, parameters and locals prove a user receiver | M | `t1` | unit: S001 t2: calls on typed, new-initialised and constructor-assigned fields are kept whatever the name; unit: S001 t2: calls on typed parameters and new-initialised locals are kept; built-in, array, union and untyped receivers are not; unit: S001 t2: field proofs do not leak across classes or files, and JavaScript follows the same rules | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Resolution integration, installed-daemon smoke and the full sweep | M | `t1`, `t2` | integration: S001 t3: the restored calls resolve to the user definitions and items.find() links to no user find; smoke: S001 t3: the installed daemon shows callers of a built-in-named function after index and repo.reindex | [[c2]] [[c5]] [[c6]] |

### 1.1 E202611031ad687e6:S001:T001 — Bare, this/super and import-bound calls are kept whatever the name

In src/indexer/parser/typescript.ts, collect the file's import-bound local names per parse (default, namespace, named, aliased) and change the walkForCalls filter: BUILTIN_METHODS no longer applies to bare calls or to member calls on this, super or an import-bound identifier; BUILTIN_OBJECTS still applies. The import bindings form the outermost receiver scope so a nearer local or parameter declaration shadows them. Add reader unit tests.

**Acceptance checks:**
- A bare call to parse/find/create records a CALLS row; bare setTimeout/require record none
- this.find() and super.emit() record rows
- Calls on default, namespace, named and aliased import bindings record rows; a local that shadows an import name does not
- Built-in-named member calls on untyped locals and built-in object receivers record no row
- Import bindings of one file do not apply to the next file parsed

### 1.2 E202611031ad687e6:S001:T002 — Typed and new-created fields, parameters and locals prove a user receiver

In the reader, collect per class the this.<field> names whose field or constructor parameter property is typed with a non-built-in class, initialised with new X() of one, or assigned this.<field> = new X(); and per scope (the existing frame) the parameters and locals declared that way. A fixed built-in class list, unions, arrays, primitives and function types never prove a user object. Member calls on proven receivers are kept whatever the name. Add reader unit tests.

**Acceptance checks:**
- this.store.find() is kept for a typed field, a constructor parameter property, a new-initialised field and a this.store = new Store() assignment
- repo.find() is kept for a typed parameter and for a new-initialised local
- Receivers typed Promise/Map/EventEmitter/Item[]/Array<Item>/a union, or untyped, record no row for built-in method names
- Class field proofs do not leak to another class or the next file
- In a .js file, a call on a new-initialised local is kept and one on an untyped local is dropped

### 1.3 E202611031ad687e6:S001:T003 — Resolution integration, installed-daemon smoke and the full sweep

Over a temporary store and real files, the restored calls resolve to the user definitions (bare imported parse, this-call, field call, namespace-import call) and items.find() beside a same-file function find creates no edge. After the push, on the installed daemon, a small TypeScript repository shows callers of a built-in-named user function after index and after repo.reindex. Then run the full sweep per directory.

**Acceptance checks:**
- The integration test shows each restored call resolved and no edge from items.find() to the user find
- Smoke evidence file: callers appear after index and after repo.reindex on the installed daemon
- Full sweep recorded with every failure classified

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| walkForCalls in src/indexer/parser/typescript.ts | `t1`, `t2` |
| resolution of the restored calls through the cross-file resolver | `t3` |
| installed daemon search.callers after index and repo.reindex | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api walkForCalls`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges CALLS rows the TypeScript reader emits`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges per-file, per-class and per-scope receiver proofs`
- **[[c4]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c5]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c6]]** `prior-artifact` `LLD S001 migration`
