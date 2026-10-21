<!-- insrc:artifact BUILD-06f196a7ff528143-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-21T05:47:38.616Z  ·  **Updated:** 2026-10-21T06:26:10.632Z

**Commit:** fabb2d0e

## Summary

The diff-only grounding reads the Story's range first and adds only uncommitted hunks of the Story's own files, reporting other uncommitted files as excludedFromScope; no base or a git failure raises DiffUnavailableError (no working-tree-first, last-commit or step-down path). splitDiffByFile keeps every section, workingTreeDiff sums staged and unstaged stats, storyRangeDiff honours perUnit. grounding-eligibility.test.ts was updated because it drove the removed seams with no base.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/mocks/ontology-editor.html` — **insrc-build** (2026-10-21T06:26:10.632Z)
- `docs/mocks/ontology-source/ontology.template.html` — **insrc-build** (2026-10-21T06:26:10.632Z)
- `docs/mocks/ontology-source/render.mjs` — **insrc-build** (2026-10-21T06:26:10.632Z)
- `docs/mocks/ontology-viewer.html` — **insrc-build** (2026-10-21T06:26:10.632Z)
- `docs/ontology-builder-prd.html` — **insrc-build** (2026-10-21T06:26:10.632Z)
- `docs/ontology-builder-prd.md` — **insrc-build** (2026-10-21T06:26:10.632Z)
