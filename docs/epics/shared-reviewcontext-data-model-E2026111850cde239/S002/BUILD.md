<!-- insrc:artifact BUILD-50cde239426d6e2a-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-19T10:10:20.217Z  ·  **Updated:** 2026-11-19T11:01:28.291Z

**Commit:** 4fb9abd16

## Summary

Post-approval fix from an external review of pinned revision 5120ab5ad: the mustBeAbsent check reused isPopulated(), which treats [] as absent (correct for the required direction, wrong for mustBeAbsent). A design Scope at def/hld/lld, or a code Scope at plan, passed validation with tasks: [] even though the LLD specifies that direction as scope[field] !== undefined. Split into isRequiredSatisfied (array-aware) and isAbsent (strict !== undefined), with regression tests for both validator families. Verified by temporarily disabling the new isAbsent check and confirming 4 tests (including both new regressions) correctly fail.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/artifact-core/__tests__/scope.test.ts` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `src/workflow/artifact-core/__type-tests__/scope.typecheck.ts` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `src/workflow/artifact-core/types.ts` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `src/workflow/artifact-core/__tests__/scope-checks.test.ts` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `src/workflow/artifact-core/scope-checks.ts` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `.insrc/artifacts/HLD-50cde239426d6e2a.json` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `.insrc/artifacts/LLD-50cde239426d6e2a-s2.json` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/HLD.md` — **insrc-build** (2026-11-19T11:01:28.291Z)
- `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/S002/LLD.md` — **insrc-build** (2026-11-19T11:01:28.291Z)
