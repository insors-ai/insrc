<!-- insrc:artifact LLD-1ad687e69c9218de-S001 -->

# LLD: E202611031ad687e6:S001

## Summary

**Epic:** `typescript-reader-drops-calls-user-functions`
**HLD base run:** `wf-1793687010733-gsei9y`
**HLD effective hash:** `140afac384d0...`

The TypeScript reader stops dropping calls to user code just because the callee shares a name with a built-in method. A bare call such as `parse()` is always recorded, and so is a member call whose receiver is known to be a user object: `this` or `super`, a name the file imports (`ns.parse()`, `registry.create()`), a class field typed as or created with a non-built-in class (`this.store.find(id)`), or a parameter or local typed as or created with one (`repo.find(id)`). A member call with a built-in method name on any other receiver (`items.map()`, `p.then()`, an untyped local) is still dropped, so name-based resolution cannot link built-in calls to same-named user functions. Existing repositories pick up the restored calls when they are re-indexed.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `walkForCalls`

```typescript
function walkForCalls(node: SyntaxNode, callerId: string, repo: string, filePath: string, relations: Relation[], seen: Set<string>, axiosScopes: AxiosScope[], skip?: (n: SyntaxNode) => boolean): void
```

**Parameters:**
- `node: SyntaxNode` — subtree walked for call_expression nodes (unchanged)
- `callerId: string` — the calling entity (unchanged)
- `repo: string` — repository root (unchanged)
- `filePath: string` — file being read (unchanged)
- `relations: Relation[]` — CALLS rows are appended here (unchanged)
- `seen: Set<string>` — callee names already recorded for this caller (unchanged)
- `axiosScopes: AxiosScope[]` — HTTP-client scope frames (unchanged)
- `skip: (n: SyntaxNode) => boolean` _(optional)_ — subtrees to skip (unchanged)

**Returns:** `void` — Appends CALLS rows; signature unchanged.

**Errors:**
- `none` when The walk does not throw; an unrecognised callee shape yields no row, as today.

**Preconditions:**
- The file's import-bound local names are collected once per parse; the class's user-object fields are collected when the walk enters a class; each scope's user-object names are collected when the walk enters that scope (per-file and per-walk state, reset at the start of each parse).

**Postconditions:**
- A call whose callee is a bare identifier records a CALLS row unless the name is in BUILTIN_OBJECTS (global functions such as setTimeout, parseInt, require); BUILTIN_METHODS no longer applies to bare calls.
- A member call whose receiver is proven a user object records a CALLS row for the property name, whatever the name. Proven: `this` or `super`; `this.<field>` where the enclosing class declares the field or a constructor parameter property with a type that names a non-built-in class, or initialises it with `new X()` of a non-built-in class, or assigns `this.<field> = new X()`; an identifier whose nearest declaring scope declares it with such a type annotation or `new` initialiser, the file's import bindings (default, namespace, named, aliased) forming the outermost scope.
- A type proves a user object only when it is a single type name (optionally generic, e.g. `Repo<T>`) that is not on the built-in class list; unions, intersections, array types, function types, literal and primitive types never do.
- Any other member call whose property name is in BUILTIN_METHODS records no row, as today; a member call on a BUILTIN_OBJECTS receiver records no row, as today.
- Rows are otherwise unchanged: kind CALLS, from the caller, to the bare name, resolved false, one per callee name per caller (the seen set).

### 2.2 `resolveCalleeName`

```typescript
function resolveCalleeName(node: SyntaxNode): string | null
```

**Parameters:**
- `node: SyntaxNode` — the call_expression's function node (unchanged)

**Returns:** `string | null` — Unchanged: the identifier, or the member property name; null for a BUILTIN_OBJECTS receiver.

**Postconditions:**
- Unchanged; the receiver-aware method-name decision is made in walkForCalls, where the receiver shape is known.

## 3. Data model changes

### 3.1 `per-file, per-class and per-scope receiver proofs in the TypeScript reader` — new

