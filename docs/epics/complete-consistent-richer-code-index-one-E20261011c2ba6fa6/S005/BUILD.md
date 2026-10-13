<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T12:45:35.350Z

**Commit:** 2cec35d1

## Summary

A throw from the last-indexed read (at runShaper's freshness check or inside the pipeline) and from the lookup executor are now the named pipeline causes 'index-state-read-failed' and 'lookup-failed', each with its own typed error and code on both the daemon and plan-tree mappings, instead of a raw rejection reported as internal-error.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T12:45:35.350Z)
