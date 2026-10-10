<!-- insrc:artifact BUILD-2764c29d7ccb66a5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T15:41:06.406Z  ·  **Updated:** 2026-10-10T15:41:06.406Z

**Commit:** 0d26867b

## Summary

Added listEntityFilesForRepo (src/db/entities.ts) and deleteUnresolvedForRepoFile (src/db/relations.ts), both limited to one repository, with three tests over a temporary store. Five mutations of the two functions were each caught by a test.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-2764c29d7ccb66a5-S001.json` — **insrc-build** (2026-10-10T15:41:06.406Z)
- `src/db/__tests__/entity-files-for-repo.test.ts` — **insrc-build** (2026-10-10T15:41:06.406Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-10T15:41:06.406Z)
- `src/db/relations.ts` — **insrc-build** (2026-10-10T15:41:06.406Z)
