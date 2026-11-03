<!-- insrc:artifact BUILD-0f3376a086e3601c-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T10:37:50.308Z  ·  **Updated:** 2026-11-03T13:20:46.653Z

**Commit:** 5aa740c4b

## Summary

Pushed through e68162aa7; the installed daemon updated to e68162aa and restarted (the restart waited on a macOS Keychain prompt). Smoke on the installed daemon: qualified, quoted and folded SQL references resolve on the first index, and saving a same-named definition makes the settle re-check the inferred edges (targets=2, returned=2), re-resolving one and leaving the other ambiguous (smoke-t5.md). The full sweep ran per directory at e68162aa7: 7346 tests, 35 failures, none in indexer (451/451), db (658/658) or any SQL suite; each failure is classified in full-sweep-t5.md (pre-existing in earlier sweeps, other sessions' connection-management and steering work, the test daemon's Keychain hang, and a threads-boot load flake that also flakes at the pre-change commit).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/parser/__tests__/sql-names.test.ts` — **insrc-build** (2026-11-03T12:49:42.542Z)
- `src/indexer/parser/__tests__/sql.test.ts` — **insrc-build** (2026-11-03T12:49:42.542Z)
- `src/indexer/parser/sql-names.ts` — **insrc-build** (2026-11-03T12:49:42.542Z)
- `src/indexer/parser/sql.ts` — **insrc-build** (2026-11-03T12:49:42.542Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-03T12:49:42.542Z)
- `docs/standalone/sql-references-miss-across-2-3-E202611020f3376a0/S001/full-sweep-t5.md` — **insrc-build** (2026-11-03T12:49:42.542Z)
- `docs/standalone/sql-references-miss-across-2-3-E202611020f3376a0/S001/smoke-t5.md` — **insrc-build** (2026-11-03T12:49:42.542Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-03T13:20:46.653Z)
- `src/indexer/__tests__/sql-name-resolution.test.ts` — **insrc-build** (2026-11-03T13:20:46.653Z)
