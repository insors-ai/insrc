<!-- insrc:artifact BUILD-bd1c6c9005ff6390-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T09:39:24.421Z  ·  **Updated:** 2026-10-17T10:22:41.922Z

**Commit:** ee65595e

## Summary

An integration test indexes a two-file TypeScript fixture through the indexer's own per-file steps (real parser, resolveRelations, store writes; no embedding) and the real cross-file resolver over a temporary graph store, then runs assembleCodeReviewGrounding with realGroundingDeps: the test file's entity is the imported function's only caller and its testsReaching entry. Undoing the t1 program-statement scan, making isTestFile return false, or skipping the cross-file resolver each fails it.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/DEF-670419c4ad8bea8e.json` — **insrc-build** (2026-10-17T10:22:41.922Z)
- `.insrc/artifacts/PLAN-bd1c6c9005ff6390-S001.json` — **insrc-build** (2026-10-17T10:22:41.922Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/DEF.md` — **insrc-build** (2026-10-17T10:22:41.922Z)
- `src/indexer/__tests__/test-callers-reach-grounding.test.ts` — **insrc-build** (2026-10-17T10:22:41.922Z)
- `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts` — **insrc-build** (2026-10-17T10:22:41.922Z)
- `src/indexer/parser/typescript.ts` — **insrc-build** (2026-10-17T10:22:41.922Z)
- `src/workflow/code-review/__tests__/grounding.test.ts` — **insrc-build** (2026-10-17T10:22:41.922Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-17T10:22:41.922Z)
