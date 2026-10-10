<!-- insrc:artifact BUILD-2764c29d7ccb66a5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T15:41:06.406Z  ·  **Updated:** 2026-10-10T16:38:39.311Z

**Commit:** ad23a568

## Summary

The guide (docs/daemon.md, "The index is cleaned of files that are gone or ignored") describes the clean-up, when it runs, what it removes and keeps, and its limit. After the push the installed daemon was updated from da1fae76 to 48c98646; its first start removed 33 absent and 2026 ignored files from this repository's index (4680 files to 2647, JavaScript 503 to 12) and cleaned three other registered repositories. Two code reviews by the daemon led to fixes after task 4: the pass decides for the whole repository before writing and removes nothing when none of the stored files is on disk, and a failure part-way still drops the cached results and runs the resolver.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-2764c29d7ccb66a5-S001.json` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `.insrc/artifacts/PLAN-2764c29d7ccb66a5-S001.json` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `docs/daemon.md` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `docs/standalone/index-never-reconciled-against-files-disk-E202610102764c29d/S001/CR.md` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `docs/standalone/index-never-reconciled-against-files-disk-E202610102764c29d/S001/smoke-installed-daemon.md` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/daemon/__tests__/queue-depth-for-repo.test.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/db/__tests__/entity-files-for-repo.test.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/db/relations.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/indexer/__tests__/reconcile.test.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-10T16:38:39.311Z)
