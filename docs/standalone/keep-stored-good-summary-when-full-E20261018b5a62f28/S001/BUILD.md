<!-- insrc:artifact BUILD-b5a62f289cbcdaee-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-18T16:46:42.113Z  ·  **Updated:** 2026-10-18T16:59:40.908Z

**Commit:** d1fb60c9

## Scope

ISSUE-b5a62f28: restoreCarriedDocSummaries (src/db/doc-summaries.ts:339-362) keeps a summary already stored for the document when it has no error and the same contentHash (keepGoodSummary); a stored placeholder is still replaced. The result counts kept rows; the full index log line (src/indexer/index.ts:745) reports them. Test in src/db/__tests__/doc-summary-carry.test.ts.

## Summary

restoreCarriedDocSummaries now writes back with keepGoodSummary, so a good summary stored after the rebuild is kept and a stored placeholder is still replaced; the result and the full index's log line count keptGood. New test in doc-summary-carry.test.ts; db and indexer suites 860/860.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-b47dadc7cf0cccb1-S001.json` — **insrc-build** (2026-10-18T16:59:40.908Z)
- `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/BUILD.md` — **insrc-build** (2026-10-18T16:59:40.908Z)
