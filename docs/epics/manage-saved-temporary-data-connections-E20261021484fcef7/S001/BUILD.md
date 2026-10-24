<!-- insrc:artifact BUILD-484fcef7efaf229e-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-24T08:23:58.478Z  ·  **Updated:** 2026-10-24T08:30:48.653Z

**Commit:** 119d66734

## Summary

Corrected t1 validation findings: SQLite URL.pathname preserves percent escapes; a real two-file SQLite test proves the behavior and explicit-path precedence. CM-S1-A now uses isolated existing save/load ports to edit labels and verify every retained supported field, unknown field and top-level metadata survives for all 29 kinds. Three focused tests pass; production behavior unchanged. Full sweep remains blocked by two reproduced pre-existing-test shutdown assertion failures; no green sweep or Story completion claimed.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.
