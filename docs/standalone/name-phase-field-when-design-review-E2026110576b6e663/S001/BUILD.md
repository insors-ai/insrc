<!-- insrc:artifact BUILD-76b6e6635afe5530-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T04:31:47.694Z  ·  **Updated:** 2026-11-05T04:32:35.161Z

**Commit:** 13dce397d

## Scope

Fix ISSUE-76b6e6635afe5530 (docs/standalone/name-phase-field-when-design-review-E2026110576b6e663/ISSUE.md): a malformed design review request is refused with a message naming its phase and the first offending field; an unknown or missing phase lists the valid phases; code invalid_schema and class DesignReviewInputError unchanged; valid requests stay valid.

## Triage rationale

bugfix, magnitude small: one cause in parseDesignRequest (design-review/contracts.ts)

## Summary

parseDesignRequest keeps the union check; when it fails with invalid_schema, refuseUnmatchedRequest picks the schema by the request's phase and refuses with '<phase> request: <path>: <message>', or with 'phase: Expected one of …' for an unknown or missing phase. Code invalid_schema and class DesignReviewInputError unchanged; valid requests unchanged. One new test in recovery-contracts.test.ts (fails without the fix); the 82 design-review tests pass. Left out: parts 1 and 3 of #101.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-76b6e6635afe5530.json` — **insrc-build** (2026-11-05T04:32:35.161Z)
- `.insrc/artifacts/ISSUE-76b6e6635afe5530.log.jsonl` — **insrc-build** (2026-11-05T04:32:35.161Z)
- `docs/standalone/name-phase-field-when-design-review-E2026110576b6e663/ISSUE.md` — **insrc-build** (2026-11-05T04:32:35.161Z)
- `src/workflow/review/design-review/__tests__/recovery-contracts.test.ts` — **insrc-build** (2026-11-05T04:32:35.161Z)
- `src/workflow/review/design-review/contracts.ts` — **insrc-build** (2026-11-05T04:32:35.161Z)
