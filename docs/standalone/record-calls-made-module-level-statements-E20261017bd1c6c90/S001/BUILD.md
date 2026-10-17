<!-- insrc:artifact BUILD-bd1c6c9005ff6390-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T09:39:24.421Z  ·  **Updated:** 2026-10-17T09:51:00.367Z

**Commit:** 553b3204

## Summary

extractClass credits calls in non-function field initializers (public_field_definition in TypeScript, field_definition in JavaScript) and in the constructor body to the class entity, one CALLS per callee per class; a function-valued field credits no caller. generator_function is a function value, so a generator-valued declarator gets its own function entity. Six mutations each fail the new tests. Left out: class static blocks.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/DEF-670419c4ad8bea8e.json` — **insrc-build** (2026-10-17T09:51:00.367Z)
