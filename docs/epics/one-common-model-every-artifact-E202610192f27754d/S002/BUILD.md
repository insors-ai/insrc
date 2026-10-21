<!-- insrc:artifact BUILD-2f27754d4ad00b8e-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-20T17:17:06.359Z  ·  **Updated:** 2026-10-21T04:22:26.428Z

**Commit:** 97db113e

## Summary

Recorded the four s9 conversion inputs this Story leaves (flat amendments, envelope and lifecycle back-fill, feedback conversion, version marker) in docs/plans/core-data-model.md, with a test that pins them. Final checks: npm run build succeeds; the full sweep ran once after all tasks in foreground chunks: src/workflow/__tests__ 792 pass; src/workflow/*/__tests__ 722 pass (4 skipped); src/workflow/*/*/__tests__ 554 pass; src/mcp 113 pass; src/daemon/__tests__ 312 pass (12 skipped); src/daemon/steps 397 pass, 1 fail; src/daemon/db 350 pass, 1 fail; src/daemon/tools 167 pass. The sweep found two tests that pinned the old SyntaxError for a corrupt plan body (admit-build.test.ts); they now expect ArtifactShapeError, the error the LLD specifies for a head that fails the shared decoder. The two remaining failures are pre-existing and unrelated: the review-step gate-review-fix test (identifier-mismatch) fails identically on the commit before s2 started, and the SqliteDriver temporalTrend test fails before s2 as well. A pre-existing flaky hang in src/workflow/review/__tests__/source-root-reader.test.ts also occurs on that commit (1 of 6 runs).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`
- ✗ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✗ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-2f27754d4ad00b8e-s2.json` — **insrc-build** (2026-10-21T04:22:26.428Z)
