<!-- insrc:artifact BUILD-42411279eac2687e-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-19T17:10:25.303Z  ·  **Updated:** 2026-11-19T18:15:24.719Z

**Commit:** 872914494

## Scope

Decouple the Story/Epic completion rollup (completeThroughService / lifecycle.completeIfRolledUp) from the BUILD artifact's own approval state transition, so it can be retried after the fact. Let approveWorkflowTarget detect a BUILD whose own lifecycle.status is already 'completed' but whose Story (and/or Epic) has not itself reached 'completed', and run the rollup for it directly -- without requiring approveArtifactByJsonPath to execute a fresh, now-illegal transition first. Preserve the happy path (a fresh BUILD approval still completes and rolls up as today) and the review/override gate. Add a regression test alongside src/workflow/__tests__/story-completion.test.ts.

## Triage rationale

completeThroughService has exactly 2 callers (approveWorkflowTarget, approveOne), both in src/workflow/gates.ts.

## Summary

Added buildAwaitingRollupRetry(repoPath, jsonPath) to src/workflow/gates.ts: true for a BUILD whose own lifecycle.status is 'completed' but whose Story OR Epic has not itself completed (via the stillOpen helper). approveOne() checks this before attempting approveArtifactByJsonPath and, when true, retries the Story/Epic completion rollup (completeThroughService) directly instead of a now-impossible approval transition; pendingArtifactJsonPaths() also rejoins such a BUILD to the epicHash batch sweep. Two regression tests in story-completion.test.ts: one forces a BUILD to 'completed' with its Story still draft, the other with the Story completed but a sibling declared Story (and so the Epic) never completing; both verify a retry with a new override reason completes/advances without throwing IllegalTransitionError.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/story-completion.test.ts` — **insrc-build** (2026-11-19T18:15:24.719Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-19T18:15:24.719Z)
