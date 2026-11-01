<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-11-01T08:48:41.494Z  ·  **Updated:** 2026-11-01T11:16:25.089Z

**Commit:** 7c661c378

## Summary

Conformance against real git: FileFilter.listFiles equals git ls-files and FileFilter.includes equals git check-ignore over a fixture covering anchored, nested, negation, precedence, directory-only, globstar, exclude-file, tracked-override and forbidden re-include rules; a non-git copy leaves out the same files (ac9). It found and fixed a defect (nested no-separator patterns matched only at their own level). Real-repo check: 6,795 = 6,795 files. Full sweep vs pre-s6 baseline in S006/t12-evidence.md: all remaining failures pre-exist except CM-S5-GATE's pinned digest of src/daemon/index.ts (needs a stakeholder decision).

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
- ✓ `t12`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `package.json` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/file-filter.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/file-filter.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/watcher.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/ignore-proposal-model.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/ignore-proposal-model.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/ignore-dirs.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/repo-ignore-config.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/source-roots.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/watcher-file-filter.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/repo-ignore-config.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/source-roots.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/explore/__tests__/file-filter-walkers.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/config/paths.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/file-selection.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/file-selection.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/context/__tests__/repo-ignore-filter.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/analyze/context/repo-ignore-filter.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S006/t12-evidence.md` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T11:16:25.089Z)
- `src/indexer/__tests__/file-filter-git-conformance.test.ts` — **insrc-build** (2026-11-01T11:16:25.089Z)
