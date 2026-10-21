<!-- insrc:artifact BUILD-06f196a7ff528143-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-21T05:47:38.616Z  ·  **Updated:** 2026-10-21T06:18:08.129Z

**Commit:** 79e66e0c

## Summary

changedFiles reads the Story's commits first and adds only uncommitted edits of the Story's own files, reporting the rest as excludedUncommitted; a storyKey without a base is refused and collectBuildChangeLog forwards the storyKey. The two edits outside changed-files.ts are tests this change broke, fixed as the implement prompt requires ("finish ... the callers and tests it breaks"); no production code outside the task changed. build-step.test.ts: three validate-writer tests left the Story's work uncommitted, which the new rule no longer counts, so they now commit it before validate (a beforeValidate hook on the shared helper), the dirty-tree test asserts the new rule, and one md assertion no longer pins line order. subject-attribution.test.ts: the dirty-tree half now expects the Story's trailered files instead of the uncommitted README.md; the working-tree step-down half is left for t5.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/mocks/ontology-editor.html` — **insrc-build** (2026-10-21T06:18:08.129Z)
- `docs/mocks/ontology-source/ontology.template.html` — **insrc-build** (2026-10-21T06:18:08.129Z)
- `docs/mocks/ontology-source/render.mjs` — **insrc-build** (2026-10-21T06:18:08.129Z)
- `docs/mocks/ontology-viewer.html` — **insrc-build** (2026-10-21T06:18:08.129Z)
- `docs/ontology-builder-prd.html` — **insrc-build** (2026-10-21T06:18:08.129Z)
- `docs/ontology-builder-prd.md` — **insrc-build** (2026-10-21T06:18:08.129Z)
