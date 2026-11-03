<!-- insrc:artifact BUILD-1ad687e69c9218de-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T08:06:43.031Z  ·  **Updated:** 2026-11-03T08:32:54.582Z

**Commit:** f4d469ba3

## Summary

Member calls with built-in method names are kept on receivers proven user objects by a type or a new expression: class fields and constructor parameter properties typed with a user class or defaulted/initialised with new X(), this.x = new X() assignments, typed or new-defaulted parameters, const/let and var locals, and values asserted to a user class (as / satisfies / <T>), looking through parentheses and !. Class field proofs are per class (class, class expression and abstract class are boundaries), and `this` proves a receiver only where it is the class instance (class method, field initialiser, or an arrow inside one). Built-in classes, unions, arrays, primitives and untyped values never prove one. Mutation-checked.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` — **insrc-build** (2026-11-03T08:32:54.582Z)
- `src/indexer/parser/typescript.ts` — **insrc-build** (2026-11-03T08:32:54.582Z)
