<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T11:43:13.587Z

**Commit:** 62ccb310

## Summary

src/mcp/analyze-step and bundle-md.ts move to src/daemon/steps with their nine test files; the one-shot analyze body with oneShotRunParams becomes src/daemon/steps/analyze-oneshot.ts, called by the MCP server, which still wraps it in its sampler or client context, so behaviour is unchanged. The full sweep under Node 22 (6666 tests, nothing newly failing; the 9 failures predate the Story) is recorded in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md, committed in 62ccb310. The mapping below runs every moved test file and every repointed importer except completeness.live.test.ts, which is a live test that skips without INSRC_LIVE_TESTS; it ran (skipped) in the sweep and compiles.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/mcp/workflow-step/handler.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/mcp/workflow-step/state-store.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/mcp/workflow-step/state.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T11:43:13.587Z)
