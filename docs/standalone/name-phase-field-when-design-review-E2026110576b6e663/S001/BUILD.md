<!-- insrc:artifact BUILD-76b6e6635afe5530-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T04:31:47.694Z

**Commit:** b1d772725

## Scope

Fix ISSUE-76b6e6635afe5530 (docs/standalone/name-phase-field-when-design-review-E2026110576b6e663/ISSUE.md): a malformed design review request is refused with a message naming its phase and the first offending field; an unknown or missing phase lists the valid phases; code invalid_schema and class DesignReviewInputError unchanged; valid requests stay valid.

## Triage rationale

bugfix, magnitude small: one cause in parseDesignRequest (design-review/contracts.ts)
