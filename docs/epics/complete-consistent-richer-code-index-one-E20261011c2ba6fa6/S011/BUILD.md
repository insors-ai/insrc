<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T11:48:00.943Z

**Commit:** 92c6ea9c

## Summary

src/mcp/workflow-step, build-step and triage-step move to src/daemon/steps with their tests (git mv; relative imports rewritten). The moved handlers, plus the analyze step and one-shot body from t3, resolve their repository through the daemon-side copy src/daemon/steps/resolve-repo.ts; src/mcp/resolve-repo.ts stays for docgen and approve. src/daemon/workflow-rpc.ts imports the workflow step from src/daemon/steps and nothing from src/mcp (new test). The build renderer's template root is corrected for its new depth. Full sweep under Node 22, recorded in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md: nothing newly failing; one source-scan test that read the old handler path was repointed. The mapping runs one case from every moved test file and every repointed test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/mcp/review-step/handler.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/mcp/review-step/state-store.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T11:48:00.943Z)
