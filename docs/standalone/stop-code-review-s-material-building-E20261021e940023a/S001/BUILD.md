<!-- insrc:artifact BUILD-e940023a6962ede9-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-21T09:43:51.737Z  ·  **Updated:** 2026-10-21T09:51:22.242Z

**Commit:** 448aaf71

## Scope

Make building and summarising the code review's material (src/workflow/review-pipeline/adapters/code-review-material.ts) scale with the material's size rather than its square, with byte-for-byte identical output: compute the name map and each atom's callers and callees once per material instead of on every neighbourSummary call, and pair atoms only within their directory group in codeReviewMaterial, keeping today's relation order. Signatures unchanged. Tests: identical output, and a time bound on a large synthetic material.

## Triage rationale

bugfix/small (ISSUE-e940023a): two quadratic functions in one file freeze the daemon on a large review; a localized performance change with identical output.

## Summary

neighbourSummary reads a name map and call adjacency built once per material (WeakMap-keyed on its arrays); codeReviewMaterial pairs atoms only within their directory group in the old order and appends name buckets in place (the first gate turn found the per-row bucket copy still quadratic). Output is pinned identical against a verbatim copy of the old implementation; 1000 atoms summarise in 6 ms (was 1.6 s); 50000 same-named atoms build in about 45 ms (was 3.6 s).

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` — **insrc-build** (2026-10-21T09:51:22.242Z)
- `src/workflow/review-pipeline/adapters/code-review-material.ts` — **insrc-build** (2026-10-21T09:51:22.242Z)
- `.insrc/artifacts/CR-e940023a6962ede9-S001.json` — **insrc-build** (2026-10-21T09:51:22.242Z)
- `docs/standalone/stop-code-review-s-material-building-E20261021e940023a/S001/CR.md` — **insrc-build** (2026-10-21T09:51:22.242Z)
