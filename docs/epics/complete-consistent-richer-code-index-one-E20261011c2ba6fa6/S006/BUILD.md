<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-11-01T08:48:41.494Z  ·  **Updated:** 2026-11-01T11:46:05.908Z

**Commit:** c8a1b9942

## Summary

Re-validated after code-review round 1 (c8a1b9942): conformance against git now also covers a repository registered at a subdirectory of a git working tree, symbolic links, a nested repository, and exclude-vs-global precedence with XDG_CONFIG_HOME. Real-repo re-check: insrc 6,796 = 6,796 files; vscode-plugin/ as a subdirectory 302 = 302.

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

- `package-lock.json` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `package.json` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/file-filter.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/file-filter.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/watcher.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/ignore-proposal-model.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/ignore-proposal-model.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/ignore-dirs.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/repo-ignore-config.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/source-roots.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/watcher-file-filter.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/repo-ignore-config.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/source-roots.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/explore/__tests__/file-filter-walkers.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/explore/module-profile.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/config/paths.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/file-selection.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/file-selection.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/context/__tests__/repo-ignore-filter.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/analyze/context/repo-ignore-filter.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S006/t12-evidence.md` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `src/indexer/__tests__/file-filter-git-conformance.test.ts` — **insrc-build** (2026-11-01T11:46:05.908Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/consumer-inventory.json` — **insrc-build** (2026-11-01T11:46:05.908Z)
