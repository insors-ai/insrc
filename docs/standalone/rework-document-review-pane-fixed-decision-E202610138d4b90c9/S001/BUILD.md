<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:22:06.311Z

**Commit:** b4760e14

## Summary

resolveReviewer(repoPath, deps?) is exported from the companion header module (git user.name, else OS login, else unknown, with its source) and resolveCompanionHeader's user now comes from it. ArtifactReviewView gains docPath (repo-relative .md path), contentVersion (first 16 hex of the SHA-256 of the markdown; contentVersionOf is exported), feedback (absent when none), reviewer and state; handleArtifactContent takes an optional third argument with the reviewer lookups so tests can pin them. Suites: workflow, MCP and daemon tests with one process per file: 3004 tests, 2984 pass, 19 skipped, 1 fail. The one failure is src/daemon/db/__tests__/sqlite-driver.test.ts "temporalTrend recovers slope/intercept/R²", which fails the same way on the commit before this task and does not touch this code. Daemon and plugin typechecks are clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T12:22:06.311Z)
