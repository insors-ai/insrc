<!-- insrc:artifact BUILD-50cde239426d6e2a-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-19T11:17:23.419Z  ·  **Updated:** 2026-11-19T11:21:21.247Z

**Commit:** a4bfa64af

## Summary

The two API-absence tests only filtered export names matching /reviewtargets/i, so a builder/merge/validator exported under any other name would slip through undetected. Replaced with an exhaustive check: every runtime export of the module is either an Error subclass or not a function at all (verified types.ts exports exactly 11 Error subclasses and nothing else), which directly proves no plain function -- for ReviewTargets or anything -- exists.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/artifact-core/__tests__/review-targets.test.ts` — **insrc-build** (2026-11-19T11:21:21.247Z)
- `src/workflow/artifact-core/__type-tests__/review-targets.typecheck.ts` — **insrc-build** (2026-11-19T11:21:21.247Z)
- `src/workflow/artifact-core/types.ts` — **insrc-build** (2026-11-19T11:21:21.247Z)
