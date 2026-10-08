<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T07:22:29.995Z

**Commit:** 7a33090e

## Summary

Task t3: the search primitive reports what it left out (skipped files and directories, shortened lines, ripgrep's per-file limit, discarded output, a failed ripgrep run, each backend's exclusion rule), throws on an unreadable root, and the search tool labels such a failure 'search-failed'. The shell helper's result gains stdoutTruncated. Eight new tests pass under Node 22 on real directories and stand-in ripgrep binaries; eight mutations each make a test fail; the daemon tools (160), analyze (860 of 952, the rest skipped) and review (93) suites pass. One test seam was added to the search options (`_backend`) so a test can choose the ripgrep binary and its time limit.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/daemon/tools/builtins/search/grep.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-08T07:22:29.995Z)
