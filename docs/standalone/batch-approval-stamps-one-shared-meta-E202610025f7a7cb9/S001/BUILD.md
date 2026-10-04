<!-- insrc:artifact BUILD-5f7a7cb95b643ae5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-04T15:17:30.878Z  ·  **Updated:** 2026-10-04T16:05:05.582Z

**Commit:** 0eafe7c

## Summary

t1: git_diff accepts an optional exclude list of repo-root globs, applied by git to both the diff body and the numstat file list. t2: changedFiles forwards excludeGlobs to all three diffs and exports LEDGER_EXCLUDE_GLOBS. t3: a per-Story build-start file with one shared reader, consulted first by the range-base resolver. t4: stampBuildStart and the single finished-build test. t5: the implement phase stamps on every admitted route and both BUILD writers exclude the stamp file. t6: the review subject measures from the Story's base without ledger files, with a three-step fallback to the old call. Tests run against real git and the real phases; every mutation of each production change turned its suite red (8, 11, 13, 29, 7 and 11).

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`

## Changes

- `.insrc/artifacts/PLAN-5f7a7cb95b643ae5-S001.json` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/daemon/tools/builtins/git/__tests__/diff.test.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/mcp/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/workflow/runners/build/__tests__/changed-files.test.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/workflow/runners/build/__tests__/range-base.test.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
- `src/workflow/runners/build/range-base.ts` — **insrc-build** (2026-10-04T16:05:05.582Z)
