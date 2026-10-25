<!-- insrc:artifact BUILD-61045de91faef1a0-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-24T15:40:09.558Z  ·  **Updated:** 2026-10-24T16:00:44.921Z

**Commit:** 50563f003

## Summary

Complete entity-index consumers with limit:1 readiness and repository-scoped indexed file watermarks. Include final migration/storage/analyze/review regression evidence in the named-test mapping. Task-specific suites pass; full backend sweep failures remain explicitly recorded.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/graph/__tests__/migration-v5-to-v6.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/__tests__/entity-memberships.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/db/__tests__/entity-scope-indexes.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/analyze/context/__tests__/scope.test.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-24T16:00:44.921Z)
