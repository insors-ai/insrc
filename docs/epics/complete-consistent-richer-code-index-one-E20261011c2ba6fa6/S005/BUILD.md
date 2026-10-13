<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T13:56:46.991Z

**Commit:** 4f78c9d2

## Summary

A contract test calls each of the twelve graph-reading search requests over a real daemon's socket with the parameters they take today; the seed makes every parameter, required or optional, decide the answer, so renaming any one a handler reads fails the test (17 renames checked).

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

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T13:56:46.991Z)
