<!-- insrc:artifact BUILD-47cc3068c78cac34-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-22T14:10:28.124Z  ·  **Updated:** 2026-10-22T14:10:47.685Z

**Commit:** 8074aab4

## Scope

ISSUE-47cc3068c78cac34: in src/workflow/__tests__/review-decision.test.ts, the BUILD-record test ('handleReviewDecision on a BUILD record: approve goes through the same approve call ...') works in its temporary repository's real path, so it expects the artifact path the handler uses (the handler resolves real paths). No production code changes; the assertion keeps its meaning.

## Triage rationale

Small bugfix routed issue -> build (no LLD), per approved ISSUE-47cc3068c78cac34.

## Summary

Fixed ISSUE-47cc3068. The review-decision BUILD-record test now creates its temporary repository at its real path (realpathSync), so on macOS it expects the /private/var path the handler passes to approve. No production code changed; all 9 tests in the file pass.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-22T14:10:47.685Z)
