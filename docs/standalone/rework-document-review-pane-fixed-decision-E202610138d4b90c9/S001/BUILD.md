<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:19:23.527Z

**Commit:** bb5afca9

## Summary

The HLD, epic LLD, standalone LLD and PLAN finalizers read the feedback list of the JSON at the artifact's own path (priorFeedback, read-only) and put it into the new body, which is then rendered and serialized. The checks on the authored text (scope boundary, citations) run on the document without the carried comments, so a reviewer's wording cannot fail an authoring; the returned markdown and JSON are rendered from the body with the comments. finalizeDefine is unchanged. Suite note: with each test file in its own process the workflow and MCP suites pass (1864 tests, 0 fail, 3 skipped); run in one process (--test-isolation=none) 15 brainstorm/MCP tests fail, and they fail the same way on the commit before this task.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T12:19:23.527Z)
