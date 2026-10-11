<!-- insrc:artifact BUILD-7d42920dbef28b51-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T18:07:28.997Z  ·  **Updated:** 2026-10-11T18:17:56.606Z

**Commit:** 62b68e5f

## Summary

The insrc-migrate-docs dry run now counts metadata rewrites and prints one 'meta' line per rewrite with its changed fields, an indented line per md edit, and notes for unmatched label lines and companion pages; the Applied line reports realigned artifacts.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-7d42920dbef28b51.json` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `.insrc/artifacts/LLD-7d42920dbef28b51-S001.json` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `.insrc/artifacts/PLAN-7d42920dbef28b51-S001.json` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `docs/standalone/docs-migrator-leaves-stale-labels-json-E202610117d42920d/S001/LLD.md` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `docs/standalone/docs-migrator-leaves-stale-labels-json-E202610117d42920d/S001/PLAN.md` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/bin/insrc-migrate-docs.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/__tests__/migrate-docs-tree.test.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/artifacts/define.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/artifacts/extend.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/artifacts/hld.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/artifacts/lld.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/artifacts/plan.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-11T18:17:56.606Z)
