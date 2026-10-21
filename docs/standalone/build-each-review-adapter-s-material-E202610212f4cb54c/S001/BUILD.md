<!-- insrc:artifact BUILD-2f4cb54c0df2e9e0-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-21T10:30:47.316Z  ·  **Updated:** 2026-10-21T10:31:49.155Z

**Commit:** 6fe771a0

## Scope

Each review adapter builds its material once and every caller reads that same material (src/workflow/review-pipeline/code-review.ts modelDimensionAdapter's material()), so a divided review's cost no longer multiplies by its number of calls. Output identical; no caller, signature or contract changes. Test: the material is built once per adapter however many calls read it, and is the same material as before.

## Triage rationale

bugfix/small (ISSUE-2f4cb54c): material() rebuilds the whole review material on every call; a CPU profile of the frozen daemon put 57 of 60 s there.

## Summary

modelDimensionAdapter's material() is built on the first read and returned to every later one, instead of rebuilding the whole material per chunk, relation, validation and duplicate-stage call. A test reads it 51 times through a counting spec (coverage and quality): built once, the same object every time, and equal to a fresh adapter's material.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` — **insrc-build** (2026-10-21T10:31:49.155Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-21T10:31:49.155Z)
