<!-- insrc:artifact ISSUE-1ad687e69c9218de -->

# TypeScript reader drops calls to user functions that share a built-in method's name

## Reproduction

1. In a TypeScript repository, define `export function parse(s: string) { ... }` in one file and call it from another: `import { parse } from './p.js'; export function run() { return parse('x'); }` (the same happens for a method called on a user object, e.g. `this.store.find(id)` or `registry.create(spec)`).
2. Index the repository and ask for the callers of `parse` (or the callees of `run`).
Observed: no CALLS edge from `run` to `parse`; the call graph says `parse` has no callers. Any user function or method named parse, stringify, find, filter, map, reduce, create, assign, resolve, reject, all, emit, on, once, log, info, warn, error, debug, call, apply, bind, keys, values, entries, at, join, split, replace, match, push, pop, slice, sort, etc. loses every call to it.
Expected: calls to user-defined functions and methods are recorded whatever their name, while calls to genuine built-ins (`arr.map(...)`, `JSON.parse(...)`, `promise.then(...)`) still do not produce false CALLS edges to a user function that happens to share the name.

## Root cause

The TypeScript reader's call walker drops a callee by name alone: it records a CALLS row only when the callee name is in neither BUILTIN_OBJECTS nor BUILTIN_METHODS (src/indexer/parser/typescript.ts:1013-1014). resolveCalleeName returns the bare identifier for `foo()` and the property name for `obj.foo()` (src/indexer/parser/typescript.ts:1043-1060); only a receiver that is itself a built-in object (console, JSON, Math, ...) is filtered by the receiver. BUILTIN_METHODS (src/indexer/parser/typescript.ts:759-782) lists common Array/String/Object/Promise/Function/Events/console/JSON method names, so the filter cannot tell a built-in `arr.map()` from a user `map()` or `repo.find()`: both are skipped. No other language reader applies a name list like this. Removing names from the list alone would let name-based cross-file resolution link built-in calls such as `items.find(...)` to an unrelated user function named `find` (src/indexer/cross-file-resolver.ts resolves unresolved CALLS rows by name).

## Fix intent

Calls to user-defined TypeScript functions and methods are recorded whatever their name, including names shared with built-in methods, and calls to genuine built-in methods do not create false CALLS edges to user code that happens to share the name. Existing repositories regain the missing edges on re-index. Tests cover a bare call and a member call to a user function named like a built-in, and a built-in call next to a same-named user function.

## Citations

- **[[c1]]** `code` `src/indexer/parser/typescript.ts:1013-1014` — "const calleeName = resolveCalleeName(funcNode);
if (calleeName && !seen.has(calleeName) && !BUILTIN_OBJECTS.has(calleeName) && !BUILTIN_METHODS.has(calleeName)) {"
- **[[c2]]** `code` `src/indexer/parser/typescript.ts:759-782` — "const BUILTIN_METHODS = new Set([ 'push', 'pop', ... 'find', 'filter', 'map', ... 'create', ... 'resolve', ... 'emit', 'on', 'once', ... 'log', ... 'stringify', 'parse', ]);"
- **[[c3]]** `code` `src/indexer/parser/typescript.ts:1043-1060` — "if (node.type === 'identifier') { return node.text; } ... if (object?.type === 'identifier' && BUILTIN_OBJECTS.has(object.text)) { return null; } return propName;"
- **[[c4]]** `code` `src/indexer/cross-file-resolver.ts`
- **[[c5]]** `stakeholder` `Observed 2026-11-02 while writing Epic c2ba6fa6 s8 tests: a fixture function named parse produced no CALLS edge and had to be renamed.`
