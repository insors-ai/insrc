<!-- insrc:artifact BUILD-7d42920dbef28b51-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T18:07:28.997Z  ·  **Updated:** 2026-10-11T18:19:06.269Z

**Commit:** 141cfc52

## Summary

Dry run over this repo: 0 moves, 448 metadata rewrites (120 BUILD, 189 CR, 61 PLAN, 36 LLD, 23 TESTS, 16 SPEC, 3 EXT), 15 md label-line edits, 0 unmatched lines, 0 unmappable. Before, 448 of 948 artifacts' stored meta derived a path where no md exists; applying in a scratch clone (/tmp/mig-scratch) brought that to 0 of 948 in 136 per-work-item realign commits, and a re-plan found nothing left. Nothing applied to this repo; awaiting the user's decision.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-7d42920dbef28b51.json` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `.insrc/artifacts/LLD-7d42920dbef28b51-S001.json` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `.insrc/artifacts/PLAN-7d42920dbef28b51-S001.json` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `docs/standalone/docs-migrator-leaves-stale-labels-json-E202610117d42920d/S001/LLD.md` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `docs/standalone/docs-migrator-leaves-stale-labels-json-E202610117d42920d/S001/PLAN.md` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/bin/insrc-migrate-docs.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/__tests__/migrate-docs-tree.test.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/artifacts/define.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/artifacts/extend.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/artifacts/hld.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/artifacts/lld.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/artifacts/plan.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-11T18:19:06.269Z)
