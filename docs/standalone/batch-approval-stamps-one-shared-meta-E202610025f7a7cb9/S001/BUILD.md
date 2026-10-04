<!-- insrc:artifact BUILD-5f7a7cb95b643ae5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-04T15:17:30.878Z  ·  **Updated:** 2026-10-04T15:17:30.878Z

**Commit:** 29d1603

## Summary

t1: git_diff accepts an optional exclude list of repo-root globs, applied by git to both the diff body and the numstat file list. Seven tests against a real temporary repo; eight mutations of the production change each turn the suite red.

## Tasks validated

- ✗ `t1`

## Changes

- `.insrc/artifacts/PLAN-5f7a7cb95b643ae5-S001.json` — **insrc-build** (2026-10-04T15:17:30.878Z)
- `src/daemon/tools/builtins/git/__tests__/diff.test.ts` — **insrc-build** (2026-10-04T15:17:30.878Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-10-04T15:17:30.878Z)
