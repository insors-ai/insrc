<!-- insrc:artifact BUILD-5f7a7cb95b643ae5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-04T15:17:30.878Z  ·  **Updated:** 2026-10-04T15:20:39.365Z

**Commit:** 539af4c

## Summary

t1: git_diff accepts an optional exclude list of repo-root globs, applied by git to both the diff body and the numstat file list. t2: changedFiles forwards excludeGlobs to all three diffs and exports LEDGER_EXCLUDE_GLOBS. Tests run against real git; every mutation of each production change turned its suite red (8 for t1, 11 for t2).

## Tasks validated

- ✗ `t1`
- ✗ `t2`

## Changes

- `.insrc/artifacts/PLAN-5f7a7cb95b643ae5-S001.json` — **insrc-build** (2026-10-04T15:20:39.365Z)
- `src/daemon/tools/builtins/git/__tests__/diff.test.ts` — **insrc-build** (2026-10-04T15:20:39.365Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-10-04T15:20:39.365Z)
- `src/workflow/runners/build/__tests__/changed-files.test.ts` — **insrc-build** (2026-10-04T15:20:39.365Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-04T15:20:39.365Z)
