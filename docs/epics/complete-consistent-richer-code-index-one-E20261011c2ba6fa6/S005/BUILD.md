<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T13:05:58.188Z

**Commit:** c9614ed3

## Summary

A full index now keeps an in-memory record of how far it has got (began, files selected, files done) and writes the run's final figures onto the registry row once, with its final status ('completed' with 'ready', 'failed' with the error with 'error'); the start-up re-queue is unchanged. A file's own error is caught and the file skipped, so a run that fails does so at a later step (manifest, clean-up, cross-file pass), after the walk.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T13:05:58.188Z)
