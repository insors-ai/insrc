<!-- insrc:artifact BUILD-7d42920dbef28b51-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T18:07:28.997Z  ·  **Updated:** 2026-10-11T18:12:15.731Z

**Commit:** 6c068e9f

## Summary

Relabelled PLAN/LLD/EXT/DEF/HLD members now carry exact label-line edits against their post-move md, built with the renderers' own helpers (epicLabelLine, extendTitleLine/extendBannerLine, epicShortName/hldShortName); HLD and epic-LLD companion pages are listed as notes, never edited.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-7d42920dbef28b51.json` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `.insrc/artifacts/LLD-7d42920dbef28b51-S001.json` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `.insrc/artifacts/PLAN-7d42920dbef28b51-S001.json` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `docs/standalone/docs-migrator-leaves-stale-labels-json-E202610117d42920d/S001/LLD.md` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `docs/standalone/docs-migrator-leaves-stale-labels-json-E202610117d42920d/S001/PLAN.md` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/artifacts/define.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/artifacts/extend.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/artifacts/hld.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/artifacts/lld.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/artifacts/plan.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-11T18:12:15.731Z)
