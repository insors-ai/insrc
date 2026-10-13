<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T14:10:42.058Z

**Commit:** e9eaa614

## Summary

The daemon's eleven graph-reading search requests that name a repository now refuse with 'repo-indexing: ...' (with how far the run has got) when that repository, or any root's, is under index; requests about ready repositories are answered as before, and an unreadable or empty registry refuses nothing.

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
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T14:10:42.058Z)
