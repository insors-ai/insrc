<!-- insrc:artifact BUILD-06f196a7ff528143-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-21T05:47:38.616Z  ·  **Updated:** 2026-10-21T05:56:21.050Z

**Commit:** 751f13b9

## Summary

storyChangeSet leaves out commits carrying only other Stories' trailers (ordinary, merge-edit, octopus), throws on a failed trailer read under strict, and reports perUnit; the legacy-range test expectation changed to ['src/a.ts'] and a subject test's other-Stories-only range is now empty.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/mocks/ontology-editor.html` — **insrc-build** (2026-10-21T05:56:21.050Z)
- `docs/mocks/ontology-source/ontology.template.html` — **insrc-build** (2026-10-21T05:56:21.050Z)
- `docs/mocks/ontology-source/render.mjs` — **insrc-build** (2026-10-21T05:56:21.050Z)
- `docs/mocks/ontology-viewer.html` — **insrc-build** (2026-10-21T05:56:21.050Z)
- `docs/ontology-builder-prd.html` — **insrc-build** (2026-10-21T05:56:21.050Z)
- `docs/ontology-builder-prd.md` — **insrc-build** (2026-10-21T05:56:21.050Z)
