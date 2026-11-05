<!-- insrc:artifact BUILD-8b6f8b82ffa40e3f-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T05:34:54.231Z  ·  **Updated:** 2026-11-05T05:36:04.460Z

**Commit:** fbcd08ecb

## Scope

Fix ISSUE-8b6f8b82ffa40e3f (docs/standalone/reject-design-review-findings-rest-no-E202611058b6f8b82/ISSUE.md): assessDesignResult refuses (invalid_result) a chunk result that carries findings but inspected no reference; an honest incomplete (no findings, nothing inspected) and a partially inspected result stay valid.

## Triage rationale

bugfix, magnitude small: one cause in assessDesignResult (design-review/results.ts)

## Summary

assessDesignResult refuses with invalid_result a chunk result that carries findings but an empty inspectedReferences, before the coverage limitations are added, so the findings never reach consolidation. An honest incomplete (no findings, nothing inspected) and a partially inspected result with findings stay valid. New test in policy-results.test.ts (fails without the fix); the coordinator.test.ts fixture for findings plus verification gaps now inspects one reference (it used to report a finding with nothing inspected). The 83 design-review tests pass. Left out: part 1 of #101.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-8b6f8b82ffa40e3f.json` — **insrc-build** (2026-11-05T05:36:04.460Z)
- `.insrc/artifacts/ISSUE-8b6f8b82ffa40e3f.log.jsonl` — **insrc-build** (2026-11-05T05:36:04.460Z)
- `docs/standalone/reject-design-review-findings-rest-no-E202611058b6f8b82/ISSUE.md` — **insrc-build** (2026-11-05T05:36:04.460Z)
- `src/workflow/review/design-review/__tests__/coordinator.test.ts` — **insrc-build** (2026-11-05T05:36:04.460Z)
- `src/workflow/review/design-review/__tests__/policy-results.test.ts` — **insrc-build** (2026-11-05T05:36:04.460Z)
- `src/workflow/review/design-review/results.ts` — **insrc-build** (2026-11-05T05:36:04.460Z)
