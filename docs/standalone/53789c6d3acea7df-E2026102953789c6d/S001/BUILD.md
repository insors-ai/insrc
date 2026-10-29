<!-- insrc:artifact BUILD-53789c6d3acea7df-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-29T14:01:24.128Z  ·  **Updated:** 2026-10-29T14:04:54.612Z

**Commit:** d83c0a988

## Scope

Extend src/db/lance/__tests__/lance-cross-thread.test.ts so the Lance cross-thread regression gate covers several searching worker threads at once (as session workers do since Epic 86197ac6 s3) while writer workers write continuously, not just one writer and one searcher. Test-only change; the multi-searcher case was verified by hand on 2026-10-29.

## Triage rationale

Test-only and mechanical: one test file plus a small searcher worker helper; reuses the existing writer helper and searchEntityVecs.

## Summary

The Lance cross-thread gate now also runs three searching worker threads and the main thread against writer workers that write the whole 20 s window (GC pressure on both sides), the shape of a threaded daemon since s3. Both tests reset the entity-vector table cache. Passed 3 of 3 runs on lancedb 0.40.0; not re-run against 0.27.2 (a downgrade would change the shared node_modules another session uses).

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/lance/__tests__/helpers/cross-thread-searcher.ts` — **insrc-build** (2026-10-29T14:04:54.612Z)
- `src/db/lance/__tests__/lance-cross-thread.test.ts` — **insrc-build** (2026-10-29T14:04:54.612Z)