Three in-memory sets, none stored: (1) per parse, the local names the file's import statements bind (default name, namespace name of `import * as ns`, each named import's local name or alias); (2) per class, the `this.<field>` names whose field or constructor parameter property is typed with a non-built-in class name, initialised with `new X()` of one, or assigned `this.<field> = new X()` - collected alongside currentClassHttpFields and switched with it for nested classes; (3) per lexical scope, in the existing frame the call walk pushes (AxiosScope, which gains a set of user-object names), the parameters and locals declared with such a type annotation or `new` initialiser; the import bindings form the outermost frame. A receiver identifier resolves against the nearest frame that declares it, so a local or parameter shadows an import or outer local. All are reset per parse, like currentClassHttpFields, fileCallsSeen and messagingEnabled.

**Call sites:**
- `src/indexer/parser/typescript.ts:115-119`
- `src/indexer/parser/typescript.ts:620`
- `src/indexer/parser/typescript.ts:804-822`
- `src/indexer/parser/typescript.ts:857-904`
- `src/indexer/parser/typescript.ts:946`

### 3.2 `CALLS rows the TypeScript reader emits` — invariant-change

More rows: bare calls and this/super/imported-receiver member calls whose callee shares a built-in method name are now emitted. They resolve through the existing resolveCall rules (same-file name, then exported entities of imported files), unchanged. Built-in-named member calls on other receivers stay unemitted, so the invariant that built-in calls create no edge to user code still holds. Stored edges change for existing repositories only when files are re-read (an edit, or repo.reindex).

**Call sites:**
- `src/indexer/parser/typescript.ts:1013-1022`
- `src/indexer/cross-file-resolver.ts:729-781`

## 4. Error paths

**Error cases**

- **An import statement the reader cannot read names from (unusual syntax, a parse error inside the import)** (recoverable)
  - Detection: The import-binding collection finds no import_clause / named_imports child it recognises on that import_statement node
  - Response: That import binds no names; its receivers fall under the existing method-name filter
  - User impact: A call on such an import's name with a built-in method name stays missing, as today; never a false edge
- **A restored call resolves to the wrong same-named entity** (recoverable)
  - Detection: resolveCall finds the name in the same file or among exported entities of imported files; several candidates leave the row ambiguous (unchanged rule)
  - Response: Resolution rules are unchanged: one candidate resolves, several stay ambiguous, none stays unresolved
  - User impact: Same precision as for any other call name today

**Edge cases**

| Input | Expected |
| :--- | :--- |
| `export function parse() {}` in one file; `import { parse } from './p.js'; parse('x')` in another | A CALLS row to `parse`, resolved to the exported function |
| `this.find(id)` inside a class with a method `find` | A CALLS row to `find`, resolved to the same-file method |
| `import * as cfg from './config.js'; cfg.parse(text)` | A CALLS row to `parse` |
| `import { registry as reg } from './r.js'; reg.create(spec)` | A CALLS row to `create` (the alias is the bound name) |
| `constructor(private store: Store) {}` then `this.store.find(id)`; or `private store = new Store()`; or `this.store = new Store()` in the constructor | A CALLS row to `find` in each case |
| `function load(repo: Repo) { return repo.find(1) }`; `const r = new Repo(); r.find(1)` | A CALLS row to `find` in both |
| `items.find(x => x.ok)` with `items` untyped or typed `Item[]` / `Array<Item>` / `Map<K,V>`, in a file that also defines `function find()` | No CALLS row for `find` from that call |
| `const ns = []; ns.map(f)` inside a function while `ns` is also an import name | No row: the local declaration shadows the import |
| `p: Promise<T>`; `p.then(f)`; `e: EventEmitter`; `e.emit('x')` | No row: built-in classes on the fixed list |
| `x: Repo \| undefined`; `x.find(1)` | No row: a union never proves a user object (documented residual) |
| `const r = makeRepo(); r.find(1)` (no annotation, no `new`) | No row (documented residual: no type information) |
| `JSON.parse(s)`, `console.log(x)`, `Promise.all(ps)` | No row (built-in object receiver), as today |
| `setTimeout(fn, 1)`, `require('x')` called bare | No row (BUILTIN_OBJECTS still applies to bare calls) |
| A JavaScript file (.js/.jsx) read by the same reader | Same rules; without annotations only `new`-initialised receivers, imports and this/super prove a user object |

