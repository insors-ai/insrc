<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T13:21:10.640Z

**Commit:** 0ae37186

## Summary

runShaper now reads its cache before resolving the request's scope; every bundle records the repository it was built over (repoPath, or null), and a hit is checked against that repository alone: refused while it is under index, a miss once it has been reindexed, and a bundle from before the change is a miss.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T13:21:10.640Z)
