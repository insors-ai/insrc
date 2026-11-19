<!-- insrc:artifact BUILD-50cde239426d6e2a-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-11-19T11:43:57.160Z  ·  **Updated:** 2026-11-19T12:54:32.327Z

**Commit:** 072ca9303

## Summary

Per-field @ts-expect-error checks (verdict, severity, dimension, artifactId) only catch those specific names -- adding any other field, e.g. scopeId, would leave every existing check passing. Added a type-level Equal<keyof T, ...> assertion for both CommentEntry and ReviewContextRound: it fails to compile for an added or removed key of any name, since keyof T would then differ from the expected literal union. Verified by temporarily adding an unrelated scopeId field and confirming the typecheck fixture now fails to compile, then restoring.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/artifact-core/__tests__/comment-entry.test.ts` — **insrc-build** (2026-11-19T12:54:32.327Z)
- `src/workflow/artifact-core/__type-tests__/comment-entry.typecheck.ts` — **insrc-build** (2026-11-19T12:54:32.327Z)
- `src/workflow/artifact-core/types.ts` — **insrc-build** (2026-11-19T12:54:32.327Z)