**Invariants to preserve**

- Calls on built-in objects (console, JSON, Math, Promise, ...) and bare calls to global functions (setTimeout, parseInt, require) produce no CALLS row. [[c1]]
- One CALLS row per callee name per caller (the seen set). [[c1]]
- resolveCall's same-file and imported-export rules are unchanged. [[c2]]
- No per-file reader state leaks into the next file (reset at the start of every parse). [[c3]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test), as in src/indexer/parser/__tests__/ and src/indexer/__tests__/`

**Test levels**

- **unit** — The reader's CALLS output for each call shape: bare calls; this/super calls; calls on default/namespace/named/aliased import bindings; on typed and `new`-initialised class fields, constructor parameter properties and `this.x = new X()` fields; on typed parameters and `new`-initialised locals - all emitted with built-in method names. Not emitted: built-in-named member calls on untyped locals, on receivers typed with built-in classes, arrays or unions, on a local that shadows an import, on built-in object receivers, and bare global functions. Per-file state does not leak to the next file.
  - Subjects: `walkForCalls in src/indexer/parser/typescript.ts`
  - Fixtures: `TypeScript source strings parsed with the TypeScript reader`
- **integration** — Over a temporary store and two real files: a bare call and a namespace-import call to a user `parse` resolve to it; a this-call resolves to the same-file method; `items.find()` beside a same-file `function find` creates no edge to it.
  - Subjects: `resolution of the restored calls through the cross-file resolver`
  - Fixtures: `temporary repository with TypeScript files, indexed with IndexerService`
- **smoke** — On the installed daemon after the push: a small TypeScript repository with a user `parse` called bare and through an import shows its callers through search.callers; repo.reindex of an existing repository restores callers of a built-in-named function.
  - Subjects: `installed daemon search.callers after index and repo.reindex`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `reader: a bare call to parse/find/create records a CALLS row`, `integration: a bare call to an imported user parse resolves to it` |
| `ac2` | `reader: this.find() and super.emit() record rows`, `reader: calls on default, namespace, named and aliased import bindings record rows`, `reader: calls on typed/new-initialised fields, constructor parameter properties, typed parameters and new-initialised locals record rows`, `integration: a this-call, a field call (this.store.find) and a namespace-import call resolve to the user definitions` |
| `ac3` | `reader: untyped locals, built-in-typed, array-typed and union-typed receivers, a local shadowing an import, built-in object receivers and bare global functions record no row for built-in method names`, `integration: items.find() beside a same-file function find creates no edge to it` |
| `ac4` | `reader: import bindings and class fields of one file do not apply to the next file parsed` |
| `ac5` | `smoke: callers of a built-in-named user function appear after index and after repo.reindex on the installed daemon` |

## 6. Migration

**State before:** The TypeScript reader drops every call whose callee name is on BUILTIN_METHODS, bare or member (src/indexer/parser/typescript.ts:1013-1022, s1 bundle 1), so user functions and methods named parse, find, create, emit, ... have no stored callers in any indexed repository (s1 bundle 4).

**State after:** The method-name filter applies only to member calls whose receiver is not proven a user object (this, super, an import, or a field/parameter/local typed as or created with a non-built-in class); such calls on user code are emitted and resolved by the unchanged resolver. Receivers with no type information stay filtered (documented limit). Repositories indexed before the change keep their old edges for unchanged files until re-read.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Ship the reader change; no schema or stored-data change. — ↩ rollbackable
2. Files re-read after the update (edited files, full indexes) gain the restored calls automatically. — ↩ rollbackable
3. For a complete call graph in an existing repository, run repo.reindex once (documented in the BUILD record and docs); until then unchanged files keep their old, smaller set of edges. — ↩ rollbackable

**Backward compat:** No API, IPC or storage change. The only visible difference is more CALLS edges: search.callers / callees and the analyzer now show calls to user functions and methods named like built-ins.

## 7. Alternatives considered

### 7.1 a1: Receiver-aware filter in the reader — **CHOSEN**

Apply the built-in method names only to member calls whose receiver is not known to be a user object; never to bare calls.

The reader keeps the built-in object filter (receivers and global functions such as JSON, console, setTimeout) and narrows the built-in METHOD filter by receiver: a bare call `parse()` is never dropped for its name; a member call is never dropped for its name when its receiver is proven a user object: (1) `this` or `super`; (2) `this.<field>` where the class declares the field (or a constructor parameter property) with a type naming a non-built-in class, initialises it with `new X()` of a non-built-in class, or assigns `this.<field> = new X()` in the constructor (collected per class, as collectClassHttpFields collects HTTP-client fields); (3) an identifier whose nearest declaring scope declares it with such a type annotation or `new` initialiser (parameters and locals, through the existing per-scope frames of the call walk), with the file's import bindings (default, namespace, named, aliased) as the outermost frame so a nearer local shadows an import. Any other member call with a built-in method name (`items.map()`, `p.then()`, an untyped local or field) is dropped as today. Built-in classes are a fixed list (Array, Map, Set, Promise, Date, RegExp, Error, Buffer, typed arrays, EventEmitter, utility types such as Record/Partial/Readonly, ...); unions, arrays (`T[]`) and primitive types never prove a user object. No resolver or storage change.

### 7.2 a2: Emit every call; filter built-ins at resolution

The reader stops filtering method names and marks built-in-named member calls; the resolver refuses to link a marked row by name.

Every call becomes a CALLS row; rows whose callee is a built-in method name on a member call carry a marker in meta. resolveCall resolves a marked row only when the receiver is this/super/an import binding, recorded in meta by the reader; otherwise it leaves the row unresolved.

**Rejected because:** Same edges as a1 at the cost of storing every built-in member call as a pending row.

### 7.3 a3: Drop the method-name filter

Remove BUILTIN_METHODS; keep only the built-in object filter.

Every member and bare call except those on built-in objects becomes a CALLS row resolved by name.

**Rejected because:** Violates fi-2.

## 8. References

- **[[c1]]** `code` `src/indexer/parser/typescript.ts:1013-1022` — "if (calleeName && !seen.has(calleeName) && !BUILTIN_OBJECTS.has(calleeName) && !BUILTIN_METHODS.has(calleeName)) {"
- **[[c2]]** `code` `src/indexer/cross-file-resolver.ts:729-781` — "const sameFile = (index.byFile.get(row.fromFile) ?? []).filter(e => sameFamily(e.language, language) && CALL_TARGET_KINDS.includes(e.kind) && e.name === row.rawTo && e.id !== row.fromEntity);"
- **[[c3]]** `code` `src/indexer/parser/typescript.ts:115-119` — "currentClassHttpFields = new Set();  // S001 (t3): reset per file; set per class"
- **[[c4]]** `code` `src/indexer/parser/typescript.ts:759-782` — "const BUILTIN_METHODS = new Set(["
- **[[c5]]** `code` `src/indexer/parser/typescript.ts:1043-1060` — "if (object?.type === 'identifier' && BUILTIN_OBJECTS.has(object.text)) {"
- **[[c6]]** `code` `src/daemon/handler-runtime.ts:678` — "'repo.reindex': async (params) => {"
- **[[c7]]** `prior-artifact` `docs/standalone/typescript-reader-drops-calls-user-functions-E202611021ad687e6/ISSUE.md`
- **[[c8]]** `code` `src/indexer/parser/typescript.ts:804-822` — "if (typeNode && /:\s*HttpClient\b/.test(typeNode.text)) {"
- **[[c9]]** `code` `src/indexer/parser/typescript.ts:857-904` — "interface AxiosScope { declared: Set<string>; axios: Set<string>; }"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-03T06:29:45.902Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
