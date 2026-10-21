<!-- insrc:artifact BUILD-06f196a7ff528143-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-21T05:47:38.616Z  ·  **Updated:** 2026-10-21T06:31:25.759Z

**Commit:** 73362b2b

## Summary

The review subject derives the Story's set once from its range base (no base or a git failure declines with no-build-record; the working-tree attempts are gone) and carries excludedFromScope, which the runner stamps on the record and both diff-only callers thread through. Test fixtures that had no range base (grounding-ipc.test.ts, subject.test.ts) now supply one, and diff-attribution.test.ts checks the two callers record excludedFromScope.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/mocks/ontology-editor.html` — **insrc-build** (2026-10-21T06:31:25.759Z)
- `docs/mocks/ontology-source/ontology.template.html` — **insrc-build** (2026-10-21T06:31:25.759Z)
- `docs/mocks/ontology-source/render.mjs` — **insrc-build** (2026-10-21T06:31:25.759Z)
- `docs/mocks/ontology-viewer.html` — **insrc-build** (2026-10-21T06:31:25.759Z)
- `docs/ontology-builder-prd.html` — **insrc-build** (2026-10-21T06:31:25.759Z)
- `docs/ontology-builder-prd.md` — **insrc-build** (2026-10-21T06:31:25.759Z)
