# Build (plan-driven) — Story S001

**Standalone:** no  ·  **Created:** 2026-10-02T20:12:15.045Z  ·  **Updated:** 2026-10-03T05:28:54.835Z

**Commit:** 7eb67e2

## Summary

Fixes the label resolver on two independent defects, in src/workflow/tracker/resolve.ts only. (1) No dummy refs: buildRef now refuses a story-or-task-level reference unless the story actually exists, verified by a new storyEvidence helper admitting a story on either of two independent clauses — a story-scoped LLD/PLAN resolves for the ordinal, or the epic's definition artifact declares it (a DEF via body.stories, an ISSUE as one story at ordinal 1). Clauses degrade independently, so a corrupt DEF never disqualifies an epic whose LLD is intact. Gated on a supplied storyId, so epic-level calls are untouched, and deliberately not extended to tasks. (2) The reported regression: resolveByLabel's unscoped branch no longer refuses whenever more than one epic exists. It now asks which epics actually evidence the requested story and resolves when exactly one does. Because every ISSUE-anchored epic implies a story at ordinal 1, candidates are tiered — explicit evidence (an artifact or a DEF declaration) outranks the bare convention, and a tie within a tier refuses outright rather than falling through. That tiering was needed to reconcile two plan requirements that were mutually incompatible under a flat exactly-one-resolves rule; it is unrequested design and provisional. listEpicHashes and resolveByIssue are byte-identical to baseline, so the bugfix ISSUE stays a full epic peer and was not demoted. An independent cold review then found the first implementation 130x slower on unscoped lookups: it evaluated the evidence twice per epic and built a reference for every candidate to return one, while re-reading the 664-entry artifacts directory twice per epic. Candidacy is now decided by evidence alone, only the winner is built, and the listing is read once per sweep — 39.3ms to 2.3ms for a bare s1. The same change removed a silent-narrowing hazard where an epic with real evidence but unmintable identity dropped out of the tally, converting genuine ambiguity into a confident answer. Full sweep 4262 tests, 4133 pass, 1 fail (the pre-existing better_sqlite3 ABI failure, confirmed failing identically on the pre-story baseline). Six mutation proofs re-run at story end all invert.

## Tasks validated

- ✗ `t1`
- ✗ `t7`

## Changes

- `.insrc/artifacts/ISSUE-4510613183357b66.json` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `.insrc/artifacts/ISSUE-5f7a7cb95b643ae5.json` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `.insrc/artifacts/ISSUE-b955fa759c3c4309.json` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `.insrc/artifacts/PLAN-792f9324fc43d95c-S001.json` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `docs/standalone/regression-hierarchical-label-resolver-listepichashes-src-E20261002792f9324/S001/PLAN.md` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `docs/standalone/batch-approval-stamps-one-shared-meta-E202610025f7a7cb9/ISSUE.md` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `docs/standalone/five-acceptance-checks-approved-plan-issue-E2026100245106131/ISSUE.md` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `docs/standalone/six-low-severity-defects-found-independent-E20261002b955fa75/ISSUE.md` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `src/workflow/__tests__/id-resolve.test.ts` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `src/workflow/tracker/__tests__/tracker.test.ts` — **insrc-build** (2026-10-03T05:28:54.835Z)
- `src/workflow/tracker/resolve.ts` — **insrc-build** (2026-10-03T05:28:54.835Z)
