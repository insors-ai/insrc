<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:12:45.679Z

**Commit:** cd6cede6

## Summary

A feedback entry can now carry an inline anchor, the decision it was saved with and a batch id. Both writers store them through one helper, both schemas and the request coercion accept them, and the Feedback section shows them; a batch append writes all entries in one write or none, and priorFeedback reads a stored list.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:12:45.679Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:12:45.679Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:12:45.679Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:12:45.679Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:12:45.679Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:12:45.679Z)
