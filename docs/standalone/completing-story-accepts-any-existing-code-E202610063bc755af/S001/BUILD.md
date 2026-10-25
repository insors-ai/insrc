<!-- insrc:artifact BUILD-3bc755af91d494a8-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-24T13:16:45.643Z  ·  **Updated:** 2026-10-24T14:37:26.796Z

**Commit:** 620fe6278

## Scope

Implement approved ISSUE-3bc755af91d494a8: completing a Story requires a code review of its latest build, not an older review. Reject outdated or non-covering reviews with an actionable reason; preserve explicit override approval. Add regression coverage reviewing a Story, updating its build, and withholding completion until a fresh review exists.

## Triage rationale

Existing tracked small bugfix, approved by user; direct issue-to-build route.

## Summary

Require matching BUILD fingerprints and file coverage for completion; reject malformed or unbound reviews, retain explicit overrides and existing non-BUILD approval behavior.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-3bc755af91d494a8.json` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `.insrc/artifacts/ISSUE-3bc755af91d494a8.log.jsonl` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/__tests__/approve-build-freshness.test.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/__tests__/approve-build-record-completion.test.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/__tests__/helpers/other-party-review.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/code-review/__tests__/runner.test.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/code-review/build-freshness.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/code-review/gate.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-24T14:37:26.796Z)
