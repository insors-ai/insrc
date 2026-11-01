<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-11-01T08:48:41.494Z  ·  **Updated:** 2026-11-01T10:49:57.271Z

**Commit:** 6a343240e

## Summary

createRepoIgnoreFilter is now a thin wrapper over createFileFilter (no git ls-files subprocess, no permissive non-git fallback); the RepoIgnoreFilter interface is unchanged and the commit 6a343240e touches only repo-ignore-filter.ts, its test and the inventory fixture, so none of the consumer files change. A non-git folder's answer now equals the equivalent git repo's (ac9 test). All src/analyze suites: 1120 pass, 0 fail, 93 skipped (live).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t6`
- ✓ `t5`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `package.json` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/file-filter.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/file-filter.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/watcher.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/ignore-proposal-model.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/ignore-proposal-model.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/ignore-dirs.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/repo-ignore-config.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/source-roots.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/watcher-file-filter.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/repo-ignore-config.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/source-roots.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/explore/__tests__/file-filter-walkers.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/config/paths.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/__tests__/file-selection.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/indexer/file-selection.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/context/__tests__/repo-ignore-filter.test.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
- `src/analyze/context/repo-ignore-filter.ts` — **insrc-build** (2026-11-01T10:49:57.271Z)
