<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T13:11:56.874Z

**Commit:** d721fee2

## Summary

A scope whose repository is being indexed, or whose last index ended in an error, is now refused with RepoIndexingError (code 'repo-indexing') stating how far the run got, by the analyzer's scope checks (ensureNonEmptyClosure for code and docs, resolveTaskScope for infra and data) and carried by both error mappings and the plan walk; an unreadable or empty registry and a connection scope are not refused.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T13:11:56.874Z)
