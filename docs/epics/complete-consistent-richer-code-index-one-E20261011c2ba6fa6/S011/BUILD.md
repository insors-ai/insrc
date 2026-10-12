<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T11:26:57.256Z

**Commit:** 9f1697eb

## Summary

ReviewStreamError, ReviewStreamFailure and the review request types (ReviewStreamOpts, ReviewArtifactStreamParams, CodeReviewStreamParams, CodeReviewStreamResult) move from src/mcp/daemon-stream.ts to src/shared/review-stream.ts; daemon-stream.ts re-exports them, so its importers and the routing tests are unchanged. The first validate turn mapped a review-routing title that does not exist; this mapping uses real titles from both routing files.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T11:26:57.256Z)
