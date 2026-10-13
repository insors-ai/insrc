<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T13:28:59.818Z

**Commit:** 34c8c765

## Summary

runAnalyze now checks the request's scope right after classification, before it measures or announces a size: an unindexed scope or a repository under index is refused at 'classify' with the same code, message and data as before (code and docs alike, and without the two model calls a docs request used to make first), and the context builder is told the scope was checked.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T13:28:59.818Z)
