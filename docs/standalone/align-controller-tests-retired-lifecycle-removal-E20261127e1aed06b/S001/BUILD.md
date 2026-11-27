<!-- insrc:artifact BUILD-e1aed06b860a76cb-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-27T18:30:14.128Z

**Commit:** 2fca011a6

## Scope

Align controller tests with retired lifecycle removal: fix three stale baseline cases in scripts/__tests__/test-harness-commands.test.ts and test-harness-consumers.test.ts using the approved ISSUE-e1aed06b860a76cb scope. Keep production helpers/runtime/budgets unchanged and preserve current refusal, prepared-reader/drift, mutation and positive cleanup checks.

## Triage rationale

Approved small bugfix, magnitude small; no LLD/plan required. Exactly two controller test files with stale references to intentionally retired lifecycle implementation.
