<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-11-01T08:48:41.494Z  ·  **Updated:** 2026-11-01T10:35:33.944Z

**Commit:** 9b36bd798

## Summary

concept-resolve.ts, module-profile.ts and infra/_shared.ts drop their bare-name lists; directories are pruned by excludesDirectory (the FileFilter walk's own pruning rule, so an unreadable directory is still reported) and files by FileFilter.includes; walkFiles roots its filter at the enclosing git repository. Also fixed a t2 FileFilter defect: .git/ contents were listed as included files (now a built-in exclusion). Wide run of src/indexer + src/analyze: 1464 pass, 2 fail (pinned old SKIP_DIRS note + a no-ignore-file measure fixture), both updated in 9b36bd798 and re-run green.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t6`
- ✓ `t5`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `package.json` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/file-filter.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/file-filter.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/watcher.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/ignore-proposal-model.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/ignore-proposal-model.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/ignore-dirs.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/repo-ignore-config.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/source-roots.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/__tests__/watcher-file-filter.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/repo-ignore-config.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/indexer/source-roots.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/explore/__tests__/file-filter-walkers.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-11-01T10:35:33.944Z)
