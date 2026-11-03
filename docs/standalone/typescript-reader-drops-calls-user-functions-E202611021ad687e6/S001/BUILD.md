<!-- insrc:artifact BUILD-1ad687e69c9218de-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T08:06:43.031Z  ·  **Updated:** 2026-11-03T08:20:30.043Z

**Commit:** a0d1fe628

## Summary

The built-in method filter drops only member calls on receivers not proven user objects: bare calls (except global functions), this/super calls and calls on the file's import bindings are kept whatever the name. The receiver scope stack is built from the AST (imports, every enclosing function/block/loop/switch/catch scope, the body). Bindings follow JavaScript: parameters, destructuring targets (not defaults or computed keys), loop bindings, const/let per block or switch, var per function (statements and for-in/of headers), nested function/class/abstract class/enum/namespace declarations, and a named function expression's own name shadow imports in their scope, closures included. Mutation-checked.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` — **insrc-build** (2026-11-03T08:20:30.043Z)
- `src/indexer/parser/typescript.ts` — **insrc-build** (2026-11-03T08:20:30.043Z)
