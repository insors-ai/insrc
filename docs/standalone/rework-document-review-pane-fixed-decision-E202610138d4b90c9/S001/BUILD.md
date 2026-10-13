<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:28:11.942Z

**Commit:** 4e4fca41

## Summary

New src/workflow/review-decision.ts with handleReviewDecision(params, repoEnv, deps?) and the 'workflow.reviewDecision' handler in src/daemon/index.ts. It resolves the artifact from its .md with the same docs/ guard as workflow.artifactContent, validates the whole request first (decision, comments list, 200 comments, 10,000 characters, file is the .md or a listed companion, anchor shape, feedback needs a comment, approve and reject need a pending artifact), resolves the author with resolveReviewer, records the decision (approveWorkflowTarget for the one artifact, rejectArtifactByJsonPath with the first comment that has no anchor or the default reason, nothing for feedback) and then appends the comments in one appendFeedbackBatch call with kind comment, one batch id and the decision that took effect. Two things beyond the design's wording, both additive: the result carries an optional followOn (what the approval of a bugfix issue set off, as workflow.approve reports it), run after the comments are saved and never failing the decision; and docPathOf is exported from artifact-content.ts so the two modules compute the document path the same way. A malformed anchor is refused as an invalid request. Suites (workflow, MCP, daemon; one process per file): 1 failure, src/daemon/db/__tests__/sqlite-driver.test.ts "temporalTrend recovers slope/intercept/R²", which fails the same way without this task's changes. The runner's total count varied between runs of the same code (2958 to 3004 with --test-force-exit); the failure count did not.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T12:28:11.942Z)
