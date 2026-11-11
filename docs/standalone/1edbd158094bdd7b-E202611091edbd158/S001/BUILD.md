<!-- insrc:artifact BUILD-1edbd158094bdd7b-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-09T18:44:00.932Z  ·  **Updated:** 2026-11-09T18:45:16.073Z

**Commit:** 114ade9f2

## Scope

Add a short rule to the insrc steering (src/prompts/steering-block.md) so agents keep the user informed during long work. Two points only: (1) group activities into small batches with intermediate updates rather than one long-running batch; (2) no silent chaining of activities such as reviews and test runs. It adds no new stops for user approval beyond the existing guidelines and no thresholds; agents publish progress to chat and carry on.

## Triage rationale

A short wording addition to one steering file. The user has fixed the content (two points, no thresholds, no new approval stops), so there is no design choice. Sections are addressed by marker pairs, so a new front-door section outside the markers does not change what the guide sections serve.

## Summary

Added a short front-door section to src/prompts/steering-block.md: group long work into small batches with a chat update after each, do not chain reviews and test runs silently, and carry on without new approval stops. No test was added for this prose. Of the 10 steering-related test files run, 8 tests failed: 7 also fail on the previous commit, and the eighth in task-review.test.ts is intermittent (passed 2 of 3 runs alone on this commit).

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/prompts/steering-block.md` — **insrc-build** (2026-11-09T18:45:16.073Z)
