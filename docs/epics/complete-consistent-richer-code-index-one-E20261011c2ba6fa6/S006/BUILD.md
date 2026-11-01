<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-11-01T08:48:41.494Z  ·  **Updated:** 2026-11-01T10:19:27.313Z

**Commit:** 684b25450

## Summary

addRepo() calls proposeIgnoreFile before building the repo's FileFilter, so a repo added with no root ignore file has one before the first full index runs (688056149). Follow-up 66e0566c0 wires a real cheap-tier model (cheapTierIgnoreModel, built like the summariser's provider, resolved per call) into both daemon IndexerService construction sites; before it, production always wrote the fallback file.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t6`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `package.json` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/file-filter.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/file-filter.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/watcher.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/ignore-proposal-model.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/ignore-proposal-model.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/ignore-dirs.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/repo-ignore-config.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/source-roots.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/__tests__/watcher-file-filter.test.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/repo-ignore-config.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
- `src/indexer/source-roots.ts` — **insrc-build** (2026-11-01T10:19:27.313Z)
